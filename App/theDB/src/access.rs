//! Who may write what in theDB (intents 0054, 0059). Keys, signatures, grants and secrets are theID's, the one
//! source for the whole stack; this is only what theDB signs and whom each branch allows.
//!
//! - **One owner.** Its public key is the store's (`meta.owner`; `meta.master` in stores made before 0059). It owns
//!   main: it grants, and it signs what only it decides, each time unlocked by the person (Touch ID on a Mac).
//! - **The host**, a device: theOS on this Mac has a key of its own (`meta.host`), granted `Cap::Main` by the owner. It
//!   signs the routine writes to main and makes the merges its owner signs.
//! - **Agents on their own lines.** An agent writes the branch `line-<agent>` only, with the owner's grant
//!   (`Cap::Line`), kept as a blob; each commit on a line is signed by its agent and names the grant that allows it.
//! - **Every merge is the owner's.** Accepting an intent into main, and so the build the kernel runs, is signed by the
//!   owner (`intents.rs`), its key unlocked by the person for that one signature. The host's key signs routine writes
//!   only: it is never enough to merge. Once the owner's key is locked on a device (`theDB owner
//!   protect`, or a store made since), the store asks for it (`meta.owner_signs`); before, as it was.
//! - **Verified.** `verify` checks every signature kept, every head signed by whom its branch allows, and every
//!   owner's signature an intent carries.
//!
//! Once a store has an owner, a commit that cannot be signed by whom its branch needs is refused. A store without an
//! owner (a test's, one just made) is written unsigned, as before.

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
/// The owner's word that the kernel may run a build (`theDB owner pin`).
pub(crate) const PIN: &str = "theOS engine pin";

/// The owner's signature of something only it decides: its key, the signature (both hex), when.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Signed {
    pub key: String,
    pub sig: String,
    pub at: u64,
}

/// A build the owner let the kernel run directly (`theDB owner pin`), kept in `meta.pins`.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct Pinned {
    engine: String,
    build: String,
    signed: Signed,
}

/// What `verify` found.
#[derive(Debug, Default)]
pub struct Verified {
    /// Heads signed by whom their branch allows.
    pub good: usize,
    /// Every problem, in words.
    pub problems: Vec<String>,
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    (s.len() % 2 == 0).then(|| (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect::<Option<Vec<u8>>>())?
}

impl TheDB {
    /// The store's owner, if it has one.
    pub fn owner(&self) -> Result<Option<PublicKey>> {
        let sql = self.sql();
        sql::get_meta(&sql, "owner")?.or(sql::get_meta(&sql, "master")?).map(|m| m.parse().map_err(err)).transpose()
    }

    /// Makes `key` this store's owner and signs every head as it is now ("I take these as they are"), so `verify` is
    /// clean from the first day. A store has one owner; it is not changed here.
    pub fn set_owner(&self, key: SecretKey) -> Result<()> {
        if let Some(o) = self.owner()? {
            return Err(format!("this store's owner is {o} already"));
        }
        sql::set_meta(&self.sql(), "owner", &key.public().to_string())?;
        self.sign_with(key);
        self.attest()
    }

    /// The host's public key and the owner's grant to it, if the store has a host.
    pub fn host(&self) -> Result<Option<(PublicKey, Hash)>> {
        let sql = self.sql();
        match (sql::get_meta(&sql, "host")?, sql::get_meta(&sql, "host_grant")?) {
            (Some(h), Some(g)) => Ok(Some((h.parse().map_err(err)?, g.parse().map_err(err)?))),
            _ => Ok(None),
        }
    }

