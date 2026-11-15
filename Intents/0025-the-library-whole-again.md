---
id: "0025"
title: The library whole again (every asset drawn, a seed that seeds, a fire that goes out)
state: propose         # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-15
story:
---

# 0025 · The library whole again (every asset drawn, a seed that seeds, a fire that goes out)

## Idea

Samuel reports three bugs in the asset library (`TheGame/library.html` and what it loads), as relayed to this
session:

1. "The library no longer loads all assets: trees, storms and shrubs (and possibly others) are missing; the Assets
   card shows only 14." Find out why, in the history of the library and the registry and in the recent intents
   (0018 a real fire, 0019 characters in the library, 0022 a stress test tile, 0023 Magic Wonder loads again), and
   make every asset kind appear again.
2. "The random seed button does nothing": with the rock chosen, Random does not change the rock's shape. The seed
   must make the chosen procedural asset again, and every other seeded asset.
3. "Once the fire is selected, it stays forever": choosing another asset neither removes nor replaces it. Switching
   must free what stood before, the fire's particles, light and loops with it, and no other asset may leak the
   same way.

## Define

Asked outright, three bugs with nothing surprising in what done means, so built straight away.

**Deliverables**

1. Every asset in the library is drawn again, its picture in the list and itself on the stage: the trees, the
   shrubs, the stones and boulders as much as the tent, the fire pit and the flame. The cause named.
2. Random makes the chosen asset again from another seed, for every seeded asset: the rocks (Boulders, Stones), the
   trees (Holm oak, Stone pine) and the shrubs (Bracken, Dead wood, Mastic, Moss cushion, Reeds, Rockrose). Own
   brings back the file's own.
3. Choosing another asset (or a biome, a character, a material) frees what stood on the stage: its meshes, its
   materials, a fire's draws and its light, body lines; nothing of it is drawn or lit afterwards. The world's own
   fire in front of the tent stays where it is.

**Checks** (how each is shown to be done)

| # | Check | How |
| --- | --- | --- |
| 1 | Every asset listed, pictured and staged | a script in Chromium clicks each of the 14 assets: a screenshot of each on the stage; each list picture has pixels |
| 2 | The seed changes the rock | Boulders chosen, Random pressed: the staged rocks' vertices differ, screenshots before and after; the same for a shrub and a tree; Own gives the first shape back |
| 3 | The fire goes when another asset is chosen | Flame, then Bell tent: no fire is drawn at the stage, the fire light is back at the tent's fire; screenshot |
| 4 | Nothing piles up | the scene's children and the renderer's geometries after a round of every asset, twice: the same |
| 5 | No console errors | the library's console through all of the above |

**Out of scope**

- The look of the fire, the plants and the rocks themselves.
- PR #6's safe areas at the top of `library.html` and in `brand/brand.css`.

## Build

**Bug 1: no asset was lost; the plants' meshes stopped drawing.**

- The count is right. `registry.json` lists 14 assets and `assets/` has 14 recipes, the same files on every branch
  of the repository (and 11 of them, all still here, in the older Sandbox 8 history on `test/e2e-first-screen`). No
  recipe fails to load: no "has no uid" warning, no uid a file names that the registry lacks. "Storms" is no asset:
  the nearest names are Stones and Stone pine; storm is only the wind's strongest level.
- What went missing is the drawing of 8 of the 14, every one the tree kit builds: Holm oak and Stone pine (trees),
  Bracken, Dead wood, Mastic, Moss cushion, Reeds and Rockrose (shrubs). `c83e89e` (2026-11-14 20:59, the trees'
  finest level) gave the kit's meshes a `twig` number, one a corner, and handed it to the library with the rest
  (`meshAt`). `geometryOf` (`assets/index.js`) read every attribute it had no size for as three numbers a corner
  (`size[k] ?? 3`, a list of uv, part, ao and hand). So `twig` came out a third as long as the mesh's corners: its
  buffer too short for the mesh's own indices.
