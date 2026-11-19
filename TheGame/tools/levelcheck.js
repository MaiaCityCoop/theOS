// Whether the level of the land's pages a pixel reads goes on smoothly across the edges of the land's triangles,
// checked on the CPU (intent 0038): `bun tools/levelcheck.js`. No GPU. A pixel of the land reads the level its
// footprint calls for (src/terrain/pages.js footprint: rawOf here), from the steps between its point and its
// neighbouring pixels' (src/terrain/material.js steps). Twinned here, step for step:
//   now   the steps on the land's smooth surface at the pixel's point: where the neighbouring pixels' rays meet the
//         plane through it square to the land's normal there, the vertices' normals as the triangle carries them
//   was   the screen's derivatives of the triangle's points (dFdx, dFdy): the same, on the triangle's own plane
// The eye as the gate's tent at eye level has it (tools/gate/views.js: the rig's pose, src/camera/rig.js poseAt), at
// the gate's light-check screen (CHECK_SIZE), over the land as the GPU draws it near the eye: its first level's quads
// (NODE / GRID apart: src/terrain/material.js), each cut in two triangles, their corners at the land's height and normal
// (src/world/land.js heightSlopeAt, the GPU's twin). Every pixel of every SWEEPth row and the row under it, out to where a
// quad is still two pixels across (nearer, a triangle spans pixels enough for its edges to show), its ray meeting the
// triangles.
// Counted, for each:
//   at the edges    where two neighbouring pixels lie on two triangles: the point between them on the edge, its level
//                   as either triangle has it there (the same, if the level goes on across the edge)
//   between pixels  how much the level changes from a pixel to its neighbour, across an edge and within a triangle, and
//                   how often the level read (its whole level, at the bias at rest) changes there
// Exit 1 where, now, a point of an edge reads two levels, one either side.
import './glob.js';

const { heightAt, heightSlopeAt } = await import('../src/world/land.js');
const { NODE, GRID, LEAST_STEP } = await import('../src/terrain/material.js');
const { rawOf, levelOf, SWEEP } = await import('../src/terrain/pages.js');
const { poseAt } = await import('../src/camera/rig.js');
const { VIEWS, CHECK_SIZE } = await import('./gate/views.js');

const [W, H] = CHECK_SIZE.split('x').map(Number), Q = NODE / GRID;   // (the screen; the land's finest quads, metres)
const view = VIEWS.find((v) => v.name === 'bench-tent-eye-level').rig, pose = poseAt(view.x, view.z, view.yaw, view.h, view.look);
const cam = pose.pos, cp = Math.cos(pose.pitch), fwd = [-Math.sin(pose.yaw) * cp, Math.sin(pose.pitch), -Math.cos(pose.yaw) * cp];
const right = [Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)], up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
const P11 = 1 / Math.tan((pose.fov * Math.PI) / 360), P00 = P11 / (W / H);   // (the lens: its projection's scale, as three's)
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- the land's triangles: a corner's height and normal (as the vertex stage has them), each quad cut along one diagonal ----
const CORNERS = new Map();
const corner = (i, j) => {
  const key = i * 1e6 + j; let c = CORNERS.get(key);
  if (!c) { const x = i * Q, z = j * Q, [h, gx, gz] = heightSlopeAt(x, z, LEAST_STEP); c = { p: [x, heightAt(x, z), z], n: unit([-gx, 1, -gz]), h }; CORNERS.set(key, c); }
  return c;
};
/** The triangle under (x, z): its corners and the point's weights on them; id names it. */
const triangleAt = (x, z) => {
  const i = Math.floor(x / Q), j = Math.floor(z / Q), fx = x / Q - i, fz = z / Q - j;
  return fx + fz < 1 ? { id: `${i},${j},0`, i, j, c: [corner(i, j), corner(i + 1, j), corner(i, j + 1)], w: [1 - fx - fz, fx, fz] }
    : { id: `${i},${j},1`, i, j, c: [corner(i + 1, j + 1), corner(i, j + 1), corner(i + 1, j)], w: [fx + fz - 1, 1 - fx, 1 - fz] };
};
const heightOn = (T) => T.c.reduce((s, c, k) => s + c.p[1] * T.w[k], 0);
/** Where the pixel (px, py) (its middle at +0.5) looks along: the ray a metre ahead (its depth along the lens's axis 1). */
const rayOf = (px, py) => add(add(fwd, right, (((px / W) * 2 - 1)) / P00), up, (1 - (py / H) * 2) / P11);
/** Where its ray meets the land: { P, T, z } (z: its depth along the lens's axis), or null (the sky, or past the reach). */
const FAR = (Q * H * P11) / 4;   // (as far as a quad is still two pixels across: a pixel at depth z is 2 z / (H P11) metres)
function hit(px, py) {
  const d = rayOf(px, py), len = Math.hypot(d[0], d[2]);
  if (len <= 0) return null;
  const above = (t) => { const p = add(cam, d, t); return p[1] - heightOn(triangleAt(p[0], p[2])); };
  let t0 = 0.15, t = t0;   // (from the lens's near plane, a half quad a step over the land)
  for (; t < FAR; t += Q / 2 / len) { if (above(t) < 0) break; t0 = t; }
  if (t >= FAR) return null;
  for (let k = 0; k < 40; k++) { const m = (t0 + t) / 2; if (above(m) < 0) t = m; else t0 = m; }
  const P = add(cam, d, t), T = triangleAt(P[0], P[2]);
  return { P: [P[0], heightOn(T), P[2]], T, z: t, d };
}
/** A pixel's level as each rule has it: the steps to its neighbours' points on the plane through P square to n. */
const levelBy = (h, n) => {
  const nd = dot(n, h.d), k = Math.sign(nd || 1) * Math.max(Math.abs(nd), Math.hypot(...h.d) * 0.02);   // (held off the grazing, as material.js steps)
  const on = (e) => { const s = add(e, h.d, -dot(n, e) / k); return Math.hypot(s[0] * h.z, s[2] * h.z); };
  return rawOf(on(right.map((x) => (x * 2) / (W * P00))), on(up.map((x) => (x * 2) / (H * P11))));
};
const facetOf = (T) => { const [a, b, c] = T.c.map((q) => q.p), u = add(b, a, -1), v = add(c, a, -1), n = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]); return n[1] < 0 ? n.map((x) => -x) : n; };
const smoothOf = (T) => unit(T.c.reduce((s, c, k) => add(s, c.n, T.w[k]), [0, 0, 0]));
const RULES = { now: (h) => levelBy(h, smoothOf(h.T)), was: (h) => levelBy(h, facetOf(h.T)) };

