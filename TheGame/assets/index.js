// The asset library: every made thing in the world, one file each in this folder, all in one recipe:
//
//   uid, type: 'asset'        its stable id (every reference to it is this) and what sort of recipe it is (src/core/registry.js)
//   name, kind, about         what it is
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
//   wind                      how it moves in the wind, if not as its kind (assets/kinds.js)
//
// The registry finds every file here with a uid: a new asset is a new file. Here its levels are built into geometry;
// src/world/place.js stands it in the world, src/scatter spreads it.
import * as THREE from 'three/webgpu';
import { detailOf } from '../src/detail/index.js';
import KINDS from './kinds.js';

/** A scattered asset as the row the land's scatter engine (src/scatter) reads. */
/** How an asset holds snow: its own `snow`, else its kind's, else the default (kinds.js). */
export const snowOf = (a) => ({ ...KINDS.default.snow, ...(KINDS[a?.kind]?.snow || {}), ...(a?.snow || {}) });
export const scatterRow = (a) => ({ asset: a, snow: snowOf(a), name: a.name, uid: a.uid, kind: a.placement.engine, outcrops: a.placement.outcrops, cell: a.placement.cell, size: a.size.length, texture: a.placement.texture, shapes: a.placement.shapes, seed: a.placement.seed, look: a.look, detail: detailOf(a) });
/** How many faces a level has. */
export const facesOf = (l) => (l.mesh ? (l.mesh.index ? l.mesh.index.length : l.mesh.position.length) / 3 : l.faces ? l.faces.length : 20 * 4 ** (l.rock || 0));

/** A level of detail of an asset as a geometry, coloured per face (the nearest level unless one is named). */
export function geometryOf(asset, level = asset.detail.levels[0], shape = 0) {
  if (level.mesh) {   // built as a mesh by its own file (a tree): every attribute it made, as it made them; of its shapes (meshes) the one asked
    const g = new THREE.BufferGeometry(), size = { uv: 2, part: 1, ao: 1 }, M = level.meshes?.[shape] ?? level.mesh;
    for (const [k, v] of Object.entries(M)) if (Array.isArray(v) && k !== 'index') g.setAttribute(k, new THREE.Float32BufferAttribute(v, size[k] ?? 3));
    if (M.index?.length) g.setIndex(M.index);
    return g;
  }
  const faces = level.faces; if (!faces) return rockPreview(asset, level.rock);
  const pos = [], col = [];
  for (const [p0, p1, p2, c] of faces) for (const v of [p0, p1, p2]) { pos.push(...v); col.push(...c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
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
