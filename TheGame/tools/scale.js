// The measuring run (intent 0035): every asset and character of the registry built as the game builds it, stood as the
// world stands it, and measured against what a real one measures: its own measure, in its own file (its recipe's
// `measure`), read against the world's one scale (world/scale.js: its units, its rules, its tolerances, the reference
// body). `bun tools/scale.js` prints, for each thing, what the world draws of it (its least, its middle and its most,
// metres, and its middle in the reference body's heights) beside what is real (typical, most) and the source; it fails
// (exit 1) where a measure breaks the scale's rules, where what is drawn is out of its measure, or where a recipe has no
// measure. CI runs it. `--json` prints the numbers instead of the table.
//
// How a thing is stood as the world stands it:
//   a plant of a stand (placement.engine 'trees': trees, bushes, what lies on the floor): each shape built at its nearest
//     level and measured; times its placement's scale; its foot set FOOT into the ground. Its middle: the engine's
//     middle scale. A tree: the height its stand's ages ask (its stage's, from its height by age), drawn as the engine
//     draws it (its packed size over its size at scale 1: src/scatter/trees.js sizeAtOne), its middle its oldest stage;
//     and as the library stands it at each stage's age (its growth's `at`)
//   a made thing (placement.at 'places': the tent, the fire pit, its flame): each level built and measured as it is
//   rocks: their widest side on the ground, as src/scatter/rocks.js draws them: each shape built at every level of the
//     ladder (assets/kit/rock.js: in the frame it is drawn in, its largest side 1) times its size, its asset's least to
//     most by the cube of a die (most rocks are small), larger more often on an outcrop, never past its most; the
//     middle at the die's middle. What stops a walker (its collider's round, src/world/rocksolid.js scales it by the
//     same size) is held against how far the drawn rock reaches over the ground
// A measure may say `known`: a disagreement found and said, not yet set right; it is shown, and does not fail the run.
//   the grass: one blade, its asset's height times its tuft's share (0.5 to 2.2, src/scatter/grass.js), the middle the
//     mean share
//   a person: built (characters/kit/human.js) and measured, feet to the top of the hair
//   a figure brought in whole (characters/kit/figure.js): read, then measured by its kit from its lowest to its highest
//     point as its bones hold it at rest (`stands`)
//   a character that is grown after it is made (the skeleton: characters/kit/bones.js): waited for, then measured the
//     same way, its quick surface
// Every level of what is built is measured too: a far level that stands taller or lower than the near one by more
// than LEVELS is said.
import './glob.js';
const { recipe, manifest } = await import('../src/core/registry.js');   // (first, as the game does: the recipes import it back)
const { PERSON, WALKER, TOLERANCE, faultsOf } = await import('../world/scale.js');
const RIG = (await import('../camera/rig.js')).default;
const { FOOT, sizeAtOne } = await import('../src/scatter/trees.js');
const { heightIn } = await import('../assets/kit/tree.js');
const { rockBody, rockFull, rockFamily } = await import('../assets/kit/rock.js');
const { sizeOf } = await import('../assets/kinds.js');
const THREE = await import('three/webgpu');
const { texture } = await import('three/tsl');

const LEVELS = TOLERANCE.levels;   // how far a level may stand from the nearest in height, a share of it
const mix = (a, b, t) => a + (b - a) * t, r3 = (x) => Math.round(x * 1000) / 1000;
function bounds(pts) {   // pts: a flat array x, y, z, …
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 3) for (let k = 0; k < 3; k++) { const v = pts[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return { lo, hi, top: hi[1], across: Math.max(hi[0] - lo[0], hi[2] - lo[2]) };
}
const facesOf = (faces) => faces.flatMap((f) => [...f[0], ...f[1], ...f[2]]);

/** A character as it stands, feet to the top: built (its quick surface is enough to measure; one grown or read after
    it is made says when it stands), then measured from its skin's points, or, a figure brought in whole, by what its kit
    says of it (`stands`: its file's points are not in metres, its kit measures them as its bones hold them:
    characters/kit/figure.js). */
async function stood(a, notes) {
  const T = new THREE.Texture(), tex = new Proxy({}, { get: (_, k) => (k === 'want' ? () => {} : () => texture(T)) });
  const made = a.make(tex, { quick: true }), tall = (h, more) => ({ by: 'height', least: h, middle: h, most: h, notes, ...more }); await made.grown;
  if (made.stands) return tall(made.stands.top - Math.max(0, made.stands.low));
  let mesh = null; made.object.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh) return tall(0, { fails: [`it could not be built here${made.failed ? ': ' + made.failed : ''}`] });
  const B = bounds(mesh.geometry.attributes.position.array);
  return tall(B.top - Math.max(0, B.lo[1]));
}

