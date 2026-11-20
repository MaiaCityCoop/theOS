# Neural and Gaussian-splat head avatars as a route to a photoreal face in the browser (state: 18 November 2026)

**How to read the source marks.** Every cited finding carries one of these marks:

- **[F]** primary source opened and read in full in this session.
- **[X]** primary source opened, but only the relevant extract was read (a README section, a licence header, a code file searched for the lines in question, a project-page abstract).
- **[S]** secondary: the host could not be opened from this environment, so the claim rests on a search-engine extract of that source, or on a news or aggregator summary. Treat numbers marked [S] as unverified until checked against the paper.
- **[M]** my memory, not checked in this session. These appear only under Inferences or Gaps.

**What could not be opened.** Only `github.com` and `raw.githubusercontent.com` were reachable. Blocked: `arxiv.org`, `flame.is.tue.mpg.de`, every `*.github.io` project page, `openaccess.thecvf.com`, `huggingface.co`, `sparkjs.dev`, `threejs.org`, PlayCanvas blog and developer site, `doc.babylonjs.com`, Microsoft Research, NVIDIA developer pages, `dl.acm.org`, and all news sites. Project pages and vendor documentation were read from their GitHub source repositories where those exist. No paper PDF was read in full. The shared web-search budget ran out partway through, so the avatar-builder section (parts 2, 4 and 5 especially) rests on GitHub-hosted primary sources plus clearly flagged memory.

---

## 1. State of the art in animatable head avatars, 2023 to 2026

### Takeaway
The field splits into three groups: per-person avatars optimised from multi-view or monocular video (highest fidelity, lighting baked in), relightable avatars that need a light stage or a prior trained on one, and feed-forward "one image in, avatar out" models that run fast on phones but are neither relightable nor close-up sharp. Almost all of them are rigged to FLAME, and almost none publish a frame rate together with a browser, a phone GPU and a resolution.

### Cited Findings

**Per-person, video-optimised, lighting baked in**

