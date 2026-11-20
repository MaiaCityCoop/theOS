// A probe, not part of the game: one measuring stick for any asset, told nothing about what the asset is.
//
// The stick: draw the full thing and a coarser version of it from thirteen sides, as pictures of how much of each
// pixel shows which stuff (what stops all the light: wood, stone, canvas; and what is cut out: leaves), at the size on
// screen the coarser version would be used at. Lay the two over each other and compare them neighbourhood by
// neighbourhood. A neighbourhood is four pixels a side: where in such a patch a leaf sits the eye does not tell; how
// much of the patch is covered, and by which stuff, it does. Of a thing under 32 pixels it is an eighth of the thing,
// and never under a pixel: a speck of eight pixels is judged pixel by pixel. Three numbers come out, each of the full
// thing's: how much the outline grew or shrank, how much a neighbourhood differs on average, and at its worst (the
// 99th of a hundred). An outline that moved a pixel changes a neighbourhood by a quarter; so does a rope a pixel wide
// that went.
//
// With it, for a boulder, the tent, an oak, a pine and a bush alike, told nothing of what they are:
//   1. the ways of making a thing coarser are tried at the same triangles, and the stick says which loses less:
//      folding edges (the simplifier) for all of it, or crowd by crowd: each crowd of loose pieces of one stuff either
//      folded, or thinned and those that stay enlarged (the smallest pieces first, or all sizes alike), whichever the
//      stick prefers for that crowd; for the smallest levels a third way: a hull, a closed body round a crowd or round
//      all of it that covers as much, by being see-through or by being smaller;
//   2. today's hand-made levels are measured on the same stick at the size each is first drawn at, beside the best
//      of the ways at the same triangles;
//   3. BUDGET=1: today's triangles in all, spread so that they follow the size on screen, against today's levels at
//      every size.
// What is a "loose piece" is found, not told: triangles that share no corner with the rest (a card, a twig, a peg).
// How much of the light a triangle stops is its `alpha` (1: all of it, solid stuff; under 1: cut-out stuff; under 0:
// as much as its amount, of solid stuff: a see-through stand-in for wood or stone).
//
//   node generic.mjs <meshoptimizer package dir> <TheGame dir> [boulder,tent,holmoak,stonepine,mastic]
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const [, , MESHOPT, GAME, WHICH = 'boulder,tent,holmoak,stonepine,mastic'] = process.argv;
const imp = (p) => import(pathToFileURL(p).href);
const { MeshoptSimplifier: S } = await imp(`${MESHOPT}/index.js`); await S.ready;
const { rockMesh } = await imp(`${GAME}/assets/kit/rock.js`), { unpackSolid } = await imp(`${GAME}/assets/kit/solid.js`), { LADDER, DOTN } = await imp(`${GAME}/assets/kit/ladder.js`), { kindRule } = await imp(`${GAME}/assets/kinds.js`);

const CARD = 0.45, CARD_TRI = 1 - Math.sqrt(1 - CARD);   // a card is 45 % sprig; it is two triangles, each letting through what together makes that
const EVEN = !process.env.CHANCE;   // a crowd's order: spread evenly (CHANCE=1: by chance, to measure against)
const N = 512, SS = 2, HOOD = 4, ACROSS = 8;            // the finest picture's pixels a side; samples a pixel each way; a neighbourhood's pixels a side, and how many of them a small thing is still cut into

// ---- the thirteen sides: along the axes, the face diagonals and the body diagonals ----
const DIRS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]].map((d) => {
  const l = Math.hypot(...d), w = d.map((x) => x / l), a = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [a[1] * w[2] - a[2] * w[1], a[2] * w[0] - a[0] * w[2], a[0] * w[1] - a[1] * w[0]]; const ul = Math.hypot(...u); u = u.map((x) => x / ul);
  return { w, u, v: [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]] };
});

/** A thing's pictures: from each side two of them, N pixels a side over `frame`: how much of each pixel shows its
    cut-out stuff (leaves; a hull that stands for them) and how much its solid stuff (wood, stone, canvas), as the eye
    would get them: what lies nearer hides what lies behind by as much of the light as it stops. P its vertices, idx
    its corners, alpha how much of the light each triangle stops (1, or under 0: solid stuff). -> [cut-out, solid] for
    each side, one after another. */
