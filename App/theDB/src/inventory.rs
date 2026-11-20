//! The store read as a whole, for theDB's view in theOS (and anything else that inspects it): every doc a branch sees,
//! what each names, each doc's versions, and the facts of every blob. Nothing here writes, and everything goes through
//! theDB's public calls (`docs`, `head_on`, `changed_on`, `branches`, `doc_at`, `get`), so it reads the same whatever
//! keeps the docs underneath.
//!
//! - **A doc's versions** are read from the doc's own Loro history: every change in it is one version (each commit of
//!   theDB is made by a fresh editing session, so its ops are one change), ordered by Lamport time; the doc as it was
//!   after a change is the doc forked at that change. A version's **time** is the timestamp Loro recorded in the
//!   change; Loro records one only where a doc asks it to, so it is 0 (unknown) for every version kept so far.
//! - **What a doc names**: every blob hash (64 hex letters) and doc id (26 letters of the id alphabet) anywhere in its
//!   content (its map or text, its file's blob, its parts), with the place it stands at (`builds[3]`, `parts.height`):
//!   that place is the name the doc gives it.
//! - **A blob's facts** have no doc of their own. What it is follows from its bytes (its size; its media type from its
//!   first bytes; an image's size from its header) and is computed once per hash and kept in memory; what it is called
//!   comes from the docs that name it.

use crate::{Hash, Result, TheDB};
use loro::{Frontiers, ID, LoroDoc, ToJson};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::{Mutex, OnceLock};

// ---- docs: their content, what they name, their versions ----

/// The doc's content as theDB reads it: a doc kept as a map (`json`) written out as JSON, else its text.
pub fn content(doc: &LoroDoc) -> String {
    if doc.get_map("file").get("json").is_some() {
        let mut s = serde_json::to_string_pretty(&doc.get_map("json").get_deep_value().to_json_value()).unwrap_or_default();
        s.push('\n');
        return s;
    }
    doc.get_text("text").to_string()
}

/// What a doc says it is and what it is called: (kind, name).
pub fn meta(doc: &LoroDoc) -> (String, String) {
    let m = doc.get_map("meta");
    let field = |k: &str| m.get(k).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string()).unwrap_or_default();
    (field("kind"), field("name"))
}

/// The blob hashes and doc ids a doc names, each with the place in it where it stands.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Names {
    pub blobs: Vec<(Hash, String)>,
    pub docs: Vec<(String, String)>,
}

/// Everything `doc` names, in all its content.
pub fn names(doc: &LoroDoc) -> Names {
    let mut n = Names::default();
    walk(&doc.get_deep_value().to_json_value(), "", &mut n);
    n
}

/// The names in a JSON value (a blob's text that is JSON, a doc's whole content).
pub fn names_in_json(v: &Value) -> Names {
    let mut n = Names::default();
    walk(v, "", &mut n);
    n
}

fn walk(v: &Value, at: &str, n: &mut Names) {
    let join = |k: &str| if at.is_empty() { k.to_string() } else { format!("{at}.{k}") };
    match v {
        Value::Object(o) => o.iter().for_each(|(k, v)| walk(v, &join(k), n)),
        Value::Array(a) => a.iter().enumerate().for_each(|(i, v)| walk(v, &format!("{at}[{i}]"), n)),
        Value::String(s) => names_in_text(s, at, n),
        _ => {}
    }
}

/// The names in one string: a blob when the string is a hash and nothing else (a hash inside a text, as a lock file's
/// checksums, names no blob), and every doc id standing as a word (a shader imports another by its id).
fn names_in_text(text: &str, at: &str, n: &mut Names) {
    let whole = text.trim();
    if whole.len() == 64
        && whole.bytes().all(|b| b.is_ascii_hexdigit())
        && let Ok(h) = whole.to_ascii_lowercase().parse::<Hash>()
    {
        n.blobs.push((h, at.to_string()));
        return;
    }
    for word in text.split(|c: char| !c.is_ascii_alphanumeric()) {
        if crate::is_id(word) {
            n.docs.push((word.to_string(), at.to_string()));
        }
    }
}

/// One version of a doc: the change that made it, and when (0: not recorded).
#[derive(Clone, Debug, PartialEq)]
pub struct Version {
    pub peer: u64,
    /// The change's first op's counter, and how many ops it holds.
    pub counter: i32,
    pub ops: usize,
    pub lamport: u32,
    pub time: i64,
}

