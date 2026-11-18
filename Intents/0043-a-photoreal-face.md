---
id: "0043"
title: A photoreal face
state: propose         # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story: Stories/0043-a-photoreal-face/
---

# 0043 · A photoreal face

## Idea

> Ok, what's the industry's best practice, that also the three.js world adopted, for natural photorealistic faces we
> can adopt to put on our model?

> Make a deep research and come up with the best plan you believe is giving us the most realistic and still
> performant solution. That is first principles.

> Is there also a female alternative to Lee Perry-Smith? And can we, after we have this base, build an avatar builder
> on top of it that adjusts this base just by giving reference images into it (you as in Fable changing the avatar)?

> If that's the way to go I am happy to adopt him and its female variant.

> Recommend me, after the research finishes, the best-practice approach that gets us towards later customization with
> just reference images, now with one unified workflow; for now a standard male and female base that just has
> different hairstyles and colour in the beginning MVP. And then plan that in our intent.

Samuel, on 2026-11-18, after intent 0042's fifth round (typos tidied). Intent 0042 brought the Body's face from a
mask to a warm, drawn face, and set a photograph of a real smiling man as the face's gate. It also said plainly that
numbers alone would not reach that photograph, and that the rule "our own code only: no third-party meshes, scans or
motion capture" was what stood in the way.

This intent is the answer to that: first the research (what makes a face read as real, how the industry gets there,
what a browser can afford, which scanned heads may lawfully be used, how far scan-free methods go, whether learned
avatars are the better road), then a plan to build from it. With his last line the rule may be lifted for one
scanned head and a female counterpart, **if the research says that is the way to go**. A builder that changes the
avatar from reference pictures is wanted on top of the base, later.

The research is done: its report is [`reports/Photoreal browser face first principles.md`](../reports/Photoreal%20browser%20face%20first%20principles.md),
its six notes are in `research_notes/Photoreal browser face first principles/`. Define is written from it.

## Define

> Ok go for the whole VALID figure, and import one male and one female one. Then visualize in our character lib with
> a few rig moves and expressions. Customization we talk later.
>
> Also give me one link to the webpage where we can view the different characters so we can select two favourites.

Samuel, 2026-11-18 (typos tidied). He asked for this outright and the definition below holds no surprise beyond what
he said, so it is built without a further round. Two things he should know that follow from it: these are the first
meshes in the game that are not grown from our own code (the rule "our own code only" is set aside for them at his
word), and the first binary files of the game in the repository (about 4 MB).

The first plan (one sheet of numbers, our own head, borrowed skin relief), set aside on 2026-11-18, is kept in commit
c7b5ad0. The two researches' notes and the look at ready-made characters are in `research_notes/` and the changelog.

### What is delivered

| # | Deliverable | Check |
| --- | --- | --- |
| 1 | **Two figures as files**: one man and one woman of VALID (the Validated Avatar Library for Inclusion and Diversity, UCF and Google, MIT), whole: body, clothes, eyes, teeth, the woman's hair. Taken as converted to glTF by c-frame/valid-avatars-glb (MIT), unchanged, with the licence's text and a note of where each file came from beside them. | the files are in `TheGame/characters/figures/`, each under 2.5 MB, the licence beside them; a script reads from each file its points, its 84 bones and its 65 shapes |
| 2 | **A kit that stands a figure in the world** (`characters/kit/figure.js`): loads the file, keeps its own skeleton and shapes, brings its arms down from the pose it comes in, sets its feet on the ground, lights it with the light every material shares (sun, sky, shadow, air) and lets it cast a shadow. | stills in the library at noon and with the sun low: lit, shaded and shadowed as the Settler beside it is |
| 3 | **Two recipes** in `characters/`, a man and a woman, each with its measure. | `bun tools/registry.js`: two recipes more; `bun tools/scale.js` passes with them |
| 4 | **A few moves on its rig**: standing (breathing, shifting weight, blinking), walking round the stage, waving to the eye, looking about. | a still of each move for each figure; the feet on the ground in each |
| 5 | **A few expressions from its shapes**: at rest, a smile, a laugh with teeth, surprise, sadness, eyes closed, speaking. The lower teeth and tongue follow the jaw. | a close still of each expression for each figure |
| 6 | **The library shows them**: the character's card gets a row of expressions beside its moves; the address keeps the choice. | the library page opened in a browser with each figure, each move, each expression |
| 7 | **One link** where every VALID character can be seen, for choosing two favourites. | the link, opened |

