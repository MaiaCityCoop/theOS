---
id: "0008"
title: The game on WebGPU
state: build             # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0008 · The game on WebGPU

## Idea

Samuel's words (typos tidied): "Also, shouldn't our whole system be purely WebGPU native?" Then: "Yes, write it."

Today the game draws with WebGL 2 (three.js 0.187, `WebGLRenderer`), its look written in GLSL in ten files of its own
shaders: the terrain and the water, the grass, the rocks, the assets and their cards, the materials' baking and
pictures, the ground texture, the sky, the shadows and the light they all share (`LIGHT_GLSL`, `WORLD_GLSL`,
`DETAIL_GLSL`).

What WebGPU would give, above all to intent 0002 (thousands of assets, out to 10 km):

- **Compute on the graphics card.** The card could place, cull and sort the scattered things itself (rocks, plants,
  trees), choose each one's level by its size on screen, and draw them in indirect, instanced batches: no work per
  thing on the CPU. The land's tiles, their merging far away and the folding into the ground (0002, stages 4 and 5)
  are made for this.
- **One placement for everything.** Collision (0003) could read the very placement the card draws, instead of the
  CPU's copy of the rocks' hash, which cannot see paths.
- **Cheaper, richer light.** Shadows (more maps, softer edges), the height fog, the water's flow and reflections
  (0006), clouds and weather later: storage buffers and compute where a WebGL pass is a workaround.

What it costs:

- Every shader rewritten in three.js's node language (TSL), which writes WGSL for WebGPU and GLSL for WebGL from one
  source; the shared light, land and detail code first, then each material.
- Support: Chrome and Edge have WebGPU; Safari from version 26; Firefox on some systems only. three.js's
  `WebGPURenderer` falls back to WebGL 2 from the same node shaders, so no browser loses the game; compute-only parts
  need a WebGL path or stay off there.
- A long, careful move: done in steps, each measured, the game working after every one.

A first step, for the definition: a spike on one material (the terrain, or the rocks with their placement on the card)
under `WebGPURenderer`, with the frame time and draw time measured against today's, to see the real gain before
porting the rest.

## Define

