// The stress stand: a test of the engine, not of the world. A thousand kinds of asset nobody drew (assets/kit/blob.js:
// each its own mesh of 50 000 to 200 000 triangles), a thousand of each, a million in all, one in every cell of a square
// of land four kilometres a side round the tent. Only with `?stress` in the address; nothing of it is in the library.
//
// How a million of a thousand kinds are drawn:
//   - where each stands is a list on the GPU (its place, its kind, its turn, its size), made once; a tier a level packs
//     the ones of its level that are in view (tier.js), as for every other stand;
//   - every kind's meshes lie in one heap (heap.js): a level of every kind is one draw call, its vertices read from the
//     heap by the kind's number. Nine levels: nine draw calls, one shader, whatever the number of kinds;
//   - the coarse levels of every kind are always there (20 KB a kind); the fine ones (the full mesh, and two under it)
//     only of the kinds that stand near, built in workers as the camera comes and put out again when it has gone. Until
//     a fine level has come, the next coarser one is drawn in its place;
//   - its level by its size on screen (src/detail/handover.js: one piece, it changes over whole), its last (one triangle: a
//     dot of its colour) sinking away under a pixel.
import * as THREE from 'three/webgpu';
import { Fn, If, float, uint, vec3, vec4, uniform, uniformArray, varyingProperty, instancedArray, instanceIndex, vertexIndex, cameraViewMatrix, cos, sin, max, length, normalize, smoothstep } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist, groundAt } from '../world/land.nodes.js';
import { finish, skyLight, cloudAtOne, cloudShade, sunDim, unlit } from '../world/light.js';
import { pxK } from '../detail/index.js';
import { bandOf, padOf } from '../detail/handover.js';
import { Tier, offScreen, clipOf } from './tier.js';
import { inView } from './view.js';
import { createHeap, heapRow, heapVertex, effective } from './heap.js';
import { fullOf, trisOf, vertsOf } from '../../assets/kit/blob.js';
import { PLACES } from '../../world/places.js';

const KINDS = 1000, SIDE = 1000, CELL = 4;   // a thousand kinds; a thousand cells a side, one asset in each: a thousand of every kind
const SMIN = 0.9, SMAX = 5.5, FADE = 0.02, SINK = 1.6, FULL = 129;   // an asset's largest side, metres; FULL: the most squares an edge a full mesh has
// its levels, finest first. n: squares along an edge (-1: the kind's full mesh); px: the size on screen it is drawn down
// to; P: its tier's cells a patch; slots: how many kinds' the heap holds at once (none: every kind's); cap: the most of
// it drawn at once
const LEVELS = [
  { n: -1, px: 256, P: 2, slots: 8, cap: 64 },
  { n: 32, px: 128, P: 4, slots: 48, cap: 256 },
  { n: 16, px: 64, P: 4, slots: 320, cap: 1024 },
  { n: 8, px: 32, P: 8, cap: 4096 },
  { n: 4, px: 16, P: 8, cap: 16384 },
  { n: 2, px: 8, P: 16, cap: 65536 },
  { n: 1, px: 4, P: 32, cap: 262144 },
  { n: 0, px: 2, P: 64, cap: 524288 },
  { n: -2, px: 1, P: 64, cap: SIDE * SIDE },   // its dot: one triangle, turned to the eye
];
if (new URLSearchParams(location.search).get('stress') === 'all') LEVELS.at(-1).px = 0.2;   // ?stress=all: drawn down to a fifth of a pixel, so that a view from high up draws every one of the million (a test of how many can be drawn: under a pixel nothing of them is seen)
const L = LEVELS.length, STREAMED = LEVELS.filter((l) => l.slots).length, FULLN = -1, nOf = (k, l) => (LEVELS[l].n === FULLN ? fullOf(k) : LEVELS[l].n);
const SHADE = { level: 4, far: 60, wide: 1.5, reach: 20, shrink: 0.85 };   // what casts their shadows: a coarse level of each round the camera, a little smaller than the thing (so it does not shade itself)

const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));

