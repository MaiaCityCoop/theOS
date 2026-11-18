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

## Where we left off (2026-11-18): read this first to take over

**Live on next (main `501aff5`; next deploys itself after every merge):**

| Stage | PR | What it did |
| --- | --- | --- |
| 1 | #61 | Clean ground: −1194 lines, 16 tuning switches gone |
| 2a | #62 | The gate (`tools/gate.js`, FLIP), `settle()`, `measure.js`, `?truth` |
| 10 | #63 | CI ships its build, and next deploys itself |
| 2b | #64 | Prepass, motion vectors (with wind), one 4K upscale |
| 6a | #65 | The ground from a layer map; shaders at start −39 % |
| 4 | #66 | Far trees as octahedral impostors and clump planes (no domes, no stipple) |
| 3 | #67 | One boot (`src/boot.js`); the library and Me compile 75–80 % less |
| 5 | #69 | Near trees as crowds of parts at their own size (`CARD`, `KMAX`, the stretched cards gone); one spread order, one wind; far-end bakes kept (warm start 1.1 s, was 37 s) |
| Occlusion culling | #68 | A depth pyramid and two-pass culling of every drawer's tiers: 2–67 % of main's things drawn, nothing visible lost (exact depth check; FLIP within main's noise from above) |
| 6b | #71 (draft) | The ground as one virtual texture (`src/terrain/pages.js`): pages laid once in compute, a BC atlas of 4096 pages in about 250 MB, asked for from the prepass, faded in. The land alone 2–6 × faster from above (13–14 ms against 47–76 on the shared GPU); the near ground as sharp as main's (its edges 100 % of main's, FLIP of the near-eye crop 0.071); a jump settles in 17–53 s against main's 6–9 |
| 8 | (PR) | Surfaces from their full mesh alone: one cluster hierarchy (meshoptimizer) for the rocks, the tent and the fire pit; a compute cut for what is large on screen; `reduce.js`, the rocks' ladder, the made things' hand-built levels and the solids' pixel bands deleted |

**In flight when this was written** (each on its own branch, as a PR or nearly):

| Stream | Branch | State | Before merging |
| --- | --- | --- | --- |
| Occlusion culling | `aven/0038-draw-occlusion`, PR #68 | CI green | Views from above draw only 2–8 % of main's things: prove with gate stills at `bench-river-bend-26m`, `bench-town-40m` and `bench-pine-forest-90m` that nothing visible is missing (FLIP within noise) |
| 5: crowds, near pines | `aven/0038-stage5-crowds`, PR #69 | CI green; report pending | Check the gate's near-pine stills against main and the truth (`scratchpad/visual/stage5/`) |
| 7: one placement rule, the forest in layers | `aven/0038-stage7-layers`, PR #73 (ready for review) | Built, merged with main (`314e2e6`), measured (under Build, Stage 7); CI green | The master's review; Samuel to judge the floor (pictures on `aven/0038-shots`, `stage7/`); the research's floor kinds and the site's species come after 8 and 9 |

**Not started:**
- **6c:** relief, meaning displacement near the eye, parallax further out, skirts for rocks, path decals. 6b's pages
  already carry each texel's height (their colour's fourth number). Also left from 6b: a jump's settling (17–53 s
  against main's 6–9; what bounds it is under 6b's Measured), and what is let go with distance taken by distance on
  grazing ground (at eye level the far bare patches go too near).
