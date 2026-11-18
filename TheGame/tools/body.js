// The Body built without the world, measured, and kept for the lab's page (intent 0039): `bun tools/body.js` lays the
// bones, the muscles and the skin as the workers lay them (characters/kit/skeleton/grow.worker.js), and says of the skin:
//   whether it is one closed surface (every edge between exactly two faces), its points and triangles at each level,
//   its volume, and how far each level is off the finest (what the page chooses a level by);
//   how smooth it is: how far the surface's normal turns from a point to its neighbour, a centimetre of skin, over
//   the trunk and the limbs (degrees: the middle one and the one only a twentieth exceed);
//   its measures beside a man's: girths and breadths of a man of 1.80 m, slightly muscular (MEASURES below);
//   how it bends: in five poses (POSES), how far the skin's own edges are stretched and squeezed.
// `--keep` writes what was laid to TheGame/.body/ for the tool's page (tools/body.html: the Body drawn alone through the
// game's own shader, on the game's dev server); `--stills <folder>` then takes that page's stills there (VIEWS below:
// the body from four sides and close, and in five poses), through Chrome, or the browser at --chrome <path>, from the
// dev server at --url (http://localhost:5173/); `--h <cell>` lays the shape on other cells than 6 mm; `--json` prints
// the numbers.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { skeletonBones } from '../characters/kit/skeleton.js';
import { prepare } from '../characters/kit/skeleton/mesh.js';
import { musclesOf } from '../characters/kit/muscles/build.js';
import { skinOf } from '../characters/kit/skin/build.js';
import { rigOf, turnsOf, poseOf } from '../characters/kit/skeleton/pose.js';
import { EYE, MOUTH } from '../characters/kit/skin/table.js';

/** Five poses the skin is tried in (the rig's plain moves: characters/kit/skeleton/pose.js). */
export const POSES = {
  'elbows bent': { 'elbow.L': 2.2, 'elbow.R': 1.2, 'arm.R': [0.5, 0, 0] },
  'arms raised': { 'arm.L': [0, 1.6, 0], 'arm.R': [0, 2.8, 0] },
  'knee raised': { 'hip.L': [1.6, 0, 0], 'knee.L': 1.7 },
  'bent forwards': { loins: [0.7, 0, 0], chest: [0.3, 0, 0], 'arm.L': [1.2, 0, 0], 'arm.R': [1.2, 0, 0] },
  squat: { 'knee.L': 2.3, 'knee.R': 2.3, 'hip.L': [1.9, 0.2, 0], 'hip.R': [1.9, 0.2, 0], 'fist.L': 1, head: [0, 0.9, 0] },
};
/** The stills: the body from four sides, the face from three and its eye and mouth close, the body close, and in the five poses (the address of tools/body.html each). */
export const VIEWS = {
  front: 'yaw=0', 'three-quarter': 'yaw=35', side: 'yaw=90', back: 'yaw=180',
  face: 'yaw=0&y=1.665&d=0.62', 'face, three-quarter': 'yaw=35&y=1.665&d=0.62', 'face, side': 'yaw=90&y=1.665&d=0.62', eye: 'yaw=12&y=1.677&x=0.032&z=0.07&d=0.2', mouth: 'yaw=15&y=1.62&z=0.08&d=0.26',
  torso: 'yaw=20&y=1.25&d=1.5', 'back, close': 'yaw=200&y=1.2&d=1.6', head: 'yaw=25&y=1.66&d=0.7', hand: 'yaw=60&y=0.78&x=0.22&d=0.6', legs: 'yaw=20&y=0.5&d=1.6', foot: 'yaw=40&y=0.06&x=0.09&z=0.05&d=0.8&pitch=25',
  ...Object.fromEntries(Object.entries(POSES).map(([name, pose], i) => [name, ['yaw=40&d=4', 'yaw=10&d=4.6&y=1', 'yaw=60&d=4', 'yaw=70&d=4', 'yaw=50&d=4'][i] + '&pose=' + encodeURIComponent(JSON.stringify(pose))])),
};

/** What a man of 1.80 m, slightly muscular, measures (cm), and where each is taken. From the US Army's survey of men
    (ANSUR II: Gordon et al. 2014, NATICK/TR-15/007; means of 4 082 men of 1.756 m and a body-mass index of 27.7, as
    third parties quote them: reports/Photoreal human body architecture.md says none was read in the report itself),
    scaled to 1.80 m; the girths that fat carries taken down to a lean man's as characters/kit/skin/table.js has them
    (PROFILES). `at`: metres over the ground; `joint`: a share of the way between two of the rig's joints; `least`: the least
    girth between two heights. */
