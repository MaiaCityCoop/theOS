// Scatter: what stands on the land (blades, stones, boulders), a tier at a time. A tier is one instanced draw call: its
// instances are the cells of the patches the camera's frustum touches inside the tier's band of distances, chosen anew
// each frame. A patch is only a number pair in a uniform array; what stands in a cell is hashed in the vertex stage, so
// blades stand where the lens looks and nowhere else, and choosing them builds nothing. A cell that holds nothing is
// sent off screen (offScreen) before any of its work is done.
import * as THREE from 'three/webgpu';
import { uint, int, ivec2, vec4, uniformArray, instanceIndex, cameraProjectionMatrix, cameraViewMatrix } from 'three/tsl';
import { boxIn } from '../core/frustum.js';

export const MAXP = 384;   // patches a tier can draw at once

/** where a vertex that should not be drawn goes */
export const offScreen = () => vec4(2, 2, 2, 1);
/** a world point to the clip space of whichever camera draws it (the eye's, or the shadow's) */
export const clipOf = (w) => cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1));

export class Tier {
  /** cell: metres per cell; P: cells per patch side; near/far: the band, in metres as a 68° lens sees them;
      material(cellNode): the tier's node material, given the cell each instance stands for */
  constructor(scene, geometry, material, { cell, P, near = 0, far, order = 0 }) {
    this.P = P; this.S = cell * P; this.near = Math.max(0, near); this.far = far; this.n = 0; this.over = false;
    this.list = Array.from({ length: MAXP }, () => new THREE.Vector2());
    const patches = uniformArray(this.list, 'vec2'), pp = uint(P * P), pid = instanceIndex.div(pp), b = int(instanceIndex.sub(pid.mul(pp)));
    this.cell = ivec2(patches.element(pid)).add(ivec2(b.mod(P), b.div(P)));   // which patch of the list, which cell of the patch
    this.geometry = geometry; geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(geometry, material(this.cell)); this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
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
    this.n = n; this.geometry.instanceCount = n * P * P; this.mesh.visible = n > 0;
  }
  warm() { this.geometry.instanceCount = this.P * this.P; this.mesh.visible = true; }   // one patch, so the pipeline exists before the first frame
}
