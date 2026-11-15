// What is solid in the world, whatever it is and whoever placed it: a rock, a tree, a tent, a house, a car, an animal,
// in every world (the walk, the stress world). One description for all of them, made from the thing's own geometry
// beside its recipe (a family of the zoo: assets/zoo/index.js boundsOf, collidersOf; a placed asset: assets/index.js
// bodyOfAsset), in its own frame (its foot at 0; s: metres a unit of it):
//
//   its box      { min: [x, y, z], max: [x, y, z] }
//   its shapes   [{ shape: 'sphere', at, r } | { shape: 'capsule', a, b, r } | { shape: 'box', at, half, turn? }
//                 | { shape: 'mesh', verts: Float32Array, index } | { shape: 'wall', at?: [x, z], r, gaps, top? }, …]
//                each may say  bone: n  (it moves with that bone of the skeleton: a leg's capsule swings with the leg)
//                and  pass: true  (it is not solid: leaves. A walker brushes through its outer half and goes round
//                its middle, where it stands higher than his knee; it is still found by a ray), from: m  (with pass:
//                only where the thing stands m metres tall or more; smaller, it is walked through). A box may be turned
//                about its middle (turn, radians). A wall is a round wall (a tent's, a round house's) with doors: gaps
//                [[the door's middle, as an angle of the thing's own frame, half its width]]; a walker stays on the side
//                of it he came from, and goes through only at a door
//   and, where it has them: ceiling(u, v), how high the room overhead is at a place of its own frame (a walker stoops
//   under a low roof), and leave: 'door' (one who rises inside it goes out by its door first; else through its roof)
//   A recipe that says nothing still has both: its coarse mesh is its collider, that mesh's box its box.
//
// A BODY is such a thing standing somewhere: { id, x, y, z, yaw, s (metres a unit of its frame: a zoo kind's largest
// side, a plant's scale, 1 for a placed asset), up (metres its foot is over the ground: what flies; under it: what is
// set into it), kind, body: { box, shapes, ceiling?, leave? }, pose?(bone, p, out) }. yaw turns its frame as the
// GPU turns what it draws: a point (u, v) of it lies at (x + (u cos - v sin) s, z + (u sin + v cos) s).
//
// Who places things says where they stand, by cells round a point, never by a list of everything (every placer of
// every world does: addBodies; the stress stand, src/scatter/stress.js; the rocks, src/world/rocksolid.js; the plants,
// src/scatter/trees.js; what is placed one by one, addBody: src/world/place.js); who needs to know asks here:
//
//   bodiesNear(x, z, reach)   the bodies round a point
//   pushOut(x, z, r)          where a walker r metres round may stand: pushed out of every solid shape near, each by
//                             its own outline at the walker's height (a ball's round, a limb's length, a box's sides,
//                             a wall's side). He goes round what stands; nothing is drawn back to let him through
//   within(x, z)              the thing whose walls (x, z) is inside, and the way in: its door
//   ceilingAt(x, z)           how high the room is overhead (Infinity under the open sky)
//   clear(x0, z0, x1, z1)     how much of a line of sight is clear before a wall stops it (doors let it through)
//   roundsNear(x, z, reach)   the solid shapes as plain rounds on the ground { x, z, r } (for what only needs to know roughly)
//   hit(from, dir, far)       the first body a ray meets: { t (metres), body, shape, at: [x, y, z] }
//   outline(scene, bodies)    their boxes and shapes drawn as lines (to see that they sit where the things are);
//                             showBodies(scene): every frame, those round a point (`?bounds`, in every world)
//
// `?ghost` in the address: nothing stops the walker, in every world (what is solid is still found by a ray).
import * as THREE from 'three/webgpu';
import { things } from './things.js';

export const GHOST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('ghost');
const providers = [];
/** near(x, z, reach) -> bodies: who places things tells where they stand. stops: they stop the walker; rooms: they may
    have walls, doors and a ceiling (what a line of sight, the way in and the room overhead ask: only such placers are). */
