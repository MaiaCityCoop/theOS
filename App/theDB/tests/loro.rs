//! Research/0059's findings, kept: mergeable JSON children, one peer per writer, a time and a change per commit,
//! versions named by frontiers.

use std::path::PathBuf;
use thedb::TheDB;

fn store(name: &str) -> (TheDB, PathBuf) {
    let dir = std::env::temp_dir().join(format!("thedb-loro-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (TheDB::open(&dir).unwrap(), dir)
}

#[test]
fn two_branches_that_each_add_an_object_keep_both_sides() {
    let (mut db, dir) = store("mergeable");
    let id = db.new("world", "w").unwrap();
    db.set_text(&id, "{\"name\": \"w\"}").unwrap();
    db.make_branch("a", "a").unwrap();
    db.make_branch("b", "b").unwrap();
    db.set_branch(Some("a")).unwrap();
    db.set_text(&id, "{\"name\": \"w\", \"sun\": {\"elevation\": 30}}").unwrap();
    db.set_branch(Some("b")).unwrap();
    db.set_text(&id, "{\"name\": \"w\", \"sun\": {\"azimuth\": 90}}").unwrap();
    db.set_branch(None).unwrap();
    for b in ["a", "b"] {
        let v = db.head_on(Some(b), &id).unwrap().unwrap();
        db.merge_into_main(&[(id.clone(), v)]).unwrap();
    }
    let text = db.text(&id).unwrap().unwrap();
    let v: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(v["sun"]["elevation"], 30, "{text}");
    assert_eq!(v["sun"]["azimuth"], 90, "{text}");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn one_writer_after_another_uses_one_peer_and_keeps_each_commit_with_its_time() {
    let (db, dir) = store("peer");
    let id = db.new("note", "n").unwrap();
    for i in 0..5 {
        db.set_text(&id, &format!("line {i}")).unwrap();
    }
    let doc = db.doc(&id).unwrap();
    assert_eq!(doc.oplog_vv().len(), 1, "every commit by one lent peer");
    assert_eq!(doc.len_changes(), 6, "the new doc and five edits: a change each");
    let mut times = Vec::new();
    doc.travel_change_ancestors(&doc.oplog_frontiers().iter().collect::<Vec<_>>(), &mut |c| {
        times.push(c.timestamp);
        std::ops::ControlFlow::Continue(())
    })
    .unwrap();
    assert!(times.iter().all(|t| *t > 0), "{times:?}");
    let head = db.head(&id).unwrap().unwrap();
    assert_eq!(db.frontiers(head).unwrap(), Some(doc.oplog_frontiers()));
    let _ = std::fs::remove_dir_all(dir);
}
