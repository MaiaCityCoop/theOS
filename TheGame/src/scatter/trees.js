// What stands in a stand: every asset whose placement names this engine (a tree, a bush, a fern, a fallen branch),
// scattered where its biome lies (placement.biome), in its biome's stand (placement.stand: `trees` unless it says), one
// plant at most in a cell. A tier per level of detail, each drawn only in the band of distances where a plant of it is
// the size on screen its kind asks (assets/kinds.js), packed by a compute pass, so only the plants that stand are
// drawn (tier.js). Every level is a first share of one build of the plant by the crowd kit (assets/kit/crowd.js, intents
// 0033 and 0038), and the one rule moves each vertex by its size on screen, smoothly: a crowd's parts go one by one,
// each at its true size, the wood thins, its leaves' chunks grow in as crossed planes where their sprigs were (the
// clumps). Its levels are only where its parts lie in the heap: two levels at the size where they meet draw the same.
// Smaller still it is its impostor (src/detail/impostor.js): one quad, baked on the GPU from the level the measure picks
// at its pictures' size.
//
// A stand is one thing to the engine, however many kinds grow in it (groupsOf), and it is drawn by the one drawer
// (drawer.js), as the rocks are:
//   - every shape of every kind at every level lies in one heap on the GPU (heap.js), made in the recipes' workers by
//     the kinds' families (assets/zoo/*.js: a plant asset's shapes; assets/kit/plant.js lays them out as quads) and
//     kept in the browser: no mesh of a plant is on the page, and a start builds none;
//   - its cells are worked out once a level for all its kinds (plantIn): one packing, each plant dropped into its
//     shape's draw, or its far end's (the impostors', one draw for all), or both while it hands over;
//   - all of it is drawn by one material (plantMaterial), the drawer's second make of vertex: what a kind is (its
//     bark, its leaves, how it takes the wind and the light) is a few numbers a kind (a row: numbersOf), so every
//     kind, shape and level is one shader. Its light is worked out at its corners, a pixel reads one texture: a crown
//     is many cards deep. What is baked (a clump's planes, the impostor) is lit pixel by pixel, by the same light;
//   - its far ends are baked on the GPU as its finest level comes (farOf): each shape's impostor and its clumps, a
//     layer each of its stand's two atlases.
// So a new kind costs its meshes' bytes, a draw a shape and level, and a few lines of its stand's packing: no tier,
// no shader of its own. Until 2026-11-14 every shape of every kind was a mesh of its own, built on the page's one
// thread and kept there (35 MB of arrays, and the same again on the GPU).
//
// Nothing that stands in a stand appears or drops out at once, whatever it is (any asset this engine places gets all of
// it, none of it written in the asset's file):
//   - its size on screen is measured as its kind says (its largest side; a tree's height), by each vertex, this frame;
//     or, where its stand says a `size`, as that for every plant of the stand: the stand changes level as one;
//   - a level draws the same as the next where they meet: it hands over to it at once, at its band's end;
//   - every rung of it (a sprig gone, its clumps, its impostor) stands in where its error, metres measured on the plant
//     by the crowd kit, is within the dial (src/detail/error.js): one ratio, r = errPx(e · s, dist) / ERROR_PX, decides
//     each, and each hand-over runs below its switch (r from 1 down over the BAND); it is its impostor so, each plant
//     at its own place in the BAND, over a short cross-fade texel by texel (meshShare);
//   - its last level sinks into the ground over the BAND under where it is gone (where leaving it out, its height over
//     the land, is within the one ERROR_PX: assets/kit/plant.js goneOf, src/detail/error.js);
//   - where it has sunk, the land wears its stand's colour (the stand's `cover`: src/terrain/material.js), as thick as
//     the stand grows there: a forest, and its undergrowth, to the horizon.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, vec2, vec3, vec4, uniform, uniformArray, varyingProperty, attribute, positionGeometry, vertexIndex, screenCoordinate, If, Discard, abs, max, mix, smoothstep, exp, pow, normalize, length, floor, cos, sin, cross, clamp, log, log2, exp2, step, fract, unpackHalf2x16, hash, sqrt, min } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, camDist, heightAt } from '../world/land.nodes.js';
import { layersOf, posIn, placeIn, grownIn, grovesOf, writersOf, hashesOf } from './rule.js';
import { createGrowth } from './growth.js';
import { toScreen, airOf, lightOn, shineOf, glintOf, sunAt, contactShade, weatherOn, snowLiftAtVertex, unlit, windAt, windDir, windStrength, ign } from '../world/light.js';
import { passOf, cut, motion, vWas } from '../core/pass.js';
import { gWrite, lightFamily, FAMILY } from '../core/gbuffer.js';
import { CLEARINGS } from '../../world/places.js';
import { recipe, recipes, versionOf } from '../core/registry.js';
import { scatterRow } from '../../assets/index.js';
import { kindOf, sizeOf, most } from '../../assets/kinds.js';
import { levelOf, levelOfMesh, handOver, sinkInto } from '../detail/handover.js';
import { createAtlas, bakers, viewClip, tileClip, impostorRead, clumpRead, facingOf, facingEnc, planeFrame, litIn, atlases, pictureOf } from '../detail/impostor.js';
import { levelsUnder, PICTURES } from '../detail/atlas.js';
import { offScreen, clipOf, Tier } from './tier.js';
import { createDrawer, pool } from './drawer.js';
import { castsInto } from '../world/shadow.js';
import { heapRow } from './heap.js';
import { plantOf } from './plantvert.js';
import { placedBy, bodyOf } from '../../assets/zoo/index.js';
import { inView } from './view.js';
import { addBodies, bodyGrid, topOf, wanted } from '../world/bodies.js';
import { idOf } from '../world/things.js';
import { wayAt, waysVersion } from '../world/ways.js';
import { pxOf, turnOf, seedOf } from './row.js';
import { levelOf as crowdLevelOf, RULE } from '../../assets/kit/crowd.js';
import { crowdOf, bandsOf, baseShare, goneOf, canopyNumbersOf, GRID, GOQ, GO0, FOOT } from '../../assets/kit/plant.js';
import { ringsOf, bandsOf as ringBands } from './grass.js';
import { lo16, hi16 } from './unpack.js';
import { farMost, pxKMost, measureVersion, dialPxAt, pxAt } from '../detail/measure.js';
import { landPages } from '../terrain/pages.js';
import { STANDS } from '../terrain/layers.js';
import { MARGIN } from './regions.js';
import { BAND, FADE } from '../detail/error.js';
import { source, shown } from '../core/settle.js';
import { gpuStorageLater } from '../core/gpu.js';
import { keptGet, keptPut } from '../core/kept.js';
import { shows } from '../detail/seen.js';

/** A half float's 16 bits as the number (what assets/kit/plant.js wrote). */
const unhalf = (h) => { const e = (h >> 10) & 31, m = h & 1023, v = e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1 + m / 1024) * 2 ** (e - 15); return h & 0x8000 ? -v : v; };
const SX = (2 * GRID.xz) / 65535, SY = (GRID.y1 - GRID.y0) / 65535;
/** A crowd level's vertex: what the rule moves it by, from the elements a plant's vertex is (assets/kit/plant.js), and
    its shape's sixteen numbers (ruleOf). */
const crowdOfElems = (e0, e1, rule) => ({
  tip: vec3(lo16(e1.z).mul(SX).sub(GRID.xz), hi16(e1.z).mul(SY).add(GRID.y0), lo16(e1.w).mul(SX).sub(GRID.xz)).toVar(),
  go: hi16(e1.w).greaterThan(0).select(exp2(hi16(e1.w).div(GOQ).sub(GO0)), float(0)).toVar(), rule,   // (metres: the error at which it goes, or its chunk comes)
});
/** A crowd level's shape's sixteen numbers from the two elements before its vertices (assets/kit/plant.js: half
    floats, two a number of 32 bits), as four vec4 (crowd.js RULE). */
const ruleOf = (a, b) => [vec4(unpackHalf2x16(a.x), unpackHalf2x16(a.y)), vec4(unpackHalf2x16(a.z), unpackHalf2x16(a.w)), vec4(unpackHalf2x16(b.x), unpackHalf2x16(b.y)), vec4(unpackHalf2x16(b.z), unpackHalf2x16(b.w))];
const smooth01 = (t) => { const c = clamp(t, 0, 1); return c.mul(c).mul(float(3).sub(c.mul(2))); };

/** The one ratio every hand-over of a plant is reckoned by (src/detail/error.js): how many times the dial a rung of
    error e (metres, its shape's own, at scale 1) puts the plant off where it is drawn px pixels large (its size Ks
    metres at scale 1): errPx(e · s, dist) / U.uErrorPx, s its scale, as px = s · Ks · uPxK / dist (measure.js pxAt,
    whose ?truth reach it keeps; a stage that tells px, tools/stick.js, so too). r ≥ 1: the rung would be seen and must
    not stand in; under 1 it may; every hand-over runs from 1 down over the BAND. */
const ratioOf = (e, px, Ks) => e.mul(px).div(Ks.mul(U.uErrorPx).max(1e-9));
/** How much of a plant is still its mesh, 1 … 0: its impostor stands in where its error (T, metres: its views' texel,
    their spacing and its parallax, farOf; 0, none yet) is within the dial, each plant at its own place in the BAND
    under that (by its seed: a stand passes over to them plant by plant, never all at once), over a FADE: a short
    cross-fade (handing). px: its size on screen; Ks: its size at scale 1. */
const meshShare = (T, px, Ks, seed) => T.greaterThan(0).select(clamp(log(ratioOf(T, px, Ks).max(1e-9)).div(FADE).add(fract(seed.mul(7.31)).add(1)), 0, 1), float(1));
/** Whether a pixel of a plant handing over to its impostor is its mesh's (share: how much of it is still its mesh): by a
    noise of the screen's that changes every frame, the same for the mesh and the impostor, so each pixel is one of the
    two, never both and never neither, and the picture built over time cross-fades them (src/core/temporal.js); the
    prepass's motion keeps what it built where the plant moves. The impostor's pixels are the others. */
const handing = (share) => fract(ign(screenCoordinate.xy).add(unlit().select(float(0), U.uDither))).lessThan(share);   // (the shadow map's still: it is built over no time)
/** The one rule (assets/kit/crowd.js, the same in JS there): where a crowd level's vertex lies at px pixels, and whether
    it shows. V: the vertex (position, root, part, Ks: its shape's size at scale 1) with C, what the rule moves it by
    (crowdOfElems: go in metres). A part that goes shrinks to its root over the FADE below where it may go, and the kept
    cards grow to stand for what has gone (grownBy); a chunk's planes grow out of its middle over the FADE below where it
    may come, while its own sprigs go (crowd.js clumpsOf: each where its own parts were). Each part's own error is its
    go: it changes at its own place, plant by plant as their sizes differ. */
/** How many times its size a kept sprig is drawn at px: what stays stands for what goes, grown so the crown covers as much
    of its round as it did (assets/kit/crowd.js growthOf; Cook, Halstead, Planck and Ryu 2007, "Stochastic
    Simplification of Aggregate Detail"), from its shape's numbers (rule, crowd.js RULE: the log of its most growth, and
    where, in the log of the error, it reaches each of its knots' growths, evenly in its log), at the error the dial
    allows here (metres at scale 1: its size there over its pixels, at the dial: what ratioOf holds a rung's error
    against), read between the two knots it lies between. 1 where nothing has gone. */
const COMP = ['x', 'y', 'z', 'w'], numOf = (rule, n) => rule[n >> 2][COMP[n & 3]];
function grownBy(px, V, rule) {
  if (!rule) return float(1);
  const KN = RULE.AT - RULE.GROW, x = log(V.Ks.mul(U.uErrorPx).div(px.max(1e-9))).toVar();
  let y = float(0), was = numOf(rule, RULE.E + 1);
  for (let j = 0; j < KN; j++) { const at = numOf(rule, RULE.GROW + j); y = y.add(clamp(x.sub(was).div(at.sub(was).max(1e-6)), 0, 1)); was = at; }
  return exp(y.mul(numOf(rule, RULE.E).div(KN)));
}
function crowdRule(px, V, C) {
  const r = (e) => ratioOf(e, px, V.Ks);
  // (how far under where it may go or come a part is, on the FADE: 0 at its switch, 1 a FADE under it)
  const under = clamp(log(r(C.go).max(1e-9)).negate().div(FADE), 0, 1), g = C.go.greaterThan(0).select(smooth01(float(1).sub(under)), float(1));
  const pos = V.position.toVar(), shown = float(1).greaterThan(0).toVar();
  If(V.part.greaterThan(1.5), () => {   // (a chunk's plane: under where it may come, grown out of its chunk's middle over the FADE)
    const c = smooth01(under);
    pos.assign(mix(C.tip, V.position, c)); shown.assign(c.greaterThan(0));
  }).Else(() => {   // (a card, a piece of wood: shrinking to its root as it goes; what never goes by itself stays till the impostor takes it; a card grown about its root as the kept stand for what has gone: grownBy)
    const k = V.part.greaterThan(0.5).select(grownBy(px, V, C.rule), float(1));
    pos.assign(V.root.add(V.position.sub(V.root).mul(g.mul(k)))); shown.assign(g.greaterThan(0));
  });
  return { pos, shown };
}

/** The one wind of a plant, at every rung (its cards, its clumps' planes, its impostor): how far a point of it `up` of
    the way up it (0 its foot … 1 its top) is pushed at `time` (x, z, metres): the gust where it stands (windAt), the
    push growing with height squared, and a slow sway of its own from a breeze up (its phase B.z). sway: its kind's; s:
    its scale. */
const swayOf = (A, B, up, sway, s, time) => {
  const u2 = up.mul(up).mul(s), ws = windStrength;
  return windAt(A.xy, time).mul(u2.mul(sway)).add(vec2(sin(time.mul(0.9).add(B.z)), cos(time.mul(0.7).add(B.z))).mul(u2.mul(ws.mul(0.05).add(smoothstep(0, 0.08, ws).mul(0.008)))));
};

