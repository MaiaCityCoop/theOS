# Skin deformation and skinning for a photoreal real-time human body (state as of November 2026)

How each claim is known is marked on every line:

- **[S]** read at the source in this session (a fetched source file or README, or the project's own copy of three.js 0.187.0 in `TheGame/node_modules/three`).
- **[X]** from a search extract: the search tool's summary or snippet of the page; the page itself was not opened. Words in quotation marks on an [X] line reproduce the extract and may not be verbatim from the page.
- **[R]** recalled from training knowledge and not re-verified in this session.

Limits of this research session, which the report writer should carry forward: the session's network allowed only `raw.githubusercontent.com`. The hosts `www.ea.com`, `la.disneyresearch.com`, `dev.epicgames.com`, `docs.blender.org`, `arxiv.org` and `threejs.org` could not be fetched, so no paper PDF and no Epic, Unity, Autodesk or SideFX documentation page was read directly; those are all [X]. The shared web search budget ran out before two planned checks (the Baran and Popović paper text, the Kavan and Sorkine 2012 paper text); what is said about them is [R] or comes from code that implements them.

All cost figures given as "estimate" are my own arithmetic, not measurements. No measured WebGPU skinning numbers were found anywhere.

## 1. Skin weights computed automatically

### Takeaway
The project's current binding (four nearest bones, inverse distance) is the same class as Unreal's lowest tier, "Direct Distance"; the automatic methods production tools actually offer are bone heat (Blender) and geodesic voxel binding (Maya and Unreal, default 256 voxels), and both are implementable offline in a web worker from published descriptions and open source. A further option fits this project unusually well: fit the weights to example shapes (smooth skinning decomposition, EA's open Dem Bones), because the project can generate its own example shapes.

### Cited Findings

Bone heat (Baran and Popović 2007; Blender "automatic weights")
- [S] Blender's implementation names its source as "Automatic Rigging and Animation of 3D Characters, Ilya Baran and Jovan Popovic, SIGGRAPH 2007" and works on the surface triangle mesh only (a Laplacian system over vertices, one linear solve per bone); no tetrahedra or voxels are built. — [blender meshlaplacian.cc](https://github.com/blender/blender/blob/main/source/blender/editors/armature/meshlaplacian.cc)
- [S] The per-vertex heat term in that code is `H = numclosest * C_WEIGHT / mindist²` with `C_WEIGHT = 1.0`, and the right-hand side gives each closest visible bone `p = 1 / numclosest`. A bone counts as "closest" when its distance is within `1 + 1e-4` of the minimum and a BVH ray cast from the vertex to the nearest point on the bone segment hits no triangle (visibility). — [blender meshlaplacian.cc](https://github.com/blender/blender/blob/main/source/blender/editors/armature/meshlaplacian.cc)
- [S] Blender penalises bones that lie behind the surface: the distance is divided by `0.5 * (cos + 1.001)`, where `cos` is the cosine between the vertex normal and the direction from bone to vertex. — [blender meshlaplacian.cc](https://github.com/blender/blender/blob/main/source/blender/editors/armature/meshlaplacian.cc)
- [S] Pruning is built in: weights below 0.025 are dropped and weights between 0.025 and 0.05 are faded to zero (`WEIGHT_LIMIT_START 0.05`, `WEIGHT_LIMIT_END 0.025`). — [blender meshlaplacian.cc](https://github.com/blender/blender/blob/main/source/blender/editors/armature/meshlaplacian.cc)
- [S] When the system cannot be solved the code reports "Bone Heat Weighting: failed to find solution for one or more bones". — [blender meshlaplacian.cc](https://github.com/blender/blender/blob/main/source/blender/editors/armature/meshlaplacian.cc)
- [X] That failure is tied by users and a Blender developer to non-manifold or zero-area geometry, to meshes made of several unconnected pieces, to bones outside the mesh and to very small scale. — [Blender issue 103409](https://projects.blender.org/blender/blender/issues/103409); [Blender issue 84609](https://projects.blender.org/blender/blender/issues/84609); [bf-committers 2013](https://lists.blender.org/pipermail/bf-committers/2013-September/041737.html)

Bounded biharmonic weights (Jacobson et al. 2011)
- [S] The libigl reference API takes a volumetric domain `(V, Ele)` of elements plus boundary indices and values, solves with an active-set quadratic-programming solver, and returns unnormalised weights that the caller normalises; a `partition_unity` option optimises all weights together. — [libigl bbw.h](https://github.com/libigl/libigl/blob/main/include/igl/bbw.h)
- [X] A 2024 paper states that bounded biharmonic weights need the volume inside the surface tetrahedralised, that the tetrahedralisation "can take multiple hours", and that the solver can then still fail when the tetrahedral mesh is too fine. — [Robust biharmonic skinning, arXiv 2406.00238](https://arxiv.org/html/2406.00238v2)
- [X] Jacobson published a variant that solves the same weights on a voxel grid in place of a tetrahedral mesh, noting that dense voxel grids make it slower. — [Jacobson, VoxelBBW](https://www.alecjacobson.com/weblog/3333.html)

Geodesic voxel binding (Dionne and de Lasa 2013; Maya; Unreal)
- [X] The method voxelises the rest-pose mesh and computes binding weights from geodesic distances between the voxels along each bone and the interior voxels; because distance computation is separate from weight assignment, the falloff can be changed without reprocessing. — [Eurographics Digital Library](https://diglib.eg.org/handle/10.2312/15001)
- [X] The 2014 journal version targets non-manifold geometry, non-watertight surfaces and intersecting triangles, using sparse voxelisation. — [TVCG 2014 record](https://katalog.dhi-paris.fr/vufind/Record/NLM252631250)
- [X] In Maya the default maximum voxel resolution is 256 and must be a power of two; falloff runs from 0 (smooth) to 1 (rigid); the method requires all joints to lie inside the mesh volume and can fail on badly degenerate geometry. — [Maya geomBind](https://help.autodesk.com/cloudhelp/2022/ENU/Maya-Tech-Docs/CommandsPython/geomBind.html); [Maya bind methods](https://help.autodesk.com/cloudhelp/ENU/MayaCRE-CharacterAnimation/files/GUID-EEFC3BE1-B386-4664-BD19-8688C58D1618.htm)
- [X] Unreal Engine's in-editor Bind Skin tool offers exactly two binding types, "Direct Distance" (inverse Euclidean distance to the nearest bones) and "Geodesic Voxel"; its Dataflow node defaults to voxel resolution 256 and stiffness 0.2. — [Unreal skeleton editing](https://dev.epicgames.com/documentation/en-us/unreal-engine/skeleton-editing-in-unreal-engine); [BindSkeletonToMesh node](https://dev.epicgames.com/documentation/unreal-engine/node-reference/Dataflow/BindSkeletonToMesh); [ESkinWeightsBindType](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MeshModelingToolsEditorOnly/ESkinWeightsBindType)

Robust Skin Weights Transfer (Abdrashitov et al., SIGGRAPH Asia 2023)
- [X] It is a transfer method, not a from-scratch binder: stage one copies weights from a source mesh only to target vertices where the closest-point match is confident; stage two inpaints the remaining vertices from those. It was designed for body-to-garment transfer. — [project page](https://www.dgp.toronto.edu/~rinat/projects/RobustSkinWeightsTransfer/index.html)
- [S] The authors' sample code "contains the full implementation" and depends on the libigl Python bindings. — [RobustSkinWeightsTransferCode README](https://github.com/rin-23/RobustSkinWeightsTransferCode)

Weights fitted to example shapes (smooth skinning decomposition)
- [S] EA's Dem Bones (BSD 3-Clause, header-only C++ on Eigen) implements "Smooth Skinning Decomposition with Rigid Bones" (Le and Deng 2012) and lists among its uses "solving skinning weights from shapes and skeleton poses" and "solving bone transformations for a mesh animation given skinning weights". — [dem-bones README](https://github.com/electronicarts/dem-bones)
- [X] EA says it has used the technique in its content pipeline since 2015 and that components of it can "solve skinning weights from range of motion (ROM) poses"; Maya's bake deformer and Houdini's skinning converter use the same method. — [EA SEED, Dem Bones](https://www.ea.com/seed/news/open-source-dem-bones)

Neural methods, 2023 to 2026
- [X] UniRig (SIGGRAPH 2025) predicts skeleton and skin weights with an autoregressive model and bone-point cross attention, trained on its own Rig-XL set of about 14,000 rigged models. — [UniRig](https://arxiv.org/html/2504.12451)
- [X] RigAnything (ACM TOG, 2025) reports about 2 seconds per shape against roughly 120 seconds for RigNet (self-reported). — [RigAnything](https://arxiv.org/abs/2502.09615)
- [X] Puppeteer (2025) reports better skin-weight precision, recall and L1 error than geodesic voxel binding, RigNet and MagicArticulate, but a 2026 paper reports that it can leave hands unrigged and produce blocky skinning. — [Puppeteer](https://arxiv.org/pdf/2508.10898); [arXiv 2602.12740](https://arxiv.org/pdf/2602.12740)
- [X] A 2026 preprint adds a geodesic cut-cell prior to neural skinning models and states that linear blend skinning "remains the predominant paradigm for real-time character animation". — [arXiv 2608.11272](https://arxiv.org/pdf/2608.11272)

Influences per vertex in shipping tools
- [S] three.js r187 skins with exactly four influences per vertex (`skinIndex` as `uvec4`, `skinWeight` as `vec4`). — [three.js Skinning.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/accessors/Skinning.js)
- [S] Godot stores four weights per vertex, or eight when the mesh sets `ARRAY_FLAG_USE_8_BONE_WEIGHTS` (the skin stride is 8 or 16 sixteen-bit values). — [Godot mesh_storage.cpp](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/storage_rd/mesh_storage.cpp)
- [X] Unreal clamps to 4 or 8 influences in its default mode; "Unlimited Bone Influences" is capped at 12 in practice, and Epic recommends a threshold of 8 so that only meshes with 9 to 12 influences take the unlimited path. — [Unreal skeletal mesh rendering paths](https://dev.epicgames.com/documentation/en-us/unreal-engine/skeletal-mesh-rendering-paths-in-unreal-engine)
- [X] Unity's quality setting allows 1, 2, 4 or unlimited bones per vertex; the importer cap ranges from 1 to 255 with the lowest weights discarded; Unity's documentation warns of a performance cost "especially above 4 bones per vertex", and (2019 documentation) more than four needs compute-shader skinning. — [Unity SkinWeights.Unlimited](https://docs.unity3d.com/ScriptReference/SkinWeights.Unlimited.html); [Unity maxBonesPerVertex](https://docs-alpha.unity3d.com/ScriptReference/ModelImporter-maxBonesPerVertex.html); [Unity QualitySettings.skinWeights](https://docs.unity3d.com/2019.1/Documentation/ScriptReference/QualitySettings-skinWeights.html)
- [X] Maya's Bind Skin default is 5 maximum influences. — [Maya Bind Skin Options](https://help.autodesk.com/cloudhelp/ENU/MayaCRE-CharacterAnimation/files/GUID-CF2C698A-44BB-4CA0-BCB9-DB36500DA812.htm)
- [X] Tekken 8 doubled its maximum influences and used about seven times as many auxiliary body bones as Tekken 7. — [CGWorld, CEDEC 2024](https://cgworld.jp/article/202409-cedec01-tekken.html)

### Inferences
- The armpit passing through the trunk and the crease at the loins are the expected faults of Euclidean nearest-bone weights: a vertex on the inner arm is close, in a straight line, to ribs and spine. Both bone heat (visibility test) and geodesic voxel binding (distance measured through the interior) exist to stop exactly that.
- For this project the practical order is: geodesic voxel binding or bone heat as the base (surface only or a voxel grid; no tetrahedral mesher needed), then smoothing and pruning. Bounded biharmonic weights give the smoothest result but need a robust tetrahedraliser, which is the hard part to write in plain JavaScript; the voxel-grid variant avoids it at the price of a large solve.
- Offline cost, estimate only: bone heat on about 90,000 vertices is one sparse symmetric system with 90 right-hand sides (one factorisation or 90 conjugate-gradient solves), seconds in a worker. Geodesic voxel at 256³ is 16.7 million cells with one shortest-path sweep per bone; tens of seconds across workers, and 128³ is eight times cheaper. Both are cached with the body.
- Compute and store 8 influences, then derive a 4-influence set for phones by keeping the largest four and renormalising; that matches the 4/8 split in Unreal and Godot.
- Neural riggers need weights learned from thousands of artist-rigged third-party models. They do not fit the "no third-party meshes" rule and target arbitrary shapes; a body generated from known anatomy has better prior information than they do.
- Skinning decomposition turns the question around: if the project can produce target skin shapes for a set of poses (from its muscle model or an offline relaxation), the weights, and the motion of extra helper bones, can be solved to reproduce them. The Robust Weights Transfer method is then the tool to carry weights to lower levels of detail.

### Gaps
- Offline timings from the original papers (bone heat, bounded biharmonic weights, geodesic voxel binding) were not obtained; the paper hosts were unreachable.
- A common production recipe "prune below about 0.01, keep top N, renormalise, then a few smoothing passes" is [R] only; no source confirmed the 0.01 threshold (Maya documentation search did not show it). The only verified pruning thresholds are Blender's 0.025 and 0.05.
- Whether MetaHuman bodies use 8 or 12 influences at the top level of detail was not found.

## 2. The skinning function

### Takeaway
Every engine checked ships linear blend skinning as its default and fixes its faults with extra joints and correctives; dual quaternion skinning exists in Unreal only as a Deformer Graph sample and in Unity and Godot only through third parties. The claim that direct delta mush "shipped in Unreal and Unity" could not be confirmed: searches found it only in libigl and in third-party or student Unity projects. Optimised centres of rotation is the cheapest real upgrade (one extra vec3 per vertex, a few more shader instructions) and has an MIT reference implementation with GLSL.

### Cited Findings

Linear blend skinning
- [S] three.js r187 computes the skinned position as the weighted sum of four bone matrices applied to the bind-space vertex, and transforms normals and tangents with the 3×3 part of the same blended matrix. — [three.js Skinning.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/accessors/Skinning.js)
- [X] The standard list of its artefacts, as named by the optimised-centres paper, is collapsing elbows and candy-wrapper twists; dual quaternion skinning adds bulging around joints. — [Le and Hodgins project page](https://binh.graphics/papers/2016s-cor/)

Dual quaternion skinning (Kavan et al. 2007, 2008)
- [X] The authors report it is slightly slower than linear blending, "7 more vertex shader instructions" in their implementation; scale and shear need a two-phase method costing 29 more instructions; a listed limitation is flipping, since the skin always takes the shorter way round; quaternion antipodality must be handled for robustness. — [Kavan, Skinning with Dual Quaternions](https://users.cs.utah.edu/~ladislav/dq/); [Kavan et al. 2008](https://users.cs.utah.edu/~ladislav/kavan08geometric/kavan08geometric.pdf)
- [X] Kavan and Sorkine (2012) state that dual quaternion blending has a bulging artefact while bending, and that Maya's blend between linear and dual quaternion skinning counters it but reintroduces candy-wrapper shrinkage while twisting. — [Kavan and Sorkine 2012](https://www-old.cs.utah.edu/~ladislav/kavan12elasticity/kavan12elasticity.pdf)
- [S] A complete GLSL version is short: sum four weighted dual quaternions, normalise, convert the real part to a rotation matrix and extract the translation. — [skeletons.glsl](https://github.com/AvatarWorld/OptimisedCentresOfRotationSkinning/blob/master/shader/skeletons.glsl)

Optimised centres of rotation (Le and Hodgins 2016, Disney Research)
- [X] The method precomputes one centre of rotation per vertex from the rest pose and the skin weights; at run time each vertex's rigid transform is interpolated about that centre. The authors claim it "significantly reduces the artifacts of LBS and DQS while maintaining real-time performance and backwards compatibility with the animation pipeline". — [Disney Research](https://studios.disneyresearch.com/?p=39548); [paper PDF](https://la.disneyresearch.com/wp-content/uploads/Real-time-Skeletal-Skinning-with-Optimized-Centers-of-Rotation-Paper.pdf)
- [S] Run-time shader in the reference implementation: blend the four bone rotation quaternions with sign correction and normalise; build rotation `R`; blend the four bone matrices as in linear blending; translation `t = (LBS matrix × centre) − R × centre`; the vertex is `R v + t`. The only added vertex data is `centerOfRotation`, a vec3. — [skeletons.glsl](https://github.com/AvatarWorld/OptimisedCentresOfRotationSkinning/blob/master/shader/skeletons.glsl)
- [S] Precomputation in the same code: the centre for vertex i is the area-weighted, similarity-weighted average of triangle centroids, `Σ area·sim(w_i, w_tri)·centroid / Σ area·sim`; a vertex whose denominator is zero has no centre. Defaults are sigma 0.1, omega 0.1 (a weight-distance threshold for the neighbour search), optional edge subdivision where the skin-weight distance across an edge is at least 0.1, and a breadth-first variant with cut-off 1e-6; it is multithreaded. — [CoRCalculator.cpp](https://github.com/AvatarWorld/OptimisedCentresOfRotationSkinning/blob/master/src/CoRCalculator.cpp); [CoRCalculator.h](https://github.com/AvatarWorld/OptimisedCentresOfRotationSkinning/blob/master/include/cor/CoRCalculator.h)
- [R] The similarity function in the paper is `s(a, b) = Σ_{j≠k} a_j a_k b_j b_k · exp(−(a_j b_k − a_k b_j)² / σ²)`. — [paper PDF](https://la.disneyresearch.com/wp-content/uploads/Real-time-Skeletal-Skinning-with-Optimized-Centers-of-Rotation-Paper.pdf)
- [X] One Unity developer measured his implementation at "roughly about 83% the speed of the built in gpu skinning" and called the precomputation expensive (anecdote, not a benchmark). — [Unity Discussions](https://discussions.unity.com/t/cor-real-time-skeletal-skinning-with-optimized-centers-of-rotation/733353)
- [X] An independent evaluation (Bittner et al., CVM 2019) compared it with linear and dual quaternion skinning for quality and frame rate and published the code used above; its tables were not retrieved. — [TU Braunschweig](https://graphics.tu-bs.de/publications/bittner2019evaluation)

Delta mush (Mancewicz et al., DigiPro 2014)
- [X] Delta mush smooths arbitrary deformation of a mesh without smoothing the model's original detail, needs no meticulous tuning, and was used in all character rigs at Rhythm and Hues from 2010. — [DigiPro 2014 record](https://dblp.uni-trier.de/rec/conf/digipro/MancewiczDRW14.html)
- [S] Mechanism: offline, smooth the rest mesh and store per-vertex "delta" between rest and smoothed rest; each frame, skin the mesh, smooth the result the same way, and add the delta back, re-expressed in the deformed local frame. — [V-Sekai notes](https://github.com/V-Sekai/unity-mesh-deform-direct-delta-mush/blob/main/notes.md)
- [X] Maya's node uses iterative Laplacian smoothing with equal weights, default 10 iterations at step 0.5. — [Maya deltaMush node](https://help.autodesk.com/cloudhelp/ENU/MayaCRE-Tech-Docs/Nodes/deltaMush.html)
- [S] Blender's Corrective Smooth modifier is delta mush by its own source comment ("also known as 'delta-mush'"); it has simple and length-weighted smoothing, a strength (lambda) and a repeat count, and stores deltas in per-corner tangent spaces. — [Blender MOD_correctivesmooth.cc](https://github.com/blender/blender/blob/main/source/blender/modifiers/intern/MOD_correctivesmooth.cc)

Direct delta mush (Le and Lewis, SIGGRAPH 2019, EA SEED)
- [X] It replaces the per-frame iterative smoothing with a direct per-vertex computation whose data is precomputed once per model; EA states it separates rotational and translational effects, giving independent control of bending against twisting and "a skin sliding effect", and is suitable for GPU shaders. — [EA SEED](https://www.ea.com/seed/news/siggraph2019-direct-delta-mush)
- [S] libigl's reference implementation (variant 0, Mozilla Public License 2.0): precomputation takes rest vertices, triangles, the ordinary skin weights, an iteration count p, step sizes lambda and kappa (kappa below lambda) and a blend alpha, and outputs `Omega`, a matrix of #vertices × (#bones × 10): the ten unique values of a symmetric 4×4 matrix per vertex-bone pair. Smoothing is done by p implicit solves with `(I + λ·L̄)`. — [libigl direct_delta_mush.h](https://github.com/libigl/libigl/blob/main/include/igl/direct_delta_mush.h); [libigl direct_delta_mush.cpp](https://github.com/libigl/libigl/blob/main/include/igl/direct_delta_mush.cpp)
- [S] Run time per vertex in that code: `Q = Σ_bones M_bone × Ω`; divide by the last element; take the 3×3 block minus the outer product of the translation and centre parts; one 3×3 singular value decomposition gives the rotation `R = U Vᵀ`; `t = q − R p`; the vertex is `R v + t`. — [libigl direct_delta_mush.cpp](https://github.com/libigl/libigl/blob/main/include/igl/direct_delta_mush.cpp)
- [X] EA's own follow-up (Le, Villeneuve and Gonzalez-Ochoa, SIGGRAPH 2021) says the storage and run-time cost are "relatively high" because the weights are 4×4 matrices and each vertex needs a 3×3 singular value decomposition; its slides put the theoretical storage at 16 times that of linear or dual quaternion skinning, and the paper compresses the model to cheaper skinning using examples. — [EA SEED, DDM compression](https://www.ea.com/seed/news/ddm-compression-with-continuous-examples); [slides](https://media.contentapi.ea.com/content/dam/ea/seed/presentations/ddm-compression-with-continuous-examples.pdf)
- [X] "Enhanced Direct Delta Mush" (Apple, 2020) reports that the original fails on non-rigid joint transforms and replaces the full singular value decomposition with a polar decomposition giving equivalent results at lower cost. — [arXiv 2101.02798](https://arxiv.org/abs/2101.02798)
- [X] A GPU implementation in Unity (University of Pennsylvania course project) found classic delta mush "much costlier than any variants of the Direct Delta Mush even at 10 iterations", with variants 0, 1 and 4 faster than 2 and 3. — [MeshDeformUnity](https://github.com/PacosLelouch/MeshDeformUnity)
- [X] The assignment's premise that direct delta mush shipped in Unreal and Unity was not confirmed. Two searches found no built-in direct delta mush in Unreal Engine, Unity, Maya or Houdini (Maya ships the iterative delta mush deformer); the implementations found are libigl, a student Unity project and a community Unity fork. — [Maya Delta Mush deformer](https://help.autodesk.com/cloudhelp/ENU/MayaCRE-CharacterAnimation/files/GUID-139B703C-28E7-4787-8FD4-C2991BD6C990.htm); [MeshDeformUnity](https://github.com/PacosLelouch/MeshDeformUnity); [V-Sekai fork](https://github.com/V-Sekai/unity-mesh-deform-direct-delta-mush)

Implicit skinning (Vaillant et al. 2013, 2014)
- [X] It approximates the body with implicit surfaces and projects the skinned vertices onto adjusted iso-surfaces to model contact; the paper's comparison figure reports 95 frames per second for standard skinning, 37 with contact handling and 35 with an added bulge. — [paper copy](https://discmaster.textfiles.com/file/16678/SIGGRAPH%202013%20-%20Disc%203.iso/content/papers/125-0312.pdf); [record](https://oskar-bordeaux.fr/handle/20.500.12278/181180?show=full)
- [X] The 2014 follow-up adds new blending operators for self-contact and a tangential relaxation based on as-rigid-as-possible energy, giving skin sliding and elasticity. — [HAL record](https://hal.archives-ouvertes.fr/hal-01091820)
- [X] A critical review notes that the 2013 method starts from ordinary skin weights, so deep bends can self-intersect before projection and break it, and that the authors released no source. — [Implicit Skinning, Part 2](https://solaire.cs.csub.edu/aestus/implicit-skinning-part-2/)

Projective skinning (Komaritzan and Botsch 2018, 2019)
- [X] Fast Projective Skinning uses projective dynamics, needs only a triangle mesh and a skeleton (no skin weights), handles global collisions, and is an order of magnitude faster than its predecessor. — [Bielefeld record](https://pub.uni-bielefeld.de/record/2937882)
- [S] Its public code simulates a decimated mesh and upsamples to the visual mesh (the human example is simulated at 20 percent resolution); the GPU version requires CUDA. — [FastProjectiveSkinning README](https://github.com/mbotsch/FastProjectiveSkinning)
- [S] The README recommends "at least 20 Neighbors for upsampling and about 3000-5000 simulated vertices for good and fast results". — [FastProjectiveSkinning README](https://github.com/mbotsch/FastProjectiveSkinning)

What ships where
- [S] three.js r187: linear blend, four influences, in the vertex stage; a `computeSkinning` function for compute passes. — [three.js Skinning.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/accessors/Skinning.js)
- [S] Godot 4: linear blend of bone matrices in a compute shader (work group size 64), with blend shapes applied in the same pass; four or eight weights. — [Godot skeleton.glsl](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/shaders/skeleton.glsl)
- [X] No official source for built-in dual quaternion skinning in Godot was found (the compute shader read above blends matrices only); a community demo implements it in a spatial shader. — [Godot asset library](https://godotengine.org/asset-library/asset/2062)
- [X] Unreal Engine 5: linear blend by default; the Deformer Graph ships a `DG_LinearBlendSkin` graph with variants for morph targets, cloth and a normal-recompute pass; dual quaternion skinning has been available since the 5.1 samples as `DG_DualQuatDeformerDemo`, with user reports that it is slow and mishandles bone scale; a third-party toolkit blends the two with a per-vertex mask. — [Unreal Deformer Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/deformer-graph-in-unreal-engine); [Unreal forum](https://forums.unrealengine.com/t/dual-quaternion-support/144831/30); [DualSkin Toolkit](https://forums.unrealengine.com/t/nicolas-michel-dualskin-toolkit/2732323)
- [X] Unity 6: linear blend, with CPU, GPU (compute, one dispatch per mesh and blend shape) and batched GPU deformation modes. — [Unity MeshDeformation](https://docs.unity3d.com/2023.1/Documentation/ScriptReference/MeshDeformation.GPUBatched.html)
- [S] Dual quaternion skinning in Unity is a third-party compute-shader script. — [DQ-skinning-for-Unity README](https://github.com/KosRud/DQ-skinning-for-Unity)
- [X] MetaHuman bodies: linear blend plus corrective joints driven by radial-basis-function solvers and swing/twist setups; body correctives are applied only at the top level of detail by default. — [MetaHuman body rig editing](https://dev.epicgames.com/documentation/metahuman/metahuman-stylized-character-body-rig-editing); [MetaHuman component](https://dev.epicgames.com/documentation/en-us/metahuman/the-metahuman-component-for-unreal-engine)

### Inferences
- Per-vertex cost, estimate from the code read: linear blend is 4 matrix reads and 4 matrix-vector products. Dual quaternion is 4 reads of 8 floats, a normalise and a conversion. Optimised centres is the linear blend plus 4 quaternion reads, one quaternion-to-matrix conversion and one more matrix-vector product, with 12 bytes more per vertex. Direct delta mush with N influences is N reads of 10 floats, N 4×4 products and one 3×3 decomposition, with 40 bytes per influence per vertex as float32. Delta mush is the base skinning plus k passes of about 6 neighbour reads each, and it cannot run in a single vertex shader pass; it needs compute.
- What each fixes for the listed faults: optimised centres addresses volume loss at elbow and knee and the candy wrapper, without the dual-quaternion bulge. Delta mush and its direct form address crumpling (buttock, loins) by keeping the surface smooth, and they forgive poor weights. None of the pure skinning functions handles contact (armpit, groin, knee pit): that needs implicit or projective methods or authored correctives.
- A square shoulder with the arm raised is not a skinning-function fault at all; it is missing clavicle and scapula motion and missing deltoid shape (see question 5).
- Brute-force centre precomputation is vertices × triangles similarity evaluations (about 1.6 × 10¹⁰ for this mesh); the neighbour-limited variant in the reference code is the one to port. Offline cost, acceptable.
- Storage for direct delta mush on a 100,000-vertex body with 8 influences: 100,000 × 8 × 10 floats = 32 MB as float32, 16 MB as float16 (estimate). Smoothing spreads influence, so more than 4 influences per vertex are needed after precomputation.

### Gaps
- No frame-time table for direct delta mush, optimised centres or delta mush on any GPU was retrieved; the EA and Disney papers were unreachable.
- The elasticity-inspired deformers of Kavan and Sorkine (2012) are known here only as [R]: joint-based deformers that treat swing and twist separately together with optimised weights; the paper text was not checked.
- Whether any Unreal release after 5.5 added a native dual quaternion option was not confirmed; the 5.5 release notes excerpts did not mention one.

## 3. Correctives

### Takeaway
Shipping real-time bodies get their quality from correctives layered on linear blending, in three forms: twist and helper joints driven by simple rules or radial basis functions (MetaHuman, Tekken 8, God of War Ragnarök), pose-driven blend shapes (the SMPL family), and learned morph-target bases (Unreal's Neural Morph Model, trained on 5,000 to 20,000 simulated poses and costing well under a millisecond). The project lacks scans but can generate the training shapes itself.

### Cited Findings

Pose-driven blend shapes (SMPL, STAR)
- [S] In the reference SMPL-X code the pose feature is the joints' rotation matrices minus the identity, flattened (nine numbers per joint, root excluded); the offsets are that feature times a learned basis `posedirs`; they are added to the rest shape before linear blend skinning. — [smplx lbs.py](https://github.com/vchoutas/smplx/blob/main/smplx/lbs.py)
- [X] SMPL has 23 joints, so 207 pose blend shapes, over a 6,890-vertex mesh (basis 6890 × 3 × 207); the patent text notes that because rotation-matrix elements are bounded the correction cannot "blow up" outside the training set. — [SMPL patent](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10395411)
- [S] SMPL-X has 10,475 vertices and 54 joints. — [smplx README](https://github.com/vchoutas/smplx)
- [S] STAR learns "sparse and spatially local pose corrective blend shapes", so one joint moves only a nearby set of vertices; with SMPL "bending the left elbow causes a bulge in the right elbow". It was trained on scans of 14,000 subjects and is under a non-commercial research licence. — [STAR README](https://github.com/ahmedosman/STAR)
- [X] STAR uses a quaternion per joint in place of nine matrix elements, has about 20 percent of SMPL's parameters (SMPL's pose correctives exceed 4.2 million), and makes the correctives depend on body shape. — [STAR paper](https://arxiv.org/pdf/2008.08535)

Twist and helper joints
- [X] Epic's UE5 mannequin has twist bones named `upperarm_twist_01`, `lowerarm_twist_01`, `thigh_twist_01`, `calf_twist_01` (left and right); they are leaf bones under the limb, not a chain. — [community bone list](https://docs.google.com/document/d/1F5S5J5o4RX6CalrAuuXhIGtUH2a2dlkd/export?format=pdf); [Reallusion report](https://www.reallusion.com/FeedBackTracker/Issue/Inconsistent-twist-bone-hierarchy-in-Unreal-Engine-skeletons)
- [X] Cascadeur describes that mannequin's arm as one untwist joint with two twist joints. — [Cascadeur twist bones](https://cascadeur.com/help/rig/advanced_rigging/advanced_rigging_techniques/twist_bones)
- [X] A procedural control rig distributes the limb's rotation onto the twist bones, and the upper arm has a pose driver with poses named "twist_in" and "twist_out". — [Unreal forum](https://forums.unrealengine.com/t/manny-twist-bones-how/1906562)
- [X] Practitioner consensus in the threads found: two well-weighted twist bones per segment is the usual figure; three or four are used by some at a cost; the thigh takes the same setup as the upper arm. — [Polycount](https://polycount.com/discussion/comment/1834910); [Autodesk real-time rigging](https://autodesk.com/learn/ondemand/curated/realtime-rigging-twist-and-roll-joints/6y2NleA3wlCwRgu7sxnf2T)
- [X] The MetaHuman body differs from the mannequin by five spine joints in place of three and by extra corrective joints on torso, shoulders, elbows, hands, fingers, thighs, calves and feet. — [Unreal forum](https://forums.unrealengine.com/t/what-skeleton-does-metahuman-use/741546/2)
- [X] MetaHuman uses one joint set across all levels of detail and removes joints at lower levels by exclusion; only level 0 uses vertex displacement shapes. — [MetaHuman DNA](https://dev.epicgames.com/documentation/metahuman/metahuman-dna-rig-definition-and-rig-operation)

Radial basis function drivers
- [X] MetaHuman corrective joints are driven by a solver that compares the current driver joint rotations with saved poses and computes weights for the corrective joints; in MetaHuman 5.7 the radial-basis and swing/twist logic moved onto the bind skeleton. — [MetaHuman body rig editing](https://dev.epicgames.com/documentation/metahuman/metahuman-stylized-character-body-rig-editing); [MetaHuman asset changes](https://dev.epicgames.com/documentation/metahuman/metahuman-asset-changes)
- [X] Unreal's Pose Driver node is a radial-basis-function driver on the orientation of source bones that can drive poses, curves or the transforms of corrective bones. — [Pose Driver node](https://docs.unrealengine.com/4.27/AnimatingObjects/SkeletalMeshAnimation/AnimPose/PoseDriverNode/); [Unreal forum](https://forums.unrealengine.com/t/how-to-use-corrective-bones-in-animations/1177677/3)
- [X] Tekken 8's muscle rig uses radial basis functions for the complex regions (shoulders, trapezius, hips, upper femur) and driven keys for the simple ones (wrists, fingers, head, ankles), designed so that no pose in a very wide range of motion breaks. — [CGWorld, CEDEC 2024](https://cgworld.jp/article/202409-cedec01-tekken.html)
- [X] God of War Ragnarök reached its skin quality with joints only: a systematic joint rig laid along the curved fibre structure of each muscle to preserve volume, plus dynamic "jiggle" joints for muscle, fat and skin. — [GDC Vault](https://gdcvault.com/play/1029203/Joint-Based-Skin-Deformation-in); [slides (not opened)](https://sms.playstation.com/media/documents/GOWR_Tenghao_Wang_JointBasedSkin_GDC23.pdf)

Unreal's ML Deformer
- [X] The Neural Morph Model generates "a set of highly compressed morph targets" approximating a target deformation from bone rotations and curves; a small network runs on the CPU and outputs the morph weights; it has local and global modes. — [UNeuralMorphModel](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/NeuralMorphModel/UNeuralMorphModel)
- [X] Training needs the skeletal mesh, an animation covering a wide range of motion, and a geometry cache holding the target deformation for the same frames. — [ML Deformer framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/ml-deformer-framework-in-unreal-engine)
- [X] Advice from an Epic-affiliated developer: 10,000 to 20,000 poses for global mode, 5,000 or fewer while iterating. — [Unreal forum](https://forums.unrealengine.com/t/experimenting-with-daz-characters-and-the-ml-deformer/732897)
- [X] Reported cost (Unreal 5.1 era): about 1 MB of GPU memory, under 100 microseconds per character on the CPU and under 50 on the GPU on current consoles. A later update with a bone mask cut GPU time and memory by about 40 percent; the sample's muscular character needs a little over 6 MB of GPU memory, down from 12.6 MB. — [80 Level](https://80.lv/articles/unreal-engine-5-1-s-updated-ml-deformer-explained); [80 Level, sample update](https://80.lv/articles/unreal-engine-5-s-ml-deformer-sample-gets-updated); [Epic engineer's post](https://www.linkedin.com/posts/emotionfx_ue5-mldeformer-machinelearning-activity-6984282730716876800-NWyx)
- [X] The Nearest Neighbor Model predicts coefficients of a linear basis of vertex deltas and then adds the delta of the nearest stored example, optionally blending several neighbours with radial basis functions; it is aimed at cloth. — [UNearestNeighborModel](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/NearestNeighborModel/UNearestNeighborModel)
- [X] Houdini's equivalent pipeline generates random training poses with each joint's angle drawn from a range taken from representative animation (the full 360 degrees "is an ineffective strategy") and reduces the skin displacements with principal component analysis. — [Houdini ML Deformer](https://www.sidefx.com/docs/houdini/ml/mldeformer.html)

Recent research
- [X] Zheng and Barbič (ACM TOG, December 2024) learn pre-skinning corrections at several resolutions with a partition of unity over the mesh, targeting "a few milliseconds at most and preferably under 1 millisecond", trained from finite-element simulation. — [DOI 10.1145/3687985](https://doi.org/10.1145/3687985)
- [X] Bailey et al. (2018) split a film rig's deformation into a linear part computed from the skeleton and a non-linear residual approximated by small networks; the facial follow-up reports up to 17 times the speed of the original rig. — [SIGGRAPH archive](https://history.siggraph.org/?p=100778)

Wrinkle maps
- [X] Jimenez et al. blend wrinkle normal maps over the base normal map with per-region masks and weights; a pose-driven variant compares the current pose with a few reference poses to produce the weights; practitioners note the cost is sampling two or three extra normal maps. — [Jimenez, wrinkles](https://www.iryoku.com/wrinkles); [TCD dissertation](https://publications.scss.tcd.ie/theses/diss/2011/TCD-SCSS-DISSERTATION-2011-057.pdf)
- [X] A 2023 method drives wrinkle intensity automatically from mesh tension, removing hand-made masks. — [Raman et al., WACV 2023](https://openaccess.thecvf.com/content/WACV2023/papers/Raman_Mesh-Tension_Driven_Expression-Based_Wrinkles_for_Synthetic_Faces_WACV_2023_paper.pdf)

### Inferences
- The formulation of SMPL and STAR is usable; their data is not (licence and project rule). The useful lessons are: use bounded rotation features (matrix elements or quaternions), keep each joint's corrective local to nearby vertices, and apply correctives before skinning.
- Dense SMPL-style correctives do not fit this mesh: 90 joints × 9 features = 810 shapes × 90,000 vertices × 3 floats is about 875 MB as float32 (estimate). Per-joint sparsity or a compressed global basis is required; Unreal's 6 MB for a muscular body shows the achievable scale.
- Any corrective is stored as a rest-space delta: take the target shape, apply the inverse of the vertex's blended skinning transform, subtract the rest position. The same definition serves hand-made pose correctives, simulated targets and muscle bulge.
- Twist needs no radial basis function: decompose the child joint's rotation into swing and twist about the bone axis and give each twist joint a fraction of the twist. The project's forearm already has a real radius turning about the ulna, which is the anatomical version of forearm twist joints; the upper arm and thigh still need two twist joints each because the humerus and femur roll under skin that is anchored at the shoulder and hip.
- Pose-driven wrinkle maps are worth their cost only at the closest viewing distance (0.45 m) and only at a few places: elbow and knee creases, wrist, front of the ankle, neck, the fold under the buttock.

### Gaps
- Lewis, Cordner and Fong, "Pose Space Deformation" (SIGGRAPH 2000) is the origin of pose-driven correctives; no source for it was retrieved, so its details are [R] only (scattered interpolation of sculpted deltas in pose space with radial basis functions).
- The exact joint count of the MetaHuman body and its per-level joint lists were not found; one forum post mentions a 342-bone skeleton without saying what it covers.
- The God of War Ragnarök slides, which hold the joint counts and driver details, are public but could not be opened.

## 4. Muscle and soft tissue

### Takeaway
Film pipelines simulate muscle, fascia, fat and skin as layers with sliding attachments and then, for speed, learn the result; Wētā's BodyOpt parametrises the learned skin deformation by the length changes of muscle fibres, which is precisely the signal this project's 206 strands already produce. Games do not simulate at run time: they bake to morph bases (Unreal's Chaos Flesh into the ML Deformer) or express muscles as joints. Tearing is avoided in all of them by never letting a vertex follow a single muscle directly.

### Cited Findings

Film and high-end pipelines
- [X] Wētā's BodyOpt (SIGGRAPH 2023 talk) learns skin deformation from a dataset; it pairs the kinematic skeleton with muscle fibres as an anatomical basis and uses the fibres' length changes to parametrise the non-linear part of the deformation. It was used on 12 hero characters and 5 generic transfer elements in Avatar: The Way of Water, with datasets of roughly 2,400 to 3,600 frames each, curated to reduce differences between similar poses. — [Wētā FX paper](https://www.wetafx.co.nz/assets/Uploads/PDFs/siggraph2023_bodyopt.pdf); [SIGGRAPH archive](https://history.siggraph.org/learning/bodyopt-a-character-deformation-pipeline-for-avatar-the-way-of-water-by-sprenger-mack-stomakhin-and-fernandez)
- [X] BodyOpt 2.0 (SIGGRAPH 2025 talk) adds a learned mesh convolutional network and fast secondary dynamics; it was used again on Avatar: Fire and Ash to give hero-quality deformation without a dedicated simulation. — [Befores and Afters, 2026](https://beforesandafters.com/2026/03/24/powering-a-vfx-oscar-winner/)
- [X] Ziva Real-Time predicts soft-tissue deformation with a model trained offline on simulation; Unity ended sales and support of all Ziva products on 2 April 2024 and DNEG received an exclusive perpetual licence. — [CG Channel 2023](https://www.cgchannel.com/2023/07/unity-releases-ziva-real-time-2-0/); [CG Channel 2024](https://www.cgchannel.com/2024/04/unity-discontinues-the-ziva-products/)
- [X] Houdini's Vellum muscle and tissue workflow is now labelled legacy; it runs passes in order (muscle, tissue, skin). The tissue's surface has a sliding attachment to muscle and bone, and the skin is constrained to the tissue surface with a variable amount of sliding, which is what reveals wrinkles and folds. Its successor, Otis, simulates all layers in one pass. — [Houdini Vellum muscles overview](https://www.sidefx.com/docs/houdini/muscles/overviewvellum.html); [Houdini muscles overview](https://www.sidefx.com/docs/houdini/muscles/overview.html)
- [X] SideFX advises against attaching tissue to bones that move a lot relative to the skin, naming the scapula, rib cage and patella, and requires a considerable gap between muscle or bone geometry and the render skin. — [Houdini Vellum workflow](https://www.sidefx.com/docs/houdini/muscles/workflowvellum.html)

Unreal's path, 2024 to 2026
- [X] Chaos Flesh is a tetrahedral simulation focused on muscle deformation during skeletal animation; it reaches real time by simulating low-resolution geometry at run time together with cached results of an offline high-resolution simulation. — [Chaos Flesh overview](https://dev.epicgames.com/documentation/unreal-engine/chaos-flesh-overview)
- [X] The documented route to a game is: simulate, cache, export the cache as a geometry cache, train the ML Deformer's Neural Morph Model on it. — [Chaos Flesh quickstart](https://dev.epicgames.com/documentation/unreal-engine/chaos-flesh-quickstart)
- [X] Epic published a muscle simulation tutorial for 5.6; a user reports stacking several ML Deformers on one mesh to combine length-based and curve-driven muscle activation. — [Unreal forum, 5.6 tutorial](https://forums.unrealengine.com/t/tutorial-chaos-flesh-muscle-simulation-tutorial-5-6/2605859); [Unreal forum](https://forums.unrealengine.com/t/chaosflesh-muscle-simuation/2674694)

Muscles as smooth fields
- [X] Roussellet et al. (2018) model each muscle as an implicit surface extruded along a central axis, keep its volume constant, drive the axes with position-based dynamics, and feed the muscles into implicit skinning; more than fifty muscles take under a second per frame on a CPU. — [Roussellet et al. 2018](https://users.cs.utah.edu/~ladislav/roussellet18dynamic/roussellet18dynamic.pdf)

Skin sliding
- [X] Direct delta mush is described by its authors as the first direct skinning model that can do skin sliding. — [EA SEED slides](https://media.contentapi.ea.com/content/dam/ea/seed/presentations/direct-delta-mush-and-variants.pdf)
- [X] Yang et al. (2017) treat sliding as a constraint in position-based or projective dynamics with collision against the original deforming surface; an earlier method by the same group slides skin in real time by resampling in parameter (UV) space. — [DOI 10.1145/3105692.3105701](https://unpaywall.org/10.1145%2F3105692.3105701); [Bournemouth record](https://eprints.bournemouth.ac.uk/10615/)
- [X] Ramos and Larboulette give a geometric skin-sliding algorithm on the GPU aimed at games. — [Ramos and Larboulette](https://dspace5old.zcu.cz/bitstream/11025/6975/1/Ramos.pdf)
- [X] A DNEG developer released a GPU-accelerated skin-slide deformer for Houdini in January 2025. — [CG Channel](https://www.cgchannel.com/2025/01/check-out-this-neat-gpu-accelerated-houdini-skin-slide-deformer)

Joint-based muscles in games
- [X] God of War Ragnarök and Tekken 8 both express muscle bulge and volume through many helper joints with ordinary skin weights (see question 3). — [GDC Vault](https://gdcvault.com/play/1029203/Joint-Based-Skin-Deformation-in); [CGWorld](https://cgworld.jp/article/202409-cedec01-tekken.html)

### Inferences
- Why a direct muscle-to-skin displacement tears: if each vertex is pushed by its nearest strand, two neighbouring vertices can belong to different strands and receive different pushes, in different directions, and the assignment flips as the pose changes. The field is discontinuous in space and in time. Every source above removes that discontinuity in one of four ways.
  1. Low-dimensional basis: muscles drive weights of smooth shapes (morph basis or helper joints with smooth skin weights); the skin can only move in continuous patterns. This is the game route (Tekken 8, God of War, Unreal's morph model) and BodyOpt's.
  2. Smooth field then projection: union the muscles into one smooth implicit field and move skin along its own normal to an offset of that field (Roussellet, Vaillant). Continuous by construction and it handles contact, but it is the costliest at run time.
  3. Regularise the raw displacement: compute the raw push, then smooth it over the surface (Laplacian passes, as in delta mush) before adding it, so that only the smooth part survives.
  4. Solve offline: compute the relaxed skin for many poses once (quasi-static: skin held at a thickness above muscle and bone, with stretch and bending energies and sliding), then compress to a basis driven by the pose and by fibre lengths.
- The fit for this project is 4 feeding 1: an offline solve in workers, sampled over the range of motion, produces target skins; principal component analysis or a small network produces a basis; at run time the features are joint rotations and the strands' shortening, both already available. This is the Chaos Flesh to Neural Morph Model route with the project's own solver, and it needs no scans.
- A cheap first step that already avoids tearing: per muscle, a smooth per-vertex weight field (heat diffusion from the strand over the surface, normalised across muscles) times a scalar bulge driven by that strand's shortening, displacing along the rest normal. One blend shape per muscle or muscle group, built by code; 206 strands grouped to a few dozen shapes keeps memory small.
- Sliding should be tangential only: after bulge, move vertices within the surface (toward the Laplacian average of their neighbours, projected onto the tangent plane) rather than re-projecting freely in three dimensions, so texture detail does not swim; anchor it to zero at bony landmarks where real skin is tethered.
- Contact (armpit, groin, elbow crease, knee pit) is the one place where a run-time method may still be needed for arbitrary poses; a baked basis handles the sampled range and a small set of capsule or signed-distance pushes handles the rest.

### Gaps
- No source describes a browser or WebGPU implementation of any of these.
- Wētā's Tissue solver and Loki were not researched beyond the BodyOpt items; no technical detail was retrieved.
- Whether Spider-Man 2 used Ziva was not confirmed; the search confirmed only Spider-Man: Miles Morales. — [80 Level](https://80.lv/articles/unity-released-ziva-real-time-2-0/)
- Volume-preserving skinning papers (for example Rohmer et al. 2009) and position-based muscle models (for example VIPER, 2019) were not searched before the budget ran out.

## 5. Anatomically difficult places and their standard cures

### Takeaway
Studios concentrate their corrective effort in the same places the project reports as broken: Tekken 8 reserves its radial-basis rig for shoulders, trapezius, hips and upper femur; MetaHuman adds corrective joints at torso, shoulders, elbows, hands, fingers, thighs, calves and feet. The square raised shoulder is first a skeleton-motion problem (clavicle and scapula must move with the arm), not a skinning one.

### Cited Findings
- [X] The shoulder girdle has four joints (sternoclavicular, acromioclavicular, scapulothoracic, glenohumeral) that all move in any significant arm movement; the scapula contributes roughly 60 degrees of a 180-degree elevation. — [Shoulder biomechanics](https://wikimsk.org/wiki/Shoulder_Biomechanics)
- [X] Tekken 8 uses radial basis functions for shoulders, trapezius, hips and upper femur, and driven keys for wrists, fingers, head and ankles. — [CGWorld, CEDEC 2024](https://cgworld.jp/article/202409-cedec01-tekken.html)
- [X] MetaHuman's extra corrective joints sit on torso, shoulders, elbows, hands, fingers, thighs, calves and feet. — [Unreal forum](https://forums.unrealengine.com/t/what-skeleton-does-metahuman-use/741546/2)
- [X] In simulation rigs the scapula, rib cage and patella are the bones under which tissue must slide and not be attached. — [Houdini Vellum workflow](https://www.sidefx.com/docs/houdini/muscles/workflowvellum.html)
- [X] Implicit skinning names "elbow collapse", skin crushed at a joint by contact, as the fault it targets. — [paper copy](https://discmaster.textfiles.com/file/16678/SIGGRAPH%202013%20-%20Disc%203.iso/content/papers/125-0312.pdf)
- [X] Corrective bones are described by practitioners as doing the job of corrective blend shapes by moving bones in place of vertices, with a pose driver blending their positions between stored poses. — [Unreal forum](https://forums.unrealengine.com/t/how-to-use-corrective-bones-in-animations/1177677/3)
- [X] Forum users report that shoulders and thighs need a driver that handles all three axes and that a single-axis pose driver fails there. — [Unreal forum, RBF workflow](https://forums.unrealengine.com/t/rbf-what-is-the-workflow-for-adding-blendshapes-for-character-movement/2595203)

### Inferences
Standard cures by region, combining the findings above with [R] practice; none of the per-region recipes below was verified against a source in this session.

- Shoulder, arm raised: drive clavicle elevation and scapular upward rotation from humeral elevation (about one part scapula to two parts humerus); let the deltoid's shape follow by a helper joint or corrective at the acromion; weight the deltoid region to the scapula and clavicle as well as the humerus. The project already has the three joints; the fix is their coupling and the weights.
- Armpit: weights from a geodesic or visibility method so arm and trunk do not share influence across the gap; a pose corrective for the fold (front wall from the pectoral, back wall from the latissimus); contact handling for the lowered arm.
- Hip and buttock, high flexion: two thigh twist joints; a helper joint at the gluteal fold that travels a fraction of hip flexion; a corrective that keeps gluteal volume and moves the fold; smoothing (delta mush family) to stop crumpling.
- Loins and waist crease: distribute bend over all lumbar joints (the project has every vertebra); smooth weights along the spine; delta mush family smoothing.
- Elbow and knee: optimised centres or a helper joint at the olecranon and at the patella that moves at about half the flexion angle, pushing the bony point outward; a volume corrective for the forearm and calf pressing against upper arm and thigh.
- Forearm pronation: the radius-about-ulna joint supplies the correct twist distribution if skin near the wrist is weighted to the radius and skin near the elbow to the ulna and humerus, with a smooth gradient between.
- Neck: several cervical joints sharing the rotation; correctives or helper joints for the sternocleidomastoid and trapezius lines.
- Finger webs: weights spread over neighbouring metacarpals; a small corrective per web for spread and for fist.

### Gaps
- No rigging source giving measured coupling ratios or helper-joint placements for the scapula, patella or olecranon was retrieved; the search for one returned clinical anatomy pages.
- The detailed helper-joint layouts of God of War Ragnarök and Tekken 8 are in slides that were not opened.

## 6. What is feasible per frame in WebGPU and three.js

### Takeaway
three.js r187 gives linear blend skinning with four influences in the vertex stage, a ready `computeSkinning` function for compute passes, and morph targets stored as a float texture array that is looped over in full; anything beyond that (more influences, centres of rotation, direct delta mush, sparse or compressed correctives) is a custom TSL node or compute pass, which the library's structure allows. No measured WebGPU skinning numbers exist in the sources found; the costs below are estimates and must be measured in the project.

### Cited Findings

three.js r187, read from the project's installed copy (version 0.187.0)
- [S] Bone matrices go in a uniform buffer when `bones × 64 bytes` fits the device's `maxUniformBufferBindingSize`; otherwise three.js falls back to a square RGBA float bone texture read with `textureLoad` (four texels per matrix). — [three.js Skinning.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/accessors/Skinning.js); [WebGPUCapabilities.js](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgpu/utils/WebGPUCapabilities.js)
- [S] When a pass needs previous-frame positions (motion vectors), the skinning node keeps the previous bone matrices and skins a second time with them. — [three.js Skinning.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/accessors/Skinning.js)
- [S] `computeSkinning(skinnedMesh, toPosition)` copies position, skin index and skin weight into read-only storage buffers (with the `setPBO` flag, which the source documents as "only relevant for WebGL"), reads the bone matrices from a buffer, and returns the skinned position for use in a compute pass; it also updates normals and tangents. — [three.js Skinning.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/accessors/Skinning.js)
- [S] The official example `webgpu_skinning_points` uses it to write skinned world positions and per-vertex speed into storage arrays each frame. — [webgpu_skinning_points](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_skinning_points.html)
- [S] The example list at r187 includes `webgpu_skinning`, `webgpu_skinning_instancing`, `webgpu_skinning_instancing_individual`, `webgpu_skinning_points`, `webgpu_morphtargets`, `webgpu_morphtargets_face`, `webgpu_instancing_morph` and `webgpu_compute_geometry`. — [examples/files.json](https://github.com/mrdoob/three.js/blob/r187/examples/files.json)
- [S] `webgpu_skinning_instancing` draws 30 instances of one skinned mesh that share a single skeleton pose, enabled by setting `isInstancedMesh = true` on the mesh, which the example itself marks as a hack to be resolved. — [webgpu_skinning_instancing](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_skinning_instancing.html)
- [S] Morph targets are packed into one float RGBA `DataArrayTexture`, one layer per target, width at most 4,096 texels, with position alone or position plus normal (plus colour) per vertex; the vertex shader loops over every target and skips those whose influence is zero; influences are a uniform array, or a per-instance texture for instanced meshes. — [three.js Morph.js](https://github.com/mrdoob/three.js/blob/r187/src/nodes/accessors/Morph.js)
- [S] The WebGL 2 fallback backend implements `compute()` and contains transform-feedback code for it. — [WebGLBackend.js](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl-fallback/WebGLBackend.js)

Reports and measurements
- [X] A pull request benchmark on `webgpu_instancing_morph` reports about 4.1 to 4.4 ms of GPU time on an M1 Max before and after tighter morph packing. — [three.js PR 27984](https://github.com/mrdoob/three.js/pull/27984)
- [X] A 2024 forum thread traced long shader compilation with many morph targets to code generated by a JavaScript loop over targets and proposed a loop node. — [three.js forum](https://discourse.threejs.org/t/webgpurenderer-shader-compilation-time-is-long-with-models-with-a-lot-of-morphs/60446)
- [X] A three.js issue reports morph-target models rendering noticeably slower on the GPU and suggests moving skinning and morphing to compute. — [three.js issue 29980](https://github.com/mrdoob/three.js/issues/29980)
- [X] Forum reports for r183 describe WebGPURenderer using about twice the CPU of WebGLRenderer on scenes with many meshes. — [three.js forum](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)
- [X] Survey data shows Android devices reporting 8 or 16 for `maxStorageBuffersInVertexStage`; whether compatibility mode lowers it was not confirmed. — [web3dsurvey](https://web3dsurvey.com/webgpu/limits/maxStorageBuffersInVertexStage/platform/Android)
- [X] For scale, on native consoles Unreal's learned morph corrective costs under 50 microseconds of GPU time per character. — [80 Level](https://80.lv/articles/unreal-engine-5-1-s-updated-ml-deformer-explained)

Precedent for compute skinning
- [S] Godot's Vulkan renderer does all skinning and blend shapes in a compute shader. — [Godot skeleton.glsl](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/shaders/skeleton.glsl)
- [X] Unity's GPU deformation modes use compute shaders, one dispatch per mesh and active blend shape, or batched. — [Unity MeshDeformation](https://docs.unity3d.com/2023.1/Documentation/ScriptReference/MeshDeformation.GPUBatched.html)

### Inferences
All numbers here are estimates from the data sizes; none is measured.

- Skeleton size is no obstacle: 90 joints × 64 bytes = 5.8 kB; with twist and helper joints at, say, 250 joints it is 16 kB, inside a uniform buffer on WebGPU, and the bone texture path covers WebGL 2.
- Stock morph targets do not scale to this body. One target for 90,000 vertices is 1.44 MB with positions only and 2.88 MB with normals; 100 targets is 144 to 288 MB, and every vertex loops over all targets. Use them for at most a handful of shapes. Correctives should live in the project's own storage buffers or textures: sparse (vertex index and delta lists per shape), float16 or normalised 16-bit, and evaluated in a compute pass that touches only affected vertices.
- A compute pass per frame for the hero body is the natural structure: (1) correctives and muscle bulge added in rest space, (2) skinning (linear, or centres of rotation), (3) optional smoothing or sliding passes, (4) normal and tangent rebuild, writing position and normal buffers that all render passes (main, shadow, depth pre-pass, motion vectors) read without re-skinning. This also removes the double skinning for motion vectors, since last frame's output buffer is the previous position.
- Normals: methods that yield a per-vertex rotation (linear blend, centres of rotation, direct delta mush) can rotate the rest normal; once correctives or bulge are added the normal should be rebuilt from the deformed positions (accumulate face normals through a fixed-size adjacency list per vertex), one extra compute pass over about 100,000 vertices.
- Rough per-frame cost for one body of 100,000 to 200,000 vertices on an M1-class GPU: linear blend or centres of rotation, well under 0.2 ms; a sparse corrective pass of a few hundred thousand deltas, similar; normal rebuild, similar; delta mush at 10 iterations is 10 ping-pong passes of about 7 reads per vertex, of the order of 0.5 to 1 ms; direct delta mush with 8 influences needs 16 to 32 MB of data and a 3×3 polar decomposition per vertex, of the order of a few tenths of a millisecond. All of it is small beside shading a 4K frame, and it is spent once, not per render pass.
- Phones and the WebGL 2 path: keep the hero path's results as data, not as passes. Use four influences, centres of rotation at most, a small number of correctives sampled from a texture in the vertex shader, and no smoothing passes; MetaHuman's rule of running body correctives only at the top level of detail is the model.
- Crowd: one shared geometry and weight set, a bone-matrix buffer or texture holding all visible people indexed by instance, vertex-stage linear blend with four influences, no correctives beyond a threshold distance (at 4 m and beyond a 1.80 m body covers few enough pixels that weights and twist joints carry the result). The stock instancing example shares one pose, so individually posed crowds need the project's own instance-indexed bone buffer.
- Offline build fits the existing worker-and-cache design: weights, centres of rotation, direct-delta-mush matrices, corrective bases and muscle shapes are all computed once per body.

### Gaps
- No published benchmark of WebGPU compute skinning, of delta mush on a browser GPU, or of three.js skinning at 100,000 vertices or more was found. The first engineering task is a measurement harness.
- WebGPU limits in compatibility mode and on current phones for storage buffers in the vertex stage were not confirmed; a vertex shader that reads correctives from storage buffers may need a texture path there.
- `webgpu_skinning_instancing_individual` was seen by name only and not read; it may already show per-instance poses.

## 7. Evaluation

### Takeaway
Practice is to judge a deformation rig on two kinds of input, isolated single-joint sweeps to the limits and whole-body motion clips, and to pause wherever it breaks; quantitative checks compare against a ground-truth shape by mean and maximum vertex error. The same range-of-motion set serves three purposes: testing, fitting weights, and training correctives.

### Cited Findings
- [S] Roblox's Calisthenics Tool, a Blender add-on, plays a fixed set of cycles on a rig: Walk, Run, Move (generic movements) and Idle; the user pauses on a bad frame and repairs weights there. Roblox states that it "doesn't provide complete verification of all potential skinning issues" and that the tool is no longer in active development. — [Roblox creator-docs](https://github.com/Roblox/creator-docs/blob/main/content/en-us/art/modeling/calisthenics-tool.md)
- [X] Ready Player Me recommends judging skin weights on dance clips because they cover a wide range of motion, and requires normalised weights. — [Ready Player Me docs](https://docs.readyplayer.me/ready-player-me/customizing-guides/create-custom-assets/create-custom-outfits/skinning-and-testing)
- [X] One auto-rig guide separates static bends, which expose local weight errors, from motion clips, which expose errors along a chain and in timing, and lists checks at shoulder, hip, elbow, knee, wrist and ankle. — [Sorceress guide](https://sorceress.games/blog/rig-with-auto-rig-for-game-characters-weight-check)
- [X] Reallusion's calibration method plays poses and pauses where mesh penetration appears, then rotates single bones to inspect the weights. — [Character Creator manual](https://manual.reallusion.com/character-creator-4/Content/ENU/4.0/08_Creating_Custom_Assets/Calibrating_Skin_Weights.htm)
- [X] Unreal's ML Deformer is evaluated by playing a test animation beside a ground-truth cache of the same animation, frame count and frame rate; its training animation must cover a wide range of motion. — [ML Deformer framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/ml-deformer-framework-in-unreal-engine)
- [X] Houdini generates training poses by drawing each joint's angle from a range observed in representative animation, not from the full circle. — [Houdini ML Deformer](https://www.sidefx.com/docs/houdini/ml/mldeformer.html)
- [X] EA describes solving skin weights "from range of motion (ROM) poses". — [EA SEED, Dem Bones](https://www.ea.com/seed/news/open-source-dem-bones)
- [X] Wētā curates its training set to reduce differences between similar poses, because near-duplicate poses with different shapes hurt reconstruction. — [Wētā FX paper](https://www.wetafx.co.nz/assets/Uploads/PDFs/siggraph2023_bodyopt.pdf)
- [X] Pixar's FaceBaker evaluates a learned deformer by per-point mean squared error and by the largest single-vertex error. — [FaceBaker](https://graphics.pixar.com/library/FaceBaker/paper.pdf)
- [X] A university rigging exercise states the pass criteria plainly: with shoulder and head moved through their range, the chest must not bulge and the head must stay solid. — [UW CSE490j assignment](https://courses.cs.washington.edu/courses/cse490j/21su/assignments/assignment_4/Character%20assignment%204%20-%20gray%20model%20pose%20test.pdf)

### Inferences
- A range-of-motion set for this body can be generated by code from joint limits (published anatomical ranges are allowed by the project rule): each joint swept alone to both limits on each axis; then the known hard combinations (arm overhead, arm across the chest, arm behind the back, deep squat, hip flexed with knee straight, full elbow and knee flexion, forearm pronation and supination at several elbow angles, trunk flexion, extension, side bend and twist, neck through its range, fist and spread hand); then cycles (walk, run, reach, sit, crouch).
- Because the body is built by code, the accepted visual signs can be turned into numbers per pose and tracked across changes:
  - volume of each segment against rest (elbow, knee, shoulder should not lose volume);
  - depth and area of self-penetration (armpit, groin, knee pit, elbow crease), from triangles of one region inside another;
  - stretch and compression of triangle area and edge length against rest, with the maximum reported (candy wrapper and crumpling both show as extremes);
  - change of angle between adjacent face normals (creases where there should be none);
  - drift of skin points at bony landmarks (acromion, olecranon, patella, tibial crest, clavicle) from their bone;
  - frame-to-frame smoothness under a slow sweep (no popping from drivers or from muscle assignment).
- Signs of quality that practitioners look for, [R]: silhouette stays smooth and anatomical at the extremes; the elbow and knee keep a bony point; the shoulder rises and the trapezius shortens when the arm goes up; the armpit folds as two walls and does not pass through; the buttock keeps its mass and its fold moves; twisting spreads along the forearm and thigh; specular highlights slide smoothly over the skin in motion without shimmer; nothing pops between neighbouring poses.
- Without scans there is no external ground truth. The reference can be internal: the offline relaxed solution of question 4 is the target, and the real-time path is scored against it by mean and maximum vertex error.

### Gaps
- No studio-published standard "calisthenics" pose list for humans was found beyond Roblox's four cycles; the list above is my assembly.
- No published numeric acceptance thresholds (for example a tolerated volume loss) were found.
