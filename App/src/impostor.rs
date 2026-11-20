//! Impostors: an asset's master seen from far off, without drawing it. Its master is photographed once by the GPU
//! from 8 × 8 directions over the upper hemisphere (a hemi-octahedral grid), into three atlases: its colour with its
//! coverage; its surface normal; and its other channels (depth along the view, wind weight, sky visibility, coverage:
//! `bake_normal.wesl`'s `extra`). A far copy is then a single quad that turns to face the eye, shows the frame nearest
//! the eye's direction, is lit like a surface with the baked normals, and sways with the master's own wind function
//! (`wind.wesl`'s `bend`) by its baked wind weights. Generic: any mesh with vertex colours bakes the same way (plants,
//! rocks, trees); one without wind weights bakes as still.

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

/// The render layers bakes draw on: each bake its own set (one layer a pass), so two bakes running at once (the grass
/// patch's at startup and the Library's first asset) never photograph each other's copies.
const FIRST_LAYER: usize = 8;
const SETS: usize = 24;
/// The pictures a master is photographed into: its colour, its normal, its other channels.
const PASSES: usize = 3;
static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

pub fn plugin(app: &mut App) {
    app.add_plugins((MaterialPlugin::<BakePass>::default(), MaterialPlugin::<Impostor>::default())).add_systems(Update, ((shoot, finish).chain(), blow));
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

/// An asset's far view: for each of its variants its atlases, the sphere around them all that each frame shows, and
/// the largest wind weight in them (0 for a master that does not sway).
#[derive(Clone)]
pub struct Baked {
    pub variants: Vec<Atlases>,
    pub centre: Vec3,
    pub radius: f32,
    pub wind: f32,
}

/// One variant's atlases: its colour with its coverage (sRGB); its normal in the master's own space; and its other
/// channels: r its depth along the frame's view (−1 to 1 across its sphere), g its wind weight, b its sky visibility,
/// a its coverage.
#[derive(Clone)]
pub struct Atlases {
    pub albedo: Handle<Image>,
    pub normal: Handle<Image>,
    pub extra: Handle<Image>,
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

/// The bake's own passes (`bake_normal.wesl`): a surface's normal as its colour, or (`extra`) its other channels. Both
/// read the master's wind weights (`library::ATTRIBUTE_WIND`; a master without them is given zeros before it is baked).
#[derive(Asset, TypePath, AsBindGroup, Clone, Debug, Default)]
#[bind_group_data(BakePassKey)]
pub struct BakePass {
    /// xyz: the master's centre, w: the radius of its sphere (the depth and the sky are measured in it).
    #[uniform(0)]
    pub sphere: Vec4,
    /// The other channels' pass, not the normal's.
    pub extra: bool,
}

#[repr(C)]
#[derive(Eq, PartialEq, Hash, Copy, Clone)]
pub struct BakePassKey {
    extra: bool,
}

impl From<&BakePass> for BakePassKey {
    fn from(m: &BakePass) -> Self {
        BakePassKey { extra: m.extra }
    }
}

impl Material for BakePass {
    fn vertex_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.bake_normal).into())
    }
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.bake_normal).into())
    }
    // drawn only by the bake's cameras: no prepass and no shadows (their pipelines would not know the wind attribute)
    fn enable_prepass() -> bool {
        false
    }
    fn enable_shadows() -> bool {
        false
    }
    fn specialize(
        _pipeline: &bevy::pbr::MaterialPipeline,
        descriptor: &mut bevy::render::render_resource::RenderPipelineDescriptor,
        layout: &bevy::mesh::MeshVertexBufferLayoutRef,
        key: bevy::pbr::MaterialPipelineKey<Self>,
    ) -> Result<(), bevy::render::render_resource::SpecializedMeshPipelineError> {
        descriptor.vertex.buffers = vec![layout.0.get_layout(&[
            Mesh::ATTRIBUTE_POSITION.at_shader_location(0),
            Mesh::ATTRIBUTE_NORMAL.at_shader_location(1),
            crate::library::ATTRIBUTE_WIND.at_shader_location(8),
        ])?];
        // the bake doc holds both passes: each pipeline names its own fragment (left unnamed, a module with two
        // fragment entry points is refused by the GPU's validation)
        if let Some(f) = descriptor.fragment.as_mut() {
            f.entry_point = Some(if key.bind_group_data.extra { "extra" } else { "fragment" }.into());
        }
        Ok(())
    }
}

