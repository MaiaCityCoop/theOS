// The fat and the skin drawn out (intents 0036, 0041): one closed surface over the whole body, standing, made as a
// film's or a game's body is made: a cage of a few thousand four-sided faces laid in rings round the body (./cage.js),
// its points found on the body's shape (./target.js: the fat's and the skin's thickness over the muscles, the bones,
// the gristle and the eyes), and that cage made smooth (./subdiv.js). Each point of it is then fastened to the bones
// nearest under it (./weights.js), so the rig carries it (../muscles/flesh.js). Plain JS, no three: it runs in the
// workers that grow the bones (../skeleton/grow.worker.js), or under node.
//
//   skinOf(bones, muscles, { h }) -> { joints, attr, pos, fine, coarse, far, off, maps, soles, counts }
//     muscles  what ../muscles/build.js laid, with its `inner` (the strands)
//     joints   the joints the skin hangs on: each its name in the rig and where it stands at rest
//     pos      its points, on the smooth surface itself
//     attr     to each point: the four joints it hangs on (their numbers in `joints`) and its share on each; its normal standing (the smooth
//              surface's own); `look`: how open it stands, (nothing), how much of it is a nail, an areola; `feel`: how
//              sharply the skin curves there (1/m), how thick the body is under it (m), which piece it is of, how
//              much shaved hair shadows it;
//              `bent`: the way most of its light comes from, and the cosine of half the width of that cone; `tone`:
//              its blood, its pigment, its oil, its veins (./table.js TONE)
//     maps     two small pictures the skin's light is read from (./maps.js): how light spreads under skin, by how
//              the surface curves; and the skin's fine relief, a tile that repeats
//     fine, coarse, far   three levels of detail over the same points: the cage smoothed twice, once, and the cage's
//              own faces (a level's points are the first of the next finer level's, where they lie on the same surface)
//     off      how far each of the three is off the finest (m): off the smooth surface, or a third of how far its
//              points lie apart, whichever is more: what the page chooses a level by
//     soles    where the feet meet the ground: the lowest points of the soles, each with the joint that carries it
import { MARKS, SKIN, TONE } from './table.js';
import { earOf } from './ear.js';
import { targetOf, tissueAt } from './target.js';
import { cageOf, fitted, solidsOf } from './cage.js';
import { scatterMap, microMap, noise3 } from './maps.js';
import { refine, limit, triangles } from './subdiv.js';
import { bindingOf } from './weights.js';

export { tissueAt } from './target.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** How much of the shape's finer form is laid back on the smooth surface, piece by piece: [the share of the way, the
    furthest a point is moved (m)]; the head's from `neck` (m) up; the rest of the body's only where the fat and the
    skin are thin over a bone (all of it under `thin[0]` m of them, none over `thin[1]`: the collarbone, the kneecap,
    the shin, the ankle's and the wrist's knobs, the elbow), for under fat the skin lies smooth. */
export const LIFT = { head: [1, 0.012], hand: [0.9, 0.004], foot: [0.9, 0.004], body: [0.9, 0.006], thin: [0.0025, 0.0055], neck: 1.53 };

