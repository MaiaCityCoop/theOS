# 0051 · The engine's source in avenDB: research

The question: how do the engine's source files become docs in avenDB, edited there, with a branch per agent and a
merge that is checked before it lands? And where does git stay?

## What is there (main, 2026-11-20)

- `avenDB/src/lib.rs`: docs are Loro docs, one line each: the tag `doc/<id>` names the latest snapshot blob.
  `commit` imports whatever the tag holds before writing, so concurrent writers merge, but there is no branch and
  no step between a write and everyone seeing it.
- `avendb publish <engine> <binary> <dirs>…` walks folders of the git checkout and keeps each file as a blob, the tree
  as a manifest (path → blob hash), the binary, and the toolchain. The engine doc lists builds and pins one; the
  kernel starts the pinned build.
- So a published build is in avenDB, but the source is edited in git and copied in at publish. Intent 0049 decided
  "the engine itself versioned as Loro docs and iroh blobs, git only for snapshots"; its deliverable 8 narrowed that
  to "a tree of blobs with a manifest (as git's trees)". That narrowing is the gap this intent closes.

## Loro (1.18.0, the version in `avenDB/Cargo.lock`, read from its source)

- `LoroDoc::fork()` and `fork_at(&Frontiers)`: a new doc at a version, with history up to it. "Creating branches for
  experimentation" and merging them "through import" is how Loro's README describes them; there is no higher-level
  merge API. https://docs.rs/crate/loro/1.13.9/source/README.md
- `export(ExportMode::Snapshot | Updates { from })` and `import`: a branch's work travels as updates; importing them
  is the merge, which never fails.
- `LoroText::update(text, opts)` and `update_by_line`: turn a whole new text into the minimal edits (Myers diff), so
  a file saved from an editor becomes a real edit with history. `diff(a, b)` and `checkout(frontiers)` for review
  and time travel.
- Known issue: `forkAt` inside a subscription callback during a checkout leaves a doc inconsistent (loro#907); we
  fork outside callbacks only.

## Prior art

- **Ink & Switch, Patchwork (2024):** universal version control on Automerge. A branch is "a variation of a document
  that can be edited independently"; branches are reviewed and merged back to main; the history CRDTs keep for
  offline editing is the same history version control needs. The pattern taken: branch, review, merge, all on the
  document's own history. https://www.inkandswitch.com/patchwork/notebook/2024-version-control/ ·
  https://inkandswitch.com/patchwork/notebook/08
- **Semantic merge conflicts:** a merge with no textual conflict can still fail to build, fail tests or behave
  differently (a changed signature and an old call merge cleanly and do not compile). CRDTs "cannot detect semantic
  inconsistencies" (CodeCRDT, 2025). https://soft.vub.ac.be/~wmuylaer/repository/2023scam.pdf ·
  https://arxiv.org/pdf/2510.18893
- **Merge queues** (GitHub merge queue, GitLab merge trains, Bors): the check runs on the result the merge would
  make, one at a time in order, and only a passing result moves main. https://runway.team/blog/merge-queues-intro-for-mobile-engineers
- **weave-crdt:** merges per syntax entity with tree-sitter, conflicting only when one entity changes incompatibly.
  Finer than text, not needed while the check catches breaks. https://docs.rs/crate/weave-crdt/0.2.6/source/README.md

## Options weighed

1. **Keep git for code, avenDB for content** (today). Two sources of truth for one engine; agents need git worktrees
   and a Bevy build each (8 GB machine). Rejected: it is what 0049 decided against.
2. **Source docs, edited only through an API or an editor plugin.** Pure, but cargo, rust-analyzer and every agent's
   tools work on files. Rejected for now.
3. **Source docs as the truth, folders as views of a branch.** Chosen. A checkout writes a branch's tree into a
   folder; a sync turns the folder's changes into Loro edits on that branch, made against the version the folder was
   written from (so a doc changed meanwhile merges, not overwrites); cargo builds the folder. A proposal is merged in
   memory, checked out, built and tested, and only a passing result moves main: Patchwork's branches with a merge
   queue's check.

## The pattern chosen

- **A branch** is a set of tags `branch/<name>/<id>`; a doc read on a branch falls through to main where the branch
  has not changed it. Content docs and source docs branch the same way, so an engine run on a branch reads that
  branch's shaders and recipes too.
- **A tree** is a doc mapping paths to source docs. Each source file is a doc (kind `source`, name its path).
- **A view** is a folder written from a tree on a branch, with a stamp of the versions written. All views share one
  cargo target folder, so Bevy is built once for every agent.
- **A proposal** is a doc naming the branch and the versions it would bring. Merging it: import in memory, check out,
  run the tree's check (build and test), and on success move main's tags; the output is kept in the proposal. One
  merge at a time.
- **git** gets snapshots: main's tree written into the git checkout for a commit.
