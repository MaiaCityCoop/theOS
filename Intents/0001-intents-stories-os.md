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
- [x] Samuel looked again: brand again from the mark, liquid glass, the Game tab's bug, the film with its story
- [x] Samuel looked again: story as a dialogue from day 1, a tent, the timeline redesigned, four brand sheets
- [x] Samuel looked again: the four sheets out; eight brand drafts, each a whole landing page
- [x] Samuel looked: Daylight liked; Plot, Subtitle and Daylight merged and reduced to draft 09 (one banner, the line, the devlog)
- [x] Samuel chose Meadow (draft 10); the dashboard and the game restyled to it; each day one shot from above
- [ ] A day's shot from above filmed in the game, not drawn
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

### 2026-11-11, third round

- **Asked:** (with two screenshots from Safari) the brand is boring: more sophisticated, more
  iconic; then: start the brand again from scratch, it is still bad. Liquid-glass overlays on all
  game pages. "Walk the world" is broken; Lenses and the story cannot be selected. A story's
  timeline belongs with the story, at the top, not in the Game tab. Use the Maia City logo
  (`MaiaCity.svg`), copied into the repository.
- **Delivered:**
  - The bug: the Game tab and the function that fills it called each other without end, so the
    framed game never got an address. That is why the frame stayed empty and nothing in its bar
    answered. Fixed; and only one framed game runs at a time now (front page, a story, or the
    Game tab).
  - A second bug found on the way: a comment appended to a one-line handler in the lens bench
    swallowed its closing bracket; the lens page would not load. Fixed.
  - Stories: a story's page opens with its film, played in a framed game with its timeline strip
    at the top and its subtitles at the bottom; the telling is underneath. The Game tab holds only
    Walk and Lenses.
  - The brand, three takes. The first (paper, one green) was called boring. The second (a
    surveyor's plan: serif, grid, mono labels) was called still bad. The third starts from the
    mark itself, `brand/MaiaCity.svg`: its cream, forest green, gold, teal; round heavy letters;
    big soft shapes; colour in calm fields; the headline's "green meadow" underlined in the sun's
    gold. The mark sits in the header, the game's bar and the browser tab.
  - Liquid glass on every game overlay: a pill bar at the top (where you are, where you can go),
    the timeline under it, the lens bar at the bottom, the readout small in a corner.
- **Good:** in the pane, Walk and Lenses load in the Game tab, the story plays at the top of its
  page, and switching tabs leaves exactly one framed game running.
- **Broke / not there yet:** the two bugs above reached Samuel because the dashboard's Game tab
  was not clicked through after its rewrite. The third brand has been seen by me only, in the
  pane; whether it is right is Samuel's eye. The game's own page title still says "Sandbox 8".

### 2026-11-11, fourth round

- **Asked:** the third brand is too playful and the timeline badly designed: a complete rethink,
  solarpunk, an iconic identity. The headline should be the series' line: the story of how one
  million humans build their own solarpunk city from the ground up, in just 16 years. The story
  should begin with a green meadow and one tent, grow with citizens, be day 1 ("today I am
  alone, tomorrow we will see"), and be a real dialogue between Samuel and Maia, each in their
  own voice, never "aven" or "AI". Then: the brand is a catastrophe; make four standalone brand
  sheets instead, to find the direction together.
- **Delivered:**
  - Story 01 is now *A green meadow and one tent*, Maia City day 1: nineteen lines, five of them
    Samuel's own words from the session, the rest Maia's; the speaker's name stands over each
    subtitle. The skill holds the three rules (a dialogue; never "aven", "AI" or "AGI"; Samuel's
    lines are his own words).
  - The first tent stands in the world (`src/scatter/tent.js`, at `src/world/places.js`), on the
    meadow where the film goes down into the grass; no grass grows through its floor.
  - The film's controls redesigned: one bar, play, the shot's name, the film as a line with one
    stretch per shot and the acts named under it, a sun as the playhead, the time.
  - The front page's headline is the series' line.
  - A fourth look (quiet serif, brass, an arched window), which Samuel turned down as well.
  - `brand/sheets/`: four standalone sheets on the same content (name and mark, headline, colour,
    type, the board's pieces, the film with subtitle and timeline): **A Atelier** (bookish serif,
    hairlines, brass), **B Glasshouse** (bright, frosted, modern sans, one living green),
    **C Nightgarden** (dark, gold, cinematic), **D Field** (clay and olive, condensed capitals,
    hard edges). An overview page shows the four side by side.
- **Good:** all four sheets drew as meant; the tent is in the grass shot; the dialogue's names
  show over the lines.
- **Broke / not there yet:** four takes at the brand were built into the product before asking
  what it should look like; the sheets should have come first. The live pages still wear the
  fourth, rejected look until a sheet is chosen. From straight above, the tent sits at the edge
  of the frame and is easy to miss. A grid mistake put the time beside the play button instead
  of at the right end; fixed in the sheets and in the film's bar, the bar not looked at again.

### 2026-11-11, fifth round

- **Asked:** the four sheets are completely standard, like bad Bootstrap boilerplates: go far
  more extraordinary and iconic, like real, interactive, modern high-end brands. Delete the four
  and try eight more. The work should not be part of the component snippets. Be more creative,
  also with components that might come along later. Proper landing page, app and game design,
  with persuasion copy and layout, each draft its own variant, not everything the same.
- **Delivered:**
  - The four sheets are deleted. `brand/sheets/` now holds eight drafts, each one whole landing
    page for Maia City in its own file, with its own idea, layout, type, voice and things to
    touch, and an overview (`index.html`) that shows the eight live:
    **01 Count** (the city is a number: a scoreboard, black on bone, one yellow; "Be number 2"),
    **02 Daylight** (drag the sun and the page changes hour; skies instead of boxes),
    **03 Plot** (an isometric diorama, the page framed like a game; "Claim plot 000,002"),
    **04 Instrument** (TheOS as a desktop: windows, a dock, dot-matrix displays, a knob),
    **05 Subtitle** (a film: letterboxed shots, the yellow subtitle as the voice, credits),
    **06 Line 1** (a civic identity: a transit line down the page, a departure board, a pass),
    **07 Seed** (dark, one living light that is Maia, speaking for herself),
    **08 Almanac** (three inks overprinted on paper: a handbook with stickers and a coupon).
  - Each shows the app (a story and its film), the game (a HUD) and pieces that do not exist yet,
    marked as later. None shows the work board. Every current number is today's: day 1 of 5423,
    one human of a million, one meadow, one river, one tent.
- **Good:** each draft's builder loaded its page at 1440 and at phone width and reported its
  typefaces loaded, its interactions answering, no console errors and no sideways scroll.
- **Broke / not there yet:** the session this intent was worked in stopped answering (every
  message ended in an execution error); the work was taken over in a new session, in a worktree
  on the branch `claude/os-session-handover-4c7132`, so the drafts are not on main and the
  dashboard on port 5180 does not serve them until that branch is merged; they are served from
  the worktree on port 5190. The eight were built in parallel, one builder each; of the finished
  pages only Count and Line 1 were looked at a second time, at 1440, before Samuel said no more
  testing was needed. None was seen in Safari, on a real phone, by touch or with reduced motion.
  The pages load their typefaces from Google Fonts, so they need the network. The live pages
  still wear the fourth, rejected look.

### 2026-11-11, sixth round

- **Asked:** Daylight is nice; merge Plot's look, Subtitle's storytelling and Daylight's style,
  and say first how it would be built. Then: massively less. Only the line of the 5423 days, one
  story at a time, each day documenting how many players are in the game and how many years the
  city takes at the current rate; the real citizens in the game are what is counted. Less blocky,
  more like a real game's interface. One master banner only, no long storyline. Each day one
  content snippet into a devlog section. The line: "This is the story of how 1 of 1.3 million
  (a Fibonacci number) humans build their own solarpunk city, from the ground up."
- **Delivered:** `brand/sheets/09-line.html`, first in the overview. One banner: the game itself
  playing the day's film behind a game interface (name, day 0001 / 5423, the day's objectives, a
  key prompt), the count in the headline (1 of 1,346,269, the 31st Fibonacci number). Under the
  picture the line: 5423 days with a tick a year and the sun at today; humans in game (1), pace
  (1 a day, 248 needed), years at this pace (3,686), stories told (1 of 5,423); under the pointer
  the line says how many humans being on pace means on any day. Then the devlog: one row a day
  (day, film, title, two lines of the dialogue, in game, at this pace), and tomorrow's row empty.
  Adding a day is one entry in the page's list; headline, line and rows follow.
- **Good:** seen once in the pane at 1440: the game's film ran behind the banner, both typefaces
  loaded, the numbers stood as computed.
- **Broke / not there yet:** the picture needs the game running on port 5173; without it a
  painted meadow stands in (not looked at). "In just 16 years" is not on this page, following
  Samuel's line as he gave it. The village idea (one plot per village, by invitation) is not on
  it. Not seen in Safari, at phone width, or with the pointer on the line.

### 2026-11-11, seventh round

- **Asked:** (with screenshots of Subtitle) the wall that counts the days per story is great,
  and the scrubbing through the years; the banner of draft 09 is a good beginning. Remove the
  pace and merge the stories and days told into one figure. The Subtitle build-up in light mode.
  The message clear: first in game, then in real, this is day x. The banner's title: x of y
  humans build their own solarpunk city, first in game, then in real, in 16 years.
- **Delivered:** draft 09 again. The title is "1 of 1,346,269 humans build their own solarpunk
  city. First in game, then in real. In 16 years." with "This is day 1 of 5,423." under it. The
  line has three figures (in game today; the years at today's rate; days told, 1 of 5,423); the
  pace is gone. The line is sixteen years of days: moving along it lays that year over the
  picture as a storyboard in pencil on paper, and leaving it returns to today. Under the banner,
  in light mode, the wall from Subtitle: "One day is told. 5,422 are not yet.", day 1 as a poster
  with its film, its humans in game and its years, an empty numbered frame for each day after
  it up to 5423, and the sheet of all 5423 days with the told one lit.
- **Good:** seen in the pane at 1440: the title over the game's film, year 14 in pencil with
  the pointer on the line, the wall and the sheet in light.
- **Broke / not there yet:** the first version of this round had the wall dark; Samuel asked for
  light while it was being written. Not seen in Safari or at phone width; the line not tried by
  touch; a click on the poster not tried.

### 2026-11-11, eighth round

- **Asked:** the storytelling of draft 09 is right; now rebrand it: rounder, everything less
  blocky, more iconic, a nature and earth, solarpunk-inspired brand. Then, while it was being
  written: do not call it a devlog, it is more than that, the real thing is built along the way;
  and remove the figure "At today's rate the city takes 3,686 years".
- **Delivered:** `brand/sheets/10-meadow.html`, first in the overview; draft 09 is kept beside
  it. The same story (title, "This is day 1 of 5,423", the line, the wall, all 5423 days) in a
  round, earthy dress built on three shapes from the mark: the glasshouse arch (the game's
  picture is a round window; every day on the wall is an arched window), the seed (the 5423 days
  as dots, the told one lit) and the sun with eight rays (today on the line, and in the day's
  picture). Cream, forest, clay and gold; Fraunces at its softest; buttons, chips and the line as
  pills; the years ahead in pencil with round huts, domes and trees. The word devlog is nowhere
  on it and the years figure is gone: two figures remain, in game today and days told.
- **Good:** seen in the pane at 1440: the title over the game's film in the round window, year 4
  and year 10 in pencil with the pointer on the line, the wall of arches and the seeds.
- **Broke / not there yet:** the first write of this round still said "devlog" and showed the
  years; a replacement script stopped on its own check and was run again. Draft 09 still has
  both. Not seen in Safari or at phone width; the line not tried by touch; a click on the day's
  window not tried.

### 2026-11-11, ninth round

- **Asked:** yes, restyle the dashboard and the game to Meadow. Then, while it was being done:
  the days ahead should not be filled in beforehand, and the arched windows are not a good
  layout; cinematic and wide instead: each day shows one preview banner, a drone shot at an
  angle from above showing the map and what joined, and with each day we grow the day's banner
  zooms further out. The one call is "Travel to Maia City now". Moving through the days on
  the line should show how the actual city grew. Put "One story a day, for 5,423 days" and
  "This is day 1 of 5,423." together as one message.
- **Delivered:**
  - `brand/brand.css` is Meadow: cream, forest, clay and gold; Fraunces at its softest with
    Outfit; pills, round glass, the mark's sun. The skill's note on the brand says so.
  - The dashboard is headed "Maia City". Its front page is the one banner (the game's film live
    in a round window, the day's goals, the title with the count, "This is day 1 of 5,423. One
    story a day.", the one call "Travel to Maia City now", which opens the game), the line
    (in game today, days told; near the sun it shows a day told as it stood, further on the
    years ahead in pencil), then day by day: one widescreen shot from above per day told, newest
    first, drawn from the day's count so that it climbs as humans join, with the day, its title,
    humans in game and joined, and its film; no frame stands in for a day that has not happened.
    Under them the 5423 days as seeds. The old front page (the six states, the three panels) is
    gone; the board, a document, the stories and the game's tab wear the new look.
  - A story's `timeline.json` now also says its `day`, the humans `inGame` that day and the
    day's `goals`; the dashboard reads them. Story 01: day 1, 1 in game, three goals.
  - The game: the top menu, the film's bar (play on the sun, the shots as round stretches, the
    sun as playhead), the lens bar and the subtitles in Meadow; the pages are titled Maia City.
- **Good:** run from the worktree (game 5174, dashboard 5181) and seen in the pane at 1440: the
  front page with the live film, day 1's shot from above, the line showing day 1 near the sun
  and year 10 in pencil further on, the stories' page with the film bar, the board with a
  document. No console errors; both typefaces loaded.
- **Broke / not there yet:** a day's shot from above is drawn, not filmed in the game. The
  drafts in `brand/sheets/` still show the arches. The game's walk and lens pages and the game's
  top menu were not looked at after the restyle. The servers on 5173 and 5180 run from main and
  do not show any of this until the branch is merged; the dashboard's server must be restarted
  then, because what it reads from a story changed. Not seen in Safari or at phone width.

### 2026-11-11, tenth round

- **Asked:** merge those sections (the count, the line, the days). The storytelling calendar
  should show the current day and the next ones larger and the distant ones smaller. The
  preview that guesses the years ahead is bad and should not be done. All of it combined with
  "In game today" and "Days told", and a day's actual story loaded on hover straight into the
  main banner. Each day builds up a challenge; the day's list (Make a world, Put up one tent,
  Find human number two) is nice. The film's player is weird: far cleaner and reduced.
- **Delivered:** the front page is one banner and one strip, on one screen. The strip holds
  the two figures and the calendar: today as the sun, the next seven days as numbered rings
  getting smaller, then dots that each hold more days and shrink, to day 5,423. Pointing at a
  day that is told puts it in the banner: its day, title, humans in game, joined and length,
  its challenge in the corner, and (for an earlier day) its shot from above until its film
  has loaded; a click opens its story. The pencil guess, the list of day banners and the seeds
  are gone. The film's bar is play, the film as one line with the sun on it, and the time.
- **Good:** seen in the pane at 1440: the strip with 27 stops, day 1 brought into the banner
  on pointing at the sun, a far stop saying "Days 31 to 43 · not yet told", and the reduced
  player on the story's page.
- **Broke / not there yet:** with one day told, an earlier day loading its film into the banner
  could not be tried. The calendar was not looked at with days in the past, nor at phone width.
  Not seen in Safari. Still only on the handover branch (ports 5181 and 5174).

### 2026-11-11, eleventh round

- **Asked:** the game's view should be full screen. Separate the banner into the hero, pure
  text standing alone and centred above, and the actual video under it; start the video only
  once it is scrolled to. The calendar should show all 5,423 dots.
- **Delivered:** the front page opens on the words alone, centred: the title with the count,
  "This is day 1 of 5,423. One story a day.", and "Travel to Maia City now". Under them the
  day's film in its round window, with the day's name, count and challenge on it; the film is
  loaded only when the window is at least half on screen and unloaded when it is scrolled away
  or another tab is opened; until then the day's shot from above stands there. Under the
  window the strip: the two figures and a calendar of all 5,423 days as dots, today as the sun
  as tall as the strip, the days after it large and numbered, shrinking until the rest are
  small dots that fill the strip. The Game tab fills the whole window, with the header and the
  Walk / Lenses buttons floating over it as glass.
- **Good:** seen in the pane at 1440: the words alone on the first screen with no film loaded;
  scrolled to the window, the film loaded and played; the calendar with every day drawn; the
  game edge to edge under the floating header.
- **Broke / not there yet:** pointing at single dots in the calendar was not tried; at phone
  width and in Safari not seen. Still only on the handover branch (5181, 5174).

### 2026-11-11, twelfth round

- **Asked:** no tab bar at the top: the top bar is just "Visit Maia City", which opens a
  clean dashboard of tiles (the stories, the intents, the game). The tabs become a pill at the
  bottom, centred, shown only inside those views; they are for admins, with no links to them
  from the website. The calendar under the film as full-width rows of cards: about six large
  ones now, with their preview picture and citizen count, a row of smaller ones under them,
  smaller again under that. Then: the meadow is day 2 (day 1 is the decision), and day 2
  already has 2 citizens.
- **Delivered:** the front page's header holds the mark and "Visit Maia City". That and the
  hero's button open the dashboard (`#city`): the game as a large tile with the day's shot
  from above, a tile for the stories and one for the intents. Inside, a pill at the bottom
  (Maia City, Intents, Stories, The Game); each view has its own address (`#city`, `#intents`,
  `#stories`, `#game`). Under the film the calendar: a row of 6 cards (day 1 "The decision",
  day 2 today with its shot from above and "2 in game", tomorrow, and on), a row of 12, a row
  of 24, then every remaining day as a dot, to 5,423. Story 01's `timeline.json` now says day 2,
  2 in game, its three goals done.
- **Good:** seen in the pane at 1440: the header with one button, the calendar rows, the
  dashboard's three tiles, the game full window with the pill and Walk / Lenses at the top.
- **Broke / not there yet:** the gradients of a drawing were shared between copies, so the
  dashboard's game tile painted pale; each drawing now has its own. Story 01's own text and
  subtitles still say "day 1" ("This is day one"; Samuel's words): not changed, his to decide.
  "The decision" for day 1 is written in the dashboard's code, not in a story of its own.
  Phone width and Safari not seen.

### 2026-11-11, thirteenth round

- **Asked:** no black bars on a story's film; move the timeline scrubber off the picture,
  below it, and show a thumbnail of each shot, like an editing preview in Resolve: the story
  should have an actual editing timeline.
- **Delivered:** on a story's page the film fills its frame (2.39:1, no bars) and has nothing
  over it but its subtitles. Under it the editor: play, the time, the shot's name; a ruler
  every five seconds; a picture track with one block per shot, as long as the shot, showing a
  still taken in the game from the middle of that shot; a voices track with every subtitle as a
  block, coloured by who speaks; a playhead with the sun on it, to drag. The editor drives the
  film in the game through messages between the two pages (`TheGame/cine/view.js`).
- **Good:** seen in the pane at 1440: all eight shots' stills on the picture track, 18 voices,
  the playhead and time following the film.
- **Broke / not there yet:** the stills first came back black: the picture is cleared once it
  is shown, so each still is now drawn and copied in the same moment. Taking the stills plays
  through the shots for about three seconds when a story opens. Dragging the playhead was not
  tried; phone width and Safari not seen.

### 2026-11-11, fourteenth round

- **Asked:** "First in game, then in real. In 16 years." as its own sub line, styled as its own
  section.
- **Delivered:** the title ends at "…build their own solarpunk city."; under it the line stands
  in its own pill, "In 16 years." in clay; then the day line and the button.
- **Good:** seen in the pane at 1440.
- **Broke / not there yet:** phone width and Safari not seen.

### 2026-11-11, fifteenth round

- **Asked:** the count is citizens, not "in game": 1 citizen, 2 citizens, and so on.
- **Delivered:** everywhere on the dashboard the count reads "N citizen(s)": the cards, the
  window over the film, the calendar's head, the dashboard's line and its game tile. Day 1
  ("The decision") carries 1 citizen, so day 2 shows "+1 joined" (before, with no count for
  day 1, it said "+2").
- **Good:** seen in the pane at 1440: "1 citizen" on day 1, "2 citizens" and "+1 joined" on
  day 2.
- **Broke / not there yet:** day 1's one citizen (Samuel alone) is my reading of "today I am
  alone", written in the dashboard's code; Samuel to confirm. Story 01's `timeline.json` still
  names its field `inGame`.

### 2026-11-11, sixteenth round

- **Asked:** remove "This is" from "This is day 2 of 5,423. One story a day."
- **Delivered:** the line reads "Day 2 of 5,423. One story a day."
- **Good / not there yet:** a one-word change; not looked at in the browser.

### 2026-11-11, seventeenth round

- **Asked:** a top header, uppercase and centred: "This is the story of", over the title.
  Remove "One story a day." The "Travel to Maia City" button below the video.
- **Delivered:** "THIS IS THE STORY OF HOW" over the title (Samuel added "how" after the first look); under it "Day 2 of 5,423."; the
  button stands centred between the film and the calendar.
- **Good:** seen in the pane at 1440.
- **Broke / not there yet:** phone width and Safari not seen.

### 2026-11-11, eighteenth round

- **Asked:** "1 million" instead of "2 of 1,346,269"; "In 16 years." alone and more popping;
  "Welcome to Day 2 of 5,423."; story 01's title "It all starts with one tent on a green
  meadow"; and the "Travel to Maia City" call as its own full-width persuasion section under
  the calendar, with more of the why: imagine we can start clean, the economy and the work
  after the machines, food forests, a hundred times better way of living, without the jargon.
- **Delivered:** the front page reads "THIS IS THE STORY OF HOW / 1 million humans build their
  own solarpunk city." with "In 16 years." on a tilted sun-gold pill and "Welcome to Day 2 of
  5,423." Under the calendar a dark green section: "Imagine we could start clean.", three
  pillars (Work you choose, Wealth that stays, A forest you can eat), "A hundred times better
  way to live. First in game, then in real." and the button. Story 01 is titled "It all starts
  with one tent on a green meadow" in `story.md` and `timeline.json` (its title card too);
  Samuel's own line in the film is unchanged.
- **Good:** seen in the pane at 1440: the hero and the why section.
- **Broke / not there yet:** the why section's words are mine, written to Samuel's points
  ("Every citizen owns a share of the whole" is a promise he should confirm or strike). The
  citizen count no longer stands in the title; it is on the day cards. Phone width and Safari
  not seen.

### 2026-11-11, nineteenth round

- **Asked:** the day's title stood twice in the film's window (top left and the film's own
  title in the centre): keep only the centre title and the figures. And a large play button
  that restarts the film from the start, full screen (with sound when there is sound).
- **Delivered:** the top-left title is gone; the film's own title card is the one title. At
  the bottom left, a large sun-gold play button and beside it the day and its figures
  (citizens, joined, length). The play button sends the film back to its first frame, plays
  it and asks for the window to go full screen, where only the film shows. The film's title
  card now reads "Maia City · Day 2".
- **Good:** seen in the pane at 1440: one title, the play button with the figures; clicking it
  restarted the film at its title card.
- **Then:** Samuel found the bottom-left placing poor; the play and the figures now stand centred at the bottom, and the framed film's subtitles sit higher (30% from the bottom) so they clear them.
- **Then:** the film's title moved into the upper third, and the subtitles below the play and the figures (front page only; the story editor's film keeps its subtitles at the bottom too).
- **Broke / not there yet:** full screen did not open in the app's browser pane (the pane
  does not allow it, as far as could be seen); not tried in Safari. There is no sound yet.