The checks every change runs: `bun tools/registry.js`, `bun tools/scale.js`, `vite build` in `TheGame/` and in `OS/`.

### Out of scope

Changing a figure's looks (blending figures, skin tone, hair, clothes); our own skin and eye shading on them; driving
the face from a camera; anything generated through fal; the photograph as a gate. The Body (intent 0042) stays as it
is. The figures stand in the library only: nothing in the world or the game uses them yet. Which two figures become
the base is Samuel's to choose from the link; the two imported now are a first pair to see the way working.

## Build

Notes while building, 2026-11-18.

- **The files were taken ready, not converted here.** VALID's own files are FBX of 7 to 8 MB each. Its readme
  names a conversion of all of them to glTF (c-frame/valid-avatars-glb, MIT, Blender then gltf-transform: meshopt and
  WebP), 2 MB each, with the skeleton, the 65 shapes and the lower teeth's 31 shapes kept. The man drawn from both,
  side by side under one light, showed no difference. So the two files are that conversion's, unchanged, at its
  commit `c4719df`; each recipe keeps its file's SHA-256.
- **Which two.** `White_M_1` and `White_F_1` in their casual clothes: the pair already fetched and looked at. A first
  pair to see the way working, not the chosen base.
- **How a move reaches these bones.** The human kit's moves are plain angles for a body that stands turned like the
  world with its arms down. These bones lie each along its own axis and the figure comes with its arms out. So the
  kit makes each turn in the world's axes as the bone lies at rest (own · world⁻¹ · turn · world), brings the arms
  down first (86°, of which the collar bone takes 10°, so the shoulder does not stand up), and turns a forearm and a
  hand from where the arm hangs. The Settler's own walk, idle and wave then run on the figure unchanged. A cheer was
  added, and the pose the figure came in, with nothing turned. The fingers are bent a little at ease.
