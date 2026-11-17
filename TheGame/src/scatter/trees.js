// What stands in a stand: every asset whose placement names this engine (a tree, a bush, a fern, a fallen branch),
// scattered where its biome lies (placement.biome), in its biome's stand (placement.stand: `trees` unless it says), one
// plant at most in a cell. A tier per level of detail, each drawn only in the band of distances where a plant of it is
// the size on screen its kind asks (assets/kinds.js), packed by a compute pass, so only the plants that stand are
// drawn (tier.js).
//
// A stand is one thing to the engine, however many kinds grow in it (groupsOf), and it is drawn by the one drawer
// (drawer.js), as the rocks are:
//   - every shape of every kind at every level lies in one heap on the GPU (heap.js), made in the recipes' workers by
//     the kinds' families (assets/zoo/*.js: a plant asset's shapes; assets/kit/plant.js lays them out as quads) and
//     kept in the browser: no mesh of a plant is on the page, and a start builds none;
//   - its cells are worked out once a level for all its kinds (plantIn): one packing, each plant dropped into its
//     shape's draw; its row says which it is, its vertices are read from the heap by that, its corners are the draw's;
//   - all of it is drawn by one material (plantMaterial), the drawer's second make of vertex: what a kind is (its
//     bark, its leaves, how it takes the wind and the light) is a few numbers a kind (a row: numbersOf), so every
//     kind, shape and level is one shader. Its light is worked out at its corners, a pixel reads one texture: a crown
//     is many cards deep.
// So a new kind costs its meshes' bytes, a draw a shape and level, and a few lines of its stand's packing: no tier,
// no shader of its own. Until 2026-11-14 every shape of every kind was a mesh of its own, built on the page's one
// thread and kept there (35 MB of arrays, and the same again on the GPU).
//
// Nothing that stands in a stand appears or drops out at once, whatever it is (any asset this engine places gets all of
// it, none of it written in the asset's file):
//   - its size on screen is measured as its kind says (its largest side; a tree's height), by each vertex, this frame;
//     or, where its stand says a `size`, as that for every plant of the stand: the stand changes level as one;
//   - between two levels both are drawn: the finer level's sprigs shrink to their feet one by one as the coarser one's
//     grow from theirs;
//   - its last level (the kit's: one body) sinks into the ground over its last pixels (kinds.js: sink);
//   - where it has sunk, the land wears its stand's colour (the stand's `cover`: src/terrain/material.js), as thick as
//     the stand grows there: a forest, and its undergrowth, to the horizon.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, vec2, vec3, vec4, uniform, varyingProperty, attribute, positionGeometry, If, Discard, abs, max, min, mix, smoothstep, pow, normalize, length, floor, cos, sin, atan, clamp, log, exp, exp2, step, fract, unpackHalf2x16, storage } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, vnoise, camDist, riverInfo, heightAt, shareOf, groveAt, leadAt, nearLake } from '../world/land.nodes.js';
import { kindsOf, whereOf } from '../world/stand.js';
import { toScreen, airOf, skyLight, weatherOn, snowLiftAtVertex, cloudAtVertex, unlit, windAt, windDir, windStrength, stillness } from '../world/light.js';
import { CLEARINGS } from '../../world/places.js';
import { recipe, recipes, versionOf } from '../core/registry.js';
import { geometryOf, scatterRow } from '../../assets/index.js';
import { kindOf, sizeOf, most } from '../../assets/kinds.js';
import { levelOf, handOver, partGrown, sinkInto } from '../detail/handover.js';
import { offScreen, clipOf, MAXP, Tier } from './tier.js';
import { createDrawer } from './drawer.js';
import { heapRow, sinceCame } from './heap.js';
import { plantOf } from './plantvert.js';
import { placedBy, bodyOf } from '../../assets/zoo/index.js';
import { inView } from './view.js';
import { addBodies, bodyGrid, topOf, wanted } from '../world/bodies.js';
import { idOf } from '../world/things.js';
import { wayAt, waysVersion } from '../world/ways.js';
import { pxOf, turnOf, seedOf } from './row.js';
import { LOD, LOD_DEFAULT, CROWD, levelOf as crowdLevelOf } from '../../assets/kit/crowd.js';
import { crowdLevel, crowdOf, bandsOf, GRID, TIPUV, GOQ } from '../../assets/kit/plant.js';
import { flagText, flagNum } from '../core/flags.js';
import { bits, lo16, hi16, sn8 } from './unpack.js';
import { COVER } from '../materials/bake.js';

// `?lod=new` (intent 0033): every plant's levels but its finest splay are a first share of one build of its nearest
// level by the crowd kit (assets/kit/crowd.js), and the one rule moves each vertex by its size on screen, smoothly: a
// crowd's parts go one by one and those that stay grow, the wood thins, the far bodies grow out of the crown and turn
// into each other. Its levels are only where its parts lie in the heap: two levels at the size where they meet draw the
// same. `?card=` and `?kmax=` set its two numbers. Without the flag the plants are as they were.
if ((flagText('lod') ?? LOD_DEFAULT) === 'new') Object.assign(LOD, { on: true, CARD: flagNum('card', LOD.CARD), KMAX: flagNum('kmax', LOD.KMAX), SPLIT: flagNum('split', LOD.SPLIT), BAKE: flagText('bake') !== '0', FAR: flagNum('far', flagText('bake') !== '0' ? 40 : LOD.FAR) });   // (baked crowns, and the far body from 40 px with them: `?bake=0` for the cards' own far end, by 18 px)
// SPREAD: how much more of its painting an enlarged card shows (1: all of it, its leaves as large as ever; 0: its
// painting enlarged with it, as today's coarser levels draw larger sprigs). Seen from afar a card shows its painting
// mipped, and a painting shown many times over is mipped to a blur its cut-out passes everywhere: the card is then a
// solid patch. So 0 until the cut-out is reckoned by how much of the card is leaves (`?spread=` to try).
const SPREAD = flagNum('spread', 0);
const SX = (2 * GRID.xz) / 65535, SY = (GRID.y1 - GRID.y0) / 65535;
/** A crowd level's vertex: what the rule moves it by, from the elements a plant's vertex is (assets/kit/plant.js), and
    its shape's sixteen numbers (ruleOf). */
const crowdOfElems = (e0, e1, rule) => {
  const tip = vec3(lo16(e1.z).mul(SX).sub(GRID.xz), hi16(e1.z).mul(SY).add(GRID.y0), lo16(e1.w).mul(SX).sub(GRID.xz)).toVar();   // (a far body's corner: its place on the next coarser)
  return { body: float(bits(e0.w, 13, 7)).toVar(), tipUv: vec2(sn8(e1.y, 16), sn8(e1.y, 24)).mul(TIPUV).toVar(), tip, to: tip, go: hi16(e1.w).greaterThan(0).select(exp2(hi16(e1.w).div(GOQ).sub(8)), float(0)).toVar(), rule };
};
/** A crowd level's shape's sixteen numbers from the two elements before its vertices (assets/kit/plant.js: half
    floats, two a number of 32 bits), as four vec4 (crowd.js RULE). */
const ruleOf = (a, b) => [vec4(unpackHalf2x16(a.x), unpackHalf2x16(a.y)), vec4(unpackHalf2x16(a.z), unpackHalf2x16(a.w)), vec4(unpackHalf2x16(b.x), unpackHalf2x16(b.y)), vec4(unpackHalf2x16(b.z), unpackHalf2x16(b.w))];
const smooth01 = (t) => { const c = clamp(t, 0, 1); return c.mul(c).mul(float(3).sub(c.mul(2))); };
/** The one rule (assets/kit/crowd.js, the same in JS there): where a crowd level's vertex lies and what of its painting
    it wears at px pixels, and whether it shows. V: the vertex (position, root, uv, part) with C, what the rule moves it by
    (crowdOfElems; rule: its shape's numbers, four vec4). hand: how far a part has grown in from the splay of its sprigs
    (1: wholly); whole: whether the wood is the splay's or this level's. */
