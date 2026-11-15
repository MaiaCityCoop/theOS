// What stands at a spot of its own (intent 0029): the tent, the fire pit, and later the city's buildings and whatever a
// citizen sets down. Every such thing is a place in one list, drawn by the one drawer (drawer.js) as everything else that
// stands is: a list of a few or of millions costs what is near and in view, not how many there are.
//
//   - a kind is a made thing (assets/kit/made.js: an asset that stands at places, of faces), brought to the heap by
//     the zoo (assets/zoo/made.js) at its own levels of detail, made in the recipes' workers and kept in the browser;
//     the kinds whose levels end at the same pixels are drawn by one drawer (a group);
//   - a place is two rows of numbers on the GPU (where it stands, its size, its kind, its turn, its key). The list is kept
//     in the order of where its places stand (each 32-metre square's number on a Z-shaped walk over the land): any square
//     of 2^k of them a side is then one run of it, found by two searches. Nothing is looked at that is not in the run;
//   - a level's tier looks at the squares of its band in view (tier.js: a list's tier), each square its runs, the nearest
//     first; its packing drops a place into its kind's draw where its size on screen is the level's (drawer.js);
//   - a thing keeps its own look: its colours, the world's materials it names wrapped round it, its sway in the wind,
//     the snow on it, the fire's light (madeMaterial: as src/world/place.js draws a thing of its own); its levels hand
//     over as before (src/detail/handover.js: of one piece, half way). Its far card (an impostor: 11 MB a kind) is the
//     drawer's dot: one triangle that covers what its coarsest level does, in its mean colour;
//   - its body is the one collision engine's (src/world/bodies.js), found in the same order: the places round a point.
// stand(asset, at) puts a place in (src/main.js: world/places.js); `?many=N` stands N more round the meadow, to measure
// (the list's room is set at the start: as many as `many` asks, and four thousand besides).
import * as THREE from 'three/webgpu';
import { Fn, If, float, uint, vec2, vec3, vec4, uniform, varyingProperty, vertexIndex, storage, normalize, max, mix, clamp, smoothstep, length, sin, cos, pow, fract, dFdx, dFdy } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist } from '../world/land.nodes.js';
import { heightAt } from '../world/land.js';
import { finish, skyLight, weathered, snowCover, snowLift, snowDepth, cloudAt, windAt, windStrength, unlit } from '../world/light.js';
import { fireLight } from '../world/fire.js';
import { vnoise } from '../world/noise.nodes.js';
import { layerOf, wrapGrad } from '../world/tile.js';
import { levelOf, handOver, sinkInto } from '../detail/handover.js';
import { pxK, detailOf, spanOf, most } from '../detail/index.js';
import { kindOf } from '../../assets/kinds.js';
import { bodyOfAsset, snowOf } from '../../assets/index.js';
import { placedBy } from '../../assets/zoo/index.js';
import { madeBox, madeRoom, madeMesh } from '../../assets/kit/made.js';
import { versionOf } from '../core/registry.js';
import { madeOf } from './madevert.js';
import { createDrawer } from './drawer.js';
import { heapRow, cornersOf } from './heap.js';
import { offScreen, clipOf } from './tier.js';
import { inView } from './view.js';
import { gpuStorage, note } from '../core/gpu.js';
import { addBodies, reachOf } from '../world/bodies.js';
import { keyOf, idOf } from '../world/things.js';

const BUCKET = 32, P = 32, OFF = 32768, MOST = 2097152, NUMS = 6;   // BUCKET: the squares the list is ordered by, metres; P: a run is at most P × P places; OFF: the squares' numbers from -OFF; MOST: places a group can hold (2^21); NUMS: rows of four a kind's numbers
const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));
const MANY = Math.max(0, Math.floor(+new URLSearchParams(location.search).get('many') || 0));   // `?many=N`: N more places round the meadow, to measure
const BYKIND = 32, BYLEVEL = new URLSearchParams(location.search).has('bylevel');   // a group of up to BYKIND kinds is drawn a kind a draw (no vertex worked out for nothing); more, a level a draw (a city of many kinds: the draws are the levels, not the kinds); `?bylevel`: so whatever their number, to measure

