// A thing's own state (intent 0029): what has been done to one single thing of the world, whoever placed it. Nothing is
// kept for a thing nobody changed (a forest of millions costs nothing here); a thing that was changed is one entry.
//
//   gone    it is not there: cut down, taken away. Not drawn, not solid
//   grow    how much larger than it was (1: as it was)
//   tint    a colour over its own (painted: [r, g, b], 1 1 1 as it was); and
//   wear    how worn it is (0 … 1): drawn where its drawer carries a thing's state (`state`: the made things, today)
//
// A thing is named by its placer and two whole numbers: the cell it stands in (a hashed placer: one thing a cell), or its
// spot to the centimetre (the list: src/scatter/placed.js). Its id is `placer:a:b`, the same its body carries in the
// one collision engine (src/world/bodies.js: `thing`), so what the walker meets or the eye looks at can be named
// (pick). On the GPU the store is one table every packing reads (stateAt: the drawer's tiers, src/scatter/drawer.js):
// a thing's key (its placer's name and its two numbers, woven to 32 bits: keyOf, the same in JS and as nodes) looked up
// in a few steps; while the store is empty nothing is looked up at all.
//
//   things.set(id, { gone, grow, tint, wear })   (merged with what it was; as it was again: cleared)
//   things.get(id), things.clear(id), things.all(), things.pick([from, dir]) -> the id the eye looks at, or null
// Kept in the page only: saving it, and sharing it between people, is the API's (not yet).
import { uint, float, vec3, uniform, If, Loop, Break } from 'three/tsl';
import { gpuStorageLater, limitOf } from '../core/gpu.js';
import { HX, HY, fmix, fnvOf } from '../core/hash.js';
import { fmixN } from '../core/hash.nodes.js';
import { c8 } from '../../assets/kit/pack.js';

// The table: open addressing, a key within PROBE places of its own (a look-up stops at the first empty one), never
// fuller than LOAD (so a look-up takes a few steps, and a key never runs out of places: with linear probing at a share
// LOAD filled, a look-up that misses, as most do, is (1 + 1 / (1 − LOAD)²) / 2 places long on average, 3.6 at 0.6;
// one that finds, (1 + 1 / (1 − LOAD)) / 2, 1.75). As large as what
// is in it needs: the least power of two that holds it at LOAD, at least PROBE places, twice as large when it fills;
// 16 bytes an entry, never more than one buffer the GPU binds
const PROBE = 32, LOAD = 0.6;
let CAP = PROBE, MASK = CAP - 1;
const uMask = uniform(MASK, 'uint');   // (the table's mask on the GPU: its size, as it is now)
/** The most it may hold: what one buffer the GPU binds (16 bytes an entry) holds at LOAD (without a GPU, nothing binds it). */
const most = () => Math.floor(((limitOf('maxStorageBufferBindingSize') || Infinity) / 16) * LOAD);

/** A placer's name as a number (what its things' keys are woven with). */
export const nameKey = fnvOf;
/** A thing's key: its placer (a name, or nameKey's number) and its two whole numbers (never 0). */
export const keyOf = (placer, a, b) => fmix((Math.imul(a | 0, HX) ^ Math.imul(b | 0, HY) ^ (typeof placer === 'number' ? placer : nameKey(placer))) >>> 0) || 1;
/** The same as a node: h a uint node (the placer's nameKey), a and b int nodes. */
export const keyN = (h, a, b) => {
  const k = fmixN(uint(a).mul(uint(HX)).bitXor(uint(b).mul(uint(HY))).bitXor(h));
  return k.equal(uint(0)).select(uint(1), k);
};
/** A thing's id, and back. */
export const idOf = (placer, a, b) => `${placer}:${a}:${b}`;
export const ofId = (id) => { const p = String(id).split(':'); return p.length < 3 ? null : { placer: p.slice(0, -2).join(':'), a: +p.at(-2), b: +p.at(-1) }; };

