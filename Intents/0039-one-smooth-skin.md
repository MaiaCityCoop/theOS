---
id: "0039"
title: One smooth skin
state: propose         # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story: Stories/0039-one-smooth-skin/
---

# 0039 · One smooth skin

## Idea

> Can you check out the latest state of our human / skeleton muscles tissues skin rig?
>
> Currently the naked skin body looks still not photorealistic!
>
> We need to upgrade the architecture to latest industry best practices to make the human body really photorealistic
> and smooth. Make a deep research to upgrade the architecture and then write a new intent plan and execute on the
> plan.

Samuel wants the Body of intent 0036 (`characters/body.js`: bones, muscles, fat, skin) to read as a real man's skin,
smooth, and wants the way it is made changed to what the industry does, found by research first.

**The body as it stands** (seen on 2026-11-18, drawn alone through the game's own skin shader, front, side, back and
close; the stills are not kept in the repository):

- The surface is lumpy all over: dents and ridges two to eight centimetres across on the thighs, the back, the
  forearms and the shoulders. It reads as clay or melted wax, not as skin over a body.
- The shoulders are narrow with a knob on top, the arms thin and straight as tubes, a ring round the wrist, the
  fingers rods.
- The head is a bald egg with a mask for a face.
- The skin is one flat peach colour: no light under it, almost no gloss, no shade where the arm lies by the trunk.

## Define

Samuel asked for this work outright (research, a plan, then the build), and the plan below is what the research says;
so it is built straight away. Three choices that are his are kept open and put to him at Propose (below).

**What the research found** ([`reports/Photoreal human body architecture.md`](../reports/Photoreal%20human%20body%20architecture.md),
its notes in `research_notes/Photoreal human body architecture/`). Many hosts were closed to this session, so much of
it rests on search extracts and on shipping source code read on GitHub; the report marks which.

| | The industry | Ours before this intent |
| --- | --- | --- |
| **The surface** | One closed cage of 10 000 to 30 000 four-sided faces, laid by hand in rings that follow the body, made smooth by subdivision (Catmull-Clark); levels of detail are levels of that cage. Nobody ships a surface drawn out of a voxel field | A surface drawn out of a voxel field of 6 mm cells, in seven overlapping pieces, 431 000 triangles, its normals the mean of its faces |
| **The shape** | A scan or a sculpture, with a clean cage wrapped onto it | Muscles and tables, read off the voxels as they come: every strand's rope and gap is in the skin |
| **The binding** | Linear blend skinning with weights found through the body's volume, evened out; twist and helper joints; correctives where it folds | Linear blend, the four nearest bones by distance |
| **The light** | Diffuse light spread under the skin in real millimetres (red 1.2, green 0.26, blue 0.16), two gloss lobes at F0 0.028, light through thin parts by their thickness, coloured occlusion; detail in maps | A diffuse that wraps a fixed share whatever the size of the part, one Blinn-Phong sheen, about twenty noise reads a pixel, no maps |
| **What reads as real** | Shape first: a real-looking material does not rescue a shape that is off; then light; hair and eyes beside them | |

**The architecture.** The anatomy stays what it is and becomes what a studio's scan is: the shape. The skin becomes
what a studio's skin is: one cage wrapped onto that shape and made smooth.

| One | What | Replaces |
| --- | --- | --- |
| **Shape** | `skin/target.js`: the fat and the skin over the muscles and the bones, as fields a ray can be sent through | the first half of `skin/build.js` |
| **Cage** | `skin/cage.js`: about 5 000 four-sided faces in rings round the trunk, the neck and the head, each arm and leg, each finger and toe; a ring divides where the body does (armpits, crotch, thumb, fingers, toes). One closed surface. Each point is found on the shape along a ray from its ring's middle | surface nets on the voxels; seven pieces diving under one another |
| **Smooth** | `skin/subdiv.js`: Catmull-Clark, the points set on the limit surface with its exact normals. Twice smoothed is the near level, once the middle, the cage itself the far: the same points | grid steps smoothed after the fact; a second mesh from a coarser grid |
| **Binding** | `skin/weights.js`: the bones asked for once on the once-smoothed cage, evened out along it, handed down to the finer level | 247 000 points each asking for their bones, evened 60 times over the trunk |
| **Light** | `muscles/flesh.js`, the skin's part: diffuse by how sharply the surface curves and how far light spreads under skin; two gloss lobes; light through thin parts; occlusion that keeps skin's colour; colour from blood and pigment place by place | the wrapped diffuse and its noise |