export function addBodies(near, { stops = true, rooms = false } = {}) { providers.push({ near, stops, rooms }); }
/** The bodies within `reach` metres of (x, z); stopping: only those that stop a walker (none with `?ghost`); rooms: only
    of placers that may have walls. */
export function bodiesNear(x, z, reach, stopping = false, rooms = false) {
  const out = [];
  if (stopping && GHOST) return out;
  for (const P of providers) if ((!stopping || P.stops) && (!rooms || P.rooms)) for (const b of P.near(x, z, reach)) {
    // (a thing's own state, src/world/things.js: what is gone is not there, what grew is as large as it has grown)
    const S = b.thing && things.size ? things.get(b.thing) : null;
    if (!S) out.push(b); else if (!S.gone) out.push(S.grow === 1 ? b : { ...b, s: b.s * S.grow, up: b.up * S.grow });
  }
  return out;
}
/** How far a body reaches from where it stands, level, in metres (its box's farthest corner). */
export const reachOf = (b) => { const { min: m, max: M } = b.body.box; return b.s * Math.max(Math.hypot(m[0], m[2]), Math.hypot(M[0], m[2]), Math.hypot(m[0], M[2]), Math.hypot(M[0], M[2])); };

/** Bodies kept by the cells they stand in (`cell` metres a side): what is placed one by one, or what a read-back gave.
    It answers by the cells round a point, whatever it holds. put(b), clear(), near(x, z, reach). */
export function bodyGrid(cell = 8) {
  const cells = new Map(); let most = 0;
  const K = (i, j) => (i + 32768) * 65536 + (j + 32768);   // (a cell's key: 8 m cells reach 260 km either way)
  const G = {
    size: 0,
    put(b) { b.reach ??= reachOf(b); const k = K(Math.floor(b.x / cell), Math.floor(b.z / cell)); let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(b); most = Math.max(most, b.reach); G.size++; return b; },
    clear() { cells.clear(); most = 0; G.size = 0; },
    near(x, z, reach) {
      const out = [], R = reach + most, i0 = Math.floor((x - R) / cell), i1 = Math.floor((x + R) / cell), j0 = Math.floor((z - R) / cell), j1 = Math.floor((z + R) / cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = cells.get(K(i, j)); if (c) for (const b of c) if (Math.hypot(b.x - x, b.z - z) <= reach + b.reach) out.push(b); }
      return out;
    },
  };
  return G;
}
/** Where bodies are asked for (the walker's last step: src/world/solids.js): a placer that makes its bodies ahead of the
    asking (from a read-back: src/scatter/trees.js) makes them round here. at: when it was last asked (performance.now). */
export const wanted = { x: 0, z: 0, at: -Infinity };
export const want = (x, z) => { wanted.x = x; wanted.z = z; wanted.at = performance.now(); };
// what is placed one by one (a tent, a fire pit, a house: src/world/place.js), in every world: one grid
const placed = bodyGrid(8);
addBodies(placed.near, { rooms: true });
/** A body placed for good (it is in the world from now on). */
export const addBody = (b) => placed.put(b);

