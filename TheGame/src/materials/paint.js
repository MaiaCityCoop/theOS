// The painter's noises (TSL): what every material (materials/*.js) paints its tile with. All of them tile: a noise of
// period `per` repeats exactly across the tile's edges, so a baked material repeats without a seam.
//
//   pn(p, per, seed)            smooth value noise, 0..1
//   pfbm(uv, per, seed, oct)    its octaves, 0..1
//   pvor(p, per, seed)          cells: (distance to the nearest point, to the second, the nearest cell's hash)
//   fibre(q, per, seed)         thin strands
//   pebbles(uv, per, seed, share)  domes of one size: (height, the pebble's hash)
// p, q are vec2 nodes; per a number or [x, y]; seed a whole number.
import { Fn, float, int, uint, vec2, vec3, floor, fract, length, smoothstep, clamp, sqrt, If } from 'three/tsl';
import { hashI } from '../world/land.nodes.js';

const per2 = (per) => (Array.isArray(per) ? vec2(per[0], per[1]) : vec2(per, per));
const h1 = Fn(([c, per, s]) => { const w = c.sub(per.mul(floor(c.div(per)))); return float(hashI(int(w.x), int(w.y), s).shiftRight(uint(8))).mul(1 / 16777216); })
  .setLayout({ name: 'pHash', type: 'float', inputs: [{ name: 'c', type: 'vec2' }, { name: 'per', type: 'vec2' }, { name: 's', type: 'uint' }] });

const pnF = Fn(([p, per, s]) => {
  const i = floor(p), f = p.sub(i), u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const a = h1(i, per, s), b = h1(i.add(vec2(1, 0)), per, s), c = h1(i.add(vec2(0, 1)), per, s), d = h1(i.add(vec2(1, 1)), per, s);
  return a.add(b.sub(a).mul(u.x)).add(c.sub(a).add(d.sub(c).sub(b.sub(a)).mul(u.x)).mul(u.y));
}).setLayout({ name: 'pNoise', type: 'float', inputs: [{ name: 'p', type: 'vec2' }, { name: 'per', type: 'vec2' }, { name: 's', type: 'uint' }] });
export const pn = (p, per, s) => pnF(p, per2(per), uint(s));

export function pfbm(uv, per, s, oct) {
  let a = 0.5, v = float(0), n = 0, P = per;
  for (let i = 0; i < oct; i++) { v = v.add(pn(uv.mul(P), P, s + i).mul(a)); n += a; P *= 2; a *= 0.5; }
  return v.div(n);
}

const pvorF = Fn(([p, per, s]) => {
  const i = floor(p), f = p.sub(i), d1 = float(9).toVar(), d2 = float(9).toVar(), id = float(0).toVar();
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const c = i.add(vec2(x, y)), d = length(vec2(x, y).add(vec2(h1(c, per, s), h1(c, per, s.add(uint(77))))).sub(f));
    If(d.lessThan(d1), () => { d2.assign(d1); d1.assign(d); id.assign(h1(c, per, s.add(uint(13)))); }).ElseIf(d.lessThan(d2), () => { d2.assign(d); });
  }
  return vec3(d1, d2, id);
}).setLayout({ name: 'pVoronoi', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }, { name: 'per', type: 'vec2' }, { name: 's', type: 'uint' }] });
export const pvor = (p, per, s) => pvorF(p, per2(per), uint(s));

export const fibre = (q, per, s) => smoothstep(0.66, 0.84, pn(q, per, s));

export function pebbles(uv, per, s, share) {
  const v = pvor(uv.mul(per), per, s), r = v.z.lessThan(share).select(fract(v.z.mul(37)).mul(0.25).add(0.22), float(0));
  const t = clamp(float(1).sub(v.x.div(r.max(1e-4))), 0, 1);
  return vec2(r.greaterThan(0).select(sqrt(t.mul(float(2).sub(t))), float(0)), v.z);
}
