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
    /// build is exactly its commit. Returns the build's hash.
    pub fn publish_git(&self, engine: &str, repo: &Path) -> Result<Hash> {
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
        let hash = self.publish(engine, &binary, &serde_json::to_vec_pretty(&manifest).map_err(err)?, &toolchain)?;
        // written to disk before this returns: the store's owner may be stopped right after
        self.sync()?;
        Ok(hash)
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
