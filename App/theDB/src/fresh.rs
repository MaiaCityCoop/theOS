//! A clean store: only what the root reaches, as it is now, and nothing of what came before.
//!
//! `reach` walks from the root doc. A doc names other docs by their ids and blobs (or versions of docs) by their
//! hashes, as keys or values anywhere in what it holds, and other docs by the ids among the words of its text. A small blob that is JSON (a build, a build's manifest) or a doc's snapshot is searched the
//! same way, so a build brings its binary, its manifest, and the version of each source file the manifest names. Two
//! kinds of doc say more than they use, and are read for what they use:
//!
//! - an **engine** (it has `builds` and `pinned`) lists every build ever made: only the pinned one, and its tree, are
//!   followed, and in the clean store its list holds that one build;
//! - the **kernel's** doc (kind `kernel`) remembers which doc versions its plugins have handled: nothing in it is
//!   followed, and in the clean store it remembers only docs that are still there.
//!
//! `fresh` makes a new store beside the old one, copies what is reached (each doc with one version: its current one,
//! under the hash it has, so what pins it still reads it; each blob), reads everything back and compares it with the
//! old store, and only then swaps: the old store's files go to the compost, the new one's take their place. No
//! branches, no proposals, no earlier versions, no unreached docs or blobs come along.

use crate::compost::{self, COMPOST};
use crate::{Engine, Hash, Result, TheDB, err, json, sql};
use loro::LoroDoc;
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

/// The folder, in the store's folder, the new store is made in before the swap.
const BESIDE: &str = "fresh.tmp";

/// How large a blob is still read to see whether it names others (a build, a manifest, a doc's snapshot). Larger
/// ones are content: a binary, a picture.
const SMALL: u64 = 4 * 1024 * 1024;

/// What the root reaches.
#[derive(Clone, Debug, Default)]
pub struct Reach {
    pub root: String,
    /// Each reached doc and its current version on main.
    pub docs: BTreeMap<String, Hash>,
    /// Versions that are named by hash and are not their doc's current one: the version, and its doc.
    pub versions: BTreeMap<Hash, String>,
    /// Each reached blob and its size.
    pub blobs: BTreeMap<Hash, u64>,
}

/// What `fresh` did.
#[derive(Clone, Debug)]
pub struct Fresh {
    pub docs: usize,
    pub blobs: usize,
    /// Docs the old store had on main that the root does not reach.
    pub left_docs: usize,
    /// The bytes of the old store's files, and of the new one's.
    pub before: u64,
    pub after: u64,
    /// Where the old store is until the compost lets it go.
    pub composted: PathBuf,
}

use crate::is_hash;

/// A doc's content as JSON, if it is JSON.
fn content(doc: &LoroDoc) -> Option<serde_json::Value> {
    serde_json::from_str(&json::read(doc)).ok()
}

/// Whether `v` is an engine's content: its builds, and the one pinned.
fn is_engine(v: &serde_json::Value) -> bool {
    v.get("builds").is_some_and(|b| b.is_array()) && v.get("pinned").is_some()
}

fn kind(doc: &LoroDoc) -> String {
    doc.get_map("meta").get("kind").and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string()).unwrap_or_default()
}

/// The ids and hashes `doc` names (see the module's words for the two kinds that are read differently).
fn names(doc: &LoroDoc) -> Vec<String> {
    if kind(doc) == "kernel" {
        return Vec::new();
    }
    if let Some(v) = content(doc).filter(is_engine) {
        return v["pinned"].as_str().map(str::to_string).into_iter().collect();
    }
    let mut out = Vec::new();
    json::strings(&json::whole(doc), &mut out);
    // a text (a shader, a source file, a recipe written as text) names docs by their ids among its words
    let words: Vec<String> = out
        .iter()
        .filter(|s| s.len() > 26)
        .flat_map(|s| s.split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| crate::is_id(w)).map(str::to_string).collect::<Vec<_>>())
        .collect();
    out.extend(words);
    out
}

