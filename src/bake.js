// The ground's materials, painted once at start by the GPU into tileable textures:
// albedo (gamma 2) + height in A, and normal + roughness in A.
import * as THREE from 'three';

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

const MATS = /* glsl */ `
void mat(vec2 uv, out float h, out vec3 col, out float rough){
#if MAT == 0 // meadow floor: dark soil under a thatch of dead and green strands
  float soil = pfbm(uv, 6.0, 1u, 5), grain = pn(uv * 160.0, vec2(160.0), 9u);
  vec2 a = uv, b = uv.yx, c = vec2(uv.x + uv.y, uv.x - uv.y), d = vec2(uv.x - uv.y, uv.x + uv.y), e = vec2(2.0 * uv.x + uv.y, uv.x - 2.0 * uv.y);
  float f1 = fibre(a * vec2(11.0, 170.0), vec2(11.0, 170.0), 2u), f2 = fibre(b * vec2(13.0, 150.0), vec2(13.0, 150.0), 3u);
  float f3 = fibre(c * vec2(9.0, 120.0), vec2(9.0, 120.0), 4u), f4 = fibre(d * vec2(8.0, 110.0), vec2(8.0, 110.0), 5u);
  float f5 = fibre(e * vec2(6.0, 70.0), vec2(6.0, 70.0), 6u);
  float fib = max(max(f1, f2), max(max(f3, f4), f5));
  float tone = pn(uv * 5.0, vec2(5.0), 7u);
  vec3 straw = mix(vec3(0.30, 0.24, 0.11), vec3(0.20, 0.17, 0.09), tone);
  vec3 green = vec3(0.07, 0.13, 0.03);
  vec3 fc = mix(straw, green, step(0.5, fract(f1 * 3.0 + f3 * 5.0 + f4 * 7.0 + tone * 2.0)));
  h = soil * 0.45 + grain * 0.12 + fib * 0.43;
  col = mix(mix(vec3(0.035, 0.025, 0.016), vec3(0.085, 0.06, 0.036), soil) * (0.8 + 0.4 * grain), fc, fib * 0.85);
  rough = 0.95;
#elif MAT == 1 // dry earth: cracked plates
  vec2 warp = vec2(pn(uv * 4.0, vec2(4.0), 1u), pn(uv * 4.0, vec2(4.0), 2u)) * 0.5;
  vec3 v = pvor(uv * 7.0 + warp, 7.0, 3u); vec3 v2 = pvor(uv * 19.0 + warp * 2.0, 19.0, 4u);
  float e1 = v.y - v.x, e2 = v2.y - v2.x;
  float crack = 1.0 - smoothstep(0.0, 0.07, e1), fine = (1.0 - smoothstep(0.0, 0.05, e2)) * 0.45;
  float dust = pfbm(uv, 8.0, 5u, 5), grain = pn(uv * 200.0, vec2(200.0), 6u);
  float cr = max(crack, fine);
  h = (1.0 - cr) * (0.62 + 0.12 * smoothstep(0.0, 0.4, e1) + 0.1 * dust) + grain * 0.06;
  col = mix(vec3(0.27, 0.20, 0.125), vec3(0.37, 0.29, 0.185), fract(v.z * 7.0)) * (0.8 + 0.4 * dust) * (0.92 + 0.16 * grain);
  col = mix(col, vec3(0.07, 0.05, 0.03), cr * 0.9);
  rough = 0.9;
#elif MAT == 2 // sand: grains, soft ripples, a few pebbles
  float warp = pn(uv * 3.0, vec2(3.0), 1u);
  float rip = sin(6.2831853 * (uv.x * 7.0 + uv.y * 2.0 + warp * 1.6)) * 0.5 + 0.5;
  float g1 = pn(uv * 256.0, vec2(256.0), 2u), g2 = pn(uv * 90.0, vec2(90.0), 3u), soft = pfbm(uv, 5.0, 4u, 4);
  float id; float pb = pebbles(uv, 22.0, 5u, 0.14, id);
  h = 0.3 + 0.14 * rip + 0.1 * g1 + 0.08 * g2 + 0.1 * soft + pb * 0.3;
  col = mix(vec3(0.42, 0.33, 0.20), vec3(0.56, 0.47, 0.31), soft * 0.6 + rip * 0.25 + g2 * 0.15) * (0.85 + 0.3 * g1);
  col = mix(col, mix(vec3(0.16, 0.15, 0.14), vec3(0.42, 0.37, 0.30), fract(id * 91.0)), step(0.02, pb));
  rough = 0.85;
#elif MAT == 3 // a dirt path: trodden earth full of pebbles
  float dirt = pfbm(uv, 7.0, 1u, 5), grain = pn(uv * 180.0, vec2(180.0), 2u);
  float i1, i2, i3;
  float p1 = pebbles(uv, 13.0, 3u, 0.5, i1), p2 = pebbles(uv, 31.0, 4u, 0.55, i2), p3 = pebbles(uv, 67.0, 5u, 0.6, i3);
  float pb = max(p1, max(p2 * 0.6, p3 * 0.3));
  float id = p1 >= max(p2 * 0.6, p3 * 0.3) ? i1 : (p2 * 0.6 >= p3 * 0.3 ? i2 : i3);
  h = 0.25 + 0.2 * dirt + 0.06 * grain + pb * 0.5;
  col = mix(vec3(0.085, 0.058, 0.035), vec3(0.19, 0.135, 0.08), dirt) * (0.85 + 0.3 * grain);
  vec3 pc = mix(mix(vec3(0.13, 0.125, 0.12), vec3(0.38, 0.36, 0.33), fract(id * 53.0)), vec3(0.33, 0.24, 0.16), step(0.7, fract(id * 17.0)));
  col = mix(col, pc * (0.6 + 0.4 * pb), step(0.03, pb));
  rough = 0.9;
#elif MAT == 4 // rock: ridges, strata, cracks, lichen
  float rid = 0.0, a = 0.5, per = 4.0;
  for (int i = 0; i < 6; i++) { rid += a * (1.0 - abs(2.0 * pn(uv * per, vec2(per), 1u + uint(i)) - 1.0)); per *= 2.0; a *= 0.5; }
  float warp = pfbm(uv, 3.0, 9u, 3);
  float strata = sin(6.2831853 * (uv.y * 9.0 + warp * 3.0)) * 0.5 + 0.5;
  vec3 v = pvor(uv * 5.0 + warp, 5.0, 12u); float crack = 1.0 - smoothstep(0.0, 0.035, v.y - v.x);
  float grain = pn(uv * 220.0, vec2(220.0), 13u), lich = smoothstep(0.62, 0.72, pfbm(uv, 9.0, 14u, 3));
  h = rid * 0.6 + strata * 0.15 + grain * 0.07 - crack * 0.35 + 0.15;
  col = mix(vec3(0.12, 0.115, 0.11), vec3(0.27, 0.26, 0.24), rid) * mix(vec3(1.0, 0.94, 0.86), vec3(0.9, 0.96, 1.0), strata) * (0.85 + 0.3 * grain);
  col = mix(col, vec3(0.03), crack * 0.8);
  col = mix(col, vec3(0.33, 0.35, 0.22), lich * 0.6);
  rough = 0.8;
#elif MAT == 6 // grass seen as a carpet: blades as strokes, light on dark; kept grey, the land tints it
  vec2 a = uv, b = uv.yx, c = vec2(uv.x + uv.y, uv.x - uv.y), d = vec2(uv.x - uv.y, uv.x + uv.y), e = vec2(2.0 * uv.x + uv.y, uv.x - 2.0 * uv.y), f = vec2(uv.x + 2.0 * uv.y, 2.0 * uv.x - uv.y);
  float s1 = smoothstep(0.5, 0.78, pn(a * vec2(22.0, 190.0), vec2(22.0, 190.0), 2u)), s2 = smoothstep(0.5, 0.78, pn(b * vec2(26.0, 170.0), vec2(26.0, 170.0), 3u));
  float s3 = smoothstep(0.5, 0.78, pn(c * vec2(17.0, 140.0), vec2(17.0, 140.0), 4u)), s4 = smoothstep(0.5, 0.78, pn(d * vec2(15.0, 130.0), vec2(15.0, 130.0), 5u));
  float s5 = smoothstep(0.5, 0.78, pn(e * vec2(11.0, 90.0), vec2(11.0, 90.0), 6u)), s6 = smoothstep(0.5, 0.78, pn(f * vec2(10.0, 80.0), vec2(10.0, 80.0), 7u));
  float top = max(max(s1, s2), max(max(s3, s4), max(s5, s6))), under = (s1 + s2 + s3 + s4 + s5 + s6) / 6.0;
  float clump = pfbm(uv, 4.0, 21u, 4), tone = pn(uv * 9.0, vec2(9.0), 22u);
  h = clamp(0.12 + 0.5 * top + 0.5 * under + 0.45 * (clump - 0.5), 0.0, 1.0);
  col = vec3(0.12 + 0.62 * h) * mix(vec3(1.0, 1.0, 0.82), vec3(0.86, 1.0, 0.9), tone);
  rough = 0.9;
#else // water: ripples (the albedo pass keeps foam in rgb)
  float n1 = pfbm(uv, 5.0, 1u, 4), n2 = pfbm(uv + 0.37, 11.0, 2u, 3);
  h = n1 * 0.6 + (1.0 - abs(2.0 * n2 - 1.0)) * 0.4;
  vec3 v = pvor(uv * 9.0 + vec2(n1, n2) * 0.8, 9.0, 3u); vec3 v2 = pvor(uv * 23.0, 23.0, 4u);
  float foam = (1.0 - smoothstep(0.0, 0.16, v.y - v.x)) * 0.8 + (1.0 - smoothstep(0.0, 0.2, v2.y - v2.x)) * 0.5;
  col = vec3(clamp(foam * (0.5 + pfbm(uv, 6.0, 5u, 3)), 0.0, 1.0)); col *= col;
  rough = 0.05;
#endif
}
`;

