// The cut's pop check (intent 0038, stage 8): what the eye would see a surface do between two frames, walked from very
// near to a pixel, reckoned exactly as the GPU does it (src/scatter/cut.js), with nothing else in the picture. At each
// step the camera comes 1 % nearer (a walk at 1.6 m/s seen 60 times a second moves less); the rule picks the level and
// its clusters, each turned into its parent as far as it says; the surface drawn is held against the one drawn a step
// before, and the farthest any point of it moved off that surface is the jump, in the pixels drawn. A pop is a jump of
// a pixel or more; under the cut's error it is a fraction, and the morph makes it smaller still. Each thing is also
// walked without the morph (its clusters swapped at once), to show what the morph takes away.
//
//   bun tools/gate/pop.js [boulder|stone|belltent|firepit …]
import { build, ready } from '../../assets/kit/clusters.js';
import { useBuilder } from '../../assets/kit/surface.js';
import { ERROR_PX, BAND, PX_CUT, SURFACE_LEVELS, surfaceBand, surfacePx, dialPx } from '../../src/detail/error.js';
import { rockFull } from '../../assets/kit/rock.js';
import { spanOf } from '../../assets/kinds.js';
import { pxKAt } from '../../src/detail/measure.js';
import { drawnRows } from '../../src/core/output.js';

await ready; useBuilder(build);
const STEP = +(process.env.STEP || 1.01), SAMPLE = +(process.env.SAMPLE || 1);   // (a step a frame: 1 % nearer; SAMPLE: every so many triangles' corners measured, for a large surface)
const KH = pxKAt(drawnRows());   // the measure's: pixels drawn a metre covers at a metre through the walker's lens, at the most rows the game draws (src/detail/measure.js, src/core/output.js drawnRows)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** M of a thing: rocks by their kit, made things welded as assets/kit/made.js does it (place, normal, colour alike). */
async function meshOf(name) {
  const a = (await import(`../../assets/${name}.js`)).default;
  if (!a.faces) { const F = rockFull(a, 0); return { V: F.V, pos: F.pos, nor: F.nor, attr: Float32Array.from(F.shade), k: 1, aw: [0.01], index: F.index }; }
  const span = spanOf(a), key = new Map(), P = [], N = [], C = [], idx = [];
  for (const [p0, p1, p2, c, m, ns] of a.faces) {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]], fx = e1[1] * e2[2] - e1[2] * e2[1], fy = e1[2] * e2[0] - e1[0] * e2[2], fz = e1[0] * e2[1] - e1[1] * e2[0], fl = Math.hypot(fx, fy, fz) || 1;
    [p0, p1, p2].forEach((p, j) => { const n = ns ? ns[j] : [fx / fl, fy / fl, fz / fl], col = Array.isArray(c[0]) ? c[j] : c, k = `${p.map((x) => Math.round(x * 1e4))}|${n.map((x) => Math.round(x * 1e3))}|${col.map((x) => Math.round(x * 255))}|${m ?? ''}`; let v = key.get(k); if (v === undefined) { v = P.length / 3; key.set(k, v); P.push(p[0] / span, p[1] / span, p[2] / span); N.push(...n); C.push(...col); } idx.push(v); });
  }
  return { V: P.length / 3, pos: Float32Array.from(P), nor: Float32Array.from(N), attr: Float32Array.from(C), k: 3, aw: [0.02, 0.02, 0.02], index: Uint32Array.from(idx) };
}

/** What is drawn of hierarchy D for an eye at `eye` (the thing's own frame, its size 1) looking at its middle: the
    level the packing picks by its size on screen, its clusters by the rule, each vertex turned as far as it says
    (morph off: not at all). { tris: [[ax, ay, az, bx, …] …], px (the thing's size on screen, pixels drawn) }. */
