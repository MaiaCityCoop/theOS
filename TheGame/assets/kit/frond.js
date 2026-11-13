// A plant of leaf cards, by its number (its family: assets/zoo/fronds.js): a fern, a tuft, a bush of fronds. Thousands
// of cards rise from a small core, each a strip that droops. What draws it cuts each card out as a leaf (the stand's
// foliage material reads where on its card a pixel is and drops what lies outside the leaf: no texture is needed, so
// it is cut out at any distance), and draws both its sides: a card has no thickness.
//
// At every coarser level of the ladder (ladder.js) there are fewer cards, each wider, so the plant covers as much, as
// a real foliage's levels do: over a level's range the cards that are gone at the next thin away to nothing while
// those that stay widen; the last cards melt into its hull (a ball its size) as it shrinks to a dot.
//
//   frondMesh(i, l) -> { index, verts }   packed as solid.js says. In the twelve bits a skeleton's vertex keeps its
//                                         bones in, a card's vertex keeps where on the card it is: across it (bone a:
//                                         0 or 15) and along it (bone b and the weight: eight bits)
import { LADDER, DOTN, roomOf, underOf } from './ladder.js';
import { packSolid, dotMesh } from './solid.js';
import { ball, onBall, faceOf, ballMesh, hash3, SWELL } from './blob.js';

const SEED = 31337, PI = Math.PI, TAU = PI * 2;
const SEGS = [8, 4, 3, 2, 1];   // a card's segments along it, level by level
const KIND = new Map();
// what a kind is: how many cards at full (of 8 segments: 50 000 to 88 000 triangles), how steeply they rise, how long
// and wide they are, how they droop, how wide its core is, how many lobes its leaves have
function kindOf(i) {
  let K = KIND.get(i); if (K) return K;
  const r = (n) => hash3(i, n, 1, SEED);
  K = { i, cards: 3130 + Math.floor(r(1) * 2370), lift: 0.1 + 0.8 * r(2), len: 0.5 + 0.5 * r(3), wide: 0.035 + 0.05 * r(4), droop: 0.2 + r(5), core: 0.04 + 0.14 * r(6), lobes: 2 + Math.floor(r(7) * 8), box: null, hull: null };
  KIND.set(i, K);
  return K;
}
/** how many lobes kind i's leaves have (its look says it: what draws it cuts them out) */
export const frondLobes = (i) => kindOf(i).lobes;
// a point of card c: u across it (0 … 1), v along it, w its width: out[o … o+2] its place, out[o+3 … o+5] its normal
// (half the card's own, half the way out of the plant: a crown lit as one soft body); returns its shade (dark in the core)
function at(K, c, w, u, v, out, o) {
  const h = (n) => hash3(K.i, c, n, SEED + 7), az = TAU * h(1), el = (PI / 2) * Math.min(1, K.lift * (0.35 + 0.9 * h(2))), rr = K.core * Math.sqrt(h(3)), ra = TAU * h(4), len = K.len * (0.55 + 0.45 * h(6)), tw = (h(7) - 0.5) * 1.2;
  const ce = Math.cos(el), dx = ce * Math.cos(az), dy = Math.sin(el), dz = ce * Math.sin(az), sx0 = -Math.sin(az), sz0 = Math.cos(az);
  // (across it: level with the ground at right angles to its way, turned a little about its way)
  const ux = dy * sz0, uy = dz * sx0 - dx * sz0, uz = -dy * sx0, ct = Math.cos(tw), st = Math.sin(tw), sx = sx0 * ct + ux * st, sy = uy * st, sz = sz0 * ct + uz * st;
  const a = (u - 0.5) * w * (1 - 0.45 * v * v), fall = K.droop * len;
  let x = rr * Math.cos(ra) + dx * len * v + sx * a, y = K.core * 0.6 * h(5) + dy * len * v - fall * v * v * 0.5 + sy * a, z = rr * Math.sin(ra) + dz * len * v + sz * a;
  const tx = dx * len, ty = dy * len - fall * v, tz = dz * len;   // (its way at v)
  let nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx; const nl = Math.hypot(nx, ny, nz) || 1, sg = ny < 0 ? -1 : 1; nx *= sg / nl; ny *= sg / nl; nz *= sg / nl;
  const B = K.box;
  if (B) { x = (x - B.x) * B.k; y = (y - B.y) * B.k; z = (z - B.z) * B.k; }
  const ol = Math.hypot(x, y - (B ? 0.3 : 0.2), z) || 1;
  out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = nx * 0.5 + (x / ol) * 0.5; out[o + 4] = ny * 0.5 + ((y - (B ? 0.3 : 0.2)) / ol) * 0.5; out[o + 5] = nz * 0.5 + (z / ol) * 0.5;
  return 0.45 + 0.55 * v;
}
// its own frame (its foot at 0, its middle over 0, its largest side 1) and its hull, measured on a few hundred of its cards
function framed(K) {
  if (K.box) return K;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], p = [0, 0, 0, 0, 0, 0];
  for (let c = 0; c < 400; c++) for (const v of [0, 0.5, 1]) for (const u of [0, 1]) { at(K, c, K.wide * 2.4, u, v, p, 0); for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; } }
  const k = 1 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  K.box = { x: (lo[0] + hi[0]) / 2, y: lo[1], z: (lo[2] + hi[2]) / 2, k };
  K.hull = { y: ((hi[1] - lo[1]) * k) / 2, e: [(hi[0] - lo[0]) * k * 0.45, (hi[1] - lo[1]) * k * 0.45, (hi[2] - lo[2]) * k * 0.45] };
  return K;
}
// a level's cards: how many (as many as its room holds, no more than the kind has), their segments, their width
function cutOf(K, l) {
  const seg = SEGS[l] ?? 1, room = roomOf(l), C = Math.max(1, Math.min(K.cards, Math.floor(room.verts / (2 * (seg + 1))), Math.floor(room.tris / (2 * seg))));
  return { C, seg, w: Math.min(0.3, K.wide * (K.cards / C) ** 0.4) };
}
const hullAt = (K) => (n) => { const H = K.hull, sw = SWELL[n] ?? 1; return (x, y, z, out, o) => { out[o] = x * H.e[0] * sw; out[o + 1] = H.y + y * H.e[1] * sw; out[o + 2] = z * H.e[2] * sw; return 0.8; }; };
/** how many triangles kind i's full mesh has */
export const frondTris = (i) => { const c = cutOf(kindOf(i), 0); return c.C * c.seg * 2; };

