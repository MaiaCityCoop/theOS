//! The kernel: the one thing installed. It opens avenDB, follows the root doc to its engine, takes the build the
//! engine pins, checks the binary against its hash, and starts it; while the engine runs, the kernel holds the store
//! and serves it to the engine and to every other process on the machine, and calls its plugins when a doc they watch
//! changes (in the background: the engine never waits for them). Arguments pass through to the engine.
//!
//!     kernel [args...]

use avendb::AvenDb;
use avendb::plugin::{Plugin, Watcher};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = AvenDb::here();
    let db = Arc::new(AvenDb::open(&dir).unwrap_or_else(|e| fail(&e)));
    let engine = db.pinned_engine().unwrap_or_else(|e| fail(&e));
    eprintln!("kernel: engine {}, build {}, {}", engine.engine, &engine.build[..12], engine.toolchain);
    // the plugins: each names the doc kinds it watches; what it does is its own
    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(avendb::baker::Baker::new())];
    let stop = Arc::new(AtomicBool::new(false));
    let watcher = match Watcher::new(&db, plugins) {
        Ok(w) => Some(w.watch(db.clone(), stop.clone())),
        Err(e) => {
            eprintln!("kernel: no plugins run: {e}");
            None
        }
    };
    let status = std::process::Command::new(&engine.path).args(&args).env("AVENDB", &dir).status().unwrap_or_else(|e| fail(&e.to_string()));
    // a plugin's call in progress ends before the store is let go
    stop.store(true, Ordering::Relaxed);
    if let Some(w) = watcher {
        let _ = w.join();
    }
    drop(db);
    std::process::exit(status.code().unwrap_or(1));
}

fn fail(e: &str) -> ! {
    eprintln!("kernel: {e}");
    std::process::exit(1)
}
