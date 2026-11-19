//! Clouds: a layer of fair-weather cumulus about 1.5 km up, lit by the sun and the moon like everything else (so they
//! turn gold at sunset), drifting with the wind, fading into the haze toward the horizon. The cloud shapes are
//! generated: layered noise, cut at a cover, softened at the edges.

use bevy::image::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDescriptor, TextureFormat};

/// The layer's height and width, and how wide one tile of its pattern is, in metres.
const HEIGHT: f32 = 1_500.0;
const WIDE: f32 = 40_000.0;
const TILE: f32 = 6_000.0;

#[derive(Component)]
pub struct CloudLayer;

/// The cloud layer, `cover` of the sky (0 clear to 1 overcast); its render layers are given by the scene.
pub fn layer(meshes: &mut Assets<Mesh>, materials: &mut Assets<StandardMaterial>, images: &mut Assets<Image>, cover: f32) -> impl Bundle {
    (
        CloudLayer,
        Mesh3d(meshes.add(Plane3d::new(Vec3::NEG_Y, Vec2::splat(WIDE / 2.0)).mesh())),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::WHITE,
            base_color_texture: Some(images.add(shapes(cover))),
            uv_transform: bevy::math::Affine2::from_scale(Vec2::splat(WIDE / TILE)),
            alpha_mode: AlphaMode::Blend,
            perceptual_roughness: 1.0,
            reflectance: 0.0,
            // light passes through thin cloud, as it does through a blade of grass
            diffuse_transmission: 0.6,
            double_sided: true,
            cull_mode: None,
            ..default()
        })),
        bevy::light::NotShadowCaster,
        Transform::from_xyz(0.0, HEIGHT, 0.0),
    )
}

/// Keeps the layer over the eye and lets it drift downwind (the same direction as the wind in the grass).
pub fn drift(
    time: Res<Time>,
    wind: Res<crate::wind::Strength>,
    eye: Query<&GlobalTransform, With<crate::meadow::Eye2>>,
    mut layer: Query<(&mut Transform, &MeshMaterial3d<StandardMaterial>), With<CloudLayer>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut travelled: Local<Vec2>,
) {
    let dir = Vec2::new(0.8, 0.6);
    *travelled += dir * (4.0 + 10.0 * wind.0) * time.delta_secs(); // metres the air has moved, 4 to 29 m/s aloft
    let Ok(eye) = eye.single() else { return };
    let at = eye.translation();
    for (mut t, m) in &mut layer {
        t.translation = Vec3::new(at.x, HEIGHT, at.z);
        if let Some(mut mat) = materials.get_mut(&m.0) {
            // the pattern stays fixed to the air, not to the eye: offset by where the eye is and how far the air moved
            let shift = (Vec2::new(at.x, at.z) - *travelled) / TILE;
            mat.uv_transform = bevy::math::Affine2::from_scale_angle_translation(Vec2::splat(WIDE / TILE), 0.0, shift);
            // a flat layer only reads as cloud from below: it fades as the eye climbs toward it and is gone above
            let f = ((at.y - 500.0) / 900.0).clamp(0.0, 1.0);
            mat.base_color = Color::linear_rgba(1.0, 1.0, 1.0, 1.0 - f * f * (3.0 - 2.0 * f));
        }
    }
}

/// The cloud shapes: a seamless tile of layered value noise, cut at `cover` and softened, white with the cloud's
/// density as its alpha, darker underneath where it is thick.
fn shapes(cover: f32) -> Image {
    const N: usize = 512;
    let hash = |x: i32, y: i32, p: i32, s: u32| {
        let (x, y) = (x.rem_euclid(p) as u32, y.rem_euclid(p) as u32);
        let mut h = x.wrapping_mul(0x8da6_b343) ^ y.wrapping_mul(0xd816_3841) ^ s.wrapping_mul(0x9E37_79B1);
        h ^= h >> 13;
        h = h.wrapping_mul(0x85eb_ca6b);
        (h >> 8) as f32 / (1u32 << 24) as f32
    };
    let noise = |u: f32, v: f32, cells: i32, s: u32| {
        let (x, y) = (u * cells as f32, v * cells as f32);
        let (ix, iy) = (x.floor() as i32, y.floor() as i32);
        let (fx, fy) = (x - ix as f32, y - iy as f32);
        let (sx, sy) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
        let c = |dx: i32, dy: i32| hash(ix + dx, iy + dy, cells, s);
        let a = c(0, 0) + (c(1, 0) - c(0, 0)) * sx;
        let b = c(0, 1) + (c(1, 1) - c(0, 1)) * sx;
        a + (b - a) * sy
    };
    // cumulus: a few big billows, then smaller lumps on them
    let density = |u: f32, v: f32| {
        let base = noise(u, v, 5, 1) * 0.5 + noise(u, v, 11, 2) * 0.27 + noise(u, v, 23, 3) * 0.15 + noise(u, v, 53, 4) * 0.08;
        let cut = 1.0 - cover.clamp(0.0, 1.0) * 0.75 - 0.15;
        ((base - cut) / 0.22).clamp(0.0, 1.0)
    };
    let mut level: Vec<[f32; 4]> = (0..N * N)
        .map(|i| {
            let (u, v) = ((i % N) as f32 / N as f32, (i / N) as f32 / N as f32);
            let d = density(u, v);
            let shade = 1.0 - 0.35 * d * d; // thick cloud is darker below
            [shade, shade, shade * 1.02, d.powf(0.8)]
        })
        .collect();
    let mut data = Vec::new();
    let (mut size, mut mips) = (N, 0);
    loop {
        for c in &level {
            let b = |x: f32| (x.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8;
            data.extend_from_slice(&[b(c[0]), b(c[1]), b(c[2]), (c[3].clamp(0.0, 1.0) * 255.0) as u8]);
        }
        mips += 1;
        if size == 1 {
            break;
        }
        let half = size / 2;
        level = (0..half * half)
            .map(|i| {
                let (x, y) = (2 * (i % half), 2 * (i / half));
                let q = [level[y * size + x], level[y * size + x + 1], level[(y + 1) * size + x], level[(y + 1) * size + x + 1]];
                std::array::from_fn(|k| (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4.0)
            })
            .collect();
        size = half;
    }
    let blank = Image::default();
    Image {
        data: Some(data),
        texture_descriptor: TextureDescriptor {
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
