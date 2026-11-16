---
id: "0033"
title: Detail that scales by itself, from any asset
state: build              # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story:
---

# 0033 · Detail that scales by itself, from any asset

## Idea

> Can you research an algorithm for better smooth automatic LOD? Instead of each asset defining its own breakpoints
> that are not smooth transitioning?
> Isn't there a good fully automatic render engine algorithm, that can take even a 10 million procedurally generated
> asset and scale it automatically? Down to just a pixel from the far horizon? Fully smooth?
> Search for the algorithm based solution that can plug any asset as large as it will be in fully detailed view. You
> see what I mean?

And, when the answer had come:

> It should also ensure to increase the current quality gate while keeping 60 fps and 4K intact.
> I don't like our current LOD system either: it kind of visually transforms, changes shapes and style, pumps,
> especially shrubs and tree crowns. This should be 100 % smooth with no visible difference. Do you see what I mean?

And, when the definition had come:

> So the quality of the new algorithm must be higher. And the algorithm needs to be fully generic, scalable for any
> kind of future assets. Ask me to open up the relevant domains to [research] properly!

(The last word is my reading of "detach".)

And while that was being worked in:

> And no visual jumping allowed between walking and zooming from closeup to 12 km away! While keeping the full stress
> test performance as in magic world stress test environment tested at 60 fps, 8 GB RAM and 4K are hard gates for the
> algo, incl. stress test moving assets and millions placed.

(His "magic world" is Magic Wonder, the stress world: `?stress`.)

Samuel wants an asset's file to hold its full-detail recipe and nothing else: no levels, no pixel sizes. One rule of
the engine takes it from there down to a pixel, with nothing to see on the way: no swelling, no shrinking, no change
of shape or style, above all on shrubs and crowns, and no jump, whether he walks or zooms, from close-up to 12 km. The
picture must be better than today's. The rule must hold for assets nobody has thought of yet, with nothing written
for their kind. And the gates stay, tested where the engine is tested hardest: 60 frames a second, 8 GB and 4K in the
stress world, with its nine million movers and its 898 million placed.

Below: what is written per asset today, what Samuel sees today (measured), the gates, the zoom and the stress world
as they are, the answer, what was measured on our own assets, one builder for any asset (tried), what the originals
say, what exists and what is not known. What would be built is in the definition.

The research in full, with its sources: `reports/Smooth automatic level of detail.md` (the first round, from search
extracts for the most part) and `reports/Generic automatic detail of higher quality.md` (the second, from the original
decks, documentation and code, once Samuel had opened their hosts). Their notes, and the scripts that made the
measurements below with their outputs: `research_notes/Smooth automatic level of detail/` (the scripts:
`probes/dag.mjs`, `probes/crown.mjs`; what was measured: `probes_on_the_games_own_assets.md`; three pictures of it:
`probes/out/boulder-four-ways.jpg`, `probes/out/oak-crown-under-each-rule.jpg`,
`probes/out/today-each-plant-at-each-level.jpg`) and `research_notes/Generic automatic detail of higher quality/`
(the script: `probes/generic.mjs`; what was measured: `one_stick_for_any_asset.md`; two pictures of it:
`probes/out/oak-today-beside-the-builder.jpg`, `probes/out/pine-today-beside-the-builder.jpg`).

### What is written per asset today

Intent 0002 gave every asset one rule for *when* a level changes (its size on screen) and one way to hide the change.
*Which levels there are* is still said three ways (read in the code, 2026-11-16):

| Make | Its levels | Its pixel sizes | A change |
| --- | --- | --- | --- |
| Solids: rocks, the stand's bodies, creatures | a ladder of eight for every kind: the full mesh, balls of 32, 16, 8, 4, 2, 1 squares an edge, a dot (`assets/kit/ladder.js`) | 400, 128, 64, 32, 16, 8, 4, 1.15 | every vertex moves to its place on the next mesh: nothing jumps |
| Plants | tables in each species' file: puffs, cards a puff, card sizes, tube sides, a number for each level (`assets/stonepine.js`, `holmoak.js`) | per kind (`assets/kinds.js`) | sprigs shrink and grow one after another |
| Made things: the tent, the fire pit, later houses | face lists written by hand for each level (`assets/belltent.js`: `bell(32)`, `bell(16)`, `bell(10)`, `bell(6)`) | per kind | none: one frame the one, the next the other |

A level is always chosen for a whole thing. A rock larger than the screen is drawn at its full mesh all round.

### What Samuel sees today, measured

He is right, and it can be counted. Each of a plant's levels as its file draws it, beside its nearest level: how much
of the picture the crown touches (its outline) and how much it covers, seen from the side (the picture:
`probes/out/today-each-plant-at-each-level.jpg`).

| Plant | Level, and the height on screen it is drawn at | Triangles | Outline | Cover |
| --- | --- | --- | --- | --- |
| Holm oak | nearest, 600 to 260 px | 21,444 | 100 % | 100 % |
| | level 1, 260 to 80 px | 3,948 | 109 % | 108 % |
| | level 2, 80 to 34 px | 1,068 | 116 % | 110 % |
| | level 3, 34 to 18 px | 228 | 127 % | 113 % |
| | its far body, 18 to 7 px | 30 | 57 % | 63 % |
| | its speck, 7 to 3 px | 8 | 29 % | 32 % |
| Stone pine | level 1, 2, 3 | 2,342; 810; 150 | 122 %, 134 %, 124 % | 120 %, 131 %, 116 % |
| | its far body, its speck | 30; 8 | 53 %, 27 % | 58 %, 29 % |
| Mastic (a shrub; its largest side) | nearest, over 140 px | 744 | 100 % | 100 % |
| | level 1, 140 to 16 px | 88 | 84 % | 75 % |
| | its far body, 16 to 5 px | 20 | 37 % | 49 % |

- **A crown grows by a tenth to a third as it goes to coarser levels, then falls to half and to a quarter.** Walking
  up to a tree it is the other way round: it swells out of a speck, overshoots, and shrinks to its true size.
