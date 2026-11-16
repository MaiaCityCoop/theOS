// The skeleton's skull (intent 0033): the cranium (the braincase and the face grown into one bone), the lower jaw on
// its hinge, thirty-two teeth each in its socket, the hyoid under the jaw.
//
// Its points are written in the skull's own millimetres: from the middle between the two ear canals (the porion's
// level), x to the left, y up, z forwards, the head upright (the Frankfurt plane level: ear canals and the lower rims
// of the eye sockets at one height). Measures: the two plates of Gray's Anatomy (1918), fig. 188 (from the side) and
// fig. 190 (from the front), read on a grid and scaled by the skull's own length (185 mm, glabella to the back) and
// the face's height (120 mm, nasion to the chin's foot); they agree with craniometry's means for a man (Howells 1973,
// "Cranial variation in man": length 185, breadth 143, cheekbones 132, upper face 70, eye socket 39 × 34, nose's
// opening 25 × 51; jaw's angles 100 apart).
import { PART } from './rig.js';
import { norm, cross, add, sub, mul, lerp, spline } from './kit.js';

const SK = [0, 1.66, -0.012];   // the middle between the ear canals, in the reference man
const at = (x, y, z) => [x / 1000, SK[1] + y / 1000, SK[2] + z / 1000];
const mm = (...v) => v.map((q) => q / 1000);

/** The skull's seams (sutures): lines over the cranium where its bones grew together, each a run of points in the
 *  skull's millimetres (both: on each side). Whoever draws the skull lays them onto its surface as fine, toothed,
 *  darker lines; they are no part of its form. */
export const SUTURES = [
  { name: 'sagittal', pts: [[0, 117.5, 18], [0, 119, -5], [0, 115, -30], [0, 103, -55], [0, 88, -72], [0, 72, -82]] },
  { name: 'coronal', both: true, pts: [[0, 117.5, 18], [25, 110, 19], [45, 96, 22], [58, 76, 28], [64, 56, 33], [62, 40, 38], [58, 28, 42]] },
  { name: 'lambdoid', both: true, pts: [[0, 72, -82], [20, 62, -80], [38, 45, -72], [52, 25, -60], [58, 8, -50]] },
  { name: 'squamosal', both: true, pts: [[58, 28, 42], [66, 40, 22], [70, 44, 0], [69, 38, -20], [65, 24, -38], [58, 8, -50]] },
  { name: 'occipitomastoid', both: true, pts: [[58, 8, -50], [55, -4, -40], [50, -14, -31]] },
  { name: 'sphenofrontal', both: true, pts: [[58, 28, 42], [52, 27, 52], [47, 26, 62]] },
  { name: 'frontozygomatic', both: true, pts: [[46, 25.5, 80], [50, 26.5, 76], [52.5, 27, 71]] },
  { name: 'frontonasal', pts: [[-11, 25, 95], [-5, 26.5, 99.5], [0, 26.5, 101], [5, 26.5, 99.5], [11, 25, 95]] },
  { name: 'internasal', pts: [[0, 26.5, 101], [0, 20, 108], [0, 13.5, 115.5]] },
  { name: 'nasomaxillary', both: true, pts: [[5, 26.5, 99.5], [6.5, 18, 105], [8.5, 10, 110]] },
  { name: 'zygomaticomaxillary', both: true, pts: [[33, 0, 85], [37, -9, 81], [40, -21, 75]] },
  { name: 'zygomaticotemporal', both: true, pts: [[63.5, 3, 40], [65.5, -1.5, 34], [66, -6, 29]] },
  { name: 'intermaxillary', pts: [[0, -25, 105], [0, -34, 106], [0, -43, 107]] },
];
/** A point given in the skull's millimetres, in the reference man's metres. */
export const skullPoint = (x, y, z) => at(x, y, z);

export function skull(K) {
  cranium(K);
  mandible(K);
  teeth(K);
  hyoid(K);
}

