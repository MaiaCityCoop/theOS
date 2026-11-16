// The measuring run (intent 0035): every asset and character of the registry built as the game builds it, stood as the
// world stands it, and measured against what a real one measures (world/scale.js). `bun tools/scale.js` prints, for
// each thing, what the world draws of it (its least, its middle and its most, metres) beside what is real (typical,
// most) and the source; it fails (exit 1) where anything is out of its range, or where a recipe has no measure. CI
// runs it. `--json` prints the numbers instead of the table.
//
// How a thing is stood as the world stands it:
//   a plant of a stand (placement.engine 'trees': trees, bushes, what lies on the floor): each shape built at its nearest
//     level and measured; times its placement's scale (a tree: its stage of growth at its stand's ages, as
//     src/scatter/trees.js grows it); its foot set FOOT into the ground. Its middle: the engine's middle scale (a tree:
//     its oldest stage at scale 1)
//   a made thing (placement.at 'places': the tent, the fire pit, its flame): each level built and measured as it is
//   rocks: their widest side on the ground, as src/scatter/rocks.js draws them: each shape in its own frame (its largest
//     side 1, assets/kit/rock.js) times its size and its shape's span; the size its asset's least to most by the cube of
//     a die (most rocks are small), a quarter more on an outcrop; the middle at the die's middle (an outcrop's too)
// A measure may say `known`: a disagreement found and said, not yet set right; it is shown, and does not fail the run.
//   the grass: one blade, its asset's height times its tuft's share (0.5 to 2.2, src/scatter/grass.js), the middle the
//     mean share
//   a person: built (characters/kit/human.js) and measured, feet to the top of the hair
// Every level of what is built is measured too: a far level that stands taller or lower than the near one by more
// than LEVELS is said.
import './glob.js';
const { recipe, manifest } = await import('../src/core/registry.js');   // (first, as the game does: the recipes import it back)
const { THINGS, PERSON, WALKER } = await import('../world/scale.js');
const RIG = (await import('../camera/rig.js')).default;
const { FOOT } = await import('../src/scatter/trees.js');
const { rockBody } = await import('../assets/kit/rock.js');
const THREE = await import('three/webgpu');
const { texture } = await import('three/tsl');

