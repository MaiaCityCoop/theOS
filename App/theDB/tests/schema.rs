//! Schemas: objects by hash, checked against JSON Schema's meta-schema; every commit of a doc that names one fits it.

use thedb::TheDB;

const WORLD: &str = r##"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["sky", "ground", "lines"],
  "properties": {
    "sky": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
    "ground": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
    "lines": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"}
  }
}"##;

#[test]
fn a_doc_that_names_a_schema_keeps_only_what_fits_it() {
    let dir = std::env::temp_dir().join(format!("thedb-schema-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let mut db = TheDB::open(&dir).unwrap();
    assert!(db.put_schema(br#"{"type": 12}"#).unwrap_err().contains("not a JSON Schema"));
    let schema = db.put_schema(WORLD.as_bytes()).unwrap();
    let world = db.new("world", "w").unwrap();
    db.set_text(&world, r##"{"sky": "#e9f2fb", "ground": "#4f9d34", "lines": "#f3f9ec"}"##).unwrap();
    db.set_schema(&world, Some(schema)).unwrap();
    // fits: kept; does not fit: refused, and the doc stays as it was
    db.set_text(&world, r##"{"sky": "#e9f2fb", "ground": "#2f6fb0", "lines": "#eaf2fb"}"##).unwrap();
    let e = db.set_text(&world, r##"{"sky": "#e9f2fb", "ground": "blue", "lines": "#eaf2fb"}"##).unwrap_err();
    assert!(e.contains("does not fit") && e.contains("/ground"), "{e}");
    assert!(db.text(&world).unwrap().unwrap().contains("#2f6fb0"));
    // on a branch too
    db.make_branch("try", "a branch").unwrap();
    db.set_branch(Some("try")).unwrap();
    assert!(db.set_text(&world, r##"{"sky": "#e9f2fb"}"##).unwrap_err().contains("ground"));
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
