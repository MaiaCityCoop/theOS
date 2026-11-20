//! Grass, generated: blades grown by a rule from a seed, in square chunks so the camera's view culls them a chunk at a
//! time. A blade is a curved, tapering strip of solid geometry (no cut-out texture), its colour darker at the root.
//! Near the centre of the patch the blades are dense and thin; further out they are fewer and wider, so the patch
//! keeps its cover while the count stays in budget.

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use crate::terrain;

/// The grass around the camera: chunks of `CHUNK` metres, fixed to the world, `RINGS` chunks out to each side.
pub const CHUNK: f32 = 8.0;
pub const RINGS: i32 = 9;
/// Blades per square metre at full detail.
const DENSITY: f32 = 520.0;
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

/// How much of a chunk's blades are drawn at a ring around the camera's chunk (0: the camera's own): all near the eye,
/// fewer further out. A coarser ring draws the first blades of the same list, wider, so a switch changes little.
pub fn share(ring: i32) -> f32 {
    match ring {
        0 | 1 => 1.0,
        2 => 0.35,
        3 => 0.18,
        4 => 0.09,
        5 | 6 => 0.05,
        _ => 0.025,
    }
}

/// The kinds of seed head: a dense cylinder (as timothy), a loose branching panicle (as meadow grass), a nodding
/// feathery plume.
#[derive(Clone, Copy)]
enum Head {
    Spike,
    Panicle,
    Plume,
}

/// Geometry being built: positions, normals, UVs, colours, indices.
#[derive(Default)]
struct Geo {
    pos: Vec<[f32; 3]>,
    nrm: Vec<[f32; 3]>,
    uv: Vec<[f32; 2]>,
    col: Vec<[f32; 4]>,
    idx: Vec<u32>,
}

impl Geo {
    fn vert(&mut self, p: Vec3, n: Vec3, t: f32, c: Vec3) -> u32 {
        self.pos.push(p.to_array());
        self.nrm.push(n.to_array());
        self.uv.push([1.0, t]);
        self.col.push([c.x, c.y, c.z, 1.0]);
        self.pos.len() as u32 - 1
    }

    /// A spikelet: a small double-pointed grain from `a` along `dir`, `len` long and `w` wide, as two crossed
    /// shapes so it has body from every side and never reads as a flat scrap.
    fn spikelet(&mut self, a: Vec3, dir: Vec3, len: f32, w: f32, c: Vec3) {
        let s1 = dir.cross(Vec3::Y).try_normalize().unwrap_or(Vec3::X);
        let s2 = dir.cross(s1).normalize();
        for side in [s1 * w, s2 * w] {
            let n = (dir.cross(side).normalize_or_zero() + Vec3::Y).normalize();
            let mid = a + dir * len * 0.45;
            let i0 = self.vert(a, n, 0.9, c * 0.7);
            let i1 = self.vert(mid + side, n, 0.95, c);
            let i2 = self.vert(a + dir * len, n, 1.0, c * 1.1);
            let i3 = self.vert(mid - side, n, 0.95, c);
            self.idx.extend_from_slice(&[i0, i1, i2, i0, i2, i3]);
        }
    }

    /// A thin straight strip from `a` to `b`, `w` wide: a stem or a branch of a panicle.
    fn strip(&mut self, a: Vec3, b: Vec3, w: f32, ca: Vec3, cb: Vec3, ta: f32, tb: f32) {
        let dir = (b - a).normalize_or_zero();
        let side = dir.cross(Vec3::Y).try_normalize().unwrap_or(Vec3::X) * w;
        let n = (side.normalize() + Vec3::Y * 1.5).normalize();
        let i0 = self.vert(a - side, n, ta, ca);
        let i1 = self.vert(a + side, n, ta, ca);
        let i2 = self.vert(b - side * 0.6, n, tb, cb);
        let i3 = self.vert(b + side * 0.6, n, tb, cb);
        self.idx.extend_from_slice(&[i0, i1, i2, i1, i3, i2]);
    }

