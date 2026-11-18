// Shadows (intent 0038, stage 9): two cascades from the light of the hour (the sun, or the moon at night), the two layers
// of one depth array. What casts (every placed asset's levels, the stands, the scattered rocks, a person: layer CASTS)
// is drawn from the light into it; every surface reads it in the one light (src/world/light.js sunAt), so the ground, the
// grass, the rocks, the tent and the water all darken on the side away from the light.
//
//   near   70 m round the eye (a third of it ahead), 2048 texels: 3.4 cm a texel, fine enough for a leaf's shadow on
//          the path; what is finer still is the contact shadows' (src/world/light/screen.js). Drawn every frame. Read
//          with a penumbra as wide as the sun's disc makes it: the farther the blocker from what it shades, the softer
//          (light.js)
//   far    BOX round the eye, growing as it climbs: what the near one does not reach. Drawn every FAR_EVERY frames (and
//          whenever the light or the eye has moved much), between them kept as it was
//
// Each cascade is a layer of its own, drawn in a pass of its own that clears it: a tile GPU loads and stores the whole of
// what a pass draws into, whatever its scissor, so one atlas of both made every frame's near pass (and the triangle that
// wiped its square first) load and store the far one too: 120 MB a frame. One array is still one binding for the
// materials.
//
// The casters are drawn by their shadow twins (src/core/pass.js): their depth and their cut-out only (a leaf's outline,
// so a crown casts dappled light), none of their light. So no caster binds the cascades it is drawn into.
import * as THREE from 'three/webgpu';
import { U } from '../core/uniforms.js';
import { compileFor } from '../core/compile.js';
import { twinOf } from '../core/pass.js';
import { note, mark } from '../core/gpu.js';

export const CASTS = 1;   // the layer of what casts a shadow
/** A cascade's texels a side (src/world/light.js reads them so). derive: from ERROR_PX (a texel's footprint on the screen
    at the near cascade's reach) and the light's 3 ms */
export const SHADOW_S = 2048;
/** The near cascade's half side, metres: 2048 texels over 70 m, 3.4 cm a texel. derive: as far as a texel stays within
    ERROR_PX on the screen */
const NEAR = 35;
/** The far cascade's box round the camera, half its side in metres: `min` on the ground, `grow` more for every metre the
    camera is up, `max` at most (the land reads it too: where no shadow is drawn, a stand's floor is dimmed by itself). */
export const BOX = { min: 100, grow: 1.2, max: 900 };   // derive: from the far cascade's texels and ERROR_PX, and the land's reach
const FAR_EVERY = 4;   // the far cascade is drawn every this many frames. derive: from how far its texel moves on the screen a frame, and the light's 3 ms
/** Metres along the light a caster stands back before it shades (each cascade's: about two of its texels). derive: from
    each cascade's texel and its depth's precision */
export const BIAS = [0.07, 0.25];

/** What a caster is drawn as into a shadow map, or the canopy map (src/world/canopy.js): its shadow twin. */
export const castRoute = (renderer) => {
  const draw = renderer.renderObject;
  return (object, scene, camera, geometry, material, group, lights, clipping, passId) => draw.call(renderer, object, scene, camera, geometry, material.isNodeMaterial ? twinOf(material).shadow : material, group, lights, clipping, passId);
};

