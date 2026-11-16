// A probe, not part of the game: what the simplifier that serves a rock does to a tree of the game (wood as tubes, a
// crown of thousands of separate leaf cards), and what thinning the cards at random and enlarging the ones that stay
// does instead (Cook et al. 2007, "Stochastic simplification of aggregate detail").
//
// A crown is measured as the eye meets it: seen from the side and from above, how much of the picture its cards cover.
// A card is not solid (a sprig is cut out of it), so each card a pixel lies under lets most of the light past:
// cover = 1 - (1 - A)^n for n cards over a pixel, A the share of a card its sprig fills.
//
//   node crown.mjs <meshoptimizer package dir> <TheGame dir> [stonepine | holmoak] [shape]
import { pathToFileURL } from 'node:url';

const [, , MESHOPT, GAME, WHICH = 'stonepine', SHAPE = '4'] = process.argv;
const imp = (p) => import(pathToFileURL(p).href);
const { MeshoptSimplifier: S } = await imp(`${MESHOPT}/index.js`);
await S.ready;
const asset = (await imp(`${GAME}/assets/${WHICH}.js`)).default;
const A = 0.45, N = 256;   // the share of a card its sprig fills (taken, not measured); the picture's pixels a side

const fine = asset.fine ? 1 : 0, shape = Math.min(+SHAPE, asset.shapeCount - 1);
const raw = (l) => asset.rawAt(l, shape);
const M = raw(fine);   // its nearest level as its file draws it (not the sprays of twigs made from it)
const V = M.part.length, pos = Float32Array.from(M.position), index = Uint32Array.from(M.index), part = M.part;
const isLeaf = (t, idx = index) => part[idx[t * 3]] > 0.5;
const count = (idx) => { let w = 0, l = 0; for (let t = 0; t < idx.length / 3; t++) (isLeaf(t, idx) ? l++ : w++); return { wood: w, leaf: l }; };
const areaOf = (P, idx, only = null) => { let a = 0; for (let t = 0; t < idx.length; t += 3) { if (only !== null && (part[idx[t]] > 0.5) !== only) continue; const i = idx[t] * 3, j = idx[t + 1] * 3, k = idx[t + 2] * 3, ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2], vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2]; a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return a; };

