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
  ['shoulder', [0.12, 1.5, -0.05], 5, 7, 'est'], ['acromion', [0.18, 1.49, -0.025], 9, 3, 'est'], ['deltoid', [0.215, 1.38, -0.03], 4, 6, 'est'],
  ['nape', [0.0, 1.55, -0.1], 6, 6, 'est'], ['throat', [0.0, 1.52, 0.06], 4, 5, 'est'],
  ['upperBack', [0.05, 1.42, -0.15], 5, 8, 'est'],
  ['forearm', [0.22, 1.0, -0.03], 3, 8, 'est'], ['elbow', [0.19, 1.15, -0.09], 2.5, 3, 'est'],
  ['knee', [0.085, 0.5, 0.075], 3.5, 4, 'est'], ['shin', [0.07, 0.3, 0.035], 3, 7, 'est'],
  // (the knee's fat pads: over the quadriceps' tendon above the kneecap, and either side of its ligament below it, where a
  // living knee is full, not the hollows between tendon and bone)
  ['suprapatellar', [0.085, 0.548, 0.06], 7, 2.2, 'est'], ['infrapatellarIn', [0.066, 0.468, 0.052], 9, 1.4, 'est'], ['infrapatellarOut', [0.104, 0.468, 0.05], 9, 1.4, 'est'],
  ['ankle', [0.07, 0.09, -0.01], 3, 4, 'est'], ['footTop', [0.1, 0.06, 0.07], 3, 4, 'est'],
  ['handBack', [0.245, 0.8, -0.01], 2.5, 4, 'est'], ['fingerBack', [0.24, 0.72, -0.02], 2, 3, 'est'],
  // the pads
  ['buttock', [0.09, 0.9, -0.14], 14, 9, 'us'], ['heel', [0.075, 0.004, -0.045], 14, 2, 'us'], ['heelBack', [0.075, 0.04, -0.085], 4, 2, 'est'],
  ['ball', [0.1, -0.002, 0.125], 10, 3.5, 'us'], ['arch', [0.075, 0.01, 0.04], 6, 3, 'us'],
  ['palm', [0.205, 0.805, -0.012], 7, 2.5, 'us'], ['fingerPads', [0.218, 0.72, -0.015], 4, 2.5, 'us'],
  ['thumbPad', [0.198, 0.81, 0.03], 6, 2, 'us'],
  ['scalp', [0.0, 1.79, -0.01], 6, 9, 'us'], ['occiput', [0.0, 1.7, -0.1], 7, 6, 'us'],
  // the face: tissue depth over the bone
  ['glabella', [0.0, 1.703, 0.104], 5.5, 1.6, 'SS08'], ['nasion', [0.0, 1.682, 0.102], 4.5, 1.2, 'SS08'],
  ['brow', [0.03, 1.708, 0.1], 5.5, 1.8, 'SS08'], ['forehead', [0.02, 1.75, 0.088], 4.5, 3, 'SS08'],
  ['lids', [0.032, 1.678, 0.088], 1.2, 1.4, 'SS08'], ['rhinion', [0.0, 1.668, 0.106], 2.5, 1, 'SS08'],
  ['cheekbone', [0.05, 1.672, 0.075], 7, 2, 'SS08'], ['cheek', [0.045, 1.638, 0.078], 6.5, 2.2, 'SS08'],
  // (the hollows round the eye's outer rim and beside the nostrils filled, as a living face's fat fills them)
  ['orbitRim', [0.058, 1.69, 0.07], 6, 1.4, 'est'], ['upperLipSide', [0.022, 1.622, 0.098], 7.5, 1.3, 'est'], ['infraorbital', [0.034, 1.656, 0.092], 6, 1.2, 'est'],
  ['philtrum', [0.0, 1.618, 0.11], 5, 1.5, 'SS08'], ['lowerLip', [0.0, 1.586, 0.106], 5, 1.4, 'SS08'],
  ['chin', [0.0, 1.567, 0.098], 11, 1.8, 'SS08'], ['jawAngle', [0.052, 1.597, -0.004], 4, 2.2, 'SS08'],
  ['ramus', [0.058, 1.625, 0.015], 5, 1.8, 'SS08'], ['temple', [0.068, 1.715, 0.02], 5, 2.5, 'SS08'],
  ['ear', [0.078, 1.665, -0.02], 1.5, 1.8, 'est'], ['noseTip', [0.0, 1.633, 0.126], 2, 1.2, 'est'],
  ['underChin', [0.0, 1.565, 0.05], 4, 2.5, 'est'],
];
/** Where no site reaches (mm). */
export const TISSUE_DEFAULT = 4;