- **8b:** the stress world's zoo on the cluster hierarchy: its standing shapes built on demand, its creatures skinned
  (stage 8's notes say what it needs).
- **9:** one light: leaf shadows, Bend's screen-space shadows, the canopy map, GTAO, transmission, Hillaire's sky,
  froxel fog, sky probes. It is the biggest step towards the look target.

**Open risks:**
- **Safari:** mobile Safari loads, but its first start is slow (a later task, under Todo). Desktop Safari is still
  untested on every stage: Samuel is to open `/game/`, `/game/library.html` and `/game/me.html` on next in Safari.
- **The 12 ms / 60 fps gate is not met.** Bench views read 20–55 ms on the base M1, measured while the GPU was shared.
- Stage 4 left these:
  - **Impostor atlases:** still 417 MB. Stage 5 sizes each stand's views by where it hands over (64 to 128 texels),
    but today's plants all hand over as soon as their impostor is sharp, at 128; the trees' clumps grew 51 → 131 MB
    (256 chunks a shape).
  - **Bakes:** kept in IndexedDB by stage 5: a warm start reads every far end back in 1.1 s (main bakes again, 37 s);
    the first start still bakes (47 s).
  - **A faint speckle** mid-way through the hand-over: stage 5 cuts mesh and impostor by one noise changed every frame,
    for the TAA to average; not checked in motion (the walk and zoom paths were not run).
- Stage 5 left these:
  - **The crowds cost more.** A level's mesh holds what its band's top needs, and the crowd now thins between about
    390 and 130 px, so a grown oak's level 1 holds 51 k vertices (main 8 k) and the pine's 21 k (7 k). The bench read
    the stage slower at most views (tent 48 → 65 ms in one round, 45 in another: a shared GPU). A per-plant share of a
    level's draw in the drawer's packing, or the occlusion culling (#68), would take most of it back.
  - **Survivors still enlarge their painting**, uniformly, up to 3 times before the clumps take over.
  - **FLIP against main's truth rose** at every view (tent 0.061 → 0.104, 30 m 0.167 → 0.222): the finest level is
    laid from four sprays a plant and the meadow from an ordered dither, so the truth itself moved. Against its own
    truth the stage is nearer at 30 m (0.078) and farther at 10 m (0.076 against 0.056); its own truths at the tent
    and in the forest were lost to the device.
  - **The meadow's blades** are fewer and wider (halved, doubled) ring by ring: check them at eye level.

**How this work runs:**
- **Who:** since 2026-11-18 the master is the session on the Mac mini, whose GPU no one else shares: it gives out the
  tasks, reviews and merges. The MacBook's session is a worker, like the Mac mini's own task sessions. Each works in its
  own worktree on its own `aven/0038-…` branch, with its own dev server on its own port, runs
  `tools/gate.js --url http://127.0.0.1:… --fresh` against main and against the truth, and reports its PR to the
  master. On the Mac mini, GPU runs take turns through the lock `~/src/github/MaiaCityCoop/.gate-lock`.
- **Merging:** the master merges a PR when CI ("check") is green and its gate numbers and screenshots check out.
  Samuel authorised merging and deploying each stage without asking (2026-11-17), and gave that role to the Mac mini's
  master (2026-11-18). Workers open draft PRs, mark them ready, and never merge.
- **Screenshots:** labelled before/after images go to Samuel with every task that changes the picture.
- **Hygiene:** after a merge, remove the stage's worktree, its branch and its dev servers.


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

### Stage 3: one boot, and a stage that starts only what it shows (2026-11-18)

- Built on `aven/0038-stage3-boot` from main at `53a065c`, merged with main at `cc3aa70` (stage 4).
- **`src/boot.js({ profile })`** is the one start of every page that draws the world, with a `ready` promise (the
  page's first view complete: `src/core/settle.js`). It brings the virtual camera and the game's pill with it, so no
  page lists `cine/cine.js` and `cine/menu.js` before the world any more. The library and Me await it instead of
  polling `window.__game` every 50 ms.
  - **`world`** is today's game, the same parts in the same order: the game's page, the lens bench, a film's live
    world.
  - **`stage`** starts the sky, the weather, the light and its shadows, and the land round the stage (the terrain,
    drawn 6 km out, where it ends in the air). It does not start the city, the places, the lakes, the walker, the
    ground map or anything scattered.
  - **Its textures:** the land's materials are painted at the start (`bakeTextures({ first })`); a subject's when its
    shaders first ask for them.
  - **Its subjects:** `game.show(object)` compiles one aside (both passes and the shadow map, every level of it), and
    only then puts it in. `game.hide` takes it out again, or stops a show that is not in yet.
  - **What grows:** the ground map and the scatter start only for a subject that is the meadow itself (`game.grow`:
    the grass, a biome), in a group of their own, hidden again with the next subject. Hidden, what they have out
    holds nothing up (`partOf` and `leave` in `settle.js`).
  - Its `ready`: the first subject in, then settled.
- **`src/stage/studio.js`** is the stage's set-up that the library and Me had copied:
  - the stage's round and sandbox, moved here from the ground map (which now draws itself again when they change);
  - the studio light;
  - the camera circling the subject, the eased follow of a person, the close look with the lens stopped down, and the
    lineup seen square on.
  - It stands still while something waits for the world to settle (`settling()`): a stage that circles by itself
    never settles.
- **`src/library/`**: the library's inline module (385 lines) is now four modules: `index.js` (the page), `subjects.js`
  (what each kind of recipe stands on the stage, and its card), `pictures.js` and `card.js`. Its pictures come once
  the first view is complete. Each is compiled aside, in turn, with what its shaders ask of the textures painted
  first (`sceneThumb`).
- **Also:** the baker lets its painter go half a minute after its last paint, not 4 s: the library's pictures, which
  come after the first view, found its packing pass (53 KB) gone and compiled it again. A subject's 20 s to compile
  count from its compile's turn, not from the queue before it.
- **Deleted:** `src/main.js` (its 235 lines are boot's `world`), the library's inline module, Me's copied stage and
  its start of the whole world, the `window.__game` polling, the pages' script order, `ground.stage` and
  `ground.sandbox`, and the walker's readout and hint on the two stage pages. In the game: 906 lines added, 748
  deleted (+158), most of it the stage profile (show, hide, grow) and the studio.
- **Found:**
  - On main the library's and Me's camera circles by itself, so `settle()` never resolves there: the gate's
    `compile --page library.html` timed out after 300 s on main. The numbers for main below come from a probe with the
    gate's shader watcher that holds the film camera at the page's first view.
  - Under the world's walker, the library's 35 mm lens was overwritten every frame by the walker's own (`camera.fov`),
    so it showed the walker's wider view. The stage has no walker: the library and Me now look through the 35 mm they
    ask for, and the subject stands larger in the frame. The stage has no grass blades round its round, and its land
    ends 6 km out.
  - The gate counted the library writing its own address (`history.replaceState`) as the page loading again. It now
    counts loads.
- **Check 6, side by side** (main `cc3aa70` against the branch, the same probe by turns, fresh profiles, three rounds
  each). The machine was shared with other agents' runs, at load averages of 30 to 340, so the times are medians, with
  their range:

| | Library, main | Library, stage | Me, main | Me, stage |
| --- | --- | --- | --- | --- |
| WGSL compiled until settled | 244 modules, 3.20 MB | 74–76 modules, 0.78–0.80 MB | 231–234 modules, 3.15–3.21 MB | 57–58 modules, 0.63 MB |
| Compiled as first drawn (sync) | 43–44 | 20 | 34–37 | 18–20 |
| The first subject on the screen (the veil lifts) | 4.4 s (4.3–26.3) | 3.4 s (2.0–10.6) | 12.3 s (4.3–47.1) | 4.9 s (2.6–33.5) |
| The first view complete (`ready`) | 54 s (45–165) | 26 s (5.5–31.5) | 171 s (44–305) | 9.5 s (5.1–56.4) |

  - The gate's own `compile` on the branch: the library 74 modules, 0.78 MB, settled 20.8 s in; Me 58 modules,
    0.63 MB, settled 33.5 s in (load averages 20 to 32).
  - What a page compiles is now what it shows: the sky, the land and its layer map, the shadow map, the textures'
    painters and the land's materials, and the subject. The largest module is the layer map's pass (78 KB).
  - The library's `ready` above still waited for its pictures; they now wait for it. Measured so once (load average
    248): the subject on the screen at 5.3 s with 63 modules (0.70 MB) compiled, `ready` at 21.2 s, and 74 modules
    (0.78 MB) with the pictures.
- **The game's own start is unchanged:** the gate's `compile` gives 224 modules and 3,055,041 bytes of WGSL on main and
  on the branch alike (settled 112 and 248 s in, at load averages near 200: noise). The tent at eye level, 4K, fresh
  profiles: FLIP of main against the branch 0.0223 (p99 tile 0.0822), of main against main shot again 0.0224 (0.0823).
- **Not done:**
  - Safari can't be automated here: the library and Me are to be opened in Safari on next.
  - A subject's material that the land does not wear is painted when it is first asked for, its painter compiled as it
    is drawn (a few small programs a subject).
  - The stage's land is the world's terrain and layer map: all ten levels of the map are worked out, though the land
    is drawn only 6 km out.
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

### Stage 6b: the ground as one virtual texture (2026-11-18)

Built on `aven/0038-stage6b-avt` from main at `cc3aa70` (stages 1, 2a, 2b, 4, 6a, 10), merged with main at `501aff5`
(stage 3). After Ka Chen, *Adaptive Virtual Texture Rendering in Far Cry 4* (GDC 2015), and Etienne's Call of Duty
2023 terrain.

- **The virtual texture** (`src/terrain/pages.js`). The ground's material is laid once a page and kept; a pixel of the
  ground looks its page up and reads it once, then lights it.
  - **Levels and pages.** 17 levels, from 2 mm a texel (1/512 m) to 128 m. A page is 120 × 120 texels and a border of
    4 (its neighbours' texels, so it filters as one with them): one layer of 128² in an array. Each level is a window
    of 128 × 128 pages round the camera, a page's place in it its place on the land modulo 128: the endless land in
    rings of sectors.
  - **Laid in compute, once a page.** First the biomes' rules on the page's own grid, a point every 8 texels (the
    layer map, now the page's own, `layers.js layerWords`); then every texel as the fragment laid every pixel until
    now (up to five layers, hex-tiled inside the page at every distance, the carpet, the stands' colour), its slope from
    the land's height (`material.js laid`, `slopeAt`). A page has two mips: the second is the next level's texels where
    it lies, so the filter's step into it goes over into the parent page with no seam, in one read. What is let go
    with distance is let go as at the level's distance (its texel seen as one pixel of the 4K screen).
  - **The atlas.** BC3 (colour, gamma 2, and height), BC5 (relief), BC5 (the carpet's share, the stands' shade): 3
    bytes a texel, 4096 pages in two arrays of up to 2048 layers, about 250 MB (1792 in 107 MB at first: too few,
    below), packed by a compute pass with `bake.js`'s encoders (now shared: `steps`, `colours`) and copied into the
    layers. Without BC: rgba8, 640 pages, laid straight in. The roughness is not kept:
    nothing in the light reads it yet.
  - **The page table:** 17 × 128² entries of 32 bits (1.1 MB): the slot, in, faded, the frame it came.
- **Asked for, from the prepass.** The prepass writes, at every pixel of the land, the level it reads (as finely as the
  4K screen's pixels: its lens and the upscaler's finer reads counted) into the motion target's free fourth number.
  Right after the prepass (`screen.afterPrepass`) a compute pass takes one pixel in 8 × 8, another each frame (an
  ordered dither's order), finds its point from its depth through the camera as it drew, and writes the page it wants;
  read back a few frames later.
  - Parents first: a page and every page over it, the coarsest first; 48 pages a frame while the camera stands still,
    12 while it moves; the camera's speed: a page that would cross the screen faster than 12 pixels a frame waits, and
    its parent is laid.
  - What has not been asked for for 96 frames gives its slot up. The last level (15 km pages) is always in round the
    camera, 26 km: a pixel always has a page.
  - **Found:** a storage write in the land's colour shader cost it its early depth test, and the colour's equal test
    then missed pixels the prepass drew: pale holes all over the ground, along the 8 × 8 sweep. So the colour pass
    writes nothing but its colour, and the prepass carries the ask.
  - **Found:** three binds a texture once a shader, by its uuid, and a storage binding is one mip: a page's second mip
    went into its first (the ground darkened towards each level's far edge) until each store had a binding of its own.
- **Shown.** One look into the page table (walking up a level only where a page is not in yet) and one read of the
  page (its three textures). A page newly in fades in over 10 frames from the one under it (two reads while it
  fades), so a page never comes in at once.
- **The adaptive bias.** If what is asked for does not fit the atlas, every pixel asks a quarter level coarser, and
  finer again when there is room; a cut (the camera farther than twice its height in a frame) starts it from none.
  With 1792 pages the gate's views settled at a bias of 0.5–1.75 (texels 1.4–3 × a 4K pixel: near the eye the pebbles
  lost their edges, which blocked the merge). With 4096 it is 0 at the tent's eye level (1715 pages asked for) and from
  120 m (2800), 0.25–0.5 from 10 m above the tent (all of it the near ground's half level, below).
- **As sharp as main's near the eye.** A page is filtered as it is read, after the filtering its texels were laid
  with, and two filters blur more than one. So a page's texels read their materials half a mip finer (`material.js
  mipOf`), and within 15 m of the eye a pixel asks for its page half a level finer than its footprint (`pages.js
  biasAt`; none of it from 45 m); where the pages do not fit, the bias takes that half level back first. The asks and
  the read take the pixel's steps at the 4K screen's density (the upscaler's finer reads in them), the read 4 ×
  anisotropic with the pixel's own gradients scaled to the page. Edge energy in the near-eye crop (the tent at eye
  level, 1600 × 600 at 2000,1500): main 14.25, 6b 14.19, 100 % (91 % with 1792 pages, 96 % with 4096 before the near
  half level); the pebbles alone 13.56 against 13.51. FLIP of the crop against main 0.071 (p99 tile 0.144): grain and
  BC's blocks, not softness.
- **Found:** spared the bias, the near half level asked for about 4800 pages from 10 m above the tent, more than the
  atlas holds, and the view never settled (683 pages out after 300 s). And a pixel where no land was drawn kept its
  block's last ask, whose stamp came round as fresh every 31 frames: after a view from above, the next view's sky kept
  the last view's pages asked for (3460 at the tent's eye level, not 1715) and the bias high. Such a pixel now asks
  for nothing.
- **The light stays as it was.** What hangs on the pixel's own distance is worked out per pixel from the page's
  numbers: the near carpet's darkening in its blades' shade (from the carpet's share), the stands' floor shade past the
  shadow map (from their shade), the cavity, the snow.
- **Hand-overs by level.** What is let go with distance is let go as at the page's level. Along a grazing slope a
  pixel's level is coarser than its distance alone says (the filter's steps along the slope, four), so at eye level
  the far ground lets go nearer: the bare patches 100 m behind the tent are gone in the branch's still.
- **The layer map lives on the pages.** The camera's clipmap (10 × 512², 52 MB) and its toroidal updates are gone: a
  page's grid is the land's, not the camera's, so pages laid at different times meet without a seam, and a page laid
  for a longer lens has a finer map under it.
- **`scatter/ground.js` is not changed.** The layer map is no longer round the camera, and the blades' map needs what
  it does not hold (the cover over every biome, the grass's height, the stones, the dryness), for a pass drawn once
  every 16 m walked. Folding it in is no clean change; it reads the same land nodes as before.
- **Deleted:** the per-pixel laying (the land's fragment was 67 KB, now under the ten largest), the clipmap and its
  eight-tap read between its levels, the far read pushed about by a wave and the dithered hand-over to it,
  `did('land')`.
- **Not done:** Safari (it can't be automated here); BC on a GPU without it (rgba8, 640 pages, the bias higher).
- **Measured**, on a GPU shared with other sessions all day (load averages 50–250; the WebGPU device was lost several
  times, each such still taken again on a browser of its own).
  - **GPU ms**, drawn 2560 × 1440 into 3840 × 2160, one page at a time in alternating rounds, the GPU drained before
    each timed pass, the least of three rounds (main at `cc3aa70`; stage 3 changes neither the land nor its cost):

| View | Land alone, main → 6b | Whole frame, main → 6b |
| --- | --- | --- |
| Tent, eye level | 28.9 → 15.5 | 31.4 → 31.2 |
| River bend, 26 m | 47.2 → 13.9 | 54.0 → 21.1 |
| Town, 40 m | 46.9 → 13.2 | 48.1 → 16.5 |
| Skyline, 2.5 km | 76.2 → 13.7 | 73.6 → 14.2 |
| Pine forest, eye level | 75.1 → 13.9 | 93.5 → 32.7 |
| Pine forest, 90 m | 65.5 → 11.8 | 75.9 → 14.7 |

  - The shadow pass, the same code on both sides, also read slower in main's pages in every round (3.2–34 ms against
    0.4–1.8), whatever came first: so not all of the difference is the land's, and the absolute times are the shared
    GPU's. The land alone is faster at every view, and most from above.
  - **FLIP against main** (`501aff5`, after the merge; fresh profiles): tent eye 0.040 (p99 tile 0.137), river 26 m
    0.047 (0.130), town 40 m 0.053 (0.098), tent 10 m 0.095 (0.285), tent 30 m 0.073 (0.246), tent 120 m 0.059 (0.235).
    What differs: the ground about 1.4–2 × softer near the eye (the bias), the far grazing ground let go nearer, BC's
    blocks. No hole, no seam. Stage 6a against 2a read 0.05–0.08; the same code shot twice about 0.02. With 4096 pages
    (main at `3a2896a`): the near-eye crop 0.071 (above). The truths were
    not taken (the coordinator's call: tokens; and they kept losing the device).
  - **Pages in motion** (the gate's paths, the film camera, the pages watched frame by frame): the zoom (1.7 m to
    12 km in 20 s) ran 836 frames at a median of 16.7 ms (p99 33, worst 83) and laid 5736 pages, at most 20 in a
    frame, the asked-for and not yet in 0 at the median (473 at most), at most 124 fading in at once; the walk into the
    pines ran 1231 frames at 33 ms (p99 50, worst 100), 2304 pages, at most 12 a frame, 119 waiting at most. Every page
    comes in over 10 frames from its parent, so none comes in at once; the ground sharpens over a second or two after a
    stop, and steps of the bias (0.25 a step) refine it as a whole.
  - **Compiled at the start** (gate `compile`): main 224 modules, 3.06 MB; 6b 227 modules, 3.15 MB. The land's
    fragment fell out of the ten largest; the page's kernel (79 KB), the layer map's (78 KB, as the clipmap's was) and
    the packing (62 KB) are compute.
  - **Settle** at a view after a jump: with 1792 pages 14–159 s against main's 7–13 s (the bias's quarter steps). With
    4096, the gate's (a browser a view, main at `3a2896a`): main 5.5–9.1 s, 6b 27.6 (tent eye level), 32.7 (tent
    10 m), 67.9 (tent 120 m), 28.3 (town 40 m). With the fixes above, jumps in one browser at 15–26 frames a second:
    17–23 s in one run, 35 (eye level) and 53 (120 m) in another. What bounds it: every page laid starts settle's 105
    unchanged frames again, after the pages' own sweep (72 frames); one read-back is in flight at a time and its asks
    replace the last's, so pages few pixels ask for trickle in over hundreds of frames (about one a second from 120 m);
    and the bias steps a quarter level at a time, two sweeps apart going up and 240 frames coming down (the gate's
    jumps are eased, not a cut, so a view's bias carries over to the next). Hundreds of frames at 15–26 a second are
    20–50 s. To cut it (6c): the asks kept over a sweep, a read-back every frame, the bias's step chosen at once.
  - `bun tools/scale.js` 18 of 18; `bunx --bun vite build` passes (TheGame), after the merge with stage 3; the library's
    stage draws its land through the pages like the game's.
- **Left for 6c (relief):** the pages already carry each texel's height (A's fourth number). Displacement near the eye
  on a mesh built in compute, parallax further out (a few reads along the ray within the page), skirts that bed rocks
  in the soil, and path decals laid into the pages as they are laid. Also: a jump's settling (above); the far
  grazing hand-over (the level by distance for what is let go, apart from the level by the filter's footprint).
### Stage 5: crowds of parts, one spread order, one wind (2026-11-18)

- Built on `aven/0038-stage5-crowds` from main at `cc3aa70`, as a draft PR.
- **Parts** (`assets/kit/tree.js`). A recipe lays its plant out of parts, as Nanite's assemblies are: a sprig is a
  prototype (two crossed cards; a bush's base, its painting repeated, is a prototype of its own) laid by a rigid
  transform (its foot, its way and turn, its length), with a pivot (its tip, what it grows about) and a root (what it
  grows out of); a tube is a solid part with its foot. The finest level's sprays are made once a prototype (four sprays a
  plant, each sprig one of them turned its own way), not once a sprig, and laid at each sprig's transform. The crowd kit
  reads the parts as laid: the union-find over the triangles, the search for a sprig's root and tip and for a tube's
  foot by its rims, and the matching of sprigs in the index list are gone.
- **One spread order a shape**, as before (classes by size, each next sprig the farthest from all taken: blue noise), and
  the meadow's (below). **The rule** (`assets/kit/crowd.js`): the crowd thins by its order over SWELL = 3 times in size,
  to a ninth of its sprigs, those left growing uniformly about their tips, never more than 3 times; there the clumps
  take over. Where they take over is where their texels are `ERROR_PX` pixels drawn (32 texels over a chunk's largest
  side, at 4/3 pixels drawn a pixel of the measure: `src/detail/error.js`, plain, so the workers read it too), and where
  the crowd begins to thin follows from that: no number of its own. The clumps are as many chunks as cost no more than
  the sprigs left where the crowd ends (at most 256). A shape whose impostor is as fine there already has no clumps.
- **Deleted:** `CARD`, `KMAX`, `FAR` and CROWD's `ERROR`; the enlargement up to 4 times; the `hand` bits of the packing
  and the builder; `splayOf`'s search for sprigs; the kit's unread runs (`RUN`, `runCorners`), a vertex's class and
  `enlargedBy`.
- **Each plant its own offset:** its crowd and clumps reckon its size on screen a share of its own (0.72 to 1, by its
  seed: Lipp et al., HPG 2026), so no two plants of a stand change together (the impostor's own spread was there).
- **Grass, halved and doubled** (Ghost of Tsushima): each ring's blades are as many times wider as they are fewer
  (`widthOf`: the asset keeps only its nearest ring's width), and the last ring thins out towards its end by one spread
  order (a 4 × 4 ordered dither of its cells, `rankOf`), its blades widening up to 3 times, never lowering: the meadow
  keeps its height.
- **One wind** (`swayOf`): the cards, the clump planes and the impostor sway by the same `windAt`, the impostor's corners
  each as far as their height up the plant; the prepass writes the impostor's motion. A sprig's own swing fades out
  over the doubling of size before the clumps come, so nothing stops at a hand-over.
- **Bakes kept** (`src/scatter/trees.js` farOf): each shape's mipped views and clumps in IndexedDB (`src/core/kept.js`),
  under the drawer's fingerprint (the registry's versions of the stand's plants), their materials' versions, the sizes of
  the views and tiles and the bake's own version; read back as the finest blocks come, every shape at once.
- **The impostor's views sized** by where it takes over: from its clumps where they would draw their triangles smaller
  than a 2 × 2 quad over the plant's square (its views twice the root of those triangles a side, 64 to 128); from a
  crowd at its end (its last sprigs grown three times) as soon as it is sharp, at 128. A stand's atlas is as fine as its
  finest shape's; the clumps' atlas holds a layer only for a shape that has clumps, as many tiles a side as its stand's
  largest clumps need.
- **The speckle at the hand-over:** the mesh's and the impostor's pixels are cut by the screen's noise, changed every
  frame (`uDither`, a golden-ratio step), the same for both so each pixel is one of the two; the temporal pass averages
  it into a cross-fade, its motion vectors hold it where the plant moves. The clumps' own cover keeps its still
  texel-by-texel cut: cut by a noise of every frame it left a grey speckle that the temporal pass did not take in.
- **A tree's third level begins at 120 px** (`assets/kinds.js`, was 80): where a grown tree's crowd has thinned to its
  clumps, so that level holds them and the last of its sprigs, not a third of its crowd.
- **Measured** in headless Chrome on Samuel's Mac (4K screen, drawn 2560 × 1440), against main on a server of its own,
  fresh profiles. Other sessions' gates shared the GPU throughout, and the branch's truths at the tent and in the forest
  were lost to the device three times out of three.
  - **The near pines** (`scratchpad/visual/stage5/`): at the tent at eye level the near stone pine is its crowd of
    sprigs at their own size, as `?truth` draws it, where main drew a third of them enlarged one and a half to four
    times; the pine behind the tent is denser and its cards smaller; the shrubs are as main's.
  - **FLIP against `?truth`** (`?truth=300`: the 600 m truth lost the device), whole frame, mean:

| View | Main against its truth | Stage 5 against main's truth | Stage 5 against its own truth (1) |
| --- | --- | --- | --- |
| Tent, eye level | 0.0609 | 0.1044 | (lost) |
| Pine forest, eye level | 0.0808 | 0.1261 | (lost) |
| Pines from 10 m | 0.0558 | 0.1156 | 0.0757 |
| Pines from 30 m | 0.1666 | 0.2221 | 0.0784 |

    (1) the stage's truth before the meadow's change (its plants, main's grass). The two truths differ by 0.063 (10 m)
    and 0.183 (30 m) themselves: the finest level is laid from four sprays a plant now, so every twig lies elsewhere;
    and the meadow's ordered dither puts the near blades elsewhere (the tent's meadow alone: 0.038 against main's truth,
    0.139 for the stage). Against main's truth the stage is farther for that alone; against its own it is nearer at
    30 m (0.078 against 0.167) and farther at 10 m (0.076 against 0.056).
  - **GPU** (`gate.js bench`, the whole frame through the screen, ms; main then the stage in the same minutes, and the
    stage again an hour later):

| View | Main | Stage 5 | Stage 5, again |
| --- | --- | --- | --- |
| Tent, eye level | 48.4 | 64.5 | 44.7 |
| River bend, 26 m | 69.7 | 74.2 | 79.6 |
| Town, 40 m | 59.1 | 66.3 | 64.7 |
| Skyline, 2.5 km | 39.8 | 64.8 | 46.5 |
| Pine forest, eye level | 46.0 | 56.3 | 56.3 |
| Pine forest, 90 m | 41.3 | 46.6 | 82.8 |

    (main's half of the second round was lost to the device. Other sessions' gates shared the GPU: the same build read
    a third less at the tent and 78 % more at 90 m an hour apart, and the skyline, with no plant near, moved as much as
    the forest did, so these say little more than "not faster")

  - **Vertices a plant draws a level** (the heap's rooms, CPU), the grown stone pine and holm oak, levels 0 / 1 / 2 /
    3: main 40.1 k / 7.1 k / 1.9 k / 1.9 k and 86.2 k / 7.6 k / 2.5 k / 2.5 k; stage 5 40.1 k / 20.7 k / 6.6 k / 3.7 k
    and 86.2 k / 50.7 k / 14.5 k / 4.8 k. A level's mesh holds what its band's top needs: the crowd now thins between
    about 390 and 130 px where main thinned between 690 and 145 (the oak 1000 and 210), so level 1 holds three to seven
    times main's. The tree's third level now begins at 120 px, which took a third of it.
  - **Memory and the warm start** (a probe: `window.__memory()`, and the far ends' settle source, from the page's
    start; fresh profiles, the warm one the cold one's second start):

| | Main cold | Main warm | Stage 5 cold | Stage 5 warm |
| --- | --- | --- | --- | --- |
| Every far end in, from when they were asked for | 87.9 s | 36.8 s (baked again) | 46.9 s | **1.1 s** (read back) |
| The world ready (first view complete) | 199 s | 87 s | 113 s | 26 s |
| GPU ledger, all of it | 957 MB | | 1060 MB | |
| Impostors' views; clumps | 417; 51 MB | | 417; 131 MB | |

  - `bun tools/scale.js`: 18 of 18. `bunx --bun vite build`: TheGame and OS built. CI green on the merge.
### Draw path: two-pass occlusion culling (2026-11-18)

Built on `aven/0038-draw-occlusion` from main at `cc3aa70`, then merged with main at `501aff5` (stage 3), as draft PR
#68. It runs beside stage 5 and touches none of the crowds' files.

- **The depth pyramid** (`src/core/occlusion.js`). Once a frame, in compute, it is built from the prepass's depth.
  Level 0 has half the depth's pixels each way, and each texel holds the farthest of the four under it, up to one
  texel. It is one storage buffer, which works the same on every GPU.
- **Pass one**, before the prepass, takes every thing a tier has packed:
  - it drops whatever lies wholly outside this frame's view;
  - it tests the rest against the last frame's pyramid, through the last frame's camera;
  - what passes is drawn in the prepass and the colour pass, and the rest is held back.
- **Pass two**, after the prepass and the new pyramid, tests what was held back, through this frame's camera. What is
  now seen is drawn into the prepass after the rest, then in the colour pass with the rest. The late draw uses the
  tiers' meshes once more, starting where pass one's list ends (`indirect-first-instance`). Whatever this frame's
  depth does not hide is drawn in this frame, so nothing comes out from behind something late.
- **A thing's box** (`drawer.js` `kindBox`, `boundsOf`) is its kind's box at its size:
  - a solid kind's box is measured on every mesh of it as the recipes' worker makes it;
  - a made thing's box comes from its faces;
  - a plant's is its family's box over its height.
  The box grows by what may move the thing past it: its growth (a crowd's sprigs 0.3 of its size, a mover's limbs
  0.5), the wind's strongest push at its top now, and the snow.
- **The shadow map** and every other view draw all that was packed. Each draw has three sets of arguments: everything
  packed, what the eye sees, and what pass two found. Only the eye's two passes read a thing through the culled list
  (`passOf`).
- **Compaction:**
  - the packing (`tier.js`) takes one atomic per bucket per workgroup instead of one per thing; its 64 count theirs in
    shared memory first;
  - the culling passes take none. Each workgroup writes a 64-bit mask of what it keeps. One workgroup scans every
    chunk's count in shared memory; its loop bound is read-only storage, which Tint takes as uniform, so its barriers
    are allowed. Each chunk then writes where the scan says;
  - what is kept keeps the packing's order, so a still frame draws in the same order every frame. With atomics the
    order changed every frame, and things at exactly equal depth swapped.
  - No subgroups are used.
- **It covers** every drawer's tiers: the plants, the rocks, the placed things, the stress stand and the herds. It
  does not cover the shadow's stand-in, the grass (its own tiers, with no boxes) or the bodies' packing. On the stage
  profile, a tier is culled only while its meshes stand in the scene drawn. Without `indirect-first-instance`, or
  without WebGPU, nothing is culled.
- `tools/bench.js` now counts the compute passes in a frame's GPU time.
- **Found:**
  - three adds `if (instanceIndex >= count) return;` to a compute pass with no barrier, so a pass dispatched
    indirectly needs its count as large as it can be;
  - two dev servers can listen on one port, one on IPv4 and one on IPv6. Every reading here was taken through
    `127.0.0.1`;
  - the bench's Mac has 8 GB, with about 15% free under the other agents' runs. The WebGPU instance was lost several
    times, main's included, so every check below runs on the GPU and reads back only counters.
- **Checked, exactly.** The same camera was drawn culled (pass one against the frame before's pyramid) and not culled,
  with the jitter held, and the two prepass depths were compared pixel by pixel on the GPU. A pixel farther with
  culling would be something visible left out. None was, and none was nearer:
  - at the six bench views, 23 or 24 frames each with no wind;
  - at the pine forest and tent at eye level and the pines from 90 m, 30 frames each in a storm wind (1.0);
  - along the walk and the orbit, 241 frames each, wind 0.6;
  - on the stage profile (the library) with its growth shown, and again with it hidden, when nothing is culled.

| Instances drawn (still, 2560×1440 into 4K, no wind) | Packed (what main draws) | Drawn | Share |
| --- | --- | --- | --- |
| Tent, eye level | 89,593 | 60,192 | 67% |
| River bend, 26 m | 44,253 | 740 | 2% |
| Town, 40 m | 33,287 | 1,013 | 3% |
| Skyline, 2.5 km | 29,225 | 11,390 | 39% |
| Pine forest, eye level | 77,921 | 39,022 | 50% |
| Pine forest, 90 m | 23,308 | 1,781 | 8% |

  - In a storm wind the boxes grow: 45,846 drawn at the pine forest (59%) and 68,256 at the tent (76%).
  - Most of what goes is out of view (the packing's own test is a wide cone) or far: at the pine forest, the far end's
    level falls from 27,609 to 4,538, while the nearest levels keep almost all of theirs (86 → 82, 332 → 302).

- **What it costs.** Each part was run alone, the median of 30, on the shared GPU, where the whole frame's render
  passes took 119 ms at the pine forest and 69 ms at the tent; a quiet frame is about a quarter of that.

| Part (ms) | Pine forest, eye level | Tent, eye level |
| --- | --- | --- |
| GPU: the pyramid | 0.72 | 0.63 |
| GPU: pass one, every culled tier (test, scan, write) | 1.33 | 1.57 |
| GPU: pass two, every culled tier | 1.03 | 1.10 |
| GPU: every tier's packing, as when the camera moves (for scale) | 11.8 | 13.3 |
| CPU: pass one | 0.9 | 0.6 |
| CPU: the pyramid, pass two and the late prepass's draws | 4.6 | 3.7 |
| CPU: the whole frame | 18.0 | 13.7 |

  - Most of the GPU time is dispatches, not work: six a culled tier a frame, 16 to 19 tiers. One dispatch a pass for
    every tier would take most of it away.
- **GPU time.** Readings were taken side by side in one page, culling off and on, interleaved, at the bench's poses.
  The GPU was shared with other agents' runs, and frames took 66–115 ms. Off against on (median ms): tent 99.4 → 95.5,
  river bend 114.8 → 105.4, town 66.2 → 66.9, skyline 71.6 → 72.4, pine forest 68.0 → 68.5. The pines from 90 m
  were lost to the device. No gain shows above that noise. The plants were about 4 ms of a 30 ms frame in stage 4,
  and most of what is culled is cheap (far quads), so the gain to expect is about a millisecond.
- **FLIP against main** (fresh profiles, the six bench views, 4K; main shot twice for the floor):

| View | This branch against main, mean (p99 tile) | Main against main |
| --- | --- | --- |
| Tent, eye level | 0.0254 (0.088) | 0.0032 (0.006) |
| River bend, 26 m | 0.0181 (0.042) | 0.0151 (0.038) |
| Town, 40 m | 0.0248 (0.050) | 0.0231 (0.049) |
| Skyline, 2.5 km | 0.0070 (0.025) | 0.0139 (0.034) |
| Pine forest, eye level | 0.0050 (0.007) | 0.0201 (0.058) |
| Pine forest, 90 m | 0.0187 (0.066) | 0.0188 (0.066) |

  - Five views lie within the floor. The tent lies above it: its meadow's pixels differ by 1 to 4 of 255, as a fine
    speckle over every blade, and nothing is missing.
  - The grass is not culled, but its packing's compaction is new, so its blades are drawn in another order. Where two
    blades cross within a step of the depth, the last one drawn shows.
  - Main's own order is the same from run to run, which is why its two tent stills match to 0.003.
- **The gate's paths** (walk and orbit, cold and warm, on the shared GPU): medians of 67–133 ms a frame and GPU p99 of
  67–155 ms, so not met, as on main under this load. The peak memory was 4.94 GB (physical footprint), within 8 GB.
  It was not taken side by side with main.
- **Pictures** (main above, this branch below, labelled) of the pine forest and the tent at eye level, with a chart of
  the instances drawn per view: in the session's scratchpad, `visual/occlusion/`.
- **Not done:**
  - the culling's own cost is mostly dispatches: six a culled tier a frame. One dispatch a pass for every tier (their
    lists in one buffer) would take most of it away;
  - the late prepass costs 1.5–4 ms of CPU a frame (one draw for each mesh of every culled tier). A render bundle would
    record those draws once;
  - the grass is not culled: its tiers carry no boxes (`grass.js`, stage 5's). The packing's compaction could keep its
    order, as the culling's does;
  - a plant's box is its family's box with 0.3 for growth. A box measured on its meshes would cull more;
  - the gate's `bench` was not run apart (it would not compare under this load): the readings above are side by side in
    one page;
  - Safari has not been tried.

### Stage 7: one placement rule, the forest in layers (2026-11-18)

Built on `aven/0038-stage7-layers` from main at `3a2896a` (stage 5 merged), then merged with main at `d1c3805` (6b), as
draft PR #73. 6b's layer map lives on each page's grid now; the growth map is a map of its own.

- **The rule** (`src/scatter/rule.js`, after van Muijden's GPU placement in Horizon Zero Dawn, GDC 2017, and UE's PCG).
  It places everything the trees' engine places: a tree, a sapling, a bush, a fern, a log, a stone, a strewing of
  cones.
  - The density: ecotope × suitability × the influence of the larger things already placed × clumping.
    - **Ecotope:** the biome's share where it lies, times the kind's own `cover` (how much of the ground it covers where
      it grows best).
    - **Suitability:** `light` (how thick in deep shade and in the open), plus `shore` and `lakes` for the reeds.
    - **Influence:** the growth map's shade, foot and litter. `under` names whose litter a thing lies or comes up in.
    - **Clumping:** the biome's `groves`, at each layer's own scale.
  - It is discretised by **one ordered dither**: stage 5's `rankOf` (a 4 × 4 Bayer matrix and the cell's own number),
    moved into the rule; the meadow's thinning reads it from there. A thing stands where its cell's rank is under its
    density, so any density is a first share of the ranks, spread evenly; placing and thinning are one number.
  - **Layers are footprint classes**, a factor of four in reach, largest first. A layer's cell is as wide as one of its
    things covers where they are thickest. Its things stack their densities over the ranks, one thing a cell, so two
    never stand in each other. A biome's grown trees, and its bushes, share their density out by a slow noise (one kind
    leads here, another there, a third of it evenly), the same noise the land lays each tree's litter by.
  - **Young trees:** a tree with growth is placed twice, grown (as old as its biome's `age` says) and young (its
    `young`: its saplings, from its first stage to its second year, where light reaches its own kind's litter).
- **The growth map** (`src/scatter/growth.js`): what each layer leaves for the next.
  - A 1024² window of 2 m texels round the camera, kept like the layer map: only the strips it moves onto are worked
    out, on the GPU, a layer at a time, the largest first.
  - Each layer whose cells are a texel or more writes one word: its crowns' shade, its feet, its litter, and whose
    litter it is.
  - A word is worked out by gathering the layer's own cells round the texel, each placed by the rule (which reads the
    words before it). So no two things write one texel, nothing is kept of a placed thing, and the map is the same
    whatever path the camera took.
  - The tiers that read it pack again when it moves (`Tier.reads`); the engines that place the larger things are made
    first.
  - **The meadow is the smallest layer:** its blades thin by the light through the crowns and keep off the larger
    things' feet.
- **The layers and kinds** (`bun tools/layers.js` prints them):

| Layer | Cells | What stands in it |
| --- | --- | --- |
| Canopy | 9.9 m | Stone pine, holm oak |
| Understory | 2.5 m | Mastic, rockrose, bracken; young stone pines and holm oaks; dead wood, **fallen logs**, **bedded stones**; the riverbank's reeds |
| Floor | 0.62 m | **Pine litter** (cones, twigs, needle tufts), **oak litter** (fallen sprigs, acorns), moss cushions, **ferns**, **woodland herbs** |

  - The new kinds (bold) are recipes of a new floor kit (`assets/kit/floor.js`: `fallen`, `strewn`, `bedded`) and of
    the tree kit's `mound`. Their species are their parameters (the generic Mediterranean forms until the site's are
    chosen). The dead wood's branch is the kit's `fallen` now.
  - Two new kinds in `assets/kinds.js`: `litter` and `herb`, two mesh levels, no far end.
  - **A plant's levels and far ends are its kind's** (`far` in `kinds.js`; the tree kit reads it), and its patches are
    the drawer's. No new asset file holds detail data, and the old plant files lost their `levels` and `far`.
  - The moss cushion was drawn as a clump's plane (part 2) and so never showed; it is one solid piece now, its skin the
    moss.
- **Deleted:**
  - the biomes' stands (`trees`, `shrubs`, `litter`, `reeds`): their cells, densities, clumps, patches, seeds, sizes
    and `where`;
  - the pine forest's `fields` and `gladeAt`;
  - `src/world/stand.js` (`kindsOf`, `whereOf`), `standOf`, the kinds' `share`, `stand` and `where`;
  - the stands' sizes told to the workers (`STANDS`, `ownTop`, the workers' `stands` message);
  - `clearAt` and `rankOf`, each moved into the rule.
- **The gate:** `--query` adds to every page's address (`--query stress`).
- **Found:** the growth map was first keyed on the ground map's version, which ticks every frame of the meadow map's
  fade, so the whole map was worked out again in those frames: the first bench read 124–273 ms a view. It is keyed on
  the sandbox and the stage now.
- **Measured** in headless Chrome on the MacBook: a 4K screen drawn at 2560 × 1440, against main on a server of its own,
  fresh profiles. The GPU was shared with the stage 8 and 9 workers' gates throughout.
  - **Pictures** (main above, the branch below): `stage7/` on the never-merged branch `aven/0038-shots`, linked on
    PR #73.
    - Under the crowns the floor is litter, ferns, herbs, moss, logs and stones, where main's is a meadow. The grass
      stays in the glades.
    - The trees stand elsewhere: the canopy's cells are the rule's (9.9 m), not the old stand's (10 m).
  - **FLIP against main: not a gate** (Samuel, 2026-11-18: main is no reference; the gates are the branch's own `?truth`, the photos, no pop in motion and the budgets, measured on the Mac mini) (`d1c3805`, the same game as `314e2e6`), the branch merged with 6b, mean (p99 tile):

| View | FLIP against main (not a gate) |
| --- | --- |
| Tent, eye level | 0.095 (0.90) |
| Pine forest, eye level | 0.393 (0.93) |
| Pines from 10 m | 0.427 (0.83) |
| Pines from 30 m | not settled: 6b, fixed in 6c (main's pages still out after 300 s) |

    The forest is placed anew and grows a floor, so this measures the change, not an error. The tent's p99 tile is
    the trees and shrubs behind it, standing elsewhere.
  - **Against the truth: not measured: ?truth black since 6b.** Under the truth's jitter the pages never settle, main's
    too; the fix comes from the Mac mini. Before 6b the branch's own truth was taken at all four views, but its stills
    were lost to a dev server busy with a build.
  - **Borderline:**
    - the tent's view changes behind the tent, not at it;
    - the pines from 30 m are unmeasured;
    - the meadow's blades under the crowns are gone, which Samuel should judge at eye level.
  - **Memory:** the whole browser's peak over the walk was 5.36 GB on main and 5.76 GB on the branch (+0.40 GB), within
    8 GB. That was taken before 6b, on the shared GPU. The growth map itself is 8 MB.
  - **Timings are left to the Mac mini's unshared GPU:** the bench, the walk and the stress world's walk. Here the
    stress world's start was not settled: 6b, fixed in 6c (on main and on the branch).
  - `bun tools/scale.js`: 24 of 24 (the six new kinds among them). `bunx --bun vite build`: built. CI green.
- **Lines:** +831 −331 in the game (net +500): the rule and the growth map +212 net in the engine, the six kinds,
  the floor kit and their registry rows +313.
- **Not done:**
  - the research's floor kinds (`research_notes/0038-species-and-references.md`) wait for stages 8 and 9, as the
    master said; the kinds here are generic forms whose species are their parameters;
  - the rocks' engine (`src/scatter/rocks.js`) still places by its own cells; it could call the rule;
  - slope is not yet in the rule's suitability;
  - the growth map is worked out again whole only when the sandbox or the stage moves, not when lakes arrive;
  - a layer of 2.5 m cells holds the saplings and the bushes, a drawer each per kind of levels: 5 drawers, where there
    were 4; the culling's dispatches grow with them;
  - the floor's litter is crossed cards, so a fallen sprig stands a little off the ground;
  - Safari not tried.

### Draw path: one culling for every tier, the late prepass one bundle, the grass culled, plants' boxes measured (2026-11-18)

Built on `aven/0038-draw-path-culling-befaf1` from main at `5c591fd` on the Mac mini, merged with main at `5be13a8`
(stage 7), `3d0c3b5` (stage 8) and `ecc80f2` (the bench by its passes), as PR #77: the follow-ups listed under "Not done" above. It touches the culling
(`src/core/occlusion.js`), the tiers (`tier.js`), the drawer's boxes, the grass's tiers, the plants' packing, the
device's limits (`src/boot.js`, `src/core/gpu.js`); nothing of the cut (stage 8) or the light (stage 9).

- **One culling for every tier** (`src/core/occlusion.js`). Every culled tier's things' boxes and what the passes keep
  of them lie in one set of buffers, an *arena*: each tier a range of it, each of its draws (a bucket) a range of that,
  each bucket's numbers (its first thing, its room, its tier, its first chunks, what each pass keeps) in one table. A
  frame dispatches seven passes however many tiers there are: pass one is a scan of the buckets (their first chunks,
  from what each holds this frame: none for a tier not drawn), the test, the scan of the chunks and the write; pass two
  the test, the scan and the write. A workgroup finds its bucket by halving over the buckets' first chunks. It was six
  a tier, for 26 tiers: 156 of a frame's 254 dispatches at the tent; with stage 7's layers there are 33.
  - **The boxes** are worked out as a tier packs, not as it is culled: the packing's last pass, in a culled tier's own
    form, writes each draw's count into the arena with how many the draws before it hold, and a pass dispatched over
    what was packed alone writes each thing's box. The test reads only the arena: it binds no tier's packing, so one
    pass tests them all.
  - **A box is 16 bytes**, one `uvec4` a thing: its middle's x and z as 32-bit floats (they are world metres in the
    thousands, where a half float's step is a metre or more), its height and its sway (how far the wind may push it, a
    metre a unit of the wind's strength) as two half floats, half its width and half its height as two half floats.
    Every box is as wide as it is deep (a kind's reach round its foot; a blade's bend in any direction), so one number
    serves both. The halves are rounded up, never down, and the height's rounding (a 2048th of it) is added to the half
    height, so a box is never smaller than the thing. The culling reckons the sway with the wind as it blows now, and
    the snow lying, so nothing is packed again when the wind rises. One read a box: the test is bound by its reads, and
    16 bytes is one of them; 32 were two, and twice the memory.
  - **Every GPU resource and dispatch is sized from the adapter's own limits, by design.** The device is made with its
    adapter's own `maxBufferSize` and `maxStorageBufferBindingSize` (`src/boot.js`; unasked a device gives 256 and
    128 MB). An arena holds at most what one binding of its boxes allows: a tier that would overflow it makes it as it
    is and opens the next (seven passes more); a tier too large for one alone is drawn whole. Every buffer made
    through `src/core/gpu.js` is held to the limits, an error by name where one would not fit, never a buffer the GPU
    refuses frame after frame. Every culling dispatch, and each tier's box pass, is laid out in two dimensions within
    `maxComputeWorkgroupsPerDimension`, its true count kept beside it for the scans, a workgroup past it writing
    nothing: an indirect dispatch past that limit is silently no dispatch at all. Both were found at the final gate.
    With stage 7's layers the arena's boxes came to 172 MB at 32 bytes a box, over the 128 MB of a binding a device
    gives unasked, and the culling failed every frame (the arena now holds 5.4 million things' room in 86 MB). Under
    `?truth` more than 65,535 workgroups' worth of things is packed (the near meadow alone to 88 m is two million
    blades), so pass one did not run, its scan read stale chunks, the lists changed every frame and the truth never
    came to rest.
  - **The truth draws all that is visible.** `?truth` culls as the game does: what this frame's own depth hides adds
    nothing to any pixel, which culling on against off, within the floor at every bench view (below), shows.
  - **The eye's draw arguments** (what pass one keeps, then pass two's after them; pass two's alone, for its prepass)
    lie in the arena too, ten numbers a bucket. A tier's own buffer keeps only what it packed, which stage 8's cut reads
    as it was. A draw's length goes into every set of its arguments by one call (`Tier.setLength`).
  - **Only the prepass and the colour** read a thing through the culled list, by name: stage 9's `shadow` pass reads
    the packing as it is, as every other pass does.
- **The late prepass is one render bundle** (`THREE.BundleGroup`), recorded again only when what it holds changes (a
  draw shown or hidden, a draw's corners). three still brings its draws' numbers up to date every frame (its node
  materials always are), so it saves the encoding, the scene's walk and the pipelines' lookups, not the uniforms.
- **The grass is culled** (`grass.js`): a blade's box from its foot up its height, out as far as it bends (bowed
  deepest under snow) and its widest; the wind leans its tip its height a unit of the wind's push.
- **Plants' boxes are measured on their meshes** (`assets/kit/plant.js` packPlant): every vertex where it stands and
  what it grows from, and a card's enlarged about its tip as far as the crowd's rule lets it (SWELL), its root's too.
  The drawer takes a mesh's box in its kind's sizes and as far as it leans (`trees.js` boxOf), grows the kind's box by
  every mesh that comes, and a kind is never hidden before its first has come. The family's box over the height and
  the 0.3 of its size for growth are gone for plants (0.05 left, as for made things). The plants' recipes' versions
  moved with the kit (`registry.json`), so a warm profile bakes the far ends once more.
- **Characters on skeletons** (Settler, Me) are not culled, as before.
- **Found, a bench artifact:** `tools/bench.js` draws its frames with the lens factor 1. Where the gate's camera left
  the ground's map at another step, the map fades to the new one over 36 frames and its version goes up in each, and
  every tier's packing key begins with it: at `pine forest, 90 m` and `town, 40 m` about 20 tiers pack again in every
  one of those frames (8–9 ms of compute), and the gate's bench (1 + 60 frames) times them. Its fix is a follow-up.
- **Measured** on the final code (`2fdfae0` for the pictures, `5447dd1` for the costs: the normal game's dispatches
  are all under the per-dimension limit, so 2fdfae0 changes nothing of its path) on the Mac mini, headless Chrome, a 4K screen
  drawn at 2560 × 1440, fresh profiles, the branch on a server of its own (`127.0.0.1`), each run in its turn of the
  master's queue on the shared GPU. Main is no reference (Samuel, 2026-11-18): the branch is judged on its own.
  - **Culling changes nothing visible.** In one page (the gate's stills: clock held, governor held), each bench view
    shot with culling on, with it off (`__occlusion.mode = 0`: everything packed drawn), and on again (the floor).
    FLIP, the whole frame, mean (p99 of its 32-pixel tiles):

| View | Culling off against on | On against on again (the floor) | Drawn of what is packed (grass included) |
| --- | --- | --- | --- |
| Tent, eye level | 0.0248 (0.073) | 0.0221 (0.068) | 156,344 of 213,140 (73 %) |
| River bend, 26 m | 0.0179 (0.038) | 0.0176 (0.038) | 50,438 of 146,846 (34 %) |
| Town, 40 m | 0.0192 (0.037) | 0.0225 (0.043) | 49,730 of 132,155 (38 %) |
| Skyline, 2.5 km | 0.0099 (0.023) | 0.0111 (0.026) | 20,971 of 62,666 (33 %) |
| Pine forest, eye level | 0.0222 (0.067) | 0.0191 (0.052) | 16,877 of 45,820 (37 %) |
| Pine forest, 90 m | 0.0157 (0.060) | 0.0195 (0.080) | 6,773 of 50,848 (13 %) |

    Four views lie under the floor; the tent and the pine forest at eye level lie 0.003 over it, as much as the floor
    itself moves from one run to the next (the run before, on `5447dd1`: floors 0.0255 and 0.0206, culling off against
    on 0.0264 and 0.0208). The heat maps are the floor's own pattern (the crowns' hand-over speckle, the meadow's
    blades drawn in another order, the land's texels) and nothing is missing (the pine forest's worst tiles are bare
    ground in both). Off above, on below, labelled, on `5447dd1`: `aven/0038-shots`, `cull/`.
  - **FLIP against its own `?truth`: not measured.** `?truth` did not settle at the start within the gate's 300 s in
    three runs (`5447dd1`, the truth unculled; `ab99e49` and `2fdfae0`, culled, the last with every dispatch within the
    limit). The one truth that settled (`7c8a1f6`) did so because its culling had failed and the eye drew none of the
    tiers. Whether main's truth with stages 7 and 8 settles on this GPU in 300 s is not measured either: for the
    integration train.
  - **What each pass costs, standing still** (a probe of each part, 40 frames drawn first, medians of 40; ms; GPU by
    timestamps, CPU by the page's clock, its 0.1 ms grain). In the bench's per-pass names (`tools/bench.js`, #83):
    `occlusion` is pass one, `prepass, late` the pyramid, pass two and the late prepass's draw:

| View | GPU: frame | GPU: culling, all | pyramid (12 dispatches) | pass one (4) | pass two (3) | late prepass draw | CPU: frame | CPU: late prepass (its bundle) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tent, eye level | 16.2 | 0.91 | 0.48 | 0.29 | 0.13 | 0.05 | 5.8 | 0.9 (0.8) |
| River bend, 26 m | 11.8 | 0.28 | 0.18 | 0.08 | 0.02 | 0.03 | 4.5 | 0.6 (0.6) |
| Town, 40 m | 11.7 | 0.41 | 0.18 | 0.21 | 0.02 | 0.03 | 4.7 | 0.7 (0.6) |
| Skyline, 2.5 km | 9.2 | 0.23 | 0.18 | 0.04 | 0.01 | 0.02 | 1.5 | 0.3 (0.2) |
| Pine forest, eye level | 27.5 | 0.83 | 0.36 | 0.34 | 0.10 | 0.05 | 7.3 | 1.1 (1.0) |
| Pine forest, 90 m | 12.0 | 0.33 | 0.19 | 0.12 | 0.02 | 0.03 | 4.0 | 0.6 (0.5) |

    20 compute dispatches a frame in all. Pass one's CPU is under the probe's grain. The pyramid is the largest part of
    the culling's GPU time. The frame against the hard gate's 12 ms: within it at the river bend, the town, the skyline
    and 90 m standing still, over it at the tent (16.2) and in the pine forest (27.5, its render passes 26.5).
  - **The paths** (`gate.js paths --paths walk,orbit --fresh`, the governor running):

| Path | Cache | Frames | Over 16.7 ms | GPU median | GPU p99 | Over 12 ms of GPU | Memory |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Walk | cold | 2001 | 478 | 20.3 | 34.0 | 2002 | 4.57 GB |
| Walk | warm | 1896 | 582 | | 28.7 | 1897 | 3.61 GB |
| Orbit | cold | 1115 | 85 | 16.2 | 29.7 | 1101 | 4.57 GB |
| Orbit | warm | 1113 | 87 | | 31.1 | 1098 | 3.51 GB |

    60 fps and 12 ms of GPU are not met; the whole browser's peak, 5.31 GB, is within 8 GB. (The paths before the
    arena's fix read lower: its culling failed and drew none of the tiers.)
  - **The bench** (`gate.js bench`, before the merges, `3c821b1`): tent 17.3, river bend 13.2, town 15.0, skyline
    13.4, pine forest at eye level 31.7, from 90 m 15.4 ms of GPU, the town and 90 m with the ground map's fade in. The
    frames above are the bench's poses on the final code, standing still past the fade.
  - `bun tools/scale.js`: 24 of 24. `bunx --bun vite build`: TheGame and OS built.
- **Not done:**
  - FLIP against its own `?truth` (above), with whatever lets the truth settle;
  - the pyramid in one or two dispatches (a single-pass downsampler), now the larger part of the culling's GPU time;
  - the bench's lens and the ground map's fade (above);
  - the meadow's blades are still packed in an order that changes from run to run (the packing's atomics): the culling
    keeps whatever order the packing left;
  - Safari has not been tried.

### Stage 8: surfaces, one cluster hierarchy from the full mesh alone (2026-11-18)

Built on `aven/0038-stage8-surfaces` from main at `3a2896a`, merged with main at `d1c3805` (6b) and `314e2e6`.

- **The Safari check came first** (`tools/gate/cut.html`, `tools/gate/cut.js`): 4096 clusters tested by the cut's rule in
  a compute pass, counted with 32-bit atomics, listed, and drawn by one indirect draw through the hardware rasteriser; the
  picture read back against the rule in JS. In Playwright's WebKit (the engine of Safari) and in Chrome both drew the
  2529 clusters asked for, none wrong, none missing. Neither offers 64-bit atomics, and nothing asks for them.
- **The builder** (`assets/kit/clusters.js`, meshoptimizer 1.3, MIT, in the recipes' workers only: the page never loads
  it). From a thing's full mesh alone, as `clusterlod.h` does: clusters of at most 128 triangles; about eight grouped
  afresh at every level; each group simplified to half with every vertex it shares with another group locked; normals
  (weight 0.02 of the thing's size) and colours or shade weighed in the error, permissive across hard edges, a
  material's or colour's edge protected; cut into clusters again; a tail of halvings under the last. Each group's error
  is the simplifier's, never less than the farthest its lost vertices lie from what it is made into (measured: the
  simplifier's word misses a small piece folded away whole), and never less than `BAND` = 1.5 times its children's;
  each sphere holds its children's exactly. Each lost vertex keeps its place, normal and colour on its parent's
  surface (the morph). **Thin and small loose parts** (a guy rope, a peg, a lantern: 12 triangles or fewer, or eight
  times longer than wide) are held whole, their vertices locked, until the error the group is allowed reaches their own
  reach (how far their farthest point lies from their middle); then they go whole, shrinking to their middle.
  **Made things are welded first**: a vertex where place, normal, colour and material are alike.
  - The boulder (110 592 triangles): 1838 clusters, 221 038 triangles in all, 0.7 to 2.5 s on one thread (a shared
    machine), sound (every error monotone, every sphere held), no open edge at any cut. The tent (1424 faces): 33
    clusters; the fire pit (13 263): 270; closed away from their own borders.
  - Kept in IndexedDB by the drawers' fingerprints (the registry's versions; `made 4`, `clusters 1`).
- **The levels** (`src/detail/error.js`, `assets/kit/surface.js`): a surface's levels only share the work out; what is
  drawn is the rule, cluster by cluster. Level 0 holds every cluster a thing at the eye may need and is drawn by the
  cut; level `l` from 1 holds the clusters any size from half its largest to its largest may need (errors
  `surfaceBand(l)`), down to 1.5 px in nine levels. A level holds its error range in its header and its clusters'
  numbers (first corner, triangles, their way's range, own and parent error and sphere); its corners name their
  cluster in their top 16 bits. Two levels meet where both hold the whole cut that size asks for, turned as far:
  a thing passed from one to the next shows no change. A level that would overfill its room is cut down (its fine end
  coarser, or level 0's coarse end finer: never a hole) and counted (`trimmed`); no shape today needs it.
- **The cut** (`src/scatter/cut.js`): a cluster is drawn where its own error is at most `ERROR_PX` over the pixels drawn
  a unit of the thing covers (`BUDGET_DRAWN`) and its parent's is over it; it turns into its parent while the parent's
  falls from `BAND` times that to it.
  - **Small things** take a level chosen in the tier's existing packing (`tierAll`), the rule run in the vertex stage
    by the thing's own distance.
  - **Things 256 px drawn or larger** (level 0) are tested cluster by cluster in a compute pass, each by its own
    sphere's distance, blended in from the thing's own as it grows from 256 to 512 px (so at 256 px the two ways
    choose alike): one workgroup row a thing, a thread a cluster, a list with 32-bit atomics, one indirect draw, a
    cluster an instance, drawn by the drawer's own material (prepass, motion, shadows). A made thing is small enough
    (at most 26 k triangles in all) that its level 0 runs the same rule in the vertex stage.
  - **Changes are geometric**: every vertex moves to its place on its parent before the parent is drawn; a level that
    comes late refines from what its coarser level showed over 1.5 s; the prepass's motion reads the morph a frame ago.
  - The rocks' tier keeps its packing and culling; level 0's bucket holds the things the cut draws.
- **Deleted:** `assets/kit/reduce.js` (198 lines); the rocks' `detail: { ladder }`; the tent's and fire pit's
  `detail.levels` and the code that built their coarser shapes (the bare tent, the closed cone, the door panels only
  those drew; the fire pit's level options); the kinds' pixel bands for solids (`shelter`, `default`); the rocks' use of
  the ladder (`rocks.js`, `rock.js`) and of `DELTA`. Solid recipes declare only full detail (`faces`, or the rock kit's
  mesh). `ladder.js` stays for the stress world's zoo until 8b (below).
- **Not switched: the stress world's standing shapes** (`assets/zoo/blobs.js`, 8000 kinds of 50 000 to 200 000
  triangles). Their coarse levels are every kind's own and come from the recipe; a hierarchy needs each kind's full mesh
  built first, 0.7 to 2.5 s a kind: three to six hours of a worker for 8000. They need what 8b needs (below).
- **What 8b needs** (the zoo's standing shapes and its creatures):
  - build on demand: a kind's hierarchy only when it comes near (the drawer's streamed level 0), its coarse levels the
    recipe's stand-in until then, the step from one to the other grown in (the cut's refinement over 1.5 s, from the
    stand-in's error);
  - skinned meshes: the builder keeps every vertex it keeps whole, so its two bones and weight travel with it (pass
    them as `attr` weighed in the error, so no collapse crosses two bones' regions); build on the rest pose; grow each
    cluster's sphere, and its error, by how far its bones carry it (a stride's reach: `herdRooms`), so the cut stays
    conservative under the skeleton's range of motion (UE 5.7 Nanite skinning does the same);
  - the cut's list for many kinds at once: a dispatch per drawer, not per tier (the Mac mini's Task B).

- **Measured** (not a gate where against main: Samuel, 2026-11-18; headless Chrome on Samuel's MacBook, against main on a server of its own, fresh profiles; the machine
  was shared with other agents throughout, at load averages of 50 to 180, and restarted once):
  - **The pop check** (`tools/gate/pop.js`): each thing walked from just off its middle to about a pixel, 1 % nearer a
    step (the fire pit and the boulder 2 %, every fourth and eighth triangle's corners), the rule reckoned as the GPU
    does it; the farthest any point of what is drawn moves off the surface drawn a step before, in pixels drawn:

| Thing | Largest jump, morph | 99th percentile, morph | Largest jump, swapped at once | 99th percentile, swapped |
| --- | --- | --- | --- | --- |
| Bell tent (694 steps) | 0.61 px (at 37 px on screen) | 0.048 | 1.01 px | 0.000 |
| Fire pit (348 steps of 2 %) | 0.63 px (at 6 px) | 0.35 | 1.20 px (at 701 px) | 1.06 |
| Boulder (348 steps of 2 %) | 0.14 px (at 318 px) | 0.11 | 1.14 px (at 648 px) | 1.00 |

    No step moves anything a pixel or more: swapped at once, the clusters' changes stand at the error allowed (about a
    pixel), and the morph takes them to between an eighth and three fifths of that, spread over the steps. A step of 2 %
    is a fast zoom (at 60 frames a second, from 1.7 m to 12 km in about seven seconds).
  - **Triangles drawn, against main: not a gate** (Samuel, 2026-11-18: main is no reference) (`pop.js --at`, the rule's own count; main's from its levels and its kinds' pixel bands, seen
    from the gate's views):

| Thing, view | Main | Stage 8 |
| --- | --- | --- |
| Fire pit, from the tent's bench (7.4 m, 480 px) | 13 263 (level 0) | 7 304 (level 0, by cluster) |
| Fire pit, tent 30 m (23 m, 152 px) | 6 648 | 2 797 |
| Fire pit, tent 120 m (113 m, 31 px) | 2 130 | 1 225 |
| Bell tent, 3 to 30 m (233 to 2335 px) | 1 424 | 1 424 |
| Bell tent, 120 m (58 px) | 308 (its hand-built second level: 16 panels, no inside) | 1 066 |
| Boulder of 3.3 m at 6 m (445 px) | 110 592 (its full mesh) | 27 762 |
| The same at 30 m (89 px) | 3 072 | 1 940 |
| The same at 100 m (27 px) | 192 | 428 |

    The fire pit draws 42–58 % fewer triangles; the boulder at the eye a quarter of main's. Borderline: the tent far
    off and the boulder under 30 px draw more than main's hand-made levels did, because the hierarchy keeps what the
    error says is still there (the tent's inside and ropes, held whole until their own reach is allowed; the flat-shaded
    canvas, whose panels' hard edges hold the simplifier at about 320 triangles). Both are a few hundred triangles a
    thing.
  - **Memory** (by the levels' rooms): the rocks' heap 32 → 56 MB (level 0's six slots hold every cluster a near shape
    needs, about twice its full mesh; the other levels every shape's own), the made things' 1.3 → 10.5 MB (every level
    a kind's whole hierarchy's room), the cut's lists 2 MB.
  - **The first start** builds every rock shape's hierarchy in the workers: the rocks' coarse levels came 31 to 63 s
    after the start (24 shapes, 0.7–2.5 s each, three workers, the machine shared), the made things' behind them. They
    are kept in IndexedDB, so a second start reads them back.
  - `bun tools/scale.js`: 18 of 18. `bun tools/account-check.js`: 67 passed. `bunx --bun vite build`: built.

  - **FLIP against `?truth`: not measured yet; to be measured on the Mac mini**, on its own GPU. This MacBook's GPU was
    shared and froze, so its runs were stopped. Here, the branch's stills settled at `bench-tent-eye-level`, `tent-10m`,
    `tent-30m` and `tent-120m` (171.8, 110.5, 126.0 and 53.5 s), and main's at `firepit-3m`, `boulder-6m` and
    `boulder-30m`. Not measured here:
    - main's tent views did not settle within 300 s, with one of the land's pages still out (6b's settling, fixed in 6c);
    - `?truth` drew black before #79;
    - the branch's own close views lost the WebGPU device, and so did the truth retried after #79, on the shared GPU.

### The bench, pass by pass, on main (2026-11-18)

Built on `aven/0038-bench-per-pass` from main at `3d0c3b5`: stage 9's `cf77e71` ("the bench times each pass on its
own") ported to main's passes, since it does not cherry-pick (it was written on stage 9's light). It is there so that
per-pass GPU ceilings can be a merge rule.

- `src/core/gpu.js` `mark(name)` / `listen(fn)`; nothing listens in the game. The screen marks its passes (`occlusion`,
  `prepass`, `prepass, late`, each after-prepass part by its name: `pages`, `colour`, `lens`, `upscale`: stage 9's
  lines as they are); the bench's frame marks what comes before it (`ground map`, `pages, laid`, `packing`, `clouds`,
  `shadow map`).
- `tools/bench.js` reads three's query sets itself: every pass's begin and end under its mark, in the real frame, with
  the game held. Each pass is in one of four parts (`CLASSES`), the classes of the ceilings this is for (geometry about
  5 ms, light 3, ground 1.5, upscale and post 1.5, and 1 of slack: 12):
  - **geometry**: packing, occlusion, prepass, prepass late, colour;
  - **light**: clouds, shadow map;
  - **ground**: ground map, pages laid, pages (asked for);
  - **upscale/post**: lens, upscale;
  - **other**, the slack: whatever no part names.
- `tools/gate.js bench` prints per view `passes` (each pass's own time added) and `span` (first begin to last end), then
  each part's sum with its passes under it, in ms a frame, a view a column (in brackets, the ms in a frame it is drawn
  in, for what is drawn in turn). Then the colour pass with its shadow reads and without. `.gate/bench.json` keeps
  `passes`, `classes`, `span` and `shading` per view. Chrome gets `--enable-webgpu-developer-features`.
- Stage 9's own passes (the cascades, canopy, probes, air, froxels, GTAO, contact) are not on main. Stage 9 marks them,
  and names them in `CLASSES`, when it merges main; until then they would show under other.
- **Not measured here: to be measured on the Mac mini** (`bun tools/gate.js bench`; no GPU work on this MacBook).
  Checked on the CPU: `bench()` and the gate's table against a mock of three's query sets (each pass under its mark,
  what is drawn in turn, the parts adding up to the frame, the shadow A/B); `bun tools/scale.js` 24 of 24;
  `bunx --bun vite build` for TheGame and OS: built.
- **The upscale: the next root cause after 9a** (not fixed here). On the Mac mini, stage 9's branch measured the upscale
  pass at 7.5–21.2 ms a frame at a 3840 × 2160 output (the skyline 21.2), 5–14 times its 1.5 ms share. It is main's own
  pass from 2b, and has a row of its own in the table. What is to be found is why it costs that much at a 4K output:
  - the formats: the half-float colour and motion it reads, and the kept picture, an eight-bit storage texture written
    from the fragment shader beside the canvas;
  - the taps: 13 reads a screen pixel;
  - the history reads: Catmull-Rom's five of the kept picture;
  - the motion-vector dilation: the nearest of the 2 × 2, by a gather of the depth.

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel's reference photos (shot list under Build)
- [ ] Later (not now): mobile Safari loads, but its first start is slow. Samuel, 2026-11-18
- [x] Stage 1: clean ground
- [x] Stage 2a: gate, settle, one measure, truth
- [x] Stage 2b: prepass, motion vectors, upscale
- [x] Stage 3: boot (merged #67; Safari to be tried on next)
- [x] Stage 4: far end, impostor and clump rung (merged #66)
- [x] Stage 5: crowds, parts and one wind (#69; its cost and the impostors' size left, under Open risks)
- [ ] Stage 5: crowds, parts and one wind
  - [x] the draw path's two-pass occlusion culling, against a depth pyramid (built; draft PR #68)
  - [x] the draw path's follow-ups: one culling for every tier, the late prepass bundled, the grass culled, plants' boxes measured, every GPU resource and dispatch within the adapter's limits (PR #77, ready)
- [ ] Stage 6: land, virtual texture and relief
  - [x] 6a: the layer map, one read a material (the deferred pass left to 6b)
  - [x] 6b: the adaptive virtual texture with feedback (built; draft PR; the ground pass still reads the land's nodes)
  - [ ] 6c: relief (displacement, parallax, skirts, path decals)
- [ ] Stage 7: placement, five layers
  - [x] one rule, the growth map, the forest's layers and their kinds (built; draft PR #73)
- [ ] Stage 8: surfaces, cluster hierarchy (built: rocks, the tent and the fire pit; the stress world's zoo to 8b)
- [ ] Stage 9: one light, characters
- [ ] The bench pass by pass (built on `aven/0038-bench-per-pass`): measured on the Mac mini, the per-part ceilings a
      merge rule
- [ ] The upscale's cost at a 4K output (7.5–21.2 ms against its 1.5): the next root cause after 9a
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
- **Then asked:** merge main again (stage 6a). **Delivered:** merged (`e8d5bdb`); `bun tools/scale.js` 18 of 18,
  both builds, and the tent and the pine stand at 60 m drawn without an error. Draft PR #66.
- **Asked (by the orchestrating session):** stage 3, boot: one `src/boot.js({ profile })` with a `ready` promise for
  every page; a `stage` profile that starts only the sky, a small ground round the stage, the light and the shadows,
  and compiles only what the shown subject needs when it is shown; the stage set-up shared by the library and Me in
  `src/stage/studio.js`; the library's inline module in `src/library/*.js`; check 6 measured with the gate; what it
  replaces deleted.
- **Delivered:** stage 3 built (under Build): one boot with the profiles `world` and `stage`, the studio, the library's
  four modules. `src/main.js`, the `window.__game` polling, the pages' script order, the library's inline module and
  Me's copied stage are deleted.
- **Good:** the library compiles 0.8 MB of WGSL where it compiled 3.2 MB (74–76 modules against 244), and Me 0.63
  against 3.15 MB (57–58 against 231–234). Its first view came 1.7 to 30 times sooner in every pair of runs. The gate
  can measure the library and Me at all now. The game's own start compiles the same 224 modules, byte for byte.
- **Not there yet:** Safari not tried (it can't be automated here); the first subject's arrival was slower than main's
  in one pair of runs, under a load average near 300.
- **Asked (by the orchestrating session):** stage 6b, the land as an adaptive virtual texture: pages composited in
  compute from the layer map with hex-tiling inside, a feedback pass, a page table into a fixed atlas of about 100 MB,
  parents first and the camera's speed, pages faded in, sectors round the camera; the ground's colour pass one page
  read; the ground pass from the map where clean; the per-pixel laying deleted; measured with the gate. Then: merge
  main (stage 3), before/after pictures for Samuel, and drive it home.
- **Delivered:** stage 6b built (under Build): `src/terrain/pages.js`, the layer map on each page's own grid, the
  pages asked for from the prepass, BC pages in 107 MB.
- **Good:** the land alone is 2–6 times faster at the bench's views from above (13–14 ms against 47–76 on the shared
  GPU), and the zoom ran at a median of 16.7 ms with pages coming in faded.
- **Not there yet:**
  - the near ground is softer than main's: the screen's 3000–3500 pages fit only at a bias of 0.5–1;
  - at eye level the far grazing ground lets go nearer (the bare patches 100 m behind the tent);
  - settling after a jump is slow (the bias's quarter steps);
  - the ground pass still reads the land's nodes; Safari not tried; lines rose (+330 in the game).
- **Asked (by the orchestrating session):** the near ground at least as sharp as main's (in 6b's own crop the pebbles
  lost their edges, which blocked the merge): mip 0 where the pixel needs it, the upscaler's finer reads in the asks
  and the read, the right gradients; the compressed atlas grown to what 4K asks for at bias 0 (about 4096 pages,
  250 MB); main merged again (occlusion culling, stage 5); the near-eye crop's FLIP against main; what bounds a jump's
  settling.
- **Delivered:** 4096 pages in two arrays (about 250 MB; without BC still 640); texels laid from their materials half
  a mip finer; pages half a level finer within 15 m of the eye, the first the bias takes back; no ask where no land is
  drawn; a cut starts the bias from none; main merged twice.
- **Good:** the near ground as sharp as main's (edge energy 100 %, the crop's FLIP 0.071); the bias 0 at eye level.
- **Not there yet:** a jump settles in 17–53 s against main's 6–9 (what bounds it, under 6b's Measured); the far
  grazing hand-over; Safari.
- **Asked (by the orchestrating session):** the draw path's occlusion culling: a depth pyramid from the prepass's
  depth once a frame; two-pass culling in the packing (pass one against the last frame's pyramid, pass two against
  this frame's), nothing popping in; compaction by one atomic a workgroup, not one a thing; every drawer through the
  tiers, the shadow casters never culled by the camera's depth.
- **Delivered:** built (under Build, "Draw path: two-pass occlusion culling"). Draft PR #68.
- **Good:** the exact check finds no visible pixel left out, at six views, in a storm wind, along the walk and the
  orbit, and on the stage. The instances drawn fall to 67% at the tent, 50% in the pine forest and 2–8% from above.
  A still frame draws in the same order every frame.
- **Not there yet:**
  - no GPU gain shows above the shared GPU's noise;
  - the culling costs six dispatches a culled tier a frame, and its late prepass costs CPU;
  - the grass is not culled;
  - net lines rose (+390: a new mechanism);
  - Safari not tried.

- **Asked (by the orchestrating session):** stage 5, crowds: a recipe's parts (a prototype, a rigid transform and a
  pivot each), one spread order (its share by the one measure, those that stay grown about their tips at most 2–3
  times, the clumps at the cap, the meadow's blades halved and doubled, a random offset a plant; `KMAX`, `CARD` and the
  enlargement that stretches paintings deleted), one wind for every rung, the far ends' bakes kept, the impostors'
  views sized, the hand-over's speckle. Then: merge main (stage 3), and labelled pictures before and after.
- **Delivered:** stage 5 built (under Build), merged with main (`c3c4bea`), draft PR #69; the pictures in
  `scratchpad/visual/stage5/`.
- **Good:** at the tent the near stone pine is its sprigs at their own size, as full detail draws it, not a third of
  them enlarged up to four times; the pine behind the tent is denser, its cards smaller; a warm start puts the far
  ends in without baking them.
- **Not there yet:**
  - the crowds cost more: a level's mesh holds what its band's top needs, and a grown oak's second level holds 51 k
    vertices where main's held 8 k (the pine's 21 k against 7 k); the bench, on a shared GPU, read the stage slower at
    every view (a per-plant share of a level's draw, or the occlusion culling, would take most of it back);
  - the impostors' views stay 128 texels for today's plants (each hands over to its impostor as soon as it is sharp),
    and the trees' clumps' atlas grew from 51 to 131 MB with 256 chunks a shape;
  - a sprig that stays still enlarges its painting, uniformly, up to three times (a window onto a repeated painting
    was not tried);
  - against main's truth the stage is farther at every view taken, because its own finest is laid from four sprays a
    plant and its meadow from an ordered dither; its own truths at the tent and in the forest were lost to the device;
  - the walk and zoom paths were not run; Safari not tried.

- **Asked (by the orchestrating session, now on the Mac mini):** website and repo hygiene from the audit (task D):
  the front page's inline style in a file of its own, the brand's unused files gone, the builds without the brand's
  drafts, Samuel's photo at the size it is shown.
- **Delivered:** merged as PR #75 (`9b03f3f`): the front page's style in `OS/src/front.css` (not `brand.css`, which
  every game page loads), builds without `brand/sheets/` (one filter in `server/repo.js`), `theOS.svg` and
  `theOS_dark.svg` removed, `samuel.jpg` 758 kB → 5.7 kB (77 px, twice its 38.4 px).
- **Good:** seven pages at two widths, 0 px changed outside Samuel's photo; the website's build −35 % (3.57 → 2.32 MB),
  the game's −30 % (4.66 → 3.28 MB), the release for next −30 % (9.0 → 6.3 MB); `index.html` 75 → 16 kB.
- **Not there yet:** the website's own console errors (SVG `NaN` in the day cards, 404s for scene media not in git)
  are main's too, and untouched.
- **Asked (by the orchestrating session):** stage 7. One placement rule for everything that grows or lies on the land
  (density = ecotope × suitability × the larger things' influence × clumping, one ordered dither, largest first, each
  thing leaving its footprint, shade and litter for the smaller), its rank stage 5's spread order; the forest's layers
  as recipes of the existing kits (young trees, low shrubs, ferns and herbs, litter, deadwood, rocks bedded in the
  soil); nothing per placed thing on the CPU, placement on the GPU, the stress world measured before and after.
- **Delivered:** built (under Build, Stage 7): `src/scatter/rule.js`, `src/scatter/growth.js`, the floor kit and six
  kinds, the saplings of every grown species, the meadow as the smallest layer. PR #73, merged with main, ready for
  review.
- **Good:**
  - one rule places 18 kinds in three layers, for any number of them;
  - the biomes' stands, cells and clumps, `stand.js` and the stands' sizes are gone;
  - a plant's levels are its kind's, so no new asset file holds detail data;
  - under the crowns the floor is litter, ferns, herbs, logs and stones, not a meadow;
  - `bun tools/scale.js` 24 of 24.
- **Not there yet:** not measured against the truth (?truth black since 6b); the pines from 30 m and the stress
  world's start not settled (6b, fixed in 6c); the timings left to the Mac mini; the rest under the stage's Not done.
- **Asked (by the orchestrating session, on the Mac mini):** per-pass GPU timing on main, so per-pass ceilings can be a
  merge rule (geometry about 5 ms, light 3, ground 1.5, upscale and post 1.5, 1 of slack): stage 9's `cf77e71` ported to
  main's passes, each in one of the ceilings' four classes, a sum per class per view; the upscale on its own, flagged as
  the next root cause after 9a.
- **Delivered:** built (under Build, "The bench, pass by pass, on main"); a PR into main, ready for review.
- **Good:** every pass of main's frame has a name and a part; the upscale has a row of its own; the screen's marks are
  stage 9's lines as they are, so stage 9's merge of `screen.js` and `boot.js` is clean (`git merge-tree`).
- **Not there yet:** nothing measured: the Mac mini runs `bun tools/gate.js bench`; stage 9's passes join when it merges
  main; the upscale's cost is not looked into.

- **Asked (by the orchestrating session, on the Mac mini):** task B, the draw path's follow-ups to #68: one dispatch
  a pass for all tiers, a render bundle for the late prepass's draws, the grass culled, plants' boxes measured on
  their meshes, characters on skeletons left out; measured with the gate (bench, paths walk and orbit), the picture
  unchanged. Then: no comparison with main at all (Samuel: main is no reference), the branch judged on its own
  (culling on against off, and its own `?truth`), the GPU in turns from the master's queue, budget first and root
  causes only.
- **Delivered:** built (under Build, "Draw path: one culling for every tier…"), merged with main (stages 7 and 8, the
  bench by its passes), PR #77 ready for the integration train; culling off above, on below on `aven/0038-shots`,
  `cull/`.
- **Good:**
  - seven culling dispatches a frame for every tier at once (it was six a tier: 156 of 254 at the tent); 20 compute
    dispatches a frame in all, standing still;
  - the culling's GPU 0.2–0.9 ms (the pyramid 0.18–0.48 of it), the late prepass 0.3–1.1 ms of CPU and 0.02–0.05 ms of
    GPU; the grass culled (at the tent 103 k of its 134 k blades drawn), plants' boxes measured: 13–73 % of what is
    packed drawn, and culling on against off within the floor at every bench view;
  - every GPU resource and dispatch sized from the adapter's own limits: found at the final gate when stage 7's
    layers made the arena outgrow a binding and the truth's packing outgrow a dispatch.
- **Not there yet:** FLIP against its own `?truth` (the truth did not settle in 300 s at the start); the paths over
  16.7 ms and 12 ms of GPU (walk p99 34 ms cold), memory 5.31 GB within 8; the pyramid's 12 dispatches; the bench's
  ground-map fade (under Found); Safari not tried.

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
| 2026-11-18 | `e8d5bdb` | Stage 4 merged with main (6a): the registry made again from the merged recipes |
| 2026-11-18 | `b2a3916` | Stage 3: one boot with the profiles world and stage, the studio, the library's modules; `src/main.js` deleted |
| 2026-11-18 | `920d0c8` | Stage 3 merged with main (stage 4): the library's Detail tab names the impostor |
| 2026-11-18 | `eca4f33` | Stage 3: the pictures compiled aside, in turn; what grows on the stage a part of its own in settle |
| 2026-11-18 | `90988c7` | Stage 3: grow hidden again stays hidden; the gate counts loads, not the library's address |
| 2026-11-18 | `78988cb` | Stage 3: pictures after the first view complete; a subject's 20 s from its turn; the painter lingers |
| 2026-11-18 | `d55d805` | Stage 6b: the land as one virtual texture (pages laid once in compute, BC atlas, page table, feedback, fade-in) |
| 2026-11-18 | `8653cd3` | Stage 6b: pages asked for from the prepass (a storage write in the colour pass cost its early depth test); each mip its own binding |
| 2026-11-18 | `8a53e90` | Stage 6b merged with main (stage 3): the pages in `boot.js`, the library's stage drawn through them |
| 2026-11-18 | `f5238de` | Stage 5: parts (a prototype, a transform, a pivot), one spread order capped at SWELL, one wind, bakes kept; `CARD`, `KMAX`, `FAR` deleted |
| 2026-11-18 | `6cee745` | Stage 5: each stand's impostor views as fine as its shapes want; the meadow's blades halved and doubled |
| 2026-11-18 | `4a0c2a5` | Stage 5: the meadow's ring width no longer shadows a blade's place |
| 2026-11-18 | `8a09dce` | Stage 5: kept far ends read back at once; each stand's clumps grid its own |
| 2026-11-18 | `cf26025` | Stage 5: a crowd with no clumps hands over to its finest impostor; a tree's third level from 120 px |
| 2026-11-18 | `c3c4bea` | Stage 5 merged with main (stage 3): draft PR #69 |
| 2026-11-18 | `7466720` | Stage 5: the notes, the numbers measured and the trail |
| 2026-11-18 | `907a269` | Draw path: a depth pyramid and two-pass occlusion culling of every drawer's tiers, kept in order, no atomic |
| 2026-11-18 | `4b04cde` | Draw path: merged with main (stage 3); on the stage only what is drawn is culled (draft PR #68) |
| 2026-11-18 | `09e4a22` | Stage 6b: the measures, what is left for 6c, the changelog and trail |
| 2026-11-18 | `629bf1c` | Stage 6b merged with main (occlusion culling): the pages asked for after the late pass |
| 2026-11-18 | `a07f693` | Stage 6b merged with main (stage 5) |
| 2026-11-18 | `8050d4d` | Stage 6b: 4096 pages in two arrays; texels laid from their materials half a mip finer |
| 2026-11-18 | `07b87aa` | Stage 6b: pages half a level finer within 15 m of the eye |
| 2026-11-18 | `364197c` | Stage 6b: the near half level the bias's first; no ask where no land is drawn; a cut starts the bias from none |
| 2026-11-18 | `7281f29` | Stage 7: one placement rule and the growth map; the biomes' stands, `stand.js` and the stands' sizes deleted |
| 2026-11-18 | `33f5c9b` | Stage 7: the floor kit and six kinds; saplings of every grown species; a plant's levels are its kind's |
| 2026-11-18 | `084475a` | Stage 7: the meadow is the smallest layer (it reads the growth map) |
| 2026-11-18 | `16f8e01` | Stage 7: the growth map keyed on the sandbox and the stage, not the ground map's fade |
| 2026-11-18 | `1aac442` | Stage 7 merged with main (6b): the land's litter and far colours read the rule's stands |
| 2026-11-18 | `3907ce7` | Stage 7 merged with main (`314e2e6`) |
| 2026-11-18 | `9fa8a1f` | Draw path: one culling for every tier (an arena), the late prepass one bundle, the grass culled, plants' boxes measured |
| 2026-11-18 | `3c821b1` | Draw path: boxes worked out only for what was packed; a bucket found in as many halvings as it takes |
| 2026-11-18 | `fe8a3f8` | Draw path merged with main (stage 7): the grass's box and the growth map both in its packing |
| 2026-11-18 | `19d0559` | The bench times each pass on its own on main: the passes marked, each in one of four parts (geometry, light, ground, upscale/post) |
| 2026-11-18 | `7c8a1f6` | Draw path merged with main (stage 8): a solid's box its family's own where it gives one |
| 2026-11-18 | `4dc9499` | Draw path: boxes in 16 bytes; an arena never larger than one binding |
| 2026-11-18 | `5447dd1` | Every GPU buffer within the device's own limits, the adapter's asked for at boot |
| 2026-11-18 | `ab99e49` | Draw path: `?truth` culls as the game does (the truth draws all that is visible) |
| 2026-11-18 | `2fdfae0` | Draw path: every culling dispatch within the device's workgroups a dimension |
| 2026-11-18 | `d7dcd26` | Draw path merged with main (`ecc80f2`, the bench by its passes); PR #77 ready |