- **GaussianAvatars** (Qian et al., CVPR 2024). Input: multi-view video; the paper uses 9 subjects from NeRSemble. Animation: Gaussians bound to FLAME 2023 triangles (`--bind_to_mesh`), driven by FLAME parameters. Appearance: spherical harmonics up to degree 3 (default 3), no lighting model. The README warns that its Python viewer must not be used to measure frame rate and points to a separate benchmark script; no frame-rate number appears in the README. — [README](https://github.com/ShenhanQian/GaussianAvatars/blob/HEAD/README.md) [F]; [download notes](https://github.com/ShenhanQian/GaussianAvatars/blob/HEAD/doc/download.md) [F]
- GaussianAvatars starts from 10,144 Gaussians (one per triangle of its modified FLAME mesh) and grows to about 100,000 on average. — [CVPR 2024 supplemental](https://openaccess.thecvf.com/content/CVPR2024/supplemental/Qian_GaussianAvatars_Photorealistic_Head_CVPR_2024_supplemental.pdf) [S]
- **Gaussian Head Avatar** (Xu et al., CVPR 2024). Input: multi-view video (NeRSemble), with Basel Face Model fitting for pose and expression. Two-stage training (a mesh head for geometry guidance, then the Gaussian head). It splats 32-channel feature images, which a super-resolution network turns into a 2048-pixel RGB image. Animated by expression coefficients. — [README](https://github.com/YuelangX/Gaussian-Head-Avatar/blob/HEAD/README.md) [F]; [arXiv 2312.03029](https://arxiv.org/abs/2312.03029) [S]
- **SplattingAvatar** (Shao et al., CVPR 2024). Input: monocular video; Gaussians embedded on a FLAME 2020 mesh (heads) or SMPL (bodies) with a "walking on triangle" update. — [README](https://github.com/initialneil/SplattingAvatar/blob/HEAD/README.md) [X]. Abstract claims over 300 FPS on a modern GPU and 30 FPS on a mobile device; the extract names neither device nor resolution. — [arXiv 2403.05087](https://arxiv.org/abs/2403.05087) [S]
- **3D Gaussian Blendshapes** (Ma et al., SIGGRAPH 2024). Input: monocular video (INSTA and NeRFBlendShape data at 512 px, plus a 1024 px set). Animation: Gaussian blendshapes blended linearly with expression coefficients, initialised from FLAME 2020. The README (in a commented-out line) says 370 fps and that the code was tested on RTX 3090 and "A800"; it does not tie the 370 fps to a card or resolution. — [README](https://github.com/zjumsj/GaussianBlendshapes/blob/HEAD/README.md) [F]
- **FlashAvatar** (CVPR 2024). Monocular video, trained in minutes, "over 300FPS at the resolution of 512×512 with an Nvidia RTX 3090". — [README](https://github.com/USTC3DV/FlashAvatar-code/blob/HEAD/README.md) [X]
- **HeadGaS** (Dhamo et al., ECCV 2024). Monocular video; about 250 fps at 512×512 (one secondary page says 200 fps); hardware not in the extract. — [arXiv 2312.02902](https://arxiv.org/abs/2312.02902) [S]
- **NPGA** (Giebenhain et al., SIGGRAPH Asia 2024). Multi-view video, driven by the NPHM expression space rather than FLAME; uses adaptive density control and no super-resolution. No frame rate found. — [arXiv 2405.19331](https://arxiv.org/abs/2405.19331) [S]

**Relightable**

- **Relightable Gaussian Codec Avatars, RGCA** (Saito et al., Meta, CVPR 2024 oral). Conditioned on a latent expression code, gaze and view direction. Appearance is "learnable radiance transfer": diffuse spherical harmonics plus specular spherical Gaussians, with explicit relightable eye models. Relit "in real-time under both point light and continuous illumination"; demonstrated on "a tethered consumer VR headset". The page claims "3D-consistent sub-millimeter details such as hair strands and pores". No frame rate, GPU or resolution on the page. — [project page source](https://github.com/shunsukesaito/rgca/blob/HEAD/index.html) [F]
- The released RGCA decoder produces 1024 × 1024 = 1,048,576 Gaussians (`self.n_splats = 1024**2`), and the example configuration trains on 2048×1334 images. — [goliath `rgca.py`](https://github.com/facebookresearch/goliath/blob/HEAD/ca_code/models/rgca.py) [X]; [example config](https://github.com/facebookresearch/goliath/blob/HEAD/config/rgca_example.yml) [F]
- RGCA training data is a per-person "relightable head capture" from Meta's dome; dataset access is gated by email request and the repository calls itself a pre-release. — [goliath README](https://github.com/facebookresearch/goliath/blob/HEAD/README.md) [F]
- A Hacker News commenter says RGCA needed an A100 to run just above 60 fps at 1024×1024. This is hearsay, not from the paper. — [HN thread](https://news.ycombinator.com/item?id=42074348) [S]
- **URAvatar** (Li et al., Meta, SIGGRAPH Asia 2024). Input: a phone scan under unknown lighting. A "universal relightable avatar model" is trained on "hundreds of high-quality multi-view human scans with controllable point lights", then fine-tuned on the phone scan. Output is animatable and relit "in real time with the global illumination of diverse environments", with separate control of lighting, gaze and neck. The page links only a paper; no code or weights. — [project page source](https://github.com/junxuan-li/urgca-website/blob/HEAD/index.html) [F]
- **BecomingLit** (Schmidt, Giebenhain, Nießner; NeurIPS 2025). Trained on its own multi-view light-stage dataset with one-light-at-a-time captures; FLAME 2023 rig; "hybrid neural shading"; renders point-light and environment-map relighting. — [README](https://github.com/jonathsch/becominglit/blob/HEAD/README.md) [X]. No verified frame rate was found; the abstract says "interactive rates". — [arXiv 2506.06271](https://arxiv.org/abs/2506.06271) [S]
- **HRAvatar** (CVPR 2025). Monocular video; relightable; about 155 FPS at 512×512 on one RTX 3090 with roughly 75,000 Gaussians, and relighting under a new environment map at about the same speed. — [arXiv 2503.08224](https://arxiv.org/abs/2503.08224) [S]. It uses albedo extracted by an off-the-shelf intrinsic-decomposition model ("Intrinsic Anything") as pseudo ground truth. — [README](https://github.com/Pixel-Talk/HRAvatar/blob/HEAD/README.md) [X]
- **GTAvatar** (Eurographics 2026). One monocular video; Gaussian attributes defined on the UV map of a morphable-model template; an environment map is optimised jointly; result is relightable and editable in texture space. No real-time figure in the extract. — [arXiv 2512.09162](https://arxiv.org/abs/2512.09162) [S]

**Feed-forward from one or a few images**

- **GAGAvatar** (Chu and Harada, NeurIPS 2024). One image in; Gaussians carry 32-dimensional features that a neural renderer decodes; driven by FLAME tracking; trained on VFHQ. README says real-time reenactment and gives a `speed_test()` function but no number. — [README](https://github.com/xg-chu/GAGAvatar/blob/HEAD/README.md) [X]
- **LAM** (He et al., Alibaba, SIGGRAPH 2025). One image in, Gaussian head out in 1.4 s. The released model is "LAM-20K", trained on VFHQ + NeRSemble. Animating and rendering: 562.9 FPS on an A100 and "110+FPS" on a Xiaomi 14 phone; the table gives no resolution and does not say whether the phone figure is the browser build. A version trained on Alibaba's own larger dataset is listed but not released. — [README](https://github.com/aigc3d/LAM/blob/HEAD/README.md) [F]
- LAM's project page says the avatar runs in WebGL in browsers and suggests Chrome for higher frame rate. — [project page](https://aigc3d.github.io/projects/LAM) [S]
- **GASP** (Saunders et al., Microsoft, CVPR 2025). One image or short webcam video; a generative prior trained on synthetic humans is used only at fitting time; avatars "animated and rendered at 70fps on commercial hardware" (no card or resolution in the extract). — [Microsoft Research page](https://www.microsoft.com/en-us/research/publication/gasp/) [S]
- **SynShot** (Zielonka et al., CVPR 2025). A few images (comparisons use 3 views), fine-tuning a prior trained on synthetic data. — [CVF page](https://openaccess.thecvf.com/content/CVPR2025/html/Zielonka_Synthetic_Prior_for_Few-Shot_Drivable_Head_Avatar_Inversion_CVPR_2025_paper.html) [S]; [repository](https://github.com/Zielon/synshot/blob/HEAD/README.md) [X]
- **Avat3r** (Kirschstein et al., ICCV 2025). Four input images, one forward pass, animatable "at interactive rates". — [project page](https://tobias-kirschstein.github.io/avat3r) [S]
- **CAP4D** (Taubner et al., CVPR 2025 oral). Any number of reference images; a morphable multi-view diffusion model generates views that are then fused into a FLAME-2023-rigged avatar viewable in real time. — [README](https://github.com/felixtaubner/cap4d/blob/HEAD/README.md) [X]
- **MeshLAM** (He and Hoi, Alibaba, CVPR 2026). The LAM group's follow-up outputs a textured, animatable **mesh** from one image: "high-fidelity reconstruction with only 8K vertices (vs 80K Gaussian points)", built on FLAME. — [project page source](https://github.com/meshlam/meshlam.github.io/blob/HEAD/index.html) [X]
- **FA-LAM** (NeurIPS 2026) and **PanoLAM** (2025) extend LAM to full-head and 4D recovery. — [NeurIPS poster](https://neurips.cc/virtual/2026/poster/149554) [S]; [arXiv 2509.07552](https://arxiv.org/abs/2509.07552) [S]

**Built for phones and headsets**

- **SqueezeMe** (Meta). Full-body Gaussian avatars distilled to linear decoders with 8-bit weights; up to 3 avatars at 72 FPS on a Meta Quest 3, using a custom Vulkan splatting pipeline and the chip's neural processor. — [arXiv 2412.15171](https://arxiv.org/abs/2412.15171) [S]
- **Gaussian Pixel Codec Avatars, GPiCA** (Meta, December 2025). A hybrid: an expression code is decoded to a face mesh, an RGBA texture and only 16,384 Gaussians, about 75% of them on hair. A third-party summary gives about 10.9 ms per frame on a Quest 3 GPU against 19.3 ms for 65,000 plain Gaussians. — [arXiv 2512.15711](https://arxiv.org/abs/2512.15711) [S]
- **High-Fidelity Mobile Avatars with Pruned Local Blendshapes** (Zhan et al., Zhejiang University, CVPR 2026). Full-body avatars from multi-view video, implemented in WebGPU, "120 FPS at 2K resolution on mobile devices", with an in-browser viewer. — [project page source](https://github.com/gapszju/gapszju.github.io/blob/HEAD/webavatar/index.html) [F]. A secondary review gives 1683 FPS on an RTX 4090, 312 FPS on an RTX 3050, and names the phone chip as Snapdragon 8 Elite. — [review](https://www.themoonlight.io/review/high-fidelity-mobile-avatars-with-pruned-local-blendshapes) [S]
- **TaoAvatar** (Alibaba, 2025). Full-body talking avatars; 90 FPS on Apple Vision Pro. — [arXiv 2503.17032](https://arxiv.org/abs/2503.17032) [S]
- Apple's Vision Pro Personas (new engine in visionOS 26) use Gaussian splatting, according to Apple statements reported by trade press. — [radiancefields.com](https://radiancefields.com/apple-confirms-personas-use-gaussian-splatting) [S]

### Inferences
- Splat counts for heads span two orders of magnitude and track the use case: about 16,000 to 20,000 for phone-class and one-shot models (GPiCA, LAM), 75,000 to 100,000 for video-optimised avatars (HRAvatar, GaussianAvatars), and about one million for the light-stage relightable model that claims pore-level detail (RGCA).
- Published frame rates are almost all for 512×512 on a desktop RTX card, or for native headset pipelines. The only browser-side numbers found for animated avatars are LAM's unlabelled "110+FPS" on a Xiaomi 14 and the Zhejiang WebGPU paper's 120 FPS at 2K on a Snapdragon 8 Elite, and neither of those models is relightable.
- Meta's and Alibaba's most recent mobile-oriented work both moved back toward meshes (GPiCA keeps Gaussians mainly for hair; MeshLAM drops them entirely), which suggests the authors themselves see pure splats as the expensive option on constrained devices.

### Gaps
- No frame rate with hardware and resolution was verified for GaussianAvatars, Gaussian Head Avatar, NPGA, GAGAvatar, RGCA, URAvatar or BecomingLit, because the papers could not be opened. From memory [M]: GAGAvatar reported roughly 67 FPS on an A6000 and NPGA roughly 30 FPS on a desktop RTX card; neither was checked.
- Gaussian counts for GAGAvatar, URAvatar, BecomingLit and Gaussian Head Avatar were not found.
- I could not confirm which phone, browser and resolution LAM's 110 FPS refers to.

---

## 2. Relighting

### Takeaway
Real-time relighting by an arbitrary environment plus a moving point light is demonstrated, but only by models trained on light-stage captures of real people (RGCA, BecomingLit) or by a non-public prior trained on hundreds of such captures (URAvatar). Monocular-video methods (HRAvatar, GTAvatar) relight with estimated albedo, and the one-shot generators do not relight at all. None of the sources read describes taking a game scene's local shadows into account.

### Cited Findings
- RGCA handles "both point light and continuous illumination" in real time through learned radiance transfer (diffuse spherical harmonics that include global illumination, plus spherical Gaussians for "all-frequency reflections"), and adds explicit eye models "to improve the fidelity of eye reflections and enable explicit gaze control". Each avatar needs its own relightable capture. — [RGCA page source](https://github.com/shunsukesaito/rgca/blob/HEAD/index.html) [F]; [goliath README](https://github.com/facebookresearch/goliath/blob/HEAD/README.md) [F]
- Limits stated in Meta's follow-up on full bodies: relighting "is performed per individual 3D Gaussian, and scales linearly with the number of avatars"; training depends on known illumination; shadows caused by body articulation need a separate shadow network because the learned light transport does not capture them; relighting fidelity "is bounded by both geometry and appearance representations". Their capture dome has 512 cameras and 1024 lights. — [Relightable Full-Body Gaussian Codec Avatars](https://arxiv.org/abs/2501.14726) [S]
- Another paper surfaced by the same search notes that RGCA "requires a light stage with controllable lights and hundreds of cameras, which is difficult for ordinary users to obtain". The search extract did not say which paper; the likeliest of those returned is this one. — [Interactive Rendering of Relightable and Animatable Gaussian Avatars](https://arxiv.org/html/2407.10707) [S]
- URAvatar removes the per-person light stage by fine-tuning a universal prior on a phone scan, but the prior itself was trained on hundreds of light-stage subjects and is not released. — [URAvatar page source](https://github.com/junxuan-li/urgca-website/blob/HEAD/index.html) [F]
- BecomingLit relights under point lights and HDR environment maps (`run_relight ... envmap_path=...hdr`) and publishes its light-stage dataset. — [README](https://github.com/jonathsch/becominglit/blob/HEAD/README.md) [X]
- HRAvatar relights under a new environment map at about 155 FPS (RTX 3090, 512×512, about 75,000 Gaussians), using albedo pseudo-labels from an intrinsic-decomposition network. — [arXiv 2503.08224](https://arxiv.org/abs/2503.08224) [S]; [README](https://github.com/Pixel-Talk/HRAvatar/blob/HEAD/README.md) [X]
- For ordinary splats, lighting is baked in. PlayCanvas documentation: "Gaussian splat scenes are captured with their lighting baked in." Its relighting feature lights a simplified **proxy mesh** with standard lights and shadows and multiplies that lighting onto the splats per pixel; "the proxy mesh quality directly drives the result: where its silhouette diverges from the splat surface, lighting boundaries land in the wrong place." — [PlayCanvas relighting doc](https://github.com/playcanvas/developer-site/blob/HEAD/docs/user-manual/gaussian-splatting/building/relighting.md) [F]
- A visual-effects practitioner guide says relightable splat methods "require special training pipelines and are not available in any commercial DCC tool as of April 2026". — [cglounge.studio](https://cglounge.studio/journal/gaussian-splatting-for-vfx) [S]
- Splats can cast shadows in two web engines: Babylon.js needs `setTransparencyShadow(true)` on the shadow generator and also has voxel-based image-based-lighting shadows; PlayCanvas release notes mention cached Gaussian-splat shadows. — [Babylon.js splat doc](https://github.com/BabylonJS/Documentation/blob/HEAD/content/features/featuresDeepDive/mesh/gaussianSplatting.md) [X]; [PlayCanvas engine releases](https://github.com/playcanvas/engine/releases) [X]

### Inferences
- What breaks, by cause. *Specular highlights and eyes:* spherical-harmonic colour alone cannot move a highlight with the light, which is why RGCA adds spherical Gaussians and a separate eye model; any avatar without those (GaussianAvatars, LAM, GAGAvatar and similar) will show highlights frozen at capture time. *Subsurface scattering:* in RGCA it is folded into the learned diffuse transfer, so it is only as good as the light-stage data; monocular methods have no measurement of it. *Hair:* handled volumetrically and well by the light-stage models; it is the reason GPiCA keeps Gaussians at all. *Scene shadows:* learned transfer covers distant light and self-shadowing only. A game sun blocked by a tree, a hand, a hat or the avatar's own procedural body is outside what these models learned.
- For a game, the usable interface is "environment as spherical harmonics plus a few point lights". A moving sun and sky fit that; cascaded shadow maps, local occluders and consistent shading across the neck seam with a mesh body do not, and would need extra work per frame.
- The proxy-mesh trick in PlayCanvas is the practical web answer today, and it is revealing: the lighting is computed on a mesh, and the splats only supply baked colour. For a face that already has a good mesh and shader, the splat layer adds little.

### Gaps
- No quantitative relighting error (for example against held-out light-stage frames) was read for any method.
- I found no source describing a relightable Gaussian head running in a browser.
- BecomingLit's and RGCA's stated limitations sections were not readable.

---

## 3. Browser viability

### Takeaway
Rendering splats in a browser is now routine and is available inside three.js r187's WebGPU renderer as an official but minimal add-on. A single head is far below every published splat budget, so sorting is not the obstacle. The obstacles are that the capable three.js splat engine (Spark) is WebGL2-only, that no mainstream web renderer ships animated, relightable avatar splats, and that splats do not write depth or receive the scene's lighting.

### Cited Findings

**Renderers**

- **three.js r186 (24 September) and r187 (30 October; the release page shows no year, 2026 is inferred from the licence file)** include an official add-on, `GaussianSplat`, described as "a minimal renderer for 3D Gaussian splat geometry" that "can only be used with WebGPURenderer" (its WebGL fallback mode works, the classic `WebGLRenderer` does not). It is written in the three.js shading language, sorts with a compute-shader counting sort, precomputes view-dependent colour in a compute pass, and loads `.splat`, SPZ (including version 4), PLY and glTF. Its material is transparent with depth test on and depth write off. A search of the file finds no skinning, morphing, light, shadow or environment code. — [r187 `GaussianSplat.js`](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/objects/GaussianSplat.js) [X]; [r187 example](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_gaussian_splat.html) [F]; [r186 release notes](https://github.com/mrdoob/three.js/releases/tag/r186) [X]
- The counting sort is approximate by design: it is "accurate to the resolution of `binCount`", and elements in the same depth bin "end up in an unspecified relative order". — [r187 `CountingSort.js`](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/gpgpu/CountingSort.js) [X]
- **Spark** (World Labs, MIT, version 2.4.0 of 19 October 2026) is "built for THREE.js and WebGL2"; its examples construct a `THREE.WebGLRenderer`. It reads splat distances back from the GPU and bucket-sorts them in a worker, so "the sort order lags the render by at least one frame"; draws all splats in one instanced call; merges with opaque meshes through the depth buffer; stores 16 bytes per splat. It has dual-quaternion skeletal animation (`SplatSkinning`), experimental linear-blend skinning since 2.0, and a shader-graph system for per-splat edits. Its changelog from 0.1.0 to 2.4.0 never mentions WebGPU. — [overview](https://github.com/sparkjsdev/spark/blob/HEAD/docs/docs/overview.md) [X]; [system design](https://github.com/sparkjsdev/spark/blob/HEAD/docs/docs/system-design.md) [F]; [new features 2.0](https://github.com/sparkjsdev/spark/blob/HEAD/docs/docs/new-features-2.0.md) [X]; [changelog](https://github.com/sparkjsdev/spark/blob/HEAD/CHANGELOG.md) [X]
- Spark's rule-of-thumb splat budgets: Quest 3 one million or fewer; Android phone 1 to 2 million; iPhone 1 to 3 million; computer 1 to 5 million (10 to 20 million or more on some desktops). It also warns that many splats packed into a small screen area (its example: 500,000 from one generated object) can bottleneck blending. — [performance doc](https://github.com/sparkjsdev/spark/blob/HEAD/docs/docs/performance.md) [F]
- **mkkellogg GaussianSplats3D** "is no longer in active development" and recommends Spark. It lists "sub-optimal performance on mobile devices" and visible artefacts on fast motion from its CPU sort, and composites only with objects that write depth. — [README](https://github.com/mkkellogg/GaussianSplats3D/blob/HEAD/README.md) [X]
- **antimatter15/splat** is WebGL 1, sorts on the CPU in a worker, drops view-dependent colour to keep files small, and now also points readers to Spark. — [README](https://github.com/antimatter15/splat/blob/HEAD/README.md) [X]
- **PlayCanvas** engine (MIT, v2.24.2 on 18 November 2026) has a compute radix sort on WebGPU with CPU fallback, splat shadows, streamed level of detail, and the proxy-mesh relighting script. Its performance guide says every Gaussian is sorted each frame and that fill rate is the main cost: "dozens or even hundreds of fragments" per pixel. — [releases](https://github.com/playcanvas/engine/releases) [X]; [performance doc](https://github.com/playcanvas/developer-site/blob/HEAD/docs/user-manual/gaussian-splatting/building/performance.md) [X]
- PlayCanvas reports for its WebGPU compute renderer on a phone: 77.6 fps at 1 million splats, 73.2 at 2 million, 52.7 at 3 million and 42.4 at 4 million, against 38.1 falling to 20.4 for WebGL 2. The table does not name the phone; a separate article names an iPhone 13 Pro Max but quotes a figure (78 fps at 4 million) that contradicts the table. Vendor-reported. — [PlayCanvas blog](https://blog.playcanvas.com/new-in-supersplat-webgpu-and-streaming-bring-huge-performance-wins) [S]; [radiancefields.com](https://radiancefields.com/supersplat-ships-compute-based-webgpu-rendering-and-automatic-streamed-lod) [S]
- **Babylon.js** (Apache 2.0) supports splat shadows, compound "parts" sorted together, and an opt-in WebGPU compute sort, with this caution: "on low-end GPUs, the asynchronous CPU worker can be faster while the camera is moving. Measure on your target hardware." — [splat doc](https://github.com/BabylonJS/Documentation/blob/HEAD/content/features/featuresDeepDive/mesh/gaussianSplatting.md) [X]
- **WebSplatter** (February 2026) proposes a wait-free radix sort for WebGPU; on a Redmi K70 Pro, rasterisation took 51.8% to 62.6% of frame time and sorting was not the bottleneck; many baseline viewers lost the graphics context on mobile. — [arXiv 2602.03207](https://arxiv.org/abs/2602.03207) [S]
- A W3C WebGPU splat demo uses a radix sort on desktop and a cheaper binning sort on mobile and says it "will be hard to get the desired performance on mobile devices without reducing the splat count". — [w3.org](https://www.w3.org/2026/splat/) [S]
- A desktop reference point from a native engine: the 6.1-million-splat "bicycle" scene at 1200×797 takes 6.3 ms per frame in Unity on an RTX 3080 Ti (4.5 ms rendering, 0.9 ms sorting) and 12.8 ms on an Apple M4 Max. That project's author says, as of November 2026, that he plans no further development and that mobile and web are untested. — [UnityGaussianSplatting README](https://github.com/aras-p/UnityGaussianSplatting/blob/HEAD/readme.md) [X]

**Animated avatars in the browser**

- **LAM_WebRender** (MIT) is a WebGL splat renderer published on npm that loads a LAM avatar archive and plays ARKit-style expression data produced by LAM's audio-to-expression model. It powers the client side of the OpenAvatarChat SDK. — [README](https://github.com/aigc3d/LAM_WebRender/blob/HEAD/README.md) [F]; [LAM README](https://github.com/aigc3d/LAM/blob/HEAD/README.md) [F]
- **Visionary** (Apache 2.0) runs WebGPU rendering with per-frame ONNX Runtime inference in the browser, ships as a three.js plug-in, and lists "neural avatars" among supported inputs. It requires a recent Chromium browser and does not support Ubuntu because of a half-float bug. — [README](https://github.com/Visionary-Laboratory/visionary/blob/HEAD/README.md) [X]. An aggregator summary gives 7.5 to 8.0 ms of inference per avatar and 50 to 55 ms for ten, hardware unstated. — [emergentmind](https://api.emergentmind.com/papers/2512.08478) [S]
- **Instant Skinned Gaussian Avatars** is built "entirely as a browser application using JavaScript and Three.js", with avatars in VRM format. — [arXiv 2510.13978](https://arxiv.org/abs/2510.13978) [S]
- The Zhejiang WebGPU avatar viewer (section 1) is the only source found that pairs a browser implementation with a phone frame rate and a resolution.

**File formats, download size, memory**

- **SOG** (PlayCanvas): quantised attributes stored as lossless WebP images, "typically yielding files ~15–20× smaller than an equivalent PLY". — [SOG spec](https://github.com/playcanvas/developer-site/blob/HEAD/docs/user-manual/gaussian-splatting/formats/sog.md) [X]
- **SPZ** (Niantic, MIT): "typically around 10x smaller than the corresponding .ply"; version 4 compresses each attribute stream with Zstandard. — [README](https://github.com/nianticlabs/spz/blob/HEAD/README.md) [X]
- **KSPLAT** is mkkellogg's format, which he says "still needs work, especially around compression". — [README](https://github.com/mkkellogg/GaussianSplats3D/blob/HEAD/README.md) [X]
- The glTF extension `KHR_gaussian_splatting` is "Complete, Ratified by the Khronos Group". — [extension README](https://github.com/KhronosGroup/glTF/blob/HEAD/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md) [X]
- Runtime memory in the Unity implementation: 28 bytes per splat without view-dependent colour, 36, 48 or 60 bytes with harmonics of degree 1, 2 or 3, plus 44 bytes of GPU memory per splat for sorted rendering. Third-order harmonics need 48 coefficients, "nearly 200 bytes per splat" uncompressed. — [UnityGaussianSplatting README](https://github.com/aras-p/UnityGaussianSplatting/blob/HEAD/readme.md) [X]; [antimatter15 README](https://github.com/antimatter15/splat/blob/HEAD/README.md) [X]

### Inferences
- A static head of 20,000 to 100,000 splats is 1% to 10% of the smallest published phone budget, so raw splat rendering of one head will run on phones. This is an extrapolation from scene budgets to a head, not a measurement; the dense-overdraw warning in Spark's guide applies to a head filling the screen at a few centimetres.
- Storage for a static 100,000-splat head is on the order of 20 to 25 MB uncompressed with third-order colour and roughly 1 to 2 MB in SOG or SPZ. An animated head multiplies this by its expression basis (per-splat deltas per blendshape) or adds a decoder network; no source read gives the size of a shippable animated avatar file.
- The project's renderer (three.js r187 WebGPU) and the one web engine with splat skinning (Spark, WebGL2) do not share a rendering context. Using the official r187 add-on means writing the per-splat deformation, expression blending and any relighting oneself.
- Because splats are blended without depth write, anything in the game that reads depth after them (depth of field, screen-space ambient occlusion, a screen-space skin blur, fog) will not see the head. Splats also do not receive shadow maps unless the engine adds that, which three.js's add-on and Spark do not document.
- Level of detail exists for static scenes (Spark's splat trees, PlayCanvas streamed SOG) by dropping and merging splats. No source describes level of detail for an animated avatar.

### Gaps
- No measurement of any splat renderer on an integrated desktop GPU was found.
- No frame rate was found for three.js r187's own add-on.
- I could not read the PlayCanvas blog or the WebSplatter paper to resolve the inconsistent phone numbers.

---

## 4. Generation without a capture session

### Takeaway
An avatar can be produced from a single image, which can itself be generated, so no person needs to sit for a capture. But every such model is trained on photographs, videos or scans of real people, the released weights are non-commercial, and none of the sources shows close-up, pore-level quality or relighting from generation alone.

### Cited Findings
- One-image models: LAM (1.4 s), GAGAvatar, GASP, CAP4D, MeshLAM, FA-LAM; Avat3r needs four images, SynShot about three. Sources as in section 1.
- Text-driven: **HeadStudio** (ECCV 2024) generates animatable Gaussian heads from text on top of FLAME 2020 and reports real-time rendering at 1024 resolution. — [README](https://github.com/ZhenglinZhou/HeadStudio/blob/HEAD/README.md) [X]; [Springer chapter](https://link.springer.com/chapter/10.1007/978-3-031-73411-3_9) [S]
- **Make-A-Character** (Alibaba, 2023; version 2 report January 2025) turns a text description into a "controllable, realistic, animatable" **mesh** character "compatible to standard CG pipelines". — [README](https://github.com/Human3DAIGC/Make-A-Character/blob/HEAD/README.md) [X]
- Generative adversarial route: **GGHead** produces Gaussian heads and is trained on the FFHQ photograph set. — [README](https://github.com/tobias-kirschstein/gghead/blob/HEAD/README.md) [X]
- Training-data provenance of what is actually released: LAM-20K is trained on VFHQ and NeRSemble; GAGAvatar on VFHQ. — [LAM README](https://github.com/aigc3d/LAM/blob/HEAD/README.md) [F]; [GAGAvatar README](https://github.com/xg-chu/GAGAvatar/blob/HEAD/README.md) [X]
- FFHQ is 70,000 Flickr photographs; the dataset is licensed CC BY-NC-SA 4.0 by NVIDIA, and individual images carry their own licences. — [FFHQ README](https://github.com/NVlabs/ffhq-dataset/blob/HEAD/README.md) [X]
- NeRSemble data requires signing its terms of use before download. — [Gaussian Head Avatar README](https://github.com/YuelangX/Gaussian-Head-Avatar/blob/HEAD/README.md) [F]
- Synthetic priors: GASP's prior is trained on synthetic humans and the authors say this "introduces a domain gap" they must correct. — [Microsoft Research page](https://www.microsoft.com/en-us/research/publication/gasp/) [S]. Microsoft's published synthetic face sets (Face Synthetics, DigiFace-1M) are released for non-commercial research only. — [FaceSynthetics README](https://github.com/microsoft/FaceSynthetics/blob/HEAD/README.md) [X]; [DigiFace-1M README](https://github.com/microsoft/DigiFace1M/blob/HEAD/README.md) [X]
- The parametric models underneath are scan-derived too: FLAME is "learned from over 33,000" 3D scans, with identity from 3,800 subjects; the ICT face model's identity modes come from "light stage scan data", and its full model from 4,000 scans. — [FLAME-Universe README](https://github.com/TimoBolkart/FLAME-Universe/blob/HEAD/README.md) [X]; [ICT-FaceKit README](https://github.com/ICT-VGL/ICT-FaceKit/blob/HEAD/README.md) [X]
- Quality signal: a third-party benchmark page lists GASP at roughly 20.7 dB PSNR for single-image avatars on NeRSemble. Not checked against the paper. — [wizwand](https://www.wizwand.com/paper/68fa762d1e209131cea6bb00) [S]

### Inferences
- For a project that forbids third-party scans, this route offers no clean option. The Gaussian avatar, the generator that made it, the rig it hangs on (FLAME) and even the "synthetic" training sets all descend from scans or photographs of real people. From memory [M], Microsoft's synthetic face generator was itself built from about 500 real head scans; not checked.
- A one-shot avatar is a hallucinated reconstruction of one photograph at about 512-pixel training resolution with 20,000 to 80,000 Gaussians. Compared with RGCA's million Gaussians for sub-millimetre detail, it should be expected to look soft at a few centimetres. This is my reading of the numbers, not a published comparison.
- Using a generated portrait as the input image moves the provenance question to the image generator rather than removing it.

### Gaps
- Meta's text-conditioned codec-avatar generator (GenCA) and commercial avatar generators did not appear in the sources I could reach; their licences were not assessed.
- No published close-up evaluation (face filling the frame at 2K or higher) of any one-shot Gaussian avatar was found.
- The licence terms of VFHQ and the exact NeRSemble terms were not opened.

---

## 5. Licences

### Takeaway
None of the leading methods can be shipped commercially as released: the code, the weights, the training data, the original splat rasteriser or FLAME is research-only in every case checked. The renderers and file formats, by contrast, are permissively licensed.

### Cited Findings

| Component | Licence as read | Source |
|---|---|---|
| GaussianAvatars code | CC BY-NC-SA 4.0, plus a Toyota Motor Europe statement that "any commercial use ... without an express license agreement ... is strictly prohibited"; bundles the Inria splatting licence | [README](https://github.com/ShenhanQian/GaussianAvatars/blob/HEAD/README.md) [F] |
| Gaussian Head Avatar code | Tsinghua licence: non-commercial research, education or art only; explicitly prohibits use in "web services ... mobile applications, or video games" | [LICENSE](https://github.com/YuelangX/Gaussian-Head-Avatar/blob/HEAD/LICENSE) [X] |
| SplattingAvatar code | CC BY-NC-SA 4.0, "any commercial use should get formal permission first" | [README](https://github.com/initialneil/SplattingAvatar/blob/HEAD/README.md) [X] |
| 3D Gaussian Blendshapes code | GPL-3.0 licence file; needs FLAME 2020 | [LICENSE](https://github.com/zjumsj/GaussianBlendshapes/blob/HEAD/LICENSE) [X] |
| GAGAvatar code | MIT; FLAME and tracker assets "have separate setup or license requirements" | [LICENSE](https://github.com/xg-chu/GAGAvatar/blob/HEAD/LICENSE) [X], [README](https://github.com/xg-chu/GAGAvatar/blob/HEAD/README.md) [X] |
| LAM code / LAM weights / LAM web renderer | Apache 2.0 / CC BY-NC 4.0 / MIT | [LICENSE](https://github.com/aigc3d/LAM/blob/HEAD/LICENSE) [X], [LICENSE_WEIGHT](https://github.com/aigc3d/LAM/blob/HEAD/LICENSE_WEIGHT) [X], [WebRender README](https://github.com/aigc3d/LAM_WebRender/blob/HEAD/README.md) [F] |
| RGCA code and Goliath data; Ava-256 | CC BY-NC 4.0; data access gated | [goliath LICENSE](https://github.com/facebookresearch/goliath/blob/HEAD/LICENSE) [X], [ava-256 README](https://github.com/facebookresearch/ava-256/blob/HEAD/README.md) [F] |
| URAvatar | no code or weights linked | [page source](https://github.com/junxuan-li/urgca-website/blob/HEAD/index.html) [F] |
| CAP4D, BecomingLit | CC BY-NC 4.0; both need FLAME 2023 | [CAP4D LICENSE](https://github.com/felixtaubner/cap4d/blob/HEAD/LICENSE) [X], [BecomingLit LICENSE](https://github.com/jonathsch/becominglit/blob/HEAD/LICENSE) [X] |
| FLARE (relightable mesh avatars) | non-commercial scientific research | [README](https://github.com/sbharadwajj/flare/blob/HEAD/README.md) [X] |
| Original Inria 3D Gaussian splatting code | "non-commercially, i.e., for research and/or evaluation purposes only" | [LICENSE](https://github.com/graphdeco-inria/gaussian-splatting/blob/HEAD/LICENSE.md) [X] |
| gsplat (alternative rasteriser) | Apache 2.0 | [LICENSE](https://github.com/nerfstudio-project/gsplat/blob/HEAD/LICENSE) [X] |
| three.js, Spark, PlayCanvas engine, SPZ | MIT | [three.js](https://github.com/mrdoob/three.js/blob/r187/LICENSE) [X], [Spark](https://github.com/sparkjsdev/spark/blob/HEAD/LICENSE) [X], [PlayCanvas](https://github.com/playcanvas/engine/blob/HEAD/LICENSE) [X], [SPZ](https://github.com/nianticlabs/spz/blob/HEAD/LICENSE) [X] |
| Babylon.js, Visionary | Apache 2.0 | [Babylon.js](https://github.com/BabylonJS/Babylon.js/blob/HEAD/license.md) [X], [Visionary](https://github.com/Visionary-Laboratory/visionary/blob/HEAD/README.md) [X] |

- **FLAME.** The Max Planck project page states that the "FLAME 2023 Open" model is released under CC BY 4.0, while earlier versions are available only for non-commercial research. I could not open the page or the licence text; this comes from a search extract. — [flame.is.tue.mpg.de](https://flame.is.tue.mpg.de/) [S]
- **Alternative rig.** The light ICT-FaceKit model is MIT-licensed: 100 identity modes and 53 expression shapes that follow Apple ARKit naming. Its fuller model (albedo modes, more identity modes) "will be released under a different USC specific license". — [README](https://github.com/ICT-VGL/ICT-FaceKit/blob/HEAD/README.md) [X]; [LICENSE](https://github.com/ICT-VGL/ICT-FaceKit/blob/HEAD/LICENSE) [X]
- Face-fitting tools commonly used to drive these avatars are also research-only: DECA and MICA ("non-commercial scientific research purposes"); InsightFace's code is MIT but its models are "for non-commercial research purposes only". — [DECA LICENSE](https://github.com/yfeng95/DECA/blob/HEAD/LICENSE) [X]; [MICA LICENSE](https://github.com/Zielon/MICA/blob/HEAD/LICENSE) [X]; [InsightFace README](https://github.com/deepinsight/insightface/blob/HEAD/README.md) [X]

### Inferences
- A legally clean splat avatar would need: one's own training code on an Apache-licensed rasteriser, a rig that is either FLAME 2023 Open (if the CC BY claim holds for the file a given method needs), ICT-FaceKit light, or one's own, and training data with consent and commercial rights. That last item is a capture session or a licensed dataset, which collides with the "no capture, no third-party scans" constraints.
- GAGAvatar is the only method read whose code licence would allow commercial use, and its released weights still rest on VFHQ video and FLAME.

### Gaps
- The FLAME licence page was blocked; whether the "with jaw rotation" FLAME 2023 file that GaussianAvatars and BecomingLit require is covered by the CC BY variant is unconfirmed.
- Licences of HRAvatar, GASP, SynShot, Avat3r, the Zhejiang WebGPU avatar code and VFHQ were not found or not opened.
- Nothing here is legal advice; no licence was read to the end except where marked [F].

---

## 6. Hybrid approaches on a conventional mesh

### Takeaway
The research frontier is itself converging on hybrids: a mesh with a decoded or learned texture for skin, and a small number of Gaussians for hair. The pieces that transfer to a mesh-plus-shader head without importing anyone's scans are expression-driven wrinkle maps and small learned correctives; neural texture compression has no browser path today.

### Cited Findings
- GPiCA decodes a face mesh, an RGBA texture and 16,384 Gaussians (three quarters on hair), treating the mesh as a semi-transparent layer inside the splat renderer; the authors claim the realism of pure Gaussian avatars at mesh-avatar rendering cost. — [arXiv 2512.15711](https://arxiv.org/abs/2512.15711) [S]
- MeGA (CVPR 2025) is a "hybrid mesh-Gaussian head avatar": mesh for the face, Gaussians for hair, with hair swappable between subjects. — [README](https://github.com/conallwang/MeGA/blob/HEAD/README.md) [X]
- MeshLAM predicts per-vertex offsets from a FLAME template plus a high-resolution UV texture in one pass, with 8,000 vertices. — [page source](https://github.com/meshlam/meshlam.github.io/blob/HEAD/index.html) [X]
- GTAvatar and TeGA define Gaussian attributes in a template's UV space, which makes them editable like textures. — [arXiv 2512.09162](https://arxiv.org/abs/2512.09162) [S]; [arXiv 2505.05672](https://arxiv.org/abs/2505.05672) [S]
- Microsoft's "Mesh-Tension Driven Expression-Based Wrinkles" (WACV 2023) stores wrinkles for stretched and compressed skin in separate albedo and displacement maps and blends neutral, expanded and compressed maps using local mesh tension as the weight. It is per-identity and not a neural network. — [arXiv 2210.03529](https://arxiv.org/abs/2210.03529) [S]
- FLARE (SIGGRAPH Asia 2023) learns animatable, relightable **mesh** avatars from monocular video. — [README](https://github.com/sbharadwajj/flare/blob/HEAD/README.md) [X]
- SqueezeMe shows that a heavy avatar decoder can be distilled to linear maps with 8-bit weights and run on a headset chip, at some quality cost; a variant with no decoder at all "significantly degrades on all metrics". — [arXiv 2412.15171](https://arxiv.org/abs/2412.15171) [S]
- NVIDIA's neural texture compression kit compresses all maps of one material into latents plus a small network decoded per sample; it targets Direct3D 12 and Vulkan with vendor-specific inference extensions, and its README has no web target. A search found no browser implementation. — [RTXNTC README](https://github.com/NVIDIA-RTX/RTXNTC/blob/HEAD/README.md) [X]
- NVIDIA "RTX Neural Faces" (announced January 2025) takes "a simple rasterized face plus 3D pose data" and has a generative model infer a more natural face, trained per face on thousands of offline images. Launch coverage said it "won't be in games just yet"; I found no shipped title. — [NVIDIA developer blog](https://developer.nvidia.com/blog/nvidia-rtx-neural-rendering-introduces-next-era-of-ai-powered-graphics-innovation) [S]; [PC Gamer](https://pcgamer.com/hardware/graphics-cards/nvidia-rtx-50-series-and-dev-kit-show-that-rasterization-is-old-news-and-were-now-firmly-in-the-era-of-ai-rendering) [S]
- In-browser neural inference per frame is demonstrated: Visionary runs ONNX models each frame on WebGPU. — [README](https://github.com/Visionary-Laboratory/visionary/blob/HEAD/README.md) [X]

### Inferences
- Three hybrid ideas fit a procedural, scan-free head. (a) Tension-driven wrinkle maps: the driving signal (mesh stretch and compression) is available from the project's own geometry, and the maps can be authored procedurally instead of from scans. (b) A few thousand Gaussians, or plain alpha cards, only for brows, lashes and hairline, where meshes are weakest; three.js r187's add-on could draw them, but they would need lighting written by hand. (c) A tiny multilayer perceptron in the shader as a corrective, trained offline on the project's own renders.
- A learned, expression-dependent texture decoder in the Meta style needs per-person capture data, so it does not help a no-capture project.
- A screen-space generative face pass is native-GPU, vendor-locked and identity-altering (see section 7), and has no browser form.

### Gaps
- Unreal Engine's learned deformers, Meta's 2021 Pixel Codec Avatars and Disney Research's dynamic-texture work were named in the brief but could not be opened; nothing about them is asserted here.
- No source gives a measured cost for evaluating a small network per pixel or per vertex in three.js's WebGPU shading language.

---

## 7. Verdict material: comparisons, practitioner statements, shipped products

### Takeaway
I found no shipped game or web product that uses a Gaussian or neural head for an in-world character lit by the scene, and no published side-by-side against a conventionally rendered digital human. What has shipped is telepresence (Apple Personas) and chat avatars; what practitioners say about splats in games is consistently that lighting is baked in and animation is unstandardised.

### Cited Findings
- **Shipped, telepresence.** Apple Vision Pro Personas use Gaussian splatting (new engine in visionOS 26); reviewers note better hair, lashes and skin, and that beards still limit mouth movement. Native headset, not web. — [radiancefields.com](https://radiancefields.com/apple-confirms-personas-use-gaussian-splatting) [S]; [CNET via reader](https://hn.jakechampion.name/reader/https://www.cnet.com/tech/computing/apple-talks-to-me-about-vision-pro-personas-where-is-our-virtual-presence-headed) [S]
- **Announced, telepresence.** Meta is bringing Codec Avatars to consumers as "Hologram": early access in the US this autumn for WhatsApp calls on Ray-Ban Display glasses, full-body with VR glasses planned for spring 2027; UploadVR reports the launch version "will not be a truly volumetric implementation". — [UploadVR](https://uploadvr.com/meta-hologram-realistic-avatars-meta-vr-glasses-connect-2026/) [S]; [Road to VR](https://roadtovr.com/hands-on-meta-hologram-avatars-vr-glasses/) [S]
- **Shipped, web chat avatar.** Alibaba's open-source OpenAvatarChat uses LAM heads rendered in the browser with WebGL. The head is a talking bust, not a character in a lit scene. — [LAM README](https://github.com/aigc3d/LAM/blob/HEAD/README.md) [F]; [OpenAvatarChat README](https://github.com/HumanAIGC-Engineering/OpenAvatarChat/blob/HEAD/README.md) [X]
- **Splats as game characters.** In a browser first-person-shooter demo built with PlayCanvas splats, the baked lighting "looks good on the gun, but doesn't apply very well to the characters, and there aren't any shadows". — [Tom's Hardware](https://www.tomshardware.com/software/programming/developer-creates-a-basic-first-person-shooter-game-using-gaussian-splats-and-you-can-play-it-for-free-in-your-browser) [S]
- **Animation.** A trade interview notes there is "no standardized way of creating or representing animated splats yet". — [PC Gamer](https://www.pcgamer.com/hardware/a-little-known-rendering-technique-that-can-create-low-cost-photo-real-graphics-may-be-about-to-have-its-big-moment-in-game-development/) [S]
- **Tool makers on maturity.** Spark's own overview: tools for creating, editing and rendering splats "are in their infancy", and "we expect new techniques will be developed for recoloring/relighting, animation". — [Spark overview](https://github.com/sparkjsdev/spark/blob/HEAD/docs/docs/overview.md) [X]
- **Practitioner workarounds** all reintroduce a mesh: a hidden mesh for dynamic lights, a shadow catcher for collisions, proxy geometry with real materials (Volinga plugin), PlayCanvas's proxy-mesh relighting. — [xraispotlight](https://xraispotlight.substack.com/p/relighting-gaussian-splatting-a-deep) [S]; [PlayCanvas relighting doc](https://github.com/playcanvas/developer-site/blob/HEAD/docs/user-manual/gaussian-splatting/building/relighting.md) [F]
- **Generative face rendering in games met resistance.** NVIDIA's DLSS 5 neural rendering (shown March 2026) was criticised for making faces look "overly detailed, almost airbrushed", changing makeup and mood, and reportedly lightening darker skin tones; NVIDIA's chief executive called critics "completely wrong" and the company says developers keep artistic control. Coverage is secondary and opinion-heavy. — [RedShark](https://www.redsharknews.com/nvidia-dlss-5-neural-rendering-backlash) [S]; [Gfinity](https://www.gfinityesports.com/article/nvidia-ceo-calls-dlss-5-critics-completely-wrong-amid-backlash) [S]
- **Cost scaling.** Per-Gaussian relighting "scales linearly with the number of avatars". — [arXiv 2501.14726](https://arxiv.org/abs/2501.14726) [S]

### Inferences
- The absence of a shipped in-world, relit Gaussian character two and a half years after RGCA, while telepresence products have shipped, is itself evidence: the technology fits "reproduce this captured person under mild lighting" and does not yet fit "author a character that lives under a game's lighting".
- Controllability is the recurring complaint in the generative-face coverage: the model changes the art. For a project whose face is defined by a table of numbers, a learned renderer would break the link between a parameter and what appears on screen.

### Gaps
- No published side-by-side of a Gaussian or codec avatar against a MetaHuman-class rendered head was found (searches were limited and many hosts were blocked).
- No on-record statement from a game studio's character team about splat avatars was found.
- Absence of a shipped product is a negative result from a limited search, not proof that none exists.

---

## 8. Addition: an avatar builder that adjusts the parametric head from reference photographs, with a vision-language model in the loop

### Takeaway
Fitting a few-hundred-parameter game head to a photograph is a solved-enough problem with a published, deployed precedent (NetEase, 2019) that used optimisation through a learned imitation of the game's renderer, not a language model. Vision-language models editing 3D parameters by looking at renders exist as research systems and benchmarks, and the benchmark verdict is that they still struggle at tasks human artists find easy. The reliable design is landmarks and optimisation for geometry, plain colour statistics for tone, and the language model as a critic for attributes that have no landmark.

### Cited Findings

**(1) Fitting a parametric head to one or a few photographs**

- MediaPipe Face Mesh "estimates 468 3D face landmarks in real-time even on mobile devices" and derives a metric face transform. Its successor, the Face Landmarker task, runs in the browser through the `@mediapipe/tasks-vision` WebAssembly package and can also output face blendshape scores and a facial transformation matrix. The repository is Apache 2.0. — [Face Mesh doc, v0.10.9](https://github.com/google-ai-edge/mediapipe/blob/v0.10.9/docs/solutions/face_mesh.md) [X]; [web vision README](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md) [X]; [`face_landmarker.h`](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker.h) [X]; [LICENSE](https://github.com/google-ai-edge/mediapipe/blob/HEAD/LICENSE) [X]
- Other browser options: **Human** (MIT) runs on WebGPU, WebGL or WebAssembly and bundles 3D face detection, iris analysis, and age, gender and emotion prediction; **face-api.js** (MIT) offers 68-point landmarks and age and gender estimation on TensorFlow.js. — [Human README](https://github.com/vladmandic/human/blob/HEAD/README.md) [X]; [Human LICENSE](https://github.com/vladmandic/human/blob/HEAD/LICENSE) [X]; [face-api.js README](https://github.com/justadudewhohacks/face-api.js/blob/HEAD/README.md) [X]; [face-api.js LICENSE](https://github.com/justadudewhohacks/face-api.js/blob/HEAD/LICENSE) [X]
- Research-grade fitters are not shippable: DECA and MICA are non-commercial; Pixel3DMM depends on FLAME and MICA; InsightFace models are non-commercial. — sources as in section 5; [Pixel3DMM README](https://github.com/SimonGiebenhain/pixel3dmm/blob/HEAD/README.md) [X]
- Accuracy of single-image shape reconstruction on the NoW benchmark (neutral face, scan-to-mesh distance; median / mean / standard deviation in mm): MICA 0.90 / 1.11 / 0.92; SHeaP 0.95 / 1.18 / 0.99; DECA 1.09 / 1.38 / 1.18. Pixel3DMM is reported at 0.87 / 1.07 / 0.89 by secondary pages. On the stricter metrical variant, MICA is listed at 1.08 mm median and DECA at 1.35. — [NoW leaderboard](https://now.is.tue.mpg.de/nonmetricalevaluation.html) [S]; [NoW metrical leaderboard](https://now.is.tue.mpg.de/metricalevaluation.html) [S]
- Classic fitting by differentiable rendering: NextFace fits a morphable model in three stages (landmarks for pose and expression; then identity, statistical albedo and spherical-harmonic lighting by photo-consistency through a ray tracer; then per-pixel albedo refinement). Its README says MediaPipe landmarks give "much stable and accurate results" compared with the older FAN detector. Code is GPL-3.0. — [NextFace README](https://github.com/abdallahdib/NextFace/blob/HEAD/README.md) [X]
- The differentiable rasteriser most research code uses, nvdiffrast, is under an "Nvidia Source Code License (1-Way Commercial)". — [LICENSE](https://github.com/NVlabs/nvdiffrast/blob/HEAD/LICENSE.txt) [X]
- **The closest precedent to this project's situation.** NetEase's "Face-to-Parameter Translation" (ICCV 2019) creates a game character from one photograph by optimising the game's own facial parameters: 264 for male and 310 for female characters. Because the game engine is not differentiable, they trained a convolutional "imitator" on 20,000 random parameter-and-render pairs and ran gradient descent on the parameters through it. It was deployed in the game Justice and reportedly used over a million times. A 2020 follow-up predicts the parameters directly for speed and robustness. — [arXiv 1909.01064](https://arxiv.org/abs/1909.01064) [S]; [arXiv 2008.07132](https://arxiv.org/abs/2008.07132) [S]; [Synced](https://medium.com/syncedreview/chinese-gaming-giant-netease-leverages-ai-to-create-3d-game-characters-from-selfies-487f8de0f0c7) [S]
- Capacity of small identity spaces: FLAME's identity space comes from 3,800 subjects; the MIT-licensed ICT model has 100 identity modes. — [FLAME-Universe README](https://github.com/TimoBolkart/FLAME-Universe/blob/HEAD/README.md) [X]; [ICT-FaceKit README](https://github.com/ICT-VGL/ICT-FaceKit/blob/HEAD/README.md) [X]

**(2) Skin tone, eye colour, age cues, hair and brows from a photograph**

- Skin tone from one photograph is fundamentally ambiguous with scene lighting. The TRUST paper (ECCV 2022) "identif[ies], analyze[s] and quantif[ies] the problem of biased facial albedo estimation", resolves it by using the whole scene to disambiguate light from skin, and reports 57% lower total error on its FAIR benchmark than the previous best (35% lower average ITA error, 77% lower bias). Its code and model are non-commercial. — [TRUST README](https://github.com/HavenFeng/TRUST/blob/HEAD/README.md) [X]
- Ready-made browser estimators exist for iris, age and gender (Human; face-api.js), as above.

**(3) A vision-language model in the loop, editing a table of numbers**

- **BlenderAlchemy** (ECCV 2024) is the canonical published loop: a vision-language model acts as "edit generator" and as "state evaluator", proposing edits to a Blender program, rendering, comparing with a text or image target, and searching with a set breadth and depth (the shipped example run is named `tune_d4_b8`: depth 4, breadth 8). One of its packaged demos edits **face blendshape** values (`blendshapes_face.yaml`, a "winky face"). The authors describe the results as "simple but tedious Blender editing sequences" and observed the best performance with GPT-4V at the time. — [README](https://github.com/ianhuang0630/BlenderAlchemyOfficial/blob/HEAD/README.md) [X]
- **BlenderGym** (CVPR 2025 highlight) benchmarks exactly this task shape: reconstruct a goal scene from a start scene by editing code, across 245 scenes covering object placement, blend shapes, geometry, lighting and materials. Its finding: "even the state-of-the-art VLM system struggles" with tasks that are relatively easy for human Blender users. — [arXiv 2504.01786](https://arxiv.org/abs/2504.01786) [S]; [repository](https://github.com/richard-guyunqi/BlenderGym-Open/blob/HEAD/README.md) [X]
- **VIGA** (January 2026, MIT) is "an analysis-by-synthesis code agent": one agent alternates between a generator role that writes scene programs and a verifier role that "examines rendered output from multiple viewpoints, identifies visual discrepancies, and provides feedback", keeping a memory of plans, code diffs and renders; it needs no fine-tuning. — [README](https://github.com/Fugtemypt123/VIGA/blob/HEAD/README.md) [X]
- **LL3M** has language-model agents write Blender code and "automatically self-critique using code and visuals"; its server was shut down when the model it depended on was retired. **3D-GPT** has agents drive a procedural generator's parameters. — [LL3M README](https://github.com/threedle/ll3m/blob/HEAD/README.md) [X]; [3D-GPT README](https://github.com/Chuny1/3DGPT/blob/HEAD/README.md) [X]
- For avatars specifically, Make-A-Character maps a text description onto a parametric mesh character; I could confirm the claim but not the mechanism. — [README](https://github.com/Human3DAIGC/Make-A-Character/blob/HEAD/README.md) [X]

**(4) Projecting the photograph itself as texture**

- A photograph carries its lighting, expression and occlusions. The FFHQ-UV authors list "even illuminations, neutral expressions, and cleaned facial regions" as the "desired characteristics for rendering realistic 3D face models under different lighting conditions", and needed a StyleGAN-based editing stage to normalise each photograph before extracting a texture. — [FFHQ-UV README](https://github.com/csbhr/FFHQ-UV/blob/HEAD/README.md) [X]
- Separating light from skin requires an explicit lighting estimate: NextFace estimates diffuse, specular and roughness maps together with nine bands of spherical-harmonic light, with symmetry and smoothness regularisers "to avoid overfitting and add robustness against lighting conditions". HRAvatar leans on a separate intrinsic-decomposition network for albedo. — [NextFace README](https://github.com/abdallahdib/NextFace/blob/HEAD/README.md) [X]; [HRAvatar README](https://github.com/Pixel-Talk/HRAvatar/blob/HEAD/README.md) [X]

### Inferences
- **What a few dozen to a few hundred shape numbers can capture.** Overall head and jaw proportions, nose, lip and eye geometry to roughly a millimetre on a neutral face, judging by the NoW figures (which are for learned regressors with strong priors, not for landmark fitting alone). They cannot capture skin micro-detail, moles, scars, asymmetries finer than the basis, hair, or anything about appearance. Likeness in practice depends heavily on those omitted things plus hairline, brows and tone.
- **Landmark fitting versus language-model editing.** Landmark optimisation is metric, repeatable and cheap but blind to everything without a landmark and weak in depth from a single frontal photograph (nose projection, jaw depth). A language model can judge "brows too thin, face too long, looks older than the reference" but is poor at metric distances and inconsistent between runs; BlenderGym's result is the published caution. The hybrid that follows from both: optimise landmarks and silhouette first, then let the language model propose bounded changes to the remaining semantic parameters, accept a change only if an objective score (landmark error, a face-embedding or perceptual distance on the render) does not get worse, and cap the number of rounds.
- **Iteration count against a 30-second rebuild.** BlenderAlchemy's example budget is 4 rounds of 8 candidates, 32 renders. At 30 seconds per rebuild that is 16 minutes if run serially, a few minutes if candidates rebuild in parallel workers. Gradient-free optimisation over hundreds of parameters by full rebuilds is not practical at that cost. NetEase's answer applies directly: sample the builder offline (their 20,000 samples would be about 170 worker-hours at 30 seconds each), train a small imitator network from parameters to landmarks or to a low-resolution render, and optimise through that in milliseconds. A cheaper first step is a landmark-only fast path that evaluates where a few dozen named points land without rebuilding the full head.
- **Tone and colour.** Do not ask the language model for colour values. Sample skin from landmark-defined patches (cheeks, forehead), estimate the illuminant from the whole image or the eye whites, and map to the tone tables; expect error under coloured or hard light, as the TRUST work documents. Iris colour can be sampled the same way from iris landmarks. Hair and brow style are classification problems that suit the language model.
- **Projected photo texture and relighting.** Using the photograph as the albedo bakes its shading, highlights and shadows into the skin, so under the game's moving sun the face is lit twice: nose and brow shadows stay put, the specular highlight is painted on, and tone shifts with the photo's white balance. It also carries the pictured person's exact likeness into the asset. If used at all, it should be a low-frequency tint and feature-placement guide after de-lighting, not the skin texture.
- **Privacy, consent and likeness (my summary from general knowledge; no legal source was opened in this session).** A face photograph processed to derive a face model is likely to be treated as biometric or at least sensitive personal data in several jurisdictions (the EU's GDPR special-category rules, Illinois's biometric privacy act, and similar state laws), and a recognisable avatar of a real person engages likeness and publicity rights, especially for someone other than the uploader. The low-risk design is to do all detection and fitting on the device, never upload or store the photograph, store only the resulting parameter table, require the user to confirm they are the person pictured or have that person's permission, refuse or warn on photos of minors and public figures, and state all of this plainly. If a hosted language model sees the photograph, that is a transfer to a third party and needs explicit consent; sending it only renders and a text description of differences avoids that. This needs review by a lawyer before launch.

### Gaps
- The MediaPipe Face Landmarker model card (landmark count, blendshape count, accuracy, intended-use limits) could not be opened. From memory [M] the current model outputs 478 landmarks including irises and 52 blendshape scores.
- BlenderAlchemy's and BlenderGym's success rates per iteration count, and the size of the human-versus-model gap, were not retrieved.
- I found no published system or product in which a vision-language model iteratively tunes avatar identity parameters against a photograph. Searches were cut short by the search budget, so this is a weak negative.
- No source was read on the accuracy of eye-colour, hair or age estimation from single photographs, or on perceptual likeness scores for parametric fits.
- No browser-side differentiable renderer was found or assessed.
- Whether MediaPipe's model files (as distinct from the repository) carry additional terms was not checked.

---

## 9. Assessment (my synthesis): does this route beat a mesh-plus-shader head for this browser game?

### Takeaway
No. As of November 2026 a learned or Gaussian head is the weaker choice for this project on five of its seven stated needs, and on two of them (lighting by the game's own sun and sky without a captured person, and legal shippability without third-party scans) it currently has no workable answer at all. Parts of the research are worth borrowing onto the mesh.

### Inferences

**Fit against each stated need**

| Need | Learned / Gaussian head today | Verdict |
|---|---|---|
| Lit by the game's changing sun and sky | Only light-stage-trained models do this well (RGCA, BecomingLit), or Meta's unreleased universal prior (URAvatar). Monocular methods approximate it. One-shot generators have baked lighting. None handles the scene's local shadows. | Fails without capture |
| Expressions, head and eye motion, later speech | Good: FLAME or ARKit-style control is standard; LAM has an audio-to-expression model. Explicit gaze control only in RGCA-class models. | Meets |
| Sits on a procedural mesh body in three.js r187 WebGPU | r187 has an official but minimal static splat add-on. Skinned splats exist in Spark, which is WebGL2-only. Neck seam and matched shading between a splat head and a mesh body are not addressed by any source. | Possible with substantial custom work |
| Runs locally on desktop and phones | Splat count for one head is small. Blendshape-style avatars reach 110 to 120 FPS on flagship phones by the authors' own figures; the relightable ones are documented only on desktop cards or headsets. Integrated desktop GPUs: no data. | Meets only for non-relightable variants |
| A few centimetres to tens of metres, with levels of detail | Close-up sharpness needs about a million Gaussians and light-stage data; one-shot models have 20,000 to 80,000. No avatar level-of-detail scheme found. | Fails at the near end |
| Generated without a capture session | One image in, avatar out exists; quality and relighting are the weak points. | Partly |
| Legally shippable in a public web app | Every leading method is non-commercial in code, weights, data, rasteriser or rig, and all descend from scans or photographs of real people. | Fails |

**Why the mesh route is stronger here.** The project's head is authored from numbers, must respond to arbitrary game lighting, and must be clean of third-party scans. A mesh with a physically based skin shader gets correct response to any light, shadows in both directions, depth-buffer participation and level of detail from the engine for free, and its provenance is the project's own code. The learned route's advantage is reproducing a specific captured person with hair and micro-detail that are hard to author, which is not what this project needs.

**What would have to be true for the learned route to be the better one**

1. A relightable universal prior of URAvatar quality is released with weights, under a licence that permits commercial web use, trained on data whose subjects consented to that use.
2. The project accepts that such a prior is built from scans of real people, or someone trains one purely on procedurally generated humans and shows it closes the domain gap at close range.
3. Its runtime is distilled to linear or small-network form (as SqueezeMe and the Zhejiang WebGPU work do for bodies) *with relighting included*, and is shown at interactive rates on a phone and on an integrated desktop GPU at stated resolution.
4. A WebGPU three.js path exists for deforming, lighting and shadowing splats, including receiving the scene's shadow maps and writing depth or an equivalent for post-processing.
5. Identity can be created from text or from the project's parameter table, not only from a photograph of a person, at a quality that holds at a few centimetres.
6. The neck seam and shading match with a mesh body are solved.

Items 1, 3 and 4 are plausible within a few years on the evidence of the direction of travel (URAvatar, GPiCA, three.js adding splats to core). Items 2 and 5 conflict with how these models get their realism.

**What is worth taking from this research onto the mesh**

- Expression-driven wrinkle maps weighted by mesh tension, authored procedurally.
- Gaussians or fine alpha geometry only where meshes are weakest: lashes, brows, hairline, stubble. This is where Meta's own hybrid spends three quarters of its splat budget.
- A small learned corrective or imitator network trained on the project's own renders, both for shading residuals and as the fast forward model the avatar builder needs.
- The avatar-builder design in section 8: landmarks and optimisation for shape, colour statistics for tone, a vision-language model as bounded critic, everything on the device.

### Gaps
- This assessment rests on abstracts, READMEs, licence files, vendor documentation and search extracts; no paper was read in full, and no method was run. The frame-rate picture for phones and integrated GPUs is thin, and where I reason from desktop or headset numbers to phones I have said so.
- I did not find, and so could not weigh, any direct visual comparison between a relightable Gaussian head and a well-made mesh head under the same game lighting. A side-by-side test with the project's own scene would be the decisive evidence.
