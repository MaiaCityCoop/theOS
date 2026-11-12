// Stones and rock outcrops: a few rock shapes (cut, displaced icospheres at three levels of detail), instanced by
// hashed cells around the camera. Which cell holds a rock, how big, how it lies: hashed. Its look (texture, moss, relief,
// tint) from its asset file (assets/stone.js, boulder.js); its level of detail by its size on screen (src/detail).
import * as THREE from 'three/webgpu';
import { Fn, float, uint, vec2, vec3, vec4, uniform, varyingProperty, attribute, positionGeometry, positionWorld, normalWorld, If, Discard, abs, max, mix, smoothstep, pow, normalize, length, floor, cross, dot, cos, sin } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, camDist, riverInfo, heightAt, outcropMask, grassTint, biomesAt } from '../world/land.nodes.js';
import { finish, skyLight, weathered, snowLift, cloudAt, detailCut, detailKeep, unlit } from '../world/light.js';
import { pxK } from '../detail/index.js';
import { Tier, offScreen, clipOf, MAXP } from './tier.js';
import rockMaterial0 from '../../materials/rock.js';
import meadow from '../../materials/meadow.js';

// ---- shapes ----
function hash3(x, y, z, s) {
  let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ Math.imul(z, 0xC2B2AE3D) ^ Math.imul(s, 0x27D4EB2F);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return (h >>> 8) / 16777216;
}
function noise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t, h = (a, b, c) => hash3(ix + a, iy + b, iz + c, s);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy), l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
function icosphere(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const norm = () => { for (let i = 0; i < v.length; i += 3) { const l = Math.hypot(v[i], v[i + 1], v[i + 2]); v[i] /= l; v[i + 1] /= l; v[i + 2] /= l; } };
  norm();
  for (let d = 0; d < detail; d++) {
    const mid = new Map(), nf = [];
    const m = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      if (!mid.has(k)) { mid.set(k, v.length / 3); v.push((v[a * 3] + v[b * 3]) / 2, (v[a * 3 + 1] + v[b * 3 + 1]) / 2, (v[a * 3 + 2] + v[b * 3 + 2]) / 2); }
      return mid.get(k);
    };
    for (let i = 0; i < f.length; i += 3) { const a = f[i], b = f[i + 1], c = f[i + 2], ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca); }
    f = nf; norm();
  }
  return { v, f };
}
// look: { cuts (0..1, how many flat faces are broken off it), smooth (0..1, how worn round it is) }
/** a rock's shape: a cut, displaced icosphere of `detail` divisions, as a geometry for instancing */
export function rockGeometry(detail, seed, look = {}) {
  const { v, f } = icosphere(detail), n = v.length / 3, sm = 1 - 0.75 * (look.smooth ?? 0);
  const cuts = [];
  for (let k = 0; k < Math.round(7 * (look.cuts ?? 1)); k++) {
    let x = hash3(k, 1, 0, seed) - 0.5, y = hash3(k, 2, 0, seed) - 0.5, z = hash3(k, 3, 0, seed) - 0.5; const l = Math.hypot(x, y, z);
    cuts.push([x / l, y / l, z / l, 0.62 + 0.3 * hash3(k, 4, 0, seed)]);
  }
  const P = (x, y, z, out, o) => {
    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    let r = 1 + 0.5 * (noise3(x * 1.4 + 9, y * 1.4, z * 1.4, seed) - 0.5) + sm * (0.22 * (noise3(x * 3.3, y * 3.3 + 5, z * 3.3, seed + 1) - 0.5) + 0.08 * (noise3(x * 8, y * 8, z * 8 + 3, seed + 2) - 0.5));
    for (const c of cuts) { const dt = x * c[0] + y * c[1] + z * c[2]; if (dt > 0.05) { const lim = c[3] / dt; if (lim < r) r = lim + (r - lim) * 0.12; } }
    out[o] = x * r; out[o + 1] = y * r; out[o + 2] = z * r;
  };
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), a = [0, 0, 0], b = [0, 0, 0], e = 0.02;
  for (let i = 0; i < n; i++) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
    P(x, y, z, pos, i * 3);
    // two tangents of the sphere at v
    let tx = -z, ty = 0, tz = x; if (Math.abs(y) > 0.9) { tx = 0; ty = -z; tz = y; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const ux = y * tz - z * ty, uy = z * tx - x * tz, uz = x * ty - y * tx;
    P(x + tx * e, y + ty * e, z + tz * e, a, 0); P(x + ux * e, y + uy * e, z + uz * e, b, 0);
    const ax = a[0] - pos[i * 3], ay = a[1] - pos[i * 3 + 1], az = a[2] - pos[i * 3 + 2], bx = b[0] - pos[i * 3], by = b[1] - pos[i * 3 + 1], bz = b[2] - pos[i * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * x + ny * y + nz * z < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const nl = Math.hypot(nx, ny, nz) || 1; nor[i * 3] = nx / nl; nor[i * 3 + 1] = ny / nl; nor[i * 3 + 2] = nz / nl;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(f);
  return g;
}


const rot = (v, a, cs, sn) => v.mul(cs).add(cross(a, v).mul(sn)).add(a.mul(dot(a, v)).mul(float(1).sub(cs)));

/** A rock's colour, lit: triplanar from its material, moss where it looks up (held back where it is dry), darker where
    it meets the ground. s: { world, n (its geometric normal), tint (the grass round it), arid, ly (its height, -1..1) }. */
function rockShade(tex, row, s, eye = U.uCam) {
  const look = row.look || {}, id = look.material || rockMaterial0.uid, moss0 = look.moss ?? 1, relief = look.relief ?? 1.1, tintR = vec3(...(look.tint || [1, 1, 1]));
  const N0 = normalize(s.n), b0 = pow(abs(N0), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z)), q = s.world.div(row.texture);
  const a = tex.a(id, q.zy).mul(b.x).add(tex.a(id, q.xz).mul(b.y)).add(tex.a(id, q.xy).mul(b.z));
  const tx = tex.n(id, q.zy).xy.mul(2).sub(1), ty = tex.n(id, q.xz).xy.mul(2).sub(1), tz = tex.n(id, q.xy).xy.mul(2).sub(1);
  const n = normalize(N0.add(vec3(0, tx.y, tx.x).mul(b.x).add(vec3(ty.x, 0, ty.y).mul(b.y)).add(vec3(tz.x, tz.y, 0).mul(b.z)).mul(relief)));
  const mt = tex.a(meadow, q.xz.mul(1.7));   // the moss: the meadow's floor
  const moss = smoothstep(0.45, 0.8, N0.y.mul(0.75).add(a.a.sub(0.5).mul(0.7)).add(mt.a.sub(0.5).mul(0.5))).mul(float(1).sub(s.arid.mul(0.85))).mul(Math.min(moss0, 1));
  const c1 = mix(a.rgb.mul(a.rgb).mul(tintR), s.tint.mul(0.75).mul(mt.a.add(0.5)), moss.mul(0.9 * Math.min(moss0 * 1.5, 1)));
  const c2 = weathered(c1.mul(mix(0.45, 1, smoothstep(-0.25, 0.35, s.ly))), n, snowLift(s.world, row.snow?.clumps ?? 0.05));   // as its kind holds snow (assets/kinds.js)
  const V = normalize(eye.sub(s.world));
  const col = c2.mul(skyLight(n).add(U.uSun.mul(cloudAt(s.world)).mul(max(n.dot(U.uSunDir), 0)))).add(U.uSun.mul(pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 30)).mul(0.06).mul(float(1).sub(moss)));
  return finish(col, s.world, eye);
}

