// What the build measured of the plants' crowds (crowds.bin: tools/outlines.js, assets/kit/measures.js: each shape's
// turns' order, their errors and goes, where its crowd ends, its growth, its chunks and its cover), handed to the plant
// kit before the recipes' workers build any of a plant's levels (src/scatter/recipes.worker.js), so a start reckons none
// of a crowd's measure. Read by the workers only, each once, as the build wrote it: the page lays no plant's levels, and
// keeps none of it. A shape is taken by what it is (its recipe's uid and seed, its number) at its recipe's version and
// the atlases' numbers it is asked for: one changed since the build is measured as before.
import { manifest } from './registry.js';
import { takeMeasures } from '../../assets/kit/plant.js';
import { unpackMeasures } from '../../assets/kit/measures.js';

// (where the build put it: the URL Vite gave the file it emitted, under the site's base and named by its content, as
// every asset is; none where the build made none: a tool's run, the dev server before it has measured. Never a path of
// its own: one written here was left as it was where the build had no file, and asked at the site's root)
const [AT = null] = Object.values(import.meta.glob('../../crowds.bin', { eager: true, query: '?url', import: 'default' }));
/** Done once what the build measured is handed to the kit (or none was). */
export const crowdsReady = (AT ? fetch(AT) : Promise.resolve(null)).then((r) => (r?.ok ? r.arrayBuffer() : null)).then((b) => {
  if (!b) return;
  const M = unpackMeasures(b);
  takeMeasures((a, i, A) => { const v = manifest[a.uid]?.version; return (v && M.get(`${a.uid}:${a.placement?.seed ?? 1}@${v}#${i}|${A?.key ?? ''}`)) || null; });
}, () => {});
