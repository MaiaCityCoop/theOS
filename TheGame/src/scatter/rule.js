// The one placement rule (intent 0038, stage 7), for everything that grows or lies on the land: a tree, a sapling, a
// bush, a fern, a fallen log, a stone, a cone. After van Muijden, "GPU-based procedural placement in Horizon Zero Dawn"
// (GDC 2017) and Unreal's PCG: one rule, worked out on the GPU for the cells the camera looks at, nothing kept of what it
// places.
//
//   density = ecotope x suitability x the influence of the larger things already placed x clumping
//
//   ecotope      where its biome lies (biomes/*.js: where), and how much of the ground it covers there where it grows
//                best (its placement's `cover`: what it is, not how it is drawn)
//   suitability  how it takes the light under what stands over it (its `light`: [in deep shade, in the open]), the water
//                (its `shore`: half-widths of the river's channel from its middle; `lakes`: only round one)
//   influence    what the larger things left where it would stand (src/scatter/growth.js): their shade, the ground
//                they really cover (their feet: nothing stands in a trunk, a log or a stone, and nothing more is kept
//                clear), their litter (its `under`: whose litter it is: a cone a pine's, a sapling its own kind's, under
//                the crowns its seeds fell from)
//   clumping     groves and glades, thickets and drifts: one noise, as wide as its biome's groves at its own scale
//
// Discretised by one shared ordered dither: every cell has its rank (rankOf: its place in a 4 x 4 Bayer matrix, and
// within that a number of its own), the spread order the crowds thin by since stage 5. A thing stands in a cell where the
// cell's rank is under its density, so any density is a first share of the ranks, spread evenly over the ground; placing
// and thinning are one number. The things of one footprint (a layer) share the cells: their densities are stacked over
// the ranks, one thing a cell, so two kinds never stand in each other.
//
// Layers, largest footprint first: what a thing reaches (its crown's half span, its own size at its middle scale) puts
// it in a class, a factor of four wide; a class's cells are as wide as one of its things covers where they grow thickest
// (PER of its middle reach). A tree that grows (assets/kit/tree.js growth) is placed twice: grown, as old as its stand,
// and young (its placement's `young`: how much of the ground its saplings cover), in the class of its saplings. Each
// layer whose cells are as large as the growth map's texels writes what it leaves there for the layers after it.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, Break, float, int, uint, vec2, vec4, ivec2, uniform, uniformArray, smoothstep, clamp, mix, max, min, abs, floor, length, dot, pow, log, exp, sqrt, cos, sin, packHalf2x16, unpackHalf2x16 } from 'three/tsl';
import { rnd, vnoise, groveAt, leadAt, riverInfo, shareOf, nearLake } from '../world/land.nodes.js';
import { U } from '../core/uniforms.js';
import { scatterRow } from '../../assets/index.js';
import { entriesOf, placed } from './entries.js';
import { most, footprintOf, footprintReach } from '../../assets/kinds.js';
import { CLEARINGS } from '../../world/places.js';
import { WORDS } from './growth.js';
import { limitOf } from '../core/gpu.js';

const R0 = 0.69, PER = 1.8, CLUMPS = 55, PATCHES = 90, TOP = 1;   // R0: metres of reach where the classes begin (0.69-2.8 m, 2.8-11 m, ...); PER: a cell's side to its class's middle reach; CLUMPS, PATCHES: a biome's groves and the patches where one kind leads, metres, at the class of a grown tree (TOP), where its biome does not say (its `groves`)
const SHADE = 0.85;   // how much of the light coming down through a crown its foliage takes where it is deepest, over its middle
const AGED = [0.65, 1.3];   // a grown tree's own age, of its stand's (grownIn, grows)

// ---- the spread order (stage 5's): the one number that places and thins ----
const bayer2 = (x, y) => x.bitXor(y).bitAnd(uint(1)).mul(uint(2)).add(y.bitAnd(uint(1)));
/** A cell's rank in the one spread order, 0..1: its place in a 4 x 4 ordered dither (Bayer), so any first share of the
    ranks is spread evenly over the ground, and within that by its own number (own, 0..1). */
export const rankOf = (c, own) => { const x = uint(c.x).bitAnd(uint(3)), y = uint(c.y).bitAnd(uint(3)); return float(bayer2(x, y).mul(uint(4)).add(bayer2(x.shiftRight(uint(1)), y.shiftRight(uint(1))))).add(own).div(16); };

/** 1 where a thing may stand, 0 within what stands at a place (its clearing) or on the library's stage. */
const clearAt = (p) => {
  let c = float(1);
  for (const P of CLEARINGS) c = c.mul(smoothstep(P.clear + 2, P.clear + 6, length(p.sub(vec2(P.x, P.z)))));
  return c.mul(U.uStage.z.greaterThan(0).select(smoothstep(U.uStage.z.add(1), U.uStage.z.add(5), length(p.sub(U.uStage.xy))), float(1)));
};

const classOf = (r) => Math.floor(Math.log(Math.max(r, 1e-3) / R0) / Math.log(4));
let LAYERS = null, KEY = '';
/** The layers of what the engine places (rows: its rows), largest first, each { k (its class), cell, seed, entries,
    groups (the kinds that lead in patches: a biome's grown trees, its bushes), reads (the words of the layers before it),
    word (its own, -1: it writes none), band (a writer's: its word's band limit, half its smallest crown, metres: its
    texel in the growth map, two of them across its smallest crown, so nothing finer shows in its shade: growth.js),
    reach (metres its things leave anything in), feet (one that writes: how far its things' feet reach, feetOf; null
    where none covers any ground) }. The same rows, the same layers. The layers that write are those whose cells are
    as large as the finest texel any writer needs. */
