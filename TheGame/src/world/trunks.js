// The trees' trunks as bodies: where the graphics card stood the trees round the camera (the shadow's stand-in packing,
// src/scatter/trees.js), read back to the CPU a moment after each packing; the walker is stopped by them (solids.js: step)
// as by the rocks. Without WebGPU (no packing to read) the trunks are not solid.
const lists = new Map();
let all = [];

/** The trunks of one asset (its uid), as rounds { x, z, r }: replaces what it had. */
export function setTrunks(uid, list) { lists.set(uid, list); all = [...lists.values()].flat(); }

/** The trunks within reach metres of (x, z). */
export function trunksNear(x, z, reach = 2) {
  const out = [];
  for (const t of all) if (Math.abs(t.x - x) < reach + t.r && Math.abs(t.z - z) < reach + t.r) out.push(t);
  return out;
}
