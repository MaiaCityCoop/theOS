//! The baker (intent 0050): the kernel's first plugin. It watches the asset docs; when one changes it runs the pinned
//! engine as `<engine> --bake <asset id>`, which makes every derived result of that asset no longer valid, writes it
//! to avenDB and exits 0 (non-zero on failure). Bakes draw on the GPU, so one runs at a time on this machine: a lock
//! file beside the store queues them, from the kernel and from `avendb bake` alike.

use crate::{AvenDb, Result};

/// The doc kind the baker watches: the Library's assets.
pub const KIND: &str = "asset";

/// The baker, as a plugin of the kernel.
pub struct Baker;

impl crate::plugin::Plugin for Baker {
    fn name(&self) -> &str {
        "baker"
    }
    fn kinds(&self) -> &[&str] {
        &[KIND]
    }
    fn changed(&self, db: &AvenDb, id: &str) -> Result<()> {
        bake(db, id)
    }
}

/// Bakes asset `id`: waits its turn, runs the pinned engine's `--bake` on it, and logs start, end and exit code.
pub fn bake(db: &AvenDb, id: &str) -> Result<()> {
    let engine = db.pinned_engine()?;
    let run = db.dir().join("run");
    std::fs::create_dir_all(&run).map_err(|e| e.to_string())?;
    // the queue: an exclusive lock on one file, held while the engine bakes and let go however it ends
    let lock = std::fs::OpenOptions::new().create(true).truncate(false).write(true).open(run.join("bake.lock")).map_err(|e| e.to_string())?;
    lock.lock().map_err(|e| e.to_string())?;
    let name = db.meta(id).map(|m| m.1).unwrap_or_default();
    eprintln!("baker: {id} {name}: started");
    let start = std::time::Instant::now();
    // the engine bakes on the branch this process is on: main's, from the kernel
    let mut command = std::process::Command::new(&engine.path);
    command.arg("--bake").arg(id).env("AVENDB", db.dir());
    match db.branch() {
        Some(b) => command.env("AVENDB_BRANCH", b),
        None => command.env_remove("AVENDB_BRANCH"),
    };
    let status = command.status();
    let took = start.elapsed().as_secs_f32();
    drop(lock);
    let status = status.map_err(|e| format!("the engine did not start: {e}"))?;
    let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "none (killed)".into());
    eprintln!("baker: {id} {name}: ended in {took:.1} s, exit {code}");
    if !status.success() {
        return Err(format!("the bake of {id} failed, exit {code}"));
    }
    Ok(())
}
