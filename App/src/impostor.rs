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

/// Ticks a bake waits on its first view before it starts, for its shaders to compile.
const WARM: i32 = 90;

/// The render layers bakes draw on: each bake its own pair, so two bakes running at once (the grass patch's at startup
/// and the Library's first asset) never photograph each other's copies.
const FIRST_LAYER: usize = 8;
const PAIRS: usize = 24;
static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

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

/// An asset's far view: for each of its variants two atlases (colour, normal), and the sphere around them all that
/// each frame shows.
#[derive(Clone)]
pub struct Baked {
    pub variants: Vec<(Handle<Image>, Handle<Image>)>,
    pub centre: Vec3,
    pub radius: f32,
}

/// What a finished bake is kept as: the asset, the key, its parameters, and how many parts are still to come.
struct Keep {
    asset: Option<String>,
    key: String,
    params: serde_json::Value,
    left: std::sync::Mutex<u32>,
}

/// The cameras and copies of a bake; gone after a few frames.
#[derive(Component)]
struct Baking(u32);

/// A baking camera: the view it takes this tick, a small picture for each view, the atlas they go into, and the
/// views read back so far.
#[derive(Component)]
struct Shooting {
    /// The view taken this tick; below zero, the ticks still waited for its shaders to compile (a view taken
    /// before that comes out empty).
    k: i32,
    centre: Vec3,
    radius: f32,
    views: Vec<Handle<Image>>,
    atlas: Handle<Image>,
    got: std::sync::Arc<std::sync::Mutex<(Vec<u8>, u32)>>,
    /// What the atlas is kept as once made: the bake, and the part's name.
    keep: (std::sync::Arc<Keep>, String),
}

/// Writes a surface's normal as its colour.
#[derive(Asset, TypePath, AsBindGroup, Clone, Debug, Default)]
pub struct NormalBake {}

impl Material for NormalBake {
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.bake_normal).into())
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
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.impostor).into())
    }
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.impostor).into())
    }
}

impl Impostor {
    /// A far copy drawn as variant `v` of the bake.
    pub fn of(b: &Baked, v: u32) -> Self {
        let (albedo, normal) = b.variants[v as usize % b.variants.len()].clone();
        Impostor { params: ImpostorParams { sphere: b.centre.extend(b.radius), grid: Vec4::new(FRAMES as f32, 0.0, 0.0, 0.0) }, albedo, normal }
    }
}

/// The quad a far copy is drawn on: its corners in [-1, 1]; the shader turns and sizes it. It carries tangents only so
/// the shader can hand the frame's axes in the world to the fragment (the baked normals are in the master's own space
/// and must turn with the copy).
pub fn quad() -> Mesh {
    Rectangle::new(2.0, 2.0).mesh().build().with_generated_tangents().expect("a rectangle has normals and UVs")
}

