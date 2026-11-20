// The recipes' worker: what a kind makes (assets/zoo/index.js: its family's meshes, its texture), off the page's thread, its
// arrays handed over, not copied. A job is
//   ['mesh', k, l]             kind k's mesh at level l of the ladder
//   ['skin', k, size]          its own texture, `size` pixels a side
//   ['bones', k0, n]           the skeletons of kinds k0 … k0 + n, end to end (three rows of four a bone; none: all nought)
//   ['rooms']                  how much room each herd's movers take as they move (the zoo's herdRooms)
//   ['own', k0, n, [[l, idx, elems], …]]   levels every kind has its own of, of kinds k0 … k0 + n (or k0 a list of
//                              kinds, where a drawer's are not one after another), each level as one block as the
//                              heap takes it (src/scatter/heap.js: putBlock): { corners, verts, counts } (counts: a
//                              mesh's corners, or what its family says it counts by: a plant's vertices)
import { meshOf, skinOf, bonesOf, herdRooms } from '../../assets/zoo/index.js';
import { BONES } from '../../assets/kit/solid.js';

self.onmessage = ({ data: { id, jobs } }) => {
  const out = [], move = [];
  for (const j of jobs) {
    if (j[0] === 'mesh') { const m = meshOf(j[1], j[2]); out.push(m); move.push(m.index.buffer, m.verts.buffer); }
    else if (j[0] === 'skin') { const S = skinOf(j[1], j[2]); out.push(S); for (const l of S.levels) move.push(l.buffer); }
    else if (j[0] === 'rooms') out.push(herdRooms());
    else if (j[0] === 'bones') { const [, k0, n] = j, rows = new Float32Array(n * BONES * 12); for (let i = 0; i < n; i++) { const B = bonesOf(k0 + i); if (B) rows.set(B, i * BONES * 12); } out.push(rows); move.push(rows.buffer); }
    else {
      const [, k0, n, levels] = j, kindOf = (i) => (Array.isArray(k0) ? k0[i] : k0 + i);
      const blocks = levels.map(([l, idx, elems]) => ({ l, corners: new Uint32Array(n * idx), verts: new Uint32Array(n * elems * 4), counts: new Uint32Array(n), draws: new Uint32Array(n) }));   // (draws: how many corners each mesh has)
      // (a kind at a time, all its levels: a family may make one of its levels from another it has just made)
      for (let i = 0; i < n; i++) levels.forEach(([l, idx, elems], b) => {
        const m = meshOf(kindOf(i), l);
        if (m.index.length > idx || m.verts.length > elems * 4) throw new Error(`recipes: kind ${kindOf(i)} level ${l} is larger than its place (${m.index.length} corners of ${idx}, ${m.verts.length / 4} elements of ${elems})`);
        blocks[b].corners.set(m.index, i * idx); blocks[b].verts.set(m.verts, i * elems * 4); blocks[b].counts[i] = m.count ?? m.index.length; blocks[b].draws[i] = m.index.length;
      });
      for (const B of blocks) move.push(B.corners.buffer, B.verts.buffer, B.counts.buffer, B.draws.buffer);
      out.push(blocks);
    }
  }
  self.postMessage({ id, out }, move);
};
