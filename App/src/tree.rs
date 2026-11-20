//! The broadleaf tree, grown from its seed: a trunk with a flared, buttressed foot, limbs, branches and twigs grown
//! recursively from it, and leaves at the twigs. Every number comes from the seed, so a new seed is a new individual
//! of the same kind of tree: taller or shorter, a beech's upright crown or an oak's wide, crooked one.
//!
//! The wood is tapered generalized cylinders: each branch a polyline with a radius at every point, a ring of
//! vertices around each point, turned along the branch without twisting (parallel transport). The leaves are one
//! leaf shape, folded along its midrib, copied to every leaf with its own turn, size and shade, and made of a front
//! and a back face so it is seen from both sides without a double-sided material. Colours are linear reflectance:
//! the bark a grey-brown between about 0.10 and 0.20, the leaves the asset's green.
//!
//! The master stands with the trunk's foot at the origin, Y up, in metres, like every other master (`grass.rs`,
//! `terrain.rs`). At full detail it has a few hundred thousand triangles; its far views are made from it.

use bevy::asset::RenderAssetUsages;
use crate::library::ATTRIBUTE_WIND;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use std::f32::consts::{PI, TAU};

// The tree's wind weight (`library::ATTRIBUTE_WIND`) follows the branch hierarchy: 0 at the trunk's foot, rising
// along every branch by the length walked from the root, faster the higher the branch's order (a twig bends more per
// metre than a limb), so a twig's tip is near 1 and a leaf's tip a little more than its twig. It is continuous at
// every fork: a branch starts with its parent's weight where it leaves it, so the wood never tears apart when it
// sways. The whole tree is scaled so its largest weight is 1.

/// Per branch order (0 the trunk, 1 the limbs, 2 the branches, 3 the small branches, 4 the twigs): sides around a
/// ring, points along the branch, the radius at its tip (metres), how strongly it turns up towards the light (per
/// metre), how much it wanders (crooked), and how fast its wind weight rises per metre (in tree heights).
const SIDES: [usize; 5] = [28, 12, 8, 5, 4];
const SEGS: [usize; 5] = [36, 14, 8, 5, 3];
const TIP: [f32; 5] = [0.0, 0.02, 0.008, 0.004, 0.0025];
const TROPISM: [f32; 5] = [0.0, 0.05, 0.08, 0.06, 0.02];
const WOBBLE: [f32; 5] = [0.03, 0.10, 0.14, 0.18, 0.20];
const GAIN: [f32; 5] = [0.12, 0.5, 1.2, 2.5, 4.0];
/// For the children of each order: how many per metre of their parent, how long against their parent, where along
/// the parent they start (the parent's lower part shed its branches in the shade), and their angle off the parent.
const DENSITY: [f32; 5] = [0.0, 0.0, 1.5, 3.0, 7.0];
const LENGTH: [f32; 5] = [0.0, 0.0, 0.5, 0.45, 0.5];
const START: [f32; 5] = [0.0, 0.0, 0.2, 0.15, 0.1];
const ANGLE: [f32; 5] = [0.0, 0.0, 0.75, 0.85, 0.95];

/// A deterministic random sequence from the seed (splitmix64), so the same seed grows the same tree every time.
struct Rng(u64);

impl Rng {
    fn new(seed: u32) -> Self {
        Rng((seed as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ 0x7EE0_0050_B1A5_0F00)
    }
    /// The next number in [0, 1).
    fn f(&mut self) -> f32 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut x = self.0;
        x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        x ^= x >> 31;
        (x >> 40) as f32 / (1u64 << 24) as f32
    }
    fn range(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.f()
    }
    /// A random nudge, each axis in [-1, 1].
    fn nudge(&mut self) -> Vec3 {
        Vec3::new(self.f() * 2.0 - 1.0, self.f() * 2.0 - 1.0, self.f() * 2.0 - 1.0)
    }
}

/// A deterministic hash to [0, 1), for the bark's streaks (which must not use up the growth's random sequence).
fn hash(a: u32, b: u32, c: u32) -> f32 {
    let mut x = a.wrapping_mul(0x9E37_79B1) ^ b.wrapping_mul(0x85EB_CA77) ^ c.wrapping_mul(0xC2B2_AE3D);
    x ^= x >> 15;
    x = x.wrapping_mul(0x2C1B_3C6D);
    x ^= x >> 12;
    x = x.wrapping_mul(0x297A_2D39);
    x ^= x >> 15;
    (x >> 8) as f32 / (1u32 << 24) as f32
}

