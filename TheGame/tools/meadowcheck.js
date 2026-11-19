// The meadow's hand-over from its blades to the land's carpet, checked on the CPU (intent 0038): `bun tools/meadowcheck.js`.
// No GPU. Over the BAND under their end the blades thin (src/scatter/grass.js endOf), and past it the carpet carries the
// meadow (src/terrain/material.js). Against the meadow as it would be drawn whole all the way (every blade, the floor
// between them), at distances through the hand-over and past it, for a walker's eye (1.7 m up) and one over the land:
//   cover    the share of a pixel the blades cover (their projected cover: 1 - e^-τ, τ their optical depth along the
//            eye's way, src/scatter/grass.js opticsOf): whole, as main draws them (the kept as they are), and now (the
//            kept widened for the gone, grownOf, never past the dial); and the share of it the carpet carries now
//   colour   what the eye sees there, blades and what shows between them, as main and now draw it, over the whole
//            meadow's: its blades' light ray by ray (each blade's own normal, turned to the eye and softened as
//            bladeMaterial shades it, lit as the one light lights it, src/world/light.js lightOn), the floor lit as the
//            ground is; the carpet's as the land's light lights it (landLight: main, over the ground's normal; now, over
//            the blades' normals' moments, meadowLight), the sun 30° up towards the eye's way, across it and behind it.
//            Exit 1 where now is off the whole meadow by more than TOLERANCE anywhere
// The shaders' formulas are written here again as numbers, constant for constant (valueUp, underShade, meadowSeen,
// bladeLight, lightOn's terms, the land's); what the game has as numbers it is asked for (opticsOf, ringsOf, bandsOf,
// normalsOf, the sky's light: src/world/sky/air.js).
import './glob.js';

const { opticsOf, ringsOf, bandsOf, normalsOf } = await import('../src/scatter/grass.js');
const { through, skyOf } = await import('../src/world/sky/air.js');
const { BAND } = await import('../src/detail/error.js');
const grass = (await import('../assets/grass.js')).default;

const TOLERANCE = 0.04;   // (a step of light across a large field the eye tells apart, Weber's fraction at daylight, 1-2% (Konig and Brodhun 1889, as Hecht 1924, J. Gen. Physiol. 7: 235-267); held to twice its upper end for this model of the meadow's light)   source: Hecht 1924
const Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the shaders' numbers (src/scatter/grass.js, src/terrain/material.js, src/world/light.js) ----
const valueUp = (t) => 0.14 + (1.45 - 0.14) * t * (t * 0.4 + 0.6);
const underShade = (valueUp(0.25 - 0.25 / Math.sqrt(3)) + valueUp(0.25 + 0.25 / Math.sqrt(3))) / 2 / valueUp(1);
const R0 = grass.tiers?.[0] ?? ringsOf(grass)[0], OPT = opticsOf(grass.height, R0);
const tauOf = (sy, cover) => cover * (OPT[0] / (Math.max(sy, 1e-3) / Math.sqrt(Math.max(1 - sy * sy, 1e-6))) + OPT[1]);
/** meadowSeen: { shade, blade, t, hit } of a field of blades of optical depth τ: now, valueUp's mean over the depths met
    and the height its value weighs (the exponential's moments); main, both at the mean depth. */
const seenOf = (tau, now = true) => {
  const t0 = Math.max(tau, 1e-4), hit = 1 - Math.exp(-t0), q = Math.exp(-t0);
  if (!now) { const depth = t0 < 0.05 ? 0.5 - t0 / 12 : 1 / t0 - q / hit, t = Math.min(1, Math.max(0, 1 - depth)), blade = (hit * valueUp(t)) / valueUp(1); return { shade: blade + (1 - hit) * underShade, blade, t, hit }; }
  const Ey = [1, 2, 3].map((k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; let p = 0, term = 1; for (let i = 0; i <= k; i++) { p += term; term *= t0 / (i + 1); } return t0 < 0.05 ? 1 / (k + 1) - t0 / (k + 2) : (f * (1 - q * p)) / (t0 ** k * hit); });   // (E[y^k]: k! (1 - e^-τ Σ τ^i / i!) / (τ^k (1 - e^-τ)))
  const B = -(1.45 - 0.14) * (0.6 + 0.8), C = (1.45 - 0.14) * 0.4, v = 1.45 + B * Ey[0] + C * Ey[1], tv = 1.45 + (B - 1.45) * Ey[0] + (C - B) * Ey[1] - C * Ey[2];
  const t = Math.min(1, Math.max(0, tv / v)), blade = (hit * v) / 1.45;
  return { shade: blade + (1 - hit) * underShade, blade, t, hit };
};
/** lightOn's light on a colour 1 (its sky and sun, and its highlight), as lit takes it: a blade's numbers (bladeLight), or
    the land's (ground: its own sky and Lambert sun, no highlight dry). */
