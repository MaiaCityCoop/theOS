//! Code, flat and content-addressed, named by Rust (intent 0059, step 1d). A unit of code is named the way Rust names
//! it, never by a file path: `thedb::access` (a module), `thedb` (a library's root), `theos#main` (a binary's root),
//! `thedb#bin:thedb`, `thedb#test:access`, `theid#build`, `thedb#manifest` (its Cargo.toml), and `theos/Cargo.lock`
//! for the few files that are none of these. Its content is a blob, addressed by its BLAKE3 hash: kept once however
//! many versions and lines share it, served by iroh as it is, checked by its hash; what the code includes (an icon)
//! is a blob it names by hash (`blob!`). Which units the host's code has is one small Loro doc of kind `code` (the root
//! names it as `code`): its map `files` holds an entry per unit, keyed by the unit's own id, with its `crate`, `kind`,
//! `name` and `blob`, and, for a crate's manifest, the folder the crate is written into (`dir`): the one place a folder
//! is named, because Cargo needs a folder per crate. Nothing else: no file paths, no doc per file, no text CRDT.
//!
//! So a rename is one field and an edit another: made on two sides at once, both are kept. An edit replaces the unit's
//! blob as a whole: when main and a line both changed one unit, the merge does not pick a winner silently, it is a
//! conflict, shown by its name (Loro's own advice: a CRDT merges, it does not reject, and code merged without a look
//! can be wrong). One version of the `code` doc is one state of all the code, and its hash is cheap.
//!
//! Folders exist only in what the builder writes for `cargo` (`project`): every unit at the path Rust's conventions
//! give it (`src/access.rs`, `src/bin/thedb.rs`, `tests/access.rs`), read only, rewriting only what changed, at one
//! place for every line (`build/src` in the store), with one target (`build/target`), one build at a time
//! (`build_start`, `build_status`); its errors come back by name (`thedb::access:12:5`). Git is an archive: before each
//! merge that brings code, main's code is committed, as the builder writes it, onto `refs/heads/archive` of the
//! repository the store lives in, without touching any working tree or index (`archive_code`).

use crate::{Hash, Result, TheDB, err};
use loro::{Container, LoroDoc, LoroMap, ValueOrContainer};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// The map in a code doc: unit id → its entry.
pub(crate) const FILES: &str = "files";

/// What a projection wrote.
#[derive(Clone, Debug)]
pub struct Projected {
    /// The code's hash: every path written with its blob's hash.
    pub hash: Hash,
    pub files: usize,
    pub written: usize,
    pub removed: usize,
}

/// What a unit of code is to Rust and Cargo.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Kind {
    /// The crate's `Cargo.toml`.
    Manifest,
    /// The library's root (`src/lib.rs`).
    Lib,
    /// The main binary's root (`src/main.rs`).
    Main,
    /// A module (`src/a/b.rs` for `a::b`).
    Module,
    /// Another binary's root (`src/bin/<name>.rs`).
    Bin,
    /// An integration test (`tests/<name>.rs`).
    Test,
    /// The build script (`build.rs`).
    Build,
    /// Any other file the crate holds (`Cargo.lock`, a blob, a Swift helper), by its place in the crate.
    File,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Kind::Manifest => "manifest",
            Kind::Lib => "lib",
            Kind::Main => "main",
            Kind::Module => "module",
            Kind::Bin => "bin",
            Kind::Test => "test",
            Kind::Build => "build",
            Kind::File => "file",
        }
    }

    fn from(s: &str) -> Option<Kind> {
        Some(match s {
            "manifest" => Kind::Manifest,
            "lib" => Kind::Lib,
            "main" => Kind::Main,
            "module" => Kind::Module,
            "bin" => Kind::Bin,
            "test" => Kind::Test,
            "build" => Kind::Build,
            "file" => Kind::File,
            _ => return None,
        })
    }
}

/// A unit's name as Rust and Cargo see it: its crate, its kind, and its name in the crate (a module's path, a
/// target's name, a file's place; empty for a root).
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Unit {
    pub krate: String,
    pub kind: Kind,
    pub name: String,
}

fn ident(s: &str) -> bool {
    let mut c = s.chars();
    c.next().is_some_and(|f| f.is_ascii_alphabetic() || f == '_') && c.all(|x| x.is_ascii_alphanumeric() || x == '_')
}

