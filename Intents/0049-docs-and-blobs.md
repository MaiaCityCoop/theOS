---
id: "0049"
title: Docs and blobs, and one camera for every world
state: define          # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0049-slug/, set at propose
---

# 0049 · Docs and blobs, and one camera for every world

## Idea

> We need to talk about a standardized / unified interface for any world/game for a virtual camera and sun/time dial.
> For our studio / timeline editor. This includes the core architecture about data driven renderer/procedural assets
> and shaders alike. […] Like the universal version control and evolution of every world, asset (lib viewer, UI view)
> but not in a git repo only as SSOT but in a Loro doc native way with iroh blobs (aka content-addressable engine and
> asset all together). […] We are happy to store snapshots inside of git, but our production system should be based
> on iroh/Loro docs.
>
> The virtual camera should also have the anamorphic lenses and f-stops. […] Take the real ARRI anamorphic lens set.
> […] Since we have a virtual camera we don't need to match the physical limits of close focus and T-stops the real
> lenses have; we can use the full virtual range that we want for our worlds. […] We don't need the anamorphic squeeze
> actually, just the flare-like experience.
>
> Also the Bevy UI like the dashboard etc. should be reproducible and versioned and filmable the same way as the game
> worlds.
>
> The engine's Rust source plus builds should also be in iroh and served from there to our game. So the game just has
> one root kernel loader. […] Camera only needs Bevy worlds. […] The analogy of a Loro doc is IPNS and iroh blobs are
> IPFS, content-addressable. […] We universally speak of docs and blobs. A doc is also stored via iroh. […] For now we
> don't need the sync part, one device locally is good enough.

Two words for everything: a **blob** is immutable bytes named by their BLAKE3 hash (as IPFS); a **doc** is a Loro
document with its whole history, named by an id, stored as blobs (its snapshots), the id pointing to its latest (as
IPNS, but every version stays addressable). Docs and blobs are the source of truth; snapshots into git come later.

## Define

**Deliverables**, built in this order, each usable on its own:

1. **The store.** One local store on this device: blobs (iroh-blobs, on disk) and docs (Loro, stored as snapshot blobs,
   with a table of doc id → latest snapshot hash). One small Rust module, `store`, with `put`/`get` for blobs and
   `open`/`commit`/`at(version)`/`fork` for docs. No sync.
2. **Bevy reads only docs and blobs.** Two asset sources: `blob://<hash>` and `doc://<id>/<path>`, the second watched,
   so a change of a doc reloads what it holds while the app runs. Everything now read from files moves into docs:
   shaders, the library's assets, the biome recipe, the shot lists and anchors, fonts and images as blobs.
3. **Bakes cached by what they are made from.** An impostor atlas, the lawn and the grass patch are blobs keyed by the
   hash of their master's recipe, the bake's settings and the engine build. A key already there skips the bake.
4. **One contract for anything the Studio films.** A Bevy world (the Meadow, the Library, later the food forest) and the
   interface itself expose the same things, by path:
   - **The eye:** place, aim, roll; the lens's focal length, aperture (f-stop) and focus distance, sensor size, shutter
     angle. Any value the world wants: the virtual camera has no glass, so no real lens's limits bind it. Depth of
     field and exposure follow the physical formulas, so a value beyond any real lens still behaves like a lens.
   - **The clock:** hour and date (sun and moon follow), wind and weather.
   - **The world's own parameters,** each with a path, a type and a range.
   A timeline is tracks of keys on those paths; the Studio, its sun dial and its timeline editor drive any world
   through them and know none.