export const MEASURES = [
  { what: 'neck, round its least', cm: 39, girth: 'trunk', least: [1.5, 1.56] },
  { what: 'shoulders, across the deltoids', cm: 50, breadth: 'all', from: 1.36, to: 1.44 },
  { what: 'chest, round', cm: 101, girth: 'trunk', at: 1.315 },
  { what: 'waist, round', cm: 82, girth: 'trunk', at: 1.1 },
  { what: 'hips, round the buttocks', cm: 98, girth: 'trunk', at: 0.9 },
  { what: 'hips, across', cm: 35, breadth: 'trunk', from: 0.88, to: 0.94 },
  { what: 'thigh, round its top', cm: 57, girth: 'leg', at: 0.77 },
  { what: 'knee, round', cm: 38, girth: 'leg', joint: ['shin.L', 0] },
  { what: 'calf, round', cm: 38, girth: 'leg', at: 0.36 },
  { what: 'ankle, round its least', cm: 22, girth: 'leg', least: [0.09, 0.16] },
  { what: 'upper arm, round', cm: 32, girth: 'arm', joint: ['upperArm.L', 'foreArm.L', 0.45] },
  { what: 'forearm, round', cm: 28, girth: 'arm', joint: ['foreArm.L', 'hand.L', 0.2] },
  { what: 'wrist, round', cm: 17, girth: 'arm', joint: ['hand.L', 0, 0.012] },
];

const arg = (name, d = null) => { const i = process.argv.indexOf('--' + name); return i < 0 ? d : process.argv[i + 1] ?? true; };
const json = process.argv.includes('--json'), say = (...a) => { if (!json) console.log(...a); };
let t0 = performance.now(); const lap = () => { const n = performance.now(), s = ((n - t0) / 1000).toFixed(1); t0 = n; return s; };

const B = prepare(skeletonBones()), M = musclesOf(B); const tM = lap();
const S = skinOf(B, M, { h: +arg('h', 0.006) }); const tS = lap();
const RIG = rigOf(), P = S.pos, part = (v) => S.attr.feel[v * 4 + 2], PART = { trunk: 0, arm: 1, leg: 2, head: 8 };

// ── one closed surface? ──────────────────────────────────────────────────────────────────────────────────────────
const closed = (tri) => { const E = new Map(); for (let t = 0; t < tri.length; t += 3) for (let i = 0; i < 3; i++) { const a = tri[t + i], b = tri[t + (i + 1) % 3], k = a < b ? a * 2 ** 26 + b : b * 2 ** 26 + a; E.set(k, (E.get(k) ?? 0) + 1); } let open = 0, many = 0; for (const n of E.values()) { if (n === 1) open++; else if (n > 2) many++; } return { open, many }; };
const volume = (tri) => { let v = 0; for (let t = 0; t < tri.length; t += 3) { const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3; v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; } return v; };

// ── how smooth: the normal's turn from a point to its neighbour, for a centimetre of skin ───────────────────────────
// (over the trunk and the limbs, where skin lies smooth on a man: not the face, the hands or the feet, whose own forms turn it)
const BROAD = (x, y) => y > 0.15 && y < 1.48 && !(Math.abs(x) > 0.15 && y < 0.9);
export function turnOf(pos, nor, tri) {
  const turns = [];
  for (let t = 0; t < tri.length; t += 3) for (let i = 0; i < 3; i++) {
    const a = tri[t + i], b = tri[t + (i + 1) % 3]; if (a > b || !BROAD(pos[a * 3], pos[a * 3 + 1])) continue;
    const d = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]); if (d < 1e-5) continue;
    const c = Math.min(1, nor[a * 3] * nor[b * 3] + nor[a * 3 + 1] * nor[b * 3 + 1] + nor[a * 3 + 2] * nor[b * 3 + 2]);
    turns.push(((Math.acos(c) * 180) / Math.PI) * (0.01 / d));
  }
  turns.sort((x, y) => x - y);
  return { middle: turns[turns.length >> 1], most: turns[Math.floor(turns.length * 0.95)] };
}

