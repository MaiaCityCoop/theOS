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

**Code gates** (measured on `main` over the touched area; every merge holds them)

| Gate | On `main` now | Target | Measure |
| --- | --- | --- | --- |
| Size (lines of code) | … | lower | `git diff --shortstat main...` |
| Copies (duplicated lines, clones) | … | lower, no new clone | `bunx jscpd --min-tokens 50` |
| Spaghetti (max and mean complexity a function) | … | ≤ … and lower | `bunx eslint --rule 'complexity: [error, N]'` |
| Dead and legacy code (unused files, exports, flags, glue) | … | 0 | `bunx knip` |
| Coupling (import cycles) | … | 0 | `bunx madge --circular` |
| Settings (modes, hand-set thresholds, switches) | … | lower | reading, or the area's own count |
| Dependencies | … | no new one without a reason | `package.json` |

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