function pictures(P, idx, alpha, frame) {
  const M = N * SS, k = M / (2 * frame.r), out = [], nT = idx.length / 3, depth = new Float32Array(nT), order = new Uint32Array(nT);
  for (const { w, u, v } of DIRS) {
    for (let t = 0; t < nT; t++) { const i = idx[t * 3] * 3, j = idx[t * 3 + 1] * 3, q = idx[t * 3 + 2] * 3; depth[t] = (P[i] + P[j] + P[q]) * w[0] + (P[i + 1] + P[j + 1] + P[q + 1]) * w[1] + (P[i + 2] + P[j + 2] + P[q + 2]) * w[2]; order[t] = t; }
    order.sort((x, y) => depth[y] - depth[x]);   // the farthest first: each nearer one is laid over what is there
    const G = new Float32Array(M * M), W = new Float32Array(M * M);
    for (let o = 0; o < nT; o++) {
      const t = order[o] * 3, al = alpha[order[o]], a = Math.abs(al); if (!(a > 0)) continue; const solid = al === 1 || al < 0;
      let X0, Y0, X1, Y1, X2, Y2;
      { const i = idx[t] * 3, x = P[i] - frame.c[0], y = P[i + 1] - frame.c[1], z = P[i + 2] - frame.c[2]; X0 = (x * u[0] + y * u[1] + z * u[2] + frame.r) * k; Y0 = (x * v[0] + y * v[1] + z * v[2] + frame.r) * k; }
      { const i = idx[t + 1] * 3, x = P[i] - frame.c[0], y = P[i + 1] - frame.c[1], z = P[i + 2] - frame.c[2]; X1 = (x * u[0] + y * u[1] + z * u[2] + frame.r) * k; Y1 = (x * v[0] + y * v[1] + z * v[2] + frame.r) * k; }
      { const i = idx[t + 2] * 3, x = P[i] - frame.c[0], y = P[i + 1] - frame.c[1], z = P[i + 2] - frame.c[2]; X2 = (x * u[0] + y * u[1] + z * u[2] + frame.r) * k; Y2 = (x * v[0] + y * v[1] + z * v[2] + frame.r) * k; }
      const x0 = Math.max(0, Math.floor(Math.min(X0, X1, X2))), x1 = Math.min(M - 1, Math.ceil(Math.max(X0, X1, X2))), y0 = Math.max(0, Math.floor(Math.min(Y0, Y1, Y2))), y1 = Math.min(M - 1, Math.ceil(Math.max(Y0, Y1, Y2)));
      if ((X1 - X0) * (Y2 - Y0) - (Y1 - Y0) * (X2 - X0) === 0) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5, cy = y + 0.5, e0 = (X1 - X0) * (cy - Y0) - (Y1 - Y0) * (cx - X0), e1 = (X2 - X1) * (cy - Y1) - (Y2 - Y1) * (cx - X1), e2 = (X0 - X2) * (cy - Y2) - (Y0 - Y2) * (cx - X2);
        if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) { const i = y * M + x; G[i] = G[i] * (1 - a) + (solid ? 0 : a); W[i] = W[i] * (1 - a) + (solid ? a : 0); }
      }
    }
    for (const T of [G, W]) { const C = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let q = 0; for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) q += T[(y * SS + j) * M + x * SS + i]; C[y * N + x] = q / (SS * SS); } out.push(C); }
  }
  return out;
}
/** A picture of n pixels a side made coarser: each new pixel the mean of s old ones a side (s need not be whole; what
    is left over at the rim, under a new pixel, is shared between both rims and dropped). */
function coarser(C, n, s) {
  const m = Math.max(1, Math.floor(n / s)), o = (n - m * s) / 2, rows = new Float32Array(n * m), out = new Float32Array(m * m);
  for (let X = 0; X < m; X++) { const a = o + X * s, b = a + s; for (let x = Math.floor(a); x < Math.min(n, Math.ceil(b)); x++) { const w = (Math.min(b, x + 1) - Math.max(a, x)) / s; for (let y = 0; y < n; y++) rows[y * m + X] += C[y * n + x] * w; } }
  for (let Y = 0; Y < m; Y++) { const a = o + Y * s, b = a + s; for (let y = Math.floor(a); y < Math.min(n, Math.ceil(b)); y++) { const w = (Math.min(b, y + 1) - Math.max(a, y)) / s; for (let X = 0; X < m; X++) out[Y * m + X] += rows[y * m + X] * w; } }
  return out;
}
const meanOf = (pics) => { let s = 0, n = 0; for (const C of pics) { for (let i = 0; i < C.length; i++) s += C[i]; n += C.length; } return s / n; };
/** The stick, at `px` pixels across a thing of size 1: the two things' pictures made as small as that, laid over each
    other, compared by neighbourhoods (HOOD pixels a side, or the thing's size / ACROSS where that is less, never
    under a pixel): { outline (the coarser one's, of the full one's), mean, worst (how much a neighbourhood differs in
    what it shows of each stuff, of a full neighbourhood: on average, and the 99th of a hundred) }. Green where brown
    was counts as much as nothing where something was. */
