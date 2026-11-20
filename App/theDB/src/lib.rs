//! theDB: where everything we make is kept, as **docs** and **blobs** (intent 0049).
//!
//! - A **blob** is immutable bytes named by their BLAKE3 hash (as IPFS): an image, a font, a bake, an engine build.
//! - A **doc** is a Loro document with its whole history, named by an id (as IPNS): one shader, one asset, one recipe,
//!   one shot list, one interface view, one engine. Its id is opaque and flat, made once (`new`) and never changed; what
//!   it is and what people call it are inside it (`meta`: kind and name). Nothing is found by a name or a path: a doc
//!   names the docs and blobs it uses by their ids and hashes, and everything is reached from one root doc. It is stored as blobs too: each commit writes the doc's snapshot as a
//!   blob, and the doc's id points to its latest one. Every commit's snapshot is kept, so each version of a doc is also
//!   named by a hash, and a world that names its docs by those hashes is made again exactly.
//!
//! One store on this device, on disk (iroh-blobs' file store); no sync between devices. Its files can be open in one
//! process only, so the first process to open it owns it and serves it to the others on this machine (iroh-blobs'
//! RPC over QUIC on 127.0.0.1, trusting only the owner's own certificate): the app and `thedb` in a shell work on the
//! same store at once, and a commit made by either is seen by both. The API is blocking: the store runs on its own
//! small runtime, so the engine and the tools call it from anywhere.

use iroh_blobs::api::Store;
use iroh_blobs::store::fs::FsStore;
use loro::{ExportMode, LoroDoc};
use std::path::{Path, PathBuf};

pub use bytes::Bytes;
pub use iroh_blobs::Hash;
pub use loro;

/// What can go wrong: the store's own errors, as words.
pub type Result<T> = std::result::Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// The doc ids' tags in the store: `doc/<id>` → the doc's latest snapshot.
const DOC: &str = "doc/";

/// How large a piece of a blob another process sends to the store's owner at a time.
const PIECE: usize = 256 * 1024;

/// The store's one entry point: the tag naming the blob that holds the root doc's id.
const ROOT: &str = "root";

/// A branch's docs (intent 0051): `branch/<name>/<id>` → the doc's latest snapshot on that branch. A doc the branch has
/// not changed is read from main.
const BRANCH: &str = "branch/";

/// The branches that exist: `branches/<name>` → a blob of what the branch is for.
const BRANCHES: &str = "branches/";

