//! Builds the presence helper (presence.swift) on macOS; theID carries it inside (src/presence.rs).

fn main() {
    println!("cargo:rerun-if-changed=presence.swift");
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("presence");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        // no Secure Enclave there: theID says so when asked to sign
        std::fs::write(&out, b"").unwrap();
        return;
    }
    let ok = std::process::Command::new("/usr/bin/swiftc").args(["-O", "presence.swift", "-o"]).arg(&out).status().is_ok_and(|s| s.success());
    assert!(ok, "theID: swiftc could not build presence.swift");
}
