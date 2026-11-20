---
id: "0050"
title: One LOD ladder for every asset
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0050-slug/, set at propose
---

# 0050 · One LOD ladder for every asset

## Idea

Samuel, looking at the Library's grass patch and its far view:

> What is the current process of generating the impostors? Shouldn't this always be done once, and also stored as an
> iroh blob, co-located with its actual asset, instead of regenerated every time we load the library?

> A fully universal, abstracted, reproducible system across any kind of asset, also future ones, including non-tree
> assets. Also, does really every seed need its own impostor bake? I don't think so: every source asset, no matter its
> seed, should always link one impostor bake. Also think about how impostor bakes handle wind (different strengths)
> and snow heights in future.

> Is there a medium-distance asset for LOD, different from the far impostor and the close-up full asset?

> Let's not do prune or deleting stale stuff yet; we can do this later.

> Regarding simplification of the architecture and universality: what can we learn from SmartImposter to adopt a
> single-source-of-truth, first-principles architecture pattern in our current system? Especially regarding those
> thousand different LOD strategies; we don't like that currently.

> Also, to stress test the new architecture after it's implemented, please add a random, highly detailed procedural
> tree as well. Choose the variants as you believe makes sense; default 1 and per asset feels good. Automatically by
> the kernel when an asset changes, but architect this as a kernel-plugin-like solution.

Why: NativeGame has seven LOD schemes, each with its own measure and hand-set numbers, and a new kind of asset would
add an eighth. Bakes are cached (intent 0049) but not linked from their asset, and the Library bakes once per seed.

## Define

**Deliverables**

1. **The asset contract.** Every asset is a recipe that makes a master: parts (meshes) and transforms. A group is an
   asset whose parts are assets: the grass patch is an asset of tufts, a stand an asset of trees. Every Library asset
   and the Mértola trees are made this way. `library.rs` holds the one list.
2. **Bakes belong to the asset.** One bake interface with kinds `impostor`, `lod` (a reduced mesh) and `lawn`. A
   bake's result is a doc linked from its asset doc (`derived: { impostor: <id>, … }`). It records the versions it was
   made from (the asset doc's head, the recipe's, the shader docs', the bake code's) and the parameters derived from
   the master. It is valid while those versions are current: checked without building the master. The `bakes` doc's
   content-hash parts go; nothing is pruned (Samuel's word).
3. **The baker, a kernel plugin.** The kernel gets a plugin interface: a plugin names the doc kinds it watches and
   is called when a doc of that kind changes. The baker is the first plugin: on a changed asset doc it checks the
   asset's bakes and makes the ones no longer valid, in the background. The game only reads; on a miss it draws the
   master until the baker's result arrives. `avendb bake <asset>` calls the same plugin by hand. The kernel itself
   knows nothing of bakes.
4. **One impostor per asset, not per seed.** N variants from canonical seeds, as layers of one atlas. N is in each
   asset's recipe, 1 by default (Samuel's choice): grass, clover, moss and rocks keep 1; the tree takes 4, since a
   crown's silhouette varies from seed to seed. An instance takes `hash(seed) % N`; the shader gives it its own turn
   about the vertical, scale and tint. A new seed in the Library bakes nothing.
5. **The texel channels.** Albedo + AO, normal, depth + coverage, sky visibility + normal spread, wind weight,
   material id. Wind on impostors from the wind weight with **the same wind function as the master's**, at any
   strength. Sky visibility and material are baked so snow, wetness and season can be runtime uniforms later; a state
   that changes the silhouette is a variant axis.
6. **One measure, one switch.** The asset's bounding radius projected to pixels against one global error dial (px).
   Which steps an asset has (`master → reduced mesh → impostor → lawn → average colour`) and where it switches follow
   from its size; the texel size and atlas resolution too. One hysteresis band and one per-pixel dissolve on a shared
   random number, at every step.
7. **The seven schemes collapse into the ladder.** The meadow is the grass patch's ladder: master near (the rings'
   thinning becomes its `lod` step), impostor, its `lawn` bake, its average colour as the far ground's. `place.rs`'s
   icosphere crowns become tree assets on the ladder. `grass::share`, `meadow.rs`'s levels, `patches.rs` and `HIGH` go.
   The terrain keeps its own tiles as the bottom of the ladder.
8. **One source for shared functions.** Wind, ground height, ground colour and the grass constants live once, read by
   Rust and WGSL. No "keep the two the same" left.
9. **The stress test: a random, highly detailed procedural tree.** Built last, on the finished ladder, with no code
   of its own outside its recipe. A broadleaf grown from its seed (trunk, branches to twigs, leaves as instanced
   parts: hundreds of thousands of triangles at the master), wind weights per vertex from its branch hierarchy. It
   goes through every step (master, reduced meshes, impostor with 4 variants, average colour), in the Library and
   as a stand in the Meadow and in Mértola. If it needs anything special-cased, the architecture is wrong and is
   fixed, not the tree.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Every asset is a master of parts | `library.rs` lists them all; `cargo test` builds each asset's master and checks its parts; Mértola's trees come from tree assets |