- **Its shape changes**: the pine's umbrella is a ball at level 3 and a flat polygon after it.
- **Its style changes**: a coarser level has fewer and larger cards, each wearing the same sprig stretched, so its
  leaves grow (the pine's cards: 1.15, 2.6, 4.4, 6 m).
- **A shrub loses a quarter of its cover at its first change**: all its fine sprigs go there, 744 triangles to 88.

The hand-over between two levels is soft (both are drawn, sprigs shrink and grow one after another); what it moves
between are these different shapes. Beside them, the same oak thinned and enlarged by measure (below) held its cover
at 99 to 101 % and its outline at 100 to 106 % from all its sprigs down to 4 % of them.

### The gates

Three hard gates since 2026-11-13 (intent 0008): the canvas at the screen's own pixels, 4K on a 4K screen
(`src/core/screen.js`); 60 frames a second; 8 GB. "The highest realism they allow." A level is chosen by the game's
own pixels (`innerHeight`: `src/detail/index.js`), so on a screen of two pixels to each of them a level's error is
twice as many of the screen's: detail does not rise with the screen today.

### The zoom and the stress world, as they are

Read in the code and its documents, 2026-11-16.

**The one zoom** (intent 0003, `src/camera/rig.js`): one rig, one height, from the eyes at 1.7 m to 12 km over the
city; the wheel or a pinch moves it without a step, and the height sets tilt, lens and speed. On a quick scroll every
thing in view passes through all its levels within a second or two. What walking never does, the zoom does: it asks
for the fine detail of things that were far a moment ago, before any of it is built.

**How a change is hidden today** (`src/detail/README.md`): a solid's vertices move to their places on the next
coarser mesh over the level's range; a plant's sprigs shrink and grow one after another; a mesh that comes late
grows out of the coarser one over a second and a half, one level after another. A made thing swaps whole: one frame
the one, the next the other. So today a jump can be seen on the tent and the fire pit, not on rocks or plants; what
shows on plants is the pumping measured above.

**The stress world** (Magic Wonder, `src/scatter/stress.js`, only with `?stress`): every one of the city's 898
village plots holds a million things that stand and ten thousand that move: 898 million standing, nine million
moving. Its kinds: eight thousand shapes nobody drew, each its own mesh of 50,000 to 200,000 triangles with its own
texture; two thousand plants of leaf cards; a thousand creatures, each one mesh on a skeleton. How it stays within
the gates is the pattern any new method has to keep:

- Nothing of where a thing stands is kept (a plot is 532 bytes), and a mover's place is a function of the clock.
- A level of every kind is one draw: a handful of draws for the world, whatever the number of kinds.
- A level is chosen for a whole thing, in one compute pass over what is near.
- A kind's coarse levels are always held; its full mesh and the two under it only while it is near, built in workers
  as the camera comes, in pools of a few slots (eight kinds can hold their full mesh at once), put out when it has
  gone.

Its last written record (`src/detail/README.md`, 2026-11-13, an M1): 10.6 ms of GPU time a frame walking in its
first village at 1440 by 779 and a pixel ratio of 1, with another tab drawing beside it, for 135,000 things drawn,
2.4 million triangles and 3,900 movers. In Samuel's Safari: 58.7 frames a second from higher up at a pixel ratio of
2; near the ground 55.8, "with spans of 47 to 56 until the governor had the ratio down to 0.75: among them the plots
do not yet hold the gate". **So by its own record the stress world did not hold 60 frames a second near the ground
three days ago.** What it holds today was not measured for this intent.

**What this asks of the method**, beyond what was written before:

- *The hierarchy is built from the fine end.* Nothing of a kind can be drawn from it before its full mesh has been
  made on the device (0.7 to 0.9 s a kind for a boulder on one thread). For eleven thousand kinds that can only happen
  for the kinds near, as their fine levels are built today. So every kind needs a far stand-in that does not wait for
  it, and the step from that stand-in to the hierarchy must not show.
- *A part that comes late must grow in*, as a late mesh does today. The published systems swap and rely on an error
  under a pixel; a late part is always more than a pixel off, or it would not have been asked for.
- *Only what is large on screen may cost more than today.* Of 135,000 things drawn, few are larger than a few dozen
  pixels; the others must stay one test and a few triangles each.
- *Movers are on bones.* A group's place and its error move with them.

### The answer

**Yes, there is such an algorithm, for everything that is a surface.** Unreal calls its version Nanite; the idea is
from research of 2005 (Batched Multi-Triangulation). It has two halves:

1. **Once, when the asset is made.** Its full mesh is cut into clusters of about a hundred triangles. Neighbouring
   clusters are grouped; each group is simplified to half its triangles while the group's outer border is held still;
   the result is cut into clusters again. At the next level the clusters are grouped differently, so no border is held
   for ever. This goes on until one cluster is left. Every cluster keeps two numbers: how far it is off the full mesh
   (its error), and how far its coarser replacement is.
2. **Every frame, for each cluster by itself.** It is drawn if its own error is under so many pixels on screen and
   its replacement's is not. That one test, the same for every cluster of every asset, gives a closed surface with no
   cracks, finer where the camera is near and coarser behind, and never more triangles than the screen can show.

One number is left for the whole engine: the error in pixels. It is the governor's dial. No asset writes a level.

**It is not the whole answer.** Three things complete it:

- **A crown of leaves is not a surface.** The same simplifier thins it away (measured below). For a heap of small
  loose parts the rule is another, from Pixar (Cook and others, 2007) and what SpeedTree's leaves do: keep a share of
  the parts, in an order fixed once, and enlarge the ones that stay so the heap covers as much. Unreal's newest answer
  (5.7, November 2025; experimental there still, in the preview of 5.9 a year later) turns far crowns into small
  cubes instead.
- **The hierarchy ends at one cluster, not at a pixel.** Under it the last cluster is halved again and again to a
  handful of triangles, then comes the dot and the land's colour we have. What each of these last steps must keep is
  what the eye gets from the thing: how much it covers and its mean colour.
- **"Smooth" in the published systems means "too small to see", not "blended".** At an error of one pixel a change
  moves the surface by less than a pixel, and a picture kept from frame to frame (ours is: `src/core/temporal.js`)
  hides the rest. Above a pixel a change can show. Then there are two ways: a stipple between the two cuts (drawing
  both for a while), or ours, moving vertices. Nobody found has done ours inside such a hierarchy; I tried it below.

So: **one measure (error in pixels), two rules that need nothing from the asset (a surface: the cluster hierarchy; a
heap of small parts: thinning and enlarging), one end (the dot, then the land's colour).**

### Measured on our own assets

Two scripts, run in this session on our recipes with the open-source `meshoptimizer` (MIT) through its WebAssembly,
as a worker would call it. One thread of a cloud machine, under Node. **Nothing was drawn**: no frame time, no GPU.

**A boulder** (`assets/boulder.js`, shape 0, its full mesh of 110,592 triangles):

- Its whole hierarchy is built in **0.4 s**; the recipe itself takes 0.24 to 0.51 s to make the mesh. 1,814 clusters,
  15 levels, twice the mesh's triangles in all, 3.1 MB (the full mesh alone is 2.2 MB in the heap today).
- **No crack** in 177 views from all round and from every distance.
- Triangles drawn, by its size on screen, beside the ladder:

| Size on screen | Ladder today | Cut at 1 px of error | At 2 px | At 4 px |
| --- | --- | --- | --- | --- |
| 2000 px (larger than the screen) | 110,592 | 54,306, of them 23,678 in view | 39,424 (17,692) | 29,802 (13,868) |
| 500 px | 110,592 | 17,000 | 9,614 | 6,104 |
| 400 px | 12,288 | 13,210 | 6,340 | 3,436 |
| 200 px | 12,288 | 3,436 | 1,716 | 428 |
| 128 px | 3,072 | 1,716 | 428 | 214 |
| 64 px | 768 | 428 | 106 | 52 |
| 16 px | 48 | 26 | 26 | 6 |

- How far the drawn surface really lies from the full mesh, where each ladder level takes over (root mean square /
  the most, in pixels). At 400 px: the ladder 0.56 / 4.41; the cut at 1 px 0.14 / 1.10; at 2 px 0.24 / 1.49. At
  128 px: 0.45 / 2.86; 0.19 / 1.02; 0.44 / 2.11. So **at two pixels the cut is about as good as the ladder with 2 to 7
  times fewer triangles**, and at one pixel a good deal better with about as many or half.

- **On a screen of two pixels to each of the game's** (the 4K gate), at 400 of the game's pixels across: the ladder's
  12,288 triangles are off by 8.8 of the screen's pixels at most (1.1 root mean square); the cut with as many (13,210)
  by 2.2 (0.28); one screen pixel of error takes 25,734. Where today the full mesh is drawn, a third of it (33,126
  at 500 px, against 110,592).

**Ten million triangles** (a ball displaced by seven octaves of our noise): built in **25 s** on one thread (a million:
2.6 s). At 400 px across it is drawn with 55,574 triangles at one pixel of error, 9,638 at four; filling far more than
the screen, 171,755 in view.

**An oak's crown** (`assets/holmoak.js`, 21,444 triangles, 3,300 sprigs). How much of the picture the crown covers,
from the side and from above, beside the full crown (a card taken as 45 % sprig):

| What is done | Leaf triangles | Cover, side | Cover, above |
| --- | --- | --- | --- |
| The simplifier, to a tenth | 832 | 34 % | 25 % |
| A tenth of the sprigs at random, left their size | 1,320 | 37 % | 28 % |
| A tenth, each enlarged 2.9 times back into the crown | 1,320 | 99 % | 101 % |
| 4 %, each enlarged 4.5 times | 528 | 99 % | 101 % |
| Its hand-made levels today | 3,168; 768; 216 | 108 to 113 % | 85 to 112 % |
| The kit's far body, then its speck | 24; 8 | 63 %; 32 % | 83 %; 63 % |

The enlargement was found by measuring, not given; it comes out close to what keeps the leaf area. Enlarged the
other way, out of the crown, the same factor makes the crown a third too large.

**The tent** (`assets/belltent.js`, 1,392 triangles after its corners are welded):

- The canvas simplifies well, and the open surface stays whole (no crack in 177 views).
- Its eight ropes (2.4 cm wide) go in one step, when they are about half a pixel wide, and its pegs by halves.
  Counting their loss by distance instead stalls the whole tent at 688 triangles down to 8 px. **Thin and loose parts
  are the weak spot**: they should be parts of their own that fade by how much they cover.

**Moving vertices inside the hierarchy** (our way of hiding a change, tried on the boulder): every vertex a group
loses keeps where it lies on what the group is simplified to, and is drawn part way there. No crack while moving
(measured). On a walk up to the boulder the largest change in one step fell from 2.72 to 1.47 px at two pixels of
error and from 6.75 to 2.51 px at four. Not to nothing: an exact target needs the simplifier's own record of which
vertex was folded into which, and the open simplifier does not give it.

### One builder for any asset, tried

Samuel's third message asks for two things the first answer did not have: a proof that the picture gets better, and a
method that needs no word about an asset's kind. Both rest on a measure that can weigh unlike ways of making a thing
coarser against each other. No published builder has one (below). One was written and run on our assets: the note
`one_stick_for_any_asset.md`, the script `probes/generic.mjs`, both in
`research_notes/Generic automatic detail of higher quality/`. **Nothing was drawn by the game**: the pictures are
reckoned in the script, shape and cover only.

**The stick.** The full thing and a coarser one are drawn from thirteen sides at the size on screen the coarser one
would be used at, and compared patch by patch (four pixels a side; of a thing under 32 pixels an eighth of it): how
far the outline is off, and how much a patch differs in what it shows of leaf and of wood or stone, on average and at
its worst.

**The builder.** Given triangles and which stuff each is of, and nothing else. It finds loose pieces and crowds of
them by itself, tries folding, thinning with enlarging (two orders) and a hull, and keeps what the stick prefers. It
folded the boulder. It folded the wood and thinned the leaves of the oak and the pine, and took a hull for their far
crowns. It thinned the tent's ropes and made those that stayed thicker.

**Against today's levels on the same stick**, each of today's levels at the size it is first drawn at, the builder
with no more triangles:

| Asset, its levels | Outline today | Outline, the builder | A patch off on average: today | the builder |
| --- | --- | --- | --- | --- |
| Boulder, six | 99, 98, 96, 95, 89, 85 % | 100, 100, 100, 98, 92, 102 % | 1, 2, 4, 4, 10, 20 % | 0, 0, 1, 1, 6, 18 % |
| Holm oak, five | 106, 110, 113, 66, 42 % | 101, 104, 93, 91, 92 % | 22, 24, 26, 39, 48 % | 18, 24, 24, 26, 30 % |
| Stone pine, five | 113, 131, 149, 72, 51 % | 103, 108, 94, 94, 97 % | 20, 24, 25, 29, 39 % | 14, 19, 14, 16, 21 % |
| Mastic, two | 89, 46 % | 101, 87 % | 16, 25 % | 16, 16 % |
| Bell tent, three | 99, 90, 89 % | 92, 95, 99 % | 1, 1, 8 % | 2, 1, 9 % |

Of the 21 levels the builder's outline is nearer to the full thing's in 20, and a patch on average nearer in 16,
equal in 3 and further in 2.

**With today's triangles in all, spread so that they follow the size on screen** (things of a kind taken as standing
evenly over the ground; never under eight triangles), read at 14 to 16 sizes from 400 px down:

| Asset | A patch off, over all sizes: today | spread | At its most: today | spread | Outline off at most: today | spread | Sizes where spread reads worse than today's level |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Boulder | 5 % | 4 % | 18 % | 16 % | 15 % | 5 % | 1 of 16 |
| Holm oak | 25 % | 19 % | 46 % | 29 % | 56 % | 10 % | 2 of 16 |
| Stone pine | 21 % | 12 % | 35 % | 20 % | 53 % | 18 % | none of 16 |
| Mastic | 12 % | 7 % | 25 % | 19 % | 54 % | 23 % | 1 of 14 |
| Bell tent | 2 % | 2 % | 8 % | 10 % | 11 % | 4 % | 4 of 14 |

Two pictures, each row one size on screen, the full plant made small beside today's level and the builder's:
`probes/out/oak-today-beside-the-builder.jpg`, `probes/out/pine-today-beside-the-builder.jpg`.

**What it does not show**

- **Not higher everywhere.** Between about 30 and 50 px the oak's sprigs, enlarged five and six times, read worse
  than today's level 2. The tent's hand-made first level keeps its ropes better than anything the builder has. A
  way is missing for each: a stand-in for a group of sprigs, and thin loose parts that keep their cover.
- **Not "nothing to see".** At a twentieth to a fifth of its triangles a crown differs from the full crown in a
  patch by 14 to 24 %, as today's levels do (20 to 24 %). Fewer and larger sprigs are a change of grain whoever
  makes them. What the builder takes away is the pumping: the outline and the cover.
- **Stills only.** Nothing of a change from one size to the next was measured: no walk, no zoom, no jump.
- **The stick had to be corrected three times, each time because its pictures looked wrong while its numbers looked
  right**: it made the wood thicker, misjudged things of a few pixels, and turned the pine's far crown into a block.
  It is a tool to be watched, not yet a judge.

### What the originals say

The second round, once Samuel had opened their hosts: both Nanite decks page by page, Epic's documentation from 5.0
to the preview of 5.9, the open builders and the three.js library from their source, some forty papers on crowds of
small parts and on levels of detail, WebKit's source and Apple's pages. In full, with pages and lines:
`reports/Generic automatic detail of higher quality.md`. One paper stayed out of reach: Cook's of 2007 (Pixar's host).

