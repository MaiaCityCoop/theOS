// The asset library: every made thing in the world, one file each in this folder, all in one recipe:
//
//   uid, type: 'asset'        its stable id (every reference to it is this) and what sort of recipe it is (src/core/registry.js)
//   name, kind, about         what it is
//   size                      { length, width, height } in metres; a [min, max] where it varies
//   colours                   its named colours, [r, g, b]
//   look                      a rock's look: { material, moss, relief, tint, cuts, smooth } (assets/kit/rock.js)
//   detail                    its levels of detail, near to far: { levels: [shape, ...], px?, fade? } (src/detail, intent
//                             0002); where each level ends on screen comes from its kind (assets/kinds.js) unless it says.
//                             What is drawn from the heap (a rock) says { ladder } instead: its levels are the ladder's
//                             (assets/kit/ladder.js).
//                             A shape is `faces` ([corner, corner, corner, colour], ...) or `rock` (a rough rock of an
//                             icosphere divided that often), with `P` for scattered ones
//   solid                     what a walker cannot pass: walls (rounds with gaps), posts, boxes, and the ceiling
//                             overhead; in the asset's own frame. Without it, its kind's rule made from its size
//                             (assets/kinds.js). The one collision engine takes it as a body (bodyOfAsset:
//                             src/world/bodies.js)
//   placement                 { at: 'places', ... } stood at a named place (world/places.js), or
//                             { at: 'scatter', engine, cell, ... } spread over the land by the scatter engine
//   wind                      how it moves in the wind, if not as its kind (assets/kinds.js)
//
// The registry finds every file here with a uid: a new asset is a new file. Here its levels are built into geometry;
// src/world/place.js stands it in the world, src/scatter spreads it.
import * as THREE from 'three/webgpu';
import { detailOf } from '../src/detail/index.js';
import { kindOf, kindRule, shapesOf } from './kinds.js';

/** How an asset holds snow: its own `snow`, else its kind's, else the default (kinds.js). */
export const snowOf = (a) => kindOf(a, 'snow');
/** A scattered asset as the row every scatter engine (src/scatter) reads: the asset, its engine, what its kind gives it.
    What only one engine reads of it, that engine adds itself (its `row`: src/scatter/index.js). */
export const scatterRow = (a) => ({ asset: a, name: a.name, uid: a.uid, kind: a.placement.engine, cell: a.placement.cell, seed: a.placement.seed, snow: snowOf(a), detail: detailOf(a) });
/** How many faces a level has. */
export const facesOf = (l) => (typeof l.tris === 'function' ? l.tris() : l.mesh ? (l.mesh.index ? l.mesh.index.length : l.mesh.position.length) / 3 : l.faces ? l.faces.length : l.ball != null ? (l.ball ? 12 * l.ball * l.ball : 1) : 20 * 4 ** (l.rock || 0));   // (ball: a level of the ladder, a ball of so many squares an edge; none: its dot)

