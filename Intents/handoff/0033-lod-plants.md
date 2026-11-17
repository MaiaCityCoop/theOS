# Handoff: intent 0033, plants' LOD (`?lod=new`), from the cloud session to the Mac session

Repository: MaiaCityCoop/theOS. The work is under TheGame/. The intent is `Intents/0033-detail-that-scales-by-itself.md`.

## How the work is done
- Follow `.claude/skills/intents/SKILL.md`.
- Every commit ends with `Intent: 0033`.
- Commit the code first, then the trail row in the intent file, in a separate commit titled "Intent 0033: its trail".
- No model names in commits or PRs. The co-author line is `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Hard gates:
  - 60 fps at 4K;
  - `bun tools/scale.js` passes (18 of 18);
  - `npx vite build` passes in TheGame/ and in OS/.
- One PR per fix. Merge origin/main into the branch last, then push. The coordinator merges as soon as CI is green.

## State: main at feb95f7
**Merged today:**
- **#44: the crowd built from the splay.** Under ?lod=new the crowd is built from a plant's finest level, its splay where it has one: the holm oak and the stone pine; the mastic has none. Close up it is now as fine as ?lod=old.
  - Its far body comes sooner: the oak at 190 px instead of 111, the pine at 100 instead of 63.
  - Vertices are at or under old at every size.
- **#47: `?bench`.** The six bench views are timed on screen once the world is loaded, with GPU timestamps where available.
  - It also fixed `bench()`: it now holds the game's own frame while timing (`window.__game.covered = true`). Before that, the game's frames were drawn between the bench's, about 4× inflated on SwiftShader. Every bench number from before #47 is invalid.
- **#48: `LOD_DEFAULT = 'new'`** in `TheGame/assets/kit/crowd.js`. `?lod=old` still selects the files' own levels.
- **#49: a plant's sunlight per vertex reckoned once.** `cloudAtVertex` (9 shadow-map taps plus the cloud map) used to run twice per crowd vertex with the bake on.
  - Pine forest, eye level, SwiftShader, whole frame: old 2805 ms, new before 3463 (+23 %), new after 2943 (+4.9 %).
- **#52: the grass map** (`src/scatter/ground.js`).
  - Its texel steps by √2 with hysteresis, instead of re-laying every frame of a climb as the rig's lens zooms with height.
  - Each step fades from the old map to the new over 36 frames (two render targets, weight W, read once per blade at packing). 4 MB more memory.

Earlier merged: #37–#43 (flyby, walk, mip blend, plant end fade, no splay level, density easing, dashboard flags).

**Open branches, not merged:**
- `aven/0033-ground-cache-ease` (ac42542, pushed, WIP), in `src/terrain/groundcache.js`:
  - The cache gives way over `smoothstep(0.85, 0.98, U.uLodInv)` instead of switching off at `uLodInv > 0.98`.
  - A finer cache map, once laid, is eased in by `uValid` dropping 0.08 a frame.
  - Not proposed: see "Tried and dropped".
- `aven/0033-ground-cache-fade` (92994d2): the older WIP of the same idea. Superseded by `-ease`.

**Tried and dropped (SwiftShader numbers, wall time, CPU-bound; vertex work runs on the CPU there):**
- **Per-vertex cost of new at pine forest, eye level, pixel ratio 0.25, render only, plants.** Old 497 ms, new about 935 (trees 465 vs about 800).
  - Rule math stubbed: 843.
  - Rule's two heap reads replaced by constants: 717. This is an upper bound; the compiler folds the constant rule.
  - Rule from a uniform table, "option (b)": 898, only −4 %. Dropped.
  - Per-instance rule pass (a per-frame compute over the packed plants): at most −10 to −20 %. Dropped.
  - Bake view math branched out for non-baked vertices: no change (1256 vs 1258 ms). Dropped.
  - `?bake=0&far=40`: plants 789, so the bake costs about 16 %.
  - Key fact: at that view new already processes FEWER tree vertices than old (921k vs 1.48M; corners 2.1M vs 3.1M). On SwiftShader each new vertex is about 2.5× heavier. A real GPU weighs this differently: measure there.
  - The shrubs and litter do process 2–3× old's vertices (136k vs 70k, 108k vs 37k). A crowd level draws the level's whole mesh for every plant, and their middle band runs 16–140 px.
- **`?split=2` as default.** Bench sums, new vs new&split=2: pair 1 −2.3 %, pair 2 +7.7 %; pair 2 was slower everywhere, even the skyline with no plants, which is machine drift. Per stand: litter 75 → 46 ms, town trees 57 → 43, pine trees no change. No clear whole-frame win, so dropped. Worth re-checking on a real GPU.
- **Ground-cache fade.** Camera-still sweep by the tent, TAA off, lens factor 1.00 → 1.25. Main shows no step at the switch (0.234 at 1.018, 0.185 at 1.027, against 0.20–0.25 around it). So not shipped.

## Tools and flags
**URL flags (game, also passed through by the OS dashboard):**
- `?lod=new|old`: the plants' LOD; new is the default.
- `?bake=0`: no baked far-body crowns (then FAR 18 unless `?far=`).
- `?far=N`: the far body from N px (40 with the bake).
- `?sky=lo,hi`: the slopes over which baked bodies get see-through against the sky (default -0.03,0).
- `?card=`, `?kmax=`, `?split=`: the crowd's CARD (30), KMAX (4) and SPLIT (0).
- `?mips=1`: coverage-kept foliage mips (bake.js COVER).
- `?bench`: the overlay; `?bench=2` sets the pixel ratio (1.5 by default). `?gputime`: GPU timestamps for bench() and parts().
- `?flyby`: the camera zooms from 12 km to eye level before the holm oak at (-1342.09, 604.37) and back, on a loop. `?flyby=orbit&px=60&secs=…` circles it. `window.__flyby.at(s)` holds the flight at s seconds.
- `?notaau`: no temporal jitter (needed for any picture diff).
- `?draws`: counts passes and draws (tools/draws.js).
- `?stress`: the stress world.

**Console:**
- `await (await import('/tools/bench.js')).bench({ ratio: 1.5, frames: 60, settle: 3000 })`.
- `.parts(view)` gives the GPU time per part (needs `?gputime`).
- `await window.__plants.submitted()`: per stand, the plants, vertices and corners the GPU processes (eye and light).
- `window.__plants.counts()`.

**CPU:**
- `bun tools/walk.js holmoak stonepine mastic`: checks 1 and 2 on the CPU. Every plant at every 1 % of size, old vs new: outline and cover against the near view, and steps over 3× their neighbours. Writes walk.json and walk-<plant>.pgm contact sheets into the cwd. Run it outside the repo or delete those files afterwards.
- `bun tools/scale.js`: the scale gate.

**Camera-still sweep (Playwright; was in the cloud scratchpad, rewrite it as needed):**
- Load the game, set the view (`/tools/shots.js` `view({x,z,yaw,up,pitch})`, or `__flyby.at(t)`), hide the HUD, and set clouds and wind to 0 (`__game.weather.set('clouds',0)`, `set('wind',0)`).
- Wrap `__game.governor.detail` to multiply by `window.__F`.
- Sweep F evenly in log between F0 and F1, two rAF frames per step, a screenshot each.
- Score each consecutive diff against the median of its neighbours.
- 4K-equivalent: F≈4 at 960×540 (or F≈8 at 480×270).
- On a real GPU you can just use 3840×2160.

**Per-part timing (cloud harness "diag"):**
- Hold the game frame (`__game.covered = true`, `governor.hold(true)`) and set a bench view the way bench.js `frame(v)` does.
- Time `renderer.render` with only some scene children visible: trees' tiers (`t.drawer` set, by `t.asset`), no trees, none.
- On a GPU, `parts()` with `?gputime` does this better.

## Next steps, in order
1. **Ground-cache fade:** find a view where the cache switch at lens factor 1.02 actually shows (rising from eye level to street height; the cache covers distant ground). If it shows, ship `aven/0033-ground-cache-ease` (merge main last).
2. **Forest colour and river edge from far off** (detail ×0.05–0.08 in the sweep): a step in the forest's colour and at the river's edge. Show the step first (camera-still sweep, F 0.08 → 0.05), then fix.
3. **The oak at about 22 px:** a visible change around 22 px in the walk and sweep. Look with `?flyby=orbit&px=22` and the walk's contact sheet.
4. **Real-GPU bench, old vs new:** `?lod=old&bench` and `?lod=new&bench`, two alternating pairs. There are still NO real-GPU numbers; the default was switched without them. If new is slower at the pine forest eye view, look first at shrubs and litter (2–3× old's vertices, see above) and at split=2.
5. **The stress world** (`?stress`, its first view): old vs new, frame time and that it isn't slower. Also memory (about 112 MB of plant heaps under new vs 40 old, measured earlier) and cold start (6.2 s vs 2.9 s).

Also still open: speckle crawl in motion (frozen-build flyby at 60 fps); the 4K sweep, never completed (stopped at 16 of 80 frames); and checking the mastic's 19 % outline step.

## Gotchas
- **Trail-row conflicts.** Every PR appends a row to the Trail table at the end of the intent file, so two PRs conflict there. On a merge, keep both rows, main's first.
- **registry.json.** `npx vite build` (and the dev server) regenerates `TheGame/registry.json` when a recipe or a kit file changes; assets/kit/* changes bump asset versions. Commit it ("Intent 0033: the assets' versions, for the kit's change"). The stored plant meshes' fingerprint includes those versions, so the browser rebuilds them.
- **Frozen builds for motion tests.** The vite dev server reloads the page on any file change, and that killed long runs. Build (`npx vite build`) and serve `dist` with `python3 -m http.server <port>`, or use a separate git worktree per branch (symlink node_modules into it).
- **Comments that swallow code.** In this codebase a trailing `//` comment sits on the same line as code. Inserting code after one puts the code inside the comment; this happened twice. Put new code before the comment.
- **Bench noise.** Every bench run's second pair drifted slower, even at the skyline with no plants. Compare within a pair, and don't trust a single pair. Use GPU timestamps on the Mac.
- **The coordinator sometimes merges main into a branch itself.** Fetch before pushing; if rejected, take theirs.