// ---- the store: by id on the page, by key on the GPU ----
const byId = new Map(); let table = null;   // (the table's copy on the page, made with the first change: an entry its key, its tint and wear, -, its flags and growth)
let gpu = null, made = 0, low = Infinity, high = -1, version = 0;
/** The table on the GPU, made with the size the page's has (again when that grows: flushThings). */
const the = () => { if (!gpu) { gpu = gpuStorageLater('uvec4', 'things: what was done to single things', 'geometry'); gpu.make(CAP); made = CAP; } return gpu; };
const COUNT = uniform(0, 'uint');   // (none: no packing looks anything up)
const pack = (S) => [(c8(S.tint[0]) | (c8(S.tint[1]) << 8) | (c8(S.tint[2]) << 16) | (Math.round(Math.max(0, Math.min(1, S.wear)) * 255) << 24)) >>> 0, 0, ((S.gone ? 1 : 0) | (Math.max(0, Math.min(65535, Math.round(S.grow * 4096))) << 16)) >>> 0];
const dirty = (i) => { low = Math.min(low, i); high = Math.max(high, i); };
// a key's place: its own, or the next free within PROBE (false: none, the table is too full round it)
const own = () => (table ||= new Uint32Array(CAP * 4));
/** Room for n changed things: the table twice as large until they fit at LOAD (made again, every key put back in). */
const roomFor = (n) => {
  let cap = CAP; while (n > cap * LOAD) cap *= 2;
  if (cap === CAP) return;
  CAP = cap; MASK = cap - 1; uMask.value = MASK; table = new Uint32Array(CAP * 4); remake();
};
const slotOf = (key, free) => { own(); for (let p = 0; p < PROBE; p++) { const i = (key + p) & MASK; if (table[i * 4] === key || (free && table[i * 4] === 0)) return i; } return -1; };
const putIn = (key, S) => { const i = slotOf(key, true); if (i < 0) return false; table.set([key, ...pack(S)], i * 4); dirty(i); return true; };
// (a key taken out: the table made again from the store, so no other key is left past a gap it could not be found over)
const remake = () => { own().fill(0); for (const e of byId.values()) putIn(e.key, e.S); low = 0; high = CAP - 1; };
const plain = (S) => !S.gone && S.grow === 1 && S.wear === 0 && S.tint.every((v) => v === 1);

export const things = {
  /** Change a thing ({ gone, grow, tint, wear }: what is said, over what it was). */
  set(id, change) {
    const o = ofId(id); if (!o) throw new Error(`things: '${id}' is not an id (placer:a:b)`);
    const was = byId.get(id), S = { gone: false, grow: 1, tint: [1, 1, 1], wear: 0, ...(was?.S ?? {}), ...change };
    S.tint = [...S.tint]; S.grow = Math.max(0, +S.grow || 0);
    if (plain(S)) return things.clear(id);
    const key = was?.key ?? keyOf(o.placer, o.a, o.b);
    if (!was && byId.size >= most()) { console.warn(`things: the store holds ${byId.size} changed things, as many as one buffer of the GPU's holds; '${id}' is not changed`); return false; }
    if (!was) roomFor(byId.size + 1);
    byId.set(id, { key, S });
    if (!putIn(key, S)) console.warn(`things: no room for '${id}' on the GPU (its ${PROBE} places taken)`);
    COUNT.value = byId.size; version++; return true;
  },
  get: (id) => byId.get(id)?.S ?? null,
  clear(id) { if (!byId.delete(id)) return false; remake(); COUNT.value = byId.size; version++; return true; },
  all: () => [...byId].map(([id, e]) => [id, e.S]),
  /** Whether a thing is gone (what the collision engine asks of a body). */
  gone: (id) => !!byId.get(id)?.S.gone,
  /** The thing the eye looks at (the first body a ray from it meets, within `far` metres): its id, or null. */
  pick(from = null, dir = null, far = 60) {
    const B = window.__bodies, c = window.__game?.camera; if (!B || !c) return null;
    const d = dir ?? (() => { const v = c.getWorldDirection(c.position.clone()); return [v.x, v.y, v.z]; })(), h = B.hit(from ?? [c.position.x, c.position.y, c.position.z], d, far);
    return h?.body?.thing ?? null;
  },
  get size() { return byId.size; },
  get version() { return version; },
};

/** Each frame, before anything packs: what changed sent to the GPU, in one piece. */
export function flushThings() {
  if (high < 0) return;
  if (made !== CAP) { the().make(CAP); made = CAP; }   // (the GPU's table as large as the page's: made again when it grew)
  the().write(low * 4, table.subarray(low * 4, (high + 1) * 4)); low = Infinity; high = -1;
}
/** What the packings read besides their cells (src/scatter/index.js: a packing is made again when it changes). */
export const thingsVersion = () => version;

/** A thing's state as nodes, in a packing (key: a uint node): { gone, grow, tint, wear }; a thing nobody changed is
    there, as large as it was, its own colour. Looked up only while the store holds anything. */
export const stateAt = (key) => {
  const T = the().node, y = uint(0).toVar(), w = uint(0).toVar(), found = uint(0).toVar();
  If(COUNT.greaterThan(uint(0)), () => {
    Loop(PROBE, ({ i }) => {
      const e = T.element(key.add(uint(i)).bitAnd(uMask)).toVar();
      If(e.x.equal(key), () => { found.assign(1); y.assign(e.y); w.assign(e.w); Break(); });
      If(e.x.equal(uint(0)), () => { Break(); });   // (an empty place: the key is not in the table)
    });
  });
  const c = (s) => { const v = float(y.shiftRight(uint(s)).bitAnd(uint(255))).div(255); return v.mul(v).mul(2); }, is = found.equal(uint(1));
  return { gone: is.and(w.bitAnd(uint(1)).equal(uint(1))), grow: is.select(float(w.shiftRight(uint(16))).div(4096), float(1)), tint: is.select(vec3(c(0), c(8), c(16)), vec3(1)), wear: is.select(float(y.shiftRight(uint(24))).div(255), float(0)) };
};
if (typeof window !== 'undefined') window.__things = things;
