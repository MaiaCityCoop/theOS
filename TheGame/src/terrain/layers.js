// The land's layer map (intent 0038, stages 6a and 6b, after Etienne, "Large Scale Terrain Rendering in Call of Duty",
// SIGGRAPH 2023 Advances): where each of the ground's layers lies, worked out by the GPU from the biomes' own rules
// (biomes/*.js: where) at the points of a grid, not again in every pixel of every frame. The grid is a page's own (since
// 6b): every page of the land's virtual texture (src/terrain/pages.js) works out the map's points over it, eight of its
// texels apart, once, as it is made, and lays its texels from the four points round each (layersFrom), at most five
// layers, whatever the number of biomes and materials: the shaders are one size, the biomes are data. Its points are the
// land's, not the camera's: a point is worked out alike whenever and from wherever it is asked, so pages made at
// different times meet without a seam, and a page made for a longer lens has a finer map under it.
//
// A point holds, packed in four 32-bit words and one more (layerWords):
//   the layers laid there   the four strongest (LAYERS below: a byte each, their place in the order they are laid) and
//                           their shares (a byte each), the material's height left out: that is the texel's own
//   the grass's carpet      how much of the ground it covers: near (the bare patches cut out), between, and far (its tufts
//                           let go); and the slow variation of every ground's colour (macro)
//   the stands' cover       the two thickest stands (STANDS below): how much of the ground their crowns cover there (the
//                           rule's own expectation: src/scatter/rule.js densOf) and their crowns' pattern
//   the grass's colour      the meadow's as its blades' tips show it (the carpet's), and which two stands those are
import * as THREE from 'three/webgpu';
import { If, Loop, float, int, uint, vec2, vec3, abs, max, min, clamp, smoothstep, log2, sqrt, round, uniformArray, renderGroup } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { byRole } from '../core/registry.js';
import { riverInfo, biomesAt, grassFrom, groveAt, leadAt, pathN, pathMask, bareMask, outcropMask, placeOff, stageAt, grassTint, BASE, LAID, PATH_W } from '../world/land.nodes.js';
import { endOf, meadowTip } from '../scatter/grass.js';
import { byte, un } from '../scatter/growth.js';
import { BAND } from '../detail/error.js';
import { standsOf, rowsOf, densOf } from '../scatter/rule.js';
import { detailOf } from '../detail/index.js';
import { seenOf, seenVersion } from '../detail/seen.js';
import { sizeOf, most } from '../../assets/kinds.js';
import { FOOT } from '../../assets/kit/plant.js';
const noise = byRole('noise');   // the baked cloudy noise: whichever material plays that part (its `role`)

const EMPTY = 255, NO_STAND = 15;
/** The finest scale of a stand's crowns' pattern, metres a grain (what of it a texel can hold: src/terrain/material.js). */
export const CROWNS = 9.3;
/** Texels of a page between the layer map's points (src/terrain/pages.js lays a page from them): what of a layer's
    pattern a page can hold. */
export const MAPN = 8;