const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));

// what lies in a cell: a rock of this shape and level, or nothing. Its place, the ground under it, its size, its turn,
// the grass's colour round it (for its moss) and its share of the hand-over between levels; packed into four vec4 (A: x,
// z, its base's height, its size; B: the axis it is turned about, the angle; C: the grass's colour, the dryness; D: its
// three scales, its share and side packed). Done once per rock (src/scatter/tier.js).
function rockIn(c, tex, ground, row, Lv, band) {
  const big = !!row.outcrops, fade = row.detail.fade, cx = c.x, cy = c.y;
  const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), C = vec4(0).toVar(), D = vec4(0).toVar();
  const bucket = floor(rnd(cx, cy, uint(201)).mul(row.shapes));   // which of its shapes lies here
  {
    const pos = vec2(c).add(0.15).add(vec2(rnd(cx, cy, uint(202)), rnd(cx, cy, uint(203))).mul(0.7)).mul(row.cell), dist = camDist(pos);
    If(dist.lessThan(band.far).and(dist.greaterThanEqual(band.near)), () => {
      const ar = float(0).toVar(), oc = float(0).toVar(), y = float(0).toVar(), tint = vec3(0).toVar(), ok = float(0).toVar(), r0 = rnd(cx, cy, uint(200));
      if (big) {   // outcrops: the land worked out here (the ground pass does not reach so far)
        oc.assign(outcropMask(pos));
        If(r0.lessThanEqual(oc.mul(0.6).add(0.012)), () => {   // the cheap test first: most cells hold no rock
          const I = riverInfo(pos), w = I.y, d = abs(I.x);
          If(r0.lessThanEqual(oc.mul(0.6).add(0.012).mul(smoothstep(w.add(2), w.add(9), d))), () => {
            ar.assign(biomesAt({ p: pos, dist, d, w, b: I.z }).dry); y.assign(heightAt(pos, dist, d, w, I.z)); tint.assign(grassTint(tex, pos, ar, 0).rgb); ok.assign(1);
          });
        });
      } else {
        const G = ground.A(pos);
        If(r0.lessThanEqual(G.w.mul(0.7)), () => { const t = ground.tint(pos); ar.assign(t.a); y.assign(G.x); tint.assign(t.rgb); ok.assign(1); });
      }
      If(ok.greaterThan(0.5), () => {
        const r1 = rnd(cx, cy, uint(204)), r2 = rnd(cx, cy, uint(205)), r3 = rnd(cx, cy, uint(206)), r4 = rnd(cx, cy, uint(207));
        const s = mix(row.size[0], row.size[1], r1.mul(r1).mul(r1).add(oc.mul(big ? 0.25 : 0).mul(r1)));
        const keep = detailKeep(s.mul(2).mul(PXK).div(max(dist, 1e-3)), Lv.lo, Lv.hi, fade);   // its size on screen picks the level, with a hand-over
        If(keep.x.greaterThan(0), () => {
          const ax = normalize(vec3(rnd(cx, cy, uint(208)), rnd(cx, cy, uint(209)), rnd(cx, cy, uint(210))).sub(0.5).add(1e-4));
          A.assign(vec4(pos, y.sub(s.mul(0.22)), s)); B.assign(vec4(ax, rnd(cx, cy, uint(211)).mul(6.2831853))); C.assign(vec4(tint, ar));
          D.assign(vec4(vec3(r2.mul(0.5).add(0.8), r3.mul(0.4).add(0.55), r4.mul(0.5).add(0.8)).mul(s), keep.x.add(keep.y.mul(2))));
          alive.assign(1);
        });
      });
    });
  }
  return { alive: alive.greaterThan(0.5), data: [A, B, C, D], bucket };
}

