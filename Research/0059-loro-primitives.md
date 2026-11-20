# 0059 · Loro's primitives: what Loro already does for theDB, and what it leaves to us

Samuel's question, 2026-11-20:

> Isn't Loro's native doc history and version maintenance internally doing the heavy lifting for us? Please read the
> Rust crate docs and Loro's documentation on the website extensively again, to properly know our primitives.

**Short answer: yes, for one doc.** A Loro doc already is a version-controlled object: it keeps every change with its
author peer, Lamport time, parents and message; it names any version exactly (frontiers, version vectors); it gives the
state at any version (`checkout`, `fork_at`, `SnapshotAt`), the difference between two (`diff`), the changes between
two (`try_find_id_spans_between`), the containers they touched (`get_changed_containers_in`), forks and merges
(`fork_at` + `import`), reverts (`revert_to`), deltas for storage and sync (`ExportMode::Updates`), and history trimming
(shallow snapshots). theDB re-implements much of this today: a snapshot per commit, a hash per snapshot as the version
name, branches as copies. **What Loro does not do**, by its own design, is everything between docs and everything about
trust: names for versions (tags, branches, main), many docs, a store, deterministic bytes, signatures, identities,
permissions, and compare-and-swap of pointers. Loro's v1.0 announcement says so in as many words: storing and syncing
version tags and branches, diff views and merge interactions are "not suitable to be solved in the current Loro CRDTs
Lib" [L-blog-v1, lines 278-295].

How this note was made. The crate theDB builds against, Loro 1.18.0 (also the newest on crates.io, published
2026-11-16 [crates.io]), was read in `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/` (`loro-1.18.0`,
`loro-internal-1.18.0`, `loro-kv-store-1.18.0`). loro.dev refused automated fetches again (HTTP 403), so the website was
read from its source, the `loro-dev/loro-docs` repository at commit `fed85892` (`pages/docs/**`), whose pages map one to
one to `https://loro.dev/docs/...`. The Loro Protocol (`loro-dev/protocol`), `loro-dev/iroh-loro`, and GitHub issues and
discussions on signing, permissions and validation were read too. Where the documentation was silent or ambiguous
(change merging, byte determinism, branch heads), the behaviour was **measured** with small programs against
loro 1.18.0 (section 6); those results are marked *[measured]*.

File references: `lib.rs:N` is `loro-1.18.0/src/lib.rs`; `internal/…` is `loro-internal-1.18.0/src/…`; `docs/…` is
`loro-docs/pages/docs/…` (the page at `https://loro.dev/docs/…`). Sources are listed in full at the end.

---

## 1. What Loro gives, by topic

### 1.1 The model: OpLog and DocState, ops and changes

- A doc is two parts: the **OpLog**, the append-only history of operations with their causal links, and the
  **DocState**, the materialized current value [docs/concepts/oplog_docstate.mdx:8-24]. The state can be at an older
  version than the log (detached), which is how time travel works.
- An **op** has a unique id `(peer, counter)`; the counter starts at 0 and is continuous per peer
  [docs/concepts/peerid_management.mdx:9-11, 46-62]. Two docs are consistent if they hold the same set of ops
  [docs/advanced/version_deep_dive.mdx:36-38].
- A **change** is a run of consecutive ops from one peer sharing one metadata record: id of its first op, Lamport of its
  first op, the deps of its first op, a timestamp and a commit message [lib.rs:214-230; internal/change.rs:28-39].
  `ChangeMeta` exposes exactly `lamport`, `id`, `timestamp`, `message`, `deps`, `len`
  [internal/change_meta.rs:24-38]. There is no other author field: the peer id inside `id` is the only "who".
- A **transaction** is not an ACID transaction: no rollback, no isolation; it groups ops for events and history
  [docs/concepts/transaction_model.mdx:5-12; lib.rs:785-801]. `commit()` is called implicitly by `import`, `export`
  and `checkout` [lib.rs:788-794].

### 1.2 History: what every change records, and how to read it

| What | API | Behaviour |
| --- | --- | --- |
| One change's metadata | `get_change(id) -> Option<ChangeMeta>`, `try_get_change` | the change containing `id` [lib.rs:227-235] |
| Walk history | `travel_change_ancestors(&[ID], FnMut(ChangeMeta) -> ControlFlow)` | all ancestors, latest to oldest by Lamport, stoppable [lib.rs:1830-1846] |
| Counts | `len_changes()`, `len_ops()` | [lib.rs:1239-1247] |
| Head of the log | `oplog_frontiers()`, `oplog_vv()` | the latest known version [lib.rs:1190, 1268] |
| Head of the state | `state_frontiers()`, `state_vv()` / `try_state_vv()` | differ from the oplog's while detached [lib.rs:1205-1215, 1287] |
| What a range touched | `get_changed_containers_in(id, len)` / `try_…` | container ids changed by ops in a span; commits the pending txn first [lib.rs:1852-1867, 1912-1918] |
| Changes between versions | `try_find_id_spans_between(from, to) -> VersionVectorDiff` | per peer, the counter spans to go forward/back (`find_id_spans_between` is deprecated, it panics) [lib.rs:1869-1910] |
| A change as JSON | `export_json_in_id_span(IdSpan)`, `export_json_updates(from, to)` | human-readable ops for a viewer [lib.rs:1032, 1107] |
| Who last wrote | `LoroMap::get_last_editor(key)`, `LoroText::get_editor_at_unicode_pos`, `LoroMovableList::get_last_editor_at` and `get_last_mover_at`, `LoroTree::get_last_move_id` | a peer id per key, character, element, node [lib.rs:2808, 3339, 4041-4047, 3741] |
| Metadata of bytes before importing | `LoroDoc::decode_import_blob_meta(bytes, check_checksum)` | start/end version vectors, start frontiers, timestamps, change count, mode [lib.rs:236-256; internal/encoding.rs:613-631] |

