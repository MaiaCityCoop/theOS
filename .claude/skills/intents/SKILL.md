---
name: intents
description: How work is done in TheOS. Use whenever something is to be made, changed or fixed in this repository, whenever Samuel asks for work, mentions an intent, a work package, a changelog, a story or a devlog, or asks what is open. Every change belongs to an intent (Intents/NNNN-slug.md); this skill says how to open one, move it through idea, define, build, propose, story and archived, keep its changelog, trail and todo, and spawn its story in Stories/. In build it also says how one master session coordinates every task of the intent across our machines and sessions: roles, the GPU lock, the integration train, the standing rules and merging.
---

# Intents

An **intent** is one work package and its changelog at the same time: one Markdown document in
`Intents/`, `NNNN-slug.md`, that is written as the work happens. Its states are its sections; a
section is filled when the intent reaches that state and not before. Nothing is changed in this
repository outside an intent.

Copy `Intents/TEMPLATE.md` to open one. The next number is one more than the highest in the folder.

## The states

| State | Who writes | What goes in its section | It ends when |
| --- | --- | --- | --- |
| **Idea** | the agent, from the human's words | What is wanted and why. The human's own words where they exist, tidied of typos only. | the human says go on |
| **Define** | the agent | What done looks like: the deliverables, and for each a **check** (how it will be shown to be done: a command, a page to open, a number to read). What is out of scope. **And the architecture pass** (below) over everything the intent will touch, with its **code gates** as checks, **and the 10 % gate** (below): what this intent makes at least 10 % faster or better. This is the spec and the delivery gate in one. | **the human approves it.** Do not build before. If the human asked for the work outright and the definition holds no surprise, say so in one line and build. |
| **Build** | the agent | Notes while building: decisions taken, what turned out different from the definition and why. The code gates hold at every merge. | every deliverable exists |
| **Propose** | the agent | What is delivered and where to look at it; each check with its result as it really was (passed, failed with the output, not run and why), the code gates' and the 10 % gate's numbers among them; known gaps. The story folder is spawned now (below). | **stop.** The human decides. |
| **Story** | the agent, after the human's yes | The work as a story for the devlog: what the human wanted, what the agents made, what went wrong on the way, in beats. Link to the story folder. | the story plays in the game |
| **Archived** | the human's decision, written down by the agent | `accepted` or `rejected`, the date, the reason in a line. | it is the end |

`state:` in the front matter always names the current state; `outcome:` is set only on archiving.
Only the human approves a definition, accepts or rejects. An intent may go back (propose to build
on a rejected check); say so in the changelog.

## The end of the document

Under the states, three running sections, kept current from the first day:

- **Todo**: a checklist of what is left. Tick, do not delete.
- **Changelog**: one entry per request cycle with the human, newest last: the date, what was asked,
  what was delivered, what was good, what broke or is not there yet. Facts only: nothing that did
  not happen, no result that was not seen. This is the raw material of the story.
- **Trail**: the audit trail, a table of the commits made for this intent: date, short hash, what
  it did. Code is committed first, then the trail row naming it.

## Commits

Every commit made for an intent ends its message with `Intent: NNNN` (before the co-author line).
One commit per request cycle where that is natural, so stages can be checked out again.

## Define: the architecture pass

Every intent leaves the system slimmer, leaner and cleaner than it found it. That is not a refactor
saved for later: it is part of every intent, planned at Define and held at every merge. The pass
covers everything the intent will touch, build or plan, and the code around it that does the same
job.

1. **Read what is there.** The current state of that part of the repository: its modules, what
   calls what, which functions do the same thing under different names, which modes, settings and
   flags exist, what is legacy or glue kept "just in case". Write it down in Define, short.
2. **Ask whether it is the first-principles form.** What is the invariant this part must keep, and
   is the code the simplest thing that keeps it? Where is there a second path, a special case, a
   copy, a hand-set number, a layer that only passes things through?
3. **Take away until something breaks.** Remove, merge and simplify as far as it goes: delete
   copies, special cases, legacy paths and glue; fold similar functions into one. Run the checks
   after each cut. The first thing that breaks shows what was really needed.
