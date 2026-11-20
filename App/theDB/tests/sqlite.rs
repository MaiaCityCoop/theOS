//! Intent 0053's checks, and what came with it: docs in SQLite (a store from before moved in; every version by id and
//! by hash; two processes writing one doc; a one-line edit stores bytes, not a snapshot; `find`), the
//! compost's 30 days, and a clean store (`fresh`).

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use thedb::compost::{self, COMPOST, DAYS};
use thedb::loro::{ExportMode, LoroDoc};
use thedb::{Find, Hash, TheDB};

fn dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("thedb-sqlite-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn fresh(name: &str) -> (TheDB, PathBuf) {
    let dir = dir(name);
    (TheDB::open(&dir).expect("the store opens"), dir)
}

/// The bytes SQLite keeps for the version `hash`, and whether they are a whole snapshot.
fn stored(dir: &Path, hash: Hash) -> (usize, bool) {
    let conn = rusqlite::Connection::open(dir.join("theDB.sqlite")).unwrap();
    conn.query_row("SELECT length(bytes), depth FROM versions WHERE hash = ?1", [hash.to_hex().to_string()], |r| Ok((r.get::<_, i64>(0)? as usize, r.get::<_, i64>(1)? == 0))).unwrap()
}

// ---- a store from before SQLite, written as the code before it wrote one ----

/// A doc's id, made the way ids are (26 letters of the id alphabet, the first a-z).
fn id(n: u32) -> String {
    let a = b"abcdefghijklmnopqrstuvwxyz234567";
    let h = Hash::new(format!("old {n}").as_bytes());
    let mut s: String = h.as_bytes()[..26].iter().map(|b| a[(b & 31) as usize] as char).collect();
    s.replace_range(0..1, "q");
    s
}

/// A store as the code before SQLite left it: each commit's snapshot a blob, `doc/<id>` and `branch/<b>/<id>` tags
/// to the latest, `branches/<b>` and `root` tags to blobs. Returns, per doc, every version's hash and its text.
struct Old {
    docs: Vec<(String, Vec<(Hash, String)>)>,
    branch_head: (String, Hash, String),
    root: String,
}

fn old_store(dir: &Path) -> Old {
    use iroh_blobs::store::fs::FsStore;
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
    rt.block_on(async {
        let fs = FsStore::load(dir).await.unwrap();
        let store: iroh_blobs::api::Store = (*fs).clone();
        let put = async |b: Vec<u8>| store.blobs().add_bytes(b).await.unwrap().hash;
        let mut docs = Vec::new();
        for n in 0..3u32 {
            let id = id(n);
            let doc = LoroDoc::new();
            doc.get_map("meta").insert("kind", "text").unwrap();
            doc.get_map("meta").insert("name", format!("old doc {n}")).unwrap();
            let mut versions = Vec::new();
            for v in 0..4 {
                let text = format!("doc {n}, version {v}: {}", "words ".repeat(v + 1));
                let t = doc.get_text("text");
                t.delete(0, t.len_unicode()).unwrap();
                t.insert(0, &text).unwrap();
                doc.commit();
                let h = put(doc.export(ExportMode::Snapshot).unwrap()).await;
                store.tags().set(format!("doc/{id}"), h).await.unwrap();
                versions.push((h, text));
            }
            docs.push((id, versions));
        }
        // a branch that changed doc 1
        let about = put(b"an old branch".to_vec()).await;
        store.tags().set("branches/old-branch", about).await.unwrap();
        let doc = LoroDoc::from_snapshot(&store.blobs().get_bytes(docs[1].1[3].0).await.unwrap()).unwrap();
        doc.get_text("text").insert(0, "branch: ").unwrap();
        doc.commit();
        let text = doc.get_text("text").to_string();
        let h = put(doc.export(ExportMode::Snapshot).unwrap()).await;
        store.tags().set(format!("branch/old-branch/{}", docs[1].0), h).await.unwrap();
        let root = docs[0].0.clone();
        let r = put(root.as_bytes().to_vec()).await;
        store.tags().set("root", r).await.unwrap();
        store.shutdown().await.unwrap();
        let bid = docs_id(&docs, 1);
        Old { docs, branch_head: (bid, h, text), root }
    })
}

fn docs_id(docs: &[(String, Vec<(Hash, String)>)], n: usize) -> String {
    docs[n].0.clone()
}

