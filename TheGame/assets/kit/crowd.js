// The crowd kit: the one builder of what stands in a stand (intents 0033 and 0038). A plant's file draws its plant once,
// as it is from near, out of parts (assets/kit/tree.js: wood as tubes, sprigs as prototypes laid by a rigid transform
// about a pivot, as Nanite's assemblies are). This turns that one build into everything the engine needs to draw the
// plant at any size on screen, told nothing of what kind of plant it is: it reads its parts (a sprig: its cards, four
// corners each, its tip and its root; a solid piece: its triangles and its foot) and nothing else. Plain JS, no three
// and nothing of the page: run in the recipes' worker, and by the library on the page.
//
// What it finds, and what the engine does with it. Every rung carries its error in metres, measured here on the plant
// itself (src/detail/error.js): how far, at its worst, what the rung draws lies from where the plant is. Where a rung
// may stand in is decided at runtime by one ratio, r = errPx(e · s, dist) / ERROR_PX (s the plant's scale): r ≥ 1, the
// rung would be seen and must not stand in; under 1 it may. Every hand-over runs below that switch, never above it:
// from r = 1 down over the BAND (error.js), so what is drawn is never off by more than the dial. Nothing here is a size
// on screen of its own:
//   - one spread order of the sprigs. Every sprig has its turn, and any first share of the turns is a fair picture of
//     the whole crown: the sprigs go by size into classes (each half the area of the one before, the largest first), and
//     within a class each next is the one farthest from all taken before (a blue-noise order). What is left out is stood
//     for by what stays (Cook, Halstead, Planck and Ryu 2007, "Stochastic Simplification of Aggregate Detail"): the kept
//     grow about their roots so the crown covers as much of its round as it did, sqrt(A / A_t) of their size. Drawing
//     the first t turns, the crowd's error is what that truly misplaces: the farthest a sprig left out lies from one drawn
//     (its share error, turnsOf), and how far the growth moves the kept leaves (headOf). Each sprig goes (its go) where
//     the crowd without it and every turn after it is within the dial, shrinking to its root over the FADE below, as the
//     kept grow (growthOf: smooth in the error, so in the pixels too). Past its end its next rung's bake, made of it whole
//     at its true size (the clumps, the impostor: each rung is measured against the plant at full detail);
//   - a solid piece is gone where leaving it out (its width) is within the dial, and shrinks to its foot. The solids'
//     corners are sorted thick first: a first share of the list is the thick wood;
//   - the clumps (NVIDIA HPG 2026, Simplygon's billboard clouds): the sprigs split into chunks by their boxes, the
//     largest first, into as many as cost no more than the sprigs still there where the crowd ends (twelve corners a
//     chunk: three crossed planes through its box's middle, each wearing its own leaves as the GPU bakes them,
//     src/detail/impostor.js). Their error is where the planes draw the leaves: plane a puts a leaf |p_a - m_a| off along
//     its axis, seen from v that many times sqrt(1 - v_a²) off on the screen, and it is |v_a| / (|v.x| + |v.y| + |v.z|)
//     of what is drawn of the chunk (planesErrorOf: at the worst leaf and way); their bake's texel on top (TILE over a
//     chunk's largest side). Over the FADE below their switch the last sprigs go one by one and the chunks come one by
//     one, each where its own sprigs were, each growing in over the FADE below its own: within the BAND;
//   - the impostor's frame: the sphere round the whole plant, from which the GPU bakes its views (one octahedral
//     impostor a shape, src/detail/impostor.js). Its error: its bake's texel (CELL over the sphere's width) and what its
//     views' spacing misplaces, the sphere's radius times their angle (src/detail/atlas.js spacingOf); under `far.lo` a
//     level holds nothing else. Where its error is under the clumps' it takes over
//     from the crowd itself, and the shape has no clumps. A plant without a far end (its kind's `far`, assets/kinds.js)
//     has neither: its crowd goes by its own error to where it is gone.
//
//   crowd(mesh, { size, far, measured? }) -> a shape (measured: what the build measured of it, assets/kit/measures.js;
//                                 none: measured here; `measure` on the shape is what is kept of it):
//     count, cards, parts, solids   its vertices; its cards (4 vertices each, corners 0 1 2, 0 2 3); its sprigs; its
//                                   pieces drawn by corners
//     position, normal, uv, part, ao, cn, root, twig (and whatever else the mesh carries a vertex)
//                                   as the kit made them, in a new order: the cards in turn order (a first share of
//                                   the list is a first share of the turns), then the solids, thick first. A
//                                   solid's root is its foot
//     go        a vertex, metres    the error at which its part goes (0: never: thick wood, which stays until the
//                                   impostor takes it); a chunk's plane: at which its chunk comes
//     tip       a vertex, x y z     its sprig's tip (a solid's: its foot)
//     index                         the solids' corners, into the list above, thick first
//     steps { go, corners, verts }  a piece drawn by corners each, in the list's order: its go, and how many corners
//                                   and vertices the list holds up to and with it (what is drawn at a size is a
//                                   first share of both)
//     turns { go, cards }           a sprig each, in turn order: its go, where its cards begin
//     size, mid, spread, win { hi, lo }, cover, atlas, errors    what was measured (win: the errors, metres, at which
//                                   its crowd ends and its window's last part goes; atlas: the atlases' numbers it
//                                   was built for, none without a far end; errors: each rung's, metres)
//     sphere    [x, y, z, r]        the impostor's frame
//     far       { lo, data }        under lo dial pixels nothing but the impostor is drawn; data: what the GPU bakes the
//                                   shape's far end from (the sphere, its impostor's error, the chunks), carried by its
//                                   finest level; none without a far end
//     clumps    { n, cells, boxes, go, order } or null    its chunks (cells: where their parts' tips lie, boxes: their
//                                   planes' frames, go: the error, metres, at which each comes)
//
// The rule itself, for whoever draws (its twin is the vertex stage's, src/scatter/trees.js crowdRule): grownAt, how
// much of a part is drawn at its own error. Which parts a level of the heap holds is cut in pixels at the dial at rest, as
// assets/kit/plant.js bandsOf cuts the levels (src/detail/error.js switchPx: the workers' dial is 1).
import { switchPx, BAND, FADE } from '../../src/detail/error.js';
import { spacingOf } from '../../src/detail/atlas.js';
const { PI, sqrt, hypot, floor, ceil, min, max, abs, log, log2, exp } = Math;

