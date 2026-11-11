---
id: "0008"
title: The game on WebGPU
state: idea              # idea | define | build | propose | story | archived
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

_Filled when the idea is taken up._

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel: take the idea up

## Changelog

### 2026-11-12

- **Asked:** shouldn't the whole system be WebGPU native; then: write it as an intent.
- **Delivered:** this intent, at idea.
- **Good:** —
- **Broke / not there yet:** nothing built.

## Trail

| When | Commit | What |
| --- | --- | --- |
