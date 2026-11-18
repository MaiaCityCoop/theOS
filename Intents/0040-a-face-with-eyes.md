---
id: "0040"
title: A face with eyes
state: propose         # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story: Stories/0040-a-face-with-eyes/
---

# 0040 · A face with eyes

## Idea

> Ok eyes and face is the worst at the moment the body is okay for now

Samuel, on seeing the Body after intent 0039's second round. The body's skin stands for now; the face and the eyes
are what most read as not a person. Intent 0039 listed why, under "what still stands between the Body and the gate":

- **The eyes are painted balls** seen through a small hole in the skin: no lids, no bulge of the cornea, no wet rim,
  no shade under the lid, no lashes, no brows; and they stare.
- **The face is a mask:** a blunt nose without wings, the lips a pink band, no groove under the nose, ears as flaps.
- And seen close on 2026-11-18, a fault of 0039's own second round: the neck's hold to its outline cut into the chin
  and the jaw, so the lower face melts into the throat.

The gate is Samuel's, from 0039: a photorealistic body and movements. This intent is a step towards it for the face,
not the gate passed.

## Define

Samuel named what is worst and the plan holds no surprise beyond it, so it is built straight away. **The rule "our
own code only" stands** (he has been asked twice and has not lifted it): the face is shaped by our code from
published measures, no head taken from anyone.

**How, and why this way.** A face is the hardest thing to grow from numbers: three earlier tries at masses of its own
(a brow ridge, a cheekbone, a jaw line) stood as shelves and lumps (intent 0036). So what can be drawn exactly is
drawn exactly, per pixel, and only the rest is left to the shape:

| | How | Why |
| --- | --- | --- |
| **The eye's opening** | The skin runs over the globe as closed lids do; the opening is cut out of it per pixel along an almond drawn from the eye's measures | A lid's edge is finer than any point of the skin: cut per pixel it is a clean line at any distance |
| **The eyeball** | Its own shader: the white shaded under the lid, the iris set back behind a bulging cornea, a dark ring where they meet, the sun's glint, a wet line on the lower lid, the pink corner | The research: a body is judged by its eyes first; none of this needs finer geometry |
| **Lashes and brows** | Lashes as fine strands along the upper lid's line; brows as hairs drawn in the skin's shader along the brow's arch | Hair as geometry over a whole head is a round of its own; these two frame the eye |
| **The lips** | Their red inside an outline with a bow, and the line where they part, drawn per pixel | The band was a blot laid on the points |
| **The face's shape** | A finer cage over the face (rings 6 mm apart, points nearer together in front); the nose's wings and nostrils; the chin and the jaw given back | The cage held 12 mm there: no feature of a face is that coarse |
| **Its tone** | The shaved beard's and the scalp's shadow, the lids, under the eyes | A bald, even head reads as an egg |

**Deliverables**

1. Eyes: lids with a clean opening, an eyeball that reads as wet and deep, lashes, brows.
2. A mouth with lips' own outline and their line; a nose with wings and nostrils; a chin and a jaw line again.
3. The face's tone.
4. The tool's stills gain the face's views (front, three-quarter, side, an eye, the mouth).

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The face reads as a face | the tool's stills of the head from the front, three-quarter and the side, and of an eye and the mouth close, beside the stills before |
| 2 | Its measures | the tool prints the face's measures beside a man's (eye opening's length and height, between the eyes' inner corners, nose's breadth, mouth's breadth), each with its source |
| 3 | The body is as it was | `bun tools/body.js`: the body's measures unchanged but for the neck and the head; closed; the five poses |
| 4 | Nothing else changes | `bun tools/scale.js`; `vite build` in `TheGame` and `OS`; `bun tools/registry.js` |

**Out of scope**

- Hair on the head as strands; a beard as hair. Ears' own form. Teeth, tongue, the mouth's inside.
- The face moving: a blink, a look, speech. (The opening is drawn so that a blink is one number later.)
- Whether the rule is lifted for the head: Samuel's, as in 0039.

## Build