// ── the cranium ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The braincase, level by level from its base to the crown: [height, half-width, how far its front and its back lie
// from where it is widest, where that is (z), how square its front and back are seen from above]. The crown closes as
// a dome over its upper 64 mm (the same dome gives the breadth seen from the front and the profile seen from the
// side); under the brows (below 34 mm) the front of the braincase lies behind the face, and under the ears' level it
// narrows to a point in front (the space where the jaw's branches and their muscles lie).
const BRAINCASE = [
  [-27, 50, 50, 39, -16, 1, 2], [-14.8, 54, 62, 40, -18, 1, 2], [-2.7, 60.5, 72, 51.5, -20, 1.6, 2], [9.5, 64.5, 80, 55, -22, 2.4, 2],
  [21.7, 68, 86, 54.5, -24, 2.5, 2], [33.8, 70.6, 130, 55, -24, 2.6, 2], [46, 72.3, 130.5, 54, -24, 2.5, 2], [58.2, 72.3, 127, 51.5, -24, 2.5, 2],
  [70.3, 72, 123.6, 49.4, -22, 2.4, 2], [82.5, 72, 118.5, 50.4, -18, 2.3, 2], [94.7, 72, 109.7, 52.3, -12, 2.15, 2], [106.8, 72, 97, 54.5, -6, 2, 2], [119, 72, 90, 55, -2, 2, 2],
];
// The face, level by level from the brow down to the ridge of the upper teeth: [height, half-width, front, back (from
// where it is widest), where that is (z), how square its front is seen from above]. Its front passes through the rims
// of the eye sockets (the brow's edge furthest forward, the outer rim furthest back), the cheekbones' faces, the upper
// jaw's; the sockets and the nose's opening are cut into it.
const FACE = [
  [38, 53, 38, 22, 66, 2], [26.3, 52.5, 31, 24, 68, 2], [14.6, 52, 27, 24, 70, 2], [2.9, 55, 34, 16, 62, 1.6],
  [-8.9, 53, 42, 12, 58, 1.5], [-20.6, 40, 46, 13, 60, 1.9], [-32.3, 33.5, 44, 12, 62, 2.2], [-44, 32.5, 43, 12, 64, 2.2],
];

