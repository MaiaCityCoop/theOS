// All that stands on the land: every asset of the table, drawn by its kind, as one list of tiers.
import { ASSETS } from './assets.js';
import { createGrass } from './grass.js';
import { createRocks } from './rocks.js';

const KINDS = { grass: createGrass, rocks: createRocks };

export function createScatter(scene, U, tex) {
  const tiers = [];
  for (const asset of ASSETS) for (const t of KINDS[asset.kind](scene, U, tex, asset)) { t.asset = asset.name; tiers.push(t); }
  return {
    tiers,
    /** Choose, for this frame, the patches each tier draws. */
    select(cx, cz, ground, lod, dy) { for (let i = 0; i < tiers.length; i++) tiers[i].select(cx, cz, ground, lod, dy); },
    get over() { for (let i = 0; i < tiers.length; i++) if (tiers[i].over) return true; return false; },
    warm() { for (const t of tiers) t.warm(); },
  };
}
