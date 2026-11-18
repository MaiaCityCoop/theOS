// Defaults by kind: what every asset of a kind gets unless its own file says otherwise. An asset writes only what
// differs (intent 0002). No kind says where its detail changes: every rung of every thing (a first share of a plant's
// crowd, its clumps, its impostor, a cluster's parent, nothing at all) comes where its own error, measured on the thing
// at full detail, is the one ERROR_PX (src/detail/error.js, intent 0038).
//
//   far    a plant's far end, as the crowd kit makes it (assets/kit/crowd.js): true, its impostor, after its clumps
//          where the kit finds them finer than the impostor where they would come; false, none (a few hundred corners:
//          cheaper drawn than baked)
//   impostor  whether what stands at a place (src/world/place.js: the library, a page without WebGPU) has the far card
//             every impostor has (src/detail/impostor.js); false where a kind needs none
//   solid     what a walker and the camera cannot pass when the asset's own file has no `solid` (intent 0003), made
//             from what is measured of the thing itself (shapesOf, below; intent 0027): { trunk: true } its trunk, where a
//             walker meets it, as a cylinder up its foot (a tree; its kit measures it); { round: true } its round and
//             its height (a rock; its kit measures them); { leaves: true, from: m } its leaves, brushed through at
//             their edge and led round in their middle where they stand higher than the knee, and only a plant that
//             stands m metres tall or more: one smaller is walked through (a shrub, by its size: Samuel); where nothing is
//             measured, { post: r } a round of r times its largest side, { box: true } its footprint as a box; false:
//             nothing (grass)
//   casts     whether it casts a shadow (src/world/shadow.js): every level, card included, casts as drawn, so a new asset's
//             shadow is its own shape at the level the eye sees; an asset may say `casts: false` in its own file
//   measure  what its size on screen is measured by: its largest side, or 'height' (sizeOf, below)
//   wind   how it moves in the wind (src/world/place.js): { billow, flap } in metres at a storm; it is held still at the
//          ground and along its middle (a pole, a trunk) and moves most halfway up and out; none where a kind does not move
//   snow   how it holds snow (src/world/light.js: snowLift): { clumps } metres by which the snow lies uneven on it (0: one
//          even layer); its own file may also say `roofed: r`, metres round its middle under its roof, where no snow falls
//   foliage   how a tree's leaves take the light and the wind (src/scatter/trees.js): { wrap (0..1, the light reaching
//             round them), through (0..1, the sun shining through them from behind: needles much, leathery leaves
//             little), flutter (how much they tremble in the wind, 1: a pine's brushes), tint ([r, g, b] over its sprig's
//             colours: a shrub that borrows another plant's sprig) }
//   surface   how its faces take the light (src/world/place.js): { wrap (0..1, light wrapping round a soft thing), through
//             (0..1, light shining through a thin one when the sun is behind it) }
import { WALKER } from '../world/scale.js';
/** How tall a shrub must stand to stop a walker (metres, as it stands: its own height times its scale): one smaller is
    walked through, one taller is brushed through at its edge and led round its middle. A walker's shoulder (world/scale.js). */
export const SHRUB_FROM = WALKER.shoulder;
const KINDS = {
  default: { impostor: true, solid: { box: true }, casts: true, snow: { clumps: 0.08 }, surface: { wrap: 0, through: 0 } },
  tree: { far: true, measure: 'height', impostor: false, solid: { trunk: true, post: 0.03 }, casts: true, snow: { clumps: 0.3 }, wind: { sway: 0.35 }, foliage: { wrap: 0.45, through: 0.55, flutter: 1 } },   // past its impostor its biome's canopy colours the land
  shrub: { far: true, impostor: false, solid: { leaves: true, from: SHRUB_FROM }, casts: false, snow: { clumps: 0.2 }, wind: { sway: 0.15 }, foliage: { wrap: 0.4, through: 0.3, flutter: 0.6 } },   // walked through where it stands under SHRUB_FROM, led round its middle where it stands taller (Samuel, 2026-11-15: "Shrubs should be walkthrough … depending on the shrub size"); no shadow of its own
  // what lies on the floor (a cone, a twig, fallen leaves, a branch, a log, a stone bedded in it): no far end, nothing a
  // walker cannot step over or through, no shadow of its own, still in the wind
  litter: { far: false, impostor: false, solid: false, casts: false, snow: { clumps: 0.05 }, foliage: { wrap: 0.4, through: 0.2, flutter: 0 } },
  herb: { far: false, impostor: false, solid: false, casts: false, snow: { clumps: 0.1 }, wind: { sway: 0.1 }, foliage: { wrap: 0.5, through: 0.4, flutter: 0.7 } },   // a fern, a herb: drawn as what lies on the floor is, but it sways and its leaves tremble
  grass: { impostor: false, solid: false, casts: false },   // blades: drawn in rings by the grass's engine (src/scatter/grass.js), nothing a walker cannot pass
  rock: { impostor: false, solid: { round: true, post: 0.4 }, casts: true, snow: { clumps: 0.05 } },   // stone holds it evenly, a little drifted. Its levels are its cluster hierarchy's (assets/kit/clusters.js), from its full mesh alone
  shelter: { impostor: true, casts: true, wind: { billow: 0.09, flap: 0.025 }, surface: { wrap: 0.35, through: 0.45 }, snow: { clumps: 0.22 } },   // canvas: snow slides off it in sheets, clumps hold; soft, and thin enough to glow
};
export default KINDS;

// The one way an asset's value is read where its kind may give it (every engine and the placer ask here, none merges by
// itself):
/** A block of an asset (snow, wind, surface): its own over its kind's over the default's, each writing only what differs;
    null where none of them has it (a kind that does not move in the wind). */
