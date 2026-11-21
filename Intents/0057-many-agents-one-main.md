---
id: "0057"
title: Many agents, one main: high-velocity version control on theDB, signed
state: define          # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0057-slug/, set at propose
---

# 0057 · Many agents, one main: high-velocity version control on theDB, signed

## Idea

Samuel, 2026-11-20, while the cut to day 1 and the modules work ran:

> Please research deep on the source control innovation Anthropic has done here, and write up an architecture intent
> that pulls out key innovations about high velocity, 30k a day merged PRs, that we can learn from, and how we can use
> our primitives to reproduce this with our Loro and iroh core, and Loro branches etc., and one master main
> orchestrating owner, right? For anything: worlds, configs, new assets, suns, wind etc., engines, WASM (for secure
> execution of user- and AI-generated new bakers, engines, renderers etc.).

> Also tell me about the who-owns / who-edits-what pattern of iroh / Loro access control logic, identities (also as in
> later syncing between devices), so as to have proper signed commits for docs and blobs alike.

> And then let's also think about how we can fine-tune and harden our Loro version control inspired by this, including
> giving our DB viewer (theDB in our dashboard) a fully generic version control and branch switching UI, a standard
> select, a history version viewer.

## Define

_Waiting for Samuel's approval. Research: `Research/0057-high-velocity-version-control.md` (Anthropic's Scion and
review queue, Mononoke, Piper and testing after submit, merge queues, jj, Pijul) and
`Research/0058-identities-signing-access.md` (iroh, iroh-docs, Loro, git signing, AT Protocol, SSB,
Willow/Meadowcap, UCAN, Keyhive, Matrix, PLC)._

### What we learn from Anthropic

Anthropic's own account (13 October 2026): about 2,500 code changes merged a day in May 2026, over 30,000 a day by
September, on Scion, its own source control, and a review tool with a merge queue. What made it fast, in short:

1. **The server does the work.** Commits, merges and rebases happen where the history lives; nothing is pushed around.
2. **A change is a small delta** pointing at content-addressed blobs, never a whole snapshot.
3. **Expensive questions are precomputed** ("derived data"): history, blame, who touched what.
4. **Few pointers, each moved by one compare-and-swap.**
5. **No global lock on merging.** Changes land and are tested after merging, before deploying; what breaks is fixed
   forward, by an agent.

### theOS today, measured

- Merges take one lock, one at a time, and the check builds the whole engine: 51 to 147 s (intent 0051). That caps
  theOS at roughly 25 to 70 merges an hour, however many agents work.
- Every commit stores a full snapshot.
- Heads are tags moved without a compare-and-swap: two writers committing one doc can drop a change (found by reading
  the code; being fixed in the SQLite work).
- A direct commit to main during a merge's check lands unchecked.
- A CRDT merge never fails as text, so theOS lost the warning a conflict gave: two agents setting the sun's height are
  decided silently.

### The architecture

**Primitives (decided in 0054 and 0056, kept):** blobs by BLAKE3; docs (Loro) hold everything that changes; a refs doc
per branch; one root pointer; the kernel starts a root hash; core plugins from git and WASM modules from theDB, all by
hash.

**1. Two pointers on main, `main` and `green`.**
- `main` moves on a proposal's **cheap check** (seconds: the docs it changes are well-typed, its modules load and run
  their own tests, its overlaps are resolved).
