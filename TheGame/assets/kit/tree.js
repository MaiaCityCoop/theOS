// The tree kit: what every tree file (assets/*.js of kind `tree`) builds its tree with, so a new kind of tree is only its
// own shapes and how it grows. A tree is a mesh per level of detail and per shape: wood as tubes wrapped in its bark
// texture (part 0), leaves or needles as crossed cards cut out of a painted sprig (part 1), each card knowing its own
// plane (cn: seen edge-on it is cut away, src/scatter/trees.js), every vertex how much light reaches it (ao).
//
//   export default tree({ uid, type: 'asset', name, kind: 'tree', materials: { wood, leaves }, growth, grow, shade,
//                         levels: [{ P }, …], placement: { biome, share, … }, … })
//
// growth { years, variants, form(year, v), height(year) }: its stages of growth, by age (or, without it, shapes: a list).
// placement { biome, share, scale, lean, seed }: its biome, whose stand it joins (the biome's `trees`: the cells, the
// groves, the ages, the same for every kind of tree that grows there); share, its part of that stand's cells (one tree a
// cell: a mix); scale, one tree's own size about its age's height; seed, its shapes' (another seed: other trees of its kind).
//
// levels: one { P } for each level its file draws (P: cells per patch side); after them the kit adds its two farthest
// by itself, made from its nearest: its crown as one body on a post (36 triangles), then a speck (8) (farOf;
// `far: { P, sides, shade }` to tune them, `far: false` for none).
// grow(q, shape, i) builds level q (0 nearest) of a shape (a stage's form, or shapes[i]) with builder()/tube()/cards(), or
// crown() for its limbs and foliage as most trees share them, and returns the builder;
// shade(shape, i), if given, the light mesh the shadow map is drawn from (else none of its levels cast, but the nearest);
// tree() works out the rest the engine reads: every level's meshes, the shade's, the tree's size, and each shape's trunk
// as a body (the tube made with { body: true }, where it stands at a walker's chest).