function crowdRule(px, V, C, hand = float(1), whole = null) {
  const [r0, r1, r2, r3] = C.rule, P0 = r0.x, E = r0.y, HI = r0.z, LO = r0.w, A = r2.z, X = r2.w, KMAX = r3.x;
  const share = min(float(1), pow(max(px, 0).div(P0), A));
  // the share of the cards' area that share is (the largest come first): straight between its classes' bounds
  const seg = (s0, a0, s1, a1) => a0.add(a1.sub(a0).mul(clamp(share.sub(s0).div(max(s1.sub(s0), 1e-6)), 0, 1)));
  const area = share.lessThanEqual(r1.x).select(seg(float(0), float(0), r1.x, r1.y), share.lessThanEqual(r1.z).select(seg(r1.x, r1.y, r1.z, r1.w), share.lessThanEqual(r2.x).select(seg(r1.z, r1.w, r2.x, r2.y), seg(r2.x, r2.y, float(1), float(1)))));
  const k = min(KMAX, pow(max(area, 1e-9), E.negate()));
  const g = C.go.greaterThan(0).select(smooth01(px.div(max(C.go, 1e-6)).sub(1).div(CROWD.GROW - 1)), float(1));
  const h = HI.greaterThan(0).select(smooth01(log(HI.div(max(px, 1e-6))).div(log(HI.div(LO)))), float(0));
  const turned = (i) => smooth01(log(float(CROWD.TURN[i][0]).div(max(px, 1e-6))).div(Math.log(CROWD.TURN[i][0] / CROWD.TURN[i][1])));
  const card = V.part.greaterThan(0.5).and(V.part.lessThan(1.5)).and(C.body.lessThan(0.5)), body = C.body.greaterThan(0.5), post = C.body.greaterThan(3.5);
  const pos = V.position.toVar(), uv = V.uv.toVar(), shown = float(1).greaterThan(0).toVar();
  If(card, () => {
    const grown = g.mul(hand), at = (p) => C.tip.add(p.sub(C.tip).mul(k));
    pos.assign(mix(at(V.root), at(V.position), grown)); uv.assign(V.uv.add(C.tipUv.mul(float(1).sub(pow(k, SPREAD))))); shown.assign(grown.greaterThan(0));
  }).ElseIf(post, () => {
    pos.assign(mix(V.position, C.to, turned(1))); shown.assign(px.lessThan(HI).and(px.greaterThanEqual(CROWD.TURN[1][1])).and(h.greaterThanEqual(0.5)));
  }).ElseIf(body, () => {
    const b = C.body.sub(1), turn = b.lessThan(0.5).select(turned(0), b.lessThan(1.5).select(turned(1), float(0)));
    pos.assign(mix(V.root, mix(V.position, C.to, turn), h));
    const T0 = CROWD.TURN[0][1], T1 = CROWD.TURN[1][1], range = b.lessThan(0.5).select(px.greaterThanEqual(T0), b.lessThan(1.5).select(px.greaterThanEqual(T1).and(px.lessThan(T0)), px.lessThan(T1)));   // (each from its size up to the next, as a level's band: assets/kit/crowd.js levelOf)
    shown.assign(px.lessThan(HI).and(range).and(h.greaterThan(0)));
  }).Else(() => {   // (the wood: a thin piece shrinks to its foot; all of it gives way to the post half way into the far body)
    const wood = C.go.lessThanEqual(0).or(g.greaterThan(0)).and(h.lessThan(0.5));
    pos.assign(mix(V.root, V.position, g)); shown.assign(whole ? wood.and(whole) : wood);
  });
  return { pos, uv, shown };
}

export const GROW = 1.5, SLOTS = 6, FOOT = 0.15;   // GROW: seconds a finest level that has just come takes to grow out of the next (its sprigs one after another); SLOTS: of how many shapes a stand holds the finest meshes at once; FOOT: how deep a plant's foot is set into the ground

// 1 where a tree may stand, 0 within what stands at a place (its clearing) or on the library's stage
const clearAt = (p) => {
  let c = float(1);
  for (const P of CLEARINGS) c = c.mul(smoothstep(P.clear + 2, P.clear + 6, length(p.sub(vec2(P.x, P.z)))));
  return c.mul(U.uStage.z.greaterThan(0).select(smoothstep(U.uStage.z.add(1), U.uStage.z.add(5), length(p.sub(U.uStage.xy))), float(1)));
};

/** A biome's stand of trees, as a kind of tree that grows there takes it: the biome's own (its `trees`: one grid of cells
    for every kind, how thick it grows, its groves, the patches where one kind or another leads, its ages, its seed);
    what the biome leaves out, the tree's own placement gives (a tree that stands alone in a biome with no stand of its own). */
export const standOf = (asset, biome = recipe(asset.placement.biome)) => {
  const P = asset.placement, B = biome?.[P.stand ?? 'trees'] || {};
  return { cell: B.cell ?? P.cell ?? 10, density: B.density ?? P.density ?? 1, clumps: B.clumps ?? P.clumps ?? 0, patches: B.patches ?? 0, age: P.age ?? B.age ?? null, seed: B.seed ?? P.seed ?? 300, where: B.where ?? null, size: B.size ?? null, shore: B.shore ?? null, lakes: !!B.lakes };
};

// what stands in a cell: a plant, or nothing. Where one stands, `found` is told (the drawer's: drawer.js tier): which
// it is (its kind's, and of its kind's shapes one: its number among the stand's), how large, how far; the drawer says
// whether it is of the tier's level, and it is then packed into two vec4 as every placer packs a thing (row.js: A: x, z,
// its foot's height, its size in metres as its kind measures it; B: its turn, which it is, its sway's phase, its seed,
// which is its shade too); its scale is its size over its shape's at scale 1 (sizeAtOne). Done once per cell for the
// whole stand (src/scatter/tier.js); the cheap tests first, as most cells hold none.
//   G: the stand's group (groupsOf): its stand (the cells, the groves, the patches: the biome's, the same for every kind
//      that grows there) and its kinds, each with its slice of those cells (each cell one plant of one kind: a mix, not
//      plants standing in each other; a kind leading in patches, ST.patches metres across, not sprinkled evenly);
//   a kind's growth: its stages by age, the age its stand's, the plant its stage scaled to its own height (assets/kit/tree.js)
// What is the same for every kind (where the cell is, whether it is seen, the groves, the land's rule, the river, the
// height of the ground) is worked out once; a kind adds only its few lines (its size, its shape).
function plantIn(c, G, band, all, seen, found) {
  const { ST, biome, kinds } = G, cx = c.x, cy = c.y, K = ST.seed - 300, h0 = (k) => uint(k + K);   // the stand's seed moves every hash: another seed, another stand (a kind's own seed is its shapes')
  const which = float(0).toVar();   // which of the stand's shapes it is (a kind's first, and of its shapes one)
  const pos = vec2(c).add(0.08).add(vec2(rnd(cx, cy, h0(302)), rnd(cx, cy, h0(303))).mul(0.84)).mul(ST.cell), dist = camDist(pos);
  const range = all ? length(pos.sub(band.at ?? U.uCam.xz)) : dist;   // the shadow's stand-in: metres round the camera, whatever the lens (what is solid: round where it is asked for, band.at)
  const there = range.lessThan(band.far).and(range.greaterThanEqual(band.near));
  If(seen ? there.and(inView(pos, seen.r, seen.high)) : there, () => {   // (seen.r: a uniform, its level's)   // (and in the eye's view: not the shadow's stand-in, whose shade may fall into it)
   // which kind this cell is, one answer for the whole stand: a slow noise (a kind leads here, another there) and the
   // cell's own hash; the kind whose slice it falls in (none: a kind of the stand that is not of this group)
   const lead = ST.patches ? leadAt(vec2(c).add(0.5).mul(ST.cell), ST).mul(0.7).add(rnd(cx, cy, h0(320)).mul(0.3)).min(0.9999) : rnd(cx, cy, h0(320));
   const k = int(-1).toVar();
   kinds.forEach((Kd, i) => { If(lead.greaterThanEqual(Kd.slice[0]).and(lead.lessThan(Kd.slice[1])), () => { k.assign(i); }); });
   If(k.greaterThanEqual(0), () => {
    const r0 = rnd(cx, cy, h0(300));
    // groves and glades: a stand is not a plantation (a noise as wide as its clumps sets how thick it grows here)
    // (and where the stand itself, and this kind of it, like to grow: their `where`, 0..1 at a place, if they say:
    // an understory thin in deep shade, a fern in the glades)
    const own = float(1).toVar();
    kinds.forEach((Kd, i) => { const f = whereOf(Kd.asset); if (f) If(k.equal(i), () => { own.assign(f({ p: pos })); }); });
    const likes = ST.where ? ST.where({ p: pos }).mul(own) : own;
    const grove = groveAt(pos, ST), dens = grove.mul(ST.density).mul(likes);
    // (a stand that keeps to a lake: only round one; one of a biome by the river is not looked at as if far from it)
    const coarse = biome.river ? dens : shareOf(biome, { p: pos, dist, d: float(1e5), w: float(1), b: float(0) }).mul(dens);
    If(r0.lessThan(ST.lakes ? coarse.mul(nearLake(pos)) : coarse), () => {   // its stands, as if far from the river
      const I = riverInfo(pos), d = abs(I.x), w = I.y;
      // (a stand that keeps to the shore: only so far from the channel's middle, in its half-widths: the reeds' shallows)
      const shore = ST.shore ? smoothstep(ST.shore[0] - 0.08, ST.shore[0] + 0.08, d.div(w)).mul(float(1).sub(smoothstep(ST.shore[1] - 0.1, ST.shore[1] + 0.1, d.div(w)))) : float(1);
      If(r0.lessThan(shareOf(biome, { p: pos, dist, d, w, b: I.z }).mul(dens).mul(clearAt(pos)).mul(shore)), () => {
        const s = float(1).toVar(), h = float(1).toVar(), across = float(1).toVar(), out = float(0).toVar();
        // the kind's own: how large this one is, and which of its shapes
        kinds.forEach((Kd, i) => { If(k.equal(i), () => {
          const a = Kd.asset, P = a.placement, GR = a.growth, AG = Kd.age;
          if (GR && AG) {   // as old as its stand: a slow noise gives the stand its age, a few saplings among the old
            const own = mix(P.scale[0], P.scale[1], rnd(cx, cy, h0(304)));
            const stand = mix(AG.stand[0], AG.stand[1], vnoise(pos.div((ST.clumps || 50) * 2.5), h0(311))), r = rnd(cx, cy, h0(312));
            const age = rnd(cx, cy, h0(313)).lessThan(AG.young ?? 0).select(mix(AG.min ?? 2, stand.mul(0.45), r), stand.mul(mix(0.65, 1.3, r))).toVar();
            GR.stages.forEach((S, j) => {
              const lo = j ? S.from : -1, hi = j < GR.stages.length - 1 ? S.to : 1e9;
              If(age.greaterThanEqual(lo).and(age.lessThan(hi)), () => {
                // (its height: its stage's height by age where the stage begins, at its year and where it ends, straight
                // in the logarithms of age and height between them, as assets/kit/tree.js heightIn works it out)
                const ag = clamp(age, S.from, S.to), low = ag.lessThan(S.year);
                const t = low.select(log(ag.div(S.from)).div(Math.log(S.year / S.from)), log(ag.div(S.year)).div(Math.log(S.to / S.year)));
                const hh = exp(low.select(mix(float(Math.log(S.hFrom)), float(Math.log(S.h)), t), mix(float(Math.log(S.h)), float(Math.log(S.hTo)), t)));
                h.assign(hh.mul(own)); which.assign(floor(rnd(cx, cy, h0(309)).mul(S.variants)).add(S.offset + Kd.offset));
              });
            });
          } else {   // no growth: a shape at random, its size its placement's scale
            s.assign(mix(P.scale[0], P.scale[1], pow(rnd(cx, cy, h0(304)), 1.3))); h.assign(s.mul(a.size.height)); which.assign(floor(rnd(cx, cy, h0(309)).mul(Kd.shapes)).min(Kd.shapes - 1).add(Kd.offset));
          }
          out.assign(h.mul(Kd.spread));   // (how far it reaches out from its foot: half its kind's span, at its height)
          across.assign(h.mul(Kd.wide));   // (its size on screen by what its kind measures it by, src/detail sizeOf: a bush is low and wide, its largest side counts. `wide`: that to its height)
        }); });
        // Whether it is of the tier's level (the size on screen the level asks, and a little either side: its hand-over,
        // and as far as the camera may move before the cells are worked out again) the drawer says; what of it shows,
        // its vertices say each frame (plantMaterial). (The shadow's stand-in: every plant in its band)
        // A stand that says its `size` changes level as one: every plant of it as if it were that size, small or large,
        // so its levels change at the same distances for all (not bush by bush at every depth at once)
        const size = ST.size ? float(ST.size) : across, way = wayAt(pos, out.add(0.5));
        const stands = () => found(uint(which), size, dist, (A, B) => {
          A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(FOOT), across));   // (where it stands, its foot, its size in metres)
          B.assign(vec4(rnd(cx, cy, h0(305)).mul(6.2831853), which, rnd(cx, cy, h0(306)).mul(6.2831853), rnd(cx, cy, h0(307)).mul(0.999 * 6.2831853)));   // (its turn, its kind, its sway's phase, its seed: its shade, as it always was)
        });
        // (and nothing of it reaches over a way: what moves there, on the ground or over it, meets no plant. src/world/ways.js;
        // where none are laid the shader is the one it was)
        if (way) If(way.lessThan(0.5), stands); else stands();
      });
    });
   });
  });
}