**Deliverables**

1. **One skin.** The Body's skin as one closed surface from the cage, three levels of detail, in the library as
   before (Body, layer Skin). The fat layer still draws from it.
2. **A truer form** where the stills show it most wrong: the shoulders' breadth and their tops, the arms' girth, the
   wrist; measured against a man of 1.80 m, slightly muscular.
3. **Bound to the rig** so that it bends without tearing: elbow, knee, hip, a raised arm, the loins.
4. **Skin's light**, as the table says, within the forward shader the game has.
5. **A tool** to build the body without the world, measure it and take its stills: `tools/body.js`, so the checks
   below can be run again by anyone.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The skin is one closed surface | `bun tools/body.js`: open edges 0, edges of more than two faces 0; its points and triangles per level |
| 2 | It is smooth | the tool's stills, front, three-quarter, side, back and close, beside the stills of the body before (Idea); and a number: how much the surface's normal turns between neighbouring points, before and after |
| 3 | Its measures | the tool prints girths and breadths (shoulders, chest, waist, hips, thigh, calf, upper arm, forearm, wrist, neck) against the targets, each with its source |
| 4 | It bends | the tool's stills in five poses; a number each: the most an edge of the skin is stretched |
| 5 | The skin's light | stills at 4 m and at 0.5 m, in the library's light; what a pixel costs counted in texture and noise reads (no GPU here to time it on) |
| 6 | Nothing else changes | `bun tools/scale.js`; `vite build`; `bun tools/registry.js`; only Body draws the skin |

**Out of scope**

