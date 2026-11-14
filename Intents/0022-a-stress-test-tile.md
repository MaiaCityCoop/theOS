---
id: "0022"
title: A Magic Wonder tile (the stress test) beside the Lenses
state: propose           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0022 · A Magic Wonder tile (the stress test) beside the Lenses

## Idea

The dashboard has a Lenses tile that opens the game through nine film lenses. Next to it, a
**StressTest** tile, so the actual stress test (the world with millions of assets, which once ran
at 60 fps) is one click away, opened inside the dashboard's game frame like the Lenses.

## Define

Asked for outright; the definition holds no surprise, so built straight away.

**Deliverables**

1. A StressTest tile on the OS dashboard (`OS/src/main.js`, `OS/index.html`), in one row with
   the Lenses tile, in the Lenses tile's look (label, heading, one line, the go arrow), side by
   side at phone width too.
2. Clicking it opens the game with `?stress&in=os` in the dashboard's game frame; the frame's bar
   names it "Magic Wonder" beside Walk, Lenses and Library.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Lenses and StressTest in one row, desktop and phone | http://localhost:5180, screenshots at desktop and 375 px |
| 2 | StressTest opens the stress world in the frame | click it; the frame's `src` ends `/?stress&in=os`; screenshot of the world full of kinds |
| 3 | No console errors | the console of the dashboard |

**Out of scope**

- The stress stand itself (`TheGame/src/scatter/stress.js`) and its frame rate.

## Build

- The stress test is the game's own page with `stress` in the address (`TheGame/src/main.js`,
  `TheGame/src/scatter/stress.js`), so it is a fourth framed view: `stress: ['Stress test', '/?stress&in=os']`.
- Library, Lenses and StressTest are three equal tiles (`span 4`) in one row on a desktop; under
  980 px, where every tile takes the whole row, Lenses and StressTest (`.tile.pair`) keep half a
  row each, so they stay side by side on a phone. The Lenses tile was `wide` (span 8); it gives
  half of that to the stress test.

## Propose

**Delivered:** the Magic Wonder tile (the stress test) beside Lenses on the OS dashboard; it opens
`/?stress&in=os` in the dashboard's game frame. On main.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | at 1440 px Assets, Lenses and Magic Wonder stand in one row (each 438 px wide, top 580); in a ~460 px pane Lenses and Magic Wonder share a row (208 px each) |
| 2 | passed | the click sets the frame's `src` to `http://localhost:5174/?stress&in=os`; the world shows the zoo's coloured kinds in the plots, HUD 60 fps, 10 draws, 0.30 M tris |
| 3 | failed, not from this work | the stress stand logs `Compute pipeline creation failed: The number of uniform buffers (13) in the Compute stage exceeds the maximum per-stage limit (12)` and then invalid-pipeline errors every frame. The same happens with `/?stress` opened alone; the plain walk (`/?in=os`) logs none |

**Known gaps:** the stress stand's compute pipeline above (one of its compute shaders binds 13
uniform buffers, one over the limit), so it likely draws far fewer than its 898 million; the OS
production build fails on a pre-existing `(max-width:700px){.channels…}` line missing `@media` in
`OS/index.html`.

## Story

## Archived

---

## Todo

- [x] The tile, the view, the click
- [x] Screenshots of the row and of the opened stress test (after the GPU is clear)
- [ ] The stress stand's compute pipeline: 13 uniform buffers, limit 12 (a separate fix)

## Changelog

### 2026-11-14

- **Asked:** a StressTest tile in the Lenses' row that opens the actual stress test.
- **Delivered:** the tile and the framed view.
- **Good:** —
- **Broke / not there yet:** not yet seen in a browser (waiting for the shared GPU).
- **Asked:** name the stress test page "Magic Wonder".
- **Delivered:** the tile's heading and the frame bar's button read "Magic Wonder"; the address stays `?stress`.

### 2026-11-14 (later)

- **Asked:** merge into main and push; then the screenshots once the GPU was clear.
- **Delivered:** on main; the row and the opened Magic Wonder seen in the browser.
- **Good:** the row holds at desktop and phone width; the click opens the stress world in the frame.
- **Broke / not there yet:** the stress stand's own compute pipeline error (not this tile's).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-14 | `3609caf` | the StressTest tile, its framed view and CSS |
| 2026-11-14 | `c48ca57` | named Magic Wonder |
