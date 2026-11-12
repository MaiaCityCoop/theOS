// What the walker cannot walk through: every placed asset's `solid` (assets/index.js), stood where the asset
// stands. One rule for all of them: walls are rounds with gaps (a door), posts are rounds, boxes are boxes, and
// `ceiling` says how high the room overhead is, so the walker stoops under a low roof.
import { rocksNear } from './rocksolid.js';
import { trunksNear } from './trunks.js';
const BODY = 0.3;   // how wide the walker is, from the middle: a step keeps this far off anything
const list = [];

/** An asset stood at { x, z, yaw }: its solids, from now on, in the world. */
export function addSolid(solid, at) {
  if (solid) list.push({ s: solid, x: at.x, z: at.z, c: Math.cos(at.yaw || 0), n: Math.sin(at.yaw || 0) });
}
// into a solid's frame and out (three's turn about y: x' = x c + z s, z' = -x s + z c)
const toL = (o, x, z) => { const dx = x - o.x, dz = z - o.z; return [dx * o.c - dz * o.n, dx * o.n + dz * o.c]; };
const toW = (o, u, v) => [o.x + u * o.c + v * o.n, o.z - u * o.n + v * o.c];

/** The placed thing whose walls (x, z) is inside, with the way in: { door: { x, z, yaw }, leave } (null outside all).
    door: a spot 2.5 m outside its first door, facing in; leave: 'roof' (rise through it) or 'door' (out by the door first). */
export function within(x, z) {
  for (const o of list) {
    const [u, v] = toL(o, x, z);
    for (const w of o.s.walls || []) {
      if (Math.hypot(u, v) >= w.round || !(w.gaps || []).length) continue;
      const m = w.gaps[0][0], [dx, dz] = toW(o, Math.cos(m) * (w.round + 2.5), Math.sin(m) * (w.round + 2.5));
      return { door: { x: dx, z: dz, yaw: Math.atan2(dx - o.x, dz - o.z) }, leave: o.s.leave || 'roof' };   // facing the middle: forward is (-sin yaw, -cos yaw)
    }
  }
  return null;
}

/** A line of sight from (x0, z0) to (x1, z1): the share of it (0 to 1) clear before a placed thing's walls stop it; doors let
    it through. Rocks do not: a camera pulled in by every stone it passes would jump in and out. */
export function clear(x0, z0, x1, z1) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25));
  let px = x0, pz = z0;
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n, [qx, qz] = step(px, pz, x, z, false);
    if (Math.hypot(qx - x, qz - z) > 0.01) return Math.max(0, (i - 1) / n);
    px = x; pz = z;
  }
  return 1;
}

/** A step from (px, pz) to (x, z): where it really ends, kept out of every solid. */
export function step(px, pz, x, z, rocks = true) {
  for (const o of list) {
    let [u0, v0] = toL(o, px, pz), [u, v] = toL(o, x, z);
    if (Math.hypot(u, v) > 40) continue;
    for (const w of o.s.walls || []) {
      const r0 = Math.hypot(u0, v0), r = Math.hypot(u, v), t = Math.atan2(v, u);
      const inGap = (w.gaps || []).some(([m, h]) => Math.abs(Math.atan2(Math.sin(t - m), Math.cos(t - m))) < h - BODY / w.round);
      if (inGap) continue;
      const inside = r0 < w.round;
      if (inside && r > w.round - BODY) { const k = (w.round - BODY) / r; u *= k; v *= k; }
      else if (!inside && r < w.round + BODY) { const k = (w.round + BODY) / Math.max(r, 1e-6); u *= k; v *= k; }
    }
    for (const p of o.s.posts || []) {
      const du = u - p.x, dv = v - p.z, d = Math.hypot(du, dv), m = p.r + BODY;
      if (d < m) { const k = m / Math.max(d, 1e-6); u = p.x + du * k; v = p.z + dv * k; }
    }
    for (const b of o.s.boxes || []) {
      const ca = Math.cos(b.a || 0), sa = Math.sin(b.a || 0), du = u - b.x, dv = v - b.z;
      let bu = du * ca + dv * sa, bv = -du * sa + dv * ca; const hu = b.w / 2 + BODY, hv = b.d / 2 + BODY;
      if (Math.abs(bu) < hu && Math.abs(bv) < hv) {
        if (hu - Math.abs(bu) < hv - Math.abs(bv)) bu = Math.sign(bu || 1) * hu; else bv = Math.sign(bv || 1) * hv;
        u = b.x + bu * ca - bv * sa; v = b.z + bu * sa + bv * ca;
      }
    }
    [x, z] = toW(o, u, v);
  }
  if (rocks) for (const r of [...rocksNear(x, z, 1.5), ...trunksNear(x, z, 1.5)]) {   // and the trees' trunks (src/world/trunks.js)   // the scattered rocks, as the card places them (src/world/rocksolid.js)
    const du = x - r.x, dv = z - r.z, d = Math.hypot(du, dv), m = r.r + BODY;
    if (d < m) { const k = m / Math.max(d, 1e-6); x = r.x + du * k; z = r.z + dv * k; }
  }
  return [x, z];
}

/** How high the room is overhead at (x, z): Infinity under the open sky. */
export function ceilingAt(x, z) {
  let c = Infinity;
  for (const o of list) if (o.s.ceiling) { const [u, v] = toL(o, x, z); c = Math.min(c, o.s.ceiling(u, v)); }
  return c;
}
