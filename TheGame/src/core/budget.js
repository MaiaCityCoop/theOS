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
/** The output: the most pixels the game's canvas has, for a player and for the gate alike (src/core/output.js): 1920 ×
    1080, or as many in a window of another shape (its shape kept; the browser lays the canvas on the screen). unit:
    pixels. source: Samuel, 2026-11-18 22:15, intent 0038's gate lowered from 4K ("we are happy to go down our 4K gate to
    just normal 1920, if that helps overall") */
export const OUTPUT = { width: 1920, height: 1080 };
/** The machine the 8 GB gate is for: Samuel's MacBook, its screen at its default scale (Retina, two pixels a point), as
    its browser gives the game a window of it. unit: CSS pixels, and device pixels a CSS pixel. source: Samuel's MacBook
    (8 GB, 2026-11-19: WebKit's GPU process died there 38 s past the start, the device lost) */
export const MACHINE = { width: 1512, height: 945, dpr: 2 };
/** The 12 ms a frame shared out by the frame's classes: what a class's passes may take, the gate's ceilings start from
    it (tools/gate/ceilings.js). The upscale's is its floor: its bytes alone at a 4K output took about 1.9 ms (#86).
    'other', a pass no class names, is the slack. unit: ms. source: Intents/0038, Build (the bench pass by pass; the
    budget's parts as a merge rule) */
export const FRAME_MS_BY_CLASS = { geometry: 5, light: 3, ground: 1.5, 'upscale/post': 2, other: 0.5 };
/** The hard gate on the GPU's memory: all the game holds there at once, its classes' pools and what the device makes
    beside them (src/core/gpu.js counts both). A machine of 8 GB shares its memory between the system, the browser and the
    GPU: in WebKit at Retina scale and on Samuel's MacBook the game reached 5.8 GB of it within 7 s of ready and the
    device was lost (main d7f7f6d, 2026-11-19). The game keeps to a quarter of the machine. unit: MiB. source:
    Intents/0038, Define (the hard gates: a machine of 8 GB); the master's measurement, 2026-11-19 */
export const GPU_MB = 2048;
/** GPU_MB shared out by the frame's classes (src/core/classes.js), what each class's pools may hold together:
      geometry: the plants' and the rocks' meshes, their far ends' atlases (a quarter of it: src/core/classes.js
        SHARE_MB), what the tiers pack and what the culling keeps of it, the growth map the placing reads, the picture
        drawn inside (its colour, motion and depth);
      ground: the land's pages, the world's materials they are laid from, the relief near the eye, the ground's maps
        round the camera;
      light: the shadows' cascades (41 MB at the output: src/world/shadow.js), the canopy map and its probes, the contact
        shadows, the clouds' map;
      upscale/post: the picture kept over time at the canvas's pixels (two of it), the lens's targets;
      other: whatever no pool notes: three's own buffers, what the device makes beside them (src/core/gpu.js counts it)
    What a pool is sized by, where it may be larger or smaller, is the room its class has left (src/core/gpu.js roomOf);
    a make past it is said and counted (src/core/gpu.js ledger: over), and the hour's gate fails on it. unit: MiB.
    source: Intents/0038, Build (GPU memory by class); the master, 2026-11-19 (the whole at most 2 GB, shared so) */
export const BUDGET_MB = { geometry: 1024, ground: 512, light: 192, 'upscale/post': 128, other: 192 };
/** A look-up of the single things' table (src/world/things.js) for a thing nobody changed, as most are: the places it
    reads on average, at most (a uvec4 each), for every packed thing at every packing while any thing is changed: what
    the table's fill follows from. unit: places. source: Intents/0038, Build (the solids' builder and cut) */
export const PROBES = 4;
