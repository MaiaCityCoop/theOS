// A family of the zoo (index.js): eight thousand shapes nobody drew (assets/kit/blob.js), each a full mesh of 50 000 to
// 200 000 triangles, a texture and a look of its own. They stand. A test herd: stand-ins for the rocks, trunks and
// buildings to come.
// It names no colliders: each kind's coarse mesh is its collider, that mesh's box its box (index.js: bodyOf).
import { blobMesh, blobLook, blobSkin, fullOf } from '../kit/blob.js';

const COUNT = 8000;
// each kind's largest side, metres: most small, a few large
let SIZES = null;
const sizeOf = (i) => {
  if (!SIZES) { let seed = 0x9E3779B9; const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; SIZES = Float32Array.from({ length: COUNT }, () => 0.42 + 1.2 * rand() ** 2); }
  return SIZES[i];
};
export default { id: 'blobs', count: COUNT, meshOf: blobMesh, skinOf: blobSkin, lookOf: (i) => ({ ...blobLook(i), size: sizeOf(i) }), fullTris: (i) => 12 * fullOf(i) ** 2 };
