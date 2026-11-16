---
id: "0035"
title: One measure for everything
state: build              # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story: Stories/0035-one-measure-for-everything/
---

# 0035 · One measure for everything

## Idea

> Regarding tent and human body and fire place and trees etc. sizes. Can you create a universal SSOT scale src for
> every asset to have proper sizing also in relation to each other. So every asset is measured against its source.
> Do you see what I meant?

Everything in the world has a real counterpart with real measures: a person, a bell tent, a fire pit, a stone pine, a
cobble. Samuel wants one source of truth that holds those measures, each with where it comes from, so that every asset
is built to it and measured against it, and so is right in metres and therefore right next to every other.

**What the code holds today:** every size is a number in its own file, some in prose ("a man's height"), and nothing
measures what is built against anything. Read on 2026-11-16:

| Thing | Its numbers | Where |
| --- | --- | --- |
| The walker's eyes | 1.7 m | `camera/rig.js`, `src/camera/walk.js` |
| The walker's body | 0.3 m round, steps over 0.3 m, knee 0.55 m, 1.8 m tall; shrubs walked through below 1.5 m, "about a walker's shoulder" | `src/world/bodies.js`, `assets/kinds.js` |
| The Settler, the avatars | 1.74 m; 1.55 to 1.95 m | `characters/settler.js`, `characters/kit/avatar.js` |
| The bell tent | 5 m across, wall 0.62 m, peak 3.0 m, door reaching 2.05 m | `assets/belltent.js` |
| The fire pit | a ring of stones 1.3 m across, seats 0.44 m high, 1.74 m from the middle | `assets/firepit.js` |
| The flame | 0.9 m | `assets/flame.js` |
| Stone pine, holm oak | to 20 m and 21 m, by age | their files' curves |
| Mastic, reeds | "a man's height" (and more) | their files |
| Grass | a blade 0.58 m | `assets/grass.js` |
| Stones, boulders | 0.05 to 0.55 m; 0.5 to 4.2 m | `assets/stone.js`, `assets/boulder.js` |

Already one disagreement: eyes stand at about 93 % of a person's height, so the walker's 1.7 m is a person of about
1.82 m, while the Settler, 1.74 m, has their eyes at about 1.63 m: walking, your eyes are 7 cm higher than those of
the library's first person. Intent 0033 (a real body) is bringing body measures in from public surveys, each cited:
the person in this measure is theirs.

## Define

_A draft for Samuel to approve or change. Not built before._

**Deliverables**

