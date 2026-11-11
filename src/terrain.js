// The ground and the water: one fixed grid tile, drawn instanced for every node of a quadtree
// picked around the camera each frame (CDLOD). Heights come from the vertex shader; a node's
// outer vertices morph to the coarser grid, so the levels meet without cracks or pops.
import * as THREE from 'three';
import { WORLD_GLSL, LIGHT_GLSL, HMIN, HMAX, heightAt, riverAt } from './world.js';

const GRID = 16;            // quads per node side
const S0 = 8;               // a level-0 node's side, metres (0.5 m quads)
const R0 = 48;              // level 0's range
const LEVELS = 10;          // the top level reaches R0 * 2^9 = 24.6 km
const CAP = 4096, WCAP = 1024;
const WATER_LEVELS = 6;

const VERT = /* glsl */ `
${WORLD_GLSL}
in vec4 aNode; // x, z, size, level
uniform float uGrid, uR0;
out vec3 vWorld; out vec3 vR; out float vW;
#ifndef WATER
out vec3 vN; out vec3 vPth; out float vOut;
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
#endif
  vWorld = vec3(wp.x, h, wp.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const FRAG = /* glsl */ `
${WORLD_GLSL}
${LIGHT_GLSL}
in vec3 vWorld; in vec3 vR; in float vW;
in vec3 vN; in vec3 vPth; in float vOut;
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
  float dist = length(vWorld - uCam);
  // every noise is let go before it is finer than a pixel: far away it would only shimmer
  float mx = dist < 140.0 ? mix(vnoise(p * (1.0 / 5.3), 90u), 0.5, smoothstep(50.0, 140.0, dist)) : 0.5;
  // the land's colour variation is read from the baked cloudy noise: no grid in it, and its mips let it go by themselves
  vec2 pr = vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y);
  float m1 = texture(tNoise, p * (1.0 / 90.0) + 0.37).b - 0.5, m2 = texture(tNoise, pr * (1.0 / 700.0)).a - 0.5, m3 = texture(tNoise, p * (1.0 / 4500.0) + 0.11).r - 0.5;
  float macro = 1.0 + 0.16 * m1 + 0.20 * m2 + 0.18 * m3;
  // what grows here is worked out per pixel (per vertex it went blocky far away), each noise again let go in time
  float vArid = smoothstep(0.50, 0.66, vnoise(p * (1.0 / 700.0), 50u) + 0.3 * (vnoise(p * (1.0 / 150.0), 51u) - 0.5) * (1.0 - smoothstep(3000.0, 8000.0, dist)));
  float ta = texture(tNoise, p * (1.0 / 150.0)).r, tb = texture(tNoise, pr * (1.0 / 45.0)).g;
  vec4 vTint = grassTintAB(ta, tb, vArid);
  float vTuft = vArid > 0.003 && dist < 900.0 ? mix(tuftMask(p), 0.5, smoothstep(350.0, 900.0, dist)) : 0.5;
  // the grass as a carpet, at three sizes: blades near, tufts further, drifts of them from high up
  vec4 g1 = texture(tA6, p / 1.6), g2 = texture(tA6, pr / 9.6), g3 = texture(tA6, p / 44.0);
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
  m.c = mix(m.c, vTint.rgb * (0.25 + 1.5 * glum) * mix(0.5, 1.0, smoothstep(3.0, 70.0, dist)), cv); m.n = mix(m.n, gnrm * 1.4, cv); m.h = mix(m.h, glum, cv);
  if (path > 0.003) m = hblend(m, dirt, path);
  if (bank > 0.003) { if (!haveSand) sand = smp(tA2, tN2, p, dx, dy, 2.0, 3.2, mx); m = hblend(m, sand, bank); }
  float steep = smoothstep(0.80, 0.68, vN.y);
  if (steep > 0.003) m = hblend(m, smp(tA4, tN4, p, dx, dy, 3.0, 4.8, mx), steep);

  float wet = 1.0 - smoothstep(w * 0.9, w + 2.5, d);
  m.c *= mix(1.0, 0.5, wet);
  vec3 n = normalize(vN + vec3(m.n.x, 0.0, m.n.y) * (1.0 - smoothstep(60.0, 400.0, dist) * 0.7));
  vec3 col = m.c * macro * (uAmb + uSun * max(dot(n, uSunDir), 0.0));
  vec3 V = normalize(uCam - vWorld);
  col += uSun * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 48.0) * 0.3 * wet;
  gl_FragColor = toScreen(col);
}`;

const WFRAG = /* glsl */ `
${WORLD_GLSL}
${LIGHT_GLSL}
in vec3 vWorld; in vec3 vR; in float vW;
uniform sampler2D tWN, tWA;
uniform float uTime;
void main(){
  float d = riverDist(vR), w = vW;
  if (d > w * 1.15) discard;
  vec2 p = vWorld.xz;
  float depth = riverCarve(d, w) - WATER_DROP;
  vec2 fl = normalize(vec2(-vR.z, vR.y) + 1e-9);
  float mid = clamp(1.0 - d / w, 0.0, 1.0);
  float speed = 0.25 + 0.9 * sqrt(mid);            // slow at the banks, quick in the middle
  // two takes sliding along the flow, half a cycle apart, cross-faded: the water runs and never stretches
  float t = uTime * 0.3, f1 = fract(t), f2 = fract(t + 0.5), wb = abs(2.0 * f1 - 1.0);
  vec2 o1 = fl * speed * (f1 - 0.5) * 3.3, o2 = fl * speed * (f2 - 0.5) * 3.3;
  vec2 uA = (p - o1) / 4.5, uB = (p - o2) / 4.5 + 0.43;
  vec3 nA = texture(tWN, uA).xyz + texture(tWN, uA * 3.1 + 0.2).xyz - 1.0;
  vec3 nB = texture(tWN, uB).xyz + texture(tWN, uB * 3.1 + 0.6).xyz - 1.0;
  vec2 nn = mix(nA.xy, nB.xy, wb);
  float rough = 0.16 + 0.30 * mid;                 // calm water, a little livelier where it runs
  vec3 n = normalize(vec3(nn.x * rough, 1.0, nn.y * rough));
  vec3 V = normalize(uCam - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  // foam: only a thin broken line where the water meets the bank
  float ftex = mix(texture(tWA, uA * 2.0).r, texture(tWA, uB * 2.0).r, wb);
  float foam = (1.0 - smoothstep(0.0, 0.05, depth)) * smoothstep(0.15, 0.6, ftex) * 0.5;
  // things afloat: a few specks carried by the same two takes
  float specks = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 q = (i == 0 ? (p - o1) : (p - o2) + 3.7) * 4.0; vec2 c = floor(q);
    vec2 pt = c + 0.25 + 0.5 * vec2(rnd(ivec2(c), 96u), rnd(ivec2(c), 97u));
    float s = step(0.955, rnd(ivec2(c), 95u)) * (1.0 - smoothstep(0.03, 0.10, length(q - pt)));
    specks += s * (i == 0 ? 1.0 - wb : wb);
  }
  // the water's own colour: clear over the sand at the edge, green-brown and dark in the deep
  vec3 body = mix(vec3(0.085, 0.085, 0.05), vec3(0.022, 0.034, 0.024), clamp(depth * 1.1, 0.0, 1.0));
  vec3 skyRef = mix(uSky, vec3(dot(uSky, vec3(0.333))), 0.55) * 0.8;   // the plain sky, greyed: no blue sheet
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(n, H), 0.0), 350.0) * 2.5;
  vec3 col = mix(body * (uAmb + uSun * 0.45), skyRef, fres * 0.75) + uSun * spec;
  col = mix(col, vec3(0.8) * (uAmb + uSun * 0.5), foam);
  col = mix(col, vec3(0.5, 0.46, 0.3), specks * 0.6);
  float a = clamp(0.2 + depth * 1.1, 0.0, 0.93);
  a = max(max(a, fres * 0.75), max(foam, specks * 0.6)) * smoothstep(-0.04, 0.02, depth);
  gl_FragColor = vec4(toScreen(col).rgb, a);
}`;

function gridGeometry() {
  const n = GRID + 1, pos = new Float32Array(n * n * 3), idx = new Uint16Array(GRID * GRID * 6);
  for (let z = 0, i = 0; z < n; z++) for (let x = 0; x < n; x++, i += 3) { pos[i] = x; pos[i + 1] = 0; pos[i + 2] = z; }
  for (let z = 0, i = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const a = z * n + x, b = a + 1, c = a + n, d = c + 1;
    // the diagonal turns on every other quad, so a morphed tile folds into the coarser one cleanly
    if ((x + z) & 1) { idx[i++] = a; idx[i++] = c; idx[i++] = b; idx[i++] = b; idx[i++] = c; idx[i++] = d; }
    else { idx[i++] = a; idx[i++] = c; idx[i++] = d; idx[i++] = a; idx[i++] = d; idx[i++] = b; }
  }
  return { pos: new THREE.BufferAttribute(pos, 3), idx: new THREE.BufferAttribute(idx, 1) };
}

export function createTerrain(scene, U, tex) {
  const { pos, idx } = gridGeometry();
  const make = (cap) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', pos); g.setIndex(idx);
    const data = new Float32Array(cap * 4), attr = new THREE.InstancedBufferAttribute(data, 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aNode', attr);
    g.instanceCount = 0;
    return { g, data, attr, n: 0, cap };
  };
  const land = make(CAP), water = make(WCAP);
  const common = { uGrid: { value: GRID }, uR0: { value: R0 } };
  const landMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      ...U, ...common,
      tA0: { value: tex.a[0] }, tA1: { value: tex.a[1] }, tA2: { value: tex.a[2] }, tA3: { value: tex.a[3] }, tA4: { value: tex.a[4] },
      tA6: { value: tex.a[6] }, tN6: { value: tex.n[6] },
      tN0: { value: tex.n[0] }, tN1: { value: tex.n[1] }, tN2: { value: tex.n[2] }, tN3: { value: tex.n[3] }, tN4: { value: tex.n[4] },
    },
  });
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: '#define WATER\n' + VERT, fragmentShader: WFRAG, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,   // far off the depth buffer cannot tell water from its bed: the water wins
    uniforms: { ...U, ...common, tWN: { value: tex.n[5] }, tWA: { value: tex.a[5] } },
  });
  const landMesh = new THREE.Mesh(land.g, landMat), waterMesh = new THREE.Mesh(water.g, waterMat);
  landMesh.frustumCulled = waterMesh.frustumCulled = false;
  landMesh.renderOrder = 10; // after the grass and the rocks: they are in front, the depth test spares the ground's shader
  waterMesh.renderOrder = 20;
  scene.add(landMesh, waterMesh);

  const range = [], range2 = [];
  for (let i = 0; i < LEVELS; i++) { range.push(R0 * 2 ** i); range2.push(range[i] * range[i]); }
  const TOP = S0 * 2 ** (LEVELS - 1);
  const P = new Float64Array(24); // the frustum's six planes
  let cx = 0, cz = 0, dy2 = 0;

  function planes(m) {
    const e = m.elements;
    for (let i = 0; i < 3; i++) for (let s = 0; s < 2; s++) {
      const o = (i * 2 + s) * 4, k = s ? -1 : 1;
      P[o] = e[3] + k * e[i]; P[o + 1] = e[7] + k * e[4 + i]; P[o + 2] = e[11] + k * e[8 + i]; P[o + 3] = e[15] + k * e[12 + i];
    }
  }
  function inView(x, z, size, level) {
    let y0 = HMIN, y1 = HMAX;
    if (level <= 4) { const yc = heightAt(x + size * 0.5, z + size * 0.5), ext = size * 0.5 + 3; y0 = yc - ext; y1 = yc + ext; }
    const x1 = x + size, z1 = z + size;
    for (let o = 0; o < 24; o += 4) {
      const a = P[o], b = P[o + 1], c = P[o + 2];
      if (a * (a > 0 ? x1 : x) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z) + P[o + 3] < 0) return false;
    }
    return true;
  }
  function d2(x, z, size) {
    const ddx = cx < x ? x - cx : cx > x + size ? cx - x - size : 0, ddz = cz < z ? z - cz : cz > z + size ? cz - z - size : 0;
    return ddx * ddx + ddz * ddz + dy2;
  }
  function add(x, z, size, level) {
    if (land.n < land.cap) { const o = land.n++ * 4, a = land.data; a[o] = x; a[o + 1] = z; a[o + 2] = size; a[o + 3] = level; }
    if (level < WATER_LEVELS && water.n < water.cap) {
      const half = size * 0.71, r = riverAt(x + size * 0.5, z + size * 0.5);
      const near = size >= 128 ? Math.abs(r.r) < 0.0042 * (half + 16) : r.d < 2 * half + r.w * 1.3 + 3;
      if (near) { const o = water.n++ * 4, a = water.data; a[o] = x; a[o + 1] = z; a[o + 2] = size; a[o + 3] = level; }
    }
  }
  function select(x, z, size, level) {
    const dd = d2(x, z, size);
    if (dd > range2[level]) return false;
    if (!inView(x, z, size, level)) return true;
    if (level === 0 || dd > range2[level - 1]) { add(x, z, size, level); return true; }
    const h = size * 0.5, fx = cx > x + h ? 1 : 0, fz = cz > z + h ? 1 : 0;
    for (let i = 0; i < 4; i++) { // the camera's quarter first: front to back
      const ix = (i & 1) ^ fx, iz = (i >> 1) ^ fz, nx = x + ix * h, nz = z + iz * h;
      if (!select(nx, nz, h, level - 1) && inView(nx, nz, h, level - 1)) add(nx, nz, h, level - 1);
    }
    return true;
  }

  function push(s) {
    s.g.instanceCount = s.n;
    s.attr.clearUpdateRanges(); s.attr.addUpdateRange(0, s.n * 4); s.attr.needsUpdate = true;
  }
  return {
    landMesh, waterMesh,
    update(camera, projScreen, uDy) {
      cx = camera.position.x; cz = camera.position.z; dy2 = uDy * uDy;
      planes(projScreen);
      land.n = water.n = 0;
      const top = LEVELS - 1, R = range[top];
      const i0 = Math.floor((cx - R) / TOP), i1 = Math.floor((cx + R) / TOP), j0 = Math.floor((cz - R) / TOP), j1 = Math.floor((cz + R) / TOP);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) select(i * TOP, j * TOP, TOP, top);
      push(land); push(water);
      waterMesh.visible = water.n > 0;
    },
    all() { // every node slot filled once, so the first real frame uploads nothing new
      land.g.instanceCount = 1; water.g.instanceCount = 1; waterMesh.visible = true;
    },
  };
}
