//! The kernel's plugins (intent 0050). A changed head calls exactly the plugins watching its kind, once; an unchanged
//! head calls nothing; a branch's edit calls nothing until merged; a kernel started again calls nothing it handled.

use thedb::TheDB;
use thedb::plugin::{Plugin, Watcher};
use std::sync::{Arc, Mutex};

/// A store of its own, with a root.
fn fresh(name: &str) -> (Arc<TheDB>, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("thedb-test-plugins-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let db = TheDB::open(&dir).expect("the store opens");
    let root = db.new("root", "root").unwrap();
    db.set_text(&root, "{\n  \"library\": []\n}\n").unwrap();
    db.set_root(&root).unwrap();
    (Arc::new(db), dir)
}

/// A plugin that writes down its calls.
struct Tally {
    name: &'static str,
    kinds: &'static [&'static str],
    calls: Arc<Mutex<Vec<String>>>,
}

impl Plugin for Tally {
    fn name(&self) -> &str {
        self.name
    }
    fn kinds(&self) -> &[&str] {
        self.kinds
    }
    fn changed(&self, _db: &TheDB, id: &str) -> thedb::Result<()> {
        self.calls.lock().unwrap().push(id.to_string());
        Ok(())
    }
}

fn tallies() -> (Vec<Box<dyn Plugin>>, Arc<Mutex<Vec<String>>>, Arc<Mutex<Vec<String>>>) {
    let (assets, shaders) = (Arc::new(Mutex::new(Vec::new())), Arc::new(Mutex::new(Vec::new())));
    let plugins: Vec<Box<dyn Plugin>> = vec![
        Box::new(Tally { name: "assets", kinds: &["asset"], calls: assets.clone() }),
        Box::new(Tally { name: "shaders", kinds: &["shader"], calls: shaders.clone() }),
    ];
    (plugins, assets, shaders)
}

fn take(calls: &Arc<Mutex<Vec<String>>>) -> Vec<String> {
    std::mem::take(&mut *calls.lock().unwrap())
}

#[test]
fn a_changed_head_calls_its_watchers_once() {
    let (db, dir) = fresh("once");
    let stone = db.new("asset", "stone").unwrap();
    let wind = db.new("shader", "wind").unwrap();
    let (plugins, assets, shaders) = tallies();
    let mut w = Watcher::new(&db, plugins).unwrap();
    w.pass(&db).unwrap();
    assert_eq!(take(&assets), vec![stone.clone()], "an asset first seen: the asset plugin only");
    assert_eq!(take(&shaders), vec![wind.clone()], "a shader first seen: the shader plugin only");
    // nothing changed: nothing called
    assert!(w.pass(&db).unwrap().is_empty());
    assert!(take(&assets).is_empty() && take(&shaders).is_empty());
    // the asset changes: its watcher once, the other not
    db.set_text(&stone, "{\"size\": 2}").unwrap();
    assert_eq!(w.pass(&db).unwrap(), vec![("assets".to_string(), stone.clone())]);
    assert!(w.pass(&db).unwrap().is_empty(), "the same head again: nothing");
    assert_eq!(take(&assets), vec![stone.clone()]);
    assert!(take(&shaders).is_empty());
    drop((w, db));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_kernel_started_again_calls_nothing_it_handled() {
    let (db, dir) = fresh("restart");
    let stone = db.new("asset", "stone").unwrap();
    let (plugins, assets, _) = tallies();
    let mut w = Watcher::new(&db, plugins).unwrap();
    w.pass(&db).unwrap();
    assert_eq!(take(&assets), vec![stone.clone()]);
    drop(w);
    // the store closed and opened again, a new watcher: what was handled stays handled
    let db = Arc::into_inner(db).unwrap();
    drop(db);
    let db = TheDB::open(&dir).unwrap();
    let root = db.root().unwrap().unwrap();
    let root_doc: serde_json::Value = serde_json::from_str(&db.text(&root).unwrap().unwrap()).unwrap();
    assert!(root_doc["kernel"].is_string() && root_doc["library"].is_array(), "the root names the kernel's doc and keeps the rest");
    let (plugins, assets, _) = tallies();
    let mut w = Watcher::new(&db, plugins).unwrap();
    assert!(w.pass(&db).unwrap().is_empty(), "nothing called again");
    // and a change made while no kernel ran is called once
    db.set_text(&stone, "{\"size\": 3}").unwrap();
    w.pass(&db).unwrap();
    assert_eq!(take(&assets), vec![stone]);
    drop((w, db));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_branch_edit_calls_nothing_until_it_is_merged() {
    let (db, dir) = fresh("branch");
    let stone = db.new("asset", "stone").unwrap();
    let (plugins, assets, _) = tallies();
    let mut w = Watcher::new(&db, plugins).unwrap();
    w.pass(&db).unwrap();
    assert_eq!(take(&assets), vec![stone.clone()]);
    // an edit on a branch: main's head stays, nothing is called
    db.make_branch("try", "a trial").unwrap();
    let doc = db.doc(&stone).unwrap();
    doc.get_text("text").insert(0, "on the branch").unwrap();
    db.commit_on(Some("try"), &stone, &doc).unwrap();
    assert!(w.pass(&db).unwrap().is_empty(), "a branch's edit calls nothing");
    // the same edit on main is called once
    db.commit_on(None, &stone, &doc).unwrap();
    assert_eq!(w.pass(&db).unwrap(), vec![("assets".to_string(), stone)]);
    drop(w);
    // a process on a branch runs no watcher
    let mut db = Arc::into_inner(db).unwrap();
    db.set_branch(Some("try")).unwrap();
    let (plugins, _, _) = tallies();
    assert!(Watcher::new(&db, plugins).is_err());
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