const BUMP = [0.014, 0.014, 0.007, 0.016, 0.035, 0.02, 0.02];

function program(mat, normalPass) {
  return new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    vertexShader: `out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `#define MAT ${mat}\nin vec2 vUv;\n${COMMON}${MATS}
void main(){
  float h, r; vec3 c; mat(vUv, h, c, r);
#if ${normalPass ? 1 : 0}
  float e = 1.0 / ${SIZE}.0, hx, hy; vec3 c2; float r2;
  mat(vUv + vec2(e, 0.0), hx, c2, r2); mat(vUv + vec2(0.0, e), hy, c2, r2);
  vec3 n = normalize(vec3((h - hx) / e, (h - hy) / e, 1.0 / ${BUMP[mat].toFixed(4)}));
  gl_FragColor = vec4(n * 0.5 + 0.5, r);
#else
  gl_FragColor = vec4(sqrt(clamp(c, 0.0, 1.0)), clamp(h, 0.0, 1.0));
#endif
}`,
  });
}

/** Bakes every material; returns { a: [albedo…], n: [normal…] } (index 5 is the water, 6 the grass as a carpet). */
export function bakeTextures(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const out = { a: [], n: [] };
  for (let m = 0; m < 7; m++) for (const pass of ['a', 'n']) {
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
  return out;
}
