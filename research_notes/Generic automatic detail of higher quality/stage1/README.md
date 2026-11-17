# Stage 1: the far canopy, tried (intent 0033, 2026-11-17)

Stills from the game in Chromium here (WebGPU on SwiftShader), 640 x 360. "main" is the game as it is; `?lod=new` is
the plants on the crowd kit as merged in #30 (CARD 30, KMAX 8, FAR 18, bands uncut). The 90 m view is the pine forest
from 90 m up (`tools/shots.js` view x -1290, z 618, yaw -4.54, pitch -25), cropped to its left half and enlarged.

| file | panels (left to right, top to bottom) |
| --- | --- |
| `canopy-90m-alpha-mips.jpg` | main · `?lod=new` · `?lod=new&mips=1` (coverage-preserving alpha mips) · `?lod=new&mips=1&spread=1` |
| `canopy-90m-far-body.jpg` | main · `?lod=new` · `?far=12` · `?far=9` (the far body later) |
| `canopy-90m-spread-kmax.jpg` | main · `?lod=new` · `?spread=0.5` · `?kmax=5` |
| `canopy-90m-spread1-bias.jpg` | main · `?lod=new` · `spread=1` with the painting's mip biased as for the card unenlarged (not kept) |
| `tent-alpha-mips.jpg` | by the tent: main · `?lod=new&mips=1` · `?lod=new&mips=1&spread=1` |
| `eye-level-spread1-bias.jpg` | pine forest at eye level and by the tent: main (left) · `spread=1` with the mip bias (right, not kept) |

What they show: at 90 m main's crowns keep their leaves' shapes and dark gaps; every variant of `?lod=new` reads as
smoother, flatter crowns (large flat leaves, or pads where the far body has taken over). Showing more of the painting
at its own size (`spread=1`) gives a dotted or checkered grid. The coverage-preserving mips change little by
themselves: the far crowns there are a few heavily enlarged cards, and what they show is the sprig painting stretched.
