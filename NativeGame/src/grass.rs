//! Grass, generated: blades grown by a rule from a seed, in square chunks so the camera's view culls them a chunk at a
//! time. A blade is a curved, tapering strip of solid geometry (no cut-out texture), its colour darker at the root.
//! Near the centre of the patch the blades are dense and thin; further out they are fewer and wider, so the patch
//! keeps its cover while the count stays in budget.

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

/// The patch: chunks of `CHUNK` metres, `RINGS` chunks from the centre to each side.
pub const CHUNK: f32 = 8.0;
pub const RINGS: i32 = 6;
/// Blades per square metre at the very centre of the patch.
const DENSITY: f32 = 300.0;
/// Segments up a blade.
const SEGS: usize = 4;

/// A deterministic hash to a number in [0, 1).
fn h(a: u32, b: u32, c: u32) -> f32 {
    let mut x = a.wrapping_mul(0x9E37_79B1) ^ b.wrapping_mul(0x85EB_CA77) ^ c.wrapping_mul(0xC2B2_AE3D);
    x ^= x >> 15;
    x = x.wrapping_mul(0x2C1B_3C6D);
    x ^= x >> 12;
    x = x.wrapping_mul(0x297A_2D39);
    x ^= x >> 15;
    (x >> 8) as f32 / (1u32 << 24) as f32
}

/// Soft value noise over the ground, for clumps: where the grass is tall, where it is thin, where it is dry.
fn field(x: f32, z: f32, scale: f32, seed: u32) -> f32 {
    let (x, z) = (x / scale, z / scale);
    let (ix, iz) = (x.floor(), z.floor());
    let (fx, fz) = (x - ix, z - iz);
    let (sx, sz) = (fx * fx * (3.0 - 2.0 * fx), fz * fz * (3.0 - 2.0 * fz));
    let c = |dx: f32, dz: f32| h((ix + dx) as i32 as u32, (iz + dz) as i32 as u32, seed);
    let a = c(0.0, 0.0) + (c(1.0, 0.0) - c(0.0, 0.0)) * sx;
    let b = c(0.0, 1.0) + (c(1.0, 1.0) - c(0.0, 1.0)) * sx;
    a + (b - a) * sz
}

/// Blades per square metre at a distance `r` metres from the centre of the patch: very dense and fine where the eye
/// is, thinning toward the edge, where the ground's own colour takes over.
fn density(r: f32) -> f32 {
    DENSITY * (-r / 9.0).exp() + 40.0 * (1.0 - r / (CHUNK * RINGS as f32)).max(0.0)
}

/// One chunk's blades as one mesh. Each vertex carries in its UV how far up its blade it is (v, 0 at the root,
/// 1 at the tip) and the blade's own stiffness (u), for the wind.
pub fn chunk(cx: i32, cz: i32) -> Mesh {
    let centre = Vec2::new(cx as f32 + 0.5, cz as f32 + 0.5) * CHUNK;
    let d = density(centre.length());
    let widen = (DENSITY / d).sqrt().min(3.0); // fewer blades are wider, to keep the cover
    let count = (d * CHUNK * CHUNK) as u32;
    let segs = if centre.length() < 20.0 { SEGS } else { SEGS - 1 }; // far blades need fewer bends

    let (mut pos, mut nrm, mut uv, mut col, mut idx) = (vec![], vec![], vec![], vec![], vec![]);
    let (sx, sz) = (cx as u32, cz as u32);
    for i in 0..count {
        let r = |k: u32| h(sx, sz, i * 11 + k);
        let x = (cx as f32 + r(0)) * CHUNK;
        let z = (cz as f32 + r(1)) * CHUNK;
        let lush = field(x, z, 7.0, 1);
        let dry = field(x, z, 19.0, 2);
        if r(2) > 0.55 + 0.45 * lush {
            continue; // a little thinner between the clumps
        }
        // a few stems go to seed: taller, straight, straw-coloured, with a head
        let seed = r(8) < 0.025;
        let height = if seed { 0.6 + 0.35 * r(3) } else { 0.22 + 0.45 * lush * lush + 0.15 * r(3) };
        let width = if seed { 0.0025 } else { (0.006 + 0.006 * r(4)) * widen };
        let yaw = r(5) * std::f32::consts::TAU;
        let lean = if seed { 0.08 } else { 0.12 + 0.55 * r(6) * r(6) };
        let (dir, side) = (Vec3::new(yaw.cos(), 0.0, yaw.sin()), Vec3::new(-yaw.sin(), 0.0, yaw.cos()));
        let stiff = if seed { 1.0 } else { 0.4 + 0.6 * r(3) };
        // colour: each blade its own green, from deep to light yellow-green; drier where the field is dry
        let t1 = r(7);
        // linear reflectance of real grass: about 5 to 20 % in green, little red and blue
        let green = Vec3::new(0.030, 0.085, 0.012).lerp(Vec3::new(0.085, 0.200, 0.030), t1);
        let straw = Vec3::new(0.30, 0.24, 0.10);
        let tip = if seed { straw } else { green.lerp(straw, (dry * dry * 0.9 * r(9)).min(0.5)) * (0.9 + 0.3 * r(10)) };
        let tip_light = tip * Vec3::new(1.15, 1.12, 0.95); // tips catch more light and yellow a little
        let root = tip * 0.28; // the root sits in the shade of its neighbours
        let start = pos.len() as u32;
        for s in 0..=segs {
            let t = s as f32 / segs as f32;
            let p = Vec3::new(x, 0.0, z) + dir * (lean * height * t * t) + Vec3::Y * (height * (t - 0.35 * lean * t * t));
            let w = if seed && s == segs - 1 { width * 1.6 } else { width * (1.0 - t).powf(0.7) };
            let n = (side + Vec3::Y * 1.5).normalize(); // bent toward the sky, so a field is lit evenly
            let c = if t < 0.5 { root.lerp(tip, (t / 0.5).powf(0.8)) } else { tip.lerp(tip_light, (t - 0.5) / 0.5) };
            for k in [-1.0, 1.0] {
                if s == segs && k > 0.0 {
                    break; // one vertex at the tip
                }
                let p = if s == segs { p } else { p + side * w * k };
                pos.push(p.to_array());
                nrm.push(n.to_array());
                uv.push([stiff, t]);
                col.push([c.x, c.y, c.z, 1.0]);
            }
        }
        for s in 0..segs as u32 {
            let a = start + s * 2;
            if s + 1 == segs as u32 {
                idx.extend_from_slice(&[a, a + 1, a + 2]);
            } else {
                idx.extend_from_slice(&[a, a + 1, a + 2, a + 1, a + 3, a + 2]);
            }
        }
    }
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nrm)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, col)
        .with_inserted_indices(Indices::U32(idx))
}