/** Every number of the rule, in one place, as the plants are drawn. A plant's file has none of them, and none of them
    says where a rung comes: that is each rung's own error (above); every hand-over is the BAND below its switch. What its
    far ends' pictures are, the impostor's VIEWS x VIEWS views of CELL texels a side, a clump's plane of TILE texels,
    TILES of them a row, at most CLUMPS chunks a plant, is not the kit's: the page sizes the atlases from their share of
    memory (src/detail/atlas.js atlasesOf, src/detail/impostor.js atlases) and hands them in with the rest (opts), to
    the workers with each level's band (assets/kit/plant.js). */
const CROWD = {
  LEAST: 8,        // a crowd of no more sprigs than this does not thin: they stay to its end
  CLASSES: 4,     // the most classes by size a crowd is sorted into (each half the area of the one before)
  STOPS: 1 - sqrt(1 - 0.45),         // how much of the light one triangle of a card stops (a sprig of two crossed cards: 45 %), where cover is reckoned
  PIC: 64,         // … in pictures of this many pixels a side, from thirteen sides
};

// ---- the rule, as the vertex stage is to reckon it: r, a rung's error over the dial (above) ----
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** How much of a part is drawn, 0 … 1, where its go is r times the dial: all of it from r = 1 up (leaving it out would
    be seen), none a FADE under (go 0: never gone by itself). A chunk's plane comes the other way: 1 - grownAt. */
export const grownAt = (r, go) => (go > 0 ? smooth(log(max(r, 1e-12)) / FADE + 1) : 1);
/** The size on screen (pixels at the dial at rest) at which a rung of error e (metres) on a shape `size` metres large
    switches: what the levels are cut by. */
const switchOf = (e, size) => switchPx(e / size);

// ---- cover: how much of its pictures a thing fills, reckoned as the measuring stick does (the probe of intent 0033:
// thirteen sides, a triangle stopping its share of the light, what lies behind showing through by what is left) ----
const SIDES = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]].map((d) => {
  const l = hypot(...d), w = d.map((x) => x / l), a = abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [a[1] * w[2] - a[2] * w[1], a[2] * w[0] - a[0] * w[2], a[0] * w[1] - a[1] * w[0]]; const ul = hypot(...u); u = u.map((x) => x / ul);
  return [...u, w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
});
/** The share of its pictures a thing covers. P its vertices (n of them), I its corners, stop how much of the light a
    triangle stops (by its first corner: a number a vertex), F the frame { c, r } the pictures are taken in, R their
    pixels a side. */
/** How much of its pictures a shape covers (coverOf): what the build measured (K.measured), else reckoned here, each
    triangle of a card stopping STOPS of the light; none without sprigs. */
function coverFor(m, K, N, frame) {
  if (K.measured) return K.measured.cover;
  if (!N) return 0;
  const n = m.part.length, stop = Float32Array.from({ length: n }, (_, v) => (m.part[v] === 1 ? K.STOPS : 1));
  return coverOf(m.position, n, m.index, stop, frame, K.PIC);
}
function coverOf(P, n, I, stop, F, R) {
  const T = new Float32Array(R * R), X = new Float32Array(n), Y = new Float32Array(n); let sum = 0;
  for (const side of SIDES) { pictureOf(P, n, I, stop, F, R, side, T, X, Y); for (let i = 0; i < T.length; i++) sum += 1 - T[i]; }
  return sum / (SIDES.length * R * R);
}
/** One of its pictures (coverOf's): what of the light gets through each of its R × R pixels (into T), seen from `side`
    (SIDES: its two axes), in the frame F. X, Y: room for its vertices' places in it. */
function pictureOf(P, n, I, stop, F, R, [ux, uy, uz, vx, vy, vz], T, X = new Float32Array(n), Y = new Float32Array(n)) {
  const k = R / (2 * F.r), [cx, cy, cz] = F.c;
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
  return T;
}
/** How much of its own round a plant's mesh m covers seen from straight above, as its far end's pictures are read for
    it (src/scatter/trees.js crownCover): its picture from above (coverOf's, each card stopping its share of the light),
    its round a disc's from where what it covers lies (π r², r² twice their mean square distance from their middle),
    at most all but half a pixel of it. What the land counts it as covering where it stands for it far off
    (tools/covercheck.js: on the CPU, from the mesh; the game from the pictures). */
export function topShareOf(m) {
  const P = m.position, n = P.length / 3, R = CROWD.PIC, T = new Float32Array(R * R), stop = Float32Array.from({ length: n }, (_, v) => (m.part[v] === 1 ? CROWD.STOPS : 1));
  pictureOf(P, n, m.index, stop, boundsOf(P, n).frame, R, SIDES[1], T);
  let w = 0, sx = 0, sy = 0, sq = 0;
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) { const c = 1 - T[y * R + x]; w += c; sx += c * x; sy += c * y; sq += c * (x * x + y * y); }
  const area = 2 * Math.PI * (sq / Math.max(w, 1e-9) - ((sx / Math.max(w, 1e-9)) ** 2 + (sy / Math.max(w, 1e-9)) ** 2));
  return area > 1 ? min(w / area, 1 - 0.5 / area) : null;
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
    one piece that stays), their areas, the spread order of the sprigs (turnsOf) and their classes, the impostor's frame
    and its error, and where the crowd ends: the sprigs still there (M), the clumps that take over from them, and the
    errors they do it at. budgetOf and crowd agree to the part. Cheap: no picture is taken (budgetOf reads it at a
    start, crowd builds on it). */