/// One branch of the skeleton: its points from where it leaves its parent to its tip, the radius and wind weight at
/// each, and whether it bears leaves (a twig, or any branch too short to have branches of its own).
struct Limb {
    order: usize,
    pts: Vec<Vec3>,
    rad: Vec<f32>,
    wind: Vec<f32>,
    leafy: bool,
}

impl Limb {
    /// Where the branch is at `t` (0 its start, 1 its tip) by length along it: the point, the direction, the radius
    /// and the wind weight there.
    fn at(&self, t: f32) -> (Vec3, Vec3, f32, f32) {
        let mut along = vec![0.0];
        for w in self.pts.windows(2) {
            along.push(along.last().unwrap() + w[0].distance(w[1]));
        }
        let want = t.clamp(0.0, 1.0) * along.last().unwrap();
        let i = along.iter().position(|&s| s >= want).unwrap_or(along.len() - 1).clamp(1, self.pts.len() - 1) - 1;
        let u = ((want - along[i]) / (along[i + 1] - along[i]).max(1e-6)).clamp(0.0, 1.0);
        let dir = (self.pts[i + 1] - self.pts[i]).normalize_or(Vec3::Y);
        let lerp = |v: &[f32]| v[i] + (v[i + 1] - v[i]) * u;
        (self.pts[i].lerp(self.pts[i + 1], u), dir, lerp(&self.rad), lerp(&self.wind))
    }

    fn length(&self) -> f32 {
        self.pts.windows(2).map(|w| w[0].distance(w[1])).sum()
    }
}

/// Two directions square to `d` and to each other, the first as near to straight up as it can be: a branch's
/// children are placed around it in this frame, so "sideways" means level.
fn frame(d: Vec3) -> (Vec3, Vec3) {
    let up = (Vec3::Y - d * d.dot(Vec3::Y)).try_normalize().unwrap_or_else(|| d.any_orthonormal_vector());
    (up, d.cross(up))
}

/// The growth: the random sequence, the branches grown so far, and the individual's character.
struct Grow {
    rng: Rng,
    limbs: Vec<Limb>,
    /// The tree's height, metres: wind weights rise per tree height, so a tall tree sways like a small one.
    height: f32,
    /// 0 a beech (upright, smooth, grey), 1 an oak (spreading, crooked, brown).
    spread: f32,
}

impl Grow {
    /// Grows a branch of `order` from `start` towards `dir`, `len` long, `r0` thick at its base, with the wind weight
    /// `w0` its parent has there; then its own branches, down to the twigs.
    fn limb(&mut self, order: usize, start: Vec3, dir: Vec3, len: f32, r0: f32, w0: f32) {
        let segs = SEGS[order];
        let step = len / segs as f32;
        let tip = TIP[order].min(r0 * 0.5);
        // an oak's branches turn up less and wander more than a beech's
        let tropism = TROPISM[order] * (1.2 - 0.6 * self.spread);
        let wobble = WOBBLE[order] * (0.6 + 0.9 * self.spread);
        let (mut p, mut d) = (start, dir.normalize());
        let mut me = Limb { order, pts: vec![p], rad: vec![r0], wind: vec![w0], leafy: false };
        for i in 1..=segs {
            d = (d + Vec3::Y * tropism * step + self.rng.nudge() * wobble * step.sqrt()).normalize();
            p += d * step;
            let t = i as f32 / segs as f32;
            me.pts.push(p);
            me.rad.push(tip + (r0 - tip) * (1.0 - t).powf(1.3));
            me.wind.push(w0 + step * i as f32 * GAIN[order] / self.height);
        }
        let at = self.limbs.len();
        self.limbs.push(me);
        let children = if order < 4 { self.branches(at) } else { 0 };
        self.limbs[at].leafy = children == 0;
    }

