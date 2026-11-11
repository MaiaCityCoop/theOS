// A ring of square patches that follows the camera in whole-patch steps. Every patch is a mesh of
// its own (so the frustum culls it) sharing one geometry and one material; what stands in a patch
// is hashed in the vertex shader from the cell it is in, so moving a patch builds nothing.
import * as THREE from 'three';
import { heightAt } from './world.js';

export class PatchRing {
  /** patch: side in metres; near/far: the band of distances it serves; pad: how far its things reach past the square */
  constructor(scene, geometry, material, { patch, near = 0, far, pad = 4, order = 0 }) {
    this.patch = patch; this.near = near; this.far = far;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(patch / 2, 0, patch / 2), patch * 0.71 + pad);
    const n = Math.ceil(far / patch) + 1;
    this.n = n; this.meshes = []; this.ix = []; this.iz = [];
    for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
      const m = new THREE.Mesh(geometry, material);
      m.matrixAutoUpdate = false; m.renderOrder = order; m.userData.i = i; m.userData.j = j;
      scene.add(m); this.meshes.push(m); this.ix.push(1e9); this.iz.push(1e9);
    }
  }
  update(cx, cz, dy) {
    const { patch, near, far, meshes } = this, bx = Math.round(cx / patch), bz = Math.round(cz / patch);
    const far2 = far * far - dy * dy, near2 = near * near - dy * dy;
    for (let k = 0; k < meshes.length; k++) {
      const m = meshes[k], ix = bx + m.userData.i, iz = bz + m.userData.j;
      if (ix !== this.ix[k] || iz !== this.iz[k]) {
        this.ix[k] = ix; this.iz[k] = iz;
        m.position.set(ix * patch, heightAt((ix + 0.5) * patch, (iz + 0.5) * patch), iz * patch);
        m.updateMatrix();
      }
      const x0 = ix * patch, z0 = iz * patch, x1 = x0 + patch, z1 = z0 + patch;
      const nx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0, nz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0;
      const fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz);
      m.visible = nx * nx + nz * nz < far2 && fx * fx + fz * fz > near2;
    }
  }
}

// GLSL: the cell an instance stands for, from its number in the patch and the patch's own place
export const CELL_GLSL = /* glsl */ `
uniform float uCell; uniform int uP;
ivec2 instanceCell(){
  return ivec2(floor(modelMatrix[3].xz / uCell + 0.5)) + ivec2(gl_InstanceID % uP, gl_InstanceID / uP);
}
`;
