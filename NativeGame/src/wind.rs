//! The wind in the grass: a material extension that moves each blade in its vertex shader
//! (`assets/shaders/grass_wind*.wesl`), so the blades, their shadows and their motion move together.

use bevy::pbr::{ExtendedMaterial, MaterialExtension};
use bevy::prelude::*;
use bevy::render::render_resource::AsBindGroup;
use bevy::shader::ShaderRef;

/// The grass's material: Bevy's standard one, with the wind.
pub type Grass = ExtendedMaterial<StandardMaterial, Wind>;

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct Wind {
    /// x: the time, y: the time a frame ago, z: the strength (0 calm to about 1.5 a storm), w: unused.
    #[uniform(100)]
    pub params: Vec4,
}

impl MaterialExtension for Wind {
    fn vertex_shader() -> ShaderRef {
        "shaders/grass_wind.wesl".into()
    }
    fn prepass_vertex_shader() -> ShaderRef {
        "shaders/grass_wind_prepass.wesl".into()
    }
}

/// How hard the wind blows; `-` and `=` change it.
#[derive(Resource)]
pub struct Strength(pub f32);

pub fn plugin(app: &mut App) {
    app.add_plugins(MaterialPlugin::<Grass>::default()).insert_resource(Strength(0.8)).add_systems(Update, blow);
}

fn blow(time: Res<Time>, keys: Res<ButtonInput<KeyCode>>, mut strength: ResMut<Strength>, mut grass: ResMut<Assets<Grass>>) {
    if keys.pressed(KeyCode::Equal) {
        strength.0 = (strength.0 + time.delta_secs()).min(1.6);
    }
    if keys.pressed(KeyCode::Minus) {
        strength.0 = (strength.0 - time.delta_secs()).max(0.0);
    }
    let (now, before) = (time.elapsed_secs(), time.elapsed_secs() - time.delta_secs());
    for (_, m) in grass.iter_mut() {
        m.extension.params = Vec4::new(now, before, strength.0, 0.0);
    }
}
