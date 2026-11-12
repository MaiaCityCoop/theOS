// Trees: the assets of kind `tree` (assets/stonepine.js), scattered where their biome lies (placement.biome), one at
// most in a cell. Like the rocks (rocks.js): a tier per level of detail, each drawn only in the band of distances where a
// tree of it is the size on screen its kind asks (assets/kinds.js), and on WebGPU packed by a compute pass, so only the
// trees that stand are drawn (tier.js). Past the last level the trees are not drawn: their biome's canopy colours the
// land there (src/terrain/material.js), so a forest to the horizon costs nothing more.
import * as THREE from 'three/webgpu';
import { Fn, float, uint, vec2, vec3, vec4, uniform, varyingProperty, attribute, positionGeometry, If, Discard, abs, max, mix, smoothstep, pow, normalize, length, floor, cos, sin, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, vnoise, camDist, riverInfo, heightAt, shareOf } from '../world/land.nodes.js';
import { finish, skyLight, weathered, snowLift, cloudAt, detailCut, detailKeep, unlit, windAt } from '../world/light.js';
import { PLACES } from '../world/places.js';
import { recipe } from '../core/registry.js';
import { geometryOf } from '../../assets/index.js';
import KINDS from '../../assets/kinds.js';
import { pxK } from '../detail/index.js';
import { Tier, offScreen, clipOf, MAXP } from './tier.js';

const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));

// 1 where a tree may stand, 0 within what stands at a place (its clearing) or on the library's stage
const clearAt = (p) => {
  let c = float(1);
  for (const P of Object.values(PLACES)) c = c.mul(smoothstep(P.clear + 2, P.clear + 6, length(p.sub(vec2(P.x, P.z)))));
  return c.mul(U.uStage.z.greaterThan(0).select(smoothstep(U.uStage.z.add(1), U.uStage.z.add(5), length(p.sub(U.uStage.xy))), float(1)));
};

// what stands in a cell: a tree of this level, or nothing; packed into two vec4 (A: x, z, its foot's height, its scale;
// B: its turn, its sway's phase, its shade, its share of the hand-over between levels and side packed). Done once per
// tree (src/scatter/tier.js); the cheap test first, as most cells hold none.
function treeIn(c, row, Lv, band, biome) {
  const P = row.asset.placement, H = row.asset.size.height, cx = c.x, cy = c.y;
  const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar();
  const pos = vec2(c).add(0.2).add(vec2(rnd(cx, cy, uint(302)), rnd(cx, cy, uint(303))).mul(0.6)).mul(row.cell), dist = camDist(pos);
  If(dist.lessThan(band.far).and(dist.greaterThanEqual(band.near)), () => {
    const r0 = rnd(cx, cy, uint(300));
    // groves and glades: a stand is not a plantation (a noise as wide as P.clumps sets how thick it grows here)
    const grove = P.clumps ? smoothstep(0.25, 0.7, vnoise(pos.div(P.clumps), uint(308))).mul(1.5) : float(1), dens = grove.mul(P.density);
    If(r0.lessThan(shareOf(biome, { p: pos, dist, d: float(1e5), w: float(1), b: float(0) }).mul(dens)), () => {   // its stands, as if far from the river
      const I = riverInfo(pos), d = abs(I.x), w = I.y;
      If(r0.lessThan(shareOf(biome, { p: pos, dist, d, w, b: I.z }).mul(dens).mul(clearAt(pos))), () => {
        const s = mix(P.scale[0], P.scale[1], rnd(cx, cy, uint(304)));
        const keep = detailKeep(s.mul(H).mul(PXK).div(max(dist, 1e-3)), Lv.lo, Lv.hi, row.detail.fade);   // its size on screen picks the level
        If(keep.x.greaterThan(0), () => {
          A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(0.15), s));
          B.assign(vec4(rnd(cx, cy, uint(305)).mul(6.2831853), rnd(cx, cy, uint(306)).mul(6.2831853), rnd(cx, cy, uint(307)), keep.x.add(keep.y.mul(2))));
          alive.assign(1);
        });
      });
    });
  });
  return { alive: alive.greaterThan(0.5), data: [A, B] };
}