4. **Put back only what broke, in the best form there is.** Before choosing that form, research it:
   current best practice and the state of the art (papers, conference talks, the docs and source of
   the engines and libraries that solved it, recent releases), on the web, not from memory. Write
   the sources, the options weighed and the pattern chosen, with the reason, into
   `research_notes/NNNN-topic.md`, and cite it in Define.
5. **Set the code gates.** The numbers below, measured now on `main` over the touched area, with
   the target the intent commits to. They are checks like any other, and every merge holds them.

| Gate | Measure | Must |
| --- | --- | --- |
| **Size** | lines of code in the touched area (`git diff --shortstat main...`, code only, not notes) | go down, or Define says why the new capability needs each line |
| **Copies** | duplicated lines and clones in the touched folders (`bunx jscpd --min-tokens 50`) | go down; no new clone |
| **Similar functions** | functions doing one job under several names (the clones above, and reading) | merged into one |
| **Spaghetti** | cyclomatic complexity per function (`bunx eslint --rule 'complexity: [error, N]'`, ad hoc), and nesting | no touched function over the ceiling Define sets; the mean goes down |
| **Dead and legacy code** | unused files, exports, flags, branches and glue (`bunx knip`; reading) | none left in the touched area |
| **Coupling** | import cycles (`bunx madge --circular`) | none |
| **Settings** | modes, hand-set thresholds, switches and repeated config | the count goes down, toward one source of each |
| **Dependencies** | packages | no new one without a reason in Define |

These gates measure what a change does to the code, so they are measured against `main` by
design. That is not the picture gate: a picture is judged on its own, never against `main`. They
are one command, `bun tools/health.js --base origin/main` (in `TheGame/`), which measures the
touched folders here and at the base and fails on anything worse. CI runs it on every pull request.

## Define: the 10 % gate

Every intent also makes the system **faster and better**, not only cleaner: each one moves the
measures of what it touches **at least 10 %** in the right direction, and none of the others the
wrong way. Improvement is part of every intent, compounding, not a phase someday.

At Define, measure the baseline on `main` on the GPU machine, and write the target the intent
commits to. At Propose, measure again and write both numbers. The measures, for the game:

| Measure | What | Tool | Better is |
| --- | --- | --- | --- |
| **Rendering** | GPU ms a frame per bench view and per class; in motion the p99 frame and the frames over 16.7 ms | `gate.js bench`, `gate.js paths` | lower |
| **Startup** | the world come and settled where it starts, cold and warm; the first frame | `gate.js paths` ("settled where it starts"), `gate.js stills` | lower |
| **Boot and load** | the shader code compiled until settled; the bytes loaded before the first frame | `gate.js compile`, the build's output | lower |
| **Memory** | the browser's peak, and each class against its budget | `gate.js paths`, `bench` | lower |
| **Quality** | FLIP against the branch's own truth (mean and p99 tile); `real` against the photos per view class; the worst pop in motion | `gate.js diff`, `real`, `motion` | lower (closer) |

The website and other parts have their own measures of the same kinds (load, first paint, bytes);
Define names them where the intent touches them.

- **10 % at least, on the measures of the area the intent touches.** Where an intent cannot move
  one of them (a docs-only intent, say), Define says why in a line, and that measure must not get
  worse.
- **No measure gets worse** anywhere: a faster frame bought with a worse picture, or the other way
  round, is not an improvement. A trade between them is the human's to decide, with the numbers.
- **The bars only rise.** The ceilings (`gate.js bench`) and ratchets (`real`) are lowered to what
  each merged intent reached, so the next intent starts from there.
- These are numbers compared with `main`, like the code gates. A picture is still judged against
  its own truth and the photos, never against `main`.

## Building: one master, many workers

Once an intent is in **Build**, one session coordinates all of its work, across every machine and
session we have. It drives on its own and comes to the human only for what only the human can do
(a password, a sign-in, `sudo`, money, approving a definition, accepting or rejecting) or for a
real trade-off the definition does not settle (say, more detail against 60 fps), with the numbers.

