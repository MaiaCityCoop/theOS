// What stands in a stand: every asset whose placement names this engine (a tree, a bush, a fern, a fallen branch),
// scattered where its biome lies (placement.biome), in its biome's stand (placement.stand: `trees` unless it says), one
// plant at most in a cell. Like the rocks (rocks.js): a tier per level of detail, each drawn only in the band of
// distances where a plant of it is the size on screen its kind asks (assets/kinds.js), and on WebGPU packed by a compute
// pass, so only the plants that stand are drawn (tier.js).
//
// A stand is one thing to the engine, however many kinds grow in it (groupsOf):
//   - its cells are worked out once a level for all its kinds (plantIn): one packing, each plant dropped into its
//     kind's and shape's mesh;
//   - all of it is drawn by one material (plantMaterial): what a kind is (its bark, its leaves, how it takes the wind
//     and the light) each mesh says as a few numbers (wear), so every kind, shape and level is one shader.
// So a new kind costs its meshes, and a few lines of its stand's packing: no tier, no shader of its own.
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
import { Fn, float, int, uint, vec2, vec3, vec4, uniform, varyingProperty, attribute, positionGeometry, If, Discard, abs, max, mix, smoothstep, pow, normalize, length, floor, cos, sin, clamp, log, sqrt, fract, step } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, vnoise, camDist, riverInfo, heightAt, shareOf, groveAt, leadAt } from '../world/land.nodes.js';
import { kindsOf } from '../world/stand.js';
import { toScreen, airOf, skyLight, weatherOn, snowLiftAtVertex, cloudAtVertex, unlit, windAt, windDir, windStrength, stillness } from '../world/light.js';
import { PLACES } from '../../world/places.js';
import { recipe } from '../core/registry.js';
import { geometryOf, scatterRow } from '../../assets/index.js';
import { kindOf } from '../../assets/kinds.js';
import { pxK, sizeOf, most } from '../detail/index.js';
import { levelOf, bandOf, padOf, handOver, partGrown, sinkInto } from '../detail/handover.js';
import { Tier, offScreen, clipOf, MAXP } from './tier.js';
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

// what stands in a cell: a plant of this level, or nothing; packed into two vec4 (A: x, z, its foot's height, its scale;
// B: its turn, its sway's phase, its shade, its size in metres: its largest side), and which mesh it is drawn with
// (bucket: its kind's, and of its kind's shapes one). Done once per cell for the whole stand (src/scatter/tier.js); the
// cheap tests first, as most cells hold none.
//   G: the stand's group (groupsOf): its stand (the cells, the groves, the patches: the biome's, the same for every kind
//      that grows there) and its kinds, each with its slice of those cells (each cell one plant of one kind: a mix, not
//      plants standing in each other; a kind leading in patches, ST.patches metres across, not sprinkled evenly);
//   a kind's growth: its stages by age, the age its stand's, the plant its stage scaled to its own height (assets/kit/tree.js)
// What is the same for every kind (where the cell is, whether it is seen, the groves, the land's rule, the river, the
// height of the ground) is worked out once; a kind adds only its few lines (its size, its shape).
function plantIn(c, G, band, all = false, seen = null) {
  const { ST, biome, kinds } = G, cx = c.x, cy = c.y, K = ST.seed - 300, h0 = (k) => uint(k + K);   // the stand's seed moves every hash: another seed, another stand (a kind's own seed is its shapes')
  const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), bucket = float(0).toVar();
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
    kinds.forEach((Kd, i) => { const f = Kd.asset.placement.where; if (f) If(k.equal(i), () => { own.assign(f({ p: pos })); }); });
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
                h.assign(hh.mul(own)); s.assign(hh.div(S.h).mul(own)); bucket.assign(floor(rnd(cx, cy, h0(309)).mul(S.variants)).add(S.offset + Kd.offset));
              });
            });
          } else {   // no growth: a shape at random, its size its placement's scale
            s.assign(mix(P.scale[0], P.scale[1], pow(rnd(cx, cy, h0(304)), 1.3))); h.assign(s.mul(a.size.height)); bucket.assign(floor(rnd(cx, cy, h0(309)).mul(Kd.shapes)).add(Kd.offset));
          }
          out.assign(h.mul(Kd.spread));   // (how far it reaches out from its foot: half its kind's span, at its height)
          across.assign(h.mul(Kd.wide));   // (its size on screen by what its kind measures it by, src/detail sizeOf: a bush is low and wide, its largest side counts. `wide`: that to its height)
        }); });
        // of this level while it is the size on screen the level asks, and a little either side: its hand-over, and as
        // far as the camera may move before the cells are worked out again (band.margin). What of it shows, its vertices
        // say each frame (plantMaterial). (The shadow's stand-in: every plant in its band)
        // (the level's numbers as uniforms: band.to, band.from, band.pad, so every level is one shader)
        // A stand that says its `size` changes level as one: every plant of it as if it were that size, small or large,
        // so its levels change at the same distances for all (not bush by bush at every depth at once)
        const size = ST.size ? float(ST.size) : across, span = size.mul(PXK), yes = float(1).greaterThan(0);
        // (and nothing of it reaches over a way: what moves there, on the ground or over it, meets no plant. src/world/ways.js;
        // where none are laid the shader is the one it was)
        const within = all ? yes : band.holds(dist, span), way = wayAt(pos, out.add(0.5));
        If(way ? within.and(way.lessThan(0.5)) : within, () => {
          A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(0.15), s));
          B.assign(vec4(rnd(cx, cy, h0(305)).mul(6.2831853), rnd(cx, cy, h0(306)).mul(6.2831853), rnd(cx, cy, h0(307)), size));
          alive.assign(1);
        });
      });
    });
   });
  });
  return { alive: alive.greaterThan(0.5), data: [A, B], bucket };
}

