# Sandbox 8: devlog

One entry per request cycle between Samuel and the agent: what was asked, what was delivered, what
was good, what broke, and the commit to go back to. Newest last. To see a stage again, with the
virtual camera over it: `bash game/cine/at.sh <commit>` (see `cine/README.md`).

Numbers are from the app's browser pane on the M1 MacBook Air unless said otherwise; Safari's own
have not been read yet.

---

## 1 · The land, from the ground up · 2026-11-11 · `4ae6541c1`

**Asked.** A brand-new standalone world in `game/`, nothing reused: one endless procedural land
(meadow, arid patches, one small stream, a few stones and rocks, nothing else growing), plain light,
no sky. Stable 60 fps on the M1 Air in Safari first, a realistic ground second, fast loading third.
Nothing built while walking; heights from the GPU.

**Delivered.**
- Terrain: a quadtree of one shared 16 × 16 tile (CDLOD), 10 levels to about 24 km, heights in the
  vertex shader, levels morphing into each other; one instanced draw call.
- The same integer-hash noise in JS and GLSL, so the walker's feet match the ground.
- Five ground materials baked on the GPU at start (1024² albedo + normal each), sampled twice
  against tiling, blended by height.
- Grass: instanced blades in three rings to 115 m, everything about a blade hashed from its cell.
- Stones and mossy boulders: displaced icospheres, hashed into cells.
- A stream carved along a noise contour, water flowing with ripples, foam and specks.
- Walk, run, fly; fps / draws / triangles readout; adaptive pixel ratio. WebGL2, not WebGPU.

**Good.** It drew on the very first run, no shader errors. Ready in about 1.6 s. Cracked earth,
pebbly dirt and the mossy rocks read well at once.

**Broke, and what it taught.**
- The first version ran at 28 fps on the meadow. Measured by switching layers off: grass cost
  15 ms, rocks 4.5 ms, the terrain about 1 ms. The cause was each blade working the land's noise
  out again at every one of its vertices. Fix at the root: the GPU writes the ground around the
  camera (height, density, tint) into one 512² texture, redrawn whole every 8 m walked, and blades
  and stones read it. Back to 60 fps at pixel ratio 1.5. This is the one departure from "walking
  only moves uniforms".
- Rocks first submitted 7 M triangles a frame, nearly all empty cells; fewer instances per patch
  and coarser far levels brought the whole scene to about 2.5 M.
- The spawn's "distance to the stream" estimate was off by tens of metres, so the first views had
  no water in them. The spawn now walks onto the stream's line before stepping back from it.
- The mouse could not be captured in the app's browser pane (it refuses pointer lock); drag-to-look
  was added as the fallback. Safari captures it on a click.

**Left open.** No rock collision. Two rock shapes, not three. No stutter measurement while walking
far or flying fast.

---

## 2 · A real river, calmer water · 2026-11-11 · `4c07ab144`

**Asked.** The stream three times as wide, its width wandering between 3× and 5× like a true
meandering river. The white gushes look weird: more realistic water, slightly less blue.

**Delivered.**
- Water now about 12–20 m across, the width changing along the course, stronger meanders; a flat
  bed up to 1 m deep with sloped sandy banks.
- The cellular white foam is gone: clear over the sand at the edge, dark green-brown in the deep,
  gentle ripples running with the current, a thin broken foam line at the bank, a few specks.
- The sky's reflection greyed and dimmed.

**Good.** The bank reads as a real shore now: sand showing through shallow water, then depth.

**Broke / not there yet.** The water is on the flat side: little life in the middle of the river,
and it still takes a grey-blue from the plain sky colour. The spawn stood in the river after the
widening and was moved to the new bank.

---

## 3 · The devlog and the virtual camera · 2026-11-11 · `b3b328558`

**Asked.** A small dev log for every request cycle (asked, delivered, good, broke, commit), so an
actual devlog video can be written from it and each stage checked out again. And one universal
virtual camera that takes any perspective with lenses from 12 to 180 mm, to shoot a cinematic
devlog at each step; the camera documented.

**Delivered.**
- This file, with the first two cycles written up after the fact.
- `cine/cine.js`: a free film camera (V). Full-frame lenses 12–180 mm on keys and the wheel, roll,
  keyframed moves on a smooth curve with zooms, stills (PNG), video recording, 2.39 : 1 bars, a
  clean picture, shots by address (`?cam=…`, `?shot=…&play&rec`).
- `cine/at.sh <commit>`: serves any earlier stage with today's camera over it.
- `cine/README.md`: the camera's manual.

**Good.** The camera needs nothing of the game but its camera object, so it worked unchanged on
the first commit: the same `?cam=` address gave the same framing over stage 1 and stage 2.

**Broke / not there yet.**
- Long lenses show what distance-based detail hides: at 85 mm and beyond, far grass is visibly a
  few coarse triangles. Detail has to follow the lens, not only the distance.
- No depth of field, no motion blur; stills are no larger than the window.
- Recording and saving stills were written but not tried in Safari yet.

---

## 4 · The camera is the agent's; a timeline plays a trailer in the world · 2026-11-11 · `cdc1e5909`

**Asked.** The camera was misunderstood: it should be a virtual camera for an agent to create
cinematic shots, not something a person steers. Beside the game view, a second view: the actual
timeline, which plays inside the real 3D world (only moving the virtual camera, nothing rendered
ahead) a random mini cinematic trailer across the land: wide, medium and close shots, a few
extraordinary angles, a drone flight, all in one timeline. And the preconfigured cameras must be
playable again later.

**Delivered.**
- `cine/cine.js` rewritten as an API only, `window.__cine`: take a view (place, look-at or
  angles, lens 12–180 mm, roll), load / play / pause / seek a timeline of clips, still, record.
  Cycle 3's keys and readouts are gone.
