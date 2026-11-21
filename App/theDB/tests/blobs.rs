//! Content by hash (intent 0059): every blob the code names (`blob!("<hash>")`) is in `blobs/` and has that hash, and
//! every file in `blobs/` is named by its own hash and named by the code.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).unwrap().flatten() {
        let p = e.path();
        if p.is_dir() {
            if p.file_name().is_some_and(|n| n != "target" && n != "blobs") {
                rust_files(&p, out);
            }
        } else if p.extension().is_some_and(|x| x == "rs") {
            out.push(p);
        }
    }
}

#[test]
fn every_blob_the_code_names_is_there_with_its_hash() {
    let app = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
    let mut files = Vec::new();
    rust_files(&app, &mut files);
    let mut named = BTreeSet::new();
    for f in files {
        let text = std::fs::read_to_string(&f).unwrap();
        for part in text.split("blob!(\"").skip(1) {
            let hash = &part[..part.find('"').unwrap()];
            if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                named.insert(hash.to_string());
            }
        }
    }
    assert!(!named.is_empty(), "the code names blobs");
    let blobs = app.join("blobs");
    for hash in &named {
        let bytes = std::fs::read(blobs.join(hash)).unwrap_or_else(|_| panic!("blobs/{hash} is missing"));
        assert_eq!(&thedb::Hash::new(&bytes).to_hex().to_string(), hash, "blobs/{hash} is not what its name says");
    }
    for e in std::fs::read_dir(&blobs).unwrap().flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        assert!(named.contains(&name), "blobs/{name} is named by no code: take it out");
    }
}
