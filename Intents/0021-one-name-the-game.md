---
id: "0021"
title: One name for the game: Sandbox 8 retired
state: propose           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0021 · One name for the game: Sandbox 8 retired

## Idea

Samuel's words (typos tidied): "What is Sandbox 8? In this world we just talk about one game, right? Old play
Maia City is legacy." And: "You can remove the Sandbox 8 legacy name references."

## Define

Asked outright; the definition holds no surprise.

**Deliverables**

1. No "Sandbox 8" left in the game, its pages, tools and READMEs: the game is the game (Maia City's).
2. The handle the game leaves on the page for its tools and pages, `window.__s8`, is `window.__game`.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | nothing left | `grep -rniI "sandbox.\?8\|__s8"` outside `Intents/` (whose history stays as it was written) and the scene id `s8` of `Stories/scenes/test-gate` (a clip's own id) |
| 2 | the game, the library and a timeline start with `window.__game`, no errors | headless Chrome on each page |

**Out of scope**

- The intents' history (they say what was true when they were written).

## Build

- `window.__s8` → `window.__game` in `src/main.js`, `src/scatter/drawer.js`, `src/scatter/stress.js`,
  `library.html`, `cine/*.js`, `tools/*.js`, `TheGame/README.md`, `cine/README.md`.
- The package is `maiacity-game` (was `sandbox-8`); a film saved by the virtual camera is `maiacity-….webm`; the
  start's line in the console says `[the game]`; the READMEs and `main.js` say "the game".
- A tool or a page outside this repository that reads `window.__s8` must read `window.__game` now.

## Propose

**Delivered:** the name gone, the handle renamed.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | the grep finds nothing |
| 2 | passed | `/`, `/library.html`, `/timeline.html?tl=river-story`: ready with `window.__game`, no `window.__s8`, no errors |

**Known gaps:** none known.

## Story

## Archived

---

## Todo

- [x] the name and the handle

## Changelog

### 2026-11-14

- **Asked:** what Sandbox 8 is; remove the legacy name.
- **Delivered:** the name out of the game's code and READMEs, `window.__game` for its handle.
- **Good:** fifteen files, one handle.
- **Broke / not there yet:** nothing seen.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-14 | `0180904` | the name and the handle (`window.__game`) |
| 2026-11-14 | `252d457` | origin/main brought in, its new `__s8` reads renamed |