export { FOOT };   // how deep a plant's foot is set into the ground (assets/kit/plant.js: where it is gone is reckoned from it)

// what stands in a cell: a thing, or nothing, by the one rule (rule.js: which of its layer's things stands there).
// Where one stands, `found` is told (the drawer's: drawer.js tier): which it is (its kind's, and of its kind's shapes
// one: its number among the group's), how large, how far; the drawer says whether it is of the tier's level, and it is
// then packed into two vec4 as every placer packs a thing (row.js: A: x, z, its foot's height, its size in metres as
// its kind measures it; B: its turn, which it is, its sway's phase, its seed, which is its shade too); its scale is its
// size over its shape's at scale 1 (sizeAtOne). Done once per cell for the whole group (src/scatter/tier.js); the cheap
// tests first (its band, the view), as most cells hold none.
//   G: the group (groupsOf): its layer (the cells, rule.js), the growth map it reads (G.M) and its kinds, each one of
//      the layer's things (Kd.e: its entry); how tall it stands and which of its shapes, the rule's (rule.js grownIn: a
//      kind's stages by age, the age its stand's or a sapling's, the plant its stage scaled to its own height)
/** What a group's packing reads of the things of its layer (G.L), one table of uniforms (until 2026-11-19 its kinds were
    its code, one If a kind: each group of a layer a shader of its own; and before, their numbers literals in it): a row
    each of the layer's entries, [1 where it is one of the group's kinds, its first shape among the group's (offsets), its
    size on screen to its height (`wide`), 0]; then a row each of the group's shapes, [its base, a share of its height,
    0, 0], in the group's order of shapes, as many as the largest group's (groupsOf: most), the rest nought: every
    group's packing declares it alike. at: where the shapes' rows begin. */
const kindsOf = (G) => {
  if (G.kindRows) return G.kindRows;
  const n = G.L.entries.length, bases = G.kinds.flatMap((Kd) => Kd.bases), rows = Array.from({ length: n + Math.max(G.most ?? 0, bases.length) }, () => new THREE.Vector4());
  for (const Kd of G.kinds) rows[Kd.e.i].set(1, Kd.offset, Kd.wide, 0);
  bases.forEach((b, j) => rows[n + j].set(b, 0, 0, 0));
  return (G.kindRows = { rows: uniformArray(rows, 'vec4'), at: n });
};
// ---- the canopy (one measure v2: assets/kit/plant.js goneShare): a plant is let go where leaving it out fits against
// the land's relief there (src/terrain/pages.js relief: each stand's cover times its relief's top), by its stand's
// cover, and sinks away over the BAND under that, as every level does under its own ----
/** Each of a group's shapes' canopy numbers, as long as the largest group's (as kindsOf's shapes' rows): (its stand's
    relief top (src/terrain/layers.js reliefTop; 0, none: a lone plant's rule), its crown's depth over its height, the
    most dial pixels it can be gone at (canopyNumbersOf: over that the land need not be read for it), 0). */
const canopyOf = (G) => {
  const T = (Kd) => STANDS.find((S) => S.entries.some((e) => e.id === Kd.e.id))?.reliefTop ?? 0;
  const rows = G.kinds.flatMap((Kd) => Array.from({ length: Kd.shapes }, (_, v) => { const t = T(Kd), [ds, most] = canopyNumbersOf(Kd.asset, v, t); return new THREE.Vector4(t, ds, t > 0 ? most : 0, 0); }));
  return uniformArray([...rows, ...Array.from({ length: Math.max(0, (G.most ?? 0) - rows.length) }, () => new THREE.Vector4())], 'vec4');
};
/** How much of a plant its canopy leaves, 1 … 0 (its levels' own hand-over apart): p its place, w its size (metres)
    and at its dial pixels, top its crown's top over the ground and depth its crown's depth (metres), N its shape's
    canopy numbers (canopyOf), dist how far off it is. Leaving it out is off by goneShare at the cover the relief there
    makes of its stand's (assets/kit/plant.js: the same rule, here in nodes); it is whole down to where that is a dial
    pixel and sinks away over the BAND under it. Node code: the packing's and the vertex stage's alike. */
