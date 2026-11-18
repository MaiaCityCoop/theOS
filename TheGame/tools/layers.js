// The layers the one placement rule makes of what the trees' engine places (src/scatter/rule.js), as a table: each
// layer's class, its cells, the words it reads and writes, and each of its things with what it reaches and how many of
// the layer's cells it takes at most. `bun tools/layers.js`.
import './glob.js';
await import('../src/core/registry.js');
const { layersOf, rowsOf } = await import('../src/scatter/rule.js');
for (const L of layersOf(rowsOf())) {
  console.log(`layer ${L.index}: class ${L.k}, cells of ${L.cell.toFixed(2)} m, seed ${L.seed}, reads ${L.reads.map((W) => W.word).join(',') || '–'}, writes ${L.word >= 0 ? L.word : '–'}, reach ${L.reach.toFixed(1)} m`);
  for (const e of L.entries) console.log(`  ${(e.asset.name + (e.young ? ', young' : '')).padEnd(22)} ${e.asset.kind.padEnd(7)} reach ${e.reach.toFixed(2).padStart(5)} m  cover ${e.cover.toFixed(2)}  at most ${e.most.toFixed(3)} a cell${e.slice ? `  slice ${e.slice.map((x) => x.toFixed(2)).join('-')}` : ''}${e.from ? `  under ${e.from.join(',')}` : ''}`);
}
