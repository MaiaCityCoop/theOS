# 0038: what a recipe makes, made once by its hash (a design, no code)

From the session "0038 dev loop · avenMAIA MacBook Sam", 2026-11-19. Written against main 1db037e3 (#402).

## The question
Samuel: "is baking the correct architecture that is scalable as we intend for the future?"

No, not baking into the build. What a recipe makes is a pure function of the recipe's version. It should be made
**once per version**, by whoever needs it first, kept under its hash, and fetched by everyone else: the browser, the
smoke, the dev server, CI. A build-time bake is one narrow case of that, and it does not reach assets that citizens
make after the build.

## What made this urgent (measured on the MacBook, 2026-11-19)
- `tools/smoke.js` went from 18 s to 113 s once it held the start's view (#402). The start's view is complete in 48 s
  on the GPU stand-in.
- The plants are in by about 7 s. The rest is the rocks: 24 kinds' coarse meshes, built in the recipes' workers 8 kinds
  a job, about 13 s a job.
- `tools/rooms.js` cold: **46 s** for 5 solids (the zoo's blobs alone 10 s), one thread, 99 % CPU. It builds every
  solid's whole cluster hierarchy at each dev start and build, keeps only the level sizes (rooms.json, 7.6 KB) and
  **throws the meshes away**.
- Every browser then builds the same hierarchies again in its workers. `src/core/kept.js` keeps them in that browser
  only (IndexedDB), so each new browser, device and cleared cache pays the full cost.
- The pre-push hook and CI's `check` job both run the smoke, so every push pays it too.

## What is there today: four places that derive from recipes
| Where | Made by | Kept | Key | Reaches |
| --- | --- | --- | --- | --- |
| rooms.json | tools/rooms.js at dev start and build | not in git, bundled | recipe version + BUILDER hash | the page (sizes only) |
| outlines.json, crowds.bin | tools/outlines.js at dev start and build (#398) | not in git, bundled into the JS | `uid:seed@version` | the page and workers |
| coarse meshes, hierarchies | the recipes' workers, in each browser | kept.js: IndexedDB, that browser only | the zoo's fingerprint | one browser |
| media for stories | Stories/scenes.js | Stories/objects/<BLAKE3>, not in git | BLAKE3 of the bytes | the studio |

The key already exists. tools/registry.js gives every recipe a BLAKE3 version over its source and everything it uses.
What is missing is one shared place for what that version makes.

## The state of the art
- **Unreal's Derived Data Cache.** Derived data (built meshes, shaders, textures) is not kept in source control. It
  lives in layered caches looked up fastest first: a local Zen store (the default since UE 5.4), a shared store on the
  network, and a cloud layer that replicates between regions. "When the buildfarm cooks, it will write any new DDC
  data to its shared layer and also to the cloud layer." Zen does not enforce access control, so Cloud DDC (OIDC,
  namespaces) is the one for untrusted networks.
  https://dev.epicgames.com/documentation/unreal-engine/using-derived-data-cache-in-unreal-engine ·
  https://dev.epicgames.com/documentation/en-us/unreal-engine/set-up-zen-storage-server-as-shared-ddc-for-unreal-engine ·
  https://forums.unrealengine.com/t/unreal-cloud-ddc-vs-zen-server-shared-ddc-on-cloud-vm/2556289
- **Unity's Accelerator** (Asset Database v2). Before importing an asset, the pipeline asks the Accelerator for the
  imported result. If it is there, the import is skipped and the result downloaded; if not, the asset is imported and
  the result uploaded. The older Cache Server keyed this by a hash of all source data.
  https://docs.unity.cn/2022.3/Documentation/Manual/UnityAccelerator.html ·
  https://docs.unity3d.com/es/Manual/CacheServer.html
- **Bazel's remote cache (REAPI).** Two stores: an action cache from the digest of the whole action (inputs, tool,
  arguments) to its result, and a content-addressable store from the digest of the bytes to the bytes. An action
  cache hit whose bytes are missing counts as a miss.
  https://docs.bazel.build/versions/2.0.0/remote-caching.html · https://bazel.virtuslab.com/book/6~2~1/ ·
  https://github.com/buchgr/bazel-remote
- **Building cluster hierarchies** (meshoptimizer's clusterlod, Nanite's method). Each mesh is independent: the work
  splits across meshes with no shared data. Sorting meshes largest first raised one run's CPU use from ~1250 % to
  ~1575 % on 16 threads. 1.64 billion triangles built in about 2 m 40 s, so the cost is real but finite, and paid
  once per mesh version. (Zeux, 2025.)
  https://zeux.io/2025/09/30/billions-of-triangles-in-minutes/
- **On the web.** A file named by its hash is served with `Cache-Control: public, max-age=31536000, immutable`; the
  short-lived page names the current hashes. For large binaries in the browser, Chrome's guidance prefers the Cache
  API (or the Origin Private File System) over IndexedDB, which pays for serialisation and transactions on large
  ArrayBuffers.
  https://developer.chrome.com/docs/ai/cache-models ·
  https://barndoors.lumafield.com/3x-faster-project-loads-with-the-origin-private-file-system/

## The options weighed
1. **Bake into the build** (extend #398 to the meshes). Fastest to write. But every deploy rebakes the whole catalog
   for every device class, bundles grow with the catalog, and a citizen's asset made after the build has no bake: it
   falls back to the workers, a second path.
2. **Only the browser's cache** (kept.js as it is). Every new browser and device pays the full cost, the phone most of
   all. The smoke and CI never benefit.
3. **One store by hash, made once, layered** (Unreal's DDC, Unity's Accelerator, Bazel's AC + CAS). Chosen.

## The design
- **The key** (Bazel's action key): BLAKE3 of the recipe's version (tools/registry.js), the maker's own hash (what is
  BUILDER in tools/rooms.js today: the kits and code that build) and the output's format. A change to any of them is
  a new key; nothing is invalidated, the old key simply goes unasked.
- **The value** (Bazel's CAS): the bytes, named by their own BLAKE3, so any copy can be checked. A small index maps
  key → bytes' hash. This is how Stories/objects already works.
- **One maker.** The same code that builds in the workers today (assets/kit/clusters.js, meshoptimizer's WebAssembly)
  is the only maker, wherever it runs. No second path: a miss runs the maker, and the result is put in the store.
- **Layers, fastest first:**
  1. the page: the Cache API (or OPFS), replacing kept.js's IndexedDB;
  2. the shared store: immutable hashed URLs on next's host or an object store, served with `immutable`;
  3. the maker, on a miss.
- **Who may write the shared layer.** CI on every merge to main, and later a publish step for a citizen's asset (with
  play's asset proposals). A browser never writes it: an open write would let anyone poison every player's world, which
  is why Unreal keeps unauthenticated Zen off untrusted networks. A browser only fills its own cache.
- **The dev loop.** The dev server serves a local folder of the same store (beside Stories/objects, not in git), and
  CI keeps one as a cache. The smoke's start view and a dev start then fetch what is there and build only what changed.
  A changed recipe has a new key, so the smoke still builds exactly what it must test.
- **What it replaces.** rooms.json's sizes, outlines.json and crowds.bin become entries in the store (or are read from
  the stored hierarchies), so neither the build nor the bundle carries them. kept.js becomes the page's layer. One path
  for everything a recipe makes.

## Determinism: the one thing that must hold
A store by key is only right if the maker gives the same bytes for the same key on every machine. Unreal's forum has a
case of a key that was not stable across launches and served a blank texture. So stage 1's check builds every entry
twice, in two processes, and compares the hashes. A difference fails, with the entry named.

## Stages, each shippable on its own
| Stage | What | Check |
| --- | --- | --- |
| 1 | The store and the key: `tools/made.js` (put, get, verify by hash) and the dev server's local layer. The determinism check | every entry built twice gives the same hash |
| 2 | The rocks' and made things' hierarchies through it: tools/rooms.js puts the meshes it already builds, and the workers fetch before they build | smoke's start view from 48 s to under 10 s on a warm store; rooms.js warm under 1 s |
| 3 | rooms.json, outlines.json and crowds.bin as entries; the bundle no longer carries them | bundle bytes down; outlines read on next, none measured at runtime |
| 4 | The page's layer: kept.js onto the Cache API | a second start fetches nothing and builds nothing |
| 5 | The shared layer: CI writes on merge, next serves it immutable | a fresh browser builds none of the rocks' coarse meshes |
| 6 | The publish step for citizens' assets (with play) | an asset made after the build is fetched, not built, by a second player |

Beside them, independent: tools/rooms.js builds its solids one after another on one thread. They are independent, so
spreading them over every core, largest first, cuts the cold 46 s by about as many cores as the machine has. That is a
quick win for every cold dev start, whatever the store.

## The 10 % gate (baselines, the MacBook, 2026-11-19)
- smoke, whole: 113 s; its start view: 48 s
- tools/rooms.js cold: 46 s
- the rocks' coarse meshes in a fresh browser: about 40 s of worker time

## Open, for Samuel
- Where the shared layer lives: next's own host, or an object store (R2, S3, Neon's storage) behind it.
- Whether a citizen's asset is made by its author's device and checked, or made only by a trusted maker. The safe
  default is the trusted maker.