- `cine/trailer.js`: composes a trailer from a seed by reading the world itself (the river's line,
  the ground's height). Nine shots, about 55 s: wide, drone flight down the river, medium, close
  (85 mm), low angle among the blades (12 mm, rolled), straight down and turning, glide (50 mm),
  long lens (135 mm), crane away.
- `/timeline.html`: the world through the virtual camera, the clips as a strip underneath with
  kind, lens and length, a playhead, play / scrub, "new trailer" for the next seed.
- Kept timelines: `__timeline.keep(name)` writes `cine/timelines/<name>.json`;
  `/timeline.html?tl=<name>` plays it back. The first one kept: `first-look` (seed 1).
- `cine/at.sh` now lays the timeline view over an earlier stage too.

**Good.** The shots framed well on the first composition: the low angle looks up through the
blades at the far bank, the top-down shows the river's banding of sand, shallows and depth, the
close sits right on the waterline. The kept timeline played back identically after a reload.

**Broke / not there yet.**
- Cycle 3 built the wrong thing (a hand-steered camera with keys); its place-holding trick and
  lens maths carried over, the rest was thrown away.
- A new `vite.config.js` was not picked up by the running dev server; keeping a timeline failed
  with a 404 until the server was restarted.
- The pane showed 15–19 fps on the timeline page while Safari was drawing the game beside it and
  the pane emulated a 1280 × 720 window: not a clean reading, and not yet read in Safari. Open.
- Seed 1's stretch of river lies in dry land: the trailer shows straw and sand, little green.
  The composer does not yet choose its stretch for how it looks.
- `still()` and `record()` are still untried.

---

## 5 · A story, real transitions, a menu · 2026-11-11 · `516bf1bbc`

**Asked.** The camera moves should follow a proper storytelling line that introduces the actual
world; the shots were quite random. Transitions between connecting shots should be smooth like
real camera transitions: nice cuts, easing, movements that continue or deliberately contrast.
And a menu, like an explorer, to choose between the timelines and walking the world oneself.

**Delivered.**
- The trailer is one story in a fixed order, three acts: **Arrive** (out of the sky down to the
  river; low and fast down the river, rising and slowing), **Look** (on the bank; a cut in to the
  waterline; down in the grass), **Leave** (straight up out of the grass; back over the meadow; a
  crane up and away, the opening run backwards). Each clip carries a `why` line for its cut,
  shown in the timeline view. The seed now only picks the stretch (the greenest of six), the bank
  and the direction of travel.
- The camera learned transitions: `cut`, `dissolve` (the held last frame of the shot before
  melts into the next), `dip` through the sky's colour, fade in and fade out; and eases that say
  how a move starts and ends (`in`, `out`, `inout`, `linear`), so a cut on motion carries the
  movement across.
- A menu on every page, top right: Walk the world, the composed trailer, every kept timeline
  (the dev server lists `cine/timelines`).
- Kept as `river-story` (seed 1): `/timeline.html?tl=river-story`.

**Good.** Two joins read as intended in stills: the low angle tilts up into plain sky and the next
shot looks straight down at that very spot, climbing until the river slides into frame; and the
flight's last frame melts into the bank shot. Seed 1 now lands on a green stretch.

**Broke / not there yet.**
- The transitions were checked as stills and by their opacities, not watched as motion at full
  frame rate; whether the cuts on motion feel right is for the eye, in Safari.
- The 85 mm close shows mostly open water with the bank only at the frame's edge: it was re-aimed
  once and is still the weakest frame.
- A dissolve freezes the outgoing shot (one camera, one picture); if that shot is still moving
  when it ends, the freeze would show. The trailer only dissolves out of shots that came to rest.
- Frame rate on the timeline page is still unread in Safari.

---

## 6 · The one-frame flash · 2026-11-11 · `f09a57b15`

**Asked.** About every 5 seconds the cinematic shots flicker: one frame of white.

**Delivered.** The adaptive pixel ratio resized the canvas *after* a frame had been drawn.
Resizing a canvas empties it, so that frame reached the screen empty (the page's pale background
showing through). The resize is now held until the start of the next frame, right before drawing.
The game view had the same fault; it shares the fix.

**Good.** The cause fits the rhythm: the ratio probes upward every few calm seconds and steps
back, and each step was one empty frame.

**Broke / not there yet.** Not seen fixed by eye: in the pane the ratio did not change once in a
9-second watch, so no step was caught there. Samuel's look in Safari is the check. If a flash
remains exactly on a cut, the next suspect is the dissolve's frame grab.

---

## 7 · Artifacts in the distance · 2026-11-11 · `c0f42aff7`

**Asked.** In the remote distance everything looks quite artifacty.

**Delivered.** What a wide still showed, and what was done about each:
- Dirt paths read from afar as thin pale rings drawn on the land. A path now fades out between
  70 and 220 m.
- The ground's fine noises (the anti-tiling mix, the 23 m colour variation, the sand patches) ran
  on at any distance, finer than a pixel far away: shimmer and a blotchy carpet. Each is now let
  go before it gets that small, and two larger variations (170 m, 1100 m) carry the far colour.
- The farthest boulders were dark specks popping in at 1500 m. They now end at 1100 m and shrink
  away over the last stretch.
- Far water and its bed were closer together than the depth buffer can tell apart at a kilometre;
  the water is now biased to win there.

**Good.** The rings are gone in the same frame, before and after.

**Broke / not there yet.**
- Judged on stills only: shimmer is a thing of motion and was not watched.
- The far land is still flat-lit and sharp to the horizon; with no haze, sky or shadow (all held
  back on purpose for now) distance has nothing to soften it. The far river reads as a grey road.
- The grass's far ring (46–115 m) is still coarse triangles.