// the rock's material: shape(A, B, C, D) its vertex from what rockIn packed, and its light
function rockMaterial(tex, row) {
  return () => {
    const vWorld = varyingProperty('vec3', 'vWorld'), vN = varyingProperty('vec3', 'vN'), vTint = varyingProperty('vec3', 'vTint'), vAL = varyingProperty('vec2', 'vAL'), vKeep = varyingProperty('vec2', 'vKeep');
    const shape = (A, B, C, D) => {
      const scl = D.xyz, ax = B.xyz, cs = cos(B.w), sn = sin(B.w), l = rot(positionGeometry.mul(scl), ax, cs, sn), side = floor(D.w.mul(0.5));
      const w = vec3(A.x, A.z, A.y).add(l);
      vN.assign(rot(normalize(attribute('normal', 'vec3').div(scl)), ax, cs, sn)); vWorld.assign(w); vTint.assign(C.rgb); vAL.assign(vec2(C.w, l.y.div(A.w))); vKeep.assign(vec2(D.w.sub(side.mul(2)), side));
      return clipOf(w);
    };
    const frag = Fn(() => {
      If(detailCut(vKeep), () => { Discard(); });   // its share of a hand-over between levels
      const out = vec4(0).toVar();
      If(unlit().not(), () => { out.assign(rockShade(tex, row, { world: vWorld, n: vN, tint: vTint, arid: vAL.x, ly: vAL.y })); });   // drawn into the shadow map: only its depth counts
      return out;
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag();
    return { m, shape };
  };
}

/** One rock on its own, in the world's rock material (its texture, its moss), for the asset library's stage and list.
    Its `eye` uniform is the camera it is lit and hazed for (a list's picture sets its own). */
export function rockSample(tex, row, detail = 2, shape = 0) {
  const g = rockGeometry(detail, row.seed + shape * 7, row.look), plain = new THREE.BufferGeometry();
  plain.setAttribute('position', g.attributes.position); plain.setAttribute('normal', g.attributes.normal); plain.setIndex(g.index);
  const m = new THREE.NodeMaterial(), eye = uniform(U.uCam.value);
  m.fragmentNode = Fn(() => rockShade(tex, row, { world: positionWorld, n: normalWorld, tint: vec3(0.05, 0.13, 0.02), arid: float(0), ly: positionGeometry.y }, eye))();
  m.eye = eye;
  const mesh = new THREE.Mesh(plain, m); mesh.layers.enable(1); return mesh;
}

/** The assets of kind `rocks`: a tier per level of detail, its shapes buckets of it. Each level is drawn where a rock of it is the size
    on screen its asset file asks (src/detail); the tier looks only at the cells where that can be, at this screen size. */
export function createRocks(scene, tex, ground, row, gpu = false) {
  const tiers = [], levels = row.detail.levels.filter((l) => !l.impostor), { fade } = row.detail;
  const span = [2 * row.size[0], 2 * row.size[1] * (row.outcrops ? 1.25 : 1)];   // a rock is an icosphere of radius 1 times its size
  const make = rockMaterial(tex, row);
  for (const Lv of levels) {   // a tier per level, its shapes buckets of it: the cells worked out once (tier.js)
    const band = { near: uniform(0), far: uniform(1) }, live = (c) => rockIn(c, tex, ground, row, Lv, band);
    const material = (src, k) => {
      const { m, shape } = make();
      m.vertexNode = src.read ? Fn(() => shape(src.read(0), src.read(1), src.read(2), src.read(3)))()   // ready-made by the compute pass
        : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive.and(L.bucket.equal(float(k))), () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out here, per vertex
      return m;
    };
    const geos = Array.from({ length: row.shapes }, (_, v) => rockGeometry(Lv.rock, row.seed + v * 7, row.look));
    const t = new Tier(scene, geos, material, { cell: row.cell, P: Lv.P, near: 0, far: 1, order: 1, live, gpu, cap: Math.ceil(MAXP * Lv.P * Lv.P * 0.3), slots: 4 });
    t.band = () => {   // the distances where a rock of this level can be, from the largest seen small to the smallest seen large
      const K = pxK(), e = Math.exp(fade);
      t.near = Number.isFinite(Lv.hi) ? (span[0] * K) / (Lv.hi * e) : 0; t.far = (span[1] * K * e) / Lv.lo;
      band.near.value = t.near > 0 ? t.near : -1; band.far.value = t.far;
    };
    t.band(); if (row.detail.casts) t.meshes.forEach((m) => m.layers.enable(1)); tiers.push(t);   // rocks cast shadows, as drawn (src/world/shadow.js)
  }
  addEventListener('resize', () => tiers.forEach((t) => t.band()));
  return tiers;
}

/** A scatter engine (src/scatter/index.js finds it): what an asset's placement.engine 'rocks' names. */
export const engine = { id: 'rocks', create: createRocks };
