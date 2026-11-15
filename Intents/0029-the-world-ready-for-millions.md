---
id: "0029"
title: The world ready for millions
state: build           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-15
story:
---

# 0029 · The world ready for millions

## Idea

Samuel, after intent 0027 brought the stress world's collision to every world:

> Is there anything else that has not been ported from stress test pattern to real world?

> Ok what is worth directly integrating / fixing now? And does our world have now architecturally everything for
> millions of assets with their own dynamic procedural textures as well?

The answer was "partly":

- Millions of hashed things, and thousands of kinds each with its own mesh and texture: yes. The stress world proves
  it with 898 million things standing and 9 million moving.
- Three things were missing:
  - What stands at a spot of its own (the tent, the fire pit, and later the city's buildings) is not drawn by the one
    drawer. Each copy is its own object with its own meshes, so ten thousand of them would be ten thousand objects.
  - Nothing of one single thing can change: there is no state of its own.
  - All the things of one kind wear its texture the same way.

Samuel:

> This was always the stress test's target intention to preorder everything for scaling. Please ensure our world is
> ready.

## Define

Samuel asked for the work outright, and this definition is what the answer above already said was missing, so it is
built straight away. It holds one decision Samuel may want to look at: a placed thing's far card (its impostor) becomes
the drawer's dot, because a card baked for each kind does not scale to thousands of kinds (11 MB each).

**Deliverables**

1. **Placed things through the one drawer.** Every made thing that stands at a spot of its own (`world/places.js`:
   today the tent and the fire pit) is drawn by the one drawer (`src/scatter/drawer.js`). It is placed by one list
   placer (`src/scatter/placed.js`):
   - Any number of spots, kept on the GPU in the order of where they stand.
   - Packed level by level for what is near and in view, as every other placer is.
   - A thing keeps its own look: its colours, the world's materials wrapped round it, the wind, the snow, the fire's
     light.
   - It keeps its own levels, with the same hand-over between them.
   - Its body stays in the one collision engine.
   - Its last level is the drawer's dot.
2. **A thing's own state** (`src/world/things.js`). A sparse store of what has been done to single things, by the
   thing's id, for every placer: plants, rocks, placed things and the stress stand.
   - What can be done: `gone` (cut down, taken away), `tint` (painted), `wear`, `grow`.
   - Every packing reads it on the GPU. Nothing is stored for a thing nobody changed.
   - A thing that is gone is neither drawn nor solid.
   - A thing's id is the one the collision engine gives its body, so what the walker meets or the eye looks at can be
     named (`things.pick()`).
3. **A thing's own look from its seed.** Every thing of the heap's own make (rocks, the stress stand) gets a seed of
   its own.
   - The seed moves its kind's texture on it: two rocks of one shape no longer wear the same pattern.
   - Every shading model is handed the seed (`c.seed`), so a kind's procedural look can differ thing by thing.
4. **Nothing else broken.** The stress world loads and walks as before. The normal world's start and frame times stay
   within noise of main.
5. **The docs say it.** That means `src/detail/README.md` (its out-of-date collision paragraph too), the drawer's
   header and `src/scatter/index.js`.

**Checks** (how each is shown to be done)

| # | Check | How |
| --- | --- | --- |
| 1 | The tent and the fire pit look as they did | screenshots from 4, 15, 60 and 300 m, main beside this branch (Chromium, WebGPU on SwiftShader) |
| 2 | They are as solid as they were | the walker driven into the tent's wall, through its door and into the fire pit: start and end positions, main and this branch |
| 3 | Placing scales | `?many=N` stands N more tents and fire pits round the meadow. The frame's CPU time and what the packings hold, for N = 0, 1 000, 100 000 and 1 000 000 |
| 4 | A thing's state works for every placer | a tree, a rock and the tent: gone (not drawn, walked through), tinted, grown, then cleared: screenshots and walk positions |
| 5 | The store costs little | frame time with the store empty and with 100 000 entries |
| 6 | A thing's own look | two rocks of one shape side by side, main and this branch: screenshots |
| 7 | Nothing else broken | the stress world (`?stress`): it loads and its walks are as before; the normal world's start and frame times, main and this branch |
| 8 | It builds | `vite build` |

**Out of scope**

- Keeping a thing's state anywhere but in the page: saving it to the API, sharing it between people. That needs an
  intent of the API.
- Movers in the normal world (citizens walking about).
- Grass on the drawer; the plants' light and wind on the shading models.
- How the library shows a placed asset (intent 0025's page): it keeps its own staging.
- The fire's flame: it is a light, not a mesh.

## Build

**What was built**

- **The list placer** (`src/scatter/placed.js`, engine `placed`). `stand(asset, at)` puts a place in the world's list,
  and `src/main.js` stands `world/places.js`'s tent and fire pit with it. The flame is a light and still goes through
  `place()`, as does anything where WebGPU is missing.
  - The list sits in two rows of numbers per place on the GPU, kept in the order of where places stand. Each
    32-metre square gets a number on a Z-shaped walk over the land, so any aligned square of 2^k of them is one run
    of the list, found by two binary searches.
  - A level's tier looks at the squares of its band that are in view, and packs each square's runs (`tier.js`:
    `spans`). Its square size grows with how far its band reaches, so a tier looks at a few hundred squares at most.
    Where there are more runs than a packing takes, the nearest come first.
  - `?many=N` stands N more places round the meadow, to measure.
- **Made things on the heap.**
  - `assets/kit/made.js` packs a placed asset's faces at 16 bytes a vertex: its place in its box, its normal, its
    colour and the material its face wears. It also measures its box and the outline of its dot.
  - `assets/zoo/made.js` brings every such asset to the zoo by itself (`placement.at: 'places'`, of faces, not a
    fire).
  - The drawer's other make of vertex draws them (`make: { per: 1, byKind, dot }`) with their own levels. Their
    material is `src/world/place.js`'s, reading the heap and the packing: colours, the world's materials wrapped round
    by part, sway and flap in the wind, snow, the fire's light, the same hand-over.
  - The drawer's dot now also ends a make of vertex that asks for it. A kind's look may say its dot's width and the
    height of its middle (`dot`), so a flat fire pit's dot is not a ball's.
- **A thing's own state** (`src/world/things.js`).
  - The store is a map by id on the page and a table of 2^18 entries on the GPU, each looked up in at most eight
    steps. The key is woven the same way in JS and as nodes.
  - Every drawer tier names its placer (`thing`: `plants:<stand>`, `rocks:<asset>`, `stand`), or the placer hands
    its own key (the list). Its packing drops what is gone and packs what grew larger. While the store is empty,
    nothing is looked up at all.
  - A drawer made with `state` packs one more row, tint and wear. The made things' material paints with the tint and
    greys and darkens with the wear.
  - Every body carries its thing's id (`thing`). `bodiesNear` leaves out what is gone and scales what grew.
    `things.pick()` names the first body a ray from the eye meets.
  - The store is flushed to the GPU once a frame, before anything packs (`src/scatter/index.js`).
- **A thing's own seed.** B.w of the drawer's packing is now a thing's seed (0 … 2π): its sway's phase where it
  sways, otherwise a hash (rocks, the stress world's movers). The solids' shader moves its kind's textures on it by
  up to thirteen tiles, and the shading models get `c.seed`.

**Decisions, and what turned out different from the definition**

- **One buffer for a thing's rows.** WebGPU gives a shader stage 8 storage buffers. Before this intent the normal
  world's passes used up to 6 and the stress world's 7, so a row of state plus the store's table would have broken
  the stress packing. The tier now lays a thing's rows side by side in one buffer (`tier.js`), so a pass binds one
  buffer for them, not one a row. Every reader goes through the tier's `read`, `readAt` and `read()`, so no placer
  changed. Measured with the store's table included: at most 5 storage buffers in compute and 4 in the vertex stage
  in the normal world (it was 6 and 6), and 7 in the stress world's compute (as before).
- **Tint and wear only where a drawer carries a row of state** (today the made things). Plants, rocks and the stress
  stand can be gone or grown. One more row a thing is memory that every thing pays for: about 12 MB in the stress
  world. This differs from the definition, which said all four for every placer.
- **A small make makes its coarse levels on the page** (`make.here`). In the first run the fire pit's meshes queued
  in the recipes' workers behind the plants' and came 37 s after the start on SwiftShader. On main it stood there at
  the first picture. A make whose kinds have under 300 000 faces now makes them as the worker would, here, in a few
  tens of milliseconds. The browser keeps them for the next start as before.
- **The impostor became the drawer's dot**, as defined. The last mesh level is drawn down to the impostor's pixels,
  then a dot of the kind's mean colour (or the mean of its main material, in its tint) covers what its coarsest level
  covered, seen from the side.
- **The zoo's numbers moved.** The made things' family is found among the zoo's families before the rocks' and the
  plants', so their kinds are numbered two later (a rock pair's kind is 11020 here, 11018 on main). What the browser
  keeps of the rocks is filed under a fingerprint that holds those numbers, so their coarse meshes are made once more
  at the next start. The plants' kept meshes are filed by their recipes' versions and are read back as before.
- **Ids are said, not kept.** A place is 37 bytes on the page. Its id (`placed:<asset>:<x>:<z>`) and its thing's
  (`placed:<cx>:<cz>`, its spot to the centimetre) are made when asked, and taking a place out finds it by its spot
  in the list's order. Keeping a string and a map entry per place was about 150 MB at a million.

## Propose

_Filled when everything is built. Then stop: the human decides._

## Story

_Filled after the human's yes._

## Archived

_accepted or rejected, the date, the reason in a line._

---

## Todo

- [x] Placed things through the one drawer (list placer, made things' vertex and material, dot)
- [x] A thing's own state (store, GPU table, every placer, bodies, pick)
- [x] A thing's own look from its seed
- [x] Docs (`src/detail/README.md`, the drawer's and the tier's headers, the shading contract)
- [ ] Checks 1 to 8
- [ ] Commit, trail, push, draft PR
- [ ] Samuel: the tent and the fire pit in Safari on a real GPU, near and far (only SwiftShader has seen them)

## Changelog

_One entry per request cycle, newest last._

### 2026-11-15

- **Asked:** Samuel asked what of the stress world's pattern the normal world still lacks for millions of assets with
  their own dynamic procedural textures, and then: "Please ensure our world is ready."
- **Delivered:** the idea and the definition above. Building.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `d802ff5` | Placed things through the one drawer (the list, the made things' kit, family and material, the drawer's dot for a make); a thing's own state (the store, every placer, bodies); a thing's own seed; a tier's rows in one buffer; docs |
| 2026-11-15 | `8498e0c` | The store finds a key in up to 32 places, stopping at an empty one (check 5 found keys with no room in 8); a tier with nothing to pack makes no pass |