impl Version {
    /// A short name for the version: its editing session and its last op (`3fa9c1·17`).
    pub fn label(&self) -> String {
        format!("{:06x}·{}", self.peer & 0xff_ffff, self.counter + self.ops as i32 - 1)
    }

    /// The doc as it was right after this version.
    pub fn frontiers(&self) -> Frontiers {
        Frontiers::from_id(ID::new(self.peer, self.counter + self.ops as i32 - 1))
    }
}

/// Every version in the doc's history, oldest first.
pub fn versions(doc: &LoroDoc) -> Vec<Version> {
    let mut out = Vec::new();
    for (peer, end) in doc.oplog_vv().iter() {
        let mut at = 0;
        while at < *end {
            let Some(c) = doc.get_change(ID::new(*peer, at)) else { break };
            out.push(Version { peer: *peer, counter: c.id.counter, ops: c.len, lamport: c.lamport, time: c.timestamp });
            at = c.id.counter + c.len.max(1) as i32;
        }
    }
    out.sort_by_key(|v| (v.lamport, v.peer));
    out
}

/// The doc's content as it was right after `version`.
pub fn content_at(doc: &LoroDoc, version: &Version) -> Result<String> {
    Ok(content(&doc.fork_at(&version.frontiers()).map_err(|e| e.to_string())?))
}

// ---- blobs: what they are, from their bytes ----

/// What a blob is, from its bytes alone.
#[derive(Clone, Debug, PartialEq)]
pub struct Facts {
    pub size: u64,
    /// Its media type, sniffed from its first bytes.
    pub media: &'static str,
    /// An image's width and height, from its header.
    pub dims: Option<(u32, u32)>,
}

/// The media type of `bytes`, from their first bytes: images, PDF, WASM, fonts, compressed data, executables, a doc's
/// version (a Loro snapshot), then JSON and text by whether they read as UTF-8.
pub fn media_type(b: &[u8]) -> &'static str {
    let starts = |m: &[u8]| b.starts_with(m);
    if starts(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if starts(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if starts(b"GIF8") {
        "image/gif"
    } else if starts(b"II*\0") || starts(b"MM\0*") || starts(b"II+\0") || starts(b"MM\0+") {
        "image/tiff"
    } else if b.len() >= 12 && starts(b"RIFF") && &b[8..12] == b"WEBP" {
        "image/webp"
    } else if starts(b"%PDF-") {
        "application/pdf"
    } else if starts(b"\0asm") {
        "application/wasm"
    } else if starts(b"wOFF") {
        "font/woff"
    } else if starts(b"wOF2") {
        "font/woff2"
    } else if starts(b"\0\x01\0\0") || starts(b"true") {
        "font/ttf"
    } else if starts(b"OTTO") {
        "font/otf"
    } else if starts(b"\x1f\x8b") {
        "application/gzip"
    } else if starts(b"\x28\xb5\x2f\xfd") {
        "application/zstd"
    } else if starts(b"\xcf\xfa\xed\xfe") || starts(b"\xca\xfe\xba\xbe") {
        "application/x-mach-binary"
    } else if starts(b"loro") && b.len() >= 22 && b[20..22] == [0, 3] {
        "application/x-loro-snapshot"
    } else if let Some(text) = as_text(b) {
        if serde_json::from_str::<Value>(text).is_ok() { "application/json" } else { "text/plain" }
    } else {
        "application/octet-stream"
    }
}

/// The bytes as text, if they are UTF-8 without control characters but line breaks and tabs (as theDB tells a file's
/// text from its bytes).
pub fn as_text(b: &[u8]) -> Option<&str> {
    let t = std::str::from_utf8(b).ok()?;
    (!t.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))).then_some(t)
}

/// An image's width and height, from its header.
pub fn dimensions(b: &[u8], media: &str) -> Option<(u32, u32)> {
    let be32 = |at: usize| b.get(at..at + 4).map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]]));
    match media {
        "image/png" => Some((be32(16)?, be32(20)?)),
        "image/gif" => Some((u16::from_le_bytes([*b.get(6)?, *b.get(7)?]) as u32, u16::from_le_bytes([*b.get(8)?, *b.get(9)?]) as u32)),
        "image/jpeg" => {
            // the first start-of-frame marker holds the height, then the width
            let mut at = 2;
            while at + 9 < b.len() {
                if b[at] != 0xff {
                    return None;
                }
                let m = b[at + 1];
                let len = u16::from_be_bytes([b[at + 2], b[at + 3]]) as usize;
                if (0xc0..=0xcf).contains(&m) && !matches!(m, 0xc4 | 0xc8 | 0xcc) {
                    let h = u16::from_be_bytes([b[at + 5], b[at + 6]]) as u32;
                    let w = u16::from_be_bytes([b[at + 7], b[at + 8]]) as u32;
                    return Some((w, h));
                }
                at += 2 + len;
            }
            None
        }
        "image/tiff" => tiff_dims(b),
        _ => None,
    }
}

