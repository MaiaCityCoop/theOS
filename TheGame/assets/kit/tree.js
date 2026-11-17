// The tree kit: what every tree file (assets/*.js of kind `tree`) builds its tree with, so a new kind of tree is only its
// own shapes and how it grows. A tree is a mesh per shape, as it is from near: wood as tubes wrapped in its bark
// texture (part 0), leaves or needles as crossed cards cut out of a painted sprig (part 1), each card knowing its own
// plane (cn: seen edge-on it is cut away, src/scatter/trees.js), every vertex how much light reaches it (ao). Its levels
// of detail are first shares of that one mesh, made by the crowd kit (assets/kit/crowd.js, assets/kit/plant.js).
//
//   export default tree({ uid, type: 'asset', name, kind: 'tree', materials: { wood, leaves }, growth, grow, shade,
//                         levels: [{ P }, …], placement: { biome, share, … }, … })
//
// growth { years, variants, form(year, v), height(year) }: its stages of growth, by age (or, without it, shapes: a list).
// litter { material, tile }: what it drops: the ground under it where it leads in its stand (the land lays it).
// A shrub is built the same way (kind `shrub`: assets/kinds.js), and stands in its biome's understory: placement.stand
// names which of the biome's stands it joins (`shrubs`; a tree's, unnamed, is `trees`).
// placement.where({ p }): where in its stand it likes to grow, 0..1 (node code), if not everywhere.
// placement { biome, share, scale, lean, seed }: its biome, whose stand it joins (the biome's `trees`: the cells, the
// groves, the ages, the same for every kind of tree that grows there); share, its part of that stand's cells (one tree a
// cell: a mix); scale, one tree's own size about its age's height; seed, its shapes' (another seed: other trees of its kind).
//
// levels: one { P } for each of its levels (P: cells per patch side); after them its far ones, where the crowd kit's far
// body stands for it: two (`far: { P }`, `speck: false` for one, `far: false` for none). Where each ends on screen is its
// kind's (assets/kinds.js px).
// fine { sprig, twig }: its finest is splayed (splayOf): every sprig laid out as its painting's twigs, a spray, each twig
// a card of its own painting (twig: a material of one whole twig); sprig: its leaves' paintings as numbers
// (materials/*.twigs.js).
// grow(shape, i) builds a shape whole (a stage's form, or shapes[i]) with builder()/tube()/cards(), or crown() for its
// limbs and foliage as most trees share them, or mound() for a low bush, and returns the builder;
// shade(shape, i), if given, the light mesh the shadow map is drawn from (else none of its levels cast, but the nearest);
// tree() works out the rest the engine reads: its levels, its size, and each shape's trunk as a body (the tube made
// with { body: true }, where it stands at a walker's chest); its meshes are made where they are asked for, never when
// its file is read (a worker reads this file too: plain JS, nothing of the page in it).

import { budgetOf } from './crowd.js';
import { bandsOf, shapeSize, ownTop } from './plant.js';
import { add, sub, mul, dot, len, norm, cross, lerp, bez } from './math.js';
import { rng } from '../../src/core/hash.js';

/** a way picked at random on the upper side of a ball (more up than down as lift nears 1) */
export const outward = (R0, lift) => { const a = R0() * 2 * Math.PI, y = lift + (1 - lift) * R0() * 2 - (1 - lift), r = Math.sqrt(Math.max(0, 1 - y * y)); return [Math.cos(a) * r, y, Math.sin(a) * r]; };

const CHEST = 1.2;   // metres up a trunk where a walker meets it

/** The mesh being built: positions, normals, uv, part (0 wood, 1 leaves, 2 a solid body, no sprig cut out of it), ao, a
    card's plane (cn), its foot (root: what its sprig grows from and shrinks to) and how it hands over (hand: see
    cards), indexed. ao(p): the
    light that reaches the wood at p; barkTile: metres of wood one tile of bark covers; colours: [wood, leaves] for a
    picture without the textures. */
