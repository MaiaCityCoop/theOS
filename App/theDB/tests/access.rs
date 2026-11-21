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
    // the agent proposes from its own line; an agent cannot accept, the host (theOS) or the master can
    let p = db.propose(&line("ada"), "a higher sun").unwrap();
    assert_eq!(db.intents().unwrap().len(), 1);
    assert!(db.accept(&p).unwrap_err().contains("not by an agent"));
    db.set_branch(None).unwrap();
    db.sign_with(master);
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

#[test]
fn the_host_writes_main_and_accepts_by_the_masters_grant() {
    let (db, dir) = store("host");
    let world = db.new("world", "w").unwrap();
    let master = SecretKey::generate();
    db.set_master(master.clone()).unwrap();
    let host = SecretKey::generate();
    let g = db.put(thedb::theid::grant(&master, host.public(), thedb::access::Cap::Main, 1).encode()).unwrap();
    db.set_host_for_test(host.public(), g).unwrap();
    db.sign_with(host.clone());
    db.set_text(&world, "{\"sun\": 40}").unwrap();
    let agent = SecretKey::generate();
    assert!(db.grant("bo", agent.public(), 1).is_err(), "the host does not grant lines");
    let v = db.verify().unwrap();
    assert!(v.problems.is_empty(), "{:?}", v.problems);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

/// Accepting is the person's: with a person's key in the store, the host alone cannot merge; the person's signature
/// is kept in the proposal, and the build the kernel may run is one a person approved.
#[test]
fn a_person_accepts_and_approves_the_build_the_kernel_runs() {
    use thedb::access::Person;
    let (mut db, dir) = store("person");
    let engine = db.new("engine", "theOS").unwrap();
    db.set_text(&engine, "{\"pinned\": \"b1\", \"builds\": [\"b1\"]}").unwrap();
    let master = SecretKey::generate();
    db.set_master(master.clone()).unwrap();
    let person = Person::soft();
    db.add_person(&person.public()).unwrap();
    assert!(!db.pin_approved(&engine, "b1").unwrap(), "a pin no person approved");
    // an agent proposes a new build
    let agent = SecretKey::generate();
    db.grant("ada", agent.public(), 1).unwrap();
    db.sign_with(agent);
    db.set_branch(Some(&line("ada"))).unwrap();
    db.set_text(&engine, "{\"pinned\": \"b2\", \"builds\": [\"b1\", \"b2\"]}").unwrap();
    let p = db.propose(&line("ada"), "build b2").unwrap();
    db.set_branch(None).unwrap();
    // the host's key (or the master's, read from the Keychain) is not enough
    let host = SecretKey::generate();
    let g = db.put(thedb::theid::grant(&master, host.public(), thedb::access::Cap::Main, 1).encode()).unwrap();
    db.set_host_for_test(host.public(), g).unwrap();
    db.sign_with(host);
    assert!(db.accept(&p).unwrap_err().contains("no person's key"));
    db.present_with(Person::soft());
    assert!(db.accept(&p).unwrap_err().contains("not one the master stands behind"));
    // the person accepts
    db.present_with(person);
    db.accept(&p).unwrap();
    assert!(db.intent(&p).unwrap().approval.is_some());
    assert!(db.pin_approved(&engine, "b2").unwrap(), "accepted by the person");
    assert!(!db.pin_approved(&engine, "b1").unwrap());
    db.approve_pin(&engine, "b1").unwrap();
    assert!(db.pin_approved(&engine, "b1").unwrap(), "approved directly");
    let v = db.verify().unwrap();
    assert!(v.problems.is_empty(), "{:?}", v.problems);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
