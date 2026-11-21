//! Branches read main and keep their own; a proposal brings a branch's docs into main.

use thedb::TheDB;
use thedb::intents::State;

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
    db.accept(&p).unwrap();
    assert_eq!(db.intent(&p).unwrap().state, State::Merged);
    let v: serde_json::Value = serde_json::from_str(&db.text(&world).unwrap().unwrap()).unwrap();
    assert_eq!(v["sun"]["elevation"], 30);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

/// An intent from draft to merged: opened by a person on main, taken up by a line, its tasks ticked, ready, accepted;
/// listed once wherever it lives, and states set by hand only where an agent may set them.
#[test]
fn an_intent_goes_from_draft_to_merged() {
    let (mut db, dir) = fresh("lifecycle");
    let world = db.new("world", "day 1").unwrap();
    db.set_text(&world, r#"{"sun": 10}"#).unwrap();
    let id = db.intent_new(None, "a higher sun", "the plane looks flat at noon", "the sun stands at 30°").unwrap();
    assert_eq!(db.intent(&id).unwrap().state, State::Draft);
    assert!(db.intent_ready(&id).unwrap_err().contains("no line"), "ready needs a line");
    db.make_branch("line-ada", "").unwrap();
    db.intent_take(&id, "line-ada").unwrap();
    assert_eq!(db.intent(&id).unwrap().state, State::Building);
    assert_eq!(db.intent_task(&id, "raise the sun").unwrap(), 1);
    db.intent_task(&id, "check the shadows").unwrap();
    db.intent_tick(&id, 1, true).unwrap();
    assert!(db.intent_state(&id, State::Proposal, None).is_err(), "a proposal comes by ready, not by hand");
    db.set_branch(Some("line-ada")).unwrap();
    db.set_text(&world, r#"{"sun": 30}"#).unwrap();
    db.set_branch(None).unwrap();
    db.intent_ready(&id).unwrap();
    let i = db.intent(&id).unwrap();
    assert_eq!((i.state, i.docs.len(), i.tasks.iter().filter(|t| t.done).count()), (State::Proposal, 1, 1), "the world only, not the intent itself");
    assert_eq!(db.intents().unwrap().iter().filter(|(x, _)| x == &id).count(), 1, "listed once, on main and on its line");
    db.accept(&id).unwrap();
    assert_eq!(db.intent(&id).unwrap().state, State::Merged);
    assert!(db.text(&world).unwrap().unwrap().contains("30"));
    assert!(db.intent_task(&id, "too late").is_err(), "a merged intent is history");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
