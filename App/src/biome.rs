//! Biomes: a place's whole look as one recipe, data and not code, so a meadow, a forest floor, a beach or a moor is a
//! different file and not a different program. A recipe has
//!
//! - **ground layers**: materials laid one over the other (a sward, litter, moss, bare soil), each where its own
//!   noise rises over a threshold, softly; the ground shader (`assets/shaders/ground.wesl`) composes them per pixel,
//!   with relief and a fine mottle, so nothing is a texture and nothing repeats;
//! - **grass**: its greens and its heights, read by the GPU grass (`wind.wesl`, `blade`);
//! - later, the other plants and the scatter (stones, twigs, leaves), by the same pattern.
//!
//! Every value is physical: colours are linear reflectances, sizes are metres. A recipe is kept as JSON in `biomes/`.

use bevy::prelude::*;
use bevy::render::render_resource::ShaderType;
use serde::{Deserialize, Serialize};

/// How many ground layers a recipe can have (the shader's arrays).
pub const LAYERS: usize = 8;

/// One ground material: what it looks like and where it lies.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Layer {
    pub name: String,
    /// Linear reflectance.
    pub colour: [f32; 3],
    pub roughness: f32,
    /// The size of its patches, in metres (the largest of three octaves of noise).
    pub cell: f32,
    /// Where the noise rises over this (0 to 1), the layer begins to show...
    pub threshold: f32,
    /// ...and over this much more it covers fully.
    pub softness: f32,
    /// How much it covers where it does, 0 to 1.
    pub amount: f32,
    /// Whether grass grows on it (a sandy or earthy patch: no). The grass leaves out the first layer that says no.
    #[serde(default = "yes")]
    pub grass: bool,
}

fn yes() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Grass {
    /// The deepest and the lightest green of a blade, linear reflectance.
    pub deep: [f32; 3],
    pub light: [f32; 3],
    /// The shortest blade and how much taller the tallest are, metres.
    pub height: f32,
    pub height_range: f32,
}

/// Where a library asset (`library.rs`) is placed in this biome: how many to the square metre near the eye, and on
/// which ground (`any`, `grass`: where grass grows, `open`: on the patches without).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Place {
    pub asset: String,
    pub per_m2: f32,
    #[serde(default = "any")]
    pub on: String,
}

fn any() -> String {
    "any".into()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Biome {
    pub name: String,
    /// The first layer covers all; each next one lies over those before it. Layer 6 is where the ground is bare:
    /// the grass leaves it out.
    pub layers: Vec<Layer>,
    /// The ground's fine relief (bumps and grooves of a few centimetres) and its fine mottle, 0 to 1.
    pub relief: f32,
    pub mottle: f32,
    pub grass: Grass,
    /// The plants and rocks of this biome: library assets, placed.
    pub places: Vec<Place>,
}

static CURRENT: std::sync::RwLock<Option<Biome>> = std::sync::RwLock::new(None);

/// The biome the land is being made from (set when a scene opens; the meadow until then).
pub fn current() -> Biome {
    CURRENT.read().ok().and_then(|b| b.clone()).unwrap_or_else(Biome::meadow)
}

pub fn set(b: Biome) {
    if let Ok(mut c) = CURRENT.write() {
        *c = Some(b);
    }
    GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
}

/// How many times the biome was set: what reads it (the shared shader module) writes itself again when this moves.
pub fn generation() -> u64 {
    GENERATION.load(std::sync::atomic::Ordering::Relaxed)
}

static GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

impl Biome {
    /// Per square metre of an asset (0 if the recipe does not place it).
    pub fn per_m2(&self, asset: &str) -> f32 {
        self.places.iter().filter(|p| p.asset == asset).map(|p| p.per_m2).sum()
    }
}

fn layer(name: &str, colour: [f32; 3], roughness: f32, cell: f32, threshold: f32, softness: f32, amount: f32) -> Layer {
    Layer { name: name.into(), colour, roughness, cell, threshold, softness, amount, grass: true }
}

fn place(asset: &str, per_m2: f32, on: &str) -> Place {
    Place { asset: asset.into(), per_m2, on: on.into() }
}

impl Biome {
    /// A temperate meadow, grazed: a dense sward, its dead litter and moss, here and there bare soil.
    pub fn meadow() -> Self {
        Biome {
            name: "meadow".into(),
            layers: vec![
                layer("sward", [0.038, 0.088, 0.018], 0.9, 1.0, 0.0, 1.0, 1.0),
                layer("lush", [0.070, 0.150, 0.028], 0.9, 60.0, 0.45, 0.35, 1.0),
                layer("dry", [0.115, 0.120, 0.050], 0.95, 1900.0, 0.55, 0.30, 0.6),
                layer("litter", [0.140, 0.115, 0.065], 0.95, 0.7, 0.55, 0.25, 0.5),
                layer("moss", [0.035, 0.070, 0.018], 0.8, 2.1, 0.60, 0.20, 0.6),
                layer("damp", [0.045, 0.060, 0.025], 0.7, 3.0, 0.62, 0.20, 0.4),
                // sandy, earthy patches where no grass grows: open ground of sand and loam, with cracks and pebbles
                // (the grass's `bare` reads this same noise)
                Layer {
                    grass: false,
                    ..layer("sandy earth", [0.13, 0.10, 0.068], 1.0, 16.0, 0.74, 0.06, 1.0)
                },
            ],
            relief: 0.6,
            mottle: 0.35,
            grass: Grass { deep: [0.045, 0.120, 0.018], light: [0.100, 0.230, 0.035], height: 0.12, height_range: 0.33 },
            places: vec![
                place("clover", 2.5, "grass"),
                place("plantain", 1.0, "grass"),
                place("dandelion", 1.0, "grass"),
                place("moss", 1.5, "grass"),
                place("seed head", 4.0, "grass"),
                place("clod", 6.0, "any"),
                place("pebble", 14.0, "open"),
                place("stone", 0.8, "open"),
                place("stone", 0.05, "grass"),
            ],
        }
    }

    /// The recipe as the shaders read it.
    pub fn uniform(&self) -> BiomeUniform {
        let mut u = BiomeUniform::default();
        for (k, l) in self.layers.iter().take(LAYERS).enumerate() {
            u.colours[k] = Vec4::new(l.colour[0], l.colour[1], l.colour[2], l.roughness);
            u.rules[k] = Vec4::new(l.cell, l.threshold, l.softness, l.amount);
        }
        // which layer is bare ground (cracks, pebbles, grains show there)
        let bare = self.layers.iter().position(|l| !l.grass).unwrap_or(LAYERS) as f32;
        u.micro = Vec4::new(self.relief, self.mottle, bare, self.layers.len().min(LAYERS) as f32);
        u
    }
}

#[derive(ShaderType, Clone, Copy, Debug, Default)]
pub struct BiomeUniform {
    /// Each layer's colour (rgb) and roughness (a).
    pub colours: [Vec4; LAYERS],
    /// Each layer's cell, threshold, softness and amount.
    pub rules: [Vec4; LAYERS],
    /// x: relief, y: mottle, w: how many layers.
    pub micro: Vec4,
}
