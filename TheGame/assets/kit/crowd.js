// The crowd kit: the one builder of what stands in a stand (intents 0033 and 0038). A plant's file draws its plant once,
// as it is from near, out of parts (assets/kit/tree.js: wood as tubes, sprigs as prototypes laid by a rigid transform
// about a pivot, as Nanite's assemblies are). This turns that one build into everything the engine needs to draw the
// plant at any size on screen, told nothing of what kind of plant it is: it reads its parts (a sprig: its cards, four
// corners each, its tip and its root; a solid piece: its triangles and its foot) and nothing else. Plain JS, no three
// and nothing of the page: run in the recipes' worker, and by the library on the page.
//
// What it finds, and what the engine does with it. Each rung comes where its own error, measured here on the plant, is
// within the one ERROR_PX (src/detail/error.js switchPx); nothing here is a size on screen of its own:
//   - one spread order of the sprigs. Every sprig has its turn, and any first share of the turns is a fair picture of
//     the whole crown: the sprigs go by size into classes (each half the area of the one before, the largest first), and
//     within a class each next is the one farthest from all taken before (a blue-noise order). Its share error, drawing
//     the first t turns: the farthest a sprig left out lies from one drawn (turnsOf). A sprig is gone where that is within
//     ERROR_PX (its go), and those that stay are enlarged about their tips, uniformly, so the crown covers as much:
//         share = min(1, (px / P0)^A)            P0, A: through the ends of its measured thinning
//         k     = min(SWELL, area^-E)            area: the share of the cards' area the drawn sprigs are (areaAt)
//     E is measured on each shape: a thin crown needs more of it than a thick one, whose cards hide each other. A crown
//     whose share error is nowhere within its clumps' does not thin before they come;
//   - a solid piece is gone where leaving it out (its width) is within ERROR_PX, and shrinks to its foot. The solids'
//     corners are sorted thick first: a first share of the list is the thick wood;
//   - the clumps (NVIDIA HPG 2026, Simplygon's billboard clouds): the sprigs split into chunks by their boxes, the
//     largest first, into as many as cost no more than the sprigs still there where the crowd ends (twelve corners a
//     chunk: three crossed planes through its box's middle, each wearing its own leaves as the GPU bakes them,
//     src/detail/impostor.js). Their error is their bake's texel (TILE over a chunk's largest side). Over the window WIN
//     the last sprigs go one by one and the chunks grow in one by one, each where its own sprigs were;
//   - the impostor's frame: the sphere round the whole plant, from which the GPU bakes its views (one octahedral
//     impostor a shape, src/detail/impostor.js). Its error is its bake's texel too (CELL over the sphere's width: T,
//     src/scatter/trees.js meshShare); under `far.lo` a level holds nothing else. Where its views are as fine as the
//     clumps where they would come, it takes over from the crowd itself, and the shape has no clumps. A plant without a
//     far end (its kind's `far`, assets/kinds.js) has neither: its crowd goes by its share error to where it is gone.
//
//   crowd(mesh, { size, far }) -> a shape:
//     count, cards, parts, solids   its vertices; its cards (4 vertices each, corners 0 1 2, 0 2 3); its sprigs; its
//                                   pieces drawn by corners
//     position, normal, uv, part, ao, cn, root, twig (and whatever else the mesh carries a vertex)
//                                   as the kit made them, in a new order: the cards in turn order (a first share of
//                                   the list is a first share of the turns), then the solids, thick first. A
//                                   solid's root is its foot
//     go        a vertex, pixels    the size on screen under which its part is gone (0: never: thick wood, which
//                                   stays until the impostor takes it)
//     tip       a vertex, x y z     the point its part is enlarged about (a solid's: its foot)
//     index                         the solids' corners, into the list above, thick first
//     steps { go, corners, verts }  a piece drawn by corners each, in the list's order: its go, and how many corners
//                                   and vertices the list holds up to and with it (what is drawn at a size is a
//                                   first share of both)
//     turns { go, cards }           a sprig each, in turn order: its go, where its cards begin
//     meta      16 numbers          what the engine's one rule reads of a shape (META says which is which)
//     P0, E, A, size, mid, spread, classes, win { hi, lo }, cover, cell    the same by name, and what was measured
//                                   (cell: its impostor's views' texels a side)
//     sphere    [x, y, z, r]        the impostor's frame
//     far       { lo, data }        under lo pixels nothing but the impostor is drawn; data: what the GPU bakes the
//                                   shape's far end from (farData: the sphere and the chunks), carried by its finest level
//     clumps    { n, cells, boxes, go, order } or null    its chunks (cells: where their parts' tips lie, boxes: their
//                                   planes' frames, go: the size on screen under which each has come)
//
// The rule itself, for whoever draws (its twin is the vertex stage's, src/scatter/trees.js crowdRule): shareAt, areaAt,
// grownAt, and k as above.
import { BUDGET_DRAWN, switchPx } from '../../src/detail/error.js';
const { PI, sqrt, hypot, floor, ceil, round, min, max, abs, log, log2, pow } = Math;

/** Every number of the rule, in one place, as the plants are drawn. A plant's file has none of them, and none of them
    says where a rung comes: that is each rung's own error (above). */
