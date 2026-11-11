// The ground under the camera, written by the GPU into one small texture: 256 m square, a texel
// every 0.5 m (the terrain's own nearest vertices). Blades and stones read their height, density
// and colour from it instead of working the land's noise out again at every vertex. It is drawn
// again, whole (two 512² passes, under a millisecond), each time the camera has walked 8 m.
import * as THREE from 'three';
import { WORLD_GLSL, heightAt } from '../world.js';
import { PLACES } from '../world/places.js';
import { SAND } from '../world/land.js';
import { BIOMES } from '../../biomes/index.js';

const N = 512;   // texels a side; a texel is 0.5 m to the 68° lens and grows with a longer one, so the texture always covers the blades' reach

const FRAG = /* glsl */ `
${WORLD_GLSL}
uniform vec2 uGO; uniform float uGBase, uGTexel; uniform vec2 uTent; uniform float uTentR; uniform vec3 uStage;
void main(){
  vec2 pos = uGO + floor(gl_FragCoord.xy) * uGTexel;
  vec3 R = riverR(pos); float w = riverW(pos), d = riverDist(R);
  float arid = placeArid(pos, aridMask(pos));
#ifdef TINT
  vec4 t = grassTint(pos, arid);
  if (uStage.z > 0.0) t = mix(vec4(0.30, 0.24, 0.15, 1.0), t, smoothstep(uStage.z - 0.5, uStage.z + 0.7, length(pos - uStage.xy)));   // the stage: dry, bare earth
  gl_FragColor = vec4(sqrt(t.rgb), t.a);
#else
  float path = placeOff(pos, pathMask(pathN(pos))), oc = placeOff(pos, outcropMask(pos));
  float dens = (1.0 - path) * (1.0 - placeBank(pos, bankMask(d, w))) * (1.0 - placeOff(pos, bareMask(pos))) * (1.0 - oc * 0.25) * mix(1.0, ARID_COVER * tuftMask(pos), arid);
  dens *= smoothstep(uTentR - 0.4, uTentR + 0.3, length(pos - uTent));   // the tent's floor is kept clear, right to its walls
  float bare = uStage.z > 0.0 ? smoothstep(uStage.z - 0.5, uStage.z + 0.7, length(pos - uStage.xy)) : 1.0;   // the library's stage: a round of bare ground
  dens *= bare;
  float stone = smoothstep(uTentR - 0.4, uTentR + 0.3, length(pos - uTent)) * (LAND_STONES + ARID_STONES * arid + BANK_STONES * placeBank(pos, 1.0 - smoothstep(w * 0.6, w + 4.0, d)) + 0.5 * oc) * (1.0 - path * 0.8);
  stone *= bare;
  gl_FragColor = vec4(heightAt(pos, camDist(pos), d, w) - uGBase, dens, arid, stone);   // heights from a base near by: small numbers keep a half float exact to the centimetre
#endif
}`;

// for the shaders that read it
export const GROUND_GLSL = /* glsl */ `
uniform sampler2D tGA, tGB; uniform vec2 uGO; uniform float uGBase, uGTexel;
vec4 groundA(vec2 pos){ // height, grass density, arid, stone chance: one filtered read
  vec4 g = textureLod(tGA, ((pos - uGO) / uGTexel + 0.5) / ${N}.0, 0.0); g.x += uGBase; return g;
}
vec4 groundTint(vec2 pos){ vec4 t = texture(tGB, ((pos - uGO) / uGTexel + 0.5) / ${N}.0); return vec4(t.rgb * t.rgb, t.a); }
`;

export function createGround(renderer, U) {
  const rtA = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  const rtB = new THREE.WebGLRenderTarget(N, N, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  U.uGO = { value: new THREE.Vector2(1e9, 1e9) }; U.uGBase = { value: 0 }; U.uGTexel = { value: 0.5 }; U.tGA = { value: rtA.texture }; U.tGB = { value: rtB.texture };
  const vs = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`, stage = (U.uStage = { value: new THREE.Vector3(0, 0, 0) });   // (x, z, radius); radius 0: no stage. Shared: the terrain lays bare earth there too
  const mk = (def) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: def + FRAG, uniforms: { uCam: U.uCam, uDy: U.uDy, uLodInv: U.uLodInv, uGO: U.uGO, uGBase: U.uGBase, uGTexel: U.uGTexel, tNoise: U.tNoise, uSand: U.uSand, uTent: { value: new THREE.Vector2(PLACES.tent.x, PLACES.tent.z) }, uTentR: { value: PLACES.tent.clear || 2.7 }, uStage: stage }, depthTest: false, depthWrite: false });
  const mA = mk(''), mB = mk('#define TINT\n');
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mA), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quad.frustumCulled = false;
  let lastDy = -1, lastS = 0;
  return {
    /** The library's stage: a round of bare ground at (x, z), r metres across the middle; r 0 takes it away. */
    stage(x, z, r) { stage.value.set(x, z, r); lastS = 0; },
    /** The library's sandbox: round (x, z) the land is all one biome (its number in biomes/); no arguments: off. */
    sandbox(x = 0, z = 0, biome = -1) { U.uSand.value.set(x, z, biome < 0 ? 0 : 1, biome); Object.assign(SAND, { on: biome >= 0, x, z, river: BIOMES[biome]?.where === 'water' }); lastS = 0; },
    /** s: the lens factor; the texture is drawn again when the camera has walked 16 texels, or the lens changed */
    update(cx, cz, dy, s) {
      const TEXEL = 0.5 * s, SNAP = 16 * TEXEL;
      const ox = Math.round(cx / SNAP) * SNAP - N * TEXEL / 2, oz = Math.round(cz / SNAP) * SNAP - N * TEXEL / 2, o = U.uGO.value;
      if (ox === o.x && oz === o.y && Math.abs(dy - lastDy) < 4 && s === lastS) return;
      if (dy > 160 * s && lastDy > 160 * s && s === lastS) return; // too high up for anything that reads it
      o.set(ox, oz); lastDy = dy; lastS = s; U.uGTexel.value = TEXEL; U.uGBase.value = Math.round(heightAt(ox + N * TEXEL / 2, oz + N * TEXEL / 2));
      quad.material = mA; renderer.setRenderTarget(rtA); renderer.render(quad, cam);
      quad.material = mB; renderer.setRenderTarget(rtB); renderer.render(quad, cam);
      renderer.setRenderTarget(null);
    },
  };
}
