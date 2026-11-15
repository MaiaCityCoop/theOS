// A fire burning (intent 0018): not surfaces of colour but light, drawn by shaders. An asset that says `fire` (assets/
// flame.js) is stood here instead of as a mesh (src/world/place.js). Four draws, each one instanced quad:
//
//   the coals   a disc lying in the ash, glowing through the cracks of the charcoal, brightest in the middle, breathing
//   the flames  three sheets turned to the eye round the upright (so they stand), one behind the other: in each the
//               flame is a shape eaten away from the top by noise that runs upward, so it licks, breaks into tongues
//               and throws them off, never twice alike; white-yellow at its heart, orange, red at the tips, thin where
//               it is thin. The sheets a little apart in depth give it body as the eye moves round it
//   the sparks  embers thrown up off it, each on its own clock, carried off by the wind, fading as they cool
//   the smoke   a thin grey column over it, rising, widening, bent over by the wind
//
// The fire lights what stands near it (`fireLight`, read by every placed asset's material: src/world/place.js), warm
// and flickering, the more the nearer. One fire's light for now: the one lit last of those burning (the world's, in
// front of the tent: world/places.js; the library's, while its stage shows one). Each fire draws at its own place;
// a fire burns while it is in the scene, and taken out its light goes back to the one before it (intent 0025).
//
// What moves by itself says so to the picture built over time (src/core/temporal.js): the fourth number of the pixels
// it covers is lowered by as much as it covers them, as falling snow does (src/world/weather/snowfall.js).
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uv, uniform, instanceIndex, varyingProperty, positionGeometry, cameraViewMatrix, cameraProjectionMatrix, sin, fract, floor, max, min, mix, abs, pow, length, normalize, smoothstep, clamp, uint, If, Discard } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { vnoise, rnd } from './noise.nodes.js';
import { finish, skyLight, windAt } from './light.js';
import { heightAt } from './land.js';

/** Where the fire whose light the world takes is ((x, y, z) of its middle, a little over the coals) and how strongly
    it lights what is round it (w: 0 none): the last lit of the fires burning. */
export const uFire = uniform(new THREE.Vector4(0, -1e4, 0, 0));
// the fires burning (each its place and strength, as uFire holds them), in the order they were lit
const burning = [];
const lightLast = () => { const f = burning.at(-1); if (f) uFire.value.copy(f); else uFire.value.set(0, -1e4, 0, 0); };
// how the fire's light flickers: a few unrelated beats, never repeating soon; ~0.75 … 1.15
const flicker = () => {
  const t = U.uTime;
  return float(0.95).add(sin(t.mul(11.3)).mul(0.07)).add(sin(t.mul(23.9).add(1.3)).mul(0.05)).add(sin(t.mul(5.7).add(0.4)).mul(0.06)).add(sin(t.mul(37.1).add(2.1)).mul(0.03));
};
// a fire's light: a deep orange (about 1900 K), from a little over the coals
const FIRE_RGB = vec3(1.0, 0.42, 0.11);
/** The fire's light on a surface at w facing n: warm, flickering, falling off with the square of the distance (a
    little softened, the fire being no point). What stands round it reads this beside the sun and the sky. */
export const fireLight = (w, n) => {
  const d = uFire.xyz.sub(w), r2 = d.dot(d), l = d.div(max(r2.sqrt(), 1e-3));
  const facing = max(n.dot(l), 0).mul(0.8).add(0.2);   // (a fire is wide: it reaches a little round edges)
  return FIRE_RGB.mul(uFire.w.mul(flicker()).mul(facing).div(r2.mul(1.4).add(0.8)));
};

// a little fractal noise: four octaves of value noise, ~0 … 1
const fbm = (p, s) => vnoise(p, uint(s)).mul(0.5).add(vnoise(p.mul(2.03).add(17.1), uint(s + 1)).mul(0.25)).add(vnoise(p.mul(4.01).add(3.7), uint(s + 2)).mul(0.125)).add(vnoise(p.mul(8.13).add(9.2), uint(s + 3)).mul(0.0625)).div(0.9375);
// the colour of fire at a temperature 0 … 1, as light (above 1 where it is hot): deep red, orange, yellow, near white
const heat = (T) => {
  let c = mix(vec3(0.45, 0.035, 0.0), vec3(1.0, 0.26, 0.02), smoothstep(0.08, 0.4, T));
  c = mix(c, vec3(1.0, 0.52, 0.1), smoothstep(0.35, 0.72, T));
  c = mix(c, vec3(1.0, 0.78, 0.38), smoothstep(0.72, 1.05, T));
  return c.mul(T.mul(T).mul(2.6).add(T.mul(1.3)).add(0.2));
};
// what draws over what is there: premultiplied, and the picture built over time told how much is covered
const over = (m) => Object.assign(m, { transparent: true, depthWrite: false, side: THREE.DoubleSide,   // (a sheet turned to the eye may be wound either way)
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
const quads = (n) => { const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1)); g.instanceCount = n; return g; };
const drawn = (g, m, order, at) => { const mesh = new THREE.Mesh(g, m); mesh.renderOrder = order; mesh.frustumCulled = false; mesh.position.copy(at); return mesh; };

