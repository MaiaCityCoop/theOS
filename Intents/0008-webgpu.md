---
id: "0008"
title: The game on WebGPU
state: define            # idea | define | build | propose | story | archived
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

## Propose

## Story

## Archived

---

## Todo

- [x] Samuel: take the idea up
- [ ] Samuel: approve or change the definition
- [ ] Step 1: the spike (renderer, shared node code, terrain), measured
- [ ] Step 2: every material ported, no GLSL left
- [ ] Step 3: ground texture and scatter as compute; collision from the card
- [ ] Step 4: post pass, films, library, lenses checked

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

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `859753c` | The intent opened, at idea |
