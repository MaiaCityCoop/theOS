//! theDB: where everything we make is kept, as **docs** and **blobs** (intent 0049).
//!
//! - A **blob** is immutable bytes named by their BLAKE3 hash (as IPFS): an image, a font, a bake, an engine build.
//! - A **doc** is a Loro document with its whole history, named by an id (as IPNS): one shader, one asset, one recipe,
//!   one shot list, one interface view, one engine. Its id is opaque and flat, made once (`new`) and never changed; what
//!   it is and what people call it are inside it (`meta`: kind and name). Nothing is found by a path: a doc names the
//!   docs and blobs it uses by their ids and hashes, and everything is reached from one root doc. Each commit is a
//!   version, named by the BLAKE3 hash of the doc's snapshot at that moment, so a world that names its docs by those
//!   hashes is made again exactly.
//!
//! One store on this device, in one folder; no sync between devices.
//!
//! - **Docs are in SQLite** (`theDB.sqlite`, intent 0053; the schema is at the top of `sql.rs`): each version as Loro's
//!   own update since the version before, with a snapshot now and then; each doc's head on main and on each branch; the
//!   branches; the root. Every process on the machine reads and writes it directly (WAL mode: many readers, one
//!   writer at a time), and a commit is one transaction, so two processes writing one doc both keep their edit.
//! - **Blobs are in iroh-blobs' file store** (`blobs.db`, `data/`). Its files can be open in one process only, so the
//!   first process to open the store owns them and serves them to the others on this machine (iroh-blobs' RPC over
//!   QUIC on 127.0.0.1, trusting only the owner's own certificate).
//! - **What leaves goes to the compost** (`compost/`, deleted for good after 30 days) or to the **archive**
//!   (`archive/`, kept): `compost.rs`. `fresh` makes a store of only what the root reaches and composts the old one.
//!
//! A store made before SQLite (heads as tags, every version a snapshot blob) is moved into SQLite the first time this
//! code opens it as the owner of its files (`migrate`). The API is blocking: the blob store runs on its own small
//! runtime, so the engine and the tools call it from anywhere.

use iroh_blobs::api::Store;
use iroh_blobs::store::fs::FsStore;
use loro::{ExportMode, LoroDoc};
use std::path::{Path, PathBuf};

pub use bytes::Bytes;
pub use iroh_blobs::Hash;
pub use loro;
pub use theid;

/// Every doc theDB opens or makes, set up as Research/0059 §4.7 says: each change records when it was made (Loro keeps
/// no time unless asked), and each commit is its own change (Loro otherwise joins one peer's commits within 1000 s
/// into one change, and the history shows one entry for many).
pub(crate) fn settle(doc: LoroDoc) -> LoroDoc {
    doc.set_record_timestamp(true);
    doc.set_change_merge_interval(-1);
    doc
}

/// A new, empty doc, set up as every doc is.
pub(crate) fn empty() -> LoroDoc {
    settle(LoroDoc::new())
}

/// What can go wrong: the store's own errors, as words.
pub type Result<T> = std::result::Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// How large a piece of a blob another process sends to the store's owner at a time.
const PIECE: usize = 256 * 1024;

/// How often a commit merges with a head that moved under it before it gives up.
const TRIES: usize = 16;

/// The name main has where a branch is named in SQLite (no branch can be called so: `make_branch`).
pub(crate) const MAIN: &str = "main";

/// The tags of a store made before SQLite, read once by `migrate`: `doc/<id>` and `branch/<name>/<id>` → a doc's
/// latest snapshot; `branches/<name>` → a blob of what the branch is for; `root` → a blob holding the root doc's id.
const OLD_DOC: &str = "doc/";
const OLD_BRANCH: &str = "branch/";
const OLD_BRANCHES: &str = "branches/";
const OLD_ROOT: &str = "root";