/** A sheet stood upright at c, turned round the upright to face the eye: w wide, h high, its foot at c; its corner
    (positionGeometry, -0.5 … 0.5) as a world point. `bend`: the wind's push at its top, metres. */
const upright = (c, w, h, bend) => {
  const toEye = U.uCam.xz.sub(c.xz), d = toEye.div(max(length(toEye), 1e-3)), right = vec3(d.y.negate(), 0, d.x);
  const v = positionGeometry.y.add(0.5);
  return c.add(right.mul(positionGeometry.x.mul(w))).add(vec3(0, v.mul(h), 0)).add(bend.mul(v.mul(v)));
};
const clipOf = (w) => cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(w, 1)));

/** The flames: three sheets, each its own fire, a little apart in depth. */
function flames(F) {
  const m = over(new THREE.NodeMaterial()), k = instanceIndex.toFloat(), vW = varyingProperty('vec3', 'fW'), vK = varyingProperty('float', 'fK');
  m.vertexNode = Fn(() => {
    const at = F.at.xyz.sub(vec3(0, 0.34, 0));   // the coals
    const toEye = U.uCam.sub(at).mul(vec3(1, 0, 1)), dEye = toEye.div(max(length(toEye), 1e-3));
    // the sheets one behind the other along the line of sight, and a little aside; the middle one widest
    const c = at.add(dEye.mul(k.sub(1).mul(0.13))).add(vec3(dEye.z, 0, dEye.x.negate()).mul(k.sub(1).mul(0.06)));
    const w = float(F.width).mul(float(1).sub(abs(k.sub(1)).mul(0.22))), h = float(F.height).mul(float(1).sub(abs(k.sub(1)).mul(0.18)));
    const push = windAt(at.xz), bend = vec3(push.x, 0, push.y).mul(0.55);
    const p = upright(c, w, h, bend); vW.assign(p); vK.assign(k);
    return clipOf(p);
  })();
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar(), t = U.uTime, q = uv(), x = q.x.sub(0.5).mul(2), y = q.y, s = vK.mul(31.7);
    // the flame's body wanders: the whole of it swayed by a slow noise, more the higher
    const sway = fbm(vec2(t.mul(0.9).add(s), s), 610).sub(0.5).mul(0.5).mul(y);
    // turbulence running upward through it: x pushed about, the faster the higher
    const turb = fbm(vec2(x.mul(1.8).add(s), y.mul(2.2).sub(t.mul(2.1))), 620).sub(0.5);
    const xd = x.add(sway).add(turb.mul(y.mul(1.1).add(0.15)));
    // its outline: wide and round at the foot, drawn to a point; then eaten from the top by noise rising through it
    const width = pow(float(1).sub(y), 0.7).mul(0.7).mul(smoothstep(0.0, 0.12, y).mul(0.5).add(0.5));
    const body = float(1).sub(abs(xd).div(max(width, 1e-3)));
    // eaten from the top, in tongues: a coarse noise splits it, a finer one frays the tongues' edges
    const eat = fbm(vec2(x.mul(5.6).add(s.mul(1.3)), y.mul(1.35).sub(t.mul(2.7))), 640), fray = vnoise(vec2(x.mul(12).sub(s), y.mul(5).sub(t.mul(5.0))), uint(650));
    const d = body.sub(y.mul(y.mul(0.35).add(0.8)).mul(eat.mul(2.4).add(fray.mul(0.5)).sub(0.2)));
    const dens = smoothstep(0.02, 0.12, d).mul(smoothstep(0.0, 0.05, y));
    If(dens.lessThan(0.004), () => { Discard(); });
    // hottest low in the middle, cooler out and up; a fire's flicker in all of it
    // hot inside, cooler at its edges and up: orange-red rims and tips round a yellow heart
    const T = clamp(smoothstep(0.0, 0.55, d).mul(0.75).add(dens.mul(0.25)).mul(float(1.15).sub(y.mul(1.05))).mul(flicker().mul(0.25).add(0.78)), 0, 1.1);
    const col = finish(heat(T), vW);   // (seen through the air as everything is)
    const a = clamp(dens.mul(T.mul(0.45).add(0.55)), 0, 1).mul(0.9);
    out.assign(vec4(col.rgb.mul(a), a));
    return out;
  })();
  return drawn(quads(3), m, 7, new THREE.Vector3());
}

