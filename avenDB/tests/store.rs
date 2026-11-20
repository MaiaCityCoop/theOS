//! Check 1 of intent 0049: blobs and docs round-trip, and every version of a doc reads back by its hash.

use avendb::AvenDb;

fn fresh(name: &str) -> (AvenDb, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("avendb-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (AvenDb::open(&dir).expect("the store opens"), dir)
}

#[test]
fn blobs_round_trip_by_hash() {
    let (db, dir) = fresh("blobs");
    let a = db.put(&b"a shader"[..]).unwrap();
    let b = db.put(&b"a shader"[..]).unwrap();
    assert_eq!(a, b, "the same bytes, the same hash");
    assert_eq!(a, avendb::Hash::new(b"a shader"), "the hash is BLAKE3 of the bytes");
    assert_eq!(db.get(a).unwrap().unwrap().as_ref(), b"a shader");
    assert!(db.get(avendb::Hash::new(b"never kept")).unwrap().is_none());
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn every_version_of_a_doc_reads_back() {
    let (db, dir) = fresh("docs");
    let v1 = db.set_text("shaders/wind", "one").unwrap();
    let v2 = db.set_text("shaders/wind", "one two").unwrap();
    let v3 = db.set_text("shaders/wind", "one two three").unwrap();
    assert_eq!(db.set_text("shaders/wind", "one two three").unwrap(), v3, "the same text commits nothing");
    assert_eq!(db.head("shaders/wind").unwrap(), Some(v3));
    assert_eq!(db.text("shaders/wind").unwrap().as_deref(), Some("one two three"));
    for (v, want) in [(v1, "one"), (v2, "one two"), (v3, "one two three")] {
        assert_eq!(db.doc_at(v).unwrap().get_text("text").to_string(), want);
    }
    // a branch from the first version: its own history from there
    let first = db.doc_at(v3).unwrap();
    let at_v1 = db.doc_at(v1).unwrap().state_frontiers();
    let fork = first.fork_at(&at_v1).unwrap();
    fork.get_text("text").insert(3, " and a fork").unwrap();
    let f = db.commit("shaders/wind-fork", &fork).unwrap();
    assert_eq!(db.doc_at(f).unwrap().get_text("text").to_string(), "one and a fork");
    assert_eq!(db.text("shaders/wind").unwrap().as_deref(), Some("one two three"), "the fork leaves its source alone");
    let ids: Vec<String> = db.docs().unwrap().into_iter().map(|(id, _)| id).collect();
    assert_eq!(ids, ["shaders/wind", "shaders/wind-fork"]);
    drop(db);
    // and it is all still there when the store opens again
    let db = AvenDb::open(&dir).unwrap();
    assert_eq!(db.text("shaders/wind").unwrap().as_deref(), Some("one two three"));
    assert_eq!(db.doc_at(v1).unwrap().get_text("text").to_string(), "one");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_second_process_reaches_the_store_through_its_owner() {
    let (owner, dir) = fresh("shared");
    assert!(owner.owns());
    let v1 = owner.set_text("recipes/meadow", "grass").unwrap();
    // a second opening, as `avendb` in a shell while the app runs
    let other = AvenDb::open(&dir).expect("the second opening reaches the owner");
    assert!(!other.owns());
    assert_eq!(other.text("recipes/meadow").unwrap().as_deref(), Some("grass"));
    let v2 = other.set_text("recipes/meadow", "grass and clover").unwrap();
    assert_ne!(v1, v2);
    assert_eq!(owner.text("recipes/meadow").unwrap().as_deref(), Some("grass and clover"), "the owner sees the other's commit");
    drop(other);
    drop(owner);
    let _ = std::fs::remove_dir_all(dir);
}
