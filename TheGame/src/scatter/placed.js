// What stands at a spot of its own (intent 0029): the tent, the fire pit, and later the city's buildings and whatever a
// citizen sets down. Every such thing is a place in one list, drawn by the one drawer (drawer.js) as everything else that
// stands is: a list of a few or of millions costs what is near and in view, not how many there are.
//
//   - a kind is a made thing (assets/kit/made.js: an asset that stands at places, of faces), brought to the heap by
//     the zoo (assets/zoo/made.js) as the levels of its cluster hierarchy (src/detail/error.js), built in the recipes'
//     workers from its faces alone and kept in the browser; every made thing is drawn by one drawer (a group);
//   - a place is two rows of numbers on the GPU (where it stands, its size, its kind, its turn, its key). The list is kept
//     in the order of where its places stand (each 32-metre square's number on a Z-shaped walk over the land): any square
//     of 2^k of them a side is then one run of it, found by two searches. Nothing is looked at that is not in the run;
//   - a level's tier looks at the squares of its band in view (tier.js: a list's tier), each square its runs, the nearest
//     first; its packing drops a place into its kind's draw where its size on screen is the level's (drawer.js);
//   - a thing keeps its own look: its colours, the world's materials it names wrapped round it, its sway in the wind,
//     the snow on it, the fire's light (madeMaterial: as src/world/place.js draws a thing of its own); what of it is drawn
//     is the cut's rule, cluster by cluster (src/scatter/cut.js), so a level hands over to the next with nothing to see.
//     Its far end is the drawer's dot: one triangle that covers what it does, in its mean colour;
//   - its body is the one collision engine's (src/world/bodies.js), found in the same order: the places round a point.
// stand(asset, at) puts a place in (src/boot.js: world/places.js); `?many=N` stands N more round the meadow, to measure
// (the list's room is set at the start: as many as `many` asks, and four thousand besides).
import * as THREE from 'three/webgpu';
import { Fn, If, float, uint, vec3, vec4, uniform, varyingProperty, normalize, mix, fract, dFdx, dFdy, smoothstep, clamp, length, max } from 'three/tsl';
import { camDist } from '../world/land.nodes.js';
import { heightAt } from '../world/land.js';
import { windAt, windStrength, unlit } from '../world/light.js';
import { passOf, motion, vWas, drawnId, idClass } from '../core/pass.js';
import { U } from '../core/uniforms.js';
import { layerOf, wrapGrad } from '../world/tile.js';
import { levelOfMesh, handOver, sinkInto } from '../detail/handover.js';
import { farMost, dialPxAt } from '../detail/measure.js';
import { SURFACE_LEVELS, FADE, BAND, GONE, surfaceBand, surfacePx } from '../detail/error.js';
import { spanOf, most, kindOf } from '../../assets/kinds.js';
import { bodyOfAsset } from '../../assets/index.js';
import { placedBy } from '../../assets/zoo/index.js';
import { madeBox, MADE_PER } from '../../assets/kit/made.js';
import { roomsOf, mostOf } from './rooms.js';
import { clusterOf, levelHead, allowedAt, eased, ruleOf, sphereFrom, pxCut } from './cut.js';
import { versionOf } from '../core/registry.js';
import { madeOf, madeWay } from './madevert.js';
import { createDrawer } from './drawer.js';
import { heapRow } from './heap.js';
import { offScreen, clipOf } from './tier.js';
import { inView } from './view.js';
import { gpuStorage, note } from '../core/gpu.js';
import { addBodies, reachOf } from '../world/bodies.js';
import { keyOf, idOf } from '../world/things.js';
import { HX, fmix } from '../core/hash.js';
import { flagNum } from '../core/flags.js';
import { swayed, facing, mottled, madeLit } from '../world/made.nodes.js';
import { pxOf, turnOf } from './row.js';

const BUCKET = 32, P = 32, OFF = 32768, MOST = 2097152, NUMS = 5;   // BUCKET: the squares the list is ordered by, metres; P: a run is at most P × P places; OFF: the squares' numbers from -OFF; MOST: places a group can hold (2^21); NUMS: rows of four a kind's own numbers (in the drawer's table: numOf)
const MANY = Math.max(0, Math.floor(flagNum('many', 0)));   // `?many=N`: N more places round the meadow, to measure

// a square's number on the Z-shaped walk: its two numbers' bits woven
const spread = (x) => { x &= 0xffff; x = (x | (x << 8)) & 0x00ff00ff; x = (x | (x << 4)) & 0x0f0f0f0f; x = (x | (x << 2)) & 0x33333333; return (x | (x << 1)) & 0x55555555; };
const zOf = (i, j) => (spread(i) | (spread(j) << 1)) >>> 0;
const codeOf = (x, z) => zOf(Math.max(0, Math.min(65535, Math.floor(x / BUCKET) + OFF)), Math.max(0, Math.min(65535, Math.floor(z / BUCKET) + OFF)));
const lower = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };

