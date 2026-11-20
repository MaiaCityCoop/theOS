//! The engine's source as docs (intent 0051): every source file a doc, a **tree** naming them by path, **views** that
//! write a branch's tree into a folder for cargo and the editor and bring the folder's edits back as Loro edits, and
//! **proposals** that merge a branch into main only once the merged tree passes its check.
//!
//! - A source file is a doc of kind `source`, named by its path; its content is kept as any file is (`set_file`).
//! - A tree is a doc of kind `tree`: `files` maps each path to its source doc's id; `tree` holds what the tree is made
//!   of (`include`: the paths it covers), the commands a merge must pass (`check`), and how a build is made (`build`,
//!   the command; `binary`, the path of what it makes). A tree changes on a branch like any doc, so two branches that
//!   add different files both keep theirs.
//! - A view is a folder with a stamp (`.thedb.json`): the tree, the branch, and the version of each file written.
//!   `sync` makes each file's edit against the version it was written from, so a doc changed meanwhile on the branch
//!   merges instead of being overwritten, and writes the merged text back. Every view builds into one cargo target
//!   folder, so the dependencies are built once for every agent.
//! - A proposal is a doc of kind `proposal`: the branch and the versions it would bring. A merge checks the merged
//!   tree out, runs the check, and moves main only if it passes; the output is kept in the proposal. Since a CRDT merge
//!   always succeeds, even into code that does not compile, the check is what stands where a merge conflict would.

use crate::{TheDB, Hash, Result, err};
use loro::LoroDoc;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// The stamp a view keeps of what it was written from.
const STAMP: &str = ".thedb.json";

/// What a tree is made of, besides its files.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Shape {
    /// The paths the tree covers, from the folder it is written into (a file, or a folder and everything in it).
    pub include: Vec<String>,
    /// The commands a merge must pass, each run with `sh -c` in a view of the merged tree.
    pub check: Vec<String>,
    /// The command that builds the engine, run the same way; empty for a tree with no build.
    #[serde(default)]
    pub build: String,
    /// The path, in the view, of what `build` makes.
    #[serde(default)]
    pub binary: String,
}

/// A tree as one branch sees it.
#[derive(Clone, Debug, Default)]
pub struct Tree {
    pub shape: Shape,
    /// Path → the id of its source doc.
    pub files: BTreeMap<String, String>,
}

/// A view's stamp.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct Stamp {
    tree: String,
    branch: Option<String>,
    /// Path → (its doc's id, the version written).
    files: BTreeMap<String, (String, String)>,
}

/// What a sync did.
#[derive(Debug, Default)]
pub struct Synced {
    pub edited: Vec<String>,
    pub added: Vec<String>,
    pub removed: Vec<String>,
}

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

/// Text is what reads as text: UTF-8 without control characters but line breaks and tabs.
pub(crate) fn as_text(bytes: &[u8]) -> Option<&str> {
    std::str::from_utf8(bytes).ok().filter(|t| !t.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t')))
}

/// Writes `bytes` into `doc` as a file's content (text as the doc's text, anything else as a blob it names), as an edit
/// of what the doc holds. Whether anything changed.
fn write_into(db: &TheDB, doc: &LoroDoc, bytes: &[u8]) -> Result<bool> {
    if let Some(text) = as_text(bytes) {
        let t = doc.get_text("text");
        if t.to_string() == text && doc.get_map("file").get("blob").is_none() {
            return Ok(false);
        }
        t.update(text, Default::default()).map_err(err)?;
        if doc.get_map("file").get("blob").is_some() {
            doc.get_map("file").delete("blob").map_err(err)?;
        }
        return Ok(true);
    }
    let blob = db.put(bytes.to_vec())?.to_hex().to_string();
    let map = doc.get_map("file");
    if map.get("blob").and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).is_some_and(|b| *b == blob) {
        return Ok(false);
    }
    map.insert("blob", blob).map_err(err)?;
    Ok(true)
}

/// The file `doc` holds.
fn read_from(db: &TheDB, doc: &LoroDoc) -> Result<Vec<u8>> {
    if let Some(b) = doc.get_map("file").get("blob").and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()) {
        let h: Hash = b.parse().map_err(err)?;
        return Ok(db.get(h)?.ok_or_else(|| format!("no blob {h}"))?.to_vec());
    }
    Ok(doc.get_text("text").to_string().into_bytes())
}

/// Whether `path` is covered by `include`.
fn covered(include: &[String], path: &str) -> bool {
    include.iter().any(|i| path == i || path.starts_with(&format!("{i}/")))
}

