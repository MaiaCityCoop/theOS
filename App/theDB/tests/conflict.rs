//! Conflicts are never hidden: what main and a line both changed, differently, stops the merge until settled.

use thedb::TheDB;

fn store(name: &str) -> (TheDB, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("thedb-conflict-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (TheDB::open(&dir).unwrap(), dir)
}

#[test]
fn both_sides_changing_one_key_is_refused_until_the_line_settles_it() {
    let (mut db, dir) = store("key");
    let w = db.new("world", "w").unwrap();
    db.set_text(&w, r#"{"sun": 10, "wind": 1}"#).unwrap();
    db.make_branch("line-a", "a").unwrap();
    db.set_branch(Some("line-a")).unwrap();
    db.set_text(&w, r#"{"sun": 30, "wind": 1}"#).unwrap();
    db.set_branch(None).unwrap();
    db.set_text(&w, r#"{"sun": 20, "wind": 1}"#).unwrap();
    let p = db.propose("line-a", "a higher sun").unwrap();
    let c = db.proposal_conflicts(&p).unwrap();
    assert_eq!(c.len(), 1, "{c:?}");
    assert!(c[0].path.ends_with("/sun"), "{}", c[0]);
    assert!(db.merge(&p).unwrap_err().contains("conflicts with main"));
    assert!(db.text(&w).unwrap().unwrap().contains("20"), "main untouched");
    // the line brings main in, sees the conflict, settles it, proposes again
    assert_eq!(db.sync_line("line-a").unwrap().len(), 1);
    db.set_branch(Some("line-a")).unwrap();
    db.set_text(&w, r#"{"sun": 30, "wind": 1}"#).unwrap();
    db.set_branch(None).unwrap();
    let p2 = db.propose("line-a", "a higher sun, settled").unwrap();
    assert!(db.proposal_conflicts(&p2).unwrap().is_empty());
    db.merge(&p2).unwrap();
    assert!(db.text(&w).unwrap().unwrap().contains("30"));
    // a closed proposal is on main too, listed once; the open one stays on its line
    let all = db.proposals().unwrap();
    assert_eq!(all.len(), 2, "{all:?}");
    assert!(db.head_on(None, &p2).unwrap().is_some(), "the merged proposal is main's history");
    assert!(db.head_on(None, &p).unwrap().is_none(), "the refused-by-conflict one is still open, on its line");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn changes_to_different_keys_merge_without_a_conflict() {
    let (mut db, dir) = store("keys");
    let w = db.new("world", "w").unwrap();
    db.set_text(&w, r#"{"sun": 10, "wind": 1}"#).unwrap();
    db.make_branch("line-b", "b").unwrap();
    db.set_branch(Some("line-b")).unwrap();
    db.set_text(&w, r#"{"sun": 10, "wind": 5}"#).unwrap();
    db.set_branch(None).unwrap();
    db.set_text(&w, r#"{"sun": 20, "wind": 1}"#).unwrap();
    let p = db.propose("line-b", "more wind").unwrap();
    assert!(db.proposal_conflicts(&p).unwrap().is_empty());
    db.merge(&p).unwrap();
    let v: serde_json::Value = serde_json::from_str(&db.text(&w).unwrap().unwrap()).unwrap();
    assert_eq!((v["sun"].as_i64(), v["wind"].as_i64()), (Some(20), Some(5)));
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