export function layersOf(rows) {
  const key = rows.map((r) => r.uid).join();
  if (LAYERS && key === KEY) return LAYERS;
  const by = new Map();
  for (const e of entriesOf(rows)) { const k = classOf(e.reach); if (!by.has(k)) by.set(k, []); by.get(k).push(e); }
  // (the layers that write: those whose cells are as large as the finest texel any writer needs, half the smallest crown
  // among them, its word's band limit: of the limits that hold both ways, the coarsest)
  let id = 1, word = 0, band = 0;
  const cellOf = (k) => PER * R0 * 4 ** (k + 0.5), smallest = (es) => Math.min(...es.filter(crowned).map(crownMost));
  for (const b of [...by.values()].map(smallest).filter(Number.isFinite).sort((x, y) => y - x)) {   // (each layer's smallest crown, the coarsest first)
    const writers = [...by].filter(([k]) => cellOf(k) >= b).sort((x, y) => y[0] - x[0]).slice(0, WORDS);
    if (writers.length && smallest(writers.flatMap(([, es]) => es)) === b) { band = b; break; }
  }
  LAYERS = [...by].sort((a, b) => b[0] - a[0]).map(([k, entries], index) => {
    const cell = cellOf(k), scale = 4 ** (k - TOP);
    entries.sort((x, y) => (x.asset.uid < y.asset.uid ? -1 : x.asset.uid > y.asset.uid ? 1 : x.young - y.young));
    // (its most at a cell: as much of the ground as it covers there, in things of its reach, one a cell at most)
    entries.forEach((e, i) => Object.assign(e, { i, id: id++, most: Math.min(1, (e.cover * cell * cell) / (Math.PI * e.reach * e.reach)), litter: e.asset.kind === 'tree' && !e.young ? 1 : 0 }));
    // a biome's grown trees lead in patches, one kind here and another there (and so its bushes): their densities are
    // one, shared out by a slow noise (its slice of it: as much as it covers of theirs), a third of it evenly
    const groups = [];
    for (const e of entries) if (!e.young && (e.asset.kind === 'tree' || e.asset.kind === 'shrub')) { let g = groups.find((x) => x.biome === e.biome && x.kind === e.asset.kind); if (!g) groups.push((g = { biome: e.biome, kind: e.asset.kind, entries: [] })); g.entries.push(e); }
    for (const g of groups) { const t = g.entries.reduce((s, e) => s + e.most, 0); let at = 0; g.most = t; for (const e of g.entries) { e.group = g; e.slice = [at / t, (at += e.most) / t]; } }
    const writes = band > 0 && cell >= band && word < WORDS;
    return { k, index, cell, seed: 300 + 100 * (TOP - k), scale, entries, groups, name: `${cell.toFixed(cell < 1 ? 2 : 1)} m`, word: writes ? word++ : -1, band: writes ? smallest(entries) : 0, inset: 0,
      reach: Math.max(...entries.map((e) => e.reach * (e.litter ? 1.6 : 1))) };
  });
  // what each layer reads: the words of every layer before it that writes; and whose litter it reads, as their numbers;
  // a layer that writes, what its things leave (their reach, their crowns' spread: none for what lies on the floor,
  // their litter) and the ground they cover (feetOf)
  const longest = Math.max(0, ...LAYERS.filter((L) => L.word >= 0).map((L) => L.entries.length));   // (each writer's table as long as the longest's, the rest nought: every layer's gather declares it alike)
  for (const L of LAYERS) {
    L.reads = LAYERS.filter((W) => W.index < L.index && W.word >= 0);
    for (const e of L.entries) e.from = e.under.length ? LAYERS.flatMap((W) => (W.index < L.index ? W.entries.filter((x) => e.under.includes(x.asset.uid) && !x.young).map((x) => x.id) : [])) : null;
    L.table = L.word >= 0 ? uniformArray([...L.entries.map((e) => new THREE.Vector4(e.reach, crowned(e) ? spreadOf(e.asset) : 0, e.litter ? e.id : 0, e.litter)), ...Array.from({ length: longest - L.entries.length }, () => new THREE.Vector4())], 'vec4') : null;
  }
  feetOf(LAYERS.filter((L) => L.word >= 0));
  KEY = key;
  return LAYERS;
}

/** The rows of everything the trees' engine places in the world (what the land reads of the rule asks by them). */
export const rowsOf = () => placed().map(scatterRow);
/** A biome's groves at a layer: its `groves` (metres, at a grown tree's class) at the layer's scale, the layer's seed. */
export const grovesOf = (bio, L) => ({ clumps: (bio.groves?.clumps ?? CLUMPS) * L.scale, patches: (bio.groves?.patches ?? PATCHES) * L.scale, seed: L.seed });
/** Where the thing of cell c of layer L stands (metres): somewhere in its cell, L.inset of it in from its edge at the
    least (feetOf). */
export const posIn = (c, L) => { const s = ofLayer(L, 'seed', 'uint'), inset = ofLayer(L, 'inset'); return vec2(c).add(inset).add(vec2(rnd(c.x, c.y, s.add(uint(2))), rnd(c.x, c.y, s.add(uint(3)))).mul(float(1).sub(inset.mul(2)))).mul(ofLayer(L, 'cell')); };   // (its hashes 302 and 303: the layer's seed moves every hash, h0)
/** Number `name` of layer L (its cell, inset, seed, band; or of its record: its fields) as a uniform kept with it, made
    where code first reads it (the layer is laid out by then): the layers that differ only in these work by one pipeline
    (they were literals: each layer's gather was a compile of its own). */
function ofLayer(L, name, type = 'float') { const u = (L.uniforms ||= {}); return (u[name] ||= uniform(L[name], type)); }

/** The hashes of layer L's cells: h0(k) the k-th (300 its first), moved by the layer's seed (a uniform: every layer's
    hashes by one code). */
export const hashesOf = (L) => { const s = ofLayer(L, 'seed', 'uint'); return (k) => s.add(uint(k - 300)); };

