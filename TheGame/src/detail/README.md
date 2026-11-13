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
| the start | | its meshes: built once (a shrub a few milliseconds, a tree of eight shapes half a second), then kept in the browser and read back (`src/core/meshes.js`) |

Kinds share a stand's tiers when their levels are the same make (the same pixels and patches: their kind's and the
kit's); a kind made otherwise is a group of its own in the same cells (`groupsOf`).

## The heap: what a thousand kinds cost

The stress stand (`src/scatter/stress.js`, only with `?stress` in the address) is the test of that: a thousand kinds of
generated asset (`assets/kit/blob.js`: each its own mesh of 50 000 to 200 000 triangles), a thousand of each, a million
on four kilometres of land. It is drawn the way every kind should come to be drawn (`src/scatter/heap.js`):

| | cost | per kind |
| --- | --- | --- |
| draw calls | one a level (nine), whatever the kinds | none: a draw reads its vertices from the heap by the kind's number |
| draw shader | one | none |
| always held | its coarse levels (768 triangles down to one) | 20 KB |
| held while near | its full mesh and two under it, in a few slots a level, built in workers | 1 to 4 MB, 245 KB, 62 KB, put out when the camera has gone |
| the start | half a second more | nothing built on the main thread |

Measured 2026-11-13 (M1, Playwright WebKit, 1440 × 779, pixel ratio 1; the GPU's own time with the stand on and hidden
by turns): 4.3 ms a frame walking among them (140 000 drawn, 1.5 million triangles), 3.2 ms at 45 m, 1.7 ms at 300 m,
0.3 ms from 2600 m. Travelling (walking, running, flying low) the mean frame stays 16.7 ms.

What the test found:
- **What is under a pixel is not drawn.** Of the million about 140 000 to 180 000 are a pixel or more at once on this
  screen. Drawing every one (`?stress=all`: down to a fifth of a pixel, 920 000 to 964 000 in view) costs 8 to 9 ms:
  about 9 ns a thing however few its triangles (a dot of one triangle no less than a tetrahedron). The M1 bins every
  triangle into its screen tiles; a million tiny ones in a band at the horizon is its limit. Beyond a pixel a stand must
  be the land's colour, as the forests are.
- **Streaming must know the camera's speed.** Asked for by distance alone, flying low built a hundred meshes a second
  that were passed before they came (13 % of frames late). Asked for only where the camera will still be (0.35 s
  ahead), 1 to 2 %.
- **A mesh that comes must not repack everything**: only its own level and the next coarser one (`heap.versions`).

## What this does not yet give

- **The trees, the rocks and the grass are not on the heap yet**: they keep a draw call a shape and level. The heap
  takes meshes of one material (a colour a vertex); a tree's bark, leaves and wind are the next step.
- **The test's assets are generated**, each level sampled from its shape. A drawn asset needs its levels cut by a
  simplifier, and comes from a file: the heap's side of that (`put`) is the same.

- **A tree's first start still builds its meshes on the main thread**, and every start holds them whole (35 MB for two
  trees and five shrubs), with a draw call and a slice of the packing's buffer a shape and level: fine for tens of
  kinds a stand, not for hundreds. The heap above is the way out, once it takes a tree's material.
- **The rocks and the grass have their own engines** (`rocks.js`, `grass.js`): the same rule, not the same tiers.
- **The WebGL 2 fallback draws no plants** (seen 2026-11-12, and so before this): its packing per vertex gives none.
