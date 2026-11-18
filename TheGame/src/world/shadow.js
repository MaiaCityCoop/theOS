// Shadows (intent 0038, stage 9): cascades from the light of the hour (the sun, or the moon at night), the layers of one
// depth array. What casts (every placed asset's levels, the stands, the scattered rocks, a person: layer CASTS) is drawn
// from the light into it; every surface reads it in the one light (src/world/light.js sunAt), so the ground, the grass,
// the rocks, the tent and the water all darken on the side away from the light.
//
// Their layout, all of it derived (useCascades, at the start, before any material is built):
//   texels   S a side: a texel one dial pixel at its own cascade's edge, at the most pixels the screen can draw (the one
//            measure: two of the pixels a metre covers a metre off, pxKMost; what is made once is made for the most)
//   the near its texel the sun's own penumbra under the lowest crown that casts (SUN_DIAMETER × CROWN_BASE: a texel finer
//            than the narrowest penumbra a crown throws resolves nothing the sun's disc does not blur away), a third of
//            it ahead of the eye. Read with a penumbra as wide as the sun's disc makes it: the farther the blocker from
//            what it shades, the softer (light.js). What is finer still, nearer its receiver, is the contact shadows'
//            (src/world/light/screen.js). (CROWN_BASE stands in for where the contact shadows hand over, until their
//            reach is a length of its own)
//   the rest each twice the one before (a split by the logarithm: each texel a dial pixel at its edge and two where it
//            takes over), as many as reach the farthest caster (SHADE_REACH: where the trees' shade stand-ins end and
//            the land's own shade takes over, src/terrain/layers.js); the near one's side fitted so the last ends there
//   when     the near one every frame, of the others one a frame in turn (all of them whenever the light has turned or
//            the eye has jumped): every frame the near pass and one more, however many there are
//
// Each cascade is a layer of its own, drawn in a pass of its own that clears it: a tile GPU loads and stores the whole of
// what a pass draws into, whatever its scissor, so one atlas of them all made every frame's near pass load and store the
// others too. One array is still one binding for the materials.
//
// The casters are drawn by their shadow twins (src/core/pass.js): their depth and their cut-out only (a leaf's outline,
// so a crown casts dappled light), none of their light. So no caster binds the cascades it is drawn into.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { compileFor } from '../core/compile.js';
import { twinOf } from '../core/pass.js';
import { note, mark } from '../core/gpu.js';
import { pxKMost } from '../detail/measure.js';
import { SUN_DIAMETER } from './light/physics.js';

export const CASTS = 1;   // the layer of what casts a shadow
// (a cascade's camera, h metres its half side: how far back along the light it stands from the ground it looks at, and
// the depth it holds, so that what stands as high as anything does over the ground is in front of it)
const spanOf = (h) => ({ back: 300 + h * 0.5, near: 1, far: 600 + h });

let C = null;
/** Lay the cascades out (src/boot.js: once the measure knows the most the screen can draw, keepMeasure, and before any
    material is built, for the light is built for them). reach: how far round the eye shadows are drawn
    (src/terrain/layers.js SHADE_REACH); crown: the lowest crown that casts (CROWN_BASE); top: the tallest caster
    (CASTER_TOP); radius: the smallest crown's reach (CROWN_REACH, for the canopy). */
export function useCascades({ reach, crown, top, radius }) {
  if (!(reach > 0 && crown > 0 && crown < Infinity && top > 0 && radius > 0 && radius < Infinity)) throw new Error(`the shadow cascades are laid out from what casts in the stands (reach ${reach} m, lowest crown ${crown} m, tallest ${top} m, smallest crown ${radius} m round): none of it there`);
  // a cascade's texels a side: a texel one dial pixel at its own cascade's edge (h metres from the eye, 2h / S a texel,
  // and a metre a metre off is pxKMost dial pixels: at the most pixels the screen can draw and the dial at rest, for
  // what is made once is made for the most: src/detail/measure.js)
  const S = Math.ceil(2 * pxKMost());
  const finest = (SUN_DIAMETER * crown * S) / 2;   // (the near one's half side at the most: its texel the lowest crown's penumbra)
  // as many as reach `reach`, each twice the one before; two at the least: three binds a depth texture of one layer as no
  // array, which the materials are built for
  const n = Math.max(2, 1 + Math.ceil(Math.log2(reach / finest)));
  const half = Array.from({ length: n }, (_, k) => (reach / 2 ** (n - 1)) * 2 ** k), texel = half.map((h) => (2 * h) / S);
  const bias = texel.map((t) => 2 * t), range = half.map((h) => spanOf(h).far - spanOf(h).near);
  C = { S, n, half, texel, bias, range, top, casters: { reach, crown, top, radius }, mats: half.map(() => uniform(new THREE.Matrix4())) };
  return C;
}
/** The cascades as useCascades laid them out: { S (texels a side), n (how many), half (each one's half side, m), texel (m), bias (m along the
    light a caster stands back before it shades: two of its texels, the 2 × 2 comparison's reach; what is steep to the
    light is moved off along its normal, light.js), range (the depth it holds, m), top (the tallest caster, m), casters
    (what they were laid out from: reach, crown, top, radius, m), mats (each
    one's matrix from the world to its u, v and depth, uniforms) }. */
export const cascades = () => {
  if (!C) throw new Error('the shadow cascades are laid out at the start, before any material is built (src/boot.js: useCascades)');
  return C;
};

/** What a caster is drawn as into a shadow map, or the canopy map (src/world/canopy.js): its shadow twin. */
export const castRoute = (renderer) => {
  const draw = renderer.renderObject;
  return (object, scene, camera, geometry, material, group, lights, clipping, passId) => draw.call(renderer, object, scene, camera, geometry, material.isNodeMaterial ? twinOf(material).shadow : material, group, lights, clipping, passId);
};