### Roles

- **The master** holds the plan (the Define table and the intent's own "Where we left off"),
  splits it into tasks, briefs the workers, gives out GPU time, reviews, and merges when the human
  has given it that for this intent. It keeps the intent's Build notes, changelog and trail, and
  writes "Where we left off" so another master could take over at any time. One master an intent.
- **A worker** takes one task: its own worktree and branch (`aven/NNNN-…`), its own dev server on
  its own port, a draft PR, marked ready when its checks are in. It reports to the master
  (`SendMessage`) with the PR, the numbers and what is open. It never merges. It never asks the
  human: it decides in the direction of the intent, writes the decision and why into the PR, and
  sends a real blocker to the master while it goes on with what it can do.
- A brief is complete in itself: the task, the files, the invariants to keep, the checks, what done
  looks like, whom to report to. The master relays between sessions that cannot reach each other.
- **One task, one session.** Every task runs in a code session of its own, never as a subagent
  inside another session, on one named machine below. It has its own worktree, branch and PR, so
  the human can open it, follow it and steer it. Its name says the intent, the task and the machine:
  `0038 upscale · avenMAIA MacBook Sam`. Subagents serve only read-only research or audits inside
  a session.

### Our machines and sessions

| Machine | What it does |
| --- | --- |
| **avenMAIA MacMini** (`aven-maia-mac-mini`, base M2, 8 GB) | The master. The **GPU gate**: every gate run, timing, reference render and train runs here, one at a time. At most two task sessions beside the master (its memory). |
| **avenMAIA MacBook Sam** (Samuel's MacBook, `samuel`) | Task sessions for coding, in parallel, CPU first. Its GPU for light functional checks only: one job at a time, at most 1920×1080, about half its GPU at most, never `?truth` 4K, paths, bench or motion. Stop at once if the machine gets slow: Samuel works on it. |
| **avenMAIA Claude Cloud** (claude.ai/code cloud sessions), where available | Self-contained coding or research with no GPU. They cannot message back: the master reads their branch. |

Sessions on different machines reach each other over Remote Control; a session that is not in
another's `ListAgents` goes through the master. A task's session is archived when its PR closes.

### The task board: the live state of every task

The master keeps one board for the intent, in its "Where we left off", always current. It updates
the board on every change of a task's state and answers "where are we" from it. A change to the
board alone merges at once, so the dashboard on `next` shows it within minutes.

| Task | Session | Machine | Branch · PR | State | Updated | Next |
| --- | --- | --- | --- | --- | --- | --- |
| the task, in a few words | its session's name | avenMAIA MacMini · MacBook Sam · Claude Cloud | `aven/NNNN-…` · #N | planned · coding · ready · on train N · merged · blocked (why) | date and time | the next step and who takes it |

A task is on the board from the moment it is planned until it is merged or dropped (and why);
merged rows move to the changelog at the end of the day. A task with no session yet says so; a
session with no task on the board is a mistake.

### Every machine busy

The master keeps every machine working and as little idle as it can. Idle time is planned away,
not waited out.

- **No session waits for a merge.** A task that builds on work not merged yet branches from the
  train's branch (or the PR it needs) and merges `main` in when that lands.
- **Every session has its next task** on the board before its current one ends, and gets its
  brief the moment it is free. A worker that finishes with nothing next tells the master at once.
- **The GPU is never idle while something waits to be measured.** The master keeps its queue
  filled ahead: the next train, quick checks, the gate's own jobs on `main`, diagnostics a worker
  needs. When a train is not ready, the GPU runs measurements that help the next one.
- **Each machine within its limits:** the avenMAIA MacMini's memory (at most two task sessions
  beside the master), the avenMAIA MacBook Sam's GPU at about half at most while Samuel works on
  it. Busy never means overloaded: a frozen machine is the most idle of all.
- The board shows what each machine is doing now; a machine with nothing on the board is a gap to
  fill.

### The GPU: one lock, one queue

- Every GPU run on a machine takes that machine's lock first (`~/src/github/MaiaCityCoop/.gate-lock`,
  made with `mkdir`, freed by a `trap` on any exit, the holder and the time written into it). One
  run a hold; never while building or editing.
