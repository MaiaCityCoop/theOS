// The air (intent 0038, stage 9): Hillaire's sky and aerial perspective ("A Scalable and Production Ready Sky and
// Atmosphere Rendering Technique", EGSR 2020; as its MIT WebGPU port webgpu-sky-atmosphere lays out its tables), and a
// height fog in froxels with shafts of sun through the canopy (Ghost of Tsushima's, Patry 2021).
//
//   transmittance  256 x 64: how much of the light gets through the air from a height to the sky's top, by the angle
//                  (Bruneton's parametrisation). Once
//   multiple       32 x 32: the light scattered twice and more, as Hillaire folds it into one isotropic term (Ψms). Once
//   sky view       192 x 108: the sky's light by its angle from the sun and its height over the horizon, from the eye's
//                  height (more lines near the horizon). Every frame: the dome reads it (src/world/sky.js)
//   froxels        160 x 90 x 64: the eye's frustum in slices out to the land's end (exponential: 0.5 m to 24 km), each
//                  the light the air has gathered from the eye to it (rgb) and how much of what is behind comes through
//                  (a): the atmosphere (Rayleigh, Mie, ozone, at the height of the slice) and the height fog (thickest in
//                  the hollows, thinning by e every FOG_H metres up), lit by the sun through the air and, under the
//                  crowns, through the canopy map (src/world/light/canopy.js sunThrough: the shafts), and by the sky as
//                  the canopy's probes let it in. One compute pass, a thread a column marching its 64 slices; each
//                  slice's point dithered in depth by the blue noise, which the picture built over time averages
//
// Every material ends in its colour seen through the froxels (src/world/light.js finish: c × T + L). The numbers are the
// game's light: a surface lit by U.uSun shows albedo × U.uSun, so the air's light is the physical one × π × E (the sun's
// illuminance over the air, chosen so the sun on the ground at noon is the sky's own U.uSun).
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uvec3, uniform, texture, texture3D, textureStore, instanceIndex, screenCoordinate, Loop, If, exp, sqrt, max, min, clamp, mix, abs, normalize, length, log, pow, acos, cos, sin, sign, smoothstep, uint } from 'three/tsl';
import { U } from '../../core/uniforms.js';
import { lane } from '../weather/lanes.js';
import { blueAt } from './noise.js';
import { sunThrough, skyAt } from './canopy.js';
import { note, mark } from '../../core/gpu.js';

// ---- the air, in kilometres ----
const RG = 6360, RT = 6460, HH = Math.sqrt(RT * RT - RG * RG);   // the ground's and the air's top radius; the horizon's distance from the top
const RAY = vec3(5.802e-3, 13.558e-3, 33.1e-3), MIE = 3.996e-3, MIE_X = 4.4e-3, OZONE = vec3(0.65e-3, 1.881e-3, 0.085e-3), MIE_G = 0.8, ALBEDO = 0.3;
const E_SUN = 2.0;   // the sun's light over the air, in the game's numbers (on the ground at noon: about U.uSun's 1.75)
const GAIN = Math.PI * E_SUN;
// the height fog, in metres: its thickness at the reference (the ground under the eye), how fast it thins upwards
const FOG = 1 / 2600, FOG_H = 140, FOG_G = 0.55;
const FX = 160, FY = 90, FZ = 64, NEAR = 0.5, FAR = 24000;   // the froxels: columns, rows, slices; the first slice's start and the last's end (m)

const medium = (h) => {   // h: km over the ground
  const r = exp(h.negate().div(8)), m = exp(h.negate().div(1.2)), o = max(float(1).sub(abs(h.sub(25)).div(15)), 0);
  return { ray: RAY.mul(r), mie: float(MIE).mul(m), ext: RAY.mul(r).add(float(MIE_X).mul(m)).add(OZONE.mul(o)) };
};
const phaseRay = (c) => c.mul(c).add(1).mul(3 / (16 * Math.PI));
const phaseHG = (c, g) => float(1 - g * g).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5).mul(4 * Math.PI));
const topDist = (r, mu) => max(r.negate().mul(mu).add(sqrt(max(r.mul(r).mul(mu.mul(mu).sub(1)).add(RT * RT), 0))), 0);
const groundDist = (r, mu) => { const d = r.mul(r).mul(mu.mul(mu).sub(1)).add(RG * RG); return mu.lessThan(0).and(d.greaterThanEqual(0)).select(r.negate().mul(mu).sub(sqrt(max(d, 0))), float(-1)); };
const transUV = (r, mu) => { const rho = sqrt(max(r.mul(r).sub(RG * RG), 0)), d = topDist(r, mu), dmin = float(RT).sub(r), dmax = rho.add(HH); return vec2(d.sub(dmin).div(max(dmax.sub(dmin), 1e-6)), rho.div(HH)); };

