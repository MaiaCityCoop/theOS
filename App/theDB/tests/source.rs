//! Code (intent 0059, step 1d): brought in from git once, named as Rust names it, edited on a line, written out for
//! the builder where Rust's conventions put each unit, built (errors by name), and archived in git before a merge.

use std::path::Path;
use std::process::Command;
use thedb::TheDB;

fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git").arg("-C").arg(repo).args(["-c", "user.name=t", "-c", "user.email=t@t.invalid"]).args(args).output().unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

const MAIN_RS: &str = "mod util;\n\nfn main() {\n    util::hi();\n}\n";
const UTIL_RS: &str = "pub fn hi() {\n    println!(\"hello\");\n}\n";
const ICON: [u8; 8] = [0x89, b'P', b'N', b'G', 0, 1, 2, 3];

/// A repository with a tiny crate under App/ (a module and an icon), its store in DATA/ inside it, as theOS's is.
fn repo(name: &str, package: &str) -> std::path::PathBuf {
    let repo = std::env::temp_dir().join(format!("thedb-source-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&repo);
    std::fs::create_dir_all(repo.join("App/src")).unwrap();
    std::fs::create_dir_all(repo.join("App/assets")).unwrap();
    std::fs::write(repo.join("App/Cargo.toml"), format!("[package]\nname = \"{package}\"\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[workspace]\n")).unwrap();
    std::fs::write(repo.join("App/src/main.rs"), MAIN_RS).unwrap();
    std::fs::write(repo.join("App/src/util.rs"), UTIL_RS).unwrap();
    std::fs::write(repo.join("App/assets/icon.png"), ICON).unwrap();
    std::fs::write(repo.join(".gitignore"), "DATA/\nout-*/\n").unwrap();
    git(&repo, &["init", "-q", "-b", "main"]);
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "-q", "-m", "a tiny crate"]);
    repo
}

fn store(repo: &Path) -> TheDB {
    let db = TheDB::open(repo.join("DATA")).unwrap();
    let root = db.new("root", "root").unwrap();
    db.set_text(&root, "{}").unwrap();
    db.set_root(&root).unwrap();
    db
}

