// Trees: the assets of kind `tree` (assets/stonepine.js), scattered where their biome lies (placement.biome), one at
// most in a cell. Like the rocks (rocks.js): a tier per level of detail, each drawn only in the band of distances where a
// tree of it is the size on screen its kind asks (assets/kinds.js), and on WebGPU packed by a compute pass, so only the
// trees that stand are drawn (tier.js).
//
// Nothing that stands in a stand appears or drops out at once, whatever it is (a tree, a bush, a fern: any asset this
// engine places gets all of it, none of it written in the asset's file):
//   - its size on screen is measured as its kind says (its largest side; a tree's height), by each vertex, this frame;
//     or, where its stand says a `size`, as that for every plant of the stand: the stand changes level as one;
//   - between two levels both are drawn: the finer level's sprigs shrink to their feet one by one as the coarser one's
//     grow from theirs;
//   - its last level (the kit's: one body) sinks into the ground over its last pixels (kinds.js: sink);
//   - where it has sunk, the land wears its stand's colour (the stand's `cover`: src/terrain/material.js), as thick as
//     the stand grows there: a forest, and its undergrowth, to the horizon.
import * as THREE from 'three/webgpu';
import { Fn, float, uint, vec2, vec3, vec4, uniform, varyingProperty, attribute, positionGeometry, If, Discard, abs, max, mix, smoothstep, pow, normalize, length, floor, cos, sin, clamp, log, sqrt, fract, step } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, vnoise, camDist, riverInfo, heightAt, shareOf, groveAt, leadAt } from '../world/land.nodes.js';
import { kindsOf } from '../world/stand.js';
import { toScreen, airOf, skyLight, weatherOn, snowLiftAtVertex, cloudAtVertex, unlit, windAt, windDir, windStrength } from '../world/light.js';
import { PLACES } from '../../world/places.js';
import { recipe } from '../core/registry.js';
import { geometryOf, scatterRow } from '../../assets/index.js';
import { kindOf } from '../../assets/kinds.js';
import { pxK, sizeOf } from '../detail/index.js';
import { levelOf, bandOf, padOf, handOver, partGrown, sinkInto } from '../detail/handover.js';
import { Tier, offScreen, clipOf, MAXP } from './tier.js';
import { inView } from './view.js';
import { setTrunks } from '../world/trunks.js';

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

