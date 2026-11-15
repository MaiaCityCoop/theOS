---
id: "0027"
title: One collision for every world
state: propose         # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-15
story:
---

# 0027 · One collision for every world

## Idea

Samuel: in the normal world he can still walk through trees. The stress world (Magic Wonder, `?stress`) was where
bounding boxes and collision were to be solved generically: every placed thing gets its collision from its own
geometry or bounds. His two questions: was it fully generic, and was everything from the stress test ported into the
normal world?

Asked: find out exactly how collision works in the stress world and in the normal world, and answer both questions
plainly; then make collision one generic system that every world uses. Anything placed in any world (trees, rocks,
shrubs, buildings, tents, characters, instanced or scattered plants) registers its collision by itself, from its
bounds, in a sensible shape: a trunk-sized cylinder for a tree, not its crown's box; nothing for grass. No special
case per world or per asset. It has to hold for as many things as the stress world has (cells looked up, no list of
everything walked every frame). Port whatever else of the stress test belongs in the normal world. Shown in Chromium:
the walker driven into trees, rocks and buildings, positions before and after; the stress world still working; the
frame time no worse.

## Define

Asked for outright, with the requirements spelled out; the definition holds no surprise, so built straight away.

**What was found** (the answer to the two questions, in short; the long form under Build)

- *Fully generic?* The description and the engine were: intent 0008 (2026-11-13, `3b0debe`, `d422f9a`, `6b56480`)
  gave every kind of the zoo a box and colliders beside its recipe (`boundsOf`, `collidersOf`, else its coarse mesh:
  `assets/zoo/index.js` `bodyOf`) and made one place that answers what is solid (`src/world/bodies.js`). But only one
  placer ever told it where things stand: the stress stand. Intents 0022 and 0023 only added the Magic Wonder tile and
  fixed its uniform buffers; they did not touch collision.
- *Ported?* No. 0008 wrote it down twice: "the placed assets' walls, the rocks and the trunks still have their own
  descriptions". The normal world kept three older paths beside the engine: the placed assets' `solid` blocks in a
  list (`src/world/solids.js`), the rocks worked out again on the CPU (`src/world/rocksolid.js`), and the trees'
  trunks read back from the shadow's stand-in packing (`src/world/trunks.js`). Only trees whose kind casts a shadow
  and has a measured trunk were ever solid, and only while that read-back worked; shrubs, bracken, reeds and the
  litter had nothing (their kind says `solid: false`), and the trunks were a list walked whole for every step.
  `?bounds` and `?ghost` worked only in the stress world.

**Deliverables**

1. **One engine** (`src/world/bodies.js`): every question of what is solid, in every world, is asked there: the
   bodies round a point, where a walker may stand (`pushOut`), walls with their doors and the room overhead, a line
   of sight, a ray's first hit, the outlines. The walker's step (`src/world/solids.js`) asks only it.
2. **Every placer registers bodies**, by a lookup of cells round the point, each body from its thing's own geometry
   and its kind's rule, in the one description (box and shapes):
   - placed assets (`src/world/place.js`: the tent's walls, door and roof, the fire pit's seats and bench), in a grid;
   - the scattered rocks, by the hash that places them, each its measured round and height (`assets/kit/rock.js`);
   - every plant the trees' engine places, read back from a packing of what stands round the walker (every kind,
     not only those that cast): a tree its trunk as a cylinder, measured where a walker meets it; a shrub its leaves,
     brushed through at the edge and led round in the middle where it stands over the knee; what lies lower than the
     shin is stepped over (`assets/kit/plant.js`, `assets/kinds.js`);
   - the stress stand as it was; grass registers nothing.
3. **Scale:** no provider walks a list of everything: grids and lattices, cells round the point.
4. **The stress test's tools in every world:** `?bounds` draws the bodies round the walker, `?ghost` lets the walker
   through everything.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Trees stop the walker | Chromium (Playwright, WebGPU on SwiftShader): the walker put 3 m before each of four trees the forest draws, W held for 26 frames: before, the walker passes through; after, it ends short of the trunk. Positions before and after |
| 2 | Rocks stop the walker | the same, before the two largest rocks round the forest and the tent |
| 3 | Buildings | from behind into the tent's wall: stopped outside; from the front through its door: in; into a fire-pit seat: stopped |
| 4 | Shrubs | into a shrub over 1.6 m: not straight through its middle |
| 5 | The stress world | `/?stress` loads and draws; a walk into its thicket is stopped or led round (made good less than free); `?stress&ghost` walks through |
| 6 | Frame time | the step's own time a frame, and the frame time, before and after, in the forest and in the stress world, the same browser |
| 7 | No list walked | in the code: every provider answers by cells |

**Out of scope**

