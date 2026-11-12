// The land on the GPU: world/land.js's functions as node functions (TSL), constant for constant, so what the shaders
// draw is the ground the walker stands on. Every material that needs the land (terrain, water, grass, rocks, the ground
// pass) builds from these. The biomes' numbers come from biomes/*.js; the library's sandbox lays one biome over all the
// land round its stage.
import { Fn, float, int, uint, vec2, vec3, vec4, floor, abs, max, clamp, mix, smoothstep, length, sqrt, atan, sin, cos, If } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { OCT_LAM, OCT_AMP, WATER_DROP, PADS, PAD_FALL, BEND, MEANDER } from './land.js';
import { BIOMES, at } from '../../biomes/index.js';

// ---- the hash and the noise ----
export const hashI = Fn(([cx, cy, s]) => {
  const h = uint(cx).mul(uint(0x9E3779B1)).bitXor(uint(cy).mul(uint(0x85EBCA77))).bitXor(uint(s).mul(uint(0xC2B2AE3D))).toVar();
  h.assign(h.bitXor(h.shiftRight(uint(15)))); h.assign(h.mul(uint(0x2C1B3C6D)));
  h.assign(h.bitXor(h.shiftRight(uint(12)))); h.assign(h.mul(uint(0x297A2D39)));
  h.assign(h.bitXor(h.shiftRight(uint(15))));
  return h;
});
/** 0..1 from a cell and a seed */
export const rnd = Fn(([cx, cy, s]) => float(hashI(cx, cy, s).shiftRight(uint(8))).mul(1 / 16777216));
/** (value, d/dx, d/dy) of smooth value noise at p, seed s */
export const noised = Fn(([p, s]) => {
  const i = floor(p), f = p.sub(i), cx = int(i.x), cy = int(i.y);
  const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10)), du = f.mul(f).mul(30).mul(f.mul(f.sub(2)).add(1));
  const a = rnd(cx, cy, s), b = rnd(cx.add(1), cy, s), c = rnd(cx, cy.add(1), s), d = rnd(cx.add(1), cy.add(1), s), k = a.sub(b).sub(c).add(d);
  return vec3(a.add(b.sub(a).mul(u.x)).add(c.sub(a).mul(u.y)).add(k.mul(u.x).mul(u.y)), du.mul(vec2(b.sub(a).add(k.mul(u.y)), c.sub(a).add(k.mul(u.x)))));
});
export const vnoise = Fn(([p, s]) => {
  const i = floor(p), f = p.sub(i), cx = int(i.x), cy = int(i.y), u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const a = rnd(cx, cy, s), b = rnd(cx.add(1), cy, s), c = rnd(cx, cy.add(1), s), d = rnd(cx.add(1), cy.add(1), s);
  return a.add(b.sub(a).mul(u.x)).add(c.sub(a).mul(u.y)).add(a.sub(b).sub(c).add(d).mul(u.x).mul(u.y));
});
/** the lens's distance to a point on the ground: the detail governor and the camera's height count */
export const camDist = Fn(([p]) => { const d = p.sub(U.uCam.xz); return sqrt(d.dot(d).add(U.uDy.mul(U.uDy))).mul(U.uLodInv); });

