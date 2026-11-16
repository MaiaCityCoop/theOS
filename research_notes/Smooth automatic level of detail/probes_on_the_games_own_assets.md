# Probes on the game's own assets (measured, 2026-11-16)

Not web research: two scripts written for this research and run in this session, on TheGame's own recipes, with the
open-source `meshoptimizer` package (npm 1.3.0, MIT) through its WebAssembly, the way a browser worker would call it.
The scripts and their full outputs are beside this note: `probes/dag.mjs`, `probes/crown.mjs`, `probes/out/*.txt`.
Nothing in `TheGame/` was changed; the package was installed in a scratch folder, not added to the game.

## Takeaway

1. **A cluster hierarchy can be built for the game's own meshes in a worker, fast.** A boulder's full mesh (110,592
   triangles) in about 0.4 s on one thread, less than the recipe needs to make the mesh. One million triangles in
   2.6 s, **ten million in 25 s**.
2. **The selection rule gives a closed surface from everywhere.** No open edge in 177 test views of the boulder, of a
   million-triangle ball, or of the tent (an open surface).
3. **Triangles follow the screen, not the asset.** The ten-million-triangle ball at 400 px across is drawn with 55,574
   triangles at an error of one pixel, 9,638 at four pixels.
4. **Against today's ladder on the same boulder.** Cut at an error of two pixels: about the same mean error and a
   smaller worst error, with **2 to 7 times fewer triangles**. Cut at one pixel: a quarter to two thirds of the mean
   error, the worst about one pixel (the ladder's: 2 to 4.4), with about the same triangles at 400 px and a little
   over half below. At four pixels the triangles fall to a fourth to a fifteenth, but the mean error is then up to
   2.5 times the ladder's.
5. **The same simplifier destroys a tree's crown.** At a tenth of its triangles an oak's crown covers a third (from the
   side) to a quarter (from above) of what it did. **Thinning the sprigs at random and enlarging the ones that stay
   keeps the cover within 1 %** down to 4 % of the sprigs (2 % at 1 %), if each sprig is enlarged about its tip.
6. **Thin and loose parts are the weak spot of the surface method.** The tent's ropes and pegs go in one step, at an
   error about their own thickness. Measuring error by distance instead stalls the whole tent at 688 triangles.

7. **The engine's own way of hiding a change, moving vertices, can be carried into the hierarchy without cracks.** On a
   walk up to the boulder it cut the largest jump by 46 % at two pixels of error and 63 % at four, not to nothing: an
   exact target needs the simplifier's record of what was folded into what, which the open simplifier does not give.

## What was run

| Script | What it does |
| --- | --- |
| `probes/dag.mjs` | Builds the hierarchy (clusters of at most 128 triangles; groups of about 8 clusters; each group simplified to half with the vertices it shares with other groups locked; cut into clusters again; repeat; then the one cluster left halved again and again down to a few triangles). Times it. Evaluates the rule "draw a cluster when its own group's error projects to at most τ pixels and its parent group's does not" from many cameras, counts triangles, checks every edge has two triangles, and measures how far the drawn triangles really lie from the full mesh |
| `probes/crown.mjs` | Takes a tree's nearest level as its file draws it. Runs the simplifier on it; then thins its sprigs in a fixed random order with and without enlarging the rest; measures how much of the picture the crown covers from the side and from above |

Machine: this session's cloud container (4 cores, Node 22.23), **one thread**, not a browser and not Apple silicon.
Screen for the pixel figures: 1440 × 779, the walker's 68° lens (the screen the engine's own README measured on).

## Results: the hierarchy

### Build

| Mesh | Triangles | Build, one thread | Triangles a second | Clusters | Levels | Triangles in all levels | Making the mesh itself |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Boulder, shape 0 (`assets/boulder.js`, its full mesh) | 110,592 | 0.42 s | 267,000 | 1,814 | 15 | 221,042 (2.0 ×) | 0.24 to 0.51 s |
| Displaced ball, 289 squares an edge | 1,002,252 | 2.56 s | 391,000 | 16,593 | 18 | 2,002,908 (2.0 ×) | 0.64 s |
| Displaced ball, 913 squares an edge | 10,002,828 | 25.0 s | 400,000 | 164,693 | 21 | 19,993,458 (2.0 ×) | 5.4 s |
| Bell tent, its finest faces welded | 1,392 | 0.02 s | | 32 | 9 | 2,768 | |