| 2 | Bakes linked and valid without a master | `avendb cat <asset>` shows `derived`; a second start logs every bake "read" and builds no master to check it |
| 3 | The baker plugin | `avendb put` a changed recipe while the kernel runs: the plugin logs the re-bake of that asset only, the game picks it up without a restart; the kernel's own code has no bake in it (grep) |
| 4 | No bake per seed | In the Library, Space ten times: zero bakes logged, the far view's variant changes |
| 5 | Wind and channels | A shot list in the Meadow at wind 0, 0.5 and 1: impostors sway with the masters, no visible change at the handover (looked at, filmed) |
| 6 | One measure | Grep: no LOD threshold in metres, rings or altitude left; the dial is the only LOD setting; changing it moves every asset's switch |
| 7 | Schemes gone | `grass::share`, `meadow` levels, `patches.rs`, `HIGH`, the icosphere crowns removed; the Meadow and Mértola look as before (the four `--gate` anchors, looked at) |
| 8 | One source | Grep: no constant or function copied between `src/` and `assets/shaders/` |
| 9 | The tree on the ladder | The tree's diff touches only its recipe and the Library's list; walked through each step in the Library (stills); a stand of 1,000 in the Meadow and Mértola within the rendering gate below, no visible switch in motion |

**Out of scope**

