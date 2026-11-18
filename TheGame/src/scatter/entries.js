// What the one placement rule places (src/scatter/rule.js), as plain numbers: every plant the trees' engine places,
// grown, and young where it grows, each entry the asset, its biome, how much of the ground it covers and how it takes
// the light and the water, its ages, and the shapes it stands with. Nothing here is measured or drawn: the page counts
// the far ends from it before anything is built (farLayers), and the rule lays its layers out of it.
import { recipe, recipes } from '../core/registry.js';
import { most } from '../../assets/kinds.js';

// ---- what the rule places: every plant the trees' engine places, grown, and young where it grows ----
const middle = (s) => (Array.isArray(s) ? (s[0] + s[1]) / 2 : s ?? 1);
const reachOf = (a) => (Math.max(most(a.size.length), most(a.size.width ?? 0)) / 2) * middle(a.placement.scale);
/** The things a list of the engine's rows places: { row, asset, biome, young, cover, light, under, reach, ages, shapes:
    [first, count] }. reach is measured when it is first read (a plant's size: its outline): what is placed, and of what,
    is known without it (farLayers). */
export function entriesOf(rows) {
  const out = [];
  for (const row of rows) {
    const a = row.asset, P = a.placement, biome = recipe(P.biome); if (!biome) continue;
    const S = a.growth?.stages, base = { row, asset: a, biome, light: P.light ?? [1, 1], under: [P.under ?? []].flat(), shore: P.shore ?? null, lakes: !!P.lakes };
    if (S && biome.age) {
      // grown: as old as its stand (its biome's `age`, a slow noise between its years); its crown at most a little under its oldest's
      out.push({ ...base, young: false, cover: P.cover ?? 0.3, get reach() { return reachOf(a) * 0.8; }, ages: biome.age, shapes: [0, a.shapeCount] });
      // young: from its first stage to its second year, where the light comes through to its kind's litter
      const top = a.growth.years[1], st = S.filter((s) => s.from < top), n = Math.max(...st.map((s) => s.offset + s.variants));
      if (P.young) out.push({ ...base, young: true, cover: P.young, light: P.youngLight ?? [0.05, 1], under: [a.uid], get reach() { return (reachOf(a) * a.growth.height(top)) / a.size.height; }, ages: [Math.max(2, S[0].from), top], shapes: [0, n] });
    } else out.push({ ...base, young: false, cover: P.cover ?? 0.3, get reach() { return reachOf(a); }, ages: null, shapes: [0, a.shapeCount ?? 1] });
  }
  return out;
}

/** Every asset the trees' engine places in the world (src/scatter/rule.js rowsOf: its rows). */
export const placed = () => recipes('asset').filter((a) => a.placement?.at === 'scatter' && a.placement.engine === 'trees');
/** How many far ends the stands bake (src/scatter/trees.js farOf: a layer of each of their atlases each): every shape of
    every thing the rule places that has a far end, once for each way it is placed (grown, young). What exists, from the
    registry, nothing measured: what the atlases' share is shared out by (src/detail/impostor.js atlases). */
export const farLayers = () => entriesOf(placed().map((asset) => ({ asset }))).reduce((n, e) => n + (e.asset.far ? e.shapes[1] : 0), 0);
