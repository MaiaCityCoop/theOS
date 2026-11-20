//! Checks 1, 3 and 4 of intent 0051: branches read main and keep their own commits; two views on two branches edit one
//! file and both merge; two branches that each build but break together are refused, main unchanged.

use avendb::AvenDb;
use avendb::source::{Shape, State};
use std::path::{Path, PathBuf};

fn fresh(name: &str) -> (AvenDb, PathBuf) {
    let dir = std::env::temp_dir().join(format!("avendb-src-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    (AvenDb::open(&dir).expect("the store opens"), dir)
}

fn write(dir: &Path, path: &str, text: &str) {
    let p = dir.join(path);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
}

fn read(dir: &Path, path: &str) -> String {
    std::fs::read_to_string(dir.join(path)).unwrap()
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
    // main meanwhile: its change of b is seen on the branch, its a stays its own
    db.set_branch(None).unwrap();
    assert_eq!(db.text(&a).unwrap().as_deref(), Some("main a"), "main does not see the branch");
    db.set_text(&b, "main b, later").unwrap();
    db.set_branch(Some("try")).unwrap();
    assert_eq!(db.text(&b).unwrap().as_deref(), Some("main b, later"));
    assert!(db.forget(&a).is_err(), "forget is main's only");
    assert!(db.set_branch(Some("nowhere")).is_err());
    drop(db);
    // AVENDB_BRANCH puts a process on a branch
    unsafe { std::env::set_var("AVENDB_BRANCH", "try") };
    let db = AvenDb::open(&dir).unwrap();
    unsafe { std::env::remove_var("AVENDB_BRANCH") };
    assert_eq!(db.branch(), Some("try"));
    assert_eq!(db.text(&a).unwrap().as_deref(), Some("branch a"));
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

/// A store with a tree of one Rust file, checked by compiling it.
fn with_tree(name: &str) -> (AvenDb, PathBuf, String, PathBuf) {
    let (db, dir) = fresh(name);
    let git = dir.join("git");
    write(&git, "src/lib.rs", "pub fn one() -> u32 {\n    1\n}\n\npub fn two() -> u32 {\n    2\n}\n");
    write(&git, "notes.md", "not in the tree\n");
    let out = std::env::temp_dir().join(format!("avendb-src-{name}-{}.rmeta", std::process::id()));
    let shape = Shape {
        include: vec!["src".into()],
        check: vec![format!("rustc --edition 2021 --crate-type lib --emit=metadata -o {} src/lib.rs", out.display())],
        build: String::new(),
        binary: String::new(),
    };
    let tree = db.new_tree("a crate", &shape).unwrap();
    db.import(&tree, &git, &["src/lib.rs".into()]).unwrap();
    (db, dir, tree, git)
}

#[test]
fn a_tree_round_trips_through_a_view() {
    let (db, dir, tree, git) = with_tree("roundtrip");
    let view = dir.join("view");
    db.checkout(&tree, &view).unwrap();
    assert_eq!(read(&view, "src/lib.rs"), read(&git, "src/lib.rs"));
    assert!(!view.join("notes.md").exists(), "only the tree's paths");
    let snap = dir.join("snap");
    write(&snap, "src/old.rs", "gone on main\n");
    db.snapshot(&tree, &snap).unwrap();
    assert_eq!(read(&snap, "src/lib.rs"), read(&git, "src/lib.rs"));
    assert!(!snap.join("src/old.rs").exists(), "a snapshot removes what main does not have");
    assert!(!snap.join(".avendb.json").exists(), "a snapshot is no view");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn two_views_edit_one_file_and_both_merge() {
    let (mut db, dir, tree, _git) = with_tree("views");
    for b in ["left", "right"] {
        db.make_branch(b, "").unwrap();
        db.set_branch(Some(b)).unwrap();
        db.checkout(&tree, &dir.join(b)).unwrap();
    }
    let (left, right) = (dir.join("left"), dir.join("right"));
    write(&left, "src/lib.rs", &read(&left, "src/lib.rs").replace("    1\n", "    1 + 10\n"));
    write(&right, "src/lib.rs", &read(&right, "src/lib.rs").replace("    2\n", "    2 + 20\n"));
    write(&right, "src/more.rs", "pub fn three() -> u32 { 3 }\n");
    db.set_branch(Some("left")).unwrap();
    let s = db.sync(&left).unwrap();
    assert_eq!(s.edited, vec!["src/lib.rs".to_string()]);
    db.set_branch(Some("right")).unwrap();
    let s = db.sync(&right).unwrap();
    assert_eq!((s.edited.len(), s.added.len()), (1, 1));
    db.set_branch(None).unwrap();
    let p1 = db.propose("left", "one plus ten").unwrap();
    let p2 = db.propose("right", "two plus twenty").unwrap();
    assert!(db.merge(&p1).unwrap(), "{}", db.proposal_output(&p1).unwrap());
    assert!(db.merge(&p2).unwrap(), "{}", db.proposal_output(&p2).unwrap());
    assert_eq!(db.proposal(&p2).unwrap().state, State::Merged);
    let main = dir.join("main");
    db.checkout(&tree, &main).unwrap();
    let lib = read(&main, "src/lib.rs");
    assert!(lib.contains("1 + 10") && lib.contains("2 + 20"), "main has both edits:\n{lib}");
    assert!(main.join("src/more.rs").exists(), "and the file one branch added");
    // a view edited again after main moved: its sync merges, never overwrites
    db.set_branch(Some("left")).unwrap();
    write(&left, "src/lib.rs", &read(&left, "src/lib.rs").replace("pub fn one", "pub fn uno"));
    db.sync(&left).unwrap();
    assert!(read(&left, "src/lib.rs").contains("pub fn uno"));
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_merge_that_breaks_the_build_is_refused() {
    let (mut db, dir, tree, _git) = with_tree("broken");
    for b in ["rename", "caller"] {
        db.make_branch(b, "").unwrap();
        db.set_branch(Some(b)).unwrap();
        db.checkout(&tree, &dir.join(b)).unwrap();
    }
    // each builds alone; together the new caller calls a function the other renamed
    let (rename, caller) = (dir.join("rename"), dir.join("caller"));
    write(&rename, "src/lib.rs", &read(&rename, "src/lib.rs").replace("pub fn one", "pub fn first"));
    write(&caller, "src/lib.rs", &format!("{}\npub fn both() -> u32 {{\n    one() + two()\n}}\n", read(&caller, "src/lib.rs")));
    db.set_branch(Some("rename")).unwrap();
    db.sync(&rename).unwrap();
    db.set_branch(Some("caller")).unwrap();
    db.sync(&caller).unwrap();
    db.set_branch(None).unwrap();
    let file = db.tree(&tree).unwrap().files["src/lib.rs"].clone();
    let p1 = db.propose("rename", "rename one").unwrap();
    assert!(db.merge(&p1).unwrap(), "{}", db.proposal_output(&p1).unwrap());
    let before = db.head(&file).unwrap();
    let p2 = db.propose("caller", "call one").unwrap();
    assert!(!db.merge(&p2).unwrap(), "the merged tree does not compile");
    assert_eq!(db.proposal(&p2).unwrap().state, State::Refused);
    assert!(db.proposal_output(&p2).unwrap().contains("cannot find function `one`"), "the compiler's words are kept:\n{}", db.proposal_output(&p2).unwrap());
    assert_eq!(db.head(&file).unwrap(), before, "main is unchanged");
    drop(db);
    let _ = std::fs::remove_dir_all(dir);
}
