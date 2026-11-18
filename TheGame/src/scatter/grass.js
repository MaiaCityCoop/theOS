// Grass: instanced blades. A blade's place, height, bend, colour and dryness are hashed from its cell; its density comes
// from the ground pass (ground.js); the wind bends it (windAt) and each blade flutters on its own. Rings round the
// camera, made from the grass's blade alone (assets/grass.js: its full detail: ringsOf) and each where its own error is
// the one ERROR_PX (bandsOf, as the measure is now): every blade as it is, in its own cells, its bends fewer further off.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, bool, vec2, vec3, vec4, If, min, uniform, varyingProperty, positionGeometry, frontFacing, mix, smoothstep, step, clamp, normalize, cross, cos, sin, pow, max, length, floor, uintBitsToFloat, floatBitsToUint } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { hashI, camDist, BASE } from '../world/land.nodes.js';
import { finish, skyLight, weathered, cloudAtOne, windAt, windStrength, snowDepth, SNOW } from '../world/light.js';
import { passOf, motion, vWas } from '../core/pass.js';
import { Tier, offScreen, clipOf } from './tier.js';
import { scatterRow } from '../../assets/index.js';
import { dialK } from '../detail/measure.js';
import { BAND, GONE } from '../detail/error.js';
import { rankOf } from './rule.js';
import { growthMap } from './growth.js';   // (a blade's turn in the one spread order, as everything placed has it)

const u8 = (h, sh) => float(h.shiftRight(uint(sh)).bitAnd(uint(0xFF))).mul(1 / 256);   // one byte of a hash, 0..1

function blade(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = i / segs; pos.push(-1, t, 0, 1, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx);
  return g;
}

// The meadow is a crowd of blades (intent 0038), and thins as a crowd does (src/detail/error.js, as the plants' sprigs):
// drawing a first share of it leaves a blade out as far from one drawn as the cells drawn stand apart, so the share may
// thin only where its cells stand under a dial pixel apart, which is where its blades end (bandsOf). So no ring is
// fewer: every blade is drawn as it is, its own size in its own cells, out to there, the rings only bending it less
// (ringsOf); over the BAND past it they thin away, as every hand-over runs under its switch (src/detail/handover.js),
// one spread order deciding which go (rankOf), those left as they are, and the carpet under them takes what they no
// longer cover (src/terrain/material.js: the meadow averaged, by the blades' own share, endOf): the blades and the
// carpet one meadow either side, never a blade swollen to stand for it.
/** The share of the meadow's blades still drawn at `dist` metres as the 68° lens sees them (a node): all of it out to
    where they end (U.uMeadowEnd a BAND under that), none at U.uMeadowEnd. The blades thin by it, and the land's carpet
    under them reads it (src/terrain/material.js): one statistic either side of where the blades hand over to it. */
export const endOf = (dist) => float(1).sub(smoothstep(U.uMeadowEnd.div(BAND), U.uMeadowEnd, dist));
/** The meadow's mean top, metres, for an asset `height` tall: its mean blade (bladeIn: 0.5 of the asset's height, and
    r² 0.55 and its tuft's c² 0.8 more, each r and c 0 … 1: their means a third) at its tip, bowed by its mean bend
    (bladeIn: 0.2, and 0.55 r and 0.35 c more: their means a half) as bladeMaterial bows it there (0.42 of its bend). What
    the meadow is past its blades: the land raised by it (src/terrain/material.js), its tufts over it (pages.js). */
export const meanTop = (height) => height * (0.5 + 0.55 / 3 + 0.8 / 3) * (1 - 0.42 * (0.2 + 0.55 / 2 + 0.35 / 2));
/** How a blade is lit, its colour col (node code): the sun wrapped round it (n: its normal, rounded and softened to the
    meadow's whole), through it where the eye looks into the sun, and its sheen, the more of each the higher up it the
    point is (t, 0 at its foot, 1 at its tip); the sky's light on it. sun: the sun's light that reaches it, V the way to
    the eye. The meadow past its blades is lit by it as they are at their tips, its top (src/terrain/material.js). */