/// Every file under `dir` covered by `include`, as paths from `dir`: never build output, hidden files or the stamp.
fn walk(dir: &Path, include: &[String]) -> Vec<String> {
    fn go(root: &Path, at: &Path, out: &mut Vec<String>) {
        let Ok(rd) = std::fs::read_dir(at) else { return };
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "target" {
                continue;
            }
            if p.is_dir() {
                go(root, &p, out);
            } else if let Ok(rel) = p.strip_prefix(root) {
                out.push(rel.to_string_lossy().into_owned());
            }
        }
    }
    let mut out = Vec::new();
    for i in include {
        let p = dir.join(i);
        if p.is_file() {
            out.push(i.clone());
        } else {
            go(dir, &p, &mut out);
        }
    }
    out.sort();
    out.dedup();
    out
}

impl TheDB {
    /// A doc as `branch` sees it, or a new empty doc.
    fn doc_seen(&self, branch: Option<&str>, id: &str) -> Result<LoroDoc> {
        match self.head_seen(branch, id)? {
            Some(h) => self.doc_at(h),
            None => Ok(LoroDoc::new()),
        }
    }

    /// A new tree, `name`, of the given shape, on this process's branch. Returns its id.
    pub fn new_tree(&self, name: &str, shape: &Shape) -> Result<String> {
        let id = self.new("tree", name)?;
        let doc = self.doc(&id)?;
        doc.get_map("tree").insert("shape", serde_json::to_string(shape).map_err(err)?).map_err(err)?;
        self.commit(&id, &doc)?;
        Ok(id)
    }

