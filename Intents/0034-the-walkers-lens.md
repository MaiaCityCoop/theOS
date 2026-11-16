---
id: "0034"
title: The walker's lens
state: build              # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story:
---

# 0034 · The walker's lens

## Idea

> Does it make sense to apply also directly the 50 mm anamorphic lens as default walker lens, and each level we zoom
> out it zooms also all the way up to 16 mm?

Samuel wants the walker to see through the film camera's anamorphic glass: 50 mm at the eyes, and wider with every
step up, to 16 mm at the top.

**Today** (`camera/rig.js`, `fov`: the picture's height in degrees), in the film camera's own lens (`cine/lenses.js`:
the Master Anamorphics, 42.6 mm wide unsqueezed, framed 16 : 9):

| Height | Band | Today | As that lens |
| --- | --- | --- | --- |
| 1.7 m | eye | 68° | 18 mm |
| 5 m | street | 64° | 19 mm |
| 40 m | town | 54° | 23.5 mm |
| 800 m | skyline | 44° | 30 mm |
| 12 km | top | 40° | 33 mm |

So the walker already looks through a very wide lens, and it gets longer going up: the reverse of the idea.

**What the idea would do:**

| Lens | Tall | Wide, 16 : 9 screen | Wide, iPhone upright | Things on screen against today's eye lens |
| --- | --- | --- | --- | --- |
| 50 mm (eyes) | 27° | 46° | 12.6° | 2.8 × larger |
| 35 mm | 38° | 63° | 18° | 2.0 × |
| 28 mm (the kit's widest) | 46° | 74° | 22° | 1.6 × |
| 16 mm (top) | 74° | 106° | 38° | as today's eyes |
| today's eyes | 68° | 100° | 34.5° | 1 |

Two things follow. On an upright phone, 50 mm leaves a slit of 12.6° to walk by. And every range of detail in the
world (the land's levels, the blades, the stones) is measured as today's 68° lens sees it; the governor stretches them
by how much larger a longer lens shows things (`src/core/governor.js`, its lens factor, up to 3 at the start): at 50 mm
nearly three times the detail at eye level, the most used view, or, where it caps that to hold 60 frames a second, a
distance drawn coarser than the lens shows it.

## Define

_A draft: which schedule is Samuel's to choose. Not built before he does._

**The choice**

- **A, as asked:** 50 mm at the eyes, wider with every band, 16 mm at the top.
- **B, the kit's widest at the eyes:** 28 mm at the eyes (74° wide on a desktop, 22° on an upright phone, detail
  × 1.6), wider going up to 16 mm.
- **C, today's angles kept**, named as the kit's lenses (18 to 33 mm), and the anamorphic look brought to the walker
  another way (the film camera's framing, its barrel distortion).
- **D, recommended (asked "what makes lens wise sense?"):** wide at the eyes, longer going up, the reverse of A, as
  today's rig already is: 28 mm at the eyes (the kit's widest: 74° across a desktop), 35 mm over the town and the
  skyline (about today's 33 mm at the top). 50 mm stays the films' and the close-ups'; 16 mm fits no band. On an
  upright phone 28 mm shows 22° across against today's 34.5°, so the lens opens wider on a tall screen; and the detail
  costs about 1.6 times at the eyes unless the governor's ranges are measured again for the new lens. Tried behind
  `?lens=` first, against the 60 frames a second.

**Deliverables** (whichever is chosen)

1. The rig's keys name a focal length (`mm`), and the angle comes from the one lens model the film camera uses
   (`cine/lenses.js`), so "50 mm" means the same picture to a film and to the walker.
2. `?lens=…` tries another schedule without changing the default, to be seen on Samuel's iPhone first.
3. The governor's detail measured against the new eye lens: what it costs at eye level, and whether the ranges are
   re-measured for it.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The picture at every band | stills at eye, street, town and skyline height, before and after, desktop and upright phone (Chromium) |
| 2 | 60 frames a second held, 4K untouched | frame medians and 95th percentiles at eye level and from above, the governor's dial and detail factor, the canvas's size, main against the branch (the harness of 0032) |
| 3 | The films and the library unchanged | their stills against main: they take their lens from their shots |
| 4 | On Samuel's iPhone | `?lens=` on next |

**Out of scope**

- The film camera's own lenses and depth of field.

## Build

Samuel's go, through the coordinating session: "do the most cinematic decision you can make". The decision taken on
it (the coordinating session's, on his word): **schedule E**: 28 mm at the eyes (the kit's widest, the anamorphic walk),
35 mm over the street, 40 mm over the town, 50 mm over the skyline and at the top (a long lens over a city: the aerial
look), and between them a zoom, never a step; the film camera's glass for the walker at every height (its barrel and
the light lost at the corners), without its depth of field, subtle; on an upright phone no slit (D's way: the lens opens
wider on a tall screen); `?lens=` kept; the films and the library as they were.

**The lens**: the rig's keys name a focal length (`camera/rig.js`: `mm`), and the angle comes from the film camera's one
lens model (`cine/lenses.js`: the Master Anamorphics, 42.6 mm wide unsqueezed, framed 16 : 9), so "28 mm" is the same
picture to a film and to the walker (`fovOf` in `src/camera/rig.js`). Between keys the focal length eases evenly in
stops (its logarithm), as a zoom does: 28 mm at the eyes, 31.8 at 3 m, 35 at 5 m, 37.6 at 15 m, 40 at 40 m, 45.3 at
200 m, 50 from 800 m up.

**On a tall screen** the lens keeps its height on any screen wider than square, and on a taller one keeps its width at
what it shows tall: an upright phone (9 : 19.5) at the eyes sees 46.3° across (before: 34.5°) and 85.7° tall; at the
top 27° across (before: 18.9°).

**The glass**: the film camera's own (`src/core/temporal.js`): a barrel of 0.045 at 28 mm, falling away with focal
length as the films' does, and 0.16 of the light lost toward the corners, laid on the walker's picture as the last
pass (`firmGlassed`: the same sharpening the picture has without it, read round where the glass bends each pixel from:
the films' own glass is left as it was). While a film holds the camera, the film's lens is drawn instead.
`camera/rig.js` `glass: 1` says how much of it; `?glass=` tries another (0: none).

**`?lens=`**: `?lens=28,35,40,50,50` (a focal length a key) tries another schedule; `?lens=today` the angles the walker
saw before (68° at the eyes to 40° at the top, as focal lengths: 17.8 to 33 mm).

## Propose

## Story

## Archived

---

## Todo

- [x] Samuel chooses A, B, C or D (or another schedule); D recommended, "go" builds it (his go: "do the most cinematic
  decision you can make"; schedule E)
- [ ] Build, check, propose

## Changelog

### 2026-11-16

- **Asked:** whether the walker should see through the 50 mm anamorphic, widening to 16 mm going up.
- **Delivered:** the intent opened: today's lens in the film kit's focal lengths, what 50 mm and the others would
  show and cost, three schedules to choose from.
- **Good:** the film kit's lens model gives both in one measure.
- **Broke / not there yet:** nothing built; Samuel's choice first.

### 2026-11-16 (2)

- **Asked:** "What makes lens wise sense?"
- **Delivered:** an answer, written into Define as schedule D: 28 mm at the eyes, 35 mm high up, wider on a tall
  screen, `?lens=` first; 50 mm for the films, 16 mm for no band.
- **Good:** the film kit's one lens model answers both the picture and the cost.
- **Broke / not there yet:** nothing built; Samuel's "go" first.

### 2026-11-16 (3)

- **Asked** (Samuel, through the coordinating session): "do the most cinematic decision you can make": schedule E.
- **Delivered:** the lens by focal length, a zoom between the bands; wider on a tall screen; the film camera's glass for
  the walker; `?lens=`, `?glass=`.
- **Good:** one lens model for the films and the walker.
- **Broke / not there yet:** the frame times and stills at every band, against main, are being taken.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `58cf67c` | the intent opened and defined: today's lens as focal lengths, three schedules to choose from |
| 2026-11-16 | `5bb42ef` | two long lines folded |
| 2026-11-16 | `78f3c84` | what makes sense for the lens, written in as schedule D, for Samuel's go |
