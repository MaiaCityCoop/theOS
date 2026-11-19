// The land on the GPU: land.js's functions as node functions (TSL), constant for constant, so what the shaders
// draw is the ground the walker stands on. Every material that needs the land (terrain, water, grass, rocks, the ground
// pass) builds from these. The biomes (biomes/*.js) bring their own rules; the library's sandbox lays one biome over
// all the land round its stage.
import { Fn, float, int, uint, vec2, vec3, vec4, abs, max, clamp, mix, smoothstep, length, atan, sin, cos, If, Loop, uniformArray, uniform, renderGroup, array } from 'three/tsl';
import { Vector4 } from 'three/webgpu';
import { U } from '../core/uniforms.js';
import { hashI, rnd, noised, vnoise, camDist, edgeJit, groveAt, leadAt, bent, turned, second } from './noise.nodes.js';
export { hashI, rnd, noised, vnoise, camDist, edgeJit, groveAt, leadAt, bent, turned, second };
import { OCT_LAM, OCT_AMP, WATER_DROP, PADS, PAD_FALL, BEND, MEANDER, LAKE_MAX } from './land.js';
import { BAND } from '../detail/error.js';
import { uPxK, dialPxAt } from '../detail/measure.js';
import { BIOMES, BASE, WATER } from './biomes.js';
import { PLACES } from '../../world/places.js';
import { recipe, byRole } from '../core/registry.js';
const noise = byRole('noise');   // the baked cloudy noise: whichever material plays that part (its `role`)

// ---- the biomes (biomes/*.js, from the registry) and the library's sandbox ----
// Every biome brings its own rule for where it lies (its `where`, node code) and the order it is laid in (`layer`); the
// base biome lies under all of them; the water's is drawn as the water. Nothing here knows a biome by name.
const LAID = BIOMES.filter((b) => b.where).sort((a, b) => a.layer - b.layer);
export { BASE, LAID };
/** how much of p the library's sandbox covers: round (x, z) of uSand the land is one biome (uSand.w: its number) */
export const sandW = Fn(([p]) => U.uSand.z.greaterThan(0).select(float(1).sub(smoothstep(220, 340, length(p.sub(U.uSand.xy)))), float(0)));
const sandIs = (b) => abs(U.uSand.w.sub(BIOMES.indexOf(b))).lessThan(0.5).select(float(1), float(0));
const riverSand = () => (WATER ? sandIs(WATER).greaterThan(0.5) : float(0).greaterThan(1));   // the river's sandbox brings its own river
// a biome's share at p: its own rule; in a sandbox, the sandbox's biome all round the stage (what lies by a river keeps to
// the river in the river's sandbox)
const placed = (b, natural, p) => { const s = mix(natural, sandIs(b), sandW(p)); return b.river ? riverSand().select(natural, s) : s; };
/** paths, bare patches, outcrops (the base biome's own): none in a sandbox */
/** one biome's share at a point (ctx as biomesAt's): its rule, placed (the library's sandbox); as biomesAt kept it with
    the place, where it has (its variables: one shader works a rule out once, however many ask) */
export const shareOf = (b, ctx) => ctx.shares?.get(b) ?? placed(b, clamp(b.where(ctx), 0, 1), ctx.p);
export const placeOff = (p, natural) => natural.mul(float(1).sub(sandW(p)));
/** 1 under the roof of what stands at a place (its asset's `roofed`), 0 in the open: where no snow falls */
export const roofAt = (p) => Object.values(PLACES).map((P) => [P, recipe(P.asset)?.roofed]).filter(([, r]) => r).reduce((a, [P, r]) => max(a, float(1).sub(smoothstep(r - 0.15, r + 0.1, length(p.sub(vec2(P.x, P.z)))))), float(0));

// ---- the river: the world's, or in the river's sandbox its own, meandering ----
const riverWorld = Fn(([p]) => {
  const n1 = noised(p.mul(1 / 1600), uint(40)), n2 = noised(p.mul(1 / 330).add(17.3), uint(41));
  return vec3(n1.x.sub(0.5).add(n2.x.sub(0.5).mul(0.28)), n1.yz.mul(1 / 1600).add(n2.yz.mul(0.28 / 330)));
}).setLayout({ name: 'riverWorld', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });
/** the river in its sandbox, meandering round its middle (sand: U.uSand, its middle in xy; s: how much of p is the
    sandbox's): its field, as riverRaw's (a function of its own: written once in a shader that reads the river at
    several places; the uniforms handed to it, as a function may not name one) */
