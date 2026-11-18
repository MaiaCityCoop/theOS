// The ground and the water: one fixed grid tile, drawn instanced for every node of a quadtree
// picked around the camera each frame (CDLOD). Heights come from the vertex shader; a node's
// outer vertices morph to the coarser grid, so the levels meet without cracks or pops.
import * as THREE from 'three/webgpu';
import { HMIN, HMAX, heightAt, riverAt, OCT_LAM, OCT_AMP } from '../world/land.js';
import { boxIn } from '../core/frustum.js';
import { limitOf } from '../core/gpu.js';
import { U } from '../core/uniforms.js';
import { terrainMaterial, GRID, NODE, FINE, PSTEPS } from './material.js';
import { distanceAt, farMost } from '../detail/measure.js';
import { ERROR_PX } from '../detail/error.js';
import { createPages } from './pages.js';
import { WALKER } from '../../world/scale.js';
import { SOIL_RELIEF } from '../world/physics.js';
import { LAYERS } from './layers.js';
import { waterMaterial } from './water.js';
import { usedMaterials } from '../materials/bake.js';
import { recipes } from '../core/registry.js';

// The land's levels, from the one measure. A level's quads carry an octave of the land (wavelength λ, amplitude A) as
// long as they are at most λ/2 apart; an octave must be carried as long as it shows: out to where A is ERROR_PX on screen
// (src/detail/measure.js distanceAt). A level of reach R has quads R / Q apart, and is drawn from R/2 out, so its quads
// are at most 2d/Q apart at d; every octave is carried where it shows when Q is 4 times the largest of those distances
// over its wavelength. Level 0's quads are NODE/GRID apart, so its reach is Q NODE / GRID (U.uLandR0), each level after
// twice as far, the last as far as the land is drawn (END: the air hides it by then, src/world/light.js). Near the eye
// the quadtree goes on into finer levels: plain land where the relief does not show, the relief's own
// (src/terrain/relief.js) from where it does.
const S0 = NODE;   // a level-0 node's side, metres
const END = 24576;   // metres the land is drawn to at most
const WATER_LEVELS = 6;
/** Level 0's reach (lens metres): now (an octave shows out to where its amplitude covers the dial, ERROR_PX pixels
    drawn), or at the most the screen can draw (most: what the node lists are sized for, src/detail/measure.js farMost). */
const landR0 = (most = false) => 4 * Math.max(...OCT_AMP.map((A, i) => (most ? farMost(1, A) : distanceAt(ERROR_PX(), A)) / OCT_LAM[i])) * (S0 / GRID);
/** Nodes a level may hold at most, round the camera whole (a level's reach over its node's side is R0/S0: the same at
    every level; how many, never fewer than the quadtree selects). */
const perLevel = (r0) => Math.ceil(Math.PI * (r0 * FINE / S0 + 1.5) ** 2);
/** The relief's levels below level 0 for a level 0 of reach r0: each reaching half as far as the one before, down to
    the first whose reach is within the walker's eye's height (world/scale.js): the nearest ground the eye sees, where its
    mesh is finest (src/terrain/relief.js). */
const reliefLevels = (r0) => Math.ceil(Math.log2((r0 * FINE) / WALKER.eye));

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

/** The materials the land wears (every biome's, its layers' grounds, the grass's carpet, the water's floor, the noises
    the land is laid by): what a start that draws the land and nothing on it paints first (src/boot.js: the stage). */
export const landMaterials = () => [...usedMaterials(recipes('biome')), ...LAYERS.flatMap((L) => (L.ground ? [L.ground.material] : []))];

/** The land and its water in `scene`. reach: metres from the eye the land is drawn to, at most (it ends in the air,
    src/world/light.js: airOf); by default to the horizon. */