// What a kind is to the one material, as a few numbers: hk, how tall its shape is (how far up it the wind takes hold);
// wind (how far it sways, how far it may lean, how much its leaves flutter, how its snow clumps); leaf (how far the
// light reaches round its leaves, how much shines through, and the layers of its leaves' and its wood's textures:
// src/materials/bake.js); tint, its leaves' own colour. A kind is these numbers: no shader of its own.
/** How large shape `shape` of a plant asset is at scale 1, metres, as its size on screen is measured (sizeOf: a tree's
    height, a bush's largest side): where it grows by its stand's age (assets/kit/tree.js: growth; `staged`), that
    shape's own height as built (its crown's top, which may stand over its stage's height by age), so a tree of an age
    is drawn exactly as tall as its height by age says (intent 0035); else its asset's, by the kind's measure. A plant's
    packed size (A.w) over this is its scale. */
export const sizeAtOne = (a, shape = 0, staged = true) => { const H = a.size.height, S = staged && a.growth?.stages?.find((x) => shape >= x.offset && shape < x.offset + x.variants); return (S ? a.heights?.[shape] ?? S.h : H) * (sizeOf(a) / H); };
const numbersOf = (tex, row, shape = 0) => {
  const a = row.asset, M = a.materials || {}, F = { wrap: 0.45, through: 0.55, flutter: 1, ...kindOf(a, 'foliage') };   // (its own `foliage` over its kind's)
  return { hk: a.heights?.[shape] ?? a.size.height, ks: sizeAtOne(a, shape), wind: [kindOf(a, 'wind')?.sway ?? 0, a.placement.lean ?? 0, F.flutter, row.snow.clumps], leaf: [F.wrap, F.through, tex.layer(M.leaves ?? M.needles ?? M.wood), tex.layer(M.wood ?? M.leaves ?? M.needles)], twig: tex.layer(a.fine?.twig ?? M.leaves ?? M.needles ?? M.wood), tint: F.tint ?? [1, 1, 1] };
};
// (the library's plant, a mesh of its own: the same numbers on the mesh, its userData)
const wear = (mesh, tex, row, shape = 0) => {
  const N = numbersOf(tex, row, shape);
  Object.assign(mesh.userData, { hk: N.hk, ks: N.ks, wind: new THREE.Vector4(...N.wind), leaf: new THREE.Vector4(...N.leaf), twig: N.twig, tint: new THREE.Vector3(...N.tint) });
  return mesh;
};
const ofMesh = (key, start, type) => uniform(start, type).onObjectUpdate(({ object }) => object?.userData?.[key]);

