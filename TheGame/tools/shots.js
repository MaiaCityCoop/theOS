// Stills for looking at the world (in the lenses' or the game's console: `const S = await import('/game/tools/shots.js')`):
// S.view({ x, z, yaw, mm, up, pitch, hour }) holds the film camera there, `up` metres over the ground, looking `pitch`
// metres up per hundred ahead; S.around({ at, deg, r, mm, up, hour }) circles a point and looks at it; S.weather({ snow,
// clouds, wind, … any weather condition by its id }) sets the weather without keeping it. Wait a moment before a
// screenshot: the ground fills in.
const R = () => performance.getEntriesByType('resource').map((e) => e.name);
const land = () => import(R().filter((n) => n.includes('src/world/land.js')).at(-1));
export const TENT = [-1262.6, 631];

export async function view({ x = TENT[0], z = TENT[1] - 14, yaw = Math.atan2(-0.1, -1), mm = 28, up = 1.7, pitch = 12, hour = 11, dist = 100 } = {}) {
  const { heightAt } = await land(), d = [-Math.sin(yaw), -Math.cos(yaw)], y = heightAt(x, z) + up;
  window.__cine.take({ pos: [x, y, z], look: [x + d[0] * dist, y + (pitch * dist) / 100, z + d[1] * dist], mm, hour });
}
export async function around({ at = TENT, deg = 0, r = 11, mm = 35, up = 1.7, hour = 11, lookUp = 1.1 } = {}) {
  const { heightAt } = await land(), a = (deg * Math.PI) / 180, x = at[0] + Math.sin(a) * r, z = at[1] - Math.cos(a) * r;
  window.__cine.take({ pos: [x, heightAt(x, z) + up, z], look: [at[0], heightAt(at[0], at[1]) + lookUp, at[1]], mm, hour });
}
export function weather(values = {}) {
  const w = window.__s8.weather;
  for (const [id, v] of Object.entries(values)) if (v != null) w.set(id, v);
}
