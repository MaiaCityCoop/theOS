# 0049 · Docs and blobs: the research

What the definition of [0049](../Intents/0049-docs-and-blobs.md) rests on. Read on 2026-11-20 from the libraries' docs
and sources; versions to pin are checked again when the first crate is added.

## Blobs: iroh-blobs

- Every blob is named by its BLAKE3 hash; importing a file hashes it and records an outboard (the hash tree that lets
  any range be verified). A local store on disk is `FsStore::load(path)`; bytes go in with `add_bytes` / `add_slice`
  and come back by hash. The same store later serves the blobs to other peers with `BlobsProtocol`, so sync is added on
  top without changing what is stored.
- Two API lines exist: 0.35 (the one its repository called production-ready) and 0.9x–0.10x (the new store and API,
  marked not yet production quality at the time). One device and no sync need only the store: we pin the newer line
  for its API and keep the store behind our own small `Blobs` trait, so a change of line touches one file.
- Sources: [iroh blobs protocol](https://docs.iroh.computer/protocols/blobs/),
  [n0-computer/iroh-blobs](https://github.com/n0-computer/iroh-blobs),
  [iroh-blobs 0.94 fs store](https://docs.rs/iroh-blobs/0.94.0/src/iroh_blobs/store/fs.rs.html),
  [iroh-blobs api/blobs.rs](https://docs.rs/iroh-blobs/latest/src/iroh_blobs/api/blobs.rs.html),
  [iroh-blobs DESIGN.md](https://docs.rs/crate/iroh-blobs/0.99.0/source/DESIGN.md).

## Docs: Loro

- A `LoroDoc` carries its whole history. `export(ExportMode::Snapshot)` gives the full state with compressed history,
  `ExportMode::updates(&vv)` what a peer at version `vv` lacks, `ExportMode::shallow_snapshot(&frontiers)` the state
  with history trimmed before a version. `LoroDoc::from_snapshot` / `import` load them.
- Versions are `Frontiers` (and version vectors): `state_frontiers()` names the current one; `checkout(&frontiers)`
  shows a past version read-only, `fork_at(&frontiers)` makes a new doc from it (a branch), `revert_to` goes back.
- So a doc is stored as blobs too: its snapshot (and later its update chunks) are blobs, and a small table maps the
  doc's id to its latest snapshot's hash: the IPNS of the analogy, but the doc itself keeps every version.
- Pin one release of `loro` (not `loro-internal`, which is unstable; `loro-ffi` uses other names).
- Sources: [docs.rs/loro](https://docs.rs/loro), [LoroDoc](https://docs.rs/loro/latest/loro/struct.LoroDoc.html),
  [loro README](https://docs.rs/crate/loro/1.13.9/source/README.md).

## Bevy: an asset source over docs and blobs

- An asset source bundles an `AssetReader`, optionally an `AssetWriter`, and an `AssetWatcher` (hot reload). It is
  registered by name with `register_asset_source` before `AssetPlugin` is added; paths then read `name://…`. The
  builder closure must be repeatable. Watching lives on the builder, and `watch_for_changes` turns it on.
- So two sources: `blob://<hash>` (immutable, never watched) and `doc://<id>/<path>` (watched: a doc's change sends
  the changed path to Bevy, which reloads the shader, recipe or image).
- Sources: [custom asset reader example](https://bevyengine.org/examples/assets/custom-asset-reader/),
  [extra source example (0.18)](https://docs.rs/bevy/0.18.1/src/extra_asset_source/extra_source.rs.html),
  [asset sources PR](https://github.com/bevyengine/bevy/commit/35073cf7aa9eaf748e167c103921a6764fcedfb1),
  [AssetSourceBuilder](https://dev-docs.bevyengine.org/bevy/asset/io/struct.AssetSourceBuilder.html).

## Options weighed

| Question | Options | Chosen, and why |
| --- | --- | --- |
| Where the truth lives | git; a database; Loro docs + iroh blobs | Docs and blobs: every version kept and addressable, forks are cheap, blobs are verified by hash, and the same store syncs later. Git keeps snapshots for review. |
| How a doc is stored | iroh-docs (its own document sync); Loro snapshots as blobs + an id table | Loro as blobs: one store for everything, Loro's own history and merging, no second CRDT. |
| How the engine is started | hot-load Rust libraries; WASM modules; a loader that starts a build blob as its own process | A process: Rust has no stable binary interface between builds; a separate process is robust. WASM stays an option for small logic later. |
| How the engine reads content | files written out to disk; a Bevy asset source over the store | An asset source: no files, hot reload through the watcher. |
| Baked results (impostor atlases, the lawn) | rebake every start; cache by inputs' hash | Cache: the key is the hash of the master's recipe, the bake's settings and the engine build; a hit skips the bake. |