// ---- the ground's layers, in the order they are laid (lowest first): a layer's id is its place here ----
// (each: its ground { material, tile }; where it is let go: `meadow`, as the meadow's blades go (its bare patches: the
// carpet over them past the blades holds them averaged), or `size`, its pattern's own (metres), kept as long as the layer
// map holds it (over two of its points at the page's texel: the dial's pixel sets that), handed over within BAND; else
// never)
export const LAYERS = [];
const lay = (o) => (LAYERS.push(o), LAYERS.length - 1);
// what each kind of tree drops (its `litter`: assets/kit/tree.js), if not the biome's own floor: laid where that kind
// leads among the biome's grown trees (its slice of their slow noise, as the rule places them: src/scatter/rule.js),
// under their groves
const canopyOf = (bio) => standsOf(bio, rowsOf()).find((S) => S.key === 'tree') ?? null;
const drops = (bio) => (canopyOf(bio)?.kinds ?? []).filter((k) => k.asset.litter && k.asset.litter.material !== bio.floor.material);
// a biome's own grounds: its floor, its spots in it, its trees' litter
const ofBiome = (bio) => ({ bio, groves: canopyOf(bio)?.P, floor: lay({ ground: bio.floor }), spots: bio.spots ? lay({ ground: bio.spots, size: bio.spots.size }) : -1, litter: drops(bio).map(({ asset, slice }) => ({ id: lay({ ground: asset.litter }), slice })) });
const FLOOR = lay({ ground: BASE.floor });   // the base biome's floor, under everything
// the grassy biomes, under the grass's carpet; then the base's bare patches (let go where its blades end) and the floor of
// its outcrops
const UNDER = LAID.filter((b) => b.grass).map(ofBiome);
const BARE = lay({ ground: BASE.patches, meadow: true }), OUTCROP = lay({ ground: BASE.patches });
/** The grass's carpet is laid before the first layer with this id or more: over every layer before it, under every one after. */
export const CARPET = LAYERS.length;
// over the carpet: the base's paths (a thing of the near ground), the biomes nothing grows on, the base's rock where the
// land is too steep (its slope is the texel's own: src/terrain/material.js slopeAt), in their layers' order; last the
// library's stage
const PATHS = lay({ ground: BASE.patches, size: PATH_W });
let slopes = -1;
const OVER = LAID.filter((b) => !b.grass).map((b) => { if (slopes < 0 && BASE.slopes && b.layer > (BASE.slopes.layer ?? Infinity)) slopes = lay({ ground: BASE.slopes }); return ofBiome(b); });
if (slopes < 0 && BASE.slopes) slopes = lay({ ground: BASE.slopes });
/** The base's rock on what is too steep (-1: none): not in the map, laid by the texel from its own slope. */
export const SLOPES = slopes;
/** The library's stage: its ground is the uniform's (uStageGround: a material's number and its tile; -1 the base's patches). */
export const STAGE = lay({ ground: null });
if (LAYERS.length > EMPTY) throw new Error(`the land lays ${LAYERS.length} layers: a byte names at most ${EMPTY}`);

// ---- the stands that wear a colour far off (a biome's `trees` with its `canopy`, or any stand with a `cover`) ----
// Every stand of a biome (its trees, its undergrowth: any block of it with cells and a density, src/scatter/trees.js)
// hands over to the land where its plants are no longer drawn, in the same groves the plants stand in
// (src/world/noise.nodes.js: groveAt): nothing drops out of the picture, whatever is planted.
//   - far off, where they sink away (where leaving them out is within the one ERROR_PX: assets/kit/plant.js goneOf), the
//     land takes the stand's colour, as much of the ground as the stand's crowns cover there: what the rule that places
//     them expects of a cell there (src/scatter/rule.js densOf, each of its things' chance to stand in it), each its
//     crown's round (its reach) of the cell. Its colour is what its plants' impostors show, on the whole (src/detail/
//     seen.js: their pictures' mean, as baked), each kind by how much of the ground it covers (standColours). Till any of
//     its kinds shows (a shape's pictures are baked once a plant of it has come near, or read back as the browser kept
//     them), and for a stand of things that have no far end (herbs, litter: assets/kinds.js `far`), its biome's colour
//     (its `canopy`, its `understory`); with none, none;
//   - a stand that casts shadows: its floor lies in their shade. Round the camera they are drawn (the shadow map, and in
//     it the trees' stand-in: src/world/shadow.js, assets/kit/tree.js); past that the floor is dimmed, unevenly, so a
//     forest is not a plain in full sun with trees on it.
export const STANDS = [];
/** A stand's plants' footprint, metres: each kind's length and width at its mean scale (its placement's), each by how much
    of the ground it covers (its cover). */