const canopyLeft = (p, w, at, top, depth, N, dist) => {
  const left = float(1).toVar(), LP = landPages();
  if (!LP) return left;   // (no land under it: a lone plant's rule)
  If(at.lessThan(N.z).and(N.x.greaterThan(0)), () => {
    const R = LP.relief(p, vec2(w, 0), vec2(0, w), dist), c = R.div(N.x).min(1), dev = max(top.sub(c.mul(min(N.x, top))), c.mul(depth).div(3));
    left.assign(smoothstep(1 / BAND, 1, min(at, at.mul(dev).div(w.max(1e-6)))));
  });
  return left;
};
function plantIn(c, G, band, all, seen, found) {
  const { L } = G, cx = c.x, cy = c.y, h0 = hashesOf(L);   // (the layer's seed moves every hash: each layer its own cells)
  const pos = posIn(c, L).toVar(), dist = camDist(pos);
  const range = all ? length(pos.sub(band.at ?? U.uCam.xz)) : dist;   // the shadow's stand-in: metres round the camera, whatever the lens (what is solid: round where it is asked for, band.at)
  const there = range.lessThan(band.far).and(range.greaterThanEqual(band.near));
  If(seen ? there.and(inView(pos, seen.r, seen.high)) : there, () => {   // (seen.r: a uniform, its level's)   // (and in the eye's view: not the shadow's stand-in, whose shade may fall into it)
    const R = placeIn(c, L, G.M, pos), I = R.I, d = abs(I.x), w = I.y, K = kindsOf(G);
    const which = float(0).toVar(), h = float(1).toVar(), across = float(1).toVar(), base = float(0).toVar(), hit = float(0).toVar();
    // the kind's own, where it is one of the group's: how large this one is, and which of its shapes (the rule's: rule.js
    // grownIn, as the growth map reckons its crown)
    If(R.k.greaterThanEqual(0), () => {
      const E = K.rows.element(R.k);
      If(E.x.greaterThan(0.5), () => {
        const T = grownIn(c, L, R.k, pos);
        h.assign(T.h); which.assign(T.shape.add(E.y));
        across.assign(h.mul(E.z));   // (its size on screen by what its kind measures it by, src/detail sizeOf: a bush is low and wide, its largest side counts. `wide`: that to its height)
        base.assign(h.mul(K.rows.element(int(which).add(K.at)).x));   // (how far round its middle what of it covers the ground reaches, its own shape's: assets/kinds.js baseOf)
        hit.assign(1);
      });
    });
    // Whether it is of the tier's level (the size on screen the level asks, and a little either side: its hand-over,
    // and as far as the camera may move before the cells are worked out again) the drawer says; what of it shows, its
    // vertices say each frame (plantMaterial). (The shadow's stand-in: every plant in its band)
    If(hit.greaterThan(0.5), () => {
      const way = wayAt(pos, base);
      // (and none where its canopy has let it go, as it may be while the camera stays within its region's pad: its size
      // on screen a MARGIN larger. The shadow's stand-in: what is near, every one)
      const N = all ? null : (G.canopy ||= canopyOf(G)).element(int(which)), kept = all ? float(1) : canopyLeft(pos, across, dialPxAt(pxAt(across, dist)).mul(MARGIN), h.sub(FOOT), h.mul(N.y), N, dist);
      const stands = () => found(uint(which), across, dist, (A, B) => {
        A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(FOOT), across));   // (where it stands, its foot, its size in metres)
        B.assign(vec4(rnd(cx, cy, h0(305)).mul(6.2831853), which, rnd(cx, cy, h0(306)).mul(6.2831853), rnd(cx, cy, h0(307)).mul(0.999 * 6.2831853)));   // (its turn, its kind, its sway's phase, its seed: its shade, as it always was)
      });
      // (and none stands on a way: none whose base, what of it covers the ground (its own shape's), reaches onto it. Its crown
      // may reach over one. src/world/ways.js; where none are laid the shader is the one it was)
      If(kept.greaterThan(0), () => { if (way) If(way.lessThan(0.5), stands); else stands(); });
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
// each plant its own green (its leaves'): lighter or darker by its seed, warmer (yellower) or cooler (bluer) by its turn,
// each even over its plants; and their mean, what a stand of them shows on the whole (farOf: src/detail/seen.js)
const WARM = [1.07, 1.0, 0.78], COOL = [0.86, 0.98, 1.1], LIGHTER = [0.84, 0.3];
// how a leaf's colour varies among the leaves of one plant and among the plants of one kind, each a share of all its
// variation (Hunter L, a and b alike, over nine kinds of tree and shrub). source: Kwolek 1982, "Variations in leaf
// coloration using a reflectance colorimeter", Journal of Arboriculture 8(6): 157-159 (leaves 35%, trees 45%)
const LEAF_VARIES = { leaves: 0.35, plants: 0.45 };
// ... so each card (a branch's end, as each of Kwolek's leaves was one) strays from its plant's warmth by its own dice as a
// leaf strays from its plant's colour: its variance that share of the plants' (both even, so the spreads go as the square
// root). Round its plant's own and not cut at the plants' ends: a plant's cards on the whole are its own green, as its far
// end is (src/detail/impostor.js) and as the stand's mean is (GREEN)
const CARD_STRAYS = Math.sqrt(LEAF_VARIES.leaves / LEAF_VARIES.plants);
const ownGreen = (turn, seed, dice = null) => {
  const h = turn.mul(1.1631).fract(), hue = dice ? h.add(dice.sub(0.5).mul(CARD_STRAYS)) : h;
  return mix(vec3(...WARM), vec3(...COOL), hue).mul(seed.mul(LIGHTER[1]).add(LIGHTER[0]));
};
const GREEN = WARM.map((w, c) => ((w + COOL[c]) / 2) * (LIGHTER[0] + LIGHTER[1] / 2));
const CH = Object.fromEntries(PICTURES.map((P) => [P.name, P.channels.length]));   // (a far end's pictures' numbers a texel, by name)
/** How much of its own round a crown's leaves and wood cover seen from straight above (0 … 1; null: none seen), from its
    far end's finest kept pictures (L: a level, { colour, n }; views a side): the views round the middle of the square
    (src/detail/impostor.js squareOf: straight down), each the texels of its picture over the cut (as many as the
    picture covers: Castaño's, src/detail/impostor.worker.js), its round a disc's from where they lie (π r², r² twice
    their mean square distance from their middle), at most all but half a texel of it; their mean. */
const crownCover = (L, views) => {
  const n = L.n, cell = n / views, mid = Math.floor(views / 2), at = views % 2 ? [mid] : [mid - 1, mid];
  let sum = 0, of = 0;
  for (const py of at) for (const px of at) {
    let N = 0, sx = 0, sy = 0, sq = 0;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { if (L.colour[((py * cell + y) * n + px * cell + x) * CH.colour + 3] < 128) continue; N++; sx += x; sy += y; sq += x * x + y * y; }
    const area = 2 * Math.PI * (sq / Math.max(N, 1) - ((sx / Math.max(N, 1)) ** 2 + (sy / Math.max(N, 1)) ** 2));
    if (area > 1) { sum += Math.min(N / area, 1 - 0.5 / area); of++; }
  }
  return of ? sum / of : null;
};
const ofMesh = (key, start, type) => uniform(start, type).onObjectUpdate(({ object }) => object?.userData?.[key]);

/** A stand's light at w, the one light's (src/world/light.js lightOn): the sky's and the sun's on the dome its crown makes
    (a crown of a thousand cards takes the light as a whole, not card by card), the sky's less what the crowns above hide
    of it, through its needles when the sun is behind them (in their own colour), less of both deep in the crown (ao); its
    snow (in clumps); the air before it. n0: its way, turned with the plant; Ve: the way to the eye; share: the share of the
    sun that reaches w; tint: its own green (a card's; its wood's, white); leaf: how much of it is leaf, 0 … 1 (a far
    end's texel, which may be part leaf and part wood: src/detail/impostor.js impostorRead; else its part's, a card and a
    plane all, its wood none), what its leaves' light is mixed in by; rough, ns: a card's painting's roughness where the
    pixel is (src/materials/bake.js tex.r) and the way its own card faces: its leaves' highlight (shineOf), reflected
    off the card, not the dome (what a leaf reflects is as it faces); or glint, that highlight's own share worked out
    already (leafGlint: a deferred stand's prepass, where its painting is read). -> { sky, sun: what its texture's colour is
    multiplied by, the sky's part and the sun's apart (a pixel takes the sun's less what the contact shadows say), add:
    what is added (the snow on it, the air before it), through: the sun through its needles, spec: its leaves'
    highlight, added } */
const standLight = ({ w, n0, Ve, part, leaf = part.greaterThan(0.5).select(float(1), float(0)), ao, wrap, shines, clumps, tint, share, rough = null, ns = null, glint = rough ? leafGlint({ rough, ns, Ve }) : null }) => {
  const n = n0.dot(Ve).lessThan(0).select(n0.negate(), n0), sd = n.dot(U.uSunDir);
  const ndl = mix(sd, sd.add(wrap).div(wrap.add(1)), leaf).max(0);   // needles take the light round their edge
  const Lo = lightOn({ n, w, V: Ve, sun: share, ndl, through: shines.mul(leaf), ao, glint: glint ?? undefined });   // the sun behind a brush of needles shines through it
  const through = pow(Lo.back, 3).mul(shines).mul(leaf);
  const W = weatherOn(n, snowLiftAtVertex(w, clumps)), air = airOf(w);   // what the weather does to it (wet, its snow in clumps), and the air before it
  // (a chunk's plane is lit texel by texel, as its leaves are: here only what that light is multiplied by)
  const keep = tint.mul(W.keep).mul(air.k), plane = step(1.5, part).greaterThan(0.5), card = part.greaterThan(0.5).and(plane.not());
  return { through, sky: plane.select(keep, Lo.sky.mul(keep)), sun: plane.select(vec3(0), Lo.sun.mul(keep)), add: W.add.mul(Lo.sky.add(Lo.sun)).mul(air.k).add(air.col.mul(float(1).sub(air.k))), spec: card.select(Lo.spec.mul(W.keep).mul(air.k), vec3(0)) };
};

/** A card's leaves' highlight, its own share of the sun's light (light.js glintOf): as glossy and as tight as its
    painting's roughness where the pixel is says (shineOf), reflected off its own card (ns), the side the eye sees, not
    its crown's dome. */
const leafGlint = ({ rough, ns, Ve }) => { const own = ns.dot(Ve).lessThan(0).select(ns.negate(), ns), S = shineOf(rough, max(own.dot(U.uSunDir), 0)); return glintOf(own, Ve, S.gloss, S.sharp); };

// ---- the stands lit where their pixels are (src/core/gbuffer.js: deferred) ----
/** The stands' parts in the G-buffer: their wood, a card, a chunk's plane (the numbers standLight takes). */
const PART = Object.fromEntries(['wood', 'card', 'plane'].map((name, at) => [name, at]));
let lightSaid = false;
/** Their light, said once (gbuffer.js lightFamily): a card's or its wood's as standLight lights it, a chunk's plane as its
    leaves are (lightOn), with the contact shadows (light.js contactShade); their colour is in their green already
    (what their prepass wrote). */
const sayLight = () => {
  if (lightSaid) return;
  lightSaid = true;
  lightFamily(FAMILY.stands, (f) => {
    const share = sunAt(f.w, 'vertex').toVar();
    const [wrap, shines, ao, clumps] = f.own;   // (as gWrite took them, below)
    const S = standLight({ w: f.w, n0: f.n, Ve: f.Ve, part: float(f.part), ao, wrap, shines, clumps, tint: vec3(1), share, glint: f.glint });
    const P = lightOn({ n: f.n, w: f.w, V: f.Ve, sun: share, ndl: f.n.dot(U.uSunDir).add(wrap).div(wrap.add(1)).max(0), through: shines, ao });
    const col = f.part.equal(uint(PART.plane)).select(f.colour.mul(P.sky.add(P.sun)).mul(S.sky), f.colour.mul(S.sky.add(S.sun.mul(contactShade()))));
    return vec4(toScreen(col.add(S.add).add(S.spec)).rgb, 1);   // (and a card's leaves' highlight: leafGlint, from its prepass)
  });
};

// the one material of everything that stands in a stand, whatever its kind: shape(A, B) its vertex from what plantIn
// packed, swayed by the wind; its wood wrapped in its bark, its leaves cut out of their painted sprig (also in the shadow
// map: the shadow under a pine is dappled), lit through when the sun is behind them, and rounded over the crown as one
// dome (a crown of a thousand cards takes the light as a whole, not card by card); `ao` the light that reaches into the
// crown; a chunk's planes wearing its leaves as baked (its stand's clumps: farOf), lit pixel by pixel. Nothing of a kind
// is written into its code: what a kind is, is a few numbers (numbersOf), so every kind, every shape and every level is
// one shader to the GPU, compiled once.
//   D: { fade, sink, far }: how its levels hand over (its kind's: assets/kinds.js), its far ends (farOf)
function plantMaterial(tex, D) {
  // Lv: the level it is drawn as ({ lo, hi, first, last }: the pixels it is drawn between, and whether it is the
  // nearest, the farthest), or none (the shadow's stand-in: whole). Its level's numbers are uniforms.
  // feed: where a vertex comes from. In the world, the heap ({ ok(B): whether the draw's vertex is one of this plant's
  // mesh, vertex(B): it, unpacked, and its kind's numbers }: createStands); none: a mesh of its own (the library's
  // plant: its attributes, its numbers on the mesh; it wears no clumps and has no impostor).
  // px: its size on screen told, a node (pixels), where it is not to be reckoned from where the eye stands: the measure's
  // (tools/stick.js), which draws a plant as the game draws it at a size while its own camera frames it. None: reckoned.
  return (Lv = null, feed = null, px = null) => {
    const slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);
    // (what its canopy leaves of a plant of the world's stands (canopyLeft), at dial pixels at: by its shape's numbers,
    // its height its scale times its shape's; every level reads it alike (one pipeline for all of them: where it cannot
    // be gone it reads nothing of the land), the shadow's stand-in (near: its shadows are) and the library's plant none)
    const CAN = feed ? (D.canopy ||= canopyOf(D)) : null;
    const leftOf = (A, B, V, at) => { if (!CAN || !Lv) return float(1); const N = CAN.element(int(B.y.add(0.5))), h = A.w.div(V.Ks).mul(V.Hk); return canopyLeft(A.xy, A.w, at, h.sub(FOOT), h.mul(N.y), N, camDist(A.xy)); };
    const own = feed ? null : { Hk: ofMesh('hk', 1, 'float'), Ks: ofMesh('ks', 1, 'float'), Wd: ofMesh('wind', new THREE.Vector4(0, 0, 1, 0.3)), Lf: ofMesh('leaf', new THREE.Vector4(0.45, 0.55, 0, 0)), Tw: ofMesh('twig', 0, 'float'), Tn: ofMesh('tint', new THREE.Vector3(1, 1, 1)), Tf: float(0) };
    // (the library's plant: what the rule reads packed into seven buffers, a stage has eight: treeSample)
    const vertexOf = (B) => {
      if (feed) return feed.vertex(B);
      const pa = attribute('partAo', 'vec4'), tg = attribute('tipGo', 'vec4');
      return { position: positionGeometry, normal: attribute('normal', 'vec3'), uv: attribute('uv', 'vec2'), part: pa.x, ao: pa.y, cn: attribute('cn', 'vec3'), root: attribute('root', 'vec3'), twig: pa.z, shade: seedOf(B), ...own,
        crowd: { tip: tg.xyz, go: tg.w, rule: [0, 1, 2, 3].map((j) => ofMesh(`rule${j}`, new THREE.Vector4(), 'vec4')) } };
    };
    // (its level's sizes as they are, uniforms: every level one shader; Lv.mesh: as each mesh drawing it tells them, one
    // material for all its levels, src/scatter/drawer.js)
    const LU = Lv && (Lv.mesh ? levelOfMesh(D.fade) : levelOf(Lv, D.fade)), LC = Lv ? (Lv.mesh ? levelEndsMesh() : levelEnds(Lv)) : null;
    // what a pixel needs: where on its texture, and its light. The world's stands are lit where their pixels are, after
    // the prepass (src/core/gbuffer.js): their prepass writes what that light needs (vW: its point, vN: its way, vTint:
    // its green, vK: ao, wrap, shines, clumps) and they are drawn in no colour pass (2026-11-19: at eye level a stand had
    // three corners for each pixel it covers, and the colour pass drew all 21 M again). A library's picture is lit at
    // its corners (vMul: the sky's part of what its texture's colour is multiplied by, vSun: the sun's, which a pixel
    // takes less what the contact shadows say; vAdd: what is added), and a pixel reads its texture and is done.
    const vUv = varyingProperty('vec2', 'tUv'), vMul = varyingProperty('vec3', 'tMul'), vSun = varyingProperty('vec3', 'tSun'), vAdd = varyingProperty('vec3', 'tAdd'), vSpec = varyingProperty('vec3', 'tSpec');
    const vCn = varyingProperty('vec3', 'tCn');   // (the way its own card faces: what its leaves' highlight is reflected off, standLight)
    const vW = varyingProperty('vec3', 'tW'), vN = varyingProperty('vec3', 'tN'), vTint = varyingProperty('vec3', 'tTint'), vK = varyingProperty('vec4', 'tK');
    const vPart = varyingProperty('float', 'tPart'), vCut = varyingProperty('vec2', 'tCut');   // vCut: the needles' cut, and how far a card is from edge-on
    const vLay = varyingProperty('vec2', 'tLay');   // (the layers of its leaves' and its wood's textures: its kind's)
    // a chunk's plane (the world's: its stand's clumps, D.far): its kind's layer, how finely its texels are read, how
    // much of its cover is kept; its light (the sun as it reaches it, through, wrap, the plant's turn); the way to the eye
    const DEFER = !!feed;   // (the world's stands: lit where their pixels are, standsLit; a library's plant as it always was)
    const FAR = feed ? D.far : null, vClump = FAR ? varyingProperty('vec4', 'tClump') : null, vLit = FAR ? varyingProperty('vec4', 'tLit') : null, vEye = FAR ? varyingProperty('vec3', 'tEye') : null, vFade = FAR ? varyingProperty('float', 'tFade') : null;
    // (pass: what it is built for, src/core/pass.js: the prepass works out no light)
    const shape = (A, B, pass) => {
      const clip = offScreen().toVar();
      const drawn = () => {
        // part: 0 its wood, 1 a sprig's card, 2 a chunk's plane (assets/kit/crowd.js)
        const V = vertexOf(B);
        if (vFade) vFade.assign(1);   // (all of it its own: the shadow's stand-in, and a plant not handing over)
        if (!Lv) {
          // the shadow's stand-in: it goes as the plant goes, shrinking to its foot over its last level's last pixels as
          // the plant sinks there (over the BAND under where it is gone): no shadow is left where no tree is, and none goes at once
          const lo = D.kinds[0].levels.at(-1).lo, end = smoothstep(lo, lo * D.sink, dialPxAt(pxOf(A.w, A.xy)));
          If(V.drawn ? end.greaterThan(0).and(V.drawn) : end.greaterThan(0), () => { clip.assign(stand(A, B, V, end, pass)); });   // (drawn: the draw's corner is one of its mesh's)
          return;
        }
        // its size on screen now (its size, A.w; a stand that says its `size`, that), and from it the one hand-over
        // (src/detail/handover.js): its last level sinking. A level is drawn only between its own sizes on screen, hard
        // (the level beside it draws the same there). Its rule reckons a plant by its own size on screen, each of its
        // rungs by its own error (crowdRule). Where it is its impostor (meshShare), nothing of its mesh shows
        const own = px ?? pxOf(A.w, A.xy), at = dialPxAt(own), H = handOver(at, LU, D.sink);   // (its level's ends in the dial's pixels: src/detail/error.js)
        const left = leftOf(A, B, V, at), sunk = H.sunk.mul(left);   // (and as its canopy lets it go, whatever its level: canopyLeft)
        const above = LC.first.equal(1).select(H.u.greaterThan(0), at.lessThan(LC.hi)), below = LC.last.equal(1).select(H.sunk.greaterThan(0), at.greaterThanEqual(LC.lo));
        const R = crowdRule(own, V, V.crowd), mesh = meshShare(V.Tf, own, V.Ks, V.shade), show = above.and(below).and(R.shown).and(mesh.greaterThan(0)).and(left.greaterThan(0));
        // (its sprigs' own swing fades out over the BAND above where its crowd ends (its rule's HI, metres: its clumps or
        // its impostor come there): they, and its impostor, sway with the crown only, so nothing stops as one hands over
        // to the next; a crowd that never ends swings throughout)
        const HI = V.crowd.rule[0].z, swing = HI.greaterThan(0).select(clamp(log(ratioOf(HI, own, V.Ks).max(1e-9)).div(2 * FADE), 0, 1), float(1));
        If(V.drawn ? show.and(V.drawn) : show, () => {   // (drawn: the draw's corner is one of its mesh's)
          if (FAR) {
            // (a plane's texels read one to a pixel drawn, down to the least: its tile's TILE texels lie over its chunk's
            // box, as many metres as twice its corner's reach from the middle; and of its cover as much kept as the eye
            // sees of its leaves: its three planes, seen from v (the way to the eye in the plant's own frame), cover
            // |v.x| + |v.y| + |v.z| times what its leaves do)
            const e = abs(V.position.sub(V.crowd.tip)), wide = max(e.x, max(e.y, e.z)).mul(2).max(1e-3), perM = own.div(V.Ks);
            const v = turnOf(B.x).unturn(normalize(U.uCam.sub(vec3(A.x, A.z, A.y))));
            vClump.assign(vec4(V.Cl, clamp(log2(float(atlases().TILE).div(wide.mul(perM).max(1e-3))), 0, levelsUnder(atlases().TILE)), float(1).div(abs(v.x).add(abs(v.y)).add(abs(v.z))), 0)); vFade.assign(mesh);   // (and how much of it is still its mesh's: handing)
          }
          clip.assign(stand(A, B, { ...V, position: R.pos, root: R.pos }, sunk, pass, swing));
        });
      };
      // (in the shadow pass only what can cast into the map being drawn: a plant wholly outside its box along the light,
      // its sphere its size round its middle, is let go before any of its work: src/world/shadow.js castsInto)
      if (pass === 'shadow') If(castsInto(vec3(A.x, A.z.add(A.w.mul(0.5)), A.y), A.w), drawn); else drawn();
      return clip;
    };
    const stand = (A, B, V, sunk, pass, swing = float(1)) => {
      const part = V.part, ao = V.ao, card = float(1).sub(abs(part.sub(1))).max(0), body = step(1.5, part), Hk = V.Hk, sway = V.Wd.x, leans = V.Wd.y, flutters = V.Wd.z, clumps = V.Wd.w, wrap = V.Lf.x, shines = V.Lf.y, Tn = V.Tn;
      const s = A.w.div(V.Ks), { turn } = turnOf(B.x);   // (s: its scale, its size over its kind's at scale 1)
      // (a level's last pixels: the whole plant sunk; the shadow's stand-in, of no level, shrinks to its foot)
      const g0 = Lv ? sinkInto(V.position, sunk) : V.position.mul(sunk);
      const lean = vec2(cos(B.z), sin(B.z)).mul(V.shade.sub(0.5).mul(leans.mul(2))), lp = g0.add(vec3(lean.x, 0, lean.y).mul(g0.y)), up = clamp(lp.y.div(Hk), 0, 1);   // each leans its own way
      // the wind: the crown sways, the foot stays (the push grows with height squared), a slow sway of its own (from a
      // breeze up); and its sprigs swing in the wind, each as one from its foot, its tip most (a card's corners share its
      // plane, cn: one phase a card; uv.y: 0 at its foot), quicker and wider the harder it blows. In a calm all of it is
      // still: a sway of millimetres is no motion to the eye, only leaves' edges creeping by parts of a pixel (a shimmer).
      // Where it is at a time: the clock's, and for the prepass the clock's a frame ago (where it was: its motion)
      const ws = windStrength, cardN = V.cn, phase = cardN.dot(vec3(12.9, 78.2, 37.7)).add(B.z);   // (a card's own phase: its card's way, and its plant's)
      const at = (time) => {
        const kk = swayOf(A, B, up, sway, s, time);
        const flutter = sin(time.mul(ws.mul(5).add(1.6)).add(phase)).mul(ws.mul(0.14)).mul(card).mul(V.uv.y.min(1)).mul(flutters).mul(swing);
        return vec3(A.x, A.z, A.y).add(turn(lp.mul(s))).add(vec3(kk.x.add(windDir.x.mul(flutter)), flutter.mul(0.4), kk.y.add(windDir.y.mul(flutter))));
      };
      const w = at(U.uTime).toVar();
      vUv.assign(V.uv); vPart.assign(part); vLay.assign(vec2(V.twig.greaterThan(0.5).select(V.Tw, V.Lf.z), V.Lf.w));   // (a card of its finest level wears the painting of one twig)
      const toEye = U.uCam.sub(w), far = length(toEye), Ve = toEye.div(max(far, 1e-3));
      if (vEye) vEye.assign(Ve);
      // the needles' outline: far off a mip's needles are fainter, so the cut lowers with them and the crown stays full;
      // a card seen edge-on is a flat sliver, not a brush: it fades as it turns away
      // … and foliage right at the eye is let go (walking through a low crown, no card fills the picture)
      vCut.assign(vec2(mix(0.45, 0.16, smoothstep(15, 220, far)), max(smoothstep(0.06, 0.42, abs(normalize(turn(cardN)).dot(Ve))), body).mul(smoothstep(0.35, 1.3, far))));
      // each plant its own green: lighter or darker, and warmer (yellower) or cooler (bluer); each card its own warmth round
      // its plant's (CARD_STRAYS), by its own dice
      const leaf = part.greaterThan(0.5), n0 = normalize(turn(V.normal));
      const dice = fract(sin(phase).mul(43758.5453));   // (a card's own dice, from its phase)
      const tint = leaf.select(ownGreen(B.z, V.shade, dice).mul(Tn), vec3(1));
      if (pass === 'pre' && DEFER) {   // (deferred: what its pixels' light needs, written in its prepass; a chunk's plane's wrap and turn)
        vW.assign(w); vN.assign(n0); vTint.assign(tint); vK.assign(vec4(ao, wrap, shines, clumps)); vCn.assign(normalize(turn(cardN).add(vec3(0, 1e-6, 0))));
        if (vLit) vLit.assign(vec4(0, 0, wrap, B.x));
      } else if (pass !== 'pre' && pass !== 'shadow') {   // (the prepass and the shadow map: only its depth and its cut-out count)
        vMul.assign(vec3(0)); vSun.assign(vec3(0)); vAdd.assign(vec3(0)); vSpec.assign(vec3(0));
        If(unlit().not(), () => {
          // its light at each corner: one look at the shadow map (nine taps) and the clouds' map; a chunk's plane's light
          // reads it too (vLit: the sun as it reaches this corner, through-light, wrap, the turn)
          // (and its leaves' highlight at each corner: its painting's roughness at its card's middle, read at its level 0)
          const rough = tex.r(floor(V.twig.greaterThan(0.5).select(V.Tw, V.Lf.z).add(0.5)), vec2(0.5), null, null, 0);
          const share = sunAt(w, 'vertex').toVar(), S = standLight({ w, n0, Ve, part, ao, wrap, shines, clumps, tint, share, rough, ns: normalize(turn(cardN).add(vec3(0, 1e-6, 0))) });
          vSpec.assign(S.spec);
          if (vLit) vLit.assign(vec4(share, S.through, wrap, B.x));
          vMul.assign(S.sky); vSun.assign(S.sun); vAdd.assign(S.add);
        });
      }
      return clipOf(w, at(U.uTimeWas));
    };
    const frag = Fn((builder) => {
      // (the prepass, src/core/pass.js: what is cut, cut as the eye sees it, and where its point was; the colour pass:
      // nothing cut, every pixel the prepass left is drawn)
      const pass = passOf(builder);
      // drawn with alpha to coverage where its target is multisampled (a library's thumbnail; the game's own picture is
      // not: its edges are smoothed as it is built over time, src/core/temporal.js): a needle's outline soft in a pixel, not a screen-door
      // dither of whole pixels (which a lowered pixel ratio blows up into dots). Two levels are never both half there
      // (two halves of coverage are the same samples: a crown half see-through, in a grid): their hand-over is their
      // sprigs' sizes, in the vertex stage
      const leaf = vPart.greaterThan(0.5), T = vec4(1).toVar(), alpha = float(1).toVar(), shadow = unlit();
      // (while its impostor comes, as much of its mesh as is still its own: meshShare, cross-faded under the picture built
      // over time (handing); cut in the prepass)
      const fading = () => { if (FAR) cut(builder, handing(vFade).not()); };
      const cards = () => {
        fading();
        T.assign(tex.a(floor(vLay.x.add(0.5)), vUv));   // (its kind's leaves: the layer a whole number, however a pixel got it)
        // (the shadow map takes no coverage: cut; the eye's picture, its outline soft where a target is multisampled)
        const eye = () => { alpha.assign(smoothstep(vCut.x.sub(0.08), vCut.x.add(0.08), T.a).mul(vCut.y)); cut(builder, alpha.lessThan(0.04)); };
        if (pass === 'shadow') If(T.a.lessThan(vCut.x), () => { Discard(); });
        else if (pass) eye();
        else If(shadow, () => { If(T.a.lessThan(vCut.x), () => { Discard(); }); }).Else(eye);
      };
      If(leaf, () => {
        if (!FAR) return cards();
        If(vPart.greaterThan(1.5), () => {
          // a chunk's plane: its leaves as baked (src/detail/impostor.js), as many of its covered texels kept as the
          // chunk's own cover is of its three planes' (vClump.z), each texel by a number of its own (still from frame to
          // frame, sitting on the plane as a leaf does), and as much as is still its mesh's (handing); cut in the prepass
          const C = clumpRead(FAR.clumps(), vClump.x, vUv, vClump.y), t = floor(vUv.mul(atlases().TILE)), keep = hash(uint(t.x).add(uint(t.y).mul(uint(4099))).add(uint(vClump.x).mul(uint(1000003))));
          cut(builder, C.cover.lessThan(0.5).or(keep.greaterThanEqual(vClump.z)).or(handing(vFade).not()));
          if (pass === 'pre' && DEFER) gWrite({ family: FAMILY.stands, part: PART.plane, colour: C.colour.mul(C.colour).mul(vTint), n: turnOf(vLit.w).turn(C.normal).add(vEye.mul(0.35)), w: vW, own: [vK.y, vK.z, C.light, vK.w] });   // (deferred: what its light needs)
          if (pass === 'pre' || pass === 'shadow') return;
          If(shadow.not(), () => {
            // lit as its leaves are, pixel by pixel, their way there turned with the plant and pulled a little towards
            // the eye (three planes show the leaves that face them edge-on more than the leaves do: HPG 2026's bias);
            // the sun through them as through its cards (lightOn's: no lobe of its own, so it hands over unseen)
            const n = normalize(turnOf(vLit.w).turn(C.normal).add(vEye.mul(0.35))), wrapT = vLit.z, aoT = C.light;
            const ndlT = n.dot(U.uSunDir).add(wrapT).div(wrapT.add(1)).max(0);
            const LT0 = lightOn({ n, sun: vLit.x, ndl: ndlT.add(vLit.y), ao: aoT }), LT = LT0.sky.add(LT0.sun);
            T.assign(vec4(C.colour.mul(sqrt(LT)), 1));
          });
        }).Else(cards);
      }).Else(fading);   // (its wood: only its impostor's coming cuts it)
      // (deferred: what a card's or its wood's light needs, its bark read here then)
      // (a card's leaves' highlight worked out here, where its painting is read: its roughness where the pixel is, off its
      // own card (leafGlint); its wood takes none)
      if (pass === 'pre' && DEFER) If(vPart.lessThan(1.5), () => {
        const glint = float(0).toVar();
        If(leaf.not(), () => { const W = tex.a(floor(vLay.y.add(0.5)), vUv); T.assign(vec4(W.rgb.mul(mix(0.74, 1, W.a)), 1)); }).Else(() => { glint.assign(leafGlint({ rough: tex.r(floor(vLay.x.add(0.5)), vUv), ns: vCn, Ve: normalize(U.uCam.sub(vW)) })); });
        gWrite({ family: FAMILY.stands, part: leaf.select(uint(PART.card), uint(PART.wood)), colour: T.rgb.mul(T.rgb).mul(vTint), n: vN, w: vW, glint, own: [vK.y, vK.z, vK.x, vK.w] });   // (own: wrap, shines, ao, clumps, as its light reads them: sayLight)
      });
      if (pass === 'pre') return motion(vWas, leaf.select(float(1), float(0)));   // (where it was a frame ago; a leaf's card is thin)
      if (pass === 'shadow') return vec4(0);   // (into a shadow map: its depth and its cut-out, no light)
      If(leaf.not().and(shadow.not()), () => { const W = tex.a(floor(vLay.y.add(0.5)), vUv); T.assign(vec4(W.rgb.mul(mix(0.74, 1, W.a)), 1)); });   // its bark, darker in its fissures (0.74 squared: 0.55)
      const out = vec4(0).toVar();
      // (its fourth number: in the world's frame what was kept may be trusted, its motion said; drawn where the target is
      // multisampled, a library's picture, it is the coverage)
      // (the sun's part less what the contact shadows say: leaf on leaf)
      If(shadow.not(), () => { out.assign(vec4(toScreen(T.rgb.mul(T.rgb).mul(vMul.add(vSun.mul(contactShade()))).add(vAdd).add(vSpec)).rgb, pass ? float(1) : alpha)); });   // (and its leaves' highlight: standLight)
      return out;
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide; m.alphaToCoverage = true; m.userData.pre = true; m.userData.shadow = true;   // (it takes part in the prepass: src/core/pass.js)
    if (DEFER) { m.userData.deferred = true; sayLight(); }   // (lit where its pixels are: no colour pass of its own)
    return { m, shape, slot };
  };
}

// ---- the far end: a plant as its impostor (src/detail/impostor.js), one quad facing the eye ----
/** The material a stand's impostors are drawn with at its level Lv ({ lo, hi, first, last }): a plant packed into its
    far end's draw shows here where it is its impostor (meshShare) and of this level, sinking into the ground as its
    last level does; each pixel its three nearest views blended, and lit as its leaves are, pixel by pixel. (Its quad
    writes its own depth, not what it shows: a shader that wrote it would be worked out for every pixel hidden behind
    nearer crowns too.) */
/** A level's ends as its material reads them: its sizes on screen and whether it is the first or the last of its stand,
    uniforms all, so every level of a stand's plants is one shader, and every level of its impostors one (2026-11-19:
    first, middle and last were three, differing in two words). */
const levelEnds = (Lv) => ({ lo: uniform(Lv.lo), hi: uniform(Number.isFinite(Lv.hi) ? Lv.hi : 1e9), first: uniform(Lv.first ? 1 : 0, 'uint'), last: uniform(Lv.last ? 1 : 0, 'uint') });
/** The same as the mesh drawing it tells them (mesh.userData.Lv, src/scatter/drawer.js), read at each draw. */
const ofLv = (f, type = 'float') => uniform(0, type).onObjectUpdate(({ object }) => { const Lv = object?.userData?.Lv; return Lv ? f(Lv) : 0; });
const levelEndsMesh = () => ({ lo: ofLv((Lv) => Lv.lo), hi: ofLv((Lv) => (Number.isFinite(Lv.hi) ? Lv.hi : 1e9)), first: ofLv((Lv) => (Lv.first ? 1 : 0), 'uint'), last: ofLv((Lv) => (Lv.last ? 1 : 0), 'uint') });
function impostorMaterial(G, D, Lv, src) {
  const LU = Lv.mesh ? levelOfMesh(G.fade) : levelOf(Lv, G.fade), LC = Lv.mesh ? levelEndsMesh() : levelEnds(Lv), slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);
  const vP = varyingProperty('vec3', 'iP'), vE = varyingProperty('vec3', 'iE'), vS = varyingProperty('float', 'iS');
  const vK = varyingProperty('vec4', 'iK'), vT = varyingProperty('vec3', 'iT'), vX = varyingProperty('vec3', 'iX'), vLit = varyingProperty('vec4', 'iLit');
  const m = new THREE.NodeMaterial();
  m.vertexNode = Fn((builder) => {
    const A = src.readAt(0, slot), B = src.readAt(1, slot), clip = offScreen().toVar(), kind = uint(B.y.add(0.5));
    const r0 = D().numOf(kind, 0), r2 = D().numOf(kind, 2), r3 = D().numOf(kind, 3), r4 = D().numOf(kind, 4);
    const own = pxOf(A.w, A.xy), at = dialPxAt(own), H = handOver(at, LU, G.sink);
    const above = LC.first.equal(1).select(H.u.greaterThan(0), at.lessThan(LC.hi)), below = LC.last.equal(1).select(H.sunk.greaterThan(0), at.greaterThanEqual(LC.lo));
    const share = float(1).sub(meshShare(r3.z, own, r3.y, seedOf(B)));
    // (and as its canopy lets it go: canopyLeft, its height its scale times its shape's)
    const N = (G.canopy ||= canopyOf(G)).element(int(kind)), h = A.w.div(r3.y).mul(r0.x), left = canopyLeft(A.xy, A.w, at, h.sub(FOOT), h.mul(N.y), N, camDist(A.xy));
    If(above.and(below).and(share.greaterThan(0)).and(left.greaterThan(0)), () => {
      // its sphere in the world (its scale; leaning as its mesh leans: plantMaterial's stand; sunk, it shrinks to its
      // foot), and a quad facing the eye over it
      const { turn, unturn } = turnOf(B.x), k = H.sunk.mul(left), s = A.w.div(r3.y), Rw = r4.w.mul(s).mul(k), lean = vec2(cos(B.z), sin(B.z)).mul(seedOf(B).sub(0.5).mul(D().numOf(kind, 1).y.mul(2))).mul(r4.y);
      const c = vec3(A.x, A.z, A.y).add(turn(r4.xyz.add(vec3(lean.x, 0, lean.y)).mul(s).mul(k))).toVar();
      const d = normalize(U.uCam.sub(c)).toVar(), right = normalize(cross(vec3(0, 1, 0), d).add(vec3(1e-6, 0, 0))), up = cross(d, right), j = vertexIndex;
      // (half its radius towards the eye: what is behind it is hidden before its pixels are worked out, and crowns
      // side by side, and a crown and the ground, meet about where they do)
      const w = c.add(right.mul(j.equal(uint(1)).or(j.equal(uint(2))).select(float(1), float(-1))).add(up.mul(j.greaterThan(uint(1)).select(float(1), float(-1)))).mul(Rw)).add(d.mul(Rw.mul(0.5)));
      // what a pixel needs: its point and the eye in the plant's own frame (from its middle, in its radii: the views it
      // reads are its own ray's, impostorRead), how much of it is its impostor yet, which layer, how finely (its texels
      // one to a pixel drawn: CELL of them over its sphere's width, 2 r4.w of its Ks at scale 1), its turn, its sphere's
      // radius in the world
      vP.assign(unturn(w.sub(c)).div(Rw)); vE.assign(unturn(U.uCam.sub(c)).div(Rw)); vS.assign(share);
      const CELL = atlases().STORED;   // (its atlas's texels a view: a texel a drawn pixel)
      vK.assign(vec4(B.y, clamp(log2(r3.y.mul(CELL).div(r4.w.mul(2).mul(own).max(1e-3))), 0, levelsUnder(CELL)), B.x, Rw));
      // what it is lit by, as its mesh is (standLight): the sun as it reaches its middle, once for the plant (a few
      // pixels), and its kind's numbers its mesh's corners carry (its leaves' wrap and how much the sun shines through
      // them, its snow's clumps: numbersOf); its own green (as its cards': plantMaterial)
      vT.assign(ownGreen(B.z, seedOf(B)).mul(r0.yzw));
      if (passOf(builder) !== 'shadow') vLit.assign(vec4(sunAt(c, 'vertex'), r2.y, r2.x, D().numOf(kind, 1).w));
      // it sways in the one wind as its mesh does (swayOf), each corner as far as its height up the plant: what it
      // shows is read where it stood still (vP), so its picture leans with the wind as the crown does; and for the
      // prepass, where it was a frame ago
      const up1 = clamp(w.y.sub(A.z).div(s.mul(r0.x)), 0, 1), sway = D().numOf(kind, 1).x, swayed = (time) => { const kk = swayOf(A, B, up1, sway, s, time); return w.add(vec3(kk.x, 0, kk.y)); };
      const now = swayed(U.uTime).toVar(); vX.assign(now);   // (its pixel's point in the world: where it is lit, as its mesh's pixel is)
      clip.assign(clipOf(now, swayed(U.uTimeWas)));
    });
    return clip;
  })();
  m.fragmentNode = Fn((builder) => {
    const R = impostorRead(G.far.views, vK.x, vP, vE, vK.y), out = vec4(0).toVar();
    // (cut in the prepass, src/core/pass.js: what it does not cover, and the pixels that are still its mesh's while it
    // hands over (handing); then where its point was a frame ago)
    cut(builder, R.cover.lessThan(0.5).or(handing(float(1).sub(vS))));
    if (passOf(builder) === 'pre') return motion(vWas, R.leaf);   // (a leaf's texel is thin)
    if (passOf(builder) === 'shadow') return out;   // (into a shadow map: its outline)
    // lit as its mesh is, pixel by pixel (standLight: its leaves' wrap, the sun through them, the sky, the weather, the
    // air before it; the contact shadows on the sun's part), at its pixel's point, its way as its pictures keep it, the
    // light that reaches into it as baked, how much of it is leaf as its pictures keep it (a texel part leaf and part
    // wood lit as much as each): nothing of its own, so it hands over from its mesh unseen
    If(unlit().not(), () => {
      const S = standLight({ w: vX, n0: turnOf(vK.z).turn(R.normal), Ve: normalize(U.uCam.sub(vX)), part: float(0), leaf: R.leaf, ao: R.light, wrap: vLit.z, shines: vLit.y, clumps: vLit.w, tint: mix(vec3(1), vT, R.leaf), share: vLit.x });
      out.assign(vec4(toScreen(R.colour.mul(R.colour).mul(S.sky.add(S.sun.mul(contactShade()))).add(S.add)).rgb, 1));
    });
    return out;
  })();
  m.userData.pre = true; m.userData.shadow = true;   // (it takes part in the prepass, and says what it cuts in the shadow pass: src/core/pass.js)
  return m;
}

// ---- the far ends baked: each shape's impostor and its clumps, each picture from the level of the heap the measure picks
// at its own size ----
let BAKING = false;   // (one shape at a time, of every stand: the bakers' targets are one set)
const BAKED = 6;   // the bake's own version, in what the browser keeps of it (farOf): one more whenever how a far end is baked changes
/** A stand's far ends (G: its group; D(): its drawer, once made): its two atlases (the impostors' views, a layer a shape,
    VIEWS x VIEWS views of CELL texels a side; its chunks' planes, a layer a shape that has clumps, G.clumpLayer, G.tiles
    tiles of TILE texels a row: the atlases' numbers, src/detail/impostor.js atlases), and what bakes them. Each shape
    is baked as its finest level comes into the heap (onBlock: its far data, assets/kit/crowd.js), a row of pictures a
    frame (pump), then its numbers say where it is its impostor (its row 3's third: T, its impostor's error). A picture
    is drawn from the level the measure picks at its own size (levelAt): a view CELL texels over the plant's sphere, a
    chunk's plane TILE texels over the longest side of its chunk; never from more than a picture so small shows. */
function farOf(renderer, tex, G, D) {
  const A = atlases(), n = G.meshes, views = createAtlas(renderer, { name: `plants, ${G.name}: impostors`, side: A.VIEWS * A.STORED, layers: n, cell: A.STORED, views: A.VIEWS });   // (from the level read where an impostor comes in: atlasesOf STORED)
  let clumps = null; const clumpsOf = () => (clumps ||= createAtlas(renderer, { name: `plants, ${G.name}: clumps`, side: G.tiles * A.TILE, layers: G.clumpy, cell: A.TILE }));   // (a stand none of whose shapes has clumps: one tile, which nothing reads)
  const queue = [], queued = new Uint8Array(n), waiting = new Map(); let version = 0, any = false, M = null, out = 0, swept = false;
  // the levels a shape's pictures are drawn from (far: its far data, assets/kit/crowd.js): the measure's at each
  // picture's own size, the plant's size in it in dial pixels (a view: CELL texels over its sphere; a chunk's plane:
  // TILE texels over its chunk's longest side, the shortest of its chunks), never a level wholly under where its
  // impostor is all (none of it is there)
  // a shape's cards and their chunks (its finest level's block: what the workers made; its far data, crowd.js clumpsOf):
  // its cards come first in its corners, six a card, a card's vertices marked by their part (assets/kit/plant.js); each
  // card is in the chunk whose cell holds its sprig's tip as the GPU reads it (its grid's 16 bits a side, crowdOfElems),
  // found once a sprig. A coarser level's cards are a first share of the finest's, the same vertices: their chunks too
  const cardsIn = (b, j, idx, elems) => {
    const V = b.verts, o = j * elems * 4, C = b.corners.subarray(j * idx, j * idx + b.draws[j]);
    let nc = 0; while (6 * nc < C.length && ((V[o + C[6 * nc] * 8 + 3] >>> 8) & 3) === 1) nc++;
    return { V, o, C, nc };
  };
  const chunksOfCards = (b, j, idx, elems, far) => {
    const { V, o, C, nc } = cardsIn(b, j, idx, elems), of = new Int16Array(nc), seen = new Map();
    for (let c = 0; c < nc; c++) {
      const v = o + C[6 * c] * 8, key = V[v + 6] * 65536 + (V[v + 7] & 0xffff);
      let q = seen.get(key);
      if (q === undefined) {
        const x = (V[v + 6] & 0xffff) * SX - GRID.xz, y = (V[v + 6] >>> 16) * SY + GRID.y0, z = (V[v + 7] & 0xffff) * SX - GRID.xz;
        q = -1; for (let h = 0; h < far[0]; h++) { const f = 8 + h * 12; if (x >= far[f] && y >= far[f + 1] && z >= far[f + 2] && x < far[f + 3] && y < far[f + 4] && z < far[f + 5]) { q = h; break; } }
        seen.set(key, q);
      }
      of[c] = q;
    }
    return of;
  };
  // a level's card corners in its chunks' order (its block; of: its cards' chunks), each chunk's cards one after another:
  // { list, start, count } (a chunk's range of the list, corners)
  const chunkOrder = (b, j, idx, elems, of, n) => {
    const { C, nc } = cardsIn(b, j, idx, elems), m = Math.min(nc, of.length), count = new Uint32Array(n), start = new Uint32Array(n);
    for (let c = 0; c < m; c++) if (of[c] >= 0) count[of[c]] += 6;
    for (let q = 1; q < n; q++) start[q] = start[q - 1] + count[q - 1];
    const list = new Uint32Array(n ? start[n - 1] + count[n - 1] : 0), at = start.slice();
    for (let c = 0; c < m; c++) { const q = of[c]; if (q >= 0) { list.set(C.subarray(6 * c, 6 * c + 6), at[q]); at[q] += 6; } }
    return { list, start, count };
  };
  const levelsOf = (far) => {
    const Ls = G.kinds[0].levels, size = far[5], farLo = size / (far[6] * BAND);
    const at = (px) => { let l = Ls.findIndex((L) => px >= L.lo); if (l < 0) l = Ls.length - 1; while (l > 0 && !(Ls[l].hi > farLo)) l--; return l; };
    let side = Infinity; for (let c = 0; c < far[0]; c++) { const b = 8 + c * 12 + 6; side = Math.min(side, Math.max(far[b + 3] - far[b], far[b + 4] - far[b + 1], far[b + 5] - far[b + 2])); }
    return { views: at((size * A.CELL) / (2 * far[4])), tiles: far[0] > 0 ? at((size * A.TILE) / side) : 0 };
  };
  source(`plants, ${G.name}: far ends`, () => out);   // (the world is not complete while a shape's far end is still being baked: src/core/settle.js)
  // what bakes a shape (made at the first: they read the heap): its finest level's vertices as they lie there, each
  // view (instances: a row's) or each chunk's plane (instances: a row's tiles) drawing it, its leaves and its bark as
  // near (a leaf's cut-out read at its finest: SS x SS samples a texel say how much of it is covered)
  const materials = () => {
    if (M) return M;
    const H = D().H, kindU = uniform(0, 'uint'), levelU = uniform(0, 'uint'), rowU = uniform(0, 'int'), sphereU = uniform(new THREE.Vector4(0, 0, 0, 1)), nU = uniform(0, 'int'), tilesU = uniform(G.tiles, 'int');   // (tilesU: its tiles a row, a uniform: every stand's bakers one pipeline)
    const cells = Array.from({ length: A.CLUMPS * 4 }, () => new THREE.Vector4()), cellsU = uniformArray(cells, 'vec4');
    // (the tile level's card corners, a chunk's after another (chunkOrder): a chunk's planes draw their own range of
    // them, its start and count in its cell's first two rows, never the rest of the level. As large as what is written
    // into it, made larger before a list that would not fit (job: corners), never sized from the heap's pools as they
    // stand when the bake is first made, which may hold nothing yet)
    const CL = gpuStorageLater('uint', `plants, ${G.name}: the clumps' corners`, 'geometry'); CL.made = CL.make(1) / 4;
    const vUv = varyingProperty('vec2', 'bUv'), vPart = varyingProperty('float', 'bPart'), vTwig = varyingProperty('float', 'bTwig'), vN = varyingProperty('vec3', 'bN'), vZ = varyingProperty('float', 'bZ'), vAo = varyingProperty('float', 'bAo');
    const vertexAt = (id) => { const R = heapRow(H, kindU, levelU), e = R.y.add(id.mul(uint(2))), e0 = H.elems.element(e).toVar(), e1 = H.elems.element(e.add(uint(1))).toVar(); return { ...plantOf(e0, e1), tip: crowdOfElems(e0, e1, null).tip }; }, vertex = () => vertexAt(vertexIndex);
    // (its way as its picture keeps it: facing the picture, in the picture's own frame, F: src/detail/impostor.js facingOf)
    const pass = (V, z, F) => { vUv.assign(V.uv); vPart.assign(V.part); vTwig.assign(V.twig); vZ.assign(z); vAo.assign(V.ao); vN.assign(facingOf(V.normal, F)); };
    const viewV = Fn(() => { const V = vertex(), P = viewClip(V.position.sub(sphereU.xyz).div(sphereU.w), rowU, A.VIEWS); pass(V, P.z, P.F); return V.part.greaterThan(1.5).select(vec4(0, 0, 2, 1), P.clip); })();   // (a chunk's plane, where its level has them, is no part of a view: behind the far plane)
    const tileV = Fn(() => {
      // (a chunk's plane over its own corners only: its range of the chunks' list, CL, as many corners drawn as its row's
      // largest chunk has, those past its own behind the far plane, not drawn)
      const col = int(pictureOf()), tile = rowU.mul(tilesU).add(col), c = tile.div(3), a = tile.sub(c.mul(3)), clip = vec4(0, 0, 2, 1).toVar();   // (col: its tile of the row, pictureOf: a row is baked a few tiles at a time)
      const from = cellsU.element(c.mul(4)).w, many = cellsU.element(c.mul(4).add(1)).w, blo = cellsU.element(c.mul(4).add(2)).xyz, bhi = cellsU.element(c.mul(4).add(3)).xyz;
      If(c.lessThan(nU).and(vertexIndex.lessThan(uint(many))), () => { const V = vertexAt(CL.node.element(uint(from).add(vertexIndex))), P = tileClip(V.position, blo, bhi, a, float(col), float(tilesU)); pass(V, P.z.mul(2).sub(1), planeFrame(a)); clip.assign(P.clip); });
      return clip;
    })();
    const N = (j) => D().numOf(kindU, j), leafA = () => tex.a(floor(vTwig.greaterThan(0.5).select(N(3).x, N(2).z).add(0.5)), vUv).bias(-2);
    const colourF = Fn(() => {
      const out = vec4(0).toVar();
      If(vPart.greaterThan(0.5), () => { const T = leafA(); If(T.a.lessThan(0.45), () => { Discard(); }); out.assign(vec4(T.rgb, 1)); })
        .Else(() => { const W = tex.a(floor(N(2).w.add(0.5)), vUv); out.assign(vec4(W.rgb.mul(mix(0.74, 1, W.a)), 1)); });
      return out;
    })();
    // (its light: the light that reaches into it, as its mesh has it, the kit's ao; nothing laid on top, so its picture
    // is lit as its mesh is where it hands over)
    const dataF = Fn(() => { If(vPart.greaterThan(0.5), () => { If(leafA().a.lessThan(0.45), () => { Discard(); }); }); return vec4(facingEnc(vN), vZ.mul(0.5).add(0.5), litIn(vAo, step(0.5, vPart))); })();
    const mat = (v, f) => { const m = new THREE.NodeMaterial(); m.vertexNode = v; m.fragmentNode = f; m.side = THREE.DoubleSide; return m; };
    const geo = new THREE.InstancedBufferGeometry(), tgeo = new THREE.InstancedBufferGeometry(), mesh = (g, v) => Object.assign(new THREE.Mesh(g, null), { frustumCulled: false, userData: { materials: [mat(v, colourF), mat(v, dataF)] } });   // (tgeo: no corners of its own, its vertex stage reads them)
    return (M = { kindU, levelU, rowU, sphereU, nU, cells, CL, geo, tgeo, view: mesh(geo, viewV), tile: mesh(tgeo, tileV) });
  };
  // what a shape shows, on the whole (src/detail/seen.js), read from its pictures as they are baked or kept: their least
  // level (each texel already its cover's mean of those under it: src/detail/impostor.worker.js), as its impostor shows
  // it farthest, where the land takes over. Each picture alike (the land is seen from any of its views), each texel by its
  // cover: its albedo, the square of what its colour keeps (src/detail/atlas.js PICTURES), its leaves (by its leaf
  // picture) in its kind's green and its plants' own, on the whole (GREEN), as its impostor tints them (mix(1, tint, leaf))
  const kindOfShape = (k) => G.kinds.find((Kd) => k >= Kd.offset && k < Kd.offset + Kd.shapes);
  const seenIn = (k, levels) => {
    const Lv = levels?.at(-1); if (!Lv) return;
    const n = Lv.n, cell = n / A.VIEWS, Kd = kindOfShape(k), Tn = G.numbers.subarray(k * 20 + 1, k * 20 + 4), T = [0, 1, 2].map((c) => Tn[c] * GREEN[c] - 1), sum = [0, 0, 0], P = [0, 0, 0];
    let pics = 0;
    for (let py = 0; py < A.VIEWS; py++) for (let px = 0; px < A.VIEWS; px++) {
      let w = 0; P.fill(0);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const o = (py * cell + y) * n + px * cell + x, a = Lv.colour[o * CH.colour + 3] / 255, f = Lv.leaf[o * CH.leaf] / 255; if (!(a > 0)) continue;
        w += a; for (let c = 0; c < 3; c++) P[c] += a * (Lv.colour[o * CH.colour + c] / 255) ** 2 * (1 + f * T[c]);
      }
      if (w > 0) { for (let c = 0; c < 3; c++) sum[c] += P[c] / w; pics++; }
    }
    if (pics) shows(Kd.asset, k - Kd.offset, Kd.shapes, sum.map((v) => v / pics), crownCover(levels[0], A.VIEWS));   // (and how much of its round its crown covers: crownCover)
  };
  // its numbers, once its pictures are in: its sphere; T, its impostor's error (metres, at scale 1: its views' texel and
  // what their spacing and its parallax misplace, as the crowd kit measured it for these atlases: its far data's sixth
  // number), which the one ratio holds against the dial (meshShare)
  const numbers = (k, far) => {
    const row3 = G.numbers.subarray(k * 20 + 12, k * 20 + 16);
    row3[2] = far[6];
    D().setNum(k, 4, [far[1], far[2], far[3], far[4]]); D().setNum(k, 3, row3);
    version++; any = true;
  };
  // What the browser keeps of them (src/core/kept.js): each shape's pictures as the workers mipped them, kept under the
  // registry's versions of all they are baked from (the stand's kinds and their rooms: its drawer's fingerprint; their
  // paintings: their materials' versions) and the bake's own (BAKED). A start that finds them puts them in and bakes
  // nothing: the far plants are whole from the first frames, not after half a minute to a minute and a half.
  let KEPT = null;
  const keptAs = () => (KEPT ||= `far ${BAKED}|${A.key}|${G.tiles}|${D().fingerprint}|${G.kinds.flatMap((Kd) => [...Object.values(Kd.asset.materials ?? {}), Kd.asset.fine?.twig].filter(Boolean).map(versionOf)).join()}`);
  const keyOf = (k) => `far: ${G.name}: ${k}`;
  // (a promise of { done }: its pictures drawn and read back, the bakers free for the next shape; done, once they are
  // in the atlases and its numbers say so)
  // (a chunks' corner list into the bake's buffer, made larger first where it would not fit: to the next power of two,
  // so a stand's lists grow it a few times at the most, not at every bake)
  const cornersInto = (CL, list) => { if (list.length > CL.made) CL.made = CL.make(2 ** Math.ceil(Math.log2(list.length))) / 4; CL.write(0, list); };
  // (each shape's far data from its outline, where its workers reckoned it: assets/kit/tree.js farOf)
  const outlineFar = G.kinds.flatMap((Kd) => Array.from({ length: Kd.shapes }, (_, v) => Kd.asset.farOf?.(A)?.[v]?.data ?? null));
  const OF = (k) => (outlineFar[k] ? Float32Array.from(outlineFar[k]) : null);
  // (a shape's job from its outline's far data at whichever of its levels comes first (the workers reckon it:
  // outlinesAhead), so a shape no plant has come near is baked too; else from its finest level's, as it comes: onBlock)
  const fromOutline = (k) => { const far = OF(k); if (queued[k] || !far) return; const J = { k, far, c0: null, t0: null, of: null, at: levelsOf(far), corners: { views: null }, tiles: null }; queued[k] = 1; out++; waiting.set(k, J); kept(J); };
  // (what a block of one of its levels brings a shape's job: the corners its pictures are drawn from, its cards in their
  // chunks, found from the block itself: a coarser level's cards are a first share of the finest's, the same chunks)
  const capture = (J, b, j, idx, elems, cornersOf) => {
    const chunked = () => chunkOrder(b, j, idx, elems, chunksOfCards(b, j, idx, elems, J.far), J.far[0]);
    if (J.at.views === b.l && !J.corners.views) J.corners.views = cornersOf();
    if (J.far[0] > 0 && J.at.tiles === b.l && !J.tiles) J.tiles = chunked();
    if (b.l === 0 && !J.c0) { J.c0 = cornersOf(); if (J.far[0] > 0) J.t0 = chunked(); }
  };
  // (what the browser kept of a shape, put in as it is read back: only what it has not kept waits to be baked)
  const kept = (J) => keptGet(keptAs(), keyOf(J.k)).then((rec) => {
    if (!rec) return queue.push(J);
    waiting.delete(J.k); views.put(J.k, rec.views); if (rec.clumps && G.clumpLayer[J.k] >= 0) clumpsOf().put(G.clumpLayer[J.k], rec.clumps);
    numbers(J.k, J.far); seenIn(J.k, rec.views); out--;
  }, () => queue.push(J));
  const job = async ({ k, at, corners, tiles, far }) => {
    const key = keyOf(k), B = materials(); B.levelU.value = at.views; B.geo.setIndex(new THREE.BufferAttribute(corners.views, 1)); B.kindU.value = k; B.sphereU.value.set(far[1], far[2], far[3], far[4]);
    const a = await bakers(renderer).views().bake(views, k, A.VIEWS, (r) => { B.rowU.value = r; B.geo.instanceCount = A.VIEWS; return B.view; });
    const nc = far[0];
    let b = null;
    if (nc > 0 && G.clumpLayer[k] >= 0) {
      const T = tiles;   // (its tile level's corners in its chunks' order: chunkOrder)
      for (let c = 0; c < nc; c++) for (let q = 0; q < 4; q++) B.cells[c * 4 + q].set(far[8 + c * 12 + q * 3], far[8 + c * 12 + q * 3 + 1], far[8 + c * 12 + q * 3 + 2], q === 0 ? T.start[c] : q === 1 ? T.count[c] : 0);
      B.nU.value = nc;
      B.levelU.value = at.tiles; cornersInto(B.CL, T.list);
      const per = G.tiles, rows = Math.ceil((nc * 3) / per), most = Uint32Array.from({ length: rows }, (_, r) => { let m = 0; for (let t = r * per; t < Math.min((r + 1) * per, nc * 3); t++) m = Math.max(m, T.count[Math.floor(t / 3)]); return m; });
      b = await bakers(renderer).tiles(per).bake(clumpsOf(), G.clumpLayer[k], rows, (r) => { B.rowU.value = r; B.tgeo.instanceCount = per; B.tgeo.setDrawRange(0, most[r]); return B.tile; });
    }
    return { done: Promise.all([a.done, b?.done]).then(([va, vb]) => { keptPut(keptAs(), key, { views: va, clumps: vb ?? null, far: Array.from(far) }); numbers(k, far); seenIn(k, va); }) };
  };
  return {
    views, clumps: () => clumpsOf(), version: () => version, ready: () => any,
    /** What bakes its pictures: the view's and the tile's meshes, each with its two materials (userData.materials), as
        the start compiles them (tools/smoke.js builds them; a bake makes none other) */
    meshes: () => { const B = materials(); return [B.view, B.tile]; },
    /** A block of a level as it comes (drawer.js blockIn): its finest level's carries each shape's far data, after its
        vertices (where: its numbers' slots 14 and 15); a coarser level's, the corners of each shape whose pictures are
        drawn from it (levelsOf: a stand's levels come finest first, in one message, drawer.js fill) */
    onBlock(b, k0, nk, idx, elems) {
      for (let j = 0; j < nk; j++) {
        const k = k0 + j, cornersOf = () => b.corners.slice(j * idx, j * idx + b.draws[j]);
        fromOutline(k);
        const J = waiting.get(k); if (J) capture(J, b, j, idx, elems, cornersOf);
        if (b.l !== 0 || queued[k]) continue;
        const o = j * elems * 4, at = unhalf(b.verts[o + 7] & 0xffff) * 1024 + unhalf(b.verts[o + 7] >>> 16); if (!(at > 0)) continue;
        const head = new Float32Array(b.verts.buffer, b.verts.byteOffset + (o + at * 8) * 4, 8), far = new Float32Array(b.verts.buffer, b.verts.byteOffset + (o + at * 8) * 4, 8 + head[0] * 12).slice();
        const c0 = cornersOf(), L = levelsOf(far), of = far[0] > 0 ? chunksOfCards(b, j, idx, elems, far) : null, t0 = of && chunkOrder(b, j, idx, elems, of, far[0]);
        const J0 = { k, far, c0, t0, of, at: L, corners: { views: L.views ? null : c0 }, tiles: of && !L.tiles ? t0 : null }; queued[k] = 1; out++; waiting.set(k, J0); kept(J0);
      }
    },
    /** Each frame: the next shape baked, once the levels its pictures are drawn from are in the heap and no other stand's
        is being baked. (A level of it in the heap whose corners came before its finest's, before its pictures' levels
        were known: its pictures drawn from its finest, which is there, never waited for.) */
    pump() {
      if (!shown()) return;   // (after the first frame, in the background: src/core/settle.js shown)
      if (!swept) {   // (once: every shape the browser kept, read back, its far data with it: a start that kept them bakes none)
        swept = true;
        for (let k = 0; k < n; k++) if (!queued[k]) keptGet(keptAs(), keyOf(k)).then((rec) => {
          if (!rec?.far || queued[k]) return;
          queued[k] = 1; views.put(k, rec.views); if (rec.clumps && G.clumpLayer[k] >= 0) clumpsOf().put(G.clumpLayer[k], rec.clumps);
          numbers(k, Float32Array.from(rec.far)); seenIn(k, rec.views);
        }, () => {});
      }
      if (BAKING || !queue.length) return;
      const H = D().H, ready = (J) => {
        if (!J.corners.views && J.c0 && H.has(J.k, J.at.views)) { J.at.views = 0; J.corners.views = J.c0; }
        if (J.far[0] > 0 && !J.tiles && J.t0 && H.has(J.k, J.at.tiles)) { J.at.tiles = 0; J.tiles = J.t0; }
        return !!J.corners.views && H.has(J.k, J.at.views) && (!(J.far[0] > 0) || (!!J.tiles && H.has(J.k, J.at.tiles)));
      };
      const i = queue.findIndex(ready); if (i < 0) return;
      const J = queue.splice(i, 1)[0];
      BAKING = true; waiting.delete(J.k); const fail = (e) => console.warn(`plants: ${G.name}: the far end of shape ${J.k} could not be baked`, e);
      job(J).then(({ done }) => { BAKING = false; done.catch(fail).finally(() => out--); }, (e) => { BAKING = false; fail(e); out--; });
    },
  };
}

/** The things this engine places, as the layers they are placed in (rule.js): the things of one layer that end alike
    (gone at the same level: assets/kit/plant.js bandsOf) and alike have a far end or none are one group, packed and
    drawn together (createStands), their levels cut as one (cutOf); a thing of the layer made otherwise is a group of its
    own, in the same cells. Each kind: its thing of the layer (e: a grown tree, a sapling, a bush, a stone), its shapes,
    where its meshes lie among the group's (offset), the sizes it can have. */
export function groupsOf(rows) {
  const by = new Map();
  for (const L of layersOf(rows)) for (const e of L.entries) {
    const { row, asset: a } = e, P = a.placement, ends = row.detail.levels.length, far = !!a.far;
    const key = [L.k, ends, far].join('|');
    if (!by.has(key)) by.set(key, { key, name: `${a.kind}s, ${L.name}`, L, fade: row.detail.fade, sink: row.detail.sink, ends, kinds: [] });   // (named by its first kind)
    // the sizes a plant of it can have: its youngest and its oldest (by its growth: a sapling's, its first stages'), or its scale's
    const H = a.size.height, GR = a.growth, wide = sizeOf(a) / H, n = e.shapes[1], last = GR?.stages.filter((S) => S.offset < n).at(-1);
    const lo = (GR ? GR.stages[0].hFrom * P.scale[0] : H * P.scale[0]) * wide, hi = (GR ? Math.max(...a.heights.slice(0, n)) * (last.hTo / last.h) * P.scale[1] : H * P.scale[1]) * wide;
    by.get(key).kinds.push({ row, asset: a, e, shapes: n, wide, bases: Array.from({ length: n }, (_, i) => baseShare(a, i)), age: e.ages, ageScale: grovesOf(e.biome, L).clumps * 2.5, lo, hi, round: (a.size.length / 2) * P.scale[1] * (hi / (H * P.scale[1] * wide)) });
  }
  const groups = [...by.values()].map((G) => offsets(cutOf({ ...G, kinds: G.kinds.sort((x, y) => x.e.i - y.e.i) }))), most = Math.max(0, ...groups.map((G) => G.meshes));
  return groups.map((G) => ({ ...G, most }));   // (most: the shapes the largest group has: basesOf)
}
const offsets = (G) => { let at = 0; return { ...G, kinds: G.kinds.map((Kd) => { const k = { ...Kd, offset: at }; at += Kd.shapes; return k; }), meshes: at }; };
/** A group's levels cut as one: its kinds' own (everything's levels, src/detail/error.js rungPx), each run of them in
    which every shape of every kind holds the same (its room: assets/kit/tree.js crowdRooms; a crowd whole above where
    it thins, nothing but its numbers where its impostor is all) one level, the last down to where its last kind is
    gone; its patches as large as its band asks (patchOf). Every kind's levels are then the group's (Kd.levels, rooms). */
function cutOf(G) {
  const own = G.kinds[0].row.detail.levels, R = G.kinds.map((Kd) => Kd.asset.crowdRooms(atlases()).slice(0, Kd.shapes)), runs = [];
  const alike = (l) => R.every((rooms) => rooms.every((r) => r[l][0] === r[l + 1][0] && r[l][1] === r[l + 1][1]));
  for (let l = 0; l < own.length; l++) { if (runs.length && alike(l - 1)) runs.at(-1).to = l; else runs.push({ from: l, to: l }); }
  const end = Math.min(...G.kinds.map((Kd) => Kd.row.detail.levels.at(-1).lo));
  const sHi = Math.max(...G.kinds.map((k) => k.hi)), K = pxKMost();   // (at the most pixels the screen can draw: its patches hold the band then too)
  const levels = runs.map(({ from, to }, i) => { const lo = to === own.length - 1 ? end : own[to].lo, hi = own[from].hi; return { lo, hi, from, P: patchOf(G.L.cell, (sHi * K * Math.exp(G.fade)) / lo) }; });
  return { ...G, n: levels.length, kinds: G.kinds.map((Kd, k) => ({ ...Kd, levels, rooms: R[k].map((r) => levels.map((L) => r[L.from])) })) };
}
/** A level's patch (cells a side, of cells `cell` metres): a tenth of the round its band reaches (`reach` metres), and
    never under four. It says only how far the camera may move before the level packs again, a sixteenth of it, and the
    pad its band keeps for that (src/detail/handover.js padOf); what the level looks at is its region tree's
    (src/scatter/regions.js), however far its band reaches. */
const patchOf = (cell, reach) => Math.min(256, Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, (0.105 * reach) / cell)))));