export function createShadows(renderer) {
  const { S, n, half, top, mats } = cascades();
  // (depth32float, as the canopy map's is, src/world/light/canopy.js: a caster's twin is then one pipeline for both)
  const rt = new THREE.RenderTarget(S, S, { count: 0, depthBuffer: true, depth: n });
  rt.depthTexture = new THREE.DepthTexture(S, S, THREE.FloatType, undefined, undefined, undefined, THREE.LinearFilter, THREE.LinearFilter, undefined, THREE.DepthFormat, n);
  rt.depthTexture.compareFunction = THREE.LessEqualCompare;   // read with a comparison sampler: filtered PCF (src/world/light.js)
  note('shadow cascades', n * S * S * 4, 0);
  U.uShadowPull.value = C.bias[0];   // (what casts pulled towards the light, by the near cascade's bias: light.js casterPull)
  const cams = half.map(() => { const c = new THREE.OrthographicCamera(); c.layers.set(CASTS); c.userData.shadow = true; return c; });
  const route = castRoute(renderer);
  // from the light's clip space to a cascade's (u, v, depth): v turned (three reads a target's rows the other way up),
  // depth as the backend keeps it (WebGPU 0..1; WebGL -1..1)
  const webgpu = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
  const toMap = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, webgpu ? 1 : 0.5, webgpu ? 0 : 0.5, 0, 0, 0, 1);
  const up = new THREE.Vector3(), target = new THREE.Vector3(), snap = new THREE.Vector3(), off = new THREE.Vector3(), ahead = new THREE.Vector3();
  const lastSun = new THREE.Vector3(), lastEye = new THREE.Vector3(); let turn = 0;
  // a cascade's camera: its box round the eye (the near one a third of its side ahead, where the eye looks), held to
  // whole texels in the light's view so its edges do not crawl
  const aim = (k, camera, groundY) => {
    const cam = cams[k], L = U.uSunDir.value, h = half[k], texel = (2 * h) / S, span = spanOf(h);
    cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h; cam.near = span.near; cam.far = span.far; cam.updateProjectionMatrix();
    camera.getWorldDirection(ahead); ahead.y = 0; if (ahead.lengthSq() > 1e-6) ahead.normalize().multiplyScalar(k === 0 ? h / 3 : 0);
    up.set(Math.abs(L.y) > 0.99 ? 1 : 0, Math.abs(L.y) > 0.99 ? 0 : 1, 0); target.set(camera.position.x + ahead.x, groundY, camera.position.z + ahead.z);
    cam.position.copy(target).addScaledVector(L, span.back); cam.up.copy(up); cam.lookAt(target); cam.updateMatrixWorld();
    snap.copy(target).applyMatrix4(cam.matrixWorldInverse);
    off.set(-(snap.x - Math.round(snap.x / texel) * texel), -(snap.y - Math.round(snap.y / texel) * texel), 0).applyQuaternion(cam.quaternion);
    cam.position.add(off); cam.updateMatrixWorld();
    return cam;
  };
  const matOf = (k) => mats[k].value.multiplyMatrices(toMap, cams[k].projectionMatrix).multiply(cams[k].matrixWorldInverse);
  return {
    cams, target: rt, layout: C,
    /** The casters compiled for the cascades, from where the light looks at this camera now, in turn
        (src/core/compile.js; a promise): before the first frame, which would otherwise compile them as it draws them.
        object: the scene, or a part of it to stand in `scene` (a subject the library shows). The farthest cascade's
        camera sees all that any does. */
    compile(object, camera, groundY, scene = null) { return compileFor(renderer, rt, object, aim(n - 1, camera, groundY), scene, route); },
    /** Draw the casters from the light, round where the camera looks: the near cascade every frame, the others in turn. */
    render(scene, camera, groundY) {
      const L = U.uSunDir.value, sun = U.uSun.value;
      if (L.y < 0.03 || sun.x + sun.y + sun.z < 0.02) { U.uShadowOn.value = 0; return; }   // no light to cast by
      // the others: one a frame in turn, or all at once when the light has turned or the eye has jumped since
      const jump = lastSun.dot(L) < 0.99998 || lastEye.distanceToSquared(camera.position) > 25 || !U.uShadowOn.value;
      const which = jump ? half.map((_, k) => n - 1 - k) : [1 + (turn++ % (n - 1)), 0];
      const prev = renderer.getRenderTarget(), ac = renderer.autoClear, acd = renderer.autoClearDepth;
      U.uShadowOn.value = 0; U.uShadowPass.value = 1;   // (a caster drawn pulled towards the light by the near cascade's bias: characters/kit/human.js casterPull)
      renderer.setRenderObjectFunction(route); renderer.autoClear = true; renderer.autoClearDepth = true;   // (each cascade's layer cleared by its own pass: nothing loaded)
      for (const k of which) {
        mark(k ? 'far' : 'near');   // (whose passes these are, for a tool's timing: src/core/gpu.js)
        renderer.setRenderTarget(rt, k); renderer.render(scene, aim(k, camera, groundY)); matOf(k);
      }
      if (jump) { lastSun.copy(L); lastEye.copy(camera.position); }
      mark(null); renderer.setRenderObjectFunction(null); renderer.autoClear = ac; renderer.autoClearDepth = acd; renderer.setRenderTarget(prev);
      U.uShadowPass.value = 0;
      U.tShadow.value = rt.depthTexture; U.uShadowOn.value = 1;
      U.uShadowPen.value = (SUN_DIAMETER * top) / L.y;   // the widest penumbra: the sun's disc over the tallest caster's way along the light
    },
  };
}
