// Defaults by kind: what every asset of a kind gets unless its own file says otherwise. An asset writes only what
// differs (intent 0002). Today: where each level of detail ends, as the asset's size on screen in pixels.
//
//   px     for level i, the size on screen (its largest side, in CSS pixels, as the walker's 68° lens sees it; a
//          scattered plant's too: src/scatter/trees.js)
//          below which the next level takes over; below the last, nothing is drawn
//   impostor  { px, views }: after its meshes, one card baked from views x views directions, down to px pixels
//             (src/detail/impostor.js); false where a kind needs none (a rock is cheap already at its last level)
//   solid     what a walker and the camera cannot pass when the asset's own file has no `solid` (intent 0003), made
//             from what is measured of the thing itself (shapesOf, below; intent 0027): { trunk: true } its trunk, where a
//             walker meets it, as a cylinder up its foot (a tree; its kit measures it); { round: true } its round and
//             its height (a rock; its kit measures them); { leaves: true } its leaves, brushed through at their edge and
//             led round in their middle where they stand higher than the knee (no kind's now: a shrub is walked through,
//             as Samuel has it); where nothing is measured, { post: r } a round of r times its largest side, { box: true }
//             its footprint as a box; false: nothing (grass, a shrub)
//   casts     whether it casts a shadow (src/world/shadow.js): every level, card included, casts as drawn, so a new asset's
//             shadow is its own shape at the level the eye sees; an asset may say `casts: false` in its `detail` block
//   measure  what its size on screen is measured by: its largest side, or 'height' (src/detail/index.js: sizeOf)
//   fade   half the width of the hand-over between two levels, on a log scale (.15: from 14 % above to 14 % below);
//          how it is drawn, for every kind: src/detail/handover.js
//   sink   everything's way out (src/detail/handover.js): below `sink` times its last level's pixels it sinks into the ground,
//          gone at the last pixel, where its biome's canopy has coloured the land; nothing drops out of the picture
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
const KINDS = {
  default: { px: [200, 60, 20, 6], fade: 0.15, sink: 1.7, impostor: { px: 1.5, views: 8 }, solid: { box: true }, casts: true, snow: { clumps: 0.08 }, surface: { wrap: 0, through: 0 } },
  tree: { px: [260, 80, 34, 18, 7, 3], measure: 'height', fade: 0.1, sink: 1.7, impostor: false, solid: { trunk: true, post: 0.03 }, casts: true, snow: { clumps: 0.3 }, wind: { sway: 0.35 }, foliage: { wrap: 0.45, through: 0.55, flutter: 1 } },   // a 12 m pine: its finest to about 30 m, its farthest (the kit's: a crown as one body, then a speck of eight triangles) to over two kilometres; then its biome's canopy colours the land
  shrub: { px: [140, 16, 5], fade: 0.15, sink: 1.7, impostor: false, solid: false, casts: false, snow: { clumps: 0.2 }, wind: { sway: 0.15 }, foliage: { wrap: 0.4, through: 0.3, flutter: 0.6 } },   // its stand changes level as one (the biome's `shrubs.size`, 3.5 m): its fine sprigs to 15 m, its base sprigs, the same at any distance, to 140, its body sunk away by 420; walked through (Samuel, 2026-11-15: "Shrubs should be walkthrough"), its stands pack nothing solid; no shadow of its own
  grass: { impostor: false, solid: false, casts: false },   // blades: drawn in rings by the grass's engine (its own tiers), nothing a walker cannot pass
  rock: { impostor: false, solid: { round: true, post: 0.4 }, casts: true, snow: { clumps: 0.05 } },   // stone holds it evenly, a little drifted. Its levels are the ladder's (assets/kit/ladder.js: its assets say detail.ladder)
  shelter: { px: [170, 45, 15, 5], fade: 0.15, impostor: { px: 1.5, views: 8 }, casts: true, wind: { billow: 0.09, flap: 0.025 }, surface: { wrap: 0.35, through: 0.45 }, snow: { clumps: 0.22 } },   // canvas: snow slides off it in sheets, clumps hold   // canvas: soft, and thin enough to glow   // a tent of nine metres: its finest to 30 m, a card from a kilometre to three and a half
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
/** A rule of an asset's kind that is taken whole, not merged (px, fade, impostor, casts, solid): the kind's, else the
    default's. */
export const kindRule = (asset, field) => KINDS[asset?.kind]?.[field] ?? KINDS.default[field];

// What a kind's `solid` rule makes of one thing (src/world/bodies.js says the shapes: in metres of its own frame, its
// foot at 0), from what is measured of it: its height and its footprint (length, width) and, where its kit measures
// them, its trunk ([u, w, r]: where it stands off its foot at a walker's chest and how thick it is there: a tree's,
// assets/kit/tree.js) and its round ({ r, top }: how far it reaches level and how high it stands: a rock's,
// assets/kit/rock.js). Every placer of every world makes its things' bodies here: assets/index.js (what stands at a
// place), the families of the zoo (what is scattered: assets/kit/plant.js, assets/kit/rock.js).
const TRUNK = 3;   // metres of a trunk that are solid: past a walker's head and the eye of a camera behind him
/** The shapes `rule` makes of a thing of this height and footprint, with its measured trunk or round where it has one. */
export function shapesOf(rule, { height: h, length: L, width: W = L, trunk = null, round = null }) {
  if (!rule || !(h > 0)) return [];
  const half = Math.max(L, W) / 2;
  if (rule.trunk && trunk) { const [u, w, r] = trunk; return [{ shape: 'capsule', a: [u, 0, w], b: [u, Math.max(0, Math.min(h, TRUNK) - r), w], r }]; }
  if (rule.round && round) return [{ shape: 'capsule', a: [0, 0, 0], b: [0, Math.max(0, round.top - round.r), 0], r: round.r }];
  if (rule.leaves) return h > 2 * half ? [{ shape: 'capsule', a: [0, half, 0], b: [0, h - half, 0], r: half, pass: true }] : [{ shape: 'sphere', at: [0, h - half, 0], r: half, pass: true }];   // (tall and narrow: a column; low and wide: a dome)
  if (rule.post) { const r = 2 * half * rule.post; return [{ shape: 'capsule', a: [0, 0, 0], b: [0, Math.max(0, h - r), 0], r }]; }
  if (rule.box) return [{ shape: 'box', at: [0, h / 2, 0], half: [L / 2, h / 2, W / 2] }];
  return [];
}
