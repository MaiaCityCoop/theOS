# 0038: fixed pools with priority streaming, for every plant and rock (a design, no code)

From the worker session "0038 9a shadow fix · avenMAIA MacBook Sam", 2026-11-19. Written against main 269288f2 (#380), after #373, #375 and #378.

**Decided 2026-11-19 (Samuel, through the master): go.**
- **Stage 1** (the plan step and the pools) is this session's.
- **Stage 2** (heap shapes into pages) is the draw path's.
- **Stage 4** (resident tiers into region pages) is this session's, after stage 2.
- The interface between stage 1 and stage 2 is at the end of this note.

## In one paragraph
Each memory class (geometry, ground) gets one GPU pool at boot, sized from the device's budget and never made again. Everything a plant or rock needs lives in fixed-size pages inside it:
- **instance pages**: which things stand where, at which level;
- **shape pages**: a kind's mesh at a level.

A page is in the pool because of its priority: the error it removes on the screen per byte, at the rest dial. When the pool is full, the least important page goes. Every hierarchy keeps its coarse root in for good, so a thing whose fine pages are out draws coarser and never vanishes.

The land's pages already work this way (src/terrain/pages.js: a fixed atlas, pages asked by the pixels, parents first, a coarser page shown until the finer one is in). This design does the same for the scatter.

The win:
- Memory is flat from frame 1.
- Nothing grows, shrinks, re-lays or swaps.
- The dial stops being a store-sizing knob. It becomes the pool's priority threshold.

## Why: what the read-back sizing costs today
The tiers size their stores from counts read back two or three frames late (tier.js roomsFor, ownOf, relayout). On 2026-11-19 alone, that machinery needed all of these:
- a re-lay rule with MARGIN and BAND hysteresis, and "whole" reads (#301, #308);
- the swap that holds the picture while a store refills (#312), plus the hold logic (holdOf, swapIn);
- byDial and the rest dial, so that late stores aren't cut to nothing (#361, #373);
- one-at-a-time re-lays, so that old + new buffers don't spike memory (#373: geometry was at 482 of 384 MB; all at once would have been about 800);
- headroom so a walk doesn't chase the dial (#378);
- bound-sized moving tiers (#375).

After all of it, a walk into a forest at an iPhone's share still re-lays 4.9 stores a second (storecheck, #378), each a new buffer and a refill. The memory the GPU holds goes up and down with what was found.

Every one of these is a patch on one root: **a store's size follows what it finds**. Fixed pools remove that root. The size is fixed, and only the contents move.

## (1) One fixed pool per class, sized once at boot
- **Size.** At boot, once the adapter is known (gpu.js askedLimits → share), each class's pool is its budget (budgetOf(cls)) less what it holds outside pages:
  - the pictures (the screen's targets), the shadow cascades, the growth map, the culling's fixed lists;
  - the census measures all of these at the start, so the pool is the class's budget minus that.
- **Buffers.** Each class has two pools, because WebGPU forbids a writable binding to alias any other binding in the same pass:
  - **a shape pool**, written only by uploads (writeBuffer) and read-only in every pass;
  - **an instance pool**, written by the packing passes (compute) and read by the draws and the culling.
- **Their split.** Each pool is sized by the plan step (below), from the needs registered for it at the dial it solves. Each pool is one storage buffer of at most maxStorageBufferBindingSize: 512 MB on an iPhone, 1 GB or more on a Mac.
- **Ground** (the meadow's rings) is the same, in its own class.
- **Textures** (impostor atlases, the world's layers) stay texture-array pools of fixed layers. They already are.
- **Pages.**
  - A pool is cut into fixed pages: 64 KB each (4096 vec4 rows) is a good first size.
  - A free list and a page table (page → owner, priority, last wanted) live on the CPU, with a GPU copy of what the passes read.
- **Never made again.** No retire, no old + new, no transient. The ledger (?hud's "made") holds the pool's bytes from frame 1, and the line stays flat.

## (2) Fixed-size pages, streamed by priority, evicted least-important-first
**What a page holds:**
- **Instance page.** The things of one region of cells (regions.js Resident: today's unit of what a resident tier wants) at one level, as the packing writes them (`slots` vec4 rows each).
  - A region dense enough to overflow one page takes a chain of pages.
  - Own-patch tiers (a list's runs, the herds, the stress movers) page by patch.
- **Shape page.** A kind's mesh at a level (corners and vertices), as heap.js holds it today. A large mesh takes several pages. The cut's clusters (cut.js, rooms.json) are the natural unit.

**Priority: the error a page removes on the screen, per byte, at the rest dial.**
- For a region page at level l, at distance d from the eye: the pixels of error its things lose when they are drawn at level l rather than the level coarser (e(l+1) − e(l), in metres, error.js), times pxK / d, summed over its things, over its bytes.
- A shape page carries the same quantity for the kind's nearest wanted instance.
- One number for both, so a tree's mesh and a meadow's instances compete fairly for the same bytes.

**Asking and filling:**
- Each frame, the CPU walks the wanted set:
  - **regions:** the bands at the rest dial, as residentOf's update does now;
  - **kinds:** as the drawer's feed does now.
- It asks for missing pages highest-priority first, within the frame's share. The pacing is pace.js's, as the tiers and the land's pages pace today.
- Instance pages are filled by the packing passes that exist (visit, seal, lay), writing into the page's slots instead of a tier's store.
- Shape pages are filled by the workers, as the heap's meshes are now.

**Sizing an instance page chain without a read-back.** Two options; the first is the one to try:
- **(a) A GPU free list.** The visit pass takes its next page with one atomic on a free-list head (the tiers already use atomics for their counts). If none is free, it stops, and the region draws coarser that frame.
- **(b) Upper bounds.** Chains are allocated from an upper bound per region and level, taken from the placement's density (rule.js, the growth map), as #375 sizes the movers from their bound.

**Evicting.**
- When the free list is empty, the lowest-priority resident page goes. It goes only if the page asked for beats it by a BAND, so two pages never trade places frame to frame.
- Its owner falls back to its next coarser resident page. The heap's mask already does this for shapes ("its next coarser level is drawn in its place").
- **An evicted page cools before reuse.** Its table entry is cleared at once. The page is reused only after the next two frames and the GPU's work done, as src/core/gpu.js retire lets a buffer go. A draw still in flight never reads a page rewritten under it.

**The dial.**
- The pool's priority threshold, the least priority still resident, is the dial at rest, read off the pool instead of raised by byDial.
- On a device with room, everything wanted fits and the threshold is the asked dial (1, or ?truth's). On a phone, the threshold is where the pool fills.
- It moves with the scene only as far as priorities change, without rebuilding a store.
- The live LOD selection keeps reading the measure (measure.js) as now. The threshold only says which finer pages may be in.

## (3) A coarse root of every hierarchy, always in
- **Shapes.** Every kind's coarse levels and the dot are pinned. heap.js already does this ("its coarse levels: small, always there"); they become pinned pages.
- **Instances.**
  - The root of a region is its coarsest representation within the far reach: the dot or impostor level, and for the trees the clumps ("plants, trees, 9.9 m: clumps", one proxy a block).
  - The root pages of every region within the reach at the coarsest allowed dial are pinned. Everything finer streams.
  - A region that loses its finer pages draws its root, coarser but present.
  - When a finer page comes in, it fades in over FADE (error.js), as the land's pages and the heap's `came` do now. So pages neither pop in nor out.
- **The roots' budget comes first.** Pinned pages are counted before anything streams. If the roots alone don't fit the pool, the root reach shrinks. That is the one place a reach still follows memory, and the census can say at boot where it lies for a device.

## (4) What it replaces and what stays
**Replaced.**
- **tier.js:**
  - storeOf, roomFor, roomsFor and MARGIN-sized rooms;
  - holdOwn;
  - ownOf's read-back re-layouts;
  - familyOf's re-laid family store (a family becomes chains in the same pool);
  - residentOf's stores (kindOf's two stores, leaves and packed);
  - relayout, drawnOf, relayKind, needOf, sayKind;
  - the swap (swapIn, holdOf);
  - the class turn (TURNS, inTurn, rise, relayIn, atRest);
  - the reads that size stores (zRead's found and packed, kept only as counts for the HUD and the governor).
- **heap.js:**
  - the slotted levels (slots, room, touch, put/out with "longest unwanted") become shape pages with priority;
  - layOut and lay(slots) (a heap "sized from what is left") go;
  - the table stays as the shapes' page table.
- **drawer.js:**
  - feed()'s room checks (H.room), and tierAll's caps and bounds;
  - the tiers' short and over become the pool's unmet priority (drawn coarser, said to the governor).
- **occlusion.js:** arenas sized from tier rooms become per-page box lists (a page carries its things' boxes).
- **gpu.js byDial:** its raises for stores that follow the dial (again = true). It becomes the pool's threshold (above). byDial for things made once (the growth map, the land's pages) can stay until those join a pool.

**Stays.**
- **The measure:** error.js and measure.js (pxK, ERROR_PX, the dial), the levels and their bands, and LOD selection (select, levelOf, the hand-overs).
- **What is wanted:** regions.js Resident (the region set round the eye) and the drawer's kind queue.
- **The draws:** the packing compute (visit, seal, lay, gather); they write pages, not stores. The draws stay indirect, a level a draw, through the heap table.
- **The rest:** the workers that make meshes, cut.js (level 0's clusters), the land's pages (already this design), the ledger and its classes and budgets, pace.js, and settle.js (the world is settled once nothing is asked).

## (5) A staged migration, each stage shippable
1. **The pool.** gpu.js, or a new src/core/pool.js:
   - a class's pool, its pages, the free list, the page table and its GPU copy;
   - the ledger notes it whole at boot.
   - Nothing draws from it yet; storecheck drives it (ask, fill, evict, pin).
   - Ships alone; memory grows by the pool's size, so the other stages must take the same bytes out of the tiers.
2. **Shapes into pages** (heap.js and drawer feed):
   - the fine (slotted) levels become shape pages in geometry's pool;
   - "longest unwanted" becomes priority, and the coarse levels are pinned;
   - the instance side stays as it is.
   - Ships: the heap's memory is fixed; the tiers are unchanged.
3. **Own-patch tiers into instance pages** (alone, families and movers):
   - their packing writes page chains;
   - no read-back sizing and no re-layout;
   - full means coarser that frame (the movers already behave so since #375).
4. **Resident tiers into region pages:**
   - a region's pages are filled before the page table points at them, so the picture moves page by page, never refilled whole;
   - the swap and holdOf go; the drawn store becomes the per-level list of resident pages.
   - The largest stage: tier.js's resident half.
5. **The dial as the pool's threshold:**
   - byDial's raises for stores go, and so do the turn, relayIn, storeOf and roomsFor;
   - the culling arenas are laid out by page.
6. **Ground's pool:** the meadow's rings (grass.js, 'ground'). Then the rocks' meshes (rocks.js), now made once by byDial, become shape pages.

Each stage is a few PRs. Each keeps the dial-1 picture (the gate's) unchanged, so its WGSL and census changes are listed and expected.

## (6) The proof per stage
- **storecheck, walking.**
  - The knob's walk (#378) at an iPhone's share and at the Mac's, plus the own, family, moving and resident sequences, each on the pool.
  - Memory: the class's bytes equal the pool's from the first frame and never change (no make after boot).
  - No frame drawn short: in a CPU model of the page table, every wanted thing is drawn at its wanted level or a coarser resident one, every frame. Today's resident `short` (a shown picture drawn part or none) stays 0, and extends to every tier.
  - The threshold settles: in the 20-second walk into 2.5× denser, it moves smoothly and never by re-layout.
  - Requests and evictions are bounded a second, and nothing is evicted while a page of lower priority stays resident.
  - No layouts at all (today: 4.9 a second).
- **Stage 1 alone:** alloc, free, pin and evict sequences, and the pool's bytes exact.
- **Every stage:**
  - smoke (every material and pass built), lint, and health --base;
  - the WGSL dump against main, with the changes the stage expects named in its PR;
  - the census at the iPhone's share and the Mac's, with the pool's size and the roots' share;
  - the gate's pictures at the dial's rest.
- **On the device:** ?hud's "made" line is flat from Ready on during Samuel's walk, "settled" goes to yes, and the Bell tent and the water are drawn. Their refused makes are retried in a pool that no longer fills to its edge by itself.

## Costs and risks
- **Indirection.** Every instance a draw reads goes through the page table (one more lookup a thing). The heap already does this for shapes, and the land for every pixel.
- **Waste inside pages.** A sparse region still takes a whole page. Small pages (16 to 64 KB) and chains keep it low. Measure it in stage 1.
- **The GPU free list (2a)** needs care with WebGPU atomics across passes. The bounds (2b) are the safer first step.
- **The class split stays fixed.** A pool can't lend to another class, as today.
- **Effort.** The resident half of tier.js (about 400 of its 963 lines), heap.js's slots, drawer.js's feed and caps, occlusion.js's arenas. Six stages of a few PRs each, the fourth the largest.
- **Meanwhile.** Until then, the read-back tiers with #373, #375 and #378 are what ships. Their remaining cost is 4.9 re-lays a second in a dense walk and a dial up to √1.5 coarser on a phone.

## File boundaries, so the two sessions never edit the same files at once
- **Stage 1 (this session):**
  - src/core/pool.js (new: the pools, pages, free lists, page tables, flush);
  - src/core/gpu.js (plan and planDial beside byDial; the pools in the ledger);
  - src/boot.js (one call: the plan solved and the pools made, after keepMeasure, before createGround);
  - tools/storecheck.js (the pool's sequences);
  - src/scatter/tier.js (the largest-px reduction a shape page's priority needs, below).
- **Stage 2 (the draw path):** src/scatter/heap.js, the drawer's feed and its heap reads (src/scatter/drawer.js), src/scatter/cut.js's reads, and the workers' upload path.
- **Stage 4 (this session, after stage 2):** src/scatter/tier.js, src/scatter/regions.js, src/core/occlusion.js's arenas.
- Neither stage edits the other's files. Where one needs a change in the other's, it asks through the master.

## For Samuel to decide (decided: go)
1. **Whether to go.** It ends the class of bugs this week was spent on (spikes, re-lays, swaps, chasing dials), at the cost of one large migration.
2. **Page size and chains, or bounds, for instance pages.** Proposed: 64 KB pages, bounds first (2b), the GPU free list later.
3. **Shapes and instances in one priority.** Proposed: yes, one number (error per byte), so meshes and instances share the pool fairly.
4. **The roots.** Proposed: the trees' clumps and every kind's dot as the always-resident roots, with the root reach shrinking only when the roots alone don't fit.

## The interface for stage 2 (from stage 1)
This answers the draw path's questions of 2026-11-19, in its numbering. What stage 1 exports (src/core/pool.js unless noted):

- **plan and planDial** (src/core/gpu.js):
  - `plan(name, cls, need)`: need(d) is bytes at dial at rest d, or a number for a fixed need.
  - `planDial()`: solves once, after keepMeasure and before the first planned make, for the finest dial at rest at which every class holds its planned needs times BAND beside what it holds already. It raises the dial at rest to it.
  - Every pool is sized from the needs planned for it at that dial.
  - Stage 2 registers the heap's needs: the pinned coarse levels as a number, and each paged level's room times what may be in at once as need(d).
- **`poolOf(cls, 'shapes' | 'rows')`** returns the class's pool:
  - `{ buffer, pages, PAGE: 65536 bytes, table: { node, vbase(name) }, alloc, free, write, touch, reserve, flush }`.
  - PAGE is 4096 elements of 16 bytes, or 16384 corners of 4 bytes.

The eight questions:

1. **Addressing: yes, scattered pages behind a table, no compaction.**
   - An element e of a kind's level (vec4u units, from its virtual base) lies at `table[vbase + (e >> 12)] * 4096 + (e & 4095)`.
   - A corner c (u32 units) lies at `table[cbase + (c >> 14)] * 16384 + (c & 16383)`.
   - A never-made-again pool cannot compact in place, and does not need to.
2. **Typing: the shape pool is one GPUBuffer, bound twice, read-only**, as `pool.corners` (array<u32>) and `pool.elements` (array<vec4u>). Two read-only bindings may alias.
   - The instance pool is a buffer of its own (`pool.rows`, array<vec4f>), written by the packing.
   - Stage 2 never binds the instance pool writable beside the shape pool.
3. **Virtual space: yes, the table is that virtual-to-physical map.**
   - `reserve(name, pages)` gives each kind×level a fixed virtual range from its room once, at boot. So a heap row's (i0, e0, count) never change, only the table does, and residency forces no tier to pack again.
   - The table's GPU copy is a storage buffer of u32, one entry a virtual page: a physical page, or 0xFFFFFFFF for none.
   - The pool uploads it in `flush()`, only its changed range, once a frame. src/scatter/index.js select calls `flush()` before tick and the packings, where flushThings is now.
4. **Fallback ownership: the heap's mask stays the owner**, as proposed.
   - The pool decides what is in (priority, eviction). The heap decides how a kind is drawn (mask, effective level).
   - `onEvict(list)` runs synchronously when the pool evicts, before the table is flushed. The heap clears its mask bits and bumps its versions there.
   - The pages then cool (two frames and the GPU's done) before they are handed out again.
5. **Priority input: a GPU reduction, as proposed.**
   - Stage 1 adds to the tiers' packing passes a per-kind largest size on screen (dial pixels, an atomicMax of the float's bits, one u32 a kind). It is read back with the tiers' one shared read (zRead) and exported from src/scatter/tier.js as `kindPx(k)`.
   - It covers every kind a tier packs, trees too. Stage 2 computes a shape page's priority from it.
   - **The units of priority:** dial pixels of error removed per byte, at the rest dial: `(e(l+1) − e(l)) / size × kindPx(k) / bytes`, with e from error.js and size the kind's size. Larger is more important.
6. **Pins: agreed.**
   - Since #353, plant levels are corner lists into level 0's vertex block, so the plants' shapes are pinned whole (22 MB at the Mac's census) and registered as one fixed need.
   - The rocks' fine levels (level 0's near shapes, laid at Ready today), the herds and the stress zoo page.
7. **The API: agreed, with an owner and a priority.**
   - `alloc(owner, pages, priority)` returns a list or null. null means none is free and none resident is less important by a BAND.
   - `free(list)`.
   - `write(list, byteOffset, data)` splits a writeBuffer across page boundaries.
   - `touch(list, priority)` keeps a page's priority current each look.
   - `owner.onEvict(list)`.
   - The ask rate is bytes uploaded a frame (writeBuffer), paced by pace.js against the page's measured time for its uploads, not GPU time.
8. **Unchanged unless said: agreed.**
   - The cut reads through the same element indirection.
   - The meshes kept in IndexedDB stay on the CPU side.
   - The dot and the `one` levels are pinned.