5. **Lenses as docs, with the ARRI/ZEISS Master Anamorphic set as the reference.** One doc per focal length (28, 35, 40,
   50, 60, 75, 100, 135 mm at T1.9, 180 mm at T2.8; 2× squeeze, close focus per lens, as ARRI's technical data), and
   a doc for the set. Their rated ranges are kept as marks (the Studio can show when a shot goes past a real lens, as a
   hint, never a block). **No squeeze**: the camera stays spherical, round bokeh, any frame shape as a crop. From the
   anamorphic look only the **flare**: horizontal streaks through bright sources (tint, length, threshold), ghosts
   mirrored across the centre, veiling glare; each a lens parameter, animatable. One post pass on the bright pixels the
   bloom already finds.
6. **The interface as docs, reproducible and filmable.** The dashboard, the Library and the Studio views are docs (a tree
   of nodes, layout, theme, text, actions bound to paths), interpreted by the engine instead of built in `ui.rs`. Its
   animations read the Studio's clock, never the wall clock; input is recorded as events and replays to the same
   frames. It renders into its own image: a shot films it full frame (cuts, zooms, a scripted pointer that moves and
   clicks) or on a screen inside a world. The timeline has interface tracks: the view open, the pointer's path, clicks,
   typed text.
7. **The example timeline crosses worlds: the proof that the contract works.** The Studio's example shot list (`timelines/first-shots.json`, the one it
   opens with) is extended to cut between worlds through the one contract: the Meadow, the dashboard and its views
   filmed as interface shots (full frame and on a screen in a world), and **a real place on Earth**. That world is
   built in intent [0048, a real place to walk](0048-a-real-place-to-walk.md) (Mértola, from open data), not here: this intent gives it the contract
   (its world exposes the eye, the clock and its parameters) and puts its shots in the timeline.