// what stands in a cell: a tree of this level, or nothing; packed into two vec4 (A: x, z, its foot's height, its scale;
// B: its turn, its sway's phase, its shade, its size in metres: its largest side), and which of its shapes (bucket). Done once per tree (src/scatter/tier.js); the cheap tests first, as most cells hold none.
//   ST: its stand (standOf): the cells, the groves, the ages are the biome's, the same for every kind that grows there;
//   slice: the share of those cells that are this kind's (each cell one tree of one kind: a mix, not trees standing in
//          each other), a kind leading in patches (ST.patches metres across), not sprinkled evenly;
//   growth: its stages by age, the age its stand's, the tree its stage scaled to its own height (assets/kit/tree.js)
function treeIn(c, row, Lv, band, biome, ST, shapes = 1, all = false, slice = [0, 1], seen = null) {
  const a = row.asset, P = a.placement, GR = a.growth, AG = ST.age, wide = sizeOf(a) / a.size.height, cx = c.x, cy = c.y, K = ST.seed - 300, h0 = (k) => uint(k + K);   // the stand's seed moves every hash: another seed, another stand (a tree's own seed is its shapes')
  const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), bucket = float(0).toVar();
  const pos = vec2(c).add(0.08).add(vec2(rnd(cx, cy, h0(302)), rnd(cx, cy, h0(303))).mul(0.84)).mul(ST.cell), dist = camDist(pos);
  const range = all ? length(pos.sub(U.uCam.xz)) : dist;   // the shadow's stand-in: metres round the camera, whatever the lens
  const there = range.lessThan(band.far).and(range.greaterThanEqual(band.near));
  If(seen ? there.and(inView(pos, seen.r, seen.high)) : there, () => {   // (seen.r: a uniform, its level's)   // (and in the eye's view: not the shadow's stand-in, whose shade may fall into it)
   // which kind of tree this cell is, the same answer for every kind of the stand: a slow noise (a kind leads here, another
   // there) and the cell's own hash; this kind's if it falls in its slice
   const lead = ST.patches ? leadAt(vec2(c).add(0.5).mul(ST.cell), ST).mul(0.7).add(rnd(cx, cy, h0(320)).mul(0.3)).min(0.9999) : rnd(cx, cy, h0(320));
   If(slice[0] > 0 || slice[1] < 1 ? lead.greaterThanEqual(slice[0]).and(lead.lessThan(slice[1])) : float(1).greaterThan(0), () => {
    const r0 = rnd(cx, cy, h0(300));
    // groves and glades: a stand is not a plantation (a noise as wide as its clumps sets how thick it grows here)
    // (and where the stand itself, and this kind of it, like to grow: their `where`, 0..1 at a place, if they say:
    // an understory thin in deep shade, a fern in the glades)
    const likes = [ST.where, P.where].filter(Boolean).reduce((k, f) => k.mul(f({ p: pos })), float(1));
    const grove = groveAt(pos, ST), dens = grove.mul(ST.density).mul(likes);
    If(r0.lessThan(shareOf(biome, { p: pos, dist, d: float(1e5), w: float(1), b: float(0) }).mul(dens)), () => {   // its stands, as if far from the river
      const I = riverInfo(pos), d = abs(I.x), w = I.y;
      If(r0.lessThan(shareOf(biome, { p: pos, dist, d, w, b: I.z }).mul(dens).mul(clearAt(pos))), () => {
        const own = mix(P.scale[0], P.scale[1], rnd(cx, cy, h0(304))), s = float(1).toVar(), h = float(1).toVar();
        if (GR && AG) {   // as old as its stand: a slow noise gives the stand its age, a few saplings among the old
          const stand = mix(AG.stand[0], AG.stand[1], vnoise(pos.div((ST.clumps || 50) * 2.5), h0(311))), r = rnd(cx, cy, h0(312));
          const age = rnd(cx, cy, h0(313)).lessThan(AG.young ?? 0).select(mix(AG.min ?? 2, stand.mul(0.45), r), stand.mul(mix(0.65, 1.3, r))).toVar();
          GR.stages.forEach((S, i) => {
            const lo = i ? S.from : -1, hi = i < GR.stages.length - 1 ? S.to : 1e9;
            If(age.greaterThanEqual(lo).and(age.lessThan(hi)), () => {
              const t = clamp(log(max(age, S.from).div(S.from)).div(Math.log(S.to / S.from)), 0, 1), hh = mix(S.hFrom, S.hTo, t);
              h.assign(hh.mul(own)); s.assign(hh.div(S.h).mul(own)); bucket.assign(floor(rnd(cx, cy, h0(309)).mul(S.variants)).add(S.offset));
            });
          });
        } else {   // no growth: a shape at random, its size its placement's scale
          s.assign(mix(P.scale[0], P.scale[1], pow(rnd(cx, cy, h0(304)), 1.3))); h.assign(s.mul(a.size.height)); bucket.assign(floor(rnd(cx, cy, h0(309)).mul(shapes)));
        }
        // of this level while it is the size on screen the level asks, and a little either side: its hand-over, and as
        // far as the camera may move before the cells are worked out again (band.margin). What of it shows, its vertices
        // say each frame (treeMaterial). (The shadow's stand-in: every tree in its band)
        // (the level's numbers as uniforms: band.to, band.from, band.pad, so every level of a kind is one shader)
        // (its size on screen by what its kind measures it by, src/detail sizeOf: a bush is low and wide, its largest side counts. `wide`: that to its height)
        // A stand that says its `size` changes level as one: every plant of it as if it were that size, small or large,
        // so its levels change at the same distances for all (not bush by bush at every depth at once)
        const size = ST.size ? float(ST.size) : h.mul(wide), span = size.mul(PXK), yes = float(1).greaterThan(0);
        const within = all ? yes : band.holds(dist, span);
        If(within, () => {
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

// the tree's material: shape(A, B) its vertex from what treeIn packed, swayed by the wind; its wood wrapped in its bark,
// its needles cut out of the painted tuft (also in the shadow map: the shadow under a pine is dappled), lit through
// when the sun is behind them, and rounded over the crown as one dome (a crown of a thousand cards takes the light as a
// whole, not card by card); `ao` the light that reaches into the crown (assets/stonepine.js)
function treeMaterial(tex, row) {
  const a = row.asset, H = a.size.height, sway = kindOf(a, 'wind')?.sway ?? 0, M = a.materials || {}, clumps = row.snow.clumps, F = { wrap: 0.45, through: 0.55, flutter: 1, ...kindOf(a, 'foliage') };   // F: how its leaves take the light and the wind (its own `foliage` over its kind's)
  // k: which of its shapes (its own height: how far up it the wind takes hold); Lv: the level it is drawn as ({ lo, hi,
  // last }: the pixels it is drawn between, and whether it is the farthest), or none (the library's, the shadow's: whole)
  // One material serves every bucket of a tier: which shape it draws it learns per mesh (mesh.userData: hk its height,
  // slot where its trees lie in the tier's buffer), and its level's numbers are uniforms, so every level of a kind is
  // one shader to the GPU, compiled once.
  return (Lv = null) => {
    const Hk = uniform(H).onObjectUpdate(({ object }) => object?.userData?.hk ?? H), slot = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);
    const LU = Lv && levelOf(Lv, row.detail.fade);
    // what a pixel needs: where on its texture, and the light, the snow and the air already worked out at its corners
    // (vMul: what its texture's colour is multiplied by; vAdd: what is added: the snow on it, the air before it), so a
    // pixel reads its texture and is done. A crown is many cards deep: its pixels are many more than its corners.
    const vUv = varyingProperty('vec2', 'tUv'), vMul = varyingProperty('vec3', 'tMul'), vAdd = varyingProperty('vec3', 'tAdd');
    const vPart = varyingProperty('float', 'tPart'), vCut = varyingProperty('vec2', 'tCut');   // vCut: the needles' cut, and how far a card is from edge-on
    // part: 0 its wood, 1 a sprig's card, 2 its crown as one body (its farthest level: assets/kit/tree.js)
    const part = attribute('part', 'float'), ao = attribute('ao', 'float'), card = float(1).sub(abs(part.sub(1))), body = step(1.5, part);
    const shape = (A, B) => {
      const clip = offScreen().toVar(), shown = float(1).greaterThan(0).toVar(), grown = float(1).toVar(), sunk = float(1).toVar();
      if (Lv) {
        // its size on screen now, as its cell reckoned it (its largest side, B.w), and from it the one hand-over
        // (src/detail/handover.js): its sprigs part by part, its wood whole, its last level sinking
        const H = handOver(B.w.mul(PXK).div(max(camDist(A.xy), 1e-3)), LU, row.detail.sink);
        grown.assign(mix(float(1), partGrown(H, attribute('root', 'vec3'), body, attribute('hand', 'vec2')), step(0.5, part))); sunk.assign(H.sunk);
        shown.assign(H.there.and(part.greaterThan(0.5).or(H.whole)));
      }
      If(shown, () => { clip.assign(stand(A, B, grown, sunk)); });
      return clip;
    };
    const stand = (A, B, grown, sunk) => {
      const s = A.w, cs = cos(B.x), sn = sin(B.x), turn = (v) => vec3(v.x.mul(cs).sub(v.z.mul(sn)), v.y, v.x.mul(sn).add(v.z.mul(cs)));
      // (a sprig grown from its foot, the crown's body from its middle; the whole tree sunk)
      const g0 = Lv ? sinkInto(mix(attribute('root', 'vec3'), positionGeometry, grown), sunk) : positionGeometry;
      const lean = vec2(cos(B.y), sin(B.y)).mul(B.z.sub(0.5).mul(2 * (a.placement.lean ?? 0))), lp = g0.add(vec3(lean.x, 0, lean.y).mul(g0.y)), up = clamp(lp.y.div(Hk), 0, 1);   // each leans its own way
      // the wind: the crown sways, the foot stays (the push grows with height squared), a slow sway of its own (from a
      // breeze up); and its sprigs swing in the wind, each as one from its foot, its tip most (a card's corners share its
      // plane, cn: one phase a card; uv.y: 0 at its foot), quicker and wider the harder it blows. In a calm all of it is
      // still: a sway of millimetres is no motion to the eye, only leaves' edges creeping by parts of a pixel (a shimmer)
      const push = windAt(A.xy), ws = windStrength;
      const kk = push.mul(up.mul(up).mul(sway).mul(s)).add(vec2(sin(U.uTime.mul(0.9).add(B.y)), cos(U.uTime.mul(0.7).add(B.y))).mul(up.mul(up).mul(ws.mul(0.05).add(smoothstep(0, 0.08, ws).mul(0.008))).mul(s)));
      const cardN = attribute('cn', 'vec3'), flutter = sin(U.uTime.mul(ws.mul(5).add(1.6)).add(cardN.dot(vec3(12.9, 78.2, 37.7))).add(B.y)).mul(ws.mul(0.14)).mul(card).mul(attribute('uv', 'vec2').y.min(1)).mul(F.flutter);
      const w = vec3(A.x, A.z, A.y).add(turn(lp.mul(s))).add(vec3(kk.x.add(windDir.x.mul(flutter)), flutter.mul(0.4), kk.y.add(windDir.y.mul(flutter)))).toVar();
      vUv.assign(attribute('uv', 'vec2')); vPart.assign(part);
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
        const ndl = leaf.select(n.dot(U.uSunDir).add(F.wrap).div(1 + F.wrap), n.dot(U.uSunDir)).max(0);   // needles take the light round their edge
        const through = leaf.select(pow(max(V.negate().dot(U.uSunDir), 0), 3).mul(F.through), float(0));   // the sun behind a brush of needles shines through it
        const L = skyLight(n).mul(ao.mul(ao).mul(0.75).add(ao.mul(0.25))).add(U.uSun.mul(cloudAtVertex(w)).mul(ndl.add(through)).mul(ao.mul(0.6).add(0.4)));
        const W = weatherOn(n, snowLiftAtVertex(w, clumps)), air = airOf(w);   // what the weather does to it (wet, its snow in clumps), and the air before it
        // each tree its own green: lighter or darker, and warmer (yellower) or cooler (bluer)
        const tint = leaf.select(mix(vec3(1.07, 1.0, 0.78), vec3(0.86, 0.98, 1.1), B.y.mul(1.1631).fract()).mul(B.z.mul(0.3).add(0.84)).mul(vec3(...(F.tint ?? [1, 1, 1]))), vec3(1));
        vMul.assign(L.mul(tint).mul(W.keep).mul(air.k));
        vAdd.assign(W.add.mul(L).mul(air.k).add(air.col.mul(float(1).sub(air.k))));
      });
      return clipOf(w);
    };
    const frag = Fn(() => {
      // drawn with alpha to coverage (the canvas's multisampling): a needle's outline soft in a pixel, not a screen-door
      // dither of whole pixels (which a lowered pixel ratio blows up into dots). Two levels are never both half there
      // (two halves of coverage are the same samples: a crown half see-through, in a grid): their hand-over is their
      // sprigs' sizes, in the vertex stage. A crown as one body (part 2) is whole, no sprig cut out of it
      const leaf = vPart.greaterThan(0.5), T = vec4(1).toVar(), alpha = float(1).toVar(), shadow = unlit();
      If(leaf, () => {
        T.assign(tex.a(M.leaves ?? M.needles, vUv));
        const whole = step(1.5, vPart);
        // (the shadow map takes no coverage: cut)
        If(shadow, () => { If(T.a.lessThan(vCut.x).and(whole.lessThan(0.5)), () => { Discard(); }); })
          .Else(() => { alpha.assign(max(smoothstep(vCut.x.sub(0.08), vCut.x.add(0.08), T.a), whole).mul(vCut.y)); If(alpha.lessThan(0.04), () => { Discard(); }); });
      }).ElseIf(shadow.not(), () => { const W = tex.a(M.wood, vUv); T.assign(vec4(W.rgb.mul(mix(0.74, 1, W.a)), 1)); });   // its bark, darker in its fissures (0.74 squared: 0.55)
      const out = vec4(0).toVar();
      If(shadow.not(), () => { out.assign(vec4(toScreen(T.rgb.mul(T.rgb).mul(vMul).add(vAdd)).rgb, alpha)); });
      return out;
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide; m.alphaToCoverage = true;
    return { m, shape, slot };
  };
}

/** The assets of kind `tree`: a tier per level of detail (its shapes buckets of it), each where a tree of it is the size on screen its kind
    asks; and, when its detail names one, a stand-in drawn only into the shadow map (layer 1): every tree round the camera
    at its coarser level, the shade of a crown at a fraction of its finest cards' cost. */
export function createTrees(scene, tex, ground, row, gpu = false) {
  const a = row.asset, P = a.placement, biome = recipe(P.biome), H = a.size.height, tiers = [], make = treeMaterial(tex, row);
  if (!biome) return tiers;
  const ST = standOf(a, biome);
  const levels = row.detail.levels.filter((l) => !l.impostor), shapes = levels[0]?.meshes?.length ?? 1, SH = a.detail.shadow;
  // its share of its biome's cells: every kind of tree that grows there, in the order of their uids, each its share
  const slice = kindsOf(P.biome, P.stand).find((k) => k.asset.uid === a.uid)?.slice ?? [0, 1];
  // the heights a tree of it can have: its youngest and its oldest (by its growth), or its scale's
  const G = a.growth, wide = sizeOf(a) / H, hLo0 = (G ? G.stages[0].hFrom * P.scale[0] : H * P.scale[0]) * wide, hHi0 = (G ? Math.max(...a.heights) * (G.stages.at(-1).hTo / G.stages.at(-1).h) * P.scale[1] : H * P.scale[1]) * wide;
  const hLo = ST.size ?? hLo0, hHi = ST.size ?? hHi0;
  // a tier per level: its cells worked out once, each tree dropped into its shape's mesh (tier.js: buckets)
  const tier = (Lv, shadow) => {
    const geos = Array.from({ length: shapes }, (_, v) => { const g = geometryOf(a, Lv, v); if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g; });   // (a tier's draw counts indices)
    // margin: metres a tree is kept either side of its level's band, so it is there when the camera has moved (the
    // cells are worked out again every sixteenth of a patch)
    const reach = (a.size.length / 2) * P.scale[1] + (ST.cell * Lv.P) / 16 + 2;
    // (its level's band: src/detail/handover.js; the shadow's stand-in has none: every tree round the camera)
    const band = { near: uniform(0), far: uniform(1), ...(shadow ? {} : bandOf(Lv, row.detail.fade, padOf(ST.cell, Lv.P))) }, live = (c) => treeIn(c, row, Lv, band, biome, ST, shapes, shadow, slice, shadow ? null : { r: uniform(reach), high: hHi });   // r: its crown's reach, and how far the camera may move before the packing is made again
    let one = null;   // (packed by compute: one material for all its buckets)
    const material = (src, k) => {
      if (src.readAt && one) return one;
      const { m, shape, slot } = make(shadow ? null : { lo: Lv.lo, hi: Lv.hi, last: Lv.i === levels.length - 1 });
      m.vertexNode = src.readAt ? Fn(() => shape(src.readAt(0, slot), src.readAt(1, slot)))()   // ready-made by the compute pass
        : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive.and(L.bucket.equal(float(k))), () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out per vertex
      if (src.readAt) one = m;
      return m;
    };
    // (the stand-in in small patches: those whose shade cannot reach the view are dropped)
    const t = new Tier(scene, geos, material, { cell: ST.cell, P: shadow ? 4 : Lv.P, near: 0, far: 1, order: 1, live, gpu, cap: Math.ceil(Math.min(240000, MAXP * (shadow ? 16 : Lv.P * Lv.P) * 0.4) / shapes), slots: 2, ...(shadow ? { cull: SH.reach ?? 20, fixed: SH.far * (SH.wide ?? 2.4) } : {}) });
    t.band = shadow ? () => { t.near = 0; t.far = SH.far; band.near.value = -1; band.far.value = SH.far * (SH.wide ?? 2.4); }   // (grown with the camera's height by Tier.select's patches)
      : () => {   // the distances where a tree of this level can be, from the largest seen small to the smallest seen large
        [t.near, t.far] = band.reach(hLo, hHi, pxK());
        band.near.value = t.near > 0 ? t.near : -1; band.far.value = t.far;
      };
    t.band(); t.level = Lv.i; t.viewKeyed = !shadow;
    t.meshes.forEach((m, v) => (m.userData.hk = a.heights?.[v] ?? H));
    if (shadow) { t.meshes.forEach((m) => m.layers.set(1)); t.trunks = a.trunk; }   // only the light sees it; and its trees are the ones the walker bumps into (trunk: each shape's, where it stands at a walker's chest, and its radius, at scale 1)
    else if (row.detail.casts && !SH && Lv.i === 0) t.meshes.forEach((m) => m.layers.enable(1));   // without a stand-in the near trees cast, as drawn (src/world/shadow.js)
    tiers.push(t);
  };
  for (const Lv of levels) tier(Lv, false);
  if (SH && row.detail.casts) tier(SH.meshes ? { mesh: SH.meshes[0], meshes: SH.meshes, P: 4 } : levels[Math.min(SH.level ?? 0, levels.length - 1)], true);   // its own shade mesh, or a level
  addEventListener('resize', () => tiers.forEach((t) => t.band()));
  // the trunks as bodies: the stand-in's packing (every tree round the camera) read back each time it is packed anew
  const own = tiers.filter((t) => t.trunks && t.read);
  if (own.length) {
    let busy = false, was = '';
    tiers.solid = (renderer) => {
      const key = own.map((t) => t.key).join('#'); if (busy || key === was) return;
      busy = true; was = key;
      Promise.all(own.map((t) => t.read(renderer).then((buckets) => {
        const out = [];
        buckets.forEach(({ count, data: [A, B] }, v) => {
          const [u, w, r] = t.trunks?.[v] ?? [0, 0, 0.3];
          for (let i = 0; i < count; i++) { const k = i * 4, s = A[k + 3], c = Math.cos(B[k]), n = Math.sin(B[k]); out.push({ x: A[k] + (u * c - w * n) * s, z: A[k + 1] + (u * n + w * c) * s, r: r * s }); }   // turned as the tree is (its shape())
        });
        return out;
      })))
        .then((lists) => setTrunks(row.uid, lists.flat())).catch(() => {}).finally(() => (busy = false));
    };
  }
  return tiers;
}

/** One tree on its own, in the trees' own material (its bark, its needles, its wind), for the asset library's stage and
    list: level `level`, its foot at (x, y, z), scale s, of its shapes the one asked. */
export function treeSample(tex, row, level = 0, x = 0, y = 0, z = 0, s = 1, form = 0) {
  const g = geometryOf(row.asset, row.detail.levels[Math.min(level, row.detail.levels.length - 1)], form);
  const { m, shape } = treeMaterial(tex, row)();
  m.vertexNode = Fn(() => shape(vec4(x, z, y, s), vec4(0.4, 1.3, 0.5, 1)))();   // turned a little, its own shade, the whole of its level
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.enable(1); mesh.userData.hk = row.asset.heights?.[form] ?? row.asset.size.height;
  return mesh;
}

const REGROWN = {};   // a tree grown again from another seed, kept (the library's Random)
/** A scatter engine (src/scatter/index.js finds it): what an asset's placement.engine 'trees' names. */
export const engine = {
  id: 'trees',
  row: (a) => ({ ...scatterRow(a), cell: standOf(a).cell }),   // its cells are its stand's (the biome's), over the common row
  create: createTrees,
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