- WebGPU lets a browser drop such an indexed draw whole rather than read past the buffer (the WebGPU spec, on
  indices out of a vertex buffer's range); Safari's WebGPU checks indexed draws against their vertex buffers (WebKit
  bugs 273828, 274699). That is where every tree and shrub, picture and stage, would have gone. WebGL and Chrome's
  WebGPU read on past the end instead, so in the WebGL fallback here the plants still drew (with their twig number
  read wrong). Not seen in Safari by this session: no Safari here.
- The fix: `geometryOf` takes each attribute's size from its own length over the corners', never from a list kept
  by hand; a length that does not divide is said in the console and left out.

**Bug 2: Random reached no rock and no bush.**

- The rocks: `37515d7` (2026-11-14 17:22, the rocks drawn by the one drawer) rewrote the rocks engine's library
  stage without its `seed`. The library still passed it; nothing read it. Now the stage builds from the asset
  re-seeded, and the rock kit's shapes and the engine's geometries are kept by seed as well as by asset
  (`assets/kit/rock.js`, `src/scatter/rocks.js`).
- The bushes: `regrow(seed)` (the tree kit) gave the placement another seed, but a bush, a branch, a reed clump is
  grown from each shape's own `seed` in its file, which it kept. Only the trees, grown from the placement's seed
  through their growth, changed. Now `regrow` moves each shape's own seed as far as the placement's moved: another
  seed is another bush; the file's own seed gives it back exactly.
- Both keep only the last few re-seeded things (rocks' geometries, 32; regrown plants, 4; rock shapes, 512), so
  pressing Random again and again does not pile them up.
- The tree kit changed, so the 8 plants' versions in `registry.json` are new (the registry hashes a kit into what
  uses it).

**Bug 3: one fire's place for every fire.**

- The library loads the whole world, so the world's own fire in front of the tent (`world/places.js`) burns in its
  scene too. Every fire's four draws (coals, flames, sparks, smoke) read where to draw from one uniform, `uFire`,
  which `lightFire` set to the last fire lit. Choosing Flame lit a second fire at the stage and moved `uFire` there;
  choosing anything else took the library's fire out, but the world's, still in the scene, drew at `uFire`: on the
  stage, for good. Its light (`fireLight`, on every placed asset) stayed there too.
- The fix (`src/world/fire.js`): each fire draws at its own place (`F.at`); `uFire` is only the light, the last lit
  of the fires in the scene, handed back to the one before when a fire leaves the scene.
- And the library frees what leaves the stage (`free`, `library.html`): every geometry, material and object of it
  (before, only geometries), a skeleton's lines and the body lines with it (`clearStage` did not take the body lines:
  shown, they would stay on under a biome, a material or a character chosen next), and the material it held in the
  pool. A person and the materials'
  ball are kept and say so (`userData.kept`) instead of hiding from the traversal.
- The fire has no loop of its own: it moves by the shaders' clock (`U.uTime`), so taking its draws out is all.

**Found, not changed:** the coals are never drawn: on their line in `src/world/fire.js` a comment swallows the
`.add(…)` that spreads their disc, so its four corners are one point. Intent 0018's to look at.

**Seen with:** headless Chromium here has no GPU; WebGPU on SwiftShader drew nothing (a white canvas), so the checks
ran the game's WebGL fallback (`?webgl`) in the full Chromium build. Main's code ran beside the branch on a second
server (port 5174) for the before.

## Propose

**Delivered:** on branch `fix/library-assets-seed-fire`, rebased onto main after #6: every tree and shrub's mesh is
whole again (its picture and its stage); Random makes Boulders, Stones and every shrub again from another seed as it
already did the two trees, and Own gives each back; a fire taken off the stage goes out and its light returns to the
tent's; whatever leaves the stage is freed.

