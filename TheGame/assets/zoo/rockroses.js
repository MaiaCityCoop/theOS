// A family of the zoo (index.js): the rockrose's shapes, as kinds of the heap. What the plant is, how it grows
// and where it stands is its asset's (assets/rockrose.js); how a plant is laid out for the heap, the kit's
// (assets/kit/plant.js). The engine that places plants draws them (src/scatter/trees.js).
import asset from '../rockrose.js';
import { plantFamily } from '../kit/plant.js';

export default plantFamily('rockroses', asset);
