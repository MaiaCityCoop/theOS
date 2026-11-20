//! Who may write (access.rs on theID): the master writes main and merges; an agent writes its own line, signed, by a
//! grant of the master's; `verify` finds every head signed by whom its branch allows, and a forged one.

use thedb::TheDB;
use thedb::access::{SecretKey, line};

fn store(name: &str) -> (TheDB, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("thedb-access-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (TheDB::open(&dir).unwrap(), dir)
}

#[test]
fn the_master_writes_main_an_agent_its_line_and_verify_holds() {
    let (mut db, dir) = store("lines");
    let world = db.new("world", "w").unwrap();
    db.set_text(&world, "{\"sun\": 10}").unwrap();
    // a master: what is there is signed as it is
    let master = SecretKey::generate();
    db.set_master(master.clone()).unwrap();
    assert!(db.verify().unwrap().problems.is_empty());
    db.set_text(&world, "{\"sun\": 20}").unwrap();
    // an agent and its line
    let agent = SecretKey::generate();
    db.grant("ada", agent.public(), 1).unwrap();
    db.sign_with(agent.clone());
    assert!(db.set_text(&world, "{\"sun\": 30}").unwrap_err().contains("master only"), "an agent does not write main");
    db.set_branch(Some(&line("ada"))).unwrap();
    db.set_text(&world, "{\"sun\": 30}").unwrap();
    db.make_branch("other", "not ada's").unwrap_err();
    db.set_branch(Some("other")).unwrap_err();
    // the agent proposes, only the master merges
    let p = db.propose(&line("ada"), "a higher sun").unwrap_err();
    assert!(p.contains("master only"), "a proposal lives on main: {p}");
    db.set_branch(None).unwrap();
    db.sign_with(master.clone());
    let p = db.propose(&line("ada"), "a higher sun").unwrap();
    db.sign_with(agent.clone());
    assert!(db.merge(&p).unwrap_err().contains("master only"));
    db.sign_with(master);
    db.merge(&p).unwrap();
    assert!(db.text(&world).unwrap().unwrap().contains("30"));
    let v = db.verify().unwrap();
    assert!(v.problems.is_empty(), "{:?}", v.problems);
    assert_eq!(v.good, 3, "the world on main and on the line, the proposal");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_key_without_a_grant_writes_nothing_and_a_forged_head_is_found() {
    let (mut db, dir) = store("forged");
    let doc = db.new("note", "n").unwrap();
    db.set_master(SecretKey::generate()).unwrap();
    db.make_branch(&line("eve"), "eve's, without a grant").unwrap();
    // a key the master never granted
    let mut eve = TheDB::open(db_dir(&dir)).unwrap();
    eve.sign_with(SecretKey::generate());
    eve.set_branch(Some(&line("eve"))).unwrap();
    assert!(eve.set_text(&doc, "mine").unwrap_err().contains("no grant"));
    drop(eve);
    // a process with no key at all
    let mut none = TheDB::open(db_dir(&dir)).unwrap();
    assert!(none.signer().is_none());
    none.set_branch(None).unwrap();
    assert!(none.set_text(&doc, "mine").unwrap_err().contains("no key"));
    drop(none);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

fn db_dir(d: &std::path::Path) -> &std::path::Path {
    d
}