const footprintOf = (kinds) => {
  let sum = 0, of = 0;
  for (const { asset: a } of kinds) {
    const P = a.placement, cover = P.cover ?? 1, scale = P.scale ? (P.scale[0] + P.scale[1]) / 2 : 1;
    sum += (cover * scale * (a.size.length + a.size.width)) / 2; of += cover;
  }
  return of > 0 ? sum / of : CROWNS;
};
for (const bio of LAID) for (const { key, P, kinds, CV, L, entries } of standsOf(bio, rowsOf())) {
  // its colour: its kinds' far ends' where they have them, as they come (standColours); till then, and else, its biome's
  const seen = kinds.every((k) => k.asset.far);
  if (!seen && !CV.colour) throw new Error(`${bio.name}: its ${key}s have no far ends to show their colour, and its stand says none`);
  // its colour comes in as its plants go out (they are drawn while their largest side is more than their last level's
  // pixels, sinking away over the BAND above: src/detail): from where its smallest kind begins to sink to where its
  // largest is gone (`last` = uPxK × its span: the measure's farAt, src/detail/measure.js); without such plants, always
  const spanOf = (a) => (sizeOf(a) * (a.placement.scale?.[1] ?? 1)) / detailOf(a).cut, spans = kinds.map((k) => spanOf(k.asset)).filter((x) => x > 0 && Number.isFinite(x));
  const span = spans.length ? Math.max(...spans) : 0, A = span ? kinds.map((k) => k.asset).find((a) => spanOf(a) === span) : null;
  const SH = A?.detail?.shadow;   // where its shadows are no longer drawn: past the trees' stand-in, the cascades' reach
  // what of it casts (src/world/shadow.js): its trees' crowns at their oldest, where each begins over the ground and how
  // far it reaches round (the kit's form: assets/kit/tree.js growth.base, growth.reach), and the tallest of it (its
  // measure's most)
  const cast = kinds.map((k) => k.asset).filter((a) => detailOf(a).casts !== false), trees = cast.filter((a) => a.growth?.base);
  const crown = Math.min(...trees.map((a) => a.growth.base(a.growth.years.at(-1)))), radius = Math.min(...trees.map((a) => a.growth.reach(a.growth.years.at(-1))));
  const top = Math.max(0, ...cast.map((a) => a.measure?.most ?? a.size.height));
  // the pattern its plants make where they are no longer drawn, as large as they are (src/terrain/material.js: CROWNS ×
  // grain its finest scale): a tree stand's, its crowns, as they are; any other's, its own plants' footprint, so the moss
  // and the litter that stand for themselves far off keep their size (a bush's, 0.3 of a tree, made them two to three
  // times as large there)
  const grain = key === 'tree' ? 1 : footprintOf(kinds) / CROWNS;
  // its relief's top where its cover is whole (what the land is raised by, cover times it, where its plants are gone):
  // each kind's crown top over the ground, the mean of its shapes (its ages and variants, as goneOf has them), each kind
  // by how much of the ground it covers where the stand is thick (as its colour: seenColour)
  const topOf = (a) => { let t = 0; const n = a.shapeCount ?? 1; for (let i = 0; i < n; i++) t += Math.max(0, (a.heights?.[i] ?? most(a.size.height)) - FOOT); return t / n; };
  const tw = entries.map((e) => (e.from ? 0 : e.most * e.reach * e.reach)), tws = tw.reduce((s, w) => s + w, 0);
  const reliefTop = tws > 0 ? entries.reduce((s, e, i) => s + tw[i] * topOf(e.asset), 0) / tws : 0;
  STANDS.push({ bio, P, grain, L, entries, seen, reliefTop, colour: CV.colour ?? null, span, fade: span ? [Math.min(...spans) / (span * BAND), 1] : [0, 0], reach: SH ? SH.far * (SH.wide ?? 2.4) : -1, crown, radius, top });
}
if (STANDS.length >= NO_STAND) throw new Error(`the land has ${STANDS.length} stands that wear a colour: four bits name at most ${NO_STAND - 1}`);
/** How far round the camera the shadows of the stands that cast them are drawn at the most (-1: none casts): past it, a
    stand's floor lies in its crowns' shade, the pixel's own (src/terrain/material.js). */
