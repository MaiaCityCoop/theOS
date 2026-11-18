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

### Third round (2026-11-18)

> The base view should be a smile and sparkle in the eyes. Friendly heartwarming gaze, a human in love and full of
> inspiration. This included good teeth.

Samuel, on the second round's stills. It settles what the second round left to him: the smile is the face's rest.
And it asks for more of it: a whole smile, a fond gaze, good teeth. Built straight away.

| | How | Why |
| --- | --- | --- |
| **A whole smile** | The mouth's corners above the upper lip's middle, the mouth broader, the cheeks raised more; the lower lip following the upper teeth's edges | A smile reads as warm when the corners turn up and the lower lip follows the teeth; a level mouth with teeth showing reads as a grin |
| **A fond gaze** | The lower lids raised over the iris's foot, the upper a little lower, the pupils wide; fine lines from the eyes' outer corners; a second spark in each eye; the brows a little higher; more blood in the cheeks | The eyes take part in a smile that is meant: narrowed from below, bright, wide-pupilled |
| **Good teeth** | Each tooth with its gum, the gum coming down to a point between two teeth; shade where a tooth turns to its neighbour; ivory, warmer at the neck, clearer at the edge; the lower row behind the upper | The second round's teeth were ten plain crowns with dark between them |

**Deliverable:** 9. a base face that smiles warmly, with a fond, sparkling gaze and good teeth. **Checks** as before.

### Fourth round (2026-11-18)

> Also the chin needs to be shorter a bit and we don't see nose holes.

Samuel, on the third round's stills. Two corrections, built straight away: the chin's foot higher; the nostrils
opened to the front and dark inside. **Deliverable:** 10. a shorter chin, nostrils that show. **Checks** as before.

### Fifth round: the gate is a photograph (2026-11-18)

> Without the beard and cap. This is kind of how it should look like. Way more natural. Do you see? Do you see the
> photorealism difference between a real human face that smiles and ours? Go for blue eyes too. Do you see now how to
> get better? So this reference image should be our gate of being good human, real-like, photorealistic-like
> reference.

Samuel, with a photograph: a man of middle age, close, smiling with his whole face. **That picture is now the gate
for the face.** It is his, shown in the session; it is not in the repository (a photograph of a person is not mine to
publish: his to add if he wants it there). What it shows, so the gate can be read without it: eyes narrowed almost to
slits under hooded lids, blue-grey; folds fanning from the eyes' outer corners and running from the nose round the
mouth; cheeks bunched up under the eyes; one corner of the mouth higher than the other; upper teeth off-white and a
little uneven; skin warm and uneven, redder at the cheeks, the nose and the ears, with pores, lines on the brow and
creases under the eyes; lit warm and soft from the front, with shade under the brow and the nose. (A beard and a cap,
which he says to leave out.)

**What stands between ours and it**, most telling first: the smile takes in only the mouth; the skin is one even,
unlined surface; the light is flat and cool; the eyes are large, open and brown; the face is its own mirror.

Built straight away, as far as one round goes: **blue eyes**; **a smile of the whole face** (broader, the cheeks
higher, the lower lids pushed up, the fold round the mouth a form); **the skin's fine folds, pores and uneven
colour**; teeth less white; the two sides no longer twins in what is drawn. **Deliverable:** 11. a step towards the
photograph, and an honest account of the distance left. **Checks** as before; check 1 is now judged against the
photograph.

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


### Third round: a whole smile, a fond gaze, good teeth (2026-11-18)

- **The smile** (`MOUTH`): 61 mm broad for 59; its corners at 1.6150 m, above the upper lip's middle edge (1.6148),
  where they had stood 2 mm under it; the lower lip's edge at 1.6050, just over the upper front teeth's edges (1.6051
  on the skull), rising to the corners along them. The lips' masses moved with it; the cheek's mass a millimetre
  fuller and 2 mm higher.
- **First the lower lip stood too low** (1.6038): the lower row showed under the upper as a second row of small
  teeth, and the face clenched its teeth. Raised until only the upper row shows.
