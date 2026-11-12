// The city's plan: its plots laid on the real land, from the numbers of world/city.js and the land's own functions
// (src/world/land.js). Pure JS, no DOM, no three: run once in a worker (./plan.worker.js), the same seed always the same city.
//
// The plots are the cells of a jittered hex grid round the first village: each cell is cut from its neighbours by the
// half-way line (a Voronoi cell), set back by half a road, its corners rounded. Then it meets the land: a grid point
// that falls by a river moves away from it, and a plot ends at a river's bank (each point of its edge comes back
// towards its middle until it is on the middle's side and `river` metres from the water). A cell whose ground is mostly
// rock, or broken, stays wild. The cells nearest the first village become the city's plots, exactly as many as the
// city needs (people / perVillage), and its people share them by their real area.
import CITY from '../../world/city.js';
import { PLACES } from '../../world/places.js';
import { riverAt, riverRaw, heightAt, aridAt, outcropAt, noiseAt, cellRnd, sstep } from '../world/land.js';

const SQ3 = Math.sqrt(3);
export const PLOTS = Math.round(CITY.people / CITY.perVillage);   // 898 villages
const PLANNED = CITY.perVillage * CITY.m2;                       // m² a village is planned on: 2.25 km²
const LAT = [];                                                   // the lattice's offsets within two rings
for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 3 && (q || r)) LAT.push([q, r]);

const area = (P) => { let a = 0; for (let i = 0, n = P.length; i < n; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % n]; a += x0 * z1 - x1 * z0; } return Math.abs(a) / 2; };
function centroid(P) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = P.length; i < n; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % n], k = x0 * z1 - x1 * z0; a += k; cx += (x0 + x1) * k; cz += (z0 + z1) * k; }
  return a ? [cx / (3 * a), cz / (3 * a)] : P[0];
}
export function inside(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}
// keep what lies on the side of the line (p - o)·n <= k (Sutherland–Hodgman)
function clipHalf(P, ox, oz, nx, nz, k) {
  const out = [], f = ([x, z]) => (x - ox) * nx + (z - oz) * nz - k;
  for (let i = 0, n = P.length; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// a polygon with its corners rounded (each corner a sampled quadratic curve), as the old map drew them
function rounded(P, r, steps = 5) {
  const out = [];
  for (let i = 0, n = P.length; i < n; i++) {
    const a = P[(i - 1 + n) % n], c = P[i], b = P[(i + 1) % n];
    const la = Math.hypot(a[0] - c[0], a[1] - c[1]), lb = Math.hypot(b[0] - c[0], b[1] - c[1]), k = Math.min(r, la * 0.45, lb * 0.45);
    const p0 = [c[0] + ((a[0] - c[0]) / la) * k, c[1] + ((a[1] - c[1]) / la) * k], p1 = [c[0] + ((b[0] - c[0]) / lb) * k, c[1] + ((b[1] - c[1]) / lb) * k];
    for (let s = 0; s <= steps; s++) { const t = s / steps, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); }
  }
  return out;
}
// the outline walked at an even step
function resample(P, step) {
  const L = [0]; for (let i = 0, n = P.length; i < n; i++) L.push(L[i] + Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]));
  const total = L[P.length], n = Math.max(12, Math.round(total / step)), out = [];
  for (let s = 0, j = 0; s < n; s++) {
    const d = (s / n) * total; while (L[j + 1] < d) j++;
    const a = P[j], b = P[(j + 1) % P.length], t = (d - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
const sideOf = (x, z) => Math.sign(riverRaw(x, z)[0]) || 1;
const clear = (x, z, side) => { const v = riverAt(x, z); return Math.sign(v.r || 1) === side && v.d >= v.w + CITY.river; };
// a point of the edge brought back towards the middle (sx, sz) until it is on the middle's side of every river, clear of the water
function toBank(sx, sz, px, pz, side) {
  const len = Math.hypot(px - sx, pz - sz), n = Math.max(2, Math.ceil(len / 45));
  let t0 = 0, cut = false;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (sideOf(sx + (px - sx) * t, sz + (pz - sz) * t) !== side) { let a = t0, b = t; for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (sideOf(sx + (px - sx) * m, sz + (pz - sz) * m) === side) a = m; else b = m; } t0 = a; cut = true; break; }
    t0 = t;
  }
  let t = t0; const back = 8 / Math.max(len, 1);
  while (t > 0.04 && !clear(sx + (px - sx) * t, sz + (pz - sz) * t, side)) { t -= back; cut = true; }
  t = Math.max(t, 0.04);
  return [sx + (px - sx) * t, sz + (pz - sz) * t, cut];
}

