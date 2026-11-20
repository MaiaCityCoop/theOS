---
id: "0058"
title: Proposals a person accepts, schemas, the world as a module, two worlds in one timeline
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0058-slug/, set at propose
---

# 0058 · Proposals a person accepts, schemas, the world as a module, two worlds in one timeline

## Idea

Samuel, 2026-11-20, after the access-control MVP (intent 0054):

> A proposal lives on the agent's own line, and theOS lists every line's open proposals. Make the OS have a host key
> of its own for routine writes, incl. accepting proposals (and our Claude agents shouldn't be able to accept
> proposals in our theOS UIs, right?). Do this the iroh-native way: schemas as objects, with validation on every
> write. And regarding modules, ensure the current in-theOS hard-coded world data is properly extracted to the new
> module logic, and then make us the timeline example of bringing the green and the blue game world into the same
> timeline. Please execute everything now!

> Bring in the same "home + proposal/intent" nav pill we had, when we press the centre button it shows the proposals
> and HITL gates, in a popup modal like view. Also the logo. The nav pill should be way smaller and compact, and all
> other home buttons in all other views can be removed.

## Define

Samuel asked for the work outright; it went straight to Build.

## Build

- **Proposals on lines.** `propose` keeps the proposal doc on the agent's own line, so an agent proposes without
  writing main; `proposals()` lists every line's. `merge` and `refuse` need the master or the host: an agent, with only
  its line's key, cannot accept. `theDB merge` is gone from the command line: a proposal is accepted in theOS.
- **The host key.** theOS on this Mac has its own key (theID's `Who::Host`), granted `Cap::Main` by the master for a
  year, made the first time theOS starts with the master's key in the Keychain. It signs routine writes to main and
  the merges a person accepts. The master's key only grants.
- **The nav pill and the proposals modal** (`App/src/pill.rs`): Home, the star (Brand/star.svg) and the MC badge, at
  the bottom of every view on a window-wide camera of its own; the star opens a modal of proposal cards with Accept
  and Refuse. The views' own Home buttons are removed by a proposal (layout docs) and in theDB's view (code).
- **Schemas as objects** (`App/theDB/src/schema.rs`): a JSON Schema kept as a blob by its BLAKE3 hash, checked
  against the meta-schema; a doc names its schema in `meta.schema`, and every commit of it is checked, as merged, on
  every branch. A schema for worlds requires the three colours and the module.
- **The world as a module** (`App/src/module.rs`, `theDB module build`): a module doc's text is one Rust file, the
  source of truth in theDB; built into WebAssembly as its part `wasm`, run by theOS in wasmi, importing nothing. The
  world module exports `eye_height`, `near`, `far` and `ground_half`, the numbers `world.rs` hard-set before; theOS
  sets none of them now. theOS loads it when main's world first names a built module, without a restart.
- **Two worlds in one timeline.** A shot names its world; "This is day 1" films the green world in its first shot and
  "day 1, blue" in its second, and the Studio switches the sky and ground as the shot changes.

- **Vibes** (`App/theDB/src/vibe.rs`): a doc of kind `vibe`, checked by the one vibe schema (a blob): its `entry`,
  its `needs` by role (a doc, a doc's exact version `<id>@<hash>`, or `blob:<hash>`) and the `vibes` it is made of.
  `theDB vibe <id>` walks the tree and fails on anything missing or a vibe made of itself. Day 1 as vibes, proposed by
  agent claude: `theOS` (the dashboard, engine, kernel, fonts, layers) made of `This is day 1` (the timeline), made of
  `the green world` and `the blue world` (each its world, module, shader and schema); the root names `theOS`.

- **Locks: the system by one hash** (`App/theDB/src/lock.rs`). `theDB lock` pins everything the root reaches (the
  top vibe whole, every doc at its version, every blob), signed by the master or the host, kept as a blob: its hash
  is the system's. `THEDB_LOCK=<hash>` opens any process there, read only; `theKERNEL --at <hash>` starts the engine
  build the lock pins, at the lock.
- **The audit: host or dynamic.** Host (git): theKERNEL, theDB, the doc renderer (`views.rs`), the world renderer
  and the wasm host, the shot player and its maths, input, the core chrome (pill, setup, theDB view). Moved out this
  round: the palette (a theme doc, with a schema; the host keeps the brand palette only for a store with none) and how
  one walks (pace, run, limits, wheel, lens, start: the world module). Still host, to move next: the look speed, the
  pill's and setup's own sizes, the "five new shots" ease kit.

**Checks, as they ran** (on a copy of the live store): an agent's write to main refused; an agent's proposal accepted
through the pill by `--navtest` (all steps passed); `theDB verify` clean (45 heads); a world with `"ground": "blue"`
refused by its schema; the gate's pictures of the two shots, green and blue; `cargo test --workspace` passed.

**Known gaps:** any process of this user can read the host key through `security`, so the human step is enforced by
theOS, not by the OS; a code-signed theOS with a Keychain rule for it would close that. The `--still` mode renders a
black picture since the world switch (the gate mode is right); not yet looked into. Agent keys are still in the
Keychain, not made and held by the agent's session alone.

## Propose

## Story

## Archived

---

## Todo

- [x] Proposals on lines; the host key; merging only in theOS
- [x] The nav pill and the proposals modal
- [x] Schemas as objects, checked on every write
- [x] The world's numbers as a module in theDB
- [x] Green and blue in one timeline
- [ ] Samuel accepts the live proposal in theOS
- [x] Vibes: one manifest kind for every world, asset and UI (Samuel's next idea)
- [ ] The `--still` black picture

## Changelog

### 2026-11-20

- **Asked:** the items above.
- **Delivered:** all five, checked on a copy of the store; Samuel accepted the live proposal.
- **Asked:** start the system from a vibe version; audit host against dynamic. **Delivered:** locks and
  `theKERNEL --at`, checked by a navtest at a lock; the palette and the walking moved out; proposed for Samuel.
- **Asked:** vibes. **Delivered:** the vibe kind and schema, `theDB vibe`, day 1 as four vibes, proposed for Samuel.

## Trail

| When | Commit | What |
| --- | --- | --- |
