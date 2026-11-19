// The river's water (node code): on the terrain's grid (the nodes near the river only), its surface flat at the valley's
// floor less the drop; running along the river's flow, two takes half a cycle apart cross-faded, so it runs and never
// stretches. Its look is the light's, by water's own optics (src/world/physics.js), not a colour of its own:
//   - what meets its surface is reflected as Fresnel's equations say for water's index of refraction (unpolarized), the
//     rest goes into it; what it reflects is the sky along the reflected way (src/world/sky/dome.js skyAlong), and the
//     sun's glint (still its own lobe);
//   - what is seen through it is its bed, as the picture already has it under the water (drawn before it), less what the
//     water takes away along the light's way down to the bed and the eye's way back (Beer–Lambert, a number a colour),
//     and the light the water itself scatters back towards the eye over that way. Two draws of the one surface, so
//     nothing of the picture is read or copied: the first keeps of what is drawn under it what the water leaves of each
//     colour (the picture times it), the second adds what the water gives (what it reflects, what it scatters back, the
//     air before it);
//   - how much it takes away of each colour follows from its own colour (the river's `colours.deep`: what an endless
//     depth of it shows, its reflectance under the surface) by Morel's R = f · b_b / a, its backscattering b_b one
//     number, fixed by pure water's own absorption of red light (WATER_RED_ABSORPTION), which is most of a water's;
//   - the light into it is the one light's on a level surface there (src/world/light.js lightOn), less what the surface
//     reflects of it;
//   - what it reflects of the world (the banks, the trees, all that stands over it) is the last frame's picture where
//     the reflected ray meets what that frame drew (its depth and its kept colour, the screen's own: src/core/screen.js,
//     src/core/temporal.js; a frame late, which does not show on water), marched on that frame's screen; where it meets
//     nothing there, the sky along it.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, varying, attribute, abs, max, min, clamp, mix, smoothstep, length, normalize, pow, fract, sqrt, exp, refract, reflect, If, Discard, Loop, Break, int, ivec2, uniform, texture, screenCoordinate, cameraProjectionMatrix, cameraFar, ceil, log2 } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { riverInfo, riverRaw, riverCarve, riverBank, baseB, WATER_DROP_N, lakeAt } from '../world/land.nodes.js';
import { toScreen, airOf, lightOn, sunAt, windDir, windStrength } from '../world/light.js';
import { skyAlong } from '../world/sky/dome.js';
import { blueAt } from '../world/light/noise.js';
import { gridPoint, GRID } from './material.js';
import { WATER } from '../world/biomes.js';
import { WATER_IOR, WATER_RED_ABSORPTION, WATER_REFLECTANCE_F } from '../world/physics.js';
import { FRAME_MS_BY_CLASS } from '../core/budget.js';
import { ownGpuMs, pace } from '../core/pace.js';

const water = WATER;

/** What a water surface reflects of light meeting it at cos θ = c from the air (Fresnel's equations, unpolarized; n its
    index of refraction): numbers in JS, nodes in node code. */
const reflectsJS = (c, n) => { const t = Math.sqrt(Math.max(0, 1 - (1 - c * c) / (n * n))), s = (c - n * t) / (c + n * t), p = (t - n * c) / (t + n * c); return (s * s + p * p) / 2; };
const reflects = (c, n) => { const t = sqrt(max(float(1).sub(float(1).sub(c.mul(c)).div(n * n)), 0)), s = c.sub(t.mul(n)).div(c.add(t.mul(n))), p = t.sub(c.mul(n)).div(t.add(c.mul(n))); return s.mul(s).add(p.mul(p)).mul(0.5); };
/** What it reflects of the sky's light, which comes from every way over it (cosine-weighted over the half-sphere). */
const SKY_REFLECTED = (() => { let r = 0; const N = 256; for (let i = 0; i < N; i++) { const th = ((i + 0.5) / N) * (Math.PI / 2); r += reflectsJS(Math.cos(th), WATER_IOR) * 2 * Math.cos(th) * Math.sin(th) * (Math.PI / 2 / N); } return r; })();
/** What the water takes away of each colour along a metre of it (m⁻¹): from its own colour, R∞ (what an endless depth of
    it shows), by Morel's R∞ = f · b_b / a; b_b one number for all colours, fixed by pure water's absorption of red. */
