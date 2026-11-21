//! The Model Context Protocol, as much as theOS needs: JSON-RPC, one message a line on the standard input and
//! output; `initialize`, `ping`, `tools/list`, and `tools/call` for the two tools, `search` and `execute`.

use crate::ops::OPS;
use crate::{Session, script};
use serde_json::{Value, json};
use std::io::{BufRead, Write};
use std::rc::Rc;

/// Where a result is cut, in characters (about 6,000 tokens).
pub const CUT: usize = 24_000;

const INSTRUCTIONS: &str = "theOS's store, as one agent. `search` finds operations, `execute` runs them; both take Rhai code. \
Your work happens on your own line: open an intent for every piece of work, keep its tasks, and mark it ready when it is done. \
Your owner accepts it in theOS; nothing reaches main before.";

const SEARCH: &str = "Finds what theOS can do. Write a Rhai script over `catalogue()`: an array with one map per operation \
(`name`, `group`, `signature`, `doc`, `cap`). The script's last expression is returned; return only what you need.\n\n\
Examples:\n  catalogue().filter(|op| op.group == \"intents\").map(|op| op.signature)\n  \
catalogue().filter(|op| op.doc.contains(\"line\")).map(|op| #{ s: op.signature, doc: op.doc })";

fn execute_doc() -> String {
    let functions: Vec<String> = OPS.iter().map(|op| format!("  {}", op.signature())).collect();
    format!(
        "Runs a Rhai script against theOS as this agent and returns its last expression (a map, an array, a string, a number). \
Call the `theos::` functions below; compose several in one script and return only what your next step needs. \
Writes go to this agent's own line; main changes only when its owner accepts the intent, in theOS. \
Errors are thrown; catch them in a statement: `let r = (); try {{ r = theos::intent(id); }} catch (e) {{ r = e; }} r`. What `print(x)` prints comes back too. Results over {CUT} characters are cut.\n\n\
Rhai in brief: `let x = 1;` · maps `#{{ a: 1, b: \"x\" }}`, `m.a`, `m.len()` · arrays `[1, 2]`, `a.len()`, `a.filter(|v| v > 1)`, \
`a.map(|v| v * 2)`, `for v in a {{ }}` · strings `s.contains(\"x\")`, `s.len()`, `\"a\" + \"b\"`, `` `${{x}} items` `` · `if c {{ }} else {{ }}`.\n\n\
Functions (search for each one's doc):\n{}\n\n\
Example: open an intent with two tasks, and return its board:\n  \
let id = theos::intent_new(\"Raise the sun\", \"the plane looks flat at noon\", \"the sun stands at 30°\");\n  \
theos::intent_task(id, \"raise the sun in the world\");\n  theos::intent_task(id, \"check the shadows\");\n  \
theos::intent(id).intent.tasks",
        functions.join("\n")
    )
}

/// The two tools.
pub fn tools() -> Value {
    let code = |what: &str| json!({ "type": "object", "properties": { "code": { "type": "string", "description": what } }, "required": ["code"] });
    json!([
        { "name": "search", "description": SEARCH, "inputSchema": code("A Rhai script over catalogue(); its last expression is returned.") },
        { "name": "execute", "description": execute_doc(), "inputSchema": code("A Rhai script calling theos:: functions; its last expression is returned.") },
    ])
}

/// Answers one message; `None` for a notification (no id), which is never answered.
pub fn handle(session: &Rc<Session>, msg: &Value) -> Option<Value> {
    let id = msg.get("id")?.clone();
    let result = match msg["method"].as_str().unwrap_or("") {
        "initialize" => Ok(json!({
            "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "theOS", "version": env!("CARGO_PKG_VERSION") },
            "instructions": INSTRUCTIONS,
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => Ok(call(session, &msg["params"])),
        "" => Err((-32600, "a request names its method".to_string())),
        m => Err((-32601, format!("no method {m}"))),
    };
    Some(match result {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
    })
}

fn call(session: &Rc<Session>, params: &Value) -> Value {
    let code = params["arguments"]["code"].as_str().unwrap_or("");
    let ran = match params["name"].as_str() {
        Some("search") => script::search(code),
        Some("execute") => script::execute(session.clone(), code),
        other => return json!({ "content": [{ "type": "text", "text": format!("no tool {}: search or execute", other.unwrap_or("named")) }], "isError": true }),
    };
    json!({ "content": [{ "type": "text", "text": render(&ran) }], "isError": ran.error.is_some() })
}

/// What a script gave, as text: what it printed, then its result or its error; cut at `CUT` characters.
pub fn render(ran: &script::Ran) -> String {
    let mut out = String::new();
    if !ran.printed.is_empty() {
        out.push_str("printed:\n");
        out.push_str(&ran.printed.join("\n"));
        out.push_str("\n\n");
    }
    match (&ran.error, &ran.value) {
        (Some(e), _) => out.push_str(&format!("error: {e}")),
        (None, Value::String(s)) => out.push_str(s),
        (None, v) => out.push_str(&serde_json::to_string_pretty(v).unwrap_or_default()),
    }
    let n = out.chars().count();
    if n > CUT {
        out = out.chars().take(CUT).collect();
        out.push_str(&format!("\n--- TRUNCATED: {} more characters; return less (select, filter, count), or read in parts (theos::doc_lines) ---", n - CUT));
    }
    out
}

/// Serves MCP on the standard input and output until the input ends.
pub fn serve(session: Session) -> std::io::Result<()> {
    let session = Rc::new(session);
    let mut out = std::io::stdout().lock();
    for line in std::io::stdin().lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => handle(&session, &msg),
            Err(e) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": format!("not JSON: {e}") } })),
        };
        if let Some(r) = reply {
            writeln!(out, "{r}")?;
            out.flush()?;
        }
    }
    Ok(())
}