function cranium(K) {
  K.bone('cranium', 'head');
  const E = (c, r, R) => K.egg(at(...c), mm(...r), R);
  const S = (a, b, o) => K.strand(at(...a), at(...b), { ...o, w: o.w / 1000, d: o.d / 1000, t0: o.t0 && mm(...o.t0), t1: o.t1 && mm(...o.t1), bend: (o.bend ?? 0) / 1000 });
  const loft = (a, b, knots, o) => K.loft(at(...a), at(...b), knots.map((k) => [...mm(...k.slice(0, 6)), k[6] ?? 2, k[7] ?? k[6] ?? 2]), { ...o, round: o.round && mm(...o.round) });
  const put = (sol, k) => K.put(sol, k / 1000), cut = (sol, k) => K.cut(sol, k / 1000);

  // the braincase
  put(loft([0, -27, 0], [0, 119, 0], BRAINCASE.map(([, W, rf, rb, cw, nf, nb]) => [W, W, rf, rb, 0, cw, nf, nb]), { out: [0, 0, 1], round: [12, 64] }), 0);
  put(E([0, 3, -74.5], [11, 6, 3]), 8);                                       // the bump at the back (the inion)
  // the face (its foot rises towards the back, as the row of teeth does)
  put(K.group([
    { op: 'add', k: 0, s: loft([0, 38, 0], [0, -44, 0], FACE.map(([, W, rf, rb, cw, nf]) => [W, W, rf, rb, 0, cw, nf, 2.6]), { out: [0, 0, 1], round: [9, 0] }) },
    { op: 'and', k: 0.002, s: K.plane([0, -1, -0.13], at(0, -44.3, 107)) },
  ]), 7);
  // the brow: the glabella, the two arches over the inner halves of the sockets, the root of the nose
  put(E([0, 37, 102], [13, 9, 7]), 7);
  K.both(() => put(E([20, 40.5, 97.5], [15, 6.5, 6.5], [[1, 0.18, -0.25], [0, 1, 0]]), 7));
  put(E([0, 28, 93], [11, 9, 8.5]), 5);
  // the bony nose: a tent from the brow down, its ridge the two nasal bones running forwards to their tip, its sides
  // the upper jaw's branches sloping back to the sockets and the cheeks (the opening is cut into it below the tip)
  put(loft([0, 24.5, 94], [0, -7, 103], [[8.5, 8.5, 7.3, 6, 0, 0, 1.3, 2], [10.5, 10.5, 12.5, 7, 0, 0, 1.25, 2], [13, 13, 18, 8, 0, 0, 1.2, 2], [14.5, 14.5, 18.5, 8, 0, 0, 1.2, 2], [15.5, 15.5, 17, 8, 0, 0, 1.3, 2]], { out: [0, 0.275, 0.962] }), 4);

  // the temples: the wing of bone that joins each socket's outer wall to the braincase, hollowed a little behind the rim
  K.both(() => { put(E([41, 12, 50], [9, 20, 12]), 7); cut(E([61.5, 8, 56], [14.5, 19, 13.5]), 5); });
  // the arch from each cheekbone back to above the ear (bowed outwards, thickening to its root), the knob the jaw's
  // head rides onto, the mastoid behind the ear, the styloid's spike, the condyle that rides on the atlas
  K.both(() => {
    put(loft([52, -6, 62], [59.5, 1.5, -6], [[6.4, 6.4, 3.4, 3.4, 0, 0], [5, 5, 2.5, 2.5, 0.3, 6.5], [4.3, 4.3, 2.2, 2.2, 0.8, 10.5], [4, 4, 2.2, 2.2, 1, 11], [4.2, 4.2, 2.4, 2.4, 0.8, 8.5], [5, 5, 3, 3, 0.3, 4], [6, 6, 4, 4, 0, 0]], { out: [1, 0, 0], caps: 0.6 }), 5);
    put(E([54, -3.5, 23], [9, 4, 6]), 3);
    put(E([52, -17, -11], [7.5, 13, 9.5], [[1, 0.1, 0], [-0.1, 1, 0.12]]), 7);
    put(E([50.5, -27, -9], [5, 7, 6]), 5);
    put(K.rod(at(41, -12, 1), at(35, -35, 11), 0.0019, 0.0009), 1.5);
    put(E([17, -28.5, -8], [6, 5.5, 11.5], [[0.94, 0, 0.34], [0, 1, 0]]), 3);
  });

  // the eye sockets: each a four-sided funnel from its rim back to its point, its inner wall running straight back,
  // its outer wall slanting in to meet it; its outer corner a little lower than its inner
  K.both(() => {
    cut(loft([33.8, 16.3, 98.9], [14, 12, 40], [[20, 19, 18.5, 18], [18.5, 17.4, 17, 16.5], [15, 18.5, 18.5, 17.5], [11.5, 16, 15.5, 14.5], [8, 12.5, 11.5, 10.5], [4.5, 8, 7.5, 7], [1.8, 2.5, 2.5, 2.5]].map((k) => [...k, 0, 0, 2.6, 2.6]), { out: [-0.2, 1, 0] }), 1.8);
    put(S([49.6, 2, 76], [50.6, 26, 75.5], { w: 5.4, d: 2.8, t0: [6.2, 3.4], t1: [5.2, 2.8], out: [1, 0, 0.3] }), 4);   // its outer rim, thick
  });
  // the nose's opening, pear-shaped, and the cavity behind it; the hollow of the palate inside the arch of the teeth
  cut(loft([0, -14, 126], [0, -14, 62], [[12.5, 12.5, 25, 10.5, 0, 0, 1.5, 2.6], [12.5, 12.5, 25, 10.5, 0, 0, 1.5, 2.6], [12.8, 12.8, 26, 11.5, 0, 0, 1.5, 2.6], [12.8, 12.8, 26, 11.5, 0, 0, 1.5, 2.6]], { out: [0, 1, 0] }), 1.6);
  cut(E([0, -47, 72], [23, 15, 31]), 4);
  // the great hole in the base, the ear canals, the pits for the jaw's heads, the hollows over the canines' roots, the
  // small holes under the sockets and the notches in the brow's edge
  cut(E([0, -31, -13], [14.5, 9, 17.5]), 3);
  K.both(() => {
    cut(K.rod(at(68, -4.5, 0.5), at(44, -2, 3), 0.0043, 0.0036), 1.5);
    cut(E([50, -0.5, 14], [11.5, 6, 7.5]), 3);
    cut(E([27, -15, 95], [8, 9, 4.5]), 5);
    cut(E([28.5, -6.5, 91.5], [1.8, 2.4, 4]), 1);
    cut(E([24.5, 33.6, 99.5], [2, 1.7, 4]), 1);
  });
  // (after the opening is cut) the spine under it, the wall between the nostrils and the scrolls on the side walls
  put(S([0, -23, 103], [0, -19.5, 111], { w: 1.8, d: 1.6, t0: [3, 2.4], t1: [0.7, 0.6], out: [0, 1, 0] }), 2);
  put(K.box(at(0.6, -7, 86), mm(0.9, 17, 15), 0.0006), 1.5);
  K.both(() => {
    put(E([9.5, -15, 88], [3.6, 5, 15]), 2.5);
    put(E([6.5, 0, 84], [2.4, 6.5, 12]), 2);
    put(E([19.5, -33, 100], [3.2, 9, 2.4]), 4);                                 // the ridge over the canine's root
    // the wings of bone behind the upper jaw, down from the skull's base
    put(K.box(at(24, -22, 43), mm(1.3, 15, 7.5), 0.0012, [[0.9, 0, 0.42], [0, 1, 0]]), 2.5);
    put(K.box(at(13.5, -23, 43), mm(1.2, 15, 6), 0.001), 2.5);
  });
}