function headOf(m, K) {
  const P = m.position, n = m.part.length;
  const { lo, hi, mean, frame, sphere } = boundsOf(P, n), size = K.size ?? max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const { sprigs, solids } = partsOf(m), N = sprigs.length, B = K.measured, { mid, sd, order } = orderOf(sprigs, P, K, B);
  // ---- the crowd's own error, turn by turn (metres): drawing its first t turns, what leaving out the rest truly
  // misplaces. What is left out is stood for by what stays: the kept grow about their roots, each sqrt(A / A_t) of its
  // size (A: every sprig's leaves, A_t: the first t turns'), so the crown covers as much of its round as it did (Cook,
  // Halstead, Planck and Ryu 2007, "Stochastic Simplification of Aggregate Detail", SIGGRAPH: what is pruned stood for by
  // the rest, scaled up by its area). So leaving out turns t … N-1 misplaces what goes by its share error (the farthest
  // one left out lies from one drawn: turnsOf) and what stays by its growth, (sqrt(A / A_t) - 1) times the farthest a
  // kept sprig's leaf lies from its root (it was the reach of the largest left out, its leaves gone with it, nothing
  // drawn standing for them: every sprig of a crown is about one size, so all went at once). And the kept never grow
  // faster than the error allowed grows (over a BAND of pixels, at most a BAND of growth: a turn goes no sooner than
  // the growth it brings over the last one's, times the error that went at). Never more as more are drawn; a crowd too
  // few to thin (LEAST) keeps them all (Infinity: never by itself) ----
  const thins = N > K.LEAST, withFar = K.far !== false;
  if (withFar && !K.CELL) throw new Error('crowd: a far end is sized by its atlases (VIEWS, CELL, TILE, CLUMPS: src/detail/impostor.js atlases), and none were given');
  const R = m.root, rootReach = (q) => { let r = 0; for (const v of q.verts) r = max(r, hypot(P[v * 3] - R[v * 3], P[v * 3 + 1] - R[v * 3 + 1], P[v * 3 + 2] - R[v * 3 + 2])); return r; };
  const area = B ? null : Float64Array.from(order, (p) => sprigs[p].area), reach = thins && !B ? Float64Array.from(order, (p) => rootReach(sprigs[p])) : null;
  // ---- the impostor's error (metres): its bake's texel, CELL of them over its sphere's width, and what its views'
  // spacing misplaces, its sphere's radius times their angle (src/detail/atlas.js) ----
  const views = withFar ? spacingOf(K.VIEWS) * sphere[3] : 0, eImp = withFar ? (2 * sphere[3]) / K.CELL + views : Infinity;
  // ---- where the crowd ends: the rung after it, its clumps or its impostor, whichever has the lesser error. The
  // clumps: as many chunks as cost no more than the sprigs still there where the crowd ends (first all of them, then
  // those its clumps leave); a shape whose impostor is as fine as its clumps hands its crowd over to it, and has no
  // clumps; a plant without a far end has neither, and its crowd goes by its own error to where it is gone (M 0) ----
  const endsOf = (own) => {
    const endAt = (e) => { let t = 0; while (t < N && own[t] > e) t++; return t; };   // (the sprigs still there where an error of e is allowed: the first so many)
    const endOf = (M0) => {
      let cornersM = 0; for (let t = 0; t < M0; t++) cornersM += sprigs[order[t]].cards * 4;
      const chunks = withFar && thins ? chunksOf(sprigs, max(1, min(K.CLUMPS, floor(cornersM / 12))), K.grid) : null;
      const eC = chunks ? clumpsErrorOf(chunks, sprigs, P, K.TILE) : Infinity, clumpy = eC < eImp, end = clumpy ? eC : eImp;
      return { chunks: clumpy ? chunks : null, eC, end, M: withFar ? endAt(end) : 0 };
    };
    let E0 = endOf(N); if (E0.M < N) E0 = endOf(E0.M);
    const { chunks, eC, end } = E0, M = withFar ? endAt(end) : 0;
    // every sprig's go (metres; 0: never by itself): the last M (still there where the crowd ends) one by one over the
    // FADE below the clumps' switch, the outline's last, or, with no clumps, staying till the impostor takes them; the
    // rest at their own error
    const go = Float32Array.from({ length: N }, (_, t) => (t < M ? (chunks ? eC * exp(FADE * (1 - (t + 0.5) / M)) : 0) : Number.isFinite(own[t]) ? own[t] : 0));
    const win = { hi: Number.isFinite(end) ? end : 0, lo: Number.isFinite(end) ? end * exp(FADE) : 0 };   // (metres: where the crowd ends, and where its window's last part goes)
    return { own, chunks, eC, M, go, win, grow: growthOf(go, area, M, win) };
  };
  // (the vertex stage reads the growth between its knots, at most a knot's step of it over what it is: each turn's go
  // reckoned with that much more, so what is drawn is within the dial too; that step known once the growth is, again)
  // (a measure the build made of this shape, at this version and these atlases' numbers, is all of this: B, crowd's
  // measure: assets/kit/measures.js)
  let E = B ? { own: B.own, chunks: B.chunks, eC: B.eC ?? Infinity, M: B.M, go: B.go, win: B.win, grow: B.grow } : endsOf(ownOf(N, thins, order.err, area, reach, 1));
  for (let k = 0, infl = 1; k < 3 && !B; k++) { const want = exp(E.grow.most / (RULE.AT - RULE.GROW)); if (!(want > infl)) break; infl = want; E = endsOf(ownOf(N, thins, order.err, area, reach, infl)); }
  const { own, chunks, eC, M, go, win } = E;
  return { lo, hi, mean, size, frame, sprigs, solids, N, M, mid, sd, order, sphere, views, errors: { clumps: chunks ? eC : null, impostor: withFar ? eImp : null, crowd: own }, chunks, win, go, grow: E.grow, far: withFar,
    atlas: withFar ? { VIEWS: K.VIEWS, CELL: K.CELL, TILE: K.TILE, TILES: K.TILES, CLUMPS: K.CLUMPS } : null };
}
/** Each turn's own error (headOf, above): the crowd without it and every turn after it, each kept sprig grown
    sqrt(A / A_t) about its root, its growth reckoned `infl` times over (the vertex stage's knots: growthOf), never less
    than the turn after it, nor growing faster than the error that went at (a BAND of pixels, at most a BAND of growth).
    err: each turn's share error; area, reach: its leaves', and the farthest one lies from its root (turn order). */
