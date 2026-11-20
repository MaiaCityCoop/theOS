//! Who may write what in theDB (intent 0054, step 4). Keys, signatures, grants and the Keychain are theID's, the one
//! source for the whole stack; this is only what theDB signs and whom each branch allows.
//!
//! - **One master.** Its public key is the store's (`meta.master`). It grants, and signs nothing else once the host has
//!   its key.
//! - **The host.** theOS on this Mac has a key of its own (`meta.host`), granted `Cap::Main` by the master: it signs
//!   the routine writes to main, and the merges a person accepts in theOS's Proposals view.
//! - **Agents on their own lines.** An agent writes the branch `line-<agent>` only, with a grant of the master's
//!   (`Cap::Line`), kept as a blob; each commit on a line is signed by its agent and names the grant that allows it.
//! - **Merges by the master.** A proposal is brought into main by the master alone (`proposals.rs`).
//! - **Verified.** `verify` checks every signature kept and that every head is signed by whom its branch allows.
//!
//! Once a store has a master, a commit that cannot be signed by whom its branch needs is refused. A store without a
//! master (a test's, one just made) is written unsigned, as before.

use crate::{Hash, Result, TheDB, err, sql};
pub use theid::{Cap, Grant, PublicKey, SecretKey, Who};

/// The branch an agent works on.
pub fn line(agent: &str) -> String {
    format!("line-{agent}")
}

/// What a commit's signature covers: the doc, the branch it is the head of, the version (its hash and its Loro
/// frontiers), when, and the grant it was made under.
fn commit_fields<'a>(doc: &'a str, branch: &'a str, version: &'a Hash, frontiers: &'a [u8], at: &'a [u8; 8], grant: &'a Option<Hash>) -> [&'a [u8]; 6] {
    [doc.as_bytes(), branch.as_bytes(), version.as_bytes(), frontiers, at, grant.as_ref().map(|g| g.as_bytes().as_slice()).unwrap_or(&[])]
}

const COMMIT: &str = "theDB commit";

/// What `verify` found.
#[derive(Debug, Default)]
pub struct Verified {
    /// Heads signed by whom their branch allows.
    pub good: usize,
    /// Every problem, in words.
    pub problems: Vec<String>,
}

impl TheDB {
    /// The store's master, if it has one.
    pub fn master(&self) -> Result<Option<PublicKey>> {
        sql::get_meta(&self.sql(), "master")?.map(|m| m.parse().map_err(err)).transpose()
    }

    /// Makes `key` this store's master and signs every head as it is now ("I take these as they are"), so `verify`
    /// is clean from the first day. A store has one master; it is not changed here.
    pub fn set_master(&self, key: SecretKey) -> Result<()> {
        if let Some(m) = self.master()? {
            return Err(format!("this store's master is {m} already"));
        }
        sql::set_meta(&self.sql(), "master", &key.public().to_string())?;
        self.sign_with(key);
        self.attest()
    }

    /// The host's public key and the master's grant to it, if the store has a host.
    pub fn host(&self) -> Result<Option<(PublicKey, Hash)>> {
        let sql = self.sql();
        match (sql::get_meta(&sql, "host")?, sql::get_meta(&sql, "host_grant")?) {
            (Some(h), Some(g)) => Ok(Some((h.parse().map_err(err)?, g.parse().map_err(err)?))),
            _ => Ok(None),
        }
    }

    /// Gives the store a host, if it has none and this process holds the master's key: a new key in this Mac's
    /// Keychain, granted `Cap::Main` by the master for a year. From then on this process signs with it.
    pub fn ensure_host(&self) -> Result<()> {
        let Some(master) = self.master()? else { return Ok(()) };
        if self.host()?.is_some() {
            return Ok(());
        }
        let Some(mk) = self.master_key() else { return Ok(()) };
        let host = SecretKey::generate();
        let grant = theid::grant(&mk, host.public(), Cap::Main, 365);
        let g = self.put(grant.encode())?;
        theid::keychain_set(&master, &Who::Host, &host)?;
        {
            let sql = self.sql();
            sql::set_meta(&sql, "host", &host.public().to_string())?;
            sql::set_meta(&sql, "host_grant", &g.to_string())?;
        }
        self.sign_with(host);
        Ok(())
    }

    /// Names `host` as this store's host, by the master's grant `grant` (a blob): what `ensure_host` does, without the
    /// Keychain, for tests.
    pub fn set_host_for_test(&self, host: PublicKey, grant: Hash) -> Result<()> {
        let sql = self.sql();
        sql::set_meta(&sql, "host", &host.to_string())?;
        sql::set_meta(&sql, "host_grant", &grant.to_string())
    }