export const SHADE_REACH = Math.max(-1, ...STANDS.map((S) => S.reach));
/** What casts in the stands, which the shadow cascades are laid out from (src/world/shadow.js useCascades, in the light's
    start: src/world/light/start.js startLight). reach: how far round the eye shadows are drawn (SHADE_REACH). crown:
    the lowest a crown begins over the ground among the trees that cast, at their oldest (metres; Infinity: none): the
    cascades' finest texel is the sun's penumbra from it. radius: the smallest reach of a crown round its trunk among
    them, at their oldest (metres; Infinity: none): the canopy's probes stand a quarter of it apart
    (src/world/light/canopy.js). top: the tallest thing that casts (metres, its measure's most): how far round a point
    its shadow's blockers are looked for (src/world/light.js). */
export const CASTERS = Object.freeze({
  reach: SHADE_REACH,
  crown: Math.min(...STANDS.map((S) => S.crown)),
  radius: Math.min(...STANDS.map((S) => S.radius)),
  top: Math.max(0, ...STANDS.map((S) => S.top)),
});


// the layers' table: a layer's material (its number: src/materials/bake.js), its tile (metres), its pattern's size
// (metres; 0: none), and whether it goes with the meadow's blades (1)
let TABLE = null, STAND_T = null;
/** The layers' and the stands' tables, made once the world's textures are there (before node code reads them). */
export const layerTables = (tex) => {
  if (TABLE) return;
  TABLE = uniformArray(LAYERS.map((L) => new THREE.Vector4(L.ground ? tex.layer(L.ground.material) : -1, L.ground ? L.ground.tile : 2, L.size ?? 0, L.meadow ? 1 : 0)), 'vec4').setGroup(renderGroup);
  // the stands': (its crowns' colour (-1: none yet), its grain), (its plants' span (0: none), from, to (shares of where
  // they are gone), how far its shadows reach (-1: none))
  // (and its relief's top where its cover is whole)
  STAND_T = uniformArray(STANDS.flatMap((S) => [new THREE.Vector4(...(S.colour ?? [-1, -1, -1]), S.grain), new THREE.Vector4(S.span, ...S.fade, S.reach), new THREE.Vector4(S.reliefTop, 0, 0, 0)]).concat([new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()]), 'vec4').setGroup(renderGroup);
};
/** What a stand whose kinds have far ends shows ([r, g, b], linear albedo; null while none of them does): each kind's
    that shows (src/detail/seen.js) by how much of the ground it covers where the stand is thick, as its cover counts it
    (layerWords): its share of the stand (its `most`, the slice of the patches it leads in: rule.js densOf) times its
    crown's round. */
const seenColour = (S) => {
  const sum = [0, 0, 0]; let of = 0;
  for (const e of S.entries) {
    const w = e.from ? 0 : e.most * e.reach * e.reach, c = w > 0 && seenOf(e.asset); if (!c) continue;   // (what grows from litter is none far off: densOf)
    for (let k = 0; k < 3; k++) sum[k] += w * c[k]; of += w;
  }
  return of > 0 ? sum.map((v) => v / of) : null;
};
let seenAt = -1;
/** The stands' colours as their kinds' far ends show them, into the table as they come. Each frame: -1, none changed;
    else the nearest a stand whose colour changed comes in (metres, as standFade's distance: 0, everywhere), so the land
    laid with the old as far off is laid again (src/terrain/pages.js). */
export function standColours() {
  if (!STAND_T || seenVersion() === seenAt) return -1;
  seenAt = seenVersion();
  let near = Infinity;
  STANDS.forEach((S, i) => {
    if (!S.seen) return;
    const c = seenColour(S), v = STAND_T.array[3 * i];
    if (!c || (c[0] === v.x && c[1] === v.y && c[2] === v.z)) return;
    v.set(...c, S.grain);
    near = Math.min(near, S.span > 0 ? (U.uPxK.value * S.span * S.fade[0]) / U.uErrorPx.value : 0);
  });
  return Number.isFinite(near) ? near : -1;
}

/** What the biomes make of the land at p: the layer map's point there, five 32-bit words (as the top of this file packs
    them). texel: metres between the map's points (its noises are read as finely as that calls for). Node code, in a Fn. */
