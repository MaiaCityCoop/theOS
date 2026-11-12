// The ground's material (node code): one grid tile per quadtree node (terrain.js), raised to the land in the vertex
// stage and morphed towards the coarser grid at its edge; in the fragment, every biome's grounds laid where its own rule
// says (biomes/*.js: where), in its layer's order, each material two takes mixed by noise so nothing tiles, the higher
// one winning at a seam; lit by the shading contract.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, attribute, positionGeometry, varyingProperty, dFdx, dFdy, If, abs, max, clamp, mix, smoothstep, length, normalize, pow, fract, exp2, step, uint } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { int } from 'three/tsl';
import { camDist, riverInfo, riverNear, heightAt, baseB, pathN, pathMask, bareMask, outcropMask, grassTint, vnoise, placeOff, stageAt, biomesAt, roofAt, BASE, LAID } from '../world/land.nodes.js';
import { finish, skyLight, weathered, cloudAt, cloudShade, snowCover, snowDrift, SNOW } from '../world/light.js';
import noise from '../../materials/noise.js';

export const GRID = 16, R0 = 48;   // quads per node side; level 0's range (m)

/** The node's grid point, morphed: (world x, z) */
export function gridPoint() {
  const node = attribute('aNode', 'vec4'), g = positionGeometry.xz, cell = node.z.div(GRID), rng = exp2(node.w).mul(R0);
  const k = clamp(camDist(node.xy.add(g.mul(cell))).sub(rng.mul(0.8)).div(rng.mul(0.15)), 0, 1);
  return node.xy.add(g.sub(fract(g.mul(0.5)).mul(2).mul(k)).mul(cell));
}