- **Nobody has a method that is generic the way Samuel asks, and its makers say so.** Unreal's reached each kind of
  asset one at a time, each by a mechanism of its own: rigid meshes in 2021, cut-outs in 5.1, moving vertices
  "limited", bones in 5.5, foliage in 5.7 and experimental to this day. Switches per asset remain ("Preserve Area",
  "Voxelize"). Its author's own lesson (2022): "the unification trap", "Do not try and solve Everything Everywhere
  All at Once". The open builder is one loop told nothing, for surfaces; its aid for foliage has to be switched on by
  someone who knows it is foliage. The open three.js library does pick by itself among three ways (folded triangles,
  pieces thinned in pairs and widened, a hull of small cubes): the shape of the builder proposed here. Its own demo
  still sets its foliage by hand.
- **What stops them is the measure.** Every published builder gives a way its error as a length. A length cannot tell
  "moved" from "gone" from "see-through", so ways of unlike kinds cannot be weighed against each other, and someone
  has to say which asset takes which. None of the builders measures cover or chooses by a difference between
  pictures. Off line it is done: Hasselgren and others fit stand-ins to pictures one asset at a time, and a paper of
  2004 set the scale of its error by them. The stick tried above brings that into the builder. That is the step this
  intent takes beyond what is published, with the least outside evidence to lean on.