export const bladeLit = (col, n, V, t, sun) => {
  const ndl = n.dot(U.uSunDir).mul(0.5).add(0.5), thru = pow(max(V.negate().dot(U.uSunDir), 0), 2).mul(t);   // (light through the blade: the bright yellow-green of a lit meadow)
  const sheen = pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 20).mul(0.16).mul(t);
  return col.mul(skyLight(n).mul(t.mul(0.45).add(0.55)).add(sun.mul(ndl.mul(ndl).mul(1.1).add(vec3(0.5, 1, 0.22).mul(thru))))).add(sun.mul(sheen));
};

/** The meadow's rings, made from its blade alone (assets/grass.js `blade`), near to far: { segs, cell, P, w, e }. Every
    ring is the blade in its own cells (cell, w: half its width, as it is); ring k bends it in k fewer straight pieces
    than the blade's segs. Its error e is how far that misses the blade's curve (a bow of b metres in n straight pieces
    misses it by b / 4n²: the mean blade's, bladeIn's mean height 0.95 of the asset's, its bend 0.65, bowing 1.15 of
    that at its tip). A ring is made while it can come in where the blades are whole (bandsOf), at any measure (both go
    as K): while its error is under a cell (where the cells stand a dial pixel apart) and under the mean blade's height
    over GONE (where it is gone). Where each is drawn is bandsOf's. */
export function ringsOf(asset) {
  const B = asset.blade, h = asset.height * 0.95, bow = h * 0.65 * 1.15, ends = Math.min(B.cell, h / GONE), rings = [];
  for (let n = B.segs; n >= 1; n--) { const e = n === B.segs ? 0 : bow / (4 * n * n); if (e >= ends) break; rings.push({ segs: n, cell: B.cell, P: B.P, w: B.w, e }); }
  return rings;
}
/** Where the rings are drawn at a measure (K: dial pixels a metre covers at a metre: src/detail/measure.js dialK, the
    measure now), metres as the walker's 68° lens sees them: { end, bands: [{ near, nearFade, far, farFade }] a ring }.
    Ring k takes over where its error fits (e K: src/detail/error.js), its blades coming in over the BAND past there as
    the ring before's go. The meadow's blades end where the ring drawn there stands under a dial pixel apart (its cell
    covers `cell K` dial pixels at a metre): past that a field of them cannot be told from a surface with the same
    statistics, and nearer there no share of them may be left out (a first share of a crowd leaves a blade out as far
    from one drawn as its cells stand apart: above), so there and no nearer the carpet carries the meadow on
    (src/terrain/material.js: the blades' own share, endOf); nearer still where its mean blade is gone (GONE dial
    pixels: leaving it out differs by all of its height, src/detail/error.js goneAt). They are whole out to there and
    thin away over the BAND under it, as every hand-over runs under its switch (src/detail/handover.js): `end` is where
    the last of them has gone, a BAND past their end (the ground's map reaches it: src/scatter/ground.js reachOf). A
    ring that would only come in as they thin draws nothing (far 0). height: the asset's. */
export function bandsOf(rings, height, K) {
  const at = (k) => rings[k].e * K, end = Math.min((height * 0.95 * K) / GONE, rings[0].cell * K) * BAND;   // (every ring the blade in its own cells: ringsOf)
  const on = rings.map((_, k) => !k || at(k) * BAND < end);
  return { end, bands: rings.map((_, k) => {
    if (!on[k]) return { near: 0, nearFade: 0, far: 0, farFade: 0 };
    const next = on[k + 1] ? at(k + 1) : 0;
    return { near: k ? at(k) * BAND : -1, nearFade: k ? at(k) * (BAND - 1) : 0, far: next ? next * BAND : end, farFade: next ? next * (BAND - 1) : 0 };
  }) };
}

