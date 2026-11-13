// The heap: every kind's meshes at every level in two buffers on the GPU (their triangles' corners, their vertices), and a
// table that says where each lies. A draw reads its vertices from there by its kind's number (heapVertex), so one draw
// call draws a level of every kind at once: what a new kind costs is its bytes, not a draw call, a buffer or a shader.
//
// A level is either every kind's own (its coarse levels: small, always there) or a pool of a few slots (its fine levels:
// large, there only for the kinds that are near). A kind's fine level is put in when it arrives (a worker's, a file's),
// into a free slot or the one longest unwanted; until then, and after it is put out, its next coarser level is drawn in
// its place (the table's mask says which levels of a kind are there: effective).
//
// What draws a level must be told when the heap has changed (versions: a count a level, raised when a kind's level is
// put in or out): a level's draw depends on that level and the next finer one only.
//
//   createHeap(kinds, [{ idx, verts, slots? }, …])   levels finest first: the most indices and vertices a kind has at it;
//                                                     slots: how many kinds' it holds at once (none: every kind's)
//   a vertex: twice four uint (assets/kit/blob.js says how they are packed): as it is, and as it lies on the next
//   coarser level's mesh, so a level can turn into the next before that takes over (heapVertex's `t`);
//   an index: a vertex of its own mesh
//   The table also says when a level came (`came`): what draws it lets it grow out of the coarser one from then.
import * as THREE from 'three/webgpu';
import { storage, uint, float, vec2, vec3, normalize, abs, max, mix } from 'three/tsl';