// a square's number on the Z-shaped walk: its two numbers' bits woven
const spread = (x) => { x &= 0xffff; x = (x | (x << 8)) & 0x00ff00ff; x = (x | (x << 4)) & 0x0f0f0f0f; x = (x | (x << 2)) & 0x33333333; return (x | (x << 1)) & 0x55555555; };
const zOf = (i, j) => (spread(i) | (spread(j) << 1)) >>> 0;
const codeOf = (x, z) => zOf(Math.max(0, Math.min(65535, Math.floor(x / BUCKET) + OFF)), Math.max(0, Math.min(65535, Math.floor(z / BUCKET) + OFF)));
const lower = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };
const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };   // (a hash, for `?many`)

let LIST = null;
/** Stand a made thing at a spot ({ x, z, yaw, solid }) in the world's list: its id (false where this list does not draw
    it: no WebGPU, or not a made thing; src/world/place.js then stands it as before). */
export const stand = (asset, at) => LIST?.stand(asset, at) ?? false;
/** Take a place out again (its id: what stand gave). */
export const unstand = (id) => LIST?.unstand(id) ?? false;

/** The made things' material, for a level of a group's drawer: a thing's vertex from the heap, its place from its tier's
    packing (A: x, z, the height of its foot, its size; B: its turn, its kind, -, its seed; S: its own state, a tint and
    how worn it is: src/world/things.js), its kind's numbers (NUM: NUMS rows a kind), and from there what
    src/world/place.js does for a thing of its own. Lv: its level ({ lo, hi, last }), fade and sink its kinds'. */
