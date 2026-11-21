//! theMCP as an agent sees it: the protocol, search over the catalogue, execute against the store as one agent on its
//! own line, and the limits.

use serde_json::{Value, json};
use std::rc::Rc;
use thedb::TheDB;
use thedb::access::SecretKey;
use thedb::intents::State;
use themcp::{Session, mcp};

fn session(name: &str) -> (Rc<Session>, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("themcp-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let db = TheDB::open(&dir).unwrap();
    let owner = SecretKey::generate();
    db.set_owner(owner.clone()).unwrap();
    db.owner_with(owner);
    let agent = SecretKey::generate();
    db.grant("ada", agent.public(), 1).unwrap();
    db.sign_with(agent);
    (Rc::new(Session::new(db, "ada").unwrap()), dir)
}

fn rpc(s: &Rc<Session>, method: &str, params: Value) -> Value {
    mcp::handle(s, &json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })).unwrap()
}

/// The text a tool gave, and whether it is an error.
fn tool(s: &Rc<Session>, name: &str, code: &str) -> (String, bool) {
    let r = rpc(s, "tools/call", json!({ "name": name, "arguments": { "code": code } }));
    (r["result"]["content"][0]["text"].as_str().unwrap().to_string(), r["result"]["isError"].as_bool().unwrap())
}

