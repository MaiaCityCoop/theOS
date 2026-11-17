// The fat and the skin (intent 0036): the body's third and fourth layers, over the muscles (../muscles/table.js) and the
// bones. Everything here is numbers: how thick the fat and the skin over the muscles and the bones are, place by place;
// the gristle a skin is shaped over where there is no muscle (the nose, the ears) and the eyes; and where the skin
// opens or takes another colour (the eyes, the lips). ./build.js draws the skin out of them.
//
// Written for the left side of the man of reference (metres: x to his left, y up from the floor, z forwards); the
// right side is the mirror.
//
// How thick (TISSUE): a site is a point on the body's surface and the thickness there of everything over the muscles
// and the bones, fat and skin together (mm), felt round it over its reach (cm); between the sites the thickness goes
// smoothly from one to the next. On the trunk and the limbs it is half a skinfold (a fold is two layers of skin and fat),
// for a lean man who trains (about 12% fat): the skinfolds of the seven sites of Jackson & Pollock (1978) for such a
// man, as remembered, with the biceps' and the calf's of Durnin & Womersley (1974). On the face, where the muscles are
// thin, it is the soft tissue's depth over the bone, from forensic tables of facial tissue depth (Stephan & Simpson
// 2008, their "T-tables" for adults, as remembered). The pads of the heel, the sole and the palm, the buttock and the
// scalp: estimated from ultrasound studies of each, as remembered. Each site names its source.

export const SOURCES = {
  JP78: 'Jackson & Pollock, "Generalized equations for predicting body density of men", Br J Nutr 40 (1978) 497–504: the seven skinfold sites; skinfolds of a lean man of about 12% fat, as remembered',
  DW74: 'Durnin & Womersley, "Body fat assessed from total body density and its estimation from skinfold thickness", Br J Nutr 32 (1974) 77–97: the biceps\' site; as remembered',
  SS08: 'Stephan & Simpson, "Facial soft tissue depths in craniofacial identification (part I): an analytical review of the published adult data", J Forensic Sci 53 (2008) 1257–1272: mean depths over the bone, as remembered',
  us: 'estimated from ultrasound studies of the heel pad, the sole, the palm, the buttock and the scalp, as remembered',
  est: 'estimated: between the measured sites, as thin as the skin over a bone just under it is',
};

/** The skin itself (mm): epidermis and dermis, thicker on the back and the soles, thinnest on the eyelids. Part of each
 *  site's thickness, not more; the fat drawn alone (the third layer) is the skin's surface this much further in. */
export const SKIN = 1.8;

