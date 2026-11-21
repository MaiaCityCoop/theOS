# 0057: high-velocity version control: what Anthropic built, and what theOS can take from it

Research note, 2026-11-20. Question (Samuel): what did Anthropic change in its source control to merge at very high
velocity (his figure: about 30,000 merged PRs a day), and which of those innovations can theOS reproduce with its own
primitives (docs, blobs, branches, proposals, one owner of main, WASM modules)?

**How to read the claims.** Each claim carries a source tag ([A], [PE], …, listed in section 6).
- *Confirmed* means the primary source (Anthropic's own article, a project's own docs) says it.
- *Reported* means a second-hand source says it (a newsletter, a blog, a competitor's or critic's post).
- *Inference* means it is this note's reasoning, not a source's.

**Pages that failed:**
- The Reddit thread could not be fetched (www.reddit.com and old.reddit.com both refused automated fetches). Nothing
  in this note comes from it.
- The CACM paper on Piper returned 403, so Piper's figures come from Wikipedia, which cites that paper.
- The Uber SubmitQueue paper was too large to fetch, so Uber's own engineering posts stand in for it.
- Graydon Hoare's post on the "not rocket science rule" timed out, so Jane Street's and bors' accounts stand in for it.
- The Hacker News id Simon Willison links (50073633) served a thread about Claude Code's performance, not about Scion,
  so it is not used.

---

## 1. What Anthropic built

### 1.1 The problem

- **The numbers, confirmed [A]:** Anthropic merged about 2,500 code changes a day in May 2026 and over 30,000 a day by
  September 2026. So Samuel's figure is right in size, but the unit is "code changes merged", not "PRs".
  - Simon Willison's chart puts the peak at 30,401 merges on 9 September [SW].
  - The same chart shows Antique "change requests" replacing GitHub pull requests between late May and mid-July [SW].
  - The Pragmatic Engineer adds about 3,000 to 3,500 staff, each typically running 10 to 15 parallel Claude agents
    [PE]. This is *reported*, and the newsletter is not consistent on the staff count.
- **The thesis, confirmed [A]:** coding is no longer the bottleneck. The developer infrastructure built for human scale
  is: source control, builds and CI. In Anthropic's words, the latent demand for merging is "practically infinite".
- **What broke in git, confirmed [A]:**
  - The main branch's history is almost 100 GB, and a compressed working copy is over 25 GB.
  - There are about 25 million CI checkouts a day, which naively would be over 600 PB of git traffic a day.
  - Several hundred internal git mirrors, shallow and sparse clones, promisor remotes and blob-stored seeds helped,
    but they grew harder to run as the merge rate rose.
- **The root insight, confirmed [A]:** git is built for offline clients that hold full copies. Almost all of
  Anthropic's clients are agents and CI jobs that are always online.

### 1.2 The design: Scion and Antique

- **Scion** is the source control system. **Antique** is the code review tool and its merge queue [A]. Anthropic says
  it also built code search, a source control IAM system and new ways to land reviewed code in bulk [A].
- **Team and timeline, confirmed [A]:** seven engineers built Scion, Antique and about six related systems, and
  migrated fully in five months, while merge volume rose tenfold.
- **Implementation, reported [PE]:**
  - Scion's server and client are written in Rust. Antique's backend is in Go and its frontend in React.
  - Changesets are stored in Google Spanner, and large blobs in Google Cloud Storage.
  - The monorepo is 100 % off git.
- **Prior art, confirmed [A]:** Anthropic credits Google's Piper and Meta's Sapling. After a public complaint, it added
  a footnote crediting Sapling's server, Mononoke, and its Bonsai data model [A][SS2].
- **The Mononoke dispute, reported [SS1][SS2][PE]:** Mononoke's co-author says Scion's changeset and derived-data
  design closely copies Mononoke. He also says he was privately told of overlapping personnel. That last part is
  second-hand and unverified.

Anthropic states six design principles [A]. Each is a subsection below, followed by the parts that concern merging.

#### Clients are always online; the server is rich and the client is thin [A]

The server does history, blame, commits, merges and rebases. The client keeps a bounded object cache, lays out working
files and watches the filesystem. It "computes little but needs little data" (paraphrase of [A]).

#### Commits, rebases and merges happen on the server; nothing is pushed [A]

The cost of a commit scales with the size of the change, not the size of the repository [A].

#### Changesets, not trees, as the unit of work [A]

- **Confirmed [A]:** a changeset is an entry in a write-ahead log. It lists the files changed relative to its first
  parent, with content-addressed pointers to compressed blobs. Unlike a git commit, it does not point to a root tree.