const R_INF = water.colours.deep, BB = (WATER_RED_ABSORPTION * R_INF[0]) / WATER_REFLECTANCE_F, ABSORB = R_INF.map((r) => (WATER_REFLECTANCE_F * BB) / r);

/** The water's two materials, drawn one after the other over the same surface (src/terrain/terrain.js): [what it keeps
    of what is under it, what it gives]. */
// ---- what it reflects of the world: the last frame's picture, by that frame's depth ----
// (built: how many frames a screen pixel is built from at the most, and one: src/core/temporal.js K.most. A ray marched
// a sample every that many dial pixels, from a start of its own each frame (the blue noise), has every dial pixel of it
// looked at within the frames a pixel is built from)
// (steps: how many samples a pixel's march takes at the most this frame: PACE's)
const WAS = { depth: texture(new THREE.DepthTexture(1, 1)), colour: texture(new THREE.Texture()), size: uniform(new THREE.Vector2(1, 1)), on: uniform(0), built: uniform(1), steps: uniform(1) };
// how many samples a march takes at the most: held to what the water's own draw takes on the GPU, within the light's share
// of the frame (src/core/budget.js FRAME_MS_BY_CLASS; its time measured each frame, src/core/pace.js), so it never costs
// more than that on any GPU; from one
const PACE = pace();
/** The water drawn (src/core/screen.js apart: render() draws it), its own time on the GPU taken, the march's most samples
    following it. */
export function waterDrawn(renderer, render) {
  PACE.tick(); WAS.steps.value = PACE.n;
  ownGpuMs(renderer, render)?.then((ms) => PACE.measured(PACE.n, ms, FRAME_MS_BY_CLASS.light)).catch(() => {});
}
/** Each frame after the prepass (src/boot.js): the frame before's depth (src/core/screen.js afterPrepass: depthWas), its
    kept picture (src/core/temporal.js history: null after a cut or a new size), which the water reflects the world from,
    and how many frames the picture is built from at the most (temporal's K.most). */
export function waterReads({ depthWas, w, h }, history, most) {
  const ok = !!(depthWas && history && depthWas.image.width === w && depthWas.image.height === h);
  WAS.on.value = ok ? 1 : 0; WAS.built.value = most + 1;
  if (ok) { WAS.depth.value = depthWas; WAS.colour.value = history; WAS.size.value.set(w, h); }
}
/** What the world shows along the ray from w (the way R), as the last frame drew it: { c: its colour (the light's numbers,
    the air before w taken off), hit: 1 where the ray meets what that frame drew, else 0 }. The ray from w to the far
    plane, through that frame's camera (U.uWas), cut where it leaves its picture; marched along it on the picture, evenly,
    a sample every `built` dial pixels from this pixel's own start (blueAt), never more samples than the frame's pace
    allows (WAS.steps: then as many, further apart); a surface as thick as one step (its distance's change over it); the
    first met, bisected down to a dial pixel. */
