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
//   influence    what the larger things left where it would stand (src/scatter/growth.js): their shade, their feet and
//                bodies (nothing stands in a trunk), their litter (its `under`: whose litter it is: a cone a pine's, a
//                sapling its own kind's, under the crowns its seeds fell from)
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
import { Fn, If, Loop, float, int, uint, vec2, vec4, ivec2, uniformArray, smoothstep, clamp, mix, max, min, abs, floor, length, pow, log, exp, sqrt } from 'three/tsl';
import { rnd, vnoise, groveAt, leadAt, riverInfo, shareOf, nearLake } from '../world/land.nodes.js';
import { U } from '../core/uniforms.js';
import { recipe, recipes } from '../core/registry.js';
import { scatterRow } from '../../assets/index.js';
import { most } from '../../assets/kinds.js';
import { CLEARINGS } from '../../world/places.js';
import { TEXEL, WORDS } from './growth.js';

const R0 = 0.69, PER = 1.8, CLUMPS = 55, PATCHES = 90, TOP = 1;   // R0: metres of reach where the classes begin (0.69-2.8 m, 2.8-11 m, ...); PER: a cell's side to its class's middle reach; CLUMPS, PATCHES: a biome's groves and the patches where one kind leads, metres, at the class of a grown tree (TOP), where its biome does not say (its `groves`)
const SHADE = 0.85;   // how much of the light coming down through a crown its foliage takes where it is deepest, over its middle
const SUB = 4;   // a growth map texel's light is the mean of SUB x SUB points over it, half a metre apart (gatherOf)

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

// ---- what the rule places: every plant the trees' engine places, grown, and young where it grows ----
const middle = (s) => (Array.isArray(s) ? (s[0] + s[1]) / 2 : s ?? 1);
const reachOf = (a) => (Math.max(most(a.size.length), most(a.size.width ?? 0)) / 2) * middle(a.placement.scale);
/** The things a list of the engine's rows places: { row, asset, biome, young, cover, light, under, reach, ages, shapes:
    [first, count] }. */
function entriesOf(rows) {
  const out = [];
  for (const row of rows) {
    const a = row.asset, P = a.placement, biome = recipe(P.biome); if (!biome) continue;
    const S = a.growth?.stages, base = { row, asset: a, biome, light: P.light ?? [1, 1], under: [P.under ?? []].flat(), shore: P.shore ?? null, lakes: !!P.lakes };
    if (S && biome.age) {
      // grown: as old as its stand (its biome's `age`, a slow noise between its years); its crown at most a little under its oldest's
      out.push({ ...base, young: false, cover: P.cover ?? 0.3, reach: reachOf(a) * 0.8, ages: biome.age, shapes: [0, a.shapeCount] });
      // young: from its first stage to its second year, where the light comes through to its kind's litter
      const top = a.growth.years[1], st = S.filter((s) => s.from < top), n = Math.max(...st.map((s) => s.offset + s.variants));
      if (P.young) out.push({ ...base, young: true, cover: P.young, light: P.youngLight ?? [0.05, 1], under: [a.uid], reach: (reachOf(a) * a.growth.height(top)) / a.size.height, ages: [Math.max(2, S[0].from), top], shapes: [0, n] });
    } else out.push({ ...base, young: false, cover: P.cover ?? 0.3, reach: reachOf(a), ages: null, shapes: [0, a.shapeCount ?? 1] });
  }
  return out;
}

const classOf = (r) => Math.floor(Math.log(Math.max(r, 1e-3) / R0) / Math.log(4));
let LAYERS = null, KEY = '';
/** The layers of what the engine places (rows: its rows), largest first, each { k (its class), cell, seed, entries,
    groups (the kinds that lead in patches: a biome's grown trees, its bushes), reads (the words of the layers before it),
    word (its own, -1: it writes none), reach (metres its things leave anything in) }. The same rows, the same layers. */
