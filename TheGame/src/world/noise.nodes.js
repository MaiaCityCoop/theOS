// The land's noises on the GPU (node code): what the land's functions (land.nodes.js) and the biomes' rules
// (biomes/*.js: where) are built from. No world in here, so any recipe may use it.
import { Fn, float, int, uint, vec2, vec3, floor, sqrt, smoothstep } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { hashI } from '../core/hash.js';
export { hashI };

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
/** a ragged edge: -1.5..1.5, for a mask's border not to run smooth */
export const edgeJit = Fn(([p]) => vnoise(p.mul(1 / 6), uint(44)).sub(0.5).mul(2).add(vnoise(p.mul(1 / 1.7), uint(45)).sub(0.5)));

// ---- a stand of trees (a biome's `trees`: { clumps, patches, seed }): its noises, asked by everything that must agree on
// where its trees stand: their cells (src/scatter/trees.js), the land's far canopy, its floor's shade and litter
// (src/terrain/material.js), a biome's own grass (biomes/pineforest.js) ----
/** How thick the stand grows at p, 0..1.6: its groves and glades (a noise as wide as its `clumps`, moved by its seed). */
export const groveAt = (p, T) => {
  const K = (T?.seed ?? 300) - 300;
  return T?.clumps ? smoothstep(0.22, 0.72, vnoise(p.div(T.clumps), uint(308 + K)).mul(0.7).add(vnoise(p.div(T.clumps * 0.27), uint(310 + K)).mul(0.3))).mul(1.6) : float(1);
};
/** Which kind of tree leads at p, 0..1 (a slow noise `patches` metres across; a kind leads where it falls in its slice). */
export const leadAt = (p, T) => (T?.patches ? smoothstep(0.25, 0.75, vnoise(p.div(T.patches), uint(322 + (T.seed ?? 300) - 300))) : float(0.5));
