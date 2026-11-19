//! The lawn, after SmartImposter's: the mid and far sward with no geometry. One square metre of the meadow's real
//! blades (the library's grass patch, between copies of itself so it wraps) is baked once from 16 azimuths × 6 low
//! slopes. A view from direction f stores, for every point of the plane of the blade tips, the height of the first
//! blade on the line along f through it, with that blade's colour and normal, and whether any blade is on it
//! (coverage). The ground shader then needs one lookup per pixel: where the eye's ray crosses the tip plane, in the
//! view nearest the eye's direction, is exactly what the ray hits first (`ground.wesl`).

use bevy::camera::visibility::{NoFrustumCulling, RenderLayers};
use bevy::camera::RenderTarget;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::pbr::{Material, MaterialPlugin};
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType, TextureFormat, TextureUsages};
use bevy::shader::ShaderRef;

pub const AZIMUTHS: u32 = 16;
pub const SLOPES: [f32; 6] = [8.0, 12.0, 18.0, 27.0, 40.0, 62.0];
pub const RES: u32 = 192;
/// The top of the slab the views are stored on, above the ground (taller than the tallest blade).
pub const TOP: f32 = 0.6;
const WARM: i32 = 90;
const LAYERS: [usize; 2] = [6, 7];

#[derive(ShaderType, Clone, Copy, Debug, Default)]
pub struct BakeParams {
    /// xy: the shear along the view (f.xz / f.y), z: 0 colour, 1 height and normal; w: the slab top.
    pub v: Vec4,
}

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct LawnBake {
    #[uniform(0)]
    pub params: BakeParams,
}

impl Material for LawnBake {
    fn vertex_shader() -> ShaderRef {
        "shaders/lawn_bake.wesl".into()
    }
    fn fragment_shader() -> ShaderRef {
        "shaders/lawn_bake.wesl".into()
    }
    fn enable_prepass() -> bool {
        false
    }
    fn enable_shadows() -> bool {
        false
    }
}

/// The baked lawn: its colour atlas (rgb, coverage in a) and its height-and-normal atlas.
#[derive(Resource, Clone)]
pub struct Lawn {
    pub albedo: Handle<Image>,
    pub height: Handle<Image>,
    /// How many of the two atlases are filled. A material bound to them earlier keeps the empty pictures on the
    /// GPU, so the ground takes them only once both are done (`meadow::attach_lawn`).
    pub done: std::sync::Arc<std::sync::atomic::AtomicU32>,
}

#[derive(Component)]
struct Baker {
    k: i32,
    mode: u32,
    material: Handle<LawnBake>,
    views: Vec<Handle<Image>>,
    atlas: Handle<Image>,
    got: std::sync::Arc<std::sync::Mutex<(Vec<u8>, u32)>>,
    done: std::sync::Arc<std::sync::atomic::AtomicU32>,
}

pub fn plugin(app: &mut App) {
    app.add_plugins(MaterialPlugin::<LawnBake>::default()).add_systems(Startup, bake).add_systems(Update, shoot);
}

fn view_dir(k: u32) -> Vec3 {
    let (a, s) = (k % AZIMUTHS, k / AZIMUTHS);
    let az = a as f32 / AZIMUTHS as f32 * std::f32::consts::TAU;
    let el = SLOPES[s as usize].to_radians();
    Vec3::new(el.cos() * az.cos(), el.sin(), el.cos() * az.sin())
}