- **The gaze** (`EYE`, `eyesOf`, `skin/light.js`): the lower lid 0.6 mm higher again and the upper 0.2 lower, the
  opening 7.9 mm high for a resting eye's 10; the pupil 5 mm across for 4; a second, small spark low on the other
  side of the cornea; the iris a little warmer; three fine lines fanning from each eye's outer corner, drawn in the
  skin's shader (first too dark and thin, like a cat's whiskers: softened to half); the brows 1 to 1.5 mm higher; the
  cheeks' blood from 0.4 to 0.52; the lips a little redder.
- **The teeth** (`mouthOf`): each tooth now begins as a collar under the gum, broad enough to meet its neighbours',
  and the gum is drawn on the tooth by where on it a point lies: standing back at the tooth's middle, coming down
  between two teeth as a point. Enamel ivory, warmer towards the neck, cooler and clearer at the edge, in shade where
  it turns to the next tooth. The lower row's eight front teeth stand behind the upper (the skull's own places), for
  what shows of them: eighteen crowns in all.

### Fourth round: a shorter chin, nostrils that show (2026-11-18)

- **The chin** is 2.6 mm shorter in the head's form: its foot at 1.5625 m for 1.5599 (the chin's mass and the floor
  under the jaw raised, the form's lowest level from 1.566 to 1.569 m). **Its bone sets the limit:** the skull's chin
  ends at 1.5665 m, and with the chin shortened the jaw bone's lower border beside it stood 1.2 mm out of the skin
  (the tool's check). A low ridge over that border covers it again; the least cover of the head's bones is 0.6 mm, at
  the jaw's angle. A chin shorter still needs a shorter jaw bone, which is the skeleton's.
- **The nostrils** did not show because the nose's wings came down as far as its foot, so each nostril opened
  straight down. The wings' rims now end 2 to 3 mm above the nose's foot (as a nose's do: its middle strip hangs below its
  wings), the nostril's hollow reaches the front under the tip, and the skin inside a nostril is drawn dark
  (`skin/light.js`, by where the point lies in the hollow of `OPENINGS`).
- **The tool** took the floor of the mouth for the chin's foot when that hung lower than the chin: it now reads the
  chin's own foot (the profile's lowest point before 78 mm). The face from the nose's root to the chin's foot:
  122.1 mm, a man's 122.

### Fifth round: towards the photograph (2026-11-18)