    fn mesh(self) -> Mesh {
        Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
            .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, self.pos)
            .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, self.nrm)
            .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, self.uv)
            .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, self.col)
            .with_inserted_indices(Indices::U32(self.idx))
    }
}

/// A flowering stem: a fine straw stem, gently curved, and a seed head of many spikelets at its top.
fn flowering_stem(g: &mut Geo, root: Vec3, height: f32, yaw: f32, kind: Head, rnd: &dyn Fn(u32) -> f32) {
    let lean_dir = Vec3::new(yaw.cos(), 0.0, yaw.sin());
    let lean = 0.06 + 0.1 * rnd(20);
    let at = |t: f32| root + lean_dir * (lean * height * t * t) + Vec3::Y * (height * t);
    let straw = Vec3::new(0.30, 0.25, 0.11);
    let stem_green = Vec3::new(0.10, 0.16, 0.04);
    // the stem, in three pieces, green below, straw above
    for k in 0..3 {
        let (t0, t1) = (k as f32 / 3.0, (k + 1) as f32 / 3.0);
        g.strip(at(t0), at(t1), 0.0016, stem_green.lerp(straw, t0), stem_green.lerp(straw, t1), t0, t1);
    }
    let top = at(1.0);
    let up = (at(1.0) - at(0.92)).normalize();
    // spikelets: pale green to straw, some with a purple tinge, as many grasses have
    let tint = rnd(21);
    let head_col = Vec3::new(0.11, 0.12, 0.05).lerp(straw * 0.8, rnd(22)).lerp(Vec3::new(0.20, 0.12, 0.14), (tint - 0.7).max(0.0) * 2.0);
    match kind {
        Head::Spike => {
            // a dense cylinder: spikelets in a spiral around the top 6 to 11 cm, pointing up and out
            let len = 0.06 + 0.05 * rnd(23);
            let n = 26;
            for i in 0..n {
                let t = i as f32 / n as f32;
                let a = i as f32 * 2.4;
                let out = Vec3::new(a.cos(), 0.0, a.sin()) * 0.004;
                let base = top - up * len * (1.0 - t) + out;
                g.spikelet(base, (up * 1.6 + out.normalize_or_zero()).normalize(), 0.005, 0.0011, head_col);
            }
        }
        Head::Panicle => {
            // a loose panicle: whorls of thin branches, each with a few spikelets toward its end
            let whorls = 4;
            for w in 0..whorls {
                let t = w as f32 / whorls as f32;
                let node = top - up * (0.12 * (1.0 - t));
                let branches = 3;
                for b in 0..branches {
                    let a = (w * branches + b) as f32 * 2.1 + rnd(24 + w as u32) * 0.5;
                    let out = Vec3::new(a.cos(), 0.0, a.sin());
                    let reach = 0.03 + 0.05 * (1.0 - t);
                    let end = node + (out * 0.8 + up * 0.6).normalize() * reach;
                    g.strip(node, end, 0.0005, straw, straw * 1.1, 0.9, 0.95);
                    for s in 0..3 {
                        let p = node.lerp(end, 0.5 + 0.25 * s as f32);
                        g.spikelet(p, (out + up).normalize(), 0.0035, 0.0008, head_col);
                    }
                }
            }
        }
        Head::Plume => {
            // a nodding plume: the head curves over and down, soft spikelets all along it
            let n = 20;
            for i in 0..n {
                let t = i as f32 / n as f32;
                let p = top + lean_dir * (0.07 * t) - Vec3::Y * (0.05 * t * t);
                let dir = (lean_dir * (0.4 + t) - Vec3::Y * t * 0.6 + Vec3::Y * 0.3).normalize();
                let a = i as f32 * 2.4;
                let out = Vec3::new(a.cos(), 0.0, a.sin()) * 0.003;
                g.spikelet(p + out, (dir + out * 60.0).normalize(), 0.007, 0.0008, head_col);
            }
        }
    }
}

/// One chunk of grass as one mesh, drawing a `share` of its blades (see [`share`]). Each vertex carries in its UV how
/// far up its blade it is (v, 0 at the root, 1 at the tip).
pub fn chunk(cx: i32, cz: i32, share: f32) -> Mesh {
    blades(cx, cz, share, false)
}