fn bake(mut commands: Commands, mut meshes: ResMut<Assets<Mesh>>, mut images: ResMut<Assets<Image>>, mut mats: ResMut<Assets<LawnBake>>) {
    let library = crate::library::load();
    let Some(asset) = library.get("grass patch") else { return };
    let master = crate::library::master(asset, 7);
    // the tile between 9 × 9 copies of itself: a view's line along f may cross 4 m of ground before the tip plane
    let mut tiled = master.clone();
    for i in -4..=4 {
        for j in -4..=4 {
            if i == 0 && j == 0 {
                continue;
            }
            let copy = master.clone().translated_by(Vec3::new(i as f32, 0.0, j as f32));
            let _ = tiled.merge(&copy);
        }
    }
    let mesh = meshes.add(tiled);
    let n = AZIMUTHS * SLOPES.len() as u32;
    let (w, h) = (AZIMUTHS * RES, SLOPES.len() as u32 * RES);
    let atlas = |format: TextureFormat| {
        let mut img = Image::new_fill(
            bevy::render::render_resource::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            bevy::render::render_resource::TextureDimension::D2,
            &[0, 0, 0, 0],
            format,
            bevy::asset::RenderAssetUsages::default(),
        );
        img.sampler = bevy::image::ImageSampler::Descriptor(bevy::image::ImageSamplerDescriptor {
            address_mode_u: bevy::image::ImageAddressMode::ClampToEdge,
            address_mode_v: bevy::image::ImageAddressMode::ClampToEdge,
            mag_filter: bevy::image::ImageFilterMode::Linear,
            min_filter: bevy::image::ImageFilterMode::Linear,
            mipmap_filter: bevy::image::ImageFilterMode::Linear,
            ..default()
        });
        img
    };
    let done = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
    let albedo = images.add(atlas(TextureFormat::Rgba8UnormSrgb));
    let height = images.add(atlas(TextureFormat::Rgba8Unorm));
    for (mode, (layer, (target, format))) in [(albedo.clone(), TextureFormat::Rgba8UnormSrgb), (height.clone(), TextureFormat::Rgba8Unorm)].into_iter().enumerate().map(|(m, t)| (m, (LAYERS[m], t))) {
        let material = mats.add(LawnBake { params: BakeParams { v: Vec4::new(0.0, 0.0, mode as f32, TOP) } });
        commands.spawn((Mesh3d(mesh.clone()), MeshMaterial3d(material.clone()), RenderLayers::layer(layer), NoFrustumCulling, Transform::default()));
        let views: Vec<Handle<Image>> = (0..n)
            .map(|_| {
                let mut img = Image::new_target_texture(RES, RES, format, None);
                img.texture_descriptor.usage |= TextureUsages::COPY_SRC;
                images.add(img)
            })
            .collect();
        commands.spawn((
            Baker { k: -WARM, mode: mode as u32, material, views: views.clone(), atlas: target, got: Default::default(), done: done.clone() },
            Camera3d::default(),
            Camera { order: -90, clear_color: ClearColorConfig::Custom(Color::NONE), ..default() },
            RenderTarget::Image(views[0].clone().into()),
            Tonemapping::None,
            bevy::core_pipeline::tonemapping::DebandDither::Disabled,
            // four samples a texel, as SmartImposter's 3 × 3: a blade (3.5 mm) is thinner than a texel (5 mm), and with
            // one sample most were missed, leaving half of every view empty
            Msaa::Sample4,
            RenderLayers::layer(layer),
            Transform::from_xyz(0.0, 10.0, 0.0).looking_at(Vec3::ZERO, Vec3::Z),
        ));
    }
    commands.insert_resource(Lawn { albedo, height, done });
}

