// Shadows: one shadow map from the light of the hour (the sun, or the moon at night). The things that cast (every placed
// asset's levels, the scattered rocks: layer CASTS) are drawn once more from the light into a depth texture round the
// camera; every surface reads it in the shading contract (src/world/light.js: shadowAt, folded into cloudAt), so the
// ground, the grass, the rocks, the tent and the water all darken on the side away from the light, no material changed.
// Two maps take turns: the casters are drawn into one while every material is bound to the other (a texture cannot be
// drawn into and read in the same pass).
import * as THREE from 'three/webgpu';
import { U } from '../core/uniforms.js';

export const CASTS = 1;   // the layer of what casts a shadow
const S = 2048;           // the map's texels a side

export function createShadows(renderer) {
  const map = () => { const rt = new THREE.RenderTarget(S, S, { count: 0, depthBuffer: true }); rt.depthTexture = new THREE.DepthTexture(S, S); rt.depthTexture.type = THREE.UnsignedIntType; return rt; };
  const rts = [map(), map()]; let turn = 0;
  U.tShadow.value = rts[1].depthTexture;
  const cam = new THREE.OrthographicCamera(-60, 60, 60, -60, 1, 900); cam.layers.set(CASTS); cam.userData.shadow = true;
  // from the light's clip space to the map's (u, v, depth): v turned (three reads a target's rows the other way up), depth
  // as the backend keeps it (WebGPU 0..1; WebGL -1..1)
  const webgpu = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
  const toMap = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, webgpu ? 1 : 0.5, webgpu ? 0 : 0.5, 0, 0, 0, 1);
  const c = new THREE.Color(), up = new THREE.Vector3(), target = new THREE.Vector3(), snap = new THREE.Vector3(), off = new THREE.Vector3();
  return {
    cam,
    /** Draw the casters from the light, round where the camera looks; the size grows with the camera's height. */
    render(scene, camera, groundY) {
      const L = U.uSunDir.value, sun = U.uSun.value;
      if (L.y < 0.03 || sun.x + sun.y + sun.z < 0.02) { U.uShadowOn.value = 0; return; }   // no light to cast by
      const h = Math.max(0, camera.position.y - groundY), half = Math.min(900, 60 + h * 1.2), texel = (2 * half) / S;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 1; cam.far = 600 + half; cam.updateProjectionMatrix();
      // the box's middle on the ground under the camera, held to whole texels in the light's view so the edges do not crawl
      up.set(Math.abs(L.y) > 0.99 ? 1 : 0, Math.abs(L.y) > 0.99 ? 0 : 1, 0); target.set(camera.position.x, groundY, camera.position.z);
      cam.position.copy(target).addScaledVector(L, 300 + half * 0.5); cam.up.copy(up); cam.lookAt(target); cam.updateMatrixWorld();
      snap.copy(target).applyMatrix4(cam.matrixWorldInverse);
      off.set(-(snap.x - Math.round(snap.x / texel) * texel), -(snap.y - Math.round(snap.y / texel) * texel), 0).applyQuaternion(cam.quaternion);
      cam.position.add(off); cam.updateMatrixWorld();
      const rt = rts[turn], prev = renderer.getRenderTarget(), a = renderer.getClearAlpha(); renderer.getClearColor(c);
      U.uShadowOn.value = 0;   // the casters need no shadow of their own while they are drawn
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev); renderer.setClearColor(c, a);
      U.tShadow.value = rt.depthTexture; turn ^= 1;
      U.uShadowM.value.multiplyMatrices(toMap, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
      U.uShadowTexel.value = 1 / S; U.uShadowOn.value = 1;
    },
  };
}
