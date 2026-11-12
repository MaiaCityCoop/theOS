// The tree kit: what every tree file (assets/*.js of kind `tree`) builds its tree with, so a new kind of tree is only its
// own shapes and how it grows. A tree is a mesh per level of detail and per shape: wood as tubes wrapped in its bark
// texture (part 0), leaves or needles as crossed cards cut out of a painted sprig (part 1), each card knowing its own
// plane (cn: seen edge-on it is cut away, src/scatter/trees.js), every vertex how much light reaches it (ao).
//
//   export default tree({ uid, type: 'asset', name, kind: 'tree', materials: { wood, leaves }, growth, grow, shade,
//                         levels: [{ P }, …], placement: { …, age }, … })
//
// growth { years, variants, form(year, v), height(year) }: its stages of growth, by age (or, without it, shapes: a list).
// placement { biome, share, age: { stand, young, min }, … }: share, its part of its biome's cells among every kind of
// tree that grows there (one grid of cells for them all, one tree a cell: a mix); age, how old its stands are.
//
// grow(q, shape, i) builds level q (0 nearest) of a shape (a stage's form, or shapes[i]) with builder()/tube()/cards() and returns the builder;
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

/** The mesh being built: positions, normals, uv, part (0 wood, 1 leaves), ao, a card's plane (cn), indexed. ao(p): the
    light that reaches the wood at p; barkTile: metres of wood one tile of bark covers; colours: [wood, leaves] for a
    picture without the textures. */
export function builder({ ao = () => 1, barkTile = 1, colours = [[0.3, 0.22, 0.15], [0.1, 0.18, 0.06]] } = {}) {
  const b = { position: [], normal: [], uv: [], part: [], ao: [], color: [], cn: [], index: [], body: null };
  b.v = (p, n, uv, part, a, cn = [0, 0, 0]) => { b.position.push(...p); b.normal.push(...n); b.cn.push(...cn); b.uv.push(...uv); b.part.push(part); b.ao.push(a); b.color.push(...colours[part]); return b.ao.length - 1; };
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
  if (body) for (let i = 1; i < n; i++) if (pts[i][1] >= CHEST) {   // the trunk at chest height
    const t = (CHEST - pts[i - 1][1]) / Math.max(1e-6, pts[i][1] - pts[i - 1][1]), p = lerp(pts[i - 1], pts[i], t);
    b.body = [p[0], p[2], rad[i - 1] + (rad[i] - rad[i - 1]) * t]; break;
  }
}

/** Crossed cards: two cards crossed along dir, their foot at p, s metres long and wide, cut out of the leaves' sprig;
    light: the normal its light is reckoned with (a crown is lit as the dome it makes, not card by card). */
export function cards(b, p, dir, s, light, ao, R0) {
  const side0 = norm(cross(dir, Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0])), turn = R0() * Math.PI;
  for (const q of [0, Math.PI / 2]) {
    const side = norm(add(mul(side0, Math.cos(turn + q)), mul(cross(dir, side0), Math.sin(turn + q))));
    const w = mul(side, s * 0.5), h = mul(dir, s), c0 = sub(p, w), c1 = add(p, w), c2 = add(c1, h), c3 = add(c0, h), cn = norm(cross(side, dir));
    const [i0, i1, i2, i3] = [[c0, [0, 0]], [c1, [1, 0]], [c2, [1, 1]], [c3, [0, 1]]].map(([v, uv]) => b.v(v, light, uv, 1, ao, cn));
    b.index.push(i0, i1, i2, i0, i2, i3);
  }
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
  const { shapes: own = [{}], growth, grow, shade, levels, shadow = {}, ...rest } = recipe, seed = rest.placement?.seed ?? 1;
  const G = growth ? stagesOf(growth, seed) : null, shapes = G ? G.shapes : own;
  const built = levels.map((L, q) => { const meshes = shapes.map((s, i) => grow(q, s, i)); return { mesh: meshes[0], meshes, P: L.P }; });
  const shades = shade ? shapes.map((s, i) => shade(s, i)) : null;
  const near = built[0].meshes;
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