// [name, [x, y, z] on the body's surface, mm of fat and skin, reach in cm, source]
export const TISSUE = [
  // the trunk: Jackson & Pollock's seven sites (half the fold; a slightly muscular man's, about 14% fat)
  ['chest', [0.085, 1.36, 0.105], 5, 9, 'JP78'],
  ['midaxillary', [0.155, 1.3, 0.0], 6, 9, 'JP78'],
  ['triceps', [0.205, 1.28, -0.085], 4, 7, 'JP78'],
  ['subscapular', [0.1, 1.31, -0.14], 7, 9, 'JP78'],
  ['abdomen', [0.03, 1.06, 0.125], 10, 9, 'JP78'],
  ['suprailiac', [0.135, 1.1, 0.04], 7, 8, 'JP78'],
  ['thigh', [0.1, 0.72, 0.095], 6.5, 10, 'JP78'],
  ['biceps', [0.2, 1.28, 0.025], 2, 6, 'DW74'],
  ['calf', [0.045, 0.33, -0.035], 3, 8, 'DW74'],
  // between them and round them
  ['loins', [0.04, 1.08, -0.12], 8, 8, 'est'], ['flank', [0.145, 1.06, -0.035], 9, 7, 'est'],
  ['backThigh', [0.1, 0.72, -0.1], 6, 9, 'est'], ['innerThigh', [0.045, 0.75, 0.0], 6, 7, 'est'],
  ['shoulder', [0.12, 1.5, -0.05], 5, 7, 'est'], ['deltoid', [0.215, 1.38, -0.03], 4, 6, 'est'],
  ['nape', [0.0, 1.55, -0.1], 6, 6, 'est'], ['throat', [0.0, 1.52, 0.06], 4, 5, 'est'],
  ['upperBack', [0.05, 1.42, -0.15], 5, 8, 'est'],
  ['forearm', [0.22, 1.0, -0.03], 3, 8, 'est'], ['elbow', [0.19, 1.15, -0.09], 2.5, 3, 'est'],
  ['knee', [0.085, 0.5, 0.075], 3.5, 4, 'est'], ['shin', [0.07, 0.3, 0.035], 3, 7, 'est'],
  ['ankle', [0.07, 0.09, -0.01], 3, 4, 'est'], ['footTop', [0.1, 0.06, 0.07], 3, 4, 'est'],
  ['handBack', [0.245, 0.8, -0.01], 2.5, 4, 'est'], ['fingerBack', [0.24, 0.72, -0.02], 2, 3, 'est'],
  // the pads
  ['buttock', [0.09, 0.9, -0.14], 14, 9, 'us'], ['heel', [0.075, 0.004, -0.045], 14, 2, 'us'], ['heelBack', [0.075, 0.04, -0.085], 4, 2, 'est'],
  ['ball', [0.1, -0.002, 0.125], 10, 3.5, 'us'], ['arch', [0.075, 0.01, 0.04], 6, 3, 'us'],
  ['palm', [0.205, 0.805, -0.012], 7, 2.5, 'us'], ['fingerPads', [0.218, 0.72, -0.015], 4, 2.5, 'us'],
  ['thumbPad', [0.198, 0.81, 0.03], 6, 2, 'us'],
  ['scalp', [0.0, 1.79, -0.01], 6, 9, 'us'], ['occiput', [0.0, 1.7, -0.1], 7, 6, 'us'],
  // the face: tissue depth over the bone
  ['glabella', [0.0, 1.703, 0.104], 5.5, 1.6, 'SS08'], ['nasion', [0.0, 1.682, 0.102], 6.5, 1.4, 'SS08'],
  ['brow', [0.03, 1.708, 0.1], 6, 1.8, 'SS08'], ['forehead', [0.02, 1.75, 0.088], 4.5, 3, 'SS08'],
  ['lids', [0.032, 1.678, 0.088], 1.2, 1.4, 'SS08'], ['rhinion', [0.0, 1.668, 0.106], 2.5, 1, 'SS08'],
  ['cheekbone', [0.05, 1.672, 0.075], 7, 2, 'SS08'], ['cheek', [0.045, 1.632, 0.078], 9, 2.4, 'SS08'],
  ['philtrum', [0.0, 1.618, 0.11], 5, 1.5, 'SS08'], ['lowerLip', [0.0, 1.586, 0.106], 5, 1.4, 'SS08'],
  ['chin', [0.0, 1.567, 0.098], 11, 1.8, 'SS08'], ['jawAngle', [0.052, 1.597, -0.004], 6, 2.2, 'SS08'],
  ['ramus', [0.058, 1.625, 0.015], 5, 1.8, 'SS08'], ['temple', [0.068, 1.715, 0.02], 5, 2.5, 'SS08'],
  ['ear', [0.078, 1.665, -0.02], 1.5, 1.8, 'est'], ['noseTip', [0.0, 1.633, 0.126], 2, 1.2, 'est'],
  ['underChin', [0.0, 1.565, 0.05], 7, 2.5, 'est'],
];
/** Where no site reaches (mm). */
export const TISSUE_DEFAULT = 4;

