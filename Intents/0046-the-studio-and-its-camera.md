---
id: "0046"
title: The Studio and its camera
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-19
story:                 # Stories/0046-slug/, set at propose
---

# 0046 · The Studio and its camera

## Idea

> We want to document every storytelling-relevant development progress (in terms of how the world evolves, what's
> happening in the world, new biomes, new water, new trees etc.) as actual video content. So what we need very first is
> this:
>
> - wire up latest Tauri in NativeGame
> - write a new "virtual camera engine", inspired by our lenses and timeline views of the three.js legacy TheGame
>   variant
> - and then navigate literally a "green meadow", as in just a green plain (aka the first story: what if we could start
>   from scratch, auf der grünen Wiese, and build the new civilization from the ground up)
> - and then let the virtual camera be defined by the timeline editor (rename this new app to Studio), like put 5
>   random shots of different sizes and movements into our game … does that make sense?
> - copy and paste the overall look and style of our dashboard of theOS/TheGame
> - with just 2 app views as dashboard grid items: A, Game; B, Studio
>
> […] Meadow is just a green colour plane, no meadow etc. yet, OK? […] We don't need Bevy at all, right, just Rust and
> wgpu? […] Execute the Studio, camera, Tauri bootstrapping: 0046, define and build it.
>
> […] Film should be purely 3D world navigation in real time, never rendered! […] So it's just a virtual camera
> navigating the 3D world.
>
> […] I love Bevy, so let's use it directly also for our core. […] Go Bevy only, we don't need legacy web UI at all.
> […] Let's ignore Loro, iroh etc. for the moment and just create the timeline and green plane starting scene with
> Bevy. […] Looks good, commit; just can you give us a minimal depth so we see that we even walk or move?

The first step of [0045](0045-a-food-forest-in-rust.md) in code: the app shell, a world that is a green plane, and a
virtual camera that a shot list drives through it live. Every later step of the world is filmed with this camera.

## Define

The definition below replaces the first one of the same day (Rust, wgpu and Tauri 2), changed at Samuel's word to
Bevy only: Bevy draws the world and the interface, with no web view and no Tauri.

**Deliverables**

1. `NativeGame/` as one Rust crate on Bevy 0.20.1: the camera, the world, the walker and the interface.
2. The world: a flat green plane to the horizon under a plain sky colour, with haze toward the horizon, and a soft
   mottle on the ground so a move can be seen. Nothing else.
3. The virtual camera (`src/camera.rs`): shots in the legacy timeline's format (`name`, `kind`, `secs`, `ease`, `keys`
   with `pos`, `look`, `mm`, `roll`), keys joined on a smooth curve, the five legacy eases, the legacy lens kit
   (Master Anamorphic 28–180 mm, 42.6 mm wide). Evaluated live, every frame: a film is never rendered ahead.
4. The app, drawn by Bevy in theOS's look (the brand's colours, DM Serif, Sans and Mono): a dashboard with two tiles,
   **Game** and **Studio**.
   - **Game:** walk and fly the plane (W A S D, the mouse held to look, Shift faster, E Q up and down, Escape home).
   - **Studio:** the live world through the virtual camera, the shots as a strip with kind, lens and length, a
     playhead, play and pause (Space), click or drag the strip to scrub, and "Five new shots" from a seed.
5. Five random shots of different sizes and moves (wide crane, medium track, close push, low orbit, locked long lens)
   as the first kept shot list, `NativeGame/timelines/first-shots.json` (`cargo run -- --shots <seed> <out.json>`).
6. A still for agents: `cargo run -- --still <shots.json> <seconds> <out.png>` takes one screenshot of the camera of a
   shot list at a time, then quits. A check, not a film.

**Checks**

| # | Check | How |
|---|---|---|
| 1 | It builds without warnings | `cargo build` and `cargo clippy` in `NativeGame/` |
| 2 | The camera is right | `cargo test`: the eases end at rest where they should, a shot passes through every key, the lens gives the legacy field of view (28 mm: 74.5° wide), seeking is the same as playing, a seed gives the same five kinds, the legacy format reads |
| 3 | The world is a green plane to the horizon under a sky, and a move shows | `--still` at three times of `first-shots.json`; the pictures looked at |
| 4 | The same shot list and time give the same picture | `--still` twice, the two PNGs byte for byte the same |
| 5 | The app opens with two tiles; Game walks; Studio plays the five shots live, pauses, scrubs | `cargo run`, looked at by Samuel |

**Out of scope**

- Rendering a film to a video file, or recording one.
- Anything in the world beyond the plane, its mottle and the sky.
- Tauri, a web view, Loro and iroh (later, at Samuel's word), phones and the web build.
- Editing single shots by hand in the Studio.
- Depth of field, transitions, weather and time of day in shots.

**Architecture pass**

- **What is there:** nothing in `NativeGame/` but its README. `TheGame/cine/` is the model for the shot format, the
  eases and the lens kit; it is read, not changed.
- **First principles:** the camera is a pure function of the shot list and the time; one eye entity is aimed by the
  walker in the Game and by the shot list in the Studio. So the Game, the Studio and the still share one path.

**Code gates:** a new folder in a new language; `tools/health.js` measures JavaScript and does not reach it. Held
instead: no warning from the compiler, no dependency beyond Bevy, serde and serde_json.

**The 10 % gate:** nothing in `TheGame/` or `OS/` is touched, so none of their measures can move; none gets worse.

## Build

- **Bevy 0.20 changed the interface API:** `Button` and `Interaction` are deprecated; clicks and drags are picking
  observers (`PointerClick`, `PointerPress`, `PointerDrag`) and hover is `Hovered`.
- **The first run on a machine compiles its shaders for a few seconds,** and a still taken earlier came out black.
  The still now waits 240 frames. A first still after a shader change can still be black on this Mac; take it again.
- **The plane alone showed no motion,** so it got a soft mottle: a 256-pixel noise tile repeating every 6 m, with its
  own smaller copies so it fades evenly toward the horizon. Its repeat shows as faint lines far out.
- **Fonts:** DM Serif Display, DM Sans and DM Mono from Google Fonts (OFL, licence beside them in `assets/fonts/`).
- **Tauri 3 alpha was weighed and left out:** CEF is desktop only and hundreds of MB; Bevy draws the interface instead.


## Propose

## Story

## Archived

---

## Todo

- [x] Checks 1 to 4 run (build, tests, stills, same bytes)
- [x] Check 5: Samuel looked, "looks good"

## Changelog

_One entry per request cycle, newest last._

### 2026-11-19

- **Asked:** Tauri in NativeGame, a virtual camera inspired by the lenses and the timeline, a green plane, the Studio
  with five random shots, the dashboard's look with two tiles; define and build it. Films live, never rendered.
- **Delivered:** the definition, changed the same day to Bevy only; the app: the dashboard with Game and Studio, the
  green plane with a mottle, the camera with the legacy shots, eases and lenses, five first shots, the agent's still.
- **Good:** six camera tests pass; two stills of the same moment are the same byte for byte; Samuel: "looks good".
- **Broke / not there yet:** the first build of Bevy took about 30 minutes on the M1 with 8 GB; the Xcode licence had
  to be accepted first. The interface was not seen by the agent, only the world through stills. A first still after a
  shader change can come out black.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-19 | `3f1d174` | the Bevy app: dashboard, Game, Studio, the camera and its tests, five first shots, the still |