function ownOf(N, thins, err, area, reach, infl) {
  const own = new Float64Array(N).fill(Infinity);
  if (!thins) return own;
  const A = area.reduce((s, a) => s + a, 0), kept = new Float64Array(N + 1), most = new Float64Array(N + 1);   // (the first t turns' leaves; the farthest a leaf of them lies from its root)
  for (let t = 0; t < N; t++) { kept[t + 1] = kept[t] + area[t]; most[t + 1] = max(most[t], reach[t]); }
  for (let t = N - 1, after = 0, was = 1; t >= 0; t--) { const s = kept[t] > 0 ? sqrt(A / kept[t]) : Infinity; after = max(after, err[t], (s * infl - 1) * most[t], (after * s) / was); own[t] = after; was = s; }
  return own;
}
/** The kept's growth (Cook et al. 2007: headOf) for the vertex stage (src/scatter/trees.js grownBy): how many times its
    size a kept sprig is drawn where an error of e (metres) is allowed, sqrt(A / A_e), A_e the leaves still there: each
    sprig shrinking with its leaves over the FADE under its go (grownAt), the last M as if kept (the clumps or the
    impostor stand for those, not the crowd). Kept as where (the log of e) it reaches each of KNOTS + 1 growths evenly in
    its log, from none (where the first goes) to its most (where the crowd ends: its window, else its last go): so the
    knots lie where it grows, and are read back between the two it lies between. go, area: each turn's, in turn order.
    -> { most: the log of its most growth (0: none grow), at: the knots (KNOTS + 1 logs of e) } */
function growthOf(go, area, M, win) {
  const N = go.length, KN = RULE.AT - RULE.GROW, at = new Float32Array(KN + 1);
  let e0 = Infinity, last = 0; for (let t = M; t < N; t++) if (go[t] > 0) { e0 = min(e0, go[t]); last = max(last, go[t]); }
  const e1 = win.hi > 0 ? win.hi : last;
  if (!(e0 < e1)) return { most: 0, at };
  const A = area.reduce((n, a) => n + a, 0), sAt = (e) => { let Ae = 0; for (let t = 0; t < N; t++) { const g = t < M ? 1 : grownAt(go[t] / e, go[t]); Ae += area[t] * g * g; } return sqrt(A / max(Ae, 1e-12)); };
  // (its log of growth over the log of e, finely: never less as more goes)
  const STEPS = KN * 64, L = Float64Array.from({ length: STEPS + 1 }, (_, k) => log(sAt(e0 * (e1 / e0) ** (k / STEPS))));
  for (let k = 1; k <= STEPS; k++) L[k] = max(L[k], L[k - 1]);
  const most = L[STEPS], x = (k) => log(e0) + (k / STEPS) * log(e1 / e0);
  if (!(most > 0)) return { most: 0, at };
  for (let j = 0, k = 0; j <= KN; j++) { const want = (j / KN) * most; while (k < STEPS && L[k + 1] < want) k++; const f = L[k + 1] > L[k] ? (want - L[k]) / (L[k + 1] - L[k]) : 0; at[j] = x(k) + min(1, max(0, f)) * (x(k + 1) - x(k)); }
  return { most, at };
}
/** A shape's box and middle (lo, hi, mean: of its vertices), the frame its cover is reckoned in (all of it, and a little
    round it), and the impostor's frame: the sphere round all of it, from its box's middle. */
