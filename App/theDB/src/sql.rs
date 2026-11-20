//! The docs in SQLite (intent 0053): one file, `theDB.sqlite`, in WAL mode, opened by every process that opens the
//! store. The schema, all of it:
//!
//! ```text
//!     meta(key, value)                      the store's own facts: `root` (the root doc's id), `format`
//!     docs(id, kind, name, size)            one row per doc: what it is, what it is called, how many bytes its
//!                                           content has; as main has it (as its branch has it until it is merged)
//!     versions(hash, doc, parent, depth,    one row per version of a doc, named by the BLAKE3 hash of the doc's
//!              bytes, vv, at, size)         snapshot when it was committed. `bytes` is a whole Loro snapshot
//!                                           (`parent` null, `depth` 0) or Loro's update since the version `parent`
//!                                           (`depth` one more than the parent's). `vv` is the version's Loro version
//!                                           vector, `at` when it was made (seconds since 1970), `size` its content's
//!                                           bytes then
//!     heads(branch, doc, hash, at)          each doc's current version on main (`branch` = 'main') and on each
//!                                           branch that changed it
//!     branches(name, about, at)             the branches, and what each is for
//!     refs(doc, blob, how)                  the blobs a doc names now: `file`, `part:<name>`, or `json` (a hash
//!                                           among its values)
//!     words(id, name, text)                 full-text search (FTS5) over each doc's name and text
//! ```
//!
//! A version is read by importing its chain: the snapshot it descends from, then each update down to it. A chain is
//! never longer than `SNAPSHOT_EVERY`, and an update that would be half a snapshot's size is kept as a snapshot
//! instead. Hashes are kept as hex text, so the file reads well in `sqlite3`.
//!
//! Not here yet (intent 0056): heads and branches as docs of their own (a refs doc per branch, one root pointer).
//! They are plain rows for now.

use crate::{Hash, Result, err, json};
use loro::{ExportMode, LoroDoc, VersionVector};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

/// The docs' file in the store's folder.
pub const FILE: &str = "theDB.sqlite";

/// The key of the root doc's id in `meta`.
pub const ROOT: &str = "root";

/// The longest chain of updates before a version is kept as a whole snapshot again: what reading a version costs at
/// most (this many small imports) against what a commit stores.
const SNAPSHOT_EVERY: i64 = 16;

/// How long a process waits for another's write to end before it gives up, in milliseconds.
const WAIT_MS: u64 = 30_000;