export function layerWords(tex, p, texel) {
  // a read of the land's cloudy noise at q (metres a tile: `scale`), as fine as the map's points call for
  const nz = (q, scale) => tex.a(noise, q).level(max(log2(texel.mul(1024 / scale)), 0));
  // ---- what the biomes make of p (their rules as the land's nodes give them: src/world/land.nodes.js) ----
  const I = riverInfo(p).toVar(), ctx = { p, dist: float(0), d: abs(I.x), w: I.y, b: I.z };   // (dist 0: what is let go with distance is the texel's: src/terrain/material.js)
  const Lb = biomesAt(ctx, true), share = new Map(Lb.shares.map(({ b, w }) => [b, w]));
  const stage = stageAt(p).toVar(), bare0 = bareMask(p).toVar(), dry = Lb.dry.toVar();
  // ---- the layers, each laid over what is under it as much as its rule says (a layer's share of the ground shrinks by
  // what is laid over it) ----
  const S = LAYERS.map(() => float(0).toVar()); S[FLOOR].assign(1);
  const over = (id, t) => { const k = float(t).toVar(); for (const s of S) s.mulAssign(float(1).sub(k)); S[id].addAssign(k); };
  // a biome's ground: its floor, its spots and its trees' litter laid over each other, then all of it over what is there
  const biome = ({ bio, groves, floor, spots, litter }) => {
    const wt = share.get(bio).mul(bio.mix ?? 1).toVar(), own = new Map([[floor, float(1)]]);
    const put = (id, t) => { for (const [k, v] of own) own.set(k, v.mul(float(1).sub(t))); own.set(id, t); };
    if (spots >= 0) put(spots, clamp(bio.spots.where(ctx), 0, 1).toVar());
    if (litter.length) {
      const lead = leadAt(p, groves).mul(0.7).add(0.15).toVar(), thick = smoothstep(0.1, 0.6, groveAt(p, groves)).toVar();
      for (const { id, slice: [a, b] } of litter) put(id, (a > 0 ? smoothstep(a - 0.06, a + 0.06, lead) : float(1)).mul(b < 1 ? float(1).sub(smoothstep(b - 0.06, b + 0.06, lead)) : float(1)).mul(thick).toVar());
    }
    for (const s of S) s.mulAssign(float(1).sub(wt));
    for (const [id, v] of own) S[id].addAssign(wt.mul(v));
  };
  UNDER.forEach(biome);
  over(BARE, max(bare0.sub(stage), 0).mul(float(1).sub(dry)));
  over(OUTCROP, outcropMask(p).mul(0.25));
  over(PATHS, placeOff(p, pathMask(pathN(p))));
  OVER.forEach(biome);
  over(STAGE, stage);
  // the four strongest, then in the order they are laid
  const top = [0, 1, 2, 3].map(() => ({ id: int(EMPTY).toVar(), w: float(0).toVar() }));
  S.forEach((s, id) => {
    const c = top.map((t) => s.greaterThan(t.w).toVar());   // (held: the slots change as they are assigned)
    for (let i = 3; i >= 0; i--) {   // (from the last: each takes what was before it, if what comes is stronger than that)
      const fromAbove = i > 0 ? c[i - 1] : null, here = c[i];
      if (fromAbove) { top[i].id.assign(fromAbove.select(top[i - 1].id, here.select(int(id), top[i].id))); top[i].w.assign(fromAbove.select(top[i - 1].w, here.select(s, top[i].w))); }
      else { top[i].id.assign(here.select(int(id), top[i].id)); top[i].w.assign(here.select(s, top[i].w)); }
    }
  });
  const sum = top.reduce((a, t) => a.add(t.w), float(0)).max(1e-6).toVar();
  for (const t of top) { If(t.w.lessThan(0.5 / 255), () => { t.id.assign(EMPTY); t.w.assign(0); }); }
  for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3], [1, 2]]) {   // (sorted by id: a network of five)
    const A = top[i], B = top[j], swap = B.id.lessThan(A.id).toVar(), ai = int(A.id).toVar(), aw = float(A.w).toVar();
    A.id.assign(swap.select(B.id, A.id)); A.w.assign(swap.select(B.w, A.w)); B.id.assign(swap.select(ai, B.id)); B.w.assign(swap.select(aw, B.w));
  }
  // ---- the grass's carpet: how much of the ground its blades cover, where they end nothing shows; near, the bare
  // patches cut it (they are let go 100 to 160 m off, the texel's); far its tufts are let go (350 to 900 m) ----
  const grassy = Lb.grassy.toVar(), grassyFar = grassFrom(Lb.shares, ctx, float(0.5)).grassy, open = float(1).sub(stage);
  // the land's colour variation, from the baked cloudy noise
  const pr = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6))), prr = vec2(p.x.mul(0.8).add(p.y.mul(0.6)), p.x.mul(-0.6).add(p.y.mul(0.8)));
  const macro = nz(prr.mul(1 / 97).add(0.37), 97).b.sub(0.5).mul(0.16).add(nz(pr.mul(1 / 700), 700).a.sub(0.5).mul(0.2)).add(nz(p.mul(1 / 4500).add(0.11), 4500).r.sub(0.5).mul(0.18));
  // ---- the stands: how much of the ground their crowns cover (the rule's own: each of its things' chance to stand in a
  // cell here, densOf, by its crown's round of the cell, its reach: a stand's layer's density worked out once a point),
  // the pattern of its crowns (grain: its plants' size to a tree's crown, STANDS; at scales with no whole ratio: no grid
  // of crowns) ----
  const dens = new Map();
  for (const T of STANDS) if (!dens.has(T.L)) dens.set(T.L, densOf(T.L, p, ctx));
  const st = [0, 1].map(() => ({ id: int(NO_STAND).toVar(), c: float(0).toVar(), n: float(0).toVar() }));
  STANDS.forEach((T, id) => {
    const g = T.grain;
    const D = dens.get(T.L), c = clamp(T.entries.reduce((s, e) => s.add(D[e.i].mul((Math.PI * e.reach * e.reach) / (T.L.cell * T.L.cell))), float(0)), 0, 1).toVar();
    If(c.greaterThan(st[1].c), () => {
      const n = nz(p.div(23 * g).add(0.7), 23 * g).r.mul(0.35).add(nz(prr.div(31.7 * g).add(0.2), 31.7 * g).g.mul(0.35)).add(nz(pr.div(CROWNS * g), CROWNS * g).g.mul(0.3)).toVar();
      If(c.greaterThan(st[0].c), () => { st[1].id.assign(st[0].id); st[1].c.assign(st[0].c); st[1].n.assign(st[0].n); st[0].id.assign(id); st[0].c.assign(c); st[0].n.assign(n); })
        .Else(() => { st[1].id.assign(id); st[1].c.assign(c); st[1].n.assign(n); });
    });
  });
  If(st[1].id.lessThan(st[0].id), () => { const i = int(st[0].id).toVar(), c = float(st[0].c).toVar(), n = float(st[0].n).toVar(); st[0].id.assign(st[1].id); st[0].c.assign(st[1].c); st[0].n.assign(st[1].n); st[1].id.assign(i); st[1].c.assign(c); st[1].n.assign(n); });
  // the grass's colour, as fine as the map's points call for: the meadow's as its blades' tips show it, which the carpet
  // that stands for them past their end is (src/scatter/grass.js meadowTip: the grass's tint and dryness there, its
  // tufts' mean shade; the carpet gives them their own, src/terrain/material.js laid)
  const g = grassTint(tex, p, dry, max(log2(texel.mul(1024 / 45)), 0)), tint = meadowTip(g.rgb, g.a, float(0.5));
  const word = (a, b, c, d) => a.bitOr(b.shiftLeft(uint(8))).bitOr(c.shiftLeft(uint(16))).bitOr(d.shiftLeft(uint(24)));
  return [
    word(...top.map((t) => uint(t.id))),
    word(...top.map((t) => byte(t.w.div(sum)))),
    word(byte(float(1).sub(max(bare0, stage)).mul(grassy)), byte(open.mul(grassy)), byte(open.mul(grassyFar)), byte(macro.add(0.5))),
    word(byte(st[0].c), byte(st[0].n), byte(st[1].c), byte(st[1].n)),
    word(byte(sqrt(tint.r)), byte(sqrt(tint.g)), byte(sqrt(tint.b)), uint(st[0].id).bitOr(uint(st[1].id).shiftLeft(uint(4)))),
  ];
}

