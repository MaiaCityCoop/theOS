---
id: "0019"
title: A person in the library, in clothes that read as cloth, on a skeleton of their own
state: propose          # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0019 · A person in the library, in clothes that read as cloth, on a skeleton of their own

## Idea

The stress stand (`?stress`, `src/scatter/stress.js`) already has rigged, human-like walkers, but they look blunt:
one flat colour, a stick figure on a few bones. Samuel wants a **Characters** entry in the asset library showing one
of them, standing on the library's stage like every other asset and moving, with a more realistic look: clothing that
reads as real cloth (woven texture, folds or at least fabric shading with a soft sheen like cotton or velvet, seams
and hems where cheap), skin that reads as skin, hair darker and textured.

Then, in Samuel's words (typos tidied): "They need to be also properly rigged and have 1–3 rigged moves selectable in
the right aside metadata card as custom moves."

## Define

Asked outright and without surprise, so built straight away (the skill's rule).

**Deliverables**

1. A **Characters** card in the library's grid (`TheGame/library.html`), with a list of characters like the other
   sections, `?character=<uid>` in the address.
2. A character is a recipe like any other (`TheGame/characters/*.js`, a uid, in the registry and `registry.json`).
   The first: a person built from one of the stress stand's walkers (its kind's own numbers: legs, build, head,
   lean), on a **proper skeleton**: one skinned mesh on 20 bones in a hierarchy (hips, spine, chest, neck, head;
   clavicle, upper arm, forearm, hand on each side; thigh, shin, foot on each side), each vertex weighted to its bones
   and blended over every joint.
3. **Moves**: Walk, Idle, Wave, chosen in the right card; a change of move blends over a moment. The walk goes round
   the stage with its feet on the ground.
4. **The look**: cloth from the world's own material system: new baked materials in `TheGame/materials/` (a linen
   plain weave, a denim twill, hair), worn along the body's own surface (no seams in the weave), lit with a cloth
   model (soft wrap, sheen at the edge), hems, cuffs, side seams, a belt and a placket; skin with a wrap of light
   through it; hair darker, with strands and a highlight along them; leather shoes.
5. The skeleton can be shown on the stage from the card.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The grid has Characters | open `http://localhost:5180/game/library.html`: a fourth card, Characters |
| 2 | The character stands and moves | click it: the person on the stage, walking; screenshot |
| 3 | The cloth reads as cloth | close up: the weave, hems and seams visible; screenshot |
| 4 | The moves | the card's Walk / Idle / Wave each change what the body does; screenshot of the wave |
| 5 | Rigged | the card says 20 bones; Show bones draws the skeleton moving with the body |
| 6 | No console errors | the browser's console on the library page, before and after choosing |

**Out of scope**

- The stress stand itself: its walkers stay as they are (thousands of them, one shader).
- The fire pit (intent 0016, another session).
- Clothes as separate simulated meshes; faces beyond a hint of eyes, brows and mouth.

## Build

- **Proportions from the stress stand, skeleton of its own.** The walker rig (`assets/kit/creature.js`) moves a stick
  figure with a body bob, a head, hips and knees, shoulders and elbows, two hops of parent at most: right for
  thousands on one shader, not for one person seen close. So the person takes walker kind 26's numbers (the one kind
  with arms and nothing grown on it: legs `r(1)`, build `r(3)`, `r(70)`, head `r(9)`, lean `r(6)`, read with the same
  hash) and is built by a new kit, `characters/kit/human.js`, as a `THREE.SkinnedMesh` on 20 bones. The stress stand
  is not touched.
- **The skin** is tubes along the body (trunk and head as one, each arm, leg, hand, foot, the ears, the nose), a ring
  every 8 mm (74k faces), each ring weighted to its bone and blended smoothly between two over every joint. The weave's
  uv runs round and along each tube, a whole number of tiles round it, so the cloth meets itself without a seam.
  Normals are taken across the ring and along the tube, so the duplicated seam column is smooth.
- **What is worn where** is told per pixel from each point's place at rest: trousers below the waist and down the
  legs, a belt with a brass buckle, the shirt above with a V neckline, a placket and buttons, sleeves rolled to below
  the elbow with a cuff, a turned hem on the trousers with gold topstitching, side and inner seams, leather shoes with
  laces and a sole, hair by a hairline that falls lower at the back, and a hint of a face (eyes, brows, lips, cheeks).
  The hair, the cuffs, the hem and the belt also stand out of the surface on the mesh itself; the cloth drapes a
  little uneven (a slow noise on its radius).
- **Shading** is the kit's own (as `src/materials/preview.js` is the library's): the baked tiles read along the
  surface with their relief turned onto it through a frame taken from the screen's change of uv (no tangents to skin),
  folds as ridges where cloth gathers (above the hem, behind the knee, inside the elbow, over the belt), cloth lit with
  a soft wrap and a sheen at its edge, skin with light wrapping through it reddened, hair with two highlights along its
  strands (Kajiya-Kay), leather and brass glossy; then the world's air and screen (`finish`).
