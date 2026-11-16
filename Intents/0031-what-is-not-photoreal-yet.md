---
id: "0031"
title: What is not photoreal yet
state: idea               # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story:
---

# 0031 · What is not photoreal yet

## Idea

> Also tell me everything that is not photorealistic now. So we have the inventory of stuff we need to fix.

Samuel wants the game to look like a photograph. Below is everything that does not, as it stands on 2026-11-16, read in
the code and seen in screenshots (Chromium on a software GPU; nothing here was judged on a real GPU or an iPhone). Each
line says what it is now and what a photograph has instead. Grouped by part, the largest gaps first in each group. Each
group is a candidate intent of its own; what is taken up, and in which order, is Samuel's to say.

### People (`characters/kit/human.js`)

1. The body is tubes swept along 20 bones (74k faces), not a sculpted or scanned body: no real anatomy in the face, the
   hands or the shoulders.
2. The eyes, brows, lips and hair are painted on the one surface by the shader, not modelled: no eyeballs, no wet
   cornea, no hair with volume or strands.
3. The clothes are colour regions of the skin, not garments: no folds that hang, no seams, no thickness.
4. The moves are hand-written sine curves (walk, idle, wave), blended as angles; the feet slide while walking and do not
   meet a slope; nothing moves by itself (hair, cloth), the face never blinks or looks at anything.
5. One person; no faces or bodies that differ.

### Made things (`assets/belltent.js`, `firepit.js`, `flame.js`, `deadwood.js`)

6. Built from flat faces coloured face by face: the tent is a clean cone and a straight wall, its canvas never sags,
   wrinkles, stains or shows its seams; the stumps round the fire are plain cylinders.
7. Few materials of their own and little wear: no dirt where they meet the ground, no weathering.
8. The fire's light falls on placed things only (`src/world/fire.js` fireLight), not on the ground, the grass or a person;
   it throws no flicker into the shadows and no smoke rises.

### Ground (`src/terrain`, `materials/*`)

9. The pebbles read as flat cut-outs: evenly lit, chalky, no shade between them where they touch (Samuel's screenshot of
   the ground looking down, 2026-11-16).
10. The ground has no relief of its own up close (no displacement): stones and clods are colour and normals on a flat
    surface.
11. A baked material repeats (1024 px tiles): from above, the pattern can show.
12. Paths, litter and the edges between grounds are blends, not things lying there (twigs, leaves, footprints, ruts).

### Plants (`assets/kit/tree.js`, `src/scatter/trees.js`, `src/scatter/grass.js`)

13. Leaves and needles are crossed cards cut out of a painted sprig: up close the cards and their cut edges show.
14. Far away a crown becomes one solid body and then a speck: the hand-over can show as a change of shape and colour.
15. The grass is blades of one kind, shade and density per ring: no flowers, no seed heads, no mixed species, no dry or
    trodden patches beyond its dryness value.
16. Few species: two trees, a few shrubs, reeds, bracken.

### Light and shadow (`src/world/light.js`, `src/world/shadow.js`)

17. One shadow map, 2048 texels, round the camera: no cascades, so shadows are soft or gone further off, and small
    things (pebbles, blades, fingers) cast none of their own.
18. No ambient occlusion: nothing darkens where things meet (a stone on the ground, a foot on the path, the inside of the
    tent), so things look laid on rather than standing in.
19. The sky's light is a formula of the facing (most from above, a little bounced from the ground), not light that
    bounces: no colour bleeding, the inside of the tent no darker than it would be.
20. No reflections but the water's of the sky: nothing glossy shows what is round it.

### Water (`src/terrain/water.js`, `materials/water.js`)

21. The river reflects the sky only, not its banks, trees or the tent; no refraction of the bed, no caustics, no foam
    where it breaks, no wet edge on the bank.

### Sky and air (`src/world/sky*`, `src/world/weather/*`)

22. The sky is a dome of colour by the sun's height; the clouds are one layer of a baked tile, not volumes: no light
    shining through their edges, no shafts of light.
23. The air is one haze by distance: no mist in the hollows, no light scattered towards the sun.
24. Rain does not exist yet (the weather has wind, clouds, snow).

### The picture (`src/core/screen.js`, `src/core/temporal.js`, `src/camera/post.js`)

25. No bloom: the sun, the fire and bright sky do not glow over what is near them.
26. No motion blur; depth of field only in the virtual camera (films), not when walking.
27. Exposure follows the hour, not what the eye looks at: walking into the tent's shade it stays as bright as outside.
28. On phones the governor draws the world at fewer pixels than the screen: softer than a photograph.

## Define

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel picks which groups to take up first (each its own intent)

## Changelog

### 2026-11-16

- **Asked:** "Tell me everything that is not photorealistic now. So we have the inventory of stuff we need to fix."
- **Delivered:** the inventory above, 28 points in 8 groups, from the code and the screenshots of the day.
- **Good:** Each point names the file it lives in.
- **Broke / not there yet:** Judged on a software GPU and by reading the code, not on a real GPU or an iPhone; some points may look better there than here.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `9a8e050` | the inventory, 28 points in 8 groups |
