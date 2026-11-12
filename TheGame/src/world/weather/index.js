// The weather: every condition a plug-in, one file in this folder, found here by itself (no list kept by hand). A new
// condition (rain, fog, hail) is a new file; the panel, the store, the films and the stills take it as they find it.
//
//   export default {
//     id,                      the name it is kept, set and filmed by (a shot's `{ [id]: value | [from, to] }`: cine/README.md)
//     label, order,            its row on the weather panel, and where (smaller first)
//     range: [min, max, step], start,
//     read(v) -> text,         what the panel says ('' says nothing in the pill)
//     init?({ scene, renderer, camera }) -> state,   what it draws or keeps (a mesh of flakes)
//     apply(v, state),         the value made true: written to the shared uniforms (src/core/uniforms.js) every surface reads
//     update?(dt, v, state),   each frame (the clouds' drift)
//   }
import { weatherRow } from '../../ui/weather.js';
import { load, save } from '../../core/store.js';

const FOUND = import.meta.glob(['./*.js', '!./index.js'], { eager: true, import: 'default' });
export const CONDITIONS = Object.values(FOUND).filter((c) => c?.id).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

/** Every condition made: its value kept and on the panel. -> { ids, get(id), set(id, v), update(dt), [id]: { value, set(v) } } */
export function createWeather(world) {
  const host = { ids: CONDITIONS.map((c) => c.id) };
  for (const c of CONDITIONS) {
    const [min, max, step] = c.range, clamp = (v) => Math.min(max, Math.max(min, +v)), state = c.init?.(world) ?? {};
    let value = clamp(load(c.id, c.start ?? min));
    const set = (v) => { value = clamp(v); c.apply(value, state); };
    set(value);
    const row = weatherRow({ label: c.label, min, max, step, value, read: c.read, input: (v) => { set(v); save(c.id, value); } });
    host[c.id] = { get value() { return value; }, set(v) { set(v); row?.set(value); }, update: c.update && ((dt) => c.update(dt, value, state)) };
  }
  host.get = (id) => host[id]?.value;
  host.set = (id, v) => host[id]?.set(v);   // (a film's shot, a still: not kept)
  host.update = (dt) => { for (const id of host.ids) host[id].update?.(dt); };
  return host;
}