- **"Invisible" in Unreal's stands on two legs**: under a pixel of estimated error, and a picture kept from frame to
  frame. The estimate is, in its author's words, "a complete heuristic hack" that "can fail". Nothing moves or
  blends. Named losses: parts that pop in when they arrive late, the far stand-ins that "can sometimes be noticed as
  a pop", flicker of what is under a pixel. Its published times are for about 1400p made up to 4K, not for 4K drawn.
  Hoppe found in 1998 that with vertices moved between levels an error of a few pixels is "nearly imperceptible". No
  cluster system moves vertices. Ours does today, and would.
- **Crowds of small parts.** Thinning and enlarging is the published rule and ships (the hair of MachineGames'
  Indiana Jones at 60 frames a second; the tree sample of Kuth and others, which stops enlarging at five times). Its measured limit: with nine tenths
  removed it reaches 14.5 dB where as many quads, each placed to match the picture, reach 23.9 (Hasselgren and
  others, 2021).
  The better way for the far half is a stand-in for a group of parts, shaped by the group's own spread and
  see-through by its cover. Unreal's cubes are that; so is the probe's hull, for a whole crown.
- **Safari and Apple's GPUs.** three.js 0.187, in our `node_modules` already, ships its own experimental cluster
  drawer (clusters of 64 triangles, a level a whole thing, one draw) and a compute drawer for small triangles (no
  cut-outs, no motion). WebKit passes a draw that reads its vertices itself straight on; one with vertex buffers is
  checked first, and an M1 splits the pass after 512 of them. Nobody has measured a cluster hierarchy in Safari or on
  an iPhone. The researcher's reckoning for a base M1 at a 4K canvas: 2 to 3.5 million triangles a frame with the
  world drawn at half to six tenths of the pixels each way, about what the game draws now. So a better picture has to
  come from the same triangles spent better.

### What exists openly

- **`meshoptimizer` 1.3** (MIT, September 2026): every building block. Its JavaScript package leaves out the grouping
  step; the probe's own took a few dozen lines.
- **`three-virtual-geometry` 0.1.3** (MIT, October 2026, one author): this very method for three.js's WebGPU renderer
  with compute passes. Read, not run. Its author reports 147 to 230 frames a second on a MacBook Pro with an M4 Pro
  in Chrome while drawing 6.5 to 9 million triangles. It publishes nothing for Safari or a phone. It already holds
  answers to most of the above: a tail under one cluster, a stipple above 1.25 px, leaves thinned in pairs and
  widened, a hull of small cubes for far crowns.
- **three.js 0.187 itself** (`examples/jsm/pipelines/MeshletDrawingPipeline.js`, new in this release, experimental):
  clusters of 64 triangles, six levels chosen for a whole thing, culled in a compute pass, drawn in one call. Not a
  hierarchy cut cluster by cluster, and no cut-outs in its compute drawer.
- Bevy's version needs GPU features no browser has. A 2024 WebGPU demo runs in Chrome only.

What a browser lacks (from the research notes, read from the browsers' own pages where they could be reached): many
draws in one call, mesh shaders, and the 64-bit counters a fast drawer of pixel-sized triangles needs. Compute passes,
storage buffers and a draw whose count the GPU writes are in Chrome, Safari 26 and Firefox; we use all three already.
So in a browser the aim is an error of one to two pixels with triangles several pixels wide, not a triangle a pixel.

### What is not known

- **Whether Apple's GPUs draw many small clusters fast enough**, in Safari and on an iPhone. Nobody has published it,
  and nothing was drawn here. It is the one number that decides how low the error can go.
- What the vertex stage costs. A cluster's corners are looked up one by one, so a vertex is worked out four and a
  half times (83 vertices a cluster, 384 corners); the ladder's balls share a list and work each out once. By count, at
  two pixels of error, the boulder then costs three times today's vertex work at 400 px, about as much at 200 px and
  when it is larger than the screen, and half at 500 px. `src/detail/README.md` found this stage to be what a small
  thing costs.
- How long a build takes on a phone (here: 0.4 million triangles a second on one cloud core).
- How shading behaves across the steps: only shape was measured, not normals, textures or wind.
- **Whether the stick agrees with the eye.** It is a reckoning of cover and outline in a script, not the game's
  picture: no painting, no light, no wind, no motion. Samuel's eye has not been set against it.
- What the stick costs while an asset is built (the script draws pictures in software, seconds for a tree), and
  whether a cheaper reckoning chooses the same ways.
- How late a kind's groups arrive on a quick zoom, and how the growing-in then looks.
- Whether our drawer's draws count as "with vertex buffers" in WebKit (the slow path above).
- Bones: nothing was tried on a skeleton.
- Still unread: Cook's paper of 2007, Unreal's source, the talks that exist only as video. The first report's
  statements that the second round corrected are listed in the second.

## Define

Taken up with Samuel's second message, sharpened by his third (the quality must be higher; the method fully generic,
for any kind of future asset) and his fourth (no jump from close-up to 12 km, walking or zooming; the stress world's
performance a hard gate, its movers and its millions included). **Approved by Samuel on 2026-11-16: "Approved, go
implement the solution."**

**What done looks like**

1. **Any asset, nothing told.** An asset hands over its triangles at full detail, the material each wears and, where it
   is made of repeated parts, its parts and where each stands. No asset and no kind writes a level, a pixel size or a
   table per level, and the builder is not told what kind of thing it has before it.
