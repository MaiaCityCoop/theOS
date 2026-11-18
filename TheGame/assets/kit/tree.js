// The tree kit: what every tree file (assets/*.js of kind `tree`) builds its tree with, so a new kind of tree is only its
// own shapes and how it grows. A tree is a mesh per shape, as it is from near: wood as tubes wrapped in its bark
// texture (part 0), leaves or needles as crossed cards cut out of a painted sprig (part 1), each card knowing its own
// plane (cn: seen edge-on it is cut away, src/scatter/trees.js), every vertex how much light reaches it (ao). Its levels
// of detail are first shares of that one mesh, made by the crowd kit (assets/kit/crowd.js, assets/kit/plant.js).
//
//   export default tree({ uid, type: 'asset', name, kind: 'tree', materials: { wood, leaves }, growth, grow, shade,
//                         placement: { biome, cover, … }, … })
//
// growth { years, variants, form(year, v), height(year) }: its stages of growth, by age (or, without it, shapes: a list).
// litter { material, tile }: what it drops: the ground under it where it leads among its biome's trees (the land lays it).
// A shrub, a herb or what lies on the floor is built the same way (kinds `shrub`, `herb`, `litter`: assets/kinds.js;
// assets/kit/floor.js for what lies).
// placement { biome, cover, light, under, young, scale, lean, seed }: what the one placement rule reads of it
// (src/scatter/rule.js): its biome; cover, how much of the ground it covers where it grows best; light, how thick it
// grows in deep shade and in the open ([0..1, 0..1]); under, whose litter it lies or comes up in (uids); young, how much
// of the ground its saplings cover (a tree with growth); scale, one plant's own size about its age's height; seed, its
// shapes' (another seed: other plants of its kind).
//
// Its levels are its kind's (assets/kinds.js: as many as its px, its far ones as its `far` says); a recipe says them
// only where it differs (levels: [{ P }, …], far: { P, speck } or false).
// fine { sprig, twig }: its finest is splayed (splayOf): every sprig laid out as its painting's twigs, a spray, each twig
// a card of its own painting (twig: a material of one whole twig); sprig: its leaves' paintings as numbers
// (materials/*.twigs.js).
// grow(shape, i) builds a shape whole (a stage's form, or shapes[i]) with builder()/tube()/cards(), or crown() for its
// limbs and foliage as most trees share them, or mound() for a low bush, and returns the builder;
// shade(shape, i), if given, the light mesh the shadow map is drawn from (else none of its levels cast, but the nearest);
// tree() works out the rest the engine reads: its levels, its size, each shape's trunk as a body (the tube made with
// { body: true }, where it stands at a walker's chest) and its feet (the ground it covers: builder); its meshes are made
// where they are asked for, never when its file is read (a worker reads this file too: plain JS, nothing of the page
// in it).

import { budgetOf } from './crowd.js';
import { bandsOf, shapeSize } from './plant.js';
import { kindRule } from '../kinds.js';
import { add, sub, mul, dot, len, norm, cross, lerp, bez } from './math.js';
import { rng } from '../../src/core/hash.js';

/** a way picked at random on the upper side of a ball (more up than down as lift nears 1) */
export const outward = (R0, lift) => { const a = R0() * 2 * Math.PI, y = lift + (1 - lift) * R0() * 2 - (1 - lift), r = Math.sqrt(Math.max(0, 1 - y * y)); return [Math.cos(a) * r, y, Math.sin(a) * r]; };

const CHEST = 1.2;   // metres up a trunk where a walker meets it
/** How deep what stands in a stand is set into the ground (src/scatter/trees.js FOOT, as it draws it): where the ground
    is in a shape's own frame. What lies on it is built so much higher (assets/kit/floor.js). Physical, and set: metres of
    stem under the ground, so that where a thing stands on a slope its foot stays under the ground all round it (the
    ground under a stem falls by its foot's width times the slope). Its derived form is each thing's own, its feet's reach
    (b.feet) times the slope where it stands, in the trees' packing (src/scatter/trees.js); until then one depth for all. */
export const FOOT = 0.15;   // physical: metres of stem set into the ground

