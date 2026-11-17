// The crowd kit: the one builder of what stands in a stand (intent 0033). A plant's file draws its plant once, as it
// is from near (assets/kit/tree.js: wood as tubes, sprigs as crossed cards, each card knowing its root). This turns
// that one mesh into everything the engine needs to draw the plant at any size on screen, told nothing of what kind of
// plant it is: it reads the mesh's triangles, which stuff each is of (`part`: 1 a card cut out of a painting, else
// solid) and the cards' roots, and nothing else. Plain JS, no three and nothing of the page: run in the recipes'
// worker, and by the library on the page.
//
// What it finds, and what the engine does with it:
//   - pieces: the triangles that share corners. A card is a piece; the cards of one root are a part (a sprig); a solid
//     piece (a twig, a limb, the trunk) is a part by itself;
//   - one order for the crowd of card parts. Every part has its turn, and any first share of the turns is a fair
//     picture of the whole crown: the parts go by size into classes (each half the area of the one before, the largest
//     first), and within a class each next part is the one farthest from all taken before. The engine draws a first
//     share of the turns, smaller as the plant is smaller on screen:
//         share = min(1, (px / P0)^A)            P0 = CARD x size / a card's size: where a card is CARD pixels
//         go    = P0 x ((turn + 1/2) / N)^(1/A)  the size on screen under which a part is gone
//     and enlarges those that stay about their tips (the middle of their outermost corners: they grow back into the
//     crown, the outline stays), so the crown covers as much:
//         k     = min(KMAX, area^-E)             area: the share of the cards' area the drawn parts are (areaAt)
//     E is measured on each shape: a thin crown needs more of it than a thick one, whose cards hide each other.
//     A card's painting is enlarged with it (showing more of its picture instead, far off, mips it to a blur its cut-out
//     passes everywhere: a solid patch);
//   - a solid piece is gone where it is narrower on screen than TWIG pixels, and shrinks to its foot (the middle of
//     its wider end). The solids' corners are sorted thick first: a first share of the list is the thick wood;
//   - the clumps (intent 0038, NVIDIA HPG 2026, Simplygon's billboard clouds): the card parts split into chunks by
//     their boxes, the one with the largest error first, until every chunk's error (half its box's largest side, in
//     pixels where the clumps come in) is under ERROR, or there are CLUMPS of them. Each chunk is three crossed planes
//     through its box's middle, wearing its own leaves as the GPU bakes them (src/detail/impostor.js), so nothing of a
//     clump is painted by hand. They take over where the cards would have to be enlarged more than KMAX times, or
//     fewer than LEAST parts would stay, by FAR pixels at the latest: over that window (WIN) the last parts go one by
//     one and the chunks grow in one by one, each where its own parts were;
//   - the impostor's frame: the sphere round the whole plant, from which the GPU bakes its views (one octahedral
//     impostor a shape, src/detail/impostor.js). Where it is drawn is the screen's to say: where its texels are not
//     magnified (src/scatter/trees.js), and always under `far.lo`, where a level holds nothing else.
//
//   crowd(mesh, { size }) -> a shape:
//     count, cards, parts, solids   its vertices; its cards (4 vertices each, corners 0 1 2, 0 2 3: no list of
//                                   corners, runCorners() is the one list every run of RUN cards is drawn with);
//                                   its card parts; its pieces drawn by corners
//     position, normal, uv, part, ao, cn, root, hand, twig (and whatever else the mesh carries a vertex)
//                                   as the kit made them, in a new order: the cards in turn order (a first share of
//                                   the list is a first share of the turns), then the solids, thick first. A
//                                   solid's root is its foot
//     go        a vertex, pixels    the size on screen under which its part is gone (0: never: thick wood, which
//                                   stays until the impostor takes it)
//     tip       a vertex, x y z     the point its part is enlarged about (a solid's: its foot)
//     cls       a vertex, 0 … 3     its part's class by size, 0 the largest (a solid's: 0)
//     index                         the solids' corners, into the list above, thick first
//     steps { go, corners, verts }  a piece drawn by corners each, in the list's order: its go, and how many corners
//                                   and vertices the list holds up to and with it (what is drawn at a size is a
//                                   first share of both)
//     turns { go, cls, cards }      a card part each, in turn order: its go, its class, where its cards begin
//     meta      16 numbers          what the engine's one rule reads of a shape (META says which is which)
//     P0, E, A, size, mid, spread, classes, win { hi, lo }, cover    the same by name, and what was measured
//     sphere    [x, y, z, r]        the impostor's frame
//     far       { lo, data }        under lo pixels nothing but the impostor is drawn; data: what the GPU bakes the
//                                   shape's far end from (farData: the sphere and the chunks), carried by its finest level
//     clumps    { n, cells, boxes, go, order } or null    its chunks (cells: where their parts' tips lie, boxes: their
//                                   planes' frames, go: the size on screen under which each has come)
//
// The rule itself, for whoever draws (the vertex stage is to be its twin): shareAt, areaAt, enlargedBy, grownAt.
const { PI, sqrt, hypot, floor, ceil, min, max, abs, log, log2, pow } = Math;

