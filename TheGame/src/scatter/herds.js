// Herds (intent 0029): the zoo's creatures roaming the meadow round the tent, as many as `?herds=N` asks (none without
// it). It is how a world of real animals is drawn, moved and walked into. Each creature walks a round of its own at its
// herd's pace. It is drawn by the one drawer on its skeleton (drawer.js tierAll, `moving`: packed every frame), is solid
// where it is (src/world/bodies.js: its colliders carried by its bones), and is a thing of its own
// (src/world/things.js: `herds:i:0`: gone, grown).
//
// A creature's path is a row of numbers worked out once, here, and read by both the GPU (where it is drawn) and the
// CPU (where it is solid), so the two never disagree: [the middle of its round x, z, its radius, where on it it began],
// [how fast it goes round (radians a second, its sign its way round), its kind, its size, its stride's pace], [its
// stride's own start, its seed].
import * as THREE from 'three/webgpu';
import { If, float, int, uint, vec2, vec4, uniform, storage, cos, sin, fract, sign } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist, groundAt } from '../world/land.nodes.js';
import { heightAt } from '../world/land.js';
import { rng } from '../core/hash.js';
import { inView } from './view.js';
import { MAXP } from './tier.js';
import { createDrawer } from './drawer.js';
import { LADDER } from '../../assets/kit/ladder.js';
import { BONES } from '../../assets/kit/solid.js';
import { moved } from '../../assets/kit/bones.js';
import { STAND, MOVING, HERDS, lookOf as lookOfKind, fingerprint, bodyOf } from '../../assets/zoo/index.js';
import { addBodies } from '../world/bodies.js';
import { idOf, keyN, nameKey } from '../world/things.js';
import { PLACES } from '../../world/places.js';
import { flagNum } from '../core/flags.js';

const N = Math.max(0, Math.min(65536, Math.floor(flagNum('herds', 0))));   // `?herds=N`: how many roam
const FROM = 12, TO = 45, FAR = 600, WRAP = 512, TAU = Math.PI * 2, P = 64;   // their rounds' middles from FROM to TO metres off the tent; drawn as far as FAR; WRAP: seconds after which the stride clock begins again (drawer.js); P: a patch of the tier, P × P creatures
// its levels, the ladder's (assets/kit/ladder.js) as the stress stand's (stress.js), with fewer slots: a herd is a few
// hundred, not millions
const LEVELS = [
  { P: 2, slots: 8, cap: 64 },
  { P: 4, slots: 24, cap: 256 },
  { P: 4, slots: 64, cap: 1024 },
  { P: 8, slots: 128, cap: 4096 },
  { P: 10, slots: 256, cap: 16384 },
  { P: 20, cap: 65536 },
  { P: 50, cap: 65536 },
  { P: 100, cap: 65536 },   // its dot
].map((l, i) => ({ n: LADDER[i].n, px: LADDER[i].px, ...l }));
const SHADE = { level: 5, far: 30, wide: 1.5, reach: 12, shrink: 0.85 };

/** Every creature's path: rows of four, three a creature (above), and the same as numbers for the CPU. */
function pathsOf(n) {
  const walk = HERDS.filter((H) => !(H.fly?.[1] > 0)), herds = walk.length ? walk : HERDS, total = herds.reduce((s, H) => s + H.share, 0);
  const R = rng(0x48455244), rows = new Float32Array(Math.max(1, n) * 12), T = PLACES.tent;
  for (let i = 0; i < n; i++) {
    let pick = R() * total, H = herds[0]; for (const h of herds) { if (pick < h.share) { H = h; break; } pick -= h.share; }
    const a = R() * TAU, d = FROM + (TO - FROM) * Math.sqrt(R()), r = 3 + 9 * R(), S = H.size[0] + (H.size[1] - H.size[0]) * R(), v = H.speed[0] + (H.speed[1] - H.speed[0]) * R();
    const way = R() < 0.5 ? -1 : 1, kind = H.first + Math.min(H.count - 1, Math.floor(R() * H.count)) - STAND;   // (its kind as its drawer numbers it: the moving kinds of the zoo)
    const step = (TAU * 20) / WRAP, pace = Math.max(1, Math.round(v / (S * H.stride) / step)) * step;   // (radians of its gait a second, made to fit the stride clock: no leg jumps when it begins again)
    rows.set([T.x + d * Math.cos(a), T.z + d * Math.sin(a), r, R() * TAU, (way * v) / r, kind, S, pace, R() * TAU * 20, R() * TAU, 0, 0], i * 12);
  }
  return rows;
}

