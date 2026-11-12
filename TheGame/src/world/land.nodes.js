// The land on the GPU: world/land.js's functions as node functions (TSL), constant for constant, so what the shaders
// draw is the ground the walker stands on. Every material that needs the land (terrain, water, grass, rocks, the ground
// pass) builds from these. The biomes (biomes/*.js) bring their own rules; the library's sandbox lays one biome over
// all the land round its stage.
import { Fn, float, int, uint, vec2, vec3, vec4, floor, abs, max, clamp, mix, smoothstep, length, sqrt, atan, sin, cos, If } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { hashI, rnd, noised, vnoise, camDist, edgeJit } from './noise.nodes.js';
export { hashI, rnd, noised, vnoise, camDist, edgeJit };
import { OCT_LAM, OCT_AMP, WATER_DROP, PADS, PAD_FALL, BEND, MEANDER } from './land.js';
import { BIOMES, BASE, WATER } from './biomes.js';
import { PLACES } from './places.js';
import { recipe } from '../core/registry.js';
import noise from '../../materials/noise.js';

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
/** one biome's share at a point (ctx as biomesAt's): its rule, placed (the library's sandbox) */
export const shareOf = (b, ctx) => placed(b, clamp(b.where(ctx), 0, 1), ctx.p);
export const placeOff = (p, natural) => natural.mul(float(1).sub(sandW(p)));
/** 1 under the roof of what stands at a place (its asset's `roofed`), 0 in the open: where no snow falls */
export const roofAt = (p) => Object.values(PLACES).map((P) => [P, recipe(P.asset)?.roofed]).filter(([, r]) => r).reduce((a, [P, r]) => max(a, float(1).sub(smoothstep(r - 0.15, r + 0.1, length(p.sub(vec2(P.x, P.z)))))), float(0));

// ---- the river: the world's, or in the river's sandbox its own, meandering ----
const riverWorld = Fn(([p]) => {
  const n1 = noised(p.mul(1 / 1600), uint(40)), n2 = noised(p.mul(1 / 330).add(17.3), uint(41));
  return vec3(n1.x.sub(0.5).add(n2.x.sub(0.5).mul(0.28)), n1.yz.mul(1 / 1600).add(n2.yz.mul(0.28 / 330)));
});
/** the river's raw field: (r, 0 on the stream's line; its gradient) */
export const riverRaw = Fn(([p]) => {
  const R = riverWorld(p).toVar(), s = sandW(p);
  If(U.uSand.z.greaterThan(0).and(riverSand()).and(s.greaterThan(0)), () => {
    const d = p.sub(U.uSand.xy), c = Math.cos(MEANDER.turn), sn = Math.sin(MEANDER.turn), k = (2 * Math.PI) / MEANDER.wave;
    const u = d.x.mul(c).add(d.y.mul(sn)), v = d.x.mul(-sn).add(d.y.mul(c));
    const g = v.sub(sin(u.mul(k)).mul(MEANDER.swing)), gu = cos(u.mul(k)).mul(-MEANDER.swing * k);
    const gr = vec2(gu.mul(c).sub(sn), gu.mul(sn).add(c)).div(1600);
    R.assign(vec3(g.greaterThanEqual(0).select(1, -1).mul(abs(g).div(1600).add(float(1).sub(s).mul(2).mul(length(gr)).mul(1600))), gr));
  });
  return R;
});
/** (signed distance from the channel's middle, half-width, which bank: > 0 a bend's outside, the bend) */
export const riverInfo = Fn(([p]) => {
  const R = riverRaw(p), gl = max(length(R.yz), 2e-4), t = vec2(R.z.negate(), R.y).div(gl);
  const A = riverRaw(p.add(t.mul(20))), Bk = riverRaw(p.sub(t.mul(20)));
  const dt0 = atan(A.z, A.y).sub(atan(Bk.z, Bk.y)), dt = atan(sin(dt0), cos(dt0)), bend = clamp(dt.div(40).mul(BEND), -1, 1);
  const w = float(4.5).add(smoothstep(0.25, 0.75, vnoise(p.mul(1 / 90), uint(42))).mul(3.5)).add(abs(bend).mul(7)).mul(vnoise(p.mul(1 / 14), uint(43)).mul(0.28).add(0.86));
  const sd = R.x.div(gl).sub(w.mul(0.25).mul(bend));
  return vec4(sd, w, bend.mul(sd.greaterThanEqual(0).select(1, -1)), bend);
});
/** riverInfo at q close by p, whose info is I: the distance to the channel worked out again, its width and bend kept
    (they change over tens of metres; a vertex's neighbours for its normal are half a metre off) */
