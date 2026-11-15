// A person's avatar: the few numbers the human kit (TheGame/characters/kit/human.js) is built from, nothing more. The
// game builds the person from them wherever they stand; this is only what is kept. The same rules are in the game
// (TheGame/characters/kit/avatar.js), and test/api.test.js checks that the two agree.
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
  const keys = Object.keys(v).sort().join(), want = Object.keys(LIMITS).sort().join();
  if (keys !== want) return null;
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