export function layersOf(rows) {
  const key = rows.map((r) => r.uid).join();
  if (LAYERS && key === KEY) return LAYERS;
  const by = new Map();
  for (const e of entriesOf(rows)) { const k = classOf(e.reach); if (!by.has(k)) by.set(k, []); by.get(k).push(e); }
  let id = 1, word = 0;
  LAYERS = [...by].sort((a, b) => b[0] - a[0]).map(([k, entries], index) => {
    const cell = PER * R0 * 4 ** (k + 0.5), scale = 4 ** (k - TOP);
    entries.sort((x, y) => (x.asset.uid < y.asset.uid ? -1 : x.asset.uid > y.asset.uid ? 1 : x.young - y.young));
    // (its most at a cell: as much of the ground as it covers there, in things of its reach, one a cell at most)
    entries.forEach((e, i) => Object.assign(e, { i, id: id++, most: Math.min(1, (e.cover * cell * cell) / (Math.PI * e.reach * e.reach)), litter: e.asset.kind === 'tree' && !e.young ? 1 : 0, foot: e.asset.kind === 'tree' ? Math.max(e.asset.trunk?.[0]?.[2] ?? 0.2, 0.2) + 1 : e.reach * 0.6 }));
    // a biome's grown trees lead in patches, one kind here and another there (and so its bushes): their densities are
    // one, shared out by a slow noise (its slice of it: as much as it covers of theirs), a third of it evenly
    const groups = [];
    for (const e of entries) if (!e.young && (e.asset.kind === 'tree' || e.asset.kind === 'shrub')) { let g = groups.find((x) => x.biome === e.biome && x.kind === e.asset.kind); if (!g) groups.push((g = { biome: e.biome, kind: e.asset.kind, entries: [] })); g.entries.push(e); }
    for (const g of groups) { const t = g.entries.reduce((s, e) => s + e.most, 0); let at = 0; g.most = t; for (const e of g.entries) { e.group = g; e.slice = [at / t, (at += e.most) / t]; } }
    const writes = cell >= TEXEL && word < WORDS;
    return { k, index, cell, seed: 300 + 100 * (TOP - k), scale, entries, groups, name: `${cell.toFixed(cell < 1 ? 2 : 1)} m`, word: writes ? word++ : -1,
      reach: Math.max(...entries.map((e) => e.reach * (e.litter ? 1.6 : 1))) };
  });
  // what each layer reads: the words of every layer before it that writes; and whose litter it reads, as their numbers
  for (const L of LAYERS) {
    L.reads = LAYERS.filter((W) => W.index < L.index && W.word >= 0);
    for (const e of L.entries) e.from = e.under.length ? LAYERS.flatMap((W) => (W.index < L.index ? W.entries.filter((x) => e.under.includes(x.asset.uid) && !x.young).map((x) => x.id) : [])) : null;
    L.table = L.word >= 0 ? uniformArray(L.entries.map((e) => new THREE.Vector4(e.reach, e.foot, e.litter ? e.id : 0, e.litter)), 'vec4') : null;
  }
  KEY = key;
  return LAYERS;
}

/** The rows of everything the trees' engine places in the world (what the land reads of the rule asks by them). */
export const rowsOf = () => recipes('asset').filter((a) => a.placement?.at === 'scatter' && a.placement.engine === 'trees').map(scatterRow);
/** A biome's groves at a layer: its `groves` (metres, at a grown tree's class) at the layer's scale, the layer's seed. */
export const grovesOf = (bio, L) => ({ clumps: (bio.groves?.clumps ?? CLUMPS) * L.scale, patches: (bio.groves?.patches ?? PATCHES) * L.scale, seed: L.seed });
/** Where the thing of cell c of layer L stands (metres): somewhere in its cell, never at its edge. */
export const posIn = (c, L) => { const h0 = (k) => uint(k + L.seed - 300); return vec2(c).add(0.08).add(vec2(rnd(c.x, c.y, h0(302)), rnd(c.x, c.y, h0(303))).mul(0.84)).mul(L.cell); };

/** How tall the thing of entry e stands in cell c of layer L (metres), and which of its kind's shapes it is (0 … its
    count), as the trees' engine draws it (src/scatter/trees.js) and the growth map reckons its crown (gatherOf): its own
    scale within its placement's; a tree that grows as old as its stand (its biome's `age`, a slow noise, and a share of
    its own) or, a sapling, as its own age, its stage's height at that age (straight in the logarithms of age and height
    between where the stage begins, its year and where it ends, as assets/kit/tree.js heightIn works it out); one that
    does not grow, its asset's height and a shape at random. pos: where it stands (posIn). Nodes, worked out where the
    thing is known to be e's. */