const lightOf = ({ n, ns = n, ndl, t, ground }, K) => {
  const { L, V, sun, amb, floor } = K, back = Math.max(-dot(V, L), 0);
  const skyK = ground ? 1 : 0.45 * t + 0.55, sky = amb.map((a, c) => (a * (0.68 + 0.32 * n[1]) + floor[c] * (sun[c] * Math.max(L[1], 0) + a) * (0.5 - 0.5 * n[1])) * skyK);
  if (ground) return Y(sky.map((x, c) => x + sun[c] * Math.max(dot(n, L), 0)));
  const tint = [0.5, 1, 0.22], tt = (back ** 2 * 0.65 + Math.max(-dot(n, L), 0) * 0.35) * t, H = unit([V[0] + L[0], V[1] + L[1], V[2] + L[2]]);
  return Y(sky.map((x, c) => x + sun[c] * (ndl + tint[c] * tt))) + Y(sun.map((s) => s * Math.max(dot(ns, H), 0) ** K.sharp * K.gloss(t)));
};
const bladeNdl = (n, L) => { const hl = dot(n, L) * 0.5 + 0.5; return hl * hl * 1.1; };

/** shadedAt: of a blade met at depth x, where those left out (optical depth `gone`) would have stood before it as often
    as 1 - e^-(gone x): its value, the mean of its own and theirs (met as the exponential cut at x says), and the height
    its light is had at, as their values weigh them. */
const Ey = (tau) => [1, 2, 3].map((k) => { const t0 = Math.max(tau, 1e-6), q = Math.exp(-t0); if (t0 < 0.05) return 1 / (k + 1) - t0 / (k + 2); let f = 1; for (let i = 2; i <= k; i++) f *= i; let p = 0, term = 1; for (let i = 0; i <= k; i++) { p += term; term *= t0 / (i + 1); } return (f * (1 - q * p)) / (t0 ** k * (1 - q)); });
const standIn = (t, x, gone) => {
  const gx = gone * x, front = 1 - Math.exp(-gx); if (front < 1e-6) return { value: valueUp(t), t };
  const [z1, z2, z3] = Ey(gx), y1 = z1 * x, y2 = z2 * x * x, y3 = z3 * x ** 3, B = -(1.45 - 0.14) * 1.4, C = (1.45 - 0.14) * 0.4;
  const theirs = 1.45 + B * y1 + C * y2, theirsT = 1.45 + (B - 1.45) * y1 + (C - B) * y2 - C * y3, value = (1 - front) * valueUp(t) + front * theirs;   // (their value, and value times height, over where they would be met)
  return { value, t: ((1 - front) * valueUp(t) * t + front * theirsT) / value };
};
/** Blades of optical depth τ seen ray by ray: the mean light (colour 1) of what the eye's ways meet of them, each at the
    height it meets it (the exponential's depth into their layer: meadowSeen) on a blade as bladeMaterial draws it (its
    heading, bend, the side of it turned to the eye, rounded and softened), each seen as much as it faces the eye; over
    the depths' distribution and the blades' own at their midpoints (no noise). gone: the optical depth of those left
    out, as shadedAt takes it (each shaded as high as one of them before it would have been met). */