const riverMeander = Fn(([p, sand, s]) => {
  const d = p.sub(sand.xy), c = Math.cos(MEANDER.turn), sn = Math.sin(MEANDER.turn), k = (2 * Math.PI) / MEANDER.wave;
  const u = d.x.mul(c).add(d.y.mul(sn)), v = d.x.mul(-sn).add(d.y.mul(c));
  const g = v.sub(sin(u.mul(k)).mul(MEANDER.swing)), gu = cos(u.mul(k)).mul(-MEANDER.swing * k);
  const gr = vec2(gu.mul(c).sub(sn), gu.mul(sn).add(c)).div(1600);
  return vec3(g.greaterThanEqual(0).select(1, -1).mul(abs(g).div(1600).add(float(1).sub(s).mul(2).mul(length(gr)).mul(1600))), gr);
}).setLayout({ name: 'riverMeander', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }, { name: 'sand', type: 'vec3' }, { name: 's', type: 'float' }] });
/** the river's raw field: (r, 0 on the stream's line; its gradient) */
export const riverRaw = Fn(([p]) => {
  const R = riverWorld(p).toVar(), s = sandW(p);
  If(U.uSand.z.greaterThan(0).and(riverSand()).and(s.greaterThan(0)), () => { R.assign(riverMeander(p, U.uSand.xyz, s)); });
  return R;
});
// ---- the lakes (src/world/land.js: what a ring of river closes round is water): their middles, how far they reach,
// the sign of the river's field inside, as the CPU found them (setLakes; none: radius 0) ----
// (looked through as many as there are, a number the loop does not know when it is compiled: a loop of a fixed 32 is
// written out 32 times over by the GPU's compiler, in every shader that reads the river: a slower start)
const LAKE = uniformArray(Array.from({ length: LAKE_MAX }, () => new Vector4(0, 0, 0, 0)), 'vec4').setGroup(renderGroup), LAKES_N = uniform(0, 'int').setGroup(renderGroup);
/** the lakes the CPU found, to the GPU */
export const setLakes = (list) => { for (let i = 0; i < LAKE_MAX; i++) { const L = list[i]; LAKE.array[i].set(L?.x ?? 0, L?.z ?? 0, L?.r ?? 0, L?.s ?? 0); } LAKES_N.value = Math.min(LAKE_MAX, list.length); };
/** 1 where p, the river's raw field there r, lies in a lake */
const inLake = (p, r0) => {
  const k = float(0).toVar(), r = float(r0).toVar(), q = vec2(p).toVar();   // (held: written out once, not again inside the loop)
  Loop({ start: int(0), end: LAKES_N }, ({ i }) => { const L = LAKE.element(i); If(length(q.sub(L.xy)).lessThan(L.z).and(r.mul(L.w).greaterThanEqual(0)), () => { k.assign(1); }); });
  return k;
};
/** 1 within `margin` metres round a lake (what grows on its shore: src/scatter/trees.js), 0 elsewhere */
export const nearLake = (p, margin = 40) => {
  const k = float(0).toVar(), q = vec2(p).toVar();
  Loop({ start: int(0), end: LAKES_N }, ({ i }) => { const L = LAKE.element(i); If(length(q.sub(L.xy)).lessThan(L.z.add(margin)), () => { k.assign(1); }); });
  return k;
};
/** 1 in a lake, 0 elsewhere (its water stands still: src/terrain/water.js) */
export const lakeAt = Fn(([p]) => inLake(p, riverRaw(p).x));
/** (signed distance from the channel's middle, half-width, which bank: > 0 a bend's outside, the bend) */
/** A path's width before it wanders, metres: its least (src/terrain/layers.js lets its ground go by it). */
export const PATH_W = 4.5;
export const riverInfo = Fn(([p]) => {
  const R = riverRaw(p).toVar(), gl = max(length(R.yz), 2e-4), t = vec2(R.z.negate(), R.y).div(gl);
  const A = riverRaw(p.add(t.mul(20))), Bk = riverRaw(p.sub(t.mul(20)));
  const dt0 = atan(A.z, A.y).sub(atan(Bk.z, Bk.y)), dt = atan(sin(dt0), cos(dt0)), bend = clamp(dt.div(40).mul(BEND), -1, 1);
  const w = float(PATH_W).add(smoothstep(0.25, 0.75, vnoise(p.mul(1 / 90), uint(42))).mul(3.5)).add(abs(bend).mul(7)).mul(vnoise(p.mul(1 / 14), uint(43)).mul(0.28).add(0.86));
  // (inside a lake: the channel's middle all over. Its numbers held first: a choice between two values that both
  // work them out would write the river out twice over)
  const W = w.toVar(), Bd = bend.toVar(), sd = R.x.div(gl).sub(W.mul(0.25).mul(Bd)).toVar(), out = vec4(sd, W, Bd.mul(sd.greaterThanEqual(0).select(1, -1)), Bd).toVar();
  If(inLake(p, R.x).greaterThan(0.5), () => { out.assign(vec4(0, W, 0, 0)); });
  return out;
});
/** riverInfo at q close by p, whose info is I: the distance to the channel worked out again, its width and bend kept
    (they change over tens of metres; a vertex's neighbours for its normal are half a metre off) */