/// A special doc's content in the clean store, or none for a doc that is taken as it is.
fn cleaned(doc: &LoroDoc, kept: &BTreeMap<String, Hash>) -> Option<String> {
    if kind(doc) == "kernel" {
        // plugin → doc id → the head it handled: only docs that stay, only plugins with any left
        let handled: BTreeMap<String, BTreeMap<String, String>> = serde_json::from_str(&json::read(doc)).ok()?;
        let handled: BTreeMap<String, BTreeMap<String, String>> = handled
            .into_iter()
            .map(|(plugin, docs)| (plugin, docs.into_iter().filter(|(id, _)| kept.contains_key(id)).collect::<BTreeMap<_, _>>()))
            .filter(|(_, docs)| !docs.is_empty())
            .collect();
        return serde_json::to_string_pretty(&handled).ok();
    }
    let v = content(doc).filter(is_engine)?;
    let mut engine: Engine = serde_json::from_value(v).ok()?;
    engine.builds = engine.pinned.iter().cloned().collect();
    serde_json::to_string_pretty(&engine).ok()
}

impl TheDB {
    /// What the root doc reaches on main: docs, versions named by hash, and blobs.
    pub fn reach(&self) -> Result<Reach> {
        let root = self.root()?.ok_or("theDB has no root")?;
        if self.head_on(None, &root)?.is_none() {
            return Err(format!("the root {root} is no doc on main"));
        }
        let mut reach = Reach { root: root.clone(), ..Default::default() };
        let mut seen: BTreeSet<String> = BTreeSet::new();
        let mut todo: Vec<String> = vec![root];
        while let Some(word) = todo.pop() {
            if !seen.insert(word.clone()) {
                continue;
            }
            if crate::is_id(&word) {
                // a 26-letter word that is no doc on main is just a word
                if let Some(head) = self.head_on(None, &word)? {
                    reach.docs.insert(word, head);
                    seen.insert(head.to_hex().to_string());
                    todo.extend(names(&self.doc_at(head)?));
                }
            } else if is_hash(&word) {
                let hash: Hash = word.parse().map_err(err)?;
                let version = sql::version_of(&self.sql(), hash)?;
                if let Some((doc, _)) = version {
                    // a version of a doc: the doc is reached too, and what this version names
                    reach.versions.insert(hash, doc.clone());
                    todo.push(doc);
                    todo.extend(names(&self.doc_at(hash)?));
                } else if let Some(size) = self.blob_size(hash)? {
                    reach.blobs.insert(hash, size);
                    if size <= SMALL
                        && let Some(bytes) = self.get(hash)?
                    {
                        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                            json::strings(&v, &mut todo);
                        } else if let Ok(doc) = LoroDoc::from_snapshot(&bytes) {
                            // a version from before SQLite, kept as its snapshot
                            todo.extend(names(&doc));
                        }
                    }
                }
            }
        }
        // a version from before SQLite is a snapshot blob that says nothing of its doc: it belongs to the reached doc
        // whose current version includes all of its history (Loro's version vectors; a doc's ops are its own peers')
        let mut heads_vv = Vec::new();
        for (id, head) in &reach.docs {
            heads_vv.push((id.clone(), self.doc_at(*head)?.oplog_vv()));
        }
        let old: Vec<Hash> = reach.blobs.keys().copied().filter(|h| reach.blobs[h] <= SMALL).collect();
        for hash in old {
            let Some(bytes) = self.get(hash)? else { continue };
            if !bytes.starts_with(b"loro") {
                continue;
            }
            let Ok(doc) = LoroDoc::from_snapshot(&bytes) else { continue };
            let vv = doc.oplog_vv();
            if vv.is_empty() {
                continue;
            }
            let of: Vec<&String> = heads_vv.iter().filter(|(_, h)| h.includes_vv(&vv)).map(|(id, _)| id).collect();
            if let [id] = of.as_slice() {
                reach.blobs.remove(&hash);
                reach.versions.insert(hash, (*id).clone());
            }
        }
        // a doc's current version is no extra version
        let heads: BTreeSet<Hash> = reach.docs.values().copied().collect();
        reach.versions.retain(|h, doc| !heads.contains(h) && reach.docs.contains_key(doc));
        Ok(reach)
    }

    /// Keeps a version made in another store under the hash it has there; as doc `id`'s current version on main if
    /// `head`.
    fn adopt(&self, id: &str, hash: Hash, snapshot: &[u8], head: bool, at: u64) -> Result<()> {
        let doc = LoroDoc::from_snapshot(snapshot).map_err(err)?;
        let mut sql = self.sql();
        let tx = sql.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
        sql::adopt(&tx, id, hash, snapshot, &doc, at)?;
        if head {
            sql::set_head(&tx, crate::MAIN, id, hash, at)?;
            sql::describe(&tx, id, &doc)?;
        }
        tx.commit().map_err(err)
    }

    /// The version `hash` as a whole snapshot, and when it was made.
    fn whole_version(&self, hash: Hash) -> Result<(Vec<u8>, u64)> {
        let kept = sql::snapshot(&self.sql(), hash)?;
        let bytes = match kept {
            Some((bytes, _)) => bytes,
            // a version from before SQLite: its snapshot blob, the very bytes its hash names
            None => self.get(hash)?.ok_or_else(|| format!("no version {hash}"))?.to_vec(),
        };
        let sql = self.sql();
        let at = sql::version_of(&sql, hash)?.map(|(_, at)| at).unwrap_or_else(crate::now);
        Ok((bytes, at))
    }

    /// Makes this store a clean one: a new store of only what the root reaches, checked against this one, then put
    /// in its place; this one's files go to the compost as `<day> the store before <why>`. This process must own the
    /// store's files and be on main, and no other process should have the store open: its files are moved.
    ///
    /// Nothing of this store changes until the new one has been read back and found equal; if anything differs, the
    /// new one is removed and this one stays as it is.
    pub fn fresh(self, why: &str) -> Result<Fresh> {
        if !self.owns() {
            return Err("another process holds the store's files: stop it (the kernel, theOS), then run this again".into());
        }
        if let Some(b) = self.branch() {
            return Err(format!("a clean store is made from main (this process is on the branch {b})"));
        }
        let dir = self.dir().canonicalize().map_err(err)?;
        let reach = self.reach()?;
        let beside = dir.join(BESIDE);
        let _ = std::fs::remove_dir_all(&beside);
        let made = self.copy_into(&reach, &beside);
        if let Err(e) = made {
            let _ = std::fs::remove_dir_all(&beside);
            return Err(format!("no clean store was made, and nothing has changed: {e}"));
        }
        let left_docs = self.docs()?.len() - reach.docs.len();
        // both stores write what they hold and let their files go
        drop(self);
        let size = |at: &std::path::Path| compost::STORE.iter().map(|f| compost::bytes_of(&at.join(f))).sum::<u64>();
        let (before, after) = (size(&dir), size(&beside));
        let old: Vec<PathBuf> = compost::STORE.iter().map(|f| dir.join(f)).filter(|p| p.exists()).collect();
        let composted = compost::put_away(&dir, COMPOST, &old, &format!("the store before {why}"), why, std::time::SystemTime::now())?;
        for f in compost::STORE {
            let from = beside.join(f);
            if from.exists() {
                std::fs::rename(&from, dir.join(f)).map_err(|e| {
                    format!("{f}: {e}. The old store is in {}, the new one in {}: nothing is lost, and both can be moved by hand", composted.display(), beside.display())
                })?;
            }
        }
        let _ = std::fs::remove_dir_all(&beside);
        // the old owner's address: the next process to open the store writes its own
        let _ = std::fs::remove_file(dir.join("rpc.port"));
        let _ = std::fs::remove_file(dir.join("rpc.cert"));
        Ok(Fresh { docs: reach.docs.len(), blobs: reach.blobs.len(), left_docs, before, after, composted })
    }

    /// Makes the store `beside` hold what `reach` names, and compares it with this one. The new store is closed when
    /// this returns.
    fn copy_into(&self, reach: &Reach, beside: &std::path::Path) -> Result<()> {
        let new = TheDB::open_on(beside, None)?;
        for hash in reach.blobs.keys() {
            let bytes = self.get(*hash)?.ok_or_else(|| format!("no blob {hash}"))?;
            if new.put(bytes)? != *hash {
                return Err(format!("the blob {hash} came out under another hash"));
            }
        }
        // each special doc's content in the clean store, as text
        let mut special: BTreeMap<String, String> = BTreeMap::new();
        for (id, head) in &reach.docs {
            let doc = self.doc_at(*head)?;
            match cleaned(&doc, &reach.docs) {
                Some(text) => {
                    let (kind, name) = self.meta_of(&doc);
                    let clean = LoroDoc::new();
                    clean.get_map("meta").insert("kind", kind).map_err(err)?;
                    clean.get_map("meta").insert("name", name).map_err(err)?;
                    json::write(&clean, &text)?;
                    new.commit_on(None, id, &clean)?;
                    special.insert(id.clone(), text);
                }
                None => {
                    let (snapshot, at) = self.whole_version(*head)?;
                    new.adopt(id, *head, &snapshot, true, at)?;
                }
            }
        }
        for (hash, id) in &reach.versions {
            let (snapshot, at) = self.whole_version(*hash)?;
            new.adopt(id, *hash, &snapshot, false, at)?;
        }
        new.set_root(&reach.root)?;
        self.same(&new, reach, &special)
    }

    /// Compares the clean store `new` with this one: the root; every reached doc (its version's hash, everything it
    /// holds, the file it reads as, its kind and name); every named version; every blob, hashed again; every engine's
    /// pinned binary against its hash; and that nothing else is there.
    fn same(&self, new: &TheDB, reach: &Reach, special: &BTreeMap<String, String>) -> Result<()> {
        if new.root()?.as_deref() != Some(reach.root.as_str()) {
            return Err("the root differs".into());
        }
        let ids: Vec<String> = new.docs()?.into_iter().map(|(id, _)| id).collect();
        if ids != reach.docs.keys().cloned().collect::<Vec<_>>() {
            return Err("the clean store's docs are not exactly the reached ones".into());
        }
        if !new.branches()?.is_empty() {
            return Err("the clean store has a branch".into());
        }
        let as_json = |t: &str| serde_json::from_str::<serde_json::Value>(t).ok();
        for (id, head) in &reach.docs {
            let theirs = new.head_on(None, id)?.ok_or_else(|| format!("{id}: missing"))?;
            let (old, fresh) = (self.doc_at(*head)?, new.doc_at(theirs)?);
            if self.meta_of(&old) != new.meta(id)? {
                return Err(format!("{id}: its kind or name differs"));
            }
            match special.get(id) {
                Some(text) => {
                    if as_json(&json::read(&fresh)).is_none() || as_json(&json::read(&fresh)) != as_json(text) {
                        return Err(format!("{id}: its cleaned content differs"));
                    }
                }
                None => {
                    if theirs != *head {
                        return Err(format!("{id}: its version is {theirs}, not {head}"));
                    }
                    if json::whole(&old) != json::whole(&fresh) {
                        return Err(format!("{id}: what it holds differs"));
                    }
                    if self.file_at(*head)? != new.file_at(theirs)? {
                        return Err(format!("{id}: the file it reads as differs"));
                    }
                }
            }
        }
        for hash in reach.versions.keys() {
            if self.file_at(*hash)? != new.file_at(*hash)? {
                return Err(format!("the version {hash} reads differently"));
            }
        }
        for hash in reach.blobs.keys() {
            let bytes = new.get(*hash)?.ok_or_else(|| format!("the blob {hash} is missing"))?;
            if Hash::new(&bytes) != *hash {
                return Err(format!("the blob {hash} does not match its hash"));
            }
        }
        for id in special.keys() {
            let Some(pinned) = new.engine(id)?.pinned else { continue };
            let binary: Hash = new.build(&pinned)?.binary.parse().map_err(err)?;
            let bytes = new.get(binary)?.ok_or_else(|| format!("the engine {id}'s pinned binary is missing"))?;
            if Hash::new(&bytes) != binary {
                return Err(format!("the engine {id}'s pinned binary does not match its hash"));
            }
        }
        Ok(())
    }
}