**Setting a commit's metadata** [lib.rs:803-866; internal/loro.rs:4645-4660]:

- `commit()`; `commit_with(CommitOptions { origin, immediate_renew, timestamp, commit_msg })`;
  `set_next_commit_message`, `set_next_commit_origin`, `set_next_commit_timestamp`, `set_next_commit_options`,
  `clear_next_commit_options`.
- The **message is persisted** and replicates; the **origin is not** (it only labels the local event); the
  **timestamp is persisted** [lib.rs:815-816, 826-847].
- An explicit commit of an empty transaction swallows the options; an implicit commit (export, checkout) keeps them for
  the next one [lib.rs:796-801, 817-820].

**Timestamps.** `set_record_timestamp(bool)`, default **off**; when off, a change's timestamp is the largest known one,
in practice **0** for a fresh history [lib.rs:259-279; internal/oplog.rs:1544-1550; docs/advanced/timestamp.mdx:9]
*[measured: `ts=0` with recording off, Unix seconds with it on]*. Timestamps are seconds, forced ascending: a commit
earlier than the latest gets the latest [lib.rs:266-268]. The setting is **not serialized**; it must be set on every
`LoroDoc` made or loaded [lib.rs:265-266].

**Change merging, and what it means for history.** `set_change_merge_interval(seconds)`, default 1000 s
[lib.rs:339-347]. A new local commit is **appended to the previous change** when it is by the same peer, continues its
counter, depends only on that peer's last op, falls within the interval, **and has the same commit message**
[internal/change.rs:268-282; internal/oplog/change_store.rs:1500-1520]. The docs: "Consecutive operations from same
peer merge into one Change" [docs/concepts/operations_changes.mdx:30-45]; a new change starts after importing remote
ops, after the interval, or on a different message [same, 47-51]. Consequences, all *[measured]*:

- Three plain `commit()` calls on one peer make **one** change of length 3, not three.
- Two commits with message "msg-A" merge into one change; a third with "msg-B" is its own.
- A merged change keeps **one** timestamp, the first: five commits stamped t, t+10 … t+40 became one change stamped t;
  the later timestamps are gone.
- `set_change_merge_interval(-1)` keeps every commit its own change; so does a distinct message per commit.
- Merging also happens on the receiving side for imported changes of one peer with equal timestamps
  (`merge_interval` 0 for remote changes) [internal/oplog/change_store.rs:1509-1518]; the receiver ended with the same
  change boundaries as the origin in every case measured.

So **a Loro change is not a theDB commit** unless theDB makes it one (a distinct message per commit, or interval -1).

### 1.3 Versions: frontiers and version vectors

- A **version vector** maps each peer to how many of its ops are included; it needs no history to interpret and is the
  right thing for sync; it grows with the number of peers [docs/concepts/version_vector.mdx:8-21, 46-53].
- **Frontiers** are the ops at the tips of the DAG: usually 1 or 2 ids; `Frontiers = [A]` is the version right after
  op A [docs/concepts/frontiers.mdx:8-12, 45-52; docs/advanced/version_deep_dive.mdx:162-207]. Their limit: a peer that
  lacks the ops a frontier names cannot tell which ops it includes [docs/concepts/frontiers.mdx:77-97].
- Conversions: `frontiers_to_vv` (None if the frontiers are not in this doc), `vv_to_frontiers`, `minimize_frontiers`,
  and `try_` forms [lib.rs:1114-1167].
- Comparisons: `cmp_frontiers(a, b) -> Result<Option<Ordering>>` (None means concurrent), `cmp_with_frontiers(other)`
  (Less if `other` holds ops this doc lacks) [lib.rs:472-492]; `VersionVector` is `PartialOrd`, with `includes_vv`,
  `includes_id`, `diff`, `sub_iter`, `merge` [internal/version.rs:405, 500-570, 796-830].
- **Encodings.** `Frontiers::encode()` **sorts the ids before encoding**, so the same frontiers give the same bytes on
  every device [internal/version/frontiers.rs:222-236] *[measured: equal on two devices that merged in opposite
  orders]*. `VersionVector::encode()` serializes an `FxHashMap` as it iterates [internal/version.rs:29, 980-984], so its
  bytes are not promised canonical; compare version vectors by value, not by bytes.

**Is a version id stable and comparable across devices?** A version is a set of op ids, and frontiers name that set
compactly; any device that holds those ops resolves them to the same state (CRDT convergence)
[docs/tutorial/persistence.mdx:127-129]. So frontiers are stable, comparable names, under two conditions Loro states
itself: peer ids are never reused by two writers (else one id can name two different ops) [docs/concepts/peerid_management.mdx:42-70;
lib.rs:1296-1306], and the device holds the history down to them (not cut off by a shallow snapshot). Frontiers are
**not tamper-evident**: they are ids, not hashes of content. Loro does refuse an import that brings different ops under
ids it already has (`LoroError::UsedOpID`) [lib.rs:955-958], which protects a device that already holds the honest
ops, not one that sees the forged ones first.

### 1.4 The state at a version, and comparing versions

