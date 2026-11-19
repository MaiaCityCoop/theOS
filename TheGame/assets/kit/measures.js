// A crowd's measure as data (intent 0038): what the crowd kit reckons of a plant's shape (assets/kit/crowd.js: its
// turns' order, each turn's own error and go, where its crowd ends, its kept's growth, its chunks and its cover, and its
// solid pieces' widths and goes), made
// at the build for every plant's every shape (tools/outlines.js: crowds.bin) and read by the recipes' workers
// (src/core/crowds.js), so a start reckons none of it: a shape's levels are laid by it, as the kit lays them, the same
// to the number. Plain JS, no three.
//
// One file of many shapes' measures: what it is (MAGIC, 4 bytes), its index's length (4 bytes), its index (JSON: each
// shape's numbers by its key, and where its arrays lie: [byte, count]), then the arrays, each at a multiple of 8 bytes.
//   packMeasures(entries)   [[key, measure], …] -> Uint8Array
//   unpackMeasures(buffer)  an ArrayBuffer -> Map(key -> measure), its arrays views of the buffer's; null where the
//                           buffer is not such a file (another file answered for it: a server's page, an older form)
/** What a shape's measure is kept under, one key for the build that writes it (tools/outlines.js) and the workers that
    read it (src/core/crowds.js): plant a's shape i at its recipe's version, for the far ends' atlases A (one of a class
    of devices: src/detail/impostor.js ATLAS_SHARES). */
export const measureKey = (a, version, i, A) => `${a.uid}:${a.placement?.seed ?? 1}@${version}#${i}|${A?.key ?? ''}`;
const MAGIC = new TextEncoder().encode('MSR1');   // (what such a file begins with, and nothing else does: a page's '<!do' is not)
const KINDS = { order: Uint32Array, own: Float64Array, go: Float32Array, at: Float32Array, parts: Uint32Array, starts: Uint32Array, cells: Float64Array, boxes: Float64Array, errs: Float64Array, solids: Float64Array };

/** The arrays a measure is laid as (its chunks' parts end to end, where each begins, their cells, boxes and errors). */
function arraysOf(m) {
  const A = { order: m.order, own: m.own, go: m.go, at: m.grow.at, solids: m.solids };
  if (m.chunks) {
    const k = m.chunks.length, starts = new Uint32Array(k + 1);
    m.chunks.forEach((C, c) => (starts[c + 1] = starts[c] + C.parts.length));
    Object.assign(A, { parts: Uint32Array.from(m.chunks.flatMap((C) => [...C.parts])), starts, cells: Float64Array.from(m.chunks.flatMap((C) => [...C.cell])), boxes: Float64Array.from(m.chunks.flatMap((C) => [...C.box])), errs: Float64Array.from(m.chunks, (C) => C.err) });
  }
  return A;
}

export function packMeasures(entries) {
  const index = {}, parts = [];
  let at = 0;
  for (const [key, m] of entries) {
    const A = arraysOf(m), where = {};
    for (const [name, a] of Object.entries(A)) { const typed = KINDS[name].from(a); where[name] = [at, typed.length]; parts.push([at, typed]); at += Math.ceil(typed.byteLength / 8) * 8; }
    index[key] = { M: m.M, win: m.win, most: m.grow.most, cover: m.cover, eC: Number.isFinite(m.eC) ? m.eC : null, a: where };
  }
  const head = new TextEncoder().encode(JSON.stringify(index)), base = Math.ceil((8 + head.length) / 8) * 8, out = new Uint8Array(base + at);
  out.set(MAGIC, 0); new DataView(out.buffer).setUint32(4, head.length, true); out.set(head, 8);
  for (const [o, typed] of parts) out.set(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), base + o);
  return out;
}

export function unpackMeasures(buffer) {
  if (buffer.byteLength < 8 || !MAGIC.every((b, i) => new Uint8Array(buffer, 0, 4)[i] === b)) return null;
  const n = new DataView(buffer).getUint32(4, true), index = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, n))), base = Math.ceil((8 + n) / 8) * 8, out = new Map();
  for (const [key, e] of Object.entries(index)) {
    const A = Object.fromEntries(Object.entries(e.a).map(([name, [o, count]]) => [name, new KINDS[name](buffer, base + o, count)]));
    const chunks = A.starts ? Array.from({ length: A.starts.length - 1 }, (_, c) => ({ parts: Array.from(A.parts.subarray(A.starts[c], A.starts[c + 1])), cell: Array.from(A.cells.subarray(c * 6, c * 6 + 6)), box: Array.from(A.boxes.subarray(c * 6, c * 6 + 6)), err: A.errs[c] })) : null;
    out.set(key, { order: A.order, own: A.own, go: A.go, M: e.M, win: e.win, grow: { most: e.most, at: A.at }, chunks, eC: e.eC, cover: e.cover, solids: A.solids });
  }
  return out;
}
