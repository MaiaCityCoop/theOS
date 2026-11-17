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

### 2026-11-17 (4)

- **Asked:** the pace and rhythm of the shorter version was better; recover that style with the larger context.
- **Delivered:** the core message back to short lines, keeping the awe (oceans, the Moon), the task, and "the city is
  the proof, you are the point".
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (5)

- **Asked:** "That is the task" is not persuasion; redraft at the same pace as heart-warming, inspiring copy that touches
  the deepest inner insecurity in a positive way: allowing to be, to be seen, to become what they are truly meant to be.
- **Delivered:** the task line out of the message (kept below it in Samuel's words); three new beats: the part of you
  kept quiet, "here it is not too much, it is exactly what we need", "you are allowed to be seen… to become who you
  were always meant to be". A note on how it persuades.
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (6)

- **Asked:** "Currently it's just words. We need to feel."
- **Delivered:** the abstractions (full size, every gift unlocked) replaced by pictures the viewer has lived: the city
  drawn on the kitchen floor at seven, the notebook in the drawer, the idea half-said at dinner; then the welcome as a
  picture: a room that leans in, "show me", standing by evening. Rule added: felt, not told.
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (7)

- **Asked:** the negative part is still too strong, push it into the empowering part; the intro was bad again: recover
  Samuel's chosen version and just enlarge it.
- **Delivered:** his version kept word for word, enlarged by three empowering beats: the room that leans in ("show
  me", by evening it stands), being seen and becoming, the oceans and the Moon turned to "what we build together".
  The kitchen floor, the notebook and "never too much" taken out.
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (8)

- **Asked:** "It's not about full size. It's even bigger. Everyone waking up with sparkling eyes, because…"
- **Delivered:** "full size" taken out of the Compass's core (message, premise, theme, stakes, voice); the message now
  opens on everyone waking up with sparkling eyes, because today they get to build what they love, with people who
  believe in them; the Moon line turned to "That was a few of us. Imagine all of us."
- **Good:** `story check .` passes.
- **Broke / not there yet:** the "because" is drafted, not Samuel's; his own words wanted.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-17 | `e838274` | Bible → Compass; core message rewritten; count and Fibonacci out; days 1 and 2 removed |
| 2026-11-17 | `df815a7` | Core message enlarged: the city is the proof, people are the point |
| 2026-11-17 | `7e10d7d` | The task in the core message |
| 2026-11-17 | `c947ce5` | Core message: short rhythm, larger context |
| 2026-11-17 | `6665e5d` | Core message: permission to be seen and to become |
| 2026-11-17 | `e20df32` | Core message in pictures the viewer has lived |
| 2026-11-17 | `80e76ad` | Core message: Samuel's version enlarged, empowering only |
