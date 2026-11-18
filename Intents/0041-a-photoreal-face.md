---
id: "0041"
title: A photoreal face
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story:                 # Stories/0041-a-photoreal-face/, set at propose
---

# 0041 · A photoreal face

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

Samuel, on 2026-11-18, after intent 0040's fifth round (typos tidied). Intent 0040 brought the Body's face from a
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
the face from a camera; anything generated through fal; the photograph as a gate. The Body (intent 0040) stays as it
is. The figures stand in the library only: nothing in the world or the game uses them yet. Which two figures become
the base is Samuel's to choose from the link; the two imported now are a first pair to see the way working.

## Build

## Propose

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
- [ ] the two figures as files, with their licence
- [ ] the kit that stands a figure in the world's light
- [ ] the two recipes; a few moves; a few expressions
- [ ] the library's row of expressions
- [ ] the checks, the stills, the link for choosing

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