- **Mononoke's Bonsai model, reported [SS1][SS2]:** Bonsai changesets work this way too. They are cheap to write and
  push, but poor for diffs, so a git-like tree is rebuilt asynchronously as derived data.

#### Derived data through one generic mechanism [A]

- **Confirmed [A]:** blame, path history, commit-graph skip lists, copy detection and path-based file search are all
  derived data.
  - Each type is defined recursively from its parents' values.
  - Each type is computed eagerly or deferred, chosen per type.
  - Each type is hidden behind the server API, so it can be changed without changing clients.
- **Mononoke, reported [SS1]:** Mononoke has eight such indexes, and adding one is "relatively cheap".

#### Refs are few, and moved by compare-and-swap [A]

- **Confirmed [A]:** a ref moves by a compare-and-swap on a single Spanner row, separately from creating changesets.
- **Confirmed [A]:** refs are discouraged except for main and release branches. Global state that every server must
  agree on is a scaling problem.

#### Everything is content-addressed, immutable and horizontally scaled [A]

- **Confirmed [A]:** there is no full copy of the repository anywhere, not even on the server. There are no packfiles
  and no repository maintenance.
- **Confirmed [A]:** any server can cache any object without coordination.
- **Confirmed [A]:** three tiers answer identical RPCs:
  - a daemon per node, shared by every job on that node;
  - regional caches;
  - authoritative servers.
- **Confirmed [A]:** each tier keeps a cache hit rate above 99 %.

#### A fetch protocol that asks only for what is wanted [A]

- **Confirmed [A]:** a client starts from a root tree and requests the missing trees recursively, then the blobs.
  Negotiation covers only what the client wants, not what it already has.
- **Confirmed [A]:** transfers are resumable. Sparse and virtual checkouts need no special support.

#### The working copy is optional; rich server APIs replace it [A]

- **Confirmed [A]:** CI can ask the server for diffs and write through the API.
- **Confirmed [A]:** automated bisect and revert pipelines rely on this "cheap, programmatic access".

#### The merge queue without a global lock [A]

This is the part closest to Samuel's question.
- **Confirmed [A]:** Anthropic says a proper merge queue "doesn't make much sense at agent scale". It could not keep
  the usual global repository lock.
- **Confirmed [A]:** Anthropic relies instead on **post-merge and pre-deploy automated testing**. It accepts that
  concurrent changes may conflict, because Claude "can typically fix these conflicts faster than humans can even
  identify them".
- **Not in the sources:** Anthropic does not say how the queue orders or batches changes, nor how "landing in bulk"
  works [A].

#### Semantic approval rules and directory permissions [A]

- **Confirmed [A]:** Antique can express rules that tell comment-only changes from sensitive logical changes, so human
  review goes where it matters.
- **Confirmed [A]:** reviewers look at a change's intent more than at each line.
- **Confirmed [A]:** Scion has repository-level and directory-level permissions.

#### Agents run the system [A]

- **Confirmed [A]:** "superfan" Claude instances each watch one component (the daemon, the cache, the Antique merge
  queue) through telemetry and logs.
- **Confirmed [A]:** Scion has hermetic simulations and fuzzing.
- **Confirmed [A]:** engineers' main job was often to say no to agent patterns that break core constraints. One example
  is scanning commit logs by brute force instead of querying the review tool.

### 1.3 The results (as Anthropic reports them) [A]

- The infrastructure is about 200 times smaller in CPU and memory than the git mirrors were.
- CI and research checkouts take seconds instead of minutes, two orders of magnitude faster.
- CI gained 25 % CPU capacity.
- Neither clients nor caches need maintenance.
- **Scope, confirmed [A]:** Anthropic says Scion is not a general git replacement and will not be released. It hopes
  git platforms adopt server-side RPCs, new server designs and new fetch protocols.

### 1.4 What the velocity actually rests on (inference)

Read together, the sources say the 30,000 a day did not come from a faster merge check. They came from three things:
- **Removing work from each merge.** There is no push. The commit is server-side and costs the size of the change. The
  ref moves by one compare-and-swap.
- **Removing serialization from landing.** There is no global lock. Testing happens after the merge and before deploy.
  Conflicts are repaired forward by agents.
- **Moving every expensive question into precomputed, cacheable data.** Derived data and content-addressed objects
  serve tens of millions of checkouts from caches.

The safety that a pre-merge queue used to give was moved to two other places: the deploy gate and fast automated
revert or fix.

---

## 2. Prior art compared