    /// The branches of the branch `at`, one order finer: spaced along it, alternating left and right of it (so a
    /// branch carries a flat-ish fan, as a beech's and an oak's do), shorter towards its tip. Returns how many grew.
    fn branches(&mut self, at: usize) -> usize {
        let (order, len) = (self.limbs[at].order, self.limbs[at].length());
        let c = order + 1;
        let n = (len * DENSITY[c] * self.rng.range(0.8, 1.2)).round() as usize;
        let mut side = if self.rng.f() < 0.5 { 1.0 } else { -1.0 };
        let mut grown = 0;
        for k in 0..n {
            let t = START[c] + (0.98 - START[c]) * (k as f32 + self.rng.range(0.2, 0.8)) / n as f32;
            let (p, d, r, w) = self.limbs[at].at(t);
            let child = len * LENGTH[c] * (1.0 - 0.6 * t) * self.rng.range(0.7, 1.2);
            if child < 0.05 {
                continue;
            }
            side = -side;
            // around the parent: mostly to its sides, now and then up or down
            let phi = side * self.rng.range(0.6, 2.1);
            let a = ANGLE[c] + self.rng.range(-0.2, 0.2);
            let (up, across) = frame(d);
            let dir = d * a.cos() + (up * phi.cos() + across * phi.sin()) * a.sin();
            // never thicker than the parent where it leaves it, even where the parent is down to a twig's thickness
            let r0 = (r * self.rng.range(0.55, 0.75)).max(TIP[c] * 1.5).min(r * 0.85);
            self.limb(c, p, dir, child, r0, w);
            grown += 1;
        }
        grown
    }
}

/// Geometry being built: positions, normals, UVs, colours, wind weights, indices.
#[derive(Default)]
struct Geo {
    pos: Vec<[f32; 3]>,
    nrm: Vec<[f32; 3]>,
    uv: Vec<[f32; 2]>,
    col: Vec<[f32; 4]>,
    wind: Vec<f32>,
    idx: Vec<u32>,
}

impl Geo {
    fn vert(&mut self, p: Vec3, n: Vec3, uv: [f32; 2], c: Vec3, w: f32) -> u32 {
        self.pos.push(p.to_array());
        self.nrm.push(n.to_array());
        self.uv.push(uv);
        self.col.push([c.x, c.y, c.z, 1.0]);
        self.wind.push(w);
        self.pos.len() as u32 - 1
    }

    /// A branch as a tapered tube: a ring of `sides` vertices at each of its points, turned along it by parallel
    /// transport so the rings never twist. `radius(i, θ)` is the radius at point `i` and angle `θ`, which lets the
    /// trunk's foot flare into buttresses; the normals follow the radius's slope along and around the tube.
    fn tube(&mut self, l: &Limb, sides: usize, radius: &dyn Fn(usize, f32) -> f32, colour: &dyn Fn(usize, usize) -> Vec3) {
        let n = l.pts.len();
        let tangent = |i: usize| (l.pts[(i + 1).min(n - 1)] - l.pts[i.saturating_sub(1)]).normalize_or(Vec3::Y);
        let mut normal = tangent(0).any_orthonormal_vector();
        let base = self.pos.len() as u32;
        let mut along = 0.0;
        for i in 0..n {
            let t = tangent(i);
            normal = (normal - t * normal.dot(t)).try_normalize().unwrap_or_else(|| t.any_orthonormal_vector());
            let bi = t.cross(normal);
            if i > 0 {
                along += l.pts[i].distance(l.pts[i - 1]);
            }
            let (prev, next) = (i.saturating_sub(1), (i + 1).min(n - 1));
            let ds = l.pts[prev].distance(l.pts[next]).max(1e-5);
            for j in 0..=sides {
                let th = j as f32 / sides as f32 * TAU;
                let radial = normal * th.cos() + bi * th.sin();
                let around = -normal * th.sin() + bi * th.cos();
                let r = radius(i, th);
                let dr_ds = (radius(next, th) - radius(prev, th)) / ds;
                let dr_dth = (radius(i, th + 0.01) - radius(i, th - 0.01)) / 0.02;
                let nr = (radial - t * dr_ds - around * dr_dth / r.max(1e-4)).normalize_or(radial);
                let uv = [j as f32 / sides as f32, along / (TAU * l.rad[0].max(0.01))];
                self.vert(l.pts[i] + radial * r, nr, uv, colour(i, j % sides), l.wind[i]);
            }
        }
        let ring = sides as u32 + 1;
        for i in 0..n as u32 - 1 {
            for j in 0..sides as u32 {
                let a = base + i * ring + j;
                self.idx.extend_from_slice(&[a, a + 1, a + ring, a + 1, a + ring + 1, a + ring]);
            }
        }
    }

    fn mesh(self) -> Mesh {
        Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
            .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, self.pos)
            .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, self.nrm)
            .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, self.uv)
            .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, self.col)
            .with_inserted_attribute(ATTRIBUTE_WIND, self.wind)
            .with_inserted_indices(Indices::U32(self.idx))
    }
}

