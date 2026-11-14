// A family of the zoo (index.js): the stone pine's shapes (its ages and their variants), as kinds of the heap. What the plant is, how it grows
// and where it stands is its asset's (assets/stonepine.js); how a plant is laid out for the heap, the kit's
// (assets/kit/plant.js). The engine that places plants draws them (src/scatter/trees.js).
import asset from '../stonepine.js';
import { plantFamily } from '../kit/plant.js';

export default plantFamily('stonepines', asset);