/** The mesh being built: positions, normals, uv, part (0 wood, 1 leaves, 2 a solid body, no sprig cut out of it), ao, a
    card's plane (cn), its foot (root: what its sprig grows from and shrinks to), indexed; and its parts (intent 0038,
    Nanite's assemblies): what it is made of, each a prototype laid by a rigid transform about a pivot, as the recipe
    lays it, so the builder (assets/kit/crowd.js) never has to find them again in the triangles:
      { proto, v0, v1, i0, i1, tip, root }   a sprig: prototype `proto` (SPRIG: two crossed cards; SHEET: the same, its
                                             painting repeated; a spray of twigs: splayOf) at { at, x, y, z, s } (its
                                             foot, its three ways, its length), its vertices v0 … v1 four a card, its
                                             corners i0 … i1; tip: what it grows about, root: what it grows out of
      { v0, v1, i0, i1, foot }               a solid piece (a tube: a limb, a twig, the trunk), its own; foot: where it
                                             grows from and shrinks to
    Whatever is laid without a part (a moss's domes) is one solid piece that stays. ao(p): the light that reaches the
    wood at p; barkTile: metres of wood one tile of bark covers; colours: [wood, leaves] for a picture without the
    textures.
    Its feet: the ground it covers, as it is built, each piece [ax, az, bx, bz, ra, rb, edge] in its own frame at scale
    1 (src/scatter/rule.js reads them): a solid piece (edge 0) covers what lies within ra … rb of a to b, between them
    and no further (a disk where a is b); an outline's edge (edge 1) bounds, with the rest of its outline, what it
    covers. Wood that rises through the ground leaves its cross-section there (tube: a trunk, a sapling's stem, a bush's
    stems); what lies on the ground, its wood or stone (assets/kit/floor.js). Leaves cover none: they shade. */
export function builder({ ao = () => 1, barkTile = 1, colours = [[0.3, 0.22, 0.15], [0.1, 0.18, 0.06]] } = {}) {
  const b = { position: [], normal: [], uv: [], part: [], ao: [], color: [], cn: [], root: [], twig: [], index: [], parts: [], body: null, feet: [] };
  // (twig: 1 where a card wears the painting of one twig, its plant's `fine.twig`, not its sprig: splayOf)
  b.v = (p, n, uv, part, a, cn = [0, 0, 0], root = [0, 0, 0], twig = 0) => { b.position.push(...p); b.normal.push(...n); b.cn.push(...cn); b.root.push(...root); b.uv.push(...uv); b.part.push(part); b.ao.push(a); b.twig.push(twig); b.color.push(...colours[Math.min(part, 1)]); return b.ao.length - 1; };
  b.aoAt = ao; b.barkTile = barkTile;
  return b;
}

/** The prototypes a sprig is laid as: its own frame is { x, y, z } (y its way, from its foot at 0 to its tip at 1; x and
    z across it, z = x × y), its corners' places a multiple of its length. */
export const SPRIG = 'sprig', SHEET = 'sheet';
/** Lay prototype P (its cards: [{ q: four corners [x, y, z] in its frame, uv: four [u, v], cn: [x, y, z], ao, twig }])
    as a sprig of b at T ({ at, x, y, z, s }), lit by `light` with `ao` (each card's own share of it), part `proto`. */
function lay(b, proto, P, T, light, ao, root, tip) {
  const v0 = b.ao.length, i0 = b.index.length, w = (q) => [0, 1, 2].map((k) => T.at[k] + T.s * (q[0] * T.x[k] + q[1] * T.y[k] + q[2] * T.z[k]));
  for (const C of P) {
    let cn = norm([0, 1, 2].map((k) => C.cn[0] * T.x[k] + C.cn[1] * T.y[k] + C.cn[2] * T.z[k]));
    if (C.lit && dot(cn, light) < 0) cn = mul(cn, -1);   // (a twig's card faces the crown's light)
    const n = C.lit ? norm(add(mul(light, 0.8), mul(cn, 0.3))) : light, a = Math.min(1, ao * C.ao);   // (lit mostly as the crown is, a little as its own card faces)
    const [k0, k1, k2, k3] = C.q.map((q, j) => b.v(w(q), n, C.uv[j], 1, a, cn, root, C.twig));
    b.index.push(k0, k1, k2, k0, k2, k3);
  }
  b.parts.push({ proto, v0, v1: b.ao.length, i0, i1: b.index.length, T, light, ao, root, tip });
}
/** Two crossed cards, the whole painting on each, `rep` times across it. */
const crossed = (rep) => [0, 1].map((c) => ({ q: [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]].map(([a, y]) => (c ? [0, y, -a] : [a, y, 0])), uv: [[0, 0], [rep, 0], [rep, rep], [0, rep]], cn: c ? [1, 0, 0] : [0, 0, 1], ao: 1, twig: 0, lit: false }));
const CROSSED = new Map();