/// Whether `name` can be a branch's name: lowercase letters, digits and dashes.
pub fn is_branch(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// The letters of an id: lowercase base 32. An id is 26 of them, the first a letter (so an id is also a name a shader
/// module can have).
const ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";
const ID_LEN: usize = 26;

/// Whether `s` reads as a hash: 64 hex digits (a blob's, or a doc version's).
pub fn is_hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Whether `id` is a doc's id: opaque, flat, 26 letters of the alphabet, the first a-z.
pub fn is_id(id: &str) -> bool {
    id.len() == ID_LEN && id.bytes().all(|b| ALPHABET.contains(&b)) && id.as_bytes()[0].is_ascii_lowercase()
}

fn check(id: &str) -> Result<()> {
    if !is_id(id) {
        return Err(format!("not a doc id (26 letters, opaque, flat): {id:?}"));
    }
    Ok(())
}

/// A new id: 130 random bits (BLAKE3 of the time, the process, a counter), in the id alphabet.
fn new_id() -> String {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let seed = format!("{t}:{}:{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    let h = Hash::new(seed.as_bytes());
    let b = h.as_bytes();
    let mut id: String = (0..ID_LEN).map(|i| ALPHABET[(b[i] & 31) as usize] as char).collect();
    id.replace_range(0..1, &((b'a' + b[ID_LEN] % 26) as char).to_string());
    id
}

/// The store.
pub struct TheDB {
    rt: tokio::runtime::Runtime,
    store: Store,
    /// Set in the process that owns the store's files (and serves them to the others).
    owner: Option<FsStore>,
    /// The store's folder.
    dir: PathBuf,
    /// The branch this process reads and writes (`THEDB_BRANCH`); none is main.
    branch: Option<String>,
    /// The docs: this process's own connection to `theDB.sqlite`.
    sql: std::sync::Mutex<rusqlite::Connection>,
    /// The key this process signs its commits with (`access`): the master's or an agent's, from the Keychain.
    /// Read from the Keychain the first time it is needed, so a master made while this process runs is used too.
    signer: std::sync::Mutex<Option<access::SecretKey>>,
    /// The lock this process runs at (`lock.rs`): every doc read at the version it pins, nothing written.
    lock: Option<Locked>,
}

/// A lock this process runs at.
pub(crate) struct Locked {
    pub hash: Hash,
    pub root: String,
    pub docs: std::collections::BTreeMap<String, Hash>,
}

/// Now, in seconds since 1970: when a version was made.
pub(crate) fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

impl TheDB {
    /// The store: `theDB/` at the root of the repository's main checkout, one for every worktree, session and tool
    /// on this machine (git ignores its files). `THEDB` names another.
    pub fn here() -> PathBuf {
        if let Ok(d) = std::env::var("THEDB") {
            return d.into();
        }
        main_checkout(Path::new(env!("CARGO_MANIFEST_DIR"))).join("DATA")
    }

    /// Opens (or makes) the store in `dir`, on the branch `THEDB_BRANCH` names.
    pub fn open(dir: impl AsRef<Path>) -> Result<Self> {
        let branch = match std::env::var("THEDB_BRANCH") {
            Ok(b) if b.is_empty() || b == MAIN => None,
            Ok(b) if is_branch(&b) => Some(b),
            Ok(b) => return Err(format!("THEDB_BRANCH is not a branch's name (lowercase letters, digits, dashes): {b:?}")),
            Err(_) => None,
        };
        let mut db = Self::open_on(dir.as_ref(), branch)?;
        // the system at a lock: `THEDB_LOCK=<hash>` (theKERNEL --at <hash> sets it for the engine)
        if let Ok(l) = std::env::var("THEDB_LOCK")
            && !l.is_empty()
        {
            db.at_lock(l.parse().map_err(|_| format!("THEDB_LOCK is not a hash: {l:?}"))?)?;
        }
        Ok(db)
    }

    /// Opens (or makes) the store in `dir`, on `branch`.
    pub(crate) fn open_on(dir: &Path, branch: Option<String>) -> Result<Self> {
        let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().map_err(err)?;
        std::fs::create_dir_all(dir).map_err(err)?;
        // what the compost has held for longer than its days goes for good, before anything is read
        for gone in compost::sweep(dir, std::time::SystemTime::now()) {
            eprintln!("thedb: {gone} left the compost for good");
        }
        let (store, owner) = Self::open_blobs(&rt, dir)?;
        let sql = sql::open(dir)?;
        let db = TheDB { rt, store, owner, dir: dir.to_path_buf(), branch, sql: std::sync::Mutex::new(sql), signer: std::sync::Mutex::new(None), lock: None };
        db.prepare()?;
        Ok(db)
    }

    /// The blob store in `dir`: owned by this process if its files are free, otherwise reached through its owner.
    fn open_blobs(rt: &tokio::runtime::Runtime, dir: &Path) -> Result<(Store, Option<FsStore>)> {
        let (port, cert) = (dir.join("rpc.port"), dir.join("rpc.cert"));
        // a store whose owner is closing, or has gone without tidying up, answers nothing: wait a little and take it
        // over (the files are free once the owner is gone)
        for _ in 0..40 {
            match rt.block_on(FsStore::load(dir)) {
                Ok(fs) => {
                    // the owner: serve the store to the other processes on this machine
                    let _guard = rt.enter();
                    let (endpoint, der) = irpc::util::make_server_endpoint("127.0.0.1:0".parse().unwrap()).map_err(err)?;
                    let at = endpoint.local_addr().map_err(err)?;
                    std::fs::write(&cert, &der).map_err(err)?;
                    std::fs::write(&port, at.port().to_string()).map_err(err)?;
                    let store: Store = (*fs).clone();
                    rt.spawn(store.clone().listen(endpoint));
                    return Ok((store, Some(fs)));
                }
                Err(e) => {
                    // another process owns it: talk to that one, if it answers
                    let (Ok(p), Ok(der)) = (std::fs::read_to_string(&port), std::fs::read(&cert)) else {
                        return Err(format!("the store is held by another process that does not serve it: {e}"));
                    };
                    let addr: std::net::SocketAddr = format!("127.0.0.1:{}", p.trim()).parse().map_err(err)?;
                    let store = {
                        let _guard = rt.enter();
                        let endpoint = irpc::util::make_client_endpoint("127.0.0.1:0".parse().unwrap(), &[&der]).map_err(err)?;
                        Store::connect(endpoint, addr)
                    };
                    let answers = rt.block_on(async { tokio::time::timeout(std::time::Duration::from_secs(2), store.tags().get(OLD_ROOT)).await.is_ok_and(|r| r.is_ok()) });
                    if answers {
                        return Ok((store, None));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            }
        }
        Err("the store's owner neither answers nor lets it go".into())
    }

    /// Makes the SQLite file ready: its tables, made once, by the owner of the blob store. A store made before SQLite
    /// is moved into it in the same transaction, so no process ever reads half of it.
    ///
    /// A process that does not own the blob store and finds no tables is talking to an owner that runs the code from
    /// before SQLite (the new code makes them when it opens): that owner reads heads from tags, this one would write
    /// them to SQLite, and the two would no longer see each other's commits. So it is refused.
    /// What a store made before the newest tables gains, in one transaction (two processes may open it at once).
    fn upgrade(&self) -> Result<()> {
        let mut sql = self.sql();
        let tx = sql.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
        sql::upgrade(&tx)?;
        tx.commit().map_err(err)
    }

    fn prepare(&self) -> Result<()> {
        if self.owner.is_none() {
            // an owner that has just opened makes its tables in a moment
            for _ in 0..20 {
                if sql::ready(&self.sql())? {
                    return self.upgrade();
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            return Err("the store's files are held by a process that runs the code from before SQLite (the kernel, most likely): stop it, then run this again; the first run moves the docs into theDB.sqlite".into());
        }
        let mut sql = self.sql();
        let tx = sql.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
        if sql::ready(&tx)? {
            drop(tx);
            drop(sql);
            return self.upgrade();
        }
        sql::create(&tx)?;
        let moved = self.migrate(&tx)?;
        sql::mark_ready(&tx)?;
        tx.commit().map_err(err)?;
        if moved > 0 {
            // the code from before SQLite starts from the root tag: without it, it stops with "no root" instead of
            // going on with heads that no longer move
            self.rt.block_on(async { self.store.tags().delete(OLD_ROOT).await.map(|_| ()).map_err(err) })?;
            eprintln!("thedb: {moved} doc heads moved from tags into theDB.sqlite (the old snapshots stay as blobs, read by hash as before)");
        }
        Ok(())
    }

    /// Moves a store made before SQLite into it: every doc's head on main and on each branch as a version (its
    /// snapshot as it is, under the hash it had), the branches, and the root. Earlier versions were never listed
    /// anywhere; their snapshots stay in the blob store, where `doc_at` still finds them by hash. How many heads moved.
    fn migrate(&self, tx: &rusqlite::Connection) -> Result<usize> {
        let at = now();
        let mut moved = 0;
        let mut heads: Vec<(String, String, Hash)> = self.tags_under(OLD_DOC)?.into_iter().map(|(id, h)| (MAIN.to_string(), id, h)).collect();
        for (rest, h) in self.tags_under(OLD_BRANCH)? {
            if let Some((branch, id)) = rest.split_once('/') {
                heads.push((branch.to_string(), id.to_string(), h));
            }
        }
        for (branch, id, hash) in heads {
            let Some(snapshot) = self.get(hash)? else {
                eprintln!("thedb: {id} on {branch}: its snapshot {hash} is not in the store; left behind");
                continue;
            };
            let Ok(doc) = LoroDoc::from_snapshot(&snapshot) else {
                eprintln!("thedb: {id} on {branch}: {hash} is no doc; left behind");
                continue;
            };
            sql::adopt(tx, &id, hash, &snapshot, &doc, at)?;
            sql::set_head(tx, &branch, &id, hash, at)?;
            if branch == MAIN || !sql::described(tx, &id)? {
                sql::describe(tx, &id, &doc)?;
            }
            moved += 1;
        }
        for (name, h) in self.tags_under(OLD_BRANCHES)? {
            let about = self.get(h)?.map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
            sql::make_branch(tx, &name, &about, at)?;
        }
        let root = self.rt.block_on(async { self.store.tags().get(OLD_ROOT).await.map(|t| t.map(|t| t.hash)).map_err(err) })?;
        if let Some(h) = root
            && let Some(id) = self.get(h)?
        {
            sql::set_meta(tx, sql::ROOT, &String::from_utf8_lossy(&id))?;
        }
        Ok(moved)
    }

    /// The tags under `prefix` in the blob store: what follows the prefix, and the hash each names.
    fn tags_under(&self, prefix: &str) -> Result<Vec<(String, Hash)>> {
        use n0_future::StreamExt;
        self.rt.block_on(async {
            let mut list = self.store.tags().list_prefix(prefix).await.map_err(err)?;
            let mut out = Vec::new();
            while let Some(t) = list.next().await {
                let t = t.map_err(err)?;
                out.push((String::from_utf8_lossy(&t.name.0[prefix.len()..]).into_owned(), t.hash));
            }
            Ok(out)
        })
    }

    /// This process's connection to the docs.
    pub(crate) fn sql(&self) -> std::sync::MutexGuard<'_, rusqlite::Connection> {
        self.sql.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// A doc as `branch` sees it, or a new empty doc.
    pub(crate) fn doc_seen(&self, branch: Option<&str>, id: &str) -> Result<LoroDoc> {
        match self.head_seen(branch, id)? {
            Some(h) => self.doc_at(h),
            None => Ok(empty()),
        }
    }

    /// What a doc says it is: (kind, name).
    pub(crate) fn meta_of(&self, doc: &LoroDoc) -> (String, String) {
        let meta = doc.get_map("meta");
        let field = |k: &str| meta.get(k).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string()).unwrap_or_default();
        (field("kind"), field("name"))
    }

    /// Writes what the store holds to disk now: before a process that owns it may be stopped.
    pub fn sync(&self) -> Result<()> {
        self.rt.block_on(async { self.store.sync_db().await.map_err(err) })
    }

    /// The store's folder.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Whether this process owns the store's files (the others reach it through this one).
    pub fn owns(&self) -> bool {
        self.owner.is_some()
    }

    // ---- blobs ----

    /// Keeps `bytes`; returns their hash. The same bytes give the same hash, kept once.
    pub fn put(&self, bytes: impl Into<Bytes>) -> Result<Hash> {
        let bytes = bytes.into();
        // the owner keeps them at once; another process sends large ones to it as a stream of pieces, since one
        // message over the store's connection is limited (a 224 MB build, a lawn's 14 MB atlas did not pass)
        if self.owner.is_some() || bytes.len() <= PIECE {
            return self.rt.block_on(async { self.store.blobs().add_bytes(bytes).await.map(|t| t.hash).map_err(err) });
        }
        let pieces: Vec<std::io::Result<Bytes>> = (0..bytes.len()).step_by(PIECE).map(|at| Ok(bytes.slice(at..(at + PIECE).min(bytes.len())))).collect();
        let hash = self.rt.block_on(async { self.store.blobs().add_stream(n0_future::stream::iter(pieces)).await.await.map(|t| t.hash).map_err(err) })?;
        if hash != Hash::new(&bytes) {
            return Err("a blob sent in pieces came back under another hash".into());
        }
        Ok(hash)
    }

    /// The bytes of `hash`, if the store has them.
    pub fn get(&self, hash: Hash) -> Result<Option<Bytes>> {
        self.rt.block_on(async {
            if !self.store.blobs().has(hash).await.map_err(err)? {
                return Ok(None);
            }
            self.store.blobs().get_bytes(hash).await.map(Some).map_err(err)
        })
    }

    /// How many bytes the blob `hash` has, if the store has all of it.
    pub fn blob_size(&self, hash: Hash) -> Result<Option<u64>> {
        use iroh_blobs::api::blobs::BlobStatus;
        self.rt.block_on(async {
            Ok(match self.store.blobs().status(hash).await.map_err(err)? {
                BlobStatus::Complete { size } => Some(size),
                _ => None,
            })
        })
    }

    /// Every blob the store has.
    pub fn blobs(&self) -> Result<Vec<Hash>> {
        self.rt.block_on(async { self.store.blobs().list().hashes().await.map_err(err) })
    }

    // ---- docs ----

    /// The latest version of doc `id` on this process's branch (main's where the branch has not changed it): the hash
    /// that names it.
    pub fn head(&self, id: &str) -> Result<Option<Hash>> {
        self.head_seen(self.branch.as_deref(), id)
    }

    /// The latest version of doc `id` as `branch` sees it: the branch's version, or main's where it has none.
    pub fn head_seen(&self, branch: Option<&str>, id: &str) -> Result<Option<Hash>> {
        if let Some(b) = branch
            && let Some(h) = self.head_on(Some(b), id)?
        {
            return Ok(Some(h));
        }
        self.head_on(None, id)
    }

    /// The latest version of doc `id` on `branch` itself (main with `None`), without falling through.
    pub fn head_on(&self, branch: Option<&str>, id: &str) -> Result<Option<Hash>> {
        // at a lock, a doc is the version the lock pins, on every branch; a doc it does not pin is not there
        if let Some(l) = &self.lock {
            return Ok(l.docs.get(id).copied());
        }
        sql::head(&self.sql(), branch.unwrap_or(MAIN), id)
    }

    /// The branch this process reads and writes; `None` is main.
    pub fn branch(&self) -> Option<&str> {
        self.branch.as_deref()
    }

    /// Reads and writes on `branch` from now on (`None`: main). The branch must exist.
    pub fn set_branch(&mut self, branch: Option<&str>) -> Result<()> {
        if let Some(b) = branch
            && !self.branches()?.iter().any(|x| x == b)
        {
            return Err(format!("no branch {b}"));
        }
        self.branch = branch.map(str::to_string);
        Ok(())
    }

    /// Doc `id` as it is now, or a new empty doc if there is none yet.
    pub fn doc(&self, id: &str) -> Result<LoroDoc> {
        match self.head(id)? {
            Some(h) => self.doc_at(h),
            None => Ok(empty()),
        }
    }

    /// The doc at the version `hash`: one exact version, with its history up to it. A version made before SQLite that
    /// was no head when the store moved is read from its snapshot blob, as it always was.
    pub fn doc_at(&self, hash: Hash) -> Result<LoroDoc> {
        if let Some(doc) = sql::load(&self.sql(), hash)? {
            return Ok(doc);
        }
        let bytes = self.get(hash)?.ok_or_else(|| format!("no version {hash}"))?;
        LoroDoc::from_snapshot(&bytes).map(settle).map_err(err)
    }

    /// Doc `id` to write: as `doc`, with a peer id lent to this writer alone (Research/0059 §1.8). Loro gives every
    /// loaded doc a new random peer, and each peer costs every later version its own entry (500 commits by fresh
    /// peers made a snapshot 5.8 times as large as by one); a lent peer is used again by the next writer whose doc
    /// holds every op it made. Given back when the `Edit` is dropped.
    pub fn edit(&self, id: &str) -> Result<Edit<'_>> {
        let doc = self.doc(id)?;
        let peer = sql::lease(&self.sql(), id, &doc.oplog_vv())?;
        doc.set_peer_id(peer).map_err(err)?;
        Ok(Edit { db: self, id: id.to_string(), doc, peer })
    }

    /// The frontiers that name the version `hash` in Loro's terms (the same on every device that holds the doc's
    /// history), if it was kept with them.
    pub fn frontiers(&self, hash: Hash) -> Result<Option<loro::Frontiers>> {
        sql::frontiers(&self.sql(), hash)
    }

    /// Brings what the version `hash` has and `into` lacks into `into`.
    pub(crate) fn bring(&self, into: &LoroDoc, hash: Hash) -> Result<()> {
        let theirs = self.doc_at(hash)?;
        let updates = theirs.export(ExportMode::updates(&into.oplog_vv())).map_err(err)?;
        into.import(&updates).map(|_| ()).map_err(err)
    }

    /// Keeps `doc` as the latest version of `id` on this process's branch; returns the hash that names this version.
    pub fn commit(&self, id: &str, doc: &LoroDoc) -> Result<Hash> {
        let branch = self.branch.clone();
        self.commit_on(branch.as_deref(), id, doc)
    }

    /// Keeps `doc` as the latest version of `id` on `branch` (main with `None`). A doc is a CRDT: what was committed to
    /// it meanwhile (by another process, or on main before the branch first changed it) is merged in, never
    /// overwritten. The head moves only by compare-and-swap, from the head this commit merged with: reading it,
    /// merging, keeping the version and moving it are one SQLite transaction that holds the write lock, and should the
    /// head have moved all the same, the commit merges with the new one and tries again. So of two processes
    /// committing one doc at once, the second merges the first's version, and neither edit is lost.
    pub fn commit_on(&self, branch: Option<&str>, id: &str, doc: &LoroDoc) -> Result<Hash> {
        check(id)?;
        if let Some(l) = &self.lock {
            return Err(format!("this process runs the system at the lock {}: it reads, and writes nothing", l.hash.fmt_short()));
        }
        let on = branch.unwrap_or(MAIN);
        // who signs it, refused here if this process may not write `on`
        let sign = self.may_write(on)?;
        // a message of its own: Loro joins one peer's consecutive changes that share a message and a second (on
        // import too, whatever the merge interval), and the history would show one entry for many commits
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        doc.set_next_commit_message(&format!("theDB {t:x}"));
        doc.commit();
        for _ in 0..TRIES {
            let mut sql = self.sql();
            let tx = sql.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
            // the head the swap expects: the doc's own on this branch (none yet: a branch that has not changed it)
            let expected = sql::head(&tx, on, id)?;
            let base = match expected {
                Some(h) => Some(h),
                None => sql::head(&tx, MAIN, id)?,
            };
            if let Some(base) = base {
                let theirs = sql::vv(&tx, base)?;
                if !doc.oplog_vv().includes_vv(&theirs) {
                    let theirs = match sql::load(&tx, base)? {
                        Some(d) => d,
                        // a head is always a version SQLite holds; this reads one from before it all the same
                        None => LoroDoc::from_snapshot(&self.get(base)?.ok_or_else(|| format!("no version {base}"))?).map_err(err)?,
                    };
                    doc.import(&theirs.export(ExportMode::updates(&doc.oplog_vv())).map_err(err)?).map_err(err)?;
                }
                json::heal(doc)?;
                doc.commit();
            }
            // what is kept fits the schema the doc names, as merged (schema.rs)
            self.check_schema(id, doc)?;
            let at = now();
            let hash = sql::keep(&tx, id, doc, base, at)?;
            if !sql::move_head(&tx, on, id, expected, hash, at)? {
                // the head moved under us: let this transaction go and merge with the new head
                drop(tx);
                continue;
            }
            // what a doc is called and what it says are main's; a doc made on a branch is the branch's until it is
            // merged
            if branch.is_none() || !sql::described(&tx, id)? {
                sql::describe(&tx, id, doc)?;
            }
            if let Some((key, grant)) = &sign {
                Self::sign_commit(&tx, id, on, hash, at, key, *grant)?;
            }
            tx.commit().map_err(err)?;
            return Ok(hash);
        }
        Err(format!("{id}: its head kept moving while this commit merged with it ({TRIES} tries)"))
    }

    /// Every doc's id and the hash of its current version, as this process's branch sees them.
    pub fn docs(&self) -> Result<Vec<(String, Hash)>> {
        let mut all: std::collections::BTreeMap<String, Hash> = sql::heads(&self.sql(), MAIN)?.into_iter().collect();
        if let Some(b) = &self.branch {
            all.extend(self.changed_on(b)?);
        }
        Ok(all.into_iter().collect())
    }

    /// The docs `branch` has changed, and their versions there.
    pub fn changed_on(&self, branch: &str) -> Result<Vec<(String, Hash)>> {
        sql::heads(&self.sql(), branch)
    }

    // ---- branches (intent 0051) ----

    /// A new branch, `name`, from main as it is; `about` says what it is for. A branch that exists stays as it is.
    pub fn make_branch(&self, name: &str, about: &str) -> Result<()> {
        if !is_branch(name) || name == "main" {
            return Err(format!("not a branch's name (lowercase letters, digits, dashes; not main): {name:?}"));
        }
        if self.branches()?.iter().any(|b| b == name) {
            return Ok(());
        }
        // in a signed store, branches are the master's to make (an agent's line comes with its grant)
        self.is_master_or_host().map_err(|_| "branches are made by the master or theOS's host only".to_string())?;
        sql::make_branch(&self.sql(), name, about, now())
    }

    /// Every branch's name.
    pub fn branches(&self) -> Result<Vec<String>> {
        sql::branches(&self.sql())
    }

    /// What `branch` is for.
    pub fn about(&self, branch: &str) -> Result<String> {
        sql::about(&self.sql(), branch)?.ok_or_else(|| format!("no branch {branch}"))
    }

    /// Doc `id` as `branch`'s version and main's merged, without keeping it: what main would be after the merge.
    pub fn merged(&self, branch: &str, id: &str) -> Result<LoroDoc> {
        let doc = match self.head_on(None, id)? {
            Some(h) => self.doc_at(h)?,
            None => empty(),
        };
        if let Some(h) = self.head_on(Some(branch), id)? {
            self.bring(&doc, h)?;
        }
        Ok(doc)
    }

    /// Brings the versions `docs` (id → a version on a branch) into main: each merged with what main has. Returns the
    /// new main versions. The branch keeps its own heads; what it changes afterwards can be brought in again.
    pub fn merge_into_main(&self, docs: &[(String, Hash)]) -> Result<Vec<(String, Hash)>> {
        let mut out = Vec::new();
        for (id, version) in docs {
            let doc = self.doc_at(*version)?;
            out.push((id.clone(), self.commit_on(None, id, &doc)?));
        }
        Ok(out)
    }

    /// A new doc: its id made here, its kind and name kept inside it. Returns the id.
    pub fn new(&self, kind: &str, name: &str) -> Result<String> {
        let id = new_id();
        let doc = self.edit(&id)?;
        let meta = doc.get_map("meta");
        meta.insert("kind", kind).map_err(err)?;
        meta.insert("name", name).map_err(err)?;
        self.commit(&id, &doc)?;
        Ok(id)
    }

    /// What doc `id` is and what people call it: (kind, name). On main this is a row in SQLite, no doc is opened; a
    /// branch reads its own version, where it may have renamed the doc.
    pub fn meta(&self, id: &str) -> Result<(String, String)> {
        if self.branch.is_none()
            && let Some(m) = sql::meta_of(&self.sql(), id)?
        {
            return Ok(m);
        }
        Ok(self.meta_of(&self.doc(id)?))
    }

    /// Lets doc `id` go: it is no longer reached. Its versions stay, so what pinned them still reads them.
    pub fn forget(&self, id: &str) -> Result<()> {
        if let Some(b) = &self.branch {
            return Err(format!("forget on main only (this process is on the branch {b})"));
        }
        sql::forget(&self.sql(), id)
    }

    /// The root doc's id: where everything is reached from.
    pub fn root(&self) -> Result<Option<String>> {
        if let Some(l) = &self.lock {
            return Ok(Some(l.root.clone()));
        }
        sql::get_meta(&self.sql(), sql::ROOT)
    }

    /// Makes doc `id` the root.
    pub fn set_root(&self, id: &str) -> Result<()> {
        check(id)?;
        sql::set_meta(&self.sql(), sql::ROOT, id)
    }

    // ---- finding docs: by what they are, what they are called, what they say ----

    /// The docs this process's branch sees that match `by`, without opening a doc: a kind, a part of a name, or words
    /// in the name or the text (SQLite's full-text search; every word must be there).
    pub fn find(&self, by: Find) -> Result<Vec<Found>> {
        sql::find(&self.sql(), self.branch.as_deref(), by)
    }

    // ---- text docs: a shader, a recipe, a shot list ----

    /// The text of doc `id`, if it exists: its root text, or, for a doc kept as a map (`json`), that map written out as
    /// JSON.
    pub fn text(&self, id: &str) -> Result<Option<String>> {
        Ok(match self.head(id)? {
            Some(h) => Some(json::read(&self.doc_at(h)?)),
            None => None,
        })
    }

    /// Sets the text of doc `id`, as an edit of what it was (so its history shows what changed); a text that is
    /// already there commits nothing. A text that is a JSON object is kept as a Loro map, key by key (`json`), so two
    /// branches that change it merge by key and never into a text that no longer parses. Returns the hash of the
    /// version that holds it.
    pub fn set_text(&self, id: &str, text: &str) -> Result<Hash> {
        let doc = self.edit(id)?;
        if !json::write(&doc, text)?
            && let Some(h) = self.head(id)?
        {
            return Ok(h);
        }
        self.commit(id, &doc)
    }
}

// ---- files: what the engine loads by path (a shader, a font, a recipe) ----

impl TheDB {
    /// Keeps a file as doc `id`: text as the doc's text (so its history shows each edit), anything else as a blob the
    /// doc names (`blob` in its root map). The same content commits nothing. Returns the version's hash.
    pub fn set_file(&self, id: &str, bytes: &[u8]) -> Result<Hash> {
        // text is what reads as text: UTF-8 without control characters but line breaks and tabs (a grid of small
        // numbers can be valid UTF-8 too, and is not text)
        if let Ok(text) = std::str::from_utf8(bytes)
            && !text.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
        {
            return self.set_text(id, text);
        }
        let blob = self.put(bytes.to_vec())?.to_hex().to_string();
        let doc = self.edit(id)?;
        let map = doc.get_map("file");
        if let Some(h) = self.head(id)?
            && map.get("blob").and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).is_some_and(|b| *b == blob)
        {
            return Ok(h);
        }
        map.insert("blob", blob).map_err(err)?;
        self.commit(id, &doc)
    }

    /// The file kept as doc `id` (its text, or the blob it names), at its current version.
    pub fn file(&self, id: &str) -> Result<Option<Vec<u8>>> {
        match self.head(id)? {
            Some(h) => self.file_at(h).map(Some),
            None => Ok(None),
        }
    }

    /// The file in the doc version `hash`.
    pub fn file_at(&self, hash: Hash) -> Result<Vec<u8>> {
        let doc = self.doc_at(hash)?;
        if let Some(b) = doc.get_map("file").get("blob").and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()) {
            let h: Hash = b.parse().map_err(err)?;
            return Ok(self.get(h)?.ok_or_else(|| format!("no blob {h}"))?.to_vec());
        }
        Ok(json::read(&doc).into_bytes())
    }
}

/// The root of the repository's main checkout, from any folder in it or in one of its worktrees (a worktree's `.git`
/// is a file naming `<main>/.git/worktrees/<name>`).
fn main_checkout(from: &Path) -> PathBuf {
    for dir in from.ancestors() {
        let git = dir.join(".git");
        if git.is_dir() {
            return dir.to_path_buf();
        }
        if let Ok(link) = std::fs::read_to_string(&git)
            && let Some(at) = link.trim().strip_prefix("gitdir: ")
            && let Some(main_git) = Path::new(at).ancestors().find(|a| a.file_name().is_some_and(|n| n == ".git"))
            && let Some(main) = main_git.parent()
        {
            return main.to_path_buf();
        }
    }
    from.to_path_buf()
}

// ---- parts: a doc that holds several files, each a blob by name (a place's height, cover, map layers) ----

impl TheDB {
    /// Keeps `bytes` as the part `name` of doc `id` (a blob the doc names in its map `parts`). Unchanged, nothing is
    /// committed. Returns the doc's version hash.
    pub fn set_part(&self, id: &str, name: &str, bytes: &[u8]) -> Result<Hash> {
        let blob = self.put(bytes.to_vec())?.to_hex().to_string();
        let doc = self.edit(id)?;
        let parts = doc.get_map("parts");
        if let Some(h) = self.head(id)?
            && parts.get(name).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).is_some_and(|b| *b == blob)
        {
            return Ok(h);
        }
        parts.insert(name, blob).map_err(err)?;
        self.commit(id, &doc)
    }

    /// The part `name` of doc `id`, at its current version.
    pub fn part(&self, id: &str, name: &str) -> Result<Option<Bytes>> {
        let Some(h) = self.head(id)? else { return Ok(None) };
        let doc = self.doc_at(h)?;
        let Some(b) = doc.get_map("parts").get(name).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()) else {
            return Ok(None);
        };
        self.get(b.parse().map_err(err)?)
    }
}