/** The coals: a disc in the ash, the charcoal's cracks glowing, brightest in the middle, breathing. */
function coals(F) {
  const m = over(new THREE.NodeMaterial()), vW = varyingProperty('vec3', 'cW');
  m.vertexNode = Fn(() => {
    const p = F.at.xyz.sub(vec3(0, 0.4 - 0.03 - 0.112, 0))   // (just over the ash's heaped middle: assets/firepit.js ashAt).add(vec3(positionGeometry.x, 0, positionGeometry.y).mul(F.bed * 2));
    vW.assign(p); return clipOf(p);
  })();
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar(), t = U.uTime, p = uv().sub(0.5).mul(2), r = length(p);
    If(r.greaterThan(1), () => { Discard(); });
    const hot = pow(float(1).sub(r), 1.4);
    // lumps of charcoal: dark where whole, glowing in the cracks between and where the surface has burned
    const lumps = vnoise(p.mul(7.5), uint(660)), cracks = smoothstep(0.08, 0.0, abs(lumps.sub(0.5))).mul(0.8);
    const breathe = fbm(p.mul(3).add(vec2(t.mul(0.35), t.mul(-0.27))), 670);
    const glow = clamp(cracks.add(smoothstep(0.45, 0.9, breathe).mul(0.7)).mul(hot.mul(1.4)), 0, 1);
    const T = glow.mul(breathe.mul(0.5).add(0.6)).mul(0.85);
    If(glow.lessThan(0.01), () => { Discard(); });
    const col = finish(heat(T).mul(1.6), vW);
    const a = smoothstep(0.0, 0.25, glow).mul(0.95);
    out.assign(vec4(col.rgb.mul(a), a));
    return out;
  })();
  return drawn(quads(1), m, 6, new THREE.Vector3());
}

/** The sparks: embers thrown up off it, each on its own clock, carried off by the wind, cooling as they rise. */
function sparks(F) {
  const N = F.sparks, m = over(new THREE.NodeMaterial()), i = instanceIndex.toInt(), r = (s) => rnd(i, i.mul(7).add(3), uint(s));
  const vCol = varyingProperty('vec3', 'sCol'), vA = varyingProperty('float', 'sA');
  m.vertexNode = Fn(() => {
    const t = U.uTime, life = r(681).mul(1.6).add(0.9), age = fract(t.div(life).add(r(682)));   // 0 thrown off … 1 gone
    const at = F.at.xyz.sub(vec3(0, 0.3, 0)), a0 = r(683).mul(6.2831853), d0 = r(684).mul(F.bed * 0.7);
    const rise = age.mul(r(685).mul(1.8).add(1.0)).sub(age.mul(age).mul(0.3));
    const push = windAt(at.xz), drift = vec3(push.x, 0, push.y).mul(age.mul(age).mul(2.2));
    const wob = vec3(sin(t.mul(r(686).mul(4).add(3)).add(a0)), 0, sin(t.mul(r(687).mul(4).add(3)).add(a0.mul(1.7)))).mul(age.mul(0.12));
    const w = at.add(vec3(sin(a0).mul(d0), rise, sin(a0.add(1.5708)).mul(d0))).add(drift).add(wob);
    const v = cameraViewMatrix.mul(vec4(w, 1)), size = float(F.spark).mul(float(1).sub(age.mul(0.6))).max(v.z.negate().mul(0.0018));   // (never smaller than a pixel or so)
    const T = float(1).sub(age).mul(r(688).mul(0.4).add(0.7)).mul(sin(t.mul(r(689).mul(20).add(10))).mul(0.15).add(0.85));
    vCol.assign(finish(heat(T).mul(2.6), w).rgb); vA.assign(smoothstep(1.0, 0.6, age).mul(smoothstep(0.0, 0.05, age)));
    return cameraProjectionMatrix.mul(vec4(v.xy.add(positionGeometry.xy.mul(size)), v.z, 1));
  })();
  m.fragmentNode = Fn(() => {
    const a = smoothstep(0.5, 0.1, length(uv().sub(0.5))).mul(vA);
    If(a.lessThan(0.02), () => { Discard(); });
    return vec4(vCol.mul(a), a);
  })();
  return drawn(quads(N), m, 9, new THREE.Vector3());
}

