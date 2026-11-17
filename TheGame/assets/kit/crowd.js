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
//     Position and painting scale alike about the tip: a card shows more of its picture, never the picture stretched;
//   - a solid piece is gone where it is narrower on screen than TWIG pixels, and shrinks to its foot (the middle of
//     its wider end). The solids' corners are sorted thick first: a first share of the list is the thick wood;
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
//     P0, E, A, size, mid, spread, classes, hull { hi, lo }, cover    the same by name, and what was measured
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
  E: 0.45,         // how much those that stay are enlarged: by (the share of the cards' area that is drawn)^-E. Measured on every shape that has cards enough to measure (EMIN … EMAX); this is for the others
  EMIN: 0.2, EMAX: 0.6,
  KMAX: 5,         // … and never by more than this: where it is reached the far body takes over
  LEAST: 8,        // … or where fewer card parts than this would stay
  WIN: 1.3,        // the far body takes over from its start down to this many times smaller: the last parts go one by one, the body grows from the crown's middle
  GROW: 1.1,       // a part grows from its root between its `go` and this many times it
  TWIG: 0.75,      // pixels: a solid piece is gone where it is narrower on screen than this
  RUN: 16,         // cards in a run: the engine draws a crowd's cards by runs, each 4 x RUN vertices and one shared list of 6 x RUN corners
  CLASSES: 4,      // the most classes by size a crowd is sorted into (each half the area of the one before)
  HULLS: [[6, 3], [5, 2], [4, 1]],   // the far bodies, finest first: corners round a ring, rings between the two poles (36, 20 and 8 triangles)
  TURN: [[24, 18], [9, 7]],          // pixels: between which sizes the first body turns into the second, and the second into the third (the post thins away with the second). Each ends where today's kinds' bands for trees end (18, 7): a level of the far band then holds one body, not three
  BAKE: 48,        // texels a side of each of a crown's baked views (bakeOf), where its far bodies wear it (LOD.BAKE)
  FAR: 18,         // pixels: the far body has taken over by this size at the latest (a crown's cards are then a pixel or two each), so the far levels hold no cards
  REACH: 0.95,     // a body's corner lies as far out as this share of the crown's corners in its sector reach
  STOPS: 1 - sqrt(1 - 0.45),         // how much of the light one triangle of a card stops (a sprig of two crossed cards: 45 %), where cover is reckoned
  PIC: 64,         // … in pictures of this many pixels a side, from thirteen sides
};
/** Whether the plants are drawn by this kit (`?lod=new`, set by src/scatter/trees.js before anything is built, and handed
    to the recipes' workers), and the numbers that set what a plant costs. CARD: at today's level bands a card of the
    research's 15 pixels submits two to four times today's level at the top of a band; 30 brings the plants to about
    main's vertices (intent 0033, Build). KMAX: the far body comes no sooner than the cards' enlarging must stop.
    SPLIT: no level the kit makes wider than this many times on screen where it can hold cards (assets/kit/tree.js; 0:
    the kinds' bands as they are): a level holds all its band may show at its widest. 0 by default: cut at 2, fewer
    vertices were submitted but the frame was slower (more tiers to pack, more draws; intent 0033, Build). STANDS: the size a stand that
    changes level as one measures its plants by, of each plant asset (src/scatter/trees.js). `?card=`, `?kmax=` and
    `?split=` change them. */