// What a mesh tells the one material of its kind (its userData): hk, how tall its shape is (how far up it the wind takes
// hold); wind (how far it sways, how far it may lean, how much its leaves flutter, how its snow clumps); leaf (how far
// the light reaches round its leaves, how much shines through, and the layers of its leaves' and its wood's textures:
// src/materials/bake.js); tint, its leaves' own colour. A kind is these numbers: no shader of its own.
const wear = (mesh, tex, row, shape = 0) => {
  const a = row.asset, M = a.materials || {}, F = { wrap: 0.45, through: 0.55, flutter: 1, ...kindOf(a, 'foliage') };   // (its own `foliage` over its kind's)
  Object.assign(mesh.userData, {
    hk: a.heights?.[shape] ?? a.size.height,
    wind: new THREE.Vector4(kindOf(a, 'wind')?.sway ?? 0, a.placement.lean ?? 0, F.flutter, row.snow.clumps),
    leaf: new THREE.Vector4(F.wrap, F.through, tex.layer(M.leaves ?? M.needles ?? M.wood), tex.layer(M.wood ?? M.leaves ?? M.needles)),
    tint: new THREE.Vector3(...(F.tint ?? [1, 1, 1])),
  });
  return mesh;
};
const ofMesh = (key, start, type) => uniform(start, type).onObjectUpdate(({ object }) => object?.userData?.[key]);

