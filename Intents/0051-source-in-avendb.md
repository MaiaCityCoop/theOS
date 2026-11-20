---
id: "0051"
title: The engine's source in avenDB, with branches and checked merges
state: propose         # idea | define | build | propose | story | archived
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

- **Branches (deliverable 1):** tags `branch/<name>/<id>` beside main's `doc/<id>`, and `branches/<name>` for what a
  branch is for. `head` falls through to main; `commit_on` merges what the doc holds on that branch (or main's, the
  first time) before it writes, as `commit` always did. `AVENDB_BRANCH` is read in `open`; `forget` is main's only.
- **Trees and views (deliverables 2, 3):** `avenDB/src/source.rs`. A tree's files are a Loro map (path → source doc),
  so two branches that add different files both keep them; its shape (`include`, `check`, `build`, `binary`) is one
  value. `sync` applies a view's edit to the doc *as it was written* and commits that, so Loro merges it with what the
  branch got meanwhile; the merged text is written back. Views live in `avenDB/views/` (ignored by git). Every view
  and every check builds into `avenDB/target/views`, so the dependencies are built once.
- **Proposals (deliverable 4):** a proposal is a doc on main. `merge` takes a lock (`avenDB/merge.lock`), merges the
  proposal's versions with main's on a trial branch `merge-<proposal>`, writes every tree it touches to a view of
  that branch, runs the tree's check there, and only on a pass brings the trial's versions into main (merged once
  more with whatever main got during the check). The last 400 lines of output are kept in the proposal.
- **Builds (deliverable 5):** `avendb publish <engine> <tree>` builds a view of main with the tree's `build` and names
  each file by its doc's version; the engine doc now names its tree. `avendb source <build> <dir>` writes any build's
  source out again (older builds, which named file blobs, too). `publish`'s folder walk is gone.
- **The engine's tree:** `bmqnnttpxhifmuwar6y3jmt6tz`, 38 files: `NativeGame/` (manifest, lock, README, `src/`) and
  `avenDB/` (manifest, lock, `src/`, `tests/`). Its check: avenDB's tests, NativeGame's build and tests.
- **git (deliverable 6):** `avendb snapshot <tree> .` writes main's tree into the git checkout. The intents skill now
  tells workers on the engine to use a branch and a view and to propose.

## Propose

**Delivered:** branches, the engine's source as a tree of docs, views, checked merge proposals, builds from the tree
named by doc version, snapshots into git; the intents skill's worker flow; and, found while using it, a store whose
owner is closing is now waited for and taken over. In use the same day: six branches (0051's fixes, the kernel plugin,
0050's assets, one source, the tree, the broadleaf asset) merged into avenDB main one by one through their checks,
and this PR is `avendb snapshot` of the result.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 Branches | passed | `cargo test` in `avenDB/`: `a_branch_reads_main_and_keeps_its_own` |
| 2 Source round trip | passed | `import` of 38 files, `checkout` to a folder: 38 files, 0 differ |
| 3 Views merge | passed | `two_views_edit_one_file_and_both_merge`; and in use, six branches merged |
| 4 A broken merge is refused | passed | `a_merge_that_breaks_the_build_is_refused`: the compiler's "cannot find function `one`" kept, main unchanged |
| 5 Builds linked by content | passed | `avendb publish` → build `aa843b39…`, pinned, started by the kernel; `avendb source` of it gives the view's 45 files, 0 differ |
| 6 Snapshots | passed | `snapshot` right after the import: `git status` clean; this PR's engine code is a snapshot |

**The 10 % gate**

| Measure | Before | After |
| --- | --- | --- |
| An agent ready to build NativeGame | a new folder and a cold Bevy build: 1,653 s (the first build into the shared target) | a view (under 1 s) and the shared target: 87 s for the first build of 0050's view, 51–147 s for a merge's whole check |
| The engine's frame, startup and memory | unchanged code paths | not measured again: no renderer change in 0051 |

**Known gaps:** a content-only merge (a root or asset doc) checks nothing, since no source tree is touched; large
parts (the lawn's atlases, about 14 MB) fail to pass through the store's connection from a second process
("Error::Io"), so the lawn is kept only by the process that owns the store; the shared target holds the views'
binaries, so two views building at once take turns.

## Story

_Filled after the human's yes._

## Archived

_accepted or rejected, the date, the reason in a line._

---

## Todo

- [x] 1 Branches in avenDB
- [x] 2 The source as docs
- [x] 3 Folders as views
- [x] 4 Checked merge proposals
- [x] 5 Builds from the tree, linked by content
- [x] 6 git for snapshots only
- [x] Measure the agent-ready time
- [ ] Large parts through the store's connection (the lawn)
- [ ] Samuel accepts or rejects

## Changelog

### 2026-11-20

- **Asked:** why work cannot run in parallel in one place, since everything was meant to be in avenDB and Loro; that
  the engine's code was meant to be there too, content-addressed, so assets stay compatible with their engine; that
  Loro branches give every agent its own branch and a merge proposal; why 0049 did not deliver it; open this intent
  and prioritise it.
- **Delivered:** this intent and `research_notes/0051-source-in-avendb.md`.
- **Good:** 0049's builds and pinning are in place to build on.
- **Broke / not there yet:** 0049's definition had narrowed Samuel's decision to blob snapshots of a git folder.

### 2026-11-20 (afternoon)

- **Asked:** parallel work in one place; a walkable build; the branches merged back into one main.
- **Delivered:** every branch merged through its check; the engine published from the tree and started by the kernel;
  this PR, a snapshot of avenDB main.
- **Good:** the first cold build took 27 minutes; every build after it, 1 to 2.5 minutes. The merge check passed six
  times and refused nothing that compiled.
- **Broke / not there yet:** a second process opening the store while its owner closed got a dead connection (fixed
  on the branch `0051-open`); the lawn's large parts do not pass through the connection.

## Trail

| When | Commit | What |
| --- | --- | --- |
