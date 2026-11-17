// The walk of intent 0033's checks 1 and 2, on the CPU: a plant drawn as the game draws it at every size on screen from
// its near view down to where it sinks, one per cent at a time, under `?lod=old` (its file's levels) and `?lod=new` (the
// crowd kit: assets/kit/crowd.js, with its crown baked), and measured:
//   outline   the share of the picture at least half covered, against the near view's (check 1: within 5 % down to a
//             crown 20 px tall, within 15 % below)
//   cover     how much light it stops, against the near view's
//   jump      how much the picture changes from one step to the next, against the median of the ten steps round it
//             (check 2: no step more than 3 times, of those changing at least FLOOR of the picture; 'alone' where nothing
//             round it changes at all: the old levels' one
//             step between two still stretches)
//   step      how much the picture changes from one step to the next, as a share of the near view's cover
// The picture is the plant from one side, 30 degrees up (the bake's first view, so a far body wears its bake as drawn),
// in a fixed frame round the whole plant, 96 pixels a side: the same frame at every size, so what changes is the plant,
// not the frame. A card stops STOPS of the light (crowd.js), wood and an old far body all of it, a baked far body as much
// as its bake says there (as often as the crown covers it: the see-through bake, against the sky).
// What the old levels' hand-over does (between two levels both drawn over ±10 % on screen, parts growing and shrinking)
// is not drawn: each size draws the one level its band holds, so the old way's steps show as one step each; its drift
// from the near view (check 1) is what it is.
//
//   bun tools/walk.js [holmoak stonepine mastic …]   -> a table a plant and a way, and walk.json in the cwd; and a contact
//   sheet a plant (walk-<plant>.pgm in the cwd: old above, new below, at the sizes SHEET, black where it covers)
import { crowd, levelOf, LOD, CROWD, META, BAKED, bakeOf, shareAt, areaAt, grownAt, hullAt, turnedAt } from '../assets/kit/crowd.js';
import { bandsOf, shapeSize, crowdLevel } from '../assets/kit/plant.js';
import { writeFileSync } from 'node:fs';

const FLOOR = 0.01;   // (check 2 counts a step only where it changes at least this share of the picture: a hundredth of a step among still ones is no pop)
const SHEET = [400, 200, 100, 70, 56, 50, 46, 42, 38, 30, 22, 18, 14, 10, 8, 6], RES = 96, STOP = 1 - Math.sqrt(1 - 0.45);
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['holmoak', 'stonepine', 'mastic'];
const { u: U, v: V, w: W } = BAKED[0];

/** The picture of triangles (P positions, I corners, stop(t) a triangle's share of the light, or a function of the
    pixel's place in the bake's frame) in frame F { c, r }: Float32Array RES x RES of how much is covered. */
function draw(P, I, stopOf, F) {
  const T = new Float32Array(RES * RES).fill(1), k = RES / (2 * F.r), n = P.length / 3, X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = P[i * 3] - F.c[0], y = P[i * 3 + 1] - F.c[1], z = P[i * 3 + 2] - F.c[2]; X[i] = (x * U[0] + y * U[1] + z * U[2] + F.r) * k - 0.5; Y[i] = (x * V[0] + y * V[1] + z * V[2] + F.r) * k - 0.5; }
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2], s = stopOf(t / 3); if (!s) continue;
    const X0 = X[a], Y0 = Y[a], X1 = X[b], Y1 = Y[b], X2 = X[c], Y2 = Y[c];
    const x0 = Math.max(0, Math.ceil(Math.min(X0, X1, X2))), x1 = Math.min(RES - 1, Math.floor(Math.max(X0, X1, X2))), y0 = Math.max(0, Math.ceil(Math.min(Y0, Y1, Y2))), y1 = Math.min(RES - 1, Math.floor(Math.max(Y0, Y1, Y2)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const e0 = (X1 - X0) * (y - Y0) - (Y1 - Y0) * (x - X0), e1 = (X2 - X1) * (y - Y1) - (Y2 - Y1) * (x - X1), e2 = (X0 - X2) * (y - Y2) - (Y0 - Y2) * (x - X2);
      if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) { const st = typeof s === 'function' ? s(x, y) : s; T[y * RES + x] *= 1 - st; }
    }
  }
  return T.map((x) => 1 - x);
}
const measure = (C) => { let out = 0, cov = 0; for (const c of C) { if (c >= 0.5) out++; cov += c; } return { outline: out, cover: cov }; };

