// What moves in the stress stand (src/scatter/stress.js): stand-ins for the people, robots, animals, vehicles and
// flying things to come, made as they will be: ONE mesh, a skeleton under it, every vertex bound to two of its bones,
// the bones moved by the clock. Nobody modelled or rigged one: a rig here is a few lines that set out bones and lay
// tubes round them (a trunk, limbs of two segments, wheels, wings, a chain of links); from that the kit makes the mesh at
// every level of the ladder, each vertex's place on the next coarser level, and its bones' weights.
//
//   creatureMesh(c, l)  -> { index, verts }   level l of the ladder (ladder.js), packed (solid.js): the same contract
//                                             as any kind of the heap (assets/zoo/index.js; its family: assets/zoo/creatures.js)
//   creatureBones(c)    -> Float32Array        its BONES bones, three rows of four a bone:
//                                             [pivot x, y, z, parent], [axis x, y, z, type], [amp, rate, phase, base]
//   RIGS                the kinds of mover: how fast, how large, how high it flies
//
// A bone (src/scatter/stress.js moves it, on the GPU, by the mover's stride g, radians):
//   type 0  still
//   type 1  swings about its axis through its pivot:  base + amp · sin(g · rate + phase)     a leg, an arm, a wing, a tail
//   type 2  shifts along its axis:                   amp · sin(g · rate + phase)            a body's bob, a snake's wave
//   type 3  turns about its axis through its pivot:  g · rate                               a wheel
// and after its own move its parent's (one level: a shin goes with its thigh).
// A creature's coarse levels are one body (a hull: a ball its size); its tubes melt into that as it shrinks.
import { LADDER, FULLN, DOTN, roomOf, underOf } from './ladder.js';
import { packSolid, dotMesh, BONES } from './solid.js';
import { ball, onBall, faceOf, ballMesh, normalsOf, hash3, noise3, SWELL } from './blob.js';

export const VARIANTS = 100, STRIDE = 0.13;   // VARIANTS: the kinds of each rig (other proportions, other skins); STRIDE: a mover goes its size times this for one radian of stride
const PI = Math.PI, TAU = PI * 2;
const B = (pivot, o = {}) => ({ pivot, axis: [0, 0, 1], type: 0, amp: 0, rate: 1, phase: 0, base: 0, parent: 0, ...o });
const T = (a, b, r0, r1, o = {}) => ({ a, b, r0, r1, flat: 1, bone: 0, from: null, blend: 0.3, ...o });   // a tube from a to b, r0 wide at a and r1 at b; flat: its second side to its first; bone: what moves it; from: the bone its start is still held by (over `blend` of its length)
// a limb of two segments: a thigh that swings at the hip, a shin that goes with it and bends at the knee
const limb = (bones, tubes, hip, knee, foot, rad, o) => {
  const up = bones.length, axis = o.axis ?? [0, 0, 1];
  bones.push(B(hip, { type: 1, axis, amp: o.amp, rate: o.rate ?? 1, phase: o.phase ?? 0, parent: o.parent ?? 0 }), B(knee, { type: 1, axis, amp: Math.abs(o.bend) * 0.8, rate: o.rate ?? 1, phase: (o.phase ?? 0) - 1.2, base: o.bend, parent: up }));
  tubes.push(T(hip, knee, rad, rad * 0.8, { bone: up, from: o.from ?? 0, flat: o.flat ?? 1 }), T(knee, foot, rad * 0.8, rad * (o.tip ?? 0.6), { bone: up + 1, from: up, flat: o.flat ?? 1 }));
};
// a wheel: a short wide tube across the way, turning as far as the mover has gone
const wheel = (bones, tubes, x, z, r, w) => { const sg = Math.sign(z) || 1; bones.push(B([x, r, z], { type: 3, rate: -STRIDE / r })); tubes.push(T([x, r, z - sg * w], [x, r, z + sg * w], r, r, { bone: bones.length - 1, blend: 0, lumps: 0, wheel: true })); };

