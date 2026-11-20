//! Branches read main and keep their own; a proposal brings a branch's docs into main.

use thedb::TheDB;
use thedb::proposals::State;

fn fresh(name: &str) -> (TheDB, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("thedb-proposals-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (TheDB::open(&dir).expect("the store opens"), dir)
}

#[test]
fn a_branch_reads_main_and_keeps_its_own() {
    let (mut db, dir) = fresh("branch");
    let a = db.new("shader", "a").unwrap();
    let b = db.new("shader", "b").unwrap();
    db.set_text(&a, "main a").unwrap();
    db.set_text(&b, "main b").unwrap();
    db.make_branch("try", "a test").unwrap();
    db.set_branch(Some("try")).unwrap();
    assert_eq!(db.text(&a).unwrap().as_deref(), Some("main a"), "a branch reads main where it changed nothing");
    db.set_text(&a, "branch a").unwrap();
    assert_eq!(db.text(&a).unwrap().as_deref(), Some("branch a"));
    let changed: Vec<String> = db.changed_on("try").unwrap().into_iter().map(|(id, _)| id).collect();
    assert_eq!(changed, vec![a.clone()], "only what the branch changed is on it");
    db.set_branch(None).unwrap();
    assert_eq!(db.text(&a).unwrap().as_deref(), Some("main a"), "main does not see the branch");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_proposal_brings_a_branch_into_main() {
    let (mut db, dir) = fresh("merge");
    let world = db.new("world", "day 1").unwrap();
    db.set_text(&world, r#"{"sky": "e9f2fb", "ground": "4f9d34"}"#).unwrap();
    db.make_branch("sun", "").unwrap();
    db.set_branch(Some("sun")).unwrap();
    db.set_text(&world, r#"{"sky": "e9f2fb", "ground": "4f9d34", "sun": {"elevation": 30}}"#).unwrap();
    db.set_branch(None).unwrap();
    let p = db.propose("sun", "a sun").unwrap();
    db.merge(&p).unwrap();
    assert_eq!(db.proposal(&p).unwrap().state, State::Merged);
    let v: serde_json::Value = serde_json::from_str(&db.text(&world).unwrap().unwrap()).unwrap();
    assert_eq!(v["sun"]["elevation"], 30);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
