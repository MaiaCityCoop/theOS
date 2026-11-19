// The fixed pools (intent 0038, research_notes/0038-fixed-pools.md, stage 1): a class's memory for what streams, made
// once at the start at the size its plan solved (src/core/gpu.js planDial) and never made again, so what the GPU holds
// is flat from the first frame. It is cut into pages of PAGE bytes. Each owner (a kind's level, a region's things)
// reserves a range of pages once (reserve: its virtual pages, where what reads it thinks it lies, for good); a page of
// that range is in where the page table maps it to a page of the pool (alloc), the most important first (its priority:
// the error it takes off the picture a byte, research_notes/0038-fixed-pools.md), and out again where something more
// important by a BAND wants its room (evicted: its owner told, onEvict). A page let go cools before it is given out
// again: the next two frames, then all the GPU was handed by then done (as src/core/gpu.js retire lets a buffer go), so
// no draw still in flight reads a page written over under it. What reads a page reads it through the table's GPU copy,
// flushed once a frame (flush: src/scatter/index.js select, before anything packs). Two pools a class: its shapes'
// (written only by uploads, read-only wherever it is bound, so it may be bound twice, its corners and its elements) and
// its rows' (written by the packings): WebGPU lets no writable binding alias another.
//
//   makePools(sizes)            every pool the plan sized (planDial's: `${cls}|${use}` -> bytes), made once
//   poolOf(cls, use)            a class's pool for 'shapes' or 'rows', or null (none planned)
//   pool.reserve(owner, n)      n virtual pages for good -> the first's number; owner: { name, onEvict(vpages) }
//   pool.alloc(owner, vpages, priority)   each of them mapped to a page of the pool, the least important resident let
//                               go for it where none is free -> whether all are in (none is, where they cannot all be)
//   pool.free(vpages)           let go: their pages cool, then are free
//   pool.touch(vpages, priority)   their priority now (each look)
//   pool.write(vbyte, data)     data written where virtual byte vbyte lies, across pages (each of them in)
//   pool.flush()                once a frame: what has cooled freed, the table's changes sent to the GPU
//   pool.table                  its GPU copy: a node of uint, a virtual page's page, NONE where it is out
//   flushPools()                every pool's flush (src/boot.js, each frame before the scatter packs)
import { gpuStorage, gpuStorageLater, gpuDone } from './gpu.js';
import { BAND } from '../detail/error.js';

/** A page: what one entry of a page table maps, as a tiled resource's tile is laid out on the GPU. unit: bytes. source:
    Microsoft, "Tiled resources" (Direct3D 11.2), 2013, https://learn.microsoft.com/windows/win32/direct3d11/tiled-resources */
export const PAGE = 65536;
/** A virtual page's entry where it is out (the table's): the largest u32, a page no pool has. source: W3C, "WebGPU
    Shading Language", 2023, https://www.w3.org/TR/WGSL/#integer-types (u32: 0 … 2^32 − 1) */
export const NONE = 0xffffffff;

const POOLS = new Map();   // (`${cls}|${use}` -> its pool)
/** A class's pool for `use` ('shapes' | 'rows'), or null: none was planned. */
export const poolOf = (cls, use) => POOLS.get(`${cls}|${use}`) ?? null;
/** Every pool the plan sized (src/core/gpu.js planDial: `${cls}|${use}` -> bytes), each made once, as many whole pages
    as fit it (none where it is less than one). */
export function makePools(sizes) {
  for (const [key, bytes] of sizes) { const n = Math.floor(bytes / PAGE); if (n > 0 && !POOLS.has(key)) POOLS.set(key, poolMade(key, n)); }
}

/** Each frame, before anything packs (src/boot.js): every pool flushed. */
export const flushPools = () => { for (const P of POOLS.values()) P.flush(); };