// ── its measures: the skin cut level at a height, the cut's length round (a girth) or its reach across (a breadth) ──
const cut = (y, keep) => {
  const segs = [], T = S.fine;
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t], T[t + 1], T[t + 2]]; if (!v.every(keep)) continue;
    const pts = []; for (let i = 0; i < 3; i++) { const a = v[i] * 3, b = v[(i + 1) % 3] * 3, ya = P[a + 1] - y, yb = P[b + 1] - y; if ((ya < 0) !== (yb < 0)) { const k = ya / (ya - yb); pts.push([P[a] + (P[b] - P[a]) * k, P[a + 2] + (P[b + 2] - P[a + 2]) * k]); } }
    if (pts.length === 2) segs.push(pts);
  }
  return segs;
};
const left = (v) => P[v * 3] > 0.001;
const KEEP = { trunk: (v) => part(v) === PART.trunk || part(v) === PART.head || (part(v) === PART.leg), leg: (v) => part(v) === PART.leg && left(v), arm: (v) => part(v) >= PART.arm && part(v) !== PART.leg && part(v) !== PART.head && left(v), all: () => true };
const heightOf = (m) => { if (m.at != null) return m.at; const [a, b, k = 0] = m.joint, A = RIG[a].at; return typeof b === 'string' ? A[1] + (RIG[b].at[1] - A[1]) * k : A[1] + (b || 0) + k; };
const rows = MEASURES.map((m) => {
  let is;
  const round = (y) => cut(y, KEEP[m.girth]).reduce((s, [a, b]) => s + Math.hypot(a[0] - b[0], a[1] - b[1]), 0) * 100;
  if (m.least) { is = Infinity; for (let y = m.least[0]; y <= m.least[1] + 1e-9; y += 0.005) is = Math.min(is, round(y)); }
  else if (m.girth) is = round(heightOf(m));
  else { let lo = Infinity, hi = -Infinity; for (let y = m.from; y <= m.to + 1e-9; y += 0.005) for (const [a, b] of cut(y, KEEP[m.breadth])) { lo = Math.min(lo, a[0], b[0]); hi = Math.max(hi, a[0], b[0]); } is = (hi - lo) * 100; }
  return { what: m.what, is: +is.toFixed(1), man: m.cm, off: +(((is - m.cm) / m.cm) * 100).toFixed(1) };
});

// ── how it bends: in each pose every point carried by its joints as the page carries it (linear blend), and how much
// the skin's own edges are stretched by that: the middle one, and the most (but for one in a thousand) ───────────────
const bends = Object.entries(POSES).map(([name, moves]) => {
  const at = poseOf(RIG, turnsOf(moves)), Jn = S.joints.map(({ rig }) => at[rig]), Q = new Float32Array(P.length), bone = S.attr.bone, wt = S.attr.weight;
  for (let v = 0; v < P.length / 3; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; for (let k = 0; k < 4; k++) { const w = wt[v * 4 + k]; if (!w) continue; const [A, t] = Jn[bone[v * 4 + k]]; Q[v * 3] += w * (A[0] * x + A[1] * y + A[2] * z + t[0]); Q[v * 3 + 1] += w * (A[3] * x + A[4] * y + A[5] * z + t[1]); Q[v * 3 + 2] += w * (A[6] * x + A[7] * y + A[8] * z + t[2]); } }
  const r = [], T = S.fine, d = (B, a, b) => Math.hypot(B[a * 3] - B[b * 3], B[a * 3 + 1] - B[b * 3 + 1], B[a * 3 + 2] - B[b * 3 + 2]);
  for (let t = 0; t < T.length; t += 3) for (let i = 0; i < 3; i++) { const a = T[t + i], b = T[t + (i + 1) % 3]; if (a > b) continue; const l = d(P, a, b); if (l > 1e-4) r.push(d(Q, a, b) / l); }
  r.sort((x, y) => x - y);
  return { pose: name, most: +r[Math.floor(r.length * 0.999)].toFixed(2), least: +r[Math.floor(r.length * 0.001)].toFixed(2), over: +((r.filter((x) => x > 1.5).length / r.length) * 100).toFixed(2) };
});

