---
id: "0053"
title: theDB's docs in SQLite, blobs on disk, synced over iroh later
state: define          # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0053-slug/, set at propose
---

# 0053 · theDB's docs in SQLite, blobs on disk, synced over iroh later

## Idea

Samuel, 2026-11-20:

> Does it make sense to use Rust-based SQLite to store our Loro docs for better, more efficient query, retrieval and
> storage? Blobs stay on the file system as is, right? And every node in the system would just sync their SQLite DBs
> via the iroh protocol later, once we introduce them?

## Define

_Waiting for Samuel's approval._

**What is there (theDB, 2026-11-20).** A doc is a Loro document; every commit exports the **whole snapshot** as a blob
and moves a tag (`doc/<id>`, `branch/<b>/<id>`) to it. 126 docs; `DATA/data` is 1.8 GB, most of it engine builds
(about 224 MB each) and full snapshots of docs that changed by a line. Finding docs by kind or name means opening
every doc's latest snapshot (`theDB ls` does exactly that). Only one process can open the store's files; every other
process goes through it over a local connection (the kernel owns it, theOS and the `theDB` command are clients).

**The answer, short:** yes for the docs, and the blobs stay as they are.

- **Blobs** (pictures, binaries, open-data tiles, build manifests) stay in iroh-blobs on disk, named by BLAKE3. They
  are what iroh's protocol already moves between nodes, verified while it streams.
- **Docs** move into one SQLite file: what a doc is (id, kind, name, its head on main and on each branch) as rows, its
  history as Loro's own incremental **updates** (small, append only) with a snapshot now and then, and the fields
  people search by (kind, name, the recipe's numbers, the text) indexed, with full-text search (FTS5).
- **Names stay content addressed.** A doc version is still named by the BLAKE3 hash of its snapshot, computed when it
  is committed and kept in its row, so everything that pins a version by hash (worlds, builds) reads exactly that
  version back.
- **Ids derived, not random** (Samuel: "shouldn't even those be proper content hashes?"). A doc's id stays the
  same while its content changes, so it cannot be the hash of its content now; it becomes the BLAKE3 hash of its
  first version (and, once nodes sync, of the key of the node that made it), so anyone can check where a doc began and
  two nodes never make the same id. Today's ids (a hash of the time, the process and a counter) stay valid.
- **Several processes at once.** SQLite in WAL mode lets every process on the machine read, and one write at a time,
  without going through an owner; only blobs keep the owner's connection.
- **Sync later:** a node's doc history is a set of Loro updates; two nodes exchange what the other lacks (by version
  vector) over an iroh connection of our own protocol, and blobs over iroh-blobs. SQLite files are not copied whole:
  the updates are, so concurrent edits on two nodes merge as Loro merges them. Not in this intent.

**Options weighed** (research to be written in `Research/0053-docs-in-sqlite.md` before building):

| Option | For | Against |
| --- | --- | --- |
| Keep snapshots as blobs (today) | nothing to build | a full snapshot per commit; no query; one owner for everything |
| redb (already linked by iroh-blobs) | pure Rust, no new crate | a key-value store: indexes and search written by hand; one process |
| **SQLite** (rusqlite, bundled) | queries, indexes, full text, many readers, one well known file | a C library in the build |
| Loro's own `loro-kv-store` | inside Loro already | it is the sorted-table layer *within one doc's* snapshot (fast load of a large doc), marked not for direct use; no notion of many docs, queries or processes ([docs](https://docs.rs/loro-kv-store), [loro_internal](https://docs.rs/crate/loro-internal/1.13.1/source/src/kv_store.rs)) |
| An Automerge-style repo | made for CRDT history | another CRDT's ecosystem; no query layer |

Loro stays the CRDT inside each doc either way; SQLite is where many docs are kept, found and read at once, the
pattern others use with Loro too (e.g. [pylon-runtime's Loro store](https://docs.rs/pylon-runtime/0.3.23/pylon_runtime/loro_store/):
a doc per row in SQLite, hydrated on demand).

**Deliverables**

1. `DATA/theDB.sqlite`: docs, versions (hash, Loro updates, snapshots now and then), branches, proposals; WAL mode.
2. theDB's API unchanged for its callers (`doc`, `commit`, `head`, `text`, `file`, branches, trees, merges); the
   `theDB` command gains `find` (by kind, name, field, words).
3. A one-time move of every doc and its whole history from the tags and snapshots into SQLite; the old snapshot
   blobs stay readable by hash.
4. Readers without the owner: theOS and `theDB` read docs straight from SQLite; blobs still through the owner.
5. New docs get derived ids (BLAKE3 of the first version); `theDB` finds the engine's tree from the engine doc, so no
   command takes a typed id for it.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Every doc and version moved | every doc's every version reads back the same, by id and by hash, before and after (a test over a copy of the store) |
| 2 | Pins still hold | a build's source manifest and a world's pinned versions check out byte for byte |
| 3 | Query | `theDB find kind=asset`, `theDB find words "wind"`: answers without opening a snapshot |
| 4 | Two processes | theOS and `theDB` write docs at the same time; both edits kept |
| 5 | Smaller | a one-line edit of a large doc stores bytes, not a snapshot (measured) |

**The 10 % gate:** `theDB ls` and theOS's start (the docs it reads) at least 10 % faster; the store's size for the
same history at least 10 % smaller; nothing slower.

**Out of scope:** syncing between nodes (its own intent, once there is a second node); deleting old snapshot blobs.

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel approves the definition
- [ ] Research written (`Research/0053-docs-in-sqlite.md`)
- [ ] 1–4

## Changelog

### 2026-11-20

- **Asked:** SQLite for theDB's docs, blobs on disk, sync over iroh later.
- **Delivered:** this definition.

## Trail

| When | Commit | What |
| --- | --- | --- |