### 2026-11-11, twentieth round

- **Asked:** make it 1.3 million.
- **Delivered:** the title reads "1.3 million humans build their own solarpunk city."
- **Good / not there yet:** a one-word change; not looked at in the browser.

### 2026-11-11, twenty-first round

- **Asked:** more dry land and less green overall in the world. Lenses as its own "debug /
  performance" tile on the dashboard. A proper preview picture for day 2: the tent from above,
  slightly angled. Then: the bottom pill as in the legacy maiaCITY play (Back, a large round
  button that goes home, the MC badge), and the intents and their detail opening from it like
  there, as a sheet with Close.
- **Delivered:**
  - The world: the dry land's threshold lowered in both land files (CPU and GPU), so about half
    the land is dry now (measured over a 12 km square: 0.51), grass on it thinner, and the
    green itself yellows sooner. The tent's spot stays green.
  - Day 2's preview: filmed in the game (camera 16 m east, 16 m up, 20 m south of the tent,
    looking down past it to the river), kept as `Stories/0001-…/preview.jpg` by a new dev route
    of the game (`POST /story-preview`). The dashboard shows it wherever a day has one: the day
    card, the film's window before it plays, the game tile.
  - The dashboard: a wide dark tile "Debug & performance · Lenses" that opens the lens bench.
    The pill at the bottom: Back, a large round forest button with the sun (the dashboard),
    and the MC badge (the front page). Intents and Stories open as sheets over the dashboard,
    each with its name and Close.
