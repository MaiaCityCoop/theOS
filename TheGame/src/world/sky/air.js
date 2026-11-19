// The clear air over the land (intent 0038): the sky's light worked out from where the sun (or the moon) stands, as
// numbers on the page's thread, no pass of the GPU's: single scattering by the air's molecules (Rayleigh) and its
// aerosols (Mie), through the ozone that only absorbs, over a round Earth whose shadow the light past sunset falls
// through (Bruneton & Neyret 2008, Hillaire 2020: its layers and their densities; the aerosols' forward scattering
// Henyey–Greenstein's, with their measured asymmetry). Every light here is a share of its source's own at the top of the air, a channel
// each (680, 550 and 440 nm: src/world/light/physics.js); the sky's along a way is that share per steradian times π,
// as the light's numbers take a surface's (src/world/light.js: what a white plane under it shows).
//
//   through(alt)     what of a source's light reaches the ground, it `alt` radians up ([r, g, b]; 0 under the horizon)
//   skyOf(alt)       the sky's light from a source alt radians up (scattered once, and more: Hillaire's): { at(el, turn), ground }, along the way el radians
//                    up and `turn` radians round from the source's side; and what it gives open ground, a plane facing up
//   ROWS, rowEl(y)   the heights the sky is worked out at, a row each, finest at the horizon (the sky's texture: sky.js)
//   GROUND_EXTINCTION   what a metre of air takes of the light at the ground (the haze: src/world/light.js)
// Plain JS, no three.
import { EARTH, RAYLEIGH, AEROSOL, OZONE, SUN_DIAMETER } from '../light/physics.js';

const R0 = EARTH.radius, R1 = EARTH.top, TOP = R1 - R0, C3 = [0, 1, 2], NM = [680, 550, 440];
// how finely it is all worked out, from two of the air's own sizes: a table over an angle (its entries at the square of
// their share of it: finest at its start) as finely there as half the sun's width, the step a source moves by before
// the sky is worked out again (src/world/sky.js); a table over the air's height (likewise) as finely at the ground as
// the aerosols' height, what they thin by; and a way through the air in as many steps (likewise) as keep each no longer
// than that height where the aerosols thin
const sidesOver = (span) => Math.ceil(Math.sqrt(span / (SUN_DIAMETER / 2))), HEIGHTS = Math.ceil(Math.sqrt(TOP / AEROSOL.height)) + 1;
const stepsAlong = (d) => Math.ceil(2 * Math.sqrt(d / AEROSOL.height));
// the aerosols, a channel each: their albedo and asymmetry at its wavelength (between the measured ones, by the
// wavelength), their extinction a metre at sea level (their optical depth by Ångström's law over the height they thin
// by) and what of it they scatter
const between = (ys, l) => { const { nm } = AEROSOL.measured; let i = 0; while (i < nm.length - 2 && l > nm[i + 1]) i++; return ys[i] + ((ys[i + 1] - ys[i]) * (l - nm[i])) / (nm[i + 1] - nm[i]); };
const MIE_G = NM.map((l) => between(AEROSOL.measured.g, l)), MIE_EXT = NM.map((l) => (AEROSOL.depth440 * (l / 440) ** -AEROSOL.angstrom) / AEROSOL.height);
const MIE_SCA = MIE_EXT.map((e, c) => e * between(AEROSOL.measured.albedo, NM[c]));
/** What a metre of air takes of the light at the ground, a channel each: the haze between the eye and what it sees
    (src/world/light.js airOf). */
export const GROUND_EXTINCTION = C3.map((c) => RAYLEIGH.scattering[c] + MIE_EXT[c]);   // (the ozone lies far above)
/** What a metre of air takes of the light h metres up, a channel each, into out: the molecules', the aerosols', the ozone's. */
const extAt = (h, out) => {
  const r = Math.exp(-h / RAYLEIGH.height), m = Math.exp(-h / AEROSOL.height), o = Math.max(0, 1 - Math.abs(h - OZONE.peak) / OZONE.half);
  for (const c of C3) out[c] = RAYLEIGH.scattering[c] * r + MIE_EXT[c] * m + OZONE.absorption[c] * o;
  return out;
};
// a way from r metres from the Earth's middle, mu its cosine from straight up: how far it runs to the top of the air,
// and to the ground (-1: it misses it)
const toTop = (r, mu) => -r * mu + Math.sqrt(Math.max(r * r * (mu * mu - 1) + R1 * R1, 0));
const toGround = (r, mu) => { const d = r * r * (mu * mu - 1) + R0 * R0; return mu < 0 && d >= 0 ? -r * mu - Math.sqrt(d) : -1; };
// (a way's steps are finest near its start, where the air is densest: step s of n at the square of its share of it)

