// The ground's material (node code): one grid tile per quadtree node (terrain.js), raised to the land in the vertex
// stage and morphed towards the coarser grid at its edge; in the fragment, every biome's grounds laid where its own rule
// says (biomes/*.js: where), in its layer's order, each material two takes mixed by noise so nothing tiles, the higher
// one winning at a seam; lit by the shading contract.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, attribute, positionGeometry, varyingProperty, dFdx, dFdy, If, screenCoordinate, abs, max, min, clamp, mix, smoothstep, length, normalize, pow, fract, exp2, step, uint } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { recipes, byRole } from '../core/registry.js';
import { detailOf, sizeOf } from '../detail/index.js';
import { int } from 'three/tsl';
import { camDist, riverInfo, riverNear, heightAt, baseB, pathN, pathMask, bareMask, outcropMask, grassTint, vnoise, placeOff, stageAt, biomesAt, shareOf, roofAt, groveAt, leadAt, BASE, LAID } from '../world/land.nodes.js';
import { kindsOf } from '../world/stand.js';
import { BOX } from '../world/shadow.js';
import { finish, ign, skyLight, weathered, shadowAt, sunDim, cloudShade, snowCover, snowDrift, snowDepth, SNOW } from '../world/light.js';
const noise = byRole('noise');   // the baked cloudy noise: whichever material plays that part (its `role`)

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
  const vPth = varyingProperty('vec3', 'tPth'), vOut = varyingProperty('float', 'tOut'), vHill = varyingProperty('float', 'tHill'), vGD = varyingProperty('vec2', 'tGD'), vTint = varyingProperty('vec4', 'tTint');
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
    vTint.assign(grassTint(tex, wp, Lv.dry, 1));   // the grass's colour changes over tens of metres: worked out per vertex, not per pixel
    // the snow lifts the ground it lies on (not the river's channel): what stands on the land sinks into it as deep
    return vec3(wp.x, h.add(snowDepth.mul(smoothstep(C.I.y, C.I.y.add(1.5), C.d)).mul(float(1).sub(roofAt(wp)))), wp.y);
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
    // every biome's share here, from the vertices; but a river's biome (a bank, a bar) is worked out again here, per pixel,
    // from the river's distance (smooth across a cell): far off a cell is wider than a bank, and a share blended across its
    // corners would give the bank a sawtooth edge. Only where its corners hold some of it: elsewhere it costs nothing.
    const rctx = { p, dist: dist2, d, w, b };
    const shareAt = (bio, k) => {
      const v = lane(shareLane[k]); if (!bio.river) return v;
      const s = float(0).toVar(); If(v.greaterThan(0.0005), () => { s.assign(shareOf(bio, rctx)); }); return s;
    };
    const L = { shares: LAID.map((bio, k) => ({ b: bio, w: shareAt(bio, k), spots: bio.spots?.where ? lane(shareLane[k] + 1) : null })), grassy: vGD.x, dry: vGD.y };
    const tint = vTint;
    // the grass as a carpet, at three sizes: blades near, tufts further, drifts of them from high up
    // (the far take is two, turned and at scales with no whole ratio, blended by a slow mask: no grid of the same tufts from high up)
    // (each size read only where it shows: the blades' within 110 m, the drifts' past 300; in a branch a texture is read
    // with its gradients given, as a shader may not work them out there)
    const gk = smoothstep(25, 110, dist2), gk2 = smoothstep(300, 1400, dist2), dpr = rot(dx), dpr2 = rot(dy), dqx = rotB(dx), dqy = rotB(dy);
    const g2 = tex.a(carpet, pr.div(9.6)), gn2 = tex.n(carpet, pr.div(9.6));
    const g1a = float(0).toVar(), gn1 = vec2(0).toVar(), g3a = float(0).toVar();
    If(gk.lessThan(1), () => { g1a.assign(tex.a(carpet, p.div(1.6)).grad(dx.div(1.6), dy.div(1.6)).a); gn1.assign(tex.n(carpet, p.div(1.6)).grad(dx.div(1.6), dy.div(1.6)).xy.mul(2).sub(1)); });
    If(gk2.greaterThan(0), () => {
      const gk3 = smoothstep(0.35, 0.65, tex.a(noise, pr.mul(1 / 431).add(0.61)).grad(dpr.mul(1 / 431), dpr2.mul(1 / 431)).g);
      g3a.assign(mix(tex.a(carpet, prr.div(57)).grad(dqx.div(57), dqy.div(57)).a, tex.a(carpet, rot(prr).div(80.6).add(0.37)).grad(rot(dqx).div(80.6), rot(dqy).div(80.6)).a, gk3));
    });
    const glum = mix(mix(g1a, g2.a, gk), mix(g2.a, g3a, 0.6), gk2);
    const gq0 = gn2.xy.mul(2).sub(1), gq = vec2(gq0.x.mul(0.6).add(gq0.y.mul(0.8)), gq0.x.mul(-0.8).add(gq0.y.mul(0.6)));
    const gnrm = mix(gn1, gq, gk).mul(float(1).sub(gk2.mul(0.7)));
    const path = placeOff(p, pathMask(vPth)).mul(float(1).sub(smoothstep(70, 220, dist2)));   // a path is a thing of the near ground
    const stage = stageAt(p), bare = max(dist2.lessThan(160).select(bareMask(p).mul(float(1).sub(smoothstep(100, 160, dist2))), float(0)), stage);   // the library's stage is bare of grass

    // two takes of a material, turned and resized, mixed by noise, into the working material M; blend lays one over it
    // (far off one take is enough: its repeat is lost in the distance; the hand-over dithered, so it shows no line)
    const twoTakes = dist2.lessThan(ign(screenCoordinate.xy).mul(80).add(240));
    // ... but a single take's repeat would show from high up as a grid: it is pushed about by a slow noise (metres, over
    // hundreds of metres), so no two tiles lie the same (near by, where both takes are read, the push is let go)
    const wob = vec2(0).toVar();
    If(dist2.greaterThan(200), () => { wob.assign(vec2(tex.a(noise, p.mul(1 / 131)).grad(dx.mul(1 / 131), dy.mul(1 / 131)).g, tex.a(noise, pr.mul(1 / 157).add(0.3)).grad(dpr.mul(1 / 157), dpr2.mul(1 / 157)).b).sub(0.5).mul(smoothstep(200, 320, dist2).mul(9))); });
    const pw = p.add(wob);
    const smp = (S) => {
      const a1 = tex.a(S.m, pw.div(S.t1)).grad(dx.div(S.t1), dy.div(S.t1)), n1 = tex.n(S.m, pw.div(S.t1)).grad(dx.div(S.t1), dy.div(S.t1));
      const c = a1.rgb.mul(a1.rgb).toVar(), h = a1.a.toVar(), n = n1.xy.mul(2).sub(1).toVar();
      If(twoTakes, () => {
        const p2 = rot(p), dx2 = rot(dx), dy2 = rot(dy);
        const a2 = tex.a(S.m, p2.div(S.t2)).grad(dx2.div(S.t2), dy2.div(S.t2)), n2 = tex.n(S.m, p2.div(S.t2)).grad(dx2.div(S.t2), dy2.div(S.t2));
        const q0 = n2.xy.mul(2).sub(1), q = vec2(q0.x.mul(0.6).add(q0.y.mul(0.8)), q0.x.mul(-0.8).add(q0.y.mul(0.6)));
        const kk = smoothstep(0.35, 0.65, mx.add(a2.a.sub(a1.a).mul(0.3)));
        c.assign(mix(c, a2.rgb.mul(a2.rgb), kk)); h.assign(mix(h, a2.a, kk)); n.assign(mix(n, q, kk));
      });
      return { c, h, n };
    };
    const own = (S) => { const s0 = smp(S); return { c: s0.c.toVar(), h: s0.h.toVar(), n: s0.n.toVar() }; };
    const M = own(FLOOR);
    const blend = (Mm, Bm, t) => {   // the higher material wins at the seam
      const k0 = clamp(t.sub(0.5).mul(3).add(0.5).add(Bm.h.sub(Mm.h).mul(0.8)), 0, 1), k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
      Mm.c.assign(mix(Mm.c, Bm.c, k)); Mm.h.assign(mix(Mm.h, Bm.h, k)); Mm.n.assign(mix(Mm.n, Bm.n, k));
    };
    // what each kind of tree drops (its `litter`: assets/kit/tree.js), if not the biome's own floor: laid where that kind
    // leads in the biome's stand (its slice of the stand's slow noise, as its trees are placed), under its groves
    const drops = (bio) => (bio.trees ? kindsOf(bio.uid).filter((k) => k.asset.litter && k.asset.litter.material !== bio.floor.material) : []);
    // (how thick a biome's stand grows here: worked out once where the biome lies, for its litter and for its canopy below)
    const groves = new Map(LAID.filter((bio) => bio.trees).map((bio) => [bio, float(0).toVar()]));
    const lay = (bio, wt, sp) => If(wt.greaterThan(0.003), () => {   // a biome's ground, with its spots and its trees' litter in it, laid over what is there
      const fallen = drops(bio);
      if (groves.has(bio)) groves.get(bio).assign(groveAt(p, bio.trees));
      if (!sp && !fallen.length) return blend(M, smp(T(bio.floor)), wt);
      const C = own(T(bio.floor));
      if (sp) If(sp.greaterThan(0.003), () => blend(C, smp(T(bio.spots)), sp));
      if (fallen.length) {
        const lead = leadAt(p, bio.trees).mul(0.7).add(0.15), thick = smoothstep(0.1, 0.6, groves.get(bio));
        for (const { asset, slice: [a, b] } of fallen) {
          const k = (a > 0 ? smoothstep(a - 0.06, a + 0.06, lead) : float(1)).mul(b < 1 ? float(1).sub(smoothstep(b - 0.06, b + 0.06, lead)) : float(1)).mul(thick).toVar();
          If(k.greaterThan(0.003), () => blend(C, smp(T(asset.litter)), k));
        }
      }
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
    // Every stand of a biome (its trees, its undergrowth: any block of it with cells and a density, src/scatter/trees.js)
    // hands over to the land where its plants are no longer drawn, in the same groves the plants stand in
    // (src/world/noise.nodes.js: groveAt): nothing drops out of the picture, whatever is planted.
    //   - far off, where they sink away (kinds.js: sink), the land takes the stand's colour (its `cover`; the trees' is
    //     the biome's `canopy`), as much of the ground as the stand covers there;
    //   - a stand that casts shadows: its floor lies in their shade. Round the camera they are drawn (the shadow map, and
    //     in it the trees' stand-in: src/world/shadow.js, assets/kit/tree.js); past that the floor is dimmed here, unevenly,
    //     so a forest is not a plain in full sun with trees on it.
    const shade = float(0).toVar();
    const standsOf = (bio) => Object.entries(bio).filter(([, S]) => S && typeof S === 'object' && S.cell && S.density != null)
      .map(([key, S]) => ({ key, P: S, CV: S.cover ?? (key === 'trees' ? bio.canopy : null) })).filter((x) => x.CV);
    L.shares.forEach(({ b: bio, w: wt }) => standsOf(bio).forEach(({ key, P, CV }) => {
      // of what grows in the stand, the kind drawn farthest
      const A = kindsOf(bio.uid, key).map((k) => k.asset).sort((x, y) => sizeOf(y) / detailOf(y).cut - sizeOf(x) / detailOf(x).cut)[0];
      // its colour comes in where its plants go out: they are drawn while their largest side is more than their last
      // level's pixels (the same rule, by the lens and the window: src/detail), the largest to `last` metres, most of
      // them gone by two thirds of that; without such plants, its own from/to
      const cutPx = A ? detailOf(A).cut : 0, last = cutPx ? U.uPxK.mul((P.size ?? sizeOf(A) * (A.placement.scale?.[1] ?? 1)) / cutPx) : null;
      // (a stand that changes level as one, its `size`: its colour is on the land well before its plants sink, from
      // where they are still whole, so their sinking changes nothing one sees)
      const fade = last ? (P.size ? smoothstep(last.mul(0.12), last.mul(0.5), dist2) : smoothstep(last.mul(0.3), last.mul(0.68), dist2)) : smoothstep(CV.from, CV.to, dist2);
      // where its shadows are no longer drawn: past the map's box, or past the trees' stand-in in it
      const SH = A?.detail?.shadow, reach = SH ? min(U.uAirH.mul(BOX.grow).add(BOX.min), SH.far * (SH.wide ?? 2.4)) : null;
      const dim = reach ? smoothstep(reach.mul(0.8), reach, length(p.sub(U.uCam.xz))) : float(0);
      // fill: how much of a cell one of its plants covers (a tree crowns some 2.4 cells); grain: its plants' size to a tree's
      const g = CV.grain ?? 1, likes = P.where ? P.where({ p }) : float(1);
      If(wt.mul(max(fade, dim)).greaterThan(0.003), () => {
        const cover = clamp(wt.mul(key === 'trees' ? groves.get(bio) ?? groveAt(p, P) : groveAt(p, P)).mul(likes).mul((P.density ?? 1) * (CV.fill ?? 2.4)), 0, 1);
        const n = nz(p.div(23 * g).add(0.7)).r.mul(0.35).add(nz(prr.div(31.7 * g).add(0.2)).g.mul(0.35)).add(nz(pr.div(9.3 * g)).g.mul(0.3));   // (takes at scales with no whole ratio: no grid of crowns)
        const under = smoothstep(float(1.08).sub(cover.mul(0.75)), float(1.22).sub(cover.mul(0.75)), n.add(cover.mul(0.45)));   // where a plant is, as many as cover says
        // (darker than a crown's own colour: seen from afar it is mostly its own shade)
        // (from very far a plant is smaller than a pixel: the pattern goes over into its mean, no speckle to shimmer)
        const mean = smoothstep(2000 * g, 7000 * g, dist2), crown = vec3(...CV.colour).mul(mix(n, 0.5, mean).mul(0.6).add(0.42));
        const k = fade.mul(smoothstep(0, 0.15, cover)), top = k.mul(mix(under, smoothstep(0.1, 0.95, cover), mean));
        M.c.assign(mix(M.c, crown, top)); M.n.assign(M.n.mul(float(1).sub(top))); M.h.assign(mix(M.h, under, k));
        // the floor between the crowns in their shade (the crowns themselves in the light)
        if (reach) shade.assign(max(shade, dim.mul(cover).mul(n.mul(0.9).add(0.3)).min(0.85).mul(float(1).sub(top))));
      });
    }));
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
    const drift = float(0.5).toVar(); If(snowDepth.greaterThan(0.001), () => { drift.assign(snowDrift(p)); });   // only while snow lies
    // (near, the blades stand on their own: the ground under them is the snow's)
    const lift = M.h.mul(0.025).add(cv.mul(glum).mul(smoothstep(20, 90, dist2).mul(0.14)));
    const snow = snowCover(vN, lift).mul(smoothstep(w, w.add(1.5), d)).mul(float(1).sub(roofAt(p)));   // none under a roof
    M.n.assign(M.n.mul(float(1).sub(snow.mul(0.85))));
    const n = normalize(vN.add(vec3(M.n.x, 0, M.n.y).mul(float(1).sub(smoothstep(60, 400, dist2).mul(0.7)).mul(near.mul(0.7).add(1)))));
    // relief: hollows sit in shade, crowns in light; slopes facing the sun lit harder than the plain normal says
    const relief = mix(0.74, 1.1, smoothstep(-6, 16, vHill));
    const s0 = max(n.dot(U.uSunDir), 0), sunl = mix(s0, smoothstep(0.55, 0.95, s0), smoothstep(60, 600, dist2).mul(0.5));
    const cs = cloudShade(vWorld).toVar();
    const col = weathered(mix(M.c.mul(mix(1, 0.5, wet)).mul(macro).mul(cav), SNOW.mul(drift.mul(0.12).add(0.9)), snow).mul(relief), n, 9).mul(skyLight(n).mul(cs.mul(0.3).add(0.7)).mul(float(1).sub(shade.mul(0.35))).add(U.uSun.mul(cs).mul(sunDim()).mul(shadowAt(vWorld)).mul(float(1).sub(shade)).mul(sunl)));   // under a cloud the sky is dimmer too (the clouds' shade read once: light.js cloudAt is these three)
    const V = normalize(U.uCam.sub(vWorld));
    return finish(col.add(U.uSun.mul(pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 48)).mul(0.3).mul(wet)), vWorld);
  });

  const m = new THREE.NodeMaterial(); m.positionNode = vertex(); m.fragmentNode = frag();
  return m;
}
