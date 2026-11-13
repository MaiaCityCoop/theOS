// All that stands on the land: every asset placed `at: 'scatter'` (assets/*.js: the grass, a stone, a tree), drawn by its
// engine, as one list of tiers. A new kind of scattered thing is a module here that exports its engine; it is found
// here by itself, and an asset names it by its id (placement.engine).
//
//   export const engine = {
//     id,
//     row?(asset) -> row,                      what it reads of an asset, over the common row (assets/index.js: scatterRow)
//     create(scene, tex, ground, row, gpu) -> tiers,   its tiers (tier.js); tiers.solid: what reads its packing back as bodies
//     createAll?(scene, tex, ground, rows, gpu) -> tiers,   instead of create: all its assets at once (they share tiers)
//     createOwn?(scene, tex, ground, gpu, renderer) -> tiers,   what it places of its own, no asset of the library (stress.js)
//     // for the asset library (library.html), each as the engine sees fit:
//     thumb?(tex, row) -> { things, eye, look },       its picture for the list
//     stage?(tex, row, { x, z, heightAt, ground, level, seed, … }) -> Object3D,   how it stands on the stage
//     frame?(asset, opts) -> { height, dist, pitch, span },   how the camera frames it there
//   }
import { U } from '../core/uniforms.js';
import { setView } from './view.js';
import { weatherKey } from '../world/weather/index.js';
import { recipes } from '../core/registry.js';
import { scatterRow } from '../../assets/index.js';

const FOUND = import.meta.glob(['./*.js', '!./index.js', '!./*.worker.js'], { eager: true });   // (whole modules: a named import would fail where a module has none)
export const ENGINES = Object.fromEntries(Object.values(FOUND).map((m) => m.engine).filter(Boolean).map((e) => [e.id, e]));

/** An asset's engine, and the row it reads of it. */
export const engineOf = (asset) => (asset?.placement?.at === 'scatter' ? ENGINES[asset.placement.engine] : null) ?? null;
export const rowOf = (asset) => engineOf(asset)?.row?.(asset) ?? scatterRow(asset);

export function createScatter(scene, tex, ground, renderer, camera = null) {
  const gpu = !!renderer?.backend?.isWebGPUBackend;   // compute-packed tiers where WebGPU is (tier.js)
  const tiers = [], solid = [];
  const take = (made, name) => { if (made.solid) solid.push(made.solid); for (const t of made) { t.asset ??= name; tiers.push(t); } };   // solid: what reads its packing back as bodies (trees.js)
  const rows = new Map();   // each engine's assets
  for (const a of recipes('asset').filter((r) => r.placement?.at === 'scatter')) {
    const E = engineOf(a); if (!E) { console.warn(`no scatter engine '${a.placement.engine}' (${a.name})`); continue; }
    if (!rows.has(E)) rows.set(E, []); rows.get(E).push(rowOf(a));
  }
  // an engine makes its tiers asset by asset (create), or all of its assets at once (createAll: what shares tiers, as
  // the kinds of one stand do: trees.js)
  for (const [E, list] of rows) { if (E.createAll) take(E.createAll(scene, tex, ground, list, gpu), E.id); else for (const row of list) take(E.create(scene, tex, ground, row, gpu), row.name); }
  for (const E of Object.values(ENGINES)) if (E.createOwn) take(E.createOwn(scene, tex, ground, gpu, renderer), E.id);   // what an engine places of its own
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