**What turned out different from the definition, and why.** The definition said: draw what can be drawn exactly (the
lids' edge, the lips, the brows) and leave the shape much as it was, since masses of the face's own had stood as
shelves and lumps before. The first half was built as written and holds. The second half was wrong: with real eyes in
it the head still read as a mask, and the fault was the shape itself. So the head's form was written out anew. That
is more than the definition asked; it is the same deliverable (a face that reads as a face), reached another way.

**First, as defined** (stills: the eyes read as eyes, the head did not read as a head):

- **The eye's opening** is cut out of the skin per pixel along an almond (`skin/table.js` `EYE`, `eyeOpening`; its
  twin in the shader, `skin/light.js` `eyeOpeningNode`): 30.1 mm long, 9.6 high, the outer corner a little higher. The
  skin runs over the globe as a closed lid does and is thrown away inside the line.
- **The eyeball** has its own shader (`muscles/flesh.js` `eyesOf`): the iris set 2 mm behind a bulging cornea, fibres
  in it, a dark ring at its rim, the pupil; the white off white, veined, shaded under the upper lid and into the
  corners; the sun's glint; a wet line on the lower lid.
- **Lashes**: 78 upper and 34 lower three-sided strands an eye, on the eye's joint. **Brows**, the **lips' red** with
  its bow and the line where they part, the **shaved hair's shadow** on scalp and jaw: drawn in the skin's shader by
  where a point stood at rest.

**Then, why the head was a mask.** Read off the code and the skull, not guessed:

- The head's skin was its skull and its face's muscles softened over two centimetres, an eighth of their relief laid
  back on the front. Every landmark stood near its norm and nothing between them was a face: the forehead fell back
  from the brow, the middle of the face was narrow.
- The lips parted at 1.5985 m. The skull's own teeth meet at 1.6064 m (`skeleton/skull.js`): the mouth lay 8 mm under
  its teeth, the nose's foot a centimetre under the skull's nose opening. So the nose was long, the upper lip long,
  the chin short.
