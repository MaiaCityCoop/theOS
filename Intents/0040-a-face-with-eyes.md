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

### Second round (2026-11-18)

> So ensure we have an actual sparkling eyes friendly positive face. The chin is too wide, going too far to the
> front. The sparkling smile isn't there yet. No sparkling smile yet there. And the ears need to be more realistic.

Samuel, on the first round's stills. He asked for it outright, so it is built straight away; it takes the ears and
the teeth, which the first round left out, into this intent.

| | How | Why |
| --- | --- | --- |
| **The chin** | Narrower and further back in the head's form | His eye against the measured means: the means lose |
| **A smile** | The face's rest is a friendly one: the lips part over the upper front teeth, the opening cut per pixel as the eyes' is; the mouth's corners up and out, the cheeks raised, the lower lids a little higher. Teeth where the skull's stand, and the dark of the mouth behind them | A smile that sparkles shows teeth. The face does not move yet, so the smile is its rest |
| **The eyes' sparkle** | A second light for the eyes alone, the bright sky before the face, mirrored high in the cornea whichever way the sun stands; the iris brighter on its far side | A catchlight is what makes a look alive, and the sun alone gives one only from some sides |
| **The ears** | Each its own closed form with rim, inner ridge, bowl, tragus and lobe, joined to the skin's points; the low relief on the head's side goes | A relief cannot stand off the head, and an ear is mostly what stands off |

**Deliverables:** 5. a chin narrower and further back; 6. a smiling face with teeth; 7. eyes that sparkle; 8. ears
that read as ears.

**Checks:** as before (1 to 4), the stills now judged for a friendly face and for the ears from the side, the front
and behind. Check 3's "the body as it was" allows the head's points and triangles to change (the ears).

**Out of scope still:** hair; the face moving (the smile is fixed; a blink, a look, speech); the lower teeth, the
tongue; the rule.

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

### Second round: a friendly face (2026-11-18)

**The chin.** Narrower and further back in the head's form: its lowest levels' half-breadths 40 → 38 and 44 → 43.5 mm
and their fronts pointed more, the chin's own mass 19 → 17 mm half-broad and 4 mm further back. In the form it now
stands 100.5 mm before the head's middle plane for 104.5, some 25 mm behind the nose's tip (Arnett's mean 21, Richer's
plate 30). Narrowed further at first, the chin's bone corner stood 0.6 mm out of the skin (the tool's check): widened
again until it lay under.