Samuel took it up on 2026-11-12: "please define, spec it: the WebGPU with the latest three.js". three.js is at its
latest today, 0.187.0 (installed and the registry's newest, checked 2026-11-12).

**The shape of it**

- **Latest three.js, kept so.** The game follows three.js's releases: each new one is taken within its month, the game
  checked on it (the checks below), and the version pinned exactly in `TheGame/package.json` so a build is the same
  everywhere. WebGPU code imports from `three/webgpu` and `three/tsl`.
- **One renderer.** `WebGPURenderer` replaces `WebGLRenderer`. Where a browser has no WebGPU it runs the same node
  shaders on WebGL 2 (three.js's own fallback); the game says which it runs on in its readout.
- **Shaders as nodes, written once.** Every shader of the game becomes TSL (three.js's node language), from which three
  writes WGSL for WebGPU and GLSL for the fallback. The shared code first, as node functions every material calls:
  the light and the shading contract (sun, sky, haze, weather, clouds, shadows, the hand-over between levels), the land
  (heights, river, masks, biomes), the detail measure. Then each material on them: terrain, water, grass, rocks,
  assets and their cards, the material bake and pictures, the sky dome, the post pass (depth of field).
- **Compute where it pays.** The ground texture (heights, density, tint round the camera) and the scatter's placement
  move into compute passes: the card places the rocks and the grass, culls them, picks each one's level by its size on
  screen, and draws them with indirect, instanced calls. Its placement buffer is what collision (intent 0003) reads,
  for the cells round the walker, in place of the CPU's copy of the rocks' hash. The shadow map renders with the same
  culling.
- **Nothing looks different.** The port changes how it is drawn, not what is drawn: the same pictures at the same
  views, as fast or faster. New visual work waits until the port is done.
- **Steps, the game working after each.** (1) The spike: `WebGPURenderer` with the shared node code and the terrain
  only, the rest still drawn as today where it can be, measured. (2) Every material ported; the WebGL path's own code
  removed. (3) The ground texture and the scatter as compute; collision from its buffer. (4) Post pass, films, library,
  lenses, dashboard checked on it.

**Deliverables**

1. three.js pinned at its latest (0.187.0 today) and a note in the README on taking each new release.
2. `WebGPURenderer` with the WebGL 2 fallback; the readout says which.
3. The shared code as TSL node functions; every material on them; no GLSL left in the game.
4. The ground texture and the scatter (rocks, grass) as compute with indirect draws; collision reading the card's
   placement.
5. Shadows, sky, water, cards, post pass and the library's pictures on the new renderer.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Same pictures | stills at eight fixed views (the tent at eye level, a river bend at 26 m, town at 40 m, 2.5 km, the library's tent, a material, a biome, story 01's first title shot), WebGL today against WebGPU after: each pixel's difference under 3 % on average, nothing missing |
| 2 | As fast or faster | frame time at the same views (and the CPU's time per frame) on this Mac: WebGPU at or under today's; the scatter's CPU time near zero after step 3 |
| 3 | Everywhere | runs in Chrome and Safari 26 on WebGPU and in a browser without it on the WebGL 2 fallback, with no console errors |
| 4 | Collision from the card | the walker stopped by a rock the card draws, and not by one it does not (on a path): 50 rocks round the tent checked |
| 5 | No GLSL left | a search finds no GLSL strings and no `ShaderMaterial` in `TheGame/` |
| 6 | Latest three.js | the installed version equals the registry's latest on the day the step is checked |

**Out of scope**

- New looks or features during the port (they resume after it).
- Ray tracing, meshlets or other techniques WebGPU may open later.
- The dashboard (OS/), which draws no 3D.

## Build

Samuel approved the definition on 2026-11-12 ("Approve, start step 1").

**Step 1, the spike** (2026-11-12): the terrain alone on three.js's `WebGPURenderer`, the game untouched.

- `src/gpu/land.tsl.js`: the land in TSL, constant for constant with `land.glsl.js`: the integer hash, the value noise
  and its gradient, the river by its bends (width, bank side, carve, bank), the heights with their octaves let go by
  distance and the pads under what stands, and the masks (arid, paths, bare, edges, bank, cut bank, bar, tufts,
  outcrops) and the grass's colour, from the biomes' own numbers. Not ported yet: the library's sandbox.
- `src/gpu/terrain.tsl.js`: the light (sun, sky, height fog, weather, exposure; shadows not yet) and the terrain as one
  node material: the same grid and morphing in the vertex stage, the same materials, the same two-take sampling and
  height blending, the same branches that skip a texture where it is not laid (`If`).
- `spike.html`: the terrain alone, the materials baked as the game bakes them and handed over, the quadtree as the game
  picks it, the camera stood by the game's rig (`poseAt`), the light of noon from the game's sky; `?webgl` forces the
  WebGL 2 fallback. It shows which backend it runs on.
- It compiled and drew on WebGPU at the first try, and on the WebGL 2 fallback from the same nodes.

**Measured** (1400×800, pixel ratio 1, this Mac, 60 frames drawn back to back at each view, then waited for the card
to finish: WebGPU `onSubmittedWorkDone`, WebGL a one-pixel read; the terrain only, the same nodes):

| View | WebGL today (GLSL) | WebGPU (TSL) | WebGL 2 fallback (TSL) |
| --- | --- | --- | --- |
| tent, eye level (406 nodes) | 6.57 ms | 7.30 ms | 8.63 ms |
| river bend, 26 m (182) | 9.50 ms | 6.59 ms | 7.82 ms |
| town, 40 m (156) | 8.05 ms | 6.00 ms | 6.65 ms |
| skyline, 2.5 km (44) | 4.45 ms | 2.77 ms | 2.88 ms |

WebGPU is faster at three of the four views (by 25 to 38 %) and 11 % slower at eye level by the tent; the fallback is
close to today's or better except at eye level. Not like for like in two ways: today's terrain still carries the
sandbox, the library's stage and the shadow map's branch (off for the timing), the spike does not; and the pictures are
not yet compared pixel for pixel (check 1 is for step 2). The near view's cost is the place to look first.

**Step 2, first slice** (`src/gpu/water.tsl.js`, `sky.tsl.js`, `assets.tsl.js`): the river's water, the sky dome with
the light of an hour, and the placed assets with their levels and the dithered hand-over, all as node materials; the
spike page now walks with the game's own camera (`src/camera/rig.js`, the joystick on touch) from the tent. Measured as
above, now with water, sky and tent drawn:

| View | Terrain only (step 1) | + water, sky, tent |
| --- | --- | --- |
| tent, eye level | 7.30 ms | 7.37 ms |
| river bend, 26 m | 6.59 ms | 7.48 ms |
| town, 40 m | 6.00 ms | 6.20 ms |
| skyline, 2.5 km | 2.77 ms | 3.10 ms |

**Step 2, second slice** (`src/gpu/scatter.tsl.js`): the ground pass under the camera, the scatter's tiers, the grass's
three rings and the stones and boulders at every level, as node materials; the patch list is a uniform array, the cell
an instance stands for comes from `instanceIndex`, a cell that holds nothing is sent off screen as today. Found on the
way: three's node reads turn a render target's rows the other way up (on WebGPU and on its WebGL 2 fallback), so the
ground pass writes them turned; without it the grass grew on the paths. Measured as above, now against today's whole
game at the same views (terrain, water, sky, tent, grass, rocks; shadows off on both, as the WebGPU page has none yet):

| View | WebGL today | WebGPU | WebGL 2 fallback |
| --- | --- | --- | --- |
| tent, eye level | 14.36 ms | 13.85 ms | 15.19 ms |
| river bend, 26 m | 18.05 ms | 12.79 ms | 15.59 ms |
| town, 40 m | 14.32 ms | 15.34 ms | 12.40 ms |
| skyline, 2.5 km | 5.37 ms | 2.70 ms | 3.08 ms |

The same patches are drawn on both (tier for tier); the picture by the tent matches today's by eye. The town view is
7 % slower on WebGPU: the place to look next.

**Step 2, done: the switch.** The game, the library, the lenses and the films run on `WebGPURenderer` (WebGL 2 where
WebGPU is missing, `?webgl` forces it). No hand-written shader text is left: every material is node code. On the way the
code was put in order, one home per thing:

- `src/core/uniforms.js`: the shared uniforms are node uniforms; code that steers the world writes `U.x.value` as before.
- `src/world/light.js`: the shading contract (sun, sky light, haze, weather, shadows, the hand-over between levels).
- `src/world/land.nodes.js`: the land on the GPU, beside `land.js` on the CPU, with the library's sandbox in it.
- `materials/*.js` paint in node code; `src/materials/bake.js` bakes all of them into one texture array (two bindings
  whatever the number of materials), `paint.js` the tiling noises.
- `src/terrain/material.js`, `water.js`; `src/scatter/tier.js`, `ground.js`, `grass.js`, `rocks.js`;
  `src/world/place.js` (the asset material and `place()`, out of the asset registry); `src/detail/impostor.js`;
  `src/world/shadow.js` (two maps taking turns, so none is read while it is drawn); `src/camera/post.js`;
  `src/world/sky.js`; `src/materials/preview.js`.
- Gone: every `*.glsl.js`, `src/world.js`, the spike page and `src/gpu/`.

Found on the way: three's node reads turn a render target's rows the other way up, and its viewport counts them from
the top; the ground pass, the bake, the far cards and the shadow map write and read accordingly.

Timed at the four views (1400×800, pixel ratio 1, shadows off / on), the switched game: tent 13.3 / 14.9 ms, river
bend 12.5 / 14.4, town 12.0 / 11.8, skyline 3.2 / 3.2. The step-1 table's "today" column was taken at the game's own
pixel ratio, higher than 1: not like for like.

Next (not in this intent's steps yet): biomes as plug-ins (each biome's file brings its own "where" as node code, the
terrain loops over whatever is registered), the texture array as a cache that bakes a material when it is first needed
(for thousands of them), the wind read by the grass, and a quality pass on every asset, texture, biome, the sun, the
shadows and the grass.

## Propose

## Story

## Archived

---

## Todo

- [x] Samuel: take the idea up
- [ ] Samuel: approve or change the definition
- [x] Step 1: the spike (renderer, shared node code, terrain), measured
- [x] Step 2: every material ported, no GLSL left
- [ ] Step 3: ground texture and scatter as compute; collision from the card
- [ ] Step 4: post pass, films, library, lenses checked
- [ ] Trees: a walker cannot pass them (solid); more species

## Changelog

### 2026-11-12

- **Asked:** shouldn't the whole system be WebGPU native; then: write it as an intent.
- **Delivered:** this intent, at idea.
- **Good:** —
- **Broke / not there yet:** nothing built.

### 2026-11-12, defined

- **Asked:** "you should have the latest three.js update as well"; then: define, spec it, the WebGPU with the latest
  three.js.
- **Delivered:** the definition above. Found: three.js is already at its latest, 0.187.0 (installed and on the
  registry), so no update was due.
- **Good:** —
- **Broke / not there yet:** nothing built; the definition waits for Samuel's approval.

### 2026-11-12, step 1

- **Asked:** approve, start step 1; on the way: does this improve the whole architecture, performance and the future
  for millions of different assets; and the grass, more realistic in the distance and its levels too.
- **Delivered:** the land and the terrain in TSL; the spike page on WebGPURenderer with its WebGL 2 fallback; the
  terrain timed at four views on WebGPU, on the fallback and on today's WebGL.
- **Good:** it ran on WebGPU at the first try; faster at three views of four.
- **Broke / not there yet:** slower at eye level by the tent; pictures not compared yet; no sandbox, stage or shadow in
  the TSL terrain; the rest of the game still on WebGL.

### 2026-11-12, step 2 (first slice)

- **Asked:** "Yes, step 2".
- **Delivered:** water, sky dome with the hour's light, the tent with its levels, and the walking camera on the WebGPU
  page; timed at the four views.
- **Good:** no errors at first run; the water's depth, banks and gravel read as in the game; the added cost is under 1 ms.
- **Broke / not there yet:** not yet compared pixel for pixel with the WebGL game; grass, rocks, impostors, shadows,
  post, clock still to port.

### 2026-11-12, step 2 (grass and rocks)

- **Asked:** "Yes, grass and rocks"; and: update the GitHub remote at the end.
- **Delivered:** the ground pass, the grass and the rocks on WebGPU; timed against today's whole game.
- **Good:** faster than today at three views of four (by 4 to 50 %); the picture matches today's by the tent.
- **Broke / not there yet:** the town view is 7 % slower; impostor cards, shadows, post, clock, sandbox and stage
  still to port; the remote's new address not set (the permission check stopped it).

### 2026-11-12, step 2 (the switch)

- **Asked:** "please finish all porting"; on the way: clean up, split, deduplicate, remove legacy code, one home per
  thing, made to take thousands of user-made assets, textures and biomes, every asset plugging into the world's
  light, shadows, snow and wind; and improve each asset, texture and biome after.
- **Delivered:** the whole game on WebGPU with its WebGL 2 fallback, no GLSL left, the code in order (above); the game,
  the library (assets, biomes with the river's sandbox, materials, far cards, pictures), the lenses and the films checked.
- **Good:** the picture as before; as fast or faster; any number of materials costs two bindings.
- **Broke / not there yet:** biomes still known to the terrain by name; materials all baked at start; the wind not
  read yet; the quality pass not started.

### 2026-11-12, speed and quality (overnight)

- **Asked:** film playback choppy, the library's orbit too; everything at 60 fps with no stutter, at the highest detail;
  the most efficient way to keep correct shadows; one weather panel on every viewer; films set the weather per shot; a
  harder storm; quality up on every biome, texture and asset.
- **Found:** the cost was not the shadows (about 2 ms: the map 1.7, its lookups 0.3) but work done for nothing: every
  grass blade and rock repeated its cell's work in every vertex, for every cell of a patch, empty or not; the ground pass
  (6.6 ms) drawn every 8 m and twice; the pixel ratio starting at 1.5 and held there by a film. Timings taken in a hidden
  pane are unreliable (wall clock and timestamps both); the game's own frame time, live, was the measure that held.
- **Delivered:** on WebGPU, grass and rocks packed by a compute pass (once per cell, only what stands) and drawn
  indirect (the WebGL 2 fallback keeps the per-vertex path, from the same function); casters skip their light in the
  shadow pass; stones cast no shadow; the ground pass one pass with two outputs, drawn every 16 m, read back only near
  the ground; the terrain's biome shares per vertex; the pixel ratio from 1, rising with room. Light: sky light from
  above and the ground's bounce, sun-lit air, 12-tap soft shadows, all through one finish(). Far land: slow lush and pale
  fields. Assets: contact shading, mottle, soft and thin surfaces (the tent glows backlit). One weather panel
  (src/ui/weather.js) at the top centre on the walk, the library and the lenses; a film shot's hour and wind (one value or
  [from, to]); a harder storm; the library's orbit by the clock.
- **Good:** 60 fps live at the walk's views; the picture as before where nothing was meant to change.
- **Broke / not there yet:** not measured on Samuel's screen during a film (the slow-frame log will show it); the
  materials' own recipes not yet reworked; impostors and the films' depth of field not packed by compute.

### 2026-11-12, materials, Safari, snow, clouds (morning)

- **Asked:** the material recipes reworked; the timeline's playhead still stuck (in Safari); a better loading screen for
  every viewer; the day four times slower; the gravel bar like the Isar's; the river's white dots unreal; more depth on
  the ground; Safari at 60 fps; snow in the weather panel at 2, 5, 10 and 25 cm, round the tent too, and at 60 fps; every
  asset's snow from its own config; realistic clouds with their shadows on the ground, their tile's repeat not seen.
- **Found:** Safari's message source is not the frame's contentWindow, nor its frameElement: the editor dropped every
  time the film sent. The terrain's vertex shader was 918 KB: every reuse of a value wrote its whole expression out
  again (the river 27 times a vertex); Chrome's compiler folds that, Safari's does not (36.7 → 20 ms there). A TSL
  select works out both its sides, so snow and cloud noise cost even with none; per-pixel value noise on grass and
  stones tipped WebKit over 16.7 ms. The tent's faces wind inwards: lit from below, it took no snow. Timings in WebKit
  must be taken with the Chrome pane idle (both share the GPU).
- **Delivered:** richer materials (curled mud plates, bent thatch, bedded rock with lichen, packed path, wind ripples,
  pebbles with veins) and new painter's helpers (ridged octaves, a tiling warp, warped cracks, pebbles with their contact
  shade); tools/sheet.js to see the baked tiles side by side. River gravel (pale rounded limestone) for the gravel bars.
  Crevice shade from a material's height up close. The river without specks, foam only at its shallow edge. The film
  tags its messages with its channel (ch=edit): the playhead runs in Safari. One loading veil (brand.css, from the first
  paint, stepped by src/ui/loading.js), not stalled by a hidden page. The day in four minutes. The terrain's vertex stage
  one Fn of variables (245 KB, the river worked out three times; its neighbours' river cheaper, riverNear); the scatter's
  compute only when something it reads changed. Snow (uSnow): one rule for every surface (snowCover), the ground lifted
  under it, drifts, grass bowed, pale and snow-laden, none under a roof; per asset from kinds.js (snow { clumps }) and
  its own file (roofed), the same on its meshes, far card and scattered copies. Clouds (world/clouds.js): a cumulus
  layer drifting with the wind, its field a baked tile (materials/clouds.js) read twice, turned and pushed by the tile
  itself at scales that are not whole tiles (no repeat), lit grey where deep with bright edges; its shadow drawn once a
  frame into a 256² map over 6 km (src/world/cloudmap.js) that every surface reads with one fetch. Snow and clouds in
  the weather panel and per film shot (`snow`, `clouds`). Snow and cloud work only runs while there is any.
- **Good:** in WebKit (Safari's engine, 1000×560) 16.7 ms a frame standing, walking and running: clear, scattered and
  overcast, with 10 and 25 cm of snow. The tent is lit right now, snow or not.
- **Broke / not there yet:** not checked in Samuel's own Safari nor on a full Retina window; cloud shadows read faint
  from high up over the pale dry land; low evening clouds stretch overhead; no falling snow; the ground's stones are
  still flat texture up close (parallax set aside, "good enough").

### 2026-11-12, the open points (late morning)

- **Asked:** clouds as a weather slider too; how the clouds' repeat was broken up; and solve the open points.
- **Found:** the Clouds row was already there (Time, Wind, Snow, Clouds). The cloud shadows were right but weak from
  high up (haze, pale dry land); a cloud also hides part of the sky's light. The evening's streaks went with the old
  field. A plain geometry with an instanceCount draws one instance on WebGPU: an instanced one is needed. TSL's mod
  keeps the sign. The lenses page holds a still: its picture does not change with the weather until the camera moves.
- **Delivered:** cloud shadows deeper (0.9) and the sky's light under a cloud dimmer on the ground; cloud edges softer
  with fewer flecks. Falling snow (world/snowfall.js, src/world/snowfall.js): up to 40 000 flakes in an 18 m box of air
  that follows the camera, falling, carried by the wind, fluttering, never smaller than a pixel or two, thickening the
  air; its own Snowfall row in the weather panel and `snowfall` per film shot. tools/shots.js for stills.
- **Good:** WebKit 1000×560 at 16.7 ms a frame with heavy snowfall, 25 cm of snow and overcast; clear to scattered too.
- **Broke / not there yet:** not checked in Samuel's own Safari; the far land's blocky river edges and the far grass's
  repeat are still there (the land map, next); no forest yet.

### 2026-11-12, the far land and a pine forest (midday)

- **Asked:** all three: the far river's blocky edges, the far grass's repeating pattern, and a Mediterranean pine
  forest as a new asset and biome, with forest patches that stay fast.
- **Found:** two things made the blocks. Far off a terrain cell is wider than the river, so bank ground between its
  corners stood over the water; and a river biome's share, blended per vertex across a 30 m cell, gave the bank a
  sawtooth edge. The pale blotches from high up were the grass's colour read from the land-noise tile every 45 m (a
  single take showing in most places), not the grass texture. A placed asset's sway read billow and flap only: a tree
  without them drew nothing. The snowfall's light per pixel tipped WebKit over once the forest was there.
- **Delivered:** far water pulled towards the eye by up to half a cell (its outline the river's own distance); the
  river's biomes worked out per pixel where their corners hold any (shareOf); the grass's colour, the far grass
  texture and the canopy each two takes, turned and at scales with no whole ratio, always blended; tufts and bare
  patches pushed off their value-noise grid. The stone pine (assets/stonepine.js: a leaning trunk forking into limbs
  under a broad, flat crown of needle clumps; three levels), the tree kind (kinds.js: lean, sway, snow clumps, shadow),
  the trees' engine (src/scatter/trees.js: compute-packed like the rocks, a tier per level, groves and glades, no tree
  in a place's clearing or on the stage, the far level casting no shadow), pine needles (materials/pineneedles.js),
  the pine forest biome (biomes/pineforest.js) with its `canopy`: past the last tree level its land takes the crowns'
  colour, so a forest to the horizon costs nothing. The library stages a tree as a built asset; a placed asset's sway
  takes `sway` too. Flakes lit once per flake, never a blot over the lens.
- **Good:** WebKit 1000×560 at 16.7 ms a frame with the forest, clear and in the heaviest snowfall with 25 cm of snow
  and overcast; the river's edge from above runs smooth; the meadow no longer shows a grid.
- **Broke / not there yet:** not checked in Samuel's own Safari; a walker passes through trees (no solid yet); the
  crowns are low-poly up close; one tree species so far.

### 2026-11-12, one realistic tree (afternoon)

- **Asked:** a real tree, with branches and needles and proper levels of detail, not blocks: ten times the realism; this
  one pine first, made perfect, one species.
- **Found:** a crown of cut-out cards turns off the GPU's early depth test and is drawn again for the shadow map; the
  middle level, drawn for hundreds of trees, cost most. The first seconds after loading are slower while the trees'
  pipelines compile; timed after them, WebKit holds 60 fps.
- **Delivered:** the stone pine built as a mesh per level (assets/stonepine.js): a flared, bending trunk, shed-limb
  stubs, three limbs forking into branches and twigs (tubes carried along their curves without twisting, wrapped in
  bark a whole number of times round), and at the twigs' ends crossed cards of needle brushes, about 1600 of them near,
  a dense flat-topped dome; light reaching into the crown baked per vertex (ao). Pine bark (materials/pinebark.js: tall
  reddish plates, grey fissures of changing width, flaking layers) and the pine tuft (materials/pinetuft.js: a twig with
  eight brushes of paired needles, its height the cut-out). The trees' shader: bark on the wood, needles cut out (in the
  shadow map too: a dappled shadow), lit through from behind, rounded over the crown's dome, brushes fluttering with the
  wind; only the texture its part needs is read. Levels: near to about 40 m (11 000 triangles), middle to about 180 m
  (fewer, larger brushes), far to about a kilometre (a few big ones), then the canopy colour; only the near ones cast.
  geometryOf takes a mesh; the library stages and pictures a tree in its own material (treeSample).
- **Good:** WebKit 1000×560 at 16.7 ms a frame among the pines, standing, walking, running, and in snow and snowfall.
- **Broke / not there yet:** a few slow seconds after loading while the trees compile; a card's flat side shows at a
  grazing angle; not checked in Samuel's own Safari; a walker passes through trunks.

### 2026-11-12, the stone pine after the photos (afternoon)

- **Asked:** photos of Pinus pinea as the measure: make this one tree like them.
- **Found:** against the photos the tree had a short, thick trunk, three heavy limbs and a flat plate of a crown; the
  real one has a long, slender trunk bending in an S, six thin limbs fanning like an umbrella's ribs, and a dome of
  rounded puffs with a flat underside, in a full green. A brush painted as one oval reads as a leaf from afar. Stored
  unindexed, the tree's corners were worked out once per triangle: the frame was bound by its vertices, not its pixels
  (13.7 ms at a quarter of the pixels).
- **Delivered:** the pine rebuilt to the photos: an S-bending trunk bare to over half its height, two stems forking into
  six long, thin limbs bowed upward, branches and twigs, and the needles in rounded puffs over a flattened dome with a
  ring of them making its flat underside; each card's normal its puff's and the dome's (a puff lit as a ball); a deep,
  lively green. The tuft repainted as a sprig: five twigs fanning from its foot, each with brushes of paired needles.
  Middle and far levels fuller with fewer, larger cards; their cut lowered with distance. The mesh indexed (15 500
  vertices near instead of 29 800); the trees' shadow lookup one tap.
- **Good:** in the library and from across the river it reads as the photos' tree; WebKit 1000×560 at 16.7 ms a frame,
  also with 25 cm of snow, overcast and heavy snowfall (the first run after a change still compiles).
- **Broke / not there yet:** the shadow pass with the trees is about 6 ms; under the crowns the cards' undersides can show;
  not checked in Samuel's own Safari; a walker passes through trunks.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `859753c` | The intent opened, at idea |
| 2026-11-12 | `8ddd807` | Defined; three.js pinned at its latest, 0.187.0 |
| 2026-11-12 | `03bd30b` | Step 1: the spike, land and terrain in TSL, timed |
| 2026-11-12 | `12e6074` | Intent 0008: its trail |
| 2026-11-12 | `87e2915` | 0008 step 2: water, sky, placed assets and the walking camera on WebGPU |
| 2026-11-12 | `cc06d3b` | 0008 step 2: grass, rocks and the ground pass on WebGPU |
| 2026-11-12 | `9824e6d` | 0008 step 2: the whole game on WebGPU, no GLSL left, code in order |
| 2026-11-12 | `db5a891` | Wind: a breeze by default up to a storm, a dial under the clock |
| 2026-11-12 | `7acf204` | Wind moves the tent's canvas and drags the river's surface |
| 2026-11-12 | `a00e945` | Registry: every recipe by a stable uid, versioned by BLAKE3 |
| 2026-11-12 | `d48e7c2` | Biomes as plug-ins: each brings its own where-rule and layer |
| 2026-11-12 | `8962c87` | Library stage: its ground laid into the terrain, no dithered edge |
| 2026-11-12 | `0741dd0` | Biomes lose their role: rock bodies read the ground pass back |
| 2026-11-12 | `d09fdf0` | Even grass cover out to the last ring; helpers folded into one place each |
| 2026-11-12 | `aa577c6` | Speed: grass and rocks packed by compute, drawn indirect; shared light finish |
| 2026-11-12 | `1f8ac6a` | Ground pass: one pass with two outputs, drawn half as often |
| 2026-11-12 | `7597104` | One weather panel on every viewer; films set the weather per shot; a harder storm |
| 2026-11-12 | `ede32b6` | Terrain: biome shares worked out per vertex, not per pixel |
| 2026-11-12 | `a222803` | Far land: slow lush and pale fields in the grass's colour |
| 2026-11-12 | `687dd98` | Assets take the light better: contact shading, mottle, soft and thin surfaces |
| 2026-11-12 | `d8c1d3d` | Weather pill as tall as its neighbour; the night's work recorded in Intent 0008 |
| 2026-11-12 | `fdb50c0` | Materials, richer: curled mud plates, bent thatch, bedded rock, packed path, wind-rippled sand |
| 2026-11-12 | `34794f9` | Playhead in Safari, a loading veil for every viewer, river gravel, ground depth, calmer water, a slower day |
| 2026-11-12 | `4e8072e` | Safari at 60 fps: the terrain's vertex stage worked out once, the scatter packed only when something changed |
| 2026-11-12 | `6c64d11` | Snow: a depth slider in the weather panel, on every surface, per shot in films |
| 2026-11-12 | `86d5ad8` | Snow round the tent: on its roof in clumps, none under it, grass bowed and pale under deep snow |
| 2026-11-12 | `e6918d9` | Snow per asset from its config: kinds.js snow { clumps }, an asset's own roofed |
| 2026-11-12 | `338f9d6` | Clouds: one cumulus layer that drifts with the wind, in the sky and as shadows on all below |
| 2026-11-12 | `9ffe337` | Clouds without a repeat; their shadow from a map drawn once a frame; snow's pattern from the baked tile; this record |
| 2026-11-12 | `b9aabb0` | Deeper cloud shadows, softer clouds; falling snow with its own slider; tools/shots.js |
| 2026-11-12 | `832d280` | Smooth far river edges, no grid in the far meadow; the stone pine, its forest biome and the trees' engine |
| 2026-11-12 | `617d3e9` | The stone pine made real: branches, twigs, needle brushes, bark, three levels |
| 2026-11-12 | (this commit) | The stone pine after the photos: S-trunk, umbrella limbs, a dome of puffs; indexed |