const SCHEMA: &str = "
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE docs(id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX docs_kind ON docs(kind);
CREATE TABLE versions(hash TEXT PRIMARY KEY, doc TEXT NOT NULL, parent TEXT, depth INTEGER NOT NULL, bytes BLOB NOT NULL, vv BLOB NOT NULL, at INTEGER NOT NULL, size INTEGER NOT NULL);
CREATE INDEX versions_doc ON versions(doc, at);
CREATE TABLE heads(branch TEXT NOT NULL, doc TEXT NOT NULL, hash TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(branch, doc)) WITHOUT ROWID;
CREATE INDEX heads_doc ON heads(doc);
CREATE TABLE branches(name TEXT PRIMARY KEY, about TEXT NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE refs(doc TEXT NOT NULL, blob TEXT NOT NULL, how TEXT NOT NULL, PRIMARY KEY(doc, blob, how)) WITHOUT ROWID;
CREATE INDEX refs_blob ON refs(blob);
CREATE VIRTUAL TABLE words USING fts5(id UNINDEXED, name, text);
";

/// What a doc is found by.
#[derive(Clone, Copy, Debug)]
pub enum Find<'a> {
    /// Its kind, exactly.
    Kind(&'a str),
    /// A part of its name, in any case.
    Name(&'a str),
    /// Words in its name or its text: every one of them.
    Words(&'a str),
}

/// A doc that was found.
#[derive(Clone, Debug, PartialEq)]
pub struct Found {
    pub id: String,
    pub kind: String,
    pub name: String,
}

fn hex(h: Hash) -> String {
    h.to_hex().to_string()
}

fn unhex(s: &str) -> Result<Hash> {
    s.parse().map_err(|_| format!("not a hash: {s:?}"))
}

/// This process's connection to the docs in `dir`.
pub fn open(dir: &Path) -> Result<Connection> {
    let conn = Connection::open(dir.join(FILE)).map_err(err)?;
    conn.busy_timeout(std::time::Duration::from_millis(WAIT_MS)).map_err(err)?;
    // WAL: readers never wait for the writer, in any process; NORMAL: a commit is safe against a crash of the
    // process, and a power cut loses at most the last commits, never the file
    conn.pragma_update(None, "journal_mode", "WAL").map_err(err)?;
    conn.pragma_update(None, "synchronous", "NORMAL").map_err(err)?;
    Ok(conn)
}

/// Whether the tables are made (and, for a store made before SQLite, filled).
pub fn ready(conn: &Connection) -> Result<bool> {
    let has: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'meta')", [], |r| r.get(0)).map_err(err)?;
    Ok(has && get_meta(conn, "format")?.is_some())
}

pub fn create(conn: &Connection) -> Result<()> {
    conn.execute_batch(SCHEMA).map_err(err)
}

pub fn mark_ready(conn: &Connection) -> Result<()> {
    set_meta(conn, "format", "1")
}

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional().map_err(err)
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute("INSERT INTO meta(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2", [key, value]).map(|_| ()).map_err(err)
}

// ---- heads and branches ----

pub fn head(conn: &Connection, branch: &str, id: &str) -> Result<Option<Hash>> {
    let h: Option<String> = conn.query_row("SELECT hash FROM heads WHERE branch = ?1 AND doc = ?2", [branch, id], |r| r.get(0)).optional().map_err(err)?;
    h.as_deref().map(unhex).transpose()
}

pub fn set_head(conn: &Connection, branch: &str, id: &str, hash: Hash, at: u64) -> Result<()> {
    // a head that stays where it is keeps its time: it says when the doc last changed
    conn.execute(
        "INSERT INTO heads(branch, doc, hash, at) VALUES(?1, ?2, ?3, ?4) ON CONFLICT(branch, doc) DO UPDATE SET hash = ?3, at = ?4 WHERE hash <> ?3",
        params![branch, id, hex(hash), at as i64],
    )
    .map(|_| ())
    .map_err(err)
}

/// Moves doc `id`'s head on `branch` from `from` (none: it has no head there yet) to `to`, only if it is still at
/// `from`: a compare-and-swap. Returns whether it moved; a head that has moved meanwhile is left alone, and the
/// committer merges with the new head and tries again. A head that is already at `to` counts as moved.
pub fn move_head(conn: &Connection, branch: &str, id: &str, from: Option<Hash>, to: Hash, at: u64) -> Result<bool> {
    if from == Some(to) {
        return Ok(head(conn, branch, id)? == Some(to));
    }
    let n = match from {
        Some(f) => conn.execute("UPDATE heads SET hash = ?3, at = ?4 WHERE branch = ?1 AND doc = ?2 AND hash = ?5", params![branch, id, hex(to), at as i64, hex(f)]),
        None => conn.execute("INSERT OR IGNORE INTO heads(branch, doc, hash, at) VALUES(?1, ?2, ?3, ?4)", params![branch, id, hex(to), at as i64]),
    }
    .map_err(err)?;
    Ok(n == 1)
}

/// Every doc with a head on `branch`, and that head.
pub fn heads(conn: &Connection, branch: &str) -> Result<Vec<(String, Hash)>> {
    let mut q = conn.prepare_cached("SELECT doc, hash FROM heads WHERE branch = ?1 ORDER BY doc").map_err(err)?;
    let rows = q.query_map([branch], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(err)?;
    let mut out = Vec::new();
    for row in rows {
        let (id, h) = row.map_err(err)?;
        out.push((id, unhex(&h)?));
    }
    Ok(out)
}

pub fn make_branch(conn: &Connection, name: &str, about: &str, at: u64) -> Result<()> {
    conn.execute("INSERT OR IGNORE INTO branches(name, about, at) VALUES(?1, ?2, ?3)", params![name, about, at as i64]).map(|_| ()).map_err(err)
}

pub fn branches(conn: &Connection) -> Result<Vec<String>> {
    let mut q = conn.prepare("SELECT name FROM branches ORDER BY name").map_err(err)?;
    q.query_map([], |r| r.get(0)).map_err(err)?.collect::<std::result::Result<_, _>>().map_err(err)
}

pub fn about(conn: &Connection, branch: &str) -> Result<Option<String>> {
    conn.query_row("SELECT about FROM branches WHERE name = ?1", [branch], |r| r.get(0)).optional().map_err(err)
}

/// Doc `id` leaves main. With no branch holding it either, its row, its words and its references go too; its
/// versions stay.
pub fn forget(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM heads WHERE branch = ?1 AND doc = ?2", [crate::MAIN, id]).map_err(err)?;
    let held: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM heads WHERE doc = ?1)", [id], |r| r.get(0)).map_err(err)?;
    if !held {
        conn.execute("DELETE FROM docs WHERE id = ?1", [id]).map_err(err)?;
        conn.execute("DELETE FROM words WHERE id = ?1", [id]).map_err(err)?;
        conn.execute("DELETE FROM refs WHERE doc = ?1", [id]).map_err(err)?;
    }
    Ok(())
}

// ---- versions ----

/// The Loro version vector of the version `hash` (empty for a version SQLite does not hold).
pub fn vv(conn: &Connection, hash: Hash) -> Result<VersionVector> {
    let b: Option<Vec<u8>> = conn.query_row("SELECT vv FROM versions WHERE hash = ?1", [hex(hash)], |r| r.get(0)).optional().map_err(err)?;
    match b {
        Some(b) => VersionVector::decode(&b).map_err(err),
        None => Ok(VersionVector::default()),
    }
}

/// The doc at the version `hash`, if SQLite holds it: the snapshot its chain starts from, then each update down to it.
pub fn load(conn: &Connection, hash: Hash) -> Result<Option<LoroDoc>> {
    let mut q = conn.prepare_cached("SELECT parent, bytes FROM versions WHERE hash = ?1").map_err(err)?;
    let mut chain: Vec<Vec<u8>> = Vec::new();
    let mut at = hex(hash);
    loop {
        let row: Option<(Option<String>, Vec<u8>)> = q.query_row([&at], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(err)?;
        let Some((parent, bytes)) = row else {
            if chain.is_empty() {
                return Ok(None);
            }
            return Err(format!("the version {hash} descends from {at}, which is not kept"));
        };
        chain.push(bytes);
        match parent {
            Some(p) => at = p,
            None => break,
        }
    }
    let doc = LoroDoc::from_snapshot(chain.last().expect("a chain has its snapshot")).map_err(err)?;
    for update in chain.iter().rev().skip(1) {
        doc.import(update).map_err(err)?;
    }
    Ok(Some(doc))
}

/// The version `hash` as one whole snapshot, and whether these are the very bytes `hash` is the hash of (a version
/// kept as an update is exported anew, and Loro does not promise the same bytes twice).
pub fn snapshot(conn: &Connection, hash: Hash) -> Result<Option<(Vec<u8>, bool)>> {
    let row: Option<(i64, Vec<u8>)> = conn.query_row("SELECT depth, bytes FROM versions WHERE hash = ?1", [hex(hash)], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(err)?;
    match row {
        None => Ok(None),
        Some((0, bytes)) => Ok(Some((bytes, true))),
        Some(_) => {
            let doc = load(conn, hash)?.ok_or_else(|| format!("no version {hash}"))?;
            Ok(Some((doc.export(ExportMode::Snapshot).map_err(err)?, false)))
        }
    }
}

/// Keeps `doc` as a version of `id` that follows `base` (which `doc` already includes); returns its hash. A doc that
/// has nothing `base` lacks is `base`. Called inside the committing transaction.
pub fn keep(conn: &Connection, id: &str, doc: &LoroDoc, base: Option<Hash>, at: u64) -> Result<Hash> {
    let mine = doc.oplog_vv();
    let parent: Option<(Hash, VersionVector, i64)> = match base {
        Some(b) => {
            let row: Option<(Vec<u8>, i64)> = conn.query_row("SELECT vv, depth FROM versions WHERE hash = ?1", [hex(b)], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(err)?;
            match row {
                Some((v, depth)) => Some((b, VersionVector::decode(&v).map_err(err)?, depth)),
                None => None,
            }
        }
        None => None,
    };
    if let Some((b, theirs, _)) = &parent
        && theirs.includes_vv(&mine)
        && mine.includes_vv(theirs)
    {
        return Ok(*b);
    }
    let snapshot = doc.export(ExportMode::Snapshot).map_err(err)?;
    let hash = Hash::new(&snapshot);
    let known: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM versions WHERE hash = ?1)", [hex(hash)], |r| r.get(0)).map_err(err)?;
    if known {
        return Ok(hash);
    }
    let size = json::read(doc).len() as i64;
    if let Some((b, theirs, depth)) = &parent
        && depth + 1 < SNAPSHOT_EVERY
    {
        let update = doc.export(ExportMode::updates(theirs)).map_err(err)?;
        if update.len() * 2 < snapshot.len() {
            conn.execute(
                "INSERT INTO versions(hash, doc, parent, depth, bytes, vv, at, size) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![hex(hash), id, hex(*b), depth + 1, update, mine.encode(), at as i64, size],
            )
            .map_err(err)?;
            return Ok(hash);
        }
    }
    insert_snapshot(conn, id, hash, &snapshot, doc, at)?;
    Ok(hash)
}

fn insert_snapshot(conn: &Connection, id: &str, hash: Hash, snapshot: &[u8], doc: &LoroDoc, at: u64) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO versions(hash, doc, parent, depth, bytes, vv, at, size) VALUES(?1, ?2, NULL, 0, ?3, ?4, ?5, ?6)",
        params![hex(hash), id, snapshot, doc.oplog_vv().encode(), at as i64, json::read(doc).len() as i64],
    )
    .map(|_| ())
    .map_err(err)
}

/// Keeps a version that was made elsewhere (in a store before SQLite, or in the store a fresh one is made from) under
/// the hash it already has: `snapshot` is `doc` as a whole snapshot.
pub fn adopt(conn: &Connection, id: &str, hash: Hash, snapshot: &[u8], doc: &LoroDoc, at: u64) -> Result<()> {
    insert_snapshot(conn, id, hash, snapshot, doc, at)
}

// ---- what a doc is, says and names ----

/// (kind, name) of doc `id`, if it has a row.
pub fn meta_of(conn: &Connection, id: &str) -> Result<Option<(String, String)>> {
    conn.query_row("SELECT kind, name FROM docs WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(err)
}

/// Whether doc `id` has a row.
pub fn described(conn: &Connection, id: &str) -> Result<bool> {
    conn.query_row("SELECT EXISTS(SELECT 1 FROM docs WHERE id = ?1)", [id], |r| r.get(0)).map_err(err)
}

/// A doc's field of `meta`.
fn field(doc: &LoroDoc, key: &str) -> String {
    doc.get_map("meta").get(key).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string()).unwrap_or_default()
}

/// The blobs `doc` names, each with how: its file, its parts, and any hash among its other values.
pub fn names_blobs(doc: &LoroDoc) -> Vec<(String, String)> {
    let whole = json::whole(doc);
    let mut out: Vec<(String, String)> = Vec::new();
    let is_hash = crate::is_hash;
    if let Some(b) = whole["file"]["blob"].as_str().filter(|s| is_hash(s)) {
        out.push((b.to_string(), "file".into()));
    }
    if let Some(parts) = whole["parts"].as_object() {
        for (name, b) in parts {
            if let Some(b) = b.as_str().filter(|s| is_hash(s)) {
                out.push((b.to_string(), format!("part:{name}")));
            }
        }
    }
    let mut all = Vec::new();
    json::strings(&whole, &mut all);
    all.sort();
    all.dedup();
    for s in all {
        if is_hash(&s) && !out.iter().any(|(b, _)| *b == s) {
            out.push((s, "json".into()));
        }
    }
    out
}

/// Writes what `doc` is, says and names into the rows doc `id` is found by.
pub fn describe(conn: &Connection, id: &str, doc: &LoroDoc) -> Result<()> {
    let (kind, name, text) = (field(doc, "kind"), field(doc, "name"), json::read(doc));
    conn.execute(
        "INSERT INTO docs(id, kind, name, size) VALUES(?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET kind = ?2, name = ?3, size = ?4",
        params![id, kind, name, text.len() as i64],
    )
    .map_err(err)?;
    conn.execute("DELETE FROM words WHERE id = ?1", [id]).map_err(err)?;
    conn.execute("INSERT INTO words(id, name, text) VALUES(?1, ?2, ?3)", params![id, name, text]).map_err(err)?;
    conn.execute("DELETE FROM refs WHERE doc = ?1", [id]).map_err(err)?;
    for (blob, how) in names_blobs(doc) {
        conn.execute("INSERT OR IGNORE INTO refs(doc, blob, how) VALUES(?1, ?2, ?3)", params![id, blob, how]).map_err(err)?;
    }
    Ok(())
}

/// The docs `branch` sees (main with `None`) that match `by`.
pub fn find(conn: &Connection, branch: Option<&str>, by: Find) -> Result<Vec<Found>> {
    // a doc is seen where it has a head: on main, or on the branch
    let seen = "EXISTS(SELECT 1 FROM heads h WHERE h.doc = d.id AND h.branch IN ('main', ?2))";
    let (sql, arg) = match by {
        Find::Kind(k) => (format!("SELECT d.id, d.kind, d.name FROM docs d WHERE d.kind = ?1 AND {seen} ORDER BY d.name, d.id"), k.to_string()),
        Find::Name(n) => (
            format!("SELECT d.id, d.kind, d.name FROM docs d WHERE instr(lower(d.name), lower(?1)) > 0 AND {seen} ORDER BY d.name, d.id"),
            n.to_string(),
        ),
        Find::Words(w) => {
            // each word as a quoted string, so nothing a person types is read as FTS5's own syntax
            let words: Vec<String> = w.split_whitespace().map(|x| format!("\"{}\"", x.replace('"', "\"\""))).collect();
            if words.is_empty() {
                return Ok(Vec::new());
            }
            (format!("SELECT d.id, d.kind, d.name FROM words JOIN docs d ON d.id = words.id WHERE words MATCH ?1 AND {seen} ORDER BY words.rank, d.id"), words.join(" "))
        }
    };
    let mut q = conn.prepare(&sql).map_err(err)?;
    q.query_map(params![arg, branch.unwrap_or(crate::MAIN)], |r| Ok(Found { id: r.get(0)?, kind: r.get(1)?, name: r.get(2)? })).map_err(err)?.collect::<std::result::Result<_, _>>().map_err(err)
}

/// The doc the version `hash` is a version of, and when it was made, if SQLite holds it.
pub fn version_of(conn: &Connection, hash: Hash) -> Result<Option<(String, u64)>> {
    conn.query_row("SELECT doc, at FROM versions WHERE hash = ?1", [hex(hash)], |r| Ok((r.get(0)?, r.get::<_, i64>(1)? as u64))).optional().map_err(err)
}