- `green` moves only after the **full check** (the host builds if it changed, the frame gate, the timeline's stills).
- theKERNEL starts `green`. Many proposals land on `main` an hour; `green` follows in batches.
- A failed full check is **bisected** between `green` and `main`; the change at fault gets a fix or revert task, and
  `main` moves on meanwhile.

**2. Lanes instead of one lock.** Proposals that touch different docs and modules are checked at the same time in
parallel lanes; only proposals that overlap wait for each other. A lane's result lands by one compare-and-swap on
main's refs doc, retried on a miss.

**3. Most changes are cheap by design (0054).** A world, a timeline, a sun, wind, a config, an asset is a doc or a
module; its check takes seconds or less. Only a change to a core plugin (the host) needs a build, and that is rare and
reviewed.

**4. Conflicts are found as data, not as text.**
- **Overlap records:** from the version each branch started at and main's version now, Loro tells exactly which keys
  both changed (the sun's `elevation`, set by two agents). A proposal with an overlap does not land silently: its
  owner, or a rule, decides.
- **Typed docs:** each doc kind has a schema doc and a landing rule (`world.sun.*`: last writer wins only if the
  proposal says so; `timeline`: lists merge by entry; `module`: a new version, never an edit in place).
- **Leases:** an agent's grant names the docs or kinds it may change; two agents rarely hold the same lease.

**5. Delta storage and derived data.** Docs keep Loro's updates (deltas) with a snapshot now and then (0053, in
build); history, who changed what and which blobs are referenced are indexes computed once (the blob index is in
build), so the theDB view answers without opening every doc.

**6. One orchestrating owner of main.** Only the owner signs a move of `main` or `green`. Agents work on their own
`agent-*` branches, with leases, and propose; they never move main.

**7. Signed history for docs and blobs alike.**
- **Identities:** a device key (Ed25519, also its iroh endpoint id, kept in the Keychain); a person, as an identity doc
  whose id is the hash of its signed first record, listing recovery keys and one signing key per device; an agent, a
  key per session with a short scoped grant, used through a signer process so the agent never holds the secret; core
  plugins and modules, by their hash, with signed release records.
- **Four signed records,** each a blob by its hash: a **doc version** (snapshot, parents, author, grant, and exactly
  the Loro changes this author added: signing those ties Loro's random peer ids to a key), a **blob publish** (for a
  blob no doc names, such as a module or plugin build), a **refs move** (a merge into main names its proposal), and the
  **root record** the kernel starts. Signatures live in these records, never in Loro's commit messages. A blob needs no
  signature of its own: a signed record names it by hash, and iroh checks the hash as it streams.
- **`theDB verify <root>`** walks from the root down to every blob and checks every signature and hash.

**8. Who owns and edits what.**
- Each doc has an owner. Rights are **grants**: signed certificates in a grants doc that can only narrow, expire, and
  are revoked by another certificate (UCAN-shaped). Authority depends only on the set of grants, not on the order they
  arrive.
- The merge check verifies every version record between main's head and the proposal's head against the grants as
  they stand at merge time.
- A right revoked while someone was editing: the owner decides at merge time, by refusing the proposal or by a signed
  change that undoes that author's part. History is never cut.

**9. Sync between devices, later, without a rewrite.** Two devices exchange root and refs records first, then
identity and grants docs, then version records with their deltas, then blobs by hash; every signature, grant and hash
is checked before a pointer moves. "The whole system at root X" is one request: the list of every hash reachable from
X, fetched over iroh-blobs and verified. iroh's hooks can refuse a device by its id, and its blob provider can refuse a
download.

**10. Modules by people and AI run only when a person grants them.** The author signs the module's publish record; it
runs in wasmtime with nothing but the gateways it is given; the person who installs it signs a grant naming those
gateways. A module written by an AI does not run until a person signs.

**11. The theDB view shows all of this:** the branch select, every doc's history (choose a version, see the diff),
`main` and `green` and what lies between them, proposals and their checks, who signed what, the grants. Read only at
first; moving pointers from the view comes after the rules above exist.

### Deliverables, in the order to build them on one device

1. Head moves by compare-and-swap (in build, with SQLite).
2. Keys and the signer; signed doc versions in `commit_on`.
3. Refs docs and the root record, signed (0056's decision), with `main` and `green`.
4. Lanes and the cheap check; the full check moving `green`; bisection on failure.
5. Overlap records and landing rules per doc kind.
6. The grants doc; leases; the merge check verifying authors against grants.
7. `theDB verify <root>`.
8. Module publish records and install grants (with 0054).
9. The theDB view's version control pane: branches, history, diffs, main and green, proposals, signatures.

### Checks

| # | Check | How |
| --- | --- | --- |
| 1 | No change is lost | two processes commit the same doc 1,000 times each at once; every change is in the head |
| 2 | Throughput | 20 agents' proposals on separate docs land on `main` in parallel; merges an hour measured before and after (today about 25–70) |
| 3 | Green holds | a proposal that breaks the frame lands on `main`; `green` stays; bisection names it; the kernel still boots `green` |
| 4 | Overlaps surface | two branches set the sun's height; the second proposal is held with the key named |
| 5 | Signed | `theDB verify <root>` passes; flipping one byte of any record or blob makes it fail, naming what |
| 6 | Grants | an agent's commit outside its lease is refused at merge; a revoked grant's later commits are refused |
| 7 | Modules | an unsigned module, or one without an install grant, does not run |
| 8 | Reproducible | the kernel started by an old root hash gives the same stills |

**The 10 % gate:** merges an hour at least ten times today's (the target the lanes and cheap checks exist for); a
cheap check under 10 s; nothing slower for a single change.

**Out of scope:** sync between devices itself (designed here, built when there is a second device); a server; people's
key recovery flows beyond one recovery key.

**Risks (from the research):** on one machine, per-agent keys guard against mistakes, not a hostile agent running as the
same user; Loro cannot yet tell which paths in a doc a change touches before applying it, so rights are per doc and
kind for now; concurrent revocation outside main is unsolved elsewhere too (Keyhive lists it as ongoing).

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel approves the definition
- [ ] 1–9 in order

## Changelog

### 2026-11-20

- **Asked:** research Anthropic's source control at 30,000 changes a day and map it to theDB; who owns and edits what,
  identities, signed commits for docs and blobs, sync later; a version control UI in the theDB view.
- **Delivered:** the two research notes and this definition.

## Trail

| When | Commit | What |
| --- | --- | --- |
