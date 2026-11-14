---
id: "0020"
title: 30 frames a second where it held 60: what took them
state: propose           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0020 · 30 frames a second where it held 60: what took them

## Idea

Samuel saw the game at about 30 fps in his Safari (the HUD at the tent), where it held 60; the stress test once
drew millions of things at 60. His words: "our stress test runs at 60fps! so find out what killed it". Find why
it dropped and bring it back to 60, without losing the look.

## Define

Asked outright; the definition holds no surprise.

**Deliverables**

1. Where the frames went: measured, not guessed, at one view and one window size, before and after.
2. The cause fixed, or the trade-off said if the look itself costs it.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | the frame's cost on main against the build that held 60 | the tent spawn, 1440×817 at 2× (Samuel's window), inside ratio held at 1: live rAF frames and frames drawn back to back by the wall clock, the game's loop paused |
| 2 | Samuel's own slow minutes explained | his tab's rows in `TheGame/.perf/hitches.jsonl`, minute by minute, against every other tab that drew at the same time |

**Out of scope**

- The fire pit's own cost (intent 0018): it is in the measured main.

## Build

- **The code did not get slower.** Headless Chrome (WebGPU on the Mac's GPU), 1440×817 at 2×, the tent spawn,
  inside ratio held at 1, the governor held; A and B by turns (2026-11-14, 23:2x):

  | build | live fps | p95 ms | worst ms | a frame back to back |
  | --- | --- | --- | --- | --- |
  | `34defe7` (19:57: Safari held 60 at an inside ratio of 1.6) | 60.0 / 60.0 | 16.7 / 16.7 | 16.8 / 16.8 | 11.63 / 11.95 ms |
  | `b4a10e3` origin/main (the fire pit merged) | 60.0 / 60.0 | 16.8 / 16.8 | 16.8 / 16.8 | 11.93 / 11.32 ms |
  | `b4a10e3` `?stress` | 60.0 | 16.7 | 16.8 | 13.61 ms |

- **What took the frames: other browsers drawing the game on the same GPU at the same time.** Measured with them
  running, the same main read 19.7 ms, then 37–59 ms a frame (31.7 fps, then 14 fps live), and the GPU stood at
  60–96 % busy with none of this intent's runs going (`ioreg … "Device Utilization %"`). The other users then:
  agent sessions' Chrome tabs and headless Chromes drawing `/game/`, `/game/?in=os` and `library.html` (the
  desktop app's browser pane renders at full rate while the pane is hidden: it reports itself visible), and
  Samuel's own Safari.
- **Samuel's tab says the same.** Every slow stretch of his Safari at the tent is a minute when another tab drew
  the game: 21:25–21:33 at 34–50 fps with an agent's Chrome on `/game/?in=os` and `library.html`; 21:57–22:03 at
  39–47 fps with an agent's Chrome on `/` and `library.html`. Alone on the GPU (20:16–20:27) his tab held 60 fps
  with the inside ratio climbing to 2.
- **Why the governor did not mend it:** it steps the inside's pixels down only when fewer pixels buy frames; with
  another program taking the GPU, a step down bought little, was taken back as "the pixels were not what was slow",
  and none was tried again for longer each time. In his rows the ratio stayed at 1 for minutes at 40 fps.
- In one page, each part left out by turns (under load, the quietest round): the land's pixels are the largest
  part of a frame (about 14 of 34 ms), the temporal passes about 6, the placed things about 6, the trees about 4,
  the lakes' loop about 2. Nothing new stands out; worth knowing for the next round of savings, not a regression.
- A bisect by commit was tried first and could not see anything: every commit measured read 52–64 ms while the GPU
  was shared (the noise was ten times any difference). Interleaved runs on a quiet GPU replaced it.

## Propose

**Delivered:** the cause, measured. No code changed: main is not slower than the build that held 60.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | main and `34defe7` both 60.0 fps live, worst 16.8 ms, 11.3–11.9 ms a frame back to back, by turns (table above) |
| 2 | passed | his slow minutes line up with other tabs drawing the game; alone he held 60 at a ratio up to 2 |

**For Samuel to choose** (the fix lies outside the code as it is):

1. **A rule for agents:** no agent's browser draws the game or the library while Samuel plays (close the pane's
   tab, or point it at a page without 3D, when done; headless shots only on request). Costs nothing in the game.
2. **The game draws less where no one looks:** in an agent's browser (the desktop app's pane says `Claude/` in
   its user agent; Playwright sets `navigator.webdriver`) and without focus, draw a frame a few times a second
   instead of sixty. Shots and films that need every frame would turn it off (`?full`). A change to the frame
   loop: its own intent if wanted.
3. The governor could tell "another program has the GPU" from "the picture got heavier" and give pixels anyway;
   that would only soften Samuel's picture for what is not his game's fault: not recommended.

**Known gaps:** measured in Chrome, not in Samuel's Safari (his own rows are the Safari evidence); the absolute
times swing with whatever else the Mac's GPU does.

## Story

## Archived

---

## Todo

- [ ] Samuel picks 1, 2 (or both)

## Changelog

### 2026-11-14

- **Asked:** why the game is at 30 fps where it held 60, and back to 60.
- **Delivered:** measured at the tent in Samuel's window size: main holds 60 alone, as the 19:57 build does; the
  slow minutes are minutes when agents' browsers drew the game on the same GPU.
- **Good:** his own hitch log told it minute by minute once read against every other tab's.
- **Broke / not there yet:** the first bisect measured the other tabs, not the commits; no fix in code yet, it is
  his choice.

## Trail

| When | Commit | What |
| --- | --- | --- |