2. **Nothing to see, walking or zooming.** From its nearest view to 12 km away a thing keeps its outline, its cover,
   its colour and the size of its leaves. Nothing changes at once, whatever moves it: the walker's steps, the one zoom
   from eye level to 12 km (intent 0003), a part that is built or loaded late, a part put out again, the governor's
   dial. What changes is under a pixel, or comes one small part at a time, or grows out of what was drawn before.
   Nothing swells, shrinks or changes shape or style.
3. **Higher than today.** Measured on one stick, the picture is nearer to the full-detail one than today's: better
   over a whole walk and at its worst size, and at no size worse than today's level there. A stage that does not
   show this is not proposed.
4. **The gates hold, in the stress world too.** The canvas at the screen's own pixels (4K on a 4K screen), 60 frames a
   second, 8 GB, with no cost hidden behind the governor's dial: in the world, and in Magic Wonder (`?stress`) with its
   898 million standing and its nine million moving. Frame time, memory and start are no worse than today's there at
   any stage.

**The shape of it**

- **One builder for every asset.** It finds the asset's pieces by itself (triangles that share no corner with the
  rest), gathers neighbours into groups, and for each group tries every way the engine knows of making it coarser.
  Three to begin with: folding edges (what a surface wants); thinning a crowd of like pieces and enlarging those that
  stay, each wearing its picture as large as it was, more of it and never stretched (leaves; later gravel, grass);
  and a hull, a closed body that covers as much as what it stands for by being see-through or by being smaller (a far
  crown, a far rock). It keeps whichever loses least. "Generic" is this: nothing told and one stick, not one way for
  everything.
- **One stick.** What a way loses is measured alike for all: the group as it is and as it would be, drawn from all
  round at the size on screen it would be used at; how far its outline is off, and how much a small patch differs in
  what it shows. Its light joins the stick with the solids. The same stick measures today's levels: that is how
  "higher than today" is told. No published builder chooses by a difference between pictures: each gives a way its
  error as a length, which cannot tell "moved" from "gone" or "see-through". (Pictures are used that way off line,
  one asset at a time.)
- **One rule to draw.** A group is drawn where its own error is under N pixels on screen and its stand-in's is not. N,
  in the pixels that are drawn, is the governor's first dial, under a ceiling; it moves before the pixel ratio does.
  A thing's triangles then follow its size on screen step by small step, not in a few leaps.
- **One way to change.** Every vertex of a group knows where it lies on the group's coarser stand-in, and every piece
  of a crowd its turn. A change by size is a move along that. A part that comes late grows in along it over time, and
  one that is put out goes back the same way. So nothing can jump, whether the size on screen is changed by steps, by
  the zoom or by the dial, or a part by its arrival. (The published systems have no such thing: they swap, and trust
  an error under a pixel and a picture kept from frame to frame to hide it.)
- **The end.** The last stand-ins keep the cover; then the land's colour takes over.
- **Millions placed, thousands of kinds: the stress world's pattern, kept.** Nothing of where things stand is kept.
  A far thing takes its stand-in from its distance alone, one test a thing as today; only the few things that are
  large on screen are looked at group by group. A kind's far stand-in is always held, as its coarse levels are today;
  its groups are built in a worker when the camera comes near, held in pools of a fixed size and put out when the
  camera has gone, as its fine levels are today. Memory then follows the screen: today eight kinds can hold their full
  mesh at once; by groups, each near thing holds what its size on screen asks for.
- **A new kind of asset costs nothing.** A better way of making coarser is engine work, done once: the builder tries
  it beside the others and it is used wherever the stick prefers it.

Built in the recipes' worker with `meshoptimizer` and kept between starts; drawn by our own drawer. It takes over from
intent 0002 what that left to each asset: which levels there are. 0002's one shading for every level, its tiles to
10 km and its folding into the ground stay its own.

**Stages, each its own build and measurement, each held to every gate before it is proposed.** Plants first: they
are what Samuel sees, and nothing in them waits for a number we do not have.

*Stage 1: the stick, the builder, and the plants on them.*

1. The stick in the library, on the game's own picture: any asset's levels against its full detail, as a table by
   size on screen, as a walk and as a zoom that record outline, cover and what changes from frame to frame. Today's
   levels are measured first: the line to beat.
2. The builder in the recipes' worker, first for what stands in a stand. A plant's file draws its plant once; its
   `levels`, its `most`, its tables per level and the kinds' pixel sizes for trees and shrubs go. A plant takes its
   share from its size on screen in the packing pass, one piece at a time.
3. The far end by the same builder: the solid far body and the speck go wherever the stick prefers another stand-in;
   the last one hands over to the land's colour.

*Stage 2: solids.* Before it, the number that decides: first the open library's demo in Samuel's Safari on the Mac
and on the iPhone, then the boulders' groups drawn through our drawer and their GPU time read on both, in the stress
world.