// the one material of everything that stands in a stand, whatever its kind: shape(A, B) its vertex from what plantIn
// packed, swayed by the wind; its wood wrapped in its bark, its leaves cut out of their painted sprig (also in the shadow
// map: the shadow under a pine is dappled), lit through when the sun is behind them, and rounded over the crown as one
// dome (a crown of a thousand cards takes the light as a whole, not card by card); `ao` the light that reaches into the
// crown. Nothing of a kind is written into its code: what a kind is, each mesh says (wear), so every kind, every shape
// and every level is one shader to the GPU, compiled once.
//   D: { fade, sink }: how its levels hand over (its kind's: assets/kinds.js)
function plantMaterial(tex, D) {
  // Lv: the level it is drawn as ({ lo, hi, last }: the pixels it is drawn between, and whether it is the farthest), or
  // none (the library's, the shadow's: whole). Its level's numbers are uniforms.
  return (Lv = null) => {
    const Hk = ofMesh('hk', 1, 'float'), slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);
    const Wd = ofMesh('wind', new THREE.Vector4(0, 0, 1, 0.3)), Lf = ofMesh('leaf', new THREE.Vector4(0.45, 0.55, 0, 0)), Tn = ofMesh('tint', new THREE.Vector3(1, 1, 1));
    const sway = Wd.x, leans = Wd.y, flutters = Wd.z, clumps = Wd.w, wrap = Lf.x, shines = Lf.y;
    const LU = Lv && levelOf(Lv, D.fade);
    // what a pixel needs: where on its texture, and the light, the snow and the air already worked out at its corners
    // (vMul: what its texture's colour is multiplied by; vAdd: what is added: the snow on it, the air before it), so a
    // pixel reads its texture and is done. A crown is many cards deep: its pixels are many more than its corners.
    const vUv = varyingProperty('vec2', 'tUv'), vMul = varyingProperty('vec3', 'tMul'), vAdd = varyingProperty('vec3', 'tAdd');
    const vStill = varyingProperty('float', 'tStill');   // (built over time: how still it is in the wind, src/world/light.js stillness)
    const vPart = varyingProperty('float', 'tPart'), vCut = varyingProperty('vec2', 'tCut');   // vCut: the needles' cut, and how far a card is from edge-on
    // part: 0 its wood, 1 a sprig's card, 2 its crown as one body (its farthest level: assets/kit/tree.js)
    const part = attribute('part', 'float'), ao = attribute('ao', 'float'), card = float(1).sub(abs(part.sub(1))), body = step(1.5, part);
    const shape = (A, B) => {
      const clip = offScreen().toVar(), shown = float(1).greaterThan(0).toVar(), grown = float(1).toVar(), sunk = float(1).toVar();
      if (Lv) {
        // its size on screen now, as its cell reckoned it (its largest side, B.w), and from it the one hand-over
        // (src/detail/handover.js): its sprigs part by part, its wood whole, its last level sinking
        const H = handOver(B.w.mul(PXK).div(max(camDist(A.xy), 1e-3)), LU, D.sink);
        grown.assign(mix(float(1), partGrown(H, attribute('root', 'vec3'), body, attribute('hand', 'vec2')), step(0.5, part))); sunk.assign(H.sunk);
        shown.assign(H.there.and(part.greaterThan(0.5).or(H.whole)));
      }
      If(shown, () => { clip.assign(stand(A, B, grown, sunk)); });
      return clip;
    };
    const stand = (A, B, grown, sunk) => {
      const s = A.w, cs = cos(B.x), sn = sin(B.x), turn = (v) => vec3(v.x.mul(cs).sub(v.z.mul(sn)), v.y, v.x.mul(sn).add(v.z.mul(cs)));
      // (a sprig grown from its foot, the crown's body from its middle; the whole plant sunk)
      const g0 = Lv ? sinkInto(mix(attribute('root', 'vec3'), positionGeometry, grown), sunk) : positionGeometry;
      const lean = vec2(cos(B.y), sin(B.y)).mul(B.z.sub(0.5).mul(leans.mul(2))), lp = g0.add(vec3(lean.x, 0, lean.y).mul(g0.y)), up = clamp(lp.y.div(Hk), 0, 1);   // each leans its own way
      // the wind: the crown sways, the foot stays (the push grows with height squared), a slow sway of its own (from a
      // breeze up); and its sprigs swing in the wind, each as one from its foot, its tip most (a card's corners share its
      // plane, cn: one phase a card; uv.y: 0 at its foot), quicker and wider the harder it blows. In a calm all of it is
      // still: a sway of millimetres is no motion to the eye, only leaves' edges creeping by parts of a pixel (a shimmer)
      const push = windAt(A.xy), ws = windStrength;
      const kk = push.mul(up.mul(up).mul(sway).mul(s)).add(vec2(sin(U.uTime.mul(0.9).add(B.y)), cos(U.uTime.mul(0.7).add(B.y))).mul(up.mul(up).mul(ws.mul(0.05).add(smoothstep(0, 0.08, ws).mul(0.008))).mul(s)));
      const cardN = attribute('cn', 'vec3'), flutter = sin(U.uTime.mul(ws.mul(5).add(1.6)).add(cardN.dot(vec3(12.9, 78.2, 37.7))).add(B.y)).mul(ws.mul(0.14)).mul(card).mul(attribute('uv', 'vec2').y.min(1)).mul(flutters);
      const w = vec3(A.x, A.z, A.y).add(turn(lp.mul(s))).add(vec3(kk.x.add(windDir.x.mul(flutter)), flutter.mul(0.4), kk.y.add(windDir.y.mul(flutter)))).toVar();
      vUv.assign(attribute('uv', 'vec2')); vPart.assign(part);
      vStill.assign(stillness(up.mul(up).mul(sway).mul(s).add(card.mul(attribute('uv', 'vec2').y.min(1)).mul(flutters).mul(0.8)), w));   // (its crown's sway, and a sprig's own swing)
      const toEye = U.uCam.sub(w), far = length(toEye), V = toEye.div(max(far, 1e-3));
      // the needles' outline: far off a mip's needles are fainter, so the cut lowers with them and the crown stays full;
      // a card seen edge-on is a flat sliver, not a brush: it fades as it turns away
      // … and foliage right at the eye is let go (walking through a low crown, no card fills the picture)
      vCut.assign(vec2(mix(0.45, 0.16, smoothstep(15, 220, far)), max(smoothstep(0.06, 0.42, abs(normalize(turn(attribute('cn', 'vec3'))).dot(V))), body).mul(smoothstep(0.35, 1.3, far))));
      vMul.assign(vec3(0)); vAdd.assign(vec3(0));
      If(unlit().not(), () => {   // (drawn into the shadow map, only its depth and its cut-out count)
        // its light: the sky's and the sun's on the dome its crown makes (a crown of a thousand cards takes the light as a
        // whole, not card by card), through its needles when the sun is behind them, less of both deep in the crown
        // (ao); one tap of the shadow map at each corner; its snow; the air before it
        const leaf = part.greaterThan(0.5), n0 = normalize(turn(attribute('normal', 'vec3'))), n = n0.dot(V).lessThan(0).select(n0.negate(), n0);
        const ndl = leaf.select(n.dot(U.uSunDir).add(wrap).div(wrap.add(1)), n.dot(U.uSunDir)).max(0);   // needles take the light round their edge
        const through = leaf.select(pow(max(V.negate().dot(U.uSunDir), 0), 3).mul(shines), float(0));   // the sun behind a brush of needles shines through it
        const L = skyLight(n).mul(ao.mul(ao).mul(0.75).add(ao.mul(0.25))).add(U.uSun.mul(cloudAtVertex(w)).mul(ndl.add(through)).mul(ao.mul(0.6).add(0.4)));
        const W = weatherOn(n, snowLiftAtVertex(w, clumps)), air = airOf(w);   // what the weather does to it (wet, its snow in clumps), and the air before it
        // each plant its own green: lighter or darker, and warmer (yellower) or cooler (bluer)
        const tint = leaf.select(mix(vec3(1.07, 1.0, 0.78), vec3(0.86, 0.98, 1.1), B.y.mul(1.1631).fract()).mul(B.z.mul(0.3).add(0.84)).mul(Tn), vec3(1));
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
        T.assign(tex.a(Lf.z, vUv));
        const whole = step(1.5, vPart);
        // (the shadow map takes no coverage: cut)
        If(shadow, () => { If(T.a.lessThan(vCut.x).and(whole.lessThan(0.5)), () => { Discard(); }); })
          .Else(() => { alpha.assign(max(smoothstep(vCut.x.sub(0.08), vCut.x.add(0.08), T.a), whole).mul(vCut.y)); If(alpha.lessThan(0.04), () => { Discard(); }); });
      }).ElseIf(shadow.not(), () => { const W = tex.a(Lf.w, vUv); T.assign(vec4(W.rgb.mul(mix(0.74, 1, W.a)), 1)); });   // its bark, darker in its fissures (0.74 squared: 0.55)
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
    by.get(key).kinds.push({ row, asset: a, levels, shapes: levels[0]?.meshes?.length ?? 1, wide, spread: Math.max(most(a.size.length), most(a.size.width ?? 0)) / (2 * H), age: ST.age, lo, hi, round: (a.size.length / 2) * P.scale[1],
      slice: kindsOf(P.biome, P.stand).find((k) => k.asset.uid === a.uid)?.slice ?? [0, 1] });   // its share of its stand's cells: every kind that grows there, in the order of their uids
  }
  return [...by.values()].map((G) => offsets({ ...G, kinds: G.kinds.sort((x, y) => (x.asset.uid < y.asset.uid ? -1 : 1)) }));
}
const offsets = (G) => { let at = 0; return { ...G, kinds: G.kinds.map((Kd) => { const k = { ...Kd, offset: at }; at += Kd.shapes; return k; }), meshes: at }; };

