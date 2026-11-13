// The clouds. Change a number here and the world's sky changes; the code (src/world/weather/clouds.js) holds none. A
// layer of cumulus over the land, each cloud a body with a foot and a top: it drifts with the wind, the sky shows it,
// and it casts its shadow on all below.
//
//   cover      how much of the sky it covers when the game opens: 0 clear … 1 overcast (the weather panel sets it)
//   height     how high the lowest clouds' feet float, metres over the valley
//   lift       how much higher the feet lie elsewhere, of that height (they change over tens of kilometres)
//   thick      how tall the tallest heaps stand over their feet, metres (a thin cloud is a flat shred, a dense one a tower)
//   steps      how many times the sky looks into them along a line of sight (more: smoother bodies, dearer)
//   size       how wide its largest clouds are, metres
//   drift      how fast it drifts, m/s, in a calm and in a storm (along the wind; the air up there moves when the grass
//              stands still: in a calm a cloud still crosses the sky in some minutes)
//   names      what the panel calls a cover, from that cover up
export default {
  cover: 0.35,
  height: 1600,
  lift: 0.25,
  thick: 750,
  steps: 10,
  size: 5200,
  drift: { calm: 16, storm: 52 },
  names: [[0, 'Clear'], [0.08, 'Few clouds'], [0.3, 'Scattered'], [0.55, 'Broken'], [0.82, 'Overcast']],
};