export const LOD = { on: false, CARD: 30, KMAX: 8, SPLIT: 0, BAKE: false, FAR: 18, STANDS: null };
// BAKE: the far bodies wear their crown baked (bakeOf); FAR: CROWD.FAR's. Under `?lod=new` the game sets BAKE and FAR 40:
// from 90 m a baked body reads as a crown with its shade and gaps where a few enlarged cards read as large flat leaves,
// and the far body from 40 px costs less than the cards (intent 0033, Build). `?bake=0`, `?far=` to compare.
/** Where each of a shape's sixteen numbers lies in `meta`: P0, E, where the far body begins and has taken over (pixels),
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
  const far = S.hull.hi > 0, plant = !far || px > S.hull.lo, body = far && px < S.hull.hi ? (px > K.TURN[0][1] ? 0 : px > K.TURN[1][1] ? 1 : 2) : -1;
  const cards = plant ? ceil(shareAt(px, S.P0, S.A) * S.cards) : 0, runs = ceil(cards / K.RUN);
  let i = 0; while (plant && i < S.solids && S.steps.go[i] < px) i++;
  if (plant && far && hullAt(px, S.meta) >= 0.5) i = 0;   // (the thick wood has given way to the post)
  const solids = i ? S.steps.verts[i - 1] : 0, bodyV = body < 0 ? 0 : S.hulls[body].count + (S.post && body < 2 ? S.post.count : 0);
  return { cards, runs, corners: i ? S.steps.corners[i - 1] : 0, body, verts: { cards: runs * K.RUN * 4, solids, body: bodyV, all: runs * K.RUN * 4 + solids + bodyV } };
}

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
  const middling = pct(Float32Array.from(L).sort(), 0.5), R = new Float32Array(bins);   // (a sector with next to nothing in it: as far as the cloud's corners lie on the whole)
  for (let b = 0; b < bins; b++) { const s = by.subarray(cnt[b], cnt[b + 1]); R[b] = s.length >= 4 ? pct(s.sort(), REACH) : middling; }
  const poleR = (ring) => { const s = by.slice(cnt[ring * NS], cnt[ring * NS + NS]); return s.length >= 4 ? pct(s.sort(), REACH) : middling; };   // (a pole: as far as all the corners of its cap reach)
  const count = NS * NR + 2, off = new Float32Array(count * 3), normal = new Float32Array(count * 3), ao = new Float32Array(count), uv = new Float32Array(count * 2), index = [];
  let aoAll = 0; for (let i = 0; i < n; i++) aoAll += AO[i] / max(1, n);
  // a corner: its place, and what it is lit with: the cloud's own corners in its sector, their normals and shade averaged (none there: the way out of the cloud)
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
  const round = (k) => { let best = 0, d = 9; for (let q = 0; q < c.NS; q++) { let e = abs((k + 0.5) / f.NS - (q + 0.5) / c.NS); e = min(e, 1 - e); if (e < d - 1e-9) { d = e; best = q; } } return best; };
  const d2 = (v, w) => (f.position[v * 3] - c.position[w * 3]) ** 2 + (f.position[v * 3 + 1] - c.position[w * 3 + 1]) ** 2 + (f.position[v * 3 + 2] - c.position[w * 3 + 2]) ** 2;
  for (let i = 0; i < f.NR; i++) {
    // (a ring half way between two of the coarser body's: the one its corners lie nearer to)
    let ring = 0, best = Infinity, bestFar = Infinity;
    for (let r = 0; r < c.NR; r++) { const e = abs(lat(f, i) - lat(c, r)); let far = 0; for (let k = 0; k < f.NS; k++) far += d2(i * f.NS + k, r * c.NS + round(k)); if (e < best - 1e-9 || (e < best + 1e-9 && far < bestFar)) { best = e; bestFar = far; ring = r; } }
    ring = min(max(ring, i - (f.NR - c.NR)), i);   // (in step: no ring passes another, none of the coarser's is left out)
    for (let k = 0; k < f.NS; k++) put(i * f.NS + k, ring * c.NS + round(k));
  }
  put(f.NS * f.NR, c.NS * c.NR); put(f.NS * f.NR + 1, c.NS * c.NR + 1);
  return to;
}
/** How far a body reaches from its middle towards a point, of the way to the point: under 1, the point lies outside
    it. Q the body's corners, J its triangles. */
function skinAt(Q, J, mid, x, y, z) {
  const dx = x - mid[0], dy = y - mid[1], dz = z - mid[2]; let best = Infinity;
  for (let t = 0; t < J.length; t += 3) {
    const a = J[t] * 3, b = J[t + 1] * 3, c = J[t + 2] * 3, ox = mid[0] - Q[a], oy = mid[1] - Q[a + 1], oz = mid[2] - Q[a + 2];
    const e1x = Q[b] - Q[a], e1y = Q[b + 1] - Q[a + 1], e1z = Q[b + 2] - Q[a + 2], e2x = Q[c] - Q[a], e2y = Q[c + 1] - Q[a + 1], e2z = Q[c + 2] - Q[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if (abs(det) < 1e-12) continue;
    const u = (ox * px + oy * py + oz * pz) / det, qx = oy * e1z - oz * e1y, qy = oz * e1x - ox * e1z, qz = ox * e1y - oy * e1x, v = (dx * qx + dy * qy + dz * qz) / det, t1 = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6 && t1 > 0 && t1 < best) best = t1;
  }
  return best;
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
  const bodies = K.HULLS.reduce((s, [a, b]) => [s[0] + a * b + 2, s[1] + 2 * a * b], [8, 6]);   // (every far body and the post)
  const baked = K.baked ? bakedVerts(K) : 0;   // (the crown baked, where a level carries it)
  return his.map((hi) => { const share = H.N ? min(1, shareAt(hi * K.WIN, H.P0, K.A)) : 0, cards = min(quads, ceil(share * H.N) * H.most); return { verts: 1 + baked + cards * 4 + sv + bodies[0], tris: cards * 2 + st + bodies[1] }; });
}