/** Everything this engine places: a tier per stand and level of detail (every kind's shapes buckets of it), each where a
    plant of it is the size on screen its kind asks; and, for the kinds whose detail names one, a stand-in drawn only into
    the shadow map (layer 1): every tree round the camera at its coarser level, the shade of a crown at a fraction of its
    finest cards' cost. What a stand costs to start and to draw is its levels', not its kinds': a new kind adds its meshes. */
export function createStands(scene, tex, ground, rows, gpu = false) {
  const tiers = [], solids = [];
  for (const G of groupsOf(rows)) {
    const { ST } = G, make = plantMaterial(tex, G);
    const sLo = ST.size ?? Math.min(...G.kinds.map((k) => k.lo)), sHi = ST.size ?? Math.max(...G.kinds.map((k) => k.hi)), round = Math.max(...G.kinds.map((k) => k.round));
    // a tier: its cells worked out once for every kind in it, each plant dropped into its kind's and shape's mesh (tier.js: buckets)
    //   Lv: the level's numbers; g: the group it packs (the stand's, or of its kinds those that cast); geoOf(kind): the level's meshes of a kind
    const tier = (Lv, g, geoOf, SH = null) => {
      const shadow = !!SH;
      const geos = g.kinds.flatMap((Kd) => Array.from({ length: Kd.shapes }, (_, v) => { const x = geometryOf(Kd.asset, geoOf(Kd), v); if (!x.index) x.setIndex([...Array(x.attributes.position.count).keys()]); return x; }));   // (a tier's draw counts indices)
      // margin: metres a plant is kept either side of its level's band, so it is there when the camera has moved (the
      // cells are worked out again every sixteenth of a patch)
      const reach = round + (ST.cell * Lv.P) / 16 + 2;
      // (its level's band: src/detail/handover.js; the shadow's stand-in has none: every tree round the camera)
      const band = { near: uniform(0), far: uniform(1), ...(shadow ? {} : bandOf(Lv, G.fade, padOf(ST.cell, Lv.P))) }, live = (c) => plantIn(c, g, band, shadow, shadow ? null : { r: uniform(reach), high: sHi });   // r: a crown's reach, and how far the camera may move before the packing is made again
      let one = null;   // (packed by compute: one material for all its buckets; which of them a mesh is, the mesh says: tier.js, slot)
      const material = (src, k) => {
        if (src.readAt && one) return one;
        const { m, shape, slot } = make(shadow ? null : { lo: Lv.lo, hi: Lv.hi, last: Lv.i === G.n - 1 });
        m.vertexNode = src.readAt ? Fn(() => shape(src.readAt(0, slot), src.readAt(1, slot)))()   // ready-made by the compute pass
          : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive.and(L.bucket.equal(float(k))), () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out per vertex, a material a mesh (on WebGL 2 one material does not tell its meshes apart)
        if (src.readAt) one = m;
        return m;
      };
      // (the stand-in in small patches: those whose shade cannot reach the view are dropped)
      const t = new Tier(scene, geos, material, { cell: ST.cell, P: Lv.P, near: 0, far: 1, order: 1, live, gpu, cap: Math.ceil(Math.min(240000, MAXP * Lv.P * Lv.P * 0.4) / Math.min(...g.kinds.map((k) => k.shapes))), slots: 2, ...(shadow ? { cull: SH.reach, fixed: SH.far * SH.wide } : {}) });
      t.band = shadow ? () => { t.near = 0; t.far = SH.far; band.near.value = -1; band.far.value = SH.far * SH.wide; }   // (grown with the camera's height by Tier.select's patches)
        : () => {   // the distances where a plant of this level can be, from the largest seen small to the smallest seen large
          [t.near, t.far] = band.reach(sLo, sHi, pxK());
          band.near.value = t.near > 0 ? t.near : -1; band.far.value = t.far;
        };
      t.band(); t.level = Lv.i; t.viewKeyed = !shadow; t.asset = G.name;
      // each mesh its kind's: what the material reads of it (wear), and which kind it is
      g.kinds.forEach((Kd) => { for (let v = 0; v < Kd.shapes; v++) { const m = wear(t.meshes[Kd.offset + v], tex, Kd.row, v); m.userData.kind = Kd.asset.uid;
        if (shadow) m.layers.set(1);   // only the light sees it
        else if (Kd.row.detail.casts && !Kd.asset.detail.shadow && Lv.i === 0) m.layers.enable(1); } });   // without a stand-in the near ones cast, as drawn (src/world/shadow.js)
      // … and its trees are the ones the walker bumps into (trunk: each shape's, where it stands at a walker's chest, and its radius, at scale 1)
      if (shadow) t.trunks = g.kinds.flatMap((Kd) => Array.from({ length: Kd.shapes }, (_, v) => Kd.asset.trunk?.[v] ?? null));
      tiers.push(t);
      return t;
    };
    for (let i = 0; i < G.n; i++) tier(G.kinds[0].levels[i], G, (Kd) => Kd.levels[i]);
    // the stand-in: of the stand's kinds those that cast and name one (its own shade mesh, or a level), as far as the farthest of them
    const casting = G.kinds.filter((Kd) => Kd.asset.detail.shadow && Kd.row.detail.casts);
    if (casting.length) {
      const shades = casting.map((Kd) => Kd.asset.detail.shadow), SH = { far: Math.max(...shades.map((s) => s.far)), wide: Math.max(...shades.map((s) => s.wide ?? 2.4)), reach: Math.max(...shades.map((s) => s.reach ?? 20)) };
      const t = tier({ P: 4 }, offsets({ ...G, kinds: casting }), (Kd) => { const S = Kd.asset.detail.shadow; return S.meshes ? { mesh: S.meshes[0], meshes: S.meshes, P: 4 } : Kd.levels[Math.min(S.level ?? 0, Kd.levels.length - 1)]; }, SH);
      // the trunks as bodies: the stand-in's packing (every tree round the camera) read back each time it is packed anew
      if (t.read && t.trunks.some(Boolean)) {
        let busy = false, was = '';
        solids.push((renderer) => {
          if (busy || t.key === was) return;
          busy = true; was = t.key;
          t.read(renderer).then((buckets) => {
            const out = [];
            buckets.forEach(({ count, data: [A, B] }, b) => {
              const T = t.trunks[b]; if (!T) return;
              const [u, w, r] = T;
              for (let i = 0; i < count; i++) { const k = i * 4, s = A[k + 3], c = Math.cos(B[k]), n = Math.sin(B[k]); out.push({ x: A[k] + (u * c - w * n) * s, z: A[k + 1] + (u * n + w * c) * s, r: r * s }); }   // turned as the tree is (its shape())
            });
            setTrunks(G.key, out);
          }).catch(() => {}).finally(() => (busy = false));
        });
      }
    }
  }
  addEventListener('resize', () => tiers.forEach((t) => t.band()));
  if (solids.length) tiers.solid = (renderer) => { for (const f of solids) f(renderer); };
  return tiers;
}

/** One plant on its own, in the stands' material (its bark, its leaves, its wind), for the asset library's stage and
    list: level `level`, its foot at (x, y, z), scale s, of its shapes the one asked. */
export function treeSample(tex, row, level = 0, x = 0, y = 0, z = 0, s = 1, form = 0) {
  const g = geometryOf(row.asset, row.detail.levels[Math.min(level, row.detail.levels.length - 1)], form);
  const { m, shape } = plantMaterial(tex, row.detail)();
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