export const CROWD = {
  A: 2,            // how fast a crowd's share falls, (px / P0)^A, where it does not thin before its clumps (else measured: fitOf)
  SWELL: 3,        // how many times a sprig that stays may be enlarged about its tip at most (2 to 3: a meadow's blades are doubled in width as they are halved in number, Ghost of Tsushima)
  E: 0.45,         // how much those that stay are enlarged: by (the share of the cards' area that is drawn)^-E. Measured on every shape that has cards enough to measure (EMIN … EMAX); this is for the others
  EMIN: 0.2, EMAX: 0.6,
  FIT: 0.04,       // … the second share it is measured at (as fewest LEAST parts): the larger E of the two
  LEAST: 8,        // a crowd of no more sprigs than this does not thin: they stay to its end
  WIN: 1.3,        // the clumps take over from their start down to this many times smaller: the last parts go one by one, the chunks grow in one by one
  GROW: 1.1,       // a part grows from its root between its `go` and this many times it (a chunk from its middle, between its `go` and this many times under it)
  CLASSES: 4,     // the most classes by size a crowd is sorted into (each half the area of the one before)
  CLUMPS: 256,     // the most chunks a plant's clumps are: 12 x CLUMPS vertices, 3 x CLUMPS tiles of its stand's layer
  VIEWS: 10,       // the impostor's views: VIEWS x VIEWS over the half-sphere above (hemi-octahedral), each CELL texels a side
  CELL: 128,
  TILE: 32,        // a chunk's plane: TILE texels a side, TILES x TILES of them a shape's layer
  TILES: 28,
  SWITCH: 0.72,    // a plant changes at a size of its own: its crowd and clumps are reckoned at this share of its size on screen up to all of it, by its own number (Lipp et al., HPG 2026: no two plants change together), and it is its impostor from between this share of T (the most pixels drawn its measured size may be, CELL texels of its sphere) and all of it (src/scatter/trees.js meshShare) …
  FADE: 0.15,      // … over the last FADE of the way down to it, the two cross-faded under the picture built over time
  RATIO: 3,        // the most pixels drawn to a pixel of the lens's measure (src/detail: pxK) a level is built for: under far.lo (where the last plant's cross-fade ends, at this ratio) the impostor is all there is
  STOPS: 1 - sqrt(1 - 0.45),         // how much of the light one triangle of a card stops (a sprig of two crossed cards: 45 %), where cover is reckoned
  PIC: 64,         // … in pictures of this many pixels a side, from thirteen sides
};
/** Where each of a shape's sixteen numbers lies in `meta`: P0, E, where the clumps begin and have taken over (pixels),
    the crown's middle (three), how many cards, where the classes 1, 2 and 3 begin (three pairs: the share of the
    parts before it, the share of the cards' area before it), the size it was built for (metres), how many parts. */
export const META = { P0: 0, E: 1, HI: 2, LO: 3, MID: 4, CARDS: 7, CLASSES: 8, SIZE: 14, PARTS: 15 };

// ---- the rule, as the vertex stage is to reckon it ----
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The share of a crowd's parts that is drawn at px pixels: all of them from P0 up. */
export const shareAt = (px, P0, A = CROWD.A) => min(1, pow(max(px, 0) / P0, A));
/** The share of the cards' area a first `share` of the parts is: the largest come first, so more than their share by
    count. `meta`: a shape's (its classes' bounds). */
export function areaAt(share, meta) {
  let s0 = 0, a0 = 0;
  for (let c = 0; c <= 3; c++) {
    const s1 = c < 3 ? meta[META.CLASSES + c * 2] : 1, a1 = c < 3 ? meta[META.CLASSES + c * 2 + 1] : 1;
    if (share <= s1 && s1 > s0) return a0 + ((a1 - a0) * (share - s0)) / (s1 - s0);
    s0 = s1; a0 = a1;
  }
  return 1;
}
/** How grown a part is at px pixels, 0 … 1: nothing under its `go`, all of it from GROW times that. */
export const grownAt = (px, go, GROW = CROWD.GROW) => (go > 0 ? smooth((px / go - 1) / (GROW - 1)) : 1);

// ---- cover: how much of its pictures a thing fills, reckoned as the measuring stick does (the probe of intent 0033:
// thirteen sides, a triangle stopping its share of the light, what lies behind showing through by what is left) ----
const SIDES = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]].map((d) => {
  const l = hypot(...d), w = d.map((x) => x / l), a = abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [a[1] * w[2] - a[2] * w[1], a[2] * w[0] - a[0] * w[2], a[0] * w[1] - a[1] * w[0]]; const ul = hypot(...u); u = u.map((x) => x / ul);
  return [...u, w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
});
/** The share of its pictures a thing covers. P its vertices (n of them), I its corners, stop how much of the light a
    triangle stops (by its first corner: a number a vertex), F the frame { c, r } the pictures are taken in, R their
    pixels a side. With `own` (0 or 1 a vertex) -> [all of it, the triangles by themselves whose first corner is 1]. */
function coverOf(P, n, I, stop, F, R, own = null) {
  const k = R / (2 * F.r), T = new Float32Array(R * R), T2 = own && new Float32Array(R * R), X = new Float32Array(n), Y = new Float32Array(n), [cx, cy, cz] = F.c; let sum = 0, sum2 = 0;
  for (const [ux, uy, uz, vx, vy, vz] of SIDES) {
    T.fill(1); if (own) T2.fill(1);
    for (let i = 0, p = 0; i < n; i++, p += 3) { const x = P[p] - cx, y = P[p + 1] - cy, z = P[p + 2] - cz; X[i] = (x * ux + y * uy + z * uz + F.r) * k - 0.5; Y[i] = (x * vx + y * vy + z * vz + F.r) * k - 0.5; }
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2], X0 = X[a], Y0 = Y[a], X1 = X[b], Y1 = Y[b], X2 = X[c], Y2 = Y[c];
      const x0 = max(0, ceil(min(X0, X1, X2))), x1 = min(R - 1, floor(max(X0, X1, X2))), y0 = max(0, ceil(min(Y0, Y1, Y2))), y1 = min(R - 1, floor(max(Y0, Y1, Y2)));
      if (x1 < x0 || y1 < y0) continue;   // (no pixel's middle in it: most twigs)
      const keep = 1 - stop[a], two = own && own[a], ax = X1 - X0, ay = Y1 - Y0, bx = X2 - X1, by = Y2 - Y1, gx = X0 - X2, gy = Y0 - Y2;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const e0 = ax * (y - Y0) - ay * (x - X0), e1 = bx * (y - Y1) - by * (x - X1), e2 = gx * (y - Y2) - gy * (x - X2);
        if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) { T[y * R + x] *= keep; if (two) T2[y * R + x] *= keep; }
      }
    }
    for (let i = 0; i < T.length; i++) sum += 1 - T[i];
    if (own) for (let i = 0; i < T.length; i++) sum2 += 1 - T2[i];
  }
  const all = sum / (SIDES.length * R * R);
  return own ? [all, sum2 / (SIDES.length * R * R)] : all;
}
/** The x at which a measure that rises with x (f) reaches `want`, to half a hundredth of it: from a first guess x0,
    stepping by how the measure answered (`by`: the power it is taken to rise with at first). */
