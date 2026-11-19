---
id: "0047"
title: The Meadow, how real it can look here
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-19
story:                 # Stories/0047-slug/, set at propose
---

# 0047 · The Meadow, how real it can look here

## Idea

> What's the quickest win we can create to test the edge photorealistic capability of Bevy on our M1 with 8 GB RAM at
> 30 fps 1080p? Just grass in wind, fully procedurally generated? With a good sky and sun? […] Just program it directly
> as its own standalone scene and grid item, build it in stages so we can follow along the progress. […] Can you swap
> the Studio's timeline to use the grass world instead for its example. […] Also please keep an app always running.

## Define

**Deliverables:** a third tile, Meadow: generated grass, Bevy's physical sky and sun with an hour to move, light
through the blades, soft shading at the roots, a grass carpet to the horizon; the Studio films its shots over the same
grass world; a measuring run, `cargo run -- --meadow <out.png> [hour]`, at 1080p without vsync. Built in stages, each
shown: sky and sun; grass; its realism (density, colour, light through, roots, carpet); later wind and clouds.

**Checks:** the frame time at 1080p on the M1 against 30 fps (33.3 ms), measured with no other instance running; the
pictures looked at by Samuel; the navigation self-test, `cargo run -- --navtest`, passes every step.

**Out of scope:** trees and other plants, terrain, water; phones.

## Build

- **Stage 1, sky, sun, ground:** Bevy's Atmosphere with the sun at raw sunlight, exposure 13, ACES, bloom, TAA. 29 ms
  at 1080p, before any grass.
- **Stage 2, grass:** blades generated in Rust, curved, tapering, solid (no cut-outs), one mesh per 8 m chunk.
- **Navigation fixed:** the plain's camera was switched off on the dashboard, and with it the interface: the screen
  froze on its last frame (Home showed the old plain, the Studio froze). The camera now stays on. The Meadow no longer
  resizes the window. Clicks are ignored for 0.35 s after a view opens, so Home cannot fall through onto a tile. A
  self-test clicks through every view with its own pointer and checks an interface camera draws.
- **The Meadow has its own render layer:** the plain's ground had fought its ground (the green triangle). Its sun has
  two shadow cascades over 45 m, with more bias for the low sun (the drifting dark bands).
- **Realism, 1 to 5:** denser and finer blades near the eye, each its own green from deep to light yellow-green, some
  dry and seed-headed stems; light through the blades (diffuse transmission 0.45); ambient occlusion; a grass carpet
  texture and a large-scale patchiness on the ground beyond the blades.
- **The Studio films over the grass world.**
- **True colour:** AgX tone mapping in place of ACES (which pushed greens to yellow), and the blades' colours set to
  the linear reflectance of real grass (about 5 to 20 % in green).