| System | Unit of change | How main stays good | Conflicts | Source |
| --- | --- | --- | --- | --- |
| **Google Piper / CitC** | a change on one trunk; branches mainly for releases | code review (Critique), presubmit, then continuous testing after submit | ordinary text conflicts, resolved before submit | [WP], [TAP] |
| **Meta Sapling / Mononoke / EdenFS** | Bonsai changesets on the server; stacks of small commits on the client | server-side rebase on push ("pushrebase") and a landing service | deferred conflicts in stacks (`sl restack`); server rebases what does not touch the same files | [FB], [SAP], [SAPS], [SS1], [MR] |
| **Uber SubmitQueue** | a diff | every change built against every outcome of the changes ahead of it (speculation) | "conflict" means overlapping build targets, not a git conflict | [UB] |
| **GitHub merge queue** | a PR | a temporary branch of base plus the PRs ahead; groups of 1–100; 1–100 concurrent builds | a failing PR is removed and the rest rebuilt | [GH] |
| **GitLab merge trains** | an MR | a pipeline on the merged result of all MRs ahead; up to 20 in parallel by default | a failure drops the MR and restarts the ones behind it | [GL] |
| **bors / the not-rocket-science rule** | a PR | test the merge before main moves; one at a time | the merged result is what is tested | [BORS], [JS] |
| **Jujutsu (jj)** | a change with a stable change id; each rewrite is a new commit id | not a merge queue | conflicts are stored in commits as data and resolved later; descendants are rebased automatically; every operation is logged and undoable; lock-free concurrent operations | [JJC], [JJO], [JJG] |
| **Pijul** | a patch on a graph of lines | not a merge queue | patches commute; a conflict is a state of the graph, not a failed operation; Pijul calls itself a CRDT | [PJ] |
| **Cursor's git service** | a push as a WAL entry in object storage | linearizable pushes; compare-and-swap on object storage | a compare-and-swap failure means refetch, rebase and retry | [CU] |

What each system does for the same problems:

- **Google Piper / CitC.**
  - In 2016 Piper held about 2 billion lines in 9 million files, with 16,000 human changes and 24,000 bot commits a
    day [WP].
  - CitC overlays a developer's changes on the whole repository through FUSE. Local copies hold fewer than ten files
    on average [WP].
  - Piper runs on Spanner across ten data centers [WP].
  - Google's TAP paper says testing every change on its own became infeasible at that scale. Its answer is to control
    the test load and report how fresh changes affect quality [TAP].
  - Google is the clearest earlier case of testing after submit plus trunk-based development (*inference*, from
    [WP][TAP]).
- **Meta Sapling / Mononoke / EdenFS.**
  - Mononoke's goal is "thousands of commits every hour across millions of files" [MR].
  - EdenFS virtualizes the working copy [SAP], and a segmented changelog speeds up graph queries [SAP][FB].
  - Stacks: you amend mid-stack and the commits above are rebased; conflicts can be deferred [FB][SAPS].
  - Pushrebase rebases a push onto the current head on the server instead of rejecting it. This is shown only by the
    older Mercurial extension's history in the search results; the Sapling pages fetched do not describe Mononoke's
    landing [SAP][FB].
- **Uber SubmitQueue.**
  - SubmitQueue keeps main green by building speculatively on the possible outcomes of the changes ahead [UB].
  - A conflict analyzer splits changes into independent ones (disjoint build targets, any order) and conflicting ones
    (speculated) [UB].
  - The later "bypass" lets a fast change land ahead of a slow one when every path through both was already tested.
    It cut the P95 wait by 74 % [UB].
- **Merge queues in general (GitHub, GitLab, bors, Jane Street).**
  - They test the merged result, not the branch [GH][GL][BORS].
  - They scale by batching and by speculating in parallel [GH][GL][JS].
  - Jane Street notes that a sequential bot takes at least m × n minutes, and that batching changes only the constants
    [JS].
- **Jujutsu.**
  - A change id survives rewrites [JJG].
  - Conflicts are first-class data, so a rebase never stops [JJC].
  - The operation log snapshots every view (refs, heads) and makes any operation undoable [JJO].
  - Concurrent operations need no lock: divergence is recorded, not prevented [JJO].
- **Pijul.**
  - Independent patches commute, so the order of application does not matter [PJ].
  - Conflicts are explicit states of the merged graph [PJ].
  - This is the closest prior art to theOS's Loro docs (*inference*).

---

## 3. The key ideas, distilled

1. **Land first, gate the deploy (no global lock).** The pre-merge queue that serializes everything is replaced by
   checks after the merge and before deploy, plus fast repair forward [A]. Throughput is no longer bounded by
   one check at a time. Safety moves to the deploy gate and to automated revert.

