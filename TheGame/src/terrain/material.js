// The ground's material (node code): one grid tile per quadtree node (terrain.js), raised to the land in the vertex
// stage and morphed towards the coarser grid at its edge; in the fragment, one read of the land's virtual texture
// (src/terrain/pages.js) and the light. What a page of it holds is laid here, once for each of its texels (laid): the
// layers the layer map says lie there (src/terrain/layers.js), at most five, each one read of its material, hex-tiled so
// nothing repeats, laid over each other in their order, the higher winning at a seam; the grass's carpet among them; the
// stands' colour far off. Its size is one, whatever the biomes and their materials.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, vec2, vec3, vec4, attribute, positionGeometry, positionWorld, varyingProperty, cameraProjectionMatrix, dFdx, dFdy, If, Loop, abs, max, clamp, mix, smoothstep, length, normalize, pow, fract, floor, exp2, log2 } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { TRUTH } from '../detail/measure.js';
import { camDist, riverInfo, riverNear, heightAt, baseB, roofAt, hashI, BASE } from '../world/land.nodes.js';
import { OCT_LAM } from '../world/land.js';
import { layerOf, standOf, standFade, shadowReach, CARPET, SLOPES, NO_STAND, SHADE_REACH, CROWNS } from './layers.js';
import { finish, skyLight, weathered, shadowAt, sunDim, cloudShade, snowCover, snowDrift, snowDepth, SNOW } from '../world/light.js';
import { passOf, motion } from '../core/pass.js';
import { endOf } from '../scatter/grass.js';

export const GRID = 16, NODE = 8;   // quads per node side; a level-0 node's side, metres (its reach is the measure's: U.uLandR0, src/terrain/terrain.js)
/** How many times as far every level of the land reaches but the last (whose reach is where the land ends): 1, and under
    ?truth 4, each quad a quarter as large on the screen (src/detail/measure.js; its finest everywhere is past any GPU). */
export const FINE = TRUTH ? 4 : 1;

/** The step the land's normal is worked out over, seen dist metres off: its mesh's quad there (the land's levels keep
    dist over its quad at their ratio: GRID over NODE of the finest's reach), never finer than an eighth of its finest
    octave (what resolves that octave's slope). */
const normalStep = (dist) => max(OCT_LAM.at(-1) / 8, dist.mul(NODE / GRID).div(U.uLandR0.mul(FINE)));
/** The node's grid point, morphed: (world x, z) */
export function gridPoint() {
  const node = attribute('aNode', 'vec4'), g = positionGeometry.xz, cell = node.z.div(GRID), rng = exp2(node.w).mul(U.uLandR0).mul(FINE);
  const k = clamp(camDist(node.xy.add(g.mul(cell))).sub(rng.mul(0.8)).div(rng.mul(0.15)), 0, 1);
  return node.xy.add(g.sub(fract(g.mul(0.5)).mul(2).mul(k)).mul(cell));
}

// A ground's material, read once: m its number; p the point (metres); s how far apart its neighbouring texels' points
// are, either way (a page's texel is square: its mip is the one the steps call for, the material's tile 1024 texels:
// src/materials/bake.js); tile metres a tile. -> { c: its colour (linear), h: its height, n: its relief (the normal's
// x, z) }. Hex-tiled
// (Mikkelsen, "Practical Real-Time Hex-Tiling", JCGT 2022): the plane in hexagons two tiles across (as large as the
// patches a second take once made, so a ripple runs on), each reading the tile at its own random offset (not turned: a
// ground's grain keeps its way across them). Across their edges they blend by how near each is, the higher texel
// winning, so a seam follows what lies in the ground; the blend is sharp: most of a hexagon reads its own offset alone.
// (Once for a texel of a page, not for a pixel of a frame: at every distance, where until 6b it was one read pushed
// about by a slow wave past 240 to 320 m, so a pixel did not read three hexagons.)
const CELL = 2;   // a hexagon's size in tiles
/** The mip of a material's tile (1024 texels: src/materials/bake.js) that texels s metres apart read, at `tile` metres a
    tile: half a step finer than the texel, for a page is filtered once more as it is read (two filters one after the
    other blur more than one: the ground near the eye kept as sharp as a read of the material itself). */
