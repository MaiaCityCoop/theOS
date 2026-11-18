// The intent's requirements (Intents/0038-one-clean-architecture.md): the hard gates, and how they are shared out by the
// frame's classes (src/core/classes.js). Not settings and not physics: what the game must meet, each with its unit and
// its source, the one place they live (every reader imports them from here: the game, tools/bench.js, tools/gate.js,
// the gate's ceilings).

/** The hard gate on time: a frame's GPU time at every view, so 60 fps holds with room for the CPU and the browser's own
    work (16.7 ms a frame in all). unit: ms. source: Intents/0038, Define (the hard gates) */
export const FRAME_MS = 12;
/** The hard gate on memory: the whole browser, every process of it (the page, the GPU's, the browser's own; tools/gate.js
    paths measures it so). unit: bytes. source: Intents/0038, Define (the hard gates) */
export const MEMORY = 8e9;
/** The screen the budget is drawn for: 1920 × 1080, the canvas at its own pixels (the gate draws it at a pixel ratio
    of 1: tools/gate.js). A 4K output until 2026-11-18, 22:15. unit: pixels. source: Samuel's output gate, 2026-11-18
    22:15 (#124); Intents/0038, Define (the hard gates) */
export const OUTPUT = { width: 1920, height: 1080 };
/** FRAME_MS shared out by class: what a class's passes may take of a frame, the gate's ceilings start from it
    (tools/gate/ceilings.js). The upscale's is its floor: its bytes alone at a 4K output took about 1.9 ms (#86), a quarter of that at OUTPUT. 'other',
    a pass no class names, is the slack. unit: ms. source: Intents/0038, Build (the bench pass by pass; the budget's
    parts as a merge rule) */
export const FRAME_MS_BY_CLASS = { geometry: 5, light: 3, ground: 1.5, 'upscale/post': 2, other: 0.5 };
/** The GPU's pools a class may hold, by what each must hold and room to grow, the whole what MEMORY leaves the page's own
    and the browser's processes (about 3.7 GB):
      geometry: the plants' and the rocks' meshes, their far ends' atlases (417 MB of views and 131 of clumps at stage
        5), what the tiers pack and what the culling keeps of it, the growth map the placing reads, the picture drawn
        inside (its colour, motion and depth);
      ground: the land's pages (about 250 MB), the world's materials they are laid from, the relief near the eye, the
        ground's maps round the camera;
      light: the shadows' cascades (16 MB a cascade of 2048², depth only), the canopy map and its probes, the air's
        froxels and tables, the clouds' map;
      upscale/post: the picture kept over time at the screen's own pixels (two of it), the lens's targets;
      other: whatever no pool notes: three's own buffers, what the device makes beside them (src/core/gpu.js counts it)
    What a pool is sized by, where it may be larger or smaller, is the room its class has left (src/core/gpu.js roomOf).
    unit: MiB. source: Intents/0038, Build (GPU memory by class) */
export const BUDGET_MB = { geometry: 2048, ground: 1024, light: 256, 'upscale/post': 256, other: 512 };