/** A point of a body's own frame in the world. */
export function toWorld(b, p, out = [0, 0, 0]) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  out[0] = b.x + (p[0] * c - p[2] * s) * b.s; out[1] = b.y + p[1] * b.s; out[2] = b.z + (p[0] * s + p[2] * c) * b.s;
  return out;
}
/** A place on the ground (x, z) in a body's own frame: [u, v]. */
const toOwn = (b, x, z, out = [0, 0]) => { const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z; out[0] = (dx * c + dz * s) / b.s; out[1] = (-dx * s + dz * c) / b.s; return out; };
const posed = (b, S, p, out) => (S.bone != null && b.pose ? b.pose(S.bone, p, out) : ((out[0] = p[0]), (out[1] = p[1]), (out[2] = p[2]), out));
// a mesh's round, seen from above: its middle and how far its corners reach (a little inside: its corners are its furthest)
const roundOf = (S) => (S.round ||= (() => { let x = 0, z = 0, y = 0, r = 0; const n = S.verts.length / 3; for (let i = 0; i < n; i++) { x += S.verts[i * 3] / n; y += S.verts[i * 3 + 1] / n; z += S.verts[i * 3 + 2] / n; } for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(S.verts[i * 3] - x, S.verts[i * 3 + 2] - z)); return { at: [x, y, z], r: r * 0.9, top: Math.max(...Array.from({ length: n }, (_, i) => S.verts[i * 3 + 1])) }; })());   // (top: how high it stands)
// a wall's door: whether the way at angle t (its own frame) passes through one of its gaps, keeping `pad` (own units) off its posts
const inDoor = (S, t, pad = 0) => (S.gaps || []).some(([m, h]) => Math.abs(Math.atan2(Math.sin(t - m), Math.cos(t - m))) < h - pad / S.r);
const wallAt = (S) => S.at || [0, 0];
/** How high a shape stands over its body's foot, in its own frame (a wall without a top: as high as can be). */
export const topOf = (S) => (S.shape === 'sphere' ? S.at[1] + S.r : S.shape === 'capsule' ? Math.max(S.a[1], S.b[1]) + S.r : S.shape === 'box' ? S.at[1] + S.half[1] : S.shape === 'mesh' ? roundOf(S).top : S.top ?? Infinity);

const A = [0, 0, 0], B = [0, 0, 0], W = [0, 0, 0], O = [0, 0], F = [0, 0];
/** What stops a walker round (x, z): each solid shape between knee and head as a round on the ground (walls are not rounds). */
export function roundsNear(x, z, reach, low = 0.3, tall = 1.8) {
  const out = [], put = (b, p, r) => { toWorld(b, p, W); const h = b.up + p[1] * b.s, R = r * b.s; if (h + R > low && h - R < tall && Math.hypot(W[0] - x, W[2] - z) < reach + R) out.push({ x: W[0], z: W[2], r: R }); };
  for (const b of bodiesNear(x, z, reach + 3, true)) for (const S of b.body.shapes) {
    if (S.pass) continue;
    if (S.shape === 'sphere') put(b, S.at, S.r);
    else if (S.shape === 'capsule') { posed(b, S, S.a, A); posed(b, S, S.b, B); for (const t of [0, 0.5, 1]) put(b, [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t], S.r); }
    else if (S.shape === 'box') put(b, S.at, Math.hypot(S.half[0], S.half[2]));
    else if (S.shape === 'mesh') { const R = roundOf(S); put(b, R.at, R.r); }
  }
  return out;
}

/** A walker's round (r metres, at x, z, from `low` to `tall` over the ground) pushed out of every solid shape near
    it: [x, z] where it may stand. Each shape by its own outline in that band of heights: a ball by its round there, a
    capsule along its length, a box by its sides (it slides along a wall), a mesh by its round, a round wall by the side
    of it he was on (from: [x, z], where he stood before this step; none: where he stands), except at its doors. Twice
    over, so what one shape pushes into another is pushed out again. list: the bodies to keep him out of (none: those
    round him). */