// ---- small vector help ----
export const add = (a, b) => a.map((x, i) => x + b[i]), sub = (a, b) => a.map((x, i) => x - b[i]), mul = (a, s) => a.map((x) => x * s);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / (len(a) || 1));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
/** a curved limb through a, bent towards c, to b: n + 1 points */
export const bez = (a, c, b, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return add(add(mul(a, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(b, t * t)); });
/** a seeded random 0..1 */
export const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** a way picked at random on the upper side of a ball (more up than down as lift nears 1) */
export const outward = (R0, lift) => { const a = R0() * 2 * Math.PI, y = lift + (1 - lift) * R0() * 2 - (1 - lift), r = Math.sqrt(Math.max(0, 1 - y * y)); return [Math.cos(a) * r, y, Math.sin(a) * r]; };

const CHEST = 1.2;   // metres up a trunk where a walker meets it

/** The mesh being built: positions, normals, uv, part (0 wood, 1 leaves, 2 a crown as one solid body: farOf), ao, a
    card's plane (cn) and its foot (root: what it grows from and shrinks to as two levels hand over), indexed. ao(p): the
    light that reaches the wood at p; barkTile: metres of wood one tile of bark covers; colours: [wood, leaves] for a
    picture without the textures. */
export function builder({ ao = () => 1, barkTile = 1, colours = [[0.3, 0.22, 0.15], [0.1, 0.18, 0.06]] } = {}) {
  const b = { position: [], normal: [], uv: [], part: [], ao: [], color: [], cn: [], root: [], index: [], body: null };
  b.v = (p, n, uv, part, a, cn = [0, 0, 0], root = [0, 0, 0]) => { b.position.push(...p); b.normal.push(...n); b.cn.push(...cn); b.root.push(...root); b.uv.push(...uv); b.part.push(part); b.ao.push(a); b.color.push(...colours[Math.min(part, 1)]); return b.ao.length - 1; };
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
    light: the normal its light is reckoned with (a crown is lit as the dome it makes, not card by card). */
export function cards(b, p, dir, s, light, ao, R0) {
  const side0 = norm(cross(dir, Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0])), turn = R0() * Math.PI;
  for (const q of [0, Math.PI / 2]) {
    const side = norm(add(mul(side0, Math.cos(turn + q)), mul(cross(dir, side0), Math.sin(turn + q))));
    const w = mul(side, s * 0.5), h = mul(dir, s), c0 = sub(p, w), c1 = add(p, w), c2 = add(c1, h), c3 = add(c0, h), cn = norm(cross(side, dir));
    const [i0, i1, i2, i3] = [[c0, [0, 0]], [c1, [1, 0]], [c2, [1, 1]], [c3, [0, 1]]].map(([v, uv]) => b.v(v, light, uv, 1, ao, cn, p));
    b.index.push(i0, i1, i2, i0, i2, i3);
  }
}

/** A crown's wood and foliage, as most trees share them. `limbs`: where each great limb leaves the wood below and where
    it ends ({ from, end }); `puffs`: its heaps of foliage ({ p: where, pr: how large }). Every puff is fed by the limb
    whose end is nearest: the limb splits into branches (to groups of its puffs) and twigs (to each puff), as many as
    level q shows (0: every twig; 1: branches; 2: limbs only; 3: no wood but what the file made); over each puff its
    cards stand out.
      thick, g     the wood's girth and the foliage's size, to a grown tree's (1)
      girth        a limb's radius at its foot and at its end, metres at thick 1; bow: how far it bows upward
      count, size  cards a puff, and a card's size in metres, per level
      lift         how much the cards' ways favour up (0: all round the puff; outward())
      dirOf(p, d)  the way a card stands, from a random way d out of its puff at p (default: d, lifted a little)
      light(p, d)  the normal it is lit with (a crown is lit as the body it makes); ao(p, d): the light that reaches it */
export function crown(b, q, { limbs, puffs, thick = 1, g = 1, girth = [0.11, 0.055], bow = 1.3, count, size, lift = 0.25, dirOf, light, ao, R0 }) {
  const d2 = (u, w) => (u[0] - w[0]) ** 2 + (u[1] - w[1]) ** 2 + (u[2] - w[2]) ** 2;
  const of = puffs.map((c) => limbs.reduce((m, L, k) => (d2(c.p, L.end) < d2(c.p, limbs[m].end) ? k : m), 0));
  limbs.forEach((L, li) => {
    if (q < 3) { const n = 6, pts = bez(L.from, add(lerp(L.from, L.end, 0.45), [0, bow * thick, 0]), L.end, n); tube(b, pts, pts.map((_, i) => (girth[0] + (girth[1] - girth[0]) * (i / n)) * thick), q ? 4 : 6); }   // long, bowed upward
    // its branches: more of them the more puffs it feeds (a few twigs to a branch's end, not a fan of spokes)
    const mine = puffs.filter((_, i) => of[i] === li), nG = Math.min(mine.length, q >= 2 ? 1 : q ? Math.min(4, Math.max(2, Math.ceil(mine.length / 5))) : Math.min(9, Math.max(3, Math.ceil(mine.length / 5))));
    if (!nG) return;
    const groups = Array.from({ length: nG }, () => []);
    mine.sort((x, y) => d2(x.p, L.from) - d2(y.p, L.from)).forEach((c, i) => groups[Math.floor((i * nG) / mine.length)].push(c));
    for (const gr of groups) {
      const G = sub(mul(gr.reduce((t, c) => add(t, c.p), [0, 0, 0]), 1 / gr.length), [0, 0.6 * g, 0]);   // where its branch ends: under its puffs' middle
      if (q < 2) tube(b, bez(lerp(L.from, L.end, 0.6), add(lerp(L.end, G, 0.5), [0, 0.6 * g, 0]), G, 4), [0.06, 0.05, 0.042, 0.035, 0.03].map((x) => (x * g * girth[0]) / 0.11), q ? 3 : 5);
      for (const c of gr) {
        if (q === 0) { const run = Math.sqrt(d2(G, c.p)); tube(b, bez(G, add(lerp(G, c.p, 0.5), [0, 0.22 * run, 0]), c.p, 3), [0.03, 0.024, 0.018, 0.012].map((x) => x * g), 3); }   // a twig, arching up to its puff
        for (let t = 0; t < count[q]; t++) {
          const d = outward(R0, q >= 2 ? Math.max(lift, 0.3) : lift), sz = size[q] * (0.8 + R0() * 0.4) * g, dir = dirOf ? dirOf(c.p, d) : norm(add(d, [0, 0.35, 0]));
          // its foot on the puff's skin; a coarser level's larger card sunk into it by the part it is larger, so every
          // level has the same outline (no fringe of the coarser one round the finer where they change over)
          const at = sub(add(c.p, mul(d, c.pr * 0.35)), mul(dir, Math.max(0, sz - size[0] * g) * 0.8));
          cards(b, at, dir, sz, light(c.p, d), ao(at, d), R0);
        }
      }
    }
  });
}

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)))];
const mean = (a) => a.reduce((t, x) => t + x, 0) / Math.max(1, a.length);

