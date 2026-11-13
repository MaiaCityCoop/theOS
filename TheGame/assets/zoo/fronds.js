// A family of the zoo (index.js): two thousand plants of leaf cards (assets/kit/frond.js): ferns, tufts, bushes of
// fronds, each of thousands of cards cut out as leaves, seen from both sides, swaying in the wind. They stand.
// Stand-ins for the foliage to come: what a real fern or a tree's crown asks of the engine.
import { frondMesh, frondLobes, frondTris } from '../kit/frond.js';
import { blobLook, blobSkin, hash3 } from '../kit/blob.js';

const SKIN = 20000;   // (their tints and textures are the blob kit's, from numbers of their own)
export default {
  id: 'fronds', count: 2000, meshOf: frondMesh, fullTris: frondTris, skinOf: (i, size) => blobSkin(SKIN + i, size),
  // (its core is solid, its leaves are passed through; its box: its coarse mesh's, as any kind's)
  collidersOf: () => [{ shape: 'capsule', a: [0, 0.04, 0], b: [0, 0.22, 0], r: 0.07 }, { shape: 'sphere', at: [0, 0.45, 0], r: 0.42, pass: true }],
  lookOf: (i) => ({ ...blobLook(SKIN + i), model: 'leafy', gloss: 0.2, sway: 0.04 + 0.1 * hash3(i, 2, 7, 555), leaf: frondLobes(i), size: 0.5 + 1.3 * hash3(i, 1, 7, 555) ** 2 }),
};