| API | What it does |
| --- | --- |
| `checkout(&Frontiers)` | moves the DocState to that version; the doc becomes **detached**: not editable by default, imports go to the OpLog only [lib.rs:419-434; docs/concepts/attached_detached.mdx:31-48] |
| `try_checkout_to_latest()`, `try_attach()` | back to the latest (`checkout_to_latest` and `attach` are deprecated in 1.18, they panic) [lib.rs:400-470] |
| `detach()`, `is_detached()` | force/see detached mode; a relay can keep only the OpLog [lib.rs:494-499; docs/concepts/oplog_docstate.mdx:85-101] |
| `set_detached_editing(true)` | edit an old version in place; uses a **new peer id per checkout** [lib.rs:281-315] |
| `fork()` | a full copy with a new peer id, O(n) [lib.rs:164-174]; it keeps the config [internal/loro.rs:205-225] |
| `fork_at(&Frontiers)` | a new doc holding only the history up to that version [lib.rs:176-184] |
| `ExportMode::SnapshotAt { version }` | the same as bytes: full history to the version plus its state [internal/encoding.rs:73-75] *[measured: byte-identical to `fork_at(v).export(Snapshot)`]* |
| `revert_to(&Frontiers)` | writes **new local ops** that bring the state back to that version (history is kept) [lib.rs:1920-1945] |
| `diff(a, b) -> DiffBatch` | per container, what changed from `a` to `b`: map keys set/deleted with their values, text deltas, list deltas, tree moves [lib.rs:1960-1978; loro/src/event.rs:56-66, 254-277] |
| `apply_diff(DiffBatch)` | applies a diff as new local ops; Loro's own tip: `diff` + `apply_diff` for PR-style **squash** change sets [lib.rs:1947-1959; docs/tutorial/tips.mdx:100-126] |
| `free_history_cache()`, `has_history_cache()`, `free_diff_calculator()` | memory used by checkouts [lib.rs:1577-1595] |

The time-travel guide builds a timeline slider from change timestamps (it requires `set_record_timestamp(true)`) and
says detached-mode editing "is temporary and will be phased out once we have a more refined version control API"
[docs/tutorial/time_travel.mdx:12-36].

### 1.5 Export and import

`export(ExportMode)` commits the pending transaction first and excludes remote changes still waiting for dependencies
[lib.rs:1605-1640]. The modes [internal/encoding.rs:25-76; docs/tutorial/encoding.mdx]:

| Mode | Holds | Use | Size in the test of section 6 (200 one-line commits) |
| --- | --- | --- | --- |
| `Snapshot` | full history + current state | load fast, persist | 2,767 B |
| `Updates { from: vv }` (`updates`, `all_updates`) | ops from `from` to the latest | sync, deltas to store | one commit: 101 B; all: 3,744 B |
| `UpdatesInRange { spans }` | ops in given id spans | cut out exactly some changes (one author's) | — |
| `ShallowSnapshot(frontiers)` | state at the frontiers + history after it + latest state | trim history | 1,111 B at the latest version |
| `StateOnly(Option<frontiers>)` | a shallow snapshot of depth 1 at the version | ship a state with almost no history | 1,110 B |
| `SnapshotAt { version }` | history up to the version + its state | a past version as a whole | at commit 50: 924 B |

- Every blob starts with the magic `loro`, a 16-byte checksum field and a 2-byte mode; import checks the checksum
  (xxHash32 for the fast formats) and rejects corrupt bytes [internal/encoding.rs:160, 343-365, 520-540;
  docs/tutorial/persistence.mdx:29]. A snapshot is oplog bytes, state bytes and shallow-root bytes, each an SSTable of
  LZ4-compressed blocks [internal/encoding/fast_snapshot.rs:1-14; loro-kv-store/src/lib.rs:1-70;
  docs/tutorial/encoding.mdx:131-167]. The format is stable since 1.0 [docs/tutorial/encoding.mdx:8-9].
- History is stored as **change blocks** (about 4 KB each) keyed by their first change id [internal/oplog/change_store.rs:42;
  docs/tutorial/encoding.mdx:138-150].
- `LoroDoc::from_snapshot(&[u8])`, `from_snapshot_bytes(Bytes)` (zero-copy, lazily decoded; do not rewrite a mapped
  file in place) [lib.rs:875-932].
- `import(bytes) -> ImportStatus { success, pending }`; `import_with(bytes, origin)` (the origin labels the event);
  `import_with_history_mode` (`Exact` or `JsonLossy`) [lib.rs:934-1000; internal/encoding.rs:233-236].
- `import_batch(&[Vec<u8>])`: any order, one diff and one event, faster; **not all-or-nothing**: a failing blob does not
  stop the others; `import_batch_detailed` reports each blob [lib.rs:503-640; docs/advanced/import_batch.mdx].
- **Pending.** Changes whose deps are missing wait in the OpLog; `ImportStatus.pending` lists them; a snapshot does not
  contain them; `export_pending_updates()` (new in 1.17) exports them so they survive a restart; it is read-only and
  "does not ... establish that a document is synced" [lib.rs:1642-1726; docs/concepts/import_status.mdx;
  docs/tutorial/persistence.mdx:40-122].
- JSON: `export_json_updates`, `export_json_updates_without_peer_compression`, `import_json_updates`; the JS side has
  `redactJsonUpdates` to blank chosen ops while keeping ids and deps [lib.rs:1001-1107; docs/tutorial/tips.mdx:130-207].

### 1.6 Branching and merging

Loro's README lists "Fork documents: `fork` or `fork_at` - Create branches" and "Merge branches: `import`"
[loro-1.18.0/README.md:44-56]; the v1.0 post: primitives "to switch between different versions, fork new branches,
edit on new branches, and merge branches", on which applications "can build rebase and squash workflows"
[L-blog-v1:217-226].

- **Fork, work, merge back.** `let b = doc.fork_at(&base)` → edit `b` → `doc.import(&b.export(updates(&doc.oplog_vv())))`.
- **What Loro guarantees:** the merge always succeeds and is the same on every device whatever the order
  [docs/tutorial/sync.mdx:43-45]; history keeps both sides; nothing is overwritten in the log.
- **What it does not guarantee:** that the merged state means anything. Map keys are last-writer-wins by Lamport time
  [docs/tutorial/map.mdx:8]; two edits to one key are decided silently. "CRDTs merge; they do not reject"
  [docs/concepts/when_not_crdt.mdx:14-22]. A regular child container created concurrently under the same map key by
  two branches **hides one side's whole subtree** [docs/concepts/container.mdx:113-150; docs/tutorial/tips.mdx:53-97];
  `LoroMap::ensure_mergeable_map/list/text/…` makes both sides address one child [lib.rs:2716-2790;
  docs/concepts/choose_crdt_type.mdx:14-28].
- **Seeing what a branch changed relative to its base:** `diff(base, head)` lists, per container, the keys and values
  it set; doing the same for main (`diff(base, main_head)`) and intersecting the two key sets gives exactly the keys
  both changed. `get_changed_containers_in` over the spans from `try_find_id_spans_between(base, head)` gives the
  containers per peer. *[measured: two branches setting `sun.elevation` both show it in their diffs; one also shows
  `wind.speed`; the merge picks 60 over 45 silently]*.
- **A branch head does not need its own copy.** One OpLog can hold the changes of every branch; a branch's head is
  just its frontiers; reading it is `checkout(head)` or `fork_at(head)`; a merge is the frontiers of the union of both
  version vectors, `vv_to_frontiers(vv_main ∪ vv_branch)`, and **writes no new change at all** *[measured: one doc held
  main and a branch; checkout at each head gave each side; the union frontiers `[0@3, 0@2]` gave the merged state with
  `len_changes` unchanged]*. Only the latest attached state mixes all branches, so a reader must always go through a
  head.

### 1.7 Events and hooks

- `subscribe(container_id, cb)`, `subscribe_root(cb)`: diff events after each commit, import and checkout; events tell
  whether they came from a local commit, an import or a checkout [lib.rs:1310-1381; docs/tutorial/event.mdx:6-66].
- `subscribe_local_update(cb(&Vec<u8>) -> bool)`: the encoded **update bytes of every local commit**, for persistence
  or sync [lib.rs:1383-1421].
- `subscribe_pre_commit(cb(&PreCommitCallbackPayload) -> bool)`: runs before a local change enters the OpLog, also for
  implicit commits; the payload has `change_meta`, `origin` and a `ChangeModifier` that can `set_message`,
  `set_timestamp`, `set_timestamp_now` — **nothing else** [lib.rs:2085-2133; internal/pre_commit.rs:17-70]. It cannot
  cancel a commit or add other fields *[measured: a hook stamped each change's message; each commit then became its own
  change because the messages differed]*.
- `subscribe_first_commit_from_peer(cb)`: once per peer on its first local commit; edits made inside are merged into
  that commit; Loro's suggested use is a peer-to-user map stored in the doc [lib.rs:2022-2075;
  docs/tutorial/tips.mdx:280-317].