Of the ten-million build: 8.3 s base clusters, 6.5 s cutting simplified groups into clusters, 6.0 s simplifying, 4.0 s
grouping (in JavaScript). No group failed to simplify on any of the closed meshes ("stuck groups: 0" at every level).

Memory, counted: each cluster keeps its own vertices (one on a border is kept by each cluster that uses it): 83
vertices a cluster, 2.7 times the mesh's vertices in all. At the solids' 16 bytes a vertex and one byte a corner inside
a cluster: **3.08 MB for the boulder's whole hierarchy; the full mesh alone, as the heap keeps it today, is 2.21 MB**.
Ten million triangles: 278 MB against 200 MB.

### Is the surface closed?

| Mesh | Cuts tested | Edges with one triangle (cracks) | Edges with more than two (two sheets the simplifier let touch) |
| --- | --- | --- | --- |
| Boulder | 51 + 126 | **0** | 7 + 24 |
| Ball, one million | 51 + 126 | **0** | 276 + 647 |
| Tent (open: an edge that is the surface's own rim at that cluster's level is not a crack) | 51 + 126 | **0** | 0 |

Every parent's error and sphere held its children's (0 unsound of all clusters, each mesh).

### Triangles drawn, by size on screen (boulder; ladder = today)

| Size on screen | Ladder today | Cut at 1 px | Cut at 2 px | Cut at 4 px |
| --- | --- | --- | --- | --- |
| 4000 px (far larger than the screen) | 110,592 | 55,400 (20,258 in view) | 42,470 (16,230) | 32,782 (13,172) |
| 2000 px | 110,592 | 54,306 (23,678) | 39,424 (17,692) | 29,802 (13,868) |
| 800 px | 110,592 | 32,208 (23,976) | 19,608 (15,309) | 13,792 (11,637) |
| 500 px | 110,592 | 17,000 | 9,614 | 6,104 |
| 400 px | 12,288 | 13,210 | 6,340 | 3,436 |
| 300 px | 12,288 | 8,034 | 3,436 | 1,716 |
| 200 px | 12,288 | 3,436 | 1,716 | 428 |
| 128 px | 3,072 | 1,716 | 428 | 214 |
| 64 px | 768 | 428 | 106 | 52 |
| 32 px | 192 | 106 | 52 | 26 |
| 16 px | 48 | 26 | 26 | 6 |
| 8 px | 12 | 26 | 6 | 6 |
| 4 px | 1 (the dot) | 6 | 6 | 6 |

"In view": clusters whose sphere touches the view's frustum; nothing is taken off for what faces away or is hidden.
The ladder draws one level for the whole boulder; the cut draws finer where the camera is near and coarser behind.
Under one cluster (106 triangles) the probe halves the last cluster with nothing locked: 52, 26, 12, 6 triangles.

### How far from the full mesh, really

From every vertex of the full mesh to the nearest triangle drawn, in pixels (root mean square / the most), at the
sizes where each of the ladder's levels takes over (its largest on screen, so its worst):

| At | Ladder's level | Cut at 1 px | Cut at 2 px | Cut at 4 px |
| --- | --- | --- | --- | --- |
| 400 px | 12,288 triangles: 0.56 / 4.41 | 13,210: 0.14 / 1.10 | 6,340: 0.24 / 1.49 | 3,436: 0.35 / 1.82 |
| 128 px | 3,072: 0.45 / 2.86 | 1,716: 0.19 / 1.02 | 428: 0.44 / 2.11 | 214: 0.77 / 2.77 |
| 64 px | 768: 0.45 / 2.55 | 428: 0.22 / 1.05 | 106: 0.56 / 1.71 | 52: 0.94 / 3.01 |
| 32 px | 192: 0.42 / 1.95 | 106: 0.28 / 0.86 | 52: 0.47 / 1.51 | 26: 1.06 / 3.08 |
| 16 px | 48: 0.53 / 2.34 | 26: 0.53 / 1.54 | 26: 0.53 / 1.54 | 6: 2.57 / 6.14 |

