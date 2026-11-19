// Stones and rock outcrops: where they lie. Which cell holds a rock, which of its asset's shapes, how large, how it is
// turned: hashed, on the GPU, for the cells a tier looks at. Nothing else of a rock is here:
//   - its shape at every level is its kit's (assets/kit/rock.js), brought to the heap by its asset's family
//     (assets/zoo/scattered.js: a family a rock asset, found by itself);
//   - how it is drawn is the one drawer's (drawer.js), as for everything the heap holds: its clusters by the cut's rule
//     (cut.js: from its full mesh of 110 000 triangles to a few, each turning into its parent), the world's material it
//     wears, the moss on what of it faces up, its snow, its light.
// Until 2026-11-14 a rock was a cut icosphere of 20 to 1280 triangles with a shader of its own, four levels that
// changed over whole and an end at six pixels.
import * as THREE from 'three/webgpu';
import { Fn, If, float, uint, vec2, vec3, vec4, uniform, attribute, positionWorld, normalWorld, abs, max, mix, floor, smoothstep, pow, normalize } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, camDist, riverInfo, heightAt, outcropMask, grassTint, dryAt } from '../world/land.nodes.js';
import { offWays } from '../world/ways.js';
import { lit, weathered, snowLift } from '../world/light.js';
import { byRole } from '../core/registry.js';
import { scatterRow } from '../../assets/index.js';
import { farMost } from '../detail/measure.js';
import { source } from '../core/settle.js';
import { most } from '../../assets/kinds.js';
import { createDrawer } from './drawer.js';
import { cutThings } from './cut.js';
import { placedBy, lookOf as zooLook, fingerprint } from '../../assets/zoo/index.js';
import { rockFull, rockBody } from '../../assets/kit/rock.js';
import { STILL_PER } from '../../assets/kit/solid.js';
import { roomsOf, mostOf } from './rooms.js';
import { roomOf } from '../core/gpu.js';
import { SURFACE_LEVELS, surfaceBand, surfacePx, GONE, BAND } from '../detail/error.js';
import { rocksAround, rocksDrawn } from '../world/rocksolid.js';

// the levels: a rock's cluster hierarchy (assets/kit/clusters.js, from its full mesh alone) as the surfaces' levels hold
// it (src/detail/error.js): level 0, every cluster a thing at the eye may need, there for the shapes that lie near,
// drawn by the cut; every coarser level always there. A level's room: the most any shape's level holds (rooms.json,
// measured from each shape's own hierarchy: src/scatter/rooms.js). Level 0 has a slot a shape that can lie near at
// once: no more than an asset's shapes, nor than its rocks that can be at level 0 at once (the cut's own bound: a rock
// a cell within where its largest is level 0's size, src/scatter/cut.js cutThings), and only while the geometry's class
// has room for them beside every shape's coarser levels (src/core/classes.js); fewer, said, where it has not (the
// nearest shapes' then: tiers.solid, below)
const levelsOf = (Z, rows, famOf) => {
  const LV = Array.from({ length: SURFACE_LEVELS }, (_, i) => ({ px: surfacePx(i), band: surfaceBand(i), delta: 0, room: mostOf(Z.families.flatMap((F) => roomsOf(F.F.asset, i, STILL_PER).slice(0, F.count))) }));
  const bytes = (r) => r.tris * 3 * 4 + r.verts * 16;   // (a level's place in the heap: its corners, 4 bytes each, its elements, 16: src/scatter/heap.js)
  const near = Math.min(Z.count, rows.reduce((n, row) => n + Math.min(famOf(row).count, cutThings(row.size[1], row.cell, LV[0].px)), 0));
  const rest = LV.slice(1).reduce((s, l) => s + Z.count * bytes(l.room), 0), slots = Math.max(1, Math.min(near, Math.floor((roomOf('geometry') - rest) / bytes(LV[0].room))));
  if (slots < near) console.warn(`rocks: the geometry's class has room for ${slots} of the ${near} shapes' full meshes that can lie near at once (src/core/classes.js): the nearest are drawn so`);
  Object.assign(LV[0], { cut: true, slots });
  return LV;
};
// RELIEF: the size on screen from which a rock's relief is read (under that its texture's mipmaps have none left);
const SHADE = { shrink: 0.85, far: 30, wide: 1.5 }, RELIEF = 10;
// THIN: where a rock thins away, dial pixels (src/detail/error.js): pixel by pixel over the BAND under where it is gone
// (leaving a rock out differs by all of it: GONE), with nothing to hand over to (its land's colour is under it)
const THIN = [GONE / BAND, GONE];

/** The assets of engine `rocks`, all at once: they share one drawer (a level of every shape of every rock asset is in
    one heap), each asset a tier a level over its own cells. */
