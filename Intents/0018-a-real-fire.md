---
id: "0018"
title: A real fire, and real stones round it
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-14
story:                 # Stories/0018-a-real-fire/, set at propose
---

# 0018 · A real fire, and real stones round it

## Idea

Samuel, looking at the fire pit in front of the tent (Safari, 15:00, a breeze, few clouds): "how can you make the
fire look like real fire, not game triangles, and the stones around it are also not looking real!! this needs to be
reworked in full realism."

Then, while it was being built: "ensure there is some kind of ashes, and burnt charcoal on the floor below the fire,
instead of its surrounding biomes"; "the long lying log still looks super unrealistic, and not like a proper log";
"the inner ashes don't look plastic enough and flat, and shouldn't spill outside the pit's stone ring either."

The fire is seven twisted cones of flat colour that wave in the wind; the ring's stones are eight-sided balls with
every facet flat, so they read as crystals, not stones.

## Define

**Deliverables**

1. **The fire as fire**: no triangles of colour. Flames drawn by a shader: light, not surfaces; licking upward,
   breaking into tongues, never the same twice; white-yellow at the heart, orange, then red at the tips, thin where
   the eye sees through it. Glowing coals in the bed under it, sparks rising off it, a thin smoke drifting with the wind.
2. **Its light**: the fire lights what stands near it (the stones, the seats, the logs), warm and flickering, the more
   the nearer.
3. **The stones as stones**: river stones of the ring smooth and round, each its own shape, rounded with no flat
   facets, wearing the world's pebble material, blackened by soot on the side that faces the fire, darkest low down.
4. **The bed**: ash heaped inside the ring in drifts and lumps, charcoal in it, burnt sticks across it; none of the
   meadow's ground showing under the fire, and no ash outside the stones.
5. **The wood**: the lying log, the stacked firewood and the seats round and real: tapered, uneven, bark all round,
   sawn ends in rings.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The fire reads as fire, close up, in daylight | the game at the fire (spawn), a screenshot at 2 m and one at 10 m: no flat-coloured triangle in the flame |
| 2 | It moves | two screenshots a second apart differ in the flame's shape |
| 3 | The light | the stones' side towards the fire warmer than the side away (a screenshot) |
| 4 | The stones | close-up screenshot: rounded, no flat facets, soot on the inner side |
| 5 | Nothing else breaks | no console errors; frame time near the fire within 1 ms of before (the HUD's ms) |
| 6 | The bed | close-up: ash inside the ring only, heaped, charcoal in it, no gravel under the fire |
| 7 | The wood | close-up: the log round with sawn ends, no flat facets |

**Out of scope**

- The fire lighting the ground and the grass (their own shaders): the stones, seats and logs only, for now.
- The tent.

## Build

- **The fire** is `src/world/fire.js`: four instanced draws (coals, three flame sheets turned to the eye round the
  upright, two smoke sheets, 48 sparks), all premultiplied over what is there and lowering the pixel's stillness for
  the picture built over time. An asset with `fire` (assets/flame.js) is stood there by `place()` instead of as a mesh;
  its faces stay only as its picture in the library. The flame's shape is a width profile eaten from the top by noise
  that runs upward: its tongues come from that, its colour from how far a point lies inside the shape and how high.
- First build drew nothing: the sheets were back-face culled (a sheet turned to the eye can be wound either way).
  Fixed with DoubleSide.
- **Its light** (`fireLight`) is added to every placed asset's light in `src/world/place.js`: ~1900 K orange,
  flickering, falling off with distance squared (softened). At first it was so strong next to the fire that it washed
  the soot and the ash out to cream in daylight; now it is ~1 at the stones, 0.2 at the seats.
- **Faces** (assets/index.js) may now carry a colour and a normal per corner: what a rounded thing needs to be shaded
  smooth. `skin()` in firepit.js makes them from a grid of points.
- **Stones**: `riverStone()`, a squashed ball pulled about by slow noise, the pebble material, soot by how far a point
  faces the fire and how low it is. Each stone has its own seed, so it is the same stone at every level of detail.
- **Bed**: `ashAt()` gives the ash's height anywhere (heap, drifts, lumps, down under the stones at the rim); the bed,
  the charcoal and the burnt sticks all sit on it. The wood ash material's charcoal lumps were too big and too many at
  this size (a spotted hide): fewer and smaller now (materials/woodash.js, its only user).
- **Wood**: `wood()`, a log from any axis: tapered, swelling, bark plates, sawn ends in rings, charred from the middle
  out where the fire has had it. The bench, the stacked firewood (two side by side, one across), the seats and the
  burnt sticks are all it.

## Propose

## Story

## Archived

---

## Todo

- [x] Shader fire: flames, coals, sparks, smoke
- [x] The fire's light on what stands round it
- [x] Round river stones, sooted on the inside
- [x] Ash and charcoal bed inside the ring
- [x] Round logs, firewood and seats
- [ ] Checks 1–7 recorded with screenshots
- [ ] The fire's light on the ground and the grass (their own shaders)

## Changelog

### 2026-11-14

- **Asked:** the fire to look like real fire, not game triangles, and the stones round it real; then ash and charcoal
  under it, a proper lying log, and the ash heaped and kept inside the ring.
- **Delivered:** a shader fire (flames in tongues, coals, sparks, smoke) and its light on what stands round it; round
  sooted river stones; an ash bed in drifts with charcoal and burnt sticks, inside the ring only; round logs, firewood
  and seats with bark and sawn ends.
- **Good:** seen in the in-app browser (Chromium, WebGPU) at 10:00 and 21:47: the flames orange round a yellow heart,
  licking; at night the stones, seats and logs lit warm by it.
- **Broke / not there yet:** the ground and the grass do not take the fire's light (it shows at night); the coals'
  glow is hard to see under the fire's light on the ash; frame time not measured (the pane was hidden, which throttles
  it; a separate session is finding why the game now averages 30 fps).
- **Renumbered** from 0016 to 0018: 0016 and 0017 were taken on other branches (sign-in, deploying the game).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-14 | `39f3ce0` | The shader fire and its light, river stones, the ash bed, round logs |