const mipOf = (s, tile) => log2(max(s.mul(1024).div(tile), 1e-6)).sub(0.5);
export function groundRead(tex, m, p, s, tile) {
  const q = p.div(tile), lv = mipOf(s, tile).toVar(), c = vec3(0).toVar(), h = float(0).toVar(), n = vec2(0).toVar();
  const hx = q.mul((2 * Math.sqrt(3)) / CELL), sk = vec2(hx.x.sub(hx.y.mul(0.57735027)), hx.y.mul(1.15470054)), base = floor(sk), f = sk.sub(base);
  const z = float(1).sub(f.x).sub(f.y), up = z.lessThan(0).select(float(1), float(0)), sg = up.mul(2).sub(1);
  const w = vec3(z.negate().mul(sg), up.sub(f.y.mul(sg)), up.sub(f.x.mul(sg))).toVar(), w2 = w.mul(w), b0 = w2.mul(w2).mul(w2).mul(w);   // (each hexagon's nearness to the 7th: a sharp blend)
  const b = b0.div(b0.x.add(b0.y).add(b0.z)).toVar(), corners = [vec2(up, up), vec2(up, float(1).sub(up)), vec2(float(1).sub(up), up)], sum = float(0).toVar();
  for (let i = 0; i < 3; i++) {
    const bi = [b.x, b.y, b.z][i];
    If(bi.greaterThan(0.02), () => {   // (a hexagon all but out of the blend: not read)
      const v = base.add(corners[i]), r = hashI(int(v.x), int(v.y), uint(91)), uv = q.add(vec2(float(r.bitAnd(uint(0xffff))), float(r.shiftRight(uint(16)))).mul(1 / 65536));
      const a = tex.a(m, uv).level(lv), k = bi.mul(a.a.mul(0.6).add(0.4));   // (the higher texel weighs more: Mikkelsen's contrast, by height)
      c.addAssign(a.rgb.mul(a.rgb).mul(k)); h.addAssign(a.a.mul(k)); n.addAssign(tex.n(m, uv).level(lv).xy.mul(2).sub(1).mul(k)); sum.addAssign(k);
    });
  }
  const inv = float(1).div(max(sum, 1e-5)); c.mulAssign(inv); h.mulAssign(inv); n.mulAssign(inv);
  return { c, h, n };
}

/** How steep the land is at p, its normal's y, as the ground's mesh has it seen from D metres off (its vertex stage:
    the height's steps e metres either way). */
export function slopeAt(p, D) {
  const e = normalStep(D).toVar(), I = riverInfo(p).toVar(), h = heightAt(p, D, abs(I.x), I.y, I.z).toVar();
  const at = (q) => { const J = riverNear(q, I).toVar(); return heightAt(q, D, abs(J.x), J.y, J.z); };
  return normalize(vec3(h.sub(at(p.add(vec2(e, 0)))), e, h.sub(at(p.add(vec2(0, e)))))).y;
}

const rot = (q) => vec2(q.x.mul(0.6).sub(q.y.mul(0.8)), q.x.mul(0.8).add(q.y.mul(0.6)));
const rotB = (q) => vec2(q.x.mul(0.8).add(q.y.mul(0.6)), q.x.mul(-0.6).add(q.y.mul(0.8)));

/** The ground at p as a texel of the land's virtual texture holds it (src/terrain/pages.js): s the texel's size
    (metres), D how far off it is seen (the lens's metres, its level's: what is let go with distance is let go as at D),
    X the layers there (src/terrain/layers.js: layersFrom). -> { c: its colour (linear, its macro variation in it), h:
    its height, n: its relief (the normal's x, z), cv: how much of what shows is the grass's carpet (near, the pixel
    darkens it in its blades' shade), shade: how much of the sun a stand's crowns take from it where their shadows are no
    longer drawn (the pixel's: by how far the shadow map reaches round the camera) }. Node code, in a Fn. */