let LIST = null;
/** Stand a made thing at a spot ({ x, z, yaw, solid }) in the world's list: its id (false where this list does not draw
    it: no WebGPU, or not a made thing; src/world/place.js then stands it as before). */
export const stand = (asset, at) => LIST?.stand(asset, at) ?? false;
/** Take a place out again (its id: what stand gave). */
export const unstand = (id) => LIST?.unstand(id) ?? false;

/** The made things' material, for a level of a group's drawer: a thing's vertex from the heap, its place from its tier's
    packing (A: x, z, the height of its foot, its size; B: its turn, its kind, -, its seed; S: its own state, a tint and
    how worn it is: src/world/things.js), its kind's numbers (the drawer's table: its look, and NUMS rows of its own),
    and from there what src/world/made.nodes.js does for every made thing. Its level and its level's numbers ({ lo, hi,
    last }) as the mesh drawing it tells them (src/scatter/drawer.js tagLevel: userData.heapLevel, Lv; lv, the level it
    was made for: what it is drawn as until a mesh says), so one material draws every level of a group drawn alike
    (drawer.js alike); and how far the mesh has come since it could first be drawn (userData.arrived: it rises out of the
    ground, handOver's sink, src/core/screen.js). fade and sink its kinds'. Which of the level's clusters are drawn, and how far each has turned into its parent, is the cut's
    rule (src/scatter/cut.js), in the vertex stage: by the thing's own distance, and at level 0 by each of its clusters'
    own as the thing grows from PX_CUT to twice that (a made thing is small: its clusters are tested here, not in a
    compute pass). */
