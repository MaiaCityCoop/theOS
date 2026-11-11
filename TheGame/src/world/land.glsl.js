// The land in GLSL: the same functions as world/land.js, constant for constant, so the GPU's ground
// is the walker's ground. Every shader that needs the land starts with this.
import { OCT_LAM, OCT_AMP, WATER_DROP, MEANDER, PADS, PAD_FALL } from './land.js';
import { BIOME_GLSL } from './biomes.glsl.js';

const fl = (a) => a.map((v) => v.toFixed(3)).join(', ');
export const WORLD_GLSL = /* glsl */ `
uniform vec3 uCam;
uniform float uDy, uLodInv;
uniform sampler2D tNoise;   // baked cloudy noise, four of them in rgba
const float WATER_DROP = ${WATER_DROP.toFixed(3)};
${BIOME_GLSL}
const float LAM[8] = float[8](${fl(OCT_LAM)});
const float AMP[8] = float[8](${fl(OCT_AMP)});
const vec4 PAD[${Math.max(1, PADS.length)}] = vec4[${Math.max(1, PADS.length)}](${PADS.length ? PADS.map((p) => `vec4(${p.x.toFixed(3)}, ${p.z.toFixed(3)}, ${p.r.toFixed(3)}, ${p.h.toFixed(4)})`).join(', ') : 'vec4(0.0, 0.0, 0.0, 0.0)'});   // the pads under what stands (x, z, radius, height)

// The one measure every level of detail goes by: distance as a 68° lens would see it. A longer
// lens shows a thing larger, so it counts as nearer by that much (uLodInv is one over that factor).
float camDist(vec2 p){ vec2 d = p - uCam.xz; return sqrt(dot(d, d) + uDy * uDy) * uLodInv; }

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
vec3 riverWorld(vec2 p){
  vec3 n1 = noised(p * (1.0 / 1600.0), 40u);
  vec3 n2 = noised(p * (1.0 / 330.0) + 17.3, 41u);
  return vec3((n1.x - 0.5) + 0.28 * (n2.x - 0.5), n1.yz * (1.0 / 1600.0) + 0.28 * n2.yz * (1.0 / 330.0));
}
// the library's sandbox river (land.js: sandRiver): meandering through the sandbox in place of the world's
vec3 riverR(vec2 p){
  vec3 R = riverWorld(p);
  if (uSand.z <= 0.0 || sandIs(SAND_RIVER) < 0.5) return R;
  vec2 d = p - uSand.xy; float s = sandW(p); if (s <= 0.0) return R;
  float c = cos(${MEANDER.turn.toFixed(4)}), sn = sin(${MEANDER.turn.toFixed(4)}), u = d.x * c + d.y * sn, v = -d.x * sn + d.y * c, k = 6.2831853 / ${MEANDER.wave.toFixed(1)};
  float g = v - ${MEANDER.swing.toFixed(1)} * sin(k * u), gu = -${MEANDER.swing.toFixed(1)} * k * cos(k * u);
  vec2 gr = vec2(gu * c - sn, gu * sn + c) / 1600.0;
  return vec3((g >= 0.0 ? 1.0 : -1.0) * (abs(g) / 1600.0 + (1.0 - s) * 2.0 * length(gr) * 1600.0), gr);
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
  float H = baseB(p) + h + m * 3.0 + bank - carve;
  // pads: the ground levels itself under what is stood on it, as world/land.js does (PADS)
  for (int i = 0; i < ${PADS.length}; i++) { vec4 P = PAD[i]; H = mix(P.w, H, smoothstep(P.z, P.z + ${PAD_FALL.toFixed(1)}, length(p - P.xy))); }
  return H;
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
  vec2 pr = vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y);
  // two sizes that never line up: the noise's own tile does not show as a repeat across the land
  float a = clamp((textureLod(tNoise, p * (1.0 / 150.0), 0.0).r + textureLod(tNoise, pr * (1.0 / 397.0), 0.0).a - 1.0) * 0.8 + 0.5, 0.0, 1.0);
  return grassTintAB(a, textureLod(tNoise, pr * (1.0 / 45.0), 0.0).g, arid);
}
vec4 grassTintAB(float a, float b, float arid){
  vec3 c = mix(LAND_GRASS_A, LAND_GRASS_B, smoothstep(0.1, 0.9, a * 0.65 + b * 0.35));   // the meadow's greens (biomes/meadow.js)
  c = mix(vec3(dot(c, vec3(0.3, 0.6, 0.1))), c, LAND_GRASS_MUTE);   // a real meadow is a muted green
  float dry = clamp(arid * 0.9 + smoothstep(0.6, 1.0, b * 0.6 + a * 0.4) * 0.28, 0.0, 1.0);
  return vec4(mix(c, ARID_GRASS_DRY, dry), dry);   // dried to dry land's colour (biomes/dryland.js)
}
`;
