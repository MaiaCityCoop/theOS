---
id: "0038"
title: One clean architecture
state: build            # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-17
story:
---

# 0038 · One clean architecture

## Idea

> Make a system audit of the whole architecture and codebase and tell me about all the architecturally weak spots that
> we can clean up: consolidate, merge, improve, refactor, simplify, first principles. While making quality higher and
> keeping the 4K 60 fps gate intact. DRY KISS!!
>
> Didn't we say we should adopt the industry's best-practice LOD architecture? Audit this too: how we can simplify and
> upgrade our quality gate.
>
> Our goal is photorealistic scaling of any kind of asset, to any zoom or scroll position, fully generically and
> dynamically!
>
> Consolidate all the patches into one clean architecture that works!!! Get rid of all the scattered patches and do a
> clean first-principles refactoring!! No more tuning switches either!
>
> Also our legacy LOD with the manual per-asset models was really bad! So it's not a reference! We must have a 3× better,
> fully algorithmic, generic and universal upgrade, so smooth that we don't see any actual change at any moment while
> moving, scrolling, zooming or walking around, because it's perfect. So our old legacy manual LOD is not the quality
> gate.

On 2026-11-17 four read-only audits read the whole repository: the render core and the land; the plants, LOD and
assets; the characters, the film camera and the tools; and the OS, the API, CI and the process. Two research reports
already said what the industry does: `reports/Smooth automatic level of detail.md` and
`reports/Generic automatic detail of higher quality.md`. The code never adopted that answer. Here is what it built
instead, in patches:

| Patch on patch | Where | What it costs |
| --- | --- | --- |
| Two plant LODs side by side (`?lod=old`, `LOD.on` forks) | `trees.js`, `tree.js`, `plant.js`, `rock.js`, `rocks.js`, `bake.js`, asset files | Two shader variants, two tables per asset, four cache keys |
| 29 address switches, 16 of them tuning (`card`, `kmax`, `split`, `bake`, `far`, `spread`, `sky`, `mips`, `byclass`, `corners`, `fat`, `rawtex`, `slots`, `groundcache`, `notaau`, `lod`) | `src/core/flags.js` and its readers | The look is a set of dials, not a rule. `LOD` and `CROWD` contradict each other (`CARD` 15 against 30, `KMAX` 5 against 4) |
| Far trees are a hull "body" with a crown bake drawn on the CPU that never reads the leaves' alpha | `crowd.js` `bakeOf`, `trees.js` | The domes, the stipple, and 2–7 ms at 4K. A GPU impostor with alpha and normals already exists, in `src/detail/impostor.js` |
| Size on screen counted in CSS pixels (`pxK = innerHeight / …`) | `src/detail/index.js:16` | At 4K every band lands 2–3× nearer than designed, so cards stretch and far bodies cover hundreds of pixels |
| The ground's shader is written per biome in JS and unrolled | `src/terrain/material.js` `compose`, `ground.js` | A 390 KB shader (the Safari hang), 8.7 ms of laying, and every material read twice (5.5 ms) |
| The ground cache, `slots.js` | `src/terrain/groundcache.js`, `src/world/slots.js` | Off, or never running, and kept anyway |
| The library and Me pages start the whole world to show one stage | `library.html:65`, `src/me/stage.js:17` | Every shader compiled at start for a page that shows one thing |
| Dead and copied code | `characters/kit/{body,anatomy,measures}.js` (567 lines, unused), the stage set-up copied into Me, the oct codec written 3 times, light written about 15 times | Fixes don't reach every copy |
| A hand-kept trail table, a hand-copied deploy SHA, two installs, two dev-server API copies | `Intents/*.md`, `deploy.yml`, `OS/` and `TheGame/` vite configs | Merge conflicts on every PR, and next lags behind main |

## Define

