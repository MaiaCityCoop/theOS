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
| `cine/lenses.js` | the lens kit: the nine Master Anamorphic primes, 28–180 mm |
| `cine/bench.js`, `lenses.html` | the lens bench: the live world through each lens, on its master shot |
| `cine/menu.js` | the menu on every page: walk, or a timeline |
| `cine/at.sh` | serves an earlier commit with today's camera over it |

## Two views

- **The game**, `/`: the walker's own view.
- **The timeline**, `/timeline.html`: the same world, shown through the virtual camera. Under it,
  the clips in order with their kind, lens and length, and a playhead. Play / pause (or Space),
  click or drag the strip to scrub. It plays the kept timeline `river-story` unless told otherwise.
  - `?tl=<name>`: the kept timeline `cine/timelines/<name>.json`, exactly as it was set
  - `?seed=7`: for the agent, a trailer composed afresh from seed 7 (not in the menu)

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

**Lenses** are the kit's (below): anamorphic primes, 28 to 180 mm, framed 2.39 : 1.

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
under **Timelines** every kept timeline by name (today: `river-story`).

## The lens kit

`cine/lenses.js`: the nine focal lengths of the ARRI/ZEISS Master Anamorphic primes and nothing
else: `A28 A35 A40 A50 A60 A75 A100 A135 A180`. A view or a clip's key names one (`lens: 'A50'`);
a bare `mm` between 28 and 180 is a zoom position between them.

- **Framing.** A 2x squeeze on a 4:3 Super 35 gate (17.82 mm high), framed 2.39 : 1 with black
  bars. A lens sees as wide as a spherical lens of half its focal length and as tall as its own:
  `A50` is 46.1° wide.
- **Depth of field.** Always wide open, T1.9 (`__cine.aperture`). The camera holds in focus what
  it looks at (`look`), so a move that follows a subject pulls focus by itself; `focus` (metres)
  sets it by hand. The blur is the thin lens's circle of confusion for that focal length, focus
  and distance, drawn as an upright oval, twice as tall as wide, as anamorphic glass gives.
  It is drawn by the game (`src/post.js`) only while the virtual camera holds the picture; the
  walk view has none. `__cine.dof = false` turns it off.
- Not modelled: flares, breathing, distortion.

## The lens bench

`/lenses.html` (menu: Lenses). The live world through one lens at a time. The bar at the bottom
holds the kit; a lens puts the virtual camera on that lens's **master shot**, in the real, running
world: a place and a subject the focal length is for.

| Lens | Master shot | What it tests |
| --- | --- | --- |
| A28 | The land, from 26 m up down the river | everything at once, to the horizon |
| A35 | Down the river, from the bank | water, both banks, meadow |
| A40 | The meadow at eye height | the rings of blades, one after the other |
| A50 | The bank | where grass, sand and water meet |
| A60 | In the grass, half a metre up | the blade itself |
| A75 | The largest boulder near by | rock, moss, grass at its foot |
| A100 | The waterline, low from the sand | foam, wet sand, ripples |
| A135 | The same boulder from further off | grass between, compressed |
| A180 | The same boulder from across the land | the far rings of detail, magnified |

From a master the view is free: drag turns, W A S D and Q E move (Shift faster), the wheel
dollies, Alt+wheel pulls focus, R or the lens's button goes back to the master, 1–9 pick a lens.
The readout top left is the game's own (frame time, draws, triangles), so each lens can be tuned
on its own shot, from any angle and distance. `window.__bench` gives the agent the list and `go(i)`.

The boulder is found, not guessed: `cine/trailer.js` runs the same hashes the rocks' shader runs.

## Keeping cameras, and playing them back

A composed or hand-set timeline is kept as a file and played back later by name:

    await __timeline.keep('river-story')      // in the timeline view: writes cine/timelines/river-story.json
    /timeline.html?tl=river-story             // plays it back

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

No motion blur; stills are no larger than the window. The land's levels of
detail follow distance, not the lens: at 85 mm and longer, far grass shows its coarse blades.
`still()` and `record()` are written and not yet tried.
