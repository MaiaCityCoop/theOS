---
id: "0041"
title: A photoreal face
state: define          # idea | define | build | propose | story | archived
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

**Set aside by Samuel on 2026-11-18** ("This isn't helpful so far"): he asks for AI-native workflows to be researched
instead (see the changelog). What follows is the plan as it was proposed, kept for the record until Define is
rewritten from the second research. Nothing of it is built.

### What the research found

Most of it rests on search extracts: nearly every primary source was blocked from the research environment. The
licence texts and the three.js code were read themselves. The report marks every claim.

- **What makes a face read as a photograph**, in the order the evidence supports: light and the picture's making;
  the eyes; uneven skin; a plausible form with every feature equally real; a smile of the whole face; hair. Two cues
  have experimental proof, and our head has both: skin that is too smooth, and no reflection of a light in the eye.
  And what reads as eerie is not low realism but **unequal** realism: real skin under drawn brows is worse than a
  drawn face.
- **Every flagship face starts from a scan of a person.** What the scan gives at run time is maps and expression
  shapes, not triangles: our head is already several times denser than a MetaHuman's.
- **Numbers alone give the optics and the scales of skin, not its irregularity.** In the one study with numbers,
  structured procedural pores beat plain noise 162 to 48, and detail fitted to a real person beat that 216 to 162.
- **A learned or Gaussian-splat head is the wrong road**: it cannot be lit by our sun without a light-stage capture,
  has no animated path in three.js r187, and every leading method is closed to commercial use.
- **One man's scan may ship; no woman's could be found.** The Lee Perry-Smith head is CC BY 3.0 (licence read): yes,
  with a credit. Every scan of a woman found is for non-commercial use only.
- **A browser can carry it**: a compressed set of four maps costs 13 to 21 MiB at 2K, 53 to 85 at 4K. **No source
  gives a browser timing for any of it**, so we measure.
- **A builder from reference pictures has a shipped precedent** (NetEase, about 300 face numbers fitted to a photo),
  and it works by measuring landmarks and optimising, with a language model only as a critic.

### The recommendation: one sheet of numbers, one build, for everyone

**Every avatar is one sheet of numbers, and one workflow turns any sheet into a person.** A sheet holds who it is
(the form of body and head), its colours (skin as pigment and blood, eyes, hair), its hair (which style, how long),
and its expression. The standard man and the standard woman are two sheets. A hairstyle or a colour is a line in a
sheet. Later, a builder that looks at reference pictures writes a sheet, and nothing else changes: that is why this
is the road to customisation from pictures. It is also how the industry's own character makers work: one layout,
one set of maps' coordinates, identity as parameters, hair as an exchangeable part.

**Keep our head; borrow real skin.** The head that ships stays the one written in numbers, because a sheet needs
numbers to change and a scan has none. Light, eyes, colour, pores, teeth and hair are built from published optics
and measures, in our own code. One thing is borrowed, because numbers alone have not been shown to supply it: the
**measured relief of real skin**, from the Lee Perry-Smith scan, laid onto our head's own map coordinates under our
pore layer.

**I recommend against making him the face**, though Samuel has offered it and copyright allows it. His is a real
man's likeness, on a body the game shows naked, and the licence says nothing about likeness. No woman's scan may
ship, so the two would differ in kind. And one scan gives a builder nothing to adjust. He serves three ways that
carry no likeness into the game: as **donor** of skin relief, as **control** (his scan drawn in our own renderer
beside our head tells light and shader apart from the asset), and as **examiner** (our numbers fitted to his form
show in millimetres where ours departs from a real head).

**The woman is the same workflow with a woman's numbers**, body and head. She is not a second pipeline, and until a
woman's scan can lawfully be had she shares the donor's fine relief if it reads rightly on her. Her body is real
work: our skeleton, muscles, fat and outline are a man's of 1.80 m.

### The MVP

A standard man and a standard woman from the same workflow, each close to the photograph's gate in a portrait, each
with a choice of **hairstyles** and of **colours** (hair, skin, eyes), picked in the library.

**Deliverables**, in the order the evidence gives (the weakest feature first, and no feature far ahead of the rest):