/** A tube along pts, radius rad[i] at each, `sides` round: its rings carried along the curve without twisting, its bark
    wrapped round a whole number of times so it meets itself. body: this is the trunk (where it passes a walker's chest,
    and how thick it is there, makes the tree's body). */
export function tube(b, pts, rad, sides, { body = false } = {}) {
  const v0 = b.ao.length, i0 = b.index.length;   // (a solid part of its own: it grows from its first ring's middle)
  skin(b, ringsAlong(b, pts, rad, sides), sides);
  b.parts.push({ v0, v1: b.ao.length, i0, i1: b.index.length, foot: pts[0] });
  feetWhereItRises(b, pts, rad);
  if (body) b.body ||= chestOf(pts, rad);
}
/** Its rings, a vertex every 1 / sides of a turn: each ring's frame carried from the last (no twist), its bark's
    across a whole number of tiles round, along by the way walked. */
function ringsAlong(b, pts, rad, sides) {
  const n = pts.length, T = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])));
  let N = norm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), along = 0;
  const reps = Math.max(1, Math.round((2 * Math.PI * rad[0]) / b.barkTile)), rings = [];
  for (let i = 0; i < n; i++) {
    if (i) { along += len(sub(pts[i], pts[i - 1])); N = norm(sub(N, mul(T[i], dot(N, T[i])))); }
    const B = cross(T[i], N), ring = [];
    for (let k = 0; k <= sides; k++) { const a = (k / sides) * 2 * Math.PI, d = add(mul(N, Math.cos(a)), mul(B, Math.sin(a))), p = add(pts[i], mul(d, rad[i])); ring.push(b.v(p, d, [(k / sides) * reps, along / b.barkTile], 0, b.aoAt(p))); }
    rings.push(ring);
  }
  return rings;
}
/** Two triangles between each two rings' neighbouring vertices. */
function skin(b, rings, sides) {
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = rings[i][k], c = rings[i][k + 1], d = rings[i + 1][k], e = rings[i + 1][k + 1];
    b.index.push(a, d, e, a, e, c);
  }
}
/** Where it rises through the ground, its cross-section there is ground it covers: its feet. Only where it rises: a
    branch bowed down into the ground (a sapling's lowest) leaves no foot, as nothing of the thing stands there. */
function feetWhereItRises(b, pts, rad) {
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const y0 = pts[i][1] - FOOT, y1 = pts[i + 1][1] - FOOT;
    if (y0 >= y1 || y0 > 0 || y1 < 0 || (y1 === 0 && i < n - 2)) continue;   // (rising, from under the ground to over it; a crossing at a point between two pieces counted once)
    const t = y0 / (y0 - y1), p = lerp(pts[i], pts[i + 1], t), r = rad[i] + (rad[i + 1] - rad[i]) * t;
    b.feet.push([p[0], p[2], p[0], p[2], r, r, 0]);
  }
}
/** The trunk at a walker's chest: [x, z, its radius there]; a bole that forks lower, its top (a sapling thinner than
    0.06 m there is walked through: null). */
function chestOf(pts, rad) {
  const n = pts.length;
  for (let i = 1; i < n; i++) if (pts[i][1] >= CHEST) {
    const t = (CHEST - pts[i - 1][1]) / Math.max(1e-6, pts[i][1] - pts[i - 1][1]), p = lerp(pts[i - 1], pts[i], t);
    return [p[0], p[2], rad[i - 1] + (rad[i] - rad[i - 1]) * t];
  }
  return rad[n - 1] >= 0.06 ? [pts[n - 1][0], pts[n - 1][2], rad[n - 1]] : null;
}

/** A sprig: two cards crossed along dir, their foot at p, s metres long and wide, cut out of the leaves' sprig, laid as
    its prototype (one part: it comes and goes as one, and grows about its tip, p + dir s: assets/kit/crowd.js);
    light: the normal its light is reckoned with (a crown is lit as the dome it makes, not card by card); root: what it
    grows out of (its foot, unless told); rep: how many times its sprig's picture is laid across it (a larger card's
    leaves are their own size: the picture is repeated, not stretched); proto: SHEET for one no finest level splays (a
    bush's base). */
