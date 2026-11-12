// What stands on the land, as a table. An asset is a kind (the module that knows how to draw it),
// what is particular to it, and its tiers: rows of { how fine, how many, how far }. Distances are
// metres as the walker's 68° lens sees them; a longer lens stretches them by its own factor
// (core/governor.js). The grass is a row here; every asset in the registry placed `at: 'scatter'` (a stone, a boulder)
// joins as a row of its own, by its own recipe.
//
//   cell   metres per cell: one thing may stand in each
//   P      cells along a patch's side: P * P instances per patch, a patch is cell * P metres
//   far    where the tier ends; the next begins there
import { scatterRow } from '../../assets/index.js';
import { recipes } from '../core/registry.js';

export const ASSETS = [
  {
    name: 'grass', kind: 'grass', height: 0.58,
    // segs: bends along the blade; w: half its width; near/far fades: the dithered hand-over between tiers; end: where the last tier's blades shrink away.
    // A farther ring's cells are wider: its blades are widened with the cell's area (w / cell² about the same in every ring),
    // so each ring covers the ground as the one before it and the hand-over does not thin the meadow
    tiers: [
      { segs: 3, cell: 0.085, P: 96, near: -1, nearFade: 0, far: 15, farFade: 5, w: 0.014, end: 1e6 },
      { segs: 2, cell: 0.17, P: 96, near: 15, nearFade: 5, far: 42, farFade: 10, w: 0.052, end: 1e6 },
      { segs: 1, cell: 0.34, P: 96, near: 42, nearFade: 10, far: 105, farFade: 25, w: 0.19, end: 105 },
    ],
  },
  ...recipes('asset').filter((a) => a.placement?.at === 'scatter').map(scatterRow),   // from the asset library
];
