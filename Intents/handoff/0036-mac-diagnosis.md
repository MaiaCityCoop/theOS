# 0036: the library's startup hang, as seen on Samuel's Mac (2026-11-17)

This is unfinished diagnosis. No code has been changed yet.

## What was seen (next, before and after #55)

- **Chrome** (real Google Chrome via Playwright, Apple GPU): the Body URL loads in about 40 s.
  - 1 run in 3 logged `the start: the materials took more than 20 s to compile`, then the same for the shadow map's casters, and went on.
  - In the other runs every pipeline settled in under about 1 s; the Metal cache was warm.
- **Playwright WebKit** (Safari's engine):
  - It hung once at "Lighting the world" for more than 107 s, with zero console errors, while Chrome ran next to it.
  - In 6 later runs it loaded. Wrapping `GPUDevice.create*Pipeline*` showed no pending or failed pipeline.
  - On the plain library.html it reached the list once, then the page target closed at about 30 s.
- **Real Safari:**
  - Before Samuel restarted it (about 17:05), its GPU process had been up 3 d 21 h at 0 % CPU and 21 MB: a stuck graphics process, the known pattern.
  - After the restart, the local page (:5191, Body URL) posted no hitch log in 75 s. It was either stuck on the veil or a background tab; this is unconfirmed.
- **The Mac's load average was 130–210** during these runs (three sessions with browsers), which stretches every compile.

## Diagnosis so far

- **Not #51:** it doesn't touch the start's compile.
- **Not #52:** shader code at the start is the same size with and without it.
  - 8383bd0: 182 pipelines, 5821 KB of WGSL.
  - feb95f7: 182 pipelines, 5825 KB.
- **No single shader never settles.** The start compiles about 5.8 MB of WGSL serially, and the compile times add up to 15–31 s on a warm-ish cache. On a cold Metal cache, in Safari's single GPU process, under load, that can run well past 20 s.
- **The biggest pieces:**
  - **`NodeMaterial_53`:** the ground pass, `src/scatter/ground.js` `build()`, MRT `output.m0`. Fragment shader 390 KB, with the biome loop over `nodeUniform8` inlined about 9 times.
  - **`NodeMaterial_54`:** vertex shader 240 KB, fragment 151 KB with `tWorld`. Likely the terrain.
  - **Six compute pipelines** of about 150 KB each: the texture painters, `tex.ready`.

## Next

1. **Time a cold start.** Use a fresh WebKit and Chrome, with shader sources made unique so the cache is defeated.
2. **Shrink the ground pass.** Stop inlining the per-biome rules 9×: one loop, or a baked map. That shader is the 390 KB fragment.
3. **Spread the start compile.** Don't await the shadow casters and big passes serially before the veil lifts.
4. **Probe real Safari in the foreground** after each change (see the memory "theos-safari-shader-hang").

`0036-mac-shader-sizes.mjs` is the probe that was used: `bun 0036-mac-shader-sizes.mjs <url> 50`. It needs playwright@1.63.0.