/** The rigs. share: how many of a plot's movers are of it; speed (m/s) and size (m): from … to; fly: metres
    over the ground, from … to; make(r): its bones and tubes (r(i): its kind's own
    numbers, 0 … 1), set out forward along x, up along y, about a unit large. */
export const RIGS = [
  { name: 'walker', share: 30, speed: [0.8, 1.8], size: [1.5, 1.9], make(r) {   // on two legs, its arms swinging against them
    const leg = 0.46 + 0.08 * r(1), w = 0.07 + 0.03 * r(2), tr = 0.11 + 0.05 * r(3), sh = leg + 0.34 + 0.06 * r(4), bones = [B([0, 0, 0])], tubes = [];
    bones.push(B([0, leg, 0], { type: 2, axis: [0, 1, 0], amp: 0.012, rate: 2 }));
    tubes.push(T([0, leg - 0.14, 0], [0, sh + 0.07, 0], tr * 0.8, tr, { flat: 1.5, bone: 1 }));
    bones.push(B([0, sh + 0.05, 0], { type: 1, axis: [0, 1, 0], amp: 0.2, rate: 0.5, parent: 1 }));
    tubes.push(T([0, sh + 0.02, 0], [0, sh + 0.2, 0], 0.075, 0.07, { bone: 2, from: 1, blend: 0.2 }));
    for (const [s, ph] of [[1, 0], [-1, PI]]) {
      limb(bones, tubes, [0, leg + 0.05, s * w], [0.01, leg * 0.52, s * w], [0.03, 0, s * w], 0.055, { amp: 0.55, phase: ph, bend: -0.5, parent: 1, from: 1 });
      limb(bones, tubes, [0, sh + 0.02, s * tr * 1.3], [0, sh - 0.2, s * (tr * 1.5 + 0.03)], [0.04, sh - 0.4, s * (tr * 1.5 + 0.03)], 0.038, { amp: 0.45, phase: ph + PI, bend: 0.5, parent: 1, from: 1 });
    }
    return { bones, tubes };
  } },
  { name: 'runner', share: 8, speed: [2.5, 5], size: [1, 2.4], make(r) {   // a robot: a small body on two long legs, leaning into its run
    const leg = 0.62 + 0.1 * r(1), w = 0.1 + 0.04 * r(2), bones = [B([0, 0, 0])], tubes = [];
    bones.push(B([0, leg, 0], { type: 2, axis: [0, 1, 0], amp: 0.02, rate: 2 }));
    tubes.push(T([-0.1, leg, 0], [0.16, leg + 0.1, 0], 0.13 + 0.05 * r(3), 0.1, { flat: 1.2, bone: 1 }));
    bones.push(B([0.14, leg + 0.14, 0], { type: 1, axis: [0, 1, 0], amp: 0.5, rate: 0.3, parent: 1 }));
    tubes.push(T([0.12, leg + 0.12, 0], [0.2, leg + 0.3, 0], 0.03, 0.05, { bone: 2, from: 1 }));
    for (const [s, ph] of [[1, 0], [-1, PI]]) limb(bones, tubes, [0, leg, s * w], [-0.08, leg * 0.5, s * w], [0.06, 0, s * w], 0.05, { amp: 0.85, phase: ph, bend: 0.7, parent: 1, from: 1 });
    return { bones, tubes };
  } },
  { name: 'four legs', share: 12, speed: [0.4, 6.4], size: [0.5, 1.7], make(r) {   // an animal: a body along its way, a head that nods, a tail that wags
    const h = 0.42 + 0.14 * r(1), len = 0.5 + 0.2 * r(2), br = 0.11 + 0.06 * r(3), w = br * 0.7, bones = [B([0, 0, 0])], tubes = [];
    bones.push(B([0, h, 0], { type: 2, axis: [0, 1, 0], amp: 0.01, rate: 2 }));
    tubes.push(T([-len / 2, h, 0], [len / 2, h + 0.03, 0], br, br * 0.9, { bone: 1, flat: 0.85 }));
    bones.push(B([len / 2, h + 0.05, 0], { type: 1, amp: 0.12, parent: 1 }));
    tubes.push(T([len / 2 - 0.03, h + 0.04, 0], [len / 2 + 0.2, h + 0.2 * r(4) + 0.08, 0], br * 0.6, br * 0.5, { bone: 2, from: 1 }));
    bones.push(B([-len / 2, h + 0.02, 0], { type: 1, axis: [0, 1, 0], amp: 0.5, rate: 1.3, parent: 1 }));
    tubes.push(T([-len / 2 + 0.02, h + 0.02, 0], [-len / 2 - 0.28, h - 0.05, 0], br * 0.3, br * 0.1, { bone: 3, from: 1 }));
    for (const [f, s, ph] of [[1, 1, 0], [1, -1, PI], [-1, 1, PI], [-1, -1, 0]]) limb(bones, tubes, [f * len * 0.38, h - 0.02, s * w], [f * len * 0.38 + 0.02, h * 0.5, s * w], [f * len * 0.38, 0, s * w], br * 0.33, { amp: 0.45, phase: ph, bend: f > 0 ? -0.4 : 0.4, parent: 1, from: 1 });
    return { bones, tubes };
  } },
  { name: 'ten legs', share: 6, speed: [0.5, 3], size: [0.8, 2.2], make(r) {   // a long body in two halves that sway, on five pairs, each a step behind the last
    const h = 0.2 + 0.1 * r(1), len = 0.9, br = 0.07 + 0.04 * r(2), bones = [B([0, 0, 0])], tubes = [];
    bones.push(B([0.2, h, 0], { type: 2, amp: 0.02 }), B([-0.2, h, 0], { type: 2, amp: 0.02, phase: 1.6 }));
    tubes.push(T([0, h, 0], [len / 2, h, 0], br, br * 0.8, { bone: 1, from: 2, blend: 0.5 }), T([-len / 2, h, 0], [0, h, 0], br * 0.6, br, { bone: 2 }));
    bones.push(B([len / 2, h, 0], { type: 1, axis: [0, 1, 0], amp: 0.25, rate: 0.5, parent: 1 }));
    tubes.push(T([len / 2 - 0.02, h, 0], [len / 2 + 0.14, h + 0.02, 0], br * 0.9, br * 0.6, { bone: 3, from: 1 }));
    for (let n = 0; n < 5; n++) for (const s of [1, -1]) {
      const x = len * 0.4 - n * len * 0.2, par = x > 0 ? 1 : 2;
      bones.push(B([x, h, s * br * 0.8], { type: 1, amp: 0.5, phase: n * 1.2 + (s > 0 ? 0 : PI), parent: par }));
      tubes.push(T([x, h, s * br * 0.8], [x + 0.02, 0, s * (br + 0.12)], br * 0.28, br * 0.12, { bone: bones.length - 1, from: par }));
    }
    return { bones, tubes };
  } },
  { name: 'rover', share: 10, speed: [2, 6], size: [0.8, 2], make(r) {   // a robot on four wheels, a mast that looks about
    const wr = 0.11 + 0.05 * r(1), len = 0.6 + 0.2 * r(2), hw = 0.2 + 0.08 * r(3), bh = wr + 0.1, bones = [B([0, 0, 0])], tubes = [];
    tubes.push(T([-len / 2, bh + 0.06, 0], [len / 2, bh + 0.06, 0], 0.11 + 0.04 * r(4), 0.1, { flat: 1.7, lumps: 0.03 }));
    for (const f of [1, -1]) for (const s of [1, -1]) wheel(bones, tubes, f * len * 0.36, s * hw, wr, 0.035);
    bones.push(B([0.1, bh + 0.16, 0], { type: 1, axis: [0, 1, 0], amp: 1.2, rate: 0.2 }));
    tubes.push(T([0.1, bh + 0.12, 0], [0.16, bh + 0.5, 0], 0.03, 0.045, { bone: bones.length - 1, from: 0 }));
    return { bones, tubes };
  } },
  { name: 'transport', share: 9, speed: [8, 20], size: [3, 6], make(r) {   // a long body on six wheels, a cab
    const wr = 0.07 + 0.03 * r(1), hw = 0.13 + 0.04 * r(2), bh = wr * 2 + 0.11, bones = [B([0, 0, 0])], tubes = [];
    tubes.push(T([-0.5, bh, 0], [0.34, bh, 0], 0.13 + 0.03 * r(3), 0.13, { flat: 1.15, lumps: 0.02 }), T([0.3, bh - 0.04, 0], [0.5, bh - 0.06, 0], 0.1, 0.09, { flat: 1.3, lumps: 0.02 }));
    for (const x of [0.36, 0, -0.36]) for (const s of [1, -1]) wheel(bones, tubes, x, s * hw, wr, 0.03);
    return { bones, tubes };
  } },
  { name: 'cycle', share: 5, speed: [4, 9], size: [1.4, 2], make(r) {   // two wheels in line, a rider leaning over them
    const wr = 0.2 + 0.04 * r(1), bones = [B([0, 0, 0])], tubes = [];
    wheel(bones, tubes, 0.32, 0.0001, wr, 0.025); wheel(bones, tubes, -0.32, 0.0001, wr, 0.025);
    tubes.push(T([-0.32, wr, 0], [0.32, wr + 0.1, 0], 0.03, 0.03, { lumps: 0 }), T([-0.08, wr + 0.08, 0], [0.06, wr + 0.5, 0], 0.1, 0.11, { flat: 0.7 }), T([0.07, wr + 0.5, 0], [0.12, wr + 0.68, 0], 0.07, 0.065));
    return { bones, tubes };
  } },
  { name: 'dragon', share: 6, speed: [8, 16], size: [3, 6], fly: [10, 45], make(r) {   // a flying thing: wings of two parts beating, a tail of links waving behind it
    const br = 0.07 + 0.03 * r(1), span = 0.42 + 0.1 * r(2), bones = [B([0, 0, 0])], tubes = [];
    tubes.push(T([-0.16, 0.5, 0], [0.2, 0.5, 0], br, br * 0.9, { flat: 0.9 }));
    bones.push(B([0.2, 0.5, 0], { type: 1, amp: 0.2, rate: 0.5 }));
    tubes.push(T([0.17, 0.5, 0], [0.42, 0.56, 0], br * 0.6, br * 0.45, { bone: 1, from: 0 }));
    for (const s of [1, -1]) limb(bones, tubes, [0.06, 0.52, s * br * 0.6], [0.0, 0.54, s * span * 0.55], [-0.08, 0.5, s * span], 0.11, { axis: [1, 0, 0], amp: -s * 0.6, rate: 0.5, bend: -s * 0.25, phase: 0, flat: 0.12, tip: 0.5 });
    for (let n = 0; n < 4; n++) { bones.push(B([-0.16 - n * 0.09, 0.5, 0], { type: 2, amp: 0.012 + n * 0.008, rate: 0.5, phase: -n * 0.8 })); tubes.push(T([-0.14 - n * 0.09, 0.5, 0], [-0.25 - n * 0.09, 0.5, 0], br * (0.7 - n * 0.14), br * (0.56 - n * 0.14), { bone: bones.length - 1, from: n ? bones.length - 2 : 0, blend: 0.5 })); }
    return { bones, tubes };
  } },
  { name: 'bird', share: 7, speed: [5, 14], size: [0.4, 1.2], fly: [4, 30], make(r) {
    const br = 0.09 + 0.03 * r(1), span = 0.4 + 0.1 * r(2), bones = [B([0, 0, 0])], tubes = [];
    tubes.push(T([-0.2, 0.5, 0], [0.22, 0.52, 0], br * 0.7, br, { flat: 0.9 }), T([-0.36, 0.5, 0], [-0.16, 0.5, 0], 0.07, 0.05, { flat: 0.15 }));
    for (const s of [1, -1]) { bones.push(B([0.04, 0.52, s * br * 0.5], { type: 1, axis: [1, 0, 0], amp: -s * 0.9, rate: 0.25 })); tubes.push(T([0.04, 0.52, s * br * 0.4], [-0.02, 0.52, s * span], 0.12, 0.05, { bone: bones.length - 1, from: 0, flat: 0.12 })); }
    return { bones, tubes };
  } },
  { name: 'snake', share: 7, speed: [0.5, 3], size: [1.5, 5], make(r) {   // a head and ten links, each a little behind the last in its wave
    const br = 0.035 + 0.02 * r(1), bones = [B([0, 0, 0])], tubes = [];
    for (let n = 0; n < 10; n++) { bones.push(B([0.4 - n * 0.09, br, 0], { type: 2, amp: 0.045, phase: -n * 0.75 })); tubes.push(T([0.47 - n * 0.09, br, 0], [0.36 - n * 0.09, br, 0], br * (n ? 1 : 1.3), br * (n === 9 ? 0.3 : 1), { bone: n + 1, from: n ? n : n + 1, blend: 0.6, lumps: 0.03 })); }
    return { bones, tubes };
  } },
];
/** The rig of creature c, and where the rigs' shares end (0 … 1: a number under SHARES[r] and not under SHARES[r - 1] is rig r). */
export const rigOf = (c) => Math.floor(c / VARIANTS);
export const SHARES = (() => { const total = RIGS.reduce((t, R) => t + R.share, 0); let at = 0; return RIGS.map((R) => (at += R.share / total)); })();

