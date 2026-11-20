# 0038 · SSOT audit of train 1 (2026-11-18)

A read-only audit of `aven/0038-train-1` (640988c: main ecc80f2 + #78, #77, #84, #81, #72, #82) against intent 0038's target: **one source** (the full-detail asset), **one measure** (`ERROR_PX`), every coarser representation derived from the asset and chosen by that measure, cost held by per-class budgets, and every GPU resource sized from the device's own limits. Nothing was run; findings are from the code. File:line refer to `TheGame/` at 640988c.

## Four structural breaks

1. **`ERROR_PX` is a constant, not a dial.**
   - It's fixed at `src/detail/error.js:12`, baked into the workers' levels and rooms, and written into shaders as `float(ERROR_PX)` (`cut.js:41`).
   - The governor never turns it. Its only detail dial is the lens-stretch cap (`governor.js:52`), which does nothing at lens 1.
2. **Two definitions of a pixel.**
   - Worker builds and the cut use `BUDGET_DRAWN = 4/3` (`error.js:15`; `measure.js:48` `DRAWN=false`).
   - The impostor switch, clump and impostor mips, and the relief use the live `U.uDrawn` (`trees.js:92`, `:270`, `:414`; `impostor.js:236`; `pages.js:65`).
   - The governor may drop the drawn ratio to 0.6 (`governor.js:38`). Impostors then arrive about 2.2× nearer than the clumps were planned for: the blobby trees seen in Safari ("drawn ×0.60").
   - The gate runs at exactly 4/3 (`tools/gate.js:76`), so it never sees this.
3. **Some rungs' "error" is only their bake's texel, not their geometric error.**
   - Clumps: `crowd.js:226`, `side/TILE`. The planes misplace leaves by up to about side/2, roughly 16× more, so clumps come at about 40–50 m.
   - Impostors: `crowd.js:221`, `trees.js:499`. They ignore view spacing (10×10 views) and single-quad parallax.
4. **Capacities are sized once and never re-derived.**
   - They're set for a 68° lens and a window of at most 1440 px. On overflow, things are dropped in **scan order**, not by distance (`tier.js:182`); only `?truth` sorts nearest-first (`:181`/`:186`).
   - "a tier had more patches than it holds: the farthest left out" comes from `MAXP = 384` (`tier.js:21`) × P² per tier.
   - It overflows on the trees' 40 km far level (P capped at 256), on any zoom, and on windows taller than 1440 px.
   - Per-draw caps drop **silently**: `trees.js:680`, `drawer.js:658` and `:727`, `grass.js:147`, `placed.js:219`, `rocks.js:98`, `tier.js:106-112`.

## The target form

- **`?truth` is not a mode.** It's the same pipeline with `ERROR_PX` → 0, plus an offline supersampled-still profile (`screen.js:34`, `temporal.js:175`/`:196`, `boot.js:115`).
- **Every rung carries its error in object space.** Switches are decided at runtime as projected error ≤ `ERROR_PX` × the live pixel. The governor turns `ERROR_PX` together with resolution under the per-class budgets.
- **Hand-set numbers only where physical or artistic.** Everything else is derived from the measure, the budget or the device, or deleted.

## Deviations, by owner (train 2)

| Area | Main deviations (file:line) | Owner |
|---|---|---|
| **The dial, one pixel, packing, capacities** (#82 v2) | `error.js:12`, `:15`; `measure.js:48`; `governor.js:52`; `uDrawn` users; `MAXP` `tier.js:21`; per-draw caps (above); scan-order drop `tier.js:182` | MacBook, agent 1 |
| **Rung errors and atlases** | `crowd.js:221`, `:226`; `trees.js:499`; `CELL 128`, `VIEWS 10`, `TILE 32`, `TILES 28`, `CLUMPS 256` (`crowd.js:73-77`); `SWELL 3` uncounted (`crowd.js:65`); `SWITCH .72`, `WIN 1.3`, `FADE .15`, `RATIO 3` (`crowd.js:70-80`); hand-overs above the switch (`error.js:26`) | MacBook, agent 2 |
| **Land and ground** | Meadow end `ground.js:19-23` (112 m); carpet `material.js:88-99`, `:193-212`; octaves `land.nodes.js:113-114`; layer fades `layers.js:46`, `:52`, `:81`; `terrain.js:17-20`, `CAP 4096` (`:82`, silent); `relief.js:29`; `growth.js:24-26`; `pages.js:49`, `:418`, `:448`; truth branches `material.js:19`, `terrain.js` ×16, `relief.js:54`, `pages.js:46`/`:56`/`:72`/`:255` | Task A |
| **Extents, shadows, pyramid, light resolutions** | Far plane `boot.js:87` vs land 24.6 km, pages 26 km, froxels 24 km, trees about 40 km; `shadow.js:28-36`; caster reaches `trees.js:608`, `tree.js:355`, `rocks.js:39`, `placed.js:152`; `occlusion.js:67` (pyramid made once); the canvas pass's unused 4K depth store; `canopy.js:29`, `air.js:36`, `light/screen.js:34-35`, `clouds.js:59` | Task B |
| **Gate** | Ceilings as a rule; the truth's cold start (frame-paced building ×30); `?truth` = `ERROR_PX` → 0 (`measure.js:65-69` `REACHES 600`, `:76`/`:79`/`:97` `BIG`, `:82`/`:86-90`/`:102`, `handover.js:33`, `layers.js:243`, `tier.js:181`/`:186`, `trees.js:675`, `drawer.js:727`, `rocks.js:35`, `grass.js:137`); a `scale.js` ratchet on `TRUTH` branches and unexplained thresholds | Task C |
| **Upscale** | 63 divisions a pixel, inexact lens inverse (#86) | MacBook (done, train 2) |

## Top 10 likely visible problems at distance (reasoned, not yet seen)

1. Missing patches from the patch cap, dropped in scan order, near or far by heading.
2. Silent per-draw cap drops: a missing block of forest or grass.
3. Blobby clumps from about 40–50 m (clump error = texel only).
4. Impostors too near (texel-only error; live `uDrawn` at 0.6 → about 25–55 m).
5. Stacked error overspend: `SWITCH` ×1.39, hand-overs above the switch ×1.5, fixed 4/3 against the live pixel, uncounted `SWELL`, so 2–3 px.
6. Hard grass edge at 112 m: the ground map's size, carpet fades set separately, rings frozen at startup `innerHeight`.
7. Fades in metres: the alpha cut `trees.js:304`, ground shading, terrain octaves, layer fades.
8. Shadow rings at 30, 70, 80 and 100–900 m.
9. Density steps at the growth map's about 1 km reach; stones ending at 112 m.
10. Far extents disagreeing (30, 24.6, 26, 24 and about 40 km); land nodes past `CAP 4096` dropped silently; relief past `CAP 512` drawn flat.

The full tables (every `TRUTH` branch, about 60 constants, about 25 capacities, each with its first-principles form) are in the master session's audit report; ask the master for any file:line.