8. **One kernel loader.** The only thing installed: a small binary that opens the root doc, reads which engine build it
   pins (a blob), verifies its hash and starts it as its own process. The engine's Rust source is a tree of blobs with a
   manifest (as git's trees); a build blob records the source tree and toolchain it was made from. A world's version
   pins the engine build and its docs' versions, so any frame can be made again exactly.

**Checks** (how each is shown to be done)

| # | Check | How |
| --- | --- | --- |
| 1 | Blobs and docs round-trip; a doc's every version reads back | `cargo test store`: put/get by hash; commit three versions, `at` each, `fork` the first |
| 2 | No file is read from `assets/` | the asset folder renamed away, the app runs, the gate's four pictures as before; a shader doc edited while the app runs changes the picture within a second |
| 3 | A second start bakes nothing | the log counts bakes: first start N, second start 0; the startup time below |
| 4 | The Studio films the Meadow and the Library through the contract alone | `film.rs` names no world type; the same shot list plays over both; `--gate` passes |
| 5 | Lens and flare | a shot pulls focus 0.3 → 30 m at f/1.4 and stops down to f/16 with the exposure held; a shot into the sun shows streaks, ghosts and glare growing as the sun enters the frame; looked at by Samuel |
| 6 | The interface replays the same | a recorded session (open Library, pick three assets, open the Studio) replayed twice gives identical frames; the dashboard filmed full frame and on a screen in the Meadow |
| 7 | One shot list plays across worlds | the example timeline plays from start to end: Meadow shots, dashboard shots (a scripted pointer opening the Library and the Studio), the real place's shots (its real hills and land cover, recognisable against a map), each with its own hour and lens; `--gate` takes a picture of each |
| 8 | The loader starts a pinned build | change the root doc's pinned build to an older blob: the loader starts that one; a corrupted blob is refused |

**Out of scope**

- Sync between devices, and any network (iroh's endpoint stays off).
- Building the real-place world itself: intent 0048 does.
- Snapshots of the store into git, and restoring from them (later, at Samuel's word).
- The web TheGame and play's versioned documents (they keep their own storage for now).
- Anamorphic squeeze and oval bokeh.
- WASM modules for game logic.
- Editing docs by hand in an editor of our own (docs are changed by the app and the agents' tools).

**Architecture pass** (over everything this intent touches)

- **What is there** (in `NativeGame/`): files on disk read by path: `assets/shaders/*.wesl`, `assets/fonts/`,
  `library/*.json` (`library.rs`, read once into a `BTreeMap`), `biomes/meadow.json` (rewritten at every start),
  `timelines/*.json` (`camera::Timeline`). Bakes (`impostor.rs`, `lawn.rs`, `patches.rs`) run at every start and keep
  nothing. The camera: `camera::Camera { pos, look, mm, roll }` and `film::aim`; the clock is `meadow::Hour` and
  `wind::Strength`, set by `film::play` from a shot's own fields; depth of field is a meadow-only option
  (`MEADOW_DOF`), focused by `meadow::focus`. The Studio's playback (`film::play`), the gate (`film::gate`), the still
  (`film::take_still`), the measure (`meadow::measure`) and the shelf (`workshop::shelf_shots`) are five loops that each
  drive a camera and take pictures. The interface is built in code (`ui.rs`, 625 lines), its hover and transitions on
  the wall clock. Switches by environment variable (`MEADOW_NO_*`, `MEADOW_DOF`, `MEADOW_PATCHES`, `LAWN_DUMP`,
  `SHELF_N`).
- **First principles:** the invariant is one: a frame is a function of (engine build, docs at a version, the contract's
  values at a time). Everything that reads something else (a file, the wall clock, an environment switch, a bake made
  afresh) breaks it.
- **To take away:** the five picture loops become one (a timeline played to images, at real time or frame by frame);
  the per-view camera code goes behind the contract; the files' paths, the bakes' recomputation and the environment
  switches go (a switch becomes a parameter in a doc); `ui.rs` becomes an interpreter of interface docs.
- **Put back, in the best form:** see [`research_notes/0049-docs-and-blobs.md`](../research_notes/0049-docs-and-blobs.md)
  (iroh-blobs' store, Loro's snapshots and versions, Bevy's asset sources and watcher; the options weighed).

**Code gates** (Rust: lines with `tokei NativeGame/src`, complexity with `cargo clippy -W clippy::cognitive_complexity`;
measured on `main` when this definition is approved)

| Gate | On `main` now | Target |
| --- | --- | --- |
| Size (lines of code) | to measure | the five picture loops, file paths and `ui.rs`'s hand-built views go; new lines only for the store, the sources, the contract and the loader |
| Copies | to measure | lower, no new clone |
| Spaghetti | to measure | no function over the ceiling set then; the mean lower |
| Dead and legacy code | to measure | 0 (no file path to `assets/`, no `std::env::var` switch left) |
| Coupling | to measure | `film.rs` imports no world module |
| Settings | 8 environment switches | 0: each is a parameter in a doc |
| Dependencies | — | new: `loro`, `iroh-blobs` (the reason is this intent), `blake3` through it; nothing else |

**The 10 % gate** (on the MacBook, one run at a time, no other instance running)

| Measure | On `main` now | Target (≥ 10 %) | At Propose |
| --- | --- | --- | --- |
| Startup: the Meadow settled where it starts, warm (second start) | to measure | ≥ 10 % faster: no bakes on a warm start | |
| Rendering: the four anchors' mean and p95 frame (`--gate`) | 27–32 ms, p95 33–37 ms (0047, 2026-11-20) | not worse; the flare pass within 1 ms | |
| Memory: the app's peak | to measure | not worse | |
| Quality: the four anchors looked at | — | the same pictures | |

## Build

_Filled while building._

## Propose

_Filled when everything is built. Then stop: the human decides._

## Story

_Filled after the human's yes._

## Archived

_accepted or rejected, the date, the reason in a line._

---

## Todo

- [ ] Samuel approves the definition
- [ ] Measure the code gates and the 10 % gate on `main`
- [ ] 1 The store
- [ ] 2 Bevy reads only docs and blobs
- [ ] 3 Bakes cached by hash
- [ ] 4 The Studio's contract
- [ ] 5 Lenses and the flare
- [ ] 6 The interface as docs, filmable
- [ ] 7 The example timeline across worlds: Meadow, dashboard, a real place on Earth (intent 0048's world)
- [ ] 8 The kernel loader

## Changelog

### 2026-11-20

- **Asked:** a unified camera and sun/time interface for every world, for the Studio; worlds, assets, shaders, the
  interface and the engine itself versioned as Loro docs and iroh blobs, git only for snapshots; the ARRI anamorphic
  lens set with the full virtual range, the flare without the squeeze; the interface filmable like the worlds; one
  kernel loader; one device, no sync for now.
- **Delivered:** this intent, opened in Define, and its research note.
- **Good:** —
- **Broke / not there yet:** the code gates and the startup baseline are not measured yet.
- **Asked:** not to plan the git snapshots and restoring yet. **Delivered:** taken out of the deliverables, into out of
  scope.
- **Asked:** the example timeline extended with dashboard shots and the Earth terrain world's shots. **Delivered:**
  deliverable 7 and its check. It is the proof that the contract works. The real-place world is intent 0048's; 0049 films it through the
  contract. Renumbered from 0048 to 0049: 0048 was already taken by the real-place intent.

## Trail

| When | Commit | What |
| --- | --- | --- |
