// A family of the zoo (index.js): the boulders' shapes, as kinds of the heap. What a boulder is, how large and where it
// lies is its asset's (assets/boulder.js); how a rock is shaped at every level, the kit's (assets/kit/rock.js). The
// engine that places rocks draws them (src/scatter/rocks.js).
import asset from '../boulder.js';
import { rockFamily } from '../kit/rock.js';

export default rockFamily('boulders', asset);