/** Every number of the rule, in one place, as the plants are drawn. A plant's file has none of them. */
export const CROWD = {
  CARD: 30,        // pixels: how large a card is on screen where its crowd begins to thin (P0 = CARD x size / a card's size). The research's 15 submitted two to four times the vertices at the top of a level's band; 30 brings the plants to about main's (intent 0033, Build)
  A: 2,            // how fast a crowd thins under P0: its share is (px / P0)^A (2: as many cards to a pixel of crown at every size)
  E: 0.45,         // how much those that stay are enlarged: by (the share of the cards' area that is drawn)^-E. Measured on every shape that has cards enough to measure (EMIN … EMAX); this is for the others
  EMIN: 0.2, EMAX: 0.6,
  FIT: 0.04,       // … the second share it is measured at (as fewest LEAST parts): the larger E of the two
  KMAX: 4,         // … and never by more than this: where it is reached the clumps take over, while the cards still hold the crown's outline, so the plant does not thin before it (intent 0033, the walk)
  LEAST: 8,        // … or where fewer card parts than this would stay
  WIN: 1.3,        // the clumps take over from their start down to this many times smaller: the last parts go one by one, the chunks grow in one by one
  GROW: 1.1,       // a part grows from its root between its `go` and this many times it (a chunk from its middle, between its `go` and this many times under it)
  TWIG: 0.75,      // pixels: a solid piece is gone where it is narrower on screen than this
  RUN: 16,         // cards in a run: the engine draws a crowd's cards by runs, each 4 x RUN vertices and one shared list of 6 x RUN corners
  CLASSES: 4,      // the most classes by size a crowd is sorted into (each half the area of the one before)
  FAR: 40,         // pixels: the clumps have taken over by this size at the latest, so the far levels hold no cards (intent 0033, Build)
  ERROR: 3,        // pixels: a chunk is split until half its box's largest side is under this on screen where the clumps come in
  CLUMPS: 64,      // … or until there are this many: a plant's clumps are at most 12 x CLUMPS vertices
  VIEWS: 10,       // the impostor's views: VIEWS x VIEWS over the half-sphere above (hemi-octahedral), each CELL texels a side
  CELL: 128,
  TILE: 32,        // a chunk's plane: TILE texels a side, TILES x TILES of them a shape's layer
  TILES: 14,
  SWITCH: 0.72,    // a plant is its impostor from a size on screen of its own between this share of T (the most pixels drawn its measured size may be, CELL texels of its sphere) and all of it (src/scatter/trees.js meshShare) …
  FADE: 0.15,      // … over the last FADE of the way down to it, the two drawn texel by texel
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
/** By how much the parts that are drawn are enlarged about their tips when a first `share` of them is drawn. */
export const enlargedBy = (share, meta, KMAX = CROWD.KMAX) => min(KMAX, pow(max(areaAt(share, meta), 1e-9), -meta[META.E]));
/** How grown a part is at px pixels, 0 … 1: nothing under its `go`, all of it from GROW times that. */
export const grownAt = (px, go, GROW = CROWD.GROW) => (go > 0 ? smooth((px / go - 1) / (GROW - 1)) : 1);
/** The one list of corners every run of cards is drawn with: card c of a run is vertices 4c … 4c + 3. */
export const runCorners = (RUN = CROWD.RUN) => Uint16Array.from({ length: RUN * 6 }, (_, i) => floor(i / 6) * 4 + [0, 1, 2, 0, 2, 3][i % 6]);

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
    its outline. */
function turnsOf(X, Y, Z, cls, mid) {
  const n = cls.length, rest = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => cls[a] - cls[b] || a - b), d = new Float64Array(n).fill(Infinity), out = new Uint32Array(n);
  let lo = 0, hi = 0, at = -1, far = -1;
  const endOf = (c) => { let e = lo; while (e < n && cls[rest[e]] === c) e++; return e; };
  if (n) { hi = endOf(cls[rest[0]]); for (let j = 0; j < hi; j++) { const p = rest[j], q = (X[p] - mid[0]) ** 2 + (Y[p] - mid[1]) ** 2 + (Z[p] - mid[2]) ** 2; if (q > far) { far = q; at = j; } } }
  for (let s = 0; s < n; s++) {
    const p = rest[at], px = X[p], py = Y[p], pz = Z[p]; out[s] = p; rest[at] = rest[lo]; rest[lo++] = p;
    if (lo === hi && lo < n) hi = endOf(cls[rest[lo]]);   // (a class is through: the next, by how far its parts lie from all that are taken)
    far = -1;
    for (let j = lo; j < n; j++) { const r = rest[j], q = (X[r] - px) ** 2 + (Y[r] - py) ** 2 + (Z[r] - pz) ** 2; if (q < d[r]) d[r] = q; if (j < hi && d[r] > far) { far = d[r]; at = j; } }
  }
  return out;
}

/** A plant's mesh as its file draws it once (assets/kit/tree.js: position, normal, uv, part, ao, cn, root, hand, twig a
    vertex, lists of numbers or typed arrays; index its corners) -> its shape: all the engine needs to draw it at any
    size on screen (the head of this file says what). size: metres, what its size on screen is measured by (its
    kind's: a tree's height, a bush's largest side; not said: its largest side). Whatever else is said takes the place
    of CROWD's number of that name (to try another): `E` said is taken, not measured; `order: 'alike'` is one order over
    all sizes with no classes; `tip: 'corner'` a part's single outermost corner. */
