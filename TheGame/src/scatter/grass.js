// Grass: instanced blades. A blade's place, height, bend, colour and dryness are hashed from its cell; its density comes
// from the ground pass (ground.js); the wind bends it (windAt) and each blade flutters on its own. Rings round the
// camera, made from the grass's blade alone (assets/grass.js: its full detail: ringsOf) and each where its own error is
// the one ERROR_PX (bandsOf, as the measure is now): every blade as it is, in its own cells, its bends fewer further off.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, bool, vec2, vec3, vec4, ivec2, If, min, uniform, varyingProperty, positionGeometry, frontFacing, mix, smoothstep, step, clamp, normalize, cross, cos, sin, pow, max, length, floor, uintBitsToFloat, floatBitsToUint, exp, sqrt } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { hashI, camDist, BASE } from '../world/land.nodes.js';
import { BIOMES } from '../world/biomes.js';
import { HMIN, HMAX } from '../world/land.js';
import { lit, weathered, windAt, windStrength, snowDepth, SNOW } from '../world/light.js';
import { passOf, motion, vWas } from '../core/pass.js';
import { gWrite, lightFamily, FAMILY } from '../core/gbuffer.js';
import { Tier, offScreen, clipOf } from './tier.js';
import { scatterRow } from '../../assets/index.js';
import { dialK } from '../detail/measure.js';
import { BAND, GONE } from '../detail/error.js';
import { rankOf } from './rule.js';
import { growthMap } from './growth.js';   // (a blade's turn in the one spread order, as everything placed has it)
import { ARRIVED, sinkInto } from '../detail/handover.js';

const u8 = (h, sh) => float(h.shiftRight(uint(sh)).bitAnd(uint(0xFF))).mul(1 / 256);   // one byte of a hash, 0..1

// ---- how a blade looks, and so the meadow its blades make ----
// One place for it: the blade wears it (bladeMaterial), and the carpet that stands for the blades past their end is what
// they average to as the eye sees them there (meadowTip: src/terrain/layers.js lays it in the land's layer map, the
// carpet's colour, src/terrain/material.js laid), so where the blades hand over to it nothing changes.
/** The straw a blade's tip dries to. */
const straw = () => vec3(0.42, 0.34, 0.15);
/** A blade's value up it (t: 0 at its foot, 1 at its tip): dark in the thick of it, light at its tip. */
export const valueUp = (t) => mix(0.14, 1.45, t.mul(t.mul(0.4).add(0.6)));
/** The tuft a blade at p stands in (blades stand in tufts 0.6 m across: a height, a lean and a shade in common): its hash. */
const tuftHash = (p) => hashI(int(floor(p.x.div(0.6))), int(floor(p.y.div(0.6))), uint(102));
/** The shade of the tuft at p, 0 … 1 (its hash's third byte, c3: bladeIn). */
export const tuftShade = (p) => u8(tuftHash(p), 16);
/** How much a blade's tip has dried where the grass's dryness is a, over its own hash (bladeIn: clamp(1.2 a + 0.35 r2 -
    0.25, 0, 1), r2 even over 0 … 1): its expectation, the clamp's integral over r2. */
const driedOf = (a) => { const lo = a.mul(1.2).sub(0.25), F = (u) => { const c = clamp(u, 0, 1); return c.mul(c).mul(0.5).add(max(u.sub(1), 0)); }; return F(lo.add(0.35)).sub(F(lo)).div(0.35); };
/** The meadow as the eye sees it along the ground, where its blades are too many to tell apart: their tips (the eye's ray
    meets a field of them within a hair of its top, at any distance past a few metres), over their own hashes: the
    grass's tint there (rgb) and its dryness (a), the tuft's shade (c3; 0.5, the mean, where many tufts are averaged). As
    a blade's tip is drawn (bladeMaterial): its shade (0.7 + 0.35 r3 + 0.35 c3, r3's mean 0.5), dried to straw as much as
    it is, at its tip's value. */
export const meadowTip = (tint, a, c3) => mix(tint.mul(float(0.875).add(c3.mul(0.35))), straw(), driedOf(a)).mul(valueUp(float(1)));
/** The meadow's blades as optics, a square metre of them where it all grows (one a cell): their area upright, as a ray
    along the ground meets it (over their headings, 2/π of a flat blade's), and from above (their arcs), m² a m². The mean
    blade as bladeMaterial draws it: 2w wide (r1's mean width), tapering by 1 - 0.8 t², rising t (1 - 0.42 bend t) of its
    height and arcing out 1.15 bend t² of it; bladeIn's mean height and bend (as meanTop). height: the asset's; R: a ring
    (its cell and the blade's half width w, as they are in every ring: ringsOf). -> [upright, from above] */
