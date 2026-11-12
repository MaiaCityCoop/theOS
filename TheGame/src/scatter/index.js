// All that stands on the land: every asset of the table (assets.js), drawn by its kind, as one list of tiers. A new kind
// of scattered thing is a module here with a create(scene, tex, ground, row) and a line in KINDS.
import { U } from '../core/uniforms.js';
import { ASSETS } from './assets.js';
import { createGrass } from './grass.js';
import { createRocks } from './rocks.js';

const KINDS = { grass: createGrass, rocks: createRocks };

export function createScatter(scene, tex, ground, renderer) {
  const gpu = !!renderer?.backend?.isWebGPUBackend;   // compute-packed tiers where WebGPU is (tier.js)
  const tiers = [];
  for (const asset of ASSETS) for (const t of KINDS[asset.kind](scene, tex, ground, asset, gpu)) { t.asset = asset.name; tiers.push(t); }
  return {
    tiers,
    /** Choose, for this frame, the patches each tier draws (after the frustum's planes are set: core/frustum.js). */
    select(cx, cz, h0, lod, dy) {
      for (let i = 0; i < tiers.length; i++) tiers[i].select(cx, cz, h0, lod, dy);
      const v = (u) => u.value.toArray?.().join(',') ?? u.value, world = `${ground.version}|${lod}|${v(U.uSand)}|${v(U.uStage)}|${v(U.uStageGround)}|${U.uSnow.value}`;   // what the packing reads besides the cells and the camera
      for (const t of tiers) t.run(renderer, world, cx, h0 + dy, cz);
    },
    get over() { for (let i = 0; i < tiers.length; i++) if (tiers[i].over) return true; return false; },
    get instances() { let n = 0; for (const t of tiers) n += t.geometry.instanceCount; return n; },
    warm() { for (const t of tiers) t.warm(); },
  };
}
