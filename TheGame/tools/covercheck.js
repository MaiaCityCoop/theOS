// How much of the ground a stand covers, near and far, checked on the CPU (intent 0038): `bun tools/covercheck.js`. No
// GPU. Where a stand's plants are drawn, their crowns cover the ground they cover; past where they are gone the land
// wears the stand's colour in their place (src/terrain/material.js), as much of the ground as the layer map says they
// cover (src/terrain/layers.js coverOf). The two must be one: the land standing in for the plants may cover no more
// of the ground than they did, nor less, or the stand grows (or thins) as it goes off.
// For every stand of the world, at its plants' thickest (each kind at its `most`: src/scatter/rule.js) and at half and a
// quarter of that:
//   near    what its plants cover where they are drawn: each kind's round (its reach) by how much of it its crown covers
//           seen from straight above (assets/kit/crowd.js topShareOf, from its shapes' meshes; the game reads the same
//           from their far ends' pictures: src/scatter/trees.js crownCover, src/detail/seen.js crownOf)
//   far     what the land wears in their place, as it was (the rounds whole, through smoothstep(0.1, 0.95) and a ramp
//           over the first 0.15) and as it is now (coverOf: the rounds by their crowns' share)
//   drawn   the two together, with distance: the plants sinking away as the land's colour comes in (standFade, from
//           where its smallest kind begins to sink to where its largest is gone, at the 68° lens on the gate's screen (tools/gate/views.js
//           CHECK_SIZE) and the dial at its rest), from the stand near to past where it is gone
// Exit 1 where, now, what the land wears far off is not what the plants cover near by, to a byte's step (the page's).
// The pattern of crowns the land draws where its texel can still hold it (two texels to the pattern's finest scale:
// material.js `mean`) is its own: its share of a texel is not checked here.
import './glob.js';

const { STANDS } = await import('../src/terrain/layers.js');
const { topShareOf } = await import('../assets/kit/crowd.js');
const { pxKAt } = await import('../src/detail/measure.js');
const { ERROR_PX } = await import('../src/detail/error.js');

const { CHECK_SIZE } = await import('./gate/views.js');

const BYTE = 1 / (2 ** (8 * Uint8Array.BYTES_PER_ELEMENT) - 1), SCREEN = +CHECK_SIZE.split('x')[1];   // (the gate's own screen)
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pct = (v) => `${(100 * v).toFixed(1)}%`.padStart(6);
// (how much of its own round an asset's crown covers from above: its shapes' mean, as seen.js crownOf has it)
const SHARE = new Map();
const shareOf = (a) => {
  if (SHARE.has(a)) return SHARE.get(a);
  let sum = 0, of = 0;
  if (a.meshAt && a.shapeCount) for (let s = 0; s < a.shapeCount; s++) { const k = topShareOf(a.meshAt(0, s)); if (k != null) { sum += k; of++; } }
  const k = of ? sum / of : null; SHARE.set(a, k); return k;
};

let failed = 0;
for (const S of STANDS) {
  const cell2 = S.L.cell * S.L.cell, names = [...new Set(S.entries.map((e) => e.asset.name))].join(', ');
  const shares = S.entries.map((e) => shareOf(e.asset) ?? 1), measured = S.entries.every((e) => e.asset.far) ? 'from their far ends' : 'kinds without far ends: the game counts their rounds whole';
  console.log(`\n${S.bio.name}: ${names} (a ${S.L.name} layer; crowns cover ${shares.map((k) => pct(k).trim()).join(', ')} of their rounds; ${measured})`);
  const last = (pxKAt(SCREEN) * S.span) / ERROR_PX(), at = S.span > 0 ? [0.5 * last * S.fade[0], last * S.fade[0], (last * (S.fade[0] + S.fade[1])) / 2, last * S.fade[1], 2 * last * S.fade[1]] : [0];
  for (const f of [1, 0.5, 0.25]) {
    // (each kind's chance to stand in a cell, its round of the cell, by its crown's share: the layer map's counting)
    const round = Math.min(1, S.entries.reduce((s, e) => s + (f * e.most * Math.PI * e.reach * e.reach) / cell2, 0));
    const near = Math.min(1, S.entries.reduce((s, e, j) => s + (f * e.most * Math.PI * e.reach * e.reach * shares[j]) / cell2, 0));
    const was = sstep(0.1, 0.95, round) * sstep(0, 0.15, round), now = Math.min(1, S.entries.reduce((s, e, j) => s + (f * e.most * Math.PI * e.reach * e.reach * (e.asset.far ? shares[j] : 1)) / cell2, 0));
    const fade = (d) => (S.span > 0 ? sstep(last * S.fade[0], last * S.fade[1], d) : 1), drawn = (far) => at.map((d) => pct((1 - fade(d)) * near + fade(d) * far)).join(' ');
    const off = Math.abs(now - near) > BYTE && S.entries.every((e) => e.asset.far);
    if (off) failed++;
    console.log(`  ${f === 1 ? 'thickest' : `${f} of it`.padEnd(8)}  near ${pct(near)}   far: was ${pct(was)} (×${(was / Math.max(near, 1e-9)).toFixed(2)}), now ${pct(now)}${off ? '  FAIL' : ''}`);
    console.log(`            drawn at ${at.map((d) => `${Math.round(d)} m`).join(', ')}: was ${drawn(was)}; now ${drawn(now)}`);
  }
}
console.log(failed ? `\n${failed} stand(s) worn far off otherwise than their plants cover` : '\nevery stand worn far off as its plants cover near by');
process.exit(failed ? 1 : 0);
