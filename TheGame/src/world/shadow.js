// Shadows (asked during intent 0007): one shadow map from the light of the hour (the sun, or the moon at night). The
// things that cast (every placed asset's levels, the scattered rocks: layer 1) are drawn once more from the light into a
// depth texture round the camera; every surface reads it in the shading contract (LIGHT_GLSL's shadowAt, folded into
// cloudAt, the share of the sun that reaches a point), so the ground, the grass, the rocks, the tent and the water all
// darken on the side away from the light, with no material of their own changed.
import * as THREE from 'three';

export const CASTS = 1;   // the layer of what casts a shadow
const S = 2048;           // the map's texels a side

export function createShadows(renderer, scene, U) {
  const rt = new THREE.WebGLRenderTarget(S, S, { depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(S, S); rt.depthTexture.type = THREE.UnsignedIntType;
  const cam = new THREE.OrthographicCamera(-60, 60, 60, -60, 1, 900); cam.layers.set(CASTS); cam.userData.shadow = true;
  U.tShadow.value = rt.depthTexture;
  const m = new THREE.Matrix4(), c = new THREE.Color();
  return {
    rt, cam,
    /** Draw the casters from the light, round where the camera looks; the size grows with the camera's height. */
    render(camera, groundY) {
      const L = U.uSunDir.value, sun = U.uSun.value;
      if (L.y < 0.03 || sun.x + sun.y + sun.z < 0.02) { U.uShadowOn.value = 0; return; }   // no light to cast by
      const h = Math.max(0, camera.position.y - groundY), half = Math.min(900, 60 + h * 1.2), texel = (2 * half) / S;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 1; cam.far = 600 + half; cam.updateProjectionMatrix();
      // the box's middle on the ground under the camera, held to whole texels in the light's view so the edges do not crawl
      const up = Math.abs(L.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const target = new THREE.Vector3(camera.position.x, groundY, camera.position.z);
      cam.position.copy(target).addScaledVector(L, 300 + half * 0.5); cam.up.copy(up); cam.lookAt(target); cam.updateMatrixWorld();
      const snap = new THREE.Vector3().copy(target).applyMatrix4(cam.matrixWorldInverse);
      const dx = snap.x - Math.round(snap.x / texel) * texel, dy = snap.y - Math.round(snap.y / texel) * texel;
      cam.position.add(new THREE.Vector3(-dx, -dy, 0).applyQuaternion(cam.quaternion)); cam.updateMatrixWorld();
      const prev = renderer.getRenderTarget(); renderer.getClearColor(c); const a = renderer.getClearAlpha();
      U.tShadow.value = null; U.uShadowOn.value = 0;   // the casters must not read the map they are drawn into (a feedback loop: WebGL drops the draws)
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(prev); renderer.setClearColor(c, a);
      U.tShadow.value = rt.depthTexture;
      U.uShadowM.value.copy(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      U.uShadowTexel.value = 1 / S; U.uShadowOn.value = 1;
    },
  };
}