So on this boulder the simplifier's own error number can be trusted: asked for one pixel, the most any vertex is off is
0.86 to 1.10 px (16 px: 1.54, in the tail).

The ladder as it is, from its own packed vertices: how far a level's vertices move to reach the next coarser mesh, in
pixels at the change: 5.5 px at most (0.7 rms) from the full mesh to the 32-square ball, 2.1 to 2.9 px at most (0.5 to
0.9 rms) at the others. The morph spreads that over the level's range. Its steps in triangles: 9 times at the first
change, 4 times at each of the others; the hierarchy's steps are one group at a time (about 500 triangles to 250).

### The ten-million-triangle ball

| Size on screen | Cut at 1 px | Cut at 2 px | Cut at 4 px |
| --- | --- | --- | --- |
| 2000 px | 704,156 (171,755 in view) | 527,550 (136,525) | 446,924 (117,037) |
| 1200 px | 436,040 (362,530) | 330,118 (275,872) | 280,722 (234,235) |
| 800 px | 232,454 | 143,866 | 99,204 |
| 400 px | 55,574 | 22,656 | 9,638 |
| 200 px | 10,060 | 4,360 | 1,200 |
| 64 px | 600 | 300 | 74 |
| 16 px | 74 | 18 | 8 |

## Results: the tent (a thing of flat faces, open, with loose parts)

- 1,396 faces, each corner a vertex of its own; welded by position to 1,066 vertices and 1,392 triangles. Welding is
  needed first: the simplifier can do nothing with corners that are not shared.
- The canvas simplifies well: 1,376 to 688 triangles at an error of 0.0007 of its size (measured: 0.0011).
- **The eight guy ropes (each one flat strip of two triangles, 2.4 cm wide and about 2 m long) and the eight pegs go in
  single steps.** The simplifier reports an error of about 0.005 of the tent's size for it (0.8 px when the tent is
  170 px across), which is about the rope's own width on screen (0.6 px at 214 px across). Measured by distance, the
  ropes' ends are then 37 px from anything drawn.
- With the group's error taken as that measured distance, the opposite failure: the error jumps to 0.22 of its size at
  the second level, and **the whole tent stays at 688 triangles from 400 px down to 8 px** (at one pixel of error),
  because the ropes share their group with the canvas.
- Hand-made levels today (after welding): 1,392, 296, 174, 18 triangles; the cut at 1 px: 688 (to 200 px), 344 (to
  64 px), 168, 42, 20, 5.

## Results: a tree's crown

Holm oak, shape 7, its nearest level as its file draws it: 21,444 triangles (8,244 wood; 13,200 leaf, in 3,300 sprigs
of two crossed cards). "Cover": the share of the picture the crown covers, seen from the side and from above, a card
taken as 45 % sprig and the rest cut out, so n cards over a pixel cover 1 − 0.55ⁿ of it. "Outline": the share of the
picture any card touches. Both as a share of the full crown's.

