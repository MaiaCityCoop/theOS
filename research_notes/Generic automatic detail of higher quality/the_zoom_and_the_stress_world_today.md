# The zoom and the stress world as they are today (read in the repository, 2026-11-16)

Not web research: read first-hand in this repository's code and documents, for the two requirements of Samuel's
fourth message. Paths are from the repository's root.

> And no visual jumping allowed between walking and zooming from closeup to 12 km away! While keeping the full stress
> test performance as in magic world stress test environment tested at 60 fps, 8 GB RAM and 4K are hard gates for the
> algo, incl. stress test moving assets and millions placed.

("Magic world" is Magic Wonder, the stress world: `?stress` in the address.)

## Takeaway

1. **Zooming is harder than walking for any method that streams.** The one zoom moves the camera from 1.7 m to 12 km
   without a step. On a quick scroll every thing in view passes through all its levels within a second or two, and
   zooming in asks for the fine detail of things that were far a moment ago, before any of it is built.
2. **The engine already has a rule for that, and a new method must keep it:** nothing changes at once. A change by
   size is a move of vertices or one sprig at a time; a mesh that comes late grows out of the coarser one over a
   second and a half. The only swap left today is the made things' (the tent, the fire pit).
3. **The published cluster systems do not have this rule.** They swap clusters and rely on an error under a pixel and
   on a picture kept from frame to frame. A part that arrives late is by definition more than the threshold off, so a
   swap there shows (Epic names it: streaming pop-in). To hold "no jump" the hierarchy has to carry, for every
   vertex, its place on the coarser stand-in: the same thing that hides a change by size above a pixel.
4. **The stress world fixes the shape of everything else.** 898 million things standing and nine million moving stay
   within the gates because nothing is kept per thing, a level of every kind is one draw, a level is chosen per
   thing in one compute pass, and a kind's fine meshes exist only while it is near (eight kinds hold their full mesh
   at once). A cluster hierarchy is built from the fine end, so it can only be built for the kinds near; every kind
   needs a far stand-in that does not wait for it.

## Cited findings (each read in the file named)

### The one zoom

- One rig, one value: "The camera is one rig driven by a single height above the ground, from about 1.7 m (eye level)
  to about 12 km (the whole city and the horizon). Scrolling moves that value continuously; nothing switches mode. The
  height decides, together: the tilt [...], the lens (wide close, longer far), the speed of moving, the pivot [...]"
  (`Intents/0003-one-camera-one-collision.md`, Define).
- The wheel adds to the logarithm of the height (`src/camera/rig.js`: `L = Math.max(L0, Math.min(L1, L + e.deltaY *
  RIG.wheel * ...))`, `get height() { return Math.exp(L); }`); a pinch does the same (`src/camera/touch.js`).
- Intent 0003's first check is a scripted scroll: "a scripted scroll from 12 km to eye level and back over the tent:
  height, tilt, lens and speed change smoothly frame by frame".
- The governor reads the lens for the detail dial: `detail(camera) { zoom = Math.max(1,
  camera.projectionMatrix.elements[5] / REF); lod = Math.min(zoom, cap); return lod; }` (`src/core/governor.js`).

### How a change of level is hidden today (`TheGame/src/detail/README.md`)

