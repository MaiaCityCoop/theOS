# Levels of detail: the one way

Every asset in the world, whatever it is, changes its level of detail by the same rule, drawn the same way. An asset's
file says what it is; none of what follows is written in it.

## What an asset says

| Where | What |
| --- | --- |
| its file, `detail.levels` | its levels, near to far (a tree, a bush: `levels`, built by the kit) |
| its kind, `assets/kinds.js` | `px`: the pixels where each level ends; `measure`: what is measured (`'height'`, else its largest side); `fade`: half the hand-over's width; `sink`: its way out |
| its stand, in its biome | `size`: the stand changes level as one; `cover`: the colour the land wears where its plants have sunk |

## The rule (one place each)

| Question | Answer | Where |
| --- | --- | --- |
| How large is it on screen? | `sizeOf(asset)` metres, times the lens's pixels a metre, over its distance through the lens | `index.js` (`sizeOf`, `pxK`), `U.uPxK`, `U.uLodInv` |
| Which level is that? | its kind's `px`, resolved | `index.js` `detailOf` |
| How does a level come and go? | parts one by one (`partGrown`), one piece whole at half way (`whole`), the last level sinking (`sunk`, `sinkInto`) | `handover.js` `handOver` |
| Which things does a level's packing hold? | its band, its hand-over, and a pad for the camera's movement | `handover.js` `bandOf`, `padOf` |
| The same, off the GPU | | `handover.js` `handOverAt` |

Nothing is dithered and nothing is switched at a fixed distance: the lens (its focal length, the window's height) moves
every distance with it.

## Who uses it

| What | Engine | How |
| --- | --- | --- |
| trees, bushes, ferns: anything in a stand | `src/scatter/trees.js` | per vertex, each frame: `handOver` + `partGrown` + `sinkInto`; packing by `bandOf` |
| rocks | `src/scatter/rocks.js` | per vertex: `handOver` (`whole`) + `sinkInto`; packing by `bandOf` |
| what stands at a place (a tent), and its far card | `index.js` `Detailed`, `src/world/place.js`, `impostor.js` | on the CPU: `handOverAt`, the material's `sunk` |
| the land's colour where a stand has sunk | `src/terrain/material.js` | `sizeOf`, `detailOf().cut`, the stand's `cover` |

Not on it: the grass (`src/scatter/grass.js`): rings of blades by the lens's distance, no levels of a thing.

## A new asset

A new tree, bush or rock is a file in `assets/`: its kind gives it all of the above. A new kind is a line in
`assets/kinds.js`. A new engine must ask `sizeOf`, `detailOf`, `levelOf`/`bandOf` and `handOver`: it may not carry a
distance, a pixel threshold or a fade of its own.

## What a kind costs

A stand is one thing to the engine, however many kinds grow in it (`src/scatter/trees.js`):

| | per stand and level | per kind |
| --- | --- | --- |
| packing (compute) | one pass: where the cell is, whether it is seen, the groves, the land, the river, the ground | a few lines: its size, its shape |
| draw shader | one for every stand, kind, shape and level | none: a mesh says its kind as numbers (`wear`: bark, leaves, wind, light, tint) |
| draw calls | | one a shape and level |
| the start | | building its meshes: a shrub a few milliseconds, a tree of eight shapes about 0.3 s |

Kinds share a stand's tiers when their levels are the same make (the same pixels and patches: their kind's and the
kit's); a kind made otherwise is a group of its own in the same cells (`groupsOf`).

## What this does not yet give

- **A tree's meshes are built at every start**, on the main thread (about 0.3 s a tree kind): a thousand shrubs are a
  few seconds, a thousand trees are not possible. They must be built once and kept (baked to a file, or built off the
  main thread as its stand comes near).
- **A draw call and a slice of the packing's buffer a shape and level**, whether a plant of it stands in view or not:
  fine for tens of kinds a stand, not for hundreds. For that the packing must sort into one buffer (count, then place).
- **The rocks and the grass have their own engines** (`rocks.js`, `grass.js`): the same rule, not the same tiers.
- **The WebGL 2 fallback draws no plants** (seen 2026-11-12, and so before this): its packing per vertex gives none.
