// The ground under the camera, written by the GPU into one small texture: 256 m square, a texel
// every 0.5 m (the terrain's own nearest vertices). Blades and stones read their height, density
// and colour from it instead of working the land's noise out again at every vertex. It is drawn
// again, whole (two 512² passes, under a millisecond), each time the camera has walked 8 m.
import * as THREE from 'three';
import { WORLD_GLSL } from './world.js';

const N = 512, TEXEL = 0.5, SNAP = 8;

const FRAG = /* glsl */ `
${WORLD_GLSL}
uniform vec2 uGO;
void main(){
  vec2 pos = uGO + floor(gl_FragCoord.xy) * ${TEXEL.toFixed(1)};
  vec3 R = riverR(pos); float w = riverW(pos), d = riverDist(R);
  float arid = aridMask(pos);
#ifdef TINT
  vec4 t = grassTint(pos, arid);
  gl_FragColor = vec4(sqrt(t.rgb), t.a);
#else
  float path = pathMask(pathN(pos)), oc = outcropMask(pos);
  float dens = (1.0 - path) * (1.0 - bankMask(d, w)) * (1.0 - bareMask(pos)) * (1.0 - oc * 0.5) * mix(1.0, 0.45 * tuftMask(pos), arid);
  float stone = (0.07 + 0.3 * arid + 0.45 * (1.0 - smoothstep(w * 0.6, w + 4.0, d)) + 0.5 * oc) * (1.0 - path * 0.8);
  gl_FragColor = vec4(heightAt(pos, camDist(pos), d, w), dens, arid, stone);
#endif
}`;

// for the shaders that read it
export const GROUND_GLSL = /* glsl */ `
uniform sampler2D tGA, tGB; uniform vec2 uGO;
vec4 groundA(vec2 pos){ // height, grass density, arid, stone chance
  vec2 f = clamp((pos - uGO) * ${(1 / TEXEL).toFixed(1)}, 0.0, ${(N - 1.001).toFixed(3)}), i = floor(f), t = f - i; ivec2 c = ivec2(i);
  return mix(mix(texelFetch(tGA, c, 0), texelFetch(tGA, c + ivec2(1, 0), 0), t.x),
             mix(texelFetch(tGA, c + ivec2(0, 1), 0), texelFetch(tGA, c + ivec2(1, 1), 0), t.x), t.y);
}
vec4 groundTint(vec2 pos){ vec4 t = texture(tGB, ((pos - uGO) * ${(1 / TEXEL).toFixed(1)} + 0.5) / ${N}.0); return vec4(t.rgb * t.rgb, t.a); }
`;

export function createGround(renderer, U) {
  const rtA = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
  const rtB = new THREE.WebGLRenderTarget(N, N, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  U.uGO = { value: new THREE.Vector2(1e9, 1e9) }; U.tGA = { value: rtA.texture }; U.tGB = { value: rtB.texture };
  const vs = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const mk = (def) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: def + FRAG, uniforms: { uCam: U.uCam, uDy: U.uDy, uGO: U.uGO }, depthTest: false, depthWrite: false });
  const mA = mk(''), mB = mk('#define TINT\n');
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mA), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quad.frustumCulled = false;
  let lastDy = -1;
  return {
    update(cx, cz, dy) {
      const ox = Math.round(cx / SNAP) * SNAP - N * TEXEL / 2, oz = Math.round(cz / SNAP) * SNAP - N * TEXEL / 2, o = U.uGO.value;
      if (ox === o.x && oz === o.y && Math.abs(dy - lastDy) < 4) return;
      if (dy > 160 && lastDy > 160) return; // too high up for anything that reads it
      o.set(ox, oz); lastDy = dy;
      quad.material = mA; renderer.setRenderTarget(rtA); renderer.render(quad, cam);
      quad.material = mB; renderer.setRenderTarget(rtB); renderer.render(quad, cam);
      renderer.setRenderTarget(null);
    },
  };
}
