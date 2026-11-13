---
id: "0013"
title: Story arcs
state: propose         # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0013 · Story arcs

## Idea

Samuel, 2026-11-12 (typos tidied): "now let's talk about our basic storytelling timeline architecture. Each story
should consist of multiple scenes/shorts, each 1–3 min long: 1 intro/hook, 2 trailer, 3 short 1 … , big relief / arc
delivery of the hook's promise, outro / CTA. The whole story should be 10+ minutes (a YouTube long form, cinematic
format). Each short itself has the same rhythm inside: a major pressing question or challenge, the tension, and its
relief towards its end, with the mini challenges and failures along its way. Each short should have its own
scene/setting and its own emotional ground tenor and feeling and also dynamic (fast cutting vs slow, calm vs hectic).
The better the shorts alternate in their opposing contrast, the better! The transitions between shorts, the gateways,
need to be as contrastful as possible and should be clearly stated. Go create story day 1 in its first timeline viewer
tab, just visualizing the different contrasts/emotions per short. Each short we would extract standalone and cross-post
on all social media platforms, so each short needs to also work standalone. Colour code and name in each section all its
contrasting senses: colours, paces, music, emotions, feelings. Scene 1 should be the visionary section by me introducing
the Maia City project itself, before we transition over to the game creation dev-log part. Tab 1 is purely about
defining each section and their emotions and tension arcs, locally per short and globally across the whole story, not
about text, script and content. Just clearly state each tension before and after, the contrast cycles!"

## Define

Built as asked, with the rules of intent 0012 (state in files, changed only by a tool, a page that only shows).

**Deliverables**

1. An arc's shape: `Stories/<story>/arc.json` (hook, trailer, shorts, relief, outro; per section its setting, emotion,
   feeling, pace, dynamic, colour, music, question, release, tension before, at its peak and after, its beats, its gateway).
2. The tool `bun Stories/arc.js`, which refuses an arc that breaks the rules (order, a short of 1 to 3 minutes that
   rises and is released, ten minutes and more, neighbours that differ, every gateway said).
3. The Arc page, the studio's first: the whole story's tension as one curve, the sections side by side in their
   colours, the gateways between them.
4. Day 1's arc, built on the ideas of the board, its first short the vision.
5. The skill `.claude/skills/story-arc/SKILL.md`.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | the arc is stored and passes the rules | `bun Stories/arc.js put day-0001`, `show` |
| 2 | the page shows it | Stories → Before the city, a world → Arc |
| 3 | the rest of the dashboard as before | the front page, the story of day 2 |

**Out of scope**

- Hook, script, lines, shots, the film: the next steps.
- The posted shorts' own small intros and calls to action (templates, later).

## Build

- Day 1, "Before the city, a world", 16 minutes: hook (still), trailer (frantic), then six shorts: the vision (slow,
  majestic, gold), the river (medium, playful, teal), the tree that failed (fast, tense, pine green), the forest's floor
  (slow, intimate, rust), the storm (frantic, hectic, steel and white), a day and a night (slow, majestic, amber into
  indigo); the relief, one rise from the tent to three kilometres; the outro at dusk.
- The order is for contrast, not for when things were built: the quietest minute (the floor) stands before the storm.
- A story can now stand as an arc alone: the shelf shows it ("arc, 16 min"), its studio opens on the Arc page.
- Paces and dynamics are fixed lists, so two neighbours can be compared; a colour is a name and a hex.

## Propose

**Delivered:** `Stories/arc.js`, `Stories/day-0001/` (`arc.json`, a first `story.md`), the Arc page in `OS/src/main.js`
and `OS/index.html`, `arc.json` served and listed by `OS/vite.config.js`, the skill.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | "arc of day-0001 put"; `show`: 10 sections, 16 min |
| 2 | passed | the page drew 10 sections and 9 gateways, the curve on top, Arc the open tab; no console error |
| 3 | passed | the front page showed "Day 2 of 5,423" as before, no console error; the story of day 2 not opened again |

**Known gaps:** looked at in the built-in browser, not in Safari. The sections scroll sideways (ten cards and nine
gateways are wider than a screen). The front page's calendar now finds a story at day 1: not looked at closely.