/** A level of detail of an asset as a geometry, coloured per face (the nearest level unless one is named). */
export function geometryOf(asset, level = asset.detail.levels[0], shape = 0) {
  // (a plant's meshes are made when asked for, shape by shape: assets/kit/tree.js meshAt; only the library asks here)
  const made = !level.mesh && asset.meshAt ? asset.meshAt(level.i ?? Math.max(0, asset.detail.levels.indexOf(level)), shape) : null;
  if (level.mesh || made) {   // built as a mesh by its own file (a tree): every attribute it made, as it made them; of its shapes (meshes) the one asked
    const g = new THREE.BufferGeometry(), M = made ?? level.meshes?.[shape] ?? level.mesh, V = M.position.length / 3;
    // (the kit hands typed arrays: taken as they are, not copied; a list of numbers is copied into one). Each attribute
    // as long a run a vertex as its length says, never by a list kept here: the kit's `twig`, one number a vertex, was
    // read as three when the list did not know it, its buffer a third too short for the mesh's corners, and WebGPU
    // may drop such a draw whole: the library drew no tree and no shrub (intent 0025)
    for (const [k, v] of Object.entries(M)) {
      if (k === 'index' || k === 'body' || !(Array.isArray(v) || ArrayBuffer.isView(v))) continue;
      const n = v.length / V;
      if (!Number.isInteger(n) || n < 1 || n > 4) { console.warn(`${asset.name}: its mesh's '${k}' is ${v.length} numbers for ${V} corners: left out`); continue; }
      g.setAttribute(k, v instanceof Float32Array ? new THREE.BufferAttribute(v, n) : new THREE.Float32BufferAttribute(v, n));
    }
    if (M.index?.length) g.setIndex(ArrayBuffer.isView(M.index) ? new THREE.BufferAttribute(M.index, 1) : M.index);
    return g;
  }
  const faces = level.faces; if (!faces) return rockPreview(asset, level.rock);
  // a face is [corner, corner, corner, colour] and, where the asset names what it is made of (`materials`), the name
  // of the one this face wears: carried as `part`, its place in that list, and worn by the shader (src/world/place.js)
  const parts = asset.materials ? Object.keys(asset.materials) : null;
  // A face may also carry a colour per corner ([c0, c1, c2] for its colour) and a normal per corner (a sixth entry,
  // [n0, n1, n2]): a rounded thing (a river stone) shaded smooth across its faces rather than flat on each.
  const pos = [], col = [], part = [], nor = [], e1 = [0, 0, 0], e2 = [0, 0, 0];
  for (const [p0, p1, p2, c, m, ns] of faces) {
    let fn = null;
    if (!ns) {   // a flat face: its own normal at every corner
      for (let a = 0; a < 3; a++) { e1[a] = p1[a] - p0[a]; e2[a] = p2[a] - p0[a]; }
      const x = e1[1] * e2[2] - e1[2] * e2[1], y = e1[2] * e2[0] - e1[0] * e2[2], z = e1[0] * e2[1] - e1[1] * e2[0], l = Math.hypot(x, y, z) || 1;
      fn = [x / l, y / l, z / l];
    }
    [p0, p1, p2].forEach((v, k) => { pos.push(...v); col.push(...(Array.isArray(c[0]) ? c[k] : c)); nor.push(...(ns ? ns[k] : fn)); if (parts) part.push(Math.max(0, parts.indexOf(m ?? parts[0]))); });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (parts) g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  return g;
}

/** What an asset's body is to a walker and the camera: its own `solid` block, else its kind's default made from its
    size (assets/kinds.js, intent 0003). */
export function solidOf(asset) {
  if (asset.solid) return asset.solid;
  const k = kindRule(asset, 'solid'), m = (v) => (Array.isArray(v) ? v[1] : v);
  if (!k) return {};   // a kind with nothing solid (grass)
  const L = m(asset.size.length), W = m(asset.size.width ?? asset.size.length);
  if (k.post) return { posts: [{ x: 0, z: 0, r: Math.max(L, W) * k.post }] };
  if (k.box) return { boxes: [{ x: 0, z: 0, w: L, d: W }] };   // (a ceiling, a function of where you stand, only an asset of its own can say)
  return {};   // (leaves: nothing a walker cannot pass, only what he is led round: bodyOfAsset)
}

/** An asset that stands at a place as the one collision engine takes it (src/world/bodies.js: its box and shapes in
    metres of its own frame, its foot at 0): its own `solid` block made into shapes (a wall a round wall with its
    doors, a post a round and a box its footprint, each as tall as the asset, turned as the block says; its ceiling and
    how it is left), else its kind's rule made from its size and what its kit measured (assets/kinds.js shapesOf). */
export function bodyOfAsset(asset) {
  const m = (v) => (Array.isArray(v) ? v[1] : v), H = Math.max(0.5, m(asset.size?.height ?? 2)), L = m(asset.size?.length ?? 1), W = m(asset.size?.width ?? asset.size?.length ?? 1), S = asset.solid;
  const shapes = S ? [
    ...(S.walls || []).map((w) => ({ shape: 'wall', at: [w.x ?? 0, w.z ?? 0], r: w.round, gaps: w.gaps || [], top: H })),
    ...(S.posts || []).map((p) => ({ shape: 'capsule', a: [p.x, 0, p.z], b: [p.x, Math.max(0, H - p.r), p.z], r: p.r })),
    ...(S.boxes || []).map((b) => ({ shape: 'box', at: [b.x, H / 2, b.z], half: [b.w / 2, H / 2, b.d / 2], ...(b.a ? { turn: b.a } : {}) })),
  ] : shapesOf(kindRule(asset, 'solid'), { height: H, length: L, width: W, trunk: asset.trunk?.[0] ?? null });
  // its box: its size, and wherever a shape of it reaches further
  let x = L / 2, z = W / 2;
  for (const s of shapes) {
    const [cx, cz, r] = s.shape === 'wall' ? [s.at[0], s.at[1], s.r] : s.shape === 'capsule' ? [s.a[0], s.a[2], s.r] : s.shape === 'box' ? [s.at[0], s.at[2], Math.hypot(s.half[0], s.half[2])] : [s.at[0], s.at[2], s.r];
    x = Math.max(x, Math.abs(cx) + r); z = Math.max(z, Math.abs(cz) + r);
  }
  return { box: { min: [-x, 0, -z], max: [x, H, z] }, shapes, ...(S?.ceiling ? { ceiling: S.ceiling } : {}), ...(S?.leave ? { leave: S.leave } : {}) };
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
