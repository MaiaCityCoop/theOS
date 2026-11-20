//! Vibes: a manifest doc, checked by the one vibe schema; composite; pinned versions; missing parts found; no cycles.

use thedb::TheDB;

#[test]
fn a_vibe_reaches_what_it_needs_and_its_parts() {
    let dir = std::env::temp_dir().join(format!("thedb-vibe-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let db = TheDB::open(&dir).unwrap();
    let schema = db.vibe_schema().unwrap();
    let world = db.new("world", "green").unwrap();
    let v1 = db.set_text(&world, "{\"ground\": \"#4f9d34\"}").unwrap();
    let pic = db.put(b"a picture".to_vec()).unwrap();
    let vibe = |name: &str, body: String| {
        let id = db.new("vibe", name).unwrap();
        db.set_schema(&id, Some(schema)).unwrap_err(); // an empty vibe does not fit the schema
        db.set_text(&id, &body).unwrap();
        db.set_schema(&id, Some(schema)).unwrap();
        id
    };
    let leaf = vibe("the green world", format!(r#"{{"name": "the green world", "entry": "{world}@{v1}", "needs": {{"picture": "blob:{pic}"}}}}"#));
    let top = vibe("day 1", format!(r#"{{"name": "day 1", "entry": "{world}", "vibes": ["{leaf}"]}}"#));
    let tree = db.tree(&top).unwrap();
    assert_eq!(tree.parts.len(), 1);
    assert!(tree.missing().is_empty(), "{:?}", tree.missing());
    // a vibe that does not fit is refused
    assert!(db.set_text(&leaf, r#"{"name": "no entry"}"#).unwrap_err().contains("entry"));
    // what is missing is found, and a cycle is refused
    let gone = "a".repeat(26);
    db.set_text(&leaf, &format!(r#"{{"name": "the green world", "entry": "{gone}", "vibes": ["{top}"]}}"#)).unwrap();
    let missing = db.tree(&top).unwrap().missing();
    assert!(missing.iter().any(|m| m.contains("no such doc")), "{missing:?}");
    assert!(missing.iter().any(|m| m.contains("made of itself")), "{missing:?}");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
