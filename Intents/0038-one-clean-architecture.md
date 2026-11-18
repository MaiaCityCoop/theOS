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

### Stage 2b: prepass, motion vectors, one upscale to 4K (2026-11-18)

- **The prepass** (`src/core/pass.js`). A material that takes part (the land, the stands, the grass, the rocks and
  what is placed: `userData.pre`) is drawn twice, by two twins that carry the pass in three's `contextNode`, so one
  material's node code says per pass what it needs:
  - the prepass writes the depth and the motion (rgba16f: the motion on the screen, written, thin), with no light;
    leaves, the thinning dither and the far body's cover are cut here and only here;
  - the colour pass draws with an equal depth test and no discard (a tile GPU's hidden-surface removal then works on
    cut-out leaves), in the light's own numbers; its fourth number is the reactive mask (the fire and the falling
    snow lower it by their blending, a mover on its skeleton writes 0);
  - the position is `@invariant` in both (three's `context({ invariant: true })`). No holes were seen in Chrome.
- **Motion vectors** include the camera and every moved vertex. The previous position is the same stateless function
  asked at the previous frame's clock (`windAt(p, time)`, each blade's flutter, the sprigs' swing, the drawer's growing
  (`solidOf().at`), a made thing's sway (`swayed(…, time)`)), through the previous frame's unshifted camera:
  `clipOf(w, was)` hands it to the prepass. Checked with the camera moving: the prepass's motion of what stands still
  equals the camera's reprojection through the depth within 0.05 px. Not followed: a mover's skeleton (its pixels are
  reactive instead, as before), and the land's distance morph.
- **The upscale** (`src/core/temporal.js`) is one pass at the screen's pixels. It writes the kept picture and the
  canvas together (the kept picture a storage texture written from the fragment shader: three r187 declares one there
  read-only unless it is read-write, so its WGSL builder is told once), and tonemaps there: `toScreen` is the identity
  in both passes, so no material changed. From FSR 2 and TSR:
  - jitter phases ⌈8·s²⌉ (18 at 1440p → 4K);
  - a box in YCoCg of a reversible curve (c / (1 + max)), clipped toward its mean;
  - locks where something thin stands among unlike pixels, held three frames in the kept picture;
  - the reactive mask;
  - the motion read at the nearest of the 2 × 2 drawn pixels (one `textureGather` of the depth);
  - thin foliage (the prepass's flag) gets a wider box.
  - The lens's glass is fused too: the kept picture lives in the glass's own frame.
  - WebGL 2 draws the same pass into two targets and copies to the canvas.
- **Removed:** `stillness`, `uMark`, `uMarks`, the look, build and show passes, the separate sharpening, and the
  tonemap in every material.
- **What it costs, on the bench's base M1:** at 4K, what the pass moves costs more than what it reckons. A pass that
  only reads and writes the kept picture and the canvas cost 5.1 ms; reading a 3 × 3 cost 11.5 ms. So the pass reads
  2 × 2 (13 reads a pixel) and keeps its picture in eight bits a number (the square root of the perceptual colour,
  rounded by a noise that changes every frame; the worth and lock in the alpha).
  - The GPU was shared with other agents all night: the same shadow pass took 1.0–6.5 ms from run to run. So each
    timing was taken beside the shadow pass in the same page, and is read against it (the pine forest at eye level,
    drawn 2560 × 1440, shown 3840 × 2160, eight runs each):

| Measure | Base | Branch |
| --- | --- | --- |
| The upscale alone (old: three passes), in shadow passes | 9.4 (7.9–10.8) | 6.0 (5.6–7.0) |
| The same in ms, at the calmest run | 11.9 | 8.7 |
| The whole frame (old: colour and upscale; new: prepass, colour, upscale), in shadow passes | 62 (47–71) | 40 (38–61) |

  - So the upscale costs about two thirds of the three passes it replaces, and the whole frame about two thirds of
    the old one: the prepass costs less than the leaves' hidden pixels it stops shading. On an idle M1 that would be
    about 6 ms for the upscale, three times its 2 ms budget: at 4K it moves 12 bytes a screen pixel at the least
    (the kept picture read and written, the canvas written). The next saving is in what it reads.
- **The gate's other readings** (the same shared GPU; indicative only):

| Measure | Base | Branch | Gate |
| --- | --- | --- | --- |
| Bench GPU at six views, the whole frame through the screen | 56–82 ms | 35–96 ms | ≤ 12 ms |
| Walk, median / GPU p99 (cold; warm) | 50 / 148 ms; 33 / 61 ms | 50 / 71 ms; 33 / 57 ms | No frame over 16.7 ms |
| Orbit, median / GPU p99 (cold; warm) | 50 / 133 ms; 33 / 86 ms | 50 / 63 ms; 50 / 89 ms | No frame over 16.7 ms |
| Peak memory (physical footprint) | 3.56 GB | 3.71 GB | ≤ 8 GB |
| Shaders compiled at start | 135 modules, 3.58 MB | 159 modules, 4.19 MB | Small enough for Safari |

- **FLIP against `?truth`**, all on fresh browser profiles (see Found):

| View | Base against its truth | Branch against the base's truth | Branch against its own truth | Base against the branch's truth | Branch against base |
| --- | --- | --- | --- | --- | --- |
| Tent, eye level | 0.1365 | 0.1480 | 0.1383 | 0.1472 | 0.040 |
| Pine forest, eye level | 0.1103 | 0.1152 | 0.1108 | 0.1134 | 0.029 |
| Pines from 30 m | 0.2631 ¹ | 0.2631 ¹ | 0.2609 | 0.2621 | 0.033 |

  ¹ against 2a's truth on the kept profile: the base's truth at pines-30m on a fresh one was lost twice (the device,
  then `settle()` under the shared GPU).

  - Each picture is nearest its own truth. The two truths differ by 0.026–0.038 themselves: the kept picture is now
    averaged in a reversible perceptual curve, not in the screen's numbers; the flames are composited in the light's
    numbers; and the separate sharpening is gone. Same code shot twice differs by 0.014–0.018.

- **Swaying foliage, in motion** (wind 0.6, the clock running; FLIP of a moving frame against the same moment held
  still and settled):

| View | Base | Branch |
| --- | --- | --- |
| Pine forest, eye level | 0.056 (p99 tile 0.143) | 0.040 (0.094) |
| Tent, eye level (grass) | 0.057 (0.185) | 0.048 (0.163) |

  - The base smears what sways: it keeps half a frame's worth of history there without knowing where it was.
  - The branch follows it, and keeps its edges.
- **Found:** the gate's stills depend on the browser profile. On the kept `.gate/chrome` profile the same code drew
  the plants at pines-30m otherwise than on a fresh one (FLIP 0.17 between them, base against branch). So `gate.js`
  has `--fresh` (a new profile for the run), and every comparison above is taken fresh. Also: a frame slower than
  250 ms lets the kept picture go (`stale`), so `settle()` never comes under very heavy load; `--url` points the gate
  at a worktree's own server; `bench` now times the whole frame through the screen (prepass, colour, upscale).
- **Not done:** normals in the prepass (nothing reads them yet: the light's stage writes them when it needs them);
  a mover's own motion (its skeleton at the previous stride); Safari is not tried (`@invariant`, storage writes in a
  fragment shader); the virtual camera's depth of field is not exercised by the gate (its target is now half float);
  `tools/sweep.js` reads the colour target as eight bits and now gets half floats.
### Stage 10: ship what CI built; next deploys itself (2026-11-17)

- **Ship what CI built.** CI's push to `main` uploads its release tar, `release-next`. The deploy downloads that run's
  artifact (no checkout, no rebuild) and checks that its `version.json` names the commit. A manual run with
  environment and commit is the rollback: it finds that commit's passed push run and ships its artifact.
- **Next deploys itself** when CI passes on a push to `main` (`workflow_run`). It deploys only for a passed `push` run
  from this repository; production stays manual. `AUTO_DEPLOY_NEXT` is no longer read.
- **`.gitattributes`:** `Intents/*.md merge=union`.
- **`Stories/store.js`:** what the four Stories CLIs repeated. 58 read commands give identical output, and 52 write
  commands write byte-identical files.
- **`server/repo.js`:** one repo API and one MIME table for both dev servers and both builds; the builds are
  byte-identical to main's.
- Bun workspaces were skipped while another branch changed `TheGame/package.json`.
- **Only GitHub can show** the artifact passing between runs and the `workflow_run` trigger. They fire after the
  merge. Commits from before it have no artifact, so a rollback reaches only later ones.

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

### Stage 4: far end (2026-11-17)

- Built on `aven/0038-stage4-far` from main at `a5d2d9a`, rebased onto `32f14e7` (stage 2a) before it was pushed,
  then merged with main at `00bb3cb` (stages 2b and 10), as a draft PR.
- **The impostor rung** (`src/detail/impostor.js`):
  - one octahedral impostor a shape: 10 × 10 views over the half-sphere above, 128 texels a view, framed by the sphere
    round the whole plant;
  - baked on the GPU from the shape's finest level as it lies in the heap, with its own leaves' and bark's textures,
    4 × 4 samples a texel: colour, cover, normal, depth and light;
  - its mips keep their cover (Castaño 2010, view by view), made in workers;
  - drawn through the heap drawer as one quad facing the eye (one draw for every kind, after the kinds');
  - each pixel blends the three nearest views, each read with one step of parallax by its depth, and is lit live by the
    cards' light;
  - its quad stands half its radius towards the eye and writes its own depth, not what it shows. A shader that writes
    depth loses the early depth test, so every pixel hidden behind nearer crowns is shaded too: at the pine stand the
    plants' GPU time read 25 ms with it, and 4 to 18 ms without it (a shared GPU).
- **The clump rung** (`assets/kit/crowd.js` `clumpsOf`):
  - a crown's sprigs are split by their boxes, the largest error first, until a chunk's error (half its box's largest
    side, in pixels where the clumps come in) is under 3 px, or there are 64;
  - each chunk is three crossed planes through its box's middle, baked on the GPU from its own sprigs (found by their
    tips in its cell);
  - their cover is renormalised to what the eye sees of the chunk (1 / (|v.x| + |v.y| + |v.z|), texel by texel), their
    normals are pulled towards the eye (HPG 2026's bias), and they are lit pixel by pixel.
- **How the rungs switch:**
  - cards down to where the crowd would stretch (KMAX, LEAST, FAR: as before);
  - over the next 30 % of size (WIN) the last sprigs go one by one and the chunks grow in one by one out of their
    middles, each where its own sprigs were: no dither;
  - the impostor where its texels are no larger than the pixels drawn (T = 128 × size / sphere diameter, in pixels
    drawn). Each plant switches at its own size (72–100 % of T, by its seed), over a 15 % cross-fade texel by texel:
    each texel by a number of its own, so no pattern sits on the screen;
  - a level wholly under `far.lo` (where the last cross-fade ends at a ratio of 3) holds nothing but the impostor.
- **The measure:** stage 2a's (`measure.js` `pxAt`), as the pixels drawn: `measure.js` `drawnAt` multiplies it by
  `U.uDrawn` (the inside's ratio) while `DRAWN` is off, and passes it through once it is on. The packing is redone when
  that ratio changes.
- **Settle:** each stand's far ends are a source of `src/core/settle.js`: the world is not complete while a shape of it
  is still being baked.
- **The prepass (stage 2b):** the impostors and the clump planes take part in it. They are cut there, by their cover
  and by the impostor's cross-fade texel by texel; the prepass writes their motion (a clump plane sways with its cards,
  through the same `stand()`; an impostor's quad stands still); the colour pass draws them with no discard.
- **Deleted:**
  - the three hull far bodies and the post (`HULLS`, `bodyOf`, `placesOn`, `skinAt`, `enclosing`, `crownSeen`);
  - `bakeOf` and its texture layers (`bakeLayers`, `BAKED`, `BAKEMIPS`, `bakeRes`);
  - the hash dissolves (the far body coming in, its end, the wood's swap to the post) and the rim darkening;
  - `crowd.js` `drawnAt`, `hullAt`, `turnedAt`;
  - CROWD's `HULLS`, `TURN`, `BAKE`, `BAKEMIN`, `RIM`, `DEEP`, `SWAP`, `END`, `DENSE`, `REACH`, `ENCLOSE`.
- **One impostor path:** the made things' card (`place.js`: the library's stage) uses the same views now, baked once a
  recipe from its nearest level. Without WebGPU it has none, and its last level sinks away instead. The list's made things and the rocks
  have no impostor: they end in the drawer's dot and the rocks' thinning, untouched.
- **Checked** in headless Chrome on Samuel's Mac: 1280 × 720 at a pixel ratio of 3 (a 4K picture), the world drawn
  at 2, against main on a server of its own (`32f14e7`, and `00bb3cb` after the merge). Another session's gate runs
  shared the GPU until about 02:45; the timings in the table were read after that.
  - **Stills** (the tent; the pine stand at eye level and 30, 60, 120 and 250 m up), before and after the merge: main's
    far pines are faceted domes with pale seams painted on them, stippled at their edges, from 30 m up and behind the
    tent. Here they are stone pines: trunks, crowns in clusters with gaps, the ground between them. No dome, no
    stipple, no dark outline at 4K.
  - **Against `?truth`** (before the merge): the far shrubs at the tent read darker than main's, as they do in the
    truth. The mean difference of 8 × 8 blocks from a `?truth` still fell from 13.8 to 6.8 over the shrubs and from
    4.6 to 2.7 over the treeline.
  - **A crown halfway through its cross-fade** shows a fine speckle at 4K, where neither its mesh's texel nor its
    impostor's is kept: two crowns in the 60 m still after the merge.
  - **What the plants submit and cost**, after the merge (`?gputime`, ratio 2; vertices a frame; the plants' own GPU
    time is the frame with them less the frame without them, the median of nine turns):

| View | Vertices, main → here | Plants' GPU ms, main → here | Whole frame ms (`tools/bench.js`), main → here |
| --- | --- | --- | --- |
| tent, eye level | 0.44 M → 0.54 M | 1.4 → 1.8 | 31.8 → 24.5 |
| river bend, 26 m | 0.25 M → 0.99 M | 1.4 → 1.6 | 42.6 → 30.6 |
| town, 40 m | 0.32 M → 0.58 M | 0.9 → 0.4 | 23.1 → 24.2 |
| pine forest, eye level | 2.93 M → 3.38 M | 4.4 → 3.6 | 30.4 → 31.3 |
| pine forest, 90 m | 0.46 M → 0.92 M | 1.1 → 1.7 | 23.3 → 23.8 |
| skyline, 2.5 km | 27 k → 18 k | (its timer reads negative, on main too) | |

  - Before the merge, on the shared GPU, the plants' own time read 1–20 ms on main and 2–18 ms here: no clear
    difference either way.
  - **Memory** (the GPU ledger, settled at the start, after the merge): main 399 MB, here 828 MB. The impostors' atlases
    take 417 MB (the pines' 267, the shrubs' 100, the reeds' 50) and the clumps' 51 MB; the packed tiers take 39 MB
    more; the trees' meshes 57 MB less (no hull bodies, no baked crowns).
  - **Baking:** every shape's far end is in 21–91 s after the plants' coarse levels (as the shared GPU allowed);
    `settle()` resolves after it.
  - **Once**, on the shared GPU after the merge, the WebGPU device was lost at the 250 m view. Taken again on a quiet
    GPU, the 120 m and 250 m views drew in 15 s each, with no error.
  - `bun tools/scale.js`: 18 of 18 within their measure. `bun tools/account-check.js`: 67 passed. CI's build of both
    sites (`deploy/bundle.sh`) and `bunx --bun vite build` (TheGame, OS): built.
  - The library's tent shows the made thing's impostor (100 views) with no error; stood in the game beside the real
    tent it reads as a tent.
### Stage 6a: the ground laid from a layer map (2026-11-17)

Branched from 2a (`aven/0038-stage2-gate`), in parallel with 2b, 4 and 10.

- **What the 390 KB shader was.** The gate's compile names it: the two-output pass of `src/scatter/ground.js` (the
  blades' map), not the land's material. The land was 240 KB (vertex) and 151 KB (fragment). All three are cut here.
- **The layer map** (`src/terrain/layers.js`, after Etienne, CoD 2023). A clipmap round the camera: ten levels of 512²
  texels, from 0.25 m to 128 m a texel, kept toroidally. As the camera moves, only the rows and columns a window comes
  onto are worked out, on the GPU, by one compute pass of the biomes' own rules. A texel is 20 bytes: the four strongest
  layers (a byte each, so up to 255 layers, numbered in the order they are laid) and their shares; the carpet's cover
  near, between and far; the macro variation; the two thickest stands (cover and crown pattern); the grass's tint. That
  is 52 MB.
- **The fragment** reads the four texels round its point (eight over the last 15 % before the next level), sums them
  into at most five layers (the fifth is the base's rock on what is too steep, from the pixel's own slope), and lays
  them in order, the higher winning at a seam, with the carpet among them. Each material is read once. Near, it is
  hex-tiled (Mikkelsen, JCGT 2022: offsets, not turned, hexagons two tiles across). Past 240–320 m it is one read pushed
  about by a slow wave, as the old far end did. Its size no longer grows with the biomes or the materials.
  - Turned hexagons were tried and dropped: sand ripples became a basket weave.
  - One-tile hexagons broke the ripples every tile; two tiles match the patches the two takes made.
- **Shader functions.** The land's noises, the hash, the height and the river's carve and bank are now functions of
  the shader's own (layouts), written once in a shader. What reads a uniform (the river) stays inline: three r187 names
  a uniform inside such a function apart from the shader's own, and the shader does not compile.
- **Deleted:** the per-biome code generation in `compose`, the vertex's shares and spots lanes, the second take and its
  noise mask, the far wobble's two noise reads, and the second tile size in every biome (it only scaled the second
  take). The dry land's spots now say their fade as data.
- **A gate fix.** The stills froze the governor's detail cap wherever the start's slow frames had left it. A faster
  build therefore drew grass blades to 120 m where the baseline did not: 0.14 FLIP for that alone. `governor.rest()` now
  puts the cap back where it starts. The baseline was re-shot so (`base3`).
- **Shaded once, in 2b's passes** (main merged in on 2026-11-18). The land takes part in the prepass: its depth, and the
  camera's motion; its vertex works out only where the ground is there. Its colour pass then draws with an equal depth
  test, so each pixel of the ground is shaded once, in the colour stage, after everything in front of it is known. That
  is what the deferred pass was for. A separate full-screen pass would add only perfect quads on thin far triangles, at
  the price of a G-buffer or a depth reconstruction. It is left for 6b, where the virtual texture's feedback wants a
  screen pass anyway.
- **Measured.** The GPU was shared with other agents' gate runs all along. Single bench runs of the same code swung
  2–3×, and some runs lost the WebGPU device (blank stills, a hung settle). So the times are side by side (A/B, the
  least of three rounds), and only taken before the merge with 2b; afterwards the A/B lost the device.

| Shader bytes (gate `compile`, at the start) | 2a | 6a on 2a | 2b (main) | 6a on 2b |
| --- | --- | --- | --- | --- |
| All | 3.58 MB, 135 modules | 1.98 MB, 136 | 4.19 MB, 159 | 2.55 MB, 160 |
| The largest | 390 KB (the ground pass) | 78 KB (the layer map's pass) | 390 KB | 78 KB |
| The ground pass (`scatter/ground.js`) | 390 KB | 76 KB | 390 KB | 76 KB |
| The land: vertex, fragment | 240 KB, 151 KB | 25 KB, 67 KB | 240 KB, 151 KB | (twins of) 25 KB, 67 KB |

| GPU ms, 2560×1440, on 2a | Frame 2a | Frame 6a | Land alone 2a | Land alone 6a |
| --- | --- | --- | --- | --- |
| Tent, eye level | 15.2 | 13.5 | 9.3 | 9.0 |
| River bend, 26 m | 16.6 | 18.7 | 13.1 | 15.2 |
| Town, 40 m | 15.3 | 18.4 | 12.5 | 16.2 |
| Skyline, 2.5 km | 15.5 | 17.5 | 13.9 | 16.3 |
| Pine forest, eye level | 31.8 | 26.1 | 14.2 | 12.0 |
| Pine forest, 90 m | 13.1 | 17.4 | 10.6 | 15.1 |

  - Faster at eye level, slower from above. Each material read now waits on the map's ids (two dependent fetches a
    pixel), and the near ground is hex-tiled out to 320 m. That is not the immediate win this stage was meant to be.
    The virtual texture (6b) turns those reads into one per pixel.
  - On 2b, the gate's bench, whole frame through the prepass, colour and upscale, shown at 4K. It is not side by side,
    so it is noise more than measure: main 27.1–29.6, 36.4–46.5, 34.0–36.2, 35.9–40.3, 40.0–51.6 and 26.1–35.2 ms
    (two rounds); the branch 27.9, 47.6, 32.3, 39.7, 38.2 and 42.4 ms (one round; its second hung on a lost device).

| FLIP, mean (p99 tile) | Tent eye | River 26 m | Tent 10 m | Tent 30 m | Tent 120 m |
| --- | --- | --- | --- | --- | --- |
| 6a against 2a (2a shot twice: 0.011–0.022) | 0.059 (0.41) | 0.076 (0.29) | 0.058 (0.37) | 0.084 (0.35) | 0.054 (0.19) |
| 2a against its truth | 0.061 | 0.100 | 0.142 | 0.243 | 0.159 |
| 6a against its own truth | 0.061 | 0.099 | – | – | – |
| 6a on 2b against 2b, fresh profiles | 0.093 (0.41) | 0.097 (0.29) | 0.066 (0.36) | 0.124 (0.35) | 0.056 (0.19) |

  - What differs from 2a is where each grain of a ground lies (each hexagon's own offset, not the noise-mixed two
    takes), and near, one scale instead of two. The layers lie where they lay. Against its own truth 6a is exactly as
    near as 2a is to 2a's; 2a's truth carries its two takes.
  - The other three truths of 6a were lost to the device (blank frames). After the merge no truth was taken: the run
    stopped when a bench hung on a lost device.
  - On 2b, a fine even speckle over all the grass adds to the difference, worst at 30 m. The stills show no hole and
    no seam.

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel's reference photos (shot list under Build)
- [x] Stage 1: clean ground
- [x] Stage 2a: gate, settle, one measure, truth
- [x] Stage 2b: prepass, motion vectors, upscale
- [ ] Stage 3: boot
- [x] Stage 4: far end, impostor and clump rung (built; draft PR)
- [ ] Stage 5: crowds, parts and one wind
- [ ] Stage 6: land, virtual texture and relief
  - [x] 6a: the layer map, one read a material (the deferred pass left to 6b)
  - [ ] 6b: the adaptive virtual texture with feedback, the deferred pass, the ground pass read from the map
  - [ ] 6c: relief (displacement, parallax, skirts, path decals)
- [ ] Stage 7: placement, five layers
- [ ] Stage 8: surfaces, cluster hierarchy
- [ ] Stage 9: one light, characters
- [x] Stage 10: repository (CI ships its build, next deploys itself, one Stories store, one repo API)

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
- **Stage 6a (built in its own worktree):**
  - Delivered: the land's layer map, one read a material, and the land's noises as shader functions. The shader bytes
    at the start went from 3.58 to 1.98 MB; the largest module went from 390 to 78 KB.
  - Then asked (the coordinator): merge main (2a, 10, 2b) and fit the ground into 2b's prepass.
  - Then delivered: merged. The ground writes its depth in the prepass and is shaded once in the colour pass (equal
    depth test). On 2b the shader bytes at the start go from 4.19 to 2.55 MB.
  - Good: the land is laid where it was. The stills differ from 2a's only in where each grain of a ground lies.
  - Not there yet:
    - the land is faster at eye level but slower from above (2–4.5 ms at 2560×1440, side by side on 2a);
    - the lines rose by about 230;
    - the truths after the merge were not taken: the shared GPU kept losing the device.

### 2026-11-18

- **Delivered:** stage 2b, the prepass with motion vectors (the wind's included) and one upscale pass to 4K that
  tonemaps; `stillness` and two passes gone.
- **Good:** swaying foliage keeps its history and its edges in motion; static geometry's motion matches the camera's
  to 0.05 px; the colour pass shades no hidden leaf.
- **Not there yet:** the gate in motion and the 12 ms budget (a base M1 shared with other agents); normals in the
  prepass; a mover's own motion; Safari.
- **Asked (by the orchestrating session):** stage 4, the far end: one impostor and the clump rung, generic for every
  plant, deleting the hull body, the CPU bake and the stipple.
- **Delivered:** stage 4 built (under Build). The domes and the stipple are gone at every view from the tent to
  250 m up.
- **Good:** from 30 m up the forest reads as stone pines, not domes, and nothing is stippled at 4K.
- **Not there yet:**
  - net lines rose: +825 and −656 in the game (+169, the worker's 71 among them), where they were to fall;
  - the clump rung costs vertices (up to four times main's at the river bend); the impostors and clumps hold 0.47 GB
    of GPU memory (an atlas at 64 texels a view would hold a quarter);
  - until a shape is baked (21–91 s), its far plants show only their thinned sprigs;
  - a crown halfway through its cross-fade shows a fine speckle at 4K;
  - the WebGPU device was lost once at 250 m on the shared GPU (not again on a quiet one);
  - an impostor's depth is its quad's: two crowns whose quads cross may overlap the wrong way (not seen in the stills);
  - rocks and the list's made things still end in the drawer's dot and the rocks' thinning;
  - Safari not tried.
- **Then asked (by the orchestrating session):** merge main (stages 2b and 10), never rebase; the impostor and the
  clump planes to take part in the prepass (cut there, their motion, no discard in the colour pass); every size on
  screen through `measure.js`.
- **Then delivered:** merged (`9e4dc7e`); both take part in the prepass; sizes through `measure.js` (`pxAt`,
  `drawnAt`). The stills hold after the merge.

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
| 2026-11-18 | `4296c81` | Stage 2b: prepass with motion vectors, one upscale to 4K (`stillness` and two passes gone) |
| 2026-11-18 | `a1f5009` | Stage 4: one impostor and the clump rung; the hull bodies, the CPU bake and the stipple deleted (+165 lines) |
| 2026-11-18 | `9e4dc7e` | Stage 4 merged with main (2b, 10): its impostors and clump planes cut in the prepass, with their motion |
| 2026-11-17 | `a9657a6` | Stage 6a: the layer map, one read a material, the land's noises as shader functions |
| 2026-11-18 | `29cc189` | Stage 6a: hex-tiled near, one wobbled read far; the start's shader watcher goes |
| 2026-11-18 | `325c6d0` | Stage 6a: `?truth` reads the ground as the picture does (draft PR #65) |
