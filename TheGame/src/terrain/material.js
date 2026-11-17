// The ground's material (node code): one grid tile per quadtree node (terrain.js), raised to the land in the vertex
// stage and morphed towards the coarser grid at its edge; in the fragment, the layers the layer map says lie here
// (src/terrain/layers.js: worked out once for a stretch of land from the biomes' rules), at most five, each one read of
// its material hex-tiled so nothing repeats, laid over each other in their order, the higher winning at a seam; the
// grass's carpet among them; lit by the shading contract. Its size is one, whatever the biomes and their materials.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, vec2, vec3, vec4, attribute, positionGeometry, varyingProperty, dFdx, dFdy, If, Loop, abs, max, min, clamp, mix, smoothstep, length, normalize, pow, fract, floor, exp2 } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { TRUTH } from '../detail/measure.js';
import { camDist, riverInfo, riverNear, heightAt, baseB, roofAt, hashI, BASE } from '../world/land.nodes.js';
import { layersAt, layerOf, standOf, standFade, shadowReach, CARPET, SLOPES, NO_STAND } from './layers.js';
import { finish, skyLight, weathered, shadowAt, sunDim, cloudShade, snowCover, snowDrift, snowDepth, SNOW } from '../world/light.js';

export const GRID = 16, R0 = 48;   // quads per node side; level 0's range (m)
/** How many times as far every level of the land reaches but the last (whose reach is where the land ends): 1, and under
    ?truth 4, each quad a quarter as large on the screen (src/detail/measure.js; its finest everywhere is past any GPU). */
export const FINE = TRUTH ? 4 : 1;

/** The node's grid point, morphed: (world x, z) */
export function gridPoint() {
  const node = attribute('aNode', 'vec4'), g = positionGeometry.xz, cell = node.z.div(GRID), rng = exp2(node.w).mul(R0 * FINE);
  const k = clamp(camDist(node.xy.add(g.mul(cell))).sub(rng.mul(0.8)).div(rng.mul(0.15)), 0, 1);
  return node.xy.add(g.sub(fract(g.mul(0.5)).mul(2).mul(k)).mul(cell));
}

// Hex-tiling (Mikkelsen, "Practical Real-Time Hex-Tiling", JCGT 2022): the plane in hexagons two tiles across (as large
// as the patches the two takes made, so a ripple runs on), each reading the tile at its own random offset (not turned: a
// ground's grain, a ripple of sand, keeps its way across them),
// one read a material where it was read in two takes mixed by a noise until 2026-11-17. Across their edges they blend by
// how near each is, the higher texel winning, so a seam follows what lies in the ground. The blend is sharp: most of a
// hexagon reads its own offset alone. m: a material (its number, or its recipe or uid); p: the point (metres); dx, dy:
// how far apart its neighbouring pixels' points are; tile: metres a tile. -> { c: its colour (linear), h: its height,
// n: its relief (the normal's x, z) }
const CELL = 2;   // a hexagon's size in tiles
function hexRead(tex, m, p, dx, dy, tile) {
  const q = p.div(tile), gx = dx.div(tile), gy = dy.div(tile);
  const s = q.mul((2 * Math.sqrt(3)) / CELL), sk = vec2(s.x.sub(s.y.mul(0.57735027)), s.y.mul(1.15470054)), base = floor(sk), f = sk.sub(base);
  const z = float(1).sub(f.x).sub(f.y), up = z.lessThan(0).select(float(1), float(0)), sg = up.mul(2).sub(1);
  const w = vec3(z.negate().mul(sg), up.sub(f.y.mul(sg)), up.sub(f.x.mul(sg))).toVar(), w2 = w.mul(w), b0 = w2.mul(w2).mul(w2).mul(w);   // (each hexagon's nearness to the 7th: a sharp blend)
  const b = b0.div(b0.x.add(b0.y).add(b0.z)).toVar(), corners = [vec2(up, up), vec2(up, float(1).sub(up)), vec2(float(1).sub(up), up)];
  const c = vec3(0).toVar(), h = float(0).toVar(), n = vec2(0).toVar(), sum = float(0).toVar();
  for (let i = 0; i < 3; i++) {
    const bi = [b.x, b.y, b.z][i];
    If(bi.greaterThan(0.02), () => {   // (a hexagon all but out of the blend: not read)
      const v = base.add(corners[i]), r = hashI(int(v.x), int(v.y), uint(91)), uv = q.add(vec2(float(r.bitAnd(uint(0xffff))), float(r.shiftRight(uint(16)))).mul(1 / 65536));
      const a = tex.a(m, uv).grad(gx, gy), k = bi.mul(a.a.mul(0.6).add(0.4));   // (the higher texel weighs more: Mikkelsen's contrast, by height)
      c.addAssign(a.rgb.mul(a.rgb).mul(k)); h.addAssign(a.a.mul(k)); n.addAssign(tex.n(m, uv).grad(gx, gy).xy.mul(2).sub(1).mul(k)); sum.addAssign(k);
    });
  }
  const inv = float(1).div(max(sum, 1e-5));
  return { c: c.mul(inv), h: h.mul(inv), n: n.mul(inv) };
}