export function terrainMaterial(tex) {
  // ---- vertex: the land's height and normal, the river here, every biome's share ----
  // one Fn, every value worked out once into a variable and handed on by name: an expression used twice would otherwise be
  // written out twice, the river three times over at every use, which a browser's shader compiler need not fold back
  const vWorld = varyingProperty('vec3', 'tWorld'), vI = varyingProperty('vec4', 'tI'), vN = varyingProperty('vec3', 'tN');
  const vPth = varyingProperty('vec3', 'tPth'), vOut = varyingProperty('float', 'tOut'), vHill = varyingProperty('float', 'tHill'), vGD = varyingProperty('vec2', 'tGD');
  // every biome's share (half a metre apart near by; a biome's edge varies over metres, not pixels) in vec4 lanes: its
  // share, then its spots' where it has them
  const shareLane = []; let nl = 0; for (const bio of LAID) { shareLane.push(nl); nl += bio.spots?.where ? 2 : 1; }
  const packs = [...Array(Math.ceil(nl / 4))].map((_, i) => varyingProperty('vec4', `tLane${i}`)), lane = (i) => packs[i >> 2].element(i & 3);
  const vertex = Fn(() => {
    const wp = gridPoint().toVar(), dist = camDist(wp).toVar(), e = max(0.3, dist.div(96)).toVar();
    const at = (q, near) => { const I = (near ? riverNear(q, near) : riverInfo(q)).toVar(), d = abs(I.x).toVar(); return { I, d, h: heightAt(q, dist, d, I.y, I.z).toVar() }; };
    const C = at(wp), X = at(wp.add(vec2(e, 0)), C.I), Z = at(wp.add(vec2(0, e)), C.I), h = C.h;
    vWorld.assign(vec3(wp.x, h, wp.y)); vI.assign(C.I); vN.assign(normalize(vec3(h.sub(X.h), e, h.sub(Z.h))));   // (vWorld without the snow's depth: the light and the air do not need it)
    vPth.assign(pathN(wp)); vOut.assign(outcropMask(wp)); vHill.assign(h.sub(baseB(wp)));   // how far this ground stands over the valley's floor
    const ctx = { p: wp, dist, d: C.d, w: C.I.y, b: C.I.z }, Lv = biomesAt(ctx, true), lanes = [];
    Lv.shares.forEach(({ b: bio, w }) => { lanes.push(w); if (bio.spots?.where) lanes.push(bio.spots.where(ctx)); });
    while (lanes.length % 4) lanes.push(float(0));
    packs.forEach((v, i) => v.assign(vec4(lanes[i * 4], lanes[i * 4 + 1], lanes[i * 4 + 2], lanes[i * 4 + 3])));
    vGD.assign(vec2(Lv.grassy, Lv.dry));
    // the snow lifts the ground it lies on (not the river's channel): what stands on the land sinks into it as deep
    return vec3(wp.x, h.add(U.uSnow.mul(smoothstep(C.I.y, C.I.y.add(1.5), C.d)).mul(float(1).sub(roofAt(wp)))), wp.y);
  });

  // ---- fragment ----
  const T = (gr) => ({ m: gr.material, t1: gr.tile[0], t2: gr.tile[1] });
  const FLOOR = T(BASE.floor), PATCH = T(BASE.patches), SLOPE = BASE.slopes && T(BASE.slopes), carpet = BASE.grass.carpet;
  const rot = (q) => vec2(q.x.mul(0.6).sub(q.y.mul(0.8)), q.x.mul(0.8).add(q.y.mul(0.6)));
  const rotB = (q) => vec2(q.x.mul(0.8).add(q.y.mul(0.6)), q.x.mul(-0.6).add(q.y.mul(0.8)));

  const frag = Fn(() => {
    const p = vWorld.xz, dx = dFdx(p), dy = dFdy(p);
    const rdist = length(vWorld.sub(U.uCam)), dist2 = rdist.mul(U.uLodInv);   // the true distance (for the air), and the lens's (for detail)
    // every noise is let go before it is finer than a pixel: far away it would only shimmer
    const mx = dist2.lessThan(140).select(mix(vnoise(p.mul(1 / 5.3), uint(90)), 0.5, smoothstep(50, 140, dist2)), float(0.5));
    const pr = rot(p), prr = rotB(p);
    // the land's colour variation, from the baked cloudy noise
    const nz = (q) => tex.a(noise, q);
    const macro = nz(prr.mul(1 / 97).add(0.37)).b.sub(0.5).mul(0.16).add(nz(pr.mul(1 / 700)).a.sub(0.5).mul(0.2)).add(nz(p.mul(1 / 4500).add(0.11)).r.sub(0.5).mul(0.18)).add(1);
    const d = abs(vI.x), w = vI.y, b = vI.z;
    const L = { shares: LAID.map((bio, k) => ({ b: bio, w: lane(shareLane[k]), spots: bio.spots?.where ? lane(shareLane[k] + 1) : null })), grassy: vGD.x, dry: vGD.y };   // every biome's share here, from the vertices
    const tint = grassTint(tex, p, L.dry);
    // the grass as a carpet, at three sizes: blades near, tufts further, drifts of them from high up
    const g1 = tex.a(carpet, p.div(1.6)), g2 = tex.a(carpet, pr.div(9.6)), g3 = tex.a(carpet, prr.div(57));
    const gn1 = tex.n(carpet, p.div(1.6)), gn2 = tex.n(carpet, pr.div(9.6));
    const gk = smoothstep(25, 110, dist2), gk2 = smoothstep(300, 1400, dist2);
    const glum = mix(mix(g1.a, g2.a, gk), mix(g2.a, g3.a, 0.6), gk2);
    const gq0 = gn2.xy.mul(2).sub(1), gq = vec2(gq0.x.mul(0.6).add(gq0.y.mul(0.8)), gq0.x.mul(-0.8).add(gq0.y.mul(0.6)));
    const gnrm = mix(gn1.xy.mul(2).sub(1), gq, gk).mul(float(1).sub(gk2.mul(0.7)));
    const path = placeOff(p, pathMask(vPth)).mul(float(1).sub(smoothstep(70, 220, dist2)));   // a path is a thing of the near ground
    const stage = stageAt(p), bare = max(dist2.lessThan(160).select(bareMask(p).mul(float(1).sub(smoothstep(100, 160, dist2))), float(0)), stage);   // the library's stage is bare of grass

    // two takes of a material, turned and resized, mixed by noise, into the working material M; blend lays one over it
    const smp = (S) => {
      const p2 = rot(p), dx2 = rot(dx), dy2 = rot(dy);
      const a1 = tex.a(S.m, p.div(S.t1)).grad(dx.div(S.t1), dy.div(S.t1)), a2 = tex.a(S.m, p2.div(S.t2)).grad(dx2.div(S.t2), dy2.div(S.t2));
      const n1 = tex.n(S.m, p.div(S.t1)).grad(dx.div(S.t1), dy.div(S.t1)), n2 = tex.n(S.m, p2.div(S.t2)).grad(dx2.div(S.t2), dy2.div(S.t2));
      const q0 = n2.xy.mul(2).sub(1), q = vec2(q0.x.mul(0.6).add(q0.y.mul(0.8)), q0.x.mul(-0.8).add(q0.y.mul(0.6)));
      const kk = smoothstep(0.35, 0.65, mx.add(a2.a.sub(a1.a).mul(0.3)));
      return { c: mix(a1.rgb.mul(a1.rgb), a2.rgb.mul(a2.rgb), kk), h: mix(a1.a, a2.a, kk), n: mix(n1.xy.mul(2).sub(1), q, kk) };
    };
    const own = (S) => { const s0 = smp(S); return { c: s0.c.toVar(), h: s0.h.toVar(), n: s0.n.toVar() }; };
    const M = own(FLOOR);
    const blend = (Mm, Bm, t) => {   // the higher material wins at the seam
      const k0 = clamp(t.sub(0.5).mul(3).add(0.5).add(Bm.h.sub(Mm.h).mul(0.8)), 0, 1), k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
      Mm.c.assign(mix(Mm.c, Bm.c, k)); Mm.h.assign(mix(Mm.h, Bm.h, k)); Mm.n.assign(mix(Mm.n, Bm.n, k));
    };
    const lay = (bio, wt, sp) => If(wt.greaterThan(0.003), () => {   // a biome's ground, with its spots in it, laid over what is there
      if (!sp) return blend(M, smp(T(bio.floor)), wt);
      const C = own(T(bio.floor));
      If(sp.greaterThan(0.003), () => blend(C, smp(T(bio.spots)), sp));
      blend(M, C, wt);
    });
    // the grassy biomes first, then the base's bare patches; over them the grass's carpet; then the base's paths, and the
    // biomes nothing grows on (and the base's rock on its slopes) in their layers' order
    for (const { b: bio, w: wt, spots } of L.shares) if (bio.grass) lay(bio, wt.mul(bio.mix ?? 1), spots);
    const bd = max(bare.sub(stage).max(0).mul(float(1).sub(L.dry)), vOut.mul(0.25));
    If(bd.greaterThan(0.003), () => blend(M, smp(PATCH), bd));
    const cv = float(1).sub(bare).mul(L.grassy).mul(smoothstep(4, 60, dist2).mul(0.18).add(0.82));   // where the blades end, nothing shows
    M.c.assign(mix(M.c, tint.rgb.mul(glum.mul(1.05).add(0.32)).mul(mix(0.5, 1, smoothstep(3, 70, dist2))), cv)); M.n.assign(mix(M.n, gnrm.mul(1.4), cv)); M.h.assign(mix(M.h, glum, cv));
    If(path.greaterThan(0.003), () => blend(M, smp(PATCH), path));
    const steep = smoothstep(0.8, 0.68, vN.y), slopeAt = BASE.slopes?.layer ?? Infinity;
    let sloped = !SLOPE;
    for (const { b: bio, w: wt, spots } of L.shares) {
      if (bio.grass) continue;
      if (!sloped && bio.layer > slopeAt) { sloped = true; If(steep.greaterThan(0.003), () => blend(M, smp(SLOPE), steep)); }
      lay(bio, wt.mul(bio.mix ?? 1), spots);
    }
    if (!sloped) If(steep.greaterThan(0.003), () => blend(M, smp(SLOPE), steep));
    // the library's stage: its own ground laid into the land like any other, its frayed edge blended by height (uStageGround:
    // a material's layer and tile; -1: the base biome's bare earth)
    If(stage.greaterThan(0.003), () => {
      const g = U.uStageGround, layer = g.x.lessThan(0).select(float(tex.layer(PATCH.m)), g.x);
      blend(M, smp({ m: int(layer), t1: g.y, t2: g.y.mul(1.6) }), stage);
    });

    const wet = float(1).sub(smoothstep(w.mul(0.9), w.add(2.5), d));
    // depth up close, from the material's own height: what lies low (the gaps between stones, a crack) sits in its
    // neighbours' shade, and the relief reads deeper; let go with distance, where it would only darken the whole
    const near = float(1).sub(smoothstep(12, 70, dist2)), cav = mix(1, smoothstep(0.08, 0.5, M.h).mul(0.62).add(0.38), near.mul(float(1).sub(cv.mul(0.6))));
    // snow: as deep as uSnow, deeper in drifts and thinner on the rises between; what stands out of the ground (a pebble's
    // top, the grass's carpet) shows through until it is covered; none on the water. Under it the ground's own relief goes.
    const drift = float(0.5).toVar(); If(U.uSnow.greaterThan(0.001), () => { drift.assign(snowDrift(p)); });   // only while snow lies
    const lift = M.h.mul(0.025).add(cv.mul(glum).mul(smoothstep(20, 90, dist2).mul(0.14)))   // near, the blades stand on their own: the ground under them is the snow's.add(drift.sub(0.5).mul(U.uSnow.mul(0.8)));
    const snow = snowCover(vN, lift).mul(smoothstep(w, w.add(1.5), d)).mul(float(1).sub(roofAt(p)));   // none under a roof
    M.n.assign(M.n.mul(float(1).sub(snow.mul(0.85))));
    const n = normalize(vN.add(vec3(M.n.x, 0, M.n.y).mul(float(1).sub(smoothstep(60, 400, dist2).mul(0.7)).mul(near.mul(0.7).add(1)))));
    // relief: hollows sit in shade, crowns in light; slopes facing the sun lit harder than the plain normal says
    const relief = mix(0.74, 1.1, smoothstep(-6, 16, vHill));
    const s0 = max(n.dot(U.uSunDir), 0), sunl = mix(s0, smoothstep(0.55, 0.95, s0), smoothstep(60, 600, dist2).mul(0.5));
    const col = weathered(mix(M.c.mul(mix(1, 0.5, wet)).mul(macro).mul(cav), SNOW.mul(drift.mul(0.12).add(0.9)), snow).mul(relief), n, 9).mul(skyLight(n).mul(cloudShade(vWorld).mul(0.3).add(0.7)).add(U.uSun.mul(cloudAt(vWorld)).mul(sunl)));   // under a cloud the sky is dimmer too
    const V = normalize(U.uCam.sub(vWorld));
    return finish(col.add(U.uSun.mul(pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 48)).mul(0.3).mul(wet)), vWorld);
  });

  const m = new THREE.NodeMaterial(); m.positionNode = vertex(); m.fragmentNode = frag();
  return m;
}