// ── the lower jaw ────────────────────────────────────────────────────────────────────────────────────────────────────
// The arch of each row of teeth, seen from above, from the middle back: [x, z]; each tooth stands where the ones
// before it end (their lengths along the row), so neighbours touch.
const ARCH = {
  U: [[0, 105.5], [8.5, 103.5], [16.5, 99], [21.5, 92.5], [24.5, 85.5], [27, 77], [29, 67], [30.5, 57], [31, 48]],
  L: [[0, 102.3], [6.5, 101], [12.5, 98], [17.5, 93], [21, 86.5], [24, 78], [26.6, 68], [28.8, 58], [30, 48]],
};
/** Where the teeth meet, at z: the row rises towards the back (ten degrees). */
const bite = (z) => -53.6 + (107 - z) * 0.178;

function mandible(K) {
  K.bone('mandible', 'jaw');
  const E = (c, r, R) => K.egg(at(...c), mm(...r), R);
  const S = (a, b, o) => K.strand(at(...a), at(...b), { ...o, w: o.w / 1000, d: o.d / 1000, t0: o.t0 && mm(...o.t0), t1: o.t1 && mm(...o.t1), bend: (o.bend ?? 0) / 1000 });
  const put = (sol, k) => K.put(sol, k / 1000), cut = (sol, k) => K.cut(sol, k / 1000);
  // the body: a tall band round the arch from each branch to the chin, thicker along its foot; its top the ridge that
  // holds the teeth. Its middle line, seen from above: [x, z]
  const mid = [[0, 97.5], [10, 96], [19, 91.5], [25.5, 83], [30.5, 72], [35.5, 60], [41.5, 49], [46, 40]];
  const top = (z) => -62.4 + (101 - z) * 0.236, foot = (z) => -93.5 + (97 - z) * 0.346;
  K.both(() => {
    const pts = spline(mid.map(([x, z]) => [x, (top(z) + foot(z)) / 2, z]), 3);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], m = lerp(a, b, 0.5), h = (top(m[2]) - foot(m[2])) / 2, t = norm([b[0] - a[0], 0, b[2] - a[2]]), out = [t[2], 0, -t[0]];
      put(S(a, b, { w: h, d: 5.6, t0: [(top(a[2]) - foot(a[2])) / 2, 5.6], t1: [(top(b[2]) - foot(b[2])) / 2, 5.6], out }), 3);
      // its foot, rounder and thicker than the ridge above
      put(S([a[0], foot(a[2]) + 6.5, a[2]], [b[0], foot(b[2]) + 6.5, b[2]], { w: 6.2, d: 6.6, t0: [6.2, 6.6], t1: [6.2, 6.6], out }), 4);
    }
    // the branch: a blade up from the angle, its head on a neck behind, the coronoid's point in front, the notch between
    put(K.plate(at(48, -35, 26), [[-0.13, 0, 0.99], [0.02, 1, 0]], [[-16, 30], [-12.5, 32.3], [-8.5, 31.5], [-6.5, 26], [-3, 19], [3, 16], [9, 19.5], [13, 24], [16, 20], [16.5, 8], [17, -4], [21, -14], [28, -19], [28, -44], [10, -37.5], [-8, -31], [-14.5, -27], [-15.5, -14], [-14.5, 2], [-14, 16], [-15.5, 24]].map(([u, v]) => mm(u, v)),
      { tc: 0.0026, te: 0.0031, ramp: 0.008, smooth: 2 }), 4);
    put(E([50, -6.8, 15], [10, 4.6, 4.6], [[0.96, 0, -0.27], [0, 1, 0]]), 3);    // its head, long across
    put(E([43.5, -57, 54], [3.4, 9, 9], [[1, 0, 0.35], [0, 1, -0.5]]), 6);      // where its front edge runs down onto the body
    put(E([49.5, -60, 16.5], [3.2, 9, 8]), 5);                                  // the angle, turned a little outwards
    cut(E([25.5, -74.5, 86.5], [1.5, 1.5, 3], [[1, 0, 0.6], [0, 1, 0]]), 0.8);  // the small hole below the premolars
    put(E([11, -88.5, 98.5], [6, 4.5, 4.5]), 5);                                // the chin's corner
  });
  put(E([0, -85, 99.5], [9, 8, 5.5]), 6);                                       // the chin
  cut(E([0, -73, 104.5], [14, 6, 3.2]), 5);                                     // the hollow between the chin and the teeth
}

