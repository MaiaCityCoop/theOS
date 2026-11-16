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
//         share = min(1, (px / P0)^A)          P0 = CARD x size / a card's size: where a card is CARD pixels
//         go    = P0 x ((turn + 1/2) / N)^(1/A)  the size on screen under which a part is gone
//     and enlarges those that stay about their tips (the middle of their outermost corners: they grow back into the
//     crown, the outline stays), so the crown covers as much:
//         k     = min(KMAX, area^-E)           area: the share of the cards' area the drawn parts are (areaAt)
//     Position and painting scale alike about the tip: a card shows more of its picture, never the picture stretched;
//   - a solid piece is gone where it is narrower on screen than TWIG pixels, and shrinks to its foot (its thicker
//     end). The solids' corners are sorted thick first: a first share of the list is the thick wood;
//   - the far stand-in: three closed bodies round the crown (36, 20 and 8 triangles), reckoned in the crown's own
//     proportions (a flat umbrella gets a flat body), each sized so the plant covers as much as it did, and a post
//     for the trunk where one stands out of the crown. The first takes over where the cards would have to be enlarged
//     more than KMAX times, or fewer than LEAST parts would stay; every corner of a finer body knows its place on the
//     next coarser one, and with every corner there the finer is the coarser, triangle for triangle.
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
//                                   stays until the far body has taken over)
//     tip       a vertex, x y z     the point its part is enlarged about (a solid's: its foot)
//     tipUv     a vertex, u v       from its own place on its card's painting to the tip's: uv + tipUv x (1 - k)
//     cls       a vertex, 0 … 3     its part's class by size, 0 the largest (a solid's: 0)
//     index                         the solids' corners, into the list above, thick first
//     steps { go, corners, verts }  a piece drawn by corners each, in the list's order: its go, and how many corners
//                                   and vertices the list holds up to and with it (what is drawn at a size is a
//                                   first share of both)
//     turns { go, cls, cards }      a card part each, in turn order: its go, its class, where its cards begin
//     meta      16 numbers          what the engine's one rule reads of a shape (META says which is which)
//     P0, E, size, mid, spread, classes, hull { hi, lo }, cover       the same by name, and what was measured
//     hulls [3] { tris, count, position, normal, uv, ao, to, index, part, reach }
//                                   the far bodies, finest first; `to`: each corner's place on the next coarser
//                                   (the coarsest's: the crown's middle); reach: its size, of the crown's own reach
//     post { count, position, normal, uv, ao, to, index } or null
//                                   the trunk under the far body; `to`: its own middle line (it thins away)
//
// The rule itself, for whoever draws (the vertex stage is to be its twin): shareAt, areaAt, enlargedBy, grownAt,
// hullAt, turnedAt; drawnAt counts what a plant submits at a size.

const { PI, sqrt, hypot, floor, ceil, round, min, max, abs, cos, sin, atan2, asin, log, log2, pow } = Math;

/** Every number of the rule, in one place. A plant's file has none of them. */
export const CROWD = {
  CARD: 15,        // pixels: how large a card is on screen where its crowd begins to thin (P0 = CARD x size / a card's size)
  A: 2,            // how fast a crowd thins under P0: its share is (px / P0)^A (2: as many cards to a pixel of crown at every size)
  E: 0.465,        // how much those that stay are enlarged: by (the share of the cards' area that is drawn)^-E, measured so the crown covers as much
  KMAX: 5,         // … and never by more than this: where it is reached the far body takes over
  LEAST: 8,        // … or where fewer card parts than this would stay
  WIN: 1.3,        // the far body takes over from its start down to this many times smaller: the last parts go one by one, the body grows from the crown's middle
  GROW: 1.1,       // a part grows from its root between its `go` and this many times it
  TWIG: 0.75,      // pixels: a solid piece is gone where it is narrower on screen than this
  RUN: 16,         // cards in a run: the engine draws a crowd's cards by runs, each 4 x RUN vertices and one shared list of 6 x RUN corners
  CLASSES: 4,      // the most classes by size a crowd is sorted into (each half the area of the one before)
  HULLS: [[6, 3], [5, 2], [4, 1]],   // the far bodies, finest first: corners round a ring, rings between the two poles (36, 20 and 8 triangles)
  TURN: [[18, 13], [9, 6.5]],        // pixels: between which sizes the first body turns into the second, and the second into the third (the post thins away with the second)
  REACH: 0.95,     // a body's corner lies as far out as this share of the crown's corners in its sector reach
  STOPS: 1 - sqrt(1 - 0.45),         // how much of the light one triangle of a card stops (a sprig of two crossed cards: 45 %), where cover is reckoned
  PIC: 64,         // … in pictures of this many pixels a side, from thirteen sides
};
/** Where each of a shape's sixteen numbers lies in `meta`. */
export const META = { P0: 0, E: 1, HI: 2, LO: 3, MID: 4, CARDS: 7, CLASSES: 8, SIZE: 14, PARTS: 15 };