fn crate_name(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// A place inside a crate: relative, `/` between its parts, none of them empty, `.` or `..`.
fn check_place(place: &str) -> Result<()> {
    if place.is_empty() || place.starts_with('/') || place.contains('\\') || place.split('/').any(|p| p.is_empty() || p == "." || p == "..") {
        return Err(format!("not a place in a crate: {place:?}"));
    }
    Ok(())
}

impl Unit {
    /// Reads an address: `thedb::access`, `thedb`, `theos#main`, `thedb#bin:thedb`, `thedb#test:access`,
    /// `theid#build`, `thedb#manifest`, `theos/Cargo.lock`.
    pub fn parse(address: &str) -> Result<Unit> {
        let unit = |krate: &str, kind, name: &str| Unit { krate: krate.into(), kind, name: name.into() };
        let u = if let Some((k, rest)) = address.split_once('#') {
            match rest {
                "main" => unit(k, Kind::Main, ""),
                "build" => unit(k, Kind::Build, ""),
                "manifest" => unit(k, Kind::Manifest, ""),
                r => match r.split_once(':') {
                    Some(("bin", n)) if ident(&n.replace('-', "_")) => unit(k, Kind::Bin, n),
                    Some(("test", n)) if ident(&n.replace('-', "_")) => unit(k, Kind::Test, n),
                    _ => return Err(format!("not a unit's name: {address:?} (after # comes main, build, manifest, bin:<name> or test:<name>)")),
                },
            }
        } else if let Some((k, place)) = address.split_once('/') {
            check_place(place)?;
            unit(k, Kind::File, place)
        } else if let Some((k, path)) = address.split_once("::") {
            if !path.split("::").all(ident) {
                return Err(format!("not a module's path: {address:?}"));
            }
            unit(k, Kind::Module, path)
        } else {
            unit(address, Kind::Lib, "")
        };
        if !crate_name(&u.krate) {
            return Err(format!("not a crate's name: {:?}", u.krate));
        }
        Ok(u)
    }

    /// Its address (the inverse of `parse`).
    pub fn address(&self) -> String {
        let k = &self.krate;
        match self.kind {
            Kind::Lib => k.clone(),
            Kind::Module => format!("{k}::{}", self.name),
            Kind::Main => format!("{k}#main"),
            Kind::Bin => format!("{k}#bin:{}", self.name),
            Kind::Test => format!("{k}#test:{}", self.name),
            Kind::Build => format!("{k}#build"),
            Kind::Manifest => format!("{k}#manifest"),
            Kind::File => format!("{k}/{}", self.name),
        }
    }

    /// Where Rust's conventions put it, in a crate written into `dir`.
    pub fn place(&self, dir: &str) -> String {
        let p = match self.kind {
            Kind::Manifest => "Cargo.toml".to_string(),
            Kind::Lib => "src/lib.rs".to_string(),
            Kind::Main => "src/main.rs".to_string(),
            Kind::Module => format!("src/{}.rs", self.name.replace("::", "/")),
            Kind::Bin => format!("src/bin/{}.rs", self.name),
            Kind::Test => format!("tests/{}.rs", self.name),
            Kind::Build => "build.rs".to_string(),
            Kind::File => self.name.clone(),
        };
        if dir.is_empty() { p } else { format!("{dir}/{p}") }
    }

    /// What a file at `rel` inside a crate is (the inverse of `place`; `a/mod.rs` reads as the module `a`).
    pub fn of(krate: &str, rel: &str) -> Unit {
        let unit = |kind, name: &str| Unit { krate: krate.into(), kind, name: name.into() };
        let rs = |p: &str| p.strip_suffix(".rs").filter(|n| !n.contains('/') && ident(&n.replace('-', "_"))).map(str::to_string);
        match rel {
            "Cargo.toml" => unit(Kind::Manifest, ""),
            "src/lib.rs" => unit(Kind::Lib, ""),
            "src/main.rs" => unit(Kind::Main, ""),
            "build.rs" => unit(Kind::Build, ""),
            _ => {
                if let Some(n) = rel.strip_prefix("src/bin/").and_then(rs) {
                    return unit(Kind::Bin, &n);
                }
                if let Some(n) = rel.strip_prefix("tests/").and_then(rs) {
                    return unit(Kind::Test, &n);
                }
                if let Some(m) = rel.strip_prefix("src/").and_then(|p| p.strip_suffix(".rs")) {
                    let m = m.strip_suffix("/mod").unwrap_or(m);
                    if !m.starts_with("bin/") && m.split('/').all(ident) {
                        return unit(Kind::Module, &m.replace('/', "::"));
                    }
                }
                unit(Kind::File, rel)
            }
        }
    }
}

/// One unit of a code doc: its id, its name, its blob, and (a manifest) the folder its crate is written into.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Entry {
    pub id: String,
    pub unit: Unit,
    pub blob: String,
    pub dir: Option<String>,
}

fn text_of(map: &LoroMap, key: &str) -> Option<String> {
    map.get(key)?.into_value().ok()?.into_string().ok().map(|s| s.to_string())
}

/// Every unit of a code doc, by address. After a merge two entries can share an address (both sides made it): both
/// are here.
pub(crate) fn entries(doc: &LoroDoc) -> Vec<Entry> {
    let files = doc.get_map(FILES);
    let mut out: Vec<Entry> = files
        .keys()
        .filter_map(|id| {
            let ValueOrContainer::Container(Container::Map(m)) = files.get(&id)? else { return None };
            let unit = Unit { krate: text_of(&m, "crate")?, kind: Kind::from(&text_of(&m, "kind")?)?, name: text_of(&m, "name").unwrap_or_default() };
            Some(Entry { id: id.to_string(), unit, blob: text_of(&m, "blob")?, dir: text_of(&m, "dir") })
        })
        .collect();
    out.sort_by(|a, b| (a.unit.address(), &a.id).cmp(&(b.unit.address(), &b.id)));
    out
}

