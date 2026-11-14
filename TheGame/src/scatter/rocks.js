// Stones and rock outcrops: where they lie. Which cell holds a rock, which of its asset's shapes, how large, how it is
// turned: hashed, on the GPU, for the cells a tier looks at. Nothing else of a rock is here:
//   - its shape at every level is its kit's (assets/kit/rock.js), brought to the heap by its asset's family
//     (assets/zoo/boulders.js, stones.js: a family a rock asset, found by itself);
//   - how it is drawn is the one drawer's (drawer.js), as for everything the heap holds: its level by its size on
//     screen (the ladder's eight, a full mesh of 110 000 triangles to a dot), each level turning into the next, the
//     world's material it wears, the moss on what of it faces up, its snow, its light.
// Until 2026-11-14 a rock was a cut icosphere of 20 to 1280 triangles with a shader of its own, four levels that
// changed over whole and an end at six pixels.
import * as THREE from 'three/webgpu';
import { Fn, If, float, uint, vec2, vec3, vec4, uniform, attribute, positionWorld, normalWorld, abs, max, mix, floor, smoothstep, pow, normalize } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, camDist, riverInfo, heightAt, outcropMask, grassTint, biomesAt } from '../world/land.nodes.js';
import { offWays } from '../world/ways.js';
import { finish, skyLight, weathered, snowLift, cloudAt } from '../world/light.js';
import { byRole } from '../core/registry.js';
import { scatterRow } from '../../assets/index.js';
import { pxK, most } from '../detail/index.js';
import { createDrawer } from './drawer.js';
import { LADDER } from '../../assets/kit/ladder.js';
import { placedBy, lookOf as zooLook, fingerprint } from '../../assets/zoo/index.js';
import { rockMesh, rockBody, FULL_ROCK } from '../../assets/kit/rock.js';
import { unpackSolid } from '../../assets/kit/solid.js';
import { rocksAround, rocksDrawn } from '../world/rocksolid.js';

// the levels: the ladder's (assets/kit/ladder.js). Every shape's coarser levels are always there (a few megabytes);
// the full meshes only of the shapes that lie near enough to fill a good part of the screen, six at once
const LEVELS = LADDER.map((l, i) => ({ n: l.n, px: l.px, ...(i ? {} : { slots: 6 }) })), L = LEVELS.length;
// RELIEF: the size on screen from which a rock's relief is read (under that its texture's mipmaps have none left);
// REACH: how far the ground's map says where stones lie (src/scatter/ground.js), metres to the 68° lens: they shrink
// away before it ends
const SHADE = { shrink: 0.85, far: 30, wide: 1.5 }, RELIEF = 10, REACH = 104;

/** The assets of engine `rocks`, all at once: they share one drawer (a level of every shape of every rock asset is in
    one heap), each asset a tier a level over its own cells. */