/** How tall the thing in cell c of layer L stands (metres), and which of its kind's shapes it is (0 … its count), as the
    trees' engine draws it (src/scatter/trees.js) and the growth map reckons its crown (gatherOf): its own scale within
    its placement's; a tree that grows as old as its stand (its biome's `age`, a slow noise, and a share of its own) or,
    a sapling, as its own age, its stage's height at that age (straight in the logarithms of age and height between
    where the stage begins, its year and where it ends, as assets/kit/tree.js heightIn works it out); one that does not
    grow, its asset's height and a shape at random. k: which of the layer's entries it is (a node: placeIn's), its
    numbers its row of the layer's table (placerOf: whether it grows, whether it is a sapling, are numbers of it, not
    code of its own); pos: where it stands (posIn). Nodes, worked out where the thing is known to stand. */
export function grownIn(c, L, k, pos) {
  const P = placerOf(L), at = k.mul(P.span).toVar(), row = (j) => P.rows.element(at.add(j)), N = row(0), H = row(1), h0 = hashesOf(L), r = rnd(c.x, c.y, h0(312)), has = P.has;
  const grows = has.grows && has.still ? H.w.greaterThan(0) : has.grows, h = float(1).toVar(), shape = float(0).toVar();   // (a node where some of its entries grow and some do not; else what all of them do)
  const own = mix(N.x, N.y, either(grows, () => rnd(c.x, c.y, h0(304)), () => pow(rnd(c.x, c.y, h0(304)), 1.3))).toVar();
  const growing = () => {
    const sapling = () => mix(H.x, H.y, r.mul(r)), stand = () => mix(H.x, H.y, vnoise(pos.div(H.z), h0(311))).mul(mix(AGED[0], AGED[1], r));   // (a sapling: its own age; grown, as old as its stand and a share of its own)
    const age = (has.young && has.grown ? either(row(2).w.greaterThan(0.5), sapling, stand) : has.young ? sapling() : stand()).toVar();
    // its stage: the first whose ages hold its age (each stage's If did it, its numbers written in: the same work a thread)
    Loop({ start: int(0), end: int(H.w), type: 'int', condition: '<' }, ({ i }) => {
      const j = i.mul(3).add(P.own), A = row(j), B = row(j.add(1)), C = row(j.add(2));
      If(age.greaterThanEqual(A.x).and(age.lessThan(A.y)), () => {
        // (before its year: from its first age to its year; after it: from its year to its last)
        const ag = clamp(age, A.z, A.w), low = ag.lessThan(B.x), t = log(ag.div(low.select(A.z, B.x))).div(low.select(B.y, B.z));
        h.assign(exp(mix(low.select(C.x, C.y), low.select(C.y, C.z), t)).mul(own));
        shape.assign(floor(rnd(c.x, c.y, h0(309)).mul(B.w)).add(C.w));
        Break();
      });
    });
  };
  const still = () => { h.assign(own.mul(N.z)); shape.assign(floor(rnd(c.x, c.y, h0(309)).mul(N.w)).min(N.w.sub(1))); };
  if (typeof grows === 'boolean') (grows ? growing : still)(); else If(grows, growing).Else(still);
  return { h, shape };
}

// ---- what the placer reads of each entry: its numbers, a table a layer ----
/** The biomes of layer L's entries, and the groups of them that lead in patches (more than one kind shares them out):
    each entry's own among them is a number of it (ownOf). */
const biomesIn = (L) => (L.biomes ||= [...new Set(L.entries.map((e) => e.biome))]);
const leadersIn = (L) => (L.leaders ||= L.groups.filter((g) => g.entries.length > 1));
/** Entry e's numbers as its density reads them (densIn), plain numbers: written into the code where each entry has its
    own (the land's far stands, src/terrain/layers.js, through densOf), or as a row of its layer's table where one code
    reads every entry (the placer: placeIn, placerOf). biome: its biome's place among its layer's; leads (group: its lead
    group's place, -1 none): whether it is of a group that shares out its patches, its most at a cell then its group's
    (most: else its own); edges: its slice of the lead's noise, softly (a, b its ends; lo, hi: whether they cut, a > 0,
    b < 1); flat: the third of it it holds everywhere; light: its density in the light under what stands over it, from
    none to full; from: whether it grows only on the litter of others, mask: whose (their numbers' bits: none, it grows
    nowhere); lakes: only near the lakes; shore: only on the river's shore between its two ends (rim: softly). */
const ownOf = (e, L) => {
  const g = leadersIn(L).indexOf(e.group), [a, b] = g >= 0 ? e.slice : [0, 1], s = e.shore ?? [0, 0];
  return { biome: biomesIn(L).indexOf(e.biome), group: g, leads: g >= 0, most: g >= 0 ? e.group.most : e.most, a, b, lo: a > 0, hi: b < 1, edges: [a - 0.06, a + 0.06, b - 0.06, b + 0.06], flat: (b - a) * 0.3,
    light: e.light, from: !!e.from, mask: (e.from ?? []).reduce((m, id) => m + 2 ** id, 0), lakes: !!e.lakes, shore: !!e.shore, rim: [s[0] - 0.08, s[0] + 0.08, s[1] - 0.1, s[1] + 0.1] };
};
/** What the placer reads of each of layer L's entries, one table of uniforms for the layer (until 2026-11-19 every entry
    was code of its own in every packing of its layer: its density, its growth, its stages, each with its numbers written
    in): span rows an entry, entry k's from k * span: [its scale's two ends, its asset's height, its shapes], [its ages
    (its biome's, or a sapling's), how wide its groves' patches are (its biome's at the layer's scale), how many stages
    it may be drawn at (a sapling: its first ones; none: it does not grow)], [its biome, its lead group, its most, 1 if a
    sapling], [its edges], [a, b, flat, mask], [its light's two ends, 1 near the lakes only, 1 on litter only], [its
    shore's rim], [1 on the shore only, its feet's first row (feetOf)] (ownOf: what each is), then three rows a stage:
    [where it holds from (none before its first: -1), to (none past its last: 1e9), its first and last age], [its year,
    log(year / first), log(last / year), its variants], [log of its height at its first age, at its year, at its last,
    its first shape]. As many entries and stages as the most any layer has (the rest nought): every layer's placer
    declares it alike; own: the rows an entry has before its stages; count: its entries; has: what any of them has
    (whether any grows, any does not, any is a sapling, any grown, any leads in patches, any grows on litter, keeps to
    the lakes, to the shore): the code reads only what the layer's entries have. One uniform buffer a layer, however
    many kinds stand in it. */