2. **The server owns history and does every write.** Commits, merges and rebases are server-side, and nothing is pushed
   [A]. A merge costs the size of the change, so landing is cheap enough to do tens of thousands of times a day.

3. **Changesets as deltas over content-addressed blobs.** A change is a small log entry naming the changed files' blobs
   [A][SS2]. Writing never touches the whole tree. Trees, diffs and history are built later as derived data.

4. **Derived data, one generic mechanism, keyed by version.** Every expensive question (blame, history, search, graph
   ancestry) is an index defined recursively from the parents' values, computed eagerly or lazily, and cached by
   immutable key [A][SS1]. New questions are new indexes, not new client code.

5. **Few refs, each moved by one compare-and-swap.** Only main and the release branches are shared mutable state. Each
   moves atomically on one row [A]. Everything else is immutable and cacheable anywhere.

6. **Partition the check by what a change touches.** Changes on disjoint build targets are independent and land in any
   order. Only overlapping ones need ordering or speculation [UB]. Batching and parallel speculation then multiply
   throughput [GH][GL][JS].

7. **Conflicts as data, not stops.** jj and Pijul record a conflict in the result and let it be resolved later [JJC][PJ].
   Anthropic does the same operationally: a concurrent conflict is a new task for an agent, not a blocked queue [A].

8. **Semantic review rules and ownership.** Approval depends on what kind of change it is (comment-only or logic). Access
   is per directory [A]. Humans review intent, not lines.

9. **Clients ask the server, not a checkout.** Rich APIs (diff, history, blame, write) let most jobs skip the working
   copy. Fetches ask only for the wanted objects, through tiers of identical caches [A].

10. **An operation log and automated bisect/revert.** Every movement of a ref is recorded and undoable [JJO]. Bisect and
   revert run as pipelines over the server's API [A], which is what makes "land first" safe.

---

## 4. Mapping to theOS

### What theOS has today (read from the code and intents)

- **Blobs:** immutable, named by BLAKE3, in iroh-blobs. See `App/theDB/src/lib.rs` and intent 0049.
- **Docs:** Loro documents. Each commit exports a **full snapshot** as a blob and moves a tag (`doc/<id>` on main,
  `branch/<b>/<id>` on a branch). See `commit_on` in `lib.rs` and intent 0053.
- **Branches:** sets of tags. A read falls through to main.
- **The root:** a tag naming the root doc.
- **Proposals:** a doc of kind `proposal` lists a branch's doc versions. `merge` (in `App/theDB/src/source.rs`) does
  the following:
  1. takes a file lock (`merge.lock`, one merge at a time);
  2. merges the proposal's versions with main's on a trial branch;
  3. writes every source tree the proposal touches to a fresh view;
  4. runs the tree's `check` commands (cargo build and test);
  5. on a pass, brings the trial's versions into main doc by doc;
  6. keeps the last 400 lines of output in the proposal.
- **Measured (intent 0051):** a merge's whole check took 51 to 147 seconds. Content-only merges check nothing.
- **Intents 0054 and 0056 decide the direction:**
  - core plugins built from git and loaded by hash;
  - WASM modules as blobs, sandboxed, wired through hashed WIT gateways;
  - docs as the single source of truth for every mutable pointer;
  - a refs doc per branch;
  - one root pointer;
  - the kernel started by a root hash.
- **Intent 0053 (approved, not built):** moves docs into SQLite as Loro *updates* (deltas) with indexed fields.

**What the CRDT changes (inference).**
- In git, Mononoke or Scion, a textual conflict is the first and cheapest safety: it stops a merge that touched the
  same lines. In theOS, a Loro merge never fails. Two concurrent edits to one line both survive, interleaved. Two
  writes to one map key resolve by last-writer-wins, silently. A tree map gains both files.
- So theOS loses the *signal*, not just the stop. A merge can produce code that does not build (0051 says this in
  `source.rs`). It can also produce a world doc whose sun elevation is one agent's value while the other agent's is
  gone, with no error at all.
- Three things must stand where the conflict stood:
  - **checks on the merged result**, which theOS has for source trees;
  - **typed docs with checks per kind**, which theOS lacks for content;
  - **detected concurrency plus ownership**, which theOS lacks entirely.

### The ideas, one by one

**1. Land first, gate the deploy.**

- **Has:**
  - Pre-merge checks of the merged result, one at a time under a lock.
  - The root pointer and the kernel started by a root hash (0056). These are a deploy gate already, if they are used
    as one.