function madeMaterial(D, NUM, src, lv, Lv, fade, sink) {
  const slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0), level = uniform(lv, 'uint'), LU = levelOf(Lv, fade);
  const vW = varyingProperty('vec3', 'mW'), vN = varyingProperty('vec3', 'mN'), vC = varyingProperty('vec3', 'mC'), vY = varyingProperty('float', 'mY'), vK = varyingProperty('vec3', 'mK');   // (vK: its kind, the material its face wears, how worn it is)
  const m = new THREE.NodeMaterial(); m.side = THREE.DoubleSide;
  m.vertexNode = Fn(() => {
    const A = src.readAt(0, slot), B = src.readAt(1, slot), S = src.readAt(2, slot), clip = offScreen().toVar();
    const kind = uint(B.y.add(0.5)), k = kind.mul(uint(NUMS)), N0 = NUM.element(k).toVar(), N1 = NUM.element(k.add(uint(1))).toVar(), N2 = NUM.element(k.add(uint(2))).toVar();
    // its size on screen, and the one hand-over (src/detail/handover.js): a made thing is of one piece, it changes over
    // whole, half way; its last level sinks, where no dot follows it
    const H = handOver(A.w.mul(PXK).div(max(camDist(A.xy), 1e-3)), LU, sink);
    const R = heapRow(D.H, kind, level).toVar();
    If(H.whole.and(vertexIndex.lessThan(cornersOf(R))), () => {   // (a level a draw: the draw is as long as its longest kind's)
      const V = madeOf(D.H.elems.element(R.y.add(vertexIndex)), N0.xyz, N1.xyz), p = V.position;
      const s = A.w.div(N2.w), cs = cos(B.x), sn = sin(B.x), turn = (v) => vec3(v.x.mul(cs).sub(v.z.mul(sn)), v.y, v.x.mul(sn).add(v.z.mul(cs))), unturn = (v) => vec3(v.x.mul(cs).add(v.z.mul(sn)), v.y, v.z.mul(cs).sub(v.x.mul(sn)));
      // its sway in the wind, in its own frame (src/world/place.js: swayOf): pushed downwind with the gust and fluttering,
      // held still at the ground and along its middle; a crown's sway the higher the more
      const Hh = N0.w, Rr = N1.w, foot = vec3(A.x, A.z, A.y), push = windAt(foot.xz.add(turn(p).xz.mul(s))), along = unturn(vec3(push.x, 0, push.y)), ws = windStrength;
      const hold = smoothstep(0.02, 0.45, p.y.div(Hh)).mul(float(1).sub(smoothstep(0.8, 1, p.y.div(Hh)).mul(0.8))).mul(smoothstep(0.08, 0.55, length(p.xz).div(Rr)));
      const flap = sin(U.uTime.mul(ws.mul(10).add(4)).add(p.y.mul(3.1)).add(p.x.mul(1.7)).add(p.z.mul(2.3))).mul(ws).mul(N2.y), up = clamp(p.y.div(Hh), 0, 1);
      const q = sinkInto(p.add(along.mul(N2.x).add(V.normal.mul(flap)).mul(hold)).add(along.mul(up.mul(up).mul(N2.z))), H.sunk);
      const w = foot.add(turn(q.mul(s))).toVar();
      vW.assign(w); vN.assign(turn(V.normal)); vC.assign(V.colour.mul(S.rgb)); vY.assign(q.y.mul(s)); vK.assign(vec3(float(kind), V.part, S.w));   // (its colour in its tint: painted)
      clip.assign(clipOf(w));
    });
    return clip;
  })();
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar();
    If(unlit().not(), () => {   // (drawn into the shadow map, only its depth counts: no light)
      const k = uint(vK.x.add(0.5)).mul(uint(NUMS)), N3 = NUM.element(k.add(uint(3))), N4 = NUM.element(k.add(uint(4))), N5 = NUM.element(k.add(uint(5))), part = vK.y;
      const w = vW, nw = normalize(vN), n0 = nw.dot(U.uCam.sub(w)).lessThan(0).select(nw.negate(), nw).toVar();   // the face's side towards the eye
      // what it is made of: the world's material its face names (its kind's: up to four), wrapped round it from three
      // sides; where it names none, its colours alone, faintly mottled (as src/world/place.js)
      const no = part.lessThan(0.5).select(N4.x, part.lessThan(1.5).select(N4.y, part.lessThan(2.5).select(N4.z, N4.w))), q = w.div(N3.z), gx = dFdx(q), gy = dFdy(q);
      const made = no.greaterThan(-0.5), sc = vec3(1).toVar(), n = n0.toVar();
      If(made, () => { const S = wrapGrad(no, q, gx, gy, n0, N3.w); sc.assign(S.col); n.assign(S.n); });
      const ndl = n.dot(U.uSunDir).add(N3.x).div(N3.x.add(1)).max(0);   // soft things take the light round their edge
      const through = pow(max(normalize(w.sub(U.uCam)).dot(U.uSunDir), 0), 3).mul(N3.y).mul(max(n.dot(U.uSunDir).negate(), 0).mul(0.6).add(0.4));   // the sun behind a thin thing shines through it
      const ground = smoothstep(0, 0.7, vY).mul(0.4).add(0.6), mottle = vnoise(w.xz.mul(1.3).add(w.y), uint(301)).sub(0.5).mul(0.12).add(1), sun = U.uSun.mul(cloudAt(w));
      // (worn: darker and greyer, as a thing left out for years)
      const own0 = made.select(sc.mul(sc).mul(vC), vC.mul(mottle)), own = mix(own0, vec3(own0.dot(vec3(0.3, 0.5, 0.2))).mul(0.62), vK.z.mul(0.85));
      const lift = snowLift(w, N5.x), damp = float(1).sub(clamp(snowDepth.mul(1.5), 0, 0.18));
      const col = weathered(own.mul(damp), n, lift).mul(skyLight(n).mul(ground).add(sun.mul(ndl.mul(0.8).add(0.2))).add(fireLight(w, n))).add(own.mul(sun).mul(through).mul(float(1).sub(snowCover(n, lift))));
      out.assign(finish(col, w));
    });
    return out;
  })();
  return m;
}