// ---- the engine: its source and its builds, kept like everything else ----

/// A build of the engine: its binary, the source tree it was made from (a manifest blob: each file's path in the tree
/// and its blob), and the toolchain. Kept as a blob of JSON; a build is named by that blob's hash.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Build {
    pub binary: String,
    pub source: String,
    pub toolchain: String,
}

/// An engine doc: its builds, newest last, and the one pinned (the one the kernel starts).
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct Engine {
    pub pinned: Option<String>,
    pub builds: Vec<String>,
}

impl TheDB {
    /// Keeps a build of engine `id`: the binary as a blob, the manifest of its source (the git commit and each file's
    /// blob, `publish_git`) as a blob, the build as a blob; adds it to the engine's builds and pins it. Returns the
    /// build's hash.
    pub fn publish(&self, id: &str, binary: &[u8], manifest: &[u8], toolchain: &str) -> Result<Hash> {
        let branch = self.branch.clone();
        self.publish_on(branch.as_deref(), id, binary, manifest, toolchain)
    }

    /// As `publish`, the engine doc written on `branch` (main with `None`).
    pub fn publish_on(&self, branch: Option<&str>, id: &str, binary: &[u8], manifest: &[u8], toolchain: &str) -> Result<Hash> {
        let manifest = self.put(manifest.to_vec())?;
        let build = Build { binary: self.put(binary.to_vec())?.to_hex().to_string(), source: manifest.to_hex().to_string(), toolchain: toolchain.into() };
        let hash = self.put(serde_json::to_vec_pretty(&build).map_err(err)?)?;
        let mut engine = self.engine_on(branch, id)?;
        engine.builds.push(hash.to_hex().to_string());
        engine.pinned = Some(hash.to_hex().to_string());
        self.set_text_on(branch, id, &serde_json::to_string_pretty(&engine).map_err(err)?)?;
        Ok(hash)
    }

