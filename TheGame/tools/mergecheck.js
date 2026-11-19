// Whether a texel of the land lays the same layers whichever of the layer map's points round it is read first, checked
// on the CPU (intent 0038): `bun tools/mergecheck.js`. No GPU. A texel of the land's pages (src/terrain/pages.js) lays the
// layers the four points of the layer map round it hold (src/terrain/layers.js layersFrom), each point its four
// strongest (layerWords: their ids and shares, a byte each), so as many as sixteen between them, of which the texel lays
// four (and the slope's rock, its own). Twinned here, step for step:
//   now   every layer's share summed by the points' weights, the four strongest kept, each less the fifth's share
//   was   the four slots filled first come, the points read in their order ((0, 0), (1, 0), (0, 1), (1, 1)), a layer
//         taken while a slot was free and its share over a quarter of a byte's step
// and beside them what the points hold (every layer by its weight, as many as there are: no slots) and the four
// strongest of it alone (none of the fifth's share taken from them), run on the texels of the map's cells over a page
// (SLOT / MAPN a side), each cell MAPN texels a side as a page lays them (their middles), over points drawn at random
// from a fixed seed: each holding one to four of the land's layers (LAYERS), its shares in bytes as layerWords packs
// them. Drawn at random, so what is counted is the merge's, not a place's: how often four points hold more than four
// layers between them is the land's.
// Counted, for each:
//   order   texels whose laid layers (each layer's share of the four: laid() lays each by its share of what is under
//           it) differ by more than a byte's step when the cell's points are read from another corner first
//   edges   neighbouring texels whose kept layers differ, across an edge of the map's cells and within a cell, and how
//           much of the ground the layers that come or go lay there: where the merge depends on the order, a cell keeps
//           what its first corner holds and the next cell another corner's, and its layers change at its edges
// Exit 1 where, now, a texel's layers depend on the order its points are read in, or a texel is left with none.
import './glob.js';

const { LAYERS, MAPN, EMPTY } = await import('../src/terrain/layers.js');
const { SLOT } = await import('../src/terrain/pages.js');

const BYTE = 1 / (2 ** (8 * Uint8Array.BYTES_PER_ELEMENT) - 1), KEPT = Uint32Array.BYTES_PER_ELEMENT / Uint8Array.BYTES_PER_ELEMENT;   // (a byte's step: the map's shares are a byte each; the layers a texel keeps of the map's, as many as a point holds: its ids a byte each in a 32-bit word)
let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const quant = (v) => Math.round(Math.min(1, Math.max(0, v)) * (1 / BYTE)) * BYTE;   // (growth.js byte, then un)

// ---- the map's points: each one to four of the layers, its shares of the four in bytes (layerWords) ----
const C = SLOT / MAPN, P = C + 1;   // (cells a side; points a side)
const points = Array.from({ length: P * P }, () => {
  const n = 1 + Math.floor(rand() * KEPT), ids = [];
  while (ids.length < n) { const id = Math.floor(rand() * LAYERS.length); if (!ids.includes(id)) ids.push(id); }
  const raw = ids.map(() => rand()), sum = raw.reduce((a, b) => a + b, 0);
  const out = ids.map((id, k) => [id, quant(raw[k] / sum)]).filter(([, w]) => w > 0);
  while (out.length < KEPT) out.push([EMPTY, 0]);
  return out;
});

// ---- the merges, the shader's twins: a texel's four points (load order), their bilinear weights -> [[id, w]] kept ----
/** The n strongest of S (by id), strongest first, as layers.js strongest: a later one takes a slot only if stronger. */
function strongest(n, S) {
  const top = Array.from({ length: n }, () => ({ id: null, w: 0 }));
  for (let i = 0; i < S.length; i++) {
    const s = S[i], c = top.map((t) => s > t.w);
    for (let k = n - 1; k >= 0; k--) {
      if (k > 0 && c[k - 1]) top[k] = { ...top[k - 1] };
      else if (c[k]) top[k] = { id: i, w: s };
    }
  }
  return top;
}
/** Every layer's share at the texel, by id: the points' by their weights. */
const summed = (pts, bw) => { const S = new Float64Array(LAYERS.length); for (let i = 0; i < pts.length; i++) for (const [id, w] of pts[i]) if (id !== EMPTY) S[id] += w * bw[i]; return S; };
const now = (pts, bw) => {
  const top = strongest(KEPT + 1, summed(pts, bw)), fifth = top[KEPT].w;
  return top.slice(0, KEPT).filter((t) => t.id !== null).map((t) => [t.id, t.w - fifth]);
};
const was = (pts, bw) => {
  const ids = [], ws = [];
  for (let i = 0; i < pts.length; i++) {
    if (!(bw[i] > 0)) continue;
    for (const [id, w0] of pts[i]) {
      const w = w0 * bw[i]; if (!(w > BYTE / 4)) continue;
      const m = ids.indexOf(id);
      if (m >= 0) ws[m] += w; else if (ids.length < KEPT) { ids.push(id); ws.push(w); }
    }
  }
  return ids.map((id, m) => [id, ws[m]]);
};
// (beside them: what the points hold, every layer; and its four strongest alone)
const every = (pts, bw) => [...summed(pts, bw)].map((w, id) => [id, w]);
const four = (pts, bw) => strongest(KEPT, summed(pts, bw)).filter((t) => t.id !== null).map((t) => [t.id, t.w]);
/** What a texel lays: each kept layer's share of the four (id -> share), those with any. */
const laidOf = (kept) => {
  const on = kept.filter(([, w]) => w > 0), sum = on.reduce((a, [, w]) => a + w, 0), out = new Map();
  for (const [id, w] of on) out.set(id, w / sum);
  return out;
};