- **Good:** seen in the pane at 1440: the preview in the game tile, the Lenses tile, the pill,
  the Intents sheet with its document. The dev servers were restarted for the new routes.
- **Broke / not there yet:** the world's change was seen only in the preview's frame, not
  walked. The game's own top bar (on its pages opened directly) is unchanged. Day 2 has two
  citizens and the world still has one tent. Phone width and Safari not seen.

### 2026-11-11, twenty-second round

- **Asked:** yes, the game's own top bar becomes the pill too. The pill is far too large.
  Compact and deduplicate the dashboard's header (the site's name, then "Inside", then the
  name again).
- **Delivered:** the game's pages opened on their own (walk, lenses, a film) carry the same
  pill as the dashboard instead of the top bar: Back, home (the dashboard, `#city`), MC (the
  front page); the film's and the lenses' bars stand above it. The game reads the dashboard's
  address from `VITE_OS` (the worktree's game runs with 5181). The pill is smaller on both:
  52 px tall, a 64 px home. Inside, the site's header is hidden and the dashboard has one line:
  the mark, "Maia City", and the day with its citizens.
- **Good:** seen in the pane at 1440: the dashboard's one-line header and small pill, the lens
  bench with its bar above the pill, the drier land in the lens view.
- **Broke / not there yet:** the game's own links to its kept timelines and stories (the old
  top bar's) are gone from its pages; they are reached from the dashboard. Phone width and
  Safari not seen.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-11 | `7702d1b` | The intents system (template, skill), this intent, its story and film, story playback with captions in the game, the OS dashboard, one dev command; the devlog removed |
| 2026-11-11 | `7c7b951` | The brand, the front page, the game's overlays in the brand, story 01 retold with subtitles, TheStory renamed Stories |
| 2026-11-11 | `877bf95` | The mark and a brand grown from it, liquid-glass overlays, the story's film on its page, the Game tab and lens bench bugs fixed |
| 2026-11-11 | `8ada702` | Story 01 as a dialogue, the first tent, the film timeline redesigned, the headline, a fourth look |
| 2026-11-11 | `1424393` | Four standalone brand sheets and their overview; the film bar's grid fixed |
| 2026-11-11 | `997b522` | The four sheets removed; eight brand drafts as whole landing pages and their overview |
| 2026-11-11 | `7ff3909` | Brand draft 09, Line: the reduced one (banner, the line of days, the devlog) |
| 2026-11-11 | `dd196b9` | Draft 09: the new title, the line scrubbed into the years, the wall of days in light |
| 2026-11-11 | `54eed0c` | Brand draft 10, Meadow: the rounded, earthy rebrand of draft 09 |
| 2026-11-11 | `5ebff50` | Meadow in the product: brand file, dashboard front page with a shot from above per day, the game's overlays |
| 2026-11-11 | `88a814e` | Front page as one banner and one strip with the calendar of days; the film's bar reduced |
| 2026-11-11 | `3f7e4da` | Words alone above the film, film on scroll, all 5,423 days as dots, the game full window |
| 2026-11-11 | `1d17df3` | Visit Maia City and its dashboard, the bottom pill, the calendar as rows of cards, the meadow as day 2 |
| 2026-11-11 | `469297a` | The story editor: film without bars, timeline with shot stills, voices and playhead |
| 2026-11-11 | `37bc7f9` | The sub line in its own pill under the title |
| 2026-11-11 | `72e693d` | The count named citizens; day 1 with one citizen |
| 2026-11-11 | `09ed3e2` | The day line without "This is" |
| 2026-11-11 | `626e39c` | The eyebrow over the title, the button under the film |
| 2026-11-11 | `d89a00c` | The eyebrow reads "This is the story of how" |
| 2026-11-11 | `86be478` | 1 million in the title, the 16-years pill, Welcome to Day 2, the why section, story 01 retitled |
| 2026-11-11 | `f2669f9` | One title in the film window, the large play from the start in full screen |
| 2026-11-11 | `2b90a8c` | Play and figures centred, subtitles lifted |
| 2026-11-11 | `59cd937` | Title in the upper third, subtitles under the play |
| 2026-11-11 | `3aedce8` | More dry land, day 2 preview from the game, Lenses tile, legacy pill and sheets |
| 2026-11-11 | `3f29932` | The pill on the game pages, smaller; one-line dashboard header |
