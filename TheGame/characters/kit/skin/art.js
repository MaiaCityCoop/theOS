// What of the Body was shaped or set by eye (intents 0041, 0042): its ear's, its head's and its face's form, its cage's
// counts, how its skin takes the light. No measure gives these and no published method: each is a choice, made against
// what was looked at, and its comment says against what (`source: …`). They live here, in one place, and the code gates
// count them as artistic (tools/health.js), not as numbers set by hand somewhere in the code. Plain JS, no three: the
// workers that lay the skin read it too. Left side; metres unless said.

// ── the ear (./ear.js draws it) ─────────────────────────────────────────────────────────────────────────────
// The ear's measures (mm in its own plane unless said). Where they are from, as remembered, none read for this:
//   its size: Farkas 1994, "Anthropometry of the Head and Face": a man's ear 62.7 mm long and 35.4 broad; its long
//     axis leaning back some 10 to 15 degrees from the upright; it stands off the head by 20 to 30 degrees, its rim 15
//     to 20 mm from the skull behind it;
//   its parts and their sizes: the anatomy books' auricle (Gray 1918, fig. 904; Tolleth 1978, "Artistic anatomy,
//     dimensions, and proportions of the external ear"): the concha about 15 by 20 mm and a centimetre deep, the helix's
//     roll 4 to 5 mm across, the lobe 15 to 18 mm long and 5 to 6 thick, the plate between them 3.
//
//   canal      where the ear canal opens, in the world (the left side; m), and where that is in the ear's plane
//   lean, off, tip   the frame, degrees: the long axis leaning back; the plane turned off the head's middle plane
//              round that axis (its rear rim outwards; the head's own side falls away from it by as much again);
//              its top tipped outwards
//   clear      how far over the head's skin the ear's own surface stays at least, away from its seam (mm): the head's
//              skin runs on under the ear, and would show through it where the bowl's floor lay lower
//   outline    the plate's rim, round it from the front edge over the top and down the back to the lobe ([p, q])
//   seam       the line along which the ear's front edge runs into the cheek and the temple; `dive`: from how near
//              that line the plate begins to sink into the head (mm), and how far under the head's skin it ends
//   root       the outline of what joins the ear to the head under the bowl; `under`: how far inside the head it ends;
//              `flare`: how much broader it grows for each mm towards the head; `soft`: how softly it runs into the plate
//   concha     the bowl: its middle, half-breadths, squareness, depth; `wall`: from where to where (shares of its
//              half-breadth) its wall rises
//   pit        the canal's own pit in the bowl's floor: middle, radius, depth
//   crus       the helix's root, a fold running back across the bowl: from a to b, its half-breadth, how high its
//              crest stands at each end
//   antihelix  the ridge inside the rim: its stem and its two upper legs ([p, q] each), its height and half-breadth
//   scapha     the groove between helix and antihelix: how far inside the rim, its half-breadth and depth, between
//              which angles round the ear it runs (degrees: 0 backwards, 90 up)
//   fossa      the hollow between the antihelix's two legs
//   antitragus   the small rise at the bowl's lower rim (the notch between it and the tragus is what lies between)
//   helix      the roll along the rim: how far inside the outline its middle runs, its radius, how far it stands out
//              of the plate, and at least `over` the head's skin (where it rises out of the temple); `arc`: the
//              angles between which it grows from nothing (towards the lobe) and ends (at its root in front)
//   front      before the bowl the plate lies low, near the cheek, not at the rim's level: how far under it, between
//              which p it falls there, between which heights q (rising from and to nothing)
//   tragus     the flap before the canal: a rise of the plate out of that low ground: its middle, its half-breadths
//              (forwards, a long ramp from the cheek; backwards, its free edge over the canal; up and down), how
//              high its crest stands, how far it has fallen at their ends
//   even       over how much the whole form is evened before its surface is drawn (mm): a form put together of
//              parts has creases where they meet, and an ear has none
//   plate, lobe   the plate's thickness; the lobe's: below `from` to `to` (q) it grows to `thick` and lies smooth,
//              turned in towards the head: `level`: where its sheet lies at p = 0, and how much further out a mm back
// source: set by eye within the measures above, round by round against the stills of the ear (intent 0042).
export const EAR = {
  canal: { at: [0.07, 1.66, -0.012], in: [4, -0.5, -11.5] },
  lean: 12, off: 4, tip: 4, clear: 0.9,
  outline: [[-6, 6], [-6.5, 14], [-5.5, 22], [-3, 29], [2, 34], [9, 36.3], [16.5, 35.5], [23, 31.5], [27, 25], [29, 16], [29, 7], [27.5, -2],
    [24.5, -10], [21, -16], [18.5, -21], [14, -25.5], [9, -27], [4, -25.5], [0.5, -21], [-1.5, -15], [-4, -9], [-6, -2]],
  seam: { line: [[-1.5, -15], [-4, -9], [-6, -2], [-6, 6], [-6.5, 14], [-5.5, 22], [-3.5, 27]], dive: [1, 6], under: 3 },
  root: { outline: [[-8, -10], [-8.5, 2], [-8, 14], [-5.5, 23], [-1, 27], [4, 25], [8.5, 19], [11.5, 10], [12.2, 1], [10.5, -8], [6.5, -14.5], [1, -17], [-4.5, -15.5]], under: 2.5, flare: 0.45, soft: 3 },
  concha: { at: [8.2, 1.5], r: [8.2, 11.8], n: 2.3, deep: 10.5, wall: [0.55, 1.05] },
  front: { deep: 8.5, p: [4, -2], q: [-14, -8, 6, 11] },
  pit: { at: [4.2, -0.5], r: 2.8, deep: 3 },
  crus: { a: [-2.5, 9.5], b: [8.5, 5], half: 2.4, high: [-1.5, -9.5] },
  antihelix: { stem: [[12, -10], [17.5, -4], [19.5, 4], [19, 11], [16.5, 17]], upper: [[16.5, 17], [13, 23], [8, 28.5]], lower: [[16.5, 17], [10, 18.5], [3, 19.5]], high: 2.2, half: 2.6 },
  scapha: { in: 5.6, half: 1.8, deep: 1.8, arc: [-45, -25, 115, 135] },
  fossa: { at: [9.5, 22.5], r: [4.5, 3.2], deep: 2 },
  antitragus: { at: [11.5, -10.5], r: 3.2, high: 1 },
  helix: { in: 2.3, r: 2.4, out: 1, over: 0.3, arc: [-62, -38, 160, 174] },
  tragus: { at: [1, -1.5], r: [6, 3.4, 5], high: -2.5, fall: 6.5 },
  plate: 3, lobe: { from: -11, to: -19, thick: 5.5, level: [-7, 0.22] }, even: 0.5,
};