function boundsOf(P, n) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], mean = [0, 0, 0];
  for (let p = 0; p < n * 3; p += 3) for (let a = 0; a < 3; a++) { const x = P[p + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; mean[a] += x / n; }
  const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2); let far = 0, r2 = 0;
  for (let p = 0; p < n * 3; p += 3) { far = max(far, (P[p] - mean[0]) ** 2 + (P[p + 1] - mean[1]) ** 2 + (P[p + 2] - mean[2]) ** 2); r2 = max(r2, (P[p] - centre[0]) ** 2 + (P[p + 1] - centre[1]) ** 2 + (P[p + 2] - centre[2]) ** 2); }
  return { lo, hi, mean, frame: { c: mean, r: sqrt(far) * 1.1 || 1 }, sphere: [...centre, sqrt(r2) || 1] };
}
/** A shape's parts as the recipe laid them (assets/kit/tree.js: m.parts): its sprigs (each its cards, four vertices a
    card, its tip and its box) and its solid pieces (a tube; and whatever was laid without a part, as one piece that
    stays), each with its area. */
function partsOf(m) {
  const P = m.position, I = m.index, sprigs = [], solids = [], mine = new Uint8Array(I.length);
  const areaOf = (tris) => { let a = 0; for (const t of tris) { const i = I[t] * 3, j = I[t + 1] * 3, k = I[t + 2] * 3, ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2], vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2]; a += hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return a; };
  const range = (a, b, step = 1) => Array.from({ length: max(0, ceil((b - a) / step)) }, (_, i) => a + i * step);
  for (const q of m.parts ?? []) {
    mine.fill(1, q.i0, q.i1);
    const tris = range(q.i0, q.i1, 3), verts = range(q.v0, q.v1);
    if (!q.tip) { solids.push({ verts, tris, foot: q.foot, area: areaOf(tris) }); continue; }
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const v of verts) for (let a = 0; a < 3; a++) { box[a] = min(box[a], P[v * 3 + a]); box[a + 3] = max(box[a + 3], P[v * 3 + a]); }
    sprigs.push({ verts, tris, tip: q.tip, cards: (q.v1 - q.v0) / 4, area: areaOf(tris), box });
  }
  const rest = range(0, I.length, 3).filter((t) => !mine[t]);
  if (rest.length) solids.push({ verts: [...new Set(rest.flatMap((t) => [I[t], I[t + 1], I[t + 2]]))], tris: rest, foot: [0, 0, 0], stays: true, area: areaOf(rest) });
  return { sprigs, solids };
}
/** The spread order of a crowd's sprigs: by size into classes (each half the area of the one before, the largest first;
    one where the shape asks them alike), the farthest from all taken before within a class (turnsOf). -> { mid, sd:
    their spread, order } */
function orderOf(sprigs, P, K, B = null) {
  const N = sprigs.length, mid = [0, 0, 0], sd = [0, 0, 0], X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N); let nC = 0;
  sprigs.forEach((q, p) => { for (const v of q.verts) { X[p] += P[v * 3] / q.verts.length; Y[p] += P[v * 3 + 1] / q.verts.length; Z[p] += P[v * 3 + 2] / q.verts.length; for (let a = 0; a < 3; a++) mid[a] += P[v * 3 + a]; nC++; } });
  for (let a = 0; a < 3; a++) mid[a] /= max(1, nC);
  for (const q of sprigs) for (const v of q.verts) for (let a = 0; a < 3; a++) sd[a] += (P[v * 3 + a] - mid[a]) ** 2;
  for (let a = 0; a < 3; a++) sd[a] = sqrt(sd[a] / max(1, nC)) || 1e-9;
  let amax = 0; for (const q of sprigs) amax = max(amax, q.area);
  const cls = Uint8Array.from(sprigs, (q) => (K.order === 'alike' ? 0 : min(K.CLASSES - 1, floor(log2(amax / q.area) + 1e-6))));
  return { mid, sd, order: B ? B.order : turnsOf(X, Y, Z, cls, mid) };   // (B: a measure the build made: its order)
}
// the ways the eye can see a chunk's planes from: each plane's error and share depend on |v.x|, |v.y|, |v.z| alone, so
// one eighth of the sphere is all of them (a triangle's grid of 325), each as its three planes' weights: plane a draws a
// point |p_a - m_a| sqrt(1 - v_a²) off, and is |v_a| / (|v.x| + |v.y| + |v.z|) of what is drawn of the chunk
const OCTANT = (() => {
  const out = [], n = 24;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const l = hypot(i, j, n - i - j), u = [i / l, j / l, (n - i - j) / l], s = u[0] + u[1] + u[2]; out.push(u.map((x) => (x * sqrt(1 - x * x)) / s)); }
  return out;
})();
// (the ways in groups of neighbours, each with its weights at their most: a point a group's most takes no further than
// is reached already is taken no further by any way of it. Flat arrays: the ways' weights (WAYS), each group's most
// (MOSTS) and where its ways begin and end (SPANS); OCTANT_MOST, every way's)
const { WAYS, MOSTS, SPANS, OCTANT_MOST } = (() => {
  const by = new Map();
  OCTANT.forEach((w) => { const k = `${Math.round(w[0] * 6)} ${Math.round(w[1] * 6)}`; if (!by.has(k)) by.set(k, []); by.get(k).push(w); });
  const groups = [...by.values()], WAYS = new Float64Array(OCTANT.length * 3), MOSTS = new Float64Array(groups.length * 3), SPANS = new Uint32Array(groups.length + 1);
  let at = 0;
  groups.forEach((ws, g) => { SPANS[g] = at; for (const w of ws) { WAYS.set(w, at * 3); at++; for (let a = 0; a < 3; a++) MOSTS[g * 3 + a] = Math.max(MOSTS[g * 3 + a], w[a]); } });
  SPANS[groups.length] = at;
  return { WAYS, MOSTS, SPANS, OCTANT_MOST: [0, 1, 2].map((a) => Math.max(...OCTANT.map((w) => w[a]))) };
})();
/** The clumps' error (metres): where their planes draw each chunk's leaves, at the worst leaf and way (OCTANT), and the
    planes' bake's texel on top (TILE of them over the chunk's largest side); the worst chunk's. The leaves of a chunk are
    its sprigs' corners, as the GPU bakes it (its parts: chunksOf). */