/** The cell of grid point i: its outline cut by the rivers, and whether one cut it. */
function cellOf(seeds, i, S, step, round) {
  // a neighbour across a river is no neighbour here: the river parts them, so each takes the land on its own bank up to
  // the water (the rays below), and no land between two plots is left to nobody
  const s = seeds[i], R = 1.6 * S, side = sideOf(s.x, s.z); let P = [[s.x - R, s.z - R], [s.x + R, s.z - R], [s.x + R, s.z + R], [s.x - R, s.z + R]];
  for (const [dq, dr] of LAT) {
    const o = seeds.at(s.q + dq, s.r + dr); if (!o || sideOf(o.x, o.z) !== side) continue;
    const dx = o.x - s.x, dz = o.z - s.z, l = Math.hypot(dx, dz);
    P = clipHalf(P, s.x, s.z, dx / l, dz / l, l / 2 - CITY.road / 2);
    if (P.length < 3) return null;
  }
  if (round) P = rounded(P, CITY.corner * S);
  P = resample(P, step);
  let cut = false;
  P = P.map(([x, z]) => { const [bx, bz, c] = toBank(s.x, s.z, x, z, side); cut ||= c; return [bx, bz]; });
  if (cut) for (let k = 0; k < 2; k++) P = P.map((p, j) => { const a = P[(j - 1 + P.length) % P.length], b = P[(j + 1) % P.length]; return [0.25 * a[0] + 0.5 * p[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * p[1] + 0.25 * b[1]]; });
  return { P, cut };
}

// the grid points round the first village, each jittered by the plan's seed; a few left out; those by a river moved off it
function lattice(S, rings) {
  const core = PLACES[CITY.core.at], map = new Map(), list = [], sd = CITY.seed;
  const key = (q, r) => q * 4096 + r;
  for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) {
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (ring > rings || (ring > 1 && cellRnd(q, r, sd + 2) < CITY.skip)) continue;
    let x = core.x + S * (q + r / 2) + (ring ? (cellRnd(q, r, sd) - 0.5) * 0.36 * S : 0), z = core.z + S * r * (SQ3 / 2) + (ring ? (cellRnd(q, r, sd + 1) - 0.5) * 0.36 * S : 0);
    const v = riverAt(x, z), want = 0.34 * S;   // a grid point by a river moves away from it, so the river runs nearer the plots' edges
    if (v.d < want) { const g = Math.hypot(v.gx, v.gz) || 1, sg = Math.sign(v.r || 1), m = want - v.d; x += (sg * v.gx / g) * m; z += (sg * v.gz / g) * m; }
    if (!ring) { const dx = x - core.x, dz = z - core.z, l = Math.hypot(dx, dz), lim = 0.3 * S; if (l > lim) { x = core.x + (dx / l) * lim; z = core.z + (dz / l) * lim; } }   // the first village keeps the tent
    const s = { q, r, x, z, ring, d: Math.hypot(x - core.x, z - core.z) * (1 + 0.1 * (noiseAt(x / 6000, z / 6000, 96) - 0.5)) };   // the city's edge soft, not a hexagon
    map.set(key(q, r), s); list.push(s);
  }
  list.at = (q, r) => map.get(key(q, r));
  return list;
}

// what the land under a plot is: its shares of meadow, forest, dry land and shore, its rock, its heights
function landOf(P, S) {
  const step = S / 7, c = { meadow: 0, forest: 0, dry: 0, shore: 0 }; let n = 0, rock = 0, lo = 1e9, hi = -1e9, sum = 0;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let z = z0 + step / 2, row = 0; z < z1; z += step * (SQ3 / 2), row++) for (let x = x0 + (row % 2 ? step : step / 2); x < x1; x += step) {
    if (!inside(P, x, z)) continue;
    const v = riverAt(x, z), d = v.d, w = v.w, h = heightAt(x, z);
    const forest = sstep(0.6, 0.72, noiseAt(x / 1100, z / 1100, 80) + (noiseAt(x / 240, z / 240, 81) - 0.5) * 0.3) * sstep(w + 30, w + 90, d);   // biomes/pineforest.js's rule
    if (d < w + 120) c.shore++; else if (forest > 0.5) c.forest++; else if (aridAt(x, z) > 0.5) c.dry++; else c.meadow++;
    rock += outcropAt(x, z) > 0.5 ? 1 : 0; lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
  }
  if (!n) return null;
  for (const k in c) c[k] = c[k] / n;
  return { shares: c, rock: rock / n, elev: { min: lo, max: hi, mean: sum / n } };
}

