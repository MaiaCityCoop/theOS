---
id: "0056"
title: theDB, the heart: an audit of docs, blobs, branches, merges and the timeline
state: idea            # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0056-slug/, set at propose
---

# 0056 · theDB, the heart: an audit of docs, blobs, branches, merges and the timeline

## Idea

Samuel, 2026-11-20, after the cut to day 1 (intent 0055):

> We then need to fine-tune and audit our full Loro docs, iroh and timeline architecture and version control system,
> since this is going to be the actual heart of our OS.

> Aren't branches and merges and the timeline also docs and blobs? Docs should be the SSOT for mutable pointers,
> right? The root pointer is our kernel loader, right?

And, on starting the kernel with one root version by hash, so one hash reproduces the whole system (engine, world,
timeline, everything at that moment) and is what a second device asks for when it syncs:

> This is what we want.

**Decided already (to be designed in Define):**

- **Two kinds of thing only.** Blobs are immutable, named by hash. Docs hold everything that changes.
- **Docs are the single source of truth for every mutable pointer.** A doc's head, a branch, main, a proposal's
  state, the pinned build, a timeline: values inside docs, with history. Today they are tags outside the docs (one per
  doc head, one per branch entry, the root), so main has no history, a merge moves many tags and is not atomic, and
  branches cannot sync.
- **A refs doc per branch:** a map from doc id to head. A branch is a doc; a merge is one commit to main's refs doc,
  naming its proposal; "main an hour ago" is an older version of that doc.
- **One root pointer:** the only thing in the store that changes outside a doc; it names a version of main's refs
  doc. theKERNEL is the code that follows it.
- **The kernel starts a root version by hash.** One hash names the whole system at a moment: engine, world, timeline.
  A frame is reproduced from it; a second device syncs to it.

**To audit (each a finding with evidence and a proposed fix, before anything is built):** snapshots per commit and
finding docs (intent 0053); source merged as text, content-only merges unchecked, proposals that cannot follow a moved
main; stale branches and views; blobs never pruned, large blobs through the owner; build outputs left behind; a story
not pinned to the versions it was filmed with; sync between devices; no backup of `DATA/` and no integrity check at
start.

## Define

_To be written after intent 0055's cut is merged: the audit first, then Samuel chooses what to build._

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] The audit, with evidence
- [ ] Define, from its findings and the decisions above

## Changelog

### 2026-11-20

- **Asked:** an audit and fine-tuning of theDB as the heart of the OS; docs as the source of truth for mutable
  pointers; the kernel started by a root hash.
- **Delivered:** this idea, with the decisions written down.

## Trail

| When | Commit | What |
| --- | --- | --- |