export function pushOut(x, z, r = 0.3, low = 0.3, tall = 1.8, knee = 0.55, from = null, list = null) {   // (low: what ends under the shin is stepped over; knee: what is passed through (leaves) stops him only where it stands higher than this, and only its inner half)
  const fx0 = from ? from[0] : x, fz0 = from ? from[1] : z, near = list ?? bodiesNear(x, z, r + 3, true);
  for (let pass = 0; pass < 2; pass++) for (const b of near) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z, R = r / b.s, lo0 = (low - b.up) / b.s, lo1 = (knee - b.up) / b.s, hi = (tall - b.up) / b.s;   // the walker in the body's own frame
    let px = (dx * c + dz * s) / b.s, pz = (-dx * s + dz * c) / b.s, moved = false;
    if (Math.hypot(px, pz) * b.s > (b.reach ??= reachOf(b)) * 1.5 + r) continue;   // (out of its reach altogether: well past its box, as a mesh's round or a limb on its skeleton may reach a little out of it)
    const round = (cx, cz, rr) => { const ux = px - cx, uz = pz - cz, d = Math.hypot(ux, uz), m = rr + R; if (d < m) { const k = m / Math.max(d, 1e-6); px = cx + (d < 1e-6 ? m : ux * k); pz = cz + uz * k; moved = true; } };
    for (const S of b.body.shapes) {
      if (S.pass && S.from && b.up + topOf(S) * b.s < S.from) continue;   // (leaves of a plant smaller than its kind's line: walked through)
      const lo = S.pass ? lo1 : lo0, k = S.pass ? 0.5 : 1;
      if (S.shape === 'sphere') { const off = Math.max(lo - S.at[1], S.at[1] - hi, 0); if (off < S.r) round(S.at[0], S.at[2], Math.sqrt(S.r * S.r - off * off) * k); }   // (its round at the band's height nearest its middle)
      else if (S.shape === 'capsule') {
        posed(b, S, S.a, A); posed(b, S, S.b, B); if (Math.min(A[1], B[1]) - S.r > hi || Math.max(A[1], B[1]) + S.r < lo) continue;
        const ex = B[0] - A[0], ez = B[2] - A[2], ee = ex * ex + ez * ez, t = ee > 1e-9 ? Math.min(1, Math.max(0, ((px - A[0]) * ex + (pz - A[2]) * ez) / ee)) : 0; round(A[0] + ex * t, A[2] + ez * t, S.r * k);
      } else if (S.shape === 'box') {
        if (S.at[1] - S.half[1] > hi || S.at[1] + S.half[1] < lo) continue;
        const ca = Math.cos(S.turn || 0), sa = Math.sin(S.turn || 0), du = px - S.at[0], dv = pz - S.at[2], hx = S.half[0] * k + R, hz = S.half[2] * k + R;   // (in the box's own frame where it is turned)
        let ux = du * ca + dv * sa, uz = -du * sa + dv * ca;
        if (Math.abs(ux) < hx && Math.abs(uz) < hz) { if (hx - Math.abs(ux) < hz - Math.abs(uz)) ux = Math.sign(ux || 1) * hx; else uz = Math.sign(uz || 1) * hz; px = S.at[0] + ux * ca - uz * sa; pz = S.at[2] + ux * sa + uz * ca; moved = true; }
      } else if (S.shape === 'mesh') { const Q = roundOf(S); if (Q.top > lo) round(Q.at[0], Q.at[2], Q.r * k); }   // (a mesh that ends under the shin is stepped over)
      else if (S.shape === 'wall') {
        if (S.top != null && S.top < lo) continue;
        const [cx, cz] = wallAt(S), ux = px - cx, uz = pz - cz, d = Math.hypot(ux, uz);
        if (inDoor(S, Math.atan2(uz, ux), R)) continue;
        toOwn(b, fx0, fz0, F); const inside = Math.hypot(F[0] - cx, F[1] - cz) < S.r;   // (the side he was on)
        if (inside && d > S.r - R) { const q = (S.r - R) / Math.max(d, 1e-6); px = cx + ux * q; pz = cz + uz * q; moved = true; }
        else if (!inside && d < S.r + R) { const q = (S.r + R) / Math.max(d, 1e-6); px = cx + (d < 1e-6 ? S.r + R : ux * q); pz = cz + uz * q; moved = true; }
      }
    }
    if (moved) { x = b.x + (px * c - pz * s) * b.s; z = b.z + (px * s + pz * c) * b.s; }
  }
  return [x, z];
}

/** The thing whose walls (x, z) is inside, with the way in: { door: { x, z, yaw }, leave } (null outside all).
    door: a spot 2.5 m outside its first door, facing in; leave: 'roof' (rise through it) or 'door' (out by the door first). */