/// The one leaf shape every leaf is a copy of: an ovate blade one unit long along +Z, its face up (+Y), folded a
/// little along its midrib and drooping towards its tip. Its points, their normals and its triangles (eight).
fn leaf_shape() -> (Vec<Vec3>, Vec<Vec3>, Vec<[u32; 3]>) {
    let pts = vec![
        Vec3::new(0.0, 0.0, 0.0),       // 0 the stalk's end
        Vec3::new(0.0, 0.0, 0.35),      // 1, 2 the midrib
        Vec3::new(0.0, -0.02, 0.7),
        Vec3::new(0.0, -0.07, 1.0),     // 3 the tip
        Vec3::new(-0.30, -0.04, 0.33),  // 4, 5 the left edge
        Vec3::new(-0.22, -0.07, 0.70),
        Vec3::new(0.30, -0.04, 0.33),   // 6, 7 the right edge
        Vec3::new(0.22, -0.07, 0.70),
    ];
    let mut tris = vec![[0, 1, 4], [4, 1, 2], [4, 2, 5], [5, 2, 3], [0, 6, 1], [6, 2, 1], [6, 7, 2], [7, 3, 2]];
    let mut nrm = vec![Vec3::ZERO; pts.len()];
    for t in &mut tris {
        let mut f = (pts[t[1] as usize] - pts[t[0] as usize]).cross(pts[t[2] as usize] - pts[t[0] as usize]);
        // every triangle faces up: the front of the leaf
        if f.y < 0.0 {
            t.swap(1, 2);
            f = -f;
        }
        for &k in t.iter() {
            nrm[k as usize] += f;
        }
    }
    let nrm = nrm.into_iter().map(|n| n.normalize_or(Vec3::Y)).collect();
    (pts, nrm, tris)
}