fn blades(cx: i32, cz: i32, share: f32, fine: bool) -> Mesh {
    let widen = (1.0 / share).sqrt().min(3.5); // fewer blades are wider, to keep the cover
    let full = (DENSITY * CHUNK * CHUNK) as u32;
    let count = (full as f32 * share) as u32;
    let segs = if share >= 1.0 { SEGS } else { SEGS - 1 };
    let detail = share >= 1.0 && !fine; // seed heads, thatch and low plants only near the eye
    let fold = fine; // the close blades fold along the midrib, as real ones do (only near the eye, where it shows)
    let count = if fine { count * 3 / 2 } else { count };

    // the seed heads' share of the slots, from the recipe's seed heads per square metre
    let seed_share = crate::biome::current().per_m2("seed head") / (DENSITY * 2.0);
    let mut g = Geo::default();
    let (sx, sz) = if fine { (cx as u32 ^ 0x5151_5151, cz as u32 ^ 0xA7A7_A7A7) } else { (cx as u32, cz as u32) };
    for i in 0..count {
        let r = |k: u32| h(sx, sz, i * 31 + k);
        let x = (cx as f32 + r(0)) * CHUNK;
        let z = (cz as f32 + r(1)) * CHUNK;
        let lush = field(x, z, 7.0, 1);
        let dry = field(x, z, 19.0, 2);
        if r(2) > 0.55 + 0.45 * lush || r(9) < terrain::bare(x, z) {
            continue; // a little thinner between the clumps, and none in the bare patches
        }
        let yaw = r(5) * std::f32::consts::TAU;
        // the ordinary blades are the GPU's now (`tile`); here only what grows among them: seed heads (below),
        // thatch and low plants
        if r(8) >= seed_share * (1.0 + 2.0 * dry) {
            continue;
        }
        // about one in forty goes to seed: a flowering stem with a head, in drier spots more often
        if !fine && r(8) < seed_share * (1.0 + 2.0 * dry) {
            if detail {
                let kind = match (r(12) * 3.0) as u32 {
                    0 => Head::Spike,
                    1 => Head::Panicle,
                    _ => Head::Plume,
                };
                flowering_stem(&mut g, Vec3::new(x, terrain::height(x, z), z), 0.55 + 0.4 * r(3), yaw, kind, &r);
            }
            continue;
        }
        // the outermost rings shrink toward the carpet, so the field melts into it instead of ending at an edge
        let fade = (share * 8.0).clamp(0.35, 1.0); // smoothly lower ring by ring, out to a short sward at the edge
        // a grazed meadow: mostly ankle to shin high, 12 to 45 cm
        let height = (0.12 + 0.22 * lush * lush + 0.11 * r(3)) * fade;
        // half the width: real meadow blades are 3 to 8 mm wide; the fine ones 2 to 4 mm
        let width = if fine { 0.001 + 0.001 * r(4) } else { (0.0018 + 0.0022 * r(4)) * widen };
        let height = if fine { height * (0.6 + 0.3 * r(11)) } else { height };
        let lean = 0.12 + 0.55 * r(6) * r(6);
        let (dir, side) = (Vec3::new(yaw.cos(), 0.0, yaw.sin()), Vec3::new(-yaw.sin(), 0.0, yaw.cos()));
        // colour: each blade its own green, from deep to light yellow-green; drier where the field is dry.
        // Linear reflectance of real grass: about 5 to 20 % in green, little red and blue.
        let green = Vec3::new(0.045, 0.120, 0.018).lerp(Vec3::new(0.100, 0.230, 0.035), r(7));
        let straw = Vec3::new(0.30, 0.24, 0.10);
        // fresh green, with only a little straw where the field is dry
        let tip = green.lerp(straw, (dry * dry * 0.35 * r(9)).min(0.2)) * (0.95 + 0.3 * r(10));
        let tip_light = tip * Vec3::new(1.15, 1.12, 0.95); // tips catch more light and yellow a little
        let root = tip * 0.28; // the root sits in the shade of its neighbours
        let start = g.pos.len() as u32;
        let ground = terrain::height(x, z);
        for s in 0..=segs {
            let t = s as f32 / segs as f32;
            let p = Vec3::new(x, ground, z) + dir * (lean * height * t * t) + Vec3::Y * (height * (t - 0.35 * lean * t * t));
            // full width over the lower half, then a long even taper to a fine point, as a real blade narrows
            let w = width * (1.0 - ((t - 0.45) / 0.55).clamp(0.0, 1.0)).powf(1.2);
            let n = (side + Vec3::Y * 1.5).normalize(); // bent toward the sky, so a field is lit evenly
            let c = if t < 0.5 { root.lerp(tip, (t / 0.5).powf(0.8)) } else { tip.lerp(tip_light, (t - 0.5) / 0.5) };
            if s == segs {
                g.vert(p, n, t, c); // one vertex at the tip
            } else if fold {
                // a V across the blade: the midrib stands a little out of the plane, each half facing its own way,
                // so one half catches the light and the other is in shade, as on a real blade
                let tilt = dir * 0.6;
                g.vert(p - side * w, (n - tilt).normalize(), t, c * 0.92);
                g.vert(p + dir * (w * 0.35), n, t, c * 1.05);
                g.vert(p + side * w, (n + tilt).normalize(), t, c);
            } else {
                g.vert(p - side * w, n, t, c);
                g.vert(p + side * w, n, t, c);
            }
        }
        let per = if fold { 3 } else { 2 };
        for s in 0..segs as u32 {
            let a = start + s * per;
            let next = a + per;
            if s + 1 == segs as u32 {
                // the last segment closes to the tip
                if fold {
                    g.idx.extend_from_slice(&[a, a + 1, next, a + 1, a + 2, next]);
                } else {
                    g.idx.extend_from_slice(&[a, a + 1, next]);
                }
            } else if fold {
                g.idx.extend_from_slice(&[a, a + 1, next, a + 1, next + 1, next, a + 1, a + 2, next + 1, a + 2, next + 2, next + 1]);
            } else {
                g.idx.extend_from_slice(&[a, a + 1, next, a + 1, next + 1, next]);
            }
        }
    }
    if detail {
        thatch(&mut g, cx, cz, share);
        low_plants(&mut g, cx, cz, share);
    }
    g.mesh()
}

