# One stick for any asset (measured, 2026-11-16)

Not web research: a script written for this research and run in this session on TheGame's own recipes, with the
open-source `meshoptimizer` package (npm 1.3.0, MIT) through its WebAssembly. The script, its full outputs, the page
that draws the pictures and the script that makes the tables below are beside this note: `probes/generic.mjs`,
`probes/out/*.txt`, `probes/pictures/`, `probes/tables.py`. Nothing in `TheGame/` was changed.

It answers Samuel's third message on the game's own assets: "the quality of the new algorithm must be higher. And the
algorithm needs to be fully generic, scalable for any kind of future assets."

## Takeaway

1. **One builder, told nothing about what it has before it, chose a sensible way for every asset by measuring.** Given
   only triangles and which stuff each is of, it folded the boulder's surface; in the oak and the pine it folded the
   wood and thinned the leaves, enlarging those that stayed; for the far crowns and the last few triangles of the
   boulder it took a hull; for the tent's ropes and pegs it thinned and thickened them at middle sizes. Nobody said
   "this is a tree".
2. **What chose was one stick for all of them: a difference between pictures.** The full thing and the coarser one
   are drawn from thirteen sides at the size on screen the coarser one would be used at, and compared patch by patch:
   how far the outline is off, and how much a patch differs in what it shows of each stuff. Today's hand-written
   levels are read on the same stick.
3. **At the same triangles as each of today's 21 levels, the builder's result reads nearer to the full thing in most
   rows**: its outline in 20 of 21, a patch on average in 16 (equal in 3, further in 2), a patch at its worst in 14
   (equal in 3, further in 4). The outline of the oak stays at 91 to 104 % where today's goes from 106 to 113 % and
   then to 66 and 42 %; the pine's at 94 to 108 % against 113 to 149 % and then 72 and 51 %.
4. **With today's triangles in all, spread so that they follow the size on screen, a patch is off by less on the
   whole for every plant and the boulder** (oak 25 to 19 %, pine 21 to 12 %, mastic 12 to 7 %, boulder 5 to 4 %; the
   tent 2 and 2 %), and the outline's largest error falls from 53 to 56 % to 10 to 23 % for the plants.
5. **It is not higher everywhere, so "higher than today" is not shown yet.** The tent's hand-made first level keeps
   its ropes better than anything the builder has (outline 99 % against 92 %). Spread by size, the builder reads
   worse than today's level at 2 of 16 sizes for the oak (36 and 49 px, where sprigs enlarged five and six times lose
   to today's level 2), 1 of 14 for the mastic, 1 of 16 for the boulder, 4 of 14 for the tent, none for the pine.
6. **No way is "nothing to see" at these triangle counts.** A crown thinned to between a twentieth and a fifth of its
   triangles differs from the full crown in a patch by 14 to 24 %, as today's levels do (20 to 24 %): fewer and larger sprigs are a change of grain
   whoever makes them. What the builder removes is the pumping (the outline and the cover), not the grain.
7. **Three of the stick's own flaws were found by looking at its pictures, not at its numbers.** A stick that sees
   only cover made the wood thicker; a patch of four pixels misjudged things of a few pixels; a hull with rings at
   fixed heights turned the pine's umbrella into a block. Each is repaired in the script. It says how much such a
   stick must be watched before it is trusted to choose.

## What was run

`probes/generic.mjs`, on one thread of this session's cloud container (4 cores, Node 22), not in a browser and not on
a GPU. **Nothing was drawn by the game**: the pictures are reckoned in the script.

**The assets**, each as its file draws it at full detail: the boulder (`assets/boulder.js`, shape 0: 110,592
triangles, one piece), the bell tent (`assets/belltent.js`, its finest faces welded: 1,392 triangles in 33 pieces),
the holm oak (`assets/holmoak.js`: 21,444 triangles in 6,981 pieces), the stone pine (`assets/stonepine.js`: 11,550
in 3,849) and the mastic (`assets/mastic.js`: 744 in 342). Today's levels of each are taken from the same files and
the kinds' pixel sizes (`assets/kinds.js`, `assets/kit/ladder.js`).

