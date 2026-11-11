// Defaults by kind: what every asset of a kind gets unless its own file says otherwise. An asset writes only what
// differs (intent 0002). Today: where each level of detail ends, as the asset's size on screen in pixels.
//
//   px     for level i, the size on screen (its largest side, in CSS pixels, as the walker's 68° lens sees it)
//          below which the next level takes over; below the last, nothing is drawn
//   impostor  { px, views }: after its meshes, one card baked from views x views directions, down to px pixels
//             (src/detail/impostor.js); false where a kind needs none (a rock is cheap already at its last level)
//   solid     what a walker and the camera cannot pass when the asset's own file has no `solid` (intent 0003), as
//             shares of its size: { post: r } a round of r times its largest side; { box: true } its footprint as a box
//   fade   half the width of the hand-over between two levels, on a log scale (.15: from 14 % above to 14 % below)
export default {
  default: { px: [200, 60, 20, 6], fade: 0.15, impostor: { px: 1.5, views: 8 }, solid: { box: true } },
  rock: { px: [60, 15, 6, 3], fade: 0.15, solid: { post: 0.4 } },          // a rock of a metre leaves its finest level 10 m away
  shelter: { px: [170, 45, 15, 5], fade: 0.15, impostor: { px: 1.5, views: 8 } },   // a tent of nine metres: its finest to 30 m, a card from a kilometre to three and a half
};