/// A flat leaf from `base` along `dir`, rising at `rise` (0 flat on the ground, 1 straight up), `len` long and at most
/// `width` wide, its outline ovate (widest a third of the way), its colour darker at the base.
#[allow(clippy::too_many_arguments)]
fn leaf(g: &mut Geo, base: Vec3, dir: Vec3, rise: f32, len: f32, width: f32, colour: Vec3, toothed: bool) {
    let along = (dir * (1.0 - rise) + Vec3::Y * rise).normalize();
    let side = dir.cross(Vec3::Y).try_normalize().unwrap_or(Vec3::X);
    let n = along.cross(side).normalize() * -1.0;
    let n = if n.y < 0.0 { -n } else { n };
    let segs = 5;
    let start = g.pos.len() as u32;
    for s in 0..=segs {
        let t = s as f32 / segs as f32;
        let mut w = width * (std::f32::consts::PI * t.powf(0.75)).sin().max(0.0);
        if toothed && s % 2 == 1 {
            w *= 0.55; // a dandelion's teeth
        }
        let p = base + along * (len * t) - Vec3::Y * (0.15 * len * t * t * rise); // the tip droops a little
        let c = colour * (0.75 + 0.35 * t);
        g.vert(p - side * w, n, 0.05, c);
        g.vert(p + side * w, n, 0.05, c);
    }
    for s in 0..segs {
        let a = start + s * 2;
        g.idx.extend_from_slice(&[a, a + 1, a + 2, a + 1, a + 3, a + 2]);
    }
}