/** A group: the made kinds whose levels end at the same pixels, its drawer, its list, its tiers. */
function groupOf(scene, tex, renderer, name, kinds, cap) {
  const first = kinds[0].asset, D0 = detailOf(first), meshes = D0.levels.filter((l) => !l.impostor), card = D0.levels.find((l) => l.impostor), ML = meshes.length, n = kinds.length;
  // its levels: the kinds' own, each kind's mesh in a place of its own size; where they had a far card, the drawer's dot
  const LEVELS = meshes.map((l, i) => { const rooms = kinds.map((Kd) => madeRoom(Kd.asset, i)); return { px: l.lo, room: { verts: Math.max(1, ...rooms.map((r) => r.verts)), tris: Math.max(1, ...rooms.map((r) => r.tris)) }, rooms }; });
  if (card) LEVELS.push({ px: card.lo });
  // each kind's numbers (NUMS rows of four): [its box's least corner, its height], [its box's size, its half length],
  // [its wind: billow, flap, sway; its largest side], [its surface: wrap, through; metres a tile of its materials, their
  // relief], [the layers of its materials (none: -1)], [how its snow lies in clumps]
  const numbers = new Float32Array(n * NUMS * 4);
  kinds.forEach(({ asset: a }, k) => {
    const B = madeBox(a), W = kindOf(a, 'wind') ?? {}, S = kindOf(a, 'surface') ?? {}, M = a.materials ? Object.values(a.materials).map((u) => layerOf(u)) : [];
    if (M.length > 4) console.warn(`placed: '${a.name}' names ${M.length} materials; its faces wear the first four`);
    numbers.set([...B.min, most(a.size.height), ...B.ext, most(a.size.length) / 2, W.billow ?? 0, W.flap ?? 0, W.sway ?? 0, spanOf(a), S.wrap ?? 0, S.through ?? 0, a.texture ?? 1, a.relief ?? 1, M[0] ?? -1, M[1] ?? -1, M[2] ?? -1, M[3] ?? -1, snowOf(a).clumps ?? 0.08, 0, 0, 0], k * NUMS * 4);
  });
  const NUM = storage(new THREE.StorageBufferAttribute(numbers, 4), 'vec4', n * NUMS);
  const KINDS = kinds.map((Kd) => Kd.zoo), fade = D0.fade, sink = D0.sink;
  // (its kinds' coarse levels made here, as the recipes' worker makes a block (recipes.worker.js: 'own'), where they are
  // few and small: a few hundred thousand faces are a few tens of milliseconds, and they are there for the first picture)
  const FEW = kinds.reduce((s, Kd) => s + Kd.asset.detail.levels.reduce((t, l) => t + l.faces.length, 0), 0) < 300000;
  const here = (OWN) => OWN.map(([l, idx, elems]) => {
    const b = { l, corners: new Uint32Array(n * idx), verts: new Uint32Array(n * elems * 4), counts: new Uint32Array(n), draws: new Uint32Array(n) };
    kinds.forEach((Kd, i) => { const m = madeMesh(Kd.asset, l); b.corners.set(m.index, i * idx); b.verts.set(m.verts, i * elems * 4); b.counts[i] = m.count; b.draws[i] = m.index.length; });
    return b;
  });
  const D = createDrawer(scene, renderer, tex, {
    name: `made: ${name}`, LEVELS, SHADE: { shrink: 1, far: 30, wide: 1.5 }, SMOOTH: uniform(1), PXK, state: true,
    make: { per: 1, byKind: n <= BYKIND && !BYLEVEL, flat: true, dot: !!card, material: (src, i) => madeMaterial(D, NUM, src, i, { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity, last: !card && i === ML - 1 }, fade, sink), here: FEW ? here : null },
    // (what the browser keeps of it is good while its recipes and their rooms are what they were: registry.json's versions)
    zoo: { kinds: KINDS, ALL: n, lookOfKind: (k) => kinds[k].look, fingerprint: () => `made 1|${kinds.map((Kd) => `${Kd.asset.uid}@${versionOf(Kd.asset.uid)}`).join()}|${LEVELS.map((l) => `${l.room?.verts}:${l.room?.tris}`).join()}` },
  });

  // ---- the list: what stands, by the order of where it stands ----
  const G = { name, D, kinds, n: 0, cap, version: 0, dirty: false, codes: new Uint32Array(0), order: new Uint32Array(0), bodies: [] };
  // (a place is numbers only, 37 bytes on the page: a million are 37 MB. Its id and its thing's are said when asked:
  // `placed:<its asset>:<x>:<z>`, and src/world/things.js's by its spot to the centimetre, cx and cz)
  const x = new Float32Array(cap), z = new Float32Array(cap), foot = new Float32Array(cap), size = new Float32Array(cap), yaw = new Float32Array(cap), kind = new Uint16Array(cap), key = new Uint32Array(cap), solid = new Uint8Array(cap), cx = new Int32Array(cap), cz = new Int32Array(cap);
  const idAt = (i) => `placed:${kinds[kind[i]].asset.uid}:${+x[i].toFixed(3)}:${+z[i].toFixed(3)}`;
  const ROWS = gpuStorage('vec4', cap * 2, `placed, ${name}: where they stand`);
  G.add = (k, at) => {
    if (G.n >= cap) { if (!G.full) console.warn(`placed: the list of ${name} holds ${cap} places (\`?many\` raises it at the start); no more are stood`); G.full = true; return false; }
    const i = G.n++, a = kinds[k].asset;
    x[i] = at.x; z[i] = at.z; foot[i] = heightAt(at.x, at.z) - 0.03; size[i] = spanOf(a) * (at.scale ?? 1); yaw[i] = -(at.yaw || 0); kind[i] = k; solid[i] = at.solid === false ? 0 : 1;
    cx[i] = Math.round(at.x * 100); cz[i] = Math.round(at.z * 100); key[i] = keyOf('placed', cx[i], cz[i]); G.dirty = true;
    return idAt(i);
  };
  // a place by its id: found where its spot is, in the list's order
  G.remove = (who) => {
    const p = String(who).split(':'); if (p.length !== 4 || p[0] !== 'placed') return false;
    if (G.dirty) G.rebuild();
    const fx = Math.fround(+p[2]), fz = Math.fround(+p[3]), c = codeOf(fx, fz), e = lower(G.codes, c + 1); let i = -1;
    for (let r = lower(G.codes, c); r < e; r++) { const q = G.order[r]; if (x[q] === fx && z[q] === fz && kinds[kind[q]].asset.uid === p[1]) { i = q; break; } }
    if (i < 0) return false;
    const j = --G.n;
    if (i !== j) { x[i] = x[j]; z[i] = z[j]; foot[i] = foot[j]; size[i] = size[j]; yaw[i] = yaw[j]; kind[i] = kind[j]; key[i] = key[j]; solid[i] = solid[j]; cx[i] = cx[j]; cz[i] = cz[j]; }
    G.dirty = true; return true;
  };
  // the list put in order and sent to the GPU, whole: after a change, before the next frame packs it
  G.rebuild = () => {
    const N = G.n, keys = new Float64Array(N), rows = new Float32Array(N * 8);
    for (let i = 0; i < N; i++) keys[i] = codeOf(x[i], z[i]) * MOST + i;
    keys.sort();
    G.codes = new Uint32Array(N); G.order = new Uint32Array(N); G.bodies = new Array(N);
    for (let r = 0; r < N; r++) {
      const v = keys[r], i = v % MOST; G.codes[r] = (v - i) / MOST; G.order[r] = i;
      rows.set([x[i], z[i], foot[i], size[i], kind[i], yaw[i], key[i] & 0xffff, key[i] >>> 16], r * 8);
    }
    if (N) ROWS.write(0, rows);
    G.dirty = false; G.version++;
  };
  // the runs a square of 2^k squares a side holds (an aligned square is one run of the order), cut P × P places long
  const spansAt = (k) => (pi, pj) => {
    const b = 2 ** k, bi = pi * b + OFF, bj = pj * b + OFF;
    if (bi < 0 || bj < 0 || bi + b > 65536 || bj + b > 65536) return null;
    const c0 = zOf(bi, bj), s = lower(G.codes, c0), e = lower(G.codes, c0 + b * b); if (e <= s) return null;
    const out = []; for (let a = s; a < e; a += P * P) out.push([a, Math.min(P * P, e - a)]); return out;
  };
  // ---- its tiers: a level each, over the squares of its band in view ----
  const TALL = Math.max(...kinds.map((Kd) => madeBox(Kd.asset).ext[1])), CAST = 2 * TALL + 4;   // (CAST: how far round the view a thing is still packed: its shadow may fall into it)
  const sizes = [Math.min(...kinds.map((Kd) => spanOf(Kd.asset))), Math.max(...kinds.map((Kd) => spanOf(Kd.asset)))], tiers = [];
  const place = (c, at, found) => {
    const b = uint(at.b), count = uint(at.span.y);
    If(b.lessThan(count), () => {
      const r = uint(at.span.x).add(b).mul(uint(2)), P0 = ROWS.node.element(r).toVar(), P1 = ROWS.node.element(r.add(uint(1))).toVar(), pos = P0.xy;
      If(inView(pos, P0.w.mul(0.5).add(CAST), TALL), () => {
        found(uint(P1.x), P0.w, camDist(pos), (A, B) => { A.assign(P0); B.assign(vec4(P1.y, P1.x, 0, fract(P1.z.mul(0.6180339).add(P1.w.mul(0.3819661))).mul(6.2831853))); }, uint(P1.z).bitOr(uint(P1.w).shiftLeft(uint(16))));   // (its key: its own, src/world/things.js)
      });
    });
  };
  for (let i = 0; i < LEVELS.length; i++) {
    // its squares 2^k of the list's a side, so that its band's far edge is about eight squares off: a few hundred to look at
    const far = (sizes[1] * pxK() * 1.25) / LEVELS[i].px, k = Math.max(0, Math.min(12, Math.ceil(Math.log2(far / (8 * BUCKET))))), S = BUCKET * 2 ** k;
    const capI = Math.min(cap, i === LEVELS.length - 1 ? 262144 : 256 * 4 ** i);   // (the most of a kind drawn at once at the level: few near, many far)
    const t = D.tier(i, { cell: S / P, P, cap: capI, sizes, fade, casts: i < ML, place, extra: { spans: spansAt(k), cull: CAST } });
    t.viewKeyed = true; t.asset = `placed: ${name}`;
    const run = t.run; t.run = (r, world, ...a) => run(r, `${world}|${G.version}`, ...a);   // (packed again when the list has changed)
    tiers.push(t);
  }
  G.tiers = tiers;
  // ---- its bodies: the places round a point, each its asset's body (src/world/bodies.js) ----
  const bodyOfKind = kinds.map((Kd) => { const b = bodyOfAsset(Kd.asset); return b && (b.shapes.length || b.ceiling) ? b : null; }), REACH = Math.max(0, ...kinds.map((Kd, k) => (bodyOfKind[k] ? reachOf({ s: 1, body: bodyOfKind[k] }) : 0)));
  G.near = (px, pz, reach, out) => {
    if (G.dirty) G.rebuild();
    const R = reach + REACH, i0 = Math.floor((px - R) / BUCKET), i1 = Math.floor((px + R) / BUCKET), j0 = Math.floor((pz - R) / BUCKET), j1 = Math.floor((pz + R) / BUCKET);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = zOf(i + OFF, j + OFF), s = lower(G.codes, c), e = lower(G.codes, c + 1);
      for (let r = s; r < e; r++) {
        const p = G.order[r], B = bodyOfKind[kind[p]]; if (!B || !solid[p] || Math.hypot(x[p] - px, z[p] - pz) > R) continue;
        out.push((G.bodies[r] ||= { id: idAt(p), thing: idOf('placed', cx[p], cz[p]), x: x[p], z: z[p], y: foot[p], up: -0.03, yaw: yaw[p], s: size[p] / spanOf(kinds[kind[p]].asset), kind: kinds[kind[p]].asset.uid, body: B }));
      }
    }
  };
  note(`placed, ${name}: the list on the page`, 0, cap * 37);
  return G;
}