const blank = (w, h) => Object.assign(new THREE.DataTexture(new Uint16Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.HalfFloatType), { needsUpdate: true });
const clear3 = Object.assign(new THREE.Data3DTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, 1), { needsUpdate: true });
/** The air's tables for the materials and the dome, whether they are there, and the camera the froxels were made for. */
export const AIR = { trans: texture(blank(1, 1)), multi: texture(blank(1, 1)), view: texture(blank(1, 1)), vol: texture3D(clear3), on: uniform(0), vp: uniform(new THREE.Matrix4()) };

// the sun's light through the air to a height h (km), the sun at mu over the horizon (none once the earth is between)
const sunThere = (h, mu) => { const r = h.add(RG); return groundDist(r, mu).greaterThan(0).select(vec3(0), AIR.trans.sample(transUV(r, mu)).level(0).rgb); };
const multiThere = (h, mu) => AIR.multi.sample(vec2(mu.mul(0.5).add(0.5), h.div(RT - RG))).level(0).rgb;
// the sky view's row for a height over the horizon (e, radians), the horizon lying at hz
const viewV = (e, hz) => { const up = e.greaterThan(hz), span = up.select(float(Math.PI / 2).sub(hz), float(Math.PI / 2).add(hz)), c = sign(e.sub(hz)).mul(sqrt(abs(e.sub(hz)).div(span))); return c.mul(0.5).add(0.5); };
const horizonAt = (h) => { const r = h.add(RG); return acos(clamp(sqrt(max(r.mul(r).sub(RG * RG), 0)).div(r), 0, 1)).negate(); };
const eyeKm = () => max(U.uCam.y, 0).mul(0.001).add(0.002);

/** The sky's light seen along v (world, normalised), in the game's numbers: the sky view's table. */
export const skyAlong = (v) => {
  const az = acos(clamp(normalize(vec2(v.x, v.z)).dot(normalize(vec2(U.uSunDir.x, U.uSunDir.z).add(vec2(1e-5, 0)))), -1, 1));
  return AIR.view.sample(vec2(az.div(Math.PI), viewV(acos(clamp(v.y, -1, 1)).negate().add(Math.PI / 2), horizonAt(eyeKm())))).level(0).rgb.mul(GAIN);
};
/** The air between the eye and w, from the froxels: c × T + L as { T (how much comes through), L (the air's light) }. */
export const froxelAt = (w) => {
  const c = AIR.vp.mul(vec4(w, 1)), uv = c.xy.div(max(c.w, 1e-4)).mul(vec2(0.5, -0.5)).add(0.5);
  const s = log(max(length(w.sub(U.uCam)), NEAR).div(NEAR)).div(Math.log(FAR / NEAR)).sub(0.5 / FZ), A = AIR.vol.sample(vec3(uv, clamp(s, 0, 1))).level(0);
  return { T: A.a, L: A.rgb };
};