- `subscribe_peer_id_change(cb)` [lib.rs:1423-1456]; `subscribe_jsonpath` (feature `jsonpath`) [lib.rs:1815].

### 1.8 Peer ids

- A new `LoroDoc` gets a **random u64** from the OS (`getrandom`), "even when loading same document"
  [internal/configure.rs:139-143; docs/concepts/peerid_management.mdx:20-31].
- `set_peer_id(u64)` is allowed, with the warnings: never two concurrent writers on one id, not a fixed id per user
  or device, and persist and load the doc's own data before reusing an id [lib.rs:1296-1306;
  docs/concepts/peerid_management.mdx:42-70; docs/tutorial/tips.mdx:19-41]. Loro ships `peer-lease` (TypeScript) to
  lend ids safely [loro-dev/peer-lease].
- Peer ids are compressed inside change blocks, but each new peer still costs metadata and a version-vector entry
  (section 6: 500 commits each by a fresh peer made a snapshot **5.8 times** as large as 500 commits by one peer).

### 1.9 Size and trimming

- History is kept forever unless a **shallow snapshot** drops it: "like Git's shallow clone", typically 70-90 % smaller;
  peers can then only sync versions after the shallow start; "coordinate before trimming" and "archive before deletion"
  [docs/concepts/shallow_snapshots.mdx:5-27, 52-105]. A shallow doc reports `is_shallow()`, `shallow_since_frontiers()`,
  `shallow_since_vv()`; checking out before its start fails [lib.rs:1218-1235, 1847-1851] *[measured]*.
- `StateOnly` is the extreme (depth 1). Redaction (`redactJsonUpdates`, JS) blanks chosen ops but keeps the DAG
  [docs/tutorial/tips.mdx:130-207].
- `compact_change_store()` re-encodes parsed ops to save memory; `set_decoded_value_cache_limit` bounds lazy decoding
  [lib.rs:186-215, 1597-1602].
- Size benchmarks: on the Automerge paper trace (259,778 ops), a Loro snapshot is 273,561 B, 132,459 B compressed; a
  shallow snapshot 63,352 B [docs/performance/docsize.md:22-37].

### 1.10 Containers and their merge semantics

| Container | Merge | Source |
| --- | --- | --- |
| Map | last writer wins per key, by Lamport (then peer) | docs/tutorial/map.mdx:8-10 |
| List | concurrent inserts both kept; a "set" is delete + insert, so concurrent sets duplicate | docs/concepts/choose_crdt_type.mdx:12 |
| MovableList | list with move and set; use for reordering | lib.rs:3745-3762 |
| Text | rich text (Fugue/Peritext); concurrent inserts kept; `update` and `update_by_line` diff a new string into ops | lib.rs:3060-3085; loro-docs pages/blog/crdt-richtext.mdx |
| Tree | movable tree (Kleppmann et al.), each node with a map; fractional index ordering | docs/tutorial/tree.mdx:8-42 |
| Counter | sums concurrent increments | docs/tutorial/counter.mdx |
| Mergeable children | `ensure_mergeable_*`: a child identified by (parent map, key, type) rather than by the op that made it | lib.rs:2716-2790; docs/concepts/container.mdx:150-180 |

