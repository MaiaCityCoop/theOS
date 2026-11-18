// The fat and the skin drawn out (intents 0036, 0039): one closed surface over the whole body, standing, made as a
// film's or a game's body is made: a cage of a few thousand four-sided faces laid in rings round the body (./cage.js),
// its points found on the body's shape (./target.js: the fat's and the skin's thickness over the muscles, the bones,
// the gristle and the eyes), and that cage made smooth (./subdiv.js). Each point of it is then fastened to the bones
// nearest under it (./weights.js), so the rig carries it (../muscles/flesh.js). Plain JS, no three: it runs in the
// workers that grow the bones (../skeleton/grow.worker.js), or under node.
//
//   skinOf(bones, muscles, { h }) -> { rows, attr, rest, pos, fine, coarse, far, off, soles, counts }
//     muscles  what ../muscles/build.js laid, with its `inner` (the strands)
//     rows     the rows the skin adds to the muscles' (each bone a point of it hangs on: a row carried whole by that bone)
//     pos      its points, on the smooth surface itself
//     attr     to each point: the four rows it hangs on and its share on each; its normal standing (the smooth
//              surface's own); `look`: how open it stands, how much of it is a lip, a nail, an areola; `feel`: how
//              sharply the skin curves there (1/m), how thick the body is under it (m), which piece it is of
//     rest     each of those rows' frame standing (its middle, along it, out, across: four times four numbers a row)
//     fine, coarse, far   three levels of detail over the same points: the cage smoothed twice, once, and the cage's
//              own faces (a level's points are the first of the next finer level's, where they lie on the same surface)
//     off      how far each of the three stands off the smooth surface (m): what the page chooses a level by
//     soles    where the feet meet the ground: the lowest points of the soles, each with the joint that carries it
import { MARKS, SKIN } from './table.js';
import { targetOf } from './target.js';
import { cageOf, fitted } from './cage.js';
import { refine, limit, triangles } from './subdiv.js';
import { bindingOf } from './weights.js';

