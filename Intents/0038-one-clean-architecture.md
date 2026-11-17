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
at about 1400p and upscaled to 4K. **Samuel decided this on 2026-11-17 ("Yes, upscaled 4K"):** the gate is a 4K
output, upscaled.

**The architecture: one of each.** Three research rounds checked it against the state of the art (2026-11-17,
below under Build): vegetation and geometry LOD, light and upscaling, and land, placement and the GPU pipeline. Each
row says what was adopted, and from whom.

| One | What | Replaces |
| --- | --- | --- |
| **Measure** | `src/detail/measure.js`: size and error in the pixels drawn (the canvas after the governor's ratio), and one `ERROR_PX`. The error of the wind's motion counts in it too (NVIDIA, HPG 2026) | `pxK(innerHeight)`, the ladder's 8 px sizes, the kinds' px bands, `KMAX`/`CARD`/`FAR`/`END` numbers |
| **Builder** (in workers, kept by the registry's hash) | A recipe gives **parts**: each a prototype, a transform and a pivot (Nanite Assemblies). The builder works once per prototype, and coarser comes in rungs, picked by what the geometry is. **Surfaces:** a cluster hierarchy (meshoptimizer; thin parts held by constrained edge contraction). **Crowds of parts:** one spread order. Sprigs grow about their tips, at most 2–3×; blades are halved and doubled in width, so a meadow keeps its height (Ghost of Tsushima). Each thing switches at its own random offset. **Clumps:** three crossed planes per chunk of leaves, with their opacity matched to the true area (NVIDIA HPG 2026, Simplygon's billboard clouds). **The whole thing small:** one octahedral impostor, baked on the GPU (colour, normal, alpha, depth), with three views blended with parallax and alpha mips that keep their cover. Beyond that, the land's colour. **One wind** for every rung | `ladder.js`, `reduce.js`, per-asset `levels`/`grow` tables, the hull body and CPU bake, `place.js`'s second impostor, the `MADE` cache numbers |
| **Placement** | One rule for everything that grows or lies on the land (Horizon Zero Dawn's GPU placement, UE PCG). Each layer's density is ecotope × slope, water and light × the influence of larger things already placed × clumping. It is placed by one shared ordered dither, largest first: trees, young trees, shrubs, ferns and herbs, litter, deadwood, rocks. Each thing writes its footprint, shade and litter for the layers under it. The dither's rank is the crowds' spread order too, so placing and thinning are one number | Stands, cells and clumps per kind; the five layers of the look target don't exist yet |
| **Draw path** | The heap drawer (`drawer.js`, `row.js`: kept). One packing pass picks each thing's rung by the measure, and two-pass occlusion culling against a depth pyramid (Nanite, Bevy) drops what is hidden; compaction is one atomic per workgroup. An alpha-tested **prepass** writes depth, normals and **motion vectors, the wind's included**. The main pass then draws with an equal depth test and no discard, which suits Apple's tile GPUs | The `SPLIT` tiers, `crowdRule` throwing hidden vertices off screen, no occlusion test, no motion vectors |
| **Light** | `lit()` in `src/world/light.js`, for every material. **Shadows:** two cascades in one atlas, the near one 3.4 cm a texel over about 70 m, with the penumbra growing as the sun's disc says; Bend's screen-space shadows for what is finer (litter, ferns, leaf on leaf). **Sky and occlusion:** a canopy map drawn from above for the sky's visibility in the stand; GTAO with a visibility bitmask and bent normals; leaves lit from behind (two-sided transmission). **Air:** Hillaire's sky and aerial-perspective tables (an MIT WebGPU port exists); height fog in froxels with shafts through the canopy. **Bounce:** sky-visibility probes (Ghost of Tsushima). **Noise:** spatiotemporal blue noise | About 15 hand-rolled light expressions, 3 shadow and 3 cloud copies, one 2048² shadow map over 120 m, thin haze |
| **Land** | Call of Duty's 2023 terrain. A one-byte map of material layers (four taps, up to 256 layers) is composited in compute into an **adaptive virtual texture** (Far Cry 4): pages chosen per pixel by a feedback buffer, hex-tiled inside, BC-compressed, about 100 MB. The ground is shaded once, in a deferred pass. The same pages carry height: displacement near the eye on a mesh built in compute, parallax further out, and skirts that bed rocks in the soil. Paths are spline decals laid into the pages | Per-biome code generation, `slots.js`, the ground cache (by rings, too coarse), two takes a material |
| **Upscale** | One fused pass to the 4K screen that writes history and canvas and tonemaps. It uses FSR 2's ideas (locks, jitter phases, a reactive mask) and UE TSR's detection of thin foliage, with the prepass's motion vectors | Three passes, tonemapping in every material, foliage with no history |
| **Boot** | `src/boot.js({ profile: 'world' or 'stage' })` with a `ready` promise | Four pages' copied heads, the `window.__game` polling, the library starting the world |
| **Gate** | **The gate is photorealism.** It has two halves. **Real:** the full-detail picture is held against photographs of the real thing at the same distance: a meadow, stone pines, holm oaks, shrubs, a bell tent, a fire pit, rocks, hills from 1 to 12 km. It is scored by its distance to the photos in CLIP features (CMMD) and in natural-image statistics (light, colour, contrast, the spectrum of detail), and by Samuel's blind test, photo or render. **Invisible:** detail never shows. `tools/gate.js` is one driver. The detail reference is **`?truth`**: every asset at full detail, supersampled so it doesn't shimmer, rendered offline (in passes if it has to be). It is never a legacy LOD. It measures the picture's perceptual difference to the truth at fixed views from 1.7 m to 12 km, the change caused by detail in every frame of recorded walks, zooms, scrolls and flybys (pages arriving included), GPU ms at 4K, memory, and the bytes compiled at start. It waits for the world's `ready`, never a timer, and measures its own noise floor. Its headless part runs in CI | `?lod=old` as the baseline, the lenient sweep (no step over 3×), 9 loose Playwright scripts, checks done by hand |
| **Ship** | CI builds once, the deploy ships that build, and every merge to main goes to next by itself | The manual dispatch with a copied SHA |

**Left out on purpose:**

| What | Why |
| --- | --- |
| A compute rasteriser (Nanite's) | It needs 64-bit atomics. Safari has none, and Chrome's are M2 and later only |
| A visibility buffer | Apple's GPUs already remove hidden pixels; the prepass gets the rest |
| Virtual shadow maps | Wind invalidates their pages every frame |
| DDGI, Lumen, radiance cascades | WebGPU has no ray tracing; probes from sky visibility instead |
| Gaussian splats, neural LOD | Baked light, no wind, and they must be trained per asset |
| Voxel far field | Experimental even in Unreal 5.9 |
| Trees generated on the GPU each frame | Needs work graphs, which WebGPU lacks |
| A full FSR 2 port | 5.4 ms at 4K on a GPU 2.7× an M1; its ideas instead |

**Budget, 12 ms of GPU at a 4K output from about 1440p (ms):**

| Land | Vegetation | Shadows | AO, GI | Air | Upscale | Post | Margin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2.0 | 3.4 | 2.0 | 1.0 | 0.7 | 2.0 | 0.4 | 0.5 |

The risk is the vegetation and the land on the bench's base M1. The stand alone measured 5.4 ms at 1440×779 in 0008.
The governor may settle near 1080p there (a 2× upscale), and nearer 1440p on an M-Pro.

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
2. **Gate, measure, prepass and upscale.** `?truth` (supersampled), `tools/gate.js` (it absorbs
   `Intents/handoff/avenmac/*.mjs`), the world's `ready`, and `src/detail/measure.js` in the pixels drawn. The prepass
   with motion vectors (the wind's included), and the fused upscale to the 4K screen. Then the baseline on main.
3. **Boot.** A stage profile for the library and Me, the ground shader wrapped so it compiles small, and Me's copied
   stage code merged.
4. **Far end.** The impostor (three views with parallax, alpha mips that keep their cover) and the clump rung, for
   plants, rocks and made things. It deletes the hull body, `bakeOf`, `GROWN`, the hash dissolve and `place.js`'s copy,
   and fixes the domes and the stipple.
5. **Crowds.** Recipes give parts; one spread order; growth capped at 2–3× (sprigs about their tips, blades in width);
   a random offset per thing; one wind for every rung; occlusion culling. It deletes `KMAX` and the card stretch, so
   the near pines are fixed.
6. **Land.** The deferred ground pass with the layer map first, then the adaptive virtual texture with feedback, then
   relief (displacement, parallax, skirts, path decals).
7. **Placement.** The one rule and the five layers, with the kinds the layers need: young trees, ferns, herbs,
   litter, deadwood.
8. **Surfaces.** A cluster hierarchy for rocks, then the tent and fire pit (this absorbs `aven/0033-solids-wip`). It
   deletes `ladder.js`, `reduce.js` and the kinds' bands. The Safari spike comes first.
9. **One light.** The cascades, screen-space shadows, the canopy map, GTAO, transmission, Hillaire's air, froxel fog
   and sky probes. The characters move onto it with one move player, and `skinOf`'s 618 lines are split into stages.
10. **Repository**, which can run beside the others because it touches no GPU code:
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
| 5 | 60 fps at all times, 8 GB at most: hard gates | On Samuel's Mac in Chrome and Safari, at a 4K output, upscaled:<br>• `?bench` at the fixed views: ≤ 12 ms of GPU at each, with the resolution drawn recorded beside it.<br>• **In motion** (`gate.js paths`: a walk into the stand, a zoom from 1.7 m to 12 km, an orbit, the flyby; with the cache warm and cold): no frame over 16.7 ms, and no frame over 12 ms of GPU. Streaming, building and compiling are included, so no hitch is allowed.<br>• The peak memory of the whole browser (every process), sampled through the same runs: ≤ 8 GB.<br>The picture checks (3, 4, 4a) are judged on the upscaled 4K output |
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
- `aven/0033-avenmac-wip` (eye-ray read of the far body, `GROWN`) is not merged.
- **What was done** (`e05e75b`, 51 files, +526 / −1720):
  - the legacy LOD and every old-only path, table and level are deleted;
  - 16 switches are frozen at main's defaults: CARD 30, KMAX 4, FAR 40, enclose 1.05, bake on, no split, SKY
    [-0.03, 0], spread 0; mips, rawtex, byclass, corners, fat, notaau, slots and groundcache are frozen off;
  - `LOD` is merged into `CROWD`, and rocks no longer import the plants' kit;
  - the ground cache, `slots.js` and its biome recompiles are deleted (with 5 biomes laid and 8 slots, they never took
    effect), as are the unused character kit and `tools/walk.js`;
  - the bones' caches are keyed on the registry's version (any character's current version is good, so switching
    characters doesn't regrow them);
  - stress and herds load only when asked for.
- **Checks:**
  - `scale.js` gives 18 of 18, and `vite build` passes for TheGame and OS;
  - no switch is read, and nothing imports a deleted file;
  - on the CPU, all 149 packed plant meshes, the crowd shapes, the bakes and the rock meshes are byte-identical to
    main's;
  - the land's vertex shader is byte-identical; its fragment shader computes the same values.
- **Stills** (4K, seven views from the tent's eye to 500 m, TAA on, time frozen). This branch against itself gives a
  mean absolute difference of 0.13–0.61 of 255. Against main it gives 0.01–0.76 at every view, so the picture is the
  same.
  - The first still of main at the pine view was taken before its trees had streamed in. Re-shot with a longer
    wait, it matches (0.56). So stage 2's gate waits for the world's `ready`, never a timer.
- **Not done in stage 1, for later stages:** the workers still get the stands' sizes once (`make.tell`): biome data,
  not tuning. The library's Detail tab now counts the crowd's faces. Stage 4's impostor replaces the far
  body it improves. Its measuring scripts go into stage 2's gate.

### Stage 2a: the gate, settle, one measure, the truth (2026-11-17)

Stage 2 lands in two PRs: **2a**, the gate and the measure, and **2b**, the prepass, the motion vectors and the
upscaler. Samuel asked for speed ("the baseline isn't even a quality gate today"), so the stages after 2a run in
parallel streams, each in its own worktree and branch.

- **`tools/gate.js`** is one driver: stills, diff, noise, bench, compile, paths, all.
  - **Its FLIP** is NVIDIA's LDR-FLIP, ported. Its error map equals flip-evaluator 1.7's (mean 0.024704 against
    0.024704), and its tiles are identical.
  - **The 4K screen** is 1920×1080 at a pixel ratio of 2, because the game caps its canvas at 2 pixels a point.
  - **Memory** is judged by macOS's physical footprint of every browser process. RSS misses Metal memory: one GPU
    process showed 52 MB RSS against a 1.16 GB footprint.
  - **The clock** is frozen at a fixed 100 s. Vite's reload socket is blocked in gate pages.
- **`settle()`** resolves when no engine has anything out and the temporal history has converged. On a cold cache,
  after a jump to the pine stand, the old timed still (120 frames + 2.5 s) showed no trees; `settle()` resolved after
  31.8 s with the forest drawn.
- **`measure.js`** is the one measure, used by every engine. Today's unit (CSS pixels) is kept; `DRAWN = false` is
  the switch to the pixels drawn.
- **`?truth=<m>`** measures everything within reach as huge, so every engine draws its finest.
  - It holds at 800 m. At 1000 m and 2000 m the WebGPU device was lost, so the 12 km view is not truth yet.
  - It takes 3.3 s a frame at 4K and holds 1 GB.
  - Shadows still come from the trees' stand-in.
- **The default picture is unchanged.** At 7 views the mean difference is within the run-to-run noise, except the
  flame and smoke, frozen at different moments.
- **The gate's first readings on today's code** (2a's runs shared the GPU with each other, so the times are upper
  bounds):

| Measure | Reading | Gate |
| --- | --- | --- |
| FLIP against `?truth` (tent, pines) | 0.14–0.21: the grass, and trees the normal picture leaves out | Under the threshold of visibility; the noise floor is ≤ 0.022 |
| GPU at the bench views, drawn 2560×1440 | 20–55 ms | ≤ 12 ms |
| Frames in motion (orbit, flyby; warm and cold) | Median 50–67 ms; GPU p99 102–110 ms | No frame over 16.7 ms |
| Peak memory (physical footprint) | 3.47 GB | ≤ 8 GB |
| Shaders compiled at start | 135 modules, 3.58 MB (the land: 390 + 240 KB) | Small enough that the library starts in Safari |

### The state of the art, checked (2026-11-17)

Three research rounds, each read against this definition. Sources marked † were seen only through a search summary.

- **Vegetation and geometry LOD:**
  - Epic, *Nanite Foliage*, Unreal 5.7+ (assemblies, bone wind, voxels);
  - van Antwerpen et al., *Real-time Path Tracing of Massive Dynamic Foliage*, HPG 2026 (clump planes, motion error
    in the screen error, FLIP against the denoiser's drift);
  - Simplygon, *vegetation billboard clouds*, 2026;
  - octahedral impostors with frame blending (arycama 2024, agargaro's three.js forest);
  - Ghost of Tsushima's grass, GDC 2021†;
  - Kapoulkine, *coordinated omission*, 2026;
  - the Dawn commit on 64-bit atomics (M2 and later), March 2026.
  - **Skipped:** Gaussian-splat LOD (LODGE, Spark 2.0†), neural LOD (Weier 2023†), voxels, GPU-generated trees
    (Kuth, HPG 2025†).
- **Light and upscaling:**
  - Bend Studio, *screen-space shadows*, 2023 (Apache-2.0);
  - Jimenez, GTAO, 2016† and Therrien's visibility bitmask, 2023;
  - Hillaire, *sky and atmosphere*, EGSR 2020† (MIT port: webgpu-sky-atmosphere);
  - Patry, *Ghost of Tsushima*, SIGGRAPH Advances 2021 (froxel haze, sky probes);
  - Wronski, *World AO*, GDC 2014†;
  - Barré-Brisebois, *translucency*, 2011†;
  - FSR 2 (MIT) and UE 5.7 TSR's thin-geometry detection;
  - NVIDIA's spatiotemporal blue noise†;
  - the Safari 27 notes (no subgroups, timestamps in about 93% of reports).
- **Land, placement and the GPU pipeline:**
  - Etienne, *Large Scale Terrain Rendering in Call of Duty*, SIGGRAPH Advances 2023 (layer map, AVT, deferred
    terrain, skirts);
  - Ka Chen, *Adaptive Virtual Texture Rendering in Far Cry 4*, GDC 2015;
  - van Muijden, *GPU-based procedural placement in Horizon Zero Dawn*, GDC 2017;
  - Mikkelsen, *hex-tiling*, JCGT 2022;
  - Benyoub & Dupuy, *concurrent binary trees*, HPG 2024†;
  - Haar & Aaltonen, *GPU-driven rendering*, SIGGRAPH 2015† (two-pass occlusion);
  - WebKit's `HardwareCapabilities.mm` (indirect draws, yes; subgroups and 64-bit atomics, no).
- **What the research changed in this definition:**
  - the land is a virtual texture fed by a layer map, not layers picked per vertex, which would seam;
  - placement is one defined rule;
  - motion vectors (the wind's included) and a prepass come first, in stage 2;
  - the builder gains parts, a clump rung and one wind;
  - growth keeps a meadow's height;
  - the truth is supersampled;
  - the gate waits for `ready`.

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel's reference photos (shot list under Build)
- [x] Stage 1: clean ground
- [x] Stage 2a: gate, settle, one measure, truth
- [ ] Stage 2b: prepass, motion vectors, upscale
- [ ] Stage 3: boot
- [ ] Stage 4: far end, impostor and clump rung
- [ ] Stage 5: crowds, parts and one wind
- [ ] Stage 6: land, virtual texture and relief
- [ ] Stage 7: placement, five layers
- [ ] Stage 8: surfaces, cluster hierarchy
- [ ] Stage 9: one light, characters
- [ ] Stage 10: repository

## Changelog

### 2026-11-17

- **Asked:** a first-principles audit of the whole architecture (DRY, KISS), the industry's LOD architecture, a
  better quality gate, and then one clean architecture with no patches and no tuning switches.
- **Delivered:** four audits (render core and land; plants, LOD and assets; characters, camera and tools; OS, CI and
  process), and this definition.
- **Good:** the heap drawer and the row contract are already one path for everything, and stay.
- **Broke / not there yet:** nothing built yet.
- **Then asked:** the legacy LOD is no reference; "way higher": the gate is photorealistic, against Samuel's own
  photos and three frames of a real-time forest he sent; 4K output with temporal upscaling ("Yes, upscaled 4K");
  "double check the design against the cutting edge".
- **Then delivered:**
  - the gate rewritten as photorealism (real against photographs, detail invisible against supersampled full detail);
  - three research rounds folded in: virtual-textured land, one placement rule, prepass with motion vectors, parts,
    clump rung, one wind, a light model for foliage, a fused upscaler, and a budget;
  - stage 1 built and checked: 1194 fewer lines, the same picture.
- **Good:** stage 1 changed nothing on screen. The plant meshes are byte-identical, and the stills match main within
  the TAA's noise.
- **Not there yet:** stages 2–10; Samuel's photos.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-17 | `b712f56` | Defined from the four audits |
| 2026-11-17 | `7181723` | The gate is full detail itself; the legacy LOD is no reference |
| 2026-11-17 | `9f0c755` | The gate is photorealism |
| 2026-11-17 | `999fba1` | Samuel's own photos; the shot list |
| 2026-11-17 | `647b8da` | The look target, a real-time forest |
| 2026-11-17 | `7a4e2b7` | A 4K output, upscaled |
| 2026-11-17 | `e05e75b` | Stage 1: clean ground, one plant LOD path, no tuning switches (−1194 lines) |
| 2026-11-17 | `a5d2d9a` | Stage 1 merged (#61) and deployed to next |
| 2026-11-17 | `06baae7` | Stage 2a: the gate (FLIP, stills, bench, compile, paths), settle, one measure, `?truth` |
