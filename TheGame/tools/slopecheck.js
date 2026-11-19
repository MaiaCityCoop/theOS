// The land's slope worked out with its height, checked on the CPU (intent 0038): `bun tools/slopecheck.js`. No GPU. The
// GPU's land (src/world/land.nodes.js heightSlopeAt) works out its height and its slope in one evaluation, each octave's
// own slope from its own noise (noised), where its slope took three heights: a forward difference over e metres
// (src/terrain/material.js normalStep). src/world/land.js heightSlopeAt is its twin, constant for constant. Points over
// the land round the world's middle and round every pad (from a fixed seed), each slope held to the land's own forward
// difference (heightWith: its neighbours read as the shader read them, the river's width and bend kept, riverNear), read
// as the page keeps it: the base's rock's share of the texel (src/terrain/layers.js STEEP), to a byte's step at the finest
// (an unpacked page's bytes; a packed page's blocks keep less). As many points as a page's slot has texels, and a slot's
// side of them round each pad.
//   derivative   over a byte's part of the pages' nearest step (src/terrain/material.js LEAST_STEP), where the forward
//                difference's own error, which grows with its step, is a byte's part of what it is there: the slope
//                worked out is the land's own (exit 1 where a share differs by a byte's step)
//   the steps    over the pages' nearest step and twice and four times it: how many shares differ by more than a byte's
//                step from the old forward difference's, and by how much at most. The river's part is the same secant in
//                both, so what differs is the forward difference's own error over its step, against the octaves'
//                slope: it grows with the step.
import './glob.js';

const { heightSlopeAt, heightWith, riverAt, riverNear, PADS, PAD_FALL, OCT_LAM } = await import('../src/world/land.js');
const { STEEP } = await import('../src/terrain/layers.js');
const { LEAST_STEP } = await import('../src/terrain/material.js');
const { SLOT } = await import('../src/terrain/pages.js');

const BYTE = 1 / (2 ** (8 * Uint8Array.BYTES_PER_ELEMENT) - 1), FINE = LEAST_STEP * BYTE;   // (a byte's step: the page's bytes are a Uint8Array's)
const SPAN = 2 * OCT_LAM[0] * 4;   // (a square reaching four of the land's widest octaves either way)
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const share = ([gx, gz]) => sstep(STEEP[0], STEEP[1], 1 / Math.hypot(gx, gz, 1));   // (the base's rock's, from the normal's y)
let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const points = Array.from({ length: SLOT * SLOT }, () => [(rand() - 0.5) * SPAN, (rand() - 0.5) * SPAN]);
for (const p of PADS) for (let k = 0; k < SLOT; k++) { const a = rand() * 2 * Math.PI, r = rand() * (p.r + PAD_FALL); points.push([p.x + r * Math.cos(a), p.z + r * Math.sin(a)]); }

/** The old slope at (x, z): the ground's height there and e metres ahead in x and in z, the river's width and bend kept. */
function forward(x, z, e) {
  const R = riverAt(x, z), d = R.d, w = R.w, b = R.b, bend = R.b * (R.r >= 0 ? 1 : -1);
  const at = (qx, qz) => heightWith(qx, qz, riverNear(qx, qz, w, bend), w, b), h = heightWith(x, z, d, w, b);
  return [(at(x + e, z) - h) / e, (at(x, z + e) - h) / e];
}
/** How the slope worked out over step e differs from the old one's: shares over a byte's step, the most, the normal's y. */
function against(e) {
  let over = 0, most = 0, ny = 0;
  for (const [x, z] of points) {
    const A = heightSlopeAt(x, z, e).slice(1), F = forward(x, z, e), dw = Math.abs(share(A) - share(F));
    if (dw > BYTE) over++;
    most = Math.max(most, dw); ny = Math.max(ny, Math.abs(1 / Math.hypot(A[0], A[1], 1) - 1 / Math.hypot(F[0], F[1], 1)));
  }
  return { over, most, ny };
}

const say = (what, r) => console.log(`${what}: ${r.over} of ${points.length} shares over a byte's step, at most ${(r.most / BYTE).toFixed(2)} of one; the normal's y within ${r.ny.toExponential(1)}`);
const D = against(FINE);
say(`${D.over ? 'FAIL' : 'ok  '} derivative (over ${(FINE * 1000).toFixed(2)} mm)`, D);
for (const k of [1, 2, 4]) say(`     the step ${(k * LEAST_STEP).toFixed(3)} m`, against(k * LEAST_STEP));
process.exit(D.over ? 1 : 0);
