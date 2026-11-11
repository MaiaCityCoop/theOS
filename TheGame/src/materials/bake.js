// The world's materials (materials/*.js), painted once at start by the GPU into tileable textures:
// albedo (gamma 2) + height in A, and normal + roughness in A.
import * as THREE from 'three';
import { MATERIALS } from '../../materials/index.js';

const SIZE = 1024;

const COMMON = /* glsl */ `
uint hI(ivec2 c, uint s){
  uint h = uint(c.x) * 0x9E3779B1u ^ uint(c.y) * 0x85EBCA77u ^ s * 0xC2B2AE3Du;
  h ^= h >> 15; h *= 0x2C1B3C6Du; h ^= h >> 12; h *= 0x297A2D39u; h ^= h >> 15; return h;
}
float h1(vec2 c, vec2 per, uint s){ return float(hI(ivec2(mod(c, per)), s) >> 8) * (1.0 / 16777216.0); }
vec2 h2(vec2 c, vec2 per, uint s){ return vec2(h1(c, per, s), h1(c, per, s + 77u)); }
float pn(vec2 p, vec2 per, uint s){
  vec2 i = floor(p), f = p - i; vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(h1(i, per, s), h1(i + vec2(1, 0), per, s), u.x),
             mix(h1(i + vec2(0, 1), per, s), h1(i + vec2(1, 1), per, s), u.x), u.y);
}
float pfbm(vec2 uv, float per, uint s, int oct){
  float a = 0.5, v = 0.0, n = 0.0;
  for (int i = 0; i < oct; i++) { v += a * pn(uv * per, vec2(per), s + uint(i)); n += a; per *= 2.0; a *= 0.5; }
  return v / n;
}
// F1, F2, the cell's hash
vec3 pvor(vec2 p, float per, uint s){
  vec2 i = floor(p), f = p - i; float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y), c = i + o; float d = length(o + h2(c, vec2(per), s) - f);
    if (d < d1) { d2 = d1; d1 = d; id = h1(c, vec2(per), s + 13u); } else if (d < d2) d2 = d;
  }
  return vec3(d1, d2, id);
}
float fibre(vec2 q, vec2 per, uint s){ return smoothstep(0.66, 0.84, pn(q, per, s)); }
// pebbles of one size: returns dome height, sets the pebble's hash
float pebbles(vec2 uv, float per, uint s, float share, out float id){
  vec3 v = pvor(uv * per, per, s); id = v.z;
  float r = v.z < share ? 0.22 + 0.25 * fract(v.z * 37.0) : 0.0;
  float t = clamp(1.0 - v.x / max(r, 1e-4), 0.0, 1.0);
  return r > 0.0 ? sqrt(t * (2.0 - t)) : 0.0;
}
`;

// one material's tile, painted: its albedo (gamma 2) and height, or its normal and roughness
function program(m, normalPass) {
  return new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    vertexShader: `out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `in vec2 vUv;\n${COMMON}
void mat(vec2 uv, out float h, out vec3 col, out float rough){
${m.paint}
}
void main(){
  float h, r; vec3 c; mat(vUv, h, c, r);
#if ${normalPass ? 1 : 0}
  float e = 1.0 / ${SIZE}.0, hx, hy; vec3 c2; float r2;
  mat(vUv + vec2(e, 0.0), hx, c2, r2); mat(vUv + vec2(0.0, e), hy, c2, r2);
  vec3 n = normalize(vec3((h - hx) / e, (h - hy) / e, 1.0 / ${m.bump.toFixed(4)}));
  gl_FragColor = vec4(n * 0.5 + 0.5, r);
#else
  gl_FragColor = vec4(sqrt(clamp(c, 0.0, 1.0)), clamp(h, 0.0, 1.0));
#endif
}`,
  });
}

/** Bakes every material of the library (materials/index.js), in its order; returns { a: [albedo…], n: [normal…], of(id) }. */
export function bakeTextures(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const out = { a: [], n: [] };
  for (const m of MATERIALS) for (const pass of ['a', 'n']) {
    const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: aniso, colorSpace: THREE.NoColorSpace,
    });
    quad.material = program(m, pass === 'n');
    renderer.setRenderTarget(rt);
    renderer.render(quad, cam);
    quad.material.dispose();
    out[pass].push(rt.texture);
  }
  renderer.setRenderTarget(null);
  quad.geometry.dispose();
  out.of = (id) => { const i = MATERIALS.findIndex((m) => m.id === id); return { a: out.a[i], n: out.n[i] }; };   // a material's two textures, by its id
  return out;
}