// the one material of everything that stands in a stand, whatever its kind: shape(A, B) its vertex from what plantIn
// packed, swayed by the wind; its wood wrapped in its bark, its leaves cut out of their painted sprig (also in the shadow
// map: the shadow under a pine is dappled), lit through when the sun is behind them, and rounded over the crown as one
// dome (a crown of a thousand cards takes the light as a whole, not card by card); `ao` the light that reaches into the
// crown. Nothing of a kind is written into its code: what a kind is, is a few numbers (numbersOf), so every kind, every
// shape and every level is one shader to the GPU, compiled once.
//   D: { fade, sink }: how its levels hand over (its kind's: assets/kinds.js)
function plantMaterial(tex, D) {
  // Lv: the level it is drawn as ({ lo, hi, last }: the pixels it is drawn between, and whether it is the farthest), or
  // none (the library's, the shadow's: whole). Its level's numbers are uniforms.
  // feed: where a vertex comes from. In the world, the heap ({ ok(B): whether the draw's vertex is one of this plant's
  // mesh, vertex(B): it, unpacked, and its kind's numbers }: createStands); none: a mesh of its own (the library's
  // plant: its attributes, its numbers on the mesh).
  // px: its size on screen told, a node (pixels), where it is not to be reckoned from where the eye stands: the measure's
  // (tools/stick.js), which draws a plant as the game draws it at a size while its own camera frames it. None: reckoned.
  return (Lv = null, feed = null, px = null) => {
    const slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);
    const own = feed ? null : { Hk: ofMesh('hk', 1, 'float'), Ks: ofMesh('ks', 1, 'float'), Wd: ofMesh('wind', new THREE.Vector4(0, 0, 1, 0.3)), Lf: ofMesh('leaf', new THREE.Vector4(0.45, 0.55, 0, 0)), Tw: ofMesh('twig', 0, 'float'), Tn: ofMesh('tint', new THREE.Vector3(1, 1, 1)) };
    // (the library's crowd plant: what the rule reads packed into seven buffers, a stage has eight: crowdSample)
    const crowdOwn = !feed && Lv?.crowd ? (B) => {
      const ut = attribute('uvTip', 'vec4'), pa = attribute('partAo', 'vec4'), tg = attribute('tipGo', 'vec4');
      return { position: positionGeometry, normal: attribute('normal', 'vec3'), uv: ut.xy, part: pa.x, ao: pa.y, cn: attribute('cn', 'vec3'), root: attribute('root', 'vec3'), hand: vec2(0), twig: pa.z, shade: seedOf(B), ...own,
        crowd: { tipUv: ut.zw, body: pa.w, tip: tg.xyz, to: tg.xyz, go: tg.w, rule: [0, 1, 2, 3].map((j) => ofMesh(`rule${j}`, new THREE.Vector4(), 'vec4')) } };
    } : null;
    const vertexOf = (B) => (feed ? feed.vertex(B) : crowdOwn ? crowdOwn(B) : { position: positionGeometry, normal: attribute('normal', 'vec3'), uv: attribute('uv', 'vec2'), part: attribute('part', 'float'), ao: attribute('ao', 'float'), cn: attribute('cn', 'vec3'), root: attribute('root', 'vec3'), hand: attribute('hand', 'vec2'), twig: attribute('twig', 'float'), shade: seedOf(B), ...own });
    const LU = Lv && levelOf(Lv, D.fade), LC = Lv?.crowd ? { lo: uniform(Lv.lo), hi: uniform(Number.isFinite(Lv.hi) ? Lv.hi : 1e9) } : null;   // (a crowd's level: its sizes as they are, uniforms: every level one shader)
    // what a pixel needs: where on its texture, and the light, the snow and the air already worked out at its corners
    // (vMul: what its texture's colour is multiplied by; vAdd: what is added: the snow on it, the air before it), so a
    // pixel reads its texture and is done. A crown is many cards deep: its pixels are many more than its corners.
    const vUv = varyingProperty('vec2', 'tUv'), vMul = varyingProperty('vec3', 'tMul'), vAdd = varyingProperty('vec3', 'tAdd');
    const vStill = varyingProperty('float', 'tStill');   // (built over time: how still it is in the wind, src/world/light.js stillness)
    const vPart = varyingProperty('float', 'tPart'), vCut = varyingProperty('vec2', 'tCut');   // vCut: the needles' cut, and how far a card is from edge-on
    const vLay = varyingProperty('vec2', 'tLay');   // (the layers of its leaves' and its wood's textures: its kind's)
    // a far body that wears its crown baked (under `?lod=new`, `?bake=0` for none): where on which baked view it lies (u, v, the view, 1), and where
    // its plant's level lies in the heap (as two numbers under 4096: a whole number however a pixel got it)
    const elemOf = feed?.elem ?? Lv?.bakeElem;   // (where a baked crown's bytes are read from: the heap's elements, or the library's plant's own)
    const vImp = Lv?.crowd && elemOf && LOD.BAKE ? varyingProperty('vec4', 'tImp') : null, vBase = vImp ? varyingProperty('vec2', 'tBase') : null;
    const shape = (A, B) => {
      const clip = offScreen().toVar();
      const drawn = () => {
        // part: 0 its wood, 1 a sprig's card, 2 its crown as one body (its farthest level: assets/kit/tree.js)
        const V = vertexOf(B), part = V.part, body = step(1.5, part);
        const shown = float(1).greaterThan(0).toVar(), grown = float(1).toVar(), sunk = float(1).toVar();
        if (Lv) {
          // its size on screen now (its size, A.w; a stand that says its `size`, that), and from it the one hand-over
          // (src/detail/handover.js): its sprigs part by part, its wood whole, its last level sinking
          let H = handOver(px ?? pxOf(D.ST?.size ? float(D.ST.size) : A.w, A.xy), LU, D.sink);
          if (feed?.streamed) {
            // its finest level comes when a plant is near (its mesh is made then): until it is there the next level
            // stands in for it whole, and from when it came the two hand over by the clock, sprig by sprig, as two
            // levels do by size: the finer one's gone so far out (v), the coarser one's come so far in (u), the same share
            const S = feed.streamed(B), late = float(1).sub(S.grown);
            const u = feed.level === 1 ? S.held.select(max(H.u, late), float(1)) : H.u, v = feed.level === 0 ? max(H.v, late) : H.v;
            H = { u, v, sunk: H.sunk, there: u.greaterThan(0).and(v.lessThan(1)).and(H.sunk.greaterThan(0)), whole: u.greaterThanEqual(0.5).and(v.lessThan(0.5)) };
          }
          if (Lv.crowd) {
            // a crowd's level (`?lod=new`): drawn only between its own sizes on screen, hard (the level beside it draws the same
            // there); its finest from the splay of its sprigs as two levels hand over, its last sinking. Its rule reckons a
            // plant by its own size on screen (a stand that changes level as one: its size, at most)
            const own = px ?? pxOf(A.w, A.xy), at = px ?? pxOf(D.ST?.size ? float(D.ST.size) : A.w, A.xy), pxR = min(own, at);
            const above = Lv.first ? H.u.greaterThan(0) : at.lessThan(LC.hi), below = Lv.last ? H.sunk.greaterThan(0) : at.greaterThanEqual(LC.lo);
            const hand = Lv.first && Lv.splay ? partGrown({ ...H, v: float(0) }, V.root, float(0), V.hand) : float(1);
            const R = crowdRule(pxR, V, V.crowd, hand, Lv.first && Lv.splay ? H.u.greaterThanEqual(0.5) : null);
            const show = above.and(below).and(R.shown);
            If(V.drawn ? show.and(V.drawn) : show, () => {
              if (vImp) {
                // the baked view nearest the eye, in the plant's own frame (crowd.js BAKED: eight round it 30 degrees up, one
                // from above), and the body's point on it: the crown's picture there says whether it covers and how shaded
                const r = V.crowd.rule[3].y, baked = r.greaterThan(0).and(V.crowd.body.greaterThan(0.5)).and(V.crowd.body.lessThan(3.5));
                const d = turnOf(B.x).unturn(normalize(U.uCam.sub(vec3(A.x, A.z, A.y)))), top = d.y.greaterThan(0.866);
                const k = floor(atan(d.z, d.x).div(Math.PI / 4).add(8.5)).mod(8), z = k.mul(Math.PI / 4), se = Math.sin(Math.PI / 6), ce = Math.cos(Math.PI / 6);
                const u = top.select(vec3(1, 0, 0), vec3(sin(z), 0, cos(z).negate())), v = top.select(vec3(0, 0, -1), vec3(cos(z).mul(-se), ce, sin(z).mul(-se)));
                const rel = R.pos.sub(V.root), half = max(r, 1e-3).mul(2);
                vImp.assign(vec4(rel.dot(u).div(half).add(0.5), rel.dot(v).div(half).add(0.5), top.select(float(8), k), baked.select(float(1), float(0))));
                const at = V.crowd.rule[3].z.mul(1024).add(V.crowd.rule[3].w), b = V.base !== undefined ? float(V.base).add(at.mul(2)) : float(0);   // (its bake's first element: after the level's vertices, two elements a vertex; the library's: its own, from 0)
                vBase.assign(vec2(floor(b.div(4096)), b.mod(4096)));
              }
              clip.assign(stand(A, B, { ...V, position: R.pos, root: R.pos, uv: R.uv }, float(1), H.sunk));
            });
            return;
          }
          grown.assign(mix(float(1), partGrown(H, V.root, body, V.hand), step(0.5, part))); sunk.assign(H.sunk);
          shown.assign(H.there.and(part.greaterThan(0.5).or(H.whole)));
        }
        If(V.drawn ? shown.and(V.drawn) : shown, () => { clip.assign(stand(A, B, V, grown, sunk)); });   // (drawn: the draw's corner is one of its mesh's)
      };
      drawn();
      return clip;
    };
    const stand = (A, B, V, grown, sunk) => {
      const part = V.part, ao = V.ao, card = float(1).sub(abs(part.sub(1))), body = step(1.5, part), Hk = V.Hk, sway = V.Wd.x, leans = V.Wd.y, flutters = V.Wd.z, clumps = V.Wd.w, wrap = V.Lf.x, shines = V.Lf.y, Tn = V.Tn;
      const s = A.w.div(V.Ks), { turn } = turnOf(B.x);   // (s: its scale, its size over its kind's at scale 1)
      // (a sprig grown from its foot, the crown's body from its middle; the whole plant sunk)
      const g0 = Lv ? sinkInto(mix(V.root, V.position, grown), sunk) : V.position;
      const lean = vec2(cos(B.z), sin(B.z)).mul(V.shade.sub(0.5).mul(leans.mul(2))), lp = g0.add(vec3(lean.x, 0, lean.y).mul(g0.y)), up = clamp(lp.y.div(Hk), 0, 1);   // each leans its own way
      // the wind: the crown sways, the foot stays (the push grows with height squared), a slow sway of its own (from a
      // breeze up); and its sprigs swing in the wind, each as one from its foot, its tip most (a card's corners share its
      // plane, cn: one phase a card; uv.y: 0 at its foot), quicker and wider the harder it blows. In a calm all of it is
      // still: a sway of millimetres is no motion to the eye, only leaves' edges creeping by parts of a pixel (a shimmer)
      const push = windAt(A.xy), ws = windStrength;
      const kk = push.mul(up.mul(up).mul(sway).mul(s)).add(vec2(sin(U.uTime.mul(0.9).add(B.z)), cos(U.uTime.mul(0.7).add(B.z))).mul(up.mul(up).mul(ws.mul(0.05).add(smoothstep(0, 0.08, ws).mul(0.008))).mul(s)));
      const cardN = V.cn, flutter = sin(U.uTime.mul(ws.mul(5).add(1.6)).add(cardN.dot(vec3(12.9, 78.2, 37.7))).add(B.z)).mul(ws.mul(0.14)).mul(card).mul(V.uv.y.min(1)).mul(flutters);
      const w = vec3(A.x, A.z, A.y).add(turn(lp.mul(s))).add(vec3(kk.x.add(windDir.x.mul(flutter)), flutter.mul(0.4), kk.y.add(windDir.y.mul(flutter)))).toVar();
      vUv.assign(V.uv); vPart.assign(part); vLay.assign(vec2(V.twig.greaterThan(0.5).select(V.Tw, V.Lf.z), V.Lf.w));   // (a card of its finest level wears the painting of one twig)
      vStill.assign(stillness(up.mul(up).mul(sway).mul(s).add(card.mul(V.uv.y.min(1)).mul(flutters).mul(0.8)), w));   // (its crown's sway, and a sprig's own swing)
      const toEye = U.uCam.sub(w), far = length(toEye), Ve = toEye.div(max(far, 1e-3));
      // the needles' outline: far off a mip's needles are fainter, so the cut lowers with them and the crown stays full;
      // a card seen edge-on is a flat sliver, not a brush: it fades as it turns away
      // … and foliage right at the eye is let go (walking through a low crown, no card fills the picture)
      vCut.assign(vec2(Lv?.crowd && COVER.on ? float(COVER.CUT) : mix(0.45, 0.16, smoothstep(15, 220, far)),   // (a crowd's level where foliage keeps its coverage at every mip, src/materials/bake.js: one cut at every distance)
         max(smoothstep(0.06, 0.42, abs(normalize(turn(cardN)).dot(Ve))), body).mul(smoothstep(0.35, 1.3, far))));
      vMul.assign(vec3(0)); vAdd.assign(vec3(0));
      If(unlit().not(), () => {   // (drawn into the shadow map, only its depth and its cut-out count)
        // its light: the sky's and the sun's on the dome its crown makes (a crown of a thousand cards takes the light as a
        // whole, not card by card), through its needles when the sun is behind them, less of both deep in the crown
        // (ao); one tap of the shadow map at each corner; its snow; the air before it
        const leaf = part.greaterThan(0.5), n0 = normalize(turn(V.normal)), n = n0.dot(Ve).lessThan(0).select(n0.negate(), n0);
        const ndl = leaf.select(n.dot(U.uSunDir).add(wrap).div(wrap.add(1)), n.dot(U.uSunDir)).max(0);   // needles take the light round their edge
        const through = leaf.select(pow(max(Ve.negate().dot(U.uSunDir), 0), 3).mul(shines), float(0));   // the sun behind a brush of needles shines through it
        const L = skyLight(n).mul(ao.mul(ao).mul(0.75).add(ao.mul(0.25))).add(U.uSun.mul(cloudAtVertex(w)).mul(ndl.add(through)).mul(ao.mul(0.6).add(0.4)));
        const W = weatherOn(n, snowLiftAtVertex(w, clumps)), air = airOf(w);   // what the weather does to it (wet, its snow in clumps), and the air before it
        // each plant its own green: lighter or darker, and warmer (yellower) or cooler (bluer)
        const tint = leaf.select(mix(vec3(1.07, 1.0, 0.78), vec3(0.86, 0.98, 1.1), B.z.mul(1.1631).fract()).mul(V.shade.mul(0.3).add(0.84)).mul(Tn), vec3(1));
        vMul.assign(L.mul(tint).mul(W.keep).mul(air.k));
        vAdd.assign(W.add.mul(L).mul(air.k).add(air.col.mul(float(1).sub(air.k))));
      });
      return clipOf(w);
    };
    const frag = Fn(() => {
      // drawn with alpha to coverage where its target is multisampled (a library's thumbnail; the game's own picture is
      // not: its edges are smoothed as it is built over time, src/core/temporal.js): a needle's outline soft in a pixel, not a screen-door
      // dither of whole pixels (which a lowered pixel ratio blows up into dots). Two levels are never both half there
      // (two halves of coverage are the same samples: a crown half see-through, in a grid): their hand-over is their
      // sprigs' sizes, in the vertex stage. A crown as one body (part 2) is whole, no sprig cut out of it
      const leaf = vPart.greaterThan(0.5), T = vec4(1).toVar(), alpha = float(1).toVar(), shadow = unlit();
      If(leaf, () => {
        T.assign(tex.a(floor(vLay.x.add(0.5)), vUv));   // (its kind's leaves: the layer a whole number, however a pixel got it)
        const whole = step(1.5, vPart);
        if (vImp) If(vImp.w.greaterThan(0.5), () => {
          // a far body wearing its crown baked: as much of it as the crown covers there, as shaded as the crown is there
          const R = CROWD.BAKE, tx = clamp(floor(vImp.x.mul(R)), 0, R - 1), ty = clamp(float(R - 1).sub(floor(vImp.y.mul(R))), 0, R - 1);
          const t = uint(floor(vImp.z.add(0.5)).mul(R * R).add(ty.mul(R)).add(tx)), base = uint(floor(vBase.x.add(0.5)).mul(4096).add(floor(vBase.y.add(0.5))));
          const E = elemOf(base.add(t.shiftRight(uint(3)))), w = t.bitAnd(uint(7)).shiftRight(uint(1)), word = w.equal(uint(0)).select(E.x, w.equal(uint(1)).select(E.y, w.equal(uint(2)).select(E.z, E.w)));
          const bits16 = word.shiftRight(t.bitAnd(uint(1)).mul(uint(16))), cover = float(bits16.bitAnd(uint(255))).div(255), shade = float(bits16.shiftRight(uint(8)).bitAnd(uint(255))).div(255);
          // a baked texel is a clump of leaves there or a gap, as often as the crown covers it there (its own number, the
          // same every frame: the crown's gaps stay where they are), so the far crown is as see-through as the near one
          If(cover.lessThanEqual(fract(sin(float(t).mul(12.9898).add(78.233)).mul(43758.5453))), () => { Discard(); });
          T.assign(vec4(T.rgb.mul(pow(clamp(shade.mul(2), 0.3, 2), 1.3).mul(0.93)), 1));   // (lighter or darker than the crown on the whole; measured beside main's far levels from 90 m and by the tent)
        });
        // (the shadow map takes no coverage: cut)
        If(shadow, () => { If(T.a.lessThan(vCut.x).and(whole.lessThan(0.5)), () => { Discard(); }); })
          .Else(() => { alpha.assign(max(smoothstep(vCut.x.sub(0.08), vCut.x.add(0.08), T.a), whole).mul(vCut.y)); If(alpha.lessThan(0.04), () => { Discard(); }); });
      }).ElseIf(shadow.not(), () => { const W = tex.a(floor(vLay.y.add(0.5)), vUv); T.assign(vec4(W.rgb.mul(mix(0.74, 1, W.a)), 1)); });   // its bark, darker in its fissures (0.74 squared: 0.55)
      const out = vec4(0).toVar();
      If(shadow.not(), () => { out.assign(vec4(toScreen(T.rgb.mul(T.rgb).mul(vMul).add(vAdd)).rgb, mix(alpha, vStill, U.uMarks))); });   // (drawn for the picture built over time there is no multisampling to take the coverage: the fourth number says how still it is; through the lens it is the coverage, as ever)
      return out;
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide; m.alphaToCoverage = true;
    return { m, shape, slot };
  };
}

/** The assets this engine places, as the stands they grow in: every kind of one stand of one biome is one group, packed
    and drawn together (createStands). Kinds can only share a packing if their levels are the same (the same pixels, the
    same patches: their kind's, assets/kinds.js, and the kit's), so a group is a stand's kinds of one such make; a kind
    made otherwise is a group of its own, in the same cells. Each kind: its slice of the stand's cells, its shapes, where
    its meshes lie among the group's (offset), the sizes it can have. */
export function groupsOf(rows) {
  const by = new Map();
  for (const row of rows) {
    const a = row.asset, P = a.placement, biome = recipe(P.biome); if (!biome) continue;
    const ST = standOf(a, biome), levels = row.detail.levels.filter((l) => !l.impostor), name = P.stand ?? 'trees';
    const key = [P.biome, name, ST.cell, ST.density, ST.clumps, ST.patches, ST.seed, ST.size, row.detail.fade, row.detail.sink, ...levels.map((l) => `${l.P}:${l.lo}`)].join('|');
    if (!by.has(key)) by.set(key, { key, name: `${biome.name ?? P.biome}: ${name}`, biome, ST, fade: row.detail.fade, sink: row.detail.sink, n: levels.length, kinds: [] });
    // the sizes a plant of it can have: its youngest and its oldest (by its growth), or its scale's
    const H = a.size.height, GR = a.growth, wide = sizeOf(a) / H;
    const lo = (GR ? GR.stages[0].hFrom * P.scale[0] : H * P.scale[0]) * wide, hi = (GR ? Math.max(...a.heights) * (GR.stages.at(-1).hTo / GR.stages.at(-1).h) * P.scale[1] : H * P.scale[1]) * wide;
    by.get(key).kinds.push({ row, asset: a, levels, shapes: a.shapeCount ?? 1, wide, spread: Math.max(most(a.size.length), most(a.size.width ?? 0)) / (2 * H), age: ST.age, lo, hi, round: (a.size.length / 2) * P.scale[1],
      slice: kindsOf(P.biome, P.stand).find((k) => k.asset.uid === a.uid)?.slice ?? [0, 1] });   // its share of its stand's cells: every kind that grows there, in the order of their uids
  }
  return [...by.values()].map((G) => offsets({ ...G, kinds: G.kinds.sort((x, y) => (x.asset.uid < y.asset.uid ? -1 : 1)) }));
}
const offsets = (G) => { let at = 0; return { ...G, kinds: G.kinds.map((Kd) => { const k = { ...Kd, offset: at }; at += Kd.shapes; return k; }), meshes: at }; };

/** Everything this engine places: for every stand a drawer of its own kinds (drawer.js: a heap of their shapes at their
    levels) and a tier a level of detail, each where a plant of it is the size on screen its kind asks, a draw a
    shape (its corners the draw's own list); and, for the kinds that cast, a stand-in drawn only into the shadow map (layer 1):
    every tree round the camera by its shade, the shade of a crown at a fraction of its finest cards' cost. What a
    stand costs to start and to draw is its levels', not its kinds': a new kind adds its meshes' bytes. */
export function createStands(scene, tex, ground, rows, gpu = false, renderer = null) {
  const tiers = [], solids = [], drawers = [];
  if (!gpu) return tiers;   // (without WebGPU nothing of the heap can be drawn: no plants there)
  const Z = placedBy('trees'), famOf = (uid) => Z.families.find((F) => F.F.asset === uid);
  for (const G of groupsOf(rows)) {
    const lost = G.kinds.filter((Kd) => !famOf(Kd.asset.uid)); if (lost.length) { console.warn(`plants: no family of the zoo brings the shapes of ${lost.map((Kd) => `'${Kd.asset.name}'`).join(', ')} (assets/zoo)`); continue; }
    const { ST } = G, n = G.n, make = plantMaterial(tex, G);
    const sLo = ST.size ?? Math.min(...G.kinds.map((k) => k.lo)), sHi = ST.size ?? Math.max(...G.kinds.map((k) => k.hi)), round = Math.max(...G.kinds.map((k) => k.round));
    // of the stand's kinds those that cast and have a shade; their shades lie in the heap as one more level, after the stand's own
    const casting = G.kinds.filter((Kd) => Kd.asset.detail.shadow && Kd.row.detail.casts), SHL = casting.length ? n : -1;
    const SH = casting.length ? { far: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.far)), wide: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.wide ?? 2.4)), reach: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.reach ?? 20)) } : { far: 1, wide: 1, reach: 0 };
    // the stand's levels as the drawer takes them: where each ends on screen (its kinds': assets/kinds.js) and the room
    // a shape of any of its kinds needs there (their files say: `most`, its vertices and triangles)
    const roomOf = (get) => ({ verts: Math.max(1, ...G.kinds.map((Kd) => get(Kd)?.[0] ?? 0)), tris: Math.max(1, ...G.kinds.map((Kd) => get(Kd)?.[1] ?? 0)) });
    // (and each shape's own, by its kind's file: a heap place as large as its own, not the largest kind's)
    const shapeKd = []; for (const Kd of G.kinds) for (let v = 0; v < Kd.shapes; v++) shapeKd[Kd.offset + v] = Kd;
    const roomsOf = (get) => shapeKd.map((Kd) => ({ verts: Math.max(1, get(Kd)?.[0] ?? 0), tris: Math.max(1, get(Kd)?.[1] ?? 0) }));
    // (FINE: its first level is a finest that comes only for the plants that are near, into a few slots: assets/kit/tree.js `fine`)
    const FINE = G.kinds.every((Kd) => Kd.levels[0].fine);
    // (`?lod=new`: a level of the crowd kit's is as large as its first share of the shape: its kind's file says nothing of it, assets/kit/tree.js crowdRooms)
    const CROWDED = G.kinds[0].levels.map((l, i) => LOD.on && crowdLevel(G.kinds[0].asset, i)), crowdRoom = (v, i) => { const Kd = shapeKd[v]; return Kd.asset.crowdRooms()[v - Kd.offset][i]; };
    const roomAt = (i) => (CROWDED[i] ? { room: { verts: Math.max(1, ...shapeKd.map((_, v) => crowdRoom(v, i)[0])), tris: Math.max(1, ...shapeKd.map((_, v) => crowdRoom(v, i)[1])) }, rooms: shapeKd.map((_, v) => ({ verts: crowdRoom(v, i)[0], tris: crowdRoom(v, i)[1] })) } : { room: roomOf((Kd) => Kd.levels[i].most), rooms: roomsOf((Kd) => Kd.levels[i].most) });
    const LEVELS = [...G.kinds[0].levels.map((l, i) => ({ px: l.lo, ...roomAt(i), ...(FINE && !i ? { slots: SLOTS } : {}) })), ...(SHL >= 0 ? [{ px: 1e-3, room: roomOf((Kd) => Kd.asset.detail.shadow?.most), rooms: roomsOf((Kd) => Kd.asset.detail.shadow?.most) }] : [])];
    // what each of the stand's shapes is to the material (numbersOf), four rows of four a shape, in the drawer's one
    // table of a kind's numbers (numOf): [how tall, its tint], [its wind], [its leaves], [its twig's painting, its size at
    // scale 1 (its packed size over this is its scale)]; and the
    // zoo's number of each (its family's first, and of its shapes one)
    const numbers = new Float32Array(G.meshes * 16), KINDS = [];
    for (const Kd of G.kinds) for (let v = 0; v < Kd.shapes; v++) { const N = numbersOf(tex, Kd.row, v); numbers.set([N.hk, ...N.tint, ...N.wind, ...N.leaf, N.twig, sizeAtOne(Kd.asset, v, !!(Kd.asset.growth && Kd.age)), 0, 0], (Kd.offset + v) * 16); KINDS.push(Z.first + famOf(Kd.asset.uid).first + v); }
    G.KS = Float32Array.from({ length: G.meshes }, (_, j) => numbers[j * 16 + 13]);   // (each shape's size at scale 1, as the GPU reads it: what its bodies are scaled by)
    // a vertex of the draw as the material takes it: of the plant's own mesh at heap level `lv` (which it is: B.y; its
    // shade: its seed, B.w), unpacked, with its kind's numbers
    const feedOf = (lv, at) => {   // (at: where the draw's vertex lies, the drawer's: drawer.js atOf)
      const level = uniform(lv, 'uint');
      return {
        vertex: (B) => {
          const kind = uint(B.y.add(0.5)), R = heapRow(D.H, kind, level).toVar(), P = at(R), e = R.y.add(P.vertex.mul(uint(2))), r0 = D.numOf(kind, 0).toVar(), r3 = D.numOf(kind, 3).toVar();
          const e0 = D.H.elems.element(e).toVar(), e1 = D.H.elems.element(e.add(uint(1))).toVar();
          // (a crowd's level: its shape's numbers in the two elements before its vertices)
          const crowd = CROWDED[lv] ? { crowd: crowdOfElems(e0, e1, ruleOf(D.H.elems.element(R.y).toVar(), D.H.elems.element(R.y.add(uint(1))).toVar()).map((r) => r.toVar())) } : {};
          return { ...plantOf(e0, e1), Hk: r0.x, Tn: r0.yzw, Wd: D.numOf(kind, 1).toVar(), Lf: D.numOf(kind, 2).toVar(), Tw: r3.x, Ks: r3.y, shade: seedOf(B), drawn: P.drawn, base: R.y, ...crowd };
        },
        level: lv,
        elem: (i) => D.H.elems.element(i),   // (the heap's element i: a baked crown's bytes, read where a pixel needs them)
        // (the stand's finest level, of this plant's shape: whether it is there, and how far it has grown in since it came)
        streamed: FINE && lv < 2 ? (B) => { const R0 = heapRow(D.H, uint(B.y.add(0.5)), uint(0)).toVar(); return { held: R0.z.greaterThan(uint(0)), grown: smoothstep(0, GROW, sinceCame(R0, U.uTime)) }; } : null,
      };
    };
    const D = createDrawer(scene, renderer, tex, {
      name: `plants, ${G.name}`, LEVELS, SHADE: { ...SH, shrink: 1 }, SMOOTH: uniform(1),
      make: { per: 2, numbers: { rows: 4, of: (k) => numbers.subarray(k * 16, k * 16 + 16) }, material: (src, i, shadow, at) => { const { m, shape, slot } = make(shadow ? null : { lo: G.kinds[0].levels[i].lo, hi: G.kinds[0].levels[i].hi, last: i === n - 1, ...(CROWDED[i] ? { crowd: true, first: i === CROWDED.indexOf(true), splay: FINE } : {}) }, feedOf(i, at)); m.vertexNode = Fn(() => shape(src.readAt(0, slot), src.readAt(1, slot)))(); return m; } },
      // (what the browser keeps of it is good while its recipes and their rooms are what they were: registry.json's versions)
      zoo: { kinds: KINDS, ALL: G.meshes, fingerprint: () => `plants 2${LOD.on ? ` crowd ${LOD.CARD}:${LOD.KMAX}:${LOD.SPLIT}:${LOD.BAKE}:${LOD.FAR}` : ''}|${G.kinds.map((Kd) => `${Kd.asset.uid}@${versionOf(Kd.asset.uid)}`).join()}|${LEVELS.map((l) => `${l.room.verts}:${l.room.tris}`).join()}` },
    });
    D.crowded = CROWDED; drawers.push(D);   // (which of its levels are the crowd kit's: their counts hold the shape's numbers too)
    // what of it is solid (src/world/bodies.js): every plant of the stand round the walker, whatever its kind and size
    // (standBodies); a stand none of whose plants can stop a walker (what lies lower than his shin, leaves lower than
    // his knee) packs none
    if (G.kinds.some((Kd) => Array.from({ length: Kd.shapes }, (_, v) => bodyOf(KINDS[Kd.offset + v])).some((B) => B.shapes.some((S) => topOf(S) * Kd.asset.placement.scale[1] - FOOT > (S.pass ? Math.max(0.55, S.from ?? 0) : 0.3))))) solids.push(standBodies(G, KINDS, ground, renderer));
    // a tier: its cells worked out once for every kind in it, each plant that is of its level packed into its shape's
    // draw. g: the group it packs (the stand's, or of its kinds those that cast)
    const tier = (i, g, shadow = false) => {
      const P = shadow ? 4 : G.kinds[0].levels[i].P;
      // reach: a crown's reach, and how far the camera may move before the packing is made again (the cells are worked
      // out again every sixteenth of a patch)
      const seen = shadow ? null : { r: uniform(round + (ST.cell * P) / 16 + 2), high: sHi };
      const t = D.tier(i, {
        cell: ST.cell, P, cap: FINE && !i && !shadow ? 64 : Math.ceil(Math.min(240000, MAXP * P * P * 0.4) / Math.min(...g.kinds.map((k) => k.shapes))), sizes: [sLo, sHi], fade: G.fade, shadow,
        casts: !shadow && i === 0 && g.kinds.some((Kd) => Kd.row.detail.casts && !Kd.asset.detail.shadow),   // without a stand-in the near ones cast, as drawn (src/world/shadow.js)
        place: (c, { band }, found) => plantIn(c, g, band, shadow, seen, found), thing: `plants:${G.name}`,   // (a plant's own state: its stand and its cell, src/world/things.js)
        extra: shadow ? { cull: SH.reach, fixed: SH.far * SH.wide } : {},   // (the stand-in in small patches: those whose shade cannot reach the view are dropped)
      });
      t.viewKeyed = !shadow; t.asset = G.name; t.drawer = D; tiers.push(t);
      return t;
    };
    for (let i = 0; i < n; i++) tier(i, G);
    if (SHL >= 0) {
      // the stand-in: every casting tree round the camera, its shade drawn for the light only
      const t = tier(SHL, { ...G, kinds: casting }, true);
      // … and, where the stand has a finest level, its plants are those whose finest meshes are asked for as they come
      // near: the stand-in's packing read back each time it is packed anew
      let near = [];
      if (FINE) {
        let busy = false, was = '';
        solids.push((renderer) => {
          if (busy || t.key === was) return;
          busy = true; was = t.key;
          t.read(renderer).then((buckets) => {
            const seen = [];
            for (const { count, data: [A, B] } of buckets) for (let i = 0; i < count; i++) { const k = i * 4; seen.push({ x: A[k], z: A[k + 1], kind: Math.round(B[k + 1]), size: G.ST.size ?? A[k + 3] }); }
            near = seen;
          }).catch(() => {}).finally(() => (busy = false));
        });
      }
      if (FINE) {
        // when the camera has moved: the finest meshes of the shapes that stand near enough for them, asked of the drawer
        solids.push(() => {
          const N = D.scan(near.length); if (!N) return;
          const cam = U.uCam.value, dy = U.uDy.value;
          for (const p of near) N.wants(p.kind, p.size, Math.hypot(p.x - cam.x, p.z - cam.z, dy), 0);
          N.done();
        });
      }
    }
  }
  // each frame: the stands' meshes until they are in (read back from the browser, or made by the workers); what is solid
  tiers.solid = (renderer) => { for (const D of drawers) D.start(); for (const f of solids) f(renderer); };
  // for looking at it (window.__plants): how many plants each tier packs now, what the heaps hold
  window.__plants = { drawers, tiers, async counts() { const out = []; for (const t of tiers) { const B = await t.read(renderer); out.push(`${t.asset} ${t.level}: ${B.reduce((x, b) => x + b.count, 0)}`); } return { tiers: out, held: drawers.map((D) => D.H.held().join(',')), coarseMs: drawers.map((D) => D.stats.coarseMs), kept: drawers.map((D) => D.stats.kept) }; },
    // … and what each stand asked of the GPU in the last frame, a row a stand: of each of its tiers the plants drawn (a
    // draw's count is written by the packing, on the GPU: its arguments are read back; a plant in hand-over is in both
    // its levels' tiers) and the vertices and corners that is, each draw's count times its mesh's; summed for the picture
    // (eye) and for the shadow map (light: the stand-in, and what casts as drawn; its layer, src/world/shadow.js)
    submitted: () => Promise.all(drawers.map(async (D) => {
      const mine = tiers.filter((t) => t.drawer === D), none = () => ({ plants: 0, verts: 0, corners: 0 }), S = { stand: mine[0]?.asset, eye: none(), light: none(), tiers: [] };
      for (const t of mine) {
        const a = new Uint32Array(await renderer.getArrayBufferAsync(t.args)), T = { level: t.level, eye: t.mesh.layers.isEnabled(0), light: t.mesh.layers.isEnabled(1), ...none() };
        t.meshes.forEach((m, k) => { const n = m.visible ? a[k * 5 + 1] : 0, kind = t.kindOf(k); T.plants += n; T.corners += n * a[k * 5]; if (kind >= 0) T.verts += n * Math.max(0, D.H.count(kind, t.level) - (D.crowded?.[t.level] ? 1 : 0)); });   // (a crowd level's count holds its shape's numbers too, one vertex)
        for (const w of ['eye', 'light']) if (T[w]) for (const k of Object.keys(S[w])) S[w][k] += T[k];
        S.tiers.push(T);
      }
      return S;
    })) };
  return tiers;
}

