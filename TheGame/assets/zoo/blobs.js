// A family of the zoo (index.js): eight thousand shapes nobody drew (assets/kit/blob.js), each a full mesh of 50 000 to
// 200 000 triangles, a texture and a look of its own. They stand. A test herd: stand-ins for the rocks, trunks and
// buildings to come.
// It names no colliders: each kind's coarse mesh is its collider, that mesh's box its box (index.js: bodyOf).
import { blobMesh, blobBand, blobLook, blobSkin, fullOf } from '../kit/blob.js';
import { rng } from '../../src/core/hash.js';

const COUNT = 8000;
// each kind's largest side, metres: most small, a few large
let SIZES = null;
const sizeOf = (i) => {
  if (!SIZES) { const rand = rng(0x9E3779B9); SIZES = Float32Array.from({ length: COUNT }, () => 0.42 + 1.2 * rand() ** 2); }
  return SIZES[i];
};
// (its bands: each kind's cluster hierarchy, assets/kit/diamonds.js; `print` says how they are made: another way,
// another word, and what the browser kept of the old is not read)
export default { id: 'blobs', count: COUNT, meshOf: blobMesh, bandOf: blobBand, print: () => 'bands: diamonds 1', skinOf: blobSkin, lookOf: (i) => ({ ...blobLook(i), size: sizeOf(i) }), fullTris: (i) => 12 * fullOf(i) ** 2 };
