// The recipes' worker: what a kind makes (assets/zoo/index.js: its family's meshes, its texture), off the page's thread, its
// arrays handed over, not copied. A job is
//   ['mesh', k, l, D?, room?]  kind k's mesh at level l (D: its level's delta, where its family's meshes are solids: its
//                              box too, for the eye's occlusion test: the family's own, else solidBox, below; room: the
//                              most its level holds, { tris, elems }, where its family builds a surface's levels)
//   ['skin', k, size]          its own texture, `size` pixels a side
//   ['bones', k0, n]           the skeletons of kinds k0 … k0 + n, end to end (three rows of four a bone; none: all nought)
//   ['rooms']                  how much room each herd's movers take as they move (the zoo's herdRooms)
//   ['own', k0, n, [[l, idx, elems, D?], …]]   levels every kind has its own of, of kinds k0 … k0 + n (or k0 a list
//                              of kinds, where a drawer's are not one after another), each level as one block as the
//                              heap takes it (src/scatter/heap.js: putBlock): { corners, verts, counts } (counts: a
//                              mesh's corners, or what its family says it counts by: a plant's vertices); and where a
//                              level says its delta D (solids), each kind's box at it: boxes, six numbers a kind
import { meshOf, skinOf, bonesOf, herdRooms } from '../../assets/zoo/index.js';
import { BONES } from '../../assets/kit/solid.js';
import { useBuilder } from '../../assets/kit/surface.js';
import { build, ready as built } from '../../assets/kit/clusters.js';

// the builder of surfaces' hierarchies (meshoptimizer's WebAssembly: here, never on the page), before any job is done
const ready = built.then(() => useBuilder(build));

/** The box round a solid mesh in its own frame, [x0, y0, z0, x1, y1, z1] (assets/kit/solid.js: a vertex's place, 16 bits
    a number over -1 … 1, and its way to where it lies on the coarser mesh it turns into, 10 bits over ± D, its level's
    delta): what the eye's occlusion test takes a thing's box from (src/scatter/drawer.js kindBox). */
function solidBox(v, D, out = new Float32Array(6), at = 0) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let o = 0; o < v.length; o += 4) {
    const a = v[o], c = v[o + 1], e = v[o + 2], f = v[o + 3], p = [(a & 65535) / 32767.5 - 1, (a >>> 16) / 32767.5 - 1, (c & 65535) / 32767.5 - 1];
    const d = [(((e >>> 8) & 1023) - 511) / 511, (((e >>> 18) & 1023) - 511) / 511, (((e >>> 28) | ((f & 63) << 4)) - 511) / 511];
    for (let k = 0; k < 3; k++) for (const x of [p[k], p[k] + d[k] * D]) { if (x < b[k]) b[k] = x; if (x > b[k + 3]) b[k + 3] = x; }
  }
  out.set(b, at); return out;
}

self.onmessage = async ({ data: { id, jobs } }) => {
  await ready;
  const out = [], move = [];
  for (const j of jobs) {
    if (j[0] === 'mesh') { const m = meshOf(j[1], j[2], j[4] ?? null); if (j[3] != null) m.box ??= solidBox(m.verts, j[3]); out.push(m); move.push(m.index.buffer, m.verts.buffer); }
    else if (j[0] === 'skin') { const S = skinOf(j[1], j[2]); out.push(S); for (const l of S.levels) move.push(l.buffer); }
    else if (j[0] === 'rooms') out.push(herdRooms());
    else if (j[0] === 'bones') { const [, k0, n] = j, rows = new Float32Array(n * BONES * 12); for (let i = 0; i < n; i++) { const B = bonesOf(k0 + i); if (B) rows.set(B, i * BONES * 12); } out.push(rows); move.push(rows.buffer); }
    else {
      const [, k0, n, levels] = j, kindOf = (i) => (Array.isArray(k0) ? k0[i] : k0 + i);
      const blocks = levels.map(([l, idx, elems, D]) => ({ l, corners: new Uint32Array(n * idx), verts: new Uint32Array(n * elems * 4), counts: new Uint32Array(n), draws: new Uint32Array(n), ...(D != null ? { boxes: new Float32Array(n * 6) } : {}) }));   // (draws: how many corners each mesh has)
      // (a kind at a time, all its levels: a family may make one of its levels from another it has just made)
      for (let i = 0; i < n; i++) levels.forEach(([l, idx, elems, D], b) => {
        const m = meshOf(kindOf(i), l, { tris: idx / 3, elems });
        if (m.index.length > idx || m.verts.length > elems * 4) throw new Error(`recipes: kind ${kindOf(i)} level ${l} is larger than its place (${m.index.length} corners of ${idx}, ${m.verts.length / 4} elements of ${elems})`);
        blocks[b].corners.set(m.index, i * idx); blocks[b].verts.set(m.verts, i * elems * 4); blocks[b].counts[i] = m.count ?? m.index.length; blocks[b].draws[i] = m.index.length;
        if (D != null) { if (m.box) blocks[b].boxes.set(m.box, i * 6); else solidBox(m.verts, D, blocks[b].boxes, i * 6); }
      });
      for (const B of blocks) move.push(B.corners.buffer, B.verts.buffer, B.counts.buffer, B.draws.buffer, ...(B.boxes ? [B.boxes.buffer] : []));
      out.push(blocks);
    }
  }
  self.postMessage({ id, out }, move);
};