/** A tree far off, made from its nearest mesh, so no tree file draws it: its crown one closed body round its leaves
    (part 2: solid, no sprig cut out of it), as wide each way as they reach, lit as they are (their own normals and
    shade, averaged); its trunk a three-sided post from its foot into the crown. Thirty-six triangles: a tree a dozen
    pixels high; or, as a speck (four sides, no shoulder, no trunk), eight: a tree of a few pixels.
    sides: corners round the crown; shoulder: a ring between its widest and its top (a rounded crown, not a pointed
    one); trunk: its post; shade: how much darker than its outer leaves (a crown of cards shows its own depths). */
export function farOf(m, { sides = 6, shade = 0.85, shoulder: round = true, trunk = true } = {}) {
  const N = m.part.length, X = (i) => m.position[i * 3], Y = (i) => m.position[i * 3 + 1], Z = (i) => m.position[i * 3 + 2];
  const leaf = [], wood = [];
  for (let i = 0; i < N; i++) (m.part[i] > 0.5 ? leaf : wood).push(i);
  const col = (i, d) => (i == null ? d : [m.color[i * 3], m.color[i * 3 + 1], m.color[i * 3 + 2]]), wAo = wood.length ? mean(wood.map((i) => m.ao[i])) : 1;
  const b = builder({ ao: () => wAo, colours: [col(wood[0], [0.3, 0.22, 0.15]), col(leaf[0], [0.1, 0.18, 0.06])] });
  let top = [0, wood.reduce((t, i) => Math.max(t, Y(i)), 0), 0];
  if (leaf.length) {
    const ys = leaf.map(Y).sort((a, c) => a - c), y0 = pct(ys, 0.04), y1 = pct(ys, 0.985), cx = mean(leaf.map(X)), cz = mean(leaf.map(Z));
    const rOf = (i) => Math.hypot(X(i) - cx, Z(i) - cz), secOf = (i) => Math.floor((Math.atan2(Z(i) - cz, X(i) - cx) / (2 * Math.PI) + 1) * sides) % sides;
    const rAll = pct(leaf.map(rOf).sort((a, c) => a - c), 0.85), bySec = Array.from({ length: sides }, () => []);
    for (const i of leaf) bySec[secOf(i)].push(i);
    // how far its leaves reach, each way (evened a little with the ways beside it)
    let r = bySec.map((s) => (s.length > 8 ? pct(s.map(rOf).sort((a, c) => a - c), 0.85) : rAll));
    r = r.map((x, k) => 0.5 * x + 0.25 * (r[(k + 1) % sides] + r[(k + sides - 1) % sides]));
    // where it is widest (an umbrella's rim is its underside, a round crown's its middle), and its shoulder above
    const outer = leaf.filter((i) => rOf(i) > 0.7 * rAll), yw = Math.min(y0 + 0.6 * (y1 - y0), Math.max(y0 + 0.08 * (y1 - y0), outer.length ? mean(outer.map(Y)) : (y0 + y1) / 2)), ysh = yw + 0.68 * (y1 - yw);
    const C = [cx, (yw + y1) / 2, cz];
    // what a corner of it is lit with: its leaves' own normals and shade there, averaged
    const lit = (set) => {
      const s = set.length >= 4 ? set : leaf, n = s.reduce((t, i) => add(t, [m.normal[i * 3], m.normal[i * 3 + 1], m.normal[i * 3 + 2]]), [0, 0, 0]);
      return { n: len(n) > 1e-6 ? norm(n) : [0, 1, 0], ao: mean(s.map((i) => m.ao[i])) * shade };
    };
    const put = (p, L, uv) => b.v(p, L.n, uv, 2, L.ao, L.n, C);
    const dirs = Array.from({ length: sides }, (_, k) => { const a = ((k + 0.5) / sides) * 2 * Math.PI; return [Math.cos(a), Math.sin(a)]; });
    const wide = dirs.map(([c, s], k) => put([cx + c * r[k], yw, cz + s * r[k]], lit(bySec[k].filter((i) => rOf(i) > 0.6 * r[k])), [k / sides, 0.3]));
    const shoulder = round ? dirs.map(([c, s], k) => put([cx + c * r[k] * 0.72, ysh, cz + s * r[k] * 0.72], lit(bySec[k].filter((i) => Y(i) > (yw + ysh) / 2)), [k / sides, 0.7])) : wide;
    // (without a shoulder its top a little lower: a cone as full as the dome it stands for)
    const apex = put([cx, round ? y1 : ysh + 0.5 * (y1 - ysh), cz], lit(leaf.filter((i) => Y(i) > ysh)), [0.5, 1]), under = put([cx, y0, cz], lit(leaf.filter((i) => Y(i) < yw)), [0.5, 0]);
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      if (round) b.index.push(wide[k], shoulder[k], shoulder[j], wide[k], shoulder[j], wide[j]);
      b.index.push(shoulder[k], apex, shoulder[j], under, wide[k], wide[j]);
    }
    top = [cx, yw * 0.6 + y0 * 0.4, cz];
  }
  if (wood.length && trunk) {
    const low = wood.reduce((t, i) => Math.min(t, Y(i)), Infinity), foot = wood.filter((i) => Y(i) <= low + Math.max(0.5, 0.12 * (top[1] - low)));
    const fx = mean(foot.map(X)), fz = mean(foot.map(Z)), rf = Math.max(0.04, mean(foot.map((i) => Math.hypot(X(i) - fx, Z(i) - fz))));
    tube(b, [[fx, low, fz], top], [rf, rf * 0.6], 3);
  }
  return b;
}