function placerOf(L) {
  if (L.placer) return L.placer;
  const all = LAYERS ?? [L], stagesOf = (e) => (e.asset.growth && e.ages ? e.asset.growth.stages.filter((s) => s.offset < e.shapes[1]) : []);
  const most = Math.max(1, ...all.flatMap((W) => W.entries.map((e) => stagesOf(e).length))), longest = Math.max(...all.map((W) => W.entries.length)), V = (...v) => new THREE.Vector4(...v);
  const heads = L.entries.map((e) => {
    const S = stagesOf(e), o = ownOf(e, L), a = e.asset;
    if (Math.fround(o.mask) !== o.mask || (e.from ?? []).some((id) => 2 ** id !== (1 << id) >>> 0)) throw new Error(`rule.js: the litter ${e.asset.uid} grows on does not fit its mask`);
    return [V(a.placement.scale[0], a.placement.scale[1], a.size.height, e.shapes[1]), V(e.ages?.[0] ?? 0, e.ages?.[1] ?? 0, grovesOf(e.biome, L).clumps * 2.5, S.length),
      V(o.biome, o.group, o.most, e.young ? 1 : 0), V(...o.edges), V(o.a, o.b, o.flat, o.mask), V(o.light[0], o.light[1], +o.lakes, +o.from), V(...o.rim), V(+o.shore, e.feetRow ?? 0, 0, 0)];
  });
  const own = heads[0].length, span = own + most * 3, rows = [];
  L.entries.forEach((e, k) => {
    const S = stagesOf(e);
    rows.push(...heads[k]);
    S.forEach((s, j) => rows.push(V(j ? s.from : -1, j < S.length - 1 ? s.to : 1e9, s.from, s.to), V(s.year, Math.log(s.year / s.from), Math.log(s.to / s.year), s.variants), V(Math.log(s.hFrom), Math.log(s.h), Math.log(s.hTo), s.offset)));
    for (let j = S.length * 3; j < most * 3; j++) rows.push(V());
  });
  while (rows.length < longest * span) rows.push(V());
  const grows = (e) => stagesOf(e).length > 0, any = (f) => L.entries.some(f);
  const has = { grows: any(grows), still: any((e) => !grows(e)), young: any((e) => grows(e) && e.young), grown: any((e) => grows(e) && !e.young), leads: leadersIn(L).length > 0, from: any((e) => e.from), lakes: any((e) => e.lakes), shore: any((e) => e.shore) };
  return (L.placer = { rows: uniformArray(rows, 'vec4'), span, own, has, count: uniform(L.entries.length, 'int') });
}
/** Entry k's numbers (a node: which of layer L's) as its density reads them (densIn): its row of the layer's table;
    what none of the layer's entries has, none (false). */
const rowOf = (L, k) => {
  const P = placerOf(L), at = k.mul(P.span).toVar(), row = (j) => P.rows.element(at.add(j)), B = row(2), E = row(3), W = row(4), V = row(5), S = row(6), Z = row(7), has = P.has;
  return { node: true, biome: B.x, group: B.y, leads: has.leads && B.y.greaterThanEqual(0), most: B.z, lo: W.x.greaterThan(0), hi: W.y.lessThan(1), edges: [E.x, E.y, E.z, E.w], flat: W.z, mask: W.w,
    light: [V.x, V.y], lakes: has.lakes && V.z.greaterThan(0.5), from: has.from && V.w.greaterThan(0.5), rim: [S.x, S.y, S.z, S.w], shore: has.shore && Z.x.greaterThan(0.5), feet: Z.y };
};

// ---- the light under the crowns: what the growth map's shade is ----
// The light that comes down to the ground through what stands over it: each crown as large as it is drawn (grownIn,
// and its kind's span to its height, as the trees' engine reckons how far a plant reaches), its foliage a dome over its
// foot, as deep at d metres off its middle as the dome is high there (√(1 − (d/R)²) of its depth over its middle), the
// light through it Beer–Lambert's (exponential in that depth), SHADE of it taken where the dome is deepest; none taken
// past its reach. What lies on the floor (a stone, a log, a fallen branch) has no crown and takes none.
/** How far a thing of asset a reaches out from its foot, to its height: half its kind's span over its height. */
const spreadOf = (a) => Math.max(most(a.size.length), most(a.size.width ?? 0)) / (2 * a.size.height);
/** Whether the things of entry e have a crown over the ground: a tree, a sapling, a shrub, a herb; not what lies on the floor. */
const crowned = (e) => e.asset.kind !== 'litter';
/** How far the crown of a thing of entry e reaches at the most (metres): its tallest stage at its end, at its largest scale. */
const crownMost = (e) => { const a = e.asset, S = a.growth && e.ages ? a.growth.stages.filter((s) => s.offset < e.shapes[1]) : null; return (S ? Math.max(...S.map((s) => s.hTo)) : a.size.height) * a.placement.scale[1] * spreadOf(a); };
/** The share of the light coming down that reaches the ground d metres off the middle of a crown reaching R metres. */
const throughCrown = (d, R) => { const u = d.div(R); return exp(sqrt(clamp(float(1).sub(u.mul(u)), 0, 1)).mul(Math.log(1 - SHADE))); };