**Checks, as they were** (headless Chromium here has no GPU and drew nothing under WebGPU, so every check ran the
game's WebGL fallback, `?webgl`; main's code at `8dbee19` ran beside the branch on a second server for the before.
Screenshots in the session's scratchpad, `shots/`.)

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed, in WebGL | the branch: "Assets · 14", each of the 14 chosen in turn and standing on the stage (`after-sheet.png`), each list picture drawn (508 to 5184 pixels of 72²). Main under WebGL drew the same 14 (`before-sheet.png`): what Samuel lost is WebGPU's to drop, not seen here. The defect itself, `geometryOf` run on both: on main each of the 8 plants' geometry has `twig` a third of its corners (Holm oak: 4730 corners, indices up to 4729, `twig` 1576.7), on the branch every attribute is whole |
| 2 | passed | Random, then Own, script-pressed: on main Boulders, Stones and Mastic kept the same shapes (seeds 80107, 92229, 68591), only Holm oak changed. On the branch all four changed (Boulders 58673, its 7 rocks; Stones 43134; Mastic 8187; Holm oak) and Own gave each its first shape back (the same corners, by count and sum). Off the page, value for value, for all 10 seeded assets: another seed another mesh, the own seed the same one. Screenshots: `after-wide-boulders-own.png`, `after-wide-boulders-random.png` (seed 100, then 60224) |
| 3 | passed | Main: with Flame chosen both fires in the scene drew at the stage (-1161.4, -137.4), the light there too; after Bell tent and after Stones the world's fire still drew at the stage, lit, and showed in the Grass, Mastic, Stones, Reeds and Moss cushion shots. Branch: on Flame one fire at the tent (-1263.3, 624.4) and one at the stage, the light at the stage; after Bell tent, Stones or Fire pit only the tent's left, and after Fire pit the light read back at the tent (the first run read the light through a second copy of `fire.js`, not the page's, and is not counted); no fire in those shots (`after-fire-*.png`, `after-wide-firepit-after-flame.png`). The game's own page: one fire, at the tent, lit (`after-game-start.png`) |
| 4 | passed | two rounds of all 14 assets, a material and the character: branch 12 scene children, 40 geometries, 56 programs, 61.3 KB of uniform buffers after both rounds; main 65 programs and its uniform buffers grew from 133 KB to 158.8 KB, round on round |
| 5 | passed | no page errors and no console errors from the game, on main or the branch: only SwiftShader's own "GL Driver Message … Running out of reserved outsideRenderPass queueSerial" warning, a few times a run, on both |

**Known gaps:**
- Not seen in Safari or on any GPU: Samuel's Safari is where the trees and shrubs went missing; that the fix brings
  them back there is reasoned from the code and the WebGPU spec, not seen.
- "Storms" matched no asset; if Stones or Boulders are also missing for Samuel, nothing here explains it: their
  meshes are whole and they drew on main as on the branch.
- The coals never draw (a comment swallows their spread: Build, above); left to 0018.
- No story folder: like 0019–0023, the day's story is the storytelling skills' to tell.

## Story

## Archived

---

## Todo

- [x] Why the trees and shrubs are missing, and the fix
- [x] The seed for rocks, trees and shrubs
- [x] Switching frees what stood: the fire first, then every asset
- [x] Checks 1–5 in Chromium (WebGL), with screenshots
- [x] Draft PR against main: https://github.com/MaiaCityCoop/theOS/pull/8
- [ ] Seen in Safari on a GPU: the trees and shrubs back in the library (Samuel)
- [ ] The coals (0018): the comment that swallows their spread

## Changelog

### 2026-11-15

- **Asked:** three bugs in the library: trees, "storms" and shrubs missing (the Assets card shows 14); Random does
  nothing on the rock; the fire stays once chosen.
- **Delivered:** the causes found and fixed: the tree kit's `twig` read at the wrong size since `c83e89e` (every
  tree and shrub's mesh short of a buffer: a draw WebGPU may drop); the rocks' stage without its seed since
  `37515d7`, and the bushes' own shape seeds that Random never moved; one fire position for every fire, so the world's
  own fire burned on the stage once the Flame was chosen. The library frees all that leaves its stage. Draft PR
  #8 against main.
- **Good:** seen in Chromium (WebGL): on main, Random left the rocks and the mastic as they were, and once the Flame had
  been chosen the world's fire drew at the stage under whatever came next (seen in the Grass, Mastic, Stones, Reeds
  and Moss cushion shots); on the branch every seeded asset changes and comes back, the fire goes, and two
  rounds of every asset leave the renderer's memory as it was. The 14 is the right count: no asset was ever lost.
- **Broke / not there yet:** not seen in Safari, where the plants went missing (no Safari, no GPU here); WebGPU on
  SwiftShader drew nothing, so all of it was seen through the WebGL fallback. The coals never draw (a comment in
  `fire.js` swallows their spread): found, left to 0018. PR #6 merged into main meanwhile; rebased onto it.

### 2026-11-15 (2)

- **Asked:** (the session that hands out the work, for Samuel) main moved again (PR #7): merge it in, not rebase,
  and run the browser checks again; then, PR #8 merged, finish them against main.
- **Delivered:** PR #7 merged into the branch (`cadc8f8`, no conflict: this work's lines in `library.html` are all in
  its script). PR #8 merged into main as `7b17433` (by Samuel's account, 16:30), CI green there, and the Deploy
  workflow ran on it at 16:31 and succeeded (to next, the handing-out session says). `cadc8f8` holds the same files as `7b17433`, so the checks run on it are
  main's. All five passed again (WebGL fallback, as before): the 14 assets standing on the stage with their pictures
  (`merged-sheet.png`), none with a fire after the Flame; Random changed Boulders, Stones, Mastic and Holm oak and Own
  gave each back; with the Flame two fires, each at its own place, the light at the stage, after it only the tent's,
  the light back there; two rounds of every asset left 12 scene children, 39 geometries, 56 programs and 61 KB of
  uniform buffers both times; the game's own page has its one fire at the tent; no console errors but SwiftShader's
  own driver warning.
- **Good:** nothing changed by the merge.
- **Broke / not there yet:** still not seen in Safari; it is on next now for Samuel to open. Putting the branch back on
  main by force was refused here, so it took main by a merge instead (`c55dd4b`).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `386638e` | Every attribute by its length; seeds for rocks and bushes; each fire at its own place; the stage freed |
| 2026-11-15 | `cadc8f8` | origin/main (`5572523`, PR #7) merged in |
| 2026-11-15 | `7b17433` | PR #8 merged into main (deployed to next) |
| 2026-11-15 | `c55dd4b` | origin/main (`7b17433`) merged back in, for this record |