// ---- the rule, as the vertex stage is to reckon it ----
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The share of a crowd's parts that is drawn at px pixels: all of them from P0 up. */
export const shareAt = (px, P0, A = CROWD.A) => min(1, pow(max(px, 0) / P0, A));
/** The share of the cards' area a first `share` of the parts is: the largest come first, so more than their share by
    count. `meta`: a shape's (its classes' bounds: where each class begins, by count and by area). */
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
/** How far the far body has taken over at px pixels, 0 … 1: it grows from the crown's middle by this; the thick wood
    gives way to the post at a half. */
export const hullAt = (px, meta) => (meta[META.HI] > 0 ? smooth(log(meta[META.HI] / max(px, 1e-6)) / log(meta[META.HI] / meta[META.LO])) : 0);
/** How far far body `i` has turned into the next coarser at px pixels, 0 … 1 (the last never turns). */
export const turnedAt = (px, i, TURN = CROWD.TURN) => (TURN[i] ? smooth(log(TURN[i][0] / max(px, 1e-6)) / log(TURN[i][0] / TURN[i][1])) : 0);
/** The one list of corners every run of cards is drawn with: card c of a run is vertices 4c … 4c + 3. */
export const runCorners = (RUN = CROWD.RUN) => Uint16Array.from({ length: RUN * 6 }, (_, i) => floor(i / 6) * 4 + [0, 1, 2, 0, 2, 3][i % 6]);
/** What a plant submits at px pixels: its cards by whole runs, the solids that are not gone, the far body.
    -> { cards, runs, corners (of the solids' list), body (which far body, -1: none), verts { cards, solids, body, all } } */
export function drawnAt(S, px, K = CROWD) {
  const meta = S.meta, plant = !(S.hull.hi > 0) || px > S.hull.lo, body = S.hull.hi > 0 && px < S.hull.hi ? (px > K.TURN[0][1] ? 0 : px > K.TURN[1][1] ? 1 : 2) : -1;
  const cards = plant ? ceil(shareAt(px, S.P0, S.A) * S.cards) : 0, runs = ceil(cards / K.RUN);
  let i = 0; while (plant && i < S.solids && S.steps.go[i] < px) i++;
  if (plant && S.hull.hi > 0 && hullAt(px, meta) >= 0.5) i = 0;   // (the thick wood has given way to the post)
  const corners = i ? S.steps.corners[i - 1] : 0, solids = i ? S.steps.verts[i - 1] : 0;
  const far = body < 0 ? 0 : S.hulls[body].count + (S.post && body < 2 ? S.post.count : 0);
  return { cards, runs, corners, body, verts: { cards: runs * K.RUN * 4, solids, body: far, all: runs * K.RUN * 4 + solids + far } };
}

// ---- cover: how much of its pictures a thing fills, reckoned as the measuring stick does (the probe of intent 0033:
// thirteen sides, a triangle stopping its share of the light, what lies behind showing through by what is left) ----
const SIDES = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]].map((d) => {
  const l = hypot(...d), w = d.map((x) => x / l), a = abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [a[1] * w[2] - a[2] * w[1], a[2] * w[0] - a[0] * w[2], a[0] * w[1] - a[1] * w[0]]; const ul = hypot(...u); u = u.map((x) => x / ul);
  return [...u, w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
});
/** The share of its pictures a thing covers: P its vertices (n of them), I its corners, stop how much of the light a
    triangle stops by its first corner (a number a vertex), F the frame { c, r } the pictures are taken in. */
function coverOf(P, n, I, stop, F, R = CROWD.PIC) {
  const k = R / (2 * F.r), T = new Float32Array(R * R), X = new Float32Array(n), Y = new Float32Array(n), [cx, cy, cz] = F.c; let sum = 0;
  for (const [ux, uy, uz, vx, vy, vz] of SIDES) {
    T.fill(1);
    for (let i = 0, p = 0; i < n; i++, p += 3) { const x = P[p] - cx, y = P[p + 1] - cy, z = P[p + 2] - cz; X[i] = (x * ux + y * uy + z * uz + F.r) * k - 0.5; Y[i] = (x * vx + y * vy + z * vz + F.r) * k - 0.5; }
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2], X0 = X[a], Y0 = Y[a], X1 = X[b], Y1 = Y[b], X2 = X[c], Y2 = Y[c];
      const x0 = max(0, ceil(min(X0, X1, X2))), x1 = min(R - 1, floor(max(X0, X1, X2))), y0 = max(0, ceil(min(Y0, Y1, Y2))), y1 = min(R - 1, floor(max(Y0, Y1, Y2)));
      if (x1 < x0 || y1 < y0) continue;   // (no pixel's middle in it: most twigs)
      const keep = 1 - stop[a], ax = X1 - X0, ay = Y1 - Y0, bx = X2 - X1, by = Y2 - Y1, gx = X0 - X2, gy = Y0 - Y2;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const e0 = ax * (y - Y0) - ay * (x - X0), e1 = bx * (y - Y1) - by * (x - X1), e2 = gx * (y - Y2) - gy * (x - X2);
        if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) T[y * R + x] *= keep;
      }
    }
    for (let i = 0; i < T.length; i++) sum += 1 - T[i];
  }
  return sum / (SIDES.length * R * R);
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