function drawn(D, eye, morph) {
  const mid = [0, 0.4, 0], d = Math.hypot(eye[0] - mid[0], eye[1] - mid[1], eye[2] - mid[2]), px = KH / d;
  let l = 0; while (l < SURFACE_LEVELS - 1 && dialPx(px) <= surfacePx(l)) l++;   // (the levels' sizes are dial pixels: src/detail/error.js)
  const [lo, hi] = surfaceBand(l), allowed = (dd) => Math.min(hi, Math.max(lo, (ERROR_PX() * dd) / KH)), w = l ? 0 : smooth(PX_CUT * ERROR_PX(), 2 * PX_CUT * ERROR_PX(), px);
  const at = (s) => Math.max(1e-3, Math.hypot(eye[0] - s.c[0], eye[1] - s.c[1], eye[2] - s.c[2]) - s.r), P = D.M.pos, KK = 6 + D.k, tris = [];
  for (const c of D.clusters) {
    if (!(c.self.err <= hi && c.parent.err > lo)) continue;   // (not in this level)
    const bS = allowed(d + (at(c.self) - d) * w), bP = allowed(d + (at(c.parent) - d) * w);
    if (!(c.self.err <= bS && c.parent.err > bP)) continue;
    const t = morph ? smooth(bP * BAND, bP, c.parent.err) : 0, q = (j) => { const v = c.verts[j]; return [0, 1, 2].map((a) => P[v * 3 + a] + (c.to[j * KK + a] - P[v * 3 + a]) * t); };
    for (let i = 0; i < c.tris.length; i += 3) tris.push([...q(c.tris[i]), ...q(c.tris[i + 1]), ...q(c.tris[i + 2])]);
  }
  return { tris, px, l };
}
// the farthest any corner of `now` lies from the surface `before` (a grid over its triangles)
function jump(before, now) {
  const G = new Map(), cell = 0.02, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const t of before) { const lo = [0, 1, 2].map((a) => Math.floor(Math.min(t[a], t[a + 3], t[a + 6]) / cell)), hi = [0, 1, 2].map((a) => Math.floor(Math.max(t[a], t[a + 3], t[a + 6]) / cell)); for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = `${x},${y},${z}`; (G.get(k) ?? G.set(k, []).get(k)).push(t); } }
  let most = 0;
  for (let i = 0; i < now.length; i += SAMPLE) for (let j = 0, t = now[i]; j < 9; j += 3) {   // (every SAMPLE-th triangle's corners: a pop moves a cluster, many triangles)
    const p = [t[j], t[j + 1], t[j + 2]]; let best = Infinity;
    for (let r = 0; r < 4 && best > (r - 1) * cell; r++) for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== r) continue;
      for (const s of G.get(key(p[0] + x * cell, p[1] + y * cell, p[2] + z * cell)) ?? []) best = Math.min(best, toTri(p, s));
    }
    if (best === Infinity) best = 4 * cell;   // (nothing near: at least this far)
    most = Math.max(most, best);
  }
  return most;
}
function toTri(p, t) {   // distance from p to triangle t (by its plane where it falls inside, else to its edges)
  const a = [t[0], t[1], t[2]], b = [t[3], t[4], t[5]], c = [t[6], t[7], t[8]], sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const n = cr(sub(b, a), sub(c, a)), nl = Math.hypot(...n);
  const seg = (u, v) => { const e = sub(v, u), k = Math.max(0, Math.min(1, dot(sub(p, u), e) / (dot(e, e) || 1))); return Math.hypot(...sub(p, [u[0] + e[0] * k, u[1] + e[1] * k, u[2] + e[2] * k])); };
  if (nl > 1e-12) { const dn = dot(sub(p, a), n) / nl, q = [p[0] - (n[0] / nl) * dn, p[1] - (n[1] / nl) * dn, p[2] - (n[2] / nl) * dn]; if (dot(cr(sub(b, a), sub(q, a)), n) >= 0 && dot(cr(sub(c, b), sub(q, b)), n) >= 0 && dot(cr(sub(a, c), sub(q, c)), n) >= 0) return Math.abs(dn); }
  return Math.min(seg(a, b), seg(b, c), seg(c, a));
}

// `--at name:m,m,…`: the triangles the cut draws of a thing seen from so many metres (its size's own: a rock 1 m), and
// at which level, instead of the walk
if (process.argv[2] === '--at') {
  for (const arg of process.argv.slice(3)) {
    const [name, ms] = arg.split(':'), a = (await import(`../../assets/${name}.js`)).default, span = a.faces ? spanOf(a) : 1, D = build(await meshOf(name));
    console.log(`${name}: ${ms.split(',').map((m) => { const d = +m / span, r = drawn(D, [d * 0.8, 0.4 + d * 0.25, d * 0.55].map((x, i) => (i === 1 ? x : x / Math.hypot(0.8, 0.25, 0.55))), true); return `${m} m: ${r.tris.length} triangles (level ${r.l}, ${r.px.toFixed(0)} px)`; }).join('; ')}`);
  }
  process.exit(0);
}
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['boulder', 'belltent', 'firepit']) {
  const D = build(await meshOf(name)), dir = [0.8, 0.25, 0.55], dl = Math.hypot(...dir);
  for (const morph of [true, false]) {
    let prev = null, most = 0, mostAt = 0, steps = 0; const all = [];
    for (let dd = 0.9; dd < 900; dd *= STEP) {   // from just off its middle to where it is about a pixel
      const eye = [(dir[0] / dl) * dd, 0.4 + (dir[1] / dl) * dd, (dir[2] / dl) * dd], now = drawn(D, eye, morph);
      if (prev && prev.tris.length && now.tris.length) {
        const j = Math.max(jump(prev.tris, now.tris), jump(now.tris, prev.tris)) * now.px;   // (in the pixels drawn)
        all.push(j); steps++; if (j > most) { most = j; mostAt = now.px; }
      }
      prev = now;
    }
    all.sort((a, b) => a - b);
    console.log(`${name.padEnd(9)} ${morph ? 'morph' : 'swap '}  steps ${steps}  the largest jump ${most.toFixed(3)} px drawn (at ${mostAt.toFixed(0)} px on screen), 99th percentile ${all[Math.floor(all.length * 0.99)].toFixed(3)}, median ${all[Math.floor(all.length / 2)].toFixed(4)}`);
  }
}