/** At a start with nothing kept of a tree kind's rooms (assets/kit/tree.js crowdRooms): its outline and its rooms
    reckoned by the recipes' workers, a job a kind, side by side and beside the rest of the start, and taken by its asset
    as if kept (takeOutline), before the stands are made (src/boot.js). The page's thread builds none of their meshes: it
    built every kind's finest and reckoned its crowd, 2.9 of the scatter stage's 5 s (2026-11-19, the master's loadMs).
    A promise, once every kind is in; a kind its worker could not reckon is reckoned on the page, as before. world:
    whether the start makes the world's stands (the library's stage makes them when a subject asks: nothing ahead). */
export function outlinesAhead(world = true) {
  const A = world ? atlases() : null, kinds = world ? recipes('asset').filter((a) => a.outlineFor && !a.roomsKnown(A)) : [];
  if (!kinds.length) return Promise.resolve();
  const ask = pool(), plain = { ...A };
  return Promise.all(kinds.map((a) => ask([['outline', a.uid, plain]]).then(([o]) => a.takeOutline(A, o), (e) => console.warn(`plants: the workers could not reckon '${a.name}': reckoned here`, e))));
}

/** Everything this engine places: for every stand a drawer of its own kinds (drawer.js: a heap of their shapes at their
    levels) and a tier a level of detail, each where a plant of it is the size on screen its kind asks, a draw a
    shape (its corners the draw's own list); and, for the kinds that cast, a stand-in drawn only into the shadow map (layer 1):
    every tree round the camera by its shade, the shade of a crown at a fraction of its finest cards' cost. What a
    stand costs to start and to draw is its levels', not its kinds': a new kind adds its meshes' bytes. */