    /// Gives the store a host, if it has none: a new key kept on this device, granted `Cap::Main` by the owner for a
    /// year (the person unlocks the owner's key for it). From then on this process signs with it.
    pub fn ensure_host(&self) -> Result<()> {
        let Some(owner) = self.owner()? else { return Ok(()) };
        if self.host()?.is_some() {
            return Ok(());
        }
        let ok = self.owner_key("give theOS on this device a key of its own")?;
        let host = SecretKey::generate();
        let grant = theid::grant(&ok, host.public(), Cap::Main, 365);
        let g = self.put(grant.encode())?;
        theid::keychain_set(&owner, &Who::Host, &host)?;
        {
            let sql = self.sql();
            sql::set_meta(&sql, "host", &host.public().to_string())?;
            sql::set_meta(&sql, "host_grant", &g.to_string())?;
        }
        self.sign_with(host);
        Ok(())
    }

    /// Names `host` as this store's host, by the owner's grant `grant` (a blob): what `ensure_host` does, without the
    /// store of secrets, for tests.
    pub fn set_host_for_test(&self, host: PublicKey, grant: Hash) -> Result<()> {
        let sql = self.sql();
        sql::set_meta(&sql, "host", &host.to_string())?;
        sql::set_meta(&sql, "host_grant", &grant.to_string())
    }

    /// Whether this process signs as the owner or the host (a store without an owner: anyone). Closing an intent and
    /// making a branch need it; an agent, with only its line's key, never has it.
    pub(crate) fn is_owner_or_host(&self) -> Result<()> {
        let Some(owner) = self.owner()? else { return Ok(()) };
        let me = self.signer();
        if me == Some(owner) || self.host()?.is_some_and(|(h, _)| me == Some(h)) {
            return Ok(());
        }
        Err("an intent is accepted in theOS, by its owner: not by an agent".into())
    }

    /// The owner's key, unlocked by the person for `reason` (each time: the system asks them), or the one given to
    /// this process for tests (`owner_with`).
    pub(crate) fn owner_key(&self, reason: &str) -> Result<SecretKey> {
        let owner = self.owner()?.ok_or("this store has no owner")?;
        if let Some(k) = self.owner_given.lock().unwrap_or_else(|e| e.into_inner()).clone() {
            return Ok(k);
        }
        theid::owner_key(&owner, reason)
    }

    /// Uses `key` as the owner's, unlocked, in this process: for tests only.
    pub fn owner_with(&self, key: SecretKey) {
        *self.owner_given.lock().unwrap_or_else(|e| e.into_inner()) = Some(key);
    }

    /// Whether every merge needs the owner's signature: once its key is locked on a device.
    pub fn owner_signs(&self) -> Result<bool> {
        Ok(self.owner()?.is_some() && sql::get_meta(&self.sql(), "owner_signs")?.is_some())
    }

    /// From now on, every merge needs the owner's signature.
    pub fn require_owner(&self) -> Result<()> {
        sql::set_meta(&self.sql(), "owner_signs", "1")
    }

    /// Makes an owner for this store: a new key, locked on this device by the person's presence (the system asks once,
    /// to read it back), the store's heads signed, a host made, and every merge from now on the owner's. Returns the
    /// key, to be shown once and kept in a password manager.
    pub fn make_owner(&self) -> Result<SecretKey> {
        let key = SecretKey::generate();
        theid::protect_owner(&key)?;
        self.set_owner(key.clone())?;
        self.owner_with(key.clone());
        let host = self.ensure_host();
        *self.owner_given.lock().unwrap_or_else(|e| e.into_inner()) = None;
        host?;
        self.require_owner()?;
        Ok(key)
    }

    /// Locks the owner's key (`key`, from its owner's backup) on this device, after checking it is this store's; then
    /// the owner lets the kernel run the build pinned now, and every merge from now on is the owner's.
    pub fn restore_owner(&self, key: SecretKey) -> Result<()> {
        let owner = self.owner()?.ok_or("this store has no owner")?;
        if key.public() != owner {
            return Err(format!("that key is {}, this store's owner is {owner}", key.public()));
        }
        theid::protect_owner(&key)?;
        self.start_owner_signs()
    }