export function within(x, z) {
  for (const b of bodiesNear(x, z, 0, true, true)) for (const S of b.body.shapes) {
    if (S.shape !== 'wall' || !(S.gaps || []).length) continue;
    const [cx, cz] = wallAt(S); toOwn(b, x, z, O);
    if (Math.hypot(O[0] - cx, O[1] - cz) >= S.r) continue;
    const m = S.gaps[0][0], out = (S.r + 2.5 / b.s), d = toWorld(b, [cx + Math.cos(m) * out, 0, cz + Math.sin(m) * out]), mid = toWorld(b, [cx, 0, cz], [0, 0, 0]);
    return { door: { x: d[0], z: d[2], yaw: Math.atan2(d[0] - mid[0], d[2] - mid[2]) }, leave: b.body.leave || 'roof' };   // facing the middle: forward is (-sin yaw, -cos yaw)
  }
  return null;
}

/** How high the room is overhead at (x, z), metres over the ground: Infinity under the open sky. */
export function ceilingAt(x, z) {
  let c = Infinity;
  for (const b of bodiesNear(x, z, 0, true, true)) if (b.body.ceiling) { toOwn(b, x, z, O); c = Math.min(c, b.body.ceiling(O[0], O[1]) * b.s); }
  return c;
}

/** A line of sight from (x0, z0) to (x1, z1): the share of it (0 to 1) clear before a wall stops it (a little before:
    no nearer to it than a walker may come); doors let it through. Only walls do: a camera pulled in by every stone or
    trunk it passes would jump in and out. */
export function clear(x0, z0, x1, z1, pad = 0.3) {
  const L = Math.hypot(x1 - x0, z1 - z0), walls = bodiesNear((x0 + x1) / 2, (z0 + z1) / 2, L / 2 + pad, true, true).filter((b) => b.body.shapes.some((S) => S.shape === 'wall'));
  if (!walls.length) return 1;
  const n = Math.max(2, Math.ceil(L / 0.25));
  let px = x0, pz = z0;
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
    for (const b of walls) for (const S of b.body.shapes) {
      if (S.shape !== 'wall') continue;
      const [cx, cz] = wallAt(S), R = pad / b.s; toOwn(b, px, pz, F); toOwn(b, x, z, O);
      const inside = Math.hypot(F[0] - cx, F[1] - cz) < S.r, d = Math.hypot(O[0] - cx, O[1] - cz);
      if ((inside ? d > S.r - R : d < S.r + R) && !inDoor(S, Math.atan2(O[1] - cz, O[0] - cx), R)) return Math.max(0, (i - 1) / n);
    }
    px = x; pz = z;
  }
  return 1;
}

