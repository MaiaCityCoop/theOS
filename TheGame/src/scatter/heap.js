// The heap: every kind's meshes at every level in two buffers on the GPU (their triangles' corners, their vertices), and a
// table that says where each lies. A draw reads its vertices from there by its kind's number (heapElem), so one draw
// call draws a level of every kind at once: what a new kind costs is its bytes, not a draw call, a buffer or a shader.
//
// The meshes are on the GPU only (src/core/gpu.js): a mesh is sent when it is put in and not kept on the page (what
// made it can make it again, or the browser has kept it: src/core/kept.js). Only the table is kept twice (it is small).
//
// A level is one of three:
//   - every kind's own (its coarse levels: small, always there; put in a block of kinds at a time: putBlock);
//   - a pool of a few slots (its fine levels: large, there only for the kinds that are near). A kind's fine level is
//     put in when it arrives, into a free slot or the one longest unwanted; until then, and after it is put out, its
//     next coarser level is drawn in its place (the table's mask says which levels of a kind are there: effective);
//   - one mesh for every kind (`one`: the dot).
//
// What draws a level must be told when the heap has changed (versions: a count a level, raised when a kind's level is
// put in or out): a level's draw depends on that level and the next finer one only.
//
//   createHeap({ kinds, name, levels: [{ idx, elems, slots?, one? }, …] })   levels finest first: the most corners
//                         and elements a kind has at it; slots: how many kinds' it holds at once (none: every kind's)
//   an element: four numbers of 32 bits, 16 bytes; a vertex is one of them (a solid: assets/kit/solid.js) or several
//   (what draws it knows: heapElem's `per`); a corner: the number of a vertex of its own mesh
//   The table also says when a level came (`came`): what draws it lets it grow out of the coarser one from then.
import * as THREE from 'three/webgpu';
import { storage, uint, float } from 'three/tsl';
import { gpuStorage, note } from '../core/gpu.js';