export const opticsOf = (height, R) => {
  const h = height * (0.5 + 0.55 / 3 + 0.8 / 3), b = 0.2 + 0.55 / 2 + 0.35 / 2, W = 2 * R.w, rho = 1 / (R.cell * R.cell);
  const up = W * h * (1 - 0.8 / 3 - 0.42 * b + (0.42 * b * 0.8) / 2), out = W * h * 2.3 * b * (1 / 2 - 0.8 / 4);   // (the width up its rise and along its arc, t 0 … 1)
  return [(rho * up * 2) / Math.PI, rho * out];
};
/** The meadow past its blades as the eye sees it from where it is (node code): e, the way to the eye (a unit vec3);
    cover, how much of the meadow grows there (0 … 1). A ray down at γ through the layer the blades stand in meets
    cover x (their upright area / tan γ + their area from above) of them (U.uMeadowOptics: opticsOf), τ: the share
    e^-τ of rays reaches the floor between them, the rest meet a blade first at the mean depth into the layer of an
    exponential cut at its foot. -> { shade: what shows, of the tips' value (a blade's value where it is met, valueUp;
    the floor's, underShade), t: how far up the blades it meets them (their light: bladeLight) } */
export const meadowSeen = (e, cover) => {
  const s = clamp(e.y, 1e-3, 1), tg = s.div(sqrt(float(1).sub(s.mul(s)).max(1e-6)));
  const tau = cover.mul(U.uMeadowOptics.x.div(tg).add(U.uMeadowOptics.y)).max(1e-4).toVar(), hit = float(1).sub(exp(tau.negate())).toVar();
  const depth = tau.lessThan(0.05).select(float(0.5).sub(tau.div(12)), float(1).div(tau).sub(exp(tau.negate()).div(hit)));   // (the exponential's mean over 0 … 1; its series where τ is small)
  const t = clamp(float(1).sub(depth), 0, 1);
  return { shade: hit.mul(valueUp(t)).div(valueUp(float(1))).add(float(1).sub(hit).mul(underShade())), t };
};
/** How much darker the floor under standing blades is than their tips, as seen from above between them: a blade's value
    over its lower half (what shows of it down there) to its tip's (node). Its mean over the lower half by two points
    (Gauss-Legendre's, exact for the value's quadratic). */
export const underShade = () => valueUp(float(0.25 - 0.25 / Math.sqrt(3))).add(valueUp(float(0.25 + 0.25 / Math.sqrt(3)))).mul(0.5).div(valueUp(float(1)));

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
/** How a blade is lit, as the one light takes it (src/world/light.js lit: these are its numbers): the sun wrapped round it
    (n: its normal, rounded and softened to the meadow's whole: half Lambert, squared), through it where the eye looks
    into the sun (the bright yellow-green of a lit meadow), and its sheen, the more of each the higher up it the point is
    (t, 0 at its foot, 1 at its tip); the sky's light on it the more, too. The meadow past its blades is lit by it as they
    are at their tips, its top (src/terrain/material.js). */