/// Every unit by its address.
fn by_address(doc: &LoroDoc) -> BTreeMap<String, Entry> {
    entries(doc).into_iter().map(|e| (e.unit.address(), e)).collect()
}

/// Every crate's folder, from its manifest.
fn crate_dirs(units: &BTreeMap<String, Entry>) -> BTreeMap<String, String> {
    units.values().filter(|e| e.unit.kind == Kind::Manifest).map(|e| (e.unit.krate.clone(), e.dir.clone().unwrap_or_default())).collect()
}

/// Where each unit is written, by address.
fn places(units: &BTreeMap<String, Entry>) -> Result<BTreeMap<String, String>> {
    let dirs = crate_dirs(units);
    units
        .iter()
        .map(|(a, e)| {
            let dir = dirs.get(&e.unit.krate).ok_or_else(|| format!("the crate {} has no manifest ({}#manifest)", e.unit.krate, e.unit.krate))?;
            Ok((a.clone(), e.unit.place(dir)))
        })
        .collect()
}

/// Sets a unit's entry, changing only the fields that differ.
fn set_entry(doc: &LoroDoc, id: &str, unit: &Unit, blob: &str, dir: Option<&str>) -> Result<()> {
    let m = doc.get_map(FILES).ensure_mergeable_map(id).map_err(err)?;
    for (k, v) in [("crate", unit.krate.as_str()), ("kind", unit.kind.as_str()), ("name", unit.name.as_str()), ("blob", blob)] {
        if text_of(&m, k).as_deref() != Some(v) {
            m.insert(k, v).map_err(err)?;
        }
    }
    if let Some(d) = dir
        && text_of(&m, "dir").as_deref() != Some(d)
    {
        m.insert("dir", d).map_err(err)?;
    }
    for legacy in ["path"] {
        if m.get(legacy).is_some() {
            m.delete(legacy).map_err(err)?;
        }
    }
    Ok(())
}

/// The units a move or a delete of `address` takes: the unit itself, and a module's whole subtree.
fn taken<'a>(units: &'a BTreeMap<String, Entry>, address: &str) -> Vec<&'a Entry> {
    let inside = format!("{address}::");
    units.iter().filter(|(a, _)| *a == address || (a.starts_with(&inside) && !address.contains(['#', '/']))).map(|(_, e)| e).collect()
}

fn writable(path: &Path, yes: bool) {
    if let Ok(meta) = std::fs::metadata(path) {
        let mut p = meta.permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        p.set_readonly(!yes);
        let _ = std::fs::set_permissions(path, p);
    }
}

