//! Impostors: an asset's master seen from far off, without drawing it, baked as SmartImposter bakes its plants (MIT,
//! github.com/SamG-Coder/SmartImposter: `bake.rgen`, `mip.comp`, `impostor.rint`, `renderer.rs` `frame_res`) and
//! drawn as its intersection shader draws them, in raster instead of ray tracing:
//!
//! - **Frames:** 12 × 12 views over the upper hemisphere, on the vertices of a hemi-octahedral grid.
//! - **Resolution from size:** texels of 5.5 cm × the variant's LOD scale (its height / 16 m, 0.25–1.2; grass at least
//!   0.4 and 1.6× coarser), the square frame of its bounding sphere rounded to a multiple of 32 and capped at 448 px,
//!   then cropped about its centre to what the master covers from any view.
//! - **Coverage from sub-samples:** each view is drawn at 3 × 3 samples a texel; a texel's coverage is the fraction
//!   that hit, and its colour, normal, depth and the rest are averaged over the hits.
//! - **Channels** (one RGBA8 picture each, the layout BC3 / BC5 + BC5 / BC3 can take later): `albedo` sqrt(albedo) and
//!   ambient occlusion; `normal` the octahedral normal (rg), the depth along the view (b) and the coverage (a);
//!   `extra`, at half resolution, the visibility of the sky as `a + b·up` (r: a, b: b.y), the normal spread (g:
//!   the length of the averaged normal) and, ours, the wind weight as a share of the variant's largest (a).
//! - **Coverage-weighted mips**, so empty texels do not drag a level's colour, normal or depth to nothing.
//! - **Drawn** on the master's box: a fragment marches its ray through one of the three views around it (chosen on a
//!   random number of the pixel), against that view's baked depth (parallax), and keeps the surface it meets with the
//!   probability of its coverage; it writes that surface's depth. Lit with the normal shortened to its spread and
//!   leaves' transmission as a broad lobe.
//!
//! Ours, where SmartImposter has none: the wind (far copies sway with the master's `bend` by their baked wind weight),
//! the bake's result kept in theDB and linked from its asset.

use bevy::camera::visibility::RenderLayers;
use bevy::camera::{RenderTarget, ScalingMode};
use bevy::core_pipeline::tonemapping::{DebandDither, Tonemapping};
use bevy::pbr::{Material, MaterialPlugin};
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType, TextureFormat};
use bevy::shader::ShaderRef;
use std::sync::{Arc, Mutex};

/// Views along a side of the hemi-octahedral grid (SmartImposter's 12: a view every ~8°, so the three around any
/// direction differ little and the parallax march closes the rest).
pub const GRID: u32 = 12;
/// Samples along a side of a texel when a view is drawn (3 × 3: coverage in ninths).
const SUB: u32 = 3;
/// The texel size of a full-size tree (LOD scale 1), metres.
const TEXEL: f32 = 0.055;
/// The largest square frame, texels.
const MAX_RES: u32 = 448;
/// Ambient occlusion's reach (m) and the margin around the master's box (m), as SmartImposter's.
const AO_RANGE: f32 = 1.5;
const PAD: f32 = 0.05;

/// Ticks a bake waits on its first view before it starts, for its shaders to compile.
const WARM: i32 = 90;

/// The render layers bakes draw on: each bake its own set (one layer a pass), so two bakes running at once (the grass
/// patch's at startup and the Library's first asset) never photograph each other's copies.
const FIRST_LAYER: usize = 8;
const SETS: usize = 24;
/// The pictures a view is drawn into: the albedo, the normal, the depth and occlusion, the visibility.
const PASSES: usize = 4;
static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

pub fn plugin(app: &mut App) {
    app.add_plugins((MaterialPlugin::<BakePass>::default(), MaterialPlugin::<Impostor>::default())).add_systems(Update, (shoot, finish).chain());
}

/// The view of grid vertex (i, j): the hemi-octahedral square decoded there (also in `impostor.wesl`). It points from
/// the master toward the camera.
pub fn frame_dir(i: u32, j: u32) -> Vec3 {
    let (u, v) = (i as f32 / (GRID - 1) as f32 * 2.0 - 1.0, j as f32 / (GRID - 1) as f32 * 2.0 - 1.0);
    let (x, z) = ((u + v) * 0.5, (u - v) * 0.5);
    Vec3::new(x, 1.0 - x.abs() - z.abs(), z).normalize()
}

/// The up of the view that looks back along `f` (also in `impostor.wesl`).
fn frame_up(f: Vec3) -> Vec3 {
    if f.y.abs() > 0.999 { -Vec3::Z } else { Vec3::Y }
}

/// The square frame's texels for a sphere of `radius` at LOD scale `lod_scale`: 5.5 cm texels × the scale (small plants
/// switch closer, but no finer than 0.35 of a tree's density), a multiple of 32, at most 448.
fn res_for(radius: f32, lod_scale: f32) -> u32 {
    let r = (2.0 * radius / (TEXEL * lod_scale.max(0.35))).round() as u32;
    (r.div_ceil(32) * 32).clamp(32, MAX_RES)
}

/// Mip levels of a frame: every level a multiple of 4 texels (BC blocks) and at least 8.
fn atlas_mips(res: u32) -> u32 {
    let mut m = 1;
    while (res >> m) >= 8 && (res >> m).is_multiple_of(4) {
        m += 1;
    }
    m
}