export const kindOf = (asset, field) => {
  const own = asset?.[field], kind = KINDS[asset?.kind]?.[field], base = KINDS.default[field];
  return own || kind || base ? { ...(base || {}), ...(kind || {}), ...(own || {}) } : null;
};
/** A rule of an asset's kind that is taken whole, not merged (far, impostor, casts, solid, measure): the kind's, else
    the default's. */
export const kindRule = (asset, field) => KINDS[asset?.kind]?.[field] ?? KINDS.default[field];

// An asset's size, as every engine, the land and the library measure it:
/** The larger end of a size that varies ([min, max]), or the size. */
export const most = (v) => (Array.isArray(v) ? v[1] : v);
/** The asset's largest side in metres. */
export const spanOf = (a) => Math.max(most(a.size.length), most(a.size.width ?? 0), most(a.size.height ?? 0));
/** What its size on screen is measured by, metres: its largest side, or, for a kind that says `measure: 'height'` (a
    tree: tall, and its crown's width little to its distance), its height. */
export const sizeOf = (a) => (kindRule(a, 'measure') === 'height' ? most(a.size.height) : spanOf(a));

// What a kind's `solid` rule makes of one thing (src/world/bodies.js says the shapes: in metres of its own frame, its
// foot at 0), from what is measured of it: its height and its footprint (length, width) and, where its kit measures
// them, its trunk ([u, w, r]: where it stands off its foot at a walker's chest and how thick it is there: a tree's,
// assets/kit/tree.js) and its round ({ r, top }: how far it reaches level and how high it stands: a rock's,
// assets/kit/rock.js). Every placer of every world makes its things' bodies here: assets/index.js (what stands at a
// place), the families of the zoo (what is scattered: assets/kit/plant.js, assets/kit/rock.js).
const TRUNK = 3;   // metres of a trunk that are solid: past a walker's head and the eye of a camera behind him
/** What of a thing covers the ground, shape by shape: pieces [ax, az, bx, bz, ra, rb, edge] in its own frame as it was
    built (metres, its foot at 0): a solid piece covers what lies within its width (ra … rb) of the line between its ends
    (a disk where they are one point), an outline (edge 1) what its edges close round. The one source of it is the built
    geometry's own ground cross-section (asset.feet: what its kit measured as it built the shape, assets/kit/tree.js
    builder: the wood that rises through the ground, a trunk's flare and all; what lies on it, a log's wood, a stone's
    outline): the thing itself. Only a kind with no built geometry (no kit measures its feet) falls back to its colliders
    where they stand on the ground (colliders(): its shapesOf, as the walker meets them), marked so: an approximation of
    it, never asked where the geometry is. (The walker's colliders could come from the same geometry: a follow-up.) */
export function footprintOf(asset, shape = 0, colliders = () => []) {
  return asset.feet?.[shape] ?? onGround(colliders());
}
/** The fallback: colliders' cross-sections on the ground (none of what is passed through, a shrub's leaves, or stands clear
    of the ground): a capsule's or a sphere's disk, a box's outline. */
const onGround = (shapes) => shapes.filter((S) => !S.pass).flatMap((S) => {
  const at = S.at ?? S.a, low = S.shape === 'capsule' ? Math.min(S.a[1], S.b[1]) - S.r : S.shape === 'sphere' ? S.at[1] - S.r : S.shape === 'box' ? S.at[1] - S.half[1] : Infinity;
  if (low > 0) return [];
  if (S.shape !== 'box') return [[at[0], at[2], at[0], at[2], S.r, S.r, 0]];
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [at[0] + i * S.half[0], at[2] + j * S.half[2]]);
  return c.map((p, k) => [p[0], p[1], c[(k + 1) % 4][0], c[(k + 1) % 4][1], 0, 0, 1]);
});
/** How far a footprint's pieces reach from the thing's foot (metres, as it was built). */
export const footprintReach = (P) => { let b = 0; for (const [ax, az, bx, bz, ra, rb] of P) b = Math.max(b, Math.hypot(ax, az) + ra, Math.hypot(bx, bz) + rb); return b; };
/** A thing's base: how far round its middle what of it covers the ground reaches (metres, as it was built): its
    footprint's reach (footprintOf: the built geometry, or its colliders where it has none). 0: nothing of it does. What a
    way keeps off its trodden width (src/world/ways.js). */
export const baseOf = (asset, shape = 0, colliders = () => []) => footprintReach(footprintOf(asset, shape, colliders));
/** The shapes `rule` makes of a thing of this height and footprint, with its measured trunk or round where it has one. */
export function shapesOf(rule, { height: h, length: L, width: W = L, trunk = null, round = null }) {
  if (!rule || !(h > 0)) return [];
  const half = Math.max(L, W) / 2;
  if (rule.trunk && trunk) { const [u, w, r] = trunk; return [{ shape: 'capsule', a: [u, 0, w], b: [u, Math.max(0, Math.min(h, TRUNK) - r), w], r }]; }
  if (rule.round && round) return [{ shape: 'capsule', a: [0, 0, 0], b: [0, Math.max(0, round.top - round.r), 0], r: round.r }];
  if (rule.leaves) { const o = rule.from ? { pass: true, from: rule.from } : { pass: true }; return h > 2 * half ? [{ shape: 'capsule', a: [0, half, 0], b: [0, h - half, 0], r: half, ...o }] : [{ shape: 'sphere', at: [0, h - half, 0], r: half, ...o }]; }   // (tall and narrow: a column; low and wide: a dome)
  if (rule.post) { const r = 2 * half * rule.post; return [{ shape: 'capsule', a: [0, 0, 0], b: [0, Math.max(0, h - r), 0], r }]; }
  if (rule.box) return [{ shape: 'box', at: [0, h / 2, 0], half: [L / 2, h / 2, W / 2] }];
  return [];
}