1. **The measure, one file** (`TheGame/world/scale.js`, beside the world's other sources of truth): for every kind of
   real thing the world draws, its measures in metres, a tolerance, and its **source**: what it says and where (a
   public survey of bodies, a standard for doors and seats, a maker's sheet for a 5 m bell tent, the botany of each
   species, the sedimentologists' scale for stones and boulders). The person in it is intent 0033's reference body;
   the walker's eyes, reach, step and shoulder, a seat's and a door's height follow from that body.
2. **Every size read from it.** Each asset, the walker (`camera/rig.js`'s eye, `src/world/bodies.js`, `assets/kinds.js`)
   and the person take their measures from the file; no size of a real thing written anywhere else.
3. **Measured against its source.** `bun tools/scale.js` builds every asset of the registry (each level of detail,
   each stage of growth) and the person, measures what was built, and compares it with its source: a table, and a
   failure where anything is out of its tolerance. CI runs it, so nothing drifts later.
4. **The lineup.** Every asset beside the Settler at true size, with the walker's eye line, in the library: the
   relations seen at a glance.
5. **What is off, set right**: each disagreement listed with its source, and changed, shown before and after.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Every asset and the person have a source | the table from `bun tools/scale.js`: thing, source, its measure, what was built, the difference |
| 2 | Everything within its tolerance | the same run passes |
| 3 | A wrong size is caught | an asset changed off its source makes the run fail |
| 4 | The relations, seen | a still of the lineup in the library |
| 5 | Nothing changed that was right | stills against main where no size changed; before and after where one did |
| 6 | The gates | `vite build`, the check in CI; frame time no worse (a size that changes can change what is drawn) |

**Out of scope**

- The body's own anatomy and proportions: intent 0033's.
- The stress world's generated kinds (`assets/zoo`): a later round.
- Buildings: there are none yet; they take their measures from here when they come.

## Build

Samuel approved the definition: "do make 35".

**The measure** is `TheGame/world/scale.js`: the reference person (`PERSON`: the Settler, 1.74 m, with where on them
the eyes, shoulders, hip, knee and ankle are, the shares of stature intent 0033's body is built from), the walker who is
you (`WALKER`, worked out from the person), and every recipe of the registry by its uid (`THINGS`: 14 assets and the
Settler). Each says what it is in the world outside, how tall a grown one stands (`typical`), the tallest a real one
grows (`most`), or for rocks their widest side (`across`), and its sources: makers' sheets of 5 m bell tents and of
campfire rings, seating guidance, the RHS and the floras for the plants, the sedimentologists' grain-size scales for
rocks, ANSUR II and Drillis & Contini for the body. Where no source was found it says so (`own`): the flame's height, a
fallen branch's, the walker's room round the arms and over the hair, how far the fire pit's seats stand from the fire.

**What reads it:** the bell tent (its round, wall, peak, the pole's cap, the door), the fire pit (its ring, its seats),
the flame (its tallest tongue), the stone pine and the holm oak (what their height by age comes to), the Settler (its
stature), the camera (`camera/rig.js`: the walker's eyes and the first key), what is solid (`src/world/solids.js`,
`src/world/bodies.js`: the walker's round, the shin, the head, the knee; `assets/kinds.js`: a shrub stops you from the
shoulder up), and the old walk controller nothing uses any more (`src/camera/walk.js`). Every asset that should not
change was built before and after and hashed, every level and shape: the same to the byte (the fire pit, the flame,
both trees, the mastic, the bracken, the moss, the dead wood, the grass, the stones, the boulders, the Settler's mesh).

Not as the definition said: "no size of a real thing written anywhere else" holds for the measures a thing is built
from, not for a plant's own shapes (a mastic's two mounds, a reed clump's three heights) or how much a placement scales
them: those are which bush it is and how much they vary, so they stay its recipe's, and the run checks every shape at
every scale against the measure instead. The avatars' range (1.55 to 1.95 m, `characters/kit/avatar.js` and its copy in
the API) stays where it is: intent 0033 is changing the avatar. The films' cameras (three shots of `cine/trailer.js` at
"eye height", 1.7 m) and the tools' views (`tools/bench.js`, `tools/shots.js`) keep their 1.7 m: they are shots,
composed.

**The run**, `bun tools/scale.js`, builds every asset and character of the registry as the game builds it, in Bun: the
game's modules glob their folders the way Vite does (`import.meta.glob`), so `tools/glob.js` does that for Bun, and the
registry is imported first, as the game does (the recipes import it back). Plants: every shape at every level, times
their placement's scale (a tree: its stage of growth at its stand's ages, as `src/scatter/trees.js` grows it), set
0.15 m into the ground as a stand sets them (`FOOT`, now exported). Made things: every level as made. Rocks: as
`src/scatter/rocks.js` draws them. The grass: the blade times its tuft's share. The Settler: built with a stand-in
texture (38 088 vertices) and measured feet to hair: 1.752 m. Five and a half seconds; CI runs it after the sign-in
checks. A far level that stands more than a fifth taller or lower than the near one is noted, not failed.

The registry versions a recipe with what it builds with; the measure is now one of those (`tools/registry.js`, SHARED),
so a changed measure gives each recipe that reads it a new version. Its uids are of what it measures, not of what a
recipe uses, so they are not read as uses (at first they were, and every recipe that reads it used every other: a ring).

**The lineup** is the first item of the library's assets (`library.html?lineup=1`): every asset beside the Settler,
each as the library stands it (a tree at seventy, a bush at its own size, rocks small to large), the people-sized
things next to the Settler and the trees at the ends, on a bare round (the meadow's grass, to 1.3 m, hid what is small),
a gold line at the walker's eyes over each, looked at square on from the walker's eyes, so the gold line lies on the
horizon. The wheel goes back to see all of it. Its card lists each thing with its measure. The grass is the meadow's
own, round the stage.

**Found and set right** (the run, before):

- **The walker's eyes**: 1.7 m, a person of about 1.82 m, while the Settler's eyes are at 1.629 m. Now 1.629 m.
- **The tent's door**: 2.05 m high and 1.76 m wide at the ground. Makers' 5 m bell tents have doors of 1.5 to 1.8 m
  (2.0 m only on an XL with taller walls) and 1.32 m wide. Now 1.8 m and 1.32 m. Going in, the walker stoops 8 cm
  under its top (the camera's eyes keep 0.25 m under what is overhead), as people do.
- **The rockrose** stood up to 1.51 m. The sage-leaved rockrose grows to 1 m, and its own file says "knee to hip
  high". Its placement's scale 0.5–1.3 is now 0.45–0.85: 0.36 to 0.94 m, a middling one 0.59 m.
- **The reeds**: a middling clump stood 1.81 m; common reed's stems are 2 to 4 m. Their scale 0.8–1.3 is now 1–1.6:
  1.55 to 3.41 m, a middling one 2.28 m.
- **The walker's body**: its knee 0.55 m is now the person's, 0.496 m; what is stepped over, under the shin's middle,
  0.3 m is now 0.282 m; a shrub stops you from 1.5 m, now the shoulder, 1.423 m, as `assets/kinds.js` said it was. Its
  round (0.3 m) and head (1.8 m) are kept: room for the arms, a hand over the hair.

**Found and not set right** (`known` in the measure: the run shows it and does not fail on it):

- **Stones and boulders are drawn about twice the size their recipes say.** `src/scatter/rocks.js` draws a rock's
  largest side as its size times its shape's span, 1.8 to 2.6 (`assets/kit/rock.js`: "a rock of size 1"), while the
  recipes' own words, the library's card ("Length 7–55 cm") and the measure read the size as its length. Stones are
  drawn 0.12 to 1.42 m across, a middling one 0.29 m (cobbles are 0.064 to 0.256 m); boulders 1.2 to 11.9 m, a
  middling one 2.8 m ("up to four metres"). Set right, every stone and boulder in the world is about half as large,
  and the engine draws the stress world's rocks too: Samuel's choice.

**The rocks and the trees, set right at their source** (the second round: Samuel, through the coordinating session:
"Stones and boulders should match their actual sizes: SSOT this globally and generatively"):

- **Where the rocks' factor two came from.** The rock kit grows a shape at a size of 1 (its largest side then, its
  `span`, is 1.8 to 2.6) and draws it in a frame where its largest side is 1; the rocks' engine
  (`src/scatter/rocks.js`) then scaled a rock by its size *and* its span again, and so did the library's stage and
  picture and what stops the walker (`src/world/rocksolid.js`, the same factor, so what stopped you matched what you
  saw); the stress world's stand, which sizes every kind by its look, sized a rock by its span: about 2 m, stone and
  boulder alike.
- **Now a rock of size s is s across, everywhere**: the engine, the library, what stops the walker, the stand (a rock
  kind's size: the size the world draws most of its rocks at, from its asset). An outcrop makes its boulders larger
  more often, as before, but never past their most (the engine and the walker's bodies alike). The stones' and the
  boulders' sizes are the measure's (`STONES`, `BOULDERS` in `world/scale.js`): 7 to 55 cm, 0.7 to 4.2 m, as their
  recipes always said. No engine scales a rock by anything of its own.
- **Trees had the same kind of drift, twice.** The engine drew a tree at the height its age asks over its stage's
  height by age, while the shape is built taller than that (its crown's top over its form): saplings stood 14 to 27 %
  too tall, grown trees 5 to 14 %. Now over the shape's own built height (`sizeAtOne`). And between its stages a tree's
  height ran straight from where its stage began to where it ended, missing its height by age by up to 31 % (a holm
  oak of six); now through its stage's own year, straight in the logarithms of age and height (`heightIn` in the tree
  kit, the same on the graphics card), on the graphics card and in the library alike.
- **The run measures what is drawn**: rocks built at every level of the ladder and measured in the frame they are
  drawn in, times their size; what stops the walker against how far the drawn rock reaches over the ground (0.65 to
  0.76 of it: the kit's 0.7, a little inside its outline, by the same size); a rock's drawn least and most against its
  own size (its lumps stand up to 6 % over); trees at five ages through every stage, as the engine draws them and as the
  library stands them, each within 5 % of its height by age or the run fails.
- **Every asset's geometry is the same to the byte** as on main (`50b42d6`): meshes, solids, sizes. Only how the
  engines scale what they draw has changed.
- Found on the way: the ladder's cube (one square an edge, drawn between 4 and 8 pixels) is 25 to
  30 % narrower than a rock's full mesh, a pixel or two, as it was; the holm oak's finest level stands up to 7 % over
  its near one.

**Each measure next to its thing** (the third round: Samuel, through the coordinating session: "The size info should
be always co-located with its asset definitions but measured against the global scale"). Not as the definition said:
the measure is no longer one file of every thing. Each recipe carries its own (`measure`: what a real one measures,
its sources, and what it is built from), next to what it is: the tent's, the fire pit's, the flame's, both trees', the
stones' and the boulders' are built from it; the bushes', the grass's, the moss's and the dead wood's are read beside
them; the Settler's is in `characters/settler.js`. `TheGame/world/scale.js` is the one scale they are all read
against: the units, the reference body (the Settler's stature and where on it the eyes, shoulders and knees are: one
copy, which intent 0033's tables are to read), the walker worked out from it, the tolerances, and the rules a measure
keeps (`faultsOf`). The run reads every recipe's own measure, holds it to those rules and to what the recipe draws,
and fails where they disagree or where a recipe has none (tried: the flame's measure taken out, and a mastic's most
set under its typical: both exit 1). It sets each thing beside the reference body too: a stone pine stands 10.6
Settlers, the tent 1.83. Every asset's geometry is the same to the byte before and after the move.

**Found, outside this intent** (in the Todo): a tree's youngest stage is built taller than its own height by age
(a holm oak of 6: 1.51 m against 1.19 m; a stone pine of 5: 1.55 m against 1.36 m), so saplings stand 14 to 27 %
taller than their age; and a sapling's far levels stand up to 36 % taller than its near one. Speeds are not sizes:
the walker walks 3.2 m a second, about twice a person's pace.

## Propose

**Delivered** (branch `feat/lens-and-scale-defined`, pull request #24):

- `TheGame/world/scale.js`: the measure, with its sources.
- `TheGame/tools/scale.js`: the run, `bun tools/scale.js` (and `tools/glob.js`, Vite's globs for Bun); a step of CI.
- The recipes and the walker reading it, and four things set right: the walker's eyes, the tent's door, the rockrose,
  the reeds (and the walker's knee, shin and shoulder).
- The lineup: the library's first asset, `library.html?lineup=1`.
- The story: [`Stories/0035-one-measure-for-everything`](../Stories/0035-one-measure-for-everything/story.md).

**Checks** (headless Chromium, WebGPU on SwiftShader; main `c8257cd` against this branch):

| # | Check | Result |
| --- | --- | --- |
| 1 | Every asset and the person have a source | **Passed.** Every recipe of the registry (14 assets, the Settler) has its measure and its sources; the run's table below. What no source was found for says so (`own`) |
| 2 | Everything within its tolerance | **Passed, two known out.** 13 of 15 within their measure; the stones and the boulders are out (drawn about twice their size: Build), said in the measure as `known`, shown by every run, not failing it |
| 3 | A wrong size is caught | **Passed.** Three tries, each put back after: the mastic's scale pushed to 2–3 (a middling bush 4.1 m): exit 1; the camera's eye at 1.7 m again: exit 1; the flame's measure taken out: exit 1 ("no measure") |
| 4 | The relations, seen | **Passed.** The lineup from the walker's eyes, 14 m off the Settler: the tent, the fire pit with its seats and flame, the Settler, bracken, rockrose, dead wood, moss and stones at their sizes, the gold line on the horizon; and from 76 m back, all of it with the two trees at the ends |
| 5 | Nothing changed that was right | **Passed.** Every asset built before and after and hashed, at every level and shape: the same to the byte but the tent's three nearer levels and its solid (the door), and the rockrose's and the reeds' placement (their meshes the same). The game as it starts: the camera 1.700 m over the ground on main, 1.629 m here, the door narrower and lower. The pine wood's floor from 1.6 m, the same camera on both: 407 pixels of 518 400 differ by more than 8 in 255 |
| 6 | The gates | **Passed.** The game as it starts (the walker's view by the tent, 480 × 270, the governor free), three runs each: frame medians 2538 to 2577 ms on main, 2551 to 2571 here; 95th percentiles 2653 to 3043 against 2635 to 2683; the GPU's own time of the picture 2358 to 2427 ms against 2330 to 2358, of the shadow pass 194 to 250 against 189 to 199; the same draws (27 in the shadow pass, 170 in the picture). The canvas at the screen's own ratio and the inside at 1 on both (the governor does not count SwiftShader's frames of seconds). `vite build` of the game and the dashboard: CI's "Build both sites for next" on this branch's head, passed; the run itself, a step of the same CI, passed in 3.6 s. Not timed: the reeds, a quarter taller, by the lakes (no lake in a timed view) |

The run on this branch:

| Thing | By | Drawn: least, middle, most (m) | Real: typical (most) | |
| --- | --- | --- | --- | --- |
| Bell tent | height | 3.18 | 3 to 3.3 (3.4) | ✓ |
| Boulders | across | 1.22, 2.84, 11.94 | 0.512 to 2.048 (8.2) | known out |
| Bracken | height | 0.79, 1.34, 2.15 | 1 to 2 (5) | ✓ |
| Dead wood | height | 0.08, 0.19, 0.37 | 0.05 to 0.5 (0.6), its own | ✓ |
| Fire pit | height | 0.465 | 0.4 to 0.5 (0.6) | ✓ |
| Flame | height | 0.93 | 0.5 to 1.2 (1.5), its own | ✓ |
| Grass | height | 0.29, 0.55, 1.28 | 0.3 to 1.2 (1.5) | ✓ |
| Holm oak | height | 0.16, 20.59, 24.18 | 12 to 25 (25) | ✓ |
| Mastic | height | 0.45, 1.20, 2.49 | 1 to 4 (8) | ✓ |
| Moss cushion | height | 0.04, 0.11, 0.20 | 0.05 to 0.15 (0.3) | ✓ |
| Reeds | height | 1.55, 2.28, 3.41 (before: 1.21, 1.81, 2.75) | 2 to 4 (6) | ✓ |
| Rockrose | height | 0.36, 0.59, 0.94 (before: 0.41, 0.84, 1.51) | 0.3 to 1 (1) | ✓ |
| Stone pine | height | 0.33, 19.34, 21.86 | 12 to 20 (25) | ✓ |
| Stones | across | 0.12, 0.29, 1.42 | 0.064 to 0.256 (1.02) | known out |
| Settler | height | 1.752 (feet to hair) | 1.6 to 1.8 (2) | ✓ |
| The walker | eyes | 1.629 (before 1.7) | the person's: 0.936 × 1.74 | ✓ |

**Known gaps**

- The stones and boulders: drawn about twice their recipes' size; Samuel's choice (Build).
- Not seen on Samuel's iPhone, nor in Safari or on a real GPU.
- The person's measures are written here with the same sources and numbers as intent 0033's tables, which are not
  merged yet (`characters/kit/measures.js` on its branch): once they are, one should read the other.
- The lineup is the library's: a tree at seventy and a bush at its own size, not each at its middle; the reeds, the
  mastic and the trees are small in the frame that holds them all.
- A sapling's stages and far levels stand taller than its curve (Build); the walker's pace is not a size.

## Story

Samuel's yes: "Merge it". The story is [`Stories/0035-one-measure-for-everything`](../Stories/0035-one-measure-for-everything/story.md),
"Everything its own size", a film of 48 seconds (`timeline.json`), in beats:

1. One tent on a meadow, a fire, a Settler, trees, bushes, stones: each made on its own, nothing holding their sizes
   to each other or to the world outside.
2. Samuel asks for one source of truth: every asset measured against its source.
3. One file, every measure with its source; the tent, the fire, the trees, the Settler and the walker built from it;
   a run that measures everything against it on every change.
4. What it found: eyes of a taller person behind the Settler's face, a door higher than any bell tent's, a rockrose
   taller than its species, reeds shorter than theirs. Set right.
5. What it found that is Samuel's to decide: the stones, drawn twice the size they say.

It ends when the film plays in the game: not yet seen played.

## Archived

---

## Todo

- [x] Samuel: is this what he meant; approve or change the definition ("do make 35")
- [ ] Agree with intent 0033 where the reference body's numbers live (the same numbers in both for now)
- [x] Build, check, propose
- [ ] Samuel: the stones and boulders, drawn about twice their size: set right (halved) or kept
- [ ] The walker's eyes from your own avatar's height, not the reference person's
- [ ] A sapling's youngest stage built to its own curve; its far levels at its near level's height
- [ ] Seen on Samuel's iPhone

## Changelog

### 2026-11-16

- **Asked:** one source of truth for the size of everything, every asset measured against its source.
- **Delivered:** the intent opened: every size the code holds today and where, the first disagreement found (the
  walker's eyes against the Settler's), and a definition to approve.
- **Good:** the sizes are few and plain to find.
- **Broke / not there yet:** nothing built; Samuel's yes first.

### 2026-11-16 (2)

- **Asked:** "do make 35" (with "what makes lens wise sense?", answered in intent 0034).
- **Delivered:** the measure (`world/scale.js`): the person, the walker, every recipe of the registry with its
  sources; the tent, the fire pit, the flame, both trees, the Settler, the camera and what is solid reading it; the run
  (`bun tools/scale.js`), in CI; the lineup in the library; set right: the walker's eyes (1.7 → 1.629 m), the tent's
  door (2.05 → 1.8 m high, 1.76 → 1.32 m wide), the rockrose (to 1.51 → to 0.94 m), the reeds (a middling clump
  1.81 → 2.28 m), the walker's knee, shin and shoulder. The story.
- **Good:** every asset and the Settler build in Bun in five and a half seconds; what should not change is the same to
  the byte.
- **Broke / not there yet:** the stones and boulders are drawn about twice the size their recipes say: found, not set
  right, Samuel's choice. Not seen on a phone.

### 2026-11-16 (3)

- **Asked:** "Merge it".
- **Delivered:** the intent to Story (its story's beats, the link to its folder); pull request #24 marked ready and
  merged into main.
- **Good:** CI green on the pull request's head before the merge.
- **Broke / not there yet:** the stones' and boulders' size is still Samuel's to choose; intent 0034 waits for his
  "go"; not seen on a phone; the film not yet seen played.

### 2026-11-16 (4)

- **Asked** (Samuel, through the coordinating session): "Stones and boulders should match their actual sizes: SSOT
  this globally and generatively." The intent goes back from Story to Build for it.
- **Delivered:** every rock drawn at its size, everywhere (the engine, the library, what stops the walker, the stress
  world's stand), its sizes the measure's; trees drawn at their height by age (over their built height, and through
  each stage's own year); the run measuring the built meshes, the colliders and every tree's age.
- **Good:** 15 of 15 within their measure; every asset's geometry the same to the byte.
- **Broke / not there yet:** the stills and the frame times against main are being taken.

### 2026-11-16 (5)

- **Asked** (Samuel, through the coordinating session): "The size info should be always co-located with its asset
  definitions but measured against the global scale."
- **Delivered:** each recipe's measure in its own file; `world/scale.js` the one scale (units, the reference body, the
  walker, the tolerances, the rules); the run reading every recipe's own measure against them and against what it
  draws; the lineup's card reading them too.
- **Good:** every asset's geometry the same to the byte; a recipe without a measure, or with one that breaks the rules,
  fails the run.
- **Broke / not there yet:** the stills and the frame times against main are being taken.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `58cf67c` | the intent opened and defined: every size the code holds and where, one measure with its sources |
| 2026-11-16 | `5bb42ef` | two long lines folded |
| 2026-11-16 | `e46439a` | the measure (world/scale.js), the recipes, the camera and the solids reading it, the run (tools/scale.js) in CI, the lineup, four things set right |
| 2026-11-16 | `4ba3170` | built: the Build section, the changelog |
| 2026-11-16 | `9a3f76e` | proposed: every check with its result, the run's table, the gates; the story spawned |
| 2026-11-16 | `7a339cc` | Samuel's yes: the intent to Story, its story's beats |