/** The part of the ear's plane its maps are worked out on (mm): from p0 and q0, pw and qw across, a point every `step`.
    source: chosen: it holds EAR's outline with room round it, and half a millimetre is as fine as the maps are worked out. */
export const EAR_PLANE = { p0: -16, q0: -34, pw: 51, qw: 77, step: 0.5 };

// ── the face's lines and the head's form (./head.js lays the head out, ./light.js draws the lines) ─────────────────
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
// source: Farkas's norms above, as remembered; then set by eye against the stills of the face and, in the fifth round,
// against the reference photograph (intent 0042).
export const EYE = { at: [0.032, 1.677, 0.072], r: 0.012, inner: [-0.0155, -0.0016], outer: [0.0136, 0.0008], upper: [0.0041, 0.42], lower: [0.0026, 0.5], lid: 0.0013, iris: 0.00585, pupil: 0.0025 };
export const LIPS = { bow: [0.0046, 0.0062, 0.005], lower: 0.0085 };   // source: set by eye against the stills of the face (intent 0042)
// The mouth as it smiles: a friendly face's lips part over its upper teeth. The opening between them, cut out of the
// skin as it is drawn (as the eyes' are): half its breadth; the height of its corners, of the upper lip's edge at the
// middle and of the lower lip's (m); `floor`: how far forward the teeth's faces stand behind it, by how far from the
// middle (m: z = floor[0] - floor[1] x² - floor[2] x⁴; ../skeleton/skull.js's upper row with half a millimetre before
// it), which the lips' edges roll in to; `edge`: how round those edges are (m). A smile shows three quarters or more
// of the upper front teeth and the lower lip follows their edges (the "smile arc" of the dentists' books, as
// remembered); at rest the lips met at 1.6077 m and the mouth was 52 mm broad. It is a whole smile, the kind the eyes
// take part in: the corners stand higher than the upper lip's middle, the cheeks are raised (HEAD's masses) and the lower
// lids with them (EYE: the opening 7.9 mm high for a resting eye's 10; the pupil wide, 5 mm, as a fond look's is).
// source: the resting mouth's measures above, as remembered; the smile set by eye against the reference photograph
// (intent 0042, third and fifth rounds).
export const MOUTH = { half: 0.0325, corner: 1.6165, upper: 1.6148, lower: 1.605, floor: [0.0995, 17, 9000], edge: 0.0028 };
/** The mouth's opening at a place of the face seen from the front: how far inside the lips' edges (m; negative: on a
    lip), how far under the upper lip's edge and over the lower's, and how far out from the middle (0 … 1). */