- What moves among what stands (the stress stand's herds keep their lanes; nothing else moves).
- The camera's line of sight is stopped by walls only, as before (a camera pulled in by every stone jumps).
- The library's Body row keeps showing a placed asset's own block (intent 0025 is working on the library).
- Real Safari and real GPUs: the checks here run on SwiftShader, whose frame times say little about a Mac's.

## Build

**What was found, in full** (read in the code and the intents, then seen in Chromium on the code of main)

- The stress world: its things stand where a lattice folded onto each plot says (`standsAt`, `moverAtJS`, the same
  reckoning as the GPU's), and it answers `addBodies` with them, each with its kind's body (`bodyOf`: its family's
  `boundsOf` and `collidersOf`, else its coarse mesh). The walker's step asked `pushOut` in `src/world/bodies.js`,
  which asks every provider. That part was generic: one description, one engine, cells round a point.
- The normal world never registered a provider. Its step (`src/world/solids.js`) walked, besides `pushOut`, three
  older paths: a list of every placed asset's `solid` block (walls with door gaps, posts, boxes, ceiling) walked
  whole at every step; the rocks worked out again on the CPU (`rocksNear`); and the trees' trunks, read back from the
  shadow's stand-in packing (`src/world/trunks.js`), a list walked whole for every query. So:
  - only the kinds that cast a shadow had trunks (the holm oak and the stone pine); every shrub (mastic, rockrose,
    bracken: up to 3.5 m), the reeds and the litter had nothing at all (`shrub: { solid: false }`);
  - the trunks existed only while the stand-in's read-back came back (here it never did until the frames were held to
    what the GPU managed; in a browser that is behind it comes late);
  - the rig stopped the walker only under 4 m (`h < 4`), but its follow view (the street band, behind and above him,
    the mouse held) begins at about 2.9 m: walking there, nothing stopped him at all;
  - a step was one jump, however long (a slow frame, a run), so a thin trunk could be stepped over.
- Seen on main (`?` none, Chromium, the walker put 3 m before each thing, W held, his path recorded):
  four trees of the forest held him off at 0.34 to 0.63 m from their middles (he went round them); two shrubs of
  3.5 m he walked straight through, 0.013 m from their middles; two rocks held him at 0.77 and 0.80 m; the tent's wall
  at 2.75 m, its pole at 0.34 m; a fire-pit seat at 0.54 m. In the follow view at 8 m, three trees of 12 to 17 m he
  walked straight through: his line never moved sideways.
- Intents 0022 and 0023 did not touch collision: the first added the Magic Wonder tile, the second packed the stand's
  ways into one uniform array.

**What was built**

- `src/world/bodies.js` is the one engine for every world. New in it: the round wall with doors as a shape (a walker
  keeps to the side of it he came from, through only at a door; `pushOut` takes where he stood before), a box that may
  be turned, a body's `ceiling` and `leave`; `within`, `ceilingAt` and `clear` (the line of sight, walls only, as
  before) moved here from `solids.js`; `bodyGrid`, cells of bodies that answer by the cells round a point;
  `addBody` for what is placed one by one; `topOf`; `?ghost` (nothing stops the walker, in every world) and
  `showBodies` for `?bounds` (the bodies round the camera as lines, in every world). A provider may say `rooms`
  (it can have walls and ceilings): the line of sight, the way in and the room overhead, asked every frame, ask only
  those.
- `src/world/solids.js` is only the walker's step now, on `pushOut` alone: the bodies round the whole step asked once
  (they were asked up to eighteen times a step), the step taken in parts of at most 25 cm, going round as before.