- **New materials**: `materials/linenweave.js` (plain weave, slubbed, fuzz), `materials/denimtwill.js` (3/1 twill,
  indigo warp over ecru weft, faded), `materials/hair.js` (strands in locks). They appear in the Materials section too.
- **A new recipe type**, `character`: `characters/*.js` is a registry folder now (`tools/registry.js`,
  `src/core/registry.js`), so a character has a uid, a version in `registry.json` (its kit hashed with it).
- **The moves** are poses as functions of time (angles a bone), blended over 0.45 s on a change. Walk goes round the
  stage at 1.3 m/s, 1.5 m out, facing its way; Wave turns to the eye. After every pose the hips are let down until the
  lower sole touches the ground, so the feet stay on it in every move. The camera circles the person where they are.
- The address takes `character=<uid>&move=<id>`.
- The grid's picture first showed a sliver: the picture's person stood on the walk's round, 1.5 m out. Centred.

## Propose

**Delivered:** `library.html` has a fourth section, Characters (its grid card shows the person), with the Settler
(`characters/settler.js`, kit `characters/kit/human.js`) and three new materials. Merged to main at Samuel's word.

**Checks, as they were** (headless Chrome against this worktree's game server, 5174; screenshots in the session
notes folder, `0019-shots/`)

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | `1-grid.png`: Assets, Biomes, Characters, Materials; the Characters card shows the person |
| 2 | passed | `2-idle.png`, `5-walk.png`: the Settler on the stage, idle; walking round it |
| 3 | partly | `3-close.png`, `4-wave.png`: shirt with collar, placket, buttons, rolled cuffs, belt and buckle, shoes; the weave reads only faintly at this distance, and the denim reads pale grey-blue, not indigo (see gaps) |
| 4 | passed | `4-wave.png`: the right arm up, turned to the eye; by script: the right hand rises 1.07 m in Wave |
| 5 | passed | `6-bones.png`: the skeleton drawn over the walking body; the card says 20 bones |
| 6 | passed | no console errors in either headless run (grid; idle → close → wave → walk → bones) |

**Known gaps:**
- The trousers come out pale: the denim's indigo does not show (maybe its tile is not painted into the pool and the
  stand-in is read, or the sheen and sky light wash it out). To look at first.
- The arm tubes' top caps stand above the shoulders like pads; the shoulders want a wider trunk there and a lower,
  shorter cap on the arm.
- The weave is fine-scaled (threads of 3–4 mm): it shows close up, hardly from the library's usual distance.
- Not looked at in the OS's own page (5180/game/library.html): that port is the main checkout's.

## Story

## Archived

---

## Todo

- [x] Materials: linen weave, denim twill, hair
- [x] The human kit: skeleton, skin, moves
- [x] The character recipe and the registry
- [x] The library's Characters section and card, with its picture in the grid
- [x] Checks 1–6, with screenshots
- [x] Denim reads indigo; shoulders without pads (07663bb; merged without a new screenshot, at Samuel's word)

## Changelog

### 2026-11-14

- **Asked:** a Characters item in the library showing a rigged human from the stress stand, with clothing that reads
  as real cloth; then: properly rigged, with 1–3 moves selectable in the right card; then: the Characters card in
  the grid must have a picture like the others.
- **Delivered:** the Characters section (grid card with its picture, list, card); the Settler on a 20-bone skinned
  skeleton with Walk, Idle and Wave chosen in the card; linen, denim and hair as baked materials; Show bones.
- **Good:** by script in the page: Wave lifts the right hand 1.07 m; Walk moves it round; the skeleton helper shows.
- **Broke / not there yet:** the hair tile first passed an array as a noise's period (a TSL error at start: fixed);
  a name clash (`at`) stopped the page once (fixed); the grid's picture was a sliver (the person stood 1.5 m off the
  picture's middle: fixed). Numbered 0017 at first; 0017 was taken by another branch, so this is 0019.

### 2026-11-14 (2)

- **Asked:** fix the pale denim and the shoulder pads; then merge it directly.
- **Delivered:** the denim's warp packed close so the ecru weft only peeps between (about a quarter where it shows,
  and half hidden then), a deeper indigo; the trunk broad to the arm at the shoulder and sloping in to the neck, the
  arm's tube starting lower with a short cap.
- **Broke / not there yet:** not seen on screen: the headless screenshots were stopped twice for the frame-rate
  session's quiet windows, and Samuel asked to merge before they ran.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-14 | `c625294` | The Settler, the human kit, linen, denim, hair, the Characters section |
| 2026-11-14 | `68b556e` | origin/main (b4a10e3, the fire pit) merged in |
| 2026-11-14 | `aabedad` | Propose: the checks as they were, the gaps |
| 2026-11-14 | `07663bb` | Denim indigo, shoulders without pads |
