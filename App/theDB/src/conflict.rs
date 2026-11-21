//! Conflicts: what a merge would decide silently, found before it. A Loro merge never fails: where main and a line
//! both changed the same key, one side wins by Loro's order and the other is gone without a word. So before a proposal
//! is merged, every doc it brings is read three times: at the base (what main and the line both hold), as main has it,
//! and as the line has it. A path (a key, at any depth; a list or a text as a whole) that both changed since the base,
//! to different values, is a conflict. A proposal with a conflict is not merged: the agent brings main into its line
//! (`sync_line`), settles each one, and proposes again.

use crate::{Hash, Result, TheDB, err, json};
use loro::{ExportMode, LoroDoc};
use serde_json::Value;
use std::collections::BTreeMap;

/// One path both sides changed, and what each made of it.
#[derive(Clone, Debug, PartialEq)]
pub struct Conflict {
    pub doc: String,
    pub path: String,
    pub base: Option<Value>,
    pub main: Option<Value>,
    pub line: Option<Value>,
}

impl std::fmt::Display for Conflict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let show = |v: &Option<Value>| v.as_ref().map(|v| v.to_string().chars().take(60).collect::<String>()).unwrap_or_else(|| "(gone)".into());
        write!(f, "{} {}: main has {}, the line {} (both since {})", self.doc, self.path, show(&self.main), show(&self.line), show(&self.base))
    }
}

/// Every leaf of `v` by its path: objects are walked, lists and texts are leaves whole.
fn leaves(v: &Value, path: String, out: &mut BTreeMap<String, Value>) {
    match v {
        Value::Object(o) if !o.is_empty() => {
            for (k, x) in o {
                leaves(x, format!("{path}/{k}"), out);
            }
        }
        _ => {
            out.insert(if path.is_empty() { "/".into() } else { path }, v.clone());
        }
    }
}

/// Everything `doc` holds, by path.
fn content(doc: &LoroDoc) -> BTreeMap<String, Value> {
    let mut out = BTreeMap::new();
    leaves(&json::whole(doc), String::new(), &mut out);
    out
}

impl TheDB {
    /// The conflicts merging `docs` (doc id → the line's version) into main would hide.
    pub fn conflicts(&self, docs: &[(String, Hash)]) -> Result<Vec<Conflict>> {
        let mut found = Vec::new();
        for (id, version) in docs {
            let Some(head) = self.head_on(None, id)? else { continue };
            let (main, line) = (self.doc_at(head)?, self.doc_at(*version)?);
            let (mvv, lvv) = (main.oplog_vv(), line.oplog_vv());
            // one side holds all the other has: nothing happened on both
            if mvv.includes_vv(&lvv) || lvv.includes_vv(&mvv) {
                continue;
            }
            let all = main.fork();
            all.import(&line.export(ExportMode::updates(&all.oplog_vv())).map_err(err)?).map_err(err)?;
            let at = |vv: &loro::VersionVector| -> Result<BTreeMap<String, Value>> { Ok(content(&all.fork_at(&all.vv_to_frontiers(vv)).map_err(err)?)) };
            let base = at(&mvv.intersection(&lvv))?;
            let (m, l) = (content(&main), content(&line));
            let paths: std::collections::BTreeSet<&String> = base.keys().chain(m.keys()).chain(l.keys()).collect();
            for p in paths {
                let (b, mv, lv) = (base.get(p), m.get(p), l.get(p));
                if mv != b && lv != b && mv != lv {
                    found.push(Conflict { doc: id.clone(), path: p.clone(), base: b.cloned(), main: mv.cloned(), line: lv.cloned() });
                }
            }
        }
        Ok(found)
    }

    /// The conflicts proposal `id` has with main as it is now.
    pub fn proposal_conflicts(&self, id: &str) -> Result<Vec<Conflict>> {
        let p = self.proposal(id)?;
        let docs: Vec<(String, Hash)> = p.docs.iter().map(|(d, v)| Ok((d.clone(), v.parse().map_err(err)?))).collect::<Result<_>>()?;
        self.conflicts(&docs)
    }

    /// Brings main into line `branch`: every doc the line changed takes what main has gained since, merged as Loro
    /// merges. Returns the conflicts that merge settled by Loro's order, for the agent to look at and settle for good
    /// on its line before it proposes again.
    pub fn sync_line(&self, branch: &str) -> Result<Vec<Conflict>> {
        let changed = self.changed_on(branch)?;
        let conflicts = self.conflicts(&changed)?;
        for (id, _) in &changed {
            let Some(head) = self.head_on(None, id)? else { continue };
            let doc = self.doc_seen(Some(branch), id)?;
            let main = self.doc_at(head)?;
            doc.import(&main.export(ExportMode::updates(&doc.oplog_vv())).map_err(err)?).map_err(err)?;
            self.commit_on(Some(branch), id, &doc)?;
        }
        Ok(conflicts)
    }
}
