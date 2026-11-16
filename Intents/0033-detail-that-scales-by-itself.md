---
id: "0033"
title: Detail that scales by itself, from any asset
state: idea               # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story:
---

# 0033 · Detail that scales by itself, from any asset

## Idea

> Can you research an algorithm for better smooth automatic LOD? Instead of each asset defining its own breakpoints
> that are not smooth transitioning?
> Isn't there a good fully automatic render engine algorithm, that can take even a 10 million procedurally generated
> asset and scale it automatically? Down to just a pixel from the far horizon? Fully smooth?
> Search for the algorithm based solution that can plug any asset as large as it will be in fully detailed view. You
> see what I mean?

Samuel wants an asset's file to hold its full-detail recipe and nothing else: no levels, no pixel sizes. One rule of
the engine takes it from there down to a pixel, with nothing to see on the way. Below: what is written per asset
today, the answer, what was measured on our own assets, what exists, what is not known, and what I would build.

The research in full, with its sources: `reports/Smooth automatic level of detail.md`. Its notes, and the two scripts
that made the measurements below with their outputs: `research_notes/Smooth automatic level of detail/` (the scripts:
`probes/dag.mjs`, `probes/crown.mjs`; what was measured: `probes_on_the_games_own_assets.md`; two pictures of it:
`probes/out/boulder-four-ways.jpg`, `probes/out/oak-crown-under-each-rule.jpg`).

### What is written per asset today

Intent 0002 gave every asset one rule for *when* a level changes (its size on screen) and one way to hide the change.
*Which levels there are* is still said three ways (read in the code, 2026-11-16):

| Make | Its levels | Its pixel sizes | A change |
| --- | --- | --- | --- |
| Solids: rocks, the stand's bodies, creatures | a ladder of eight for every kind: the full mesh, balls of 32, 16, 8, 4, 2, 1 squares an edge, a dot (`assets/kit/ladder.js`) | 400, 128, 64, 32, 16, 8, 4, 1.15 | every vertex moves to its place on the next mesh: nothing jumps |
| Plants | tables in each species' file: puffs, cards a puff, card sizes, tube sides, a number for each level (`assets/stonepine.js`, `holmoak.js`) | per kind (`assets/kinds.js`) | sprigs shrink and grow one after another |
| Made things: the tent, the fire pit, later houses | face lists written by hand for each level (`assets/belltent.js`: `bell(32)`, `bell(16)`, `bell(10)`, `bell(6)`) | per kind | none: one frame the one, the next the other |

A level is always chosen for a whole thing. A rock larger than the screen is drawn at its full mesh all round.

### The answer

**Yes, there is such an algorithm, for everything that is a surface.** Unreal calls its version Nanite; the idea is
from research of 2005 (Batched Multi-Triangulation). It has two halves:

1. **Once, when the asset is made.** Its full mesh is cut into clusters of about a hundred triangles. Neighbouring
   clusters are grouped; each group is simplified to half its triangles while the group's outer border is held still;
   the result is cut into clusters again. At the next level the clusters are grouped differently, so no border is held
   for ever. This goes on until one cluster is left. Every cluster keeps two numbers: how far it is off the full mesh
   (its error), and how far its coarser replacement is.
2. **Every frame, for each cluster by itself.** It is drawn if its own error is under so many pixels on screen and
   its replacement's is not. That one test, the same for every cluster of every asset, gives a closed surface with no
   cracks, finer where the camera is near and coarser behind, and never more triangles than the screen can show.

One number is left for the whole engine: the error in pixels. It is the governor's dial. No asset writes a level.

**It is not the whole answer.** Three things complete it:

- **A crown of leaves is not a surface.** The same simplifier thins it away (measured below). For a heap of small
  loose parts the rule is another, from Pixar (Cook and others, 2007) and what SpeedTree's leaves do: keep a share of
  the parts, in an order fixed once, and enlarge the ones that stay so the heap covers as much. Unreal's newest answer
  (5.7, November 2025, experimental there) turns far crowns into small cubes instead.
- **The hierarchy ends at one cluster, not at a pixel.** Under it the last cluster is halved again and again to a
  handful of triangles, then comes the dot and the land's colour we have. What each of these last steps must keep is
  what the eye gets from the thing: how much it covers and its mean colour.
- **"Smooth" in the published systems means "too small to see", not "blended".** At an error of one pixel a change
  moves the surface by less than a pixel, and a picture kept from frame to frame (ours is: `src/core/temporal.js`)
  hides the rest. Above a pixel a change can show. Then there are two ways: a stipple between the two cuts (drawing
  both for a while), or ours, moving vertices. Nobody found has done ours inside such a hierarchy; I tried it below.