// The gristle and the eyes the skin lies over, as solids of ../field.js written for the left side: the nose's (its
// bridge, its tip, its wings), the ear's (the shell of the auricle, its bowl carved out, its lobe), each eye a ball 24 mm
// across (the eye's mean diameter: Bekerman et al. 2014, "Variations in eyeball diameters of the healthy adults",
// J Ophthalmol, as remembered). `rig`: the bone that carries it.
export const UNDER = [
  { what: 'nose bridge', rig: 'head', solid: ['rod', [0.0, 1.668, 0.1], [0.0, 1.638, 0.12], 0.0042, 0.0058] },
  { what: 'nose tip', rig: 'head', solid: ['egg', [0.0, 1.6345, 0.12], [0.0075, 0.0072, 0.0085]] },
  { what: 'nose wing', rig: 'head', solid: ['egg', [0.0122, 1.6295, 0.1075], [0.0056, 0.0056, 0.0078]] },
  { what: 'ear shell', rig: 'head', solid: ['egg', [0.077, 1.666, -0.022], [0.007, 0.03, 0.0175], [[0.94, 0, 0.34], [0, 1, 0]]] },
  { what: 'ear lobe', rig: 'head', solid: ['egg', [0.074, 1.633, -0.016], [0.006, 0.009, 0.008]] },
  { what: 'eye', rig: 'eye', solid: ['ball', [0.032, 1.677, 0.072], 0.012] },
];
// What is carved out of the skin after it is laid (left side): the eyes' openings (an almond as wide as the eye's
// opening, 30 mm), the nostrils, the bowl of the ear.
export const OPENINGS = [
  { what: 'eye opening', solid: ['egg', [0.032, 1.6768, 0.085], [0.0142, 0.0035, 0.012]] },
  { what: 'nostril', solid: ['egg', [0.0072, 1.6255, 0.11], [0.0032, 0.0028, 0.0055]] },
  { what: 'ear bowl', solid: ['egg', [0.084, 1.66, -0.018], [0.0055, 0.0115, 0.0085]] },
  { what: 'gluteal cleft', solid: ['egg', [0.0, 0.872, -0.135], [0.006, 0.072, 0.07]] },   // (between the buttocks, from the coccyx down: the fascia's closing over the muscles fills it)
];
// Where the skin takes another colour: the lips (their red), the areolae, the nails. [what, centre, radii (m)]
export const MARKS = [
  { what: 'lips', at: [0.0, 1.598, 0.11], r: [0.0255, 0.0085, 0.02] },
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
// trained man's; then fitted to Richer's living model, Anatomie artistique, 1890, vol. 2, plates 74 to 76, front, back
// and side, drawn at the same scale beside ours: the trapezius's slope from the neck to the shoulder, the rounded upper
// back, the lumbar curve, the thighs apart from 0.65 m down, the calves' bulge and the slender ankles.) The skin lies on this outline; the muscles' and the bones' own relief is laid on it, as much of it as
// the fat there lets through (./build.js).
// Each: the piece, its axis from a to b (left side), the way its front faces, which of its ends fade into the next
// piece's (a hand, a foot, the head: their skin is their own) and which close round (the top of the arm over the
// shoulder, the bottom of the trunk between the thighs, the top of the thigh under the buttock: where they meet they
// run into one another softly), and its sections from a to b, evenly spaced: [forward shift of the middle, half-breadth outwards,
// half-breadth inwards, front, back, squareness (2 an ellipse, more a rounded box)] in cm; limb, the limb it is a piece of,
// and joins, which of its ends meet the limb's next piece (its pieces are one outline there, ./build.js).
// How much of the skin's shape the outline gives (0 … 1), the rest from the muscles under it in their fascia, the
// tissue's depth over them (./build.js). The outline was all of it; built from the muscles alone, fitted to an anatomical
// figure from the front, the back and the side, the trunk shows its own pectorals, belly and back, but the buttocks and
// the arms come out as boxes and ropes: the outline is how the fat rounds them, and half of it rounds them as a slightly
// muscular man's are.
export const OUTLINE = 0.5;
export const PROFILE_SOURCE = 'Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel" (ANSUR II), NATICK/TR-15/007: men\'s circumferences, breadths and depths, as remembered, scaled to 1.80 m and to a slightly muscular build; the outline fitted, front, back and side, to the living model of Richer, Anatomie artistique (1890), vol. 2, plates 74 to 76 ("Topographie morphologique"), drawn at the same scale beside it (public domain, Wikimedia Commons)';
export const PROFILES = [
  { part: 'trunk', a: [0, 0.84, 0], b: [0, 1.6, 0], front: [0, 0, 1], fade: [0, 1], sections: [   // every 4 cm from 0.84 m up
    [-3.0, 9.0, 9.0, 6.0, 7.0, 2.0], [-2.5, 14.6, 14.6, 8.5, 8.0, 2.2], [-1.8, 17.0, 17.0, 10.0, 9.0, 2.4], [-1.5, 16.2, 16.2, 10.2, 10.0, 2.3],
    [-1.0, 14.8, 14.8, 10.4, 11.2, 2.2], [-0.5, 13.9, 13.9, 10.5, 9.6, 2.1], [0.0, 13.7, 13.7, 10.5, 9.5, 2.1], [0.0, 14.2, 14.2, 10.6, 9.8, 2.2],
    [-0.3, 15.4, 15.4, 10.9, 10.6, 2.2], [-0.8, 16.3, 16.3, 11.4, 11.2, 2.4], [-1.3, 16.8, 16.8, 11.6, 11.8, 2.5], [-1.8, 16.9, 16.9, 11.6, 12.8, 2.6],
    [-2.3, 16.6, 16.6, 11.4, 13.6, 2.8], [-2.8, 16.8, 16.8, 11.2, 14.0, 2.8], [-3.3, 17.6, 17.6, 11.5, 13.6, 2.6], [-3.8, 19.6, 19.6, 9.8, 12.0, 2.3],
    [-4.0, 17.5, 17.5, 7.4, 9.6, 2.2], [-3.5, 10.5, 10.5, 6.0, 8.2, 2.0], [-3.0, 6.3, 6.3, 5.4, 6.4, 2.0], [-2.5, 5.6, 5.6, 5.0, 5.8, 2.0]] },
  { part: 'arm', name: 'upper arm', a: [0.186, 1.425, -0.042], b: [0.2, 1.13, -0.056], front: [0, 0, 1], fade: [0, 0], limb: 'arm', joins: [0, 1], sections: [
    [0.0, 5.6, 3.6, 5.2, 5.2, 2.1], [0.0, 5.9, 4.5, 5.8, 5.8, 2.1], [0.0, 5.2, 4.3, 5.0, 5.3, 2.1], [0.0, 4.4, 4.2, 5.1, 5.2, 2.1], [0.0, 4.3, 4.2, 5.4, 4.9, 2.1], [0.0, 4.2, 4.0, 5.2, 4.5, 2.1], [0.0, 4.0, 3.7, 4.6, 4.2, 2.1], [0.0, 3.8, 3.5, 4.0, 4.0, 2.1]] },
  { part: 'arm', name: 'forearm', a: [0.2, 1.13, -0.056], b: [0.228, 0.845, -0.02], front: [0, 0, 1], fade: [0, 0], limb: 'arm', joins: [1, 0], sections: [
    [0.0, 4.3, 3.8, 4.4, 4.4, 2.1], [0.0, 4.8, 4.4, 5.1, 4.6, 2.1], [0.0, 4.7, 4.4, 5.0, 4.4, 2.1], [0.0, 4.3, 4.0, 4.6, 4.0, 2.1], [0.0, 3.6, 3.3, 3.8, 3.4, 2.1], [0.0, 2.9, 2.6, 3.3, 3.0, 2.1], [0.0, 2.2, 2.0, 3.0, 2.8, 2.1], [0.0, 1.8, 1.7, 2.9, 2.7, 2.1], [0.0, 1.6, 1.4, 2.8, 2.6, 2.1]] },
  { part: 'leg', name: 'thigh', a: [0.088, 0.9, 0.0], b: [0.085, 0.5, 0.006], front: [0, 0, 1], fade: [0, 0], limb: 'leg', joins: [0, 1], sections: [   // the thigh, from the hip to the knee
    [0.0, 9.0, 8.0, 8.5, 9.5, 2.2], [0.0, 9.3, 8.2, 9.0, 9.6, 2.2], [0.0, 8.9, 7.3, 9.6, 8.8, 2.2], [0.0, 8.1, 6.6, 9.2, 7.8, 2.2], [0.0, 6.5, 5.4, 8.2, 6.4, 2.2], [0.0, 4.9, 5.0, 6.0, 5.3, 2.1]] },
  { part: 'leg', name: 'leg', a: [0.085, 0.5, 0.006], b: [0.077, 0.04, -0.02], front: [0, 0, 1], fade: [0, 0], limb: 'leg', joins: [1, 0], sections: [   // the leg, from the knee down through the ankle
    [0.0, 4.9, 5.0, 5.8, 5.4, 2.1], [0.0, 5.6, 6.6, 4.5, 7.8, 2.1], [0.0, 4.9, 6.0, 3.9, 7.5, 2.1], [0.0, 3.2, 3.4, 3.1, 4.3, 2.1], [0.0, 2.5, 2.6, 2.8, 3.1, 2.1], [0.0, 3.2, 3.4, 3.4, 3.8, 2.1]] },
  // the foot, from the back of the heel to the ball, its front the instep (up); its first half-breadth is the inner
  // side's, the second the outer's: 27 cm long, 10 across the ball, 6.5 across the heel, its instep 7 high (Hawes &
  // Sovak 1994, as remembered)
  { part: 'leg', a: [0.078, 0.03, -0.085], b: [0.09, 0.025, 0.135], front: [0, 1, 0], fade: [0, 0], k: 0.02, sections: [
    [0.0, 2.6, 2.6, 3.0, 3.0, 2.0], [0.0, 3.0, 3.2, 5.5, 3.0, 2.2], [0.0, 3.2, 3.3, 6.0, 2.7, 2.4], [0.0, 3.4, 3.6, 4.8, 2.3, 2.6], [0.0, 4.0, 4.3, 3.4, 2.2, 2.8], [0.0, 4.6, 4.7, 2.3, 2.3, 2.6]] },
];
// Masses the outline holds besides its sections: each buttock (the gluteus maximus under its pad of fat, its fold at
// 0.80 m, the cleft between the two), a superellipsoid round its middle (left side; m): [out, in, up, down, front,
// back] its half-extents, n its squareness, k how softly it runs into the outline (m), arch how far its sides curve
// back round the middle (the lips round the teeth: m back for each m² out), lean how far its upper half falls back (a
// pectoral thick at its lower edge, thinning up into the collarbone: m back for each m up).
export const MASSES = [
  // the face's own (the skin over them; Farkas's norms of the adult man's face, as remembered: the mouth 5.2 cm wide,
  // the upper lip standing 11.6 cm forward of the head's middle, the lower 11.3, the chin 10.9; middle only, m)
  { part: 'head', what: 'mouth', at: [0, 1.6, 0.08], r: [0.036, 0.036, 0.022, 0.024, 0.025, 0.03], n: 2.0, k: 0.014, arch: 12 },   // (the teeth's arch under the lips)
  { part: 'head', what: 'upper lip', at: [0, 1.6045, 0.1055], r: [0.026, 0.026, 0.0065, 0.0045, 0.0065, 0.01], n: 2.0, k: 0.005, arch: 22 },
  { part: 'head', what: 'lower lip', at: [0, 1.5925, 0.1025], r: [0.023, 0.023, 0.0045, 0.0065, 0.0065, 0.01], n: 2.0, k: 0.005, arch: 22 },
  { part: 'head', what: 'masseter', at: [0.042, 1.623, 0.026], r: [0.009, 0.02, 0.022, 0.026, 0.024, 0.02], n: 2.0, k: 0.015 },   // (and the cheek's fat over it)
  { part: 'head', what: 'chin', at: [0, 1.571, 0.09], r: [0.02, 0.02, 0.014, 0.013, 0.011, 0.014], n: 2.0, k: 0.03 },
  { part: 'trunk', what: 'jugular notch', at: [0, 1.475, 0.036], r: [0.012, 0.012, 0.008, 0.008, 0.009, 0.02], n: 2.0, k: 0.012 },   // (the hollow above the breastbone a soft one, the width of a thumb, not a pit)
  { part: 'trunk', what: 'pectoral', at: [0.078, 1.33, 0.078], r: [0.074, 0.064, 0.1, 0.038, 0.022, 0.03], n: 2.6, k: 0.025, lean: 0.3 },   // (a slightly muscular man's: its lower edge at the nipples, the sternum in the groove between the two)
  { part: 'trunk', what: 'buttock', at: [0.068, 0.885, -0.075], r: [0.075, 0.06, 0.11, 0.1, 0.05, 0.052], n: 2.1, k: 0.04 },
];
// The hand, drawn finer than the body (./build.js): its palm and the ball of its thumb as masses (left hand, standing,
// its palm to the thigh: +x its back, +z towards the thumb; m), each finger three tapering rods from its knuckle
// through its joints to its tip, as broad as a man's are (Greiner 1991, "Hand anthropometry of U.S. Army personnel",
// NATICK/TR-92/011, as remembered: the hand 8.8 cm broad at its knuckles, a finger 2 cm at its base, 1.6 at its tip),
// flattened a little front to back. FINGERS: [radius at the knuckle, at the first joint, at the second, at the tip;
// the last rod's length].
export const HAND_SOURCE = 'Greiner 1991, "Hand anthropometry of U.S. Army personnel", NATICK/TR-92/011, as remembered';
export const PALM = { at: [0.226, 0.822, -0.021], r: [0.0115, 0.0165, 0.052, 0.058, 0.043, 0.043], n: 3.0 };
// (the heel of the hand: the carpus, as deep and as broad as the wrist above it, the palm thinning from it towards the
// fingers; without it the wrist's bones stood as a ring over a thinner palm)
export const CARPUS = { at: [0.226, 0.862, -0.022], r: [0.016, 0.019, 0.018, 0.034, 0.03, 0.029], n: 2.0, k: 0.02 };
export const THENAR = { at: [0.214, 0.816, 0.006], r: [0.01, 0.014, 0.022, 0.018, 0.014, 0.012], n: 2.0, k: 0.012 };
export const FINGERS = {
  thumb: [0.0112, 0.0105, 0.0098, 0.0088, 0.026], index: [0.0098, 0.0088, 0.0081, 0.0074, 0.022], middle: [0.0099, 0.009, 0.0083, 0.0076, 0.024],
  ring: [0.0094, 0.0085, 0.0079, 0.0072, 0.023], little: [0.0086, 0.0077, 0.0071, 0.0066, 0.02],
};
/** The mouth's line: where the lips part, a slit as deep as their red, round the teeth's arch (m). */
export const MOUTH = { at: [0, 1.5985, 0.112], half: 0.0255, deep: 0.008, arch: 22, gap: 0.0011 };
// The foot's toes, drawn finer (./build.js), each a flattened tapering rod from its knuckle (its joint in the rig) to its
// tip, as broad as a man's are (the big toe 2.5 cm across, the little one 1.4; Hawes & Sovak 1994, "Quantitative
// morphology of the human foot in a North American population", Ergonomics 37: 1213-1226, as remembered): [radius at
// the knuckle, at the tip, the tip (left foot, m), how flat (height over breadth)].
export const FOOT_SOURCE = 'Hawes & Sovak 1994, "Quantitative morphology of the human foot in a North American population", Ergonomics 37: 1213-1226, as remembered';
export const TOES = {
  toe1: [0.0135, 0.0118, [0.077, 0.0125, 0.196], 0.72], toe2: [0.0085, 0.0074, [0.097, 0.009, 0.19], 0.75],
  toe3: [0.0082, 0.0071, [0.112, 0.0085, 0.179], 0.75], toe4: [0.0078, 0.0068, [0.125, 0.0082, 0.164], 0.75],
  toe5: [0.0072, 0.0064, [0.138, 0.008, 0.147], 0.75],
};
// The trunk's relief over its outline (./build.js): what a slightly muscular man's skin shows of what is under it, after
// Richer's living model (Anatomie artistique, 1890, vol. 2, plates 74 and 78, the trunk from the front), about two
// thirds as marked as his: the rectus's blocks either side of the white line between them, their tendinous lines the
// gaps between the blocks, the navel, the oblique's pad over the crest of the pelvis and the groin's line under it, the
// collarbones, the hollow over the breastbone, the groove between the deltoid and the pectoral. Left side (m): a block
// round `at`, half `r` across and high, `n` its squareness, `soft` how much of it is its soft edge; or a line from `a`
// to `b`, `w` half wide; `h` how far it stands out (mm; less than nothing, in).
export const RELIEF = [
  { what: 'rectus, upper', side: 'front', at: [0.046, 1.232], r: [0.039, 0.034], n: 3.5, soft: 0.6, h: 3.5 },
  { what: 'rectus, middle', side: 'front', at: [0.046, 1.163], r: [0.04, 0.034], n: 3.5, soft: 0.6, h: 4 },
  { what: 'rectus, lower', side: 'front', at: [0.045, 1.095], r: [0.039, 0.033], n: 3.5, soft: 0.6, h: 3.5 },
  { what: 'rectus, under the navel', side: 'front', at: [0.042, 0.995], r: [0.04, 0.065], n: 2.4, soft: 0.7, h: 3 },
  { what: 'navel', side: 'front', at: [0, 1.055], r: [0.0075, 0.009], soft: 0.7, h: -6 },
  { what: 'oblique', side: 'front', at: [0.118, 1.03], r: [0.042, 0.065], soft: 0.9, h: 7 },
  { what: 'groin', side: 'front', a: [0.115, 0.975], b: [0.03, 0.885], w: 0.012, h: -3 },
  { what: 'collarbone', side: 'front', a: [0.025, 1.488], b: [0.15, 1.5], w: 0.011, h: 2.5 },
  { what: 'hollow over the breastbone', side: 'front', at: [0, 1.478], r: [0.016, 0.012], soft: 0.8, h: -5 },
  { what: 'between deltoid and pectoral', side: 'front', a: [0.135, 1.475], b: [0.165, 1.37], w: 0.009, h: -2.5 },
  { what: 'under the pectoral', side: 'front', a: [0.03, 1.285], b: [0.14, 1.315], w: 0.01, h: -2 },
  // the back (plate 80): the long muscles of the back either side of the spine's furrow, the muscles over the shoulder
  // blade, the latissimus over the lower ribs, the dimples over the back of the pelvis
  { what: 'erector spinae', side: 'back', at: [0.034, 1.13], r: [0.03, 0.2], n: 2.2, soft: 0.85, h: 5 },
  { what: 'spine', side: 'back', a: [0, 1.43], b: [0, 0.97], w: 0.011, h: -2 },
  { what: 'infraspinatus', side: 'back', at: [0.088, 1.37], r: [0.05, 0.055], soft: 0.85, h: 4 },
  { what: 'teres major', side: 'back', at: [0.125, 1.29], r: [0.035, 0.03], soft: 0.85, h: 3 },
  { what: 'latissimus', side: 'back', at: [0.115, 1.19], r: [0.05, 0.09], soft: 0.95, h: 3 },
  { what: 'dimple over the pelvis', side: 'back', at: [0.036, 0.99], r: [0.011, 0.011], soft: 0.8, h: -4 },
];
// The limbs' relief over their outline, as the trunk's (RELIEF), after Richer's arm and leg (Anatomie artistique, vol. 2,
// plates 82 to 85 and 90 to 92), a little less marked than his model's: each round a place of a piece of a limb, `t` how far along
// it (0 at its top, 1 at its bottom), `ang` which way round it (0 its front, 90 its outer side, -90 its inner, 180 its
// back), half `dt` along and `da` round (degrees), `h` how far it stands out (mm; less than nothing, in).
export const LIMB_RELIEF = [
  { what: 'biceps', piece: 'upper arm', t: 0.62, ang: 5, dt: 0.27, da: 60, h: 9 },
  { what: 'deltoid\'s insertion', piece: 'upper arm', t: 0.4, ang: 85, dt: 0.07, da: 45, h: -4.5 },
  { what: 'deltoid', piece: 'upper arm', t: 0.12, ang: 60, dt: 0.22, da: 90, h: 5.4 },
  { what: 'triceps', piece: 'upper arm', t: 0.45, ang: 175, dt: 0.3, da: 65, h: 6.3 },
  { what: 'between biceps and triceps', piece: 'upper arm', t: 0.6, ang: -80, dt: 0.32, da: 22, h: -4.5 },
  { what: 'triceps\'s tendon', piece: 'upper arm', t: 0.85, ang: 180, dt: 0.12, da: 40, h: -2.7 },
  { what: 'brachioradialis', piece: 'forearm', t: 0.2, ang: 40, dt: 0.22, da: 55, h: 7.2 },
  { what: 'the forearm\'s flexors', piece: 'forearm', t: 0.22, ang: -50, dt: 0.26, da: 55, h: 5.4 },
  { what: 'the elbow\'s hollow', piece: 'forearm', t: 0.0, ang: -5, dt: 0.07, da: 35, h: -5.4 },
  { what: 'vastus lateralis', piece: 'thigh', t: 0.5, ang: 80, dt: 0.4, da: 55, h: 5.4 },
  { what: 'vastus medialis', piece: 'thigh', t: 0.85, ang: -50, dt: 0.15, da: 45, h: 9 },
  { what: 'rectus femoris', piece: 'thigh', t: 0.45, ang: 10, dt: 0.35, da: 35, h: 5.4 },
  { what: 'over the kneecap', piece: 'thigh', t: 0.97, ang: 15, dt: 0.06, da: 40, h: -2.7 },
  { what: 'gastrocnemius, inner head', piece: 'leg', t: 0.27, ang: -150, dt: 0.16, da: 45, h: 9 },
  { what: 'gastrocnemius, outer head', piece: 'leg', t: 0.24, ang: 150, dt: 0.13, da: 40, h: 7.2 },
  { what: 'tibialis anterior', piece: 'leg', t: 0.35, ang: 25, dt: 0.3, da: 30, h: 4.5 },
  { what: 'shin', piece: 'leg', t: 0.45, ang: -20, dt: 0.38, da: 18, h: -2.7 },
];
// The lower face set back (./build.js): measured against Richer's head in profile (vol. 2, plate 76), scaled to our
// face's height from the eyes to the chin, the chin stands 3 cm behind the tip of the nose and the lips 2.3; ours, from
// the jaw and the teeth under them, stood 1.4 and 1.5. The head's shape is drawn as though moved back by `chin` (m) at
// the chin and `lips` at the mouth, fading to nothing above the nostrils, round the jaw's sides and back towards its
// angle: a warp of the whole lower face, its lips, chin and slit with it, so nothing is cut.
// And the jaw's front curved round from the chin (`jaw`, m, set back from `jawIn` to `jawOut` from the middle, fading
// by `jawFade`, between the nostrils' height and the chin's): ours stood 9 cm forward 3.5 cm from the middle, a box
// where a jaw rounds back towards its angle.
export const LOWER_FACE = { chin: 0.011, lips: 0.006, top: 1.622, mouth: 1.598, chinAt: 1.566, half: 0.014, side: 0.055, back: 0.015, front: 0.055,
  jaw: 0.018, jawIn: 0.016, jawOut: 0.042, jawFade: 0.066, jawTop: 1.634, jawLow: 1.584 };