/** Kind i's mesh at level l of the ladder. */
export function frondMesh(i, l) {
  const K = framed(kindOf(i)), n = LADDER[l].n, D = LADDER[l].delta, under = underOf(l);
  if (n === DOTN) return dotMesh();
  if (n > 0 && n <= 2) return ballMesh(hullAt(K), n, under, D);   // its coarse levels: its hull
  const { C, seg, w } = cutOf(K, l), verts = new Uint32Array(C * 2 * (seg + 1) * 4), index = new Uint32Array(C * seg * 6);
  // what it turns into: the next coarser level's cards, or (from its coarsest cards) its hull
  const next = under > 2 ? cutOf(K, l + 1) : null, HB = under > 0 && under <= 2 ? ball(under, hullAt(K)(under), true) : null, H = K.hull;
  const P = [0, 0, 0, 0, 0, 0], A = [0, 0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0, 0], X = [0, 0, 0, 0, 0, 0, 0];
  let nv = 0, ni = 0;
  for (let c = 0; c < C; c++) {
    const base = nv;
    for (let j = 0; j <= seg; j++) for (let s = 0; s < 2; s++, nv++) {
      const v = j / seg, sh = at(K, c, w, s, v, P, 0); let T = P;
      if (next && c < next.C) {   // a card that stays: where the vertex lies on it there (wider, of fewer segments: between two of its corners)
        const f = v * next.seg, j0 = Math.min(next.seg - 1, Math.floor(f)), t = f - j0;
        at(K, c, next.w, s, j0 / next.seg, A, 0); at(K, c, next.w, s, (j0 + 1) / next.seg, B, 0);
        for (let q = 0; q < 6; q++) X[q] = A[q] + (B[q] - A[q]) * t; T = X;
      } else if (next) { at(K, c, 0, 0.5, v, X, 0); T = X; }   // one that is gone there: thinned to its middle line
      else if (HB) { const f = faceOf(P[0] / H.e[0], (P[1] - H.y) / H.e[1], P[2] / H.e[2]); onBall(HB, f[0], f[1], f[2], X); T = X; }
      const v8 = Math.round(v * 255);
      packSolid(verts, nv * 4, P[0], P[1], P[2], P[3], P[4], P[5], sh, T[0], T[1], T[2], T[3], T[4], T[5], next || HB ? D : 0, s ? 15 : 0, v8 >> 4, (v8 & 15) / 15);
    }
    for (let j = 0; j < seg; j++) { const a = base + j * 2; index[ni++] = a; index[ni++] = a + 1; index[ni++] = a + 2; index[ni++] = a + 1; index[ni++] = a + 3; index[ni++] = a + 2; }
  }
  return { index, verts };
}