export const riverNear = Fn(([q, I]) => {
  const R = riverRaw(q).toVar(), sd = R.x.div(max(length(R.yz), 2e-4)).sub(I.y.mul(0.25).mul(I.w)).toVar(), out = vec4(sd, I.y, I.w.mul(sd.greaterThanEqual(0).select(1, -1)), I.w).toVar();
  If(inLake(q, R.x).greaterThan(0.5), () => { out.assign(vec4(0, I.y, 0, 0)); });
  return out;
});
// (the height and its parts, which read no uniform: each a function of the shader's own, its layout, written once in a
// shader and not again at every call: intent 0038. What reads a uniform, the river, stays written out where it is
// called: three r187 names a uniform inside such a function apart from the shader's own, and the shader does not compile)
export const riverCarve = Fn(([d, w, b]) => {
  const cut = max(b, 0), bar = max(b.negate(), 0), D = clamp(float(9).div(w), 0.75, 1.7).mul(1.2);
  return D.mul(float(1).sub(smoothstep(w.mul(cut.mul(0.4).add(0.55).sub(bar.mul(0.35))), w.mul(float(1.1).sub(cut.mul(0.06)).add(bar.mul(0.25))), d)));
}).setLayout({ name: 'riverCarve', type: 'float', inputs: [{ name: 'd', type: 'float' }, { name: 'w', type: 'float' }, { name: 'b', type: 'float' }] });
export const riverBank = Fn(([d, w, b]) => {
  const cut = max(b, 0), bar = max(b.negate(), 0);
  return smoothstep(w, w.add(5).add(bar.mul(8)), d).mul(0.3).add(cut.mul(1.3).mul(smoothstep(w, w.add(1.2), d)).mul(float(1).sub(smoothstep(w.add(6), w.add(30), d).mul(0.6))));
}).setLayout({ name: 'riverBank', type: 'float', inputs: [{ name: 'd', type: 'float' }, { name: 'w', type: 'float' }, { name: 'b', type: 'float' }] });
/** the valley's floor at p and its slope: vec3(h, ∂h/∂x, ∂h/∂z) */
const floorOf = Fn(([p]) => {
  const n1 = noised(p.mul(1 / 2600), uint(11)), n2 = noised(p.mul(1 / 900).add(3.7), uint(12));
  return vec3(n1.x.sub(0.5).mul(40).add(n2.x.sub(0.5).mul(14)), n1.yz.mul(40 / 2600).add(n2.yz.mul(14 / 900)));
}).setLayout({ name: 'floorOf', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });
/** the valley's floor */
export const baseB = (p) => floorOf(p).x;
export const WATER_DROP_N = float(WATER_DROP);

// (the octaves' numbers as arrays a loop reads, made where a shader is built: their wavelengths and amplitudes)
const octaves = () => ({ lam: array(OCT_LAM.map((v) => float(v))).toVar(), amp: array(OCT_AMP.map((v) => float(v))).toVar() });
// (a smoothstep's slope at x: 0 outside a … b)
const stepSlope = (a, b, x) => { const t = clamp(x.sub(a).div(b.sub(a)), 0, 1); return t.mul(float(1).sub(t)).mul(6).div(b.sub(a)); };
/** The ground's height at p and its slope, worked out together (src/world/land.js heightSlopeAt, its twin, proven on the
    CPU against the land's own finite difference). pe: the dial's pixels a metre of height covers there
    (src/detail/measure.js). The land's octaves, each kept as long as its height shows (its amplitude over a dial pixel
    on screen, handed over within BAND: the land's mesh is fine enough to carry every octave that shows,
    src/terrain/terrain.js), each with its own slope (noised); the river, its part of the slope over e ahead in x and in
    z (dX, dZ: its distance there, read with its width and bend kept: riverNear); the pads under what stands.
    vec4(h, ∂h/∂x, ∂h/∂z, the valley's floor). One evaluation of the land where its slope took three; and the land's one
    function: its height alone is this one's first number (heightAt), so the prepass and the colour pass, one asking the
    height and one the slope too, put the ground at the same depth to the last bit (src/core/pass.js: the equal test). */
