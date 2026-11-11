---
id: "0001"
title: Intents, stories, one dashboard
state: propose
outcome:
opened: 2026-11-11
story: Stories/0001-intents-stories-os/
---

# 0001 · Intents, stories, one dashboard

## Idea

Samuel, 2026-11-11, typos tidied:

> Another folder, "Intents". Intents are work packages and changelog at the same time, built from
> the ground up cleanly again, with idea, define, build, propose, archived (accepted / rejected).
> Similar to our legacy maiaCITY play intents structure, but just as a single Markdown document
> for now, with each intent state as its own header section, filled up as we go. So every intent
> is one bigger work package with collocated documentation of our progress. This also replaces our
> current storytelling commit-hashing principles. The per-intent doc should also have an audit
> trail of changes, referencing commit hashes, at its end, and a todo list. The define replaces
> our legacy spec and delivery gates.

> After propose, before archive, we have another step called "story": it documents our
> interaction, what the human wanted, what the agents programmed and delivered, for our story
> devlogs. Each intent needs a short storytelling deliverable in a video timeline format. Then
> spawn and link in "TheStory" a new Markdown, plus a folder, per proposed intent. A story should
> have the changelog of the intent referenced, and a JSON config collocated for our in-game camera
> timeline, so we have a deterministic, replayable timeline / video / storytelling pipeline.

> Our timeline UI should also have live documentary-style captions of an example story devlog
> format on screen.

> OS should then be the visualisation dashboard that wires, similar to legacy play, TheGame,
> TheStory and Intents in one centralised dashboard app together, interactively.

> For now we can kick out the current changelog documentation; we don't need the history. Instead
> define the first intent once you have implemented the whole system. Create a clean intent
> placeholder / template reference doc, as Claude Code skill instructions, on how to use intents.

## Define

Samuel asked for this outright and in detail; it was built in the same turn, so this definition
was written with the work, not approved before it. It is here for him to hold the result against.

**Deliverables**

1. `Intents/`: a template for an intent as one Markdown document, its states as sections (idea,
   define, build, propose, story, archived), and at its end a todo list, a changelog and a trail
   of commits.
2. A Claude Code skill that says how to work with intents.
3. The old devlog removed; this intent as the first one.
4. `Stories/<intent>/` per proposed intent: `story.md` linking the intent's changelog, and
   `timeline.json` for the in-game camera, with captions.
5. The game's timeline view plays a story's `timeline.json` and shows its captions on screen.
6. `OS/`: a dashboard that shows the intents as a board by state, opens an intent and a story as
   documents, and plays a story inside the game.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The template holds every state, the todo, the changelog and the trail | read `Intents/TEMPLATE.md` |
| 2 | The skill is found by Claude Code | `.claude/skills/intents/SKILL.md` exists with a name and a description |
| 3 | The devlog is gone and nothing points to it | `grep -r DEVLOG` in the repository finds no live reference |
| 4 | The story folder exists with both files | `ls Stories/0001-intents-stories-os/` |
| 5 | The story plays with captions | open `http://localhost:5173/timeline.html?story=0001-intents-stories-os` |
| 6 | The dashboard shows this intent in its state and plays its story in the game | open `http://localhost:5180`, the card, then "Play it in the game" |
| 7 | One command starts both | `bun run dev` at the repository's root |

**Out of scope**

- Changing an intent's state from the dashboard: OS only reads. States are changed in the document.
- Rendering a story to a video file. The film plays live; recording it is the camera's `record()`, untried.
- Captions inside a recording: they are drawn over the picture by the page, not into the canvas.
- Turning the eighteen cycles of the old devlog into intents: Samuel said the history is not needed.

## Build

- An intent is `Intents/NNNN-slug.md`: front matter (`id`, `title`, `state`, `outcome`, `opened`,
  `story`), then one section per state, then Todo, Changelog, Trail. The front matter's `state` is
  what the dashboard reads.
- The skill lives at `.claude/skills/intents/SKILL.md` and holds the rules: who writes which
  section, when to stop for the human, what a commit message ends with (`Intent: NNNN`).
- A story's `timeline.json` is the virtual camera's clips plus `captions`: lines with a start, a
  length and a kind (`title`, `human`, `agent`, `note`). The game's dev server serves
  `../Stories` under `/story/`; the timeline view loads `?story=<id>`, draws the caption that is
  due as a lower third, and marks every caption under the clips' strip. The game's menu lists the
  stories.
- This intent's film reuses the camera moves of the kept timeline `river-story`: the intent
  changed nothing in the world, so there is nothing of its own to show there. The captions are
  Samuel's words and plain statements of what was made.
- OS is its own small Vite app (port 5180). Its dev server reads `../Intents` and `../Stories`
  from disk on each request; the page shows a board of six columns, renders a document with
  `marked`, and frames the game (port 5173) for walking, the lens bench and each story's film.