export function grownIn(c, L, e, pos) {
  const a = e.asset, P = a.placement, GR = a.growth, AG = e.ages, n = e.shapes[1], h0 = (k) => uint(k + L.seed - 300), r = rnd(c.x, c.y, h0(312));
  const own = mix(P.scale[0], P.scale[1], GR && AG ? rnd(c.x, c.y, h0(304)) : pow(rnd(c.x, c.y, h0(304)), 1.3)), h = float(1).toVar(), shape = float(0).toVar();
  if (GR && AG) {
    const age = (e.young ? mix(AG[0], AG[1], r.mul(r)) : mix(AG[0], AG[1], vnoise(pos.div(grovesOf(e.biome, L).clumps * 2.5), h0(311))).mul(mix(0.65, 1.3, r))).toVar();
    GR.stages.forEach((S, j) => {
      if (S.offset >= n) return;   // (a sapling: only its first stages)
      const lo = j ? S.from : -1, hi = j < GR.stages.length - 1 && GR.stages[j + 1].offset < n ? S.to : 1e9;
      If(age.greaterThanEqual(lo).and(age.lessThan(hi)), () => {
        const ag = clamp(age, S.from, S.to), low = ag.lessThan(S.year);
        const t = low.select(log(ag.div(S.from)).div(Math.log(S.year / S.from)), log(ag.div(S.year)).div(Math.log(S.to / S.year)));
        h.assign(exp(low.select(mix(float(Math.log(S.hFrom)), float(Math.log(S.h)), t), mix(float(Math.log(S.h)), float(Math.log(S.hTo)), t))).mul(own));
        shape.assign(floor(rnd(c.x, c.y, h0(309)).mul(S.variants)).add(S.offset));
      });
    });
  } else { h.assign(own.mul(a.size.height)); shape.assign(floor(rnd(c.x, c.y, h0(309)).mul(n)).min(n - 1)); }
  return { h, shape };
}

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

/** What the larger layers left at p for layer L (M: the growth map): the light that comes through (0..1), how much of
    the ground their feet take, and litter(ids): how much of the litter of those things lies there. */
function influenceAt(p, L, M) {
  if (!M || !L.reads.length) return null;
  const words = L.reads.map((W) => M.read(p, W.word)), light = float(1).toVar(), foot = float(0).toVar();
  for (const w of words) { light.mulAssign(float(1).sub(w.shade)); foot.assign(max(foot, w.foot)); }
  return { light, foot, litter: (ids) => words.reduce((s, w) => s.add(ids.map((id) => w.lead.equal(uint(id))).reduce((a, b) => a.or(b)).select(w.litter, float(0))), float(0)) };
}

/** The rule at cell c of layer L, its thing to stand at pos (posIn): which of the layer's things stands there (k: its
    entry, -1 none), the river there (I: riverInfo). The cheap test first (every thing at its most, as if far from the
    river, with nothing over it), as most cells of a thinly grown layer hold none. M: the growth map (none: nothing
    larger is read). */
export function placeIn(c, L, M, pos) {
  const h0 = (k) => uint(k + L.seed - 300), rank = rankOf(c, rnd(c.x, c.y, h0(300))).toVar(), k = int(-1).toVar(), I = vec4(0).toVar();
  const bios = [...new Set(L.entries.map((e) => e.biome))], top = Math.max(...bios.map((b) => L.entries.filter((e) => e.biome === b).reduce((s, e) => s + e.most, 0)));   // (the most its things stack to in one of its biomes)
  const clump = (b) => groveAt(pos, grovesOf(b, L));   // (0 … 1.6: thick in its groves, open in its glades)
  const coarse = bios.map((b) => (b.river ? float(1) : shareOf(b, { p: pos, dist: float(0), d: float(1e5), w: float(1), b: float(0) })).mul(clump(b))).reduce((a, x) => max(a, x));
  If(rank.lessThan(coarse.mul(top)), () => {
    I.assign(riverInfo(pos));
    const d = abs(I.x), w = I.y, ctx = { p: pos, dist: float(0), d, w, b: I.z }, clear = clearAt(pos).toVar(), F = influenceAt(pos, L, M);
    const share = new Map(bios.map((b) => [b, shareOf(b, ctx).mul(clump(b)).mul(clear).toVar()]));
    const leads = new Map(L.groups.filter((g) => g.entries.length > 1).map((g) => [g, leadAt(pos, grovesOf(g.biome, L)).mul(0.7).add(0.15).toVar()]));
    const D = float(0).toVar();
    for (const e of L.entries) {
      let dens = share.get(e.biome);
      // (a kind that leads in patches: its slice of the slow noise, softly, and a third of it everywhere)
      if (e.group && leads.has(e.group)) { const t = leads.get(e.group), [a, b] = e.slice; dens = dens.mul(e.group.most).mul((a > 0 ? smoothstep(a - 0.06, a + 0.06, t) : float(1)).mul(b < 1 ? float(1).sub(smoothstep(b - 0.06, b + 0.06, t)) : float(1)).mul(0.7).add((b - a) * 0.3)); }
      else dens = dens.mul(e.most);
      if (F) {
        dens = dens.mul(mix(e.light[0], e.light[1], F.light)).mul(float(1).sub(F.foot));
        if (e.from) dens = dens.mul(e.from.length ? clamp(F.litter(e.from).mul(1.5), 0, 1) : float(0));
      } else if (e.from) dens = float(0);
      if (e.lakes) dens = dens.mul(nearLake(pos));
      if (e.shore) { const s = d.div(w); dens = dens.mul(smoothstep(e.shore[0] - 0.08, e.shore[0] + 0.08, s).mul(float(1).sub(smoothstep(e.shore[1] - 0.1, e.shore[1] + 0.1, s)))); }
      D.addAssign(dens);
      If(k.lessThan(0).and(rank.lessThan(D)), () => { k.assign(e.i); });
    }
  });
  return { k, I, rank };
}