// ---- the ground a thing covers: its feet ----
// A thing keeps clear the ground it really covers, no more: its body where it meets the ground (its feet, measured on
// each of its shapes as it is built: assets/kit/tree.js builder), a trunk's, a sapling's stem's or a bush's stems'
// cross-section where they rise through it, what lies on it (a log's or a branch's wood, a stone's outline). Leaves cover
// none: they shade (above). What a body covers is far smaller than a growth map texel, and nothing of it is drawn into
// the map: what stands in each cell of a layer that writes is kept once (recordOf), and what would grow or lie on the
// ground (a blade, a fern, a bush beside a trunk) tests itself against the pieces of the things whose feet may reach it,
// each turned and scaled as the trees' engine draws it (footAt), where the map's texel says any may (its feet).
/** What the things of the layers that write cover of the ground (ls: those layers), as one table: a row a shape of each
    of their things (its height at scale 1, how far its pieces reach from its foot, where its pieces begin, how many),
    then the pieces, two vec4 each ([ax, az, bx, bz], [ra, rb, edge, 0]: assets/kit/tree.js builder). Each entry's `row`:
    its first shape's row. Each layer's `feet`: how far its things' feet reach at the most (metres), how many of its cells
    a side may reach a point (m: a thing stands inset … 1 - inset into its cell, posIn), and the table; none where nothing
    of it covers any ground. Each layer's `inset`: so that the feet of two of its things in neighbouring cells never meet
    (two trunks never stand in each other: each stands its feet's reach in from its cell's edge, so a point's ground is
    any thing's of one cell only), where they fit in half its cell; where they do not (a fallen log reaches past half
    the understory's cell), none: its things stand anywhere in their cells. Each layer's `record`: where its words keep
    which thing and which row (recordOf), in as many bits as its things and the rows need. */
function feetOf(ls) {
  const rows = [], pieces = [];
  for (const L of ls) {
    const reach = Math.max(0, ...L.entries.map((e) => shapesInto(e, rows, pieces)));
    L.inset = 2 * reach < L.cell ? reach / L.cell : 0;
    L.feet = reach > 0 ? { reach, m: Math.max(1, Math.ceil(1 + 2 * (reach / L.cell - L.inset))) } : null;   // (the cells a side whose things may reach a point: their range, inset … 1 - inset widened by the reach, one cell at the least)
  }
  recordsOf(ls, rows.length);
  // (the table is one uniform buffer: no larger than the device binds; without a GPU nothing binds it)
  if ((rows.length + pieces.length) * 16 > (limitOf('maxUniformBufferBindingSize') || Infinity)) throw new Error('rule.js: the feet do not fit one uniform buffer');
  const table = rows.length ? uniformArray([...rows.map(([H, b, p, n]) => new THREE.Vector4(H, b, rows.length + p, n)), ...pieces.map((v) => new THREE.Vector4(...v))], 'vec4') : null;
  for (const L of ls) if (L.feet) L.feet.table = table;
}
/** Entry e's shapes into the feet table: a row each (its height at scale 1, how far its pieces reach from its foot,
    where its pieces begin, how many) and its pieces; e.feetRow its first. How far its feet reach at its largest (the oldest
    of its stage that grows here, its placement's largest scale), metres. */
function shapesInto(e, rows, pieces) {
  const a = e.asset, staged = !!(a.growth && e.ages); let reach = 0; e.feetRow = rows.length;
  for (let s = 0; s < e.shapes[1]; s++) {
    const P = footprintOf(a, s), H = staged ? a.heights[s] : a.size.height, S = staged ? a.growth.stages.find((x) => s >= x.offset && s < x.offset + x.variants) : null, bound = footprintReach(P);
    rows.push([H, bound, pieces.length, P.length]);
    for (const [ax, az, bx, bz, ra, rb, edge] of P) pieces.push([ax, az, bx, bz], [ra, rb, edge, 0]);
    if (!S || grows(e, S)) reach = Math.max(reach, bound * (S ? S.hTo / H : 1) * a.placement.scale[1]);
  }
  return reach;
}
/** Each layer's record (recordOf): its height as a half float in the low 16 bits, then its thing's number + 1, then its
    shape's row, in as many bits as its things and the rows need. */
function recordsOf(ls, nRows) {
  const rowBits = Math.max(1, Math.ceil(Math.log2(nRows)));
  for (const L of ls) { const k = Math.ceil(Math.log2(L.entries.length + 1)); L.record = { k, kMask: 2 ** k - 1, row: 16 + k }; if (16 + k + rowBits > 32) throw new Error(`rule.js: the ${L.name} layer's things and shapes do not fit a word (recordOf)`); }
}

/** Whether a thing of entry e may be at stage S of its growth: whether the ages grownIn gives it (a grown tree as old as
    its stand, by AGED of its own; a sapling between its first stage and its second year) reach into the ages it stands
    for (its first from none, its last of e's to any). */
const grows = (e, S) => {
  const st = e.asset.growth.stages.filter((x) => x.offset < e.shapes[1]), j = st.indexOf(S), [a0, a1] = e.young ? e.ages : [e.ages[0] * AGED[0], e.ages[1] * AGED[1]];
  return (j ? S.from : -Infinity) <= a1 && (j < st.length - 1 ? S.to : Infinity) > a0;
};

/** A record of what stands in a cell of layer L (recordOf) read back: which of its things (k, -1 none), the row of its
    shape (its layer's feet table), how tall it stands. */
const bodyOf = (rec, L) => { const v = uint(rec).toVar(), R = L.record; return { k: int(v.shiftRight(uint(16)).bitAnd(ofLayer(R, 'kMask', 'uint'))).sub(1), row: int(v.shiftRight(ofLayer(R, 'row', 'uint'))), h: unpackHalf2x16(v.bitAnd(uint(0xFFFF))).x }; };
/** The turn the trees' engine gives the thing of cell c of layer W (trees.js plantIn: rnd 305), radians. */
const turnIn = (c, W) => rnd(c.x, c.y, ofLayer(W, 'seed', 'uint').add(uint(5))).mul(6.2831853);   // (its hash 305, by the layer's seed)
/** Each piece of the shape in row S of the feet table T: fn(A, E), A its ends ([ax, az, bx, bz]), E its widths and kind. */
const piecesOf = (T, S, fn) => Loop({ start: int(S.z), end: int(S.z).add(int(S.w).mul(2)), type: 'int', condition: '<', update: 2, name: 'n' }, ({ n }) => fn(T.element(n), T.element(n.add(1))));   // (its own name: it runs inside the cells' i and j)

