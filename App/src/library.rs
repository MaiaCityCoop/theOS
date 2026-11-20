//! The asset library: every plant and rock a biome can place, each its own procedural recipe, kept as one JSON file
//! in `library/`. An asset is a generator (the code that makes the shape: `stone`, `clod`, `clover`...) and the
//! numbers it is made with: its size, its colours, its proportions. Nothing is modelled or scanned; a new seed is a
//! new individual of the same asset. A biome only says which assets grow where and how many (`biome.rs`).

use bevy::math::Vec3;
use bevy::mesh::{Mesh, MeshVertexAttribute, VertexAttributeValues, VertexFormat};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Asset {
    pub name: String,
    /// `rock` or `plant`.
    pub kind: String,
    /// The shape's generator, one of the names in `GENERATORS`.
    pub generator: String,
    /// Smallest and largest individual, in metres: the longest side of its bounding box, its height or its width
    /// across, whichever is greater (a tree's height, a stone's or a rosette's width). Every master comes out exactly
    /// this size (`master` fits it); the range lives here alone, never in a generator.
    pub size: [f32; 2],
    /// Its colour range, linear reflectance: each individual is somewhere between the two.
    pub colour: [[f32; 3]; 2],
    /// How flat (rocks: height over width).
    #[serde(default = "one")]
    pub flatness: f32,
    /// How many individuals its far view is baked from (intent 0050): every seed is drawn far off as one of them.
    /// One unless its silhouette varies enough from seed to seed to show.
    #[serde(default = "one_u32", skip_serializing_if = "is_one")]
    pub variants: u32,
    /// Its doc's id in theDB, where it has one.
    #[serde(skip)]
    pub id: Option<String>,
}

fn one_u32() -> u32 {
    1
}

fn is_one(n: &u32) -> bool {
    *n == 1
}

/// The seed of variant `v` of an asset's far view: fixed, so a bake reproduces.
pub fn variant_seed(v: u32) -> u32 {
    v + 1
}

/// The variant of the far view an individual of seed `seed` is drawn as.
pub fn variant_of(a: &Asset, seed: u32) -> u32 {
    let mut x = seed.wrapping_mul(0x9E37_79B1);
    x ^= x >> 16;
    x % a.variants.max(1)
}

/// The recipe's bytes, as a bake's key reads them: the recipe alone, not where it is kept.
pub fn recipe_bytes(a: &Asset) -> Vec<u8> {
    serde_json::to_vec(a).unwrap_or_default()
}

fn one() -> f32 {
    1.0
}

fn asset(name: &str, kind: &str, generator: &str, size: [f32; 2], a: [f32; 3], b: [f32; 3], flatness: f32) -> Asset {
    Asset { name: name.into(), kind: kind.into(), generator: generator.into(), size, colour: [a, b], flatness, variants: 1, id: None }
}

