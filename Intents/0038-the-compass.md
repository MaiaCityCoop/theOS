---
id: "0038"
title: The Compass
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-17
story:                 # Stories/0038-slug/, set at propose
---

# 0038 · The Compass

## Idea

> The core message is still out of negative connotation! How can we switch it to the fully inspirational language,
> the Apple Think Different world, framing it to the misfits commercial also greatly? So condense and compact this
> whole thing again. Also let's remove day 1 and day 2 stories so far, we brainstorm them from scratch again.
> […] The Compass is way better than the Bible. Update the skills also accordingly. And rip out all the milestone
> 1.3 million and Fibonacci stuff too for now of the whole story arc. It's not the essence.

Before that, on the same day: "They shouldn't be calling the core 'bible', find a better way."

## Define

Asked outright and without surprises, so built straight away.

**Deliverables**

1. `Bible/` is `Compass/`, everywhere it is read: the dashboard (`OS/compass.js`, `/api/compass`, the page "The
   Compass"), CI, the READMEs, the storytelling skills.
2. The core message rewritten in the *Think Different* register: celebrating, no fear, no warning; the whole
   `Compass/story.md` condensed.
3. The count (1,346,269, "1.3 million"), the Fibonacci ladder, seasons by count and the euro taken out of the
   Compass and the dashboard.
4. Days 1 and 2 removed: `Stories/day-0001`, `Stories/day-0002`, episodes 1 and 2 and their scenes.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | No "bible" left in live code, skills or the Compass | `git grep -i bible -- OS .claude Compass .github` |
| 2 | The core message reads as celebration | read `Compass/story.md` § The core message; Samuel's yes |
| 3 | No count or Fibonacci left | `git grep -n -i -E "fibonacci|1,346,269|1\.3 million" -- Compass OS Stories .claude` |
| 4 | The Compass checks clean | `story check .` in `Compass/` |
| 5 | Stories → The Compass shows the core message, no ladder | the dashboard, screenshot |

**Out of scope**

- Brainstorming the new days 1 and 2 (next, after the interview).
- The series tagline "one million humans … in just 16 years" in the skills and the trailer scene: kept until Samuel
  decides.
- Past intents and their changelogs keep the word "Bible": they are history.

## Build

- The core message is a blockquote under `## The core message` in `Compass/story.md`; the dashboard draws it at the
  top of the Compass page, above the premise.
- `season-goal` dropped from the front matter (it was the 377 milestone); "And against it" is now "What it
  out-builds".
- `the-ladder.md` and `the-count.md` deleted; the four tracks open "in order, as the people arrive".

## Propose

## Story

## Archived

---

## Todo

- [x] Rename Bible → Compass (folder, dashboard, CI, READMEs, skills)
- [x] Rewrite and condense the core message
- [x] Remove the count and the Fibonacci ladder
- [x] Remove days 1 and 2
- [ ] Interview Samuel on what he is really up to and why
- [ ] Brainstorm days 1 and 2 from scratch

## Changelog

### 2026-11-17

- **Asked:** the core message and arc retold; a better name than "Bible"; screenshots of the storytelling views.
  Then: an inspirational core in the *Think Different* register, condensed; days 1 and 2 removed; Compass instead of
  Bible, skills too; the 1.3 million and Fibonacci taken out.
- **Delivered:** see Define 1–4.
- **Good:** `story check .` passes (0 errors, 0 warnings); no "bible" left in OS, skills, CI or the Compass; no Fibonacci or 1,346,269 left in the Compass; Stories → The Compass shows the core message on top, no ladder.
- **Broke / not there yet:** the dashboard's home page still says "1.3 million humans" and `OS/src/main.js` names 1,346,269 in a comment; two ideas still carry the old ladder (`the-first-377-set-the-room`, `the-gate-and-the-door`); the series tagline "one million humans … 16 years" stays in the skills. All waiting on Samuel.

### 2026-11-17 (2)

- **Asked:** "The city is just our means, a vehicle to show what we can achieve when we unite… a better blueprint to live,
  while unlocking the full potential of each and every one of us." Then: keep the backbone, make it mightier, sparkling,
  touching hearts, awe that humanity is amazing.
- **Delivered:** the core message enlarged (what people have already done; that, every morning, in everyone; "the city
  is the proof, you are the point"); premise and synopsis now say the city is the vehicle.
- **Good:** `story check .` passes.
- **Broke / not there yet:** the remaining interview questions are still open.

### 2026-11-17 (3)

- **Asked:** "Making bringing sparkling visions to life the norm, not the exception, is the actual task."
- **Delivered:** that line as the task in the core message, and quoted under it as his words.
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-17 | `e838274` | Bible → Compass; core message rewritten; count and Fibonacci out; days 1 and 2 removed |
| 2026-11-17 | `df815a7` | Core message enlarged: the city is the proof, people are the point |
| 2026-11-17 | `7e10d7d` | The task in the core message |
