// The ground and the water: one fixed grid tile, drawn instanced for every node of a quadtree
// picked around the camera each frame (CDLOD). Heights come from the vertex shader; a node's
// outer vertices morph to the coarser grid, so the levels meet without cracks or pops.
import * as THREE from 'three/webgpu';
import { HMIN, HMAX, heightAt, riverAt, OCT_LAM, OCT_AMP } from '../world/land.js';
import { boxIn } from '../core/frustum.js';
import { limitOf, roomOf, more } from '../core/gpu.js';
import { U } from '../core/uniforms.js';
import { terrainMaterial, GRID, NODE, PSTEPS } from './material.js';
import { distanceAt, farMost } from '../detail/measure.js';
import { ERROR_PX, BAND } from '../detail/error.js';
import { createPages } from './pages.js';
import { WALKER } from '../../world/scale.js';
import { SOIL_RELIEF } from '../world/physics.js';
import { LAYERS } from './layers.js';
import { waterMaterials } from './water.js';
import { usedMaterials } from '../materials/bake.js';
import { farthestMost } from '../detail/extent.js';
import { recipes } from '../core/registry.js';

// The land's levels, from the one measure. A level's quads carry an octave of the land (wavelength λ, amplitude A) as
// long as they are at most λ/2 apart; an octave must be carried as long as it shows: out to where A is ERROR_PX on screen
// (src/detail/measure.js distanceAt). A level of reach R has quads R / Q apart, and is drawn from R/2 out, so its quads
// are at most 2d/Q apart at d; every octave is carried where it shows when Q is 4 times the largest of those distances
// over its wavelength. Level 0's quads are NODE/GRID apart, so its reach is Q NODE / GRID (U.uLandR0), each level after
// twice as far, the last as far as the land is drawn (where the largest thing is gone, on the largest picture this
// screen shows: src/detail/extent.js farthestMost). Near the eye the quadtree goes on into finer levels: plain land
// where the relief does not show, the relief's own (src/terrain/relief.js) from where it does.
// The land is laid out at its own dial: the page's, or, where the nodes it would select at that dial are more than its
// list may hold (what the device's largest buffer and geometry's room left let it grow to), as much coarser as they fit:
// the rest is the dial's, as a tier's store is held (src/scatter/tier.js). Its list grows as its selection needs, each
// growth held to what geometry has left then; at a dial of 0 (?truth's, src/detail/measure.js) that holds it alone.
const S0 = NODE;   // a level-0 node's side, metres
const WATER_LEVELS = 6;
/** Level 0's reach (lens metres): now (an octave shows out to where its amplitude covers the dial, ERROR_PX pixels
    drawn), or at the most the screen can draw (most: what the node lists are sized for, src/detail/measure.js farMost). */
const landR0 = (most = false, dial = ERROR_PX()) => 4 * Math.max(...OCT_AMP.map((A, i) => (most ? farMost(1, A, dial) : distanceAt(dial, A)) / OCT_LAM[i])) * (S0 / GRID);
/** Nodes a level may hold at most, round the camera whole (a level's reach over its node's side is R0/S0: the same at
    every level; how many, never fewer than the quadtree selects). */
const perLevel = (r0, fine) => Math.ceil(Math.PI * (r0 * fine / S0 + 1.5) ** 2);   // (fine: how many times as far its levels reach, one over its dial)
/** The relief's levels below level 0 for a level 0 of reach r0: each reaching half as far as the one before, down to
    the first whose reach is within the walker's eye's height (world/scale.js): the nearest ground the eye sees, where its
    mesh is finest (src/terrain/relief.js). */