export function laid(tex, p, s, D, X) {
  // the higher material wins at the seam: B laid over M, t of it (and what showed of the carpet is covered as much)
  const blend = (M, B, t) => {
    const k0 = clamp(t.sub(0.5).mul(3).add(0.5).add(B.h.sub(M.h).mul(0.8)), 0, 1), k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
    M.c.assign(mix(M.c, B.c, k)); M.h.assign(mix(M.h, B.h, k)); M.n.assign(mix(M.n, B.n, k)); M.g.assign(M.g.mul(float(1).sub(k)));
  };
  // the grass as a carpet, at three sizes: blades near, tufts further, drifts of them from high up (each read only where
  // it shows: the blades' within 110 m, the drifts' past 300); its cover the map's: where the meadow's blades stand,
  // the bare patches cut it as they cut the blades, and the floor shows between them; as the blades thin out towards
  // the meadow's end the carpet takes their place, all of it (their own share: src/scatter/grass.js endOf, one
  // statistic either side, so where the blades end nothing shows); far its tufts are let go (350 to 900 m)
  const carpet = BASE.grass.carpet, blades = endOf(D);
  const cover = mix(mix(X.cv.y, X.cv.x, blades), X.cv.z, smoothstep(350, 900, D));
  const cv = cover.mul(mix(1, 0.82, blades)).toVar();
  const pr = rot(p), prr = rotB(p);
  const gk = smoothstep(25, 110, D), gk2 = smoothstep(300, 1400, D), grows = cv.greaterThan(0.002);
  const ga2 = float(0.5).toVar(), gn2 = vec2(0.5).toVar(), g1a = float(0).toVar(), gn1 = vec2(0).toVar(), g3a = float(0).toVar();
  If(grows, () => { const lv = mipOf(s, 9.6); ga2.assign(tex.a(carpet, pr.div(9.6)).level(lv).a); gn2.assign(tex.n(carpet, pr.div(9.6)).level(lv).xy); });
  If(grows.and(gk.lessThan(1)), () => { const lv = mipOf(s, 1.6); g1a.assign(tex.a(carpet, p.div(1.6)).level(lv).a); gn1.assign(tex.n(carpet, p.div(1.6)).level(lv).xy.mul(2).sub(1)); });
  If(grows.and(gk2.greaterThan(0)), () => { g3a.assign(groundRead(tex, carpet, prr, s, 57).h); });
  const glum = mix(mix(g1a, ga2, gk), mix(ga2, g3a, 0.6), gk2).toVar();
  const gq0 = gn2.mul(2).sub(1), gq = vec2(gq0.x.mul(0.6).add(gq0.y.mul(0.8)), gq0.x.mul(-0.8).add(gq0.y.mul(0.6)));
  const gnrm = mix(gn1, gq, gk).mul(float(1).sub(gk2.mul(0.7)));
  const grass = (M) => { M.c.assign(mix(M.c, X.tint.mul(glum.mul(1.05).add(0.32)), cv)); M.n.assign(mix(M.n, gnrm.mul(1.4), cv)); M.h.assign(mix(M.h, glum, cv)); M.g.assign(cv); };

  // the layers, in the order they are laid: each its share of what lies under it (its share over the shares so far),
  // let go with distance where it says (not the lowest: nothing lies under it); the slope's rock as much as the texel's
  // slope says; the grass's carpet before the first layer laid over it
  const M = { c: vec3(0.25).toVar(), h: float(0.5).toVar(), n: vec2(0).toVar(), g: float(0).toVar() }, under = float(0).toVar(), carpeted = int(0).toVar();
  const pick = (i, key) => X.slots.slice(1).reduce((v, sl, j) => i.equal(j + 1).select(sl[key], v), X.slots[0][key]);
  Loop(X.slots.length, ({ i }) => {
    const id = pick(i, 'id'), sw = pick(i, 'w');
    If(id.greaterThanEqual(CARPET).and(carpeted.equal(0)), () => { grass(M); carpeted.assign(1); });
    If(sw.greaterThan(0).and(id.lessThan(999)), () => {
      const L = layerOf(id), own = id.equal(SLOPES), first = under.lessThanEqual(0).and(own.not());
      const t = own.select(sw, sw.div(under.add(sw)).mul(first.select(float(1), L.fade(D)))).toVar();
      under.addAssign(own.select(float(0), sw));
      If(t.greaterThan(0.003), () => blend(M, groundRead(tex, L.material, p, s, L.tile), t));
    });
  });
  If(carpeted.equal(0), () => grass(M));

  // the stands: far off, where their plants have sunk away, the land wears their crowns' colour, as much of it as they
  // cover; and how much of the light they would take from their floor (laid on it by the pixel, past where their
  // shadows are drawn: SHADE_REACH)
  const shade = float(0).toVar();
  for (const T of X.stands) If(T.id.notEqual(NO_STAND).and(T.c.greaterThan(0.003)), () => {
    const S = standOf(T.id), fade = standFade(S, D);
    If(fade.greaterThan(0.003).or(S.reach.greaterThan(0)), () => {
      const under2 = smoothstep(float(1.08).sub(T.c.mul(0.75)), float(1.22).sub(T.c.mul(0.75)), T.n.add(T.c.mul(0.45)));   // where a plant is, as many as cover says
      // (darker than a crown's own colour: seen from afar it is mostly its own shade; where the texel can no longer hold
      // the pattern's finest scale, two texels to it, the pattern goes over into its mean, no speckle to shimmer)
      const mean = smoothstep(S.grain.mul(CROWNS / 4), S.grain.mul(CROWNS / 2), s), crown = S.colour.mul(mix(T.n, 0.5, mean).mul(0.6).add(0.42));
      const k = fade.mul(smoothstep(0, 0.15, T.c)), top = k.mul(mix(under2, smoothstep(0.1, 0.95, T.c), mean));
      M.c.assign(mix(M.c, crown, top)); M.n.assign(M.n.mul(float(1).sub(top))); M.h.assign(mix(M.h, under2, k)); M.g.assign(M.g.mul(float(1).sub(top)));
      If(S.reach.greaterThan(0), () => { shade.assign(max(shade, T.c.mul(T.n.mul(0.9).add(0.3)).min(0.85).mul(float(1).sub(top)))); });   // the floor between the crowns in their shade (the crowns themselves in the light)
    });
  });
  M.c.mulAssign(X.macro.add(1));   // the land's colour variation, from the baked cloudy noise
  return { c: M.c, h: M.h, n: M.n, cv: M.g, shade };
}
/** How much of the light reaches a texel of the ground for its own relief, h its height: what lies low (the gaps
    between stones, a crack) sits in its neighbours' shade; the grass's carpet less (its blades are drawn over it, cv its
    share). Laid into the page with the texel's colour (src/terrain/pages.js), so the page's levels filter it as they
    filter the colour: by the texel's footprint, not by metres. */