const small = new WeakMap();   // the full thing's pictures made small, kept: they are asked for again and again
function stick(F, C, frame, px) {
  const hood = Math.max(1, Math.min(HOOD, px / ACROSS)), s = Math.max(1, (hood / px) / ((2 * frame.r) / N));   // a neighbourhood's side, in the pictures' pixels
  let kept = small.get(F); if (!kept) small.set(F, (kept = new Map()));
  let f = kept.get(s); if (!f) kept.set(s, (f = F.map((p) => coarser(p, N, s))));
  const diffs = []; let oF = 0, oC = 0;
  for (let d = 0; d < F.length; d += 2) {
    const a = f[d], a2 = f[d + 1], b = coarser(C[d], N, s), b2 = coarser(C[d + 1], N, s);
    for (let i = 0; i < a.length; i++) { const cf = a[i] + a2[i], cc = b[i] + b2[i]; if (cf > 0.02) oF++; if (cc > 0.02) oC++; if (cf > 0.02 || cc > 0.02) diffs.push(Math.min(1, Math.abs(a[i] - b[i]) + Math.abs(a2[i] - b2[i]))); }
  }
  diffs.sort((x, y) => x - y);
  return { outline: oC / Math.max(1, oF), mean: diffs.reduce((t, x) => t + x, 0) / Math.max(1, diffs.length), worst: diffs[Math.floor(diffs.length * 0.99)] ?? 0 };
}

// ---- loose pieces, found: the triangles that share corners make a piece ----
function piecesOf(V, idx) {
  const up = new Int32Array(V).map((_, i) => i), find = (x) => { while (up[x] !== x) { up[x] = up[up[x]]; x = up[x]; } return x; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]); up[b] = a; up[c] = a; }
  const of = new Map(); for (let t = 0; t < idx.length; t += 3) { const r = find(idx[t]); let p = of.get(r); if (!p) of.set(r, (p = [])); p.push(t); }
  return [...of.values()];   // each: the first corners of its triangles
}
let seed = 1; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/** Folding edges: the whole thing to `keep` of its triangles. */
function fold(A, keep) {
  const target = Math.max(3, Math.floor((A.idx.length / 3) * keep) * 3), [out] = S.simplify(A.idx, A.pos, 3, target, 1e30, ['ErrorAbsolute']);
  const mat = new Map(); for (let t = 0; t < A.idx.length; t += 3) mat.set(A.idx[t], A.alpha[t / 3]);   // a triangle's stuff goes with its corners (a corner is of one stuff)
  return { pos: A.pos, idx: out, alpha: Float32Array.from({ length: out.length / 3 }, (_, t) => mat.get(out[t * 3]) ?? mat.get(out[t * 3 + 1]) ?? mat.get(out[t * 3 + 2]) ?? 1) };
}
/** What is a crowd, found: sixteen or more loose pieces of one stuff, each under a fiftieth of the thing's triangles.
    { crowds: Map(stuff -> pieces), rest: the other pieces }. */
function crowdsOf(A) {
  const pieces = piecesOf(A.pos.length / 3, A.idx), total = A.idx.length / 3, crowds = new Map(), rest = [];
  for (const p of pieces) { const a = A.alpha[p[0] / 3]; if (p.length < total / 50) { let c = crowds.get(a); if (!c) crowds.set(a, (c = [])); c.push(p); } else rest.push(p); }
  for (const [a, c] of [...crowds]) if (c.length < 16) { rest.push(...c); crowds.delete(a); }
  return { crowds, rest };
}
const partOf = (A, pieces) => { const idx = [], alpha = []; for (const p of pieces) for (const t of p) { idx.push(A.idx[t], A.idx[t + 1], A.idx[t + 2]); alpha.push(A.alpha[t / 3]); } return { pos: A.pos, idx: Uint32Array.from(idx), alpha: Float32Array.from(alpha) }; };
const foldPart = (A, pieces, keep) => { const R = partOf(A, pieces); return R.idx.length / 3 > 8 ? fold(R, keep) : R; };
const join = (pos, parts) => ({ pos, idx: Uint32Array.from(parts.flatMap((m) => [...m.idx])), alpha: Float32Array.from(parts.flatMap((m) => [...m.alpha])) });

/** Thinning one crowd: its pieces are sorted into classes by size (each class twice the area of the one before); within
    a class the order is fixed once and spread evenly (each next piece the one farthest from all taken so far), so any
    first share of it is a fair picture of the whole. Two ways to `keep` of the crowd's triangles: the smallest class
    is thinned first, then the next (larger classes are left as they are); or, `alike`, every class keeps the same
    share. Those that stay of a thinned class are to be enlarged about their outermost point (so they grow back into
    the crowd). -> { still: [piece], grown: [{ p, vs (its vertices), tip }] } */
