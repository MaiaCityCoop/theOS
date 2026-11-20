//! Bakes made once (intent 0049): a bake's result is kept in avenDB, keyed by the hash of everything it is made from
//! (the master mesh, the bake's settings, the shaders it draws with, and the engine's own bake code), so the next start
//! reads it and bakes nothing. A change to any of those makes a new key, and the bake runs again.

use bevy::mesh::{Indices, Mesh};

/// The bake code itself (intent 0050): the source of every file a bake's result depends on, so a change to how a
/// master is grown or photographed makes new keys by itself; no version to remember to raise.
fn code() -> &'static [u8] {
    static CODE: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
    CODE.get_or_init(|| {
        [include_str!("bakes.rs"), include_str!("impostor.rs"), include_str!("library.rs"), include_str!("grass.rs"), include_str!("terrain.rs"), include_str!("lawn.rs")]
            .iter()
            .flat_map(|s| s.as_bytes().iter().copied())
            .collect()
    })
}

/// The key of a bake: BLAKE3 of the bake code's version, the inputs given, and the current versions of the shader
/// docs named.
pub fn key(kind: &str, inputs: &[&[u8]], shaders: &[&str]) -> String {
    let db = crate::db();
    let mut all: Vec<u8> = Vec::new();
    for part in [code(), kind.as_bytes()].into_iter().chain(inputs.iter().copied()) {
        all.extend((part.len() as u64).to_le_bytes());
        all.extend(part);
    }
    for s in shaders {
        let head = db.head(s).ok().flatten().map(|h| h.to_hex().to_string()).unwrap_or_default();
        all.extend(head.as_bytes());
    }
    avendb::Hash::new(&all).to_hex().to_string()
}

/// A mesh's bytes: its positions, normals, colours, UVs and indices, for a key.
pub fn mesh_bytes(mesh: &Mesh) -> Vec<u8> {
    let mut b = Vec::new();
    for a in [Mesh::ATTRIBUTE_POSITION, Mesh::ATTRIBUTE_NORMAL, Mesh::ATTRIBUTE_COLOR, Mesh::ATTRIBUTE_UV_0] {
        if let Some(v) = mesh.attribute(a) {
            b.extend(v.get_bytes());
        }
    }
    match mesh.indices() {
        Some(Indices::U32(i)) => i.iter().for_each(|x| b.extend(x.to_le_bytes())),
        Some(Indices::U16(i)) => i.iter().for_each(|x| b.extend(x.to_le_bytes())),
        None => {}
    }
    b
}

/// A kept result of the bake `key`: its part `name` (an atlas), if it was baked before.
pub fn get(key: &str, name: &str) -> Option<Vec<u8>> {
    crate::db().part(&crate::root::root().bakes, &format!("{key} {name}")).ok().flatten().map(|b| b.to_vec())
}

/// Keeps a result of the bake `key`.
pub fn put(key: &str, name: &str, bytes: &[u8]) {
    if let Err(e) = crate::db().set_part(&crate::root::root().bakes, &format!("{key} {name}"), bytes) {
        bevy::log::warn!("a bake could not be kept: {e}");
    }
}

// ---- a bake that belongs to its asset (intent 0050) ----
//
// An asset doc links each of its bakes by kind in its map `derived` (kind → the result's doc id). A result is a doc of
// kind `bake`: its parts are the bake's pictures, its map `bake` holds the key it was made under and the parameters
// read back without the master (`params`). It is valid while its key is the key the asset's recipe, the bake's
// settings, its shaders and the bake code give now: checked without growing a master.

/// The result doc that asset `asset` links for `kind`, if any.
pub fn linked(asset: &str, kind: &str) -> Option<String> {
    let doc = crate::db().doc(asset).ok()?;
    doc.get_map("derived").get(kind).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string())
}

/// The result of `kind` asset `asset` links, if it was made under `key`: its parameters.
pub fn valid(asset: &str, kind: &str, key: &str) -> Option<serde_json::Value> {
    let id = linked(asset, kind)?;
    let doc = crate::db().doc(&id).ok()?;
    let m = doc.get_map("bake");
    let field = |k: &str| m.get(k).and_then(|v| v.into_value().ok()).and_then(|v| v.into_string().ok()).map(|s| s.to_string());
    (field("key")? == key).then(|| field("params").and_then(|p| serde_json::from_str(&p).ok()).unwrap_or_default())
}

/// The part `name` of the result asset `asset` links for `kind`.
pub fn part(asset: &str, kind: &str, name: &str) -> Option<Vec<u8>> {
    crate::db().part(&linked(asset, kind)?, name).ok().flatten().map(|b| b.to_vec())
}

/// The result doc of `kind` for asset `asset`: the one it links, or a new one, linked.
fn result(asset: &str, kind: &str) -> avendb::Result<String> {
    if let Some(id) = linked(asset, kind) {
        return Ok(id);
    }
    let db = crate::db();
    let name = db.meta(asset).map(|m| m.1).unwrap_or_default();
    let id = db.new("bake", &format!("{name} {kind}"))?;
    let doc = db.doc(asset)?;
    doc.get_map("derived").insert(kind, id.as_str()).map_err(|e| e.to_string())?;
    db.commit(asset, &doc)?;
    Ok(id)
}

/// Keeps part `name` of asset `asset`'s `kind` bake.
pub fn keep_part(asset: &str, kind: &str, name: &str, bytes: &[u8]) {
    if let Err(e) = result(asset, kind).and_then(|id| crate::db().set_part(&id, name, bytes)) {
        bevy::log::warn!("a bake's part could not be kept: {e}");
    }
}

/// Seals asset `asset`'s `kind` bake: every part kept, made under `key`, with its parameters.
pub fn seal(asset: &str, kind: &str, key: &str, params: &serde_json::Value) {
    let done = result(asset, kind).and_then(|id| {
        let db = crate::db();
        let doc = db.doc(&id)?;
        let m = doc.get_map("bake");
        m.insert("key", key).map_err(|e| e.to_string())?;
        m.insert("params", params.to_string()).map_err(|e| e.to_string())?;
        db.commit(&id, &doc)
    });
    match done {
        Ok(_) => bevy::log::info!("baked {kind} of {asset}, kept in avenDB"),
        Err(e) => bevy::log::warn!("a bake could not be sealed: {e}"),
    }
}