## Story

## Archived

---

## Todo

- [x] the arc's shape, its tool, the page, day 1, the skill
- [ ] Samuel reads day 1's arc: the order, the contrasts, the tension numbers
- [ ] from an arc to its hook and script

## Changelog

### 2026-11-12

- **Asked:** a story as hook, trailer, shorts, relief and outro; every section's contrasts named and colour coded; the
  tension before and after; the gateways said; day 1 made, its first short the vision; no script.
- **Delivered:** the five deliverables above.
- **Good:** the rules are in the tool, so an arc with two alike neighbours cannot be stored.
- **Broke / not there yet:** nothing broke.
- **Asked (later):** "we want to copy our actual trailer from the old maiacity repo, the play trailer. Are you able to
  access it and store it as its own shorts/timeline? Also let's standardize the vocab: a scene = short, and each scene
  is a composable timeline that other story timelines can contain and compose; our trailer would be just a scene
  timeline too. The trailer had already soundtrack, video, voice over, that we want to import, incl. its content, reffed
  by BLAKE3 hashes, that we don't commit into our repo for now but colocate as objects in an objects folder (flat, all
  hashes). Then also extract its captions/transcript correctly so you understand the vibe, feeling and text."
- **Delivered:** a scene is a short everywhere (the arc's kind, the page, the skill). `Stories/scenes.js` and
  `Stories/scenes/trailer/scene.json`: the trailer of play (story 25fa4cdd, its version 31), 23 s, 7 shots, voice, notes,
  music, one effect. Its 14 objects (7 stills, 3 videos, 4 sounds, 15 MB) in `Stories/objects/`, each hashing to its
  name, out of git (`.gitignore`), listed in `Stories/objects.json`. Day 1's trailer section names the scene and takes
  its real feeling (hope; cinematic, friendly; teal into gold). The dashboard serves scenes and objects (ranges too).
- **Found:** the MCP's file read returns media as text, broken (28,660 replacement characters in one small sound); the
  server's own route gives the bytes with the MCP's Authorization.
- **Not there yet:** nothing plays a scene in the studio yet; the trailer's music keys and its filter are kept in the
  file but no player reads them.
- **Asked (later):** "combine the player with our timeline so it supports both, a real 3D world instance with the
  virtual camera like now, combined with the other stuff. Also the original footage should be 16:9, I believe. And
  learn what you can from the player of our play legacy editor studio."
- **Delivered:** one player (`TheGame/cine/media.js`, on the film page's own clock): a scene's shot is the live world
  under the virtual camera, or footage; over both its sounds and its subtitles. `timeline.html?scene=<id>`; the scenes
  on the Stories page, each opened in the studio with its stills, subtitles, voices and music on the timeline.
- **Learned from the old player** (`play/site/src/lib/stories/compose.ts`): one clock and everything seeked to it;
  video muted, from its in-point, held to the next shot; transitions as codes; a voice's cues as subtitles, one set
  apart alone and large; gain in dB with keys, fades and a filter on a track's own gain; the picture never cropped.
- **Seen (headless Chromium, WebGPU):** the trailer in the studio at 0:06: the arch shot, "better way of living.",
  Samuel's take 5.4 s in, the music 7.05 s in at 0.248 (its −14.1 dB, +3 on its track, −1 by its keys); 7 shots with
  their stills, 7 subtitles, 2 voice takes, the music and one effect on the timeline. A test scene of world, footage,
  world played with the camera on the river, the footage over it, then the world again at 17:30 (and was removed).
- **Found:** the footage as play keeps it is 1080 x 1080: every take was made 16:9 and cropped to its centre square
  (the trailer's version notes say so). The uncropped takes are not among the trailer's files.
- **Found:** a film's first shot kept the game's hour: the film loads before the sky is made, and the camera
  remembered having set it. It now asks the sky itself.
- **Asked (later):** "the playback is quite stuttery and not smooth at the moment for the video trailer. It's smooth as
  long as the voice doesn't talk, so something wasn't ported well."
- **Found:** not reproduced in Chromium (16.7 ms a frame through the voice), so Safari's. Three things were ported
  badly: each sound was a player chased with seeks whenever it stood more than 0.2 s off (a browser that starts a sound
  late is then seeked again and again); the video the same; and the whole 3D world was drawn under the footage, taking
  the GPU from the video (in Chromium the last shot dropped 49 of 225 frames, to 66 ms).
- **Delivered:** the sounds are decoded once and set on the sound clock itself at a play or a seek (each clip's start to
  the sample), then only their levels move; the video's small drift is taken up by its speed, a seek only past 0.7 s;
  while footage fills the picture the world is neither chosen nor drawn (`stats.covered`, `src/main.js`).
- **Seen (headless Chromium):** the whole trailer at 16.7 ms a frame, none over 25 ms, the last shot too; 3 seeks in
  all (one as each video starts; 14 before); all four sounds decoded and sounding. Not heard in Safari by me.
- **Asked (later):** "Nope" (still stuttering in Safari); and: "if a timeline/scene doesn't have any 3D world game
  scene, we don't need to load the game in the beginning loader, right?"
- **Found (headless WebKit, the slow frames listed by the film's time):** 13 frames of 38 to 59 ms, at 2.89, 5.61,
  7.75, 9.91, 12.04 and 14.77 s: the six cuts, two frames each. Not the voice: every cut lies where Samuel speaks. At a
  cut the next shot's still was decoded and blurred anew for the backdrop.
- **Delivered:** each shot's backdrop is made once at the start (its still, small and dark, on a canvas), a cut only
  shows another; a scene with no world shot loads no game at all (`cine/film.js`: a small clock stands in for the
  camera's), so the trailer is ready in about 0.1 s instead of the game's start.
- **Seen (headless WebKit):** the whole trailer with no frame over 25 ms (the worst 23), 3 seeks; in the studio as before.
- **Asked (later):** the space bar to stop and start playback; and: "voice doesn't stutter anymore, but video playback
  still stutters".
- **Delivered:** in the studio the space bar plays and pauses wherever the focus is (seen: from the page, after the
  play button, inside the film). A playing video is no longer touched at all: no speed taken up (a browser shows a
  video whose speed changes with a hitch), set anew only past half a second; a video not shown is put at its next
  shot's start only while the film is held (set beside a playing one it cost that one a frame: 45 ms at 9.91 s).
- **Seen (headless WebKit):** the whole trailer with one seek (at its start), no speed change, the video 14 ms behind
  the clock throughout, no frame over 25 ms. The stutter Samuel still saw was not reproduced there before this change
  either, so whether it is gone in his Safari is his to say. The footage itself is 24 frames a second.
- **Samuel, in his Safari:** "Yes, smooth" (the trailer's video, after the playing video was left untouched).
- **Asked (later, with two screenshots):** "remove scenes that extend the actual timeline beyond 10 min and add them
  to day 2 instead; the outro should also be a cliffhanger for day 2; no scenes should be having the same mood, they
  each need the biggest contrast possible, in every sense that makes sense, so majestic → majestic should never be
  possible"; "similar high emotions shouldn't be possible to transition either, so hope and belonging can't come one
  after another"; "we need an emotional roller coaster between every scene".
- **Delivered:** the tool now refuses two neighbours with the same pace, dynamic, colour, emotion or charge (a new
  field: `up`, an emotion that lifts, or `down`, one that weighs), a whole outside 10 to 11 minutes, and an outro that
  does not end higher than it began. Day 1 is 10.4 minutes: hook, trailer, the vision, the river, the tree, the rise,
  and an outro that is day 2's cliffhanger (the first gust: does one tent hold?). Day 2, "The weather comes", 10.4
  minutes, is new: its hook takes the gust up, then the trailer, the quiet before (the forest's floor), the thicket,
  the storm, the morning after (snow), and footprints in the snow for day 3. The charge turns at every gateway of both.
- **Not there yet:** "A day and a night" fits neither day now (a story has an odd number of sections so the charge
  can turn): it waits for day 3. The older film of day 2 ("one tent on a green meadow") and the new arc of day 2 are
  two stories of the same day until Samuel says which is which.
- **Asked (later):** "the older film day 2 was just our test timeline, rename it to 'test-gate' scene. It's just a scene
  and no full story anymore."
- **Delivered:** `Stories/scenes/test-gate/`: the old film as a scene of eight world shots (their keys, hours,
  dissolves and dips kept), its title and 18 subtitles as a `captions` track, its eight stills as objects; its
  `story.md` moved beside it. `Stories/0001-intents-stories-os/` is removed. Each day's citizens now stand in its arc
  (`inGame`: day 1 one, day 2 two), read by the dashboard and by the city's card. The idea "the first tent" is raw again.
- **Seen:** the scene in the studio: 8 shots with stills, the title, the subtitles, the third shot's dissolve, 16:24
  at 0:07; the game's story list gives the counts 1 and 2.
- **Follows from it:** no story has a film now, so the front page reads "Welcome to Day – of 5,423", "0 days told",
  and shows no film. Left so: which film stands there is Samuel's to say.
- **Asked (later):** the front page, with no day's film: "The trailer".
- **Delivered:** until a day has its film the front page's window plays the trailer scene, named "The trailer", 0:23, with the game not loaded for it. Seen: playing at 0:03 with its first subtitle; the day count still reads "–" and "0 days told".
- **Asked (later):** "let's also talk about the global curiosity loop arc per story, aka major hook intro to final
  relief. Add a step 1 tab in front of the now step 2 arc, and there we just define the actual title + hook/intro
  first (best practices: front-loading the first 10–15 sec). Also ensure that each storytelling thing that we
  discussed here, you write down as its own skill: hook-skill, arc-skill, idea-skill." Then: "the hook intro is: 1
  title, max 6–12 words; then intro/hook description up to 15–20 sec, that's it. Its internal workings we discuss
  further along." And: "title and hook need to be as thought provoking and attention grabbing as much as we can turn
  the extreme knobs up."
- **Delivered:** step 1, the hook: `Stories/hook.js` and `hook.json` (a title of 6 to 12 words, the intro described,
  20 seconds at most; the tool refuses anything else); the studio's Hook page before Arc, which also shows the loop
  read from the arc (the hook's question, the relief's answer). Day 1: "1.3 million people will live here. Today it is
  one tent." Day 2: "This world has never had weather. Tonight it gets a storm." A first, fuller version of the tool
  (levers, a ledger, intro beats) was thrown away when Samuel said two things only.
- **The skills, one a step:** `storytelling` (the whole, and where each step lives), `story-ideas`, `story-hook` (new:
  push every knob as far as it stays true), `story-arc` (the scenes' part moved out), `story-scenes` (new: scenes,
  objects, importing from play, the player and what keeps it smooth).
- **Not there yet:** a story has two titles now, its arc's working title ("Before the city, a world") and its hook's;
  which the shelf shows is not decided.
- **Asked (later):** "we don't care about our old titles, just have one SSOT in the new system, title + hook, and that
  is also displayed everywhere in our UIs accordingly: the title is the big title, and if place is there the hook is the
  description area."
- **Delivered:** a story's one title and its description are its hook's: an arc keeps none (the tool drops it, and wants
  the hook first), the placeholder `story.md` files are gone, a story is listed by its hook or its arc. The shelf's
  cards show the title large and the intro under it in two lines, the count moved to the top right; the studio's head
  and the arc's page show the same title; the game's story list too.
- **Asked (later):** day 1 rethought, more meta: why at all. When a machine is 1000x smarter than the best human
  genius, we build a city: a positive outlook against the internet's dystopian story; the resolution is "building a
  city becomes possible", first in the game, then for real; this was one day, imagine a year; humanity's true potential.
- **Delivered:** day 1's hook ("When AI is 1000x smarter than any genius, we build a city.": the doom headlines, then
  one tent) and its arc reframed round it: the vision is now "Why a city" (the wager: one person, one AI, one day), the
  river and the tree are its proof and its limit (it fails, a human eye corrects it), the relief is "This was one day"
  (what is a year, what is 5,423 days: building a city has become possible). Order, lengths and day 2 unchanged.
- **Asked (later):** the title as "When AGI is 1000x smarter than any human genius - we build a city."; what the
  "Why a city" scene's own arc is; and every story and every scene must say the viewer's change from a state A to a
  state B (feeling, knowledge, wisdom, entertainment), each stated clearly.
- **Delivered:** an arc says the viewer's change for the whole (`viewer: { from, to }`) and for every section
  (`viewer: { from, turn, to }`); the tool refuses an arc without them, or a section that leaves the viewer where it
  found them. Written for days 1 and 2; the Arc page shows A and B under the title and A, the turn and B at the top of
  every card; the rule is in the `story-arc` skill. The title set as asked: it is 13 words, so a title is now 6 to 13
  (a dash alone is no word). "Why a city" has its own six beats (what AGI lets us build; a city as the hardest thing
  humans make; the hard part made cheap; a city is where a life is decided; the doubt; the wager of one day): the
  reasoning in them is a first draft for Samuel to correct.
- **Asked (later):** it is not so much about the city as about the 100x better way of living; the core theme is the
  food forest, permaculture, co-location: a new way of organising the primitives of our life, in a new world. But in
  the game a world has to be built before the first plant can be planted.
- **Delivered:** day 1's arc turned to that: scene 1 is "A hundred times better" (the primitives of a life pulled
  apart, grown together again round a food forest; the catch: a game has nothing to plant in), the river and the tree
  are the water and the forest a plant needs, the relief ends on a world ready for its first plant. Title unchanged.
  Then, as asked: the why is the wish to live in nature, solarpunk made a plan; scene 1 names that wish as the viewer's own.
  And the hook: the intro to solarpunk; with AGI 1000x it stops being a dream and becomes reality (intro, promise, hook section and relief say so).
  The intro ends on "Here is how we start: first in a game, then for real", then the tent.
- **Asked (later):** every scene is a dialogue between a human and Maia (avenMAIA): Samuel wishes, describes his
  intents and gives feedback, Maia builds the game, he iterates on idea and taste, she builds again; a short intro
  after the trailer ("Hey Maia, tell us how this will all start"); a scene's picture is the human to the camera,
  sometimes short generated vision shots of the future city (5 to 10 s), and mainly the live game through the timeline
  engine; and the viewer of day 1 has zero background (not solarpunk, not the vision): educate them.
- **Delivered:** three more things an arc says, checked by the tool, shown on the Arc page and written into the
  `story-arc` skill: a section's `dialogue` (turns of human and Maia; a scene has four at least and the human opens),
  its `picture` (shares of world, camera, vision, footage; the world is the largest over a story) and what it `teaches`
  a stranger (wanted on day 1 for the hook and every scene). Written for day 1 (scene 1 opens on "Hey Maia…"; AGI,
  solarpunk, food forest, permaculture, Maia and the numbers are each explained where they first appear) and, dialogue
  and picture, for day 2. The intro after the trailer is scene 1's opening turn, not a section of its own.
- **Asked (later):** "Hey Maia" is always part of its scene, never standalone; do not start with actual shots yet; the
  arc outgrew its purpose and is way over-engineered: back to the fundamentals, the viewer's emotional journey and its
  transitions in as compact and simple primitives as possible, every section super tight, the whole story in one look.
- **Delivered:** the arc cut to its primitives. A story says where the viewer arrives (`from`); a section says its
  emotion and charge, its tension, what moves the viewer (`how`) and the state it leaves them in (`to`, the next one's
  start), each one line of 90 characters at most. Gone from the arc and its tool: setting, feeling, pace, dynamic,
  colour, music, question, release, beats, gateways, promise, the picture's shares, the dialogue's turns, the teaches
  lists. Kept as rules: the order, ten minutes, the charge turning at every section. The Arc page is one row of small
  cards under the journey's line (up where it lifts, down where it weighs) and fits one screen; the Hook page shows
  where the viewer arrives and where the relief leaves them. Days 1 and 2 rewritten so; the `story-arc` skill too.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `94f59ee` | hook, arc, scenes, their tools and skills; the trailer as a scene; the one player; days 1 and 2; the front page |
| 2026-11-12 | `8d3e5d5` | the old day-2 film moved to `Stories/scenes/test-gate` (staged earlier, it went in with the ideas' commit) |
| 2026-11-13 | `50126a0` | the arc cut to the viewer's journey (from, emotion, how, to); day 1 reframed round solarpunk; titles 6 to 13 words |