// The gristle and the eyes the skin lies over, as solids of ../field.js written for the left side: the nose's (its
// bridge, its tip, its wings), the ear's (the shell of the auricle, its bowl carved out, its lobe), each eye a ball 24 mm
// across (the eye's mean diameter: Bekerman et al. 2014, "Variations in eyeball diameters of the healthy adults",
// J Ophthalmol, as remembered). `rig`: the bone that carries it.
export const UNDER = [
  { what: 'nose bridge', rig: 'head', solid: ['rod', [0.0, 1.668, 0.1], [0.0, 1.638, 0.12], 0.0042, 0.0058] },
  { what: 'nose tip', rig: 'head', solid: ['egg', [0.0, 1.634, 0.1215], [0.009, 0.008, 0.0085]] },
  { what: 'nose wing', rig: 'head', solid: ['egg', [0.0125, 1.629, 0.106], [0.0065, 0.006, 0.0085]] },
  { what: 'ear shell', rig: 'head', solid: ['egg', [0.077, 1.666, -0.022], [0.007, 0.03, 0.0175], [[0.94, 0, 0.34], [0, 1, 0]]] },
  { what: 'ear lobe', rig: 'head', solid: ['egg', [0.074, 1.633, -0.016], [0.006, 0.009, 0.008]] },
  { what: 'eye', rig: 'eye', solid: ['ball', [0.032, 1.677, 0.072], 0.012] },
];
// What is carved out of the skin after it is laid (left side): the eyes' openings (an almond as wide as the eye's
// opening, 30 mm), the nostrils, the bowl of the ear.
export const OPENINGS = [
  { what: 'eye opening', solid: ['egg', [0.032, 1.6775, 0.085], [0.0145, 0.0042, 0.012]] },
  { what: 'nostril', solid: ['egg', [0.0075, 1.6245, 0.113], [0.0034, 0.003, 0.0058]] },
  { what: 'ear bowl', solid: ['egg', [0.084, 1.66, -0.018], [0.0055, 0.0115, 0.0085]] },
];
// Where the skin takes another colour: the lips (their red), the areolae, the nails. [what, centre, radii (m)]
export const MARKS = [
  { what: 'lips', at: [0.0, 1.5985, 0.11], r: [0.026, 0.0115, 0.02] },
  { what: 'areola', at: [0.095, 1.312, 0.105], r: [0.013, 0.013, 0.03] },
];
/** The nipple: a small rise in the middle of the areola (left side; m). */
export const NIPPLE = { at: [0.095, 1.312, 0.0], r: 0.0045 };
// What fills the body inside, where nothing of the skeleton's or the muscles' is (the chest's and the belly's
// contents, the neck's, the limbs' between their muscles): never seen, but without it the skin over a thin wall of
// muscle has an inside as well as an outside. Left side or the middle; `part` the piece of the body it is in.
export const FILL = [
  { part: 'trunk', solid: ['egg', [0.0, 1.3, -0.035], [0.12, 0.16, 0.085]] },
  { part: 'trunk', solid: ['egg', [0.0, 1.08, 0.0], [0.12, 0.13, 0.085]] },
  { part: 'trunk', solid: ['egg', [0.0, 0.94, -0.02], [0.1, 0.07, 0.07]] },
  { part: 'trunk', solid: ['rod', [0.0, 1.46, -0.02], [0.0, 1.6, -0.012], 0.035, 0.03] },
  { part: 'arm', solid: ['rod', [0.18, 1.42, -0.04], [0.2, 1.16, -0.055], 0.028, 0.024] },
  { part: 'arm', solid: ['rod', [0.2, 1.12, -0.055], [0.224, 0.9, -0.028], 0.02, 0.013] },
  { part: 'leg', solid: ['rod', [0.088, 0.9, 0.0], [0.084, 0.55, -0.005], 0.045, 0.035] },
  { part: 'leg', solid: ['rod', [0.086, 0.45, -0.025], [0.08, 0.15, -0.03], 0.026, 0.015] },
];
/** The pieces of the body the skin is laid over one by one, so a hand's fingers, the arms and the trunk, the thighs do
 *  not grow into one another where they lie close: the trunk with the neck and the head, each arm with its hand, each
 *  finger, each leg with its foot. A muscle's ring is in the piece of the joint its place hangs on; where two pieces
 *  meet their skins cross, as a fold does (the armpit, the groin, between the fingers). */
export const partOf = (rig) => {   // (the head a piece of its own: its face is fine, and is not to be smoothed as the trunk is)
  const n = rig.replace(/\.[LR]$/, '');
  if (/^(thumb|index|middle|ring|little)\d$/.test(n)) return n.replace(/\d$/, '');
  if (/^(upperArm|foreArm|radius|hand)$/.test(n)) return 'arm';
  if (/^(thigh|shin|patella|foot|toe\d)$/.test(n)) return 'leg';
  if (/^(head|jaw|eye|lidUp|lidLo)$/.test(n)) return 'head';
  return 'trunk';
};