// a ray in a body's own frame against one of its shapes: how far along it (own lengths) it meets it, or Infinity
function meet(S, o, d, b) {
  if (S.shape === 'sphere') { const x = o[0] - S.at[0], y = o[1] - S.at[1], z = o[2] - S.at[2], h = x * d[0] + y * d[1] + z * d[2], q = h * h - (x * x + y * y + z * z - S.r * S.r); return q < 0 ? Infinity : -h - Math.sqrt(q) >= 0 ? -h - Math.sqrt(q) : Infinity; }
  if (S.shape === 'capsule') {   // where the ray passes nearest the capsule's middle line: inside its width there, it is met
    posed(b, S, S.a, A); posed(b, S, S.b, B);
    const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2], wx = o[0] - A[0], wy = o[1] - A[1], wz = o[2] - A[2], ee = ex * ex + ey * ey + ez * ez || 1e-9, de = d[0] * ex + d[1] * ey + d[2] * ez, dw = d[0] * wx + d[1] * wy + d[2] * wz, ew = ex * wx + ey * wy + ez * wz, den = ee - de * de;
    let s = den > 1e-9 ? Math.min(1, Math.max(0, (ew - de * dw) / den)) : 0, t = Math.max(0, de * s - dw); s = Math.min(1, Math.max(0, (ew + t * de) / ee)); t = Math.max(0, de * s - dw);
    const gap = Math.hypot(o[0] + d[0] * t - A[0] - ex * s, o[1] + d[1] * t - A[1] - ey * s, o[2] + d[2] * t - A[2] - ez * s);
    return gap > S.r ? Infinity : Math.max(0, t - Math.sqrt(S.r * S.r - gap * gap));
  }
  if (S.shape === 'box') {   // (into the box's own frame where it is turned)
    const ca = Math.cos(S.turn || 0), sa = Math.sin(S.turn || 0), ox = o[0] - S.at[0], oz = o[2] - S.at[2], q = [ox * ca + oz * sa, o[1] - S.at[1], -ox * sa + oz * ca], e = [d[0] * ca + d[2] * sa, d[1], -d[0] * sa + d[2] * ca];
    return slab(q, e, [-S.half[0], -S.half[1], -S.half[2]], S.half);
  }
  if (S.shape === 'wall') {   // where the ray crosses the wall's round, seen from above, under its top and not at a door
    const [cx, cz] = wallAt(S), ox = o[0] - cx, oz = o[2] - cz, aa = d[0] * d[0] + d[2] * d[2]; if (aa < 1e-12) return Infinity;
    const h = ox * d[0] + oz * d[2], q = h * h - aa * (ox * ox + oz * oz - S.r * S.r); if (q < 0) return Infinity;
    for (const t of [(-h - Math.sqrt(q)) / aa, (-h + Math.sqrt(q)) / aa]) { if (t < 0) continue; const y = o[1] + d[1] * t; if (y < 0 || (S.top != null && y > S.top) || inDoor(S, Math.atan2(oz + d[2] * t, ox + d[0] * t))) continue; return t; }
    return Infinity;
  }
  let best = Infinity; const V = S.verts, I = S.index;   // a mesh: its triangles, one by one (a coarse mesh: dozens)
  for (let n = 0; n < I.length; n += 3) {
    const a = I[n] * 3, bb = I[n + 1] * 3, c = I[n + 2] * 3, e1x = V[bb] - V[a], e1y = V[bb + 1] - V[a + 1], e1z = V[bb + 2] - V[a + 2], e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
    const tx = o[0] - V[a], ty = o[1] - V[a + 1], tz = o[2] - V[a + 2], u = (tx * px + ty * py + tz * pz) / det; if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) / det; if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) / det; if (t >= 0 && t < best) best = t;
  }
  return best;
}
function slab(o, d, lo, hi) {
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) { if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo[a] || o[a] > hi[a]) return Infinity; continue; } let x = (lo[a] - o[a]) / d[a], y = (hi[a] - o[a]) / d[a]; if (x > y) [x, y] = [y, x]; t0 = Math.max(t0, x); t1 = Math.min(t1, y); if (t0 > t1) return Infinity; }
  return t0;
}
/** The first body a ray meets (from: [x, y, z]; dir: a unit way), within `far` metres: { t, body, shape, at } or null.
    Its box first (most are missed there), then its shapes. */
export function hit(from, dir, far = 100) {
  let best = null; const seen = new Set(), o = [0, 0, 0], d = [0, 0, 0];
  for (let t = 0; t <= far; t += 6) for (const b of bodiesNear(from[0] + dir[0] * t, from[2] + dir[2] * t, 7)) {
    if (seen.has(b.id)) continue; seen.add(b.id);
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = from[0] - b.x, dz = from[2] - b.z;   // the ray in the body's own frame
    o[0] = (dx * c + dz * s) / b.s; o[1] = (from[1] - b.y) / b.s; o[2] = (-dx * s + dz * c) / b.s; d[0] = dir[0] * c + dir[2] * s; d[1] = dir[1]; d[2] = -dir[0] * s + dir[2] * c;
    const pad = b.pose ? 0.15 : 0.01, B0 = b.body.box;   // (what moves on a skeleton reaches a little out of its box at rest)
    if (slab(o, d, B0.min.map((v) => v - pad), B0.max.map((v) => v + pad)) * b.s > (best ? best.t : far)) continue;
    for (const S of b.body.shapes) { const t1 = meet(S, o, d, b) * b.s; if (t1 < (best ? best.t : far)) best = { t: t1, body: b, shape: S, at: [from[0] + dir[0] * t1, from[1] + dir[1] * t1, from[2] + dir[2] * t1] }; }
  }
  return best;
}

