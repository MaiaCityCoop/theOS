---
id: "0026"
title: The start twice as fast
state: propose         # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-15
story: Stories/0026-the-start-twice-as-fast/   # set at propose
---

# 0026 · The start twice as fast

## Idea

Samuel: the game's initial loading time is quite bad. He wants the start twice as fast: the time to the first
playable frame halved. He plays on an iPhone.

Measure first (the dev server and a production build, served as the host serves it; a desktop and a mid-range phone:
the CPU slowed and a slow 4G network), find what takes the time, fix the largest of it without changing what is
played or seen, and measure again the same way.

## Define

Asked for outright; the definition holds no surprise, so it is built straight away.

**Deliverables**

1. **The start measured**, before and after, the same way: Chromium driven by Playwright, a fresh browser for every
   run (no cache, nothing kept), medians of several runs. Four configurations: the dev server and the production
   build (served as Caddy serves it: HTTP/2, zstd, the Caddyfile's cache headers), each on a desktop window and on a
   mid-range phone (iPhone 15's screen, the CPU four times slower, DevTools' Slow 4G). Read for each: the requests,
   their bytes and the largest files; the scripts' evaluation; the start's own marks (`window.__game.boot`: painting
   the textures, the ground, the land, the scatter, the world, the first choosing, compiling); the time to the first
   frame and to playable (the veil lifting).
2. **The largest causes fixed**, in the game and on the host (cache headers), without changing the game's play or its
   picture.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | the baseline, in numbers | the four configurations, five runs each (three for the dev server on the phone), medians in a table |
| 2 | the first playable frame in half the time or less | the same runs after; median before over median after, each configuration |
| 3 | the same picture | the tent at the spawn, before and after: the frame read back from the GPU at a held time, pixel by pixel; the WebGL 2 fallback's screenshot |
| 4 | still playable | after the start: the walker moves on the keys, no new errors in the console |
| 5 | what does not change between deploys is cached | the response headers of the production build's files |

**Out of scope**

- The frame rate once the world is drawn (intent 0020 measured it; it stays as it is).
- The library (intent 0025), collision (intent 0027), the brand's stylesheet and the pages' viewport (intent 0028).

## Build

**How it was measured.** This container has no GPU: Chromium 153 draws WebGPU on SwiftShader, the GPU done by the
CPU, which compiles a shader many times slower than a phone's GPU driver does. So the absolute times are far longer
than on Samuel's iPhone, and the GPU's share is larger; what is the same on every device is the order of the work and
what waits for what. The harness (Playwright, kept outside the repository) opens a fresh browser for every run and
reads: the time from the address to the first frame and to the veil lifting (`html.os-loaded`), the start's own marks
(`window.__game.boot`), every request and its bytes, the long tasks, and the CPU seconds of each of the browser's
processes. The production build is served as Caddy serves it (HTTP/2, zstd, the Caddyfile's cache headers). The phone:
iPhone 15's screen, the CPU 4× slower, DevTools' Slow 4G (1.44 Mbit/s down, 562.5 ms a request).

**The baseline, medians:**

| | first frame | playable | the game's code starts | requests | bytes | runs |
| --- | --- | --- | --- | --- | --- | --- |
| dev server, desktop | 35.5 s | 35.6 s | 1.3 s | 324 | 17.2 MiB (JS 16.9 MiB) | 5 |
| production, desktop | 37.5 s | 37.6 s | 0.8 s | 28 | 611 KiB (JS 394 KiB) | 5 |
| production, phone | 46.4 s | 46.7 s | 6.1 s | 28 | 677 KiB (JS 485 KiB) | 5 |
| dev server, phone | 145 s | 145 s | 103 s | 324 | 17.2 MiB | 3 |

**Where the time went** (production, desktop; a trace of the GPU process and a profile of the page's own thread):

- **The GPU process's own thread compiled, one at a time, every pipeline that was made as it was first drawn:** the 48
  passes that paint the world's textures (21.7 s), the 63 passes that pack what stands (8.0 s), the ground's pass
  (1.5 s): 31 of the 33 s it was busy. The 29 pipelines the start did compile side by side took 7.4 s on its worker
  threads, and could only begin once that queue had cleared. The slowest single pass took 3.5 s.
- **The page waited with it:** one task of 25.6 s, a worker's tree meshes handed to the GPU (`queue.writeBuffer`,
  `src/core/gpu.js`), which cannot go before the GPU process has worked through what was asked before it.
- **Every material of the world was compiled twice.** The start compiled the scene for the canvas (no target set),
  but since 2026-11-14 the world is drawn into the screen's own target (`src/core/screen.js`), and three keeps a
  pipeline per target: the first frames made every one of them again, synchronously. Here the canvas and the target
  have the same format and the second compile was cheap; on Apple devices the canvas is `bgra8unorm` and the target
  `rgba8unorm`, and the ~25 pipelines (the land's, with its 240 KB and 151 KB shaders, among them) were compiled
  in full twice. The city's plots were compiled the same way (for whatever target was set when its plan came).
- **The shadow map's casters** were compiled synchronously inside the first frame.
- **The texture painting itself:** each material was painted twice, its colour, then its relief, the relief pass
  painting the material three more times a texel to take the height's steps: a quarter of all the shader text the
  start compiles, and the largest passes (up to 215 KB of WGSL).
- **On the phone, the network:** the scripts (485 KiB) arrive at 4.0 s on Slow 4G, the game's code starts at
  6.1 s; the fonts' stylesheet (an `@import` in `brand.css`) is done at 2.1 s, before the scripts, so it is not on the
  path. A second visit asks again for `brand.css` and `loading.js` (no-cache) before the page can go on.
- **The dev server** sends every module with its source map written into it, uncompressed: 17.2 MiB for one start,
  103 s on Slow 4G before the game's code runs (three's own two files: 11 MB).

**What was changed:**

1. **Everything compiled before it is first drawn, side by side, and only once** (`src/core/compile.js`, new):
   every compile of the start goes through one queue, in turn, each for the target it is drawn into: the textures'
   passes, the ground's pass (its two maps), the world (the screen's own target: `screen.compile`), the shadow map's
   casters (`shadows.compile`), and the city's plots whenever their plan comes. Inside a compile three keeps sixteen
   pipelines in flight, so a GPU that can compiles them in parallel. The packing passes read no target: they are
   compiled beside all of these from the moment the tiers exist (`scatter.compile`). One at a time, because three
   keeps the compile it is working through in the renderer itself: two at once trip over each other.
2. **three r187 compiled a target without depth as if it had the canvas's**: the pipelines it made for the painter's
   tile and the ground's maps were not the ones they are drawn with, and each pass was compiled a second time as it
   was first drawn (the ground's 390 KB shader among them). `compileFor` takes the renderer's depth off for such a
   target while the compile begins.
3. **The textures** (`src/materials/bake.js`): the start's materials are all built first and compiled together, then
   painted. A material is painted once, into two targets at once (its tile as before, and its height as worked out
   with its roughness, in 32-bit floats); its relief is taken from those heights by one pass that serves every
   material, the same steps to the next texel across and down that the old pass painted the material three more
   times to read. Half the passes to compile, the largest gone, a quarter of the painting.
4. **Nothing drawn while a compile is half done**: the painting, and the first choosing, wait their turn in the same
   queue (`inTurn`).
5. **The host** (`deploy/Caddyfile`, `TheGame/vite.config.js`): the build names the brand's files the pages load by
   their content (`brand.css?v=…`, `loading.js?v=…`, the icon), and Caddy keeps a file of `/brand/` asked for with
   `?v=` for good, as it does `/assets/*`: a second visit asks for none of them. Every file that compresses is written
   a second time beside itself as brotli at its best (`.br`), which Caddy sends where the browser takes it
   (`precompressed br`): the scripts 320 KiB where Caddy's own zstd made them 394. The Caddyfile reaches the host by
   running the host setup again (`deploy/README.md`).
6. **The dev server** compresses what it sends (gzip, each answer once, kept by its ETag): three's 7.2 MB file goes
   as 1.6 MB.
7. **A compute shader compiled once, however many passes run it** (`shareComputeCompiles`, `src/core/compile.js`).
   Measured after 1–6, every pipeline's request and compile: the GPU's compile threads (two to two and a half of the
   four cores) were full from the first request to the last, and the packing passes were what the first choosing
   waited for last. three makes a pipeline for every compute node whatever its code, and the tiers' 63 packing passes
   are 26 shaders; asked for side by side, each was compiled in full, ten of them again shaders of 120 to 150 KB. A
   repeat asked for once its twin was through came back in 0 to 3 ms: the browser keeps a compiled pipeline by what it
   is made of. So a compute pipeline asked for while another of its shader compiles now waits for that one, then is
   asked for itself. In one run each: the packing through by 9.0 s instead of 14.9, the ground's pass, which had
   queued behind it, compiled in 1.9 s instead of 6.1, playable at 15.1 s instead of 19.6.
8. **Tried and left:** ending a compile's turn the moment it had asked for its pipelines, so that the ground's and the
   relief's passes began beside the textures'. With the compile threads full it only moved them ahead of the packing,
   which the first choosing needs as well: 21.2 s against 19.6, one run each. Not kept.

**After, measured the same way (medians; the same main, `8dbee19`, under both):**

| | first frame | playable | before | faster | the game's code starts | the GPU through the start's work | requests | bytes | runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dev server, desktop | 16.1 s | 16.1 s | 35.6 s | 2.21× | 1.1 s | 37.4 s | 325 | 4.2 MiB (JS 4.0 MiB) | 5 |
| production, desktop | 15.3 s | 15.4 s | 37.6 s | 2.45× | 0.9 s | 36.3 s | 28 | 526 KiB (JS 320 KiB) | 5 |
| production, phone | 23.7 s | 23.8 s | 46.7 s | 1.96× | 5.4 s | 42.5 s | 28 | 584 KiB (JS 396 KiB) | 5 |
| dev server, phone | 53.7 s | 53.8 s | 145 s | 2.70× | 33.7 s | 73.8 s | 325 | 4.2 MiB | 3 |

Every run, playable: production on the desktop 15.5, 13.1, 14.7, 15.7, 15.4 s (before: 35.4, 38.2, 37.6, 37.6, 33.3);
on the phone 23.8, 24.2, 21.4, 24.9, 22.5 s (before: 46.7, 47.4, 50.0, 45.4, 44.0). The baseline once more, the same
afternoon, with the GPU's mark (three runs each): on the desktop 37.9 s to playable and the GPU through at 72.4 s, on
the phone 47.8 s and 85.6 s; against these, the phone is 2.01× faster to playable and its GPU through 2.01× sooner,
the desktop's GPU 1.99×. The scheduling alone, with the textures painted the old way, was slower than before (49.9 s,
three runs): compiling once and painting once only pay together.

**On main as it is now.** While this was built, main took the library (0025), collision (0027) and the pages' edges
(0028), and its own start got slower: 46.7 s on the desktop where it was 37.6, 49.7 s on the phone. The work, rebased
onto it (`1ce722e`) and measured against it the same way, three runs each:

| | main | this branch on it | faster | runs, main | runs, this branch |
| --- | --- | --- | --- | --- | --- |
| production, desktop: playable | 46.7 s | 17.1 s | 2.73× | 47.7, 45.6, 46.7 | 17.9, 17.1, 16.4 |
| production, desktop: the GPU through | 76.8 s | 39.4 s | 1.95× | | |
| production, phone: playable | 49.7 s | 27.5 s | 1.81× | 48.4, 49.7, 52.3 | 28.0, 27.5, 25.1 |
| production, phone: the GPU through | 88.9 s | 49.0 s | 1.81× | | |

On the phone the new main costs this branch 3.7 s more than the old one did (its packing passes are 73 now, of 29
shaders). There the page's own thread, four times slower, is busy for nearly the whole start building the shaders'
code: the texture passes are asked for over 5.1 s, the world's over 5.2 s (on the desktop about 2 s each). Tried: a
frame asked for coming at once until the game is ready (three's compile waits for a frame every 8 ms of work). The
game's own time came out the same (20.8 and 19.8 s against 20.6, one run each); not kept.

**A second visit** (the browser closed and opened again, its cache kept; the phone; two runs each): before, the game's
code started at 1.85 and 1.96 s, `brand.css` and `loading.js` asked for again and answered "not modified" first, a round
trip each; after, at 1.12 and 1.28 s, neither asked for. (Measured with the local certificate trusted by its key:
Chrome keeps nothing in its cache that came with a certificate error, so the first such runs, with the errors only
ignored, downloaded everything again whatever the headers said, and were dropped.)

**Where the time goes now** (production, desktop, one run with every pipeline's request logged): the first texture
pass is asked for at 1.4 s, the last packing pass is through at 9.0 s, the textures are painted at 8.2 s, the ground's
pass compiled at 10.2 s, the world's 29 pipelines through at 14.2 s and the shadow map's 5 at 14.9 s, the game ready
at 15.1 s. The page's own thread was busy for 5.9 s of the start in a trace before 7, which asks nothing more of it
(before all of this: 32 to 33 s, most of it waiting on the GPU). What is left is compiling: the GPU process's compile
threads, two to two and a half of this machine's four cores, are busy from the first request to the last. On a phone
with a GPU that part is the driver's, and much shorter; how much, only the phone can say.

## Propose

**Delivered:** the start, on branch `perf/faster-startup` (draft PR #13 against main), rebased onto main as it is now
(`1ce722e`). On the main it started from, medians: the production build 2.45× faster to playable on the desktop (37.6
→ 15.4 s) and 1.96× on the phone (46.7 → 23.8 s); the dev server 2.21× and 2.70×. The textures are painted once
(`src/materials/bake.js`); every pass is compiled once, before it is drawn, side by side, for its own target, and a
compute shader once however many passes run it (`src/core/compile.js`); the host keeps the brand's files and sends the
scripts as brotli (`TheGame/vite.config.js`, `deploy/Caddyfile`); the dev server compresses. The story:
`Stories/0026-the-start-twice-as-fast/`.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | the baseline table above: four configurations, five runs each (three for the dev server on the phone), medians, with the requests, the bytes and the start's own marks |
| 2 | passed on the desktop and the dev server; the phone just short | production, desktop 2.45× (37.6 → 15.4 s); dev server, desktop 2.21×, phone 2.70×; production, phone 1.96× (23.8 s, half would be 23.35), 2.01× against the baseline measured again the same afternoon (47.8 s). On main as it is now: 2.73× and 1.81× (three runs each) |
| 3 | passed | the GPU's frame at the spawn read back (`?notaau`, the time held at 30 s), main `1ce722e` against this branch on it: 4.18 % of pixels differ at all, 0.017 % by more than 8 of 255, 0.001 % by more than 32, the mean 0.06; the same 928,296 triangles. The WebGL 2 fallback's frame: 5.13 %, 0.018 %, none over 32. The textures read back layer by layer (`?rawtex`): the colours and the numbers' own identical; 13 relief layers differ in at most 0.08 % of their bytes, where the height steps |
| 4 | passed | the walker moves on W (1.28 m main, 1.07 m this branch, 20 s held, frames as slow as this browser draws them); no errors in the walk's console in either. `/lenses.html`, `/library.html`, `/timeline.html` ready, nothing said; `/me.html` ready with a 401 and two "[textures] the pool's 23 layers are all held" warnings, the same on main |
| 5 | passed | the headers as served: `/assets/*` and `/brand/*?v=…` `public, max-age=31536000, immutable`; the pages and `/brand/brand.css` without `?v=` `no-cache`. A second visit asks for neither `brand.css` nor `loading.js` (before: one "not modified" round trip each) |

**Known gaps:**

- Measured without a GPU (SwiftShader), and the phone is Chromium with its CPU and network slowed, not Safari on an
  iPhone: what Samuel's iPhone gains is still to be seen there.
- On the phone the page's own thread, four times slower, is busy nearly the whole start building the shaders' code,
  and Slow 4G takes 5.4 s before the game's code runs. three builds every compute node's code even where passes share a
  shader (73 passes, 29 shaders on main now); not measured on its own.
- The Caddyfile was not checked by Caddy itself here (running a downloaded Caddy was not allowed); its rules were
  measured through a stand-in server. `deploy/setup-host.sh` validates it before installing it, and it reaches the
  host only by running that setup again.
- Seen on the way, not changed: `/me.html` asks for more materials than its pool holds (Denim twill, Hair drawn as the
  stand-in), on main as well.

## Story

## Archived

---

## Todo

- [x] Baseline measured (four configurations)
- [x] Causes found
- [x] Fixes built
- [x] Measured again; the picture compared
- [x] Cache headers on the host
- [x] Draft PR with the table

## Changelog

_One entry per request cycle, newest last._

### 2026-11-15

- **Asked:** the game's start twice as fast (the first playable frame in half the time); measure first, on the dev
  server and a production build, on a desktop and a slow phone; keep the play and the picture.
- **Delivered:** the baseline in four configurations; the causes (the GPU compiling one pass at a time as each was
  first drawn, the world compiled twice, three r187's depth for targets without, every texture painted four times
  over, the packing shaders compiled once a pass, the dev server's 17.2 MiB uncompressed); the start compiled once,
  side by side, for each pass's own target, the textures painted once, a compute shader compiled once; the host's
  cache and brotli; the dev server's gzip. After: production 2.45× on the desktop, 1.96× on the phone; dev server
  2.21× and 2.70×. Rebased onto main `1ce722e`: 2.73× and 1.81×. The story spawned.
- **Good:** the same picture (the GPU's frame, the WebGL fallback's, the textures), the walker walking, no new errors.
  The page's own thread busy 5.9 s of the start where it was 32 to 33 s.
- **Broke / not there yet:** the phone is just short of half (23.8 s against 23.35); on main as it is now 1.81×. Not
  measured on a real iPhone. Two experiments made it no faster and were left out (Build, 8 and the paragraph on main
  as it is now).

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `4c0a0ea` | The start compiles every pass once, side by side, for the target it is drawn into; a texture is painted once |
| 2026-11-15 | `31abbcf` | The host keeps the brand's files by their content and sends the scripts as brotli; the dev server compresses |
| 2026-11-15 | `e6701a1` | A compute shader is compiled once, however many passes run it |
| 2026-11-15 | `26d9813` | The host keeps for good only the brand's own files asked for by their content |
| 2026-11-15 | `8ff45c0` | Intent 0026 proposed: the measurements, the checks, the gaps; its story spawned |
