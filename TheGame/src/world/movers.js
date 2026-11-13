// What moves in the world and may be followed (intent 0015). Every source of moving things (the stress stand's herds
// today; walkers and carts later) adds here how to find its mover nearest a point of the ground; the camera asks them
// all when something is clicked and follows the nearest (src/camera/rig.js: follow). No source keeps a list of its
// movers here: each answers from its own reckoning.
//
//   near(x, z, r) -> { d, name, at() -> { x, z, yaw } | null } | null
//     d: how far the mover is from (x, z) now; r: how far off a click may still mean it (metres, from the size of a
//     few pixels there); at(): where it is this frame and the way it faces, as the rig's yaw (null: it is gone)
const sources = [];
export function addMovers(near) { sources.push(near); }
/** The mover nearest (x, z) within r of every source, or null. */
export function nearestMover(x, z, r) {
  let best = null;
  for (const near of sources) { const m = near(x, z, r); if (m && (!best || m.d < best.d)) best = m; }
  return best;
}
