// A material on its own, for the library: its two baked textures laid over any shape from the world's position
// (three planar projections blended by the normal, so a ball and a slab both read true), lit like the world.
import * as THREE from 'three';
import { LIGHT_GLSL } from '../world.js';

/** t: { a, n } from tex.of(id); tile: metres one tile of the texture covers. */
export function materialPreview(U, t, tile = 2, own = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, tA: { value: t.a }, tN: { value: t.n }, uTile: { value: tile }, uTint: { value: new THREE.Vector3(1, 1, 1) }, ...own },
    vertexShader: /* glsl */ `
      out vec3 vN; out vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCam, uTint; uniform sampler2D tA, tN; uniform float uTile;
      ${LIGHT_GLSL}
      in vec3 vN; in vec3 vWorld;
      void main(){
        vec3 n = normalize(vN), w = pow(abs(n), vec3(4.0)); w /= w.x + w.y + w.z;
        vec2 px = vWorld.zy / uTile, py = vWorld.xz / uTile, pz = vWorld.xy / uTile;
        vec3 a = texture(tA, px).rgb * w.x + texture(tA, py).rgb * w.y + texture(tA, pz).rgb * w.z;
        vec4 nx = texture(tN, px), ny = texture(tN, py), nz = texture(tN, pz);
        vec2 dx = nx.xy * 2.0 - 1.0, dy = ny.xy * 2.0 - 1.0, dz = nz.xy * 2.0 - 1.0;
        // each projection's relief, turned onto the surface (whiteout blend)
        vec3 bn = normalize(w.x * vec3(0.0, dx.y, dx.x) * sign(n.x) + w.y * vec3(dy.x, 0.0, dy.y) * sign(n.y) + w.z * vec3(dz.x, dz.y, 0.0) * sign(n.z) + n);
        float rough = nx.a * w.x + ny.a * w.y + nz.a * w.z;
        vec3 col = a * a * uTint, v = normalize(uCam - vWorld), h = normalize(v + uSunDir);
        float ndl = max(dot(bn, uSunDir), 0.0), spec = pow(max(dot(bn, h), 0.0), mix(60.0, 6.0, rough)) * (1.0 - rough) * 0.5;
        col = col * (uAmb + uSun * (0.15 + 0.85 * ndl)) + uSun * spec * ndl;
        gl_FragColor = toScreen(haze(col, length(uCam - vWorld)));
      }`,
  });
}

/** A material's picture for a list: a small shaded ball of it, drawn once by the world's renderer, into a 2D canvas. */
export function materialThumb(renderer, U, t, canvas) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 0.6, 3.4); cam.lookAt(0, 0, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(0.82, 64, 48), materialPreview(U, t, 0.9, { uCam: { value: cam.position.clone() } })));
  snap(renderer, sc, cam, canvas);
}
/** The biomes' picture: a round of land cut out, grass on top, earth down its side, a pebble on it, water at one edge. */
export function dioramaThumb(renderer, U, tex, canvas) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 2.15, 3.75); cam.lookAt(0, -0.08, 0);   // the whole round in frame, a margin all round
  const own = (t, tile, tint) => materialPreview(U, t, tile, { uCam: { value: cam.position.clone() }, uTint: { value: new THREE.Vector3(...tint) } });
  const sc = new THREE.Scene(), earth = own(tex.of('path'), 0.5, [1, 1, 1]);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.88, 0.32, 72, 1, false), [earth, own(tex.of('grasscarpet'), 0.45, [0.42, 0.95, 0.26]), earth]);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48, 0, Math.PI), own(tex.of('sand'), 0.4, [1, 1, 1])); sand.rotation.x = -Math.PI / 2; sand.position.set(0.18, 0.162, -0.5); sand.scale.set(1, 0.8, 1);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.28, 48, 0, Math.PI), own(tex.of('water'), 0.6, [0.25, 0.4, 0.45])); pool.rotation.x = -Math.PI / 2; pool.position.set(0.18, 0.165, -0.55); pool.scale.set(1, 0.7, 1);
  const stone = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 24), own(tex.of('pebble'), 0.3, [1, 1, 1])); stone.scale.set(1.2, 0.7, 1); stone.position.set(-0.35, 0.2, 0.25);
  sc.add(puck, sand, pool, stone);
  snap(renderer, sc, cam, canvas);
}
/** A thing's picture for a list, in its own material: `things` stand round the origin, seen from `eye` looking at `at`
    (a scattered rock in the world's rock material: its look, its moss); drawn once by the world's renderer, into a 2D canvas. */
export function sceneThumb(renderer, things, canvas, eye = [0, 0.6, 3.4], at = [0, 0, 0]) {
  const far = Math.hypot(...eye) * 4, cam = new THREE.PerspectiveCamera(30, 1, far / 400, far); cam.position.set(...eye); cam.lookAt(...at);
  const sc = new THREE.Scene();
  for (const m of things) { if (m.material?.uniforms) m.material.uniforms.uCam = { value: cam.position.clone() }; sc.add(m); }   // lit and hazed from the picture's own eye, not the world's camera
  snap(renderer, sc, cam, canvas);
}
function snap(renderer, sc, cam, canvas) {
  const S = canvas.width, rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
  const prev = renderer.getRenderTarget(), px = new Uint8Array(S * S * 4), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, S, S, px); renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca); rt.dispose();
  const img = new ImageData(S, S); for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);   // rows bottom-up in GL
  for (let i = 0; i < img.data.length; i += 4) { const a = img.data[i + 3] / 255; if (a > 0 && a < 1) for (let k = 0; k < 3; k++) img.data[i + k] = Math.min(255, img.data[i + k] / a); }   // the edge's colour was mixed with the clear: undo it
  canvas.getContext('2d').putImageData(img, 0, 0);
}