/** The creatures by where their rounds lie (rows: pathsOf's), n of them: a grid over their rounds' middles, its side
    a round's widest (its radius twice), each cell its creatures (counted, then laid end to end: two typed arrays).
    near(x, z, R) -> m: the creatures whose rounds may pass within R of (x, z) (its middle within R and its radius),
    the cells round it only, not a walk of all n: the first m of `list` (a typed array, kept: nothing made a look);
    where every round lies within R, all n as they lie, none looked at one by one. */
function roundsOf(rows, n) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, rMost = 0;
  for (let i = 0; i < n; i++) { const o = i * 12; x0 = Math.min(x0, rows[o]); x1 = Math.max(x1, rows[o]); z0 = Math.min(z0, rows[o + 1]); z1 = Math.max(z1, rows[o + 1]); rMost = Math.max(rMost, rows[o + 2]); }
  const side = Math.max(1e-3, 2 * rMost), nx = n ? Math.floor((x1 - x0) / side) + 1 : 1, nz = n ? Math.floor((z1 - z0) / side) + 1 : 1;
  const cellOf = (i) => Math.floor((rows[i * 12 + 1] - z0) / side) * nx + Math.floor((rows[i * 12] - x0) / side), start = new Uint32Array(nx * nz + 1), items = new Uint32Array(n);
  for (let i = 0; i < n; i++) start[cellOf(i) + 1]++;
  for (let c = 0; c < nx * nz; c++) start[c + 1] += start[c];
  const fill = start.slice(0, nx * nz); for (let i = 0; i < n; i++) items[fill[cellOf(i)]++] = i;
  const found = new Uint32Array(Math.max(1, n));
  const G = {
    list: items,
    near(x, z, R) {
      if (Math.hypot(Math.max(x - x0, x1 - x), Math.max(z - z0, z1 - z)) + rMost <= R) { G.list = items; return n; }   // (all of them within it)
      const reach = R + rMost, i0 = Math.max(0, Math.floor((x - reach - x0) / side)), i1 = Math.min(nx - 1, Math.floor((x + reach - x0) / side)), j0 = Math.max(0, Math.floor((z - reach - z0) / side)), j1 = Math.min(nz - 1, Math.floor((z + reach - z0) / side));
      let m = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = j * nx + i, a = start[c], b = start[c + 1]; if (a === b) continue;
        const fx = Math.max(Math.abs(x0 + i * side - x), Math.abs(x0 + (i + 1) * side - x)), fz = Math.max(Math.abs(z0 + j * side - z), Math.abs(z0 + (j + 1) * side - z));
        if (Math.hypot(fx, fz) + rMost <= R) { found.set(items.subarray(a, b), m); m += b - a; continue; }   // (the cell all within it: its creatures as they lie)
        for (let k = a; k < b; k++) { const n0 = items[k], o = n0 * 12, dx = rows[o] - x, dz = rows[o + 1] - z, r = R + rows[o + 2]; if (dx * dx + dz * dz <= r * r) found[m++] = n0; }
      }
      G.list = found; return m;
    },
  };
  return G;
}

