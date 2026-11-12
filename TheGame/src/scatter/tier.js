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

export const MAXP = 384;   // patches a tier can draw at once

/** where a vertex that should not be drawn goes */
export const offScreen = () => vec4(2, 2, 2, 1);
/** a world point to the clip space of whichever camera draws it (the eye's, or the shadow's) */
export const clipOf = (w) => cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1));

export class Tier {
  /** cell: metres per cell; P: cells per patch side; near/far: the band, in metres as a 68° lens sees them.
      Without `live`: material(cellNode) is the tier's node material, given the cell each instance stands for.
      With `live` (and `gpu`, a WebGPU renderer's): live(cellNode) -> { alive, data: [vec4, …] } says what stands in a cell;
      material({ read }) is the material, read(k) its k-th vec4 of `slots`, ready-made; `cap` the most that may stand at once. */
  constructor(scene, geometry, material, { cell, P, near = 0, far, order = 0, live = null, gpu = false, cap = 0, slots = 0 }) {
    this.P = P; this.S = cell * P; this.near = Math.max(0, near); this.far = far; this.n = 0; this.over = false;
    this.list = Array.from({ length: MAXP }, () => new THREE.Vector2());
    const patches = uniformArray(this.list, 'vec2'), P2 = uint(P * P);
    const cellOf = (index) => { const pid = index.div(P2), b = int(index.sub(pid.mul(P2))); return ivec2(patches.element(pid)).add(ivec2(b.mod(P), b.div(P))); };   // which patch of the list, which cell of the patch
    this.geometry = geometry; geometry.instanceCount = 0;
    if (live && gpu) {
      const data = Array.from({ length: slots }, () => instancedArray(cap, 'vec4')), count = instancedArray(1, 'uint').toAtomic();
      const args = new THREE.IndirectStorageBufferAttribute(new Uint32Array([geometry.index.count, 0, 0, 0, 0]), 5), argsNode = storage(args, 'uint', 5);
      this.cand = uniform(0, 'uint');
      this.passes = [
        Fn(() => { atomicStore(count.element(0), uint(0)); })().compute(1),
        Fn(() => {
          If(instanceIndex.lessThan(this.cand), () => {
            const L = live(cellOf(instanceIndex));
            If(L.alive, () => {
              const i = atomicAdd(count.element(0), uint(1)).toVar();
              If(i.lessThan(uint(cap)), () => { L.data.forEach((d, k) => data[k].element(i).assign(d)); });
            });
          });
        })().compute(MAXP * P * P),
        Fn(() => { argsNode.element(1).assign(min(atomicLoad(count.element(0)), uint(cap))); })().compute(1),
      ];
      geometry.setIndirect(args); geometry.instanceCount = cap;
      this.mesh = new THREE.Mesh(geometry, material({ read: (k) => data[k].element(instanceIndex) }));
    } else this.mesh = new THREE.Mesh(geometry, material(cellOf(instanceIndex)));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }
  /** On WebGPU, after select: pack what stands in this frame's cells. */
  run(renderer) {
    if (!this.passes) return;
    const n = this.n * this.P * this.P; this.cand.value = n; this.passes[1].dispatchSize = Math.max(1, n);
    renderer.compute(this.passes);
  }
  /** s: how many times further than the 68° lens this lens sees a thing at the same size; h0: the ground under the camera */
  select(cx, cz, h0, s, dy) {
    const { S, P, list } = this, far = this.far * s, far2 = far * far - dy * dy, near2 = this.near * this.near * s * s - dy * dy;
    let n = 0; this.over = false;
    if (far2 > 0) {
      const i0 = Math.floor((cx - far) / S), i1 = Math.floor((cx + far) / S), j0 = Math.floor((cz - far) / S), j1 = Math.floor((cz + far) / S);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S;
        const nx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0, nz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0, nd = nx * nx + nz * nz;
        if (nd > far2) continue;
        const fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz);
        if (fx * fx + fz * fz < near2) continue;
        const yb = 0.32 * Math.sqrt(nd) + 0.2 * S + 6;         // the land is gentle: it cannot be further off than this
        if (!boxIn(x0, x1, h0 - yb, h0 + yb, z0, z1)) continue;
        if (n === MAXP) { this.over = true; continue; }
        list[n].set(i * P, j * P); n++;
      }
    }
    this.n = n; if (!this.passes) this.geometry.instanceCount = n * P * P; this.mesh.visible = n > 0;
  }
  warm() { if (!this.passes) this.geometry.instanceCount = this.P * this.P; this.mesh.visible = true; }   // one patch, so the pipeline exists before the first frame
}