/** What lies at a point of the land, from the four points of the map round it: load(i) their words, i 0 … 3 for (0, 0),
    (1, 0), (0, 1), (1, 1) ({ L: the first four, M: the fifth }); f where the point lies between them (0 … 1 each way);
    ny how steep the land is there, its normal's y. The layers to lay there, at most five, in the order they are laid
    ({ id, w }: a layer of the map's, w its share; SLOPES's w is how much of it is laid, the point's own), the carpet's
    cover (near, between, far), the macro variation, the grass's tint, and the two stands there ({ id (NO_STAND: none),
    c, n }). */
export function layersFrom(load, f, ny) {
  // what the points say, summed by their weights: the layers by id into five slots (the fifth the slope's); the stands by id into two
  const ids = [0, 1, 2, 3].map(() => int(-1).toVar()), ws = [0, 1, 2, 3].map(() => float(0).toVar()), filled = int(0).toVar();
  const cv = vec3(0).toVar(), macro = float(0).toVar(), tint = vec3(0).toVar();
  const sid = [0, 1].map(() => int(-1).toVar()), sc = [0, 1].map(() => float(0).toVar()), sn = [0, 1].map(() => float(0).toVar()), sw = [0, 1].map(() => float(0).toVar());
  Loop(4, ({ i }) => {
    const tx = i.bitAnd(1), tz = i.shiftRight(1);
    const bw = tx.equal(1).select(f.x, float(1).sub(f.x)).mul(tz.equal(1).select(f.y, float(1).sub(f.y))).toVar();
    If(bw.greaterThan(0), () => {
      const P = load(i), L = P.L.toVar(), M = P.M.toVar();
      for (let j = 0; j < 4; j++) {
        const id = int(L.x.shiftRight(uint(8 * j)).bitAnd(uint(255))), w = un(L.y, j).mul(bw);
        If(w.greaterThan(0.25 / 255), () => {
          const hit = ids.map((s) => s.equal(id).toVar()), fresh = hit.reduce((a, h) => a.or(h)).not().toVar();   // (held: the slots change as they are assigned)
          ids.forEach((s, m) => { const put = fresh.and(filled.equal(m)); ws[m].assign(put.select(w, ws[m].add(hit[m].select(w, float(0))))); s.assign(put.select(id, s)); });
          filled.assign(fresh.and(filled.lessThan(4)).select(filled.add(1), filled));
        });
      }
      cv.addAssign(vec3(un(L.z, 0), un(L.z, 1), un(L.z, 2)).mul(bw)); macro.addAssign(un(L.z, 3).sub(0.5).mul(bw));
      const sq = (k2) => un(M, k2).mul(un(M, k2)); tint.addAssign(vec3(sq(0), sq(1), sq(2)).mul(bw));
      for (let j = 0; j < 2; j++) {
        const id = int(M.shiftRight(uint(24 + 4 * j)).bitAnd(uint(15))), c = un(L.w, 2 * j), n = un(L.w, 2 * j + 1);
        If(id.notEqual(NO_STAND), () => {
          const hit = sid.map((s) => s.equal(id).toVar()), fresh = hit[0].or(hit[1]).not();
          const put = [fresh.and(sid[0].lessThan(0)).toVar(), fresh.and(sid[0].greaterThanEqual(0)).and(sid[1].lessThan(0)).toVar()];   // (held, as above)
          sid.forEach((s, m) => {
            const own = hit[m].or(put[m]);
            s.assign(put[m].select(id, s)); sc[m].addAssign(own.select(c.mul(bw), float(0))); sn[m].addAssign(own.select(n.mul(bw), float(0))); sw[m].addAssign(own.select(bw, float(0)));
          });
        });
      }
    });
  });
  // the base's rock where the land is too steep: the point's own slope
  const slope = { id: int(SLOPES >= 0 ? SLOPES : 999).toVar(), w: float(SLOPES >= 0 ? smoothstep(0.8, 0.68, ny) : 0).toVar() };
  const slots = [...ids.map((id, m) => ({ id, w: ws[m] })), slope];
  for (const s of slots.slice(0, 4)) If(s.id.lessThan(0), () => { s.id.assign(999); });   // (an empty slot: after every layer)
  for (const [a, b] of [[0, 1], [3, 4], [2, 4], [2, 3], [1, 4], [0, 3], [0, 2], [1, 3], [1, 2]]) {   // (sorted by id: a network of nine)
    const A = slots[a], B = slots[b], swap = B.id.lessThan(A.id).toVar(), ai = int(A.id).toVar(), aw = float(A.w).toVar();
    A.id.assign(swap.select(B.id, A.id)); A.w.assign(swap.select(B.w, A.w)); B.id.assign(swap.select(ai, B.id)); B.w.assign(swap.select(aw, B.w));
  }
  const stands = [0, 1].map((m) => ({ id: sid[m].lessThan(0).select(int(NO_STAND), sid[m]), c: sc[m], n: sn[m].div(max(sw[m], 1e-4)) }));
  return { slots, cv, macro, tint, stands };
}

