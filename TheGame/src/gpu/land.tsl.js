// The land in TSL (intent 0008, step 1): world/land.glsl.js's functions as node functions, constant for constant, so
// the WebGPU ground is the walker's ground. TSL writes WGSL for WebGPU and GLSL for its WebGL 2 fallback from these.
// Not here yet: the library's sandbox (the spike draws the world only).
import { Fn, float, int, uint, vec2, vec3, vec4, floor, fract, abs, max, min, clamp, mix, smoothstep, length, sqrt, atan, sin, cos, uniform, If } from 'three/tsl';
import { Vector3 } from 'three/webgpu';
import { OCT_LAM, OCT_AMP, WATER_DROP, PADS, PAD_FALL, BEND } from '../world/land.js';
import { BIOME } from '../../biomes/index.js';

export const L = {   // the land's uniforms: where the camera is, the lens's measure, the camera's height over the land
  cam: uniform(new Vector3()), dy: uniform(0), lodInv: uniform(1),
};

// ---- the hash and the noise (land.glsl.js: hashI, rnd, noised, vnoise) ----
const hashI = Fn(([cx, cy, s]) => {
  const h = uint(cx).mul(uint(0x9E3779B1)).bitXor(uint(cy).mul(uint(0x85EBCA77))).bitXor(uint(s).mul(uint(0xC2B2AE3D))).toVar();
  h.assign(h.bitXor(h.shiftRight(uint(15)))); h.assign(h.mul(uint(0x2C1B3C6D)));
  h.assign(h.bitXor(h.shiftRight(uint(12)))); h.assign(h.mul(uint(0x297A2D39)));
  h.assign(h.bitXor(h.shiftRight(uint(15))));
  return h;
});
export const rnd = Fn(([cx, cy, s]) => float(hashI(cx, cy, s).shiftRight(uint(8))).mul(1 / 16777216));

/** (value, d/dx, d/dy) of smooth value noise at p, seed s */
export const noised = Fn(([p, s]) => {
  const i = floor(p), f = p.sub(i), cx = int(i.x), cy = int(i.y);
  const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const du = f.mul(f).mul(30).mul(f.mul(f.sub(2)).add(1));
  const a = rnd(cx, cy, s), b = rnd(cx.add(1), cy, s), c = rnd(cx, cy.add(1), s), d = rnd(cx.add(1), cy.add(1), s);
  const k = a.sub(b).sub(c).add(d);
  return vec3(a.add(b.sub(a).mul(u.x)).add(c.sub(a).mul(u.y)).add(k.mul(u.x).mul(u.y)), du.mul(vec2(b.sub(a).add(k.mul(u.y)), c.sub(a).add(k.mul(u.x)))));
});
export const vnoise = Fn(([p, s]) => {
  const i = floor(p), f = p.sub(i), cx = int(i.x), cy = int(i.y);
  const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const a = rnd(cx, cy, s), b = rnd(cx.add(1), cy, s), c = rnd(cx, cy.add(1), s), d = rnd(cx.add(1), cy.add(1), s);
  return a.add(b.sub(a).mul(u.x)).add(c.sub(a).mul(u.y)).add(a.sub(b).sub(c).add(d).mul(u.x).mul(u.y));
});

export const camDist = Fn(([p]) => { const d = p.sub(L.cam.xz); return sqrt(d.dot(d).add(L.dy.mul(L.dy))).mul(L.lodInv); });