export const mouthOpening = (x, y) => {
  const M = MOUTH, ax = Math.abs(x), t = Math.min(1, ax / M.half), yu = M.upper + (M.corner - M.upper) * t ** 2.2, yl = M.lower + (M.corner - M.lower) * t * t;
  const under = yu - y, over = y - yl;
  return { d: ax >= M.half ? -Math.hypot(ax - M.half, y - M.corner) : Math.min(under, over), under, over, t };
};
export const BROW = { from: [0.011, 1.6938], peak: [0.038, 1.6998], to: [0.0585, 1.6948], thick: [0.0105, 0.005] };   // source: set by eye against the stills of the face (intent 0042)

// The face's fine folds (intent 0042, fifth round), drawn as the skin is drawn (./light.js): each a short straight
// run seen from the front, left side: [from x, y, to x, y, half its breadth (m), how deep (0 … 1)]. A whole smile
// folds the skin: a fan from each eye's outer corner, creases under the lower lid; and a brow that has smiled for
// forty years keeps its lines. (The fold from the nose's wing round the mouth is a form of the head's, HEAD's hollows:
// drawn as a line it read as a scratch.) Each fades towards its far end.
// source: where they lie is read off faces, not measured: a painter's knowledge, as ./table.js TONE's is.
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
// source: the levels and the depths named above, as remembered; then shaped by eye, round by round against the stills of
// the face and, from the fifth round, against the reference photograph (intent 0042).
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

// ── the skin's cage (./cage.js lays it) ───────────────────────────────────────────────────────────────────────
/** How many points a ring of the cage has: the trunk's (T), an arm's (A); how many edges cross under an armpit (KA) and
    under the crotch (KC). The others follow, so that the rings meet point for point: the head's, the neck's and the
    shoulders' are H = T + 2A - 4KA, a leg's L = T/2 + KC.
    source: a modeller's choice, made when the cage was laid out (intent 0041): how many edges run down the body. */
export const CAGE_COUNT = { T: 32, A: 20, KA: 6, KC: 4 };

/** How much of the shape's finer form is laid back on the smooth surface, piece by piece: [the share of the way, the
    furthest a point is moved (m)]; the head's from `neck` (m) up; the rest of the body's only where the fat and the
    skin are thin over a bone (all of it under `thin[0]` m of them, none over `thin[1]`: the collarbone, the kneecap,
    the shin, the ankle's and the wrist's knobs, the elbow), for under fat the skin lies smooth.
    source: set by eye against the Body's stills (intents 0041, 0042). */
export const LIFT = { head: [1, 0.012], hand: [0.9, 0.004], foot: [0.9, 0.004], body: [0.9, 0.006], thin: [0.0025, 0.0055], neck: 1.53 };

// ── how the skin takes the light (./light.js draws it) ─────────────────────────────────────────────────────────
/** The skin's roughness (0 a mirror, 1 chalk): dry, where it is oiliest, a nail, a lip. Skin's as the Physically Based
    database lists it (0.5); the rest about it.
    source: skin's, the Physically Based database's; the others set by eye against the Body's stills (intent 0042). */
export const ROUGH = { skin: 0.5, oily: 0.36, nail: 0.24, lip: 0.34 };
/** How far light comes through a thin part: the under-skin bells (./maps.js SCATTER) taken at this share of the
    part's thickness in millimetres (an ear is gristle and two thin skins, not a slab of skin: Jimenez et al. 2010,
    "Real-time realistic skin translucency", scale it likewise by a part's translucency).
    source: set by eye against the Body's stills (intent 0042). */
export const THROUGH = 0.35;
/** A fair skin's own colour (linear light), before its blood and its pigment (./table.js TONE) tint it place by place:
    between the Physically Based database's skin I and skin III. What more pigment and more blood multiply it by.
    source: set by eye between those two (intents 0041, 0042). */
export const SKIN_COLOUR = { brow: [0.05, 0.032, 0.022], base: [0.58, 0.36, 0.26], pigment: [0.7, 0.56, 0.45], blood: [1.0, 0.72, 0.7], pale: [1.05, 1.04, 0.94], vein: [0.84, 0.9, 1.06], lip: [0.56, 0.2, 0.18], areola: [0.62, 0.45, 0.42], nail: [0.6, 0.4, 0.36] };
/** How strongly the skin's fine relief turns the normal. source: set by eye against the Body's stills (intent 0041). */
export const RELIEF_TURN = 0.55;
/** How steep a fold's sides are taken to be, for the light (FOLDS above). source: set by eye against the stills of the
    eye (intent 0042, fifth round). */
export const FOLD_STEEP = 1.5;

/** The sharpest curve the under-skin scatter's map holds (1/mm): a rim 2 mm round (./maps.js).
    source: chosen when the map was made (intent 0041): what curves more sharply than that is read as that. */
export const CURVE_MOST = 0.5;
