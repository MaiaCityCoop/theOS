// Denim, a three-over-one twill: the warp dyed indigo, the weft left ecru, so the cloth is blue on its face with the
// pale weft peeping between; the diagonal wale running up to the left; worn and faded in soft patches. Worn along a
// body's own surface (characters/kit/human.js: trousers).
import { float, vec2, vec3, mix, smoothstep, floor, fract, sin, sqrt, max, mod, step } from 'three/tsl';
import { pn, pfbm, fibre } from '../src/materials/paint.js';

const N = 36;   // threads a tile each way (a tile spans 9 cm where it is worn: threads of 2.5 mm)
export default {
  uid: '5f430c04-8942-442c-ac6a-b5c958cc887a',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Denim twill',
  kind: 'cloth',
  about: 'Indigo over ecru in a diagonal twill, faded in soft patches.',
  usedBy: 'the trousers of the characters',
  swatch: [0.22, 0.3, 0.45],
  bump: 0.012,
  paint: (uv) => {
    const p = uv.mul(N), i = floor(p), f = fract(p), over = step(mod(i.x.add(i.y.mul(3)), 4), 2.5);   // the warp over three wefts, under one, a step on each row: the wale
    const slub = pn(vec2(p.x, uv.y.mul(4)), [N, 4], 21);
    const tw = float(0.56).add(slub.mul(0.08)), cw = smoothstep(tw, tw.mul(0.35), f.x.sub(0.5).abs()), cf = smoothstep(0.36, 0.1, f.y.sub(0.5).abs());   // (the warp packed close, as denim is: the weft only peeps between)
    const bendW = sin(f.y.mul(Math.PI)), bendF = sin(f.x.mul(Math.PI));
    const hw = sqrt(cw).mul(mix(float(0.5).add(bendW.mul(0.3)), float(0.9).add(bendW.mul(0.1)), over)), hf = sqrt(cf).mul(mix(float(0.75).add(bendF.mul(0.2)), float(0.4), over));
    const warpOnTop = step(hf, hw);
    // the indigo: ring-dyed, so a worn thread is paler at its crown; faded in patches
    const fade = smoothstep(0.45, 0.85, pfbm(uv, 2, 22, 3)), crown = smoothstep(0.7, 1, hw);
    const indigo = mix(vec3(0.11, 0.16, 0.31), vec3(0.3, 0.38, 0.55), fade.mul(0.7).add(crown.mul(0.35)).add(pn(vec2(p.x, uv.y.mul(3)), [N, 3], 23).mul(0.15)));
    const ecru = vec3(0.72, 0.7, 0.64).mul(float(0.85).add(pn(p.yx, N, 24).mul(0.15)));
    const h0 = max(hw, hf), fuzz = fibre(uv.mul(vec2(250, 80)), [250, 80], 25).mul(0.12);
    const col = mix(mix(ecru.mul(0.8), indigo, warpOnTop.max(0.25)), indigo.mul(0.35), smoothstep(0.35, 0.02, h0)).add(fuzz.mul(0.04));   // (even the weft that shows is half hidden by blue fibres)
    return { h: h0.mul(0.9).add(fuzz.mul(0.1)), col, rough: float(0.9).sub(crown.mul(0.08)) };
  },
};