- **Wind:** a material extension on the standard material with its own vertex shaders for the main pass and the
  prepass (Bevy 0.20's shaders are WESL), so blades, shadows and motion vectors move together. A blade bends by the
  square of its height; long gusts roll across the field with ripples on them and a flutter per blade. `-` and `=`
  change the strength. The first strength laid the field flat; it was cut to about a third.
- **The same density wherever you walk:** the grass is a grid of 8 m chunks fixed to the world; rings of chunks
  follow the camera, full detail in the nearest two, then 35, 18, 9 and 5 % of the blades, wider. A coarser ring draws
  the first blades of the same list. Chunks grow in the background, at most six new a frame, nearest first, and a
  chunk is replaced only once its new version is ready.
- **Seed heads:** about one stem in forty flowers (more where it is dry): a fine straw stem and a head of many
  spikelets, each two crossed grain shapes: dense cylinders (as timothy), loose panicles (as meadow grass), nodding
  plumes. Only in the near rings. The first version was pale and flat and read as paper scraps; now smaller, crossed
  and darker.
- **Sliders, top right:** the wind (0 to 2.5, default 1.4, stronger at Samuel's word) and the sun over 24 hours.
- **Measuring paused at Samuel's word:** realism first. Each part (sky, shadows, grass, AO, TAA, bloom, glow) can be
  switched off for a later measurement with `MEADOW_NO_<PART>=1`.
- **Too slow so far:** 82 to 94 ms (11 to 12 fps) at 1080p with grass, measured while Samuel's own instance ran too.
  Clean numbers and the cost of each part are next.

- **Calm at zero, whole spikelets:** the flutter now scales with the wind; a blade's own sway character is smooth
  across it (a hash per 2.5 cm cell had blown each spikelet's corners apart into the flat triangles).
- **The night:** stars on a dome that follows the eye, a moon opposite the sun with a cool light, and an exposure that
  opens from 13 by day to 5.5 at night, as an eye adapts.
- **The ground floor, procedural:** a 1 m tile at 1024 px baked from generated micro-geometry (soil grain, damp
  patches, 9,000 crumbs, 220 pebbles, 1,400 bits of litter) into colour with crevice shade, a normal map and
  roughness, in measured soil and litter reflectances; it lies within 18 m of the eye and fades into the carpet by
  32 m. Thatch of dead blades and low plants (clover, plantain, dandelion, moss) grow in the near chunks.
- **Clouds:** fair-weather cumulus 1.5 km up, generated, lit by the sun and moon, drifting with the wind.
- **The Studio plays a shot's hour and wind** (a value or `[from, to]`), and opens the four anchors.
- **The disk ran full** (300 MB free); builds stopped until it was cleared in a separate session.

- **1080p, not Retina:** the window was drawn at its full Retina size, about 4000 × 2500 pixels, five times the gate's
  1080p. The grass world is now drawn at 1080 rows into an image shown over the whole window, with the interface sharp
  on top. The likely main reason for 12 to 15 fps; not yet measured.
- **Wind that keeps a blade's length:** a blade bends as an arc of constant curvature from its root. The push
  sideways had stretched blades flat in strong wind (the big pale shapes). Blades keep full width over their lower half
  and taper evenly to a fine point; five segments near, four and three further out.
- **A softer horizon:** three more rings of sparse blades (to 72 m), each ring a little lower, so the field thins into
  the carpet instead of ending.
- **The legacy game's camera:** scroll to rise from 10 cm to 12 km (each notch multiplies the height), click into the
  world to capture the mouse, Escape to let it go and again to go home; the pace grows with height. Grounds now reach
  400 km, the horizon from 12 km.

- **The land in three dimensions, no textures** (Samuel: "never apply the legacy texture logic, but fully procedural
  3D"): one height function (`terrain.rs`) of rolling hills, swells, tussock mounds and centimetre bumps. The near land
  grows with the grass chunks, a 96-cell grid per 8 m square near the eye, coarser further out, with skirts so
  neighbours never gap; beyond the grass, rings out to 200 km are rebuilt around the eye as it moves. Stones and
  pebbles are generated, partly buried shapes. Every colour is in the geometry, from measured reflectances; large
  patches of lusher, sparser and drier sward give a view from above its structure. The texture floor and the grass
  carpet are gone. Grass, thatch and low plants grow on the land; the wind shader computes the same large shape to know
  a blade's height above the ground; the walker and the Studio's shots keep their height above the land.
- **Frame rate at 1080p:** Samuel saw 29 to 52 fps in the Meadow ("frame rate looks fine").

- **The grass on the GPU:** the blades are made in the vertex shader each frame, nothing stored. Tiles of 64 × 64
  blade slots lie in five nested levels around the eye (cells of 4, 8, 16, 32, 64 cm; 625 blades a square metre at
  the finest, out to about 110 m); each slot becomes a blade from a hash of its world cell (place, height, lean,
  width, green), standing on the land (the terrain's hash and noise ported bit for bit), so it is the same blade every
  frame. Levels cross-fade blade by blade; blades are never thinner than about a pixel, or far ones flicker away; most
  slots are rejected first and cheaply. The CPU chunks keep the land, stones, seed heads, thatch and low plants.
  The wind's flutter had a frequency that varied in space times the running clock: neighbouring points of one blade
  decorrelated more the longer the app ran, and tore blades into triangles in strong wind; one frequency now.
- **The far land as nested square grids**, crack-free, under the near ground everywhere (no hole to show sky while
  chunks stream); one colour rule near and far; the stars only by night; the cloud layer fades as the eye nears it.
- **The Meadow's overlay** smaller and along the top edge.

- **The gate:** `cargo run -- --gate <dir>` renders the four anchors (`timelines/meadow-anchors.json`), each held at its
  middle with its hour and wind, at 1080p without vsync; per shot the mean and p95 frame time and one picture.
  `python3 -I NativeGame/gate.py <before> <after> <sheet.png>` puts two runs side by side. Every change is judged
  on that sheet before Samuel looks at the app.
- **The white-blue streaks were TAA:** with TAA off they vanished (0 bluish pixels in the close shot, from about 750);
  on blades a few pixels thin its history pulled in the sky of the frame before. The Meadow uses SMAA now.
  (Two earlier fixes, the depth prepass and the normals, were real but not the cause.)

- **The grass carpet** (after SmartImposter's lawn, made procedural): beyond the real blades the ground shader
  treats the sward as a slab of grass. A ray's horizontal path through it decides by Beer-Lambert how often it is
  stopped by a blade and at what height (grazing: near the tips, light and dense; steep: among the dark roots);
  the blades are found at that height (parallax), as blade-wide streaks along the view, never finer than two pixels.
  No baking and no texture: it is computed per pixel from the same numbers as the blades.

- **The asset architecture (begun), after SmartImposter, fully procedural:** every asset has one full-detail master
  (`library::master(asset, seed)`: rocks from `terrain::rock_master`, plants from one `grass::plant` generator shared
  with the field); everything else is to be made from it. Planned: views of each master baked into an atlas
  (octahedral impostor), copies drawn as instanced masters near and as impostors far with per-pixel dissolves between,
  so millions of placements hold 30 fps; then the grass tile itself as an asset whose far view is the carpet.
- **The Library** (home tile D): each asset's master on a turntable; ← → step through, Space a new individual, the
  caption its generator, sizes and triangle count.

- **The lawn, SmartImposter's method, procedural** (`src/lawn.rs`): a square metre of 1600 real blades between 9 × 9
  copies of itself is baked once from 16 azimuths × 6 low slopes (8° to 62°): each view stores, for every point of
  the tip plane, the first blade on the line along that view (sheared projection, its height as depth), 4× multisampled
  (one sample a texel missed blades thinner than a texel: half of every view was empty), with coverage-weighted mips.
  The ground shader looks up where the eye's ray crosses the tip plane in the four views around its direction,
  blended; each 1 m tile shifted by its own random offset. Root causes found on the way: a scene opened before the
  bake missed it; a material bound to the atlases before they were filled kept the empty pictures (bound only once
  done). Gate: 31 to 36 ms in all four anchors.

### How the scene evolved

The story of the Meadow, stage by stage, for the devlog. Every stage is a commit on `aven/0047-meadow`; checked out
and run, it shows the scene as it was. The pictures are those Samuel and the agent looked at on the day.

| Time (2026-11-19) | Commit | Stage | What it looked like | Samuel |
| --- | --- | --- | --- | --- |
| 15:05 | (in `8eb7638`) | Sky, sun, ground | A physical evening sky over a flat green ground; a shadow fought the ground and flickered | "it's flickering on green" |
| 15:20 | (in `8eb7638`) | First grass | Dense generated blades about 40 m around the eye, then a dark band and a hard edge; 11 fps | "we have flickering artifacts, can you see?" |
| 15:40 | (in `8eb7638`) | Navigation fixed | Home froze the screen on its last frame; fixed, with a click self-test | "navigation works again!!" |
| 16:40 | `8eb7638` | Realism 1 to 5 | Denser, finer blades, varied colour, light through the blades, a carpet to the horizon | "this looks already wondrous" |
| 16:49 | `bd81db9` | True colour and wind | AgX and real reflectance: green, with a golden backlight; gusts across the field, at first far too strong | "wind looks super, can you make wind even stronger" |
| 16:55 | `9a26fa9` | Grass that follows you, seed heads, sliders | The same density wherever you walk; seed heads still read as flat triangles | "the heads still look like flat unrealistic triangles" |
| 17:05 | this commit | Calm at zero wind, heads whole, night | The wind's flutter blew a spikelet's corners apart (the triangles); stars, a moon, an eye that adapts | "and have a proper night sky too, it's just black now" |

**Storytelling anchors:** `NativeGame/timelines/meadow-anchors.json` holds four shots fixed to the world (into the
evening sun, down among the blades, over the field, night), each with its hour and wind. The grass is fixed to the
world, so the same shot at any later commit shows the same spot of ground: played at each stage's commit, the four
shots become the before-and-after of the film. (The Studio does not yet read a shot's hour and wind; until it does,
they are set with the sliders.)

## Propose

## Story

## Archived

---

## Todo

- [ ] Measure each part's cost alone (sky, shadows, grass, ambient occlusion, TAA, bloom) with no other instance
- [ ] Bring the Meadow to 30 fps at 1080p, or say what it costs
- [x] Wind
- [ ] Clouds
- [ ] The Studio plays a shot's hour and wind, and can open `meadow-anchors.json`
- [ ] The ground under the grass: thatch of dead blades, low plants (clover, rosettes, moss), a scanned soil set
- [ ] Code hot reload with `dx` (needs free disk space: the disk had 1.5 GB left)
- [ ] 30 fps at 1080p

## Changelog

### 2026-11-19

- **Asked:** the quickest test of how real Bevy can look on the M1 at 1080p and 30 fps: grass, sky and sun, in stages;
  then the navigation fixed, the Studio over the grass, grass realism 1 to 5, an app always running.
- **Delivered:** the Meadow tile and scene in stages 1, 2 and the realism pass; the navigation fixes and their
  self-test; the Studio over the grass world.
- **Good:** the navigation self-test passes every step; Samuel: "navigation works again!!"
- **Broke / not there yet:** 11 to 12 fps at 1080p, far from 30; the numbers are not clean yet. Wind and clouds not
  started.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-19 | `8eb7638` | the Meadow: sky, sun, grass, its realism pass; the navigation fixed with a self-test; the Studio over the grass |
| 2026-11-19 | `bd81db9` | true colour: AgX and real grass reflectance; wind in the vertex shaders, shadows and motion included |
| 2026-11-19 | `9a26fa9` | grass in rings around the camera, grown in the background; seed heads of three kinds; wind and 24-hour sun sliders |
| 2026-11-19 | `330544d` | calm at zero wind; night sky; procedural ground floor, thatch and low plants; clouds; the Studio plays hour and wind |
| 2026-11-19 | `6c6b00a` | the world at 1080p under a sharp interface; arc wind; fine tips; three more rings; scroll to 12 km, click to look |
| 2026-11-19 | `401b163` | the land as 3D geometry: hills, mounds, bumps, generated stones; far land to the horizon; no textures |
| 2026-11-19 | `10637a9` | GPU grass: blades made in the vertex shader, 625/m² near, five levels; smaller overlay |