/// The frame kept: the square cropped about its centre to how far the master reaches sideways (`across`) and at all
/// (`up`), in texels, plus one texel of the coarsest level; whole blocks of the coarsest level, at least two.
fn frame_res(square: u32, mips: u32, across: f32, up: f32) -> [u32; 2] {
    let step = 4 << (mips - 1);
    let margin = (1 << (mips - 1)) as f32 + 1.0;
    let side = |reach: f32| {
        let want = (2.0 * (reach + margin)).ceil() as u32;
        let mut s = (want.div_ceil(step).max(2) * step).min(square);
        if !(square - s).is_multiple_of(2 * step) {
            s += step;
        }
        s
    };
    [side(across), side(up)]
}

/// An asset's far view: each variant's atlases and shape.
#[derive(Clone)]
pub struct Baked {
    pub variants: Vec<Atlases>,
}

/// One variant's atlases (see the module's notes for their channels) and the numbers its shader reads.
#[derive(Clone)]
pub struct Atlases {
    pub albedo: Handle<Image>,
    pub normal: Handle<Image>,
    pub extra: Handle<Image>,
    pub params: ImpostorParams,
}

/// One variant's shape, as its bake measured it and the bake result keeps it (read back without the master).
#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
struct Shape {
    lo: [f32; 3],
    hi: [f32; 3],
    /// The square frame of the bounding sphere, and the cropped frame kept (across, up), texels.
    square: u32,
    res: [u32; 2],
    mips: u32,
    /// 0 a plant (bark or leaves by colour), 2 solid.
    kind: f32,
    wind: f32,
}

impl Shape {
    fn centre(&self) -> Vec3 {
        (Vec3::from(self.lo) + Vec3::from(self.hi)) * 0.5
    }
    fn radius(&self) -> f32 {
        ((Vec3::from(self.hi) - Vec3::from(self.lo)).length() * 0.5).max(0.005)
    }
    /// Half the cropped frame's width and height, metres.
    fn ext(&self) -> Vec2 {
        let r = self.radius();
        Vec2::new(r * self.res[0] as f32 / self.square as f32, r * self.res[1] as f32 / self.square as f32)
    }
    /// The atlas's side (texels across, up) at level 0.
    fn atlas(&self) -> (usize, usize) {
        ((GRID * self.res[0]) as usize, (GRID * self.res[1]) as usize)
    }
    fn params(&self, transmission: f32) -> ImpostorParams {
        let pad = Vec3::splat(PAD);
        let ext = self.ext();
        ImpostorParams {
            sphere: self.centre().extend(self.radius()),
            grid: Vec4::new(GRID as f32, 0.0, self.mips as f32, transmission),
            bmin: (Vec3::from(self.lo) - pad).extend(self.kind),
            bmax: (Vec3::from(self.hi) + pad).extend(self.wind),
            frame: Vec4::new(ext.x, ext.y, self.res[0] as f32, self.res[1] as f32),
        }
    }
}

/// What a finished bake is kept as: the asset, the key, its parameters, and how many variants are still to come.
struct Keep {
    asset: Option<String>,
    key: String,
    params: serde_json::Value,
    left: Mutex<u32>,
}

/// The cameras and copies of a bake; gone after a few frames.
#[derive(Component)]
struct Baking(u32);

/// A variant's bake while its views come back: the views of a tick until all four passes are in, and the atlases
/// (level 0) they are reduced into.
struct Job {
    shape: Shape,
    views: std::collections::HashMap<u32, [Option<Vec<u8>>; PASSES]>,
    albedo: Vec<u8>,
    normal: Vec<u8>,
    /// the visibility at full resolution (halved at the end)
    vis: Vec<u8>,
    done: u32,
    targets: [Handle<Image>; 3],
    keep: (Arc<Keep>, u32),
}

/// A baking camera: the view it takes this tick, its pass, the picture it draws into and the bake it feeds.
#[derive(Component)]
struct Shooting {
    /// The view taken this tick; below zero, the ticks still waited (its shaders compiling, or the variants before it).
    k: i32,
    pass: usize,
    centre: Vec3,
    radius: f32,
    view: Handle<Image>,
    job: Arc<Mutex<Job>>,
}

/// The bake's own passes (`bake_normal.wesl`): `albedo`, `normal`, `extra` (depth, occlusion, wind) and `vis` (the
/// sky's visibility), each a fragment entry point. They read the master's colours, wind weights
/// (`library::ATTRIBUTE_WIND`) and visibility (`ATTRIBUTE_VIS`).
#[derive(Asset, TypePath, AsBindGroup, Clone, Debug, Default)]
#[bind_group_data(BakePassKey)]
pub struct BakePass {
    /// xyz: the master's centre, w: the radius of its sphere (the depth is measured in it).
    #[uniform(0)]
    pub sphere: Vec4,
    pub pass: u32,
}

#[repr(C)]
#[derive(Eq, PartialEq, Hash, Copy, Clone)]
pub struct BakePassKey {
    pass: u32,
}

impl From<&BakePass> for BakePassKey {
    fn from(m: &BakePass) -> Self {
        BakePassKey { pass: m.pass }
    }
}

/// A vertex's visibility, baked before the views (`visibility`): its ambient occlusion on the side its normal faces
/// and on the other, and the sky it sees, `a + b·L` (x: a; y: b.y / 3 + 0.5).
pub const ATTRIBUTE_VIS: bevy::mesh::MeshVertexAttribute =
    bevy::mesh::MeshVertexAttribute::new("Vis", 0x7EE0_0050_0000_0002, bevy::render::render_resource::VertexFormat::Float32x4);