export function createPlaced(scene, tex, renderer) {
  const Z = placedBy('placed'), all = Z.families.flatMap((E) => (E.F.made ?? []).map((asset, i) => ({ asset, zoo: Z.first + E.first + i, look: E.F.lookOf(i) })));
  if (!all.length) return [];
  // the groups: kinds whose levels end at the same pixels, and that sink and hand over alike
  const by = new Map();
  for (const Kd of all) { const D = detailOf(Kd.asset), sig = `${D.levels.map((l) => (l.impostor ? `card ${l.lo}` : l.lo)).join(',')}|${D.fade}|${D.sink}`; if (!by.has(sig)) by.set(sig, []); by.get(sig).push(Kd); }
  const groups = [], byUid = new Map(), tiers = [];
  for (const kinds of by.values()) {
    const cap = Math.min(MOST, 4096 + Math.ceil(((MANY * kinds.length) / all.length) * 1.05));   // (its room: its share of `?many`, and four thousand besides)
    const G = groupOf(scene, tex, renderer, kinds.map((Kd) => Kd.asset.name).join(', '), kinds, cap);
    groups.push(G); kinds.forEach((Kd, k) => byUid.set(Kd.asset.uid, { G, k })); tiers.push(...G.tiers);
  }
  addBodies((px, pz, reach) => { const out = []; for (const G of groups) G.near(px, pz, reach, out); return out; }, { rooms: true });
  LIST = {
    groups,
    stand(asset, at) { const w = byUid.get(asset?.uid); return w ? w.G.add(w.k, at) : false; },
    unstand(who) { for (const G of groups) if (G.remove(who)) return true; return false; },
  };
  // `?many=N`: N more places round the tent, every kind in turn, each turned its own way, none in the meadow's middle
  if (MANY) {
    const R = Math.sqrt((MANY * 200) / Math.PI), h = (i, s) => fmix(Math.imul(i, 0x9e3779b1) ^ s) / 4294967296;
    for (let i = 0; i < MANY; i++) {
      const r = Math.sqrt(30 * 30 + h(i, 11) * (R * R - 30 * 30)), a = h(i, 12) * Math.PI * 2, Kd = all[i % all.length];
      LIST.stand(Kd.asset, { x: -1262.6 + Math.cos(a) * r, z: 631 + Math.sin(a) * r, yaw: h(i, 13) * Math.PI * 2 });
    }
  }
  // each frame: the list in order on the GPU after a change; the drawers' meshes until they are in
  tiers.solid = () => { for (const G of groups) { if (G.dirty) G.rebuild(); G.D.start(); } };
  window.__placed = { groups, stand: LIST.stand, unstand: LIST.unstand, get count() { return groups.reduce((s, G) => s + G.n, 0); },
    async counts() { const out = []; for (const G of groups) for (const t of G.tiers) { const B = await t.read(renderer); out.push(`${G.name} ${t.level}: ${B.reduce((s, b) => s + b.count, 0)}${t.over ? ' (over)' : ''}`); } return out; } };
  return tiers;
}

export const engine = {
  id: 'placed',
  createOwn: (scene, tex, ground, gpu, renderer) => (gpu ? createPlaced(scene, tex, renderer) : []),
};