// ---- the far bodies ----
const pct = (sorted, q) => sorted[min(sorted.length - 1, max(0, floor(sorted.length * q)))];
/** A closed body round a cloud of corners (C: their places, n of them; N, AO: what each is lit with), NS corners round
    by NR rings and two poles, about `mid`, in the cloud's own proportions (`sd`: how far it spreads along each axis,
    taken as one): each corner as far out as REACH of the cloud's corners in its sector reach.
    -> { count, off (its corners from mid, at reach 1), normal, ao, uv, index, NS, NR } */
function bodyOf(C, n, N, AO, mid, sd, NS, NR, REACH) {
  const bins = (NR + 2) * NS, of = new Uint16Array(n), L = new Float32Array(n), cnt = new Uint32Array(bins + 1), lit = new Float64Array(bins * 4);
  const ringOf = (y) => min(NR + 1, floor((asin(max(-1, min(1, y))) / PI + 0.5) * (NR + 2)));
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const x = (C[p] - mid[0]) / sd[0], y = (C[p + 1] - mid[1]) / sd[1], z = (C[p + 2] - mid[2]) / sd[2], l = hypot(x, y, z) || 1e-9, b = ringOf(y / l) * NS + (floor((atan2(z, x) / (2 * PI) + 1) * NS) % NS);
    of[i] = b; L[i] = l; cnt[b + 1]++; lit[b * 4] += N[p]; lit[b * 4 + 1] += N[p + 1]; lit[b * 4 + 2] += N[p + 2]; lit[b * 4 + 3] += AO[i];
  }
  for (let b = 0; b < bins; b++) cnt[b + 1] += cnt[b];
  const by = new Float32Array(n), put = cnt.slice(0, bins); for (let i = 0; i < n; i++) by[put[of[i]]++] = L[i];
  const all = Float32Array.from(L).sort(), mean = pct(all, 0.5), R = new Float32Array(bins);
  for (let b = 0; b < bins; b++) { const s = by.subarray(cnt[b], cnt[b + 1]); R[b] = s.length >= 4 ? pct(s.sort(), REACH) : mean; }
  // a pole reaches as far as all the corners of its cap do
  const poleR = (ring) => { const s = by.slice(cnt[ring * NS], cnt[ring * NS + NS]); return s.length >= 4 ? pct(s.sort(), REACH) : mean; };
  const count = NS * NR + 2, off = new Float32Array(count * 3), normal = new Float32Array(count * 3), ao = new Float32Array(count), uv = new Float32Array(count * 2), index = [];
  let aoAll = 0; for (let i = 0; i < n; i++) aoAll += AO[i]; aoAll /= max(1, n);
  // what a corner is lit with: the crown's own corners in its sector, their normals and shade averaged (none there: the way out of the crown)
  const set = (v, x, y, z, b0, b1, u, w) => {
    off[v * 3] = x * sd[0]; off[v * 3 + 1] = y * sd[1]; off[v * 3 + 2] = z * sd[2];
    let nx = 0, ny = 0, nz = 0, a = 0, c = 0; for (let b = b0; b < b1; b++) { nx += lit[b * 4]; ny += lit[b * 4 + 1]; nz += lit[b * 4 + 2]; a += lit[b * 4 + 3]; c += cnt[b + 1] - cnt[b]; }
    let l = hypot(nx, ny, nz); if (c < 4 || l < 1e-6 * c) { nx = x / sd[0]; ny = y / sd[1]; nz = z / sd[2]; l = hypot(nx, ny, nz) || 1; }
    normal[v * 3] = nx / l; normal[v * 3 + 1] = ny / l; normal[v * 3 + 2] = nz / l; ao[v] = c >= 4 ? a / c : aoAll; uv[v * 2] = u; uv[v * 2 + 1] = w;
  };
  const lat = (i) => ((i + 1.5) / (NR + 2) - 0.5) * PI;
  for (let i = 0; i < NR; i++) for (let k = 0; k < NS; k++) { const a = ((k + 0.5) / NS) * 2 * PI, b = (i + 1) * NS + k, r = R[b]; set(i * NS + k, cos(lat(i)) * cos(a) * r, sin(lat(i)) * r, cos(lat(i)) * sin(a) * r, b, b + 1, k / NS, (i + 1) / (NR + 1)); }
  const south = NS * NR, north = south + 1; set(south, 0, -poleR(0), 0, 0, NS, 0.5, 0); set(north, 0, poleR(NR + 1), 0, (NR + 1) * NS, (NR + 2) * NS, 0.5, 1);
  for (let k = 0; k < NS; k++) { const j = (k + 1) % NS; index.push(south, j, k, north, (NR - 1) * NS + k, (NR - 1) * NS + j); for (let i = 0; i < NR - 1; i++) index.push(i * NS + k, i * NS + j, (i + 1) * NS + j, i * NS + k, (i + 1) * NS + j, (i + 1) * NS + k); }
  return { count, off, normal, ao, uv, index: Uint16Array.from(index), NS, NR };
}
/** Where each corner of a finer body lies on the next coarser one: its ring on the ring nearest in height, its place
    round the ring on the nearest there, the poles on the poles. With every corner there the finer body is the coarser
    one, triangle for triangle (the others are folded to nothing). f, c: the bodies as placed (position). */