// the box round every shape's nearest mesh: the tree's size
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
    const S = stages.find((x) => age < x.to) ?? stages[n - 1], t = Math.log(Math.max(age, S.from) / S.from) / Math.log(S.to / S.from);
    return { shape: S.offset + (v % S.variants), s: (S.hFrom + (S.hTo - S.hFrom) * Math.min(1, t)) / S.h, height: G.height(age) };
  };
  return { shapes, stages, at };
}

/** A tree file's recipe made whole: its levels' meshes (one per shape), its shade, its size and its trunks' bodies. With
    growth, its shapes are its stages of growth (and their variants), and a tree in the world is as old as its stand says
    (placement.age, src/scatter/trees.js). */
export function tree(recipe) {
  const { shapes: own = [{}], growth, grow, shade, levels, shadow = {}, far = {}, ...rest } = recipe, seed = rest.placement?.seed ?? 1;
  const G = growth ? stagesOf(growth, seed) : null, shapes = G ? G.shapes : own;
  const built = levels.map((L, q) => { const meshes = shapes.map((s, i) => grow(q, s, i)); return { mesh: meshes[0], meshes, P: L.P }; });
  const shades = shade ? shapes.map((s, i) => shade(s, i)) : null;
  const near = built[0].meshes;
  // after the levels its file draws, its two farthest, made here from its nearest (farOf): a crown as one body on a
  // post, then a speck; `far: false`: none
  if (far) for (const o of [far, { ...far, sides: 4, shoulder: false, trunk: false }]) { const meshes = near.map((m) => farOf(m, o)); built.push({ mesh: meshes[0], meshes, P: far.P ?? 64, far: true }); }
  return {
    ...rest,
    size: rest.size ?? boundsOf(near),
    trunk: near.map((m) => m.body ?? [0, 0, 0.12]),   // each shape's trunk at a walker's chest: where it stands off its foot, its radius (src/world/trunks.js)
    heights: near.map((m) => boundsOf([m]).height),   // each shape's own height
    ...(G ? { growth: { years: growth.years, stages: G.stages, at: G.at, height: growth.height } } : {}),
    /** the same kind of tree grown from another seed: other shapes, other places (the library's Random) */
    regrow: (s) => tree({ ...recipe, placement: { ...recipe.placement, seed: s } }),
    // meshes: one per shape (mesh: the first, for a single picture); shadow: drawn into the shadow map for every tree
    // within `far` metres whose shade can reach the view (`reach`: how far a crown's shadow falls)
    detail: { ...(rest.detail || {}), levels: built, ...(shades ? { shadow: { meshes: shades, far: 80, reach: 22, ...shadow } } : {}) },
  };
}