function thinned(A, c, keep, alike) {
  const areaOf = (p) => { let s = 0; for (const t of p) { const i = A.idx[t] * 3, j = A.idx[t + 1] * 3, q = A.idx[t + 2] * 3, ux = A.pos[j] - A.pos[i], uy = A.pos[j + 1] - A.pos[i + 1], uz = A.pos[j + 2] - A.pos[i + 2], vx = A.pos[q] - A.pos[i], vy = A.pos[q + 1] - A.pos[i + 1], vz = A.pos[q + 2] - A.pos[i + 2]; s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return s; };
  const midOf = (p) => { const m = [0, 0, 0]; for (const t of p) for (let q = 0; q < 3; q++) { const v = A.idx[t + q] * 3; m[0] += A.pos[v]; m[1] += A.pos[v + 1]; m[2] += A.pos[v + 2]; } return m.map((x) => x / (p.length * 3)); };
  const evenly = (g) => { const n = g.length, M = g.map(midOf), d = new Float64Array(n).fill(Infinity), out = []; let at = Math.floor(rnd() * n); for (let i = 0; i < n; i++) { out.push(g[at]); d[at] = -1; let best = -1, far = -1; for (let j = 0; j < n; j++) { if (d[j] < 0) continue; const q = (M[j][0] - M[at][0]) ** 2 + (M[j][1] - M[at][1]) ** 2 + (M[j][2] - M[at][2]) ** 2; if (q < d[j]) d[j] = q; if (d[j] > far) { far = d[j]; best = j; } } at = best; } return out; };
  seed = 12345; const still = [], grown = [], mid = [0, 0, 0]; let n = 0;
  for (const p of c) for (const t of p) for (let k = 0; k < 3; k++) { const v = A.idx[t + k] * 3; mid[0] += A.pos[v]; mid[1] += A.pos[v + 1]; mid[2] += A.pos[v + 2]; n++; }
  mid[0] /= n; mid[1] /= n; mid[2] /= n;
  const tipped = (p) => { let far = -1, at = 0; const vs = new Set(); for (const t of p) for (let q = 0; q < 3; q++) { const v = A.idx[t + q]; vs.add(v); const d = (A.pos[v * 3] - mid[0]) ** 2 + (A.pos[v * 3 + 1] - mid[1]) ** 2 + (A.pos[v * 3 + 2] - mid[2]) ** 2; if (d > far) { far = d; at = v; } } return { p, vs: [...vs], tip: [A.pos[at * 3], A.pos[at * 3 + 1], A.pos[at * 3 + 2]] }; };
  const classes = new Map(); for (const p of c) { const k = Math.round(Math.log2(areaOf(p))); let g = classes.get(k); if (!g) classes.set(k, (g = [])); g.push(p); }
  const all = c.reduce((t, p) => t + p.length, 0); let over = all * (1 - keep);   // triangles still to go
  for (const k of [...classes.keys()].sort((x, y) => x - y)) {
    const g = EVEN ? evenly(classes.get(k)) : classes.get(k).map((p) => [rnd(), p]).sort((x, y) => x[0] - y[0]).map((x) => x[1]), tris = g.reduce((t, p) => t + p.length, 0);
    if (alike) { for (const p of g.slice(0, Math.round(g.length * keep))) grown.push(tipped(p)); continue; }
    if (over <= 0) { still.push(...g); continue; }
    const go = Math.min(over, tris), share = 1 - go / tris; over -= go;   // (a class may go altogether: the next larger one then stands for it)
    for (const p of g.slice(0, Math.round(g.length * share))) grown.push(tipped(p));
  }
  return { still, grown };
}

/** The builder's way with a thing that has crowds, told nothing of what they are: each crowd is tried folded, thinned
    the smallest first and thinned alike, with the rest of the thing left full, and takes the way the stick prefers at
    `px` (the whole thing's pictures: what stands before a crowd hides it). Those that stay of a thinned crowd are
    enlarged by the measure that keeps the crowd's own cover, the crowd drawn by itself. What is no crowd is folded.
    -> the thing at about `keep` of its triangles, and `ways`: what each crowd took. Null: it has no crowd. */
function built(A, keep, Fpics, frame, px) {
  const { crowds, rest } = crowdsOf(A); if (!crowds.size) return null;
  const P = Float32Array.from(A.pos), parts = [], ways = [];
  if (rest.length) parts.push(foldPart(A, rest, keep));
  for (const [a, c] of crowds) {
    const others = partOf(A, [...rest, ...[...crowds].filter(([b]) => b !== a).flatMap(([, d]) => d)]), own = partOf(A, c), want = meanOf(pictures(A.pos, own.idx, own.alpha, frame));
    const whole = (pos, part) => { const J = join(pos, [others, part]); return pictures(pos, J.idx, J.alpha, frame); };
    const what = a === 1 ? 'the solid pieces' : 'the cut-out pieces', tries = [{ way: `${what} folded`, part: foldPart(A, c, keep), move: (into) => into }];
    for (const alike of [false, true]) {
      const { still, grown } = thinned(A, c, keep, alike), kept = partOf(A, [...still, ...grown.map((g) => g.p)]); if (!kept.idx.length) continue;
      const moved = (k, into) => { for (const { vs, tip } of grown) for (const v of vs) for (let q = 0; q < 3; q++) into[v * 3 + q] = tip[q] + (A.pos[v * 3 + q] - tip[q]) * k; return into; };
      const cover = (k) => meanOf(pictures(moved(k, Float32Array.from(A.pos)), kept.idx, kept.alpha, frame));
      let lo = 1, hi = 1.6 / Math.sqrt(keep), k = 1;
      if (grown.length) { while (hi < 32 && cover(hi) < want) { lo = hi; hi *= 1.6; } for (let i = 0; i < 8; i++) { k = (lo + hi) / 2; if (cover(k) > want) hi = k; else lo = k; } k = (lo + hi) / 2; }
      tries.push({ way: `${what} thinned${alike ? ' alike' : ', the smallest first'}, enlarged ${fx(k)} x`, part: kept, move: (into) => moved(k, into) });
    }
    let best = null; for (const t of tries) { t.is = stick(Fpics, whole(t.move(Float32Array.from(A.pos)), t.part), frame, px); if (!best || score(t.is) < score(best.is)) best = t; }
    best.move(P); parts.push(best.part); ways.push(best.way);
  }
  return { ...join(P, parts), ways: ways.join('; ') };
}

/** A hull: a closed body that stands for pieces (four ways round by one ring and two poles: 8 triangles; five by two,
    20; six by three, 36), as far out each way as nearly all of them reach (reckoned in their own proportions: a flat
    crowd gets a flat hull), of the stuff most of them are of. With
    `room` triangles in all it is tried round all of the thing and round its largest crowd (the other pieces folded
    into what room is left beside it), in the largest size that fits and the one under it, and each either see-through
    (by as much as keeps the thing's cover) or solid and smaller (by as much as keeps it). The stick at `px` says
    which. -> the thing so, `what` it is and how the stick finds it (`is`); null: no room for the smallest. */
function hull(A, Fpics, frame, room, px) {
  const { crowds, rest } = crowdsOf(A), every = [...rest, ...[...crowds.values()].flat()], want = meanOf(Fpics), none = { idx: new Uint32Array(0), alpha: new Float32Array(0) }, trisIn = (c) => c.reduce((t, p) => t + p.length, 0);
  const sets = [[every, [], 'round all of it']];
  if (crowds.size) { const big = [...crowds.values()].sort((x, y) => trisIn(y) - trisIn(x))[0], inBig = new Set(big); sets.push([big, every.filter((p) => !inBig.has(p)), 'round its largest crowd']); }
  const cover = (m) => meanOf(pictures(m.pos, m.idx, m.alpha, frame));
  let best = null; const consider = (m, what) => { const is = stick(Fpics, pictures(m.pos, m.idx, m.alpha, frame), frame, px); if (!best || score(is) < score(best.is)) best = { ...m, what, is }; };
  for (const [NS, NR] of [[4, 1], [5, 2], [6, 3]].filter(([a, b]) => a * b * 2 <= room * 1.01).slice(-2)) for (const [of, others, where] of sets) {
    const left = room - NS * NR * 2, beside = others.length && left >= 4 ? foldPart(A, others, Math.min(1, left / trisIn(others))) : none;
    const vs = new Set(); let solidTris = 0, tris = 0; for (const p of of) for (const t of p) { tris++; if (A.alpha[t / 3] === 1) solidTris++; for (let q = 0; q < 3; q++) vs.add(A.idx[t + q]); }
    const solid = solidTris * 2 > tris, mid = [0, 0, 0]; for (const v of vs) { mid[0] += A.pos[v * 3]; mid[1] += A.pos[v * 3 + 1]; mid[2] += A.pos[v * 3 + 2]; } mid[0] /= vs.size; mid[1] /= vs.size; mid[2] /= vs.size;
    // (measured in the pieces' own proportions: how far they spread along each axis is taken as one, so a flat crowd gets a flat hull and a tall one a tall one)
    const sd = [0, 0, 0]; for (const v of vs) for (let q = 0; q < 3; q++) sd[q] += (A.pos[v * 3 + q] - mid[q]) ** 2; for (let q = 0; q < 3; q++) sd[q] = Math.sqrt(sd[q] / vs.size) || 1e-9;
    const reach = Array.from({ length: (NR + 2) * NS }, () => []), ringOf = (y) => Math.min(NR + 1, Math.floor(((Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI) + 0.5) * (NR + 2)));
    const all = []; for (const v of vs) { const x = (A.pos[v * 3] - mid[0]) / sd[0], y = (A.pos[v * 3 + 1] - mid[1]) / sd[1], z = (A.pos[v * 3 + 2] - mid[2]) / sd[2], l = Math.hypot(x, y, z) || 1e-9; all.push(l); reach[ringOf(y / l) * NS + (Math.floor((Math.atan2(z, x) / (2 * Math.PI) + 1) * NS) % NS)].push(l); }
    all.sort((x, y) => x - y); const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))];
    const R = reach.map((a) => (a.length >= 4 ? pct(a.sort((x, y) => x - y), 0.95) : null)), rAt = (ring, k) => R[ring * NS + ((k + NS) % NS)] ?? pct(all, 0.5);
    // its corners, from its middle: a ring of NS at each of NR heights between the poles, each as far out as its sector reaches
    const off = [], first = A.pos.length / 3, put = (x, y, z) => { off.push(x * sd[0], y * sd[1], z * sd[2]); return first + off.length / 3 - 1; }, lat = (i) => (((i + 1.5) / (NR + 2)) - 0.5) * Math.PI, rings = [];
    for (let i = 0; i < NR; i++) { const ring = []; for (let k = 0; k < NS; k++) { const a = ((k + 0.5) / NS) * 2 * Math.PI, r = rAt(i + 1, k); ring.push(put(Math.cos(lat(i)) * Math.cos(a) * r, Math.sin(lat(i)) * r, Math.cos(lat(i)) * Math.sin(a) * r)); } rings.push(ring); }
    const poleR = (ring) => { const a = reach.slice(ring * NS, ring * NS + NS).flat().sort((x, y) => x - y); return a.length >= 4 ? pct(a, 0.95) : pct(all, 0.5); }, south = put(0, -poleR(0), 0), north = put(0, poleR(NR + 1), 0);
    const hidx = []; for (let k = 0; k < NS; k++) { const j = (k + 1) % NS; hidx.push(south, rings[0][j], rings[0][k], north, rings[NR - 1][k], rings[NR - 1][j]); for (let i = 0; i < NR - 1; i++) hidx.push(rings[i][k], rings[i][j], rings[i + 1][j], rings[i][k], rings[i + 1][j], rings[i + 1][k]); }
    const idx = Uint32Array.from([...beside.idx, ...hidx]);
    const made = (alpha, size) => { const pos = new Float32Array(A.pos.length + off.length); pos.set(A.pos); for (let i = 0; i < off.length; i++) pos[A.pos.length + i] = mid[i % 3] + off[i] * size; return { pos, idx, alpha: Float32Array.from([...beside.alpha, ...new Array(hidx.length / 3).fill(alpha)]) }; };
    const through = (a) => (solid ? -1 : 1) * (1 - Math.sqrt(1 - a));   // (a ray goes through its front and its back: each lets through what together makes a)
    { let lo = 0.02, hi = 1; for (let i = 0; i < 7; i++) { const a = (lo + hi) / 2; if (cover(made(through(a), 1)) > want) hi = a; else lo = a; } const a = (lo + hi) / 2; consider(made(through(a), 1), `a hull of ${NS * NR * 2} ${where} that stops ${pc(a)} of the light`); }
    { let lo = 0.3, hi = 1.5; for (let i = 0; i < 7; i++) { const k = (lo + hi) / 2; if (cover(made(solid ? 1 : 0.999, k)) > want) hi = k; else lo = k; } const k = (lo + hi) / 2; consider(made(solid ? 1 : 0.999, k), `a solid hull of ${NS * NR * 2} ${where}, ${fx(k)} of its reach`); }
  }
  return best;
}