// ---- what comes through: from h metres up along mu to the top of the air, a table of its optical depth (h by its square
// root, mu by the square root of how far it is from level, each way: finest at the ground and at the horizon; the depth,
// not what comes through, so that between its entries it falls as the light does, exponentially), all of it where the
// way meets the ground (the Earth's shadow: SHADOW, nothing through) ----
const TH = HEIGHTS, TM = 2 * sidesOver(1) + 1, T = new Float32Array(TH * TM * 3), SHADOW = -2 * Math.log(Number.MIN_VALUE);   // (mu over -1 … 1 by the square root of its distance from level: each side a cosine's span, 1; SHADOW: a depth past which nothing of any light is left, a double's least twice over)
{
  const e = [0, 0, 0];
  for (let j = 0; j < TH; j++) for (let i = 0; i < TM; i++) {
    const h = TOP * (j / (TH - 1)) ** 2, x = (i / (TM - 1)) * 2 - 1, mu = Math.sign(x) * x * x, r = R0 + h;
    if (toGround(r, mu) >= 0) { T.fill(SHADOW, (j * TM + i) * 3, (j * TM + i) * 3 + 3); continue; }
    const d = toTop(r, mu), o = (j * TM + i) * 3, n = stepsAlong(d);
    let t0 = 0, t1 = 0, t2 = 0;
    for (let s = 0; s < n; s++) { const u = (s + 0.5) / n, t = d * u * u, dt = (2 * d * u) / n; extAt(Math.sqrt(r * r + t * t + 2 * r * t * mu) - R0, e); t0 += e[0] * dt; t1 += e[1] * dt; t2 += e[2] * dt; }
    T[o] = t0; T[o + 1] = t1; T[o + 2] = t2;
  }
}
/** What comes through from h metres up along mu to the top of the air, a channel each, into out at k (the table's,
    between its entries). */
function transmittance(h, mu, out, k = 0) {
  const fj = Math.sqrt(Math.min(Math.max(h / TOP, 0), 1)) * (TH - 1), fi = ((Math.sign(mu) * Math.sqrt(Math.min(Math.abs(mu), 1)) + 1) / 2) * (TM - 1);
  const j0 = Math.min(Math.floor(fj), TH - 2), i0 = Math.min(Math.floor(fi), TM - 2), a = fj - j0, b = fi - i0;
  const p = (j0 * TM + i0) * 3, q = p + TM * 3, w00 = (1 - a) * (1 - b), w01 = (1 - a) * b, w10 = a * (1 - b), w11 = a * b;
  for (let c = 0; c < 3; c++) out[k + c] = Math.exp(-(T[p + c] * w00 + T[p + 3 + c] * w01 + T[q + c] * w10 + T[q + 3 + c] * w11));
  return out;
}
/** What of a source's light reaches the ground, it alt radians up ([r, g, b]; 0 once it is under the horizon). */
export const through = (alt) => transmittance(0, Math.sin(alt), [0, 0, 0]);