// The body's outline (PROFILES): the trunk and each limb a shape of sections, one every few centimetres along it, each
// as broad and as deep as a man of 1.80 m of a slightly muscular build measures there (about 14% of him fat): his
// chest 101 cm round, his waist 82, his buttocks 98, his thigh 57 at its top, his calf 38, his arm 32 relaxed, his
// forearm 28, his wrist 17, his neck 39; his chest 33 cm broad and 25 deep, his waist 29 and 21, his hips 35 and 24.
// (The US Army's survey of men, ANSUR II: Gordon et al. 2014, NATICK/TR-15/007, its men's circumferences, breadths and
// depths, as remembered, scaled from their 1.756 m to 1.80 m and taken from their mean build, about a quarter fat, to a
// trained man's; the sections' shapes after Richer's plates of the living model, Anatomie artistique, 1890, as
// remembered.) The skin lies on this outline; the muscles' and the bones' own relief is laid on it, as much of it as
// the fat there lets through (./build.js).
// Each: the piece, its axis from a to b (left side), the way its front faces, which of its ends fade into the next
// piece's (a hand, a foot, the head: their skin is their own) and which close round (the top of the arm over the
// shoulder, the bottom of the trunk between the thighs, the top of the thigh under the buttock: where they meet they
// run into one another softly), and its sections from a to b, evenly spaced: [forward shift of the middle, half-breadth outwards,
// half-breadth inwards, front, back, squareness (2 an ellipse, more a rounded box)] in cm.
export const PROFILE_SOURCE = 'Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel" (ANSUR II), NATICK/TR-15/007: men\'s circumferences, breadths and depths, as remembered, scaled to 1.80 m and to a slightly muscular build; the sections\' shapes after Richer, Anatomie artistique (1890), as remembered';
export const PROFILES = [
  { part: 'trunk', a: [0, 0.84, 0], b: [0, 1.6, 0], front: [0, 0, 1], fade: [0, 1], sections: [   // every 4 cm from 0.84 m up
    [-3.0, 9.0, 9.0, 6.0, 7.0, 2.0], [-2.5, 15.0, 15.0, 8.5, 8.0, 2.2], [-1.8, 17.6, 17.6, 10.0, 9.0, 2.35], [-1.5, 17.0, 17.0, 10.2, 10.0, 2.3],
    [-1.0, 15.8, 15.8, 10.4, 11.2, 2.2], [-0.5, 15.0, 15.0, 10.5, 10.4, 2.15], [0.0, 14.8, 14.8, 10.5, 10.2, 2.15], [0.0, 15.0, 15.0, 10.6, 10.3, 2.2],
    [-0.3, 15.4, 15.4, 10.9, 10.6, 2.25], [-0.8, 15.9, 15.9, 11.4, 11.2, 2.35], [-1.3, 16.3, 16.3, 12.0, 11.8, 2.5], [-1.8, 16.6, 16.6, 12.5, 12.3, 2.65],
    [-2.3, 16.8, 16.8, 12.6, 12.5, 2.8], [-2.8, 16.9, 16.9, 12.3, 12.4, 2.8], [-3.3, 17.2, 17.2, 11.5, 12.0, 2.6], [-3.8, 18.2, 18.2, 9.8, 10.8, 2.2],
    [-4.0, 13.8, 13.8, 7.5, 8.6, 2.1], [-3.5, 6.2, 6.2, 5.7, 6.4, 2.0], [-3.0, 5.7, 5.7, 5.3, 5.9, 2.0], [-2.5, 5.6, 5.6, 5.3, 5.7, 2.0]] },
  { part: 'arm', a: [0.184, 1.445, -0.04], b: [0.2, 1.13, -0.056], front: [0, 0, 1], fade: [0, 0], sections: [   // the upper arm, from over the shoulder to the elbow
    [0, 4.2, 3.0, 4.6, 4.6, 2.0], [0, 5.2, 4.2, 5.4, 5.4, 2.1], [0, 4.9, 4.5, 5.2, 5.1, 2.1], [0, 4.6, 4.5, 5.4, 5.0, 2.1], [0, 4.3, 4.1, 4.7, 4.7, 2.1], [0, 4.0, 3.7, 4.1, 4.4, 2.1]] },
  { part: 'arm', a: [0.2, 1.13, -0.056], b: [0.226, 0.875, -0.022], front: [0, 0, 1], fade: [0, 1], sections: [   // the forearm, from the elbow to the wrist
    [0, 4.3, 3.8, 4.2, 4.1, 2.1], [0, 4.6, 4.0, 4.6, 4.1, 2.1], [0, 4.0, 3.6, 4.1, 3.6, 2.1], [0, 3.3, 3.0, 3.6, 3.1, 2.15], [0, 2.4, 2.2, 3.0, 2.7, 2.2], [0, 1.9, 1.7, 2.7, 2.5, 2.3]] },
  { part: 'leg', a: [0.088, 0.9, 0.0], b: [0.085, 0.5, 0.006], front: [0, 0, 1], fade: [0, 0], sections: [   // the thigh, from the hip to the knee
    [0, 9.0, 8.0, 8.5, 9.5, 2.2], [0, 9.3, 8.6, 9.0, 9.6, 2.2], [0, 8.8, 8.3, 8.8, 8.8, 2.2], [0, 8.0, 7.6, 8.4, 7.8, 2.2], [0, 6.8, 6.6, 7.4, 6.4, 2.2], [0, 5.3, 5.5, 6.0, 5.3, 2.1]] },
  { part: 'leg', a: [0.085, 0.5, 0.006], b: [0.078, 0.1, -0.016], front: [0, 0, 1], fade: [0, 1], sections: [   // the leg, from the knee to the ankle
    [0, 5.3, 5.5, 5.8, 5.4, 2.1], [0, 5.3, 5.6, 4.6, 6.6, 2.1], [0, 5.1, 5.6, 4.2, 7.0, 2.1], [0, 4.3, 4.4, 3.6, 5.6, 2.1], [0, 3.4, 3.4, 3.0, 4.1, 2.1], [0, 3.0, 3.2, 2.8, 3.4, 2.1]] },
];
// Masses the outline holds besides its sections: each buttock (the gluteus maximus under its pad of fat, its fold at
// 0.80 m, the cleft between the two), a superellipsoid round its middle (left side; m): [out, in, up, down, front,
// back] its half-extents, n its squareness, k how softly it runs into the outline (m).
export const MASSES = [
  // the face's own (the skin over them; Farkas's norms of the adult man's face, as remembered: the mouth 5.2 cm wide,
  // the upper lip standing 11.6 cm forward of the head's middle, the lower 11.3, the chin 10.9; middle only, m)
  { part: 'head', what: 'mouth', at: [0, 1.6, 0.082], r: [0.033, 0.033, 0.02, 0.022, 0.024, 0.03], n: 2.0, k: 0.016 },   // (the teeth's arch under the lips)
  { part: 'head', what: 'upper lip', at: [0, 1.6045, 0.107], r: [0.025, 0.025, 0.0065, 0.0045, 0.0095, 0.01], n: 2.0, k: 0.004 },
  { part: 'head', what: 'lower lip', at: [0, 1.5925, 0.105], r: [0.023, 0.023, 0.0045, 0.0065, 0.0085, 0.01], n: 2.0, k: 0.004 },
  { part: 'head', what: 'chin', at: [0, 1.567, 0.097], r: [0.019, 0.019, 0.011, 0.012, 0.009, 0.012], n: 2.4, k: 0.012 },
  { part: 'trunk', what: 'buttock', at: [0.072, 0.885, -0.08], r: [0.085, 0.062, 0.11, 0.085, 0.05, 0.065], n: 2.5, k: 0.025 },
];
// The hand, drawn finer than the body (./build.js): its palm and the ball of its thumb as masses (left hand, standing,
// its palm to the thigh: +x its back, +z towards the thumb; m), each finger three tapering rods from its knuckle
// through its joints to its tip, as broad as a man's are (Greiner 1991, "Hand anthropometry of U.S. Army personnel",
// NATICK/TR-92/011, as remembered: the hand 8.8 cm broad at its knuckles, a finger 2 cm at its base, 1.6 at its tip),
// flattened a little front to back. FINGERS: [radius at the knuckle, at the first joint, at the second, at the tip;
// the last rod's length].
export const HAND_SOURCE = 'Greiner 1991, "Hand anthropometry of U.S. Army personnel", NATICK/TR-92/011, as remembered';
export const PALM = { at: [0.226, 0.826, -0.021], r: [0.0115, 0.0165, 0.048, 0.044, 0.042, 0.042], n: 2.6 };
export const THENAR = { at: [0.214, 0.816, 0.006], r: [0.01, 0.014, 0.022, 0.018, 0.014, 0.012], n: 2.0, k: 0.012 };
export const FINGERS = {
  thumb: [0.0112, 0.0105, 0.0098, 0.0088, 0.026], index: [0.0098, 0.0088, 0.0081, 0.0074, 0.022], middle: [0.0099, 0.009, 0.0083, 0.0076, 0.024],
  ring: [0.0094, 0.0085, 0.0079, 0.0072, 0.023], little: [0.0086, 0.0077, 0.0071, 0.0066, 0.02],
};