impl Material for BakePass {
    fn vertex_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.bake_normal).into())
    }
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.bake_normal).into())
    }
    // drawn only by the bake's cameras: no prepass and no shadows (their pipelines would not know its attributes)
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
            Mesh::ATTRIBUTE_COLOR.at_shader_location(2),
            crate::library::ATTRIBUTE_WIND.at_shader_location(8),
            ATTRIBUTE_VIS.at_shader_location(9),
        ])?];
        // both sides of every surface, as a ray sees them
        descriptor.primitive.cull_mode = None;
        // the bake doc holds every pass: each pipeline names its own fragment (left unnamed, a module with several
        // fragment entry points is refused by the GPU's validation)
        if let Some(f) = descriptor.fragment.as_mut() {
            f.entry_point = Some(["albedo", "normal", "extra", "vis"][key.bind_group_data.pass as usize % PASSES].into());
        }
        Ok(())
    }
}

#[derive(ShaderType, Clone, Copy, Debug, Default)]
pub struct ImpostorParams {
    /// xyz: the master's centre, w: the radius of its sphere.
    pub sphere: Vec4,
    /// x: views along a side; y: the patch field's start (`patches.rs`); z: mip levels; w: the leaves' transmission.
    pub grid: Vec4,
    /// The box drawn, around the master: xyz its corners; bmin.w what it is (0 a tree, 1 foliage only, 2 solid),
    /// bmax.w its largest wind weight (0: it does not sway, and its box does not grow).
    pub bmin: Vec4,
    pub bmax: Vec4,
    /// xy: half the frame's width and height (m), zw: its texels (across, up).
    pub frame: Vec4,
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
    /// The wind as the grass and the masters have it, given by the same system in the same frame (`wind::blow`), so a
    /// far copy sways as its master.
    #[uniform(7)]
    pub wind: crate::wind::WindParams,
}

impl Material for Impostor {
    // the depth prepass and the shadows would draw the bare box (their own vertex and fragment shaders)
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
    fn specialize(
        _pipeline: &bevy::pbr::MaterialPipeline,
        descriptor: &mut bevy::render::render_resource::RenderPipelineDescriptor,
        _layout: &bevy::mesh::MeshVertexBufferLayoutRef,
        _key: bevy::pbr::MaterialPipelineKey<Self>,
    ) -> Result<(), bevy::render::render_resource::SpecializedMeshPipelineError> {
        // the box's far side: one fragment a pixel, the eye inside the box or not (SmartImposter's ray-box entry)
        descriptor.primitive.cull_mode = Some(bevy::render::render_resource::Face::Front);
        Ok(())
    }
}

impl Impostor {
    /// A far copy drawn as variant `v` of the bake.
    pub fn of(b: &Baked, v: u32) -> Self {
        let Atlases { albedo, normal, extra, params } = b.variants[v as usize % b.variants.len()].clone();
        Impostor { params, albedo, normal, extra, wind: default() }
    }
}

/// The box a far copy is drawn on: its corners at ±1; the shader sets it to the variant's box.
pub fn shell() -> Mesh {
    Cuboid::new(2.0, 2.0, 2.0).mesh().build()
}

/// An atlas as the GPU takes it: `levels` mip levels of a `w` × `h` picture, one after another in `data`.
fn atlas_image(w: usize, h: usize, levels: u32, data: Vec<u8>, format: TextureFormat) -> Image {
    let mut img = Image::default();
    img.texture_descriptor.size = bevy::render::render_resource::Extent3d { width: w as u32, height: h as u32, depth_or_array_layers: 1 };
    img.texture_descriptor.format = format;
    img.texture_descriptor.mip_level_count = levels;
    img.data = Some(data);
    // the main world does not need it after the GPU has it
    img.asset_usage = bevy::asset::RenderAssetUsages::RENDER_WORLD;
    img.sampler = bevy::image::ImageSampler::Descriptor(bevy::image::ImageSamplerDescriptor {
        mag_filter: bevy::image::ImageFilterMode::Linear,
        min_filter: bevy::image::ImageFilterMode::Linear,
        mipmap_filter: bevy::image::ImageFilterMode::Linear,
        ..default()
    });
    img
}

/// The leaves' transmission (the master's: `workshop.rs`), for a plant; none for a rock.
fn transmission(asset: &crate::library::Asset) -> f32 {
    if asset.kind == "plant" { crate::workshop::TRANSMISSION } else { 0.0 }
}

