// Places: the few things in the world that stand at one named spot, not scattered by a hash. Each names its
// asset in the library (assets/index.js), which builds it; here is only where it stands and which way it faces.
// The first ones are where the city begins: one tent on the meadow by the river, and the fire out in front of its door.
export const PLACES = {
  tent: { asset: '104dde1e-c26e-42fd-9aab-c6612fbe8222' /* the bell tent */, x: -1262.6, z: 631.0, yaw: 0.1, clear: 3.2 },   // clear: metres round it where no grass grows   // on the stretch the stories are told on; its door looks up the river
  fire: { asset: '23566c8c-0864-4278-a2f7-a3e072300223' /* the fire pit */, x: -1263.3, z: 624.4, yaw: 0.6, clear: 2.4 },   // 6.6 m out through the tent's door: well clear of its guy ropes, far enough that its smoke misses the canvas
  flame: { asset: 'dea9b8e4-28a7-4b88-b32e-ee498eb7a862' /* the fire burning on it */, x: -1263.3, z: 624.4, yaw: 0.6 },   // its own asset, on the same spot: only the fire moves in the wind, the stones and the seats stand still
};

/** The places that keep the ground round them clear, and how far (their `clear`, in metres): what the grass, the
    trees and the land's level pads all read (src/scatter/ground.js, src/scatter/trees.js, src/world/land.js). A
    place with no `clear` of its own clears nothing and stands in whatever is there — the flame over the fire stands
    in the fire's own clearing — so every reader must take the places from here and not from PLACES. */
export const CLEARINGS = Object.values(PLACES).filter((p) => p.clear);

// The library's stage: one fixed, flat spot in the meadow, far from the river, where the asset library shows every
// asset on a round of bare ground with the grass around it (library.html). Nothing stands there in the world itself.
export const STAGE = { x: -1161.4, z: -137.4, r: 7 };