/** The crowd kit's plant at px (the rule as trees.js crowdRule reckons it, on the whole build). */
function crowdAt(S, L, px, F) {
  const m = S.meta, HI = m[META.HI], h = hullAt(px, m), k = Math.min(S.KMAX, Math.pow(Math.max(areaAt(shareAt(px, S.P0, S.A), m), 1e-9), -m[META.E]));
  const into = HI > 0 ? Math.min(1, Math.max(0, Math.log(HI / Math.max(px, 1e-6)) / Math.log(HI / m[META.LO]))) : 0, swap = Math.min(1, Math.max(0, (into - CROWD.SWAP[0]) / (CROWD.SWAP[1] - CROWD.SWAP[0])));   // (into its window; the wood giving way to the post)
  const n = L.count, P = new Float32Array(n * 3), shown = new Uint8Array(n), T0 = CROWD.TURN[0][1], T1 = CROWD.TURN[1][1];
  for (let v = 0; v < n; v++) {
    const b = L.body[v], g = grownAt(px, L.go[v]), p = (i) => L.position[v * 3 + i], r = (i) => L.root[v * 3 + i], tp = (i) => L.tip[v * 3 + i], to = (i) => L.to[v * 3 + i];
    if (!b && L.part[v] === 1) { for (let i = 0; i < 3; i++) { const R = tp(i) + (r(i) - tp(i)) * k, Q = tp(i) + (p(i) - tp(i)) * k; P[v * 3 + i] = R + (Q - R) * g; } shown[v] = g > 0; }
    else if (b === 4) { const tu = Math.min(1, Math.max(0, Math.log(m[META.LO] / Math.max(px, 1e-6)) / Math.log(m[META.LO] / T1))); for (let i = 0; i < 3; i++) P[v * 3 + i] = p(i) + (to(i) - p(i)) * tu; shown[v] = px < HI && px >= T1 && into > CROWD.SWAP[0]; }
    else if (b) { const j = b - 1, tu = j === 0 ? turnedAt(px, 0) : j === 1 ? turnedAt(px, 1) : 0; for (let i = 0; i < 3; i++) { const q = p(i) + (to(i) - p(i)) * tu; P[v * 3 + i] = S.bake ? q : r(i) + (q - r(i)) * h; } shown[v] = px < HI && h > 0 && (j === 0 ? px >= T0 : j === 1 ? px >= T1 && px < T0 : px < T1); }   // (baked: at its full size, coming in denser: below)
    else { for (let i = 0; i < 3; i++) P[v * 3 + i] = r(i) + (p(i) - r(i)) * g; shown[v] = (L.go[v] <= 0 || g > 0) && into < CROWD.SWAP[1]; }
  }
  const bake = S.bake, br = bake ? bake.r : 1, bk = RES / (2 * F.r), I = L.index;
  // a baked body's pixel: the bake's first view at the pixel's place (the picture's frame and the bake's share their axes)
  const baked = (x, y) => { const wx = (x + 0.5) / bk - F.r, wy = (y + 0.5) / bk - F.r, cu = wx + dot(F.c, U) - dot(S.mid, U), cv = wy + dot(F.c, V) - dot(S.mid, V), tx = Math.floor(((cu / (2 * br)) + 0.5) * bake.res), ty = bake.res - 1 - Math.floor(((cv / (2 * br)) + 0.5) * bake.res); return tx < 0 || ty < 0 || tx >= bake.res || ty >= bake.res ? 0 : seen(ty * bake.res + tx) ? bake.bytes[(ty * bake.res + tx) * 4] / 255 : 0; };
  // (a texel shows once the body has come in as far as its own fixed number: trees.js crowdDense)
  const dense = into / (1 - CROWD.DENSE + CROWD.DENSE * into + 1e-9), seen = (t) => { const x = Math.sin(t * 39.3468 + 11.1351) * 24634.6345; return x - Math.floor(x) < dense; };
  return draw(P, I, (t) => { const a = I[t * 3], b2 = I[t * 3 + 1], c = I[t * 3 + 2]; if (!shown[a] || !shown[b2] || !shown[c]) return 0; const bd = L.body[a]; return bd >= 1 && bd <= 3 && bake ? baked : L.part[a] === 1 && !bd ? STOP : bd === 4 ? swap : 1 - swap; }, F);   // (the wood and the post, as much of each as its share of the pixels: trees.js's pattern)
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The old way at px: the one level whose band holds it, whole. */
function oldAt(a, s, px, B, F, cache) {
  const f = a.detail.levels.findIndex((L) => !L.fine); let l = B.findIndex(([lo, hi]) => px >= lo && px < hi); if (l < f) l = f; if (l < 0) l = B.length - 1;
  const m = (cache[l] ??= a.rawAt(l, s));
  return draw(m.position, m.index, (t) => (m.part[m.index[t * 3]] === 1 ? STOP : 1), F);
}

const out = {};
for (const nm of names) {
  const a = (await import(`../assets/${nm}.js`)).default, s = a.shapeCount - 1, f = a.detail.levels.findIndex((L) => !L.fine), near = a.rawAt(f, s);
  let c = [0, 0, 0], r = 0; const P0 = near.position, n0 = P0.length / 3; for (let i = 0; i < n0; i++) for (let k = 0; k < 3; k++) c[k] += P0[i * 3 + k] / n0; for (let i = 0; i < n0; i++) r = Math.max(r, Math.hypot(P0[i * 3] - c[0], P0[i * 3 + 1] - c[1], P0[i * 3 + 2] - c[2]));
  const F = { c, r: r * 1.15 }, ref = measure(draw(P0, near.index, (t) => (near.part[near.index[t * 3]] === 1 ? STOP : 1), F));
  Object.assign(LOD, { on: true, BAKE: true, FAR: 40 }); const S = crowd(near, { size: shapeSize(a, s), CARD: LOD.CARD, KMAX: LOD.KMAX, FAR: LOD.FAR, enclose: 1.05 }); S.bake = bakeOf(S);
  const sheet = [], L = levelOf(S, 0, Infinity), B = (() => { LOD.on = false; const b = bandsOf(a); return b; })(), cache = {};
  const last = B.at(-1)[0], sink = 1.7, pxs = []; for (let px = 600; px >= last / 1.6; px /= 1.01) pxs.push(px);
  for (const way of ['old', 'new']) {
    const rows = [], pics = [];
    for (const px of pxs) {
      let C = way === 'old' ? oldAt(a, s, px, B, F, cache) : crowdAt(S, L, px, F);
      const sunk = px < last * sink ? Math.max(0, Math.min(1, (px - last) / (last * sink - last))) : 1;   // (the last level sinking: lower and narrower, as handover.js)
      if (sunk < 1) { const g = sunk * sunk * (3 - 2 * sunk); C = C.map((x) => x * g); }
      const M = measure(C); pics.push(C); rows.push({ px: +px.toFixed(2), outline: M.outline / ref.outline, cover: M.cover / ref.cover });
    }
    const diff = pics.map((C, i) => { if (!i) return 0; let d = 0; for (let j = 0; j < C.length; j++) d += Math.abs(C[j] - pics[i - 1][j]); return d; });
    rows.forEach((row, i) => {
      const nb = []; for (let j = Math.max(1, i - 5); j <= Math.min(diff.length - 1, i + 5); j++) if (j !== i) nb.push(diff[j]);
      nb.sort((x, y) => x - y); const med = nb.length ? nb[nb.length >> 1] : 0;
      row.jump = med > 0 ? diff[i] / med : diff[i] > 0 ? Infinity : 0; row.diff = diff[i]; row.step = diff[i] / ref.cover;
    });
    const worst = (lo, hi, k) => Math.max(...rows.filter((x) => x.px >= lo && x.px < hi).map((x) => Math.abs(x[k] - 1)));
    const jumps = rows.filter((x) => x.jump > 3 && x.step >= FLOOR).sort((x, y) => y.jump - x.jump);
    const big = [...rows].sort((x, y) => y.step - x.step).slice(0, 3), x3 = (x) => (x.jump === Infinity ? 'alone' : `${x.jump.toFixed(1)}x`);
    console.log(`${nm} ${way}: outline off by at most ${(worst(20, 601, 'outline') * 100).toFixed(0)} % (20 px and up), ${(worst(last * sink, 20, 'outline') * 100).toFixed(0)} % below; cover ${(worst(20, 601, 'cover') * 100).toFixed(0)} % / ${(worst(last * sink, 20, 'cover') * 100).toFixed(0)} %; steps over 3x their neighbours: ${jumps.length}${jumps.length ? ` (${jumps.slice(0, 6).map((x) => `${x3(x)} at ${x.px} px`).join(', ')})` : ''}; largest steps ${big.map((x) => `${(x.step * 100).toFixed(1)} % at ${x.px} px`).join(', ')}`);
    (out[nm] ??= {})[way] = rows;
    sheet.push(SHEET.map((x) => pics[pxs.reduce((b, p, i) => (Math.abs(Math.log(p / x)) < Math.abs(Math.log(pxs[b] / x)) ? i : b), 0)]));
  }
  // the contact sheet: a row a way, a picture a size, a pixel's grey how little it covers
  const Wd = SHEET.length * (RES + 4), Hd = 2 * (RES + 4), img = new Uint8Array(Wd * Hd).fill(255);
  sheet.forEach((row, r) => row.forEach((C, c) => { for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) img[(r * (RES + 4) + 2 + y) * Wd + c * (RES + 4) + 2 + x] = Math.round(255 * (1 - C[(RES - 1 - y) * RES + x])); }));
  writeFileSync(`walk-${nm}.pgm`, Buffer.concat([Buffer.from(`P5 ${Wd} ${Hd} 255\n`), Buffer.from(img)]));
}
writeFileSync('walk.json', JSON.stringify(out));
