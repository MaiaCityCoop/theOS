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
3. One registry of what moves (`src/world/movers.js`): a source adds how to find the first of its movers along a
   line of sight; the stress stand's herds are the first.
5. In POV, the mouse held, a click picks what is under a crosshair in the middle of the screen; the crosshair shows
   only while the mouse is held and lights when something under it can be followed. One way of finding the ground under the pointer (`src/world/pick.js`), shared
   with the city's plots.
4. Its numbers in `TheGame/camera/rig.js` (`follow`).

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | A click on a mover follows it, from behind | `?stress`, town height, click a mover: the mover straight ahead (cos 1.00) as it walks; the height eases down |
| 2 | Letting go | W, then Esc: following none, the band's hint back |
| 3 | The hint holds through a band change | following from town to street: the line still says Following |
| 4 | The city's plots still pick | the game without `?stress`: a click on a plot opens its card |
| 5 | Picking in POV | `?stress` at eye level, 9 m from a creature: a click on it, and a click in the screen's middle facing it, both follow |

**Out of scope**

- Characters other than the stress stand's herds (none move in the world yet).

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
| 4 | passed | the game without `?stress`, 2.5 km up: a click on the map opened Vision Village's card |

| 5 | passed | at eye level a click on a "ten legs" 9 m off followed it; facing it, a click in the middle followed the first on that line (a runner, nearer) |

**Known gaps:** none left: the crosshair, which the app's browser pane could not show (it does not hold the mouse
for a scripted click), was checked by hand by Samuel: "it works now".

## Story

## Archived

---

## Todo

- [x] Follow from behind
- [x] Let go by keys and Esc
- [x] Click a city plot (check 4)
- [x] Pick in POV, at the crosshair (check 5)
- [x] See the crosshair light over a creature, by hand (Samuel, 2026-11-13: "it works now")

## Changelog

### 2026-11-13

- **Asked:** click a moving character and the camera follows it from behind.
- **Delivered:** click to follow, Esc or a move key to let go; one registry of movers, one ground pick.
- **Good:** the mover stays dead ahead as it walks; nothing of the movers kept, all reckoned from the clock.
- **Broke / not there yet:** the follow line was overwritten at a band change on the first try; fixed with one hint.

### 2026-11-13 (2)

- **Asked:** "in POV mode the mouse is captured, so we can't select a moving asset, right?"
- **Delivered:** picking along the line of sight instead of the ground point under the pointer (a creature seen
  ahead at eye level was missed: the line meets the ground behind it); in POV a click picks at a crosshair in the
  middle, which lights over something to follow.
- **Good:** one pick for both: the pointer's line where the mouse is free, the middle's where it is held.
- **Broke / not there yet:** the crosshair not seen in the pane (no held mouse there).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-13 | `64ca23a` | Follow a mover from behind; movers registry; shared ground pick |
| 2026-11-13 | `6aa7ee7` | Pick along the line of sight; POV picks at a crosshair |

### 2026-11-13, taken out again (20:57)

Samuel: "remove the follow cam again, this is weird, and recover the previous cam control". The two code commits
(`64ca23a`, `6aa7ee7`) are reversed: `src/camera/rig.js`, `camera/rig.js` and `src/city/index.js` are as they were
before them, `src/world/movers.js` and `src/world/pick.js` are gone, the stress stand no longer says where its
movers are for a click. Done from the session of intent 0008. (Before that, one of that session's deploys had written
an older `stress.js` over this intent's second commit: a click then built nine million movers and the page froze;
that was put right at 20:25, see intent 0008.)