function reaching(f, want, x0, by) {
  let c0 = f(x0), x1 = x0 * pow(want / max(c0, 1e-12), 1 / by), c1 = f(x1);
  for (let i = 0; i < 3 && abs(c1 / want - 1) > 0.005; i++) {
    const s = abs(x1 / x0 - 1) > 1e-6 && c1 !== c0 ? log(c1 / c0) / log(x1 / x0) : by, x2 = x1 * pow(want / c1, 1 / min(4 * by, max(by / 4, s)));
    x0 = x1; c0 = c1; x1 = x2; c1 = f(x1);
  }
  return x1;
}

// ---- the order: each next part the one farthest from all taken before, the classes one after another ----
/** X, Y, Z the parts' middles, cls their classes, mid the crowd's middle -> the parts in turn order. The first is the
    part of the first class farthest from the middle: the turns begin at the crown's rim, and a first few of them are
    its outline. And its share error, `err` (metres): err[t], the farthest any part left out lies from one drawn when
    the first t turns are drawn (err[0] none drawn, Infinity; err[n] 0), never more as more are drawn. */
function turnsOf(X, Y, Z, cls, mid) {
  const n = cls.length, rest = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => cls[a] - cls[b] || a - b), d = new Float64Array(n).fill(Infinity), out = new Uint32Array(n), err = new Float64Array(n + 1);
  let lo = 0, hi = 0, at = -1, far = -1;
  const endOf = (c) => { let e = lo; while (e < n && cls[rest[e]] === c) e++; return e; };
  if (n) { hi = endOf(cls[rest[0]]); for (let j = 0; j < hi; j++) { const p = rest[j], q = (X[p] - mid[0]) ** 2 + (Y[p] - mid[1]) ** 2 + (Z[p] - mid[2]) ** 2; if (q > far) { far = q; at = j; } } }
  err[0] = Infinity;
  for (let s = 0; s < n; s++) {
    const p = rest[at], px = X[p], py = Y[p], pz = Z[p]; out[s] = p; rest[at] = rest[lo]; rest[lo++] = p;
    if (lo === hi && lo < n) hi = endOf(cls[rest[lo]]);   // (a class is through: the next, by how far its parts lie from all that are taken)
    far = -1; let worst = 0;
    for (let j = lo; j < n; j++) { const r = rest[j], q = (X[r] - px) ** 2 + (Y[r] - py) ** 2 + (Z[r] - pz) ** 2; if (q < d[r]) d[r] = q; if (d[r] > worst) worst = d[r]; if (j < hi && d[r] > far) { far = d[r]; at = j; } }
    err[s + 1] = sqrt(worst);   // (of every part not yet taken, whatever its class: the farthest from all that are)
  }
  out.err = err;
  return out;
}

/** What every reckoning of a shape begins with: its parts as the recipe laid them (assets/kit/tree.js: m.parts), the
    sprigs (each its cards, four vertices a card) and the solid pieces (a tube; and whatever was laid without a part, as
    one piece that stays), their areas, the spread order of the sprigs (turnsOf) and their classes, and where the crowd
    ends: the sprigs still there (M), the clumps that take over from them, and the size on screen they do it at. Cheap:
    no picture is taken (budgetOf reads it at a start, crowd builds on it). */
