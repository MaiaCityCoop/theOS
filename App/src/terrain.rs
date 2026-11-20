//! The land itself, in three dimensions: one height function for everything (rolling hills, swells, tussock mounds,
//! centimetre bumps), meshes that follow it near the eye and out to the horizon, and stones and pebbles as real
//! generated shapes lying on it. No textures: every colour is carried by the geometry, from measured reflectances.
//!
//! The functions the shaders compute too (the large shape, the hash and noise, the small shape, where the ground is
//! bare) are written once here, as data with their Rust form beside their WGSL form; `wgsl` writes the shaders'
//! module from the same data (`shared.rs`), so the GPU's grass stands on exactly the land built here.

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

/// One wave of a term of the large shape: `sin` or `cos` of `kx·x + kz·z + phase`.
#[derive(Clone, Copy)]
enum Wave {
    Sin,
    Cos,
}

struct Factor(Wave, f32, f32, f32);

/// A term of the large shape: its height in metres times its waves.
struct Term(f32, &'static [Factor]);

use Wave::{Cos, Sin};

/// The large shape of the land: hills and swells.
const BIG: [Term; 6] = [
    Term(22.0, &[Factor(Sin, 0.0011, 0.0, 0.3), Factor(Cos, 0.0, 0.0013, 1.7)]),
    Term(9.0, &[Factor(Sin, 0.0031, -0.0024, 0.9)]),
    Term(4.0, &[Factor(Sin, 0.0110, 0.0, 0.7), Factor(Cos, 0.0, 0.0093, -1.1)]),
    Term(2.5, &[Factor(Sin, 0.0057, 0.0043, 2.0)]),
    Term(0.45, &[Factor(Sin, 0.071, -0.052, 0.3), Factor(Sin, 0.048, 0.083, 1.9)]),
    Term(0.25, &[Factor(Sin, 0.15, 0.11, 4.0)]),
];

impl Factor {
    fn at(&self, x: f32, z: f32) -> f32 {
        let a = self.1 * x + self.2 * z + self.3;
        match self.0 {
            Sin => a.sin(),
            Cos => a.cos(),
        }
    }
    fn wgsl(&self) -> String {
        let mut a = Vec::new();
        if self.1 != 0.0 {
            a.push(format!("{:?} * p.x", self.1));
        }
        if self.2 != 0.0 {
            a.push(format!("{:?} * p.y", self.2));
        }
        a.push(format!("{:?}", self.3));
        let f = match self.0 {
            Sin => "sin",
            Cos => "cos",
        };
        format!("{f}({})", a.join(" + ").replace("+ -", "- "))
    }
}

/// The large shape of the land at (x, z), in metres.
pub fn big(x: f32, z: f32) -> f32 {
    BIG.iter().fold(0.0, |h, t| h + t.1.iter().fold(t.0, |a, f| a * f.at(x, z)))
}

/// The hash's multipliers (x, z, seed, mix) and its shifts.
const HASH: [u32; 4] = [0x8da6_b343, 0xd816_3841, 0x9E37_79B1, 0x85eb_ca6b];
const SHIFTS: [u32; 3] = [13, 16, 8];

fn hash(x: i32, z: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(HASH[0]) ^ (z as u32).wrapping_mul(HASH[1]) ^ seed.wrapping_mul(HASH[2]);
    h ^= h >> SHIFTS[0];
    h = h.wrapping_mul(HASH[3]);
    h ^= h >> SHIFTS[1];
    (h >> SHIFTS[2]) as f32 / (1u32 << (32 - SHIFTS[2])) as f32
}

/// Smooth value noise, cells `cell` metres wide.
pub fn noise(x: f32, z: f32, cell: f32, seed: u32) -> f32 {
    let (x, z) = (x / cell, z / cell);
    let (ix, iz) = (x.floor() as i32, z.floor() as i32);
    let (fx, fz) = (x - ix as f32, z - iz as f32);
    let (sx, sz) = (fx * fx * (3.0 - 2.0 * fx), fz * fz * (3.0 - 2.0 * fz));
    let c = |dx: i32, dz: i32| hash(ix + dx, iz + dz, seed);
    let a = c(0, 0) + (c(1, 0) - c(0, 0)) * sx;
    let b = c(0, 1) + (c(1, 1) - c(0, 1)) * sx;
    a + (b - a) * sz
}

/// The small shape: tussock mounds and the crumbly unevenness of a meadow's floor, a few centimetres. Octaves of
/// noise: (height, cell, seed).
const SMALL: [(f32, f32, u32); 3] = [(0.10, 1.6, 1), (0.06, 0.55, 2), (0.025, 0.16, 3)];

fn small(x: f32, z: f32) -> f32 {
    SMALL.iter().fold(0.0, |h, &(w, cell, seed)| h + w * noise(x, z, cell, seed))
}

/// The height of the ground at (x, z), in metres.
pub fn height(x: f32, z: f32) -> f32 {
    big(x, z) + small(x, z)
}

/// Three octaves of noise from a cell: (the cell's share, weight); each octave takes the next seed. The biome's
/// ground layers lie by this noise (`ground.wesl`), and so does the bare ground the grass leaves out.
const OCTAVES: [(f32, f32); 3] = [(1.0, 0.65), (0.3125, 0.25), (0.09375, 0.10)];

pub fn fbm(x: f32, z: f32, cell: f32, seed: u32) -> f32 {
    OCTAVES.iter().zip(0..).fold(0.0, |n, (&(share, w), k)| n + noise(x, z, cell * share, seed + k) * w)
}

/// The bare ground: its noise's cell and first seed, and where that noise rises from 0 to 1 bare. The meadow's
/// recipe lays its open-ground layer by the same (`biome.rs`).
/// Where the ground is bare: the biome's first layer the grass leaves out, its cell, threshold and softness, and the
/// seed the ground shader gives that layer's noise (`ground.wesl`: layer k, seed 3k + 2). One source: the biome.
pub fn bare_rule() -> (f32, u32, f32, f32) {
    let b = crate::biome::current();
    match b.layers.iter().position(|l| !l.grass) {
        Some(k) => (b.layers[k].cell, k as u32 * 3 + 2, b.layers[k].threshold, b.layers[k].softness.max(1e-6)),
        // no bare layer: nowhere bare
        None => (1.0, 0, 2.0, 1.0),
    }
}

/// The shaders' twins of the functions above, written from the same data (the WGSL of `shared.rs`'s module).
pub fn wgsl() -> String {
    let (bare_cell, bare_seed, bare_from, bare_soft) = bare_rule();
    let big = BIG
        .iter()
        .map(|t| std::iter::once(format!("{:?}", t.0)).chain(t.1.iter().map(Factor::wgsl)).collect::<Vec<_>>().join(" * "))
        .collect::<Vec<_>>()
        .join("\n        + ");
    let small = SMALL.iter().map(|&(w, cell, seed)| format!("{w:?} * tnoise(p, {cell:?}, {seed}u)")).collect::<Vec<_>>().join(" + ");
    let fbm = OCTAVES
        .iter()
        .zip(0..)
        .map(|(&(share, w), k)| format!("tnoise(p, cell * {share:?}, seed + {k}u) * {w:?}"))
        .collect::<Vec<_>>()
        .join(" + ");
    let [hx, hz, hs, hm] = HASH;
    let [s0, s1, s2] = SHIFTS;
    let unit = (1u32 << (32 - s2)) as f32;
    format!(
        "// `terrain::big`: the large shape of the land.
fn ground(p: vec2<f32>) -> f32 {{
    return {big};
}}

// `terrain::hash` and `terrain::noise`, bit for bit, so the blades stand exactly on the land the CPU built.
fn thash(x: i32, z: i32, seed: u32) -> f32 {{
    var h = (bitcast<u32>(x) * {hx:#x}u) ^ (bitcast<u32>(z) * {hz:#x}u) ^ (seed * {hs:#x}u);
    h = h ^ (h >> {s0}u);
    h = h * {hm:#x}u;
    h = h ^ (h >> {s1}u);
    return f32(h >> {s2}u) / {unit:?};
}}

fn tnoise(p: vec2<f32>, cell: f32, seed: u32) -> f32 {{
    let q = p / cell;
    let i = floor(q);
    let f = q - i;
    let s = f * f * (3.0 - 2.0 * f);
    let ix = i32(i.x);
    let iz = i32(i.y);
    let a = thash(ix, iz, seed) + (thash(ix + 1, iz, seed) - thash(ix, iz, seed)) * s.x;
    let b = thash(ix, iz + 1, seed) + (thash(ix + 1, iz + 1, seed) - thash(ix, iz + 1, seed)) * s.x;
    return a + (b - a) * s.y;
}}

// `terrain::height`: the large shape and the small one.
fn land(p: vec2<f32>) -> f32 {{
    return ground(p) + ({small});
}}

// `terrain::fbm`
fn fbm(p: vec2<f32>, cell: f32, seed: u32) -> f32 {{
    return {fbm};
}}

// `terrain::bare`: where the ground is bare, no grass grows.
fn bare(p: vec2<f32>) -> f32 {{
    return smoothstep(0.0, 1.0, clamp((fbm(p, {bare_cell:?}, {bare_seed}u) - {bare_from:?}) / {bare_soft:?}, 0.0, 1.0));
}}
"
    )
}

fn normal_of(f: &dyn Fn(f32, f32) -> f32, x: f32, z: f32, e: f32) -> Vec3 {
    Vec3::new(f(x - e, z) - f(x + e, z), 2.0 * e, f(x, z - e) - f(x, z + e)).normalize()
}

/// The colour of the bare ground at a point: loam, darker where damp, with patches of dead litter and moss
/// (linear reflectance: dry loam about 0.10, damp 0.05, dead grass 0.15 to 0.25, moss about 0.06 in green).
fn soil(x: f32, z: f32) -> Vec3 {
    let damp = (noise(x, z, 3.0, 4) - 0.45).clamp(0.0, 0.35) / 0.35;
    let litter = (noise(x, z, 0.7, 5) - 0.4).clamp(0.0, 0.4) / 0.4;
    let moss = (noise(x, z, 2.1, 6) - 0.62).clamp(0.0, 0.3) / 0.3;
    let grain = 0.85 + 0.3 * noise(x, z, 0.05, 7);
    let loam = Vec3::new(0.105, 0.075, 0.052).lerp(Vec3::new(0.05, 0.036, 0.026), damp);
    let floor = loam.lerp(Vec3::new(0.19, 0.15, 0.09), litter * 0.7).lerp(Vec3::new(0.035, 0.065, 0.018), moss);
    // under a sward the ground is mostly dead leaves and moss, olive, with only some soil showing through
    floor.lerp(Vec3::new(0.06, 0.07, 0.03), 0.45) * grain
}

pub fn soil_colour(x: f32, z: f32) -> Vec3 {
    soil(x, z)
}

/// The colour of the land seen from afar, where its grass is too small to draw: the sward's own average green,
/// varying in large patches (lusher, sparser, drier) so a view from above has structure.
fn sward(x: f32, z: f32) -> Vec3 {
    let lush = noise(x, z, 60.0, 8) * 0.6 + noise(x, z, 600.0, 12) * 0.4;
    let dry = noise(x, z, 170.0, 9) * 0.5 + noise(x, z, 1900.0, 13) * 0.5;
    let fine = 0.85 + 0.3 * noise(x, z, 9.0, 10);
    // a lush green under and between the blades, as a dense sward looks; only the driest parts lean to straw
    Vec3::new(0.040, 0.095, 0.018).lerp(Vec3::new(0.070, 0.150, 0.028), lush).lerp(Vec3::new(0.11, 0.12, 0.05), dry * dry * 0.4) * fine
}

/// How bare the ground is at (x, z), 0 under a full sward to 1 in a bare patch: irregular patches of earth and gravel,
/// a few metres across, as a grazed or trodden meadow has them. The grass leaves them out.
pub fn bare(x: f32, z: f32) -> f32 {
    let (cell, seed, from, soft) = bare_rule();
    let t = ((fbm(x, z, cell, seed) - from) / soft).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// The colour of the land at (x, z), the one rule for the near ground and the far land alike, so where they meet
/// nothing changes: the sward's green, and the soil where it is bare.
pub fn colour(x: f32, z: f32) -> Vec3 {
    sward(x, z).lerp(soil(x, z), bare(x, z))
}

/// Geometry being built.
#[derive(Default)]
struct Geo {
    pos: Vec<[f32; 3]>,
    nrm: Vec<[f32; 3]>,
    col: Vec<[f32; 4]>,
    idx: Vec<u32>,
}

impl Geo {
    fn vert(&mut self, p: Vec3, n: Vec3, c: Vec3) -> u32 {
        self.pos.push(p.to_array());
        self.nrm.push(n.to_array());
        self.col.push([c.x, c.y, c.z, 1.0]);
        self.pos.len() as u32 - 1
    }
    fn mesh(self) -> Mesh {
        Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
            .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, self.pos)
            .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, self.nrm)
            .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, self.col)
            .with_inserted_indices(Indices::U32(self.idx))
    }

    /// A clod of earth: a lumpy, low octahedron of soil `size` metres across, sitting on the ground at (x, z).
    fn clod(&mut self, x: f32, z: f32, size: f32, seed: u32, col: Vec3, flatness: f32) {
        let r = |k: u32| hash(seed as i32, k as i32, 91);
        let ground = height(x, z);
        let yaw = r(1) * std::f32::consts::TAU;
        let (sy, cy) = yaw.sin_cos();
        let corner = |k: u32, v: Vec3| {
            let v = v * (0.7 + 0.6 * r(10 + k));
            let v = Vec3::new(v.x, v.y * flatness, v.z) * size * 0.5;
            Vec3::new(v.x * cy - v.z * sy, v.y, v.x * sy + v.z * cy) + Vec3::new(x, ground + size * 0.12, z)
        };
        let pts = [
            corner(0, Vec3::X), corner(1, -Vec3::X), corner(2, Vec3::Y), corner(3, -Vec3::Y * 0.4), corner(4, Vec3::Z), corner(5, -Vec3::Z),
        ];
        let faces = [[2, 4, 0], [2, 1, 4], [2, 5, 1], [2, 0, 5], [3, 0, 4], [3, 4, 1], [3, 1, 5], [3, 5, 0]];
        // the soil's own colour, a little darker and damper than the surface it lies on

        for f in faces {
            let (a, b, c) = (pts[f[0]], pts[f[1]], pts[f[2]]);
            let n = (b - a).cross(c - a).normalize_or_zero();
            let i0 = self.vert(a, n, col * (0.8 + 0.25 * n.y));
            let i1 = self.vert(b, n, col * (0.8 + 0.25 * n.y));
            let i2 = self.vert(c, n, col * (0.8 + 0.25 * n.y));
            self.idx.extend_from_slice(&[i0, i1, i2]);
        }
    }

    /// A stone: an irregular, flattened, partly buried rounded shape `size` metres across, at (x, z).
    fn stone(&mut self, x: f32, z: f32, size: f32, seed: u32, colour: Vec3, flatness: f32) {
        // an icosahedron, each corner pushed in or out, then the whole squashed and sunk into the ground
        let t = (1.0 + 5.0f32.sqrt()) / 2.0;
        let corners = [
            (-1.0, t, 0.0), (1.0, t, 0.0), (-1.0, -t, 0.0), (1.0, -t, 0.0),
            (0.0, -1.0, t), (0.0, 1.0, t), (0.0, -1.0, -t), (0.0, 1.0, -t),
            (t, 0.0, -1.0), (t, 0.0, 1.0), (-t, 0.0, -1.0), (-t, 0.0, 1.0),
        ];
        let faces: [[u32; 3]; 20] = [
            [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
        ];
        let r = |k: u32| hash(seed as i32, k as i32, 77);
        let squash = flatness * (0.75 + 0.5 * r(1));
        let stretch = 0.8 + 0.5 * r(2);
        let yaw = r(3) * std::f32::consts::TAU;
        let (sy, cy) = yaw.sin_cos();
        let ground = height(x, z);
        let pts: Vec<Vec3> = corners
            .iter()
            .enumerate()
            .map(|(i, &(a, b, c))| {
                let v = Vec3::new(a, b, c).normalize() * (0.75 + 0.45 * r(10 + i as u32));
                let v = Vec3::new(v.x * stretch, v.y * squash, v.z) * size * 0.5;
                Vec3::new(v.x * cy - v.z * sy, v.y, v.x * sy + v.z * cy) + Vec3::new(x, ground - size * 0.12, z)
            })
            .collect();
        // grey to brown, a little darker below, lichen-pale on some tops (linear: rock about 0.15 to 0.25)
        let grey = colour;
        for f in faces {
            let (a, b, c) = (pts[f[0] as usize], pts[f[1] as usize], pts[f[2] as usize]);
            let n = (b - a).cross(c - a).normalize_or_zero();
            let shade = if n.y > 0.5 && r(6) > 0.6 { grey.lerp(Vec3::new(0.30, 0.31, 0.24), 0.35) } else { grey * (0.85 + 0.15 * n.y) };
            let i0 = self.vert(a, n, shade);
            let i1 = self.vert(b, n, shade);
            let i2 = self.vert(c, n, shade);
            self.idx.extend_from_slice(&[i0, i1, i2]);
        }
    }
}

/// One square of the land, `size` metres from (x0, z0), `n` cells a side, in the colour `colour` gives: a grid on the
/// height function, with a short skirt hanging down its edges so neighbours of another resolution never show a gap.
fn patch(g: &mut Geo, x0: f32, z0: f32, size: f32, n: u32, h: &dyn Fn(f32, f32) -> f32, colour: &dyn Fn(f32, f32) -> Vec3) {
    let first = g.col.len();
    patch_inner(g, x0, z0, size, n, h, colour);
    // ground, not a stone: the ground shader composes its look from the biome (alpha 0.5 marks it)
    for c in &mut g.col[first..] {
        c[3] = 0.5;
    }
}

fn patch_inner(g: &mut Geo, x0: f32, z0: f32, size: f32, n: u32, h: &dyn Fn(f32, f32) -> f32, colour: &dyn Fn(f32, f32) -> Vec3) {
    let step = size / n as f32;
    let start = g.pos.len() as u32;
    for j in 0..=n {
        for i in 0..=n {
            let (x, z) = (x0 + i as f32 * step, z0 + j as f32 * step);
            g.vert(Vec3::new(x, h(x, z), z), normal_of(h, x, z, step * 0.5), colour(x, z));
        }
    }
    let at = |i: u32, j: u32| start + j * (n + 1) + i;
    for j in 0..n {
        for i in 0..n {
            g.idx.extend_from_slice(&[at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)]);
        }
    }
    // the skirt: each edge vertex again, 0.3 m lower
    let drop = 0.3;
    let edges: [Vec<(u32, u32)>; 4] = [
        (0..=n).map(|i| (i, 0)).collect(),
        (0..=n).map(|j| (n, j)).collect(),
        (0..=n).rev().map(|i| (i, n)).collect(),
        (0..=n).rev().map(|j| (0, j)).collect(),
    ];
    for edge in edges {
        for w in edge.windows(2) {
            let (a, b) = (at(w[0].0, w[0].1), at(w[1].0, w[1].1));
            let (pa, pb) = (Vec3::from(g.pos[a as usize]), Vec3::from(g.pos[b as usize]));
            let ca = Vec3::new(g.col[a as usize][0], g.col[a as usize][1], g.col[a as usize][2]);
            let na = g.vert(pa - Vec3::Y * drop, Vec3::Y, ca);
            let nb = g.vert(pb - Vec3::Y * drop, Vec3::Y, ca);
            g.idx.extend_from_slice(&[a, b, na, b, nb, na]);
        }
    }
}

/// The ground of one grass chunk (`CHUNK` metres square at chunk (cx, cz)), its detail by `share` (see
/// `grass::share`): centimetre cells and stones near the eye, coarser further out.
pub fn chunk(cx: i32, cz: i32, size: f32, share: f32) -> Mesh {
    let mut g = Geo::default();
    let n = if share >= 1.0 { 64 } else if share >= 0.35 { 32 } else if share >= 0.09 { 16 } else { 8 };
    // near the eye the floor shows its own small mottle (litter, moss, soil, a few to 30 cm across) around the
    // same average as the sward seen from afar, so it looks alike from a distance and alive from close by
    let near = share >= 1.0;
    let mottled = |x: f32, z: f32| {
        let base = colour(x, z);
        if !near {
            return base;
        }
        let litter = (noise(x, z, 0.22, 30) - 0.5) * 2.0;
        let moss = (noise(x, z, 0.09, 31) - 0.5) * 2.0;
        let soil = ((noise(x, z, 0.35, 32) - 0.62) / 0.2).clamp(0.0, 1.0);
        let tint = Vec3::new(1.0 + 0.35 * litter, 1.0 + 0.12 * moss, 1.0 + 0.2 * litter);
        (base * tint * (0.8 + 0.4 * noise(x, z, 0.04, 33))).lerp(soil_colour(x, z), soil * 0.6)
    };
    patch(&mut g, cx as f32 * size, cz as f32 * size, size, n, &height, &mottled);
    if share >= 1.0 {
        // per square metre, near the eye only (where a few centimetres show): 9 clods of earth (2 to 6 cm), 5
        // pebbles (1 to 5 cm), and a stone (6 to 25 cm) in every few square metres
        // what lies on the ground, from the biome's recipe: each kind so many to the square metre, its own sizes
        let biome = crate::biome::current();
        let library = crate::library::load();
        for (n, p) in biome.places.iter().enumerate() {
            let Some(a) = library.get(&p.asset).filter(|a| a.kind == "rock") else { continue };
            let count = (p.per_m2 * size * size) as u32;
            for k in 0..count {
                let seed = (cx.wrapping_mul(92837) ^ cz.wrapping_mul(689287)) as u32 ^ k.wrapping_mul(2654435761) ^ (n as u32).wrapping_mul(0x51ED_270B);
                let (x, z) = (cx as f32 * size + hash(seed as i32, 1, 5) * size, cz as f32 * size + hash(seed as i32, 2, 5) * size);
                let open = bare(x, z) > 0.5;
                if (p.on == "open" && !open) || (p.on == "grass" && open) {
                    continue;
                }
                let r = hash(seed as i32, 4, 5);
                let across = a.size[0] + (a.size[1] - a.size[0]) * r * r;
                let col = crate::library::colour(a, hash(seed as i32, 7, 5)) * (0.8 + 0.4 * hash(seed as i32, 8, 5));
                match a.generator.as_str() {
                    "clod" => g.clod(x, z, across, seed, col, a.flatness),
                    _ => g.stone(x, z, across, seed, col, a.flatness),
                }
            }
        }
    }
    g.mesh()
}

/// The land from beyond the grass to the horizon: rings around (cx, cz) from `inner` metres out to 200 km, wider the
/// further out, on the large shape only, in the sward's colour. Rebuilt as the eye moves.
/// The land beyond the near ground, out to 260 km: nested square grids of 64 × 64 cells, each level twice as coarse
/// as the one inside it, so every triangle is square-ish wherever the eye looks (no long thin wedges to smear the
/// colour). Each level's outer border follows the coarser level's straight edges, so they meet without cracks. Cells
/// wholly inside `hole` (the near ground, in world x0, z0, x1, z1) are left out.
pub fn far(cx: f32, cz: f32, hole: Option<[f32; 4]>) -> Mesh {
    let mut g = Geo::default();
    const N: i32 = 64;
    let mut inner: Option<[f32; 4]> = None;
    for level in 0..13 {
        let c = 2.0 * 2f32.powi(level);
        let (ox, oz) = ((cx / (2.0 * c)).round() * 2.0 * c, (cz / (2.0 * c)).round() * 2.0 * c);
        let (x0, z0) = (ox - 32.0 * c, oz - 32.0 * c);
        let start = g.pos.len() as u32;
        for j in 0..=N {
            for i in 0..=N {
                let (x, z) = (x0 + i as f32 * c, z0 + j as f32 * c);
                let border = i == 0 || i == N || j == 0 || j == N;
                // an odd vertex on the border lies on the coarser level's straight edge: take the middle of its two
                // neighbours there, so no crack opens between the levels
                let (y, col) = if border && (i % 2 == 1 || j % 2 == 1) {
                    let (dx, dz) = if i % 2 == 1 { (c, 0.0) } else { (0.0, c) };
                    ((big(x - dx, z - dz) + big(x + dx, z + dz)) / 2.0, (colour(x - dx, z - dz) + colour(x + dx, z + dz)) / 2.0)
                } else {
                    (big(x, z), colour(x, z))
                };
                // a little under the near ground, which carries the small bumps the far land leaves out
                g.vert(Vec3::new(x, y - 0.12, z), normal_of(&big, x, z, c * 0.5), col);
            }
        }
        let at = |i: i32, j: i32| start + (j * (N + 1) + i) as u32;
        let inside = |r: Option<[f32; 4]>, ax: f32, az: f32, bx: f32, bz: f32| {
            r.is_some_and(|r| ax >= r[0] - 0.01 && az >= r[1] - 0.01 && bx <= r[2] + 0.01 && bz <= r[3] + 0.01)
        };
        for j in 0..N {
            for i in 0..N {
                let (ax, az) = (x0 + i as f32 * c, z0 + j as f32 * c);
                let (bx, bz) = (ax + c, az + c);
                if inside(inner, ax, az, bx, bz) || inside(hole, ax, az, bx, bz) {
                    continue;
                }
                g.idx.extend_from_slice(&[at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)]);
            }
        }
        inner = Some([x0, z0, x0 + N as f32 * c, z0 + N as f32 * c]);
    }
    for c in &mut g.col {
        c[3] = 0.5; // all ground
    }
    g.mesh()
}

/// The master of a library rock (a generator, `library::GENERATORS`): the full-detail individual `seed`, `size`
/// metres across, resting on flat ground at the origin.
pub fn rock_master(a: &crate::library::Asset, seed: u32, size: f32, colour: Vec3) -> Mesh {
    let mut g = Geo::default();
    match a.generator.as_str() {
        "clod" => g.clod(0.0, 0.0, size, seed, colour, a.flatness),
        _ => g.stone(0.0, 0.0, size, seed, colour, a.flatness),
    }
    // built on the land's height there: brought down to y = 0
    let ground = height(0.0, 0.0);
    for p in &mut g.pos {
        p[1] -= ground;
    }
    g.mesh()
}
