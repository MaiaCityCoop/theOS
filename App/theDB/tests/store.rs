//! Check 1 of intent 0049: blobs and docs round-trip, and every version of a doc reads back by its hash.

use thedb::TheDB;

fn fresh(name: &str) -> (TheDB, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("thedb-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (TheDB::open(&dir).expect("the store opens"), dir)
}

#[test]
fn blobs_round_trip_by_hash() {
    let (db, dir) = fresh("blobs");
    let a = db.put(&b"a shader"[..]).unwrap();
    let b = db.put(&b"a shader"[..]).unwrap();
    assert_eq!(a, b, "the same bytes, the same hash");
    assert_eq!(a, thedb::Hash::new(b"a shader"), "the hash is BLAKE3 of the bytes");
    assert_eq!(db.get(a).unwrap().unwrap().as_ref(), b"a shader");
    assert!(db.get(thedb::Hash::new(b"never kept")).unwrap().is_none());
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn every_version_of_a_doc_reads_back() {
    let (db, dir) = fresh("docs");
    let wind = db.new("shader", "wind.wesl").unwrap();
    assert!(thedb::is_id(&wind));
    let v1 = db.set_text(&wind, "one").unwrap();
    let v2 = db.set_text(&wind, "one two").unwrap();
    let v3 = db.set_text(&wind, "one two three").unwrap();
    assert_eq!(db.set_text(&wind, "one two three").unwrap(), v3, "the same text commits nothing");
    assert_eq!(db.head(&wind).unwrap(), Some(v3));
    assert_eq!(db.text(&wind).unwrap().as_deref(), Some("one two three"));
    for (v, want) in [(v1, "one"), (v2, "one two"), (v3, "one two three")] {
        assert_eq!(db.doc_at(v).unwrap().get_text("text").to_string(), want);
    }
    // a branch from the first version: its own history from there
    let first = db.doc_at(v3).unwrap();
    let at_v1 = db.doc_at(v1).unwrap().state_frontiers();
    let fork = first.fork_at(&at_v1).unwrap();
    fork.get_text("text").insert(3, " and a fork").unwrap();
    let fork_id = db.new("shader", "wind, a fork").unwrap();
    let f = db.commit(&fork_id, &fork).unwrap();
    assert_eq!(db.doc_at(f).unwrap().get_text("text").to_string(), "one and a fork");
    assert_eq!(db.text(&wind).unwrap().as_deref(), Some("one two three"), "the fork leaves its source alone");
    let mut ids: Vec<String> = db.docs().unwrap().into_iter().map(|(id, _)| id).collect();
    ids.sort();
    let mut want = vec![wind.clone(), fork_id.clone()];
    want.sort();
    assert_eq!(ids, want);
    assert_eq!(db.meta(&wind).unwrap(), ("shader".to_string(), "wind.wesl".to_string()), "the name is inside the doc");
    drop(db);
    // and it is all still there when the store opens again
    let db = TheDB::open(&dir).unwrap();
    assert_eq!(db.text(&wind).unwrap().as_deref(), Some("one two three"));
    assert_eq!(db.doc_at(v1).unwrap().get_text("text").to_string(), "one");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_second_process_reaches_the_store_through_its_owner() {
    let (owner, dir) = fresh("shared");
    assert!(owner.owns());
    let biome = owner.new("biome", "meadow").unwrap();
    owner.set_root(&biome).unwrap();
    let v1 = owner.set_text(&biome, "grass").unwrap();
    // a second opening, as `thedb` in a shell while the app runs
    let other = TheDB::open(&dir).expect("the second opening reaches the owner");
    assert!(!other.owns());
    assert_eq!(other.root().unwrap().as_deref(), Some(biome.as_str()), "both reach the same root");
    assert_eq!(other.text(&biome).unwrap().as_deref(), Some("grass"));
    let v2 = other.set_text(&biome, "grass and clover").unwrap();
    assert_ne!(v1, v2);
    assert_eq!(owner.text(&biome).unwrap().as_deref(), Some("grass and clover"), "the owner sees the other's commit");
    drop(other);
    drop(owner);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn ids_are_opaque_and_parts_are_blobs() {
    let (db, dir) = fresh("flat");
    assert!(db.set_text("shaders/wind.wesl", "x").is_err(), "a name or a path is no id");
    assert!(db.set_text("wind.wesl", "x").is_err(), "a name or a path is no id");
    let place = db.new("place", "Mértola").unwrap();
    db.set_part(&place, "height", &[1, 2, 3]).unwrap();
    let v = db.set_part(&place, "cover", &[10, 20]).unwrap();
    assert_eq!(db.set_part(&place, "cover", &[10, 20]).unwrap(), v, "unchanged commits nothing");
    assert_eq!(db.part(&place, "height").unwrap().unwrap().as_ref(), &[1, 2, 3]);
    assert!(db.part(&place, "trees").unwrap().is_none());
    db.forget(&place).unwrap();
    assert!(db.head(&place).unwrap().is_none());
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn two_writers_of_one_doc_both_keep_their_edit() {
    let (db, dir) = fresh("merge");
    let notes = db.new("text", "notes").unwrap();
    db.set_text(&notes, "meadow").unwrap();
    // two worktrees each take the doc as it is now and edit it
    let (a, b) = (db.doc(&notes).unwrap(), db.doc(&notes).unwrap());
    a.get_text("text").insert(0, "a ").unwrap();
    b.get_text("text").insert(6, " b").unwrap();
    db.commit(&notes, &a).unwrap();
    db.commit(&notes, &b).unwrap();
    assert_eq!(db.text(&notes).unwrap().as_deref(), Some("a meadow b"), "the second commit merges, it does not overwrite");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