function headOf(m, K) {
  const P = m.position, I = m.index, n = m.part.length;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], mean = [0, 0, 0];
  for (let p = 0; p < n * 3; p += 3) for (let a = 0; a < 3; a++) { const x = P[p + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; mean[a] += x / n; }
  const size = K.size ?? max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  let far = 0; for (let p = 0; p < n * 3; p += 3) far = max(far, (P[p] - mean[0]) ** 2 + (P[p + 1] - mean[1]) ** 2 + (P[p + 2] - mean[2]) ** 2);
  const frame = { c: mean, r: sqrt(far) * 1.1 || 1 };   // (what its cover is reckoned in: all of it, and a little round it)
  const areaOf = (tris) => { let a = 0; for (const t of tris) { const i = I[t] * 3, j = I[t + 1] * 3, k = I[t + 2] * 3, ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2], vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2]; a += hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return a; };
  const range = (a, b, step = 1) => Array.from({ length: max(0, ceil((b - a) / step)) }, (_, i) => a + i * step);
  // ---- its parts: as laid ----
  const sprigs = [], solids = [], mine = new Uint8Array(I.length);
  for (const q of m.parts ?? []) {
    mine.fill(1, q.i0, q.i1);
    const tris = range(q.i0, q.i1, 3), verts = range(q.v0, q.v1);
    if (!q.tip) { solids.push({ verts, tris, foot: q.foot, area: areaOf(tris) }); continue; }
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const v of verts) for (let a = 0; a < 3; a++) { box[a] = min(box[a], P[v * 3 + a]); box[a + 3] = max(box[a + 3], P[v * 3 + a]); }
    sprigs.push({ verts, tris, tip: q.tip, cards: (q.v1 - q.v0) / 4, area: areaOf(tris), box });
  }
  { const rest = range(0, I.length, 3).filter((t) => !mine[t]); if (rest.length) solids.push({ verts: [...new Set(rest.flatMap((t) => [I[t], I[t + 1], I[t + 2]]))], tris: rest, foot: [0, 0, 0], stays: true, area: areaOf(rest) }); }
  const N = sprigs.length;
  // ---- the spread order: by size into classes, the farthest from all taken before within a class ----
  const mid = [0, 0, 0], sd = [0, 0, 0], X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N); let nC = 0;
  sprigs.forEach((q, p) => { for (const v of q.verts) { X[p] += P[v * 3] / q.verts.length; Y[p] += P[v * 3 + 1] / q.verts.length; Z[p] += P[v * 3 + 2] / q.verts.length; for (let a = 0; a < 3; a++) mid[a] += P[v * 3 + a]; nC++; } });
  for (let a = 0; a < 3; a++) mid[a] /= max(1, nC);
  for (const q of sprigs) for (const v of q.verts) for (let a = 0; a < 3; a++) sd[a] += (P[v * 3 + a] - mid[a]) ** 2;
  for (let a = 0; a < 3; a++) sd[a] = sqrt(sd[a] / max(1, nC)) || 1e-9;
  let amax = 0, atot = 0; for (const q of sprigs) { amax = max(amax, q.area); atot += q.area; }
  const cls = Uint8Array.from(sprigs, (q) => (K.order === 'alike' ? 0 : min(K.CLASSES - 1, floor(log2(amax / q.area) + 1e-6))));
  const order = turnsOf(X, Y, Z, cls, mid), meta = new Float32Array(16), classes = [];
  { let s = 0, a = 0, at = 0; for (let c = 1; c < 4; c++) { while (at < N && cls[order[at]] < c) { s++; a += sprigs[order[at++]].area; } classes.push([N ? s / N : 1, atot ? a / atot : 1]); meta.set(classes[c - 1], META.CLASSES + (c - 1) * 2); } }
  // ---- the impostor's frame: the sphere round all of it ----
  const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2); let r2 = 0;
  for (let p = 0; p < n * 3; p += 3) r2 = max(r2, (P[p] - centre[0]) ** 2 + (P[p + 1] - centre[1]) ** 2 + (P[p + 2] - centre[2]) ** 2);
  const sphere = [...centre, sqrt(r2) || 1];
  // ---- each sprig's own go: where leaving it out, and every turn after it, is within ERROR_PX (its share error); a crowd
  // too few to thin (LEAST) keeps them all ----
  const thins = N > K.LEAST, withFar = K.far !== false, own = Float64Array.from({ length: N }, (_, t) => (thins ? switchPx(order.err[t] / size) : 0));
  const endAt = (px) => { let t = 0; while (t < N && own[t] < px) t++; return t; };   // (the sprigs still there at px: own is never less as the turns go on)
  // ---- where the crowd ends: its clumps or its impostor, each where its bake's texel is within ERROR_PX ----
  // the impostor's views as many texels a side as twice the root of the clumps' triangles (where they would draw them
  // smaller than a 2 x 2 quad of pixels over the plant's square), a power of two from 64 up to CELL (cellOf); from a crowd
  // at its end, as fine as they come (CELL). The clumps: as many chunks as cost no more than the sprigs still there where
  // the crowd ends (first all of them, then those its clumps leave). A shape whose impostor is as fine there already hands
  // its crowd over to it, and has no clumps; a plant without a far end has neither, and nothing takes its crowd (win 0)
  const cellOf = (tris) => min(K.CELL, max(K.CELL >> 1, 2 ** ceil(log2(2 * sqrt(max(tris, 1)) - 1e-9)))), Tof = (cell) => switchPx((2 * sphere[3]) / (cell * size));
  const endOf = (M0) => {
    let cornersM = 0; for (let t = 0; t < M0; t++) cornersM += sprigs[order[t]].cards * 4;
    const chunks = withFar && thins ? chunksOf(sprigs, max(1, min(K.CLUMPS, floor(cornersM / 12))), K.grid) : null;
    const side = chunks ? max(...chunks.map((C) => max(C.box[3] - C.box[0], C.box[4] - C.box[1], C.box[5] - C.box[2]))) : Infinity;
    const pxC = switchPx(side / (K.TILE * size)), clumpy = !!chunks && pxC > Tof(cellOf(chunks.length * 6)), cell = clumpy ? cellOf(chunks.length * 6) : K.CELL, T = withFar ? Tof(cell) : 0;
    const win = { hi: clumpy ? pxC : T, lo: 0 }; win.lo = win.hi / K.WIN;
    return { chunks: clumpy ? chunks : null, cell, T, win, M: endAt(win.hi) };
  };
  let E0 = endOf(N); if (E0.M < N) E0 = endOf(E0.M);
  const { chunks, cell, T, win } = E0, M = endAt(win.hi);
  // every sprig's go: the last M (still there where the crowd ends) one by one over the clumps' window, or, with no
  // clumps, staying till the impostor takes them; the rest their own. The GPU's share, (px / P0)^A, through the ends of
  // the thinning: all of it where its first sprig goes, M of N where it ends (one that hardly thins: A small)
  const go = Float32Array.from({ length: N }, (_, t) => (t < M ? (chunks ? win.lo * pow(K.WIN, (t + 0.5) / M) : 0) : own[t]));
  let P0 = max(win.hi, 1e-3), A = K.A;
  if (M < N && own[N - 1] > 0) {
    const t1 = max(M, endAt(1e-9)), s1 = max(t1, 1) / N, p1 = max(own[min(t1, N - 1)], 1e-6);
    P0 = own[N - 1]; if (p1 < P0 && s1 < 1) A = min(4, max(1e-3, log(s1) / log(p1 / P0)));
  }
  return { lo, hi, mean, size, frame, sprigs, solids, N, M, mid, sd, order, meta, classes, atot, sphere, cell, T, chunks, win, P0, A, go, far: withFar };
}
/** A crowd's sprigs in chunks: split by their boxes, the chunk of the largest box first, at the middle of its sprigs'
    tips along its longest side, until there are `want` of them (or none can be split). A chunk is whole sprigs: its
    cell, where their tips lie (each side [lo, hi), the tips as the GPU reads them back: grid), says which are its own
    where the GPU bakes it (src/detail/impostor.js); its box, where their corners lie, is its planes' frame. */
