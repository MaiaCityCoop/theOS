// The painter's noises (TSL): what every material (materials/*.js) paints its tile with. All of them tile: a noise of
// period `per` repeats exactly across the tile's edges, so a baked material repeats without a seam.
//
//   pn(p, per, seed)            smooth value noise, 0..1
//   pfbm(uv, per, seed, oct)    its octaves, 0..1
//   pvor(p, per, seed)          cells: (distance to the nearest point, to the second, the nearest cell's hash)
//   fibre(q, per, seed)         thin strands
//   pridge(uv, per, seed, oct)  ridged octaves (sharp crests), 0..1
//   warp(uv, per, seed, amt)    a tiling push, to bend what is painted with it (± amt/2 in the noise's own cells)
//   cracks(uv, per, seed, amt)  cells bent by a warp: (the edge's closeness: 0 on the crack, the cell's hash)
//   pebbles(uv, per, seed, share, wob)  domes, bent out of round by wob: (height, the pebble's hash, the ground's
//                               shade round it: 1 where it touches)
//   ovalLeaf(uv, mid, ax, len, wide, there)  a leaf of a foliage card's grid of cells, a pointed oval: (along it, across
//                               it, how much of uv it covers)
//   each(list, numbersOf, body, name)  a painting's elements (a card's leaves, its shoots), one loop over their numbers
//   nine(body, name)            the nine cells round a point, one loop
//   twigsAt(uv, foot, twigs, bow)  a foliage card's fan of twigs under its leaves: how much of uv they cover
// p, q are vec2 nodes; per a number or [x, y]; seed a whole number.
import { Vector4 } from 'three/webgpu';
import { Fn, Loop, float, int, uint, vec2, vec3, vec4, floor, fract, length, smoothstep, clamp, sqrt, abs, max, pow, sin, If, uniformArray } from 'three/tsl';
import { hashI } from '../core/hash.nodes.js';

const per2 = (per) => (Array.isArray(per) ? vec2(per[0], per[1]) : vec2(per, per));
/** A seed s and k more: a number's, as it was; a node's (a painting's element's own: each), on the GPU. */
const plus = (s, k) => (typeof s === 'number' ? s + k : s.add(k));
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
  for (let i = 0; i < oct; i++) { v = v.add(pn(uv.mul(P), P, plus(s, i)).mul(a)); n += a; P *= 2; a *= 0.5; }
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

export function pridge(uv, per, s, oct) {
  let a = 0.5, v = float(0), n = 0, P = per, w = float(1);
  for (let i = 0; i < oct; i++) { const r = float(1).sub(pn(uv.mul(P), P, plus(s, i)).mul(2).sub(1).abs()), k = r.mul(r).mul(w); v = v.add(k.mul(a)); w = clamp(k.mul(1.6), 0.25, 1); n += a; P *= 2; a *= 0.5; }
  return v.div(n);
}

export const warp = (uv, per, s, amt) => vec2(pn(uv.mul(per), per, s), pn(uv.mul(per), per, plus(s, 1))).sub(0.5).mul(amt);

export function cracks(uv, per, s, amt) {
  const v = pvor(uv.mul(per).add(warp(uv, per, plus(s, 40), amt)), per, s);
  return vec2(v.y.sub(v.x), v.z);
}

export function pebbles(uv, per, s, share, wob = 0) {
  const q = wob ? uv.mul(per).add(warp(uv, per * 2, plus(s, 50), wob)) : uv.mul(per);
  const v = pvor(q, per, s), r = v.z.lessThan(share).select(fract(v.z.mul(37)).mul(0.25).add(0.22), float(0));
  const t = clamp(float(1).sub(v.x.div(r.max(1e-4))), 0, 1);
  const shade = r.greaterThan(0).select(smoothstep(r.mul(1.7), r.mul(0.9), v.x), float(0));
  return vec3(r.greaterThan(0).select(sqrt(t.mul(float(2).sub(t))), float(0)), v.z, shade);
}
/** A leaf of a foliage card (its leaves a grid of cells, a leaf to a cell: materials/holmoakleaf.js), at uv: a pointed
    oval, rounder at its foot, `len` long along `ax` and `wide` across at its widest, its middle at `mid`, there as much
    as `there` says: { u (along it, 0 … 1 from its foot), w (across it), leaf (how much of uv it covers) }. */