- The lower face had been warped back by 11 mm at the chin and 6 at the lips (`LOWER_FACE`, set from a plate of
  Richer's in an earlier round): that put the skin on the bone at the chin.
- The trunk's outline ended in two head-sized sections (half-breadths 7.4 and 7.9 cm at 1.64 and 1.68 m): the neck's
  own piece stood out beside the jaw as flaps and under the chin as a fold.

**The head's form** (`skin/head.js`, `skin/table.js` `HEAD`). Laid out as a draughtsman lays a head out: its outline
seen from above at sixteen levels from the chin's foot to the crown (where it is widest, its half-breadth, how far
its front and back lie from there, how square each is), the crown closing as a dome. On that ground the nose (ridge,
sides, tip, wing, foot), the lips, the chin, the floor of the mouth under the jaw; in it the hollow over the upper
lid, the eye's two corners, under the lower lid, the line between the lips, the groove under the nose, the furrow
round the nose's wing; the lids a lid's thickness over the globe. The numbers, all as remembered and marked so in the
table: the skull's own levels with the flesh over them; the profile's depths from Arnett et al. 1999 (men's means
from a plumb line through the nose's foot); heights and breadths from Farkas 1994.

- The first form had a shelf of its own: a brow like a visor, and a band of light at every written level (a curve
  through points bends smoothly but not evenly). The brow's mass was taken out, and the levels' numbers are evened
  over four millimetres between the written ones.
- **The profile stands where the measured means put it**, the chin 21 mm behind the nose's tip. Richer's plate had put
  it at 30. The warp is gone. Samuel's eye is the judge of which reads right.
- **The neck** is a column up into the head, closed inside it; the head runs into it over 12 mm, not 22 to 30.
- **Under the chin** the cage's rings may now stand back six times the height between them (2.2 before): the floor of
  the mouth is a shallow slope, not a wedge down to the throat. The neck's least girth went 43.1 cm (intent 0039) to
  45.3 (the new chin's wedge inside the measure) to 39.4.
- **The lift** (the shape's fine forms laid on the smooth surface) now holds over the whole face. Before it was held
  off round the eyes and to a fifth between the features, because the old shape's bumps came through it.
- **Streaks across the cheek** at the shade's edge: the head's normals are now its form's own slope (its faces lie
  askew where a ring with the nose on it meets one without), its curvature is evened twice, its own shade twice more.
  Fainter in the stills; not gone.
- **The eye's corners**: the opening is 30 mm long, the globe 24 across. A first bed behind the globe was too large and
  hid the white from 9 mm out, pink at both ends. Now the white goes on behind the globe to its edge, and the inner
  corner has its small pink mound.
- **Tried and taken out again:** keeping the neck's muscles away from the cheek by a mask. It changed nothing on the
  cheek and left a crease behind the jaw.

**The tool** (`tools/body.js`): five face views among its stills; fourteen face measures read off the skin's points
(the profile is the points on the middle plane); and how deep the head's bones lie under its skin at least, since
the skin no longer comes from them. That check found the brow's bone 1.2 mm outside the skin in the lid's hollow, then
the jaw's angle 0.3 mm outside; both were moved.

## Propose

**What is delivered.** A head that reads as a head and a face that reads as a face, with eyes; not yet a photograph.
Look at it with `bun tools/body.js --stills <folder>` (the game's dev server running): `face`, `face-three-quarter`,
`face-side`, `eye`, `mouth` among twenty stills; or in the library, the Body.

| # | Check | Result |
| --- | --- | --- |
| 1 | The face reads as a face | **Passed, with the gaps below.** The tool drew all twenty stills on 2026-11-18. Beside the stills before: the forehead stands upright where it fell back; the eyes sit in sockets under a brow, with lids, lashes, an iris and a pupil, where two balls looked out of holes; the nose has a ridge, a tip and wings; the mouth has two lips with a line between them, where a pink band lay; there is a chin and a jaw's line, where the lower face ran into the throat |
| 2 | Its measures | **Printed; nine of fourteen within 5 %, two at 5 %, three beyond.** Table below. The norms are remembered, none read for this |
| 3 | The body is as it was | **Passed.** Twelve of the body's thirteen measures to the digit as in intent 0039; the neck 39.4 cm for 43.1 (a man's 39). Open edges 0 at each of the three levels. The five poses: edges stretched by more than half 0.38 %, 1.25 %, 0.47 %, 0.58 %, 1.85 % (0039: 0.38, 1.24, 0.47, 0.58, 1.87) |
| 4 | Nothing else changes | **Passed.** `bun tools/scale.js`: 18 of 18 within their measure. `bun tools/registry.js`: 52 recipes. `vite build` in `TheGame` and in `OS`: built |

Also seen: the Body grown end to end in a page's own workers with the new head, standing, walking and at 30 m
(180 096 triangles near; no error). 90 050 points on a cage of 5 638; laid in 30 s under node.

**The face's measures** (`bun tools/body.js`, mm):

| | is | a man | off |
| --- | --- | --- | --- |
| head, its length | 198.6 | 197 | +0.8 % |
| head, its breadth | 154 | 152 | +1.3 % |
| face, across the cheekbones | 142.7 | 140 | +1.9 % |
| jaw, across its angles | 118.7 | 119 | -0.2 % |
| face, the nose's root to the chin's foot | 128.4 | 122 | +5.2 % |
| nose, its root to its foot | 57.7 | 55 | +5 % |
| nose, its breadth | 36.5 | 35 | +4.4 % |
| nose, its tip before its foot | 17.6 | 19.5 | -9.8 % |
| upper lip, the nose's foot to where the lips part (as drawn) | 20.9 | 22 | -5 % |
| mouth, its breadth (as drawn) | 52 | 54 | -3.7 % |
| eye, its opening's length (as drawn) | 30.1 | 31 | -3 % |
| eye, its opening's height (as drawn) | 9.6 | 10.5 | -8.6 % |
| between the eyes' inner corners (as drawn) | 33 | 33 | 0 % |
| between the eyes' outer corners (as drawn) | 93 | 91 | +2.2 % |

The first five norms are the US Army's survey's, the rest Farkas's; "as drawn" is a line of the table, not a
measure of the skin.

**Known gaps, as the stills show them.** The gate is a photorealistic body; the face is nearer and not there.

1. **The ears** are low reliefs on the head's sides: no rim, no bowl to speak of, nothing behind them. Out of this
   intent's scope, and now the first thing a look from the side catches.
2. **The eyes stare.** They do not blink or look. At the inner corner a dark gap shows between the pink mound and the
   lid. The upper lid's fold is a drawn line; the lid has no thickness of its own.
3. **The nose's tip is broad and soft**, its nostrils are not seen from the front, and one wing shows a pale smear
   where the furrow round it meets the lift.
4. **The lips are flat**: two lips and a line, little shade between them, no light on the lower one.
5. **The skin is one even surface**: no pores that differ from place to place, no hairs in the beard's shadow, no
   line on the brow or beside the mouth, a shaved head. It reads as a painted bust, or a game's face of some years
   ago.
6. **Faint level streaks** across the far cheek in the three-quarter still, at the edge of the head's own shade.
7. **A dark line** where the floor under the chin meets the neck, in the front still.
8. **The jaw's angle** has 0.6 mm of skin over its bone, measured on cells of 6 mm: too coarse to trust either way.
9. **The profile** follows Arnett's means, a centimetre further forward at the chin than Richer's plate. Not judged
   by anyone's eye but mine.
10. **Not seen:** the library on a real GPU, and what the lashes and the eye's extra surfaces cost a frame. Every
    still was drawn through WebGL 2 on a software GPU.

**Samuel's to decide**

- **Accept or reject** this round.
- **What next for the head**, if anything: the ears as forms of their own; hair (head, beard, brows as strands); the
  face moving (a blink is one number in `EYE` now; a look and a jaw are the rig's).
- **The rule "our own code only"**, as in 0039: it stands. This head is the furthest I can see numbers alone taking a
  face; a scanned head or a sculpted one would be truer at once, and is not ours.

## Story

## Archived

---

## Todo

- [x] the chin and the jaw given back (0039's second round cut them)
- [x] the eye's opening cut per pixel; the lids over the globe
- [x] the eyeball's shader
- [x] lashes, brows
- [x] the lips' outline and line; the nose's wings and nostrils
- [x] a finer cage over the face
- [x] the face's tone
- [x] the tool's face stills and measures
- [x] the head's form written out anew (not in the definition: see Build)
- [ ] the ears' own form; hair; the face moving (out of scope here: Samuel's to order)
- [ ] seen in the library on a real GPU, and timed

## Changelog

### 2026-11-18

- **Asked.** Samuel, after 0039's second round: "Ok eyes and face is the worst at the moment the body is okay for
  now".
- **Delivered.** The intent opened and defined. Eyes: lids cut along their edges per pixel, a globe with its own
  shader, lashes, brows. The lips' red and line; the shaved hair's shadow. Then, because the head still read as a
  mask, the head's form written out anew from the skull's levels and published measures of the face (`skin/head.js`),
  the neck a column into it, a shallow floor under the chin. The tool: five face views, fourteen face measures, the
  depth of the head's bones under its skin.
- **Good.** Beside the stills before, it is a face: an upright forehead, eyes in sockets, a nose, two lips, a chin, a
  jaw's line. The four breadths and lengths of the head within 2 % of a man's. The neck 39.4 cm for a man's 39 (43.1
  before). The body otherwise to the digit as it was; closed; the five poses as before.
- **Broke on the way.** The first form had a brow like a visor and a band at every level. The brow's bone stood
  1.2 mm out of the skin in the lid's hollow, then the jaw's angle 0.3 mm. The first bed behind the globe hid the
  white. A mask to keep the neck's muscles off the cheek left a crease and was taken out. A patch script cut a
  third of the table away in memory and stopped before writing: nothing was lost.
- **Not there yet.** Not a photograph: ears as reliefs, eyes that stare, a broad nose tip, flat lips, even skin, no
  hair, faint streaks on a cheek. Three face measures beyond 5 % (the nose's tip before its foot -9.8 %, the eye's
  opening's height -8.6 %, the face's height +5.2 %). The norms are remembered, not read. Not seen in the library or
  on a real GPU.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-18 | ac6f5a5 | the intent opened and defined |
| 2026-11-18 | 387396c | the head's form written out anew; eyes behind lids, lashes, brows, lips; the neck into the head; the tool's face views and measures |
