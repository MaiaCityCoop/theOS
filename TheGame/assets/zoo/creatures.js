// A family of the zoo (index.js): a thousand kinds of thing that moves (assets/kit/creature.js): ten rigs (walkers,
// runners, four legs, ten legs, rovers, transports, cycles, dragons, birds, snakes), each in a hundred kinds. Each kind
// is ONE mesh on a skeleton of its own; each rig is a herd that roams at its own pace. Stand-ins for the people,
// animals, robots and vehicles to come.
import { creatureMesh, creatureBones, creatureColliders, creatureBounds, fullTris, RIGS, VARIANTS, STRIDE } from '../kit/creature.js';
import { blobLook, blobSkin } from '../kit/blob.js';

const SKIN = 10000;   // (their looks and textures are the blob kit's, from numbers of their own)
export default {
  id: 'creatures', count: RIGS.length * VARIANTS, meshOf: creatureMesh, bonesOf: creatureBones, fullTris,
  collidersOf: creatureColliders, boundsOf: creatureBounds,   // (a capsule a limb, moving with its bone)
  skinOf: (i, size) => blobSkin(SKIN + i, size), lookOf: (i) => ({ ...blobLook(SKIN + i), sway: 0, size: 1 }),
  roams: RIGS.map((R, r) => ({ name: R.name, share: R.share, speed: R.speed, size: R.size, ring: !!R.ring, fly: R.fly ?? [0, 0], stride: STRIDE, first: r * VARIANTS, count: VARIANTS })),
};