function madeMaterial(D, src, lv, fade, sink, at) {
  // (a number of its level, as the mesh drawing it says which: every level but the first, whose cut reads each cluster's
  // own distance, one material, one build a pass: seven levels were seven builds of the same code, 2026-11-19)
  const ofLevel = (f, type = 'float') => uniform(f(lv), type).onObjectUpdate(({ object }) => f(object?.userData?.heapLevel ?? lv));
  const slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0), level = ofLevel((l) => l, 'uint'), LU = levelOfMesh(fade);
  const from = ofLevel((l) => surfaceBand(Math.min(l + 1, SURFACE_LEVELS - 1))[0]), CUT = lv === 0, PXC = pxCut();
  const vW = varyingProperty('vec3', 'mW'), vN = varyingProperty('vec3', 'mN'), vC = varyingProperty('vec3', 'mC'), vY = varyingProperty('float', 'mY'), vK = varyingProperty('vec3', 'mK');   // (vK: its kind, the material its face wears, how worn it is)
  const m = new THREE.NodeMaterial(); m.side = THREE.DoubleSide;
  m.vertexNode = Fn(() => {
    const A = src.readAt(0, slot), B = src.readAt(1, slot), S = src.readAt(2, slot), clip = offScreen().toVar();
    const kind = uint(B.y.add(0.5)), N0 = D.numOf(kind, 0).toVar(), N1 = D.numOf(kind, 1).toVar(), N2 = D.numOf(kind, 2).toVar(), span = D.lookOf(kind, 3).w;   // (span: its largest side, its look's)
    // its size on screen, and the one hand-over (src/detail/handover.js, in dial pixels as its levels: src/detail/error.js):
    // a made thing is of one piece, it changes over whole, half way; its last level sinks, where no dot follows it
    const px = pxOf(A.w, A.xy), H = handOver(dialPxAt(px), LU, sink);
    const R = heapRow(D.H, kind, level).toVar();
    // the draw's corner: its cluster's number and its vertex's first element (assets/kit/surface.js)
    const corner = at(R).vertex.toVar(), C = clusterOf(D.H, R, corner.shiftRight(uint(16))), head = levelHead(D.H, R), el = R.y.add(corner.bitAnd(uint(0xffff)));
    const dT = camDist(A.xy), { turn, unturn } = turnOf(B.x), foot = vec3(A.x, A.z, A.y), w0 = CUT ? smoothstep(PXC, PXC.mul(2), px) : null;   // (w0: how far it is measured by each cluster's own distance)
    const allowed = (j) => {
      let d = dT;
      if (CUT) d = mix(dT, sphereFrom(D.H.elems.element(C.at.add(uint(j))), A, B), w0);   // (its own sphere's distance, as the cut's)
      return clamp(eased(R, allowedAt(A, dT, d), from, U.uTime), head.lo, head.hi);
    };
    const rule = ruleOf(C.self, C.parent, allowed(1), allowed(2));
    If(H.whole.and(rule.drawn), () => {
      // the vertex, turned as far as the rule says into its parent's surface
      const V = madeOf(D.H.elems.element(el), N0.xyz, N1.xyz), Y = madeWay(D.H.elems.element(el.add(uint(1))), C.D.mul(span)), t = rule.t;
      const p = V.position.add(Y.way.mul(t)).toVar(), nrm = normalize(mix(V.normal, Y.normal, t)).toVar(), col = mix(V.colour, Y.colour, t);
      const s = A.w.div(span);
      // its sway in the wind, in its own frame (src/world/made.nodes.js), at a time: the clock's, and for the prepass the
      // clock's a frame ago (where it was: src/core/pass.js)
      const at = (time) => {
        const push = windAt(foot.xz.add(turn(p).xz.mul(s)), time), along = unturn(vec3(push.x, 0, push.y));
        return sinkInto(swayed(p, nrm, { H: N0.w, R: N1.w, billow: N2.x, flap: N2.y, sway: N2.z }, along, windStrength, time), H.sunk);
      };
      const q = at(U.uTime), w = foot.add(turn(q.mul(s))).toVar();
      vW.assign(w); vN.assign(turn(nrm)); vC.assign(col.mul(S.rgb)); vY.assign(q.y.mul(s)); vK.assign(vec3(float(kind), V.part, S.w));   // (its colour in its tint: painted)
      clip.assign(clipOf(w, foot.add(turn(at(U.uTimeWas).mul(s)))));
    });
    return clip;
  })();
  m.fragmentNode = Fn((builder) => {
    if (passOf(builder) === 'pre') return motion(vWas);   // (the prepass: where it was a frame ago)
    const out = vec4(0).toVar();
    If(unlit().not(), () => {   // (drawn into the shadow map, only its depth counts: no light)
      const kind = uint(vK.x.add(0.5)), N3 = D.numOf(kind, 3), N4 = D.numOf(kind, 4), snow = D.lookOf(kind, 3).x, part = vK.y;
      const w = vW, n0 = facing(normalize(vN), w).toVar();   // (the face's side towards the eye)
      // what it is made of: the world's material its face names (its kind's: up to four), wrapped round it from three
      // sides; where it names none, its colours alone, faintly mottled (as src/world/place.js)
      const no = part.lessThan(0.5).select(N4.x, part.lessThan(1.5).select(N4.y, part.lessThan(2.5).select(N4.z, N4.w))), q = w.div(N3.z), gx = dFdx(q), gy = dFdy(q);
      const made = no.greaterThan(-0.5), sc = vec3(1).toVar(), n = n0.toVar();
      If(made, () => { const S = wrapGrad(no, q, gx, gy, n0, N3.w); sc.assign(S.col); n.assign(S.n); });
      // (worn: darker and greyer, as a thing left out for years)
      const own0 = made.select(sc.mul(sc).mul(vC), mottled(vC, w)), own = mix(own0, vec3(own0.dot(vec3(0.3, 0.5, 0.2))).mul(0.62), vK.z.mul(0.85));
      out.assign(madeLit(own, n, w, vY, { wrap: N3.x, through: N3.y, clumps: snow }));
    });
    return out;
  })();
  m.userData.pre = true;   // (it takes part in the prepass: src/core/pass.js)
  if (src?.placeAt) m.idNode = drawnId(ofLevel(classOf, 'uint'), src.placeAt(slot));   // (what its pixels' id says: src/core/pass.js)
  return m;
}

// (a level's class of what draws, for what its pixels' id says: one a level, made once, src/core/pass.js idClass)
const CLASSES = [], classOf = (lv) => (CLASSES[lv] ??= idClass({ family: 'made', level: lv }));