/// The low plants of a meadow, under and between the grass: clover in patches, rosettes of plantain and dandelion,
/// cushions of moss. Each grows where the field gives it room (where the grass is thinner).
fn low_plants(g: &mut Geo, cx: i32, cz: i32, share: f32) {
    // how many of each kind, from the biome's recipe (the kinds below pick from the total in proportion)
    let biome = crate::biome::current();
    let library = crate::library::load();
    let kinds = [biome.per_m2("clover"), biome.per_m2("plantain"), biome.per_m2("dandelion"), biome.per_m2("moss")];
    let tint = |name: &str, r: f32| library.get(name).map(|a| crate::library::colour(a, r));
    let total: f32 = kinds.iter().sum();
    let count = (total * CHUNK * CHUNK * share) as u32;
    let (sx, sz) = (cx as u32 ^ 0x3C3C, cz as u32 ^ 0xC3C3);
    for i in 0..count {
        let r = |k: u32| h(sx, sz, i * 17 + k);
        let (x, z) = ((cx as f32 + r(0)) * CHUNK, (cz as f32 + r(1)) * CHUNK);
        let lush = field(x, z, 7.0, 1);
        if r(2) > 1.1 - lush {
            continue; // low plants where the grass is thin
        }
        let at = Vec3::new(x, terrain::height(x, z) + 0.006, z);
        let a0 = r(3) * std::f32::consts::TAU;
        let pick = r(4) * total.max(1e-6);
        let which = if pick < kinds[0] { 0 } else if pick < kinds[0] + kinds[1] { 5 } else if pick < kinds[0] + kinds[1] + kinds[2] { 7 } else { 9 };
        let kind = match which { 0..=4 => "clover", 5..=6 => "plantain", 7..=8 => "dandelion", _ => "moss" };
        let col = tint(kind, r(5)).unwrap_or(Vec3::new(0.04, 0.1, 0.03)) * (0.8 + 0.4 * r(6));
        plant(g, kind, at, a0, col, &r);
    }
}

/// Thatch per square metre at full detail: the dead blades of earlier years, lying matted on the ground.
const THATCH: f32 = 45.0;

/// The thatch: dead blades lying almost flat, slightly arched, crossing each other, in the browns and greys of old
/// straw. What a real meadow shows of its ground between the living blades, far more than bare soil.
fn thatch(g: &mut Geo, cx: i32, cz: i32, share: f32) {
    let count = (THATCH * CHUNK * CHUNK * share) as u32;
    let (sx, sz) = (cx as u32 ^ 0x5A5A, cz as u32 ^ 0xA5A5);
    for i in 0..count {
        let r = |k: u32| h(sx, sz, i * 13 + k);
        let (x, z) = ((cx as f32 + r(0)) * CHUNK, (cz as f32 + r(1)) * CHUNK);
        let yaw = r(2) * std::f32::consts::TAU;
        let (dir, side) = (Vec3::new(yaw.cos(), 0.0, yaw.sin()), Vec3::new(-yaw.sin(), 0.0, yaw.cos()));
        let len = 0.10 + 0.25 * r(3);
        let width = 0.0012 + 0.0016 * r(4); // dead blades are as narrow as living ones
        let lift = 0.004 + 0.02 * r(5); // how high it lies on the others
        // linear reflectance of dead grass: pale straw to grey-brown, darker where it is older and damper
        let colour = Vec3::new(0.17, 0.14, 0.08).lerp(Vec3::new(0.07, 0.06, 0.04), r(6)) * (0.6 + 0.5 * r(7));
        let start = g.pos.len() as u32;
        let segs = 3;
        for s in 0..=segs {
            let t = s as f32 / segs as f32;
            let arch = (t * std::f32::consts::PI).sin() * 0.012 * r(8); // a little arched, not glued flat
            let p = Vec3::new(x, terrain::height(x, z) + lift + arch, z) + dir * (len * t) + side * (0.02 * r(9) * t * t);
            let w = width * (1.0 - 0.7 * t);
            let n = (Vec3::Y + side * 0.3 * (r(10) - 0.5)).normalize();
            let c = colour * (0.85 + 0.3 * t);
            g.vert(p - side * w, n, 0.02, c);
            g.vert(p + side * w, n, 0.02, c);
        }
        for s in 0..segs {
            let a = start + s * 2;
            g.idx.extend_from_slice(&[a, a + 1, a + 2, a + 1, a + 3, a + 2]);
        }
    }
}

