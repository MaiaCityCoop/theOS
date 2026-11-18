// Linen, plain woven: undyed homespun, each thread over one and under the next, the threads uneven (slubs, thicker
// here, thinner there), a little fuzz of loose fibres over it. Worn along a body's own surface (characters/kit/human.js:
// a shirt), dyed there by the garment's colour; its own colour is the cloth undyed.
import { float, vec2, vec3, mix, smoothstep, floor, fract, sin, sqrt, max, mod } from 'three/tsl';
import { pn, pfbm, fibre } from '../src/materials/paint.js';

const N = 28;   // threads a tile each way (a tile spans 11 cm where it is worn: threads of 4 mm, a coarse homespun)
export default {
  uid: '3cb68f1f-a92d-4adf-bb8e-838abf352389',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Linen weave',
  kind: 'cloth',
  about: 'Undyed homespun linen in a plain weave, slubbed and fuzzy.',
  usedBy: 'the shirts of the characters',
  swatch: [0.74, 0.7, 0.62],
  bump: 0.012,
  paint: (uv) => {
    const p = uv.mul(N), i = floor(p), f = fract(p), over = mod(i.x.add(i.y), 2);   // over: the warp lies on top in this cell
    // each thread's thickness along it: slubs (the warp's along v, the weft's along u)
    const slubW = pn(vec2(p.x.mul(1), uv.y.mul(5)), [N, 5], 11), slubF = pn(vec2(uv.x.mul(5), p.y), [5, N], 12);
    const tw = float(0.36).add(slubW.mul(0.16)), tf = float(0.36).add(slubF.mul(0.16));   // half a thread's width, in its cell
    const cw = smoothstep(tw, tw.mul(0.35), f.x.sub(0.5).abs()), cf = smoothstep(tf, tf.mul(0.35), f.y.sub(0.5).abs());   // across each thread: its round
    const bendW = sin(f.y.mul(Math.PI)), bendF = sin(f.x.mul(Math.PI));   // along each: up over the crossing, down under the next
    const hw = sqrt(cw).mul(mix(float(1).sub(bendW.mul(0.45)), float(0.55).add(bendW.mul(0.45)), over));
    const hf = sqrt(cf).mul(mix(float(0.55).add(bendF.mul(0.45)), float(1).sub(bendF.mul(0.45)), over));
    const h0 = max(hw, hf), fuzz = fibre(uv.mul(vec2(220, 60)), [220, 60], 13).mul(0.18).add(fibre(uv.mul(vec2(70, 230)), [70, 230], 14).mul(0.14));
    const tone = pfbm(uv, 3, 15, 3), streak = pn(vec2(p.x, uv.y.mul(2)), [N, 2], 16);   // the dye-lot's unevenness, a thread a shade off
    const base = mix(vec3(0.66, 0.62, 0.54), vec3(0.8, 0.77, 0.7), tone.mul(0.6).add(streak.mul(0.4)));
    const col = mix(base.mul(0.42), base, smoothstep(0.05, 0.75, h0)).add(fuzz.mul(0.05));   // dark in the gaps between threads
    return { h: h0.mul(0.85).add(fuzz.mul(0.15)), col, rough: float(0.93).sub(h0.mul(0.06)) };
  },
};
