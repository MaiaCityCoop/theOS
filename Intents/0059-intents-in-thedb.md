---
id: "0059"
title: Intents in theDB, an agent-native pipeline from line to running build, git only as an archive
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-21
story:                 # Stories/0059-slug/, set at propose
---

# 0059 · Intents in theDB, an agent-native pipeline from line to running build, git only as an archive

## Idea

Samuel, 2026-11-21, after the Touch ID gate (0058) and reading Anthropic's post on redesigning source control:

> can we use our own theOS app to manage the whole pipeline inside of our proposals workflow? not depending on
> anything github (we just use git to store and commit the code) … for both changes (host changes) and theDB changes
> alike

> could we go extreme and not use git at all, just iroh blobs and loro docs in our own native engine?

> by default everything needs to be keychain signed, every merge … we instead maintain "whitelists and rules" of
> proposal types that can run just with the session signer … get rid of git asap (just use it as archive dump, before
> each theDB merge) … what we want to avoid at all costs are the inefficient git worktrees and duplicate builds … we
> already have iroh blake content-addressable blobs, we can directly serve them … any kind of agent (Claude in
> multiple sessions, locally or remote, headless) … branch their own lines and make proposals (we call the Anthropic
> work items, intents) … every intent can have multiple tasks, a todo board inside of it … agent-native first version
> control, not the classical human UI; humans just get the last decisions inline during the accept / release step …
> true security sandboxes for every branch/line, so we can test run, stage every proposal.

## Define

**One unit: the intent.** A doc of kind `intent` in theDB: its title, why, done-when, a task board, its line, the
versions it brings, the checks' results, the agent review, and the decision. Its states:

**draft → building → checked → proposal → merged | refused.** "Proposal" is the state where an intent waits for the
person; it is no longer a doc of its own. An intent whose checks fail, or that is rolled back after merging, goes back
to building with the reason on it.

**The security gate.** Every merge into main is signed by the person at this Mac (Touch ID, the Secure Enclave key of
0058), unless a rule covers it. A rule is a standing approval the person signs once with Touch ID ("intents that change
only docs of kind layout or shots, pass their checks, touch no code, grants, schemas or rules"); a merge under a rule
names it. Rules expire, can be revoked, and never cover code, the kernel, grants, schemas or rules. An agent's own key
writes its line only; a merge under a rule is made by the kernel's runner citing the rule, never by the agent.

**The MVP first** (Samuel, 2026-11-21: one machine, only us; sandboxing postponed, the workflow first). One agent
flow from intent to running build, no git worktrees, no GitHub:

1. An agent opens an intent on its line (draft), adds tasks.
2. It changes docs on its line, and code in its line's folder, written from theDB's blobs and saved back into them
   (building).
3. `ready`: the kernel's runner builds the line's source (one build at a time, one shared target, a tree built once),
   runs `cargo test` and `--navtest` against a copy of the store at the line, and writes the results on the intent:
   checked, or back to building with the reason.
4. The star lists intents; a proposal's card shows its why, tasks, checks, and "Try it" (the line's build on that
   copy, in its own window); Accept (Touch ID, always) or Refuse.
5. Accept: main's tree committed to git as the archive, the merge, theOS restarts if the engine changed.

Decided with Samuel on the MVP's shape:

- **Intents are global, like issues, not bound to a line.** An intent doc lives on main; agents may write intent docs
  there (their tasks and state) and nothing else, by a narrow grant; the line is where its work happens. A person can
  open an intent before any line exists.
- **theDB is the only source.** A line's code folder is a disposable view: files cloned from the blobs (APFS
  clonefile, no extra disk), every write saved back into the line at once by a watcher; it can be deleted and made
  again. Later, a virtual filesystem (FSKit) serving the blobs directly.
- **Try it, inline.** A data intent is shown inside theOS, which reads the line's docs instead of main's, in a panel of
  its card. A code intent opens its build in a window of its own for now.

Rules, sandboxes, remote agents, the agent review and automatic rollback come after the MVP.

**Deliverables, in phases** (each its own Changelog entry):

1. **Intents.** `proposals.rs` becomes `intents.rs`: the intent doc with its states and task board; old proposal docs
   read as intents (open → proposal). The agent's API (theDB's CLI with `--json`, later over iroh): new intent on a
   line, tasks added and ticked, state moved, `ready` (snapshots the line's versions, → proposal). theOS's star lists
   intents by state, with their tasks; Accept and Refuse on a proposal.
2. **Touch ID by default, and rules.** No merge into main without the person's signature or a rule's. Rule docs signed
   by Touch ID; `theDB verify` checks every merge's signature or rule.
3. **The builder.** A source tree is blobs under one hash; a build is kept under (tree, toolchain) and never made twice.
   One build at a time in the kernel (8 GB), sccache between lines. `publish` reads a line, not git.
4. **Staging sandboxes, one per line, always there** (postponed after the MVP: one machine, only us). Every line has its own staging sandbox from the moment it is
   made, kept up to date as the line changes, so the line can be opened and tried inline from its intent's card. Each
   intent's build runs against a copy of the store at its line, in the host's sandbox
   (macOS: Seatbelt; Linux: bubblewrap with Landlock and seccomp; untrusted remote agents: a microVM), with no Keychain,
   no network but iroh to the kernel, writes only to its scratch folder. Tests, `--navtest`, the gate's pictures, the
   fps gate, schemas and `verify` run there; the results, signed by the kernel, move the intent to checked. An agent
   review is written onto it. Accept stays off until checked.
5. **Code edited from theDB.** A line's folder written from blobs (only changed files), read back on save; git becomes
   an archive: before each merge theOS commits main's tree to git. No worktrees.
6. **Agents anywhere.** Remote and headless agents over iroh, their key their endpoint, by the master's grant; agents
   themselves run sandboxed, so none can read the host's key.
7. **After the merge.** A smoke run before the kernel switches; a crash or a frame-time regression rolls back to the
   last lock by itself and files an intent; an agent watches the kernel's logs and hitches.

**This supersedes** the Markdown intents in `Intents/` once phase 5 lands: they become intent docs in theDB (this one
first), and the folder an archive.

**Out of scope:** a human diff or branch UI; GitHub beyond an optional mirror of the archive.

**Anthropic's workflow, for comparison** (their post of 2026-10-13): changes made on a server and content-addressed;
no global merge queue at agent scale, tests after merge and before deploy, automatic bisect and revert; agents review
adversarially, people review intent, approval rules tell trivial changes from sensitive ones; per-directory access;
agents watching telemetry. Signing is not described there; here every merge is signed by a person or a rule they signed.

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] 1 · Intents: the doc, states, task board, agent API, the star lists intents
- [ ] 2 · Touch ID by default, signed rules
- [ ] 3 · The builder: builds by tree hash, one queue, publish from a line
- [ ] 4 · Staging sandboxes and checks on intents
- [ ] 5 · Code edited from theDB; git as archive
- [ ] 6 · Remote and headless agents over iroh, agents sandboxed
- [ ] 7 · Smoke run, automatic rollback, the watcher

## Changelog

### 2026-11-21

- **Asked:** the above.
- **Delivered:** the definition.

## Trail