// What of a stand is solid (intent 0027): its plants round the walker as bodies of the one collision engine. A packing
// of its own, round where bodies are asked for (the walker, src/world/bodies.js wanted; else the camera) whatever the
// lens looks at, of every kind of the stand and every size, by the stand's own reckoning (plantIn: what is drawn is what
// stops), drawn by nothing; read back to the CPU each time it is packed anew (two metres on), each plant then its kind's
// body (its family's colliders: assets/kit/plant.js, by its kind's rule: a tree its trunk, a shrub its leaves), kept by
// the cells it stands in. Its packing is compiled aside (it holds up neither the start nor a frame) and packs from when it
// is ready. Without WebGPU nothing of a stand is drawn, and nothing of it is solid.
const REACH = 24;   // metres round the walker within which a stand's plants are bodies
const NOWHERE = { add() {} };   // (the packing's mesh is in no scene: it draws nothing)
function standBodies(G, KINDS, ground, renderer) {
  const { ST } = G, P = Math.max(1, Math.round(12 / ST.cell)), n = Math.ceil((2 * REACH) / (ST.cell * P)) + 2, at = uniform(new THREE.Vector2()), band = { near: uniform(-1), far: uniform(REACH), at };
  const live = (c) => {
    const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar();
    plantIn(c, G, band, true, null, (which, size, dist, fill) => { fill(A, B); alive.assign(1); });
    return { alive: alive.greaterThan(0.5), data: [A, B] };
  };
  const g = new THREE.BufferGeometry(); g.setIndex([0, 0, 0]); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const T = new Tier(NOWHERE, g, () => new THREE.NodeMaterial(), { cell: ST.cell, P, near: 0, far: REACH, live, gpu: true, cap: Math.min(65536, n * n * P * P), slots: 2, cull: false, fixed: REACH });
  T.step = 2;
  const grid = bodyGrid(Math.max(4, ST.cell)), tag = G.key.slice(0, 48);
  addBodies(grid.near);
  let busy = false, was = '', warned = false, ready = false;
  renderer.compileComputeAsync(T.passes).catch(() => {}).finally(() => (ready = true));
  return (renderer) => {
    if (!ready) return;
    const cam = U.uCam.value, walker = performance.now() - wanted.at < 1000, x = walker ? wanted.x : cam.x, z = walker ? wanted.z : cam.z, v = (u) => u.value.toArray?.().join(',') ?? u.value;
    at.value.set(x, z); T.select(x, z, 0, 1, 0);   // (round a point on the ground, whatever the camera's height)
    T.run(renderer, `${ground.version}|${v(U.uSand)}|${v(U.uStage)}|${waysVersion()}`, x, 0, z);
    if (busy || !T.key || T.key === was) return;
    busy = true; was = T.key;
    T.read(renderer).then(([{ count, data: [A, B] }]) => {
      grid.clear();
      for (let i = 0; i < count; i++) {
        const k = i * 4, j = Math.round(B[k + 1]), kind = KINDS[j], body = bodyOf(kind), s = A[k + 3] / G.KS[j];   // (s: its scale)
        if (body.shapes.some((S) => !S.pass || !S.from || topOf(S) * s - FOOT >= S.from)) grid.put({ id: `${tag}:${Math.round(A[k] * 8)}:${Math.round(A[k + 1] * 8)}`, thing: idOf(`plants:${G.name}`, Math.floor(A[k] / G.ST.cell), Math.floor(A[k + 1] / G.ST.cell)), x: A[k], z: A[k + 1], y: A[k + 2], up: -FOOT, yaw: B[k], s, kind, body });   // (thing: its stand and the cell it stands in)
      }
    }).catch((e) => { was = ''; if (!warned) { warned = true; console.warn(`plants: what stands round the walker could not be read back (${G.name}): it is not solid`, e); } }).finally(() => (busy = false));
  };
}