// ---- the things: each as { name, size said, pos (its size 1), idx, alpha a triangle, hand: today's levels } ----
async function load(which) {
  if (which === 'boulder') {
    const boulder = (await imp(`${GAME}/assets/boulder.js`)).default;
    const at = (l) => { const m = rockMesh(boulder, 0, l), n = m.verts.length / 4, P = new Float32Array(n * 3); for (let v = 0; v < n; v++) P.set(unpackSolid(m.verts, v * 4, LADDER[l].delta).p, v * 3); return { pos: P, idx: m.index, alpha: new Float32Array(m.index.length / 3).fill(1) }; };
    return { name: 'Boulder', ...at(0), hand: LADDER.slice(1).filter((L) => L.n !== DOTN).map((L, i) => ({ name: `ladder ${L.n}`, from: LADDER[i].px, ...at(i + 1) })) };
  }
  if (which === 'tent') {
    const tent = (await imp(`${GAME}/assets/belltent.js`)).default, span = Math.max(tent.size.length, tent.size.width, tent.size.height), PX = kindRule(tent, 'px');
    const at = (faces) => { const P = new Float32Array(faces.length * 9); faces.forEach((f, i) => { for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) P[i * 9 + c * 3 + k] = f[c][k] / span; }); const idx = S.generatePositionRemap(P, 3), [remap, n] = S.compactMesh(idx), Q = new Float32Array(n * 3); for (let i = 0; i < remap.length; i++) { const v = remap[i]; if (v !== 0xffffffff) { Q[v * 3] = P[i * 3]; Q[v * 3 + 1] = P[i * 3 + 1]; Q[v * 3 + 2] = P[i * 3 + 2]; } } const keep = []; for (let t = 0; t < idx.length; t += 3) if (idx[t] !== idx[t + 1] && idx[t + 1] !== idx[t + 2] && idx[t] !== idx[t + 2]) keep.push(idx[t], idx[t + 1], idx[t + 2]); return { pos: Q, idx: Uint32Array.from(keep), alpha: new Float32Array(keep.length / 3).fill(1) }; };
    const L = tent.detail.levels.map((l) => at(l.faces));
    return { name: 'Bell tent', ...L[0], hand: L.slice(1).map((m, i) => ({ name: `level ${i + 1}`, from: PX[i], ...m })) };
  }
  const asset = (await imp(`${GAME}/assets/${which}.js`)).default, fine = asset.fine ? 1 : 0, shape = asset.kind === 'tree' ? asset.shapeCount - 1 : 0;
  const size = (m) => { let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < m.position.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], m.position[i + a]); hi[a] = Math.max(hi[a], m.position[i + a]); } return kindRule(asset, 'measure') === 'height' ? hi[1] : Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]); };
  const near = asset.rawAt(fine, shape), sz = size(near), pxList = asset.detail?.px || kindRule(asset, 'px'), endOf = (l) => asset.detail.levels[l]?.px ?? pxList[Math.min(l, pxList.length - 1)];
  const at = (m) => ({ pos: Float32Array.from(m.position, (x) => x / sz), idx: Uint32Array.from(m.index), alpha: Float32Array.from({ length: m.index.length / 3 }, (_, t) => { const p = m.part[m.index[t * 3]]; return p > 1.5 ? 0.999 : p > 0.5 ? CARD_TRI : 1; }) });   // (wood stops all the light; a crown as one solid body all but: told apart from wood by that)
  const hand = []; for (let l = fine + 1; l < asset.levelCount; l++) { const m = asset.rawAt(l, shape); hand.push({ name: m.part.some((p) => p > 1.5) ? (m.index.length / 3 <= 8 ? 'its speck' : 'its far body') : `level ${l - fine}`, from: endOf(l - 1), ...at(m) }); }
  return { name: asset.name, ...at(near), hand };
}