export const bladeLight = (n, t) => {
  const hl = n.dot(U.uSunDir).mul(0.5).add(0.5);
  return { ndl: hl.mul(hl).mul(1.1), through: t, lobe: 2, tint: vec3(0.5, 1, 0.22), sky: t.mul(0.45).add(0.55), gloss: t.mul(0.16), sharp: 20 };
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

// ---- a blade, in one row ----
// Every blade round the camera is held (src/scatter/tier.js: a ring's store holds all of its regions), so a blade is held
// as one vec4, four words: what the ground said where it grew (its cell, the ground's height there, its own height, the
// grass's colour and how dry it is there, how much grows there), not what its cell's hashes say (its place in the cell,
// its heading, bend, flutter, flower, shade, its turn), worked out again where it is read (cellOf). Each word a float's
// bits, its exponent kept clear of nought and of the most (bit 30 set, 27 bits a word), so no store flushes it or reads
// it as no number:
//   0: the cell's x (19 bits, ±2^18 cells: ±22 km at the blade's 0.085 m) | how dry the grass is there (8)
//   1: the cell's z (19) | how much grows there (8: a blade's turn's share of it, the meadow's end, bladeOf)
//   2: the grass's colour there, nine bits a channel over 0 … 2
//   3: the ground's height (16 bits over HMIN … HMAX: 2 mm) | the blade's height (10, over 0 … its tallest)
const word = (u) => uintBitsToFloat(u.bitOr(uint(1 << 30))), bits = (f) => floatBitsToUint(f).bitAnd(uint((1 << 27) - 1));
const field = (w, at, n) => w.shiftRight(uint(at)).bitAnd(uint((1 << n) - 1));
const toQ = (x, lo, hi, n) => uint(clamp(x.sub(lo).div(hi - lo), 0, 1).mul((1 << n) - 1).add(0.5)), fromQ = (u, lo, hi, n) => float(u).mul((hi - lo) / ((1 << n) - 1)).add(lo);
const rgb9 = (x) => uint(clamp(x.mul(255.5), 0, 511)), mid19 = (x) => x.add(1 << 18);   // (a cell's place about the middle of its 19 bits)
/** What cell c's hashes say of the blade in it (node code): its place (pos, metres), the hash its band's edge is drawn
    by (hf), its own (r1 … r3) and its tuft's (c1 … c3: blades stand in tufts, a height, a lean and a shade in common),
    and its turn in the one spread order (`turn`, a byte of h2). T: its ring's numbers. */
const cellOf = (c, T) => {
  const h1 = hashI(c.x, c.y, uint(100)), h2 = hashI(c.x, c.y, uint(101));
  const pos = vec2(c).add(vec2(float(h1.bitAnd(uint(0xFFF))), float(h1.shiftRight(uint(12)).bitAnd(uint(0xFFF)))).mul(1 / 4096)).mul(T.cell).toVar();   // (T: its ring's numbers, uniforms: every ring one shader)
  const hc = tuftHash(pos);
  return { pos, hf: u8(h1, 24), r1: u8(h2, 0), r2: u8(h2, 8), r3: u8(h2, 16), turn: u8(h2, 24), c1: u8(hc, 0), c2: u8(hc, 8), c3: u8(hc, 16) };
};
/** A blade's flower, heading, bend, colour and dried tip from its cell's hashes (K: cellOf's) and the grass there (rgb,
    its dryness a): the one place they are worked out, as it is made and as it is drawn. */
const looksOf = (K, rgb, a) => {
  const flower = step(0.985, K.r2).mul(float(1).sub(clamp(a.sub(0.28).mul(1.6), 0, 1))).mul(BASE.grass.flowers ? 1 : 0);   // now and then a stalk with a small white head, not where it is dry
  return { flower, ang: K.c2.add(K.r2.sub(0.5).mul(0.55)).mul(6.2831853), bend: float(0.2).add(K.r3.mul(0.55)).add(K.c3.mul(0.35)).mul(float(1).sub(flower.mul(0.7))),
    base: rgb.mul(float(0.7).add(K.r3.mul(0.35)).add(K.c3.mul(0.35))), dried: clamp(a.mul(1.2).add(K.r2.mul(0.35)).sub(0.25), 0, 1) };
};
/** A blade held, as its row says (node code): its cell's hashes again (cellOf), the ground's height there (gh), its
    height, the grass's colour and dryness, how much grows there. tallest: the most a blade's height may be (metres). */
const rowOf = (A, T, tallest) => {
  const w0 = bits(A.x), w1 = bits(A.y), w2 = bits(A.z), w3 = bits(A.w);
  const c = ivec2(int(field(w0, 0, 19)).sub(1 << 18), int(field(w1, 0, 19)).sub(1 << 18));
  return { ...cellOf(c, T), c, a: fromQ(field(w0, 19, 8), 0, 1, 8), dens: fromQ(field(w1, 19, 8), 0, 1, 8), rgb: vec3(float(field(w2, 0, 9)), float(field(w2, 9, 9)), float(field(w2, 18, 9))).div(255.5),
    gh: fromQ(field(w3, 0, 16), HMIN, HMAX, 16), hgt: fromQ(field(w3, 16, 10), 0, tallest, 10) };
};

// what stands in a cell, for a ring's store (src/scatter/tier.js: resident): a blade where it may be of the ring for a
// camera within `pad` metres of where it is now (its band widened by that), as many as the ground says it grows there,
// held as its row (above). Done once per blade, as its region is packed.
function bladeIn(c, asset, T, ground, pad, tallest) {
  // its cell's hashes carry everything a blade is; nothing is read before the blade is known to stand
  const K = cellOf(c, T), pos = K.pos;
  // (and, the smallest layer of all, as thick as the light that comes down to it through the crowns over it lets it
  // grow, in proportion to that light (as a plant grows by the light it takes: Monteith 1977), and none on the ground
  // the larger things really cover, a trunk, a stem, a log, a branch, a stone, no more: src/scatter/growth.js, rule.js)
  const M = growthMap(), F = M ? M.all(pos) : null;
  const dist = camDist(pos), G = ground.A(pos), dens = (F ? G.y.mul(F.light) : G.y).toVar();
  const inBand = dist.lessThanEqual(K.hf.mul(T.farFade.negate()).add(T.far).add(pad)).and(dist.greaterThanEqual(K.hf.mul(T.nearFade.negate()).add(T.near).sub(pad)));
  const tint = ground.tint(pos), L = looksOf(K, tint.rgb, tint.a);
  const hgt = float(asset.height).mul(float(0.5).add(K.r1.mul(K.r1).mul(0.55)).add(K.c1.mul(K.c1).mul(0.8)).add(L.flower.mul(0.35))).mul(G.z).mul(dens.mul(0.4).add(0.6));
  // (as many as the ground says it grows there: a first share of the turns; towards the meadow's end fewer, as it is
  // drawn; and where one would stand, none on ground a larger thing covers: asked last, where it is asked at all)
  const grows = inBand.and(rankOf(c, K.turn).lessThanEqual(dens)).toVar();
  if (F) If(grows, () => { If(F.foot().greaterThan(0.5), () => { grows.assign(bool(false)); }); });
  const row = vec4(word(uint(mid19(c.x)).bitOr(toQ(tint.a, 0, 1, 8).shiftLeft(uint(19)))), word(uint(mid19(c.y)).bitOr(toQ(dens, 0, 1, 8).shiftLeft(uint(19)))),
    word(rgb9(tint.r).bitOr(rgb9(tint.g).shiftLeft(uint(9))).bitOr(rgb9(tint.b).shiftLeft(uint(18)))), word(toQ(G.x, HMIN, HMAX, 16).bitOr(toQ(hgt, 0, tallest, 10).shiftLeft(uint(16)))));
  return { alive: grows, data: [row] };
}
/** Of a blade held, whether its ring draws it now (its band, the meadow's end, the snow: a blade not much taller than
    the snow is deep lies bent under it); its row as it is. */
function bladeOf([A], T, tallest) {
  const B = rowOf(A, T, tallest), dist = camDist(B.pos), inBand = dist.lessThanEqual(B.hf.mul(T.farFade.negate()).add(T.far)).and(dist.greaterThanEqual(B.hf.mul(T.nearFade.negate()).add(T.near)));
  return { alive: inBand.and(rankOf(B.c, B.turn).div(B.dens.max(1e-6)).lessThanEqual(endOf(dist))).and(B.hgt.greaterThan(snowDepth.mul(2.5))), data: [A] };
}

/** A blade's parts in the G-buffer (src/core/gbuffer.js): the blade, or a flower's head at its tip. */
const PART = Object.fromEntries(['blade', 'head'].map((name, at) => [name, at]));
/** A meadow lit, as a blade takes the light (bladeLight: softly round, the sun through its blades the bright yellow-green
    of a lit meadow, a sheen along them); one sample of the shadow map: a blade is too thin for a soft edge to show. A
    flower's head (head: a bool node) takes it plainly. colour, n, w: as lit's; t: how far up its blade (bladeLight). */
const meadowLit = ({ colour, n, w, t, head }) => {
  const B = bladeLight(n, t);
  return lit({ colour, n, w, how: 'one', ndl: head.select(float(0.7), B.ndl), through: head.select(float(0), B.through), lobe: B.lobe, tint: B.tint,
    sky: head.select(float(1), B.sky), gloss: head.select(float(0), B.gloss), sharp: B.sharp });
};
let said = false;
/** The meadow's light, said once (gbuffer.js lightFamily): its blades lit where the prepass left them, in the one pass
    of light; t, how far up its blade, is its own first number (gWrite own, below). */
const sayLight = () => { if (!said) { said = true; lightFamily(FAMILY.grass, (f) => meadowLit({ colour: f.colour, n: f.n, w: f.w, t: f.own[0], head: f.part.equal(uint(PART.head)) })); } };

function bladeMaterial(T, tallest) {
  // shape(A): its vertex from the blade's row (bladeIn), bent by the wind; lit in the fragment
  return () => {
    const vCol = varyingProperty('vec3', 'vCol'), vN = varyingProperty('vec3', 'vN'), vSide = varyingProperty('vec3', 'vSide'), vTS = varyingProperty('vec3', 'vTS'), vWorld = varyingProperty('vec3', 'vWorld');
    const shape = (A) => {
      const R = rowOf(A, T, tallest), L = looksOf(R, R.rgb, R.a), pos = R.pos, hgt = R.hgt, ang = L.ang, r1 = R.r1, flower = L.flower, C = vec4(L.base, L.dried);
      const bend = L.bend.add(clamp(snowDepth.mul(3), 0, 0.6));   // snow weighs the blades down: deep, they bow over
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
      // pushed, it bows; and a ring that came after the first view rises out of the ground as it comes, as every last
      // level sinks into it (its mesh's arrival, src/core/screen.js: sinkInto, src/detail/handover.js)
      const at = (k) => {
        const up = hgt.mul(t).mul(float(1).sub(bend.mul(0.42).mul(t))).mul(float(1).sub(k.dot(k).mul(0.4).mul(t)));
        return vec3(pos.x, R.gh, pos.y).add(sinkInto(vec3(side.x, 0, side.y).mul(s.mul(wd)).add(vec3(dir.x.mul(fw).add(k.x.mul(hgt).mul(lean)), up, dir.y.mul(fw).add(k.y.mul(hgt).mul(lean)))), ARRIVED));
      };
      const k = push(U.uTime), kk = k.dot(k), w = at(k);
      const tg = normalize(vec3(dir.x.mul(2).mul(bend).mul(t).add(k.x.mul(2.2).mul(t)), float(1).sub(bend.mul(0.6).mul(t)).sub(kk.mul(0.8).mul(t)), dir.y.mul(2).mul(bend).mul(t).add(k.y.mul(2.2).mul(t))));
      const sd = vec3(side.x, 0, side.y);
      vWorld.assign(w); vSide.assign(sd); vN.assign(cross(sd, tg)); vTS.assign(vec3(t, s, flower));
      vCol.assign(mix(C.rgb, straw(), smoothstep(0.5, 1, t).mul(max(C.w, clamp(snowDepth.mul(2.5), 0, 0.65)))).mul(valueUp(t)));   // dark in the thick of it, light at the tips; in snow, pale and straw-coloured
      return clipOf(w, at(push(U.uTimeWas)));
    };
    const frag = Fn((builder) => {
      const vT = vTS.x, n0 = normalize(vN.add(vSide.mul(vTS.y).mul(0.6)));   // a blade is a little rounded
      const n = normalize(frontFacing.select(n0, n0.negate()).add(vec3(0, 1.4, 0)));   // and a meadow lights as a soft whole
      const head = vTS.z.greaterThan(0.5).and(vT.greaterThan(0.86));   // (a flower's head: pale, at a blade's tip)
      const onIt = max(clamp(snowDepth.mul(4), 0, 0.4).mul(float(1).sub(smoothstep(0.05, 0.5, vT))), clamp(snowDepth.mul(2.5), 0, 0.6).mul(smoothstep(0.3, 0.8, n0.y.abs())).mul(smoothstep(0.3, 0.8, vT)));   // snow at the foot, and lying on
      const colour = head.select(vec3(0.92, 0.92, 0.86), weathered(mix(vCol, SNOW, onIt), n, 9));
      // (the prepass: where it lay a frame ago, and what its light needs, lit where its pixels are in the one pass of
      // light (src/core/gbuffer.js): the screen draws it once. Drawn anywhere else, lit here)
      if (passOf(builder) === 'pre') { gWrite({ family: FAMILY.grass, part: head.select(uint(PART.head), uint(PART.blade)), colour, n, w: vWorld, own: [vT] }); return motion(vWas, 1); }
      return meadowLit({ colour, n, w: vWorld, t: vT, head });
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide; m.userData.pre = true; m.userData.deferred = true;   // (it takes part in the prepass, and is lit in the pass of light: no colour pass of its own, src/core/pass.js)
    sayLight();
    return { m, shape };
  };
}

/** The asset `grass`: a tier a ring (ringsOf). gpu: on WebGPU, what stands is packed by a compute pass (tier.js). Each
    ring's band is the measure's (bandsOf), reckoned again as it changes (the window, the governor's ratio, the dial:
    tier.js reband), its numbers uniforms. ?truth is the dial (src/detail/measure.js): its rings and its end by the same
    rule, at its own pixel. On WebGPU the rings are one kind of tier (tier.js kindOf: one store, one set of its passes),
    each ring's band told the kind's numbers before it packs (table), and drawn by one material wherever they read alike
    (src.share: their kind, their culling): every ring is the blade in its own cells (ringsOf: the asset's cell and half
    width), so all a material reads of its ring is what its mesh tells (where its things lie, its culling, its arrival).
    (2026-11-19: a material and a set of passes a ring, each built again with the same code.) Each ring's meshes tell
    where its band begins (userData.near): what lies past the near cascade comes after the first view, and rises. */
export function createGrass(scene, tex, ground, asset, gpu = false) {
  const rings = asset.tiers, now = () => bandsOf(rings, asset.height, dialK());
  // (the tallest a blade stands: its own most (bladeIn: 0.5 of the asset's height, and its own and its tuft's share, a
  // flower's stalk) in the tallest grass a biome grows (its `height`, times the asset's))
  const tallest = asset.height * (0.5 + 0.55 + 0.8 + 0.35) * Math.max(1, ...BIOMES.map((b) => b.grass?.height ?? 1));
  U.uMeadowTop.value = meanTop(asset.height);   // (what the carpet is raised to past the blades: src/terrain/material.js)
  U.uMeadowOptics.value.set(...opticsOf(asset.height, rings[0]));   // (how much of it shows from where the eye is: meadowSeen)
  const BANDS = ['near', 'nearFade', 'far', 'farFade'], numbers = (R) => ({ cell: uniform(R.cell), w: uniform(R.w), ...Object.fromEntries(BANDS.map((key) => [key, uniform(0)])) });
  const KIND = numbers(rings[0]), mats = new Map();   // (the kind's numbers, what packs every ring; its materials, by what they read)
  return rings.map((R, k) => {
    const own = numbers(R), T = gpu ? KIND : own;   // (a ring's own band; what reads it: the kind's, told it before it packs, or, worked out per vertex without WebGPU, its own)
    // (its store and its gather: tier.js; without WebGPU both at once, per vertex)
    const found = (c, Q) => bladeIn(c, asset, T, ground, Q.pad, tallest), select = (rows) => bladeOf(rows, T, tallest);
    const live = (c) => { const F = found(c, { pad: float(0) }), S = select(F.data); return { alive: F.alive.and(S.alive), data: S.data }; };
    const make = bladeMaterial(T, tallest);
    const material = (src) => {
      if (src.share && mats.has(src.share)) return mats.get(src.share);
      const { m, shape } = make();
      m.vertexNode = src.read ? Fn(() => shape(src.read(0)))()   // ready-made by the compute pass
        : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive, () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out here, per vertex
      if (src.share) mats.set(src.share, m);
      return m;
    };
    // a blade's box, for the eye's culling (src/core/occlusion.js): from its foot up its height, out as far as it bends
    // (bowed deepest under snow) and its widest (its half width, at most 1.25 of the blade's: bladeMaterial); the wind
    // leans its tip its height a unit of the wind's push (bladeMaterial: never more than 1.25 of it); its row read as the
    // material reads it
    const wide = R.w * 1.25;
    const bounds = (A) => { const B = rowOf(A, T, tallest), L = looksOf(B, B.rgb, B.a), h = B.hgt, reach = h.mul(L.bend.add(0.6).mul(1.15)).add(wide + 0.02); return { c: vec3(B.pos.x, B.gh.add(h.mul(0.5)), B.pos.y), h: vec3(reach, h.mul(0.5).add(0.02), reach), w: h.mul(1.1) }; };
    const table = () => { for (const key of BANDS) KIND[key].value = own[key].value; };
    const t = new Tier(scene, blade(R.segs), material, { cell: R.cell, P: R.P, near: 0, far: 0, order: 0, found, select, metres: true, gpu, slots: 1, bounds, cls: 'ground', kind: KIND, table, label: 'the meadow' });
    t.band = () => {   // (its band as the measure is now: tier.js reckons every tier's again when it changes)
      const N = now(), b = N.bands[k];
      for (const key of BANDS) own[key].value = b[key];
      U.uMeadowEnd.value = N.end; t.near = Math.max(0, b.near - b.nearFade); t.far = b.far;
      for (const m of t.meshes) m.userData.near = t.near;   // (where its band begins, metres: what the first view waits for, src/core/screen.js)
    };
    t.band(); t.label(`grass, ring ${k}`);
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