/// A classic TIFF's first image: its tags ImageWidth (256) and ImageLength (257).
fn tiff_dims(b: &[u8]) -> Option<(u32, u32)> {
    let le = b.starts_with(b"II");
    let u16_at = |at: usize| b.get(at..at + 2).map(|s| if le { u16::from_le_bytes([s[0], s[1]]) } else { u16::from_be_bytes([s[0], s[1]]) });
    let u32_at = |at: usize| b.get(at..at + 4).map(|s| if le { u32::from_le_bytes([s[0], s[1], s[2], s[3]]) } else { u32::from_be_bytes([s[0], s[1], s[2], s[3]]) });
    if u16_at(2)? != 42 {
        return None;
    }
    let ifd = u32_at(4)? as usize;
    let (mut w, mut h) = (None, None);
    for i in 0..u16_at(ifd)? as usize {
        let e = ifd + 2 + i * 12;
        let value = match u16_at(e + 2)? {
            3 => u16_at(e + 8)? as u32,
            _ => u32_at(e + 8)?,
        };
        match u16_at(e)? {
            256 => w = Some(value),
            257 => h = Some(value),
            _ => {}
        }
    }
    Some((w?, h?))
}

/// The facts of `bytes`.
pub fn facts_of(bytes: &[u8]) -> Facts {
    let media = media_type(bytes);
    Facts { size: bytes.len() as u64, media, dims: dimensions(bytes, media) }
}

/// The facts of every blob read so far, by hash, for as long as the process runs.
fn cache() -> &'static Mutex<HashMap<Hash, Option<Facts>>> {
    static C: OnceLock<Mutex<HashMap<Hash, Option<Facts>>>> = OnceLock::new();
    C.get_or_init(Default::default)
}

/// A blob's facts, read once and kept (`None`: the store lacks it); with the names its text gives, if it is JSON
/// (a build names its binary and its source by hash), on the first read only.
pub fn blob_facts(db: &TheDB, hash: Hash) -> Result<(Option<Facts>, Names)> {
    if let Some(f) = cache().lock().map_err(|e| e.to_string())?.get(&hash) {
        return Ok((f.clone(), Names::default()));
    }
    let bytes = db.get(hash)?;
    let facts = bytes.as_deref().map(facts_of);
    let names = match (&facts, bytes.as_deref()) {
        (Some(f), Some(b)) if f.media == "application/json" => serde_json::from_slice(b).map(|v| names_in_json(&v)).unwrap_or_default(),
        _ => Names::default(),
    };
    cache().lock().map_err(|e| e.to_string())?.insert(hash, facts.clone());
    Ok((facts, names))
}

// ---- the whole store, as a branch sees it ----

/// A doc as the branch seen shows it.
#[derive(Clone, Debug)]
pub struct DocRow {
    pub id: String,
    pub kind: String,
    pub name: String,
    /// Its head on the branch seen, and main's.
    pub head: Hash,
    pub main: Option<Hash>,
    /// The branches that have a head of their own for it.
    pub own: Vec<String>,
    pub versions: usize,
    /// Its latest version's time (0: not recorded).
    pub last: i64,
    /// The size of its content (the text, or the map written out).
    pub size: usize,
    pub names: Names,
    /// The docs that name it, on the branch seen.
    pub named_by: Vec<String>,
}

/// A blob some head names.
#[derive(Clone, Debug)]
pub struct BlobRow {
    pub hash: Hash,
    /// Who names it on the branch seen, and the name each gives it: (doc id, place in the doc).
    pub named_by: Vec<(String, String)>,
    /// The branches whose own heads name it (where the branch seen does not).
    pub elsewhere: Vec<String>,
}

impl BlobRow {
    /// Whether no doc on the branch seen names it.
    pub fn unreferenced(&self) -> bool {
        self.named_by.is_empty()
    }
}