/// Bakes `asset`'s far view, or reads it back when its result is current: spawns, per variant one after another,
/// four cameras that draw each of the 12 × 12 views of its master; their pictures are reduced into the atlases as they
/// come back. The atlases fill when done.
pub fn bake(commands: &mut Commands, asset: &crate::library::Asset, meshes: &mut Assets<Mesh>, images: &mut Assets<Image>, passes: &mut Assets<BakePass>) -> Baked {
    let n = asset.variants.max(1);
    let t = transmission(asset);
    // made once, and belonging to the asset: its recipe, the bake's settings, its shader and the bake code make the
    // key; a result made under it is read back without growing a master
    let key = key_for(asset);
    if let Some(id) = &asset.id
        && let Some(params) = crate::bakes::valid(id, "impostor", &key)
        && let Some(baked) = read(id, n, &params, t, images)
    {
        return baked;
    }
    // not made yet, or made from something else: grow each variant's master, measure it, and draw its views
    let masters: Vec<Mesh> = (0..n).map(|v| prepared(crate::library::master(asset, crate::library::variant_seed(v)))).collect();
    let shapes: Vec<Shape> = masters.iter().map(|m| shape_of(asset, m)).collect();
    // the wind weights baked as shares of the variant's largest (a tree's are a few hundredths: 8 bits keep them so);
    // the shader scales them back by it (`bmax.w`)
    let masters: Vec<Mesh> = masters.into_iter().zip(&shapes).map(|(m, s)| shared_wind(m, s.wind)).collect();
    let wind = shapes.iter().fold(0.0f32, |a, s| a.max(s.wind));
    for (v, s) in shapes.iter().enumerate() {
        let (w, h) = s.atlas();
        info!("impostor {} {v}: {}×{} texels a view (square {}), {} levels, atlas {w}×{h}, {:.1} MB", asset.name, s.res[0], s.res[1], s.square, s.mips, bytes(s) as f32 / 1e6);
    }
    let keep = Arc::new(Keep {
        asset: asset.id.clone(),
        key,
        params: serde_json::json!({ "wind": wind, "variants": shapes, "grid": GRID }),
        left: Mutex::new(n),
    });
    let mut variants = Vec::new();
    for (v, (mesh, shape)) in masters.into_iter().zip(shapes).enumerate() {
        let targets = [images.reserve_handle(), images.reserve_handle(), images.reserve_handle()];
        let delay = v as i32 * (GRID * GRID) as i32 + 12;
        shoot_master(commands, mesh, shape, v as u32, delay, &targets, &keep, meshes, images, passes);
        let [albedo, normal, extra] = targets;
        variants.push(Atlases { albedo, normal, extra, params: shape.params(t) });
    }
    Baked { variants }
}

/// The bytes a variant's atlases take on the GPU, every level.
fn bytes(s: &Shape) -> usize {
    let (w, h) = s.atlas();
    let chain = |w: usize, h: usize, levels: u32| (0..levels).map(|l| (w >> l) * (h >> l) * 4).sum::<usize>();
    2 * chain(w, h, s.mips) + chain(w / 2, h / 2, s.mips - 1)
}

/// A kept far view, read back: each variant's three atlases (every level, deflated) and its shape.
fn read(id: &str, n: u32, params: &serde_json::Value, t: f32, images: &mut Assets<Image>) -> Option<Baked> {
    let shapes: Vec<Shape> = serde_json::from_value(params.get("variants")?.clone()).ok()?;
    if shapes.len() != n as usize {
        return None;
    }
    let mut variants = Vec::new();
    for (v, s) in shapes.iter().enumerate() {
        let (w, h) = s.atlas();
        let part = |name: &str| -> Option<Vec<u8>> {
            use std::io::Read;
            let packed = crate::bakes::part(id, "impostor", &format!("{name} {v}"))?;
            let mut out = Vec::new();
            flate2::read::DeflateDecoder::new(&packed[..]).read_to_end(&mut out).ok()?;
            Some(out)
        };
        let (a, nm, x) = (part("albedo")?, part("normal")?, part("extra")?);
        variants.push(Atlases {
            albedo: images.add(atlas_image(w, h, s.mips, a, TextureFormat::Rgba8Unorm)),
            normal: images.add(atlas_image(w, h, s.mips, nm, TextureFormat::Rgba8Unorm)),
            extra: images.add(atlas_image(w / 2, h / 2, s.mips - 1, x, TextureFormat::Rgba8Unorm)),
            params: s.params(t),
        });
    }
    Some(Baked { variants })
}

/// A master as the bake's passes read it: with its colours, its wind weights (zeros where it has none: it bakes as
/// still) and its visibility.
fn prepared(mut mesh: Mesh) -> Mesh {
    let n = mesh.count_vertices();
    if mesh.attribute(Mesh::ATTRIBUTE_COLOR).is_none() {
        mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, vec![[1.0f32; 4]; n]);
    }
    if mesh.attribute(Mesh::ATTRIBUTE_NORMAL).is_none() {
        mesh.compute_normals();
    }
    let mut mesh = crate::library::with_wind(mesh);
    let vis = visibility(&mesh);
    mesh.insert_attribute(ATTRIBUTE_VIS, vis);
    mesh
}

/// A master's wind weights divided by `most`, its largest.
fn shared_wind(mut mesh: Mesh, most: f32) -> Mesh {
    if most > 0.0
        && let Some(bevy::mesh::VertexAttributeValues::Float32(w)) = mesh.attribute_mut(crate::library::ATTRIBUTE_WIND)
    {
        w.iter_mut().for_each(|x| *x /= most);
    }
    mesh
}

fn positions(mesh: &Mesh) -> &[[f32; 3]] {
    match mesh.attribute(Mesh::ATTRIBUTE_POSITION) {
        Some(bevy::mesh::VertexAttributeValues::Float32x3(p)) => p,
        _ => &[],
    }
}

