//! What Rust and the shaders both compute, defined once: the land's shape, its hash and noise and where it is bare
//! (`terrain.rs`), the GPU grass's levels (`meadow.rs`, `grass.rs`) and the lawn's views (`lawn.rs`). This module
//! writes them as a WESL module of their own, `package::shared`, which the shader docs import; nothing is copied by
//! hand into a shader.

use bevy::prelude::*;
use bevy::shader::Shader;

/// The module's asset path: the shaders import it as `package::shared`.
const PATH: &str = "shared.wesl";

/// Keeps the module loaded.
#[derive(Resource)]
struct Module(#[allow(dead_code)] Handle<Shader>);

pub fn plugin(app: &mut App) {
    let handle = app.world_mut().resource_mut::<Assets<Shader>>().add(Shader::from_wesl(wgsl(), PATH));
    app.insert_resource(Module(handle)).add_systems(Update, follow_biome);
}

/// The module reads the biome (where the ground is bare): when a scene sets another biome, it is written again, and
/// the shaders that import it are made again with it.
fn follow_biome(module: Res<Module>, mut shaders: ResMut<Assets<Shader>>, mut seen: Local<u64>) {
    let now = crate::biome::generation();
    if *seen != now {
        *seen = now;
        if let Some(mut s) = shaders.get_mut(&module.0) {
            *s = Shader::from_wesl(wgsl(), PATH);
        }
    }
}

/// The module's source.
pub fn wgsl() -> String {
    use crate::lawn::{AZIMUTHS, RES, SLOPES};
    use crate::meadow::{FINE, LEVELS, REACH};
    let slopes = SLOPES.iter().map(|s| format!("{s:?}")).collect::<Vec<_>>().join(", ");
    let side = crate::grass::SIDE;
    format!(
        "// Written by NativeGame (`src/shared.rs`) from its own constants and functions: change them there.

// The GPU grass (`meadow.rs`, `grass.rs`): the finest level's cell in metres, how many levels, how far a level reaches
// in its cells, and how far a vertex sits from its cell's centre for each side of its blade, in cells.
const FINE: f32 = {FINE:?};
const LEVELS: u32 = {LEVELS}u;
const REACH: f32 = {REACH:?};
const SIDE: f32 = {side:?};

// The baked lawn (`lawn.rs`): its azimuths, its slopes in degrees, each view's texels over its 1 m tile.
const LAWN_AZIMUTHS: u32 = {AZIMUTHS}u;
const LAWN_SLOPE_COUNT: u32 = {n}u;
const LAWN_SLOPES = array<f32, {n}>({slopes});
const LAWN_RES: f32 = {res:?};

{terrain}",
        n = SLOPES.len(),
        res = RES as f32,
        terrain = crate::terrain::wgsl(),
    )
}

#[cfg(test)]
mod tests {
    /// The table the land is now written from gives the land it was, bit for bit.
    #[test]
    fn the_land_is_unchanged() {
        let was = |x: f32, z: f32| {
            22.0 * (0.0011 * x + 0.3).sin() * (0.0013 * z + 1.7).cos()
                + 9.0 * (0.0031 * x - 0.0024 * z + 0.9).sin()
                + 4.0 * (0.0110 * x + 0.7).sin() * (0.0093 * z - 1.1).cos()
                + 2.5 * (0.0057 * x + 0.0043 * z + 2.0).sin()
                + 0.45 * (0.071 * x - 0.052 * z + 0.3).sin() * (0.048 * x + 0.083 * z + 1.9).sin()
                + 0.25 * (0.15 * x + 0.11 * z + 4.0).sin()
        };
        for i in 0..400 {
            let (x, z) = (i as f32 * 37.3 - 7000.0, i as f32 * -21.9 + 3000.0);
            assert_eq!(crate::terrain::big(x, z).to_bits(), was(x, z).to_bits(), "at {x}, {z}");
        }
    }

    /// The module holds what the shaders import from it.
    #[test]
    fn the_module_declares_what_the_shaders_import() {
        let w = super::wgsl();
        for name in [
            "const FINE: f32 = 0.04;",
            "const LEVELS: u32 = 4u;",
            "const REACH: f32 = 110.0;",
            "const SIDE: f32 = 0.25;",
            "const LAWN_AZIMUTHS: u32 = 16u;",
            "const LAWN_SLOPE_COUNT: u32 = 6u;",
            "const LAWN_SLOPES = array<f32, 6>(8.0, 12.0, 18.0, 27.0, 40.0, 62.0);",
            "const LAWN_RES: f32 = 192.0;",
            "fn ground(",
            "fn thash(",
            "fn tnoise(",
            "fn land(",
            "fn fbm(",
            "fn bare(",
            "0.0031 * p.x - 0.0024 * p.y + 0.9",
            "0x8da6b343u",
            "/ 16777216.0",
            "fbm(p, 16.0, 20u) - 0.74) / 0.06",
        ] {
            assert!(w.contains(name), "missing `{name}` in\n{w}");
        }
    }
}