/** What every reckoning of a shape begins with: its pieces (the triangles that share corners), its card parts (the
    cards of one root), and where a card is CARD pixels on screen (P0). Cheap: no picture is taken (budgetOf reads
    it at a start, crowd builds on it). */
function headOf(m, K) {
  const P = m.position, I = m.index, n = m.part.length, R = m.root;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], mean = [0, 0, 0];
  for (let p = 0; p < n * 3; p += 3) for (let a = 0; a < 3; a++) { const x = P[p + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; mean[a] += x / n; }
  const size = K.size ?? max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  let far = 0; for (let p = 0; p < n * 3; p += 3) far = max(far, (P[p] - mean[0]) ** 2 + (P[p + 1] - mean[1]) ** 2 + (P[p + 2] - mean[2]) ** 2);
  const frame = { c: mean, r: sqrt(far) * 1.1 || 1 };   // (what its cover is reckoned in: all of it, and a little round it)

  // ---- its pieces: the triangles that share corners ----
  const up = Int32Array.from({ length: n }, (_, i) => i), find = (x) => { while (up[x] !== x) { up[x] = up[up[x]]; x = up[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]); up[b] = a; up[c] = a; }
  const name = new Int32Array(n).fill(-1), pOf = new Int32Array(n).fill(-1); let nP = 0;
  for (let t = 0; t < I.length; t += 3) { const r = find(I[t]); if (name[r] < 0) name[r] = nP++; }
  const pTris = new Uint32Array(nP + 1), pVerts = new Uint32Array(nP + 1), pArea = new Float64Array(nP);
  for (let v = 0; v < n; v++) { const q = name[find(v)]; pOf[v] = q; if (q >= 0) pVerts[q + 1]++; }   // (a vertex no triangle has: of no piece, left out)
  for (let t = 0; t < I.length; t += 3) {
    const q = pOf[I[t]], i = I[t] * 3, j = I[t + 1] * 3, k = I[t + 2] * 3, ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2], vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
    pTris[q + 1]++; pArea[q] += hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  for (let q = 0; q < nP; q++) { pTris[q + 1] += pTris[q]; pVerts[q + 1] += pVerts[q]; }
  const tris = new Uint32Array(I.length / 3), verts = new Uint32Array(pVerts[nP]);   // (a piece's triangles, by their first corner's place in the list, and its vertices)
  { const a = pTris.slice(0, nP), b = pVerts.slice(0, nP); for (let t = 0; t < I.length; t += 3) tris[a[pOf[I[t]]]++] = t; for (let v = 0; v < n; v++) if (pOf[v] >= 0) verts[b[pOf[v]]++] = v; }
  const cardP = (q) => m.part[verts[pVerts[q]]] === 1, quadP = (q) => pVerts[q + 1] - pVerts[q] === 4 && pTris[q + 1] - pTris[q] === 2;

  // ---- its card parts: the cards of one root ----
  const partOf = new Int32Array(nP).fill(-1), byRoot = new Map(); let N = 0, cardPieces = 0, was = -1;
  for (let q = 0; q < nP; q++) if (cardP(q)) {
    const v = verts[pVerts[q]] * 3, w = was * 3; cardPieces++;
    if (was >= 0 && R[v] === R[w] && R[v + 1] === R[w + 1] && R[v + 2] === R[w + 2]) { partOf[q] = N - 1; continue; }   // (the card before it was of the same root: most are laid one after another)
    const key = `${R[v]},${R[v + 1]},${R[v + 2]}`; let p = byRoot.get(key); if (p === undefined) { byRoot.set(key, (p = N++)); was = v / 3; } else was = -1;
    partOf[q] = p;
  }
  if (N === 1 && cardPieces >= 2 * K.LEAST) { N = 0; for (let q = 0; q < nP; q++) if (cardP(q)) partOf[q] = N++; }   // (a mesh whose cards carry no roots: every card a part of its own)
  let cardS = 0, cardN = 0, most = 0; { const c = new Uint32Array(N), a = new Float64Array(N); for (let q = 0; q < nP; q++) if (partOf[q] >= 0) { c[partOf[q]]++; a[partOf[q]] += pArea[q]; } for (let p = 0; p < N; p++) { cardS += sqrt(a[p] / c[p]) * c[p]; cardN += c[p]; most = max(most, c[p]); } }
  // P0: where a card (the square its area makes, the crowd's mean) is CARD pixels on screen; a thing of no cards: where it is itself
  const P0 = (K.CARD * size) / (cardPieces ? cardS / cardPieces : size);
  return { lo, hi, mean, size, frame, up, find, name, pOf, nP, pTris, pVerts, pArea, tris, verts, cardP, quadP, partOf, N, cardPieces, P0, most };
}

/** What a shape may submit at most at each of the sizes on screen `his` (pixels; Infinity: all of it), without
    building it: a level's room in the heap (src/scatter/trees.js). -> [{ verts, tris }] (its first vertex is its
    numbers: assets/kit/plant.js) */