/// A variant's shape: its box, its LOD scale and from it the frame's texels, cropped to its reach.
fn shape_of(asset: &crate::library::Asset, mesh: &Mesh) -> Shape {
    let pos = positions(mesh);
    let (mut lo, mut hi) = pos.iter().fold((Vec3::MAX, Vec3::MIN), |(lo, hi), p| (lo.min(Vec3::from(*p)), hi.max(Vec3::from(*p))));
    if lo.x > hi.x {
        (lo, hi) = (Vec3::ZERO, Vec3::splat(0.01));
    }
    let wind = match mesh.attribute(crate::library::ATTRIBUTE_WIND) {
        Some(bevy::mesh::VertexAttributeValues::Float32(w)) => w.iter().fold(0.0f32, |a, &b| a.max(b)),
        _ => 0.0,
    };
    let rock = asset.kind == "rock";
    let grass = asset.generator.starts_with("grass");
    // a rock's size sets its detail (it lies flat), a plant's height
    let size = if rock { (hi - lo).max_element() } else { hi.y - lo.y };
    let mut lod_scale = (size / 16.0).clamp(0.25, 1.2);
    if grass {
        lod_scale = lod_scale.max(0.4);
    }
    let texel_scale = if grass { 1.6 } else { 1.0 };
    let c = (lo + hi) * 0.5;
    let r = ((hi - lo).length() * 0.5).max(0.005);
    let square = res_for(r / texel_scale, lod_scale);
    let mips = atlas_mips(square);
    let texels = square as f32 / (2.0 * r);
    // how far it reaches from the box's centre: sideways from the vertical through it, and at all
    let (across, all) = pos.iter().fold((0.0f32, 0.0f32), |(a, b), p| {
        let d = Vec3::from(*p) - c;
        (a.max(d.x * d.x + d.z * d.z), b.max(d.length_squared()))
    });
    let res = frame_res(square, mips, across.sqrt() * texels, all.sqrt() * texels);
    // solid, or leaves and bark told apart by colour. SmartImposter's third kind, foliage only (its grass and ferns:
    // all sunlight scaled by the spread), holds for blades whose normals lean up; ours face every way, as a tree's
    // leaves do, so every plant takes the tree's lighting
    let kind = if rock { 2.0 } else { 0.0 };
    Shape { lo: lo.into(), hi: hi.into(), square, res, mips, kind, wind }
}

/// Each vertex's visibility (`ATTRIBUTE_VIS`), what SmartImposter's bake traces from every hit with occlusion rays
/// (6 within 1.5 m) and visibility rays (12 within 2.2 radii): here the rays march a grid of the master's leaf area as
/// a density (Beer–Lambert), on a fixed set of directions, from each occupied cell.
fn visibility(mesh: &Mesh) -> Vec<[f32; 4]> {
    let pos = positions(mesh);
    let nrm: &[[f32; 3]] = match mesh.attribute(Mesh::ATTRIBUTE_NORMAL) {
        Some(bevy::mesh::VertexAttributeValues::Float32x3(n)) => n,
        _ => &[],
    };
    let idx: Vec<u32> = match mesh.indices() {
        Some(bevy::mesh::Indices::U32(i)) => i.clone(),
        Some(bevy::mesh::Indices::U16(i)) => i.iter().map(|&x| x as u32).collect(),
        None => (0..pos.len() as u32).collect(),
    };
    if pos.is_empty() || nrm.len() != pos.len() {
        return vec![[1.0, 1.0, 1.0, 0.5]; pos.len()];
    }
    let (lo, hi) = pos.iter().fold((Vec3::MAX, Vec3::MIN), |(lo, hi), p| (lo.min(Vec3::from(*p)), hi.max(Vec3::from(*p))));
    let r = ((hi - lo).length() * 0.5).max(0.005);
    // cells: 64 along the longest side, one empty cell around
    let cell = ((hi - lo).max_element() / 62.0).max(1e-4);
    let origin = lo - Vec3::splat(cell);
    let dims = (((hi - lo) / cell).ceil().as_uvec3() + UVec3::splat(3)).to_array().map(|d| d as usize);
    let at = |p: Vec3| -> Option<usize> {
        let q = ((p - origin) / cell).floor();
        if q.cmplt(Vec3::ZERO).any() {
            return None;
        }
        let q = q.as_uvec3();
        let (x, y, z) = (q.x as usize, q.y as usize, q.z as usize);
        (x < dims[0] && y < dims[1] && z < dims[2]).then(|| (z * dims[1] + y) * dims[0] + x)
    };
    // the leaf area in each cell as an extinction: half the area (leaves facing every way) over the volume
    let mut sigma = vec![0.0f32; dims[0] * dims[1] * dims[2]];
    for t in idx.chunks_exact(3) {
        let [a, b, c] = [t[0], t[1], t[2]].map(|i| Vec3::from(pos[i as usize]));
        if let Some(k) = at((a + b + c) / 3.0) {
            sigma[k] += 0.5 * 0.5 * (b - a).cross(c - a).length() / (cell * cell * cell);
        }
    }
    // a fixed spread of directions over the sphere (Fibonacci)
    const DIRS: usize = 32;
    let dirs: Vec<Vec3> = (0..DIRS)
        .map(|i| {
            let y = 1.0 - (i as f32 + 0.5) / DIRS as f32 * 2.0;
            let s = (1.0 - y * y).max(0.0).sqrt();
            let phi = i as f32 * 2.399_963;
            Vec3::new(s * phi.cos(), y, s * phi.sin())
        })
        .collect();
    // per occupied cell: the light let through toward each direction, within the occlusion's reach and the sky's
    let mut cells: Vec<usize> = pos.iter().filter_map(|p| at(Vec3::from(*p))).collect();
    cells.sort_unstable();
    cells.dedup();
    let reach_ao = AO_RANGE.min(2.2 * r);
    let march = |k: usize| -> Vec<[f32; 2]> {
        let (x, y, z) = (k % dims[0], (k / dims[0]) % dims[1], k / (dims[0] * dims[1]));
        let start = origin + (Vec3::new(x as f32, y as f32, z as f32) + 0.5) * cell;
        dirs.iter()
            .map(|d| {
                let (mut tau, mut tau_ao, mut s) = (0.0f32, 0.0f32, cell);
                while s < 2.2 * r {
                    let Some(q) = at(start + *d * s) else { break };
                    tau += sigma[q] * cell * 0.5;
                    if s < reach_ao {
                        tau_ao = tau;
                    }
                    s += cell * 0.5;
                }
                [(-tau_ao).exp(), (-tau).exp()]
            })
            .collect()
    };
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8);
    let chunk = cells.len().div_ceil(threads).max(1);
    let seen: std::collections::HashMap<usize, Vec<[f32; 2]>> = std::thread::scope(|sc| {
        let handles: Vec<_> = cells.chunks(chunk).map(|part| sc.spawn(|| part.iter().map(|&k| (k, march(k))).collect::<Vec<_>>())).collect();
        handles.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
    });
    pos.iter()
        .zip(nrm)
        .map(|(p, n)| {
            let Some(t) = at(Vec3::from(*p)).and_then(|k| seen.get(&k)) else { return [1.0, 1.0, 1.0, 0.5] };
            let n = Vec3::from(*n).normalize_or_zero();
            // occlusion: cosine-weighted over the directions on each side of the surface
            let ao = |side: f32| {
                let (mut s, mut w) = (0.0, 0.0);
                for (d, v) in dirs.iter().zip(t) {
                    let c = side * n.dot(*d);
                    if c > 0.0 {
                        s += c * v[0];
                        w += c;
                    }
                }
                if w > 0.0 { s / w } else { 1.0 }
            };
            // the sky: a + b·L fitted over the sphere (b = 3 × the mean of v·L)
            let a = t.iter().map(|v| v[1]).sum::<f32>() / DIRS as f32;
            let by = 3.0 * dirs.iter().zip(t).map(|(d, v)| d.y * v[1]).sum::<f32>() / DIRS as f32;
            [ao(1.0), ao(-1.0), a, (by / 3.0 + 0.5).clamp(0.0, 1.0)]
        })
        .collect()
}