Root containers exist without ops [docs/tutorial/tips.mdx:45-49]. JSONPath queries (`jsonpath`, RFC 9535, functions not
evaluated yet) [lib.rs:1776-1800; docs/advanced/jsonpath.mdx:1-20]; `get_by_path`, `get_by_str_path` [lib.rs:1470-1530];
cursors that survive edits (`get_cursor`, `get_cursor_pos`) [lib.rs:1552-1568; docs/concepts/cursor_stable_positions.mdx];
`UndoManager` is **local only** (undoes this peer's ops, one peer at a time) [lib.rs:4438; docs/advanced/undo.mdx:10-54];
the **EphemeralStore** is a separate timestamped last-writer-wins key-value store for presence, never persisted in the
doc [docs/tutorial/ephemeral.mdx:8-12; internal/awareness.rs:250].

### 1.11 Sync and the Loro Protocol

- Two docs sync with two messages: each exports `updates(from: other's vv)` [docs/tutorial/sync.mdx:1-41;
  docs/advanced/version_deep_dive.mdx:108-122]; then `subscribe_local_update` streams each commit.
- **The Loro Protocol** [protocol/protocol.md]: many **rooms** over one connection, each message tagged with a CRDT
  type (`%LOR`, `%EPH`, `%EPS`, `%YJS`, …) and a room id (≤128 bytes) (lines 13-33); `JoinRequest` carries an
  application-defined auth payload and the requester's version; `JoinResponseOk` answers `"read"` or `"write"` (lines
  51-57); a write from a read-only peer gets `Ack(permission_denied)` (line 93); the server may also refuse
  `invalid_update`, `payload_too_large`, `rate_limited` (lines 146-155); messages ≤256 KB with fragments (lines 101-116).
  It "assumes that the underlying transport guarantees message integrity" (line 9) and "does not address
  collection-level synchronization" (line 11). No signatures, no authorship. An E2EE variant `%ELO` encrypts update
  payloads with an application-managed key [protocol/protocol-e2ee.md:1-20].
- **loro-websocket-server** (Rust) persists **one snapshot per room** in SQLite (`documents(workspace, crdt, room, data,
  updated_at)`, WAL), saved on an interval when dirty; auth is a hook returning read, write or deny
  [protocol/rust/loro-websocket-server/examples/simple-server.rs:145-160; src/lib.rs:200-215, 827-845;
  protocol/README.md:137-156].
- **iroh-loro** is a demo: two peers, one plain-text file, each sending `all_updates()` over an iroh connection with ALPN
  `iroh/loro/1` [iroh-loro/README.md; src/lib.rs:16, 43-50].

### 1.12 Storage guidance

Loro's own pattern [docs/tutorial/persistence.mdx:1-38]: save a snapshot now and then; save each edit's **update** in
fast storage (a key-value database); on load import the snapshot and the updates; then write a fresh snapshot and drop
the updates "only after durable storage contains everything needed to recover them"; use shallow snapshots when old
history can go, archiving it first. Save pending bytes with the snapshot as one checkpoint [same, 40-122]. "Loro is a
pure library and does not handle network protocols ... storage, loading, and synchronization" are the user's
[lib.rs:115-120].

---

## 2. What Loro does not give

1. **Names for versions.** No tags, no branches, no "main", no refs. Loro stores none and syncs none; the v1.0 post
   names this as the application's job [L-blog-v1:278-295]. Frontiers are the raw material.
2. **Many documents.** No repository, store, index or cross-doc transaction; the protocol syncs rooms, not collections
   [protocol/protocol.md:11]. No official multi-doc tooling was found in the loro-dev organization (its 30 repositories:
   bindings, editors, protocol, inspector, peer-lease, demos). A doc names another only by a value the application
   writes.
3. **Byte-deterministic exports.** Nothing in the docs or code promises that the same history gives the same bytes.
   Measured (section 6): it does when the same changes arrive in the same order, and often otherwise, but **six peers'
   updates imported in opposite orders gave different `Snapshot`, `StateOnly` and `ShallowSnapshot` bytes** (same
   state, same frontiers), and a 3,000-commit doc received live gave a different snapshot (50,383 B against 50,403 B)
   than its origin. Block boundaries and internal registration order depend on how a doc was built.
4. **Signatures, identities, authorship.** The peer id is random and bound to nothing; the pre-commit hook can only set
   a message and a timestamp; there is no hook to verify or refuse a change on import. Issue #611 (a `tryImport` with a
   validator) is **open** since 2025-01; #612 was closed by pointing to `subscribePreCommit`, with a maintainer example
   that hashes each change's JSON plus its deps' messages into the commit message, a Merkle DAG in messages
   [GH-612]; discussion #1035 (2026-06) asks for sign/verify hooks and has no answer [GH-D1035]. On permissions the
   maintainer's position: combine signatures to verify editors, keep consistency first, undo bad edits from the
   traceable history, filter imports on a server, and an API listing the paths an import touches "is not hard to add"
   but does not exist [GH-D314].
5. **Permissions inside a doc.** None; the protocol's read/write is per room. "Authorization decisions that must be
   enforced at write time" are listed among the cases where a CRDT is the wrong tool [docs/concepts/when_not_crdt.mdx:59-63].
6. **Compare-and-swap, uniqueness, invariants.** A CRDT cannot say "only one winner": exclusive ownership and
   check-then-set "need coordination, not just convergence" [docs/concepts/when_not_crdt.mdx:14-41]. A pointer such as
   main, kept in a Loro map written by two writers, would be decided by last-writer-wins.
7. **Schema and validation.** "Schema validation may be best completed at the application layer, rather than ignoring
   the update" [GH-D314].
8. **A trustworthy "when".** Timestamps are off by default, claimed by the writer, forced ascending, and merged changes
   keep only the first.

---

## 3. theDB today, mapped onto Loro

theDB as read here: `App/theDB/src/lib.rs`, `source.rs`, `json.rs` at the 0057 branch (tags in iroh-blobs: a full
snapshot blob per commit, heads as tags), and the SQLite store that replaced it on `aven/0053-sqlite-store` (commit
`9749d842`, `sql.rs`): versions as a chain of Loro updates with a snapshot every 16, each named by the BLAKE3 hash of the
snapshot exported at commit time, its version vector stored beside it, heads in a table moved by compare-and-swap.