export function budgetOf(m, opts = {}, his = [Infinity]) {
  const K = { ...CROWD, ...opts }, H = headOf(m, K);
  let sv = 0, st = 0, quads = 0;
  for (let q = 0; q < H.nP; q++) { const v = H.pVerts[q + 1] - H.pVerts[q], t = H.pTris[q + 1] - H.pTris[q]; if (H.partOf[q] >= 0 && H.quadP(q)) quads++; else { sv += v; st += t; } }
  // (its finest level carries its far data, every other its chunks' planes where they can come: CLUMPS of three at
  // most; a level wholly under far.lo nothing but its numbers: crowd's sphere, reckoned the same way)
  const P = m.position, c = [0, 1, 2].map((a) => (H.lo[a] + H.hi[a]) / 2); let r2 = 0;
  for (let p = 0; p < P.length; p += 3) r2 = max(r2, (P[p] - c[0]) ** 2 + (P[p + 1] - c[1]) ** 2 + (P[p + 2] - c[2]) ** 2);
  const farLo = ((K.CELL * H.size) / (2 * (sqrt(r2) || 1))) * K.SWITCH * (1 - K.FADE) / K.RATIO;
  return his.map((hi) => {
    if (hi <= farLo) return { verts: 1, tris: 0 };
    const share = H.N ? min(1, shareAt(hi * K.WIN, H.P0, K.A)) : 0, cards = min(quads, ceil(share * H.N) * H.most), far = hi === Infinity, planes = far || !H.N ? 0 : K.CLUMPS * 3;
    return { verts: 1 + (far ? farVerts(K) : 0) + cards * 4 + sv + planes * 4, tris: cards * 2 + st + planes * 2 };
  });
}

