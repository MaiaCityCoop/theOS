//! The ground floor under the grass, generated: a tile baked from generated micro-geometry, as material tools bake
//! scanned looks. Soil grain, damp patches, crumbs, pebbles and litter (bits of dead leaf and blade) are splatted into
//! a height field; from it come the colour (with crevice shading), the relief (a normal map) and the roughness.
//! Colours are linear reflectances of real soil and litter. It lies near the eye and fades into the grass carpet
//! further out, so the far field keeps its grassy colour.

use bevy::asset::RenderAssetUsages;
use bevy::image::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDescriptor, TextureFormat};

/// One tile of the ground, in metres, and its resolution: 1 m at 1024 pixels, about a millimetre a pixel.
const TILE: f32 = 1.0;
const N: usize = 1024;
/// The ground lies fully out to `INNER` metres from the eye and fades into the carpet by `OUTER`.
const INNER: f32 = 18.0;
const OUTER: f32 = 32.0;

#[derive(Component)]
pub struct Floor;

fn h(a: u32, b: u32) -> f32 {
    let mut x = a.wrapping_mul(0x9E37_79B1) ^ b.wrapping_mul(0x85EB_CA77);
    x ^= x >> 15;
    x = x.wrapping_mul(0x2C1B_3C6D);
    x ^= x >> 12;
    x = x.wrapping_mul(0x297A_2D39);
    x ^= x >> 15;
    (x >> 8) as f32 / (1u32 << 24) as f32
}

/// Seamless value noise over the tile, `cells` across.
fn noise(u: f32, v: f32, cells: i32, seed: u32) -> f32 {
    let (x, y) = (u * cells as f32, v * cells as f32);
    let (ix, iy) = (x.floor() as i32, y.floor() as i32);
    let (fx, fy) = (x - ix as f32, y - iy as f32);
    let (sx, sy) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
    let c = |dx: i32, dy: i32| h(((ix + dx).rem_euclid(cells) as u32) * 7919 + seed, (iy + dy).rem_euclid(cells) as u32);
    let a = c(0, 0) + (c(1, 0) - c(0, 0)) * sx;
    let b = c(0, 1) + (c(1, 1) - c(0, 1)) * sx;
    a + (b - a) * sy
}

/// The baked tile: colour, relief and roughness, each N × N, seamless.
struct Bake {
    height: Vec<f32>,   // millimetres
    colour: Vec<Vec3>,  // linear reflectance
    rough: Vec<f32>,
}

impl Bake {
    fn at(&self, x: i32, y: i32) -> usize {
        (y.rem_euclid(N as i32) as usize) * N + x.rem_euclid(N as i32) as usize
    }

    /// Lays a rounded element (a crumb, a pebble) of `radius` pixels at (cx, cy), raised `lift` mm, coloured `col`.
    fn blob(&mut self, cx: f32, cy: f32, radius: f32, lift: f32, col: Vec3, rough: f32) {
        let r = radius.ceil() as i32 + 1;
        for dy in -r..=r {
            for dx in -r..=r {
                let d = ((dx as f32 + cx.fract()).powi(2) + (dy as f32 + cy.fract()).powi(2)).sqrt() / radius;
                if d >= 1.0 {
                    continue;
                }
                let dome = (1.0 - d * d).sqrt() * lift;
                let i = self.at(cx as i32 + dx, cy as i32 + dy);
                if dome > self.height[i] {
                    self.height[i] = dome;
                    self.colour[i] = col * (0.85 + 0.15 * (1.0 - d));
                    self.rough[i] = rough;
                }
            }
        }
    }

    /// Lays a flat elongated element (a bit of dead leaf or blade) from (cx, cy) along `angle`, `len` × `wide` pixels.
    #[allow(clippy::too_many_arguments)]
    fn shred(&mut self, cx: f32, cy: f32, angle: f32, len: f32, wide: f32, lift: f32, col: Vec3) {
        let (s, c) = angle.sin_cos();
        let steps = len.ceil() as i32;
        for k in 0..steps {
            let t = k as f32 / steps as f32;
            let w = wide * (std::f32::consts::PI * t).sin().max(0.3);
            for j in -(w.ceil() as i32)..=(w.ceil() as i32) {
                let (x, y) = (cx + c * k as f32 - s * j as f32, cy + s * k as f32 + c * j as f32);
                let i = self.at(x as i32, y as i32);
                let top = self.height[i].max(0.0) * 0.5 + lift; // it lies on what is there
                if top > self.height[i] {
                    self.height[i] = top;
                    self.colour[i] = col * (0.9 + 0.2 * t);
                    self.rough[i] = 0.75;
                }
            }
        }
    }
}

