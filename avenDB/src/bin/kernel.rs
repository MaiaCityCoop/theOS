//! The kernel: the one thing installed. It opens avenDB, follows the root doc to its engine, takes the build the
//! engine pins, checks the binary against its hash, and starts it; while the engine runs, the kernel holds the store
//! and serves it to the engine and to every other process on the machine. Arguments pass through to the engine.
//!
//!     kernel [args...]

use avendb::AvenDb;
use std::os::unix::fs::PermissionsExt;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = AvenDb::here();
    let db = AvenDb::open(&dir).unwrap_or_else(|e| fail(&e));
    let root = db.root().ok().flatten().unwrap_or_else(|| fail("avenDB has no root"));
    let root_doc: serde_json::Value = serde_json::from_str(&db.text(&root).ok().flatten().unwrap_or_default()).unwrap_or_else(|e| fail(&e.to_string()));
    let engine = root_doc["engine"].as_str().unwrap_or_else(|| fail("the root names no engine")).to_string();
    let pinned = db.engine(&engine).ok().and_then(|e| e.pinned).unwrap_or_else(|| fail("the engine pins no build"));
    let build = db.build(&pinned).unwrap_or_else(|e| fail(&e));
    let hash: avendb::Hash = build.binary.parse().unwrap_or_else(|_| fail("the build's binary is no hash"));
    // the binary, written once beside the store under its hash; checked against it every start
    let run = dir.join("run");
    let path = run.join(hash.to_hex().as_str());
    let good = |p: &std::path::Path| std::fs::read(p).is_ok_and(|b| avendb::Hash::new(&b) == hash);
    if !good(&path) {
        if path.exists() {
            eprintln!("kernel: the cached binary does not match its hash: refused, and written again from the store");
        }
        let bytes = db.get(hash).ok().flatten().unwrap_or_else(|| fail("the store lacks the engine's binary"));
        if avendb::Hash::new(&bytes) != hash {
            fail("the engine's binary does not match its hash: refused");
        }
        std::fs::create_dir_all(&run).unwrap_or_else(|e| fail(&e.to_string()));
        std::fs::write(&path, &bytes).unwrap_or_else(|e| fail(&e.to_string()));
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap_or_else(|e| fail(&e.to_string()));
        if !good(&path) {
            fail("the engine's binary on disk does not match its hash: refused");
        }
    }
    eprintln!("kernel: engine {engine}, build {}, {}", &pinned[..12], build.toolchain);
    let status = std::process::Command::new(&path).args(&args).env("AVENDB", &dir).status().unwrap_or_else(|e| fail(&e.to_string()));
    drop(db);
    std::process::exit(status.code().unwrap_or(1));
}

fn fail(e: &str) -> ! {
    eprintln!("kernel: {e}");
    std::process::exit(1)
}