4. Clusters, groups and their errors (the light now in the stick), the tail under one cluster, and for every vertex
   its place on the coarser stand-in (the simplifier's own record of what was folded into what), kept as meshes are.
5. Clusters in the heap, chosen in the packing pass, drawn by the drawer; a far thing by its distance alone; groups
   streamed into the pools and grown in.
6. The rocks and the stress stand's bodies moved; the ladder gone for them.

*Stage 3: made things, and thin loose parts.* 7. The tent and the fire pit from their finest faces alone: corners
welded; ropes, pegs and the like keep their cover as they thin (a fourth way, if the stick asks for one); the face
lists written per level go.

*Stage 4: movers.* 8. What is on bones (creatures; the stress world's nine million): a group's bounds as wide as its
bones can carry it, its vertices' places on the stand-in bound to the same bones. Until it is shown they keep what
they have.

*Stage 5: assets nobody wrote a line for.* 9. Three test assets of kinds the engine has never had, handed over as
triangles and materials only: a fence of thin rails, a heap of gravel, a scaffold of poles, planks and ropes.

*Stage 6: as large as it will be.* 10. An asset of ten million triangles, built in pieces and streamed by groups; and
one made of ten thousand repeated parts, each part built once.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | No pumping | a recorded walk from 3 km up to 3 m on an oak, a pine and a mastic, at the screen's own pixels: outline and cover, each set against the nearest view's, stay within 5 % down to a crown 20 px tall and within 15 % from there to where it sinks. Today: the oak's outline +27 % then −43 % and −71 %, the pine's +34 % then −47 % and −73 %, the mastic's −16 % then −63 % |
| 2 | No jump, walking | the same walks, and one over a boulder field, round the tent and through the stress world's first village: no frame differs from the one before by more than three times its neighbours' median (0002's check 2) |
| 3 | No jump, zooming | intent 0003's scripted scroll, eye level to 12 km and back, in a minute, in ten seconds and as fast as the wheel goes; over an oak, the tent, a boulder field and the stress world's first village; each once more from a cold start, with nothing built yet. The same bound as check 2; and stills caught on the way read no worse on the stick than the same view at rest |
| 4 | No change of shape or style | stills at six distances beside the same thing drawn at full detail with four times the pixels and made small: the stick's reading of them. And Samuel walks and zooms up to a pine, an oak and a bush in his Safari and sees nothing change |
| 5 | Higher than today | the stick on the game's own picture, for every asset a stage moves, at every size from its nearest view to where it sinks: the mean and the worst over the walk both lower than today's, and no reading worse than today's level at that size. Not shown: not proposed |
| 6 | The gates, in the world | the bench's views (`tools/bench.js`, `?gputime`): each stage's GPU time no higher than before it at the same inside ratio. Samuel's Safari: 60 frames a second, the canvas at the screen's own ratio in every row of the log, the governor's dials no lower than before. `window.__memory()` no higher; the start no slower |
| 7 | The gates, in the stress world | `?stress`, walking in its first village and on check 3's zoom, with its 898 million standing and nine million moving: GPU time, packing time, the slowest frames, `window.__memory()` and the start, each no worse than before the stage and under the gates (60 frames a second in Samuel's Safari with the canvas at the screen's own ratio, 8 GB) |
| 8 | A surface is closed and as near as it says | in a test, for every kind built: no edge with one triangle in 100 views (a thing's own rim apart); the drawn triangles no further from the full mesh than the error asked for, measured as the probe measured it |
| 9 | Nothing written, nothing told | `grep` finds no level, pixel size or table per level in `assets/*.js` or `assets/kinds.js` for the makes that have moved, and the builder reads no asset's kind |
| 10 | Any asset | stage 5's three assets pass checks 1 to 5 with no line written for any of them |
| 11 | As large as it will be | the asset of ten million triangles and the one of ten thousand parts stand in the stress stand, are walked and zoomed round and into, and checks 2, 3 and 7 hold |

**Shown so far**, in scripts and not in the game (`one_stick_for_any_asset.md`, and the first round's probes):

- *Check 1, as stills and not as a walk.* At the sizes of today's levels the builder's outline is 91 to 104 % for the
  oak, 94 to 108 % for the pine and 87 to 101 % for the mastic, where today's levels are 42 to 113 %, 51 to 149 % and
  46 to 89 %.
- *Check 5, in part.* At the same triangles the builder reads nearer than today's level in 16 of 21 levels on average
  and in 20 by outline. With today's triangles spread by size it is better over all sizes and at its worst for the
  oak, the pine, the mastic and the boulder. **It is not yet what the check asks**: it reads worse than today's level
  at 2 of 16 sizes for the oak, 1 of 14 for the mastic, 1 of 16 for the boulder and 4 of 14 for the tent, and the
  tent is no better on the whole.
- *Check 8 for the boulder* (first round): no crack in 177 views; one pixel asked, 0.9 to 1.1 found at most, 1.5 in
  the tail under one cluster.
- *What checks 2 and 3 rest on*, moving vertices inside a hierarchy: tried once, on the boulder. The largest jump
  halved, not gone, with places that are not exact.
- *Not tried at all*: a card that grows wearing more of its picture and not the same picture stretched (the script
  draws a card as an even 45 % of cover), so "the size of its leaves" rests on nothing yet.
- Checks 2, 3, 4, 6, 7, 9, 10 and 11: nothing. They need the game's own picture, a GPU, Samuel's Safari and the
  stress world.

**Choices this definition makes** (Samuel may say otherwise)

- "Fully generic" is taken as: nothing told about an asset, one stick, one rule to draw and one way to change, with
  several ways of making coarser inside. Not one way for every stuff: no published system has that, and the author of
  Unreal's warns against trying ("the unification trap").
- Built into our own drawer, not taken as the open library or as three.js's own new meshlet pipeline (in 0.187,
  experimental, a level a whole thing): our solids carry bones, wind, snow, a look per kind and their own packing.
  Both are the references to read.
- `meshoptimizer` (MIT, about 300 KB) comes in as the game's second dependency, in the recipes' worker only.
- "No visible difference" is held to check 4's test: the picture of the thing at its distance against the picture of
  the full thing made small. Nearer than where a part is under a pixel that can be met closely, not exactly, unless
  every part is drawn; how closely is what the stick measures and Samuel's eye decides.
- "Higher than today" is held to the stick and to the gates together: where it cannot be shown at no more GPU time,
  the stage is not done.
- A kind's far stand-in, held always: its recipe's own quick sketch (the same recipe at a coarse setting, as the
  stress stand's kinds give today) where its family has one; otherwise built once on the device and kept. It is the
  one thing an asset may offer beyond its triangles, and it is not a level: nothing is written for it.
- While the builder works, its stick may be a cheaper reckoning than pictures (cover and outline from the triangles
  themselves), held against the picture stick in a test.
- The one way to change needs the simplifier's record of what it folded into what. `meshoptimizer` keeps that
  inside and does not hand it out: stage 2 takes it out by a small change to its source, built by us, or reckons it
  afterwards. The probe's rougher places halved the largest jump and did not remove it.
- Movers come after solids: bones are where Unreal's own version took longest.
- Where the stress world misses a gate before a stage (its last record says: near the ground, 55.8 frames a second),
  the stage must still be no worse there. Reaching the gate is then work of its own, named before the stage is
  proposed, not hidden in it.

**Out of scope**

- What is not made of triangles: smoke, fire, the water's surface, light. See-through things.
- The grass (its own engine): it keeps what it has until the rest is proven, and comes as a stage of its own.
- Materials' own levels, tiles to 10 km and folding into the ground (intent 0002).
- A software drawer of pixel-sized triangles: browsers lack what it needs.
- New assets, beyond the test assets of stages 5 and 6.

## Build

Begun 2026-11-16, after Samuel's approval, with stage 1 (the stick, the builder, and the plants on them). Main was
merged in first: it had gained intents 0034 (the walker's lens, at define) and 0035 (one measure for everything).

### Stage 1: how it is laid into the engine

Decided after the plants' whole path was read against the definition (trees.js, drawer.js, tier.js, the tree kit):

- **Runs of cards, not levels.** A level today is a mesh in the heap, a tier in the packing and a draw a shape. Levels
  made by the builder in halves would have tripled the trees' draws; in quarters they submit twice the cards needed.
  Instead a shape has one mesh with its cards in the builder's order, and a plant is packed as many runs of sixteen
  cards as its size on screen asks for. One draw serves every shape, and what is submitted is what is shown.
- **A part carries when it goes.** Every card keeps the size on screen under which it is gone and the point it is
  enlarged about, in the vertex's free bits: a vertex stays 32 bytes.
- **The wood is not folded in stage 1.** Thin twigs go by their width on screen; thick wood keeps its tessellation
  until stage 2 brings folding. `meshoptimizer` does not come in yet.
- **What stays written, for now**: the close-up splay of a sprig into twig cards near the eye (the kit's, from 600 px,
  as today), and `shade()`, the hand-made body a plant casts its shadow with. The second is a level by another name
  and is on the todo.
- **Order of work**: counters and today's numbers; the measure in the library, today's levels read first; the builder
  as a module; the rule in the library only, held to the measure before the drawer is touched; then the drawer; then
  the switch; then the tables deleted.

How it is checked here: headless Chromium with WebGPU on SwiftShader, a GPU done by the CPU. Pictures and counts are
real; times only compare. GPU time, Safari and the iPhone are Samuel's to read.

### Stage 1: the first look, behind `?lod=new` (2026-11-16, second session)

Samuel: "Can't test anything that isn't deployed, so just advance everything you can yourself." So the plants were put
on the builder in the world and the library behind an address flag, main's look staying the default:

- **`?lod=new`** (and `?card=`, `?kmax=`, `?spread=` to try its numbers). Without it the game is as on main; only the
  plants' recipe versions change (their kit now imports `crowd.js`), so their meshes are made once more at the next start.
- **Levels kept as tiers, each a first share of one build.** The "runs of cards" above needs the drawer changed; to be
  seen sooner, a plant's levels stay what the heap, the packing and the draws know, but each (its finest splay apart) is
  now `levelOf(crowd, lo, hi)`: the cards whose turn comes before `hi`, the solids not gone there, the far bodies and
  the post where they show. Every vertex is moved by one rule in the vertex stage (`crowdRule`, `src/scatter/trees.js`),
  by the plant's own size on screen. Two levels draw the same where they meet, so a plant changes level hard, with no
  hand-over; a CPU check (every plant asset, every shape, 40 sizes in each band) found nothing the rule shows missing
  from its level. The splay of the sprigs near the eye hands over to the first level as before.
- **Packing.** A crowd level carries its shape's sixteen numbers in front of its vertices and, a vertex, go, the tip,
  the tip's place on the painting and which far body it is, in the vertex's free bits: still 32 bytes. Its rooms in
  the heap are reckoned without building it (`budgetOf`) and kept with the plant's outline.
- **Two numbers changed from the probe's.** CARD 24, not 15: at today's level bands 15 submits two to four times
  today's level at a band's top (a 21 m oak at 260 px: 27 030 vertices where today's level has 6 947). KMAX 8, not
  5: with 24 the far body would otherwise take over at 60 to 70 px, where today's comes at 18.
- **The painting enlarged with its card (`?spread=0`).** A card that shows more of its painting as it grows (the
  definition's "the size of its leaves") is, from afar, a painting repeated many times and mipped to a blur that its
  cut-out passes everywhere: the crowns were solid patches (seen at 90 m over the pine forest). Until the cut-out is
  reckoned by how much of a card is leaves, the painting grows with the card, as today's coarser levels draw larger
  sprigs. So the leaves are larger far off, as today.
- **The library**: its plant is the whole build, moved by the same rule as the camera comes and goes
  (`crowdSample`).
- **What it costs, as built** (Chromium here, WebGPU on SwiftShader): the same plants drawn, but their submitted
  vertices 2.6 times main's by the tent (trees 759 811 against 296 505; shrubs 114 110 against 36 724) and 1.9 times at
  the river bend from 26 m (trees 1 081 888 against 575 829). Most of them are folded away by the rule in the vertex
  stage, before their light is reckoned, but they are read. The bench's frame by the tent (`tools/bench.js`, at ratio
  1, 640 x 360, three frames, wall time on SwiftShader, one run each): main 9 505 ms, `?lod=new` 10 294 ms, 8 % more.
  One reading of a software GPU, not a GPU time; the stress world, Safari and the phone were not measured. That is why
  the default stays main's: it is not shown to be no worse.

## Propose

## Story

## Archived

---

## Todo

- [x] Samuel: approve or change the definition (approved 2026-11-16)
- [ ] Samuel: open the open library's live demo in Safari on the Mac and on the iPhone, and say what frame rate it
      shows (a first number, before stage 2)
- [x] Samuel: may the refused pages be allowed for a check of the report's marked statements (he opened 17 hosts,
      2026-11-16; the second report is from them)
- [ ] Before any stage: today's numbers written down as the line to hold (checks 6 and 7): the bench's views and the
      stress world's walk and zoom, GPU time, packing, the slowest frames, memory and start; and Samuel's Safari with
      the canvas at the screen's own ratio. The stress world's numbers in the repository are of 2026-11-13. The second
      report lists nine measurements in order; its first five need nothing of the new method
- [ ] Stage 1: the stick, the builder, and the plants on them
  - [ ] counters, and today's numbers written down (the counters are in: `?draws`, `__plants.submitted()`; numbers
        so far only the plants' submitted vertices at two views, Build)
  - [ ] the measure in the library; today's levels read
  - [x] the builder as a module (`assets/kit/crowd.js`)
  - [x] the rule in the library and in the world, behind `?lod=new` (not yet held to the measure)
  - [ ] Samuel: look at `?lod=new` on next, by the tent, in the pine forest, from 90 m, and in the library
  - [ ] what is submitted brought down to what shows: a crowd level per half of today's bands, or runs of cards in the
        drawer; then the frame times by the tent and in the stress world against main
  - [ ] a card's cut-out reckoned by how much of it is leaves, so a card can show more of its painting (`?spread=1`)
        without turning solid far off
  - [ ] the drawer: runs of cards, the hull's ring
  - [ ] the switch in the world (`?lod=new` the default); the tables and the kinds' pixel sizes deleted
  - [ ] `shade()`, the hand-made body for the shadow, replaced by the builder's
- [ ] Stage 2: solids
- [ ] Stage 3: made things, and thin loose parts
- [ ] Stage 4: movers
- [ ] Stage 5: assets nobody wrote a line for
- [ ] Stage 6: as large as it will be

## Changelog

### 2026-11-16

- **Asked:** to research an algorithm for smooth, automatic levels of detail that takes any asset at full detail, even
  ten million triangles, down to a pixel, in place of each asset's own breakpoints.
- **Delivered:** this intent with the answer; a research report from five threads of web research; two scripts run on
  our own boulder, tent, oak and pine, and on balls of one and ten million triangles, with their outputs; two pictures
  of what they found (the boulder four ways, the oak's crown under each rule).
- **Good:** The method was tried on our own assets, not only read about: the boulder's hierarchy in 0.4 s with no
  crack, ten million triangles in 25 s, the oak's crown kept within 1 % by thinning and enlarging. Found on the way:
  an open library for this method on three.js's WebGPU renderer, five weeks old.
- **Broke / not there yet:** Nothing was drawn: no frame time, no Safari, no iPhone. Most primary pages were refused
  by the session's network rules and the search budget ran out, so parts of the report rest on search extracts and
  are marked. The open library was read, not run (the session's guard declined running it cut off from the network).
  Moving vertices inside the hierarchy halves the largest jump but does not remove it. An earlier figure of mine, that
  the cut matches the ladder at four pixels of error, was wrong when checked and is corrected to two.

### 2026-11-16 (2)

- **Asked:** that it also raise the picture's quality with the gates of 60 fps and 4K kept; and that nothing be seen
  as detail changes: the present system "visually transforms, changes shapes and style, pumps, especially shrubs and
  tree crowns. This should be 100 % smooth with no visible difference."
- **Delivered:** today's levels of an oak, a pine and two shrubs measured and drawn side by side; the boulder counted
  for a screen of two pixels to each of the game's; both requirements written in; the definition with its stages and
  checks, plants first; the research report of the first round.
- **Good:** What Samuel sees is in the numbers: a crown's outline at 109 to 134 % over its middle levels, then 53 to
  57 % and 27 to 29 %; a mastic at 75 % of its cover after its first change; leaves that grow with each level. On a 4K
  screen the cut holds the boulder's worst error to a quarter of the ladder's with as many triangles.
- **Broke / not there yet:** Nothing of the definition is shown in the game's own picture or on a GPU. The thinning
  rule meets check 1 for the oak in a model, not yet for the pine. Whether the picture gets better within the gates is
  not known until stage 1 is built and measured.

### 2026-11-16 (3)

- **Asked:** that the quality of the new method be higher, and that it be fully generic, for any kind of future
  asset; and to be asked for the hosts the research needs.
- **Delivered:** the hosts asked for, and 17 opened by Samuel. A second round of research from the originals, in five
  threads, with its notes and its report (`reports/Generic automatic detail of higher quality.md`: no published
  method meets any of the four demands as stated; six parts such a method must have; nine things to measure, in
  order). A script that is one builder told nothing and one stick, run on the
  boulder, the tent, the oak, the pine and the mastic, with today's levels read on the same stick; its note, its
  outputs and two pictures. The definition written anew: one builder, one stick, "higher than today" a check that
  must pass.
- **Good:** At the same triangles the builder reads nearer to the full thing than today's level in 16 of 21 levels on
  average and in 20 by outline. With today's triangles spread by size, a patch is off by less over all sizes for
  every plant and the boulder. The far ends keep their size: the oak's 91 and 92 % where today's far body and speck
  are 66 and 42 %. The originals confirmed the first round's main lines and corrected several of its figures. Found:
  no published builder chooses by a difference between pictures; three.js ships its own cluster drawer since 0.187.
- **Broke / not there yet:** "Higher than today" is not shown as its check asks: the builder reads worse than today's
  level at a few sizes (oak 2 of 16, mastic 1 of 14, boulder 1 of 16, tent 4 of 14), and the tent's hand-made first
  level keeps its ropes better. The stick was wrong three times in ways only its pictures showed (the wood made
  thicker, things of a few pixels misjudged, the pine's far crown a block); each is corrected. A line of mine to
  Samuel on the way, "nearer in 15 of 21 cases", came from a run before those corrections; the count is 16 of 21.
  Cook's paper of 2007 could not be reached. Nothing was drawn by the game or on a GPU.

### 2026-11-16 (4)

- **Asked:** no visual jump while walking or zooming, from close-up to 12 km; and the stress world's performance
  kept, with 60 fps, 8 GB and 4K as hard gates for the method, its movers and its millions placed included.
- **Delivered:** the zoom and the stress world read in the code and written into the idea, with what they ask of the
  method. The definition extended: nothing changes at once whatever moves it (steps, the zoom, a part that comes
  late, the dial); one way to change (every vertex knows its place on the coarser stand-in); the stress world's
  pattern kept (a far stand-in always held, groups built while near, pools of a fixed size); movers a stage of their
  own; a check for the zoom and one for the stress world's gates.
- **Good:** The engine's own rule, "nothing of it changes at once", is what the published systems lack: they swap,
  and name what arrives late as their visible loss. Read in the stress world's code: eight kinds can hold their full
  mesh at once today; by groups a near thing would hold only what its size on screen asks for.
- **Broke / not there yet:** None of it is shown. No walk, no zoom and no frame of the stress world was drawn for
  this. The stress world's own last record (2026-11-13) says it did not hold 60 frames a second near the ground in
  Samuel's Safari; what it holds today is not known here. Moving vertices inside a hierarchy is half-proven by one probe on one boulder. Nothing was tried on bones.
  How fast the wheel can move the height, the quickest zoom a check must hold, was not measured.

### 2026-11-16 (5)

- **Asked:** (Samuel) "Can't test anything that isn't deployed, so just advance everything you can yourself": stage 1
  brought to where it can be seen on next, behind a flag, main merged in first, with `bun tools/scale.js` passing.
- **Delivered:** main merged (the lens, every asset's measure, the person's shadows, the skeleton). The plants on the
  builder behind `?lod=new`, in the world and in the library: each level a first share of one build of the plant, one
  rule in the vertex stage moving every vertex by its size on screen, the levels changing hard where they draw the
  same. The default stays main's.
- **Good:** It draws, with no error in the console, by the tent, in the pine forest and from 90 m over it, and the holm
  oak in the library. A check on the CPU over every plant asset, every shape and 40 sizes in each band found nothing the
  rule shows missing from its level. The same plants are drawn as on main. `bun tools/scale.js`: 16 of 16. The game and
  the OS build.
- **Broke / not there yet:** At first the far crowns were solid patches: a card showing more of its painting is, far
  off, a mipped blur its cut-out passes everywhere; the painting now grows with the card (`?spread=0`), so the leaves
  grow far off as today. The plants submit 1.9 to 2.6 times main's vertices (most folded away before their light is
  reckoned), and the bench's frame by the tent took 8 % longer on the software GPU here. Nothing was measured on the stick, in the stress world, in Safari or on a
  phone; the library's oak at 200 px reads lighter and flatter than main's full level. Container here: headless
  Chromium's own shell lost its device on the first frame shown; full Chromium with Vulkan on SwiftShader draws, at
  about 40 s a still. One timing run was cut off by the container's restart.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `a76da9d` | the intent opened with the answer; the research notes; the probes on our boulder, tent, oak and pine, their outputs and two pictures |
| 2026-11-16 | `4439949` | today's levels of an oak, a pine and two shrubs measured and pictured; the boulder on a 4K screen; the definition, plants first |
| 2026-11-16 | `db23cde` | the research report of the first round |
| 2026-11-16 | `8c8bbb2` | Samuel's third message in the idea; four notes of the second research round, read from the originals |
| 2026-11-16 | `5544fd6` | the third and fourth messages worked in: one builder told nothing and one stick, tried on five assets, with its note, outputs and pictures; the zoom and the stress world as they are; the definition anew, six stages and eleven checks; what the originals say |
| 2026-11-16 | `d0817c7` | the second research report; the intent held to its cautions; the stress world's own last record written as it stands |
| 2026-11-16 | `67e57e2` | main merged in before the build: intents 0034 and 0035 |
| 2026-11-16 | `a20dc53` | approved by Samuel; the build begins |
| 2026-11-16 | `e59e357` | how stage 1 is laid into the engine (Build) |
| 2026-11-16 | `fb400c2` | work in progress: the counters (`?draws`, `__plants.submitted()`) and the builder as a module |
| 2026-11-16 | `76c5623` | work in progress: the builder further along |
| 2026-11-16 | `8df36a7` | main merged in: the lens, every asset's measure, the person's shadows, the skeleton |
| 2026-11-16 | `788c07c` | the plants on the crowd kit behind `?lod=new`: levels as first shares of one build, the rule in the vertex stage, rooms, the library's plant |
| 2026-11-16 | `4a880b9` | the library's crowd plant in seven vertex buffers |