- **Blue eyes** (`eyesOf`): a pale grey-blue thinning to a darker blue at the rim, a thin tawny ring round the pupil.
- **The smile takes in more of the face** (`MOUTH`, `HEAD`, `EYE`): the mouth 65 mm broad for 61, its corners at
  1.6165 m (1.7 mm over the upper lip's middle); the cheek's mass larger and higher; a ridge under each eye where the
  cheek pushes the lower lid up; the fold from the nose's wing round the mouth carved into the head's form; the eye's
  opening 6.7 mm high for 7.9 and a millimetre shorter at its outer end; the brows lower and thicker.
- **The skin's fine folds** (`skin/table.js` `FOLDS`, `skin/light.js`): a fan of four from each eye's outer corner,
  two creases under the lower lid, two faint lines on the brow, each a short run seen from the front, drawn as the
  skin is drawn: darker in its bed and its sides turned for the light, a little unsteady, fading to its far end.
  **First they were scratches**: thin, straight, orange, and the fold round the mouth drawn as a line across the
  cheek read as a scar. Made broad and soft; the fold round the mouth left to the form.
- **Pores** as small dark dots, more where the skin is oily; **the face's colour** uneven a thumb's breadth at a
  time, the cheeks, the nose and the ears redder, the face browner; the lids darker.
- **Not its own mirror any more, in what is drawn:** the folds a fifth deeper on one side, one brow 1.2 mm higher.
  The form itself is still mirrored.
- **Teeth** less white, warmer at the neck. Made uneven by a third of a millimetre each, they looked jumbled: now by
  a tenth.
- **The tool:** a `portrait` still, close and a little from the side and above, as the photograph is taken.

## Propose

**What is delivered** (five rounds). A head that reads as a head, and a face whose rest is a warm smile: blue eyes
narrowed by smiling lids, the lips parted over good teeth, raised cheeks, fine folds at the eyes, a narrower and
shorter chin, nostrils, ears that stand off the head. **Against the gate, the photograph, it is still plainly a
drawn face**: see the gaps. Look at it with
`bun tools/body.js --stills <folder>` (the game's dev server running): `face`, `face-three-quarter`, `face-side`,
`eye`, `mouth`, `portrait`, `ear`, `head-from-behind` among twenty-three stills; or in the library, the Body.

| # | Check | Result |
| --- | --- | --- |
| 1 | The face reads as a face, and a warm one; the ears as ears; against the photograph | **A face, and a warm one: passed. Against the photograph: not passed.** The tool drew all twenty-three stills on 2026-11-18. Beside the stills before: an upright forehead; eyes in sockets, narrowed from below as a smile narrows them, with lashes, a wide pupil and sparks of light; a nose with ridge, tip and wings; a broad smile, its corners up, the lips parted over the upper row of teeth, each tooth shaded against the next; a chin and a jaw's line; ears with a rim, an inner ridge, a bowl and a lobe, standing off the head from the front and from behind. Whether it is the gaze of a human in love and full of inspiration is Samuel's to say: it is warm and bright; it is also fixed |
| 2 | Its measures | **Printed.** Table below: eight of fourteen within 5 % of a man's, one at 5 %, the nose's tip 11.2 % short; four are a smile's measured against norms for a face at rest. The norms are remembered, none read for this |
| 3 | The body is as it was | **Passed.** Twelve of the body's thirteen measures to the digit as in intent 0039; the neck 38.8 cm for 43.1 (a man's 39). Open edges 0 at each of the three levels. The body's own points are where they were; the five poses' shares read a little lower (0.34 %, 1.1 %, 0.42 %, 0.51 %, 1.62 % for 0.38, 1.24, 0.47, 0.58, 1.87) because the ears' edges, which do not stretch, are now counted among them |
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
| face, the nose's root to the chin's foot | 122.1 | 122 | +0.1 % |
| nose, its root to its foot | 57.7 | 55 | +5 % |
| nose, its breadth | 36.3 | 35 | +3.7 % |
| nose, its tip before its foot | 17.3 | 19.5 | -11.2 % |
| upper lip, the nose's foot to its edge, smiling (as drawn; a man's: at rest) | 13.8 | 22 | -37.3 % |
| mouth, its breadth, smiling (as drawn; a man's: at rest) | 65 | 54 | +20.4 % |
| eye, its opening's length (as drawn; the lids smiling) | 29.2 | 31 | -5.8 % |
| eye, its opening's height (as drawn; the lids smiling) | 6.7 | 10.5 | -36.2 % |
| between the eyes' inner corners (as drawn) | 33 | 33 | 0 % |
| between the eyes' outer corners (as drawn) | 91.2 | 91 | +0.2 % |

The first five norms are the US Army's survey's, the rest Farkas's; "as drawn" is a line of the table, not a
measure of the skin. The ear: 63.4 mm by 35.9 for Farkas's 62.7 by 35.4, its rear rim 19.3 mm off the head (its own
lab script's print).

**Against the photograph**, side by side with the `portrait` still. This is the distance left:

- **Skin.** The photograph's is a surface with a history: pores everywhere, folds that are folds, stubble, colour
  that changes every centimetre. Ours is smooth and even with a few shaded lines on it. This is the largest gap.
- **Light.** The photograph is lit warm and soft from the front and has depth; ours stands in a flat, cool light. The
  light is the world's, not the Body's: a portrait needs a light set for it.
- **The smile.** His cheeks bunch up into his eyes and close them almost shut; ours rise a little. His lids are
  hooded folds of skin; ours are a clean edge.
- **Form.** His face is not symmetric and its nose, lips and ears are a person's own; ours is a mean, mirrored.
- **Hair.** His brows and lashes are hairs; ours are drawn, and there is none on the head or the jaw.

I do not think numbers alone reach that picture. Each round brings it nearer and the steps get smaller. The
industry's way to it (intent 0039's research) is a real head measured: a scan or a sculpture for the form, and
photographed skin for its surface. That is what the rule "our own code only" keeps out.