fn bake() -> Bake {
    // the soil itself: grain, and darker damp patches (linear reflectance of loam: dry about 0.10, damp about 0.05)
    let dry_soil = Vec3::new(0.105, 0.075, 0.052);
    let damp_soil = Vec3::new(0.050, 0.036, 0.026);
    let mut b = Bake { height: vec![0.0; N * N], colour: vec![Vec3::ZERO; N * N], rough: vec![0.95; N * N] };
    for i in 0..N * N {
        let (u, v) = ((i % N) as f32 / N as f32, (i / N) as f32 / N as f32);
        let grain = noise(u, v, 256, 1) * 0.5 + noise(u, v, 96, 2) * 0.3 + noise(u, v, 24, 3) * 0.2;
        let damp = ((noise(u, v, 4, 4) * 0.7 + noise(u, v, 9, 5) * 0.3) - 0.45).clamp(0.0, 0.3) / 0.3;
        b.height[i] = grain * 0.8 - damp * 0.4;
        b.colour[i] = dry_soil.lerp(damp_soil, damp) * (0.8 + 0.4 * grain);
        b.rough[i] = 0.95 - 0.25 * damp;
    }
    let px = N as f32 / (TILE * 1000.0); // pixels per millimetre
    // crumbs: many small clods of the soil's own colour
    for k in 0..9000 {
        let (x, y) = (h(k, 11) * N as f32, h(k, 12) * N as f32);
        let col = dry_soil.lerp(damp_soil, h(k, 13)) * (0.8 + 0.5 * h(k, 14));
        b.blob(x, y, (1.0 + 3.0 * h(k, 15)) * px, 1.0 + 2.0 * h(k, 16), col, 0.95);
    }
    // pebbles: fewer, larger, greyer, smoother
    for k in 0..220 {
        let (x, y) = (h(k, 21) * N as f32, h(k, 22) * N as f32);
        let grey = Vec3::new(0.20, 0.19, 0.17).lerp(Vec3::new(0.14, 0.11, 0.08), h(k, 23)) * (0.8 + 0.4 * h(k, 24));
        b.blob(x, y, (4.0 + 10.0 * h(k, 25).powi(2)) * px, 3.0 + 5.0 * h(k, 26), grey, 0.6);
    }
    // litter: bits of dead leaf and blade lying on the soil, straw to grey-brown (dead grass about 0.15 to 0.25)
    for k in 0..1400 {
        let (x, y) = (h(k, 31) * N as f32, h(k, 32) * N as f32);
        let col = Vec3::new(0.24, 0.18, 0.10).lerp(Vec3::new(0.11, 0.09, 0.06), h(k, 33)) * (0.8 + 0.4 * h(k, 34));
        let len = (15.0 + 60.0 * h(k, 35)) * px;
        b.shred(x, y, h(k, 36) * std::f32::consts::TAU, len, (1.0 + 2.5 * h(k, 37)) * px, 0.4, col);
    }
    b
}

/// The three images of the ground: its colour (with the crevices' shade baked in), its normal map, its roughness.
fn bake_images(b: &Bake) -> (Image, Image, Image) {
    let blurred = |i: usize| {
        // the height around a pixel, for crevice shade: what lies lower than its surroundings is darker
        let (x, y) = ((i % N) as i32, (i / N) as i32);
        let mut s = 0.0;
        for (dx, dy) in [(-4, 0), (4, 0), (0, -4), (0, 4), (-3, -3), (3, 3), (-3, 3), (3, -3)] {
            s += b.height[b.at(x + dx, y + dy)];
        }
        s / 8.0
    };
    let mm_per_px = TILE * 1000.0 / N as f32;
    let mut colour = Vec::with_capacity(N * N);
    let mut normal = Vec::with_capacity(N * N);
    let mut rough = Vec::with_capacity(N * N);
    for i in 0..N * N {
        let (x, y) = ((i % N) as i32, (i / N) as i32);
        let cavity = (b.height[i] - blurred(i)).clamp(-1.5, 1.5);
        let shade = (1.0 + 0.25 * cavity).clamp(0.5, 1.1);
        colour.push((b.colour[i] * shade).to_array());
        let dx = (b.height[b.at(x + 1, y)] - b.height[b.at(x - 1, y)]) / (2.0 * mm_per_px);
        let dy = (b.height[b.at(x, y + 1)] - b.height[b.at(x, y - 1)]) / (2.0 * mm_per_px);
        let n = Vec3::new(-dx, -dy, 1.0).normalize();
        normal.push([n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5]);
        rough.push(b.rough[i]);
    }
    let c = texture(colour.iter().map(|c| [c[0], c[1], c[2], 1.0]).collect(), true);
    let n = texture(normal.iter().map(|c| [c[0], c[1], c[2], 1.0]).collect(), false);
    // metallic in blue (none), roughness in green, as the standard material reads them
    let r = texture(rough.iter().map(|r| [0.0, *r, 0.0, 1.0]).collect(), false);
    (c, n, r)
}