// ---- the river (riverWorld, riverInfo, riverCarve, riverBank) ----
const riverRaw = Fn(([p]) => {
  const n1 = noised(p.mul(1 / 1600), uint(40)), n2 = noised(p.mul(1 / 330).add(17.3), uint(41));
  return vec3(n1.x.sub(0.5).add(n2.x.sub(0.5).mul(0.28)), n1.yz.mul(1 / 1600).add(n2.yz.mul(0.28 / 330)));
});
/** (signed distance from the channel's middle, half-width, which bank, bend) */
export const riverInfo = Fn(([p]) => {
  const R = riverRaw(p), gl = max(length(R.yz), 2e-4), t = vec2(R.z.negate(), R.y).div(gl);
  const A = riverRaw(p.add(t.mul(20))), B = riverRaw(p.sub(t.mul(20)));
  const dt0 = atan(A.z, A.y).sub(atan(B.z, B.y)), dt = atan(sin(dt0), cos(dt0));
  const bend = clamp(dt.div(40).mul(BEND), -1, 1);
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
export const baseB = Fn(([p]) => vnoise(p.mul(1 / 2600), uint(11)).sub(0.5).mul(40).add(vnoise(p.mul(1 / 900).add(3.7), uint(12)).sub(0.5).mul(14)));

/** The ground's height at p: the land's octaves (each let go with distance), the river, and the pads under what stands */
export const heightAt = Fn(([p, dist, d, w, b]) => {
  const m = smoothstep(w, w.add(80), d), mm = mix(0.35, 1, m);
  const h = float(0).toVar(), q = vec2(p).toVar();
  for (let i = 0; i < 8; i++) {   // unrolled here: the octaves' sizes are known
    q.assign(vec2(q.x.mul(0.8).sub(q.y.mul(0.6)), q.x.mul(0.6).add(q.y.mul(0.8))));
    const lam = OCT_LAM[i];
    If(dist.lessThan(lam * 19.2), () => {
      const f = float(1).sub(smoothstep(lam * 9.6, lam * 19.2, dist));
      h.addAssign(vnoise(q.div(lam).add(i * 7.31), uint(20 + i)).sub(0.5).mul(OCT_AMP[i]).mul(f).mul(i >= 6 ? mm : m));
    });
  }
  const H = baseB(p).add(h).add(m.mul(3)).add(riverBank(d, w, b)).sub(riverCarve(d, w, b)).toVar();
  for (const P of PADS) H.assign(mix(float(P.h), H, smoothstep(P.r, P.r + PAD_FALL, length(p.sub(vec2(P.x, P.z))))));
  return H;
});

// ---- what grows where (aridMask, pathN, pathMask, bareMask, edgeJit, bank, cut and bar masks, tufts, outcrops) ----
export const aridMask = Fn(([p, dist]) => smoothstep(0.5, 0.66, vnoise(p.mul(1 / 700), uint(50)).add(vnoise(p.mul(1 / 150), uint(51)).sub(0.5).mul(0.3).mul(float(1).sub(smoothstep(3000, 8000, dist))))));
export const pathN = Fn(([p]) => { const n = noised(p.mul(1 / 260).add(5.1), uint(60)); return vec3(n.x, n.yz.mul(1 / 260)); });
export const pathMask = Fn(([P]) => float(1).sub(smoothstep(0.45, 0.95, abs(P.x.sub(0.5)).div(max(length(P.yz), 1e-3)))));
export const bareMask = Fn(([p]) => smoothstep(0.6, 0.7, vnoise(p.mul(1 / 8), uint(70)).mul(0.7).add(vnoise(p.mul(1 / 2.1).add(4.4), uint(71)).mul(0.3))));
export const edgeJit = Fn(([p]) => vnoise(p.mul(1 / 6), uint(44)).sub(0.5).mul(2).add(vnoise(p.mul(1 / 1.7), uint(45)).sub(0.5)));
export const bankMask = Fn(([p, d0, w, b]) => {
  const bar = max(b.negate(), 0), cut = max(b, 0), d = d0.add(edgeJit(p).mul(bar.mul(1.5).add(1.6))), e = w.mul(bar.mul(0.5).add(1.15));
  return float(1).sub(smoothstep(e, e.add(3).add(bar.mul(4)), d)).mul(float(1).sub(cut.mul(0.6)));
});
export const cutMask = Fn(([p, d0, w, b]) => { const d = d0.add(edgeJit(p.add(31)).mul(0.7)); return max(b, 0).mul(smoothstep(w.mul(0.85), w.mul(0.98), d)).mul(float(1).sub(smoothstep(w.add(1.4), w.add(3.4), d))); });
export const barMask = Fn(([p, d0, w, b]) => {
  const bar = max(b.negate(), 0), d = d0.add(edgeJit(p.add(57)).mul(1.4));
  return smoothstep(0.15, 0.6, bar).mul(smoothstep(w.mul(0.4), w.mul(0.85), d)).mul(float(1).sub(smoothstep(w.mul(bar.mul(0.35).add(0.95)), w.mul(bar.mul(0.5).add(1.2)), d))).mul(smoothstep(0.35, 0.65, vnoise(p.mul(1 / 9), uint(46)).add(0.25)));
});
export const tuftMask = Fn(([p]) => smoothstep(0.45, 0.7, vnoise(p.mul(1 / 28), uint(72))));
export const outcropMask = Fn(([p]) => smoothstep(0.6, 0.72, vnoise(p.mul(1 / 230), uint(74))));

// the grass's colour (grassTintAB), from the biomes' own numbers
const land = BIOME.meadow, arid = BIOME.dryland, v3 = (c) => vec3(c[0], c[1], c[2]);
export const grassTintAB = Fn(([a, b, ar]) => {
  const c0 = mix(v3(land.grass.colours.a), v3(land.grass.colours.b), smoothstep(0.1, 0.9, a.mul(0.65).add(b.mul(0.35))));
  const c = mix(vec3(c0.dot(vec3(0.3, 0.6, 0.1))), c0, land.grass.mute);
  const dry = clamp(ar.mul(0.9).add(smoothstep(0.6, 1, b.mul(0.6).add(a.mul(0.4))).mul(0.28)), 0, 1);
  return vec4(mix(c, v3(arid.grass.colours.dry), dry), dry);
});
export const WATER_DROP_N = float(WATER_DROP);
