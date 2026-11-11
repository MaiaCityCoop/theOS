# The virtual camera

One free film camera for Sandbox 8, made for the devlog: it can stand anywhere, look anywhere, and
shoot through any lens from 12 mm to 180 mm. It is one file, `cine/cine.js`, and it needs nothing of
the game but `window.__s8.camera`, so **the same camera shoots every stage of the build**: a shot
framed today can be replayed at any earlier commit, from the same place, through the same lens.

## Using it

Press **V** in the running game. The camera takes the picture over from the walker (the walker's
own place and view are held until V is pressed again).

| Key | What it does |
| --- | --- |
| mouse (click to capture, or drag) | look |
| W A S D, Q E | move along the view, sideways, down and up |
| Shift / Alt | eight times faster / much slower, for fine framing |
| 1 … 8 | lens: 12, 18, 24, 35, 50, 85, 135, 180 mm |
| mouse wheel | zoom between 12 and 180 mm |
| Z X, 0 | roll left and right, level again |
| B, Backspace | set a keyframe here (place, view, lens); take the last one back |
| P | play the move through the keyframes; again to stop |
| , . | seconds per leg of the move |
| [ ] | choose the shot (yours, "scratch", and those in `shots.json`) |
| O | export the shot as JSON (to the clipboard and the console) |
| Enter | save a still (PNG, at the canvas's own resolution) |
| R | record video until R again (mp4 in Safari, webm elsewhere) |
| L | 2.39 : 1 bars |
| H | clean picture: no readouts |

**Lenses** are those of a full-frame camera (a sensor 36 mm wide): 12 mm sees 112.6° across, 35 mm
54.4°, 180 mm 11.4°, whatever the window's shape. A long lens also turns more slowly, as on a real head.

**A move** runs through its keyframes on a smooth curve, eased in and out; the lens may change
along the way (a zoom).

## Shots that are kept

"scratch" lives in this browser only. To keep a shot for the film, press O and add the JSON to
`cine/shots.json` (a list of `{ "name", "secs", "keys": [{ x, y, z, yaw, pitch, roll, mm }] }`,
angles in radians). Kept shots are in every stage's list.

A shot can also be called by address:

- `?cam=x,y,z,yaw,pitch,roll,mm` (angles in degrees): stand exactly there
- `?shot=<name>`: start on a kept shot; `&play` plays it, `&rec` records that play and saves it
- `&bars`, `&clean`: with the bars, without the readouts

## Shooting an earlier stage

    bash game/cine/at.sh <commit> [port]

checks that commit's `game/` out beside the repository (never in the tree being worked in), lays
today's `cine/` over it, and serves it (port 5174 unless told). The commits are in `game/DEVLOG.md`.
The same `?shot=…&play&rec` address on two ports gives the same move over two stages, to cut between.

## What it does not do yet

No depth of field, no motion blur, and stills are no larger than the window. The land's levels of
detail follow distance, not the lens: at 85 mm and longer, far grass shows its coarse blades.
