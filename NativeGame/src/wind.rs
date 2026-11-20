//! The wind in the grass: a material extension that moves each blade in its vertex shader
//! (`assets/shaders/grass_wind*.wesl`), so the blades, their shadows and their motion move together.

use bevy::pbr::{ExtendedMaterial, MaterialExtension};
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::shader::ShaderRef;

/// The grass's material: Bevy's standard one, with the wind.
pub type Grass = ExtendedMaterial<StandardMaterial, Wind>;

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct Wind {
    #[uniform(100)]
    pub params: WindParams,
}

#[derive(ShaderType, Clone, Copy, Debug, Default)]
pub struct WindParams {
    /// x: the time, y: the time a frame ago, z: the strength (0 calm to about 1.5 a storm), w: unused.
    pub params: Vec4,
    /// xyz: the eye; w: 1 for the close layer (fine blades that sink into the ground away from the eye).
    pub eye: Vec4,
    /// The biome's grass: its deepest green and its shortest height (w), its lightest green and how much taller (w).
    pub deep: Vec4,
    pub light: Vec4,
}

impl MaterialExtension for Wind {
    fn vertex_shader() -> ShaderRef {
        "shaders/grass_wind.wesl".into()
    }
    fn prepass_vertex_shader() -> ShaderRef {
        "shaders/grass_wind_prepass.wesl".into()
    }
}

/// How hard the wind blows, 0 calm to `MAX` a storm; the Meadow's slider and `-` `=` change it.
#[derive(Resource)]
pub struct Strength(pub f32);

pub const MAX: f32 = 2.5;

pub fn plugin(app: &mut App) {
    app.add_plugins((MaterialPlugin::<Grass>::default(), MaterialPlugin::<Ground>::default())).insert_resource(Strength(1.4)).add_systems(Update, blow);
}

fn blow(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut strength: ResMut<Strength>,
    mut grass: ResMut<Assets<Grass>>,
    eye: Query<&GlobalTransform, With<crate::meadow::Eye2>>,
) {
    let at = eye.single().map(|g| g.translation()).unwrap_or_default();
    if keys.pressed(KeyCode::Equal) {
        strength.0 = (strength.0 + time.delta_secs()).min(MAX);
    }
    if keys.pressed(KeyCode::Minus) {
        strength.0 = (strength.0 - time.delta_secs()).max(0.0);
    }
    let (now, before) = (time.elapsed_secs(), time.elapsed_secs() - time.delta_secs());
    for (_, m) in grass.iter_mut() {
        m.extension.params.params = Vec4::new(now, before, strength.0, 0.0);
        m.extension.params.eye = at.extend(m.extension.params.eye.w);
    }
}

/// The ground's material: Bevy's standard one, its colour composed per pixel from the biome (`ground.wesl`).
pub type Ground = ExtendedMaterial<StandardMaterial, GroundLook>;

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct GroundLook {
    #[uniform(100)]
    pub biome: crate::biome::BiomeUniform,
    /// x: 1 once the lawn is baked; y: its slab top.
    #[uniform(101)]
    pub lawn: Vec4,
    #[texture(102)]
    #[sampler(103)]
    pub lawn_albedo: Option<Handle<Image>>,
    #[texture(104)]
    #[sampler(105)]
    pub lawn_height: Option<Handle<Image>>,
    /// xyz: toward the sun (for the lawn's shadows among its own blades).
    #[uniform(106)]
    pub sun: Vec4,
}

impl MaterialExtension for GroundLook {
    fn fragment_shader() -> ShaderRef {
        "shaders/ground.wesl".into()
    }
}
