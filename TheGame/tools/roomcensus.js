// What the start holds on the GPU, by class and by pool, at a device's share of the Mac's budget, on the GPU's stand-in
// (intent 0038): `bun tools/roomcensus.js [share…]` (default: 1, the Mac's, and 0.5 and 0.35). No GPU. Each share in a
// process of its own (tools/roomshare.js) (the budget is set once, at boot: src/core/gpu.js askedLimits, from the adapter's largest buffer,
// here an adapter of that share's); in each the world's fixed pools made as src/boot.js makes them (its own order: the
// screen, the world's textures, the ground's maps, the land and its pages, what grows, the sky, the weather, the light),
// and the ledger read (src/core/gpu.js ledger): what each class holds against its budget, and its largest pools. What a
// smaller device's budget shrinks (the land's pages, by the ground's room; the ground's maps, by their share of it) and
// what it does not.
import { spawnSync } from 'node:child_process';

const arg = process.argv.slice(2), shares = arg.length ? arg.map(Number) : [1, 0.5, 0.35], rows = [];
{
  for (const s of shares) {
    const r = spawnSync(process.execPath, [new URL('./roomshare.js', import.meta.url).pathname, String(s)], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('room-census: '));
    if (!line) { console.error(`share ${s}: ${(r.stderr || r.stdout || '').slice(-600)}`); process.exit(1); }
    rows.push(JSON.parse(line.slice(13)));
  }
  const mb = (x) => `${Math.round(x)}`.padStart(6);
  console.log(`the start's GPU pools, MB, at each share of the Mac's budget (src/core/gpu.js budgetOf): held / budget`);
  console.log(`  class        ${rows.map((r) => `share ${r.share}`.padStart(18)).join('')}`);
  for (const c of Object.keys(rows[0].classes)) console.log(`  ${c.padEnd(13)}${rows.map((r) => `${mb(r.classes[c].noted)} / ${mb(r.classes[c].budget)}    `).join('')}`);
  console.log(`  ${'all'.padEnd(13)}${rows.map((r) => `${mb(r.noted)} / ${mb(r.budget)}    `).join('')}`);
  console.log('  the largest pools:');
  const names = [...new Set(rows.flatMap((r) => r.rows.slice(0, 14).map((x) => x[0])))];
  for (const n of names) console.log(`    ${rows.map((r) => mb(r.rows.find((x) => x[0] === n)?.[1] ?? 0)).join('  ')}   ${n.slice(0, 90)}`);
  process.exit(0);
}
