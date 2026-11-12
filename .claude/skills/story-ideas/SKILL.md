---
name: story-ideas
description: The story ideas' backlog of TheOS (Stories/ideas/). Use whenever Samuel asks what stories could be told, wants the ideas gathered or brought up to date, asks to cluster, move, merge, rename or put aside an idea, to advance one towards a story, or mentions the ideas pad, the idea backlog, story concepts or topics to cover. Ideas are gathered backwards from the intents' history by you; every change is a call of `bun Stories/ideas.js`; the dashboard's Ideas page only shows them.
---

# Story ideas

An **idea** is a topic a story could be told about: the wind, the river, the forest's floor, the city's plots. It is not
an intent. One idea draws from several intents (the wind was built in 0008 and tuned in 0010) and one intent feeds many
ideas, so every idea names the intents it draws from. A story is later made from an idea, not from an intent.

Ideas are never invented and never typed in by hand. They are **found by reading backwards**: what was built, in the
intents and their commits, and what Samuel asked for in his own words.

## The three rules

1. **Only the tool changes an idea.** `bun Stories/ideas.js …` (its head lists every command). Never edit
   `Stories/ideas/*.md` or `ideas.json` directly: the tool keeps them well-formed and checks every intent reference.
2. **The page only shows.** Stories → Ideas in the dashboard (http://localhost:5180/#stories) reads the files as they
   are and draws again when opened. It has no controls that change anything, and gets none. Lanes of cards at the left, the one opened in the right half,
   drawn as the story's timeline is.
3. **Samuel's words are his own.** A line under "Samuel's own words" is a quote from an intent's Idea section or its
   changelog's **Asked**, typos tidied, nothing added. If there is no quote, leave it empty.

## Gathering (the backward analysis)

1. `bun Stories/ideas.js list`: what is there, and the commit the history was last read up to.
2. Read what came since: `git log <that commit>..HEAD --format='%h %ad %s' --date=format:'%m-%d %H:%M'` (commits
   named `Intent NNNN: …` are records, skip them), and of every intent touched its **Idea**, **Build** and **Changelog**.
3. For each thing that happened, ask: *what would a viewer see or feel, and is there a turn in it?* That is the topic,
   and that is the point. The best material is in a changelog's **Asked** (the wish), **Found** (what was wrong, and
   why) and **Broke** (the first try that failed): "held against photos of a stone pine, the first try failed: a short
   thick trunk and a flat plate". Leave out what is purely technical (shaders, frame times, files, refactors): it
   belongs to no story. "Snow lies on the tent's roof in clumps" belongs to Snow; "the scatter is packed by compute"
   to nothing.
4. Write it as a **story point**, not a log line: one or two plain sentences that sum up several commits, a wish and
   what became of it, a before and an after, a failure and its mending. No times, no file names, no numbers nobody
   sees; three to six points an idea. Add it to the idea it belongs to (`note <id> happened "…" <intent>`), or make a
   new idea (`put`) when nothing fits; rewrite an idea's points whole with `put` when they have grown stale.
5. For each idea touched: Samuel's words about it (`note <id> words "…" <intent>`), and what the world can now show
   (`note <id> shots "…"`: a shot the game's camera could take today).
6. `bun Stories/ideas.js gathered <HEAD's short hash>`.
7. Tell Samuel what was added or changed, idea by idea, in a few lines.

## Lanes

The clusters, in this order: **Sky and weather**, **The world**, **The city and its people**, **The camera and the
film**. A new lane only when several ideas share something none of these hold (`lanes "A|B|C"` sets the order).

**Not for stories:** how it was built (frame rate, WebGPU, bug hunts, plug-ins, the dashboard, the brand). Samuel does
not want these told. Gather them all the same, in the lane "The craft behind it", and `dismiss` them: they stay on the
page, folded away, so nothing is lost and nothing is gathered twice.

## An idea's fields

- `id`: lower-case words with hyphens; it never changes. `title`: what the page shows. `lane`.
- `hook`: one line, what makes it worth telling, as a viewer would say it. Not a summary of the work.
- `intents`: every intent a line of it cites.
- `stage`: `raw` (gathered) → `hooked` (its hook and title are found: the `story-loop` skill) → `scripted` (its story
  is written: `sandbox-script`, `writer`) → `filmed` (its timeline plays) → `told` (it is a day of the series).
  Advance it with `stage <id> <stage>` when that step is really done, and `set <id> story=<Stories folder>` once it has one.

## Changing them when Samuel asks

"Merge grass into the forest floor" → `merge grass forest-floor`. "Rename", "move to the world" → `set`. "We won't
tell that" → `dismiss`. "Bring it back" → `restore`. Say what you did in one line; the page shows the rest.
