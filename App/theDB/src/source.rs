//! Code, flat and content-addressed (intent 0059, step 1d). A file's content is a blob, addressed by its BLAKE3
//! hash: kept once however many versions and lines share it, served by iroh as it is, checked by its hash. Which
//! files the host's code has is one small Loro doc of kind `code` (the root names it as `code`): its map `files` holds
//! an entry for every file, keyed by the file's own id, with its `path` and its `blob`. Nothing else: no folders (a
//! path is a name the compiler needs, not a place), no doc per file, no text CRDT for code.
//!
//! So a rename is one field and an edit another: made on two sides at once, both are kept. An edit replaces the
//! file's blob as a whole: when main and a line both changed one file, the merge does not pick a winner silently, it
//! is a conflict, shown by path (Loro's own advice: a CRDT merges, it does not reject, and code merged without a look
//! can be wrong). One version of the `code` doc is one state of all the code, and its hash is cheap: the doc is a list
//! of names and hashes, not the code.
//!
//! Nothing is edited in a folder. The builder writes a projection of a line's code for `cargo` (`project`): read
//! only, rewriting only what changed, at one place for every line (`build/src` in the store), with one target
//! (`build/target`), one build at a time (`build_start`, `build_status`). Git is an archive: before each merge that
//! brings code, main's code is committed onto `refs/heads/archive` of the repository the store lives in, without
//! touching any working tree or index (`archive_code`).

use crate::{Hash, Result, TheDB, err};
use loro::{Container, LoroDoc, LoroMap, ValueOrContainer};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// The map in a code doc: file id → its entry (`path`, `blob`).
pub(crate) const FILES: &str = "files";

/// What a projection wrote.
#[derive(Clone, Debug)]
pub struct Projected {
    /// The code's hash: every path with its blob's hash.
    pub hash: Hash,
    pub files: usize,
    pub written: usize,
    pub removed: usize,
}

/// One file of a code doc: its id, path and blob.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Entry {
    pub id: String,
    pub path: String,
    pub blob: String,
}

/// A path: relative, `/` between its parts, none of them empty, `.` or `..`.
fn check_path(path: &str) -> Result<()> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.split('/').any(|p| p.is_empty() || p == "." || p == "..") {
        return Err(format!("not a path: {path:?}"));
    }
    Ok(())
}

fn text_of(map: &LoroMap, key: &str) -> Option<String> {
    map.get(key)?.into_value().ok()?.into_string().ok().map(|s| s.to_string())
}

/// Every file of a code doc. After a merge two entries can share a path (both sides made it): both are here.
pub(crate) fn entries(doc: &LoroDoc) -> Vec<Entry> {
    let files = doc.get_map(FILES);
    let mut out: Vec<Entry> = files
        .keys()
        .filter_map(|id| {
            let ValueOrContainer::Container(Container::Map(m)) = files.get(&id)? else { return None };
            Some(Entry { id: id.to_string(), path: text_of(&m, "path")?, blob: text_of(&m, "blob")? })
        })
        .collect();
    out.sort_by(|a, b| (&a.path, &a.id).cmp(&(&b.path, &b.id)));
    out
}

/// Every file by its path.
fn by_path(doc: &LoroDoc) -> BTreeMap<String, Entry> {
    entries(doc).into_iter().map(|e| (e.path.clone(), e)).collect()
}

/// Sets a file's entry, changing only the fields that differ.
fn set_entry(doc: &LoroDoc, id: &str, path: &str, blob: &str) -> Result<()> {
    let m = doc.get_map(FILES).ensure_mergeable_map(id).map_err(err)?;
    for (k, v) in [("path", path), ("blob", blob)] {
        if text_of(&m, k).as_deref() != Some(v) {
            m.insert(k, v).map_err(err)?;
        }
    }
    Ok(())
}