export function createRocks(scene, tex, ground, rows, gpu, renderer) {
  const Z = placedBy('rocks'), famOf = (row) => Z.families.find((F) => F.F.asset === row.uid);
  // (without WebGPU nothing of the heap can be drawn: no rocks there, and none to walk into)
  rows = gpu ? rows.filter((row) => famOf(row) || console.warn(`rocks: no family of the zoo brings the shapes of '${row.name}' (assets/zoo)`)) : [];
  rocksDrawn(rows.map((row) => row.uid));
  if (!rows.length) return [];
  const PXK = uniform(pxK()), SMOOTH = uniform(1);
  const D = createDrawer(scene, renderer, tex, {
    name: 'rocks', LEVELS, SHADE, SMOOTH, PXK, skins: 0, ground: true, soft: true, relief: RELIEF, full: FULL_ROCK,
    zoo: { first: Z.first, ALL: Z.count, STAND: Z.count, MOVING: 0, lookOfKind: (k) => { const B = zooLook(Z.first + k); return { ...B, material: B.material ?? byRole('rock').uid }; }, fingerprint: () => fingerprint('rocks') },
  });
  const { lookOf } = D, tiers = [], firstOf = new Map(); let sizeMost = 0;
  for (const row of rows) {
    const F = famOf(row), big = !!row.outcrops, shapes = F.count, spans = Array.from({ length: shapes }, (_, v) => rockBody(row.asset, v).span);
    // (a rock's size on screen is its largest side's: its asset's size times its shape's span)
    const sizes = [row.size[0] * Math.min(...spans), row.size[1] * (big ? 1.25 : 1) * Math.max(...spans)], reach = big ? Infinity : REACH, end = row.asset.detail?.end ?? 0;   // (end: the size on screen its asset is drawn down to, where that is sooner than the ladder's end)
    firstOf.set(row.uid, F.first); sizeMost = Math.max(sizeMost, sizes[1]);
    // what lies in a cell: a rock of one of the asset's shapes, or nothing. The cheap tests first (most cells hold
    // none); the ground under it and the grass round it only for a rock that is of the tier's level (fill)
    const place = (c, { band }, found) => {
      const cx = c.x, cy = c.y, pos = vec2(c).add(0.15).add(vec2(rnd(cx, cy, uint(202)), rnd(cx, cy, uint(203))).mul(0.7)).mul(row.cell), dist = camDist(pos);
      const thing = (oc, I, GA) => {
        const r1 = rnd(cx, cy, uint(204)), s = mix(row.size[0], row.size[1], r1.mul(r1).mul(r1).add(oc.mul(big ? 0.25 : 0).mul(r1)));
        const kind = uint(floor(rnd(cx, cy, uint(201)).mul(shapes)).min(shapes - 1)).add(uint(F.first)), span = lookOf(kind, 3).w;
        // (its size: its asset's times its shape's; a stone shrinks away where the ground's map ends, and whatever
        // ends sooner than the ladder does over its last pixels)
        const full = big ? s.mul(span) : s.mul(span).mul(float(1).sub(smoothstep(REACH * 0.86, REACH, dist)));
        const size = end ? full.mul(smoothstep(end, end * 1.6, full.mul(PXK).div(max(dist, 1e-3)))) : full;
        found(kind, size, dist, (A, B, G) => {
          const sunk = size.mul(lookOf(kind, 5).w);   // (how deep it lies: its look's)
          if (big) {   // an outcrop: the land worked out here (the ground's map does not reach so far)
            const d = abs(I.x), w = I.y, dry = biomesAt({ p: pos, dist, d, w, b: I.z }).dry;
            A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(sunk), size)); G.assign(vec4(grassTint(tex, pos, dry, 0).rgb, dry));
          } else { A.assign(vec4(pos, GA.x.sub(sunk), size)); G.assign(ground.tint(pos)); }
          B.assign(vec4(rnd(cx, cy, uint(211)).mul(6.2831853), float(kind), 0, 0));   // (its turn, its kind; it does not sway)
        });
      };
      If(dist.lessThan(band.far).and(dist.greaterThanEqual(band.near)), () => {
        const r0 = rnd(cx, cy, uint(200));
        if (big) {
          const oc = outcropMask(pos).toVar();
          If(r0.lessThanEqual(oc.mul(0.6).add(0.012)), () => {
            const I = riverInfo(pos).toVar();   // (none in the river, none on a way: src/world/ways.js)
            If(r0.lessThanEqual(offWays(oc.mul(0.6).add(0.012).mul(smoothstep(I.y.add(2), I.y.add(9), abs(I.x))), pos, 3)), () => { thing(oc, I, null); });
          });
        } else { const GA = ground.A(pos).toVar(); If(r0.lessThanEqual(GA.w.mul(0.7)), () => { thing(float(0), null, GA); }); }
      });
    };
    // one tier an asset: every rock dropped into the draw of its level (drawer.js: tierAll). last: the last level its
    // rocks have (an asset that ends sooner than the ladder has shrunk away before the ones after)
    const last = LEVELS.findIndex((l, i) => i === L - 1 || l.px <= end);
    // (its patches: about five to its reach, so the tier looks at a few dozen, whatever the lens; cap: the most of it in one draw)
    const farAt = Math.min(reach, (sizes[1] * pxK(Math.max(innerHeight, 1400))) / Math.max(end, LEVELS[last].px)), P = Math.min(64, Math.max(2, 2 ** Math.ceil(Math.log2(farAt / (row.cell * 5)))));
    const T = D.tierAll({ cell: row.cell, P, cap: big ? 16384 : 4096, sizes, place, casts: row.detail.casts, far: reach, last });
    T.asset = row.name; tiers.push(T);
  }
  addEventListener('resize', () => { PXK.value = pxK(); tiers.forEach((T) => T.band()); });
  // each frame: the coarse levels until they are in; and, when the camera has moved, the full meshes of the shapes
  // that lie near enough for them (the rocks round the camera, reckoned on the CPU as the GPU places them:
  // src/world/rocksolid.js)
  let scanAt = -1e9, sx = 1e9, sz = 1e9, sk = '', speed = 0, lx = 0, ly = 0, lz = 0, lt = 0;
  tiers.solid = () => {
    D.start();
    const now = performance.now(), cam = U.uCam.value, dy = U.uDy.value, inv = U.uLodInv.value, K = pxK(), key = `${inv.toFixed(2)}|${K.toFixed(0)}`;
    const dt = Math.max(1e-3, (now - lt) / 1000), v = Math.hypot(cam.x - lx, cam.y - ly, cam.z - lz) / dt; lx = cam.x; ly = cam.y; lz = cam.z; lt = now;
    speed += (Math.min(v, 300) - speed) * Math.min(1, dt * 4);
    if (Math.hypot(cam.x - sx, cam.z - sz) < 0.7 && key === sk && now - scanAt < 300) return;
    sx = cam.x; sz = cam.z; sk = key; scanAt = now;
    const N = D.near(K, inv, speed * 0.35), far = N.reach(sizeMost);
    if (far <= dy) { N.none(); return; }
    rocksAround(cam.x, cam.z, far, (r) => { if (firstOf.has(r.uid)) N.wants(firstOf.get(r.uid) + r.v, r.side, Math.hypot(r.x - cam.x, r.z - cam.z, dy), 0); });
    N.done();
  };
  // for looking at it (window.__rocks): what each tier packs now, what the heap holds
  window.__rocks = {
    drawer: D, tiers, levels: LEVELS, smooth: SMOOTH,
    /** How many rocks each asset draws at each level now, and what the heap holds. */
    async counts() { const out = {}; for (const T of tiers) { const B = await T.read(renderer), by = new Array(L).fill(0); B.forEach((b, k) => (by[T.draws[k].level] += b.count)); out[T.asset] = by.join(','); } return { ...out, held: D.H.held().join(','), ...D.stats, pending: D.pending.size }; },
  };
  return tiers;
}

