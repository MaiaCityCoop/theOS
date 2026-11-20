//! The baker (intent 0050): the kernel's first plugin. It watches the asset docs; when one changes it runs the pinned
//! engine as `<engine> --bake <asset id>`, which makes every derived result of that asset no longer valid, writes it
//! to avenDB and exits 0 (non-zero on failure; with every result valid it writes nothing). Bakes draw on the GPU, so
//! each waits its turn in the machine's one GPU lock and queue (`gpu`, the same as `TheGame/tools/gpu/lock.js`), from
//! the kernel and from `avendb bake` alike.

use crate::{AvenDb, Result};
use std::path::{Path, PathBuf};

/// The doc kind the baker watches: the Library's assets.
pub const KIND: &str = "asset";

/// The baker, as a plugin of the kernel: its bakes wait in the GPU queue in `gpu`.
pub struct Baker {
    pub gpu: PathBuf,
}

impl Baker {
    /// The baker queuing in this machine's GPU lock.
    pub fn new() -> Self {
        Baker { gpu: crate::gpu::shared() }
    }
}

impl Default for Baker {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::plugin::Plugin for Baker {
    fn name(&self) -> &str {
        "baker"
    }
    fn kinds(&self) -> &[&str] {
        &[KIND]
    }
    fn changed(&self, db: &AvenDb, id: &str) -> Result<()> {
        bake_in(db, id, &self.gpu)
    }
}

/// Bakes asset `id`, waiting its turn in this machine's GPU lock.
pub fn bake(db: &AvenDb, id: &str) -> Result<()> {
    bake_in(db, id, &crate::gpu::shared())
}

/// Bakes asset `id`: waits its turn in the GPU lock in `gpu`, runs the pinned engine's `--bake` on it holding the lock,
/// and logs start, end and exit code.
pub fn bake_in(db: &AvenDb, id: &str, gpu: &Path) -> Result<()> {
    let engine = db.pinned_engine()?;
    let name = db.meta(id).map(|m| m.1).unwrap_or_default();
    let owner = std::env::var("GPU_OWNER").unwrap_or_else(|_| "avenDB baker".into());
    let hold = crate::gpu::take(gpu, &owner, &format!("bake {id} {name}"))?;
    eprintln!("baker: {id} {name}: started");
    let start = std::time::Instant::now();
    // the engine bakes on the branch this process is on: main's, from the kernel
    let mut command = std::process::Command::new(&engine.path);
    command.arg("--bake").arg(id).env("AVENDB", db.dir());
    match db.branch() {
        Some(b) => command.env("AVENDB_BRANCH", b),
        None => command.env_remove("AVENDB_BRANCH"),
    };
    if let Some(token) = hold.token() {
        command.env("GPU_LOCK_TOKEN", token);
    }
    let status = command.spawn().and_then(|mut child| {
        // the engine's life holds the lock too, should this process go first
        hold.held_by(child.id());
        child.wait()
    });
    let took = start.elapsed().as_secs_f32();
    drop(hold);
    let status = status.map_err(|e| format!("the engine did not start: {e}"))?;
    let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "none (killed)".into());
    eprintln!("baker: {id} {name}: ended in {took:.1} s, exit {code}");
    if !status.success() {
        return Err(format!("the bake of {id} failed, exit {code}"));
    }
    Ok(())
}
