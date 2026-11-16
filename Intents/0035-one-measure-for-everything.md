---
id: "0035"
title: One measure for everything
state: define             # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story:
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

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel: is this what he meant; approve or change the definition
- [ ] Agree with intent 0033 where the reference body's numbers live
- [ ] Build, check, propose

## Changelog

### 2026-11-16

- **Asked:** one source of truth for the size of everything, every asset measured against its source.
- **Delivered:** the intent opened: every size the code holds today and where, the first disagreement found (the
  walker's eyes against the Settler's), and a definition to approve.
- **Good:** the sizes are few and plain to find.
- **Broke / not there yet:** nothing built; Samuel's yes first.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `58cf67c` | the intent opened and defined: every size the code holds and where, one measure with its sources |
| 2026-11-16 | `5bb42ef` | two long lines folded |