export function builder({ ao = () => 1, barkTile = 1, colours = [[0.3, 0.22, 0.15], [0.1, 0.18, 0.06]] } = {}) {
  const b = { position: [], normal: [], uv: [], part: [], ao: [], color: [], cn: [], root: [], hand: [], twig: [], index: [], body: null };
  // (twig: 1 where a card wears the painting of one twig, its plant's `fine.twig`, not its sprig: splayOf)
  b.v = (p, n, uv, part, a, cn = [0, 0, 0], root = [0, 0, 0], hand = [0, 0], twig = 0) => { b.position.push(...p); b.normal.push(...n); b.cn.push(...cn); b.root.push(...root); b.hand.push(...hand); b.uv.push(...uv); b.part.push(part); b.ao.push(a); b.twig.push(twig); b.color.push(...colours[Math.min(part, 1)]); return b.ao.length - 1; };
  b.aoAt = ao; b.barkTile = barkTile;
  return b;
}

/** A tube along pts, radius rad[i] at each, `sides` round: its rings carried along the curve without twisting, its bark
    wrapped round a whole number of times so it meets itself. body: this is the trunk (where it passes a walker's chest,
    and how thick it is there, makes the tree's body). */
export function tube(b, pts, rad, sides, { body = false } = {}) {
  const n = pts.length, T = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])));
  let N = norm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), along = 0;
  const reps = Math.max(1, Math.round((2 * Math.PI * rad[0]) / b.barkTile)), rings = [];
  for (let i = 0; i < n; i++) {
    if (i) { along += len(sub(pts[i], pts[i - 1])); N = norm(sub(N, mul(T[i], dot(N, T[i])))); }
    const B = cross(T[i], N), ring = [];
    for (let k = 0; k <= sides; k++) { const a = (k / sides) * 2 * Math.PI, d = add(mul(N, Math.cos(a)), mul(B, Math.sin(a))), p = add(pts[i], mul(d, rad[i])); ring.push(b.v(p, d, [(k / sides) * reps, along / b.barkTile], 0, b.aoAt(p))); }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = rings[i][k], c = rings[i][k + 1], d = rings[i + 1][k], e = rings[i + 1][k + 1];
    b.index.push(a, d, e, a, e, c);
  }
  if (body) {
    for (let i = 1; i < n && !b.body; i++) if (pts[i][1] >= CHEST) {   // the trunk at chest height
      const t = (CHEST - pts[i - 1][1]) / Math.max(1e-6, pts[i][1] - pts[i - 1][1]), p = lerp(pts[i - 1], pts[i], t);
      b.body = [p[0], p[2], rad[i - 1] + (rad[i] - rad[i - 1]) * t];
    }
    if (!b.body && rad[n - 1] >= 0.06) b.body = [pts[n - 1][0], pts[n - 1][2], rad[n - 1]];   // a bole that forks lower: its top (a sapling thinner than that is walked through)
  }
}

/** Crossed cards: two cards crossed along dir, their foot at p, s metres long and wide, cut out of the leaves' sprig;
    light: the normal its light is reckoned with (a crown is lit as the dome it makes, not card by card); root: what it
    grows from and shrinks to (its foot, unless told: cards with the same root are one sprig, which comes and goes as
    one: assets/kit/crowd.js); hand: [from, kept], carried with it (a card whose `from` is 1 is not splayed: splayOf);
    rep: how many times its sprig's picture is laid across it (a larger card's leaves are their own size: the picture is
    repeated, not stretched). */
export function cards(b, p, dir, s, light, ao, R0, root = p, hand = [0, 0], rep = 1) {
  const side0 = norm(cross(dir, Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0])), turn = R0() * Math.PI;
  for (const q of [0, Math.PI / 2]) {
    const side = norm(add(mul(side0, Math.cos(turn + q)), mul(cross(dir, side0), Math.sin(turn + q))));
    const w = mul(side, s * 0.5), h = mul(dir, s), c0 = sub(p, w), c1 = add(p, w), c2 = add(c1, h), c3 = add(c0, h), cn = norm(cross(side, dir));
    const [i0, i1, i2, i3] = [[c0, [0, 0]], [c1, [rep, 0]], [c2, [rep, rep]], [c3, [0, rep]]].map(([v, uv]) => b.v(v, light, uv, 1, ao, cn, root, hand));
    b.index.push(i0, i1, i2, i0, i2, i3);
  }
}