    /// Tree `id` as `branch` sees it.
    pub fn tree_on(&self, branch: Option<&str>, id: &str) -> Result<Tree> {
        let doc = self.doc_seen(branch, id)?;
        if self.meta_of(&doc).0 != "tree" {
            return Err(format!("{id} is no tree"));
        }
        let shape = doc.get_map("tree").get("shape").and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string()).unwrap_or_default();
        let shape: Shape = serde_json::from_str(&shape).map_err(err)?;
        let files = doc.get_map("files");
        let mut out = BTreeMap::new();
        files.for_each(|k, v| {
            if let Some(id) = v.into_value().ok().and_then(|v| v.into_string().ok()) {
                out.insert(k.to_string(), id.to_string());
            }
        });
        Ok(Tree { shape, files: out })
    }

    /// Tree `id` as this process's branch sees it.
    pub fn tree(&self, id: &str) -> Result<Tree> {
        self.tree_on(self.branch(), id)
    }

    /// Changes tree `id`'s shape, on this process's branch.
    pub fn set_shape(&self, id: &str, shape: &Shape) -> Result<Hash> {
        let doc = self.doc(id)?;
        doc.get_map("tree").insert("shape", serde_json::to_string(shape).map_err(err)?).map_err(err)?;
        self.commit(id, &doc)
    }

    pub(crate) fn meta_of(&self, doc: &LoroDoc) -> (String, String) {
        let meta = doc.get_map("meta");
        let field = |k: &str| meta.get(k).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string()).unwrap_or_default();
        (field("kind"), field("name"))
    }

    /// Brings the files `paths` (from `dir`) into tree `id` on this process's branch, each as an edit of what its doc
    /// holds; a path the tree has that `paths` lacks leaves the tree. What it did.
    pub fn import(&self, id: &str, dir: &Path, paths: &[String]) -> Result<Synced> {
        let tree = self.tree(id)?;
        let doc = self.doc(id)?;
        let files = doc.get_map("files");
        let mut done = Synced::default();
        for p in paths {
            let bytes = std::fs::read(dir.join(p)).map_err(|e| format!("{p}: {e}"))?;
            match tree.files.get(p) {
                Some(fid) => {
                    let fdoc = self.doc(fid)?;
                    if write_into(self, &fdoc, &bytes)? {
                        self.commit(fid, &fdoc)?;
                        done.edited.push(p.clone());
                    }
                }
                None => {
                    let fid = self.new("source", p)?;
                    let fdoc = self.doc(&fid)?;
                    write_into(self, &fdoc, &bytes)?;
                    self.commit(&fid, &fdoc)?;
                    files.insert(p, fid).map_err(err)?;
                    done.added.push(p.clone());
                }
            }
        }
        for p in tree.files.keys().filter(|p| !paths.contains(p)) {
            files.delete(p).map_err(err)?;
            done.removed.push(p.clone());
        }
        self.commit(id, &doc)?;
        Ok(done)
    }

    /// Renames, in tree `id` on this process's branch, the path `from` (a file, or a folder and everything in it) to
    /// `to`: each file keeps its doc and its history, and the shape's paths follow. How many files moved.
    pub fn mv(&self, id: &str, from: &str, to: &str) -> Result<usize> {
        let tree = self.tree(id)?;
        let doc = self.doc(id)?;
        let files = doc.get_map("files");
        let moved = |p: &str| if p == from { Some(to.to_string()) } else { p.strip_prefix(&format!("{from}/")).map(|rest| format!("{to}/{rest}")) };
        let mut n = 0;
        for (path, fid) in &tree.files {
            if let Some(new) = moved(path) {
                files.delete(path).map_err(err)?;
                files.insert(&new, fid.as_str()).map_err(err)?;
                let fdoc = self.doc(fid)?;
                fdoc.get_map("meta").insert("name", new.as_str()).map_err(err)?;
                self.commit(fid, &fdoc)?;
                n += 1;
            }
        }
        let mut shape = tree.shape.clone();
        for i in shape.include.iter_mut() {
            if let Some(new) = moved(i) {
                *i = new;
            }
        }
        if shape != tree.shape {
            doc.get_map("tree").insert("shape", serde_json::to_string(&shape).map_err(err)?).map_err(err)?;
        }
        self.commit(id, &doc)?;
        Ok(n)
    }

    /// Writes tree `id` as this process's branch sees it into `dir`, with the stamp that makes `dir` a view. A file the
    /// last stamp named that the tree no longer has is removed; nothing else in `dir` is touched.
    pub fn checkout(&self, id: &str, dir: &Path) -> Result<()> {
        let branch = self.branch().map(str::to_string);
        self.write_tree(branch.as_deref(), id, dir, true)
    }

    fn write_tree(&self, branch: Option<&str>, id: &str, dir: &Path, stamp: bool) -> Result<()> {
        let tree = self.tree_on(branch, id)?;
        // what the last stamp named that the tree no longer has goes first: on a disk that ignores case, an old path
        // and its new spelling are one file, and removing it after the write would remove the new one
        if let Some(old) = read_stamp(dir).ok() {
            let kept: std::collections::HashSet<String> = tree.files.keys().map(|p| p.to_lowercase()).collect();
            for path in old.files.keys().filter(|p| !kept.contains(&p.to_lowercase())) {
                let _ = std::fs::remove_file(dir.join(path));
            }
        }
        let mut files = BTreeMap::new();
        for (path, fid) in &tree.files {
            let h = self.head_seen(branch, fid)?.ok_or_else(|| format!("{path}: no doc {fid}"))?;
            let bytes = read_from(self, &self.doc_at(h)?)?;
            let at = dir.join(path);
            if std::fs::read(&at).ok().as_deref() != Some(bytes.as_slice()) {
                if let Some(parent) = at.parent() {
                    std::fs::create_dir_all(parent).map_err(err)?;
                }
                std::fs::write(&at, &bytes).map_err(|e| format!("{path}: {e}"))?;
            }
            files.insert(path.clone(), (fid.clone(), h.to_hex().to_string()));
        }
        if stamp {
            let s = Stamp { tree: id.into(), branch: branch.map(str::to_string), files };
            std::fs::write(dir.join(STAMP), serde_json::to_vec_pretty(&s).map_err(err)?).map_err(err)?;
        }
        Ok(())
    }

    /// Brings the edits made in view `dir` into its branch: each changed file as an edit of the version it was written
    /// from (so what changed on the branch meanwhile merges in), new files into the tree, deleted ones out of it. Then
    /// writes the merged tree back. This process must be on the view's branch.
    pub fn sync(&self, dir: &Path) -> Result<Synced> {
        let stamp = read_stamp(dir)?;
        if stamp.branch.as_deref() != self.branch() {
            return Err(format!("the view is on {}, this process on {}", stamp.branch.as_deref().unwrap_or("main"), self.branch().unwrap_or("main")));
        }
        let tree = self.tree(&stamp.tree)?;
        let tdoc = self.doc(&stamp.tree)?;
        let files = tdoc.get_map("files");
        let mut done = Synced::default();
        let on_disk = walk(dir, &tree.shape.include);
        for path in &on_disk {
            let bytes = std::fs::read(dir.join(path)).map_err(err)?;
            match stamp.files.get(path) {
                Some((fid, version)) => {
                    let base = self.doc_at(version.parse().map_err(err)?)?;
                    if read_from(self, &base)? == bytes {
                        continue;
                    }
                    write_into(self, &base, &bytes)?;
                    self.commit(fid, &base)?;
                    done.edited.push(path.clone());
                }
                None if tree.files.contains_key(path) => {
                    // added on the branch meanwhile, and here too: an edit of the branch's
                    let fid = &tree.files[path];
                    let fdoc = self.doc(fid)?;
                    if write_into(self, &fdoc, &bytes)? {
                        self.commit(fid, &fdoc)?;
                        done.edited.push(path.clone());
                    }
                }
                None => {
                    let fid = self.new("source", path)?;
                    let fdoc = self.doc(&fid)?;
                    write_into(self, &fdoc, &bytes)?;
                    self.commit(&fid, &fdoc)?;
                    files.insert(path, fid).map_err(err)?;
                    done.added.push(path.clone());
                }
            }
        }
        for path in stamp.files.keys().filter(|p| !on_disk.contains(p)) {
            files.delete(path).map_err(err)?;
            done.removed.push(path.clone());
        }
        if !done.added.is_empty() || !done.removed.is_empty() {
            self.commit(&stamp.tree, &tdoc)?;
        }
        self.checkout(&stamp.tree, dir)?;
        Ok(done)
    }

    /// The one cargo target folder every view builds into.
    pub fn shared_target(&self) -> PathBuf {
        self.dir().join("cache").join("target")
    }

    /// Runs `command` with `sh -c` in `dir`, building into the shared target. Whether it passed, and its output.
    pub fn run_in(&self, dir: &Path, command: &str) -> Result<(bool, String)> {
        let out = std::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(dir)
            .env("CARGO_TARGET_DIR", self.shared_target())
            .env_remove("THEDB_BRANCH")
            .output()
            .map_err(err)?;
        let mut text = format!("$ {command}\n");
        text.push_str(&String::from_utf8_lossy(&out.stdout));
        text.push_str(&String::from_utf8_lossy(&out.stderr));
        Ok((out.status.success(), text))
    }

    // ---- proposals ----

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

    /// Merges proposal `id` into main if the merged tree passes its check: the proposal's versions are merged with
    /// main's on a branch of their own, every tree they touch is written to a view of it and checked, and only then are
    /// they brought into main. One merge at a time. Whether it merged; the output is kept in the proposal.
    pub fn merge(&self, id: &str) -> Result<bool> {
        let mut p = self.proposal(id)?;
        if p.state == State::Merged {
            return Ok(true);
        }
        let _lock = Lock::take(&self.dir().join("merge.lock"))?;
        // the merged versions, on a branch of their own: main as it is now, with the proposal's versions merged in
        let trial = format!("merge-{id}");
        self.make_branch(&trial, &format!("the check of proposal {id}"))?;
        for (doc, version) in &p.docs {
            let merged = self.doc_seen(None, doc)?;
            self.bring(&merged, version.parse().map_err(err)?)?;
            self.commit_on(Some(&trial), doc, &merged)?;
        }
        // every tree the proposal touches: the trees it changes, and the trees holding the files it changes
        let mut trees = Vec::new();
        for (tid, _) in self.docs_on_main()? {
            let Ok(tree) = self.tree_on(Some(&trial), &tid) else { continue };
            if p.docs.contains_key(&tid) || tree.files.values().any(|f| p.docs.contains_key(f)) {
                trees.push((tid, tree));
            }
        }
        let mut output = String::new();
        let mut passed = true;
        for (tid, tree) in &trees {
            let view = self.dir().join("cache").join("views").join(format!("check-{tid}"));
            // written anew each time: a file left from the last check with its old time made cargo take a build of
            // other source for this one (a merge was refused for a test that passed, and could as well have passed
            // for one that fails)
            let _ = std::fs::remove_dir_all(&view);
            self.write_tree(Some(&trial), tid, &view, true)?;
            for c in &tree.shape.check {
                let (ok, text) = self.run_in(&view, c)?;
                output.push_str(&text);
                if !ok {
                    passed = false;
                    break;
                }
            }
            if !passed {
                break;
            }
        }
        if trees.is_empty() {
            output.push_str("no tree is touched: nothing to check\n");
        }
        if passed {
            let versions: Vec<(String, Hash)> = self.changed_on(&trial)?;
            self.merge_into_main(&versions)?;
            p.state = State::Merged;
        } else {
            p.state = State::Refused;
        }
        let doc = self.doc_seen(None, id)?;
        let t = doc.get_text("output");
        t.update(&tail(&output, 400), Default::default()).map_err(err)?;
        doc.get_map("proposal").insert("it", serde_json::to_string(&p).map_err(err)?).map_err(err)?;
        self.commit_on(None, id, &doc)?;
        Ok(passed)
    }

    /// Every doc on main.
    fn docs_on_main(&self) -> Result<Vec<(String, Hash)>> {
        crate::sql::heads(&self.sql(), crate::MAIN)
    }

    // ---- builds and snapshots ----

    /// Builds the engine `engine` from tree `tree` on main: written to a view, built with the tree's `build`, kept with
    /// each source file named by its doc's version. Pins it. Returns the build's hash.
    pub fn publish_tree(&self, engine: &str, tree: &str) -> Result<Hash> {
        let t = self.tree_on(None, tree)?;
        if t.shape.build.is_empty() {
            return Err(format!("the tree {tree} says no build"));
        }
        let view = self.dir().join("cache").join("views").join(format!("build-{tree}"));
        self.write_tree(None, tree, &view, true)?;
        let (ok, text) = self.run_in(&view, &t.shape.build)?;
        if !ok {
            return Err(format!("the build failed:\n{}", tail(&text, 60)));
        }
        let binary = std::fs::read(view.join(&t.shape.binary)).or_else(|_| std::fs::read(self.shared_target().join(&t.shape.binary))).map_err(|e| format!("{}: {e}", t.shape.binary))?;
        let mut files = BTreeMap::new();
        for (path, fid) in &t.files {
            files.insert(path.clone(), self.head_on(None, fid)?.ok_or_else(|| format!("no doc {fid}"))?.to_hex().to_string());
        }
        let manifest = serde_json::json!({
            "tree": self.head_on(None, tree)?.map(|h| h.to_hex().to_string()),
            "files": files,
        });
        let toolchain = std::process::Command::new("rustc").arg("-V").output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        let hash = self.publish(engine, &binary, &serde_json::to_vec_pretty(&manifest).map_err(err)?, &toolchain)?;
        let mut e = self.engine(engine)?;
        if e.tree.as_deref() != Some(tree) {
            e.tree = Some(tree.into());
            self.set_text(engine, &serde_json::to_string_pretty(&e).map_err(err)?)?;
        }
        Ok(hash)
    }

    /// Writes the source of build `build` into `dir`: each file at the version the build names.
    pub fn checkout_build(&self, build: &str, dir: &Path) -> Result<usize> {
        let b = self.build(build)?;
        let manifest: serde_json::Value = serde_json::from_slice(&self.get(b.source.parse().map_err(err)?)?.ok_or("no manifest")?).map_err(err)?;
        let files = manifest.get("files").and_then(|f| f.as_object()).cloned().unwrap_or_else(|| manifest.as_object().cloned().unwrap_or_default());
        let tree_kind = manifest.get("files").is_some();
        for (path, h) in &files {
            let h: Hash = h.as_str().unwrap_or_default().parse().map_err(err)?;
            // a build made from a tree names doc versions; an older one names the files' blobs
            let bytes = if tree_kind { read_from(self, &self.doc_at(h)?)? } else { self.get(h)?.ok_or_else(|| format!("no blob {h}"))?.to_vec() };
            let at = dir.join(path);
            if let Some(parent) = at.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            std::fs::write(&at, bytes).map_err(err)?;
        }
        Ok(files.len())
    }

    /// Writes tree `tree` as main has it into `dir` (the git checkout) for a snapshot: no stamp; a file under the
    /// tree's paths that main does not have is removed. The paths written.
    pub fn snapshot(&self, tree: &str, dir: &Path) -> Result<usize> {
        let t = self.tree_on(None, tree)?;
        self.write_tree(None, tree, dir, false)?;
        for path in walk(dir, &t.shape.include) {
            if !t.files.contains_key(&path) && covered(&t.shape.include, &path) {
                std::fs::remove_file(dir.join(&path)).map_err(err)?;
            }
        }
        Ok(t.files.len())
    }
}

fn read_stamp(dir: &Path) -> Result<Stamp> {
    let b = std::fs::read(dir.join(STAMP)).map_err(|_| format!("{} is no view (no {STAMP})", dir.display()))?;
    serde_json::from_slice(&b).map_err(err)
}

/// The last `n` lines of `text`.
fn tail(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
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

/// The tree and the branch view `dir` was written from.
pub fn view_of(dir: &Path) -> Result<(String, Option<String>)> {
    let s = read_stamp(dir)?;
    Ok((s.tree, s.branch))
}
