// The virtual camera's lens kit: the nine focal lengths of the ARRI/ZEISS Master Anamorphic
// primes, 28 to 180 mm, and nothing else. A 2x squeeze on a 4:3 Super 35 gate (17.82 mm high),
// framed 2.39 : 1: unsqueezed, that frame is 2 x 21.3 = 42.6 mm wide, so a lens sees as wide as a
// spherical lens of half its focal length and as tall as its own. Only the framing is modelled
// so far: no depth of field, oval bokeh, flares or breathing yet.
export const ANAMORPHIC = { id: 'anamorphic', w: 42.6, aspect: 2.39 };
export const FOCALS = [28, 35, 40, 50, 60, 75, 100, 135, 180];
export const LENSES = Object.fromEntries(FOCALS.map((mm) => [`A${mm}`, { mm, fmt: ANAMORPHIC, name: `Master Anamorphic ${mm} mm` }]));
/** How wide a focal length sees, in degrees. */
export const hfov = (mm) => (2 * Math.atan(ANAMORPHIC.w / 2 / mm) * 180) / Math.PI;
