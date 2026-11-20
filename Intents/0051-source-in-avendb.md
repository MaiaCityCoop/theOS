---
id: "0051"
title: The engine's source in avenDB, with branches and checked merges
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0051-slug/, set at propose
---

# 0051 · The engine's source in avenDB, with branches and checked merges

## Idea

Samuel, while intent 0050 was being split into tasks:

> Can't you parallelize all this work in the same worktree as background actions? But don't we have already
> everything, the kernel and kernel plugin, inside of avenDB and Loro version control? So it's not a problem?

> Didn't we say the engine's code should also land in avenDB, including purely content-addressed linking, so every
> asset is always backwards compatible with its actual engine in future?

> Also Loro has branching, so every agent can always work on their own branch and just make a merge proposal, right?

> OK, didn't we already decide to move everything, including engines, into Loro? Why didn't you deliver it? Open the
> new intent and prioritise its delivery now.

Intent 0049 decided "the engine itself versioned as Loro docs and iroh blobs, git only for snapshots". What it built
keeps a published build's source as blobs, but the source is still edited in git and copied in at publish, and avenDB
has no branches. The definition narrowed the decision ("a tree of blobs with a manifest, as git's trees") and nobody
flagged it. This intent delivers the decision.

## Define

Samuel asked for the work outright ("open the new intent and prioritise its delivery now"); this definition holds no
surprise beyond his words, so it goes straight to Build.

**Deliverables**

1. **Branches in avenDB.** A branch is a set of tags `branch/<name>/<id>`. A doc read on a branch falls through to
   main where the branch has not changed it; a commit on a branch writes only to the branch. `AVENDB_BRANCH` picks the
   branch for every process (the engine, the kernel, `avendb`), so an engine run on a branch reads that branch's
   shaders and recipes too. `avendb branch <name>`, `avendb branches`, `avendb diff <branch>`.
2. **The source as docs.** Each source file is a doc (kind `source`, name its path); a tree doc (kind `tree`) maps
   paths to them and names the check that a merge must pass. One tree for the engine: `NativeGame/` and `avenDB/`
   (sources, manifests, lock files, tests, `build.rs`), the layout cargo needs. The engine doc names its tree.
   `avendb import <tree> <dir>` brings a git checkout in, as edits of what is there.
3. **Folders as views.** `avendb checkout <tree> <dir>` writes a branch's tree into a folder with a stamp of the
   versions written; `avendb sync <dir>` turns the folder's changes into Loro edits on its branch, made against the
   versions it was written from, so a doc changed meanwhile merges instead of being overwritten; new and deleted files
   change the tree; the merged text is written back. Every view shares one cargo target folder (`avenDB/target`), so
   Bevy builds once for every agent.
4. **Checked merge proposals.** `avendb propose <branch> <note>` makes a proposal doc: the branch and the versions it
   would bring. `avendb merge <proposal>` merges in memory, checks the result out to a temporary view, runs the tree's
   check (each crate's `cargo build` and `cargo test`), and moves main only if it passes. The output is kept in the
   proposal either way. One merge at a time.
5. **Builds from the tree, linked by content.** `avendb publish <engine> <tree>` builds from a view of main and keeps,
   for each source file, the hash of its doc's version. A build names exactly the source it was made from, and any
   build can be checked out and built again from avenDB alone.
6. **git for snapshots only.** `avendb snapshot <tree> <dir>` writes main's tree into the git checkout for a commit.
   The intents skill tells workers to work in a view on a branch and propose, not in a git worktree, for the engine.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Branches | `cargo test` in `avenDB/`: a branch reads main's docs, its own commits stay on it, `AVENDB_BRANCH` switches what `doc` and `text` return |
| 2 | Source round trip | `avendb import` the engine; `avendb checkout` it to a temporary folder; `diff -r` against the git checkout shows nothing |
| 3 | Views merge | two views on two branches edit one file in different places; both sync, both proposals merge; main has both edits |
| 4 | A broken merge is refused | two branches that each build but break together (a renamed function and a new call to the old name): the second merge is refused with the compiler's output, main unchanged |
| 5 | Builds linked by content | `avendb publish` from the tree; the kernel starts it; the build names each source doc's version; checking those versions out gives the same files |
| 6 | Snapshots | `avendb snapshot` into the git checkout: `git status` clean right after an import |

**Out of scope**

- Sync between devices; source-aware (syntax tree) merging; an editor plugin.
- The other code in the repository (`TheGame/`, `OS/`, the website): the engine first.
- Assets recording the engine build they were made with: intent 0050's deliverable 2.

**Architecture pass** (research in `research_notes/0051-source-in-avendb.md`)

- **What is there:** one line per doc in avenDB, merged on every commit; `publish` copies a git folder's files in as
  blobs; git is where code is edited, branched and merged; every agent needs a git worktree and its own Bevy build.
- **First principles:** the invariant is one source of truth for every version of everything the engine is and
  reads, with a change reaching main only once it is checked. Two sources (git for code, avenDB for content) keep
  more than that and less.
- **Put back, in the best form:** Patchwork's branches on the CRDT's own history, with a merge queue's check on the
  merged result (a CRDT merge never fails, so it can merge broken code). Folders stay, as views, because cargo and
  every tool read files.

**Code gates** (lines with `wc -l`)

| Gate | On `main` now | Target |
| --- | --- | --- |
| Size | `avenDB/src`: 701 lines | new lines only for branches, trees, views and proposals; `publish`'s folder walk goes |
| Copies | — | no new clone |
| Settings | — | one new: `AVENDB_BRANCH`; no other switch |
| Dependencies | — | none new |

**The 10 % gate** (this intent does not touch the renderer: its frame, startup and memory must not get worse)

| Measure | On `main` now | Target | At Propose |
| --- | --- | --- | --- |
| An agent ready to build: from nothing to `cargo build` of NativeGame done | a git worktree and a cold Bevy build (to measure) | ≥ 10 % faster (a view and the shared target: an incremental build) | |
| The engine's frame, startup and memory | as 0049 measured | not worse (the engine is unchanged) | |

## Build

_Filled while building: decisions, and what turned out different from the definition._

## Propose

_Filled when everything is built. Then stop: the human decides._

## Story

_Filled after the human's yes._

## Archived

_accepted or rejected, the date, the reason in a line._

---

## Todo

- [ ] 1 Branches in avenDB
- [ ] 2 The source as docs
- [ ] 3 Folders as views
- [ ] 4 Checked merge proposals
- [ ] 5 Builds from the tree, linked by content
- [ ] 6 git for snapshots only
- [ ] Measure the agent-ready time on `main`

## Changelog

### 2026-11-20

- **Asked:** why work cannot run in parallel in one place, since everything was meant to be in avenDB and Loro; that
  the engine's code was meant to be there too, content-addressed, so assets stay compatible with their engine; that
  Loro branches give every agent its own branch and a merge proposal; why 0049 did not deliver it; open this intent
  and prioritise it.
- **Delivered:** this intent and `research_notes/0051-source-in-avendb.md`.
- **Good:** 0049's builds and pinning are in place to build on.
- **Broke / not there yet:** 0049's definition had narrowed Samuel's decision to blob snapshots of a git folder.

## Trail

| When | Commit | What |
| --- | --- | --- |