export function createHeap({ kinds, levels, name = 'heap' }) {
  const L = levels.length; let iAt = 0, eAt = 0;
  const pools = levels.map((l) => {
    const n = l.one ? 1 : l.slots || kinds, own = !l.slots && !l.one;
    const p = { idx: l.idx, elems: l.elems, n, own, one: !!l.one, i0: iAt, e0: eAt, held: 0, who: own || l.one ? null : new Int32Array(n).fill(-1), used: own || l.one ? null : new Float64Array(n), slot: own || l.one ? null : new Int32Array(kinds).fill(-1) };
    iAt += n * l.idx; eAt += n * l.elems; return p;
  });
  const index = gpuStorage('uint', iAt, `${name}: corners`), elems = gpuStorage('uvec4', eAt, `${name}: vertices`), table = new THREE.StorageBufferAttribute(new Uint32Array(kinds * L * 4), 4);
  note(`${name}: table`, table.array.byteLength, table.array.byteLength);
  const T = table.array, mask = new Uint32Array(kinds), came = new Uint32Array(kinds * L);   // came: when a kind's level was put in, sixteenths of a second
  const row = (k, l) => (k * L + l) * 4;
  const masked = (k, quiet) => { for (let l = 0; l < L; l++) T[row(k, l) + 3] = (mask[k] | (came[k * L + l] << 12)) >>> 0; if (!quiet) { table.addUpdateRange(row(k, 0), L * 4); table.needsUpdate = true; } };
  const H = {
    kinds, L, pools, version: 0, versions: new Uint32Array(L), bytes: index.bytes + elems.bytes + table.array.byteLength,
    // as nodes: its corners, its elements, and a level's row of a kind (first corner, first element, corners, which
    // levels of the kind are there and when this one came)
    index: index.node, elems: elems.node, table: storage(table, 'uvec4', kinds * L),
    has: (k, l) => ((mask[k] >> l) & 1) === 1,
    /** A kind's level is wanted now (it is not put out while it is). */
    touch(k, l, now) { const p = pools[l]; if (p.slot && p.slot[k] >= 0) p.used[p.slot[k]] = now; },
    /** How many kinds' a level could take in now: its free slots, and those not wanted since `since` (touch's `now`s:
        any count that grows, a clock or a round of asking). */
    room(l, since) { const p = pools[l]; if (!p.slot) return kinds; let n = 0; for (let s = 0; s < p.n; s++) if (p.who[s] < 0 || p.used[s] < since) n++; return n; },
    /** Put a kind's level in: mesh { index, verts } (what a recipe makes: assets/kit/zoo.js), sent to the GPU at once.
        Into the kind's own place, or (a pooled level) a free slot or the one longest unwanted (not wanted since
        `since`). time: the clock's seconds now (what draws it grows it in from then). False: no slot to be had. */
    put(k, l, mesh, now = 0, since = now, time = 0) {
      const p = pools[l]; let s = p.own ? k : p.slot[k];
      if (!p.own && s < 0) {
        let old = Infinity; for (let i = 0; i < p.n; i++) { if (p.who[i] < 0) { s = i; break; } if (p.used[i] < since && p.used[i] < old) { old = p.used[i]; s = i; } }
        if (s < 0) return false;
        if (p.who[s] >= 0) H.drop(p.who[s], l);
      }
      if (mesh.index.length > p.idx || mesh.verts.length > p.elems * 4) throw new Error(`heap: kind ${k} level ${l} is larger than its place`);
      const i0 = p.i0 + s * p.idx, e0 = p.e0 + s * p.elems;
      index.write(i0, mesh.index); elems.write(e0 * 4, mesh.verts);
      if (!p.own) { p.who[s] = k; p.slot[k] = s; p.used[s] = now; }
      if (!H.has(k, l)) p.held++;
      came[k * L + l] = Math.min(0xfffff, Math.round(time * 16));
      const r = row(k, l); T[r] = i0; T[r + 1] = e0; T[r + 2] = mesh.index.length;
      mask[k] |= 1 << l; masked(k); H.version++; H.versions[l]++;
      return true;
    },
    /** Put in a level of kinds k0 … k0 + n at once (a level every kind has its own of): their corners and elements end
        to end, each kind's in a place as large as the level's (idx corners, elems elements); counts: how many corners
        each has. Two pieces to the GPU, whatever n. */
    putBlock(l, k0, n, corners, verts, counts) {
      const p = pools[l]; if (!p.own) throw new Error('heap: putBlock is for a level every kind has its own of');
      index.write(p.i0 + k0 * p.idx, corners); elems.write((p.e0 + k0 * p.elems) * 4, verts);
      for (let j = 0; j < n; j++) { const k = k0 + j, r = row(k, l); if (!H.has(k, l)) p.held++; T[r] = p.i0 + k * p.idx; T[r + 1] = p.e0 + k * p.elems; T[r + 2] = counts[j]; mask[k] |= 1 << l; masked(k, true); }
      table.addUpdateRange(row(k0, 0), n * L * 4); table.needsUpdate = true; H.version++; H.versions[l]++;
    },
    /** One mesh for every kind's level l (a level made `one`). */
    putAll(l, mesh) {
      const p = pools[l]; index.write(p.i0, mesh.index); elems.write(p.e0 * 4, mesh.verts); p.held = kinds;
      for (let k = 0; k < kinds; k++) { const r = row(k, l); T[r] = p.i0; T[r + 1] = p.e0; T[r + 2] = mesh.index.length; mask[k] |= 1 << l; masked(k, true); }
      table.addUpdateRange(0, T.length); table.needsUpdate = true; H.version++; H.versions[l]++;
    },
    /** Put a kind's level out (a pooled level). */
    drop(k, l) {
      const p = pools[l], s = p.slot ? p.slot[k] : -1; if (s < 0) return;
      p.who[s] = -1; p.slot[k] = -1; p.held--; T[row(k, l) + 2] = 0; mask[k] &= ~(1 << l); masked(k); H.version++; H.versions[l]++;
    },
    /** How many kinds' levels are in, level by level. */
    held: () => pools.map((p) => p.held),
  };
  return H;
}

/** A level's row of a kind, as a node (in a compute pass or a vertex stage). */
export const heapRow = (H, kind, level) => H.table.element(kind.mul(uint(H.L)).add(level));

/** Which of a kind's levels are there, from its row (a uint node: a bit a level). */
export const heldOf = (R) => R.w.bitAnd(uint(0xfff));
/** How long ago, seconds, a row's level came (now: the clock's seconds, a node). */
export const sinceCame = (R, now) => now.sub(float(R.w.shiftRight(uint(12))).div(16)).max(0);

/** True where, of a kind whose levels there are `mask`, level `level` is the one to draw when level `want` is asked for:
    the finest that is there and no finer than asked. (uint nodes) */
export const effective = (mask, want, level) => {
  const d = level.sub(want.min(level));   // (want > level: never; kept from wrapping)
  return want.lessThanEqual(level).and(mask.shiftRight(want.min(level)).bitAnd(uint(2).shiftLeft(d).sub(uint(1))).equal(uint(1).shiftLeft(d)));
};

/** The element a draw is at: of the mesh a row names, its corner `vid` (the draw's vertex index; only under R.z: a draw
    is as long as its level's longest mesh), the j-th element of that vertex (per: elements a vertex). A uvec4 node. */
export const heapElem = (H, R, vid, per = 1, j = 0) => {
  const v = H.index.element(R.x.add(vid)), at = R.y.add(per === 1 ? v : v.mul(uint(per)));
  return H.elems.element(j ? at.add(uint(j)) : at);
};
