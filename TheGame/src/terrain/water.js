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
//     reflects of it.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, varying, attribute, abs, max, min, clamp, mix, smoothstep, length, normalize, pow, fract, sqrt, exp, refract, reflect, If, Discard } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { riverInfo, riverRaw, riverCarve, riverBank, baseB, WATER_DROP_N, lakeAt } from '../world/land.nodes.js';
import { toScreen, airOf, lightOn, sunAt, windDir, windStrength } from '../world/light.js';
import { skyAlong } from '../world/sky/dome.js';
import { gridPoint, GRID } from './material.js';
import { WATER } from '../world/biomes.js';
import { WATER_IOR, WATER_RED_ABSORPTION, WATER_REFLECTANCE_F } from '../world/physics.js';

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
    const own = vec3(...R_INF).mul(into).mul(float(1).sub(left)).mul(float(1).sub(F)).add(sky.mul(F)).add(sunC.mul(spec));
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