function chunksOf(sprigs, want, grid) {
  const N = sprigs.length, box = new Float64Array(N * 6), T = new Float64Array(N * 3);
  sprigs.forEach((q, p) => { box.set(q.box, p * 6); for (let a = 0; a < 3; a++) T[p * 3 + a] = grid ? grid(q.tip[a], a) : q.tip[a]; });
  const chunk = (parts, cell) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of parts) for (let a = 0; a < 3; a++) { b[a] = min(b[a], box[p * 6 + a]); b[a + 3] = max(b[a + 3], box[p * 6 + 3 + a]); }
    return { parts, cell, box: b, err: max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) };
  };
  const all = [chunk(Array.from({ length: N }, (_, p) => p), [-1e4, -1e4, -1e4, 1e4, 1e4, 1e4])];
  while (all.length < want) {
    let w = -1; for (let c = 0; c < all.length; c++) if (all[c].parts.length > 1 && all[c].err > 0 && (w < 0 || all[c].err > all[w].err)) w = c;
    if (w < 0) break;
    const C = all[w], b = C.box, axes = [0, 1, 2].sort((x, y) => b[y + 3] - b[y] - (b[x + 3] - b[x]));
    let split = null, ax = 0;
    for (const a of axes) {   // (along its longest side, half way between the middle tip and the next that differs; else the next longest)
      const vals = C.parts.map((p) => T[p * 3 + a]).sort((x, y) => x - y), h = vals.length >> 1;
      let k = h; while (k > 0 && vals[k - 1] === vals[k]) k--;
      if (!k) { k = h; while (k < vals.length && vals[k] === vals[h]) k++; }
      if (k > 0 && k < vals.length) { split = (vals[k - 1] + vals[k]) / 2; ax = a; break; }
    }
    if (split === null) { C.err = 0; continue; }
    const cl = C.cell.slice(), cr = C.cell.slice(); cl[ax + 3] = split; cr[ax] = split;
    all.splice(w, 1, chunk(C.parts.filter((p) => T[p * 3 + ax] < split), cl), chunk(C.parts.filter((p) => T[p * 3 + ax] >= split), cr));
  }
  return all;
}

/** What a shape may submit at most at each of the sizes on screen `his` (pixels; Infinity: all of it), without
    building it: a level's room in the heap (src/scatter/trees.js). -> [{ verts, tris }] (its first vertex is its
    numbers: assets/kit/plant.js) */
export function budgetOf(m, opts = {}, his = [Infinity]) {
  const K = { ...CROWD, ...opts }, H = headOf(m, K), go = H.go;
  let sv = 0, st = 0; for (const q of H.solids) { sv += q.verts.length; st += q.tris.length; }
  // (its finest level carries its far data, every other its chunks' planes where they can come; a level wholly under
  // far.lo nothing but its numbers)
  const farLo = farLoOf(H, K), p = H.chunks ? H.chunks.length * 3 : 0;
  return Object.assign(his.map((hi) => {
    if (hi <= farLo) return { verts: 1, tris: 0 };
    let cards = 0; for (let t = 0; t < H.N; t++) if (go[t] < hi * K.WIN) cards += H.sprigs[H.order[t]].cards;
    return { verts: 1 + (hi === Infinity ? farVerts(K) : 0) + cards * 4 + sv + p * 4, tris: cards * 2 + st + p * 2 };
  }), { cell: H.cell, chunks: H.chunks ? H.chunks.length : 0 });   // (and its impostor's views' texels a side, its stand's atlas as fine as its finest shape's; and how many chunks its clumps are)
}
/** Under these pixels of the measure nothing but a shape's impostor is drawn: where the last plant's cross-fade to it
    ends, at the most pixels drawn a pixel of the measure (RATIO). A plant without a far end: never. */