**What the builder is given**: positions, triangles, and for each triangle how much of the light it stops (all of
it: wood, stone, canvas; or a card's 45 %: leaves). Not the asset's kind, not its parts, not its levels.

**What it finds by itself**: a *piece* is a set of triangles that share no corner with the rest (a card, a twig, a
peg, the trunk). A *crowd* is sixteen or more pieces of one stuff, each under a fiftieth of the thing's triangles.

**The stick.** For each of thirteen directions (the axes, the face diagonals, the body diagonals) two pictures of
512 pixels a side with four samples a pixel: how much of each pixel shows cut-out stuff and how much solid stuff,
nearer triangles laid over farther ones by as much light as they stop. Both things' pictures are made as small as the
size on screen asked for and compared patch by patch. A patch is four pixels a side (where in it a leaf sits the eye
does not tell); of a thing under 32 pixels it is an eighth of the thing, never under a pixel. Three readings come out:

- *outline*: how many patches the coarser thing touches, of the full thing's;
- *a neighbourhood off*: how much a patch differs in what it shows of each stuff, on average over the patches either
  touches (green where brown was counts as much as nothing where something was);
- *worst*: the same at the 99th patch of a hundred.

Between two ways the builder takes the lower of: how far the outline is off, plus the average, plus a quarter of the
worst. That sum is my choice; nothing calibrated it.

**The ways it has.**

- *Folding edges*: `meshoptimizer`'s simplifier to a count of triangles.
- *Thinning a crowd and enlarging those that stay*: the crowd's pieces are sorted by size into classes; within a
  class the order is fixed once and spread evenly (each next piece the one farthest from all taken so far). Either
  the smallest class is thinned first, or every class alike. Those that stay grow about their outermost point by one
  measure for the crowd, found so that the crowd by itself covers what it covered.
- *A hull*: a closed body of 8, 20 or 36 triangles round the largest crowd or round all of the thing, as far out
  each way as nearly all its pieces reach, reckoned in the pieces' own proportions (a flat crowd gets a flat hull).
  Either see-through by as much as keeps the thing's cover, or solid and a little larger or smaller.

Each crowd is tried folded, thinned the smallest first and thinned alike, with the rest of the thing left full, on
pictures of the whole thing (what stands before a crowd hides it). For small counts the hull is tried too.

**Three questions**, each printed by the script:

1. Folding all of it against crowd by crowd, at 50, 25, 10 and 4 % of the triangles (`probes/out/one-stick-*.txt`).
2. Each of today's levels at the size it is first drawn at, against the builder's best with no more triangles.
3. `BUDGET=1`: today's triangles in all, spread so that they follow the size on screen, against today's levels at
   every size (`probes/out/spread-*.txt`). Things of a kind are taken as standing evenly over the ground, so there are
   as many again at every doubling of the distance squared. Today a level's triangles are the same over its whole
   band; spread, a thing has all its triangles down to some size and from there as many as the square of its size,
   never under eight, with the sum the same as today's.

## Results

### At the same triangles as each of today's levels

Each reading is "outline, a neighbourhood off on average, at its worst". Nearer to 100 %, 0 % and 0 % is nearer to
the full thing.

| Asset | Today's level, from | Triangles | Today: outline, a neighbourhood off, worst | The builder's way | Triangles | The builder: outline, off, worst |
| --- | --- | --- | --- | --- | --- | --- |
| Boulder | ladder 32, 400 px | 12,288 | 99 %, 1 %, 23 % | folding it all | 12,288 | 100 %, 0 %, 3 % |
|  | ladder 16, 128 px | 3,072 | 98 %, 2 %, 28 % | folding it all | 3,072 | 100 %, 0 %, 4 % |
|  | ladder 8, 64 px | 768 | 96 %, 4 %, 31 % | folding it all | 768 | 100 %, 1 %, 7 % |
|  | ladder 4, 32 px | 192 | 95 %, 4 %, 30 % | folding it all | 192 | 98 %, 1 %, 12 % |
|  | ladder 2, 16 px | 48 | 89 %, 10 %, 65 % | folding it all | 48 | 92 %, 6 %, 32 % |
|  | ladder 1, 8 px | 12 | 85 %, 20 %, 98 % | a solid hull of 8 round all of it, 1.20 of its reach | 8 | 102 %, 18 %, 89 % |
| Bell tent | level 1, 170 px | 296 | 99 %, 1 %, 13 % | solid pieces thinned alike, enlarged 2.09 x | 281 | 92 %, 2 %, 14 % |
|  | level 2, 45 px | 174 | 90 %, 1 %, 11 % | solid pieces thinned alike, enlarged 2.15 x | 169 | 95 %, 1 %, 6 % |
|  | level 3, 15 px | 18 | 89 %, 8 %, 31 % | a solid hull of 8 round its largest crowd, 0.72 of its reach | 18 | 99 %, 9 %, 42 % |
| Holm oak | level 1, 260 px | 3,948 | 106 %, 22 %, 100 % | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 1.99 x | 3,681 | 101 %, 18 %, 96 % |
|  | level 2, 80 px | 1,068 | 110 %, 24 %, 100 % | solid pieces folded; cut-out pieces thinned alike, enlarged 4.07 x | 1,028 | 104 %, 24 %, 100 % |
|  | level 3, 34 px | 228 | 113 %, 26 %, 97 % | a solid hull of 36 round its largest crowd, 1.01 of its reach | 228 | 93 %, 24 %, 100 % |
|  | its far body, 18 px | 30 | 66 %, 39 %, 100 % | a solid hull of 20 round its largest crowd, 1.05 of its reach | 36 | 91 %, 26 %, 100 % |
|  | its speck, 7 px | 8 | 42 %, 48 %, 100 % | a solid hull of 8 round its largest crowd, 1.27 of its reach | 8 | 92 %, 30 %, 100 % |
| Stone pine | level 1, 260 px | 2,406 | 113 %, 20 %, 100 % | solid pieces folded; cut-out pieces thinned alike, enlarged 1.87 x | 2,397 | 103 %, 14 %, 75 % |
|  | level 2, 80 px | 858 | 131 %, 24 %, 98 % | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 2.66 x | 854 | 108 %, 19 %, 85 % |
|  | level 3, 34 px | 168 | 149 %, 25 %, 86 % | a solid hull of 36 round its largest crowd, 1.03 of its reach | 145 | 94 %, 14 %, 56 % |
|  | its far body, 18 px | 30 | 72 %, 29 %, 87 % | a solid hull of 20 round its largest crowd, 1.05 of its reach | 27 | 94 %, 16 %, 67 % |
|  | its speck, 7 px | 8 | 51 %, 39 %, 88 % | a solid hull of 8 round its largest crowd, 1.23 of its reach | 8 | 97 %, 21 %, 72 % |
| Mastic | level 1, 140 px | 88 | 89 %, 16 %, 82 % | cut-out pieces thinned, the smallest first, enlarged 1.52 x | 88 | 101 %, 16 %, 84 % |
|  | its far body, 16 px | 20 | 46 %, 25 %, 79 % | a hull of 20 round all of it that stops 85 % of the light | 20 | 87 %, 16 %, 68 % |

Counted over the 21 rows, the builder's reading against today's: the outline nearer in 20, further in 1 (the tent's
level 1); a neighbourhood on average nearer in 16, equal in 3, further in 2 (the tent's levels 1 and 3, by a point
each); at its worst nearer in 14, equal in 3, further in 4.

The builder's count of triangles is the nearest the ways give under the level's: between 13 % under it and, once,
20 % over it (the oak's far body, 36 against 30: the wood beside the hull did not fold as far as asked).

What the stick chose:

- **The boulder**: folding at every size; a solid hull of eight triangles for the last level, where folding to twelve
  loses the shape.
- **The oak and the pine**: the wood folded and the leaves thinned down to about 80 px, sometimes the smallest first
  and sometimes alike; from 34 px down a hull round the crown, solid and within 1 to 27 % of its reach, with what
  room is left given to the trunk.
- **The mastic**: its leaves thinned at 140 px; at 16 px a hull round all of it that stops 85 % of the light.
- **The tent**: folding all of it at half its triangles; from a quarter down its ropes and pegs thinned and made one
  and a half to two times as thick; at 18 triangles a solid hull with the canvas folded beside it.

Two pictures of the oak and the pine, each row one size on screen, the full plant made small beside today's level
and the builder's result: `probes/out/oak-today-beside-the-builder.jpg`, `probes/out/pine-today-beside-the-builder.jpg`.
What they show that the numbers do not:

- At 260 px both today's level and the builder's show cards two to four times the size of the full plant's: the
  same change of grain. The builder's stays inside the outline; today's is wider.
- At 34 px the hull is a plain body where the full crown shows wood through its leaves.
- At 18 px the pine's trunk no longer reaches its crown (the wood folded to a stub), and at 7 px it is gone.
- At 7 px today's speck is under half the plant's size; the hull is the plant's size and shape.

### Today's triangles in all, spread by size

| Asset | All its triangles down to | A neighbourhood off, mean over the sizes: today, spread | At its most: today, spread | Outline off at most: today, spread | Sizes where spread reads worse on average |
| --- | --- | --- | --- | --- | --- |
| Boulder | 536 px | 5 %, 4 % | 18 %, 16 % | 15 %, 5 % | 1 of 16: 8 px (10 to 13 %) |
| Bell tent | 86 px | 2 %, 2 % | 8 %, 10 % | 11 %, 4 % | 4 of 14: 49 px (0 to 1 %), 27 px (1 to 2 %), 20 px (1 to 4 %), 8 px (8 to 10 %) |
| Holm oak | 260 px | 25 %, 19 % | 46 %, 29 % | 56 %, 10 % | 2 of 16: 49 px (21 to 24 %), 36 px (19 to 24 %) |
| Stone pine | 213 px | 21 %, 12 % | 35 %, 20 % | 53 %, 18 % | 0 of 16: none |
| Mastic | 83 px | 12 %, 7 % | 25 %, 19 % | 54 %, 23 % | 1 of 14: 20 px (12 to 17 %) |

"Sizes where spread reads worse" counts every size at which a neighbourhood is off by more than today's level there.
Size by size (the same three readings):

**Boulder**

| Size | Today: triangles | outline, off, worst | Spread: triangles | its way | outline, off, worst |
| --- | --- | --- | --- | --- | --- |
| 400 px | 12,288 | 99 %, 1 %, 23 % | 61,704 | folding it all | 100 %, 0 %, 0 % |
| 296 px | 12,288 | 99 %, 1 %, 20 % | 33,856 | folding it all | 100 %, 0 %, 1 % |
| 219 px | 12,288 | 99 %, 1 %, 16 % | 18,576 | folding it all | 100 %, 0 %, 1 % |
| 163 px | 12,288 | 99 %, 1 %, 13 % | 10,192 | folding it all | 100 %, 0 %, 2 % |
| 120 px | 3,072 | 98 %, 2 %, 26 % | 5,592 | folding it all | 100 %, 0 %, 2 % |
| 89 px | 3,072 | 97 %, 2 %, 20 % | 3,068 | folding it all | 100 %, 0 %, 3 % |
| 66 px | 3,072 | 98 %, 2 %, 15 % | 1,682 | folding it all | 100 %, 0 %, 3 % |
| 49 px | 768 | 97 %, 3 %, 24 % | 922 | folding it all | 99 %, 1 %, 4 % |
| 36 px | 768 | 96 %, 3 %, 19 % | 506 | folding it all | 99 %, 1 %, 8 % |
| 27 px | 192 | 95 %, 4 %, 30 % | 278 | folding it all | 99 %, 1 %, 8 % |
| 20 px | 192 | 95 %, 4 %, 30 % | 152 | folding it all | 99 %, 2 %, 15 % |
| 15 px | 48 | 89 %, 10 %, 65 % | 82 | folding it all | 95 %, 3 %, 24 % |
| 11 px | 48 | 89 %, 10 %, 65 % | 36 | a solid hull of 36 round all of it, 0.99 of its reach | 100 %, 10 %, 57 % |
| 8 px | 48 | 89 %, 10 %, 65 % | 20 | a hull of 20 round all of it that stops 100 % of the light | 99 %, 13 %, 71 % |
| 6 px | 12 | 90 %, 18 %, 71 % | 8 | a solid hull of 8 round all of it, 1.20 of its reach | 102 %, 16 %, 72 % |
| 4 px | 12 | 85 %, 16 %, 64 % | 8 | a solid hull of 8 round all of it, 1.20 of its reach | 96 %, 14 %, 58 % |

**Bell tent**

| Size | Today: triangles | outline, off, worst | Spread: triangles | its way | outline, off, worst |
| --- | --- | --- | --- | --- | --- |
| 400 px | 1,392 | 100 %, 0 %, 0 % | 1,392 | all of it | 100 %, 0 %, 0 % |
| 296 px | 1,392 | 100 %, 0 %, 0 % | 1,392 | all of it | 100 %, 0 %, 0 % |
| 219 px | 1,392 | 100 %, 0 %, 0 % | 1,392 | all of it | 100 %, 0 %, 0 % |
| 163 px | 296 | 99 %, 1 %, 12 % | 1,392 | all of it | 100 %, 0 %, 0 % |
| 120 px | 296 | 98 %, 0 %, 10 % | 1,392 | all of it | 100 %, 0 %, 0 % |
| 89 px | 296 | 98 %, 0 %, 9 % | 1,392 | all of it | 100 %, 0 %, 0 % |
| 66 px | 296 | 98 %, 0 %, 7 % | 826 | folding it all | 100 %, 0 %, 0 % |
| 49 px | 296 | 98 %, 0 %, 5 % | 437 | solid pieces thinned alike, enlarged 1.41 x | 96 %, 1 %, 4 % |
| 36 px | 174 | 91 %, 1 %, 10 % | 248 | a hull of 20 round its largest crowd that stops 2 % of the light | 100 %, 1 %, 2 % |
| 27 px | 174 | 96 %, 1 %, 9 % | 136 | a solid hull of 20 round its largest crowd, 0.68 of its reach | 100 %, 2 %, 17 % |
| 20 px | 174 | 96 %, 1 %, 9 % | 74 | a solid hull of 20 round its largest crowd, 0.70 of its reach | 102 %, 4 %, 23 % |
| 15 px | 18 | 89 %, 8 %, 31 % | 41 | a solid hull of 20 round its largest crowd, 0.73 of its reach | 100 %, 8 %, 33 % |
| 11 px | 18 | 89 %, 8 %, 31 % | 22 | a solid hull of 8 round its largest crowd, 0.72 of its reach | 100 %, 8 %, 42 % |
| 8 px | 18 | 89 %, 8 %, 31 % | 12 | a solid hull of 8 round its largest crowd, 0.73 of its reach | 99 %, 10 %, 45 % |

**Holm oak**

| Size | Today: triangles | outline, off, worst | Spread: triangles | its way | outline, off, worst |
| --- | --- | --- | --- | --- | --- |
| 400 px | 21,444 | 100 %, 0 %, 0 % | 21,444 | all of it | 100 %, 0 %, 0 % |
| 296 px | 21,444 | 100 %, 0 %, 0 % | 21,444 | all of it | 100 %, 0 %, 0 % |
| 219 px | 3,948 | 106 %, 22 %, 100 % | 14,593 | solid pieces folded; cut-out pieces thinned alike, enlarged 1.16 x | 100 %, 6 %, 34 % |
| 163 px | 3,948 | 106 %, 21 %, 100 % | 7,615 | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 1.44 x | 100 %, 11 %, 59 % |
| 120 px | 3,948 | 106 %, 20 %, 100 % | 4,451 | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 1.86 x | 100 %, 15 %, 73 % |
| 89 px | 3,948 | 105 %, 19 %, 95 % | 2,515 | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 2.50 x | 100 %, 19 %, 88 % |
| 66 px | 1,068 | 109 %, 23 %, 100 % | 1,328 | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 3.48 x | 101 %, 23 %, 100 % |
| 49 px | 1,068 | 109 %, 21 %, 94 % | 731 | solid pieces folded; cut-out pieces thinned alike, enlarged 4.95 x | 105 %, 24 %, 100 % |
| 36 px | 1,068 | 110 %, 19 %, 76 % | 408 | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 6.23 x | 108 %, 24 %, 100 % |
| 27 px | 228 | 109 %, 25 %, 93 % | 228 | a solid hull of 36 round its largest crowd, 1.01 of its reach | 90 %, 23 %, 100 % |
| 20 px | 228 | 109 %, 25 %, 93 % | 111 | a solid hull of 20 round its largest crowd, 1.05 of its reach | 92 %, 25 %, 100 % |
| 15 px | 30 | 66 %, 39 %, 100 % | 62 | a solid hull of 20 round its largest crowd, 1.05 of its reach | 92 %, 25 %, 100 % |
| 11 px | 30 | 66 %, 39 %, 100 % | 36 | a solid hull of 20 round its largest crowd, 1.05 of its reach | 91 %, 26 %, 100 % |
| 8 px | 30 | 66 %, 39 %, 100 % | 20 | a solid hull of 20 round its largest crowd, 1.05 of its reach | 91 %, 26 %, 100 % |
| 6 px | 8 | 48 %, 46 %, 99 % | 8 | a solid hull of 8 round its largest crowd, 1.27 of its reach | 95 %, 29 %, 100 % |
| 4 px | 8 | 44 %, 38 %, 95 % | 8 | a solid hull of 8 round all of it, 1.28 of its reach | 94 %, 22 %, 97 % |

**Stone pine**

| Size | Today: triangles | outline, off, worst | Spread: triangles | its way | outline, off, worst |
| --- | --- | --- | --- | --- | --- |
| 400 px | 11,550 | 100 %, 0 %, 0 % | 11,550 | all of it | 100 %, 0 %, 0 % |
| 296 px | 11,550 | 100 %, 0 %, 0 % | 11,550 | all of it | 100 %, 0 %, 0 % |
| 219 px | 2,406 | 113 %, 19 %, 98 % | 11,550 | all of it | 100 %, 0 %, 0 % |
| 163 px | 2,406 | 113 %, 19 %, 94 % | 6,441 | solid pieces folded; cut-out pieces thinned, the smallest first, enlarged 1.59 x | 101 %, 6 %, 36 % |
| 120 px | 2,406 | 112 %, 18 %, 89 % | 3,513 | solid pieces folded; cut-out pieces thinned alike, enlarged 1.60 x | 101 %, 9 %, 52 % |
| 89 px | 2,406 | 113 %, 17 %, 81 % | 1,930 | solid pieces folded; cut-out pieces thinned alike, enlarged 2.01 x | 104 %, 13 %, 64 % |
| 66 px | 858 | 130 %, 23 %, 96 % | 1,053 | solid pieces folded; cut-out pieces thinned alike, enlarged 2.54 x | 106 %, 16 %, 75 % |
| 49 px | 858 | 128 %, 22 %, 90 % | 608 | solid pieces folded; cut-out pieces thinned alike, enlarged 3.23 x | 109 %, 18 %, 82 % |
| 36 px | 858 | 128 %, 20 %, 91 % | 330 | a solid hull of 36 round its largest crowd, 1.03 of its reach | 95 %, 14 %, 56 % |
| 27 px | 168 | 142 %, 24 %, 95 % | 169 | a solid hull of 20 round its largest crowd, 1.05 of its reach | 92 %, 14 %, 53 % |
| 20 px | 168 | 142 %, 24 %, 95 % | 99 | a solid hull of 36 round its largest crowd, 1.03 of its reach | 92 %, 14 %, 54 % |
| 15 px | 30 | 72 %, 29 %, 87 % | 54 | a solid hull of 20 round its largest crowd, 1.05 of its reach | 93 %, 15 %, 55 % |
| 11 px | 30 | 72 %, 29 %, 87 % | 27 | a solid hull of 20 round its largest crowd, 1.05 of its reach | 94 %, 16 %, 67 % |
| 8 px | 30 | 72 %, 29 %, 87 % | 15 | a solid hull of 8 round its largest crowd, 1.21 of its reach | 93 %, 20 %, 71 % |
| 6 px | 8 | 47 %, 35 %, 95 % | 8 | a solid hull of 8 round its largest crowd, 1.23 of its reach | 82 %, 19 %, 67 % |
| 4 px | 8 | 47 %, 29 %, 66 % | 8 | a solid hull of 8 round its largest crowd, 1.23 of its reach | 84 %, 16 %, 58 % |

**Mastic**

| Size | Today: triangles | outline, off, worst | Spread: triangles | its way | outline, off, worst |
| --- | --- | --- | --- | --- | --- |
| 400 px | 744 | 100 %, 0 %, 0 % | 744 | all of it | 100 %, 0 %, 0 % |
| 296 px | 744 | 100 %, 0 %, 0 % | 744 | all of it | 100 %, 0 %, 0 % |
| 219 px | 744 | 100 %, 0 %, 0 % | 744 | all of it | 100 %, 0 %, 0 % |
| 163 px | 744 | 100 %, 0 %, 0 % | 744 | all of it | 100 %, 0 %, 0 % |
| 120 px | 88 | 89 %, 16 %, 81 % | 744 | all of it | 100 %, 0 %, 0 % |
| 89 px | 88 | 89 %, 15 %, 79 % | 744 | all of it | 100 %, 0 %, 0 % |
| 66 px | 88 | 90 %, 15 %, 72 % | 458 | cut-out pieces thinned, the smallest first, enlarged 1.13 x | 101 %, 2 %, 14 % |
| 49 px | 88 | 90 %, 14 %, 66 % | 250 | cut-out pieces thinned, the smallest first, enlarged 2.00 x | 102 %, 6 %, 38 % |
| 36 px | 88 | 89 %, 13 %, 62 % | 141 | folding it all | 97 %, 9 %, 43 % |
| 27 px | 88 | 89 %, 12 %, 57 % | 77 | cut-out pieces thinned, the smallest first, enlarged 1.58 x | 100 %, 12 %, 53 % |
| 20 px | 88 | 89 %, 12 %, 57 % | 36 | a hull of 36 round all of it that stops 76 % of the light | 94 %, 17 %, 58 % |
| 15 px | 20 | 46 %, 25 %, 79 % | 20 | a hull of 20 round all of it that stops 85 % of the light | 87 %, 16 %, 68 % |
| 11 px | 20 | 46 %, 25 %, 79 % | 12 | a solid hull of 8 round its largest crowd, 1.07 of its reach | 77 %, 19 %, 77 % |
| 8 px | 20 | 46 %, 25 %, 79 % | 8 | a solid hull of 8 round its largest crowd, 1.07 of its reach | 77 %, 19 %, 77 % |

## What went wrong on the way

Kept because each shaped the stick, and each was seen in a picture before it was seen in a number.

1. **A stick that saw only cover made the wood thicker.** Told nothing, the builder thinned and enlarged the oak's
   twigs as it did its leaves: the cover came out right and thick branches stuck out of the crown. The stick now
   tells the stuffs apart, with what hides what.
2. **A cap was hit in silence.** The search for the enlargement stopped at 1.6 over the root of the share kept; where
   a class of small pieces was thinned much harder than the whole, it returned the cap (2.26). It now widens until
   the cover is met.
3. **A patch of four pixels misjudged small things.** A speck of eight pixels is two patches across: one more patch
   touched read as an outline of 140 %. Things under 32 pixels are now cut into eight patches across.
4. **A hull with rings at fixed heights turned the pine's umbrella into a block.** Its outline read 100 % from
   thirteen sides and it was the wrong shape from the side. The hull is now reckoned in the crowd's own proportions;
   the pine's level 3 went from a patch off by 24 % to 14 %.

## Inferences (mine)

- **The stick is what makes "nothing told" possible.** Folding, thinning and a hull lose different things: a surface
  moved, parts gone, a body see-through. Only a difference between pictures puts them on one scale. With it the
  builder needs no kind, and a new way is tried beside the others without touching an asset.
- **The same stick is the measure of "higher than today".** Today's levels can be read on it before anything is
  built, and a stage can be held to it.
- **Spending follows the screen.** Most of the gain in the second table is not a better way but triangles moved from
  where today's bands are generous to where they are short: the oak keeps all its triangles to 260 px and has more
  than today just under every one of today's steps.
- **Where it loses, a way is missing, and the papers name it.** Between about 30 and 50 px a crown is too far for
  sprigs enlarged five times and too near for one hull. A stand-in for each group of sprigs (several small hulls)
  is the published answer; the builder would try it beside the others.
- **Thin loose parts need a way of their own**, or more triangles: the tent's ropes thickened to twice their width
  read better than folded away, and worse than the hand-made level that simply kept them.

## Gaps

- **Not the game's picture.** Shape and cover only, two stuffs, no colour within a stuff, no painting, no light, no
  wind. The stick has not been set against Samuel's eye or against the game's renderer.
- **Stills only.** Every row is one reduction of the whole thing at one size. No hierarchy was built by this script,
  and nothing was measured of the change from one size to the next: no jump, no pumping in motion, no zoom.
- **Triangles only.** The spread counts triangles, not pixels drawn and not vertices worked. Enlarged cards and
  see-through hulls cost pixels.
- **The script's pictures are slow** (an oak's nine comparisons took about five minutes): what the stick costs while
  an asset is built in a worker is not known from this.
- A see-through hull needs blending or a stipple when drawn; only the mastic's was chosen see-through here.
- What a crowd is (sixteen loose pieces under a fiftieth) is a rule of thumb: the oak's trunk falls into its crowd of
  wood.
- One shape of each plant, one boulder, one tent. Nothing on bones, nothing that moves.