- Pruning or deleting stale bakes (later, at Samuel's word).
- Compressed atlases (BC/ASTC), cropped frames and streamed residency: SmartImposter's memory wins, a next intent.
- Drawing snow, wetness or seasons (the channels are baked here; the looks come later).
- Animated characters and their impostors; the terrain's own tiling.

**Architecture pass** (research in `research_notes/0050-one-lod-ladder.md`)

- **What is there:** seven LOD schemes (`grass.rs`, `meadow.rs`, `lawn.rs`, `patches.rs`, `impostor.rs`,
  `terrain.rs`, `place.rs`) measured by rings, cells, tiles, squares and altitude; about 20 hand-set LOD numbers; the
  ground function and the grass levels copied between Rust and `wind.wesl`; bakes keyed by the master's bytes in one
  `bakes` doc, so a master is built to check a cache; one impostor per seed.
- **First principles:** what must hold is that each pixel shows the asset at no more than the dial's error, with
  every step made once and every cap fixed. One measure (projected size) and one ladder keep that; the seven schemes
  keep more than it.
- **Taken away until it broke:** to do in Build, scheme by scheme against the `--gate` anchors.
- **Put back, in the best form:** the ladder of baked steps chosen by pixel error, as SmartImposter (one rule from
  the asset's size, one dissolve) and Maciel & Shirley (groups are assets) do, with SmartImposter's metre distances
  replaced by pixels. Runtime-built levels are not adopted (intent 0038's walk).

**Code gates** (lines with `wc -l`; Rust complexity with `cargo clippy -W clippy::cognitive_complexity`)

| Gate | On `main` now | Target |
| --- | --- | --- |
| Size (lines of code) | 3,364 in the ten touched `src/` files; 898 in the eight touched shaders | lower |
| Copies | ground function and grass levels in Rust and WGSL | 0 |
| Spaghetti | to measure at Build start | no touched function over the ceiling set then; mean lower |
| Dead and legacy code | `patches.rs` drawn on request only | 0 |
| Coupling | to measure | no cycles |
| Settings | 7 LOD schemes, about 20 hand-set LOD numbers | 1 dial; only physical or artistic numbers left |
| Dependencies | — | none new |

The tree adds lines (its recipe); it is counted apart from the size gate, which holds over everything else.

**The 10 % gate** (the MacBook, one run at a time, no other instance running)

| Measure | On `main` now | Target (≥ 10 %) | At Propose |
| --- | --- | --- | --- |
| Startup: the Meadow settled, warm start | 8.9 s (0049's baseline); 12.8 s seen 2026-11-20 with the Library open | ≥ 10 % faster: no master built to check a bake | |
| Library: a new seed's far view | one bake per seed | 0 bakes | |
| Rendering: the four anchors' mean and p95 (`--gate`) | 27–32 ms, p95 33–37 ms (0047) | not worse; ≥ 10 % lower in the Meadow (one dissolve instead of nested schemes) | |
| Memory: the app's peak | 0.6–0.8 GB (0049) | not worse | |
| Quality: the four anchors looked at; pops in motion | — | the same pictures; no visible switch | |

## Build

- **Order changed:** intent 0051 (the engine's source in avenDB) came first at Samuel's word; 0050's work was then
  done the 0051 way, each part a branch of avenDB merged through its check.
- **Bakes linked from the asset (2) and one impostor per asset (4), first cut:** an asset doc links its impostor in
  `derived`; the result doc (kind `bake`) holds a part per picture (iroh blobs) and the key and parameters it was made
  under. Valid while its key matches what the recipe, the settings, the shader and the bake code give now; checked
  without growing a master. `BAKE_CODE = "0049.1"` is gone: the key reads the bake code's own source. `variants` in
  the recipe, 1 by default; a seed is drawn as `hash(seed) % variants`.
- **The baker (3):** the kernel's plugins (`avenDB/src/plugin.rs`) and the baker (`baker.rs`), from PR #415; it runs
  `--bake <asset>` in the repo's GPU lock (`gpu.rs`, the same files as `lock.js`). On its first start it went through
  all eleven assets: the broadleaf's four variants baked in 13.8 s, the others found current in about 2.5 s each.
- **One source (8):** Rust writes one WESL module, `package::shared`, from the same tables Rust evaluates; the shader
  docs import it. Left: the meadow's biome doc repeats the bare ground's numbers.
- **The tree (9), early:** `tree.rs`, 200k–400k triangles per seed, wind weights per vertex; a library asset doc
  `broadleaf` with 4 variants. Found on the way, for deliverable 1: plant generators are not given the asset's
  size; `size` means "across" for rocks and height for the tree; the wind weight is not in any bake key.
- **The Library (Samuel):** one turntable, the full mesh or the far view in the same place: F or the toggle chip.
- **The asset contract (1):** one list of generators (`library::GENERATORS`), one signature `fn(&Asset, seed, size,
  colour)`, the size from the recipe for every kind; `size` is the longest side of an individual's bounding box, and
  `master` fits every individual to it; every generator's source is in the bake key; the wind weight
  (`library::ATTRIBUTE_WIND`) is part of the master's attributes, 0 where a generator gives none.
- **The texel channels (5):** a third atlas per variant: depth, wind weight, sky visibility, coverage. Far copies
  sway with the same `bend` the grass uses (`wind.wesl`), at the same time and strength. On the GPU the first run was
  refused: the bake doc has two fragment entry points and one pipeline named none; each pipeline names its own now.
  Masters do not sway yet: the far copy of the broadleaf moves, its full mesh does not.
- **The bare ground (8):** its cell, threshold and softness were in `terrain.rs` and in the biome doc; now only the
  biome holds them (its first layer the grass leaves out), Rust reads them there and the shared shader module is
  written again when a scene sets another biome.
- **Seen on screen (Samuel):** the broadleaf's far view was unusable: a dark trunk, the crown gone. Our bake was a
  simplified one (128 px frames for every size, one sample per texel, a hard cut at half coverage). Samuel: reuse
  SmartImposter's method exactly, as proven at scale; no experiments of our own. Being ported.
- **The baker on a new build:** it also watches the engine doc, so a new build (whose bake code is in every key)
  checks every asset in the background: all eleven in about 35 s after the first publish with the texel channels.

## Propose

_Filled when everything is built. Then stop: the human decides._

## Story

_Filled after the human's yes._

## Archived

_accepted or rejected, the date, the reason in a line._

---

## Todo

- [x] Samuel answers the two open questions (variants per asset, default 1; the kernel bakes, as a plugin)
- [x] Samuel approves the definition
- [ ] Measure the missing code gates on `main`
- [x] 1 The asset contract (size to every generator; one meaning of size; wind weight in the key)
- [x] 2 Bakes linked from the asset (first cut)
- [x] 3 The baker, a kernel plugin
- [x] 4 One impostor per asset
- [x] 5 Texel channels and wind on impostors (looked at on screen: still to do)
- [ ] Masters sway with the same `bend` (the tree, the plants)
- [ ] 6 One measure, one switch
- [ ] 7 The seven schemes collapsed
- [x] 8 One source for shared functions (the bare ground now read from the biome only)
- [ ] 9 The stress test: a procedural tree (the tree is in; its run through the whole ladder waits for 5–7)

## Changelog

### 2026-11-20

- **Asked:** how impostors are made and kept; one universal, reproducible bake system for every asset, one bake per
  asset not per seed, wind and snow in mind; whether there is a mid level; what to learn from SmartImposter for one
  LOD pattern instead of many. No pruning yet.
- **Delivered:** the Idea and Define of this intent; `research_notes/0050-one-lod-ladder.md` (our seven schemes,
  SmartImposter read from its README and `src/atlas.rs`, sources, options weighed).
- **Good:** bakes are already made once and kept in avenDB (0049); SmartImposter confirms the key and the variant
  approach.
- **Broke / not there yet:** no published method for wind or snow on impostors was found; that part is ours to prove.
  Several code gates still to measure.
- **Asked:** a random, highly detailed procedural tree as the stress test once the ladder is built; variants per
  asset, default 1; baking automatically by the kernel when an asset changes, built as a kernel plugin.
- **Delivered:** deliverables 3 (the baker plugin) and 9 (the tree) with their checks; the open questions closed.

## Trail

| When | Commit | What |
| --- | --- | --- |