const heightSlopeOf = Fn(([p, d, w, b, pe, dX, dZ, e]) => {
  const mF = (v) => smoothstep(w, w.add(80), v), rvF = (v) => mF(v).mul(3).add(riverBank(v, w, b)).sub(riverCarve(v, w, b));
  const m = mF(d).toVar(), dmx = mF(dX).sub(m).div(e).toVar(), dmz = mF(dZ).sub(m).div(e).toVar(), rv = rvF(d).toVar();
  const rx = rvF(dX).sub(rv).div(e), rz = rvF(dZ).sub(rv).div(e);
  // (T: the turn the octave reads the point through, the rows of the matrix q = T·p: its slope turned back by T's transpose)
  const h = float(0).toVar(), hx = float(0).toVar(), hz = float(0).toVar(), q = vec2(p).toVar(), T = vec4(1, 0, 0, 1).toVar(), O = octaves();
  Loop(OCT_LAM.length, ({ i }) => {   // (the octaves in a loop: written once in a shader, not once an octave)
    q.assign(vec2(q.x.mul(0.8).sub(q.y.mul(0.6)), q.x.mul(0.6).add(q.y.mul(0.8))));
    T.assign(vec4(T.x.mul(0.8).sub(T.z.mul(0.6)), T.y.mul(0.8).sub(T.w.mul(0.6)), T.x.mul(0.6).add(T.z.mul(0.8)), T.y.mul(0.6).add(T.w.mul(0.8))));
    const lam = O.lam.element(i), A = O.amp.element(i), e1 = pe.mul(A);
    If(e1.greaterThan(1), () => {
      const n = noised(q.div(lam).add(float(i).mul(7.31)), uint(i).add(uint(20))), k = smoothstep(1, BAND, e1).mul(A), v = n.x.sub(0.5);
      // (the last two octaves keep 0.35 of themselves on the river's banks: mix(0.35, 1, m))
      const s = i.greaterThanEqual(6).select(float(0.65), float(1)), f = m.sub(1).mul(s).add(1), fx = dmx.mul(s), fz = dmz.mul(s);
      const px = n.y.mul(T.x).add(n.z.mul(T.z)).div(lam), pz = n.y.mul(T.y).add(n.z.mul(T.w)).div(lam);
      h.addAssign(v.mul(f).mul(k)); hx.addAssign(px.mul(f).add(v.mul(fx)).mul(k)); hz.addAssign(pz.mul(f).add(v.mul(fz)).mul(k));
    });
  });
  const F = floorOf(p).toVar(), H = F.x.add(h).add(rv).toVar(), HX = F.y.add(hx).add(rx).toVar(), HZ = F.z.add(hz).add(rz).toVar();
  for (const P of PADS) {
    const dv = p.sub(vec2(P.x, P.z)), len = length(dv), sP = smoothstep(P.r, P.r + PAD_FALL, len), dsP = stepSlope(float(P.r), float(P.r + PAD_FALL), len).div(max(len, 1e-4)), over = H.sub(P.h);
    HX.assign(HX.mul(sP).add(over.mul(dsP).mul(dv.x))); HZ.assign(HZ.mul(sP).add(over.mul(dsP).mul(dv.y))); H.assign(over.mul(sP).add(P.h));
  }
  return vec4(H, HX, HZ, F.x);
}).setLayout({ name: 'heightSlopeAt', type: 'vec4', inputs: [{ name: 'p', type: 'vec2' }, { name: 'd', type: 'float' }, { name: 'w', type: 'float' }, { name: 'b', type: 'float' }, { name: 'pe', type: 'float' }, { name: 'dX', type: 'float' }, { name: 'dZ', type: 'float' }, { name: 'e', type: 'float' }] });
/** The ground's height at p seen dist metres off, and its slope (d, w, b: the river there, riverInfo; dX, dZ: its
    distance e ahead in x and in z, riverNear's): vec4(h, ∂h/∂x, ∂h/∂z, the valley's floor). (The measure is read here,
    outside the land's function: a uniform named inside one does not compile; through the lens, as its mesh is made:
    src/terrain/terrain.js) */