/** A crown's wood and foliage, as most trees share them. `limbs`: where each great limb leaves the wood below and where
    it ends ({ from, end }); `puffs`: its heaps of foliage ({ p: where, pr: how large }). Every puff is fed by the limb
    whose end is nearest: the limb splits into branches (to groups of its puffs) and twigs (to each puff); over each
    puff its cards stand out.
      thick, g     the wood's girth and the foliage's size, to a grown tree's (1)
      girth        a limb's radius at its foot and at its end, metres at thick 1; bow: how far it bows upward
      count, size  cards a puff, and a card's size in metres
      lift         how much the cards' ways favour up (0: all round the puff; outward())
      dirOf(p, d)  the way a card stands, from a random way d out of its puff at p (default: d, lifted a little)
      light(p, d)  the normal it is lit with (a crown is lit as the body it makes); ao(p, d): the light that reaches it */
export function crown(b, { limbs, puffs, thick = 1, g = 1, girth = [0.11, 0.055], bow = 1.3, count, size, lift = 0.25, dirOf, light, ao, R0 }) {
  const d2 = (u, w) => (u[0] - w[0]) ** 2 + (u[1] - w[1]) ** 2 + (u[2] - w[2]) ** 2;
  const of = puffs.map((c) => limbs.reduce((m, L, k) => (d2(c.p, L.end) < d2(c.p, limbs[m].end) ? k : m), 0));
  limbs.forEach((L, li) => {
    { const n = 6, pts = bez(L.from, add(lerp(L.from, L.end, 0.45), [0, bow * thick, 0]), L.end, n); tube(b, pts, pts.map((_, i) => (girth[0] + (girth[1] - girth[0]) * (i / n)) * thick), 6); }   // long, bowed upward
    // its branches: more of them the more puffs it feeds (a few twigs to a branch's end, not a fan of spokes)
    const mine = puffs.filter((_, i) => of[i] === li), nG = Math.min(mine.length, Math.min(9, Math.max(3, Math.ceil(mine.length / 5))));
    if (!nG) return;
    const groups = Array.from({ length: nG }, () => []);
    mine.sort((x, y) => d2(x.p, L.from) - d2(y.p, L.from)).forEach((c, i) => groups[Math.floor((i * nG) / mine.length)].push(c));
    for (const gr of groups) {
      const G = sub(mul(gr.reduce((t, c) => add(t, c.p), [0, 0, 0]), 1 / gr.length), [0, 0.6 * g, 0]);   // where its branch ends: under its puffs' middle
      tube(b, bez(lerp(L.from, L.end, 0.6), add(lerp(L.end, G, 0.5), [0, 0.6 * g, 0]), G, 4), [0.06, 0.05, 0.042, 0.035, 0.03].map((x) => (x * g * girth[0]) / 0.11), 5);
      for (const c of gr) {
        { const run = Math.sqrt(d2(G, c.p)); tube(b, bez(G, add(lerp(G, c.p, 0.5), [0, 0.22 * run, 0]), c.p, 3), [0.03, 0.024, 0.018, 0.012].map((x) => x * g), 3); }   // a twig, arching up to its puff
        for (let t = 0; t < count; t++) {
          const d = outward(R0, lift), sz = size * (0.8 + R0() * 0.4) * g, dir = dirOf ? dirOf(c.p, d) : norm(add(d, [0, 0.35, 0]));
          // its foot on the puff's skin; a card larger than the crown's own sunk into it by the part it is larger, so
          // none stands out of the outline
          const at = sub(add(c.p, mul(d, c.pr * 0.35)), mul(dir, Math.max(0, sz - size * g) * 0.8));
          cards(b, at, dir, sz, light(c.p, d), ao(at, d), R0);
        }
      }
    }
  });
}

/** A low bush as most shrubs share it. Not one round mound: several heaps beside one another, each its own reach and
    height, and a shoot here and there standing out past the rest, so its outline is ragged and bushes that stand close
    run into one another. Its foliage is in two parts:
      - its base: a few large sprigs (each the sprig's picture repeated across a larger card, its leaves their own size)
        that make its whole shape;
      - its fine sprigs: many small ones over the base (they grow in among it), and a few short stems from its foot.
      r, h         its reach and height, metres (of its largest heap; the others lie within about 1.3 r)
      lobes        how many heaps (1: a single round bush); ragged: the share of its sprigs that stand out as shoots
      dome         [from, to], 0 its foot … 1 its top: where on a heap its sprigs stand (a fern: only low, round its foot)
      puffs        [places on it, of them the base's]; count: [sprigs at a place, of them the base's]
      size         [a fine sprig's, a base sprig's], metres
      rise         how much a sprig's way favours up over out
      stems        short stems from its foot
      seed         its own number: the same seed, the same bush */