export function createTerrain(scene, tex, renderer, { reach = Infinity } = {}) {
  const pages = createPages(renderer, tex);   // the ground's material, laid once a page round the camera (src/terrain/pages.js)
  const { pos, idx } = gridGeometry();
  // a list of nodes, as many as `cap`; grown (twice as large, sent again) where the quadtree selects more, never left out
  // while the device holds it (a node 16 bytes, its buffer within the device's own maxBufferSize); past that what is
  // selected is kept aside, the nearest drawn and the farthest left out, and said once (push)
  const room = (s, cap) => { s.data = new Float32Array(cap * 4); s.attr = new THREE.InstancedBufferAttribute(s.data, 4); s.attr.setUsage(THREE.DynamicDrawUsage); s.g.setAttribute('aNode', s.attr); s.cap = cap; };
  const make = (cap) => {
    const s = { g: new THREE.InstancedBufferGeometry(), n: 0, over: [], said: false };
    s.g.setAttribute('position', pos); s.g.setIndex(idx); s.g.instanceCount = 0; room(s, cap);
    return s;
  };
  const putNode = (s, x, z, size, level) => {
    if (s.n >= s.cap) {
      const most = Math.floor(limitOf('maxBufferSize') / 16) || Infinity;
      if (s.cap >= most) { s.over.push(x, z, size, level); return; }
      const was = s.data; room(s, Math.min(s.cap * 2, most)); s.data.set(was);
    }
    const o = s.n++ * 4, a = s.data; a[o] = x; a[o + 1] = z; a[o + 2] = size; a[o + 3] = level;
  };
  // (to start with, as many as its levels hold round the camera at the most: the land's to where it ends and the relief's
  // below them; the water's over the levels it is drawn at)
  const R00 = landR0(true), land = make(perLevel(R00) * (Math.ceil(Math.log2(END / R00)) + 1 + reliefLevels(R00))), water = make(perLevel(R00) * WATER_LEVELS);
  const landMat = terrainMaterial(pages), waterMat = waterMaterial(tex);
  // near the eye the quadtree goes on into the relief's finer levels (src/terrain/relief.js), each reaching half as far
  // as the one before: nodes of the land like any other, the land's own vertex stage raising them (material.js)
  let FIRST = -reliefLevels(R00), RELIEF0 = -1, raised = 0;   // (the finest level, and the relief's first: the measure's, update; how many nodes of the relief's levels this frame)
  const landMesh = new THREE.Mesh(land.g, landMat), waterMesh = new THREE.Mesh(water.g, waterMat);
  landMesh.frustumCulled = waterMesh.frustumCulled = false;
  landMesh.renderOrder = 10; // after the grass and the rocks: they are in front, the depth test spares the ground's shader
  waterMesh.renderOrder = 20;
  scene.add(landMesh, waterMesh);

  // each level's reach (lens metres; under ?truth FINE times as far, but the last's: the land ends where it always does)
  const range = [], range2 = [];
  let levels = 1, TOP = S0, R0 = R00, cx = 0, cz = 0, dy2 = 0, inv2 = 1;
  const levelsFor = () => {
    R0 = landR0(); const end = Math.min(reach, END);
    levels = Math.max(1, Math.ceil(Math.log2(end / R0)) + 1); TOP = S0 * 2 ** (levels - 1); range.length = range2.length = 0;
    for (let i = 0; i < levels; i++) { range.push(i < levels - 1 ? R0 * 2 ** i * FINE : end); range2.push(range[i] * range[i]); }
    // the relief's first level: the coarsest whose first half reaches as far as its geometry shows (relief.js
    // reliefShares: even parallax would be off by more than the dial, out to where SOIL_RELIEF covers PSTEPS of its
    // pixels: level -1, PSTEPS being what it is); its levels from there down to the walker's eye (reliefLevels)
    const shows = distanceAt(PSTEPS * ERROR_PX(), SOIL_RELIEF);
    RELIEF0 = Math.min(-1, Math.ceil(Math.log2((2 * shows) / (R0 * FINE)))); FIRST = Math.min(RELIEF0, -reliefLevels(R0));
    U.uLandR0.value = R0; U.uReliefReach.value = R0 * FINE * 2 ** RELIEF0;
    pages.underRelief((S0 * 2 ** FIRST) / GRID, raised > 0);   // (its finest vertices this far apart; whether it has any nodes: the last frame's)
  };

  function inView(x, z, size, level) {
    let y0 = HMIN, y1 = HMAX;
    if (level <= 4) { const yc = heightAt(x + size * 0.5, z + size * 0.5), ext = size * 0.5 + 3; y0 = yc - ext; y1 = yc + ext; }
    return boxIn(x, x + size, y0, y1, z, z + size);
  }
  function d2(x, z, size) {
    const ddx = cx < x ? x - cx : cx > x + size ? cx - x - size : 0, ddz = cz < z ? z - cz : cz > z + size ? cz - z - size : 0;
    return (ddx * ddx + ddz * ddz + dy2) * inv2;   // the lens's distance, as the shader measures it
  }
  const R2 = (level) => (level >= 0 ? range2[level] : (R0 * FINE * 2 ** level) ** 2);   // (a level's reach, squared; below 0 the finer ones')
  function add(x, z, size, level) {
    if (level <= RELIEF0) raised++;
    putNode(land, x, z, size, level);
    if (level >= 0) wet(x, z, size, level);
  }
  function wet(x, z, size, level) {   // (the water over a node: a node finer than level 0, its water drawn for the whole level-0 node)
    if (level < WATER_LEVELS) {
      const half = size * 0.71, r = riverAt(x + size * 0.5, z + size * 0.5);
      const near = size >= 128 ? Math.abs(r.r) < 0.0042 * (half + 16) : r.d < 2 * half + r.w * 1.3 + 3;
      if (near) putNode(water, x, z, size, level);
    }
  }
  function select(x, z, size, level) {
    const dd = d2(x, z, size);
    if (dd > R2(level)) return false;
    if (!inView(x, z, size, level)) return true;
    if (level === FIRST || dd > R2(level - 1)) { add(x, z, size, level); return true; }
    if (level === 0) wet(x, z, size, 0);
    const h = size * 0.5, fx = cx > x + h ? 1 : 0, fz = cz > z + h ? 1 : 0;
    for (let i = 0; i < 4; i++) { // the camera's quarter first: front to back
      const ix = (i & 1) ^ fx, iz = (i >> 1) ^ fz, nx = x + ix * h, nz = z + iz * h;
      if (!select(nx, nz, h, level - 1) && inView(nx, nz, h, level - 1)) add(nx, nz, h, level - 1);
    }
    return true;
  }

  function push(s) {
    if (s.over.length) {   // (past the device's limit: the nearest of all it selected, by the lens's distance, not by the order it was walked in)
      const all = [...s.data.subarray(0, s.n * 4), ...s.over], at = Array.from({ length: all.length / 4 }, (_, i) => i).sort((i, j) => d2(all[i * 4], all[i * 4 + 1], all[i * 4 + 2]) - d2(all[j * 4], all[j * 4 + 1], all[j * 4 + 2]));
      at.slice(0, s.cap).forEach((i, k) => s.data.set(all.slice(i * 4, i * 4 + 4), k * 4));
      if (!s.said) { s.said = true; console.warn(`land: ${at.length} nodes selected, ${s.cap} fit the device's buffer (maxBufferSize): the farthest ${at.length - s.cap} left out`); }
      s.over.length = 0;
    }
    s.g.instanceCount = s.n;
    s.attr.clearUpdateRanges(); s.attr.addUpdateRange(0, s.n * 4); s.attr.needsUpdate = true;
  }
  return {
    landMesh, waterMesh, pages,
    update(camera, uDy, lodInv) {
      levelsFor(); pages.update(camera);
      cx = camera.position.x; cz = camera.position.z; dy2 = uDy * uDy; inv2 = lodInv * lodInv;
      land.n = water.n = 0; raised = 0;
      const top = levels - 1, R = Math.min(range[top] / lodInv, camera.far);
      U.uLandEnd.value = R;
      const i0 = Math.floor((cx - R) / TOP), i1 = Math.floor((cx + R) / TOP), j0 = Math.floor((cz - R) / TOP), j1 = Math.floor((cz + R) / TOP);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) select(i * TOP, j * TOP, TOP, top);
      push(land); push(water);
      waterMesh.visible = water.n > 0;
    },
    /** The pages' passes compiled (a promise). */
    compile: () => pages.compile(),
    /** Every page laid again (the land under them changed: the lakes). */
    refresh: () => pages.refresh(),
    all() { // every node slot filled once, so the first real frame uploads nothing new
      land.g.instanceCount = 1; water.g.instanceCount = 1; waterMesh.visible = true;
    },
  };
}
