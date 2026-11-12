// Places: the few things in the world that stand at one named spot, not scattered by a hash. Each names its
// asset in the library (assets/index.js), which builds it; here is only where it stands and which way it faces.
// The first one is where the city begins: one tent on the meadow by the river.
export const PLACES = {
  tent: { asset: '104dde1e-c26e-42fd-9aab-c6612fbe8222' /* the bell tent */, x: -1262.6, z: 631.0, yaw: 0.1, clear: 3.2 },   // clear: metres round it where no grass grows   // on the stretch the stories are told on; its door looks up the river
};

// The library's stage: one fixed, flat spot in the meadow, far from the river, where the asset library shows every
// asset on a round of bare ground with the grass around it (library.html). Nothing stands there in the world itself.
export const STAGE = { x: -1161.4, z: -137.4, r: 7 };
