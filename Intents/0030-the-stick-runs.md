---
id: "0030"
title: The stick runs
state: propose            # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story:
---

# 0030 · The stick runs

## Idea

> Can you also ensure that on mobile/tablet mode the speed of moving increases up to the fast desktop shift mode, when we move the joystick further out of its circle?

On a phone or a tablet the joystick walked, and jumped to the run when it was pushed to 92% of its reach. Samuel wants
the speed to rise as the thumb goes further out past the circle, up to the run that Shift gives on a computer.

## Define

Samuel asked for this directly and the definition holds no surprise, so it was built straight away.

**Deliverables**

1. Inside the joystick's rim, as before: it walks as fast as it is pushed, nothing in the dead centre.
2. Past the rim, the speed rises evenly from the walk to Shift's run, reached one radius further out
   (`camera/touch.js` `stick.run`), and stays there beyond; the knob follows the thumb out to there.
3. Shift on a keyboard: the run, as before.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The speed by how far the thumb is from the stick's middle | Chromium at phone size with touch: pointer events on the stick, one step of the rig (0.5 s) read off the camera, at 0.05, 0.5, 1, 1.25, 1.5, 1.75, 2 and 3 radii (`?ghost`: nothing in the way) |
| 2 | The knob under the thumb out to the run and no further; back in the middle when the thumb lifts | the same: its transform |
| 3 | Shift held with the stick at its rim is the stick's run | the same |
| 4 | On Samuel's phone and a tablet | next.maia.city after the deploy |

**Out of scope**

- The speeds themselves (`camera/rig.js`: at eye level 3.2 m/s walking, 9 running).

## Build

- `src/camera/touch.js`: `move.run` is a number now, 0 … 1, how far past the rim over one radius (`stick.run`); before,
  a yes or no at 92% of the reach. The rig mixes its height's walk and run by it (`src/camera/rig.js`; Shift is 1).
- The knob may leave the ring: it follows the thumb out to the full run, so the thumb sees how far it is.

## Propose

**Delivered:** the joystick walks inside its rim and speeds up evenly past it to Shift's run, one radius further out;
the knob shows how far out it is.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | at eye level, in m/s: 0 at 0.05 radii (the dead centre), 1.35 at 0.5, 3.2 at 1 (the rim: the walk), 4.68 at 1.25, 6.15 at 1.5, 7.63 at 1.75, 9 at 2 (Shift's run), 9 at 3. Without `?ghost` the walker ran into the tent from 1.75 on |
| 2 | passed | the knob 27.5, 56, 70.25, 84.5, 98.75, 112 and 112 px out: under the thumb to two radii (112 px), no further. Lifted: back in the middle, speed 0 |
| 3 | passed | Shift held, the stick at its rim: 9 m/s |
| 4 | not run | needs the deploy and Samuel's phone |

**Known gaps:**

- Seen with synthetic touches in Chromium, not on a phone. How far a thumb likes to reach is Samuel's to say
  (`stick.run`: one radius).
- No story folder: stories are told by day now.

## Story

## Archived

---

## Todo

- [x] past the rim: the walk rising evenly to Shift's run
- [x] the knob following the thumb out to the run
- [ ] Samuel tries it on his phone and a tablet

## Changelog

### 2026-11-16

- **Asked:** "Can you also ensure that on mobile/tablet mode the speed of moving increases up to the fast desktop shift mode, when we move the joystick further out of its circle?"
- **Delivered:** past its rim the joystick's speed rises evenly from the walk to Shift's run, reached a radius further out; the knob follows the thumb there.
- **Good:** One number decides how far out the run is (`camera/touch.js`); the rig treats Shift and the stick the same way.
- **Broke / not there yet:** Not tried on a phone yet.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `efbbf0f` | the joystick past its rim: from the walk to Shift's run a radius further |