const LEVELS = 0.2;   // how far a level may stand from the nearest in height, a share of it
const mix = (a, b, t) => a + (b - a) * t, r3 = (x) => Math.round(x * 1000) / 1000;
function bounds(pts) {   // pts: a flat array x, y, z, …
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 3) for (let k = 0; k < 3; k++) { const v = pts[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return { lo, hi, top: hi[1], across: Math.max(hi[0] - lo[0], hi[2] - lo[2]) };
}
const facesOf = (faces) => faces.flatMap((f) => [...f[0], ...f[1], ...f[2]]);

/** What the world draws of a recipe: { least, middle, most } metres tall (or across, for rocks), and what was found on
    the way (levels that disagree). */
function measured(a) {
  const P = a.placement ?? {}, notes = [];
  if (a.type === 'character') {
    const T = new THREE.Texture(), tex = new Proxy({}, { get: (_, k) => (k === 'want' ? () => {} : () => texture(T)) });
    let mesh = null; a.make(tex, {}).object.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const B = bounds(mesh.geometry.attributes.position.array), h = B.top - Math.max(0, B.lo[1]);
    return { by: 'height', least: h, middle: h, most: h, notes };
  }
  if (P.engine === 'rocks') {   // drawn in its own frame (its largest side 1) times its size and its shape's span; its size mix(least, most, die³ (+ a quarter more on an outcrop))
    const wide = Array.from({ length: P.shapes ?? 1 }, (_, v) => { const B = rockBody(a, v), F = B.frame; return B.span * Math.max(F.max[0] - F.min[0], F.max[2] - F.min[2]); });
    const [s0, s1] = a.size.length, mean = wide.reduce((s, x) => s + x, 0) / wide.length;
    return { by: 'across', least: s0 * Math.min(...wide), middle: mix(s0, s1, 0.125 + (P.outcrops ? 0.0625 : 0)) * mean, most: mix(s0, s1, P.outcrops ? 1.25 : 1) * Math.max(...wide), notes };
  }
  if (P.engine === 'grass') return { by: 'height', least: a.height * 0.5, middle: a.height * (0.5 + 0.55 / 3 + 0.8 / 3), most: a.height * 2.2, notes };
  if (a.meshAt && a.shapeCount) {   // a plant of a stand
    const tops = [];
    for (let s = 0; s < a.shapeCount; s++) {
      const near = bounds(a.meshAt(0, s).position);
      tops.push(near.top);
      for (let l = 1; l < a.levelCount; l++) {
        const B = bounds(a.meshAt(l, s).position);
        if (Math.abs(B.top - near.top) > LEVELS * near.top) notes.push(`shape ${s}, level ${l}: ${r3(B.top)} m against ${r3(near.top)} m near`);
      }
    }
    const [k0, k1] = P.scale ?? [1, 1], G = a.growth;
    if (G?.stages) {   // a tree: as old as its stand, its stage scaled to its own height (assets/kit/tree.js stagesOf)
      const last = G.stages.at(-1), oldest = Math.max(...tops.slice(last.offset, last.offset + last.variants));
      G.stages.forEach((S) => { const t = Math.max(...tops.slice(S.offset, S.offset + S.variants)); if (Math.abs(t - S.h) > 0.1 * S.h) notes.push(`stage of ${S.year} years: built ${r3(t)} m, its curve ${r3(S.h)} m`); });
      return { by: 'height', least: G.stages[0].hFrom * k0 - FOOT, middle: oldest - FOOT, most: Math.max(...tops) * (last.hTo / last.h) * k1 - FOOT, notes };
    }
    const sMid = mix(k0, k1, 0.5 ** 1.3), mean = tops.reduce((s, x) => s + x, 0) / tops.length;   // (its scale: mix(k0, k1, die^1.3), src/scatter/trees.js)
    return { by: 'height', least: Math.min(...tops) * k0 - FOOT, middle: mean * sMid - FOOT, most: Math.max(...tops) * k1 - FOOT, notes };
  }
  const levels = a.detail?.levels ?? [];
  if (levels[0]?.faces) {   // a made thing, as made
    const near = bounds(facesOf(levels[0].faces));
    levels.slice(1).forEach((L, i) => { const B = bounds(facesOf(L.faces)); if (Math.abs(B.top - near.top) > LEVELS * near.top) notes.push(`level ${i + 1}: ${r3(B.top)} m against ${r3(near.top)} m near`); });
    return { by: 'height', least: near.top, middle: near.top, most: near.top, notes };
  }
  return null;
}

const rows = [], miss = [];
for (const [uid, m] of Object.entries(manifest)) {
  if (m.type !== 'asset' && m.type !== 'character') continue;
  const a = recipe(uid), S = THINGS[uid];
  if (!S) { miss.push(`${m.name} (${m.file}): no measure in world/scale.js`); continue; }
  const M = measured(a);
  if (!M) { miss.push(`${m.name} (${m.file}): not measurable here`); continue; }
  const want = M.by === 'across' ? S.across : { typical: S.typical, most: S.most }, fails = [];
  if (want.typical && (M.middle < want.typical[0] - 1e-6 || M.middle > want.typical[1] + 1e-6)) fails.push(`its middle ${r3(M.middle)} m is not ${want.typical[0]} to ${want.typical[1]} m`);
  if (want.most != null && M.most > want.most + 1e-6) fails.push(`its most ${r3(M.most)} m is over ${want.most} m`);
  if (S.mature != null && a.growth?.height) { const h = a.growth.height(1e4); if (Math.abs(h - S.mature) > 0.01 * S.mature) fails.push(`its height by age comes to ${r3(h)} m, not ${S.mature} m`); }
  rows.push({ name: m.name, file: m.file, real: S.real, by: M.by, least: r3(M.least), middle: r3(M.middle), most: r3(M.most), typical: want.typical, mostReal: want.most, own: S.own ?? [], source: S.source, notes: M.notes, fails, known: fails.length && S.known ? S.known : null });
}
// the walker: the person's body, as the camera and the solids read it
const walker = { eye: RIG.eye, firstKey: RIG.keys[0].h, person: PERSON.stature, ...WALKER }, wfails = [];
if (Math.abs(RIG.eye - WALKER.eye) > 1e-9 || Math.abs(RIG.keys[0].h - WALKER.eye) > 1e-9) wfails.push(`the camera's eye ${RIG.eye} m (its first key ${RIG.keys[0].h} m) is not the person's ${WALKER.eye} m`);

if (process.argv.includes('--json')) console.log(JSON.stringify({ rows, walker, miss, wfails }, null, 2));
else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('thing', 16)}${pad('by', 8)}${pad('least', 8)}${pad('middle', 8)}${pad('most', 8)}${pad('real: typical', 15)}${pad('most', 7)}`);
  for (const r of rows) {
    console.log(`${r.fails.length ? (r.known ? '!' : '✗') : '✓'} ${pad(r.name, 14)}${pad(r.by, 8)}${pad(r.least, 8)}${pad(r.middle, 8)}${pad(r.most, 8)}${pad(r.typical ? r.typical.join(' to ') : '', 15)}${pad(r.mostReal ?? '', 7)}${r.real}`);
    for (const f of r.fails) console.log(`    out: ${f}`);
    if (r.known) console.log(`    known: ${r.known}`);
    for (const n of r.notes) console.log(`    note: ${n}`);
  }
  console.log(`\nthe walker, of a person ${PERSON.stature} m: eyes ${WALKER.eye} m (the camera's: ${RIG.eye} m), shoulder ${WALKER.shoulder} m, knee ${WALKER.knee} m, shin ${WALKER.shin} m, head ${WALKER.head} m, round ${WALKER.round} m`);
  for (const f of wfails) console.log(`    out: ${f}`);
  for (const m of miss) console.log(`✗ ${m}`);
  const bad = rows.filter((r) => r.fails.length && !r.known).length + miss.length + wfails.length, known = rows.filter((r) => r.known).length;
  console.log(bad ? `\n${bad} out of measure` : `\n${rows.length - known} of ${rows.length} within their measure`);
  if (known) console.log(`${known} known out of measure (said in world/scale.js, to be set right): ${rows.filter((r) => r.known).map((r) => r.name).join(', ')}`);
}
process.exit(rows.some((r) => r.fails.length && !r.known) || miss.length || wfails.length ? 1 : 0);
