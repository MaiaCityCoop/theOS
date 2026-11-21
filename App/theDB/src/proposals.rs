//! Proposals: a branch's docs brought into main. Since intent 0054 the engine's source lives in git, so what is proposed
//! here is content: worlds, timelines, layouts, modules. A merge brings a proposal's versions into main under one lock,
//! one at a time; checking content against its schema comes with intent 0056, and many merges at once with 0057.

use crate::{Hash, Result, TheDB, err, sql};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// What became of a proposal.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub enum State {
    Open,
    Merged,
    Refused,
}

/// A proposal: a branch, the versions it brings, and what became of it.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Proposal {
    pub branch: String,
    pub note: String,
    /// Doc id → the version on the branch when proposed.
    pub docs: BTreeMap<String, String>,
    pub state: State,
    /// The person's signature of the accept (`access`): set when it is merged in a store with a person.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval: Option<crate::access::Approval>,
}

/// What a person signs to accept a proposal.
pub(crate) const ACCEPT: &str = "theDB accept";

/// What the person's signature of accepting proposal `id` covers: its id, its branch, and each doc with the version
/// it brings.
pub(crate) fn accept_fields(id: &str, p: &Proposal) -> Vec<Vec<u8>> {
    let mut f = vec![id.as_bytes().to_vec(), p.branch.as_bytes().to_vec()];
    for (doc, version) in &p.docs {
        f.push(doc.as_bytes().to_vec());
        f.push(version.as_bytes().to_vec());
    }
    f
}

impl TheDB {
    /// A proposal to bring `branch` into main, as it is now: a doc on the branch itself, so an agent proposes from its
    /// own line. Returns the proposal's id.
    pub fn propose(&self, branch: &str, note: &str) -> Result<String> {
        let mut docs = BTreeMap::new();
        for (id, h) in self.changed_on(branch)? {
            if self.meta_of(&self.doc_at(h)?).0 != "proposal" {
                docs.insert(id, h.to_hex().to_string());
            }
        }
        if docs.is_empty() {
            return Err(format!("the branch {branch} changes nothing"));
        }
        let p = Proposal { branch: branch.into(), note: note.into(), docs, state: State::Open, approval: None };
        let id = crate::new_id();
        let doc = self.edit(&id)?;
        let meta = doc.get_map("meta");
        meta.insert("kind", "proposal").map_err(err)?;
        meta.insert("name", note).map_err(err)?;
        doc.get_map("proposal").insert("it", serde_json::to_string(&p).map_err(err)?).map_err(err)?;
        self.commit_on(Some(branch), &id, &doc)?;
        Ok(id)
    }

    /// Every proposal on every line, with its id, newest first.
    pub fn proposals(&self) -> Result<Vec<(String, Proposal)>> {
        let mut out = Vec::new();
        let mut seen = std::collections::BTreeSet::new();
        // read first and the store's lock let go: each proposal is read with the lock again
        let heads = sql::proposal_heads(&self.sql())?;
        for (id, _) in heads {
            if seen.insert(id.clone())
                && let Ok(p) = self.proposal(&id)
            {
                out.push((id, p));
            }
        }
        Ok(out)
    }

    /// Proposal `id`.
    pub fn proposal(&self, id: &str) -> Result<Proposal> {
        let branch = self.proposal_branch(id)?;
        let on = (branch != crate::MAIN).then_some(branch.as_str());
        read(&self.doc_seen(on, id)?).ok_or_else(|| format!("{id} is no proposal"))
    }

    /// Where proposal `id` is read: main once it is closed there, else the line that proposed it.
    fn proposal_branch(&self, id: &str) -> Result<String> {
        let at: Vec<String> = sql::proposal_heads(&self.sql())?.into_iter().filter(|(p, _)| p == id).map(|(_, b)| b).collect();
        if at.iter().any(|b| b == crate::MAIN) {
            return Ok(crate::MAIN.into());
        }
        at.into_iter().next().ok_or_else(|| format!("no proposal {id}"))
    }