// a creature as it is made from: its bones and tubes brought into its own frame (its foot at 0, its middle over 0, its
// largest side 1), each tube's length, sides and how round it is cut; its hull (the ball its coarse levels are)
const MADE = new Map();
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// a rig's tubes with their frames (each its length, its way, two ways across it), their ends taken through `into`, their
// widths times k; cap: how much of a wheel's way from end to end is each of its flat sides
const framed = (tubes, into, k) => tubes.map((t, n) => {
  const a = into(t.a), b = into(t.b), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d) || 1e-6, ax = d.map((x) => x / len);
  let n1 = cross(ax, Math.abs(ax[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]); const l1 = Math.hypot(...n1); n1 = n1.map((x) => x / l1);
  const r0 = t.r0 * k, r1 = t.r1 * k, rm = Math.max(r0, r1);
  return { ...t, a, d, len, n1, n2: cross(ax, n1), r0, r1, id: n, lumps: t.lumps ?? 0.08, cap: t.wheel ? rm / (2 * rm + len) : 0 };
});
function madeOf(c) {
  let G = MADE.get(c); if (G) return G;
  const R = RIGS[rigOf(c)], { bones, tubes } = R.make((i) => hash3(c, i, 3, 4242)), seed = 77 + c * 31;
  if (bones.length > BONES) throw new Error(`creature: rig ${R.name} has more than ${BONES} bones`);
  // its size: measured on its tubes as they are laid out (smooth: their lumps are a hundredth of it)
  const raw = { seed, tubes: framed(tubes.map((t) => ({ ...t, lumps: 0 })), (q) => q, 1) }, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], p = [0, 0, 0];
  for (const t of raw.tubes) for (let j = 0; j <= 12; j++) for (let i = 0; i < 12; i++) { tubeAt(raw, t, i / 12, j / 12, p, 0); for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; } }
  const k = 1 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), ox = (lo[0] + hi[0]) / 2, oy = lo[1], oz = (lo[2] + hi[2]) / 2, into = (q) => [(q[0] - ox) * k, (q[1] - oy) * k, (q[2] - oz) * k];
  G = { c, rig: rigOf(c), seed, k, tubes: framed(tubes, into, k),
    bones: bones.map((b) => ({ ...b, pivot: into(b.pivot), amp: b.type === 2 ? b.amp * k : b.amp, rate: b.type === 3 ? b.rate / k : b.rate })) };   // (a shift scales with it; a wheel turns faster the smaller it is)
  G.hull = { y: ((hi[1] - lo[1]) * k) / 2, e: [(hi[0] - lo[0]) * k * 0.45, (hi[1] - lo[1]) * k * 0.45, (hi[2] - lo[2]) * k * 0.45] };
  MADE.set(c, G);
  return G;
}
// a point of a tube's surface: u round it (0 … 1), v from end to end over it (0 … 1). A limb: its width closing to
// nothing at both ends, a little lumpy; a wheel: a flat side, its tread, the other side. out: the point; returns its shade
function tubeAt(G, t, u, v, out, o) {
  v = Math.min(1, Math.max(0, v));
  let s = v, rho;
  if (t.wheel) { const a = t.cap; if (v < a) { s = 0; rho = v / a; } else if (v > 1 - a) { s = 1; rho = (1 - v) / a; } else { s = (v - a) / (1 - 2 * a); rho = 1; } }
  else rho = Math.sin(PI * v) ** 0.28;
  const lump = t.lumps ? 1 + t.lumps * 2 * (noise3(u * 3 + t.id * 7, v * 4 * Math.max(1, t.len * 6), t.id, G.seed) - 0.5) * (0.5 - 0.5 * Math.cos(TAU * u)) : 1;
  const r = (t.r0 + (t.r1 - t.r0) * s) * rho * lump, cu = Math.cos(TAU * u) * r, su = Math.sin(TAU * u) * r * t.flat;
  for (let i = 0; i < 3; i++) out[o + i] = t.a[i] + t.d[i] * s + t.n1[i] * cu + t.n2[i] * su;
  return 0.82 + 0.18 * rho;
}
// where a tube's rings lie (ring j of its cut c: v), and the other way (v: how many rings along). A limb's lie evenly; a
// wheel has one at each edge of its tread at every cut (nc rings over a side, nt over the tread), so it stays a wheel
const vAt = (t, c, j) => (!t.wheel ? j / c.R : j <= c.nc ? (t.cap * j) / c.nc : j <= c.nc + c.nt ? t.cap + ((1 - 2 * t.cap) * (j - c.nc)) / c.nt : 1 - (t.cap * (c.R - j)) / c.nc);
const jAt = (t, c, v) => (!t.wheel ? v * c.R : v <= t.cap ? (v / t.cap) * c.nc : v <= 1 - t.cap ? c.nc + ((v - t.cap) / (1 - 2 * t.cap)) * c.nt : c.R - ((1 - v) / t.cap) * c.nc);
// how a creature's tubes are cut at `q` edges a unit of length: each its sides (S) and rings (R), so its faces are about
// square; and the triangles and vertices that makes (a tube: a point at each end, R - 1 rings of S between)
function cutOf(G, q) {
  let tris = 0, verts = 0; const cut = G.tubes.map((t) => {
    const rm = (t.r0 + t.r1) / 2, S = Math.max(3, Math.round(TAU * rm * Math.sqrt((1 + t.flat * t.flat) / 2) * q)); let R = Math.max(2, Math.round(t.len * q)), nc = 0, nt = 0;
    if (t.wheel) { const R0 = Math.max(3, Math.round((t.len + 2 * rm) * q)); nc = Math.max(1, Math.round(R0 * t.cap)); nt = Math.max(1, R0 - 2 * nc); R = 2 * nc + nt; }
    tris += 2 * S * (R - 1); verts += S * (R - 1) + 2; return { S, R, nc, nt };
  });
  return { cut, tris, verts };
}
// the finest cut that fits a room (so many triangles, so many vertices)
function fitOf(G, room) {
  let a = 0.5, b = 6000, best = cutOf(G, a);
  for (let i = 0; i < 40; i++) { const q = (a + b) / 2, C = cutOf(G, q); if (C.tris <= room.tris && C.verts <= room.verts) { best = C; a = q; } else b = q; }
  return best;
}
// a creature's tubes as one mesh at a cut: its corners, their normals, shades and bones, the tube and place on it each
// corner is, and where each tube's corners begin
function tubesOf(G, C) {
  const V = C.verts, pos = new Float32Array(V * 3), shade = new Float32Array(V), index = new Uint32Array(C.tris * 3), of = new Uint16Array(V), pu = new Float32Array(V), pv = new Float32Array(V), ba = new Uint8Array(V), bb = new Uint8Array(V), bw = new Float32Array(V), first = [];
  let nv = 0, ni = 0;
  G.tubes.forEach((t, n) => {
    const c = C.cut[n], { S, R } = c, v0 = nv; first.push(v0);
    const put = (u, v) => { shade[nv] = tubeAt(G, t, u, v, pos, nv * 3); of[nv] = n; pu[nv] = u; pv[nv] = v;
      const held = t.from != null && t.blend > 0 && v < t.blend; ba[nv] = held ? t.from : t.bone; bb[nv] = t.bone; bw[nv] = held ? (v / t.blend) ** 2 * (3 - (2 * v) / t.blend) : 0; return nv++; };
    put(0, 0); for (let j = 1; j < R; j++) for (let i = 0; i < S; i++) put(i / S, vAt(t, c, j)); put(0, 1);
    const id = (j, i) => (j === 0 ? v0 : j === R ? v0 + 1 + (R - 1) * S : v0 + 1 + (j - 1) * S + (i % S)), at = ni;
    for (let j = 0; j < R; j++) for (let i = 0; i < S; i++) {
      const a = id(j, i), b = id(j, i + 1), e = id(j + 1, i + 1), d = id(j + 1, i);
      if (j > 0) { index[ni++] = a; index[ni++] = b; index[ni++] = e; }   // (at its first end a and b are the one point: no face)
      if (j < R - 1) { index[ni++] = a; index[ni++] = e; index[ni++] = d; }   // (at its last, c and d)
    }
    // wound to face outwards: told once on a face of its middle, the same for the whole tube
    const m = at + 3 * Math.floor((ni - at) / 6), a = index[m] * 3, b = index[m + 1] * 3, e = index[m + 2] * 3, vv = pv[index[m]];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[e] - pos[a], vy = pos[e + 1] - pos[a + 1], vz = pos[e + 2] - pos[a + 2];
    const out = (uy * vz - uz * vy) * (pos[a] - t.a[0] - t.d[0] * vv) + (uz * vx - ux * vz) * (pos[a + 1] - t.a[1] - t.d[1] * vv) + (ux * vy - uy * vx) * (pos[a + 2] - t.a[2] - t.d[2] * vv);
    if (out < 0) for (let k = at; k < ni; k += 3) { const x = index[k + 1]; index[k + 1] = index[k + 2]; index[k + 2] = x; }
  });
  return { V, pos, nor: normalsOf(pos, index, V), shade, index, of, pu, pv, ba, bb, bw, first, cut: C.cut, tubes: G.tubes };
}
// the point of a coarser cut's mesh at a place on a tube (u round, v along): out = [x, y, z, nx, ny, nz]
function onTubes(M, n, u, v, out) {
  const { S, R } = M.cut[n], v0 = M.first[n], id = (j, i) => (j === 0 ? v0 : j === R ? v0 + 1 + (R - 1) * S : v0 + 1 + (j - 1) * S + (i % S));
  const fj = jAt(M.tubes[n], M.cut[n], v), j0 = Math.min(R - 1, Math.max(0, Math.floor(fj))), t = fj - j0, fi = u * S, i0 = Math.floor(fi) % S, s = fi - Math.floor(fi), a = id(j0, i0), b = id(j0, i0 + 1), c = id(j0 + 1, i0 + 1), d = id(j0 + 1, i0);
  let wa, wb, wc, wd;   // (a fan at either end: the point and the ring beside it; between, the square cut a to c)
  if (j0 === 0) { wa = 1 - t; wb = 0; wc = t * s; wd = t * (1 - s); }
  else if (j0 === R - 1) { wa = (1 - t) * (1 - s); wb = (1 - t) * s; wc = t; wd = 0; }
  else if (s >= t) { wa = 1 - s; wb = s - t; wc = t; wd = 0; } else { wa = 1 - t; wb = 0; wc = s; wd = t - s; }
  for (let i = 0; i < 3; i++) { out[i] = M.pos[a * 3 + i] * wa + M.pos[b * 3 + i] * wb + M.pos[c * 3 + i] * wc + M.pos[d * 3 + i] * wd; out[3 + i] = M.nor[a * 3 + i] * wa + M.nor[b * 3 + i] * wb + M.nor[c * 3 + i] * wc + M.nor[d * 3 + i] * wd; }
  return out;
}
// its hull at n squares an edge: a ball its size (what ball() asks)
const hullAt = (G) => (n) => { const H = G.hull, sw = SWELL[n] ?? 1; return (x, y, z, out, o) => { out[o] = x * H.e[0] * sw; out[o + 1] = H.y + y * H.e[1] * sw; out[o + 2] = z * H.e[2] * sw; return 0.9; }; };
/** how many triangles creature c's full mesh has: 50 000 … 200 000, as any kind's */
export const fullTris = (c) => 50000 + Math.floor(hash3(c, 1, 5, 4242) * 150000);