    /// Locks the owner's key this device kept unlocked before intent 0059 (the master's), and removes the unlocked
    /// copy; then as `restore_owner`.
    pub fn protect_owner(&self) -> Result<()> {
        let owner = self.owner()?.ok_or("this store has no owner")?;
        let key = theid::legacy_owner_key(&owner).ok_or("this device holds no unlocked owner's key: `theDB owner restore` from the backup")?;
        theid::protect_owner(&key)?;
        self.start_owner_signs()
    }

    /// Carries the owner's rule for merges, and the builds it let run, into the clean store `new` (`fresh`).
    pub(crate) fn owner_rules_into(&self, new: &TheDB) -> Result<()> {
        if let Some(pins) = sql::get_meta(&self.sql(), "pins")? {
            sql::set_meta(&new.sql(), "pins", &pins)?;
        }
        if self.owner_signs()? {
            new.require_owner()?;
        }
        Ok(())
    }

    fn start_owner_signs(&self) -> Result<()> {
        // the host's key kept again by this program, so the item trusts it alone: the `security` tool, which kept it
        // before, is no longer let read it without asking the person
        if let Some(owner) = self.owner()?
            && let Some(host) = theid::keychain_get(&owner, &Who::Host)
        {
            theid::keychain_set(&owner, &Who::Host, &host)?;
        }
        if let Ok((engine, build)) = self.pinned_now()
            && !self.pin_signed(&engine, &build)?
        {
            self.owner_pin(&engine, &build)?;
        }
        self.require_owner()
    }

    /// Signs this process's commits with `key` (instead of the key kept on this device).
    pub fn sign_with(&self, key: SecretKey) {
        *self.signer.lock().unwrap_or_else(|e| e.into_inner()) = Some(key);
    }

    /// The key this process signs with: one given, or else the one kept on this device for this store's owner
    /// (`theid::key_for`: an agent's or the host's), read once.
    pub(crate) fn key(&self) -> Option<SecretKey> {
        let mut k = self.signer.lock().unwrap_or_else(|e| e.into_inner());
        if k.is_none()
            && let Ok(Some(owner)) = self.owner()
        {
            *k = theid::key_for(&owner);
        }
        k.clone()
    }

    /// The public half of the key this process signs with.
    pub fn signer(&self) -> Option<PublicKey> {
        self.key().map(|k| k.public())
    }

    /// The owner grants the agent `name` (its public key) its line for `days`: the grant kept as a blob, the line
    /// made. The person unlocks the owner's key for it. Returns the grant's hash.
    pub fn grant(&self, name: &str, agent: PublicKey, days: u64) -> Result<Hash> {
        let line = line(name);
        if !crate::is_branch(&line) {
            return Err(format!("not an agent's name (lowercase letters, digits, dashes): {name:?}"));
        }
        let key = self.owner_key(&format!("give the agent {name} its line"))?;
        let grant = theid::grant(&key, agent, Cap::Line(line.clone()), days);
        let hash = self.put(grant.encode())?;
        sql::add_grant(&self.sql(), hash, &agent.to_string(), &line, theid::until(&grant).min(i64::MAX as u64) as i64)?;
        if !self.branches()?.contains(&line) {
            self.make_branch(&line, &format!("the line of the agent {name}"))?;
        }
        Ok(hash)
    }

    /// Makes an agent: a new key kept on this device, and the owner's grant of its line. Returns its public key.
    pub fn make_agent(&self, name: &str, days: u64) -> Result<PublicKey> {
        let owner = self.owner()?.ok_or("this store has no owner")?;
        let key = SecretKey::generate();
        self.grant(name, key.public(), days)?;
        theid::keychain_set(&owner, &Who::Agent(name.to_string()), &key)?;
        Ok(key.public())
    }

    // ---- what only the owner decides ----

    /// The owner signs `fields` as a `domain` (and the time), its key unlocked by the person, who is shown `reason`.
    pub fn sign_as_owner(&self, domain: &str, fields: &[Vec<u8>], reason: &str) -> Result<Signed> {
        let key = self.owner_key(reason)?;
        let at = crate::now();
        let at_b = at.to_be_bytes();
        let mut f: Vec<&[u8]> = fields.iter().map(Vec::as_slice).collect();
        f.push(&at_b);
        Ok(Signed { key: key.public().to_string(), sig: hex(&theid::sign(&key, domain, &f).to_bytes()), at })
    }

