//! The wind in the grass: a material extension that moves each blade in its vertex shader
//! (`assets/shaders/grass_wind*.wesl`), so the blades, their shadows and their motion move together. And the wind in
//! the assets' masters (`Master`), by the same function as their far copies (`impostor.rs`).

use bevy::mesh::MeshVertexBufferLayoutRef;
use bevy::pbr::{ExtendedMaterial, MaterialExtension, MaterialExtensionKey, MaterialExtensionPipeline};
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, RenderPipelineDescriptor, ShaderType, SpecializedMeshPipelineError};
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
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.grass_wind).into())
    }
    fn prepass_vertex_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.grass_wind_prepass).into())
    }
}

/// How hard the wind blows, 0 calm to `MAX` a storm; the Meadow's slider and `-` `=` change it.
#[derive(Resource)]
pub struct Strength(pub f32);

pub const MAX: f32 = 2.5;

pub fn plugin(app: &mut App) {
    app.add_plugins((MaterialPlugin::<Grass>::default(), MaterialPlugin::<Ground>::default(), MaterialPlugin::<Master>::default()))
        .insert_resource(Strength(1.4))
        .add_systems(Update, blow);
}

/// Gives the grass, the masters and their far copies the wind of this frame: one time and one strength for all, set
/// here once, so a master and its far copy never differ by a frame (F in the Library shows no jump in motion).
pub fn blow(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut strength: ResMut<Strength>,
    mut grass: ResMut<Assets<Grass>>,
    mut masters: ResMut<Assets<Master>>,
    mut impostors: ResMut<Assets<crate::impostor::Impostor>>,
    eye: Query<&GlobalTransform, With<crate::meadow::Eye2>>,
) {
    let at = eye.single().map(|g| g.translation()).unwrap_or_default();
    if keys.pressed(KeyCode::Equal) {
        strength.0 = (strength.0 + time.delta_secs()).min(MAX);
    }
    if keys.pressed(KeyCode::Minus) {
        strength.0 = (strength.0 - time.delta_secs()).max(0.0);
    }
    let now = now(&time, &strength);
    for (_, m) in grass.iter_mut() {
        m.extension.params.params = now;
        m.extension.params.eye = at.extend(m.extension.params.eye.w);
    }
    for (_, m) in masters.iter_mut() {
        m.extension.params.params = now;
    }
    for (_, m) in impostors.iter_mut() {
        m.wind.params = now;
    }
}

/// The wind's `params` this frame: the time, the time a frame ago, the strength. The grass, the masters and their far
/// copies take the same, so they sway together.
pub fn now(time: &Time, strength: &Strength) -> Vec4 {
    Vec4::new(time.elapsed_secs(), time.elapsed_secs() - time.delta_secs(), strength.0, 0.0)
}

/// A master as it is drawn (the Library's turntable): Bevy's standard material, its vertices moved by the wind's one
/// function, `bend` in the wind doc, over a bending length of its wind weight (`library::ATTRIBUTE_WIND`) times its
/// height above its foot: the rule its far copy follows (`impostor.wesl`), with the same uniforms (`blow`), so master
/// and far copy move as one. Its mesh must carry the wind weight (`library::with_wind` gives zeros where none).
pub type Master = ExtendedMaterial<StandardMaterial, Sway>;

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug, Default)]
pub struct Sway {
    #[uniform(100)]
    pub params: WindParams,
}

impl MaterialExtension for Sway {
    fn vertex_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.master_wind).into())
    }
    // the depth, normal and motion prepass and the shadows move the master as the main pass does: the same doc
    fn prepass_vertex_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.master_wind).into())
    }
    fn specialize(
        _pipeline: &MaterialExtensionPipeline,
        descriptor: &mut RenderPipelineDescriptor,
        layout: &MeshVertexBufferLayoutRef,
        _key: MaterialExtensionKey<Self>,
    ) -> Result<(), SpecializedMeshPipelineError> {
        // the wind weight joins the attributes Bevy laid out for this pass, at a location neither the main pass
        // (0 to 7) nor the prepass (0 to 7) uses
        let wind = layout.0.get_layout(&[crate::library::ATTRIBUTE_WIND.at_shader_location(8)])?;
        if let Some(buffer) = descriptor.vertex.buffers.first_mut() {
            buffer.attributes.extend(wind.attributes);
        }
        // the doc holds both passes' vertex shaders: each pipeline names its own (left unnamed, a module with two
        // vertex entry points is refused by the GPU's validation); the prepass's pipeline (and the shadows') is the one
        // Bevy gives the def PREPASS_PIPELINE
        let prepass = descriptor.vertex.shader_defs.iter().any(|d| d == &"PREPASS_PIPELINE".into());
        descriptor.vertex.entry_point = Some(if prepass { "prepass_vertex" } else { "vertex" }.into());
        Ok(())
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
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.ground).into())
    }
}