export function crowd(m, opts = {}) {
  const K = { ...CROWD, ...opts }, P = m.position, I = m.index, n = m.part.length, R = m.root, UV = m.uv;
  const Hd = headOf(m, K), { lo, hi, mean, size, frame, up, find, name, pOf, nP, pTris, pVerts, pArea, tris, verts, cardP, quadP, partOf, cardPieces, P0 } = Hd; let N = Hd.N;
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
  if (opts.E == null && N > K.LEAST) {
    const s = max(0.1, K.LEAST / N), px = P0 * pow(s, 1 / K.A), a = areaAt(s, meta), ids = [], of = [], J = [], at = new Map();
    for (let t = 0; t < N; t++) {
      const g = grownAt(px, P0 * pow((t + 0.5) / N, 1 / K.A), K.GROW); if (g <= 0) break;
      for (let j = pp[order[t]]; j < pp[order[t] + 1]; j++) { const q = pieces[j]; for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { at.set(verts[i], ids.length); ids.push(verts[i]); of.push(order[t], g); } for (let i = pTris[q]; i < pTris[q + 1]; i++) J.push(at.get(I[tris[i]]), at.get(I[tris[i] + 1]), at.get(I[tris[i] + 2])); }
    }
    const Q = new Float32Array(ids.length * 3), st = new Float32Array(ids.length).fill(K.STOPS);
    const k = a < 0.7 && coverCards > 0 ? reaching((k) => {
      for (let i = 0; i < ids.length; i++) { const v = ids[i] * 3, p = of[i * 2] * 3, g = of[i * 2 + 1]; for (let c = 0; c < 3; c++) { const T = tip[p + c], r = T + (R[v + c] - T) * k; Q[i * 3 + c] = r + (T + (P[v + c] - T) * k - r) * g; } }
      return coverOf(Q, ids.length, J, st, frame, K.PIC);
    }, coverCards, pow(a, -K.E), 1.2) : 0;
    if (k > 1) E = min(K.EMAX, max(K.EMIN, -log(k) / log(a)));
  }
  meta[META.P0] = P0; meta[META.E] = E; meta[META.SIZE] = size; meta[META.PARTS] = N; meta.set(mid, META.MID);
  // where the far body takes over: the cards would be enlarged more than KMAX times, or fewer than LEAST parts would stay; the M parts still there go one by one over its window
  let M = N;
  if (N > K.LEAST) { const aK = pow(K.KMAX, -1 / E); let a = 0, b = 1; for (let i = 0; i < 40; i++) { const s = (a + b) / 2; if (areaAt(s, meta) < aK) a = s; else b = s; } M = min(N, max(K.LEAST, ceil(b * N - 1e-9))); }
  const hull = { hi: P0 * pow(N ? M / N : 1, 1 / K.A), lo: 0 };
  if (N > K.LEAST && hull.hi < K.FAR * K.WIN) { hull.hi = K.FAR * K.WIN; M = min(N, max(K.LEAST, ceil(shareAt(hull.hi, P0, K.A) * N - 1e-9))); }   // (no later than FAR: fewer parts go one by one over its window, from a larger share)
  hull.lo = hull.hi / K.WIN;
  const go = Float32Array.from({ length: N }, (_, t) => (t < M ? hull.lo * pow(K.WIN, (t + 0.5) / M) : P0 * pow((t + 0.5) / N, 1 / K.A)));

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
  // thick wood: what is still there where the far body takes over. It is never gone by itself (go 0)
  const there = N > 0 || solid.some((q) => sGo[q] < hull.hi);   // (a thing of sticks only, all gone before: it has no far body)
  if (!there) hull.hi = hull.lo = 0;
  for (const q of solid) if (there && sGo[q] < hull.hi) sGo[q] = 0;

  // ---- the new order of its vertices: the cards by turn, then what is drawn by corners (the solids, and any card that is no quad), thick first ----
  const odd = []; let cards = 0; for (let s = 0; s < N; s++) for (let j = pp[order[s]]; j < pp[order[s] + 1]; j++) if (quadP(pieces[j])) cards++; else odd.push([pieces[j], s]);
  const listed = [...solid.map((q) => [q, -1]), ...odd].sort((a, b) => (a[1] < 0 ? sGo[a[0]] : go[a[1]]) - (b[1] < 0 ? sGo[b[0]] : go[b[1]]) || sW[b[0]] - sW[a[0]] || a[0] - b[0]);
  const count = cards * 4 + listed.reduce((t, [q]) => t + pVerts[q + 1] - pVerts[q], 0), from = new Int32Array(count), at = new Int32Array(n).fill(-1);
  const S = { go: new Float32Array(count), tip: new Float32Array(count * 3), tipUv: new Float32Array(count * 2), cls: new Float32Array(count) };
  const index = new Uint32Array(listed.reduce((t, [q]) => t + (pTris[q + 1] - pTris[q]) * 3, 0)), steps = { go: new Float32Array(listed.length), corners: new Uint32Array(listed.length), verts: new Uint32Array(listed.length) };
  const turns = { go: go, cls: new Uint8Array(N), cards: new Uint32Array(N + 1) };
  // where on a card's painting a point lies: the point laid into the card's plane, by the painting's lie on the card's first triangle
  const uvAt = (q, x, y, z) => {
    const t = tris[pTris[q]], a = I[t], b = I[t + 1], c = I[t + 2], ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2], bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2], wx = x - P[a * 3], wy = y - P[a * 3 + 1], wz = z - P[a * 3 + 2];
    const d11 = ax * ax + ay * ay + az * az, d12 = ax * bx + ay * by + az * bz, d22 = bx * bx + by * by + bz * bz, w1 = wx * ax + wy * ay + wz * az, w2 = wx * bx + wy * by + wz * bz, det = d11 * d22 - d12 * d12 || 1e-12, s = (w1 * d22 - w2 * d12) / det, r = (w2 * d11 - w1 * d12) / det;
    return [UV[a * 2] + s * (UV[b * 2] - UV[a * 2]) + r * (UV[c * 2] - UV[a * 2]), UV[a * 2 + 1] + s * (UV[b * 2 + 1] - UV[a * 2 + 1]) + r * (UV[c * 2 + 1] - UV[a * 2 + 1])];
  };
  let o = 0;
  const put = (v, g, x, y, z, u, w, c) => { from[o] = v; S.go[o] = g; S.tip[o * 3] = x; S.tip[o * 3 + 1] = y; S.tip[o * 3 + 2] = z; S.tipUv[o * 2] = u - UV[v * 2]; S.tipUv[o * 2 + 1] = w - UV[v * 2 + 1]; S.cls[o++] = c; };
  for (let s = 0; s < N; s++) {
    const p = order[s], x = tip[p * 3], y = tip[p * 3 + 1], z = tip[p * 3 + 2]; turns.cls[s] = cls[p]; turns.cards[s] = o / 4;
    for (let j = pp[p]; j < pp[p + 1]; j++) {
      const q = pieces[j]; if (!quadP(q)) continue;
      // a card's corners in the one order every run is drawn by: 0 1 2, 0 2 3 (0 and 2 are the two its triangles share)
      const t0 = tris[pTris[q]], t1 = tris[pTris[q] + 1], A = [I[t0], I[t0 + 1], I[t0 + 2]], B = [I[t1], I[t1 + 1], I[t1 + 2]], k = A.findIndex((v) => !B.includes(v)), d = B.find((v) => !A.includes(v)), [u, w] = uvAt(q, x, y, z);
      put(A[(k + 2) % 3], go[s], x, y, z, u, w, cls[p]); put(A[k], go[s], x, y, z, u, w, cls[p]); put(A[(k + 1) % 3], go[s], x, y, z, u, w, cls[p]); put(d, go[s], x, y, z, u, w, cls[p]);
    }
  }
  turns.cards[N] = cards;
  let ic = 0;
  listed.forEach(([q, s], i) => {
    const T = s < 0 ? foot.subarray(q * 3, q * 3 + 3) : tip.subarray(order[s] * 3, order[s] * 3 + 3), g = s < 0 ? sGo[q] : go[s], tu = s < 0 ? null : uvAt(q, T[0], T[1], T[2]);
    for (let j = pVerts[q]; j < pVerts[q + 1]; j++) { const v = verts[j]; at[v] = o; put(v, g, T[0], T[1], T[2], tu ? tu[0] : UV[v * 2], tu ? tu[1] : UV[v * 2 + 1], s < 0 ? 0 : cls[order[s]]); }
    for (let j = pTris[q]; j < pTris[q + 1]; j++) { const t = tris[j]; index[ic++] = at[I[t]]; index[ic++] = at[I[t + 1]]; index[ic++] = at[I[t + 2]]; }
    steps.go[i] = g; steps.corners[i] = ic; steps.verts[i] = o - cards * 4;
  });
  // every number the mesh carries a vertex, as it is, in the new order
  const out = {};
  for (const [key, a] of Object.entries(m)) { if (key === 'index' || !(Array.isArray(a) || ArrayBuffer.isView(a)) || !a.length || a.length % n) continue; const w = a.length / n, b = new Float32Array(count * w); for (let i = 0; i < count; i++) for (let k = 0; k < w; k++) b[i * w + k] = a[from[i] * w + k]; out[key] = b; }
  for (let i = cards * 4; i < count; i++) if (out.part[i] !== 1) out.root.set(foot.subarray(pOf[from[i]] * 3, pOf[from[i]] * 3 + 3), i * 3);   // (a solid's root: its foot)

  // ---- the far bodies: round the crown (a thing of no cards: round its thick pieces), sized to the plant's cover ----
  let hulls = [], post = null, bm = mid, bs = sd;
  if (there) {
    // the cloud the bodies are laid round, and what each of its corners is lit with
    const ids = []; for (let q = 0; q < nP; q++) if (N ? partOf[q] >= 0 : sGo[q] === 0) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) ids.push(verts[i]);
    const C = new Float32Array(ids.length * 3), CN = new Float32Array(ids.length * 3), CA = new Float32Array(ids.length); let wood = 0;
    ids.forEach((v, i) => { for (let a = 0; a < 3; a++) { C[i * 3 + a] = P[v * 3 + a]; CN[i * 3 + a] = m.normal[v * 3 + a]; } CA[i] = m.ao[v]; wood += m.part[v] === 0 ? 1 : 0; });
    if (!N) { bm = [0, 0, 0]; bs = [0, 0, 0]; for (let i = 0; i < C.length; i++) bm[i % 3] += C[i] / ids.length; for (let i = 0; i < C.length; i++) bs[i % 3] += (C[i] - bm[i % 3]) ** 2 / ids.length; bs = bs.map((x) => sqrt(x) || 1e-9); meta.set(bm, META.MID); }
    const placed = (H, reach) => Float32Array.from(H.off, (x, i) => bm[i % 3] + x * reach);
    hulls = K.HULLS.map(([NS, NR]) => { const H = bodyOf(C, ids.length, CN, CA, bm, bs, NS, NR, K.REACH); return { ...H, tris: H.index.length / 3, part: N || wood * 2 < ids.length ? 2 : 0, reach: 1, position: placed(H, 1) }; });
    post = N ? postOf() : null;
    // each body sized so that, with the post, the thing covers as much as it did
    const want = N ? cover : coverOf(P, n, I, stop, frame, K.PIC), ones = new Float32Array(64).fill(1);
    hulls.forEach((H, i) => {
      const P2 = post && i < 2 ? post : null, nq = H.count + (P2 ? P2.count : 0), Q = new Float32Array(nq * 3), J = new Uint16Array(H.index.length + (P2 ? P2.index.length : 0));
      J.set(H.index); if (P2) { Q.set(P2.position, H.count * 3); J.set(P2.index.map((v) => v + H.count), H.index.length); }
      H.reach = K.enclose ? K.enclose : reaching((r) => { Q.set(placed(H, r)); return coverOf(Q, nq, J, ones, frame, K.PIC); }, want, 1, 2);   // (a body that wears its crown baked encloses it: the bake's gaps say what it covers)
      H.position = placed(H, H.reach);
    });
    hulls.forEach((H, i) => { H.to = i + 1 < hulls.length ? placesOn(H, hulls[i + 1]) : Float32Array.from({ length: H.count * 3 }, (_, j) => bm[j % 3]); });
    hulls = hulls.map(({ off, NS, NR, ...H }) => H);
  }
  /** The post: the thick wood that stands out of the first far body, as one three-sided post from its far end into the body. */
  function postOf() {
    const H = hulls[0], thick = solid.filter((q) => sGo[q] === 0), outV = new Uint8Array(n), dist = (v) => hypot(P[v * 3] - bm[0], P[v * 3 + 1] - bm[1], P[v * 3 + 2] - bm[2]);
    let dmax = -1, fq = -1;
    for (const q of thick) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { const v = verts[i]; if (skinAt(H.position, H.index, bm, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) < 1) { outV[v] = 1; if (dist(v) > dmax) { dmax = dist(v); fq = q; } } }
    if (fq < 0) return null;
    // its foot: the middle of the corners that lie farthest out (within the piece's own width of the farthest); its way: from there to the body's middle
    const F = [0, 0, 0]; let k = 0; for (const q of thick) for (let i = pVerts[q]; i < pVerts[q + 1]; i++) { const v = verts[i]; if (outV[v] && dist(v) >= dmax - sW[fq]) { F[0] += P[v * 3]; F[1] += P[v * 3 + 1]; F[2] += P[v * 3 + 2]; k++; } }
    for (let a = 0; a < 3; a++) F[a] /= k;
    const h = skinAt(H.position, H.index, bm, F[0], F[1], F[2]), In = F.map((x, a) => bm[a] + (x - bm[a]) * h), Lp = hypot(In[0] - F[0], In[1] - F[1], In[2] - F[2]), ax = In.map((x, a) => (x - F[a]) / (Lp || 1));   // (In: where it meets the body's skin)
    // how wide the wood out there is, towards its foot and towards the body: its area over each half of the post's length
    let a0 = 0, a1 = 0, aoS = 0;
    for (const q of thick) for (let j = pTris[q]; j < pTris[q + 1]; j++) {
      const t = tris[j], a = I[t], b = I[t + 1], c = I[t + 2]; if (!(outV[a] && outV[b] && outV[c])) continue;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2], ar = hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      const along = [0, 1, 2].reduce((s, e) => s + ((P[a * 3 + e] + P[b * 3 + e] + P[c * 3 + e]) / 3 - F[e]) * ax[e], 0) / (Lp || 1);
      if (along < 0.5) a0 += ar; else a1 += ar; aoS += m.ao[a] * ar;
    }
    if (!(Lp > 0.02 * size) || !(a0 + a1 > 0)) return null;
    // (three-sided, a post shows 1.65 times its corners' reach from the side on average: so it is as wide as the wood it stands for)
    const w0 = a0 / (PI * Lp * 0.5), w1 = a1 / (PI * Lp * 0.5), wm = (w0 + w1) / 2, rOf = (w) => (min(3 * wm, max(0.3 * wm, w)) * PI) / (3 * sqrt(3)), r = [rOf(1.5 * w0 - 0.5 * w1), rOf(1.5 * w1 - 0.5 * w0)];
    const top = In.map((x, a) => x + (bm[a] - x) * 0.35), ends = [F, top], Lt = hypot(top[0] - F[0], top[1] - F[1], top[2] - F[2]);   // (it ends a third of the way into the body: no gap at any reach)
    const e = abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; let n1 = [ax[1] * e[2] - ax[2] * e[1], ax[2] * e[0] - ax[0] * e[2], ax[0] * e[1] - ax[1] * e[0]]; const nl = hypot(...n1); n1 = n1.map((x) => x / nl); const n2 = [ax[1] * n1[2] - ax[2] * n1[1], ax[2] * n1[0] - ax[0] * n1[2], ax[0] * n1[1] - ax[1] * n1[0]];
    // its bark as the piece's it stands for: as many times round, as many tiles a metre along
    let umax = 0, vmax = -Infinity, vmin = Infinity; for (let i = pVerts[fq]; i < pVerts[fq + 1]; i++) { const v = verts[i]; umax = max(umax, UV[v * 2]); vmax = max(vmax, UV[v * 2 + 1]); vmin = min(vmin, UV[v * 2 + 1]); }
    const G = { count: 8, position: new Float32Array(24), normal: new Float32Array(24), uv: new Float32Array(16), ao: new Float32Array(8).fill(aoS / (a0 + a1)), to: new Float32Array(24), index: Uint16Array.from([0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3]) };
    for (let i = 0; i < 2; i++) for (let s = 0; s <= 3; s++) {
      const a = (s / 3) * 2 * PI, v = i * 4 + s;
      for (let j = 0; j < 3; j++) { const d = n1[j] * cos(a) + n2[j] * sin(a); G.position[v * 3 + j] = ends[i][j] + d * r[i]; G.normal[v * 3 + j] = d; G.to[v * 3 + j] = ends[i][j]; }
      G.uv[v * 2] = (s / 3) * max(1, round(umax)); G.uv[v * 2 + 1] = (i * Lt * (vmax - vmin)) / sL[fq];
    }
    return G;
  }
  meta[META.HI] = hull.hi; meta[META.LO] = hull.lo; meta[META.CARDS] = cards;
  return { count, cards, parts: N, solids: listed.length, ...out, ...S, index, steps, turns, meta, P0, E, A: K.A, KMAX: K.KMAX, size, mid: bm, spread: bs, classes, hull, cover: N ? cover : 0, hulls, post };
}