export { tissueAt } from './target.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export function skinOf(bones, M, { h = 0.006 } = {}) {
  const T = targetOf(bones, M, { h }), { P_, ARMS, RIG } = T;
  const cage = fitted(cageOf(T)), n0 = cage.pos.length / 3;
  const m1 = refine({ pos: cage.pos, faces: cage.faces }), n1 = m1.pos.length / 3, m2 = refine(m1), n = m2.pos.length / 3;
  const L = limit(m2), pos = L.pos, nor = L.nor, at = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];

  // ── which piece each point is of: the cage's points say; a point made between two takes the one further out along
  // the body (a finger's before the hand's, the head's before the trunk's)
  const part = new Uint8Array(n); part.set(cage.part);
  const partsDown = (m, from) => { const { points, ea, eb, faces } = m.from; for (let e = 0; e < ea.length; e++) part[points + e] = Math.max(part[ea[e]], part[eb[e]]); for (let f = 0; f < faces; f++) { let p = 0; for (let i = 0; i < (from instanceof Uint32Array ? 4 : from[f].length); i++) p = Math.max(p, part[from instanceof Uint32Array ? from[f * 4 + i] : from[f][i]]); part[points + ea.length + f] = p; } };
  partsDown(m1, cage.faces); partsDown(m2, m1.faces);

  // ── each point fastened to its bones ────────────────────────────────────────────────────────────────────────
  // The once-smoothed cage's points each ask for their bones (./weights.js); their shares are then evened out with
  // their neighbours' (a little everywhere, so no line shows where two pieces meet; more over the trunk and the
  // thighs, whose skin lies far from the bones: it bends softly instead of creasing); a point of the finer level takes
  // the mean of the points it lies between; each keeps its four largest.
  const B = bindingOf(bones, M, T);
  let holds = Array.from({ length: n1 }, (_, v) => new Map(B.fasten(at(v), part[v]).map(({ row, w }) => [row, w])));
  const four = (m) => { const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).filter((c) => c[1] > 1e-4), sum = top.reduce((a, c) => a + c[1], 0); return top.map(([row, w]) => ({ row, w: w / sum })); };
  {
    const nb = Array.from({ length: n1 }, () => []), Q = m1.faces;
    for (let f = 0; f < Q.length; f += 4) for (let i = 0; i < 4; i++) nb[Q[f + i]].push(Q[f + (i + 1) % 4]);
    const soft = (v) => { const y = pos[v * 3 + 1]; return !ARMS(part[v]) && part[v] !== P_.head && y > 0.6 && y < 1.42; };
    for (let it = 0; it < 6; it++) {
      const next = holds.slice();
      for (let v = 0; v < n1; v++) {
        if (it > 0 && !soft(v)) continue;
        const m = new Map(), put = (hm, k) => { for (const [row, w] of hm) m.set(row, (m.get(row) ?? 0) + w * k); };
        put(holds[v], 0.5); for (const u of nb[v]) put(holds[u], 0.5 / nb[v].length);
        next[v] = m;
      }
      holds = next;
    }
  }
  const held = new Array(n);
  for (let v = 0; v < n1; v++) held[v] = four(holds[v]);
  { const { points, ea, eb } = m2.from, Q = m1.faces, mean = (vs) => { const m = new Map(); for (const v of vs) for (const [row, w] of holds[v]) m.set(row, (m.get(row) ?? 0) + w / vs.length); return four(m); };
    for (let e = 0; e < ea.length; e++) held[points + e] = mean([ea[e], eb[e]]);
    for (let f = 0; f < Q.length / 4; f++) held[points + ea.length + f] = mean([Q[f * 4], Q[f * 4 + 1], Q[f * 4 + 2], Q[f * 4 + 3]]); }

  // ── what each point is and how it stands ────────────────────────────────────────────────────────────────────
  const attr = { bone: new Float32Array(n * 4), weight: new Float32Array(n * 4), nor, look: new Float32Array(n * 4), feel: new Float32Array(n * 4) };
  const lips = MARKS[0], areola = MARKS[1], within = (q, m) => Math.sqrt(((q[0] - m.at[0]) / m.r[0]) ** 2 + ((q[1] - m.at[1]) / m.r[1]) ** 2 + ((q[2] - m.at[2]) / m.r[2]) ** 2);
  // (the body as a ray meets it: the trunk's, the legs' and the head's skin, and the arms')
  const solid = (p) => Math.min(T.GB.sample(p), T.GA.sample(p));
  // (how sharply the surface curves at each point: the mean of how fast its normal turns towards each neighbour)
  const curve = new Float32Array(n), cn = new Uint8Array(n);
  { const Q = m2.faces; for (let f = 0; f < Q.length; f += 4) for (let i = 0; i < 4; i++) { const a = Q[f + i], b = Q[f + (i + 1) % 4], d = sub(at(b), at(a)), l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; if (l2 < 1e-12) continue; const k = ((nor[b * 3] - nor[a * 3]) * d[0] + (nor[b * 3 + 1] - nor[a * 3 + 1]) * d[1] + (nor[b * 3 + 2] - nor[a * 3 + 2]) * d[2]) / l2; curve[a] += k; curve[b] += k; cn[a]++; cn[b]++; } }
  const low = new Map();
  for (let v = 0; v < n; v++) {
    const p = at(v), nrm = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]], hv = held[v];
    for (let j = 0; j < 4; j++) { attr.bone[v * 4 + j] = hv[j]?.row ?? 0; attr.weight[v * 4 + j] = hv[j]?.w ?? 0; }
    const q = [Math.abs(p[0]), p[1], p[2]], rigA = B.allRows(hv[0].row).keys[0].rig;
    // (each a share, soft at its edge: the lips' red over a millimetre or two, the areola's over a little more)
    const lip = 1 - smooth01((within(q, lips) - 0.88) / 0.14), are = q[2] > T.nip[2] - 0.012 ? 1 - smooth01((Math.hypot(q[0] - T.nip[0], q[1] - T.nip[1]) / areola.r[0] - 0.8) / 0.3) : 0;
    const nail = ARMS(part[v]) || part[v] === P_.leg ? T.nailAt(p, nrm) : 0;
    // how open it stands: how much of the body is round it, looked for at three distances out of it, straight out and
    // slanting (what is near shades a little place, what is far a wide one: under the arm, between the thighs, the
    // hollow of the throat)
    let occ = 0, ws = 0; const t1 = norm(cross(nrm, Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(nrm, t1);
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * 2 * Math.PI + 0.4, tilt = k === 8 ? 0 : k % 2 ? 0.55 : 0.85, up = Math.sqrt(1 - tilt * tilt), dir = k === 8 ? nrm : add(mul(nrm, up), add(mul(t1, Math.cos(a) * tilt), mul(t2, Math.sin(a) * tilt)));
      for (const [d, w] of [[0.012, 0.3], [0.035, 0.4], [0.09, 0.3]]) { const f = solid(add(p, mul(dir, d))); occ += w * up * Math.max(0, 1 - f / (d * 0.6)); ws += w * up; }
    }
    attr.look.set([Math.max(0.3, Math.min(1, 1 - (1.25 * occ) / ws)), lip, nail, are], v * 4);
    // how thick the body is under it: straight in, to where the ray leaves it again (a finger, an ear, the nose's wing)
    let thick = 0.05; for (let t = 0.002; t < 0.05; t += 0.002) if (solid(sub(p, mul(nrm, t))) > 0) { thick = t; break; }
    attr.feel.set([cn[v] ? curve[v] / cn[v] : 0, thick, part[v], 0], v * 4);
    // the soles: under each foot and toe, the lowest point every two centimetres
    if (/^(foot|toe\d)\./.test(rigA) && p[1] < 0.03) { const k2 = rigA + ':' + Math.round(p[2] / 0.02) + ':' + Math.round(p[0] / 0.03), was = low.get(k2); if (!was || p[1] < was.p[1]) low.set(k2, { rig: rigA, p }); }
  }
  const far = []; for (const f of cage.faces) for (let i = 1; i < f.length - 1; i++) far.push(f[0], f[i], f[i + 1]);
  const fine = triangles({ pos, faces: m2.faces }), coarse = triangles({ pos, faces: m1.faces });
  // how far each level stands off the smooth surface (m): the middle of a face against the surface's own point there
  // (the next finer level's point for that face), the worst but for one in a hundred; the finest a quarter of the
  // middle's (each round quarters it)
  const offOf = (m, faceAt, sizeOf) => { const { points, ea, faces } = m.from, d = new Float32Array(faces); for (let f = 0; f < faces; f++) { const k = sizeOf(f), c = [0, 0, 0]; for (let i = 0; i < k; i++) { const q = at(faceAt(f, i)); c[0] += q[0] / k; c[1] += q[1] / k; c[2] += q[2] / k; } d[f] = len(sub(c, at(points + ea.length + f))); } d.sort(); return d[Math.floor(faces * 0.99)]; };
  const offFar = offOf(m1, (f, i) => cage.faces[f][i], (f) => cage.faces[f].length), offMid = offOf(m2, (f, i) => m1.faces[f * 4 + i], () => 4), off = [offMid / 4, offMid, offFar];
  return {
    rows: B.rows, soles: [...low.values()].map(({ rig, p }) => ({ rig, at: sub(p, RIG[rig].at) })), pos, fine, coarse, far: Uint32Array.from(far), off, attr, rest: B.restOf(),
    counts: { points: n, fine: fine.length / 3, coarse: coarse.length / 3, far: far.length / 3, cage: n0, bonesHeld: B.held() },
    skin: SKIN / 1000,
  };
}