export function skinOf(bones, M, { h = 0.006 } = {}) {
  const T = targetOf(bones, M, { h }), { P_, ARMS, RIG } = T;
  const cage = fitted(cageOf(T)), n0 = cage.pos.length / 3;
  const m1 = refine({ pos: cage.pos, faces: cage.faces }), n1 = m1.pos.length / 3, m2 = refine(m1), n = m2.pos.length / 3;
  const L = limit(m2), pos = L.pos, nor = L.nor, at = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const S = solidsOf(T);

  // ── which piece each point is of: the cage's points say; a point made between two takes the one further out along
  // the body (a finger's before the hand's, the head's before the trunk's)
  const part = new Uint8Array(n); part.set(cage.part);
  const partsDown = (m, from) => { const { points, ea, eb, faces } = m.from; for (let e = 0; e < ea.length; e++) part[points + e] = Math.max(part[ea[e]], part[eb[e]]); for (let f = 0; f < faces; f++) { let p = 0; for (let i = 0; i < (from instanceof Uint32Array ? 4 : from[f].length); i++) p = Math.max(p, part[from instanceof Uint32Array ? from[f * 4 + i] : from[f][i]]); part[points + ea.length + f] = p; } };
  partsDown(m1, cage.faces); partsDown(m2, m1.faces);

  // ── the shape's finer forms laid back on the smooth surface ────────────────────────────────────────────────
  // The cage holds what is a few centimetres across; what is finer than its rings (an eyelid, a nostril, the lips'
  // line, a knuckle) is in the shape still. So each point of the finest level is moved along its normal towards the
  // shape's own surface, as far as LIFT lets its piece (a film's body carries its sculptor's detail the same way: a
  // displacement over the smooth surface): the head all the way, the hands and the feet nearly; the rest of the body
  // only where a bone lies just under the skin (elsewhere what the shape holds beyond the smooth surface is the
  // muscles' strands, and under its fat a body's skin lies smooth).
  {
    const wristY = RIG['hand.L'].at[1] + 0.02;
    const thinAt = (p) => 1 - smooth01((tissueAt([Math.abs(p[0]), p[1], p[2]]) - LIFT.thin[0]) / (LIFT.thin[1] - LIFT.thin[0]));
    const legOf = (p) => (p[0] >= 0 ? S.leg : (q) => S.leg([-q[0], q[1], q[2]]));
    const liftOf = (v, p, nrm) => part[v] === P_.head ? { w: smooth01((p[1] - LIFT.neck) / 0.05) * smooth01((nrm[1] + 0.4) / 0.4) * Math.max(smooth01((p[2] - 0.06) / 0.03), smooth01((p[1] - 1.58) / 0.03)), r: LIFT.head[1], S: S.body }   // (not under the chin and the jaw, where the cage's slope stands for their overhang)
      : ARMS(part[v]) ? (p[1] < wristY ? { w: LIFT.hand[0], r: LIFT.hand[1], S: S.arm } : { w: LIFT.body[0] * thinAt(p), r: LIFT.body[1], S: p[1] > 1.3 ? S.both : S.arm })
      : part[v] === P_.leg ? (p[1] < 0.12 ? { w: LIFT.foot[0], r: LIFT.foot[1], S: legOf(p) } : { w: LIFT.body[0] * thinAt(p), r: LIFT.body[1], S: legOf(p) })
      : { w: LIFT.body[0] * thinAt(p), r: LIFT.body[1], S: p[1] > 1.3 ? S.both : S.body };
    const moved = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const p = at(v), nrm = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]], { w, r, S: sol } = liftOf(v, p, nrm); if (w <= 0.01) continue;
      // (the shape's surface along the normal: outwards if the point is inside it, inwards if outside; none within reach, none taken)
      const f0 = sol(p), dir = f0 < 0 ? 1 : -1; let t0 = 0, t1 = -1;
      for (let t = 0.001; t <= r + 1e-9; t += 0.001) { if ((sol(add(p, mul(nrm, dir * t))) < 0) !== (f0 < 0)) { t1 = t; break; } t0 = t; }
      if (t1 < 0) { if (part[v] === P_.head) { pos[v * 3] += nrm[0] * dir * r * w; pos[v * 3 + 1] += nrm[1] * dir * r * w; pos[v * 3 + 2] += nrm[2] * dir * r * w; moved[v] = w; } continue; }   // (the head's hollows deeper than its reach, an eye's opening, a nostril: as far as it reaches)
      for (let i = 0; i < 6; i++) { const m = (t0 + t1) / 2; if ((sol(add(p, mul(nrm, dir * m))) < 0) === (f0 < 0)) t0 = m; else t1 = m; }
      const d = dir * ((t0 + t1) / 2) * w; pos[v * 3] += nrm[0] * d; pos[v * 3 + 1] += nrm[1] * d; pos[v * 3 + 2] += nrm[2] * d; moved[v] = w;
    }
    // (a moved point's normal: its faces' as they now lie, as much as it was moved; an unmoved one keeps the smooth surface's own)
    const G = new Float32Array(n * 3), Q = m2.faces;
    for (let f = 0; f < Q.length; f += 4) { const a = at(Q[f]), b = at(Q[f + 1]), c = at(Q[f + 2]), d = at(Q[f + 3]), g = cross(sub(c, a), sub(d, b)); for (let i = 0; i < 4; i++) { const v = Q[f + i] * 3; G[v] += g[0]; G[v + 1] += g[1]; G[v + 2] += g[2]; } }
    // (the head's: the way its form's own surface faces there. Its faces lie askew where a ring of the cage with the
    // nose or the lips on it meets one without, and their normals showed that as streaks across the cheek)
    const slopeOf = (p, e = 0.002) => norm([S.body([p[0] + e, p[1], p[2]]) - S.body([p[0] - e, p[1], p[2]]), S.body([p[0], p[1] + e, p[2]]) - S.body([p[0], p[1] - e, p[2]]), S.body([p[0], p[1], p[2] + e]) - S.body([p[0], p[1], p[2] - e])]);
    for (let v = 0; v < n; v++) { if (!moved[v]) continue; const g = part[v] === P_.head ? slopeOf(at(v)) : norm([G[v * 3], G[v * 3 + 1], G[v * 3 + 2]]), k = moved[v], m = norm([nor[v * 3] + (g[0] - nor[v * 3]) * k, nor[v * 3 + 1] + (g[1] - nor[v * 3 + 1]) * k, nor[v * 3 + 2] + (g[2] - nor[v * 3 + 2]) * k]); nor.set(m, v * 3); }
  }

  // ── each point fastened to its bones ────────────────────────────────────────────────────────────────────────
  // The once-smoothed cage's points each ask for their bones (./weights.js); their shares are then evened out with
  // their neighbours' (a little everywhere, so no line shows where two pieces meet; more over the trunk and the
  // thighs, whose skin lies far from the bones: it bends softly instead of creasing); a point of the finer level takes
  // the mean of the points it lies between; each keeps its four largest.
  const B = bindingOf(bones, T);
  let holds = Array.from({ length: n1 }, (_, v) => new Map(B.fasten(at(v), part[v]).map(({ joint, w }) => [joint, w])));
  const four = (m) => { const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).filter((c) => c[1] > 1e-4), sum = top.reduce((a, c) => a + c[1], 0); return top.map(([joint, w]) => ({ joint, w: w / sum })); };
  {
    const nb = Array.from({ length: n1 }, () => []), Q = m1.faces;
    for (let f = 0; f < Q.length; f += 4) for (let i = 0; i < 4; i++) nb[Q[f + i]].push(Q[f + (i + 1) % 4]);
    const soft = (v) => { const y = pos[v * 3 + 1]; return !ARMS(part[v]) && part[v] !== P_.head && y > 0.6 && y < 1.42; };
    for (let it = 0; it < 6; it++) {
      const next = holds.slice();
      for (let v = 0; v < n1; v++) {
        if (it > 0 && !soft(v)) continue;
        const m = new Map(), put = (hm, k) => { for (const [j, w] of hm) m.set(j, (m.get(j) ?? 0) + w * k); };
        put(holds[v], 0.5); for (const u of nb[v]) put(holds[u], 0.5 / nb[v].length);
        next[v] = m;
      }
      holds = next;
    }
  }
  const held = new Array(n);
  for (let v = 0; v < n1; v++) held[v] = four(holds[v]);
  { const { points, ea, eb } = m2.from, Q = m1.faces, mean = (vs) => { const m = new Map(); for (const v of vs) for (const [j, w] of holds[v]) m.set(j, (m.get(j) ?? 0) + w / vs.length); return four(m); };
    for (let e = 0; e < ea.length; e++) held[points + e] = mean([ea[e], eb[e]]);
    for (let f = 0; f < Q.length / 4; f++) held[points + ea.length + f] = mean([Q[f * 4], Q[f * 4 + 1], Q[f * 4 + 2], Q[f * 4 + 3]]); }

  // ── how open each point stands ───────────────────────────────────────────────────────────────────────────
  // From each point of the once-smoothed cage, rays out over the half of the world it faces (more of them near its
  // normal, as the light it takes is), each gone along until it meets the body again or has gone 40 cm. How many get
  // away is how open the point stands to the sky. And of those that its own piece of the body lets go (the trunk's
  // for a point of the trunk, an arm's for the arm's: what moves with it, so it holds in any pose; an arm hanging by
  // the trunk shades the trunk only as it stands), their mean is the way most of its light comes from (its bent
  // normal: under the chin, forwards and down), kept as a cone: that way, and how wide. A point of the finer level
  // takes the mean of those it lies between.
  const frameOn = (nrm) => { const t1 = norm(cross(nrm, Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); return [t1, cross(nrm, t1)]; };
  const RAYS = Array.from({ length: 40 }, (_, k) => { const u = (k + 0.5) / 40, r = Math.sqrt(u), a = k * 2.399963; return [r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - u)]; });
  const open = new Float32Array(n), own = new Float32Array(n), bent = new Float32Array(n * 3);
  const ownOf = (v) => ARMS(part[v]) ? S.arm : part[v] === P_.leg ? (pos[v * 3] >= 0 ? S.leg : (q) => S.leg([-q[0], q[1], q[2]])) : S.body;
  for (let v = 0; v < n1; v++) {
    const p = at(v), nrm = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]], [t1, t2] = frameOn(nrm), from = add(p, mul(nrm, 0.008)), mine = ownOf(v); let free = 0, freeOwn = 0, way = [0, 0, 0];
    for (const [x, y, z] of RAYS) {
      const d = [t1[0] * x + t2[0] * y + nrm[0] * z, t1[1] * x + t2[1] * y + nrm[1] * z, t1[2] * x + t2[2] * y + nrm[2] * z]; let t = 0.006, hit = false, hitOwn = false;
      while (t < 0.4 && !hitOwn) { const q = [from[0] + d[0] * t, from[1] + d[1] * t, from[2] + d[2] * t], fo = mine(q), f = Math.min(fo, S.any(q)); if (fo < -0.002) hitOwn = true; if (f < -0.002) hit = true; t += Math.max(0.005, (hit ? fo : f) * 0.9); }
      if (!hit && !hitOwn) free++;
      if (!hitOwn) { freeOwn++; way = add(way, d); }
    }
    open[v] = free / RAYS.length; own[v] = freeOwn / RAYS.length; bent.set(freeOwn ? norm(way) : nrm, v * 3);
  }
  // (evened out with its neighbours' twice: forty rays a point leave a grain that would show as blotches at a shade's edge)
  { const nb = Array.from({ length: n1 }, () => []), Q = m1.faces; for (let f = 0; f < Q.length; f += 4) for (let i = 0; i < 4; i++) nb[Q[f + i]].push(Q[f + (i + 1) % 4]);
    // (twice; the head's twice more: a face is looked at close, and at the edge of its own shade what is left of the rays' grain showed as lines)
    for (let it = 0; it < 4; it++) { const o = open.slice(0, n1), w = own.slice(0, n1), b = bent.slice(0, n1 * 3); for (let v = 0; v < n1; v++) { if (it >= 2 && part[v] !== P_.head) continue; let so = o[v], sw = w[v], sb = [b[v * 3], b[v * 3 + 1], b[v * 3 + 2]]; for (const u of nb[v]) { so += o[u]; sw += w[u]; sb[0] += b[u * 3]; sb[1] += b[u * 3 + 1]; sb[2] += b[u * 3 + 2]; } open[v] = so / (nb[v].length + 1); own[v] = sw / (nb[v].length + 1); bent.set(norm(sb), v * 3); } } }
  { const { points, ea, eb } = m2.from, Q = m1.faces, mean = (to, vs) => { let o = 0, m = 0, w = [0, 0, 0]; for (const v of vs) { o += open[v] / vs.length; m += own[v] / vs.length; w[0] += bent[v * 3]; w[1] += bent[v * 3 + 1]; w[2] += bent[v * 3 + 2]; } open[to] = o; own[to] = m; bent.set(norm(w), to * 3); };
    for (let e = 0; e < ea.length; e++) mean(points + e, [ea[e], eb[e]]);
    for (let f = 0; f < Q.length / 4; f++) mean(points + ea.length + f, [Q[f * 4], Q[f * 4 + 1], Q[f * 4 + 2], Q[f * 4 + 3]]); }

  // ── what each point is and how it stands ────────────────────────────────────────────────────────────────────
  const attr = { bone: new Float32Array(n * 4), weight: new Float32Array(n * 4), nor, look: new Float32Array(n * 4), feel: new Float32Array(n * 4), bent: new Float32Array(n * 4), tone: new Float32Array(n * 4) };
  const areola = MARKS[0], within = (q, m) => Math.sqrt(((q[0] - m.at[0]) / m.r[0]) ** 2 + ((q[1] - m.at[1]) / m.r[1]) ** 2 + ((q[2] - m.at[2]) / m.r[2]) ** 2);
  // (how sharply the surface curves at each point: the mean of how fast its normal turns towards each neighbour)
  const curve = new Float32Array(n), cn = new Uint8Array(n);
  { const Q = m2.faces; for (let f = 0; f < Q.length; f += 4) for (let i = 0; i < 4; i++) { const a = Q[f + i], b = Q[f + (i + 1) % 4], d = sub(at(b), at(a)), l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; if (l2 < 1e-12) continue; const k = ((nor[b * 3] - nor[a * 3]) * d[0] + (nor[b * 3 + 1] - nor[a * 3 + 1]) * d[1] + (nor[b * 3 + 2] - nor[a * 3 + 2]) * d[2]) / l2; curve[a] += k; curve[b] += k; cn[a]++; cn[b]++; } }
  // (evened with its neighbours' twice: measured along edges, it wavers from row to row where the faces lie askew, and
  // the light under the skin, read by it, showed the rows at the shade's edge)
  { const Q = m2.faces; for (let v = 0; v < n; v++) if (cn[v]) curve[v] /= cn[v]; for (let it = 0; it < 2; it++) { const acc = Float32Array.from(curve), cnt = new Uint8Array(n).fill(1); for (let f = 0; f < Q.length; f += 4) for (let i = 0; i < 4; i++) { const a = Q[f + i], b = Q[f + (i + 1) % 4]; acc[a] += curve[b]; cnt[a]++; acc[b] += curve[a]; cnt[b]++; } for (let v = 0; v < n; v++) curve[v] = acc[v] / cnt[v]; } }
  // (the skin's tone at a place of the left side, ./table.js TONE: each list's places, each as much as the point is within its reach)
  const toneOf = (list, q) => { let t = 0; for (const [, c, reach, much] of list) { const d2 = ((q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2) / (reach * reach); if (d2 < 9) t += much * Math.exp(-d2); } return t; };
  const low = new Map();
  for (let v = 0; v < n; v++) {
    const p = at(v), nrm = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]], hv = held[v];
    for (let j = 0; j < 4; j++) { attr.bone[v * 4 + j] = hv[j]?.joint ?? 0; attr.weight[v * 4 + j] = hv[j]?.w ?? 0; }
    const q = [Math.abs(p[0]), p[1], p[2]], rigA = B.joints[hv[0].joint].rig;
    // (each a share, soft at its edge: the lips' red over a millimetre or two, the areola's over a little more)
    const are = q[2] > T.nip[2] - 0.012 ? 1 - smooth01((Math.hypot(q[0] - T.nip[0], q[1] - T.nip[1]) / areola.r[0] - 0.8) / 0.3) : 0;
    const nail = ARMS(part[v]) || part[v] === P_.leg ? T.nailAt(p, nrm) : 0;
    // (and what stands close by it, nearer than the rays begin: the web between two fingers, the fold beside the nose)
    const close = Math.max(0, 1 - S.any(add(p, mul(nrm, 0.012))) / 0.0075);
    attr.look.set([Math.max(0.12, open[v] * (1 - 0.6 * close)), 0, nail, are], v * 4);
    // (the cone its light comes from: its middle, and the cosine of its half width; open all round, a quarter turn)
    attr.bent.set([bent[v * 3], bent[v * 3 + 1], bent[v * 3 + 2], Math.sqrt(Math.max(0, 1 - own[v]))], v * 4);
    // how thick the body is under it: straight in, to where the ray leaves it again (a finger, an ear, the nose's wing)
    // (from where the ray is first inside the body: the smooth skin may lie a hair outside the shape it was fitted to)
    let thick = 0.05, inside = -1; for (let t = 0; t < 0.06; t += 0.002) { const f = S.any(sub(p, mul(nrm, t))); if (inside < 0) { if (f < 0) inside = t; else if (t > 0.008) break; } else if (f > 0) { thick = t - inside; break; } }
    attr.feel.set([curve[v], thick, part[v], Math.min(1, toneOf(TONE.stubble, q))], v * 4);
    // its tone: the blood and the pigment place by place, mottled a little (blotches a hand's breadth and a finger's
    // across); how oily; where veins may show
    const mottle = 0.5 * noise3(p[0] * 9 + 3.7, p[1] * 9, p[2] * 9) + 0.5 * noise3(p[0] * 40, p[1] * 40 + 9.1, p[2] * 40);
    attr.tone.set([toneOf(TONE.blood, q) + 0.1 * noise3(p[0] * 14 + 1.3, p[1] * 14, p[2] * 14 + 5.2), toneOf(TONE.pigment, q) + 0.12 * mottle, Math.min(1, toneOf(TONE.oil, q)), Math.min(1, toneOf(TONE.veins, q))], v * 4);
    // the soles: under each foot and toe, the lowest point every two centimetres
    if (/^(foot|toe\d)\./.test(rigA) && p[1] < 0.03) { const k2 = rigA + ':' + Math.round(p[2] / 0.02) + ':' + Math.round(p[0] / 0.03), was = low.get(k2); if (!was || p[1] < was.p[1]) low.set(k2, { rig: rigA, p }); }
  }
  const far = []; for (const f of cage.faces) for (let i = 1; i < f.length - 1; i++) far.push(f[0], f[i], f[i + 1]);
  const fine = triangles({ pos, faces: m2.faces }), coarse = triangles({ pos, faces: m1.faces });
  // how far each level stands off the smooth surface (m): the middle of a face against the surface's own point there
  // (the next finer level's point for that face), the worst but for one in a hundred; the finest a quarter of the
  // middle's (each round quarters it)
  const offOf = (m, faceAt, sizeOf) => { const { points, ea, faces } = m.from, d = new Float32Array(faces); for (let f = 0; f < faces; f++) { const k = sizeOf(f), c = [0, 0, 0]; for (let i = 0; i < k; i++) { const q = at(faceAt(f, i)); c[0] += q[0] / k; c[1] += q[1] / k; c[2] += q[2] / k; } d[f] = len(sub(c, at(points + ea.length + f))); } d.sort(); return d[Math.floor(faces * 0.99)]; };
  const offFar = offOf(m1, (f, i) => cage.faces[f][i], (f) => cage.faces[f].length), offMid = offOf(m2, (f, i) => m1.faces[f * 4 + i], () => 4);
  // (and what a point carries, the lips' edge, an areola, a nail, the shade of a fold, is drawn no finer than a level's
  // points lie apart: a third of the middle length of its faces' sides counts as its being off as well)
  const sideOf = (tri) => { const d = []; for (let t = 0; t < tri.length; t += 3) d.push(len(sub(at(tri[t]), at(tri[t + 1])))); d.sort((a, b) => a - b); return d[d.length >> 1]; };
  const farTri = Uint32Array.from(far), off = [Math.max(offMid / 4, sideOf(fine) / 3), Math.max(offMid, sideOf(coarse) / 3), Math.max(offFar, sideOf(farTri) / 3)];
  // ── the ears ────────────────────────────────────────────────────────────────────────────────────────────────
  // Each its own closed form (./ear.js: an ear stands off the head, and the cage's level rings cannot draw what stands
  // off), its root inside the head's side. Its points are joined to the skin's, on the head's joint, with what the
  // skin's shader reads of a point; its three levels' triangles to the skin's three. The right ear the left's mirror.
  const E = earOf(), headJoint = B.joints.findIndex((j) => j.rig === 'head'), extra = 2 * E.levels.reduce((a, l) => a + l.pos.length / 3, 0);
  const grown = (a, k) => { const b = new a.constructor((n + extra) * k); b.set(a); return b; };
  const all = { pos: grown(pos, 3), fine: [fine], coarse: [coarse], far: [farTri] }, A2 = Object.fromEntries(Object.entries(attr).map(([k, a]) => [k, grown(a, a.length / n)]));
  { let v = n;
    E.levels.forEach((lv, li) => { for (const sx of [1, -1]) {
      const m = lv.pos.length / 3, tri = new Uint32Array(lv.tri.length), kn = new Float32Array(m), cnt = new Uint16Array(m);
      for (let t = 0; t < tri.length; t += 3) { tri[t] = v + lv.tri[t]; tri[t + 1] = v + lv.tri[t + (sx > 0 ? 1 : 2)]; tri[t + 2] = v + lv.tri[t + (sx > 0 ? 2 : 1)]; }
      all[['fine', 'coarse', 'far'][li]].push(tri);
      // (how sharply it curves: as the skin's, the mean of how fast its normal turns towards each neighbour, evened once)
      for (let t = 0; t < lv.tri.length; t += 3) for (let i = 0; i < 3; i++) { const a = lv.tri[t + i], b = lv.tri[t + (i + 1) % 3], d = [lv.pos[b * 3] - lv.pos[a * 3], lv.pos[b * 3 + 1] - lv.pos[a * 3 + 1], lv.pos[b * 3 + 2] - lv.pos[a * 3 + 2]], l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; if (l2 < 1e-14) continue; const k = ((lv.nor[b * 3] - lv.nor[a * 3]) * d[0] + (lv.nor[b * 3 + 1] - lv.nor[a * 3 + 1]) * d[1] + (lv.nor[b * 3 + 2] - lv.nor[a * 3 + 2]) * d[2]) / l2; kn[a] += k; cnt[a]++; kn[b] += k; cnt[b]++; }
      for (let i = 0; i < m; i++, v++) {
        const q = [lv.pos[i * 3], lv.pos[i * 3 + 1], lv.pos[i * 3 + 2]], nx = lv.nor[i * 3], ny = lv.nor[i * 3 + 1], nz = lv.nor[i * 3 + 2], o = Math.min(1, Math.max(0, lv.open[i]));
        all.pos.set([sx * q[0], q[1], q[2]], v * 3); A2.nor.set([sx * nx, ny, nz], v * 3);
        A2.bone.set([headJoint, 0, 0, 0], v * 4); A2.weight.set([1, 0, 0, 0], v * 4);
        // (how thick what lies behind the point is, ./ear.js's: the ear's own plate where it stands free, so the sun comes
        // through it red; the head as well where the ear sits on it. Its shade is kept from going black in the bowl and its
        // blood from the cheek's full red: read by the skin's light as they came, the bowl was raw meat)
        A2.look.set([Math.max(0.3, o), 0, 0, 0], v * 4); A2.bent.set([sx * nx, ny, nz, Math.sqrt(Math.max(0, 1 - Math.max(0.3, o)))], v * 4);
        A2.feel.set([Math.max(-150, Math.min(150, cnt[i] ? kn[i] / cnt[i] : 0)), lv.thick[i], P_.head, 0], v * 4);
        A2.tone.set([Math.min(0.5, toneOf(TONE.blood, q)) + 0.06 * noise3(q[0] * 14 + 1.3, q[1] * 14, q[2] * 14 + 5.2), toneOf(TONE.pigment, q), 0, 0], v * 4);
      }
    } });
  }
  const joined = (list) => { const out = new Uint32Array(list.reduce((a, l) => a + l.length, 0)); let o = 0; for (const l of list) { out.set(l, o); o += l.length; } return out; };
  return {
    joints: B.joints, soles: [...low.values()].map(({ rig, p }) => ({ rig, at: sub(p, RIG[rig].at) })), pos: all.pos, fine: joined(all.fine), coarse: joined(all.coarse), far: joined(all.far), off, attr: A2,
    ears: { points: extra, fine: E.levels[0].tri.length / 3 * 2 },
    maps: { scatter: scatterMap(), micro: microMap() },
    headCover: T.headCover,
    counts: { points: n + extra, fine: fine.length / 3 + (2 * E.levels[0].tri.length) / 3, coarse: coarse.length / 3 + (2 * E.levels[1].tri.length) / 3, far: far.length / 3 + (2 * E.levels[2].tri.length) / 3, cage: n0, joints: B.joints.length },
    skin: SKIN / 1000,
  };
}
