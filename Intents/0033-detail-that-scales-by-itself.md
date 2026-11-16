---
id: "0033"
title: Detail that scales by itself, from any asset
state: define             # idea | define | build | propose | story | archived
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

And, when the answer had come:

> It should also ensure to increase the current quality gate while keeping 60 fps and 4K intact.
> I don't like our current LOD system either: it kind of visually transforms, changes shapes and style, pumps,
> especially shrubs and tree crowns. This should be 100 % smooth with no visible difference. Do you see what I mean?

Samuel wants an asset's file to hold its full-detail recipe and nothing else: no levels, no pixel sizes. One rule of
the engine takes it from there down to a pixel, with nothing to see on the way: no swelling, no shrinking, no change
of shape or style, above all on shrubs and crowns. The picture is to be better than today's, and the gates stay: 60
frames a second and 4K. Below: what is written per asset today, what Samuel sees today (measured), the answer, what
was measured on our own assets, what exists and what is not known. What would be built is in the definition.

The research in full, with its sources: `reports/Smooth automatic level of detail.md`. Its notes, and the two scripts
that made the measurements below with their outputs: `research_notes/Smooth automatic level of detail/` (the scripts:
`probes/dag.mjs`, `probes/crown.mjs`; what was measured: `probes_on_the_games_own_assets.md`; three pictures of it:
`probes/out/boulder-four-ways.jpg`, `probes/out/oak-crown-under-each-rule.jpg`,
`probes/out/today-each-plant-at-each-level.jpg`).

### What is written per asset today

Intent 0002 gave every asset one rule for *when* a level changes (its size on screen) and one way to hide the change.
*Which levels there are* is still said three ways (read in the code, 2026-11-16):

| Make | Its levels | Its pixel sizes | A change |
| --- | --- | --- | --- |
| Solids: rocks, the stand's bodies, creatures | a ladder of eight for every kind: the full mesh, balls of 32, 16, 8, 4, 2, 1 squares an edge, a dot (`assets/kit/ladder.js`) | 400, 128, 64, 32, 16, 8, 4, 1.15 | every vertex moves to its place on the next mesh: nothing jumps |
| Plants | tables in each species' file: puffs, cards a puff, card sizes, tube sides, a number for each level (`assets/stonepine.js`, `holmoak.js`) | per kind (`assets/kinds.js`) | sprigs shrink and grow one after another |
| Made things: the tent, the fire pit, later houses | face lists written by hand for each level (`assets/belltent.js`: `bell(32)`, `bell(16)`, `bell(10)`, `bell(6)`) | per kind | none: one frame the one, the next the other |

A level is always chosen for a whole thing. A rock larger than the screen is drawn at its full mesh all round.

### What Samuel sees today, measured

He is right, and it can be counted. Each of a plant's levels as its file draws it, beside its nearest level: how much
of the picture the crown touches (its outline) and how much it covers, seen from the side (the picture:
`probes/out/today-each-plant-at-each-level.jpg`).

| Plant | Level, and the height on screen it is drawn at | Triangles | Outline | Cover |
| --- | --- | --- | --- | --- |
| Holm oak | nearest, 600 to 260 px | 21,444 | 100 % | 100 % |
| | level 1, 260 to 80 px | 3,948 | 109 % | 108 % |
| | level 2, 80 to 34 px | 1,068 | 116 % | 110 % |
| | level 3, 34 to 18 px | 228 | 127 % | 113 % |
| | its far body, 18 to 7 px | 30 | 57 % | 63 % |
| | its speck, 7 to 3 px | 8 | 29 % | 32 % |
| Stone pine | level 1, 2, 3 | 2,342; 810; 150 | 122 %, 134 %, 124 % | 120 %, 131 %, 116 % |
| | its far body, its speck | 30; 8 | 53 %, 27 % | 58 %, 29 % |
| Mastic (a shrub; its largest side) | nearest, over 140 px | 744 | 100 % | 100 % |
| | level 1, 140 to 16 px | 88 | 84 % | 75 % |
| | its far body, 16 to 5 px | 20 | 37 % | 49 % |

- **A crown grows by a tenth to a third as it goes to coarser levels, then falls to half and to a quarter.** Walking
  up to a tree it is the other way round: it swells out of a speck, overshoots, and shrinks to its true size.