const worldAlong = (w, R) => {
  const out = { c: vec3(0).toVar(), hit: float(0).toVar() };
  If(WAS.on.greaterThan(0.5), () => {
    const c0 = U.uWas.mul(vec4(w, 1)).toVar(), c1 = U.uWas.mul(vec4(w.add(R.mul(cameraFar)), 1)).toVar(), s = float(1).toVar();
    // (cut where it leaves the picture, or comes nearer than the eye: each side's plane in clip space, the ray's ends on it
    // linear in its length)
    for (const g of [(c) => c.w.sub(c.x), (c) => c.w.add(c.x), (c) => c.w.sub(c.y), (c) => c.w.add(c.y), (c) => c.w.sub(1e-3)]) {
      const g0 = g(c0), g1 = g(c1);
      If(g1.lessThan(0).and(g0.greaterThan(0)), () => { s.assign(min(s, g0.div(g0.sub(g1)))); });
    }
    const e = mix(c0, c1, s), size = WAS.size, pA = c0.xy.div(c0.w).mul(vec2(0.5, -0.5)).add(0.5).mul(size), pB = e.xy.div(e.w).mul(vec2(0.5, -0.5)).add(0.5).mul(size);
    const len = length(pB.sub(pA)), n = int(min(ceil(len.div(U.uErrorPx.mul(WAS.built))), WAS.steps)).toVar(), iA = float(1).div(c0.w), iB = float(1).div(e.w);
    // (along the picture the distance's inverse runs straight; the scene's distance from that frame's depth: the projection's
    // own two numbers, the same but for its shift)
    const at = (f) => ({ p: mix(pA, pB, f), d: float(1).div(mix(iA, iB, f)) });
    const scene = (p) => cameraProjectionMatrix.element(3).z.div(float(WAS.depth.load(ivec2(clamp(p, vec2(0), size.sub(1))))).add(cameraProjectionMatrix.element(2).z));
    const j = blueAt(screenCoordinate.xy).x, was = float(0).toVar();   // (its texel's first number)
    Loop({ start: int(0), end: n, type: 'int', condition: '<' }, ({ i }) => {
      const f = float(i).add(j).div(float(n)), A = at(f), thick = A.d.sub(at(was).d).abs().add(1e-3), d = A.d.sub(scene(A.p));
      If(d.greaterThanEqual(0).and(d.lessThan(thick)), () => {
        // (bisected between the last sample and this one, down to a dial pixel)
        const lo = was.toVar(), hi = f.toVar();
        Loop({ start: int(0), end: int(ceil(log2(max(len.div(float(n)).div(U.uErrorPx), 1)))), type: 'int', condition: '<' }, () => {
          const m = lo.add(hi).mul(0.5), M = at(m);
          If(M.d.greaterThanEqual(scene(M.p)), () => { hi.assign(m); }).Else(() => { lo.assign(m); });
        });
        const h = WAS.colour.sample(at(hi).p.div(size)).rgb, P = h.mul(h), c = P.div(float(1).sub(min(max(P.x, max(P.y, P.z)), 0.999)));
        const air = airOf(w); out.c.assign(c.sub(air.col.mul(float(1).sub(air.k))).div(max(air.k, 1e-3))); out.hit.assign(1);
        Break();
      });
      was.assign(f);
    });
  });
  return out;
};

