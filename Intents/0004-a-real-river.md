---
id: "0004"
title: A real river, its banks and its water
state: build             # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0004 · A real river, its banks and its water

## Idea

Samuel's words (typos tidied): "What can you do about making the bank biome and the river biome way more realistic?
And make the river a bit more alternating in width, like a real river; tell me first what the steps are." Then: "So we
would introduce a new biome, bare earth, too? And any mini asset like a stone that you introduce, ensure it starts in
the library as the source of truth, right? So go ahead and implement the optimisations."

Today the river's half-width drifts only between 6.75 and 11.25 m; its bed is the same shallow cut everywhere (1.2 m);
its bank an even strip of sand some two metres wide on both sides; its water one flat sheet.

## Define

Samuel asked for it outright after the steps were laid out ("go ahead"); the definition below holds no surprise, so it
is built at once.

**Deliverables**

1. Width from the river's own shape: wider through bends (where bars grow) and varying along it; about 4.5 to 15 m
   half-width.
2. An uneven cross-section: on the outside of a bend a steep cut bank, up to about 1.5 m of earth, deep water at its
   foot; on the inside a long, gentle point bar; narrow stretches deeper. The channel's middle shifts towards the
   outside of a bend.
3. Two new biomes, files in `biomes/` and shown in the library: *Cut bank* (bare earth) and *Gravel bar* (pebbles and
   sand on the inside of bends); the riverbank keeps the sand between them.
4. The water by its depth: clear over the shallow bar, dark in the deep water at the cut bank.
5. Every new small asset (reeds, driftwood, later) is a file in `assets/` and in the library first.
6. All of it in both the GPU's land and the CPU's (`WORLD_GLSL`, `world/land.js`), so the walker, collision and camera
   feel the real banks.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Width varies like a river | the half-width sampled every 10 m along 2 km of the river: max / min at least 3 |
| 2 | Bends look like bends | stills of a bend (bar inside, cut bank outside) and of a straight |
| 3 | Walk it | the walker climbs down a bar into the shallows; a cut bank is steep |
| 4 | Frame time | on the river at eye level and in town: at or under 16.7 ms |
| 5 | Biomes in the library | Cut bank and Gravel bar listed, with their cards and sandbox |

**Out of scope:** reeds and driftwood as assets (next), riffles' white water, flow speed by width.

## Build

- The river's bend is measured where you are: its course 20 m either way (`riverAt` in `world/land.js`, `riverInfo` in
  `WORLD_GLSL`, the same numbers). A bend of 80 m radius or tighter counts fully (`BEND`).
- Width: 4.5 m plus up to 3.5 m along the river (a noise every 90 m) plus up to 7 m through bends: 4.5 to 15 m.
- The channel's middle shifts a quarter of its width to the bend's outside; each point knows its bank: outside (a cut
  bank: the bed drops sharply, the land rises up to 1.3 m in a cliff of earth) or inside (a bar: the bed slopes up
  over a long way, sand and gravel). Narrow stretches are cut deeper (`riverCarve`, `riverBank`).
- Two new biomes, `biomes/cutbank.js` (bare earth: dry earth on the cut bank's face, laid after the slopes' rock so the
  face is earth) and `biomes/gravelbar.js` (gravel and earth on the inside of bends), each with its stones; in the
  library they show the sandbox's meandering river.
- The water's depth is the bed's real depth: clear over a bar, dark at a cut bank's foot.
- The heights take the bank's side everywhere they are worked out: the terrain, the ground texture, the boulders.
- Asked on the way: the intents' board did not show all intents. It read them once when the page opened and folded
  every column empty at that moment; now it reads them each time it opens and folds only empty columns (what you fold
  or open yourself stays). It shows 0002, 0003 and 0004 in Build and 0001 at Propose.

- The slope limit (asked: "slope limit"): on foot, ground steeper than `climb` (0.75 m up per metre, in `camera/rig.js`)
  stops you, and you slide along it; a rise lower than `stepUp` (0.25 m) is stepped up whatever its slope. Driven
  frame by frame: from the water into a cut bank the walker stopped on its face, 2.3 m below its top; up a gravel bar
  it walked 22 m out of the water; on the meadow it walked 3.2 m a second as before.
- Asked on the way ("this doesn't look realistic; transitions between biomes more random, not those hard bank lines"):
  the width now also varies every few metres (0.86 to 1.14 of itself, a noise every 14 m), so the water's edge is
  ragged; every river ground's mask (sand, gravel, earth) reads its distance through two noises (6 m and 1.7 m), so the
  edges fray into the grass and into each other, the grass's own edge with them; the gravel bar is a patchy mix over the
  sand (three quarters at most), not a dark stripe. Looked at from 18 m and in the library's sandbox: 16.7 ms.

**Checks, as they were** (2026-11-12, 1400×800):

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | half-width every 10 m along 2 km: 4.6 to 14.5 m, ratio 3.18 |
| 2 | passed (looked at) | the tightest bend from 26 m: steep earth cut bank outside with deep dark water, a long gravel bar inside with shallow clear water; a straight narrower |
| 3 | passed (with the slope limit) | the profile across the bend: the cut bank falls 2.4 m over about 4 m, the bar rises 0.9 m over 20 m; the walker is not stopped by steep ground (no slope limit), so the cut bank is steep but walkable |
| 4 | passed | eye level on the water and 26 m over the bend: 16.7 ms (60 fps) |
| 5 | passed | Cut bank and Gravel bar in the library, with their cards and the river sandbox |

## Propose

## Story

## Archived

---

## Todo

- [x] Width and cross-section from the bends
- [x] Cut bank and Gravel bar biomes
- [x] Water by depth
- [x] Checks
- [ ] Reeds and driftwood as library assets
- [x] A slope limit for the walker (cut banks to climb only where low)
- [x] Ragged banks and frayed edges between the river's grounds

## Changelog

### 2026-11-12

- **Asked:** a more realistic river and banks, a river alternating in width; the steps first; then a bare earth biome,
  new small assets in the library first, and go ahead.
- **Delivered:** this intent; the river shaped by its bends (width 4.5 to 15 m, cut banks and gravel bars, depth),
  two new biomes, the water by depth; and the intents' board showing every intent.
- **Good:** checks 1, 2, 4, 5 passed; the bends read as a real river's.
- **Broke / not there yet:** the walker can walk up a cut bank (no slope limit); reeds and driftwood not yet.

### 2026-11-12, slope limit and frayed banks

- **Asked:** a slope limit; then: it does not look realistic; the transitions between biomes more random, not hard lines.
- **Delivered:** the slope limit as data; ragged banks; frayed edges between grass, sand, gravel and earth; a lighter bar.
- **Good:** a cut bank stops the walker, a bar does not; the river reads less like a canal.
- **Broke / not there yet:** reeds and driftwood, the next step to make the banks lived-in.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `c30f881` | The river by its bends, two new biomes, the water by depth; the board shows every intent |