const farLoOf = (H, K) => (H.far ? (H.T * BUDGET_DRAWN * K.SWITCH * (1 - K.FADE)) / K.RATIO : 0);

export function crowd(m, opts = {}) {
  const K = { ...CROWD, ...opts }, P = m.position, I = m.index, n = m.part.length, R = m.root;
  const H = headOf(m, K), { size, frame, sprigs, solids, N, M, mid, sd: spread, order, meta, classes, sphere, win, P0, go } = H;
  // how much of its pictures the plant covers, and its cards by themselves
  const stop = Float32Array.from({ length: n }, (_, v) => (m.part[v] === 1 ? K.STOPS : 1)), [cover, coverCards] = N ? coverOf(P, n, I, stop, frame, K.PIC, Uint8Array.from({ length: n }, (_, v) => (m.part[v] === 1 ? 1 : 0))) : [0, 0];
  // E, measured: a first tenth of the turns, drawn as the engine draws them (the last of them still growing), is enlarged until the crowd by itself covers what all of it covered
  let E = K.E;
  // (measured at a tenth of the cards; where that finds the least E there is, again at as few as K.FIT, where the last of
  // them must still hold the crown before the clumps come, and the larger taken: a shrub whose cards hold its outline
  // at a tenth but thin under it)
  if (opts.E == null && N > K.LEAST) for (const s of [max(0.1, K.LEAST / N), max(K.FIT, K.LEAST / N)]) {
    if (s !== max(0.1, K.LEAST / N) && (s >= max(0.1, K.LEAST / N) || E > K.EMIN)) break;
    const px = go[min(N - 1, round(s * N))], a = areaAt(s, meta), ids = [], of = [], J = [];   // (the size on screen where that share is drawn: its turns' own go)
    for (let t = 0; t < N; t++) {
      const g = grownAt(px, go[t], K.GROW); if (g <= 0) break;
      const q = sprigs[order[t]], at = new Map();
      for (const v of q.verts) { at.set(v, ids.length); ids.push(v); of.push(t, g); }
      for (const t3 of q.tris) J.push(at.get(I[t3]), at.get(I[t3 + 1]), at.get(I[t3 + 2]));
    }
    const Q = new Float32Array(ids.length * 3), st = new Float32Array(ids.length).fill(K.STOPS);
    const k = a < 0.7 && coverCards > 0 ? reaching((k) => {
      for (let i = 0; i < ids.length; i++) { const v = ids[i] * 3, tp = sprigs[order[of[i * 2]]].tip, g = of[i * 2 + 1]; for (let c = 0; c < 3; c++) { const T = tp[c], r = T + (R[v + c] - T) * k; Q[i * 3 + c] = r + (T + (P[v + c] - T) * k - r) * g; } }
      return coverOf(Q, ids.length, J, st, frame, K.PIC);
    }, coverCards, pow(a, -K.E), 1.2) : 0;
    if (k > 1) E = max(s === max(0.1, K.LEAST / N) ? K.EMIN : E, min(K.EMAX, max(K.EMIN, -log(k) / log(a))));
  }
  meta[META.P0] = P0; meta[META.E] = E; meta[META.SIZE] = size; meta[META.PARTS] = N; meta.set(mid, META.MID);

  // ---- its solid pieces: how wide each is, its go ----
  // (how long: between its two corners farthest apart (the farthest from its middle, and the farthest from that). How
  // wide: it is taken as a body a ray passes twice, whose area over pi times its length is its mean width seen from the
  // side (a tube's: its girth). Leaving a piece out differs by its width: it is gone where that is within ERROR_PX. Thick
  // wood, what is still there where the clumps take over, is never gone by itself (go 0): the impostor takes it; so is
  // what was laid without a part)
  for (const q of solids) {
    const c = [0, 0, 0]; for (const v of q.verts) for (let a = 0; a < 3; a++) c[a] += P[v * 3 + a] / q.verts.length;
    const farFrom = (x, y, z) => { let at = q.verts[0], d = -1; for (const v of q.verts) { const e = (P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2; if (e > d) { d = e; at = v; } } return at; };
    const a = farFrom(c[0], c[1], c[2]), b = farFrom(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), L = hypot(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]) || 1e-9;
    q.w = q.area / (PI * L); q.go = q.stays ? 0 : switchPx(q.w / size);
  }
  const there = N > 0 || solids.some((q) => q.go < win.hi);   // (a thing of sticks only, all gone before: nothing stays)
  if (!there) win.hi = win.lo = 0;
  for (const q of solids) if (there && q.go < win.hi) q.go = 0;

  // ---- the new order of its vertices: the cards by turn, then the solids, thick first ----
  const listed = solids.slice().sort((a, b) => a.go - b.go || b.w - a.w);
  let cards = 0; for (const q of sprigs) cards += q.cards;
  const count = cards * 4 + listed.reduce((t, q) => t + q.verts.length, 0), from = new Int32Array(count), at = new Int32Array(n).fill(-1);
  const S = { go: new Float32Array(count), tip: new Float32Array(count * 3) };
  const index = new Uint32Array(listed.reduce((t, q) => t + q.tris.length * 3, 0)), steps = { go: new Float32Array(listed.length), corners: new Uint32Array(listed.length), verts: new Uint32Array(listed.length) };
  const turns = { go, cards: new Uint32Array(N + 1) };
  let o = 0;
  const put = (v, g, T) => { from[o] = v; S.go[o] = g; S.tip[o * 3] = T[0]; S.tip[o * 3 + 1] = T[1]; S.tip[o * 3 + 2] = T[2]; o++; };
  for (let s = 0; s < N; s++) {   // (a sprig's cards as it laid them: four vertices each, in the one order every run is drawn by, 0 1 2, 0 2 3)
    const q = sprigs[order[s]]; turns.cards[s] = o / 4;
    for (const v of q.verts) put(v, go[s], q.tip);
  }
  turns.cards[N] = cards;
  let ic = 0;
  listed.forEach((q, i) => {
    for (const v of q.verts) { at[v] = o; put(v, q.go, q.foot); }
    for (const t of q.tris) { index[ic++] = at[I[t]]; index[ic++] = at[I[t + 1]]; index[ic++] = at[I[t + 2]]; }
    steps.go[i] = q.go; steps.corners[i] = ic; steps.verts[i] = o - cards * 4;
  });
  // every number the mesh carries a vertex, as it is, in the new order
  const out = {};
  for (const [key, a] of Object.entries(m)) { if (key === 'index' || key === 'parts' || key === 'body' || !(Array.isArray(a) || ArrayBuffer.isView(a)) || !a.length || a.length % n) continue; const w = a.length / n, b = new Float32Array(count * w); for (let i = 0; i < count; i++) for (let k = 0; k < w; k++) b[i * w + k] = a[from[i] * w + k]; out[key] = b; }
  for (let i = cards * 4, j = 0; j < listed.length; j++) for (const _ of listed[j].verts) { if (out.part[i] !== 1) out.root.set(listed[j].foot, i * 3); i++; }   // (a solid's root: its foot)

  // ---- the far end: its leaves in clumps ----
  const clumps = H.chunks && there ? clumpsOf(H.chunks) : null;
  /** Its chunks as the engine draws them: each comes in at the size its own sprigs go at, where one of them is among the
      last M to go; else at its place in an order spread over the crown, over the clumps' window. */
  function clumpsOf(all) {
    const aoP = new Float64Array(N * 2), turnOf = new Int32Array(N).fill(-1);
    sprigs.forEach((q, p) => { for (const v of q.verts) { aoP[p * 2] += m.ao[v]; aoP[p * 2 + 1]++; } });
    const Mc = all.length, X = new Float64Array(Mc), Y = new Float64Array(Mc), Z = new Float64Array(Mc), rank = new Uint32Array(Mc);
    all.forEach((C, c) => { X[c] = (C.box[0] + C.box[3]) / 2; Y[c] = (C.box[1] + C.box[4]) / 2; Z[c] = (C.box[2] + C.box[5]) / 2; });
    turnsOf(X, Y, Z, new Uint8Array(Mc), mid).forEach((c, i) => (rank[c] = i));
    for (let t = 0; t < N; t++) turnOf[order[t]] = t;
    const cells = new Float32Array(Mc * 6), boxes = new Float32Array(Mc * 6), cgo = new Float32Array(Mc), ao = new Float32Array(Mc);
    all.forEach((C, c) => {
      cells.set(C.cell, c * 6); boxes.set(C.box, c * 6);
      let g = 0, a = 0, k = 0; for (const p of C.parts) { if (turnOf[p] < M) g = max(g, go[turnOf[p]]); a += aoP[p * 2]; k += aoP[p * 2 + 1]; }
      cgo[c] = g || win.lo * pow(K.WIN, (rank[c] + 0.5) / Mc); ao[c] = k ? a / k : 1;
    });
    return { n: Mc, cells, boxes, go: cgo, ao, err: max(...all.map((C) => C.err)) };
  }
  // what the GPU bakes the far end from (src/detail/impostor.js), carried after its finest level's vertices
  // (assets/kit/plant.js): [chunks, the sphere (4), its size, its clumps' window's start, its impostor's views' texels a side, then a chunk's cell and box (12)]
  const data = new Float32Array(8 + (clumps ? clumps.n * 12 : 0));
  data.set([clumps ? clumps.n : 0, ...sphere, size, win.hi, H.cell]);
  if (clumps) for (let c = 0; c < clumps.n; c++) { data.set(clumps.cells.subarray(c * 6, c * 6 + 6), 8 + c * 12); data.set(clumps.boxes.subarray(c * 6, c * 6 + 6), 8 + c * 12 + 6); }
  meta[META.HI] = win.hi; meta[META.LO] = win.lo; meta[META.CARDS] = cards;
  return { count, cards, parts: N, solids: listed.length, ...out, ...S, index, steps, turns, meta, P0, E, A: H.A, SWELL: K.SWELL, size, mid, spread, classes, win, cover: N ? cover : 0, sphere, clumps,
    cell: H.cell, far: { lo: farLoOf(H, K), data } };
}