/** What the world draws of a recipe: { least, middle, most } metres tall (or across, for rocks), and what was found on
    the way (levels that disagree). */
async function measured(a) {
  const P = a.placement ?? {}, notes = [];
  if (a.type === 'character') return stood(a, notes);
  if (P.engine === 'rocks') {   // each shape as it is (its full mesh: every coarser version is the builder's, within it), in the frame it is drawn in (its largest side 1), times its size
    const wide = [], fam = rockFamily('scale', a);
    for (let v = 0; v < (P.shapes ?? 1); v++) {
      const F = rockFull(a, v), B = bounds(F.pos), near = Math.max(B.hi[0] - B.lo[0], B.hi[2] - B.lo[2]), g = rockBody(a, v).sunk; let reach = 0;
      for (let i = 0; i < F.pos.length; i += 3) if (F.pos[i + 1] >= g) reach = Math.max(reach, Math.hypot(F.pos[i], F.pos[i + 2]));   // (how far it reaches over the ground)
      wide.push(near);
      const C = fam.collidersOf(v)[0], k = C ? C.r / reach : 0;   // its collider's round against the drawn rock's reach over the ground, both of its size
      if (!(k >= TOLERANCE.round[0] && k <= TOLERANCE.round[1])) notes.push(`shape ${v}: what stops a walker reaches ${r3(k)} of how far it is drawn over the ground`);
      (measured.round ??= []).push(k);
    }
    const [s0, s1] = a.size.length, mean = wide.reduce((s, x) => s + x, 0) / wide.length, out = measured.round.splice(0);
    return { by: 'across', least: s0 * Math.min(...wide), middle: mix(s0, s1, 0.125 + (P.outcrops ? 0.0625 : 0)) * mean, most: s1 * Math.max(...wide), round: [Math.min(...out), Math.max(...out)], notes };
  }
  if (P.engine === 'grass') return { by: 'height', least: a.height * 0.5, middle: a.height * (0.5 + 0.55 / 3 + 0.8 / 3), most: a.height * 2.2, notes };
  if (a.meshAt && a.shapeCount) {   // a plant of a stand
    const tops = [];
    for (let s = 0; s < a.shapeCount; s++) {
      tops.push(bounds(a.meshAt(0, s).position).top);   // (a plant has one mesh, its finest: the crowd thins it, intent 0038)
    }
    const [k0, k1] = P.scale ?? [1, 1], G = a.growth;
    if (G?.stages) {   // a tree: as old as its stand, drawn as the engine draws it (its packed size, the height its age asks times wide, over its shape's size at scale 1)
      const near = a.heights, wide = sizeOf(a) / a.size.height, drawn = (shape, h) => (near[shape] * h * wide) / sizeAtOne(a, shape), of = (S) => Array.from({ length: S.variants }, (_, v) => S.offset + v);
      const last = G.stages.at(-1), first = G.stages[0], fails = [];
      // every stage, at ages through its span: drawn by the engine, and stood by the library, against its height by age
      G.stages.forEach((S) => {
        for (const age of [S.from, Math.sqrt(S.from * S.year), S.year, Math.sqrt(S.year * S.to), Math.min(S.to, 200)]) {
          const want = G.height(age), h = heightIn(S, age);
          for (const v of of(S)) { const d = drawn(v, h); if (Math.abs(d - want) > TOLERANCE.growth * want) fails.push(`a tree of ${r3(age)} years (shape ${v}) drawn ${r3(d)} m, its height by age ${r3(want)} m`); }
          const t = G.at(age), lib = near[t.shape] * t.s;   // the library's tree of this age (the trees' engine: stage)
          if (Math.abs(lib - want) > TOLERANCE.growth * want) fails.push(`the library's tree of ${r3(age)} years ${r3(lib)} m, its height by age ${r3(want)} m`);
        }
      });
      return { by: 'height', least: Math.min(...of(first).map((v) => drawn(v, first.hFrom * k0))) - FOOT, middle: Math.max(...of(last).map((v) => drawn(v, last.h))) - FOOT, most: Math.max(...of(last).map((v) => drawn(v, last.hTo * k1))) - FOOT, notes, fails };
    }
    const sMid = mix(k0, k1, 0.5 ** 1.3), mean = tops.reduce((s, x) => s + x, 0) / tops.length;   // (its scale: mix(k0, k1, die^1.3), src/scatter/trees.js)
    return { by: 'height', least: Math.min(...tops) * k0 - FOOT, middle: mean * sMid - FOOT, most: Math.max(...tops) * k1 - FOOT, notes };
  }
  const levels = a.faces ? [{ faces: a.faces }] : a.detail?.levels ?? [];
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
  const a = recipe(uid), S = a.measure;
  if (!S) { miss.push(`${m.name} (${m.file}): no measure in its file`); continue; }
  const M = await measured(a);
  if (!M) { miss.push(`${m.name} (${m.file}): not measurable here`); continue; }
  const want = M.by === 'across' ? S.across : { typical: S.typical, most: S.most }, fails = [...faultsOf(S).map((f) => `its measure: ${f}`), ...(M.fails ?? [])];
  if (M.by === 'across' && S.size) {   // a rock is drawn at its size: its least and most as drawn, its lumps allowed for
    if (M.least < S.size[0] * TOLERANCE.lumps[0] - 1e-6) fails.push(`its least ${r3(M.least)} m is under its size's least ${S.size[0]} m`);
    if (M.most > S.size[1] * TOLERANCE.lumps[1] + 1e-6) fails.push(`its most ${r3(M.most)} m is over its size's most ${S.size[1]} m`);
  }
  if (want.typical && (M.middle < want.typical[0] - 1e-6 || M.middle > want.typical[1] + 1e-6)) fails.push(`its middle ${r3(M.middle)} m is not ${want.typical[0]} to ${want.typical[1]} m`);
  if (want.most != null && M.most > want.most + 1e-6) fails.push(`its most ${r3(M.most)} m is over ${want.most} m`);
  if (S.mature != null && a.growth?.height) { const h = a.growth.height(1e4); if (Math.abs(h - S.mature) > 0.01 * S.mature) fails.push(`its height by age comes to ${r3(h)} m, not ${S.mature} m`); }
  rows.push({ name: m.name, file: m.file, real: S.real, by: M.by, least: r3(M.least), middle: r3(M.middle), most: r3(M.most), typical: want.typical, mostReal: want.most, round: M.round ?? null, own: S.own ?? [], source: S.source, notes: M.notes, fails, known: fails.length && S.known ? S.known : null });
}
// the walker: the person's body, as the camera and the solids read it
const walker = { eye: RIG.eye, firstKey: RIG.keys[0].h, person: PERSON.stature, ...WALKER }, wfails = [];
if (Math.abs(RIG.eye - WALKER.eye) > 1e-9 || Math.abs(RIG.keys[0].h - WALKER.eye) > 1e-9) wfails.push(`the camera's eye ${RIG.eye} m (its first key ${RIG.keys[0].h} m) is not the person's ${WALKER.eye} m`);

