// The clouds' shadow, drawn once a frame into a small map (256 texels over 6 km) of their layer round the point above the
// camera the sun looks through; every surface then reads its cloud shadow with one fetch (src/world/light.js: cloudShade)
// instead of working the cloud field out for each of its pixels.
import * as THREE from 'three/webgpu';
import { vec2, vec3, vec4, float, uv, positionGeometry } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { cloudLayerShade, CLOUD_H } from './light.js';

const N = 256, SIZE = 6000, TEXEL = SIZE / N;

export function createCloudMap(renderer) {
  const rt = new THREE.RenderTarget(N, N, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  const mat = new THREE.NodeMaterial(); mat.vertexNode = vec4(positionGeometry.xy, 0, 1); mat.depthTest = mat.depthWrite = false;
  // the texel's point on the layer; three's node reads turn a target's rows the other way up, so the writer turns them too
  const q = U.uCloudMap.xy.add(vec2(uv().x, float(1).sub(uv().y)).mul(U.uCloudMap.z));
  mat.colorNode = vec4(vec3(cloudLayerShade(q)), 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false;
  U.tCloudMap.value = rt.texture;
  return {
    rt,
    /** Draw this frame's map: centred where the sun's line from the ground under the camera meets the layer. */
    render(camera, groundY) {
      if (U.uClouds.value < 0.005) return;   // no clouds: nothing reads it
      const s = U.uSunDir.value, k = (CLOUD_H - groundY) / Math.max(s.y, 0.08);
      const cx = Math.round((camera.position.x + s.x * k) / TEXEL) * TEXEL, cz = Math.round((camera.position.z + s.z * k) / TEXEL) * TEXEL;
      U.uCloudMap.value.set(cx - SIZE / 2, cz - SIZE / 2, SIZE);
      const was = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(quad, cam); renderer.setRenderTarget(was);
    },
  };
}