export const riverNear = Fn(([q, I]) => {
  const R = riverRaw(q), sd = R.x.div(max(length(R.yz), 2e-4)).sub(I.y.mul(0.25).mul(I.w));
  return vec4(sd, I.y, I.w.mul(sd.greaterThanEqual(0).select(1, -1)), I.w);
});
export const riverCarve = Fn(([d, w, b]) => {
  const cut = max(b, 0), bar = max(b.negate(), 0), D = clamp(float(9).div(w), 0.75, 1.7).mul(1.2);
  return D.mul(float(1).sub(smoothstep(w.mul(cut.mul(0.4).add(0.55).sub(bar.mul(0.35))), w.mul(float(1.1).sub(cut.mul(0.06)).add(bar.mul(0.25))), d)));
});
export const riverBank = Fn(([d, w, b]) => {
  const cut = max(b, 0), bar = max(b.negate(), 0);
  return smoothstep(w, w.add(5).add(bar.mul(8)), d).mul(0.3).add(cut.mul(1.3).mul(smoothstep(w, w.add(1.2), d)).mul(float(1).sub(smoothstep(w.add(6), w.add(30), d).mul(0.6))));
});
/** the valley's floor */
export const baseB = Fn(([p]) => vnoise(p.mul(1 / 2600), uint(11)).sub(0.5).mul(40).add(vnoise(p.mul(1 / 900).add(3.7), uint(12)).sub(0.5).mul(14)));
export const WATER_DROP_N = float(WATER_DROP);

/** The ground's height at p: the land's octaves (each let go with distance), the river, and the pads under what stands */
export const heightAt = Fn(([p, dist, d, w, b]) => {
  const m = smoothstep(w, w.add(80), d), mm = mix(0.35, 1, m), h = float(0).toVar(), q = vec2(p).toVar();
  for (let i = 0; i < OCT_LAM.length; i++) {
    q.assign(vec2(q.x.mul(0.8).sub(q.y.mul(0.6)), q.x.mul(0.6).add(q.y.mul(0.8))));
    const lam = OCT_LAM[i];
    If(dist.lessThan(lam * 19.2), () => {
      h.addAssign(vnoise(q.div(lam).add(i * 7.31), uint(20 + i)).sub(0.5).mul(OCT_AMP[i]).mul(float(1).sub(smoothstep(lam * 9.6, lam * 19.2, dist))).mul(i >= 6 ? mm : m));
    });
  }
  const H = baseB(p).add(h).add(m.mul(3)).add(riverBank(d, w, b)).sub(riverCarve(d, w, b)).toVar();
  for (const P of PADS) H.assign(mix(float(P.h), H, smoothstep(P.r, P.r + PAD_FALL, length(p.sub(vec2(P.x, P.z))))));
  return H;
});
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
    biomes only), its height (a share of the grass asset's own), the dryness, and the chance of a stone. */
export function biomesAt(ctx, vars = false) {   // vars: inside a Fn, each share kept in a variable, worked out once
  const shares = LAID.map((b) => { const w = placed(b, clamp(b.where(ctx), 0, 1), ctx.p); return { b, w: vars ? w.toVar() : w }; });
  let cover = float(1), grassy = float(1), height = float(1), dry = float(0), stones = float(BASE.stones);
  const tufts = ctx.dist.lessThan(900).select(mix(tuftMask(ctx.p), 0.5, smoothstep(350, 900, ctx.dist)), float(0.5));   // grass in tufts, let go far off
  for (const { b, w } of shares) {
    const g = b.grass, c = g ? (g.tufts ? tufts.mul(g.cover) : float(g.cover)) : float(0);
    cover = mix(cover, c, w); stones = mix(stones, b.stones ?? BASE.stones, w);
    if (g) { grassy = mix(grassy, c, w); height = mix(height, g.height ?? 1, w); if (g.colours?.dry) dry = mix(dry, 1, w); }
  }
  return { shares, cover, grassy, height, dry, stones };
}
/** the biomes at p, the river worked out here */
export const biomesHere = (p, dist) => { const I = riverInfo(p); return biomesAt({ p, dist, d: abs(I.x), w: I.y, b: I.z }); };

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
export const grassTint = (tex, p, dry, level = null) => {
  const pr = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6)));
  const rd = (q) => (level === null ? tex.a(noise, q) : tex.a(noise, q).level(level));
  // the tile repeats: each read is two takes, turned and at scales with no whole ratio, blended by a slow mask, so no
  // stretch of meadow is the same as another (seen from high up, a single take shows as a grid of the same blotches)
  const pq = vec2(p.x.mul(0.94).add(p.y.mul(0.342)), p.y.mul(0.94).sub(p.x.mul(0.342))), k = smoothstep(0.3, 0.7, rd(pq.mul(1 / 613).add(0.17)).a);
  const two = (a, b) => clamp(mix(a, b, mix(0.3, 0.7, k)).sub(0.5).mul(1.4).add(0.5), 0, 1);   // always both, in a slowly changing share (mixed, they lose contrast: given back)
  const t = grassTintAB(clamp(two(rd(p.mul(1 / 150)).r, rd(pq.mul(1 / 211).add(0.53)).r).add(rd(pr.mul(1 / 397)).a).sub(1).mul(0.8).add(0.5), 0, 1), two(rd(pr.mul(1 / 45)).g, rd(pq.mul(1 / 63.6).add(0.29)).g), dry);
  const field = smoothstep(0.3, 0.7, rd(pr.mul(1 / 1900).add(0.41)).b).sub(0.5);   // -0.5 lush … 0.5 pale
  return vec4(t.rgb.mul(vec3(1, 1, 1).add(vec3(0.1, 0.04, -0.14).mul(field).mul(2))).mul(float(1).sub(field.mul(-0.16))), t.a);
};