export function createStands(scene, tex, ground, rows, gpu = false, renderer = null) {
  const tiers = [], solids = [], drawers = [];
  if (!gpu) return tiers;   // (without WebGPU nothing of the heap can be drawn: no plants there)
  const A = atlases();   // (what the far ends' atlases are sized by: every level's band hands it to the workers' crowd kit)
  const Z = placedBy('trees'), famOf = (uid) => Z.families.find((F) => F.F.asset === uid);
  // the growth map (growth.js): what each layer that writes leaves for the layers after it, worked out round the camera
  // before anything packs (tiers.before), the largest layer first; as far as what reads it is drawn: a layer that reads
  // it as far as its largest thing is gone by the one measure (a sapling as large as it grows there: its entry's
  // grownTo), the meadow (which reads every layer's) as far as its blades. At the most pixels the screen can draw, the
  // dial at rest: the map is a capacity (src/detail/measure.js farMost; the meadow's end its own, grass.js bandsOf)
  const layers = layersOf(rows), words = layers.filter((L) => L.word >= 0).length;
  const blades = Math.max(0, ...recipes('asset').filter((a) => a.placement?.engine === 'grass').map((a) => ringBands(ringsOf(a), a.height, pxKMost()).end));
  const readFar = (W) => Math.max(blades, ...layers.filter((L) => L.reads.includes(W)).map((L) => Math.max(...L.entries.map((e) => farMost(goneOf(e.asset), sizeOf(e.asset) * e.grownTo)))));
  const M = words ? createGrowth(renderer, layers.filter((L) => L.word >= 0).map((L) => ({ band: L.band, far: readFar(L) }))) : null;
  if (M) M.build(writersOf(layers, M));
  for (const G of groupsOf(rows)) {
    G.M = G.L.reads.length ? M : null;
    const lost = G.kinds.filter((Kd) => !famOf(Kd.asset.uid)); if (lost.length) { console.warn(`plants: no family of the zoo brings the shapes of ${lost.map((Kd) => `'${Kd.asset.name}'`).join(', ')} (assets/zoo)`); continue; }
    const { L } = G, n = G.n, make = plantMaterial(tex, G);
    const sLo = Math.min(...G.kinds.map((k) => k.lo)), sHi = Math.max(...G.kinds.map((k) => k.hi)), round = Math.max(...G.kinds.map((k) => k.round));
    // of the stand's kinds those that cast and have a shade; their shades lie in the heap as one more level, after the stand's own
    const casting = G.kinds.filter((Kd) => Kd.asset.detail.shadow && Kd.row.detail.casts), SHL = casting.length ? n : -1;
    const SH = casting.length ? { far: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.far)), wide: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.wide ?? 2.4)), reach: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.reach ?? 20)) } : { far: 1, wide: 1, reach: 0 };
    // the stand's levels as the drawer takes them: where each ends on screen and what it holds (its kinds' levels cut as
    // one: cutOf; the workers build each by its band, `crowd`, the shade by `'shade'`) and the room a shape of any of its
    // kinds needs there (its shade's: its file says, `most`, its vertices and triangles)
    const roomOf = (get) => ({ verts: Math.max(1, ...G.kinds.map((Kd) => get(Kd)?.[0] ?? 0)), tris: Math.max(1, ...G.kinds.map((Kd) => get(Kd)?.[1] ?? 0)) });
    // (and each shape's own, by its kind's file: a heap place as large as its own, not the largest kind's)
    const shapeKd = []; for (const Kd of G.kinds) for (let v = 0; v < Kd.shapes; v++) shapeKd[Kd.offset + v] = Kd;
    const roomsOf = (get) => shapeKd.map((Kd) => ({ verts: Math.max(1, get(Kd)?.[0] ?? 0), tris: Math.max(1, get(Kd)?.[1] ?? 0) }));
    // (a level of the crowd kit's is as large as its first share of the shape: its kind's file says nothing of it,
    // assets/kit/tree.js crowdRooms, at the top of each of the stand's levels: cutOf)
    const crowdRoom = (v, i) => { const Kd = shapeKd[v]; return Kd.rooms[v - Kd.offset][i]; };
    const roomAt = (i) => ({ room: { verts: Math.max(1, ...shapeKd.map((_, v) => crowdRoom(v, i)[0])), tris: Math.max(1, ...shapeKd.map((_, v) => crowdRoom(v, i)[1])) }, rooms: shapeKd.map((_, v) => ({ verts: crowdRoom(v, i)[0], tris: crowdRoom(v, i)[1] })) });
    const LEVELS = [...G.kinds[0].levels.map((l, i) => ({ px: l.lo, crowd: { band: [l.lo, l.hi], atlas: A }, ...roomAt(i) })), ...(SHL >= 0 ? [{ px: 1e-3, crowd: 'shade', room: roomOf((Kd) => Kd.asset.detail.shadow?.most), rooms: roomsOf((Kd) => Kd.asset.detail.shadow?.most) }] : [])];
    // each shape's far end as the crowd kit reckons it (assets/kit/tree.js farOf): a layer of its clumps' atlas for each
    // shape that has clumps (G.clumpLayer), as many tiles a row as its largest clumps need (G.tiles)
    const FE = shapeKd.map((Kd, v) => Kd.asset.farOf?.(A)?.[v - Kd.offset] ?? { chunks: 0 });
    G.clumpy = 0; G.tiles = Math.max(1, Math.ceil(Math.sqrt(3 * Math.max(0, ...FE.map((f) => f.chunks)))));
    G.clumpLayer = Int32Array.from(FE, (f) => (f.chunks > 0 ? G.clumpy++ : -1));
    // what each of the stand's shapes is to the material (numbersOf), five rows of four a shape, in the drawer's one
    // table of a kind's numbers (numOf): [how tall, its tint], [its wind], [its leaves], [its twig's painting, its size at
    // scale 1 (its packed size over this is its scale), T: the most pixels drawn it is its impostor at (0: none yet:
    // farOf), its clumps' layer], [its impostor's sphere]; and the zoo's number of each (its family's first, and of its
    // shapes one)
    const numbers = (G.numbers = new Float32Array(G.meshes * 20)), KINDS = [];
    for (const Kd of G.kinds) for (let v = 0; v < Kd.shapes; v++) { const N = numbersOf(tex, Kd.row, v); numbers.set([N.hk, ...N.tint, ...N.wind, ...N.leaf, N.twig, sizeAtOne(Kd.asset, v, !!(Kd.asset.growth && Kd.age)), 0, Math.max(0, G.clumpLayer[Kd.offset + v])], (Kd.offset + v) * 20); KINDS.push(Z.first + famOf(Kd.asset.uid).first + v); }
    G.KS = Float32Array.from({ length: G.meshes }, (_, j) => numbers[j * 20 + 13]);   // (each shape's size at scale 1, as the GPU reads it: what its bodies are scaled by)
    // a vertex of the draw as the material takes it: of the plant's own mesh at heap level `lv` (which it is: B.y; its
    // shade: its seed, B.w), unpacked, with its kind's numbers
    const feedOf = (lv, at) => {   // (at: where the draw's vertex lies, the drawer's: drawer.js atOf)
      const level = uniform(lv, 'uint').onObjectUpdate(({ object }) => object?.userData?.heapLevel ?? lv);   // (the level the mesh drawing it is of: one material for all its levels, src/scatter/drawer.js)
      return {
        vertex: (B) => {
          const kind = uint(B.y.add(0.5)), R = heapRow(D.H, kind, level).toVar(), P = at(R), e = R.y.add(P.vertex.mul(uint(2))), r0 = D.numOf(kind, 0).toVar(), r3 = D.numOf(kind, 3).toVar();
          const e0 = D.H.elems.element(e).toVar(), e1 = D.H.elems.element(e.add(uint(1))).toVar();
          // (a level of the crowd kit's, every level but the shade: its shape's numbers in the two elements before its vertices)
          const crowd = lv < n ? { crowd: crowdOfElems(e0, e1, ruleOf(D.H.elems.element(R.y).toVar(), D.H.elems.element(R.y.add(uint(1))).toVar()).map((r) => r.toVar())) } : {};
          return { ...plantOf(e0, e1), Hk: r0.x, Tn: r0.yzw, Wd: D.numOf(kind, 1).toVar(), Lf: D.numOf(kind, 2).toVar(), Tw: r3.x, Ks: r3.y, Tf: G.far ? r3.z : float(0), Cl: r3.w, shade: seedOf(B), drawn: P.drawn, ...crowd };
        },
      };
    };
    // its far ends (farOf): where its kinds have far ends (assets/kinds.js `far`), each shape's impostor and its clumps,
    // baked on the GPU as its finest level comes; packed into the impostors' draw where they show (wants: and its own
    // while it may still show, the camera moving a sixteenth of a patch between two packings)
    G.far = G.kinds.some((Kd) => Kd.asset.far) ? farOf(renderer, tex, G, () => D) : null;
    const far = G.far && {
      // (its mesh from where its impostor's error would be seen down to where every plant has handed over, the BAND
      // under; its impostor from where it may come; each a fifth wider either way while the camera moves between packings)
      wants: (kind, rows) => { const R3 = D.numOf(kind, 3), T = R3.z, r = ratioOf(T, pxOf(rows[0].w, rows[0].xy), R3.y); return { mesh: T.lessThanEqual(0).or(r.greaterThan(0.8 / BAND)), far: T.greaterThan(0).and(r.lessThan(1.25)) }; },
      material: (src) => impostorMaterial(G, () => D, { mesh: true }, src),   // (its level as each mesh tells it: make.levelOf)
      version: () => `${G.far.version()}|${measureVersion()}`, ready: G.far.ready,   // (packed again when one comes, or the measure changes: wants reads it)
    };
    const D = createDrawer(scene, renderer, tex, {
      name: `plants, ${G.name}`, LEVELS, SHADE: { ...SH, shrink: 1 }, SMOOTH: uniform(1),
      // (boxOf: a mesh's box as its family measured it, metres at scale 1 (assets/kit/plant.js), in its shape's sizes and
      // as far as it leans: its stand's lean moves a point sideways by its height, at most the lean of its wind's numbers)
      make: { per: 2, onBlock: G.far?.onBlock, far, numbers: { rows: 5, of: (k) => numbers.subarray(k * 20, k * 20 + 20) }, boxOf: (k, b) => { const K = G.KS[k] || 1, L = numbers[k * 20 + 5] * Math.max(Math.abs(b[1]), b[4], 0); return [(b[0] - L) / K, b[1] / K, (b[2] - L) / K, (b[3] + L) / K, b[4] / K, (b[5] + L) / K]; }, material: (src, i, shadow, at) => { const { m, shape, slot } = make(shadow ? null : { mesh: true }, feedOf(i, at)); m.vertexNode = Fn((builder) => shape(src.readAt(0, slot), src.readAt(1, slot), passOf(builder)))(); return m; },
        // (what a level's meshes tell its material (mesh.userData.Lv, src/scatter/drawer.js); and how a level's material is
        // made other than by its numbers: its crowd's levels alike, the shade (no crowd: feedOf) its own)
        levelOf: (i) => (i < n ? { lo: G.kinds[0].levels[i].lo, hi: G.kinds[0].levels[i].hi, first: i === 0, last: i === n - 1 } : null), alike: (i) => (i < n ? 'crowd' : 'shade') },
      // (what the browser keeps of it is good while its recipes and their rooms are what they were: registry.json's versions)
      zoo: { kinds: KINDS, ALL: G.meshes, fingerprint: () => `plants 6|${G.kinds.map((Kd) => `${Kd.asset.uid}@${versionOf(Kd.asset.uid)}`).join()}|${LEVELS.map((l) => `${l.px}:${l.room.verts}:${l.room.tris}`).join()}|${A.key}` },   // (and the atlases' numbers its far ends are built for)
    });
    D.crowded = n; D.far = G.far; drawers.push(D);   // (its first n levels are the crowd kit's: their counts hold the shape's numbers too)
    // what of it is solid (src/world/bodies.js): every plant of the stand round the walker, whatever its kind and size
    // (standBodies); a stand none of whose plants can stop a walker (what lies lower than his shin, leaves lower than
    // his knee) packs none
    if (G.kinds.some((Kd) => Array.from({ length: Kd.shapes }, (_, v) => bodyOf(KINDS[Kd.offset + v])).some((B) => B.shapes.some((S) => topOf(S) * Kd.asset.placement.scale[1] - FOOT > (S.pass ? Math.max(0.55, S.from ?? 0) : 0.3))))) solids.push(standBodies(G, KINDS, ground, renderer));
    // a tier: its cells worked out once for every kind in it, each plant that is of its level packed into its shape's
    // draw. g: the group it packs (the stand's, or of its kinds those that cast). Its levels pack by one piece of code,
    // compiled once (the drawer's kind of tier: one place for them all, the shadow's stand-in another), each telling
    // its own numbers before it packs (table)
    // (seen.r: a crown's reach, and how far the camera may move before the packing is made again: a level's)
    const seen = { r: uniform(0), high: uniform(sHi) }, places = new Map();   // (high: a uniform, so the stands differing only in it pack by one pipeline)
    const placeOf = (g, shadow) => { if (!places.has(g)) places.set(g, (c, { band }, found) => plantIn(c, g, band, shadow, shadow ? null : seen, found)); return places.get(g); };
    const tier = (i, g, shadow = false) => {
      // (P: its level's patch, which says how far the camera may move before it packs again: a sixteenth of it. What it
      // looks at is its region tree's, however far its band reaches: src/scatter/regions.js)
      const P = shadow ? 4 : G.kinds[0].levels[i].P;
      const t = D.tier(i, {
        cell: L.cell, P, sizes: [sLo, sHi], fade: G.fade, shadow,   // (as many as it finds it holds: its store and its buckets from its own count, src/scatter/tier.js)
        casts: !shadow && i === 0 && g.kinds.some((Kd) => Kd.row.detail.casts && !Kd.asset.detail.shadow),   // without a stand-in the near ones cast, as drawn (src/world/shadow.js)
        place: placeOf(g, shadow), thing: `plants:${G.name}`,   // (a plant's own state: its stand and its cell, src/world/things.js)
        table: shadow ? null : () => { seen.r.value = round + (L.cell * P) / 16 + 2; },   // (the cells are worked out again every sixteenth of a patch)
        extra: shadow ? { cull: SH.reach, fixed: SH.far * SH.wide } : {},   // (the stand-in in small patches: those whose shade cannot reach the view are dropped)
      });
      t.viewKeyed = !shadow; t.asset = G.name; t.drawer = D; tiers.push(t);
      if (G.M) t.reads = G.M.version;   // (packed again when the growth map under it changes)
      return t;
    };
    for (let i = 0; i < n; i++) tier(i, G);
    if (SHL >= 0) {
      // the stand-in: every casting tree round the camera, its shade drawn for the light only
      tier(SHL, { ...G, kinds: casting }, true);
    }
  }
  // each frame: the stands' meshes until they are in (read back from the browser, or made by the workers); what is solid;
  // the next shape's far end baked (farOf)
  const fars = drawers.map((D) => D.far).filter(Boolean);
  tiers.before = M ? (x, z, world) => M.update(x, z, world) : null;   // (src/scatter/index.js: before any tier packs)
  if (M) tiers.compile = M.compile;
  tiers.solid = (renderer) => { for (const D of drawers) D.start(); for (const f of solids) f(renderer); for (const F of fars) F.pump(); };
  tiers.bakes = () => fars.flatMap((F) => F.meshes());   // (what bakes the far ends, drawn by no tier: src/scatter/index.js bakes)
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
        t.meshes.forEach((m, k) => { const n = m.visible ? a[k * 5 + 1] : 0, kind = t.kindOf(k); T.plants += n; T.corners += n * a[k * 5]; if (kind >= 0) T.verts += n * Math.max(0, D.H.count(kind, t.level) - (t.level < D.crowded ? 1 : 0)); else if (k === t.farDraw) T.verts += n * 4; });   // (a crowd level's count holds its shape's numbers too, one vertex; an impostor is four)
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
  const { L } = G, P = Math.max(1, Math.round(12 / L.cell)), n = Math.ceil((2 * REACH) / (L.cell * P)) + 2, at = uniform(new THREE.Vector2()), band = { near: uniform(-1), far: uniform(REACH), at };
  const live = (c) => {
    const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar();
    plantIn(c, G, band, true, null, (which, size, dist, fill) => { fill(A, B); alive.assign(1); });
    return { alive: alive.greaterThan(0.5), data: [A, B] };
  };
  const g = new THREE.BufferGeometry(); g.setIndex([0, 0, 0]); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const T = new Tier(NOWHERE, g, () => new THREE.NodeMaterial(), { cell: L.cell, P, near: 0, far: REACH, live, gpu: true, cap: Math.min(65536, n * n * P * P), slots: 2, cull: false, fixed: REACH });
  T.step = 2; T.label(`plants, ${G.name}: bodies`);   // (its packing asked by its name: src/core/compile.js, tools/census.js)
  const grid = bodyGrid(Math.max(4, L.cell)), tag = G.key.slice(0, 48);
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
        if (body.shapes.some((S) => !S.pass || !S.from || topOf(S) * s - FOOT >= S.from)) grid.put({ id: `${tag}:${Math.round(A[k] * 8)}:${Math.round(A[k + 1] * 8)}`, thing: idOf(`plants:${G.name}`, Math.floor(A[k] / L.cell), Math.floor(A[k + 1] / L.cell)), x: A[k], z: A[k + 1], y: A[k + 2], up: -FOOT, yaw: B[k], s, kind, body });   // (thing: its stand and the cell it stands in)
      }
    }).catch((e) => { was = ''; if (!warned) { warned = true; console.warn(`plants: what stands round the walker could not be read back (${G.name}): it is not solid`, e); } }).finally(() => (busy = false));
  };
}