// ---- a shape as the engine draws it between two sizes on screen ----
/** Where each of a level's sixteen numbers lies (levelOf: `rule`): what the one rule reads of its shape. X: under how many
    pixels the wood has given way to the post (half way through the far body's coming). */
export const RULE = { P0: 0, E: 1, HI: 2, LO: 3, CLASSES: 4, A: 10, X: 11, KMAX: 12, BAKED: 13 };   // BAKED: the baked crown's half width (bakeOf: r), 0 where the level carries none
/** What a shape submits to be drawn anywhere between lo and hi pixels (hi: Infinity, every size above lo): its first
    cards in turn order, its solids not yet gone, the far bodies and the post where they show; every vertex as the kit
    made it (position normal uv part ao cn root hand twig) and, a vertex, what the rule moves it by:
      go     the size on screen under which its part is gone (0: never by itself)
      tip    the point a card is enlarged about (a solid's: its foot)
      tipUv  from its place on its card's painting to the tip's
      to     a far body's corner: its place on the next coarser (the post's: its own middle line)
      body   0 none, 1 2 3 the far bodies finest first, 4 the post
    and `rule`, its shape's sixteen numbers (RULE). The same shape at two levels is the same thing at the size where
    they meet: the coarser one holds a first share of what the finer one holds, and the rest is gone there. */