    /// Accepts proposal `id`: its versions, merged with what main holds now, become main's. A person accepts it in
    /// theOS; it is signed by the host or the master, never by an agent. In a store with a person (`access`), the
    /// person at this Mac signs it too, by Touch ID or the login password, and the signature is kept in the proposal:
    /// whoever reads the host's key from the Keychain still cannot accept. One merge at a time.
    pub fn merge(&self, id: &str) -> Result<()> {
        let p = self.proposal(id)?;
        if p.state != State::Open {
            return Err(format!("the proposal is {:?} already", p.state));
        }
        self.is_master_or_host()?;
        let _lock = Lock::take(&self.dir().join("merge.lock"))?;
        let versions: Vec<(String, Hash)> = p.docs.iter().map(|(d, v)| Ok((d.clone(), v.parse().map_err(err)?))).collect::<Result<_>>()?;
        // what Loro would settle silently is refused out loud: the agent syncs its line, settles it, proposes again
        let conflicts = self.conflicts(&versions)?;
        if !conflicts.is_empty() {
            return Err(format!("the proposal conflicts with main ({}): {}", conflicts.len(), conflicts.iter().map(|c| c.to_string()).collect::<Vec<_>>().join("; ")));
        }
        let mut p = p;
        if !self.persons()?.is_empty() {
            let fields = accept_fields(id, &p);
            let a = self.approve(ACCEPT, &fields, &format!("accept “{}” into main", p.note))?;
            if !self.approved(&a, ACCEPT, &fields)? {
                return Err("the person's signature does not hold".into());
            }
            p.approval = Some(a);
        }
        self.merge_into_main(&versions)?;
        self.close(id, p, State::Merged)
    }

    /// Refuses proposal `id`: main stays as it is; the line keeps its work.
    pub fn refuse(&self, id: &str) -> Result<()> {
        let p = self.proposal(id)?;
        self.is_master_or_host()?;
        self.close(id, p, State::Refused)
    }

    fn close(&self, id: &str, mut p: Proposal, state: State) -> Result<()> {
        let branch = p.branch.clone();
        p.state = state;
        let doc = self.doc_seen(Some(&branch), id)?;
        doc.get_map("proposal").insert("it", serde_json::to_string(&p).map_err(err)?).map_err(err)?;
        if self.branches()?.contains(&branch) {
            self.commit_on(Some(&branch), id, &doc)?;
        }
        // a closed proposal is main's history: kept with everything main keeps, whatever becomes of its line
        self.commit_on(None, id, &doc)?;
        Ok(())
    }
}

fn read(doc: &loro::LoroDoc) -> Option<Proposal> {
    let p = doc.get_map("proposal").get("it")?.into_value().ok()?.into_string().ok()?;
    serde_json::from_str(&p).ok()
}

/// A lock held while it lives: a file made only if it does not exist. A holder whose process is gone is no holder.
struct Lock(PathBuf);

impl Lock {
    fn take(path: &Path) -> Result<Lock> {
        for _ in 0..2 {
            match std::fs::OpenOptions::new().write(true).create_new(true).open(path) {
                Ok(mut f) => {
                    use std::io::Write;
                    let _ = write!(f, "{}", std::process::id());
                    return Ok(Lock(path.into()));
                }
                Err(_) => {
                    let pid = std::fs::read_to_string(path).unwrap_or_default();
                    let alive = std::process::Command::new("kill").args(["-0", pid.trim()]).status().is_ok_and(|s| s.success());
                    if alive {
                        return Err(format!("another merge runs (process {}); one at a time", pid.trim()));
                    }
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        Err("the merge lock could not be taken".into())
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}


impl TheDB {
    /// Brings every proposal of the store in `dir` (one composted or archived) onto this store's main, as it stood
    /// there: the history of what was proposed, accepted and refused. Proposals this store has are left as they are.
    /// Returns how many came.
    pub fn proposals_from(&self, dir: &Path) -> Result<usize> {
        let old = TheDB::open_on(dir, None)?;
        let have: std::collections::BTreeSet<String> = self.proposals()?.into_iter().map(|(id, _)| id).collect();
        let mut n = 0;
        for (id, _) in old.proposals()? {
            if have.contains(&id) {
                continue;
            }
            let branch = old.proposal_branch(&id)?;
            let on = (branch != crate::MAIN).then_some(branch.as_str());
            let doc = old.doc_seen(on, &id)?;
            self.commit_on(None, &id, &doc)?;
            n += 1;
        }
        Ok(n)
    }
}
