// Grass: instanced blades. A blade's place, height, bend, colour and dryness are hashed from its
// cell; its density comes from the land's masks. Three rings: dense and fine close, sparse and wide far.
import * as THREE from 'three';
import { WORLD_GLSL, LIGHT_GLSL } from './world.js';
import { PatchRing, CELL_GLSL } from './rings.js';
import { GROUND_GLSL } from './ground.js';

const VERT = /* glsl */ `
${WORLD_GLSL}
${GROUND_GLSL}
${CELL_GLSL}
uniform float uNear, uNearFade, uFar, uFarFade, uBladeH, uBladeW, uEnd;
out vec3 vCol; out vec3 vN; out vec3 vSide; out float vT; out float vS; out vec3 vWorld; out float vFlower;
void main(){
  ivec2 c = instanceCell();
  // three hashes carry everything a blade is; nothing is read before the blade is known to stand
  uint h1 = hashI(c, 100u);
  vec2 pos = (vec2(c) + vec2(float(h1 & 0xFFFu), float((h1 >> 12) & 0xFFFu)) * (1.0 / 4096.0)) * uCell;
  float dist = camDist(pos), hf = float(h1 >> 24) * (1.0 / 256.0);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (dist > uFar - uFarFade * hf || dist < uNear - uNearFade * hf) return;
  vec4 G = groundA(pos);
  float arid = G.z, dens = G.y;
  uint h2 = hashI(c, 101u);
  if (float(h2 >> 24) * (1.0 / 256.0) > dens) return;
  float r1 = float(h2 & 0xFFu) * (1.0 / 256.0), r2 = float((h2 >> 8) & 0xFFu) * (1.0 / 256.0), r3 = float((h2 >> 16) & 0xFFu) * (1.0 / 256.0);
  // blades stand in tufts: the tuft they are in gives them a height, a lean and a shade in common
  uint hc = hashI(ivec2(floor(pos * (1.0 / 0.6))), 102u);
  float c1 = float(hc & 0xFFu) * (1.0 / 256.0), c2 = float((hc >> 8) & 0xFFu) * (1.0 / 256.0), c3 = float((hc >> 16) & 0xFFu) * (1.0 / 256.0);
  vec4 tint = groundTint(pos);
  float flower = step(0.985, r2) * (1.0 - arid);   // now and then a stalk with a small white head
  float hgt = uBladeH * (0.5 + 0.55 * r1 * r1 + 0.8 * c1 * c1 + 0.35 * flower) * mix(1.0, 0.6, arid) * (0.6 + 0.4 * dens) * (1.0 - smoothstep(uEnd * 0.7, uEnd, dist));
  float ang = (c2 + (r2 - 0.5) * 0.55) * 6.2831853; vec2 dir = vec2(cos(ang), sin(ang)), side = vec2(-dir.y, dir.x);
  float t = position.y, s = position.x, bend = (0.2 + 0.55 * r3 + 0.35 * c3) * (1.0 - 0.7 * flower);
  float wd = uBladeW * (0.75 + 0.5 * r1) * (1.0 - 0.8 * t * t);
  float up = hgt * t * (1.0 - 0.42 * bend * t), fw = hgt * bend * t * t * 1.15;   // long blades arc over
  vWorld = vec3(pos.x, G.x, pos.y) + vec3(side.x, 0.0, side.y) * (s * wd) + vec3(dir.x * fw, up, dir.y * fw);
  vec3 tg = normalize(vec3(dir.x * 2.0 * bend * t, 1.0 - 0.6 * bend * t, dir.y * 2.0 * bend * t));
  vSide = vec3(side.x, 0.0, side.y);
  vN = cross(vSide, tg);
  vT = t; vS = s; vFlower = flower;
  vec3 base = tint.rgb * (0.7 + 0.35 * r3 + 0.35 * c3);
  float tip = smoothstep(0.5, 1.0, t) * clamp(tint.a * 1.2 + r2 * 0.35 - 0.25, 0.0, 1.0);
  vCol = mix(base, vec3(0.42, 0.34, 0.15), tip) * mix(0.14, 1.45, t * (0.6 + 0.4 * t));   // dark in the thick of it, light at the tips
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uCam; uniform float uDy;
${LIGHT_GLSL}
in vec3 vCol; in vec3 vN; in vec3 vSide; in float vT; in float vS; in vec3 vWorld; in float vFlower;
void main(){
  vec3 n = normalize(vN + vSide * vS * 0.6);          // a blade is a little rounded
  if (!gl_FrontFacing) n = -n;
  n = normalize(n + vec3(0.0, 1.4, 0.0));             // and a meadow lights as a soft whole
  float ndl = dot(n, uSunDir) * 0.5 + 0.5;
  vec3 V = normalize(uCam - vWorld);
  float thru = pow(max(dot(-V, uSunDir), 0.0), 2.0) * vT;         // light through the blade: the bright yellow-green of a lit meadow
  float sheen = pow(max(dot(n, normalize(V + uSunDir)), 0.0), 20.0) * 0.16 * vT;
  vec3 col = vCol * (uAmb * (0.55 + 0.45 * vT) + uSun * (ndl * ndl * 1.1 + thru * vec3(0.5, 1.0, 0.22))) + uSun * sheen;
  if (vFlower > 0.5 && vT > 0.86) col = vec3(0.92, 0.92, 0.86) * (uAmb + uSun * 0.7);
  gl_FragColor = toScreen(haze(col, length(uCam - vWorld)));
}`;

function blade(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = i / segs; pos.push(-1, t, 0, 1, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  return { pos: new Float32Array(pos), idx };
}

// cell: metres per blade; P: blades per patch side
const LODS = [
  { segs: 3, cell: 0.085, P: 96, near: -1, nearFade: 0, far: 15, farFade: 5, w: 0.014, end: 1e6 },
  { segs: 2, cell: 0.17, P: 96, near: 15, nearFade: 5, far: 42, farFade: 10, w: 0.033, end: 1e6 },
  { segs: 1, cell: 0.34, P: 96, near: 42, nearFade: 10, far: 105, farFade: 25, w: 0.085, end: 105 },
];

export function createGrass(scene, U) {
  const rings = LODS.map((L) => {
    const b = blade(L.segs), g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3)); g.setIndex(b.idx);
    g.instanceCount = L.P * L.P;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: {
        ...U, uCell: { value: L.cell }, uP: { value: L.P }, uNear: { value: L.near }, uNearFade: { value: L.nearFade },
        uFar: { value: L.far }, uFarFade: { value: L.farFade }, uBladeH: { value: 0.58 }, uBladeW: { value: L.w }, uEnd: { value: L.end },
      },
    });
    return new PatchRing(scene, g, mat, { patch: L.cell * L.P, near: L.near - L.nearFade, far: L.far, pad: 5, order: 0 });
  });
  return { rings, update(cx, cz, dy) { for (let i = 0; i < rings.length; i++) rings[i].update(cx, cz, dy); } };
}