/// Every chunk of the patch, as (x, z) chunk coordinates.
pub fn chunks() -> impl Iterator<Item = (i32, i32)> {
    (-RINGS..RINGS).flat_map(|x| (-RINGS..RINGS).map(move |z| (x, z)))
}

/// The grass carpet: what a field of grass looks like from further than its blades are drawn. A tile of fine streaks
/// and small clumps in the blades' own colours, seamless, with its smaller copies made here so it fades evenly.
pub fn carpet() -> Image {
    use bevy::image::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
    use bevy::render::render_resource::{Extent3d, TextureDescriptor, TextureFormat};
    const N: usize = 512;
    let wrap = |v: i32, p: i32| v.rem_euclid(p) as u32;
    // value noise with whole cells per tile, so it repeats without a seam; stretched in x for blade-like streaks
    let noise = |u: f32, v: f32, cu: i32, cv: i32, seed: u32| {
        let (x, y) = (u * cu as f32, v * cv as f32);
        let (ix, iy) = (x.floor() as i32, y.floor() as i32);
        let (fx, fy) = (x - ix as f32, y - iy as f32);
        let (sx, sy) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
        let c = |dx: i32, dy: i32| h(wrap(ix + dx, cu), wrap(iy + dy, cv), seed);
        let a = c(0, 0) + (c(1, 0) - c(0, 0)) * sx;
        let b = c(0, 1) + (c(1, 1) - c(0, 1)) * sx;
        a + (b - a) * sy
    };
    // the carpet in the blades' own linear colours, a little darker for the shade between them
    let deep = Vec3::new(0.022, 0.060, 0.010);
    let light = Vec3::new(0.070, 0.165, 0.025);
    let straw = Vec3::new(0.26, 0.21, 0.09);
    let mut level: Vec<Vec3> = (0..N * N)
        .map(|i| {
            let (u, v) = ((i % N) as f32 / N as f32, (i / N) as f32 / N as f32);
            let streak = noise(u, v, 160, 24, 3) * 0.6 + noise(u, v, 90, 12, 4) * 0.4;
            let clump = noise(u, v, 6, 6, 5);
            let dry = (noise(u, v, 3, 3, 6) - 0.6).max(0.0) * 1.5;
            deep.lerp(light, (0.25 + 0.75 * streak * clump).min(1.0)).lerp(straw, dry * streak)
        })
        .collect();
    let mut data = Vec::new();
    let (mut size, mut mips) = (N, 0);
    loop {
        for c in &level {
            let b = |x: f32| (x.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8;
            data.extend_from_slice(&[b(c.x), b(c.y), b(c.z), 255]);
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

/// The ground under and beyond the blades: a plane whose vertices carry a large-scale patchiness (lush, thin, dry),
/// so the carpet's tile never reads as a repeat from afar.
pub fn ground(size: f32, cells: u32) -> Mesh {
    let mut mesh = Plane3d::default().mesh().size(size, size).subdivisions(cells).build();
    let colours: Vec<[f32; 4]> = mesh
        .attribute(Mesh::ATTRIBUTE_POSITION)
        .and_then(|a| a.as_float3())
        .unwrap_or(&[])
        .iter()
        .map(|p| {
            let (lush, dry) = (field(p[0], p[2], 37.0, 7), field(p[0], p[2], 83.0, 8));
            let k = 0.75 + 0.45 * lush;
            [k * (1.0 + 0.25 * dry), k * (1.0 + 0.05 * dry), k * (1.0 - 0.2 * dry), 1.0]
        })
        .collect();
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colours);
    mesh
}