- **Lacks:**
  - Throughput. At 51–147 s per merge, one lock caps theOS at roughly 25–70 merges an hour, whatever the number of
    agents (*inference*, from 0051's measurement).
  - Any notion that "main" and "what boots" can differ.
- **Build it:** split the one pointer into two, both values in one small **pointers doc** owned by the orchestrator:
  - `main`: names a version of main's refs doc. It moves on every accepted proposal after cheap checks (below).
  - `green`: names an older or equal version that has passed the full check (cargo build and test for touched trees,
    the frame gate for touched worlds). The kernel boots `green` by default; `main` is opt-in for testing.
  - The full check runs behind `main` on its own clock. It takes the latest `main`, checks it, and advances `green`.
    So many proposals are checked in one run, a batch for free.
  - On failure it bisects over the versions of main's refs doc between `green` and the failed head. Each step is a
    checkout by hash, and the shared cargo target makes it incremental. The culprit proposal becomes a new task: an
    agent fixes forward, or the orchestrator reverts it (see idea 10).
  - This is Anthropic's post-merge plus pre-deploy testing [A], with Google's continuous testing after submit [TAP],
    in theOS's own terms.

**2. The owner does every write.**

- **Has:**
  - A single store owner on the device. Other processes talk to it over iroh RPC (`lib.rs`).
  - Agents commit on branches without pushing anything.
  - Merges happen in the owner's store.
- **Lacks (inference, from reading `commit_on`):**
  - **Atomicity.** `commit_on` reads the head, imports it, writes a snapshot and sets the tag, with no
    compare-and-swap. Two processes committing the same doc on main at once can each read the same head, and the
    second `set` drops the first's change from the head. The change still exists in its blob, but nothing names it.
  - **A guard on main.** The merge lock guards `merge` only. A direct `commit_on(None, …)` during a check lands on main
    unchecked, and `merge_into_main` then merges into it.
- **Build it:**
  - Only the orchestrating owner writes main's refs doc.
  - Every pointer move is a compare-and-swap: "set main to H₂ if it is H₁", done in the owner (or, after 0053, in one
    SQLite transaction).
  - Agents never commit on main. They commit on their branch and propose.

**3. Changesets as deltas over blobs.**

- **Has:** blobs by hash. Each doc version is a full Loro snapshot.
- **Lacks:** the delta. Every commit exports the whole doc. 0053 measured 1.8 GB, mostly builds and "full snapshots of
  docs that changed by a line".
- **Build it:**
  - 0053 *is* this idea. Store each commit as a Loro update (Loro's own changeset: the ops since the previous version,
    keyed by version vector), with a snapshot every N updates.
  - A theOS "changeset" is then one row: (doc id, parent frontiers, update bytes, BLAKE3 of the resulting snapshot).
  - A proposal names, per doc, the frontiers it brings, not a full snapshot.
  - The hash of the resulting state is still computed and stored, so pins by hash hold (0053's "names stay content
    addressed").

**4. Derived data, keyed by version.**

- **Has:**
  - One case already: bakes cached by the hash of their inputs (0049 deliverable 3).
  - `theDB ls` instead opens every doc's snapshot (0053).
- **Lacks:**
  - Indexes in general.
  - A record of what references what.
- **Build it:** one generic table `derived(kind, version_hash) → blob hash` (a row in SQLite after 0053). A
  `Derive` trait computes a kind from the doc at that version and the derived values of its parent versions, as in
  [A]. The first kinds:
  - `meta`: kind, name and typed fields, for `find`.
  - `refs-out`: the doc ids and blob hashes a doc version names. From it come "what references this blob", pruning,
    and "which worlds use module M".
  - `touches`: the set of trees, worlds and modules a proposal reaches. This feeds idea 6.
  - `blame`: per text doc, Loro's op ids mapped to proposals.
  - `frame`: the gate pictures of a world at a root version. Expensive, so deferred.
  - Each kind is computed eagerly or lazily by a field of the kind's own doc. Being immutable by key, each is cached
    forever and later synced like any blob.

**5. Few refs, each moved by compare-and-swap.**

- **Has:**
  - Many tags: one per doc on main, one per doc per branch, one per branch, and the root.
  - 0056 already flags that a merge moves many tags non-atomically and that main has no history.
- **Lacks:** the single atomic pointer.
- **Build it:**
  - Exactly as 0056 decides: one root pointer, the only mutable thing outside a doc, naming a version of the
    **pointers doc** (`main`, `green`, the host manifest).
  - `main` names a version of main's refs doc (doc id → head).
  - A merge is one commit to main's refs doc plus one compare-and-swap of the root.
  - Branch refs docs are owned by their agent and never shared state, which matches Anthropic's "refs only for main
    and releases" [A].
  - **One warning (inference).** A refs doc must not be merged as a CRDT. If two writers update main's refs doc
    concurrently, Loro's last-writer-wins on a map key would silently pick one head per doc and might mix two merges
    half and half. So main's refs doc has exactly one writer (the orchestrator), and its moves are serialized by the
    compare-and-swap, not by Loro.

**6. Partition the check by what a change touches.**

- **Has:** `merge` finds the trees a proposal touches and checks only those. A proposal that touches no tree checks
  nothing.
- **Lacks:**
  - Parallelism across independent proposals.
  - Checks for content.
- **Build it:** classify each proposal by its `touches` set and by the kinds of its docs.
  - **Disjoint sets** check in parallel and land in any order, as Uber's conflict analyzer does [UB]. Two agents
    editing two different WASM modules, or a module and a timeline, never wait on each other.
  - **Cost classes:**
    - *content docs* (worlds, configs, timelines, sun, wind): schema validation of the merged doc against its kind's
      schema doc, in milliseconds;
    - *modules*: compile the WASM, check that its `describe()` gateways match the host's (0054), and run its `init`
      and `generate` under the sandbox's time and memory limits, in seconds;
    - *core plugin source* (git, per 0054): the full cargo check, in minutes.
  - Only the last needs the slow lane. Under 0054, most of theOS's change volume (worlds, modules, configs) moves to
    the fast classes. That, more than any queue design, is what would raise theOS's velocity (*inference*).
  - **Overlapping proposals in the slow lane** are batched: check main plus all queued proposals as one trial branch.
    On failure, split the batch and bisect [GH][GL][JS].

**7. Conflicts as data, not stops, with the CRDT.**

- **Has:**
  - Merges never stop. A refused proposal keeps the compiler's output (0051). That is already "a conflict as data" for
    builds.
- **Lacks:**
  - Detection of *concurrent writes to the same thing*, the signal a textual conflict used to give.
- **Build it:** Loro gives this precisely. Each proposal records, per doc, the **base frontiers** the agent started
  from. At merge, for each doc, compare the base with main's current version vector.
  - If main has not changed the doc since the base, the merge is a fast-forward. Nothing concurrent happened.
  - If main changed it, compute the containers and keys both sides wrote since the base (Loro's diff between versions).
    - Disjoint writes merge with confidence.
    - Overlapping writes (the same map key, the same text range, the same tree path) make an **overlap record** in the
      proposal doc: which keys, both values, the losing value under last-writer-wins.
  - An overlap record does not block the merge. Like a jj conflict [JJC], it is data. It routes the proposal to a
    stricter class: the full check, plus a task for the owning agent to confirm or fix forward.
  - This replaces the textual conflict with something better informed: theOS knows exactly which keys collided, which
    git does not for semantic collisions.

**8. Semantic rules and ownership.**

- **Has:** kinds in each doc's `meta`. One orchestrator (the master session) who decides.
- **Lacks:** rules per kind; ownership; permissions.
- **Build it:**
  - **Typed docs.** Each kind has a schema doc: fields, types, ranges, which keys are last-writer-wins scalars, which
    are text, which are lists. This is 0054's `describe()` for modules, generalized to every kind.
  - **Landing rules,** themselves a doc owned by Samuel. For example:
    - a timeline key or a config value inside its range lands after the schema check;
    - a module lands after the sandboxed run;
    - a core plugin, a gateway (WIT) or the pointers doc needs the orchestrator's or Samuel's approval.
    These are Antique's semantic approval rules [A], expressed as data.
  - **Ownership by lease.** When the orchestrator hands an agent a task, it records in the agent's branch doc the doc
    ids (or kinds, or trees) the agent may change. A proposal outside its lease is refused before any check. Two
    agents with disjoint leases cannot collide, which makes most overlap records impossible by construction.
  - **The sandbox narrows what a merge can break.** A module cannot touch the GPU, files or the network (0054), so a
    bad module merge breaks at most that module, and the host stops it. The worst case of "land first" for a module is
    a missing sky, not a corrupted store.

**9. Ask the store, not a checkout.**

- **Has:**
  - Views (folders) for source, needed by cargo.
  - The `theDB` command over the owner's RPC.
- **Lacks:**
  - A query API.
  - Reads of history and blame without a view.
- **Build it:**
  - Agents editing content or modules never write a folder. They call `doc`, `find`, `history(id)`, `diff(id, a, b)`
    and `blame(id)` (derived data) over the owner's RPC.
  - Views stay only for core plugin source in git.
  - For sync between devices later, iroh-blobs already does what Scion's fetch does [A]: it asks for wanted hashes
    only, streams verified, and is resumable. The owner process plays scion-daemon's role, one per device
    (*inference*).

**10. An operation log, bisect and revert.**

- **Has:** every doc version kept. But main has no history of its own (0056).
- **Lacks:** an operation log, bisect and revert.
- **Build it:**
  - The pointers doc's history *is* the operation log [JJO]. Each `main` move records the proposal, the agent, the
    check class and its result.
  - "Undo the last merge" sets `main` back to the previous refs doc version, by compare-and-swap.
  - "Revert proposal P" while keeping later ones goes like this:
    1. for each doc P touched, check out the doc at its pre-P version;
    2. compute the diff from P's result back to it;
    3. apply that diff to main's current head as a new commit on a revert branch;
    4. propose the revert branch like any other.
    This is *inference*: Loro supports checkout and diff between versions, but the exact revert operation must be
    tested.
  - Bisect runs over `green..main` as in idea 1.

### The flow, put together (inference)

1. The orchestrator opens a task.
   - It makes the branch and its refs doc.
   - It writes the lease (the doc ids, kinds or trees the agent may change).
   - It records the base: the version of main's refs doc the agent starts from.
2. The agent works on its branch. It commits Loro updates and reads through the API.
3. The agent proposes. The proposal doc holds the docs and frontiers the branch brings, the base frontiers, and the
   note.
4. The orchestrator classifies the proposal: lease check → `touches` → overlap records → cost class.
5. **Fast lanes:** content and modules, in parallel for disjoint `touches`. On a pass, the orchestrator commits main's
   refs doc and moves the root by compare-and-swap. `main` advances.
6. **Slow lane:** core plugins, overlaps and protected kinds. Batched, checked, bisected on failure.
7. **The green checker** follows `main`. It runs the full check and the frame gate, and advances `green`, which the
   kernel boots.
8. **On a red:** the checker bisects, names the proposal and opens a fix-forward or revert task.

---

## 5. Risks and open questions

- **Scale mismatch.** Anthropic's design answers 25 million checkouts and 100 GB of history [A]. theOS today is one
  device, 126 docs and 1.8 GB (0053). The ideas that matter now:
  - the two pointers (main and green);
  - check classes by kind;
  - parallel lanes for disjoint changes;
  - compare-and-swap;
  - overlap records.
  Tiers of caches and fetch protocols matter only once devices sync.
- **"Land first" needs fast, reliable repair.** Anthropic leans on Claude fixing conflicts quickly and on automated
  bisect and revert [A]. In theOS, if `main` is red for hours and agents branch from it, they build on broken ground.
  Open question: do agents branch from `green` or from `main`? Branching from `green` is safer and costs more overlap
  records.
- **Silent last-writer-wins.** Without base frontiers and overlap records, two agents' values for one parameter
  resolve silently. This is the CRDT's sharpest risk for content.
- **Interleaved text.** Two agents editing one code region concurrently can produce interleaved text that compiles and
  is wrong. The check catches what does not build, not what is wrong. Leases on source docs are the real guard.
- **Refs docs as CRDTs.** If main's refs doc is ever written by two writers, Loro will merge it. Main's pointer must
  stay single-writer behind a compare-and-swap. This should be enforced in code, not by convention.
- **The non-atomic write path today.** `commit_on`'s read-then-set without compare-and-swap, and direct commits to main
  during a merge's check, are inferred from reading the code. Both need a test before they are trusted or fixed.
- **Storage growth at velocity.** Full snapshots per commit times many merges a day will grow `DATA/` fast. 0053
  (updates plus periodic snapshots) is a precondition, as is pruning what no pinned root reaches.
- **The cost of checks.** The cargo check is minutes. Under 0054 it applies only to core plugins in git, so it is
  rare. Open question: does a module check compile WASM inside theDB's owner, or in a sandboxed worker?
- **Typed docs need schemas everywhere.** Every kind needs its schema doc before its fast lane is safe. Until then,
  untyped content should take the strict lane.
- **Attribution.** Scion's ideas largely come from Mononoke [SS1][SS2][A]. theOS should cite Mononoke, jj, Pijul and
  Uber, not only Anthropic, when it borrows them.
- **Unknowns in the sources.**
  - How Antique orders, batches or "lands in bulk" is not described [A].
  - The 3,000-staff, 10-to-15-agents figure is second-hand and inconsistent [PE].
  - Mononoke's landing (pushrebase) is not described on any page fetched here.

---

## 6. Sources

| Tag | URL | Used for |
| --- | --- | --- |
| A | https://www.anthropic.com/research/redesigning-source-control (and the same article at https://www.anthropic.com/engineering/redesigning-source-control) | the primary source: the numbers, the six principles, changesets, derived data, compare-and-swap refs, tiers, fetch, no global-lock merge queue, approval rules, results, scope, the Mononoke footnote |
| PE | https://blog.pragmaticengineer.com/the-pulse-anthropic-builds-its-own-source-control-system/ | reported: Rust/Go/React, Spanner and GCS, team split, staff and agents per person, migration status, the Mononoke dispute, new vendors |
| SW | https://simonwillison.net/2026/Oct/13/redesigning-source-control-at-anthropic/ | the daily-merge chart (peak 30,401 on 9 Sep), Antique change requests replacing PRs, no offline support (Nick G. on HN, reported) |
| — | https://www.reddit.com/r/technology/comments/1x5lvf5/anthropic_moving_to_inhouse_version_control/ | **not fetched** (refused, also via old.reddit.com); nothing used |
| SS1 | https://sunshowers.io/posts/anthropic-mononoke/ | Bonsai changesets and derived data in Mononoke; the claim that Scion mirrors them |
| SS2 | https://sunshowers.io/posts/anthropic-mononoke-2/ | the follow-up: Scion changeset vs Bonsai changeset, the attribution added, server-side rebase as Mononoke's |
| MR | https://github.com/facebook/sapling/blob/main/eden/mononoke/README.md | Mononoke's stated goal (thousands of commits an hour) |
| SAP | https://sapling-scm.com/docs/scale/overview/ | EdenFS, Mononoke, segmented changelog |
| SAPS | https://sapling-scm.com/docs/overview/stacks/ | stack editing (amend, fold, split, absorb) |
| FB | https://engineering.fb.com/2022/11/15/open-source/sapling-source-control-scalable/ | stacks, `sl restack`, deferred conflicts, segmented changelog |
| — | https://www.mercurial-scm.org/pipermail/mercurial-devel/2014-December/064722.html (via search) | server-side rebasing (pushrebase) lineage, search snippet only |
| CU | https://cursor.com/blog/git-at-any-scale | a git service as a WAL in object storage, compare-and-swap pushes, 120–300 pushes/s |
| WP | https://en.wikipedia.org/wiki/Piper_(source_control_system) | Piper and CitC scale, Spanner, trunk-based development (citing Potvin & Levenberg 2016) |
| — | https://cacm.acm.org/research/why-google-stores-billions-of-lines-of-code-in-a-single-repository/ | **failed (403)**; the research.google abstract page was fetched instead and held no detail |
| TAP | https://research.google/pubs/taming-google-scale-continuous-testing/ | why per-change regression testing became infeasible at Google |
| UB | https://www.uber.com/blog/bypassing-large-diffs-in-submitqueue/ | SubmitQueue: conflict analyzer by build targets, speculation, the bypass, −74 % P95 wait |
| — | https://lethain.com/static/blog/2019/eurosys19uber.pdf | **failed (too large)**; its abstract seen through search results only |
| GH | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue | GitHub merge queue: temporary branches, groups, concurrency, failure handling |
| GL | https://docs.gitlab.com/ci/pipelines/merge_trains/ | GitLab merge trains: merged-result pipelines, 20 in parallel, restart on failure |
| BORS | https://bors.tech/essay/2017/02/02/pitch/ | testing the merged result before main moves |
| JS | https://blog.janestreet.com/making-never-break-the-build-scale/ | the not-rocket-science rule, m × n cost, batching, hierarchical landing |
| — | https://graydon2.dreamwidth.org/1597.html | **failed (504)**; the rule as stated by Jane Street and in search snippets instead |
| JJC | https://docs.jj-vcs.dev/latest/conflicts/ | conflicts stored as data in commits, deferred resolution |
| JJO | https://docs.jj-vcs.dev/latest/operation-log/ | the operation log, views, undo, lock-free concurrent operations |
| JJG | https://docs.jj-vcs.dev/latest/glossary/ | change id vs commit id, operation, view |
| PJ | https://pijul.org/manual/theory.html | patch commutation, conflicts as graph states, Pijul as a CRDT |
| — | https://loro.dev/docs/concepts/version_vector | **failed (403)**; Loro's version vectors and frontiers as used in theDB's code, not from this page |

**theOS files read:**
- `Intents/0049-docs-and-blobs.md`
- `Intents/0051-source-in-avendb.md` (the measured check times, the known gaps)
- `Intents/0053-docs-in-sqlite.md`
- `Intents/0054-modules-as-blobs.md`
- `Intents/0056-thedb-the-heart.md`
- `App/theDB/src/lib.rs` (`commit_on`, `merged`, `merge_into_main`, tags)
- `App/theDB/src/source.rs` (trees, views, `propose`, `merge` and its lock)