- **Its shape changes**: the pine's umbrella is a ball at level 3 and a flat polygon after it.
- **Its style changes**: a coarser level has fewer and larger cards, each wearing the same sprig stretched, so its
  leaves grow (the pine's cards: 1.15, 2.6, 4.4, 6 m).
- **A shrub loses a quarter of its cover at its first change**: all its fine sprigs go there, 744 triangles to 88.

The hand-over between two levels is soft (both are drawn, sprigs shrink and grow one after another); what it moves
between are these different shapes. Beside them, the same oak thinned and enlarged by measure (below) held its cover
at 99 to 101 % and its outline at 100 to 106 % from all its sprigs down to 4 % of them.

### The gates

Three hard gates since 2026-11-13 (intent 0008): the canvas at the screen's own pixels, 4K on a 4K screen
(`src/core/screen.js`); 60 frames a second; 8 GB. "The highest realism they allow." A level is chosen by the game's
own pixels (`innerHeight`: `src/detail/index.js`), so on a screen of two pixels to each of them a level's error is
twice as many of the screen's: detail does not rise with the screen today.

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

- **On a screen of two pixels to each of the game's** (the 4K gate), at 400 of the game's pixels across: the ladder's
  12,288 triangles are off by 8.8 of the screen's pixels at most (1.1 root mean square); the cut with as many (13,210)
  by 2.2 (0.28); one screen pixel of error takes 25,734. Where today the full mesh is drawn, a third of it (33,126
  at 500 px, against 110,592).

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

## Define

Taken up with Samuel's second message. **Not approved yet: nothing is built before he says so.**

**What done looks like**

1. An asset's file holds its recipe at full detail. No asset and no kind writes a level, a pixel size or a table per
   level.
2. From its nearest view to where it sinks into the land a thing keeps its outline, its cover, its colour and the size
   of its leaves. What changes is under a pixel, or comes one small part at a time. Nothing swells, shrinks or changes
   shape or style.
3. The picture is nearer to the full-detail one than today's, and the gates hold: the canvas at the screen's own
   pixels, 60 frames a second, 8 GB, with no cost hidden behind the governor's dial.

**The shape of it**

- **One measure.** Error in the pixels that are drawn, one number for the whole engine. It is the governor's first
  dial, under a ceiling, and moves before the pixel ratio does.
- **A heap of small parts** (sprigs; later grass): one order a shape, fixed once and spread evenly through the crown.
  The share drawn follows the plant's size on screen. Those that stay are enlarged back into the crown by the measure
  found when the asset is made, and wear their sprig as large as it was, never stretched. One sprig comes or goes at a
  time.
- **A surface** (a rock, a body, canvas, a wall, trunk and limbs): the cluster hierarchy, built from the full mesh in
  the recipes' worker with `meshoptimizer` and kept between starts, drawn by our own drawer.
- **The end**: the last sprigs and the last few triangles keep the cover, then the land's colour takes over.

It takes over from intent 0002 what that left to each asset: which levels there are. 0002's one shading for every
level, its tiles to 10 km and its folding into the ground stay its own.

**Stages, each its own build and measurement.** Plants first: they are what Samuel sees, and nothing in them waits
for a number we do not have.

*Stage 1: crowns and shrubs.*

1. The thinning rule in the tree kit and the plants' drawer. A plant's file draws its plant once; its `levels`, its
   `most`, its tables per level and the kinds' pixel sizes for trees and shrubs go.
2. The far end by the same rule: the solid far body and the speck go; the last sprigs hand over to the land's colour.
3. A measure in the library: a walk up to a plant that records its outline, its cover and what changes from frame to
   frame, on the game's own picture (the probes' measures, made in the game).

*Stage 2: solids.* Before it, the number that decides: the open library's demo in Samuel's Safari on the Mac and on
the iPhone, then the boulders' hierarchy drawn through our drawer and its GPU time read on both.

4. The builder in the recipes' worker (clusters, groups, errors, the tail under one cluster), kept as meshes are.
5. Clusters in the heap, chosen in the packing pass, drawn by the drawer. A far thing takes its level from its
   distance alone.
6. The rocks and the stress stand's bodies moved; the ladder gone for them.

*Stage 3: made things.* 7. The tent and the fire pit from their finest faces alone: corners welded, thin loose parts
(ropes, pegs) as parts of their own that fade by how much they cover; the face lists written per level go.

