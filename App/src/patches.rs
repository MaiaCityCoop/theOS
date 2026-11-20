//! The meadow's mid and far sward as baked patches: the library's grass patch (a square metre of real blades) baked
//! once into its far views, then drawn as GPU-placed quads in two levels around the eye (1 m patches out to ~50 m,
//! 2 m patches to ~100 m), past the real blades. Generic: any baked asset can be scattered the same way.

use bevy::pbr::{Material, MaterialPlugin};
use bevy::prelude::*;
use bevy::render::render_resource::AsBindGroup;
use bevy::shader::ShaderRef;

/// Patch slots along a side of a tile.
pub const TILE: u32 = 32;

pub fn plugin(app: &mut App) {
    app.add_plugins(MaterialPlugin::<PatchField>::default()).add_systems(Startup, bake_at_start);
}

/// The grass patch's far views, baked once when the app starts: before any scene's sky exists, which the bake's
/// cameras would otherwise see behind the patch (and keep as solid squares).
#[derive(Resource, Clone)]
pub struct PatchBake(pub crate::impostor::Baked);

fn bake_at_start(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut images: ResMut<Assets<Image>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut passes: ResMut<Assets<crate::impostor::BakePass>>,
) {
    let library = crate::library::load();
    if let Some(asset) = library.get("grass patch") {
        let baked = crate::impostor::bake(&mut commands, asset, &mut meshes, &mut images, &mut materials, &mut passes);
        commands.insert_resource(PatchBake(baked));
    }
}

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct PatchField {
    #[uniform(0)]
    pub params: crate::impostor::ImpostorParams,
    #[texture(1)]
    #[sampler(2)]
    pub albedo: Handle<Image>,
    #[texture(3)]
    #[sampler(4)]
    pub normal: Handle<Image>,
}

impl Material for PatchField {
    fn vertex_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.patch_field).into())
    }
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.patch_field).into())
    }
    fn enable_prepass() -> bool {
        false
    }
    fn enable_shadows() -> bool {
        false
    }
}

impl PatchField {
    /// `begin`: where the first level's patches start, metres from the eye.
    pub fn of(b: &crate::impostor::Baked, begin: f32) -> Self {
        PatchField {
            params: crate::impostor::ImpostorParams { sphere: b.centre.extend(b.radius), grid: Vec4::new(crate::impostor::FRAMES as f32, begin, 0.0, 0.0) },
            albedo: b.variants[0].albedo.clone(),
            normal: b.variants[0].normal.clone(),
        }
    }
}

/// A tile of patch slots: each slot a quad, its position the slot's centre (in cells), its UV the quad's corner.
pub fn tile() -> Mesh {
    use bevy::asset::RenderAssetUsages;
    use bevy::mesh::{Indices, PrimitiveTopology};
    let (mut pos, mut uv, mut nrm, mut idx) = (vec![], vec![], vec![], vec![]);
    for j in 0..TILE {
        for i in 0..TILE {
            let s = pos.len() as u32;
            for (u, v) in [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)] {
                pos.push([i as f32 + 0.5, 0.0, j as f32 + 0.5]);
                uv.push([u, v]);
                nrm.push([0.0, 1.0, 0.0]);
            }
            idx.extend_from_slice(&[s, s + 1, s + 2, s, s + 2, s + 3]);
        }
    }
    // two loose points so the culling bounds span the land's highs and lows and the patches' size
    for p in [[-2.0, -45.0, -2.0], [TILE as f32 + 2.0, 45.0, TILE as f32 + 2.0]] {
        pos.push(p);
        uv.push([0.0, 0.0]);
        nrm.push([0.0, 1.0, 0.0]);
    }
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nrm)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_indices(Indices::U32(idx))
}