    /// Engine doc `id` as `branch` sees it.
    pub fn engine_on(&self, branch: Option<&str>, id: &str) -> Result<Engine> {
        let doc = self.doc_seen(branch, id)?;
        Ok(serde_json::from_str(&json::read(&doc)).unwrap_or_default())
    }

    /// Sets the text of doc `id` on `branch` (main with `None`), as `set_text` does on this process's branch.
    pub fn set_text_on(&self, branch: Option<&str>, id: &str, text: &str) -> Result<Hash> {
        let doc = self.doc_seen(branch, id)?;
        if !json::write(&doc, text)?
            && let Some(h) = self.head_seen(branch, id)?
        {
            return Ok(h);
        }
        self.commit_on(branch, id, &doc)
    }

    /// Engine `id`: its builds and the pinned one.
    pub fn engine(&self, id: &str) -> Result<Engine> {
        Ok(self.text(id)?.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default())
    }

    /// Proposes pinning build `build` of engine `id` (an earlier one, to go back to it): on a branch of its own, for a
    /// person to accept in theOS, as every new build is. Returns the proposal's id.
    pub fn pin(&self, id: &str, build: &str) -> Result<String> {
        let mut engine = self.engine(id)?;
        if !engine.builds.iter().any(|b| b == build) {
            return Err(format!("engine {id} has no build {build}"));
        }
        let branch = format!("pin-{}", &build[..12.min(build.len())]);
        self.make_branch(&branch, &format!("pin the build {build}"))?;
        engine.pinned = Some(build.into());
        self.set_text_on(Some(&branch), id, &serde_json::to_string_pretty(&engine).map_err(err)?)?;
        self.propose(&branch, &format!("Run the host build {} again", &build[..12.min(build.len())]))
    }