/** One plant on its own, in the stands' material (its bark, its leaves, its wind), for the asset library's stage and
    list: its foot at (x, y, z), scale s, of its shapes the one asked, as the crowd kit draws it: every size on screen
    from one mesh (its whole crowd, its last parts kept: it wears no clumps and has no impostor), the one rule moving it by its size on screen
    as the camera comes and goes; its last sizes sinking as its farthest level does. px: its size on screen told, a
    node (pixels): it is then drawn as the game draws it at that size (the measure's: tools/stick.js). Built on the page
    (a tenth of a second and more for a tree). */
export function treeSample(tex, row, x = 0, y = 0, z = 0, s = 1, form = 0, px = null) {
  // (its whole crowd as one mesh, its last parts kept: it wears no clumps and has no impostor, it is seen near)
  const a = row.asset, S = crowdOf(a, form, atlases()), M = crowdLevelOf(S, 0, Infinity, { keep: true, clumps: false }), g = new THREE.BufferGeometry();
  const four = (f) => { const a = new Float32Array(M.count * 4); for (let v = 0; v < M.count; v++) a.set(f(v), v * 4); return new THREE.BufferAttribute(a, 4); };
  for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2], ['cn', 3], ['root', 3]]) g.setAttribute(k, new THREE.BufferAttribute(M[k], w));
  g.setAttribute('partAo', four((v) => [M.part[v], M.ao[v], M.twig[v], 0]));
  g.setAttribute('tipGo', four((v) => [M.tip[v * 3], M.tip[v * 3 + 1], M.tip[v * 3 + 2], M.go[v]]));
  g.setIndex(new THREE.BufferAttribute(M.index, 1));
  const B = bandsOf(a), lo = B.at(-1)[0];
  const { m, shape } = plantMaterial(tex, row.detail)({ lo, hi: Infinity, first: true, last: true }, null, px);
  m.vertexNode = Fn((builder) => shape(vec4(x, z, y, s * sizeAtOne(a, form)), vec4(0.4, 0, 1.3, Math.PI), passOf(builder)))();   // (its pass: the prepass and the shadow map work out no light at its corners)
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
  row: (a) => scatterRow(a),
  createAll: createStands,   // all of its assets at once: they share their stands' tiers
  // the library: a tree of seventy for the list; on the stage one at an age (its growth: assets/kit/tree.js), or every
  // stage of its growth in a row, youngest to oldest; from another seed, the same kind grown again
  thumb(tex, row) {
    const a = row.asset, G = a.growth?.at(70), h = G ? G.height : a.size.height;
    return { things: [treeSample(tex, row, 0, 0, 0, G?.s ?? 1, G?.shape ?? 0)], eye: [h * 1.1, h * 0.7, h * 1.5], look: [0, h * 0.5, 0] };
  },
  stage(tex, row0, { x, z, heightAt, seed = null, age = 70, all = false }) {
    const a0 = row0.asset, a = seed != null && seed !== a0.placement.seed && a0.regrow ? regrown(a0, seed) : a0, row = a === a0 ? row0 : scatterRow(a), G = a.growth;
    const one = (X, Z, t) => treeSample(tex, row, X, heightAt(X, Z) - 0.1, Z, t?.s ?? 1, t?.shape ?? 0);
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

