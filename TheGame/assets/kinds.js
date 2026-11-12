// Defaults by kind: what every asset of a kind gets unless its own file says otherwise. An asset writes only what
// differs (intent 0002). Today: where each level of detail ends, as the asset's size on screen in pixels.
//
//   px     for level i, the size on screen (its largest side, in CSS pixels, as the walker's 68° lens sees it)
//          below which the next level takes over; below the last, nothing is drawn
//   impostor  { px, views }: after its meshes, one card baked from views x views directions, down to px pixels
//             (src/detail/impostor.js); false where a kind needs none (a rock is cheap already at its last level)
//   solid     what a walker and the camera cannot pass when the asset's own file has no `solid` (intent 0003), as
//             shares of its size: { post: r } a round of r times its largest side; { box: true } its footprint as a box
//   casts     whether it casts a shadow (src/world/shadow.js): every level, card included, casts as drawn, so a new asset's
//             shadow is its own shape at the level the eye sees; an asset may say `casts: false` in its `detail` block
//   fade   half the width of the hand-over between two levels, on a log scale (.15: from 14 % above to 14 % below)
//   wind   how it moves in the wind (src/world/place.js): { billow, flap } in metres at a storm; it is held still at the
//          ground and along its middle (a pole, a trunk) and moves most halfway up and out; none where a kind does not move
//   snow   how it holds snow (src/world/light.js: snowLift): { clumps } metres by which the snow lies uneven on it (0: one
//          even layer); its own file may also say `roofed: r`, metres round its middle under its roof, where no snow falls
//   surface   how its faces take the light (src/world/place.js): { wrap (0..1, light wrapping round a soft thing), through
//             (0..1, light shining through a thin one when the sun is behind it) }
const KINDS = {
  default: { px: [200, 60, 20, 6], fade: 0.15, impostor: { px: 1.5, views: 8 }, solid: { box: true }, casts: true, snow: { clumps: 0.08 }, surface: { wrap: 0, through: 0 } },
  tree: { px: [260, 80, 34, 16], fade: 0.05, impostor: false, solid: { post: 0.03 }, casts: true, snow: { clumps: 0.3 }, wind: { sway: 0.35 } },   // a 12 m pine: its finest to about 70 m, the last to about a kilometre; then its biome's canopy colours the land
  rock: { px: [60, 15, 6, 3], fade: 0.15, impostor: false, solid: { post: 0.4 }, casts: true, snow: { clumps: 0.05 } },   // stone holds it evenly, a little drifted          // a rock of a metre leaves its finest level 10 m away
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