/** 1 where p (metres) lies on ground a thing of layer W covers, 0 elsewhere: the things of its cells whose feet may reach
    p (W.feet), each as the growth map keeps it (M.at: its record), p turned back into its own frame and taken to its
    scale 1 (its height over its shape's) against its pieces: a solid piece covers what lies within its width of the line
    between its ends, between them; an outline what its edges close round (a ray from p crosses them an odd number of
    times). */
export function footAt(p, W, M) {
  const F = W.feet, on = float(0).toVar(), lo = ivec2(floor(p.add(F.reach).div(W.cell).sub(W.inset))).sub(F.m - 1).toVar();
  Loop(F.m, F.m, ({ i, j }) => {
    const c = lo.add(ivec2(i, j)).toVar(), B = bodyOf(M.at(W.word, c), W);
    If(on.lessThan(0.5).and(B.k.greaterThanEqual(0)), () => {
      const S = F.table.element(B.row).toVar(), s = B.h.div(S.x).toVar(), d = p.sub(posIn(c, W)).toVar(), b = S.y.mul(s);
      If(dot(d, d).lessThanEqual(b.mul(b)), () => {   // (within its reach at all: most are not)
        const t = turnIn(c, W), cs = cos(t), sn = sin(t), q = vec2(d.x.mul(cs).add(d.y.mul(sn)), d.y.mul(cs).sub(d.x.mul(sn))).div(s).toVar(), odd = float(0).toVar();
        piecesOf(F.table, S, (A, E) => {
          const a = A.xy, ab = A.zw.sub(A.xy);
          If(E.z.lessThan(0.5), () => {
            const l2 = dot(ab, ab), u = l2.greaterThan(0).select(dot(q.sub(a), ab).div(l2), float(0)).toVar(), e = q.sub(a.add(ab.mul(u))), r = mix(E.x, E.y, clamp(u, 0, 1));   // (a disk: its ends one point)
            If(u.greaterThanEqual(0).and(u.lessThanEqual(1)).and(dot(e, e).lessThanEqual(r.mul(r))), () => { on.assign(1); });
          }).Else(() => {
            If(a.y.greaterThan(q.y).notEqual(A.w.greaterThan(q.y)).and(q.x.lessThan(a.x.add(q.y.sub(a.y).mul(ab.x).div(ab.y)))), () => { odd.assign(float(1).sub(odd)); });
          });
        });
        on.assign(max(on, odd));
      });
    });
  });
  return on;
}

/** 1 where the ground the thing of cell c of layer L covers (B: its record, at pos) may reach into the texel round q:
    one of its solid pieces, as round as its ends and its width (in the world: turned, scaled), meets the texel's square;
    an outline, where its thing's whole reach does. What the map's word keeps as its feet (gatherOf). */
const feetIn = (c, L, B, pos, q) => {
  const T = L.feet.table, S = T.element(B.row).toVar(), s = B.h.div(S.x).toVar(), on = float(0).toVar();
  const meets = (m, r) => { const o = max(abs(m.sub(q)).sub(ofLayer(L, 'band').mul(0.5)), 0); return dot(o, o).lessThanEqual(r.mul(r)); };
  If(S.w.greaterThan(0).and(meets(pos, S.y.mul(s))), () => {
    const t = turnIn(c, L), cs = cos(t), sn = sin(t);
    piecesOf(T, S, (A, E) => {
      const m = A.xy.add(A.zw).mul(0.5), r = length(A.zw.sub(A.xy)).mul(0.5).add(max(E.x, E.y)), w = pos.add(vec2(m.x.mul(cs).sub(m.y.mul(sn)), m.x.mul(sn).add(m.y.mul(cs))).mul(s));
      If(E.z.greaterThan(0.5).or(meets(w, r.mul(s))), () => { on.assign(1); });
    });
  });
  return on;
};

/** 1 where p lies on ground a thing of the layers Ws covers (ws: their words read at p, whose feet say whose things may
    reach it; M: the growth map), 0 elsewhere. Worked out where it is called: ask it where something would stand. */
const coveredAt = (p, Ws, ws, M) => { const on = float(0).toVar(); Ws.forEach((W, n) => { if (W.feet) If(on.lessThan(0.5).and(ws[n].feet.greaterThan(0.5)), () => { on.assign(footAt(p, W, M)); }); }); return on; };

/** What the larger layers left at p for layer L (M: the growth map): the light that comes through (0..1); foot(),
    whether the ground at p is covered by their things (coveredAt); and litter(mask): how much of the litter of the
    things whose numbers are its bits lies there (a node or a number: ownOf's mask). */
function influenceAt(p, L, M) {
  if (!M || !L.reads.length) return null;
  const words = L.reads.map((W) => M.read(p, W.word)), light = float(1).toVar();
  for (const w of words) light.mulAssign(float(1).sub(w.shade));
  return { light, foot: () => coveredAt(p, L.reads, words, M), litter: (mask) => { const m = uint(mask); return words.reduce((s, w) => s.add(m.shiftRight(w.lead).bitAnd(uint(1)).equal(uint(1)).select(w.litter, float(0))), float(0)); } };
}

/** The rule at cell c of layer L, its thing to stand at pos (posIn): which of the layer's things stands there (k: its
    entry, -1 none), the river there (I: riverInfo). The cheap test first (every thing at its most, as if far from the
    river, with nothing over it), as most cells of a thinly grown layer hold none; then its entries in their order, each
    its density there (densIn, its numbers its row of the layer's table: one code for all of them), until the share of
    them the cell's rank falls in; the ground the larger things cover last, where one would stand. M: the growth map
    (none: nothing larger is read). */
