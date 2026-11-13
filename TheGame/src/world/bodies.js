// What is solid in the world, whatever it is: a rock, a tree, a house, a car, an animal. One description for all of
// them, said by the thing's own recipe beside its meshes (a family of the zoo: assets/zoo/index.js: boundsOf,
// collidersOf), in its own frame (its foot at 0, its largest side 1):
//
//   its box      { min: [x, y, z], max: [x, y, z] }
//   its shapes   [{ shape: 'sphere', at, r } | { shape: 'capsule', a, b, r } | { shape: 'box', at, half }
//                 | { shape: 'mesh', verts: Float32Array, index }, …]
//                each may say  bone: n  (it moves with that bone of the skeleton: a leg's capsule swings with the leg)
//                and  pass: true  (it is not solid: leaves; it is still found by a ray)
//   A recipe that says nothing still has both: its coarse mesh is its collider, that mesh's box its box.
//
// A BODY is such a thing standing somewhere: { id, x, y, z, yaw, s (metres its largest side), up (metres its foot is
// over the ground: what flies), kind, body: { box, shapes }, pose?(bone, p, out) }. Who places things says where they
// stand (addBodies: the stress stand does, src/scatter/stress.js); who needs to know asks here:
//
//   bodiesNear(x, z, reach)   the bodies round a point
//   pushOut(x, z, r)          where a walker r metres round may stand: pushed out of every solid shape near, each by
//                             its own outline at the walker's height (a ball's round, a limb's length, a box's sides)
//   roundsNear(x, z, reach)   the solid shapes as plain rounds on the ground { x, z, r } (for what only needs to know roughly)
//   hit(from, dir, far)       the first body a ray meets: { t (metres), body, shape, at: [x, y, z] }
//   outline(scene, bodies)    their boxes and shapes drawn as lines (to see that they sit where the things are)
import * as THREE from 'three/webgpu';

const providers = [];
/** near(x, z, reach) -> bodies: who places things tells where they stand. stops: they stop the walker. */
export function addBodies(near, { stops = true } = {}) { providers.push({ near, stops }); }
/** The bodies within `reach` metres of (x, z). */
export function bodiesNear(x, z, reach, stopping = false) {
  const out = [];
  for (const P of providers) if (!stopping || P.stops) for (const b of P.near(x, z, reach)) out.push(b);
  return out;
}
/** A point of a body's own frame in the world. */
export function toWorld(b, p, out = [0, 0, 0]) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  out[0] = b.x + (p[0] * c - p[2] * s) * b.s; out[1] = b.y + p[1] * b.s; out[2] = b.z + (p[0] * s + p[2] * c) * b.s;
  return out;
}
const posed = (b, S, p, out) => (S.bone != null && b.pose ? b.pose(S.bone, p, out) : ((out[0] = p[0]), (out[1] = p[1]), (out[2] = p[2]), out));
// a mesh's round, seen from above: its middle and how far its corners reach (a little inside: it stops you where you see it)
const roundOf = (S) => (S.round ||= (() => { let x = 0, z = 0, y = 0, r = 0; const n = S.verts.length / 3; for (let i = 0; i < n; i++) { x += S.verts[i * 3] / n; y += S.verts[i * 3 + 1] / n; z += S.verts[i * 3 + 2] / n; } for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(S.verts[i * 3] - x, S.verts[i * 3 + 2] - z)); return { at: [x, y, z], r: r * 0.75, top: Math.max(...Array.from({ length: n }, (_, i) => S.verts[i * 3 + 1])) }; })());   // (top: how high it stands)

const A = [0, 0, 0], B = [0, 0, 0], W = [0, 0, 0];
/** What stops a walker round (x, z): each solid shape between knee and head as a round on the ground. */
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
    capsule along its length, a box by its sides (it slides along a wall), a mesh by its round. Twice over, so what
    one shape pushes into another is pushed out again. */
export function pushOut(x, z, r = 0.3, low = 0.55, tall = 1.8) {   // (low: what ends under the knee is stepped over)
  for (let pass = 0; pass < 2; pass++) for (const b of bodiesNear(x, z, r + 3, true)) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z, R = r / b.s, lo = (low - b.up) / b.s, hi = (tall - b.up) / b.s;   // the walker in the body's own frame
    let px = (dx * c + dz * s) / b.s, pz = (-dx * s + dz * c) / b.s, moved = false;
    const round = (cx, cz, rr) => { const ux = px - cx, uz = pz - cz, d = Math.hypot(ux, uz), m = rr + R; if (d < m) { const k = m / Math.max(d, 1e-6); px = cx + (d < 1e-6 ? m : ux * k); pz = cz + uz * k; moved = true; } };
    for (const S of b.body.shapes) {
      if (S.pass) continue;
      if (S.shape === 'sphere') { const off = Math.max(lo - S.at[1], S.at[1] - hi, 0); if (off < S.r) round(S.at[0], S.at[2], Math.sqrt(S.r * S.r - off * off)); }   // (its round at the band's height nearest its middle)
      else if (S.shape === 'capsule') {
        posed(b, S, S.a, A); posed(b, S, S.b, B); if (Math.min(A[1], B[1]) - S.r > hi || Math.max(A[1], B[1]) + S.r < lo) continue;
        const ex = B[0] - A[0], ez = B[2] - A[2], ee = ex * ex + ez * ez, t = ee > 1e-9 ? Math.min(1, Math.max(0, ((px - A[0]) * ex + (pz - A[2]) * ez) / ee)) : 0; round(A[0] + ex * t, A[2] + ez * t, S.r);
      } else if (S.shape === 'box') {
        if (S.at[1] - S.half[1] > hi || S.at[1] + S.half[1] < lo) continue;
        const ux = px - S.at[0], uz = pz - S.at[2], hx = S.half[0] + R, hz = S.half[2] + R;
        if (Math.abs(ux) < hx && Math.abs(uz) < hz) { if (hx - Math.abs(ux) < hz - Math.abs(uz)) px = S.at[0] + Math.sign(ux || 1) * hx; else pz = S.at[2] + Math.sign(uz || 1) * hz; moved = true; }
      } else if (S.shape === 'mesh') { const Q = roundOf(S); if (Q.top > lo) round(Q.at[0], Q.at[2], Q.r); }   // (a mesh that ends under the knee is stepped over)
    }
    if (moved) { x = b.x + (px * c - pz * s) * b.s; z = b.z + (px * s + pz * c) * b.s; }
  }
  return [x, z];
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
  if (S.shape === 'box') return slab(o, d, [S.at[0] - S.half[0], S.at[1] - S.half[1], S.at[2] - S.half[2]], [S.at[0] + S.half[0], S.at[1] + S.half[1], S.at[2] + S.half[2]]);
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
      else { const at = S.at, h = S.shape === 'box' ? S.half : [S.r, S.r, S.r]; for (let k = 0; k < 3; k++) { const u = [0, 0, 0]; u[k] = h[k]; seg(b, at.map((x, i) => x - u[i]), at.map((x, i) => x + u[i]), col); } }
    }
  }
  lines.geometry.setDrawRange(0, n); P.needsUpdate = C.needsUpdate = true; lines.visible = n > 0;
}
if (typeof window !== 'undefined') window.__bodies = { near: bodiesNear, rounds: roundsNear, hit, pushOut };
