# Skin appearance and shading: real-time photoreal human skin (state as of November 2026)

How to read these notes. Every claim carries one of these marks:

- **[SRC]** read at the source in this session (the file was fetched and read; for Unreal Engine the "source" is a public GitHub mirror of Epic's code, UE 4.26.2 or UE 5.3.2, named in the link).
- **[EXT]** taken from a web-search extract only (page not opened).
- **[REC]** recalled from training knowledge, not verified in this session; the link is the canonical place where it is printed but was not opened.
- **[CALC]** computed in this session from [SRC] numbers (the arithmetic is shown or trivially reproducible).

Research conditions that limit these notes: this session could reach only GitHub (raw files and code search). `developer.nvidia.com`, `dev.epicgames.com`, `docs.unity3d.com`, `iryoku.com`, `advances.realtimerendering.com`, `graphics.pixar.com`, `therealmjp.github.io`, `threejs.org`, `doc.babylonjs.com`, `arxiv.org`, `dl.acm.org`, `en.wikipedia.org` were all refused by the network policy, and the shared web-search budget ran out after seven searches. So formulas and constants are quoted from shipping source code wherever possible (Jimenez's SeparableSSS, Epic's shaders, Unity HDRP, three.js r187, Godot, Babylon.js, Filament) and papers that could not be opened are marked [REC]. No GPU timing was measured; every millisecond figure below is an estimate and is labelled as such.

Units used throughout: lengths in millimetres unless stated; colours are linear sRGB (Rec. 709 primaries) unless stated.

---

## 1. Subsurface scattering in real time: the methods, their profile formulas, radii and costs

### Takeaway
Two families ship today: (a) a screen-space diffusion pass over the lit diffuse buffer (Jimenez separable Gaussians, now mostly replaced by importance-sampled Burley normalised diffusion in Unreal, Unity HDRP and Babylon.js), which needs diffuse lighting separated from specular plus an extra pass; and (b) forward, single-shader approximations that bend the diffuse term by curvature (Penner's pre-integrated LUT, or its texture-free spherical-Gaussian form shipped in The Order: 1886). For Caucasian skin the profile is very red-dominant: an RMS scatter width of about 1.2 mm in red, 0.26 mm in green and 0.16 mm in blue (d'Eon's measured sum of Gaussians), or Burley shape parameter d of about (0.76 to 1.1, 0.33 to 0.48, 0.20 to 0.31) mm.

### Cited Findings

**1.1 The measured skin profile (d'Eon, Luebke, Enderton 2007; GPU Gems 3 ch. 14). Old (2007) but its numbers are still what ships inside Jimenez's, Godot's and many pre-integrated implementations.**

- [SRC] Six-Gaussian fit of the three-layer skin diffusion profile, as hard-coded by Jimenez (and identically by Godot 4). Variance in mm², weights per RGB channel (each channel's weights sum to 1.0):

  | variance v (mm²) | sigma = sqrt(v) (mm) | R | G | B |
  |---|---|---|---|---|
  | 0.0064 | 0.080 | 0.233 | 0.455 | 0.649 |
  | 0.0484 | 0.220 | 0.100 | 0.336 | 0.344 |
  | 0.187  | 0.432 | 0.118 | 0.198 | 0.000 |
  | 0.567  | 0.753 | 0.113 | 0.007 | 0.007 |
  | 1.99   | 1.411 | 0.358 | 0.004 | 0.000 |
  | 7.41   | 2.722 | 0.078 | 0.000 | 0.000 |

  — [SeparableSSS.h, `SSSSTransmittance`](https://github.com/iryoku/separable-sss/blob/master/SeparableSSS.h); same table in [Godot `scene_forward_lights_inc.glsl`, `SSS_skin`](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/shaders/scene_forward_lights_inc.glsl) and in a pre-integrated LUT generator [LookupTexture.shader](https://github.com/wingstone/PreintegratedSubsurfaceScattering/blob/7da53e317711bef8b44a7cf17e107351647e968e/Assets/Human/Resources/Shaders/LookupTexture.shader). That the table originates in GPU Gems 3 (d'Eon and Luebke) is [REC] — [GPU Gems 3 ch. 14](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin); Epic's code attributes it to "[d'Eon07]" [SRC] — [SeparableSSS.cpp](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Private/Rendering/SeparableSSS.cpp).
- [SRC] The Gaussian used for the 2D radial profile is `G(v, r) = exp(-r² / (2 v)) / (2 π v)` (Epic writes `2.0f * 3.14f * variance`), profile `R(r) = Σ w_i G(v_i, r)` with r in mm — [SeparableSSS.cpp](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Private/Rendering/SeparableSSS.cpp).
- [CALC] Mixture variance per channel (Σ w_i v_i): R 1.383 mm² (sigma 1.18 mm), G 0.068 mm² (sigma 0.26 mm), B 0.025 mm² (sigma 0.16 mm). These three numbers are the most compact "how far does light bleed in skin" constants.
- [SRC] Texture-space diffusion (the original d'Eon method): draw the mesh with `output.position = float4(uv * 2 - 1, 0, 1)` into an off-screen irradiance map, blur it with the Gaussians, sample it in the final pass; needs a "stretch map" to correct UV distortion, breaks at UV seams and for thin parts, and "you will shade however many texels are in your off-screen irradiance buffer" regardless of distance. Practitioner verdict: "I'm not sure if any game actually shipped with this approach" at runtime except FaceBreaker (2008) / Fight Night, which then evolved into pre-integrated SSS — [MJP, "An Introduction To Real-Time Subsurface Scattering" (2019)](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html) (published at therealmjp.github.io/posts/sss-intro/).
- [SRC] three.js itself once shipped this method: the r94-era `ShaderSkin.js` "skin" shader composites an unblurred irradiance texture with four blurred copies using weights `(0.22, 0.437, 0.635)·nonblur + (0.101, 0.355, 0.365)·blur1 + (0.119, 0.208, 0.0)·blur2 + (0.114, 0.0, 0.0)·blur3 + (0.444, 0.0, 0.0)·blur4` — [ShaderSkin.js r94 copy](https://github.com/gfxfundamentals/threejsfundamentals/blob/e6fe8df91b7b6bee83b58f9125009f001d312d2d/threejs/resources/threejs/r94/js/ShaderSkin.js). Not what ships today; and it needs UVs, which the project's mesh does not have.

**1.2 Screen-space SSS (Jimenez 2009) and Separable SSS (Jimenez et al. 2015). 2009 to 2015; still shipping in Godot 4 and as Unreal's non-Burley "Separable" option, but superseded by Burley sampling in Unreal, Unity and Babylon.**

- [SRC] Idea and limits: blur the lit diffuse buffer in screen space with the diffusion profile; "you can only gather irradiance from surfaces that end up getting rasterized"; "necessitates doing the rendering in multiple passes, meaning you can't just completely shade the surface within a single pixel shader. This is unfortunate if everything else is forward rendered"; thin-part transmission must be handled separately; MJP would still "probably go with the screen-space option" among the three classic techniques because "it seems to have the least corner cases" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] The separable kernel as Epic generates it (port of Jimenez's demo): use only the **red** channel's profile for all three channels and scale the radius per channel by a "falloff" colour; drop the narrowest Gaussian because it is "directly bounced light, accounted by the strength parameter":
  ```
  rr = r / (0.001 + FalloffColor[c])
  Profile(r) = 0.100·G(0.0484, rr) + 0.118·G(0.187, rr) + 0.113·G(0.567, rr) + 0.358·G(1.99, rr) + 0.078·G(7.41, rr)
  offsets:  o_i = -Range + i·(2·Range/(n-1));  kernel[i].a = Range·sign(o_i)·|o_i|² / Range²   (Range = 3 if n > 20 else 2; Exponent = 2)
  weights:  kernel[i].rgb = (half the distance to both neighbours) · Profile(kernel[i].a);  then normalise each channel to sum 1
  strength: kernel[0] = lerp(1, kernel[0], strength);  kernel[i>0] *= strength
  ```
  — [SeparableSSS.cpp](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Private/Rendering/SeparableSSS.cpp).
- [SRC] Jimenez's defaults: strength (called SubsurfaceColor by Epic) = (0.48, 0.41, 0.28); falloff = (1.0, 0.37, 0.3); Epic's default ScatterRadius = 1.2 "in world/unreal units (cm)" — [SubsurfaceProfile.h, UE 4.26.2 mirror](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Classes/Engine/SubsurfaceProfile.h).
- [SRC] The blur pass (run twice, horizontal then vertical): `distanceToProjectionWindow = 1 / tan(0.5·fovy)`; `scale = distanceToProjectionWindow / depthM` (depthM = linear view depth of the centre pixel); `finalStep = sssWidth · scale · dir · strengthAlpha / 3` ("Divide by 3 as the kernels range from -3 to 3"); sample at `uv + kernel[i].a · finalStep`; follow-surface term `s = saturate(300 · distanceToProjectionWindow · sssWidth · |depthM - depth|)`, `color = lerp(color, colorM, s)`. `sssWidth` is "the width of the filter. It's specified in world space units". Sample counts 11 / 17 / 25 for quality 0 / 1 / 2; "The quality is with respect to 1080p; for 720p Quality=0 suffices". Pre-computed 17-tap kernel centre weight (0.536343, 0.624624, 0.748867) — [SeparableSSS.h](https://github.com/iryoku/separable-sss/blob/master/SeparableSSS.h). Demo slider maximum `sssLevel = 0.025` world units — [Demo.cpp](https://github.com/iryoku/separable-sss/blob/master/Demo/Code/Demo.cpp).
- [SRC] Unreal stores three one-sided kernels of 13, 9 and 6 samples (25 / 17 / 11 mirrored) — [SubsurfaceProfileCommon.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/SubsurfaceProfileCommon.ush). Godot 4 ships the same three sizes (13 / 9 / 6) with a dedicated `skin_kernel` whose centre weight is (0.530605, 0.613514, 0.739601) — [subsurface_scattering.glsl](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/shaders/effects/subsurface_scattering.glsl).

**1.3 Pre-integrated skin shading (Penner and Borshukov 2011). Old (2011); still the standard forward-renderer answer (shipped in The Order: 1886 and Lone Echo; Unreal keeps a "Preintegrated Skin" shading model).**

- [SRC] Principle: "you don't see subsurface scattering when the light is uniform and the surface is flat", so pre-compute the scattered diffuse falloff for a sphere of every radius and look it up by (N·L, curvature). The integral, as implemented by a public LUT generator (ring integration over angle a, radius r in mm, R = the diffusion profile):
  ```
  D(θ, r) = ∫ saturate(cos(θ + a)) · R(|2 r sin(a/2)|) da  /  ∫ R(|2 r sin(a/2)|) da
  ```
  — [LookupTexture.shader `integrateDiffuseScatteringOnRing`](https://github.com/wingstone/PreintegratedSubsurfaceScattering/blob/7da53e317711bef8b44a7cf17e107351647e968e/Assets/Human/Resources/Shaders/LookupTexture.shader); description of the construction in [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html). (The paper's own limits are -π..π [REC]; this generator integrates -π/2..π/2 because, per its comment as I translate it from Chinese, the full range with the Gaussian profile leaves a blue component.)
- [SRC] Lookup: Unreal samples `PreIntegratedBRDF` at `float2(saturate(dot(N, L) * .5 + .5), 1 - Opacity)` — [ShadingModels.ush `PreintegratedSkinBxDF`](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/ShadingModels.ush). A community shader samples `(NdotL_unclamped, Curvature)` — [KajCore.cginc](https://github.com/DarthShader/Kaj-Unity-Shaders/blob/926f07a0bf3dc950db4d7346d022c89f9dfdb440/Shaders/Kaj/KajCore.cginc).
- [SRC] Curvature from derivatives: `Curvature = length(fwidth(worldNormal)) / length(fwidth(worldPosition)) * scale` (i.e. 1/r) — [KajCore.cginc](https://github.com/DarthShader/Kaj-Unity-Shaders/blob/926f07a0bf3dc950db4d7346d022c89f9dfdb440/Shaders/Kaj/KajCore.cginc). Problem reported from production: "quad derivatives will always produce values that are constant across a triangle ... you get a discontinuity at every triangle edge, which can manifest as a discontinuity in your diffuse shading"; the fix is to "precompute it and store it in a texture or per-vertex" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html), [MJP sss-sg](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-sg/index.html).
- [SRC] The normal-blur trick: scattering through small bumps is faked by shading each colour channel with a differently blurred normal ("by 'flattening' the red channel more than the blue, the red light will appear to have more diffusion through the bumps"); Penner samples "the same normal map 3 different times with 3 separate mip bias amounts (one for each color channel)", keeping the sharp normal for specular. Lone Echo applied it only to a separate detail normal, not the base normal — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] Shadows: a second LUT indexed by position inside the shadow penumbra and penumbra width; "the scattering should actually extend past the point where the penumbra reaches zero", so the penumbra is narrowed and the freed band becomes a red scattering zone. A generator's remap: `newPenumbra(pos, w) = saturate((pos·w - PROFILE_WIDTH) / (w - PROFILE_WIDTH))` — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html), [LookupTexture.shader](https://github.com/wingstone/PreintegratedSubsurfaceScattering/blob/7da53e317711bef8b44a7cf17e107351647e968e/Assets/Human/Resources/Shaders/LookupTexture.shader). MJP found penumbra-width estimation "difficult to work with in practice" and notes the worst artefact: high curvature with a very tight penumbra reveals the mesh's shadow-map facets.
- [SRC] Other stated limits: point lights only (ambient needs a separate solution); "requires two 2D lookup textures (or two fitted curves)" per profile; nothing for thin parts — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).

**1.4 Spherical-Gaussian SSS (The Order: 1886; MJP 2019). Texture-free form of 1.3; "implemented and shipped ... in two games".**

- [SRC] Replace the LUT by blurring the light with a normalised spherical Gaussian per colour channel and taking the SG irradiance:
  ```hlsl
  SG redKernel   = MakeNormalizedSG(lightDir, 1.0f / max(ScatterAmt.x, 0.0001f));   // sharpness λ
  ...
  diffuse = float3(SGIrradianceFitted(redKernel, normalR).x, SGIrradianceFitted(greenKernel, normalG).x, SGIrradianceFitted(blueKernel, normalB).x);
  lightingResponse = diffuse * LightIntensity * DiffuseAlbedo * InvPi;
  ```
  Curvature correction: an SG on a sphere of radius r is `G(d) = a·exp(-λ d² / (2 r²))` in surface distance d, so multiplying λ by r² gives a fixed-width Gaussian `a·exp(-λ d² / 2)`; "ScatterAmt ... [is] the σ parameter of a Gaussian". Ambient: convolve the kernel with each SG of an SG probe using `Sharpness = λx·λy/(λx+λy)`, `Amplitude = 2π·ax·ay/(λx+λy)`, or for SH scale band l by `exp(-(σ l)²)`. Limits: "much more math-heavy" than Lambert; "no great solution for handling shadow edges"; nothing for ears — [MJP sss-sg](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-sg/index.html).
- [SRC] Stephen Hill's fitted SG irradiance (the function called above), for a normalised SG of sharpness λ and μ·N = dot(axis, normal):
  ```hlsl
  c0 = 0.36; c1 = 1/(4*c0);
  eml = exp(-λ); em2l = eml*eml; rl = 1/λ;
  scale = 1 + 2*em2l - rl;   bias = (eml - em2l)*rl - em2l;
  x = sqrt(1 - scale);  x0 = c0*muDotN;  x1 = c1*x;  n = x0 + x1;
  y = saturate(muDotN);  if (abs(x0) <= x1) y = n*n/x;
  result = scale*y + bias;            // times the SG's integral (1 for a normalised SG)
  ```
  — [MJP, SG series part 3](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sg-series-part-3-diffuse-lighting-from-an-sg-light-source/index.html).

**1.5 Burley's normalised diffusion (Christensen and Burley 2015) as used by Unreal's Subsurface Profile, Unity HDRP's Diffusion Profile and Babylon.js. This is the current industry standard profile (2015 formula, 2018 to 2020 engine adoption, unchanged through 2026 in the sources read).**

- [SRC] The profile, with A = surface albedo, s = shape (1/length), r = radius: `R(r) = A·s·(exp(-s r) + exp(-s r / 3)) / (8 π r)`; polar PDF `p(r) = r·R(r)/A = s/(8π)·(exp(-s r) + exp(-s r/3))`; CDF `P(r) = 1 - ¼·exp(-s r) - ¾·exp(-s r / 3)` — [Golubev, "Sampling Burley's Normalized Diffusion Profiles" (2019)](https://github.com/zero-radiance/zero-radiance.github.io/blob/master/post/sampling-diffusion/index.html); same in [Unity `DiffusionProfileSettings.cs`](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/DiffusionProfile/DiffusionProfileSettings.cs) and Epic's `GetDiffuseReflectProfile`: `R(d, r) = (e^{-r/d} + e^{-r/(3d)}) / (8·π·d·r)` with d = L/s — [BurleyNormalizedSSSCommon.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/BurleyNormalizedSSSCommon.ush).
- [SRC] The three albedo-to-shape fits, as coded by Epic (A = surface albedo per channel; then d = L / s):
  ```
  Method 1, light perpendicular to the surface, L = volume mean free path:        s = 1.85 - A + 7·(A - 0.8)³     (avg rel. error 5.5 % vs Monte Carlo)
  Method 2, ideal diffuse transmission at the surface, L = mean free path:        s = 1.9 - A + 3.5·(A - 0.8)²     (3.9 %)
  Method 3, searchlight, L = DIFFUSE mean free path measured on the surface:      s = 3.5 + 100·(A - 0.33)⁴        (7.7 %)
  ```
  Unreal's screen-space pass uses method 3 (`LIGHT_PERPENDICULAR_DIFFUSE_SURFACE 1`) — [BurleyNormalizedSSSCommon.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/BurleyNormalizedSSSCommon.ush), [SubsurfaceBurleyNormalized.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/SubsurfaceBurleyNormalized.ush). (Method 1 is quoted as Epic codes it, without an absolute value; the paper's form 7·|A - 0.8|³ is [REC] — [Pixar tech memo 15-04](https://graphics.pixar.com/library/ApproxBSSRDF/paper.pdf).)
- [SRC] Importance sampling the radius. Exact inverse (Golubev; used by Unity and Babylon), u in [0,1), d = 1/s:
  ```hlsl
  u = 1 - u;
  g = 1 + (4*u) * (2*u + sqrt(1 + (4*u)*u));
  n = pow(g, -1/3);  p = (g*n)*n;  c = 1 + p + n;
  r = 3 * log(c / (4*u)) * d;
  rcpPdf = (8*PI*d) * (c*c*c) / ((4*u) * (c*c + (4*u)*(4*u)));
  ```
  — [DiffusionProfile.hlsl](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/DiffusionProfile/DiffusionProfile.hlsl). Cheap approximations: Unreal `r = d·((2 - 2.6)·u - 2)·log(1 - u)` — [SubsurfaceBurleyNormalized.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/SubsurfaceBurleyNormalized.ush); Unity `x = ((2 - 2.5715)·u - 2)·log(1 - u)` after `u = 1 - u` — [DiffusionProfile.hlsl](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/DiffusionProfile/DiffusionProfile.hlsl).
- [SRC] Unity HDRP's pass: filter radius = radius at CDF 0.997 of the widest channel ("three-sigma rule"); `mmPerUnit = 1000·metersPerUnit / distScale`; `pixelsPerMm = 1 / (unitsPerPixel · mmPerUnit)`; `sampleCount = π·(filterRadius·pixelsPerMm)² / SSS_PIXELS_PER_SAMPLE` with `SSS_PIXELS_PER_SAMPLE = 4`, clamped to a budget of 20 (Low) / 40 (Medium) / 80 (High) / 1000 (Max); if `sampleCount < 1` the pixel is skipped ("When the size of this radius is smaller than a pixel on the screen, HDRP doesn't apply Subsurface Scattering"); bilateral weight evaluates the profile at the true 3D distance `sqrt(xy² + (z·mmPerUnit)²)`; `SSS_RANDOM_ROTATION 1 // Hides undersampling artifacts with high-frequency noise. TAA blurs the noise.`; the High Quality option "is around two and a half times more resource intensive than the default" — [SubsurfaceScattering.compute](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/SubsurfaceScattering/SubsurfaceScattering.compute), [DiffusionProfileSettings.cs](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/DiffusionProfile/DiffusionProfileSettings.cs), [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md), [skin-and-diffusive-surfaces-subsurface-scattering.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/skin-and-diffusive-surfaces-subsurface-scattering.md).
- [SRC] Unreal's Burley pass: up to 64 samples (`BURLEY_NUM_SAMPLES 64`), adaptive by variance with `HIGH_LUMA_SAMPLE_COUNT 8`, `LOW_LUMA_SAMPLE_COUNT 16`, `PROFILE_EDGE_SAMPLE_COUNT 32`; angle from an R2 low-discrepancy sequence; bilateral filtering on; temporal `REPROJECTION 1`; the centre pixel is re-weighted by the CDF of its own footprint (`CenterSampleWeight = GetCDF(D, CenterSampleRadiusInMM)`; `lerp(Radiance, OriginalColor, CenterSampleWeight)`); screen scale `BurleyScale = WorldUnitScale · SSSScaleX / DepthAtCenter` — [SubsurfaceBurleyNormalized.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/SubsurfaceBurleyNormalized.ush).
- [SRC] Albedo handling: HDRP "Post-Scatter" applies albedo after the blur ("Use this mode for scanned data and photographs that already contain some blur due to subsurface scattering"); "Pre- and Post-Scatter" applies `sqrt(albedo)` before and after, "resulting in a softer, more natural look" — [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md), [SubsurfaceScattering.hlsl](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/SubsurfaceScattering/SubsurfaceScattering.hlsl).

**1.6 Per-channel radii for Caucasian skin, and how each engine scales them to world units.**

- [SRC] Unity HDRP's built-in `SkinDiffusionProfile.asset`: `scatteringDistance = (0.7490196, 0.32156864, 0.2)`, `scatteringDistanceMultiplier = 1.0104712`, `transmissionTint = (0.7568628, 0.32156864, 0.2)`, `thicknessRemap = (0, 8.152544)` mm, `worldScale = 1`, `ior = 1.4`. The scattering distance is the Burley d (shape S = 1/d); with world scale 1 the Max Radius "is in millimeters" — [SkinDiffusionProfile.asset](https://github.com/Unity-Technologies/Graphics/blob/0efc28ea742b1966b9dd9cc4489e58b986a13faf/Packages/com.unity.render-pipelines.high-definition/Runtime/RenderPipelineResources/SkinDiffusionProfile.asset), [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).
- [CALC] For that profile d = (0.757, 0.325, 0.202) mm; radius containing 50 % / 90 % / 99.7 % of the energy: R (1.17, 4.59, 12.5) mm, G (0.50, 1.97, 5.4) mm, B (0.31, 1.23, 3.4) mm.
- [SRC] Unreal's default Subsurface Profile (UE 4.26 and UE 5.3 identical): `SurfaceAlbedo = (0.91058, 0.338275, 0.2718)`, `MeanFreePathColor = (1.0, 0.1983/2.229, 0.1607/2.229)` = (1.0, 0.0890, 0.0721), `MeanFreePathDistance = 1.2·2.229` = 2.675 "world/unreal units (cm)", `WorldUnitScale = 0.1`, `Tint = (1,1,1)`, `bEnableMeanFreePath = false` (i.e. the length is a *diffuse* mean free path unless switched), `BoundaryColorBleed = white`; comment "match FalloffColor exactly for the default setting". Diffuse mean free path is passed to the shader as `MeanFreePathColor · MeanFreePathDistance · 10` mm — [SubsurfaceProfile.h UE 5.3.2 mirror](https://github.com/chenyong2github/UnrealEngine/blob/c865e168d0935b8e5f4bd865ddcc1c733c8ce7cf/Engine/Source/Runtime/Engine/Classes/Engine/SubsurfaceProfile.h), [SubsurfaceProfile.cpp UE 4.26.2 mirror](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Private/Rendering/SubsurfaceProfile.cpp).
- [SRC] Babylon.js: skin example `pbr.subSurface.scatteringDiffusionProfile = new BABYLON.Color3(0.75, 0.25, 0.2)`; "you have to indicate the ratio between scene units and the real world distance in meters, by filling the property `metersPerUnit`" (default 1 unit = 1 m) — [masterPBR.md](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/masterPBR.md).
- [SRC] The Physically Based database (CC0, updated 2026-11-03) gives skin `subsurfaceRadius` (0.482, 0.169, 0.109) for Fitzpatrick types I to III and (0.367, 0.137, 0.068) for types IV to VI, IOR 1.4, citing Jensen et al. 2001 and Donner and Jensen 2006 — [materials.json](https://github.com/AntonPalmqvist/physically-based-api/blob/main/deploy/v2/materials.json).
- [REC + CALC] Those are, in centimetres, the diffuse mean free paths 1/σ_tr of Jensen et al. 2001's two measured skins: skin1 σ_s' = (0.74, 0.88, 1.01), σ_a = (0.032, 0.17, 0.48) mm⁻¹, diffuse reflectance (0.44, 0.22, 0.13); skin2 σ_s' = (1.09, 1.59, 1.79), σ_a = (0.013, 0.070, 0.145) mm⁻¹, reflectance (0.63, 0.44, 0.34) — table recalled from [Jensen, Marschner, Levoy, Hanrahan 2001](https://dl.acm.org/doi/10.1145/383259.383319); the check `1/sqrt(3 σ_a (σ_a + σ_s'))` reproduces (3.67, 1.37, 0.68) mm and (4.82, 1.69, 1.09) mm exactly, and the reflectances match the database's Skin IV (0.436, 0.227, 0.131) and Skin III (0.623, 0.433, 0.343).
- [CALC] Converting those to Burley d with method 3 (d = dmfp / s): skin1 d = (1.04, 0.39, 0.19) mm; skin2 d = (1.12, 0.48, 0.31) mm; 99.7 % radius 17 to 19 mm in red.
- [SRC] World-unit scaling, per engine: Jimenez `sssWidth` in world units; Unreal `WorldUnitScale` ("Control the scale of world/unreal units (cm)", default 0.1) multiplies the screen radius; Unity `worldScale` = "Size of the world unit in meters"; Babylon `metersPerUnit` — sources as above.

**1.7 Newer than 2020, through 2026.**

- [SRC] Unreal's Substrate (the folder is still named "Strata" in this source snapshot) keeps four subsurface types per pixel: `SSS_TYPE_WRAP (1)`, `SSS_TYPE_DIFFUSION (2)` (per-pixel mean free path), `SSS_TYPE_DIFFUSION_PROFILE (3)` (the Subsurface Profile asset), `SSS_TYPE_SIMPLEVOLUME (4)`; only the two diffusion types go through the screen-space pass — [StrataSubsurface.ush, UE 5.3.2 mirror](https://github.com/chenyong2github/UnrealEngine/blob/c865e168d0935b8e5f4bd865ddcc1c733c8ce7cf/Engine/Shaders/Private/Strata/StrataSubsurface.ush). So Substrate did not replace Burley screen-space diffusion for skin; it re-houses it.
- [EXT] MetaHuman skin in UE 5.6 / 5.7 is still described as "a subsurface material with dual-lobe specular and animated wrinkle maps" relying on the Subsurface Profile shading model; a forum thread reports "extreme SSS" when a default MetaHuman material is converted with Substrate in 5.6 — [guide on Medium](https://medium.com/@Jamesroha/a-beginners-guide-to-metahumans-in-unreal-engine-5-6-and-5-7-e9b14fadbf3d), [Substrate feedback thread](https://forums.unrealengine.com/t/substrate-feedback-thread/691314?page=32).
- [SRC] Real-time path-traced skin exists but only on hardware ray tracing: NVIDIA's RTX Character Rendering SDK "extended SOTA Burley Diffusion Profile [Burley15] with a single scattering term" traced through the geometry, because "the diffusion profile doesn't work well when the assumption of the search light configuration is broken ... thin geometries which is a common case for human ears"; requires RTX 20 / RX 7000 / Arc class GPUs and a denoiser (DLSS-RR / NRD) — [RTXCR README](https://github.com/NVIDIA-RTX/RTXCR), [RtxcrSssGuide.md](https://github.com/NVIDIA-RTX/RTXCR/blob/main/docs/RtxcrSssGuide.md). Not applicable to WebGPU on an M1 (no ray-tracing API in WebGPU).
- [SRC] MJP in 2019 already expected "a few games to start using ray-traced SSS on high-end hardware ... while keeping a screen-space path as a fallback for weaker hardware" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).

**1.8 Stated costs.**

- [SRC] Separable: 2 full passes, 11 / 17 / 25 taps each, one colour and one depth read per tap — [SeparableSSS.h](https://github.com/iryoku/separable-sss/blob/master/SeparableSSS.h).
- [SRC] Burley (HDRP): one pass, min(area/4, 20 / 40 / 80) taps, each a colour + depth read and a 3-channel profile evaluation — [SubsurfaceScattering.compute](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/SubsurfaceScattering/SubsurfaceScattering.compute).
- [SRC] Babylon.js warns: "the use of subsurface scattering triggers a post-process, and it adds a lot of additional work for the GPU ... smaller GPUs won't necessarily have the resources to run this effect" — [masterPBR.md](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/masterPBR.md).
- [SRC] Pre-integrated: one or two LUT reads per light in the forward shader; SG: no texture, "extra ALU and register pressure" — MJP posts as above.

### Inferences
- The red channel carries almost all visible scattering: red's RMS width (1.18 mm) is 4.5 times green's and 7.5 times blue's [CALC]. Any approximation that gets red's width right and leaves green and blue nearly Lambertian will look right; this is why every production kernel (Jimenez falloff 1 / 0.37 / 0.3, HDRP 0.75 / 0.32 / 0.2, Babylon 0.75 / 0.25 / 0.2) has the same shape.
- Pixel footprint decides whether a diffusion *blur* can be seen at all. At 1440 rows the footprint is `2·z·tan(fovy/2)/1440`: with a 50° vertical field of view 0.29 mm/px at 0.45 m, 0.65 mm/px at 1 m, 1.3 mm/px at 2 m, 2.6 mm/px at 4 m; with 35° it is 0.20 / 0.44 / 0.88 / 1.75 mm/px [CALC; the project's field of view is not known to me]. Red's sigma of 1.18 mm is therefore about 4 px at 0.45 m, under 2 px at 1 m and under half a pixel at 4 m. A screen-space pass does visible work only in close-up; HDRP skips it outright when the radius is under a pixel.
- Curvature decides whether the *terminator* softening can be seen. Using the SG relation λ = r² / variance [SRC formula + CALC variance]: red sharpness is 6.5 on an ear helix (r = 3 mm), 46 on a finger (8 mm), 72 on a nose tip (10 mm), 450 on a wrist (25 mm), 1 460 on an upper arm (45 mm) and 16 000 on a torso (150 mm). Above a sharpness of a few hundred the result is indistinguishable from clamped Lambert, so on arms, legs and trunk physically scaled SSS does almost nothing to the terminator; a large fixed "wrap", as in the current shader, over-scatters those parts, which reads as wax.
- A single Gaussian per channel with the mixture variance over-weights red's wide tail near the terminator; two SGs for red (for example variances about 0.5 and 4 mm² with weights about 0.6 and 0.4) would track the six-Gaussian profile more closely at the cost of one more SG evaluation. This split is my estimate, not a published fit.
- Unreal's default profile converts to an effective diffuse mean free path of about (2.7, 0.24, 0.19) mm when `WorldUnitScale = 0.1` is read as "one Unreal unit of profile length is 0.1 cm" [CALC from SRC: 1.0·2.675 cm·10·0.1]. I could not confirm from the shader alone that this is the intended reading, so treat the Unreal numbers as less certain than the HDRP and Jensen ones.

### Gaps
- GPU Gems 3 chapter 14, Penner's SIGGRAPH 2011 notes, the Christensen and Burley memo, Jimenez's papers and Golubev's SIGGRAPH 2018 slides could not be opened (hosts blocked); the formulas above come from code that implements them, which may differ in detail from the papers (the pre-integrated integration limits and the absolute value in Burley's method 1 are two known differences).
- No published millisecond timings were read at source for any method; the often-quoted cost of separable SSS at 1080p could not be verified.
- Call of Duty / Activision specifics: I recall that Jimenez's separable SSS, shadow-map transmittance and the eye work in "Next Generation Character Rendering" (GDC 2013) come from Activision and that the technique shipped in Call of Duty titles, but I could not open any Activision source in this session, so no Call of Duty constants are given.
- MetaHuman's actual Subsurface Profile values (mean free path colour and distance, lobe roughnesses) for 2024 to 2026 were not found; Epic's documentation host is blocked and the one search returned no numbers.
- ReSTIR-based real-time path-traced SSS (HPG 2024) is recalled to exist but was not verified.

---

## 2. What fits a forward TSL shader with a temporal upscaler and no SSS pass; what three.js 0.187 offers; what has shipped in the browser

### Takeaway
Pre-integrated or spherical-Gaussian diffuse, per-channel normal softening, a thickness-driven transmission term and a coloured shadow penumbra all live inside one forward lighting model and are deterministic (no noise for the upscaler to resolve); the diffusion blur proper (separable or Burley) needs the diffuse lighting in its own render target plus one extra pass. three.js r187 ships no skin diffusion at all: `MeshSSSNodeMaterial` is only the 2011 Barré-Brisebois back-light approximation and `webgpu_postprocessing_sss` is screen-space *shadows*; Babylon.js is the one mainstream web engine with a real Burley screen-space pass.

### Cited Findings
- [SRC] `MeshSSSNodeMaterial` (r187) extends `MeshPhysicalNodeMaterial` and its `SSSLightingModel.direct()` adds, per light, to `directDiffuse`:
  ```js
  scatteringHalf = normalize(lightDirection + normalView * thicknessDistortion)
  scatteringDot  = pow(saturate(dot(viewDirection, -scatteringHalf)), thicknessPower) * thicknessScale
  directDiffuse += (scatteringDot + thicknessAmbient) * thicknessColor * thicknessAttenuation * lightColor
  ```
  Defaults: distortion 0.1, ambient 0.0, attenuation 0.1, power 2.0, scale 10.0; `thicknessColorNode = null` (non-null turns it on). The doc comment cites Barré-Brisebois's GDC 2011 talk and calls the material "experimental" — [MeshSSSNodeMaterial.js r187](https://github.com/mrdoob/three.js/blob/r187/src/materials/nodes/MeshSSSNodeMaterial.js). The example drives it with a baked thickness texture: `thicknessColorNode = texture(thicknessTexture).mul(vec3(0.5, 0.3, 0.0))`, distortion 0.1, ambient 0.4, attenuation 0.8, power 2.0, scale 16.0 — [webgpu_materials_sss.html r187](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_materials_sss.html).
- [SRC] This is the extension pattern a custom skin model would use: subclass `PhysicalLightingModel`, override `direct()`, return it from the material's `setupLightingModel()` — same file.
- [SRC] `examples/jsm/tsl/display/SSSNode.js` is "Post processing node for applying Screen-Space Shadows (SSS) to a scene ... (also known as Contact Shadows)", single directional light only, "maximum shadow length should not exceed 1 meter", optional temporal filtering; the example composes it through `builtinShadowContext(sssSample, dirLight)` with `mrt`, `pass` and `traa` — [SSSNode.js r187](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/tsl/display/SSSNode.js), [webgpu_postprocessing_sss.html r187](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_postprocessing_sss.html).
- [SRC] r187 example list contains `webgpu_materials_sss`, `webgpu_postprocessing_sss`, `webgpu_postprocessing_ao`, `webgpu_shadow_contact`, `webgpu_postprocessing_traa`, `webgpu_upscaling_taau`, `webgpu_upscaling_fsr1`, `webgpu_morphtargets_face`; nothing named skin, subsurface or head — [examples/files.json r187](https://github.com/mrdoob/three.js/blob/r187/examples/files.json). TSL display nodes present at r187 (HTTP 200): `GTAONode`, `SSGINode`, `SSRNode`, `TRAANode`, `TAAUNode`, `FSR1Node`, `DenoiseNode`, `BilateralBlurNode`, `GaussianBlurNode`, `hashBlur`, `boxBlur`, `SSSNode`; no subsurface node — [three.js r187 tree](https://github.com/mrdoob/three.js/tree/r187/examples/jsm/tsl/display).
- [SRC] `PhysicalLightingModel` (r187) offers: Lambert or EON rough diffuse (`BRDF_EON`, flag `diffuseRoughness`), one GGX specular lobe, clearcoat (F0 0.04), "Charlie" sheen with the Estevez and Kulla 2017 fit and energy compensation, iridescence, anisotropy, transmission / volume attenuation / dispersion. No dual specular lobe, no diffusion profile — [PhysicalLightingModel.js r187](https://github.com/mrdoob/three.js/blob/r187/src/nodes/functions/PhysicalLightingModel.js).
- [SRC] `GLTFLoader` r187 handles `KHR_materials_{anisotropy, clearcoat, diffuse_roughness, dispersion, emissive_strength, ior, iridescence, sheen, specular, transmission, unlit, variants, volume}`; neither `KHR_materials_diffuse_transmission` nor a volume-scatter extension — [GLTFLoader.js r187](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/GLTFLoader.js). `KHR_materials_diffuse_transmission` exists in the Khronos repository; a `KHR_materials_volume_scatter` README was not at the ratified-extensions path (404) — [glTF extensions/2.0/Khronos](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos).
- [SRC] Babylon.js: `scene.enableSubSurfaceForPrePass().metersPerUnit = 0.01; pbr.subSurface.isScatteringEnabled = true;` — WebGL 2 only, needs a pre-pass (MRT) and a post-process, "up to 5 different colors registered as diffusion profiles"; translucency is a separate forward term with a thickness map (`minimumThickness + thicknessTexture.r * maximumThickness`) — [masterPBR.md](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/masterPBR.md). Its shader is a port of Unity HDRP's pass: same `SSS_PIXELS_PER_SAMPLE = 4`, `EvalBurleyDiffusionProfile`, `SampleBurleyDiffusionProfile`, `_SssSampleBudget`, bilateral option — [subSurfaceScattering.fragment.fx](https://github.com/BabylonJS/Babylon.js/blob/693f60a75a12a5629e545d30a98f942c149fcfc8/packages/dev/core/src/Shaders/subSurfaceScattering.fragment.fx) (a WGSL twin exists in `ShadersWGSL/`).
- [SRC] PlayCanvas: a code search of `playcanvas/engine` for "subsurface" returned zero files (default branch, this session) — [playcanvas/engine](https://github.com/playcanvas/engine).
- [SRC] Godot 4 (open-source, forward+ renderer) shows the forward-plus-one-pass split in production: skin-mode transmittance is computed in the forward light loop (`SSS_skin`), the diffusion is a separable post pass with the 13 / 9 / 6-tap skin kernel; material properties `subsurf_scatter_skin_mode`, `subsurf_scatter_strength`, `subsurf_scatter_transmittance_depth = 0.1`, `subsurf_scatter_transmittance_boost` — [scene_forward_lights_inc.glsl](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/shaders/scene_forward_lights_inc.glsl), [class_basematerial3d.rst](https://github.com/godotengine/godot-docs/blob/c7517c2882ec1fcdeb9d773e6537439011df950f/classes/class_basematerial3d.rst).
- [SRC] Why pre-integrated suits forward renderers: "this can all be achieved within the local context of a single pixel shader. This makes it possible to implement as a special shader permutation within a forward renderer, without having to implement additional passes ... It was for this reason that we shipped with a variant of this technique in both The Order: 1886 and Lone Echo, both of which use a forward renderer" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] Temporal anti-aliasing is assumed by the sampled screen-space passes: HDRP's per-pixel random rotation "Hides undersampling artifacts with high-frequency noise. TAA blurs the noise"; Unreal's Burley pass has its own `REPROJECTION 1` history — [SubsurfaceScattering.compute](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/SubsurfaceScattering/SubsurfaceScattering.compute), [SubsurfaceBurleyNormalized.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/SubsurfaceBurleyNormalized.ush).

### Inferences
- Method-to-architecture map for this project:

  | Component | Forward TSL only | Needs extra pass / target | Works without UVs or textures | Interaction with temporal upscaler |
  |---|---|---|---|---|
  | Pre-integrated diffuse (LUT) | yes | no | yes (LUT is code-generated; curvature per vertex) | stable, no noise |
  | Spherical-Gaussian diffuse | yes | no | yes (pure math) | stable |
  | Per-channel normal softening | yes | no | yes (blend detail normal toward geometric normal per channel) | stable |
  | Penumbra colour LUT / tint | yes | no | yes | stable; inherits shadow-filter noise |
  | Thickness transmission | yes | no (optional shadow-map depth read) | yes (per-vertex thickness) | stable |
  | Separable SSS (Jimenez) | no | diffuse-only target + depth, 2 passes | yes | run at render resolution before the upscaler; no noise |
  | Burley sampled SSS | no | diffuse-only target + depth, 1 pass | yes | run before the upscaler; relies on temporal accumulation to hide noise |
  | Texture-space diffusion | no | off-screen UV-space pass + blurs | no (needs UVs) | n/a |
  | Path-traced SSS | no | hardware ray tracing | — | needs a denoiser |

- A forward skin model in TSL is a subclass of `PhysicalLightingModel` whose `direct()` replaces the Lambert term with the pre-integrated or SG response and adds a second GGX lobe and the transmission term; the sky light goes through `indirectDiffuse` with a softened normal. This is exactly how `SSSLightingModel` is built, so no engine changes are needed.
- If one extra pass is ever wanted, it should be the diffusion blur, restricted to the body's screen rectangle, at render resolution (1440p) *before* `TAAUNode`, with specular kept out of the blurred target via `mrt()`. On WebGL 2 this means a second colour attachment for the whole frame, which is the real cost.
- The existing shader's object-space 3D value noise is evaluated per pixel with no mip chain. Under a jittered temporal upscaler, un-prefiltered procedural detail is the classic source of shimmer; baking the same procedural functions once at load into tiling textures (2D sampled triplanar, or one small 3D texture sampled once, both with mipmaps) removes the shimmer and most of the arithmetic. This is my engineering inference; it is consistent with the project rule because the textures are generated by the project's own code.

### Gaps
- Sketchfab: I recall that Sketchfab's viewer added subsurface scattering and translucency material channels (screen-space, with a thickness map) around 2017, but could not open any source to confirm how it is implemented.
- No 2025 to 2026 web "digital human" demo using WebGPU skin diffusion could be verified (search budget exhausted).
- Whether three.js versions after r187 added a subsurface node was not checked; r187 was the version asked about.

---

## 3. Specular: dual lobe, F0, Kelemen/Szirmay-Kalos, micro-geometry, occlusion, oil and sweat, peach fuzz

### Takeaway
Industry standard is two GGX lobes sharing one Fresnel term with F0 = 0.028 (index of refraction 1.4): Unreal's defaults are lobe roughness multipliers 0.75 and 1.30 mixed 15 % / 85 % (the broad lobe dominates), Unity HDRP exposes two smoothness multipliers and a mix (default 0.5) on the diffusion profile. The 2007 Kelemen/Szirmay-Kalos Beckmann model is obsolete in engines but its F0 survives everywhere.

### Cited Findings
- [SRC] Unreal's dual specular for the Subsurface Profile model:
  ```hlsl
  Lobe0Roughness = max(saturate(Roughness * 0.75), 0.02);   // Roughness0 default 0.75, range 0.5..2
  Lobe1Roughness = saturate(Roughness * 1.30);              // Roughness1 default 1.30
  D   = lerp(D_GGX(Lobe0Roughness^4, NoH) * Energy0, D_GGX(Lobe1Roughness^4, NoH) * Energy1, LobeMix);   // LobeMix default 0.85, range 0.1..0.9
  Vis = Vis_SmithJointApprox(AverageRoughness^4, NoV, NoL);  // "Average visibility well approximates using two separate ones"
  F   = F_Schlick(SpecularColor, VoH);
  Specular = D * Vis * F;
  ```
  (alpha = roughness², so `Pow4(roughness)` is alpha².) As opacity goes to 0 both lobes lerp to a single default lobe — [ShadingModels.ush `SubsurfaceProfileBxDF`, `DualSpecularGGX`](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/ShadingModels.ush), defaults in [SubsurfaceProfile.h](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Classes/Engine/SubsurfaceProfile.h). Diffuse in the same model is `Diffuse_Burley` (Disney diffuse), not Lambert.
- [SRC] Unity HDRP: diffusion-profile fields `smoothnessMultipliers` (Vector2, range 1..2 in the attribute, default (1, 1)) and `lobeMix` (default 0.5); doc: "To simulate the thin oily layer on the skin of lips, HDRP uses two specular lobes"; the doc's illustration uses lobe smoothness multipliers 0.8 and 1.2 with mix 0.5; for reflection probes and screen-space reflection "HDRP evaluates only a single lobe that has the base smoothness"; `diffuseShadingPower` (1..3) is an exponent on the cosine of the diffuse lobe — [DiffusionProfileSettings.cs](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/DiffusionProfile/DiffusionProfileSettings.cs), [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).
- [SRC] F0 and index of refraction: HDRP comment `ior; // 1.4 for skin (mean ~0.028)` and default `ior = 1.4f; // Typical value for skin specular reflectance`; Jimenez's demo and the GPU Gems 3 port both hard-code `0.028` in Schlick's Fresnel; the Physically Based database lists skin IOR 1.4 and roughness 0.5 — [DiffusionProfileSettings.cs](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/DiffusionProfile/DiffusionProfileSettings.cs), [Main.fx](https://github.com/iryoku/separable-sss/blob/master/Demo/Shaders/Main.fx), [materials.json](https://github.com/AntonPalmqvist/physically-based-api/blob/main/deploy/v2/materials.json). [CALC] ((n-1)/(n+1))² = 0.0278 for n = 1.4; 0.0201 for water (1.33); 0.040 for 1.5; 0.0465 for 1.55.
- [SRC] Unreal's profile `IOR = 1.55` is a *transmission* parameter (it feeds `refract(V, -N, OneOverIOR)` for the back-light phase function), not the surface F0 — [ShadingModels.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/ShadingModels.ush).
- [SRC] Kelemen/Szirmay-Kalos specular as shipped in GPU Gems 3-derived code (2007; superseded by GGX but compact):
  ```glsl
  float PHBeckmann(float ndoth, float m) { float ta = tan(acos(ndoth)); return exp(-(ta*ta)/(m*m)) / (m*m*pow(ndoth, 4.0)); }
  // texture stores 0.5 * pow(PHBeckmann(ndoth, m), 0.1); lookup: PH = pow(2.0 * tex(ndoth, m), 10.0)
  vec3 h = L + V;  vec3 H = normalize(h);
  float F = base5 + 0.028 * (1.0 - base5);          // base5 = pow(1 - dot(V, H), 5)
  float frSpec = max(PH * F / dot(h, h), 0.0);
  result = ndotl * rho_s * frSpec;
  ```
  three.js r94 defaults: `uRoughness 0.15`, `uSpecularBrightness 0.75`; Jimenez's demo: roughness 0.3, intensity 1.88, with per-texel intensity / roughness / occlusion from a "specularAO" texture and `f = lerp(0.25, Fresnel(halfn, view, 0.028), specularFresnel)` — [ShaderSkin.js r94 copy](https://github.com/gfxfundamentals/threejsfundamentals/blob/e6fe8df91b7b6bee83b58f9125009f001d312d2d/threejs/resources/threejs/r94/js/ShaderSkin.js), [Main.fx](https://github.com/iryoku/separable-sss/blob/master/Demo/Shaders/Main.fx), [Demo.cpp](https://github.com/iryoku/separable-sss/blob/master/Demo/Code/Demo.cpp).
- [EXT] GPU Gems 3 concludes "a physically based skin shader should use a white specular color" and uses Schlick's Fresnel — [GPU Gems 3 ch. 14](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin).
- [EXT] Skin has "two specular lobes instead of one"; Unreal's default Specular input is 0.5 — [texturing.xyz, "Creating realistic skin in UE4"](https://texturing.xyz/pages/saurabh-jethani-creating-realistic-skin-in-ue4).
- [EXT] Micro-geometry changes roughness dynamically: measurements "found that stretching smooths the skin and compression makes it rougher"; the fix is to blur the micro displacement along the stretch direction and sharpen it along compression — [Nagano et al. 2015, project page](https://vgl.ict.usc.edu/Research/SkinStretch).
- [SRC] Specular occlusion from an occlusion value (Lagarde and de Rousiers 2014, as coded in Filament): `specAO = saturate(pow(NoV + ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + ao)`; a bent-normal cone variant also exists — [surface_ambient_occlusion.fs](https://github.com/google/filament/blob/main/shaders/src/surface_ambient_occlusion.fs).
- [SRC] Specular anti-aliasing so that micro-normals do not sparkle (Kaplanyan 2016; Tokuyoshi and Kaplanyan 2019, as coded in Filament): `variance = k_variance · (dot(dFdx(N), dFdx(N)) + dot(dFdy(N), dFdy(N)))` (each term multiplied by the square of a `derivativesScale` "to correct for resolution scaling (DSR and TAAx4)"); `kernelRoughness = min(2·variance, k_threshold)`; `alpha_new = sqrt(saturate(alpha² + kernelRoughness))` — [surface_lighting.fs](https://github.com/google/filament/blob/414602be0e255ac0045d684d7dd5299d760d0de5/shaders/src/surface_lighting.fs). three.js r187 does a cruder version by default: `roughness = min(max(roughness, 0.045) + max3(max(|dFdx(Ngeom)|, |dFdy(Ngeom)|)), 1)`, using the *geometric* normal only — [getRoughness.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/functions/material/getRoughness.js), [getGeometryRoughness.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/functions/material/getGeometryRoughness.js).
- [SRC] A ready grazing-angle fuzz lobe exists in r187: sheen with the "Charlie" distribution and Estevez and Kulla's fit, energy-compensated against the base layer (`sheenEnergyComp = 1 - max3(sheen)·max(E(V), E(L))`) — [PhysicalLightingModel.js r187](https://github.com/mrdoob/three.js/blob/r187/src/nodes/functions/PhysicalLightingModel.js).
- [REC] The physical basis of the soft rim on skin is asperity scattering by vellus hair and surface flakes, described by Koenderink and Pont, "The secret of velvety skin" (2003) — [DOI 10.1007/s00138-002-0089-7](https://doi.org/10.1007/s00138-002-0089-7).
- [REC] Weyrich et al. 2006 measured Torrance-Sparrow roughness and specular intensity for ten facial regions over 149 subjects; nose and forehead are the most specular, and these measured parameters are what GPU Gems 3 feeds its model — [DOI 10.1145/1141911.1141987](https://doi.org/10.1145/1141911.1141987).

### Inferences
- Unreal's default mix means the highlight is 85 % a lobe 1.3 times rougher than the authored value plus 15 % a lobe 0.75 times as rough: a broad sheen with a small sharp core. A single Blinn-Phong or GGX lobe cannot give both, which is one concrete reason the current two-lobe Blinn-Phong shader reads as plastic if its lobes are not this far apart or are not energy-normalised. Blinn-Phong should be replaced by GGX: converting, a GGX alpha roughly corresponds to Blinn-Phong exponent n by alpha² = 2/(n+2) (standard conversion, recalled).
- A base perceptual roughness for body skin of about 0.45 to 0.55 (database value 0.5 [SRC]) with oilier regions lower (forehead, nose, chin; shoulders and chest when sweaty) and drier ones higher (shins, forearms, elbows, knees) is consistent with the sources, but the regional values are practitioner lore, not measured numbers I could cite.
- Sweat and oil: a wet film has F0 near 0.02 (water) and is optically smooth, so sweat is best modelled as a third, very low-roughness lobe (clearcoat with F0 0.02 to 0.028, roughness 0.05 to 0.15) masked by a wetness factor, not by raising base specular. three.js's clearcoat uses a fixed F0 of 0.04 [SRC], which is slightly too bright for water or sebum; scale its weight by 0.5 to 0.7 to compensate.
- Peach fuzz without hair geometry: add a sheen term (Charlie lobe, sheen roughness about 0.5 to 0.7, sheen colour near white times 0.05 to 0.15) or the cheaper classic `pow(1 - N·V, 4..5) · saturate(N·L wrapped)` rim, masked by a per-vertex "fuzz" attribute (strong on cheeks, jaw line, ear rims, forearms; zero on lips, palms, soles, nails). The numbers are starting points of mine, not published values.
- Two lobes cost one extra `D_GGX` per light because visibility and Fresnel are shared [SRC]; that is under 10 arithmetic operations and should never be the first thing dropped.

### Gaps
- Weyrich's per-region roughness and intensity table could not be opened; no measured per-body-site (non-face) specular parameters were found.
- MetaHuman's lobe values and whether its skin uses a fuzz or cavity term in 2024 to 2026 could not be verified. I recall that MetaHuman characters carry a separate "peach fuzz" groom at the highest levels of detail and a cavity map multiplying specular, but have no source for it.
- No source was read for sebum's or stratum corneum's refractive index (recalled range 1.4 to 1.55).

---

## 4. Skin colour from first principles

### Takeaway
Skin albedo is two absorbers over a scattering base: melanin in the epidermis (brown; sets the overall tone, absorbs blue most) and haemoglobin in the dermis (removes green, so more blood means redder and slightly darker). Published linear-sRGB albedos run from about (0.85, 0.64, 0.55) for the lightest skin through (0.62, 0.43, 0.34) for medium to (0.09, 0.05, 0.02) for the darkest. Production authors this as maps (base tone, redness / haemoglobin, melanin, freckles and moles, veins), and the research line (Donner and Jensen 2006, Jimenez 2010, Aliaga 2022/2023) reduces it to a small lookup driven by melanin and haemoglobin amounts.

### Cited Findings
- [SRC] Albedo by Fitzpatrick type, linear sRGB, from the Physically Based database (CC0; sources listed there: Jensen 2001, Donner and Jensen 2006, Lister et al. 2012). The sRGB-encoded 8-bit equivalents are [CALC]:

  | Type | linear sRGB albedo | sRGB 8-bit | subsurface radius (cm) |
  |---|---|---|---|
  | Skin I   | (0.847, 0.638, 0.552) | (237, 209, 196) | (0.482, 0.169, 0.109) |
  | Skin II  | (0.799, 0.485, 0.347) | (231, 185, 159) | same |
  | Skin III | (0.623, 0.433, 0.343) | (207, 176, 158) | same |
  | Skin IV  | (0.436, 0.227, 0.131) | (176, 131, 101) | (0.367, 0.137, 0.068) |
  | Skin V   | (0.283, 0.148, 0.079) | (145, 107, 79)  | same |
  | Skin VI  | (0.090, 0.050, 0.020) | (85, 63, 39)    | same |

  — [materials.json](https://github.com/AntonPalmqvist/physically-based-api/blob/main/deploy/v2/materials.json).
- [SRC] Blood, same database: oxygenated blood colour (0.644, 0.003, 0.005), deoxygenated (0.415, 0.0, 0.0); absorption coefficients (unit not stated in the file) oxygenated (8.8, 238.6, 189.7), deoxygenated (40.7, 259.9, 91.2); IOR 1.35 — [materials.json](https://github.com/AntonPalmqvist/physically-based-api/blob/main/deploy/v2/materials.json). The point for shading: blood passes red and absorbs green far more strongly, 27 times more for oxygenated and 6 times more for deoxygenated blood [CALC].
- [SRC] Chromophore absorption spectra used by skin-optics models (λ in nm, result in mm⁻¹), from an open-source skin optics package that cites Jacques's 1998 summary:
  ```
  melanosome:           μa_mel(λ) = 6.6e10 · λ^-3.33
  baseline (bloodless): μa_bas(λ) = 0.0244 + 8.53 · exp(-(λ - 154) / 66.2)        [350..1100 nm]
  alt. baseline:        μa_bas(λ) = 7.84e7 · λ^-3.255                             [450..750 nm]
  oxy / deoxy haemoglobin: tabulated molar extinction (Prahl), whole blood at 150 g/L, molar mass 64 500 g/mol
  reduced scattering:   μs'(λ) = a · [ f_Ray · (λ/500)^-4 + (1 - f_Ray) · (λ/500)^-b_Mie ]
  ```
  — [skinoptics absorption_coefficient.py](https://github.com/victorportog/skinoptics/blob/524426e7c4bd5026fbb116f3d9ffbbb22ea9d75c/skinoptics/absorption_coefficient.py), [scattering_coefficient.py](https://github.com/victorportog/skinoptics/blob/524426e7c4bd5026fbb116f3d9ffbbb22ea9d75c/skinoptics/scattering_coefficient.py); primary reference named there: [Jacques, "Skin Optics" (1998)](https://omlc.org/news/jan98/skinoptics.html).
- [EXT] Donner and Jensen 2006 ("A Spectral BSSRDF for Shading Human Skin") is a two-layer model with four parameters that "control the amount of oil, melanin and hemoglobin"; eumelanin absorption 6.6×10¹⁰ λ^-3.33 mm⁻¹; total melanin volume fraction C_m split between eumelanin and pheomelanin by β_m; dermis absorption mixes oxy- and deoxy-haemoglobin by an oxygenation fraction γ (a later paper fixes γ = 0.75) plus baseline — [paper PDF](http://graphics.ucsd.edu/~henrik/papers/skin_bssrdf/skin_bssrdf.pdf).
- [REC] The layer equations as I recall them from that paper: epidermis `σa_epi = C_m·(β_m·σa_eu + (1 - β_m)·σa_pheo) + (1 - C_m)·σa_bas` with pheomelanin `σa_pheo = 2.9e14 · λ^-4.75` mm⁻¹; dermis `σa_derm = C_h·(γ·σa_oxy + (1 - γ)·σa_deoxy) + (1 - C_h)·σa_bas`; epidermis about 0.25 mm thick over a semi-infinite dermis — [same PDF](http://graphics.ucsd.edu/~henrik/papers/skin_bssrdf/skin_bssrdf.pdf). The search could not confirm the 0.25 mm figure.
- [REC] Melanosome volume fraction of the epidermis by complexion (Jacques 1998): light-skinned adults 1.3 to 6.3 %, moderately pigmented 11 to 16 %, darkly pigmented 18 to 43 %; average dermal blood volume fraction about 0.2 %, locally several per cent — [Jacques, "Skin Optics"](https://omlc.org/news/jan98/skinoptics.html).
- [EXT] Jimenez et al. 2010 ("A Practical Appearance Model for Dynamic Facial Color"): skin colour is "the product of how light is scattered and absorbed in skin layers, driven mainly by those two chromophores"; built from in-vivo measurements of melanin and haemoglobin for several expressions (anger, neutral, fear, disgust); stores base melanin and haemoglobin maps and encodes only haemoglobin *changes* for animation — [project page](https://www.iryoku.com/skincolor/), [FAU project page](https://reality.tf.fau.de/projects/skinperf/skinperf.html).
- [SRC] Production texturing guidance embedded in HDRP: scanned albedo already contains scattering blur, so apply it post-scatter; hand-made or procedural albedo benefits from the pre-and-post mode (`sqrt(albedo)` twice) "resulting in a softer, more natural look" — [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).
- [SRC] Unreal's default profile assumes a `SurfaceAlbedo` of (0.91, 0.34, 0.27) "It should match The base color of the corresponding material as much as possible", and HDRP says the scattering colour "should be similar to the diffuse color of the material" — the profile and the albedo are meant to be consistent — [SubsurfaceProfile.h](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Classes/Engine/SubsurfaceProfile.h), [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).

### Inferences
- A code-only albedo model that respects the physics: precompute at load a small 2D table `albedo(melanin, haemoglobin)` by evaluating the spectral formulas above at, say, 16 wavelengths, converting layer absorption and scattering to diffuse reflectance (two-layer diffusion or Kubelka-Munk), and integrating against the sRGB colour-matching weights. Jimenez 2010 does exactly this kind of lookup (I recall its axes are cube-root-spaced; unverified). Per pixel the shader then needs only two scalars, melanin and haemoglobin, each from per-vertex data plus procedural detail.
- A cheaper approximation with the same behaviour: `albedo = base · exp(-m · k_mel) · exp(-h · k_hem)` with `k_mel` proportional to the melanin spectrum sampled at R, G, B wavelengths (ratios about 1 : 1.4 : 2.5 for 610 / 550 / 465 nm from λ^-3.33 [CALC from SRC formula]) and `k_hem` strongly green-weighted (oxygenated blood absorbs green 27 times and blue 22 times more than red [CALC from SRC blood coefficients]). This keeps hue shifts physically ordered: more melanin goes brown then dark without going grey; more blood goes pink then red without going orange.
- Body-site variation to encode per vertex or by procedural masks (anatomical common knowledge and painters' practice, not sourced in this session): more blood showing at cheeks, nose, ears, lips, chin, knuckles, fingertips, elbows, knees, heels, palms and soles, and wherever skin is thin over capillary beds; more melanin at areolae and nipples, genitals and perineum, armpits, backs of hands and forearms, face and neck (sun), and on darker skins at knuckles, elbows and knees; less melanin on palms and soles (in every skin tone), inner arms, inner thighs, buttocks and trunk under clothing (tan lines); bluish-green veins on inner wrists, forearms, backs of hands, feet, temples; a cooler, greyer lower face on men from beard follicles. The classic painter's summary is three face zones: yellowish forehead, red middle, bluish or greenish jaw.
- Scale of colour variation matters as much as its presence: blotchy haemoglobin mottle at 5 to 30 mm, freckles 1 to 5 mm with soft edges (they sit in the epidermis, so they are *not* blurred much by scattering; moles are sharper and darker), veins 1 to 3 mm wide but heavily blurred and desaturated because they lie about 1 mm deep. If a diffusion pass exists, veins and mottle belong before it and freckles after it; in a forward-only shader, author them pre-blurred.
- Using a single albedo from the table with no variation is the main cause of "grey" or "mannequin" skin at 1 to 4 m; variation of roughly ±10 % in value and a visible hue swing toward red at the extremities is what the eye expects. This is my judgement, not a measured threshold.

### Gaps
- Aliaga et al. (2022, "Estimation of Spectral Biophysical Skin Properties from Captured RGB Albedo"; 2023, "A Hyperspectral Space of Skin Tones for Inverse Rendering of Biophysical Skin Properties") could not be opened; I recall a five-parameter space (melanin amount, melanin type ratio, haemoglobin amount, blood oxygenation, epidermal thickness) but give no numbers.
- Unreal's (MetaHuman) and Unity's skin-tone parametrisations: I recall MetaHuman Creator picks skin tone from a two-axis swatch and layers freckles, redness and texture variation, but found no source describing the underlying model.
- No measured map of melanin or haemoglobin by *body* site (as opposed to face) was found; the site list above is unsourced.
- The exact LUT axes and expression deltas of Jimenez 2010 were not in the search extract.

---

## 5. Fine detail without scans: real relief, procedural micro-normals, blending, filtering

### Takeaway
Real skin micro-relief is far below a pixel at every distance in scope (furrows tens of micrometres deep, pores and follicles 0.6 to 2.7 mm apart depending on body site), so its job is to shape the specular lobe and break up highlights, not to be seen as bumps. The production recipe is a tiling micro-normal blended onto a macro normal, with the lost normal variance pushed into roughness at distance; scan-based synthesis (Graham 2013, Nagano 2015) is ruled out by the project's no-scan rule, but its measured scales can guide a procedural generator.

### Cited Findings
- [EXT] Measured scale of facial micro-structure: Graham et al. 2013 used "a 10-micron resolution scanning technique to measure several in vivo skin samples" and synthesised micro-geometry onto a face scan from "exemplar skin patches"; in Nagano et al. 2015 "each pixel covers a 6 micron square of skin", the micro displacement map is "blur[red] along the stretch direction and sharpen[ed] in the compression direction", with amounts chosen "to match measured changes in surface normal distribution" — [Microgeometry project page](https://vgl.ict.usc.edu/Research/Microgeometry), [SkinStretch project page](https://vgl.ict.usc.edu/Research/SkinStretch).
- [REC] Dermatological relief classes (Hashimoto's classification as commonly quoted): primary lines 20 to 100 µm deep, secondary lines 5 to 40 µm, tertiary lines (corneocyte edges) about 0.5 µm, quaternary about 0.05 µm; primary lines form the polygon net, with hair follicles at their intersections and sweat pores on the plateaus; the net becomes anisotropic and coarser with age — recalled from the skin-topography literature; no URL opened.
- [REC] Hair follicle density by body site (Otberg et al. 2004, per cm²): forehead 292, back 29, thorax 22, upper arm 32, forearm 18, thigh 17, calf 14 — [DOI 10.1046/j.0022-202X.2003.22110.x](https://doi.org/10.1046/j.0022-202X.2003.22110.x). [CALC] Mean spacing 10/sqrt(density) mm: forehead 0.59, back 1.86, thorax 2.13, upper arm 1.77, forearm 2.36, thigh 2.43, calf 2.67 mm.
- [SRC] Detail and base normals should be separate maps when softening for scattering: "it works best when the normal map only contains small pore-level details ... You may find that you get better results by separating these two things as 'base' and 'detail' normal maps, and only applying the pre-filtering to your detail map. We switched to doing this for Lone Echo ... It's also possible to use a smaller tiling detail map instead for noisy pore-level details, which can certainly save some memory" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] Wrinkle maps driven by skin tension are standard in production digital humans: Unity's Digital Human package "Added skin tension to apply wrinkle maps"; MetaHuman has "animated wrinkle maps" [EXT] — [com.unity.demoteam.digital-human README](https://github.com/Unity-Technologies/com.unity.demoteam.digital-human), [Medium guide](https://medium.com/@Jamesroha/a-beginners-guide-to-metahumans-in-unreal-engine-5-6-and-5-7-e9b14fadbf3d).
- [SRC] Filtering: normal-variance-to-roughness formula and the three.js default, see section 3 — [surface_lighting.fs](https://github.com/google/filament/blob/414602be0e255ac0045d684d7dd5299d760d0de5/shaders/src/surface_lighting.fs), [getRoughness.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/functions/material/getRoughness.js).
- [REC] Toksvig's mip-mapped normal method: with N_a the averaged (un-normalised) normal from the mip chain and s the Blinn-Phong exponent, the corrected exponent is `s' = ft·s` with `ft = |N_a| / (|N_a| + s·(1 - |N_a|))`; LEAN mapping (Olano and Baker 2010) stores the first and second moments of the normal's slope per texel so that mip-mapping yields the lobe covariance — [Toksvig 2005, NVIDIA technical report](https://developer.download.nvidia.com/whitepapers/2006/Mipmapping_Normal_Maps.pdf), [LEAN mapping, DOI 10.1145/1730804.1730834](https://doi.org/10.1145/1730804.1730834).
- [REC] Blending a tiling detail normal onto a base normal: Reoriented Normal Mapping (Barré-Brisebois and Hill 2012): with tangent-space base n1 and detail n2, `t = n1 + (0, 0, 1); u = n2 * (-1, -1, 1); r = normalize(t * dot(t, u) / t.z - u)`; cheaper "whiteout": `normalize(vec3(n1.xy + n2.xy, n1.z * n2.z))`; "UDN": `normalize(vec3(n1.xy + n2.xy, n1.z))` — ["Blending in Detail"](https://blog.selfshadow.com/publications/blending-in-detail/).

### Inferences
- What is resolvable [CALC from section 1 footprints]: at 0.45 m a pixel is 0.2 to 0.3 mm, so facial pore spacing (0.6 mm) is 2 to 3 px, body follicle spacing (1.8 to 2.7 mm) is 6 to 13 px, and furrow width (well under 0.1 mm) is never resolved. At 1 m body follicles are 3 to 4 px apart; beyond 2 m nothing of the micro-relief is resolvable. So: pores and follicles are worth drawing as normal and albedo dots only inside about 1 m; the furrow net exists only as roughness and glint break-up.
- A scan-free generator consistent with the measured structure: (1) a furrow height field from one or two octaves of cellular (Voronoi) noise using the distance-to-edge function, cell size 0.3 to 0.6 mm for fine lines and 1 to 2.5 mm for the primary net, with the lattice stretched 1.5 to 3 times along a per-vertex direction (skin-tension, "Langer" direction: roughly circumferential on limbs and trunk, radial around joints); (2) follicle pits and small raised rims at jittered-grid points with the per-site spacing above, optionally carrying a goose-bump height; (3) a low-amplitude high-frequency grain. Height amplitudes in the ratio of the real depths (primary : secondary about 3 : 1). Convert to a normal map by finite differences and store the slope variance per mip for roughness. All cell sizes other than the follicle spacing are my estimates from visual experience, not measurements.
- Without UVs there are two ways to apply a generated tile: triplanar sampling of a 2D tile (3 fetches, blend by |N| powers; stretches on diagonals are invisible at this scale) or a single small tiling 3D texture storing a height gradient (1 fetch, projected onto the tangent plane: `n' = normalize(N - k·(g - N·dot(g, N)))`). The 3D option is cheaper per pixel; 128³ at 4 bytes is about 8 MB plus mips. Both get a mip chain, which the current per-pixel noise does not have.
- Anisotropy along tension lines is what makes procedural skin stop looking like orange peel: isotropic cellular bumps read as leather or citrus.
- Displacement versus normal: at the footprints in scope, relief under about 0.3 mm can only be normal and roughness. True geometry (or displacement) matters where silhouette or self-shadowing changes: knuckle and elbow folds, palm creases, tendons, veins on hands and feet, nipples, navel, nail edges, eyelids. That is a mesh question more than a shading one.
- Under the temporal upscaler, feed the normal-variance formula the *render-resolution* derivatives scaled as Filament does for its TAA upscaling [SRC: `derivativesScale`], and apply a negative texture mip bias of log2(1440/2160) = -0.585 [CALC; the practice of biasing mips by the upscale ratio is recalled from upscaler integration guides] to tiled detail textures, otherwise detail is either shimmering or blurred after upscaling.
- Dynamic micro-structure (Nagano) can be approximated without convolution by scaling micro-normal strength and roughness with a per-vertex stretch/compression value from skinning: stretched skin smoother and flatter, compressed skin rougher and more wrinkled [EXT basis; mapping is mine].

### Gaps
- No source was opened for pore diameter by body site, sweat-pore density, average roughness (Ra) of body skin, the size of the primary-line polygons, or goose-bump height; the dermatology figures above are recalled and the polygon sizes are estimates.
- No published procedural (scan-free) skin micro-structure generator with validated statistics was found; Graham's and Nagano's methods both start from measured patches.
- Texture-synthesis approaches were not researched further because they need exemplar scans.

---

## 6. Light transmission through thin parts (ears, nostrils, fingers, webbing)

### Takeaway
All shipping engines compute back-lighting separately from the diffusion blur, in the forward light loop, as `profile(thickness) × back-facing irradiance`: thickness comes from a baked map (or per-vertex value) and/or the sun's shadow-map depth, and the profile is either Jimenez's six-Gaussian sum or Burley's closed form `¼·A·(exp(-s t) + 3·exp(-s t / 3))`. It costs a handful of exponentials and at most one shadow-map read.

### Cited Findings
- [SRC] Jimenez's real-time translucency (2010), exactly as distributed:
  ```hlsl
  float scale = 8.25 * (1.0 - translucency) / sssWidth;                        // translucency in [0,1]
  float4 shrinkedPos = float4(worldPosition - 0.005 * worldNormal, 1.0);       // shrink to avoid edge artefacts
  float d1 = shadowMap(shadowPosition.xy / shadowPosition.w) * lightFarPlane;  // depth of the lit side
  float d2 = shadowPosition.z;                                                 // depth of this point from the light
  float d  = scale * abs(d1 - d2);   float dd = -d * d;
  float3 profile = float3(0.233, 0.455, 0.649) * exp(dd / 0.0064) + float3(0.1, 0.336, 0.344) * exp(dd / 0.0484)
                 + float3(0.118, 0.198, 0.0) * exp(dd / 0.187)    + float3(0.113, 0.007, 0.007) * exp(dd / 0.567)
                 + float3(0.358, 0.004, 0.0) * exp(dd / 1.99)     + float3(0.078, 0.0, 0.0) * exp(dd / 7.41);
  return profile * saturate(0.3 + dot(light, -worldNormal));                   // then × albedo × light colour × attenuation
  ```
  — [SeparableSSS.h](https://github.com/iryoku/separable-sss/blob/master/SeparableSSS.h), use in [Main.fx](https://github.com/iryoku/separable-sss/blob/master/Demo/Shaders/Main.fx); project page [iryoku.com/translucency](https://www.iryoku.com/translucency/) [REC, not opened].
- [SRC] Godot 4 ships the same function for "skin mode": `scale = 8.25 / transmittance_depth; d = scale * abs(transmittance_z)`; result `profile * transmittance_color.a * light_color * clamp(transmittance_boost - NdotL, 0, 1) * (1/π)`; default `transmittance_depth = 0.1` — [scene_forward_lights_inc.glsl](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/shaders/scene_forward_lights_inc.glsl), [class_basematerial3d.rst](https://github.com/godotengine/godot-docs/blob/c7517c2882ec1fcdeb9d773e6537439011df950f/classes/class_basematerial3d.rst).
- [SRC] Burley-profile transmission (Unity and Unreal): integrating the profile over the far side gives `T(t) = ¼·A·(exp(-S·t) + 3·exp(-S·t/3))` with t = thickness in mm and S = 1/d; Unity's optimised form `exp_13 = exp(-S t / 3); T = volumeAlbedo·(exp_13·(exp_13² + 3))` with albedo pre-multiplied by 0.25; Unreal's `0.25·SurfaceAlbedo·(exp(-s·r) + 3·exp(-s·r/3))` with r = thickness / mean free path, tabulated over 32 entries up to `SSSS_MAX_TRANSMISSION_PROFILE_DISTANCE 5.0` — [DiffusionProfile.hlsl](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/DiffusionProfile/DiffusionProfile.hlsl), [BurleyNormalizedSSSCommon.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/BurleyNormalizedSSSCommon.ush), [BurleyNormalizedSSS.cpp](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Private/Rendering/BurleyNormalizedSSS.cpp).
- [SRC] Unreal's angular term for transmission: `PhaseFunction = ApproximateHG(dot(-L, refract(V, -N, 1/IOR)), ScatteringDistribution)` with defaults IOR 1.55, ScatteringDistribution (Henyey-Greenstein g) 0.93, ExtinctionScale 1.0, NormalScale 0.08; `Transmission = lightColor · Profile(thickness) · falloff · PhaseFunction` — [ShadingModels.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/ShadingModels.ush), [SubsurfaceProfile.h](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Source/Runtime/Engine/Classes/Engine/SubsurfaceProfile.h).
- [SRC] Unity's two thickness sources: "Thin Object" uses only the baked thickness map; "Thick Object" "derives the thickness from the shadow map, taking the largest value between the baked thickness and the shadow thickness"; "Shadow maps of directional lights aren't precise enough to use to estimate thickness", so directional lights use a transmission multiplier instead; the default skin profile remaps the thickness map to 0 to 8.15 mm — [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md), [SkinDiffusionProfile.asset](https://github.com/Unity-Technologies/Graphics/blob/0efc28ea742b1966b9dd9cc4489e58b986a13faf/Packages/com.unity.render-pipelines.high-definition/Runtime/RenderPipelineResources/SkinDiffusionProfile.asset).
- [SRC] The cheap view-dependent form already in three.js (Barré-Brisebois 2011): section 2 formula; and Unreal's non-profile "Subsurface" model: `InScatter = pow(saturate(dot(L, -V)), 12) * lerp(3, 0.1, Opacity)`, `BackScatter = AO * saturate(dot(N, H) * Opacity + 1 - Opacity) / (2π)`, `Transmission = lerp(BackScatter, 1, InScatter) * SubsurfaceColor` — [ShadingModels.ush](https://github.com/OpenHUTB/engine/blob/2e52492477198332b8d01f6abfb1319f7b5a36f7/Engine/Shaders/Private/ShadingModels.ush).
- [SRC] Faking transmission by exaggerating pre-integrated curvature fails: it "has the effect of flattening out the front-facing lighting" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] Where diffusion-profile transmission is physically wrong (thin, non-flat geometry such as ears) and what the path-traced reference adds (single scattering along a ray through the part) — [RtxcrSssGuide.md](https://github.com/NVIDIA-RTX/RTXCR/blob/main/docs/RtxcrSssGuide.md).

### Inferences
- For this project the natural input is a per-vertex thickness baked alongside the existing per-vertex occlusion (inverted-normal ambient occlusion, i.e. rays cast inward, is the usual way a thickness map is baked; recalled). Typical values to expect: ear helix and lobe 2 to 5 mm, nostril wing 2 to 3 mm, finger web 2 to 4 mm, fingertip 10 to 15 mm, so only ears, nostrils, webs, lips' edges and eyelids fall inside Unity's 0 to 8 mm skin range [SRC range; anatomical values are my estimates].
- With red d of about 0.76 to 1.1 mm, `T(t)/A` in red is about 0.42 at 2 mm, 0.14 at 5 mm and 0.03 at 10 mm (using d = 1 mm: ¼(e^-2 + 3e^-0.67) = 0.42, ¼(e^-5 + 3e^-1.67) = 0.14, ¼(e^-10 + 3e^-3.3) = 0.027); green with d = 0.4 mm gives 0.14 at 2 mm and 0.01 at 5 mm; blue with d = 0.25 mm gives 0.05 and 0.001 [CALC]. That is why back-lit ears glow saturated red-orange and why the effect disappears on anything thicker than a finger.
- A sun shadow map can refine thickness (Jimenez's `|d1 - d2|`), but with one cascaded or wide directional map the depth precision over a body is poor, as Unity warns; the per-vertex value should be primary and the shadow-map term optional.
- Cost: 2 vector exponentials (Burley form) or 6 (Jimenez form), one dot product and a saturate; zero texture reads with per-vertex thickness. It can be skipped entirely where thickness exceeds about 12 mm, which is most of the body.

### Gaps
- Jimenez's 2010 paper text (derivation, the 0.3 wrap constant's justification, measured timings) was not opened; only the code was read.
- No measured anatomical thickness table was sourced.

---

## 7. Ambient light and contact: coloured multi-bounce occlusion, bent normals, contact shadows, penumbra colour

### Takeaway
Occlusion on skin must not be grey: Jimenez's 2016 multi-bounce fit brightens and tints occlusion by albedo (at 50 % visibility, medium skin keeps about (0.73, 0.65, 0.61) rather than 0.5), and shadow edges on skin carry a red fringe a few millimetres wide from scattering. Both are a few arithmetic operations in a forward shader; screen-space contact shadows for creases exist as a ready node in three.js r187.

### Cited Findings
- [SRC] Multi-bounce ambient occlusion fit (Jimenez et al. 2016, "Practical Realtime Strategies for Accurate Indirect Occlusion", as coded in Filament), per colour channel with albedo ρ and visibility v:
  ```glsl
  vec3 a =  2.0404 * albedo - 0.3324;
  vec3 b = -4.7951 * albedo + 0.6417;
  vec3 c =  2.7552 * albedo + 0.6903;
  return max(vec3(visibility), ((visibility * a + b) * visibility + c) * visibility);
  ```
  — [surface_ambient_occlusion.fs](https://github.com/google/filament/blob/main/shaders/src/surface_ambient_occlusion.fs).
- [CALC] Applied to the database albedos: Skin I at v = 0.25 / 0.5 / 0.75 gives (0.56, 0.48, 0.44) / (0.83, 0.74, 0.70) / (0.93, 0.89, 0.87); Skin III gives (0.47, 0.39, 0.35) / (0.73, 0.65, 0.61) / (0.88, 0.84, 0.82); Skin V gives (0.33, 0.27, 0.25) / (0.59, 0.53, 0.50) / (0.80, 0.77, 0.76). Occluded skin is therefore both lighter than single-bounce occlusion and shifted toward red.
- [SRC] Specular occlusion from the same visibility, and the bent-normal cone-intersection variant (`SpecularAO_Cones`, using Oat and Sander's spherical-cap intersection "mentioned by Jimenez et al. 2016") — [surface_ambient_occlusion.fs](https://github.com/google/filament/blob/main/shaders/src/surface_ambient_occlusion.fs).
- [SRC] Screen-space contact shadows in three.js r187: `sss(depthNode, camera, mainLight)` with `maxDistance` (example 0.2), `thickness` (0.01 to 0.1), `quality`, `shadowIntensity`, optional temporal filtering; "Use Shadow Maps for the foundation and Screen-Space Shadows for the details"; single directional light; references Bend Studio's and Panos Karabelas's write-ups — [SSSNode.js r187](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/tsl/display/SSSNode.js), [webgpu_postprocessing_sss.html](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_postprocessing_sss.html). A `GTAONode` also exists — [three.js r187 tree](https://github.com/mrdoob/three.js/tree/r187/examples/jsm/tsl/display).
- [SRC] Scattering in shadow penumbrae is a first-order visible effect: "the lighting diffusing its way over into the shadowed pixels ... is very noticeable"; Penner's penumbra LUT handles it; the scattering must "extend past the point where the penumbra reaches zero" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] Sharp shadow maps on scattering surfaces expose mesh facets: "the artifacts reveal the underlying topology of the mesh ... the depth rasterized into a shadow map follows the exact surface formed by the triangles" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] Unity's Digital Human package uses "custom marker-driven occlusion for eyes and teeth", i.e. analytic occlusion from known occluders rather than screen-space occlusion, for the places where it matters most — [com.unity.demoteam.digital-human README](https://github.com/Unity-Technologies/com.unity.demoteam.digital-human).

### Inferences
- The sun's angular diameter (about 0.53°, recalled) gives a physical penumbra width of 9.3 mm per metre of occluder distance: 0.19 mm for an occluder 2 cm away (finger on palm), 0.93 mm at 10 cm (arm over chest), 2.8 mm at 30 cm, 9.3 mm at 1 m [CALC]. Scattering then adds a red tail of 1 to 3 mm (red sigma 1.18 mm). So self-shadows on a body are sharper than typical filtered shadow maps make them, but never crisp, and their lit-side edge is red-orange. A shadow that is uniformly blurred and grey reads as "CG"; a shadow with a slight warm fringe reads as skin.
- A forward implementation of the fringe: treat the filtered shadow factor s in [0,1] as penumbra position and apply a per-channel remap in which blue and green follow s (sharpened slightly) while red is widened, for example `shadowRGB = vec3(smoothstep(-w_r, 1, s'), s', s')`-style curves or the proper 1D pre-integrated penumbra LUT (code-generated from the same profile). The widening should correspond to 1 to 3 mm in world space, so it must be scaled by the penumbra's world width, which the shader knows only approximately (shadow filter radius in world units). The exact curve is mine; the principle is Penner's [SRC].
- Baked per-vertex occlusion on a skinned body is wrong wherever limbs move (armpit, inner thigh, elbow and knee creases, arm against torso). The standard remedies are analytic occluders attached to bones (capsules or spheres whose occlusion and soft shadow are evaluated in closed form per pixel; used in Unreal's capsule shadows and in The Last of Us, recalled, unsourced here) or short-range screen-space contact shadows (available in r187 [SRC]). For one hero body, eight to twelve capsules evaluated in the forward shader cost a few tens of operations each and need no extra pass.
- Bent normals (the average unoccluded direction, baked per vertex with the occlusion) improve the sky-light term by sampling the sky in the direction light can actually arrive from; they are essentially free at run time (one more vertex attribute) and reduce the "lit from inside the crease" look.
- Multi-bounce occlusion (9 multiply-adds per pixel) is the cheapest single change that moves skin from grey to warm in shaded areas and should be applied to the sky-light term using the local albedo.

### Gaps
- Jimenez's 2016 paper itself (Activision) was not opened; only the fitted polynomial was read in Filament.
- No source was opened for capsule or analytic limb occlusion formulas; they are recalled as existing practice only.
- No perceptual study quantifying how much coloured penumbrae contribute to perceived realism was found.

---

## 8. What else carries realism on a nude body at 1 to 4 m

### Takeaway
The production evidence available here (Unity's Digital Human feature list, Jimenez's character-rendering work, the databases' separate entries for sclera and cornea) says that beyond the skin shader the realism budget goes to eyes (refraction, occlusion, wetness), hair attached to deforming skin (brows, lashes, stubble), teeth, and tension-driven wrinkles. For a whole nude body at 1 to 4 m, body-wide colour variation, hair coverage and the small anatomical landmarks (nails, nipples, navel, veins, joint folds) take over from pore-level work; this ranking is my inference, since no practitioner survey could be opened.

### Cited Findings
- [SRC] What Unity's Demo Team needed to "realize the digital human from *The Heretic* and *Enemies*": full shader graphs for "skin/eyes/teeth/hair"; a skin-attachment system "used to drive eyebrows, eyelashes, stubble and logical markers"; a "custom pass for cross-material normal buffer blur (tearline)"; "custom marker-driven occlusion for eyes and teeth"; "skin tension to apply wrinkle maps"; a "custom pass for slight blurring around the eye lids" — [com.unity.demoteam.digital-human README](https://github.com/Unity-Technologies/com.unity.demoteam.digital-human).
- [SRC] Eyes get their own scattering profiles in HDRP: `IrisDiffusionProfile 25mm.asset` and `ScleraDiffusionProfile 25mm.asset` ship next to the skin profile; border attenuation in the scattering pass is described as "especially beneficial for rendering complex surfaces like eyes" — [RenderPipelineResources folder listing via code search](https://github.com/Unity-Technologies/Graphics/tree/master/Packages/com.unity.render-pipelines.high-definition/Runtime/RenderPipelineResources), [skin-and-diffusive-surfaces-subsurface-scattering.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/skin-and-diffusive-surfaces-subsurface-scattering.md).
- [SRC] Measured eye constants: cornea IOR 1.376 (Patel and Tutchenko 2019), lens 1.386 to 1.406, sclera albedo (0.652, 0.5, 0.394) linear sRGB with IOR 1.4 and the same subsurface radius as light skin (references include Jimenez's "Next Generation Character Rendering") — [materials.json](https://github.com/AntonPalmqvist/physically-based-api/blob/main/deploy/v2/materials.json). Note the sclera is far from white: about 65 % red reflectance.
- [SRC] Dual-lobe specular matters most on lips ("the thin oily layer on the skin of lips") — [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).
- [REC] Jimenez's eye model (GDC 2013, "Next Generation Character Rendering"): refraction of the iris through the cornea, limbus darkening at the iris edge, a concentrated caustic on the iris side opposite the light, sclera scattering, reflection occlusion from lids and lashes, and a wet line where lid meets eye — [slides](https://www.iryoku.com/downloads/Next-Generation-Character-Rendering-v6.pptx).
- [REC] Hair follicle densities by body site (section 5) set where body hair must exist as texture or cards — [Otberg et al. 2004](https://doi.org/10.1046/j.0022-202X.2003.22110.x).

### Inferences
- Apparent sizes [CALC from footprints at 50° vertical field of view, 1440 rows]: an iris (about 12 mm) is 18 px at 1 m, 9 px at 2 m, under 5 px at 4 m; a fingernail (about 12 mm) the same; an areola (25 to 30 mm) 40 px at 1 m and 10 px at 4 m; the navel (15 mm) 23 px to 6 px; a forearm vein (2 mm) 3 px at 1 m and under 1 px at 4 m; a 30 µm terminal body hair is always sub-pixel. So at body distance, nails, areolae, navel and joint folds are resolved shapes and must be modelled or painted; veins and individual hairs are sub-pixel and must exist as tone and as aggregate shading.
- Body hair on an adult man is a large-area appearance change, not a detail: chest, abdomen line, forearms, lower legs, pubic region and armpits carry enough terminal hair to darken, desaturate and roughen the skin's look (hair hides specular highlights and adds a soft dark fuzz at silhouettes). At 1 to 4 m this can be an albedo-darkening and roughness-raising mask plus a sheen or shell layer near silhouettes; at 0.5 m it needs strands or cards. A hairless body with perfect skin shading reads as a mannequin or a swimmer; this is probably the largest single non-shader cue for a nude male at body distance.
- Nails: a clear-coated, smoother, pinker patch with a pale free edge and lunula; shading them like the surrounding skin is immediately visible on hands at any distance in scope.
- Nipples and areolae: darker (more melanin), slightly redder, bumpy (Montgomery glands, 1 to 2 mm), lower specular. Navel and joint folds: need real occlusion (they are the darkest non-hair regions on the trunk).
- Skin folds and compression (waist when bending, armpit, behind the knee, neck) are deformation problems; in shading terms they need occlusion that follows the pose (section 7) and wrinkle normals keyed to compression (section 5).
- Eyes at 1 to 4 m: correctness of large-scale things matters more than cornea refraction: sclera not white and shaded by the lids (upper-lid shadow and lash occlusion), a stable specular catch-light, a dark limbus ring, a wet lower-lid line as a thin highlight. At 0.5 m, refraction of the iris and the caustic become visible. People look at faces first, so errors here outweigh skin-shader subtleties even though the eyes cover few pixels.
- Vellus hair (peach fuzz): invisible as strands beyond about 0.5 m but visible as a bright soft rim against the sun at any distance; the sheen term of section 3 covers it.
- Tan lines, sunburn zones, scars, stretch marks, moles, blemishes: asymmetric, low-frequency imperfections are what make procedural colour stop looking procedural; a few large unique marks do more than more noise octaves.

### Gaps
- No practitioner ranking ("how much each matters") could be read at source; the ordering above is inference from apparent size and from what production teams chose to build.
- Jimenez's eye shader constants (limbus width, caustic model, refraction formula) could not be opened.
- Hair rendering (strand or card shading models, self-shadowing) is outside what I researched; another note should cover it.

---

## 9. Colour pipeline: linear lighting, exposure, tone mapping; why skin looks waxy, plastic, grey or orange

### Takeaway
Skin is unusually sensitive to the display transform because its reflectance is a mid-value, low-saturation orange: a tone mapper that shifts hue or compresses saturation in the mid range turns it orange, yellow or grey. Khronos PBR Neutral reproduces base colour exactly for inputs between 0.08 and 0.8 with no hue shift; ACES-style filmic curves and AgX trade that fidelity for a film look. The four classic failure looks each have a specific, checkable cause.

### Cited Findings
- [SRC] Khronos PBR Neutral (2024) specification: with F90 = 0.04, Ks = 0.8 - F90, Kd = 0.15, x = min(R, G, B):
  ```
  f  = x - x²/(4·F90)  if x <= 2·F90 else F90
  p  = max(R - f, G - f, B - f)
  pn = 1 - (1 - Ks)² / (p + 1 - 2·Ks)
  g  = 1 / (Kd·(p - pn) + 1)
  out = c - f                               if p <= Ks
        (c - f)·(pn/p)·g + pn·(1 - g)       if p >  Ks
  ```
  "c_out = c_in - F90 for all input colors where 0.08 <= R, G, B <= 0.8"; "For all input colors, there are no hue shifts"; no gamut mapping, Rec. 709 in and out — [KhronosGroup/ToneMapping PBR_Neutral README](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md).
- [SRC] three.js r187 provides TSL tone-mapping functions `linear`, `reinhard`, `cineon`, `acesFilmic` (the Stephen Hill fit from `ltc_blit.fs`), `agx`, and `neutral` (Khronos PBR Neutral, referencing modelviewer.dev's tone-mapping write-up) — [ToneMappingFunctions.js r187](https://github.com/mrdoob/three.js/blob/r187/src/nodes/display/ToneMappingFunctions.js).
- [SRC] Unit mismatch is a designed-in hazard of every diffusion implementation: Babylon "For this effect to be physically accurate, you have to indicate the ratio between scene units and the real world distance in meters"; Unreal exposes `WorldUnitScale`; Unity `worldScale` — sources in section 1.6.
- [SRC] Albedo treatment changes softness: applying albedo only after scattering keeps texture detail sharp; applying `sqrt(albedo)` before and after blurs it "resulting in a softer, more natural look" — [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).
- [SRC] Exaggerated scattering flattens form: raising curvature to fake translucency "has the effect of flattening out the front-facing lighting (since it essentially assumes the light has diffused everywhere on the sphere)" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] A normalised profile is required so the scattering "doesn't add or remove energy (in other words, the kernel integrates to 1 for all possible configurations)" — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] HDRP's diffuse shading power (1 to 3) exists because strongly scattering surfaces otherwise look flat: raising it from 1 to 1.9 makes a head look "less flat" with "deeper shadows" — [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).

### Inferences
- Failure looks, causes and fixes (the causal links are standard practice as I know it; the cited mechanisms are above):

  | Look | Usual causes | Fix |
  |---|---|---|
  | Waxy | scatter radius too large for the scene's units (a 1.2 mm effect applied as 1.2 cm); fixed wrap lighting applied to large-radius body parts; all three channels scattering equally; albedo blurred twice; no pore-scale specular break-up; shadows too soft and too bright | scale the profile in real millimetres; drive softening by curvature (sharpness = r²/variance); keep green and blue near Lambert; keep a crisp specular micro-normal; multi-bounce occlusion instead of lifted ambient |
  | Plastic | one narrow specular lobe; F0 too high (0.04 or more) or coloured specular; uniform roughness; no Fresnel-driven grazing sheen; no specular occlusion in pores and creases; specular not energy-normalised (Blinn-Phong without normalisation) | two GGX lobes (0.75 and 1.3 times roughness, 15 / 85), F0 0.028 white, region-varying roughness, cavity and occlusion on specular, sheen term for fuzz |
  | Grey / dead | desaturated albedo; grey ambient occlusion and grey shadows; no red bleed at terminator and penumbra; no blood-colour variation; lighting or blending done in gamma space; sky light too blue with no ground bounce; filmic tone curve desaturating mid-tones | albedo from the measured table; multi-bounce occlusion; penumbra and terminator red shift; haemoglobin variation; strictly linear lighting; a warm ground-bounce term in the sky light |
  | Orange / sunburnt | over-saturated albedo painted in display space and then tone-mapped again; red scatter radius too large so red wraps everywhere; ACES-style curve pushing bright saturated reds toward orange-yellow; sun colour too warm on top of warm albedo; scatter colour multiplied in twice (albedo and profile both tinting) | measured albedo (saturation is moderate: red/blue ratio 1.5 to 2.3 for types I to III and 3.3 to 4.5 for types IV to VI [CALC from table]); physical radius; a hue-preserving display transform (PBR Neutral) or AgX; white sun with exposure doing the work |

- Exposure: skin albedo has a luminance of 0.68 (type I), 0.54 (II), 0.47 (III) and 0.26 (IV) [CALC with Rec. 709 weights on the table], well above the 18 % grey that auto-exposure targets; sun-lit light skin therefore sits near the shoulder of any tone curve. With PBR Neutral, compression starts at 0.8 (minus 0.04), so exposure should place sun-lit skin diffuse at or below about 0.7 scene-linear, otherwise highlights desaturate toward white and the skin looks chalky.
- ACES filmic (as fitted in three.js) versus AgX versus Neutral for skin: the ACES fit raises contrast and saturation in the mid range and skews saturated bright reds toward orange (a widely reported behaviour; recalled, not sourced here); AgX lowers saturation progressively with brightness (film-like, never neon, can look pale); Neutral is colour-exact in the mid range and only desaturates near clipping. For a game whose owner complains of "not photorealistic" skin, changing the tone mapper will shift the look as much as any shader change, so tone mapping must be fixed before tuning albedo.
- Linear lighting is a precondition, not an option: every constant in these notes (albedos, profiles, F0) is linear. Per-vertex colours, procedural colour constants and any code-generated albedo textures must be authored or converted to linear, and the diffusion or softening must act on linear irradiance before albedo.

### Gaps
- The modelviewer.dev write-up comparing tone mappers, the AgX reference and any study of ACES's effect on skin tones could not be opened (hosts blocked; search budget exhausted); the comparative statements are recalled.
- No source quantifies recommended exposure for skin in real-time engines.

---

## 10. Ranking of components by distance, and what fits in about 1 ms on an M1 at 1440p

### Takeaway
At 1 to 4 m the eye is judging colour, light transport at centimetre scale and anatomy (tone mapping, albedo variation, specular breadth, shadow and occlusion colour, hair, landmarks); physically scaled subsurface *diffusion* is mostly sub-pixel there. At 0.5 m the order inverts toward micro-specular structure, red-channel softening of fine detail, transmission in thin parts and eyes. A forward-only skin model (SG or pre-integrated diffuse, dual GGX, thickness transmission, multi-bounce occlusion, variance-based roughness, one or three detail-texture reads) is plausibly within the budget; a screen-space diffusion pass is plausible only if confined to the body's screen rectangle and to close-up. None of this was measured.

### Cited Findings
- [SRC] Scattering is visible only where irradiance changes over a distance comparable to the profile: at curvature and at shadow edges — [MJP sss-intro](https://github.com/TheRealMJP/TheRealMJP.github.io/blob/master/posts/sss-intro/index.html).
- [SRC] HDRP skips screen-space scattering when the filter radius is below one pixel and scales the sample count with the projected filter area (area / 4 pixels per sample) — [SubsurfaceScattering.compute](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Material/SubsurfaceScattering/SubsurfaceScattering.compute), [diffusion-profile-reference.md](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md).
- [SRC] Jimenez's own quality guidance ties tap count to resolution: 17 taps at 1080p, 11 at 720p — [SeparableSSS.h](https://github.com/iryoku/separable-sss/blob/master/SeparableSSS.h).
- [SRC] Per-component arithmetic, from the code quoted in earlier sections: dual lobe = one extra `D_GGX` (shared visibility and Fresnel); multi-bounce occlusion = three vector multiply-adds plus a cubic; Lagarde specular occlusion = one `pow` and one `exp2`; variance roughness = two derivative vectors and two dot products; Burley transmission = two vector exponentials; Jimenez transmission = six; SG diffuse = three evaluations of a function with one `exp`, one `sqrt` and two reciprocals each; pre-integrated = one RGB texture read (three if per-channel normals differ).
- [CALC] Footprints, sharpness values, penumbra widths and apparent sizes as computed in sections 1, 7 and 8.

### Inferences
**Ranked for body distance, 1 to 4 m** (pixel 0.65 to 2.6 mm at 50° vertical field of view):

1. Display transform, exposure and linear workflow (section 9). Wrong here, nothing else can look right.
2. Albedo level and body-wide variation: measured base tone, redder extremities and face, paler trunk, areolae, tan pattern, 1 to 3 cm mottle (section 4).
3. Specular shape: F0 0.028, broad dual-lobe highlight with region-varying roughness and a grazing sheen; this is what says "skin" on shoulders, chest, shins (section 3).
4. Shadow and ambient colour: multi-bounce coloured occlusion, pose-correct occlusion in creases, soft sun shadow with a warm fringe, a ground-bounce component in the sky light (section 7).
5. Body hair as tone and silhouette softening; brows, lashes, scalp hair (section 8).
6. Anatomical landmarks resolved at this distance: nails, nipples, navel, joint folds, tendons, veins as faint tone (section 8).
7. Eyes read correctly at small size: shaded off-white sclera, catch-light, limbus (section 8).
8. Scattering proper: red softening on small-radius parts (fingers, nose, ears, toes) and back-lit ears and fingers; on trunk and limbs its physically correct magnitude is near zero (section 1).
9. Micro-relief: only as roughness; never as visible bumps.

**Ranked for close-up, 0.45 to 0.5 m** (pixel 0.2 to 0.3 mm):

1. Display transform and albedo (unchanged prerequisites), now including freckles, moles, capillary redness, lip and nail colour, stubble shadow.
2. Micro-specular structure: dual lobe broken by a pore and furrow micro-normal, cavity and specular occlusion, anti-aliased by variance-to-roughness.
3. Scattering: per-channel softening of detail normals (red flattest), red terminator and penumbra fringe (red sigma is about 4 px here), transmission in ears, nostril wings, finger webs.
4. Eyes: cornea refraction, limbus, lid shadow and lash occlusion, wet line; teeth and inner mouth if visible.
5. Hair as strands or cards: brows, lashes, stubble; vellus as rim sheen.
6. Meso-geometry: wrinkles, knuckle folds, palm lines, as normals or displacement tied to compression.
7. A true screen-space diffusion pass: only now does it show (softened pores, bleeding across freckle edges and shadow lines); it is the most expensive item and the least visible improvement over a good forward approximation.

**Budget estimate (unmeasured; assumptions stated).** 1440p is 3.69 million pixels. A standing 1.8 m body covers roughly 2 to 9 % of them at 4 to 2 m with a 50° vertical field of view (about 0.1 to 0.3 Mpx; my estimate from a 48 to 96 % screen-height silhouette about 0.5 m wide) and 30 to 100 % in a face or hand close-up (1.1 to 3.7 Mpx), so close-up is the worst case for every per-pixel cost.

| Component | Added cost per skin pixel (one sun + sky) | Extra pass | Drop order (1 = drop first) |
|---|---|---|---|
| Screen-space diffusion, separable 2 × 11 taps | 44 texture reads (colour + depth) | yes, plus a diffuse-only target | 1 |
| Screen-space diffusion, Burley 8 to 12 jittered taps + temporal accumulation | 16 to 24 reads + profile math | yes, plus a diffuse-only target | 1 |
| Screen-space contact shadows (`SSSNode`) | a ray march of several depth reads | yes | 2 |
| Per-channel softened normals | two extra N·L and normalisations | no | 3 |
| Sheen / fuzz lobe | one cheap lobe | no | 4 (keep at silhouettes if possible) |
| Transmission (Burley form, per-vertex thickness) | 2 vector `exp`, masked to thin parts | no | 5 |
| Detail micro-normal | 1 read (3D tile) or 3 reads (triplanar) | no | 6 (fade with distance; mips do this automatically) |
| Second specular lobe | one `D_GGX` | no | 7 |
| SG or pre-integrated diffuse | about 60 operations, or 1 LUT read | no | keep (fall back to Lambert beyond about 3 m, where it is invisible) |
| Analytic capsule occlusion, 8 to 12 capsules | a few tens of operations each | no | keep at reduced count |
| Variance-to-roughness, specular occlusion, multi-bounce occlusion | about 30 operations together | no | never drop |

- Texture-read arithmetic for a diffusion pass in close-up: 3.69 Mpx × 44 reads = 162 million reads per frame for the separable pass at full screen, 59 to 89 million for an 8 to 12-tap Burley pass. I recall the M1's nominal texture fill rate as about 82 gigatexels per second (unverified), which would put these at roughly 2 ms and 0.7 to 1.1 ms *at the nominal rate*; real throughput with 16-bit float targets and depth reads is lower, so a full-screen separable pass does not fit in 1 ms and a sparse Burley pass is borderline. Confined to the body's rectangle at 2 to 4 m both are cheap, but that is exactly where they are invisible.
- Hence the recommendation implied by the sources: put the whole skin model in the forward shader (as The Order: 1886 and Lone Echo did for the same architectural reason), and treat a screen-space diffusion pass as an optional close-up-only refinement to evaluate last.
- The existing per-pixel 3D value-noise stack (mottle, pores, freckles, veins) is likely the largest current cost: each trilinear value-noise octave is eight hashes plus interpolation, with no mip-mapping. Replacing it with code-generated tiling textures and per-vertex masks should pay for most of the additions in the table. This is an estimate from operation counts, not a measurement.
- Level-of-detail by distance falls out of the footprint numbers: beyond about 1.5 m drop per-channel normals and let the micro-normal collapse into roughness; beyond about 3 m replace SG diffuse by Lambert on everything except per-vertex-flagged small-radius parts; keep transmission only on vertices with thickness under about 12 mm at all distances (it is the one scattering effect visible at 4 m when the sun is behind an ear).

### Gaps
- No timing was measured on an M1 or any other GPU, and no source read gives per-component millisecond costs; every budget figure here is an operation count or a recalled hardware number.
- The project's field of view, body screen coverage and current shader cost are unknown to me; the footprint and coverage figures should be recomputed with the real values.
- The ranking is inference from geometry, optics and production feature lists; no perceptual study or practitioner ranking for a full nude body at 1 to 4 m was found.