function clumpsErrorOf(chunks, sprigs, P, TILE) {
  let worst = 0;
  for (const C of chunks) {
    const b = C.box, m = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], side = max(b[3] - b[0], b[4] - b[1], b[5] - b[2]), D = [];
    for (const p of C.parts) for (const v of sprigs[p].verts) D.push(abs(P[v * 3] - m[0]), abs(P[v * 3 + 1] - m[1]), abs(P[v * 3 + 2] - m[2]));
    // (every way's weights are nought or more, so no way takes a point further than its bound, each weight at its most
    // (OCTANT_MOST): a point bound to no more than is reached already is passed by, the rest looked at every way. The
    // same worst, exactly: what the bound passes by reaches no further. The start reckoned every leaf every way, 325 of
    // them, for every shape: half the scatter's 5 s, 2026-11-19)
    let e = 0, at = 0, most = -1;
    for (let i = 0; i < D.length; i += 3) { const u = OCTANT_MOST[0] * D[i] + OCTANT_MOST[1] * D[i + 1] + OCTANT_MOST[2] * D[i + 2]; if (u > most) { most = u; at = i; } }
    const reach = (i) => {
      const x = D[i], y = D[i + 1], z = D[i + 2];
      for (let g = 0; g + 1 < SPANS.length; g++) {
        if (MOSTS[g * 3] * x + MOSTS[g * 3 + 1] * y + MOSTS[g * 3 + 2] * z <= e) continue;
        for (let w = SPANS[g] * 3; w < SPANS[g + 1] * 3; w += 3) { const r = WAYS[w] * x + WAYS[w + 1] * y + WAYS[w + 2] * z; if (r > e) e = r; }
      }
    };
    if (D.length) reach(at);   // (the likeliest farthest first: what it reaches passes most of the rest by)
    for (let i = 0; i < D.length; i += 3) if (OCTANT_MOST[0] * D[i] + OCTANT_MOST[1] * D[i + 1] + OCTANT_MOST[2] * D[i + 2] > e) reach(i);
    worst = max(worst, e + side / TILE);
  }
  return worst;
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
  const farLo = farLoOf(H), p = H.chunks ? H.chunks.length * 3 : 0, fv = H.far ? Math.ceil(farLength(H.chunks ? H.chunks.length : 0) / 8) : 0;
  return Object.assign(his.map((hi) => {
    if (hi <= farLo) return { verts: 1, tris: 0 };
    let cards = 0; for (let t = 0; t < H.N; t++) if (drawnUnder(go[t], H.size, hi)) cards += H.sprigs[H.order[t]].cards;
    return { verts: 1 + (hi === Infinity ? fv : 0) + cards * 4 + sv + p * 4, tris: cards * 2 + st + p * 2 };
  }), { chunks: H.chunks ? H.chunks.length : 0, far: farDataOf(H, H.chunks ? { n: H.chunks.length, cells: Float32Array.from(H.chunks.flatMap((C) => C.cell)), boxes: Float32Array.from(H.chunks.flatMap((C) => C.box)) } : null) });   // (and how many chunks its clumps are, and its far data as its finest level carries it: a far end baked from the outline, src/scatter/trees.js farOf)
}
/** How many numbers a far end's data is (crowd: far.data), its clumps `n` chunks: eight, then twelve a chunk. Its finest
    level carries it after its vertices, eight numbers a vertex (assets/kit/plant.js). */
const farLength = (n) => 8 + n * 12;
/** Whether a part that goes at `go` (metres; 0: never by itself) on a shape `size` metres large is drawn anywhere at or
    under hi pixels (at the dial at rest): it is there down to a FADE under its switch. */
const drawnUnder = (go, size, hi) => !(go > 0) || switchOf(go, size) * exp(-FADE) < hi;
/** Under these pixels (at the dial at rest) nothing but a shape's impostor is drawn: where every plant's hand-over to it
    is through, the BAND under its switch (src/scatter/trees.js meshShare). A plant without a far end: never. */
const farLoOf = (H) => (H.far ? switchOf(H.errors.impostor * BAND, H.size) : 0);

