# The virtual camera

A film camera inside Sandbox 8's world, **driven by an agent, not by hand**: no keys, no readouts.
The agent sets cameras (a place, where it looks, a lens) and strings them into a timeline of shots;
the timeline then plays **live in the real world**: nothing is rendered ahead, the camera simply
moves through the land as it is. It is made for the devlog: at every stage of the build the same
cameras can shoot again.

| File | What it is |
| --- | --- |
| `cine/cine.js` | the camera and its timeline: `window.__cine` |
| `cine/trailer.js` | composes a small trailer of the land from a seed |
| `cine/view.js`, `timeline.html` | the timeline view: the world playing, its clips as a strip underneath |
| `cine/timelines/<name>.json` | kept timelines: cameras set once, played back by name |
| `cine/menu.js` | the menu on every page: walk, or a timeline |
| `cine/at.sh` | serves an earlier commit with today's camera over it |

## Two views

- **The game**, `/`: the walker's own view.
- **The timeline**, `/timeline.html`: the same world, shown through the virtual camera. Under it,
  the clips in order with their kind, lens and length, and a playhead. Play / pause (or Space),
  click or drag the strip to scrub, "new trailer" for the next seed.
  - `?seed=7`: the trailer composed from seed 7
  - `?tl=first-look`: the kept timeline `cine/timelines/first-look.json`, exactly as it was set

## The camera, for an agent: `window.__cine`

    __cine.take({ pos: [x, y, z], look: [x, y, z], mm: 35, roll: 0 })   // hold the camera there
    __cine.take({ pos: [x, y, z], yaw: 200, pitch: -12, mm: 85 })       // or by angles, in degrees
    __cine.release()                                                    // back to the walker
    __cine.load(clips); __cine.play(); __cine.pause(); __cine.seek(seconds)
    await __cine.still()                                                // the next frame, a PNG data URL
    __cine.record(true)                                                 // video, until record(false) or the end
    __cine.view, __cine.time, __cine.duration, __cine.clips, __cine.playing
    __cine.floor = (x, z) => groundHeight                               // set: the camera never sinks under it
    __cine.loop = true

Also by address: `?cam=x,y,z,yaw,pitch,roll,mm` (degrees) stands the camera exactly there.

**Lenses** are a full-frame camera's (a sensor 36 mm wide), 12 to 180 mm: 12 mm sees 112.6° across,
35 mm 54.4°, 180 mm 11.4°, whatever the window's shape.

**A timeline** is a list of clips, cut one after the other:

    { "name": "The far bank", "kind": "medium", "secs": 5.1, "ease": "inout",
      "keys": [ { "pos": [x, y, z], "look": [x, y, z], "mm": 35, "roll": 0 }, … ] }

Inside a clip the camera travels through its keys on a smooth curve (place and aim both), eased
(`inout`, the gentler `soft`, or `linear`); the lens may change from key to key (a zoom) and so may
the roll. One key is a locked-off shot.

## Cuts, and how a move starts and ends

A clip also says how it is cut in and how its move behaves at its ends, so that shots connect:

| Field | Values |
| --- | --- |
| `ease` | `inout` from rest to rest · `in` from rest, leaves moving · `out` arrives moving, comes to rest · `linear` moving through · `soft` barely eased |
| `in` | `cut` (default) · `dissolve`: the last frame of the shot before melts into this one · `dip`: through the sky's colour (on the first clip: a fade in) |
| `inSecs` | the transition's length |
| `out` | `dip` on the last clip fades the film out |
| `why` | one line on what the cut is for; shown in the timeline view |

A **cut on motion** is a plain `cut` between a clip that leaves moving (`in` or `linear`) and one
that arrives moving (`out` or `linear`): the movement carries across the cut. A `dissolve` wants
the shot before it to have come to rest (`out`, `inout`): what melts is its held last frame.

## The trailer

`trailer(seed)` reads the world's own functions (where the river runs, how high the ground is) and
tells one line of story along a stretch of river, always in this order:

| Act | Shot | Cut in | Why |
| --- | --- | --- | --- |
| Arrive | From the sky, 18 mm | fade in from the sky | horizon first, then the river the film follows; leaves moving |
| | Down the river, 24 mm drone | cut on motion | contrast: high and slow to low and fast, same line; rises, slows, stops over the place we look at |
| Look | The river going by, 35 mm | dissolve | the flight has come to rest; now standing on the bank, travelling the same way, looking across |
| | Where the water meets the sand, 85 mm | cut in, on the move | same axis, same travel, closer; comes to rest |
| | Among the blades, 12 mm | dissolve | the other thing the land is made of; longest lens to widest; ends tilting up into the sky |
| Leave | Lifting off, 28 mm straight down | cut on motion | the tilt up becomes a climb from the same spot; the river slides into frame |
| | Back to the water, 50 mm | dissolve | from the height back to the ground, gathering speed to the river |
| | Leaving, 35 → 14 mm crane | cut on motion | the opening run backwards: river, land, sky; rests, fades to the sky |

About a minute. The seed picks the stretch (the greenest of six), the bank and the direction of
travel; the story stays. The same seed gives the same trailer on the same stage.

## The menu

Every page carries the same small menu, top right: **Walk the world** (the game, by hand), and
under **Timelines** the composed trailer and every kept timeline by name.

## Keeping cameras, and playing them back

A composed or hand-set timeline is kept as a file and played back later by name:

    await __timeline.keep('first-look')      // in the timeline view: writes cine/timelines/first-look.json
    /timeline.html?tl=first-look             // plays it back

(or `POST /cine/keep?name=…` with the clips as JSON; the dev server writes the file). A kept
timeline holds fixed places, so it frames the very same shots on every stage: that is the one to
cut a before/after from.

## Shooting an earlier stage

    bash game/cine/at.sh <commit> [port]

checks that commit's `game/` out beside the repository (never in the tree being worked in), lays
today's `cine/` and `timeline.html` over it, and serves it (port 5174 unless told). The commits are
in `game/DEVLOG.md`. The camera needs nothing of the game but `window.__s8.camera`, and the trailer
only `src/world.js`, so both work on every commit since the first.

## What it does not do yet

No depth of field, no motion blur; stills are no larger than the window. The land's levels of
detail follow distance, not the lens: at 85 mm and longer, far grass shows its coarse blades.
`still()` and `record()` are written and not yet tried.