// ---- the pixels: every SWEEPth row and the one under it ----
const rows = [];
for (let y = Math.ceil(H / 2); y < H - 1; y += SWEEP) rows.push({ y, at: [y, y + 1].map((py) => Array.from({ length: W }, (_, px) => hit(px + 0.5, py + 0.5))) });
const near = (a, b) => a && b && Math.abs(a.T.i - b.T.i) <= 1 && Math.abs(a.T.j - b.T.j) <= 1;   // (neighbours on the land: not across a ridge that hides what is behind)
/** A triangle's weights at (x, z) on its corners (its plane's, a hair past it where the point lies on its edge). */
const weightsOn = (T, x, z) => {
  const [a, b, c] = T.c.map((q) => q.p), det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
  const wb = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det, wc = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det;
  return [1 - wb - wc, wb, wc];
};
/** The point where the line between two pixels (screen places) crosses from one triangle to the next, as each of the
    two triangles carries it: [on the first, on the second]; null where they do not meet there (an outline: the land
    behind a rise, the rise hiding what lies between). */
const edgeBetween = (pa, pb) => {
  let s0 = 0, s1 = 1, A = hit(...pa), B = hit(...pb);
  for (let k = 0; k < 40; k++) {
    const s = (s0 + s1) / 2, h = hit(pa[0] + (pb[0] - pa[0]) * s, pa[1] + (pb[1] - pa[1]) * s);
    if (!h) return null;
    if (h.T.id === A.T.id) { s0 = s; A = h; } else { s1 = s; B = h; }
  }
  return near(A, B) && Math.hypot(A.P[0] - B.P[0], A.P[1] - B.P[1], A.P[2] - B.P[2]) < Q * 1e-6 ? [A, { ...A, T: { ...B.T, w: weightsOn(B.T, A.P[0], A.P[2]) } }] : null;
};
const S = Object.fromEntries(Object.keys(RULES).map((k) => [k, { edge: { n: 0, most: 0, sum: 0, flips: 0 }, across: { n: 0, most: 0, sum: 0, flips: 0 }, within: { n: 0, most: 0, sum: 0, flips: 0 } }]));
const tally = (e, la, lb) => { const dl = Math.abs(la - lb); e.n++; e.sum += dl; e.most = Math.max(e.most, dl); if (levelOf(la, 0) !== levelOf(lb, 0)) e.flips++; };
let pixels = 0, outlines = 0;
for (const { y, at: [r0, r1] } of rows) {
  for (let x = 0; x < W; x++) {
    const a = r0[x]; if (!a) continue; pixels++;
    for (const [b, pb] of [[r0[x + 1], [x + 1.5, y + 0.5]], [r1[x], [x + 0.5, y + 1.5]]]) {   // (its neighbour to the right, and under it)
      if (!near(a, b)) continue;
      const across = a.T.id !== b.T.id, at = across ? edgeBetween([x + 0.5, y + 0.5], pb) : null;
      if (across && !at) { outlines++; continue; }
      for (const [name, rule] of Object.entries(RULES)) { tally(across ? S[name].across : S[name].within, rule(a), rule(b)); if (at) tally(S[name].edge, rule(at[0]), rule(at[1])); }
    }
  }
}

const f = (x) => x.toFixed(3);
console.log(`the tent at eye level (${CHECK_SIZE}): ${pixels} pixels of the land within ${Math.round(FAR)} m (every ${SWEEP}th row and the one under it), its triangles ${Q} m quads cut in two; ${outlines} neighbours across an outline left out`);
for (const [name, s] of Object.entries(S)) {
  console.log(`\n${name}:`);
  console.log(`  at the edges    ${s.edge.n} points between two triangles: their two levels differ by ${f(s.edge.most)} at the most, ${f(s.edge.sum / Math.max(s.edge.n, 1))} on the mean; the level read is two at ${s.edge.flips}`);
  console.log(`  between pixels  across an edge (${s.across.n}): ${f(s.across.most)} levels at the most, ${f(s.across.sum / Math.max(s.across.n, 1))} on the mean, the level read changes at ${s.across.flips}`);
  console.log(`                  within a triangle (${s.within.n}): ${f(s.within.most)} at the most, ${f(s.within.sum / Math.max(s.within.n, 1))} on the mean, the level read changes at ${s.within.flips}`);
}
const bad = S.now.edge.flips;
console.log(bad ? `\nFAIL: now, ${bad} points of an edge read two levels, whichever triangle reads them` : `\nok: now, every point of an edge reads one level, whichever triangle reads it (its two sides ${f(S.now.edge.most)} of a level apart at the most)`);
process.exit(bad ? 1 : 0);