/// Bakes `mesh` (its vertex colours its albedo): spawns the copies and 2 × 64 cameras that each photograph one frame
/// into the atlases, once; they are removed a few frames later.
pub fn bake(
    commands: &mut Commands,
    asset: &crate::library::Asset,
    meshes: &mut Assets<Mesh>,
    images: &mut Assets<Image>,
    colours: &mut Assets<StandardMaterial>,
    normals: &mut Assets<NormalBake>,
) -> Baked {
    let side = FRAMES * RES;
    let atlas = |format: TextureFormat, data: Option<Vec<u8>>| {
        let mut img = Image::new_fill(
            bevy::render::render_resource::Extent3d { width: side, height: side, depth_or_array_layers: 1 },
            bevy::render::render_resource::TextureDimension::D2,
            &[0, 0, 0, 0],
            format,
            bevy::asset::RenderAssetUsages::default(),
        );
        img.sampler = bevy::image::ImageSampler::linear();
        if data.is_some() {
            img.data = data;
        }
        img
    };
    let n = asset.variants.max(1);
    // made once, and belonging to the asset: its recipe, the bake's settings, its shader and the bake code make the
    // key; a result made under it is read back without growing a master
    let key = key_for(asset);
    if let Some(id) = &asset.id
        && let Some(params) = crate::bakes::valid(id, "impostor", &key)
    {
        let parts: Option<Vec<_>> = (0..n)
            .map(|v| Some((crate::bakes::part(id, "impostor", &format!("albedo {v}"))?, crate::bakes::part(id, "impostor", &format!("normal {v}"))?)))
            .collect();
        if let Some(parts) = parts {
            let f = |k: &str| params.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0) as f32;
            let variants = parts
                .into_iter()
                .map(|(a, nm)| (images.add(atlas(TextureFormat::Rgba8UnormSrgb, Some(a))), images.add(atlas(TextureFormat::Rgba8Unorm, Some(nm)))))
                .collect();
            return Baked { variants, centre: Vec3::new(f("x"), f("y"), f("z")), radius: f("radius") };
        }
    }
    // not made yet, or made from something else: grow each variant's master and photograph it
    let masters: Vec<Mesh> = (0..n).map(|v| crate::library::master(asset, crate::library::variant_seed(v))).collect();
    let (mut lo, mut hi) = (Vec3::splat(f32::MAX), Vec3::splat(f32::MIN));
    for m in &masters {
        if let Some(bevy::mesh::VertexAttributeValues::Float32x3(pos)) = m.attribute(Mesh::ATTRIBUTE_POSITION) {
            for p in pos {
                lo = lo.min(Vec3::from(*p));
                hi = hi.max(Vec3::from(*p));
            }
        }
    }
    if lo.x > hi.x {
        (lo, hi) = (Vec3::ZERO, Vec3::ZERO);
    }
    let centre = (lo + hi) * 0.5;
    let radius = ((hi - lo).length() * 0.5).max(0.01);
    let keep = std::sync::Arc::new(Keep {
        asset: asset.id.clone(),
        key,
        params: serde_json::json!({ "x": centre.x, "y": centre.y, "z": centre.z, "radius": radius, "variants": n, "frames": FRAMES, "res": RES }),
        left: std::sync::Mutex::new(2 * n),
    });
    let mut variants = Vec::new();
    for (v, mesh) in masters.into_iter().enumerate() {
        let albedo = images.add(atlas(TextureFormat::Rgba8UnormSrgb, None));
        let normal = images.add(atlas(TextureFormat::Rgba8Unorm, None));
        shoot_master(commands, mesh, centre, radius, [(&albedo, format!("albedo {v}")), (&normal, format!("normal {v}"))], &keep, meshes, images, colours, normals);
        variants.push((albedo, normal));
    }
    Baked { variants, centre, radius }
}

/// The key of an asset's impostor: its recipe, the bake's settings, its shader and the bake code (`bakes::key`).
pub fn key_for(asset: &crate::library::Asset) -> String {
    crate::bakes::key("impostor", &[&crate::library::recipe_bytes(asset), format!("{FRAMES} {RES}").as_bytes()], &[&crate::root::root().shaders.bake_normal])
}

/// Whether asset `asset`'s far view is made and current.
pub fn current(asset: &crate::library::Asset) -> bool {
    asset.id.as_deref().is_some_and(|id| crate::bakes::valid(id, "impostor", &key_for(asset)).is_some())
}

/// `--bake <asset id>`: every derived result of one asset that is not current, made and kept in theDB, then quit.
/// Run by the kernel's baker when an asset doc changes; a result already current makes it quit at once, writing
/// nothing (so the change its own write makes ends here).
#[derive(Resource)]
pub struct BakeOne {
    pub asset: String,
    pub frames: u32,
}

