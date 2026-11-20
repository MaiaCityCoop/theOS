# 0050 · One LOD ladder for every asset: research

The question: how should NativeGame choose an asset's representation at every distance, with one source of truth
instead of the seven schemes it has now? And where are bakes kept?

## What is there (main, 2026-11-20)

| # | Where | Decides | Measured by | Hand-set |
| --- | --- | --- | --- | --- |
| 1 | `grass.rs` `share()` | blade density per ring of 8 m chunks | ring index | `CHUNK`, `RINGS` 9, the table 1 / 0.35 / 0.18 / 0.09 / 0.05 / 0.025 |
| 2 | `meadow.rs` | GPU grass levels | cells doubling from 4 cm | `FINE`, `LEVELS` 4, `REACH` 110: **copied in `wind.wesl`** |
| 3 | `lawn.rs` | the baked sward past ~35 m | where #2 stops | `AZIMUTHS` 16, `RES`, `TOP`, `MIPS` |
| 4 | `patches.rs` | grass-patch impostor quads, 2 levels | 1 m tiles | `TILE`; on request only |
| 5 | `impostor.rs` | an asset's far view (the Library) | not used by any world yet | `FRAMES` 8, `RES` 128 |
| 6 | `terrain.rs` | near ground, far land | `share(ring)` from #1 | the ground function **copied in `wind.wesl`** ("keep the two the same") |
| 7 | `place.rs` | trees: near crown, far crown | 750 m squares | icosphere levels 1 and 0 |
| + | `meadow.rs` `HIGH` | no near grass above 60 m | camera height | 60 |

Seven measures (rings, cells, tiles, squares, altitude), none of them the asset's size on screen. Bakes are kept by
hash in one `bakes` doc in avenDB (intent 0049), not linked from the asset, and the key needs the master mesh built
first. The Library bakes one impostor per seed.

## SmartImposter (github.com/SamG-Coder/SmartImposter, read 2026-11-20, commit fe2ac7c)

A Rust + Vulkan forest and globe renderer. From its README and `src/atlas.rs`:

- **One kind of thing.** A plant is a variant: unique meshes plus a list of (mesh, transform) parts, as UE's Nanite
  assemblies. A grass patch is a variant too: about 3 m of instanced clumps. Groups are assets of assets.
- **One ladder, the same for all.** Real mesh, then a dissolve band, then a parallax octahedral impostor; for grass,
  then the lawn, whose LOD is its own mip chain, then the ground.
- **Everything derived from size.** LOD scale = height / 16 m, clamped 0.25–1.2 (grass ≥ 0.4). It sets the switch
  distance (44–56 m × scale), the draw distance, the texel size (5.5 cm × scale), the frame's resolution (multiple of
  32, ≤ 448) and its crop (measured on the real vertices). No per-asset knob.
- **One switch.** A CPU state per plant with hysteresis; the mesh and the impostor dissolve on one shared per-pixel
  random number, so exactly one answers each pixel.
- **The bake uses the runtime shaders**, so it sees exactly what the game draws.
- **Baked once, keyed** (FNV-1a) on the asset, the settings and the bake shaders; one cache file per variant.
- **Texel channels:** albedo + AO (BC3), octahedral normal (BC5), depth + coverage (BC5), and at half resolution sky
  visibility `a + b·up` and normal spread (BC3). 3.25 bytes a texel instead of 16; frames cropped to the plant.
- **Residency:** a base atlas (¼ resolution down) always on the GPU, the full one streamed by distance under a budget.
- **Variants, not seeds:** a fixed set per species; grass has three patch layouts, which "can be noticed from high up".
- **Limits it states:** no wind; hand-set metre distances; upper hemisphere only.

## Other sources

- Maciel & Shirley 1995, *Visual navigation of large environments using textured clusters*: one hierarchy holds
  impostors and LODs for objects and for clusters of objects, chosen by their size on screen with hysteresis. The
  group-is-an-asset idea, thirty years old. https://www.cs.princeton.edu/courses/archive/spr01/cs598b/papers/maciel95.pdf
- Sellers, SIGGRAPH 2013 course notes: terrain LOD chosen by estimated pixel error.
  https://discmaster.textfiles.com/file/16678/SIGGRAPH%202013%20-%20Disc%201.iso/content/courses/sellers-notes.pdf
- Clasen & Prohaska, VMV 2010: one image-based error measure for both simplifying and choosing LODs in landscapes.
  https://www.zib.de/userpage/prohaska/docs/Clasen_et_al_VMV2010.pdf
- three.js forum, *A forest of octahedral impostors*: switch to the impostor only when the mesh would cover no more
  screen than the bake's resolution. That is the pixel rule, in the bake's own units.
  https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735
- GPU Gems 3 ch. 6: procedural tree wind in the vertex shader from per-vertex weights; the function our impostors
  must share. https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-6-gpu-generated-procedural-wind-animations-trees
- Epic, Nanite assemblies and the Procedural Vegetation Editor (UE 5.7): plants as assemblies of reused parts, wind
  through skeletal animation of the parts; LOD by Nanite's cluster error. Forum reports say octahedral impostors do not
  combine with Nanite foliage. https://dev.epicgames.com/documentation/unreal-engine/nanite-assemblies ·
  https://dev.epicgames.com/documentation/unreal-engine/procedural-vegetation-editor-in-unreal-engine
- Not found: a published method for wind or snow on impostors from baked per-texel channels. SmartImposter has no
  wind. This part is ours to design and to prove with the gates.

## Options weighed

1. **Keep a scheme per kind of thing** (today). Every new asset type adds a scheme and its numbers. Rejected: it is
   what Samuel does not want, and it does not scale.
2. **Runtime-adaptive LOD (Nanite-style clusters built and chosen at runtime).** Rejected: intent 0038 tried runtime
   built levels and read-back-sized stores, and the walk got worse (p50 50 ms against 16.7 ms). The rules since then:
   levels made once, fixed caps, no runtime-built LODs without a measured win.
3. **One ladder of baked steps, chosen by pixel error.** Chosen. Every step is made once (a bake), the choice is
   stateless (a size and a dial), the caps are fixed. It keeps what made the hand-made LOD stable and drops the
   hand-tuning.

## The pattern chosen

- **An asset** is a recipe that makes a master: parts and transforms. A group (a grass patch, a stand of trees) is an
  asset whose parts are assets.
- **The ladder** `master → reduced mesh → impostor → lawn → average colour`. Each step after the master is a bake
  kind; which steps an asset has follows from its size (a pebble: master and colour; a tree: all).
- **One measure:** the asset's bounding radius projected to pixels, against one global error dial in pixels. A
  device changes only the dial.
- **One switch:** one hysteresis band and one per-pixel dissolve on a shared random number, at every step.
- **Bakes belong to the asset:** the asset doc links each result; a result doc records the versions of what it was
  made from and the parameters derived from the master. Valid when those versions are still current; no master is
  built to check.
- **One bake per asset, not per seed:** N variants from canonical seeds as layers of one atlas; an instance takes
  `hash(seed) % N` and the shader gives it its own turn, scale and tint.
- **Weather at runtime:** the bake keeps what weather cannot change (albedo, AO, normal, depth, coverage, sky
  visibility, normal spread, wind weight, material). Wind strength, snow height, wetness and season are uniforms; a
  state that changes the silhouette (leaves off) is a variant axis.
- **One source for shared functions:** wind, ground height and ground colour written once, read by Rust and WGSL.