export function createAir(renderer) {
  if (!renderer.backend?.isWebGPUBackend) return null;   // (the WebGL 2 fallback: the air worked out per surface, light.js airOf)
  const target = (w, h) => new THREE.RenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const T = target(256, 64), M = target(32, 32), S = target(192, 108);
  const vol = new THREE.Storage3DTexture(FX, FY, FZ); vol.type = THREE.HalfFloatType; vol.format = THREE.RGBAFormat; vol.minFilter = vol.magFilter = THREE.LinearFilter; vol.generateMipmaps = false;
  vol.wrapS = vol.wrapT = vol.wrapR = THREE.ClampToEdgeWrapping;
  note('the air (its tables and froxels)', (256 * 64 + 32 * 32 + 192 * 108 + FX * FY * FZ) * 8, 0);
  const quad = (frag) => { const m = new THREE.NodeMaterial(); m.fragmentNode = frag; return new THREE.QuadMesh(m); };
  // the transmittance: optical depth along (r, mu) to the top, 40 steps
  const transQ = quad(Fn(() => {
    const uv = screenCoordinate.xy.div(vec2(256, 64)), rho = uv.y.mul(HH), r = sqrt(rho.mul(rho).add(RG * RG)), dmin = float(RT).sub(r), dmax = rho.add(HH), d = dmin.add(uv.x.mul(dmax.sub(dmin)));
    const mu = clamp(d.lessThan(1e-4).select(float(1), float(HH * HH).sub(rho.mul(rho)).sub(d.mul(d)).div(r.mul(d).mul(2))), -1, 1), len = topDist(r, mu), tau = vec3(0).toVar();
    Loop({ start: 0, end: 40, type: 'int', name: 'i' }, ({ i }) => { const t = float(i).add(0.5).div(40).mul(len), h = sqrt(r.mul(r).add(t.mul(t)).add(r.mul(mu).mul(t).mul(2))).sub(RG); tau.addAssign(medium(h).ext.mul(len.div(40))); });
    return vec4(exp(tau.negate()), 1);
  })());
  // Ψms: from a point at height h, the sun at mu, 64 ways round, each marched 20 steps (Hillaire's eq. 5–9)
  const multiQ = quad(Fn(() => {
    const uv = screenCoordinate.xy.div(32), mus = uv.x.mul(2).sub(1), h = uv.y.mul(RT - RG).add(0.01), r = h.add(RG), sun = vec3(sqrt(max(float(1).sub(mus.mul(mus)), 0)), mus, 0);
    const L2 = vec3(0).toVar(), F = vec3(0).toVar();
    Loop({ start: 0, end: 64, type: 'int', name: 'i' }, ({ i }) => {
      const z = float(1).sub(float(i).add(0.5).div(32)), a = float(i).mul(2.399963), q = sqrt(max(float(1).sub(z.mul(z)), 0)), d = vec3(q.mul(cos(a)), z, q.mul(sin(a)));
      const g = groundDist(r, d.y), len = g.greaterThan(0).select(g, topDist(r, d.y)), Tr = vec3(1).toVar(), L = vec3(0).toVar(), f = vec3(0).toVar();
      Loop({ start: 0, end: 20, type: 'int', name: 'j' }, ({ j }) => {
        const t = float(j).add(0.5).div(20).mul(len), p = vec3(0, r, 0).add(d.mul(t)), hp = length(p).sub(RG), md = medium(hp), dt = len.div(20);
        const scat = md.ray.add(md.mie), step = exp(md.ext.mul(dt).negate()), sT = sunThere(hp, normalize(p).dot(sun));
        L.addAssign(Tr.mul(scat.mul(sT).mul(1 / (4 * Math.PI)).sub(scat.mul(sT).mul(1 / (4 * Math.PI)).mul(step)).div(max(md.ext, vec3(1e-9)))));
        f.addAssign(Tr.mul(scat.sub(scat.mul(step)).div(max(md.ext, vec3(1e-9)))));
        Tr.mulAssign(step);
      });
      If(g.greaterThan(0), () => { const p = vec3(0, r, 0).add(d.mul(g)), n = normalize(p); L.addAssign(Tr.mul(sunThere(float(0), n.dot(sun))).mul(max(n.dot(sun), 0)).mul(ALBEDO / Math.PI)); });
      L2.addAssign(L.div(64)); F.addAssign(f.div(64));
    });
    return vec4(L2.div(max(vec3(1).sub(F), vec3(1e-3))), 1);
  })());
  // the sky view: from the eye's height, 32 steps along each way (more of them near)
  const sky = (h, v, sun, len, steps) => {
    const r = h.add(RG), L = vec3(0).toVar(), Tr = vec3(1).toVar(), c = v.dot(sun), pr = phaseRay(c), pm = phaseHG(c, MIE_G);
    Loop({ start: 0, end: steps, type: 'int', name: 'i' }, ({ i }) => {
      const t0 = float(i).div(steps), t1 = float(i).add(1).div(steps), ta = t0.mul(t0).mul(len), tb = t1.mul(t1).mul(len), t = ta.add(tb).mul(0.5), dt = tb.sub(ta);
      const p = vec3(0, r, 0).add(v.mul(t)), hp = length(p).sub(RG), md = medium(hp), mu = normalize(p).dot(sun), sT = sunThere(hp, mu), step = exp(md.ext.mul(dt).negate());
      const S = md.ray.mul(pr).add(vec3(md.mie.mul(pm))).mul(sT).add(md.ray.add(md.mie).mul(multiThere(hp, mu)));
      L.addAssign(Tr.mul(S.sub(S.mul(step)).div(max(md.ext, vec3(1e-9))))); Tr.mulAssign(step);
    });
    return L;
  };
  const viewQ = quad(Fn(() => {
    const uv = screenCoordinate.xy.div(vec2(192, 108)), h = eyeKm(), hz = horizonAt(h), cc = uv.y.mul(2).sub(1), up = cc.greaterThan(0);
    const e = hz.add(sign(cc).mul(cc.mul(cc)).mul(up.select(float(Math.PI / 2).sub(hz), float(Math.PI / 2).add(hz)))), az = uv.x.mul(Math.PI);
    const v = vec3(cos(e).mul(cos(az)), sin(e), cos(e).mul(sin(az))), sun = vec3(sqrt(max(float(1).sub(U.uSunDir.y.mul(U.uSunDir.y)), 0)), U.uSunDir.y, 0), r = h.add(RG);
    const g = groundDist(r, v.y), len = g.greaterThan(0).select(g, topDist(r, v.y));
    return vec4(sky(h, v, sun, len, 32), 1);
  })());
  // the froxels: a column a thread
  const inv = uniform(new THREE.Matrix4()), fogRef = uniform(0);
  const froxels = Fn(() => {
    const x = instanceIndex.mod(uint(FX)), y = instanceIndex.div(uint(FX)), ndc = vec2(float(x).add(0.5).div(FX).mul(2).sub(1), float(1).sub(float(y).add(0.5).div(FY).mul(2)));
    const far = inv.mul(vec4(ndc, 1, 1)), dir = normalize(far.xyz.div(far.w).sub(U.uCam)), c = dir.dot(U.uSunDir), j = blueAt(vec2(float(x), float(y))).w;
    const pr = phaseRay(c), pm = phaseHG(c, MIE_G), pf = phaseHG(c, FOG_G), thick = float(1).add(lane.fog.mul(40));
    const L = vec3(0).toVar(), Tr = vec3(1).toVar();
    Loop({ start: 0, end: FZ, type: 'int', name: 'k' }, ({ k }) => {
      const t0 = float(NEAR).mul(pow(float(FAR / NEAR), float(k).div(FZ))), t1 = float(NEAR).mul(pow(float(FAR / NEAR), float(k).add(1).div(FZ))), t = mix(t0, t1, j), dt = t1.sub(t0);
      const p = U.uCam.add(dir.mul(t)), hk = max(p.y, 0).mul(0.001), md = medium(hk), sT = sunThere(hk, U.uSunDir.y).mul(GAIN);
      const fog = float(FOG).mul(exp(p.y.sub(fogRef).div(FOG_H).negate()).min(4)).mul(thick), shaft = t.lessThan(90).select(sunThrough(p), float(1));
      const ext = md.ext.mul(0.001).add(fog), sky = U.uAmb.mul(t.lessThan(90).select(skyAt(p), float(1)));
      const S = md.ray.mul(pr).add(vec3(md.mie.mul(pm))).mul(0.001).mul(sT).add(md.ray.add(md.mie).mul(0.001).mul(multiThere(hk, U.uSunDir.y)).mul(GAIN))
        .add(sT.mul(pf).mul(shaft).add(sky).mul(fog.mul(0.92)));
      const step = exp(ext.mul(dt).negate());
      L.addAssign(Tr.mul(S.sub(S.mul(step)).div(max(ext, vec3(1e-12))))); Tr.mulAssign(step);
      textureStore(vol, uvec3(x, y, uint(k)), vec4(L, Tr.x.add(Tr.y).add(Tr.z).div(3)));
    });
  })().compute(FX * FY);
  let made = false;
  const one = (q, rt) => { renderer.setRenderTarget(rt); q.render(renderer); };
  return {
    /** Before the frame: the tables (the first two once), the froxels for this camera. (Its passes marked for a tool's
        timing: src/core/gpu.js.) */
    render(camera, groundY) {
      const prev = renderer.getRenderTarget(), route = renderer.getRenderObjectFunction(); renderer.setRenderObjectFunction(null);
      if (!made) { mark('air tables'); AIR.trans.value = T.texture; one(transQ, T); AIR.multi.value = M.texture; one(multiQ, M); made = true; }
      mark('sky'); one(viewQ, S); AIR.view.value = S.texture;
      camera.updateMatrixWorld(); AIR.vp.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); inv.value.copy(AIR.vp.value).invert(); fogRef.value = groundY;
      renderer.setRenderTarget(prev); renderer.setRenderObjectFunction(route);
      mark('froxels'); renderer.compute(froxels); AIR.vol.value = vol; AIR.on.value = 1; mark(null);
    },
  };
}
