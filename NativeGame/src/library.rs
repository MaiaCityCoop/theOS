//! The asset library: every plant and rock a biome can place, each its own procedural recipe, kept as one JSON file
//! in `library/`. An asset is a generator (the code that makes the shape: `stone`, `clod`, `clover`...) and the
//! numbers it is made with: its size, its colours, its proportions. Nothing is modelled or scanned; a new seed is a
//! new individual of the same asset. A biome only says which assets grow where and how many (`biome.rs`).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The library's docs in avenDB: one flat doc an asset, `<name>.asset` (its recipe, as JSON).
pub const KIND: &str = ".asset";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Asset {
    pub name: String,
    /// `rock` or `plant`.
    pub kind: String,
    /// The shape's generator: `stone`, `clod` (in `terrain.rs`); `clover`, `plantain`, `dandelion`, `moss`,
    /// `seed_head` (in `grass.rs`).
    pub generator: String,
    /// Smallest and largest, metres across.
    pub size: [f32; 2],
    /// Its colour range, linear reflectance: each individual is somewhere between the two.
    pub colour: [[f32; 3]; 2],
    /// How flat (rocks: height over width).
    #[serde(default = "one")]
    pub flatness: f32,
}

fn one() -> f32 {
    1.0
}

fn asset(name: &str, kind: &str, generator: &str, size: [f32; 2], a: [f32; 3], b: [f32; 3], flatness: f32) -> Asset {
    Asset { name: name.into(), kind: kind.into(), generator: generator.into(), size, colour: [a, b], flatness }
}

/// The built-in assets: what the library starts with (written to `library/` once, to be edited there).
pub fn builtin() -> Vec<Asset> {
    vec![
        asset("stone", "rock", "stone", [0.06, 0.25], [0.21, 0.20, 0.18], [0.15, 0.12, 0.09], 0.6),
        asset("pebble", "rock", "stone", [0.01, 0.05], [0.20, 0.19, 0.17], [0.13, 0.11, 0.08], 0.7),
        asset("clod", "rock", "clod", [0.02, 0.06], [0.07, 0.05, 0.035], [0.05, 0.036, 0.026], 0.55),
        asset("clover", "plant", "clover", [0.10, 0.20], [0.035, 0.10, 0.03], [0.045, 0.12, 0.035], 1.0),
        asset("plantain", "plant", "plantain", [0.18, 0.30], [0.04, 0.09, 0.025], [0.05, 0.11, 0.03], 1.0),
        asset("dandelion", "plant", "dandelion", [0.24, 0.40], [0.045, 0.11, 0.03], [0.055, 0.13, 0.035], 1.0),
        asset("moss", "plant", "moss", [0.12, 0.32], [0.03, 0.075, 0.015], [0.07, 0.11, 0.02], 1.0),
        asset("grass patch", "plant", "grass_patch", [1.0, 1.0], [0.045, 0.120, 0.018], [0.100, 0.230, 0.035], 1.0),
        asset("grass tuft", "plant", "grass_tuft", [0.12, 0.45], [0.045, 0.120, 0.018], [0.100, 0.230, 0.035], 1.0),
        asset("seed head", "plant", "seed_head", [0.55, 0.95], [0.30, 0.24, 0.10], [0.20, 0.16, 0.08], 1.0),
    ]
}

/// Every asset by name, read once per run (`read` reads the folder again).
pub fn load() -> BTreeMap<String, Asset> {
    static ONCE: std::sync::OnceLock<BTreeMap<String, Asset>> = std::sync::OnceLock::new();
    ONCE.get_or_init(read).clone()
}

/// The shelf's order: grouped by kind (plants, then rocks), by name within each. The Library's list and its stepping
/// both use it, so a place on the list is the same asset everywhere.
pub fn shelf() -> Vec<Asset> {
    let mut all: Vec<Asset> = load().into_values().collect();
    all.sort_by(|a, b| a.kind.cmp(&b.kind).then_with(|| a.name.cmp(&b.name)));
    all
}

/// Every asset by name: the docs `<name>.asset` in avenDB, and any built-in one that has no doc yet (then
/// kept there).
pub fn read() -> BTreeMap<String, Asset> {
    let db = crate::db();
    let parse = |id: &str| db.file(id).ok().flatten().and_then(|b| serde_json::from_slice::<Asset>(&b).ok());
    let mut all = BTreeMap::new();
    for a in builtin() {
        let id = format!("{}{KIND}", a.name.replace(' ', "-"));
        let a = parse(&id).unwrap_or_else(|| {
            let _ = db.set_file(&id, (serde_json::to_string_pretty(&a).unwrap_or_default() + "\n").as_bytes());
            a
        });
        all.insert(a.name.clone(), a);
    }
    for (id, _) in db.docs().unwrap_or_default() {
        if id.ends_with(KIND)
            && let Some(a) = parse(&id)
        {
            all.entry(a.name.clone()).or_insert(a);
        }
    }
    all
}

/// A colour of an asset for the individual `r` (0 to 1).
pub fn colour(a: &Asset, r: f32) -> bevy::math::Vec3 {
    let (x, y) = (a.colour[0], a.colour[1]);
    bevy::math::Vec3::new(x[0] + (y[0] - x[0]) * r, x[1] + (y[1] - x[1]) * r, x[2] + (y[2] - x[2]) * r)
}

/// The master of an asset: its one full-detail individual for `seed`, at the origin. Everything else (the field's
/// copies, its far views) is made from this.
pub fn master(a: &Asset, seed: u32) -> bevy::prelude::Mesh {
    let r = |k: u32| {
        let mut x = seed.wrapping_mul(0x9E37_79B1) ^ k.wrapping_mul(0x85EB_CA77);
        x ^= x >> 15;
        x = x.wrapping_mul(0x2C1B_3C6D);
        x ^= x >> 13;
        (x >> 8) as f32 / (1u32 << 24) as f32
    };
    let col = colour(a, r(1));
    if a.kind == "rock" {
        let size = a.size[0] + (a.size[1] - a.size[0]) * r(2);
        crate::terrain::rock_master(&a.generator, size, col, a.flatness, seed)
    } else {
        crate::grass::plant_master(&a.generator, seed, col)
    }
}

/// How many triangles a mesh has.
pub fn triangles(m: &bevy::prelude::Mesh) -> usize {
    m.indices().map(|i| i.len() / 3).unwrap_or(0)
}