**Known gaps, as the stills show them.**

1. **The smile is fixed.** The face cannot move, so it smiles standing, walking and squatting alike, and its gaze
   goes straight ahead. Samuel has said the smile is its base; a face that moves is what would make it a look.
2. **The teeth** are smooth crowns: no furrows, no wear, each like its twin; the gum is drawn on the tooth, not a
   form of its own; behind them one dark surface, no tongue. A thin dark line shows between the two middle teeth.
3. **The eyes do not blink or look.** The pink mound at the inner corner meets the white along a hard line. The
   fine lines at the outer corners are drawn, not folds.
4. **The ears:** the tragus is a rise before the canal, not a flap over it; there is a small point where the rim
   leaves the temple; the back of the ear is plain; where the ear meets the head there is a plain line, the two skins
   meeting, not one skin turning. At a distance its coarsest level is blocky (seen as clay only).
5. **The nose's tip is broad and soft**, and one wing shows a pale smear. The nostrils show now, as dark ovals: a
   little too even, like paint, seen close.
6. **The skin is one even surface**: no pores that differ from place to place, no hairs in the beard's shadow, no
   line on the brow, a shaved head. It reads as a well-made game character, not a photograph.
7. **Faint level streaks** across the far cheek in the three-quarter still, and a pale line up the cheek.
8. **The skin is three closed surfaces now** (the body and two ears), not intent 0039's one.
9. **The jaw's angle** has 0.6 mm of skin over its bone, measured on cells of 6 mm: too coarse to trust either way.
   The chin cannot be shorter than it is without a shorter jaw bone.
10. **Cost not measured.** The ears add 24 680 triangles near, the teeth and the eyes their own surfaces. Every still
    was drawn through WebGL 2 on a software GPU; the library on a real GPU was not seen.

**Samuel's to decide**

- **Accept or reject** this round.
- **How much of a smile:** it is four numbers in `MOUTH`, and the lids' two in `EYE`.
- **The photograph itself:** whether it goes into the repository as the gate's picture. It is not there now.
- **The chin:** now 100.4 mm before the head's middle plane and its foot at 1.5625 m, as short as its bone lets it
  be. Shorter still means a shorter jaw bone in the skeleton: say so and it is a round of its own.
