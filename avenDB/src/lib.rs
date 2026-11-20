//! avenDB: where everything we make is kept, as **docs** and **blobs** (intent 0049).
//!
//! - A **blob** is immutable bytes named by their BLAKE3 hash (as IPFS): an image, a font, a bake, an engine build.
//! - A **doc** is a Loro document with its whole history, named by an id (as IPNS): one shader, one asset, one recipe,
//!   one shot list, one interface view, one engine. It is stored as blobs too: each commit writes the doc's snapshot as a
//!   blob, and the doc's id points to its latest one. Every commit's snapshot is kept, so each version of a doc is also
//!   named by a hash, and a world that names its docs by those hashes is made again exactly.
//!
//! One store on this device, on disk (iroh-blobs' file store); no sync between devices. Its files can be open in one
//! process only, so the first process to open it owns it and serves it to the others on this machine (iroh-blobs'
//! RPC over QUIC on 127.0.0.1, trusting only the owner's own certificate): the app and `avendb` in a shell work on the
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

/// A doc's id is one flat name, as `ground.wesl`, `clover.asset` or `mertola.place`: no folders.
fn flat(id: &str) -> Result<()> {
    if id.is_empty() || id.contains(['/', '\\']) {
        return Err(format!("a doc's id is one flat name, not a path: {id:?}"));
    }
    Ok(())
}

/// The store.
pub struct AvenDb {
    rt: tokio::runtime::Runtime,
    store: Store,
    /// Set in the process that owns the store's files (and serves them to the others).
    owner: Option<FsStore>,
}

impl AvenDb {
    /// The store of this machine: `~/avenDB`, one for every checkout, session and tool on it (`AVENDB` names
    /// another).
    pub fn here() -> PathBuf {
        if let Ok(d) = std::env::var("AVENDB") {
            return d.into();
        }
        Path::new(&std::env::var("HOME").unwrap_or_else(|_| ".".into())).join("avenDB")
    }

    /// Opens (or makes) the store in `dir`.
    pub fn open(dir: impl AsRef<Path>) -> Result<Self> {
        let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().map_err(err)?;
        std::fs::create_dir_all(dir.as_ref()).map_err(err)?;
        let dir = dir.as_ref();
        let (port, cert) = (dir.join("rpc.port"), dir.join("rpc.cert"));
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
                Ok(AvenDb { rt, store, owner: Some(fs) })
            }
            Err(e) => {
                // another process owns it: talk to that one
                let (Ok(p), Ok(der)) = (std::fs::read_to_string(&port), std::fs::read(&cert)) else {
                    return Err(format!("the store is held by another process that does not serve it: {e}"));
                };
                let addr: std::net::SocketAddr = format!("127.0.0.1:{}", p.trim()).parse().map_err(err)?;
                let _guard = rt.enter();
                let endpoint = irpc::util::make_client_endpoint("127.0.0.1:0".parse().unwrap(), &[&der]).map_err(err)?;
                Ok(AvenDb { rt, store: Store::connect(endpoint, addr), owner: None })
            }
        }
    }

    /// Whether this process owns the store's files (the others reach it through this one).
    pub fn owns(&self) -> bool {
        self.owner.is_some()
    }

    // ---- blobs ----

    /// Keeps `bytes`; returns their hash. The same bytes give the same hash, kept once.
    pub fn put(&self, bytes: impl Into<Bytes>) -> Result<Hash> {
        let bytes = bytes.into();
        self.rt.block_on(async { self.store.blobs().add_bytes(bytes).await.map(|t| t.hash).map_err(err) })
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

    /// The latest snapshot of doc `id`: the hash that names its current version.
    pub fn head(&self, id: &str) -> Result<Option<Hash>> {
        self.rt.block_on(async { self.store.tags().get(format!("{DOC}{id}")).await.map(|t| t.map(|t| t.hash)).map_err(err) })
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

    /// Keeps `doc` as the latest version of `id`; returns the hash that names this version.
    pub fn commit(&self, id: &str, doc: &LoroDoc) -> Result<Hash> {
        flat(id)?;
        doc.commit();
        let snapshot = doc.export(ExportMode::Snapshot).map_err(err)?;
        let hash = self.put(snapshot)?;
        self.rt.block_on(async { self.store.tags().set(format!("{DOC}{id}"), hash).await.map_err(err) })?;
        Ok(hash)
    }

    /// Every doc's id, and the hash of its current version.
    pub fn docs(&self) -> Result<Vec<(String, Hash)>> {
        use n0_future::StreamExt;
        self.rt.block_on(async {
            let mut list = self.store.tags().list_prefix(DOC).await.map_err(err)?;
            let mut out = Vec::new();
            while let Some(t) = list.next().await {
                let t = t.map_err(err)?;
                out.push((String::from_utf8_lossy(&t.name.0[DOC.len()..]).into_owned(), t.hash));
            }
            Ok(out)
        })
    }

    // ---- text docs: a shader, a recipe, a shot list ----

    /// The text of doc `id` (its root text `text`), if it exists.
    pub fn text(&self, id: &str) -> Result<Option<String>> {
        Ok(match self.head(id)? {
            Some(h) => Some(self.doc_at(h)?.get_text("text").to_string()),
            None => None,
        })
    }

    /// Sets the text of doc `id`, as an edit of what it was (so its history shows what changed); a text that is
    /// already there commits nothing. Returns the hash of the version that holds it.
    pub fn set_text(&self, id: &str, text: &str) -> Result<Hash> {
        let doc = self.doc(id)?;
        let t = doc.get_text("text");
        if let Some(h) = self.head(id)?
            && t.to_string() == text
        {
            return Ok(h);
        }
        t.update(text, Default::default()).map_err(err)?;
        self.commit(id, &doc)
    }
}

// ---- files: what the engine loads by path (a shader, a font, a recipe) ----

impl AvenDb {
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
        Ok(doc.get_text("text").to_string().into_bytes())
    }
}

// ---- parts: a doc that holds several files, each a blob by name (a place's height, cover, map layers) ----

impl AvenDb {
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

#[cfg(feature = "bevy")]
pub mod bevy;

impl Drop for AvenDb {
    fn drop(&mut self) {
        // the owner lets the store write what it holds before its runtime goes; a client just goes
        if self.owner.is_some() {
            let _ = self.rt.block_on(self.store.shutdown());
        }
    }
}