**The rule, from first principles.** An asset says only what it is at full detail. The screen decides how much of it
to draw, by one measure: **error in the pixels actually drawn**. One number, `ERROR_PX`, holds that measure. The
governor may raise it to hold 60 fps before it lowers the pixel ratio. Nothing else is tuned. This is the industry's
answer: Nanite's error cut for surfaces, pruning for crowds of parts, and octahedral impostors at the far end. Here it
is fitted to WebGPU and Safari.

**The look target.** On 2026-11-17 Samuel sent three frames of a real-time forest: "this is the quality gate, what our
forest actually should look like". They show a temperate forest of birch and pine with ferns and a stream. The
species will come from the site; the quality is what these frames set. What makes them real, and what each part of
the architecture owes:

| In the frames | Ours today | Whose job |
| --- | --- | --- |
| Five layers of growth: canopy, young trees, shrubs, ferns and herbs, litter and deadwood, all mixed and dense | A meadow of grass with trees standing apart | **Builder** (the kinds) and the scatter's one rule, by layer |
| Crowns made of many small clusters with sky between them, read as separate crowns out to the haze | Stretched cards near, domes in the middle distance | **Builder** (pruning, impostor) and **Draw path** |
| Dappled light: leaf shadows on the path, light through the leaves, deep occlusion under the shrubs, sky light occluded in the stand | One sun and sky term, soft shadows, no light through leaves | **Light**: leaf-scale shadow, transmission, ambient occlusion (GTAO), sky occlusion |
| Haze that layers the stand by distance (aerial perspective) | Thin haze | **Light** |
| Ground with relief: a worn path with cracked dirt, roots, needles, mossy rocks bedded in the soil | Flat material layers | **Land** (material layers with relief near the eye) and **Builder** (rocks) |
| Water that is clear over stones, reflects, and falls | A river surface | **Land** (water), a later stage |
| Bark you can read (birch, pine) | Plain trunks | **Builder** (materials) |

To hold 60 fps on a 4K screen at this look, the frame is drawn at the resolution the governor chooses and brought up
to 4K by the temporal pass (temporal upscaling). The industry ships the same way: Nanite's published frame was drawn
at about 1400p and upscaled to 4K.

**The architecture: one of each**

