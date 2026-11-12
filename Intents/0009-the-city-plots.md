---
id: "0009"
title: The city's plots over the land
state: propose         # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0009 · The city's plots over the land

## Idea

Samuel, 2026-11-12: "do you remember the plots from maiacity old repo – maia city play game legacy view? we had the
different sized plots (in hexagon like shapes with rounded corners) adding in total to 1.3 million citizens and about
895 or so plots in average 1500 villagers large. can we do something similar to our city, starting to slightly overlay
over our map at around 2–3 km altitude? Also adapting to our actual terrain sizing and zoning. Each plot should be
selectable and should show some of its metadata when selected, incl. its current citizens living there (incl. unlocking
a new village just alongside surrounding connecting villages). The first core village where our tent stands should be
called 'Vision Village'. Also update our movie to be more in 16–18 o'clock time, not in the dark, too late."

The old plan: `maiaCITY/play/site/src/routes/game/map/map.ts` (a jittered hex grid cut by Voronoi, rounded corners,
1,346,269 people / 1500 = 898 villages of about 2.25 km² each).

## Define

Asked for outright; built straight away (the skill's rule: no surprise in the definition).

**Deliverables**

1. The plan: 898 plots laid on the real land round the tent, sized for 1500 people at 1500 m² each, ending at the
   rivers' banks, rocky or broken ground left wild, all 1,346,269 people shared by real area.
2. The overlay: from about 1.5 km up the plots fade in, fully there by 2.8 km; hidden in the film.
3. Picking: a click picks a plot; a glass card shows its name, citizens now, people it is a home for, its land, area,
   heights, water, distance, neighbours, state.
4. Opening: a village beside an open one can be opened from its card; the first is Vision Village, round the tent.
5. The film of story 0001 plays between 16:00 and 18:00.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | 898 plots, people add up, no overlaps, all reachable | `bun` run of `plan()` headless |
| 2 | overlay shows at 2.5–3.2 km | `/game/`, `__s8.controls.height = 2500` |
| 3 | card on click | click a plot |
| 4 | open a village | click a green-edged plot, its button |
| 5 | film hour | `timeline.html?story=0001-…`, `__s8.sky.hour` while it plays |
| 6 | 60 fps with the overlay | `.perf/hitches.jsonl`, frames per post |

**Out of scope**

- Opened villages are kept per browser (`localStorage`, `maia.city.open`), not shared between viewers.
- Village names beyond Vision Village (they are numbered).

## Build

- `world/city.js`: every number (people, per village, m² each, road, corner, river margin, skip, wild rules, seed, the
  core's name, the heights it shows at, the far fade, the neighbour reach).
- `src/city/plan.js`: pure JS on `src/world/land.js` (`riverAt`, `riverRaw`, `heightAt`, `aridAt`, `outcropAt`, and the
  newly exported `noiseAt`). The grid's spacing is measured, not guessed: a first coarse pass finds what the rivers take
  and widens the grid so a plot's real area averages the planned 2.25 km² (spacing 1,759 m).
- Rivers cross the land about every 1.5 km, so nearly every plot meets one. First version clipped each cell at the
  river and lost the land beyond (an empty forest east of the tent). Fixed: a neighbour across a river does not bound a
  cell; each plot takes its own bank up to the water.
- A plot cut off by wild land is joined to the nearest reachable plot, so every village can be opened in time.
- `src/city/plan.worker.js`: the plan in a worker (0.5 to 1.3 s), so the frame never waits.
- `src/city/index.js`: lines as ribbons a constant width on screen, a faint wash per plot, drawn over the ground (no depth
  test), fading out from 9 to 26 km; compiled before it first shows; hover, click, the Vision Village label.
- `src/city/card.js`: the card on the brand's glass (`.glass`, `.g-*`), DM Serif title.
- `Stories/0001-intents-stories-os/timeline.json`: an `hour` on each clip, 16:00 rising to 17:54.

## Propose

**Delivered:** the plots at `http://localhost:5180/game/`, scroll out past 2 km; the film at
`/game/timeline.html?story=0001-intents-stories-os`.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | 898 plots, 1,346,269 people; 0.68–7.7 km² (median 2.38), 415–4,707 people; 20,000 random points within 12 km: 0 in two plots, 83% in one; all 898 reachable from Vision Village; the tent inside it |
| 2 | passed | screenshot at 2.5 and 3.2 km |
| 3 | passed | Vision Village: 2 citizens now, a home for 1,173, 1.92 km² |
| 4 | passed | Village 8 opened, its neighbours turned green; test state cleared |
| 5 | passed | at 0:40 the sky read 17.25 |
| 6 | passed | Chrome pane over the plots: 237–241 frames per 4 s, no hitches, the governor raised the pixel ratio to 2 |

**Known gaps:** opened villages live in one browser only; not checked in Safari yet.

## Story

## Archived

---

## Todo

- [x] plan, overlay, card, opening, film hour
- [ ] Samuel looks at it in Safari
- [ ] where opened villages are kept for everyone (a decision)

## Changelog

### 2026-11-12

- **Asked:** the old map's plots over the land at 2–3 km, selectable with their metadata, opening villages beside open
  ones, the first one Vision Village; the film between 16 and 18 o'clock.
- **Delivered:** all five deliverables above.
- **Good:** the plots follow the rivers; 60 fps held.
- **Broke / not there yet:** the first cut lost the land across each river (fixed the same hour).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `cd66edf` | the plan, the overlay, the card, opening villages, the film's hours |