export function createHeap(kinds, levels) {
  const L = levels.length; let iAt = 0, vAt = 0;
  const pools = levels.map((l) => {
    const n = l.slots || kinds, p = { idx: l.idx, verts: l.verts, n, own: !l.slots, i0: iAt, v0: vAt, who: new Int32Array(n).fill(-1), used: new Float64Array(n), slot: new Int32Array(kinds).fill(-1) };
    iAt += n * l.idx; vAt += n * l.verts; return p;
  });
  const index = new THREE.StorageBufferAttribute(new Uint32Array(iAt), 1), verts = new THREE.StorageBufferAttribute(new Uint32Array(vAt * 8), 4), table = new THREE.StorageBufferAttribute(new Uint32Array(kinds * L * 4), 4);
  const T = table.array, mask = new Uint32Array(kinds), came = new Uint32Array(kinds * L);   // came: when a kind's level was put in, sixteenths of a second
  const row = (k, l) => (k * L + l) * 4;
  const masked = (k, quiet) => { for (let l = 0; l < L; l++) T[row(k, l) + 3] = (mask[k] | (came[k * L + l] << 12)) >>> 0; if (!quiet) { table.addUpdateRange(row(k, 0), L * 4); table.needsUpdate = true; } };
  const H = {
    kinds, L, pools, version: 0, versions: new Uint32Array(L), bytes: (iAt + vAt * 8 + kinds * L * 4) * 4,
    // as nodes: a level's row of a kind (first index, first vertex, indices, which levels of the kind are there and when this one came)
    index: storage(index, 'uint', iAt), verts: storage(verts, 'uvec4', vAt * 2), table: storage(table, 'uvec4', kinds * L),
    has: (k, l) => pools[l].slot[k] >= 0,
    /** A kind's level is wanted now (it is not put out while it is). */
    touch(k, l, now) { const s = pools[l].slot[k]; if (s >= 0) pools[l].used[s] = now; },
    /** How many kinds' a level could take in now: its free slots, and those not wanted since `since` (touch's `now`s:
        any count that grows, a clock or a round of asking). */
    room(l, since) { const p = pools[l]; if (p.own) return kinds; let n = 0; for (let s = 0; s < p.n; s++) if (p.who[s] < 0 || p.used[s] < since) n++; return n; },
    /** Put a kind's level in: mesh { index, verts } (blob.js), into a free slot or the one longest unwanted (not wanted
        since `since`). time: the clock's seconds now (what draws it grows it in from then). False: no slot to be had
        (every one is wanted). */
    put(k, l, mesh, now, since = now, time = 0, quiet = false) {
      const p = pools[l]; let s = p.slot[k];
      if (s < 0) {
        if (p.own) s = k;
        else { let old = Infinity; for (let i = 0; i < p.n; i++) { if (p.who[i] < 0) { s = i; break; } if (p.used[i] < since && p.used[i] < old) { old = p.used[i]; s = i; } } }
        if (s < 0) return false;
        if (p.who[s] >= 0) H.drop(p.who[s], l);
      }
      if (mesh.index.length > p.idx || mesh.verts.length > p.verts * 8) throw new Error(`heap: kind ${k} level ${l} is larger than its slot`);
      const i0 = p.i0 + s * p.idx, v0 = p.v0 + s * p.verts;
      index.array.set(mesh.index, i0); verts.array.set(mesh.verts, v0 * 8);
      if (!quiet) { index.addUpdateRange(i0, mesh.index.length); index.needsUpdate = true; verts.addUpdateRange(v0 * 8, mesh.verts.length); verts.needsUpdate = true; }
      p.who[s] = k; p.slot[k] = s; p.used[s] = now; came[k * L + l] = Math.min(0xfffff, Math.round(time * 16));
      const r = row(k, l); T[r] = i0; T[r + 1] = v0 * 2; T[r + 2] = mesh.index.length;
      mask[k] |= 1 << l; masked(k, quiet); H.version++; H.versions[l]++;
      return true;
    },
    /** Send the GPU what was put in quietly (put's last argument: many at once, sent as one piece): kinds k0 … k0 + n of
        the levels every kind has its own of. */
    sync(k0, n) {
      for (const p of pools) if (p.own) { index.addUpdateRange(p.i0 + k0 * p.idx, n * p.idx); verts.addUpdateRange((p.v0 + k0 * p.verts) * 8, n * p.verts * 8); }
      table.addUpdateRange(row(k0, 0), n * L * 4); index.needsUpdate = verts.needsUpdate = table.needsUpdate = true;
    },
    /** Put a kind's level out. */
    drop(k, l) {
      const p = pools[l], s = p.slot[k]; if (s < 0) return;
      p.who[s] = -1; p.slot[k] = -1; T[row(k, l) + 2] = 0; mask[k] &= ~(1 << l); masked(k); H.version++; H.versions[l]++;
    },
    /** How many kinds' levels are in, level by level. */
    held: () => pools.map((p) => { let n = 0; for (let s = 0; s < p.n; s++) if (p.who[s] >= 0) n++; return n; }),
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

// a packed vertex unpacked: its place in the mesh's own frame, its normal, its pattern and its shade
const unpacked = (v) => {
  const u16 = (x) => float(x.bitAnd(uint(0xffff))).div(65535).mul(2).sub(1), hi = (x) => u16(x.shiftRight(uint(16)));
  const e = vec2(u16(v.z), hi(v.z)), nz = float(1).sub(abs(e.x)).sub(abs(e.y)), k = max(nz.negate(), 0);
  const n = vec3(e.x.add(e.x.greaterThanEqual(0).select(k.negate(), k)), e.y.add(e.y.greaterThanEqual(0).select(k.negate(), k)), nz);
  return { p: vec3(u16(v.x), hi(v.x), u16(v.y)), n, mask: float(v.y.shiftRight(uint(16)).bitAnd(uint(255))).div(255), shade: float(v.y.shiftRight(uint(24))).div(255) };
};
/** The vertex a draw is at (its vertex index `vid`) of the mesh a row names, t of the way (0 … 1) to where it lies on the
    next coarser level's mesh: { p (its place, in the mesh's own frame), n (its normal), mask, shade }. (Only where the
    mesh has such a vertex: vid under R.z; a draw is as long as its level's longest mesh.) */
export const heapVertex = (H, R, vid, t) => {
  const at = R.y.add(H.index.element(R.x.add(vid.min(R.z.max(uint(1)).sub(uint(1))))).mul(uint(2))), a = unpacked(H.verts.element(at)), b = unpacked(H.verts.element(at.add(uint(1))));
  return { p: mix(a.p, b.p, t), n: normalize(mix(a.n, b.n, t)), mask: mix(a.mask, b.mask, t), shade: mix(a.shade, b.shade, t) };
};