export function mound(b, { r, h, lobes = 1, ragged = 0.2, dome = [0.1, 1], puffs, count, size, rise = 0.3, stems = 0, seed = 1, R0 = rng(seed) }) {
  // (its heaps first: its outline)
  const heaps = Array.from({ length: lobes }, (_, i) => {
    const a = R0() * 2 * Math.PI, d = i ? r * (0.45 + 0.4 * R0()) : 0, k = i ? 0.5 + 0.35 * R0() : lobes > 1 ? 0.8 : 1;
    return { c: [Math.cos(a) * d, 0, Math.sin(a) * d], r: r * k, h: h * (i ? 0.55 + 0.5 * R0() : 1) };
  });
  const rep = Math.max(1, Math.round(size[1] / size[0]));
  for (let i = 0; i < puffs[0]; i++) {
    const Q = rng(seed * 7919 + i * 131 + 17), H = heaps[Math.min(lobes - 1, Math.floor(Q() * lobes))], shoot = Q() < ragged ? 1.15 + 0.3 * Q() : 1;
    const a = Q() * 2 * Math.PI, u = dome[0] + (dome[1] - dome[0]) * Q() ** 0.7, c = Math.sqrt(Math.max(0, 1 - u * u)), k = (0.5 + 0.5 * Q()) * shoot;
    const d = [Math.cos(a) * c, u, Math.sin(a) * c], p = add(H.c, [d[0] * H.r * k, d[1] * H.h * 0.75 * k, d[2] * H.r * k]), light = norm([d[0] * 0.6, d[1] * 0.6 + 0.8, d[2] * 0.6]);
    const ao = Math.max(0.3, (0.45 + 0.55 * Math.min(1, p[1] / Math.max(h * 0.75, 0.1))) * (0.65 + 0.35 * Math.min(1, k)));
    for (let t = 0; t < count[0]; t++) {
      const C = rng(seed * 104729 + i * 977 + t * 61 + 5), base = i < puffs[1] && t < count[1];
      const dir = norm([d[0] + (C() - 0.5) * 0.7, d[1] + rise, d[2] + (C() - 0.5) * 0.7]), f = (0.75 + 0.5 * C()) * (shoot > 1 ? 1.2 : 1), foot = add(p, mul(dir, 0.02 * t));
      // a base sprig (hand 1, 1: one splayOf leaves as it is), sunk into the heap by what it is larger than a fine one
      if (base) cards(b, sub(foot, mul(dir, (size[1] - size[0]) * f * 0.8)), dir, size[1] * f, light, ao, C, foot, [1, 1], rep);
      else cards(b, foot, dir, size[0] * f, light, ao, C, foot);
    }
  }
  for (let i = 0; i < stems; i++) {
    const H = heaps[i % lobes], a = R0() * 2 * Math.PI, e = add(H.c, [Math.cos(a) * H.r * 0.4, H.h * 0.55, Math.sin(a) * H.r * 0.4]), k = Math.max(0.5, h);
    tube(b, [[0, 0, 0], add(mul(e, 0.5), [0, h * 0.1, 0]), e], [0.03 * k, 0.022 * k, 0.012 * k], 3);
  }
}

/** A plant's finest, made from it as grown: every sprig (a pair of crossed cards,
    the whole spray painted on each) laid out as its painting's twigs: a card a twig, each the painting of ONE twig,
    whole (its plant's `fine.twig`: nothing beside it on the card, so none cuts through another's leaves), the twigs
    standing round the sprig's own way as a spray's do, each as long as its twig in the spray, its leaves the size they
    were. The sprig is no longer two flat sheets. S: the paintings as numbers ({ twigs: [[angle from upright, length],
    …], reach, twig: { foot, length, half } }: materials/*.twigs.js). Its wood, and whatever is no such sprig (a card
    whose painting is repeated: a bush's base), stay as they are; a twig's card keeps its sprig's foot as its root, so
    the sprig comes and goes as one. */