/** One plant on its own, in the stands' material (its bark, its leaves, its wind), for the asset library's stage and
    list: level `level`, its foot at (x, y, z), scale s, of its shapes the one asked. px: its size on screen told, a
    node (pixels): it is then drawn as the game draws that level at that size, its hand-over and its sinking with it
    (the measure's: tools/stick.js); none: the whole of its level. */
export function treeSample(tex, row, level = 0, x = 0, y = 0, z = 0, s = 1, form = 0, px = null) {
  if (LOD.on && row.asset.crowdRooms) return crowdSample(tex, row, x, y, z, s, form, px);
  const n = row.detail.levels.length, L = row.detail.levels[Math.min(level, n - 1)], g = geometryOf(row.asset, L, form);
  const { m, shape } = plantMaterial(tex, row.detail)(px && { lo: L.lo, hi: L.hi, last: L.i === n - 1 }, null, px);   // (a mesh of its own, not the heap's: the library's)
  m.vertexNode = Fn(() => shape(vec4(x, z, y, s * sizeAtOne(row.asset, form)), vec4(0.4, 0, 1.3, Math.PI)))();   // turned a little, its shade the middle one, the whole of its level
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.enable(1);
  return wear(mesh, tex, row, form);
}

/** `?lod=new`: the same plant as the crowd kit draws it, every size on screen from one mesh (its whole crowd, the far
    bodies and the post with it), the one rule moving it by its size on screen as the camera comes and goes; its last
    sizes sinking as its farthest level does. Built on the page (a tenth of a second and more for a tree). */