/// Whether `name` can be a branch's name: lowercase letters, digits and dashes.
pub fn is_branch(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// The letters of an id: lowercase base 32. An id is 26 of them, the first a letter (so an id is also a name a shader
/// module can have).
const ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";
const ID_LEN: usize = 26;

/// Whether `id` is a doc's id: opaque, flat, 26 letters of the alphabet, the first a-z.
pub fn is_id(id: &str) -> bool {
    id.len() == ID_LEN && id.bytes().all(|b| ALPHABET.contains(&b)) && id.as_bytes()[0].is_ascii_lowercase()
}

/// The tag of doc `id` on `branch` (main with `None`).
fn tag(branch: Option<&str>, id: &str) -> String {
    match branch {
        Some(b) => format!("{BRANCH}{b}/{id}"),
        None => format!("{DOC}{id}"),
    }
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

    /// Opens (or makes) the store in `dir`.
    pub fn open(dir: impl AsRef<Path>) -> Result<Self> {
        let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().map_err(err)?;
        std::fs::create_dir_all(dir.as_ref()).map_err(err)?;
        let dir = dir.as_ref();
        let (port, cert) = (dir.join("rpc.port"), dir.join("rpc.cert"));
        let branch = match std::env::var("THEDB_BRANCH") {
            Ok(b) if b.is_empty() || b == "main" => None,
            Ok(b) if is_branch(&b) => Some(b),
            Ok(b) => return Err(format!("THEDB_BRANCH is not a branch's name (lowercase letters, digits, dashes): {b:?}")),
            Err(_) => None,
        };
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
                    return Ok(TheDB { rt, store, owner: Some(fs), dir: dir.to_path_buf(), branch });
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
                    let answers = rt.block_on(async { tokio::time::timeout(std::time::Duration::from_secs(2), store.tags().get(ROOT)).await.is_ok_and(|r| r.is_ok()) });
                    if answers {
                        return Ok(TheDB { rt, store, owner: None, dir: dir.to_path_buf(), branch });
                    }
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            }
        }
        Err("the store's owner neither answers nor lets it go".into())
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

    // ---- docs ----

    /// The latest snapshot of doc `id` on this process's branch (main's where the branch has not changed it): the hash
    /// that names its current version.
    pub fn head(&self, id: &str) -> Result<Option<Hash>> {
        self.head_seen(self.branch.as_deref(), id)
    }

    /// The latest snapshot of doc `id` as `branch` sees it: the branch's version, or main's where it has none.
    pub fn head_seen(&self, branch: Option<&str>, id: &str) -> Result<Option<Hash>> {
        if let Some(b) = branch
            && let Some(h) = self.head_on(Some(b), id)?
        {
            return Ok(Some(h));
        }
        self.head_on(None, id)
    }

    /// The latest snapshot of doc `id` on `branch` itself (main with `None`), without falling through.
    pub fn head_on(&self, branch: Option<&str>, id: &str) -> Result<Option<Hash>> {
        let tag = tag(branch, id);
        self.rt.block_on(async { self.store.tags().get(tag).await.map(|t| t.map(|t| t.hash)).map_err(err) })
    }

    fn set_head(&self, branch: Option<&str>, id: &str, hash: Hash) -> Result<()> {
        let tag = tag(branch, id);
        self.rt.block_on(async { self.store.tags().set(tag, hash).await.map_err(err) })
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
            None => Ok(LoroDoc::new()),
        }
    }

    /// The doc whose snapshot is `hash`: one exact version, with its history up to it.
    pub fn doc_at(&self, hash: Hash) -> Result<LoroDoc> {
        let bytes = self.get(hash)?.ok_or_else(|| format!("no blob {hash}"))?;
        LoroDoc::from_snapshot(&bytes).map_err(err)
    }

    /// Keeps `doc` as the latest version of `id` on this process's branch; returns the hash that names this version.
    pub fn commit(&self, id: &str, doc: &LoroDoc) -> Result<Hash> {
        let branch = self.branch.clone();
        self.commit_on(branch.as_deref(), id, doc)
    }

    /// Keeps `doc` as the latest version of `id` on `branch` (main with `None`). A doc is a CRDT: what was committed to
    /// it meanwhile (by another process, or on main before the branch first changed it) is merged in, never
    /// overwritten.
    pub fn commit_on(&self, branch: Option<&str>, id: &str, doc: &LoroDoc) -> Result<Hash> {
        check(id)?;
        doc.commit();
        if let Some(head) = self.head_seen(branch, id)?
            && let Some(theirs) = self.get(head)?
        {
            doc.import(&theirs).map_err(err)?;
            json::heal(doc)?;
            doc.commit();
        }
        let snapshot = doc.export(ExportMode::Snapshot).map_err(err)?;
        let hash = self.put(snapshot)?;
        self.set_head(branch, id, hash)?;
        Ok(hash)
    }

    /// Every doc's id and the hash of its current version, as this process's branch sees them.
    pub fn docs(&self) -> Result<Vec<(String, Hash)>> {
        let mut all: std::collections::BTreeMap<String, Hash> = self.list(DOC)?.into_iter().collect();
        if let Some(b) = &self.branch {
            all.extend(self.changed_on(b)?);
        }
        Ok(all.into_iter().collect())
    }

    /// The docs `branch` has changed, and their versions there.
    pub fn changed_on(&self, branch: &str) -> Result<Vec<(String, Hash)>> {
        self.list(&format!("{BRANCH}{branch}/"))
    }

    /// The tags under `prefix`: what follows the prefix, and the hash each names.
    fn list(&self, prefix: &str) -> Result<Vec<(String, Hash)>> {
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

    // ---- branches (intent 0051) ----

    /// A new branch, `name`, from main as it is; `about` says what it is for. A branch that exists stays as it is.
    pub fn make_branch(&self, name: &str, about: &str) -> Result<()> {
        if !is_branch(name) || name == "main" {
            return Err(format!("not a branch's name (lowercase letters, digits, dashes; not main): {name:?}"));
        }
        if self.branches()?.iter().any(|b| b == name) {
            return Ok(());
        }
        let h = self.put(about.as_bytes().to_vec())?;
        self.rt.block_on(async { self.store.tags().set(format!("{BRANCHES}{name}"), h).await.map_err(err) })
    }

    /// Every branch's name.
    pub fn branches(&self) -> Result<Vec<String>> {
        Ok(self.list(BRANCHES)?.into_iter().map(|(n, _)| n).collect())
    }

    /// What `branch` is for.
    pub fn about(&self, branch: &str) -> Result<String> {
        let h = self.rt.block_on(async { self.store.tags().get(format!("{BRANCHES}{branch}")).await.map_err(err) })?;
        let h = h.ok_or_else(|| format!("no branch {branch}"))?.hash;
        Ok(self.get(h)?.map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default())
    }

    /// Doc `id` as `branch`'s version and main's merged, without keeping it: what main would be after the merge.
    pub fn merged(&self, branch: &str, id: &str) -> Result<LoroDoc> {
        let doc = match self.head_on(None, id)? {
            Some(h) => self.doc_at(h)?,
            None => LoroDoc::new(),
        };
        if let Some(h) = self.head_on(Some(branch), id)? {
            doc.import(&self.get(h)?.ok_or_else(|| format!("no blob {h}"))?).map_err(err)?;
        }
        Ok(doc)
    }

    /// Brings the versions `docs` (id → a version on a branch) into main: each merged with what main has. Returns the
    /// new main versions. The branch keeps its own tags; what it changes afterwards can be brought in again.
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
        let doc = LoroDoc::new();
        let meta = doc.get_map("meta");
        meta.insert("kind", kind).map_err(err)?;
        meta.insert("name", name).map_err(err)?;
        self.commit(&id, &doc)?;
        Ok(id)
    }

    /// What doc `id` is and what people call it: (kind, name).
    pub fn meta(&self, id: &str) -> Result<(String, String)> {
        let doc = self.doc(id)?;
        let meta = doc.get_map("meta");
        let field = |k: &str| meta.get(k).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string()).unwrap_or_default();
        Ok((field("kind"), field("name")))
    }

    /// Lets doc `id` go: it is no longer reached. Its versions' blobs stay, so what pinned them still reads them.
    pub fn forget(&self, id: &str) -> Result<()> {
        if let Some(b) = &self.branch {
            return Err(format!("forget on main only (this process is on the branch {b})"));
        }
        self.rt.block_on(async { self.store.tags().delete(format!("{DOC}{id}")).await.map(|_| ()).map_err(err) })
    }

    /// The root doc's id: where everything is reached from.
    pub fn root(&self) -> Result<Option<String>> {
        let Some(h) = self.rt.block_on(async { self.store.tags().get(ROOT).await.map(|t| t.map(|t| t.hash)).map_err(err) })? else {
            return Ok(None);
        };
        Ok(self.get(h)?.map(|b| String::from_utf8_lossy(&b).into_owned()))
    }

    /// Makes doc `id` the root.
    pub fn set_root(&self, id: &str) -> Result<()> {
        check(id)?;
        let h = self.put(id.as_bytes().to_vec())?;
        self.rt.block_on(async { self.store.tags().set(ROOT, h).await.map_err(err) })
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
        let doc = self.doc(id)?;
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
        let doc = self.doc(id)?;
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
        let doc = self.doc(id)?;
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
    /// The source tree its builds are made from (intent 0051).
    #[serde(default)]
    pub tree: Option<String>,
}