// ---- a shape as the engine draws it between two sizes on screen ----
/** Where each of a level's sixteen numbers lies (levelOf: `rule`): what the one rule reads of its shape. AT: where its
    far data begins (its finest level's: assets/kit/plant.js; a vertex's number, x 1024 and the rest, two slots). */
export const RULE = { P0: 0, E: 1, HI: 2, LO: 3, CLASSES: 4, A: 10, SWELL: 11, AT: 14 };
/** Where a chunk's planes lie in a shape's layer of clumps (src/detail/impostor.js): plane a (0: across x, 1: across y,
    2: across z) of chunk c is tile 3c + a, TILES a row. The plane's own two axes: [u, v]. Its corners' uv lie a step of
    the packing (assets/kit/plant.js: 1024ths) inside its tile, so no pixel at its edge reads the next one (IN). */
export const PLANE = [[2, 1], [0, 2], [0, 1]], IN = 1 / 1024;
/** What a shape submits to be drawn anywhere between lo and hi pixels (hi: Infinity, every size above lo): its first
    cards in turn order, its solids not yet gone and, where the clumps can come in that band (a plant reckons its size a
    little smaller than it is, by its own number: SWITCH), its chunks' planes; nothing of it in a band wholly under
    far.lo, where its impostor is all there is. Every vertex as the kit made it (position normal uv part ao cn root twig)
    and, a vertex, what the rule moves it by:
      go     a card's or a solid's: the size on screen under which it is gone (0: never by itself); a plane's: the size
             under which its chunk has come
      tip    the point a card is enlarged about (a solid's: its foot; a plane's: its chunk's middle, which it grows from)
    a plane's part is 2, its uv its place in its shape's layer of clumps (in tiles: TILES a side, rows from the top);
    and `rule`, its shape's sixteen numbers (RULE); its finest level (hi Infinity) carries `far`, what the GPU bakes its
    far end from. The same shape at two levels is the same thing at the size where they meet: the coarser one holds a
    first share of what the finer one holds, and the rest is gone there. keep: the last parts stay (the library's plant,
    which wears no clumps). */
