// The land, as one function of (x, z): the same integer-hash noise in JS (the walker's feet)
// and in GLSL (the GPU's ground). Every constant the two share is written once, here.

export const OCT_LAM = [700, 300, 140, 65, 30, 14, 6, 2.5];
export const OCT_AMP = [22, 12, 5.5, 2.4, 1.0, 0.42, 0.16, 0.05];
export const HMIN = -60, HMAX = 70;
export const WATER_DROP = 0.2;

// ---------- JS ----------
function hashI(x, y, s) {
  let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ Math.imul(s, 0xC2B2AE3D);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D);
  h ^= h >>> 12; h = Math.imul(h, 0x297A2D39);
  h ^= h >>> 15;
  return h >>> 0;
}
const rnd = (x, y, s) => (hashI(x, y, s) >>> 8) / 16777216;
const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

let gx = 0, gy = 0; // noised's gradient
function noised(px, py, s) {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const a = rnd(ix, iy, s), b = rnd(ix + 1, iy, s), c = rnd(ix, iy + 1, s), d = rnd(ix + 1, iy + 1, s);
  const k = a - b - c + d;
  gx = dux * (b - a + k * uy); gy = duy * (c - a + k * ux);
  return a + (b - a) * ux + (c - a) * uy + k * ux * uy;
}
function vnoise(px, py, s) {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = rnd(ix, iy, s), b = rnd(ix + 1, iy, s), c = rnd(ix, iy + 1, s), d = rnd(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** The river's field at (x, z): r (0 on the stream's line), its gradient, the distance d and half-width w. */
export const river = { r: 0, gx: 0, gz: 0, d: 0, w: 0 };
export function riverAt(x, z) {
  const n1 = noised(x / 1600, z / 1600, 40), g1x = gx, g1y = gy;
  const n2 = noised(x / 330 + 17.3, z / 330 + 17.3, 41);
  river.r = (n1 - 0.5) + 0.28 * (n2 - 0.5);
  river.gx = g1x / 1600 + 0.28 * gx / 330;
  river.gz = g1y / 1600 + 0.28 * gy / 330;
  river.d = Math.abs(river.r) / Math.max(Math.hypot(river.gx, river.gz), 2e-4);
  river.w = 6.75 + 4.5 * sstep(0.3, 0.7, vnoise(x / 170, z / 170, 42)); // half-width: 3 to 5 times the first stream's
  return river;
}
export function baseB(x, z) {
  return 40 * (vnoise(x / 2600, z / 2600, 11) - 0.5) + 14 * (vnoise(x / 900 + 3.7, z / 900 + 3.7, 12) - 0.5);
}
/** The ground's height under (x, z), at full detail (what the GPU draws under the camera). */
export function heightAt(x, z) {
  const { d, w } = riverAt(x, z);
  const m = sstep(w, w + 80, d), mm = 0.35 + 0.65 * m;
  let h = 0, qx = x, qy = z;
  for (let i = 0; i < 8; i++) {
    const t = 0.8 * qx - 0.6 * qy; qy = 0.6 * qx + 0.8 * qy; qx = t;
    const lam = OCT_LAM[i], o = i * 7.31;
    h += OCT_AMP[i] * (vnoise(qx / lam + o, qy / lam + o, 20 + i) - 0.5) * (i >= 6 ? mm : m);
  }
  const bank = 0.3 * sstep(w, w + 5, d);
  const carve = 1.2 * (1 - sstep(w * 0.55, w * 1.1, d));
  return baseB(x, z) + h + m * 3 + bank - carve;
}

export function aridAt(x, z) {
  return sstep(0.50, 0.66, vnoise(x / 700, z / 700, 50) + 0.3 * (vnoise(x / 150, z / 150, 51) - 0.5));
}

// ---------- GLSL ----------
const fl = (a) => a.map((v) => v.toFixed(3)).join(', ');
export const WORLD_GLSL = /* glsl */ `
uniform vec3 uCam;
uniform float uDy;
const float WATER_DROP = ${WATER_DROP.toFixed(3)};
const float LAM[8] = float[8](${fl(OCT_LAM)});
const float AMP[8] = float[8](${fl(OCT_AMP)});

float camDist(vec2 p){ vec2 d = p - uCam.xz; return sqrt(dot(d, d) + uDy * uDy); }

uint hashI(ivec2 c, uint s){
  uint h = uint(c.x) * 0x9E3779B1u ^ uint(c.y) * 0x85EBCA77u ^ s * 0xC2B2AE3Du;
  h ^= h >> 15; h *= 0x2C1B3C6Du;
  h ^= h >> 12; h *= 0x297A2D39u;
  h ^= h >> 15;
  return h;
}
float rnd(ivec2 c, uint s){ return float(hashI(c, s) >> 8) * (1.0 / 16777216.0); }

vec3 noised(vec2 p, uint s){
  vec2 i = floor(p), f = p - i; ivec2 c = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = rnd(c, s), b = rnd(c + ivec2(1, 0), s), cc = rnd(c + ivec2(0, 1), s), d = rnd(c + ivec2(1, 1), s);
  float k = a - b - cc + d;
  return vec3(a + (b - a) * u.x + (cc - a) * u.y + k * u.x * u.y, du * vec2(b - a + k * u.y, cc - a + k * u.x));
}
float vnoise(vec2 p, uint s){
  vec2 i = floor(p), f = p - i; ivec2 c = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = rnd(c, s), b = rnd(c + ivec2(1, 0), s), cc = rnd(c + ivec2(0, 1), s), d = rnd(c + ivec2(1, 1), s);
  return a + (b - a) * u.x + (cc - a) * u.y + (a - b - cc + d) * u.x * u.y;
}

// The stream: the zero line of r. (r, its gradient per metre)
vec3 riverR(vec2 p){
  vec3 n1 = noised(p * (1.0 / 1600.0), 40u);
  vec3 n2 = noised(p * (1.0 / 330.0) + 17.3, 41u);
  return vec3((n1.x - 0.5) + 0.28 * (n2.x - 0.5), n1.yz * (1.0 / 1600.0) + 0.28 * n2.yz * (1.0 / 330.0));
}
float riverDist(vec3 R){ return abs(R.x) / max(length(R.yz), 2e-4); }
float riverW(vec2 p){ return 6.75 + 4.5 * smoothstep(0.3, 0.7, vnoise(p * (1.0 / 170.0), 42u)); }
float riverCarve(float d, float w){ return 1.2 * (1.0 - smoothstep(w * 0.55, w * 1.1, d)); }

float baseB(vec2 p){
  return 40.0 * (vnoise(p * (1.0 / 2600.0), 11u) - 0.5) + 14.0 * (vnoise(p * (1.0 / 900.0) + 3.7, 12u) - 0.5);
}
// dist fades each octave out before the grid at that distance is too coarse to carry it.
float heightAt(vec2 p, float dist, float d, float w){
  float m = smoothstep(w, w + 80.0, d), mm = mix(0.35, 1.0, m);
  float h = 0.0; vec2 q = p;
  for (int i = 0; i < 8; i++) {
    q = vec2(0.8 * q.x - 0.6 * q.y, 0.6 * q.x + 0.8 * q.y);
    float lam = LAM[i];
    if (dist < lam * 19.2) {
      float f = 1.0 - smoothstep(lam * 9.6, lam * 19.2, dist);
      h += AMP[i] * (vnoise(q / lam + float(i) * 7.31, 20u + uint(i)) - 0.5) * f * (i >= 6 ? mm : m);
    }
  }
  float bank = 0.3 * smoothstep(w, w + 5.0, d);
  float carve = riverCarve(d, w);
  return baseB(p) + h + m * 3.0 + bank - carve;
}

// ---- what grows where ----
float aridMask(vec2 p){
  return smoothstep(0.50, 0.66, vnoise(p * (1.0 / 700.0), 50u) + 0.3 * (vnoise(p * (1.0 / 150.0), 51u) - 0.5));
}
vec3 pathN(vec2 p){ vec3 n = noised(p * (1.0 / 260.0) + 5.1, 60u); return vec3(n.x, n.yz * (1.0 / 260.0)); }
float pathMask(vec3 P){ return 1.0 - smoothstep(0.45, 0.95, abs(P.x - 0.5) / max(length(P.yz), 1e-3)); }
float bareMask(vec2 p){
  return smoothstep(0.60, 0.70, vnoise(p * (1.0 / 8.0), 70u) * 0.7 + vnoise(p * (1.0 / 2.1) + 4.4, 71u) * 0.3);
}
float bankMask(float d, float w){ return 1.0 - smoothstep(w * 1.15, w * 1.15 + 2.2, d); }
float tuftMask(vec2 p){ return smoothstep(0.45, 0.7, vnoise(p * (1.0 / 28.0), 72u)); }
float outcropMask(vec2 p){ return smoothstep(0.60, 0.72, vnoise(p * (1.0 / 230.0), 74u)); }
// rgb: the grass's colour here; a: how dry
vec4 grassTintAB(float a, float b, float arid);
vec4 grassTint(vec2 p, float arid){
  return grassTintAB(vnoise(p * (1.0 / 37.0), 80u), vnoise(p * (1.0 / 11.0) + 9.1, 81u), arid);
}
vec4 grassTintAB(float a, float b, float arid){
  vec3 c = mix(vec3(0.050, 0.115, 0.022), vec3(0.135, 0.19, 0.04), smoothstep(0.3, 0.75, a * 0.7 + b * 0.3));
  float dry = clamp(arid * 0.9 + smoothstep(0.55, 0.9, b * 0.6 + a * 0.4) * 0.4, 0.0, 1.0);
  return vec4(mix(c, vec3(0.36, 0.29, 0.12), dry), dry);
}
`;

export const LIGHT_GLSL = /* glsl */ `
uniform vec3 uSunDir, uSun, uAmb, uSky;
vec4 toScreen(vec3 c){ c = 1.0 - exp(-c * 1.25); return vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }
`;
