// The registry: every recipe of the world (a material, a biome, a made thing) by its stable uid, as one plug-in kind of
// thing. Each recipe is one file that holds all it needs (materials/, biomes/, assets/); the world asks the registry for
// them by uid and by type, never by a list kept by hand. registry.json (tools/registry.js) holds each one's version: the
// BLAKE3 hash of its source and of the versions of what it uses.
import manifest from '../../registry.json';

const files = import.meta.glob(['../../materials/*.js', '../../biomes/*.js', '../../assets/*.js', '!../../assets/index.js'], { eager: true, import: 'default' });
const BY = {};
for (const r of Object.values(files)) if (r?.uid) BY[r.uid] = r;
const order = Object.keys(manifest);   // by type, then name
const ranked = (a, b) => order.indexOf(a.uid) - order.indexOf(b.uid);

/** A recipe by its uid (or the recipe itself, handed back). */
export function recipe(ref) {
  const r = typeof ref === 'string' ? BY[ref] : ref;
  if (!r?.uid) throw new Error(`no recipe ${ref}`);
  return r;
}
/** Every recipe of a type ('material', 'biome', 'asset'), in the manifest's order. */
export const recipes = (type) => Object.values(BY).filter((r) => r.type === type).sort(ranked);
/** The recipe that plays a part the engine needs (a material's `role`: 'noise', 'billows'): the engine asks for the
    part, a recipe's own file says it plays it, so another file can take the part over. */
const ROLES = {};
export function byRole(role) {
  const r = (ROLES[role] ||= Object.values(BY).find((x) => x.role === role));
  if (!r) throw new Error(`no recipe plays '${role}'`);
  return r;
}
/** A recipe's version: the BLAKE3 hash of what it is (registry.json). */
export const versionOf = (ref) => manifest[recipe(ref).uid]?.version;
/** The recipe of a version, if it is the one here. */
export const byVersion = (hash) => Object.values(BY).find((r) => manifest[r.uid]?.version === hash) || null;
export { manifest };