export function placeIn(c, L, M, pos) {
  const h0 = hashesOf(L), rank = rankOf(c, rnd(c.x, c.y, h0(300))).toVar(), k = int(-1).toVar(), I = vec4(0).toVar();
  const bios = biomesIn(L), top = Math.max(...bios.map((b) => L.entries.filter((e) => e.biome === b).reduce((s, e) => s + e.most, 0)));   // (the most its things stack to in one of its biomes)
  const clump = (b) => groveAt(pos, grovesOf(b, L));   // (0 … 1.6: thick in its groves, open in its glades)
  const coarse = bios.map((b) => (b.river ? float(1) : shareOf(b, { p: pos, dist: float(0), d: float(1e5), w: float(1), b: float(0) })).mul(clump(b))).reduce((a, x) => max(a, x));
  If(rank.lessThan(coarse.mul(top)), () => {
    I.assign(riverInfo(pos));
    const F = influenceAt(pos, L, M), A = placeAt(L, pos, { p: pos, dist: float(0), d: abs(I.x), w: I.y, b: I.z }, F), D = float(0).toVar();
    Loop({ start: int(0), end: placerOf(L).count, type: 'int', condition: '<' }, ({ i }) => {
      D.addAssign(densIn(A, rowOf(L, i)));
      If(rank.lessThan(D), () => { k.assign(i); Break(); });
    });
    // (and none stands on ground a larger thing covers: in a trunk, on a log, a branch or a stone)
    if (F) If(k.greaterThanEqual(0), () => { If(F.foot().greaterThan(0.5), () => { k.assign(-1); }); });
  });
  return { k, I, rank };
}
/** What the rule reads at pos once for all of layer L's entries (densIn): each of its biomes' share there (ctx: the
    place as the biomes read it, the river with it) in its groves, off the places kept clear; each of its lead groups'
    slow noise; the lakes (where any of its entries keeps to them); the river's shore; F (influenceAt). */
function placeAt(L, pos, ctx, F) {
  const clear = clearAt(pos).toVar();
  return { F, s: () => ctx.d.div(ctx.w), near: L.entries.some((e) => e.lakes) ? nearLake(pos).toVar() : null,
    shares: biomesIn(L).map((b) => shareOf(b, ctx).mul(groveAt(pos, grovesOf(b, L))).mul(clear).toVar()),
    leads: leadersIn(L).map((g) => leadAt(pos, grovesOf(g.biome, L)).mul(0.7).add(0.15).toVar()) };
}
/** One of a few nodes by its place (i: a number, that one; a node, the one it says). */
const pick = (list, i) => (typeof i === 'number' ? list[i] : list.reduce((acc, x, j) => (j ? int(i).equal(j).select(x, acc) : x), null));
/** f() where c holds, g() where not: c a boolean (the code holds only the one) or a node (a select). */
const either = (c, f, g) => (typeof c === 'boolean' ? (c ? f() : g()) : c.select(f(), g()));
/** How likely the thing of an entry is to stand at a cell (A: placeAt, there), by its numbers D (ownOf: plain numbers,
    its code its own, where they hold; or rowOf: its row of the layer's table, one code for every entry): its biome's
    share in its groves, its kind's slice of the patches its kinds lead in, its most, the light and the litter the layers
    before it leave (none: what grows only under another's litter grows nowhere), the lakes, the shore. */
function densIn(A, D) {
  let v = pick(A.shares, D.biome).mul(D.most);
  if (D.node) v = v.toVar();
  /** v times f() where c holds (a boolean: here or not; a node: where it does) */
  const times = (c, f) => { if (c === false) return; if (!D.node) v = v.mul(f()); else if (c === true) v.mulAssign(f()); else If(c, () => { v.mulAssign(f()); }); };
  // (a kind that leads in patches: its slice of the slow noise, softly, and a third of it everywhere)
  if (A.leads.length) times(D.leads, () => { const t = pick(A.leads, D.group), [e0, e1, e2, e3] = D.edges; return either(D.lo, () => smoothstep(e0, e1, t), () => float(1)).mul(either(D.hi, () => float(1).sub(smoothstep(e2, e3, t)), () => float(1))).mul(0.7).add(D.flat); });
  if (A.F) { times(true, () => mix(D.light[0], D.light[1], A.F.light)); times(D.from, () => clamp(A.F.litter(D.mask).mul(1.5), 0, 1)); }
  else if (D.from === true) v = float(0);
  else if (D.from !== false) If(D.from, () => { v.assign(0); });
  if (A.near) times(D.lakes, () => A.near);
  times(D.shore, () => { const s = A.s(), [r0, r1, r2, r3] = D.rim; return smoothstep(r0, r1, s).mul(float(1).sub(smoothstep(r2, r3, s))); });
  return v;
}
/** How likely each of layer L's things is to stand in a cell at pos (node code, in a Fn): the rule's own density, an
    entry each (L.entries' order; densIn, by its own numbers written in: ownOf); ctx: the place as the biomes read it, the
    river with it; F: influenceAt (null: nothing larger read). What places a thing (placeIn) and what the land wears for a
    stand where its things are no longer drawn (src/terrain/layers.js) read it alike: the one densIn. */
export function densOf(L, pos, ctx, F = null) {
  const A = placeAt(L, pos, ctx, F);
  return L.entries.map((e) => densIn(A, ownOf(e, L)).toVar());
}

/** A layer's light over a texel (gatherOf): the mean of SUB x SUB points over it, two across its smallest crown (Nyquist's:
    a crown's edge is not lost between them; crownMost: a crown's half width), and how far the farthest of them lies from
    the texel's middle (edge); its crowned entries. */
const lightOf = (L) => { const crowns = L.entries.filter(crowned), SUB = crowns.length ? Math.max(1, Math.ceil(L.band / Math.min(...crowns.map(crownMost)))) : 1; return { crowns, SUB, edge: L.band * (0.5 - 0.5 / SUB) * Math.SQRT2 }; };

/** What stands in cell c of layer L, as the growth map keeps it (growth.js), one word: how tall it stands (grownIn's,
    a half float: the low 16 bits), which of its things (its number + 1, 0 none: the bits after), the row of its shape
    (feetOf: the bits after those; L.record says where). Placed once by the rule; what reads the layer reads this
    (gatherOf, footAt). M: the growth map. */
