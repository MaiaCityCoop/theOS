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