fn wait_for_build(db: &TheDB) -> serde_json::Value {
    for _ in 0..600 {
        let s = db.build_status().unwrap();
        if s["state"] != "running" {
            return s;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    panic!("the build did not end in two minutes");
}

fn clean(repo: &Path) {
    let _ = Command::new("chmod").args(["-R", "u+w"]).arg(repo).status();
    let _ = std::fs::remove_dir_all(repo);
}

#[test]
fn code_comes_in_once_by_name_is_edited_written_out_built_and_archived() {
    let repo = repo("all", "hello");
    let mut db = store(&repo);
    // brought in from git: an intent, and nothing on main before it is accepted
    let (intent, n) = db.import_code(&repo).unwrap();
    assert_eq!(n, 4);
    assert!(db.code_units().unwrap().is_empty(), "main has no code before the intent is accepted");
    db.accept(&intent).unwrap();
    assert_eq!(db.code_units().unwrap(), ["hello#main", "hello#manifest", "hello/assets/icon.png", "hello::util"]);
    assert_eq!(db.code_text("hello::util").unwrap(), UTIL_RS);
    assert_eq!(db.code_bytes("hello/assets/icon.png").unwrap(), ICON);
    assert!(db.code_text("hello/assets/icon.png").is_err(), "an icon is not text");

    // main builds
    let head = git(&repo, &["rev-parse", "HEAD"]);
    db.build_start().unwrap();
    let built = wait_for_build(&db);
    assert_eq!(built["state"], "ok", "{built}");

    // a line edits code by name; main does not see it
    db.make_branch("line-ada", "").unwrap();
    db.set_branch(Some("line-ada")).unwrap();
    db.code_edit("hello::util", "\"hello\"", "\"hello, day 1\"").unwrap();
    assert!(db.code_edit("hello::util", "nowhere", "x").is_err());
    db.code_write("hello::day", "pub fn day() -> u32 {\n    1\n}\n").unwrap();
    db.code_move("hello::day", "hello::days").unwrap();
    db.code_delete("hello/assets/icon.png").unwrap();
    assert!(db.code_write("nocrate::x", "").unwrap_err().contains("no crate nocrate"));
    assert_eq!(db.code_search("day 1", 10).unwrap(), [("hello::util".to_string(), 2, "    println!(\"hello, day 1\");".to_string())]);
    let line_dir = repo.join("out-line");
    let p = db.project(&line_dir).unwrap();
    assert_eq!((p.files, p.written), (4, 4));
    assert!(std::fs::read_to_string(line_dir.join("App/src/util.rs")).unwrap().contains("day 1"));
    assert!(line_dir.join("App/src/days.rs").exists(), "a module is written where Rust looks for it");
    assert!(std::fs::metadata(line_dir.join("App/src/util.rs")).unwrap().permissions().readonly(), "written read only");
    assert_eq!(db.project(&line_dir).unwrap().written, 0, "the same code writes nothing");
    let line_hash = p.hash;

    // a line's code that does not compile: the build says where, by name
    db.code_write("hello::days", "pub fn day() -> u32 {\n    \"one\"\n}\n").unwrap();
    db.code_edit("hello#main", "mod util;", "mod util;\nmod days;").unwrap();
    db.build_start().unwrap();
    let failed = wait_for_build(&db);
    assert_eq!(failed["state"], "failed", "{failed}");
    assert!(failed["errors"].as_array().unwrap().iter().any(|e| e.as_str().unwrap().starts_with("hello::days:2:")), "{failed}");
    db.code_write("hello::days", "pub fn day() -> u32 {\n    1\n}\n").unwrap();

    db.set_branch(None).unwrap();
    assert_eq!(db.code_text("hello::util").unwrap(), UTIL_RS, "main is as it was");
    let main_dir = repo.join("out-main");
    assert_ne!(db.project(&main_dir).unwrap().hash, line_hash);

    // accepted: before the merge, main's code goes into git's archive, as the builder writes it; nothing else is touched
    let p = db.propose("line-ada", "day 1 in the code").unwrap();
    db.accept(&p).unwrap();
    let archived = git(&repo, &["ls-tree", "-r", "--name-only", "refs/heads/archive"]);
    assert_eq!(archived, "App/Cargo.toml\nApp/assets/icon.png\nApp/src/main.rs\nApp/src/util.rs", "main as it was before the merge");
    assert_eq!(git(&repo, &["rev-parse", "HEAD"]), head, "HEAD untouched");
    assert!(git(&repo, &["status", "--porcelain"]).is_empty(), "the working tree untouched");
    assert_eq!(db.code_units().unwrap(), ["hello#main", "hello#manifest", "hello::days", "hello::util"], "main has the line's code now");
    drop(db);
    clean(&repo);
}

/// A host build from a line's code, with no git: built where every build is, kept, its pin proposed, accepted.
#[test]
fn a_host_build_comes_from_a_lines_code() {
    let repo = repo("publish", "theos");
    let mut db = store(&repo);
    let (code, _) = db.import_code(&repo).unwrap();
    db.accept(&code).unwrap();
    let engine = db.new("engine", "theOS").unwrap();
    db.set_text(&engine, r#"{"builds": [], "pinned": null}"#).unwrap();
    let root = db.root().unwrap().unwrap();
    let mut r: serde_json::Value = serde_json::from_str(&db.text(&root).unwrap().unwrap()).unwrap();
    r["engine"] = serde_json::json!(engine);
    db.set_text(&root, &r.to_string()).unwrap();
    // a line changes the code, and the host builds that line's code
    db.make_branch("line-ada", "").unwrap();
    db.set_branch(Some("line-ada")).unwrap();
    db.code_edit("theos::util", "\"hello\"", "\"hello from a line\"").unwrap();
    let (build, intent) = db.publish_tree(&engine).unwrap();
    db.set_branch(None).unwrap();
    assert_ne!(db.pinned_now().map(|(_, b)| b).ok().as_deref(), Some(build.to_hex().as_str()), "main runs nothing new before the owner accepts");
    db.accept(&intent).unwrap();
    assert_eq!(db.pinned_now().unwrap().1, build.to_hex().to_string());
    let manifest: serde_json::Value = serde_json::from_slice(&db.get(db.build(&build.to_hex().to_string()).unwrap().source.parse().unwrap()).unwrap().unwrap()).unwrap();
    assert_eq!(manifest["line"], "line-ada");
    let util: thedb::Hash = manifest["files"]["App/src/util.rs"].as_str().unwrap().parse().unwrap();
    assert!(String::from_utf8(db.get(util).unwrap().unwrap().to_vec()).unwrap().contains("hello from a line"), "the build's source is the line's code");
    drop(db);
    clean(&repo);
}

/// A unit's entry has its own id, its name and its blob. A module renamed on a line (with its subtree) merges with an
/// edit main made to it meanwhile; what both sides really changed (one unit's content, one new name, a unit one side
/// took away while the other changed it) is shown by its name.
#[test]
fn a_rename_keeps_its_edits_and_real_collisions_are_shown() {
    let repo = repo("names", "hello");
    let mut db = store(&repo);
    let (code, _) = db.import_code(&repo).unwrap();
    db.accept(&code).unwrap();
    db.code_write("hello::util::inner", "pub fn x() {}\n").unwrap();
    // a line renames the module; main edits it meanwhile
    db.make_branch("line-ada", "").unwrap();
    db.set_branch(Some("line-ada")).unwrap();
    db.code_move("hello::util", "hello::tools").unwrap();
    db.set_branch(None).unwrap();
    db.code_edit("hello::util", "\"hello\"", "\"hello from main\"").unwrap();
    let p = db.propose("line-ada", "util becomes tools").unwrap();
    let c = db.intent_conflicts(&p).unwrap();
    assert!(c.is_empty(), "{c:?}");
    db.accept(&p).unwrap();
    assert_eq!(db.code_units().unwrap(), ["hello#main", "hello#manifest", "hello/assets/icon.png", "hello::tools", "hello::tools::inner"], "the submodule went along");
    assert!(db.code_text("hello::tools").unwrap().contains("hello from main"), "main's edit went with the unit");

    // both change one unit's content, both make one name, and main takes away a unit the line changed
    db.make_branch("line-bo", "").unwrap();
    db.set_branch(Some("line-bo")).unwrap();
    db.code_edit("hello::tools", "hello from main", "hello from bo").unwrap();
    db.code_write("hello::new", "// bo's\n").unwrap();
    db.code_write_bytes("hello/assets/icon.png", &[0x89, b'P', b'N', b'G', 9]).unwrap();
    db.set_branch(None).unwrap();
    db.code_edit("hello::tools", "hello from main", "hello again").unwrap();
    db.code_write("hello::new", "// main's\n").unwrap();
    db.code_delete("hello/assets/icon.png").unwrap();
    let p = db.propose("line-bo", "bo's hello").unwrap();
    let c: Vec<String> = db.intent_conflicts(&p).unwrap().into_iter().map(|c| c.path).collect();
    for want in ["hello::tools (content)", "hello::new (made on both sides)", "hello/assets/icon.png (content)"] {
        assert!(c.iter().any(|x| x == want), "{want} in {c:?}");
    }
    assert!(db.accept(&p).unwrap_err().contains("conflicts with main"));
    drop(db);
    clean(&repo);
}