- Hair, brows, lashes and the eyes' detail; the face's features (it is smoothed with the rest here, and wants a round of its own).
- Detail baked into maps (the cage gives every point a place on its ring, from which the maps' coordinates follow; the maps themselves are the next step).
- Correctives and skin that swells with the muscles; the body's own shadow on itself in a bend.
- The Settler, the game and `me.html`: still on their own body.
- Frame time on a real GPU: this container has none. It is said so wherever a check would need it.

**Samuel's to decide** (put at Propose, with what was seen):

- **The rule "our own code only".** Kept here: the cage is laid by our code and wrapped on our anatomy. The research
  names a middle way, MakeHuman's body (CC0) used only for its faces' layout, and the full way, its shape too.
- **The screen's curve.** The game's own (`src/world/light.js` `display`) pales sunlit skin; a hue-keeping curve
  would change every picture of the game, so it is not touched here.
- **Hair and eyes** in the next round, or the face first.

## Build

**The cage (2026-11-18).** `skin/cage.js` lays 5 062 points in rings: 48 round the head, the neck and the shoulders,
32 round the trunk, 20 round each arm and leg, 5 to 8 round a finger or a toe. A ring divides without a seam: the
shoulders' 48 are the trunk's 32 and the two arms' 20 less the rows of six edges that cross under each armpit; the
trunk's 32 are the two legs' 20 less the four edges under the crotch; a hand's ring gives six points to the thumb and
then five or six to each finger, a foot's eight to the big toe and five to each other. Each ring's points are found
on the shape along rays from the ring's middle, the outline evened a little so that a ring stands for the skin round
it and not for one dent. The foot turns forwards out of the leg on five rings fanned about a line before the ankle.

- **What it runs on.** The body stands as the rig stands at rest (upright, arms hanging), so nearly every ring is
  level; the counts and heights are the file's own tables, the places the rig's joints and the shape itself.
- **Found on the way.** The head is hollow (the mouth, the nose's cavity), so a ray from its middle left through
  the mouth: the head's, the trunk's and the shoulders' rings are found from outside in. Between the thighs the
  shape's middle plane is only just outside both, so each leg is taken on its own side of it. A fit that made the
  smooth surface pass exactly through every found point drove a crease across the instep: two rounds, each point
  moved by 6 mm at most, and a finger still comes out within a few hundredths of its measure.
- **Smooth.** `skin/subdiv.js`: Catmull-Clark, any polygon in (a fingertip is one face), the points then set on the
  limit surface with its exact normal (Halstead, Kass & DeRose 1993). Twice is the near level (161 664 triangles),
  once the middle (40 416), the cage's own faces the far (10 120): the same points, so nothing is laid twice.

**The shape's finer forms.** A cage of this size holds what is a few centimetres across. What is finer is still in
the shape: so each point of the finest level is moved along its normal towards the shape's own surface, the head all
the way (its lids, nostrils and lips came back), the hands and the feet nearly, the rest of the body three tenths of
it (`LIFT` in `skin/build.js`): beyond the smooth surface most of what the shape holds there is the muscles' strands.

**The binding.** `skin/weights.js` is the old fastening (the four bones nearest, a limb's own side's), asked once for
each of the 20 000 points of the once-smoothed cage instead of 247 000 times, evened out along the cage and handed
down. Each point hangs on joints directly: the page writes one 3 x 4 matrix a joint each frame and a point reads
twelve texels, where it read forty-four (each bone had been a muscle's row: a curve through ghost points).

**The skin's light.** `skin/light.js`, with two small pictures made as the skin is laid (`skin/maps.js`):

- *Under the skin:* the diffuse light is read from a table by how the point faces the sun and how sharply the skin
  curves there, worked out from the six-bell profile of light in skin (d'Eon, Luebke & Enderton 2007) on balls of
  every size (Penner & Borshukov 2011). Flat skin gets plain light; a finger, an ear, the nose's wing get red past
  the shade's edge. Each point's curvature is the smooth surface's own.
- *Gloss:* two GGX lobes at 0.75 and 1.3 of the skin's roughness, 15 and 85 parts, F0 0.028 (Unreal's
  defaults; the F0 every skin shader read holds), less out of a hollow; the sky mirrored at a grazing angle; a soft
  edge for the down on the skin.
- *Fine relief:* a tile of fields and furrows drawn round scattered points, read from three sides of the point's
  place at rest. It breaks up the gloss; the red light under it does not see it.
- *Through thin parts:* by how thick the body is under each point, measured as it is laid.
- *Shade:* each point knows how open it stands (forty rays over its half of the world) and the cone its light comes
  from. The sky's light is taken by the first, keeping skin's colour in a fold (Jimenez et al. 2016); the sun by the
  second. The cone is found against the point's own piece of the body only: found against all of it, the shade an
  arm hanging by the trunk laid on the flank stayed there when the arm was raised.
- *Tone:* blood, pigment, oil and veins place by place from a table (`TONE` in `skin/table.js`), laid on the points.
- *What a pixel costs,* counted: 4 texture reads (3 of the relief, 1 of the table) and 2 noise reads, beside the
  shadow's and the clouds' as before. Before: about 20 noise reads and no texture.

**The form.** Measured with the tool, then set in the tables: the neck held to the outline (it had come from the
trapezius's strands alone, 50 cm round with its nape as far back as the skull's); a slimmer forearm; shallower
buttocks; a fuller ankle. The shoulders' breadth did not answer to the upper arm's outline and is left 1.4 cm short.

**The tool.** `bun tools/body.js` builds the Body under bun as the workers do and prints whether the skin is closed,
its levels, how smooth it is, its measures beside a man's, and how its edges stretch in five poses. `--stills <folder>`
keeps the build in `TheGame/.body/` and takes fifteen stills of `tools/body.html` (the Body alone through the game's
own shader, on the dev server) through Chrome. The library takes seven minutes to start on this container's software
GPU; a still of this page takes ten seconds.

**Different from the definition.**

- The face was to be left for a round of its own. Smoothed with the rest it came out a mask, so its features were
  laid back by the displacement above. It is the old face on a clean surface, no better than it was.
- No twist or helper joints, no correctives: the binding is the old one on a clean surface.
- The self-shade is baked as the body stands. In a pose a point's own piece still shades it rightly; another piece
  (an arm over the trunk) shades it only through the sky's light, and that part stays where it was baked.

## Propose

**Delivered.** The Body's skin is one closed surface made as the industry makes one, lit as skin, on branch
`claude/human-rig-photorealism-upgrade-sp1om2`. It is smooth and clean. **It is not photoreal yet**, and what stands
between is named under Known gaps.

- **Where to look.** `library.html`, Characters, Body (`library.html?character=f2d908f8-3c01-411d-a561-ef27148ba557`):
  the wheel to come close, the moves, the layers. Not seen there by me (below).
- **Without the world:** `bun run game`, then `cd TheGame && bun tools/body.js --stills <folder>` takes fifteen stills
  in a minute or two and prints every number below; `http://localhost:5173/tools/body.html?gpu` is the page itself.
- **The story's folder** is spawned: [`Stories/0039-one-smooth-skin/`](../Stories/0039-one-smooth-skin/story.md), its film
  over the meadow and the tent (the Body stands in the library, not yet in the world).
- **The stills** I judged by were taken that way on this container's software GPU, through WebGL 2. They are not kept
  in the repository; before and after, side by side, were sent to Samuel with this.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 One closed surface | **passed** | `bun tools/body.js`: 80 834 points on a cage of 5 062; near 161 664 triangles, middle 40 416, far 10 120; open edges 0 and edges of more than two faces 0 at each. Before: 430 810 triangles in seven pieces, 1 410 open edges |
| 2 Smooth | **passed by the stills; by the number, a fifth** | The stills beside the old ones: the dents and ridges on the thighs, the back and the forearms, the knobs on the shoulders, the ring at the wrist are gone. The number: over the trunk and the limbs the normal turns 4.80° a centimetre of skin (the middle one) and 17.5° (one in twenty more); before, 6.06° and 22.4° |
| 3 Measures | **9 of 13 within 5 %** | neck 41.4 cm (a man's 39, it was 50.2), shoulders across 48.6 (50), chest 105.1 (101), waist 81.6 (82), buttocks 103.2 (98), hips across 35.1 (35), thigh 55.5 (57), knee 36.9 (38), calf 38.8 (38), ankle 21.1 (22), upper arm 32.4 (32), forearm 29.6 (28), wrist 18.1 (17). Over 5 %: neck, buttocks, forearm, wrist. The man's figures are ANSUR II's as third parties quote them and as `skin/table.js` had them: not read in the report itself |
| 4 It bends | **passed, with two faults seen** | Five poses' stills: nothing tears, the armpit opens as a fold, elbow and knee keep their breadth. An edge is stretched at most 1.72 times (elbows bent), 2.2 (knee raised), 2.63 (bent forwards), 2.9 (squat), 4.81 (arms raised: the row under the armpit); 0.4 to 2.4 % of edges by more than half. Faults: a ragged crease across the belly bent forwards; the shoulder's top sinks a little with the arm level |
| 5 The skin's light | **seen at 4 m and at 0.5 m; not timed** | In the tool's light (the library's key, 45° left and 40° up, the shared sun and sky at their defaults). A pixel: 4 texture reads and 2 noise reads beside the shadow's and the clouds' (about 20 noise reads before); a point: 12 texel reads (44). No GPU here to time it on |
| 6 Nothing else changes | **passed** | `bun tools/scale.js`: 18 of 18. `vite build`: built. `bun tools/registry.js`: 52 recipes; the versions of Body, Muscles and Skeleton moved (they share the workers' file), so each is grown again once. Only Body's skin and fat use the new files; the muscles' shader file lost the skin's part and nothing else |
| | The skin laid in a browser's worker | **passed**: 37.0 s in one worker of headless Chromium here (36 s under bun; 44 s before) |
| | The character as the page makes it | **passed** outside the library: `characters/body.js` made, stood, walked and seen from 30 m on a bare page (WebGL 2) |
| | In the library, on WebGPU | **not seen**: the library's world takes seven minutes to start here and the software GPU loses its WebGPU device. To be seen on a real GPU |

**Known gaps**

- **The form is the anatomy's, only cleaner.** The research's first finding is that shape decides whether a body
  reads as real. The cage took the lumps out; it did not make the chest, the back or the thighs truer than the
  muscles and tables under them are. This is the limit of the rule as it stands.
- **The face** is the old face on a clean surface: no lids' folds, a blunt nose, lips as a band, a crease under the chin.
- **No hair** anywhere, no brows, no lashes; the eyes are the old balls.
- **The light** is even: the sky's share of the world's light is large and the screen's curve pales sunlit skin. Both are
  the world's, and were not touched.
- **No maps.** The tone is laid on the points, so it is as fine as they are (5 mm near); the relief is one tile.
- **The body's shade on itself** between two pieces (an arm on the trunk, thigh on thigh) is baked standing.
- **Bending** is the old binding: no twist joints, no correctives, no swelling with the muscles.
- **Phones:** the same cage on every device (the shape under it is laid on 8 mm cells there, as before). Not tried on one.
- The Fat layer draws the skin's surface a skin's thickness in, as before; its look was not touched. The Settler, the
  game and `me.html` are on their own body still.

**Samuel's to decide**

1. **The rule.** Three ways on from here, by what the research found:
   - *Keep it* ("our own code only"). The next step is then the muscles themselves: truer shapes under the cage. Slow, and no published work has reached a photoreal surface this way.
   - *Lift it for the layout only.* MakeHuman's body (CC0, 13 380 points, all four-sided) gives faces laid by modellers, with coordinates for maps and a face, hands and feet of the right layout; our anatomy still gives the shape. The cage's file is the one place that changes.
   - *Lift it for the shape too.* That body's own form, fitted to our rig. Real forms at once; the anatomy under it then follows the skin instead of making it.
2. **The screen's curve.** A hue-keeping one (Khronos PBR Neutral is in three.js) would give skin its colour back in the sun. It changes every picture of the game.
3. **What next:** hair, brows and eyes; or the face; or maps and the bends.

## Story

## Archived

---

## Todo

- [x] the research report
- [x] Define
- [x] one skin from the cage, three levels
- [x] the form: neck, forearm, buttocks, ankle (the shoulders' breadth did not answer)
- [x] bound to the rig: five poses
- [x] the skin's light
- [x] the tool, its measures and stills
- [x] the target's leftovers of the old meshing taken out
- [x] the story's folder
- [ ] seen in the library on a real GPU, and timed
- [ ] Samuel's word on the rule, the screen's curve and what comes next
- [ ] the shoulders' breadth; the crease across the belly bent forwards; the shoulder's top with the arm level
- [ ] maps from the cage's own coordinates (tone, relief, the folds at the joints)
- [ ] the body's shade on itself between its pieces, as it moves

## Changelog

### 2026-11-18

- **Asked:** "Can you check out the latest state of our human / skeleton muscles tissues skin rig? Currently the
  naked skin body looks still not photorealistic! We need to upgrade the architecture to latest industry best
  practices to make the human body really photorealistic and smooth. Make a deep research to upgrade the
  architecture and then write a new intent plan and execute on the plan."
- **Delivered:** the Body seen as it stands (stills through the game's own shader); a research report from five
  lines of inquiry (`reports/Photoreal human body architecture.md`); this intent and its plan; the skin rebuilt as one
  cage wrapped on the anatomy and made smooth, bound to the rig, lit as skin; a tool that builds, measures and takes
  stills of it without the world.
- **Good:** One closed surface where there were seven pieces and 1 410 open edges; 162 000 triangles for 431 000;
  three levels of detail from the same points; laid in 36 s for 44. The lumps, the shoulder's knobs, the wrist's ring
  and the rod fingers are gone; hands with a thumb and four fingers and feet with five toes come out of the same cage.
  The neck measures 41 cm where it measured 50. The skin holds in five poses, and the armpit opens as a fold.
- **Broke / not there yet:** It is not photoreal. The form is as true as the anatomy under it and no truer; the face
  is the old one; there is no hair; the light is even. Research: most hosts were closed to this session, so papers and
  Epic's pages are known from search extracts only, and the body's measures from third parties. Nothing was seen in
  the library or on WebGPU, and nothing was timed on a GPU. On the way: the head's rings flew out through the mouth
  until they were found from outside in; an exact fit creased the instep; the thickness measure lit the armpits red
  until it began inside the body; the self-shade baked against the whole body left an arm's shade on the flank in
  every pose; an edit of mine dropped the tool's table of measures, and the run said so.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-18 | `4087157` | the intent opened and defined; the research report and its notes |
| 2026-11-18 | `54e9b80` | the skin one closed cage, wrapped on the body's shape and made smooth; three levels by the one measure |
| 2026-11-18 | `4b3e57d` | the skin's light; the shape's finer forms laid back; a slimmer neck; the tool that measures it |
| 2026-11-18 | `8d48efa` | the tool's page and stills; a level's error counts what its points carry; the cone from a point's own piece; the shape's leftovers out |
| 2026-11-18 | `63a21cc` | the tool says how the skin bends in five poses |