export function crowd(m, opts = {}) {
  const K = { ...CROWD, ...opts }, P = m.position, I = m.index, n = m.part.length, R = m.root;
  const H = headOf(m, K), { size, frame, sprigs, solids, N, M, mid, sd: spread, order, sphere, win, go } = H;
  // how much of its pictures the plant covers
  const cover = coverFor(m, K, N, frame);

  // ---- its solid pieces: how wide each is, its go (widthsOf). Thick wood, what is still there where the crowd ends, is
  // never gone by itself (go 0): the impostor takes it; so is what was laid without a part ----
  widthsOf(solids, P);
  const outlasts = (q) => win.hi > 0 && q.go > win.hi;   // (still there where the crowd ends)
  const there = N > 0 || solids.some(outlasts);   // (a thing of sticks only, all gone before: nothing stays)
  if (!there) win.hi = win.lo = 0;
  for (const q of solids) if (there && outlasts(q)) q.go = 0;

  // ---- the new order of its vertices: the cards by turn, then the solids, thick first (those that never go, then the
  // last to go: a first share of the list is what is still there) ----
  const last = (q) => (q.go > 0 ? q.go : Infinity), listed = solids.slice().sort((a, b) => last(b) - last(a) || b.w - a.w);
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
  /** Its chunks as the engine draws them: each comes in where the first of its own sprigs goes, where one of them is
      among the last M to go; else at its place in an order spread over the crown, over the clumps' window (metres). */
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
      let g = Infinity, a = 0, k = 0; for (const p of C.parts) { if (turnOf[p] < M) g = min(g, go[turnOf[p]]); a += aoP[p * 2]; k += aoP[p * 2 + 1]; }
      cgo[c] = Number.isFinite(g) ? g : win.hi * exp(FADE * (1 - (rank[c] + 0.5) / Mc)); ao[c] = k ? a / k : 1;
    });
    return { n: Mc, cells, boxes, go: cgo, ao, err: max(...all.map((C) => C.err)) };
  }
  return { count, cards, parts: N, solids: listed.length, ...out, ...S, index, steps, turns, size, mid, spread, win, grow: H.grow, cover, sphere, clumps,
    atlas: H.atlas, errors: H.errors, far: { lo: farLoOf(H), data: farDataOf(H, clumps) },
    // (what of it the build keeps, so a start reckons none of it: assets/kit/measures.js, tools/outlines.js)
    measure: { order: H.order, own: H.errors.crowd, go: H.go, M: H.M, win: H.win, grow: H.grow, chunks: H.chunks, eC: H.errors.clumps, cover } };
}
/** Each solid piece's width and its go (metres). How long: between its two corners farthest apart (the farthest from
    its middle, and the farthest from that). How wide: it is taken as a body a ray passes twice, whose area over pi times
    its length is its mean width seen from the side (a tube's: its girth). Leaving a piece out differs by its width: it
    goes where that is within the dial (its go: its width; what was laid without a part stays). */
function widthsOf(solids, P) {
  for (const q of solids) {
    const c = [0, 0, 0]; for (const v of q.verts) for (let a = 0; a < 3; a++) c[a] += P[v * 3 + a] / q.verts.length;
    const farFrom = (x, y, z) => { let at = q.verts[0], d = -1; for (const v of q.verts) { const e = (P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2; if (e > d) { d = e; at = v; } } return at; };
    const a = farFrom(c[0], c[1], c[2]), b = farFrom(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), L = hypot(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]) || 1e-9;
    q.w = q.area / (PI * L); q.go = q.stays ? 0 : q.w;
  }
}
/** What the GPU bakes a far end from (src/detail/impostor.js), carried after its finest level's vertices
    (assets/kit/plant.js): [chunks, the sphere (4), its size, its impostor's error (metres: its views' texel, their
    spacing and its parallax: what src/scatter/trees.js holds against the dial), its views' texels a side, then a
    chunk's cell and box (12)]. A plant without a far end carries none. */
function farDataOf(H, clumps) {
  if (!H.far) return null;
  const n = clumps ? clumps.n : 0, data = new Float32Array(farLength(n));
  data.set([n, ...H.sphere, H.size, H.errors.impostor, H.atlas.CELL]);
  for (let c = 0; c < n; c++) { data.set(clumps.cells.subarray(c * 6, c * 6 + 6), 8 + c * 12); data.set(clumps.boxes.subarray(c * 6, c * 6 + 6), 8 + c * 12 + 6); }
  return data;
}

// ---- a shape as the engine draws it between two sizes on screen ----
/** Where each of a level's sixteen numbers lies (levelOf: `rule`): what the one rule reads of its shape. E: its kept's
    growth (growthOf): the log of its most, and its first knot; HI, LO: the errors (metres) at which its crowd ends and
    its window's last part goes; GROW: the rest of its knots, up to AT; AT: where its far data begins (its finest
    level's: assets/kit/plant.js; a vertex's number, x 1024 and the rest, two slots). */
const SLOTS = ['most', 'from', 'hi', 'lo', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'at', 'at2'];   // (in order: four vec4, as the GPU reads them: src/scatter/trees.js ruleOf)
export const RULE = { E: SLOTS.indexOf('most'), HI: SLOTS.indexOf('hi'), LO: SLOTS.indexOf('lo'), GROW: SLOTS.indexOf('k1'), AT: SLOTS.indexOf('at') };
/** Where a chunk's planes lie in a shape's layer of clumps (src/detail/impostor.js): plane a (0: across x, 1: across y,
    2: across z) of chunk c is tile 3c + a, TILES a row. The plane's own two axes: [u, v]. Its corners' uv lie a step of
    the packing (assets/kit/plant.js: 1024ths) inside its tile, so no pixel at its edge reads the next one (IN). */
export const PLANE = [[2, 1], [0, 2], [0, 1]], IN = 1 / 1024;
/** What a shape submits to be drawn anywhere between lo and hi pixels (at the dial at rest; hi: Infinity, every size
    above lo): its first cards in turn order, its solids not yet gone and, where the clumps can come in that band (under
    their switch), its chunks' planes; nothing of it in a band wholly under far.lo, where its impostor is all there is.
    Every vertex as the kit made it (position normal uv part ao cn root twig) and, a vertex, what the rule moves it by:
      go     a card's or a solid's: the error (metres) at which it goes (0: never by itself); a plane's: at which its
             chunk comes
      tip    a plane's: its chunk's middle, which it grows from (a card's: its sprig's tip; a solid's: its foot)
    a plane's part is 2, its uv its place in its shape's layer of clumps (in tiles: TILES a side, rows from the top);
    and `rule`, its shape's sixteen numbers (RULE); its finest level (hi Infinity) carries `far`, what the GPU bakes its
    far end from. The same shape at two levels is the same thing at the size where they meet: the coarser one holds a
    first share of what the finer one holds, and the rest is gone there. keep: the last parts stay (the library's plant,
    which wears no clumps). */