export const recordOf = (L, M) => (c) => {
  const pos = posIn(c, L).toVar(), R = placeIn(c, L, M, pos), rec = uint(0).toVar();
  If(R.k.greaterThanEqual(0), () => { const T = grownIn(c, L, R.k, pos); rec.assign(packHalf2x16(vec2(T.h, 0)).bitOr(uint(R.k.add(1)).shiftLeft(uint(16))).bitOr(uint(T.shape.add(rowOf(L, R.k).feet)).shiftLeft(uint(L.record.row)))); });
  return rec;
};

/** The cells of layer L round a texel that the growth map's gather reads (gatherOf): as far round its middle as the
    layer's things leave anything there (R, metres: their litter, their crowns over the texel's points, their feet into
    the texel), m a side from lo(x), the first along one side for the texel x; cells(x0, w), the cells the texels x0 …
    x0 + w read along one side [first, past the last], and one more either side (the GPU reckons lo in 32-bit floats);
    span(n), the most cells along a side that n texels read so. */
function gatherCells(L) {
  const { crowns, edge } = lightOf(L), R = Math.max(L.reach, ...crowns.map((e) => crownMost(e) + edge), L.feet ? L.feet.reach + (L.band / 2) * Math.SQRT2 : 0), m = Math.ceil((2 * R) / L.cell) + 1;
  const lo = (x) => Math.floor(((x + 0.5) * L.band - R) / L.cell);
  return { R, m, cells: (x0, w) => [lo(x0) - 1, lo(x0 + w - 1) + m + 1], span: (n) => Math.floor(((n - 1) * L.band) / L.cell) + 1 + m + 2 };
}

/** What layer L leaves at q (a texel's middle, metres) for the layers after it, as the growth map keeps it: what stands in
    each of its cells round q (as the map keeps it: recordOf), its crown taking the light coming down through it (the
    light under the crowns, above: the texel's mean, over lightOf's SUB x SUB points of it, so a crown smaller than a
    texel takes its share of the texel's light), its litter dropped out to beyond its crown (the litter's lead: the thing
    that drops most there), and whether its feet may reach into the texel (feetIn). M: the growth map. */
export function gatherOf(L, M) {
  const { crowns, SUB } = lightOf(L), { R, m } = gatherCells(L), band = ofLayer(L, 'band'), reach = uniform(R), edge = band.mul((0.5 - 0.5 / SUB) * Math.SQRT2);   // (lightOf's edge, of the layer's band: a uniform, as reach)
  const points = Array.from({ length: SUB * SUB }, (_, s) => vec2(((s % SUB) + 0.5) / SUB - 0.5, (Math.floor(s / SUB) + 0.5) / SUB - 0.5).mul(band));
  return (q) => {
    const lo = ivec2(floor(q.sub(reach).div(ofLayer(L, 'cell')))).toVar(), light = points.map(() => float(1).toVar()), feet = float(0).toVar(), litter = float(0).toVar(), lead = uint(0).toVar(), best = float(0).toVar();
    Loop(m, m, ({ i, j }) => {
        const c = lo.add(ivec2(i, j)).toVar(), B = bodyOf(M.at(L.word, c), L);
        If(B.k.greaterThanEqual(0), () => {
          const pos = posIn(c, L).toVar(), E = L.table.element(B.k), r = length(q.sub(pos)).toVar();
          if (crowns.length) {   // (its crown as far as it reaches as it is drawn: none, what lies on the floor)
            const crown = B.h.mul(E.y).toVar();
            If(crown.greaterThan(0).and(r.lessThan(crown.add(edge))), () => { points.forEach((o, s) => light[s].mulAssign(throughCrown(length(q.add(o).sub(pos)), crown))); });
          }
          if (L.feet) If(feet.lessThan(0.5), () => { feet.assign(feetIn(c, L, B, pos, q)); });
          const l = float(1).sub(smoothstep(E.x.mul(0.5), E.x.mul(1.6), r)).mul(E.w).toVar();
          litter.addAssign(l);
          If(l.greaterThan(best), () => { best.assign(l); lead.assign(uint(E.z)); });
        });
    });
    return { shade: float(1).sub(light.reduce((a, b) => a.add(b)).div(points.length)), feet, litter: min(litter, 1), lead };
  };
}

/** The growth map's passes: one for every layer that writes, in their order (growth.js build): what stands in each of
    its cells (record, worked out over the cells its gather reads: cells and span, gatherCells), what it leaves at each
    texel (gather), and feet(p): whether the ground at p is covered by its things (null: none of them covers any). */
export const writersOf = (layers, M) => layers.filter((L) => L.word >= 0).map((L) => { const { cells, span } = gatherCells(L); return { w: L.word, cells, span, record: recordOf(L, M), gather: gatherOf(L, M), feet: L.feet ? (p) => footAt(p, L, M) : null }; });

// ---- what the land reads of the rule (src/terrain/layers.js): where a biome's grown trees and its bushes stand ----
/** A biome's stands as the land wears them far off: its grown trees (its `canopy` colour) and its bushes (its
    `understory`), each { key, P: { clumps, patches, seed, density }, kinds (their assets, with their slices of the patches
    their kinds lead in), CV (its colour), L (the rule's layer they stand in), entries (theirs in it: densOf's) }. rows:
    the trees' engine's. */
export function standsOf(bio, rows) {
  const out = [];
  for (const L of layersOf(rows)) for (const g of L.groups) {
    if (g.biome !== bio) continue;
    const CV = g.kind === 'tree' ? bio.canopy : bio.understory; if (!CV) continue;
    out.push({ key: g.kind, P: { ...grovesOf(bio, L), density: g.most }, kinds: g.entries.map((e) => ({ asset: e.asset, slice: e.slice })), CV, L, entries: g.entries });
  }
  return out;
}
