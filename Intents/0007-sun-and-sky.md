---
id: "0007"
title: The sun and the sky, a day and a night
state: define            # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0007 · The sun and the sky, a day and a night

## Idea

Samuel's words (typos tidied): "Define another intent that plans now the sun and the sky (no clouds yet) for a full,
realistic day and night cycle, that we can steer by hand with a slider, or an auto mode, in the top right corner."

Today the light never changes: one sky colour (`SKY`, 0x9fc2e6, in `src/main.js`), one sun direction and colour, one
ambient light, one haze colour, set once in `src/core/uniforms.js`. Every material already reads them through the
shading contract (intent 0002: `LIGHT_GLSL`), so a moving sun reaches everything at once.

## Define

**The shape of it**

- **One time of day drives the light.** A clock, 0:00 to 24:00, sets the sun's place in the sky from Maia City's
  latitude and the date (the sun rises in the east, stands highest at noon, sets in the west, low in winter, high in
  summer). Everything else follows from the sun's height: nothing is keyed by hand to the hour.
- **The sky from the sun.** The sky's colour, from the zenith to the horizon, comes from how sunlight scatters in the
  air: deep blue overhead at noon, pale at the horizon; warm orange and pink at sunrise and sunset, brightest near the
  sun; the blue hour after it; a dark blue night. A sky drawn as a dome with this gradient (today the sky is one flat
  colour behind the land).
- **The light from the sun.** The sunlight's colour and strength (white at noon, golden low, red as it sets, nothing
  below the horizon), the ambient light from the sky (blue by day, dim at night), and the haze's colour from the sky at
  the horizon, so the far land melts into the sky of that hour.
- **Night.** A moon (its place from the date and hour, its light cool and faint), stars that show as the sky darkens,
  and the picture's exposure that adapts a little, so a night is dark but readable, not black.
- **One file, as data.** The latitude, the date, the length of a game day in auto mode, the sky's and the light's
  curves: `TheGame/world/sky.js`. The sun and sky only write the shading contract's uniforms (`uSunDir`, `uSun`,
  `uAmb`, `uSky`, `uHazeCol`) and the sky dome; no material changes.
- **The control, top right.** A small glass panel in the top right corner, in the brand's look and the screen's one
  layout (intent 0003's zones): the hour as figures, a slider for the time of day, and an Auto switch that lets the day
  run at the speed in the file (pause, a day in a few minutes, real time). Hidden in the films unless a shot sets the
  hour; a story's shot may name its hour.
- **What it must not do.** Cost frame time (the sky is one dome and a handful of uniforms a frame), or pop: the light
  changes smoothly as the slider moves.

**Deliverables**

1. `TheGame/world/sky.js`: latitude, date, day length, the curves.
2. The sun's and moon's place from the hour and the date.
3. The sky dome: its colours from the sun's height and direction, stars at night.
4. The sun's light, the sky's light and the haze from the sky of that hour, written to the shading contract.
5. The control in the top right: the hour, a slider, Auto; on the walk, the library and the lenses pages; the
   dashboard's game view too.
6. A film's shot may set the hour (`cine`), so a story can be filmed at dawn.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The sun where it should be | the sun's direction at 6:00, 12:00 and 18:00 on the file's date and latitude against a solar position table (within 1°) |
| 2 | A day looks like a day | stills of the same view at sunrise, morning, noon, late afternoon, sunset, blue hour, midnight: compared side by side |
| 3 | No pop | the slider moved across 24 hours in 1000 steps: no frame's sky or light changes more than 3× its neighbours' step |
| 4 | Everything lit alike | terrain, grass, rocks, tent, card (impostor) and water all darken and warm together (the brightness of each sampled at noon and at sunset) |
| 5 | Control and data | changing the day length or latitude in the file changes the game with no other edit; the control works with mouse and touch |
| 6 | Frame time | at noon and at night, eye level and town: at or under 16.7 ms |

**Out of scope**

- Clouds and their shadows (the shading contract has the slot; a later intent).
- Weather (rain, fog, storm): the weather slot, later.
- Shadows cast by the sun (the engine has none yet).
- The sun's glitter on the water and light patterns on the river bed (they follow once the sun moves: intent 0006 or a
  small follow-up).

## Build

_Not started: waits for Samuel's approval of the definition above._

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel: approve or change the definition
- [ ] The sky file and the sun's and moon's place
- [ ] The sky dome and stars
- [ ] The light and the haze from the sky
- [ ] The control, top right
- [ ] A film's shot may set the hour

## Changelog

### 2026-11-12

- **Asked:** an intent that plans the sun and the sky (no clouds yet) for a full, realistic day and night cycle,
  steered by hand with a slider or an auto mode in the top right corner.
- **Delivered:** this intent, at define.
- **Good:** the shading contract (intent 0002) already carries the sun, the sky and the haze to every material.
- **Broke / not there yet:** nothing built.

## Trail

| When | Commit | What |
| --- | --- | --- |