    /// A build, by its hash.
    pub fn build(&self, hash: &str) -> Result<Build> {
        let b = self.get(hash.parse().map_err(err)?)?.ok_or_else(|| format!("no build {hash}"))?;
        serde_json::from_slice(&b).map_err(err)
    }
}

/// The engine the root names, at the build it pins, as a binary on disk ready to run.
pub struct Pinned {
    pub engine: String,
    pub build: String,
    pub toolchain: String,
    pub path: PathBuf,
}

impl TheDB {
    /// The engine the root names, at its pinned build: the binary is written once beside the store under its hash,
    /// as the app theOS (`cache/run/<hash>/theOS.app`, so the system shows its name, not a hash), and checked against
    /// that hash every time, so what runs is what the build names.
    pub fn pinned_engine(&self) -> Result<Pinned> {
        use std::os::unix::fs::PermissionsExt;
        let root = self.root()?.ok_or("theDB has no root")?;
        let root_doc: serde_json::Value = serde_json::from_str(&self.text(&root)?.unwrap_or_default()).map_err(err)?;
        let engine = root_doc["engine"].as_str().ok_or("the root names no engine")?.to_string();
        let pinned = self.engine(&engine)?.pinned.ok_or("the engine pins no build")?;
        let build = self.build(&pinned)?;
        let hash: Hash = build.binary.parse().map_err(|_| "the build's binary is no hash")?;
        let app = self.dir.join("cache").join("run").join(hash.to_hex().as_str());
        if app.is_file() {
            // a build written out before the app bundle: a bare file under the hash
            std::fs::remove_file(&app).map_err(err)?;
        }
        let run = app.join("theOS.app").join("Contents").join("MacOS");
        let path = run.join("theOS");
        let good = |p: &Path| std::fs::read(p).is_ok_and(|b| Hash::new(&b) == hash);
        if !good(&path) {
            if path.exists() {
                eprintln!("thedb: the cached engine binary does not match its hash: refused, and written again from the store");
            }
            let bytes = self.get(hash)?.ok_or("the store lacks the engine's binary")?;
            if Hash::new(&bytes) != hash {
                return Err("the engine's binary does not match its hash: refused".into());
            }
            // written beside and moved in, so a process starting it meanwhile never sees half a binary
            std::fs::create_dir_all(&run).map_err(err)?;
            let plist = format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n<key>CFBundleName</key><string>theOS</string>\n<key>CFBundleDisplayName</key><string>theOS</string>\n<key>CFBundleExecutable</key><string>theOS</string>\n<key>CFBundleIdentifier</key><string>city.maia.theos</string>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleVersion</key><string>{}</string>\n<key>CFBundleIconFile</key><string>theOS</string>\n<key>NSHighResolutionCapable</key><true/>\n</dict></plist>\n",
                &hash.to_hex()[..12]
            );
            std::fs::write(app.join("theOS.app").join("Contents").join("Info.plist"), plist).map_err(err)?;
            // the app's icon: theOS's star (App/assets/theOS.icns, made from Brand/star.svg)
            let resources = app.join("theOS.app").join("Contents").join("Resources");
            std::fs::create_dir_all(&resources).map_err(err)?;
            std::fs::write(resources.join("theOS.icns"), include_bytes!("../../assets/theOS.icns")).map_err(err)?;
            static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let part = run.join(format!("theOS.{}.{n}", std::process::id()));
            std::fs::write(&part, &bytes).map_err(err)?;
            std::fs::set_permissions(&part, std::fs::Permissions::from_mode(0o755)).map_err(err)?;
            std::fs::rename(&part, &path).map_err(err)?;
            if !good(&path) {
                return Err("the engine's binary on disk does not match its hash: refused".into());
            }
        }
        Ok(Pinned { engine, build: pinned, toolchain: build.toolchain, path })
    }
}