// ---- the texels: each cell's MAPN² (their middles: pages.js lays a texel at its middle), each merge, the points read from
// each corner first ----
const T = C * MAPN, MERGES = { now, was, 'what the points hold': every, 'its four strongest alone': four };
const zero = () => Object.fromEntries(Object.keys(MERGES).map((k) => [k, 0])), laidAt = Object.fromEntries(Object.keys(MERGES).map((k) => [k, new Array(T * T)])), orderOff = zero(), empty = zero();
let crowded = 0;
for (let cz = 0; cz < C; cz++) for (let cx = 0; cx < C; cx++) {
  const corner = [0, 1, 2, 3].map((t) => points[(cz + (t >> 1)) * P + cx + (t & 1)]);
  if (new Set(corner.flatMap((p) => p.map(([id]) => id)).filter((id) => id !== EMPTY)).size > KEPT) crowded++;
  for (let tz = 0; tz < MAPN; tz++) for (let tx = 0; tx < MAPN; tx++) {
    const fx = (tx + 0.5) / MAPN, fz = (tz + 0.5) / MAPN, bw = [(1 - fx) * (1 - fz), fx * (1 - fz), (1 - fx) * fz, fx * fz], at = (cz * MAPN + tz) * T + cx * MAPN + tx;
    for (const [name, merge] of Object.entries(MERGES)) {
      const L = laidOf(merge(corner, bw));
      laidAt[name][at] = L; if (!L.size) empty[name]++;
      for (let r = 1; r < 4; r++) {   // (the same cell, its points read from another corner first)
        const ord = [0, 1, 2, 3].map((k) => (k + r) % 4), Lr = laidOf(merge(ord.map((k) => corner[k]), ord.map((k) => bw[k])));
        if ([...new Set([...L.keys(), ...Lr.keys()])].some((id) => Math.abs((L.get(id) ?? 0) - (Lr.get(id) ?? 0)) > BYTE)) { orderOff[name]++; break; }
      }
    }
  }
}

// ---- neighbouring texels: across an edge of the map's cells, or within a cell ----
const pct = (a, b) => `${((100 * a) / Math.max(b, 1)).toFixed(2)}%`;
const edges = {};
for (const name of Object.keys(MERGES)) {
  const E = { across: { pairs: 0, flips: 0, moved: 0, step: 0 }, within: { pairs: 0, flips: 0, moved: 0, step: 0 } }, L = laidAt[name];
  const pair = (a, b, across) => {
    const e = across ? E.across : E.within, A = L[a], B = L[b], ids = new Set([...A.keys(), ...B.keys()]);
    e.pairs++; let moved = 0, step = 0;
    for (const id of ids) { const x = A.get(id), y = B.get(id); step += Math.abs((x ?? 0) - (y ?? 0)); if (x == null || y == null) moved += x ?? y; }
    e.step += step; if (moved > 0) { e.flips++; e.moved += moved; }
  };
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    if (x + 1 < T) pair(z * T + x, z * T + x + 1, (x + 1) % MAPN === 0);
    if (z + 1 < T) pair(z * T + x, (z + 1) * T + x, (z + 1) % MAPN === 0);
  }
  edges[name] = E;
}

console.log(`the layer map's points: ${P}² of them at random (fixed seed), one to ${KEPT} of the land's ${LAYERS.length} layers each; ${C}² cells of ${MAPN}² texels; ${pct(crowded, C * C)} of the cells' four points hold more than ${KEPT} layers between them (only there may a merge leave any out)`);
for (const name of Object.keys(MERGES)) {
  const E = edges[name], row = (k) => `${pct(E[k].flips, E[k].pairs)} of ${E[k].pairs} pairs, laying ${(E[k].moved / Math.max(E[k].flips, 1)).toFixed(3)} of the ground a flip; mean step ${(E[k].step / E[k].pairs).toFixed(4)}`;
  console.log(`\n${name}:`);
  console.log(`  order   ${orderOff[name]} texels of ${T * T} (${pct(orderOff[name], T * T)}) lay other layers when their cell's points are read from another corner first`);
  console.log(`  edges   kept layers change across a cell's edge in ${row('across')}`);
  console.log(`                                 within a cell in ${row('within')}`);
  if (empty[name]) console.log(`  ${empty[name]} texels lay no layer of the map's`);
}
const bad = orderOff.now + empty.now;
console.log(bad ? `\nFAIL: now, ${orderOff.now} texels depend on the order their points are read in, ${empty.now} lay nothing` : '\nok: now, every texel lays the same layers whichever point is read first, and none lays nothing');
process.exit(bad ? 1 : 0);
