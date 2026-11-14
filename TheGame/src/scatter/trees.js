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
import { Fn, float, int, uint, vec2, vec3, vec4, uniform, varyingProperty, attribute, positionGeometry, storage, vertexIndex, If, Discard, abs, max, mix, smoothstep, pow, normalize, length, floor, cos, sin, clamp, log, sqrt, fract, step } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, vnoise, camDist, riverInfo, heightAt, shareOf, groveAt, leadAt } from '../world/land.nodes.js';
import { kindsOf, whereOf } from '../world/stand.js';
import { toScreen, airOf, skyLight, weatherOn, snowLiftAtVertex, cloudAtVertex, unlit, windAt, windDir, windStrength, stillness } from '../world/light.js';
import { PLACES } from '../../world/places.js';
import { recipe, versionOf } from '../core/registry.js';
import { geometryOf, scatterRow } from '../../assets/index.js';
import { kindOf } from '../../assets/kinds.js';
import { pxK, sizeOf, most } from '../detail/index.js';
import { levelOf, handOver, partGrown, sinkInto } from '../detail/handover.js';
import { offScreen, clipOf, MAXP } from './tier.js';
import { createDrawer } from './drawer.js';
import { heapRow } from './heap.js';
import { plantOf } from './plantvert.js';
import { placedBy } from '../../assets/zoo/index.js';
import { inView } from './view.js';
import { setTrunks } from '../world/trunks.js';
import { wayAt } from '../world/ways.js';

const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));

// 1 where a tree may stand, 0 within what stands at a place (its clearing) or on the library's stage
const clearAt = (p) => {
  let c = float(1);
  for (const P of Object.values(PLACES)) c = c.mul(smoothstep(P.clear + 2, P.clear + 6, length(p.sub(vec2(P.x, P.z)))));
  return c.mul(U.uStage.z.greaterThan(0).select(smoothstep(U.uStage.z.add(1), U.uStage.z.add(5), length(p.sub(U.uStage.xy))), float(1)));
};

/** A biome's stand of trees, as a kind of tree that grows there takes it: the biome's own (its `trees`: one grid of cells
    for every kind, how thick it grows, its groves, the patches where one kind or another leads, its ages, its seed);
    what the biome leaves out, the tree's own placement gives (a tree that stands alone in a biome with no stand of its own). */
export const standOf = (asset, biome = recipe(asset.placement.biome)) => {
  const P = asset.placement, B = biome?.[P.stand ?? 'trees'] || {};
  return { cell: B.cell ?? P.cell ?? 10, density: B.density ?? P.density ?? 1, clumps: B.clumps ?? P.clumps ?? 0, patches: B.patches ?? 0, age: P.age ?? B.age ?? null, seed: B.seed ?? P.seed ?? 300, where: B.where ?? null, size: B.size ?? null };
};

