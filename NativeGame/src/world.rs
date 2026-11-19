//! The world on its first day: a green plain to the horizon under a sky colour, with haze toward the horizon.

use bevy::pbr::{DistanceFog, FogFalloff};
use bevy::prelude::*;

pub const SKY: Color = Color::srgb(0.53, 0.70, 0.90);
pub const HAZE: Color = Color::srgb(0.80, 0.86, 0.92);
pub const GRASS: Color = Color::srgb(0.30, 0.55, 0.20);

/// What belongs to the plain, hidden while another scene is shown.
#[derive(Component)]
pub struct Plain;

/// The one camera of the app: the walker's eye in the Game, the virtual camera in the Studio.
#[derive(Component)]
pub struct Eye;

pub fn plugin(app: &mut App) {
    app.insert_resource(ClearColor(SKY)).add_systems(Startup, spawn);
}

/// The plane's size, and the size of one tile of its pattern, in metres.
const PLANE_M: f32 = 400_000.0; // to the horizon from 12 km up (about 390 km away)
const TILE_M: f32 = 6.0;

fn spawn(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
) {
    commands.spawn((
        Plain,
        Mesh3d(meshes.add(Plane3d::default().mesh().size(PLANE_M, PLANE_M))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: GRASS,
            base_color_texture: Some(images.add(mottle())),
            uv_transform: bevy::math::Affine2::from_scale(Vec2::splat(PLANE_M / TILE_M)),
            perceptual_roughness: 1.0,
            ..default()
        })),
    ));
    commands.spawn((
        Plain,
        DirectionalLight { illuminance: 9_000.0, ..default() },
        Transform::from_xyz(0.3, 1.0, 0.4).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Eye,
        IsDefaultUiCamera,
        Camera3d::default(),
        Projection::Perspective(PerspectiveProjection { near: 0.05, far: 500_000.0, ..default() }),
        Transform::from_xyz(0.0, 1.6, 0.0),
        DistanceFog {
            color: HAZE,
            falloff: FogFalloff::from_visibility_colors(6_000.0, HAZE, HAZE),
            ..default()
        },
    ));
}

/// A soft mottle of lighter and darker green that tiles seamlessly, so the eye sees the ground move under it. Its
/// smaller copies (mip levels) are made here too, so it fades to an even green toward the horizon instead of
/// shimmering.
pub fn mottle() -> Image {
    use bevy::image::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
    use bevy::render::render_resource::{Extent3d, TextureFormat};
    const N: usize = 256;
    let hash = |x: i32, y: i32, p: i32| {
        let (x, y) = (x.rem_euclid(p), y.rem_euclid(p));
        let h = (x as u32).wrapping_mul(0x8da6_b343) ^ (y as u32).wrapping_mul(0xd816_3841);
        ((h ^ (h >> 13)).wrapping_mul(0x85eb_ca6b) >> 8) as f32 / (1u32 << 24) as f32
    };
    // value noise with a whole number of cells per tile, so it repeats without a seam
    let noise = |u: f32, v: f32, cells: i32| {
        let (x, y) = (u * cells as f32, v * cells as f32);
        let (ix, iy) = (x.floor() as i32, y.floor() as i32);
        let (fx, fy) = (x - ix as f32, y - iy as f32);
        let (sx, sy) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
        let a = hash(ix, iy, cells) + (hash(ix + 1, iy, cells) - hash(ix, iy, cells)) * sx;
        let b = hash(ix, iy + 1, cells) + (hash(ix + 1, iy + 1, cells) - hash(ix, iy + 1, cells)) * sx;
        a + (b - a) * sy
    };
    let mut level: Vec<f32> = (0..N * N)
        .map(|i| {
            let (u, v) = ((i % N) as f32 / N as f32, (i / N) as f32 / N as f32);
            0.55 * noise(u, v, 4) + 0.30 * noise(u, v, 12) + 0.15 * noise(u, v, 40)
        })
        .collect();
    let mut data = Vec::new();
    let (mut size, mut mips) = (N, 0);
    loop {
        for &t in &level {
            let g = (0.45 + 0.95 * t).clamp(0.0, 1.0); // brightness around 1, multiplied by the grass colour
            let byte = (g.powf(1.0 / 2.2) * 255.0) as u8;
            data.extend_from_slice(&[byte, byte, byte, 255]);
        }
        mips += 1;
        if size == 1 {
            break;
        }
        let half = size / 2;
        level = (0..half * half)
            .map(|i| {
                let (x, y) = (2 * (i % half), 2 * (i / half));
                (level[y * size + x] + level[y * size + x + 1] + level[(y + 1) * size + x] + level[(y + 1) * size + x + 1]) / 4.0
            })
            .collect();
        size = half;
    }
    let blank = Image::default();
    Image {
        data: Some(data),
        texture_descriptor: bevy::render::render_resource::TextureDescriptor {
            size: Extent3d { width: N as u32, height: N as u32, depth_or_array_layers: 1 },
            format: TextureFormat::Rgba8UnormSrgb,
            mip_level_count: mips,
            ..blank.texture_descriptor.clone()
        },
        sampler: ImageSampler::Descriptor(ImageSamplerDescriptor {
        address_mode_u: ImageAddressMode::Repeat,
        address_mode_v: ImageAddressMode::Repeat,
        mag_filter: ImageFilterMode::Linear,
        min_filter: ImageFilterMode::Linear,
        mipmap_filter: ImageFilterMode::Linear,
            anisotropy_clamp: 16,
            ..default()
        }),
        ..blank
    }
}