/// A tile of the GPU grass: `TILE` × `TILE` blade slots, each `segs` segments up. A vertex's position is its slot
/// (in cells), its UV which side of the blade (−1, +1, 0 at the tip) and how far up (0 to 1); the blade itself is
/// made in the vertex shader (`wind.wesl`, `blade`).
pub const TILE: u32 = 32;
/// Tiles along a side of a level: 8 × 8 tiles of 32 slots, small enough that the view culls those behind the eye and
/// `meadow::lay` hides those wholly past the level's reach.
pub const TILES: u32 = 8;

pub fn tile(segs: u32) -> Mesh {
    use bevy::asset::RenderAssetUsages;
    use bevy::mesh::{Indices, PrimitiveTopology};
    let (mut pos, mut uv, mut nrm, mut col, mut idx) = (vec![], vec![], vec![], vec![], vec![]);
    for j in 0..TILE {
        for i in 0..TILE {
            let start = pos.len() as u32;
            // the slot, with the blade's side in the x within its cell (0.25, 0.5, 0.75) and how far up in y: the
            // position reaches every pass (the depth prepass gets no UV, and without it drew no blades: the
            // anti-aliasing then blended the sky behind them in as white streaks)
            let (ci, cj) = (i as f32, j as f32);
            for s in 0..=segs {
                let t = s as f32 / segs as f32;
                let sides: &[f32] = if s == segs { &[0.0] } else { &[-1.0, 0.0, 1.0] };
                for &side in sides {
                    pos.push([ci + 0.5 + 0.25 * side, t, cj + 0.5]);
                    uv.push([side, t]);
                    nrm.push([0.0, 1.0, 0.0]);
                    col.push([1.0, 1.0, 1.0, 1.0]);
                }
            }
            for s in 0..segs {
                let a = start + s * 3;
                let n = a + 3;
                if s + 1 == segs {
                    idx.extend_from_slice(&[a, a + 1, n, a + 1, a + 2, n]);
                } else {
                    idx.extend_from_slice(&[a, a + 1, n, a + 1, n + 1, n, a + 1, a + 2, n + 1, a + 2, n + 2, n + 1]);
                }
            }
        }
    }
    // two loose points, in no triangle, so the bounds Bevy computes for culling span the land's highs and lows
    // (±40 m) and a blade's lean beyond the tile
    for p in [[-2.0, -45.0, -2.0], [TILE as f32 + 2.0, 45.0, TILE as f32 + 2.0]] {
        pos.push(p);
        uv.push([0.0, 0.0]);
        nrm.push([0.0, 1.0, 0.0]);
        col.push([1.0, 1.0, 1.0, 1.0]);
    }
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nrm)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, col)
        .with_inserted_indices(Indices::U32(idx))
}

