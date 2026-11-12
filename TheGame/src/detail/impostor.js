// Impostors (intent 0002, stage 2): an asset seen from far away as one card. Its nearest level is rendered once from
// N x N directions over the half-sphere above it (hemi-octahedral), its colour and its normals each into one atlas;
// at run time the card shows the view nearest the camera's and is lit live by the shading contract, like a mesh:
// the sun, the sky, the weather, the clouds' shadow, the air, and the hand-over between levels (src/world/light.js). Nothing
// of the light is baked. Atlases are kept by the hash of the asset's recipe, so one is baked once per recipe.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uniform, varyingProperty, positionGeometry, attribute, normalLocal, frontFacing, modelWorldMatrix, cameraProjectionMatrix, cameraViewMatrix, texture, normalize, cross, abs, max, clamp, floor, length, sqrt, mat3, If, Discard } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { finish, skyLight, weathered, snowLift, cloudAt, detailCut, unlit } from '../world/light.js';

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
  const S = CELL * n, mk = () => new THREE.RenderTarget(S, S, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  const albedo = mk(), normal = mk(), vC = attribute('color', 'vec3');
  const mA = new THREE.NodeMaterial(); mA.side = THREE.DoubleSide; mA.fragmentNode = vec4(sqrt(max(vC, 0)), 1);   // sqrt: dark colours keep their steps in 8 bits
  const mN = new THREE.NodeMaterial(); mN.side = THREE.DoubleSide; mN.fragmentNode = vec4(normalize(frontFacing.select(normalLocal, normalLocal.negate())).mul(0.5).add(0.5), 1);
  const mesh = new THREE.Mesh(geo, mA), scene = new THREE.Scene(); scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 6);
  const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  for (const [rt, m] of [[albedo, mA], [normal, mN]]) {
    mesh.material = m; rt.scissorTest = false; rt.viewport.set(0, 0, S, S); renderer.setRenderTarget(rt); renderer.clear();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const d = decode(((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1);
      cam.position.copy(centre).addScaledVector(d, radius * 3); cam.up.set(0, 1, 0); cam.lookAt(centre); cam.updateMatrixWorld();
      rt.viewport.set(i * CELL, j * CELL, CELL, CELL); rt.scissor.set(i * CELL, j * CELL, CELL, CELL); rt.scissorTest = true;   // each view's own clear touches only its cell
      renderer.setRenderTarget(rt); renderer.autoClear = false; renderer.render(scene, cam); renderer.autoClear = true;
    }
    rt.viewport.set(0, 0, S, S); rt.scissor.set(0, 0, S, S); rt.scissorTest = false;
  }
  renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa);
  mA.dispose(); mN.dispose();
  return { albedo: albedo.texture, normal: normal.texture, n, radius, centre, targets: [albedo, normal] };
}

/** An asset's impostor as a mesh: one card, the view nearest the camera, lit live. geo: its nearest level. Its `keep`
    is its share of the pixels in a hand-over (src/detail). */
export function impostorOf(geo, n = 8, snow = { clumps: 0.08 }) {   // snow: how the asset holds it (assets/kinds.js)
  const key = `${n}:${hashOf(geo)}`;
  if (!kept.has(key)) kept.set(key, bake(geo, n));
  const A = kept.get(key), N = n, keep = uniform(new THREE.Vector2(1, 0));
  const vUV = varyingProperty('vec2', 'vUV'), vWorld = varyingProperty('vec3', 'vWorld'), vCell = varyingProperty('vec2', 'vCell');
  const vM0 = varyingProperty('vec3', 'vM0'), vM1 = varyingProperty('vec3', 'vM1'), vM2 = varyingProperty('vec3', 'vM2');
  const m = new THREE.NodeMaterial(); m.side = THREE.DoubleSide; m.keep = keep;
  m.vertexNode = Fn(() => {
    const C = modelWorldMatrix.mul(vec4(A.centre.x, A.centre.y, A.centre.z, 1)).xyz;
    const M = mat3(modelWorldMatrix[0].xyz, modelWorldMatrix[1].xyz, modelWorldMatrix[2].xyz);
    vM0.assign(M[0]); vM1.assign(M[1]); vM2.assign(M[2]);
    const d0 = M.transpose().mul(normalize(U.uCam.sub(C))), d1 = vec3(d0.x, max(d0.y, 0), d0.z), d = d1.div(abs(d1.x).add(abs(d1.y)).add(abs(d1.z)));   // the camera's way, in the asset's own frame
    const sq = vec2(d.x.add(d.z), d.x.sub(d.z));                                                                                           // on the square of views
    const cell = clamp(floor(sq.mul(0.5).add(0.5).mul(N)), 0, N - 1); vCell.assign(cell);
    const c = cell.add(0.5).div(N).mul(2).sub(1), p = vec2(c.x.add(c.y), c.x.sub(c.y)).mul(0.5);
    const D = normalize(M.mul(normalize(vec3(p.x, max(float(1).sub(abs(p.x)).sub(abs(p.y)), 1e-4), p.y))));                              // the view the card shows
    const R = normalize(cross(vec3(0, 1, 0), D)), Up = cross(D, R);
    const w = C.add(R.mul(positionGeometry.x).add(Up.mul(positionGeometry.y)).mul(A.radius));
    vUV.assign(positionGeometry.xy.mul(0.5).add(0.5)); vWorld.assign(w);
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1));
  })();
  m.fragmentNode = Fn(() => {
    If(detailCut(keep), () => { Discard(); });
    const t = clamp(vUV, 0.02, 0.98), uv = vec2(vCell.x.add(t.x), vCell.y.add(float(1).sub(t.y))).div(N);   // a target's viewport counts its rows from the top, and reads them turned (src/scatter/ground.js)
    const a = texture(A.albedo, uv); If(a.a.lessThan(0.5), () => { Discard(); });
    const out = vec4(0).toVar();
    If(unlit().not(), () => {   // drawn into the shadow map, only its outline counts: no light
      const n = normalize(mat3(vM0, vM1, vM2).mul(texture(A.normal, uv).xyz.mul(2).sub(1)));
      const col = weathered(a.rgb.mul(a.rgb), n, snowLift(vWorld, snow.clumps)).mul(skyLight(n).add(U.uSun.mul(cloudAt(vWorld)).mul(max(n.dot(U.uSunDir), 0).mul(0.8).add(0.2))));   // as the asset's own material lights it
        out.assign(finish(col, vWorld));
    });
    return out;
  })();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false; mesh.renderOrder = 1;
  return mesh;
}
