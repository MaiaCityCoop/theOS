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
generated asset (`assets/kit/blob.js`: each its own mesh of 50 000 to 200 000 triangles). Every one of the city's 898
village plots holds a million of them, a thousand of each kind, and ten thousand more that move (people, robots,
animals, transports, each at its own pace): 898 million standing, nine million moving. It is drawn the way every kind
should come to be drawn (`src/scatter/heap.js`):

| | cost | |
| --- | --- | --- |
| where they stand | nothing kept: a plot is 133 numbers (its middle, its edge in 64 directions, the directions that cut its land into equal shares); its million are a lattice of 1000 by 1000 folded onto that shape, worked out on the GPU for the cells a tier looks at | 532 bytes a plot, whatever stands in it |
| where a mover is | a function of the clock (its round, its pace), worked out every frame for the plots near: no mover has a state | one packing a frame for all of them |
| the world's size | nothing: only the plots near the camera are looked at | |

| | cost | per kind |
| --- | --- | --- |
| draw calls | one a level (eight), and eight for the movers, whatever the kinds | none: a draw reads its vertices from the heap by the kind's number |
| draw shaders | two: the meshes', the dots' | none |
| its look | a row of numbers (two textures, two tints, a shading model, gloss, sway, snow) read by its pixels | 64 bytes |
| shading models | a branch each in the one shader (twelve in the test: matte, glossy, metal, leafy, glowing, wet, …) | none |
| always held | its coarse levels (768 triangles down to twelve) | 29 KB |
| held while near | its full mesh and two under it, in a few slots a level, built in workers | 2 to 6 MB, 344 KB, 86 KB, put out when the camera has gone |
| the start | half a second more | nothing built on the main thread |

