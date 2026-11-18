// The cut (intent 0038, stage 8): what of a surface is drawn, cluster by cluster, by the one measure. A surface is its
// cluster hierarchy (assets/kit/clusters.js), a level of it in the heap as assets/kit/surface.js packs it. The rule, for
// every cluster: it is drawn where its own error is at most the error allowed and its parent's is over it, the error
// allowed being the dial (U.uErrorPx) over the pixels drawn a unit of the thing's largest side covers (src/detail/error.js). Every
// cluster of a group holds the same numbers, so each decides alone and the surface still closes. Each turns into its
// parent while the parent's error falls from BAND times the allowed to the allowed (its vertices move to their places
// on the parent's surface: the morph), so a cluster has become its parent before it gives way to it.
//   - A thing small on screen is drawn at a level the tier's packing chose (src/scatter/drawer.js tierAll): the rule is
//     run in the vertex stage, by the thing's own distance (ruleAt, below).
//   - A thing PX_CUT pixels drawn or larger is drawn at level 0, its clusters tested in a compute pass, each by its own
//     distance (its sphere's, from the thing's own as the thing grows from PX_CUT to twice that, so at PX_CUT the two
//     ways choose alike); what passes is listed, and drawn by one indirect draw, a cluster an instance (createCut).
// 32-bit atomics only, the hardware rasteriser only (tools/gate/cut.html checks it in WebKit and in Chrome).
import * as THREE from 'three/webgpu';
import { Fn, If, uint, float, vec3, uvec4, instancedArray, storage, atomicAdd, atomicStore, atomicLoad, workgroupId, localId, uintBitsToFloat, floatBitsToUint, max, min, mix, clamp, smoothstep, length } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { heapRow, sinceCame } from './heap.js';
import { camDist } from '../world/land.nodes.js';
import { spanAt } from '../detail/measure.js';
import { BAND, PX_CUT, surfaceBand } from '../detail/error.js';
import { turnOf } from './row.js';
import { gpuStorage, limitOf, roomOf } from '../core/gpu.js';

const GROW = 1.5;   // seconds a level that came late takes to refine from what stood in for it (the drawer's)
const MAXT = 128;   // a cluster's most triangles (assets/kit/clusters.js)

/** A level's header and cluster c's numbers, from the heap (R: the kind's row at that level). */
export const levelHead = (H, R) => { const h = H.elems.element(R.y); return { n: h.x, lo: uintBitsToFloat(h.y), hi: uintBitsToFloat(h.z) }; };
export const clusterOf = (H, R, c) => {
  const at = R.y.add(uint(1)).add(c.mul(uint(3))), r0 = H.elems.element(at);
  return { first: r0.x.shiftRight(uint(8)), tris: r0.x.bitAnd(uint(255)).add(uint(1)), D: uintBitsToFloat(r0.y), self: uintBitsToFloat(r0.z), parent: uintBitsToFloat(r0.w), at };
};
/** How far a cluster's sphere (s: its numbers, a uvec4 of the heap: its middle and radius, of the thing's largest side)
    lies from the eye, its nearest point, as the measure has distances: for a thing of rows A, B. */
export const sphereFrom = (s, A, B) => {
  const { turn } = turnOf(B.x), q = vec3(uintBitsToFloat(s.x), uintBitsToFloat(s.y), uintBitsToFloat(s.z));
  return max(length(vec3(A.x, A.z, A.y).add(turn(q.mul(A.w))).sub(U.uCam)).sub(uintBitsToFloat(s.w).mul(A.w)), 1e-3).mul(U.uLodInv);
};
/** The error allowed (of the thing's largest side) for a thing of rows A, d metres off as the measure has distances
    (its own: camDist; ?truth's reach counts as the thing's own distance says): the one rule's (src/detail/error.js),
    the dial over the pixels drawn its size covers, so it moves with the dial and the live pixel. */
export const allowedAt = (A, dT, d = dT) => U.uErrorPx.mul(d).div(spanAt(A.w, dT));
/** The size on screen (pixels drawn) from which a thing's clusters are tested one by one: PX_CUT at the dial's rest,
    moving with the dial (where level 0 ends: src/detail/error.js). A node. */
export const pxCut = () => U.uErrorPx.mul(PX_CUT);
/** As a level came (R its row): the error a cut of it is run at, refined over GROW seconds from what its coarser level
    showed (its least: `from`) to b. */
export const eased = (R, b, from, time) => mix(float(from), b, smoothstep(0, GROW, sinceCame(R, time)));
/** The rule: drawn, and how far it has turned into its parent (0 … 1), for own and parent errors at allowed errors
    bS, bP. */
