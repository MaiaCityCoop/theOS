//! Code as one Loro doc (intent 0059, step 1d): no paths as keys, no doc per file. The host's code is a doc of kind
//! `code` (the root names it as `code`) holding a Loro movable tree, `files`: a node for every folder and every file,
//! its name in its metadata, and in a file's node its text as a Loro text (an icon: the hash of its blob). A node is a
//! file's identity: a rename or a move is one op on it (a whole folder too), and merges with edits made meanwhile, by
//! main or a line, to what it holds; a path is only how a node is reached and named. One version of the doc is one
//! state of all the code; a line's code is its version of this one doc.
//!
//! Nothing is edited in a folder. The builder writes a projection of a line's code for `cargo` (`project`): read
//! only, rewriting only what changed, at one place for every line (`build/src` in the store), with one target
//! (`build/target`), one build at a time (`build_start`, `build_status`); a tree is never built from scratch twice.
//! Git is an archive: before each merge that brings code, main's code is committed onto `refs/heads/archive` of the
//! repository the store lives in, without touching any working tree or index (`archive_code`).

use crate::{Hash, Result, TheDB, err};
use loro::{LoroDoc, LoroText, LoroTree, TreeID, TreeParentId, ValueOrContainer};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// The movable tree in a code doc.
pub(crate) const TREE: &str = "files";

/// What a projection wrote.
#[derive(Clone, Debug)]
pub struct Projected {
    /// The code's hash: every path with its content's hash.
    pub hash: Hash,
    pub files: usize,
    pub written: usize,
    pub removed: usize,
}

/// A path: relative, `/` between its parts, none of them empty, `.` or `..`.
fn check_path(path: &str) -> Result<()> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.split('/').any(|p| p.is_empty() || p == "." || p == "..") {
        return Err(format!("not a path: {path:?}"));
    }
    Ok(())
}

fn split(path: &str) -> (Option<&str>, &str) {
    match path.rsplit_once('/') {
        Some((dir, name)) => (Some(dir), name),
        None => (None, path),
    }
}

fn meta_str(tree: &LoroTree, node: TreeID, key: &str) -> Option<String> {
    let v = tree.get_meta(node).ok()?.get(key)?.into_value().ok()?;
    v.into_string().ok().map(|s| s.to_string())
}

/// A file node's text, if it holds one.
fn node_text(tree: &LoroTree, node: TreeID) -> Option<LoroText> {
    match tree.get_meta(node).ok()?.get("text")? {
        ValueOrContainer::Container(loro::Container::Text(t)) => Some(t),
        _ => None,
    }
}

/// Every live node: its path, its id, whether it is a file. Two nodes can share a path after a merge (two lines made
/// the same file): both are here.
pub(crate) fn nodes(doc: &LoroDoc) -> Vec<(String, TreeID, bool)> {
    let tree = doc.get_tree(TREE);
    let mut out = Vec::new();
    let mut todo: Vec<(TreeID, String)> = tree.roots().into_iter().filter_map(|r| Some((r, meta_str(&tree, r, "name")?))).collect();
    while let Some((node, path)) = todo.pop() {
        out.push((path.clone(), node, meta_str(&tree, node, "kind").as_deref() == Some("file")));
        for c in tree.children(node).unwrap_or_default() {
            if let Some(name) = meta_str(&tree, c, "name") {
                todo.push((c, format!("{path}/{name}")));
            }
        }
    }
    out
}

/// Every live node by its path, and whether it is a file.
pub(crate) fn index(doc: &LoroDoc) -> BTreeMap<String, (TreeID, bool)> {
    nodes(doc).into_iter().map(|(p, n, f)| (p, (n, f))).collect()
}

/// What a code doc holds, node by node, for finding conflicts: each live node's name, parent, and text or blob,
/// under `/files/<node>/…`; a node is its identity, so a move and an edit of what it holds are different leaves.
pub(crate) fn leaves(doc: &LoroDoc, out: &mut BTreeMap<String, Value>) {
    let tree = doc.get_tree(TREE);
    for (_, node, _) in nodes(doc) {
        let p = format!("/{TREE}/{node}");
        out.insert(format!("{p}/name"), json!(meta_str(&tree, node, "name")));
        let parent = match tree.parent(node) {
            Some(TreeParentId::Node(n)) => n.to_string(),
            _ => "root".to_string(),
        };
        out.insert(format!("{p}/parent"), json!(parent));
        if let Some(t) = node_text(&tree, node) {
            out.insert(format!("{p}/text"), json!(t.to_string()));
        }
        if let Some(b) = meta_str(&tree, node, "blob") {
            out.insert(format!("{p}/blob"), json!(b));
        }
    }
}