const reliefLevels = (r0, fine) => Math.ceil(Math.log2((r0 * fine) / WALKER.eye));

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
  const room = (s, cap) => { more(`the land: ${s.name}`, (cap - s.cap) * 16, (cap - s.cap) * 16, 'geometry'); s.data = new Float32Array(cap * 4); s.attr = new THREE.InstancedBufferAttribute(s.data, 4); s.attr.setUsage(THREE.DynamicDrawUsage); s.g.setAttribute('aNode', s.attr); s.cap = cap; };   // (its bytes geometry's: what it may grow to is what that has left)
  // (as many nodes as a list may hold now: what the device's largest buffer holds, and what geometry has left lets it grow to)
  const most = (s) => Math.min(Math.floor(limitOf('maxBufferSize') / 16) || Infinity, s.cap + Math.floor(Math.max(0, roomOf('geometry')) / 16));
  const make = (cap, name) => {
    const s = { g: new THREE.InstancedBufferGeometry(), n: 0, over: [], said: false, cap: 0, name };
    s.g.setAttribute('position', pos); s.g.setIndex(idx); s.g.instanceCount = 0; room(s, cap);
    return s;
  };
  const putNode = (s, x, z, size, level) => {
    if (s.n >= s.cap) {
      const can = most(s);
      if (s.cap >= can) { if (s.over.length < 4 * s.cap) s.over.push(x, z, size, level); else s.full = true; return; }   // (past what it may hold: the nearest kept, push; past twice that, no more walked: its dial is held coarser, update)
      const was = s.data; room(s, Math.min(s.cap * 2, can)); s.data.set(was);   // (its nodes so far copied into the larger: drawn whole, never a frame without them)
    }
    const o = s.n++ * 4, a = s.data; a[o] = x; a[o + 1] = z; a[o + 2] = size; a[o + 3] = level;
  };
  // (to start with, as many as its levels hold round the camera at the most: the land's to where it ends and the relief's
  // below them; the water's over the levels it is drawn at)
  const D00 = Math.max(ERROR_PX(), 1), R00 = landR0(true, D00), land = make(perLevel(R00, 1 / D00) * (Math.ceil(Math.log2(farthestMost(D00) / R00)) + 1 + reliefLevels(R00, 1 / D00)), 'its nodes'), water = make(perLevel(R00, 1 / D00) * WATER_LEVELS, "its water's nodes");   // (at the dial's rest: the start's; grown as it needs)
  const landMat = terrainMaterial(pages), waterMat = waterMaterials(tex);
  // near the eye the quadtree goes on into the relief's finer levels (src/terrain/relief.js), each reaching half as far
  // as the one before: nodes of the land like any other, the land's own vertex stage raising them (material.js)
  let FIRST = -reliefLevels(R00, 1 / D00), RELIEF0 = -1, raised = 0;   // (the finest level, and the relief's first: the measure's, update; how many nodes of the relief's levels this frame)
  // (the water's two draws over the same surface, one after the other: its geometry twice, a material each: water.js)
  water.g.addGroup(0, Infinity, 0); water.g.addGroup(0, Infinity, 1);
  const landMesh = new THREE.Mesh(land.g, landMat), waterMesh = new THREE.Mesh(water.g, waterMat);
  landMesh.frustumCulled = waterMesh.frustumCulled = false;
  landMesh.renderOrder = 10; // after the grass and the rocks: they are in front, the depth test spares the ground's shader
  waterMesh.renderOrder = 20;
  scene.add(landMesh, waterMesh);

  // each level's reach (lens metres; at a dial under its rest `fine` times as far, but the last's: the land ends where
  // the largest thing is gone at the land's dial). held: the land's dial as its list's room holds it (never under the
  // page's: landDial)
  const range = [], range2 = [];
  let levels = 1, TOP = S0, R0 = R00, cx = 0, cz = 0, dy2 = 0, inv2 = 1, held = 1, dial = D00, fine = 1 / D00;
  const landDial = () => Math.max(ERROR_PX(), held);
  const levelsFor = () => {
    dial = landDial(); fine = 1 / dial; R0 = landR0(false, dial); const end = Math.min(reach, farthestMost(dial));
    levels = Math.max(1, Math.ceil(Math.log2(end / R0)) + 1); TOP = S0 * 2 ** (levels - 1); range.length = range2.length = 0;
    for (let i = 0; i < levels; i++) { range.push(i < levels - 1 ? R0 * 2 ** i * fine : end); range2.push(range[i] * range[i]); }
    // the relief's first level: the coarsest whose first half reaches as far as its geometry shows (relief.js
    // reliefShares: even parallax would be off by more than the dial, out to where SOIL_RELIEF covers PSTEPS of its
    // pixels: level -1, PSTEPS being what it is); its levels from there down to the walker's eye (reliefLevels)
    const shows = distanceAt(PSTEPS * dial, SOIL_RELIEF);
    RELIEF0 = Math.min(-1, Math.ceil(Math.log2((2 * shows) / (R0 * fine)))); FIRST = Math.min(RELIEF0, -reliefLevels(R0, fine));
    U.uLandR0.value = R0 * fine; U.uReliefReach.value = R0 * fine * 2 ** RELIEF0;   // (what its levels reach farther by in its reach's value, src/terrain/material.js FINE)
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
  const R2 = (level) => (level >= 0 ? range2[level] : (R0 * fine * 2 ** level) ** 2);   // (a level's reach, squared; below 0 the finer ones')
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
    if (land.full) return true;   // (past twice what its list may hold: the rest of this frame's walk left, update)
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
      if (!s.said) { s.said = true; console.warn(`land: ${at.length} nodes selected, ${s.cap} fit what it may hold (the device's largest buffer, geometry's room): the farthest left out this frame, its dial held coarser`); }
      s.over.length = 0;
    }
    s.g.instanceCount = s.n;
    s.attr.clearUpdateRanges(); s.attr.addUpdateRange(0, s.n * 4); s.attr.needsUpdate = true;
  }
  return {
    landMesh, waterMesh, pages,
    update(camera, uDy, lodInv) {
      levelsFor();
      const top = levels - 1, R = Math.min(range[top] / lodInv, camera.far);   // (as far as it is drawn: its top level's reach, no farther than the far plane)
      pages.update(camera, R, R * lodInv);   // (its last level kept in as far: all round as far as the walker's lens sees)
      cx = camera.position.x; cz = camera.position.z; dy2 = uDy * uDy; inv2 = lodInv * lodInv;
      land.n = water.n = 0; raised = 0;
      U.uLandEnd.value = R;
      const i0 = Math.floor((cx - R) / TOP), i1 = Math.floor((cx + R) / TOP), j0 = Math.floor((cz - R) / TOP), j1 = Math.floor((cz + R) / TOP);
      // (the top nodes nearest first, as each is walked its camera's quarter first: the land drawn front to back, so what
      // a nearer hill hides of it is dropped by the depth test before its prepass works out its whole material there,
      // src/terrain/material.js)
      const tops = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) tops.push([i * TOP, j * TOP, d2(i * TOP, j * TOP, TOP)]);
      for (const [x, z] of tops.sort((a, b) => a[2] - b[2])) select(x, z, TOP, top);
      // (its dial held: coarser by a BAND where what it selected was more than its list may hold, finer by one, down to the
      // page's, where BAND^4 times as many, a BAND finer's, would still fit: its nodes go as its reach squared, its reach
      // as one over its dial squared)
      const want = land.n + land.over.length / 4, can = most(land);
      held = want > can || land.full ? dial * BAND : want * BAND ** 4 <= can ? Math.max(ERROR_PX(), dial / BAND) : held; land.full = water.full = false;
      push(land); push(water);
      waterMesh.visible = water.n > 0;
    },
    /** The land as it is laid out now: its dial (the page's, or held), its nodes and what its list holds, its levels, its
        finest level and its quads' side there, metres (the device's table: src/core/settle.js, tools/gate.js). */
    stats: () => ({ dial, held, nodes: land.n, cap: land.cap, levels, first: FIRST, finest: (S0 * 2 ** FIRST) / GRID }),
    /** The pages' passes compiled (a promise). */
    compile: () => pages.compile(),
    /** Every page laid again (the land under them changed: the lakes). */
    refresh: () => pages.refresh(),
  };
}