| What is done to it | Leaf triangles | Leaf area | Cover, side | Cover, above | Outline, side / above |
| --- | --- | --- | --- | --- | --- |
| As drawn | 13,200 | 100 % | 100 % | 100 % | 100 % / 100 % |
| Simplifier to a quarter | 5,150 | 49 % | 87 % | 79 % | 97 % / 94 % |
| Simplifier to a tenth (reached 6 %) | 832 | 9 % | **34 %** | **25 %** | 64 % / 47 % |
| Simplifier by a grid ("sloppy") to a tenth (reached 4 %) | 800 | 38 % | 64 % | 67 % | 68 % / 79 % |
| A tenth of the sprigs at random, left their size | 1,320 | 10 % | 37 % | 28 % | 67 % / 53 % |
| A tenth, each enlarged 3.16 × about its foot (the area kept) | 1,320 | 100 % | 137 % | 127 % | 140 % / 134 % |
| Half, each enlarged about its **tip** until the cover is the full crown's: 1.44 × | 6,600 | 104 % | 99 % | 101 % | 100 % / 101 % |
| A quarter, the same: 1.98 × | 3,300 | 98 % | 99 % | 101 % | 100 % / 102 % |
| A tenth, the same: 2.92 × | 1,320 | 86 % | 99 % | 101 % | 102 % / 103 % |
| 4 %, the same: 4.52 × | 528 | 82 % | 99 % | 101 % | 106 % / 105 % |
| 1 %, the same: 8.16 × | 132 | 69 % | 102 % | 98 % | 122 % / 116 % |
| Its hand-made levels today: level 1, 2, 3 | 3,168; 768; 216 | | 108 %, 110 %, 113 % | 112 %, 110 %, 85 % | 109 to 127 % / 103 to 114 % |
| The kit's far body (one solid of 24 leaf triangles), then its speck (8) | | | 63 %, 32 % | 83 %, 63 % | 57 %, 29 % / 70 %, 54 % |

- The enlargement found for the tip (1.44, 1.98, 2.92, 4.52) is close to what keeping the area asks (1.41, 2.00, 3.16,
  5.00): **enlarged back into the crown, keeping the area keeps the cover.** Enlarged about the foot the same factor
  makes the crown a third larger: the sprigs grow out of it.
- The simplifier also ate the wood first: of 8,244 wood triangles 194 were left at half the tree's triangles.
- The stone pine (shape 4: 11,246 triangles, 1,782 sprigs) behaves the same but less cleanly, with fewer and larger
  sprigs: the simplifier at a tenth leaves 52 % / 28 % of the cover; thinned to a tenth and enlarged about the tip
  (2.38 ×): 113 % / 87 %, outline 118 % / 101 %.
- Today's far body (the crown as one solid) covers 58 to 83 % of what the crown covers, its speck 29 to 63 % (both
  trees, both views): the end of the chain does not keep the cover today.

## Results: moving vertices inside the hierarchy (the engine's own way between two levels)

Today a solid's vertex moves to its place on the next coarser mesh before the level changes, so nothing jumps
(`src/scatter/drawer.js`). The published cluster systems do not do this: they change a cluster at once and rely on the
error being under a pixel. The probe tried carrying the engine's way into the hierarchy (`MORPH=1 GROW=1.25 FLIGHT=1`,
output `probes/out/boulder-moving.txt`):

- Every vertex a group loses keeps **the nearest point of the surface the group is simplified to**. A cluster is drawn
  part way there: not at all while its parent group's error is 1.25 τ or more, all the way when it has come down to τ,
  where the parent's clusters take over.
- For a cluster to have finished before its parent's clusters begin to move, a group's error is forced to be at least
  1.25 times its children's. Cost: 14,618 triangles instead of 13,210 at 400 px and one pixel (11 % more).

A walk up to the boulder, 412 steps from 20 px to 1200 px across, a hundredth larger each step. At each step, how far
every 16th vertex of the full mesh lies from what is drawn; between two steps, the most that distance changed:

| Error τ | Vertices moved | Largest change in one step | A step's largest change: mean / 95th of a hundred | Steps with a change over half a pixel |
| --- | --- | --- | --- | --- |
| 1 px | no | 1.09 px | 0.108 / 0.761 px | 52 of 411 |
| 1 px | yes | 0.93 px | 0.100 / 0.499 px | 20 |
| 2 px | no | 2.72 px | 0.129 / 1.106 px | 48 |
| 2 px | yes | **1.47 px** | 0.146 / 0.752 px | 32 |
| 4 px | no | 6.75 px | 0.190 / 1.536 px | 44 |
| 4 px | yes | **2.51 px** | 0.243 / 1.058 px | 40 |