// ── the teeth ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A side's eight teeth, from the middle back: [how long along the row, how thick across it, the crown's height, kind]
// (kind: 0 a cutting tooth, 1 the canine, 2 a premolar, 3 a molar). Wheeler's "Dental anatomy" means, as remembered.
const TEETH = {
  U: [[8.6, 7, 10.8, 0], [6.6, 6.2, 9.6, 0], [7.6, 8, 10.4, 1], [7, 9, 8.2, 2], [6.6, 9, 7.6, 2], [10.2, 11.2, 7.2, 3], [9.6, 11, 7, 3], [8.6, 10.2, 6.5, 3]],
  L: [[5.3, 6, 9, 0], [5.9, 6.4, 9.4, 0], [6.9, 7.6, 10.8, 1], [7, 7.8, 8.4, 2], [7.2, 8.2, 8, 2], [11, 10.3, 7.5, 3], [10.5, 10, 7, 3], [10, 9.6, 6.8, 3]],
};

function teeth(K) {
  for (const [jaw, rig, dir] of [['U', 'head', -1], ['L', 'jaw', 1]]) {
    // the arch as a fine line, and how far along it each point is
    const line = spline(ARCH[jaw].map(([x, z]) => [x, 0, z]), 8), far = [0];
    for (let i = 1; i < line.length; i++) far.push(far[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][2] - line[i - 1][2]));
    const where = (d) => { let i = 1; while (i < line.length - 1 && far[i] < d) i++; const t = (d - far[i - 1]) / (far[i] - far[i - 1]), p = lerp(line[i - 1], line[i], t), g = norm(sub(line[i], line[i - 1])); return { x: p[0], z: p[2], t: g }; };
    let gone = 0; const row = TEETH[jaw].map(([len]) => { const w = where(gone + len / 2); gone += len; return w; });
    K.pair((side) => {
      row.forEach(({ x, z, t }, i) => {
        const [len, thick, tall, kind] = TEETH[jaw][i];
        K.bone(`tooth.${jaw}${i + 1}.${side}`, rig, PART.teeth);
        // the tooth's own frame: along the row (t, backwards), outwards across it (o); its long axis from the root to
        // the edge (the front teeth lean forwards)
        const o = norm([-t[2], 0, t[0]]);
        const lean = kind < 2 ? (jaw === 'U' ? 0.36 : 0.24) : kind === 2 ? 0.08 : 0.03, ax = norm([o[0] * Math.sin(lean), dir * Math.cos(lean), o[2] * Math.sin(lean)]);
        // where the crown ends: the cutting teeth of the upper row overlap the lower's
        const edgeY = bite(z) + (kind < 2 ? (jaw === 'U' ? -1.6 : 1.2) : 0), neck = [x, edgeY - dir * tall, z], h = tall / 1000, L = len / 2000, T = thick / 2000;
        const base = add(at(...neck), mul(ax, -0.006)), tip = add(at(...neck), mul(ax, h));   // 6 mm of root in the bone
        const sec = (f, wl, wt, n = 2.6) => [L * wl, L * wl, T * wt, T * wt * f, 0, 0, n, n];
        if (kind === 0) {
          // a cutting tooth: round at the neck, widest near its edge, there thinned to a blade
          K.put(K.loft(base, tip, [sec(1, 0.6, 0.72), sec(1, 0.74, 0.94), sec(0.95, 0.96, 0.88), sec(0.8, 1.03, 0.56), sec(0.7, 1, 0.2)], { out: o, caps: 0.5 }), 0.0003);
        } else if (kind === 1) {
          // the canine: stout, its edge drawn to a point
          K.put(K.loft(base, tip, [sec(1, 0.62, 0.7), sec(1, 0.8, 0.94), sec(1, 1, 1), sec(0.9, 0.86, 0.8), sec(0.8, 0.34, 0.36)], { out: o, round: [0, 0.0022] }), 0.0003);
        } else {
          // a grinding tooth: a rounded block, bulging below its top; its cusps, the furrow between them
          K.put(K.loft(base, tip, [sec(1, 0.7, 0.66, 2.4), sec(1, 0.86, 0.84, 2.6), sec(1, 1, 1, 2.8), sec(1, 0.94, 0.9, 3)], { out: o, round: [0, 0.0016] }), 0.0003);
          const up = mul(ax, 1), side1 = cross(ax, o), cusp = (a, b, r, lift) => K.put(K.ball(add(add(tip, mul(side1, a * L)), add(mul(o, b * T), mul(up, lift))), r), 0.0009);
          if (kind === 2) { cusp(0, 0.42, 0.0021, -0.0013); cusp(0, -0.45, 0.0019, -0.0017); }
          else for (const [a, b] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) cusp(a, b, 0.0024, -0.0017);
          K.cut(K.rod(add(add(tip, mul(side1, -0.8 * L)), mul(up, 0.0003)), add(add(tip, mul(side1, 0.8 * L)), mul(up, 0.0003)), 0.0008), 0.0006);
          if (kind === 3) K.cut(K.rod(add(add(tip, mul(o, -0.7 * T)), mul(up, 0.0003)), add(add(tip, mul(o, 0.7 * T)), mul(up, 0.0003)), 0.0007), 0.0006);
        }
      });
    });
  }
}

// ── the hyoid: the small horseshoe under the jaw, held by muscles alone ─────────────────────────────────────────────
function hyoid(K) {
  K.bone('hyoid', 'neck2');
  const S = (a, b, o) => K.strand(at(...a), at(...b), { ...o, w: o.w / 1000, d: o.d / 1000, t0: o.t0 && mm(...o.t0), t1: o.t1 && mm(...o.t1) });
  K.put(S([-10, -85, 27], [10, -85, 27], { w: 5, d: 2.2, t0: [4.4, 2.2], t1: [4.4, 2.2], out: [0, 0, 1] }), 0.002);
  K.both(() => {
    K.put(S([9, -85, 27], [20, -79, -1], { w: 1.9, d: 1.6, t0: [2.6, 2], t1: [1.3, 1.2], out: [1, 0, 0] }), 0.002);
    K.put(S([10, -82, 26], [12, -76, 23], { w: 1.1, d: 1, out: [1, 0, 0] }), 0.001);
  });
}
