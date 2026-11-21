//! Builds of the engine, from git (intent 0054). The engine's source lives in git; a build is made from a clean commit
//! of the checkout and kept in theDB: the binary as a blob, and the source it was made from as a manifest naming each
//! file's blob and the commit, so any pinned build can be written out again exactly.

use crate::{Hash, Result, TheDB, err};
use std::collections::BTreeMap;
use std::path::Path;

/// What a build is made from, in the checkout, and what it makes.
const SOURCE: &str = "App";
const BINARY: &str = "App/target/debug/theos";

fn git(repo: &Path, args: &[&str]) -> Result<String> {
    let out = std::process::Command::new("git").arg("-C").arg(repo).args(args).output().map_err(err)?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

impl TheDB {
    /// Builds engine `engine` from the git checkout `repo` and pins it. The checkout must be clean under `App/`, so the
    /// build is exactly its commit. The engine doc's new pin goes onto the branch `build-<commit>` and is proposed: the
    /// kernel starts the build only once a person has accepted it in theOS. Returns the build's hash and the proposal.
    pub fn publish_git(&self, engine: &str, repo: &Path) -> Result<(Hash, String)> {
        if !git(repo, &["status", "--porcelain", "--", SOURCE])?.is_empty() {
            return Err(format!("{SOURCE}/ has changes not committed: a build is made from a commit"));
        }
        let commit = git(repo, &["rev-parse", "HEAD"])?;
        // cargo says what this build is made of (its artifacts), and everything else in the build folder is swept
        let built = std::process::Command::new("cargo")
            .args(["build", "--manifest-path", &format!("{SOURCE}/Cargo.toml"), "--workspace", "--message-format=json-render-diagnostics"])
            .current_dir(repo)
            .env_remove("CARGO_TARGET_DIR")
            .stderr(std::process::Stdio::inherit())
            .output()
            .map_err(err)?;
        if !built.status.success() {
            return Err("the build failed".into());
        }
        let swept = sweep(&repo.join(SOURCE).join("target").join("debug"), &String::from_utf8_lossy(&built.stdout))?;
        eprintln!("thedb: the build folder swept: {} files and folders of earlier builds, {:.1} GB", swept.0, swept.1 as f64 / 1e9);
        let mut files = BTreeMap::new();
        for path in git(repo, &["ls-files", "--", SOURCE])?.lines() {
            let bytes = std::fs::read(repo.join(path)).map_err(|e| format!("{path}: {e}"))?;
            files.insert(path.to_string(), self.put(bytes)?.to_hex().to_string());
        }
        let manifest = serde_json::json!({ "commit": commit, "files": files });
        let binary = std::fs::read(repo.join(BINARY)).map_err(|e| format!("{BINARY}: {e}"))?;
        let toolchain = std::process::Command::new("rustc").arg("-V").output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        // the build goes onto a branch of its own and is proposed: theOS runs it only once a person accepts it there
        let branch = format!("build-{}", &commit[..12.min(commit.len())]);
        self.make_branch(&branch, &format!("the host built from commit {commit}"))?;
        let hash = self.publish_on(Some(&branch), engine, &binary, &serde_json::to_vec_pretty(&manifest).map_err(err)?, &toolchain)?;
        let subject = git(repo, &["log", "-1", "--format=%s"])?;
        let subject: String = subject.chars().take(140).collect();
        let proposal = self.propose(&branch, &format!("Host build {} from commit {}: {subject}", &hash.to_hex()[..12], &commit[..8.min(commit.len())]))?;
        // written to disk before this returns: the store's owner may be stopped right after
        self.sync()?;
        Ok((hash, proposal))
    }

    /// Writes the source build `build` was made from into `dir`, each file as its blob holds it. The number of files.
    pub fn checkout_build(&self, build: &str, dir: &Path) -> Result<usize> {
        let b = self.build(build)?;
        let manifest: serde_json::Value = serde_json::from_slice(&self.get(b.source.parse().map_err(err)?)?.ok_or("no manifest")?).map_err(err)?;
        let files = manifest.get("files").and_then(|f| f.as_object()).cloned().ok_or("a manifest without files")?;
        for (path, h) in &files {
            let h: Hash = h.as_str().unwrap_or_default().parse().map_err(err)?;
            let bytes = self.get(h)?.ok_or_else(|| format!("no blob {h}"))?;
            let at = dir.join(path);
            if let Some(parent) = at.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            std::fs::write(&at, bytes).map_err(err)?;
        }
        Ok(files.len())
    }
}

// ---- modules (intent 0054): code that is content, kept in theDB and built here into WebAssembly ----

impl TheDB {
    /// Builds module doc `id`: its text is the source of one Rust file (no crates), built for `wasm32-unknown-unknown`
    /// with the toolchain on this machine, and kept as its part `wasm`, a blob by hash, on this process's branch.
    /// Returns the blob's hash. The host loads the part and runs it sandboxed (it can touch only what it is given).
    pub fn build_module(&self, id: &str) -> Result<Hash> {
        let (kind, _) = self.meta(id)?;
        if kind != "module" {
            return Err(format!("{id} is a {kind}, not a module"));
        }
        let source = self.text(id)?.ok_or_else(|| format!("the module {id} has no source"))?;
        let dir = std::env::temp_dir().join(format!("thedb-module-{id}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(err)?;
        let (src, out) = (dir.join("module.rs"), dir.join("module.wasm"));
        std::fs::write(&src, source).map_err(err)?;
        let built = std::process::Command::new("rustc")
            .args(["--edition", "2024", "--target", "wasm32-unknown-unknown", "--crate-type", "cdylib", "-C", "opt-level=s", "-C", "strip=symbols", "-o"])
            .arg(&out)
            .arg(&src)
            .output()
            .map_err(err)?;
        if !built.status.success() {
            let _ = std::fs::remove_dir_all(&dir);
            return Err(format!("the module {id} does not build:\n{}", String::from_utf8_lossy(&built.stderr)));
        }
        let wasm = std::fs::read(&out).map_err(err)?;
        let _ = std::fs::remove_dir_all(&dir);
        self.set_part(id, "wasm", &wasm)?;
        Ok(Hash::new(&wasm))
    }
}

/// `name-<16 hex>`: what cargo names one build of a crate, its files and folders after it.
fn stem(file: &str) -> Option<String> {
    let base = file.split('.').next()?;
    let base = base.strip_prefix("lib").unwrap_or(base);
    let (name, hash) = base.rsplit_once('-')?;
    (hash.len() == 16 && hash.bytes().all(|b| b.is_ascii_hexdigit()) && !name.is_empty()).then(|| base.to_string())
}

fn size(p: &Path) -> u64 {
    match std::fs::symlink_metadata(p) {
        Ok(m) if m.is_dir() => std::fs::read_dir(p).map(|d| d.flatten().map(|e| size(&e.path())).sum()).unwrap_or(0),
        Ok(m) => m.len(),
        Err(_) => 0,
    }
}

/// Sweeps the build folder `debug` of every build of a crate this build did not use (cargo's messages `json` say which
/// it used): the stale copies a new dependency, feature or toolchain leaves behind, which cargo never removes and which
/// grew the folder past 30 GB. Tests and tools rebuild what they need. Returns how many entries went, and their bytes.
pub fn sweep(debug: &Path, json: &str) -> Result<(usize, u64)> {
    let mut keep = std::collections::BTreeSet::new();
    for line in json.lines() {
        let Ok(m) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let paths = m.get("filenames").and_then(|f| f.as_array()).into_iter().flatten().filter_map(|f| f.as_str()).chain(m.get("out_dir").and_then(|o| o.as_str()));
        for p in paths {
            for part in Path::new(p).iter().filter_map(|c| c.to_str()) {
                if let Some(s) = stem(part) {
                    keep.insert(s);
                }
            }
        }
    }
    if keep.is_empty() {
        return Ok((0, 0));
    }
    let mut gone = (0usize, 0u64);
    // deps: files; build: a folder per build script and per output; incremental: a folder per crate build
    for dir in ["deps", "build", "incremental", ".fingerprint"] {
        let Ok(entries) = std::fs::read_dir(debug.join(dir)) else { continue };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let Some(s) = stem(&name) else { continue };
            // incremental folders carry their own hash: kept for crates of this build by name
            let kept = if dir == "incremental" { keep.iter().any(|k| k.rsplit_once('-').map(|(n, _)| n) == s.rsplit_once('-').map(|(n, _)| n)) } else { keep.contains(&s) };
            if kept {
                continue;
            }
            let p = e.path();
            let bytes = size(&p);
            let removed = if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) };
            if removed.is_ok() {
                gone.0 += 1;
                gone.1 += bytes;
            }
        }
    }
    Ok(gone)
}