**The smile.** The face does not move yet, so a friendly face has to be its rest. `skin/table.js` `MOUTH`: an opening
between the lips 59 mm broad, the upper lip's edge at 1.6142 m, the lower's at 1.6046, the corners at 1.6122 (higher
than the lower lip's middle: the lower edge is the curve of a smile). Between those edges the head's form stands back
on the teeth's faces, the lips' edges rolled in to them over 2.8 mm (`skin/head.js`); what is inside the edges is
thrown away as the skin is drawn, exactly as at the eyes (`skin/light.js` `mouthOpeningNode`). The lips' masses moved
with it, the lower one rising towards the corners; a soft mass raises each cheek; the lower lids stand 0.8 mm higher
(the eye's opening 8.7 mm for 9.6).

- **The teeth** (`muscles/flesh.js` `mouthOf`): the upper row's ten front teeth as crowns standing where the skull's
  own teeth stand (`skeleton/skull.js` `teethOf`, new: the skeleton is not drawn under the skin, so its teeth could not
  be shown), a cutting tooth thinned to a blade, the canine to a point; behind them one dark surface, the mouth's
  inside. They hang on the head's joint and are shown under the skin only.
- **Went wrong on the way:** the first raised cheek was a mass as large as a plum and stood out at the face's sides
  like a second pair of ears; a fold carved from the nose's wing round the mouth read as scratches and was taken out;
  the first teeth had the skull's narrow necks and, with no gum drawn, dark gaps between them, and were paper white:
  drawn fuller and in ivory.

**The eyes' sparkle.** A second light for the eyes alone (`eyesOf`): the bright sky before the face, set a little up
and to the side of the look, mirrored in the cornea as a small sharp spark and a soft one round it, whichever way the
sun stands; the iris, lit through the cornea from that side, a little brighter on its far side; a little pinker into
the inner corner. At that corner a dark wedge had shown from the side: what lies behind the lids was cut along the
lids' edges as the globe is, and seen from the side what shows past a lid's edge lies outside the opening as drawn
from the front. The white behind the globe and the corner's mound are no longer cut.

**The ears.** Each is a closed form of its own (`skin/ear.js`): an ear stands off the head, and the cage's level
rings cannot draw what stands off. Laid out in the ear's own plane (leaning back 12 degrees, standing off the head):
a thin plate inside an outline, the helix's roll round it, the antihelix and its two legs, the groove between them,
the bowl with the canal's pit, a tragus and an antitragus, a lobe. Meshed at cells of 1.12, 2.24 and 4.48 mm:
12 340, 3 140 and 780 triangles an ear, each level closed. It measures 63.4 mm by 35.9 outside the head (Farkas: 62.7
by 35.4, as remembered) and its rear rim stands 19.3 mm off the head's form at most. Its root lies inside the head's
side, about a sixth of its triangles hidden there. `skin/build.js` joins its points to the skin's (on the head's
joint, with what the skin's shader reads of a point) and its three levels to the skin's three, so the skin's light,
levels and joints carry it; the right ear is the left's mirror. The low relief on the head's side, its gristle and
its carved bowl are gone from the tables. The skin is now three closed surfaces: the body and two ears.

- **Went wrong on the way:** in the first lit still the ear's bowl was the red of raw meat. Its points came with
  their true shade (near black in the bowl) and the cheek's full blood, and the skin's light answers a deep fold with
  the skin's own colour, saturated. The ears' shade is kept above 0.3, their blood under 0.35, their curvature within
  150 a metre.
- The plate is thin (2.4 mm at its thinnest), and the skin's light lets the sun through thin skin: an ear between the
  eye and the sun glows red, as an ear does. Seen in the still from behind.


## Propose

**What is delivered** (both rounds). A head that reads as a head, with a friendly face: eyes with a spark in them
behind lids, a smile over teeth, a narrower chin, ears that stand off the head. Not yet a photograph. Look at it with
`bun tools/body.js --stills <folder>` (the game's dev server running): `face`, `face-three-quarter`, `face-side`,
`eye`, `mouth`, `ear`, `head-from-behind` among twenty-two stills; or in the library, the Body.

| # | Check | Result |
| --- | --- | --- |
| 1 | The face reads as a face, and a friendly one; the ears as ears | **Passed, with the gaps below.** The tool drew all twenty-two stills on 2026-11-18. Beside the stills before: an upright forehead; eyes in sockets with lids, lashes, an iris, a pupil and two sparks of light; a nose with ridge, tip and wings; a smiling mouth, the lips parted over the upper front teeth; a chin and a jaw's line; ears with a rim, an inner ridge, a bowl and a lobe, standing off the head from the front and from behind |
| 2 | Its measures | **Printed.** Table below: nine of fourteen within 5 % of a man's, one at 5 %, the nose's tip 10.5 % short; three are a smile's measured against norms for a face at rest. The norms are remembered, none read for this |
| 3 | The body is as it was | **Passed.** Twelve of the body's thirteen measures to the digit as in intent 0039; the neck 39.0 cm for 43.1 (a man's 39). Open edges 0 at each of the three levels. The body's own points are where they were; the five poses' shares read a little lower (0.34 %, 1.1 %, 0.42 %, 0.51 %, 1.62 % for 0.38, 1.24, 0.47, 0.58, 1.87) because the ears' edges, which do not stretch, are now counted among them |
| 4 | Nothing else changes | **Passed.** `bun tools/scale.js`: 18 of 18 within their measure. `bun tools/registry.js`: 52 recipes. `vite build` in `TheGame` and in `OS`: built |

Also seen: the Body grown end to end in a page's own workers with the smile, the teeth and the ears, standing,
walking and at 30 m (204 776 triangles near; no error). 106 304 points on a cage of 5 638, of them 16 254 the ears';
laid in 31 s under node.

**The face's measures** (`bun tools/body.js`, mm):

| | is | a man | off |
| --- | --- | --- | --- |
| head, its length | 198.6 | 197 | +0.8 % |
| head, its breadth | 154 | 152 | +1.3 % |
| face, across the cheekbones | 143 | 140 | +2.1 % |
| jaw, across its angles | 118.7 | 119 | -0.2 % |
| face, the nose's root to the chin's foot | 126.6 | 122 | +3.8 % |
| nose, its root to its foot | 57.7 | 55 | +5 % |
| nose, its breadth | 36.6 | 35 | +4.6 % |
| nose, its tip before its foot | 17.5 | 19.5 | -10.5 % |
| upper lip, the nose's foot to its edge, smiling (as drawn; a man's: at rest) | 14.4 | 22 | -34.5 % |
| mouth, its breadth, smiling (as drawn; a man's: at rest) | 59 | 54 | +9.3 % |
| eye, its opening's length (as drawn) | 30.1 | 31 | -3 % |
| eye, its opening's height (as drawn; the lids smiling) | 8.7 | 10.5 | -17.1 % |
| between the eyes' inner corners (as drawn) | 33 | 33 | 0 % |
| between the eyes' outer corners (as drawn) | 93 | 91 | +2.2 % |

The first five norms are the US Army's survey's, the rest Farkas's; "as drawn" is a line of the table, not a
measure of the skin. The ear: 63.4 mm by 35.9 for Farkas's 62.7 by 35.4, its rear rim 19.3 mm off the head (its own
lab script's print).

**Known gaps, as the stills show them.** The gate is a photorealistic body; the face is nearer and not there.

1. **The smile is fixed.** The face cannot move, so it smiles standing, walking and squatting alike. Whether that is
   right for the Body's rest is Samuel's to say.
2. **The teeth** are ten smooth crowns of the upper row with no gum between them and none of the lower row: enough
   for this smile, nothing for an open mouth. A thin dark line shows between the two middle teeth.
3. **The eyes do not blink or look.** The pink mound at the inner corner meets the white along a hard line.
4. **The ears:** the tragus is a rise before the canal, not a flap over it; there is a small point where the rim
   leaves the temple; the back of the ear is plain; where the ear meets the head there is a plain line, the two skins
   meeting, not one skin turning. At a distance its coarsest level is blocky (seen as clay only).
5. **The nose's tip is broad and soft**, its nostrils are not seen from the front, and one wing shows a pale smear.
6. **The skin is one even surface**: no pores that differ from place to place, no hairs in the beard's shadow, no
   line on the brow, a shaved head. It reads as a well-made game character, not a photograph.
7. **Faint level streaks** across the far cheek in the three-quarter still, and a pale line up the cheek.
8. **The skin is three closed surfaces now** (the body and two ears), not intent 0039's one.
9. **The chin's bone corner** has 0.3 mm of skin over it, measured on cells of 6 mm: too coarse to trust either way.
10. **Cost not measured.** The ears add 24 680 triangles near, the teeth and the eyes their own surfaces. Every still
    was drawn through WebGL 2 on a software GPU; the library on a real GPU was not seen.

**Samuel's to decide**

- **Accept or reject** this round.
- **The smile as the face's rest**, and how much of one: it is four numbers in `MOUTH`.
- **The chin:** now 100.5 mm before the head's middle plane, 4 mm behind where the measured means put it. Further?
- **What next for the head**, if anything: hair (head, beard, brows as strands); the face moving (a blink is one
  number in `EYE`, a smile four in `MOUTH`; a look and a jaw are the rig's).
- **The rule "our own code only"**, as in 0039: it stands.

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
- [x] second round: the chin narrower and further back
- [x] second round: a smile over teeth; the eyes' sparkle
- [x] second round: ears of their own form
- [ ] hair; the face moving (out of scope here: Samuel's to order)
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

### 2026-11-18, second round

- **Asked.** Samuel, on the first round's stills: "So ensure we have an actual sparkling eyes friendly positive face.
  The chin is too wide going too far to the front, the sparkling smile isn't there yet. No sparkling smile yet there.
  And the ears need to be more realistic" (typos tidied). The intent went back from propose to build.
- **Delivered.** The chin narrower and 4 mm further back. A smile as the face's rest: the lips parted over the upper
  front teeth, the opening cut per pixel; ten teeth where the skull's stand and the dark of the mouth behind them;
  raised cheeks, smiling lids. A spark in each eye from a light of the eyes' own. Ears as closed forms of their own,
  joined to the skin's points, the old relief gone. The tool: an ear's view and the head from behind; the ears in its
  report.
- **Good.** It reads as a friendly face from the front, three-quarter and the side. The ears read as ears from the
  side, the front and behind, and the sun comes through them red. The neck 39.0 cm, a man's 39. The body otherwise to
  the digit as it was; every level closed; grown end to end in a page's workers without error.
- **Broke on the way.** A raised cheek the size of a plum stood out like a second pair of ears. A carved fold beside
  the mouth read as scratches. The first teeth had gaps and were paper white. The ear's bowl was first the red of raw
  meat. A dark wedge showed at the eye's inner corner from the side. Narrowing the chin uncovered its bone's corner by
  0.6 mm, then the jaw's angle lay only 0.2 mm under. Each was set right; see Build.
- **Not there yet.** The smile is fixed, since the face cannot move. No lower teeth, no gum. The ear's tragus is a
  rise, not a flap, and the ear meets the head along a plain line. No hair. Not seen in the library or on a real GPU;
  its cost a frame not measured.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-18 | ac6f5a5 | the intent opened and defined |
| 2026-11-18 | 387396c | the head's form written out anew; eyes behind lids, lashes, brows, lips; the neck into the head; the tool's face views and measures |
| 2026-11-18 | 73d83be | proposed: the first round's write-up and story |
| 2026-11-18 | 4a73cb4 | second round: a smile over teeth, the eyes' sparkle, a narrower chin, the ears joined (their form still in work); back to build |
| 2026-11-18 | e2ea05b | the eye's inner corner |
| 2026-11-18 | 3e8ec82 | the ears' finished form; the tool's ear views; the jaw's angle covered |
