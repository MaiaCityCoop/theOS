// What moves in the world and may be followed (intent 0015). Every source of moving things (the stress stand's herds
// today; walkers and carts later) adds here how to find the first of its movers along a line of sight; the camera
// asks them all for the line through what is clicked (the pointer, or the crosshair in POV) and follows the nearest
// (src/camera/rig.js: follow). No source keeps a list of its movers here: each answers from its own reckoning.
//
//   hit(o, d, k) -> { d, name, at() -> { x, z, yaw } | null } | null
//     o, d: the line's start and its direction ([x, y, z], d of length 1); k: how far off the line a mover may be and
//     still be meant, in metres for each metre along it (a few pixels at that distance); d of the answer: how far
//     along the line the mover is; at(): where it is this frame and the way it faces, as the rig's yaw (null: gone)
const sources = [];
export function addMovers(hit) { sources.push(hit); }
/** The mover nearest along the line from o in direction d, of every source, or null. */
export function moverOnLine(o, d, k) {
  let best = null;
  for (const hit of sources) { const m = hit(o, d, k); if (m && (!best || m.d < best.d)) best = m; }
  return best;
}
/** How far a point (x, y, z) is along the line and off it: [along, off]. For the sources. */
export function offLine(o, d, x, y, z) {
  const px = x - o[0], py = y - o[1], pz = z - o[2], t = px * d[0] + py * d[1] + pz * d[2];
  return [t, Math.hypot(px - d[0] * t, py - d[1] * t, pz - d[2] * t)];
}
