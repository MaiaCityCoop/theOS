// Scatter: what stands on the land (blades, stones, boulders), a tier at a time. A tier is one instanced draw call: its
// instances are the cells of the patches the camera's frustum touches inside the tier's band of distances, chosen anew
// each frame. A patch is only a number pair in a uniform array; what stands in a cell is hashed in the vertex stage, so
// blades stand where the lens looks and nowhere else, and choosing them builds nothing. A cell that holds nothing is
// sent off screen (offScreen) before any of its work is done.
//
// On WebGPU a tier that brings a `live` function goes further: a compute pass runs it once per cell, and packs only the
// cells that hold something into a buffer (a few vec4 each); the draw reads its count from the GPU (indirect), so the
// vertex stage runs only for what stands, and reads it ready-made. Without WebGPU (the WebGL 2 fallback) the same
// function runs in the vertex stage, per vertex, as before.
import * as THREE from 'three/webgpu';
import { Fn, If, uint, int, ivec2, vec4, uniform, uniformArray, instancedArray, storage, atomicAdd, atomicStore, atomicLoad, min, instanceIndex, cameraProjectionMatrix, cameraViewMatrix } from 'three/tsl';
import { boxIn } from '../core/frustum.js';
import { gpuStorage, more } from '../core/gpu.js';

export const MAXP = 384;   // patches a tier can draw at once

/** where a vertex that should not be drawn goes */
export const offScreen = () => vec4(2, 2, 2, 1);
/** a world point to the clip space of whichever camera draws it (the eye's, or the shadow's) */
export const clipOf = (w) => cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1));