export function cards(b, p, dir, s, light, ao, R0, root = p, rep = 1, proto = SPRIG) {
  const side0 = norm(cross(dir, Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0])), turn = R0() * Math.PI;
  const x = norm(add(mul(side0, Math.cos(turn)), mul(cross(dir, side0), Math.sin(turn))));
  let P = CROSSED.get(rep); if (!P) CROSSED.set(rep, (P = crossed(rep)));
  lay(b, proto, P, { at: p, x, y: dir, z: cross(x, dir), s }, light, ao, root, add(p, mul(dir, s)));
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
      // a base sprig (a SHEET: one splayOf leaves as it is), sunk into the heap by what it is larger than a fine one
      if (base) cards(b, sub(foot, mul(dir, (size[1] - size[0]) * f * 0.8)), dir, size[1] * f, light, ao, C, foot, rep, SHEET);
      else cards(b, foot, dir, size[0] * f, light, ao, C, foot);
    }
  }
  for (let i = 0; i < stems; i++) {
    const H = heaps[i % lobes], a = R0() * 2 * Math.PI, e = add(H.c, [Math.cos(a) * H.r * 0.4, H.h * 0.55, Math.sin(a) * H.r * 0.4]), k = Math.max(0.5, h);
    tube(b, [[0, 0, 0], add(mul(e, 0.5), [0, h * 0.1, 0]), e], [0.03 * k, 0.022 * k, 0.012 * k], 3);
  }
}

/** A sprig's spray as a prototype (splayOf), in a sprig's own frame (its length 1): a card a twig of S's painting, the
    twigs standing round the sprig's way as a spray's do, each as long as its twig in the spray, its foot on the sprig's
    foot, as wide as the painting's leaves reach, in the painting's own proportion. R: its own dice. */
function sprayOf(S, R) {
  const T = S.twig, u0 = T.foot[0] - T.half, u1 = T.foot[0] + T.half, phi0 = R() * 2 * Math.PI, Y = [0, 1, 0];   // (the part of the twig's painting a card shows: all of it)
  return S.twigs.map(([ang, L], j) => {
    // where it stands: as far from the sprig's way as on the painting, round it by the golden angle (no two twigs one
    // behind another), turned a little about itself
    const phi = phi0 + j * 2.39996 + (R() - 0.5) * 0.6, pol = Math.abs(ang) * (0.8 + 0.5 * R()) + 0.08, rad = [Math.cos(phi), 0, -Math.sin(phi)];
    const axis = norm(add(mul(Y, Math.cos(pol)), mul(rad, Math.sin(pol)))), w0 = norm(cross(Y, axis)), roll = (R() - 0.5) * 1.0, w = norm(add(mul(w0, Math.cos(roll)), mul(cross(axis, w0), Math.sin(roll))));
    const k = L / T.length, lo = -T.foot[1] * k, hi = (1 - T.foot[1]) * k, half = T.half * k;
    return { q: [[lo, -half], [lo, half], [hi, half], [hi, -half]].map(([al, ac]) => add(mul(axis, al), mul(w, ac))), uv: [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], cn: norm(cross(w, axis)), ao: 0.85 + 0.3 * R(), twig: 1, lit: true };
  });
}
const SPRAYS = 4;   // the sprays a plant's sprigs are laid as: each sprig one of them, turned its own way about itself
/** A plant's finest, made from it as grown: every sprig (a pair of crossed cards, the whole spray painted on each) laid
    as its painting's spray instead, a card a twig, each the painting of ONE twig, whole (its plant's `fine.twig`: nothing
    beside it on the card, so none cuts through another's leaves), its leaves the size they were. The sprig is no longer
    two flat sheets. The spray is made once a prototype (SPRAYS of them), not once a sprig: a sprig keeps its place, its
    way and its turn (its transform), its light, its tip and its root, so it comes and goes as one. S: the paintings as
    numbers ({ twigs: [[angle from upright, length], …], reach, twig: { foot, length, half } }: materials/*.twigs.js). Its
    wood, and whatever is no such sprig (a SHEET: a bush's base), stay as they are. */
