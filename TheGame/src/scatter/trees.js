// Trees: the assets of kind `tree` (assets/stonepine.js), scattered where their biome lies (placement.biome), one at
// most in a cell. Like the rocks (rocks.js): a tier per level of detail, each drawn only in the band of distances where a
// tree of it is the size on screen its kind asks (assets/kinds.js), and on WebGPU packed by a compute pass, so only the
// trees that stand are drawn (tier.js). Past the last level the trees are not drawn: their biome's canopy colours the
// land there (src/terrain/material.js), so a forest to the horizon costs nothing more.
import * as THREE from 'three/webgpu';
import { Fn, float, uint, vec2, vec3, vec4, uniform, varyingProperty, attribute, positionGeometry, If, Discard, abs, max, mix, smoothstep, pow, normalize, length, floor, cos, sin, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { rnd, vnoise, camDist, riverInfo, heightAt, shareOf } from '../world/land.nodes.js';
import { finish, skyLight, weathered, snowLift, cloudAtVertex, detailCut, detailKeep, unlit, windAt } from '../world/light.js';
import { PLACES } from '../world/places.js';
import { recipe } from '../core/registry.js';
import { geometryOf } from '../../assets/index.js';
import KINDS from '../../assets/kinds.js';
import { pxK } from '../detail/index.js';
import { Tier, offScreen, clipOf, MAXP } from './tier.js';
import { setTrunks } from '../world/trunks.js';

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
function treeIn(c, row, Lv, band, biome, shapes = 1, all = false) {
  const P = row.asset.placement, H = row.asset.size.height, cx = c.x, cy = c.y;
  const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar();
  const pos = vec2(c).add(0.08).add(vec2(rnd(cx, cy, uint(302)), rnd(cx, cy, uint(303))).mul(0.84)).mul(row.cell), dist = camDist(pos);
  const bucket = floor(rnd(cx, cy, uint(309)).mul(shapes));   // which of its shapes stands here
  const range = all ? length(pos.sub(U.uCam.xz)) : dist;   // the shadow's stand-in: metres round the camera, whatever the lens
  If(range.lessThan(band.far).and(range.greaterThanEqual(band.near)), () => {
    const r0 = rnd(cx, cy, uint(300));
    // groves and glades: a stand is not a plantation (a noise as wide as P.clumps sets how thick it grows here)
    const grove = P.clumps ? smoothstep(0.22, 0.72, vnoise(pos.div(P.clumps), uint(308)).mul(0.7).add(vnoise(pos.div(P.clumps * 0.27), uint(310)).mul(0.3))).mul(1.6) : float(1), dens = grove.mul(P.density);
    If(r0.lessThan(shareOf(biome, { p: pos, dist, d: float(1e5), w: float(1), b: float(0) }).mul(dens)), () => {   // its stands, as if far from the river
      const I = riverInfo(pos), d = abs(I.x), w = I.y;
      If(r0.lessThan(shareOf(biome, { p: pos, dist, d, w, b: I.z }).mul(dens).mul(clearAt(pos))), () => {
        const s = mix(P.scale[0], P.scale[1], pow(rnd(cx, cy, uint(304)), 1.3));   // more young than old
        const keep = all ? vec2(1, 0) : detailKeep(s.mul(H).mul(PXK).div(max(dist, 1e-3)), Lv.lo, Lv.hi, row.detail.fade);   // its size on screen picks the level (the shadow's stand-in: every tree in its band)   // its size on screen picks the level
        If(keep.x.greaterThan(0), () => {
          A.assign(vec4(pos, heightAt(pos, dist, d, w, I.z).sub(0.15), s));
          B.assign(vec4(rnd(cx, cy, uint(305)).mul(6.2831853), rnd(cx, cy, uint(306)).mul(6.2831853), rnd(cx, cy, uint(307)), keep.x.add(keep.y.mul(2))));
          alive.assign(1);
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
  const a = row.asset, H = a.size.height, sway = (a.wind ?? KINDS[a.kind]?.wind)?.sway ?? 0, M = a.materials || {};
  return () => {
    const vWorld = varyingProperty('vec3', 'tWorld'), vN = varyingProperty('vec3', 'tN'), vUv = varyingProperty('vec2', 'tUv'), vKeep = varyingProperty('vec2', 'tKeep');
    const vAo = varyingProperty('float', 'tAo'), vPart = varyingProperty('float', 'tPart'), vShade = varyingProperty('vec3', 'tShade'), vCn = varyingProperty('vec3', 'tCn');
    const part = attribute('part', 'float'), ao = attribute('ao', 'float');
    const shape = (A, B) => {
      const s = A.w, cs = cos(B.x), sn = sin(B.x), turn = (v) => vec3(v.x.mul(cs).sub(v.z.mul(sn)), v.y, v.x.mul(sn).add(v.z.mul(cs)));
      const lean = vec2(cos(B.y), sin(B.y)).mul(B.z.sub(0.5).mul(2 * (a.placement.lean ?? 0))), lp = positionGeometry.add(vec3(lean.x, 0, lean.y).mul(positionGeometry.y)), up = clamp(lp.y.div(H), 0, 1);   // each leans its own way
      // the wind: the crown sways, the foot stays (the push grows with height squared), a slow sway of its own; and the
      // needles' brushes flutter, quicker and wider the harder it blows
      const push = windAt(A.xy), ws = U.uWind.z;
      const k = push.mul(up.mul(up).mul(sway).mul(s)).add(vec2(sin(U.uTime.mul(0.9).add(B.y)), cos(U.uTime.mul(0.7).add(B.y))).mul(up.mul(up).mul(0.05).mul(s)));
      const flutter = sin(U.uTime.mul(ws.mul(8).add(2.5)).add(lp.x.mul(1.9)).add(lp.z.mul(2.3)).add(lp.y.mul(1.3)).add(B.y)).mul(ws.mul(0.09).add(0.015)).mul(part);
      const w = vec3(A.x, A.z, A.y).add(turn(lp.mul(s))).add(vec3(k.x.add(push.x.mul(flutter)), flutter.mul(0.4), k.y.add(push.y.mul(flutter))));
      let n = turn(attribute('normal', 'vec3'));
      vN.assign(normalize(n)); vWorld.assign(w); vUv.assign(attribute('uv', 'vec2')); vAo.assign(ao); vPart.assign(part); vCn.assign(turn(attribute('cn', 'vec3')));
      // each tree its own green: lighter or darker, and warmer (yellower) or cooler (bluer)
      vShade.assign(mix(vec3(1.07, 1.0, 0.78), vec3(0.86, 0.98, 1.1), B.y.mul(1.1631).fract()).mul(B.z.mul(0.3).add(0.84)));
      const side = floor(B.w.mul(0.5)); vKeep.assign(vec2(B.w.sub(side.mul(2)), side));
      return clipOf(w);
    };
    const frag = Fn(() => {
      If(detailCut(vKeep), () => { Discard(); });
      const leaf = vPart.greaterThan(0.5), T = vec4(0).toVar();
      // the needles' outline: cut where the tuft is not; far off its mips thin it out, so the cut lowers
      If(leaf, () => {
        T.assign(tex.a(M.leaves ?? M.needles, vUv));
        // a card seen edge-on is a flat sliver, not a brush: the nearer edge-on, the more of it is cut away (not in the shadow map)
        const edge = unlit().select(float(1), abs(normalize(vCn).dot(normalize(U.uCam.sub(vWorld)))));
        If(T.a.lessThan(mix(mix(0.45, 0.16, smoothstep(15, 220, length(U.uCam.sub(vWorld)))), 0.97, smoothstep(0.42, 0.06, edge))), () => { Discard(); });
      });   // (far off a mip's needles are fainter: the cut lowers with them, so the crown stays full)
      const out = vec4(0).toVar();
      If(unlit().not(), () => {   // drawn into the shadow map: only its depth (and its cut-out) counts
        const nw = normalize(vN), V = normalize(U.uCam.sub(vWorld)), n = nw.dot(V).lessThan(0).select(nw.negate(), nw);
        const albedo = vec3(0).toVar();   // its bark (darker in its fissures) or its needles: only the one it is read
        If(leaf, () => { albedo.assign(T.rgb.mul(T.rgb).mul(vShade)); }).Else(() => { const W = tex.a(M.wood, vUv); albedo.assign(W.rgb.mul(W.rgb).mul(mix(0.55, 1, W.a))); });
        const ndl = leaf.select(n.dot(U.uSunDir).add(0.45).div(1.45), n.dot(U.uSunDir)).max(0);   // needles take the light round their edge
        const through = leaf.select(pow(max(V.negate().dot(U.uSunDir), 0), 3).mul(0.55), float(0));   // the sun behind a brush of needles shines through it
        const sun = U.uSun.mul(cloudAtVertex(vWorld));   // one tap of the shadow map, not twelve: a crown is many layers of cards deep, and its needles' own cut-out is soft enough
        const col = weathered(albedo, n, snowLift(vWorld, row.snow?.clumps ?? 0.3)).mul(skyLight(n).mul(vAo.mul(vAo).mul(0.75).add(vAo.mul(0.25))).add(sun.mul(ndl.add(through)).mul(vAo.mul(0.6).add(0.4))));
        out.assign(finish(col, vWorld));
      });
      return out;
    });
    const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide;
    return { m, shape };
  };
}

/** The assets of kind `tree`: a tier per level of detail (its shapes buckets of it), each where a tree of it is the size on screen its kind
    asks; and, when its detail names one, a stand-in drawn only into the shadow map (layer 1): every tree round the camera
    at its coarser level, the shade of a crown at a fraction of its finest cards' cost. */
export function createTrees(scene, tex, ground, row, gpu = false) {
  const a = row.asset, P = a.placement, biome = recipe(P.biome), H = a.size.height, tiers = [], make = treeMaterial(tex, row);
  if (!biome) return tiers;
  const levels = row.detail.levels.filter((l) => !l.impostor), shapes = levels[0]?.meshes?.length ?? 1, SH = a.detail.shadow;
  // a tier per level: its cells worked out once, each tree dropped into its shape's mesh (tier.js: buckets)
  const tier = (Lv, shadow) => {
    const geos = Array.from({ length: shapes }, (_, v) => { const g = geometryOf(a, Lv, v); if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g; });   // (a tier's draw counts indices)
    const band = { near: uniform(0), far: uniform(1) }, live = (c) => treeIn(c, row, Lv, band, biome, shapes, shadow);
    const material = (src, k) => {
      const { m, shape } = make();
      m.vertexNode = src.read ? Fn(() => shape(src.read(0), src.read(1)))()   // ready-made by the compute pass
        : Fn(() => { const L = live(src), out = offScreen().toVar(); If(L.alive.and(L.bucket.equal(float(k))), () => { out.assign(shape(...L.data)); }); return out; })();   // the fallback: worked out per vertex
      return m;
    };
    // (the stand-in in small patches: those whose shade cannot reach the view are dropped)
    const t = new Tier(scene, geos, material, { cell: P.cell, P: shadow ? 4 : Lv.P, near: 0, far: 1, order: 1, live, gpu, cap: Math.ceil((MAXP * (shadow ? 16 : Lv.P * Lv.P) * 0.4) / shapes), slots: 2, ...(shadow ? { cull: SH.reach ?? 20, fixed: SH.far * 2.4 } : {}) });
    t.band = shadow ? () => { t.near = 0; t.far = SH.far; band.near.value = -1; band.far.value = SH.far * 2.4; }   // (grown with the camera's height by Tier.select's patches)
      : () => {   // the distances where a tree of this level can be, from the largest seen small to the smallest seen large
        const K = pxK(), e = Math.exp(row.detail.fade);
        t.near = Number.isFinite(Lv.hi) ? (H * P.scale[0] * K) / (Lv.hi * e) : 0; t.far = (H * P.scale[1] * K * e) / Lv.lo;
        band.near.value = t.near > 0 ? t.near : -1; band.far.value = t.far;
      };
    t.band(); t.level = Lv.i;
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
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.enable(1);
  return mesh;
}