function placesOn(f, c) {
  const to = new Float32Array(f.count * 3), lat = (H, i) => (i + 1.5) / (H.NR + 2), put = (v, w) => { to[v * 3] = c.position[w * 3]; to[v * 3 + 1] = c.position[w * 3 + 1]; to[v * 3 + 2] = c.position[w * 3 + 2]; };
  const round2 = (k) => { let best = 0, d = 9; for (let q = 0; q < c.NS; q++) { let e = abs((k + 0.5) / f.NS - (q + 0.5) / c.NS); e = min(e, 1 - e); if (e < d - 1e-9) { d = e; best = q; } } return best; };
  const d2 = (v, w) => (f.position[v * 3] - c.position[w * 3]) ** 2 + (f.position[v * 3 + 1] - c.position[w * 3 + 1]) ** 2 + (f.position[v * 3 + 2] - c.position[w * 3 + 2]) ** 2;
  for (let i = 0; i < f.NR; i++) {
    // (a ring half way between two of the coarser body's: the one its corners lie nearer to)
    let ring = 0, best = Infinity; for (let r = 0; r < c.NR; r++) { const e = abs(lat(f, i) - lat(c, r)); let far = 0; for (let k = 0; k < f.NS; k++) far += d2(i * f.NS + k, r * c.NS + round2(k)); const s = e + 1e-6 * far / (1 + far); if (e < best - 1e-9 || (abs(e - best) <= 1e-9 && s < best)) { best = e; ring = r; } }
    ring = min(max(ring, i - (f.NR - c.NR)), i);   // (in step: no ring passes another, none of the coarser's is left out)
    for (let k = 0; k < f.NS; k++) put(i * f.NS + k, ring * c.NS + round2(k));
  }
  put(f.NS * f.NR, c.NS * c.NR); put(f.NS * f.NR + 1, c.NS * c.NR + 1);
  return to;
}

/** A plant's mesh as its file draws it once (assets/kit/tree.js: position, normal, uv, part, ao, cn, root, hand, twig a
    vertex, lists of numbers or typed arrays; index its corners) -> its shape: all the engine needs to draw it at any
    size on screen (the head of this file says what). size: metres, what its size on screen is measured by (its
    kind's: a tree's height, a bush's largest side; not said: its largest side); whatever else is said takes the place
    of CROWD's number of that name (to try another), `order: 'alike'` one order over all sizes with no classes, `tip:
    'corner'` a part's single outermost corner. */