fn git(repo: &Path, args: &[&str], input: Option<&[u8]>, env: &[(&str, &Path)]) -> Result<String> {
    use std::io::Write;
    let mut cmd = std::process::Command::new("git");
    cmd.arg("-C").arg(repo).args(args).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    for (k, v) in env {
        cmd.env(k, v);
    }
    if input.is_some() {
        cmd.stdin(std::process::Stdio::piped());
    }
    let mut child = cmd.spawn().map_err(err)?;
    if let Some(bytes) = input {
        child.stdin.take().ok_or("no input to git")?.write_all(bytes).map_err(err)?;
    }
    let out = child.wait_with_output().map_err(err)?;
    if !out.status.success() {
        return Err(format!("git {}: {}", args.join(" "), String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// A manifest's `[package] name`.
fn package_name(manifest: &str) -> Option<String> {
    let mut in_package = false;
    for line in manifest.lines() {
        let l = line.trim();
        if l.starts_with('[') {
            in_package = l == "[package]";
        } else if in_package && let Some(v) = l.strip_prefix("name").map(str::trim_start).and_then(|v| v.strip_prefix('=')) {
            return Some(v.trim().trim_matches('"').to_string());
        }
    }
    None
}

impl TheDB {
    /// The root doc's id and its JSON, as this process's branch sees it.
    fn root_json(&self) -> Result<(String, Value)> {
        let root = self.root()?.ok_or("theDB has no root")?;
        let v = serde_json::from_str(&self.text(&root)?.unwrap_or_else(|| "{}".into())).map_err(err)?;
        Ok((root, v))
    }

    /// The code doc's id, as this process's branch sees the root; none before code is brought in.
    pub fn code_id(&self) -> Result<Option<String>> {
        Ok(self.root_json()?.1.get("code").and_then(Value::as_str).map(str::to_string))
    }

    fn code_id_or_new(&self) -> Result<String> {
        if let Some(id) = self.code_id()? {
            return Ok(id);
        }
        let id = self.new("code", "the host's code")?;
        let (root, mut v) = self.root_json()?;
        v["code"] = json!(id);
        self.set_text(&root, &serde_json::to_string_pretty(&v).map_err(err)?)?;
        Ok(id)
    }

    /// The code doc as this process's branch sees it.
    pub fn code(&self) -> Result<LoroDoc> {
        let id = self.code_id()?.ok_or("this store has no code yet: `theDB source import <repo>`")?;
        self.doc(&id)
    }

    /// The code doc as main has it, whatever branch this process is on; none before code is brought in.
    fn main_code(&self) -> Result<Option<LoroDoc>> {
        let Some(root) = self.root()? else { return Ok(None) };
        let Some(h) = self.head_on(None, &root)? else { return Ok(None) };
        let v: Value = serde_json::from_slice(&self.file_at(h)?).map_err(err)?;
        let Some(id) = v.get("code").and_then(Value::as_str) else { return Ok(None) };
        match self.head_on(None, id)? {
            Some(h) => Ok(Some(self.doc_at(h)?)),
            None => Ok(None),
        }
    }

    fn blob_bytes(&self, hash: &str) -> Result<Vec<u8>> {
        let h: Hash = hash.parse().map_err(err)?;
        Ok(self.get(h)?.ok_or_else(|| format!("no blob {h}"))?.to_vec())
    }

    /// Changes the code on this process's branch with `change`, given the doc and its units by address, and commits
    /// once.
    fn change_code<T>(&self, change: impl FnOnce(&LoroDoc, &BTreeMap<String, Entry>) -> Result<T>) -> Result<T> {
        let id = self.code_id_or_new()?;
        let doc = self.edit(&id)?;
        let units = by_address(&doc);
        let out = change(&doc, &units)?;
        self.commit(&id, &doc)?;
        Ok(out)
    }

    /// Every unit's address.
    pub fn code_units(&self) -> Result<Vec<String>> {
        if self.code_id()?.is_none() {
            return Ok(vec![]);
        }
        Ok(entries(&self.code()?).into_iter().map(|e| e.unit.address()).collect())
    }

    /// The unit at `address`, as bytes: its blob.
    pub fn code_bytes(&self, address: &str) -> Result<Vec<u8>> {
        let e = by_address(&self.code()?).remove(address).ok_or_else(|| format!("no unit {address}"))?;
        self.blob_bytes(&e.blob)
    }

    /// The unit at `address`, as text; one that is not text is refused.
    pub fn code_text(&self, address: &str) -> Result<String> {
        String::from_utf8(self.code_bytes(address)?).map_err(|_| format!("{address} is not text"))
    }

    /// Keeps `bytes` as the unit at `address`, on this process's branch: its blob, under the unit's id (a new address,
    /// a new unit). A new crate's manifest is written into `App/<crate>`.
    pub fn code_write_bytes(&self, address: &str, bytes: &[u8]) -> Result<()> {
        let unit = Unit::parse(address)?;
        let blob = self.put(bytes.to_vec())?.to_hex().to_string();
        self.change_code(|doc, units| {
            let had = units.get(address);
            let dir = match (unit.kind, had) {
                (Kind::Manifest, Some(e)) => e.dir.clone(),
                (Kind::Manifest, None) => Some(format!("App/{}", unit.krate)),
                _ if crate_dirs(units).contains_key(&unit.krate) => None,
                _ => return Err(format!("no crate {}: write its manifest first ({}#manifest)", unit.krate, unit.krate)),
            };
            let id = had.map(|e| e.id.clone()).unwrap_or_else(crate::new_id);
            set_entry(doc, &id, &unit, &blob, dir.as_deref())
        })
    }

    /// Keeps `text` as the unit at `address`.
    pub fn code_write(&self, address: &str, text: &str) -> Result<()> {
        self.code_write_bytes(address, text.as_bytes())
    }

    /// Replaces the one place `old` stands in the unit at `address` with `new`, in the unit as this branch has it at
    /// the moment of the change; refused where `old` is not there once.
    pub fn code_edit(&self, address: &str, old: &str, new: &str) -> Result<()> {
        let id = self.code_id()?.ok_or("this store has no code yet")?;
        let doc = self.edit(&id)?;
        let e = by_address(&doc).remove(address).ok_or_else(|| format!("no unit {address}"))?;
        let text = String::from_utf8(self.blob_bytes(&e.blob)?).map_err(|_| format!("{address} is not text"))?;
        let edited = match text.matches(old).count() {
            1 => text.replacen(old, new, 1),
            0 => return Err(format!("`old` is not in {address}")),
            k => return Err(format!("`old` is in {address} {k} times: give more of it")),
        };
        let blob = self.put(edited.into_bytes())?.to_hex().to_string();
        set_entry(&doc, &e.id, &e.unit, &blob, e.dir.as_deref())?;
        self.commit(&id, &doc).map(|_| ())
    }

    /// Renames the unit at `from` to `to` (a module takes its whole subtree along: `thedb::a` to `thedb::b` moves
    /// `thedb::a::x` to `thedb::b::x`). Each unit keeps its id, so an edit made meanwhile goes with it. The code that
    /// names it (`mod a;`, `use crate::a`) is the mover's to change.
    pub fn code_move(&self, from: &str, to: &str) -> Result<()> {
        let target = Unit::parse(to)?;
        let source = Unit::parse(from)?;
        if source.kind != target.kind {
            return Err(format!("{from} is a {}, {to} would be a {}", source.kind.as_str(), target.kind.as_str()));
        }
        self.change_code(|doc, units| {
            let moving = taken(units, from);
            if moving.is_empty() {
                return Err(format!("no unit {from}"));
            }
            if to.starts_with(&format!("{from}::")) {
                return Err(format!("{from} cannot go inside itself"));
            }
            for e in &moving {
                let address = format!("{to}{}", &e.unit.address()[from.len()..]);
                if units.get(&address).is_some_and(|x| !moving.iter().any(|m| m.id == x.id)) {
                    return Err(format!("{address} is there already"));
                }
                set_entry(doc, &e.id, &Unit::parse(&address)?, &e.blob, e.dir.as_deref())?;
            }
            Ok(())
        })
    }

    /// Takes the unit at `address` out (a module with its subtree); its blobs stay, and the doc's history names them.
    pub fn code_delete(&self, address: &str) -> Result<()> {
        self.change_code(|doc, units| {
            let gone = taken(units, address);
            if gone.is_empty() {
                return Err(format!("no unit {address}"));
            }
            for e in gone {
                doc.get_map(FILES).delete(&e.id).map_err(err)?;
            }
            Ok(())
        })
    }

    /// The lines that hold `needle`, in every unit that is text: its address, the line's number (from 1), the line; at
    /// most `max`.
    pub fn code_search(&self, needle: &str, max: usize) -> Result<Vec<(String, usize, String)>> {
        let mut out = Vec::new();
        for e in entries(&self.code()?) {
            let Ok(text) = String::from_utf8(self.blob_bytes(&e.blob)?) else { continue };
            for (i, line) in text.lines().enumerate() {
                if line.contains(needle) {
                    out.push((e.unit.address(), i + 1, line.to_string()));
                    if out.len() >= max {
                        return Ok(out);
                    }
                }
            }
        }
        Ok(out)
    }

    /// Brings the code of the git checkout `repo` under `under` (`App`), as its HEAD has them, into this process's
    /// branch, in one commit: each file named as Rust names it (by the crate whose manifest is nearest above it), its
    /// content a blob; every unit git no longer has, and anything kept before units had names, taken out. The checkout
    /// must be clean there. Returns how many units changed.
    pub fn source_import(&self, repo: &Path, under: &str) -> Result<usize> {
        if !git(repo, &["status", "--porcelain", "--", under], None, &[])?.is_empty() {
            return Err(format!("{under}/ has changes not committed: code is brought in from a commit"));
        }
        let paths: Vec<String> = git(repo, &["ls-files", "--", under], None, &[])?.lines().map(str::to_string).collect();
        // the crates: every folder with a manifest, by its package's name
        let mut crates: Vec<(String, String)> = Vec::new();
        for p in paths.iter().filter(|p| p.ends_with("Cargo.toml")) {
            let dir = p.strip_suffix("Cargo.toml").unwrap_or_default().trim_end_matches('/').to_string();
            let text = std::fs::read_to_string(repo.join(p)).map_err(|e| format!("{p}: {e}"))?;
            crates.push((dir, package_name(&text).ok_or_else(|| format!("{p} names no package"))?));
        }
        crates.sort_by_key(|(d, _)| std::cmp::Reverse(d.len()));
        let mut want: BTreeMap<String, (Unit, String, Option<String>)> = BTreeMap::new();
        for path in &paths {
            let (dir, krate) = crates.iter().find(|(d, _)| d.is_empty() || path.starts_with(&format!("{d}/"))).ok_or_else(|| format!("{path} is in no crate"))?;
            let rel = if dir.is_empty() { path.as_str() } else { &path[dir.len() + 1..] };
            let unit = Unit::of(krate, rel);
            let bytes = std::fs::read(repo.join(path)).map_err(|e| format!("{path}: {e}"))?;
            let blob = self.put(bytes)?.to_hex().to_string();
            let dir = (unit.kind == Kind::Manifest).then(|| dir.clone());
            if let Some((was, _, _)) = want.insert(unit.address(), (unit.clone(), blob, dir)) {
                return Err(format!("two files are {} ({path})", was.address()));
            }
        }
        self.change_code(|doc, units| {
            let mut changed = 0;
            let mut kept = BTreeSet::new();
            for (address, (unit, blob, dir)) in &want {
                let had = units.get(address);
                changed += usize::from(had.map(|e| &e.blob) != Some(blob));
                let id = had.map(|e| e.id.clone()).unwrap_or_else(crate::new_id);
                set_entry(doc, &id, unit, blob, dir.as_deref())?;
                kept.insert(id);
            }
            // what git no longer has, and anything kept before units had names
            let files = doc.get_map(FILES);
            for id in files.keys().map(|k| k.to_string()).collect::<Vec<_>>() {
                if !kept.contains(&id) {
                    files.delete(&id).map_err(err)?;
                    changed += 1;
                }
            }
            Ok(changed)
        })
    }

    /// Brings the code of the git checkout `repo` (`App/`, at its HEAD, clean) into theDB: onto a branch of its own,
    /// `source-<commit>`, proposed as an intent for the owner to accept. Returns the intent and how many units changed.
    pub fn import_code(&mut self, repo: &Path) -> Result<(String, usize)> {
        let commit = git(repo, &["rev-parse", "HEAD"], None, &[])?;
        let branch = format!("source-{}", &commit[..12.min(commit.len())]);
        self.make_branch(&branch, &format!("the code of git commit {commit}"))?;
        let was = self.branch().map(str::to_string);
        self.set_branch(Some(&branch))?;
        let n = self.source_import(repo, "App");
        self.set_branch(was.as_deref())?;
        let n = n?;
        let subject: String = git(repo, &["log", "-1", "--format=%s"], None, &[])?.chars().take(120).collect();
        let id = self.propose(&branch, &format!("Code from git commit {}: {subject}", &commit[..8.min(commit.len())]))?;
        self.sync()?;
        Ok((id, n))
    }

    /// Every unit of `doc`, by the path the builder writes it to, with its blob.
    fn written(&self, doc: &LoroDoc) -> Result<BTreeMap<String, String>> {
        let units = by_address(doc);
        let places = places(&units)?;
        Ok(units.into_iter().map(|(a, e)| (places[&a].clone(), e.blob)).collect())
    }

    /// Every unit of `doc` with its bytes, by the path the builder writes it to.
    fn all_files(&self, doc: &LoroDoc) -> Result<BTreeMap<String, Vec<u8>>> {
        self.written(doc)?.into_iter().map(|(p, b)| Ok((p, self.blob_bytes(&b)?))).collect()
    }

    /// Writes this process's branch's code into `dir`, every unit where Rust's conventions put it: only what differs,
    /// read only (but `Cargo.lock`, which `cargo` may bring up to date), and what the code no longer has removed.
    pub fn project(&self, dir: &Path) -> Result<Projected> {
        let files = self.written(&self.code()?)?;
        let mut manifest = String::new();
        let mut want = BTreeSet::new();
        let mut written = 0;
        for (path, blob) in &files {
            manifest.push_str(&format!("{path}\0{blob}\n"));
            let at = dir.join(path);
            let differs = std::fs::read(&at).ok().is_none_or(|have| Hash::new(&have).to_hex().to_string() != *blob);
            if differs {
                if let Some(parent) = at.parent() {
                    std::fs::create_dir_all(parent).map_err(err)?;
                }
                writable(&at, true);
                std::fs::write(&at, self.blob_bytes(blob)?).map_err(|x| format!("{path}: {x}"))?;
                written += 1;
            }
            writable(&at, path.ends_with("Cargo.lock"));
            want.insert(at);
        }
        let mut removed = 0;
        let mut todo = vec![dir.to_path_buf()];
        while let Some(d) = todo.pop() {
            for x in std::fs::read_dir(&d).map_err(err)?.flatten() {
                let p = x.path();
                if p.is_dir() {
                    todo.push(p);
                } else if !want.contains(&p) {
                    writable(&p, true);
                    std::fs::remove_file(&p).map_err(err)?;
                    removed += 1;
                }
            }
        }
        Ok(Projected { hash: Hash::new(manifest.as_bytes()), files: files.len(), written, removed })
    }

    /// The folder of the crate whose manifest makes the workspace (`[workspace]`); a single crate's own.
    fn workspace_dir(&self, doc: &LoroDoc) -> Result<String> {
        let manifests: Vec<Entry> = entries(doc).into_iter().filter(|e| e.unit.kind == Kind::Manifest).collect();
        for e in &manifests {
            if String::from_utf8(self.blob_bytes(&e.blob)?).is_ok_and(|t| t.lines().any(|l| l.trim() == "[workspace]")) {
                return Ok(e.dir.clone().unwrap_or_default());
            }
        }
        match manifests.as_slice() {
            [one] => Ok(one.dir.clone().unwrap_or_default()),
            _ => Err("no manifest makes the workspace ([workspace])".into()),
        }
    }

    // ---- the builder: one build at a time, for every line ----

    fn build_dir(&self) -> PathBuf {
        self.dir().join("build")
    }

    /// Starts building this process's branch's code: its tree written to `build/src`, then `cargo build` of its
    /// workspace in the background, into `build/target`. Refused while another build runs. Returns its state, as
    /// `build_status` gives it.
    pub fn build_start(&self) -> Result<Value> {
        let dir = self.build_dir();
        std::fs::create_dir_all(&dir).map_err(err)?;
        if let Some(run) = self.build_run()?
            && run.get("state").and_then(Value::as_str) == Some("running")
        {
            return Err(format!("the builder is busy: building {} since {}s ago; ask again", run["line"].as_str().unwrap_or("?"), run["seconds"]));
        }
        let projected = self.project(&dir.join("src"))?;
        let workspace = self.workspace_dir(&self.code()?)?;
        let log = std::fs::File::create(dir.join("log")).map_err(err)?;
        let _ = std::fs::remove_file(dir.join("exit"));
        let mut child = std::process::Command::new("cargo")
            .args(["build", "--workspace", "--message-format=short"])
            // in the workspace's own folder, where cargo reads its `.cargo/config.toml` (`THEOS_BLOBS`)
            .current_dir(dir.join("src").join(&workspace))
            .env("CARGO_TARGET_DIR", dir.join("target"))
            .stdin(std::process::Stdio::null())
            .stdout(log.try_clone().map_err(err)?)
            .stderr(log)
            .spawn()
            .map_err(err)?;
        let line = self.branch().unwrap_or(crate::MAIN).to_string();
        std::fs::write(dir.join("run.json"), serde_json::to_vec_pretty(&json!({ "line": line, "tree": projected.hash.to_hex().to_string(), "workspace": workspace, "pid": child.id(), "started": crate::now() })).map_err(err)?).map_err(err)?;
        let exit = dir.join("exit");
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
            let _ = std::fs::write(exit, code.to_string());
        });
        self.build_status()
    }

    fn build_run(&self) -> Result<Option<Value>> {
        let dir = self.build_dir();
        let Ok(run) = std::fs::read(dir.join("run.json")) else { return Ok(None) };
        let mut run: Value = serde_json::from_slice(&run).map_err(err)?;
        let started = run["started"].as_u64().unwrap_or(0);
        run["seconds"] = json!(crate::now().saturating_sub(started));
        let exit = std::fs::read_to_string(dir.join("exit")).ok().and_then(|e| e.trim().parse::<i32>().ok());
        let alive = run["pid"].as_u64().is_some_and(|p| std::process::Command::new("kill").args(["-0", &p.to_string()]).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success()));
        run["state"] = json!(match exit {
            Some(0) => "ok",
            Some(_) => "failed",
            None if alive => "running",
            None => "stopped",
        });
        Ok(Some(run))
    }

    /// The last build: its line, its tree's hash, its state (`running`, `ok`, `failed`, or `stopped` when its process
    /// ended without a word), how long, and its errors (each with what cargo said after it), or the log's last lines
    /// while it runs. A finished build that brought `Cargo.lock` up to date gives it back to its line.
    pub fn build_status(&self) -> Result<Value> {
        let Some(mut run) = self.build_run()? else { return Ok(json!({ "state": "none" })) };
        let log = std::fs::read_to_string(self.build_dir().join("log")).unwrap_or_default();
        let lines: Vec<&str> = log.lines().collect();
        if run["state"] == "running" {
            run["last"] = json!(lines.iter().rev().take(5).rev().collect::<Vec<_>>());
            return Ok(run);
        }
        // cargo's short lines: `theDB/src/access.rs:2:5: error[E0308]: ...`, a path from the workspace's folder; given
        // back by the unit's name: `thedb::access:2:5: error[E0308]: ...`
        let workspace = run["workspace"].as_str().unwrap_or_default().to_string();
        let names: BTreeMap<String, String> = match self.code().map(|d| by_address(&d)) {
            Ok(units) => places(&units).unwrap_or_default().into_iter().map(|(a, p)| (p, a)).collect(),
            Err(_) => BTreeMap::new(),
        };
        let in_tree = |l: &str| match l.split_once(": ") {
            Some((at, rest)) if at.contains(".rs:") && !at.contains(' ') => {
                let (file, pos) = at.split_once(".rs:").map(|(f, p)| (format!("{f}.rs"), p)).unwrap_or_default();
                let place = if workspace.is_empty() { file.clone() } else { format!("{workspace}/{file}") };
                format!("{}:{pos}: {rest}", names.get(&place).cloned().unwrap_or(place))
            }
            _ => l.to_string(),
        };
        let is = |l: &str, what: &str| l.starts_with(what) || l.split_once(": ").is_some_and(|(at, rest)| at.contains(".rs:") && rest.starts_with(what));
        let errors: Vec<String> = lines.iter().filter(|l| is(l, "error") && !l.starts_with("error: could not compile")).take(30).map(|l| in_tree(l)).collect();
        run["errors"] = json!(errors);
        run["warnings"] = json!(lines.iter().filter(|l| is(l, "warning") && l.contains(".rs:")).count());
        let lock_place = if workspace.is_empty() { "Cargo.lock".to_string() } else { format!("{workspace}/Cargo.lock") };
        if run["state"] == "ok"
            && run["line"].as_str() == Some(self.branch().unwrap_or(crate::MAIN))
            && let Some(address) = names.get(&lock_place)
            && let Ok(lock) = std::fs::read_to_string(self.build_dir().join("src").join(&lock_place))
            && self.code_text(address).is_ok_and(|kept| kept != lock)
        {
            self.code_write(address, &lock)?;
            run["lock"] = json!(format!("{address} brought up to date on this line"));
        }
        Ok(run)
    }

    /// Builds this process's branch's code as the host (engine `engine`) and proposes it, with no git: the tree written
    /// out and built where every build is (`build/`), now, not in the background; the binary and every file kept as
    /// blobs, the manifest naming the tree's hash and the line; the engine's new pin on the branch `build-<tree>`,
    /// proposed as an intent for the owner. Refused while another build runs. Returns the build's hash and the intent.
    pub fn publish_tree(&self, engine: &str) -> Result<(Hash, String)> {
        let dir = self.build_dir();
        std::fs::create_dir_all(&dir).map_err(err)?;
        if let Some(run) = self.build_run()?
            && run["state"] == "running"
        {
            return Err(format!("the builder is busy: building {}; ask again", run["line"].as_str().unwrap_or("?")));
        }
        let line = self.branch().unwrap_or(crate::MAIN).to_string();
        let projected = self.project(&dir.join("src"))?;
        let code = self.code()?;
        let built = std::process::Command::new("cargo")
            .args(["build", "--workspace", "--message-format=json-render-diagnostics"])
            .current_dir(dir.join("src").join(self.workspace_dir(&code)?))
            .env("CARGO_TARGET_DIR", dir.join("target"))
            .stderr(std::process::Stdio::inherit())
            .output()
            .map_err(err)?;
        if !built.status.success() {
            return Err(format!("the build of {line} failed"));
        }
        let swept = crate::build::sweep(&dir.join("target").join("debug"), &String::from_utf8_lossy(&built.stdout))?;
        eprintln!("thedb: the build folder swept: {} files and folders of earlier builds, {:.1} GB", swept.0, swept.1 as f64 / 1e9);
        let files = self.written(&code)?;
        let tree = projected.hash.to_hex().to_string();
        let manifest = json!({ "tree": tree, "line": line, "files": files });
        let binary = std::fs::read(dir.join("target").join("debug").join("theos")).map_err(|e| format!("the host's binary: {e}"))?;
        let toolchain = std::process::Command::new("rustc").arg("-V").output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        let branch = format!("build-{}", &tree[..12]);
        self.make_branch(&branch, &format!("the host built from the code of {line}, tree {tree}"))?;
        let hash = self.publish_on(Some(&branch), engine, &binary, &serde_json::to_vec_pretty(&manifest).map_err(err)?, &toolchain)?;
        let intent = self.propose(&branch, &format!("Host build {} from the code of {line}", &hash.to_hex()[..12]))?;
        self.sync()?;
        Ok((hash, intent))
    }

    // ---- git, as an archive ----

    /// The repository the store lives in (its folder's parent), if it is one.
    pub fn archive_repo(&self) -> Option<PathBuf> {
        let repo = self.dir().parent()?.to_path_buf();
        repo.join(".git").exists().then_some(repo)
    }

    /// Commits main's tree onto `refs/heads/archive` of `repo`, with `message`; through a scratch index, so no working
    /// tree, index or branch of anyone's is touched. Returns the commit, or `None` without code.
    pub fn archive_code(&self, repo: &Path, message: &str) -> Result<Option<String>> {
        let Some(code) = self.main_code()? else { return Ok(None) };
        let index = std::env::temp_dir().join(format!("thedb-archive-{}.index", std::process::id()));
        let _ = std::fs::remove_file(&index);
        let env: [(&str, &Path); 1] = [("GIT_INDEX_FILE", &index)];
        let mut info = String::new();
        for (path, bytes) in self.all_files(&code)? {
            let blob = git(repo, &["hash-object", "-w", "--stdin"], Some(&bytes), &env)?;
            info.push_str(&format!("100644 {blob}\t{path}\n"));
        }
        git(repo, &["update-index", "--add", "--index-info"], Some(info.as_bytes()), &env)?;
        let tree_hash = git(repo, &["write-tree"], None, &env)?;
        let _ = std::fs::remove_file(&index);
        let parent = git(repo, &["rev-parse", "--verify", "-q", "refs/heads/archive"], None, &[]).ok();
        // made by theDB, as theDB: a snapshot, not anyone's commit
        let mut args = vec!["-c", "user.name=theDB", "-c", "user.email=thedb@theos.invalid", "commit-tree", tree_hash.as_str(), "-m", message];
        if let Some(p) = &parent {
            args.extend(["-p", p.as_str()]);
        }
        let commit = git(repo, &args, None, &[])?;
        git(repo, &["update-ref", "refs/heads/archive", &commit], None, &[])?;
        Ok(Some(commit))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every kind of unit: its address reads back, and the place Rust's conventions give it reads back as the unit.
    #[test]
    fn names_and_places_read_back() {
        for (address, place) in [
            ("thedb", "App/theDB/src/lib.rs"),
            ("thedb::access", "App/theDB/src/access.rs"),
            ("thedb::a::b", "App/theDB/src/a/b.rs"),
            ("theos#main", "App/theDB/src/main.rs"),
            ("thedb#bin:thedb", "App/theDB/src/bin/thedb.rs"),
            ("thedb#test:access", "App/theDB/tests/access.rs"),
            ("theid#build", "App/theDB/build.rs"),
            ("thedb#manifest", "App/theDB/Cargo.toml"),
            ("theos/Cargo.lock", "App/theDB/Cargo.lock"),
            ("theos/blobs/9e35", "App/theDB/blobs/9e35"),
            ("theid/presence.swift", "App/theDB/presence.swift"),
        ] {
            let u = Unit::parse(address).unwrap();
            assert_eq!(u.address(), address);
            assert_eq!(u.place("App/theDB"), place);
            assert_eq!(Unit::of(&u.krate, place.strip_prefix("App/theDB/").unwrap()), u, "{place}");
        }
        assert_eq!(Unit::of("x", "src/a/mod.rs").address(), "x::a", "a mod.rs is its folder's module");
        for bad in ["", "a::", "a::1b", "a#nothing", "a/../b", "a b"] {
            assert!(Unit::parse(bad).is_err(), "{bad:?}");
        }
    }
}