- "Nothing of it changes at once (the answer to levels popping at every distance)".
- "A level turns into the next coarser one before that takes over. Every vertex is kept twice: as it is, and where it
  lies on the coarser mesh (with that mesh's normal there). [...] No dither, no two levels drawn at once."
- "A fine level that comes late grows out of the coarser one the same way, over half a second, and one level after
  another, never two at once (measured: 5 to 12 % of the picture changing a frame, against 42 to 75 % in one frame)."
  Later in the same file, for the plots: "A level turns into the next over the whole of its range, not its last
  third, and a mesh that comes late grows in over a second and a half: a thing is never still between two levels,
  and never jumps."
- Its textures: "the mipmaps make a far thing its textures' mean, so its colour does not jump either".
- Made things (`assets/belltent.js`, `src/detail/README.md`): face lists written by hand per level, swapped whole:
  one frame the one, the next the other.

### The stress world (`TheGame/src/scatter/stress.js`, its header; `src/detail/README.md`)

- "Every village plot of the city (src/city: 898 of them) is filled with a million of what stands, a hundred of each
  kind; and in every plot ten thousand of what roams move about, each herd at its own pace. 898 million standing,
  nine million moving. Only with `?stress` in the address".
- Its kinds: "eight thousand shapes nobody drew, each its own mesh of 50 000 to 200 000 triangles, its own texture
  and look; two thousand plants of leaf cards, cut out, swaying; a thousand kinds of creature, each ONE mesh on a
  skeleton of its own."
- "nothing of where they stand is kept. A plot is a row of numbers [...]; its million are a lattice of 1000 by 1000
  cells folded onto that shape, worked out on the GPU for the cells a tier looks at"; "where a mover is is a function
  of the clock [...]: no mover has a state to keep".
- "every kind's meshes lie in one heap (heap.js): a level of every kind is one draw call, its vertices read from the
  heap by the kind's number. Two shaders (the meshes', the dots'), whatever the number of kinds".
- "the coarse levels of every kind are always there; the fine ones (the full mesh, and two under it) only of the
  kinds that stand or pass near, built in workers as the camera comes and put out again when it has gone. Until a
  fine level has come, the next coarser one is drawn in its place".
- The pools of the fine levels, finest first: 8, 48, 320, 768 and 2048 slots (`stress.js`, the tiers' table). So
  eight kinds can hold their full mesh at once.
- "a mover is one mesh, each vertex bound to two bones of its kind's skeleton (sixteen bones a kind [...]); the bones
  are moved in the vertex stage by the mover's stride, itself a function of the clock".
- Cost a kind (`src/detail/README.md`): always held, its coarse levels (768 triangles down to twelve), 29 KB; held
  while near, "its full mesh and two under it, in a few slots a level, built in workers: 2 to 6 MB, 344 KB, 86 KB".
  Draw calls: "one a level (eight), one more for what has the level's own shape, and eight for the movers, whatever
  the kinds".
- Measured there (2026-11-13; M1, Playwright WebKit, 1440 × 779, pixel ratio 1): on the first stand "5.4 ms a frame
  walking among them (135 000 drawn, 1.5 million triangles)"; on the plots, "with Samuel's own tab drawing beside it
  (so too high): 10.6 ms walking in the first village (135 000 drawn, 2.4 million triangles, 3 900 movers)"; "In
  Samuel's Safari, before the materials: 59.2 frames a second at a pixel ratio of 1 to 2".
- The gates (`Intents/0008-webgpu.md`, 2026-11-13): the canvas at the screen's own pixel ratio, 60 frames a second,
  8 GB.

## Inferences (mine)

- **A far stand-in that does not wait.** A cluster hierarchy is built from the fine end: the probe of the first round
  needed the full mesh (0.24 to 0.51 s for a boulder of 110,592 triangles) and then 0.42 s for its hierarchy. Eleven
  thousand kinds cannot be built at a start; only the kinds near can, as their fine levels are today. The stress
  stand's kinds give their coarse levels from the recipe itself at a coarse setting, in a second or two for all of
  them; that is the stand-in a new method can keep (the same recipe, nothing written for it).
- **The step from that stand-in to the hierarchy is a late arrival like any other**, and must grow in: the
  hierarchy's coarsest groups need their vertices' places on the stand-in.
- **Memory can get better, not worse.** Today a near kind holds its whole full mesh (2 to 6 MB) or does not; by groups
  of clusters a near thing would hold what its size on screen asks for (the first round's probe: 13,210 triangles of
  the boulder's 110,592 at 400 px and one pixel of error). The whole hierarchy of a kind is 1.4 times its full mesh
  (3.08 MB against 2.21 MB), so pools by groups, not by kinds, are what keeps the 8 GB.
- **Per frame, only what is large on screen may cost more.** Of 135,000 things drawn, few are larger than a few dozen
  pixels. A far thing has to stay one test in the packing pass and a handful of triangles.
- **Movers.** A group's bounds and error are measured at rest; on bones both move. Epic's own version took until
  5.5 (2024) for skinned meshes (see the notes on Epic's documentation). Nothing here was tried on a skeleton.

## Gaps

- No frame was drawn for this note. The stress world's own numbers above are the repository's, from 2026-11-13, at a
  pixel ratio of 1, not at 4K.
- How fast the wheel can move the height (the quickest scroll a check must hold) was not measured.
- Whether the drawer's indirect draws bind a vertex buffer in WebKit's sense (the slow path named in the Safari note)
  was not traced.