export function crowd(m, opts = {}) {
  const K = { ...CROWD, ...opts }, P = m.position, I = m.index, n = m.part.length, R = m.root, UV = m.uv;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], mean = [0, 0, 0];
  for (let p = 0; p < n * 3; p += 3) for (let a = 0; a < 3; a++) { const x = P[p + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; mean[a] += x / n; }
  const size = opts.size ?? max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  let far = 0; for (let p = 0; p < n * 3; p += 3) far = max(far, hypot(P[p] - mean[0], P[p + 1] - mean[1], P[p + 2] - mean[2]));
  const frame = { c: mean, r: far * 1.1 || 1 };   // (what its cover is reckoned in: all of it, and a little round it)

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
  const tris = new Uint32Array(I.length / 3), verts = new Uint32Array(pVerts[nP]);
  { const a = pTris.slice(0, nP), b = pVerts.slice(0, nP); for (let t = 0; t < I.length; t += 3) tris[a[pOf[I[t]]]++] = t; for (let v = 0; v < n; v++) if (pOf[v] >= 0) verts[b[pOf[v]]++] = v; }
  const cardP = (q) => m.part[verts[pVerts[q]]] === 1, quadP = (q) => pVerts[q + 1] - pVerts[q] === 4 && pTris[q + 1] - pTris[q] === 2;

  // ---- its card parts: the cards of one root ----
  const partOf = new Int32Array(nP).fill(-1), byRoot = new Map(); let N = 0, cardPieces = 0;
  for (let q = 0; q < nP; q++) if (cardP(q)) { const v = verts[pVerts[q]] * 3, key = `${R[v]},${R[v + 1]},${R[v + 2]}`; let p = byRoot.get(key); if (p === undefined) byRoot.set(key, (p = N++)); partOf[q] = p; cardPieces++; }
  if (N === 1 && cardPieces >= 2 * K.LEAST) { N = 0; for (let q = 0; q < nP; q++) if (cardP(q)) partOf[q] = N++; }   // (a mesh whose cards carry no roots: every card a part of its own)
  // the crowd's middle and how far it spreads along each axis: the crown's own proportions, in which "outermost" and the far bodies are reckoned
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
  { // its tip: the middle of the outer half of its corners (or its one outermost), out reckoned from the crowd's middle in the crown's proportions
    const out = [], ids = [];
    for (let p = 0; p < N; p++) {
      out.length = ids.length = 0;
      for (let j = pp[p]; j < pp[p + 1]; j++) for (let i = pVerts[pieces[j]]; i < pVerts[pieces[j] + 1]; i++) { const v = verts[i], d = ((P[v * 3] - mid[0]) / sd[0]) ** 2 + ((P[v * 3 + 1] - mid[1]) / sd[1]) ** 2 + ((P[v * 3 + 2] - mid[2]) / sd[2]) ** 2; let k = out.length; while (k > 0 && out[k - 1] < d) k--; out.splice(k, 0, d); ids.splice(k, 0, v); }
      const take = K.tip === 'corner' ? 1 : ceil(ids.length / 2);
      for (let k = 0; k < take; k++) for (let a = 0; a < 3; a++) tip[p * 3 + a] += P[ids[k] * 3 + a] / take;
    }
  }

  // ---- the order, and each part's go ----
  let amax = 0, atot = 0, cardN = 0, cardS = 0; for (let p = 0; p < N; p++) { amax = max(amax, area[p]); atot += area[p]; cardN += pp[p + 1] - pp[p]; cardS += sqrt(area[p] / (pp[p + 1] - pp[p])) * (pp[p + 1] - pp[p]); }
  const cls = Uint8Array.from({ length: N }, (_, p) => (K.order === 'alike' ? 0 : min(K.CLASSES - 1, floor(log2(amax / area[p]) + 1e-6))));
  const order = turnsOf(X, Y, Z, cls, mid), meta = new Float32Array(16), classes = [];
  // P0: where a card (the square its area makes, the crowd's mean) is CARD pixels on screen; with no cards, where the thing itself is
  const cardSize = cardN ? cardS / cardN : size, P0 = (K.CARD * size) / cardSize;
  { let s = 0, a = 0, at = 0; for (let c = 1; c < 4; c++) { while (at < N && cls[order[at]] < c) { s++; a += area[order[at++]]; } meta[META.CLASSES + (c - 1) * 2] = N ? s / N : 1; meta[META.CLASSES + (c - 1) * 2 + 1] = atot ? a / atot : 1; classes.push([N ? s / N : 1, atot ? a / atot : 1]); } }
  meta[META.P0] = P0; meta[META.E] = K.E; meta[META.MID] = mid[0]; meta[META.MID + 1] = mid[1]; meta[META.MID + 2] = mid[2]; meta[META.SIZE] = size; meta[META.PARTS] = N;
  // where the far body takes over: the cards would be enlarged more than KMAX times, or fewer than LEAST parts would stay; the M parts still there go one by one over its window
  let M = N;
  if (N > K.LEAST) { const aK = pow(K.KMAX, -1 / K.E); let a = 0, b = 1; for (let i = 0; i < 40; i++) { const s = (a + b) / 2; if (areaAt(s, meta) < aK) a = s; else b = s; } M = min(N, max(K.LEAST, ceil(b * N - 1e-9))); }
  const hull = { hi: P0 * pow(N ? M / N : 1, 1 / K.A), lo: 0 }; hull.lo = hull.hi / K.WIN;
  const go = Float32Array.from({ length: N }, (_, t) => (t < M ? hull.lo * pow(K.WIN, (t + 0.5) / M) : P0 * pow((t + 0.5) / N, 1 / K.A)));

  // ---- its solid pieces: how wide each is, its foot, its go ----
  // (a piece is taken as a body a ray passes twice: its area over pi times its length is then its mean width from the side)
  const solid = []; for (let q = 0; q < nP; q++) if (partOf[q] < 0) solid.push(q);
  const sW = new Float64Array(nP), sL = new Float64Array(nP), sGo = new Float64Array(nP), foot = new Float64Array(nP * 3), one = new Int32Array(n).fill(-1), near = 1e-5 * size;   // (one: corners at one place taken as one, a tube's seam)
  for (const q of solid) {
    const v0 = pVerts[q], v1 = pVerts[q + 1], c = [0, 0, 0]; for (let i = v0; i < v1; i++) { const v = verts[i] * 3; c[0] += P[v]; c[1] += P[v + 1]; c[2] += P[v + 2]; } for (let a = 0; a < 3; a++) c[a] /= v1 - v0;
    const farFrom = (x, y, z) => { let at = verts[v0], d = -1; for (let i = v0; i < v1; i++) { const v = verts[i] * 3, e = (P[v] - x) ** 2 + (P[v + 1] - y) ** 2 + (P[v + 2] - z) ** 2; if (e > d) { d = e; at = verts[i]; } } return at; };
    const a = farFrom(c[0], c[1], c[2]), b = farFrom(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], L = hypot(ux, uy, uz) || 1e-9, w = pArea[q] / (PI * L);
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
  // thick wood: what is still there where the far body takes over. It is never gone by itself (go 0)
  const there = N > 0 || solid.some((q) => sGo[q] < hull.hi);   // (a thing of sticks only, all gone before: it has no far body)
  if (!there) hull.hi = hull.lo = 0;
  for (const q of solid) if (there && sGo[q] < hull.hi) sGo[q] = 0;

  // ---- the new order of its vertices: the cards by turn, then what is drawn by corners (solids, and any card that is no quad), thick first ----
  const from = [], vGo = [], vTip = [], vTipUv = [], vCls = [], tGo = new Float32Array(N), tCls = new Uint8Array(N), tCards = new Uint32Array(N + 1), odd = [];
  // where on a card's painting the tip lies: the tip laid into the card's plane, by the painting's lie on its first triangle
  const tipUvOf = (q, T) => {
    const t = tris[pTris[q]], a = I[t], b = I[t + 1], c = I[t + 2], e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]), w = [0, 1, 2].map((k) => T[k] - P[a * 3 + k]);
    const d11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2], w1 = w[0] * e1[0] + w[1] * e1[1] + w[2] * e1[2], w2 = w[0] * e2[0] + w[1] * e2[1] + w[2] * e2[2], det = d11 * d22 - d12 * d12 || 1e-12, s = (w1 * d22 - w2 * d12) / det, r = (w2 * d11 - w1 * d12) / det;
    return [UV[a * 2] + s * (UV[b * 2] - UV[a * 2]) + r * (UV[c * 2] - UV[a * 2]), UV[a * 2 + 1] + s * (UV[b * 2 + 1] - UV[a * 2 + 1]) + r * (UV[c * 2 + 1] - UV[a * 2 + 1])];
  };
  const push = (v, g, T, tu, c) => { from.push(v); vGo.push(g); vTip.push(T[0], T[1], T[2]); vTipUv.push(tu[0] - UV[v * 2], tu[1] - UV[v * 2 + 1]); vCls.push(c); };
  for (let s = 0; s < N; s++) {
    const p = order[s], T = [tip[p * 3], tip[p * 3 + 1], tip[p * 3 + 2]]; tGo[s] = go[s]; tCls[s] = cls[p]; tCards[s] = from.length / 4;
    for (let j = pp[p]; j < pp[p + 1]; j++) {
      const q = pieces[j]; if (!quadP(q)) { odd.push([q, s]); continue; }
      // a card's corners in the one order every run is drawn by: 0 1 2, 0 2 3 (the two it shares between its triangles are 0 and 2)
      const t0 = tris[pTris[q]], t1 = tris[pTris[q] + 1], A = [I[t0], I[t0 + 1], I[t0 + 2]], B = [I[t1], I[t1 + 1], I[t1 + 2]], k = A.findIndex((v) => !B.includes(v)), d = B.find((v) => !A.includes(v)), tu = tipUvOf(q, T);
      for (const v of [A[(k + 2) % 3], A[k], A[(k + 1) % 3], d]) push(v, go[s], T, tu, cls[p]);
    }
  }
  tCards[N] = from.length / 4;
  const cards = from.length / 4, listed = [...solid.map((q) => [q, -1]), ...odd].sort((a, b) => (a[1] < 0 ? sGo[a[0]] : go[a[1]]) - (b[1] < 0 ? sGo[b[0]] : go[b[1]]) || sW[b[0]] - sW[a[0]] || a[0] - b[0]);
  const at = new Int32Array(n).fill(-1), index = new Uint32Array(listed.reduce((t, [q]) => t + (pTris[q + 1] - pTris[q]) * 3, 0)), steps = { go: new Float32Array(listed.length), corners: new Uint32Array(listed.length), verts: new Uint32Array(listed.length) };
  let ic = 0;
  listed.forEach(([q, s], i) => {
    const T = s < 0 ? [foot[q * 3], foot[q * 3 + 1], foot[q * 3 + 2]] : [tip[order[s] * 3], tip[order[s] * 3 + 1], tip[order[s] * 3 + 2]], g = s < 0 ? sGo[q] : go[s], tu = s < 0 ? null : tipUvOf(q, T);
    for (let j = pVerts[q]; j < pVerts[q + 1]; j++) { const v = verts[j]; at[v] = from.length; push(v, g, T, tu ?? [UV[v * 2], UV[v * 2 + 1]], s < 0 ? 0 : cls[order[s]]); }
    for (let j = pTris[q]; j < pTris[q + 1]; j++) { const t = tris[j]; index[ic++] = at[I[t]]; index[ic++] = at[I[t + 1]]; index[ic++] = at[I[t + 2]]; }
    steps.go[i] = g; steps.corners[i] = ic; steps.verts[i] = from.length - cards * 4;
  });
  const count = from.length, out = {};
  // every number the mesh carries a vertex, as it is, in the new order
  for (const [key, a] of Object.entries(m)) { if (key === 'index' || !(Array.isArray(a) || ArrayBuffer.isView(a)) || !a.length || a.length % n) continue; const w = a.length / n, b = new Float32Array(count * w); for (let i = 0; i < count; i++) for (let k = 0; k < w; k++) b[i * w + k] = a[from[i] * w + k]; out[key] = b; }
  for (let i = cards * 4; i < count; i++) if (out.part[i] !== 1) { const q = pOf[from[i]]; out.root[i * 3] = foot[q * 3]; out.root[i * 3 + 1] = foot[q * 3 + 1]; out.root[i * 3 + 2] = foot[q * 3 + 2]; }   // (a solid's root: its foot)

  // ---- the far bodies: round the crown (a thing of no cards: round its thick pieces), sized to the plant's cover ----
  const stop = Float32Array.from({ length: n }, (_, v) => (m.part[v] === 1 ? K.STOPS : 1)), cover = there ? coverOf(P, n, I, stop, frame, K.PIC) : 0;
  let hulls = [], post = null;
  if (there) {
    // the cloud the bodies are laid round, and what each of its corners is lit with
    const ids = []; for (let q = 0; q < nP; q++) if (N ? partOf[q] >= 0 : sGo[q] === 0) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) ids.push(verts[i]);
    const C = new Float32Array(ids.length * 3), CN = new Float32Array(ids.length * 3), CA = new Float32Array(ids.length); let stuff = 0;
    ids.forEach((v, i) => { for (let a = 0; a < 3; a++) { C[i * 3 + a] = P[v * 3 + a]; CN[i * 3 + a] = m.normal[v * 3 + a]; } CA[i] = m.ao[v]; stuff += m.part[v] === 0 ? 1 : 0; });
    const bm = N ? mid : [0, 0, 0], bs = N ? sd : [0, 0, 0];
    if (!N) { for (let i = 0; i < C.length; i++) bm[i % 3] += C[i] / ids.length; for (let i = 0; i < C.length; i++) bs[i % 3] += (C[i] - bm[i % 3]) ** 2 / ids.length; for (let a = 0; a < 3; a++) bs[a] = sqrt(bs[a]) || 1e-9; meta[META.MID] = bm[0]; meta[META.MID + 1] = bm[1]; meta[META.MID + 2] = bm[2]; }
    const placed = (H, reach) => Float32Array.from(H.off, (x, i) => bm[i % 3] + x * reach);
    hulls = K.HULLS.map(([NS, NR]) => { const H = bodyOf(C, ids.length, CN, CA, bm, bs, NS, NR, K.REACH); return { ...H, tris: H.index.length / 3, part: N || stuff * 2 < ids.length ? 2 : 0, reach: 1, position: placed(H, 1) }; });
    // the post: the thick wood that stands out of the first body, as one three-sided post from its far end into the body
    const H0 = hulls[0], thick = N ? solid.filter((q) => sGo[q] === 0) : [];
    if (thick.length) {
      // how far the body reaches from its middle towards a point: 1 at its skin
      const skin = (x, y, z) => { const dx = x - bm[0], dy = y - bm[1], dz = z - bm[2]; let best = Infinity; for (let t = 0; t < H0.index.length; t += 3) { const a = H0.index[t] * 3, b = H0.index[t + 1] * 3, c = H0.index[t + 2] * 3, Q = H0.position, ax = Q[a] - bm[0], ay = Q[a + 1] - bm[1], az = Q[a + 2] - bm[2], e1x = Q[b] - Q[a], e1y = Q[b + 1] - Q[a + 1], e1z = Q[b + 2] - Q[a + 2], e2x = Q[c] - Q[a], e2y = Q[c + 1] - Q[a + 1], e2z = Q[c + 2] - Q[a + 2], px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if (abs(det) < 1e-12) continue; const u = -(ax * px + ay * py + az * pz) / det, qx = -(ay * e1z - az * e1y), qy = -(az * e1x - ax * e1z), qz = -(ax * e1y - ay * e1x), v = (dx * qx + dy * qy + dz * qz) / det, tt = (e2x * qx + e2y * qy + e2z * qz) / det; if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6 && tt > 0 && tt < best) best = tt; } return best; };
      const outV = new Uint8Array(n); let fx = 0, fy = 0, fz = 0, dmax = -1, fq = -1;
      for (const q of thick) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { const v = verts[i]; if (skin(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) < 1) { outV[v] = 1; const d = hypot(P[v * 3] - bm[0], P[v * 3 + 1] - bm[1], P[v * 3 + 2] - bm[2]); if (d > dmax) { dmax = d; fq = q; } } }
      if (fq >= 0) {
        let k = 0; for (const q of thick) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { const v = verts[i]; if (outV[v] && hypot(P[v * 3] - bm[0], P[v * 3 + 1] - bm[1], P[v * 3 + 2] - bm[2]) >= dmax - sW[fq]) { fx += P[v * 3]; fy += P[v * 3 + 1]; fz += P[v * 3 + 2]; k++; } }
        fx /= k; fy /= k; fz /= k;
        const h = skin(fx, fy, fz), S = [bm[0] + (fx - bm[0]) * h, bm[1] + (fy - bm[1]) * h, bm[2] + (fz - bm[2]) * h], Lp = hypot(S[0] - fx, S[1] - fy, S[2] - fz), ax = [(S[0] - fx) / (Lp || 1), (S[1] - fy) / (Lp || 1), (S[2] - fz) / (Lp || 1)];
        // how wide the wood out there is, towards its foot and towards the body: its area over each half of the post's length
        let a0 = 0, a1 = 0, aoS = 0, aoN = 0, vmax = 0, umax = 0, vmin = Infinity;
        for (const q of thick) for (let j = pTris[q]; j < pTris[q + 1]; j++) { const t = tris[j], a = I[t], b = I[t + 1], c = I[t + 2]; if (!(outV[a] && outV[b] && outV[c])) continue; const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2], ar = hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2, along = (((P[a * 3] + P[b * 3] + P[c * 3]) / 3 - fx) * ax[0] + ((P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3 - fy) * ax[1] + ((P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3 - fz) * ax[2]) / (Lp || 1); if (along < 0.5) a0 += ar; else a1 += ar; aoS += m.ao[a] * ar; aoN += ar; }
        for (let i = pVerts[fq]; i < pVerts[fq + 1]; i++) { const v = verts[i]; umax = max(umax, UV[v * 2]); vmax = max(vmax, UV[v * 2 + 1]); vmin = min(vmin, UV[v * 2 + 1]); }
        if (Lp > 0.02 * size && a0 + a1 > 0) {
          // (three-sided, it shows 1.65 times its corners' reach on average: as wide as the wood it stands for)
          const w0 = a0 / (PI * Lp * 0.5), w1 = a1 / (PI * Lp * 0.5), wm = (w0 + w1) / 2, rOf = (w) => (min(3 * wm, max(0.3 * wm, w)) * PI) / (3 * sqrt(3)), r0 = rOf(1.5 * w0 - 0.5 * w1), r1 = rOf(1.5 * w1 - 0.5 * w0);
          const top = [S[0] + (bm[0] - S[0]) * 0.35, S[1] + (bm[1] - S[1]) * 0.35, S[2] + (bm[2] - S[2]) * 0.35], Lt = hypot(top[0] - fx, top[1] - fy, top[2] - fz);
          const e = abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; let n1 = [ax[1] * e[2] - ax[2] * e[1], ax[2] * e[0] - ax[0] * e[2], ax[0] * e[1] - ax[1] * e[0]]; const nl = hypot(...n1); n1 = n1.map((x) => x / nl); const n2 = [ax[1] * n1[2] - ax[2] * n1[1], ax[2] * n1[0] - ax[0] * n1[2], ax[0] * n1[1] - ax[1] * n1[0]];
          post = { count: 8, position: new Float32Array(24), normal: new Float32Array(24), uv: new Float32Array(16), ao: new Float32Array(8).fill(aoN ? aoS / aoN : 1), to: new Float32Array(24), index: Uint16Array.from([0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3]) };
          for (let i = 0; i < 2; i++) for (let s = 0; s <= 3; s++) { const a = (s / 3) * 2 * PI, v = i * 4 + s, c = i ? top : [fx, fy, fz], r = i ? r1 : r0; for (let j = 0; j < 3; j++) { const d = n1[j] * cos(a) + n2[j] * sin(a); post.position[v * 3 + j] = c[j] + d * r; post.normal[v * 3 + j] = d; post.to[v * 3 + j] = c[j]; } post.uv[v * 2] = (s / 3) * max(1, round(umax)); post.uv[v * 2 + 1] = (i * Lt * (vmax - vmin)) / sL[fq]; }
        }
      }
    }
    // each body sized so that, with the post, the plant covers as much as it did
    const one = new Float32Array(64).fill(1);
    hulls.forEach((H, hi) => {
      const withPost = post && hi < 2, nq = H.count + (withPost ? post.count : 0), Q = new Float32Array(nq * 3), J = new Uint16Array(H.index.length + (withPost ? post.index.length : 0));
      J.set(H.index); if (withPost) { Q.set(post.position, H.count * 3); for (let i = 0; i < post.index.length; i++) J[H.index.length + i] = post.index[i] + H.count; }
      let a = 0.3, b = 2; for (let i = 0; i < 9; i++) { const r = (a + b) / 2; Q.set(placed(H, r)); if (coverOf(Q, nq, J, one, frame, K.PIC) > cover) b = r; else a = r; }
      H.reach = (a + b) / 2; H.position = placed(H, H.reach);
    });
    hulls.forEach((H, hi) => { H.to = hi + 1 < hulls.length ? placesOn(H, hulls[hi + 1]) : Float32Array.from({ length: H.count * 3 }, (_, i) => bm[i % 3]); });
    hulls = hulls.map(({ off, NS, NR, ...H }) => H);
  }
  meta[META.HI] = hull.hi; meta[META.LO] = hull.lo; meta[META.CARDS] = cards;
  return { count, cards, parts: N, solids: listed.length, ...out, go: Float32Array.from(vGo), tip: Float32Array.from(vTip), tipUv: Float32Array.from(vTipUv), cls: Float32Array.from(vCls), index, steps, turns: { go: tGo, cls: tCls, cards: tCards },
    meta, P0, E: K.E, A: K.A, size, mid: [meta[META.MID], meta[META.MID + 1], meta[META.MID + 2]], spread: sd, classes, hull, cover, hulls, post };
}