export function waterMaterials(tex) {
  const wp = gridPoint();
  const I = riverInfo(wp);   // (signed distance, half-width, bank side)
  const world = vec3(wp.x, baseB(wp).sub(WATER_DROP_N), wp.y);
  const vWorld = varying(world), vI = varying(I), vG = varying(riverRaw(wp).yz), vLake = varying(lakeAt(wp));   // (in a lake the water stands)   // the river's field's gradient: the flow is along it, turned a quarter

  const frag = (gives) => Fn(() => {
    const d = abs(vI.x), w = vI.y, b = vI.z;
    If(d.greaterThan(w.mul(1.5)), () => { Discard(); });
    const p = vWorld.xz;
    const depth = max(riverCarve(d, w, b).sub(riverBank(d, w, b)).sub(WATER_DROP_N), 0).toVar();   // (metres of water over its bed)
    const fl = normalize(vec2(vG.y.negate(), vG.x).add(1e-9));
    const mid = clamp(float(1).sub(d.div(w)), 0, 1), speed = sqrt(mid).mul(0.9).add(0.25).mul(float(1).sub(vLake.mul(0.92)));   // (a lake's water stands: only the wind moves it)
    const t = U.uTime.mul(0.3), f1 = fract(t), f2 = fract(t.add(0.5)), wb = abs(f1.mul(2).sub(1));
    // the surface runs with the river, and the wind drags it its own way: the harder it blows, the more its ripples go with the wind
    const drift = fl.mul(speed).add(windDir.mul(windStrength.mul(0.9)));
    const o1 = drift.mul(f1.sub(0.5)).mul(3.3), o2 = drift.mul(f2.sub(0.5)).mul(3.3);
    const uA = p.sub(o1).div(water.floor.tile), uB = p.sub(o2).div(water.floor.tile).add(0.43);
    const nA = tex.n(water.floor.material, uA).xy.add(tex.n(water.floor.material, uA.mul(3.1).add(0.2)).xy).sub(1), nB = tex.n(water.floor.material, uB).xy.add(tex.n(water.floor.material, uB.mul(3.1).add(0.6)).xy).sub(1);
    const nn = mix(nA, nB, wb), rough = mid.mul(0.3).add(0.16).add(windStrength.mul(windStrength).mul(0.55));   // the wind roughens it: a storm breaks the reflections up
    const n = normalize(vec3(nn.x.mul(rough), 1, nn.y.mul(rough))).toVar();
    const V = normalize(U.uCam.sub(vWorld)).toVar(), up = vec3(0, 1, 0);

    // ---- at the surface: what it reflects (Fresnel's, from water's index of refraction) ----
    const F = reflects(max(n.dot(V), 1e-3), WATER_IOR).toVar();
    const R = reflect(V.negate(), n), sky = skyAlong(normalize(vec3(R.x, abs(R.y), R.z)));   // (a ray a wave turns down is the sky's, as it is turned back up off the next)
    const sunC = U.uSun.mul(sunAt(vWorld));
    const H = normalize(V.add(U.uSunDir)), wd = length(U.uCam.sub(vWorld));
    const spec = pow(max(n.dot(H), 0), 350).mul(2.5).add(pow(max(n.dot(H), 0), 30).mul(0.22).mul(smoothstep(40, 300, wd)));

    // ---- under it: the bed as the picture has it, through the water ----
    // the light's way down to the bed (the sun's, refracted) and the eye's way back up (the refracted view's): what the
    // water leaves of each colour of the bed
    const r = refract(V.negate(), n, 1 / WATER_IOR), sunIn = refract(U.uSunDir.negate(), up, 1 / WATER_IOR);
    const way = depth.div(max(r.y.negate(), 1e-3)).add(depth.div(max(sunIn.y.negate(), 0.05)));
    const left = exp(vec3(...ABSORB).mul(way).negate());
    const ftex = mix(tex.a(water.floor.material, uA.mul(2)).r, tex.a(water.floor.material, uB.mul(2)).r, wb);
    const foam = float(1).sub(smoothstep(0, 0.04, depth)).mul(smoothstep(0.3, 0.7, ftex)).mul(0.35);   // a thin lace where it runs shallow over the bank, nothing on open water
    // (its edge: where the bed comes up out of it, the bank as drawn: neither draw changes it)
    const edge = smoothstep(-0.04, 0.02, riverCarve(d, w, b).sub(riverBank(d, w, b)).sub(WATER_DROP_N));
    // what of the picture under it stays: the bed through the surface and the water (the air before the bed, which the
    // picture has, kept as much: given back by the second draw)
    const keeps = mix(vec3(1), left.mul(float(1).sub(F)).mul(float(1).sub(foam)), edge).toVar();
    if (!gives) return vec4(keeps, 1);
    // what it gives: the light into the water (the one light's on a level surface there, less what the surface reflects
    // of it) as much as the water scatters back over that way (its reflectance R∞, as much as the way lets build up);
    // what it reflects; its foam; all through the air before it, and the air's own light where the picture's is kept less
    const Lin = lightOn({ n: up, w: vWorld, V }), into = Lin.sky.mul(1 - SKY_REFLECTED).add(Lin.sun.mul(float(1).sub(reflects(max(U.uSunDir.y, 1e-3), WATER_IOR))));
    const world = worldAlong(vWorld, R), seen = mix(sky, max(world.c, vec3(0)), world.hit);   // (what the world shows along it; where nothing, the sky)
    const own = vec3(...R_INF).mul(into).mul(float(1).sub(left)).mul(float(1).sub(F)).add(seen.mul(F)).add(sunC.mul(spec));
    const surface = mix(own, vec3(0.8).mul(Lin.sky.add(Lin.sun)), foam), A = airOf(vWorld);
    return toScreen(surface.mul(A.k).mul(edge).add(A.col.mul(float(1).sub(A.k)).mul(float(1).sub(keeps))));
  });

  // far off, a grid cell is wider than the river: the ground between its corners stands over the water in blocks. So the
  // surface is drawn pulled towards the eye by up to half a cell (none near by), and wins; its outline is the river's own
  // distance, smooth across the cell (the fragment's discard), not the ground's corners
  const cell = attribute('aNode', 'vec4').z.div(GRID), toEye = U.uCam.sub(world);
  const lift = smoothstep(4, 24, cell).mul(min(cell.mul(0.5), length(toEye).mul(0.04)));
  // the first draw multiplies what is drawn by what it keeps; the second adds what it gives (alpha as it was)
  const blends = [{ blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor }, { blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }];
  return blends.map((B, i) => {
    const m = new THREE.NodeMaterial();
    m.positionNode = world.add(normalize(toEye).mul(lift)); m.fragmentNode = frag(i === 1)();
    Object.assign(m, { transparent: true, depthWrite: false, blending: THREE.CustomBlending, ...B, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;   // far off the depth buffer cannot tell water from its bed: the water wins
    return m;
  });
}
