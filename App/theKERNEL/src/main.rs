//! The kernel: the one thing installed. It opens theDB, follows the root doc to its engine, takes the build the
//! engine pins, checks the binary against its hash, and starts it; while the engine runs, the kernel holds the store
//! and serves it to the engine and to every other process on the machine. Arguments pass through to the engine.
//!
//!     kernel [args...]

use thedb::TheDB;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = TheDB::here();
    let db = TheDB::open(&dir).unwrap_or_else(|e| fail(&e));
    let engine = db.pinned_engine().unwrap_or_else(|e| fail(&e));
    eprintln!("kernel: engine {}, build {}, {}", engine.engine, &engine.build[..12], engine.toolchain);
    let status = std::process::Command::new(&engine.path).args(&args).env("THEDB", &dir).status().unwrap_or_else(|e| fail(&e.to_string()));
    drop(db);
    std::process::exit(status.code().unwrap_or(1));
}

fn fail(e: &str) -> ! {
    eprintln!("kernel: {e}");
    std::process::exit(1)
}
