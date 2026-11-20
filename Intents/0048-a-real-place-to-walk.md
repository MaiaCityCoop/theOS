---
id: "0048"
title: A real place to walk
state: build
outcome:
opened: 2026-11-19
story:
---

# 0048 · A real place to walk

## Idea

Samuel, looking at [SmartImposter](https://github.com/SamG-Coder/SmartImposter): "how can we actually visualise a real
place on earth? How did they do it, and can you create a minimal standalone demo as well? Choose a low-density
populated area in a Mediterranean climate." Then: "use our Bevy Rust wgpu engine for it", "add a new tile to our
dashboard to access this demo", "for now we mainly care about real world terrain that becomes walkable", "just the
camera walking or flying through real-world earth terrain".

## Define

**Deliverables**

1. A bake, `cargo run -- --bake-place`, that turns two open tiles (Copernicus GLO-30 elevation, ESA WorldCover 2021)
   into a small package for 6 by 6 km around Mértola, Alentejo (Mediterranean climate, about 5 people per km²).
2. A Place view in NativeGame: the terrain from that package, coloured by land cover, trees where WorldCover says tree
   cover, and the walker's camera on it: walking at eye height over the ground, or flying, never under it.
3. A third tile on the dashboard, "C · PLACE", that opens it.
4. A round map at the bottom left, north up, the walker at its centre with their heading: zoomed with the wheel (or
   + and -) from 0.5 km across to the whole world; a click on it takes the walker there within the baked square.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The package is baked and small | `cargo run -- --bake-place`; `du -sh NativeGame/assets/places/mertola` |
| 2 | The place renders | `cargo run -- --place-still out.png` |
| 3 | The tile opens it and the camera follows the ground | `cargo run`, the Place tile, walk |

**Out of scope**

- Impostors, erosion refinement, rivers as lines, plants by species, streaming beyond one square. SmartImposter's
  parallax octahedral impostors and multi-scale erosion are the next steps if the place is to look close-up real.

## Build

- **How SmartImposter does it:** Rust on Vulkan, hardware ray tracing only. Real terrain from NOAA ETOPO 2022 and
  Copernicus GLO-30, land cover from ESA WorldCover as fractions per vertex, biomes from RESOLVE, water from
  HydroRIVERS and HydroLAKES. Trees are not data: a seed-dispersal and succession simulation grows them on the
  terrain, from Quixel Megaplants. Far plants are parallax octahedral impostors (one AABB each, traced by the RT
  cores); real meshes within 44 m, a stochastic dissolve to 56 m.
- **This demo takes the data half only:** the same two open datasets, sampled once into a 257² height grid (23 m) and
  a 512² cover grid (12 m), about 0.5 MB in all. GeoTIFF tiles are read a tile at a time with the `tiff` crate, so the
  89 MB WorldCover tile costs only the tiles the site touches. Trees are merged into one mesh per 750 m square.
- **It is the real ground:** the Guadiana reads 0 m (it is tidal up to Mértola), the castle hill 57 m on the 23 m
  grid, the highest point 191 m. Copernicus is a surface model, so it holds tree and roof tops, not bare ground.
- **The map has five layers,** the smallest that covers each pixel wins: the site (6 km, land cover with relief
  shading, made when the place opens), the region (40 km, baked from the same two tiles), and Natural Earth's land
  (1:10 million, public domain) at 300, 3,000 and 20,000 km. Bevy clips children to rectangles only, so the round
  window is drawn on the CPU (320² pixels) whenever the walker moves half a pixel or the zoom changes.
- **The stills raced the screen:** with the display asleep or the window covered, a still comes out black (57 kB),
  the Studio's too; it is the machine, not the code.

- **The trees are measured** (Meta and WRI's canopy height map, 1 m, CC BY 4.0): Web Mercator tiles of 65,536² pixels,
  about 270 MB each, kept as one-row deflated strips in order; a 6 km square reads only its rows with two HTTP range
  requests (the header, then about 25 MB). Sampled onto a 2 m grid, a tree is a cell highest within a radius growing
  with its height; its crown 0.45 × its height wide. Mértola: 21,118 trees, 127 kB, 10 s. Trees are merged per 750 m
  square twice, near (round crown and trunk) and far (20-face crown), switched by Bevy's `VisibilityRange` at 900 m.
- **The sun is real:** its position from the place's latitude, the day of the year and the solar hour (declination
  and hour angle; three tests: the equinox noon at 90° less the latitude, morning east and evening west, summer above
  winter). It opens on now in the place's solar time; [ and ] move the hours. Light, colour, ambient, sky and haze
  follow its height; shadows in three cascades to 600 m.

## Propose

## Story

## Archived

## Todo

- [ ] Samuel walks it and says whether the terrain reads as the place.

## Changelog

### 2026-11-19

- **Asked:** how a real place is visualised, a minimal demo in a low-density Mediterranean area, on our Bevy engine,
  reached from a dashboard tile; walkable terrain first.
- **Delivered:** the bake, the Place view, the tile, the round map with zoom and click to jump.
- **Asked next:** TheGame's camera, Shift's speeds and its flying by the wheel; the map flush to the left.
- **Delivered:** `src/rig.rs`, TheGame's rig in Rust for the Game and the place: one height from the eyes (1.7 m) to
  12 km on the wheel, its keys' speed, run, look-down and lens eased over the height's logarithm, Q E turn, steep
  ground stops the walker; the wheel zooms the map only over the map. Two tests hold the keys.
- **Asked next:** a click outside the square loads that place. **Delivered:** the place is a `Site` (a name, a centre,
  a package directory), the tiles a mosaic named from any latitude and longitude (Copernicus in 1° tiles, WorldCover
  in 3°; no tile, as over open sea, reads as water at 0 m). A click outside the square bakes the 6 km square around
  that point in a background thread into `target/places/`, then enters Place again for it; a place baked once opens at
  once. `--bake-place <lat> <lon>` does the same from the command line. Mértola rebakes byte for byte the same; a
  square on the 38° N tile edge baked in 17 s across four elevation tiles.

- **Asked next:** the real trees from canopy height and the real sun, both. **Delivered:** `src/canopy.rs`,
  `src/sun.rs`; `--place-still <out> [km] [hour]` for stills at a set hour.

- **Asked next:** a sun dial, "like in the game". **Delivered:** `src/dial.rs`, TheGame's weather panel for the sun: a pill
  at the top centre (the time, the date, the sun's height) that opens into a card with Time and Auto (two game hours a
  real minute, as TheGame's clock) and Date. The camera takes no wheel or drag over the panel or the map (`Captures`).
  At 09:30 on 19 Nov the sun stands at 22° over Mértola, as its latitude gives.

## Trail