/// The bytes of a file node: its text, or the blob it names (read through `blob`).
fn node_bytes(tree: &LoroTree, node: TreeID, blob: impl Fn(Hash) -> Result<Vec<u8>>) -> Result<Vec<u8>> {
    if let Some(h) = meta_str(tree, node, "blob") {
        return blob(h.parse().map_err(err)?);
    }
    Ok(node_text(tree, node).map(|t| t.to_string()).unwrap_or_default().into_bytes())
}

/// The folder at `path`, made (with every folder above it) where it is missing.
fn ensure_dir(tree: &LoroTree, idx: &mut BTreeMap<String, (TreeID, bool)>, path: Option<&str>) -> Result<TreeParentId> {
    let Some(path) = path else { return Ok(TreeParentId::Root) };
    if let Some((node, file)) = idx.get(path) {
        return if *file { Err(format!("{path} is a file, not a folder")) } else { Ok(TreeParentId::Node(*node)) };
    }
    let (above, name) = split(path);
    let parent = ensure_dir(tree, idx, above)?;
    let node = tree.create(parent).map_err(err)?;
    let meta = tree.get_meta(node).map_err(err)?;
    meta.insert("name", name).map_err(err)?;
    meta.insert("kind", "dir").map_err(err)?;
    idx.insert(path.to_string(), (node, false));
    Ok(TreeParentId::Node(node))
}

/// The file node at `path`, made where it is missing. Whether it was made.
fn ensure_file(tree: &LoroTree, idx: &mut BTreeMap<String, (TreeID, bool)>, path: &str) -> Result<(TreeID, bool)> {
    check_path(path)?;
    if let Some((node, file)) = idx.get(path) {
        return if *file { Ok((*node, false)) } else { Err(format!("{path} is a folder")) };
    }
    let (dir, name) = split(path);
    let parent = ensure_dir(tree, idx, dir)?;
    let node = tree.create(parent).map_err(err)?;
    let meta = tree.get_meta(node).map_err(err)?;
    meta.insert("name", name).map_err(err)?;
    meta.insert("kind", "file").map_err(err)?;
    idx.insert(path.to_string(), (node, true));
    Ok((node, true))
}

/// Writes `text` into the file at `path` of `doc` (only what changed). Whether anything changed.
fn put_text(doc: &LoroDoc, idx: &mut BTreeMap<String, (TreeID, bool)>, path: &str, text: &str) -> Result<bool> {
    let tree = doc.get_tree(TREE);
    let (node, made) = ensure_file(&tree, idx, path)?;
    let meta = tree.get_meta(node).map_err(err)?;
    let was_blob = meta.get("blob").is_some();
    if was_blob {
        meta.delete("blob").map_err(err)?;
    }
    // a mergeable text: two writers who give the same node its text at once write into one text, not two
    let t = meta.ensure_mergeable_text("text").map_err(err)?;
    if !made && !was_blob && t.to_string() == text {
        return Ok(false);
    }
    // never read as JSON: a source file stays text, whatever it looks like
    t.update(text, Default::default()).map_err(err)?;
    Ok(true)
}

