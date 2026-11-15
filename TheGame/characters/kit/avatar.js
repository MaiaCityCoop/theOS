// A person's own avatar (intent 0024): the few numbers of the human kit (./human.js) a person chooses, and the
// character recipe made from them. Nothing here draws: me.html builds the person with the kit, the API keeps the numbers
// (API/src/avatar.js holds the same rules; API/test/api.test.js checks that the two agree).
//
//   { body, height, skin, hair, shirt, shoes }
//     body    the walker kind the body's proportions come from (its legs, build, head and lean), 0 … 999
//     height  metres, 1.55 … 1.95
//     skin    linear albedo, each channel 0 … 1
//     hair    the tint over the hair material, each channel 0 … 3 (the material is dark brown; above 1 lightens it)
//     shirt   the dye of the linen shirt, each channel 0 … 1 (1, 1, 1: undyed)
//     shoes   the leather of the shoes and the belt, linear, each channel 0 … 1

export const LIMITS = { body: [0, 999], height: [1.55, 1.95], skin: [0, 1], hair: [0, 3], shirt: [0, 1], shoes: [0, 1] };
const COLOURS = ['skin', 'hair', 'shirt', 'shoes'];
const round = (v) => Math.round(v * 1000) / 1000;

/** The avatar as it is kept, or null when it is not one: exactly these keys, each in its range. */
export function avatarOf(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (Object.keys(v).sort().join() !== Object.keys(LIMITS).sort().join()) return null;
  const inRange = (x, [lo, hi]) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  if (!Number.isInteger(v.body) || !inRange(v.body, LIMITS.body)) return null;
  if (!inRange(v.height, LIMITS.height)) return null;
  const out = { body: v.body, height: round(v.height) };
  for (const k of COLOURS) {
    const c = v[k];
    if (!Array.isArray(c) || c.length !== 3 || !c.every((x) => inRange(x, LIMITS[k]))) return null;
    out[k] = c.map(round);
  }
  return out;
}

// What can be chosen: the kit's own cloth and leather, in a few colours each (linear values, as the kit takes them).
export const CHOICES = {
  skin: [
    { name: 'Fair', v: [0.62, 0.45, 0.36] }, { name: 'Light', v: [0.56, 0.38, 0.29] }, { name: 'Sun-touched', v: [0.5, 0.33, 0.24] },
    { name: 'Olive', v: [0.41, 0.27, 0.16] }, { name: 'Brown', v: [0.31, 0.18, 0.11] }, { name: 'Deep brown', v: [0.2, 0.11, 0.07] },
    { name: 'Dark', v: [0.13, 0.075, 0.05] },
  ],
  hair: [
    { name: 'Black', v: [0.32, 0.3, 0.3] }, { name: 'Dark brown', v: [0.85, 0.82, 0.8] }, { name: 'Chestnut', v: [1.45, 1.1, 0.85] },
    { name: 'Auburn', v: [2.1, 1.05, 0.6] }, { name: 'Blond', v: [2.3, 1.8, 1.15] }, { name: 'Grey', v: [2.4, 2.4, 2.5] },
  ],
  shirt: [
    { name: 'Undyed', v: [1, 1, 1] }, { name: 'Sage', v: [0.62, 0.78, 0.6] }, { name: 'Clay', v: [0.86, 0.5, 0.36] },
    { name: 'Ochre', v: [0.92, 0.72, 0.32] }, { name: 'Madder', v: [0.72, 0.3, 0.28] }, { name: 'Woad', v: [0.38, 0.5, 0.74] },
    { name: 'Walnut', v: [0.42, 0.33, 0.26] },
  ],
  shoes: [
    { name: 'Dark leather', v: [0.16, 0.09, 0.055] }, { name: 'Tan leather', v: [0.42, 0.24, 0.12] }, { name: 'Black leather', v: [0.045, 0.04, 0.04] },
  ],
};
// The colour of the two materials a choice tints (materials/hair.js, materials/linenweave.js: their swatches), so a
// page can show what a tint looks like without loading the materials.
export const TINTED = { hair: [0.2, 0.14, 0.1], shirt: [0.74, 0.7, 0.62] };
export const HEIGHTS = { min: LIMITS.height[0], max: LIMITS.height[1], step: 0.01 };

/** Someone new: a body and colours drawn at random from the choices (rand: 0 … 1). */
export function randomAvatar(rand = Math.random) {
  const pick = (k) => CHOICES[k][Math.floor(rand() * CHOICES[k].length)].v;
  return { body: Math.floor(rand() * 1000), height: round(1.6 + rand() * 0.3), skin: pick('skin'), hair: pick('hair'), shirt: pick('shirt'), shoes: pick('shoes') };
}

/** The character recipe (characters/*.js, as ./human.js takes it) for an avatar, on a person's base (../settler.js:
 * the cloth materials, the moves). */
export function personOf(avatar, base, name = 'You') {
  const a = avatarOf(avatar);
  if (!a) throw new Error('not an avatar');
  const W = base.wears;
  return { ...base, name, about: 'A person of your own.', from: { rig: 'walker', kind: a.body }, height: a.height,
    wears: { shirt: { ...W.shirt, dye: a.shirt }, trousers: W.trousers, hair: { ...W.hair, tint: a.hair }, skin: a.skin, shoes: a.shoes } };
}