function bladesLit(tau, K, { gone = 0 } = {}) {
  const D = 16, A = 32, Q = 4; let all = 0;
  for (let y = 0; y < D; y++) {   // (the depths met, each as likely: the exponential's; at each, which blade by how much of it faces the eye)
    let sum = 0, w = 0;
    for (let a = 0; a < A; a++) for (let i = 0; i < Q; i++) for (let j = 0; j < Q; j++) for (let k = 0; k < Q; k++) {
    const u = (y + 0.5) / D, x = tau > 1e-6 ? -Math.log(1 - u * (1 - Math.exp(-tau))) / tau : u, t = Math.min(1, Math.max(0, 1 - x));
    const ang = ((a + 0.5) / A) * 2 * Math.PI, dx = Math.cos(ang), dz = Math.sin(ang), bend = 0.2 + 0.55 * ((i + 0.5) / Q) + 0.35 * ((j + 0.5) / Q), across = ((k + 0.5) / Q) * 2 - 1;
    const tg = unit([dx * 2 * bend * t, 1 - 0.6 * bend * t, dz * 2 * bend * t]), sd = [-dz, 0, dx], N = [sd[1] * tg[2] - sd[2] * tg[1], sd[2] * tg[0] - sd[0] * tg[2], sd[0] * tg[1] - sd[1] * tg[0]];
    const n0 = unit([N[0] + sd[0] * across * 0.6, N[1], N[2] + sd[2] * across * 0.6]), face = dot(N, K.V) > 0 ? 1 : -1, nn = unit([n0[0] * face, n0[1] * face + 1.4, n0[2] * face]);
    const S = standIn(t, x, gone), seen = Math.abs(dot(unit(N), K.V)), value = S.value / valueUp(1);
    sum += seen * value * lightOf({ n: nn, ndl: bladeNdl(nn, K.L), t: S.t }, K); w += seen;
    }
    all += sum / w / D;
  }
  return all;
}
/** The carpet's light (colour 1) at t up the blades: main's (bladeLight over the ground's normal) or now's (meadowLight:
    over the normals' moments, at the height of the eye's way). */
const MOM = normalsOf(grass.height, R0), rowAt = (sy) => { const el = Math.asin(Math.min(1, Math.max(0, sy))), y = Math.min(MOM.length - 1, Math.max(0, Math.sqrt(el / (Math.PI / 2)) * MOM.length - 0.5)), i = Math.min(Math.floor(y), MOM.length - 2), f = y - i; return MOM[i].map((r, k) => r.map((x, j) => x + (MOM[i + 1][k][j] - x) * f)); };
function carpetLit(t, K, now) {
  if (!now) return lightOf({ n: [0, 1, 0], ndl: bladeNdl([0, 1, 0], K.L), t }, K);
  const [[mh, my, hh, cc], [yy, hy, sharp, k], [ty, tm]] = rowAt(K.V[1]), hn = unit([K.V[0], 0, K.V[2]]), lh = K.L[0] * hn[0] + K.L[2] * hn[2], lc = -K.L[0] * hn[2] + K.L[2] * hn[0];
  const m = [hn[0] * mh, my, hn[2] * mh], nl2 = hh * lh * lh + cc * lc * lc + yy * K.L[1] * K.L[1] + 2 * hy * lh * K.L[1], n = [m[0], (0.45 * ty + 0.55 * my) / (0.45 * tm + 0.55), m[2]];
  return lightOf({ n, ns: unit(m), ndl: (0.25 + 0.5 * dot(m, K.L) + 0.25 * nl2) * 1.1, t }, { ...K, sharp, gloss: (tt) => 0.16 * tt * k });
}

/** The meadow at `d` metres, seen from `eye` metres up, as one of: whole (every blade drawn as it is all the way), main
    (main's hand-over), now. -> { cover: the blades', carry: the carpet's share of the meadow, L: what the eye sees } */
function meadowAt(d, eye, end, Kd, how, K) {
  const sy = eye / Math.hypot(d, eye), tau = tauOf(sy, 1), s = how === 'whole' ? 1 : 1 - smooth(end / BAND, end, d);
  // (the kept blades' growth: grownOf, held to the dial (its edge's move under a dial pixel's metres there, d / Kd), each
  // by its own width: r1 even over 0 … 1)
  const grow = (w) => (how === 'now' ? Math.min(1 / Math.max(s, 1e-3), d / Kd / w + 1) : 1), W = R0.w, widths = Array.from({ length: 8 }, (_, i) => W * (0.75 + 0.5 * ((i + 0.5) / 8)));
  const kept = (s * widths.reduce((a, w) => a + grow(w) * w, 0)) / widths.reduce((a, w) => a + w, 0), stands = Math.min(1, how === 'now' ? s * grow(W) : s);   // (kept: their optical depth's share; stands: what the carpet takes them to stand for)
  const cb = 1 - Math.exp(-kept * tau), lit = bladesLit(kept * tau, K, how === 'now' ? { gone: (1 - stands) * tau } : {});   // (now: each shaded as high as a blade left out before it would have been met: shadedAt)
  // the floor between them: the carpet (its cover, under the blades 0.82 of the map's, mix to what it is past them,
  // laid: the map's all 1 here), the soil the rest; what shows of it: main, their gone share's look mixed in by s,
  // lit by the blades' light by cv (1 - s); now, what the gone would have shown (meadowSeen of cover cv (1 - stands)),
  // lit as they are by the colour's share that is theirs
  const cv = 0.82 + (1 - 0.82) * (1 - stands), col = K.soil * (1 - cv) + K.tint * cv;
  const ground = lightOf({ n: [0, 1, 0], ground: true }, K);
  let floor;
  if (how === 'now') {
    const seen = seenOf(cv * (1 - stands) * tau), c = col * (1 - cv + cv * seen.shade), share = (cv * seen.blade) / Math.max(1e-4, 1 - cv + cv * seen.shade);
    floor = c * ((1 - share) * ground + share * carpetLit(seen.t, K, true));
  } else {
    const seen = seenOf(cv * tau, false), c = col * (1 - cv + cv * (seen.shade * (1 - stands) + underShade * stands)), share = cv * (1 - stands);
    floor = c * ((1 - share) * ground + share * carpetLit(seen.t, K, false));
  }
  return { cover: cb, carry: 1 - stands, L: cb * K.tint * lit + (1 - cb) * floor };
}