| theDB does or plans | Loro natively | Keep, drop or change |
| --- | --- | --- |
| A snapshot blob per commit (lib.rs:268-282, 0057 branch; the design of 0049, "stored as snapshot blobs") | **Fully**: one doc's history holds every version; any is `fork_at`/`SnapshotAt` away | **Drop** (0053 already did): measured 500 one-line commits stored 1.16 MB as snapshots against a 4.4 KB final snapshot |
| A version named by BLAKE3 of the snapshot exported at commit (`sql::keep`, sql.rs:244-284) | **Partly**: frontiers name the version; the snapshot bytes are not canonical (section 6) | **Change**: name a version by its doc id plus frontiers; keep a hash only for bytes theDB stored and will serve (section 4.2). sql.rs:228-229 already notes Loro "does not promise the same bytes twice" |
| Version vector per version row (sql.rs `vv`) | **Fully** (`oplog_vv`, `frontiers_to_vv`) | Keep as an index; store frontiers (`Frontiers::encode`, canonical) as the key |
| Delta storage: updates since the parent, snapshot every 16 (sql.rs:244-284) | **Fully** the pattern Loro recommends [persistence.mdx] | **Keep**; source the delta from `subscribe_local_update` or `export(updates(vv_before))`; store pending bytes with checkpoints |
| Heads as tags, then rows with CAS (lib.rs:446, `move_head`) | **Not at all** (when_not_crdt) | **Keep CAS outside Loro**. A refs doc (0056) is fine for history of the pointer, but the move itself must be one writer's compare-and-swap, not a Loro merge |
| Branches as separate copies (`branch/<b>/<id>` tags; `heads(branch, doc)`) | **Partly**: forks and frontiers; no names | **Change**: a branch is a set of `(doc id → frontiers)`; all branches' changes live in the doc's one OpLog; read with `fork_at(head)` |
| Merge by importing the branch's snapshot into main and committing a new snapshot (`merge_into_main`, lib.rs:352-359) | **Fully** for the data; the merged version is `vv_to_frontiers(vv_main ∪ vv_branch)` | **Change**: a merge writes no Loro change; it moves main's head to the union frontiers (plus `json::heal` only if healing ops are needed) |
| Proposals: a doc naming the branch's versions; merge checks the merged tree first (source.rs:393-490) | **Not at all** (application workflow) | **Keep**; a proposal records per doc the base frontiers and the head frontiers |
| Overlap detection (0057 §4) | **Fully** the raw data: `diff(base, head)` per side, `get_changed_containers_in`, `get_last_editor` | **Build** on these: intersect the key sets of `diff(base, main)` and `diff(base, branch)` |
| Diffs for the viewer | **Fully**: `diff` gives typed per-container deltas; `export_json_in_id_span` gives the ops | **Use directly** |
| History in the viewer | **Fully**: `travel_change_ancestors`, `ChangeMeta`, `checkout` | **Use directly**; turn on `set_record_timestamp(true)` and keep one change per commit (a message per commit) so the list is the commits |
| Revert a proposal while keeping later ones (0057 Research, "inference") | **Fully**: `revert_to(v)` or `diff(after, before)` + `apply_diff` as new ops | Use; not inference any more (`revert_to` tested) |
| `json.rs`: a JSON object as a Loro map, nested objects via `insert_container` (json.rs:90-104) | Map LWW per key; **concurrent `insert_container` on one key hides one side** | **Fix**: use `ensure_mergeable_map` / `ensure_mergeable_list` for nested objects and arrays (measured: `insert_container` lost `elevation`; `ensure_mergeable_map` kept both keys) |
| A new random peer per load (every `doc()` is `from_snapshot` or `LoroDoc::new`) | Loro's default, by design | **Change**: one peer id per writing session, leased by theDB and recorded (it is also what a signature binds); measured 5.8× smaller history |
| Commit message, author, time | Message and timestamp persisted; no author; timestamps off by default | Set `set_record_timestamp(true)` on every doc theDB opens; a message per commit naming the commit's record; the author lives in theDB's signed record (4.5) |
| Signing (0057 §7) | **Not at all** | **Keep the 0058 design**: sign theDB records that name deltas by hash; never trust the message |
| Sync (0053 later, 0057 §9) | **Partly**: per doc, version vectors and updates; nothing for many docs | Use Loro's updates per doc inside theDB's own protocol over iroh; root and refs first, then deltas, then blobs |
| Shallow history / pruning | **Fully** (shallow snapshots) | Use for docs with long histories, after archiving the full history as a blob |
| Find docs by kind, name, words (`words` FTS5, `docs` rows) | **Not at all** | Keep (0053) |

---

## 4. Recommended design on top of Loro

### 4.1 The two primitives, restated with Loro's words

- **Objects** (blobs, by BLAKE3): immutable bytes, including schemas, builds, and every record theDB signs. Their hash
  is a content hash because theDB or a person wrote those exact bytes.
- **Docs** (Loro): one OpLog per doc id, holding the changes of every branch ever made to it. A doc never has "a
  snapshot per version"; it has one growing history, stored as deltas with checkpoints.
- **Heads**: per branch, per doc, a frontiers value. Heads live in refs (rows today, a refs doc in 0056) and move by
  compare-and-swap.

### 4.2 How a doc version is named and pinned

Use **both**, each for what it can do:

1. **The name: `(doc id, frontiers)`**, written as the canonical `Frontiers::encode()` bytes (sorted ids). It means the
   same thing on every device, needs no particular bytes, survives re-encoding, Loro upgrades and compaction, and is
   what `fork_at`, `checkout`, `diff` and `SnapshotAt` take. Two versions compare with `cmp_frontiers`.
