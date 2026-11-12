// The baked materials (src/materials/bake.js) for node code that reads a tile by itself, not as a ground: the clouds'
// field and the snow's clumps read the billows, the land its noise. Which material plays a part is said by the
// material's own file (its `role`), not by a path here: another file with that role takes the part over.
import { byRole } from '../core/registry.js';

let tex = null;
/** The baked arrays: set once at the start, before any material is built (src/main.js). */
export const useTiles = (t) => { tex = t; };
/** A read of the tile that plays `role`, at uv: a node, as any texture's (with .level(), .grad()). */
export const tile = (role, uv) => tex.a(byRole(role), uv);
