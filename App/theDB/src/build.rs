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
        let built = std::process::Command::new("cargo")
            .args(["build", "--manifest-path", &format!("{SOURCE}/Cargo.toml"), "--workspace"])
            .current_dir(repo)
            .env_remove("CARGO_TARGET_DIR")
            .status()
            .map_err(err)?;
        if !built.success() {
            return Err("the build failed".into());
        }
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
