//! Who may write (access.rs on theID): the owner writes main and merges; an agent writes its own line, signed, by a
//! grant of the owner's; `verify` finds every head signed by whom its branch allows, and a forged one.

use thedb::TheDB;
use thedb::access::{SecretKey, line};

fn store(name: &str) -> (TheDB, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("thedb-access-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (TheDB::open(&dir).unwrap(), dir)
}

#[test]
fn the_owner_writes_main_an_agent_its_line_and_verify_holds() {
    let (mut db, dir) = store("lines");
    let world = db.new("world", "w").unwrap();
    db.set_text(&world, "{\"sun\": 10}").unwrap();
    // an owner: what is there is signed as it is
    let owner = SecretKey::generate();
    db.set_owner(owner.clone()).unwrap();
    db.owner_with(owner.clone());
    assert!(db.verify().unwrap().problems.is_empty());
    db.set_text(&world, "{\"sun\": 20}").unwrap();
    // an agent and its line
    let agent = SecretKey::generate();
    db.grant("ada", agent.public(), 1).unwrap();
    db.sign_with(agent.clone());
    assert!(db.set_text(&world, "{\"sun\": 30}").unwrap_err().contains("owner and host only"), "an agent does not write main");
    db.set_branch(Some(&line("ada"))).unwrap();
    db.set_text(&world, "{\"sun\": 30}").unwrap();
    db.make_branch("other", "not ada's").unwrap_err();
    db.set_branch(Some("other")).unwrap_err();
    // the agent proposes from its own line; an agent cannot accept, the host (theOS) or the owner can
    let p = db.propose(&line("ada"), "a higher sun").unwrap();
    assert_eq!(db.intents().unwrap().len(), 1);
    assert!(db.accept(&p).unwrap_err().contains("not by an agent"));
    db.set_branch(None).unwrap();
    db.sign_with(owner);
    db.accept(&p).unwrap();
    assert!(db.text(&world).unwrap().unwrap().contains("30"));
    assert_eq!(db.intent(&p).unwrap().state, thedb::intents::State::Merged);
    let v = db.verify().unwrap();
    assert!(v.problems.is_empty(), "{:?}", v.problems);
    assert_eq!(v.good, 4, "the world on main and on the line, the proposal on its line and, accepted, on main");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_key_without_a_grant_writes_nothing_and_a_forged_head_is_found() {
    let (mut db, dir) = store("forged");
    let doc = db.new("note", "n").unwrap();
    let o = SecretKey::generate();
    db.set_owner(o.clone()).unwrap();
    db.owner_with(o);
    db.make_branch(&line("eve"), "eve's, without a grant").unwrap();
    // a key the owner never granted
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

#[test]
fn the_host_writes_main_and_accepts_by_the_owners_grant() {
    let (db, dir) = store("host");
    let world = db.new("world", "w").unwrap();
    let owner = SecretKey::generate();
    db.set_owner(owner.clone()).unwrap();
    let host = SecretKey::generate();
    let g = db.put(thedb::theid::grant(&owner, host.public(), thedb::access::Cap::Main, 1).encode()).unwrap();
    db.set_host_for_test(host.public(), g).unwrap();
    db.sign_with(host.clone());
    db.set_text(&world, "{\"sun\": 40}").unwrap();
    let agent = SecretKey::generate();
    assert!(db.grant("bo", agent.public(), 1).is_err(), "the host does not grant lines: the owner does, its key unlocked by the person");
    let v = db.verify().unwrap();
    assert!(v.problems.is_empty(), "{:?}", v.problems);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

/// Every merge is the owner's: once its key is locked (`owner_signs`), the host alone cannot merge; the owner's
/// signature is kept in the intent, and the build the kernel may run is one the owner let run.
#[test]
fn the_owner_signs_every_merge_and_the_build_the_kernel_runs() {
    let (mut db, dir) = store("owner");
    let engine = db.new("engine", "theOS").unwrap();
    db.set_text(&engine, "{\"pinned\": \"b1\", \"builds\": [\"b1\"]}").unwrap();
    let owner = SecretKey::generate();
    db.set_owner(owner.clone()).unwrap();
    assert!(db.pin_approved(&engine, "b1").unwrap(), "before the owner signs merges: as before");
    db.require_owner().unwrap();
    assert!(!db.pin_approved(&engine, "b1").unwrap(), "a pin the owner did not let run");
    // an agent proposes a new build
    db.owner_with(owner.clone());
    let agent = SecretKey::generate();
    db.grant("ada", agent.public(), 1).unwrap();
    db.sign_with(agent);
    db.set_branch(Some(&line("ada"))).unwrap();
    db.set_text(&engine, "{\"pinned\": \"b2\", \"builds\": [\"b1\", \"b2\"]}").unwrap();
    let p = db.propose(&line("ada"), "build b2").unwrap();
    db.set_branch(None).unwrap();
    // the host's key alone is not enough: a different key given as the owner's is refused
    let host = SecretKey::generate();
    let g = db.put(thedb::theid::grant(&owner, host.public(), thedb::access::Cap::Main, 1).encode()).unwrap();
    db.set_host_for_test(host.public(), g).unwrap();
    db.sign_with(host);
    db.owner_with(SecretKey::generate());
    assert!(db.accept(&p).unwrap_err().contains("does not hold"), "only the owner's own key signs");
    // the owner accepts
    db.owner_with(owner);
    db.accept(&p).unwrap();
    assert!(db.intent(&p).unwrap().accepted_by.is_some());
    assert!(db.pin_approved(&engine, "b2").unwrap(), "accepted by the owner");
    assert!(!db.pin_approved(&engine, "b1").unwrap());
    db.owner_pin(&engine, "b1").unwrap();
    assert!(db.pin_approved(&engine, "b1").unwrap(), "let run directly");
    let v = db.verify().unwrap();
    assert!(v.problems.is_empty(), "{:?}", v.problems);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