pub mod compost;

pub mod fresh;

mod sql;

pub use sql::{Find, Found};

#[cfg(feature = "bevy")]
pub mod bevy;

pub mod access;
pub mod build;
pub mod proposals;
pub mod lock;
pub mod schema;
pub mod vibe;

pub mod inventory;

mod json;

impl Drop for TheDB {
    fn drop(&mut self) {
        // the owner lets the store write what it holds before its runtime goes; a client just goes
        if self.owner.is_some() {
            let _ = self.rt.block_on(self.store.shutdown());
        }
    }
}

/// A doc being written, with the peer id lent to it (`TheDB::edit`); it reads as the doc itself.
pub struct Edit<'a> {
    db: &'a TheDB,
    id: String,
    doc: LoroDoc,
    peer: u64,
}

impl std::ops::Deref for Edit<'_> {
    type Target = LoroDoc;
    fn deref(&self) -> &LoroDoc {
        &self.doc
    }
}

impl Drop for Edit<'_> {
    fn drop(&mut self) {
        // the peer is lent again only to a doc that holds exactly this many of its ops; ops never committed were never
        // kept anywhere, so making their ids again with other content harms nothing
        let n = self.doc.oplog_vv().get(&self.peer).copied().unwrap_or(0);
        let _ = sql::give_back(&self.db.sql(), &self.id, self.peer, n);
    }
}