export function levelOf(S, lo = 0, hi = Infinity, { keep = false, clumps = true } = {}, K = CROWD) {
  const near = hi > S.far.lo;   // (a band wholly under it holds nothing but the impostor)
  let t = 0; if (near) while (t < S.parts && S.turns.go[t] < hi) t++;
  const nc = !near ? 0 : t < S.parts ? S.turns.cards[t] : S.cards;
  let i = 0; if (near) while (i < S.solids && S.steps.go[i] < hi) i++;
  const sv = i ? S.steps.verts[i - 1] : 0, sc = i ? S.steps.corners[i - 1] : 0, C = clumps && near && S.clumps && lo < S.win.hi / K.SWITCH ? S.clumps : null, nk = C ? C.n * 12 : 0;
  const count = nc * 4 + sv + nk;
  const out = { count, position: new Float32Array(count * 3), normal: new Float32Array(count * 3), uv: new Float32Array(count * 2), part: new Float32Array(count), ao: new Float32Array(count), cn: new Float32Array(count * 3), root: new Float32Array(count * 3), twig: new Float32Array(count),
    go: new Float32Array(count), tip: new Float32Array(count * 3) };
  // the cards and the solids: as the shape holds them, the solids moved down to where the cards end
  const copy = (from, n, to) => {
    for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2], ['part', 1], ['ao', 1], ['cn', 3], ['root', 3], ['twig', 1], ['go', 1], ['tip', 3]]) if (S[k]) out[k].set(S[k].subarray(from * w, (from + n) * w), to * w);
  };
  copy(0, nc * 4, 0); copy(S.cards * 4, sv, nc * 4);
  if (keep) for (let v = 0; v < nc * 4; v++) if (out.go[v] < S.win.hi) out.go[v] = 0;
  const index = [];
  for (let c = 0; c < nc; c++) index.push(4 * c, 4 * c + 1, 4 * c + 2, 4 * c, 4 * c + 2, 4 * c + 3);
  const shift = (S.cards - nc) * 4; for (let j = 0; j < sc; j++) index.push(S.index[j] - shift);
  // a chunk's three planes, each through its box's middle across one axis, as wide as its box the other two ways
  for (let c = 0, o = nc * 4 + sv; C && c < C.n; c++) {
    const b = C.boxes.subarray(c * 6, c * 6 + 6), m = [0, 1, 2].map((a) => (b[a] + b[a + 3]) / 2);
    for (let a = 0; a < 3; a++, o += 4) {
      const [U, V] = PLANE[a], tile = c * 3 + a, tx = tile % K.TILES, ty = floor(tile / K.TILES);
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([cu, cv], j) => {
        const v = o + j, p = m.slice(); p[U] = cu ? b[U + 3] : b[U]; p[V] = cv ? b[V + 3] : b[V];
        out.position.set(p, v * 3); out.normal[v * 3 + a] = 1; out.cn[v * 3 + a] = 1; out.root.set(m, v * 3); out.tip.set(m, v * 3);
        out.uv[v * 2] = tx + IN + cu * (1 - 2 * IN); out.uv[v * 2 + 1] = ty + IN + (1 - cv) * (1 - 2 * IN); out.part[v] = 2; out.ao[v] = C.ao[c]; out.go[v] = C.go[c];
      });
      index.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  }
  const rule = new Float32Array(16); rule[RULE.P0] = S.P0; rule[RULE.E] = S.E; rule[RULE.HI] = S.win.hi; rule[RULE.LO] = S.win.lo; rule.set(S.meta.subarray(META.CLASSES, META.CLASSES + 6), RULE.CLASSES); rule[RULE.A] = S.A; rule[RULE.SWELL] = S.SWELL;
  return { ...out, index: Uint32Array.from(index), rule, far: hi === Infinity ? S.far.data : null };
}
/** How many of a plant's vertices (32 bytes each, assets/kit/plant.js) its far data takes, at most. */
export const farVerts = (K = CROWD) => ceil((8 + K.CLUMPS * 12) / 8);
