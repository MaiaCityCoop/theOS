//! Schemas (intent 0056): a schema is an object like any other, a blob named by its BLAKE3 hash, so it is fetched,
//! pinned and shared as iroh moves every blob; it holds a JSON Schema, and is checked against JSON Schema's own
//! meta-schema when it is kept. A doc names its schema by that hash in its `meta` (`schema`), and every commit of a doc
//! that names one is checked against it, after merging with what the branch holds: a write that does not fit is
//! refused, on every branch and on main alike. A schema never changes; a new one is a new hash, named anew.

use crate::{Hash, Result, TheDB, err, json};
use loro::LoroDoc;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Validators already built, by their schema's hash: a schema never changes, so one build serves for good.
fn built() -> &'static Mutex<HashMap<Hash, Arc<jsonschema::Validator>>> {
    static B: OnceLock<Mutex<HashMap<Hash, Arc<jsonschema::Validator>>>> = OnceLock::new();
    B.get_or_init(Default::default)
}

/// The schema a doc names, if any.
pub fn named(doc: &LoroDoc) -> Option<Hash> {
    doc.get_map("meta").get("schema")?.into_value().ok()?.into_string().ok()?.parse().ok()
}

impl TheDB {
    /// Keeps `bytes` as a schema: JSON, and a valid JSON Schema by its meta-schema. Returns its hash.
    pub fn put_schema(&self, bytes: &[u8]) -> Result<Hash> {
        let schema: serde_json::Value = serde_json::from_slice(bytes).map_err(|e| format!("a schema is JSON: {e}"))?;
        jsonschema::meta::validate(&schema).map_err(|e| format!("not a JSON Schema: {e}"))?;
        self.put(bytes.to_vec())
    }

    /// Makes doc `id` name the schema `schema` (or none), as a commit on this process's branch, checked against it.
    pub fn set_schema(&self, id: &str, schema: Option<Hash>) -> Result<Hash> {
        if let Some(s) = schema {
            self.validator(s)?;
        }
        let doc = self.edit(id)?;
        let meta = doc.get_map("meta");
        match schema {
            Some(s) => meta.insert("schema", s.to_hex().to_string()).map_err(err)?,
            None => meta.delete("schema").map_err(err)?,
        }
        self.commit(id, &doc)
    }

    fn validator(&self, schema: Hash) -> Result<Arc<jsonschema::Validator>> {
        if let Some(v) = built().lock().unwrap_or_else(|e| e.into_inner()).get(&schema) {
            return Ok(v.clone());
        }
        let bytes = self.get(schema)?.ok_or_else(|| format!("no schema {schema}"))?;
        let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| format!("the schema {schema} is no JSON: {e}"))?;
        let v = Arc::new(jsonschema::validator_for(&value).map_err(|e| format!("the schema {schema}: {e}"))?);
        built().lock().unwrap_or_else(|e| e.into_inner()).insert(schema, v.clone());
        Ok(v)
    }

    /// Whether `doc`, as it would be kept, fits the schema it names. Every commit asks this.
    pub(crate) fn check_schema(&self, id: &str, doc: &LoroDoc) -> Result<()> {
        let Some(schema) = named(doc) else { return Ok(()) };
        let v = self.validator(schema)?;
        let text = json::read(doc);
        let value: serde_json::Value = serde_json::from_str(&text).map_err(|_| format!("{id} names a schema, and its content is no JSON"))?;
        let problems: Vec<String> = v.iter_errors(&value).take(3).map(|e| format!("{} {e}", e.instance_path())).collect();
        if problems.is_empty() {
            return Ok(());
        }
        Err(format!("{id} does not fit its schema {}: {}", schema.fmt_short(), problems.join("; ")))
    }
}