- **No cracks while moving**: where two clusters draw the same vertex they put it in the same place (the largest
  difference in all cuts: 3 × 10⁻⁸ of the boulder's size, rounding). Borders between groups are locked and do not move;
  inside a group every cluster moves by the same amount.
- **The largest jump falls by 15 % at one pixel, 46 % at two, 63 % at four. It does not fall to nothing.** A group moved
  all the way still lies off the simplified surface by 0.11 of the group's error on average and 1.9 times at worst: a
  fine triangle whose corners land on two coarse triangles cuts the corner between them.
- Tried and worse: sending each lost vertex to the nearest **kept vertex** along the mesh (`TO=vertex`). The largest
  jumps grew (2.6, 4.5, 7.2 px at 3 % steps).
- An exact target would be the simplifier's own record of which vertex was folded into which. `meshoptimizer` returns
  only the new triangles, not that record.

## What this shows, and what it does not

**Shows**

- For closed solids the method needs nothing from the asset but its full mesh, and beats the ladder on triangles for
  the same error, on this boulder.
- The JavaScript package is enough to build it: the grouping step it does not expose took a few dozen lines.
- For a crown of cards, thinning in a fixed random order with the enlargement found by measuring cover is automatic
  and has no levels at all: one sprig comes or goes at a time.

**Does not show**

- **Nothing was drawn.** No frame time, no GPU, no browser, no Safari, no iPhone. Whether a phone's GPU draws the
  cut's many small clusters fast enough is not answered here.
- One boulder shape, one oak, one pine, one tent. Shape error only: no normals, no shading, no texture seams, no wind.
- The grouping is a simple greedy one written for the probe, not the graph partitioner the published systems use.
- A group's error is the larger of the simplifier's and its children's, not their sum: across many levels the true
  error may be a little over the number (seen: up to 1.10 px for 1 px asked, 1.54 px in the tail).
- "Cover" is a model with an assumed 45 % of a card filled, from two directions; it is not a rendered picture.
- Build times are from a cloud machine's one core under Node; a phone will be slower, several workers faster.

## Two pictures

- `probes/out/boulder-four-ways.jpg`: the boulder at 400 px and at 128 px across, each pixel true: its full mesh, the
  ladder's level at that size, the cut at one and at two pixels of error; and its middle three times larger with the
  triangles drawn in, every cluster its own colour. Seen in it: the ladder's level of 12,288 triangles is visibly
  smoother than the full mesh (its coarser grid cannot carry the fine lumps, and drops them by design); the cut of
  13,210 keeps them.
- `probes/out/oak-crown-under-each-rule.jpg`: the oak's crown from the side as drawn, after the simplifier, thinned,
  and thinned and enlarged, with each one's cover.

Both show shape only: one colour, one light, no texture, none of the game's shading (the game's coarse levels also
wear relief in their textures, which these pictures leave out). Drawn by plain WebGL pages for this research
(`probes/pictures/boulder.html`, `oak.html`), not by the game.

## How to run them again

    mkdir /tmp/meshopt && cd /tmp/meshopt && npm init -y && npm install meshoptimizer
    node probes/dag.mjs /tmp/meshopt/node_modules/meshoptimizer <repo>/TheGame boulder
    node probes/dag.mjs /tmp/meshopt/node_modules/meshoptimizer <repo>/TheGame tent
    TILE=16384 node --max-old-space-size=12000 probes/dag.mjs /tmp/meshopt/node_modules/meshoptimizer <repo>/TheGame ball:913
    node probes/crown.mjs /tmp/meshopt/node_modules/meshoptimizer <repo>/TheGame holmoak 9
    NOTRUTH=1 MORPH=1 GROW=1.25 FLIGHT=1 node probes/dag.mjs /tmp/meshopt/node_modules/meshoptimizer <repo>/TheGame boulder

The pictures: `EXPORT=<folder>/boulder.json` on the boulder's line and `EXPORT=<folder>/oak.json` on the oak's write
what is drawn; put `probes/pictures/*` beside them with a link named `three` to `TheGame/node_modules/three/build`,
and `node shoot.cjs` there saves both (it needs Playwright's Chromium).
