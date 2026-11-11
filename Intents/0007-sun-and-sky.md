---
id: "0007"
title: The sun and the sky, a day and a night
state: build             # idea | define | build | propose | story | archived
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

Samuel approved the definition on 2026-11-12 ("Approve, start it").

- `TheGame/world/sky.js` holds it all as data: the latitude (41.2° N), the day of the year (172, midsummer), the hour
  the game opens at, Auto's speed (game hours a real minute) and whether it runs, and seven keys of light by the sun's
  height (−18° to 90°): the sky overhead and at the horizon, the sun's light, the sky's light, the glow round the sun,
  the exposure; and the moon's light and size, the stars' number and brightness.
- `src/world/sky.js`: the sun's place from the hour, the day and the latitude (hour angle and declination); the moon's,
  near enough, lagging the sun by its phase; the light eased between the keys by the sun's height; as the sun sets the
  light turns smoothly to the moon's (by its phase and height). It writes the shading contract only: `uSunDir`, `uSun`,
  `uAmb`, `uSky` (the water's mirrored sky), `uHazeCol` (the horizon of the hour, so the far land melts into it) and
  a new `uExposure` in `toScreen` (brighter at night, so it stays readable). No material changed.
- The sky is a dome round the camera, drawn first: from the horizon's colour to the zenith's, a glow round the sun
  strongest low, the sun's disc, the moon's (brighter full and by night), stars as the sky darkens.
- The clock, top right, glass: the hour, a slider, Auto. Moving the slider stops Auto; the hour and Auto are kept in the
  browser between visits. On the library the card moves under it. Not on a film's page nor as a picture. A film's shot
  may set the hour (`cine.take({ hour })`).

**Checks, as they were** (2026-11-12, 1400×800 in the pane):

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | the sun on 21 June at 41.2° N: noon 72.24° high due south (180°); 6:00 15.19° high at 71.9°, 18:00 15.19° at 288.1°: as the textbook (noon 90 − 41.2 + 23.44 = 72.24°; at 6:00 sin(alt) = sin 41.2° · sin 23.44°: 15.19°) |
| 2 | looked at | the same place towards the sun at 4:54 (sunrise glow), 5:24, 13:00, 19:00 (pink, the sun low), 19:54 (dusk); towards the tent at 12:30 (pale blue day), 21:12 and 0:30, 23:00 (dark blue night, the moon two-thirds full lighting the tent grey) |
| 3 | passed | the light over 24 hours in 1000 steps (sky, sun, ambient, exposure: 13 values): 0 steps more than 3× their neighbours' |
| 4 | by construction | every material reads the same uniforms; not measured material by material |
| 5 | partly | the clock works with the mouse; the file's numbers drive it; touch not tried |
| 6 | partly | noon at eye level: 16.6 ms (60 fps); the night reading (26.6 ms) was taken right after screenshots, which stall frames, so it is not a fair number; the night draws the same as the day plus the stars |


## Propose

## Story

## Archived

---

## Todo

- [x] Samuel: approve or change the definition
- [x] The sky file and the sun's and moon's place
- [x] The sky dome and stars
- [x] The light and the haze from the sky
- [x] The control, top right
- [x] A film's shot may set the hour

## Changelog

### 2026-11-12

- **Asked:** an intent that plans the sun and the sky (no clouds yet) for a full, realistic day and night cycle,
  steered by hand with a slider or an auto mode in the top right corner.
- **Delivered:** this intent, at define.
- **Good:** the shading contract (intent 0002) already carries the sun, the sky and the haze to every material.
- **Broke / not there yet:** nothing built.

### 2026-11-12, built

- **Asked:** approve, start it.
- **Delivered:** the sun and the moon from the hour, the date and the latitude; the sky dome with glow, sun, moon and
  stars; the light, the sky's light, the haze and the exposure from the sun's height; the clock top right with a
  slider and Auto; films may set the hour.
- **Good:** the sun's place matches the textbook; no step in the light over a day; sunrise and sunset warm, nights
  dark blue and readable.
- **Broke / not there yet:** the night's frame time not fairly measured; touch on the slider not tried; no shadows or
  clouds (out of scope).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `6bb4ba2` | The intent opened, its definition written |
