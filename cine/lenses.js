// The virtual camera's lens kit. A lens is a focal length and a format; the format says how wide
// a piece of the world the lens sees and what shape the picture is.
//
// Spherical: a full-frame gate, 36 mm wide; the picture takes the window's own shape.
// Anamorphic: a 2x squeeze on a 4:3 Super 35 gate (17.82 mm high), framed 2.39 : 1. Unsqueezed,
// that frame is 2 x 21.3 = 42.6 mm wide: an anamorphic 50 sees as wide as a spherical 25 across,
// and as tall as a 50. Only the framing is modelled: no oval bokeh, flares or breathing yet.
export const SPHERICAL = { id: 'spherical', w: 36, aspect: 0 };
export const ANAMORPHIC = { id: 'anamorphic', w: 42.6, aspect: 2.39 };

const S = (mm) => [`S${mm}`, { mm, fmt: SPHERICAL, name: `${mm} mm` }];
const A = (mm, note) => [`A${mm}`, { mm, fmt: ANAMORPHIC, name: `${mm} mm anamorphic`, note }];
export const LENSES = Object.fromEntries([
  ...[12, 18, 24, 35, 50, 85, 135, 180].map(S),
  // The anamorphic set, 16 to 180 mm. 28 to 180 are the focal lengths of a classic set of 2x
  // anamorphic primes; 19 and 24 lie in the range of an ultra-wide anamorphic zoom; 16 is ours,
  // wider than that glass goes.
  A(16, 'wider than the real sets go'), A(19, 'ultra-wide zoom range'), A(24, 'ultra-wide zoom range'),
  ...[28, 35, 40, 50, 60, 75, 100, 135, 180].map((mm) => A(mm)),
]);
export const ANAMORPHIC_SET = Object.keys(LENSES).filter((k) => k[0] === 'A');
export const SPHERICAL_SET = Object.keys(LENSES).filter((k) => k[0] === 'S');
/** How wide the lens sees, in degrees. */
export const hfov = (lens) => (2 * Math.atan(lens.fmt.w / 2 / lens.mm) * 180) / Math.PI;
