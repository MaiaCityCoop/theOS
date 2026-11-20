//! Plugins of the kernel (intent 0050): what runs beside the engine when a doc changes. A plugin has a name, the doc
//! kinds it watches and a handler; the kernel watches every doc's head and calls each plugin watching a doc's kind
//! when its head moves, once per new head. The kernel knows nothing of what a plugin does.
//!
//! The store has no change subscription to follow (iroh-blobs' tags are listed, not observed, and Loro's events are
//! a doc's own, in one process), and a commit from any process lands as a new tag, so the watcher lists the heads
//! every `POLL`, on main only (`doc/<id>`; a branch's tags are its own until merged). It keeps the heads each plugin has handled in a doc of its own, named by the root as `kernel`, so a
//! kernel started again calls nothing for what it already handled.

use crate::{AvenDb, Result};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// How often the watcher lists the docs' heads. A listing is one read of the store's tags; a second is as quick as a
/// change needs to be seen, and far shorter than what a plugin does with it.
pub const POLL: std::time::Duration = std::time::Duration::from_secs(1);

/// A plugin of the kernel.
pub trait Plugin: Send + Sync {
    /// Its name: the key of its handled heads, and what its log lines say.
    fn name(&self) -> &str;
    /// The doc kinds (`meta`'s kind) it watches.
    fn kinds(&self) -> &[&str];
    /// Called with doc `id` of a watched kind whose head moved. It returns when it has handled it; what it returns is
    /// logged, and the head counts as handled either way (a failed doc is tried again on its next change or by hand).
    fn changed(&self, db: &AvenDb, id: &str) -> Result<()>;
}

/// Each plugin's handled heads: plugin → doc id → the head (hex) it was called for.
type Handled = BTreeMap<String, BTreeMap<String, String>>;

/// The watcher: the plugins, what they handled, and the heads already looked at in this run.
pub struct Watcher {
    plugins: Vec<Box<dyn Plugin>>,
    handled: Handled,
    /// The kernel's own doc, where `handled` is kept.
    doc: String,
    /// Each doc's head as last looked at, so an unchanged doc costs nothing beyond the listing.
    seen: HashMap<String, crate::Hash>,
}

impl Watcher {
    /// The watcher of `plugins`, with what they handled before (kept in the kernel's doc, made on first use).
    /// It watches main only: a branch's edits (and a merge's trial branch) call nothing until they are merged, so a
    /// process put on a branch runs no watcher.
    pub fn new(db: &AvenDb, plugins: Vec<Box<dyn Plugin>>) -> Result<Self> {
        if let Some(b) = db.branch() {
            return Err(format!("the plugins watch main, and this process is on branch {b}"));
        }
        let doc = kernel_doc(db)?;
        let handled = db.text(&doc)?.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        Ok(Watcher { plugins, handled, doc, seen: HashMap::new() })
    }

    /// One look at every doc's head: calls each plugin watching the kind of a doc whose head it has not handled.
    /// Returns the calls made, as (plugin, doc id).
    pub fn pass(&mut self, db: &AvenDb) -> Result<Vec<(String, String)>> {
        let mut calls = Vec::new();
        for (id, head) in db.docs()? {
            if id == self.doc || self.seen.get(&id) == Some(&head) {
                continue;
            }
            let hex = head.to_hex().to_string();
            let due: Vec<usize> = (0..self.plugins.len())
                .filter(|&p| self.handled.get(self.plugins[p].name()).and_then(|h| h.get(&id)) != Some(&hex))
                .collect();
            if !due.is_empty() {
                let kind = db.meta(&id)?.0;
                for p in due.into_iter().filter(|&p| self.plugins[p].kinds().contains(&kind.as_str())) {
                    let plugin = &self.plugins[p];
                    if let Err(e) = plugin.changed(db, &id) {
                        eprintln!("kernel: plugin {}: {id}: {e}", plugin.name());
                    }
                    self.handled.entry(plugin.name().to_string()).or_default().insert(id.clone(), hex.clone());
                    db.set_text(&self.doc, &serde_json::to_string_pretty(&self.handled).map_err(|e| e.to_string())?)?;
                    calls.push((plugin.name().to_string(), id.clone()));
                }
            }
            self.seen.insert(id, head);
        }
        Ok(calls)
    }

    /// Watches until `stop` is set, in a thread of its own: a pass every `POLL`. A plugin's call in progress ends before
    /// the thread does.
    pub fn watch(mut self, db: Arc<AvenDb>, stop: Arc<AtomicBool>) -> std::thread::JoinHandle<()> {
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                if let Err(e) = self.pass(&db) {
                    eprintln!("kernel: watching the docs: {e}");
                }
                std::thread::sleep(POLL);
            }
        })
    }
}

/// The kernel's own doc, named by the root as `kernel`; made, and named in the root, the first time.
fn kernel_doc(db: &AvenDb) -> Result<String> {
    let root = db.root()?.ok_or("avenDB has no root")?;
    let text = db.text(&root)?.unwrap_or_default();
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if let Some(id) = value["kernel"].as_str() {
        return Ok(id.to_string());
    }
    let id = db.new("kernel", "the plugins' handled heads")?;
    // the root's text is edited where it ends, not written again, so its keys keep their order and its history
    // shows one line added
    let end = text.rfind('}').ok_or("the root is no JSON object")?;
    let before = text[..end].trim_end();
    let comma = if before.ends_with('{') { "" } else { "," };
    let edited = format!("{before}{comma}\n  \"kernel\": \"{id}\"\n{}", &text[end..]);
    let check: serde_json::Value = serde_json::from_str(&edited).map_err(|e| e.to_string())?;
    if check["kernel"].as_str() != Some(&id) {
        return Err("naming the kernel's doc in the root failed".into());
    }
    db.set_text(&root, &edited)?;
    Ok(id)
}
