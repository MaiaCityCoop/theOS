// Scatter: what stands on the land (blades, stones, boulders), a tier at a time. A tier is one
// instanced draw call: its instances are the cells of the patches the camera's frustum touches
// inside the tier's band of distances, chosen anew each frame. A patch is only a number pair in a
// uniform array; what stands in a cell is hashed in the vertex shader. So blades stand where the
// lens looks and nowhere else, and choosing them builds nothing.
import * as THREE from 'three';
import { boxIn } from '../core/frustum.js';

export const MAXP = 384;                 // patches a tier can draw at once
// GLSL: the cell an instance stands for: which patch of the list, which cell of the patch
export const CELL_GLSL = /* glsl */ `
uniform float uCell; uniform int uP; uniform vec2 uPatch[${MAXP}];
ivec2 instanceCell(){
  int pp = uP * uP, pid = gl_InstanceID / pp, b = gl_InstanceID - pid * pp;
  return ivec2(uPatch[pid]) + ivec2(b % uP, b / uP);
}
`;

export class Tier {
  /** cell: metres per cell; P: cells per patch side; near/far: the band, in metres as a 68° lens sees them */
  constructor(scene, geometry, material, { cell, P, near = 0, far, order = 0 }) {
    this.P = P; this.S = cell * P; this.near = Math.max(0, near); this.far = far; this.n = 0; this.over = false;
    this.list = new Float32Array(MAXP * 2);
    material.uniforms.uCell = { value: cell }; material.uniforms.uP = { value: P }; material.uniforms.uPatch = { value: this.list };
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
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
        list[n * 2] = i * P; list[n * 2 + 1] = j * P; n++;
      }
    }
    this.n = n; this.geometry.instanceCount = n * P * P; this.mesh.visible = n > 0;
  }
  warm() { this.geometry.instanceCount = this.P * this.P; this.mesh.visible = true; }   // one patch, so the program and buffers exist before the first frame
}