export function splayOf(m, S, seed = 1) {
  const b = builder(), n = m.part.length, idx = m.index, V = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]], map = new Int32Array(n).fill(-1);
  b.body = m.body ?? null;
  const copy = (i) => (map[i] >= 0 ? map[i] : (map[i] = b.v(V(m.position, i), V(m.normal, i), [m.uv[i * 2], m.uv[i * 2 + 1]], m.part[i], m.ao[i], V(m.cn, i), V(m.root, i), [m.hand[i * 2], m.hand[i * 2 + 1]], m.twig?.[i] ?? 0)));
  // a sprig as cards() lays it: two quads on eight vertices one after another, the whole painting on each, handed over as one
  const sprigAt = (t) => { const a = idx[t]; if (m.part[a] !== 1 || t + 12 > idx.length || m.hand[a * 2] > 0.5 || m.uv[(a + 2) * 2] !== 1 || m.uv[(a + 2) * 2 + 1] !== 1) return false; for (let q = 0; q < 2; q++) { const o = t + q * 6, v = a + q * 4; if (idx[o] !== v || idx[o + 1] !== v + 1 || idx[o + 2] !== v + 2 || idx[o + 3] !== v || idx[o + 4] !== v + 2 || idx[o + 5] !== v + 3) return false; } return true; };
  const T = S.twig, u0 = T.foot[0] - T.half, u1 = T.foot[0] + T.half;   // (the part of the twig's painting a card shows: all of it)
  for (let t = 0; t < idx.length;) {
    if (!sprigAt(t)) { b.index.push(copy(idx[t]), copy(idx[t + 1]), copy(idx[t + 2])); t += 3; continue; }
    const a = idx[t], c0 = V(m.position, a), c1 = V(m.position, a + 1), c3 = V(m.position, a + 3), p = lerp(c0, c1, 0.5), h = sub(c3, c0), s = len(h), dir = mul(h, 1 / (s || 1));
    const e1 = norm(sub(c1, c0)), e2 = cross(dir, e1), light = V(m.normal, a), root = V(m.root, a), R = rng(seed * 7919 + a * 31 + 5), phi0 = R() * 2 * Math.PI;
    S.twigs.forEach(([ang, L], j) => {
      // where it stands: as far from the sprig's way as on the painting, round it by the golden angle (no two twigs one
      // behind another), turned a little about itself
      const phi = phi0 + j * 2.39996 + (R() - 0.5) * 0.6, pol = Math.abs(ang) * (0.8 + 0.5 * R()) + 0.08, rad = add(mul(e1, Math.cos(phi)), mul(e2, Math.sin(phi)));
      const axis = norm(add(mul(dir, Math.cos(pol)), mul(rad, Math.sin(pol)))), w0 = norm(cross(dir, axis)), roll = (R() - 0.5) * 1.0, w = norm(add(mul(w0, Math.cos(roll)), mul(cross(axis, w0), Math.sin(roll))));
      // its card: the twig's painting stretched so its twig is as long as this twig is in the spray (L of the sprig's
      // card), its foot on the sprig's foot; as wide as the painting's leaves reach, in the painting's own proportion
      const k = (L * s) / T.length, lo = -T.foot[1] * k, hi = (1 - T.foot[1]) * k, half = T.half * k;
      let cn = norm(cross(w, axis)); if (dot(cn, light) < 0) cn = mul(cn, -1);
      const nrm = norm(add(mul(light, 0.8), mul(cn, 0.3))), ao = Math.min(1, m.ao[a] * (0.85 + 0.3 * R()));   // lit mostly as the crown is, a little as its own card faces
      const q = [[lo, -half, u0, 0], [lo, half, u1, 0], [hi, half, u1, 1], [hi, -half, u0, 1]].map(([al, ac, u, v]) => b.v(add(p, add(mul(axis, al), mul(w, ac))), nrm, [u, v], 1, ao, cn, root, [0, 0], 1));
      b.index.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    });
    t += 12;
  }
  return b;
}

// the box round every shape's mesh: the tree's size
const boundsOf = (meshes) => {
  let x = 0, z = 0, y = 0;
  for (const m of meshes) for (let i = 0; i < m.position.length; i += 3) { x = Math.max(x, Math.abs(m.position[i])); y = Math.max(y, m.position[i + 1]); z = Math.max(z, Math.abs(m.position[i + 2])); }
  return { length: 2 * x, width: 2 * z, height: y };
};

/** How a tree grows, worked out from its file's growth { years, variants, form, height }: one shape per stage and variant
    (form(year, v): its numbers at that age), each stage standing for the ages round it (from its geometric midpoints
    with the stages either side), a tree between drawn as its stage scaled to its own height (height(year), metres). */