export const heightSlopeAt = (p, dist, d, w, b, dX, dZ, e) => heightSlopeOf(p, d, w, b, dialPxAt(uPxK.div(max(dist, 1e-3))), dX, dZ, e);
/** The ground's height at p, seen dist metres off (d, w, b: the river there, riverInfo): the land's function's height
    (its slope asked of nothing: a shader's compiler drops what of it is not used). */
export const heightAt = (p, dist, d, w, b) => heightSlopeAt(p, dist, d, w, b, d, d, float(1)).x;
/** the height at p, the river worked out here */
export const groundAt = (p, dist) => { const I = riverInfo(p); return heightAt(p, dist, abs(I.x), I.y, I.z); };

// ---- what grows where ----
export const pathN = Fn(([p]) => { const n = noised(p.mul(1 / 260).add(5.1), uint(60)); return vec3(n.x, n.yz.mul(1 / 260)); });
export const pathMask = Fn(([P]) => float(1).sub(smoothstep(0.45, 0.95, abs(P.x.sub(0.5)).div(max(length(P.yz), 1e-3)))));
export const bareMask = Fn(([p]) => { const q = p.mul(1 / 8); return placeOff(p, smoothstep(0.6, 0.7, vnoise(q.add(vec2(vnoise(q.mul(0.31), uint(78)), vnoise(q.mul(0.31).add(2.9), uint(79))).sub(0.5).mul(1.6)), uint(70)).mul(0.7).add(vnoise(p.mul(1 / 2.1).add(4.4), uint(71)).mul(0.3)))); });   // pushed about: no grid of patches
// (value noise puts its blobs on a grid: from high up, one grid of them reads as rows; pushed about by a slower noise, and
// with a second, turned and at a scale with no whole ratio, the tufts lie anyhow)
export const tuftMask = Fn(([p]) => {
  const q = p.mul(1 / 28), push = vec2(vnoise(q.mul(0.37), uint(75)), vnoise(q.mul(0.37).add(5.3), uint(76))).sub(0.5).mul(1.8);
  const r = vec2(p.x.mul(0.8).add(p.y.mul(0.6)), p.y.mul(0.8).sub(p.x.mul(0.6))).mul(1 / 17.3);
  return smoothstep(0.45, 0.7, vnoise(q.add(push), uint(72)).mul(0.65).add(vnoise(r, uint(77)).mul(0.35)));
});
export const outcropMask = Fn(([p]) => placeOff(p, smoothstep(0.6, 0.72, vnoise(p.mul(1 / 230), uint(74)))));
/** the library's stage: 1 on its round of bare, dry earth, 0 off it */
export const stageAt = (p) => U.uStage.z.greaterThan(0).select(float(1).sub(smoothstep(U.uStage.z.sub(0.9), U.uStage.z.add(0.9), length(p.sub(U.uStage.xy)).add(edgeJit(p).mul(0.8)))), float(0));

/** What the biomes make of a point. ctx: { p, dist, d, w, b } (d, w, b: the river here, riverInfo). Returns each laid
    biome's share, lowest layer first, and what they add up to: the grass's cover (all ground, and among the grassy
    biomes only), its height (a share of the grass asset's own), the dryness, and the chance of a stone. Every biome laid
    is worked out. */
export function biomesAt(ctx, vars = false) {   // vars: inside a Fn, each share kept in a variable, worked out once
  // (the place as the rules read it, bent: worked out once for all of them; world/outlines.js)
  const B = bent(ctx.p), at = { ...ctx, B: vars ? B.toVar() : B };
  const shares = LAID.map((b) => { const w = placed(b, clamp(b.where(at), 0, 1), ctx.p); return { b, w: vars ? w.toVar() : w }; });
  if (vars) ctx.shares = new Map(shares.map(({ b, w }) => [b, w]));   // (kept with the place: what else asks of it there reads these, shareOf)
  let cover = float(1), height = float(1), stones = float(BASE.stones);
  const tufts = ctx.dist.lessThan(900).select(mix(tuftMask(ctx.p), 0.5, smoothstep(350, 900, ctx.dist)), float(0.5));   // grass in tufts, let go far off
  for (const { b, w } of shares) {
    const g = b.grass;
    cover = mix(cover, g ? coverOf(g, ctx, tufts) : float(0), w); stones = mix(stones, b.stones ?? BASE.stones, w);
    if (g) height = mix(height, g.height ?? 1, w);
  }
  return { shares, cover, ...grassFrom(shares, ctx, tufts), height, stones };
}
// a biome's grass cover at a place: a number, or told place by place (coverAt, node code); in tufts where it says so
const coverOf = (g, ctx, tufts) => { const cv = g.coverAt ? g.coverAt(ctx) : float(g.cover); return g.tufts ? tufts.mul(cv) : cv; };
/** From the biomes' shares at a place: the grass's cover among the grassy biomes, and how dry it is. tufts: the tufts' mask there;
    lazy (inside a Fn): a biome's cover worked out only where the biome lies. */
