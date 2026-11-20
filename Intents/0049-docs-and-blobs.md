---
id: "0049"
title: Docs and blobs, and one camera for every world
state: build           # idea | define | build | propose | story | archived
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

1. **avenDB, the store.** Everything about Loro and iroh in one place: `avenDB/` at the repository's root, a Rust crate
   (the store, Bevy's asset sources, the kernel loader) with its data in `avenDB/data/` on this device (not in git).
   Blobs are iroh-blobs on disk, named by hash. A doc is one thing (one shader, one asset, one recipe, one shot list,
   one interface view, one engine), stored as snapshot blobs, with a table of doc id → its latest snapshot's hash. API:
   `put`/`get` for blobs; `open`/`commit`/`at(version)`/`fork` for docs. No sync.
2. **Bevy reads only docs and blobs.** Two asset sources, and two ways to name a thing:
   - `doc://<id>`: the doc as it is now (as IPNS). Watched, so a change reloads it while the app runs. For working.
   - `blob://<hash>`: exact content (as IPFS), never changing: a blob, or a doc at one version (its snapshot's hash).
     For pinning: a world's version names everything it uses by hash, so it reproduces exactly.
   A doc's id is its identity across versions, so it cannot be a content hash (the content changes); every version of
   it is one. One doc per thing, so no path inside a doc is needed. Everything now read from files moves into docs:
   shaders, the library's assets, the biome recipe, the shot lists and anchors, fonts and images as blobs.
3. **Bakes cached by what they are made from.** An impostor atlas, the lawn and the grass patch are blobs keyed by the
   hash of their master's recipe, the bake's settings and the engine build. A key already there skips the bake.
4. **One contract for anything the Studio films.** A Bevy world (the Meadow, the Library, Mértola, later the food forest) and the
   interface itself expose the same things, by path:
   - **The eye:** place, aim, roll; the lens's focal length, aperture (f-stop) and focus distance, sensor size, shutter
     angle. Any value the world wants: the virtual camera has no glass, so no real lens's limits bind it. Depth of
     field and exposure follow the physical formulas, so a value beyond any real lens still behaves like a lens.
   - **The clock:** hour and date (sun and moon follow), wind and weather.
   - **The world's own parameters,** each with a path, a type and a range.
   A timeline is tracks of keys on those paths; the Studio, its sun dial and its timeline editor drive any world
   through them and know none.
5. **Lenses as docs: optics only.** The ARRI/ZEISS Master Anamorphic set as the reference: one doc per focal length (28,
   35, 40, 50, 60, 75, 100, 135 mm at T1.9, 180 mm at T2.8), and a doc for the set, holding only optics (focal length,
   rated aperture range, close focus) as marks the Studio can show as a hint, never a block. No squeeze: spherical,
   round bokeh, any frame shape as a crop.
   **The flare is the world's, not the lens's:** a render feature of every world, set and animated like its haze and
   bloom: horizontal streaks through bright sources (tint, length, threshold), ghosts mirrored across the centre,
   veiling glare. One post pass on the bright pixels the bloom already finds.
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
8. **The engine in avenDB, and one kernel loader.** The engine is stored like everything else: its Rust source a tree of
   blobs with a manifest (as git's trees), each build a blob recording the source tree and toolchain it was made from,
   and the engine a doc whose versions point to them. The only thing installed is a small binary that opens the root
   doc, reads which engine build it pins, verifies its hash and starts it as its own process. A world's version
   pins the engine build and its docs' versions, so any frame can be made again exactly.

**Checks** (how each is shown to be done)

| # | Check | How |
| --- | --- | --- |
| 1 | Blobs and docs round-trip; a doc's every version reads back | `cargo test` in `avenDB/`: put/get by hash; commit three versions, `at` each, `fork` the first |
| 2 | No file is read from `assets/` | the asset folder renamed away, the app runs, the gate's four pictures as before; a shader doc edited while the app runs changes the picture within a second |
| 3 | A second start bakes nothing | the log counts bakes: first start N, second start 0; the startup time below |
| 4 | The Studio films the Meadow, the Library and Mértola through the contract alone | `film.rs` names no world type; the same shot list plays over both; `--gate` passes |
| 5 | Lens and flare | a shot pulls focus 0.3 → 30 m at f/1.4 and stops down to f/16 with the exposure held; a shot into the sun, the world's flare animated up, shows streaks, ghosts and glare growing as the sun enters the frame; looked at by Samuel |
| 6 | The interface replays the same | a recorded session (open Library, pick three assets, open the Studio) replayed twice gives identical frames; the dashboard filmed full frame and on a screen in the Meadow |
| 7 | One shot list plays across worlds | the example timeline plays from start to end: Meadow shots, dashboard shots (a scripted pointer opening the Library and the Studio), the real place's shots (its real hills and land cover, recognisable against a map), each with its own hour and lens; `--gate` takes a picture of each |
| 8 | The loader starts a pinned build | change the root doc's pinned build to an older blob: the loader starts that one; a corrupted blob is refused |

**Out of scope**

- Sync between devices, and any network (iroh's endpoint stays off).
- Building the real-place world itself: intent 0048 does.
- Snapshots of the store into git, and restoring from them (later, at Samuel's word).
- The web TheGame and play's versioned documents (they keep their own storage for now).
- Anamorphic squeeze and oval bokeh; lens effects held by the lens.
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

- **Baselines on main (2026-11-20, MacBook):** the Meadow settled (its bakes in place) after 8.9 s on every start;
  peak memory 0.6–0.8 GB; 6,374 lines in `NativeGame/src`; 6 environment switches.
- **The store (deliverable 1):** `avenDB/`, iroh-blobs 0.105 (file store) and Loro 1.18. One store for the machine, in
  `avenDB/` at the main checkout's root (git ignores its files), so every worktree and session shares it. A doc's id
  is one flat name (`ground.wesl`, `clover.asset`, `mertola.place`), never a path; a place is one doc whose files are
  its parts. A commit merges what others committed to the doc meanwhile (Loro), so parallel worktrees never overwrite
  each other. The store's files open in one process only: the first process owns them and serves the store to the
  others on 127.0.0.1 (iroh-blobs' RPC, trusting only the owner's certificate). `avendb` in a shell: import, put,
  part, cat, ls, head. 5 tests pass.
- **Bevy reads only avenDB (deliverable 2):** avenDB is Bevy's default asset source, watched; `blob://` the second.
  Shaders, fonts, the library, the biome, the shot lists, Mértola, and every Earth tile and canopy piece fetched (once,
  by its own name) come from it. With `NativeGame/assets` renamed away the gate's four pictures are unchanged and
  Mértola renders; editing `ground.wesl` from a shell while the Meadow ran reloaded it on screen.
- **Every reference by id:** a doc's id is opaque and flat (26 letters, made once); its kind and name are inside it.
  One root doc names, by id, every doc the engine uses (shaders, fonts, library, biome, shot lists, Mértola, the
  Earth's data, the bakes, the dashboard, the engine). Shaders import each other by id. The Earth's open data are parts
  of one doc under their source URL. Nothing is found by a name or a path.
- **Bakes made once (deliverable 3):** the lawn's and every impostor's atlases kept under the hash of their master,
  settings, shader version and bake code. The Meadow settled after 8.9 s on every start; now 0.5 s on a second start.
- **The contract (deliverable 4):** one Eye (place, aim, roll, lens: focal length, aperture, focus, frame, shutter, any
  value), one Clock (day, hour, wind, auto), the world's Land, and the World shown as a state of its own, picked by the
  view or, in the Studio, by the doc a shot names. The Meadow, the Library and Mértola take camera, sun and wind from
  it; the place's walker, map and dial and the Library's atlas belong to their views, not to a film of their world.
  Depth of field from the lens (Bevy's bokeh, from f-stops and the frame's height). The frame is the 42.6 mm one the
  shots were composed in, so the gate's pictures are unchanged.
- **The timeline crosses worlds (deliverable 7):** the example shot list opens on the dashboard (filmed, a pointer
  moving to the Game and clicking), then the Meadow, a focus pull (f/1.4 from 0.3 to 30 m, stopped down to f/16), the
  Library on the clover's doc, Mértola from above on its doc. `--gate <dir> <shots id>` photographs any shot list.
- **The interface as docs (deliverable 6), in part:** a view is a doc (boxes and words in the brand's look; a click
  opens a doc by id), drawn by `views.rs`; the dashboard is made this way, and a view is filmed as a world
  (`World::Interface`). Every overlay is a layer doc too: a chip, a bar of chips, the sun and wind sliders, the
  Library's list (made from the library, with templates for its items and headings), the Studio's bar; words can show
  a live value (frame time, caption, playhead, Play or Pause, title), a box can act (Home, Play, the anchors, new
  shots) or open a doc; a layer includes others by id (one Home chip in every bar). Each view lists its layers, by
  id, in the root; a shot lays its own layers over its world while it plays, with their live values. Moving Mértola's
  hint chip was a change to its doc alone. Not yet: a view on a screen inside a world; recording and replaying input.
- **The engine in avenDB, and the kernel (deliverable 8):** `avendb publish` keeps a build: every source file a blob,
  the tree a manifest blob, the binary a blob, the build a blob naming them and the toolchain; the engine doc lists its
  builds and pins one. `kernel` opens avenDB, follows the root to the engine's pinned build, checks the binary against
  its hash (a corrupted one is refused and written again from the store), starts it and serves the store to it.
  Pinning build two started build two; pinning build one back started build one.
- **Not yet:** the repository's seed copies (`assets/`, `library/`, `biomes/`, `timelines/`) are still there, read by
  nothing (deleting them leaves avenDB's folder the only copy); the world flare (deliverable 5) waits, at Samuel's word.

## Propose

_Filled when everything is built. Then stop: the human decides._

## Story

_Filled after the human's yes._

## Archived

_accepted or rejected, the date, the reason in a line._

---

## Todo

- [x] Samuel approves the definition
- [ ] Measure the code gates and the 10 % gate on `main`
- [x] 1 The store
- [x] 2 Bevy reads only docs and blobs
- [x] 3 Bakes cached by hash
- [x] 4 The Studio's contract
- [ ] 5 Lenses and the flare (the flare waits, at Samuel's word)
- [ ] 6 The interface as docs, filmable (the dashboard done; the other views, a screen in a world, input replay to do)
- [x] 7 The example timeline across worlds: Meadow, dashboard, a real place on Earth (intent 0048's world)
- [x] 8 The kernel loader

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

### 2026-11-20, later

- **Asked:** why a doc's id and not a content hash; the flare a world feature, not the lens's; the engines stored in
  iroh and Loro too; everything about Loro and iroh in one folder, avenDB.
- **Delivered:** the definition changed: `avenDB/` holds the store, the sources and the loader; a doc is named by its
  id when working and by hash when pinned, one doc per thing (no paths); lenses hold optics only, the flare is the
  world's; the engine is a doc in avenDB pointing to its source tree and builds.

## Trail

| When | Commit | What |
| --- | --- | --- |
