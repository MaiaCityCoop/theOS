// Impostors (intent 0002, stage 2): an asset seen from far away as one card. Its nearest level is rendered once from
// N x N directions over the half-sphere above it (hemi-octahedral), its colour and its normals each into one atlas;
// at run time the card shows the view nearest the camera's and is lit live by the shading contract, like a mesh:
// the sun, the sky, the weather, the clouds' shadow, the air, and the hand-over between levels (LIGHT_GLSL). Nothing
// of the light is baked. Atlases are kept by the hash of the asset's recipe, so one is baked once per recipe.
import * as THREE from 'three';
import { LIGHT_GLSL } from '../world.js';

let renderer = null;
/** The game's renderer bakes the atlases (set once by src/main.js). */
export const setImpostorRenderer = (r) => (renderer = r);

const CELL = 128;                     // pixels per view
const kept = new Map();               // recipe hash -> { albedo, normal, n, radius, centre }
if (import.meta.env.DEV) window.__impostors = kept;   // to look into, while developing

// a recipe's hash: its geometry's numbers, so a changed recipe bakes again
function hashOf(geo) {
  let h = 2166136261 >>> 0; const a = geo.attributes.position.array, c = geo.attributes.color?.array || [];
  for (let i = 0; i < a.length; i += 7) h = Math.imul(h ^ Math.round(a[i] * 1000), 16777619) >>> 0;
  for (let i = 0; i < c.length; i += 11) h = Math.imul(h ^ Math.round(c[i] * 1000), 16777619) >>> 0;
  return `${a.length}:${h.toString(36)}`;
}

// a direction on the half-sphere above for a point of the square [-1, 1]² (and back)
const decode = (u, v) => { const px = (u + v) * 0.5, pz = (u - v) * 0.5, y = 1 - Math.abs(px) - Math.abs(pz); return new THREE.Vector3(px, Math.max(y, 0.0001), pz).normalize(); };

function bake(geo, n) {
  geo.computeBoundingBox(); const box = geo.boundingBox, centre = box.getCenter(new THREE.Vector3()), radius = box.getSize(new THREE.Vector3()).length() / 2;
  const S = CELL * n, mk = () => new THREE.WebGLRenderTarget(S, S, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  const albedo = mk(), normal = mk();
  const vs = `out vec3 vC; out vec3 vN; in vec3 color; void main(){ vC = color; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const mA = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: vs, fragmentShader: `in vec3 vC; in vec3 vN; void main(){ gl_FragColor = vec4(sqrt(max(vC, 0.0)), 1.0); }` });   // sqrt: dark colours keep their steps in 8 bits
  const mN = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: vs, fragmentShader: `in vec3 vC; in vec3 vN; void main(){ vec3 n = normalize(gl_FrontFacing ? vN : -vN); gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); }` });
  const mesh = new THREE.Mesh(geo, mA), scene = new THREE.Scene(); scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 6);
  const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha(), ps = renderer.getScissorTest();
  renderer.setClearColor(0x000000, 0);
  for (const [rt, m] of [[albedo, mA], [normal, mN]]) {
    mesh.material = m; renderer.setRenderTarget(rt); renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const d = decode(((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1);
      cam.position.copy(centre).addScaledVector(d, radius * 3); cam.up.set(0, 1, 0); cam.lookAt(centre); cam.updateMatrixWorld();
      rt.viewport.set(i * CELL, j * CELL, CELL, CELL); rt.scissor.set(i * CELL, j * CELL, CELL, CELL); rt.scissorTest = true; renderer.setRenderTarget(rt);   // scissored: each view's own clear touches only its cell   // a target's own viewport, in its pixels, is taken when it is set
      renderer.render(scene, cam);
    }
  }
  for (const rt of [albedo, normal]) { rt.viewport.set(0, 0, S, S); rt.scissor.set(0, 0, S, S); rt.scissorTest = false; }
  renderer.setRenderTarget(prev); renderer.setScissorTest(ps); renderer.setClearColor(pc, pa);
  mA.dispose(); mN.dispose();
  return { albedo: albedo.texture, normal: normal.texture, n, radius, centre, targets: [albedo, normal] };
}

/** An asset's impostor as a mesh: one card, the view nearest the camera, lit live. geo: its nearest level. */
export function impostorOf(geo, U, n = 8) {
  const key = `${n}:${hashOf(geo)}`;
  if (!kept.has(key)) kept.set(key, bake(geo, n));
  const A = kept.get(key);
  const mat = new THREE.ShaderMaterial({
    transparent: false, side: THREE.DoubleSide,
    uniforms: { ...U, tAlb: { value: A.albedo }, tNor: { value: A.normal }, uN: { value: A.n }, uR: { value: A.radius }, uC: { value: A.centre }, uKeep: { value: new THREE.Vector2(1, 0) } },
    vertexShader: /* glsl */ `
      uniform vec3 uCam, uC; uniform float uN, uR;
      out vec2 vUV; out vec3 vWorld; flat out vec2 vCell; flat out mat3 vM;
      void main(){
        vec3 C = (modelMatrix * vec4(uC, 1.0)).xyz; mat3 M = mat3(modelMatrix); vM = M;
        vec3 d = transpose(M) * normalize(uCam - C); d.y = max(d.y, 0.0); d /= abs(d.x) + abs(d.y) + abs(d.z);   // the camera's way, in the asset's own frame
        vec2 sq = vec2(d.x + d.z, d.x - d.z);                                                                // on the square of views
        vec2 cell = clamp(floor((sq * 0.5 + 0.5) * uN), 0.0, uN - 1.0); vCell = cell;
        vec2 c = (cell + 0.5) / uN * 2.0 - 1.0; vec2 p = vec2(c.x + c.y, c.x - c.y) * 0.5;
        vec3 D = normalize(M * normalize(vec3(p.x, max(1.0 - abs(p.x) - abs(p.y), 1e-4), p.y)));            // the view the card shows, in the world
        vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), D)), Up = cross(D, R);
        vec3 w = C + (R * position.x + Up * position.y) * uR;
        vUV = position.xy * 0.5 + 0.5; vWorld = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCam; uniform sampler2D tAlb, tNor; uniform float uN; uniform vec2 uKeep;
      ${LIGHT_GLSL}
      in vec2 vUV; in vec3 vWorld; flat in vec2 vCell; flat in mat3 vM;
      void main(){
        if (detailCut(uKeep)) discard;
        vec2 uv = (vCell + clamp(vUV, 0.02, 0.98)) / uN;
        vec4 a = texture(tAlb, uv); if (a.a < 0.5) discard;
        vec3 n = normalize(vM * (texture(tNor, uv).xyz * 2.0 - 1.0));
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 col = weathered(a.rgb * a.rgb, n) * (uAmb + uSun * cloudAt(vWorld) * (0.2 + 0.8 * ndl));   // as the asset's own material lights it
        gl_FragColor = toScreen(haze(col, length(uCam - vWorld)));
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); m.frustumCulled = false; m.renderOrder = 1;
  return m;
}