export function terrainMaterial(tex) {
  // ---- vertex: the land's height and normal, the river here ----
  // one Fn, every value worked out once into a variable and handed on by name: an expression used twice would otherwise be
  // written out twice, the river three times over at every use, which a browser's shader compiler need not fold back
  const vWorld = varyingProperty('vec3', 'tWorld'), vI = varyingProperty('vec4', 'tI'), vN = varyingProperty('vec3', 'tN'), vHill = varyingProperty('float', 'tHill');
  const vertex = Fn(() => {
    const wp = gridPoint().toVar(), dist = camDist(wp).toVar(), e = max(0.3, dist.div(96)).toVar();
    const at = (q, near) => { const I = (near ? riverNear(q, near) : riverInfo(q)).toVar(), d = abs(I.x).toVar(); return { I, d, h: heightAt(q, dist, d, I.y, I.z).toVar() }; };
    const C = at(wp), X = at(wp.add(vec2(e, 0)), C.I), Z = at(wp.add(vec2(0, e)), C.I), h = C.h;
    vWorld.assign(vec3(wp.x, h, wp.y)); vI.assign(C.I); vN.assign(normalize(vec3(h.sub(X.h), e, h.sub(Z.h))));   // (vWorld without the snow's depth: the light and the air do not need it)
    vHill.assign(h.sub(baseB(wp)));   // how far this ground stands over the valley's floor
    // the snow lifts the ground it lies on (not the river's channel): what stands on the land sinks into it as deep
    return vec3(wp.x, h.add(snowDepth.mul(smoothstep(C.I.y, C.I.y.add(1.5), C.d)).mul(float(1).sub(roofAt(wp)))), wp.y);
  });

  // ---- fragment ----
  const carpet = BASE.grass.carpet;
  const rot = (q) => vec2(q.x.mul(0.6).sub(q.y.mul(0.8)), q.x.mul(0.8).add(q.y.mul(0.6)));
  const rotB = (q) => vec2(q.x.mul(0.8).add(q.y.mul(0.6)), q.x.mul(-0.6).add(q.y.mul(0.8)));
  // the higher material wins at the seam: B laid over M, t of it
  const blend = (M, B, t) => {
    const k0 = clamp(t.sub(0.5).mul(3).add(0.5).add(B.h.sub(M.h).mul(0.8)), 0, 1), k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
    M.c.assign(mix(M.c, B.c, k)); M.h.assign(mix(M.h, B.h, k)); M.n.assign(mix(M.n, B.n, k));
  };

  const frag = Fn(() => {
    const p = vWorld.xz, dx = dFdx(p).mul(U.uFine), dy = dFdy(p).mul(U.uFine);   // (the picture is built over time, src/core/temporal.js: the ground read as finely as the screen's own pixels would)
    const rdist = length(vWorld.sub(U.uCam)), dist2 = rdist.mul(U.uLodInv);   // the true distance (for the air), and the lens's (for detail)
    const d = abs(vI.x), w = vI.y;
    const X = layersAt(p, dx, dy, vN.y);

    // the grass as a carpet, at three sizes: blades near, tufts further, drifts of them from high up (each read only where
    // it shows: the blades' within 110 m, the drifts' past 300; in a branch a texture is read with its gradients given,
    // as a shader may not work them out there); its cover the map's: near, the bare patches cut it until they are let go
    // (100 to 160 m), far its tufts are let go (350 to 900 m); where the blades end, nothing shows
    const cover = dist2.lessThan(160).select(mix(X.cv.x, X.cv.y, smoothstep(100, 160, dist2)), mix(X.cv.y, X.cv.z, smoothstep(350, 900, dist2)));
    const cv = cover.mul(smoothstep(4, 60, dist2).mul(0.18).add(0.82)).toVar();
    const pr = rot(p), prr = rotB(p), dpr = rot(dx), dpr2 = rot(dy), dqx = rotB(dx), dqy = rotB(dy);
    const gk = smoothstep(25, 110, dist2), gk2 = smoothstep(300, 1400, dist2), grows = cv.greaterThan(0.002);
    const g2 = vec4(0.5).toVar(), gn2 = vec4(0.5).toVar(), g1a = float(0).toVar(), gn1 = vec2(0).toVar(), g3a = float(0).toVar();
    If(grows, () => { g2.assign(tex.a(carpet, pr.div(9.6)).grad(dpr.div(9.6), dpr2.div(9.6))); gn2.assign(tex.n(carpet, pr.div(9.6)).grad(dpr.div(9.6), dpr2.div(9.6))); });
    If(grows.and(gk.lessThan(1)), () => { g1a.assign(tex.a(carpet, p.div(1.6)).grad(dx.div(1.6), dy.div(1.6)).a); gn1.assign(tex.n(carpet, p.div(1.6)).grad(dx.div(1.6), dy.div(1.6)).xy.mul(2).sub(1)); });
    If(grows.and(gk2.greaterThan(0)), () => { g3a.assign(hexRead(tex, carpet, prr, dqx, dqy, 57).h); });
    const glum = mix(mix(g1a, g2.a, gk), mix(g2.a, g3a, 0.6), gk2).toVar();
    const gq0 = gn2.xy.mul(2).sub(1), gq = vec2(gq0.x.mul(0.6).add(gq0.y.mul(0.8)), gq0.x.mul(-0.8).add(gq0.y.mul(0.6)));
    const gnrm = mix(gn1, gq, gk).mul(float(1).sub(gk2.mul(0.7)));
    const grass = (M) => { M.c.assign(mix(M.c, X.tint.mul(glum.mul(1.05).add(0.32)).mul(mix(0.5, 1, smoothstep(3, 70, dist2))), cv)); M.n.assign(mix(M.n, gnrm.mul(1.4), cv)); M.h.assign(mix(M.h, glum, cv)); };

    // the layers, in the order they are laid: each its share of what lies under it (its share over the shares so far),
    // let go with distance where it says (not the lowest: nothing lies under it); the slope's rock as much as the
    // pixel's slope says; the grass's carpet before the first layer laid over it
    const M = { c: vec3(0.25).toVar(), h: float(0.5).toVar(), n: vec2(0).toVar() }, under = float(0).toVar(), carpeted = int(0).toVar();
    const pick = (i, key) => X.slots.slice(1).reduce((v, s, j) => i.equal(j + 1).select(s[key], v), X.slots[0][key]);
    Loop(X.slots.length, ({ i }) => {
      const id = pick(i, 'id'), sw = pick(i, 'w');
      If(id.greaterThanEqual(CARPET).and(carpeted.equal(0)), () => { grass(M); carpeted.assign(1); });
      If(sw.greaterThan(0).and(id.lessThan(999)), () => {
        const L = layerOf(id), own = id.equal(SLOPES), first = under.lessThanEqual(0).and(own.not());
        const t = own.select(sw, sw.div(under.add(sw)).mul(first.select(float(1), L.fade(dist2)))).toVar();
        under.addAssign(own.select(float(0), sw));
        If(t.greaterThan(0.003), () => blend(M, hexRead(tex, L.material, p, dx, dy, L.tile), t));
      });
    });
    If(carpeted.equal(0), () => grass(M));

    // the stands: far off, where their plants have sunk away, the land wears their crowns' colour, as much of it as they
    // cover; past where their shadows are drawn, their floor lies in their shade
    const shade = float(0).toVar(), toCam = length(p.sub(U.uCam.xz));
    for (const T of X.stands) If(T.id.notEqual(NO_STAND).and(T.c.greaterThan(0.003)), () => {
      const S = standOf(T.id), fade = standFade(S, dist2), dim = S.reach.greaterThan(0).select(smoothstep(shadowReach(S.reach).mul(0.8), shadowReach(S.reach), toCam), float(0));
      If(max(fade, dim).greaterThan(0.003), () => {
        const under2 = smoothstep(float(1.08).sub(T.c.mul(0.75)), float(1.22).sub(T.c.mul(0.75)), T.n.add(T.c.mul(0.45)));   // where a plant is, as many as cover says
        // (darker than a crown's own colour: seen from afar it is mostly its own shade; from very far a plant is smaller
        // than a pixel: the pattern goes over into its mean, no speckle to shimmer)
        const mean = smoothstep(S.grain.mul(2000), S.grain.mul(7000), dist2), crown = S.colour.mul(mix(T.n, 0.5, mean).mul(0.6).add(0.42));
        const k = fade.mul(smoothstep(0, 0.15, T.c)), top = k.mul(mix(under2, smoothstep(0.1, 0.95, T.c), mean));
        M.c.assign(mix(M.c, crown, top)); M.n.assign(M.n.mul(float(1).sub(top))); M.h.assign(mix(M.h, under2, k));
        shade.assign(max(shade, dim.mul(T.c).mul(T.n.mul(0.9).add(0.3)).min(0.85).mul(float(1).sub(top))));   // the floor between the crowns in their shade (the crowns themselves in the light)
      });
    });

    // ---- the light ----
    M.c.mulAssign(X.macro.add(1));   // the land's colour variation, from the baked cloudy noise
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
    const col = weathered(mix(M.c.mul(mix(1, 0.5, wet)).mul(cav), SNOW.mul(drift.mul(0.12).add(0.9)), snow).mul(relief), n, 9).mul(skyLight(n).mul(cs.mul(0.3).add(0.7)).mul(float(1).sub(shade.mul(0.35))).add(U.uSun.mul(cs).mul(sunDim()).mul(shadowAt(vWorld)).mul(float(1).sub(shade)).mul(sunl)));   // under a cloud the sky is dimmer too (the clouds' shade read once: light.js cloudAt is these three)
    const V = normalize(U.uCam.sub(vWorld));
    return finish(col.add(U.uSun.mul(pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 48)).mul(0.3).mul(wet)), vWorld);
  });

  const m = new THREE.NodeMaterial(); m.positionNode = vertex(); m.fragmentNode = frag();
  return m;
}
