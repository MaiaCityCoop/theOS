// The intent's requirements (Intents/0038-one-clean-architecture.md): the hard gates, and how they are shared out by the
// frame's classes (src/core/classes.js). Not settings and not physics: what the game must meet, each with its unit and
// its source, the one place they live (every reader imports them from here: the game, tools/bench.js, tools/gate.js,
// the gate's ceilings).

/** The hard gate on time: a frame's GPU time at every view, so 60 fps holds with room for the CPU and the browser's own
    work (16.7 ms a frame in all). unit: ms. source: Intents/0038, Define (the hard gates) */
export const FRAME_MS = 12;
/** The frame rate the game holds at all times: 1000 / FPS ms a frame in all, FRAME_MS of it the GPU's (tools/gate.js:
    no frame longer in motion). unit: frames a second. source: Intents/0038, Define, gate 5 (60 fps at all times) */
export const FPS = 60;
/** The most GPU time one submission may take, its own (the queue runs in order: from when it was submitted or the one
    before it was done, whichever was later, to its own done): the GPU does nothing else of the page meanwhile, and the
    system's and the browser's work waits behind it (2026-11-19, WebKit at Retina scale: single submissions of up to
    4.2 s, the device lost 38 s in). tools/gate/device.js watch keeps every one over it with what it held, in the
    device's run and the walks. unit: ms. source: the master, 2026-11-19 ("no GPU submission over 50 ms") */
export const SUBMIT_MS = 50;
/** A submission's own GPU time within the reach of the system's GPU watchdog, which ends the page's device for one so
    long: one surely this long (however late its done was heard) fails the hour whatever came before it, a lost device
    waiting to happen (tools/gate/device.js submitRule). unit: ms. source: the master, 2026-11-19 (deployed next at 62 %
    free: the ledger flat at 1.10 GB while single submissions of the ground's piece pass took 4-7.4 s, and the device was
    lost; iOS's watchdog is stricter: "any single submission over the watchdog's reach, 1 s or more, surely") */
export const WATCHDOG_MS = 1000;
/** The longest one piece of the page's own work may hold its thread: a frame, from its begin to the next one's, with
    what runs between the two (a worker's message, what an await resumes, a timer). Longer, the picture stops, and what
    the GPU has done is heard late (2026-11-19, WebKit, the master's check of 969339e: submissions done 315-403 ms late
    with no pass in them, every 0.4 s, 15-25 s past ready: the page's thread stalled, not the GPU). src/core/frames.js
    counts the frames longer, and the gate says the slowest with their parts (tools/gate/device.js). unit: ms. source: the
    master, 2026-11-19 (smooth walks: every frame over 50 ms, with its parts); the web's own long task (W3C Long Tasks
    API: a task of over 50 ms) */
export const TASK_MS = 50;
/** How long the world may take to come complete, or to settle again, before what waits for it calls it broken:
    src/core/settle.js settle's own timeout, and the start's view's in the tools (tools/census.js --settle, the smoke's).
    unit: ms. source: settle()'s timeout since stage 2a (Intents/0038, Build: "settle() did not resolve in 300 s") */
export const SETTLE_MS = 300000;
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
/** The cores of the machine the gate is for (MACHINE), as its browser tells a page (navigator.hardwareConcurrency; WebKit
    says no more than 8 on a Mac, 2 on an iPhone): what the start's worker pools are sized from, no device's from more
    (src/core/workers.js poolSize). unit: cores. source: Samuel's MacBook (Apple M1, 8 cores: sysctl hw.ncpu, 2026-11-19) */
export const MACHINE_CORES = 8;
/** The cores a start keeps busy beside its workers: the page's own thread and the GPU process's. The rest its worker
    pools share (src/core/workers.js poolSize: on the Mac 3 a pool, the recipes' and the impostors'). unit: cores. source:
    the impostors' pool as it was (cores less 2, src/detail/impostor.js); the master, 2026-11-19 ("the Mac stays at its 3
    and 3; a 0.375 device gets 1 each") */
export const BUSY_CORES = 2;
/** The least a make or an upload takes to be written in the journal as it begins (src/core/journal.js): what is
    smaller is too many to write down one by one. unit: MB (MiB). source: the master, 2026-11-19 ("a make or upload of
    4 MB or more") */
