# One session: everything that is open, in one place (2026-11-17)

Samuel asked for all the work to be consolidated into **one session on his Mac**, working from `main`. Before this
there was a coordinator in the cloud plus separate sessions for plant LOD, solid LOD, the body and the Bible. Those
are all stopped now. This file is what the coordinator knew. The per-area handoffs next to it hold the detail:

| File | What it covers |
| --- | --- |
| `0033-lod-plants.md` | Plant LOD (`?lod=new`): tools, flags, everything tried and dropped, numbers, gotchas |
| `0036-body.md` | The body (intent 0036): what's built, the kits, the ranked realism list, gotchas |
| `0036-mac-diagnosis.md`, `0036-mac-shader-sizes.mjs` | The library's startup hang, as seen on the Mac: about 5.8 MB of shaders compiled at start, the largest `ground.js` (390 KB) |
| Branch `aven/0033-solids-wip` (3e303b9) | **Not merged**: work in progress on the made things' levels (tent, fire pit) from their finest faces. It would change the tent live, because `?lod=new` is the default. Finish it, sweep the tent and fire pit, then merge |

## How Samuel works

- **He decides fast and wants things advanced.** "Can't test anything that isn't deployed, so just advance
  everything you can yourself." Merge your own PRs when CI is green, and deploy every merge to next yourself.
  Make design calls yourself; ask him only about taste, mission and money.