function crowdSample(tex, row, x, y, z, s, form, px) {
  const a = row.asset, S = crowdOf(a, form), M = crowdLevelOf(S, 0, Infinity), g = new THREE.BufferGeometry();
  const four = (f) => { const a = new Float32Array(M.count * 4); for (let v = 0; v < M.count; v++) a.set(f(v), v * 4); return new THREE.BufferAttribute(a, 4); };
  for (const [k, w] of [['position', 3], ['normal', 3], ['cn', 3], ['root', 3]]) g.setAttribute(k, new THREE.BufferAttribute(M[k], w));
  g.setAttribute('uvTip', four((v) => [M.uv[v * 2], M.uv[v * 2 + 1], M.tipUv[v * 2], M.tipUv[v * 2 + 1]]));
  g.setAttribute('partAo', four((v) => [M.part[v], M.ao[v], M.twig[v], M.body[v]]));
  g.setAttribute('tipGo', four((v) => { const T = M.body[v] ? M.to : M.tip; return [T[v * 3], T[v * 3 + 1], T[v * 3 + 2], M.go[v]]; }));
  g.setIndex(new THREE.BufferAttribute(M.index, 1));
  const B = bandsOf(a), lo = B.at(-1)[0];
  // (its crown baked, as the world's far bodies wear it: its bytes in a buffer of its own, read as the heap's elements)
  const bake = M.bake ? (() => { const n = Math.ceil(M.bake.bytes.length / 16), u = new Uint32Array(n * 4); new Uint8Array(u.buffer).set(M.bake.bytes); const node = storage(new THREE.StorageBufferAttribute(u, 4), 'uvec4', n).toReadOnly(); return (i) => node.element(i); })() : null;
  const { m, shape } = plantMaterial(tex, row.detail)({ lo, hi: Infinity, last: true, crowd: true, first: true, splay: false, bakeElem: bake }, null, px);
  m.vertexNode = Fn(() => shape(vec4(x, z, y, s * sizeAtOne(a, form)), vec4(0.4, 0, 1.3, Math.PI)))();
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.enable(1);
  for (let j = 0; j < 4; j++) mesh.userData[`rule${j}`] = new THREE.Vector4(...M.rule.subarray(j * 4, j * 4 + 4));
  return wear(mesh, tex, row, form);
}