/** A layer of the map's ground: its material (a number: src/materials/bake.js), its tile (metres), how much of it is left
    at dist2 metres off (1 near … 0 where it is let go). The library's stage wears what uStageGround says. */
export const layerOf = (id) => {
  const row = TABLE.element(id), stage = id.equal(STAGE), g = U.uStageGround, own = g.x.lessThan(0).select(TABLE.element(BARE).x, g.x);
  return { material: int(stage.select(own, row.x)), tile: stage.select(g.y, row.y), fade: (D, s) => row.w.greaterThan(0.5).select(endOf(D), row.z.greaterThan(0).select(smoothstep(s.mul(2 * MAPN), s.mul(2 * MAPN * BAND), row.z), float(1))) };
};
/** A stand's numbers ({ colour (its x under 0: none yet), grain, span, fade [a, b], reach }: as STANDS has them), for
    the fragment. */
export const standOf = (id) => { const a = STAND_T.element(id.mul(3)), b = STAND_T.element(id.mul(3).add(1)), c = STAND_T.element(id.mul(3).add(2)); return { colour: a.xyz, grain: a.w, span: b.x, a: b.y, b: b.z, reach: b.w, relief: c.x }; };
/** The highest a stand's relief stands where its cover is whole (metres; 0: no stand has one): what the land's pages
    hold the relief as a share of (src/terrain/pages.js). */
