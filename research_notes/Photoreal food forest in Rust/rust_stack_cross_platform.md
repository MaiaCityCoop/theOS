# Rust-native 3D stack (Bevy, wgpu, Tauri 2) for one vegetation-heavy engine on iOS, Android, macOS, Windows and Linux: readiness as of 2026-11-19

*Reading notes for the report writer.* Research date: 2026-11-19. Each cited finding carries a label: **[M]** = measured or published fact (version, date, number, code, reference docs); **[C]** = maintainer or vendor claim; **[R]** = third-party or community report. "Possibly outdated" marks software facts older than one year (before 2025-11-19). My own conclusions are only in the "Inferences" blocks. Two method limits: (1) pages were read through a summarising fetch tool, so literal quotes should be re-checked before publication; (2) the session's web-search budget ran out part-way, so several planned searches (shipped Bevy mobile games, Unreal/Unity mobile details, compile-time numbers, a wider Rust engine survey) could not be run and were replaced by direct fetches of known primary pages. Those holes are listed under "Gaps".

## 1. Bevy 0.20 (and the branch toward 0.21): renderer status, platform matrix, measured phone performance

### Takeaway
Bevy 0.20 (2026-10-08, on wgpu 30) is a strong and fast-improving desktop Vulkan renderer, but its GPU-driven features thin out on exactly the target phones: GPU preprocessing is switched off in code on Adreno 730 and older (except 720) and on Mali drivers below version 48, Metal has no multi-draw-indirect-count, meshlets need 64-bit texture atomics (about 36% of Android devices), and there is no mobile upscaler, terrain, streaming or large-world system in the engine. I found no published frame-time measurement of any Bevy 3D scene on a phone.

### Cited Findings