// ---- the biomes' numbers, and the library's sandbox: round (x, z) of uSand the land is one biome (w: its number) ----
const B = { land: at('land'), arid: at('arid'), bank: at('bank'), water: at('water'), cut: at('cutbank'), bar: at('bar') };
export const BIO = {
  ...B, LAND_STONES: B.land.stones, ARID_STONES: B.arid.stones - B.land.stones, BANK_STONES: B.bank.stones - B.land.stones,
  CUT_STONES: B.cut.stones - B.land.stones, BAR_STONES: B.bar.stones - B.land.stones,
  LAND_FLOWERS: B.land.grass.flowers ? 1 : 0, ARID_COVER: B.arid.grass.cover, ARID_HEIGHT: B.arid.grass.height,
};
const idx = (b) => BIOMES.indexOf(b);
export const sandW = Fn(([p]) => U.uSand.z.greaterThan(0).select(float(1).sub(smoothstep(220, 340, length(p.sub(U.uSand.xy)))), float(0)));
const sandIs = (b) => abs(U.uSand.w.sub(idx(b))).lessThan(0.5).select(float(1), float(0));
const riverSand = () => sandIs(B.water).greaterThan(0.5);   // the river's sandbox has its own banks
export const placeArid = (p, natural) => mix(natural, sandIs(B.arid), sandW(p));
export const placeBank = (p, natural) => riverSand().select(natural, mix(natural, sandIs(B.bank), sandW(p)));
export const placeCut = (p, natural) => riverSand().select(natural, mix(natural, sandIs(B.cut), sandW(p)));
export const placeBar = (p, natural) => riverSand().select(natural, mix(natural, sandIs(B.bar), sandW(p)));
export const placeOff = (p, natural) => natural.mul(float(1).sub(sandW(p)));   // paths, bare patches, outcrops: none in a sandbox

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
export const aridMask = Fn(([p, dist]) => placeArid(p, smoothstep(0.5, 0.66, vnoise(p.mul(1 / 700), uint(50)).add(vnoise(p.mul(1 / 150), uint(51)).sub(0.5).mul(0.3).mul(float(1).sub(smoothstep(3000, 8000, dist)))))));
export const pathN = Fn(([p]) => { const n = noised(p.mul(1 / 260).add(5.1), uint(60)); return vec3(n.x, n.yz.mul(1 / 260)); });
export const pathMask = Fn(([P]) => float(1).sub(smoothstep(0.45, 0.95, abs(P.x.sub(0.5)).div(max(length(P.yz), 1e-3)))));
// (each mask below already answers the sandbox: placeArid, placeBank… inside; the path's, which reads pathN, by its caller)
export const bareMask = Fn(([p]) => placeOff(p, smoothstep(0.6, 0.7, vnoise(p.mul(1 / 8), uint(70)).mul(0.7).add(vnoise(p.mul(1 / 2.1).add(4.4), uint(71)).mul(0.3)))));
export const edgeJit = Fn(([p]) => vnoise(p.mul(1 / 6), uint(44)).sub(0.5).mul(2).add(vnoise(p.mul(1 / 1.7), uint(45)).sub(0.5)));
export const bankMask = Fn(([p, d0, w, b]) => {
  const bar = max(b.negate(), 0), cut = max(b, 0), d = d0.add(edgeJit(p).mul(bar.mul(1.5).add(1.6))), e = w.mul(bar.mul(0.5).add(1.15));
  return placeBank(p, float(1).sub(smoothstep(e, e.add(3).add(bar.mul(4)), d)).mul(float(1).sub(cut.mul(0.6))));
});
export const cutMask = Fn(([p, d0, w, b]) => { const d = d0.add(edgeJit(p.add(31)).mul(0.7)); return placeCut(p, max(b, 0).mul(smoothstep(w.mul(0.85), w.mul(0.98), d)).mul(float(1).sub(smoothstep(w.add(1.4), w.add(3.4), d)))); });
export const barMask = Fn(([p, d0, w, b]) => {
  const bar = max(b.negate(), 0), d = d0.add(edgeJit(p.add(57)).mul(1.4));
  return placeBar(p, smoothstep(0.15, 0.6, bar).mul(smoothstep(w.mul(0.4), w.mul(0.85), d)).mul(float(1).sub(smoothstep(w.mul(bar.mul(0.35).add(0.95)), w.mul(bar.mul(0.5).add(1.2)), d))).mul(smoothstep(0.35, 0.65, vnoise(p.mul(1 / 9), uint(46)).add(0.25))));
});
export const tuftMask = Fn(([p]) => smoothstep(0.45, 0.7, vnoise(p.mul(1 / 28), uint(72))));
export const outcropMask = Fn(([p]) => placeOff(p, smoothstep(0.6, 0.72, vnoise(p.mul(1 / 230), uint(74)))));
/** the library's stage: 1 on its round of bare, dry earth, 0 off it */
export const stageAt = (p) => U.uStage.z.greaterThan(0).select(float(1).sub(smoothstep(U.uStage.z.sub(0.9), U.uStage.z.add(0.9), length(p.sub(U.uStage.xy)).add(edgeJit(p).mul(0.8)))), float(0));

// the grass's colour, from the biomes' own numbers: a and b are two of the land's cloudy noises, ar the dryness
const v3 = (c) => vec3(c[0], c[1], c[2]);
export const grassTintAB = Fn(([a, b, ar]) => {
  const c0 = mix(v3(B.land.grass.colours.a), v3(B.land.grass.colours.b), smoothstep(0.1, 0.9, a.mul(0.65).add(b.mul(0.35))));
  const c = mix(vec3(c0.dot(vec3(0.3, 0.6, 0.1))), c0, B.land.grass.mute);
  const dry = clamp(ar.mul(0.9).add(smoothstep(0.6, 1, b.mul(0.6).add(a.mul(0.4))).mul(0.28)), 0, 1);
  return vec4(mix(c, v3(B.arid.grass.colours.dry), dry), dry);
});
/** the grass's colour at p, read from the baked land noise (tex: src/materials/bake.js) */
export const grassTint = (tex, p, ar, level = null) => {
  const pr = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6)));
  const rd = (q) => (level === null ? tex.a('noise', q) : tex.a('noise', q).level(level));
  return grassTintAB(clamp(rd(p.mul(1 / 150)).r.add(rd(pr.mul(1 / 397)).a).sub(1).mul(0.8).add(0.5), 0, 1), rd(pr.mul(1 / 45)).g, ar);
};
