//! theMCP: theOS's MCP server in Code Mode (intent 0059, step 1c).
//!
//! An agent (a Claude session, a bot) reaches theOS only through this: two tools instead of one per operation.
//! `search` runs the agent's code over the catalogue of every operation and returns only what it needs; `execute`
//! runs its code with the `theos` functions and returns only the result. The code is Rhai, Rust's embedded script
//! (`script.rs`): no files, no network, no imports, with limits on steps, time, depth and size. Every operation is
//! one entry in one list (`ops.rs`), which gives the catalogue, the signatures in the tools' descriptions, and the
//! calls themselves.
//!
//! Each server is one agent: its key (theID, kept for it on this device) and its line. What it may do is what theDB
//! lets that key do: write its own line and the intents on it; never main, never an accept, which is its owner's in
//! theOS. Results are cut at about 24,000 characters, with a marker saying how much was left and how to get it.
//!
//! For now the server runs as its own process beside the store (`main.rs`, `theMCP --agent <name>`); next, inside the
//! host, reached over iroh, so agents on other devices come in the same way.

pub mod mcp;
pub mod ops;
pub mod script;

/// One agent's session: the store, on the agent's line.
pub struct Session {
    pub db: thedb::TheDB,
    pub agent: String,
    pub line: String,
}

impl Session {
    /// Opens `db` as the agent `agent`: on its line, which it must already have (the owner grants it).
    pub fn new(mut db: thedb::TheDB, agent: &str) -> Result<Session, String> {
        let line = thedb::access::line(agent);
        db.set_branch(Some(&line))?;
        Ok(Session { db, agent: agent.to_string(), line })
    }
}