const levels = [['near', S.fine], ['middle', S.coarse], ['far', S.far]].map(([name, tri], i) => ({ name, triangles: tri.length / 3, ...closed(tri), off: +(S.off[i] * 1000).toFixed(2) }));
// ── the face's measures (mm), read off the skin's points: a breadth or a length is how far the head's points reach
// along an axis inside a box; the profile is the points on the middle plane, from the brow down. What a man's head
// measures, all as remembered, none read for this: its length and breadth, across the cheekbones and the jaw's angles
// and from the nose's root to the chin's foot, the US Army's survey of men (ANSUR: head length 197, head breadth 152,
// bizygomatic breadth 140, bigonial breadth 119, menton to sellion 122; Farkas's jaw, pressed to the bone, is 106); the
// nose, the lips and the eyes, Farkas 1994, "Anthropometry of the Head and Face" (young men's means). The eye's
// opening and the mouth's breadth are drawn lines (characters/kit/skin/table.js EYE, LIPS), so theirs are the table's.
const faceRows = (() => {
  const n = P.length / 3, head = []; for (let v = 0; v < n; v++) if (part(v) === PART.head) head.push(v);
  const reach = (axis, [y0, y1], [z0, z1] = [-1, 1]) => { let lo = Infinity, hi = -Infinity; for (const v of head) { const y = P[v * 3 + 1], z = P[v * 3 + 2]; if (y < y0 || y > y1 || z < z0 || z > z1) continue; lo = Math.min(lo, P[v * 3 + axis]); hi = Math.max(hi, P[v * 3 + axis]); } return (hi - lo) * 1000; };
  const mid = head.filter((v) => Math.abs(P[v * 3]) < 1e-4 && P[v * 3 + 2] > 0.05).map((v) => [P[v * 3 + 1], P[v * 3 + 2]]).sort((a, b) => b[0] - a[0]);   // (the profile: [height, how far forward], from the top down)
  const between = (y0, y1) => mid.filter(([y]) => y >= y0 && y <= y1), most = (list, k, sign = 1) => list.reduce((a, b) => (sign * b[k] > sign * a[k] ? b : a));
  const root = most(between(1.672, 1.698), 1, -1), tip = most(between(1.632, 1.652), 1), lip = between(1.6185, tip[0]), least = Math.min(...lip.map(([, z]) => z)), foot = most(lip.filter(([, z]) => z < least + 0.0045), 0);   // (the nose's root: the profile's deepest point under the brow; its foot: where the upper lip's flat ends under it)
  const chin = most(between(1.5, 1.6), 0, -1), E = EYE;
  const R = (what, is, man, drawn = false) => ({ what: what + (drawn ? ' (as drawn)' : ''), is: +is.toFixed(1), man, off: +(((is - man) / man) * 100).toFixed(1) });
  return [
    R('head, its length', reach(2, [1.692, 1.708]), 197), R('head, its breadth', reach(0, [1.712, 1.74], [-0.08, 0]), 152),
    R('face, across the cheekbones', reach(0, [1.652, 1.668], [0.01, 1]), 140), R('jaw, across its angles', reach(0, [1.59, 1.6], [-0.012, 0.03]), 119),
    R("face, the nose's root to the chin's foot", (root[0] - chin[0]) * 1000, 122), R("nose, its root to its foot", (root[0] - foot[0]) * 1000, 55),
    R('nose, its breadth', reach(0, [1.632, 1.642], [0.098, 1]), 35), R('nose, its tip before its foot', (tip[1] - foot[1]) * 1000, 19.5),
    R("upper lip, the nose's foot to its edge, smiling (a man's: at rest)", (foot[0] - MOUTH.upper) * 1000, 22, true), R("mouth, its breadth, smiling (a man's: at rest)", MOUTH.half * 2000, 54, true),
    R("eye, its opening's length", Math.hypot(E.outer[0] - E.inner[0], E.outer[1] - E.inner[1]) * 1000, 31, true), R("eye, its opening's height", (E.upper[0] + E.lower[0]) * 1000, 10.5, true),
    R("between the eyes' inner corners", (E.at[0] + E.inner[0]) * 2000, 33, true), R("between the eyes' outer corners", (E.at[0] + E.outer[0]) * 2000, 91, true),
  ];
})();

