---
id: "0054"
title: theOS is theKERNEL and theDB; everything else is a module in theDB
state: define          # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0054-slug/, set at propose
---

# 0054 · theOS is theKERNEL and theDB; everything else is a module in theDB

## Idea

Samuel, 2026-11-20, on why every change rebuilds the whole app:

> Shouldn't terrain, plants, Earth, interface etc. be fully dynamic theDB native blobs, instead of theOS
> dependencies? theOS should be just kernel and theDB primitives, not the data and its engines. Am I right?

> Yes, define now and build after 0050.

## Define

_Approved by Samuel, 2026-11-20 ("accept the plan"). To be built after intent 0050._

**What is there (2026-11-20).** theKERNEL and theDB are the only fixed parts, and the engine is a blob theKERNEL loads
by hash. Data is docs and blobs (recipes, shaders, layers, places, bakes). But the engine blob is one binary of
224 MB: the renderer, the terrain, every generator (plants, rocks, the tree), the bakers (impostor, lawn, a place from
open data) and the interface's drawing are compiled together. A change to one generator recompiles the whole app crate
and links everything again (1 to 2 minutes), and an old asset runs whatever generator the newest build has.

**The layers**

| Layer | What | Where |
| --- | --- | --- |
| theKERNEL, theDB | the loader, the store, the kernel's plugins | the only thing installed |
| The host | the renderer (Bevy), the window, input, and the contract modules are called through | one blob, changes rarely |
| Modules | generators (recipe + seed → a master), bakers (a master → its far views; a place from open data), world logic that does not run per frame | each its own blob in theDB, loaded while theOS runs |
| Data | recipes, shaders, layers, places, bakes | docs and blobs, as today |

**The form chosen: WebAssembly modules.** A generator is a pure function, so it needs nothing of the host. A module
is a `.wasm` blob named by its hash; a recipe names the module that grows it by hash (pinned) or by its doc (latest),
so an old asset always runs its own generator; a module builds in seconds and is swapped in the running app; it can
touch only what it is given, so a citizen's module is safe to run. What runs every frame on the GPU path stays in the
host; mesh data crossing to the host is copied once per master, which is what generators and bakers do anyway.

**Options weighed** (research to be written in `Research/0054-modules-as-blobs.md` before building)

| Option | For | Against |
| --- | --- | --- |
| One binary (today) | simple | every change rebuilds and links all; no pinning per asset |
| Split into crates | smaller rebuilds | still one binary to link and restart |
| Dynamic libraries per module | native speed, full access to the host | Rust has no stable ABI: every module must be built with the host's exact toolchain and Bevy; a bad module takes the app down |
| **WebAssembly modules** (wasmtime, the component model for the interface) | small, fast to build, sandboxed, pinned by hash, any language | a copy at the boundary; no direct access to the renderer |

Prior art to read first: [Wasvy](https://docs.rs/crate/wasvy/latest) (Bevy mods as sandboxed WASI components on
wasmtime, hot reloaded; early), [wash-runtime](https://lib.rs/crates/wash-runtime) (embedding components with hot
reload), [a component-model plugin system](https://dev.to/topheman/webassembly-component-model-building-a-plugin-system-58o0),
the Bytecode Alliance's notes on [host and plugin architecture](https://bytecodealliance.github.io/zulip-archive/stream/206238-general/topic/Architecture.20for.20Wasip2.20Host.2FPlugin.html).

**Deliverables**

1. The module contract, one interface for each kind: `generator` (recipe, seed, size, colour → mesh attributes, wind
   weights), `baker` (inputs → parts of a bake result), cut along intent 0050's contracts (`library::GENERATORS`,
   `bakes`).
2. The host loads modules from theDB by id or hash, caches the compiled form in `DATA/cache/`, and swaps a module when
   its doc changes, without a restart.
3. Every generator as a module (plants, rocks, the tree, the terrain's shape), then the bakers that need no GPU (a
   place from open data); a module's source is a tree in theDB like the engine's, built by `theDB` into its blob.
4. A recipe names its generator module; a bake's key holds the module's hash in place of the generator's source text.
5. theOS's own build no longer contains a generator.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | A generator change needs no host build | edit the tree's module, `theDB` builds it in seconds, the running Library shows the new tree |
| 2 | Pinned | an asset pinned to an old module grows the same master after the module changes (mesh hash equal) |
| 3 | Same pictures | every Library asset's master is the same mesh from its module as from the built-in generator (hash) |
| 4 | Sandboxed | a module that tries to read a file or the network fails, the app goes on |
| 5 | The host is smaller | no generator in theOS's source tree (grep); its lines and binary size, before and after |

**The 10 % gate:** a generator's change to its picture on screen: from 1–2 minutes (host build) to under 10 s. A
master's growth time not more than 10 % slower than native, or Samuel decides with the numbers. Frame time and memory
not worse.

**Out of scope:** the renderer as modules; modules written by citizens over the network (the sandbox makes it possible;
the trust and sharing are their own intent); theDB's docs in SQLite (0053).

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Intent 0050 finished first
- [x] Samuel approves the definition (2026-11-20)
- [ ] Research written
- [ ] 1–5

## Changelog

### 2026-11-20

- **Asked:** whether terrain, plants, Earth and the interface should be dynamic blobs in theDB and theOS only the
  kernel and theDB; define now, build after 0050.
- **Delivered:** this definition.

## Trail

| When | Commit | What |
| --- | --- | --- |