// what stands in a cell: a plant, or nothing. Where one stands, `found` is told (the drawer's: drawer.js tier): which
// it is (its kind's, and of its kind's shapes one: its number among the stand's), how large, how far; the drawer says
// whether it is of the tier's level, and it is then packed into two vec4 (A: x, z, its foot's height, its scale; B: its
// turn, its sway's phase, which it is and its shade (the whole number and what follows it), its size in metres: its
// largest side). Done once per cell for the whole stand (src/scatter/tier.js); the cheap tests first, as most cells hold none.
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
  const range = all ? length(pos.sub(U.uCam.xz)) : dist;   // the shadow's stand-in: metres round the camera, whatever the lens
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
    If(r0.lessThan(shareOf(biome, { p: pos, dist, d: float(1e5), w: float(1), b: float(0) }).mul(dens)), () => {   // its stands, as if far from the river
      const I = riverInfo(pos), d = abs(I.x), w = I.y;
      If(r0.lessThan(shareOf(biome, { p: pos, dist, d, w, b: I.z }).mul(dens).mul(clearAt(pos))), () => {
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
                const t = clamp(log(max(age, S.from).div(S.from)).div(Math.log(S.to / S.from)), 0, 1), hh = mix(S.hFrom, S.hTo, t);
                h.assign(hh.mul(own)); s.assign(hh.div(S.h).mul(own)); which.assign(floor(rnd(cx, cy, h0(309)).mul(S.variants)).add(S.offset + Kd.offset));
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
          A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(0.15), s));
          B.assign(vec4(rnd(cx, cy, h0(305)).mul(6.2831853), rnd(cx, cy, h0(306)).mul(6.2831853), which.add(rnd(cx, cy, h0(307)).mul(0.999)), size));
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
const numbersOf = (tex, row, shape = 0) => {
  const a = row.asset, M = a.materials || {}, F = { wrap: 0.45, through: 0.55, flutter: 1, ...kindOf(a, 'foliage') };   // (its own `foliage` over its kind's)
  return { hk: a.heights?.[shape] ?? a.size.height, wind: [kindOf(a, 'wind')?.sway ?? 0, a.placement.lean ?? 0, F.flutter, row.snow.clumps], leaf: [F.wrap, F.through, tex.layer(M.leaves ?? M.needles ?? M.wood), tex.layer(M.wood ?? M.leaves ?? M.needles)], tint: F.tint ?? [1, 1, 1] };
};
// (the library's plant, a mesh of its own: the same numbers on the mesh, its userData)
const wear = (mesh, tex, row, shape = 0) => {
  const N = numbersOf(tex, row, shape);
  Object.assign(mesh.userData, { hk: N.hk, wind: new THREE.Vector4(...N.wind), leaf: new THREE.Vector4(...N.leaf), tint: new THREE.Vector3(...N.tint) });
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
  return (Lv = null, feed = null) => {
    const slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);
    const own = feed ? null : { Hk: ofMesh('hk', 1, 'float'), Wd: ofMesh('wind', new THREE.Vector4(0, 0, 1, 0.3)), Lf: ofMesh('leaf', new THREE.Vector4(0.45, 0.55, 0, 0)), Tn: ofMesh('tint', new THREE.Vector3(1, 1, 1)) };
    const vertexOf = (B) => (feed ? feed.vertex(B) : { position: positionGeometry, normal: attribute('normal', 'vec3'), uv: attribute('uv', 'vec2'), part: attribute('part', 'float'), ao: attribute('ao', 'float'), cn: attribute('cn', 'vec3'), root: attribute('root', 'vec3'), hand: attribute('hand', 'vec2'), shade: B.z, ...own });
    const LU = Lv && levelOf(Lv, D.fade);
    // what a pixel needs: where on its texture, and the light, the snow and the air already worked out at its corners
    // (vMul: what its texture's colour is multiplied by; vAdd: what is added: the snow on it, the air before it), so a
    // pixel reads its texture and is done. A crown is many cards deep: its pixels are many more than its corners.
    const vUv = varyingProperty('vec2', 'tUv'), vMul = varyingProperty('vec3', 'tMul'), vAdd = varyingProperty('vec3', 'tAdd');
    const vStill = varyingProperty('float', 'tStill');   // (built over time: how still it is in the wind, src/world/light.js stillness)
    const vPart = varyingProperty('float', 'tPart'), vCut = varyingProperty('vec2', 'tCut');   // vCut: the needles' cut, and how far a card is from edge-on
    const vLay = varyingProperty('vec2', 'tLay');   // (the layers of its leaves' and its wood's textures: its kind's)
    const shape = (A, B) => {
      const clip = offScreen().toVar();
      const drawn = () => {
        // part: 0 its wood, 1 a sprig's card, 2 its crown as one body (its farthest level: assets/kit/tree.js)
        const V = vertexOf(B), part = V.part, body = step(1.5, part);
        const shown = float(1).greaterThan(0).toVar(), grown = float(1).toVar(), sunk = float(1).toVar();
        if (Lv) {
          // its size on screen now, as its cell reckoned it (its largest side, B.w), and from it the one hand-over
          // (src/detail/handover.js): its sprigs part by part, its wood whole, its last level sinking
          const H = handOver(B.w.mul(PXK).div(max(camDist(A.xy), 1e-3)), LU, D.sink);
          grown.assign(mix(float(1), partGrown(H, V.root, body, V.hand), step(0.5, part))); sunk.assign(H.sunk);
          shown.assign(H.there.and(part.greaterThan(0.5).or(H.whole)));
        }
        If(shown, () => { clip.assign(stand(A, B, V, grown, sunk)); });
      };
      drawn();
      return clip;
    };
    const stand = (A, B, V, grown, sunk) => {
      const part = V.part, ao = V.ao, card = float(1).sub(abs(part.sub(1))), body = step(1.5, part), Hk = V.Hk, sway = V.Wd.x, leans = V.Wd.y, flutters = V.Wd.z, clumps = V.Wd.w, wrap = V.Lf.x, shines = V.Lf.y, Tn = V.Tn;
      const s = A.w, cs = cos(B.x), sn = sin(B.x), turn = (v) => vec3(v.x.mul(cs).sub(v.z.mul(sn)), v.y, v.x.mul(sn).add(v.z.mul(cs)));
      // (a sprig grown from its foot, the crown's body from its middle; the whole plant sunk)
      const g0 = Lv ? sinkInto(mix(V.root, V.position, grown), sunk) : V.position;
      const lean = vec2(cos(B.y), sin(B.y)).mul(V.shade.sub(0.5).mul(leans.mul(2))), lp = g0.add(vec3(lean.x, 0, lean.y).mul(g0.y)), up = clamp(lp.y.div(Hk), 0, 1);   // each leans its own way
      // the wind: the crown sways, the foot stays (the push grows with height squared), a slow sway of its own (from a
      // breeze up); and its sprigs swing in the wind, each as one from its foot, its tip most (a card's corners share its
      // plane, cn: one phase a card; uv.y: 0 at its foot), quicker and wider the harder it blows. In a calm all of it is
      // still: a sway of millimetres is no motion to the eye, only leaves' edges creeping by parts of a pixel (a shimmer)
      const push = windAt(A.xy), ws = windStrength;
      const kk = push.mul(up.mul(up).mul(sway).mul(s)).add(vec2(sin(U.uTime.mul(0.9).add(B.y)), cos(U.uTime.mul(0.7).add(B.y))).mul(up.mul(up).mul(ws.mul(0.05).add(smoothstep(0, 0.08, ws).mul(0.008))).mul(s)));
      const cardN = V.cn, flutter = sin(U.uTime.mul(ws.mul(5).add(1.6)).add(cardN.dot(vec3(12.9, 78.2, 37.7))).add(B.y)).mul(ws.mul(0.14)).mul(card).mul(V.uv.y.min(1)).mul(flutters);
      const w = vec3(A.x, A.z, A.y).add(turn(lp.mul(s))).add(vec3(kk.x.add(windDir.x.mul(flutter)), flutter.mul(0.4), kk.y.add(windDir.y.mul(flutter)))).toVar();
      vUv.assign(V.uv); vPart.assign(part); vLay.assign(V.Lf.zw);
      vStill.assign(stillness(up.mul(up).mul(sway).mul(s).add(card.mul(V.uv.y.min(1)).mul(flutters).mul(0.8)), w));   // (its crown's sway, and a sprig's own swing)
      const toEye = U.uCam.sub(w), far = length(toEye), Ve = toEye.div(max(far, 1e-3));
      // the needles' outline: far off a mip's needles are fainter, so the cut lowers with them and the crown stays full;
      // a card seen edge-on is a flat sliver, not a brush: it fades as it turns away
      // … and foliage right at the eye is let go (walking through a low crown, no card fills the picture)
      vCut.assign(vec2(mix(0.45, 0.16, smoothstep(15, 220, far)), max(smoothstep(0.06, 0.42, abs(normalize(turn(cardN)).dot(Ve))), body).mul(smoothstep(0.35, 1.3, far))));
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
        const tint = leaf.select(mix(vec3(1.07, 1.0, 0.78), vec3(0.86, 0.98, 1.1), B.y.mul(1.1631).fract()).mul(V.shade.mul(0.3).add(0.84)).mul(Tn), vec3(1));
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
    const LEVELS = [...G.kinds[0].levels.map((l, i) => ({ px: l.lo, room: roomOf((Kd) => Kd.levels[i].most) })), ...(SHL >= 0 ? [{ px: 1e-3, room: roomOf((Kd) => Kd.asset.detail.shadow?.most) }] : [])];
    // what each of the stand's shapes is to the material (numbersOf), three rows of four a shape: [how tall, its tint],
    // [its wind], [its leaves]; and the zoo's number of each (its family's first, and of its shapes one)
    const numbers = new Float32Array(G.meshes * 12), KINDS = [];
    for (const Kd of G.kinds) for (let v = 0; v < Kd.shapes; v++) { const N = numbersOf(tex, Kd.row, v); numbers.set([N.hk, ...N.tint, ...N.wind, ...N.leaf], (Kd.offset + v) * 12); KINDS.push(Z.first + famOf(Kd.asset.uid).first + v); }
    const KR = storage(new THREE.StorageBufferAttribute(numbers, 4), 'vec4', G.meshes * 3);
    // a vertex of the draw as the material takes it: of the plant's own mesh at heap level `lv` (which it is: B.z's
    // whole number; what follows it: its shade), unpacked, with its kind's numbers
    const feedOf = (lv) => {
      const level = uniform(lv, 'uint');
      return {
        vertex: (B) => {
          const kind = uint(floor(B.z)), k = kind.mul(uint(3)), at = heapRow(D.H, kind, level).y.add(vertexIndex.mul(uint(2))), r0 = KR.element(k).toVar();
          return { ...plantOf(D.H.elems.element(at).toVar(), D.H.elems.element(at.add(uint(1))).toVar()), Hk: r0.x, Tn: r0.yzw, Wd: KR.element(k.add(uint(1))).toVar(), Lf: KR.element(k.add(uint(2))).toVar(), shade: fract(B.z) };
        },
      };
    };
    const D = createDrawer(scene, renderer, tex, {
      name: `plants, ${G.name}`, LEVELS, SHADE: { ...SH, shrink: 1 }, SMOOTH: uniform(1), PXK,
      make: { per: 2, byKind: true, material: (src, i, shadow) => { const { m, shape, slot } = make(shadow ? null : { lo: G.kinds[0].levels[i].lo, hi: G.kinds[0].levels[i].hi, last: i === n - 1 }, feedOf(i)); m.vertexNode = Fn(() => shape(src.readAt(0, slot), src.readAt(1, slot)))(); return m; } },
      // (what the browser keeps of it is good while its recipes and their rooms are what they were: registry.json's versions)
      zoo: { kinds: KINDS, ALL: G.meshes, fingerprint: () => `plants 2|${G.kinds.map((Kd) => `${Kd.asset.uid}@${versionOf(Kd.asset.uid)}`).join()}|${LEVELS.map((l) => `${l.room.verts}:${l.room.tris}`).join()}` },
    });
    drawers.push(D);
    // a tier: its cells worked out once for every kind in it, each plant that is of its level packed into its shape's
    // draw. g: the group it packs (the stand's, or of its kinds those that cast)
    const tier = (i, g, shadow = false) => {
      const P = shadow ? 4 : G.kinds[0].levels[i].P;
      // reach: a crown's reach, and how far the camera may move before the packing is made again (the cells are worked
      // out again every sixteenth of a patch)
      const seen = shadow ? null : { r: uniform(round + (ST.cell * P) / 16 + 2), high: sHi };
      const t = D.tier(i, {
        cell: ST.cell, P, cap: Math.ceil(Math.min(240000, MAXP * P * P * 0.4) / Math.min(...g.kinds.map((k) => k.shapes))), sizes: [sLo, sHi], fade: G.fade, shadow,
        casts: !shadow && i === 0 && g.kinds.some((Kd) => Kd.row.detail.casts && !Kd.asset.detail.shadow),   // without a stand-in the near ones cast, as drawn (src/world/shadow.js)
        place: (c, { band }, found) => plantIn(c, g, band, shadow, seen, found),
        extra: shadow ? { cull: SH.reach, fixed: SH.far * SH.wide } : {},   // (the stand-in in small patches: those whose shade cannot reach the view are dropped)
      });
      t.viewKeyed = !shadow; t.asset = G.name; tiers.push(t);
      return t;
    };
    for (let i = 0; i < n; i++) tier(i, G);
    if (SHL >= 0) {
      // the stand-in: every casting tree round the camera, its shade drawn for the light only
      const t = tier(SHL, { ...G, kinds: casting }, true);
      // … and its trees are the ones the walker bumps into (trunk: each shape's, where it stands at a walker's chest,
      // and its radius, at scale 1): the stand-in's packing read back each time it is packed anew
      const trunks = new Array(G.meshes).fill(null); for (const Kd of casting) for (let v = 0; v < Kd.shapes; v++) trunks[Kd.offset + v] = Kd.asset.trunk?.[v] ?? null;
      if (trunks.some(Boolean)) {
        let busy = false, was = '';
        solids.push((renderer) => {
          if (busy || t.key === was) return;
          busy = true; was = t.key;
          t.read(renderer).then((buckets) => {
            const out = [];
            for (const { count, data: [A, B] } of buckets) for (let i = 0; i < count; i++) {
              const k = i * 4, T = trunks[Math.floor(B[k + 2])]; if (!T) continue;
              const [u, w, r] = T, s = A[k + 3], c = Math.cos(B[k]), n = Math.sin(B[k]);
              out.push({ x: A[k] + (u * c - w * n) * s, z: A[k + 1] + (u * n + w * c) * s, r: r * s });   // turned as the tree is (its shape())
            }
            setTrunks(G.key, out);
          }).catch(() => {}).finally(() => (busy = false));
        });
      }
    }
  }
  addEventListener('resize', () => tiers.forEach((t) => t.band()));
  // each frame: the stands' meshes until they are in (read back from the browser, or made by the workers); the trunks
  tiers.solid = (renderer) => { for (const D of drawers) D.start(); for (const f of solids) f(renderer); };
  // for looking at it (window.__plants): how many plants each tier packs now, what the heaps hold
  window.__plants = { drawers, tiers, async counts() { const out = []; for (const t of tiers) { const B = await t.read(renderer); out.push(`${t.asset} ${t.level}: ${B.reduce((x, b) => x + b.count, 0)}`); } return { tiers: out, held: drawers.map((D) => D.H.held().join(',')), coarseMs: drawers.map((D) => D.stats.coarseMs), kept: drawers.map((D) => D.stats.kept) }; } };
  return tiers;
}

/** One plant on its own, in the stands' material (its bark, its leaves, its wind), for the asset library's stage and
    list: level `level`, its foot at (x, y, z), scale s, of its shapes the one asked. */
export function treeSample(tex, row, level = 0, x = 0, y = 0, z = 0, s = 1, form = 0) {
  const g = geometryOf(row.asset, row.detail.levels[Math.min(level, row.detail.levels.length - 1)], form);
  const { m, shape } = plantMaterial(tex, row.detail)();   // (a mesh of its own, not the heap's: the library's)
  m.vertexNode = Fn(() => shape(vec4(x, z, y, s), vec4(0.4, 1.3, 0.5, 1)))();   // turned a little, its own shade, the whole of its level
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.enable(1);
  return wear(mesh, tex, row, form);
}

const REGROWN = {};   // a tree grown again from another seed, kept (the library's Random)
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
    const a0 = row0.asset, a = seed != null && a0.regrow ? (REGROWN[`${a0.uid}:${seed}`] ??= a0.regrow(seed)) : a0, row = a === a0 ? row0 : scatterRow(a), G = a.growth;
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
