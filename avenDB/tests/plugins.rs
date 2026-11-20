//! Deliverable 3 of intent 0050: the kernel's plugins. A changed head calls exactly the plugins watching its kind,
//! once; an unchanged head calls nothing; a kernel started again calls nothing it handled; the baker bakes one asset
//! at a time and says when the engine fails.

use avendb::AvenDb;
use avendb::plugin::{Plugin, Watcher};
use std::sync::{Arc, Mutex};

/// A store of its own, with a root.
fn fresh(name: &str) -> (Arc<AvenDb>, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("avendb-test-plugins-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let db = AvenDb::open(&dir).expect("the store opens");
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
    fn changed(&self, _db: &AvenDb, id: &str) -> avendb::Result<()> {
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
    let db = AvenDb::open(&dir).unwrap();
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

/// A store whose pinned engine is a script standing in for the engine's `--bake`: it logs its turn, notes any overlap
/// with another bake, and fails for the asset named "broken".
fn with_stub_engine(name: &str) -> (Arc<AvenDb>, std::path::PathBuf) {
    let (db, dir) = fresh(name);
    let stub = r#"#!/bin/sh
log="$AVENDB/bake.log"
[ "$1" = "--bake" ] || { echo "no --bake: $*" >> "$log"; exit 2; }
mkdir "$AVENDB/busy" 2>/dev/null || echo overlap >> "$log"
echo "start $2" >> "$log"
sleep 0.2
echo "end $2" >> "$log"
rmdir "$AVENDB/busy"
case "$(cat "$AVENDB/broken" 2>/dev/null)" in *"$2"*) exit 3;; esac
exit 0
"#;
    let engine = db.new("engine", "stub").unwrap();
    db.publish(&engine, stub.as_bytes(), &[], "sh").unwrap();
    let root = db.root().unwrap().unwrap();
    db.set_text(&root, &format!("{{\n  \"engine\": \"{engine}\"\n}}\n")).unwrap();
    (db, dir)
}

#[test]
fn the_baker_bakes_one_at_a_time() {
    let (db, dir) = with_stub_engine("queue");
    let assets: Vec<String> = (0..4).map(|i| db.new("asset", &format!("asset {i}")).unwrap()).collect();
    // four bakes asked for at once, from four threads: they wait their turn
    let threads: Vec<_> = assets
        .iter()
        .map(|id| {
            let (db, id) = (db.clone(), id.clone());
            std::thread::spawn(move || avendb::baker::bake(&db, &id))
        })
        .collect();
    for t in threads {
        t.join().unwrap().expect("each bake exits 0");
    }
    let log = std::fs::read_to_string(dir.join("bake.log")).unwrap();
    assert!(!log.contains("overlap") && !log.contains("no --bake"), "{log}");
    let lines: Vec<&str> = log.lines().collect();
    assert_eq!(lines.len(), 8, "{log}");
    for pair in lines.chunks(2) {
        assert_eq!(pair[0].replace("start", "end"), pair[1], "each bake ends before the next starts: {log}");
    }
    for id in &assets {
        assert!(log.contains(&format!("start {id}")), "{id} baked: {log}");
    }
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn the_baker_as_a_plugin_bakes_the_changed_asset_and_reports_a_failure() {
    let (db, dir) = with_stub_engine("plugin");
    let stone = db.new("asset", "stone").unwrap();
    let _wind = db.new("shader", "wind").unwrap();
    let mut w = Watcher::new(&db, vec![Box::new(avendb::baker::Baker)]).unwrap();
    assert_eq!(w.pass(&db).unwrap(), vec![("baker".to_string(), stone.clone())], "the asset only, not the shader or the engine");
    db.set_text(&stone, "{\"size\": 2}").unwrap();
    assert_eq!(w.pass(&db).unwrap().len(), 1);
    let log = std::fs::read_to_string(dir.join("bake.log")).unwrap();
    assert_eq!(log.matches(&format!("start {stone}")).count(), 2, "{log}");
    // a failing engine: the bake says so
    std::fs::write(dir.join("broken"), &stone).unwrap();
    let e = avendb::baker::bake(&db, &stone).unwrap_err();
    assert!(e.contains("exit 3"), "{e}");
    drop((w, db));
    let _ = std::fs::remove_dir_all(dir);
}
