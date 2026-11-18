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

### 2026-11-17 (9)

- **Asked:** the opening line rebuilt over many rounds: not "capable of more", not giant and small, not wonders or a
  bright light, no walls coming down; first person ("Deep inside I know"); a power far greater than anything in the
  universe, that every human knows when honest and daring to believe; each and every one of us; a million, not
  billions; concrete, not too detailed. Samuel's own line: "We stood on the Moon. That was a few of us. Imagine a
  million of us standing in a green city that we build with our bare hands."
- **Delivered:** the core message in the first person, with that line in his words.
- **Good:** `story check .` passes.
- **Broke / not there yet:** many drafts missed (too abstract, too negative, too detailed) before this one.

### 2026-11-17 (10)

- **Asked:** "Standing on Earth… there you can transition into the Maia City intro."
- **Delivered:** the Moon against the Earth: "Imagine a million of us, standing on Earth, in a green city that we build
  with our bare hands." The next line names it: "This is Maia City: a new blueprint for how to live…"
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (11)

- **Asked:** add the mini pitch of what the city is, without the word "sovereignty": healthy food by the door, etc.
- **Delivered:** after "This is Maia City": healthy food by every door, clean power from the sun on every roof, every
  home, field and machine owned by all who build it, every hour free for what we love. The earlier food-and-sun line
  folded into it.
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (12)

- **Asked:** "And it's not just me. You know it too. In fact each and every one of us knows this and smiles now."
  "Daring to believe it" too unclear: go directly to "a million humans waking up with sparkling eyes, a smiling heart
  and fire in the belly, every day". Don't repeat "imagine a million"; make it a good transition. Not fields: green
  energy and food forests, compact. Last sentence: first in a game, then for real; tonight I can walk in.
- **Delivered:** all of it, in his words where he gave them.
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (13)

- **Asked:** "Deep inside, I know this truth… I carry…"; remove "and smiles now"; the Moon-to-Earth transition is bad
  and "a few of us" is not needed.
- **Delivered:** the opening as he worded it; "smiles now" out; the transition one line: "Together, we reached the
  Moon. Now, together, we build a green city on Earth, with our bare hands."
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-17 (14)

- **Asked:** "we carry", not "I carry"; a transition that names the power so the reader understands it (from vision to
  reality: when we unite in a vision, the impossible becomes possible; we always did this; no prose glue); not the
  Moon: three things, each grander (human flight, …); "from the ground up", not "bare hands"; remove the tent and
  "tonight, I can walk in".
- **Delivered:** the power named: "the power to make the impossible real, the moment we unite behind one vision";
  flight, light in the night, the whole world connected in an instant; "and next, together, we build a green city,
  from the ground up"; the close "It begins first in a game, then for real."
- **Good:** `story check .` passes.
- **Broke / not there yet:** —

### 2026-11-18

- **Asked:** "This is the vision; now anchor its mission to this": the campaign idea, Maia City as Europe's new
  capital of sovereignty, built from the ground up and owned by its citizens, first in a game then for real; which
  country will make the race; join and bring Maia City home to your country; the first country reaching 1.3 million
  citizens in the game builds, owns and lives in the real city.
- **Delivered:** `## The mission` in `Compass/story.md` in his words (typos tidied), under the vision; how the two
  meet; the external stake is now the race. The dashboard shows The vision and The mission at the top of the Compass.
- **Good:** `story check .` passes; the page renders both (screenshots before and after).
- **Broke / not there yet:** the mission brings back the 1.3 million and the word "sovereignty", both taken out
  earlier on purpose; kept because they are Samuel's newest words, flagged to him. He answered: keep both.

### 2026-11-18 (2)

- **Asked:** "Completely restyle, re-layout and rethink the whole Compass as its own sub page! Currently it is just one
  cluster… It needs to be a clean overview of how the whole story, its characters, vision and mission are connected."
  And: "In every European country we will build one in-game city, which compete against each other to win the real
  thing."