const out = { seconds: { muscles: +tM, skin: +tS }, points: P.length / 3, cage: S.counts.cage, joints: S.counts.joints, levels, litres: +(volume(S.fine) * 1000).toFixed(1), turn: turnOf(P, S.attr.nor, S.fine), measures: rows, face: faceRows, bends, headCover: S.headCover };
if (json) console.log(JSON.stringify(out, null, 1));
else {
  say(`The skin: ${out.points} points on a cage of ${out.cage}, hung on ${out.joints} joints; laid in ${tS} s (the muscles ${tM} s before it); ${out.litres} litres.`);
  for (const l of levels) say(`  ${l.name.padEnd(7)} ${String(l.triangles).padStart(7)} triangles, open edges ${l.open}, edges of more than two faces ${l.many}, off the finest by ${l.off} mm`);
  if (S.headCover) say(`  the head's bones lie at least ${S.headCover.mm} mm under its skin (least at ${S.headCover.at?.map((x) => x.toFixed(3)).join(', ')})`);
  say(`  over the trunk and the limbs its normal turns ${out.turn.middle.toFixed(2)}° a centimetre of skin (the middle one), ${out.turn.most.toFixed(1)}° where it turns most (one in twenty more)`);
  say('  measure'.padEnd(36) + 'is'.padStart(7) + 'a man'.padStart(8) + '   off');
  for (const r of rows) say('  ' + r.what.padEnd(34) + (r.is + ' cm').padStart(9) + (r.man + ' cm').padStart(8) + ((r.off > 0 ? '+' : '') + r.off + ' %').padStart(9));
  say('  the face'.padEnd(52) + 'is'.padStart(7) + 'a man'.padStart(9) + '   off');
  for (const r of faceRows) say('  ' + r.what.padEnd(50) + (r.is + ' mm').padStart(9) + (r.man + ' mm').padStart(9) + ((r.off > 0 ? '+' : '') + r.off + ' %').padStart(9));
  say('  pose'.padEnd(20) + 'an edge of the skin stretched at most, squeezed at most; edges stretched by more than half');
  for (const b of bends) say('  ' + b.pose.padEnd(18) + ('x ' + b.most).padStart(8) + ('x ' + b.least).padStart(9) + (b.over + ' %').padStart(10));
}

// ── kept for the lab's page ──────────────────────────────────────────────────────────────────────────────────────
const keep = process.argv.includes('--keep') || process.argv.includes('--stills');
if (keep) {
  delete M.inner;
  const body = { rows: M.rows, muscleList: M.muscles, muscles: { pos: M.pos, attr: M.attr, fine: M.fine, coarse: M.coarse }, skin: { pos: S.pos, attr: S.attr, fine: S.fine, coarse: S.coarse, far: S.far, off: S.off, joints: S.joints, maps: S.maps }, soles: S.soles, skinThick: S.skin, counts: { ...M.counts, skin: S.counts } };
  const chunks = []; let off = 0;
  const text = JSON.stringify(body, (k, v) => { if (!ArrayBuffer.isView(v)) return v; const b = Buffer.from(v.buffer, v.byteOffset, v.byteLength), pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } const r = { $t: v.constructor.name, o: off, n: v.length }; chunks.push(b); off += b.length; return r; });
  const dir = resolve(import.meta.dirname, '../.body'); mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'body.json'), text); writeFileSync(resolve(dir, 'body.bin'), Buffer.concat(chunks));
  say(`kept in ${dir} (${(off / 1e6).toFixed(1)} MB)`);
}

// ── its stills ────────────────────────────────────────────────────────────────────────────────────────────────────
const stills = arg('stills');
if (stills) {
  const base = String(arg('url', 'http://localhost:5173/')).replace(/\/?$/, '/'), dir = resolve(String(stills)); mkdirSync(dir, { recursive: true });
  if (!(await fetch(base + 'tools/body.html').then((r) => r.ok, () => false))) { console.error(`no stills: the game's dev server does not answer at ${base} (bun run game)`); process.exit(1); }
  const { chromium } = await import('playwright-core'), path = arg('chrome'), browser = await chromium.launch(path ? { executablePath: String(path), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : { channel: 'chrome' });
  for (const [name, view] of Object.entries(VIEWS)) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 }), wrong = []; page.on('pageerror', (e) => wrong.push(String(e)));
    await page.goto(`${base}tools/body.html?${view}${arg('with') ? '&' + arg('with') : ''}`); await page.waitForFunction(() => window.__drawn, null, { timeout: 240000 }).catch(() => wrong.push('not drawn in four minutes'));
    await page.screenshot({ path: resolve(dir, name.replace(/[, ]+/g, '-') + '.png') }); await page.close();
    say(`  ${name}${wrong.length ? ': ' + wrong[0] : ''}`);
  }
  await browser.close(); say(`stills in ${dir}`);
}
