---
id: "0029"
title: The world ready for millions
state: propose         # idea | define | build | propose | story | archived
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
- **What the checks found, fixed on the way.**
  - The store's GPU table gave some of 100 000 keys no place within eight steps, and made the whole table again for
    each. A key now lies within 32 places, and a look-up stops at the first empty one (`8498e0c`).
  - A tier with nothing to pack now makes no pass. The list's ten tiers had repacked nothing each time the view turned
    (`8498e0c`).
  - The store's copy of its table on the page is made with the first change, not at the start: 4 MB (`98800e9`).
- **Merged with main's 0026** (the start twice as fast, `906f816`). Its `scatter.compile()` compiles every tier's packing
  passes side by side before the first packing; the list's tiers are among them. The named places are stood in the
  list after it.
- **Ids are said, not kept.** A place is 37 bytes on the page. Its id (`placed:<asset>:<x>:<z>`) and its thing's
  (`placed:<cx>:<cz>`, its spot to the centimetre) are made when asked, and taking a place out finds it by its spot
  in the list's order. Keeping a string and a map entry per place was about 150 MB at a million.

## Propose

**Delivered** (draft PR #14, https://github.com/MaiaCityCoop/theOS/pull/14, branch `fix/generic-collision-all-worlds`, merged with main 5bf670c):

- **What stands at a spot of its own is one list, drawn by the one drawer** (`src/scatter/placed.js`). The tent and
  the fire pit stand in it; a city's buildings will.
  - A made thing is a kind of the heap at its own levels (`assets/kit/made.js`, `assets/zoo/made.js`).
  - It keeps its own look.
  - Its far end is the drawer's dot.
  - `?many=N` stands N more.
- **A thing's own state** (`src/world/things.js`): gone and grow for every placer; tint and wear for the made things.
  `things.pick()` names what the eye looks at.
- **A thing's own seed**: its kind's textures move on it, and every shading model gets `c.seed`.
- A tier's rows for a thing lie in one buffer. A tier with nothing to pack makes no pass.

**Checks, as they were.** The final round ran the merged head against main 5bf670c: Chromium, WebGPU on SwiftShader,
the harness of intent 0027. Rounds one and two ran before the merge, against main 1ce722e, and gave the same results.

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | Nine stills: the tent from 4, 15, 60, 300 and 1 000 m; the fire pit from 3 and 12 m; a rock pair; a rock up close. Against main, the mean difference is at most 0.13 of 255, and at most 0.24 % of pixels differ by more than 8; the rock up close differs on 0.61 % (check 6). What differs is the sky, the clouds' shadows and grass blades. At 1 000 m the tent is a dot about 3 px wide where main had its card; no difference shows. A level a draw (`?bylevel`) gives the same stills |
| 2 | passed | Eleven walks with the real keys: four trees, two shrubs, two rocks, the tent's wall, its door, the fire pit's seat. Ten closest approaches are the same as main's; one tree's differs by 2 mm (0.411 against 0.409; main gave 0.411 in round one). The tent's wall holds at 2.75 m, its door lets through to 0.35 m, the seat holds at 0.54 m |
| 3 | passed | 2 places: start 18.0 s, frame median 31.1 ms, packing 2.79 ms, heap 82 MB. 1 000 002 places: start 17.5 s (standing them takes 1.4 s), frame median 32.7 ms, packing 3.24 ms, heap 133 MB, 4 643 packed in view. Round one: 1 002 / 100 002 / 1 000 002 places gave packing 3.98 / 3.45 / 3.52 ms, flat |
| 4 | passed | A tree, a rock (the walks' 1.41 m one) and the tent were each made gone, changed and cleared, and walked into each time with the game's own step. **Tree:** closest 0.59 m before, 0.01 (walked through) gone, 0.73 grown 1.5×, 0.59 cleared. **Rock:** 0.80, 0.01, 1.19 grown 1.8×, 0.80. **Tent:** 2.75 at its wall, 0.01, 2.75 tinted (1.35, 0.55, 0.45) and worn 0.6, 2.75. **Stills, clock held:** gone changes 26.5 %, 2.3 % and 2.0 % of pixels; cleared, 0.16 %, 0.05 % and 1.9 % (the tent's are the clouds: they keep their own clock). `things.pick()` named the rock and the tent; the tree's ray passed over its trunk |
| 5 | passed | 100 000 changed things put in in 0.37 s, every key placed. Frame median 34 ms (33 with the store empty), packing 3.59 ms (3.17), heap 104 MB (78 empty; it was 82 while the table's page copy was made at the start: `98800e9`). Round one found keys with no room in eight steps, and a table made again for each (2.7 s): fixed in `8498e0c` |
| 6 | passed | The walks' 1.41 m rock up close: its stone's grain lies elsewhere than on main, with the same colour and brightness (0.61 % of pixels). A boulder in the 1 000 m still shows the same |
| 7 | passed, one cost | **Normal world.** In the forest, two runs each, alternating: frame median 31.1 and 32.5 ms against main's 32.9 and 30.5; packing 2.30 and 2.89 ms against 2.43 and 2.68; start 17.5 and 15.4 s against 16.3 and 15.7. By the tent: frame median 31.1 ms against 34.6. **Stress world.** Walks made good 6.89 / 7.44 / 12.57 m against 6.86 / 7.44 / 12.48, with the same bodies within 6 m (98 / 66 / 106). Frame 491 ms against 557, packing 9.0 against 9.2, step 3.5 against 3.2 ms. **The cost:** the stress world's start, 32.1 and 34.7 s against 30.9 and 30.3: its shaders are a little larger (the state look-up, the seed), and SwiftShader compiles slowly. **Also:** the asset library loads with no error. Storage buffers per stage peak at 5 (compute) and 4 (vertex) in the normal world, and 7 in the stress world, as on main |
| 8 | passed | `vite build` |

**Known gaps:**

- Checked on SwiftShader only. Not yet seen in Samuel's Safari or on a real GPU.
- A thing's state lives in the page: nothing saves it or shares it between people yet (an intent of the API).
- Plants, rocks and the stress world's things can be gone or grown, not tinted or worn. A made thing's dot does not
  take its tint.
- The list's room is set at the start: four thousand places, plus `?many`. A change sorts the whole list again.
- A made kind per citizen's own house (millions of kinds) would need every level streamed.
- The library shows a placed asset as before (its own page, intent 0025).
- The rocks' kept meshes are made once more at the next start (the zoo's numbers moved by two).
- No story folder. A timeline needs the day and that day's humans in the game, counted, which this session cannot
  count. Stories are told by day now (`Stories/day-NNNN`, the storytelling skills); this work is ready to be one
  day's part.

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
- [x] Checks 1 to 8 (three rounds; the last on the merged head against main 5bf670c)
- [x] Commit, trail, push, draft PR (#14)
- [ ] Samuel: the tent and the fire pit in Safari on a real GPU, near and far (only SwiftShader has seen them)

## Changelog

_One entry per request cycle, newest last._

### 2026-11-15

- **Asked:** Samuel asked what of the stress world's pattern the normal world still lacks for millions of assets with
  their own dynamic procedural textures, and then: "Please ensure our world is ready."
- **Delivered:** the idea and the definition above. Building.

### 2026-11-15, built and checked

- **Delivered:**
  - What stands at a spot of its own is one list, drawn by the one drawer. The tent and the fire pit stand in it and
    look as on main.
  - A thing's own state (gone, grow; tint and wear for made things), read by every placer's packing and every body.
  - A thing's own seed for the heap's solids and the shading models.
  - Draft PR #14.
- **Good:**
  - The stills match main within 0.13 of 255, and every walk comes as close as on main.
  - A million places pack what is in view (about 4 600) at the same cost as two.
  - The stress world walks as before and draws faster.
  - The tier's one buffer of rows freed a binding in every pass.
- **Broke on the way, fixed:**
  - The fire pit's meshes first came 37 s late, queued behind the plants' in the workers; a small make now makes its
    coarse levels on the page.
  - The store's table had no room for some keys at 100 000, and made itself again for each (`8498e0c`).
  - The list's tiers made empty passes as the view turned (`8498e0c`).
  - The test views needed care: the first rock pair lay under the river, and a frozen clock keeps late leaves from
    growing in.
- **Not there yet:**
  - Not seen on a real GPU or in Safari.
  - The state is not saved.
  - Tint and wear are for made things only.
  - The stress world's start is 2 to 4 s longer on SwiftShader (its shaders a little larger).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `d802ff5` | Placed things through the one drawer (the list, the made things' kit, family and material, the drawer's dot for a make); a thing's own state (the store, every placer, bodies); a thing's own seed; a tier's rows in one buffer; docs |
| 2026-11-15 | `8498e0c` | The store finds a key in up to 32 places, stopping at an empty one (check 5 found keys with no room in 8); a tier with nothing to pack makes no pass |
| 2026-11-15 | `906f816` | Merged main 5bf670c (0026): `main.js` both kept, the list's tiers among those `scatter.compile()` compiles |
| 2026-11-15 | `98800e9` | The store's table on the page made with the first change (4 MB less where nothing changed) |