/** The smoke: a thin column over it, rising and widening, bent over by the wind, lit by the sky and the sun. */
function smoke(F) {
  const m = over(new THREE.NodeMaterial()), vW = varyingProperty('vec3', 'kW'), k = instanceIndex.toFloat(), vK = varyingProperty('float', 'kK');
  m.vertexNode = Fn(() => {
    const at = F.at.xyz.add(vec3(0, 0.5, 0)), push = windAt(at.xz), bend = vec3(push.x, 0, push.y).mul(2.6);   // (from over the flames' tips)
    const toEye = U.uCam.sub(at).mul(vec3(1, 0, 1)), dEye = toEye.div(max(length(toEye), 1e-3));
    const c = at.add(dEye.mul(k.sub(0.5).mul(0.3)));
    // wider the higher: the sheet's corners spread out as they rise
    const v = positionGeometry.y.add(0.5), wide = v.mul(1.6).add(0.45);
    const right = vec3(dEye.z.negate(), 0, dEye.x);
    const p = c.add(right.mul(positionGeometry.x.mul(F.smokeW).mul(wide))).add(vec3(0, v.mul(F.smokeH), 0)).add(bend.mul(v.mul(v)));
    vW.assign(p); vK.assign(k);
    return clipOf(p);
  })();
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar(), t = U.uTime, q = uv(), x = q.x.sub(0.5).mul(2), y = q.y, s = vK.mul(13.1);
    const roll = fbm(vec2(x.mul(1.5).add(s), y.mul(2.4).sub(t.mul(0.55))), 700), fine = fbm(vec2(x.mul(4).sub(s), y.mul(5).sub(t.mul(0.9))), 710);
    const xd = x.add(roll.sub(0.5).mul(0.9));
    const plume = smoothstep(1.0, 0.1, abs(xd)).mul(smoothstep(0.0, 0.3, y)).mul(smoothstep(1.0, 0.45, y));
    const dens = clamp(plume.mul(roll.mul(0.9).add(fine.mul(0.5)).sub(0.45)).mul(1.6), 0, 1).mul(F.smoke);
    If(dens.lessThan(0.004), () => { Discard(); });
    // pale grey smoke, lit from above by the sky and the sun, a little warmer low down where the fire lights it
    const lit = vec3(0.55, 0.55, 0.56).mul(skyLight(vec3(0, 1, 0)).add(U.uSun.mul(0.55))).add(FIRE_RGB.mul(F.at.w).mul(smoothstep(0.3, 0.0, y)).mul(0.15));
    const col = finish(lit, vW);
    out.assign(vec4(col.rgb.mul(dens), dens));
    return out;
  })();
  return drawn(quads(2), m, 8, new THREE.Vector3());
}

/** Stand a fire asset ({ fire: { … } }: assets/flame.js) at a place ({ x, z }): its coals, flames, sparks and smoke, and
    its light on what stands round it. Its draws read its own place (F.at), never another fire's. It burns while it is
    in the scene: put in, its light is the world's; taken out, the light goes back to the fire lit before it, or out. */
export function lightFire(scene, asset, at) {
  const F = { width: 0.9, height: 1.05, bed: 0.4, sparks: 48, spark: 0.016, smoke: 0.55, smokeW: 0.55, smokeH: 3.0, strength: 1.0, ...asset.fire };
  const here = new THREE.Vector4(at.x, heightAt(at.x, at.z) - 0.03 + 0.4, at.z, F.strength);
  F.at = uniform(here);
  const g = new THREE.Group(); g.name = asset.name; g.userData.fire = F.at;   // (for pages and tools that look at it)
  g.add(coals(F), flames(F), smoke(F), sparks(F));
  g.addEventListener('added', () => { if (!burning.includes(here)) burning.push(here); lightLast(); });
  g.addEventListener('removed', () => { const i = burning.indexOf(here); if (i >= 0) burning.splice(i, 1); lightLast(); });
  scene.add(g);
  return g;
}