#[test]
fn the_protocol_offers_two_tools() {
    let (s, dir) = session("protocol");
    let init = rpc(&s, "initialize", json!({ "protocolVersion": "2025-06-18" }));
    assert_eq!(init["result"]["serverInfo"]["name"], "theOS");
    assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
    assert!(mcp::handle(&s, &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none(), "a notification is not answered");
    let tools = rpc(&s, "tools/list", json!({}))["result"]["tools"].clone();
    let names: Vec<&str> = tools.as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["search", "execute"]);
    assert!(tools[1]["description"].as_str().unwrap().contains("theos::intent_task(id: string, text: string) -> int"), "every signature in execute's description");
    assert_eq!(rpc(&s, "nothing/here", json!({}))["error"]["code"], -32601);
    drop(s);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn search_reads_the_catalogue_only() {
    let (s, dir) = session("search");
    let (text, err) = tool(&s, "search", r#"catalogue().filter(|op| op.group == "intents").map(|op| op.name)"#);
    assert!(!err, "{text}");
    assert!(text.contains("theos::intent_ready"), "{text}");
    let (text, err) = tool(&s, "search", r#"theos::whoami()"#);
    assert!(err, "search calls no operation: {text}");
    drop(s);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn an_agent_works_an_intent_on_its_line_in_one_script() {
    let (s, dir) = session("work");
    let (text, err) = tool(
        &s,
        "execute",
        r#"
        let w = theos::doc_new("world", "day 1");
        theos::doc_write(w, "{\"sun\": 10}");
        theos::doc_edit(w, "10", "30");
        let id = theos::intent_new("A higher sun", "the plane looks flat at noon", "the sun stands at 30");
        theos::intent_task(id, "raise the sun");
        theos::intent_tick(id, 1, true);
        theos::intent_ready(id);
        let i = theos::intent(id);
        print(`ready: ${i.intent.state}`);
        #{ id: id, state: i.intent.state, docs: i.intent.docs.len(), me: theos::whoami().line }
        "#,
    );
    assert!(!err, "{text}");
    assert!(text.contains("printed:\nready: proposal"), "{text}");
    let v: Value = serde_json::from_str(text.split("\n\n").last().unwrap()).unwrap();
    assert_eq!((v["state"].as_str(), v["docs"].as_i64(), v["me"].as_str()), (Some("proposal"), Some(1), Some("line-ada")));
    // the store agrees, and main has not changed: accepting is the owner's
    let id = v["id"].as_str().unwrap();
    assert_eq!(s.db.intent(id).unwrap().state, State::Proposal);
    assert!(s.db.head_on(None, s.db.changed_on("line-ada").unwrap().iter().find(|(d, _)| d != id).map(|(d, _)| d.as_str()).unwrap()).unwrap().is_none(), "main has no such world yet");
    drop(s);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn errors_limits_and_the_cut() {
    let (s, dir) = session("limits");
    let (text, err) = tool(&s, "execute", r#"theos::intent("no-such-intent")"#);
    assert!(err && text.contains("theos::intent"), "{text}");
    let (text, err) = tool(&s, "execute", r#"let r = "not caught"; try { theos::intent("no-such-intent"); } catch (e) { r = "caught"; } r"#);
    assert!(!err && text == "caught", "{text}");
    let (text, err) = tool(&s, "execute", "loop { }");
    assert!(err, "an endless script is stopped: {text}");
    let (text, err) = tool(&s, "execute", r#"import "anything" as x; 1"#);
    assert!(err, "no imports: {text}");
    let (text, err) = tool(&s, "execute", r#"let s = ""; for i in 0..30000 { s += "x"; } s"#);
    assert!(!err && text.contains("--- TRUNCATED: 6000 more characters"), "{}", &text[text.len().saturating_sub(200)..]);
    drop(s);
    let _ = std::fs::remove_dir_all(dir);
}

/// An agent changes code through the MCP alone: reads it, edits it on its line, builds it, reads the error, fixes it.
#[test]
fn an_agent_edits_and_builds_code_through_execute() {
    use std::process::Command;
    let repo = std::env::temp_dir().join(format!("themcp-code-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&repo);
    std::fs::create_dir_all(repo.join("App/src")).unwrap();
    std::fs::write(repo.join("App/Cargo.toml"), "[package]\nname = \"hello\"\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[workspace]\n").unwrap();
    std::fs::write(repo.join("App/src/main.rs"), "fn main() {\n    println!(\"hello\");\n}\n").unwrap();
    std::fs::write(repo.join(".gitignore"), "DATA/\n").unwrap();
    for args in [&["init", "-q", "-b", "main"][..], &["add", "."], &["-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit", "-q", "-m", "a crate"]] {
        assert!(Command::new("git").arg("-C").arg(&repo).args(args).status().unwrap().success());
    }
    let mut db = TheDB::open(repo.join("DATA")).unwrap();
    let root = db.new("root", "root").unwrap();
    db.set_text(&root, "{}").unwrap();
    db.set_root(&root).unwrap();
    let owner = SecretKey::generate();
    db.set_owner(owner.clone()).unwrap();
    db.owner_with(owner);
    let (code, _) = db.import_code(&repo).unwrap();
    db.accept(&code).unwrap();
    let agent = SecretKey::generate();
    db.grant("ada", agent.public(), 1).unwrap();
    db.sign_with(agent);
    let s = Rc::new(Session::new(db, "ada").unwrap());

    let wait = |s: &Rc<Session>| -> Value {
        for _ in 0..600 {
            let (text, err) = tool(s, "execute", "theos::build_status()");
            assert!(!err, "{text}");
            let v: Value = serde_json::from_str(&text).unwrap();
            if v["state"] != "running" {
                return v;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        panic!("the build did not end");
    };
    // a mistake, built: the error names the tree's path
    let (text, err) = tool(&s, "execute", r#"
        theos::file_edit("App/src/main.rs", "println!(\"hello\");", "let n: u32 = \"one\";");
        theos::build().state
    "#);
    assert!(!err && text == "running", "{text}");
    let failed = wait(&s);
    assert_eq!(failed["state"], "failed");
    assert!(failed["errors"][0].as_str().unwrap().starts_with("App/src/main.rs:2"), "{failed}");
    // fixed, built
    let (text, err) = tool(&s, "execute", r#"
        theos::file_edit("App/src/main.rs", "let n: u32 = \"one\";", "let n: u32 = 1;\n    println!(\"day {n}\");");
        theos::build();
        theos::file_search("day {n}")
    "#);
    assert!(!err && text.contains("App/src/main.rs:3:"), "{text}");
    assert_eq!(wait(&s)["state"], "ok");
    // main has not changed: the line's work waits for an intent and its owner
    assert!(s.db.file_search("day {n}", 5).unwrap().len() == 1, "the line sees its edit");
    drop(s);
    let _ = Command::new("chmod").args(["-R", "u+w"]).arg(&repo).status();
    let _ = std::fs::remove_dir_all(&repo);
}