impl TheDB {
    /// Keeps a build of engine `id`: the binary as a blob, the manifest of its source (each file named by its doc's
    /// version, `publish_tree`) as a blob, the build as a blob; adds it to the engine's builds and pins it. Returns the
    /// build's hash.
    pub fn publish(&self, id: &str, binary: &[u8], manifest: &[u8], toolchain: &str) -> Result<Hash> {
        let manifest = self.put(manifest.to_vec())?;
        let build = Build { binary: self.put(binary.to_vec())?.to_hex().to_string(), source: manifest.to_hex().to_string(), toolchain: toolchain.into() };
        let hash = self.put(serde_json::to_vec_pretty(&build).map_err(err)?)?;
        let mut engine = self.engine(id)?;
        engine.builds.push(hash.to_hex().to_string());
        engine.pinned = Some(hash.to_hex().to_string());
        self.set_text(id, &serde_json::to_string_pretty(&engine).map_err(err)?)?;
        Ok(hash)
    }

    /// Engine `id`: its builds and the pinned one.
    pub fn engine(&self, id: &str) -> Result<Engine> {
        Ok(self.text(id)?.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default())
    }

    /// Pins build `build` of engine `id`: the kernel starts it from now on.
    pub fn pin(&self, id: &str, build: &str) -> Result<()> {
        let mut engine = self.engine(id)?;
        if !engine.builds.iter().any(|b| b == build) {
            return Err(format!("engine {id} has no build {build}"));
        }
        engine.pinned = Some(build.into());
        self.set_text(id, &serde_json::to_string_pretty(&engine).map_err(err)?).map(|_| ())
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
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n<key>CFBundleName</key><string>theOS</string>\n<key>CFBundleDisplayName</key><string>theOS</string>\n<key>CFBundleExecutable</key><string>theOS</string>\n<key>CFBundleIdentifier</key><string>city.maia.theos</string>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleVersion</key><string>{}</string>\n<key>NSHighResolutionCapable</key><true/>\n</dict></plist>\n",
                &hash.to_hex()[..12]
            );
            std::fs::write(app.join("theOS.app").join("Contents").join("Info.plist"), plist).map_err(err)?;
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

pub mod baker;
pub mod gpu;
pub mod plugin;

#[cfg(feature = "bevy")]
pub mod bevy;

pub mod source;

mod json;

impl Drop for TheDB {
    fn drop(&mut self) {
        // the owner lets the store write what it holds before its runtime goes; a client just goes
        if self.owner.is_some() {
            let _ = self.rt.block_on(self.store.shutdown());
        }
    }
}
