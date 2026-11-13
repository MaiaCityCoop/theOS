---
id: "0015"
title: Click something that moves, and the camera walks behind it
state: propose           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-13
story:
---

# 0015 · Click something that moves, and the camera walks behind it

## Idea

Samuel's words (typos tidied): "Can you add a 'character' follow logic, that when we click on a moving character
the walk-behind camera auto-follows?"

## Define

**Deliverables**

1. A click (not a drag) on something that moves, where the mouse is free, hangs the one camera (intent 0003) behind
   it: its point becomes the mover's, it swings round behind it as it turns and comes down to a follow height.
2. It follows until a move key, Esc, or a click on bare ground; the wheel still changes its height, a drag still
   looks around (intent 0014). The line under the pill says what it follows and how to let go.
3. One registry of what moves (`src/world/movers.js`): a source adds how to find its mover nearest a point; the
   stress stand's herds are the first. One way of finding the ground under the pointer (`src/world/pick.js`), shared
   with the city's plots.
4. Its numbers in `TheGame/camera/rig.js` (`follow`).

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | A click on a mover follows it, from behind | `?stress`, town height, click a mover: the mover straight ahead (cos 1.00) as it walks; the height eases down |
| 2 | Letting go | W, then Esc: following none, the band's hint back |
| 3 | The hint holds through a band change | following from town to street: the line still says Following |
| 4 | The city's plots still pick | the game without `?stress`: a click on a plot opens its card |

**Out of scope**

- Following in POV with the mouse held (a click there takes the mouse); characters other than the stress stand's
  herds (none move in the world yet).

## Build

- The rig's pointer handlers run in the capture phase; a click that finds a mover stops there, so the city does not
  also pick the plot under it.
- A mover's heading is where it will be in a quarter of a second; the rig's yaw eases to it (`follow.turn`).
- The stress stand answers by the same reckoning as its shader (`moverAtJS` on `U.uTime`), looking only in plots
  near the click.
- One `hint()` writes the line under the pill (band, held mouse, following), so a band change no longer overwrites
  the follow line.

## Propose

**Delivered:** `src/camera/rig.js` (follow, click to pick, `hint`), `camera/rig.js` (`follow`), `src/world/movers.js`,
`src/world/pick.js`, the stress stand's herds registered, the city on the shared ground pick. Look at it on
`/game/?stress`: rise to town, click a creature.

**Checks, as they were** (2026-11-13, the app's browser pane)

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | clicked a "ten legs" at 35 m: after 1.5 to 6 s the mover straight ahead (1.00) every time, the height 26 → 15 m on its way to 8 |
| 2 | passed | W: following none; Esc: following none, the town hint back |
| 3 | passed | at 15 m the line still read "Following ten legs · WASD or Esc lets go" |
| 4 | not run | the city's click path now goes through the shared `groundAt`, same code moved; not clicked by hand |

**Known gaps:** check 4 by hand. With a mouse that is held (eye, street) a click does not pick: rise to town to pick.

## Story

## Archived

---

## Todo

- [x] Follow from behind
- [x] Let go by keys and Esc
- [ ] Click a city plot by hand (check 4)

## Changelog

### 2026-11-13

- **Asked:** click a moving character and the camera follows it from behind.
- **Delivered:** click to follow, Esc or a move key to let go; one registry of movers, one ground pick.
- **Good:** the mover stays dead ahead as it walks; nothing of the movers kept, all reckoned from the clock.
- **Broke / not there yet:** the follow line was overwritten at a band change on the first try; fixed with one hint.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-13 | `64ca23a` | Follow a mover from behind; movers registry; shared ground pick |
