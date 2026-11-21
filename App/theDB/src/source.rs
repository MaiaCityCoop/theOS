//! Code as docs (intent 0059, step 1d). Every source file is a doc of kind `source`: its text a Loro text, so every
//! edit is an op with its writer, merged like any doc; a file that is not text (an icon) is a blob the doc names. The
//! tree is a doc of kind `tree` (the root names it as `source`) whose map `files` maps each path to its file's doc: a
//! rename changes a path, and the file keeps its doc, its identity and its history. A line changes code as it changes
//! anything, by its own versions of these docs, merged into main when its owner accepts the intent.
//!
//! Nothing is edited in a folder. The builder writes a projection of a line's tree for `cargo` (`project`): read
//! only, rewriting only what changed, at one place for every line (`build/src` in the store), with one target
//! (`build/target`), one build at a time (`build_start`, `build_status`); a tree is never built from scratch twice.
//! Git is an archive: before each merge that brings code, main's tree is committed onto `refs/heads/archive` of the
//! repository the store lives in, without touching any working tree or index (`archive_code`).

use crate::{Hash, Result, TheDB, err};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// The tree: its doc, and each path's file doc.
#[derive(Clone, Debug, Default)]
pub struct Tree {
    pub id: String,
    pub files: BTreeMap<String, String>,
}

/// What a projection wrote.
#[derive(Clone, Debug)]
pub struct Projected {
    /// The tree's hash: every path with its content's hash.
    pub hash: Hash,
    pub files: usize,
    pub written: usize,
    pub removed: usize,
}