/** A pool of n pages, its class and use from its key. */
function poolMade(key, n) {
  const [cls, use] = key.split('|'), name = `the pool: ${cls}, its ${use}`;
  const store = gpuStorage('uvec4', (n * PAGE) / 16, name, cls), table = gpuStorageLater('uint', `${name}: its table`, cls);
  const of = { owner: new Array(n).fill(null), v: new Int32Array(n).fill(-1), priority: new Float64Array(n) };   // (each page's owner, the virtual page it holds, its priority)
  const free = Array.from({ length: n }, (_, i) => n - 1 - i), cooling = [];   // (cooling: { page, frame } let go, not yet free)
  let map = new Uint32Array(0), made = 0, lo = Infinity, hi = -1, frame = 0;   // (map: the table on the page, virtual page -> page; lo, hi: its changes since the last flush)
  const mark = (v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); };
  // (a page let go: out of the table at once, its owner told; free once it has cooled)
  const out = (p, tell) => {
    const v = of.v[p], owner = of.owner[p];
    map[v] = NONE; mark(v); of.owner[p] = null; of.v[p] = -1; cooling.push({ page: p, frame });
    if (tell) owner?.onEvict?.([v]);
  };
  // (the least important page in, of those less important than `priority` by a BAND: none, -1)
  const least = (priority) => { let p = -1; for (let i = 0; i < n; i++) if (of.owner[i] && of.priority[i] * BAND < priority && (p < 0 || of.priority[i] < of.priority[p])) p = i; return p; };
  return {
    cls, use, pages: n, store,
    /** Its GPU copy of the page table: uint, a virtual page's page (NONE where it is out). */
    get table() { return table.node; },
    /** n virtual pages for `owner`, for good (out till alloc). -> the first's number. */
    reserve(owner, count) {
      const first = map.length, grown = new Uint32Array(first + count).fill(NONE); grown.set(map); map = grown;
      mark(first); mark(map.length - 1);
      return first;
    },
    /** Each of vpages (of `owner`'s) mapped to a free page, at `priority`: all of them, or none (false). Where too few
        are free, as many of the least important in as it lacks let go for it (each less important by a BAND, its owner
        told): free once they have cooled, it asks again then. */
    alloc(owner, vpages, priority) {
      const want = vpages.filter((v) => map[v] === NONE);
      if (want.length > free.length) {
        for (let lack = want.length - free.length - cooling.length; lack > 0; lack--) { const p = least(priority); if (p < 0) break; out(p, true); }
        return false;
      }
      for (const v of want) { const p = free.pop(); map[v] = p; mark(v); of.owner[p] = owner; of.v[p] = v; of.priority[p] = priority; }
      return true;
    },
    /** vpages let go: their pages cool, then are free. */
    free(vpages) { for (const v of vpages) { const p = map[v]; if (p !== NONE) out(p, false); } },
    /** vpages' priority now. */
    touch(vpages, priority) { for (const v of vpages) { const p = map[v]; if (p !== NONE) of.priority[p] = priority; } },
    /** data (a typed array) written where virtual byte `vbyte` lies, across pages: each must be in. */
    write(vbyte, data) {
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      for (let at = 0; at < bytes.length; ) {
        const v = Math.floor((vbyte + at) / PAGE), o = (vbyte + at) % PAGE, k = Math.min(PAGE - o, bytes.length - at), p = map[v];
        if (p === NONE) throw new Error(`${name}: virtual page ${v} written while out`);
        store.write((p * PAGE + o) / 4, new Uint32Array(bytes.slice(at, at + k).buffer)); at += k;
      }
    },
    /** Once a frame: the pages let go two frames ago asked to be free once the GPU is done with them; the table's
        changes sent (its GPU copy made again where it has grown). */
    flush() {
      frame++;
      for (const c of cooling.filter((x) => x.frame <= frame - 2)) { cooling.splice(cooling.indexOf(c), 1); gpuDone().then(() => free.push(c.page)); }
      if (map.length > made) { table.make(map.length); made = map.length; lo = 0; hi = map.length - 1; }
      if (hi >= lo) table.write(lo, map.subarray(lo, hi + 1));
      lo = Infinity; hi = -1;
    },
    /** What it holds now: { pages, free, cooling, in }. */
    stats: () => ({ pages: n, free: free.length, cooling: cooling.length, in: n - free.length - cooling.length }),
  };
}