export const cavityOf = (h, cv) => mix(1, smoothstep(0.08, 0.5, h).mul(0.62).add(0.38), float(1).sub(cv.mul(0.6)));

/** The land at wp (a vec2 variable, metres; node code, in a Fn): its height h, the river there I (riverInfo), and with
    `full` its normal N (the height's steps e metres either way, e by how far off it is seen) and how far it stands over
    the valley's floor (hill). The land's vertex stage, and the relief's points near the eye (src/terrain/relief.js). */
export function landPoint(wp, full) {
  const dist = camDist(wp).toVar(), e = normalStep(dist).toVar();
  const at = (q, near) => { const I = (near ? riverNear(q, near) : riverInfo(q)).toVar(), d = abs(I.x).toVar(); return { I, d, h: heightAt(q, dist, d, I.y, I.z).toVar() }; };
  const C = at(wp), h = C.h;
  if (!full) return { h, I: C.I, d: C.d };
  const X = at(wp.add(vec2(e, 0)), C.I), Z = at(wp.add(vec2(0, e)), C.I);
  return { h, I: C.I, d: C.d, N: normalize(vec3(h.sub(X.h), e, h.sub(Z.h))).toVar(), hill: h.sub(baseB(wp)) };   // (hill: how far this ground stands over the valley's floor)
}
/** How far the snow lifts the ground at wp (the river there I, d its distance off): not in the river's channel, not
    under a roof. What stands on the land sinks into it as deep. */
