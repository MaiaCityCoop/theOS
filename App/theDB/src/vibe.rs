//! Vibes: one manifest kind for everything that is opened as a whole, a world, a timeline, an interface, an asset, the
//! system itself. A vibe is a doc of kind `vibe` like any other (versioned, branched, proposed, signed), checked on
//! every write against the one vibe schema (a blob, `VIBE_SCHEMA`). It names:
//!
//! - `entry`: the doc it opens with (a world, a timeline, a view);
//! - `needs`: what it needs, each by a role: a doc (`<id>`, its latest version), a doc's exact version
//!   (`<id>@<version hash>`) or a blob (`blob:<hash>`): its modules, its docs, its schemas, its pictures;
//! - `vibes`: the vibes it is made of, by id or pinned the same way. A leaf names none; a composite names its parts.
//!
//! `tree` walks a vibe and everything it is made of, and says of every reference whether the store holds it: a vibe
//! is whole when nothing it reaches is missing, and no vibe is made of itself.

use crate::{Hash, Result, TheDB, sql};
use std::collections::BTreeMap;

/// The vibe schema: the one shape every vibe has.
pub const VIBE_SCHEMA: &str = r##"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "A vibe: what opens as a whole, and everything it needs",
  "type": "object",
  "required": ["name", "entry"],
  "properties": {
    "name": {"type": "string", "minLength": 1},
    "entry": {"$ref": "#/$defs/doc"},
    "needs": {"type": "object", "additionalProperties": {"$ref": "#/$defs/ref"}},
    "vibes": {"type": "array", "items": {"$ref": "#/$defs/doc"}}
  },
  "additionalProperties": false,
  "$defs": {
    "doc": {"type": "string", "pattern": "^[a-z][a-z2-7]{25}(@[0-9a-f]{64})?$"},
    "ref": {"type": "string", "pattern": "^([a-z][a-z2-7]{25}(@[0-9a-f]{64})?|blob:[0-9a-f]{64})$"}
  }
}
"##;

/// What a vibe says.
#[derive(serde::Deserialize, Clone, Debug)]
pub struct Vibe {
    pub name: String,
    pub entry: String,
    #[serde(default)]
    pub needs: BTreeMap<String, String>,
    #[serde(default)]
    pub vibes: Vec<String>,
}

/// A reference, and whether the store holds it.
#[derive(Clone, Debug)]
pub struct Found {
    pub role: String,
    pub reference: String,
    /// What it is (`world ...`, `blob, 12 kB`), or why it is missing.
    pub what: std::result::Result<String, String>,
}

/// A vibe and everything it is made of.
#[derive(Clone, Debug)]
pub struct Tree {
    pub id: String,
    pub version: Option<Hash>,
    pub name: String,
    pub refs: Vec<Found>,
    pub parts: Vec<Tree>,
}

impl Tree {
    /// Every missing reference in the tree, with the vibe it is in.
    pub fn missing(&self) -> Vec<String> {
        let mut out: Vec<String> = self.refs.iter().filter_map(|f| f.what.as_ref().err().map(|e| format!("{}: {} {}: {e}", self.name, f.role, f.reference))).collect();
        for p in &self.parts {
            out.extend(p.missing());
        }
        out
    }

    /// The tree as lines of text, indented by depth.
    pub fn lines(&self, depth: usize, out: &mut Vec<String>) {
        let pad = "  ".repeat(depth);
        let pin = self.version.map(|v| format!(" @{}", v.fmt_short())).unwrap_or_default();
        out.push(format!("{pad}vibe {} ({}{pin})", self.name, self.id));
        for f in &self.refs {
            match &f.what {
                Ok(w) => out.push(format!("{pad}  ok  {:<8} {}  {w}", f.role, f.reference)),
                Err(e) => out.push(format!("{pad}  MISSING {:<8} {}  {e}", f.role, f.reference)),
            }
        }
        for p in &self.parts {
            p.lines(depth + 1, out);
        }
    }
}

/// A doc reference: its id and, when pinned, its version.
fn split(r: &str) -> Result<(String, Option<Hash>)> {
    match r.split_once('@') {
        Some((id, v)) => Ok((id.to_string(), Some(v.parse().map_err(|_| format!("not a version: {v}"))?))),
        None => Ok((r.to_string(), None)),
    }
}

impl TheDB {
    /// Keeps the vibe schema (the same bytes are the same blob, so this is idempotent). Returns its hash.
    pub fn vibe_schema(&self) -> Result<Hash> {
        self.put_schema(VIBE_SCHEMA.as_bytes())
    }

    /// Vibe `reference` (an id, or an id pinned to a version) and everything it is made of, each reference looked up.
    pub fn tree(&self, reference: &str) -> Result<Tree> {
        self.tree_within(reference, &mut Vec::new())
    }

    fn tree_within(&self, reference: &str, path: &mut Vec<String>) -> Result<Tree> {
        let (id, version) = split(reference)?;
        if path.contains(&id) {
            return Err(format!("the vibe {id} is made of itself: {} → {id}", path.join(" → ")));
        }
        let doc = match version {
            Some(v) => self.doc_at(v)?,
            None => self.doc(&id)?,
        };
        let (kind, _) = self.meta_of(&doc);
        if kind != "vibe" {
            return Err(format!("{id} is a {kind:?}, not a vibe"));
        }
        let vibe: Vibe = serde_json::from_str(&crate::json::read(&doc)).map_err(|e| format!("the vibe {id}: {e}"))?;
        let mut refs = vec![Found { role: "entry".into(), reference: vibe.entry.clone(), what: self.look_up(&vibe.entry) }];
        refs.extend(vibe.needs.iter().map(|(role, r)| Found { role: role.clone(), reference: r.clone(), what: self.look_up(r) }));
        path.push(id.clone());
        let mut parts = Vec::new();
        for part in &vibe.vibes {
            match self.tree_within(part, path) {
                Ok(t) => parts.push(t),
                Err(e) => refs.push(Found { role: "vibe".into(), reference: part.clone(), what: Err(e) }),
            }
        }
        path.pop();
        Ok(Tree { id, version, name: vibe.name, refs, parts })
    }

    /// What reference `r` is, if the store holds it.
    fn look_up(&self, r: &str) -> std::result::Result<String, String> {
        if let Some(h) = r.strip_prefix("blob:") {
            let h: Hash = h.parse().map_err(|_| "not a hash".to_string())?;
            return match self.blob_size(h)? {
                Some(n) => Ok(format!("blob, {n} bytes")),
                None => Err("no such blob".into()),
            };
        }
        let (id, version) = split(r)?;
        let (kind, name) = self.meta(&id).map_err(|_| "no such doc".to_string())?;
        if kind.is_empty() {
            return Err("no such doc".into());
        }
        if let Some(v) = version {
            match sql::version_doc(&self.sql(), v)? {
                Some(d) if d == id => {}
                Some(d) => return Err(format!("the version {} is {d}'s, not {id}'s", v.fmt_short())),
                None => return Err(format!("no version {} of it", v.fmt_short())),
            }
        }
        Ok(format!("{kind} {name}"))
    }
}
