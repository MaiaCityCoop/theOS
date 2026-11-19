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
}

fn layer(name: &str, colour: [f32; 3], roughness: f32, cell: f32, threshold: f32, softness: f32, amount: f32) -> Layer {
    Layer { name: name.into(), colour, roughness, cell, threshold, softness, amount }
}

impl Biome {
    /// A temperate meadow, grazed: a dense sward, its dead litter and moss, here and there bare soil.
    pub fn meadow() -> Self {
        Biome {
            name: "meadow".into(),
            layers: vec![
                layer("sward", [0.060, 0.140, 0.024], 0.9, 1.0, 0.0, 1.0, 1.0),
                layer("lush", [0.070, 0.150, 0.028], 0.9, 60.0, 0.45, 0.35, 1.0),
                layer("dry", [0.115, 0.120, 0.050], 0.95, 1900.0, 0.55, 0.30, 0.6),
                layer("litter", [0.140, 0.115, 0.065], 0.95, 0.7, 0.55, 0.25, 0.5),
                layer("moss", [0.035, 0.070, 0.018], 0.8, 2.1, 0.60, 0.20, 0.6),
                layer("damp", [0.045, 0.060, 0.025], 0.7, 3.0, 0.62, 0.20, 0.4),
                // where the grass is gone: trodden loam (the grass's `bare` reads this same noise)
                layer("bare", [0.100, 0.075, 0.052], 1.0, 16.0, 0.76, 0.06, 1.0),
            ],
            relief: 0.6,
            mottle: 0.35,
            grass: Grass { deep: [0.045, 0.120, 0.018], light: [0.100, 0.230, 0.035], height: 0.12, height_range: 0.33 },
        }
    }

    /// The recipe as the shaders read it.
    pub fn uniform(&self) -> BiomeUniform {
        let mut u = BiomeUniform::default();
        for (k, l) in self.layers.iter().take(LAYERS).enumerate() {
            u.colours[k] = Vec4::new(l.colour[0], l.colour[1], l.colour[2], l.roughness);
            u.rules[k] = Vec4::new(l.cell, l.threshold, l.softness, l.amount);
        }
        u.micro = Vec4::new(self.relief, self.mottle, 0.0, self.layers.len().min(LAYERS) as f32);
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