export function crowd(m, opts = {}) {
  const K = { ...CROWD, ...opts }, P = m.position, I = m.index, n = m.part.length, R = m.root, UV = m.uv;
  const Hd = headOf(m, K), { lo, hi, mean, size, frame, up, find, name, pOf, nP, pTris, pVerts, pArea, tris, verts, cardP, quadP, partOf, cardPieces, P0 } = Hd; let N = Hd.N;
  // the crowd's middle and how far it spreads along each axis: the crown's own proportions, in which "outermost" is reckoned
  const mid = [0, 0, 0], sd = [0, 0, 0]; let nC = 0;
  for (let q = 0; q < nP; q++) if (partOf[q] >= 0) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { const v = verts[i] * 3; mid[0] += P[v]; mid[1] += P[v + 1]; mid[2] += P[v + 2]; nC++; }
  for (let a = 0; a < 3; a++) mid[a] /= max(1, nC);
  for (let q = 0; q < nP; q++) if (partOf[q] >= 0) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { const v = verts[i] * 3; for (let a = 0; a < 3; a++) sd[a] += (P[v + a] - mid[a]) ** 2; }
  for (let a = 0; a < 3; a++) sd[a] = sqrt(sd[a] / max(1, nC)) || 1e-9;
  // a part: its pieces, its area, its middle, its tip
  const pp = new Uint32Array(N + 1), area = new Float64Array(N), X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N), nv = new Uint32Array(N), tip = new Float64Array(N * 3);
  for (let q = 0; q < nP; q++) { const p = partOf[q]; if (p < 0) continue; pp[p + 1]++; area[p] += pArea[q]; for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { const v = verts[i] * 3; X[p] += P[v]; Y[p] += P[v + 1]; Z[p] += P[v + 2]; nv[p]++; } }
  for (let p = 0; p < N; p++) { pp[p + 1] += pp[p]; X[p] /= nv[p]; Y[p] /= nv[p]; Z[p] /= nv[p]; }
  const pieces = new Uint32Array(pp[N]); { const a = pp.slice(0, N); for (let q = 0; q < nP; q++) if (partOf[q] >= 0) pieces[a[partOf[q]]++] = q; }
  { // its tip: the middle of the outer half of its corners (or its one outermost), "out" reckoned from the crowd's middle in the crown's proportions
    const out = new Float64Array(64), ids = new Int32Array(64);
    for (let p = 0; p < N; p++) {
      let c = 0;
      for (let j = pp[p]; j < pp[p + 1]; j++) for (let i = pVerts[pieces[j]]; i < pVerts[pieces[j] + 1]; i++) {
        const v = verts[i], d = ((P[v * 3] - mid[0]) / sd[0]) ** 2 + ((P[v * 3 + 1] - mid[1]) / sd[1]) ** 2 + ((P[v * 3 + 2] - mid[2]) / sd[2]) ** 2;
        let k = min(c, 63); if (c >= 64 && out[63] >= d) continue; while (k > 0 && out[k - 1] < d) { out[k] = out[k - 1]; ids[k] = ids[k - 1]; k--; } out[k] = d; ids[k] = v; c++;   // (the farthest first; of a part of many corners the 64 farthest are looked at)
      }
      const take = K.tip === 'corner' ? 1 : min(64, ceil(c / 2));
      for (let k = 0; k < take; k++) for (let a = 0; a < 3; a++) tip[p * 3 + a] += P[ids[k] * 3 + a] / take;
    }
  }

  // ---- the order, and each part's go ----
  let amax = 0, atot = 0; for (let p = 0; p < N; p++) { amax = max(amax, area[p]); atot += area[p]; }
  const cls = Uint8Array.from({ length: N }, (_, p) => (K.order === 'alike' ? 0 : min(K.CLASSES - 1, floor(log2(amax / area[p]) + 1e-6))));
  const order = turnsOf(X, Y, Z, cls, mid), meta = new Float32Array(16), classes = [];
  { let s = 0, a = 0, at = 0; for (let c = 1; c < 4; c++) { while (at < N && cls[order[at]] < c) { s++; a += area[order[at++]]; } classes.push([N ? s / N : 1, atot ? a / atot : 1]); meta.set(classes[c - 1], META.CLASSES + (c - 1) * 2); } }
  // how much of its pictures the plant covers, and its cards by themselves
  const stop = Float32Array.from({ length: n }, (_, v) => (m.part[v] === 1 ? K.STOPS : 1)), [cover, coverCards] = N ? coverOf(P, n, I, stop, frame, K.PIC, Uint8Array.from({ length: n }, (_, v) => (m.part[v] === 1 ? 1 : 0))) : [0, 0];
  // E, measured: a first tenth of the turns, drawn as the engine draws them (the last of them still growing), is enlarged until the crowd by itself covers what all of it covered
  let E = K.E;
  // (measured at a tenth of the cards; where that finds the least E there is, again at as few as K.FIT, where the last of
  // them must still hold the crown before the clumps come, and the larger taken: a shrub whose cards hold its outline
  // at a tenth but thin under it)
  if (opts.E == null && N > K.LEAST) for (const s of [max(0.1, K.LEAST / N), max(K.FIT, K.LEAST / N)]) {
    if (s !== max(0.1, K.LEAST / N) && (s >= max(0.1, K.LEAST / N) || E > K.EMIN)) break;
    const px = P0 * pow(s, 1 / K.A), a = areaAt(s, meta), ids = [], of = [], J = [], at = new Map();
    for (let t = 0; t < N; t++) {
      const g = grownAt(px, P0 * pow((t + 0.5) / N, 1 / K.A), K.GROW); if (g <= 0) break;
      for (let j = pp[order[t]]; j < pp[order[t] + 1]; j++) { const q = pieces[j]; for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { at.set(verts[i], ids.length); ids.push(verts[i]); of.push(order[t], g); } for (let i = pTris[q]; i < pTris[q + 1]; i++) J.push(at.get(I[tris[i]]), at.get(I[tris[i] + 1]), at.get(I[tris[i] + 2])); }
    }
    const Q = new Float32Array(ids.length * 3), st = new Float32Array(ids.length).fill(K.STOPS);
    const k = a < 0.7 && coverCards > 0 ? reaching((k) => {
      for (let i = 0; i < ids.length; i++) { const v = ids[i] * 3, p = of[i * 2] * 3, g = of[i * 2 + 1]; for (let c = 0; c < 3; c++) { const T = tip[p + c], r = T + (R[v + c] - T) * k; Q[i * 3 + c] = r + (T + (P[v + c] - T) * k - r) * g; } }
      return coverOf(Q, ids.length, J, st, frame, K.PIC);
    }, coverCards, pow(a, -K.E), 1.2) : 0;
    if (k > 1) E = max(s === max(0.1, K.LEAST / N) ? K.EMIN : E, min(K.EMAX, max(K.EMIN, -log(k) / log(a))));
  }
  meta[META.P0] = P0; meta[META.E] = E; meta[META.SIZE] = size; meta[META.PARTS] = N; meta.set(mid, META.MID);
  // where the clumps take over: the cards would be enlarged more than KMAX times, or fewer than LEAST parts would stay; the M parts still there go one by one over its window
  let M = N;
  if (N > K.LEAST) { const aK = pow(K.KMAX, -1 / E); let a = 0, b = 1; for (let i = 0; i < 40; i++) { const s = (a + b) / 2; if (areaAt(s, meta) < aK) a = s; else b = s; } M = min(N, max(K.LEAST, ceil(b * N - 1e-9))); }
  const win = { hi: P0 * pow(N ? M / N : 1, 1 / K.A), lo: 0 };
  if (N > K.LEAST && win.hi < K.FAR * K.WIN) { win.hi = K.FAR * K.WIN; M = min(N, max(K.LEAST, ceil(shareAt(win.hi, P0, K.A) * N - 1e-9))); }   // (no later than FAR: fewer parts go one by one over its window, from a larger share)
  win.lo = win.hi / K.WIN;
  const go = Float32Array.from({ length: N }, (_, t) => (t < M ? win.lo * pow(K.WIN, (t + 0.5) / M) : P0 * pow((t + 0.5) / N, 1 / K.A)));

  // ---- its solid pieces: how wide each is, its foot, its go ----
  const solid = []; for (let q = 0; q < nP; q++) if (partOf[q] < 0) solid.push(q);
  const sW = new Float64Array(nP), sL = new Float64Array(nP), sGo = new Float64Array(nP), foot = new Float64Array(nP * 3), one = new Int32Array(n).fill(-1), near = 1e-5 * size;   // (one: corners at one place taken as one, a tube's seam)
  for (const q of solid) {
    const v0 = pVerts[q], v1 = pVerts[q + 1], c = [0, 0, 0]; for (let i = v0; i < v1; i++) { const v = verts[i] * 3; c[0] += P[v]; c[1] += P[v + 1]; c[2] += P[v + 2]; } for (let a = 0; a < 3; a++) c[a] /= v1 - v0;
    // how long it is: between its two corners farthest apart (the farthest from its middle, and the farthest from that). How wide: it is
    // taken as a body a ray passes twice, whose area over pi times its length is its mean width seen from the side (a tube's: its girth)
    const farFrom = (x, y, z) => { let at = verts[v0], d = -1; for (let i = v0; i < v1; i++) { const v = verts[i] * 3, e = (P[v] - x) ** 2 + (P[v + 1] - y) ** 2 + (P[v + 2] - z) ** 2; if (e > d) { d = e; at = verts[i]; } } return at; };
    const a = farFrom(c[0], c[1], c[2]), b = farFrom(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), L = hypot(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]) || 1e-9, w = pArea[q] / (PI * L);
    sW[q] = w; sL[q] = L; sGo[q] = (K.TWIG * size) / max(w, 1e-9);
    // its foot: the middle of its widest rim (a rim: the edges only one triangle has, corners at one place taken as one:
    // a tube's two ends); as wide: the one nearer the plant's own foot; no rim, a closed body: its own middle
    const ord = Array.from(verts.subarray(v0, v1)).sort((x, y) => P[x * 3] - P[y * 3]), edges = new Map();
    for (let i = 0; i < ord.length; i++) { const x = ord[i]; if (one[x] < 0) one[x] = x; for (let j = i + 1; j < ord.length && P[ord[j] * 3] - P[x * 3] <= near; j++) { const y = ord[j]; if (one[y] < 0 && abs(P[y * 3 + 1] - P[x * 3 + 1]) <= near && abs(P[y * 3 + 2] - P[x * 3 + 2]) <= near) one[y] = one[x]; } }
    for (let j = pTris[q]; j < pTris[q + 1]; j++) { const t = tris[j]; for (let e = 0; e < 3; e++) { const x = one[I[t + e]], y = one[I[t + ((e + 1) % 3)]]; if (x !== y) { const key = x < y ? x * n + y : y * n + x; edges.set(key, (edges.get(key) || 0) + 1); } } }
    const next = new Map(); for (const [key, k] of edges) if (k === 1) { const x = floor(key / n), y = key % n; (next.get(x) ?? next.set(x, []).get(x)).push(y); (next.get(y) ?? next.set(y, []).get(y)).push(x); }
    let best = null;
    for (const start of next.keys()) {
      if (!next.get(start)) continue;
      const ring = []; for (const todo = [start]; todo.length;) { const x = todo.pop(), to = next.get(x); if (!to) continue; next.set(x, null); ring.push(x); todo.push(...to); }
      const e = [0, 0, 0, 0]; for (const v of ring) for (let k = 0; k < 3; k++) e[k] += P[v * 3 + k] / ring.length; for (const v of ring) e[3] += hypot(P[v * 3] - e[0], P[v * 3 + 1] - e[1], P[v * 3 + 2] - e[2]) / ring.length;
      if (!best || e[3] > best[3] * 1.02 || (e[3] > best[3] * 0.98 && hypot(e[0], e[1], e[2]) < hypot(best[0], best[1], best[2]))) best = e;
    }
    foot.set(best ? best.slice(0, 3) : c, q * 3);
  }
  // thick wood: what is still there where the clumps take over. It is never gone by itself (go 0): the impostor takes it
  const there = N > 0 || solid.some((q) => sGo[q] < win.hi);   // (a thing of sticks only, all gone before: nothing stays)
  if (!there) win.hi = win.lo = 0;
  for (const q of solid) if (there && sGo[q] < win.hi) sGo[q] = 0;

  // ---- the new order of its vertices: the cards by turn, then what is drawn by corners (the solids, and any card that is no quad), thick first ----
  const odd = []; let cards = 0; for (let s = 0; s < N; s++) for (let j = pp[order[s]]; j < pp[order[s] + 1]; j++) if (quadP(pieces[j])) cards++; else odd.push([pieces[j], s]);
  const listed = [...solid.map((q) => [q, -1]), ...odd].sort((a, b) => (a[1] < 0 ? sGo[a[0]] : go[a[1]]) - (b[1] < 0 ? sGo[b[0]] : go[b[1]]) || sW[b[0]] - sW[a[0]] || a[0] - b[0]);
  const count = cards * 4 + listed.reduce((t, [q]) => t + pVerts[q + 1] - pVerts[q], 0), from = new Int32Array(count), at = new Int32Array(n).fill(-1);
  const S = { go: new Float32Array(count), tip: new Float32Array(count * 3), cls: new Float32Array(count) };
  const index = new Uint32Array(listed.reduce((t, [q]) => t + (pTris[q + 1] - pTris[q]) * 3, 0)), steps = { go: new Float32Array(listed.length), corners: new Uint32Array(listed.length), verts: new Uint32Array(listed.length) };
  const turns = { go: go, cls: new Uint8Array(N), cards: new Uint32Array(N + 1) };
  let o = 0;
  const put = (v, g, x, y, z, c) => { from[o] = v; S.go[o] = g; S.tip[o * 3] = x; S.tip[o * 3 + 1] = y; S.tip[o * 3 + 2] = z; S.cls[o++] = c; };
  for (let s = 0; s < N; s++) {
    const p = order[s], x = tip[p * 3], y = tip[p * 3 + 1], z = tip[p * 3 + 2]; turns.cls[s] = cls[p]; turns.cards[s] = o / 4;
    for (let j = pp[p]; j < pp[p + 1]; j++) {
      const q = pieces[j]; if (!quadP(q)) continue;
      // a card's corners in the one order every run is drawn by: 0 1 2, 0 2 3 (0 and 2 are the two its triangles share)
      const t0 = tris[pTris[q]], t1 = tris[pTris[q] + 1], A = [I[t0], I[t0 + 1], I[t0 + 2]], B = [I[t1], I[t1 + 1], I[t1 + 2]], k = A.findIndex((v) => !B.includes(v)), d = B.find((v) => !A.includes(v));
      put(A[(k + 2) % 3], go[s], x, y, z, cls[p]); put(A[k], go[s], x, y, z, cls[p]); put(A[(k + 1) % 3], go[s], x, y, z, cls[p]); put(d, go[s], x, y, z, cls[p]);
    }
  }
  turns.cards[N] = cards;
  let ic = 0;
  listed.forEach(([q, s], i) => {
    const T = s < 0 ? foot.subarray(q * 3, q * 3 + 3) : tip.subarray(order[s] * 3, order[s] * 3 + 3), g = s < 0 ? sGo[q] : go[s];
    for (let j = pVerts[q]; j < pVerts[q + 1]; j++) { const v = verts[j]; at[v] = o; put(v, g, T[0], T[1], T[2], s < 0 ? 0 : cls[order[s]]); }
    for (let j = pTris[q]; j < pTris[q + 1]; j++) { const t = tris[j]; index[ic++] = at[I[t]]; index[ic++] = at[I[t + 1]]; index[ic++] = at[I[t + 2]]; }
    steps.go[i] = g; steps.corners[i] = ic; steps.verts[i] = o - cards * 4;
  });
  // every number the mesh carries a vertex, as it is, in the new order
  const out = {};
  for (const [key, a] of Object.entries(m)) { if (key === 'index' || !(Array.isArray(a) || ArrayBuffer.isView(a)) || !a.length || a.length % n) continue; const w = a.length / n, b = new Float32Array(count * w); for (let i = 0; i < count; i++) for (let k = 0; k < w; k++) b[i * w + k] = a[from[i] * w + k]; out[key] = b; }
  for (let i = cards * 4; i < count; i++) if (out.part[i] !== 1) out.root.set(foot.subarray(pOf[from[i]] * 3, pOf[from[i]] * 3 + 3), i * 3);   // (a solid's root: its foot)

  // ---- the far end: the sphere its impostor is baked in (all of it), and its leaves in clumps ----
  const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2); let r2 = 0;
  for (let p = 0; p < n * 3; p += 3) r2 = max(r2, (P[p] - centre[0]) ** 2 + (P[p + 1] - centre[1]) ** 2 + (P[p + 2] - centre[2]) ** 2);
  const sphere = [...centre, sqrt(r2) || 1], clumps = N && win.hi > 0 ? clumpsOf() : null;
  /** Its card parts in chunks: split by their boxes, the chunk of the largest error first (half its box's largest side,
      in pixels at win.hi), at the middle of its parts' tips along that side, until every chunk's error is under ERROR or
      there are CLUMPS of them. A chunk is whole parts: its cell, where their tips lie (each side [lo, hi), the tips as
      the GPU reads them back: K.grid), says which parts are its own where the GPU bakes it (src/detail/impostor.js); its
      box, where its parts' corners lie, is its planes' frame. Each comes in at the size its own parts go at, where one of
      them is among the last to go; else at its place in an order spread over the crown, over the clumps' window. */
  function clumpsOf() {
    const box = new Float64Array(N * 6), T = new Float64Array(N * 3), aoP = new Float64Array(N * 2);
    for (let p = 0; p < N; p++) {
      box.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], p * 6);
      for (let j = pp[p]; j < pp[p + 1]; j++) for (let i = pVerts[pieces[j]]; i < pVerts[pieces[j] + 1]; i++) {
        const v = verts[i]; aoP[p * 2] += m.ao[v]; aoP[p * 2 + 1]++;
        for (let a = 0; a < 3; a++) { box[p * 6 + a] = min(box[p * 6 + a], P[v * 3 + a]); box[p * 6 + 3 + a] = max(box[p * 6 + 3 + a], P[v * 3 + a]); }
      }
      for (let a = 0; a < 3; a++) T[p * 3 + a] = K.grid ? K.grid(tip[p * 3 + a], a) : tip[p * 3 + a];
    }
    const chunk = (parts, cell) => {
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const p of parts) for (let a = 0; a < 3; a++) { b[a] = min(b[a], box[p * 6 + a]); b[a + 3] = max(b[a + 3], box[p * 6 + 3 + a]); }
      return { parts, cell, box: b, err: (max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2) * (win.hi / size) };
    };
    const all = [chunk(Array.from({ length: N }, (_, p) => p), [-1e4, -1e4, -1e4, 1e4, 1e4, 1e4])];
    while (all.length < K.CLUMPS) {
      let w = -1; for (let c = 0; c < all.length; c++) if (all[c].parts.length > 1 && all[c].err > 0 && (w < 0 || all[c].err > all[w].err)) w = c;
      if (w < 0 || all[w].err <= K.ERROR) break;
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
    const Mc = all.length, X = new Float64Array(Mc), Y = new Float64Array(Mc), Z = new Float64Array(Mc), rank = new Uint32Array(Mc), turnOf = new Int32Array(N).fill(-1);
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
  // (assets/kit/plant.js): [chunks, the sphere (4), its size, its clumps' window's start, 0, then a chunk's cell and box (12)]
  const data = new Float32Array(8 + (clumps ? clumps.n * 12 : 0));
  data.set([clumps ? clumps.n : 0, ...sphere, size, win.hi, 0]);
  if (clumps) for (let c = 0; c < clumps.n; c++) { data.set(clumps.cells.subarray(c * 6, c * 6 + 6), 8 + c * 12); data.set(clumps.boxes.subarray(c * 6, c * 6 + 6), 8 + c * 12 + 6); }
  meta[META.HI] = win.hi; meta[META.LO] = win.lo; meta[META.CARDS] = cards;
  return { count, cards, parts: N, solids: listed.length, ...out, ...S, index, steps, turns, meta, P0, E, A: K.A, KMAX: K.KMAX, size, mid, spread: sd, classes, win, cover: N ? cover : 0, sphere, clumps,
    far: { lo: ((K.CELL * size) / (2 * sphere[3])) * K.SWITCH * (1 - K.FADE) / K.RATIO, data } };
}

