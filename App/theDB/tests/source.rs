//! Code as docs (intent 0059, step 1d): brought in from git once, edited on a line as docs, written out for the
//! builder, built, and archived in git before a merge that brings code.

use std::path::Path;
use std::process::Command;
use thedb::TheDB;

fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git").arg("-C").arg(repo).args(["-c", "user.name=t", "-c", "user.email=t@t.invalid"]).args(args).output().unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

const MAIN_RS: &str = "fn main() {\n    println!(\"hello\");\n}\n";

/// A repository with a tiny crate under App/ and an icon, its store in DATA/ inside it, as theOS's is.
fn repo(name: &str) -> std::path::PathBuf {
    let repo = std::env::temp_dir().join(format!("thedb-source-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&repo);
    std::fs::create_dir_all(repo.join("App/src")).unwrap();
    std::fs::create_dir_all(repo.join("App/assets")).unwrap();
    std::fs::write(repo.join("App/Cargo.toml"), "[package]\nname = \"hello\"\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[workspace]\n").unwrap();
    std::fs::write(repo.join("App/src/main.rs"), MAIN_RS).unwrap();
    std::fs::write(repo.join("App/assets/icon.png"), [0x89u8, b'P', b'N', b'G', 0, 1, 2, 3]).unwrap();
    std::fs::write(repo.join(".gitignore"), "DATA/\n").unwrap();
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

#[test]
fn code_comes_in_once_is_edited_as_docs_written_out_built_and_archived() {
    let repo = repo("all");
    let mut db = store(&repo);
    // brought in from git: an intent, and nothing on main before it is accepted
    let (intent, n) = db.import_code(&repo).unwrap();
    assert_eq!(n, 3);
    assert!(db.files().unwrap().is_empty(), "main has no code before the intent is accepted");
    db.accept(&intent).unwrap();
    assert_eq!(db.files().unwrap(), ["App/Cargo.toml", "App/assets/icon.png", "App/src/main.rs"]);
    assert_eq!(db.file_text("App/src/main.rs").unwrap(), MAIN_RS);
    assert_eq!(db.file_bytes("App/assets/icon.png").unwrap(), [0x89u8, b'P', b'N', b'G', 0, 1, 2, 3]);
    assert!(db.file_text("App/assets/icon.png").is_err(), "an icon is not text");

    // main builds
    let head = git(&repo, &["rev-parse", "HEAD"]);
    db.build_start().unwrap();
    let built = wait_for_build(&db);
    assert_eq!(built["state"], "ok", "{built}");

    // a line edits code as docs; main does not see it
    db.make_branch("line-ada", "").unwrap();
    db.set_branch(Some("line-ada")).unwrap();
    db.file_edit("App/src/main.rs", "\"hello\"", "\"hello, day 1\"").unwrap();
    assert!(db.file_edit("App/src/main.rs", "nowhere", "x").is_err());
    db.file_write("App/src/day.rs", "pub fn day() -> u32 {\n    1\n}\n").unwrap();
    db.file_move("App/src/day.rs", "App/src/days.rs").unwrap();
    db.file_delete("App/assets/icon.png").unwrap();
    assert_eq!(db.file_search("day 1", 10).unwrap(), [("App/src/main.rs".to_string(), 2, "    println!(\"hello, day 1\");".to_string())]);
    let line_dir = repo.join("out-line");
    let p = db.project(&line_dir).unwrap();
    assert_eq!((p.files, p.written), (3, 3));
    assert!(std::fs::read_to_string(line_dir.join("App/src/main.rs")).unwrap().contains("day 1"));
    assert!(std::fs::metadata(line_dir.join("App/src/main.rs")).unwrap().permissions().readonly(), "written read only");
    assert_eq!(db.project(&line_dir).unwrap().written, 0, "the same tree writes nothing");
    let line_hash = p.hash;

    // a line's code that does not compile: the build says where
    db.file_write("App/src/days.rs", "pub fn day() -> u32 {\n    \"one\"\n}\n").unwrap();
    db.file_edit("App/src/main.rs", "fn main() {", "mod days;\nfn main() {").unwrap();
    db.build_start().unwrap();
    let failed = wait_for_build(&db);
    assert_eq!(failed["state"], "failed", "{failed}");
    assert!(failed["errors"].as_array().unwrap().iter().any(|e| e.as_str().unwrap().contains("days.rs")), "{failed}");
    db.file_write("App/src/days.rs", "pub fn day() -> u32 {\n    1\n}\n").unwrap();

    db.set_branch(None).unwrap();
    assert_eq!(db.file_text("App/src/main.rs").unwrap(), MAIN_RS, "main is as it was");
    let main_dir = repo.join("out-main");
    assert_ne!(db.project(&main_dir).unwrap().hash, line_hash);

    // accepted: before the merge, main's code goes into git's archive; no branch or working tree is touched
    let p = db.propose("line-ada", "day 1 in the code").unwrap();
    db.accept(&p).unwrap();
    let archived = git(&repo, &["ls-tree", "-r", "--name-only", "refs/heads/archive"]);
    assert_eq!(archived, "App/Cargo.toml\nApp/assets/icon.png\nApp/src/main.rs", "main as it was before the merge");
    assert_eq!(git(&repo, &["rev-parse", "HEAD"]), head, "HEAD untouched");
    assert!(git(&repo, &["status", "--porcelain"]).lines().all(|l| l.contains("out-")), "the working tree untouched");
    assert_eq!(db.files().unwrap(), ["App/Cargo.toml", "App/src/days.rs", "App/src/main.rs"], "main has the line's code now");
    drop(db);
    let _ = Command::new("chmod").args(["-R", "u+w"]).arg(&repo).status();
    let _ = std::fs::remove_dir_all(&repo);
}

/// A host build from a line's code, with no git: built where every build is, kept, its pin proposed, accepted.
#[test]
fn a_host_build_comes_from_a_lines_code() {
    let repo = repo("publish");
    std::fs::write(repo.join("App/Cargo.toml"), "[package]\nname = \"theos\"\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[workspace]\n").unwrap();
    git(&repo, &["commit", "-q", "-am", "the host is called theos"]);
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
    db.file_edit("App/src/main.rs", "\"hello\"", "\"hello from a line\"").unwrap();
    let (build, intent) = db.publish_tree(&engine).unwrap();
    db.set_branch(None).unwrap();
    assert_ne!(db.pinned_now().map(|(_, b)| b).ok().as_deref(), Some(build.to_hex().as_str()), "main runs nothing new before the owner accepts");
    db.accept(&intent).unwrap();
    assert_eq!(db.pinned_now().unwrap().1, build.to_hex().to_string());
    let manifest: serde_json::Value = serde_json::from_slice(&db.get(db.build(&build.to_hex().to_string()).unwrap().source.parse().unwrap()).unwrap().unwrap()).unwrap();
    assert_eq!(manifest["line"], "line-ada");
    let main_rs: thedb::Hash = manifest["files"]["App/src/main.rs"].as_str().unwrap().parse().unwrap();
    assert!(String::from_utf8(db.get(main_rs).unwrap().unwrap().to_vec()).unwrap().contains("hello from a line"), "the build's source is the line's code");
    drop(db);
    let _ = Command::new("chmod").args(["-R", "u+w"]).arg(&repo).status();
    let _ = std::fs::remove_dir_all(&repo);
}

/// The code is flat: a file's entry has its own id, its path and its blob. A folder moved on a line (every path under
/// it) merges with an edit main made inside it meanwhile; what both sides really changed (one file's content, one new
/// path, a file one side took away while the other changed it) is shown by its path.
#[test]
fn a_folder_moves_with_its_edits_and_real_collisions_are_shown() {
    let repo = repo("flat");
    let mut db = store(&repo);
    let (code, _) = db.import_code(&repo).unwrap();
    db.accept(&code).unwrap();
    // a line moves the whole folder; main edits a file in it meanwhile
    db.make_branch("line-ada", "").unwrap();
    db.set_branch(Some("line-ada")).unwrap();
    db.file_move("App/src", "App/lib").unwrap();
    db.set_branch(None).unwrap();
    db.file_edit("App/src/main.rs", "\"hello\"", "\"hello from main\"").unwrap();
    let p = db.propose("line-ada", "src becomes lib").unwrap();
    let c = db.intent_conflicts(&p).unwrap();
    assert!(c.is_empty(), "{c:?}");
    db.accept(&p).unwrap();
    assert_eq!(db.files().unwrap(), ["App/Cargo.toml", "App/assets/icon.png", "App/lib/main.rs"]);
    assert!(db.file_text("App/lib/main.rs").unwrap().contains("hello from main"), "main's edit went with the file");

    // both change one file's content, both make one path, and main takes away a file the line changed
    db.make_branch("line-bo", "").unwrap();
    db.set_branch(Some("line-bo")).unwrap();
    db.file_edit("App/lib/main.rs", "hello from main", "hello from bo").unwrap();
    db.file_write("App/lib/new.rs", "// bo's\n").unwrap();
    db.file_write_bytes("App/assets/icon.png", &[0x89, b'P', b'N', b'G', 9]).unwrap();
    db.set_branch(None).unwrap();
    db.file_edit("App/lib/main.rs", "hello from main", "hello again").unwrap();
    db.file_write("App/lib/new.rs", "// main's\n").unwrap();
    db.file_delete("App/assets").unwrap();
    let p = db.propose("line-bo", "bo's hello").unwrap();
    let c: Vec<String> = db.intent_conflicts(&p).unwrap().into_iter().map(|c| c.path).collect();
    for want in ["App/lib/main.rs (content)", "App/lib/new.rs (made on both sides)", "App/assets/icon.png (content)"] {
        assert!(c.iter().any(|x| x == want), "{want} in {c:?}");
    }
    assert!(db.accept(&p).unwrap_err().contains("conflicts with main"));
    drop(db);
    let _ = Command::new("chmod").args(["-R", "u+w"]).arg(&repo).status();
    let _ = std::fs::remove_dir_all(&repo);
}