export function createRocks(scene, tex, ground, rows, gpu, renderer) {
  const Z = placedBy('rocks'), famOf = (row) => Z.families.find((F) => F.F.asset === row.uid);
  // (without WebGPU nothing of the heap can be drawn: no rocks there, and none to walk into)
  rows = gpu ? rows.filter((row) => famOf(row) || console.warn(`rocks: no family of the zoo brings the shapes of '${row.name}' (assets/zoo)`)) : [];
  rocksDrawn(rows.map((row) => row.uid));
  if (!rows.length) return [];
  const LEVELS = levelsOf(Z, rows, famOf), L = LEVELS.length, SMOOTH = uniform(1);
  const D = createDrawer(scene, renderer, tex, {
    name: 'rocks', LEVELS, SHADE, SMOOTH, corners: true, thin: THIN, still: true, skins: 0, ground: true, soft: true, relief: RELIEF,
    zoo: { first: Z.first, ALL: Z.count, STAND: Z.count, MOVING: 0, lookOfKind: (k) => { const B = zooLook(Z.first + k); return { ...B, material: B.material ?? byRole('rock').uid }; }, fingerprint: () => fingerprint('rocks') },
  });
  const { lookOf } = D, tiers = [], firstOf = new Map(); let sizeMost = 0;
  for (const row of rows) {
    const F = famOf(row), big = !!row.outcrops, shapes = F.count;
    // (a rock's size on screen is its largest side's: its size, metres, its asset's, the measure's: world/scale.js)
    const sizes = [row.size[0], row.size[1]], reach = Infinity;   // (every rock as far as its own size shows: it thins away over the same last pixels, THIN; the ground's map reaches the stones' farthest, src/scatter/ground.js)
    firstOf.set(row.uid, F.first); sizeMost = Math.max(sizeMost, sizes[1]);
    // what lies in a cell: a rock of one of the asset's shapes, or nothing. The cheap tests first (most cells hold
    // none); the ground under it and the grass round it only for a rock that is of the tier's level (fill)
    const place = (c, { band }, found) => {
      const cx = c.x, cy = c.y, pos = vec2(c).add(0.15).add(vec2(rnd(cx, cy, uint(202)), rnd(cx, cy, uint(203))).mul(0.7)).mul(row.cell), dist = camDist(pos);
      const thing = (oc, I, GA) => {
        // (its size: its largest side, metres, between its asset's least and most, most rocks small; on an outcrop larger
        // more often, never past its most: src/world/rocksolid.js works out the same)
        const r1 = rnd(cx, cy, uint(204)), s = mix(row.size[0], row.size[1], r1.mul(r1).mul(r1).add(oc.mul(big ? 0.25 : 0).mul(r1)).min(1));
        const kind = uint(floor(rnd(cx, cy, uint(201)).mul(shapes)).min(shapes - 1)).add(uint(F.first));
        const size = s;
        // (none on a way: none whose base, half its side round its middle, reaches onto it: src/world/ways.js;
        // src/world/rocksolid.js keeps the same)
        If(offWays(float(1), pos, s.mul(0.5)).greaterThan(0.5), () => found(kind, size, dist, (A, B, G) => {
          const sunk = size.mul(lookOf(kind, 5).w);   // (how deep it lies: its look's)
          if (big) {   // an outcrop: the land worked out here (the ground's map does not reach so far)
            const d = abs(I.x), w = I.y, dry = dryAt({ p: pos, dist, d, w, b: I.z });
            A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(sunk), size)); G.assign(vec4(grassTint(tex, pos, dry, 0).rgb, dry));
          } else { A.assign(vec4(pos, GA.x.sub(sunk), size)); G.assign(ground.tint(pos)); }
          B.assign(vec4(rnd(cx, cy, uint(211)).mul(6.2831853), float(kind), 0, rnd(cx, cy, uint(212)).mul(6.2831853)));   // (its turn, its kind; it does not sway; its seed: drawer.js)
        }));
      };
      If(dist.lessThan(band.far).and(dist.greaterThanEqual(band.near)), () => {
        const r0 = rnd(cx, cy, uint(200));
        if (big) {
          const oc = outcropMask(pos).toVar();
          If(r0.lessThanEqual(oc.mul(0.6).add(0.012)), () => {
            const I = riverInfo(pos).toVar();   // (none in the river)
            If(r0.lessThanEqual(oc.mul(0.6).add(0.012).mul(smoothstep(I.y.add(2), I.y.add(9), abs(I.x)))), () => { thing(oc, I, null); });
          });
        } else { const GA = ground.A(pos).toVar(); If(r0.lessThanEqual(GA.w.mul(0.7)), () => { thing(float(0), null, GA); }); }
      });
    };
    // one tier an asset: every rock dropped into the draw of its level (drawer.js: tierAll), level 0 drawn by its cut
    const last = L - 1;
    // (its patches: about five to its reach, so the tier looks at a few dozen, whatever the lens; cap: the most of it in one draw)
    const farAt = Math.min(reach, farMost(THIN[0], sizes[1])), P = Math.min(64, Math.max(2, 2 ** Math.ceil(Math.log2(farAt / (row.cell * 5)))));
    const T = D.tierAll({ cell: row.cell, P, cap: big ? 16384 : 4096, sizes, place, casts: row.detail.casts, far: reach, last, thing: `rocks:${row.uid}` });   // (thing: a rock's own state, its asset and its cell: src/world/things.js)
    T.asset = row.name; tiers.push(T);
  }
  // each frame: the coarse levels until they are in; and, when the camera has moved, the full meshes of the shapes
  // that lie near enough for them (the rocks round the camera, reckoned on the CPU as the GPU places them:
  // src/world/rocksolid.js). A stone is known there only once the ground round the camera has been read back
  // (src/scatter/ground.js): until a look has been taken since the last read-back, what lies near is not all asked
  // for (src/core/settle.js)
  let looked = -1;
  source('rocks', () => (looked !== ground.reads ? 1 : 0));
  tiers.solid = () => {
    D.start();
    const N = D.scan(); if (!N) return;
    looked = ground.reads;
    const cam = U.uCam.value, dy = U.uDy.value, far = N.reach(sizeMost);
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
  return lit({ colour: c2, n, w: s.world, eye, gloss: float(1).sub(moss).mul(0.06), sharp: 30 });
}
const GEOS = new Map();
// shape v of an asset as it is, a plain geometry (in its own frame: its foot at 0, its largest side 1); from its seed, so
// another seed is another rock. The last few dozen kept (what stood on the stage is freed by the library when it goes;
// one kept here is sent to the GPU again when it is shown again)
function rockGeometry(asset, v) {
  const key = `${asset.uid}:${asset.placement.seed}:${v}`; let g = GEOS.get(key); if (g) return g;
  if (GEOS.size >= 32) GEOS.delete(GEOS.keys().next().value);
  const F = rockFull(asset, v);
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(F.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(F.nor, 3)); g.setAttribute('shade', new THREE.BufferAttribute(Float32Array.from(F.shade), 1)); g.setIndex(new THREE.BufferAttribute(F.index, 1));
  GEOS.set(key, g); return g;
}
/** One rock on its own, in the world's rock material (its texture, its moss): shape `shape` of the asset, as it is. Its
    `eye` uniform is the camera it is lit and hazed for (a list's picture sets its own). */