| # | Deliverable | Why here |
| --- | --- | --- |
| 1 | **The yardstick.** The donor's scan drawn as it is in our own shader and light, beside our head and (on Samuel's screen) the photograph, in colour and in plain grey. A switch and a timer for every feature | Separates renderer from asset and form from surface before anything is spent; turns every later claim into a measurement |
| 2 | **The sheet.** One table for an avatar: form, colours, hair, expression. The face's rest stored without the smile, the smile as a line in the sheet. The head rebuilt alone in seconds, not the whole body in thirty | The one workflow; what a builder will write later |
| 3 | **Light and the picture.** A soft key over a sky's own light, soft shadows from nose and lids, exposure and a warm balance, for the portrait views and holding under the game's noon, sunset and shade. A trial of a screen curve that keeps skin's hue | The largest expected step: it gates the two proven cues |
| 4 | **Eyes and lids.** A cornea that bends light over a deep iris with a dark rim, a shaded white, the lid's shadow on the globe, the tear line, lashes' shade, a sharp reflection of the key light | The strongest evidence of all; ours are the first thing a look tests |
| 5 | **Skin on maps.** Map coordinates laid with the cage; colour from pigment and blood (a skin tone is two numbers); pores and fine lines grown as a structure, their slopes breaking the highlight; a soft lobe for the down on skin; maps baked once and compressed | Over-smooth skin is the other proven cue; structure beat noise 162 to 48 |
| 6 | **The donor's relief.** A fitted match between the scan and our head; its relief and gloss laid onto our coordinates as the middle scale under our pores; a mild unevenness between the two sides, as faces have (0.6 to 0.8 mm). Built only if deliverables 1 and 5 show it adds something | Fitted detail beat unfitted 216 to 162 |
| 7 | **Hair.** Brows, lashes and stubble as hairs rooted in the skin. Scalp hair as styles grown by code from one generator: at least four (shaved, short, medium, long), the same for both. Colour from two pigment numbers. Cards for far views | The MVP's choice; and real skin under drawn brows is the mismatch the research warns of |
| 8 | **The woman.** A woman's numbers for skeleton, muscles, fat, outline and head, through the same build | The second standard base |
| 9 | **The picker.** In the library: man or woman, hairstyle, hair colour, skin tone, eye colour. It writes a sheet; changing hair or colour does not rebuild the body | The MVP as someone uses it |

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The yardstick stands | the tool draws scan, our head and both in grey from the same cameras; it prints each feature's cost. **Timings need a real GPU**: this environment has only a software one, so they are run on Samuel's machine or said to be not run |
| 2 | One workflow | `bun tools/body.js --sheet man` and `--sheet woman` build both from two sheets and nothing else; the head alone rebuilds in under five seconds, printed |
| 3 | Light | the portrait stills under three lights (portrait, noon, shade); the key light's reflection is in each eye |
| 4 | Eyes | the eye still beside a photograph of an eye; no gap, no hard line at the corners |
| 5 | Skin | the tool prints cheek and forehead colour beside measured skin's ranges, and the maps' memory: at most 21 MiB at 2K, 85 at 4K |
| 6 | The donor earns its place | Samuel picks blind between stills with and without it; the credit line shows in the game and a licence file sits beside the maps |
| 7 | Hair | stills of four styles on both; hairs counted and their cost printed |
| 8 | The woman | her measures beside a woman's (the army survey's women); one closed skin; the five poses |
| 9 | The picker | open the library, change each choice, see it; times printed |
| 10 | Against the gate | Samuel, each stage, with the photograph beside the portrait still: nearer or not. The plan does not promise the gate passed |
| 11 | Nothing else changes | `bun tools/scale.js`; `vite build` in `TheGame` and `OS`; `bun tools/registry.js`; frame time in the game no worse, measured where it can be |

**Out of scope** (each a later intent, on the same sheet)

- **The builder from reference pictures.** Landmarks found on the device, an optimiser over the sheet's numbers,
  colour statistics for tone, the language model as a bounded critic; the picture never becomes the skin. The sheet
  and the examiner of this intent are its ground.
- **A face that moves**: a full set of expression shapes (from a permissively licensed set), wrinkles driven by how
  the skin stretches, blinks, gaze, speech. This intent keeps a rest and a smile.
- **A phone tier** and a close-up scattering pass.
- **A woman's scan.** None may ship today. If the donor's relief does not read rightly on her, the way on is a
  capture of a consenting woman with a written release, or a bought scan whose seller confirms web delivery in
  writing.

### Samuel's to decide before anything is built

1. **The rule.** Lift it for one donor's skin relief (and his scan as control and examiner), keep it for identity:
   the recommendation. Or keep it whole and accept a cleaner, more regular face. Or adopt his whole face for the man.
2. **The woman without a scan**: the same head and body with her numbers, sharing the donor's fine relief if it holds.
3. **Her body**: in this intent as deliverable 8, or an intent of its own beside it. It is the largest single piece.
4. **The screen curve**: whether a curve that keeps skin's hue may be tried for the whole game's picture.
5. **The photograph**: whether it enters the repository as the gate's picture. Every stage is judged against it.
6. **A real GPU**: nothing here can be timed. The timings of check 1 need Samuel's machine.
7. **A lawyer, before launch, not before building**: the credit's wording and likeness for the donor; pictures of
   people for the later builder.

## Build

## Propose

## Story

## Archived

---

## Todo

- [x] the research: six lines of inquiry, a report
- [x] the plan, in Define
- [ ] Samuel's go, and his seven decisions
- [ ] deliverables 1 to 9

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

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-18 | 4555070 | the intent opened; the research's first notes |
| 2026-11-18 | cfa9633 | the research's notes complete (six lines) |
| 2026-11-18 | c7b5ad0 | the research's report; the recommendation and the plan in Define |
| 2026-11-18 | 8591fee | the first plan set aside at Samuel's word; a second research asked for |
| 2026-11-18 | 855503a | the second research's notes as they stood (four lines; 8b7d33c, 1a0ba18, 6095120, e8cbdc2 before it) |