export function levelOf(S, lo = 0, hi = Infinity, K = CROWD) {
  const HI = S.hull.hi, LO = S.hull.lo, X = HI > 0 ? sqrt(HI * LO) : 0, far = HI > 0;
  let t = 0; while (t < S.parts && S.turns.go[t] < hi) t++;
  const nc = t < S.parts ? S.turns.cards[t] : S.cards;
  let i = 0; if (!far || hi > X) while (i < S.solids && S.steps.go[i] < hi) i++;
  const sv = i ? S.steps.verts[i - 1] : 0, sc = i ? S.steps.corners[i - 1] : 0;
  const meets = (a, b) => far && max(a, lo) < min(b, hi, HI);   // (a body shows between a and b pixels, and under HI)
  const T0 = K.TURN[0][1], T1 = K.TURN[1][1], bodies = [];
  if (meets(T0, Infinity)) bodies.push([S.hulls[0], 1]);
  if (meets(T1, T0)) bodies.push([S.hulls[1], 2]);
  if (meets(0, T1)) bodies.push([S.hulls[2], 3]);
  if (S.post && meets(T1, X)) bodies.push([S.post, 4]);
  const count = nc * 4 + sv + bodies.reduce((s, [B]) => s + B.count, 0);
  const out = { count, position: new Float32Array(count * 3), normal: new Float32Array(count * 3), uv: new Float32Array(count * 2), part: new Float32Array(count), ao: new Float32Array(count), cn: new Float32Array(count * 3), root: new Float32Array(count * 3), hand: new Float32Array(count * 2), twig: new Float32Array(count),
    go: new Float32Array(count), tip: new Float32Array(count * 3), tipUv: new Float32Array(count * 2), to: new Float32Array(count * 3), body: new Float32Array(count) };
  // the cards and the solids: as the shape holds them, the solids moved down to where the cards end
  const copy = (from, n, to) => {
    for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2], ['part', 1], ['ao', 1], ['cn', 3], ['root', 3], ['hand', 2], ['twig', 1], ['go', 1], ['tip', 3], ['tipUv', 2]]) if (S[k]) out[k].set(S[k].subarray(from * w, (from + n) * w), to * w);
  };
  copy(0, nc * 4, 0); copy(S.cards * 4, sv, nc * 4);
  const index = [];
  for (let c = 0; c < nc; c++) index.push(4 * c, 4 * c + 1, 4 * c + 2, 4 * c, 4 * c + 2, 4 * c + 3);
  const shift = (S.cards - nc) * 4; for (let j = 0; j < sc; j++) index.push(S.index[j] - shift);
  let o = nc * 4 + sv;
  for (const [B, code] of bodies) {
    out.position.set(B.position, o * 3); out.normal.set(B.normal, o * 3); out.uv.set(B.uv, o * 2); out.ao.set(B.ao, o); out.to.set(B.to, o * 3);
    for (let v = 0; v < B.count; v++) { out.part[o + v] = code === 4 ? 0 : B.part; out.body[o + v] = code; out.root.set(code === 4 ? B.position.subarray(v * 3, v * 3 + 3) : S.mid, (o + v) * 3); }
    for (const x of B.index) index.push(x + o);
    o += B.count;
  }
  const rule = new Float32Array(16); rule[RULE.P0] = S.P0; rule[RULE.E] = S.E; rule[RULE.HI] = HI; rule[RULE.LO] = LO; rule.set(S.meta.subarray(META.CLASSES, META.CLASSES + 6), RULE.CLASSES); rule[RULE.A] = S.A; rule[RULE.X] = X; rule[RULE.KMAX] = S.KMAX;
  const bake = bodies.length && S.bake ? S.bake : null; if (bake) rule[RULE.BAKED] = bake.r;   // (a level with a far body carries the crown baked, before its vertices: assets/kit/plant.js)
  return { ...out, index: Uint32Array.from(index), rule, bake };
}

