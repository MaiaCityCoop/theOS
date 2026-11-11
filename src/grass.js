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
out vec3 vCol; out vec3 vN; out vec3 vSide; out float vT; out float vS; out vec3 vWorld;
void main(){
  ivec2 c = instanceCell();
  vec2 pos = (vec2(c) + vec2(rnd(c, 100u), rnd(c, 101u))) * uCell;
  float dist = camDist(pos), hf = rnd(c, 102u);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (dist > uFar - uFarFade * hf || dist < uNear - uNearFade * hf) return;
  vec4 G = groundA(pos);
  float arid = G.z, dens = G.y;
  if (rnd(c, 103u) > dens) return;
  float y = G.x;
  vec4 tint = groundTint(pos);
  float r1 = rnd(c, 104u), r2 = rnd(c, 105u), r3 = rnd(c, 106u), r4 = rnd(c, 107u);
  float hgt = uBladeH * (0.45 + 0.95 * r1 * r1) * mix(1.0, 0.6, arid) * (0.6 + 0.4 * dens) * (1.0 - smoothstep(uEnd * 0.7, uEnd, dist));
  float ang = r2 * 6.2831853; vec2 dir = vec2(cos(ang), sin(ang)), side = vec2(-dir.y, dir.x);
  float t = position.y, s = position.x, bend = 0.15 + 0.6 * r3;
  float wd = uBladeW * (0.7 + 0.6 * r4) * (1.0 - 0.75 * t * t);
  float up = hgt * t * (1.0 - 0.3 * bend * t), fw = hgt * bend * t * t;
  vWorld = vec3(pos.x, y, pos.y) + vec3(side.x, 0.0, side.y) * (s * wd) + vec3(dir.x * fw, up, dir.y * fw);
  vec3 tg = normalize(vec3(dir.x * 2.0 * bend * t, 1.0 - 0.6 * bend * t, dir.y * 2.0 * bend * t));
  vSide = vec3(side.x, 0.0, side.y);
  vN = cross(vSide, tg);
  vT = t; vS = s;
  vec3 base = tint.rgb * (0.7 + 0.6 * r4);
  float tip = smoothstep(0.45, 1.0, t) * clamp(tint.a * 1.2 + r3 * 0.55 - 0.15, 0.0, 1.0);
  vCol = mix(base, vec3(0.42, 0.34, 0.15), tip) * mix(0.3, 1.15, t);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uCam; uniform float uDy;
${LIGHT_GLSL}
in vec3 vCol; in vec3 vN; in vec3 vSide; in float vT; in float vS; in vec3 vWorld;
void main(){
  vec3 n = normalize(vN + vSide * vS * 0.6);          // a blade is a little rounded
  if (!gl_FrontFacing) n = -n;
  n = normalize(n + vec3(0.0, 1.4, 0.0));             // and a meadow lights as a soft whole
  float ndl = dot(n, uSunDir) * 0.5 + 0.5;
  vec3 V = normalize(uCam - vWorld);
  float thru = pow(max(dot(-V, uSunDir), 0.0), 3.0) * vT * 0.5;   // light through the blade
  float sheen = pow(max(dot(n, normalize(V + uSunDir)), 0.0), 24.0) * 0.12 * vT;
  vec3 col = vCol * (uAmb + uSun * (ndl * ndl + thru)) + uSun * sheen;
  gl_FragColor = toScreen(col);
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
  { segs: 3, cell: 0.075, P: 96, near: -1, nearFade: 0, far: 18, farFade: 5, w: 0.012, end: 1e6 },
  { segs: 2, cell: 0.15, P: 96, near: 18, nearFade: 5, far: 46, farFade: 10, w: 0.03, end: 1e6 },
  { segs: 1, cell: 0.30, P: 96, near: 46, nearFade: 10, far: 115, farFade: 25, w: 0.075, end: 115 },
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
        uFar: { value: L.far }, uFarFade: { value: L.farFade }, uBladeH: { value: 0.46 }, uBladeW: { value: L.w }, uEnd: { value: L.end },
      },
    });
    return new PatchRing(scene, g, mat, { patch: L.cell * L.P, near: L.near - L.nearFade, far: L.far, pad: 5, order: 0 });
  });
  return { rings, update(cx, cz, dy) { for (let i = 0; i < rings.length; i++) rings[i].update(cx, cz, dy); } };
}