export function createShadows(renderer) {
  const S = SHADOW_S;
  // (depth32float, as the canopy map's is, src/world/light/canopy.js: a caster's twin is then one pipeline for both)
  const rt = new THREE.RenderTarget(S, S, { count: 0, depthBuffer: true, depth: 2 });
  rt.depthTexture = new THREE.DepthTexture(S, S, THREE.FloatType, undefined, undefined, undefined, THREE.LinearFilter, THREE.LinearFilter, undefined, THREE.DepthFormat, 2);
  rt.depthTexture.compareFunction = THREE.LessEqualCompare;   // read with a comparison sampler: filtered PCF (src/world/light.js)
  note('shadow cascades', 2 * S * S * 4, 0);
  const cams = [0, 1].map(() => { const c = new THREE.OrthographicCamera(-60, 60, 60, -60, 1, 900); c.layers.set(CASTS); c.userData.shadow = true; return c; });
  const route = castRoute(renderer);
  // from the light's clip space to a cascade's (u, v, depth): v turned (three reads a target's rows the other way up),
  // depth as the backend keeps it (WebGPU 0..1; WebGL -1..1)
  const webgpu = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
  const toMap = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, webgpu ? 1 : 0.5, webgpu ? 0 : 0.5, 0, 0, 0, 1);
  const up = new THREE.Vector3(), target = new THREE.Vector3(), snap = new THREE.Vector3(), off = new THREE.Vector3(), ahead = new THREE.Vector3();
  const lastSun = new THREE.Vector3(), lastEye = new THREE.Vector3(); let frame = 0, farAt = -1e9;
  const halfOf = (k, camera, groundY) => (k === 0 ? NEAR : Math.min(BOX.max, BOX.min + Math.max(0, camera.position.y - groundY) * BOX.grow));
  // a cascade's camera: its box round the eye (the near one a third of its side ahead, where the eye looks), held to
  // whole texels in the light's view so its edges do not crawl
  const aim = (k, camera, groundY) => {
    const cam = cams[k], L = U.uSunDir.value, half = halfOf(k, camera, groundY), texel = (2 * half) / S;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 1; cam.far = 600 + half; cam.updateProjectionMatrix();
    camera.getWorldDirection(ahead); ahead.y = 0; if (ahead.lengthSq() > 1e-6) ahead.normalize().multiplyScalar(k === 0 ? half / 3 : 0);
    up.set(Math.abs(L.y) > 0.99 ? 1 : 0, Math.abs(L.y) > 0.99 ? 0 : 1, 0); target.set(camera.position.x + ahead.x, groundY, camera.position.z + ahead.z);
    cam.position.copy(target).addScaledVector(L, 300 + half * 0.5); cam.up.copy(up); cam.lookAt(target); cam.updateMatrixWorld();
    snap.copy(target).applyMatrix4(cam.matrixWorldInverse);
    off.set(-(snap.x - Math.round(snap.x / texel) * texel), -(snap.y - Math.round(snap.y / texel) * texel), 0).applyQuaternion(cam.quaternion);
    cam.position.add(off); cam.updateMatrixWorld();
    return cam;
  };
  const matOf = (k) => (k === 0 ? U.uShadowM : U.uShadowM2).value.multiplyMatrices(toMap, cams[k].projectionMatrix).multiply(cams[k].matrixWorldInverse);
  return {
    cams, target: rt,
    /** The casters compiled for the cascades, from where the light looks at this camera now, in turn
        (src/core/compile.js; a promise): before the first frame, which would otherwise compile them as it draws them.
        object: the scene, or a part of it to stand in `scene` (a subject the library shows). */
    compile(object, camera, groundY, scene = null) { return compileFor(renderer, rt, object, aim(1, camera, groundY), scene, route); },
    /** Draw the casters from the light, round where the camera looks: the near cascade every frame, the far one in turn. */
    render(scene, camera, groundY) {
      const L = U.uSunDir.value, sun = U.uSun.value; frame++;
      if (L.y < 0.03 || sun.x + sun.y + sun.z < 0.02) { U.uShadowOn.value = 0; return; }   // no light to cast by
      // the far cascade: in turn, or at once when the light has turned or the eye has jumped since it was drawn
      const far = frame - farAt >= FAR_EVERY || lastSun.dot(L) < 0.99998 || lastEye.distanceToSquared(camera.position) > 25 || !U.uShadowOn.value;
      const prev = renderer.getRenderTarget(), ac = renderer.autoClear, acd = renderer.autoClearDepth;
      U.uShadowOn.value = 0; U.uShadowPass.value = 1;   // (a caster drawn pulled towards the light by the map's bias: characters/kit/human.js casterPull)
      renderer.setRenderObjectFunction(route); renderer.autoClear = true; renderer.autoClearDepth = true;   // (each cascade's layer cleared by its own pass: nothing loaded)
      for (const k of far ? [1, 0] : [0]) {
        mark(k ? 'far' : 'near');   // (whose passes these are, for a tool's timing: src/core/gpu.js)
        renderer.setRenderTarget(rt, k); renderer.render(scene, aim(k, camera, groundY)); matOf(k);
      }
      if (far) { farAt = frame; lastSun.copy(L); lastEye.copy(camera.position); }
      mark(null); renderer.setRenderObjectFunction(null); renderer.autoClear = ac; renderer.autoClearDepth = acd; renderer.setRenderTarget(prev);
      U.uShadowPass.value = 0;
      U.tShadow.value = rt.depthTexture;
      U.uShadowTexel.value = 1 / S; U.uShadowOn.value = 1;
      const r0 = cams[0].far - cams[0].near, r1 = cams[1].far - cams[1].near;
      U.uShadowSize.value.set(2 * NEAR, cams[1].right - cams[1].left); U.uShadowRange.value.set(r0, r1, BIAS[0] / r0, BIAS[1] / r1);
    },
  };
}