// ---- a shape as the engine draws it between two sizes on screen ----
/** Where each of a level's sixteen numbers lies (levelOf: `rule`): what the one rule reads of its shape. AT: where its
    far data begins (its finest level's: assets/kit/plant.js; a vertex's number, x 1024 and the rest, two slots). */
export const RULE = { P0: 0, E: 1, HI: 2, LO: 3, CLASSES: 4, A: 10, KMAX: 11, AT: 14 };
/** Where a chunk's planes lie in a shape's layer of clumps (src/detail/impostor.js): plane a (0: across x, 1: across y,
    2: across z) of chunk c is tile 3c + a, TILES a row. The plane's own two axes: [u, v]. Its corners' uv lie a step of
    the packing (assets/kit/plant.js: 1024ths) inside its tile, so no pixel at its edge reads the next one (IN). */
export const PLANE = [[2, 1], [0, 2], [0, 1]], IN = 1 / 1024;
/** What a shape submits to be drawn anywhere between lo and hi pixels (hi: Infinity, every size above lo): its first
    cards in turn order, its solids not yet gone and, where the clumps can come in that band, its chunks' planes; nothing
    of it in a band wholly under far.lo, where its impostor is all there is. Every vertex as the kit made it (position
    normal uv part ao cn root hand twig) and, a vertex, what the rule moves it by:
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
  const sv = i ? S.steps.verts[i - 1] : 0, sc = i ? S.steps.corners[i - 1] : 0, C = clumps && near && S.clumps && lo < S.win.hi ? S.clumps : null, nk = C ? C.n * 12 : 0;
  const count = nc * 4 + sv + nk;
  const out = { count, position: new Float32Array(count * 3), normal: new Float32Array(count * 3), uv: new Float32Array(count * 2), part: new Float32Array(count), ao: new Float32Array(count), cn: new Float32Array(count * 3), root: new Float32Array(count * 3), hand: new Float32Array(count * 2), twig: new Float32Array(count),
    go: new Float32Array(count), tip: new Float32Array(count * 3) };
  // the cards and the solids: as the shape holds them, the solids moved down to where the cards end
  const copy = (from, n, to) => {
    for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2], ['part', 1], ['ao', 1], ['cn', 3], ['root', 3], ['hand', 2], ['twig', 1], ['go', 1], ['tip', 3]]) if (S[k]) out[k].set(S[k].subarray(from * w, (from + n) * w), to * w);
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
  const rule = new Float32Array(16); rule[RULE.P0] = S.P0; rule[RULE.E] = S.E; rule[RULE.HI] = S.win.hi; rule[RULE.LO] = S.win.lo; rule.set(S.meta.subarray(META.CLASSES, META.CLASSES + 6), RULE.CLASSES); rule[RULE.A] = S.A; rule[RULE.KMAX] = S.KMAX;
  return { ...out, index: Uint32Array.from(index), rule, far: hi === Infinity ? S.far.data : null };
}
/** How many of a plant's vertices (32 bytes each, assets/kit/plant.js) its far data takes, at most. */
export const farVerts = (K = CROWD) => ceil((8 + K.CLUMPS * 12) / 8);