/** What a level between lo and hi dial pixels holds of a shape: its first nc cards' corners (a first share of the turns),
    its first solids (sv vertices, sc corners: thick first), its chunks' planes (C) where its band reaches under where
    its crowd ends. Under far.lo nothing but the impostor. */
const pickOf = (S, lo, hi, clumps = true) => {
  const near = hi > S.far.lo;   // (a band wholly under it holds nothing but the impostor)
  let t = 0; if (near) while (t < S.parts && drawnUnder(S.turns.go[t], S.size, hi)) t++;
  let i = 0; if (near) while (i < S.solids && drawnUnder(S.steps.go[i], S.size, hi)) i++;
  return { nc: !near ? 0 : t < S.parts ? S.turns.cards[t] : S.cards, sv: i ? S.steps.verts[i - 1] : 0, sc: i ? S.steps.corners[i - 1] : 0, C: clumps && near && S.clumps && lo < switchOf(S.win.hi, S.size) ? S.clumps : null };
};
/** A level's corners (lo … hi dial pixels, as levelOf picks them) into its shape's whole block, levelOf(S, 0, Infinity):
    every card, every solid and the chunks' planes, in that order, which every level of a shape is a first share of. So a
    shape's vertices are kept once and each level is only its corners into them (src/scatter/drawer.js: a make's levels
    that share their finest's). -> Uint32Array */
export function cornersIn(S, lo = 0, hi = Infinity, { clumps = true } = {}) {
  const { nc, sc, C } = pickOf(S, lo, hi, clumps), all = S.solids ? S.steps.verts[S.solids - 1] : 0, out = new Uint32Array(nc * 6 + sc + (C ? C.n * 18 : 0));
  let o = 0;
  for (let c = 0; c < nc; c++) for (const q of [0, 1, 2, 0, 2, 3]) out[o++] = 4 * c + q;
  for (let j = 0; j < sc; j++) out[o++] = S.index[j];   // (the solids where the block keeps them: after every card)
  for (let c = 0, b = S.cards * 4 + all; C && c < C.n; c++) for (let a = 0; a < 3; a++, b += 4) for (const q of [0, 1, 2, 0, 2, 3]) out[o++] = b + q;
  return out;
}
export function levelOf(S, lo = 0, hi = Infinity, { keep = false, clumps = true } = {}) {
  const { nc, sv, sc, C } = pickOf(S, lo, hi, clumps), nk = C ? C.n * 12 : 0;
  const count = nc * 4 + sv + nk;
  const out = { count, position: new Float32Array(count * 3), normal: new Float32Array(count * 3), uv: new Float32Array(count * 2), part: new Float32Array(count), ao: new Float32Array(count), cn: new Float32Array(count * 3), root: new Float32Array(count * 3), twig: new Float32Array(count),
    go: new Float32Array(count), tip: new Float32Array(count * 3) };
  // the cards and the solids: as the shape holds them, the solids moved down to where the cards end
  const copy = (from, n, to) => {
    for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2], ['part', 1], ['ao', 1], ['cn', 3], ['root', 3], ['twig', 1], ['go', 1], ['tip', 3]]) if (S[k]) out[k].set(S[k].subarray(from * w, (from + n) * w), to * w);
  };
  copy(0, nc * 4, 0); copy(S.cards * 4, sv, nc * 4);
  if (keep && S.win.hi > 0) for (let v = 0; v < nc * 4; v++) if (out.go[v] >= S.win.hi) out.go[v] = 0;   // (what the crowd's end would take: kept)
  const index = [];
  for (let c = 0; c < nc; c++) index.push(4 * c, 4 * c + 1, 4 * c + 2, 4 * c, 4 * c + 2, 4 * c + 3);
  const shift = (S.cards - nc) * 4; for (let j = 0; j < sc; j++) index.push(S.index[j] - shift);
  // a chunk's three planes, each through its box's middle across one axis, as wide as its box the other two ways
  for (let c = 0, o = nc * 4 + sv; C && c < C.n; c++) {
    const b = C.boxes.subarray(c * 6, c * 6 + 6), m = [0, 1, 2].map((a) => (b[a] + b[a + 3]) / 2);
    for (let a = 0; a < 3; a++, o += 4) {
      const [U, V] = PLANE[a], tile = c * 3 + a, tx = tile % S.atlas.TILES, ty = floor(tile / S.atlas.TILES);
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([cu, cv], j) => {
        const v = o + j, p = m.slice(); p[U] = cu ? b[U + 3] : b[U]; p[V] = cv ? b[V + 3] : b[V];
        out.position.set(p, v * 3); out.normal[v * 3 + a] = 1; out.cn[v * 3 + a] = 1; out.root.set(m, v * 3); out.tip.set(m, v * 3);
        out.uv[v * 2] = tx + IN + cu * (1 - 2 * IN); out.uv[v * 2 + 1] = ty + IN + (1 - cv) * (1 - 2 * IN); out.part[v] = 2; out.ao[v] = C.ao[c]; out.go[v] = C.go[c];
      });
      index.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  }
  const rule = new Float32Array(SLOTS.length); rule[RULE.HI] = S.win.hi; rule[RULE.LO] = S.win.lo;
  rule[RULE.E] = S.grow.most; rule[RULE.E + 1] = S.grow.at[0]; rule.set(S.grow.at.subarray(1), RULE.GROW);   // (its kept's growth: growthOf)
  return { ...out, index: Uint32Array.from(index), rule, far: hi === Infinity ? S.far.data : null };
}