/// A low plant of `kind` (`clover`, `plantain`, `dandelion`, `moss`) at `at`, turned by `a0`, in `col`; `r` is its
/// own random numbers. The one generator for the field and for the library's masters.
fn plant(g: &mut Geo, kind: &str, at: Vec3, a0: f32, col: Vec3, r: &dyn Fn(u32) -> f32) {
    match kind {
            // clover: a small patch of trifoliate leaves on short stalks (linear reflectance: a cool mid green)
            "clover" => {
                for k in 0..(4 + (r(6) * 6.0) as u32) {
                    let ka = a0 + k as f32 * 2.3;
                    let stem = at + Vec3::new(ka.cos(), 0.0, ka.sin()) * (0.05 * r(7 + k)) + Vec3::Y * (0.04 + 0.05 * r(8 + k));
                    g.strip(at, stem, 0.0008, col * 0.7, col, 0.0, 0.1);
                    for l in 0..3 {
                        let la = ka + l as f32 * std::f32::consts::TAU / 3.0;
                        leaf(g, stem, Vec3::new(la.cos(), 0.0, la.sin()), 0.15, 0.014, 0.008, col, false);
                    }
                }
            }
            // plantain: a rosette of broad ribbed leaves lying out from the centre
            "plantain" => {
                let n = 5 + (r(6) * 4.0) as u32;
                for k in 0..n {
                    let ka = a0 + k as f32 * std::f32::consts::TAU / n as f32;
                    leaf(g, at, Vec3::new(ka.cos(), 0.0, ka.sin()), 0.25 + 0.2 * r(7 + k), 0.09 + 0.06 * r(9 + k), 0.025, col, false);
                }
            }
            // dandelion: a flatter rosette of long toothed leaves
            "dandelion" => {
                let n = 7 + (r(6) * 5.0) as u32;
                for k in 0..n {
                    let ka = a0 + k as f32 * std::f32::consts::TAU / n as f32 + 0.2 * r(7 + k);
                    leaf(g, at, Vec3::new(ka.cos(), 0.0, ka.sin()), 0.12 + 0.15 * r(8 + k), 0.12 + 0.08 * r(9 + k), 0.016, col, true);
                }
            }
            // moss: a low cushion of tiny pointed shoots, deep green to yellow-green
            _ => {
                let radius = 0.06 + 0.1 * r(6);
                for k in 0..40 {
                    let ka = a0 + k as f32 * 2.4;
                    let d = radius * r(7 + k).sqrt();
                    let p = at + Vec3::new(ka.cos() * d, 0.0, ka.sin() * d);
                    let up = 0.012 * (1.0 - d / radius) + 0.004;
                    g.strip(p, p + Vec3::Y * up + Vec3::new(ka.cos(), 0.0, ka.sin()) * 0.004, 0.002, col * 0.8, col, 0.0, 0.03);
                }
            }
    }
}

/// The master of a library plant: the full-detail individual `seed`, standing at the origin.
pub fn plant_master(generator: &str, seed: u32, col: Vec3) -> Mesh {
    let mut g = Geo::default();
    let r = |k: u32| h(seed, 0x51A7, k);
    if generator == "seed_head" {
        let kind = match (r(12) * 3.0) as u32 {
            0 => Head::Spike,
            1 => Head::Panicle,
            _ => Head::Plume,
        };
        flowering_stem(&mut g, Vec3::ZERO, 0.55 + 0.4 * r(3), r(5) * std::f32::consts::TAU, kind, &r);
    } else if generator == "grass_patch" {
        // a square metre of the meadow's sward, as dense as the near blades: the master its far views are baked from
        // 1600 blades: the near field's 625 blades a square metre and the fine ones among them, so the lawn baked from
        // it covers as much as the real field does at a grazing angle (700 left a quarter of the low views empty)
        for k in 0..1600 {
            let base = Vec3::new(r(1000 + k) - 0.5, 0.0, r(2000 + k) - 0.5);
            let a = r(3000 + k) * std::f32::consts::TAU;
            let shade = Vec3::new(0.045, 0.120, 0.018).lerp(Vec3::new(0.100, 0.230, 0.035), r(4000 + k));
            leaf(&mut g, base, Vec3::new(a.cos(), 0.0, a.sin()), 0.82 + 0.15 * r(5000 + k), 0.14 + 0.24 * r(6000 + k) * r(6000 + k), 0.004, shade, false);
        }
    } else if generator == "grass_tuft" {
        // a tuft of the meadow's blades, as the GPU makes them, for the library
        for k in 0..60 {
            let a = r(100 + k) * std::f32::consts::TAU;
            let d = 0.06 * r(200 + k).sqrt();
            let base = Vec3::new(a.cos() * d, 0.0, a.sin() * d);
            let tip_dir = Vec3::new(a.cos(), 0.0, a.sin());
            leaf(&mut g, base, tip_dir, 0.8 + 0.18 * r(300 + k), 0.18 + 0.2 * r(400 + k), 0.003, col * (0.8 + 0.4 * r(500 + k)), false);
        }
    } else {
        plant(&mut g, generator, Vec3::ZERO, r(3) * std::f32::consts::TAU, col, &r);
    }
    g.mesh()
}