| One | What | Replaces |
| --- | --- | --- |
| **Measure** | `src/detail/measure.js`: size and error in device pixels drawn (the canvas after the governor's ratio) and `ERROR_PX` | `pxK(innerHeight)`, the ladder's 8 px sizes, the kinds' px bands, `KMAX`/`CARD`/`FAR`/`END` numbers |
| **Builder** (in workers, kept by the registry's hash) | It looks at what the geometry is and picks how to make it coarser: a **surface** gets a cluster hierarchy (meshoptimizer, MIT); a **crowd of parts** (sprigs, grass, litter) gets one spread order, and survivors grow evenly by 1/√share, never stretched; the **whole thing small** gets one GPU-baked hemi-octahedral impostor (colour, normal, alpha, depth), lit live; beyond that, the land's colour | `ladder.js`, `reduce.js`, per-asset `levels`/`grow` tables, the hull body and CPU bake, `place.js`'s second impostor, the `MADE` cache numbers |
| **Draw path** | The existing heap drawer (`drawer.js`, `row.js`: kept) and one packing pass that picks, per thing, its cut, share or impostor by the measure. It draws in px buckets so no hidden vertex runs | The `SPLIT` tiers, `crowdRule` throwing hidden vertices off screen |
| **Light** | `lit({ albedo, n, shade, wet, spec, model })` in `src/world/light.js`, for every material: land, plants, rocks, made things, characters, impostors | About 15 hand-rolled light expressions, 3 shadow and 3 cloud copies |
| **Land** | A ground shader of constant size: the 3–4 strongest material layers picked per vertex, one read each, the take chosen per pixel under TAA, slow noise per vertex | Per-biome code generation, `slots.js`, the ground cache, two takes a material |
| **Boot** | `src/boot.js({ profile: 'world' or 'stage' })` with a `ready` promise | Four pages' copied heads, the `window.__game` polling, the library starting the world |
| **Gate** | **The gate is photorealism.** It has two halves. **Real:** the full-detail picture is held against photographs of the real thing at the same distance: a meadow, stone pines, holm oaks, shrubs, a bell tent, a fire pit, rocks, hills from 1 to 12 km. It is scored by its distance to the photos in CLIP features (CMMD) and in natural-image statistics (light, colour, contrast, the spectrum of detail), and by Samuel's blind test, photo or render. **Invisible:** detail never shows. `tools/gate.js` is one driver. The detail reference is **`?truth`**: every asset at full detail, rendered offline (in passes if it has to be). It is never a legacy LOD. It measures the picture's perceptual difference to the truth at fixed views from 1.7 m to 12 km, the change caused by detail in every frame of recorded walks, zooms, scrolls and flybys, GPU ms at 4K, memory, and the bytes compiled at start. Its headless part runs in CI | `?lod=old` as the baseline, the lenient sweep (no step over 3×), 9 loose Playwright scripts, checks done by hand |
| **Ship** | CI builds once, the deploy ships that build, and every merge to main goes to next by itself | The manual dispatch with a copied SHA |

**The address switches left are tools that measure, never dials of the look:** `bench`, `gputime`, `draws`,
`flyby` (`secs`, `px`), `stress` (`many`, `herds`), `bounds`, `ghost`, `webgl`, `embed`, `truth`.

**Deliverables, in stages.** Each stage is one PR. It merges when CI is green, it is deployed to next, and its gate
numbers are written below.

1. **Clean ground.** No change to the look:
   - delete `?lod=old` and every old-only path and table;
   - delete the 16 tuning switches, each frozen at what main draws today;
   - merge `LOD` and `CROWD` into one set of constants, so the workers' sync and the extra cache keys go;
   - delete the dead character code, the ground cache, `slots.js`, and the `MADE` numbers (the registry's hash
     replaces them);
   - load `stress.js` and `herds.js` only when asked for.
2. **Gate.** `?truth`, `tools/gate.js` (it absorbs `Intents/handoff/avenmac/*.mjs`), `src/detail/measure.js` in device
   pixels, and the baseline on main.
3. **Boot.** A stage profile for the library and Me, the ground shader wrapped so it compiles small, and Me's copied
   stage code merged.
4. **Far end.** One GPU impostor for plants, rocks and made things. It deletes the hull body, `bakeOf`, `GROWN`, the
   hash dissolve and `place.js`'s copy, and fixes the domes and the stipple.
5. **Crowds.** One spread order and the √share growth. It draws in px buckets and deletes `KMAX` and the card
   stretch, so the near pines are fixed.
6. **Land.** One take per material, slow noise per vertex, then the top-K layers.
7. **Surfaces.** A cluster hierarchy for rocks, then the tent and fire pit (this absorbs `aven/0033-solids-wip`). It
   deletes `ladder.js`, `reduce.js` and the kinds' bands. The Safari spike comes first.
8. **One light**, and the characters on it with one move player. The `skinOf` function of 618 lines is split into
   stages.
9. **Repository**, which can run beside the others because it touches no GPU code:
   - CI's build is shipped as is, and next deploys itself;
   - one dev server and repo API, one install (bun workspaces);
   - one store for the four Stories CLIs;
   - `.gitattributes` `merge=union` on `Intents/*.md`.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Stage 1 changes nothing on screen | `tools/gate.js` stills on main and on the branch, the same at every view (diff ≤ TAA noise). `bun tools/scale.js` 18 of 18. `vite build` passes for TheGame and OS |
| 2 | No tuning switch is left | `grep` finds none of the 16 names. `src/core/flags.js` lists only the tools above |
| 3 | It can't be told apart from full detail | The perceptual difference to `?truth` (FLIP, 4K) stays under the threshold of visibility at every view from 1.7 m to 12 km, in every 32-pixel tile and not just on average. Stage 2 sets the threshold against Samuel's eye, from pairs he can't tell apart, and it is never loosened after that. Nothing is measured against the legacy LOD. Every stage is nearer the truth than the one before, or equal where the stage is a clean-up |
| 4 | Nothing ever changes visibly | In recorded walks, zooms (1.7 m to 12 km), scrolls and flybys, the change caused by detail in each frame, ((LOD − truth) now) − ((LOD − truth) one frame before), stays under the threshold of visibility in every frame and every 32-pixel tile. There is no "3× the median" allowance |
| 4a | Photorealistic | At every gate view, the full-detail picture's distance to the real photos of the same scene (CMMD, and the image statistics) falls stage by stage and never rises. The end is Samuel's blind test: at the gate's views he can't tell the render from a photograph |
| 4b | Generic and universal | No asset file holds any detail data (`levels`, `ladder`, `grow`, px sizes, `detail`). A new asset dropped in gets all its detail from the builder, with no line of LOD code written for it |
| 5 | The 4K gate holds | `?bench` at 4K on Samuel's Mac, Chrome and Safari: ≤ 12 ms of GPU at every bench view, and memory ≤ 8 GB |
| 6 | The library starts in Safari | Bytes compiled at start, from the gate's shader log, are a fraction of today's 5.8 MB, and the library shows its subject in Safari with no 20 s timeout |
| 7 | Lines go down | `git diff --stat main` at the end of each stage. The total falls stage after stage |

**Out of scope:** new assets, the body's look (0036, waiting on Samuel's pick), the Bible (0037), and the story pipeline.

## Build

### Stage 1: clean ground (2026-11-17)

- I'm building straight away: Samuel asked for the work outright, three times, and nothing in this definition goes
  past what he said.
- **The photos are Samuel's own**, of the real site (he chose this on 2026-11-17). Shot list:
  - **Camera:** the phone's main lens (about 24–28 mm), at about 11:00 in clear sun, plus a few under cloud.
  - **Settings:** RAW (ProRAW) if possible, otherwise HDR and filters off. Portrait mode off.
  - **Views:**
    - the tent from 13 m at eye height;
    - a stone pine stand from inside at eye height;
    - single pines, an oak, a shrub, a boulder and the fire pit, each at 2, 10, 30, 60, 120, 250 and 500 m (as many as
      the place allows);
    - the meadow from 10, 30, 120 and 500 m up, if there is a drone or a hill;
    - the hills at 1–12 km.
  - **Handling:** they are kept by hash outside git, the way `Stories/objects/` keeps media, and each is tagged with
    its view and distance. GPS is stripped from anything committed.
- `aven/0033-avenmac-wip` (eye-ray read of the far body, `GROWN`) is not merged. Stage 4's impostor replaces the far
  body it improves. Its measuring scripts go into stage 2's gate.

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel's reference photos (shot list under Build)
- [ ] Stage 1: clean ground
- [ ] Stage 2: gate and measure
- [ ] Stage 3: boot
- [ ] Stage 4: far end, one impostor
- [ ] Stage 5: crowds
- [ ] Stage 6: land
- [ ] Stage 7: surfaces, cluster hierarchy
- [ ] Stage 8: one light, characters
- [ ] Stage 9: repository

## Changelog

### 2026-11-17

- **Asked:** a first-principles audit of the whole architecture (DRY, KISS), the industry's LOD architecture, a
  better quality gate, and then one clean architecture with no patches and no tuning switches.
- **Delivered:** four audits (render core and land; plants, LOD and assets; characters, camera and tools; OS, CI and
  process), and this definition.
- **Good:** the heap drawer and the row contract are already one path for everything, and stay.
- **Broke / not there yet:** nothing built yet.

## Trail

| When | Commit | What |
| --- | --- | --- |