function stagesOf(G, seed) {
  const n = G.years.length, shapes = [], stages = [];
  G.years.forEach((year, i) => {
    const from = i ? Math.sqrt(G.years[i - 1] * year) : G.min ?? 1, to = i < n - 1 ? Math.sqrt(year * G.years[i + 1]) : G.max ?? 300, k = G.variants?.[i] ?? 1;
    stages.push({ year, from, to, offset: shapes.length, variants: k, h: G.height(year), hFrom: G.height(from), hTo: G.height(to) });
    for (let v = 0; v < k; v++) shapes.push({ ...G.form(year, v, seed), year, stage: i, variant: v });   // its seed: another seed, other trees of the same kind
  });
  /** a tree of this age: which of the shapes (variant v of its stage) and its scale */
  const at = (age, v = 0) => {
    const S = stages.find((x) => age < x.to) ?? stages[n - 1];
    return { shape: S.offset + (v % S.variants), s: heightIn(S, age) / S.h, height: G.height(age) };
  };
  return { shapes, stages, at };
}
/** How tall a tree of this age stands in stage S: its height by age where the stage begins, at its own year and where it
    ends (hFrom, h, hTo), and between them straight in the logarithms of age and height, as a power of its age (as a
    young tree grows): within a few hundredths of its height by age (intent 0035; tools/scale.js measures it). The
    trees' engine works out the same on the graphics card (src/scatter/trees.js). */
export function heightIn(S, age) {
  const a = Math.min(Math.max(age, S.from), S.to), low = a < S.year, [a0, a1, h0, h1] = low ? [S.from, S.year, S.hFrom, S.h] : [S.year, S.to, S.h, S.hTo];
  return a1 > a0 ? Math.exp(Math.log(h0) + (Math.log(h1) - Math.log(h0)) * (Math.log(a / a0) / Math.log(a1 / a0))) : h0;
}

/** What the page must know of a tree at once, before any of its meshes is made (its size, each shape's height and
    trunk: measured on its shapes as grown), by what it is (a recipe's uid and seed): `kept`, what was measured at an
    earlier start and is handed in (src/core/outlines.js reads it from where it is kept, by the recipe's version);
    `made`, what was measured anew this time, for it to keep. A few numbers a tree. */
export const OUTLINES = { kept: new Map(), made: new Map() };
const FLOATS = ['position', 'normal', 'uv', 'part', 'ao', 'color', 'cn', 'root', 'hand', 'twig'];
// a built mesh as it is handed on: its attributes as typed arrays (what the GPU takes as they are), its trunk's body;
// nothing of the builder left on it
const packed = (m) => ({ ...Object.fromEntries(FLOATS.filter((k) => m[k]?.length).map((k) => [k, new Float32Array(m[k])])), index: new Uint32Array(m.index), body: m.body ?? null });

/** A tree file's recipe made whole. With growth, its shapes are its stages of growth (and their variants), and a tree
    in the world is as old as its stand says (placement.age, src/scatter/trees.js).
    Nothing of it is built when its file is read, and in the game none of its meshes is ever on the page: they are
    made shape by shape where they are asked for (finest: by its family in the recipes' workers, assets/kit/plant.js,
    each level a first share of it; and by the library, for a plant on its stage) and live on the GPU
    (src/scatter/heap.js). What the page must know at once (size, heights, trunk) is measured once on its shapes as
    grown and kept as a few numbers (OUTLINES). */