/// The built-in assets: what the library starts with (written to `library/` once, to be edited there).
pub fn builtin() -> Vec<Asset> {
    vec![
        asset("stone", "rock", "stone", [0.06, 0.25], [0.21, 0.20, 0.18], [0.15, 0.12, 0.09], 0.6),
        asset("pebble", "rock", "stone", [0.01, 0.05], [0.20, 0.19, 0.17], [0.13, 0.11, 0.08], 0.7),
        asset("clod", "rock", "clod", [0.02, 0.06], [0.07, 0.05, 0.035], [0.05, 0.036, 0.026], 0.55),
        asset("clover", "plant", "clover", [0.08, 0.12], [0.035, 0.10, 0.03], [0.045, 0.12, 0.035], 1.0),
        asset("plantain", "plant", "plantain", [0.18, 0.30], [0.04, 0.09, 0.025], [0.05, 0.11, 0.03], 1.0),
        asset("dandelion", "plant", "dandelion", [0.24, 0.40], [0.045, 0.11, 0.03], [0.055, 0.13, 0.035], 1.0),
        asset("moss", "plant", "moss", [0.12, 0.32], [0.03, 0.075, 0.015], [0.07, 0.11, 0.02], 1.0),
        // a square metre of blades: its size is the blades' reach over its edges, so the master stays the square metre
        // the lawn tiles (`lawn.rs`)
        asset("grass patch", "plant", "grass_patch", [PATCH, PATCH], [0.045, 0.120, 0.018], [0.100, 0.230, 0.035], 1.0),
        asset("grass tuft", "plant", "grass_tuft", [0.31, 0.33], [0.045, 0.120, 0.018], [0.100, 0.230, 0.035], 1.0),
        asset("seed head", "plant", "seed_head", [0.55, 0.95], [0.30, 0.24, 0.10], [0.20, 0.16, 0.08], 1.0),
        // a broadleaf tree, 8 to 16 m tall, its leaves a beech's or an oak's summer green
        asset("broadleaf", "plant", "tree", [8.0, 16.0], [0.050, 0.105, 0.025], [0.075, 0.140, 0.032], 1.0),
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

/// Every asset by name: the root's library, each asset a doc holding its recipe as JSON. A built-in asset the library
/// lacks is listed but not kept (the library is what the root names).
pub fn read() -> BTreeMap<String, Asset> {
    let db = crate::db();
    let mut all = BTreeMap::new();
    for id in &crate::root::root().library {
        if let Some(mut a) = db.file(id).ok().flatten().and_then(|b| serde_json::from_slice::<Asset>(&b).ok()) {
            a.id = Some(id.clone());
            all.insert(a.name.clone(), a);
        }
    }
    for a in builtin() {
        all.entry(a.name.clone()).or_insert(a);
    }
    all
}

/// A colour of an asset for the individual `r` (0 to 1).
pub fn colour(a: &Asset, r: f32) -> Vec3 {
    let (x, y) = (a.colour[0], a.colour[1]);
    Vec3::new(x[0] + (y[0] - x[0]) * r, x[1] + (y[1] - x[1]) * r, x[2] + (y[2] - x[2]) * r)
}

/// How much a vertex moves in the wind, 0 to 1, one Float32 per vertex: part of the master's contract (intent 0050).
/// A master has positions, normals and colours (linear reflectance), UVs where its generator gives them, and the wind
/// weight where its generator gives it; a master without it does not move in the wind (a rock): its weight is 0. The
/// impostor's wind channel and the wind shader read it.
pub const ATTRIBUTE_WIND: MeshVertexAttribute = MeshVertexAttribute::new("Wind", 0x7EE0_0050_0000_0001, VertexFormat::Float32);

/// A generator: grows the individual `seed` of an asset at the size and in the colour given (drawn by `master` from
/// the asset's ranges), standing at the origin, Y up, in metres. It reads its proportions from the asset and keeps no
/// size range of its own.
pub type Grow = fn(&Asset, u32, f32, Vec3) -> Mesh;

/// Every generator, by the module it lives in: the names it answers to, the function that grows them, and the module's
/// source. `master` grows through this list and the bake key hashes every source in it (`bakes::code`), so a generator
/// is never drawn without its code in the key: a new one is added here, and nowhere else.
pub const GENERATORS: [(&[&str], Grow, &str); 3] = [
    (&["stone", "clod"], crate::terrain::rock_master, include_str!("terrain.rs")),
    (&["clover", "plantain", "dandelion", "moss", "seed_head", "grass_patch", "grass_tuft"], crate::grass::plant_master, include_str!("grass.rs")),
    (&["tree"], crate::tree::tree_master, include_str!("tree.rs")),
];

/// The grass patch's size: its square metre and the blades reaching over its edges, as the master with seed 7 (the
/// lawn's) grows them, so fitting it leaves the square a metre.
const PATCH: f32 = 1.1002;

/// The size of an individual, `r` from 0 to 1 across the asset's range.
pub fn size(a: &Asset, r: f32) -> f32 {
    a.size[0] + (a.size[1] - a.size[0]) * r
}

/// The master of an asset: its one full-detail individual for `seed`, at the origin. Everything else (the field's
/// copies, its far views) is made from this. Its size and colour are drawn from the asset's ranges, its generator
/// grows it at that size, and it is then fitted to it exactly: scaled about its foot so the longest side of its
/// bounding box is the size, whatever the generator's own shape gave.
pub fn master(a: &Asset, seed: u32) -> Mesh {
    let r = |k: u32| {
        let mut x = seed.wrapping_mul(0x9E37_79B1) ^ k.wrapping_mul(0x85EB_CA77);
        x ^= x >> 15;
        x = x.wrapping_mul(0x2C1B_3C6D);
        x ^= x >> 13;
        (x >> 8) as f32 / (1u32 << 24) as f32
    };
    let (col, size) = (colour(a, r(1)), size(a, r(2)));
    let Some((_, grow, _)) = GENERATORS.iter().find(|g| g.0.contains(&a.generator.as_str())) else {
        bevy::log::warn!("{}: no generator {}", a.name, a.generator);
        return Mesh::new(bevy::mesh::PrimitiveTopology::TriangleList, bevy::asset::RenderAssetUsages::RENDER_WORLD);
    };
    let mut mesh = grow(a, seed, size, col);
    if let Some(VertexAttributeValues::Float32x3(p)) = mesh.attribute_mut(Mesh::ATTRIBUTE_POSITION) {
        let longest = extent(p).max_element();
        if longest > 1e-6 {
            let k = size / longest;
            p.iter_mut().for_each(|v| *v = [v[0] * k, v[1] * k, v[2] * k]);
        }
    }
    mesh
}

/// The sides of the bounding box of points.
pub fn extent(p: &[[f32; 3]]) -> Vec3 {
    let (lo, hi) = p.iter().fold((Vec3::MAX, Vec3::MIN), |(lo, hi), v| (lo.min(Vec3::from(*v)), hi.max(Vec3::from(*v))));
    (hi - lo).max(Vec3::ZERO)
}

/// How many triangles a mesh has.
pub fn triangles(m: &Mesh) -> usize {
    m.indices().map(|i| i.len() / 3).unwrap_or(0)
}


#[cfg(test)]
mod tests {
    use super::*;

    /// Every built-in asset has a generator, and its masters come out its size: the longest side of their bounding
    /// box within the asset's range.
    #[test]
    fn every_master_comes_out_its_size() {
        for a in builtin() {
            for seed in 1..=if a.generator == "tree" { 2 } else { 12 } {
                let m = master(&a, seed);
                let Some(VertexAttributeValues::Float32x3(p)) = m.attribute(Mesh::ATTRIBUTE_POSITION) else { panic!("{}: no positions", a.name) };
                let longest = extent(p).max_element();
                println!("{} seed {seed}: {longest:.3} m", a.name);
                assert!(longest >= a.size[0] * 0.999 && longest <= a.size[1] * 1.001, "{} seed {seed}: {longest} m, not in {:?}", a.name, a.size);
            }
        }
    }

    /// The grass patch stays the square metre the lawn tiles: fitting its master scales it by almost exactly 1.
    #[test]
    fn grass_patch_stays_a_square_metre() {
        let a = builtin().into_iter().find(|a| a.generator == "grass_patch").unwrap();
        let grown = crate::grass::plant_master(&a, 7, PATCH, colour(&a, 0.5));
        let Some(VertexAttributeValues::Float32x3(p)) = grown.attribute(Mesh::ATTRIBUTE_POSITION) else { panic!() };
        let longest = extent(p).max_element();
        println!("grass patch seed 7 grows {longest:.5} m");
        assert!((longest / PATCH - 1.0).abs() < 1e-3, "the patch grows {longest} m: PATCH is {PATCH}");
    }
}
