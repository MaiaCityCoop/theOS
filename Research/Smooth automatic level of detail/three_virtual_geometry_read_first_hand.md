# three-virtual-geometry: an open cluster-detail library on the game's exact stack (read first-hand, 2026-11-16)

Source: the npm package `three-virtual-geometry` 0.1.3 itself, downloaded in this session from the npm registry and
**read** (its README, its type files with their comments, its plain-text summary `docs/public/llms.txt`). **Not run**:
it is five weeks old, from one author unknown to me, and the session's guard declined running it with its network
cut off. Its performance figures are the author's own; nothing here confirms them.

## Takeaway

The method Samuel asks for already exists as open code **for three.js's WebGPU renderer with TSL compute passes**,
built on the same open tool the probes used (meshoptimizer). It is very young and measured by its author only in
Chrome on a MacBook Pro. Its design answers, in code, most of the questions this research raises: how far instances
are drawn cheaply, what to do above one pixel of error, how leaves are kept, and how an honest error is kept when
parts vanish. It is a reference to read and to measure in Safari, more than a part to drop into TheGame as it is.

## Cited findings

Registry facts (read with `npm view` in this session):

- `three-virtual-geometry` 0.1.3, MIT, first published 2026-10-08, last changed 2026-10-10; depends on
  `meshoptimizer ^1.3.0`; needs `three >= 0.180.0`. Repository: github.com/elad12390/three-virtual-geometry.
- `meshoptimizer`: 1.0.0 on 2025-12-08, 1.1.0 on 2026-04-02, 1.2.0 on 2026-06-30, 1.3.0 on 2026-09-25.

From its README:

- "Each mesh is split into clusters of up to 128 triangles, which are grouped, simplified with locked borders, and
  split again, level by level, into a hierarchy where every cluster knows its own error and its parent's. Every frame,
  compute shaders pick, per instance and per cluster, the version whose error projects to under a pixel. Because errors
  grow monotonically up the hierarchy, the selection never has cracks."
- The author's measurements: "uncapped, no vsync, shadows on; MacBook Pro with an M4 Pro, Chrome 154", 1 px error
  threshold. Ruins scene: 5.7 billion full-detail triangles, 113,000 instances, 6.5 to 9.0 million drawn a frame, 160
  to 230 frames a second at 1080p, 103 to 158 at 4K. A 6 km world: 37.5 billion triangles in 3.0 million instances, 8.3
  to 9.1 million drawn, 147 to 150 at 1080p. "at most 0.6 ms of CPU time per frame".
- Its limits, in its own words: "Static meshes (no skinning or morph targets); instances can move"; "One UV channel.
  Hardware rasterization only (no software rasterizer for pixel-sized triangles)"; occlusion culling "needs a
  perspective camera with standard depth".
- Browsers it names: "Chrome or Edge 113+, Safari 26+, Firefox 141+ on Windows". It publishes no Safari or iPhone
  measurement.
- "Geometry made in code works too": `buildVirtualMeshCached(fromBufferGeometry(geometry))`; "builds are cached in the
  browser" (IndexedDB, per `llms.txt`).
- A live demo is linked: `https://elad12390.github.io/three-virtual-geometry/live` (not opened here).

From its type files (`dist/core/**/*.d.ts`), whose comments describe the design:

| Question | What it does | Where |
| --- | --- | --- |
| How is a cluster drawn? | "The renderer always issues `MAX_MESHLET_TRIANGLES * 3` vertices per drawn meshlet": 128 triangles, 128 vertices at most, 384 corners a cluster whatever it holds. "One draw call per mesh"; many meshes share pooled buffers | `constants.d.ts`, README |
| How are far instances kept cheap? | A fast path: "Instances whose LOD range is at most this many meshlets [4], and where every meshlet is guaranteed to be selected, emit their meshlets directly from the instance pass (no meshlet pass for them)". Per level it keeps the smallest and largest errors so a whole level can be accepted or refused from the instance's distance alone | `constants.d.ts`, `cut.d.ts` (`instanceGuaranteedRange`, `levelGuardErrors`) |
| Under one cluster? | `tailSimplify`: "Keep simplifying below a single meshlet once the remaining roots form the whole mesh, so distant instances can draw a handful of triangles (or nothing, with `prune`) instead of a full meshlet" | `buildVirtualMesh.d.ts` |
| Above one pixel of error? | `lodBlend`: "widest blend band between LOD levels, used automatically above ~1.25 px of error". Each cluster "draws the pixels whose step s is in [lo, hi)" of 255 steps; "The meshlets with lo <= s < hi form a complete cut for every step s"; the per-pixel value is "interleaved gradient noise (Jimenez 2014) … a half-blended surface looks like a fine, even stipple, and suited to temporal anti-aliasing when it moves every frame" (`lodBlendTemporal`, "only with TAA") | `lodBlend.d.ts`, `cut.d.ts`, `llms.txt` |
| Leaves, grass? | `aggregateLods`: "Keep simplifying groups of separate small pieces (leaf cards, grass blades) when edge collapses stall: each piece is simplified on its own, then neighbouring pieces are thinned in pairs, the kept piece widened to cover both". Then `voxelLods`: "Triangle simplification breaks down on aggregate geometry such as a tree crown made of hundreds of separate leaf clumps: below a few hundred triangles it can only delete or collapse whole clumps, so the silhouette shrinks and the LOD error jumps. A voxel proxy keeps the volume instead: the mesh is voxelized, gaps between clumps are closed, and a smooth closed surface is extracted (surface nets)" | `aggregate.d.ts`, `voxelProxy.d.ts`, `buildVirtualMesh.d.ts` |
| An honest error when parts vanish? | `extentShrink`: "How far the simplified mesh's bounding box retreats from the original's … Used as a floor for the LOD error so a version that lost its silhouette is only drawn once that loss is below the pixel threshold" | `buildVirtualMesh.d.ts` |
| Grouping without the graph partitioner? | "a greedy region-growing pass over the meshlet adjacency graph, seeded in Morton order … Meshlets without enough neighbours (e.g. disconnected leaves or grass blades) are then merged with spatially close leftovers" | `partition.d.ts` |
| A budget? | `errorThreshold` (pixels, default 1), `triangleBudget` ("adapt the threshold to this many triangles"), `minPixelRadius` (0.7: "skip instances smaller than this"), `shadowErrorScale` (3), per mesh `maxDrawDistance` ("instances fade by shrinking") | `VirtualGeometry.d.ts`, `llms.txt` |
| Big meshes? | Only single meshes "of roughly 5 million triangles or more" need more than the 128 MB buffer size every WebGPU device gives by default | `limits.d.ts` |

## Inferences (mine)

- Its way to draw a cluster (a fixed 384 corners, vertices read from shared buffers) is the way TheGame's drawer already
  draws a "class of size" (`src/scatter/drawer.js`), and its fast path for far instances matches what TheGame's packing
  pass does per thing. The two designs meet.
- Its blend above 1.25 px is a **stipple between two cuts**, with both drawn in the band. TheGame's rule is the
  opposite ("nothing is dithered … no two levels drawn at once", `src/detail/README.md`): it moves vertices. Both are
  answers to the same problem; no source found says which is cheaper on a phone.
- It cannot be dropped in as it is: TheGame's solids carry bones, wind, snow, their own 16-byte vertex, their own
  shading models and a look per kind, and are placed by compute passes of its own. What transfers is the build
  (clusters, groups, errors, the tail, the error floor) and the selection.
- The fastest way to the one number nobody has (a cluster hierarchy in Safari, on an iPhone) is to open its live demo
  on Samuel's own devices.

## Gaps

- Not run here: no build time on TheGame's meshes from this library, no picture, no check of its claims.
- No measurement in Safari or on any phone, by anyone found.
- Its source was read only through its type files and README; the shader code was not read.
- Three stars and one author: it may change or stop.
