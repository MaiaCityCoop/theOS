// All that stands on the land: every asset of the table (assets.js), drawn by its engine, as one list of tiers. A new kind
// of scattered thing is a module here that exports `engine = { id, create(scene, tex, ground, row, gpu) -> tiers }`
// (tiers.solid: what reads its packing back as bodies); it is found here by itself, and an asset names it by its id
// (placement.engine).
import { U } from '../core/uniforms.js';
import { setView } from './view.js';
import { weatherKey } from '../world/weather/index.js';
import { ASSETS } from './assets.js';

const FOUND = import.meta.glob(['./*.js', '!./index.js'], { eager: true });   // (whole modules: a named import would fail where a module has none)
export const ENGINES = Object.fromEntries(Object.values(FOUND).map((m) => m.engine).filter(Boolean).map((e) => [e.id, e]));

export function createScatter(scene, tex, ground, renderer, camera = null) {
  const gpu = !!renderer?.backend?.isWebGPUBackend;   // compute-packed tiers where WebGPU is (tier.js)
  const tiers = [], solid = [];
  for (const asset of ASSETS) { const E = ENGINES[asset.kind]; if (!E) { console.warn(`no scatter engine '${asset.kind}' (${asset.name})`); continue; }
    const made = E.create(scene, tex, ground, asset, gpu); if (made.solid) solid.push(made.solid); for (const t of made) { t.asset = asset.name; tiers.push(t); } }   // solid: what reads its packing back as bodies (trees.js)
  return {
    tiers,
    /** Choose, for this frame, the patches each tier draws (after the frustum's planes are set: core/frustum.js). */
    select(cx, cz, h0, lod, dy) {
      for (let i = 0; i < tiers.length; i++) tiers[i].select(cx, cz, h0, lod, dy);
      const view = camera ? setView(camera) : '';   // the eye's view, for what is tested against it one by one (view.js)
      const v = (u) => u.value.toArray?.().join(',') ?? u.value, world = `${ground.version}|${lod}|${v(U.uSand)}|${v(U.uStage)}|${v(U.uStageGround)}|${weatherKey()}`;   // what the packing reads besides the cells and the camera
      for (const t of tiers) t.run(renderer, world, cx, h0 + dy, cz, view);
      for (const f of solid) f(renderer);
    },
    get over() { for (let i = 0; i < tiers.length; i++) if (tiers[i].over) return true; return false; },
    get instances() { let n = 0; for (const t of tiers) n += t.geometry.instanceCount; return n; },
    warm() { for (const t of tiers) t.warm(); },
  };
}