    /// Whether `s` is this store's owner's signature of `fields` as a `domain`.
    pub fn signed_by_owner(&self, s: &Signed, domain: &str, fields: &[Vec<u8>]) -> Result<bool> {
        let Some(owner) = self.owner()? else { return Ok(false) };
        let (Ok(key), Some(sig)) = (s.key.parse::<PublicKey>(), unhex(&s.sig)) else { return Ok(false) };
        let Ok(sig) = theid::signature(&sig) else { return Ok(false) };
        let at_b = s.at.to_be_bytes();
        let mut f: Vec<&[u8]> = fields.iter().map(Vec::as_slice).collect();
        f.push(&at_b);
        Ok(key == owner && theid::verify(&key, domain, &f, &sig))
    }

    /// The engine the root names and the build it pins on main now.
    pub fn pinned_now(&self) -> Result<(String, String)> {
        let root = self.root()?.ok_or("theDB has no root")?;
        let root_doc: serde_json::Value = serde_json::from_str(&self.text(&root)?.unwrap_or_default()).map_err(err)?;
        let engine = root_doc["engine"].as_str().ok_or("the root names no engine")?.to_string();
        let build = self.engine(&engine)?.pinned.ok_or("the engine pins no build")?;
        Ok((engine, build))
    }

    /// The owner lets the kernel run build `build` of engine `engine` (the person unlocks its key).
    pub fn owner_pin(&self, engine: &str, build: &str) -> Result<()> {
        let short = &build[..12.min(build.len())];
        let signed = self.sign_as_owner(PIN, &[engine.as_bytes().to_vec(), build.as_bytes().to_vec()], &format!("run the build {short} of theOS"))?;
        let mut all: Vec<Pinned> = match sql::get_meta(&self.sql(), "pins")? {
            Some(t) => serde_json::from_str(&t).map_err(err)?,
            None => vec![],
        };
        all.push(Pinned { engine: engine.into(), build: build.into(), signed });
        sql::set_meta(&self.sql(), "pins", &serde_json::to_string(&all).map_err(err)?)
    }

    /// Whether the owner let the kernel run build `build` of engine `engine`: directly (`owner_pin`), or by accepting an
    /// intent whose version of the engine pins it. Before the owner signs merges (`owner_signs`): every pin, as before.
    pub fn pin_approved(&self, engine: &str, build: &str) -> Result<bool> {
        Ok(!self.owner_signs()? || self.pin_signed(engine, build)?)
    }