- Every placer registers its bodies, each from what is measured of the thing and its kind's rule
  (`assets/kinds.js`: `solid` rules made into shapes by `shapesOf`):
  - `tree: { trunk: true }` the trunk where a walker meets it, as a cylinder to 3 m (the tree kit's measure);
  - `shrub: { leaves: true }` its leaves as a dome or a column, passed through (brushed through at the edge, led
    round the middle where they stand over the knee); what lies lower is stepped over, so the litter stops no one;
  - `rock: { round: true }` its round, 0.7 of its outline as before, up to its top (the rock kit's measure);
  - `default: { box: true }`, `grass: false`, and an asset's own `solid` block wins (the tent, the fire pit).
  - placed assets (`src/world/place.js`) through `bodyOfAsset` (`assets/index.js`) into the placed grid;
  - the rocks (`src/world/rocksolid.js`) as a provider, by the same cells as before, each its family's body
    (`assets/kit/rock.js` `boundsOf`, `collidersOf`);
  - the plants (`src/scatter/trees.js`): every stand packs what stands round the walker (24 m, every kind and size,
    no view culling) with its own `plantIn`, read back each time it is packed anew (2 m on), into a grid of bodies,
    each its family's (`assets/kit/plant.js` `boundsOf`, `collidersOf`). A stand none of whose plants can stop a
    walker (the litter) packs none. The shadow's stand-in is read back only for what it was also for: which plants'
    finest meshes to ask for. The packings are compiled aside (`compileComputeAsync`) and pack from when they are
    ready: compiled before the first frame, as the drawn tiers are, they made the start about 3 s longer on
    SwiftShader (45.7 against 42.7 s, one run each); compiled aside, 43.2 against 42.7.
  - the stress stand as it was (its own `?bounds` and `?ghost` wiring gone: the engine does both).
- The rig (`camera/rig.js`, `src/camera/rig.js`): whether the point is a walker on the ground is a band's own
  number now (`walk`: the eye and the street bands), not `h < 4`. So in the follow view (up to about 14 m, where the
  town band takes over) what is solid stops him, and ground too steep to walk up, as at his eyes. `controls.point`
  says where the walker stands.
- Where the plants are packed: round where bodies are asked for (the walker's step tells the engine, `want`), not
  round the camera: in the follow view the camera hangs 15 to 25 m behind him. `?bounds` draws round him too.
- `src/world/trunks.js` is gone.

**What else of the stress test the normal world did not have** (looked for in `src/scatter/stress.js` and 0008)

- Its bodies provider, and through it the engine itself: now every placer's (above).
- `?bounds` (the bodies drawn round the camera) and `?ghost` (the walker through everything; what he is inside draws
  back from his eye: the drawer's `ghost`): both were the stand's own; now the engine's, in every world.
- The rest is the stand's by design and stays there: its lattice of plots, its herds and their lanes, the ways it lays
  (the normal world lays none), its census. The drawer, the heap, the ladder of levels and the streaming of the finest
  meshes had already been lifted out of it into the world's rocks and plants (`da3e69f`, `37515d7`).

**Different from the definition**

- The checks run in headless Chromium on SwiftShader, which cannot show a WebGPU canvas: the harness gives the
  game's canvas a stand-in context (an ordinary texture, never shown) and holds each frame until the GPU has done the
  one before (without that no read-back ever came back). For the walks the picture itself is not drawn (SwiftShader
  needs seconds for it); everything else of a frame is the game's own.

## Propose

**Delivered:** one collision engine for every world (`src/world/bodies.js`), every placer registering its bodies by
cells from what is measured of the thing and its kind's rule; the follow view stopping the walker; `?bounds` and
`?ghost` in every world. On the branch `fix/generic-collision-all-worlds`: draft pull request
[#9](https://github.com/MaiaCityCoop/theOS/pull/9) against main.

**How it was checked:** headless Chromium (Playwright) with WebGPU on SwiftShader, the game's own dev server; the
same runs on main's code (a second checkout, port 5174) and on this branch (5173). The walker is put 3 m before a
thing and W is held until he has gone 6 m or stands still; his path is recorded frame by frame. "Closest" is how near
his middle came to the thing's middle (trees, shrubs, rocks: the drawn foot; the tent: its middle; the seat: its post).

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | Trees, eye level: main 0.34 / 0.59 / 0.63 / 0.54 m, this branch 0.35 / 0.59 / 0.63 / 0.54 m (a young 6 m tree, then 14, 17 and 12 m stone pines); he is held off the trunk and goes round it, as on main. Measured to the trunk's own axis, his middle comes to its radius and his 0.3 m exactly (0.411 / 0.612 / 0.684 / 0.574 m) and no nearer. Follow view at 8 m: main let him straight through all three (his line never bent: 0.26 / 0.52 / 0.33 m), this branch turns him round them (0.78 / 0.68 / 0.54 m); at 12 m: 1.03 / 0.68 / 0.56 m (the final code: 1.59 / 0.75 / 0.54 m) |
| 2 | passed | Rocks of 1.41 and 1.33 m: held at 0.80 and 0.77 m, the same as main |
| 3 | passed | The tent from behind: held at 2.75 m from its middle (its wall 2.45 m, he 0.3); through its door: in, round its pole at 0.35 m (main 0.34); a fire-pit seat: 0.54 m; all as on main. A ray from 9 m behind the tent meets its wall at 6.55 m |
| 4 | passed | Two shrubs of 3.5 m: main walked straight through their middles (0.01 m), this branch leads him round them (0.86 and 1.81 m) |
| 5 | passed | `/?stress` loads and draws (70 s on SwiftShader, main 68 s), no console errors. Three walks of 4 s of game time into its thicket: main made good 11.6 / 7.4 / 12.3 m of a free 13.7 to 14.1, this branch 6.9 / 7.4 / 12.5 m; with `?ghost` 12.9 / 12.8 / 13.0 m, straight. The step alone, at 60 frames a second in the same thicket: the same paths on main and on this branch to the centimetre (6.86 / 0.66 / 12.29 m), the same cost (1.8 to 3.2 ms a step on both). At SwiftShader's 11 a second main's single long steps hop through gaps the walker cannot pass at 60 (11.6 m against 6.8); this branch's steps, in parts, stay with the 60 a second walk |
| 6 | passed | The forest, about 250 frames walking 30 m, the picture not drawn, the final code: the walker's step 0.25 ms a frame on average (p95 0.5), main 0.22 (p95 0.4), though it now meets 55 bodies round him where main met only trunks and rocks; the scatter's choosing and packing 2.95 ms (p95 10.7), main 3.22 (p95 13.1); a frame 69 ms (p50 34), main 85 (p50 35); the start 43.2 s, main 42.7, its marks the same to half a second. (A first round, with the plants' packings compiled before the first frame: the start 45.7 s against 42.7; so they are compiled aside now.) The stress world, 200 frames: the step 4.0 ms (main 4.5), p50 0.7 (main 1.7), p95 15.1 (main 21.4), one frame at 118 (main's most 52); the scatter 10.4 ms (main 9.3); a frame 572 ms (main 603). SwiftShader's frames are the GPU's, emulated: these say only that nothing new costs a frame |
| 7 | passed | Every provider answers by cells: the placed grid and the plants' grids (`bodyGrid`), the rocks by their hash's cells, the stress stand by its lattice; nothing walks a list of all. The step asks once a step (main: up to eighteen times) |

**Known gaps**

- Seen only on SwiftShader in headless Chromium, never in Samuel's Safari nor on a real GPU; frame times there say
  little about a Mac's. Whether the plants' read-back comes back in Safari is not seen here (the old trunks hung on
  the same kind of read-back).
- A placed asset's own `solid` block gives no heights: its walls, posts and boxes are as tall as the asset (the
  tent's bed and chests show as columns through its roof with `?bounds`; for walking it is as before).
- The library's Body row still shows a placed asset's own block, not the scattered kinds' bodies (0025 has the
  library).
- No story folder spawned: Samuel's own words for his lines in a story are not in this session.

## Story

## Archived

---

## Todo

- [x] The engine: walls, doors, ceilings, a line of sight, grids, `?ghost`, `?bounds`
- [x] Placed assets in a grid
- [x] Rocks as bodies from their measured shape
- [x] Plants as bodies: a packing round the walker for every stand, read back; trunks, leaves
- [x] The walker's step on the engine alone; the old paths gone
- [x] The follow view stops the walker (`walk` a band's number)
- [x] Checks 1 to 7, before and after
- [x] Push, draft PR
- [ ] Samuel: walk into the forest in his own Safari, at his eyes and in the follow view; accept or send back
- [ ] The tent's own block could say how high its bed and chests are (they are as tall as the tent now)

## Changelog

### 2026-11-15

- **Asked:** Samuel can still walk through trees in the normal world; was the stress test's collision fully generic,
  and was it ported? Make one generic collision for every world, scaled to the stress world, shown in Chromium.
- **Delivered:** the intent, the finding (see Define).
- **Good:** the engine and the description from 0008 are a sound base: the work is to make every placer use them.
- **Broke / not there yet:** headless Chromium could not show a WebGPU canvas here (its swap chain's shared image
  fails on SwiftShader and the device is lost); the checks' browser draws into a stand-in texture instead.

### 2026-11-15, built

- **Asked:** the same request carried out: one generic collision for all worlds, checked in Chromium.
- **Delivered:** the one engine for every world, every placer registering its bodies by cells, the kinds' rules
  made from what is measured (trunks, leaves, rounds, walls with doors), the follow view stopping the walker,
  `?bounds` and `?ghost` everywhere; the checks run before (on main) and after (see Propose).
- **Good:** at eye level the trunks, rocks, the tent and the fire pit hold the walker where main did, to the
  centimetre; the shrubs, walked straight through on main, now lead him round; in the follow view, where main let
  him through every tree, the trees turn him aside; the stress world loads and its thicket holds him, `?ghost` lets
  him through.
- **Broke / not there yet:** found on the way: no read-back came back in the test browser until its frames were
  held to what the GPU managed (the old trunks too); the plants' packing was first made round the camera, which in
  the follow view hangs 15 to 25 m behind the walker: now round the walker; compiled before the first frame the
  packings cost the start about 3 s on SwiftShader: now compiled aside. Main moved meanwhile (0025's library, 0028's
  phone edges, four of the same files): merged without a conflict, the merged game seen again (83 bodies in the
  forest, no console errors). Not seen in Samuel's Safari.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `3e06bdf` | One collision for every world: the engine, every placer's bodies, the kinds' rules, the follow view, `?bounds` and `?ghost` everywhere; `trunks.js` gone |