// where each stands: cell (ix, iz) holds kind (ix·a + b) mod 1000, a and b its row's own (a with no factor in common
// with 1000: a row holds every kind once, so the field holds each exactly a thousand times)
function field(x0, z0) {
  let s = 0x9E3779B9; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const units = []; for (let a = 1; a < KINDS; a++) if (a % 2 && a % 5) units.push(a);
  const size = Float32Array.from({ length: KINDS }, () => 1.2 + 3.3 * rnd() ** 2);
  const N = SIDE * SIDE, X = new Float32Array(N), Z = new Float32Array(N), K = new Uint16Array(N), S = new Float32Array(N), packed = new Float32Array(N * 4);
  for (let iz = 0, i = 0; iz < SIDE; iz++) {
    const a = units[Math.floor(rnd() * units.length)], b = Math.floor(rnd() * KINDS);
    for (let ix = 0; ix < SIDE; ix++, i++) {
      const k = (ix * a + b) % KINDS, q = Math.round(((Math.min(SMAX, Math.max(SMIN, size[k] * (0.8 + 0.4 * rnd()))) - SMIN) / (SMAX - SMIN)) * 255);
      X[i] = x0 + (ix + 0.1 + 0.8 * rnd()) * CELL; Z[i] = z0 + (iz + 0.1 + 0.8 * rnd()) * CELL; K[i] = k; S[i] = SMIN + (q / 255) * (SMAX - SMIN);
      packed[i * 4] = X[i]; packed[i * 4 + 1] = Z[i]; packed[i * 4 + 3] = k * 16384 + Math.floor(rnd() * 64) * 256 + q;   // (its kind, its turn, its size: whole numbers a float holds exactly)
    }
  }
  return { X, Z, K, S, packed };
}