export class Tier {
  /** cell: metres per cell; P: cells per patch side; near/far: the band, in metres as a 68° lens sees them.
      cull: metres the eye's frustum is widened by before a patch outside it is dropped (a shadow's reach), or false to keep
      every patch; fixed: metres round the camera, whatever the lens.
      Without `live`: material(cellNode) is the tier's node material, given the cell each instance stands for.
      With `live` (and `gpu`, a WebGPU renderer's): live(cellNode) -> { alive, data: [vec4, …] } says what stands in a cell;
      material({ read }) is the material, read(k) its k-th vec4 of `slots`, ready-made; `cap` the most that may stand at once. */
  constructor(scene, geometry, material, { cell, P, near = 0, far, order = 0, live = null, gpu = false, cap = 0, slots = 0, cull = 0, fixed = 0 }) {
    this.cull = cull; this.fixed = fixed; this.P = P; this.S = cell * P; this.near = Math.max(0, near); this.far = far; this.n = 0; this.over = false;
    this.list = Array.from({ length: MAXP }, () => new THREE.Vector2());
    // (its numbers as uniforms, not written into its code: two tiers that differ only in them, the levels of one thing,
    // are then one shader to the GPU, compiled once: src/scatter/trees.js)
    const patches = uniformArray(this.list, 'vec2'), P2 = uniform(P * P, 'uint'), uP = uniform(P, 'int'), uCap = uniform(cap, 'uint');
    const cellOf = (index) => { const pid = index.div(P2), b = int(index.sub(pid.mul(P2))); return ivec2(patches.element(pid)).add(ivec2(b.mod(uP), b.div(uP))); };   // which patch of the list, which cell of the patch
    // buckets: geometry may be a list (the shapes of one thing): one mesh each, but the cells worked out once, each that
    // holds something dropped into its bucket (live(...).bucket); material(src, k) is bucket k's
    const geos = Array.isArray(geometry) ? geometry : [geometry], K = geos.length;
    this.geometries = geos; this.geometry = geos[0]; geos.forEach((g) => (g.instanceCount = 0));
    if (live && gpu) {
      // (what it packs lives on the GPU only: the GPU writes it and the GPU reads it; src/core/gpu.js)
      const data = Array.from({ length: slots }, () => { const b = gpuStorage('vec4', cap * K, null, true); more('tiers: what stands, packed', b.bytes, b.lean ? 0 : b.bytes); return b.node; }), count = instancedArray(K, 'uint').toAtomic();
      const args = new THREE.IndirectStorageBufferAttribute(new Uint32Array(geos.flatMap((g) => [g.index.count, 0, 0, 0, 0])), 5), argsNode = storage(args, 'uint', 5 * K);   // one buffer of draw arguments, five a bucket (a shader binds few buffers)
      this.cand = uniform(0, 'uint');
      this.passes = [
        Fn(() => { for (let k = 0; k < K; k++) atomicStore(count.element(k), uint(0)); })().compute(1),
        Fn(() => {
          If(instanceIndex.lessThan(this.cand), () => {
            const L = live(cellOf(instanceIndex)), b = K > 1 ? uint(L.bucket) : uint(0);
            If(L.alive, () => {
              const i = atomicAdd(count.element(b), uint(1)).toVar();
              If(i.lessThan(uCap), () => { L.data.forEach((d, k) => data[k].element(b.mul(uCap).add(i)).assign(d)); });
            });
          });
        })().compute(MAXP * P * P),
        Fn(() => { for (let k = 0; k < K; k++) argsNode.element(k * 5 + 1).assign(min(atomicLoad(count.element(k)), uCap)); })().compute(1),
      ];
      this.data = data; this.args = args; this.cap = cap;
      // (readAt: read from a place in the buffer a material is told per mesh, mesh.userData.slot: one material for every bucket)
      this.meshes = geos.map((g, k) => { g.setIndirect(args, k * 20); g.instanceCount = cap; const m = new THREE.Mesh(g, material({ read: (j) => data[j].element(uint(k * cap).add(instanceIndex)), readAt: (j, slot) => data[j].element(slot.add(instanceIndex)) }, k)); m.userData.slot = k * cap; return m; });
    } else this.meshes = geos.map((g, k) => new THREE.Mesh(g, material(cellOf(instanceIndex), k)));
    this.mesh = this.meshes[0];
    for (const m of this.meshes) { m.frustumCulled = false; m.renderOrder = order; scene.add(m); }
  }
  /** On WebGPU, after select: pack what stands in this frame's cells. */
  /** On WebGPU, after select: pack what stands in this frame's cells; again only when something it reads has changed: the
      cells, the world's state (`world`: the ground's map, the lens, the stage), or the camera by more than a sixteenth of a
      patch (what stands thins with distance: a step that small is not seen). Standing still, the packing is kept. */
  run(renderer, world = '', cx = 0, cy = 0, cz = 0, view = '') {
    if (!this.passes) return;
    const q = Math.max(0.25, this.S / 16), { list, n } = this;
    let key = `${world}|${n}|${this.near}|${this.far}|${Math.round(cx / q)},${Math.round(cy / q)},${Math.round(cz / q)}`;
    for (let i = 0; i < n; i++) key += `|${list[i].x},${list[i].y}`;
    if (this.viewKeyed) key += `|${view}`;   // what it packs is tested against the view one by one (index.js: inView)
    if (key === this.key) return;
    this.key = key;
    const N = n * this.P * this.P; this.cand.value = N; this.passes[1].dispatchSize = Math.max(1, N);
    renderer.compute(this.passes);
  }
  /** On WebGPU: what the last packing holds, read back to the CPU a moment later (a promise of { count, data: the first
      slots' vec4s as floats, one array a slot } a bucket), for what the CPU must know of where things stand (src/world/trunks.js). */
  async read(renderer) {
    const K = this.geometries.length, bufs = await Promise.all([this.args, ...this.data.map((d) => d.value)].map((b) => renderer.getArrayBufferAsync(b)));
    const n = new Uint32Array(bufs[0]), f = bufs.slice(1).map((b) => new Float32Array(b));
    return Array.from({ length: K }, (_, k) => { const count = Math.min(n[k * 5 + 1], this.cap); return { count, data: f.map((x) => x.subarray(k * this.cap * 4, (k * this.cap + count) * 4)) }; });   // per bucket
  }
  /** s: how many times further than the 68° lens this lens sees a thing at the same size; h0: the ground under the camera */
  select(cx, cz, h0, s, dy) {
    if (this.fixed) s = Math.min(this.fixed, this.far + Math.abs(dy) * 1.2) / this.far;   // fixed: metres round the camera whatever the lens (the shadow map's box), grown with its height, to at most `fixed`
    const { S, P, list } = this, far = this.far * s, far2 = far * far - dy * dy, near2 = this.near * this.near * s * s - dy * dy;
    let n = 0; this.over = false;
    if (far2 > 0) {
      const i0 = Math.floor((cx - far) / S), i1 = Math.floor((cx + far) / S), j0 = Math.floor((cz - far) / S), j1 = Math.floor((cz + far) / S);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S;
        const nx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0, nz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0, nd = nx * nx + nz * nz;
        if (nd > far2) continue;
        const B = this.bounds; if (B && (x1 <= B[0] || x0 >= B[2] || z1 <= B[1] || z0 >= B[3])) continue;   // (bounds: a stand that ends: [x0, z0, x1, z1], set by its engine)
        const fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz);
        if (fx * fx + fz * fz < near2) continue;
        const yb = 0.32 * Math.sqrt(nd) + 0.2 * S + 6;         // the land is gentle: it cannot be further off than this
        const c = this.cull; if (c !== false && !boxIn(x0 - c, x1 + c, h0 - yb, h0 + yb + c, z0 - c, z1 + c)) continue;   // (widened: what is drawn for the light, whose shadow may fall into view)
        if (n === MAXP) { this.over = true; continue; }
        list[n].set(i * P, j * P); n++;
      }
    }
    this.n = n; for (const g of this.geometries) if (!this.passes) g.instanceCount = n * P * P; for (const m of this.meshes) m.visible = n > 0;
  }
  warm() { for (const g of this.geometries) if (!this.passes) g.instanceCount = this.P * this.P; for (const m of this.meshes) m.visible = true; }   // one patch, so the pipeline exists before the first frame
}