**Versions and cadence**
- [M] Release dates: 0.16 on 2025-04-24, 0.17 on 2025-09-30, 0.18 on 2026-01-13, 0.19 on 2026-06-19, 0.20 on 2026-10-08; gaps of roughly 5.2, 3.5, 5.2 and 3.7 months. — [Bevy 0.16](https://bevy.org/news/bevy-0-16/), [Bevy 0.17](https://bevy.org/news/bevy-0-17/), [Bevy 0.18](https://bevy.org/news/bevy-0-18/), [Bevy 0.19](https://bevy.org/news/bevy-0-19/), [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [M] docs.rs "latest" is Bevy 0.20.1. — [docs.rs meshlet module](https://docs.rs/bevy/latest/bevy/pbr/experimental/meshlet/index.html)
- [M] `bevy_render` 0.20.0 depends on `wgpu ^30` and `wgpu-types ^30`. — [crates.io dependency API](https://crates.io/api/v1/crates/bevy_render/0.20.0/dependencies)
- [C] A core rendering contributor wrote in August 2026 that 0.19 was "very delayed from our typical 3 month schedule". — [jms55, Bevy's Sixth Birthday](https://jms55.github.io/posts/2026-08-29-bevy-sixth-birthday/)

**GPU-driven rendering and multi-draw indirect**
- [C, possibly outdated: April 2025] 0.16 introduced GPU-driven rendering, enabled automatically on supported platforms; the Caldera hotel "heavy" section went from 33.55 ms to 10.16 ms on a laptop Nvidia 4090 (Vulkan, Linux). — [Bevy 0.16](https://bevy.org/news/bevy-0-16/)
- [M, possibly outdated: April 2025] The 0.16 platform table: Windows and Linux Vulkan have GPU transform, multi-draw plus GPU culling, and bindless; macOS and iOS (Metal) have GPU transform, **no** multi-draw/GPU cull, and partial bindless ("limits are currently much lower"); WebGPU has GPU transform only; WebGL 2 has none; on Android "some drivers known to cause bugs are denylisted and fall back to CPU-driven rendering". — [Bevy 0.16](https://bevy.org/news/bevy-0-16/)
- [M] Current `main` source: GPU preprocessing is `None` (CPU fallback) when compute is missing, the backend is GL, or the device is a "non supported Android device", defined as Adreno model `<= 730` except `720`, or a Mali driver version below 48. Pixel 10 GPUs are limited to "preprocessing only (no culling)". Full `Culling` mode needs the features `INDIRECT_FIRST_INSTANCE | IMMEDIATES`, the `COMPUTE_SHADERS` downlevel flag, at least 12 storage textures and 10 storage buffers per shader stage. — [bevy_render gpu_preprocessing.rs on main](https://raw.githubusercontent.com/bevyengine/bevy/main/crates/bevy_render/src/batching/gpu_preprocessing.rs)
- [M, possibly outdated: May 2024] The denylist began with a segfault on an Adreno 610 (Android 11); reviewer comment: "Bizarre that it happens, but oh well. Such is Android graphics drivers." It was later widened to "Adreno 730 and earlier" (PR #14176). — [Bevy PR #13323](https://github.com/bevyengine/bevy/pull/13323)
- [M] wgpu 30.0.2 lists `MULTI_DRAW_INDIRECT_COUNT` for DX12 and Vulkan 1.2+ only; Metal is not listed. — [wgpu Features docs](https://docs.rs/wgpu/latest/wgpu/struct.Features.html)
- [C] 0.19 measurements published by the project (hardware not stated in the notes): `many_cubes` (1.6 M cubes, about 116 k in view) 49.5 ms to 18.8 ms with culling; `bevy_city` (about 55 k rendered entities) 19.3 ms to 11.8 ms static; GPU light clustering about 20x faster on `many_lights`; batch-set "bin unpacking" moved to the GPU for multi-draw-indirect. — [Bevy 0.19](https://bevy.org/news/bevy-0-19/)
- [C] 0.20 adds opt-in per-column change ticks with a reported 132x speed-up in GPU mesh extraction code, and `chain_weak` ordering for more render-world parallelism. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/)

**Bindless on Metal**
- [M/C] 0.19: bindless is now enabled per material need, so texture-only bindless works on Metal; "Metal (via wgpu) supports texture binding arrays but not buffer binding arrays", so materials using `#[uniform(..., binding_array(...))]` degrade on Metal; Metal has a 31 argument-buffer-slot limit. Bistro Exterior (698 materials): Apple M2 Max +15% frame speed and 57 MB less RAM; Nvidia 5060 Ti +46%. — [Bevy 0.19](https://bevy.org/news/bevy-0-19/)
- [R] A reviewer on the underlying PR expected the change to "noticeably help macOS/iOS performance". — [Bevy PR #23436](https://github.com/bevyengine/bevy/pull/23436)
- [M] wgpu 30.0.0 (2026-07-01) lists "bindless storage buffers (buffer binding arrays)" for Metal, but the 30.0.2 reference docs still list `BUFFER_BINDING_ARRAY` as Vulkan only and `STORAGE_RESOURCE_BINDING_ARRAY` as Metal (MSL 2.2+, "macOS 10.13+") plus Vulkan. The two sources do not line up cleanly. — [wgpu CHANGELOG](https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/CHANGELOG.md); [wgpu Features docs](https://docs.rs/wgpu/latest/wgpu/struct.Features.html)

**GPU occlusion culling**
- [M, possibly outdated: April 2025] Introduced as experimental in 0.16 (add `DepthPrepass` and `OcclusionCulling` to the camera); known precision issues; can be slower on small scenes. — [Bevy 0.16](https://bevy.org/news/bevy-0-16/)
- [M] The 0.18 to 0.19 migration guide contains the entry "Occlusion culling no longer experimental". — [Bevy 0.18 to 0.19 migration guide](https://bevy.org/learn/migration-guides/0-18-to-0-19/)
- [M] It depends on the `Culling` preprocessing mode ("Depth downsampling for occlusion culling requires 12 textures and the early occlusion culling pass requires 10 storage buffers"), so it is unavailable on the denylisted Android devices and on Pixel 10. — [gpu_preprocessing.rs on main](https://raw.githubusercontent.com/bevyengine/bevy/main/crates/bevy_render/src/batching/gpu_preprocessing.rs)

**Meshlets (virtual geometry)**
- [M] Bevy 0.20.1 docs: still under `bevy::pbr::experimental::meshlet`; "requires a fairly recent GPU that supports `WgpuFeatures::TEXTURE_INT64_ATOMIC`"; "currently works only on the Vulkan and Metal backends"; not compatible with MSAA; "Much greater base overhead. Rendering will be slower and use more memory than Bevy's standard renderer" on simple scenes; meshes must be preprocessed into `MeshletMesh`; material choice is limited. — [MeshletPlugin docs](https://docs.rs/bevy/latest/bevy/pbr/experimental/meshlet/struct.MeshletPlugin.html)
- [M] `TEXTURE_INT64_ATOMIC` in wgpu 30: Vulkan with `VK_EXT_shader_image_atomic_int64`, DX12 with SM 6.6+, Metal with MSL 3.1+. — [wgpu Features docs](https://docs.rs/wgpu/latest/wgpu/struct.Features.html)
- [M] `VK_EXT_shader_image_atomic_int64` device coverage on Android: 36.49%. — [vulkan.gpuinfo.org, Android extensions](https://vulkan.gpuinfo.org/listextensions.php?platform=android)
- [C] 0.17 added BVH-based culling for meshlets; "asset streaming is not yet implemented" and total instance count is "temporarily limited". — [Bevy 0.17](https://bevy.org/news/bevy-0-17/)
- [C] The meshlet author hoped in September 2025 to "finally take virtual geometry out of experimental status later this year"; in August 2026 he was not working on it and wrote he might "potentially go back to virtual geometry" next year. — [jms55, Fifth Birthday](https://jms55.github.io/posts/2025-09-03-bevy-fifth-birthday/); [jms55, Sixth Birthday](https://jms55.github.io/posts/2026-08-29-bevy-sixth-birthday/)
- [M, possibly outdated: March 2025] Meshlets rasterise into an R64Uint/R32Uint storage texture with texture atomics (visibility buffer of packed depth, cluster ID, triangle ID); the post does not mention mesh shaders. — [jms55, Virtual Geometry in Bevy 0.16](https://jms55.github.io/posts/2025-03-27-virtual-geometry-bevy-0-16/)

**Mesh shaders**
- [C] 0.20 integrates mesh shaders with the pipeline cache (`MeshPipelineDescriptor`, `draw_mesh_tasks`); described as "initial base support", not on web, with `StandardMaterial` integration as future work; listed use cases include meshlets and procedural grass. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [M] `VK_EXT_mesh_shader` device coverage on Android: 5.83%. — [vulkan.gpuinfo.org](https://vulkan.gpuinfo.org/listextensions.php?platform=android)

**Atmosphere, fog, reflections, AO, shadows, probes, GI**
- [C] Atmosphere: procedural scattering since 0.16 (the notes say it "should work well on mobile and WebGPU", an expectation, not a test); 0.17 added a raymarched mode, `SunDisk` and `AtmosphereEnvironmentMapLight` (light probes not supported with it); 0.18 added atmosphere occlusion and PBR shading, integration with volumetric fog, and a `ScatteringMedium` asset; 0.20 supports multiple cameras. — [Bevy 0.16](https://bevy.org/news/bevy-0-16/); [Bevy 0.17](https://bevy.org/news/bevy-0-17/); [Bevy 0.18](https://bevy.org/news/bevy-0-18/); [0.19 to 0.20 migration guide](https://bevy.org/learn/migration-guides/0-19-to-0-20/)
- [C] 0.19 added contact shadows (short screen-space raycasts for directional, point and spot lights; cost scales with lit pixels), a physically based SSR, rectangular area lights (no shadows) and parallax-corrected reflection probes. — [Bevy 0.19](https://bevy.org/news/bevy-0-19/)
- [M, version of the snippet not confirmed] Source docs state SSAO "is not supported on WebGL2, and not currently supported on WebGPU", SSR is "currently only supported with deferred rendering", and volumetric fog only interacts with directional lights that have shadow maps. — [bevy_pbr ssao source mirror](https://doc.qu1x.dev/bevy_trackball/src/bevy_pbr/ssao/mod.rs.html); [bevy_pbr ssr source mirror](https://doc.qu1x.dev/bevy_trackball/src/bevy_pbr/ssr/mod.rs.html); [bevy_pbr volumetric fog source mirror](https://doc.qu1x.dev/bevy_trackball/src/bevy_pbr/volumetric_fog/mod.rs.html)
- [C] Solari (real-time ray-traced lighting) in 0.20: runs on macOS via Metal but "has no built-in denoiser there"; supports directional lights, emissive meshes, atmosphere and environment-map light, not yet point, spot or rect lights; no animated meshes, alpha-masked or transparent materials. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/); [jms55, Solari in 0.20](https://jms55.github.io/posts/2026-09-18-solari-bevy-0-20/)
- [M] The 0.16 to 0.20 release notes mention no real-time global illumination other than Solari. — [Bevy 0.16](https://bevy.org/news/bevy-0-16/); [Bevy 0.17](https://bevy.org/news/bevy-0-17/); [Bevy 0.18](https://bevy.org/news/bevy-0-18/); [Bevy 0.19](https://bevy.org/news/bevy-0-19/); [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [M] `VK_KHR_ray_query` device coverage on Android: 26.27%; `VK_KHR_acceleration_structure`: 26.54%. — [vulkan.gpuinfo.org](https://vulkan.gpuinfo.org/listextensions.php?platform=android)
- [M, possibly outdated: April 2025] Clustered decals need bindless textures and were unavailable on WebGL 2, WebGPU, iOS and Mac in 0.16. — [Bevy 0.16](https://bevy.org/news/bevy-0-16/)

**Anti-aliasing and upscalers**
- [C] DLSS arrived in 0.17: Nvidia RTX only, "currently requires running via the Vulkan backend on Windows/Linux (no DirectX, macOS, web, or mobile support)". FSR, XeSS and MetalFX were "not integrated". — [Bevy 0.17](https://bevy.org/news/bevy-0-17/)
- [C] In 0.20 FSR and MetalFX are still not implemented; MetalFX ray reconstruction is named only as a possible future macOS denoiser. FSR4 is blocked because "AMD has not released any Vulkan bindings". — [Bevy 0.20](https://bevy.org/news/bevy-0-20/); [jms55, Sixth Birthday](https://jms55.github.io/posts/2026-08-29-bevy-sixth-birthday/)
- [C] Bevy has a built-in TAA (referred to in the DLSS comparison). — [Bevy 0.17](https://bevy.org/news/bevy-0-17/)

**Large worlds, terrain, streaming, asset processing**
- [M] Large-world support is third-party: `big_space` (floating origin on integer grids, 415 stars) lists Bevy 0.19 with big_space 0.13 as its newest pairing; no 0.20 row at fetch time. — [big_space](https://github.com/aevyrie/big_space)
- [M] No first-party terrain system appears in the 0.16 to 0.20 release notes. — [Bevy 0.19](https://bevy.org/news/bevy-0-19/); [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [C] "Built-in texture/mesh streaming" is a stated future plan, not shipped. — [jms55, Sixth Birthday](https://jms55.github.io/posts/2026-08-29-bevy-sixth-birthday/)
- [C] 0.20 asset processing: `CompressedImageSaver` on the `ctt` library produces BCn for desktop (BC4, BC6H, BC7 chosen automatically) or ASTC for mobile (selected with the `BEVY_COMPRESSED_IMAGE_SAVER_ASTC` environment variable, all 14 block sizes) with full mip chains; Basis Universal/UASTC remains for cross-platform distribution. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [C] 0.19 added render recovery: a `RenderErrorHandler` policy per error type (for example `DeviceLost` to `Recover`, which reinitialises the renderer). — [Bevy 0.19](https://bevy.org/news/bevy-0-19/)

**Branch toward 0.21**
- [M] Draft release notes on `main` (listing may be incomplete) are dominated by UI and editor work (Feathers tabs, tree view, split panes, docking, incremental UI layout) and Bevy Remote Protocol items (`brp_input_click`, `brp_query_name_path`, `inspection`); the only rendering entries are equirectangular cubemaps and a wireframe cull mode; nothing mobile-specific. — [bevy _release-content/release-notes](https://github.com/bevyengine/bevy/tree/main/_release-content/release-notes)
- [C] Stated plans (not commitments): HDR display support, higher-level material APIs, unifying 2D and 3D renderers, built-in streaming, more volumetrics; for Solari more light types and a macOS denoiser; `.bsn` scene format, assets as entities, a remote inspector. — [jms55, Sixth Birthday](https://jms55.github.io/posts/2026-08-29-bevy-sixth-birthday/); [Bevy 0.20](https://bevy.org/news/bevy-0-20/)

**Measured performance on phones**
- [M] Bevy's example-runs site lists a "Bevy Mobile Example" row across Android and iOS devices from Pixel 6 to iPhone 17; the search snippet shows pass/fail scaffolding and no FPS figures (the page is over 10 MB and could not be fetched). — [example-runs.bevy.org](https://example-runs.bevy.org/)
- [M] Bevy's metrics dashboard (live since December 2025; last update 2026-11-19) benchmarks on two desktop machines (Ryzen 9 9950X, RTX 3060, 64 GB); no phone hardware. — [metrics.bevy.org](https://metrics.bevy.org/)
- [M] The 0.17, 0.18, 0.19 and 0.20 release notes contain no dedicated mobile rendering section or mobile benchmark. — [Bevy 0.17](https://bevy.org/news/bevy-0-17/); [Bevy 0.18](https://bevy.org/news/bevy-0-18/); [Bevy 0.19](https://bevy.org/news/bevy-0-19/); [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [R] The only shipped-mobile signals found: Bevy's Mastodon account reposted a developer whose first Bevy game was in closed beta on Google Play (undated), and a 2023 blog on publishing a Bevy app to both stores (possibly outdated). — [Bevy on Mastodon](https://mastodon.social/@bevy); [Nikl, mobile development with Bevy #2](https://www.nikl.me/blog/2023/notes_on_mobile_development_with_bevy_2/)
- [R, possibly outdated: January 2025] A community thread noted that Bevy by default runs its systems as fast as it can even when rendering is capped at 60 Hz, which matters for battery and heat. — [r/bevy, Bevy efficiency on mobile](https://www.reddit.com/r/bevy/comments/1hsj5s3/bevy_efficiency_on_mobile/)

**Platform matrix (compiled from the sources above; "unverified" = no source found)**

| Feature (Bevy 0.20 unless noted) | Vulkan desktop | Metal macOS | Metal iOS | Vulkan Android |
|---|---|---|---|---|
| GPU preprocessing (transforms on GPU) | Yes | Yes (0.16 table) | Yes (0.16 table) | Only off the denylist: not Adreno 730 or older (720 allowed), Mali driver 48+; otherwise CPU fallback |
| Multi-draw indirect + GPU culling | Yes | "No" in the 0.16 table; MDI-count absent on Metal in wgpu 30; 0.20 state unverified | Same as macOS; unverified | Device-dependent; Pixel 10 has no culling; `VK_KHR_draw_indirect_count` on 67.63% of devices |
| GPU occlusion culling (stable since 0.19) | Yes | Unverified | Unverified | Only where full `Culling` mode is granted |
| Bindless materials | Full | Texture arrays; buffer arrays missing or unclear | Unverified | Not stated |
| Meshlets (experimental) | Yes, with 64-bit texture atomics | Listed backend; needs MSL 3.1+ | Unverified | Needs an extension present on 36.49% of devices |
| Mesh shaders (base support) | Vulkan with `VK_EXT_mesh_shader`, DX12 | Metal (wgpu 30) | Unverified | Extension on 5.83% of devices |
| Solari ray tracing | Yes on RT GPUs; denoiser is DLSS-RR (Nvidia) | Runs, no denoiser | Not stated | Not stated; ray query on 26.27% of devices |
| DLSS | Nvidia RTX, Vulkan on Windows/Linux | No | No | No |
| FSR, MetalFX | Not implemented | Not implemented | Not implemented | Not implemented |
| Atmosphere, volumetric fog, SSR, SSAO, contact shadows, TAA | Available | No gating found | Unverified on device | Unverified on device |
| Terrain, streaming, floating origin | Not built in | Not built in | Not built in | Not built in |

Sources for the table: [Bevy 0.16](https://bevy.org/news/bevy-0-16/), [Bevy 0.17](https://bevy.org/news/bevy-0-17/), [Bevy 0.19](https://bevy.org/news/bevy-0-19/), [Bevy 0.20](https://bevy.org/news/bevy-0-20/), [gpu_preprocessing.rs](https://raw.githubusercontent.com/bevyengine/bevy/main/crates/bevy_render/src/batching/gpu_preprocessing.rs), [MeshletPlugin docs](https://docs.rs/bevy/latest/bevy/pbr/experimental/meshlet/struct.MeshletPlugin.html), [wgpu Features docs](https://docs.rs/wgpu/latest/wgpu/struct.Features.html), [vulkan.gpuinfo.org](https://vulkan.gpuinfo.org/listextensions.php?platform=android).

### Inferences
- Bevy's renderer has three classes of Android phone: full GPU-driven (roughly Adreno 740 and newer, Mali with driver 48+), preprocessing without culling (Pixel 10), and CPU-driven fallback (everything older or on GL). "8 GB RAM" does not pick a class: many 8 GB phones carry mid-range chips whose Adreno model number is 730 or lower. The denylist exists because of real crashes, so a custom GPU-driven renderer on wgpu faces the same drivers without that list.
- Everything that makes a forest renderer (terrain, grass and foliage instancing with GPU LOD selection, impostors, wind, streaming, floating origin) is absent from Bevy and would be custom code under any of the engine-base options.
- Meshlets are not a phone path in 2026: experimental, not actively developed, heavy fixed overhead, missing streaming, and dependent on a feature most Android devices lack.
- There is no real-time global illumination for phones in Bevy. The phone tier needs analytic sky light plus probes or baked data.
- On iOS and Mac, the absence of multi-draw-indirect-count means one indirect draw per batch even when culling runs on the GPU. That is workable but raises CPU-side draw submission compared with Vulkan.
- With no MetalFX or FSR integration, a phone build has no engine-provided temporal upscaler; rendering at reduced resolution would rely on Bevy's TAA or custom code.

### Gaps
- No measured phone frame times for Bevy were found. The example-runs page could not be fetched (size), and the search budget ended before a wider hunt for community benchmarks and shipped 3D mobile titles.
- Whether Bevy 0.20 reaches `Culling` mode on iOS/Metal is unverified: the 0.16 table says no, while the current code gates on features that wgpu lists for Metal. A device log line ("GPU preprocessing is fully supported on this device.") would settle it.
- Whether Bevy 0.20 uses wgpu 30's Metal storage-buffer binding arrays is unverified; the wgpu changelog and reference docs disagree.
- Irradiance volumes and the exact TAA, SSAO and volumetric-fog behaviour on phones were not re-verified in this session.
- The draft-notes listing for 0.21 may be incomplete; merged 0.21 pull requests were not reviewed.

## 2. wgpu on mobile: version, feature gaps on iOS Metal and Android Vulkan, driver problems

### Takeaway
wgpu 30.0.2 (2026-11-12) treats Vulkan on Android and Metal on iOS as first-class, and compute, indirect draws and pass-level timestamp queries exist on both. The gaps that matter for a GPU-driven renderer are on Metal (no multi-draw-indirect-count, no partially bound binding arrays, pipeline cache unimplemented, no MetalFX exposure) and in Android driver quality, where maintainers have open, unresolved Adreno and Mali bugs and little test hardware.

### Cited Findings

**Version and cadence**
- [M] Latest release v30.0.2 on 2026-11-12 (bug fixes: device-loss use-after-free, Metal colour-space crash). v30.0.0 on 2026-07-01, v28.0.0 on 2025-12-17, v27.0.0 on 2025-10-01, v26.0.0 on 2025-07-09. An "Unreleased" section sits above v30.0.2. — [wgpu CHANGELOG](https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/CHANGELOG.md)
- [C] The README says a breaking version ships "roughly every three months"; MSRV for the `wgpu` crate is Rust 1.87. — [wgpu README](https://github.com/gfx-rs/wgpu)
- [M] Support tiers: Vulkan first-class on Windows and Linux/Android; Metal first-class on macOS/iOS; OpenGL ES 3.0+ "downlevel/best effort" on Android; no minimum Android API level or Vulkan version is stated. — [wgpu README](https://github.com/gfx-rs/wgpu)

**What v28 to v30 added**
- [M] v30.0.0: Metal "full mesh shader support, including WGSL"; Metal bindless storage buffers; `i16`/`u16` shader types; explicit HDR surface colour spaces; BLAS support for procedural AABB geometry. — [wgpu CHANGELOG](https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/CHANGELOG.md)
- [M] v29.0.0: ray-tracing acceleration structures on the Metal backend; a one-second foreground delay on Metal fixed; workaround for a Metal driver bug with atomic textures; buffer binding size limits widened to 64-bit. — [wgpu CHANGELOG](https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/CHANGELOG.md)
- [M] v28: mesh shaders (full on Vulkan, passthrough on Metal and DX12); binding arrays of storage textures on Metal; push constants renamed to "immediates"; Vulkan allocator switched to gpu-allocator. v28.0.1: "fixed a crash on some Mali drivers (Vulkan)". — [wgpu CHANGELOG](https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/CHANGELOG.md)
- [M] v27: the `MULTI_DRAW_INDIRECT` feature flag was removed; multi-draw indirect is available wherever indirect execution is; an Android EGL context creation failure was fixed. — [wgpu CHANGELOG](https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/CHANGELOG.md)

**Feature availability in wgpu 30.0.2 reference docs**

| Feature | Listed platforms | Mobile meaning |
|---|---|---|
| `MULTI_DRAW_INDIRECT_COUNT` | DX12, Vulkan 1.2+ | Not on Metal (iOS, macOS) |
| `INDIRECT_FIRST_INSTANCE` | Vulkan (mostly), DX12, Metal on Apple3+ or Mac1+ | Available; not on GLES |
| `TIMESTAMP_QUERY` | Vulkan, DX12, Metal | Pass-boundary timing available |
| `TIMESTAMP_QUERY_INSIDE_PASSES` / `_INSIDE_ENCODERS` | Vulkan, DX12, Metal on AMD and Intel "not Apple GPUs" | "Generally not available on tile-based rasterization GPUs" |
| `TEXTURE_BINDING_ARRAY` | DX12, Metal (MSL 2.0+, "macOS 10.13+"), Vulkan | iOS not named in the text |
| `BUFFER_BINDING_ARRAY` | Vulkan | Not on Metal per docs |
| `PARTIALLY_BOUND_BINDING_ARRAY` | Vulkan, DX12 | Not on Metal |
| `EXPERIMENTAL_MESH_SHADER` | Vulkan (`VK_EXT_mesh_shader`), DX12, Metal | Note says naga only on Vulkan, passthrough elsewhere |
| `EXPERIMENTAL_RAY_QUERY` | Vulkan | Flagged as possibly buggy and breaking |
| `TEXTURE_INT64_ATOMIC` | Vulkan (extension), DX12 SM 6.6+, Metal MSL 3.1+ | Needed by Bevy meshlets |
| `TEXTURE_COMPRESSION_ASTC` | Vulkan on Intel, "Mobile (some)", WebGPU | Query per device |
| `TEXTURE_COMPRESSION_BC` | Desktops, "All Apple9 and some Apple7 and Apple8 devices" | Not on most phones |
| `PIPELINE_CACHE` | Vulkan; DX12 and Metal "unimplemented" | Android only |
| `IMMEDIATES`, `SHADER_F16`, `MULTIVIEW` | Vulkan, DX12, Metal (and more) | Available |

— [wgpu Features docs](https://docs.rs/wgpu/latest/wgpu/struct.Features.html)

**Android device coverage of Vulkan extensions (share of devices in the database)**
- [M] `VK_KHR_draw_indirect_count` 67.63%; `VK_EXT_descriptor_indexing` 77.91%; `VK_KHR_timeline_semaphore` 83.61%; `VK_KHR_dynamic_rendering` 59.19%; `VK_EXT_texture_compression_astc_hdr` 82.99%; `VK_EXT_memory_budget` 8.57%; `VK_KHR_fragment_shading_rate` 44.17%; `VK_KHR_shader_atomic_int64` 41.29%; `VK_EXT_shader_image_atomic_int64` 36.49%; `VK_KHR_ray_query` 26.27%; `VK_EXT_mesh_shader` 5.83%; `VK_GOOGLE_display_timing` 97.39%. The page does not date the data or say whether shares are of reports or of distinct devices. — [vulkan.gpuinfo.org, Android extensions](https://vulkan.gpuinfo.org/listextensions.php?platform=android)

**Open Android and Metal problems in the wgpu tracker**
- [M] Open issues matching Android, Adreno or Mali include: #10621 "Adreno X1-85 Vulkan: incorrect field read when passing a struct by value" (2026-10-14, driver bug, data corruption); #10186 "ARM64 Mali on Android segfaults from transpiled WGSL when `texture_2d<f32>` ... appears as a function parameter" (2026-08-27); #8801 "draw_indexed_indirect silently fails on Quest 3/2 (Adreno 740/650)" (2026-01-01); #8937 "`glPushDebugGroup` crash on Android GLES devices" (2026-01-26); #2252 "Indexing into a private array does not work on Android/Vulkan" (open since 2021); #5738 "[Metal] Render/Compute pass forces command buffer finish at the end" (performance, open since 2024-05-24). — [wgpu issue list](https://github.com/gfx-rs/wgpu/issues?q=is%3Aissue+is%3Aopen+android+%28adreno+OR+mali%29)
- [M/R] #8801 detail: indirect and multi-draw-indirect draws produce nothing and raise no error on Quest 3 and Quest 2 with wgpu 27 and 28, while the features are advertised; the same test rendered correctly on a Galaxy S24 (Adreno 750) and an LG G8 (Adreno 640). Maintainer: "I don't think any of the maintainers have a quest 3" and "we have very little ability to resolve this". Still open. — [wgpu issue #8801](https://github.com/gfx-rs/wgpu/issues/8801)
- [R] #10186 detail: crash on a Pixel 7 Pro (Mali, GrapheneOS) at wgpu tip; not reproduced on a Samsung A32 (Mali-G52); no maintainer reply; open. — [wgpu issue #10186](https://github.com/gfx-rs/wgpu/issues/10186)
- [R] Other engines and libraries report the same class of driver fault (thread dates not all confirmed): random `VK_ERROR_DEVICE_LOST` on Galaxy S24 Ultra (Adreno 750) in Unreal; a Mali-G925 driver 49.1.0 crash in Vulkan sync calls (2026). — [Unreal forum, Adreno 750 crashes](https://forums.unrealengine.com/t/random-vulkan-gpu-crashes-on-adreno-750-android/2737750); [Arm community, Mali-G925 crash](https://community.arm.com/support-forums/f/mobile-graphics-and-gaming-forum/57769/mali-g925-driver-49-1-0-sigsegv-in-libgles_mali-so-on-every-cpu-side-vulkan-sync-api-vkwaitforfences-vkwaitsemaphores-vkgetsemaphorecountervalue-vkqueuewaitidle-after-compute-swapchain-submit)
- [R, possibly outdated: 2021] Metal has no native indirect-count draw; Apple forum posters describe a loop of indirect draws or Indirect Command Buffers as the substitute, one reporting a 3x slowdown on the same hardware. — [Apple Developer Forums thread 668171](https://developer.apple.com/forums/thread/668171)

**MetalFX, memory, API levels**
- [M] None of the wgpu changelog sections read (v24 to v30) mention MetalFX. Raw Metal access exists (raw texture handle access since v24, render layer exposed in v28). — [wgpu CHANGELOG](https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/CHANGELOG.md)
- [M] Bevy's Android example sets `minSdk` 26 (required by `bevy_audio`), targets API 37, and builds with `cargo ndk -P 26`. — [Bevy examples README](https://raw.githubusercontent.com/bevyengine/bevy/main/examples/README.md)

### Inferences
- Per-pass GPU budgets can be measured on phones only at pass boundaries. That fits a frame graph of a few well-defined passes and argues against many small passes, which tile-based GPUs dislike anyway.
- Memory budgeting on Android must be self-accounted: the driver memory-budget extension exists on under 9% of devices.
- Pipeline caching to disk is available through wgpu on Android only. Shader-compile hitches on iOS have to be handled by warming pipelines at load.
- Texture delivery needs two encodings (ASTC for phones, BCn for desktop) or a transcoding format; no single GPU format covers all five platforms.
- Reaching MetalFX from a wgpu renderer means dropping to raw Metal objects and writing platform-specific code; nothing in wgpu wraps it.
- wgpu's maintainers lack some of the hardware their users ship on. A team targeting phones should expect to bisect driver bugs itself and keep CPU or non-indirect fallbacks.

### Gaps
- wgpu's reference docs and changelog disagree on three points: mesh shaders through WGSL on Metal, ray queries on Metal (docs list Vulkan only, yet Bevy 0.20 runs Solari on Metal), and buffer binding arrays on Metal. Which is current was not resolved.
- Whether binding arrays, 64-bit atomics and mesh shaders work on iOS specifically (as opposed to macOS) is not stated in the docs read.
- No written wgpu roadmap or v31 date was found; the last major release is over four months old against a stated three-month cadence.
- Memory behaviour under iOS jetsam limits and Android low-memory kills was not researched; no source was found on wgpu out-of-memory handling on phones.
- The existing "wgpu mobile integration guide" and the `app-surface` crate (from the earlier round) were not re-read.

## 3. Tauri 2 as host for a native 3D view; overlays, alternatives

### Takeaway
On desktop, wgpu under a webview inside a Tauri 2 window has been shown only in small demos that rely on an `unstable` feature, with Linux/Wayland as the weak spot. On iOS and Android there is no official path: child webviews are desktop-only, Tauri's Android activity has no native surface, and the nearest community work either replaces the webview entirely or has been proven only in the iOS simulator. A webview HUD over a 3D view on phones is therefore an unproven, custom-plugin job with a documented compositing cost on Android.

### Cited Findings

**What each platform build needs**
- [M] iOS: "iOS development requires Xcode and is only available on macOS"; full Xcode, targets `aarch64-apple-ios`, `x86_64-apple-ios`, `aarch64-apple-ios-sim`, plus CocoaPods. Android: Android Studio, SDK, NDK, `JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`, four Rust targets. Windows: MSVC build tools and WebView2. Linux: `libwebkit2gtk-4.1-dev` and related packages. macOS: Xcode or command-line tools. The page does not discuss cross-compilation. — [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [M] wry's webview engines: WebKitGTK on Linux, WKWebView on macOS, WebView2 on Windows; Android needs generated Kotlin files, an `AppCompatActivity`-derived activity (`WryActivity`), `wry::android_setup` and the `android_binding!` JNI macro. — [wry README](https://github.com/tauri-apps/wry)
- [M] Mobile plugins are Kotlin classes (constructor receives the `Activity`, `load` receives the `WebView`) and Swift classes (`load(webview: WKWebView)`); Rust calls them with `run_mobile_plugin`, native code calls Rust through JNI or C FFI; Android commands run on the main thread. — [Tauri mobile plugin development](https://v2.tauri.app/develop/plugins/develop-mobile/)

**Rust-side window access**
- [M] Tauri 2.12.7: `Window` implements `HasWindowHandle` and `HasDisplayHandle`; `Window::add_child` is "Available on `desktop` and crate feature `unstable` only"; `Window::builder` (a window without a webview) needs the `unstable` feature. — [tauri Window docs](https://docs.rs/tauri/latest/tauri/window/struct.Window.html)
- [M] wry 0.57.3: `build_as_child` works on Windows, macOS and Linux X11 only ("This method won't work on Wayland"); "Android/iOS: Unsupported". Background transparency on macOS uses the `drawsBackground` KVC key; on Windows alpha other than 0 becomes 255. — [wry WebViewBuilder docs](https://docs.rs/wry/latest/wry/struct.WebViewBuilder.html)
- [C, possibly outdated: March 2024] A Tauri maintainer closed the request "Render WebView on Top of Native GPU Rendered Content" by pointing to the `unstable` feature that allows a window with child webviews, "This however has limitation on X11". — [tauri issue #8246](https://github.com/tauri-apps/tauri/issues/8246)

**Desktop examples**
- [M] wry's own `examples/wgpu.rs`: a winit window, a wgpu surface on it cleared to transparent, and a transparent child webview (200x200 at 100,100); it panics on Wayland and sets `with_clip_children(false)` on Windows. — [wry wgpu example](https://github.com/tauri-apps/wry/blob/dev/examples/wgpu.rs)
- [M, possibly outdated] `FabianLars/tauri-v2-wgpu`: a port of that example to Tauri v2 by a Tauri maintainer ("v1 didn't want to render it"), 28 stars, archived 2024-12-23. — [tauri-v2-wgpu](https://github.com/FabianLars/tauri-v2-wgpu)
- [R] `clearlysid/tauri-wgpu-cam` (34 stars): camera frames drawn with wgpu to the native window with the webview UI on top; "works quite well on Windows and Mac"; Linux not mentioned. — [tauri-wgpu-cam](https://github.com/clearlysid/tauri-wgpu-cam)
- [R] `native-bevy-with-tauri-hud-demo` (14 stars): a transparent Tauri window stacked over a separate Bevy window; self-described experimental. — [native-bevy-with-tauri-hud-demo](https://www.github.com/langyo/native-bevy-with-tauri-hud-demo)
- [R] `tauri-plugin-gpui` (3 stars, Tauri 2.12 with `unstable`) notes desktop hazards: on Windows "`tauri-runtime-wry` paints window-only windows with softbuffer, which may conflict with the DX12 swapchain"; on Linux an embedded webview "always draws above" the GPU content; Wayland input is "untested on a real compositor"; macOS and Windows "have not been run against a real window yet". — [tauri-plugin-gpui](https://github.com/Ziinc/tauri-plugin-gpui)

**Mobile**
- [R] Same plugin, mobile notes: "Tauri child webviews are not available on mobile"; Tauri's Android activity has no native surface, so the plugin ships its own `SurfaceView` as content view (Vulkan, GLES fallback); on iOS, TAO already gives each window a `UIView` and wgpu attaches a `CAMetalLayer` to it with no Swift code; Android backgrounding unconfigures the surface while the device survives; on iOS no frames are rendered in the background "since iOS terminates apps that use the GPU there"; the iOS path has run only in the simulator. This design removes the webview rather than overlaying it. — [tauri-plugin-gpui](https://github.com/Ziinc/tauri-plugin-gpui)
- [R] A proof of concept merged 2026-11-18 placed an `MTKView` below a transparent `WKWebView` in a host that rebuilds wry 0.57.1's iOS view hierarchy: placement error 0 pt, DOM drawn over the Metal view was visible, taps reached the page, lifecycle held. It ran only on the iOS 26.5 simulator; frame cost was not measured; the surface-above arrangement was rejected. — [lazysh PR #2134](https://github.com/mihazs/lazysh/pull/2134)
- [M] Android reference docs: views overlaid on a `SurfaceView` "can have an impact on performance since a full alpha-blended composite will be performed each time the Surface changes"; the surface is created and destroyed as the window is shown and hidden. — [Android SurfaceView reference](https://developer.android.com/reference/android/view/SurfaceView)
- [R] A community answer (April 2026, accepted, not from a maintainer) describes Tauri on mobile as "basically a native webview wrapper", closer to Cordova or Capacitor than to native UI frameworks. — [Tauri discussion #15222](https://github.com/orgs/tauri-apps/discussions/15222)

**Bevy owning the window with a webview on top**
- [M] `bevy_cef` supports Bevy 0.20 (versions 0.14 to 0.15) and renders web content onto meshes or sprites on macOS, Windows and Linux; iOS and Android are not mentioned. — [bevy_cef](https://github.com/not-elm/bevy_cef)
- [R, possibly outdated] `bevy_webview_wry` 0.3.0 targets Bevy 0.15, its docs.rs build failed, and a registry page lists Android and iOS without proof. — [bevy_webview_wry on docs.rs](https://docs.rs/crate/bevy_webview_wry/0.3.0); [rust-digger entry](https://rust-digger.code-maven.com/crates/bevy_webview_wry)
- [R, possibly outdated] The older `bevy_webview`: "Android & IOS are currently unchartered territory". — [blaind/bevy_webview](https://github.com/blaind/bevy_webview)

**Alternatives: native shell or all-Rust UI**
- [M] `bevy-in-app` (249 stars) runs a Bevy app inside an "iOS UIView or Android SurfaceView" of an existing native app; the README says `WinitPlugin` cannot be used there because winit takes over app initialisation; newest pairing is Bevy 0.18 with bevy-in-app 0.6; its Android build skips x86 because "simulators and virtual devices only support GLES". — [bevy-in-app](https://github.com/jinleili/bevy-in-app)
- [M] Android's `GameActivity` "renders into a SurfaceView, making it much easier for games to interact with other UI components", derives from `AppCompatActivity`, and is "strongly recommend[ed]" by Google for new games. — [Android GameActivity](https://developer.android.com/games/agdk/game-activity)
- [C] Bevy UI: Feathers gained colour input, list view, dropdowns and theming in 0.20 and is described as an editor-centric toolkit; 0.19 added text input with IME but lacks placeholder text, undo and password masking; 0.17 put widgets behind `experimental_` features. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/); [Bevy 0.19](https://bevy.org/news/bevy-0-19/); [Bevy 0.17](https://bevy.org/news/bevy-0-17/)
- [C] A core contributor, September 2025: "it's hard to reccomend Bevy for UI-heavy games and apps" because reactivity is unsolved. — [jms55, Fifth Birthday](https://jms55.github.io/posts/2025-09-03-bevy-fifth-birthday/)
- [M] `bevy_egui` 0.43 supports Bevy 0.20; the README lists desktop and web, render-to-texture and a "rough" mobile-web keyboard; native iOS and Android are not mentioned. — [bevy_egui](https://github.com/vladbat00/bevy_egui)
- [C] Blitz (the HTML/CSS engine behind Dioxus Native) "is currently in a beta state" with "many bugs and missing features"; it has an Android browser build and a `wgpu_texture` example; iOS is not mentioned. — [Blitz](https://github.com/DioxusLabs/blitz)
- [C] Slint claims to scale "from desktop apps to mobile apps on Android and iOS" under a choice of royalty-free, GPLv3 or commercial licences; its README shows no wgpu or Bevy integration. — [Slint](https://github.com/slint-ui/slint)
- [R] A third-party comparison (one project's issue) rates Dioxus Native's mobile GPU path as experimental, Slint on iOS as a preview, and Makepad as supporting iOS and Android but "fast-moving". — [koan issue #1599](https://github.com/radiosilence/koan/issues/1599)

### Inferences
- The Rust side of a Tauri 2 app can target all five platforms, but "a wgpu surface inside the Tauri window" is three different integrations: a child-webview arrangement on desktop (unstable API), a `CAMetalLayer` on TAO's view under a transparent `WKWebView` on iOS (custom or borrowed code), and a self-supplied `SurfaceView` under the `WebView` on Android (custom Kotlin). None is an official, tested Tauri feature.
- Bevy cannot simply run inside a Tauri mobile app with its normal windowing: Bevy's winit backend expects to own app start-up and its own activity, while Tauri owns the activity and the view tree. Embedding needs the `bevy-in-app` pattern (no `WinitPlugin`, surface handed in from the host), and that project trails Bevy by two releases.
- A webview overlay driven by Bevy or winit ("engine owns the window, webview on top") works on desktop through wry child webviews or offscreen CEF, and has no working route on phones.
- On Android, any view layer over the 3D surface costs a full-screen alpha blend whenever the 3D surface updates, which at 60 fps is every frame. That is a fill-rate tax on the devices with the least headroom. The iOS cost is unmeasured.
- The low-risk split is: 3D view and in-game HUD drawn by the engine in one surface; the webview used for screens that do not sit over a live 3D view, or as an overlay on desktop only.
- Linux is the weakest desktop target for webview-over-GPU compositing (X11-only child webviews, untested Wayland paths).

### Gaps
- No measurement exists of a transparent `WKWebView` or Android `WebView` over a Metal or Vulkan surface on a physical phone (frame time, touch latency, energy).
- Input routing between webview and 3D view, keyboard handling and surface loss on suspend/resume inside a Tauri mobile app are reported only by the two small community projects above; neither ran on a physical iOS device.
- Tauri's own roadmap for mobile child webviews or native-surface support was not found.
- Makepad and Xilem/Vello mobile status rests on one third-party table; primary sources were not read.
- Slint's licence terms for a commercial App Store game were not analysed.

## 4. Engine-base decision: Bevy renderer, Bevy ECS plus custom renderer, raw wgpu, or something else; comparison with Unreal and Unity

### Takeaway
The evidence favours using Bevy as a framework (ECS, app structure, assets, remote protocol) and owning the world renderer on wgpu: the best-known shipped Bevy 3D game replaced Bevy's renderer, Bevy's own rendering contributors advise pinning a version because internals keep breaking, and Bevy's phone-side renderer is unmeasured. No Rust option has a shipped precedent for this visual class on phones, and neither Unreal's nor the reference game's technology reaches phones either.

### Cited Findings

**Projects that used Bevy's ECS with their own renderer, or Bevy's renderer in production**
- [M] Tiny Glade (two-person studio) was "made with a custom version of Bevy"; released 2024-09-23 for Windows and Linux; macOS arrived by update on 2026-05-13; no console or mobile versions listed. — [Wikipedia, Tiny Glade](https://en.wikipedia.org/wiki/Tiny_Glade)
- [C, possibly outdated: May 2024] The developers: "we're still using a modified version of Bevy to this day"; they keep the ECS; Bevy's rendering "had additional constraints that pushed me to start writing my own rendering solutions"; compute shaders were "not possible with Bevy" at the time, so they moved to Vulkan. Advice: "If you're not scared of heavy engineering, it might be a good choice for you." — [80.lv interview](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games)
- [R] Its renderer was presented at the Graphics Programming Conference as "Rendering tiny glades with entirely too much ray marching" (real-time GI, GPU-driven rendering, ray marching). — [Hacker News thread](https://news.ycombinator.com/item?id=42190065)
- [C] Nominal Connect (March 2026) ships desktop software on Bevy's renderer plus egui for Windows, Linux and macOS with a WASM subset; code changes have no hot reload; splitting into about 50 crates with a faster linker "helps, but is not a complete solution"; "graphics drivers are messy" on Windows; mobile "isn't needed". — [Nominal blog](https://nominal.io/blog/nominal-connect-shipping-realtime-desktop-software-with-rust-bevy-and-egui)

**Cost of Bevy's breaking releases**
- [M] The 0.18 to 0.19 migration guide has 103 top-level entries, roughly 35 touching rendering, including "Render Graph as Systems" (the render graph API replaced by schedules), a new `bevy_material` crate, changed mesh pipeline keys and an `ExtractComponent` refactor. — [0.18 to 0.19 migration guide](https://bevy.org/learn/migration-guides/0-18-to-0-19/)
- [M] The 0.19 to 0.20 guide has 75 entries, 23 of them rendering-related, including WESL shaders, `WgpuWrapper` removed, `UnpreparedBindGroup` renamed to `BindGroupBuilder`, depth attachment changes and "Extraction is now generic over worlds". — [0.19 to 0.20 migration guide](https://bevy.org/learn/migration-guides/0-19-to-0-20/)
- [C] Rendering contributor, August 2026: "I'd much rather make breaking changes than try for backwards compatibility"; advice to game developers: "stick to a single version of Bevy, and backport individual parts if needed"; "Bevy's material API is too low level, and tied to the technical details around how the renderer works"; some changes "regressed performance on certain GPUs". — [jms55, Sixth Birthday](https://jms55.github.io/posts/2026-08-29-bevy-sixth-birthday/)
- [M] Ecosystem lag six weeks after 0.20: `big_space` tops out at Bevy 0.19, `bevy-in-app` at 0.18; `bevy_egui` and `bevy_cef` already support 0.20. — [big_space](https://github.com/aevyrie/big_space); [bevy-in-app](https://github.com/jinleili/bevy-in-app); [bevy_egui](https://github.com/vladbat00/bevy_egui); [bevy_cef](https://github.com/not-elm/bevy_cef)
- [C, possibly outdated: September 2025] Missing pieces named by the same contributor: no editor, weak animation, custom materials "servicable, but not enjoyable", streaming undelivered. — [jms55, Fifth Birthday](https://jms55.github.io/posts/2025-09-03-bevy-fifth-birthday/)

**Other Rust engines and renderers**
- [M] rend3: archived 2025-06-07, labelled maintenance mode. — [rend3](https://github.com/BVE-Reborn/rend3)
- [M] Kajiya: archived 2026-06-01, "This project is no longer maintained"; it needed desktop ray-tracing GPUs and "does not currently aim to be a fully-featured renderer used to ship games". — [kajiya](https://github.com/EmbarkStudios/kajiya)
- [M] Ambient: "Work on the Ambient runtime is paused indefinitely." — [Ambient](https://github.com/AmbientRun/Ambient)
- [M] Blade: Vulkan and GLES on Linux, Vulkan on Windows, Metal on macOS/iOS/tvOS, Vulkan on Android; its ray-traced renderer runs only where ray query exists; 819 stars. — [Blade](https://github.com/kvark/blade)
- [M] Fyrox's repository contains both `fyrox-graphics-gl` and `fyrox-graphics-wgpu` crates; the README gives no platform table. — [Fyrox](https://github.com/FyroxEngine/Fyrox)
- [C] godot-rust (gdext) "is now in a usable state"; Android, iOS and Web are experimental and their documentation and tooling "still lacking". — [godot-rust/gdext](https://github.com/godot-rust/gdext)

**Unreal Engine and Unity for this visual target**
- [M] Unreal's Lumen: "developed for next-generation consoles ... and high-end PCs"; "The Mobile Renderer doesn't support Lumen"; it is supported "on Android Vulkan when using the desktop renderer"; software ray tracing needs a GTX 1070 class card. The docs page header read "Unreal Engine 5.9" at fetch time. — [Unreal docs, Lumen technical details](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine)
- [M] Unreal's Nanite "supports current console and desktop platforms" and requires DX12 with Shader Model 6; the page names no mobile support. — [Unreal docs, Nanite](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)
- [R] Unreal Engine 5.7 (November 2025) introduced Nanite Foliage as an Experimental feature, with skinning-based animation and voxels for distant foliage. — [Notebookcheck on UE 5.7](https://www.notebookcheck.net/Unreal-Engine-5-7-brings-Nanite-Foliage-MegaLights-and-major-visual-upgrades-in-tow.1162191.0.html); [Digital Production on UE 5.7](https://digitalproduction.com/2025/11/12/unreal-engine-5-7-foliage-pcg-and-in-editor-ai/)
- [M] Unity 6.3 LTS: the GPU Resident Drawer needs the Forward+ path and "graphics APIs and platforms that support compute shaders, except OpenGL ES"; it has its own GPU occlusion culling. — [Unity 6.3 manual, GPU Resident Drawer](https://docs.unity.com/en-us/engine/6000.3/manual/analysis/graphics-performance-profiling/in-urp/reduce-draw-calls-urp/reduce-rendering-work-on-cpu/gpu-resident-drawer)
- [R] A Unity forum reply cautions that GPU occlusion culling relies on instanced indirect draws and compute, "not very mobile friendly especially low-end mobiles". — [Unity Discussions](https://discussions.unity.com/t/gpu-occlusion-culling-and-scene-loading-questions/1541672)
- [M] The visual reference, Crimson Desert, runs on Pearl Abyss's proprietary BlackSpace Engine after about seven years of development; released 2026-03-19 for Windows, macOS, PlayStation 5 and Xbox Series X/S; no mobile version; a Switch 2 version is planned for the first half of 2027. — [Wikipedia, Crimson Desert](https://en.wikipedia.org/wiki/Crimson_Desert)

### Inferences
- Ranking by risk for this project (least first): (1) Bevy ECS and app framework with a custom world renderer on wgpu; (2) raw wgpu with everything self-built; (3) full Bevy rendering for the world; (4) other Rust engines. Reasons: every vegetation-critical system is custom under all options; option 3 adds the most exposure to release churn (about a third of each migration guide is rendering) and to phone gating one does not control; option 2 gives up the ECS, asset system, remote protocol and hot patching that headless agents can lean on; option 4 means smaller or paused projects or experimental mobile support.
- Counter-evidence for the ranking: the one shipped precedent for option 1 is desktop-only, took 20 months to reach macOS, kept a forked Bevy, and was built by a specialist rendering engineer. Bevy's renderer does work in production for a desktop product. No Rust renderer of this class has shipped on phones.
- A middle path lowers start-up cost: write the world passes against wgpu and own data types, but run them inside Bevy's render schedules at first (Bevy supplies device handling, camera views, post-processing, UI and render recovery). Keep the pass code free of Bevy renderer types so it can move to a standalone frame graph if phones demand it.
- Pinning one Bevy version is close to mandatory. It also suits AI coding agents, which tend to produce code for whichever Bevy version dominated their training data; frequent API renames raise the error rate.
- Honest comparison. Unreal 5 is the only option here with shipped technology aimed at this look (Nanite Foliage, Lumen), and that technology targets consoles and high-end PCs; its mobile renderer excludes Lumen. Unity 6 is the lowest-risk route to shipping a vegetation-heavy game on phones at all, at a more modest look. The reference game itself does not ship on phones. So "Crimson Desert visuals at 60 fps on 8 GB phones" is unproven for every engine, not only for Rust; phones need their own quality tier.
- What Unreal or Unity would cost an agent-driven, headless workflow: editors and binary asset formats at the centre of the pipeline, far heavier builds, licence terms, and no equivalent of a text-only repository in which code, shaders and procedural content are all diffable. Against that, the Rust route gives up mature mobile device coverage, profilers, upscalers, streaming and vegetation tooling. This paragraph is judgment; no source on Unreal or Unity agent tooling was read.

### Gaps
- No postmortem with numbers on Bevy upgrade effort (hours per release) was found; migration-entry counts are a proxy.
- How Tiny Glade reached macOS (MoltenVK, native Metal, or other) was not found.
- The Tiny Glade conference talk itself was not located as a recording or slides.
- Unreal's mobile feature pages returned no body text; Nanite and Nanite Foliage status on the mobile renderer is unverified beyond the Nanite page's silence. Whether 5.7 is still the current Unreal release is doubtful: Epic's docs header read 5.9.
- Fyrox 1.0's mobile renderer limits, and any new Rust engine entrants in 2026, were not re-checked (search budget).
- Unity and Unreal support for headless, agent-driven workflows (command-line builds, remote control servers) was not researched.

## 5. Facts for agent-driven iteration: compile times, hot patching, binary size, store requirements

### Takeaway
Bevy has in-engine hot patching of systems since 0.17 and a remote protocol that is still gaining input and inspection commands, which suits headless agents on desktop. Hard numbers for compile time, binary size and phone start-up were not found, GPU behaviour on phones cannot be validated in simulators, and the stores impose moving requirements (Xcode 26 on a Mac, Android target API 36, 16 KB pages).

### Cited Findings

**Hot patching and compile speed**
- [C] Bevy 0.17 (2025-09-30) integrated Dioxus's subsecond: enable the `hotpatching` feature and run `dx serve --hot-patch`; "every system can now be modified during execution". Limits: binary crate only, not Wasm, changes to system parameters are not hot reloaded, sensitive to linker configuration. — [Bevy 0.17](https://bevy.org/news/bevy-0-17/)
- [R, possibly outdated: mid-2025] Anecdotal patch times: about 130 ms on an M4 Mac (one commenter); a community thread titled "500ms recompile". — [Hacker News, Subsecond](https://news.ycombinator.com/item?id=44369642); [bevy_simple_subsecond_system docs](https://docs.rs/crate/bevy_simple_subsecond_system/0.1.9)
- [C] Dioxus 0.7 says subsecond works on web, desktop "and even mobile (iOS, Android)". — [Dioxus v0.7.0 release](https://github.com/DioxusLabs/dioxus/releases/tag/v0.7.0)
- [C] Bevy's setup guide: dynamic linking is "the most impactful compilation time decrease" (not for shipping); mold is "up to 5x" faster than LLD; Cranelift is "about 30% faster at compiling than LLVM" but can crash on macOS with Bevy; on macOS the default linker is already fast; Bevy's minimum Rust version is the latest stable. No absolute build times are given. — [Bevy setup guide](https://bevy.org/learn/quick-start/getting-started/setup/)
- [M] Bevy tracks compile time and binary size per commit on a public dashboard (build machine: Ryzen 9 9950X, 64 GB); the chart values could not be read by the fetch tool. — [metrics.bevy.org](https://metrics.bevy.org/)
- [C] 0.18 added cargo feature collections (`2d`, `3d`, `ui`) for smaller builds, plus `EasyScreenshotPlugin` and `EasyScreenRecordPlugin` (recording unsupported on Windows). — [Bevy 0.18](https://bevy.org/news/bevy-0-18/)
- [C] Bevy 0.20 shaders use WESL with language-server support through wgsl-analyzer. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [M] Draft notes for the next release include remote-protocol input clicks, queries by name path, and inspection. — [bevy _release-content/release-notes](https://github.com/bevyengine/bevy/tree/main/_release-content/release-notes)

**Mobile build and test loop**
- [M] Bevy Android: `cargo-ndk`, JDK 21, Gradle; "Bevy uses GameActivity, which requires API 23 or higher" with `NativeActivity` available through the `android-native-activity` feature; `minSdk` 26, target API 37; the workspace sets `strip = true` to keep bundles small. Bevy iOS: `make run` boots a simulator, or open the Xcode project. — [Bevy examples README](https://raw.githubusercontent.com/bevyengine/bevy/main/examples/README.md)
- [M] The 0.18 to 0.19 guide has an entry titled "Remove android game activity from default". — [0.18 to 0.19 migration guide](https://bevy.org/learn/migration-guides/0-18-to-0-19/)
- [R] Hosted macOS runners can drive iOS simulator tests headlessly (runner `macos-26-arm64`, Xcode 26.6, iOS 26.5), but the same report stresses the simulator gives "no real GPU, frame pacing, ProMotion, thermal, or energy data" and does not enforce iOS's background GPU restriction. — [lazysh PR #2134](https://github.com/mihazs/lazysh/pull/2134)
- [R] `bevy-in-app` skips x86 Android targets because "simulators and virtual devices only support GLES". — [bevy-in-app](https://github.com/jinleili/bevy-in-app)

**Store requirements**
- [M] Apple: since 2026-04-28 uploads must be built with Xcode 26 or later and the iOS 26 SDK; since 2026-09-09 apps must target iOS 13 or later; privacy manifests with approved reasons for listed APIs (including third-party code) have been required since 2024-05-01. — [Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [M] Google Play: from 2026-08-31 new apps and updates must target Android 16 (API 36); extension possible to 2026-11-01. — [Android target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [M] Google Play: apps targeting Android 15+ must support 16 KB page sizes on 64-bit devices; from 2027-02-01 non-compliant updates cannot be released. NDK r28+ aligns by default; older NDKs need `-Wl,-z,max-page-size=16384`; custom allocators need review. — [Android 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)
- [M] Tauri repeats the 16 KB rule for mobile plugins and requires macOS with full Xcode for any iOS build. — [Tauri mobile plugin development](https://v2.tauri.app/develop/plugins/develop-mobile/); [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Inferences
- The fast loop for agents is desktop-only: hot-patched systems, shader reload, remote-protocol queries and offscreen screenshots on a development machine. Phones are a slower outer loop that needs physical devices or a device farm, since simulators and emulators do not exercise the real Metal or Vulkan drivers.
- A Mac is a hard dependency of the pipeline (iOS builds, Xcode 26, signing). Windows and Linux builds can come from CI.
- Rust store compliance is mostly toolchain hygiene: NDK r28+, target API 36 in Gradle, a privacy manifest, 16 KB-safe allocators.
- Hot patching covers ECS systems. A custom renderer's pass code is only patchable if it runs as systems or is otherwise routed through the patchable call points; this should be designed in early.

### Gaps
- No measured clean or incremental compile times for a Bevy or wgpu project were found (dashboard values unreadable; search budget exhausted).
- No measured release binary size or cold-start time for a Bevy or wgpu app on iOS or Android was found.
- The `GameActivity` minimum API level conflicts between sources (23 in the current README, 31 in older mirrored docs).
- Whether hot patching works in practice against an app running on a phone is unverified (vendor claim only; iOS restricts runtime code modification).
- `bevy_brp_mcp` and `bevy_brp_extras` (from the earlier round) were not re-verified for Bevy 0.20 compatibility.

## 6. Recommended architecture, known blockers, and facts that remain unverified

### Takeaway
One Rust codebase can reach all five platforms, but not as "Bevy's renderer in a Tauri window with a web HUD everywhere" and not at one quality level. The defensible plan is a host-agnostic engine library (Bevy ECS framework, own wgpu world renderer, in-engine HUD) with Tauri as the desktop host and as a non-overlay shell on phones, three quality tiers, and two device spikes before committing.

### Cited Findings
The decisive facts, restated with sources:
- [M] Bevy disables GPU preprocessing on Adreno 730 and older (except 720) and Mali drivers below 48, and limits Pixel 10 to no culling. — [gpu_preprocessing.rs](https://raw.githubusercontent.com/bevyengine/bevy/main/crates/bevy_render/src/batching/gpu_preprocessing.rs)
- [M] Metal lacks `MULTI_DRAW_INDIRECT_COUNT`, `PARTIALLY_BOUND_BINDING_ARRAY` and an implemented `PIPELINE_CACHE` in wgpu 30; timestamps inside passes are unavailable on Apple GPUs. — [wgpu Features docs](https://docs.rs/wgpu/latest/wgpu/struct.Features.html)
- [M] Meshlets are experimental, Vulkan and Metal only, need 64-bit texture atomics (36.49% of Android devices) and carry "much greater base overhead". — [MeshletPlugin docs](https://docs.rs/bevy/latest/bevy/pbr/experimental/meshlet/struct.MeshletPlugin.html); [vulkan.gpuinfo.org](https://vulkan.gpuinfo.org/listextensions.php?platform=android)
- [C] No FSR or MetalFX in Bevy; DLSS is Nvidia-only on Vulkan desktop. — [Bevy 0.20](https://bevy.org/news/bevy-0-20/); [Bevy 0.17](https://bevy.org/news/bevy-0-17/)
- [M] Tauri child webviews are desktop-only and behind `unstable`; wry child webviews are unsupported on Android and iOS and on Wayland. — [tauri Window docs](https://docs.rs/tauri/latest/tauri/window/struct.Window.html); [wry WebViewBuilder docs](https://docs.rs/wry/latest/wry/struct.WebViewBuilder.html)
- [M] Android composites overlays on a `SurfaceView` with a full alpha blend each time the surface changes. — [Android SurfaceView reference](https://developer.android.com/reference/android/view/SurfaceView)
- [R] The only webview-over-Metal evidence on iOS inside a Tauri-like hierarchy is a simulator-only proof from 2026-11-18. — [lazysh PR #2134](https://github.com/mihazs/lazysh/pull/2134)
- [M] wgpu has open, unresolved Adreno and Mali issues, including silent failure of indirect draws on some Adreno devices. — [wgpu issue #8801](https://github.com/gfx-rs/wgpu/issues/8801); [wgpu issue list](https://github.com/gfx-rs/wgpu/issues?q=is%3Aissue+is%3Aopen+android+%28adreno+OR+mali%29)
- [M] Each Bevy release carries 75 to 103 migration entries, about a third on rendering. — [0.18 to 0.19 migration guide](https://bevy.org/learn/migration-guides/0-18-to-0-19/); [0.19 to 0.20 migration guide](https://bevy.org/learn/migration-guides/0-19-to-0-20/)
- [M] Unreal's Lumen is not supported by its mobile renderer, and the reference game has no phone version. — [Unreal docs, Lumen](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine); [Wikipedia, Crimson Desert](https://en.wikipedia.org/wiki/Crimson_Desert)

### Inferences

**Recommended architecture (my judgment, not a sourced fact)**
1. *Engine as a host-agnostic Rust library.* It renders into whatever surface the host passes in and never creates windows itself. It is built from `bevy_ecs`/`bevy_app` (one pinned Bevy version, upgraded deliberately, not per release) for simulation, plugins, assets and the remote protocol, plus a custom wgpu frame graph for the world: terrain, vegetation, water, sky, fog, shadows.
2. *World renderer owned by the project.* Few, fixed passes with a GPU-time budget each, measured by pass-boundary timestamp queries on every platform. Start inside Bevy's render schedules if that speeds up the prototype, but keep pass code independent of Bevy renderer types.
3. *Three quality tiers, one code path with capability switches.* Desktop: GPU culling, multi-draw-indirect-count where present, optional experiments (meshlets, ray tracing). Phone-high (recent Apple chips, Adreno 740 and newer, Mali driver 48+): compute culling with plain indirect draws, no reliance on features Metal lacks, no 64-bit atomics. Phone-fallback: CPU chunk culling with instancing, no indirect draws. Lighting on phones is analytic sky plus probes or baked terms; no real-time GI.
4. *Hosts.* Desktop: Tauri 2 window, engine surface underneath, webview overlay through the `unstable` child-webview route, with an engine-owned window as fallback (needed for Linux/Wayland and for headless agent runs). Phones: the engine surface in a native view (a `CAMetalLayer` on the host view on iOS, an own `SurfaceView` on Android) with the HUD drawn by the engine; the Tauri webview serves screens that do not sit over the live 3D view. Promote the webview to an overlay on phones only if a device spike shows the cost is acceptable. A thin native shell (SwiftUI, or `GameActivity` plus Compose) hosting the same Rust library is the fallback if Tauri's activity and view tree get in the way.
5. *HUD and tools UI in Rust.* egui for developer tooling; a small custom or `bevy_ui` layer for the in-game HUD. HTML/CSS engines in Rust (Blitz) are beta and not a dependency to take yet.
6. *Assets.* Procedural plants compile to meshes, impostors and textures in a build step; textures ship as ASTC for phones and BCn for desktop (or one transcodable format).
7. *Two spikes before defining the prototype's scope.* (a) Host spike: wgpu surface under a transparent Tauri webview on one iPhone and two Android phones (one Adreno 7xx, one Mali), measuring frame-time delta, touch routing, suspend/resume, rotation and keyboard. (b) Renderer spike: a standalone vegetation stress scene with per-pass timings on the same phones, then the same scene in stock Bevy 0.20, reading Bevy's start-up log for the preprocessing mode it grants.

**Feasibility, stated bluntly**
- One Rust engine on five platforms: feasible. wgpu is first-class on all four graphics back-ends involved, and Bevy and Tauri both build for all five systems.
- A Tauri 2 shell hosting the 3D view on phones: unproven. Expect custom Swift and Kotlin and a real chance of concluding that the webview must not overlay the 3D view.
- Bevy's renderer as the base for a dense-forest look on phones: unsupported by any measurement, and its advanced features do not reach most Android phones.
- The stated visual target at 60 fps on 8 GB phones: no engine demonstrates it. Plan a phone look a generation below desktop and treat parity as a non-goal.

**Known blockers**
1. No child webviews on Tauri mobile; Tauri's Android activity has no native surface; overlay compositing cost on Android is documented, on iOS unmeasured.
2. Android driver quality: Bevy's denylist excludes Adreno 730 and older and old Mali drivers from GPU-driven rendering; wgpu has open Adreno and Mali bugs and limited maintainer hardware.
3. Metal gaps in wgpu: no indirect-count draws, no partially bound arrays, no pipeline cache, no MetalFX wrapper, pass-boundary timestamps only.
4. Nothing in Bevy for terrain, streaming, floating origin, phone upscaling or phone GI; meshlets are experimental and dormant.
5. Bevy releases break rendering code every 3.5 to 5 months; ecosystem crates lag by one or two releases.
6. Linux/Wayland lacks wry child webviews.
7. iOS builds need a Mac with Xcode 26; Play needs target API 36 and 16 KB pages; phone GPU behaviour cannot be validated in simulators or standard emulators.
8. No Rust precedent for this renderer class on phones; the nearest precedent (Tiny Glade) is desktop-only and took 20 months to reach macOS.

### Gaps
Facts that remain unverified and should be settled by test or follow-up research:
- Real-device frame times for any Bevy 0.20 3D scene on current iPhones and Android phones.
- The preprocessing mode Bevy 0.20 grants on iOS/Metal, and whether its GPU occlusion culling runs there.
- Whether Bevy 0.20 on Metal uses storage-buffer binding arrays from wgpu 30; which of wgpu's docs or changelog is right about Metal mesh-shader WGSL, ray queries and buffer arrays; whether those features cover iOS or only macOS.
- Cost of a transparent webview over a Metal or Vulkan surface on physical phones; input routing and suspend/resume behaviour in a real Tauri mobile app.
- Usable memory for one app on 8 GB phones under iOS and Android memory pressure, and wgpu's behaviour when allocation fails there.
- Clean and incremental compile times, release binary size and cold-start time for this stack on phones.
- Hot patching against a device build.
- Whether any 3D Bevy game shipped publicly on both mobile stores in 2025 or 2026.
- Unreal's current version and its mobile status for Nanite and Nanite Foliage; Unity 6 measured behaviour of the GPU Resident Drawer on phones.
- How Tiny Glade's macOS port was done.
- Mobile status of Makepad, Xilem/Vello and `bevy_webview_wry`; Slint's licence fit for a commercial mobile game.
- Complete contents of the Bevy 0.21 development branch.
- Adreno model-to-chipset mapping used in the inference about mid-range 8 GB phones (from general knowledge, not checked in this session).