const fx = (x, d = 2) => x.toFixed(d), pc = (x) => `${Math.round(100 * x)} %`;
const score = (r) => Math.abs(r.outline - 1) + r.mean + r.worst / 4;   // what chooses between two ways: how far the outline is off, a neighbourhood on average, and (a quarter) at its worst
const say = (r) => `outline ${pc(r.outline).padStart(5)}, a neighbourhood off by ${pc(r.mean).padStart(4)} (worst ${pc(r.worst).padStart(4)})`;
for (const which of WHICH.split(',')) {
  const t0 = performance.now(), A = await load(which), V = A.pos.length / 3, T = A.idx.length / 3, EXPORT = process.env.EXPORT ? { levels: [] } : null;
  // (for a picture: a thing's triangles one by one, with how much of the light each stops)
  const soup = (m) => { const p = [], a = []; for (let t = 0; t < m.idx.length; t += 3) { for (let q = 0; q < 3; q++) { const v = m.idx[t + q] * 3; p.push(+m.pos[v].toFixed(4), +m.pos[v + 1].toFixed(4), +m.pos[v + 2].toFixed(4)); } a.push(+m.alpha[t / 3].toFixed(3)); } return { p, a }; };
  let c = [0, 0, 0], r = 0; for (let i = 0; i < A.pos.length; i += 3) { c[0] += A.pos[i]; c[1] += A.pos[i + 1]; c[2] += A.pos[i + 2]; } c = c.map((x) => x / V);
  for (let i = 0; i < A.pos.length; i += 3) r = Math.max(r, Math.hypot(A.pos[i] - c[0], A.pos[i + 1] - c[1], A.pos[i + 2] - c[2]));
  const frame = { c, r: r * 1.1 }, F = pictures(A.pos, A.idx, A.alpha, frame), pieces = piecesOf(V, A.idx), pic = (m) => pictures(m.pos, m.idx, m.alpha, frame);
  console.log(`\n== ${A.name}: ${T} triangles in ${pieces.length} piece${pieces.length > 1 ? 's' : ''}, ${pieces.filter((p) => p.length < T / 50).length} of them under a fiftieth of it`);
  // 1. which way loses less, at the same triangles, at the size such a share would be drawn at (triangles go by the square of the size; all of them at 512 px)
  if (!process.env.BUDGET) console.log('   1. two ways to a share of its triangles, measured at the size on screen that share would be drawn at');
  for (const keep of process.env.BUDGET ? [] : [0.5, 0.25, 0.1, 0.04]) {
    const px = 512 * Math.sqrt(keep), a = fold(A, keep), ea = stick(F, pic(a), frame, px), b = built(A, keep, F, frame, px), eb = b ? stick(F, pic(b), frame, px) : null;
    const pick = !b || score(ea) <= score(eb) ? 'folding it all' : 'crowd by crowd';
    console.log(`      ${String(keep * 100).padStart(3)} % at ${String(Math.round(px)).padStart(3)} px | folding it all (${String(a.idx.length / 3).padStart(6)}): ${say(ea)} | ${b ? `crowd by crowd (${String(b.idx.length / 3).padStart(6)}; ${b.ways}): ${say(eb)}` : 'no crowd in it'} | the stick chooses ${pick}`);
  }
  // 2. today's levels on the same stick at the size each is first drawn at, beside the better way at the same triangles
  if (!process.env.BUDGET) console.log('   2. today\'s levels at the size each is first drawn at, and the best of the ways with about as many triangles');
  for (const H of process.env.BUDGET ? [] : A.hand) {
    const eh = stick(F, pic(H), frame, H.from), keep = Math.min(1, (H.idx.length / 3) / T);
    const a = fold(A, keep), ea = stick(F, pic(a), frame, H.from), b = keep < 0.9 ? built(A, keep, F, frame, H.from) : null, eb = b ? stick(F, pic(b), frame, H.from) : null; let pick = !b || score(ea) <= score(eb) ? ['folding it all', ea, a] : [b.ways, eb, b];
    if (H.idx.length / 3 <= 400) { const h = hull(A, F, frame, H.idx.length / 3, H.from); if (h && score(h.is) < score(pick[1])) pick = [h.what, h.is, h]; }   // (a level this small: a hull is tried too, with no more than the level's triangles)
    if (EXPORT) EXPORT.levels.push({ name: H.name, from: H.from, today: soup(H), todayTris: H.idx.length / 3, todayIs: eh, way: pick[0], auto: soup(pick[2]), autoTris: pick[2].idx.length / 3, autoIs: pick[1] });
    console.log(`      ${H.name.padEnd(13)} from ${String(H.from).padStart(4)} px, ${String(H.idx.length / 3).padStart(6)} triangles | today: ${say(eh)} | ${pick[0]} (${pick[2].idx.length / 3}): ${say(pick[1])}`);
  }
  // 3. BUDGET=1: the same triangles as today in all, spread so that they follow the size on screen. Things of a kind
  // standing evenly over the ground, as many again at every doubling of the distance squared: of sizes px there are
  // as px^-3. Today a level's triangles are the same over its whole band; here they go as the size squared, all of
  // them down to where the sum is today's.
  if (process.env.BUDGET && A.hand.length) {
    const bands = [{ from: 600, tris: T, mesh: A }, ...A.hand.map((H) => ({ from: H.from, tris: H.idx.length / 3, mesh: H }))], end = bands.at(-1).from / 2;   // (the nearest level's band taken from 600 px; the last level's down to half its start)
    const w = (a, b) => 0.5 * (b ** -2 - a ** -2);   // how many things lie between sizes a > b
    let today = 0; bands.forEach((B, i) => { today += B.tris * w(B.from, bands[i + 1]?.from ?? end); });
    const LEAST = Math.min(T, 8), trisAt = (px, full) => Math.max(LEAST, Math.min(T, T * (px / full) ** 2));   // (never under eight triangles: the smallest closed body made here; today's speck has as many)
    const sum = (full) => { let s = 0; const n = 4000, r = Math.log(600 / end) / n; for (let i = 0; i < n; i++) { const px = end * Math.exp((i + 0.5) * r); s += trisAt(px, full) * px ** -3 * px * r; } return s; }; let lo = end, hi = 6000;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (sum(m) > today) lo = m; else hi = m; }   // all its triangles down to `full` px, then by the square
    const full = (lo + hi) / 2, levelAt = (px) => bands.findLast((B) => B.from >= px) ?? bands[0];
    console.log(`   3. the same triangles in all (things spread evenly over the ground): today ${bands.map((B) => `${B.tris} from ${B.from} px`).join(', ')}; spread by size: all ${T} down to ${Math.round(full)} px, then by the square of the size, never under ${LEAST}`);
    const sizes = [], rows = []; for (let px = 400; px >= end * 1.01; px /= 1.35) sizes.push(px);
    for (const px of sizes) {
      const B = levelAt(px), eh = B.mesh === A ? { outline: 1, mean: 0, worst: 0 } : stick(F, pic(B.mesh), frame, px), keep = trisAt(px, full) / T;
      let m = A, pickd = 'all of it';
      if (keep < 0.98) { const a = fold(A, keep), b = built(A, keep, F, frame, px), ea0 = stick(F, pic(a), frame, px), eb0 = b ? stick(F, pic(b), frame, px) : null; if (!b || score(ea0) <= score(eb0)) { m = a; pickd = 'folding it all'; } else { m = b; pickd = b.ways; }
        if (keep * T <= 400) { const h = hull(A, F, frame, keep * T, px); if (h && score(h.is) < score(stick(F, pic(m), frame, px))) { m = h; pickd = h.what; } } }
      const en = m === A ? { outline: 1, mean: 0, worst: 0 } : stick(F, pic(m), frame, px); rows.push({ px, eh, en });
      console.log(`      at ${String(Math.round(px)).padStart(3)} px | today (${String(B.tris).padStart(6)} triangles): ${say(eh)} | spread (${String(m.idx.length / 3).padStart(6)}, ${pickd}): ${say(en)}`);
    }
    const mx = (f) => Math.max(...rows.map(f)), av = (f) => rows.reduce((t, r) => t + f(r), 0) / rows.length;
    console.log(`      over these sizes: a neighbourhood off on average ${pc(av((r) => r.eh.mean))} today, ${pc(av((r) => r.en.mean))} spread; at its most ${pc(mx((r) => r.eh.mean))} today, ${pc(mx((r) => r.en.mean))} spread; the outline off by at most ${pc(mx((r) => Math.abs(r.eh.outline - 1)))} today, ${pc(mx((r) => Math.abs(r.en.outline - 1)))} spread`);
  }
  if (EXPORT) { EXPORT.name = A.name; EXPORT.full = soup(A); EXPORT.fullTris = T; EXPORT.frame = frame; (await import('node:fs')).writeFileSync(`${process.env.EXPORT}-${which}.json`, JSON.stringify(EXPORT)); }
  console.log(`   (${Math.round(performance.now() - t0)} ms)`);
}