/** What layer L leaves at q (a texel's middle, metres) for the layers after it, as the growth map keeps it: each of its
    cells round q placed by the rule, and what stands there takes the light coming down through its crown (the light
    under the crowns, above: the texel's mean, over SUB x SUB points of it, so a crown smaller than a texel takes its
    share of the texel's light), takes the ground at its foot, and drops its litter out to beyond its crown; the litter's
    lead is the thing that drops most there. */
export function gatherOf(L, M) {
  const crowns = L.entries.filter(crowned), crownFar = Math.max(0, ...crowns.map(crownMost));
  // (q: the texel's middle; texel: its side, metres, a node: the growth map's level's. Its cells as far round q as anything
  // of theirs reaches: their litter and feet, their crowns over the texel's points)
  return (q, texel) => {
    const edge = texel.mul((0.5 - 0.5 / SUB) * Math.SQRT2), reach = crowns.length ? max(float(L.reach), edge.add(crownFar)).toVar() : float(L.reach), m = int(reach.mul(2 / L.cell)).add(2).toVar();
    const points = Array.from({ length: SUB * SUB }, (_, s) => vec2(((s % SUB) + 0.5) / SUB - 0.5, (Math.floor(s / SUB) + 0.5) / SUB - 0.5).mul(texel));
    const lo = ivec2(floor(q.sub(reach).div(L.cell))).toVar(), light = points.map(() => float(1).toVar()), foot = float(0).toVar(), litter = float(0).toVar(), lead = uint(0).toVar(), best = float(0).toVar();
    Loop({ start: int(0), end: m, type: 'int', condition: '<' }, { start: int(0), end: m, type: 'int', condition: '<' }, ({ i, j }) => {
        const c = lo.add(ivec2(i, j)).toVar(), pos = posIn(c, L).toVar(), R = placeIn(c, L, M, pos);
        If(R.k.greaterThanEqual(0), () => {
          const E = L.table.element(R.k), r = length(q.sub(pos)).toVar();
          if (crowns.length) {   // (its crown as far as it reaches as it is drawn: none, what lies on the floor)
            const crown = float(0).toVar();
            for (const e of crowns) If(R.k.equal(e.i), () => { crown.assign(grownIn(c, L, e, pos).h.mul(spreadOf(e.asset))); });
            If(crown.greaterThan(0).and(r.lessThan(crown.add(edge))), () => { points.forEach((o, s) => light[s].mulAssign(throughCrown(length(q.add(o).sub(pos)), crown))); });
          }
          foot.assign(max(foot, smoothstep(max(E.y, texel.mul(0.75)), max(E.y, texel.mul(0.75)).mul(0.5), r)));
          const l = float(1).sub(smoothstep(E.x.mul(0.5), E.x.mul(1.6), r)).mul(E.w).toVar();
          litter.addAssign(l);
          If(l.greaterThan(best), () => { best.assign(l); lead.assign(uint(E.z)); });
        });
    });
    return { shade: float(1).sub(light.reduce((a, b) => a.add(b)).div(points.length)), foot, litter: min(litter, 1), lead };
  };
}

/** The growth map's passes: one for every layer that writes, in their order; far(L): metres what reads it is drawn to. */
export const writersOf = (layers, M, far = () => Infinity) => layers.filter((L) => L.word >= 0).map((L) => ({ w: L.word, gather: gatherOf(L, M), far: far(L) }));

// ---- what the land reads of the rule (src/terrain/layers.js): where a biome's grown trees and its bushes stand ----
/** A biome's stands as the land wears them far off: its grown trees (its `canopy` colour) and its bushes (its
    `understory`), each { key, P: { clumps, patches, seed, density }, kinds (their assets, with their slices of the patches
    their kinds lead in), CV (its colour) }. rows: the trees' engine's. */
export function standsOf(bio, rows) {
  const out = [];
  for (const L of layersOf(rows)) for (const g of L.groups) {
    if (g.biome !== bio) continue;
    const CV = g.kind === 'tree' ? bio.canopy : bio.understory; if (!CV) continue;
    out.push({ key: g.kind, P: { ...grovesOf(bio, L), density: g.most }, kinds: g.entries.map((e) => ({ asset: e.asset, slice: e.slice })), CV });
  }
  return out;
}