// (a blade's colour in one number: nine bits a channel over 0 … 2, as a float's bits, its exponent kept clear of nought
// and of the most, so no store flushes it or reads it as no number)
const packRGB = (c) => { const q = (x) => uint(clamp(x.mul(255.5), 0, 511)); return uintBitsToFloat(q(c.x).bitOr(q(c.y).shiftLeft(uint(9))).bitOr(q(c.z).shiftLeft(uint(18))).bitOr(uint(1 << 30))); };
const unpackRGB = (f) => { const u = floatBitsToUint(f); return vec3(float(u.bitAnd(uint(511))), float(u.shiftRight(uint(9)).bitAnd(uint(511))), float(u.shiftRight(uint(18)).bitAnd(uint(511)))).div(255.5); };

// what stands in a cell, for a ring's store (src/scatter/tier.js: resident): a blade where it may be of the ring for a
// camera within `pad` metres of where it is now (its band widened by that), as many as the ground says it grows there.
// Its place, the ground under it, its height, its lean and bend, its colour, a flower now and then; three vec4 (A: x, z,
// the ground's height, the blade's height; B: its heading, its bend, a hash for its flutter, a flower; C: its colour in
// one number, how much its tip has dried, its turn's share of what grows there (what the meadow's end thins it by), the
// hash its band's edge is drawn by). Done once per blade, as its region is packed.
function bladeIn(c, asset, T, ground, pad) {
  // three hashes carry everything a blade is; nothing is read before the blade is known to stand
  const h1 = hashI(c.x, c.y, uint(100));
  const pos = vec2(c).add(vec2(float(h1.bitAnd(uint(0xFFF))), float(h1.shiftRight(uint(12)).bitAnd(uint(0xFFF)))).mul(1 / 4096)).mul(T.cell);   // (T: its ring's numbers, uniforms: every ring one shader)
  // (and, the smallest layer of all, as thick as the light that comes down to it through the crowns over it lets it
  // grow, in proportion to that light (as a plant grows by the light it takes: Monteith 1977), and none on the ground
  // the larger things really cover, a trunk, a stem, a log, a branch, a stone, no more: src/scatter/growth.js, rule.js)
  const M = growthMap(), F = M ? M.all(pos) : null;
  const dist = camDist(pos), hf = u8(h1, 24), G = ground.A(pos), dens = F ? G.y.mul(F.light) : G.y, h2 = hashI(c.x, c.y, uint(101));
  const inBand = dist.lessThanEqual(hf.mul(T.farFade.negate()).add(T.far).add(pad)).and(dist.greaterThanEqual(hf.mul(T.nearFade.negate()).add(T.near).sub(pad)));
  const r1 = u8(h2, 0), r2 = u8(h2, 8), r3 = u8(h2, 16);
  // blades stand in tufts: the tuft they are in gives them a height, a lean and a shade in common
  const hc = hashI(int(floor(pos.x.div(0.6))), int(floor(pos.y.div(0.6))), uint(102)), c1 = u8(hc, 0), c2 = u8(hc, 8), c3 = u8(hc, 16);
  const tint = ground.tint(pos);
  const flower = step(0.985, r2).mul(float(1).sub(clamp(tint.a.sub(0.28).mul(1.6), 0, 1))).mul(BASE.grass.flowers ? 1 : 0);   // now and then a stalk with a small white head, not where it is dry
  const hgt = float(asset.height).mul(float(0.5).add(r1.mul(r1).mul(0.55)).add(c1.mul(c1).mul(0.8)).add(flower.mul(0.35))).mul(G.z).mul(dens.mul(0.4).add(0.6));
  const ang = c2.add(r2.sub(0.5).mul(0.55)).mul(6.2831853), bend = float(0.2).add(r3.mul(0.55)).add(c3.mul(0.35)).mul(float(1).sub(flower.mul(0.7)));
  const base = tint.rgb.mul(float(0.7).add(r3.mul(0.35)).add(c3.mul(0.35))), dried = clamp(tint.a.mul(1.2).add(r2.mul(0.35)).sub(0.25), 0, 1);
  // (as many as the ground says it grows there: a first share of the turns; towards the meadow's end fewer, as it is
  // drawn; and where one would stand, none on ground a larger thing covers: asked last, where it is asked at all)
  const rank = rankOf(c, u8(h2, 24)), grows = inBand.and(rank.lessThanEqual(dens)).toVar();
  if (F) If(grows, () => { If(F.foot().greaterThan(0.5), () => { grows.assign(bool(false)); }); });
  return { alive: grows, data: [vec4(pos, G.x, hgt), vec4(ang, bend, r1, flower), vec4(packRGB(base), dried, rank.div(dens.max(1e-6)), hf)] };
}
/** Of a blade held, whether its ring draws it now (its band, the meadow's end, the snow: a blade not much taller than the
    snow is deep lies bent under it), and its rows as its material reads them (C: its colour, how much its tip has dried). */
