---
id: "0014"
title: Look around at every height, the mouse held only in POV
state: propose           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-13
story:
---

# 0014 · Look around at every height, the mouse held only in POV

## Idea

Samuel's words (typos tidied): "Can you fix my camera? We can only look around in all axes in POV mode, but we
want to be able to look around at every level instead of having a fixed static angle. How does Cities: Skylines do
it, without having to capture the mouse for the camera movement?" And: "R/F and Q/E aren't needed, right? Drag
already solves it." "Ensure one clean shared camera everywhere."

The one camera (intent 0003) sets its pitch by its height alone: free mouse-look only at eye level, and there only
with the pointer locked; from street height up the angle is fixed.

## Define

**Deliverables**

1. At every height the view looks around: left and right turns, up and down tilts the view from the height's own
   pitch, from straight down to above the horizon. In POV (eye and street) the mouse is held as before (a click
   takes it); from town up a drag does it and the mouse stays free.
2. The tilt turns the view where the camera is; it never moves the camera (where it hangs is still the height's).
3. A small scroll keeps the tilt you chose; a long one eases it back to the height's own view (Cities: Skylines'
   zoom-to-tilt, without fighting a chosen angle).
4. All of it as numbers in `TheGame/camera/rig.js` (`tilt`); the same pose for the game, the films and the library
   (`poseAt`).

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Tilt to the horizon at town height, no lock there; POV still locks | game at ~40 m, drag up: pitch near 0; `document.pointerLockElement` null |
| 2 | Tilt leaves the camera where it is | the camera's height unchanged by the drag |
| 3 | Small zoom keeps the tilt, long zoom eases it back | wheel out a little, then a lot; read the pitch |
| 4 | Eye level still walks and looks | wheel down to eye; pitch and band as before |

**Out of scope**

- R/F tilt keys (drag does it); the library's own stage controls; the old `src/camera/walk.js` (unused).

## Build

- The pitch is now the height's own (`own`) plus the tilt (`look`) at every height, held within `tilt.up` and
  `tilt.down`; how far the camera hangs back is reckoned from the height's own pitch, so tilting is a look-around in
  place. Before, `look` counted only at eye level (`free`).
- Pointer lock kept where the rig's `lock` column says (eye, street: POV), as Samuel asked after a first cut
  removed it; from town up a left-button drag looks and the cursor stays free, so picking still works. Touch already turned and looked with one finger; it now tilts at every height too.
- The tilt fades by `exp(-tilt.fade · |Δ ln h|)` as the height changes.

## Propose

**Delivered:** `TheGame/camera/rig.js` (`tilt`, no `lock`), `TheGame/src/camera/rig.js` (pitch, drag, fade),
the touch comments. Look at it on `/game/`: scroll out to town, drag up and down.

**Checks, as they were** (2026-11-13, the game on its own, Chrome in the app's browser pane)

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | at 41.7 m a drag up gave pitch −0.06 (the river to the horizon), pointer lock null; at 57 m (town) a drag tilted to +0.54, no lock asked; at eye level a click asked for the lock |
| 2 | passed | the camera stayed at 34.6 m through the drag |
| 3 | passed | 42 → 67 m: pitch −0.20 (tilt kept); → 1653 m: −0.84 (the height's own ≈ −0.9) |
| 4 | passed | down to 2.7 m: band eye, pitch −0.08 |

**Known gaps:** films and the bench pass `look` to `poseAt`; it now tilts at every height (the bench's −0.05 tilts
its views by 3°). Not checked on a phone.

## Story

## Archived

---

## Todo

- [x] Tilt at every height
- [x] Pointer lock only in POV
- [x] Fade on long zoom
- [ ] Try on a phone

## Changelog

### 2026-11-13

- **Asked:** look around at every height like Cities: Skylines, without capturing the mouse; one shared camera.
- **Delivered:** drag tilts and turns at every height, the mouse free; tilt eases back on a long zoom.
- **Good:** one formula for the game, the films and the library; the camera's place untouched by tilting.
- **Broke / not there yet:** not tried on touch devices.

### 2026-11-13 (2)

- **Asked:** "the POV capture should still happen".
- **Delivered:** pointer lock back in eye and street (the rig's `lock`); tilt by drag from town up kept.
- **Good:** checked: a click at eye level asks for the lock; in town a drag tilts with no lock.
- **Broke / not there yet:** the first cut had removed the lock everywhere.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-13 | `5d44df5` | Drag tilts at every height, no pointer lock, tilt fades on a long zoom |