// ---- the asset library's own rock (library.html): one on its own, for the list's picture and the stage. The shape is
// the world's (the kit's mesh at a level of the ladder); it is lit by a small material of its own here, with an eye of
// its own (a list's picture is taken by another camera), not by the drawer: still to come ----
/** A rock's colour, lit: its material from three sides, moss where it looks up (held back where it is dry), darker
    where it meets the ground. s: { world, n, tint (the grass round it), arid, dark (its shade, from its mesh) }. */
function rockShade(tex, row, s, eye = U.uCam) {
  const look = row.look || {}, id = look.material || byRole('rock').uid, moss0 = look.moss ?? 1, relief = look.relief ?? 1.1, tintR = vec3(...(look.tint || [1, 1, 1]));
  const N0 = normalize(s.n), b0 = pow(abs(N0), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z)), q = s.world.div(row.texture);
  const a = tex.a(id, q.zy).mul(b.x).add(tex.a(id, q.xz).mul(b.y)).add(tex.a(id, q.xy).mul(b.z));
  const tx = tex.n(id, q.zy).xy.mul(2).sub(1), ty = tex.n(id, q.xz).xy.mul(2).sub(1), tz = tex.n(id, q.xy).xy.mul(2).sub(1);
  const n = normalize(N0.add(vec3(0, tx.y, tx.x).mul(b.x).add(vec3(ty.x, 0, ty.y).mul(b.y)).add(vec3(tz.x, tz.y, 0).mul(b.z)).mul(relief)));
  const mt = tex.a(byRole('moss'), q.xz.mul(1.7));   // the moss: the material that plays it (the meadow's floor)
  const moss = smoothstep(0.45, 0.8, N0.y.mul(0.75).add(a.a.sub(0.5).mul(0.7)).add(mt.a.sub(0.5).mul(0.5))).mul(float(1).sub(s.arid.mul(0.85))).mul(Math.min(moss0, 1));
  const c1 = mix(a.rgb.mul(a.rgb).mul(tintR), s.tint.mul(0.75).mul(mt.a.add(0.5)), moss.mul(0.9 * Math.min(moss0 * 1.5, 1)));
  const c2 = weathered(c1.mul(s.dark), n, snowLift(s.world, row.snow.clumps));   // as its kind holds snow (assets/kinds.js)
  const V = normalize(eye.sub(s.world));
  const col = c2.mul(skyLight(n).add(U.uSun.mul(cloudAt(s.world)).mul(max(n.dot(U.uSunDir), 0)))).add(U.uSun.mul(pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 30)).mul(0.06).mul(float(1).sub(moss)));
  return finish(col, s.world, eye);
}
const GEOS = new Map();
// shape v of an asset at a level of the ladder, as a plain geometry (in its own frame: its foot at 0, its largest side 1)
function rockGeometry(asset, v, l) {
  const key = `${asset.uid}:${v}:${l}`; let g = GEOS.get(key); if (g) return g;
  const m = rockMesh(asset, v, l), n = m.verts.length / 4, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), shade = new Float32Array(n);
  for (let i = 0; i < n; i++) { const u = unpackSolid(m.verts, i * 4, 0); pos.set(u.p, i * 3); nor.set(u.n, i * 3); shade[i] = u.shade; }
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('shade', new THREE.BufferAttribute(shade, 1)); g.setIndex(new THREE.BufferAttribute(m.index, 1));
  GEOS.set(key, g); return g;
}
/** One rock on its own, in the world's rock material (its texture, its moss): shape `shape` of the asset at level
    `level` of the ladder. Its `eye` uniform is the camera it is lit and hazed for (a list's picture sets its own). */