export function splayOf(m, S, seed = 1) {
  const b = builder(), sprays = Array.from({ length: SPRAYS }, (_, v) => sprayOf(S, rng(seed * 7919 + v * 31 + 5))), n = m.part.length, map = new Int32Array(n).fill(-1);
  b.body = m.body ?? null;
  const V = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]], copy = (i) => (map[i] >= 0 ? map[i] : (map[i] = b.v(V(m.position, i), V(m.normal, i), [m.uv[i * 2], m.uv[i * 2 + 1]], m.part[i], m.ao[i], V(m.cn, i), V(m.root, i), m.twig?.[i] ?? 0)));
  const mine = new Uint8Array(m.index.length);   // (a corner of a part: what is of no part is copied as it is)
  m.parts.forEach((q, k) => {
    mine.fill(1, q.i0, q.i1);
    if (q.proto === SPRIG) return lay(b, `${SPRIG}:${k % SPRAYS}`, sprays[k % SPRAYS], q.T, q.light, q.ao, q.root, q.tip);
    const v0 = b.ao.length, i0 = b.index.length;
    for (let i = q.i0; i < q.i1; i++) b.index.push(copy(m.index[i]));
    b.parts.push({ ...q, v0, v1: b.ao.length, i0, i1: b.index.length });
  });
  for (let i = 0; i < m.index.length; i++) if (!mine[i]) b.index.push(copy(m.index[i]));
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

/** What the page must know of a tree at once, before any of its meshes is made (its size, each shape's height, trunk
    and feet: measured on its shapes as grown), by what it is (a recipe's uid and seed): `kept`, what was measured at an
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
    (src/scatter/heap.js). What the page must know at once (size, heights, trunk, feet) is measured once on its shapes as
    grown and kept as a few numbers (OUTLINES). */
export function tree(recipe) {
  const { shapes: own = [{}], growth, grow, shade, shadow = {}, fine = null, ...rest } = recipe, seed = rest.placement?.seed ?? 1;
  // (its levels are its kind's, assets/kinds.js: as many as its px, the last of them its far ones, as its kind's `far`
  // says: what a recipe says of them itself, it says only where it differs)
  const far = recipe.far ?? kindRule(rest, 'far') ?? false, nFar = far ? (far.speck === false ? 1 : 2) : 0, levels = recipe.levels ?? Array.from({ length: Math.max(1, kindRule(rest, 'px').length - nFar) }, () => ({}));
  const G = growth ? stagesOf(growth, seed) : null, shapes = G ? G.shapes : own;
  // its levels: its file's, then its far ones (its clumps and its impostor: two, one where `speck: false`, none where
  // `far: false`), each a first share of its finest; where each ends on screen is its kind's (assets/kinds.js px)
  const specs = [...levels, ...(far ? Array.from({ length: nFar }, () => ({ ...(far.P ? { P: far.P } : {}), far: true })) : [])];
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
        outline = { size: boundsOf(near), trunk: near.map((m) => m.body ?? [0, 0, 0.12]), heights: near.map((m) => boundsOf([m]).height), feet: near.map((m) => m.feet) };   // trunk: each shape's at a walker's chest: where it stands off its foot, its radius (assets/kinds.js: shapesOf, a tree's trunk); feet: the ground each covers (builder)
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
        reckoned from its finest without building the crowd, and kept with its outline with each shape's far end (farOf) */
    crowdRooms() {
      const o = measured();
      if (!o.rooms) {
        const his = bandsOf(out).map(([, hi], l) => (l ? hi : Infinity)), B = shapes.map((s, i) => budgetOf(finest(i), { size: shapeSize(out, i) }, his));
        o.rooms = B.map((b) => b.map((r) => [r.verts, r.tris])); o.far = B.map((b) => ({ cell: b.cell, chunks: b.chunks }));
        OUTLINES.made.set(id, o);
      }
      return o.rooms;
    },
    /** each shape's far end as the crowd kit reckons it: { cell (its impostor's views' texels a side), chunks (its clumps) } */
    farOf: () => (out.crowdRooms(), measured().far),
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
    feet: lazy(() => measured().feet),
    size: lazy(() => rest.size ?? measured().size), trunk: lazy(() => measured().trunk), heights: lazy(() => measured().heights),
    // its levels as numbers only (P: cells a patch's side; tris(): the most triangles its first shape has there, of its
    // room in the heap); shadow: it is drawn into the shadow map by its shade, for every tree within `far` metres (from
    // high up, up to `wide` times that) whose shade can reach the view (`reach`: how far a crown's shadow falls); past
    // them the land dims its floor under the stand by itself (src/terrain/material.js)
    detail: lazy(() => (detail ??= { ...(rest.detail || {}), levels: specs.map((L, i) => ({ ...L, tris: () => out.crowdRooms()[0][i][1] })), ...(shade ? { shadow: { far: 80, wide: 2.4, reach: 22, ...shadow } } : {}) })),
  });
}