/// Everything the branch `seen` (main with `None`) has: its docs, and the blobs any branch's heads name.
#[derive(Clone, Debug, Default)]
pub struct Inventory {
    pub seen: Option<String>,
    pub branches: Vec<String>,
    pub docs: Vec<DocRow>,
    pub blobs: Vec<BlobRow>,
}

impl Inventory {
    /// Reads it: opens each head once (the branch seen's, and the other branches' own, for the blobs they name).
    pub fn read(db: &TheDB, seen: Option<&str>) -> Result<Inventory> {
        let branches = db.branches()?;
        let mut own: BTreeMap<String, Vec<(String, Hash)>> = BTreeMap::new();
        for b in &branches {
            for (id, h) in db.changed_on(b)? {
                own.entry(id).or_default().push((b.clone(), h));
            }
        }
        let mut ids: BTreeSet<String> = db.docs()?.into_iter().map(|(id, _)| id).collect();
        ids.extend(own.keys().cloned());
        let mut docs = Vec::new();
        for id in ids {
            let main = db.head_on(None, &id)?;
            let mine = seen.and_then(|b| own.get(&id).and_then(|o| o.iter().find(|(x, _)| x == b)).map(|(_, h)| *h));
            let Some(head) = mine.or(main) else { continue };
            let doc = db.doc_at(head)?;
            let (kind, name) = meta(&doc);
            let v = versions(&doc);
            docs.push(DocRow {
                kind,
                name,
                head,
                main,
                own: own.get(&id).map(|o| o.iter().map(|(b, _)| b.clone()).collect()).unwrap_or_default(),
                versions: v.len(),
                last: v.iter().map(|v| v.time).max().unwrap_or(0),
                size: content(&doc).len(),
                names: names(&doc),
                named_by: Vec::new(),
                id,
            });
        }
        // who names whom, on the branch seen
        let known: HashMap<String, usize> = docs.iter().enumerate().map(|(i, d)| (d.id.clone(), i)).collect();
        let mut by: Vec<BTreeSet<String>> = vec![BTreeSet::new(); docs.len()];
        let mut blobs: BTreeMap<Hash, BlobRow> = BTreeMap::new();
        for d in &docs {
            for (id, _) in &d.names.docs {
                if let Some(i) = known.get(id)
                    && *id != d.id
                {
                    by[*i].insert(d.id.clone());
                }
            }
            for (h, at) in &d.names.blobs {
                let row = blobs.entry(*h).or_insert_with(|| BlobRow { hash: *h, named_by: Vec::new(), elsewhere: Vec::new() });
                if !row.named_by.iter().any(|(x, a)| *x == d.id && a == at) {
                    row.named_by.push((d.id.clone(), at.clone()));
                }
            }
        }
        for (d, b) in docs.iter_mut().zip(by) {
            d.named_by = b.into_iter().collect();
        }
        // the blobs other branches' own heads name
        for heads in own.values() {
            for (b, h) in heads {
                if Some(b.as_str()) == seen {
                    continue;
                }
                let Ok(doc) = db.doc_at(*h) else { continue };
                for (hash, _) in names(&doc).blobs {
                    let row = blobs.entry(hash).or_insert_with(|| BlobRow { hash, named_by: Vec::new(), elsewhere: Vec::new() });
                    if row.named_by.is_empty() && !row.elsewhere.contains(b) {
                        row.elsewhere.push(b.clone());
                    }
                }
            }
        }
        // a doc's head is no blob a doc names: the heads themselves are the docs
        let heads: BTreeSet<Hash> = docs.iter().map(|d| d.head).collect();
        let blobs = blobs.into_values().filter(|b| !heads.contains(&b.hash)).collect();
        Ok(Inventory { seen: seen.map(str::to_string), branches, docs, blobs })
    }
}