/** A group: made kinds drawn by one drawer, its list, its tiers. */
function groupOf(scene, tex, renderer, name, kinds, cap) {
  const n = kinds.length, ML = SURFACE_LEVELS - 1;
  // its levels: the surfaces' (src/detail/error.js), each kind's level in a place as large as what it holds (rooms.json,
  // measured from its own hierarchy: src/scatter/rooms.js); the last, from where its coarsest clusters end, the drawer's
  // dot, whole down to where it is gone (GONE: leaving it out differs by all of it) and sinking away over the BAND under that
  const LEVELS = [...Array.from({ length: ML }, (_, i) => { const rooms = kinds.map((Kd) => roomsOf(Kd.asset.uid, i, MADE_PER)[0]); return { px: surfacePx(i), band: surfaceBand(i), room: mostOf(rooms), rooms }; }), { px: GONE / BAND, room: { verts: 3, tris: 1 } }];
  // each kind's own numbers (NUMS rows of four, after its look in the drawer's one table): [its box's least corner, its
  // height], [its box's size, its half length], [its wind: billow, flap, sway], [its surface: wrap, through; metres a
  // tile of its materials, their relief], [the layers of its materials (none: -1)]; how its snow lies and its largest
  // side are its look's (assets/kit/made.js: madeLook)
  const numbersOf = (k) => {
    const a = kinds[k].asset, B = madeBox(a), W = kindOf(a, 'wind') ?? {}, S = kindOf(a, 'surface') ?? {}, M = a.materials ? Object.values(a.materials).map((u) => layerOf(u)) : [];
    if (M.length > 4) console.warn(`placed: '${a.name}' names ${M.length} materials; its faces wear the first four`);
    return [...B.min, most(a.size.height), ...B.ext, most(a.size.length) / 2, W.billow ?? 0, W.flap ?? 0, W.sway ?? 0, 0, S.wrap ?? 0, S.through ?? 0, a.texture ?? 1, a.relief ?? 1, M[0] ?? -1, M[1] ?? -1, M[2] ?? -1, M[3] ?? -1];
  };
  const KINDS = kinds.map((Kd) => Kd.zoo), fade = FADE, sink = 0;   // (fade: only where a thing's level changes, exactly at its pixels: handOver's `whole`)
  const D = createDrawer(scene, renderer, tex, {
    name: `made: ${name}`, LEVELS, SHADE: { shrink: 1, far: 30, wide: 1.5 }, SMOOTH: uniform(1), state: true,
    // (a level's numbers, told by its meshes: levelOf; which levels are drawn alike, one material: every one but the
    // first, which its clusters' own distances cut, src/scatter/drawer.js alike)
    make: { per: 2, flat: false, dot: true, numbers: { rows: NUMS, of: numbersOf }, material: (src, i, shadow, at) => madeMaterial(D, src, i, fade, sink, at),
      levelOf: (i) => (i < ML ? { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity, last: false } : null), alike: (i) => (i ? 'levels' : 'cut'),
      box: (k) => { const a = kinds[k].asset, B = madeBox(a), s = spanOf(a); return { min: B.min.map((v) => v / s), max: B.min.map((v, j) => (v + B.ext[j]) / s) }; } },   // (its box over every level, in its sizes: what the eye's occlusion test reads, drawer.js kindBox)
    // (what the browser keeps of it is good while its recipes and their rooms are what they were: registry.json's versions)
    zoo: { kinds: KINDS, ALL: n, lookOfKind: (k) => kinds[k].look, fingerprint: () => `made 5|${kinds.map((Kd) => `${Kd.asset.uid}@${versionOf(Kd.asset.uid)}`).join()}|${LEVELS.slice(0, ML).map((l) => l.rooms.map((r) => `${r.verts}:${r.tris}`).join()).join('/')}` },
  });

  // ---- the list: what stands, by the order of where it stands ----
  const G = { name, D, kinds, n: 0, cap, version: 0, dirty: false, codes: new Uint32Array(0), order: new Uint32Array(0), bodies: [] };
  // (a place is numbers only, 37 bytes on the page: a million are 37 MB. Its id and its thing's are said when asked:
  // `placed:<its asset>:<x>:<z>`, and src/world/things.js's by its spot to the centimetre, cx and cz)
  const x = new Float32Array(cap), z = new Float32Array(cap), foot = new Float32Array(cap), size = new Float32Array(cap), yaw = new Float32Array(cap), kind = new Uint16Array(cap), key = new Uint32Array(cap), solid = new Uint8Array(cap), cx = new Int32Array(cap), cz = new Int32Array(cap);
  const idAt = (i) => `placed:${kinds[kind[i]].asset.uid}:${+x[i].toFixed(3)}:${+z[i].toFixed(3)}`;
  const ROWS = gpuStorage('vec4', cap * 2, `placed, ${name}: where they stand`, 'geometry');
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
    const far = farMost(LEVELS[i].px, sizes[1] * 1.25), k = Math.max(0, Math.min(12, Math.ceil(Math.log2(far / (8 * BUCKET))))), S = BUCKET * 2 ** k;
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
  note(`placed, ${name}: the list on the page`, 0, cap * 37, 'geometry');
  return G;
}

export function createPlaced(scene, tex, renderer) {
  const Z = placedBy('placed'), all = Z.families.flatMap((E) => (E.F.made ?? []).map((asset, i) => ({ asset, zoo: Z.first + E.first + i, look: E.F.lookOf(i) })));
  if (!all.length) return [];
  // the group: every made thing (their levels are the surfaces': src/detail/error.js)
  const by = new Map([['made', all]]);
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
    const R = Math.sqrt((MANY * 200) / Math.PI), h = (i, s) => fmix(Math.imul(i, HX) ^ s) / 4294967296;
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