export const grassFrom = (shares, ctx, tufts, lazy = false) => {
  let grassy = lazy ? float(1).toVar() : float(1), dry = float(0);
  for (const { b, w } of shares) {
    const g = b.grass; if (!g) continue;
    if (lazy) If(w.greaterThan(0.003), () => { grassy.assign(mix(grassy, coverOf(g, ctx, tufts), w)); }); else grassy = mix(grassy, coverOf(g, ctx, tufts), w);
    if (g.colours?.dry) dry = mix(dry, 1, w);
  }
  return { grassy, dry };
};
/** How dry the land is at a point (ctx as biomesAt's): only the biomes that make it so (a grass that says its `dry`
    colour) are worked out, not every biome: what reads only this (an outcrop far off) does not grow with the biomes. */
export const dryAt = (ctx) => LAID.filter((b) => b.grass?.colours?.dry).reduce((dry, b) => mix(dry, 1, shareOf(b, ctx)), float(0));

// the grass's colour, from the base biome's own numbers: a and b two of the land's cloudy noises, dry the dryness
const v3 = (c) => vec3(c[0], c[1], c[2]), G = BASE.grass, DRY = G.colours.dry ?? LAID.find((b) => b.grass?.colours?.dry)?.grass.colours.dry ?? G.colours.b;
export const grassTintAB = Fn(([a, b, dry]) => {
  const c0 = mix(v3(G.colours.a), v3(G.colours.b), smoothstep(0.1, 0.9, a.mul(0.65).add(b.mul(0.35))));
  const c = mix(vec3(c0.dot(vec3(0.3, 0.6, 0.1))), c0, G.mute);
  const d = clamp(dry.mul(0.9).add(smoothstep(0.6, 1, b.mul(0.6).add(a.mul(0.4))).mul(0.28)), 0, 1);
  return vec4(mix(c, v3(DRY), d), d);
});
/** the grass's colour at p, read from the baked land noise (tex: src/materials/bake.js). Over it, slow fields a kilometre
    or two across, some lusher and darker, some paler and drier, so the far land is not one even green. */
export const grassTint = (tex, p, dry, level = null) => grassTintF(tex, p, dry, level).tint;
// how a slow field (-0.5 lush … 0.5 pale) colours the grass
const fieldOn = (field) => vec3(1, 1, 1).add(vec3(0.1, 0.04, -0.14).mul(field).mul(2)).mul(float(1).sub(field.mul(-0.16)));
/** grassTint, and the slow field it read: { tint, field } */
export const grassTintF = (tex, p, dry, level = null) => {
  const pr = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6)));
  const rd = (q) => (level === null ? tex.a(noise, q) : tex.a(noise, q).level(level));
  // the tile repeats: each read is two takes, turned and at scales with no whole ratio, blended by a slow mask, so no
  // stretch of meadow is the same as another (seen from high up, a single take shows as a grid of the same blotches)
  const pq = vec2(p.x.mul(0.94).add(p.y.mul(0.342)), p.y.mul(0.94).sub(p.x.mul(0.342))), k = smoothstep(0.3, 0.7, rd(pq.mul(1 / 613).add(0.17)).a);
  const two = (a, b) => clamp(mix(a, b, mix(0.3, 0.7, k)).sub(0.5).mul(1.4).add(0.5), 0, 1);   // always both, in a slowly changing share (mixed, they lose contrast: given back)
  const t = grassTintAB(clamp(two(rd(p.mul(1 / 150)).r, rd(pq.mul(1 / 211).add(0.53)).r).add(rd(pr.mul(1 / 397)).a).sub(1).mul(0.8).add(0.5), 0, 1), two(rd(pr.mul(1 / 45)).g, rd(pq.mul(1 / 63.6).add(0.29)).g), dry);
  const field = smoothstep(0.3, 0.7, rd(pr.mul(1 / 1900).add(0.41)).b).sub(0.5);   // -0.5 lush … 0.5 pale
  return { tint: vec4(t.rgb.mul(fieldOn(field)), t.a), field };
};