fn shoot(mut commands: Commands, mut bakers: Query<(Entity, &mut Baker, &mut RenderTarget, &mut Camera)>, mut mats: ResMut<Assets<LawnBake>>) {
    let n = (AZIMUTHS * SLOPES.len() as u32) as i32;
    for (e, mut b, mut target, mut cam) in &mut bakers {
        if b.k < n {
            let k = b.k.max(0) as u32;
            let f = view_dir(k);
            if let Some(mut m) = mats.get_mut(&b.material) {
                m.params.v = Vec4::new(f.x / f.y, f.z / f.y, b.mode as f32, TOP);
            }
            *target = RenderTarget::Image(b.views[k as usize].clone().into());
        } else if b.k == n + 2 {
            cam.is_active = false;
            for (k, view) in b.views.iter().enumerate() {
                let (a, s) = (k as u32 % AZIMUTHS, k as u32 / AZIMUTHS);
                let (got, atlas, srgb, done) = (b.got.clone(), b.atlas.clone(), b.mode == 0, b.done.clone());
                commands.spawn(bevy::render::gpu_readback::ReadbackOnce::texture(view.clone())).observe(
                    move |ev: On<bevy::render::gpu_readback::ReadbackComplete>, mut images: ResMut<Assets<Image>>| {
                        let Ok(mut g) = got.lock() else { return };
                        let w = (AZIMUTHS * RES) as usize;
                        let rows = SLOPES.len() * RES as usize;
                        if g.0.is_empty() {
                            g.0 = vec![0; w * rows * 4];
                        }
                        let row = (RES * 4) as usize;
                        for y in 0..RES as usize {
                            let at = ((s as usize * RES as usize + y) * w + a as usize * RES as usize) * 4;
                            g.0[at..at + row].copy_from_slice(&ev.data[y * row..(y + 1) * row]);
                        }
                        g.1 += 1;
                        if g.1 == AZIMUTHS * SLOPES.len() as u32
                            && let Some(mut img) = images.get_mut(&atlas)
                        {
                            let data = std::mem::take(&mut g.0);
                            // LAWN_DUMP=<dir>: the atlas as raw RGBA, for checking the bake
                            if let Some(dir) = std::env::var_os("LAWN_DUMP") {
                                let _ = std::fs::write(std::path::Path::new(&dir).join(format!("lawn-{}.rgba", if srgb { "albedo" } else { "height" })), &data);
                            }
                            let (data, levels) = mips(&data, srgb);
                            img.data = Some(data);
                            img.texture_descriptor.mip_level_count = levels;
                            done.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        }
                    },
                );
            }
        } else if b.k > n + 300 {
            commands.entity(e).despawn();
        }
        b.k += 1;
    }
}

/// The atlas with its smaller copies, each texel the coverage-weighted mean of four (so empty texels between blades
/// do not darken them), colours averaged in linear light. Five halvings: a frame of 192 texels stays whole down to 6.
/// Without them a far pixel picks one texel of many blades and the lawn shimmers, or must be flattened.
fn mips(base: &[u8], srgb: bool) -> (Vec<u8>, u32) {
    let to_lin = |b: u8| if srgb { (b as f32 / 255.0).powf(2.2) } else { b as f32 / 255.0 };
    let to_byte = |x: f32| ((if srgb { x.max(0.0).powf(1.0 / 2.2) } else { x }).clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
    let (mut w, mut h) = ((AZIMUTHS * RES) as usize, (SLOPES.len() as u32 * RES) as usize);
    let mut level: Vec<[f32; 4]> = base.chunks(4).map(|c| [to_lin(c[0]), to_lin(c[1]), to_lin(c[2]), c[3] as f32 / 255.0]).collect();
    let mut out = base.to_vec();
    let mut levels = 1;
    for _ in 0..5 {
        let (nw, nh) = (w / 2, h / 2);
        let mut next = vec![[0.0f32; 4]; nw * nh];
        for y in 0..nh {
            for x in 0..nw {
                let q = [level[2 * y * w + 2 * x], level[2 * y * w + 2 * x + 1], level[(2 * y + 1) * w + 2 * x], level[(2 * y + 1) * w + 2 * x + 1]];
                let a: f32 = q.iter().map(|t| t[3]).sum();
                let mut t = [0.0; 4];
                for c in 0..3 {
                    t[c] = if a > 0.0 { q.iter().map(|v| v[c] * v[3]).sum::<f32>() / a } else { 0.0 };
                }
                t[3] = a / 4.0;
                next[y * nw + x] = t;
            }
        }
        for t in &next {
            out.extend_from_slice(&[to_byte(t[0]), to_byte(t[1]), to_byte(t[2]), (t[3].clamp(0.0, 1.0) * 255.0 + 0.5) as u8]);
        }
        level = next;
        (w, h) = (nw, nh);
        levels += 1;
    }
    (out, levels)
}
