// Defaults by kind: what every asset of a kind gets unless its own file says otherwise. An asset writes only what
// differs (intent 0002). Today: where each level of detail ends, as the asset's size on screen in pixels.
//
//   px     for level i, the size on screen (its largest side, in CSS pixels, as the walker's 68° lens sees it)
//          below which the next level takes over; below the last, nothing is drawn
//   fade   half the width of the hand-over between two levels, on a log scale (.15: from 14 % above to 14 % below)
export default {
  default: { px: [200, 60, 20, 6], fade: 0.15 },
  rock: { px: [60, 15, 6, 3], fade: 0.15 },          // a rock of a metre leaves its finest level 10 m away
  shelter: { px: [170, 45, 15, 5], fade: 0.15 },     // a tent of nine metres: its finest to 30 m, nothing past a kilometre
};
