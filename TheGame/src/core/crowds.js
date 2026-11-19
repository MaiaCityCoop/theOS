// What the build measured of the plants' crowds (crowds.bin: tools/outlines.js, assets/kit/measures.js: each shape's
// turns' order, their errors and goes, where its crowd ends, its growth, its chunks and its cover), handed to the plant
// kit before the recipes' workers build any of a plant's levels (src/scatter/recipes.worker.js), so a start reckons none
// of a crowd's measure. Read by the workers only, each once, as the build wrote it: the page lays no plant's levels, and
// keeps none of it. A shape is taken by what it is (its recipe's uid and seed, its number) at its recipe's version and
// the atlases' numbers it is asked for: one changed since the build is measured as before.
import { manifest } from './registry.js';
import { takeMeasures } from '../../assets/kit/plant.js';
import { unpackMeasures, measureKey } from '../../assets/kit/measures.js';

// (where the build put it: the URL Vite gave the file it emitted, under the site's base and named by its content, as
// every asset is; none where the build made none: a tool's run, the dev server before it has measured. Never a path of
// its own: one written here was left as it was where the build had no file, and asked at the site's root)
const [AT = null] = Object.values(import.meta.glob('../../crowds.bin', { eager: true, query: '?url', import: 'default' }));
/** Done once what the build measured is handed to the kit, or none was, or what answered was not it: then every crowd
    is measured as before (2026-11-19: a dev server's index.html, answered for a crowds.bin it had not made yet, read
    as one, threw, and left the recipes' workers waiting for good: the start never settled). Never rejected. */
if (import.meta.env?.PROD && !AT) console.error("crowds: this build shipped no crowds.bin (tools/outlines.js): every plant's crowd is measured in the recipes' workers");
let missed = 0;   // (the shapes the build measured none of, for the atlases they are asked for: said, the first loudly)
export const crowdsReady = (AT ? fetch(AT) : Promise.resolve(null))
  .then((r) => (r?.ok && !/text\/html/i.test(r.headers.get('content-type') ?? '') ? r.arrayBuffer() : null))
  .then((b) => {
    const M = b && unpackMeasures(b);
    if (b && !M) console.warn("crowds: what answered for crowds.bin is not the build's measures; each crowd is measured as before");
    if (!M) return;
    takeMeasures((a, i, A) => {
      const v = manifest[a.uid]?.version, m = (v && M.get(measureKey(a, v, i, A))) || null;
      if (!m && !missed++) console.error(`crowds: the build's crowds.bin has no measure of '${a.name}' shape ${i} for the atlases ${A?.key ?? '(none)'} (a recipe changed since the build, or atlases no class of device has: src/detail/impostor.js ATLAS_SHARES): measured in this worker, and every such shape after it`);
      return m;
    });
  })
  .catch((e) => console.warn(`crowds: the build's measures could not be read (${e?.message ?? e}); each crowd is measured as before`));