export function createStress(scene, renderer) {
  const t = PLACES.tent ?? { x: 0, z: 0 }, I0 = Math.round(t.x / CELL) - SIDE / 2, J0 = Math.round(t.z / CELL) - SIDE / 2, x0 = I0 * CELL, z0 = J0 * CELL;
  const F = field(x0, z0), list = instancedArray(F.packed, 'vec4');
  // the ground under each, worked out once on the GPU
  renderer.compute(Fn(() => { const e = list.element(instanceIndex); e.assign(vec4(e.x, e.y, groundAt(e.xy, float(0)), e.w)); })().compute(SIDE * SIDE));

  const H = createHeap(KINDS, LEVELS.map((l) => { const n = l.n === FULLN ? FULL : l.n; return { idx: trisOf(n) * 3, verts: vertsOf(n), slots: l.slots }; }));
  const LO = uniformArray(LEVELS.map((l) => l.px));
  const vWorld = varyingProperty('vec3', 'sWorld'), vN = varyingProperty('vec3', 'sN'), vCol = varyingProperty('vec3', 'sCol'), vLit = varyingProperty('float', 'sLit');

  const tiers = [];
  // a tier: level i of every kind; shadow: all of it round the camera, whatever its size on screen, for the light only
  const tier = (i, shadow = false) => {
    const Lv = { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity }, P = shadow ? 8 : LEVELS[i].P;
    const band = { near: uniform(0), far: uniform(1), ...bandOf(Lv, FADE, padOf(CELL, P)) }, reach = uniform(SMAX / 2 + (CELL * P) / 16 + 2);
    const live = (c) => {
      const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), ix = c.x.sub(I0), iz = c.y.sub(J0);
      If(ix.greaterThanEqual(0).and(ix.lessThan(SIDE)).and(iz.greaterThanEqual(0)).and(iz.lessThan(SIDE)), () => {
        const E = list.element(uint(iz.mul(SIDE).add(ix))), pos = E.xy, dist = camDist(pos), range = shadow ? length(pos.sub(U.uCam.xz)) : dist;
        const there = range.lessThan(band.far).and(range.greaterThanEqual(band.near));
        If(shadow ? there : there.and(inView(pos, reach, SMAX)), () => {
          const q = uint(E.w), kind = q.shiftRight(uint(14)), size = float(q.bitAnd(uint(255))).mul((SMAX - SMIN) / 255).add(SMIN), span = size.mul(PXK);
          // of this level: it is there (heap.js), and the thing is the size on screen the level is drawn at, or larger
          // while its next finer level has not come
          const R = heapRow(H, kind, uint(i)), has = R.z.greaterThan(uint(0));
          const finer = dist.greaterThanEqual(span.mul(band.from).sub(band.pad)), near = i ? finer.or(R.w.shiftRight(uint(i - 1)).bitAnd(uint(1)).equal(uint(0))) : finer;
          If(shadow ? has : has.and(dist.lessThan(span.mul(band.to).add(band.pad))).and(near), () => {
            A.assign(vec4(pos, E.z.sub(size.mul(0.06)), size));
            B.assign(vec4(float(q.shiftRight(uint(8)).bitAnd(uint(63))).mul(6.2831853 / 64), float(kind), i === L - 1 ? float(H.verts.element(R.y).w) : float(0), 0));   // (its dot: its colour with it, so its draw reads no mesh)
            alive.assign(1);
          });
        });
      });
      return { alive: alive.greaterThan(0.5), data: [A, B] };
    };
    const material = (src) => {
      const lv = uniform(i, 'uint'), whole = uniform(shadow ? 1 : 0), m = new THREE.NodeMaterial();   // its level as numbers: every level is one shader
      m.vertexNode = Fn(() => {
        const A = src.read(0), B = src.read(1), clip = offScreen().toVar();
        const px = A.w.mul(PXK).div(max(camDist(A.xy), 1e-3));   // its size on screen now
        vLit.assign(0);
        If(lv.equal(uint(L - 1)), () => {
          // its dot: a pixel or two of it, so one triangle turned to the eye, as large on screen as the thing, in its
          // mean colour (which its packing brought: it reads nothing of the heap; lit at its pixel, by the clouds' shadow
          // only: the sun's shadow map does not reach it), sinking away under a pixel
          const sunk = smoothstep(LEVELS[L - 1].px, LEVELS[L - 1].px * SINK, px);
          If(px.lessThanEqual(LO.element(L - 2)).and(sunk.greaterThan(0)), () => {
            const V = cameraViewMatrix, right = vec3(V.element(0).x, V.element(1).x, V.element(2).x), up = vec3(V.element(0).y, V.element(1).y, V.element(2).y);
            const r = A.w.mul(0.5).mul(sunk), i = float(vertexIndex), c = uint(B.z), b8 = (sh) => float(c.shiftRight(uint(sh)).bitAnd(uint(255))).div(255);
            const w = vec3(A.x, A.z.add(A.w.mul(0.35)), A.y).add(right.mul(i.lessThan(0.5).select(float(-1), i.lessThan(1.5).select(float(1), float(0)))).mul(r)).add(up.mul(i.greaterThan(1.5).select(float(1.3), float(-0.5))).mul(r));
            vWorld.assign(w); vN.assign(normalize(normalize(U.uCam.sub(w)).add(vec3(0, 1, 0)))); vCol.assign(vec3(b8(0), b8(8), b8(16))); vLit.assign(1);
            clip.assign(clipOf(w));
          });
        }).Else(() => {
          // a mesh of the heap: the level its size asks for, and whether this one is drawn for it (heap.js: effective)
          const R = heapRow(H, uint(B.y), lv).toVar(), want = uint(0).toVar();
          for (let j = 0; j < L - 1; j++) want.addAssign(px.lessThanEqual(LO.element(j)).select(uint(1), uint(0)));
          If(vertexIndex.lessThan(R.z).and(whole.greaterThan(0.5).or(effective(R.w, want, lv))), () => {
            const v = heapVertex(H, R, vertexIndex), cs = cos(B.x), sn = sin(B.x), turn = (p) => vec3(p.x.mul(cs).sub(p.z.mul(sn)), p.y, p.x.mul(sn).add(p.z.mul(cs)));
            const k = whole.greaterThan(0.5).select(float(SHADE.shrink), float(1)), p = v.p.sub(vec3(0, 0.4, 0)).mul(k).add(vec3(0, 0.4, 0));
            const w = vec3(A.x, A.z, A.y).add(turn(p.mul(A.w)));
            vWorld.assign(w); vN.assign(turn(v.n)); vCol.assign(v.c);
            clip.assign(clipOf(w));
          });
        });
        return clip;
      })();
      m.fragmentNode = Fn(() => {
        const out = vec4(0).toVar();
        If(unlit().not(), () => {   // (into the shadow map: only its depth)
          const n = normalize(vN), c = vCol.mul(vCol), sun = float(1).toVar();
          If(vLit.greaterThan(0.5), () => { sun.assign(sunDim().mul(cloudShade(vWorld))); }).Else(() => { sun.assign(cloudAtOne(vWorld)); });
          out.assign(finish(c.mul(skyLight(n).add(U.uSun.mul(sun).mul(max(n.dot(U.uSunDir), 0)))), vWorld));
        });
        return out;
      })();
      return m;
    };
    const count = trisOf(LEVELS[i].n === FULLN ? FULL : LEVELS[i].n) * 3, g = new THREE.InstancedBufferGeometry();
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: count }, (_, j) => j), 1));   // (a draw as long as the level's longest mesh: its vertices are read from the heap by their number)
    const T = new Tier(scene, g, material, { cell: CELL, P, near: 0, far: 1, order: 1, live, gpu: true, cap: shadow ? 4096 : LEVELS[i].cap, slots: 2, ...(shadow ? { cull: SHADE.reach, fixed: SHADE.far * SHADE.wide } : {}) });
    T.bounds = [x0, z0, x0 + SIDE * CELL, z0 + SIDE * CELL];
    T.band = shadow ? () => { T.near = 0; T.far = SHADE.far; band.near.value = -1; band.far.value = SHADE.far * SHADE.wide; }
      : () => {
        [T.near, T.far] = band.reach(SMIN, SMAX, pxK()); if (i <= STREAMED) T.near = 0;   // (a level may stand in for the finer ones, right up to the camera)
        band.near.value = T.near > 0 ? T.near : -1; band.far.value = T.far;
      };
    T.band(); T.level = i; T.viewKeyed = !shadow; T.asset = shadow ? 'Stress: shadows' : `Stress: level ${i}`;
    if (shadow) T.mesh.layers.set(1);
    const run = T.run.bind(T); T.run = (r, world, ...a) => run(r, `${world}|${H.versions[i]}|${i && !shadow ? H.versions[i - 1] : 0}`, ...a);   // packed again when the heap has changed at its level, or the next finer (which it stands in for)
    tiers.push(T);
    return T;
  };
  for (let i = 0; i < L; i++) tier(i);
  tier(SHADE.level, true);
  addEventListener('resize', () => tiers.forEach((T) => T.band()));

  // ---- the meshes: built in workers, the coarse levels of every kind at once, the fine ones as the camera comes near ----
  const workers = Array.from({ length: 3 }, () => new Worker(new URL('./blob.worker.js', import.meta.url), { type: 'module' })), waiting = new Map(), done = [];
  let nextId = 0, turn = 0, busy = 0;
  const ask = (jobs) => new Promise((res) => { const id = nextId++; waiting.set(id, res); workers[turn++ % workers.length].postMessage({ id, jobs }); });
  for (const w of workers) w.onmessage = ({ data }) => { waiting.get(data.id)(data.out); waiting.delete(data.id); };
  const stats = { coarseMs: 0, built: 0, put: 0, full: 0 }, t0 = performance.now();
  let coarse = 0;
  for (let k = 0; k < KINDS; k += 40) {
    const jobs = []; for (let j = k; j < Math.min(KINDS, k + 40); j++) for (let l = STREAMED; l < L; l++) jobs.push([j, l]);
    ask(jobs.map(([j, l]) => [j, LEVELS[l].n])).then((out) => { out.forEach((mesh, n) => H.put(jobs[n][0], jobs[n][1], mesh, 0)); coarse += 40; if (coarse >= KINDS) stats.coarseMs = Math.round(performance.now() - t0); });
  }
  const wantAt = new Int32Array(KINDS * L); let speed = 0, lx = 0, ly = 0, lz = 0, lt = 0;   // wantAt: the round a kind's level was last wanted in; speed: the camera's, metres a second
  const pending = new Set(); let scanAt = -1e9, sx = 1e9, sz = 1e9, sk = '', round = 1;   // round: each look at what stands near; a level wanted in the last one is not put out
  // what is asked of the workers: a few at a time, the next as one comes back; of a level no more than it has room for
  let queue = []; const asked = new Int32Array(L);
  const feed = () => {
    while (busy < 6 && queue.length) {
      const { k, l } = queue.shift(), id = k * L + l;
      if (pending.has(id) || H.has(k, l) || H.room(l, round) <= asked[l]) continue;
      pending.add(id); busy++; asked[l]++;
      ask([[k, nOf(k, l)]]).then(([mesh]) => { busy--; stats.built++; if (!l) stats.full++; done.push({ k, l, mesh }); feed(); });
    }
  };
  // each frame: put in what the workers have built; and, when the camera has moved, ask for the fine levels of what now
  // stands near (coarser first: quick to build, and something to draw meanwhile), nearest first
  const pump = () => {
    const now = performance.now(), cam = U.uCam.value, dy = U.uDy.value, inv = U.uLodInv.value, K = pxK(), key = `${inv.toFixed(2)}|${K.toFixed(0)}`;
    if (API.pause) return;
    const dt = Math.max(1e-3, (now - lt) / 1000), v = Math.hypot(cam.x - lx, cam.y - ly, cam.z - lz) / dt; lx = cam.x; ly = cam.y; lz = cam.z; lt = now;
    speed += (Math.min(v, 300) - speed) * Math.min(1, dt * 4);
    for (let sent = 0; done.length && sent < 700000;) { const d = done.shift(), id = d.k * L + d.l; pending.delete(id); asked[d.l]--; if (wantAt[id] < round - 1) continue; sent += d.mesh.index.length; if (H.put(d.k, d.l, d.mesh, round, round)) stats.put++; }   // (a frame sends the GPU one full mesh at most, or many small ones)
    if (Math.hypot(cam.x - sx, cam.z - sz) < 0.7 && key === sk && now - scanAt < 300) return;
    sx = cam.x; sz = cam.z; sk = key; scanAt = now; round++;
    const R = (SMAX * K * 1.2) / (LEVELS[STREAMED - 1].px * inv), R2 = R * R - dy * dy; if (R2 <= 0) return;   // (as far as the coarsest of the fine levels is asked for, and a fifth)
    const r = Math.sqrt(R2), a0 = Math.max(0, Math.floor((cam.x - r - x0) / CELL)), a1 = Math.min(SIDE - 1, Math.floor((cam.x + r - x0) / CELL)), b0 = Math.max(0, Math.floor((cam.z - r - z0) / CELL)), b1 = Math.min(SIDE - 1, Math.floor((cam.z + r - z0) / CELL));
    const asks = [], ahead = speed * 0.35;
    for (let iz = b0; iz <= b1; iz++) for (let ix = a0; ix <= a1; ix++) {
      // its size on screen now (and a fifth: asked for a little early); and as it will be when a mesh asked for now has
      // come (`ahead`: the camera travelling, a fine level it will have passed by then is not asked for)
      const i = iz * SIDE + ix, k = F.K[i], d = Math.hypot(F.X[i] - cam.x, F.Z[i] - cam.z, dy), px = (F.S[i] * K * 1.2) / Math.max(1e-3, d * inv), then = (F.S[i] * K * 1.2) / ((d + ahead) * inv);
      for (let l = STREAMED - 1; l >= 0 && px > LEVELS[l].px; l--) {
        if (H.has(k, l)) { H.touch(k, l, round); wantAt[k * L + l] = round; }
        else if (then > LEVELS[l].px) { wantAt[k * L + l] = round; if (!pending.has(k * L + l)) asks.push({ k, l, px }); }
      }
    }
    queue = asks.sort((p, q) => q.l - p.l || q.px - p.px); feed();
  };
  tiers.solid = pump;

  // for looking at it (window.__stress): how many stand and of how many kinds; what each level holds and draws now
  const API = (window.__stress = {
    heap: H, tiers, stats, levels: LEVELS, field: F, pause: false,
    census() { const n = new Uint32Array(KINDS); for (const k of F.K) n[k]++; return { placed: F.K.length, kinds: n.filter(Boolean).length, least: Math.min(...n), most: Math.max(...n) }; },
    async counts() {
      const out = [];
      for (const T of tiers) {
        const [{ count, data }] = await T.read(renderer), full = LEVELS[T.level].n === FULLN; let tris = 0;
        if (full) for (let j = 0; j < count; j++) tris += trisOf(fullOf(data[1][j * 4 + 1])); else tris = count * trisOf(LEVELS[T.level].n);
        out.push({ tier: T.asset, packed: count, tris, patches: T.n, over: T.over });
      }
      return { tiers: out, held: H.held(), pending: pending.size, ...stats, heapMB: +(H.bytes / 1048576).toFixed(1) };
    },
  });
  return tiers;
}

/** A scatter engine (src/scatter/index.js finds it): it places no asset of the library, only its own, and only when asked. */
export const engine = {
  id: 'stress',
  createOwn: (scene, tex, ground, gpu, renderer) => (gpu && new URLSearchParams(location.search).has('stress') ? createStress(scene, renderer) : []),
};