    /// Whether this process signs as the master or the host (a store without a master: anyone). Closing a proposal
    /// and making a branch need it; an agent, with only its line's key, never has it.
    pub(crate) fn is_master_or_host(&self) -> Result<()> {
        let Some(master) = self.master()? else { return Ok(()) };
        let me = self.signer();
        if me == Some(master) || self.host()?.is_some_and(|(h, _)| me == Some(h)) {
            return Ok(());
        }
        Err("a proposal is accepted in theOS, by a person: not by an agent".into())
    }

    /// The master's own key, if this process holds it (given, or in this Mac's Keychain).
    fn master_key(&self) -> Option<SecretKey> {
        let master = self.master().ok()??;
        self.key().filter(|k| k.public() == master).or_else(|| theid::keychain_get(&master, &Who::Master))
    }

    /// Makes a master for this store: a new key, kept in this Mac's Keychain. Returns it, to be shown once and kept by
    /// its owner in a password manager.
    pub fn make_master(&self) -> Result<SecretKey> {
        let key = SecretKey::generate();
        theid::keychain_set(&key.public(), &Who::Master, &key)?;
        self.set_master(key.clone())?;
        self.ensure_host()?;
        Ok(key)
    }

    /// Puts the master's key (from its owner's backup) into this Mac's Keychain, after checking it is this store's.
    pub fn restore_master(&self, key: SecretKey) -> Result<()> {
        let master = self.master()?.ok_or("this store has no master")?;
        if key.public() != master {
            return Err(format!("that key is {}, this store's master is {master}", key.public()));
        }
        theid::keychain_set(&master, &Who::Master, &key)?;
        self.sign_with(key);
        Ok(())
    }

    /// Signs this process's commits with `key` (instead of the key from the Keychain).
    pub fn sign_with(&self, key: SecretKey) {
        *self.signer.lock().unwrap_or_else(|e| e.into_inner()) = Some(key);
    }

    /// The key this process signs with: one given, or else the one the Keychain holds for this store's master
    /// (`theid::key_for`), read once.
    pub(crate) fn key(&self) -> Option<SecretKey> {
        let mut k = self.signer.lock().unwrap_or_else(|e| e.into_inner());
        if k.is_none()
            && let Ok(Some(master)) = self.master()
        {
            *k = theid::key_for(&master);
        }
        k.clone()
    }

    /// The public half of the key this process signs with.
    pub fn signer(&self) -> Option<PublicKey> {
        self.key().map(|k| k.public())
    }

    /// The master grants the agent `name` (its public key) its line for `days`: the grant kept as a blob, the line
    /// made. Signed by this process's key, which must be the master's. Returns the grant's hash.
    pub fn grant(&self, name: &str, agent: PublicKey, days: u64) -> Result<Hash> {
        let master = self.master()?.ok_or("this store has no master")?;
        let key = self.master_key().filter(|k| k.public() == master).ok_or("only the master grants a line")?;
        let line = line(name);
        if !crate::is_branch(&line) {
            return Err(format!("not an agent's name (lowercase letters, digits, dashes): {name:?}"));
        }
        let grant = theid::grant(&key, agent, Cap::Line(line.clone()), days);
        let hash = self.put(grant.encode())?;
        sql::add_grant(&self.sql(), hash, &agent.to_string(), &line, theid::until(&grant).min(i64::MAX as u64) as i64)?;
        if !self.branches()?.contains(&line) {
            self.make_branch(&line, &format!("the line of the agent {name}"))?;
        }
        Ok(hash)
    }

    /// Makes an agent: a new key in this Mac's Keychain, and the master's grant of its line. Returns its public key.
    pub fn make_agent(&self, name: &str, days: u64) -> Result<PublicKey> {
        let master = self.master()?.ok_or("this store has no master")?;
        let key = SecretKey::generate();
        self.grant(name, key.public(), days)?;
        theid::keychain_set(&master, &Who::Agent(name.to_string()), &key)?;
        Ok(key.public())
    }

    /// The grant kept as blob `hash`.
    pub fn grant_at(&self, hash: Hash) -> Result<Grant> {
        theid::read_grant(&self.get(hash)?.ok_or_else(|| format!("no grant {hash}"))?)
    }