// the picture: the crown's box seen along an axis, N pixels a side; each leaf triangle adds 1 to the pixels it covers
let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let t = 0; t < index.length; t++) if (part[index[t]] > 0.5) for (let a = 0; a < 3; a++) { const x = pos[index[t] * 3 + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; }
const pad = 0.5; lo = lo.map((x) => x - pad); hi = hi.map((x) => x + pad);
function cover(P, idx, axis) {   // axis: the one looked along (0: from the side, 1: from above)
  const u = (axis + 1) % 3, v = (axis + 2) % 3, su = N / (hi[u] - lo[u]), sv = N / (hi[v] - lo[v]), layers = new Uint16Array(N * N);
  for (let t = 0; t < idx.length; t += 3) {
    if (part[idx[t]] < 0.5) continue;
    const X = [0, 1, 2].map((k) => (P[idx[t + k] * 3 + u] - lo[u]) * su), Y = [0, 1, 2].map((k) => (P[idx[t + k] * 3 + v] - lo[v]) * sv);
    const x0 = Math.max(0, Math.floor(Math.min(...X))), x1 = Math.min(N - 1, Math.ceil(Math.max(...X))), y0 = Math.max(0, Math.floor(Math.min(...Y))), y1 = Math.min(N - 1, Math.ceil(Math.max(...Y)));
    const e = (a, b, x, y) => (X[b] - X[a]) * (y - Y[a]) - (Y[b] - Y[a]) * (x - X[a]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const cx = x + 0.5, cy = y + 0.5, a = e(0, 1, cx, cy), b = e(1, 2, cx, cy), c = e(2, 0, cx, cy); if ((a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0)) layers[y * N + x]++; }
  }
  let sum = 0, touched = 0; for (let i = 0; i < N * N; i++) { if (layers[i]) touched++; sum += 1 - (1 - A) ** (layers[i] / 2); }   // (a card is two triangles: half a card a triangle)
  return { cover: sum / (N * N), outline: touched / (N * N) };
}
const full = { side: cover(pos, index, 0), top: cover(pos, index, 1), n: count(index), leafArea: areaOf(pos, index, true) };
const pct = (x, of) => `${((100 * x) / of).toFixed(0)} %`;
const line = (name, P, idx) => {
  const s = cover(P, idx, 0), t = cover(P, idx, 1), n = count(idx);
  console.log(`${name.padEnd(46)} ${String(n.wood).padStart(6)} wood ${String(n.leaf).padStart(6)} leaf tris | leaf area ${pct(areaOf(P, idx, true), full.leafArea).padStart(6)} | cover from the side ${pct(s.cover, full.side.cover).padStart(6)}, from above ${pct(t.cover, full.top.cover).padStart(6)} | outline ${pct(s.outline, full.side.outline).padStart(6)}, ${pct(t.outline, full.top.outline).padStart(6)}`);
};
console.log(`${asset.name}, shape ${shape}: ${V} vertices, ${index.length / 3} triangles (${full.n.wood} wood, ${full.n.leaf} leaf: ${full.n.leaf / 4} sprigs of two crossed cards)`);
console.log(`its crown covers ${(100 * full.side.cover).toFixed(1)} % of its box's picture from the side, ${(100 * full.top.cover).toFixed(1)} % from above (a card taken as ${A * 100} % sprig)\n`);
line('as its file draws it', pos, index);

// 1. the simplifier, as for a rock: to a half, a quarter, a tenth of its triangles
console.log('\nthe simplifier (edge collapse, as serves a rock):');
for (const keep of [0.5, 0.25, 0.1]) {
  const target = Math.floor((index.length / 3) * keep) * 3;
  for (const [name, flags] of [['plain', ['ErrorAbsolute']], ['pruning what stands alone', ['ErrorAbsolute', 'Prune']]]) {
    const [out] = S.simplify(index, pos, 3, target, 1e30, flags);
    line(`  to ${keep * 100} %, ${name}: reached ${((100 * out.length) / index.length).toFixed(0)} %`, pos, out);
  }
  const [out] = S.simplifySloppy(index, pos, 3, null, target, 1e30);
  line(`  to ${keep * 100} %, by a grid (sloppy): reached ${((100 * out.length) / index.length).toFixed(0)} %`, pos, out);
}

// 2. thinning at random: keep a share of the sprigs, in an order fixed once (the same sprigs at every distance: one
// that is there stays there as the camera comes nearer), each of those that stay enlarged about its foot
console.log('\nthinning the sprigs at random, the wood left as it is:');
const sprigs = [];   // a sprig: twelve corners one after another (two crossed cards: assets/kit/tree.js, cards()), on eight vertices
for (let t = 0; t < index.length;) { if (part[index[t]] > 0.5 && t + 12 <= index.length) { sprigs.push(t); t += 12; } else t += 3; }
const woodIdx = []; { const leafAt = new Set(); for (const t of sprigs) for (let k = 0; k < 12; k++) leafAt.add(t + k); for (let t = 0; t < index.length; t++) if (!leafAt.has(t)) woodIdx.push(index[t]); }
let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const order = sprigs.map((t) => [rnd(), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
for (const keep of [0.5, 0.25, 0.1, 0.04]) for (const grow of [false, true]) {
  const n = Math.max(1, Math.round(order.length * keep)), k = grow ? Math.sqrt(order.length / n) : 1, P = Float32Array.from(pos), idx = [...woodIdx];
  for (let s = 0; s < n; s++) {
    const t = order[s], vs = [...new Set(Array.from(index.subarray(t, t + 12)))], root = [M.root[vs[0] * 3], M.root[vs[0] * 3 + 1], M.root[vs[0] * 3 + 2]];
    for (const v of vs) for (let a = 0; a < 3; a++) P[v * 3 + a] = root[a] + (pos[v * 3 + a] - root[a]) * k;   // enlarged about its foot: its area by 1 / keep
    for (let q = 0; q < 12; q++) idx.push(index[t + q]);
  }
  line(`  ${String(keep * 100).padStart(3)} % of the sprigs, ${grow ? `each ${k.toFixed(2)} times as long and wide` : 'left their size'}`, P, Uint32Array.from(idx));
}

// 2b. the same, the enlargement not taken from the area but found: the one at which the crown covers as much of the
// picture as the full crown does (the mean of both views), by halving. A sprig may be enlarged about its foot (it grows
// out of the crown), its middle, or its tip (it grows back into the crown: the outline stays)
console.log('\nthinned, each sprig enlarged until the crown covers what the full one covers (the enlargement found, not given):');
const want = (full.side.cover + full.top.cover) / 2;
const thinned = (keep, k, pivot) => {
  const n = Math.max(1, Math.round(order.length * keep)), P = Float32Array.from(pos), idx = [...woodIdx];
  for (let s = 0; s < n; s++) {
    const t = order[s], vs = [...new Set(Array.from(index.subarray(t, t + 12)))], c = [0, 0, 0];
    if (pivot === 0) for (let a = 0; a < 3; a++) c[a] = M.root[vs[0] * 3 + a];
    else { for (const v of vs) for (let a = 0; a < 3; a++) c[a] += pos[v * 3 + a] / vs.length; if (pivot === 2) for (let a = 0; a < 3; a++) c[a] = 2 * c[a] - M.root[vs[0] * 3 + a]; }   // (its tip: as far past its middle as its foot is before it)
    for (const v of vs) for (let a = 0; a < 3; a++) P[v * 3 + a] = c[a] + (pos[v * 3 + a] - c[a]) * k;
    for (let q = 0; q < 12; q++) idx.push(index[t + q]);
  }
  return [P, Uint32Array.from(idx)];
};
for (const keep of [0.5, 0.25, 0.1, 0.04, 0.01]) for (const [pivot, name] of [[0, 'foot'], [1, 'middle'], [2, 'tip']]) {
  let lo2 = 1, hi2 = Math.sqrt(1 / keep) * 1.5;
  for (let i = 0; i < 18; i++) { const k = (lo2 + hi2) / 2, [P, idx] = thinned(keep, k, pivot), c = (cover(P, idx, 0).cover + cover(P, idx, 1).cover) / 2; if (c > want) hi2 = k; else lo2 = k; }
  const k = (lo2 + hi2) / 2, [P, idx] = thinned(keep, k, pivot);
  line(`  ${String(keep * 100).padStart(3)} %, about its ${name.padEnd(6)}: ${k.toFixed(2)} x (area's: ${Math.sqrt(1 / keep).toFixed(2)})`, P, idx);
}

// EXPORT=file: the crown under each rule, as triangles, for a picture
if (process.env.EXPORT) {
  const { writeFileSync } = await import('node:fs');
  const soup = (P, idx, parts, leaf) => { const o = []; for (let t = 0; t < idx.length; t += 3) { if ((parts[idx[t]] > 0.5) !== leaf) continue; for (let k = 0; k < 3; k++) { const v = idx[t + k] * 3; o.push(+P[v].toFixed(3), +P[v + 1].toFixed(3), +P[v + 2].toFixed(3)); } } return o; };
  const say = (P, idx) => { const s = cover(P, idx, 0), t = cover(P, idx, 1); return { leafTris: count(idx).leaf, side: Math.round((100 * s.cover) / full.side.cover), above: Math.round((100 * t.cover) / full.top.cover) }; };
  const found = (keep, pivot) => { let a = 1, b = Math.sqrt(1 / keep) * 1.5; for (let i = 0; i < 18; i++) { const k = (a + b) / 2, [P, idx] = thinned(keep, k, pivot), c = (cover(P, idx, 0).cover + cover(P, idx, 1).cover) / 2; if (c > want) b = k; else a = k; } return (a + b) / 2; };
  const V = [], put = (name, P, idx, extra = {}) => V.push({ name, leaf: soup(P, idx, part, true), wood: soup(P, idx, part, false), ...say(P, idx), ...extra });
  put('as its file draws it', pos, index);
  const [simp] = S.simplify(index, pos, 3, Math.floor((index.length / 3) * 0.1) * 3, 1e30, ['ErrorAbsolute']); put('the simplifier, to a tenth of its triangles', pos, simp);
  { const [P, idx] = thinned(0.1, 1, 0); put('a tenth of its sprigs, left their size', P, idx); }
  { const k = found(0.1, 2), [P, idx] = thinned(0.1, k, 2); put('a tenth of its sprigs, each enlarged back into the crown', P, idx, { times: +k.toFixed(2) }); }
  { const k = found(0.04, 2), [P, idx] = thinned(0.04, k, 2); put('one sprig in twenty-five, each enlarged', P, idx, { times: +k.toFixed(2) }); }
  writeFileSync(process.env.EXPORT, JSON.stringify({ name: asset.name, lo, hi, card: A, variants: V }));
}

// 3. beside them: the levels its file writes by hand today (a crown as one solid body, the kit's two farthest, is not
// cut out: it covers every pixel it lies over)
console.log('\nthe levels its file writes by hand today, and the kit\'s two farthest:');
for (let l = fine + 1; l < asset.levelCount; l++) {
  const m = raw(l), P = Float32Array.from(m.position), idx = Uint32Array.from(m.index), parts = m.part, n = { wood: 0, leaf: 0 }; let solid = false;
  for (let t = 0; t < idx.length; t += 3) { if (parts[idx[t]] > 0.5) n.leaf++; else n.wood++; if (parts[idx[t]] > 1.5) solid = true; }
  const cov = (axis) => {
    const u = (axis + 1) % 3, v = (axis + 2) % 3, su = N / (hi[u] - lo[u]), sv = N / (hi[v] - lo[v]), layers = new Uint16Array(N * N);
    for (let t = 0; t < idx.length; t += 3) {
      if (parts[idx[t]] < 0.5) continue;
      const X = [0, 1, 2].map((k) => (P[idx[t + k] * 3 + u] - lo[u]) * su), Y = [0, 1, 2].map((k) => (P[idx[t + k] * 3 + v] - lo[v]) * sv);
      const x0 = Math.max(0, Math.floor(Math.min(...X))), x1 = Math.min(N - 1, Math.ceil(Math.max(...X))), y0 = Math.max(0, Math.floor(Math.min(...Y))), y1 = Math.min(N - 1, Math.ceil(Math.max(...Y)));
      const e = (a, b, x, y) => (X[b] - X[a]) * (y - Y[a]) - (Y[b] - Y[a]) * (x - X[a]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const cx = x + 0.5, cy = y + 0.5, a = e(0, 1, cx, cy), b = e(1, 2, cx, cy), c = e(2, 0, cx, cy); if ((a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0)) layers[y * N + x]++; }
    }
    let sum = 0, touched = 0; for (let i = 0; i < N * N; i++) { if (layers[i]) touched++; sum += solid ? (layers[i] ? 1 : 0) : 1 - (1 - A) ** (layers[i] / 2); }
    return { cover: sum / (N * N), outline: touched / (N * N) };
  };
  const sd = cov(0), tp = cov(1);
  console.log(`  level ${l - fine}${solid ? ' (one solid body)' : ''}`.padEnd(46) + ` ${String(n.wood).padStart(6)} wood ${String(n.leaf).padStart(6)} leaf tris | cover from the side ${pct(sd.cover, full.side.cover).padStart(6)}, from above ${pct(tp.cover, full.top.cover).padStart(6)} | outline ${pct(sd.outline, full.side.outline).padStart(6)}, ${pct(tp.outline, full.top.outline).padStart(6)}`);
}
