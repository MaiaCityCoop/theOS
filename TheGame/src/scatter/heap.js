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
//   a vertex: four uint (assets/kit/blob.js says how they are packed); an index: a vertex of its own mesh
import * as THREE from 'three/webgpu';
import { storage, uint, float, vec2, vec3, normalize, abs, max } from 'three/tsl';

export function createHeap(kinds, levels) {
  const L = levels.length; let iAt = 0, vAt = 0;
  const pools = levels.map((l) => {
    const n = l.slots || kinds, p = { idx: l.idx, verts: l.verts, n, own: !l.slots, i0: iAt, v0: vAt, who: new Int32Array(n).fill(-1), used: new Float64Array(n), slot: new Int32Array(kinds).fill(-1) };
    iAt += n * l.idx; vAt += n * l.verts; return p;
  });
  const index = new THREE.StorageBufferAttribute(new Uint32Array(iAt), 1), verts = new THREE.StorageBufferAttribute(new Uint32Array(vAt * 4), 4), table = new THREE.StorageBufferAttribute(new Uint32Array(kinds * L * 4), 4);
  const T = table.array, mask = new Uint32Array(kinds);
  const row = (k, l) => (k * L + l) * 4;
  const masked = (k) => { for (let l = 0; l < L; l++) T[row(k, l) + 3] = mask[k]; table.addUpdateRange(row(k, 0), L * 4); table.needsUpdate = true; };
  const H = {
    kinds, L, pools, version: 0, versions: new Uint32Array(L), bytes: (iAt + vAt * 4 + kinds * L * 4) * 4,
    // as nodes: a level's row of a kind (first index, first vertex, indices, which levels of the kind are there)
    index: storage(index, 'uint', iAt), verts: storage(verts, 'uvec4', vAt), table: storage(table, 'uvec4', kinds * L),
    has: (k, l) => pools[l].slot[k] >= 0,
    /** A kind's level is wanted now (it is not put out while it is). */
    touch(k, l, now) { const s = pools[l].slot[k]; if (s >= 0) pools[l].used[s] = now; },
    /** How many kinds' a level could take in now: its free slots, and those not wanted since `since` (touch's `now`s:
        any count that grows, a clock or a round of asking). */
    room(l, since) { const p = pools[l]; if (p.own) return kinds; let n = 0; for (let s = 0; s < p.n; s++) if (p.who[s] < 0 || p.used[s] < since) n++; return n; },
    /** Put a kind's level in: mesh { index, verts } (blob.js), into a free slot or the one longest unwanted (not wanted
        since `since`). False: no slot to be had (every one is wanted). */
    put(k, l, mesh, now, since = now) {
      const p = pools[l]; let s = p.slot[k];
      if (s < 0) {
        if (p.own) s = k;
        else { let old = Infinity; for (let i = 0; i < p.n; i++) { if (p.who[i] < 0) { s = i; break; } if (p.used[i] < since && p.used[i] < old) { old = p.used[i]; s = i; } } }
        if (s < 0) return false;
        if (p.who[s] >= 0) H.drop(p.who[s], l);
      }
      if (mesh.index.length > p.idx || mesh.verts.length > p.verts * 4) throw new Error(`heap: kind ${k} level ${l} is larger than its slot`);
      const i0 = p.i0 + s * p.idx, v0 = p.v0 + s * p.verts;
      index.array.set(mesh.index, i0); index.addUpdateRange(i0, mesh.index.length); index.needsUpdate = true;
      verts.array.set(mesh.verts, v0 * 4); verts.addUpdateRange(v0 * 4, mesh.verts.length); verts.needsUpdate = true;
      p.who[s] = k; p.slot[k] = s; p.used[s] = now;
      const r = row(k, l); T[r] = i0; T[r + 1] = v0; T[r + 2] = mesh.index.length;
      mask[k] |= 1 << l; masked(k); H.version++; H.versions[l]++;
      return true;
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

/** True where, of a kind whose levels there are `mask`, level `level` is the one to draw when level `want` is asked for:
    the finest that is there and no finer than asked. (uint nodes) */
export const effective = (mask, want, level) => {
  const d = level.sub(want.min(level));   // (want > level: never; kept from wrapping)
  return want.lessThanEqual(level).and(mask.shiftRight(want.min(level)).bitAnd(uint(2).shiftLeft(d).sub(uint(1))).equal(uint(1).shiftLeft(d)));
};

/** The vertex a draw is at (its vertex index `vid`) of the mesh a row names: { ok, p (its place, in the mesh's own frame),
    n (its normal), c (its colour) }. ok: the mesh has such a vertex (a draw is as long as its level's longest mesh). */
export const heapVertex = (H, R, vid) => {
  const v = H.verts.element(R.y.add(H.index.element(R.x.add(vid.min(R.z.max(uint(1)).sub(uint(1)))))));
  const u16 = (x) => float(x.bitAnd(uint(0xffff))).div(65535).mul(2).sub(1), hi = (x) => u16(x.shiftRight(uint(16)));
  const e = vec2(u16(v.z), hi(v.z)), nz = float(1).sub(abs(e.x)).sub(abs(e.y)), t = max(nz.negate(), 0);
  const n = normalize(vec3(e.x.add(e.x.greaterThanEqual(0).select(t.negate(), t)), e.y.add(e.y.greaterThanEqual(0).select(t.negate(), t)), nz));
  const b8 = (s) => float(v.w.shiftRight(uint(s)).bitAnd(uint(255))).div(255);
  return { ok: vid.lessThan(R.z), p: vec3(u16(v.x), hi(v.x), u16(v.y)), n, c: vec3(b8(0), b8(8), b8(16)) };
};
