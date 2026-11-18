---
id: "0040"
title: A face with eyes
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story:                 # Stories/0040-a-face-with-eyes/, set at propose
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

## Propose

## Story

## Archived

---

## Todo

- [ ] the chin and the jaw given back (0039's second round cut them)
- [ ] the eye's opening cut per pixel; the lids over the globe
- [ ] the eyeball's shader
- [ ] lashes, brows
- [ ] the lips' outline and line; the nose's wings and nostrils
- [ ] a finer cage over the face
- [ ] the face's tone
- [ ] the tool's face stills and measures

## Changelog

## Trail

| When | Commit | What |
| --- | --- | --- |
