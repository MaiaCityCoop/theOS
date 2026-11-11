// Stones and rock outcrops: a few rock shapes (cut, displaced icospheres at three levels of detail),
// instanced by hashed cells around the camera. Which cell holds a rock, how big, how it lies: hashed.
import * as THREE from 'three';
import { WORLD_GLSL, LIGHT_GLSL } from './world.js';
import { PatchRing, CELL_GLSL } from './rings.js';
import { GROUND_GLSL } from './ground.js';

// ---- shapes ----
function hash3(x, y, z, s) {
  let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ Math.imul(z, 0xC2B2AE3D) ^ Math.imul(s, 0x27D4EB2F);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return (h >>> 8) / 16777216;
}
function noise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t, h = (a, b, c) => hash3(ix + a, iy + b, iz + c, s);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy), l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
function icosphere(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const norm = () => { for (let i = 0; i < v.length; i += 3) { const l = Math.hypot(v[i], v[i + 1], v[i + 2]); v[i] /= l; v[i + 1] /= l; v[i + 2] /= l; } };
  norm();
  for (let d = 0; d < detail; d++) {
    const mid = new Map(), nf = [];
    const m = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      if (!mid.has(k)) { mid.set(k, v.length / 3); v.push((v[a * 3] + v[b * 3]) / 2, (v[a * 3 + 1] + v[b * 3 + 1]) / 2, (v[a * 3 + 2] + v[b * 3 + 2]) / 2); }
      return mid.get(k);
    };
    for (let i = 0; i < f.length; i += 3) { const a = f[i], b = f[i + 1], c = f[i + 2], ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca); }
    f = nf; norm();
  }
  return { v, f };
}
function rockGeometry(detail, seed) {
  const { v, f } = icosphere(detail), n = v.length / 3;
  const cuts = [];
  for (let k = 0; k < 7; k++) {
    let x = hash3(k, 1, 0, seed) - 0.5, y = hash3(k, 2, 0, seed) - 0.5, z = hash3(k, 3, 0, seed) - 0.5; const l = Math.hypot(x, y, z);
    cuts.push([x / l, y / l, z / l, 0.62 + 0.3 * hash3(k, 4, 0, seed)]);
  }
  const P = (x, y, z, out, o) => {
    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    let r = 1 + 0.5 * (noise3(x * 1.4 + 9, y * 1.4, z * 1.4, seed) - 0.5) + 0.22 * (noise3(x * 3.3, y * 3.3 + 5, z * 3.3, seed + 1) - 0.5) + 0.08 * (noise3(x * 8, y * 8, z * 8 + 3, seed + 2) - 0.5);
    for (const c of cuts) { const dt = x * c[0] + y * c[1] + z * c[2]; if (dt > 0.05) { const lim = c[3] / dt; if (lim < r) r = lim + (r - lim) * 0.12; } }
    out[o] = x * r; out[o + 1] = y * r; out[o + 2] = z * r;
  };
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), a = [0, 0, 0], b = [0, 0, 0], e = 0.02;
  for (let i = 0; i < n; i++) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
    P(x, y, z, pos, i * 3);
    // two tangents of the sphere at v
    let tx = -z, ty = 0, tz = x; if (Math.abs(y) > 0.9) { tx = 0; ty = -z; tz = y; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const ux = y * tz - z * ty, uy = z * tx - x * tz, uz = x * ty - y * tx;
    P(x + tx * e, y + ty * e, z + tz * e, a, 0); P(x + ux * e, y + uy * e, z + uz * e, b, 0);
    const ax = a[0] - pos[i * 3], ay = a[1] - pos[i * 3 + 1], az = a[2] - pos[i * 3 + 2], bx = b[0] - pos[i * 3], by = b[1] - pos[i * 3 + 1], bz = b[2] - pos[i * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * x + ny * y + nz * z < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const nl = Math.hypot(nx, ny, nz) || 1; nor[i * 3] = nx / nl; nor[i * 3 + 1] = ny / nl; nor[i * 3 + 2] = nz / nl;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(f);
  return g;
}

const VERT = /* glsl */ `
${WORLD_GLSL}
${GROUND_GLSL}
${CELL_GLSL}
uniform float uNear, uFar, uSizeMin, uSizeMax, uVar, uVars, uBig, uFade;
out vec3 vWorld; out vec3 vN; out float vArid; out float vLy; out vec3 vTint;
vec3 rot(vec3 v, vec3 a, float cs, float sn){ return v * cs + cross(a, v) * sn + a * dot(a, v) * (1.0 - cs); }
void main(){
  ivec2 c = instanceCell();
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (floor(rnd(c, 201u) * uVars) != uVar) return;
  vec2 pos = (vec2(c) + 0.15 + 0.7 * vec2(rnd(c, 202u), rnd(c, 203u))) * uCell;
  float dist = camDist(pos);
  if (dist >= uFar || dist < uNear) return;
  float arid, oc, y; vec3 tint;
#ifdef BIG
  oc = outcropMask(pos);
  if (rnd(c, 200u) > 0.012 + 0.6 * oc) return;       // the cheap test first: most cells hold no rock
  vec3 R = riverR(pos); float w = riverW(pos), d = riverDist(R);
  if (rnd(c, 200u) > (0.012 + 0.6 * oc) * smoothstep(w + 2.0, w + 9.0, d)) return;
  arid = aridMask(pos); y = heightAt(pos, dist, d, w); tint = grassTint(pos, arid).rgb;
#else
  vec4 G = groundA(pos);
  if (rnd(c, 200u) > G.w * 0.7) return;
  arid = G.z; oc = 0.0; y = G.x; tint = groundTint(pos).rgb;
#endif
  float r1 = rnd(c, 204u), r2 = rnd(c, 205u), r3 = rnd(c, 206u), r4 = rnd(c, 207u);
  float s = mix(uSizeMin, uSizeMax, r1 * r1 * r1 + oc * 0.25 * uBig * r1);
  s *= 1.0 - smoothstep(uFade * 0.6, uFade, dist);   // the farthest rocks shrink away, none pops in as a speck
  vec3 scl = s * vec3(0.8 + 0.5 * r2, 0.55 + 0.4 * r3, 0.8 + 0.5 * r4);
  vec3 ax = normalize(vec3(rnd(c, 208u), rnd(c, 209u), rnd(c, 210u)) - 0.5 + 1e-4);
  float ang = rnd(c, 211u) * 6.2831853, cs = cos(ang), sn = sin(ang);
  vec3 l = rot(position * scl, ax, cs, sn);
  vN = rot(normalize(normal / scl), ax, cs, sn);
  y -= 0.22 * s;
  vWorld = vec3(pos.x, y, pos.y) + l;
  vLy = l.y / s; vArid = arid; vTint = tint;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uCam; uniform float uDy;
${LIGHT_GLSL}
uniform sampler2D tA, tN, tM; uniform float uTex;
in vec3 vWorld; in vec3 vN; in float vArid; in float vLy; in vec3 vTint;
void main(){
  vec3 N = normalize(vN), b = pow(abs(N), vec3(4.0)); b /= b.x + b.y + b.z;
  vec3 q = vWorld / uTex;
  vec4 ax = texture(tA, q.zy), ay = texture(tA, q.xz), az = texture(tA, q.xy);
  vec4 nx = texture(tN, q.zy), ny = texture(tN, q.xz), nz = texture(tN, q.xy);
  vec4 a = ax * b.x + ay * b.y + az * b.z; vec3 col = a.rgb * a.rgb;
  vec2 tx = nx.xy * 2.0 - 1.0, ty = ny.xy * 2.0 - 1.0, tz = nz.xy * 2.0 - 1.0;
  vec3 n = normalize(N + (vec3(0.0, tx.y, tx.x) * b.x + vec3(ty.x, 0.0, ty.y) * b.y + vec3(tz.x, tz.y, 0.0) * b.z) * 1.1);
  // moss where the rock looks up, held back where it is dry
  vec4 mt = texture(tM, q.xz * 1.7);
  float moss = smoothstep(0.45, 0.8, N.y * 0.75 + (a.a - 0.5) * 0.7 + (mt.a - 0.5) * 0.5) * (1.0 - vArid * 0.85);
  col = mix(col, vTint * 0.75 * (0.5 + mt.a), moss * 0.9);
  col *= mix(0.45, 1.0, smoothstep(-0.25, 0.35, vLy));   // darker where it meets the ground
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 V = normalize(uCam - vWorld);
  col = col * (uAmb + uSun * ndl) + uSun * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 30.0) * 0.06 * (1.0 - moss);
  gl_FragColor = toScreen(haze(col, length(uCam - vWorld)));
}`;

export function createRocks(scene, U, tex) {
  const rings = [];
  const layer = (big, cell, sizeMin, sizeMax, texScale, vars, lods) => {
    for (let v = 0; v < vars; v++) lods.forEach((L, li) => {
      const g = rockGeometry(L.detail, (big ? 100 : 200) + v * 7);
      g.instanceCount = L.P * L.P;
      const mat = new THREE.ShaderMaterial({
        vertexShader: (big ? '#define BIG\n' : '') + VERT, fragmentShader: FRAG,
        uniforms: {
          ...U, uCell: { value: cell }, uP: { value: L.P }, uNear: { value: li ? lods[li - 1].far : -1 }, uFar: { value: L.far },
          uSizeMin: { value: sizeMin }, uSizeMax: { value: sizeMax }, uVar: { value: v }, uVars: { value: vars }, uFade: { value: lods[lods.length - 1].far }, uBig: { value: big ? 1 : 0 },
          tA: { value: tex.a[4] }, tN: { value: tex.n[4] }, tM: { value: tex.a[0] }, uTex: { value: texScale },
        },
      });
      rings.push(new PatchRing(scene, g, mat, { patch: cell * L.P, near: li ? lods[li - 1].far : 0, far: L.far, pad: big ? 30 : 6, order: 1 }));
    });
  };
  layer(false, 2.2, 0.07, 0.55, 1.1, 1, [{ detail: 2, P: 8, far: 12 }, { detail: 1, P: 16, far: 50 }, { detail: 0, P: 32, far: 110 }]);
  layer(true, 20, 0.7, 4.2, 3.0, 1, [{ detail: 3, P: 4, far: 60 }, { detail: 2, P: 8, far: 250 }, { detail: 1, P: 16, far: 600 }, { detail: 0, P: 32, far: 1100 }]);
  return { rings, update(cx, cz, dy) { for (let i = 0; i < rings.length; i++) rings[i].update(cx, cz, dy); } };
}