#[test]
fn a_store_from_before_sqlite_moves_in_and_every_version_reads_back() {
    let dir = dir("move");
    let old = old_store(&dir);
    let mut db = TheDB::open(&dir).expect("the old store opens and moves into SQLite");
    assert_eq!(db.root().unwrap().as_deref(), Some(old.root.as_str()), "the root moved");
    for (id, versions) in &old.docs {
        // by id: the head
        let (last, text) = versions.last().unwrap();
        assert_eq!(db.head(id).unwrap(), Some(*last), "{id}: the head keeps its hash");
        assert_eq!(db.text(id).unwrap().as_deref(), Some(text.as_str()));
        // by hash: every version, the earlier ones from their snapshot blobs as before
        for (h, text) in versions {
            assert_eq!(&db.doc_at(*h).unwrap().get_text("text").to_string(), text, "{id} at {h}");
            assert_eq!(db.file_at(*h).unwrap(), text.as_bytes());
        }
        assert_eq!(db.meta(id).unwrap().0, "text");
    }
    assert_eq!(db.branches().unwrap(), vec!["old-branch".to_string()]);
    assert_eq!(db.about("old-branch").unwrap(), "an old branch");
    let (bid, bh, btext) = &old.branch_head;
    assert_eq!(db.changed_on("old-branch").unwrap(), vec![(bid.clone(), *bh)], "the branch's head moved");
    db.set_branch(Some("old-branch")).unwrap();
    assert_eq!(db.text(bid).unwrap().as_deref(), Some(btext.as_str()));
    db.set_branch(None).unwrap();
    // found without opening a doc
    assert_eq!(db.find(Find::Name("old doc 2")).unwrap().len(), 1);
    // a commit after the move follows the moved head, as an update
    let v = db.set_text(&old.docs[2].0, "after the move").unwrap();
    assert_eq!(db.doc_at(v).unwrap().get_text("text").to_string(), "after the move");
    drop(db);
    // opening again moves nothing twice, and it is all there
    let db = TheDB::open(&dir).unwrap();
    assert_eq!(db.text(&old.docs[2].0).unwrap().as_deref(), Some("after the move"));
    assert_eq!(db.docs().unwrap().len(), 3);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn every_version_by_id_and_by_hash_survives_reopening() {
    let (db, dir) = fresh("versions");
    let id = db.new("text", "a long poem").unwrap();
    let mut versions = Vec::new();
    for v in 0..40 {
        let text = (0..=v).map(|l| format!("line {l}\n")).collect::<String>();
        versions.push((db.set_text(&id, &text).unwrap(), text));
    }
    drop(db);
    let db = TheDB::open(&dir).unwrap();
    for (h, text) in &versions {
        assert_eq!(&String::from_utf8(db.file_at(*h).unwrap()).unwrap(), text, "the version {h}");
    }
    assert_eq!(db.head(&id).unwrap(), Some(versions.last().unwrap().0));
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_one_line_edit_of_a_large_doc_stores_bytes_not_a_snapshot() {
    let (db, dir) = fresh("small");
    let id = db.new("text", "a large shader").unwrap();
    let text: String = (0..5000).map(|l| format!("let line_{l} = vec3<f32>({l}.0, 0.5, 1.0);\n")).collect();
    let before = db.set_text(&id, &text).unwrap();
    let edited = text.replace("let line_2500 = ", "let line_2500_moved = ");
    let after = db.set_text(&id, &edited).unwrap();
    let (snap, whole) = stored(&dir, before);
    let (edit, edit_whole) = stored(&dir, after);
    let snapshot_now = db.doc_at(after).unwrap().export(ExportMode::Snapshot).unwrap().len();
    println!("a {} byte doc: its first version keeps {snap} bytes (a snapshot: {whole}); a one-line edit keeps {edit} bytes (a snapshot: {edit_whole}); a snapshot of it would be {snapshot_now} bytes", text.len());
    assert!(!edit_whole, "the edit is kept as an update");
    assert!(edit < 1024, "a one-line edit keeps bytes, not kilobytes: {edit}");
    assert!(edit * 50 < snapshot_now, "{edit} against a snapshot of {snapshot_now}");
    assert_eq!(db.text(&id).unwrap().as_deref(), Some(edited.as_str()));
    assert_eq!(db.file_at(before).unwrap(), text.as_bytes());
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

/// Two writers committing one doc at once, in one process through two connections: both edits are in the head.
#[test]
fn two_writers_at_once_both_keep_their_edit() {
    let (db, dir) = fresh("cas");
    let id = db.new("text", "a log").unwrap();
    db.set_text(&id, "start\n").unwrap();
    let other = TheDB::open(&dir).unwrap();
    std::thread::scope(|s| {
        for (who, db) in [("a", &db), ("b", &other)] {
            let id = id.clone();
            s.spawn(move || {
                for n in 0..25 {
                    let doc = db.doc(&id).unwrap();
                    let t = doc.get_text("text");
                    t.insert(t.len_unicode(), &format!("{who}{n}\n")).unwrap();
                    db.commit(&id, &doc).unwrap();
                }
            });
        }
    });
    let text = db.text(&id).unwrap().unwrap();
    for who in ["a", "b"] {
        for n in 0..25 {
            assert!(text.lines().any(|l| l == format!("{who}{n}")), "{who}{n} is lost:\n{text}");
        }
    }
    drop(other);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

/// The same with processes: `theDB` run many times at once, each reading the doc, adding its line and writing it.
#[test]
fn two_processes_writing_at_once_both_keep_their_edit() {
    let (db, dir) = fresh("processes");
    let id = db.new("text", "a log").unwrap();
    db.set_text(&id, "start\n").unwrap();
    drop(db);
    let bin = env!("CARGO_BIN_EXE_theDB");
    std::thread::scope(|s| {
        for who in ["a", "b"] {
            let (id, dir) = (id.clone(), dir.clone());
            s.spawn(move || {
                for n in 0..6 {
                    let file = dir.join(format!("{who}{n}.txt"));
                    let now = std::process::Command::new(bin).args(["cat", &id]).env("THEDB", &dir).env_remove("THEDB_BRANCH").output().unwrap();
                    assert!(now.status.success(), "{}", String::from_utf8_lossy(&now.stderr));
                    let mut text = String::from_utf8(now.stdout).unwrap();
                    text.push_str(&format!("{who}{n}\n"));
                    std::fs::write(&file, text).unwrap();
                    let put = std::process::Command::new(bin).args(["put", &id, file.to_str().unwrap()]).env("THEDB", &dir).env_remove("THEDB_BRANCH").output().unwrap();
                    assert!(put.status.success(), "{}", String::from_utf8_lossy(&put.stderr));
                }
            });
        }
    });
    let db = TheDB::open(&dir).unwrap();
    let text = db.text(&id).unwrap().unwrap();
    for who in ["a", "b"] {
        for n in 0..6 {
            assert!(text.lines().any(|l| l == format!("{who}{n}")), "{who}{n} is lost:\n{text}");
        }
    }
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn find_by_kind_name_and_words() {
    let (mut db, dir) = fresh("find");
    let wind = db.new("shader", "wind.wesl").unwrap();
    db.set_text(&wind, "fn sway(gust: f32) -> f32 { gust * 0.5 }").unwrap();
    let grid = db.new("shader", "grid.wesl").unwrap();
    db.set_text(&grid, "fn lines() {}").unwrap();
    let world = db.new("world", "Day one").unwrap();
    db.set_text(&world, r#"{"ground": "green", "sky": "light"}"#).unwrap();
    let ids = |f: Vec<thedb::Found>| f.into_iter().map(|f| f.id).collect::<Vec<_>>();
    let mut shaders = ids(db.find(Find::Kind("shader")).unwrap());
    shaders.sort();
    let mut want = vec![wind.clone(), grid.clone()];
    want.sort();
    assert_eq!(shaders, want);
    assert_eq!(ids(db.find(Find::Name("WIND")).unwrap()), vec![wind.clone()]);
    assert_eq!(ids(db.find(Find::Words("gust sway")).unwrap()), vec![wind.clone()]);
    assert_eq!(ids(db.find(Find::Words("green")).unwrap()), vec![world.clone()]);
    assert!(db.find(Find::Words("gust green")).unwrap().is_empty(), "every word must be there");
    assert!(db.find(Find::Words("\"unbalanced OR (")).unwrap().is_empty(), "what a person types is no query syntax");
    // a doc made on a branch is found there, not on main
    db.make_branch("try", "").unwrap();
    db.set_branch(Some("try")).unwrap();
    let rain = db.new("shader", "rain.wesl").unwrap();
    assert_eq!(ids(db.find(Find::Name("rain")).unwrap()), vec![rain]);
    db.set_branch(None).unwrap();
    assert!(db.find(Find::Name("rain")).unwrap().is_empty());
    // a forgotten doc is found no more
    db.forget(&grid).unwrap();
    assert_eq!(ids(db.find(Find::Kind("shader")).unwrap()), vec![wind]);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

fn png(w: u32, h: u32) -> Vec<u8> {
    let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
    b.extend(w.to_be_bytes());
    b.extend(h.to_be_bytes());
    b.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]);
    b
}

// ---- the compost ----

#[test]
fn the_compost_keeps_things_30_days_and_the_archive_for_good() {
    let (db, dir) = fresh("compost");
    std::fs::write(dir.join("old notes.txt"), "legacy").unwrap();
    std::fs::create_dir_all(dir.join("old views/a")).unwrap();
    std::fs::write(dir.join("old views/a/f"), "x").unwrap();
    std::fs::write(dir.join("keep.txt"), "keep").unwrap();
    // the store's own files are not moved this way
    assert!(db.compost("blobs.db", "no").is_err());
    assert!(db.compost("theDB.sqlite", "no").is_err());
    assert!(db.compost("compost", "no").is_err());
    assert!(db.compost("../elsewhere", "no").is_err());
    let at = db.compost("old notes.txt", "day 1").unwrap();
    assert!(!dir.join("old notes.txt").exists() && at.join("old notes.txt").exists());
    db.compost("old views", "stale views").unwrap();
    db.archive("keep.txt", "worth keeping").unwrap();
    let about: serde_json::Value = serde_json::from_slice(&std::fs::read(at.join("about.json")).unwrap()).unwrap();
    assert_eq!(about["why"], "day 1");
    assert_eq!(about["what"][0], "old notes.txt");
    assert!(about["when"].as_u64().unwrap() > 0);
    assert_eq!(db.composted().len(), 2);
    assert_eq!(db.archived().len(), 1);
    drop(db);
    // a month passes, by the clock the sweep is given
    let now = SystemTime::now();
    assert!(compost::sweep(&dir, now + Duration::from_secs((DAYS - 1) * 86_400)).is_empty(), "29 days: still there");
    let gone = compost::sweep(&dir, now + Duration::from_secs(DAYS * 86_400 + 60));
    assert_eq!(gone.len(), 2, "30 days: deleted for good");
    assert!(std::fs::read_dir(dir.join(COMPOST)).unwrap().next().is_none());
    assert_eq!(compost::held(&dir, compost::ARCHIVE).len(), 1, "the archive keeps what it holds");
    // what has no about.json is not dated, and stays
    std::fs::create_dir_all(dir.join(COMPOST).join("by hand")).unwrap();
    assert!(compost::sweep(&dir, now + Duration::from_secs(1000 * 86_400)).is_empty());
    // an entry already due goes when the store opens
    compost::put_away(&dir, COMPOST, &[], "an old thing", "a test", now - Duration::from_secs(DAYS * 86_400 + 1)).unwrap();
    assert_eq!(compost::held(&dir, COMPOST).len(), 2);
    let db = TheDB::open(&dir).unwrap();
    assert_eq!(db.composted().len(), 1, "only the undated folder is left");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

// ---- a clean store ----

#[test]
fn fresh_keeps_only_what_the_root_reaches() {
    let dir = dir("fresh");
    // a store from before SQLite, then moved in: its old versions are blobs, one of them pinned by a build
    let old = old_store(&dir);
    let mut db = TheDB::open(&dir).unwrap();
    let (src_id, src_versions) = &old.docs[2];
    let pinned_src = src_versions[1].0;
    // the engine: a tree naming its source doc; two builds, the second pinned, whose manifest names an older version
    let tree = db.new("tree", "theOS").unwrap();
    db.set_text(&tree, &format!(r#"{{"files": {{"src/lib.rs": "{src_id}"}}, "shape": {{}}}}"#)).unwrap();
    let engine = db.new("engine", "theOS").unwrap();
    let manifest = |v: Hash| format!(r#"{{"tree": null, "files": {{"src/lib.rs": "{v}"}}}}"#).into_bytes();
    let first = db.publish(&engine, b"\xcf\xfa an old binary", &manifest(src_versions[0].0), "rustc").unwrap();
    let pinned = db.publish(&engine, b"\xcf\xfa the binary", &manifest(pinned_src), "rustc").unwrap();
    let mut e = db.engine(&engine).unwrap();
    e.tree = Some(tree.clone());
    db.set_text(&engine, &serde_json::to_string(&e).unwrap()).unwrap();
    assert_eq!(e.builds.len(), 2);
    // a shader named only in a text; a world with a part; a font as a file
    let grid = db.new("shader", "grid.wesl").unwrap();
    db.set_text(&grid, "fn grid() {}").unwrap();
    let recipe = db.new("recipe", "a recipe in words").unwrap();
    db.set_text(&recipe, &format!("the ground is drawn by {grid}, nothing else")).unwrap();
    let world = db.new("world", "day 1").unwrap();
    db.set_text(&world, &format!(r#"{{"recipe": "{recipe}"}}"#)).unwrap();
    db.set_part(&world, "ground", &png(4, 4)).unwrap();
    let font = db.new("font", "mono").unwrap();
    db.set_file(&font, b"wOF2\0\x01\0\0 a font").unwrap();
    let kernel = db.new("kernel", "theKERNEL").unwrap();
    db.set_text(&kernel, &format!(r#"{{"baker": {{"{world}": "{pinned}", "{}": "{pinned}"}}}}"#, old.docs[1].0)).unwrap();
    let root = db.new("root", "root").unwrap();
    db.set_text(&root, &format!(r#"{{"engine": "{engine}", "world": "{world}", "kernel": "{kernel}", "fonts": {{"mono": "{font}"}}}}"#)).unwrap();
    db.set_root(&root).unwrap();
    // what is not reached: a doc, a blob, a branch, a proposal, the old docs 0 and 1
    let stray = db.new("note", "stray").unwrap();
    db.set_text(&stray, "nobody names me").unwrap();
    let stray_blob = db.put(b"a stray blob".to_vec()).unwrap();
    db.make_branch("a-branch", "work in progress").unwrap();
    db.set_branch(Some("a-branch")).unwrap();
    db.set_text(&world, r#"{"recipe": "changed on a branch"}"#).unwrap();
    db.set_branch(None).unwrap();
    db.new("proposal", "a proposal").unwrap();
    let before: Vec<(String, Hash)> = db.docs().unwrap();
    let reach = db.reach().unwrap();
    let mut want: Vec<String> = vec![root.clone(), engine.clone(), tree.clone(), src_id.clone(), grid.clone(), recipe.clone(), world.clone(), font.clone(), kernel.clone()];
    want.sort();
    assert_eq!(reach.docs.keys().cloned().collect::<Vec<_>>(), want, "what the root reaches");
    assert_eq!(reach.versions.get(&pinned_src), Some(src_id), "the pinned build's source version, from before SQLite, is a version of its doc");
    let heads: std::collections::BTreeMap<String, Hash> = before.iter().cloned().collect();
    let pinned_binary = Hash::new(b"\xcf\xfa the binary");

    let f = db.fresh("day 1").unwrap();
    assert_eq!(f.docs, want.len());
    assert!(f.composted.ends_with(format!("{} the store before day 1", compost::day(thedb_now()))), "{}", f.composted.display());
    for gone in ["blobs.db", "data", "theDB.sqlite"] {
        assert!(f.composted.join(gone).exists(), "the old {gone} is in the compost");
    }
    let db = TheDB::open(&dir).unwrap();
    // the old store, as it lies in the compost, for the comparison
    let was = TheDB::open(&f.composted).unwrap();
    assert_eq!(db.root().unwrap().as_deref(), Some(root.as_str()));
    let mut ids: Vec<String> = db.docs().unwrap().into_iter().map(|(id, _)| id).collect();
    ids.sort();
    assert_eq!(ids, want, "only what was reached");
    assert!(db.branches().unwrap().is_empty(), "no branches");
    assert!(db.find(Find::Kind("proposal")).unwrap().is_empty(), "no proposals");
    for id in &want {
        if *id == engine || *id == kernel {
            continue;
        }
        assert_eq!(db.head(id).unwrap(), heads.get(id).copied(), "{id} keeps its version and its hash");
        assert_eq!(db.file(id).unwrap(), was.file(id).unwrap(), "{id} reads the same");
    }
    // the engine: only its pinned build, its binary whole
    let e = db.engine(&engine).unwrap();
    assert_eq!(e.pinned.as_deref(), Some(pinned.to_hex().as_str()));
    assert_eq!(e.builds, vec![pinned.to_hex().to_string()]);
    assert_eq!(e.tree.as_deref(), Some(tree.as_str()));
    assert_eq!(db.get(pinned_binary).unwrap().unwrap().as_ref(), b"\xcf\xfa the binary");
    assert!(db.get(Hash::new(b"\xcf\xfa an old binary")).unwrap().is_none(), "the unpinned build's binary is left behind");
    assert!(db.get(first).unwrap().is_none());
    let dir2 = dir.join("checkout");
    db.checkout_build(&pinned.to_hex(), &dir2).unwrap();
    assert_eq!(std::fs::read_to_string(dir2.join("src/lib.rs")).unwrap(), src_versions[1].1, "the pinned source version still checks out");
    // the kernel remembers only docs that stay
    let k: serde_json::Value = serde_json::from_str(&db.text(&kernel).unwrap().unwrap()).unwrap();
    assert_eq!(k["baker"].as_object().unwrap().len(), 1);
    assert!(db.get(stray_blob).unwrap().is_none());
    assert!(db.head(&stray).unwrap().is_none());
    assert_eq!(db.part(&world, "ground").unwrap().unwrap().as_ref(), png(4, 4).as_slice());
    drop(was);
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

fn thedb_now() -> u64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs()
}