#[derive(ShaderType, Clone, Copy, Debug, Default)]
pub struct ImpostorParams {
    /// xyz: the master's centre, w: the radius of its sphere.
    pub sphere: Vec4,
    /// x: frames along a side; y: the patch field's start (`patches.rs`); z: the bake's largest wind weight (0: it does
    /// not sway, and its quad does not grow).
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
    #[texture(5)]
    #[sampler(6)]
    pub extra: Handle<Image>,
    /// The wind as the grass has it (`wind.rs`): the same uniforms, so a far copy sways as its master.
    #[uniform(7)]
    pub wind: crate::wind::WindParams,
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
        let Atlases { albedo, normal, extra } = b.variants[v as usize % b.variants.len()].clone();
        Impostor {
            params: ImpostorParams { sphere: b.centre.extend(b.radius), grid: Vec4::new(FRAMES as f32, 0.0, b.wind, 0.0) },
            albedo,
            normal,
            extra,
            wind: default(),
        }
    }
}

/// Gives every far copy the wind of this frame, as `wind.rs` gives the grass.
fn blow(time: Res<Time>, strength: Res<crate::wind::Strength>, mut impostors: ResMut<Assets<Impostor>>) {
    let now = crate::wind::now(&time, &strength);
    for (_, m) in impostors.iter_mut() {
        m.wind.params = now;
    }
}

/// The quad a far copy is drawn on: its corners in [-1, 1]; the shader turns and sizes it.
pub fn quad() -> Mesh {
    Rectangle::new(2.0, 2.0).mesh().build()
}

/// Bakes `mesh` (its vertex colours its albedo): spawns the copies and 3 × 64 cameras that each photograph one frame
/// into the atlases, once; they are removed a few frames later.
pub fn bake(
    commands: &mut Commands,
    asset: &crate::library::Asset,
    meshes: &mut Assets<Mesh>,
    images: &mut Assets<Image>,
    colours: &mut Assets<StandardMaterial>,
    passes: &mut Assets<BakePass>,
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
            .map(|v| {
                let p = |name: &str| crate::bakes::part(id, "impostor", &format!("{name} {v}"));
                Some((p("albedo")?, p("normal")?, p("extra")?))
            })
            .collect();
        if let Some(parts) = parts {
            let f = |k: &str| params.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0) as f32;
            let variants = parts
                .into_iter()
                .map(|(a, nm, x)| Atlases {
                    albedo: images.add(atlas(TextureFormat::Rgba8UnormSrgb, Some(a))),
                    normal: images.add(atlas(TextureFormat::Rgba8Unorm, Some(nm))),
                    extra: images.add(atlas(TextureFormat::Rgba8Unorm, Some(x))),
                })
                .collect();
            return Baked { variants, centre: Vec3::new(f("x"), f("y"), f("z")), radius: f("radius"), wind: f("wind") };
        }
    }
    // not made yet, or made from something else: grow each variant's master and photograph it
    let masters: Vec<Mesh> = (0..n).map(|v| with_wind(crate::library::master(asset, crate::library::variant_seed(v)))).collect();
    let (mut lo, mut hi, mut wind) = (Vec3::splat(f32::MAX), Vec3::splat(f32::MIN), 0.0f32);
    for m in &masters {
        if let Some(bevy::mesh::VertexAttributeValues::Float32x3(pos)) = m.attribute(Mesh::ATTRIBUTE_POSITION) {
            for p in pos {
                lo = lo.min(Vec3::from(*p));
                hi = hi.max(Vec3::from(*p));
            }
        }
        if let Some(bevy::mesh::VertexAttributeValues::Float32(w)) = m.attribute(crate::library::ATTRIBUTE_WIND) {
            wind = w.iter().fold(wind, |a, &b| a.max(b));
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
        params: serde_json::json!({ "x": centre.x, "y": centre.y, "z": centre.z, "radius": radius, "wind": wind, "variants": n, "frames": FRAMES, "res": RES }),
        left: std::sync::Mutex::new(PASSES as u32 * n),
    });
    let mut variants = Vec::new();
    for (v, mesh) in masters.into_iter().enumerate() {
        let a = Atlases {
            albedo: images.add(atlas(TextureFormat::Rgba8UnormSrgb, None)),
            normal: images.add(atlas(TextureFormat::Rgba8Unorm, None)),
            extra: images.add(atlas(TextureFormat::Rgba8Unorm, None)),
        };
        shoot_master(commands, mesh, centre, radius, v, &a, &keep, meshes, images, colours, passes);
        variants.push(a);
    }
    Baked { variants, centre, radius, wind }
}