const snowLiftAt = (wp, I, d) => snowDepth.mul(smoothstep(I.y, I.y.add(1.5), d)).mul(float(1).sub(roofAt(wp)));

/** The ground's material. vt: the land's virtual texture (src/terrain/pages.js), whose read gives what laid() laid.
    from: where its vertex stage takes its points from instead of the land's grid (the relief near the eye,
    src/terrain/relief.js: () => { world, I, N, hill }, worked out in compute). */
export function terrainMaterial(vt, from = null) {
  // ---- vertex: the land's height and normal, the river here ----
  // one Fn, every value worked out once into a variable and handed on by name: an expression used twice would otherwise be
  // written out twice, the river three times over at every use, which a browser's shader compiler need not fold back
  const vWorld = varyingProperty('vec3', 'tWorld'), vI = varyingProperty('vec4', 'tI'), vN = varyingProperty('vec3', 'tN'), vHill = varyingProperty('float', 'tHill');
  const vertex = Fn((builder) => {
    const pre = passOf(builder) === 'pre';   // (the prepass needs only where the ground is: src/core/pass.js)
    if (from) {
      const R = from(), wp = R.world.xz.toVar();
      vN.assign(R.N); if (!pre) { vWorld.assign(R.world); vI.assign(R.I); vHill.assign(R.hill); }   // (vN in the prepass too: below)
      return R.world.add(vec3(0, snowLiftAt(wp, R.I, abs(R.I.x)), 0));
    }
    const wp = gridPoint().toVar(), L = landPoint(wp, !pre);
    if (!pre) { vWorld.assign(vec3(wp.x, L.h, wp.y)); vI.assign(L.I); vN.assign(L.N); vHill.assign(L.hill); }   // (vWorld without the snow's depth: the light and the air do not need it)
    // the snow lifts the ground it lies on: what stands on the land sinks into it as deep
    return vec3(wp.x, L.h.add(snowLiftAt(wp, L.I, L.d)), wp.y);
  });

  // ---- fragment: the page's texel, lit ----
  // (the picture is built over time, src/core/temporal.js: the ground read as finely as the screen's own pixels would)
  const steps = (p) => [dFdx(p).mul(U.uFine), dFdy(p).mul(U.uFine)];
  // (on the relief, the level of the pages a pixel asks for and reads goes by the land's smooth surface under it, not by
  // the relief's own bumps: across a stone the steps between pixels change many times over, and with the picture's
  // jitter from frame to frame, so pages would be asked for one by one for as long as the camera stood. Its steps
  // there: across the eye's ray a pixel's angle, along the slope that over how squarely the ray meets it)
  const smooth = (P) => { const d = length(P.sub(U.uCam)), across = d.mul(2).div(cameraProjectionMatrix.element(1).element(1).mul(U.uIn.y)).mul(U.uFine); return [vec2(across, 0), vec2(0, across.div(abs(normalize(P.sub(U.uCam)).dot(vN)).max(0.02)))]; };
  const frag = Fn((builder) => {
    // the prepass: it stands still, only the camera moves; and in its fourth number (no other material writes one),
    // the level of the land's pages its footprint calls for (2 more: 0 is not the land), for the pages to know what is seen
    // (src/terrain/pages.js ask). The colour pass writes nothing beside its colour: a shader that does loses its early
    // depth test, and the colour's equal test then misses pixels the prepass drew
    if (passOf(builder) === 'pre') { const [dx, dy] = from ? smooth(positionWorld) : steps(positionWorld.xz); return vec4(motion(positionWorld).xyz, vt.asks(dx, dy)); }
    const p = vWorld.xz, [dx, dy] = steps(p);
    const rdist = length(vWorld.sub(U.uCam)), dist2 = rdist.mul(U.uLodInv);   // the true distance (for the air), and the lens's (for detail)
    const d = abs(vI.x), w = vI.y;
    const G = vt.read(p, dx, dy, rdist, { eye: normalize(U.uCam.sub(vWorld)), level: from ? smooth(vWorld) : null });   // (along the eye's ray through the ground's relief: parallax)
    // where the meadow's blades stand, the carpet lies in their shade, drawn over it; as they thin out towards its end
    // it comes out of it (their own share at the pixel's distance: src/scatter/grass.js endOf)
    const blades = endOf(dist2), c = G.c.mul(mix(1, 0.5, G.cv.mul(blades))).toVar(), cv = G.cv, h = G.h;
    // past where the shadow map reaches round the camera, a stand's floor lies in its crowns' shade
    const shade = SHADE_REACH > 0 ? G.shade.mul(smoothstep(shadowReach(SHADE_REACH).mul(0.8), shadowReach(SHADE_REACH), length(p.sub(U.uCam.xz)))) : float(0);

    // ---- the light ----
    const wet = float(1).sub(smoothstep(w.mul(0.9), w.add(2.5), d));
    // (the depth of the ground's own relief, what lies low in its neighbours' shade, is in its colour: laid with it,
    // cavityOf; its relief's normal as the page holds it, its levels' filtering flattening what a texel averages)
    // snow: as deep as uSnow, deeper in drifts and thinner on the rises between; what stands out of the ground (a pebble's
    // top, the grass's carpet) shows through until it is covered; none on the water. Under it the ground's own relief goes.
    const drift = float(0.5).toVar(); If(snowDepth.greaterThan(0.001), () => { drift.assign(snowDrift(p)); });   // only while snow lies
    // (where the blades stand, they stand out of it on their own: the ground under them is the snow's; past them the
    // carpet stands for them)
    const lift = h.mul(float(0.025).add(cv.mul(float(1).sub(blades)).mul(0.14)));
    const snow = snowCover(vN, lift).mul(smoothstep(w, w.add(1.5), d)).mul(float(1).sub(roofAt(p)));   // none under a roof
    const rn = G.n.mul(float(1).sub(snow.mul(0.85)));
    const n = normalize(vN.add(vec3(rn.x, 0, rn.y)));
    // relief: hollows sit in shade, crowns in light (the land's slopes are its own, as far as they show: its octaves
    // are kept that far, src/world/land.nodes.js)
    const relief = mix(0.74, 1.1, smoothstep(-6, 16, vHill));
    const sunl = max(n.dot(U.uSunDir), 0);
    const cs = cloudShade(vWorld).toVar();
    const col = weathered(mix(c.mul(mix(1, 0.5, wet)), SNOW.mul(drift.mul(0.12).add(0.9)), snow).mul(relief), n, 9).mul(skyLight(n).mul(cs.mul(0.3).add(0.7)).mul(float(1).sub(shade.mul(0.35))).add(U.uSun.mul(cs).mul(sunDim()).mul(shadowAt(vWorld)).mul(float(1).sub(shade)).mul(sunl)));   // under a cloud the sky is dimmer too (the clouds' shade read once: light.js cloudAt is these three)
    const V = normalize(U.uCam.sub(vWorld));
    return finish(col.add(U.uSun.mul(pow(max(n.dot(normalize(V.add(U.uSunDir))), 0), 48)).mul(0.3).mul(wet)), vWorld);
  });

  const m = new THREE.NodeMaterial(); m.positionNode = vertex(); m.fragmentNode = frag(); m.userData.pre = true;   // (it takes part in the prepass: src/core/pass.js)
  return m;
}