export const JOURNAL_MB = 4;
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
/** The device the budget's numbers are for (GPU_MB and BUDGET_MB): the 8 GB Mac's largest buffer, as WebKit's adapter
    gives it there (its maxBufferSize: WebKit's Source/WebGPU/WebGPU/HardwareCapabilities.mm makes it, on a Mac, the more
    of min(L, 1 GiB) and min(INT_MAX, L / 3) of Metal's maxBufferLength L, 4 GiB on the M2: 1.33 GiB, to a multiple of
    4). Every other device's budget is the Mac's scaled by how its own largest buffer stands to this, never more than
    the Mac's (src/core/gpu.js shareOf): the one sign of a device's class both engines give a page (an iPhone's at most
    1 GiB in WebKit, by the same file). unit: bytes. source: the master, 2026-11-19 (WebKit on the M2: 1.33 GiB; Samuel's
    iPhone on next killed 1-2 s past ready, asked for the Mac's 2 GB) */
export const MAC_BUFFER = 1431655764;
/** WebKit's clamp on an iPhone's largest buffer, the floor of a Mac's (Source/WebGPU/WebGPU/HardwareCapabilities.mm: on
    iOS the less of 1 GiB and maxBufferLength / 3, on a Mac never less than the less of 1 GiB and maxBufferLength): an
    adapter at or under it is a phone's (src/core/gpu.js shareOf; Chrome's lowest tiers, a phone's or a small machine's,
    alike). It says no more of the phone above it: every iPhone of 3 GiB of buffer reads 1 GiB. unit: bytes. source:
    WebKit's HardwareCapabilities.mm (main, 2026-11-19) */
export const PHONE_BUFFER = 1073741824;
/** The most of the Mac's budget a phone (PHONE_BUFFER) is held to: under where an iPhone was killed, the page's own and
    what no pool notes beside it. An iPhone on next was closed by iOS 1.1 s past ready holding 1.07 GB on the GPU, on
    an adapter of 1.00 GiB, which the Mac's ratio alone gave 1536 MB; this gives it 768 MB, 0.3 GB under where it died.
    unit: a share of GPU_MB. source: Samuel's iPhone, 2026-11-19 08:51, next 6ff5627 (the start's last note: "Last start
    closed 1.1 s after it was ready, holding 1.07 GB (geometry 0.61), on an apple GPU of 1.00 GiB, 20 frames drawn") */
export const PHONE_SHARE = 0.375;
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
/** Of geometry's memory (BUDGET_MB), the share its plants' far ends' atlases are sized by, the two of them together
    (src/core/classes.js SHARE_MB; src/detail/atlas.js atlasesOf: their views and their clumps from it alone, the same
    on every device). unit: a share of BUDGET_MB.geometry. source: Intents/0038, Build (GPU memory by class: the memory
    ceiling, #165, held the atlases to a quarter of geometry's; at 9 bytes a texel, #183, 42 views of 20 texels) */
export const ATLASES_SHARE = 1 / 4;
/** A look-up of the single things' table (src/world/things.js) for a thing nobody changed, as most are: the places it
    reads on average, at most (a uvec4 each), for every packed thing at every packing while any thing is changed: what
    the table's fill follows from. unit: places. source: Intents/0038, Build (the solids' builder and cut) */
export const PROBES = 4;
/** How long the start waits for what may be stopped on its way (a worker's file an ad or content blocker held back, or
    served something else in its place) before the veil says so, with what may help and a way to reload
    (src/core/waits.js): a worker starts in a moment, and the stage waits as long for its first subject (src/boot.js).
    unit: ms. source: the master, 2026-11-19 (Samuel's Safari with an ad blocker, the veil at "Raising the land" for
    good: "or hasn't answered in a reasonable time puts a line on the veil") */
export const STUCK_MS = 20000;
/** How many frames what comes in after the first frame shown fades in over, and the ground's maps hand over in: no frame
    changes it by more than a 36th, however slow the frames (0.6 s at 60 fps). What the first view does not wait for
    (src/core/compile.js ask's near: the far cascades' casters, the canopy's probes) fades in as it comes, never on in
    one frame (src/core/settle.js arriving). unit: frames. source: the ground's maps (src/scatter/ground.js), and the
    master, 2026-11-19 ("each fades in as it arrives, over the same FADE frames the ground maps use") */
export const FADE_FRAMES = 36;
