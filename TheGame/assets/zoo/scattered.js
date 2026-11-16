// The families of what the world scatters (intent 0029): every asset an engine of the world scatters whose shapes are
// kinds of the heap, a family each, found by itself among the assets. A new species (a banana, a mango, an avocado) is
// its asset's file (assets/*.js, its `placement.engine` 'trees' for a plant, 'rocks' for a rock), and nothing here
// changes. A family's id is its file's name in the plural ('holmoak.js': 'holmoaks'): what the browser keeps its meshes
// under, and the order the zoo numbers the kinds in (index.js).
import { plantFamily } from '../kit/plant.js';
import { rockFamily } from '../kit/rock.js';

const FOUND = import.meta.glob(['../*.js', '!../index.js', '!../kinds.js'], { eager: true, import: 'default' });
const KIT = { trees: plantFamily, rocks: rockFamily };   // the kit that lays a species out for the heap, by the engine that scatters it

export default Object.entries(FOUND).flatMap(([path, a]) => {
  const make = a?.placement?.at === 'scatter' && KIT[a.placement.engine];
  if (!make) return [];
  const name = path.slice(path.lastIndexOf('/') + 1, -3);
  return [make(name.endsWith('s') ? name : `${name}s`, a)];
});