- **What next for the head**, if anything: hair (head, beard, brows as strands); the face moving (a blink is one
  number in `EYE`, a smile four in `MOUTH`; a look and a jaw are the rig's).
- **The rule "our own code only"**, as in 0039: it stands, and it is now what stands between this face and the
  photograph. Three ways on: keep it and go on round by round (folds as real relief, the form made unlike its mirror,
  hairs as strands, a portrait's light: nearer each time, never there, I think); lift it for the head's surface only
  (photographed skin on our form); lift it for the head (a scanned or sculpted head).

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
- [x] third round: a whole smile, a fond gaze, good teeth
- [x] fourth round: the chin shorter; nostrils that show
- [x] fifth round: blue eyes; a smile of the whole face; fine folds, pores, uneven colour; the gate set at the photograph
- [ ] the photograph's gate: not reached (skin, light, a smile of the whole face, a form unlike its mirror, hair)
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

### 2026-11-18, third round

- **Asked.** Samuel, on the second round's stills: "The base view should be a smile and sparkle in the eyes. Friendly
  heartwarming gaze, a human in love and full of inspiration. This included good teeth" (typos tidied). Back to build
  once more.
- **Delivered.** A whole smile as the base: the corners above the upper lip's middle, 61 mm broad, the lower lip
  following the upper teeth's edges, the cheeks fuller and redder. Smiling lids, wide pupils, a second spark, fine
  lines at the eyes' outer corners, the brows a little higher. Teeth with their gums, shaded each against the next,
  ivory; the lower row behind the upper.
- **Good.** In the stills the face smiles warmly from the front and three-quarter, and the eyes smile with it. The
  teeth read as a healthy upper row. The body and the head's measures as in the second round.
- **Broke on the way.** The lower lip first stood too low and the lower teeth showed as a second row: a clenched
  grin. The lines at the eyes were first whiskers.
- **Not there yet.** As the second round: the smile and the gaze are fixed; no hair; not seen in the library or on a
  real GPU. "In love and full of inspiration" is his to judge, not a number.

### 2026-11-18, fourth round

- **Asked.** Samuel, on the third round's stills: "Also the chin needs to be shorter a bit and we don't see nose
  holes" (typos tidied). Back to build once more.
- **Delivered.** The chin's foot 2.6 mm higher. The nostrils opened to the front under the tip, the wings' rims
  raised, the inside of a nostril dark. The tool reads the chin's own foot.
- **Good.** In the stills two nostrils show from the front and three-quarter, one from the side. The face from the
  nose's root to the chin's foot measures 122.1 mm, a man's 122.
- **Broke on the way.** The shorter chin uncovered the jaw bone's lower border by 1.2 mm; covered again by a low
  ridge.
- **Not there yet.** The chin is as short as its bone allows; the nostrils are even dark ovals. The rest as the third
  round.

### 2026-11-18, fifth round

- **Asked.** Samuel, with a photograph of a smiling man: "Without the beard and cap. This is kind of how it should
  look like. Way more natural. Do you see? Do you see the photorealism difference between a real human face that
  smiles and ours? Go for blue eyes too. Do you see now how to get better? So this reference image should be our gate
  of being good human, real-like, photorealistic-like reference" (typos tidied). Back to build.
- **Delivered.** The photograph set as the face's gate, described in Define (the picture itself is not in the
  repository). Blue eyes. A broader smile with higher cheeks, pushed-up lower lids, a fold round the mouth in the
  form, narrower eyes, lower brows. Fine folds at the eyes and on the brow, pores, uneven colour, the two sides no
  longer twins in what is drawn. Teeth less white. A `portrait` still.
- **Good.** Blue eyes read well. The smile is broader and the eyes smile with it. Beside the fourth round it is a
  livelier face.
- **Broke on the way.** The folds were first pencil scratches and the fold round the mouth a scar; the teeth, made
  uneven, looked jumbled.
- **Not there yet.** The gate. Beside the photograph ours is a drawn face: even skin, flat light, a mild smile, a
  mirrored form, no hair. Said plainly in Propose, with three ways on.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-18 | ac6f5a5 | the intent opened and defined |
| 2026-11-18 | 387396c | the head's form written out anew; eyes behind lids, lashes, brows, lips; the neck into the head; the tool's face views and measures |
| 2026-11-18 | 73d83be | proposed: the first round's write-up and story |
| 2026-11-18 | 4a73cb4 | second round: a smile over teeth, the eyes' sparkle, a narrower chin, the ears joined (their form still in work); back to build |
| 2026-11-18 | e2ea05b | the eye's inner corner |
| 2026-11-18 | 3e8ec82 | the ears' finished form; the tool's ear views; the jaw's angle covered |
| 2026-11-18 | ecdb64f | proposed again: the second round's write-up and story |
| 2026-11-18 | 9044585 | third round: a whole smile as the base, a fond gaze, teeth with gums and a lower row; back to build and proposed again |
| 2026-11-18 | 3058e64 | proposed a third time: the third round's write-up and story |
| 2026-11-18 | 2fee84f | fourth round: the chin shorter, nostrils that show; the tool reads the chin's own foot |
| 2026-11-18 | 3c6ca32 | proposed a fourth time: the fourth round's write-up |
| 2026-11-18 | be568ca | fifth round: the photograph as the gate; blue eyes, a smile of the whole face, the skin's folds, pores and colour; a portrait still |