- **Delivered:** the Compass is its own page (`#compass`, reached from Stories → The Compass): a map of five stations
  (why, what, how, who, where), then the vision, the mission, the story (premise, what it out-builds, stakes, every
  day), the people with the citizen as the hero, the four tracks in order, the thematic arcs, the world; every entry
  opens in a drawer. The race written into the Compass: one city per European country in the game, the first to 1.3
  million builds the real one (story.md, the twin, Maia City).
- **Good:** `story check .` passes; the page renders, the drawer opens (screenshots).
- **Broke / not there yet:** the first build collided with two global classes (`.card`, `.hero`) and drew huge,
  letter-spaced cards; renamed, fixed.

### 2026-11-18 (3)

- **Asked:** gameplay strategies, then the game's economy set in conversation (survival first, food and power
  sovereign, export-positive; a tech tree of startup coops; cities as startup hubs; HEARTS, MINDS, the city coop with
  land and liquidity pool, invite-only villages, buy-only funding curves, insolvency by auction, wealth as the score,
  Fibonacci gates in village treasury wealth with external € investors capped so citizens keep 51%, the market
  interface, the richest city's richest village as the real pilot). "Write this into the Compass as the game compass
  reference sheet and single source of truth."
- **Delivered:** `Compass/worldbuilding/systems/the-game.md` (made with `story add system`), and a sixth station on
  the Compass page, *6 · Play: the game*, showing its three key tables with the whole sheet a click away.
- **Good:** `story check .` passes; the page renders (screenshots).
- **Broke / not there yet:** daily gameplay and the care activities are the next conversation.

### 2026-11-18 (4)

- **Asked:** the start investment (€12,500 and 50,000 HEARTS into the city coop, which also owns the connecting
  infrastructure underground and rents it to the utility coops; 12,500 HEARTS into the village coop; 5,000 each into
  ten city-wide coops), ten minutes of daily play, only shared domes, the phases with phase 1 in detail (a tent, then
  4-, 12-, 24- and 48-person domes, each with its own energy and water cycle, more plants and fewer imports; ending
  with the village's dome tower and a geothermal plant, energy-positive), one game month to one real day, neglect
  rots the day's harvest. "No seasons for the MVP, since we grow in domes."
- **Delivered:** all of it in `the-game.md`: the start capital, daily play, the phases (2 to 5 marked draft), phase 1.
- **Good:** `story check .` passes.
- **Broke / not there yet:** the village's share was 25,000 HEARTS, not 12,500 (Samuel's correction): all 125,000
  start HEARTS are invested, none kept. Phases 2 to 5 are drafts.

### 2026-11-18 (5)

- **Asked:** what each village level unlocks, from the village's Fibonacci goals up to 1,597 villagers: tents and a
  pickup, growing domes from 2 m, living domes, the external investors from 13, the containers. Then: the first power
  container at 13 and one more at every level; the domes carry the solar cells, the containers convert and store;
  every level steadies the domes' inner climate until the geothermal plant at 1,597 holds 24 °C or more all year.
- **Delivered:** phase 1's ladder in `the-game.md` as one table (treasuries, living and growing domes, containers,
  power containers, climate, food and energy imports, external investors), with the power and climate rules above it.
- **Good:** `story check .` passes.
- **Broke / not there yet:** the percentages and investor budgets are design values to tune and source; the
  dashboard's join page still shows the older village levels.

### 2026-11-18 (6)

- **Asked:** the power containers are also Maia's server farm; then rethought: compute only from 610 to 987 in one
  server farm in the village centre tower, the geothermal plant at 610; four phases (1–377 food, 378–610 energy,
  611–987 compute exported, 988–1,597 startup factory coops); every dome its own tech box; energy never exported out
  of the city; a full table with each level's estimated investment. "Can you make one standalone view of this table
  in our Compass UI?"