/// A path in the tree: relative, `/` between its parts, none of them empty, `.` or `..`.
fn check_path(path: &str) -> Result<()> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.split('/').any(|p| p.is_empty() || p == "." || p == "..") {
        return Err(format!("not a path in the tree: {path:?}"));
    }
    Ok(())
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

    /// The tree the root names (`source`), as this process's branch sees it; none before code is imported.
    pub fn source_tree(&self) -> Result<Option<Tree>> {
        let (_, root) = self.root_json()?;
        let Some(id) = root.get("source").and_then(Value::as_str) else { return Ok(None) };
        let v: Value = serde_json::from_str(&self.text(id)?.unwrap_or_else(|| "{}".into())).map_err(err)?;
        let files = v.get("files").and_then(Value::as_object).map(|m| m.iter().filter_map(|(p, d)| Some((p.clone(), d.as_str()?.to_string()))).collect()).unwrap_or_default();
        Ok(Some(Tree { id: id.to_string(), files }))
    }

    /// The tree as main has it, whatever branch this process is on.
    fn main_tree(&self) -> Result<Option<Tree>> {
        let Some(root) = self.root()? else { return Ok(None) };
        let read = |id: &str| -> Result<Value> {
            match self.head_on(None, id)? {
                Some(h) => serde_json::from_slice(&self.file_at(h)?).map_err(err),
                None => Ok(json!({})),
            }
        };
        let Some(id) = read(&root)?.get("source").and_then(Value::as_str).map(str::to_string) else { return Ok(None) };
        let v = read(&id)?;
        let files = v.get("files").and_then(Value::as_object).map(|m| m.iter().filter_map(|(p, d)| Some((p.clone(), d.as_str()?.to_string()))).collect()).unwrap_or_default();
        Ok(Some(Tree { id, files }))
    }

    fn tree_or_new(&self) -> Result<Tree> {
        if let Some(t) = self.source_tree()? {
            return Ok(t);
        }
        let id = self.new("tree", "the host's source")?;
        let (root, mut v) = self.root_json()?;
        v["source"] = json!(id);
        self.set_text(&root, &serde_json::to_string_pretty(&v).map_err(err)?)?;
        Ok(Tree { id, files: BTreeMap::new() })
    }

    fn save_tree(&self, t: &Tree) -> Result<()> {
        self.set_text(&t.id, &serde_json::to_string_pretty(&json!({ "files": t.files })).map_err(err)?).map(|_| ())
    }

    fn tree_has(&self) -> Result<Tree> {
        self.source_tree()?.ok_or_else(|| "this store has no code yet: `theDB source import <repo>`".to_string())
    }

    /// Every path in the tree.
    pub fn files(&self) -> Result<Vec<String>> {
        Ok(self.source_tree()?.map(|t| t.files.into_keys().collect()).unwrap_or_default())
    }

    fn file_doc(&self, path: &str) -> Result<String> {
        self.tree_has()?.files.get(path).cloned().ok_or_else(|| format!("no file {path}"))
    }

    /// The file at `path`, as bytes.
    pub fn file_bytes(&self, path: &str) -> Result<Vec<u8>> {
        self.file(&self.file_doc(path)?)?.ok_or_else(|| format!("the file {path} has no version"))
    }

    /// The file at `path`, as text; a file that is not text is refused.
    pub fn file_text(&self, path: &str) -> Result<String> {
        String::from_utf8(self.file_bytes(path)?).map_err(|_| format!("{path} is not text"))
    }

    /// Keeps `text` as the file at `path`, on this process's branch: an edit of the file's text (only what changed), or
    /// a new file. Returns the version's hash (unchanged: the version it has).
    pub fn file_write(&self, path: &str, text: &str) -> Result<Hash> {
        check_path(path)?;
        let mut tree = self.tree_or_new()?;
        let id = match tree.files.get(path) {
            Some(id) => id.clone(),
            None => {
                let id = self.new("source", path)?;
                tree.files.insert(path.to_string(), id.clone());
                self.save_tree(&tree)?;
                id
            }
        };
        let doc = self.edit(&id)?;
        let t = doc.get_text("text");
        if t.to_string() == text
            && let Some(h) = self.head(&id)?
        {
            return Ok(h);
        }
        // never read as JSON: a source file stays text, whatever it looks like
        t.update(text, Default::default()).map_err(err)?;
        self.commit(&id, &doc)
    }

    /// Keeps `bytes` as the file at `path`: text as text, anything else as a blob.
    pub fn file_write_bytes(&self, path: &str, bytes: &[u8]) -> Result<Hash> {
        match std::str::from_utf8(bytes) {
            Ok(text) if !text.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t')) => self.file_write(path, text),
            _ => {
                check_path(path)?;
                let mut tree = self.tree_or_new()?;
                let id = match tree.files.get(path) {
                    Some(id) => id.clone(),
                    None => {
                        let id = self.new("source", path)?;
                        tree.files.insert(path.to_string(), id.clone());
                        self.save_tree(&tree)?;
                        id
                    }
                };
                self.set_file(&id, bytes)
            }
        }
    }

    /// Replaces the one place `old` stands in the file at `path` with `new`; refused where `old` is not there once.
    pub fn file_edit(&self, path: &str, old: &str, new: &str) -> Result<Hash> {
        let text = self.file_text(path)?;
        match text.matches(old).count() {
            1 => self.file_write(path, &text.replacen(old, new, 1)),
            0 => Err(format!("`old` is not in {path}")),
            k => Err(format!("`old` is in {path} {k} times: give more of it")),
        }
    }

    /// Moves the file at `from` to `to`: the same doc, under a new path.
    pub fn file_move(&self, from: &str, to: &str) -> Result<()> {
        check_path(to)?;
        let mut tree = self.tree_has()?;
        if tree.files.contains_key(to) {
            return Err(format!("{to} is there already"));
        }
        let id = tree.files.remove(from).ok_or_else(|| format!("no file {from}"))?;
        tree.files.insert(to.to_string(), id);
        self.save_tree(&tree)
    }

    /// Takes the file at `path` out of the tree (its doc and history stay).
    pub fn file_delete(&self, path: &str) -> Result<()> {
        let mut tree = self.tree_has()?;
        tree.files.remove(path).ok_or_else(|| format!("no file {path}"))?;
        self.save_tree(&tree)
    }

    /// The lines that hold `needle`, in every text file: path, line number (from 1), the line; at most `max`.
    pub fn file_search(&self, needle: &str, max: usize) -> Result<Vec<(String, usize, String)>> {
        let mut out = Vec::new();
        for (path, id) in self.tree_has()?.files {
            let Some(bytes) = self.file(&id)? else { continue };
            let Ok(text) = String::from_utf8(bytes) else { continue };
            for (i, line) in text.lines().enumerate() {
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
    /// branch: changed files as edits, new ones made, ones git no longer has taken out of the tree. The checkout must be
    /// clean there. Returns how many files changed.
    pub fn source_import(&self, repo: &Path, under: &str) -> Result<usize> {
        if !git(repo, &["status", "--porcelain", "--", under], None, &[])?.is_empty() {
            return Err(format!("{under}/ has changes not committed: code is brought in from a commit"));
        }
        let paths: BTreeSet<String> = git(repo, &["ls-files", "--", under], None, &[])?.lines().map(str::to_string).collect();
        let mut changed = 0;
        for path in &paths {
            let bytes = std::fs::read(repo.join(path)).map_err(|e| format!("{path}: {e}"))?;
            let before = self.source_tree()?.and_then(|t| t.files.get(path).cloned()).and_then(|id| self.head(&id).ok().flatten());
            let after = self.file_write_bytes(path, &bytes)?;
            changed += usize::from(before != Some(after));
        }
        let gone: Vec<String> = self.files()?.into_iter().filter(|p| p.starts_with(&format!("{under}/")) && !paths.contains(p)).collect();
        for p in &gone {
            self.file_delete(p)?;
        }
        Ok(changed + gone.len())
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

    /// Writes this process's branch's tree into `dir`: each file only where it differs, read only (but `Cargo.lock`,
    /// which `cargo` may bring up to date), and what the tree no longer has removed.
    pub fn project(&self, dir: &Path) -> Result<Projected> {
        let tree = self.tree_has()?;
        let mut manifest = String::new();
        let mut want = BTreeSet::new();
        let mut written = 0;
        for (path, id) in &tree.files {
            check_path(path)?;
            let bytes = self.file(id)?.unwrap_or_default();
            manifest.push_str(&format!("{path}\0{}\n", Hash::new(&bytes).to_hex()));
            let at = dir.join(path);
            if std::fs::read(&at).ok().as_deref() != Some(bytes.as_slice()) {
                if let Some(parent) = at.parent() {
                    std::fs::create_dir_all(parent).map_err(err)?;
                }
                writable(&at, true);
                std::fs::write(&at, &bytes).map_err(|e| format!("{path}: {e}"))?;
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
        Ok(Projected { hash: Hash::new(manifest.as_bytes()), files: tree.files.len(), written, removed })
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
        for (path, id) in self.tree_has()?.files {
            files.insert(path, self.put(self.file(&id)?.unwrap_or_default())?.to_hex().to_string());
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
        let Some(tree) = self.main_tree()? else { return Ok(None) };
        let index = std::env::temp_dir().join(format!("thedb-archive-{}.index", std::process::id()));
        let _ = std::fs::remove_file(&index);
        let env: [(&str, &Path); 1] = [("GIT_INDEX_FILE", &index)];
        let mut info = String::new();
        for (path, id) in &tree.files {
            let bytes = match self.head_on(None, id)? {
                Some(h) => self.file_at(h)?,
                None => Vec::new(),
            };
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