// ---- the crown baked (LOD.BAKE: under `?lod=new`, `?bake=0` for none) ----
/** The directions a crown is baked from, as the engine picks them (src/scatter/trees.js): eight round it, 30 degrees up,
    then one from above. Each { w: towards the eye, u, v: the picture's right and up }. */
export const BAKED = [...Array.from({ length: 8 }, (_, a) => { const z = (a * PI) / 4, e = PI / 6; return [cos(e) * cos(z), sin(e), cos(e) * sin(z)]; }), [0, 1, 0]].map((w) => {
  const a = abs(w[1]) > 0.99 ? [0, 0, -1] : [0, 1, 0];
  let u = [a[1] * w[2] - a[2] * w[1], a[2] * w[0] - a[0] * w[2], a[0] * w[1] - a[1] * w[0]]; const l = hypot(...u); u = u.map((x) => x / l);
  return { w, u, v: [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]] };
});
/** How many of a plant's vertices (32 bytes each, assets/kit/plant.js) a baked crown takes. */
export const bakedVerts = (K = CROWD) => ceil((BAKED.length * K.BAKE * K.BAKE * 2) / 32);
/** A shape's crown as the far bodies wear it: drawn from each of BAKED's directions, RES texels a side over 2 r metres
    about `mid`, every texel two bytes: how much of it the crown covers (a card stopping STOPS of the light, the wood all
    of it) and how much light reaches what covers it (its corners' ao, front to back: what lies behind counts as much as
    shows through what lies before it). S: a shape (crowd's).
    -> { res, r, bytes: Uint8Array(views x res x res x 2) } */