// the tree's material: shape(A, B) its vertex from what treeIn packed, swayed by the wind; lit like any asset, its crown
// rounded as one dome (a parasol of needles takes the light as a whole, not facet by facet)
function treeMaterial(row) {
  const a = row.asset, H = a.size.height, sway = (a.wind ?? KINDS[a.kind]?.wind)?.sway ?? 0, cr = a.crown;
  return () => {
    const vWorld = varyingProperty('vec3', 'tWorld'), vN = varyingProperty('vec3', 'tN'), vCol = varyingProperty('vec3', 'tCol'), vKeep = varyingProperty('vec2', 'tKeep'), vAo = varyingProperty('float', 'tAo');
    const shape = (A, B) => {
      const s = A.w, cs = cos(B.x), sn = sin(B.x), turn = (v) => vec3(v.x.mul(cs).sub(v.z.mul(sn)), v.y, v.x.mul(sn).add(v.z.mul(cs)));
      const lean = vec2(cos(B.y), sin(B.y)).mul(B.z.sub(0.5).mul(2 * (a.placement.lean ?? 0))), lp = positionGeometry.add(vec3(lean.x, 0, lean.y).mul(positionGeometry.y)), up = clamp(lp.y.div(H), 0, 1);   // each leans its own way
      // the wind: the crown sways, the foot stays (the push grows with height squared), and a slow sway of its own
      const k = windAt(A.xy).mul(up.mul(up).mul(sway).mul(s)).add(vec2(sin(U.uTime.mul(0.9).add(B.y)), cos(U.uTime.mul(0.7).add(B.y))).mul(up.mul(up).mul(0.05).mul(s)));
      const w = vec3(A.x, A.z, A.y).add(turn(lp.mul(s))).add(vec3(k.x, 0, k.y));
      let n = turn(attribute('normal', 'vec3'));
      if (cr) {
        const inCrown = smoothstep(cr[1] - 2.2, cr[1] - 1.2, lp.y), dome = turn(lp.sub(vec3(cr[0], cr[1] - 1.5, cr[2])).mul(vec3(1, 2.6, 1)));
        n = mix(n, normalize(dome), inCrown.mul(0.7));
        vAo.assign(mix(0.55, 1, smoothstep(cr[1] - 2.5, cr[1] - 1.2, lp.y)));   // the trunk under the crown in its shade
      } else vAo.assign(1);
      vN.assign(normalize(n)); vWorld.assign(w); vCol.assign(attribute('color', 'vec3').mul(B.z.mul(0.3).add(0.85)));
      const side = floor(B.w.mul(0.5)); vKeep.assign(vec2(B.w.sub(side.mul(2)), side));
      return clipOf(w);
    };
    const frag = Fn(() => {
      If(detailCut(vKeep), () => { Discard(); });
      const out = vec4(0).toVar();
      If(unlit().not(), () => {   // drawn into the shadow map: only its depth counts
        const nw = normalize(vN), n = nw.dot(U.uCam.sub(vWorld)).lessThan(0).select(nw.negate(), nw);
        const ndl = n.dot(U.uSunDir).add(0.3).div(1.3).max(0);   // needles take the light round their edge
        const col = weathered(vCol, n, snowLift(vWorld, row.snow?.clumps ?? 0.3)).mul(skyLight(n).mul(vAo).add(U.uSun.mul(cloudAt(vWorld)).mul(ndl).mul(vAo.mul(0.4).add(0.6))));
        out.assign(finish(col, vWorld));
      });
      return out;
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide;
    return { m, shape };
  };
}

/** The assets of kind `tree`: a tier per level of detail, each where a tree of it is the size on screen its kind asks. */
export function createTrees(scene, tex, ground, row, gpu = false) {
  const a = row.asset, P = a.placement, biome = recipe(P.biome), H = a.size.height, tiers = [], make = treeMaterial(row);
  if (!biome) return tiers;
  for (const Lv of row.detail.levels.filter((l) => !l.impostor)) {
    const g = geometryOf(a, Lv); g.setIndex([...Array(g.attributes.position.count).keys()]);   // (a tier's draw counts indices)
    const band = { near: uniform(0), far: uniform(1) }, live = (c) => treeIn(c, row, Lv, band, biome);
    const material = (src) => {
      const { m, shape } = make();
      m.vertexNode = src.read ? Fn(() => shape(src.read(0), src.read(1)))()   // ready-made by the compute pass
        : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive, () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out per vertex
      return m;
    };
    const t = new Tier(scene, g, material, { cell: P.cell, P: Lv.P, near: 0, far: 1, order: 1, live, gpu, cap: Math.ceil(MAXP * Lv.P * Lv.P * 0.25), slots: 2 });
    t.band = () => {   // the distances where a tree of this level can be, from the largest seen small to the smallest seen large
      const K = pxK(), e = Math.exp(row.detail.fade);
      t.near = Number.isFinite(Lv.hi) ? (H * P.scale[0] * K) / (Lv.hi * e) : 0; t.far = (H * P.scale[1] * K * e) / Lv.lo;
      band.near.value = t.near > 0 ? t.near : -1; band.far.value = t.far;
    };
    t.band(); if (row.detail.casts && t.near < 250) t.mesh.layers.enable(1); tiers.push(t);   // trees cast shadows, as drawn (src/world/shadow.js); the far level not: the shadow map does not reach it
  }
  addEventListener('resize', () => tiers.forEach((t) => t.band()));
  return tiers;
}