/// A line diff of `old` against `new`: each line kept (' '), taken away ('-') or added ('+'), by their longest
/// common run of lines. Texts too long to compare line by line (over `limit` lines) give `None`.
pub fn diff(old: &str, new: &str, limit: usize) -> Option<Vec<(char, String)>> {
    let (a, b): (Vec<&str>, Vec<&str>) = (old.lines().collect(), new.lines().collect());
    if a.len() > limit || b.len() > limit {
        return None;
    }
    // what both ends share stays out of the table
    let head = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let tail = a[head..].iter().rev().zip(b[head..].iter().rev()).take_while(|(x, y)| x == y).count();
    let (am, bm) = (&a[head..a.len() - tail], &b[head..b.len() - tail]);
    let (n, m) = (am.len(), bm.len());
    let mut l = vec![0u32; (n + 1) * (m + 1)];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            l[i * (m + 1) + j] = if am[i] == bm[j] { l[(i + 1) * (m + 1) + j + 1] + 1 } else { l[(i + 1) * (m + 1) + j].max(l[i * (m + 1) + j + 1]) };
        }
    }
    let mut out: Vec<(char, String)> = a[..head].iter().map(|s| (' ', s.to_string())).collect();
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && am[i] == bm[j] {
            out.push((' ', am[i].to_string()));
            i += 1;
            j += 1;
        } else if j < m && (i == n || l[i * (m + 1) + j + 1] >= l[(i + 1) * (m + 1) + j]) {
            out.push(('+', bm[j].to_string()));
            j += 1;
        } else {
            out.push(('-', am[i].to_string()));
            i += 1;
        }
    }
    out.extend(a[a.len() - tail..].iter().map(|s| (' ', s.to_string())));
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_commit_is_a_version_and_reads_back() {
        let doc = LoroDoc::new();
        doc.get_text("text").insert(0, "one").unwrap();
        doc.commit();
        // the next commit comes from a new editing session, as each of theDB's commits does
        let doc = LoroDoc::from_snapshot(&doc.export(loro::ExportMode::Snapshot).unwrap()).unwrap();
        doc.get_text("text").insert(3, " two").unwrap();
        doc.commit();
        let v = versions(&doc);
        assert_eq!(v.len(), 2);
        assert_eq!(content_at(&doc, &v[0]).unwrap(), "one");
        assert_eq!(content_at(&doc, &v[1]).unwrap(), "one two");
        assert_eq!(v[0].time, 0, "Loro records no time unless asked");
    }

    #[test]
    fn names_are_found_with_their_place() {
        let hash = Hash::new(b"a blob");
        let doc = LoroDoc::new();
        let m = doc.get_map("json");
        m.insert("pinned", hash.to_hex().to_string()).unwrap();
        m.insert("world", "njhcv752sebjyv6un63l72v6q3").unwrap();
        m.insert("word", "abcdefghijklmnopqrstuvwxy").unwrap();
        doc.commit();
        let n = names(&doc);
        assert_eq!(n.blobs, vec![(hash, "json.pinned".to_string())]);
        assert_eq!(n.docs, vec![("njhcv752sebjyv6un63l72v6q3".to_string(), "json.world".to_string())]);
        // a hash inside a text is no name
        let text = LoroDoc::new();
        text.get_text("text").insert(0, &format!("checksum = \"{}\"\n", hash.to_hex())).unwrap();
        text.commit();
        assert!(names(&text).blobs.is_empty());
    }

    #[test]
    fn blobs_are_known_by_their_first_bytes() {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend(640u32.to_be_bytes());
        png.extend(480u32.to_be_bytes());
        assert_eq!(facts_of(&png), Facts { size: png.len() as u64, media: "image/png", dims: Some((640, 480)) });
        let mut tiff = b"II*\0\x08\0\0\0".to_vec();
        tiff.extend(2u16.to_le_bytes());
        for (tag, v) in [(256u16, 300u32), (257, 200)] {
            tiff.extend(tag.to_le_bytes());
            tiff.extend(4u16.to_le_bytes());
            tiff.extend(1u32.to_le_bytes());
            tiff.extend(v.to_le_bytes());
        }
        assert_eq!(facts_of(&tiff).dims, Some((300, 200)));
        assert_eq!(media_type(b"\0asm\x01\0\0\0"), "application/wasm");
        assert_eq!(media_type(b"{\"a\": 1}"), "application/json");
        assert_eq!(media_type(b"fn main() {}\n"), "text/plain");
        assert_eq!(media_type(&[0u8, 200, 3, 7]), "application/octet-stream");
    }

    #[test]
    fn a_diff_keeps_what_both_have() {
        let d = diff("a\nb\nc\n", "a\nx\nc\nd\n", 100).unwrap();
        assert_eq!(d, vec![(' ', "a".into()), ('+', "x".into()), ('-', "b".into()), (' ', "c".into()), ('+', "d".into())]);
    }
}