- **Hard gates, always:** 60 fps and 4K (`tools/bench.js` BUDGET 12 ms of GPU a frame at the bench's views),
  and 8 GB of memory.
- **He checks visually on next** (`play.next.maia.city`), on his Mac (Chrome, Safari) and on his iPhone. Say
  exactly where to look (the URL, the flags) and what changed. Keep answers short.
- **He wants the new LOD and a better algorithm, not a fallback.** "Don't switch back! Upgrade your LOD algorithm!"
  `LOD_DEFAULT` stays `'new'`.

## Process (from the intents skill)

- Every change belongs to an intent (`Intents/NNNN-slug.md`). Commits end with `Intent: NNNN`. Code is committed
  first, then its trail row. No model names in commits or PRs.
- Branch `aven/NNNN-…` from `main`. Merge main in last, open the PR as a draft, then mark it ready when CI ("check")
  is green. The trail rows in `Intents/0033-…` conflict all the time: keep both sides. After a merge that touches
  assets or kits, run `bun tools/registry.js` in `TheGame/`.
- **Deploy to next** (auto-deploy is off): `gh workflow run deploy.yml --ref main -f environment=next -f commit=<full sha of main>`,
  then `gh run watch`. It takes about 40 s.
- Checks before every PR: `bun tools/scale.js` (18 of 18), and `vite build` for TheGame and OS.

## State of main (77328a6 and after)

**Live on next:**
- The new plant LOD is the default (`?lod=old` to compare). Crowd kit, baked far bodies with normals lit live,
  blended mips, thin-away end with its shadow, no splay, and the crowd built from the splay.
- The grass map fades between texel steps.
- `?bench` overlay, `?flyby` and `?flyby=orbit`.
- The rocks' reduction from their full mesh (#53, via #59).
- The library fills the screen on a phone (`cine.fill`), and the Body's bones show first.
- The startup compiles time out at 20 s (#55, a safety net, not the cause).
- The body: face, skin, muscles with fat, limbs, hands (#45, #46, #50).
- The Bible: intent 0037, the mission sharpened, the euro taken out for now, self-sovereignty.

**Measured on Samuel's Mac (Apple GPU), pine forest at eye level, GPU ms:**

| | Old LOD | New LOD |
| --- | --- | --- |
| Chrome 1080p | 18.6 / 28.2 | 10.6 / 16.3 |
| WebKit | 22.1 / 18.4 | 17.7 / 18.7 |

At 4K the frame is about 25 ms, and **the land alone is about 20 ms**:
- each biome's ground, laid per pixel: 8.7 ms;
- each material read twice to break up tiling: 5.5 ms;
- light: 4 ms.

The ground cache (`?groundcache`) halves that, but it is off: it is softer between 10 and 60 m and shows a band.

## Open, in order

1. **Plant realism under the new LOD.** It is the top priority; Samuel called it "catastrophic" at eye level by
   the tent (-1272, -5, 597). What he saw, and what to do:
   - **Near pines and oaks** are a few huge flat cards with their painting stretched. Use fewer enlargements
     (KMAX 2 or less), keep more cards, start thinning where old's level 1 begins (not at P0 about 1000 px),
     and never stretch a painting.
   - **Middle-distance trees** are smooth domes: the hull shows. Open the far body late (18–40 px), and take its
     silhouette from the bake's alpha, never from the hull.
   - **Shrubs** show a visible dither. Use a coverage blend, or a dither that can't be seen at 4K.
   - **Proof:** stills against `?lod=old` at 10, 30, 60, 120, 250 and 500 m by the tent and in the pine forest,
     plus GPU time. The new LOD is faster on this GPU, so spend that headroom on looks.
2. **The rocks' first start.** They are invisible for about 20 s until their reduction lands. Draw the recipe's
   quick drawing until then.
3. **The ground cache, made to match, then on by default.** That's option 1, decided:
   - finer steps between maps, less reach, the outer band blended over its whole width;
   - fold in the ease that is already on main;
   - prove it with stills at 10, 30 and 60 m and GPU time at 4K.
4. **The library hang in Safari.** Find the compile that hangs (the #55 console line names it) and shrink the
   390 KB ground painter. See `0036-mac-diagnosis.md`.
5. **LOD stage 3 onward:**
   - the tent and fire pit from `aven/0033-solids-wip`, then the flame, then creatures;
   - each passes the camera-still sweep (`tools/sweep.js`, 4K-equivalent, no step over 3×);
   - also the forest colour and the river edge from far off, and the oak at about 22 px.
6. **Body realism (0036).** Waits for Samuel's pick from the ranked list in `0036-body.md`: hair and eyes first,
   then skin tone, lips, nose and ears, hands and feet, creases, then movement-driven skin.
7. **Bible (0037).**
   - Run `story reindex .` in `Bible/`. The index still lists "A Euro a Day" and lacks The Count and
     Self-Sovereignty.
   - Held items wait for Samuel: the two tone rules, four glossary terms, the door and the charter, and "no debt".

## Housekeeping still to do on the Mac

- **Delete these merged or stale remote branches** (the cloud wasn't allowed to):
  aven/0033-bench-url, aven/0033-ground-cache-fade, aven/0033-ground-cache-ease, aven/0033-default-old,
  aven/0036-shapes, aven/0033-solids-rocks, aven/0033-handoff, aven/0036-handoff, aven/0036-mac-wip,
  aven/0033-consolidate, aven/0033-one-session.
  Also delete every older `aven/0033-*`, `aven/0036-*` and `aven/0037-*` branch whose PR is merged.
- **Leave alone:** `feat/bald` (#5, jaensen's) and `test/e2e-first-screen` (no merge base).
- **One worktree and one dev server.** Remove `.claude/worktrees/aven-0033-land` once its useful bits are in.

## AvenMac, last state (2026-11-17, the Mac session that measured on the real GPU)

**Where:** `~/Documents/Development/theOS` on branch `aven/0033-avenmac-wip` (this branch), no other worktree of
mine; the dev server and browsers are stopped. Scripts in `Intents/handoff/avenmac/` (run with `bun`, Playwright
1.63.0 installed outside the repo, `S=<scratch dir>`; they expect the dev server on 5180). Comparison sheets on the
Mac in `~/Library/Logs/TheOS/shots/plants-lod/` and `shots/groundcache-4k/`.

**Correct the table above: at 4K the new LOD is NOT faster.** `cfgbench.mjs`, Chrome, bench at ratio 3, pine forest
eye level, two runs: old 24.9/23.0 ms, new 30.0/28.3, `kmax=2&card=15` 35.0/32.3, `card=15&spread=1` 36.2/42.7.
(At ratio 1.5 new had looked faster.) So denser crowns cannot be bought with more cards.

**Plant realism, what was found:**
- The domes (trees ~100–400 m, ~100 px at 4K) are the baked far body, whose window opens where the cards would
  enlarge past KMAX (oak ~190 px at KMAX 4). `?far=` only sets the latest; `?sky=`, `?bake=0` keep the dome; `?kmax=2`
  alone turns a 30 m oak into a dome. Sheets: `pine-old-vs-new.jpg`, `pine-far-switches.jpg`, `oak-near-switches.jpg`.
- The body's few corners reach about as far as the crown's leaves (REACH 0.95), so drawn as built it clips the bake to
  a smooth polygon. **WIP on this branch** (`src/scatter/trees.js`, `GROWN`, `?grown=`, default 1.4): the baked body is
  drawn grown about the crown's middle so the bake's cover sets the outline. Result (`pine-far-grown.jpg`): outlines
  are now the crown's, not the polygon, BUT bodies reach too far (foreground shrubs' far bodies hide the tent) and the
  edges speckle. Likely cause: a grown surface point is projected into the bake along the bake view's axis (8 views at
  30° up), not along the eye's ray: parallax puts cover where there is none. **Next:** project the eye ray onto each
  view's plane through the crown's middle (a true impostor lookup), or draw the far body as a camera-facing quad
  sampling the bake; then retune KMAX down (2) since a good far body can then come early and pay for the near cards.
  Not shippable as is: `?grown=1` is the old behaviour.
- Near band: `kmax=2&card=15` looks closest to old's density but costs +5–9 ms at 4K (see above).
- The bushes' stipple is the far body's texel dither (`come`/`cut` in trees.js) and the hash dissolve; untouched.

**Ground cache (option 1) cannot match at 4K:** a map is chosen by reach, so its texel is a fixed share of the
distance: 2.9–5.8 times a 4K pixel with 2048-texel maps at every distance (√2 steps: 2.9–4.1). Matching needs ~8192
texels a map, ~3 GB for six. Visible: `shots/groundcache-4k/gravel-cache-on.png` vs `-off.png`. Also it only reads
when the detail governor is ≤ 1.02 (`uLodInv > 0.98`). Recommended instead: cheaper per-pixel land, same picture.
Where the land's 4K time goes (pine eye, leave-one-out, `lx.mjs`/`loo.mjs`; those used temporary `?landx`/`?lxc`
switches that are not in the code): biome `lay()` ~8.7 ms, second takes ~5.5, stands' cover ~1, grass ~0.8, light ~4;
not texture-rate bound (anisotropy 4→1 and grad→level reads changed nothing).

**Housekeeping not done:** the remote branch deletions were left for Samuel's OK (several hold unmerged commits:
`aven/0036-shapes` 5, `aven/0033-bench-url`, `-ground-cache-fade`, `-default-old` 1 each).