export function bakeOf(S, K = CROWD) {
  const res = K.BAKE, mid = S.mid, P = S.position, n = S.count, I = [];
  for (let c = 0; c < S.cards; c++) I.push(4 * c, 4 * c + 1, 4 * c + 2, 4 * c, 4 * c + 2, 4 * c + 3);
  for (const x of S.index) I.push(x);
  let r = 0; for (let i = 0; i < n; i++) r = max(r, hypot(P[i * 3] - mid[0], P[i * 3 + 1] - mid[1], P[i * 3 + 2] - mid[2]));
  r *= 1.02;
  const k = res / (2 * r), bytes = new Uint8Array(BAKED.length * res * res * 2), T = new Float32Array(res * res), A = new Float32Array(res * res), Wt = new Float32Array(res * res), X = new Float32Array(n), Y = new Float32Array(n);
  const nt = I.length / 3, depth = new Float32Array(nt), order = new Uint32Array(nt);
  BAKED.forEach(({ w, u, v }, view) => {
    T.fill(1); A.fill(0); Wt.fill(0);
    for (let i = 0; i < n; i++) { const x = P[i * 3] - mid[0], y = P[i * 3 + 1] - mid[1], z = P[i * 3 + 2] - mid[2]; X[i] = (x * u[0] + y * u[1] + z * u[2] + r) * k - 0.5; Y[i] = (x * v[0] + y * v[1] + z * v[2] + r) * k - 0.5; }
    // (front to back: what is nearest the eye is seen first, and what lies behind it only through it)
    for (let j = 0; j < nt; j++) { let d = 0; for (let c = 0; c < 3; c++) { const i = I[j * 3 + c] * 3; d += P[i] * w[0] + P[i + 1] * w[1] + P[i + 2] * w[2]; } depth[j] = d; order[j] = j; }
    order.sort((a, b) => depth[b] - depth[a]);
    for (const j of order) { const t = j * 3;
      const a = I[t], b = I[t + 1], c = I[t + 2], X0 = X[a], Y0 = Y[a], X1 = X[b], Y1 = Y[b], X2 = X[c], Y2 = Y[c];
      const x0 = max(0, ceil(min(X0, X1, X2))), x1 = min(res - 1, floor(max(X0, X1, X2))), y0 = max(0, ceil(min(Y0, Y1, Y2))), y1 = min(res - 1, floor(max(Y0, Y1, Y2)));
      if (x1 < x0 || y1 < y0) continue;
      const stop = S.part[a] === 1 ? K.STOPS : 1, ao = (S.ao[a] + S.ao[b] + S.ao[c]) / 3, ax = X1 - X0, ay = Y1 - Y0, bx = X2 - X1, by = Y2 - Y1, gx = X0 - X2, gy = Y0 - Y2;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const e0 = ax * (y - Y0) - ay * (x - X0), e1 = bx * (y - Y1) - by * (x - X1), e2 = gx * (y - Y2) - gy * (x - X2);
        if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) { const j = y * res + x; A[j] += ao * stop * T[j]; Wt[j] += stop * T[j]; T[j] *= 1 - stop; }
      }
    }
    // (the picture's rows from its top: v up)
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) { const j = y * res + x, o = (view * res * res + (res - 1 - y) * res + x) * 2; bytes[o] = round((1 - T[j]) * 255); bytes[o + 1] = Wt[j] > 0 ? round(min(1, A[j] / Wt[j]) * 255) : 0; }
  });
  return { res, r, bytes };
}
