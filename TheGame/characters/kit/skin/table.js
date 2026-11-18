// The fat and the skin (intent 0036): the body's third and fourth layers, over the muscles (../muscles/table.js) and the
// bones. Everything here is numbers: how thick the fat and the skin over the muscles and the bones are, place by place;
// the gristle a skin is shaped over where there is no muscle (the nose) and the eyes; and where the skin
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
// bridge, its tip, its wings; the ears are forms of their own, ./ear.js), each eye a ball 24 mm
// across (the eye's mean diameter: Bekerman et al. 2014, "Variations in eyeball diameters of the healthy adults",
// J Ophthalmol, as remembered). `rig`: the bone that carries it.
export const UNDER = [
  { what: 'nose bridge', rig: 'head', solid: ['rod', [0.0, 1.668, 0.0975], [0.0, 1.6425, 0.1135], 0.0042, 0.0052] },
  { what: 'nose tip', rig: 'head', solid: ['egg', [0.0, 1.6405, 0.1158], [0.0062, 0.0055, 0.0068]] },
  { what: 'nose wing', rig: 'head', solid: ['egg', [0.0112, 1.6395, 0.1035], [0.0034, 0.0035, 0.0062]] },
  { what: 'eye', rig: 'eye', solid: ['ball', [0.032, 1.677, 0.072], 0.012] },
];
// What is carved out of the skin after it is laid (left side): the nostrils, the cleft between the buttocks. (The eyes' openings are not carved: the skin runs over the globe as closed lids do, and the opening is
// cut out of it as it is drawn, along EYE's almond below: a lid's edge is finer than any point of the skin.)
export const OPENINGS = [
  { what: 'nostril', solid: ['egg', [0.0078, 1.6335, 0.1085], [0.0036, 0.0038, 0.0066]] },
  { what: 'gluteal cleft', solid: ['egg', [0.0, 0.872, -0.135], [0.006, 0.072, 0.07]] },   // (between the buttocks, from the coccyx down: the fascia's closing over the muscles fills it)
];
// Where the skin takes another colour: the areolae (the lips' red is drawn by LIPS below, the nails found on the fingers' ends). [what, centre, radii (m)]
export const MARKS = [
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
export const PARTS = ['trunk', 'arm', 'leg', 'thumb', 'index', 'middle', 'ring', 'little', 'head'];   // (a piece's number is its place here)
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
// the arms come out as boxes and ropes: the outline is how the fat rounds them. At a half of it the skin still showed the
// strands' ropes and gaps as bumps a few centimetres across (intent 0041: seen under a raking light, glossy); at four
// fifths it lies smooth, as skin over fat does, and what a slightly muscular man shows is the relief's to draw (RELIEF).
export const OUTLINE = 0.8;
export const PROFILE_SOURCE = 'Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel" (ANSUR II), NATICK/TR-15/007: men\'s circumferences, breadths and depths, as remembered, scaled to 1.80 m and to a slightly muscular build; the outline fitted, front, back and side, to the living model of Richer, Anatomie artistique (1890), vol. 2, plates 74 to 76 ("Topographie morphologique"), drawn at the same scale beside it (public domain, Wikimedia Commons)';
export const PROFILES = [
  { part: 'trunk', a: [0, 0.84, 0], b: [0, 1.68, 0], front: [0, 0, 1], fade: [0, 0], sections: [   // every 4 cm from 0.84 m up; the neck a column up into the head (HEAD below), closed inside it
    [-3.0, 9.0, 9.0, 6.0, 7.0, 2.0], [-2.5, 14.6, 14.6, 8.5, 8.0, 2.2], [-1.8, 17.0, 17.0, 10.0, 9.0, 2.4], [-1.5, 16.2, 16.2, 10.2, 10.0, 2.3],
    [-1.0, 14.8, 14.8, 10.4, 11.2, 2.2], [-0.5, 13.9, 13.9, 10.5, 9.6, 2.1], [0.0, 13.7, 13.7, 10.5, 9.5, 2.1], [0.0, 14.2, 14.2, 10.6, 9.8, 2.2],
    [-0.3, 15.4, 15.4, 10.9, 10.6, 2.2], [-0.8, 16.3, 16.3, 11.4, 11.2, 2.4], [-1.3, 16.8, 16.8, 11.6, 11.8, 2.5], [-1.8, 16.9, 16.9, 11.6, 12.8, 2.6],
    [-2.3, 16.6, 16.6, 11.4, 13.6, 2.8], [-2.8, 16.8, 16.8, 11.2, 14.0, 2.8], [-3.3, 17.6, 17.6, 11.5, 13.6, 2.6], [-3.8, 19.6, 19.6, 9.8, 12.0, 2.3],
    [-4.0, 17.5, 17.5, 7.4, 9.2, 2.2], [-3.4, 10.8, 10.8, 5.8, 7.0, 2.0], [-2.7, 6.2, 6.2, 5.5, 6.0, 2.0], [-2.3, 5.9, 5.9, 5.5, 5.9, 2.0], [-2.6, 5.8, 5.8, 4.5, 5.6, 2.0], [-2.8, 5.0, 5.0, 4.0, 5.0, 2.0]] },   // (the neck 39 cm round under the jaw: it measured 50, its nape as far back as the skull's)
  { part: 'arm', name: 'upper arm', a: [0.186, 1.425, -0.042], b: [0.2, 1.13, -0.056], front: [0, 0, 1], fade: [0, 0], limb: 'arm', joins: [0, 1], sections: [
    [0.0, 5.9, 3.6, 5.4, 5.3, 2.1], [0.0, 6.2, 4.5, 5.9, 5.8, 2.1], [0.0, 5.4, 4.3, 5.1, 5.3, 2.1], [0.0, 4.4, 4.2, 5.1, 5.2, 2.1], [0.0, 4.3, 4.2, 5.4, 4.9, 2.1], [0.0, 4.2, 4.0, 5.2, 4.5, 2.1], [0.0, 4.0, 3.7, 4.6, 4.2, 2.1], [0.0, 3.8, 3.5, 4.0, 4.0, 2.1]] },
  { part: 'arm', name: 'forearm', a: [0.2, 1.13, -0.056], b: [0.228, 0.845, -0.02], front: [0, 0, 1], fade: [0, 0], limb: 'arm', joins: [1, 0], sections: [
    [0.0, 4.2, 3.7, 4.3, 4.3, 2.1], [0.0, 4.4, 4.0, 4.6, 4.2, 2.1], [0.0, 4.2, 3.9, 4.5, 4.0, 2.1], [0.0, 3.9, 3.6, 4.2, 3.7, 2.1], [0.0, 3.4, 3.1, 3.6, 3.2, 2.1], [0.0, 2.8, 2.5, 3.2, 2.9, 2.1], [0.0, 2.2, 2.0, 2.9, 2.7, 2.1], [0.0, 1.8, 1.7, 2.8, 2.6, 2.1], [0.0, 1.6, 1.4, 2.7, 2.5, 2.1]] },
  { part: 'leg', name: 'thigh', a: [0.088, 0.9, 0.0], b: [0.085, 0.5, 0.006], front: [0, 0, 1], fade: [0, 0], limb: 'leg', joins: [0, 1], sections: [   // the thigh, from the hip to the knee
    [0.0, 9.0, 8.0, 8.5, 9.5, 2.2], [0.0, 9.3, 8.2, 9.0, 9.6, 2.2], [0.0, 8.9, 7.3, 9.6, 8.8, 2.2], [0.0, 8.1, 6.6, 9.2, 7.8, 2.2], [0.0, 6.5, 5.4, 8.2, 6.4, 2.2], [0.0, 4.9, 5.0, 6.0, 5.3, 2.1]] },
  { part: 'leg', name: 'leg', a: [0.085, 0.5, 0.006], b: [0.077, 0.04, -0.02], front: [0, 0, 1], fade: [0, 0], limb: 'leg', joins: [1, 0], sections: [   // the leg, from the knee down through the ankle
    [0.0, 4.9, 5.0, 5.8, 5.4, 2.1], [0.0, 5.6, 6.6, 4.5, 7.8, 2.1], [0.0, 4.9, 6.0, 3.9, 7.5, 2.1], [0.0, 3.3, 3.5, 3.2, 4.4, 2.1], [0.0, 2.8, 2.9, 3.0, 3.4, 2.1], [0.0, 3.3, 3.5, 3.5, 3.9, 2.1]] },
  // the foot, from the back of the heel to the ball, its front the instep (up); its first half-breadth is the outer
  // side's, the second the inner's, as every piece's: 27 cm long, 10 across the ball, 6.5 across the heel, its instep 7 high (Hawes &
  // Sovak 1994, as remembered)
  { part: 'leg', a: [0.078, 0.03, -0.085], b: [0.09, 0.025, 0.135], front: [0, 1, 0], fade: [0, 0], k: 0.02, sections: [
    [0.0, 2.6, 2.6, 3.0, 3.0, 2.0], [0.0, 3.2, 3.0, 5.5, 3.0, 2.2], [0.0, 3.3, 3.2, 6.0, 2.7, 2.4], [0.0, 3.6, 3.4, 4.8, 2.3, 2.6], [0.0, 4.3, 4.0, 3.4, 2.2, 2.8], [0.0, 4.7, 4.6, 2.3, 2.3, 2.6]] },
];
// Masses the outline holds besides its sections: each buttock (the gluteus maximus under its pad of fat, its fold at
// 0.80 m, the cleft between the two), a superellipsoid round its middle (left side; m): [out, in, up, down, front,
// back] its half-extents, n its squareness, k how softly it runs into the outline (m), arch how far its sides curve
// back round the middle (m back for each m² out), lean how far its upper half falls back (a
// pectoral thick at its lower edge, thinning up into the collarbone: m back for each m up).
export const MASSES = [
  { part: 'trunk', what: 'jugular notch', at: [0, 1.475, 0.036], r: [0.012, 0.012, 0.008, 0.008, 0.009, 0.02], n: 2.0, k: 0.012 },   // (the hollow above the breastbone a soft one, the width of a thumb, not a pit)
  { part: 'trunk', what: 'pectoral', at: [0.078, 1.33, 0.078], r: [0.074, 0.064, 0.1, 0.038, 0.022, 0.03], n: 2.6, k: 0.025, lean: 0.3 },   // (a slightly muscular man's: its lower edge at the nipples, the sternum in the groove between the two)
  { part: 'trunk', what: 'buttock', at: [0.068, 0.885, -0.075], r: [0.075, 0.06, 0.11, 0.1, 0.05, 0.04], n: 2.1, k: 0.04 },
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

// The skin's tone place by place (./build.js lays it on the skin's points; ../muscles/flesh.js colours by it). Each a
// place of the left side (m), how far it reaches (m) and how much. `blood`: where it lies nearer the surface and the
// skin is redder (the cheeks, the nose, the ears, the chin, the knuckles and the fingers' ends, the elbows, the knees, the
// heels and the balls of the feet, the palms), or further and it is paler (-). `pigment`: where the skin is browner
// for the sun it has had (the face, the neck, the forearms, the backs of the hands) or paler for the little it has
// (the loins, the inside of the upper arm, the palms and the soles, which hold almost none). `oil`: where it is
// glossier (the forehead, the nose, the chin; a little the chest and the shoulders). `veins`: where they show through
// (the inside of the forearm, the back of the hand, the top of the foot). `stubble`: where hair cut to the skin shadows it.
// As a painter of bodies lays them, from
// practice, not from a measured map: none was found (reports/Photoreal human body architecture.md, "skin colour").
export const TONE = {
  blood: [
    ['cheek', [0.045, 1.64, 0.085], 0.035, 0.66], ['nose', [0, 1.634, 0.12], 0.022, 0.72], ['ear', [0.077, 1.665, -0.02], 0.03, 0.6], ['chin', [0, 1.585, 0.1], 0.025, 0.25],
    ['knuckles', [0.238, 0.775, -0.02], 0.035, 0.4], ['finger ends', [0.23, 0.69, -0.02], 0.035, 0.45], ['palm', [0.207, 0.82, -0.02], 0.04, 0.35], ['elbow', [0.19, 1.14, -0.08], 0.035, 0.4],
    ['knee', [0.085, 0.5, 0.08], 0.045, 0.35], ['heel', [0.077, 0.02, -0.06], 0.045, 0.4], ['ball of the foot', [0.09, 0.015, 0.11], 0.05, 0.4], ['toes', [0.1, 0.02, 0.17], 0.05, 0.35],
    ['chest', [0, 1.38, 0.1], 0.1, 0.12], ['shin', [0.08, 0.3, 0.05], 0.1, -0.12],
  ],
  pigment: [
    ['face', [0, 1.67, 0.07], 0.12, 0.4], ['neck', [0, 1.52, 0], 0.09, 0.2], ['forearm', [0.215, 1.0, -0.04], 0.15, 0.25], ['back of the hand', [0.24, 0.82, -0.02], 0.05, 0.3],
    ['shoulders', [0.15, 1.44, -0.05], 0.12, 0.12], ['loins', [0, 0.93, -0.03], 0.2, -0.3], ['inside of the upper arm', [0.15, 1.27, -0.03], 0.07, -0.25],
    ['palm', [0.205, 0.81, -0.02], 0.045, -0.6], ['sole', [0.085, -0.005, 0.03], 0.1, -0.6], ['thigh, inside', [0.03, 0.72, 0], 0.1, -0.2],
  ],
  oil: [['forehead', [0, 1.72, 0.1], 0.04, 1], ['nose', [0, 1.64, 0.115], 0.025, 1], ['chin', [0, 1.585, 0.1], 0.025, 0.6], ['chest', [0, 1.38, 0.1], 0.1, 0.3], ['shoulders', [0.17, 1.45, -0.03], 0.07, 0.3]],
  veins: [['forearm, inside', [0.205, 1.0, 0.0], 0.09, 1], ['back of the hand', [0.24, 0.82, -0.02], 0.05, 1], ['top of the foot', [0.085, 0.06, 0.07], 0.06, 1]],
  // (where hair cut to the skin shows through it as a shadow: the scalp of a head shaved close, a shaved beard)
  stubble: [['crown', [0, 1.765, -0.02], 0.07, 1], ['back of the head', [0, 1.7, -0.075], 0.065, 1], ['over the ear', [0.068, 1.715, -0.03], 0.04, 1], ['nape', [0, 1.635, -0.085], 0.04, 0.8], ['forehead\'s top', [0, 1.762, 0.055], 0.035, 0.7],
    ['chin', [0, 1.575, 0.09], 0.028, 0.75], ['jaw', [0.042, 1.588, 0.045], 0.03, 0.7], ['cheek, low', [0.056, 1.612, 0.03], 0.024, 0.45], ['upper lip', [0.012, 1.6235, 0.1], 0.012, 0.7], ['under the jaw', [0.02, 1.562, 0.045], 0.03, 0.5]],
};

// How far each leg's inner side stays from the body's middle plane, by height (m: [height, half the gap]): a man
// standing with his feet under his hips has his thighs close together just under the crotch, then a gap that
// opens to about five centimetres between the knees (his knees stand 17 cm apart here, a knee 11 cm broad); below
// them the calves' own shape rules. From the muscles alone the inner thighs filled the gap to the knees, and the two
// legs read as one.
const LEG_GAP = [[0.82, 0.003], [0.78, 0.006], [0.72, 0.011], [0.64, 0.018], [0.56, 0.024], [0.5, 0.027], [0.44, 0.016], [0.36, 0.01], [0, 0.01]];
export const gapAt = (y) => { const G = LEG_GAP; if (y >= G[0][0]) return G[0][1]; for (let i = 0; i < G.length - 1; i++) if (y >= G[i + 1][0]) return G[i + 1][1] + ((G[i][1] - G[i + 1][1]) * (y - G[i + 1][0])) / (G[i][0] - G[i + 1][0]); return G.at(-1)[1]; };

// The face's own lines (intent 0042), drawn as the skin is drawn (./light.js), not laid on its points: a lid's edge, the
// lips' border and a brow's hairs are finer than the skin's points lie apart. Left side; m. From Farkas's norms of the
// adult man's face (Farkas 1994, "Anthropometry of the Head and Face"), as remembered: between the eyes' inner corners
// 33 mm, an eye's opening 31 mm long and 10 to 11 high, its outer corner a little higher than its inner; the mouth 52 mm
// broad; the iris 11.7 mm across.
//   EYE    the globe (its middle and radius, UNDER's); its opening in the globe's own front view (x outwards from the
//          globe's middle, y up): the inner and the outer corner, how far each lid's edge stands from the line between
//          them and where along that line (0 the inner corner, 1 the outer) it stands furthest; how thick the lid lies
//          over the globe; the iris's and the pupil's radius
//   LIPS   the upper lip's red: where its bow's peak stands off the middle, its height there and at the middle; the
//          lower lip's height (each from the mouth's opening, MOUTH below, outwards)
//   BROW   the brow's line from its inner end over its highest point to its outer end, its thickness at each end
export const EYE = { at: [0.032, 1.677, 0.072], r: 0.012, inner: [-0.0155, -0.0016], outer: [0.0136, 0.0008], upper: [0.0041, 0.42], lower: [0.0026, 0.5], lid: 0.0013, iris: 0.00585, pupil: 0.0025 };
export const LIPS = { bow: [0.0046, 0.0062, 0.005], lower: 0.0085 };
// The mouth as it smiles: a friendly face's lips part over its upper teeth. The opening between them, cut out of the
// skin as it is drawn (as the eyes' are): half its breadth; the height of its corners, of the upper lip's edge at the
// middle and of the lower lip's (m); `floor`: how far forward the teeth's faces stand behind it, by how far from the
// middle (m: z = floor[0] - floor[1] x² - floor[2] x⁴; ../skeleton/skull.js's upper row with half a millimetre before
// it), which the lips' edges roll in to; `edge`: how round those edges are (m). A smile shows three quarters or more
// of the upper front teeth and the lower lip follows their edges (the "smile arc" of the dentists' books, as
// remembered); at rest the lips met at 1.6077 m and the mouth was 52 mm broad. It is a whole smile, the kind the eyes
// take part in: the corners stand higher than the upper lip's middle, the cheeks are raised (HEAD's masses) and the lower
// lids with them (EYE: the opening 7.9 mm high for a resting eye's 10; the pupil wide, 5 mm, as a fond look's is).
export const MOUTH = { half: 0.0325, corner: 1.6165, upper: 1.6148, lower: 1.605, floor: [0.0995, 17, 9000], edge: 0.0028 };
/** The mouth's opening at a place of the face seen from the front: how far inside the lips' edges (m; negative: on a
    lip), how far under the upper lip's edge and over the lower's, and how far out from the middle (0 … 1). */
export const mouthOpening = (x, y) => {
  const M = MOUTH, ax = Math.abs(x), t = Math.min(1, ax / M.half), yu = M.upper + (M.corner - M.upper) * t ** 2.2, yl = M.lower + (M.corner - M.lower) * t * t;
  const under = yu - y, over = y - yl;
  return { d: ax >= M.half ? -Math.hypot(ax - M.half, y - M.corner) : Math.min(under, over), under, over, t };
};
export const BROW = { from: [0.011, 1.6938], peak: [0.038, 1.6998], to: [0.0585, 1.6948], thick: [0.0105, 0.005] };

// The face's fine folds (intent 0042, fifth round), drawn as the skin is drawn (./light.js): each a short straight
// run seen from the front, left side: [from x, y, to x, y, half its breadth (m), how deep (0 … 1)]. A whole smile
// folds the skin: a fan from each eye's outer corner, creases under the lower lid; and a brow that has smiled for
// forty years keeps its lines. (The fold from the nose's wing round the mouth is a form of the head's, HEAD's hollows:
// drawn as a line it read as a scratch.) Each fades towards its far end.
// Where they lie is read off faces, not measured: a painter's knowledge, as TONE's is.
export const FOLDS = [
  // the fan from the eye's outer corner
  [0.0494, 1.6796, 0.0544, 1.6829, 0.0008, 0.50], [0.0499, 1.6785, 0.0576, 1.6806, 0.0008, 0.70], [0.0500, 1.6774, 0.0585, 1.6770, 0.0008, 0.75], [0.0498, 1.6763, 0.0563, 1.6738, 0.0008, 0.60],
  // under the lower lid, two creases
  [0.019, 1.6668, 0.031, 1.6654, 0.001, 0.5], [0.031, 1.6654, 0.0445, 1.6676, 0.001, 0.5], [0.0225, 1.6628, 0.034, 1.661, 0.0011, 0.3], [0.034, 1.661, 0.0455, 1.6638, 0.0011, 0.3],
  // the brow's lines, faint
  [0, 1.7215, 0.02, 1.7225, 0.0013, 0.22], [0.02, 1.7225, 0.043, 1.721, 0.0013, 0.22], [0, 1.7325, 0.02, 1.7336, 0.0013, 0.25], [0.02, 1.7336, 0.042, 1.732, 0.0013, 0.25],
];

// The head's form (intent 0042; ./head.js lays it out). m unless said.
//   sections   the head level by level from the chin's foot to the crown, each level's outline seen from above:
//              [height (m), where it is widest (z), its half-breadth there, how far its front and its back lie from
//              there (all mm), how square its front and its back are (2: an ellipse's; more: squarer; less: pointed)].
//              Its front is the face's ground under the nose, the lips and the chin; below the jaw's angle (1.59 m) it
//              is the jaw's body alone, its back edge the jaw's lower border running forwards and down to the chin.
//   crown, chin, dome, foot   the top of the head and the chin's foot (m); the crown rounds over its upper `dome`, the
//              chin's foot its lower `foot`
//   masses     what stands out of that ground (the nose, the lips, the chin, the floor of the mouth under the jaw, the
//              cheeks a smile raises; `rise`: how far a mass's sides stand higher than its middle, m for each m²): [where its middle is, how far it reaches outwards, inwards, up, down,
//              forwards, back], n its squareness, arch how far its sides curve back (m for each m²), k how softly it
//              runs into the ground (m); or a ridge from a to b, its radius from ra to rb
//   hollows    what lies in it, the same way: the hollow between the brow and the upper lid, the eye's corners, the
//              groove under the nose, the furrow round the nose's wing (the mouth's own opening is MOUTH's, below)
//   lids       how softly the lids over the globe run into the face round them (m)
//   neck       how softly the head runs into the neck under it (m)
//   even       over how much height the levels' numbers are evened between the written ones (m)
// Where the numbers are from, as remembered:
//   the skull's own levels (../skeleton/skull.js: 185 mm long, 144 broad, its top 119 mm over the ear canals, its
//     nasion 26.5 over and 101 before them, its teeth meeting 53.6 under, its chin's foot 93.5 under) with the flesh
//     over them (TISSUE: the scalp 6 mm, the brow 5.5, the chin 11): a head 198 mm long, 154 broad, 227 high;
//   the profile's depths: Arnett et al. 1999, "Soft tissue cephalometric analysis" (Am J Orthod Dentofacial Orthop
//     116), men's means measured from the plumb line through the nose's foot: the glabella 8 mm behind it, the nose's
//     tip 17.4 before, the upper lip 3.3 before, the lower 1.0, the fold over the chin 7.1 behind, the chin 3.5
//     behind; the cheekbone 25 behind, the socket's lower rim 22, the nose's wing's foot 15; the lips 15 mm thick
//     over the teeth;
//   the heights and breadths: Farkas 1994, "Anthropometry of the Head and Face", men's means: the nose 55 mm high
//     (root to foot) and 35 broad, the upper lip 22 high, the mouth to the chin's foot 51, the face 139 broad across
//     the cheekbones and 106 to 112 across the jaw's angles.
export const HEAD = {
  crown: 1.7855, chin: 1.569, dome: 0.0705, foot: 0.016, lids: 0.007, even: 0.004, neck: 0.012,
  sections: [
    [1.569, 48, 38, 46, 42, 1.8, 2.0], [1.575, 44, 43.5, 51, 44, 1.7, 2.0], [1.585, 30, 54.5, 65.5, 36, 1.6, 2.0],
    [1.595, 10, 59, 90.5, 22, 1.65, 2.0], [1.608, 4, 61, 100.5, 22, 1.7, 2.0], [1.625, 2, 64.5, 103, 40, 1.9, 2.0], [1.64, 0, 68, 97, 80, 2.3, 2.0],
    [1.655, -2, 70, 97, 92, 2.8, 2.0], [1.67, -10, 72.5, 104, 87, 2.4, 2.0], [1.685, -15, 75, 109, 83.5, 2.25, 2.0], [1.7, -20, 76.5, 119.5, 79.5, 2.3, 2.0],
    [1.715, -20, 77, 117, 79.5, 2.3, 2.1], [1.73, -20, 77, 116, 79.5, 2.3, 2.1], [1.745, -20, 77, 116, 79.5, 2.2, 2.1], [1.76, -20, 77, 116, 79.5, 2.2, 2.1], [1.7855, -20, 77, 116, 79.5, 2.2, 2.1],
  ],
  masses: [
    { what: 'nose, its ridge', a: [0, 1.6775, 0.0875], b: [0, 1.6455, 0.115], ra: 0.0075, rb: 0.008, k: 0.006 },
    { what: 'nose, its sides', a: [0, 1.682, 0.08], b: [0, 1.644, 0.102], ra: 0.0105, rb: 0.014, k: 0.008 },
    { what: 'nose, its tip', at: [0, 1.6408, 0.1168], r: [0.0095, 0.0095, 0.008, 0.0072, 0.0088, 0.009], k: 0.006 },
    { what: 'nose, a wing', at: [0.0105, 1.639, 0.102], r: [0.0064, 0.0072, 0.0068, 0.0048, 0.0095, 0.009], n: 2.2, k: 0.0045 },
    { what: 'nose, its foot', a: [0, 1.6365, 0.118], b: [0, 1.6345, 0.1045], ra: 0.0034, rb: 0.0036, k: 0.003 },
    { what: 'upper lip', at: [0, 1.6178, 0.1005], r: [0.034, 0.034, 0.0048, 0.0044, 0.0072, 0.01], k: 0.0035, arch: 21, rise: 2.2 },
    { what: 'lower lip', at: [0, 1.6, 0.0995], r: [0.03, 0.03, 0.0062, 0.0066, 0.0082, 0.01], k: 0.0035, arch: 21, rise: 11 },
    { what: 'chin', at: [0, 1.5748, 0.0855], r: [0.017, 0.017, 0.0125, 0.0102, 0.012, 0.014], k: 0.018 },
    { what: 'under the jaw', at: [0, 1.583, 0.046], r: [0.039, 0.039, 0.02, 0.0195, 0.046, 0.04], k: 0.012 },
    { what: 'the jaw\'s lower border beside the chin', a: [0.008, 1.5715, 0.087], b: [0.03, 1.574, 0.07], ra: 0.0082, rb: 0.0082, k: 0.008 },   // (over the bone's own border there: with the chin shortened it stood out of the skin)
    { what: 'cheek, raised by the smile', at: [0.038, 1.647, 0.074], r: [0.014, 0.013, 0.012, 0.015, 0.0165, 0.01], k: 0.01 },
    { what: 'the lower lid, pushed up by the cheek', a: [0.022, 1.6665, 0.0826], b: [0.043, 1.6675, 0.0766], ra: 0.0034, rb: 0.0034, k: 0.004 },
  ],
  hollows: [
    { what: 'over the upper lid', at: [0.0295, 1.6795, 0.0925], r: [0.0175, 0.0175, 0.008, 0.008, 0.0115, 0.0115], k: 0.01 },
    { what: 'the inner corner', at: [0.0185, 1.6765, 0.0905], r: [0.0085, 0.0085, 0.008, 0.008, 0.0115, 0.0115], k: 0.006 },
    { what: 'the outer corner', at: [0.0455, 1.678, 0.0845], r: [0.007, 0.007, 0.007, 0.007, 0.0105, 0.01], k: 0.007 },
    { what: 'under the lower lid', at: [0.031, 1.665, 0.0956], r: [0.016, 0.014, 0.006, 0.006, 0.0105, 0.01], k: 0.013 },
    { what: 'the fold from the nose\'s wing round the mouth', a: [0.0225, 1.6355, 0.0995], b: [0.0358, 1.618, 0.0905], ra: 0.0034, rb: 0.0034, k: 0.005 },
    { what: 'the fold, on down outside the mouth\'s corner', a: [0.0358, 1.618, 0.0905], b: [0.0395, 1.604, 0.0835], ra: 0.0034, rb: 0.0026, k: 0.005 },
    { what: 'the groove under the nose', a: [0, 1.6305, 0.111], b: [0, 1.6175, 0.1117], ra: 0.0032, rb: 0.0032, k: 0.003 },
    { what: 'round the nose\'s wing, above', a: [0.0125, 1.6462, 0.1075], b: [0.0185, 1.6425, 0.1005], ra: 0.0022, rb: 0.0025, k: 0.003 },
    { what: 'round the nose\'s wing, beside', a: [0.0185, 1.6425, 0.1005], b: [0.0205, 1.636, 0.098], ra: 0.0025, rb: 0.0025, k: 0.003 },
  ],
};