export const ovalLeaf = (uv, mid, ax, len, wide, there) => {
  const e = uv.sub(mid.sub(ax.mul(len.mul(0.5)))), u = e.dot(ax).div(len).toVar(), w = e.dot(vec2(ax.y, ax.x.negate())).toVar();
  const half = pow(sin(pow(clamp(u, 0, 1), 0.8).mul(Math.PI)), 0.85).mul(wide);
  return { u, w, leaf: float(1).sub(smoothstep(half.mul(0.7), half, abs(w))).mul(smoothstep(0, 0.05, u)).mul(float(1).sub(smoothstep(0.96, 1, u))).mul(there).toVar() };
};

/** Each of a painting's elements (list: plain objects, in their order: each painted over those before it), painted by
    body(E): E its numbers as nodes, numbersOf(x, k)'s (k: its place in the list; by name: a number, or an array of 2 to
    4 of them: a vec2 … vec4),
    read from one table of uniforms in one loop. Until 2026-11-19 every element was code of its own, its numbers written
    in (a card's leaves: some 1.2 KB of code a leaf, 126 KB the mastic's card, its program the slowest of the start to
    compile): what an element works out from its own numbers is worked out here, so the GPU is handed the numbers it
    was. name: the loop's own (a loop it runs in has another). Node code, in a Fn. */
export function each(list, numbersOf, body, name = 'e') {
  if (!list.length) return;
  const keys = Object.entries(numbersOf(list[0], 0)).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1]), width = keys.reduce((t, [, n]) => t + n, 0), rows = Math.ceil(width / 4), data = [];
  for (const [k, x] of list.entries()) {
    const N = numbersOf(x, k), flat = keys.flatMap(([k, n]) => (n === 1 ? [N[k]] : N[k]));
    for (let r = 0; r < rows; r++) data.push(new Vector4(flat[4 * r] ?? 0, flat[4 * r + 1] ?? 0, flat[4 * r + 2] ?? 0, flat[4 * r + 3] ?? 0));
  }
  const T = uniformArray(data, 'vec4'), make = [float, float, vec2, vec3, vec4];
  Loop({ start: int(0), end: int(list.length), type: 'int', condition: '<', name }, (it) => {
    const at = it[name].mul(rows).toVar(), R = Array.from({ length: rows }, (_, r) => T.element(at.add(r)).toVar()), E = {};
    let j = 0;
    for (const [k, n] of keys) { const c = Array.from({ length: n }, (_, m) => R[(j + m) >> 2]['xyzw'[(j + m) & 3]]); E[k] = n === 1 ? c[0] : make[n](...c); j += n; }
    body(E);
  });
}
/** The nine cells round a point's own, body(o) for each (o: its offset, a vec2 of -1 … 1 each way), a row at a time, the
    row below first and each left to right (what is painted later lies over), in one loop: they were nine copies of a
    cell's code. name: the loop's own. Node code, in a Fn. */
export const nine = (body, name = 'n') => Loop({ start: int(0), end: int(9), type: 'int', condition: '<', name }, (it) => body(vec2(float(it[name].mod(3).sub(1)), float(it[name].div(3).sub(1)))));
/** A foliage card's fan of twigs from its foot (twigs: [its angle from upright, its length] each, each bowing outward by
    bow), under its leaves: how much of uv they cover (a var), one loop over them (materials/holmoakleaf.js, rockroseleaf.js:
    the holm oak's sprig and the rockrose's, one fan). Node code, in a Fn. */
export const twigsAt = (uv, foot, twigs, bow) => {
  const twig = float(0).toVar();
  each(twigs, ([ang, L]) => ({ dir: [Math.sin(ang), Math.cos(ang)], perp: [Math.cos(ang), -Math.sin(ang)], bow: bow * Math.sign(ang || 1), end: L * 0.95, L }), (T) => {
    const d = uv.sub(foot), along = d.dot(T.dir), off = d.dot(T.perp).sub(along.mul(along).mul(T.bow));   // the twig, bowing outward
    twig.assign(max(twig, float(1).sub(smoothstep(0.003, 0.007, abs(off))).mul(smoothstep(0, 0.02, along)).mul(float(1).sub(smoothstep(T.end, T.L, along)))));
  }, 't');
  return twig;
};