export function rockSample(tex, row, level = 1, shape = 0) {
  const m = new THREE.NodeMaterial(), eye = uniform(U.uCam.value);
  m.fragmentNode = Fn(() => rockShade(tex, row, { world: positionWorld, n: normalWorld, tint: vec3(0.05, 0.13, 0.02), arid: float(0), dark: attribute('shade', 'float') }, eye))();
  m.eye = eye;
  const mesh = new THREE.Mesh(rockGeometry(row.asset, shape, Math.min(Math.max(level, 0), L - 2)), m); mesh.layers.enable(1); return mesh;
}

/** A scatter engine (src/scatter/index.js finds it): what an asset's placement.engine 'rocks' names. */
export const engine = {
  id: 'rocks',
  // what it reads of a rock's file, over the common row: where it lies (outcrops), its sizes, its look
  row: (a) => ({ ...scatterRow(a), outcrops: a.placement.outcrops, size: a.size.length, texture: a.placement.texture, shapes: a.placement.shapes, look: a.look }),
  createAll: createRocks,
  // the library: the largest of its kind for the list; on the stage a few, small to large, lying about the middle
  thumb(tex, row) {
    const a = row.asset, s = most(a.size.length), B = rockBody(a, 0), side = s * B.span, m = rockSample(tex, row, 1, 0); m.scale.setScalar(side); m.position.y = -side * 0.4;
    return { things: [m], eye: [s * 2.1, s * 2.0, s * 3.3], look: [0, -s * 0.05, 0] };
  },
  stage(tex, row, { x, z, heightAt: hAt, level = 0 }) {
    const a = row.asset, [lo, hi] = a.size.length, g = new THREE.Group(), shapes = a.placement.shapes ?? 1;
    for (let i = 0; i < 7; i++) {
      const k = i / 6, s = lo + (hi - lo) * k ** 1.6, t = i * 2.4, rr = i ? (hi * 0.7 + 0.4) * Math.sqrt(i) * 0.55 : 0, B = rockBody(a, i % shapes), side = s * B.span;
      const m = rockSample(tex, row, level, i % shapes), X = x + Math.cos(t) * rr, Z = z + Math.sin(t) * rr;   // as the world lays it: so much of it in the ground
      m.scale.setScalar(side); m.renderOrder = 1; m.position.set(X, hAt(X, Z) - B.sunk * side, Z); m.rotation.y = t * 1.7; g.add(m);   // drawn after the ground, as the world's own things are
    }
    return g;
  },
  frame: (a) => ({ height: most(a.size.height) * 0.5, dist: Math.max(4, most(a.size.length) * 4.5), pitch: 0.55, span: 2 * most(a.size.length) }),   // (a rock is about twice its size across)
};