    fn pin_signed(&self, engine: &str, build: &str) -> Result<bool> {
        let pins: Vec<Pinned> = match sql::get_meta(&self.sql(), "pins")? {
            Some(t) => serde_json::from_str(&t).map_err(err)?,
            None => vec![],
        };
        for p in pins.iter().filter(|p| p.engine == engine && p.build == build) {
            if self.signed_by_owner(&p.signed, PIN, &[engine.as_bytes().to_vec(), build.as_bytes().to_vec()])? {
                return Ok(true);
            }
        }
        for (id, i) in self.intents()? {
            if i.state != crate::intents::State::Merged {
                continue;
            }
            let (Some(version), Some(s)) = (i.docs.get(engine), &i.accepted_by) else { continue };
            let pins_it = version.parse().ok().and_then(|v| self.file_at(v).ok()).and_then(|t| serde_json::from_slice::<crate::Engine>(&t).ok()).is_some_and(|e| e.pinned.as_deref() == Some(build));
            if pins_it && self.signed_by_owner(s, crate::intents::ACCEPT, &crate::intents::accept_fields(&id, &i))? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// The grant kept as blob `hash`.
    pub fn grant_at(&self, hash: Hash) -> Result<Grant> {
        theid::read_grant(&self.get(hash)?.ok_or_else(|| format!("no grant {hash}"))?)
    }

    /// Who signs a commit on `branch` from this process, and the grant that allows it; `None` when the store has no
    /// owner (nothing is signed). Refuses what the branch does not allow this process.
    pub(crate) fn may_write(&self, branch: &str) -> Result<Option<(SecretKey, Option<Hash>)>> {
        let Some(owner) = self.owner()? else { return Ok(None) };
        let Some(key) = self.key() else {
            return Err(format!("this store is signed, and this process has no key to write {branch} with (theOS's host makes its own when it starts; an agent sets THEOS_AGENT)"));
        };
        if key.public() == owner {
            return Ok(Some((key, None)));
        }
        if let Some((host, g)) = self.host()?
            && key.public() == host
        {
            if theid::allows(&self.grant_at(g)?, &owner, &host, &Cap::Main, crate::now()) {
                return Ok(Some((key, Some(g))));
            }
            return Err("the host's grant has ended: the owner grants it again".into());
        }
        if branch == crate::MAIN {
            return Err("main is written by its owner and host only: an agent works on its line and proposes".into());
        }
        let cap = Cap::Line(branch.to_string());
        for hash in sql::grants_for(&self.sql(), &key.public().to_string(), branch)? {
            if theid::allows(&self.grant_at(hash)?, &owner, &key.public(), &cap, crate::now()) {
                return Ok(Some((key, Some(hash))));
            }
        }
        Err(format!("{} has no grant of the owner's for {branch} that holds now", key.public().fmt_short()))
    }

    /// Signs the version `version` of `id` as `branch`'s head (within the commit's transaction).
    pub(crate) fn sign_commit(conn: &rusqlite::Connection, id: &str, branch: &str, version: Hash, at: u64, key: &SecretKey, grant: Option<Hash>) -> Result<()> {
        let frontiers = sql::frontiers(conn, version)?.map(|f| f.encode()).unwrap_or_default();
        let sig = theid::sign(key, COMMIT, &commit_fields(id, branch, &version, &frontiers, &at.to_be_bytes(), &grant));
        sql::add_signed(conn, version, branch, id, &key.public().to_string(), grant, at, &sig.to_bytes())
    }

    /// The owner signs every head of every branch as it is now.
    fn attest(&self) -> Result<()> {
        let key = self.key().ok_or("no key")?;
        let mut sql = self.sql();
        let tx = sql.transaction().map_err(err)?;
        for (branch, id, version) in sql::all_heads(&tx)? {
            Self::sign_commit(&tx, &id, &branch, version, crate::now(), &key, None)?;
        }
        tx.commit().map_err(err)
    }

    /// Checks every signature kept, and that every head is signed by whom its branch allows: any branch by the owner,
    /// or by the host with the owner's grant of main; a line by its agent, with the owner's grant of it; each grant as
    /// it held when the signature was made. And every owner's signature an intent carries.
    pub fn verify(&self) -> Result<Verified> {
        let owner = self.owner()?.ok_or("this store has no owner: nothing is signed")?;
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
            let allowed = signer == owner
                || s.grant.is_some_and(|g| {
                    self.grant_at(g).is_ok_and(|grant| [Cap::Main, Cap::Line(s.branch.clone())].iter().any(|cap| theid::allows(&grant, &owner, &signer, cap, s.at)))
                });
            if !allowed {
                v.problems.push(format!("{what}: signed by {}, whom {} does not allow", signer.fmt_short(), s.branch));
                continue;
            }
            good.insert((s.branch, s.doc, s.version));
        }
        drop(sql);
        for (id, i) in self.intents()? {
            if let Some(s) = &i.accepted_by
                && !self.signed_by_owner(s, crate::intents::ACCEPT, &crate::intents::accept_fields(&id, &i))?
            {
                v.problems.push(format!("the intent {id} carries an owner's signature that does not hold"));
            }
        }
        let sql = self.sql();
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