- **Delivered:** the village ladder in `the-game.md` (the four phases, sixteen levels, € this level and in total,
  funding, food and energy imports); a page of its own, `#ladder`, reached from the Compass's Play section: the four
  phases as cards, the ladder as a table with bars, the notes, all read from the sheet.
- **Good:** `story check .` passes; the page renders (screenshots).
- **Broke / not there yet:** the € figures are rough estimates to be quoted; a global `.bar` class drew grey boxes on
  the first try, renamed.

### 2026-11-18 (7)

- **Asked:** the € start at €10,000, half to the city coop, half to the village coop; a village starts with 3
  settlers; the market dome (5 m) and the pickup arrive with the fifth; the economy inside the city (everything in
  city HEARTS, rent and food money, work proposals, 50% of turnover to MINDS holders, the harvest sold to the village
  market, prices and a 10% import markup, local governance, the gate as an automated market maker passed only by
  coops, protocol-owned bootstrap liquidity); aquaponics and fish ponds in the large domes. Then: "Why is the total
  €39k when each only brings €5k?" and "make the gap on each level an actual investment".
- **Delivered:** all of it in `the-game.md`; the ladder now shows what new settlers bring and each level's investment
  round (pre-seed from 5, angels from 13, seed from 55, the three major investors), on the sheet and the `#ladder` page.
- **Good:** `story check .` passes; the page renders (screenshot).
- **Broke / not there yet:** "€ in total" read as money brought, not money spent, until the columns were added; the
  ladder had said "Citizens" at 5 and 8 although their € did not cover it.

### 2026-11-18 (8)

- **Asked:** economies of scale, unlocked by the startup factory coops as they level up, the factor per coop, everyone
  buying from the first village's chain; citizenship at €1 a day as the gate against fake accounts; growing times
  of herbs and berries; seeds of our own. Then: "a new harvesting and growing game sheet, separate, every asset its
  own entry with its levelling, a universal recipe engine reusable across the food forest, clean playable levelling;
  the goal export-positive; a few edible mushrooms and anything that grows in one to two real days; including
  breeding our own seeds."
- **Delivered:** `Compass/worldbuilding/systems/the-harvest.md` (made with `story add system`): the recipe, the
  engine, bed levels on Fibonacci harvests, seeds bought, saved and bred into village seed lines, the export goal per
  recipe, and an entry for every recipe (microgreens, herbs, berries, the fast greens, five mushrooms). Linked from
  the game sheet and the Compass's Play section. Scale, citizenship and the scale factor in `the-game.md`.
- **Good:** `story check .` passes; the drawer renders it (screenshot).
- **Broke / not there yet:** every time and yield is an estimate to source and tune.

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
| 2026-11-17 | `0cd5ad1` | Sparkling eyes instead of full size |
| 2026-11-17 | `2fbd1eb` | Core message in the first person, Samuel's Moon line |
| 2026-11-17 | `60bb1be` | Moon to Earth, into Maia City |
| 2026-11-17 | `38d8dae` | The city's mini pitch in the core message |
| 2026-11-17 | `488d06e` | Core message: Samuel's lines, the transition, the compact pitch |
| 2026-11-17 | `2edb91d` | Opening as Samuel worded it; one-line transition |
| 2026-11-17 | `89fe6d4` | The power named, three feats, from the ground up |
| 2026-11-18 | `4efc921` | The mission: the country race, on the dashboard too |
| 2026-11-18 | `6941129` | The Compass as its own page; the country race in the world |
| 2026-11-18 | `f28e4db` | The game reference sheet, and its station on the Compass page |
| 2026-11-18 | `7598858` | Game sheet: start capital, daily play, phases, phase 1 |
| 2026-11-18 | `04e2d6a` | Phase 1 village ladder in the game sheet |
| 2026-11-18 | `df4c5ea` | Four-phase village ladder; the #ladder page |
| 2026-11-18 | `893c909` | Investment rounds per level; the economy rules |
