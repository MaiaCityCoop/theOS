//! A lock: the system as it was, by one hash; read the same every time, written never.

use thedb::TheDB;
use thedb::access::SecretKey;

#[test]
fn a_lock_reads_the_system_as_it_was() {
    let dir = std::env::temp_dir().join(format!("thedb-lock-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let db = TheDB::open(&dir).unwrap();
    let world = db.new("world", "w").unwrap();
    db.set_text(&world, r##"{"ground": "#4f9d34"}"##).unwrap();
    let root = db.new("root", "root").unwrap();
    db.set_text(&root, &format!(r#"{{"world": "{world}"}}"#)).unwrap();
    db.set_root(&root).unwrap();
    db.set_master(SecretKey::generate()).unwrap();
    let lock = db.lock().unwrap();
    db.set_text(&world, r##"{"ground": "#2f6fb0"}"##).unwrap();
    let pins = db.read_lock(lock).unwrap();
    assert_eq!(pins.root, root);
    assert!(pins.docs.contains_key(&world));
    drop(db);
    // another process, at the lock: the green it pinned, not the blue of now; and it writes nothing
    let mut at = TheDB::open(&dir).unwrap();
    at.at_lock(lock).unwrap();
    assert!(at.text(&world).unwrap().unwrap().contains("#4f9d34"));
    assert_eq!(at.root().unwrap().as_deref(), Some(root.as_str()));
    assert!(at.set_text(&world, "{}").unwrap_err().contains("writes nothing"));
    drop(at);
    let _ = std::fs::remove_dir_all(dir);
}
