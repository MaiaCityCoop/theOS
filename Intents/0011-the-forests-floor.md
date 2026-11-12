---
id: "0011"
title: The forest's floor
state: propose         # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0011 · The forest's floor

## Idea

Samuel, 2026-11-12, with a screenshot from under the pines: "can you see that the actual forest shader and its sparse
grass holms still look weird? shouldn't the ground floor itself directly be way more realistic, three-dimensional, with
also sticks, moss etc.? currently it is a very flat looking, bad biome floor. do you see the issue?" And, to the plan
put to him (relief in the ground, real litter as assets, grass in tufts, the repeat broken): "Yes, build it".

## Define

Approved as proposed.

**Deliverables**

1. The needle litter with depth: thick and thin, twigs, cones, bark, moss, the hollows dark.
2. Things lying on the floor as bodies: fallen branches, cushions of moss, each a new asset file.
3. No sprinkle of single blades under the crowns: grass where the stand opens.
4. The ground's shader untouched (it is the one the real Safari once hung on); 60 fps holds.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | the floor reads as deep | stills under the pines, before and after |
| 2 | branches and moss stand in the world | the tiers' counts round the camera; a still |
| 3 | the real Safari reaches frames | `TheGame/.perf/hitches.jsonl`, a window-sized Safari page loaded after the last save |
| 4 | no more to draw | triangles and draw calls of the same view, before and after |

**Out of scope**

- Relief worked out per pixel in the ground's shader (parallax, self-shadow): it would grow the shader Safari is sensitive to.
- Roots at the trunks' feet, and litter in the other biomes.

## Build

- `materials/pineneedles.js`, painted anew: where the needles lie thick and where the earth shows (patches a hand to a
  stride across); crumbs of humus, moss in cushions in the bare places, bark flakes, the needles in six layers (fewer
  where it is bare), twigs across them, cones; each with its height, the relief read deeper (`bump` 0.018 to 0.042) and
  the shade of the hollows painted into the colour. Baked once at the start, as every material.
- `assets/deadwood.js`: a fallen branch, weathered grey, twigs on it (the tree kit's tubes; three shapes, two levels).
- `assets/mosscushion.js`: low domes of moss grown into one another (the kit's builder: a solid body; two shapes, two
  levels), more of it in the shade.
- `biomes/pineforest.js`: a third stand, `litter` (a piece every 1.7 m, in drifts), which the two assets join by their
  `placement.stand`; the grass's cover under the groves from a tenth to next to none, coming in where the stand thins.
- What stands in a stand is set 15 cm into the ground by the trees' engine: a thing that lies on it is built that much
  higher (`FOOT` in both files).
- First tries that were wrong: cones as pale lumps the size of a loaf (smaller, darker, scaled); twigs as wide pale
  noodles (thinner, darker); the dead wood too thin and too dark to be seen on the litter (thicker, grey bark).

## Propose

**Delivered:** the four files above; to look at: walk under the pines east of the tent (round -1206, 622).

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | stills in headless WebKit (WebGPU) at -1206, 622: dark litter with twigs, cones and moss against the flat mat of Samuel's screenshot |
| 2 | passed | round the camera: 22 branches at their nearest level and 232 at their second, 6 and 174 moss cushions |
| 3 | passed | Safari pages 1440 wide loaded after the last save (16:45:57) drew frames (`/game/?in=os` 16:46:54: 239 frames in 4 s) |
| 4 | passed | the same view: 250 thousand triangles before, 257 thousand after; 5 draw calls both |

**Known gaps:** frame rate in Samuel's Safari not told apart from the other browsers running at the time (see the
changelog). The painted twigs are many and curl; the branches are few near the eye (their nearest level ends 7 m off).

## Story

## Archived

---

## Todo

- [x] the litter repainted; dead wood and moss as assets; grass off the groves' floor
- [ ] Samuel walks it in Safari
- [x] commit (on Samuel's word)

## Changelog

### 2026-11-12

- **Asked:** a forest floor that is not flat: three-dimensional, with sticks and moss; the sparse grass looked odd.
- **Delivered:** the deliverables above.
- **Good:** no change to the ground's shader was needed: the depth is in the recipe and in two new asset files.
- **Broke / not there yet:** see the first tries under Build; nothing left broken.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `bdefbaf` | the `litter` stand and the grass off the groves' floor (`biomes/pineforest.js`): went in with another session's commit, which took the file whole |
| 2026-11-12 | `de2680e` | the litter repainted, dead wood and moss cushions |
