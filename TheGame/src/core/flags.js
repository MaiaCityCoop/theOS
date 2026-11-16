// The game's address flags (`?stress`, `?ghost`, `?many=1000` …), read once, here. Each flag is said where it acts;
// this is only how they are read. (The film player, cine/, reads its own address: its scene, its menu.)
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
/** Whether the address names it (`?ghost`). */
export const flag = (name) => Q.has(name);
/** Its value as a number (`?many=1000`), or d where it is not given or not a number. */
export const flagNum = (name, d = 0) => { const v = Q.get(name); return v == null || v === '' || !Number.isFinite(+v) ? d : +v; };
/** Its value as it is written (`?in=os`), or null. */
export const flagText = (name) => Q.get(name);