*Stage 4: above a pixel*, only if stage 2's number puts a phone above about one and a half pixels of error. 8. Vertices
moved inside the hierarchy with an exact target (the simplifier's own record of what was folded into what).

*Stage 5: an asset of ten million triangles.* 9. Built in pieces, streamed by groups of clusters; a test asset in the
stress stand.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | No pumping | a recorded walk from 3 km up to 3 m on an oak, a pine and a mastic, at the screen's own pixels: outline and cover, each set against the nearest view's, stay within 5 % down to a crown 20 px tall and within 15 % from there to where it sinks. Today: the oak's outline +27 % then −43 % and −71 %, the pine's +34 % then −47 % and −73 %, the mastic's −16 % then −63 % |
| 2 | No jump | the same walks, and one over a boulder field and the tent: no frame differs from the one before by more than three times its neighbours' median (0002's check 2) |
| 3 | No change of shape or style | stills at six distances beside the same thing drawn at full detail with four times the pixels and made small: the difference smaller than today's at every distance. And Samuel walks up to a pine, an oak and a bush in his Safari and sees nothing change |
| 4 | The gates | the bench's views (`tools/bench.js`, `?gputime`): each stage's GPU time no higher than before it at the same inside ratio. Samuel's Safari: 60 frames a second, the canvas at the screen's own ratio in every row of the log, the governor's dials no lower than before. `window.__memory()` no higher; the start no slower |
| 5 | Better than today | check 3's difference lower than today's at every distance, at check 4's cost |
| 6 | A surface is closed and as near as it says | in a test, for every kind built: no edge with one triangle in 100 views (a thing's own rim apart); the drawn triangles no further from the full mesh than the error asked for, measured as the probe measured it |
| 7 | Nothing written per asset | `grep` finds no level, pixel size or table per level in `assets/*.js` or `assets/kinds.js` for the makes that have moved |
| 8 | Ten million triangles | the test asset stands in the stress stand, is walked round and into, and checks 2 and 4 hold |

Shown so far, in a model and not in the game: check 1 for the oak (cover within 1 %, outline within 6 % down to 4 %
of its sprigs); not yet for the pine (cover 113 % from the side and 87 % from above at a tenth of its sprigs: its few
large sprigs need the even order). Check 6 for the boulder (no crack in 177 views; one pixel asked, 0.9 to 1.1 found
at most, 1.5 in the tail under one cluster). Checks 2 to 5 and 8 need the game's own picture and a GPU: nothing of them is shown.

**Choices this definition makes** (Samuel may say otherwise)

- Built into our own drawer, not taken as the open library: our solids carry bones, wind, snow, a look per kind and
  their own packing, and the library draws static meshes with its own materials. It is the reference to read.
- `meshoptimizer` (MIT, about 300 KB) comes in as the game's second dependency, in the recipes' worker only.
- "No visible difference" is held to check 3's test: the picture of the thing at its distance against the picture of
  the full thing made small. Nearer than where a part is under a pixel that can be met closely, not exactly, unless
  every part is drawn; how closely is what check 3 measures and Samuel's eye decides.
- What a kind is drawn as on a device's first start, before its hierarchy is built there (0.7 to 0.9 s a kind for a
  boulder on one thread): the dot and the land's colour, or a coarse mesh from the recipe where a family offers one.

**Out of scope**

- The grass (its own engine), creatures and whatever is on bones (they keep the ladder until the rest is proven).
- Materials' own levels, tiles to 10 km and folding into the ground (intent 0002).
- A software drawer of pixel-sized triangles: browsers lack what it needs.
- New assets, beyond the test asset of stage 5.

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel: approve or change the definition
- [ ] Samuel: open the library's live demo in Safari on the Mac and on the iPhone, and say what frame rate it shows
      (before stage 2)
- [ ] Samuel: may the refused pages be allowed for a check of the report's marked statements
- [ ] Stage 1: crowns and shrubs
- [ ] Stage 2: solids
- [ ] Stage 3: made things
- [ ] Stage 4: above a pixel, if stage 2's number asks for it
- [ ] Stage 5: an asset of ten million triangles

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

### 2026-11-16 (2)

- **Asked:** that it also raise the picture's quality with the gates of 60 fps and 4K kept; and that nothing be seen
  as detail changes: the present system "visually transforms, changes shapes and style, pumps, especially shrubs and
  tree crowns. This should be 100 % smooth with no visible difference."
- **Delivered:** today's levels of an oak, a pine and two shrubs measured and drawn side by side; the boulder counted
  for a screen of two pixels to each of the game's; both requirements written in; the definition with its stages and
  checks, plants first; the research report of the first round.
- **Good:** What Samuel sees is in the numbers: a crown's outline at 109 to 134 % over its middle levels, then 53 to
  57 % and 27 to 29 %; a mastic at 75 % of its cover after its first change; leaves that grow with each level. On a 4K
  screen the cut holds the boulder's worst error to a quarter of the ladder's with as many triangles.
- **Broke / not there yet:** Nothing of the definition is shown in the game's own picture or on a GPU. The thinning
  rule meets check 1 for the oak in a model, not yet for the pine. Whether the picture gets better within the gates is
  not known until stage 1 is built and measured.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `a76da9d` | the intent opened with the answer; the research notes; the probes on our boulder, tent, oak and pine, their outputs and two pictures |
| 2026-11-16 | `4439949` | today's levels of an oak, a pine and two shrubs measured and pictured; the boulder on a 4K screen; the definition, plants first |