2. **The pin: a BLAKE3 hash of bytes theDB stored**, never a hash recomputed from an export. A pin is an object: a
   delta blob (the changes a commit added) or a checkpoint snapshot blob, each also recording the frontiers it reaches.
   To verify a pin, load the bytes, check the hash, and check that the loaded doc's `oplog_frontiers()` (or the
   frontiers `SnapshotAt` was cut at) equal the name. Do not expect another device, or the same device later, to
   re-export the same hash: measured, it often will not.

### 4.3 "Start the kernel at a genesis version by hash"

- The **genesis doc** (0056's refs doc of main, or the root doc) is a Loro doc like any other; its version is
  `(genesis id, frontiers)`.
- The kernel cannot start from frontiers alone (they are not tamper-evident and need the history to resolve). It starts
  from a **root record**: a small object theDB writes in canonical bytes (fixed field order, version byte), holding the
  genesis doc's id and frontiers, the hash of a checkpoint blob that contains that version (a `SnapshotAt` export made
  once and stored), and, for every doc the genesis names, `(doc id, frontiers, checkpoint or delta-chain hashes)`; signed
  as 0058 designs. **Its BLAKE3 is the system hash.** Because theDB wrote the bytes, the hash is stable; because it names
  stored blobs, a second device fetches exactly those bytes over iroh-blobs; because it names frontiers, every doc is
  checked out at an exact version that any device holding the history reproduces.
- Booting `X`: fetch record `X`, verify it, load each checkpoint, `fork_at(frontiers)` (or `SnapshotAt` directly), run.

### 4.4 Branches, merges, proposals

- **A branch** is a refs set: doc id → head frontiers. Creating one copies main's heads; it costs nothing per doc.
- **An agent working on a branch** opens `fork_at(head)` with its own leased peer id (section 4.6), edits, commits with a
  message per commit; theDB stores the delta (`export(updates(vv_head))`) into the doc's OpLog store and moves the
  branch head to the new frontiers by compare-and-swap.
- **A merge** of branch B into main, per doc: if `cmp_frontiers(main, B)` is `Less`, fast-forward main to B; otherwise
  main's new head is `vv_to_frontiers(vv(main) ∪ vv(B))`. No new change, no new snapshot. A merge that needs fixing
  ops (`json::heal`, a landing rule) writes them as one more change by the merger, on top of the union.