/** Creature c's mesh at level l of the ladder. */
export function creatureMesh(c, l) {
  const G = madeOf(c), n = LADDER[l].n, D = LADDER[l].delta;
  if (n === DOTN) return dotMesh();
  if (n > 0 && n <= 2) return ballMesh(hullAt(G), n, underOf(l), D);   // its coarse levels: its hull
  const room = n === FULLN ? { tris: Math.min(fullTris(c), roomOf(l).tris), verts: roomOf(l).verts } : roomOf(l), F = tubesOf(G, fitOf(G, room)), under = underOf(l), verts = new Uint32Array(F.V * 4), P = F.pos, N = F.nor, X = [0, 0, 0, 0, 0, 0, 0];
  // what it turns into: the next coarser cut of its tubes, or (from its coarsest tubes) its hull: each corner's place
  // there the hull's point the way it lies from the hull's middle
  const C = under > 2 ? tubesOf(G, fitOf(G, roomOf(l + 1))) : null, HB = under > 0 && under <= 2 ? ball(under, hullAt(G)(under), true) : null;
  for (let v = 0; v < F.V; v++) {
    const o = v * 3;
    if (C) onTubes(C, F.of[v], F.pu[v], F.pv[v], X);
    else if (HB) { const f = faceOf(P[o] / G.hull.e[0], (P[o + 1] - G.hull.y) / G.hull.e[1], P[o + 2] / G.hull.e[2]); onBall(HB, f[0], f[1], f[2], X); }
    else { X[0] = P[o]; X[1] = P[o + 1]; X[2] = P[o + 2]; X[3] = N[o]; X[4] = N[o + 1]; X[5] = N[o + 2]; }
    packSolid(verts, v * 4, P[o], P[o + 1], P[o + 2], N[o], N[o + 1], N[o + 2], F.shade[v], X[0], X[1], X[2], X[3], X[4], X[5], C || HB ? D : 0, F.ba[v], F.bb[v], F.bw[v]);
  }
  return { index: F.index, verts };
}
/** What of creature c is solid: a capsule a tube, each moving with its tube's bone; and its box at rest. */
export const creatureColliders = (c) => madeOf(c).tubes.map((t) => { const r = Math.max(t.r0, t.r1) * Math.min(1.4, Math.max(1, t.flat)) * 0.85, e = t.wheel ? 0 : Math.min(0.4, r / t.len); return { shape: 'capsule', a: t.a.map((x, i) => x + t.d[i] * e), b: t.a.map((x, i) => x + t.d[i] * (1 - e)), r, bone: t.bone }; });
export const creatureBounds = (c) => { const H = madeOf(c).hull; return { min: [-H.e[0] / 0.9, 0, -H.e[2] / 0.9], max: [H.e[0] / 0.9, H.y * 2, H.e[2] / 0.9] }; };
/** Creature c's bones, as the GPU reads them (three rows of four a bone; what it has no bone for stays still). */
export function creatureBones(c) {
  const G = madeOf(c), out = new Float32Array(BONES * 12);
  for (let i = 0; i < BONES; i++) { const b = G.bones[i]; if (b) out.set([...b.pivot, b.parent, ...b.axis, b.type, b.amp, b.rate, b.phase, b.base], i * 12); else out.set([0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0], i * 12); }
  return out;
}