- `.gate-next` beside it names who goes next. Nobody else takes the lock while it names someone
  else. The master writes it for its own runs and hands out turns in order; a worker asks the master
  for a turn (what, how long), never takes one.
- A lock whose holder is dead (its session idle or its process gone) may be freed by the master,
  after checking; nobody else breaks a lock.

### The integration train

Work is developed in parallel and tested together, once:

1. **Develop.** Workers code on the CPU and check what a CPU can (`bun tools/scale.js`, the builds,
   the checks that need no GPU). They do not take GPU turns for full gates.
2. **Cut off.** At a time the master names, every ready PR has the current `main` merged in, its
   conflicts resolved, its checks passing, pushed and marked ready.
3. **Train.** The master builds one branch, `main` plus every ready PR in order (`aven/NNNN-train-N`).
   A conflict only in the intent merges by union; a code conflict the master resolves by keeping
   both sides' meaning, or leaves that PR off the train and says why.
4. **One gate run** on the GPU machine: the views' stills and their reference, the per-class bench,
   the paths, motion. Every problem is put to its owner by class and view; only what cannot be put
   is found by halving the train.
5. **Fix and run again.** Owners fix at the root; a shorter run checks the fixes. What still fails
   leaves the train; the rest merges into `main` as one, exactly as it was tested.

### What every build is held to

- **The gate is the definition's checks, and a branch is judged on its own:** against its own
  reference, against photographs, against the budgets, in motion. Never against `main`: main is no
  reference, and before/after pictures are no gate.
- **Budget first.** Where the intent has hard performance gates, they hold at every merge: a ceiling
  for each class of the frame (as `gate.js bench` measures them) that a PR may not push past, and
  that only ever comes down until it meets its budget. Nothing new is added until the frame fits.
- **The root cause, from first principles, never a patch.** Name the invariant that is broken and
  restore it. A distance fade, a magic threshold, a fudge factor, a longer timeout or a retry is not
  a fix; a timeout or a retry may stand only beside the real fix, as a guard. A patch does not merge.
- **The code gates** from Define's architecture pass hold at every merge. Every PR leaves the code
  it touches simpler than it found it: fewer lines, copies, branches and settings, no new glue.
- **One source of truth, DRY, KISS.** One source, one measure, one path for each thing. No second
  mode of the same thing (a reference is the same pipeline with its measure at the limit), no
  hand-set setting unless it is physical or artistic, every GPU resource and dispatch sized from the
  device's own limits. A count of what still breaks this may only go down.

### Merging and deploying

- The master merges when CI is green and the train's gate holds, pinned to the head that was tested
  (`--match-head-commit`, the full SHA), with a merge commit: never a rebase, never a force-push.
  "No checks reported" is not green: wait until CI has reported and every check has passed.
- **Quiet CI: drafts while in progress, checked before every push.** A PR opens as a draft and stays one until its own
  checks pass; CI runs only on PRs marked ready and on `main`, so work in progress never mails a failure to everyone.
  `bun install` turns on the repo's hook in every clone (TheGame's `prepare` script: one place, no machine drifts): `pre-push` runs `tools/lint.js`
  and `tools/smoke.js` in seconds, so nothing is pushed that breaks without `vite build` seeing it. Only the master
  edits the intent's file; a PR's notes go in its body.
- **A train that fails on `main` is reverted at once**, so `next` goes back to the state before it.
  Its code comes back as one branch, `main` plus the revert of the revert (`aven/NNNN-unrevert-…`),
  where its faults are fixed at the root; it is the next train's first car. Until it lands, a branch
  that contains the train's commits merges that branch, never `main`: the revert would silently
  delete the train's code from it. The code gates measure a revert against the state it restores.
