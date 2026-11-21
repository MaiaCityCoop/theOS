//! theMCP: run by an agent's MCP client (Claude Code) as `theMCP --agent <name>`. It speaks MCP on the standard input
//! and output, as that agent: its key (kept for it on this device) and its line, in the store beside this repository
//! (or where `THEDB` says). Everything else it says goes to the standard error.

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let agent = match args.as_slice() {
        [flag, name] if flag == "--agent" => name.clone(),
        _ => fail("theMCP --agent <name>"),
    };
    // before anything reads it: the store signs as this agent
    unsafe { std::env::set_var("THEOS_AGENT", &agent) };
    let db = thedb::TheDB::open(thedb::TheDB::here()).unwrap_or_else(|e| fail(&e));
    let session = themcp::Session::new(db, &agent).unwrap_or_else(|e| fail(&e));
    if session.db.signer().is_none() && session.db.owner().ok().flatten().is_some() {
        fail(&format!("no key for the agent {agent} on this device: its owner makes it (`theDB agent {agent}`)"));
    }
    themcp::mcp::serve(session).unwrap_or_else(|e| fail(&e.to_string()));
}

fn fail(e: &str) -> ! {
    eprintln!("theMCP: {e}");
    std::process::exit(1)
}
