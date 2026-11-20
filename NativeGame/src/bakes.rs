//! Bakes made once (intent 0049): a bake's result is kept in avenDB, keyed by the hash of everything it is made from
//! (the master mesh, the bake's settings, the shaders it draws with, and the engine's own bake code), so the next start
//! reads it and bakes nothing. A change to any of those makes a new key, and the bake runs again.

use bevy::mesh::{Indices, Mesh};

/// The bake code's own version: raised when a bake's code changes in a way its inputs do not show.
const BAKE_CODE: &str = "0049.1";

/// The key of a bake: BLAKE3 of the bake code's version, the inputs given, and the current versions of the shader
/// docs named.
pub fn key(kind: &str, inputs: &[&[u8]], shaders: &[&str]) -> String {
    let db = crate::db();
    let mut all: Vec<u8> = Vec::new();
    for part in [BAKE_CODE.as_bytes(), kind.as_bytes()].into_iter().chain(inputs.iter().copied()) {
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
