// What is known of real people, as numbers (intent 0036): the tables the person is grown from (./body.js), each small,
// on its own and cited, so any of them can be taken out or changed without touching the code that reads it. Nothing
// here is a shape: no mesh, scan or captured motion of anyone; only measures, as surveys and textbooks publish them.
//
// Lengths are millimetres as published, or shares of stature where the source gives shares. A body is made by
// mixing the female and male columns by the avatar's `sex` (0 … 1), scaling to its height, and moving the result by its
// age and build (AGE, BUILD).

/** Segment lengths as shares of stature (unisex): Drillis & Contini, "Body segment parameters" (1966), as reproduced
 *  in D. A. Winter, "Biomechanics and Motor Control of Human Movement" (4th ed., 2009), fig. 4.1. */
export const SEGMENTS = {
  source: 'Drillis & Contini 1966, in Winter 2009, fig. 4.1',
  eye: 0.936, chin: 0.870, shoulder: 0.818, chest: 0.720, elbow: 0.630, hip: 0.530, wrist: 0.485, fingertip: 0.377,
  knee: 0.285, ankle: 0.039, upperArm: 0.186, foreArm: 0.146, hand: 0.108, thigh: 0.245, shank: 0.246, foot: 0.152,
  footBreadth: 0.055, head: 0.130,
};

/** Adult body measures by sex, mm (means): the US Army's 2012 anthropometric survey, ANSUR II (Gordon et al., 2014,
 *  "2012 Anthropometric Survey of U.S. Army Personnel: Methods and Summary Statistics", NATICK/TR-15/007; public
 *  domain). PROVISIONAL: written from the published summary statistics as remembered, rounded; the survey's own
 *  tables could not be reached from where this was made (its hosts are blocked there), so every value is to be checked
 *  against them. A soldier is fitter than the mean of a city: BUILD moves away from these. */
export const ADULTS = {
  source: 'ANSUR II 2012 (Gordon et al. 2014), means, provisional',
  stature: [1629, 1756], acromialHeight: [1336, 1441], cervicaleHeight: [1384, 1500], axillaHeight: [1237, 1336],
  waistHeight: [990, 1047], trochanterionHeight: [842, 900], crotchHeight: [785, 850], kneeHeight: [473, 507],
  malleolusHeight: [65, 70], biacromial: [365, 416], bideltoid: [449, 510], chestBreadth: [275, 300], chestDepth: [240, 255],
  chestCirc: [950, 1050], waistCirc: [840, 940], waistBreadth: [300, 325], waistDepth: [215, 240], hipBreadth: [345, 342],
  buttockCirc: [1030, 1020], buttockDepth: [250, 248], thighCirc: [623, 621], calfCirc: [368, 391], ankleCirc: [215, 226],
  bicepsCirc: [300, 358], forearmCirc: [260, 306], wristCirc: [152, 175], neckCirc: [345, 411], upperArm: [309, 337],
  foreArm: [240, 269], handLength: [181, 194], handBreadth: [79, 89], footLength: [245, 271], footBreadth: [92, 102],
  headLength: [189, 198], headBreadth: [147, 152], headCirc: [552, 573], tragionTop: [128, 130],
};

/** The face, mm (means, female and male): L. G. Farkas, "Anthropometry of the Head and Face" (2nd ed., 1994), adult
 *  norms. Eye fissure and eyelid from the same; the eyeball: Bekerman, Gottlieb & Vaiman, "Variations in eyeball
 *  diameters of the healthy adults", J. Ophthalmology 2014 (24.2 ± 0.5 mm, the same in a small and a tall adult);
 *  the cornea: Gray's Anatomy (41st ed.): 11.7 mm across, a curve of 7.8 mm radius, the chamber behind it 3 mm deep.
 *  PROVISIONAL as ADULTS: from the published norms as remembered, to be checked against them. */
export const FACE = {
  source: 'Farkas 1994; Bekerman et al. 2014; Gray 2016; provisional',
  intercanthal: [31.8, 33.3], biocular: [86.8, 91.2], fissureHeight: [10, 10.5], noseWidth: [31.4, 34.9],
  noseHeight: [50.6, 54.8], noseTip: [19.5, 21], mouthWidth: [50.2, 53.3], upperLip: [19.9, 22.3], lowerFace: [64.5, 72.6],
  faceHeight: [112, 121], faceWidth: [130, 137], jawWidth: [94, 104], earLength: [59, 62.4], earWidth: [30, 33],
  interpupillary: [61.5, 64.5],
  eyeball: 24.2, cornea: 11.7, corneaCurve: 7.8, chamber: 3.0, pupil: 3.6,
};

/** The hand, as shares of hand length, and the phalanges' shares of each finger (proximal, middle, distal): from
 *  surveys of hand dimensions (Garrett 1971, "The adult human hand: some anthropometric and biomechanical
 *  considerations", Human Factors 13; and the phalanx ratios of Buryanov & Kotiuk 2010, "Proportions of hand segments",
 *  Int. J. Morphol. 28). PROVISIONAL, as above. */
export const HAND = {
  source: 'Garrett 1971; Buryanov & Kotiuk 2010; provisional',
  palm: 0.57,                                   // wrist crease to the knuckle of the middle finger
  fingers: { index: 0.385, middle: 0.43, ring: 0.405, little: 0.32, thumb: 0.36 },   // knuckle to tip (the thumb: its first knuckle to tip)
  phalanges: [0.48, 0.30, 0.22],
  thumbMeta: 0.25,                              // the thumb's metacarpal, out of the palm
  width: { index: 0.215, middle: 0.205, ring: 0.19, little: 0.165, thumb: 0.235 },     // a finger's breadth at its first joint, share of hand breadth
};

/** How a body changes with age past twenty, per decade (adults): fat gained and muscle lost (e.g. Kyle et al. 2001,
 *  "Age-related differences in fat-free mass, skeletal muscle, body cell mass and fat mass", Eur. J. Clin. Nutr. 55),
 *  the upper back's curve (Fon, Pitt & Thies 1980, "Thoracic kyphosis: range in normal subjects", AJR 134), ears
 *  lengthening (Heathcote 1995, "Are ears still growing?", BMJ 311: 0.22 mm a year). PROVISIONAL, as above. */
export const AGE = {
  source: 'Kyle et al. 2001; Fon et al. 1980; Heathcote 1995; provisional',
  fat: 0.06,          // share of fat added a decade from 25, to 65
  muscle: 0.05,       // share of muscle lost a decade from 35
  kyphosis: 4,        // degrees of the upper back's curve added a decade from 40 (from about 25° at 20–30)
  ear: 2.2,           // mm of ear length a decade from 20
  sag: 0.08,          // how far the face's soft parts settle a decade from 40 (a share of the cheeks' and jowls' fat, moving down)
};

/** Build: lean to heavy, as the waist and the girths move with it; 0.5 is the survey's mean. */
export const BUILD = {
  source: 'this kit: girths scaled so that 0 is a lean and 1 a heavy adult of the same height',
  fat: [0.35, 1, 2.1],            // share of the mean's fat at build 0, 0.5, 1
  muscle: [1.1, 1, 0.95],
};