export function tree(recipe) {
  const { shapes: own = [{}], growth, grow, shade, levels, shadow = {}, far = {}, fine = null, ...rest } = recipe, seed = rest.placement?.seed ?? 1;
  const G = growth ? stagesOf(growth, seed) : null, shapes = G ? G.shapes : own;
  // its levels: its file's, then its far ones (the crowd kit's far body: two, one where `speck: false`, none where
  // `far: false`), each a first share of its finest; where each ends on screen is its kind's (assets/kinds.js px)
  const specs = [...levels, ...(far ? Array.from({ length: far.speck === false ? 1 : 2 }, () => ({ P: far.P ?? 64, far: true })) : [])];
  // (the last few made are kept as the builder left them: the crowd kit builds a shape's levels one after another)
  const memo = new Map(), once = (key, make) => { let m = memo.get(key); if (!m) { if (memo.size >= 6) memo.delete(memo.keys().next().value); memo.set(key, (m = make())); } return m; };
  /** Shape `shape` at its finest, as the builder made it (its attributes lists of numbers): grown whole, and where its
      file says `fine` every sprig splayed into its twigs (splayOf). The crowd kit makes every level of it from this. */
  const finest = (shape) => once(shape, () => { const m = grow(shapes[shape], shape); return fine ? splayOf(m, fine.sprig, seed + shape) : m; });
  const id = `${rest.uid}:${seed}`; let outline = null, detail = null;
  const measured = () => {
    if (!outline) {
      outline = OUTLINES.kept.get(id);
      if (!outline) {
        const near = shapes.map((s, i) => grow(s, i));
        outline = { size: boundsOf(near), trunk: near.map((m) => m.body ?? [0, 0, 0.12]), heights: near.map((m) => boundsOf([m]).height) };   // trunk: each shape's at a walker's chest: where it stands off its foot, its radius (assets/kinds.js: shapesOf, a tree's trunk)
        OUTLINES.made.set(id, outline);
      }
    }
    return outline;
  };
  const out = {
    ...rest,
    ...(fine ? { fine: { twig: fine.twig } } : {}),   // (what its finest wears: the plants' material reads it, the textures find it)
    // (at: a tree of an age, which shape and its scale; the scale over the shape as built, so it stands exactly as tall
    // as its height by age says, as the trees' engine draws it: src/scatter/trees.js sizeAtOne)
    ...(G ? { growth: { years: growth.years, stages: G.stages, height: growth.height, at: (age, v) => { const r = G.at(age, v), S = G.stages.find((x) => r.shape >= x.offset && r.shape < x.offset + x.variants), b = measured().heights[r.shape]; return { ...r, s: b > 0 ? (r.s * S.h) / b : r.s }; } } } : {}),
    /** how many shapes it has, and how many levels (its file's and its far ones) */
    shapeCount: shapes.length, levelCount: specs.length,
    finest,
    /** its shade's mesh for a shape (what the shadow map is drawn from), as the builder made it; none: it has no shade of its own */
    shadeRaw: shade ? (shape) => shade(shapes[shape], shape) : null,
    /** The room each shape's levels need in the heap, [shape][level] [verts, tris] (assets/kit/crowd.js budgetOf),
        reckoned from its finest without building the crowd, and kept with its outline */
    crowdRooms() {
      const o = measured();
      if (!o.rooms) {
        const his = bandsOf(out).map(([, hi], l) => (l ? hi : Infinity));
        o.rooms = shapes.map((s, i) => budgetOf(finest(i), { size: shapeSize(out, i) }, his.map((hi) => ownTop(out, i, hi))).map((r) => [r.verts, r.tris]));
        OUTLINES.made.set(id, o);
      }
      return o.rooms;
    },
    /** shape `shape` at its finest as typed arrays (a plain geometry's), at any level: every level is a first share of it */
    meshAt: (level, shape = 0) => packed(finest(Math.min(shape, shapes.length - 1))),
    /** the same kind of tree grown from another seed: other shapes, other places (the library's Random). A shape of its
        file's that carries a seed of its own (a bush's mound, a branch: no growth to grow it from the placement's seed)
        is grown from that seed moved as far as the placement's was, so a bush is another bush too; its own seed gives
        it back as it was (intent 0025) */
    regrow: (s) => tree({ ...recipe, ...(recipe.shapes ? { shapes: recipe.shapes.map((S) => (S.seed == null ? S : { ...S, seed: S.seed + (s - seed) * 7919 })) } : {}), placement: { ...recipe.placement, seed: s } }),
  };
  const lazy = (get) => ({ enumerable: true, configurable: true, get });
  return Object.defineProperties(out, {
    size: lazy(() => rest.size ?? measured().size), trunk: lazy(() => measured().trunk), heights: lazy(() => measured().heights),
    // its levels as numbers only (P: cells a patch's side; tris(): the most triangles its first shape has there, of its
    // room in the heap); shadow: it is drawn into the shadow map by its shade, for every tree within `far` metres (from
    // high up, up to `wide` times that) whose shade can reach the view (`reach`: how far a crown's shadow falls); past
    // them the land dims its floor under the stand by itself (src/terrain/material.js)
    detail: lazy(() => (detail ??= { ...(rest.detail || {}), levels: specs.map((L, i) => ({ ...L, tris: () => out.crowdRooms()[0][i][1] })), ...(shade ? { shadow: { far: 80, wide: 2.4, reach: 22, ...shadow } } : {}) })),
  });
}
