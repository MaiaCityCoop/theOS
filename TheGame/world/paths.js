// The footpaths: where feet have worn the land bare. Each is a line through points (x, z, metres) that a curve runs
// smoothly through, and how wide it is trodden. They are laid into the land's pages as decals (src/terrain/decals.js:
// packed earth, cracked where it is driest, a lip of soil at the edge) and kept free as ways (src/world/ways.js): no
// grass grows on them, and no stone or tree stands on them.
export const PATHS = [
  // up the meadow to the fire, in front of the tent's door: the way people come
  { name: 'to the fire', width: 1.1, points: [[-1272.5, 556], [-1271, 574], [-1268.2, 590], [-1265.8, 603], [-1264.4, 613], [-1263.6, 619.6], [-1263.4, 622.4]] },
  // from the fire past the tent into the pine stand
  { name: 'into the pines', width: 0.9, points: [[-1265.6, 625.4], [-1272, 626.9], [-1284, 629.3], [-1300, 631.4], [-1318, 632.1], [-1336, 631.3], [-1354, 633.2], [-1372, 634.9], [-1389, 634.5], [-1408, 636.6]] },
];