// ---- the light scattered more than once (Hillaire 2020, its multiple scattering): at h metres up, the source mu_s from
// straight up, what the air round sends it of the source's light scattered there once, as if every order after the
// first were spread evenly (its second order, over 1 - what of an even light the air round scatters back: the sum of
// all of them); a table of it, shaped as the table of what comes through (the ground takes what falls on it, sends none
// back) ----
const MH = HEIGHTS, MM = TM, MS = new Float32Array(MH * MM * 3), MS_DIRS = TM;   // (the source's height as the table of what comes through takes a way's, mu_s by the square root of its distance from level; as many ways over the sphere)
{
  const dirs = Array.from({ length: MS_DIRS }, (_, i) => { const y = 1 - (2 * (i + 0.5)) / MS_DIRS, a = i * Math.PI * (3 - Math.sqrt(5)); return [Math.cos(a) * Math.sqrt(1 - y * y), y]; });   // (even over the sphere: Fibonacci's; [its side towards the source, its height])
  const e = [0, 0, 0], tr = [0, 0, 0], L2 = new Float64Array(MM * 3), f = [0, 0, 0];
  for (let j = 0; j < MH; j++) {
    const r = R0 + Math.max(TOP * (j / (MH - 1)) ** 2, 1); L2.fill(0); f.fill(0);
    for (const [dx, mu] of dirs) {
      // the way's air, step by step, whatever the source's height: each step's distance, radius, and what it scatters (by what lies between it and the point, times its length)
      const dg = toGround(r, mu), d = dg >= 0 ? dg : toTop(r, mu), n = stepsAlong(d), tau = [0, 0, 0], at = [];
      for (let s = 0; s < n; s++) {
        const u = (s + 0.5) / n, t = d * u * u, dt = (2 * d * u) / n, rp = Math.sqrt(r * r + t * t + 2 * r * t * mu), hp = rp - R0;
        extAt(hp, e); const er = Math.exp(-hp / RAYLEIGH.height), em = Math.exp(-hp / AEROSOL.height), k = [0, 0, 0];
        for (let c = 0; c < 3; c++) { tau[c] += e[c] * dt * 0.5; k[c] = Math.exp(-tau[c]) * (RAYLEIGH.scattering[c] * er + MIE_SCA[c] * em) * dt; f[c] += k[c]; tau[c] += e[c] * dt * 0.5; }
        at.push([t, rp, hp, k]);
      }
      for (let i = 0; i < MM; i++) {
        const x = (i / (MM - 1)) * 2 - 1, ms = Math.sign(x) * x * x, nu = Math.sqrt(1 - ms * ms) * dx + ms * mu;
        for (const [t, rp, hp, k] of at) { transmittance(hp, (r * ms + t * nu) / rp, tr); for (let c = 0; c < 3; c++) L2[i * 3 + c] += k[c] * tr[c]; }
      }
    }
    // (each way an even share of the sphere; the light scattered at each step an even phase, 1 / 4π, and so is what it scatters on)
    for (let i = 0; i < MM; i++) for (let c = 0; c < 3; c++) MS[(j * MM + i) * 3 + c] = L2[i * 3 + c] / (4 * Math.PI * MS_DIRS) / (1 - f[c] / MS_DIRS);
  }
}
/** The light scattered more than once at h metres up, the source mu_s from straight up, a channel each, into out (the
    table's, between its entries): what a metre of air there scatters of it towards the eye is its scattering times this. */
function multiple(h, mu, out) {
  const fj = Math.sqrt(Math.min(Math.max(h / TOP, 0), 1)) * (MH - 1), fi = ((Math.sign(mu) * Math.sqrt(Math.min(Math.abs(mu), 1)) + 1) / 2) * (MM - 1);
  const j0 = Math.min(Math.floor(fj), MH - 2), i0 = Math.min(Math.floor(fi), MM - 2), a = fj - j0, b = fi - i0;
  const p = (j0 * MM + i0) * 3, q = p + MM * 3, w00 = (1 - a) * (1 - b), w01 = (1 - a) * b, w10 = a * (1 - b), w11 = a * b;
  for (let c = 0; c < 3; c++) out[c] = MS[p + c] * w00 + MS[p + 3 + c] * w01 + MS[q + c] * w10 + MS[q + 3 + c] * w11;
  return out;
}

// ---- the sky: along every way from the ground, how much of the source's light the air scatters towards the eye (each
// step lit by what comes through to it from the source, dimmed by what lies between it and the eye; and by what the
// air round scatters to it more than once) ----
/** The heights the sky is worked out at (a row each, its middle at el = π/2 times its share squared: finest at the
    horizon), and the turns round from the source (a column each, its middle at π times its share squared: finest where
    the aerosols throw the source's light forward). */
export const ROWS = sidesOver(Math.PI / 2), COLS = sidesOver(Math.PI);
export const rowEl = (y) => (Math.PI / 2) * ((y + 0.5) / ROWS) ** 2;
const colTurn = (x) => Math.PI * ((x + 0.5) / COLS) ** 2;
// a row's way up, step by step, as every column of it shares it (it depends on the way's height alone): each step's
// distance t, its radius r, and what of the light it scatters, molecules' and aerosols' (a channel each, by what lies
// between it and the eye, times its length)
const WAYS = Array.from({ length: ROWS }, (_, y) => {
  const mu = Math.sin(rowEl(y)), d = toTop(R0, mu), n = stepsAlong(d), t = new Float64Array(n), r = new Float64Array(n), ray = new Float64Array(n * 3), mie = new Float64Array(n * 3), e = [0, 0, 0], tau = [0, 0, 0];
  for (let s = 0; s < n; s++) {
    const u = (s + 0.5) / n, ts = d * u * u, dt = (2 * d * u) / n, rs = Math.sqrt(R0 * R0 + ts * ts + 2 * R0 * ts * mu), h = rs - R0;
    t[s] = ts; r[s] = rs; extAt(h, e);
    const er = Math.exp(-h / RAYLEIGH.height), em = Math.exp(-h / AEROSOL.height);
    for (let c = 0; c < 3; c++) { tau[c] += e[c] * dt * 0.5; const k = Math.exp(-tau[c]) * dt; ray[s * 3 + c] = RAYLEIGH.scattering[c] * er * k; mie[s * 3 + c] = MIE_SCA[c] * em * k; tau[c] += e[c] * dt * 0.5; }
  }
  return { mu, t, r, ray, mie };
});
/** The sky's light from a source alt radians up (a share of its light, the code's numbers: per steradian times π):
    { at(el, turn) -> [r, g, b] along a way el (0 … π/2) up, turn (0 … π) round from the source's side; ground: what it
    gives open ground, [r, g, b] }. */