fn is_text(bytes: &[u8]) -> Option<&str> {
    std::str::from_utf8(bytes).ok().filter(|t| !t.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t')))
}

fn writable(path: &Path, yes: bool) {
    if let Ok(meta) = std::fs::metadata(path) {
        let mut p = meta.permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        p.set_readonly(!yes);
        let _ = std::fs::set_permissions(path, p);
    }
}

fn git(repo: &Path, args: &[&str], input: Option<&[u8]>, env: &[(&str, &Path)]) -> Result<String> {
    use std::io::Write;
    let mut cmd = std::process::Command::new("git");
    cmd.arg("-C").arg(repo).args(args).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    for (k, v) in env {
        cmd.env(k, v);
    }
    if input.is_some() {
        cmd.stdin(std::process::Stdio::piped());
    }
    let mut child = cmd.spawn().map_err(err)?;
    if let Some(bytes) = input {
        child.stdin.take().ok_or("no input to git")?.write_all(bytes).map_err(err)?;
    }
    let out = child.wait_with_output().map_err(err)?;
    if !out.status.success() {
        return Err(format!("git {}: {}", args.join(" "), String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

impl TheDB {
    /// The root doc's id and its JSON, as this process's branch sees it.
    fn root_json(&self) -> Result<(String, Value)> {
        let root = self.root()?.ok_or("theDB has no root")?;
        let v = serde_json::from_str(&self.text(&root)?.unwrap_or_else(|| "{}".into())).map_err(err)?;
        Ok((root, v))
    }

    /// The code doc's id, as this process's branch sees the root; none before code is brought in.
    pub fn code_id(&self) -> Result<Option<String>> {
        Ok(self.root_json()?.1.get("code").and_then(Value::as_str).map(str::to_string))
    }

    fn code_id_or_new(&self) -> Result<String> {
        if let Some(id) = self.code_id()? {
            return Ok(id);
        }
        let id = self.new("code", "the host's code")?;
        let (root, mut v) = self.root_json()?;
        v["code"] = json!(id);
        self.set_text(&root, &serde_json::to_string_pretty(&v).map_err(err)?)?;
        Ok(id)
    }

    /// The code doc as this process's branch sees it.
    pub fn code(&self) -> Result<LoroDoc> {
        let id = self.code_id()?.ok_or("this store has no code yet: `theDB source import <repo>`")?;
        self.doc(&id)
    }

    /// The code doc as main has it, whatever branch this process is on; none before code is brought in.
    fn main_code(&self) -> Result<Option<LoroDoc>> {
        let Some(root) = self.root()? else { return Ok(None) };
        let Some(h) = self.head_on(None, &root)? else { return Ok(None) };
        let v: Value = serde_json::from_slice(&self.file_at(h)?).map_err(err)?;
        let Some(id) = v.get("code").and_then(Value::as_str) else { return Ok(None) };
        match self.head_on(None, id)? {
            Some(h) => Ok(Some(self.doc_at(h)?)),
            None => Ok(None),
        }
    }

    fn blob(&self, h: Hash) -> Result<Vec<u8>> {
        Ok(self.get(h)?.ok_or_else(|| format!("no blob {h}"))?.to_vec())
    }

    /// Changes the code on this process's branch with `change` (given the doc and its index), and commits once.
    fn change_code<T>(&self, change: impl FnOnce(&LoroDoc, &mut BTreeMap<String, (TreeID, bool)>) -> Result<T>) -> Result<T> {
        let id = self.code_id_or_new()?;
        let doc = self.edit(&id)?;
        let mut idx = index(&doc);
        let out = change(&doc, &mut idx)?;
        self.commit(&id, &doc)?;
        Ok(out)
    }

    /// Every file's path.
    pub fn files(&self) -> Result<Vec<String>> {
        if self.code_id()?.is_none() {
            return Ok(vec![]);
        }
        Ok(index(&self.code()?).into_iter().filter(|(_, (_, f))| *f).map(|(p, _)| p).collect())
    }

    /// The file at `path`, as bytes.
    pub fn file_bytes(&self, path: &str) -> Result<Vec<u8>> {
        let doc = self.code()?;
        let (node, file) = *index(&doc).get(path).ok_or_else(|| format!("no file {path}"))?;
        if !file {
            return Err(format!("{path} is a folder"));
        }
        node_bytes(&doc.get_tree(TREE), node, |h| self.blob(h))
    }

    /// The file at `path`, as text; a file that is not text is refused.
    pub fn file_text(&self, path: &str) -> Result<String> {
        String::from_utf8(self.file_bytes(path)?).map_err(|_| format!("{path} is not text"))
    }

    /// Keeps `text` as the file at `path`, on this process's branch: an edit of its text (only what changed), or a
    /// new file (and its folders).
    pub fn file_write(&self, path: &str, text: &str) -> Result<()> {
        self.change_code(|doc, idx| put_text(doc, idx, path, text)).map(|_| ())
    }

    /// Keeps `bytes` as the file at `path`: text as text, anything else as a blob the node names.
    pub fn file_write_bytes(&self, path: &str, bytes: &[u8]) -> Result<()> {
        match is_text(bytes) {
            Some(text) => self.file_write(path, text),
            None => {
                let blob = self.put(bytes.to_vec())?.to_hex().to_string();
                self.change_code(|doc, idx| {
                    let tree = doc.get_tree(TREE);
                    let (node, _) = ensure_file(&tree, idx, path)?;
                    let meta = tree.get_meta(node).map_err(err)?;
                    meta.delete("text").map_err(err)?;
                    meta.insert("blob", blob.as_str()).map_err(err)
                })
            }
        }
    }

    /// Replaces the one place `old` stands in the file at `path` with `new`; refused where `old` is not there once.
    pub fn file_edit(&self, path: &str, old: &str, new: &str) -> Result<()> {
        let text = self.file_text(path)?;
        match text.matches(old).count() {
            1 => self.file_write(path, &text.replacen(old, new, 1)),
            0 => Err(format!("`old` is not in {path}")),
            k => Err(format!("`old` is in {path} {k} times: give more of it")),
        }
    }

    /// Moves the file or folder at `from` to `to`: one op on its node, which keeps its identity and history (a
    /// folder takes everything in it along).
    pub fn file_move(&self, from: &str, to: &str) -> Result<()> {
        check_path(to)?;
        self.change_code(|doc, idx| {
            let tree = doc.get_tree(TREE);
            if idx.contains_key(to) {
                return Err(format!("{to} is there already"));
            }
            let (node, _) = *idx.get(from).ok_or_else(|| format!("no file or folder {from}"))?;
            let (dir, name) = split(to);
            if dir.is_some_and(|d| d == from || d.starts_with(&format!("{from}/"))) {
                return Err(format!("{from} cannot go inside itself"));
            }
            let parent = ensure_dir(&tree, idx, dir)?;
            if tree.parent(node) != Some(parent) {
                tree.mov(node, parent).map_err(err)?;
            }
            tree.get_meta(node).map_err(err)?.insert("name", name).map_err(err)
        })
    }

    /// Takes the file or folder at `path` out (its history stays in the doc).
    pub fn file_delete(&self, path: &str) -> Result<()> {
        self.change_code(|doc, idx| {
            let (node, _) = *idx.get(path).ok_or_else(|| format!("no file or folder {path}"))?;
            doc.get_tree(TREE).delete(node).map_err(err)
        })
    }

    /// The lines that hold `needle`, in every text file: path, line number (from 1), the line; at most `max`.
    pub fn file_search(&self, needle: &str, max: usize) -> Result<Vec<(String, usize, String)>> {
        let doc = self.code()?;
        let tree = doc.get_tree(TREE);
        let mut out = Vec::new();
        for (path, (node, file)) in index(&doc) {
            let Some(text) = node_text(&tree, node).filter(|_| file) else { continue };
            for (i, line) in text.to_string().lines().enumerate() {
                if line.contains(needle) {
                    out.push((path.clone(), i + 1, line.to_string()));
                    if out.len() >= max {
                        return Ok(out);
                    }
                }
            }
        }
        Ok(out)
    }

    /// Brings the files of the git checkout `repo` under `under` (`App`), as its HEAD has them, into this process's
    /// branch, in one commit: changed files as edits, new ones made, ones git no longer has taken out. The checkout
    /// must be clean there. Returns how many files changed.
    pub fn source_import(&self, repo: &Path, under: &str) -> Result<usize> {
        if !git(repo, &["status", "--porcelain", "--", under], None, &[])?.is_empty() {
            return Err(format!("{under}/ has changes not committed: code is brought in from a commit"));
        }
        let paths: BTreeSet<String> = git(repo, &["ls-files", "--", under], None, &[])?.lines().map(str::to_string).collect();
        let mut blobs = BTreeMap::new();
        let mut texts = BTreeMap::new();
        for path in &paths {
            let bytes = std::fs::read(repo.join(path)).map_err(|e| format!("{path}: {e}"))?;
            match is_text(&bytes) {
                Some(t) => _ = texts.insert(path.clone(), t.to_string()),
                None => _ = blobs.insert(path.clone(), self.put(bytes)?.to_hex().to_string()),
            }
        }
        self.change_code(|doc, idx| {
            let tree = doc.get_tree(TREE);
            let mut changed = 0;
            for (path, text) in &texts {
                changed += usize::from(put_text(doc, idx, path, text)?);
            }
            for (path, blob) in &blobs {
                let (node, made) = ensure_file(&tree, idx, path)?;
                let meta = tree.get_meta(node).map_err(err)?;
                if made || meta_str(&tree, node, "blob").as_deref() != Some(blob) {
                    meta.delete("text").map_err(err)?;
                    meta.insert("blob", blob.as_str()).map_err(err)?;
                    changed += 1;
                }
            }
            let prefix = format!("{under}/");
            for (path, (node, file)) in idx.clone() {
                if file && path.starts_with(&prefix) && !paths.contains(&path) {
                    tree.delete(node).map_err(err)?;
                    changed += 1;
                }
            }
            Ok(changed)
        })
    }

    /// Brings the code of the git checkout `repo` (`App/`, at its HEAD, clean) into theDB: onto a branch of its own,
    /// `source-<commit>`, proposed as an intent for the owner to accept. Returns the intent and how many files changed.
    pub fn import_code(&mut self, repo: &Path) -> Result<(String, usize)> {
        let commit = git(repo, &["rev-parse", "HEAD"], None, &[])?;
        let branch = format!("source-{}", &commit[..12.min(commit.len())]);
        self.make_branch(&branch, &format!("the code of git commit {commit}"))?;
        let was = self.branch().map(str::to_string);
        self.set_branch(Some(&branch))?;
        let n = self.source_import(repo, "App");
        self.set_branch(was.as_deref())?;
        let n = n?;
        let subject: String = git(repo, &["log", "-1", "--format=%s"], None, &[])?.chars().take(120).collect();
        let id = self.propose(&branch, &format!("Code from git commit {}: {subject}", &commit[..8.min(commit.len())]))?;
        self.sync()?;
        Ok((id, n))
    }

    /// Every file of `doc` with its bytes, by path.
    fn all_files(&self, doc: &LoroDoc) -> Result<BTreeMap<String, Vec<u8>>> {
        let tree = doc.get_tree(TREE);
        let mut out = BTreeMap::new();
        for (path, (node, file)) in index(doc) {
            if file {
                out.insert(path, node_bytes(&tree, node, |h| self.blob(h))?);
            }
        }
        Ok(out)
    }

    /// Writes this process's branch's code into `dir`: each file only where it differs, read only (but `Cargo.lock`,
    /// which `cargo` may bring up to date), and what the code no longer has removed.
    pub fn project(&self, dir: &Path) -> Result<Projected> {
        let files = self.all_files(&self.code()?)?;
        let mut manifest = String::new();
        let mut want = BTreeSet::new();
        let mut written = 0;
        for (path, bytes) in &files {
            check_path(path)?;
            manifest.push_str(&format!("{path}\0{}\n", Hash::new(bytes).to_hex()));
            let at = dir.join(path);
            if std::fs::read(&at).ok().as_deref() != Some(bytes.as_slice()) {
                if let Some(parent) = at.parent() {
                    std::fs::create_dir_all(parent).map_err(err)?;
                }
                writable(&at, true);
                std::fs::write(&at, bytes).map_err(|e| format!("{path}: {e}"))?;
                written += 1;
            }
            writable(&at, path.ends_with("Cargo.lock"));
            want.insert(at);
        }
        let mut removed = 0;
        let mut todo = vec![dir.to_path_buf()];
        while let Some(d) = todo.pop() {
            for e in std::fs::read_dir(&d).map_err(err)?.flatten() {
                let p = e.path();
                if p.is_dir() {
                    todo.push(p);
                } else if !want.contains(&p) {
                    writable(&p, true);
                    std::fs::remove_file(&p).map_err(err)?;
                    removed += 1;
                }
            }
        }
        Ok(Projected { hash: Hash::new(manifest.as_bytes()), files: files.len(), written, removed })
    }

    // ---- the builder: one build at a time, for every line ----

    fn build_dir(&self) -> PathBuf {
        self.dir().join("build")
    }

    /// Starts building this process's branch's code: its tree written to `build/src`, then `cargo build` of its
    /// workspace in the background, into `build/target`. Refused while another build runs. Returns its state, as
    /// `build_status` gives it.
    pub fn build_start(&self) -> Result<Value> {
        let dir = self.build_dir();
        std::fs::create_dir_all(&dir).map_err(err)?;
        if let Some(run) = self.build_run()?
            && run.get("state").and_then(Value::as_str) == Some("running")
        {
            return Err(format!("the builder is busy: building {} since {}s ago; ask again", run["line"].as_str().unwrap_or("?"), run["seconds"]));
        }
        let projected = self.project(&dir.join("src"))?;
        let manifest = ["src", "App", "Cargo.toml"].iter().collect::<PathBuf>();
        let log = std::fs::File::create(dir.join("log")).map_err(err)?;
        let _ = std::fs::remove_file(dir.join("exit"));
        let mut child = std::process::Command::new("cargo")
            .args(["build", "--workspace", "--message-format=short", "--manifest-path"])
            .arg(&manifest)
            .current_dir(&dir)
            .env("CARGO_TARGET_DIR", dir.join("target"))
            .stdin(std::process::Stdio::null())
            .stdout(log.try_clone().map_err(err)?)
            .stderr(log)
            .spawn()
            .map_err(err)?;
        let line = self.branch().unwrap_or(crate::MAIN).to_string();
        std::fs::write(dir.join("run.json"), serde_json::to_vec_pretty(&json!({ "line": line, "tree": projected.hash.to_hex().to_string(), "pid": child.id(), "started": crate::now() })).map_err(err)?).map_err(err)?;
        let exit = dir.join("exit");
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
            let _ = std::fs::write(exit, code.to_string());
        });
        self.build_status()
    }

    fn build_run(&self) -> Result<Option<Value>> {
        let dir = self.build_dir();
        let Ok(run) = std::fs::read(dir.join("run.json")) else { return Ok(None) };
        let mut run: Value = serde_json::from_slice(&run).map_err(err)?;
        let started = run["started"].as_u64().unwrap_or(0);
        run["seconds"] = json!(crate::now().saturating_sub(started));
        let exit = std::fs::read_to_string(dir.join("exit")).ok().and_then(|e| e.trim().parse::<i32>().ok());
        let alive = run["pid"].as_u64().is_some_and(|p| std::process::Command::new("kill").args(["-0", &p.to_string()]).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success()));
        run["state"] = json!(match exit {
            Some(0) => "ok",
            Some(_) => "failed",
            None if alive => "running",
            None => "stopped",
        });
        Ok(Some(run))
    }

    /// The last build: its line, its tree's hash, its state (`running`, `ok`, `failed`, or `stopped` when its process
    /// ended without a word), how long, and its errors (each with what cargo said after it), or the log's last lines
    /// while it runs. A finished build that brought `Cargo.lock` up to date gives it back to its line.
    pub fn build_status(&self) -> Result<Value> {
        let Some(mut run) = self.build_run()? else { return Ok(json!({ "state": "none" })) };
        let log = std::fs::read_to_string(self.build_dir().join("log")).unwrap_or_default();
        let lines: Vec<&str> = log.lines().collect();
        if run["state"] == "running" {
            run["last"] = json!(lines.iter().rev().take(5).rev().collect::<Vec<_>>());
            return Ok(run);
        }
        // cargo's short lines: `src/days.rs:2:5: error[E0308]: ...`, a path from App/; given back as the tree's path
        let in_tree = |l: &str| match l.split_once(": ") {
            Some((at, rest)) if at.contains(".rs:") && !at.contains(' ') => format!("App/{at}: {rest}"),
            _ => l.to_string(),
        };
        let is = |l: &str, what: &str| l.starts_with(what) || l.split_once(": ").is_some_and(|(at, rest)| at.contains(".rs:") && rest.starts_with(what));
        let errors: Vec<String> = lines.iter().filter(|l| is(l, "error") && !l.starts_with("error: could not compile")).take(30).map(|l| in_tree(l)).collect();
        run["errors"] = json!(errors);
        run["warnings"] = json!(lines.iter().filter(|l| is(l, "warning") && l.contains(".rs:")).count());
        if run["state"] == "ok"
            && run["line"].as_str() == Some(self.branch().unwrap_or(crate::MAIN))
            && let Ok(lock) = std::fs::read_to_string(self.build_dir().join("src").join("App").join("Cargo.lock"))
            && self.file_text("App/Cargo.lock").is_ok_and(|kept| kept != lock)
        {
            self.file_write("App/Cargo.lock", &lock)?;
            run["lock"] = json!("Cargo.lock brought up to date on this line");
        }
        Ok(run)
    }

    /// Builds this process's branch's code as the host (engine `engine`) and proposes it, with no git: the tree written
    /// out and built where every build is (`build/`), now, not in the background; the binary and every file kept as
    /// blobs, the manifest naming the tree's hash and the line; the engine's new pin on the branch `build-<tree>`,
    /// proposed as an intent for the owner. Refused while another build runs. Returns the build's hash and the intent.
    pub fn publish_tree(&self, engine: &str) -> Result<(Hash, String)> {
        let dir = self.build_dir();
        std::fs::create_dir_all(&dir).map_err(err)?;
        if let Some(run) = self.build_run()?
            && run["state"] == "running"
        {
            return Err(format!("the builder is busy: building {}; ask again", run["line"].as_str().unwrap_or("?")));
        }
        let line = self.branch().unwrap_or(crate::MAIN).to_string();
        let projected = self.project(&dir.join("src"))?;
        let built = std::process::Command::new("cargo")
            .args(["build", "--workspace", "--message-format=json-render-diagnostics", "--manifest-path"])
            .arg(["src", "App", "Cargo.toml"].iter().collect::<PathBuf>())
            .current_dir(&dir)
            .env("CARGO_TARGET_DIR", dir.join("target"))
            .stderr(std::process::Stdio::inherit())
            .output()
            .map_err(err)?;
        if !built.status.success() {
            return Err(format!("the build of {line} failed"));
        }
        let swept = crate::build::sweep(&dir.join("target").join("debug"), &String::from_utf8_lossy(&built.stdout))?;
        eprintln!("thedb: the build folder swept: {} files and folders of earlier builds, {:.1} GB", swept.0, swept.1 as f64 / 1e9);
        let mut files = BTreeMap::new();
        for (path, bytes) in self.all_files(&self.code()?)? {
            files.insert(path, self.put(bytes)?.to_hex().to_string());
        }
        let tree = projected.hash.to_hex().to_string();
        let manifest = json!({ "tree": tree, "line": line, "files": files });
        let binary = std::fs::read(dir.join("target").join("debug").join("theos")).map_err(|e| format!("the host's binary: {e}"))?;
        let toolchain = std::process::Command::new("rustc").arg("-V").output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        let branch = format!("build-{}", &tree[..12]);
        self.make_branch(&branch, &format!("the host built from the code of {line}, tree {tree}"))?;
        let hash = self.publish_on(Some(&branch), engine, &binary, &serde_json::to_vec_pretty(&manifest).map_err(err)?, &toolchain)?;
        let intent = self.propose(&branch, &format!("Host build {} from the code of {line}", &hash.to_hex()[..12]))?;
        self.sync()?;
        Ok((hash, intent))
    }

    // ---- git, as an archive ----

    /// The repository the store lives in (its folder's parent), if it is one.
    pub fn archive_repo(&self) -> Option<PathBuf> {
        let repo = self.dir().parent()?.to_path_buf();
        repo.join(".git").exists().then_some(repo)
    }

    /// Commits main's tree onto `refs/heads/archive` of `repo`, with `message`; through a scratch index, so no working
    /// tree, index or branch of anyone's is touched. Returns the commit, or `None` without code.
    pub fn archive_code(&self, repo: &Path, message: &str) -> Result<Option<String>> {
        let Some(code) = self.main_code()? else { return Ok(None) };
        let index = std::env::temp_dir().join(format!("thedb-archive-{}.index", std::process::id()));
        let _ = std::fs::remove_file(&index);
        let env: [(&str, &Path); 1] = [("GIT_INDEX_FILE", &index)];
        let mut info = String::new();
        for (path, bytes) in self.all_files(&code)? {
            let blob = git(repo, &["hash-object", "-w", "--stdin"], Some(&bytes), &env)?;
            info.push_str(&format!("100644 {blob}\t{path}\n"));
        }
        git(repo, &["update-index", "--add", "--index-info"], Some(info.as_bytes()), &env)?;
        let tree_hash = git(repo, &["write-tree"], None, &env)?;
        let _ = std::fs::remove_file(&index);
        let parent = git(repo, &["rev-parse", "--verify", "-q", "refs/heads/archive"], None, &[]).ok();
        // made by theDB, as theDB: a snapshot, not anyone's commit
        let mut args = vec!["-c", "user.name=theDB", "-c", "user.email=thedb@theos.invalid", "commit-tree", tree_hash.as_str(), "-m", message];
        if let Some(p) = &parent {
            args.extend(["-p", p.as_str()]);
        }
        let commit = git(repo, &args, None, &[])?;
        git(repo, &["update-ref", "refs/heads/archive", &commit], None, &[])?;
        Ok(Some(commit))
    }
}
