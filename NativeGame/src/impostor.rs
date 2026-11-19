//! Impostors: an asset's master seen from far off, without drawing it. Its master is photographed once by the GPU
//! from 8 × 8 directions over the upper hemisphere (a hemi-octahedral grid), into two atlases: its colour with its
//! coverage, and its surface normal. A far copy is then a single quad that turns to face the eye, shows the frame
//! nearest the eye's direction, and is lit like a surface with the baked normals. Generic: any mesh with vertex
//! colours bakes the same way (plants, rocks, later bushes and trees).

use bevy::camera::visibility::RenderLayers;
use bevy::camera::{RenderTarget, ScalingMode};
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::pbr::{Material, MaterialPlugin};
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType, TextureFormat};
use bevy::shader::ShaderRef;

/// Frames along a side of the atlas, and pixels along a side of a frame.
pub const FRAMES: u32 = 8;
pub const RES: u32 = 128;

const ALBEDO_LAYER: usize = 4;
const NORMAL_LAYER: usize = 5;

pub fn plugin(app: &mut App) {
    app.add_plugins((MaterialPlugin::<NormalBake>::default(), MaterialPlugin::<Impostor>::default())).add_systems(Update, (shoot, finish).chain());
}

/// The direction of frame (i, j): the hemi-octahedral grid decoded at the frame's centre (also in `impostor.wesl`).
pub fn frame_dir(i: u32, j: u32) -> Vec3 {
    let u = (i as f32 + 0.5) / FRAMES as f32 * 2.0 - 1.0;
    let v = (j as f32 + 0.5) / FRAMES as f32 * 2.0 - 1.0;
    let (x, z) = ((u + v) * 0.5, (u - v) * 0.5);
    Vec3::new(x, 1.0 - x.abs() - z.abs(), z).normalize()
}

/// The up of the frame that looks back along `f` (also in `impostor.wesl`).
fn frame_up(f: Vec3) -> Vec3 {
    if f.y.abs() > 0.999 { -Vec3::Z } else { Vec3::Y }
}

/// A baked master: its two atlases, and the sphere around it that each frame shows.
#[derive(Clone)]
pub struct Baked {
    pub albedo: Handle<Image>,
    pub normal: Handle<Image>,
    pub centre: Vec3,
    pub radius: f32,
}

/// The cameras and copies of a bake; gone after a few frames.
#[derive(Component)]
struct Baking(u32);

/// A baking camera: the view it takes this tick, a small picture for each view, the atlas they go into, and the
/// views read back so far.
#[derive(Component)]
struct Shooting {
    k: u32,
    centre: Vec3,
    radius: f32,
    views: Vec<Handle<Image>>,
    atlas: Handle<Image>,
    got: std::sync::Arc<std::sync::Mutex<(Vec<u8>, u32)>>,
}

/// Writes a surface's normal as its colour.
#[derive(Asset, TypePath, AsBindGroup, Clone, Debug, Default)]
pub struct NormalBake {}

impl Material for NormalBake {
    fn fragment_shader() -> ShaderRef {
        "shaders/bake_normal.wesl".into()
    }
}

#[derive(ShaderType, Clone, Copy, Debug, Default)]
pub struct ImpostorParams {
    /// xyz: the master's centre, w: the radius of its sphere.
    pub sphere: Vec4,
    /// x: frames along a side.
    pub grid: Vec4,
}

/// A far copy of a baked master.
#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct Impostor {
    #[uniform(0)]
    pub params: ImpostorParams,
    #[texture(1)]
    #[sampler(2)]
    pub albedo: Handle<Image>,
    #[texture(3)]
    #[sampler(4)]
    pub normal: Handle<Image>,
}

impl Material for Impostor {
    // the depth prepass and the shadows would draw the bare 2 m quad unturned (their own vertex shader): the big
    // light-blue plane in the Library
    fn enable_prepass() -> bool {
        false
    }
    fn enable_shadows() -> bool {
        false
    }
    fn vertex_shader() -> ShaderRef {
        "shaders/impostor.wesl".into()
    }
    fn fragment_shader() -> ShaderRef {
        "shaders/impostor.wesl".into()
    }
}

impl Impostor {
    pub fn of(b: &Baked) -> Self {
        Impostor {
            params: ImpostorParams { sphere: b.centre.extend(b.radius), grid: Vec4::new(FRAMES as f32, 0.0, 0.0, 0.0) },
            albedo: b.albedo.clone(),
            normal: b.normal.clone(),
        }
    }
}

/// The quad a far copy is drawn on: its corners in [-1, 1]; the shader turns and sizes it.
pub fn quad() -> Mesh {
    Rectangle::new(2.0, 2.0).mesh().build()
}