    /// Who signs a commit on `branch` from this process, and the grant that allows it; `None` when the store has no
    /// master (nothing is signed). Refuses what the branch does not allow this process.
    pub(crate) fn may_write(&self, branch: &str) -> Result<Option<(SecretKey, Option<Hash>)>> {
        let Some(master) = self.master()? else { return Ok(None) };
        let Some(key) = self.key() else {
            return Err(format!("this store is signed, and this process has no key to write {branch} with (the master's is not in this Mac's Keychain: `theDB master restore`; an agent sets THEOS_AGENT)"));
        };
        if key.public() == master {
            return Ok(Some((key, None)));
        }
        if let Some((host, g)) = self.host()?
            && key.public() == host
        {
            if theid::allows(&self.grant_at(g)?, &master, &host, &Cap::Main, crate::now()) {
                return Ok(Some((key, Some(g))));
            }
            return Err("the host's grant has ended: the master grants it again".into());
        }
        if branch == crate::MAIN {
            return Err("main is written by the master only: an agent works on its line and proposes".into());
        }
        let cap = Cap::Line(branch.to_string());
        for hash in sql::grants_for(&self.sql(), &key.public().to_string(), branch)? {
            if theid::allows(&self.grant_at(hash)?, &master, &key.public(), &cap, crate::now()) {
                return Ok(Some((key, Some(hash))));
            }
        }
        Err(format!("{} has no grant of the master's for {branch} that holds now", key.public().fmt_short()))
    }

    /// Signs the version `version` of `id` as `branch`'s head (within the commit's transaction).
    pub(crate) fn sign_commit(conn: &rusqlite::Connection, id: &str, branch: &str, version: Hash, at: u64, key: &SecretKey, grant: Option<Hash>) -> Result<()> {
        let frontiers = sql::frontiers(conn, version)?.map(|f| f.encode()).unwrap_or_default();
        let sig = theid::sign(key, COMMIT, &commit_fields(id, branch, &version, &frontiers, &at.to_be_bytes(), &grant));
        sql::add_signed(conn, version, branch, id, &key.public().to_string(), grant, at, &sig.to_bytes())
    }

    /// The master signs every head of every branch as it is now.
    fn attest(&self) -> Result<()> {
        let key = self.key().ok_or("no key")?;
        let mut sql = self.sql();
        let tx = sql.transaction().map_err(err)?;
        for (branch, id, version) in sql::all_heads(&tx)? {
            Self::sign_commit(&tx, &id, &branch, version, crate::now(), &key, None)?;
        }
        tx.commit().map_err(err)
    }

    /// Checks every signature kept, and that every head is signed by whom its branch allows: any branch by the master,
    /// or by the host with the master's grant of main; a line by its agent, with the master's grant of it; each grant
    /// as it held when the signature was made.
    pub fn verify(&self) -> Result<Verified> {
        let master = self.master()?.ok_or("this store has no master: nothing is signed")?;
        let mut v = Verified::default();
        let sql = self.sql();
        let mut good = std::collections::BTreeSet::new();
        for s in sql::all_signed(&sql)? {
            let what = format!("{} on {} ({})", s.doc, s.branch, s.version.fmt_short());
            let (signer, sig) = match (s.signer.parse::<PublicKey>(), theid::signature(&s.sig)) {
                (Ok(k), Ok(sig)) => (k, sig),
                _ => {
                    v.problems.push(format!("{what}: not a key and a signature"));
                    continue;
                }
            };
            let frontiers = sql::frontiers(&sql, s.version)?.map(|f| f.encode()).unwrap_or_default();
            if !theid::verify(&signer, COMMIT, &commit_fields(&s.doc, &s.branch, &s.version, &frontiers, &s.at.to_be_bytes(), &s.grant), &sig) {
                v.problems.push(format!("{what}: the signature does not hold"));
                continue;
            }
            let allowed = signer == master
                || s.grant.is_some_and(|g| {
                    self.grant_at(g).is_ok_and(|grant| [Cap::Main, Cap::Line(s.branch.clone())].iter().any(|cap| theid::allows(&grant, &master, &signer, cap, s.at)))
                });
            if !allowed {
                v.problems.push(format!("{what}: signed by {}, whom {} does not allow", signer.fmt_short(), s.branch));
                continue;
            }
            good.insert((s.branch, s.doc, s.version));
        }
        for (branch, id, version) in sql::all_heads(&sql)? {
            if good.contains(&(branch.clone(), id.clone(), version)) {
                v.good += 1;
            } else {
                v.problems.push(format!("the head of {id} on {branch} ({}) is not signed by whom {branch} allows", version.fmt_short()));
            }
        }
        Ok(v)
    }
}