pub fn bake_one(
    mut commands: Commands,
    mut job: ResMut<BakeOne>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut images: ResMut<Assets<Image>>,
    mut colours: ResMut<Assets<StandardMaterial>>,
    mut normals: ResMut<Assets<NormalBake>>,
    mut exit: MessageWriter<AppExit>,
) {
    let Some(asset) = crate::library::load().into_values().find(|a| a.id.as_deref() == Some(job.asset.as_str())) else {
        error!("--bake: no asset {}", job.asset);
        exit.write(AppExit::error());
        return;
    };
    if current(&asset) {
        info!("--bake: {} is current", asset.name);
        exit.write(AppExit::Success);
        return;
    }
    if job.frames == 0 {
        info!("--bake: {} ({} variants)", asset.name, asset.variants.max(1));
        bake(&mut commands, &asset, &mut meshes, &mut images, &mut colours, &mut normals);
    }
    job.frames += 1;
    // a bake takes about 160 frames and its read-backs a few more; one that has not finished in ten times that failed
    if job.frames > 1600 {
        error!("--bake: {} did not finish", asset.name);
        exit.write(AppExit::error());
    }
}

/// Sets up the cameras and copies that photograph one master into its two atlases.
#[allow(clippy::too_many_arguments)]
fn shoot_master(
    commands: &mut Commands,
    mesh: Mesh,
    centre: Vec3,
    radius: f32,
    targets: [(&Handle<Image>, String); 2],
    keep: &std::sync::Arc<Keep>,
    meshes: &mut Assets<Mesh>,
    images: &mut Assets<Image>,
    colours: &mut Assets<StandardMaterial>,
    normals: &mut Assets<NormalBake>,
) {
    let m = meshes.add(mesh);
    let flat = colours.add(StandardMaterial { base_color: Color::WHITE, unlit: true, double_sided: true, cull_mode: None, ..default() });
    let ticks = FRAMES * FRAMES + 8 + WARM as u32;
    let pair = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed) % PAIRS;
    let (albedo_layer, normal_layer) = (FIRST_LAYER + 2 * pair, FIRST_LAYER + 2 * pair + 1);
    commands.spawn((Baking(ticks), Mesh3d(m.clone()), MeshMaterial3d(flat), RenderLayers::layer(albedo_layer), Transform::default()));
    commands.spawn((Baking(ticks), Mesh3d(m), MeshMaterial3d(normals.add(NormalBake {})), RenderLayers::layer(normal_layer), Transform::default()));
    let [(albedo, a_part), (normal, n_part)] = targets;
    for (layer, target, format, part) in [(albedo_layer, albedo, TextureFormat::Rgba8UnormSrgb, a_part), (normal_layer, normal, TextureFormat::Rgba8Unorm, n_part)] {
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
            Shooting { k: -WARM, centre, radius, views, atlas: target.clone(), got: Default::default(), keep: (keep.clone(), part) },
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
}

/// Points each baking camera at its next view and its own small picture; once all are taken, reads them back and
/// lays them into the atlas.
fn shoot(mut commands: Commands, mut cams: Query<(&mut Shooting, &mut RenderTarget, &mut Transform, &mut Camera)>) {
    for (mut s, mut target, mut t, mut c) in &mut cams {
        let n = (FRAMES * FRAMES) as i32;
        if s.k < n {
            let k = s.k.max(0) as u32;
            let (i, j) = (k % FRAMES, k / FRAMES);
            let f = frame_dir(i, j);
            *t = Transform::from_translation(s.centre + f * s.radius * 2.0).looking_at(s.centre, frame_up(f));
            *target = RenderTarget::Image(s.views[k as usize].clone().into());
        } else if s.k == n + 2 {
            c.is_active = false;
            // every view drawn: read each back and lay it into the atlas at its frame
            let got = s.got.clone();
            for (k, view) in s.views.iter().enumerate() {
                let (i, j) = (k as u32 % FRAMES, k as u32 / FRAMES);
                let (got, atlas, keep) = (got.clone(), s.atlas.clone(), s.keep.clone());
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
                            let data = std::mem::take(&mut g.0);
                            let (bake, part) = &keep;
                            if let Some(asset) = &bake.asset {
                                crate::bakes::keep_part(asset, "impostor", part, &data);
                                let mut left = bake.left.lock().unwrap_or_else(|e| e.into_inner());
                                *left = left.saturating_sub(1);
                                if *left == 0 {
                                    crate::bakes::seal(asset, "impostor", &bake.key, &bake.params);
                                }
                            }
                            img.data = Some(data);
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
