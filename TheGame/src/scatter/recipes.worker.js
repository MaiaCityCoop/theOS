// The recipes' worker: what a kind makes (assets/zoo/index.js: its family's meshes, its texture), off the page's thread, its
// arrays handed over, not copied. A job is
//   ['mesh', k, l]             kind k's mesh at level l of the ladder
//   ['skin', k, size]          its own texture, `size` pixels a side
//   ['bones', k0, n]           the skeletons of kinds k0 … k0 + n, end to end (three rows of four a bone; none: all nought)
//   ['own', k0, n, [[l, idx, elems], …]]   levels every kind has its own of, of kinds k0 … k0 + n, each level as one
//                              block as the heap takes it (src/scatter/heap.js: putBlock): { corners, verts, counts }
import { meshOf, skinOf, bonesOf } from '../../assets/zoo/index.js';
import { BONES } from '../../assets/kit/solid.js';

self.onmessage = ({ data: { id, jobs } }) => {
  const out = [], move = [];
  for (const j of jobs) {
    if (j[0] === 'mesh') { const m = meshOf(j[1], j[2]); out.push(m); move.push(m.index.buffer, m.verts.buffer); }
    else if (j[0] === 'skin') { const S = skinOf(j[1], j[2]); out.push(S); for (const l of S.levels) move.push(l.buffer); }
    else if (j[0] === 'bones') { const [, k0, n] = j, rows = new Float32Array(n * BONES * 12); for (let i = 0; i < n; i++) { const B = bonesOf(k0 + i); if (B) rows.set(B, i * BONES * 12); } out.push(rows); move.push(rows.buffer); }
    else {
      const [, k0, n, levels] = j, blocks = levels.map(([l, idx, elems]) => {
        const corners = new Uint32Array(n * idx), verts = new Uint32Array(n * elems * 4), counts = new Uint32Array(n);
        for (let i = 0; i < n; i++) { const m = meshOf(k0 + i, l); corners.set(m.index, i * idx); verts.set(m.verts, i * elems * 4); counts[i] = m.index.length; }
        move.push(corners.buffer, verts.buffer, counts.buffer);
        return { l, corners, verts, counts };
      });
      out.push(blocks);
    }
  }
  self.postMessage({ id, out }, move);
};