/// A seamless N × N texture with its smaller copies, in sRGB (colour) or linear (data).
fn texture(mut level: Vec<[f32; 4]>, srgb: bool) -> Image {
    let mut data = Vec::new();
    let (mut size, mut mips) = (N, 0);
    loop {
        for c in &level {
            let enc = |x: f32| if srgb { (x.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8 } else { (x.clamp(0.0, 1.0) * 255.0) as u8 };
            data.extend_from_slice(&[enc(c[0]), enc(c[1]), enc(c[2]), 255]);
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
            format: if srgb { TextureFormat::Rgba8UnormSrgb } else { TextureFormat::Rgba8Unorm },
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

/// The disc the floor lies on: full out to `INNER`, fading to nothing at `OUTER` (its alpha), its texture coordinates
/// in tiles from its centre. It moves with the eye in whole tiles, so the pattern stays fixed to the world.
fn disc() -> Mesh {
    let (rings, segs) = (24, 96);
    let (mut pos, mut nrm, mut uv, mut tan, mut col, mut idx) = (vec![], vec![], vec![], vec![], vec![], vec![]);
    pos.push([0.0, 0.0, 0.0]);
    nrm.push([0.0, 1.0, 0.0]);
    uv.push([0.0, 0.0]);
    tan.push([1.0, 0.0, 0.0, 1.0]);
    col.push([1.0, 1.0, 1.0, 1.0]);
    for r in 1..=rings {
        let radius = OUTER * (r as f32 / rings as f32).powf(0.8);
        let alpha = 1.0 - ((radius - INNER) / (OUTER - INNER)).clamp(0.0, 1.0);
        for s in 0..segs {
            let a = s as f32 / segs as f32 * std::f32::consts::TAU;
            let (x, z) = (a.cos() * radius, a.sin() * radius);
            pos.push([x, 0.0, z]);
            nrm.push([0.0, 1.0, 0.0]);
            uv.push([x / TILE, z / TILE]);
            tan.push([1.0, 0.0, 0.0, 1.0]);
            col.push([1.0, 1.0, 1.0, alpha * alpha * (3.0 - 2.0 * alpha)]);
        }
    }
    let ring = |r: u32, s: u32| 1 + (r - 1) * segs + s % segs;
    for s in 0..segs {
        idx.extend_from_slice(&[0, ring(1, s + 1), ring(1, s)]);
    }
    for r in 1..rings {
        for s in 0..segs {
            let (a, b, c, d) = (ring(r, s), ring(r, s + 1), ring(r + 1, s), ring(r + 1, s + 1));
            idx.extend_from_slice(&[a, b, c, b, d, c]);
        }
    }
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nrm)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_attribute(Mesh::ATTRIBUTE_TANGENT, tan)
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, col)
        .with_inserted_indices(Indices::U32(idx))
}

/// The floor, ready to spawn in a scene (which adds its own render layers).
pub fn floor(meshes: &mut Assets<Mesh>, materials: &mut Assets<StandardMaterial>, images: &mut Assets<Image>) -> impl Bundle {
    let (colour, normal, rough) = bake_images(&bake());
    (
        Floor,
        Mesh3d(meshes.add(disc())),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::WHITE,
            base_color_texture: Some(images.add(colour)),
            normal_map_texture: Some(images.add(normal)),
            metallic_roughness_texture: Some(images.add(rough)),
            perceptual_roughness: 1.0,
            metallic: 0.0,
            reflectance: 0.3,
            // the disc's alpha fades it into the carpet beneath; it lies just above it
            alpha_mode: AlphaMode::Blend,
            ..default()
        })),
        bevy::light::NotShadowCaster,
        Transform::from_xyz(0.0, 0.003, 0.0),
    )
}

/// Keeps the floor under the eye, moved in whole tiles so its pattern stays fixed to the ground.
pub fn follow(eye: Query<&GlobalTransform, With<crate::meadow::Eye2>>, mut floor: Query<&mut Transform, With<Floor>>) {
    let Ok(eye) = eye.single() else { return };
    let at = eye.translation();
    for mut t in &mut floor {
        t.translation = Vec3::new((at.x / TILE).floor() * TILE, 0.003, (at.z / TILE).floor() * TILE);
    }
}
