---
id: "0052"
title: One tidy root
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-20
story:                 # Stories/0052-slug/, set at propose
---

# 0052 · One tidy root

## Idea

Samuel, 2026-11-20:

> We need to make another cleanup of our repo. Rename OS folder and its workflows etc. to just "website".
> Consolidate legacy Bible into our Compass, which should be the superseding one, right? Rename NativeGame to OS (and
> its label, the app name for the actual native build, should be "theOS") and co-locate the kernel inside of it.

> Wait, don't say OS as root folder, but say App. App/kernel. Since the whole repository is called the OS, so it's
> good enough.

> Also, shouldn't reports and research notes be consolidated into artifacts instead? Also make sure all our root
> folders start with a capital letter.

## Define

Samuel asked for the work outright; it holds no surprise beyond his words, so it goes straight to Build.

**Deliverables**

1. `OS/` → `Website/`, with CI, the deploy scripts, the root scripts and every live reference.
2. `Bible/` gone: what it held is already in the Compass (the folder was empty).
3. `reports/` and `research_notes/` → `Research/`. Not into Artifacts: an artifact is one outside source with its link
   (`Artifacts/schema.json`); research is our own writing, and the outside sources it cites become artifacts one by one.
4. Every root folder capitalised: `brand/` → `Brand/`, `deploy/` → `Deploy/`, `server/` → `Server/`.
5. The engine renamed in avenDB, then written out: `NativeGame/` → `App/` (the app and its window named theOS),
   `avenDB/` → `AvenDB/` (the crate and the store), the kernel its own small crate at `App/kernel/`.
6. The video Samuel brought kept as an artifact (`value-theory-desirability-plus-scarcity`).

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The website builds and deploys from `Website/` | `bun run build` in `Website/`; CI's bundle; next after the merge |
| 2–4 | No live reference to an old folder | `git grep` outside `Intents/`, `Stories/` and `Research/` (history, kept as written) |
| 5 | The engine builds, tests and starts as theOS | its tree's check in avenDB; the kernel from `App/kernel/` starts the pinned build |
| 6 | The artifact passes | `bun Artifacts/artifacts.js check` |

**Out of scope:** rewriting old intents and stories, which are history.

## Build

## Propose

## Story

## Archived

---

## Todo

- [x] 1 Website
- [x] 2 Bible
- [x] 3 Research
- [x] 4 Capitals
- [ ] 5 The engine: App, AvenDB, App/kernel, theOS
- [x] 6 The artifact

## Changelog

### 2026-11-20

- **Asked:** the cleanup above; the video as an artifact; the merge of #416 and the open tasks finished.
- **Delivered:** #416 merged; the renames of deliverables 1–4; the artifact.

## Trail

| When | Commit | What |
| --- | --- | --- |
