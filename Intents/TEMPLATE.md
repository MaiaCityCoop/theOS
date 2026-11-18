---
id: "0000"
title: A short name for the work
state: idea            # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-01-01
story:                 # Stories/0000-slug/, set at propose
---

# 0000 · A short name for the work

## Idea

What is wanted and why. The human's own words where they exist.

## Define

_Filled when the idea is taken up. Replaces a spec and delivery gates._

**Deliverables**

1. …

**Checks** (how each is shown to be done)

| # | Check | How |
| --- | --- | --- |
| 1 | … | a command, a page, a number to read |

**Out of scope**

- …

**Architecture pass** (over everything this intent touches; see the intents skill)

- **What is there:** the modules, the copies and similar functions, the modes, settings and
  flags, the legacy and glue code. Short.
- **First principles:** the invariant this part must keep, and where the code keeps more than it.
- **Taken away until it broke:** what was removed or merged, and what broke first.
- **Put back, in the best form:** the pattern chosen, and why. Research in
  `research_notes/NNNN-topic.md` (sources, options weighed).

**Code gates** (measured on `main` over the touched area with `bun tools/health.js`; every merge holds them)

| Gate | On `main` now | Target |
| --- | --- | --- |
| Size (lines of code) | … | lower |
| Copies (duplicated lines, clones) | … | lower, no new clone |
| Spaghetti (max and mean complexity a function) | … | ≤ … and lower |
| Dead and legacy code (unused files, exports, flags, glue) | … | 0 |
| Coupling (import cycles) | … | 0 |
| Settings (mode branches, hand-set numbers, flag reads) | … | lower |
| Dependencies | … | no new one without a reason |

**The 10 % gate** (measured on `main` on the GPU machine; at least 10 % better where this intent
touches, nothing worse anywhere)

| Measure | On `main` now | Target (≥ 10 %) | At Propose |
| --- | --- | --- | --- |
| Rendering: GPU ms per bench view and class; p99 frame and frames over 16.7 ms in motion | … | … | … |
| Startup: settled where it starts, cold and warm; the first frame | … | … | … |
| Boot and load: shader code compiled; bytes before the first frame | … | … | … |
| Memory: the browser's peak; each class against its budget | … | … | … |
| Quality: FLIP against its own truth; `real` per view class; the worst pop in motion | … | … | … |

## Build

_Filled while building: decisions, and what turned out different from the definition._

## Propose

_Filled when everything is built. Then stop: the human decides._

**Delivered:** …

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed / failed / not run | … |

**Known gaps:** …

## Story

_Filled after the human's yes: the work as a story, in beats. Links to the story folder._

## Archived

_accepted or rejected, the date, the reason in a line._

---

## Todo

- [ ] …

## Changelog

_One entry per request cycle, newest last._

### 2026-01-01

- **Asked:** …
- **Delivered:** …
- **Good:** …
- **Broke / not there yet:** …

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-01-01 | `abcdef0` | … |