/// The key of an asset's impostor: its recipe, the bake's settings, its shader and the bake code (`bakes::key`).
pub fn key_for(asset: &crate::library::Asset) -> String {
    let settings = format!("{GRID} {SUB} {TEXEL} {MAX_RES} {AO_RANGE} {PAD}");
    crate::bakes::key("impostor", &[&crate::library::recipe_bytes(asset), settings.as_bytes()], &[&crate::root::root().shaders.bake_normal])
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
        bake(&mut commands, &asset, &mut meshes, &mut images, &mut passes);
    }
    job.frames += 1;
    // a variant takes about 160 frames and its read-backs a few more; a bake that has not finished in several times
    // that failed
    if job.frames > 400 + 600 * asset.variants.max(1) {
        error!("--bake: {} did not finish", asset.name);
        exit.write(AppExit::error());
    }
}

/// Sets up the cameras and the copies that draw variant `v`'s views, a layer a pass, starting `delay` ticks late.
#[allow(clippy::too_many_arguments)]
fn shoot_master(
    commands: &mut Commands,
    mesh: Mesh,
    shape: Shape,
    v: u32,
    delay: i32,
    targets: &[Handle<Image>; 3],
    keep: &Arc<Keep>,
    meshes: &mut Assets<Mesh>,
    images: &mut Assets<Image>,
    passes: &mut Assets<BakePass>,
) {
    let m = meshes.add(mesh);
    let ticks = (GRID * GRID) as i32 + 8 + WARM + delay;
    let first = FIRST_LAYER + PASSES * (NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed) % SETS);
    let (centre, radius, ext) = (shape.centre(), shape.radius(), shape.ext());
    let (w, h) = shape.atlas();
    let job = Arc::new(Mutex::new(Job {
        shape,
        views: Default::default(),
        albedo: vec![0; w * h * 4],
        normal: vec![0; w * h * 4],
        vis: vec![0; w * h * 4],
        done: 0,
        targets: targets.clone(),
        keep: (keep.clone(), v),
    }));
    for pass in 0..PASSES {
        let mat = passes.add(BakePass { sphere: centre.extend(radius), pass: pass as u32 });
        commands.spawn((Baking(ticks as u32), Mesh3d(m.clone()), MeshMaterial3d(mat), RenderLayers::layer(first + pass), Transform::default()));
        // the albedo in sRGB (its darks kept), the rest as they are
        let format = if pass == 0 { TextureFormat::Rgba8UnormSrgb } else { TextureFormat::Rgba8Unorm };
        let mut img = Image::new_target_texture(shape.res[0] * SUB, shape.res[1] * SUB, format, None);
        img.texture_descriptor.usage |= bevy::render::render_resource::TextureUsages::COPY_SRC;
        let view = images.add(img);
        commands.spawn((
            Baking(ticks as u32 + 200),
            Shooting { k: -WARM - delay, pass, centre, radius, view: view.clone(), job: job.clone() },
            Camera3d::default(),
            Camera { order: -100, clear_color: ClearColorConfig::Custom(Color::NONE), ..default() },
            RenderTarget::Image(view.into()),
            // the frame cropped about the sphere's centre, as SmartImposter crops its square
            Projection::Orthographic(OrthographicProjection {
                scaling_mode: ScalingMode::Fixed { width: ext.x * 2.0, height: ext.y * 2.0 },
                near: 0.0,
                far: radius * 4.0,
                ..OrthographicProjection::default_3d()
            }),
            Tonemapping::None,
            DebandDither::Disabled,
            Msaa::Off,
            RenderLayers::layer(first + pass),
            Transform::default(),
        ));
    }
}