export const RELIEF_MOST = Math.max(0, ...STANDS.map((S) => S.reliefTop));
/** How far off (metres, as the 68° lens sees them) a stand's colour comes in: its plants' last level's reach (the
    measure's farAt: src/detail/measure.js, its span reckoned at the dial's rest, so over the dial now); without plants,
    everywhere. */
export const standFade = (S, dist2) => {
  const at = U.uPxK.mul(S.span).div(U.uErrorPx), last = at;   // (?truth: the dial turned down moves it out, as every other far)
  return S.span.greaterThan(0).select(smoothstep(last.mul(S.a), last.mul(S.b), dist2), float(1));
};
/** How much of the stands' relief the land shows at dist (as standFade's distance): only where every stand's plants are
    gone, so nothing drawn stands in it, and it comes in as the last of them goes out (each its own standFade). R: the
    relief there (metres, the pages': src/terrain/pages.js relief), for a rule by the place (one measure v2's: the
    plants' gone by the cover there). Node code. */
export const canopyShownAt = (R, dist) => STANDS.filter((S) => S.span > 0 && S.reliefTop > 0).reduce((m, S) => {
  const last = U.uPxK.mul(S.span).div(U.uErrorPx);
  return min(m, smoothstep(last.mul(S.fade[0]), last.mul(S.fade[1]), dist));
}, float(1));
export { NO_STAND };
