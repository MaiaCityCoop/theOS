//! Proposals: a branch's docs brought into main. Since intent 0054 the engine's source lives in git, so what is proposed
//! here is content: worlds, timelines, layouts, modules. A merge brings a proposal's versions into main under one lock,
//! one at a time; checking content against its schema comes with intent 0056, and many merges at once with 0057.

use crate::{Hash, Result, TheDB, err};
use loro::LoroDoc;
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
}

impl TheDB {
    /// A proposal to bring `branch` into main, as it is now. Returns the proposal's id.
    pub fn propose(&self, branch: &str, note: &str) -> Result<String> {
        let docs: BTreeMap<String, String> = self.changed_on(branch)?.into_iter().map(|(id, h)| (id, h.to_hex().to_string())).collect();
        if docs.is_empty() {
            return Err(format!("the branch {branch} changes nothing"));
        }
        let p = Proposal { branch: branch.into(), note: note.into(), docs, state: State::Open };
        // a proposal lives on main, whatever branch proposes it
        let id = crate::new_id();
        let doc = LoroDoc::new();
        let meta = doc.get_map("meta");
        meta.insert("kind", "proposal").map_err(err)?;
        meta.insert("name", note).map_err(err)?;
        doc.get_map("proposal").insert("it", serde_json::to_string(&p).map_err(err)?).map_err(err)?;
        self.commit_on(None, &id, &doc)?;
        Ok(id)
    }

    /// Proposal `id`.
    pub fn proposal(&self, id: &str) -> Result<Proposal> {
        let doc = self.doc_seen(None, id)?;
        let p = doc.get_map("proposal").get("it").and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).ok_or_else(|| format!("{id} is no proposal"))?;
        serde_json::from_str(&p).map_err(err)
    }

    /// The output of proposal `id`'s last check.
    pub fn proposal_output(&self, id: &str) -> Result<String> {
        let doc = self.doc_seen(None, id)?;
        Ok(doc.get_text("output").to_string())
    }

    /// Merges proposal `id` into main: its versions, merged with what main holds now, become main's. One merge at a time.
    pub fn merge(&self, id: &str) -> Result<bool> {
        let mut p = self.proposal(id)?;
        if p.state == State::Merged {
            return Ok(true);
        }
        let _lock = Lock::take(&self.dir().join("merge.lock"))?;
        let versions: Vec<(String, Hash)> = p.docs.iter().map(|(d, v)| Ok((d.clone(), v.parse().map_err(err)?))).collect::<Result<_>>()?;
        self.merge_into_main(&versions)?;
        p.state = State::Merged;
        let doc = self.doc_seen(None, id)?;
        doc.get_text("output").update(&format!("merged {} docs into main", versions.len()), Default::default()).map_err(err)?;
        doc.get_map("proposal").insert("it", serde_json::to_string(&p).map_err(err)?).map_err(err)?;
        self.commit_on(None, id, &doc)?;
        Ok(true)
    }
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

