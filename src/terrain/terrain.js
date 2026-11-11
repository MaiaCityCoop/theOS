// The ground and the water: one fixed grid tile, drawn instanced for every node of a quadtree
// picked around the camera each frame (CDLOD). Heights come from the vertex shader; a node's
// outer vertices morph to the coarser grid, so the levels meet without cracks or pops.
import * as THREE from 'three';
import { HMIN, HMAX, heightAt, riverAt } from '../world.js';
import { boxIn } from '../core/frustum.js';
import { VERT, FRAG } from './terrain.glsl.js';
import { WATER_FRAG } from './water.glsl.js';

const GRID = 16;            // quads per node side
const S0 = 8;               // a level-0 node's side, metres (0.5 m quads)
const R0 = 48;              // level 0's range
const LEVELS = 10;          // the top level reaches R0 * 2^9 = 24.6 km
const CAP = 4096, WCAP = 1024;
const WATER_LEVELS = 6;

function gridGeometry() {
  const n = GRID + 1, pos = new Float32Array(n * n * 3), idx = new Uint16Array(GRID * GRID * 6);
  for (let z = 0, i = 0; z < n; z++) for (let x = 0; x < n; x++, i += 3) { pos[i] = x; pos[i + 1] = 0; pos[i + 2] = z; }
  for (let z = 0, i = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const a = z * n + x, b = a + 1, c = a + n, d = c + 1;
    // the diagonal turns on every other quad, so a morphed tile folds into the coarser one cleanly
    if ((x + z) & 1) { idx[i++] = a; idx[i++] = c; idx[i++] = b; idx[i++] = b; idx[i++] = c; idx[i++] = d; }
    else { idx[i++] = a; idx[i++] = c; idx[i++] = d; idx[i++] = a; idx[i++] = d; idx[i++] = b; }
  }
  return { pos: new THREE.BufferAttribute(pos, 3), idx: new THREE.BufferAttribute(idx, 1) };
}

export function createTerrain(scene, U, tex) {
  const { pos, idx } = gridGeometry();
  const make = (cap) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', pos); g.setIndex(idx);
    const data = new Float32Array(cap * 4), attr = new THREE.InstancedBufferAttribute(data, 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aNode', attr);
    g.instanceCount = 0;
    return { g, data, attr, n: 0, cap };
  };
  const land = make(CAP), water = make(WCAP);
  const common = { uGrid: { value: GRID }, uR0: { value: R0 } };
  const landMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      ...U, ...common,
      tA0: { value: tex.a[0] }, tA1: { value: tex.a[1] }, tA2: { value: tex.a[2] }, tA3: { value: tex.a[3] }, tA4: { value: tex.a[4] },
      tA6: { value: tex.a[6] }, tN6: { value: tex.n[6] },
      tN0: { value: tex.n[0] }, tN1: { value: tex.n[1] }, tN2: { value: tex.n[2] }, tN3: { value: tex.n[3] }, tN4: { value: tex.n[4] },
    },
  });
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: '#define WATER\n' + VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,   // far off the depth buffer cannot tell water from its bed: the water wins
    uniforms: { ...U, ...common, tWN: { value: tex.n[5] }, tWA: { value: tex.a[5] } },
  });
  const landMesh = new THREE.Mesh(land.g, landMat), waterMesh = new THREE.Mesh(water.g, waterMat);
  landMesh.frustumCulled = waterMesh.frustumCulled = false;
  landMesh.renderOrder = 10; // after the grass and the rocks: they are in front, the depth test spares the ground's shader
  waterMesh.renderOrder = 20;
  scene.add(landMesh, waterMesh);

  const range = [], range2 = [];
  for (let i = 0; i < LEVELS; i++) { range.push(R0 * 2 ** i); range2.push(range[i] * range[i]); }
  const TOP = S0 * 2 ** (LEVELS - 1);
  let cx = 0, cz = 0, dy2 = 0, inv2 = 1;

  function inView(x, z, size, level) {
    let y0 = HMIN, y1 = HMAX;
    if (level <= 4) { const yc = heightAt(x + size * 0.5, z + size * 0.5), ext = size * 0.5 + 3; y0 = yc - ext; y1 = yc + ext; }
    return boxIn(x, x + size, y0, y1, z, z + size);
  }
  function d2(x, z, size) {
    const ddx = cx < x ? x - cx : cx > x + size ? cx - x - size : 0, ddz = cz < z ? z - cz : cz > z + size ? cz - z - size : 0;
    return (ddx * ddx + ddz * ddz + dy2) * inv2;   // the lens's distance, as the shader measures it
  }
  function add(x, z, size, level) {
    if (land.n < land.cap) { const o = land.n++ * 4, a = land.data; a[o] = x; a[o + 1] = z; a[o + 2] = size; a[o + 3] = level; }
    if (level < WATER_LEVELS && water.n < water.cap) {
      const half = size * 0.71, r = riverAt(x + size * 0.5, z + size * 0.5);
      const near = size >= 128 ? Math.abs(r.r) < 0.0042 * (half + 16) : r.d < 2 * half + r.w * 1.3 + 3;
      if (near) { const o = water.n++ * 4, a = water.data; a[o] = x; a[o + 1] = z; a[o + 2] = size; a[o + 3] = level; }
    }
  }
  function select(x, z, size, level) {
    const dd = d2(x, z, size);
    if (dd > range2[level]) return false;
    if (!inView(x, z, size, level)) return true;
    if (level === 0 || dd > range2[level - 1]) { add(x, z, size, level); return true; }
    const h = size * 0.5, fx = cx > x + h ? 1 : 0, fz = cz > z + h ? 1 : 0;
    for (let i = 0; i < 4; i++) { // the camera's quarter first: front to back
      const ix = (i & 1) ^ fx, iz = (i >> 1) ^ fz, nx = x + ix * h, nz = z + iz * h;
      if (!select(nx, nz, h, level - 1) && inView(nx, nz, h, level - 1)) add(nx, nz, h, level - 1);
    }
    return true;
  }

  function push(s) {
    s.g.instanceCount = s.n;
    s.attr.clearUpdateRanges(); s.attr.addUpdateRange(0, s.n * 4); s.attr.needsUpdate = true;
  }
  return {
    landMesh, waterMesh,
    update(camera, uDy, lodInv) {
      cx = camera.position.x; cz = camera.position.z; dy2 = uDy * uDy; inv2 = lodInv * lodInv;
      land.n = water.n = 0;
      const top = LEVELS - 1, R = Math.min(range[top] / lodInv, camera.far);
      const i0 = Math.floor((cx - R) / TOP), i1 = Math.floor((cx + R) / TOP), j0 = Math.floor((cz - R) / TOP), j1 = Math.floor((cz + R) / TOP);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) select(i * TOP, j * TOP, TOP, top);
      push(land); push(water);
      waterMesh.visible = water.n > 0;
    },
    all() { // every node slot filled once, so the first real frame uploads nothing new
      land.g.instanceCount = 1; water.g.instanceCount = 1; waterMesh.visible = true;
    },
  };
}