// a tree grown again from another seed (the library's Random): the last few kept, each holding a few of its meshes
const REGROWN = new Map();
const regrown = (a0, seed) => { const k = `${a0.uid}:${seed}`; let a = REGROWN.get(k); if (!a) { if (REGROWN.size >= 4) REGROWN.delete(REGROWN.keys().next().value); REGROWN.set(k, (a = a0.regrow(seed))); } return a; };
/** A scatter engine (src/scatter/index.js finds it): what an asset's placement.engine 'trees' names. */
export const engine = {
  id: 'trees',
  row: (a) => ({ ...scatterRow(a), cell: standOf(a).cell }),   // its cells are its stand's (the biome's), over the common row
  createAll: createStands,   // all of its assets at once: they share their stands' tiers
  // the library: a tree of seventy for the list; on the stage one at an age (its growth: assets/kit/tree.js), or every
  // stage of its growth in a row, youngest to oldest; from another seed, the same kind grown again
  thumb(tex, row) {
    const a = row.asset, G = a.growth?.at(70), h = G ? G.height : a.size.height;
    return { things: [treeSample(tex, row, 0, 0, 0, 0, G?.s ?? 1, G?.shape ?? 0)], eye: [h * 1.1, h * 0.7, h * 1.5], look: [0, h * 0.5, 0] };
  },
  stage(tex, row0, { x, z, heightAt, level = 0, seed = null, age = 70, all = false }) {
    const a0 = row0.asset, a = seed != null && seed !== a0.placement.seed && a0.regrow ? regrown(a0, seed) : a0, row = a === a0 ? row0 : scatterRow(a), G = a.growth;
    const one = (X, Z, t) => treeSample(tex, row, level, X, heightAt(X, Z) - 0.1, Z, t?.s ?? 1, t?.shape ?? 0);
    if (!G || !all) return one(x, z, G ? G.at(age) : null);
    const g = new THREE.Group(), w = G.years.map((y) => G.height(y) * 0.55); let u = -w.reduce((s, v) => s + v, 0);
    G.years.forEach((y, i) => { u += w[i]; g.add(one(x + u, z, G.at(y))); u += w[i]; });
    return g;
  },
  frame(a, { age = 70, all = false } = {}) {
    const G = a.growth, h = !G ? a.size.height : all ? G.height(G.years.at(-1)) : G.at(age).height;
    return { height: h, dist: G && all ? G.years.reduce((t, y) => t + G.height(y) * 1.1, 0) * 1.35 : Math.max(5, h * 2.3), pitch: 0.32, span: h };
  },
};

// `?lod=new`: the size each stand that changes level as one measures its plants by (its biome's `size`: the shrubs'
// 3.5 m), for every plant asset this engine places, told to the recipes' workers with the flag. A crowd level of such a
// plant is built for the largest it can be on screen within its band, its own size (assets/kit/plant.js crowdAt), not
// for the stand's.
if (LOD.on) LOD.STANDS = Object.fromEntries(recipes('asset').filter((a) => a.placement?.engine === 'trees' && a.placement.biome).flatMap((a) => { try { const z = standOf(a).size; return z ? [[a.uid, z]] : []; } catch { return []; } }));