Nothing of it changes at once (the answer to levels popping at every distance):
- **A level turns into the next coarser one before that takes over.** Every vertex is kept twice: as it is, and where
  it lies on the coarser mesh (with that mesh's normal there). Over a level's last pixels it moves from the one to the
  other (`heapVertex`), so the two are the same shape when they change. No dither, no two levels drawn at once.
- **A fine level that comes late grows out of the coarser one** the same way, over half a second, and one level after
  another, never two at once (measured: 5 to 12 % of the picture changing a frame, against 42 to 75 % in one frame).
- **Its textures are read at every level**: the mipmaps make a far thing its textures' mean, so its colour does not
  jump either; under 12 pixels it reads that mean itself.
- A level is chosen by size on screen, so a large thing keeps its detail further off than a small one beside it: that
  is right, and with the above it no longer shows.

Measured 2026-11-13 on the first stand (a million on one square of four kilometres; M1, Playwright WebKit, 1440 × 779,
pixel ratio 1; the GPU's own time with the stand on and hidden by turns), with textures, relief, wind, snow and the
twelve models: 5.4 ms a frame walking among them (135 000 drawn,
1.5 million triangles), 2.2 ms at 45 m, 1.1 ms at 300 m, 0.1 ms across the field, nothing from 2600 m. (With plain
colours it was 4.3 ms walking.) In Samuel's Safari, before the materials: 59.2 frames a second at a pixel ratio of 1
to 2, as the plain world.

The plots, measured the same way but with Samuel's own tab drawing beside it (so too high): 10.6 ms walking in the first
village (135 000 drawn, 2.4 million triangles, 3 900 movers), 2.0 ms at 45 m, 1.6 ms at 300 m, nothing from 2000 m (all
of it under a pixel). The start 5.4 s against 4.2: over the five seconds, in the slower browser. Checked: 99.9 % of what
stands and of what moves lies inside its plot's outline; a plot's lattice covers 92 to 94 % of its land.
In Samuel's Safari: 58.7 frames a second from higher up at a pixel ratio of 2; near the ground 55.8, with spans of 47
to 56 until the governor had the ratio down to 0.75: among them the plots do not yet hold the gate.

What the test found:
- **A covered window tells nothing.** A browser window behind another draws three to twelve frames a second whatever
  it holds: frame counts mean something only for a window in front. The GPU's own time (`?gputime`) does not care.
- **A plot's shape must be folded share for share.** Folded by direction alone, a plot cut short by the river held six
  times as many to the square metre on that side as on its long side.
- **What is under a pixel is not drawn.** Of the million about 135 000 to 180 000 are a pixel or more at once on this
  screen. Drawing every one (`?stress=all`) cost 8 to 9 ms: about 9 ns a thing however few its triangles. Beyond a
  pixel a stand must be the land's colour, as the forests are.
- **A small thing's cost is its corners' shader, not its pixels'.** The dot in the meshes' shader cost three times
  what it costs in a small shader of its own, though its branch was never taken. So: few shaders, but the far level
  its own.
- **A pixel must read only what it shows**: the texture its pattern shows there, the relief only when large on screen.
- **Streaming must know the camera's speed**, and a mesh that comes must not repack everything (`heap.versions`).

How many shaders: the plain game compiles 16 vertex and 14 fragment programs (21 draw pipelines); the stress stand adds
two. A game like GTA V draws a frame in about 1900 draw calls and has shader templates in the hundreds, with tens of
thousands of materials on them: there too a material is numbers and textures on a shared shader, not a shader of its
own. What a browser cannot pay is the draw calls, so here models are branches and looks are rows.

### Ten thousand kinds, a texture each, and movers made of parts

- **Kinds: 10 000.** Each plot holds every kind exactly a hundred times. Only a kind's two coarsest meshes and its dot
  are always held (2 KB a kind); every finer level is a slot in a pool, filled for the kinds near (2048, 768, 320, 48
  and 8 slots, finest last).
- **A texture of its own each** (`blobSkin`: 128 pixels a side, painted in a worker): one layer of an array of 1024,
  given to the kinds that are large enough on screen to show it (from 28 pixels), fading in when it comes; under that
  and until then a kind wears its texture's mean colour, which is what the mipmaps make of it anyway. All ten thousand
  at once would be 870 MB; the pool is 89. Needs more array layers than a device gives unasked (`src/main.js`).
- **A level turns into the next over the whole of its range**, not its last third, and a mesh that comes late grows in
  over a second and a half: a thing is never still between two levels, and never jumps.

### Families: what plugs in, and what the engine knows

Nothing of the engine knows a kind by name. A kind comes from a **family**: one file in `assets/zoo/`, found there by
itself, that keeps one contract (`assets/zoo/index.js` writes it out):

| a family gives | what it is |
| --- | --- |
| `count` | how many kinds it brings |
| `meshOf(i, l)` | kind i's mesh at level l of the ladder (`assets/kit/ladder.js`), every vertex 16 bytes (`assets/kit/solid.js`): its place, normal and shade, where it lies on the next coarser level's mesh, the two bones that move it |
| `skinOf(i, size)` | its own texture |
| `lookOf(i)` | plain numbers: its shading model, tints, relief, gloss, sway, snow, size, whether it is cut out as leaves |
| `bonesOf(i)` | its skeleton (sixteen bones, three rows of numbers each), where it has one |
| `boundsOf(i)`, `collidersOf(i)` | its box, and what of it is solid, as shapes in its own frame: sphere, capsule, box, mesh; a shape may move with a bone, or be passed through (leaves). A family that says nothing still has both: its coarse mesh is its collider |
| `roams` | its herds: pace, size, girth, whether they keep to the roads or fly, their stride; without it its kinds stand |

Three families today, each a stand-in for what a real asset will ask of the engine:

- **blobs** (8 000 kinds, `assets/kit/blob.js`): whole bodies of 50 000 to 200 000 triangles.
- **fronds** (2 000 kinds, `assets/kit/frond.js`): plants of thousands of leaf cards, cut out as leaves in the pixel
  stage from where on its card a pixel is (no texture is needed, so it is cut out at any distance), drawn from both
  sides, swaying. At a coarser level there are fewer cards, each wider; those that go thin away while those that stay
  widen. What is cut out is a draw of its own a level (another state of the pipeline, a branch that drops pixels):
  the bodies' pixels keep their early depth test.
- **creatures** (1 000 kinds in ten herds, `assets/kit/creature.js`): each ONE mesh on a skeleton nobody rigged: a
  rig is a few lines that set out bones and lay tubes round them. Every vertex is bound to two bones; the vertex
  stage moves it by the mover's stride, which is a function of the clock. No mover has a state, and the CPU does
  nothing for a leg that swings.

The other plug points, each a file found by itself: a **shading model** (`src/shading/*.js`: `lit(c)`, a branch of
the one shader), a **material** of the world (`materials/*.js`), a **biome** (`biomes/*.js`), a **scatter engine**
(`src/scatter/*.js`), an **asset** of the library (`assets/*.js`). The engine under them: the heap (`heap.js`), the
vertex's 16 bytes, the ladder, the tiers, the recipes' worker and the keeper.

**What is solid** (`src/world/bodies.js`): one description for a rock, a tree, a house, a car, an animal, said by the
thing's own family beside its meshes. Who places things says where they stand (`addBodies`); who needs to know asks:
`bodiesNear` (the bodies round a point, each with its box and shapes), `roundsNear` (what stops the walker:
`src/world/solids.js`), `hit` (the first body a ray meets), `outline` (their boxes and shapes as lines). The stand
says where its 898 million stand and where its movers are by the same reckoning as the GPU, for the cells round the
point only; a creature's capsules move with its bones. They stop the walker, each shape by its own outline
(`pushOut`: a box's sides, a capsule's length; what ends under the knee is stepped over), and a step stopped short
goes round (`solids.js`). `?stress&bounds` draws them; `?stress&ghost` walks through them. The placed assets' walls, the rocks and the trunks still have their own descriptions (`solids.js`): they
come onto this one as they become families.

**What moves keeps clear** (`src/scatter/stress.js`), by the same description, and with nothing remembered: a
plot's roads are stood on by nothing and driven each way on its own side; each frame the GPU pushes every near
walker out of the rounds of what stands in the cells round it (a kind's round and height are two numbers of its
look, from its family's colliders or its hull), and half way out of any mover beside it (a grid the movers write
themselves into). A herd's `girth` is how wide its movers are. `?stress&crash` turns it off, to count against.
What drives does not yet give way, and nothing plans a way through a thicket.

**Memory (the game must run on 8 GB).** What only the GPU reads lives on the GPU only (`src/core/gpu.js`): the
heap's meshes, the near plots' places, what every tier packs. Every pool says what it holds, and the readout shows
the sum (`held`; `window.__memory()` lists it). 2026-11-13: the plain game 328 MB on the GPU and nothing beside it
(its tiers' buffers were held twice: 89 MB of page memory gone); with the stand 578 MB and 2 MB beside it (the
stand's meshes 94 MB once, where they were 131 MB twice). What the workers make at a first start (eleven thousand
kinds' coarse meshes) is kept in the browser under the recipes' fingerprint (`src/core/kept.js`) and read back at
the next.

## What this does not yet give

- **The trees, the rocks and the grass are not on the heap yet**: they keep a draw call a shape and level. The heap
  now draws cut-out, two-sided leaves (the fronds), so nothing of the engine is missing for them: each must become a
  family that keeps the contract (its vertices in 16 bytes, its levels with their places on the next).
- **Textures are the world's twenty**, two a kind, tinted: a thousand kinds with textures of their own would be
  gigabytes and must stream as the fine meshes do.
- **In real Safari the materials cost pixels**: 59 frames a second, but the pixel ratio down to 0.75 walking among
  them (1.1 to 1.4 with plain colours), and 1.6 % of frames late.
- **Only the coarse levels are kept between starts**: the fine meshes and textures of what stands near the camera
  are made again by the workers at every start (a second or two until all of them are there).

- **A tree's first start still builds its meshes on the main thread**, and every start holds them whole (35 MB for two
  trees and five shrubs), with a draw call and a slice of the packing's buffer a shape and level: fine for tens of
  kinds a stand, not for hundreds. The heap above is the way out, once it takes a tree's material.
- **The rocks and the grass have their own engines** (`rocks.js`, `grass.js`): the same rule, not the same tiers.
- **The WebGL 2 fallback draws no plants** (seen 2026-11-12, and so before this): its packing per vertex gives none.