export function skyOf(alt) {
  const L = new Float32Array(ROWS * COLS * 3), ms = Math.sin(alt), mc = Math.cos(alt), tr = [0, 0, 0], mm = [0, 0, 0], pm = [0, 0, 0];
  const rayK = 3 / (16 * Math.PI), mieK = MIE_G.map((g) => (1 - g * g) / (4 * Math.PI));
  for (let y = 0; y < ROWS; y++) {
    const W = WAYS[y], ce = Math.sqrt(1 - W.mu * W.mu);
    for (let x = 0; x < COLS; x++) {
      const nu = mc * ce * Math.cos(colTurn(x)) + ms * W.mu, pr = rayK * (1 + nu * nu);   // (the cosine between the way and the source; its phases: Rayleigh's, and Henyey–Greenstein's a channel each)
      for (let c = 0; c < 3; c++) pm[c] = mieK[c] / (1 + MIE_G[c] * MIE_G[c] - 2 * MIE_G[c] * nu) ** 1.5;
      let l0 = 0, l1 = 0, l2 = 0;
      for (let s = 0; s < W.t.length; s++) {
        const r = W.r[s], mus = (R0 * ms + W.t[s] * nu) / r, k = s * 3; transmittance(r - R0, mus, tr); multiple(r - R0, mus, mm);
        l0 += tr[0] * (W.ray[k] * pr + W.mie[k] * pm[0]) + mm[0] * (W.ray[k] + W.mie[k]); l1 += tr[1] * (W.ray[k + 1] * pr + W.mie[k + 1] * pm[1]) + mm[1] * (W.ray[k + 1] + W.mie[k + 1]); l2 += tr[2] * (W.ray[k + 2] * pr + W.mie[k + 2] * pm[2]) + mm[2] * (W.ray[k + 2] + W.mie[k + 2]);
      }
      const o = (y * COLS + x) * 3; L[o] = l0 * Math.PI; L[o + 1] = l1 * Math.PI; L[o + 2] = l2 * Math.PI;
    }
  }
  // what it gives open ground: the light along every way up by the cosine it comes in at (each row's and column's
  // share of the sky; the turns one side of the source, the other alike)
  const ground = [0, 0, 0];
  for (let y = 0; y < ROWS; y++) {
    const el = rowEl(y), dEl = (Math.PI / 2) * (2 * (y + 0.5)) / (ROWS * ROWS);
    for (let x = 0; x < COLS; x++) {
      const dTurn = (Math.PI * 2 * (x + 0.5)) / (COLS * COLS), w = (2 * Math.sin(el) * Math.cos(el) * dEl * dTurn) / Math.PI;
      for (let c = 0; c < 3; c++) ground[c] += L[(y * COLS + x) * 3 + c] * w;
    }
  }
  const at = (el, turn) => {
    const fy = Math.sqrt(Math.min(Math.max(el, 0), Math.PI / 2) / (Math.PI / 2)) * ROWS - 0.5, fx = Math.sqrt(Math.min(Math.abs(turn), Math.PI) / Math.PI) * COLS - 0.5;
    const y0 = Math.max(0, Math.min(Math.floor(fy), ROWS - 2)), x0 = Math.max(0, Math.min(Math.floor(fx), COLS - 2)), a = Math.min(Math.max(fy - y0, 0), 1), b = Math.min(Math.max(fx - x0, 0), 1);
    const p = (y0 * COLS + x0) * 3, q = p + COLS * 3;
    return [0, 1, 2].map((c) => (L[p + c] * (1 - b) + L[p + 3 + c] * b) * (1 - a) + (L[q + c] * (1 - b) + L[q + 3 + c] * b) * a);
  };
  return { at, ground };
}
