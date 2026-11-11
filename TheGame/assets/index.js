// The asset library: every made thing in the world, one file each in this folder, all in one recipe:
//
//   id, name, kind, about     what it is
//   size                      { length, width, height } in metres; a [min, max] where it varies
//   colours                   its named colours, [r, g, b]
//   look                      a rock's look: { material, moss, relief, tint, cuts, smooth } (src/scatter/rocks.js)
//   detail                    its levels of detail, near to far: { levels: [shape, ...], px?, fade? } (src/detail, intent
//                             0002); where each level ends on screen comes from its kind (assets/kinds.js) unless it says.
//                             A shape is `faces` ([corner, corner, corner, colour], ...) or `rock` (a rough rock of an
//                             icosphere divided that often), with `P` for scattered ones
//   solid                     what a walker cannot pass: walls (rounds with gaps), posts, boxes, and the ceiling
//                             overhead (src/world/solids.js); in the asset's own frame
//   placement                 { at: 'places', ... } stood at a named place (src/world/places.js), or
//                             { at: 'scatter', engine, cell, ... } spread over the land by the scatter engine
//
// Here they are listed, built into meshes level by level with the one lit material they share, and stood.
import * as THREE from 'three';
import { LIGHT_GLSL, heightAt } from '../src/world.js';
import { detailOf, Detailed } from '../src/detail/index.js';
import { impostorOf } from '../src/detail/impostor.js';
import KINDS from './kinds.js';
import { addSolid } from '../src/world/solids.js';
import belltent from './belltent.js';
import stone from './stone.js';
import boulder from './boulder.js';

export const ASSETS = { belltent, stone, boulder };

/** A scattered asset as the row the land's scatter engine (src/scatter) reads. */
export const scatterRow = (a) => ({ name: a.id, kind: a.placement.engine, outcrops: a.placement.outcrops, cell: a.placement.cell, size: a.size.length, texture: a.placement.texture, shapes: a.placement.shapes, seed: a.placement.seed, look: a.look, detail: detailOf(a) });
/** How many faces a level has. */
export const facesOf = (l) => (l.faces ? l.faces.length : 20 * 4 ** (l.rock || 0));

/** A level of detail of an asset as a geometry, coloured per face (the nearest level unless one is named). */
export function geometryOf(asset, level = asset.detail.levels[0]) {
  const faces = level.faces; if (!faces) return rockPreview(asset, level.rock);
  const pos = [], col = [];
  for (const [p0, p1, p2, c] of faces) for (const v of [p0, p1, p2]) { pos.push(...v); col.push(...c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The material every asset shares: its own colours, lit by the sun and the sky and hazed with distance like the land. */
export function materialFor(U) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: { ...U, uKeep: { value: new THREE.Vector2(1, 0) } },   // uKeep: this level's share in a hand-over (src/detail)
    vertexShader: /* glsl */ `
      in vec3 color;
      out vec3 vN; out vec3 vCol; out vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = mat3(modelMatrix) * normal; vCol = color; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCam; uniform vec2 uKeep;
      ${LIGHT_GLSL}
      in vec3 vN; in vec3 vCol; in vec3 vWorld;
      void main(){
        if (detailCut(uKeep)) discard;
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 col = weathered(vCol, n) * (uAmb + uSun * cloudAt(vWorld) * (0.2 + 0.8 * ndl));
        gl_FragColor = toScreen(haze(col, length(uCam - vWorld)));
      }`,
  });
}

/** What an asset's body is to a walker and the camera: its own `solid` block, else its kind's default made from its
    size (assets/kinds.js, intent 0003). */
export function solidOf(asset) {
  if (asset.solid) return asset.solid;
  const k = KINDS[asset.kind]?.solid || KINDS.default.solid, m = (v) => (Array.isArray(v) ? v[1] : v);
  const L = m(asset.size.length), W = m(asset.size.width ?? asset.size.length);
  if (k.post) return { posts: [{ x: 0, z: 0, r: Math.max(L, W) * k.post }] };
  return { boxes: [{ x: 0, z: 0, w: L, d: W }] };   // (a ceiling, a function of where you stand, only an asset of its own can say)
}

/** Stand an asset at a place ({ x, z, yaw }), on the ground there. */
export function place(scene, U, asset, at) {
  // its levels of detail, chosen each frame by its size on screen with a hand-over between them (src/detail);
  // each level its own material, for its own share of the pixels
  const D = detailOf(asset);
  const meshes = D.levels.map((l) => { if (l.impostor) return impostorOf(geometryOf(asset), U, l.views); const m = new THREE.Mesh(geometryOf(asset, l), materialFor(U)); m.renderOrder = 1; return m; });
  const lod = new Detailed(asset, meshes, U);
  lod.position.set(at.x, heightAt(at.x, at.z) - 0.03, at.z);
  lod.rotation.y = at.yaw || 0;
  lod.name = asset.id;
  scene.add(lod);
  if (at.solid !== false) addSolid(solidOf(asset), at);   // the walker and the camera cannot pass it
  return lod;
}

/** A picture of a scattered rock, for the library's list: a rough, lumpy stone in its own colour. */
function rockPreview(asset, detail = 2) {
  const g = new THREE.IcosahedronGeometry(0.5, detail), p = g.attributes.position, c = [], base = asset.colours?.stone || [0.5, 0.5, 0.5];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.18 * Math.sin(x * 7.1 + y * 3.3) * Math.cos(z * 5.7 - x * 2.1) + 0.08 * Math.sin(y * 13 + z * 9);
    p.setXYZ(i, x * k, Math.max(-0.1, y * k * 0.72), z * k); const s = (0.9 + 0.2 * Math.sin(x * 11 + z * 7)) * 0.45; c.push(base[0] * s, base[1] * s, base[2] * s);   // as dark as the world's own stones under the same light
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.translate(0, 0.1, 0); g.computeVertexNormals();
  return g;
}