if (process.argv.includes('--json')) console.log(JSON.stringify({ rows, walker, miss, wfails }, null, 2));
else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('thing', 16)}${pad('by', 8)}${pad('least', 8)}${pad('middle', 8)}${pad('most', 8)}${pad('× person', 10)}${pad('real: typical', 15)}${pad('most', 7)}`);
  for (const r of rows) {
    console.log(`${r.fails.length ? (r.known ? '!' : '✗') : '✓'} ${pad(r.name, 14)}${pad(r.by, 8)}${pad(r.least, 8)}${pad(r.middle, 8)}${pad(r.most, 8)}${pad(r.by === 'height' ? (r.middle / PERSON.stature).toFixed(2) : '', 10)}${pad(r.typical ? r.typical.join(' to ') : '', 15)}${pad(r.mostReal ?? '', 7)}${r.real}`);
    if (r.round) console.log(`    what stops a walker: ${r.round.map(r3).join(' to ')} of how far it is drawn over the ground (its collider, by the same size)`);
    for (const f of r.fails) console.log(`    out: ${f}`);
    if (r.known) console.log(`    known: ${r.known}`);
    for (const n of r.notes) console.log(`    note: ${n}`);
  }
  console.log(`\nthe walker, of a person ${PERSON.stature} m: eyes ${WALKER.eye} m (the camera's: ${RIG.eye} m), shoulder ${WALKER.shoulder} m, knee ${WALKER.knee} m, shin ${WALKER.shin} m, head ${WALKER.head} m, round ${WALKER.round} m`);
  for (const f of wfails) console.log(`    out: ${f}`);
  for (const m of miss) console.log(`✗ ${m}`);
  const bad = rows.filter((r) => r.fails.length && !r.known).length + miss.length + wfails.length, known = rows.filter((r) => r.known).length;
  console.log(bad ? `\n${bad} out of measure` : `\n${rows.length - known} of ${rows.length} within their measure`);
  if (known) console.log(`${known} known out of measure (said in their measures, to be set right): ${rows.filter((r) => r.known).map((r) => r.name).join(', ')}`);
}
process.exit(rows.some((r) => r.fails.length && !r.known) || miss.length || wfails.length ? 1 : 0);
