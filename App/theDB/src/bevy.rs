//! Bevy reads theDB: two asset sources, and nothing from disk.
//!
//! - The default source: an asset path is a doc's id and the kind of file it holds, for Bevy's loaders
//!   (`<id>.wesl`, `<id>.ttf`): the doc read as it is now, and watched, so a commit to it reloads it while the app runs.
//! - `blob://<hash>`: exact content, a blob or a doc's version by its hash; never changes, never watched.

use crate::{TheDB, Hash};
use bevy_asset::io::{
    AssetReader, AssetReaderError, AssetSourceBuilder, AssetSourceEvent, AssetWatcher, PathStream, VecReader,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// How often the watcher looks for new versions of the docs.
const WATCH_EVERY: std::time::Duration = std::time::Duration::from_millis(250);

/// The doc id in an asset path: its file name up to the first dot.
fn id_of(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().split('.').next().unwrap_or_default().to_string()).unwrap_or_default()
}

/// The paths each doc was loaded by, so the watcher tells Bevy about the same ones.
type Loaded = Arc<std::sync::Mutex<HashMap<String, Vec<PathBuf>>>>;

/// Reads docs by id.
pub struct Docs(pub Arc<TheDB>, Loaded);

impl AssetReader for Docs {
    async fn read<'a>(&'a self, path: &'a Path) -> Result<VecReader, AssetReaderError> {
        let id = id_of(path);
        if !crate::is_id(&id) {
            return Err(AssetReaderError::NotFound(path.to_path_buf()));
        }
        if let Ok(mut l) = self.1.lock() {
            let paths = l.entry(id.clone()).or_default();
            if !paths.iter().any(|p| p == path) {
                paths.push(path.to_path_buf());
            }
        }
        match self.0.file(&id) {
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
pub struct Blobs(pub Arc<TheDB>);

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

fn watch(db: Arc<TheDB>, loaded: Loaded, tell: async_channel::Sender<AssetSourceEvent>) -> Watch {
    let stop = Arc::new(AtomicBool::new(false));
    let done = stop.clone();
    std::thread::spawn(move || {
        let mut seen: HashMap<String, Hash> = db.docs().unwrap_or_default().into_iter().collect();
        while !done.load(Ordering::Relaxed) {
            std::thread::sleep(WATCH_EVERY);
            let Ok(now) = db.docs() else { continue };
            for (id, hash) in now {
                let changed = seen.get(&id).is_some_and(|h| *h != hash);
                seen.insert(id.clone(), hash);
                if !changed {
                    continue;
                }
                let paths = loaded.lock().map(|l| l.get(&id).cloned().unwrap_or_default()).unwrap_or_default();
                for p in paths {
                    if tell.send_blocking(AssetSourceEvent::ModifiedAsset(p)).is_err() {
                        return;
                    }
                }
            }
        }
    });
    Watch(stop)
}

/// The default source: docs by id, watched.
pub fn docs_source(db: Arc<TheDB>) -> AssetSourceBuilder {
    let loaded: Loaded = Default::default();
    let (r, w, lr, lw) = (db.clone(), db, loaded.clone(), loaded);
    AssetSourceBuilder::new(move || Box::new(Docs(r.clone(), lr.clone())))
        .with_watcher(move |tell| Some(Box::new(watch(w.clone(), lw.clone(), tell))))
}

/// `blob://`: blobs and docs' versions by hash.
pub fn blobs_source(db: Arc<TheDB>) -> AssetSourceBuilder {
    AssetSourceBuilder::new(move || Box::new(Blobs(db.clone())))
}
