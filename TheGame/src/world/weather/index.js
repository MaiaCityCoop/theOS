// The weather: every condition a plug-in, one file in this folder, found here by itself (no list kept by hand). A new
// condition (rain, fog, hail) is a new file; the panel, the store, the films, the stills, the light and the sky take it
// as they find it.
//
//   export default {
//     id,                      the name it is kept, set and filmed by (a shot's `{ [id]: value | [from, to] }`: cine/README.md)
//     label, order,            its row on the weather panel, and where (smaller first)
//     range: [min, max, step], start,
//     read(v) -> text,         what the panel says ('' says nothing in the pill)
//     init?({ scene, renderer, camera }) -> state,   what it draws or keeps (a mesh of flakes, a map)
//     apply?(v, state),        the value made true: written to the uniforms its own node code reads
//     update?(dt, v, state),   each frame (the clouds' drift)
//     before?(camera, groundY, v, state),   each frame before the picture is drawn (the clouds' shadow map)
//     lanes?(v) -> { wet, fog, dim },       what it adds to the shared lanes (lanes.js): the light takes it from there
//     surface?(n, lift) -> { keep, add },   node code: what it does to a surface facing n (its colour times keep, plus
//                              add: the snow lying on it); lift: how far the surface stands out of what lies here
//     sky?({ v, y, s, col, horizon }), skyOrder,   node code: what it draws into the sky's dome (src/world/sky.js)
//     packs?: true,            its value changes what stands on the land (the scatter packs again: the grass under snow)
//   }
//
// A condition whose surfaces need more of it than these (the snow's depth lifts the ground) exports that as nodes of its
// own beside its default; the light's contract (src/world/light.js) hands them on, so a material asks the contract.
import { weatherRow } from '../../ui/weather.js';
import { load, save } from '../../core/store.js';
import { writeLanes } from './lanes.js';

const FOUND = import.meta.glob(['./*.js', '!./index.js'], { eager: true });   // (whole modules: not every file here is a condition)
export const CONDITIONS = Object.values(FOUND).map((m) => m.default).filter((c) => c?.id).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

const values = Object.fromEntries(CONDITIONS.map((c) => [c.id, c.start ?? c.range[0]]));
/** What the conditions do to a surface, and draw into the sky: asked for when a material is built, not before. */
export const surfaceHooks = () => CONDITIONS.filter((c) => c.surface);
export const skyHooks = () => CONDITIONS.filter((c) => c.sky).map((c) => ({ id: c.id, order: c.skyOrder ?? 50, draw: c.sky }));
/** What of the conditions lies in the air between the eye and a point (a condition's `air({ eye, w, dist })` -> { a: how
    much it hides, 0..1; col: its own light }): the clouds, seen from above them. Read by the light's air (light.js: airOf). */
export const airHooks = () => CONDITIONS.filter((c) => c.air);
/** The values that change what stands on the land, as a key (the scatter packs again when it changes). */
export const weatherKey = () => CONDITIONS.filter((c) => c.packs).map((c) => values[c.id]).join(',');

/** Every condition made: its value kept and on the panel. -> { ids, get(id), set(id, v), update(dt), before(camera, y), [id]: { value, set(v) } } */
export function createWeather(world) {
  const host = { ids: CONDITIONS.map((c) => c.id) }, states = {};
  const lanes = () => { const sum = {}; for (const c of CONDITIONS) for (const [k, v] of Object.entries(c.lanes?.(values[c.id]) ?? {})) sum[k] = (sum[k] ?? 0) + v; writeLanes(sum); };
  for (const c of CONDITIONS) {
    const [min, max, step] = c.range, clamp = (v) => Math.min(max, Math.max(min, +v)), state = (states[c.id] = c.init?.(world) ?? {});
    const set = (v) => { values[c.id] = clamp(v); c.apply?.(values[c.id], state); lanes(); };
    set(load(c.id, values[c.id]));
    const row = weatherRow({ label: c.label, min, max, step, value: values[c.id], read: c.read, input: (v) => { set(v); save(c.id, values[c.id]); } });
    host[c.id] = { get value() { return values[c.id]; }, set(v) { set(v); row?.set(values[c.id]); } };
  }
  host.get = (id) => values[id];
  host.set = (id, v) => host[id]?.set(v);   // (a film's shot, a still: not kept)
  host.update = (dt) => { for (const c of CONDITIONS) c.update?.(dt, values[c.id], states[c.id]); };
  host.before = (camera, groundY) => { for (const c of CONDITIONS) c.before?.(camera, groundY, values[c.id], states[c.id]); };
  return host;
}