/// The master of the broadleaf tree (a generator, `library::GENERATORS`): the full-detail individual `seed`, `size`
/// metres tall, its foot at the origin, its leaves `col`.
pub fn tree_master(_: &crate::library::Asset, seed: u32, size: f32, col: Vec3) -> Mesh {
    let mut rng = Rng::new(seed);
    let height = size;
    let spread = rng.f();
    let mut grow = Grow { rng, limbs: Vec::new(), height, spread };

    // the trunk: up to where it forks into the crown's main limbs, half to two thirds of the height, leaning a
    // little; its points close together at the foot, where the flare changes fast
    let trunk_len = height * grow.rng.range(0.48, 0.62) * (1.0 - 0.15 * spread);
    let r0 = height * grow.rng.range(0.017, 0.022);
    let lean = Vec3::new(grow.rng.range(-0.06, 0.06), 1.0, grow.rng.range(-0.06, 0.06)).normalize();
    let mut trunk = Limb { order: 0, pts: Vec::new(), rad: Vec::new(), wind: Vec::new(), leafy: false };
    let (mut p, mut d) = (Vec3::new(0.0, -0.15, 0.0), lean);
    let mut walked = 0.0;
    for i in 0..=SEGS[0] {
        let t = (i as f32 / SEGS[0] as f32).powf(1.6);
        if i > 0 {
            let step = trunk_len * t - walked;
            d = (d + grow.rng.nudge() * WOBBLE[0] * (0.5 + spread) * step.sqrt()).normalize();
            d = (d + (Vec3::Y - d) * 0.05).normalize();
            p += d * step;
            walked += step;
        }
        trunk.pts.push(p);
        trunk.rad.push(r0 * (1.0 - 0.4 * t));
        trunk.wind.push(walked * GAIN[0] / height);
    }
    grow.limbs.push(trunk);

    // the crown's width, from a narrow beech to a wide oak
    let crown = height * grow.rng.range(0.32, 0.42) * (1.0 + 0.4 * spread);
    // the limbs along the trunk above the crown's base, in a spiral (the golden angle, a little off), long and
    // spreading low down, shorter and steeper higher up
    let crown_base = grow.rng.range(0.3, 0.5);
    let laterals = grow.rng.range(5.0, 9.5) as usize;
    let mut phi = grow.rng.f() * TAU;
    for k in 0..laterals {
        let t = crown_base + (0.94 - crown_base) * (k as f32 + grow.rng.range(0.2, 0.8)) / laterals as f32;
        let (p, d, r, w) = grow.limbs[0].at(t);
        phi += 2.4 + grow.rng.range(-0.35, 0.35);
        let tilt = (1.25 - 0.5 * t + 0.25 * spread + grow.rng.range(-0.15, 0.15)).min(1.45);
        let (up, across) = frame(d);
        let dir = d * tilt.cos() + (up * phi.cos() + across * phi.sin()) * tilt.sin();
        let len = crown * (0.75 + 0.5 * (1.0 - t)) * grow.rng.range(0.8, 1.1);
        let r1 = (r * grow.rng.range(0.42, 0.58)).max(TIP[1] * 2.0);
        grow.limb(1, p, dir, len, r1, w);
    }
    // at its top the trunk divides into two to four limbs that carry the upper crown up to the tree's height
    let forks = 2 + (grow.rng.f() * 2.99) as usize;
    let (top, d, r, w) = grow.limbs[0].at(1.0);
    let mut phi = grow.rng.f() * TAU;
    for _ in 0..forks {
        phi += TAU / forks as f32 + grow.rng.range(-0.4, 0.4);
        let tilt = grow.rng.range(0.3, 0.65) + 0.2 * spread;
        let (up, across) = frame(d);
        let dir = d * tilt.cos() + (up * phi.cos() + across * phi.sin()) * tilt.sin();
        let len = (height - top.y) * grow.rng.range(0.9, 1.15) / tilt.cos();
        let r1 = r * grow.rng.range(0.6, 0.78);
        grow.limb(1, top, dir, len, r1, w);
    }

    // scaled so the crown's top (with its outermost leaves) is the tree's height: the growth only aims at it
    let reach = grow.limbs.iter().flat_map(|l| l.pts.iter()).fold(0.0f32, |m, p| m.max(p.y)) + 0.08;
    let scale = height / reach;
    for l in &mut grow.limbs {
        l.pts.iter_mut().for_each(|p| *p *= scale);
        l.rad.iter_mut().for_each(|r| *r *= scale);
    }

    let mut g = Geo::default();
    let (mut rng, limbs) = (grow.rng, grow.limbs);

    // the bark: a beech's smooth grey to an oak's grey-brown, finer branches a little warmer and darker
    let bark = Vec3::new(0.18, 0.17, 0.155).lerp(Vec3::new(0.14, 0.115, 0.09), spread) * rng.range(0.9, 1.1);
    let twig = Vec3::new(0.12, 0.095, 0.075);
    // the foot's buttresses: five to seven roots, each a lobe of the flare, fading out within the first metre
    let lobes = 5.0 + (rng.f() * 2.99).floor();
    let turn = rng.f() * TAU;
    let flare = rng.range(0.45, 0.7);
    for (k, l) in limbs.iter().enumerate() {
        let shade = bark.lerp(twig, l.order as f32 / 4.0);
        let streaks = 0.15 + 0.15 * spread;
        let colour = |i: usize, j: usize| {
            // vertical streaks of the bark, and the foot darker where the soil splashes it
            let s = 1.0 - streaks + 2.0 * streaks * hash(seed ^ k as u32, j as u32, i as u32 / 3);
            let foot = if l.order == 0 { 0.75 + 0.25 * (l.pts[i].y / 0.6).clamp(0.0, 1.0) } else { 1.0 };
            shade * s * foot
        };
        if l.order == 0 {
            let radius = |i: usize, th: f32| {
                let y = l.pts[i].y.max(0.0);
                let lobe = (0.5 + 0.5 * (lobes * th + turn).cos()).powi(3);
                l.rad[i] * (1.0 + 0.25 * (-y / 1.2).exp() + flare * (-y / 0.35).exp() * (0.3 + 0.7 * lobe))
            };
            g.tube(l, SIDES[0], &radius, &colour);
        } else {
            g.tube(l, SIDES[l.order], &|i, _| l.rad[i], &colour);
        }
    }

    // the leaves: one shape, copied along every leafy branch's outer part and clustered at its tip, each turned to
    // face the sky more or less, its own size and shade; about fourteen thousand on a tree 8 m tall, twenty-six
    // thousand at 16 m
    let (shape, shape_nrm, shape_tris) = leaf_shape();
    let leafy: Vec<&Limb> = limbs.iter().filter(|l| l.leafy).collect();
    let wanted = 2_000.0 + 1_500.0 * height;
    let per = (wanted / leafy.len().max(1) as f32).clamp(4.0, 24.0);
    let centre = Vec3::new(0.0, height * 0.6, 0.0);
    for l in leafy {
        let n = (per * rng.range(0.8, 1.2)).round() as usize;
        let mut side = 1.0;
        for k in 0..n {
            // the last few leaves crowd at the tip
            let at_tip = k + 3 >= n;
            let t = if at_tip { rng.range(0.9, 1.0) } else { 0.25 + 0.65 * (k as f32 + rng.f()) / n as f32 };
            let (p, d, _, w) = l.at(t);
            side = -side;
            let (up, across) = frame(d);
            let phi = if at_tip { rng.range(-PI, PI) } else { side * rng.range(1.0, 2.0) };
            let off = rng.range(0.8, 1.25);
            let axis = (d * off.cos() + (up * phi.cos() + across * phi.sin()) * off.sin()).normalize();
            // the blade turned towards the sky, never quite flat
            let face = (Vec3::Y + rng.nudge() * 0.6 - axis * axis.dot(Vec3::Y)).normalize_or(up);
            let face = (face - axis * face.dot(axis)).normalize_or(up);
            let basis = Mat3::from_cols(face.cross(axis), face, axis);
            let size = rng.range(0.07, 0.11) * if at_tip { 0.8 } else { 1.0 };
            let foot = p + axis * 0.008;
            // shade leaves deep in the crown are darker; each leaf its own tint, a little towards yellow or blue
            let inner = 0.88 + 0.12 * (foot.distance(centre) / (height * 0.5)).clamp(0.0, 1.0);
            let tint = Vec3::new(1.0 + rng.range(-0.15, 0.2), 1.0 + rng.range(-0.08, 0.1), 1.0 + rng.range(-0.15, 0.1));
            let front = col * tint * inner * rng.range(0.85, 1.15);
            // the leaf's underside is paler and duller
            let back = front * Vec3::new(1.25, 1.15, 1.2);
            for (faces, c, sign) in [(0, front, 1.0f32), (1, back, -1.0)] {
                let base = g.pos.len() as u32;
                for (v, nv) in shape.iter().zip(&shape_nrm) {
                    let n = basis * *nv * sign;
                    let q = foot + basis * *v * size - n * 0.0004 * faces as f32;
                    g.vert(q, n, [v.x + 0.5, v.z], c, w + 0.08 * v.z);
                }
                for t in &shape_tris {
                    let t = if faces == 0 { *t } else { [t[0], t[2], t[1]] };
                    g.idx.extend(t.iter().map(|&i| base + i));
                }
            }
        }
    }

    // the wind weights brought to [0, 1]: the trunk's foot stays at 0
    let most = g.wind.iter().fold(0.0f32, |m, &w| m.max(w)).max(1e-6);
    g.wind.iter_mut().for_each(|w| *w = (*w / most).clamp(0.0, 1.0));
    g.mesh()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::mesh::VertexAttributeValues;

    fn positions(m: &Mesh) -> &Vec<[f32; 3]> {
        match m.attribute(Mesh::ATTRIBUTE_POSITION) {
            Some(VertexAttributeValues::Float32x3(p)) => p,
            _ => panic!("no positions"),
        }
    }

    /// The broadleaf's masters: the same tree from a seed, in budget, wind weights from the foot up, a new tree for a
    /// new seed. Their size is `library`'s test.
    #[test]
    fn tree_grows_the_same_from_a_seed_in_budget() {
        let broadleaf = crate::library::builtin().into_iter().find(|a| a.generator == "tree").unwrap();
        let mut tops = Vec::new();
        for seed in 1..=4 {
            let (a, b) = (crate::library::master(&broadleaf, seed), crate::library::master(&broadleaf, seed));
            assert_eq!(positions(&a), positions(&b), "seed {seed} grows the same tree twice");
            let tris = crate::library::triangles(&a);
            let width = positions(&a).iter().fold(0.0f32, |m, p| m.max(2.0 * p[0].hypot(p[2])));
            let top = positions(&a).iter().fold(f32::MIN, |m, p| m.max(p[1]));
            println!("tree seed {seed}: {tris} triangles, {} vertices, {top:.1} m tall, {width:.1} m across", positions(&a).len());
            assert!((150_000..=700_000).contains(&tris), "seed {seed}: {tris} triangles");
            let Some(VertexAttributeValues::Float32(wind)) = a.attribute(ATTRIBUTE_WIND) else { panic!("no wind") };
            assert_eq!(wind.len(), positions(&a).len());
            assert!(wind.iter().all(|w| (0.0..=1.0).contains(w)), "wind weights in [0, 1]");
            let lowest = positions(&a).iter().zip(wind).min_by(|x, y| x.0[1].total_cmp(&y.0[1])).unwrap();
            assert!(*lowest.1 < 0.01, "the trunk's foot does not move");
            tops.push(top);
        }
        assert!(tops.windows(2).any(|w| (w[0] - w[1]).abs() > 0.1), "seeds grow different trees");
    }
}
