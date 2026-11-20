---
id: "0054"
title: Core plugins and modules, every part loaded by its hash
state: define          # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0054-slug/, set at propose
---

# 0054 · Core plugins and modules, every part loaded by its hash

## Idea

Samuel, 2026-11-20, on why every change rebuilds the whole app:

> Shouldn't terrain, plants, Earth, interface etc. be fully dynamic theDB native blobs, instead of theOS
> dependencies? theOS should be just kernel and theDB primitives, not the data and its engines. Am I right?

After the cut to day 1 (intent 0055), on what git should track and what theDB should:

> What we need is a stable clean Docs/Blobs Viewer and a stable Story/Timeline Editor, while being able to flexibly
> react to any new game worlds, camera settings, sun, wind, configs etc.

> Please architect the whole thing directly with modules first, and teach me about the clean interface between
> modules and host, and their roles.

> Ensure that also every host-code engine / renderer / particles gateway etc. is also referenceable by its BLAKE3 hash,
> and we maintain backwards compatibility by keeping always every render hash. So we have dynamic WASM modules, and
> core / kernel plugins. Kernel plugins, and dynamic modules for AI- and user-generated stuff. But everything is still
> referenced and loaded solely by its BLAKE3 hash: plugins via the git repo and modules via the DATA store.

> Also the Loro doc ids of host plugins can be git-committed as well, right?

> Write it up now. Also ensure to get rid of our current kernel watcher plugin.

## Define

_Rewritten 2026-11-20 at Samuel's word; replaces the first definition (modules as blobs only). Waits for his
approval before Build._

### The roles

| Part | Role | Source | Binary |
| --- | --- | --- | --- |
| **theKERNEL** | boots: reads the root hash, starts the host manifest it pins | git | built from git, installed |
| **theDB** | docs and blobs, branches, checked merges; one root hash names the whole system | git | a core plugin |
| **Core plugins** | the host's capabilities: the frame loop and window, the renderer, input, the module runtime, the timeline evaluator, the **Docs/Blobs Viewer**, the **Story/Timeline Editor**; later particles, audio, physics | git | a blob in theDB, by BLAKE3 |
| **Modules** | everything a world is: sky, ground, sun, wind, generators (recipe + seed → mesh), world logic. Written by us, by users, by AI | theDB docs | a WASM blob in theDB, by BLAKE3 |
| **Content** | worlds (which modules, with which values), timelines, interface layouts, schemas, assets | theDB docs | blobs where binary |

**The one rule between them: modules describe, the host executes.** A module never touches the GPU, the renderer,
files or the network. It is given inputs and returns plain data. That makes a module safe to run when anyone wrote
it, swappable while theOS runs, testable alone, and reproducible.

### Code in git, content in theDB

Code goes through review, a compile check and CI, works with every file-based tool, and must be buildable when the
store is empty or broken, so the tools that inspect and repair the store keep working. Content changes while theOS
runs, needs history per doc, live reload and, later, sync. So:

- **Git** is the one home of every core plugin's source and of theKERNEL's. This revises intent 0051: the engine's
  source is no longer edited as a tree of docs in theDB; theDB keeps each build's source as an immutable snapshot (as
  intent 0049 had it), so a build can still be checked out by hash.
- **theDB** is the one home of everything else, modules' source and binaries included (a module is small and checked
  one at a time, so it is edited as docs).

### Everything is loaded by its hash

- **A core plugin build** is a blob named by its BLAKE3 hash, built from a git commit with a pinned toolchain, and
  rebuildable from that commit to the same hash.
- **`plugins.lock`**, checked into git, is the record of every core plugin build ever released, append-only:

  ```
  [render]
  doc = "q3x7…"                   # the plugin's doc id in theDB: its stable name
  gateways = ["theos:render/mesh@1"]

  [[render.build]]
  version = "1.0.0"
  hash = "b3a9…"                  # BLAKE3 of the binary blob
  commit = "e5801de7"             # the git commit it was built from
  toolchain = "rustc 1.98.0"
  gateways = ["theos:render/mesh@1#<hash of its WIT>"]
  ```

- **A plugin's doc id is committed in git** (its stable name), so every device makes that doc with that id; theDB
  gains "make a doc with a given id".
- **What is in use is a pointer, so it lives in a doc:** a **host manifest** doc lists the core plugin builds a host
  consists of, by hash; the root pins a host manifest. Git records what was released, theDB what is in use; neither
  copies the other's facts.
- **Binaries** of core plugins are kept in `DATA/archive/` for good; nothing a pinned root reaches is ever pruned.
- **A module** is a blob by hash; a world doc names each module it uses by hash.

### The gateways: the interface between host and modules

A **gateway** is a versioned interface a core plugin implements and modules use, written in WIT (the WebAssembly
component model): `theos:world/params@1`, `theos:render/mesh@1`, `theos:render/light@1`. Each gateway's WIT text is
hashed, so its exact shape is pinned. A module declares the gateways it needs by name, version and hash; the host
checks it provides each exactly, then wires them. A mismatch is refused before anything runs.

**What every module declares, `describe()`:** its name, the gateways it needs, its parameters, typed, with units and
ranges (`elevation: f32, 0–90, degrees`; `colour: rgb`; `strength: f32, 0–3`), and what it provides: geometry, a
light, a published value (the wind), shader docs by id.

**What the host calls on a module:**
- `init(params)`: once, when a world opens;
- `update(time, params, input) -> commands`: each frame, only for modules that need it;
- `generate(recipe, seed) -> mesh`: for generators, once per individual.

**What a module may call on the host (its only capabilities):** read a doc or blob it was given; read values other
modules publish; log; a seeded random number and the time, both given by the host so that frames reproduce.