/// Bakes `mesh` (its vertex colours its albedo): spawns the copies and 2 × 64 cameras that each photograph one frame
/// into the atlases, once; they are removed a few frames later.
pub fn bake(
    commands: &mut Commands,
    mesh: Mesh,
    meshes: &mut Assets<Mesh>,
    images: &mut Assets<Image>,
    colours: &mut Assets<StandardMaterial>,
    normals: &mut Assets<NormalBake>,
) -> Baked {
    let (mut lo, mut hi) = (Vec3::splat(f32::MAX), Vec3::splat(f32::MIN));
    if let Some(bevy::mesh::VertexAttributeValues::Float32x3(pos)) = mesh.attribute(Mesh::ATTRIBUTE_POSITION) {
        for p in pos {
            lo = lo.min(Vec3::from(*p));
            hi = hi.max(Vec3::from(*p));
        }
    }
    if lo.x > hi.x {
        (lo, hi) = (Vec3::ZERO, Vec3::ZERO);
    }
    let centre = (lo + hi) * 0.5;
    let radius = ((hi - lo).length() * 0.5).max(0.01);
    // the atlases are put together on the CPU from one small picture a view: Bevy redraws a camera's whole target
    // each frame, so a camera moved across one atlas kept only its last view
    let side = FRAMES * RES;
    let atlas = |format: TextureFormat| {
        let mut img = Image::new_fill(
            bevy::render::render_resource::Extent3d { width: side, height: side, depth_or_array_layers: 1 },
            bevy::render::render_resource::TextureDimension::D2,
            &[0, 0, 0, 0],
            format,
            bevy::asset::RenderAssetUsages::default(),
        );
        img.sampler = bevy::image::ImageSampler::linear();
        img
    };
    let albedo = images.add(atlas(TextureFormat::Rgba8UnormSrgb));
    let normal = images.add(atlas(TextureFormat::Rgba8Unorm));
    let m = meshes.add(mesh);
    let flat = colours.add(StandardMaterial { base_color: Color::WHITE, unlit: true, double_sided: true, cull_mode: None, ..default() });
    let ticks = FRAMES * FRAMES + 8;
    commands.spawn((Baking(ticks), Mesh3d(m.clone()), MeshMaterial3d(flat), RenderLayers::layer(ALBEDO_LAYER), Transform::default()));
    commands.spawn((Baking(ticks), Mesh3d(m), MeshMaterial3d(normals.add(NormalBake {})), RenderLayers::layer(NORMAL_LAYER), Transform::default()));
    for (layer, target, format) in [(ALBEDO_LAYER, &albedo, TextureFormat::Rgba8UnormSrgb), (NORMAL_LAYER, &normal, TextureFormat::Rgba8Unorm)] {
        let views: Vec<Handle<Image>> = (0..FRAMES * FRAMES)
            .map(|_| {
                let mut img = Image::new_target_texture(RES, RES, format, None);
                // read back afterwards: it must be copyable
                img.texture_descriptor.usage |= bevy::render::render_resource::TextureUsages::COPY_SRC;
                images.add(img)
            })
            .collect();
        let first = views[0].clone();
        commands.spawn((
            Baking(ticks + 200),
            Shooting { k: 0, centre, radius, views, atlas: target.clone(), got: Default::default() },
            Camera3d::default(),
            Camera { order: -100, clear_color: ClearColorConfig::Custom(Color::NONE), ..default() },
            RenderTarget::Image(first.into()),
            Projection::Orthographic(OrthographicProjection {
                scaling_mode: ScalingMode::Fixed { width: radius * 2.0, height: radius * 2.0 },
                near: 0.0,
                far: radius * 4.0,
                ..OrthographicProjection::default_3d()
            }),
            Tonemapping::None,
            Msaa::Off,
            RenderLayers::layer(layer),
            Transform::default(),
        ));
    }
    Baked { albedo, normal, centre, radius }
}

/// Points each baking camera at its next view and its own small picture; once all are taken, reads them back and
/// lays them into the atlas.
fn shoot(mut commands: Commands, mut cams: Query<(&mut Shooting, &mut RenderTarget, &mut Transform, &mut Camera)>) {
    for (mut s, mut target, mut t, mut c) in &mut cams {
        let n = FRAMES * FRAMES;
        if s.k < n {
            let (i, j) = (s.k % FRAMES, s.k / FRAMES);
            let f = frame_dir(i, j);
            *t = Transform::from_translation(s.centre + f * s.radius * 2.0).looking_at(s.centre, frame_up(f));
            *target = RenderTarget::Image(s.views[s.k as usize].clone().into());
        } else if s.k == n + 2 {
            c.is_active = false;
            // every view drawn: read each back and lay it into the atlas at its frame
            let got = s.got.clone();
            for (k, view) in s.views.iter().enumerate() {
                let (i, j) = (k as u32 % FRAMES, k as u32 / FRAMES);
                let (got, atlas) = (got.clone(), s.atlas.clone());
                commands.spawn(bevy::render::gpu_readback::ReadbackOnce::texture(view.clone())).observe(
                    move |ev: On<bevy::render::gpu_readback::ReadbackComplete>, mut images: ResMut<Assets<Image>>| {
                        let Ok(mut g) = got.lock() else { return };
                        let side = (FRAMES * RES) as usize;
                        if g.0.is_empty() {
                            g.0 = vec![0; side * side * 4];
                        }
                        let row = (RES * 4) as usize;
                        for y in 0..RES as usize {
                            let src = &ev.data[y * row..(y + 1) * row];
                            let at = ((j as usize * RES as usize + y) * side + i as usize * RES as usize) * 4;
                            g.0[at..at + row].copy_from_slice(src);
                        }
                        g.1 += 1;
                        if g.1 == FRAMES * FRAMES
                            && let Some(mut img) = images.get_mut(&atlas)
                        {
                            img.data = Some(std::mem::take(&mut g.0));
                        }
                    },
                );
            }
        }
        s.k += 1;
    }
}

fn finish(mut commands: Commands, mut baking: Query<(Entity, &mut Baking)>) {
    for (e, mut b) in &mut baking {
        if b.0 == 0 {
            commands.entity(e).despawn();
        } else {
            b.0 -= 1;
        }
    }
}
