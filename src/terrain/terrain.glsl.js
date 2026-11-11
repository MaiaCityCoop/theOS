// The ground's shaders. The vertex shader is shared with the water (#define WATER): the same grid,
// the same morph, another height.
import { WORLD_GLSL, LIGHT_GLSL } from '../world.js';

export const VERT = /* glsl */ `
${WORLD_GLSL}
in vec4 aNode; // x, z, size, level
uniform float uGrid, uR0;
out vec3 vWorld; out vec3 vR; out float vW;
#ifndef WATER
out vec3 vN; out vec3 vPth; out float vOut; out float vHill;
#endif
void main(){
  vec2 g = position.xz;
  float cell = aNode.z / uGrid;
  vec2 wp = aNode.xy + g * cell;
  float rng = uR0 * exp2(aNode.w);
  float k = clamp((camDist(wp) - rng * 0.8) / (rng * 0.15), 0.0, 1.0);
  wp = aNode.xy + (g - fract(g * 0.5) * 2.0 * k) * cell;
  float dist = camDist(wp);
  vec3 R = riverR(wp); float w = riverW(wp);
  vR = R; vW = w;
#ifdef WATER
  float h = baseB(wp) - WATER_DROP;
#else
  float h = heightAt(wp, dist, riverDist(R), w);
  float e = max(0.3, dist / 96.0);
  vec2 px = wp + vec2(e, 0.0), pz = wp + vec2(0.0, e);
  float hx = heightAt(px, dist, riverDist(riverR(px)), riverW(px));
  float hz = heightAt(pz, dist, riverDist(riverR(pz)), riverW(pz));
  vN = normalize(vec3(h - hx, e, h - hz));
  vPth = pathN(wp);
  vOut = outcropMask(wp);
  vHill = h - baseB(wp);   // how far this ground stands over the valley's floor
#endif
  vWorld = vec3(wp.x, h, wp.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

export const FRAG = /* glsl */ `
${WORLD_GLSL}
${LIGHT_GLSL}
in vec3 vWorld; in vec3 vR; in float vW;
in vec3 vN; in vec3 vPth; in float vOut; in float vHill;
uniform sampler2D tA0, tA1, tA2, tA3, tA4, tA6, tN0, tN1, tN2, tN3, tN4, tN6;
struct Mat { vec3 c; float h; vec2 n; float r; };
// two takes of the texture, one turned and at another size, mixed by noise: no visible tiling
Mat smp(sampler2D ta, sampler2D tn, vec2 p, vec2 dx, vec2 dy, float T1, float T2, float mx){
  vec2 p2 = vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y);
  vec2 dx2 = vec2(0.6 * dx.x - 0.8 * dx.y, 0.8 * dx.x + 0.6 * dx.y), dy2 = vec2(0.6 * dy.x - 0.8 * dy.y, 0.8 * dy.x + 0.6 * dy.y);
  vec4 a1 = textureGrad(ta, p / T1, dx / T1, dy / T1), a2 = textureGrad(ta, p2 / T2, dx2 / T2, dy2 / T2);
  vec4 n1 = textureGrad(tn, p / T1, dx / T1, dy / T1), n2 = textureGrad(tn, p2 / T2, dx2 / T2, dy2 / T2);
  vec2 q = n2.xy * 2.0 - 1.0; q = vec2(0.6 * q.x + 0.8 * q.y, -0.8 * q.x + 0.6 * q.y);
  float k = smoothstep(0.35, 0.65, mx + (a2.a - a1.a) * 0.3);
  Mat m; m.c = mix(a1.rgb * a1.rgb, a2.rgb * a2.rgb, k); m.h = mix(a1.a, a2.a, k);
  m.n = mix(n1.xy * 2.0 - 1.0, q, k); m.r = mix(n1.a, n2.a, k);
  return m;
}
// the higher material wins at the seam
Mat hblend(Mat a, Mat b, float t){
  float k = clamp((t - 0.5) * 3.0 + 0.5 + (b.h - a.h) * 0.8, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
  Mat m; m.c = mix(a.c, b.c, k); m.h = mix(a.h, b.h, k); m.n = mix(a.n, b.n, k); m.r = mix(a.r, b.r, k);
  return m;
}
void main(){
  vec2 p = vWorld.xz, dx = dFdx(p), dy = dFdy(p);
  float rdist = length(vWorld - uCam), dist = rdist * uLodInv;   // the true distance (for the air), and the lens's (for detail)
  // every noise is let go before it is finer than a pixel: far away it would only shimmer
  float mx = dist < 140.0 ? mix(vnoise(p * (1.0 / 5.3), 90u), 0.5, smoothstep(50.0, 140.0, dist)) : 0.5;
  // the land's colour variation is read from the baked cloudy noise: no grid in it, and its mips let it go by themselves
  vec2 pr = vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y);
  float m1 = texture(tNoise, vec2(0.8 * p.x + 0.6 * p.y, -0.6 * p.x + 0.8 * p.y) * (1.0 / 97.0) + 0.37).b - 0.5, m2 = texture(tNoise, pr * (1.0 / 700.0)).a - 0.5, m3 = texture(tNoise, p * (1.0 / 4500.0) + 0.11).r - 0.5;
  float macro = 1.0 + 0.16 * m1 + 0.20 * m2 + 0.18 * m3;
  // what grows here is worked out per pixel (per vertex it went blocky far away), each noise again let go in time
  float vArid = smoothstep(0.50, 0.66, vnoise(p * (1.0 / 700.0), 50u) + 0.3 * (vnoise(p * (1.0 / 150.0), 51u) - 0.5) * (1.0 - smoothstep(3000.0, 8000.0, dist)));
  float ta = clamp((texture(tNoise, p * (1.0 / 150.0)).r + texture(tNoise, pr * (1.0 / 397.0)).a - 1.0) * 0.8 + 0.5, 0.0, 1.0), tb = texture(tNoise, pr * (1.0 / 45.0)).g;
  vec4 vTint = grassTintAB(ta, tb, vArid);
  float vTuft = vArid > 0.003 && dist < 900.0 ? mix(tuftMask(p), 0.5, smoothstep(350.0, 900.0, dist)) : 0.5;
  // the grass as a carpet, at three sizes: blades near, tufts further, drifts of them from high up
  vec4 g1 = texture(tA6, p / 1.6), g2 = texture(tA6, pr / 9.6), g3 = texture(tA6, vec2(0.8 * p.x + 0.6 * p.y, -0.6 * p.x + 0.8 * p.y) / 57.0);
  vec4 gn1 = texture(tN6, p / 1.6), gn2 = texture(tN6, pr / 9.6);
  float gk = smoothstep(25.0, 110.0, dist), gk2 = smoothstep(300.0, 1400.0, dist);
  float glum = mix(mix(g1.a, g2.a, gk), mix(g2.a, g3.a, 0.6), gk2);
  vec2 gq = gn2.xy * 2.0 - 1.0; gq = vec2(0.6 * gq.x + 0.8 * gq.y, -0.8 * gq.x + 0.6 * gq.y);
  vec2 gnrm = mix(gn1.xy * 2.0 - 1.0, gq, gk) * (1.0 - 0.7 * gk2);
  float d = riverDist(vR), w = vW;
  float path = pathMask(vPth) * (1.0 - smoothstep(70.0, 220.0, dist));   // a path is a thing of the near ground; from afar it was a drawn line
  float bare = dist < 160.0 ? bareMask(p) * (1.0 - smoothstep(100.0, 160.0, dist)) : 0.0;

  Mat m = smp(tA0, tN0, p, dx, dy, 2.0, 3.2, mx);
  Mat sand; bool haveSand = false; Mat dirt; bool haveDirt = false;
  float bank = clamp(bankMask(d, w) + (m.h - 0.5) * 0.3 * step(0.01, bankMask(d, w)), 0.0, 1.0);
  if (vArid > 0.003) {
    Mat c = smp(tA1, tN1, p, dx, dy, 4.0, 6.4, mx);
    float sp = dist < 1500.0 ? smoothstep(0.55, 0.72, vnoise(p * (1.0 / 45.0), 73u)) * (1.0 - smoothstep(600.0, 1500.0, dist)) : 0.0;
    if (sp > 0.003) { sand = smp(tA2, tN2, p, dx, dy, 2.0, 3.2, mx); haveSand = true; c = hblend(c, sand, sp); }
    m = hblend(m, c, vArid);
  }
  float bd = max(bare * (1.0 - vArid), vOut * 0.25);
  if (bd > 0.003 || path > 0.003) { dirt = smp(tA3, tN3, p, dx, dy, 2.0, 3.2, mx); haveDirt = true; }
  if (bd > 0.003) m = hblend(m, dirt, bd);
  // the grass's own colour over the floor, more of it the farther away: where the blades end, nothing shows
  float cover = (1.0 - bare) * mix(1.0, 0.45 * vTuft, vArid);
  // under the blades the floor is the grass's own colour, in shade: a gap between blades reads as more grass
  float cv = cover * (0.82 + 0.18 * smoothstep(4.0, 60.0, dist));
  m.c = mix(m.c, vTint.rgb * (0.32 + 1.05 * glum) * mix(0.5, 1.0, smoothstep(3.0, 70.0, dist)), cv); m.n = mix(m.n, gnrm * 1.4, cv); m.h = mix(m.h, glum, cv);
  if (path > 0.003) m = hblend(m, dirt, path);
  if (bank > 0.003) { if (!haveSand) sand = smp(tA2, tN2, p, dx, dy, 2.0, 3.2, mx); m = hblend(m, sand, bank); }
  float steep = smoothstep(0.80, 0.68, vN.y);
  if (steep > 0.003) m = hblend(m, smp(tA4, tN4, p, dx, dy, 3.0, 4.8, mx), steep);

  float wet = 1.0 - smoothstep(w * 0.9, w + 2.5, d);
  m.c *= mix(1.0, 0.5, wet);
  vec3 n = normalize(vN + vec3(m.n.x, 0.0, m.n.y) * (1.0 - smoothstep(60.0, 400.0, dist) * 0.7));
  // relief: hollows sit in shade, crowns in light; and slopes facing the sun are lit harder than the plain normal says
  float relief = mix(0.74, 1.1, smoothstep(-6.0, 16.0, vHill));
  float sunl = max(dot(n, uSunDir), 0.0); sunl = mix(sunl, smoothstep(0.55, 0.95, sunl), 0.5 * smoothstep(60.0, 600.0, dist));
  vec3 col = m.c * macro * relief * (uAmb + uSun * sunl);
  vec3 V = normalize(uCam - vWorld);
  col += uSun * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 48.0) * 0.3 * wet;
  gl_FragColor = toScreen(haze(col, rdist));
}`;