// ---- the tables ----
/** The tables, at rest (1440 pixels drawn high, the dial 1), a meadow of a mid-green over a dry earth (their luminance:
    what the floor's share weighs); said, and failed on past TOLERANCE. -> how many places failed */
function tables() {
  const Kd = 1440 / (2 * Math.tan((34 * Math.PI) / 180)), end = bandsOf(ringsOf(grass), grass.height, Kd).end;   // (the measure at rest: 1440 pixels drawn high, the dial 1)
  const tint = 0.18, soil = 0.14;   // (the meadow's tips and the soil, a mid-green and a dry earth's luminance: what the floor's share weighs)
  const keysOf = (altD, azD, V) => {
    const alt = (altD * Math.PI) / 180, az = (azD * Math.PI) / 180, L = unit([-Math.cos(alt) * Math.cos(az), Math.sin(alt), Math.cos(alt) * Math.sin(az)]);   // (az 0: the sun beyond what is seen, the eye looking towards it)
    return { L, V, sun: through(alt), amb: skyOf(alt).ground, floor: [0.06, 0.08, 0.04], sharp: 20, gloss: (t) => 0.16 * t, tint, soil };
  };
  const AT = [0.5, 0.6, 1 / BAND, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.2];
  let worst = 0, worstMain = 0, failed = 0;
  console.log(`the meadow's hand-over at rest (1440 pixels drawn high): its blades thin from ${(end / BAND).toFixed(0)} m to their end at ${end.toFixed(0)} m`);
  for (const [who, eye] of [['a walker', 1.7], ['over the land', 30]]) {
    console.log(`\n${who}, ${eye} m up: cover (whole · main · now), the carpet's share now; what the eye sees, main · now over whole (sun 30° up: towards · across · behind)`);
    for (const f of AT) {
      const d = end * f, cells = [];
      for (const az of [0, 90, 180]) {
        const sy = eye / Math.hypot(d, eye), V = unit([Math.sqrt(1 - sy * sy), sy, 0]), K = keysOf(30, az, V);
        const W = meadowAt(d, eye, end, Kd, 'whole', K), M = meadowAt(d, eye, end, Kd, 'main', K), N = meadowAt(d, eye, end, Kd, 'now', K);
        const m = M.L / W.L, n = N.L / W.L; worst = Math.max(worst, Math.abs(n - 1)); worstMain = Math.max(worstMain, Math.abs(m - 1));
        if (Math.abs(n - 1) > TOLERANCE) failed++;
        cells.push({ m, n, W, M, N });
      }
      const c = cells[0];
      console.log(`  ${(d).toFixed(0).padStart(4)} m (${f.toFixed(2)} of the end): cover ${c.W.cover.toFixed(3)} · ${c.M.cover.toFixed(3)} · ${c.N.cover.toFixed(3)}, carpet ${c.N.carry.toFixed(2)};  seen ${cells.map((x) => `${x.m.toFixed(3)} · ${x.n.toFixed(3)}`).join(';  ')}`);
    }
  }
  console.log(`\nmain, at its worst, ${(worstMain * 100).toFixed(1)}% off the whole meadow; now ${(worst * 100).toFixed(1)}% (held to ${TOLERANCE * 100}%)`);
  console.log(failed ? `meadowcheck: ${failed} places off by more than ${TOLERANCE * 100}%` : 'meadowcheck: the meadow seen alike either side of where its blades end');
  return failed;
}
process.exit(tables() ? 1 : 0);