/// The files at `path`, or under it as a folder's name: what a move or a delete of `path` takes.
fn under<'a>(files: &'a BTreeMap<String, Entry>, path: &str) -> Vec<&'a Entry> {
    let prefix = format!("{path}/");
    files.values().filter(|e| e.path == path || e.path.starts_with(&prefix)).collect()
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

    fn blob_bytes(&self, hash: &str) -> Result<Vec<u8>> {
        let h: Hash = hash.parse().map_err(err)?;
        Ok(self.get(h)?.ok_or_else(|| format!("no blob {h}"))?.to_vec())
    }

    /// Changes the code on this process's branch with `change`, given the doc and its files by path, and commits once.
    fn change_code<T>(&self, change: impl FnOnce(&LoroDoc, &BTreeMap<String, Entry>) -> Result<T>) -> Result<T> {
        let id = self.code_id_or_new()?;
        let doc = self.edit(&id)?;
        let files = by_path(&doc);
        let out = change(&doc, &files)?;
        self.commit(&id, &doc)?;
        Ok(out)
    }

    /// Every file's path.
    pub fn files(&self) -> Result<Vec<String>> {
        if self.code_id()?.is_none() {
            return Ok(vec![]);
        }
        Ok(entries(&self.code()?).into_iter().map(|e| e.path).collect())
    }

    /// The file at `path`, as bytes: its blob.
    pub fn file_bytes(&self, path: &str) -> Result<Vec<u8>> {
        let e = by_path(&self.code()?).remove(path).ok_or_else(|| format!("no file {path}"))?;
        self.blob_bytes(&e.blob)
    }

    /// The file at `path`, as text; a file that is not text is refused.
    pub fn file_text(&self, path: &str) -> Result<String> {
        String::from_utf8(self.file_bytes(path)?).map_err(|_| format!("{path} is not text"))
    }

    /// Keeps `bytes` as the file at `path`, on this process's branch: its blob, under the file's id (a new path, a new
    /// file).
    pub fn file_write_bytes(&self, path: &str, bytes: &[u8]) -> Result<()> {
        check_path(path)?;
        let blob = self.put(bytes.to_vec())?.to_hex().to_string();
        self.change_code(|doc, files| {
            if !under(files, path).iter().all(|e| e.path == path) {
                return Err(format!("{path} is a folder's name"));
            }
            let id = files.get(path).map(|e| e.id.clone()).unwrap_or_else(crate::new_id);
            set_entry(doc, &id, path, &blob)
        })
    }

    /// Keeps `text` as the file at `path`.
    pub fn file_write(&self, path: &str, text: &str) -> Result<()> {
        self.file_write_bytes(path, text.as_bytes())
    }

    /// Replaces the one place `old` stands in the file at `path` with `new`, in the file as this branch has it at the
    /// moment of the change; refused where `old` is not there once.
    pub fn file_edit(&self, path: &str, old: &str, new: &str) -> Result<()> {
        let id = self.code_id()?.ok_or("this store has no code yet")?;
        let doc = self.edit(&id)?;
        let e = by_path(&doc).remove(path).ok_or_else(|| format!("no file {path}"))?;
        let text = String::from_utf8(self.blob_bytes(&e.blob)?).map_err(|_| format!("{path} is not text"))?;
        let edited = match text.matches(old).count() {
            1 => text.replacen(old, new, 1),
            0 => return Err(format!("`old` is not in {path}")),
            k => return Err(format!("`old` is in {path} {k} times: give more of it")),
        };
        let blob = self.put(edited.into_bytes())?.to_hex().to_string();
        set_entry(&doc, &e.id, path, &blob)?;
        self.commit(&id, &doc).map(|_| ())
    }

    /// Moves the file at `from`, or every file under `from` as a folder's name, to `to`: their entries keep their ids,
    /// only their paths change, so an edit made meanwhile elsewhere goes with them.
    pub fn file_move(&self, from: &str, to: &str) -> Result<()> {
        check_path(to)?;
        self.change_code(|doc, files| {
            let moving = under(files, from);
            if moving.is_empty() {
                return Err(format!("no file or folder {from}"));
            }
            if to.starts_with(&format!("{from}/")) {
                return Err(format!("{from} cannot go inside itself"));
            }
            for e in &moving {
                let path = format!("{to}{}", &e.path[from.len()..]);
                if files.get(&path).is_some_and(|x| !moving.iter().any(|m| m.id == x.id)) {
                    return Err(format!("{path} is there already"));
                }
                set_entry(doc, &e.id, &path, &e.blob)?;
            }
            Ok(())
        })
    }

    /// Takes the file at `path`, or every file under it as a folder's name, out (their blobs stay, and the doc's
    /// history names them).
    pub fn file_delete(&self, path: &str) -> Result<()> {
        self.change_code(|doc, files| {
            let gone = under(files, path);
            if gone.is_empty() {
                return Err(format!("no file or folder {path}"));
            }
            for e in gone {
                doc.get_map(FILES).delete(&e.id).map_err(err)?;
            }
            Ok(())
        })
    }

    /// The lines that hold `needle`, in every text file: path, line number (from 1), the line; at most `max`.
    pub fn file_search(&self, needle: &str, max: usize) -> Result<Vec<(String, usize, String)>> {
        let mut out = Vec::new();
        for e in entries(&self.code()?) {
            let Ok(text) = String::from_utf8(self.blob_bytes(&e.blob)?) else { continue };
            for (i, line) in text.lines().enumerate() {
                if line.contains(needle) {
                    out.push((e.path.clone(), i + 1, line.to_string()));
                    if out.len() >= max {
                        return Ok(out);
                    }
                }
            }
        }
        Ok(out)
    }

    /// Brings the files of the git checkout `repo` under `under` (`App`), as its HEAD has them, into this process's
    /// branch, in one commit: every file's content a blob, an entry for each; files git no longer has taken out. The
    /// checkout must be clean there. Returns how many files changed.
    pub fn source_import(&self, repo: &Path, under_dir: &str) -> Result<usize> {
        if !git(repo, &["status", "--porcelain", "--", under_dir], None, &[])?.is_empty() {
            return Err(format!("{under_dir}/ has changes not committed: code is brought in from a commit"));
        }
        let paths: BTreeSet<String> = git(repo, &["ls-files", "--", under_dir], None, &[])?.lines().map(str::to_string).collect();
        let mut blobs = BTreeMap::new();
        for path in &paths {
            check_path(path)?;
            let bytes = std::fs::read(repo.join(path)).map_err(|e| format!("{path}: {e}"))?;
            blobs.insert(path.clone(), self.put(bytes)?.to_hex().to_string());
        }
        self.change_code(|doc, files| {
            let mut changed = 0;
            for (path, blob) in &blobs {
                let id = files.get(path).map(|e| e.id.clone()).unwrap_or_else(crate::new_id);
                changed += usize::from(files.get(path).map(|e| &e.blob) != Some(blob));
                set_entry(doc, &id, path, blob)?;
            }
            let prefix = format!("{under_dir}/");
            for e in files.values() {
                if e.path.starts_with(&prefix) && !paths.contains(&e.path) {
                    doc.get_map(FILES).delete(&e.id).map_err(err)?;
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
        entries(doc).into_iter().map(|e| Ok((e.path, self.blob_bytes(&e.blob)?))).collect()
    }

    /// Writes this process's branch's code into `dir`: each file only where it differs, read only (but `Cargo.lock`,
    /// which `cargo` may bring up to date), and what the code no longer has removed.
    pub fn project(&self, dir: &Path) -> Result<Projected> {
        let files = entries(&self.code()?);
        let mut manifest = String::new();
        let mut want = BTreeSet::new();
        let mut written = 0;
        for e in &files {
            check_path(&e.path)?;
            manifest.push_str(&format!("{}\0{}\n", e.path, e.blob));
            let at = dir.join(&e.path);
            let differs = std::fs::read(&at).ok().is_none_or(|have| Hash::new(&have).to_hex().to_string() != e.blob);
            if differs {
                if let Some(parent) = at.parent() {
                    std::fs::create_dir_all(parent).map_err(err)?;
                }
                writable(&at, true);
                std::fs::write(&at, self.blob_bytes(&e.blob)?).map_err(|x| format!("{}: {x}", e.path))?;
                written += 1;
            }
            writable(&at, e.path.ends_with("Cargo.lock"));
            want.insert(at);
        }
        let mut removed = 0;
        let mut todo = vec![dir.to_path_buf()];
        while let Some(d) = todo.pop() {
            for x in std::fs::read_dir(&d).map_err(err)?.flatten() {
                let p = x.path();
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
        let files: BTreeMap<String, String> = entries(&self.code()?).into_iter().map(|e| (e.path, e.blob)).collect();
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