So: **one measure (error in pixels), two rules that need nothing from the asset (a surface: the cluster hierarchy; a
heap of small parts: thinning and enlarging), one end (the dot, then the land's colour).**

### Measured on our own assets

Two scripts, run in this session on our recipes with the open-source `meshoptimizer` (MIT) through its WebAssembly,
as a worker would call it. One thread of a cloud machine, under Node. **Nothing was drawn**: no frame time, no GPU.

**A boulder** (`assets/boulder.js`, shape 0, its full mesh of 110,592 triangles):

- Its whole hierarchy is built in **0.4 s**; the recipe itself takes 0.24 to 0.51 s to make the mesh. 1,814 clusters,
  15 levels, twice the mesh's triangles in all, 3.1 MB (the full mesh alone is 2.2 MB in the heap today).
- **No crack** in 177 views from all round and from every distance.
- Triangles drawn, by its size on screen, beside the ladder:

| Size on screen | Ladder today | Cut at 1 px of error | At 2 px | At 4 px |
| --- | --- | --- | --- | --- |
| 2000 px (larger than the screen) | 110,592 | 54,306, of them 23,678 in view | 39,424 (17,692) | 29,802 (13,868) |
| 500 px | 110,592 | 17,000 | 9,614 | 6,104 |
| 400 px | 12,288 | 13,210 | 6,340 | 3,436 |
| 200 px | 12,288 | 3,436 | 1,716 | 428 |
| 128 px | 3,072 | 1,716 | 428 | 214 |
| 64 px | 768 | 428 | 106 | 52 |
| 16 px | 48 | 26 | 26 | 6 |

- How far the drawn surface really lies from the full mesh, where each ladder level takes over (root mean square /
  the most, in pixels). At 400 px: the ladder 0.56 / 4.41; the cut at 1 px 0.14 / 1.10; at 2 px 0.24 / 1.49. At
  128 px: 0.45 / 2.86; 0.19 / 1.02; 0.44 / 2.11. So **at two pixels the cut is about as good as the ladder with 2 to 7
  times fewer triangles**, and at one pixel a good deal better with about as many or half.

**Ten million triangles** (a ball displaced by seven octaves of our noise): built in **25 s** on one thread (a million:
2.6 s). At 400 px across it is drawn with 55,574 triangles at one pixel of error, 9,638 at four; filling far more than
the screen, 171,755 in view.

**An oak's crown** (`assets/holmoak.js`, 21,444 triangles, 3,300 sprigs). How much of the picture the crown covers,
from the side and from above, beside the full crown (a card taken as 45 % sprig):

| What is done | Leaf triangles | Cover, side | Cover, above |
| --- | --- | --- | --- |
| The simplifier, to a tenth | 832 | 34 % | 25 % |
| A tenth of the sprigs at random, left their size | 1,320 | 37 % | 28 % |
| A tenth, each enlarged 2.9 times back into the crown | 1,320 | 99 % | 101 % |
| 4 %, each enlarged 4.5 times | 528 | 99 % | 101 % |
| Its hand-made levels today | 3,168; 768; 216 | 108 to 113 % | 85 to 112 % |
| The kit's far body, then its speck | 24; 8 | 63 %; 32 % | 83 %; 63 % |

The enlargement was found by measuring, not given; it comes out close to what keeps the leaf area. Enlarged the
other way, out of the crown, the same factor makes the crown a third too large.

**The tent** (`assets/belltent.js`, 1,392 triangles after its corners are welded):

- The canvas simplifies well, and the open surface stays whole (no crack in 177 views).
- Its eight ropes (2.4 cm wide) go in one step, when they are about half a pixel wide, and its pegs by halves.
  Counting their loss by distance instead stalls the whole tent at 688 triangles down to 8 px. **Thin and loose parts
  are the weak spot**: they should be parts of their own that fade by how much they cover.

**Moving vertices inside the hierarchy** (our way of hiding a change, tried on the boulder): every vertex a group
loses keeps where it lies on what the group is simplified to, and is drawn part way there. No crack while moving
(measured). On a walk up to the boulder the largest change in one step fell from 2.72 to 1.47 px at two pixels of
error and from 6.75 to 2.51 px at four. Not to nothing: an exact target needs the simplifier's own record of which
vertex was folded into which, and the open simplifier does not give it.

### What exists openly

- **`meshoptimizer` 1.3** (MIT, September 2026): every building block. Its JavaScript package leaves out the grouping
  step; the probe's own took a few dozen lines.
- **`three-virtual-geometry` 0.1.3** (MIT, October 2026, one author): this very method for three.js's WebGPU renderer
  with compute passes. Read, not run. Its author reports 147 to 230 frames a second on a MacBook Pro with an M4 Pro
  in Chrome while drawing 6.5 to 9 million triangles. It publishes nothing for Safari or a phone. It already holds
  answers to most of the above: a tail under one cluster, a stipple above 1.25 px, leaves thinned in pairs and
  widened, a hull of small cubes for far crowns.
- Bevy's version needs GPU features no browser has. A 2024 WebGPU demo runs in Chrome only.

What a browser lacks (from the research notes, read from the browsers' own pages where they could be reached): many
draws in one call, mesh shaders, and the 64-bit counters a fast drawer of pixel-sized triangles needs. Compute passes,
storage buffers and a draw whose count the GPU writes are in Chrome, Safari 26 and Firefox; we use all three already.
So in a browser the aim is an error of one to two pixels with triangles several pixels wide, not a triangle a pixel.

### What is not known

- **Whether Apple's GPUs draw many small clusters fast enough**, in Safari and on an iPhone. Nobody has published it,
  and nothing was drawn here. It is the one number that decides how low the error can go.
- What the vertex stage costs. A cluster's corners are looked up one by one, so a vertex is worked out four and a
  half times (83 vertices a cluster, 384 corners); the ladder's balls share a list and work each out once. By count, at
  two pixels of error, the boulder then costs three times today's vertex work at 400 px, about as much at 200 px and
  when it is larger than the screen, and half at 500 px. `src/detail/README.md` found this stage to be what a small
  thing costs.
- How long a build takes on a phone (here: 0.4 million triangles a second on one cloud core).
- How shading behaves across the steps: only shape was measured, not normals, textures or wind.
- Most primary pages (Epic's documentation, the Nanite course notes, arXiv, several authors' sites) were refused by
  this session's network rules, and the search budget ran out. The report marks every statement that rests on a
  search extract or on recollection.

### What I would build, and in which order

Each stage its own measurement, as 0002's were. Not begun: this is for Samuel to take up or not.

0. **A measurement that costs a minute**: the open library's live demo in Safari on the Mac and on the iPhone, its
   frame rate read. It says whether to go on, before anything is built.
1. **Solids on the hierarchy.** Built in the recipes' worker and kept, as meshes are now. A cluster is one more class
   of size for the drawer (384 corners). A thing far off takes its one small cluster straight from the packing pass.
   The ladder and its eight pixel sizes go. Beside it: the walk of 0002's check 2, and triangles and GPU time in the
   stress stand, before and after.
2. **Made things.** Corners welded, thin loose parts apart; the face lists written by hand for each level go.
3. **Plants.** One fixed order of a shape's sprigs, the enlargement found when the asset is made; the wood through the
   hierarchy. The tables per level go.
4. **The far end keeps its cover**: the last triangles, the dot, the land's colour.
5. **Above a pixel**, if a phone needs it: moving vertices inside the hierarchy, with an exact target.

### Samuel's to decide

- Whether to take this up, and from which stage.
- The open library as it is, or the method in our own drawer. I would build it into the drawer: our solids carry
  bones, wind, snow, a look per kind and their own packing, and the library draws static meshes with its own
  materials. It is the reference to read and to measure.
- Whether `meshoptimizer` may come in as the game's second dependency.
- Whether the refused pages may be allowed, for a check of what the report marks as not verified.

## Define

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel: read the answer; say whether to take it up, and from which stage
- [ ] Samuel: open the library's live demo in Safari on the Mac and on the iPhone, and say what frame rate it shows
- [ ] Samuel: may the refused pages be allowed for a check of the report's marked statements

## Changelog

### 2026-11-16

- **Asked:** to research an algorithm for smooth, automatic levels of detail that takes any asset at full detail, even
  ten million triangles, down to a pixel, in place of each asset's own breakpoints.
- **Delivered:** this intent with the answer; a research report from five threads of web research; two scripts run on
  our own boulder, tent, oak and pine, and on balls of one and ten million triangles, with their outputs; two pictures
  of what they found (the boulder four ways, the oak's crown under each rule).
- **Good:** The method was tried on our own assets, not only read about: the boulder's hierarchy in 0.4 s with no
  crack, ten million triangles in 25 s, the oak's crown kept within 1 % by thinning and enlarging. Found on the way:
  an open library for this method on three.js's WebGPU renderer, five weeks old.
- **Broke / not there yet:** Nothing was drawn: no frame time, no Safari, no iPhone. Most primary pages were refused
  by the session's network rules and the search budget ran out, so parts of the report rest on search extracts and
  are marked. The open library was read, not run (the session's guard declined running it cut off from the network).
  Moving vertices inside the hierarchy halves the largest jump but does not remove it. An earlier figure of mine, that
  the cut matches the ladder at four pixels of error, was wrong when checked and is corrected to two.

## Trail

| When | Commit | What |
| --- | --- | --- |