/// Points each baking camera at its view of this tick and reads the picture back once drawn.
fn shoot(mut commands: Commands, mut cams: Query<(&mut Shooting, &mut Transform, &mut Camera)>) {
    let n = (GRID * GRID) as i32;
    for (mut s, mut t, mut c) in &mut cams {
        if s.k < n {
            let k = s.k.max(0) as u32;
            let f = frame_dir(k % GRID, k / GRID);
            *t = Transform::from_translation(s.centre + f * s.radius * 2.0).looking_at(s.centre, frame_up(f));
            if s.k >= 0 {
                let (job, pass) = (s.job.clone(), s.pass);
                commands.spawn(bevy::render::gpu_readback::ReadbackOnce::texture(s.view.clone())).observe(
                    move |ev: On<bevy::render::gpu_readback::ReadbackComplete>, mut images: ResMut<Assets<Image>>| {
                        let Ok(mut j) = job.lock() else { return };
                        let slot = j.views.entry(k).or_insert_with(Default::default);
                        slot[pass] = Some(ev.data.clone());
                        if slot.iter().all(Option::is_some) {
                            let views = j.views.remove(&k).unwrap_or_default().map(Option::unwrap_or_default);
                            reduce(&mut j, k, &views);
                            j.done += 1;
                            if j.done == GRID * GRID {
                                complete(&mut j, &mut images);
                            }
                        }
                    },
                );
            }
        } else if s.k == n + 2 {
            c.is_active = false;
        }
        s.k += 1;
    }
}

/// sRGB bytes to linear, once.
fn srgb_table() -> &'static [f32; 256] {
    static T: std::sync::OnceLock<[f32; 256]> = std::sync::OnceLock::new();
    T.get_or_init(|| std::array::from_fn(|i| Color::srgb_u8(i as u8, 0, 0).to_linear().red))
}

fn oct_encode(n: Vec3) -> Vec2 {
    let n = n / (n.x.abs() + n.y.abs() + n.z.abs()).max(1e-8);
    let p = Vec2::new(n.x, n.z);
    if n.y < 0.0 {
        let s = |v: f32| if v >= 0.0 { 1.0 } else { -1.0 };
        Vec2::new((1.0 - p.y.abs()) * s(p.x), (1.0 - p.x.abs()) * s(p.y))
    } else {
        p
    }
}

fn oct_decode(e: Vec2) -> Vec3 {
    let mut v = Vec3::new(e.x, 1.0 - e.x.abs() - e.y.abs(), e.y);
    if v.y < 0.0 {
        let s = |v: f32| if v >= 0.0 { 1.0 } else { -1.0 };
        let p = Vec2::new((1.0 - v.z.abs()) * s(v.x), (1.0 - v.x.abs()) * s(v.z));
        (v.x, v.z) = (p.x, p.y);
    }
    v.normalize_or_zero()
}

fn byte(x: f32) -> u8 {
    (x.clamp(0.0, 1.0) * 255.0 + 0.5) as u8
}

/// Reduces view `k`'s pictures (3 × 3 samples a texel) into the atlases at its frame: coverage the fraction of samples
/// that hit, every other channel the mean over the hits (`bake.rgen`).
fn reduce(j: &mut Job, k: u32, views: &[Vec<u8>; PASSES]) {
    let [rw, rh] = j.shape.res.map(|x| x as usize);
    let sub = SUB as usize;
    // a read-back's rows are padded to 256 bytes
    let stride = (rw * sub * 4).div_ceil(256) * 256;
    let (aw, _) = j.shape.atlas();
    let (fi, fj) = ((k % GRID) as usize, (k / GRID) as usize);
    let lin = srgb_table();
    let f = |b: u8| b as f32 / 255.0;
    for y in 0..rh {
        for x in 0..rw {
            let (mut hits, mut alb, mut nsum) = (0u32, Vec3::ZERO, Vec3::ZERO);
            let (mut depth, mut ao, mut wind, mut va, mut vb) = (0.0f32, 0.0f32, 0.0f32, 0.0f32, 0.0f32);
            for sy in 0..sub {
                for sx in 0..sub {
                    let p = (y * sub + sy) * stride + (x * sub + sx) * 4;
                    if views[0].len() < p + 4 || views[0][p + 3] < 128 {
                        continue;
                    }
                    hits += 1;
                    alb += Vec3::new(lin[views[0][p] as usize], lin[views[0][p + 1] as usize], lin[views[0][p + 2] as usize]);
                    nsum += Vec3::new(f(views[1][p]), f(views[1][p + 1]), f(views[1][p + 2])) * 2.0 - 1.0;
                    depth += f(views[2][p]);
                    ao += f(views[2][p + 1]);
                    wind += f(views[2][p + 2]);
                    va += f(views[3][p]);
                    vb += f(views[3][p + 1]);
                }
            }
            let at = ((fj * rh + y) * aw + fi * rw + x) * 4;
            let (a, nm, v) = if hits == 0 {
                ([0, 0, 0, 255], [128, 128, 0, 0], [255, 128, 128, 0])
            } else {
                let inv = 1.0 / hits as f32;
                let s = (alb * inv).max(Vec3::ZERO);
                let e = oct_encode(nsum.normalize_or_zero()) * 0.5 + 0.5;
                (
                    [byte(s.x.sqrt()), byte(s.y.sqrt()), byte(s.z.sqrt()), byte(ao * inv)],
                    [byte(e.x), byte(e.y), byte(depth * inv), byte(hits as f32 / (SUB * SUB) as f32)],
                    [byte(va * inv), byte(nsum.length() * inv), byte(vb * inv), byte(wind * inv)],
                )
            };
            j.albedo[at..at + 4].copy_from_slice(&a);
            j.normal[at..at + 4].copy_from_slice(&nm);
            j.vis[at..at + 4].copy_from_slice(&v);
        }
    }
}