- A change outside CI's paths (`research_notes/`, `.claude/`) merges at once: no build, no deploy.
- `next` deploys itself after CI passes on `main`; the master checks `next.maia.city/version.json`
  names the merged commit, and that the game answers.

## The story

At **Propose**, spawn `Stories/NNNN-slug/` with two files:

- `story.md`: the story, told. Not a technical summary: a day of the series *"This is the story
  of how one million humans build their own solarpunk city, from the ground up. In just 16
  years."* It is a **dialogue between Samuel and Maia**: two voices, each speaking for
  themselves (never "Samuel told me"). It starts from the viewer who knows nothing: a city starts
  on a green meadow, with one tent; everything grows as we do, with citizens. It holds the hook
  (title, overlay, opening shot), the story in a few paragraphs, the film as a table (time,
  picture, who, line), the receipts (every number and quote, and where it is true), and what is
  still open. A link back to the intent and its changelog.
  - **Never say "aven", "AI" or "AGI"** in a story. She is Maia.
  - **Samuel's lines are his own words**, from what he has really said or written (typos tidied,
    nothing added), and they stay his to change. Maia's lines are written for her.
  - Use the `sandbox-script` and `writer` skills for rhythm and voice where they are installed;
    where they disagree with the three rules above, the rules win.
- `timeline.json`: the film of the story for the in-game camera, played live and the same every
  time:

      { "intent": "NNNN", "title": "…", "day": N, "inGame": N, "goals": [ [ "…", done ] ],
        "clips":    [ { "name", "kind", "secs", "ease", "in", "why", "keys": [ { "pos", "look", "mm", "roll", "focus" } ] } ],
        "captions": [ { "at": seconds, "for": seconds, "kind": "title" | "maia" | "samuel" | "note", "text": "…" } ] }

  `day` is the day of the 5423 the story tells, `inGame` the humans in the game that day (counted,
  never guessed), `goals` the day's few goals with whether each is done; the dashboard's front
  page is drawn from them. `clips` is the virtual camera's timeline (`TheGame/cine/README.md`). `captions` are the film's
  subtitles: `maia` and `samuel` for the two voices of the dialogue (the speaker's name stands
  small over the line), `note` for a plain fact on screen, `title` for the film's title card
  (with `over` for the small line above it). Subtitles are short: one thought, two lines at most,
  about 42 characters a line, on screen two to four seconds, never two at once. About 150 words
  for a minute of film. Compose camera moves with `TheGame/cine/trailer.js` or by hand; a shot
  shows what its line talks about wherever the world can show it.

It plays at `http://localhost:5173/timeline.html?story=NNNN-slug`, and from the OS dashboard.

## Where things are

| Folder | What |
| --- | --- |
| `Intents/` | the intents, `TEMPLATE.md` |
| `Stories/` | a folder per proposed intent: `story.md`, `timeline.json` |
| `brand/` | `MaiaCity.svg`, the mark, and `brand.css`, the one look of every page: Meadow (cream, forest, clay, gold; Fraunces at its softest with Outfit; the arch, the seed and the sun; everything round, glass over the game). New interface takes its colours and shapes from there, never its own. `brand/sheets/` keeps the drafts it was chosen from |
| `TheGame/` | the world and the virtual camera |
| `OS/` | the dashboard over the three: `bun run dev` at the repository's root starts it (port 5180) with the game (5173) |

## Do not

- Do not write a section before its state, or skip Define's checks.
- Do not accept, reject or archive on your own.
- Do not put into Propose, the changelog or a caption anything that was not actually seen.
- Do not keep a second changelog anywhere else.
- Do not let a worker merge, ask the human, or take the GPU outside its turn.
- Do not run a task as a subagent, or let a task or its session go missing from the board.
- Do not run two GPU jobs at once on one machine.
- Do not judge a branch against `main`, or merge a patch in place of the root fix.
- Do not define an intent without its architecture pass, or choose a pattern without the research
  written down.
- Do not define an intent without its 10 % gate, or let any measure get worse.
- Do not add code around old code: replace it. Do not keep a legacy path, a copy or a setting "just
  in case".