function bladeOf([A, B, C], T) {
  const dist = camDist(A.xy), hf = C.w, inBand = dist.lessThanEqual(hf.mul(T.farFade.negate()).add(T.far)).and(dist.greaterThanEqual(hf.mul(T.nearFade.negate()).add(T.near)));
  return { alive: inBand.and(C.z.lessThanEqual(endOf(dist))).and(A.w.greaterThan(snowDepth.mul(2.5))), data: [A, B, vec4(unpackRGB(C.x), C.y)] };
}

function bladeMaterial(T) {
  // shape(A, B, C): its vertex from what bladeIn packed, bent by the wind; lit in the fragment
  return () => {
    const vCol = varyingProperty('vec3', 'vCol'), vN = varyingProperty('vec3', 'vN'), vSide = varyingProperty('vec3', 'vSide'), vTS = varyingProperty('vec3', 'vTS'), vWorld = varyingProperty('vec3', 'vWorld');
    const shape = (A, B, C) => {
      const pos = A.xy, hgt = A.w, ang = B.x, r1 = B.z, flower = B.w;
      const bend = B.y.add(clamp(snowDepth.mul(3), 0, 0.6));   // snow weighs the blades down: deep, they bow over
      const dir = vec2(cos(ang), sin(ang)), side = vec2(dir.y.negate(), dir.x);
      const t = positionGeometry.y, s = positionGeometry.x, wd = T.w.mul(r1.mul(0.5).add(0.75)).mul(float(1).sub(t.mul(t).mul(0.8)));   // (w: the blade's half width, as it is in every ring)
      // the wind (src/world/light.js): the gust here, and each blade's own flutter, quicker and wider the harder it blows;
      // at the clock's time, and for the prepass at the clock as it stood a frame ago (where the blade was: its motion)
      const ws = windStrength, lean = t.mul(t).mul(1.1), fw = hgt.mul(bend).mul(t).mul(t).mul(1.15);   // long blades arc over
      const push = (time) => {
        const flutter = sin(time.mul(ws.mul(9).add(3)).add(r1.mul(6.2831853)).add(pos.x.mul(0.7))).mul(ws.mul(0.35).add(0.08));
        const k0 = windAt(pos, time).mul(flutter.add(1)).mul(float(1).sub(flower.mul(0.5))), kl = length(k0);
        return k0.mul(min(kl, 1.25).div(kl.max(1e-5)));   // in a storm a blade may lie nearly flat
      };
      const at = (k) => {   // pushed, it bows
        const up = hgt.mul(t).mul(float(1).sub(bend.mul(0.42).mul(t))).mul(float(1).sub(k.dot(k).mul(0.4).mul(t)));
        return vec3(pos.x, A.z, pos.y).add(vec3(side.x, 0, side.y).mul(s.mul(wd))).add(vec3(dir.x.mul(fw).add(k.x.mul(hgt).mul(lean)), up, dir.y.mul(fw).add(k.y.mul(hgt).mul(lean))));
      };
      const k = push(U.uTime), kk = k.dot(k), w = at(k);
      const tg = normalize(vec3(dir.x.mul(2).mul(bend).mul(t).add(k.x.mul(2.2).mul(t)), float(1).sub(bend.mul(0.6).mul(t)).sub(kk.mul(0.8).mul(t)), dir.y.mul(2).mul(bend).mul(t).add(k.y.mul(2.2).mul(t))));
      const sd = vec3(side.x, 0, side.y);
      vWorld.assign(w); vSide.assign(sd); vN.assign(cross(sd, tg)); vTS.assign(vec3(t, s, flower));
      vCol.assign(mix(C.rgb, vec3(0.42, 0.34, 0.15), smoothstep(0.5, 1, t).mul(max(C.w, clamp(snowDepth.mul(2.5), 0, 0.65)))).mul(mix(0.14, 1.45, t.mul(t.mul(0.4).add(0.6)))));   // dark in the thick of it, light at the tips; in snow, pale and straw-coloured
      return clipOf(w, at(push(U.uTimeWas)));
    };
    const frag = Fn((builder) => {
      if (passOf(builder) === 'pre') return motion(vWas, 1);   // (the prepass: where it lay a frame ago; a blade is thin)
      const vT = vTS.x, n0 = normalize(vN.add(vSide.mul(vTS.y).mul(0.6)));   // a blade is a little rounded
      const n = normalize(frontFacing.select(n0, n0.negate()).add(vec3(0, 1.4, 0)));   // and a meadow lights as a soft whole
      const V = normalize(U.uCam.sub(vWorld));
      const sun = U.uSun.mul(cloudAtOne(vWorld));   // one sample of the shadow map: a blade is too thin for a soft edge to show
      const onIt = max(clamp(snowDepth.mul(4), 0, 0.4).mul(float(1).sub(smoothstep(0.05, 0.5, vT))), clamp(snowDepth.mul(2.5), 0, 0.6).mul(smoothstep(0.3, 0.8, n0.y.abs())).mul(smoothstep(0.3, 0.8, vT)));   // snow at the foot, and lying on what bows over
      const col0 = bladeLit(weathered(mix(vCol, SNOW, onIt), n, 9), n, V, vT, sun);
      const col = vTS.z.greaterThan(0.5).and(vT.greaterThan(0.86)).select(vec3(0.92, 0.92, 0.86).mul(skyLight(n).add(U.uSun.mul(0.7))), col0);
      return finish(col, vWorld);
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide; m.userData.pre = true;   // (it takes part in the prepass: src/core/pass.js)
    return { m, shape };
  };
}

/** The asset `grass`: a tier a ring (ringsOf). gpu: on WebGPU, what stands is packed by a compute pass (tier.js). Each
    ring's band is the measure's (bandsOf), reckoned again as it changes (the window, the governor's ratio, the dial:
    tier.js reband), its numbers uniforms. ?truth is the dial (src/detail/measure.js): its rings and its end by the same
    rule, at its own pixel. */
export function createGrass(scene, tex, ground, asset, gpu = false) {
  const rings = asset.tiers, now = () => bandsOf(rings, asset.height, dialK());
  U.uMeadowTop.value = meanTop(asset.height);   // (what the carpet is raised to past the blades: src/terrain/material.js)
  // (the rings pack as one kind of tier, tier.js: their store and their gather one piece of code, compiled once, over
  // numbers of the kind's own (P) that each ring tells before it packs; its draws read its own (T))
  const P = { cell: uniform(0), near: uniform(0), nearFade: uniform(0), far: uniform(0), farFade: uniform(0) }, kind = {};
  const found = (c, Q) => bladeIn(c, asset, P, ground, Q.pad), select = (rows) => bladeOf(rows, P);
  return rings.map((R, k) => {
    const T = { cell: uniform(R.cell), w: uniform(R.w), near: uniform(0), nearFade: uniform(0), far: uniform(0), farFade: uniform(0) };
    // (without WebGPU its store and its gather at once, per vertex, by its own numbers)
    const live = (c) => { const F = bladeIn(c, asset, T, ground, float(0)), S = bladeOf(F.data, T); return { alive: F.alive.and(S.alive), data: S.data }; };
    const make = bladeMaterial(T);
    const material = (src) => {
      const { m, shape } = make();
      m.vertexNode = src.read ? Fn(() => shape(src.read(0), src.read(1), src.read(2)))()   // ready-made by the compute pass
        : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive, () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out here, per vertex
      return m;
    };
    // a blade's box, for the eye's culling (src/core/occlusion.js): from its foot up its height, out as far as it bends
    // (bowed deepest under snow) and its widest (its half width, at most 1.25 of the blade's: bladeMaterial); the wind
    // leans its tip its height a unit of the wind's push (bladeMaterial: never more than 1.25 of it)
    const wide = R.w * 1.25;
    const bounds = (A, B) => { const h = A.w, reach = h.mul(B.y.add(0.6).mul(1.15)).add(wide + 0.02); return { c: vec3(A.x, A.z.add(h.mul(0.5)), A.y), h: vec3(reach, h.mul(0.5).add(0.02), reach), w: h.mul(1.1) }; };
    const t = new Tier(scene, blade(R.segs), material, { cell: R.cell, P: R.P, near: 0, far: 0, order: 0, found, select, kind, table: () => { for (const key in P) P[key].value = T[key].value; }, metres: true, gpu, slots: 3, bounds, cls: 'ground' });
    t.band = () => {   // (its band as the measure is now: tier.js reckons every tier's again when it changes)
      const N = now(), b = N.bands[k];
      for (const key of ['near', 'nearFade', 'far', 'farFade']) T[key].value = b[key];
      U.uMeadowEnd.value = N.end; t.near = Math.max(0, b.near - b.nearFade); t.far = b.far;
    };
    t.band();
    if (growthMap()) t.reads = growthMap().version;   // (packed again when what grows over it changes)
    return t;
  });
}

// a tuft for the library's list: a few dozen blades as plain strips in the meadow's greens (a picture, not the engine's own)
function tuft(height) {
  const pos = [], col = [], R = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < 70; i++) {
    const a = R(i) * 6.283, r = Math.sqrt(R(i + 0.5)) * 0.22, x = Math.cos(a) * r, z = Math.sin(a) * r, h = height * (0.45 + 0.6 * R(i + 0.25)), lean = (R(i + 0.75) - 0.5) * 0.5, tw = R(i + 0.1) * 6.283;
    const sx = Math.cos(tw) * 0.012, sz = Math.sin(tw) * 0.012, tx = x + Math.cos(a) * lean * h, tz = z + Math.sin(a) * lean * h, g = 0.5 + 0.5 * R(i + 0.33);
    pos.push(x - sx, 0, z - sz, x + sx, 0, z + sz, tx, h, tz);
    col.push(0.05 * g, 0.13 * g, 0.03 * g, 0.05 * g, 0.13 * g, 0.03 * g, 0.2 * g, 0.42 * g, 0.1 * g);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

/** A scatter engine (src/scatter/index.js finds it): what an asset's placement.engine 'grass' names. */
export const engine = {
  id: 'grass',
  row: (a) => ({ ...scatterRow(a), height: a.height, tiers: ringsOf(a) }),   // its blade's height and its rings (made from its blade: ringsOf), over the common row
  create: createGrass,
  // the library: a tuft for the list; on the stage the meadow itself, grown over the bare round (src/stage/studio.js)
  thumb: (tex, row) => ({ things: [tuft(row.height)], eye: [0.55, 0.42, 0.75], look: [0, row.height * 0.42, 0] }),
  stage(tex, row, { studio }) { studio.round(0); studio.grow(); return new THREE.Group(); },
  frame: (a) => ({ height: a.height, dist: 4.2, pitch: 0.3, span: a.height }),
};