export function rockSample(tex, row, level = 1, shape = 0) {
  const m = new THREE.NodeMaterial(), eye = uniform(U.uCam.value);
  m.fragmentNode = Fn(() => rockShade(tex, row, { world: positionWorld, n: normalWorld, tint: vec3(0.05, 0.13, 0.02), arid: float(0), dark: attribute('shade', 'float') }, eye))();
  m.eye = eye;
  const mesh = new THREE.Mesh(rockGeometry(row.asset, shape), m); mesh.layers.enable(1); return mesh;
}

// what it reads of a rock's file, over the common row: where it lies (outcrops), its sizes, its look
const rockRow = (a) => ({ ...scatterRow(a), outcrops: a.placement.outcrops, size: a.size.length, texture: a.placement.texture, shapes: a.placement.shapes, look: a.look });
/** A scatter engine (src/scatter/index.js finds it): what an asset's placement.engine 'rocks' names. */
export const engine = {
  id: 'rocks',
  row: rockRow,
  createAll: createRocks,
  // the library: the largest of its kind for the list; on the stage a few, small to large, lying about the middle, from
  // another seed (its Random) other rocks of the same recipe
  thumb(tex, row) {
    const a = row.asset, s = most(a.size.length), m = rockSample(tex, row, 1, 0); m.scale.setScalar(s); m.position.y = -s * 0.4;   // (a rock of size s is s across)
    return { things: [m], eye: [s * 1.05, s * 1.0, s * 1.65], look: [0, -s * 0.03, 0] };
  },
  stage(tex, row0, { x, z, heightAt: hAt, level = 0, seed = null }) {
    const a0 = row0.asset, a = seed == null || seed === a0.placement.seed ? a0 : { ...a0, placement: { ...a0.placement, seed } }, row = a === a0 ? row0 : rockRow(a);
    const [lo, hi] = a.size.length, g = new THREE.Group(), shapes = a.placement.shapes ?? 1;
    for (let i = 0; i < 7; i++) {
      const k = i / 6, s = lo + (hi - lo) * k ** 1.6, t = i * 2.4, rr = i ? (hi * 0.4 + 0.3) * Math.sqrt(i) * 0.55 : 0, B = rockBody(a, i % shapes);
      const m = rockSample(tex, row, level, i % shapes), X = x + Math.cos(t) * rr, Z = z + Math.sin(t) * rr;   // as the world lays it: so much of it in the ground
      m.scale.setScalar(s); m.renderOrder = 1; m.position.set(X, hAt(X, Z) - B.sunk * s, Z); m.rotation.y = t * 1.7; g.add(m);   // drawn after the ground, as the world's own things are (a rock of size s is s across)
    }
    return g;
  },
  frame: (a) => ({ height: most(a.size.height) * 0.5, dist: Math.max(3, most(a.size.length) * 3.5), pitch: 0.55, span: most(a.size.length) }),   // (a rock is its size across)
};
