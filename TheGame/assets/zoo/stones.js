// A family of the zoo (index.js): the field stones' shapes, as kinds of the heap. What a stone is, how large and where
// it lies is its asset's (assets/stone.js); how a rock is shaped at every level, the kit's (assets/kit/rock.js). The
// engine that places rocks draws them (src/scatter/rocks.js).
import asset from '../stone.js';
import { rockFamily } from '../kit/rock.js';

export default rockFamily('stones', asset);