/// One coverage-weighted mip step of the three atlases (`mip.comp`): each texel the mean of its four, weighted by
/// their coverage; the coverage itself averaged; the normal spread shortened by how much the four agree.
fn mip_step(a: &[u8], n: &[u8], v: &[u8], w: usize, h: usize) -> [Vec<u8>; 3] {
    let (w2, h2) = (w / 2, h / 2);
    let mut out = [vec![0u8; w2 * h2 * 4], vec![0u8; w2 * h2 * 4], vec![0u8; w2 * h2 * 4]];
    let f = |b: u8| b as f32 / 255.0;
    for y in 0..h2 {
        for x in 0..w2 {
            let (mut c_s, mut a_s, mut v_s, mut n_s, mut h_s) = (0.0f32, Vec4::ZERO, Vec4::ZERO, Vec3::ZERO, 0.0f32);
            for q in 0..4 {
                let p = ((y * 2 + (q >> 1)) * w + x * 2 + (q & 1)) * 4;
                let wq = f(n[p + 3]);
                c_s += wq;
                a_s += Vec4::new(f(a[p]), f(a[p + 1]), f(a[p + 2]), f(a[p + 3])) * wq;
                v_s += Vec4::new(f(v[p]), f(v[p + 1]), f(v[p + 2]), f(v[p + 3])) * wq;
                n_s += oct_decode(Vec2::new(f(n[p]), f(n[p + 1])) * 2.0 - 1.0) * wq;
                h_s += f(n[p + 2]) * wq;
            }
            let at = (y * w2 + x) * 4;
            let (ta, tn, tv) = if c_s < 1e-4 {
                ([0, 0, 0, 255], [128, 128, 0, 0], [255, 128, 128, 0])
            } else {
                let aa = a_s / c_s;
                let e = oct_encode(n_s.normalize_or_zero()) * 0.5 + 0.5;
                let mut vv = v_s / c_s;
                vv.y *= (n_s.length() / c_s).clamp(0.0, 1.0);
                (aa.to_array().map(byte), [byte(e.x), byte(e.y), byte(h_s / c_s), byte(c_s * 0.25)], vv.to_array().map(byte))
            };
            out[0][at..at + 4].copy_from_slice(&ta);
            out[1][at..at + 4].copy_from_slice(&tn);
            out[2][at..at + 4].copy_from_slice(&tv);
        }
    }
    out
}

/// Every view in: the mips made, the atlases given to the GPU and kept in theDB (deflated, every level).
fn complete(j: &mut Job, images: &mut Assets<Image>) {
    let s = j.shape;
    let (w, h) = s.atlas();
    let (mut a, mut n, mut v) = (std::mem::take(&mut j.albedo), std::mem::take(&mut j.normal), std::mem::take(&mut j.vis));
    let (mut ca, mut cn, mut cv) = (a.clone(), n.clone(), Vec::new());
    for l in 0..s.mips - 1 {
        let [na, nn, nv] = mip_step(&a, &n, &v, w >> l, h >> l);
        ca.extend_from_slice(&na);
        cn.extend_from_slice(&nn);
        // the visibility is kept at half resolution: from the first step on
        cv.extend_from_slice(&nv);
        (a, n, v) = (na, nn, nv);
    }
    let (keep, variant) = &j.keep;
    if let Some(asset) = &keep.asset {
        let pack = |data: &[u8]| {
            use std::io::Write;
            let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast());
            let _ = e.write_all(data);
            e.finish().unwrap_or_default()
        };
        for (name, data) in [("albedo", &ca), ("normal", &cn), ("extra", &cv)] {
            crate::bakes::keep_part(asset, "impostor", &format!("{name} {variant}"), &pack(data));
        }
        let mut left = keep.left.lock().unwrap_or_else(|e| e.into_inner());
        *left = left.saturating_sub(1);
        if *left == 0 {
            crate::bakes::seal(asset, "impostor", &keep.key, &keep.params);
        }
    }
    let [ta, tn, tv] = j.targets.clone();
    let _ = images.insert(&ta, atlas_image(w, h, s.mips, ca, TextureFormat::Rgba8Unorm));
    let _ = images.insert(&tn, atlas_image(w, h, s.mips, cn, TextureFormat::Rgba8Unorm));
    let _ = images.insert(&tv, atlas_image(w / 2, h / 2, s.mips - 1, cv, TextureFormat::Rgba8Unorm));
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