/** The whole city: { plots, spacing, planned, wild } (see world/city.js). */
export function plan() {
  const t0 = performance.now();
  // the grid's spacing: a hexagon of the planned area, widened by what the rivers take (measured on a first, coarse pass)
  let S = Math.sqrt(PLANNED / (SQ3 / 2));
  {
    const all = lattice(S, 12); let sum = 0, n = 0;
    for (const i of all.map((s, i) => i).sort((a, b) => all[a].d - all[b].d).slice(0, 250)) { const c = cellOf(all, i, S, S / 4, false); if (c && area(c.P) > 0.3 * PLANNED) { sum += area(c.P); n++; } }
    S *= Math.sqrt(PLANNED / (sum / n));
  }
  const rings = Math.ceil(Math.sqrt(PLOTS / (1 - CITY.skip) / 0.7 / 3)) + 2;
  const seeds = lattice(S, rings), order = seeds.map((s, i) => i).sort((a, b) => seeds[a].d - seeds[b].d);
  const cells = new Map(), plots = []; let wild = 0;
  for (const i of order) {
    if (plots.length >= PLOTS) break;
    const s = seeds[i], c = cellOf(seeds, i, S, 90, true);
    if (!c) { wild++; continue; }
    const a = area(c.P), land = a > 0.3 * PLANNED ? landOf(c.P, S) : null;
    if (!land || land.rock > CITY.wild.rock || land.elev.max - land.elev.min > CITY.wild.steep) { wild++; continue; }
    const [cx, cz] = centroid(c.P);
    const p = { id: plots.length + 1, q: s.q, r: s.r, x: cx, z: cz, outline: c.P, area: a, people: 0, river: c.cut, ...land, dist: Math.hypot(cx - PLACES[CITY.core.at].x, cz - PLACES[CITY.core.at].z), neighbours: [] };
    p.name = p.id === 1 ? CITY.core.name : `Village ${p.id}`;
    plots.push(p); cells.set(s.q * 4096 + s.r, p);
  }
  // the people: everyone, shared by the plots' real areas (largest remainders, so they add up exactly)
  const units = plots.reduce((t, p) => t + p.area, 0), shares = plots.map((p) => (p.area / units) * CITY.people);
  plots.forEach((p, i) => (p.people = Math.floor(shares[i])));
  let left = CITY.people - plots.reduce((t, p) => t + p.people, 0);
  for (const i of shares.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).map((x) => x[1])) { if (left <= 0) break; plots[i].people++; left--; }
  // neighbours: two plots whose edges come within a road's reach of each other (across a river by a bridge)
  for (const p of plots) for (const [dq, dr] of LAT) {
    const o = cells.get((p.q + dq) * 4096 + (p.r + dr)); if (!o || o.id < p.id) continue;
    let near = Infinity;
    for (let i = 0; i < p.outline.length && near > CITY.unlock.touch; i += 2) for (let j = 0; j < o.outline.length; j += 2) near = Math.min(near, Math.hypot(p.outline[i][0] - o.outline[j][0], p.outline[i][1] - o.outline[j][1]));
    if (near <= CITY.unlock.touch) { p.neighbours.push(o.id); o.neighbours.push(p.id); }
  }
  // every plot reachable from the first village: a plot cut off by wild land is joined by a road across it to the
  // nearest plot that is reachable
  const byId = (id) => plots[id - 1];
  for (;;) {
    const seen = new Set([1]), st = [1];
    while (st.length) for (const n of byId(st.pop()).neighbours) if (!seen.has(n)) { seen.add(n); st.push(n); }
    if (seen.size === plots.length) break;
    let best = null;
    for (const p of plots) if (!seen.has(p.id)) for (const id of seen) { const o = byId(id), d = Math.hypot(p.x - o.x, p.z - o.z); if (!best || d < best[0]) best = [d, p, o]; }
    best[1].neighbours.push(best[2].id); best[2].neighbours.push(best[1].id);
  }
  // the outline with its heights, flat, for the drawing: x, y, z per point
  for (const p of plots) { const f = new Float32Array(p.outline.length * 3); p.outline.forEach(([x, z], k) => { f[k * 3] = x; f[k * 3 + 1] = heightAt(x, z); f[k * 3 + 2] = z; }); p.outline = f; p.y = heightAt(p.x, p.z); delete p.q; delete p.r; }
  return { plots, spacing: S, planned: PLANNED, wild, ms: Math.round(performance.now() - t0) };
}
