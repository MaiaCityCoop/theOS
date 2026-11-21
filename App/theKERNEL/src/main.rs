//! The kernel: the one thing installed. It opens theDB, follows the root doc to its engine, takes the build the
//! engine pins, checks the binary against its hash, and starts it; while the engine runs, the kernel holds the store
//! and serves it to the engine and to every other process on the machine. Arguments pass through to the engine.
//!
//!     kernel [args...]
//!     kernel --at <lock> [args...]     the system as a lock pins it (theDB's lock.rs): read only, the same every time
//!
//! When theOS exits with 75 (a person accepted a new build in it), the kernel starts the build now pinned.
//!
//! Told to stop (Ctrl-C or a TERM), it stops the engine, writes what the store holds to disk and closes it: a store
//! closed by a plain kill can lose what other processes wrote through it last.

use std::sync::atomic::{AtomicBool, Ordering};
use thedb::TheDB;

static STOP: AtomicBool = AtomicBool::new(false);

extern "C" fn stop(_: i32) {
    STOP.store(true, Ordering::Relaxed);
}

unsafe extern "C" {
    fn signal(signum: i32, handler: extern "C" fn(i32)) -> usize;
}

fn main() {
    // SIGINT and SIGTERM
    unsafe {
        signal(2, stop);
        signal(15, stop);
    }
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let lock = if args.first().map(String::as_str) == Some("--at") {
        let l = args.get(1).cloned().unwrap_or_else(|| fail("--at <lock hash>"));
        args.drain(..2);
        // this process reads at the lock too, so the engine it starts is the one the lock pins
        unsafe { std::env::set_var("THEDB_LOCK", &l) };
        Some(l)
    } else {
        None
    };
    let dir = TheDB::here();
    let db = TheDB::open(&dir).unwrap_or_else(|e| fail(&e));
    if let Some(l) = &lock {
        eprintln!("kernel: the system at the lock {}", &l[..12.min(l.len())]);
    }
    // theOS exits with RESTART when a person accepts a new build: the kernel starts the build now pinned
    const RESTART: i32 = 75;
    let code = loop {
        let engine = db.pinned_engine().unwrap_or_else(|e| fail(&e));
        eprintln!("kernel: engine {}, build {}, {}", engine.engine, &engine.build[..12], engine.toolchain);
        let mut child = std::process::Command::new(&engine.path).args(&args).env("THEDB", &dir).spawn().unwrap_or_else(|e| fail(&e.to_string()));
        let code = loop {
            if let Some(status) = child.try_wait().unwrap_or_else(|e| fail(&e.to_string())) {
                break status.code().unwrap_or(1);
            }
            if STOP.load(Ordering::Relaxed) {
                let _ = child.kill();
                let _ = child.wait();
                break 0;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        };
        if code != RESTART || lock.is_some() {
            break code;
        }
        eprintln!("kernel: a new build was accepted; starting it");
    };
    let _ = db.sync();
    drop(db);
    std::process::exit(code);
}

fn fail(e: &str) -> ! {
    eprintln!("kernel: {e}");
    std::process::exit(1)
}
