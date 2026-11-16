// The skeleton's rig (intent 0033): where the bones turn, which carries which, for one man of reference, 1.80 m,
// standing in the neutral pose (arms down, palms to the thighs, every frame turned like the world's).
//
// Coordinates: metres, from the floor between the feet; x to the person's left, y up, z forwards. Points are written
// for the left side (x > 0); the right is their mirror.

export const PART = { skin: 0, nail: 7, lip: 8, mouth: 9, teeth: 10, eye: 11, tongue: 12, bone: 14, cartilage: 15, muscle: 16, tendon: 17, fat: 18 };

export const JOINTS = {
  root: [0, 0, 0], hips: [0, 0.97, -0.03], spine1: [0, 1.101, -0.034], spine2: [0, 1.236, -0.064], spine3: [0, 1.346, -0.079],
  neck1: [0, 1.507, -0.046], neck2: [0, 1.58, -0.026], head: [0, 1.628, -0.022], jaw: [0, 1.653, 0.003],
  'eye.L': [0.032, 1.677, 0.072], 'lidUp.L': [0.032, 1.677, 0.072], 'lidLo.L': [0.032, 1.677, 0.072],
  'clavicle.L': [0.022, 1.468, 0.018], 'upperArm.L': [0.18, 1.442, -0.026], 'foreArm.L': [0.202, 1.103, -0.045], 'hand.L': [0.226, 0.857, -0.012],
  'thigh.L': [0.088, 0.925, 0.0], 'shin.L': [0.084, 0.502, 0.006], 'foot.L': [0.077, 0.082, -0.016], 'toes.L': [0.094, 0.018, 0.122],
};
export const PARENT = { hips: 'root', spine1: 'hips', spine2: 'spine1', spine3: 'spine2', neck1: 'spine3', neck2: 'neck1', head: 'neck2', jaw: 'head' };
for (const s of ['L', 'R']) Object.assign(PARENT, {
  ['eye.' + s]: 'head', ['lidUp.' + s]: 'head', ['lidLo.' + s]: 'head', ['clavicle.' + s]: 'spine3', ['upperArm.' + s]: 'clavicle.' + s,
  ['upperArmTwist.' + s]: 'upperArm.' + s, ['foreArm.' + s]: 'upperArm.' + s, ['foreArmTwist.' + s]: 'foreArm.' + s, ['hand.' + s]: 'foreArm.' + s,
  ['thigh.' + s]: 'hips', ['thighTwist.' + s]: 'thigh.' + s, ['shin.' + s]: 'thigh.' + s, ['foot.' + s]: 'shin.' + s, ['toes.' + s]: 'foot.' + s,
});

// the hand's frame: a down the fingers, b across to the thumb (forwards), c out of its back (outwards), from the wrist
export const HAND = {
  knuckles: { index: [0.099, 0.03, 0.006], middle: [0.101, 0.009, 0.007], ring: [0.097, -0.012, 0.006], little: [0.089, -0.031, 0.004] },
  bases: { index: [0.036, 0.014, 0.005], middle: [0.036, 0.004, 0.006], ring: [0.035, -0.007, 0.005], little: [0.033, -0.017, 0.003] },
  lengths: { index: 0.072, middle: 0.08, ring: 0.076, little: 0.06 }, phalanges: [0.5, 0.3, 0.2],
  thumb: { root: [0.026, 0.021, -0.004], dirs: [[0.84, 0.46, -0.28], [0.95, 0.18, -0.26], [0.97, 0.06, -0.24]], lengths: [0.046, 0.032, 0.027] },
};
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];

/** The joints of a hand in the neutral pose (left hand at wrist w; sg mirrors): { name: [x, y, z] }, tips too. */
export function fingerJoints(w, sg) {
  const at = (a, b, c) => [w[0] + sg * c, w[1] - a, w[2] + b], out = {};
  for (const f of ['index', 'middle', 'ring', 'little']) {
    const [a, b, c] = HAND.knuckles[f], L = HAND.lengths[f];
    let d = 0; for (let j = 0; j < 3; j++) { out[`${f}${j + 1}`] = at(a + d, b, c - d * 0.04); d += L * HAND.phalanges[j]; }
    out[`${f}Tip`] = at(a + d, b, c - d * 0.04);
  }
  const T = HAND.thumb; let p = T.root;
  for (let j = 0; j < 3; j++) { out[`thumb${j + 1}`] = at(...p); const d = T.dirs[j], n = Math.hypot(...d); p = p.map((v, i) => v + (d[i] / n) * T.lengths[j]); }
  out.thumbTip = at(...p);
  return out;
}