**What crosses the boundary is commands, not objects:**
- `mesh(id, positions, normals, colours, indices, extra attributes)`: once;
- `draw(mesh, material, transforms[])`: one call places any number of instances;
- `material(shader doc, uniforms)`;
- `light(kind, direction, colour, intensity)`;
- `publish(name, value)`: a value for other modules (the wind's vector).

Modules never call each other: they read what others publish, routed by the host in a fixed order, so a frame is
deterministic.

### Why the two tools stay stable

- **The Story/Timeline Editor animates parameters by path,** never by a field it knows: a key says
  `world.sun.elevation = 30 at 4 s`. Each frame the host evaluates the timeline, writes the values into each module's
  parameters, calls `update`, and binds parameters to shader uniforms by name. A new module's parameters can be
  animated at once, without a change to the editor.
- **The Docs/Blobs Viewer shows any doc** through its kind's schema (a doc, itself), and any blob by hash with what
  references it.

### Lifecycle

- **Load:** the host fetches a module's blob by hash, compiles it once (kept in `DATA/cache/`), instantiates it for
  the world.
- **Swap:** when a module's doc changes, the host makes a new instance, keeps the parameters' values, and rebuilds
  what the module drew; theOS goes on.
- **Limits:** a time budget per call (wasmtime's epochs), a memory cap; a module that misbehaves is stopped and the
  world goes on without it.

### Backwards compatibility

- Gateways are never changed, only added: `particles@2` sits beside `@1`, and new core plugin builds keep
  implementing old versions while anything pinned needs them (as WASI evolves).
- An old world opens on today's host if it provides every gateway the world needs, else on the host manifest it was
  pinned with, which theKERNEL starts by hash.

### What needs host code still

A new kind of capability: a new command (particles, volumetric fog), a new render pass. That is a deliberate,
reviewed addition: a new gateway version, a new core plugin build, a new line in `plugins.lock`. Everything that uses
it stays a module.

### The kernel's watcher plugin goes

theKERNEL's plugins (a watcher that called a plugin when a doc of its kind changed; its only plugin was the baker, gone
with the cut to day 1) are removed: `plugin.rs`, its tests and theKERNEL's empty plugin list. "Plugin" now means a
core plugin only. A watcher, if one is needed again, is a core plugin or a module like any other.

### Research before Build

`Research/0054-core-plugins-and-modules.md`: wasmtime and the component model in a Bevy host
([Wasvy](https://docs.rs/crate/wasvy/latest), [wash-runtime](https://lib.rs/crates/wash-runtime),
[a component-model plugin system](https://dev.to/topheman/webassembly-component-model-building-a-plugin-system-58o0),
[host and plugin architecture](https://bytecodealliance.github.io/zulip-archive/stream/206238-general/topic/Architecture.20for.20Wasip2.20Host.2FPlugin.html));
how native core plugins are loaded by hash without a stable Rust ABI (one host binary composed of its plugins and named
by their hashes, or plugins as dynamic libraries built with the pinned toolchain); reproducible Rust builds.

### Deliverables

1. The gateways in WIT, hashed: `theos:world/params@1`, `theos:render/mesh@1`, `theos:render/light@1`; the module
   runtime (wasmtime) in the host.
2. Core plugins built from git by hash; `plugins.lock`; host manifests in theDB; theKERNEL starts a host manifest by
   hash; theDB makes docs with a given id.
3. The engine's source back in git as its one home (intent 0051 revised): the source tree in theDB and `theDB snapshot`
   go; `theDB publish` builds from a git commit and records it.
4. Day 1 as modules: `flat-sky` (a colour) and `grid-ground` (colours and spacing), each a WASM blob; the world doc names
   them by hash; the grid drawn exactly as today.
5. The Story/Timeline Editor animating module parameters by path; the Docs/Blobs Viewer as a core plugin.
6. The kernel's watcher plugin removed.

### Checks

| # | Check | How |
| --- | --- | --- |
| 1 | Day 1 looks the same | the two shots of "This is day 1" as modules, compared with today's stills |
| 2 | A module swaps while theOS runs | change `grid-ground`'s spacing in its doc; the running world shows it without a restart |
| 3 | A parameter is animated by path | a key on `world.sky.colour` in a timeline plays, with no editor change |
| 4 | Sandboxed | a module that reads a file, opens a socket or loops forever is stopped; the world goes on |
| 5 | Pinned | a world pinned to an old module hash grows the same mesh after the module changes |
| 6 | Everything by hash | the root names a host manifest by hash; each core plugin's binary matches its line in `plugins.lock`; a rebuild from its commit gives the same hash |
| 7 | The watcher is gone | no `plugin.rs`, no plugin list in theKERNEL |

**The 10 % gate:** a change to a world's look on screen in under 10 s (a module), against 1–2 minutes today (the host);
the frame not slower than day 1's.

**Out of scope:** the renderer itself as modules; sharing modules between citizens over the network (the sandbox
makes it possible; trust and sharing are their own intent); docs in SQLite (0053).

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel approves this definition
- [ ] Research written
- [x] 6 The kernel's watcher plugin removed (done ahead, at Samuel's word)
- [ ] 1–5

## Changelog

### 2026-11-20

- **Asked:** define now, build after 0050 (first definition, approved).
- **Asked again, after the cut to day 1:** modules first; the roles and the interface between host and modules; every
  part referenced and loaded by its BLAKE3 hash; core plugins from git and modules from DATA; plugin doc ids
  committed in git; the kernel's watcher plugin gone.
- **Delivered:** this definition.

## Trail

| When | Commit | What |
| --- | --- | --- |
