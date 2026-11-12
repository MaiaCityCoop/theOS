// A material on its own, for the library: its baked layers laid over any shape from the world's position (three planar
// projections blended by the normal, so a ball and a slab both read true), lit like the world. And the library's small
// pictures, drawn once by the world's renderer into 2D canvases.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uniform, positionWorld, normalWorld, screenCoordinate, If, Discard, abs, pow, normalize, max, mix, sign, smoothstep, length, atan, sin } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { haze, toScreen, ign } from '../world/light.js';

/** id: the material (tex: src/materials/bake.js); tile: metres one tile covers; own: { tint: [r, g, b], edge: [x, z, r] } —
    edge: a round laid on the land, fading into it over its last metre and a half, its edge frayed. Its `eye` uniform is
    the camera it is lit and hazed for (a picture sets its own). */
export function materialPreview(tex, id, tile = 2, own = {}) {
  const eye = uniform(U.uCam.value), tint = vec3(...(own.tint || [1, 1, 1])), edge = own.edge;
  const m = new THREE.NodeMaterial(); m.eye = eye;
  m.fragmentNode = Fn(() => {
    const w = positionWorld, A = (q) => tex.a(id, q), Nn = (q) => tex.n(id, q);
    if (edge) {
      const q = w.xz.sub(vec2(edge[0], edge[1])), an = atan(q.y, q.x);
      const dd = length(q).add(sin(an.mul(9).add(1.3)).mul(0.45)).add(sin(an.mul(23).add(0.4)).mul(0.25)).add(A(w.xz.div(tile)).a.sub(0.5).mul(0.3));
      If(ign(screenCoordinate.xy).greaterThan(float(1).sub(smoothstep(edge[2] - 1.6, edge[2] + 0.1, dd))), () => { Discard(); });
    }
    const n = normalize(normalWorld), b0 = pow(abs(n), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z));
    const px = w.zy.div(tile), py = w.xz.div(tile), pz = w.xy.div(tile);
    const a = A(px).rgb.mul(b.x).add(A(py).rgb.mul(b.y)).add(A(pz).rgb.mul(b.z));
    const nx = Nn(px), ny = Nn(py), nz = Nn(pz), dx = nx.xy.mul(2).sub(1), dy = ny.xy.mul(2).sub(1), dz = nz.xy.mul(2).sub(1);
    // each projection's relief, turned onto the surface (whiteout blend)
    const bn = normalize(vec3(0, dx.y, dx.x).mul(b.x).mul(sign(n.x)).add(vec3(dy.x, 0, dy.y).mul(b.y).mul(sign(n.y))).add(vec3(dz.x, dz.y, 0).mul(b.z).mul(sign(n.z))).add(n));
    const rough = nx.a.mul(b.x).add(ny.a.mul(b.y)).add(nz.a.mul(b.z));
    const V = normalize(eye.sub(w)), H = normalize(V.add(U.uSunDir)), ndl = max(bn.dot(U.uSunDir), 0);
    const spec = pow(max(bn.dot(H), 0), mix(60, 6, rough)).mul(float(1).sub(rough)).mul(0.5);
    const col = a.mul(a).mul(tint).mul(U.uAmb.add(U.uSun.mul(ndl.mul(0.85).add(0.15)))).add(U.uSun.mul(spec).mul(ndl));
    return toScreen(haze(col, length(eye.sub(w))));
  })();
  return m;
}

/** A material's picture for a list: a small shaded ball of it. */
export function materialThumb(renderer, tex, id, canvas) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 0.6, 3.4); cam.lookAt(0, 0, 0);
  return sceneThumb(renderer, [new THREE.Mesh(new THREE.SphereGeometry(0.82, 64, 48), materialPreview(tex, id, 0.9))], canvas, cam);
}
/** The biomes' picture: a round of land cut out, grass on top, earth down its side, a pebble on it, water at one edge. */
export function dioramaThumb(renderer, tex, canvas) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 2.15, 3.75); cam.lookAt(0, -0.08, 0);   // the whole round in frame
  const own = (id, tile, tint) => materialPreview(tex, id, tile, { tint });
  const earth = own('path', 0.5);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.88, 0.32, 72, 1, false), [earth, own('grasscarpet', 0.45, [0.42, 0.95, 0.26]), earth]);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48, 0, Math.PI), own('sand', 0.4)); sand.rotation.x = -Math.PI / 2; sand.position.set(0.18, 0.162, -0.5); sand.scale.set(1, 0.8, 1);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.28, 48, 0, Math.PI), own('water', 0.6, [0.25, 0.4, 0.45])); pool.rotation.x = -Math.PI / 2; pool.position.set(0.18, 0.165, -0.55); pool.scale.set(1, 0.7, 1);
  const stone = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 24), own('pebble', 0.3)); stone.scale.set(1.2, 0.7, 1); stone.position.set(-0.35, 0.2, 0.25);
  return sceneThumb(renderer, [puck, sand, pool, stone], canvas, cam);
}
/** A thing's picture for a list: `things` round the origin, seen from `cam` (or from `eye` looking at `at`), each lit and
    hazed from the picture's own eye; drawn once by the world's renderer into a 2D canvas (it fills when the GPU is done). */
export async function sceneThumb(renderer, things, canvas, cam, at = [0, 0, 0]) {
  if (Array.isArray(cam)) { const eye = cam, far = Math.hypot(...eye) * 4; cam = new THREE.PerspectiveCamera(30, 1, far / 400, far); cam.position.set(...eye); cam.lookAt(...at); }
  const sc = new THREE.Scene();
  for (const o of things) { o.traverse((m) => [m.material].flat().forEach((x) => x?.eye && (x.eye.value = cam.position.clone()))); sc.add(o); }
  const S = canvas.width, rt = new THREE.RenderTarget(S, S, { samples: 4 });
  const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.render(sc, cam); renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
  const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, S, S); rt.dispose();
  const img = new ImageData(S, S);
  // rows come back as the backend keeps them: WebGL bottom-up, WebGPU top-down
  const up = renderer.coordinateSystem !== THREE.WebGPUCoordinateSystem;
  for (let y = 0; y < S; y++) img.data.set(px.subarray((up ? S - 1 - y : y) * S * 4, (up ? S - y : y + 1) * S * 4), y * S * 4);
  for (let i = 0; i < img.data.length; i += 4) { const a = img.data[i + 3] / 255; if (a > 0 && a < 1) for (let k = 0; k < 3; k++) img.data[i + k] = Math.min(255, img.data[i + k] / a); }   // the edge's colour was mixed with the clear: undo it
  canvas.getContext('2d').putImageData(img, 0, 0);
}