- **A proposal** stores, per doc, `base` (the frontiers B started from), `head` (B's frontiers), and the overlap record:
  the keys in both `diff(base, main)` and `diff(base, head)`, with both values and the one LWW would pick.
- **Reverting** a merged proposal: `diff(after, before)` restricted to its containers, `apply_diff` as a new change, or
  `revert_to` for a whole doc.

### 4.5 Storage

- Per doc, in SQLite (0053's schema, adjusted): `changes(doc, frontiers_after, parent_frontiers, delta BLOB, blake3,
  author_record)` rows, appended once per commit; `checkpoints(doc, frontiers, snapshot BLOB, blake3)` every N deltas;
  heads by branch with compare-and-swap. Loading a head: newest checkpoint below it, then the deltas, then
  `checkout`/`fork_at` the head (the OpLog may hold other branches' changes too, so never read the attached latest).
- Keep `export_pending_updates()` bytes with a checkpoint when sync arrives (until then nothing is ever pending).
- Long histories: archive the full snapshot as a blob, then keep a `ShallowSnapshot` at a version every branch has
  passed; refuse to trim past any head or pinned root.

### 4.6 Authorship and signing on top of Loro

- **Peer ids are leased, not random per load.** theDB hands each writing session (an agent, a process) a fresh peer id,
  records `(peer id → session key, grant)` in its signed record, and never gives the id to anyone else. `set_peer_id` on
  the forked doc before the first edit. This also stops the version vector from growing by one entry per commit.
- **What is signed:** theDB's version record (0058 §3.2): doc id, parent frontiers, new frontiers, the delta blob's
  BLAKE3, the peer ids the delta contains (check with `decode_import_blob_meta`: its `partial_start_vv` and
  `partial_end_vv` list them), author key, grant. Sign the **stored delta bytes**, not a recomputed export.
- **Verification on import:** before importing a delta, decode its metadata; refuse it unless a valid record names its
  hash and its peers are the author's leased peers. This is the "filter imports" the maintainer suggested [GH-D314],
  done outside Loro since no `tryImport` exists [GH-611].
- **The commit message** carries a short pointer (the record's hash or the author's key), set through
  `subscribe_pre_commit` so implicit commits get it too; nothing trusted rests on it.

### 4.7 Settings theDB should set on every `LoroDoc` it opens

`set_record_timestamp(true)` (history with times; not persisted, so set it on every load); a commit message per theDB
commit (or `set_change_merge_interval(-1)`) so a Loro change is a theDB commit; `set_peer_id(leased)` before writing;
`ensure_mergeable_*` for nested JSON; `try_checkout_to_latest`/`try_attach` (the panicking forms are deprecated in 1.18).

---

## 5. Open questions

1. **Canonical bytes.** Should theDB define one canonical export for a version (for example `all_updates` sliced to
   the frontiers, which matched across devices in every measured case), or is "hash only what was stored" enough? The
   second needs nothing from Loro; the first is not promised by Loro and could break on an upgrade.
2. **One OpLog for all branches.** A doc's store then holds abandoned branches' changes forever (until a shallow trim).
   Is that acceptable, or do branch-only changes stay in a side table until merged?
3. **Peer leases across devices.** A lease must be unique across all devices before sync; a random u64 per session
   (Loro's default) with a record binding it to a key may be simpler than a lease table.
4. **The refs doc as Loro.** A pointer must move by compare-and-swap; a Loro refs doc gives its history but a concurrent
   write by two devices would merge by LWW. Is the refs doc single-writer (main's owner) by rule?
5. **Path-level rights** need "which paths does this delta touch" before import; Loro offers it only after import
   (`get_changed_containers_in`, `diff`). Import into a scratch fork first, inspect, then import for real?
6. **Timestamps of merged changes** keep only the first commit's time; is a per-commit time in theDB's record enough
   for the viewer, leaving Loro's timestamp as a hint?

---

## 6. Measurements (loro 1.18.0, `cargo run` in a scratch crate, 2026-11-20)

| Test | Result |
| --- | --- |
| 3 plain commits, one peer | 1 change, len 3 |
| commits "msg-A", "msg-A", "msg-B" | 2 more changes: the two "msg-A" merged |
| merge interval -1 | each commit its own change |
| 5 commits with explicit timestamps t…t+40, no messages | 1 change, timestamp t (later times lost); same on the receiver |
| same history: origin, receiver of `all_updates`, reload of the snapshot | identical snapshot bytes |
| 5 updates imported one by one vs batch in reverse order | identical snapshot bytes |
| two peers, concurrent edits, exchanged both ways; third device in both orders | identical snapshot, `all_updates`, `StateOnly`, shallow bytes; identical frontiers bytes |
| **six peers × 400 commits, imported forward vs reversed** | **different** `Snapshot`, `StateOnly`, `ShallowSnapshot` bytes; **same** `all_updates` bytes and frontiers |
| **3,000 commits, receiver importing each live** | **different** snapshot (50,383 B vs 50,403 B); same `all_updates`; a reload of the origin's snapshot re-exports identically |
| `fork_at(v).export(Snapshot)` vs `export(SnapshotAt{v})` | identical bytes |
| concurrent `insert_container("sun")` on two forks | merged map holds only one side's subtree |
| concurrent `ensure_mergeable_map("sun")` | both sides' keys kept |
| branch heads as frontiers in one OpLog; merge as union of version vectors | correct merged state, no new change |
| 500 commits, a new random peer each (theDB's pattern) | snapshot 38,323 B, 501 peers in the version vector; shallow at latest 16,907 B |
| 500 commits by one peer, a message each | snapshot 6,584 B |
| a snapshot stored per commit, 500 one-line commits | 1,160,102 B stored in all; last snapshot 4,443 B |
| sum of 500 per-commit deltas | about 48-51 KB (about 100 B each, mostly fixed header) |

---

## Sources

Crate (local, loro 1.18.0, `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/`):

- `loro-1.18.0/src/lib.rs`, `src/event.rs`, `README.md`
- `loro-internal-1.18.0/src/change.rs`, `change_meta.rs`, `pre_commit.rs`, `encoding.rs`, `encoding/fast_snapshot.rs`,
  `oplog.rs`, `oplog/change_store.rs`, `version.rs`, `version/frontiers.rs`, `configure.rs`, `loro.rs`, `awareness.rs`
- `loro-kv-store-1.18.0/src/lib.rs`
- https://docs.rs/loro/latest/loro/ (latest is 1.18.0: https://crates.io/crates/loro [crates.io])

Website (loro.dev answered 403; read from https://github.com/loro-dev/loro-docs at `fed85892`, `pages/…`):

- https://loro.dev/docs/concepts/version_vector · /concepts/frontiers · /concepts/operations_changes ·
  /concepts/oplog_docstate · /concepts/attached_detached · /concepts/shallow_snapshots · /concepts/peerid_management ·
  /concepts/import_status · /concepts/transaction_model · /concepts/container · /concepts/choose_crdt_type ·
  /concepts/when_not_crdt · /concepts/cursor_stable_positions
- https://loro.dev/docs/advanced/version_deep_dive · /advanced/timestamp · /advanced/import_batch · /advanced/undo ·
  /advanced/jsonpath · /advanced/cid
- https://loro.dev/docs/tutorial/encoding · /tutorial/persistence · /tutorial/sync · /tutorial/time_travel ·
  /tutorial/version · /tutorial/loro_doc · /tutorial/tips · /tutorial/event · /tutorial/ephemeral · /tutorial/map ·
  /tutorial/tree · /tutorial/counter
- https://loro.dev/docs/performance/docsize
- [L-blog-v1] https://loro.dev/blog/v1.0 (`pages/blog/v1.0.mdx`)

Protocol and sync:

- https://github.com/loro-dev/protocol: `protocol.md`, `protocol-e2ee.md`, `README.md`,
  `rust/loro-websocket-server/src/lib.rs`, `rust/loro-websocket-server/examples/simple-server.rs`
- https://github.com/loro-dev/iroh-loro: `README.md`, `src/lib.rs`
- https://github.com/loro-dev/peer-lease
- https://github.com/orgs/loro-dev/repositories (the organization's repositories, listed with `gh repo list`)

Issues and discussions:

- [GH-611] https://github.com/loro-dev/loro/issues/611 (tryImport with a validator; open)
- [GH-612] https://github.com/loro-dev/loro/issues/612 (signing ops; closed, answered with subscribePreCommit)
- [GH-D314] https://github.com/loro-dev/loro/discussions/314 (data validation, permissions, filtering imports)
- [GH-D719] https://github.com/loro-dev/loro/discussions/719 (auth, permissions, access control; unanswered)
- [GH-D1035] https://github.com/loro-dev/loro/discussions/1035 (sign and verify hooks; unanswered)
- https://github.com/loro-dev/loro/discussions/916 (entity-level coordination for agents on Loro's DAG)

theOS:

- `App/theDB/src/lib.rs`, `source.rs`, `json.rs` (branch `aven/0057-version-control`, `9ad3ec58`); `App/theDB/src/sql.rs`,
  `lib.rs` (branch `aven/0053-sqlite-store`, `9749d842`)
- `Intents/0049-docs-and-blobs.md`, `0053-docs-in-sqlite.md`, `0054-modules-as-blobs.md`, `0056-thedb-the-heart.md`,
  `0057-many-agents-one-main.md`; `Research/0057-high-velocity-version-control.md`,
  `Research/0058-identities-signing-access.md`
