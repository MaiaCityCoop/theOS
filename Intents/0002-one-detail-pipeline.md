---
id: "0002"
title: One detail pipeline for every asset
state: define            # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-11
story:
---

# 0002 · One detail pipeline for every asset

## Idea

Samuel's words (typos tidied): "We want a fully general, abstracted solution: every asset we will have in future,
thousands of different assets, plants, bushes, houses, domes, furniture, so we need a fully general solution that helps
us zoom 2, 5, 10 km out and back in 100 % smoothly, with fully configurable, procedurally generated assets, biomes,
textures, end to end; extensible, unlimited." Also "later for moveables, NPCs, carts etc. too". Each asset keeps its
own detail settings next to it ("shouldn't each asset colocate its LOD configs?"). "Fully abstract, general and
universal; and ensure future lighting, fog, cloud shadows, sun, wind etc. are compatible too."

Today there are three separate answers to distance: the bell tent's hand-made levels (`THREE.LOD`), the rocks' distance
tiers in their shader (`src/scatter/rocks.js`), and the grass that becomes a carpet material far away. Each level only
cuts faces; every level runs the same shader. Nothing goes past about a kilometre, and levels pop.

## Define

One engine that every asset, material and biome goes through, and that reads its numbers only from their own files.
The engine holds no number for any particular asset.

**The shape of it**

- **Recipe in, levels out.** An asset file holds its procedural recipe (seed and a detail value in, a mesh out) and a
  `detail` block. The engine builds the chain: meshes at falling face budgets, then an **impostor** (the asset rendered
  from 8 to 16 angles into albedo, normal and depth, drawn as one card), then **folded into the ground** (only a colour
  and roughness on the terrain). Moving things stop at the impostor.
- **Chosen by size on screen.** A level begins at a pixel size, not a distance, so one rule serves a pebble and a dome
  and any lens from 28 to 180 mm. Distances are derived and shown, never written.
- **No pops.** Neighbouring levels cross over a short band with a dither; impostor to ground likewise.
- **Materials have levels.** Each material file declares near (three reads and relief), mid (one read, no relief) and
  far (its average colour). Every asset using it gets them.
- **Tiles to 10 km.** The land as a quadtree with smooth reshaping between levels; scattered things drawn in instanced
  batches per tile and level; far tiles merged into one draw. Tiles built in a worker on demand, cached by the hash of
  recipe and seed.
- **A budget.** The detail governor hands out a frame budget (triangles, pixels); the pixel thresholds scale with it.
- **Colocated settings, defaults by kind.** Each asset's `detail` block lives in its own file next to its recipe;
  kinds (rock, plant, building, furniture, character) carry defaults, so an asset writes only what differs. Biomes keep
  their density by distance in their file, materials their levels in theirs. The library's Detail tab shows that block.
- **One shading contract, for light that is still to come.** Every level of everything (mesh, impostor, folded ground)
  is lit live by the same shared functions: sun and sky, fog and haze, cloud shadows, shadows, and wind. Nothing bakes
  light into a level. Impostors store albedo, normal and depth so they are lit like meshes; wind is one shared vertex
  function whose strength each level carries (full near, its average far, none once folded); shadows come from a proxy
  level per asset; cloud shadows are a world-space map every level samples. Adding a new kind of light, a weather or a
  time of day changes those shared functions once and reaches every level of every asset.

**Deliverables**

1. The engine: selection by pixel size, the dithered cross-over, the `detail` block and the kind defaults, read from the
   asset files.
2. Impostors: baked per asset in a worker, cached by hash, lit live.
3. Material levels: near, mid and far shaders from each material's file.
4. The land and placement in tiles to 10 km, batched, with far tiles merged.
5. Folding into the ground: the far colour of every scattered asset in the terrain.
6. The shared shading contract: sun, sky, fog, haze, shadows, cloud shadows and wind as one set of functions used by
   every level; a check that turns each on and off.
7. The bell tent, stones, boulders and grass moved onto it; their old hand-made levels removed.
8. The library's Detail tab reading the `detail` block: levels with their pixel sizes and derived distances, impostor
   and folded colour shown, a click going to each.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | A new asset with no `detail` block gets every level from its kind's defaults | add a test asset with only a recipe; it shows mesh levels, impostor and folded colour in the Detail tab |
| 2 | No visible pop | a scripted camera flight from 10 km down to 2 m and back over the bell tent and a rock field, recorded; frame-by-frame difference shows no single-frame jump at any level change |
| 3 | Frame time | Lenses page, all nine lenses at 1400×800: frame time at or under 16.7 ms on this Mac, before and after for each stage |
| 4 | Draw calls stay flat with distance | the readout's draws at 100 m, 1 km and 10 km do not grow with the number of assets in view |
| 5 | Lit alike at every level | the sun turned through a day, fog on and off, a test cloud-shadow map: mesh, impostor and folded ground of the same asset match in brightness (measured in the frame) at each cross-over |
| 6 | Wind reaches every level | wind on: near meshes and impostors sway, folded ground does not; no seam at the cross-overs |
| 7 | One place to change light | a change in the shared shading functions (for example fog colour) shows on all levels with no edit to any asset or material file |
| 8 | Settings live with the asset | `grep` finds no per-asset detail number outside `TheGame/assets/`, `TheGame/materials/` and `TheGame/biomes/` |

**Stages, each its own build and measurement:** 1 selection and cross-over, 2 impostors, 3 material levels, 4 tiles to
10 km, 5 folding into the ground. The shading contract (6) is built alongside stage 1 and widened at each stage.

**Out of scope**

- Moving things (NPCs, carts, animals): a later intent on this base, adding animation levels (fewer bones, lower update
  rate, baked animation textures, animated impostors), per-frame batching and simulation levels.
- New lighting itself (a real sun cycle, clouds, weather): only the contract they will plug into.
- New assets beyond the four moved onto it.

## Build

_Not started: waits for Samuel's approval of the definition above._

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel: approve or change the definition
- [ ] Stage 1: selection by pixel size, cross-over, `detail` blocks and kind defaults; the shading contract begun
- [ ] Stage 2: impostors
- [ ] Stage 3: material levels
- [ ] Stage 4: tiles to 10 km
- [ ] Stage 5: folding into the ground
- [ ] The four assets moved; old levels removed; the Detail tab on the new block

## Changelog

### 2026-11-11

- **Asked:** whether the levels of detail also simplify textures; then a fully general detail solution for thousands of
  future assets, zooming 2 to 10 km out and back smoothly, each asset's settings with it, later moving things, and
  compatible with future lighting, fog, cloud shadows, sun and wind.
- **Delivered:** this intent, at Define. Found: today's levels cut only faces; textures shrink with distance by their
  mipmaps already, but every level runs the same shader.
- **Good:** the pieces exist to build on: the detail governor, the hitch log, the grass carpet, the Detail tab.
- **Broke / not there yet:** nothing built.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-11 | `8db7968` | The intent opened, its definition written |