function createHerds(scene, renderer, tex) {
  const rows = pathsOf(N), ROWS = storage(new THREE.StorageBufferAttribute(rows, 4), 'vec4', N * 3), strideT = uniform(0), HK = uniform(nameKey('herds'), 'uint');
  const sizes = [Infinity, 0]; for (let i = 0; i < N; i++) { sizes[0] = Math.min(sizes[0], rows[i * 12 + 6]); sizes[1] = Math.max(sizes[1], rows[i * 12 + 6]); }
  const D = createDrawer(scene, renderer, tex, { name: 'herds', LEVELS, SHADE, SMOOTH: uniform(1), skins: 64, zoo: { first: STAND, ALL: MOVING, STAND: 0, MOVING, lookOfKind: (k) => lookOfKind(STAND + k), fingerprint } });
  // where creature i is at time t (radians round its round), as the GPU reckons it and the CPU again: into `out`
  // ([x, z, its turn]), nothing made a creature a frame
  const into = (i, t, out) => { const o = i * 12, th = rows[o + 3] + TAU * ((((rows[o + 4] / TAU) * t) % 1) + 1); out[0] = rows[o] + rows[o + 2] * Math.cos(th); out[1] = rows[o + 1] + rows[o + 2] * Math.sin(th); out[2] = th + Math.sign(rows[o + 4]) * Math.PI / 2; return out; };
  const at = (i, t) => into(i, t, [0, 0, 0]);   // (a look's: window.__herds)
  const ROUNDS = roundsOf(rows, N), here = new Float64Array(3);   // (each creature by where its round lies: what looks near a point visits only those whose round passes near it);
  const place = (c, part, found) => {
    const i = int(c.y).mul(int(P)).add(int(c.x)), u = uint(i).mul(uint(3));
    If(i.lessThan(int(N)), () => {
      const R0 = ROWS.element(u).toVar(), R1 = ROWS.element(u.add(uint(1))).toVar(), R2 = ROWS.element(u.add(uint(2))).toVar();
      const th = R0.w.add(fract(R1.x.div(TAU).mul(U.uTime)).add(1).mul(TAU)), pos = vec2(R0.x.add(R0.z.mul(cos(th))), R0.y.add(R0.z.mul(sin(th)))).toVar(), dist = camDist(pos);
      If(dist.lessThan(FAR).and(inView(pos, R1.z, sizes[1] * 1.5)), () => {   // (how high it may stand: a number, the largest's)
        found(uint(R1.y), R1.z, dist, (A, B) => {
          A.assign(vec4(pos, groundAt(pos, float(0)), R1.z));
          B.assign(vec4(th.add(sign(R1.x).mul(Math.PI / 2)), R1.y, R1.w.mul(strideT).add(R2.x), R2.y));   // (its turn: along its round; its kind; its stride's clock; its seed: row.js)
        }, keyN(HK, i, int(0)));
      });
    });
  };
  const T = D.tierAll({ cell: 1, P, cap: Math.max(64, N), sizes, place, casts: true, far: FAR, moving: true, thing: 'herds' });
  T.band = () => { T.near = 0; T.far = FAR; }; T.viewKeyed = true; T.asset = 'Herds';
  T.select = () => {   // (its patches: every creature's, wherever the camera is; a creature too far or out of view packs nothing)
    let n = 0; for (let k = 0; k * P * P < N && n < MAXP; k++) T.list[n++].set(0, k * P);
    T.n = n; strideT.value = U.uTime.value % WRAP;
  };
  const tiers = [T];
  // each frame: its coarse meshes until they are in, the textures that have come, and the fine levels of those near
  tiers.solid = () => {
    D.start(); D.skinsIn();
    const L = D.scan(); if (!L) return;
    const cam = U.uCam.value, dy = U.uDy.value, t = U.uTime.value, far = L.reach(sizes[1]);
    for (let k = 0, m = ROUNDS.near(cam.x, cam.z, far), F = ROUNDS.list; k < m; k++) { const i = F[k], o = i * 12; into(i, t, here); const d = Math.hypot(here[0] - cam.x, here[1] - cam.z, dy); if (d < far) L.wants(rows[o + 5], rows[o + 6], d, Math.abs(rows[o + 4] * rows[o + 2]) * 0.35); }
    L.done();
  };
  // what of them is solid round a point: each its kind's colliders, carried by its bones as it walks
  addBodies((x, z, reach) => {
    const out = [], t = U.uTime.value, g = t % WRAP;
    for (let k = 0, m = ROUNDS.near(x, z, reach + sizes[1] + 1), F = ROUNDS.list; k < m; k++) {
      const i = F[k], o = i * 12, S = rows[o + 6]; into(i, t, here); const mx = here[0], mz = here[1], yaw = here[2]; if (Math.hypot(mx - x, mz - z) > reach + S + 1) continue;
      const k = rows[o + 5], zk = STAND + k, bones = D.boneRows.array.subarray(k * BONES * 12, (k + 1) * BONES * 12), gi = rows[o + 7] * g + rows[o + 8];
      out.push({ id: `herds:${i}`, thing: idOf('herds', i, 0), x: mx, z: mz, y: heightAt(mx, mz), up: 0, yaw, s: S, kind: zk, body: bodyOf(zk), pose: (bone, q, out) => moved(bones, bone, gi, q, out) });
    }
    return out;
  });
  window.__herds = { count: N, drawer: D, tier: T, rows, at, async counts() { const B = await T.read(renderer); return B.map((b, k) => ({ draw: k, count: b.count })).filter((b) => b.count); } };
  return tiers;
}

/** A scatter engine (src/scatter/index.js loads it where `?herds=N` asks): what it places of its own. */
export const engine = {
  id: 'herds',
  createOwn: (scene, tex, ground, gpu, renderer) => (gpu && N && MOVING ? createHerds(scene, renderer, tex) : []),
};
