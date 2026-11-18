---
id: "0039"
title: One smooth skin
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story:                 # Stories/0039-one-smooth-skin/, set at propose
---

# 0039 · One smooth skin

## Idea

> Can you check out the latest state of our human skeleton, muscles, tissues, skin rig?
>
> Currently the naked skin body still looks not photorealistic!
>
> We need to upgrade the architecture to the latest industry best practices to make the human body really
> photorealistic and smooth. Make a deep research to upgrade the architecture, then write a new intent plan and
> execute on the plan.

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

## Propose

## Story

## Archived

---

## Todo

- [x] the research report
- [x] Define
- [ ] one skin from the cage, in the library
- [ ] the form: shoulders, arms, wrist
- [ ] bound to the rig: five poses
- [ ] the skin's light
- [ ] the tool, its measures and stills
- [ ] the target's leftovers of the old meshing taken out

## Changelog

## Trail

| When | Commit | What |
| --- | --- | --- |