export const ruleOf = (self, parent, bS, bP) => ({ drawn: self.lessThanEqual(bS).and(parent.greaterThan(bP)), t: smoothstep(bP.mul(BAND), bP, parent) });

/** Level 0's cut for a tier's bucket of the things drawn there (T: a tier of src/scatter/tier.js; k: the bucket; H: the
    heap; room: the most a kind's level holds, { tris, clusters }: src/scatter/rooms.js; things: the most things that can
    be at level 0 at once, its tier's to say): { passes (for every frame, after the packing), entry(i): the i-th listed
    { thing, cluster, t }, thing(j, row): the j-th packed thing's row, geometry }. */
export function createCut({ T, k = 0, H, room, name, things }) {
  // (MAXC: the most clusters a kind's level holds, each tested by a thread of its own; MOST: the list's room, an entry 16
  // bytes: as many as its things can ask for at once, every packed thing every cluster of its level; no more than one
  // buffer the GPU binds, nor than the geometry's class has room for: src/core/classes.js)
  const S = T.slots, cap = things, MAXC = Math.max(1, room.clusters), MOST = Math.max(1, Math.min(cap * MAXC, Math.floor(Math.min(limitOf('maxStorageBufferBindingSize') || Infinity, limitOf('maxBufferSize') || Infinity, roomOf('geometry')) / 16)));
  // (the list the GPU's alone: it writes it and reads it)
  const list = gpuStorage('uvec4', MOST, `${name}: the cut's list`, 'geometry').node, count = instancedArray(1, 'uint').toAtomic(), packed = storage(T.args, 'uint', T.args.array.length).toReadOnly();
  const drawArgs = new THREE.IndirectStorageBufferAttribute(new Uint32Array([MAXT * 3, 0, 0, 0, 0]), 5), DA = storage(drawArgs, 'uint', 5);
  const runArgs = new THREE.IndirectStorageBufferAttribute(new Uint32Array([1, 1, 1]), 1), RA = storage(runArgs, 'uint', 3);   // (its workgroups: the clusters a thing can have across, the things packed down)
  const thing = (j, row) => T.data.element(T.offAt(uint(k)).add(j).mul(uint(S)).add(uint(row)));   // (where its bucket's things begin: the tier's packing says)
  const LO1 = surfaceBand(1)[0], PXC = pxCut();
  // (how many workgroups: a thread a cluster of every thing packed, its count as large as it can be)
  const start = Fn(() => { atomicStore(count.element(0), uint(0)); RA.element(0).assign(uint(Math.ceil(MAXC / 64))); RA.element(1).assign(packed.element(k * 5 + 1).min(uint(cap)).max(uint(1))); })().compute(1);
  const test = Fn(() => {
    const j = workgroupId.y, c = workgroupId.x.mul(uint(64)).add(localId.x);
    If(j.lessThan(packed.element(k * 5 + 1).min(uint(cap))), () => {
      const A = thing(j, 0).toVar(), B = thing(j, 1).toVar(), R = heapRow(H, uint(B.y), uint(0)).toVar(), head = levelHead(H, R);
      If(c.lessThan(head.n), () => {
        const C = clusterOf(H, R, c), s1 = H.elems.element(C.at.add(uint(1))), s2 = H.elems.element(C.at.add(uint(2)));
        // each sphere's own distance, from the thing's as it grows from PX_CUT to twice that
        const dT = camDist(A.xy), w = smoothstep(PXC, PXC.mul(2), spanAt(A.w, dT).div(max(dT, 1e-3)));
        const bOf = (s) => clamp(eased(R, allowedAt(A, dT, mix(dT, sphereFrom(s, A, B), w)), LO1, U.uTime), head.lo, head.hi);
        const r = ruleOf(C.self, C.parent, bOf(s1), bOf(s2));
        If(r.drawn, () => { const i = atomicAdd(count.element(0), uint(1)); If(i.lessThan(uint(MOST)), () => { list.element(i).assign(uvec4(j, c, floatBitsToUint(r.t), 0)); }); });
      });
    });
  })().compute(cap * Math.ceil(MAXC / 64) * 64, [64]);   // (its count as large as it can be: three returns early past it)
  test.dispatchSize = runArgs;
  const end = Fn(() => { DA.element(1).assign(atomicLoad(count.element(0)).min(uint(MOST))); })().compute(1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: MAXT * 3 }, (_, i) => i), 1)); geometry.setIndirect(drawArgs); geometry.instanceCount = MOST;
  return {
    passes: [start, test, end], geometry, args: drawArgs,
    entry: (i) => { const e = list.element(i); return { thing: e.x, cluster: e.y, t: uintBitsToFloat(e.z) }; },
    thing,
  };
}