- `TheGame/DEVLOG.md` is deleted. `bun run dev` at the root starts the game and OS together.

## Propose

**Delivered:** all six deliverables. Look at it with `bun run dev` at the repository's root, then
http://localhost:5180.

**Checks, as they were** (in the app's browser pane, on Samuel's Mac, 2026-11-11)

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | `Intents/TEMPLATE.md` has the six state sections, Todo, Changelog, Trail |
| 2 | not run | the file exists with `name: intents` and a description; whether Claude Code picks it up in a new session in this repository was not tried |
| 3 | passed | `grep -rn DEVLOG` over the tracked files finds it only in this intent, where it is talked about |
| 4 | passed | `story.md` and `timeline.json` are there; the game's `/story/list` returns the folder |
| 5 | passed | the film loaded with 8 clips, 59.2 s, 7 caption marks; at 0:03.5 the title showed, at 0:11 Samuel's line showed as a lower third |
| 6 | passed | the board showed this intent's card in its column with the document beside it; "Play it in the game" opened the film in the framed game, playing |
| 7 | passed | one `bun run dev` at the root served the game on 5173 and OS on 5180 |

**Known gaps**

- Checked in the pane only, not in Safari. The film was looked at as stills, not watched through.
- Second round (restyle, front page, story retold, subtitles): see the changelog; the checks above still hold, 5 and 6 seen again in the new look.
- The board was seen with one intent; with many, and with the document open, the last column is off screen until scrolled.
- OS does not refresh by itself when a file changes; reload the page.
- The film does not show the dashboard or the documents themselves: the camera only sees the world.

## Story

_After Samuel's yes._

## Archived

_Samuel's decision._

---

## Todo

- [x] Template, skill, folder README
- [x] Remove the devlog; first intent
- [x] Story folder with `story.md` and `timeline.json`
- [x] Timeline view plays a story with captions; menu lists stories
- [x] OS dashboard: board, documents, the game framed
- [x] Samuel looked: restyle, a landing page, the story as real storytelling, subtitles (below)
- [x] A brand (`brand/brand.css`), the dashboard's front page, the game's overlays in it
- [x] The story retold by avenMAIA; captions as subtitles
- [x] `TheStory/` renamed `Stories/`
- [ ] Samuel: look again; accept or say what is wrong
- [ ] Samuel: his opening to camera for story 01
- [ ] Then: the Story section here

## Changelog

### 2026-11-11

- **Asked:** the intents system as above; the old devlog out; a story per proposed intent with a
  camera timeline and captions; OS as the dashboard over the three.
- **Delivered:** `Intents/` (template, README), the skill, this intent, `Stories/0001-…` with a
  film, the story mode and captions in the game's timeline view, the OS app, one command for both
  servers.
- **Good:** the dashboard read the repository and played the story in the framed game on the
  first run; the captions sit over the live picture as lower thirds.
- **Broke / not there yet:** nothing broke in the pane. Not seen in Safari; the skill not tried
  in a fresh session; OS reads only.

### 2026-11-11, second round

- **Asked:** restyle the whole thing, more modern, with a clean, light brand overall. The story
  should not be technical but true storytelling, a devlog of how the world evolves and how it
  starts ("how do we build a city: it all starts on the green meadow, so first we need a world").
  Captions positioned like proper subtitles. A landing page for the dashboard, which was
  forgotten. Rename TheStory to Stories.
- **Delivered:**
  - `brand/brand.css`: one light look (paper, ink, the meadow's green, a wordmark), served to
    both apps. The dashboard and the game's overlays (readout, menu, timeline strip, lens bar)
    take their colours and shapes from it.
  - The dashboard opens on a front page: the claim, the latest story playing live in a framed
    game, the six states with their counts, and three doors (the work, the story, the world).
  - Story 01 retold as *Before the city, a meadow*: avenMAIA's narration, 146 words over 59
    seconds, one line of Samuel's own, with receipts for every number and quote.
  - Captions are subtitles: one place at the bottom, two lines at most, on a soft dark plate; the
    film's title is a card of its own. A framed game (`?embed`) shows only picture and subtitles.
  - The folder is `Stories/`; every path follows. Samuel's quoted words above still say "TheStory".
  - The skill says how a story is written and what a subtitle is.
- **Good:** on the front page the film ran in its frame with its subtitle; the board, a document
  and the story in the game all drew in the new look on the first load.
- **Broke / not there yet:** the front page draws the game live, so it costs what the game costs
  while it is open (it stops when another tab of the dashboard is shown). The story's lines are
  subtitles only: nothing is spoken. Samuel's opening to camera and the series trailer do not
  exist. The game's menu lists a story by its folder name, not its title. Seen in the pane, not
  in Safari.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-11 | `7702d1b` | The intents system (template, skill), this intent, its story and film, story playback with captions in the game, the OS dashboard, one dev command; the devlog removed |
