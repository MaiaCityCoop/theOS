---
id: "0010"
title: Leaves that hold still
state: propose         # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0010 · Leaves that hold still

## Idea

Samuel, 2026-11-12: "can you make the clouds move a bit faster? and we still have the issue that the tree leaves have
weird flickering, even without wind. maybe it can be the fast moving sun? and light/shadowing combination? please debug.
you can diff yourself a still frame with 5 stills 1 sec each apart looking at a tree and then see the problem yourself."

## Define

Asked for outright: a debugging job, built straight away.

**Deliverables**

1. The flicker seen and measured as Samuel said: five stills a second apart, the camera held on a tree, diffed.
2. Its cause found, by experiment, not by guess.
3. The cause removed; the crowns look as they did.
4. The clouds drift a bit faster.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | the flicker shows in the diff | stills from the live game, WebGPU, in WebKit (Safari's engine) |
| 2 | the cause, isolated | the same stills with the clock held, with no shadows, with only the sun moving |
| 3 | gone after the fix | the same stills again; the look side by side, old and new |
| 4 | 60 fps holds | the GPU's own time for the trees, the old read and the new by turns in one run |

**Out of scope**

- The bushes' fine leaves in a breeze (their edges shimmer as they move: real motion of sub-pixel detail, not light).

## Build

**How it was measured.** The camera held 16 m from a pine (`tools/shots.js`: `around`), the governor held, pixel ratio 1,
five stills a second apart (`__cine.still()`), in headless WebKit with WebGPU. Two numbers per pair of stills, in the
crown's part of the picture: *flips*, the share of 8 x 8 pixel blocks whose mean brightness changed by more than 8 of 255
(a whole card changing its light; a hairline moving by part of a pixel averages out), and *edges*, the share of single
pixels that changed by more than 12.

**What it was.** A tree is lit per corner of its cards (`src/scatter/trees.js`), and a corner's shadow was one texel of
the shadow map compared hard: lit, or not (`src/world/light.js`: `shadowAtVertex`). A crown stands in its own shade, so
most of its corners lie right at that edge. Whatever moved by a hair threw whole cards from light into shade and back:

- in a calm, the crown's own slow sway of 8 mm (the clock held: every frame identical, 0 % of anything changing; the
  clock running: 0.3 to 0.5 % of the crown's blocks flipping every second; with no shadows at all: 0 % again);
- in a breeze, the sprigs' flutter: 2.1 % a second, of which 0.7 % is the leaves really moving;
- the sun going on (the film's time-lapse, nothing else moving): 2.1 % a second, the strongest flips of all. Samuel's
  guess was right for the film: its shots had been given a moving hour the same day (intent 0009).

**What was done.**

- `shadowAtVertex` reads nine texels round the corner (every other one of a 5 x 5, about a card wide), weighed by a
  smooth bell so the weights slide as the corner moves, each compared over a depth and not at one. A corner's light now
  changes as little as what moved. Four texels were tried too: cheaper, but twice the flips under a moving sun (1.08 %
  against 0.61 %) and still a pop now and then in a calm.
- In a calm a tree's own sway is none (it begins with a breeze, as before from there up): millimetres are no motion to
  the eye, only edges creeping by parts of a pixel. A calm picture is now the same from frame to frame, bit for bit.
- The film's shots each hold one hour (16:00 to 17:42 from shot to shot), no sun racing within a shot.
- The clouds drift at 16 m/s in a calm (11 before), 52 in a storm (38).

**What it costs.** The trees alone, 2.3 million corners a frame in the pine forest at eye level, the old read and the
new by turns in one run (headless Chromium, the GPU's own time, the game's own frames stopped meanwhile): 0.15 to 0.2 ms
more a frame (4.16 to 4.32 ms at a small picture, 6.05 to 6.20 ms at full size).

## Propose

**Delivered:** `TheGame/src/world/light.js` (the soft read), `TheGame/src/scatter/trees.js` (still in a calm),
`TheGame/world/clouds.js` (the drift), `Stories/0001-intents-stories-os/timeline.json` (one hour a shot);
later the same day `TheGame/world/clock.js` (the clock's own file, Auto three times slower) and `TheGame/world/wind.js`
(the wind opens at a quarter).

**Checks, as they were** (WebKit, WebGPU, 1200 x 750; flips a second in the crown)

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | calm, before: 0.3 to 0.5 % of blocks flipping, whole cards bright in the diff |
| 2 | passed | clock held: 0.00 %; calm without shadows: 0.00 % flips (1 to 2 % edges: the sway); sun only: 2.1 % |
| 3 | passed | calm 0.00 % flips and 0.00 % edges; breeze 2.1 → 0.86 % (the leaves' own motion: 0.69 %); moving sun 2.1 → 0.57 %; clouds drifting over, calm: 0.01 %. Old and new side by side at eye level, 25 m and 90 m: mean brightness the same to 0.02 of 255 |
| 4 | passed, with a cost | + 0.15 to 0.2 ms of GPU time a frame in the heaviest tree view; no page error on WebGPU or on the WebGL 2 fallback |

**The real Safari** (16:14, when Samuel was back and the Mac unlocked): the lens bench (`/game/lenses.html?lens=A28`, 1440 x 779, loaded after the change) drew 241 frames every 4 s, 60 fps, from its first look on, the governor taking the pixel ratio from 1.125 up to its most, 2, within 40 s. An earlier probe at 16:09 had shown nothing: the display was asleep and the screen locked, and a page that is not shown draws no frame.

**Known gaps:** Samuel has not yet looked at a tree himself. With Auto on (the day in four minutes) shadows really move fast: 1.5 % of blocks a second change, as they should. The bushes shimmer a little in a breeze (out of scope above).

## Story

## Archived

---

## Todo

- [x] measure, find, fix, measure again
- [x] clouds faster
- [x] the real Safari reaches frames with the new read (the probe page, or Samuel's own tab, in `.perf/hitches.jsonl`)
- [ ] Samuel looks at a tree in Safari, calm and breeze, and at the film
- [x] the clock in its own file; Auto three times slower; the wind opens at a quarter
- [x] commit all of it (on Samuel's word)

## Changelog

### 2026-11-12

- **Asked:** clouds a bit faster; debug the leaves' flicker, even without wind (the sun? light and shadow?).
- **Delivered:** the cause (a hard, one-texel shadow test per corner, tipped by the smallest motion), the soft read, a
  still calm, one hour per film shot, faster clouds.
- **Good:** Samuel's way of looking (stills a second apart, diffed) showed it at once; in a calm the picture is now
  identical from frame to frame.
- **Broke / not there yet:** the first count (single pixels) could not tell light flips from moving outlines and seemed
  to say shadows were not the cause; counting blocks did. The built-in browser pane stops drawing when hidden, so the
  stills came from headless WebKit instead.

- **Asked (later):** "default settings for weather should be way slower clock, like 3x slower, and like 1/4 of wind
  blowing"; and "can you also pull out clock into its own file, SSOT? we should be defining later with this also seasons
  and clock speeds etc. (but not for now)".
- **Delivered:** Auto runs at 2 game hours a real minute (6 before: a day in twelve minutes, not four); the wind opens at
  0.05 (0.2 before). The clock has its own file, `TheGame/world/clock.js`: the date, the hour the game opens at, Auto,
  its speed; `world/sky.js` keeps the latitude and the light; `src/world/sky.js` reads the clock from there. Nothing of
  seasons or more speeds yet, as asked: the file says they are to be set there.
- **Seen:** a browser that has kept nothing opens at 10:00 with the wind at 0.05 (the pill reads "Calm": a breeze is
  named from 0.08); Auto measured at 1.93 game hours a minute at 60 fps; the plots and the sun as before. Trees at the
  new wind: 0.04 % of the crown's blocks change their light a second (breeze: 0.82 %); under Auto at the new speed
  0.57 % (1.49 % at the old).
- **Not there yet:** the wind is kept per browser once its slider has been moved (`maia.wind`), so a browser that has
  kept one opens with that, not with the new start; the clock's speed is not kept and holds everywhere at once.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `1610cf4` | still in a calm (`src/scatter/trees.js`): went in with another session's commit, which took the file whole |
| 2026-11-12 | `f2d4a95` | the soft read of a corner's shadow, the film's hours, the clouds' drift |
| 2026-11-12 | `a1157e9` | the clock's own file, Auto three times slower, the wind's start |