/// A master as the bake's passes read it: with its wind weights, zeros where it has none (it bakes as still).
fn with_wind(mut mesh: Mesh) -> Mesh {
    if mesh.attribute(crate::library::ATTRIBUTE_WIND).is_none() {
        let n = mesh.count_vertices();
        mesh.insert_attribute(crate::library::ATTRIBUTE_WIND, vec![0.0f32; n]);
    }
    mesh
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
    mut passes: ResMut<Assets<BakePass>>,
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
        bake(&mut commands, &asset, &mut meshes, &mut images, &mut colours, &mut passes);
    }
    job.frames += 1;
    // a bake takes about 160 frames and its read-backs a few more; one that has not finished in ten times that failed
    if job.frames > 1600 {
        error!("--bake: {} did not finish", asset.name);
        exit.write(AppExit::error());
    }
}

/// Sets up the cameras and copies that photograph variant `v`'s master into its three atlases, a layer each.
#[allow(clippy::too_many_arguments)]
fn shoot_master(
    commands: &mut Commands,
    mesh: Mesh,
    centre: Vec3,
    radius: f32,
    v: usize,
    targets: &Atlases,
    keep: &std::sync::Arc<Keep>,
    meshes: &mut Assets<Mesh>,
    images: &mut Assets<Image>,
    colours: &mut Assets<StandardMaterial>,
    passes: &mut Assets<BakePass>,
) {
    let m = meshes.add(mesh);
    let ticks = FRAMES * FRAMES + 8 + WARM as u32;
    let first = FIRST_LAYER + PASSES * (NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed) % SETS);
    let sphere = centre.extend(radius);
    let flat = colours.add(StandardMaterial { base_color: Color::WHITE, unlit: true, double_sided: true, cull_mode: None, ..default() });
    commands.spawn((Baking(ticks), Mesh3d(m.clone()), MeshMaterial3d(flat), RenderLayers::layer(first), Transform::default()));
    for (k, extra) in [(1, false), (2, true)] {
        let pass = passes.add(BakePass { sphere, extra });
        commands.spawn((Baking(ticks), Mesh3d(m.clone()), MeshMaterial3d(pass), RenderLayers::layer(first + k), Transform::default()));
    }
    let shots = [
        (&targets.albedo, TextureFormat::Rgba8UnormSrgb, "albedo"),
        (&targets.normal, TextureFormat::Rgba8Unorm, "normal"),
        (&targets.extra, TextureFormat::Rgba8Unorm, "extra"),
    ];
    for (k, (target, format, name)) in shots.into_iter().enumerate() {
        let views: Vec<Handle<Image>> = (0..FRAMES * FRAMES)
            .map(|_| {
                let mut img = Image::new_target_texture(RES, RES, format, None);
                // read back afterwards: it must be copyable
                img.texture_descriptor.usage |= bevy::render::render_resource::TextureUsages::COPY_SRC;
                images.add(img)
            })
            .collect();
        let first_view = views[0].clone();
        commands.spawn((
            Baking(ticks + 200),
            Shooting { k: -WARM, centre, radius, views, atlas: target.clone(), got: Default::default(), keep: (keep.clone(), format!("{name} {v}")) },
            Camera3d::default(),
            Camera { order: -100, clear_color: ClearColorConfig::Custom(Color::NONE), ..default() },
            RenderTarget::Image(first_view.into()),
            Projection::Orthographic(OrthographicProjection {
                scaling_mode: ScalingMode::Fixed { width: radius * 2.0, height: radius * 2.0 },
                near: 0.0,
                far: radius * 4.0,
                ..OrthographicProjection::default_3d()
            }),
            Tonemapping::None,
            Msaa::Off,
            RenderLayers::layer(first + k),
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
