//! Bevy reads avenDB: two asset sources, and nothing from disk.
//!
//! - The default source: an asset path is a doc's id (`shaders/wind.wesl` is doc `shaders/wind.wesl`), read as it is
//!   now, and watched: a commit to the doc reloads it while the app runs.
//! - `blob://<hash>`: exact content, a blob or a doc's version by its hash; never changes, never watched.

use crate::{AvenDb, Hash};
use bevy_asset::io::{
    AssetReader, AssetReaderError, AssetSourceBuilder, AssetSourceEvent, AssetWatcher, PathStream, VecReader,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// How often the watcher looks for new versions of the docs.
const WATCH_EVERY: std::time::Duration = std::time::Duration::from_millis(250);

fn id_of(path: &Path) -> String {
    path.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/")
}

/// Reads docs by id.
pub struct Docs(pub Arc<AvenDb>);

impl AssetReader for Docs {
    async fn read<'a>(&'a self, path: &'a Path) -> Result<VecReader, AssetReaderError> {
        match self.0.file(&id_of(path)) {
            Ok(Some(bytes)) => Ok(VecReader::new(bytes)),
            Ok(None) => Err(AssetReaderError::NotFound(path.to_path_buf())),
            Err(e) => Err(AssetReaderError::Io(Arc::new(std::io::Error::other(e)))),
        }
    }
    async fn read_meta<'a>(&'a self, path: &'a Path) -> Result<VecReader, AssetReaderError> {
        // no meta files: every asset loads with its loader's defaults
        Err(AssetReaderError::NotFound(path.to_path_buf()))
    }
    async fn read_directory<'a>(&'a self, path: &'a Path) -> Result<Box<PathStream>, AssetReaderError> {
        Err(AssetReaderError::NotFound(path.to_path_buf()))
    }
    async fn is_directory<'a>(&'a self, _path: &'a Path) -> Result<bool, AssetReaderError> {
        Ok(false)
    }
}

/// Reads blobs, and docs' versions, by hash.
pub struct Blobs(pub Arc<AvenDb>);

impl AssetReader for Blobs {
    async fn read<'a>(&'a self, path: &'a Path) -> Result<VecReader, AssetReaderError> {
        // the hash, then (for the loader's sake) any extension: `blob://<hash>.wesl`
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let hex = name.split('.').next().unwrap_or_default();
        let Ok(hash) = hex.parse::<Hash>() else { return Err(AssetReaderError::NotFound(path.to_path_buf())) };
        // a doc's version reads as its file; a plain blob as its bytes
        let bytes = match self.0.file_at(hash) {
            Ok(b) => Some(b),
            Err(_) => self.0.get(hash).ok().flatten().map(|b| b.to_vec()),
        };
        bytes.map(VecReader::new).ok_or_else(|| AssetReaderError::NotFound(path.to_path_buf()))
    }
    async fn read_meta<'a>(&'a self, path: &'a Path) -> Result<VecReader, AssetReaderError> {
        Err(AssetReaderError::NotFound(path.to_path_buf()))
    }
    async fn read_directory<'a>(&'a self, path: &'a Path) -> Result<Box<PathStream>, AssetReaderError> {
        Err(AssetReaderError::NotFound(path.to_path_buf()))
    }
    async fn is_directory<'a>(&'a self, _path: &'a Path) -> Result<bool, AssetReaderError> {
        Ok(false)
    }
}

/// Tells Bevy which docs have a new version, so what they hold reloads. Stops when dropped.
pub struct Watch(Arc<AtomicBool>);

impl AssetWatcher for Watch {}

impl Drop for Watch {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Relaxed);
    }
}

fn watch(db: Arc<AvenDb>, tell: async_channel::Sender<AssetSourceEvent>) -> Watch {
    let stop = Arc::new(AtomicBool::new(false));
    let done = stop.clone();
    std::thread::spawn(move || {
        let mut seen: HashMap<String, Hash> = db.docs().unwrap_or_default().into_iter().collect();
        while !done.load(Ordering::Relaxed) {
            std::thread::sleep(WATCH_EVERY);
            let Ok(now) = db.docs() else { continue };
            for (id, hash) in now {
                let event = match seen.get(&id) {
                    None => AssetSourceEvent::AddedAsset(PathBuf::from(&id)),
                    Some(h) if *h != hash => AssetSourceEvent::ModifiedAsset(PathBuf::from(&id)),
                    _ => continue,
                };
                seen.insert(id, hash);
                if tell.send_blocking(event).is_err() {
                    return;
                }
            }
        }
    });
    Watch(stop)
}

/// The default source: docs by id, watched.
pub fn docs_source(db: Arc<AvenDb>) -> AssetSourceBuilder {
    let (r, w) = (db.clone(), db);
    AssetSourceBuilder::new(move || Box::new(Docs(r.clone())))
        .with_watcher(move |tell| Some(Box::new(watch(w.clone(), tell))))
}

/// `blob://`: blobs and docs' versions by hash.
pub fn blobs_source(db: Arc<AvenDb>) -> AssetSourceBuilder {
    AssetSourceBuilder::new(move || Box::new(Blobs(db.clone())))
}