// ---- to see them: every body's box and shapes as lines ----
let lines = null;
/** Draw these bodies' boxes (yellow) and shapes (blue; what is passed through: green) as lines; none: take them away. */
export function outline(scene, bodies) {
  if (!lines) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240000 * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(240000 * 3), 3)); lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })); lines.frustumCulled = false; lines.renderOrder = 5; scene.add(lines); }
  const P = lines.geometry.attributes.position, C = lines.geometry.attributes.color; let n = 0;
  const seg = (b, p, q, col) => { if (n > 239990) return; toWorld(b, p, W); P.array.set(W, n * 3); C.array.set(col, n * 3); n++; toWorld(b, q, W); P.array.set(W, n * 3); C.array.set(col, n * 3); n++; };
  for (const b of bodies || []) {
    const { min: m, max: M } = b.body.box, K = (i) => [i & 1 ? M[0] : m[0], i & 2 ? M[1] : m[1], i & 4 ? M[2] : m[2]];
    for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(b, K(i), K(j), [1, 0.85, 0.1]);
    for (const S of b.body.shapes) {
      const col = S.pass ? [0.2, 1, 0.3] : [0.2, 0.6, 1];
      if (S.shape === 'mesh') for (let t = 0; t < S.index.length; t += 3) for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) { const a = S.index[t + i] * 3, c = S.index[t + j] * 3; if (a < c) seg(b, S.verts.subarray(a, a + 3), S.verts.subarray(c, c + 3), col); }
      else if (S.shape === 'capsule') { const a = posed(b, S, S.a, [0, 0, 0]), c = posed(b, S, S.b, [0, 0, 0]); seg(b, a, c, col); for (const e of [a, c]) for (let k = 0; k < 3; k++) { const u = [0, 0, 0], v = [0, 0, 0]; u[k] = -S.r; v[k] = S.r; seg(b, e.map((x, i) => x + u[i]), e.map((x, i) => x + v[i]), col); } }
      else if (S.shape === 'wall') { const [cx, cz] = wallAt(S), top = S.top ?? 2, N = 48; for (let k = 0; k < N; k++) { const t0 = (k / N) * Math.PI * 2, t1 = ((k + 1) / N) * Math.PI * 2; if (inDoor(S, (t0 + t1) / 2)) continue; for (const y of [0.05, top]) seg(b, [cx + Math.cos(t0) * S.r, y, cz + Math.sin(t0) * S.r], [cx + Math.cos(t1) * S.r, y, cz + Math.sin(t1) * S.r], col); } }
      else if (S.shape === 'box' && S.turn) { const ca = Math.cos(S.turn), sa = Math.sin(S.turn), h = S.half, Q = (i) => { const u = i & 1 ? h[0] : -h[0], w = i & 4 ? h[2] : -h[2]; return [S.at[0] + u * ca - w * sa, S.at[1] + (i & 2 ? h[1] : -h[1]), S.at[2] + u * sa + w * ca]; }; for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(b, Q(i), Q(j), col); }
      else { const at = S.at, h = S.shape === 'box' ? S.half : [S.r, S.r, S.r]; for (let k = 0; k < 3; k++) { const u = [0, 0, 0]; u[k] = h[k]; seg(b, at.map((x, i) => x - u[i]), at.map((x, i) => x + u[i]), col); } }
    }
  }
  lines.geometry.setDrawRange(0, n); P.needsUpdate = C.needsUpdate = true; lines.visible = n > 0;
}
/** For `?bounds`: a function to call every frame with where the camera is; the bodies within `reach` metres of the
    walker (where bodies were last asked for; else of the camera) drawn as lines, a few times a second, whatever world it is. */
export function showBodies(scene, reach = 14) {
  let at = 0;
  return (x, z) => { const now = performance.now(); if (now - at < 120) return; at = now; const w = now - wanted.at < 1000; outline(scene, bodiesNear(w ? wanted.x : x, w ? wanted.z : z, reach)); };
}
if (typeof window !== 'undefined') window.__bodies = { near: bodiesNear, rounds: roundsNear, hit, pushOut, within, ceilingAt, clear, providers: () => providers.length, placed: () => placed.size };