- **Moves, against the definition.** Define named "looking about" as a move of its own: it is part of standing (the
  human kit's idle looks about). In its place: cheering, and the pose it came in.
- **Feet and eyes.** Three points under each foot (heel, ball, toe), taken where the figure's lowest point lies at
  rest; each step the hips are let down till the lowest touches the ground. The eyes' own bones turn to the camera
  while it is before the face (half a radian to the side at most), else they wander a little.
- **The face.** Seven expressions as weights of the makers' shapes by their makers' names; a blink of its own time;
  the lower teeth's shapes driven by the face's (its tongue's twelve left alone).
- **The look.** One picture holds the whole figure, so what a part is made of is not written anywhere: the gloss is
  each mesh's (eyes wet with a glint of the sky, teeth smooth, the rest matt). The relief is turned onto the surface
  from how the picture lies there, as the file brings no tangents. The hair is drawn from both sides.
- **Read when first wanted.** The reader (three's GLTFLoader and the meshopt decoder) is fetched with the first
  figure, not with the game: two pieces of 46 and 26 kB.
- **Measured by the kit.** A figure's file keeps its points packed, not in metres, so `tools/scale.js` takes what
  the kit measures (`stands`: the lowest and highest point as the bones hold it at rest). Under bun nothing decodes
  a picture, so there the kit reads the file without its pictures.
- **A page of its own for the stills** (`tools/figure.html`, `tools/figure.js`), as the Body has: the library's
  stage does not draw on this machine (below).
- **Not every figure has 84 bones.** Read from all 42 casual files: every body is 41,792 triangles with 65 shapes;
  the skeleton is 84 bones in 19 of them, 99 in 9, 114 in 13 and 129 in one; 12 have their hair as a mesh of its own,
  the rest in the body's own. The kit stood and drew all 42 (for the page for choosing two) without a fault.

## Propose

Proposed on 2026-11-18. Story: [`Stories/0043-a-photoreal-face/`](../Stories/0043-a-photoreal-face/story.md).

### What is delivered, and where to look

- **Two people in the library**: `TheGame/characters/man.js` and `woman.js`, their files and licence in
  `TheGame/characters/figures/`, their kit `TheGame/characters/kit/figure.js`. In the library:
  `library.html?character=175c0572-91a4-4f04-ab66-618cc24d4cb6` (the Man) and
  `library.html?character=672220f1-4a72-4154-b3a6-ce0f8d1cff20` (the Woman); their card has the moves and a new row
  of expressions.
- **Their stills**: 28, every move and every expression of both, sent to Samuel as two sheets; taken again by
  `bun tools/figure.js --stills <folder>`.
- **The page for choosing two**: https://claude.ai/artifact/3LYdouBthVqH1QPvTLGqY1 (private to Samuel): all 42 people of VALID, each drawn through the figure
  kit, a close face at rest and the whole figure waving with a smile; two can be marked and their names copied.
  The library's own sheet of every figure in every outfit: `All Models.pdf` in its repository.

### The checks, as they were

| # | Check | Result |
| --- | --- | --- |
| 1 | the files in `characters/figures/`, each under 2.5 MB, the licence beside them; a script reads its points, bones and shapes | **passed.** `bun tools/figure.js`: Man 1.94 MB, 31,897 points, 58,724 triangles, 84 bones, 65 shapes; Woman 2.05 MB, 36,760 points, 68,120 triangles, 84 bones, 65 shapes; each file's SHA-256 its recipe's; `LICENSE` there. "2 of 2 figures as their recipes say" |
| 2 | stills in the library at noon and with the sun low: lit, shaded and shadowed as the Settler beside it | **not as defined.** The library's stage did not draw on this machine: its picture came out white through WebGPU (the device is lost), for the Settler as well as for the Woman; through WebGL 2 the world does not start. Seen in its place: each figure alone on the tool's page, lit by the same sun and sky light, with the sun to the left and from the front. **Its shadow on the ground was not seen**, nor the figure beside the Settler |
| 3 | `bun tools/registry.js`: two recipes more; `bun tools/scale.js` passes | **passed.** 54 recipes (52 before). Scale: 20 of 20 within their measure; Man 1.815 m, Woman 1.738 m |
| 4 | a still of each move for each figure; the feet on the ground | **passed**, by eye: standing (front and back), two strides of the walk, waving, cheering, the pose it came in with its skeleton drawn; the soles on one level in each |
| 5 | a close still of each expression for each figure | **passed**, by eye: at rest, smile, laugh, surprise, sad, eyes closed, speaking; the lower teeth go with the jaw |
| 6 | the library page opened with each figure, each move, each expression | **partly.** The page was opened on the Woman (`move=wave&face=smile`): its card reads Character · figure, 1.74 m, 84 bones, 65 shapes, 68k faces, five moves, seven expressions. Its stage was white (check 2). The Man's page likewise: 1.81 m, 84 bones, 65 shapes, 59k faces; a click on Laugh and on Cheer turned each on and the address kept both (`move=cheer&face=laugh`). What the clicks did on the stage was not seen |
| 7 | the link, opened | **passed here, not on Samuel's side.** The page was opened as a file in headless Chromium at phone and desktop width before it was published: 42 people (21 women, 21 men, 7 of them without a validated label), two marked, their names in the bar, no sideways scroll at 400 px. The published link itself was not opened from here. All 42 files were read and drawn by the kit without a fault |
|  | `vite build` in `TheGame/` | **passed**, with the size warning it had before (one piece of 509 kB). The recipes' piece 191 → 206 kB; the reader's two pieces 46 and 26 kB, fetched with the first figure; the two files 2.0 and 2.1 MB beside them |
|  | `vite build` in `OS/` | **passed** |

### Known gaps

- **Not seen on a real GPU.** The 28 stills were drawn through WebGL 2 on a software GPU. Through WebGPU, as the
  game draws, both figures were drawn on the tool's page on 2026-11-18 (the round after this proposal, below): the
  Woman waving and laughing, the Man cheering, both faces, read back from the GPU, the Settler beside them for
  comparison, with no fault said by the browser. That is a software GPU still, and not the library's stage: the
  whole world loses its device on this machine.
- **Not seen on the library's stage**: no shadow on the ground, no size beside the Settler, no small picture in the
  list, nothing a click does to the figure.
- **They look like figures of a game, not like the photograph.** The skin is one flat picture of 2048 for the whole
  clothed figure, lit like cloth; the man's smile is stiff; in surprise his lower teeth show oddly. The hair is a
  shell with a picture on it.
- **The shoulders** bulge a little where the arms are brought down from the pose they came in.
- **The toes do not bend; the hands only rest.**
- **Nothing is spared at a distance**: 59,000 and 68,000 triangles however far off; the file is read anew for each
  figure made (the small picture and the stage: twice).
- **In the library only**: nothing in the world or the game uses them.
- **About 4 MB of binary files are now in the repository**, the game's first.
- **The film was not played**; its camera is intent 0041's, and it shows the meadow, not the two.

### Samuel's to decide

- Accept or reject.
- **Which two** of the 42 become the base (the page above); the two here are a first pair.
- Whether figures' files belong in the repository or beside it.
- Then, as he said, how they are changed: later.

## Story

## Archived

---

## Todo

- [x] the research: six lines of inquiry, a report
- [x] the plan, in Define
- [ ] ~~Samuel's go, and his seven decisions~~ (the first plan was set aside)
- [ ] ~~deliverables 1 to 9~~ (the first plan's)
- [x] the second research, stopped at Samuel's word; the ready-made open characters looked at
- [x] Samuel's go for the whole VALID figure
- [x] the two figures as files, with their licence
- [x] the kit that stands a figure in the world's light
- [x] the two recipes; a few moves; a few expressions
- [x] the library's row of expressions
- [x] the checks, the stills, the link for choosing
- [ ] seen on the library's stage, on a real GPU (not possible here)
- [ ] Samuel's two favourites

## Changelog

### 2026-11-18

- **Asked.** Samuel: the industry's best practice for natural, photoreal faces that the three.js world has adopted;
  then a deep research and the best plan for the most realistic and still performant solution, from first
  principles; whether there is a female counterpart to the Lee Perry-Smith head; whether an avatar builder can adjust
  the base from reference pictures; and that he is happy to adopt that head and a female variant if that is the way
  to go.
- **Delivered so far.** A first answer from memory and four quick searches (the industry measures a real head;
  three.js has adopted the delivery side, not the skin). The intent opened. The research started: two of six lines
  are back (what makes a face read as real; the industry's pipeline and its budgets), both from search extracts only,
  since nearly every primary host is blocked from this environment.
- **Not there yet.** Four lines of research, the report, the plan.

### 2026-11-18, the report and the plan

- **Asked.** Samuel, while the research ran: a recommendation of the best-practice approach that leads to later
  customisation from reference pictures alone, with one unified workflow; for the MVP a standard male and female
  base that differ at first only in hairstyle and colour; and the plan of it in this intent.
- **Delivered.** The research's report (six lines of inquiry, 153 sources, each claim marked by how it was known).
  The recommendation and the plan in Define: one sheet of numbers and one build for every avatar; our head kept,
  real skin relief borrowed from the one scan that may ship, used as donor, control and examiner and not as the face;
  the woman by the same workflow; nine deliverables in the order the evidence gives; seven decisions for Samuel.
- **Good.** The research answers the questions it was asked, and says what it could not read.
- **Not there.** No scan of a woman with a licence that allows shipping was found. Most evidence is search extracts:
  nearly every primary source was blocked from the research environment. Nothing can be timed here: there is only a
  software GPU. Nothing is built: Define waits for Samuel.

### 2026-11-18, the plan set aside

- **Asked.** Samuel, on the report and the plan: "Ok. This isn't helpful so far. Let's research cutting-edge
  AI/Opus/Fable-native workflows like generating a reference image character sheet, a character shoot movie for
  movement rigging, and then maybe something like Tripo AI or image-to-3D model workflows. Like Tripo, 3D AI Studio
  etc." (typos tidied).
- **So.** The plan in Define is not approved and is set aside as it stands. A second research is started on
  AI-native character pipelines: generated character sheets, generated video for movement and rigging, image-to-3D
  generators, automatic rigging, and an agent driving the whole. Define will be rewritten from it.

### 2026-11-18, the research stopped; ready-made open characters looked at

- **Asked.** Samuel, while the second research ran: "Best if it's drivable via fal"; "Do they have already pre-made
  male and female characters we can start in MVP right away?"; "Ok, which of those are the most realistic photo-like
  ones, and can you give me a few reference screenshots of each lib, of each 1 male and 1 female image, and their
  links? Only of truly open-source libs that we can use" (typos tidied). Then, as typed: "Old top the research and
  control to give me the reference threejs models libs", read here as: stop the research and go on giving the
  reference three.js model libraries.
- **Delivered.** The second research stopped as it stood: four of its five lines are notes (image-to-3D generators,
  character sheets, video and movement, an agent driving the whole through fal); the fifth (rigging and game-ready
  avatars) was stopped unfinished and left no note; no report was written. In its place the open, ready-made
  characters were fetched and drawn in three.js by hand: Microsoft Rocketbox (MIT), VALID (MIT), a MakeHuman woman
  (CC0), CharMorph's Antonia and Reom (CC-BY), each licence read from its own file; and the reusable three.js tools
  beside them (TalkingHead, CharacterStudio, Mesh2Motion). The note:
  `research_notes/AI native character creation workflows/ready_made_open_characters.md`. The renders went to Samuel
  directly and are not in the repository.
- **Good.** A man and a woman with a full set of expression shapes can be loaded in three.js today from two
  libraries under MIT.
- **Not there.** None of them stands beside the photograph. A MakeHuman man could not be built here. fal cannot be
  called from this environment (no key, hosts not allowed), so nothing was generated. Nothing was seen on a real
  GPU. Define still holds the first plan, set aside, and waits for Samuel's choice of a way.

### 2026-11-18, VALID looked at closer; a recommendation asked for

- **Asked.** Samuel, on the sheets: "Ok, is there also a three.js-based avatar editor/creator? That lets us adjust
  appearance? VALID looks the most promising so far. Can we learn anything else from this? https://img2threejs.io"
  and then: "Don't start yet. With all the new insights what do you recommend?" (typos tidied).
- **Delivered.** Nothing built. Two things checked and added to the note: VALID's four fetched figures share one
  mesh and one UV layout, the same 65 shapes and 84 bones (an earlier count of some 500 bones was the loader's and
  is corrected); and img2threejs read from its repository. The recommendation was given to Samuel in words; Define
  is not rewritten until he says which way.

### 2026-11-18, a man and a woman brought in

- **Asked.** Samuel: "Ok go for the whole VALID figure, and import one male and one female one. Then visualize in
  our character lib with a few rig moves and expressions. Customization we talk later. Also give me one link to the
  webpage where we can view the different characters so we can select two favourites." (typos tidied).
- **Delivered.** Define rewritten to that and built without a further round, as he asked for it outright. Two of
  VALID's figures in the game as files, unchanged, with their licence; a kit that reads a figure, lights it with the
  world's light, moves it with the Settler's moves on its own bones, keeps its feet on the ground, turns its eyes to
  the camera and drives its face's shapes; two recipes, Man and Woman; the library's card with a row of expressions;
  a tool that checks each file against its recipe and takes its stills; the scale check taught to measure a figure.
  28 stills, as two sheets, sent to Samuel. A page with all 42 of VALID's people drawn through the same kit, for
  choosing two: https://claude.ai/artifact/3LYdouBthVqH1QPvTLGqY1. The story and its film's timeline.
- **Good.** Both figures stand, walk, wave, cheer and change their faces; the registry (54), the scale check (20 of
  20) and both builds pass; the kit drew all 42 people without a fault.
- **Not there.** The library's stage does not draw on this machine, for the Settler either: the figures were seen
  alone on a tool's page, through WebGL 2 on a software GPU, never through WebGPU, so their shadow and their place
  on the stage are not seen. The first stills run stopped two short because the tool's page was changed while it
  ran; it was run again whole. A file server over the game's build, meant to let Samuel look from outside, was
  refused by the session's safety check and not started. They look like figures of a game, not like the photograph.

### 2026-11-18, the two figures through WebGPU; held there

- **Asked.** Samuel, after asking how clothes could be made changeable (the answer named three levels): "Don't do
  Level 1 and 2 yet, just deliver the male and female to our character lib browser now. Then when done stop for a
  moment." (typos tidied).
- **Delivered.** Nothing of the clothes was begun. The Man and the Woman are in the library as they were proposed,
  on this branch. What was still open about them was looked at: whether they draw through WebGPU, as the game
  draws. The tool's page failed there, and for the Settler in the same way: three takes the game's stand-in for the
  shadow's map for the picture's own depth and gives it no sampler. The page now keeps a small map of its own, and
  can read its picture back from the GPU (`read`), as this machine's browser shows no WebGPU canvas in a still. Read
  back so: the Settler, the Woman waving and laughing, the Man cheering, both faces, each drawn rightly, no fault
  said.
- **Good.** The figure kit's skin, shapes, pictures and light are now seen through WebGPU, not only through WebGL 2.
- **Not there.** Still a software GPU, and the tool's page, not the library's stage. The library on the website is
  built from `main` (CI on a push to `main`, then the deploy to `next`): the two are in that library only once this
  branch is merged, and no pull request was asked for, so none was opened. Held here, as he asked.

### 2026-11-18, brought up to `main`; not merged: the code gates

- **Asked.** Samuel, told that the website's library is built from `main`: "Or merge deploy to next".
- **Delivered.** The branch brought up to `main`, which had gone 250 commits on since the branch left it. This
  branch's four intents renumbered 0041 to 0044 (`main` has its own 0039 and 0040); `main` merged in, four conflicts
  resolved (two ignore lists, two assets, the registry made anew: 60 recipes); the six recipes `main` had added
  given short descriptions as the others have. Run here on the merged tree, as `main`'s CI runs them: lint (298
  files, no problem), the smoke gate (every material and pass built), the artifacts' check, the sign-in checks (67
  passed), the scale check (26 of 26), both builds; and the words check (115 of 115) and the figures' (2 of 2). The
  Woman and the Man drawn again on the merged code.
- **Not there: not merged.** `main`'s code gates (`bun tools/health.js --base origin/main`, which CI runs on every
  pull request) fail on this branch: 4 new clones, 11 functions over the ceiling of 20 (the skin's `targetOf` at 146),
  15 new unused exports, 5 more mode branches, about 100 new hand-set numbers. Most of it is the Body's skin, face
  and ear (intents 0041 and 0042); of the two figures and the cards: two functions of the figure kit, the library's
  `character`, one clone between the two recipes, two mode branches and some fifteen numbers. No pull request was
  opened: it could not have merged. `main`'s own rule also puts a merge through its master's train and a run on the
  GPU machine, which this session is not and has not.
- **Samuel's to decide:** to bring only the two figures and the cards to `main` now, on a small branch of their own
  made to pass the gates (it needs his leave: this session may push to its one branch only); or to clean the whole
  branch, the Body's skin code with it, which is a longer piece of work and asks how a sculpted form's numbers are
  to be held under the rule against hand-set numbers.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-18 | 4555070 | the intent opened; the research's first notes |
| 2026-11-18 | cfa9633 | the research's notes complete (six lines) |
| 2026-11-18 | c7b5ad0 | the research's report; the recommendation and the plan in Define |
| 2026-11-18 | 8591fee | the first plan set aside at Samuel's word; a second research asked for |
| 2026-11-18 | 855503a | the second research's notes as they stood (four lines; 8b7d33c, 1a0ba18, 6095120, e8cbdc2 before it) |
| 2026-11-18 | 1b20753 | the second research stopped; the note on ready-made open characters |
| 2026-11-18 | d029e1b | VALID checked closer (one layout for all four figures); img2threejs read |
| 2026-11-18 | ec65986 | a man and a woman of VALID brought in whole; the figure kit, its moves and expressions; the library row; the tools |
| 2026-11-18 | c923301 | proposed: the checks as they were, the page for choosing two, the story |
| 2026-11-18 | d9102cc | the two figures through WebGPU on the tool page (its own shadow map, the picture read back); held |

On its branch this intent was numbered 0041, and its commits' messages say `Intent: 0041`. It was given 0043 on 2026-11-18,
when the branch was brought to `main`, where 0041 had meanwhile been taken by another intent.
