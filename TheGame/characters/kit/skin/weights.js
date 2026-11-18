// The skin fastened to the bones (intents 0036, 0041): each point of it hangs on the four bones nearest under it, the
// nearer more (linear blend skinning, as a game's skin is carried: ../muscles/flesh.js). Plain JS, no three: it runs in
// the workers that lay the skin (./build.js), or under node.
//
//   bindingOf(bones, T) -> { fasten(p, part) -> [{ joint, w }], joints }
//     fasten   a point's joints and its share on each: of the piece `part` (PARTS' number: an arm's skin hangs only on
//              the arm's bones and the shoulder girdle's, a finger's on its own and the hand's, a limb's on its own side's)
//     joints   the joints the skin hangs on, in the order `joint` numbers them: each its name in the rig and where it
//              stands at rest
import { UNDER, partOf } from './table.js';
import * as F from '../field.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mirror = (n) => n.replace(/\.L$/, '.R');
const solidOf = ([kind, ...a]) => kind === 'rod' ? F.rod(...a) : kind === 'ball' ? F.ball(...a) : F.egg(a[0], a[1], a[2] ? F.frame(...a[2]) : undefined);

export function bindingOf(bones, T) {
  const { RIG, P_, ARMS, small } = T;
  // ── each point fastened: to the four bones nearest under it ──────────────────────────────────────────────────────
  // A point among several bones is carried by each, the nearer more, as a game's skin is by its bones (linear blend
  // skinning, four bones a point: over the loins the pelvis, two vertebrae and a thigh all pull at the same point).
  // (the muscles under it would swell it as they shorten, but they move each its own way and pull the skin into folds
  // and strings where a limb bends far: the bones carry it smoothly)
  const joints = [], number = new Map();
  const jointOf = (rig) => { if (!number.has(rig)) { number.set(rig, joints.length); joints.push({ rig, at: RIG[rig].at.slice() }); } return number.get(rig); };
  // the bones' surfaces as points (a bone's own field is true only near it; the trunk's skin lies a hand's breadth
  // from its spine), both sides' (the left's mirrored: a point by the middle hangs on both thighs, not on one), in a
  // grid; with each its joint and its piece. The gristle and the eyes too.
  const BG = 0.02, raw = [], rigs = [], rigIndex = new Map();
  const put = (x, y, z, rig) => { if (!rigIndex.has(rig)) { rigIndex.set(rig, rigs.length); rigs.push(rig); } raw.push(x, y, z, rigIndex.get(rig)); };
  const surface = (f, lo, hi, rig) => {
    const e = small({ lo, hi }) ? 0.004 : 0.009;   // (as close as the weights need: they are soft over centimetres)
    for (let x = Math.max(-e, lo[0]); x <= hi[0]; x += e) for (let y = lo[1]; y <= hi[1]; y += e) for (let z = lo[2]; z <= hi[2]; z += e) if (Math.abs(f(x, y, z)) < e * 0.7) { const ax = Math.abs(x); put(ax, y, z, rig); if (ax > e) put(-ax, y, z, mirror(rig)); }
  };
  for (const b of bones) if (!b.id.endsWith('.R') && !/^(tooth|patella)/.test(b.id) && b.hi[0] > -0.01) surface((x, y, z) => b.F.f(x, y, z), b.lo, b.hi, b.rig);
  for (const u of UNDER) { const f = F.fieldOf([{ op: 'add', k: 0, s: solidOf(u.solid) }]), c = u.solid[1], e = 0.032; surface((x, y, z) => f.f(x, y, z), sub(c, [e, e, e]), add(c, [e, e, e]), u.rig === 'eye' ? 'eye.L' : u.rig); }
  // (in a grid of cells BG a side, each cell's points together)
  const G0 = [-0.36, -0.06, -0.25], gn = [Math.ceil(0.72 / BG) + 1, Math.ceil(1.92 / BG) + 1, Math.ceil(0.54 / BG) + 1], NP = raw.length / 4;
  const cellOf = (x, y, z) => { const i = Math.floor((x - G0[0]) / BG), j = Math.floor((y - G0[1]) / BG), k = Math.floor((z - G0[2]) / BG); return i < 0 || j < 0 || k < 0 || i >= gn[0] || j >= gn[1] || k >= gn[2] ? -1 : i + gn[0] * (j + gn[1] * k); };
  const start = new Int32Array(gn[0] * gn[1] * gn[2] + 1), px = new Float32Array(NP * 3), prig = new Int16Array(NP);
  for (let n = 0; n < NP; n++) { const c = cellOf(raw[n * 4], raw[n * 4 + 1], raw[n * 4 + 2]); if (c >= 0) start[c + 1]++; }
  for (let c = 0; c < start.length - 1; c++) start[c + 1] += start[c];
  { const fill = start.slice(0, -1); for (let n = 0; n < NP; n++) { const c = cellOf(raw[n * 4], raw[n * 4 + 1], raw[n * 4 + 2]); if (c < 0) continue; const m = fill[c]++; px.set([raw[n * 4], raw[n * 4 + 1], raw[n * 4 + 2]], m * 3); prig[m] = raw[n * 4 + 3]; } }
  // (a point of an arm's skin hangs only on the arm's bones and the shoulder girdle's, never on the ribs beside it; a
  // finger's on its own and the hand's; a point of the other skin on any of its bones, the trunk's, the legs' and the
  // head's, the nearest; and a limb's on its own side's alone: the left knee's skin never on the right thigh)
  const may = (own, rig, x, shoulder) => {
    const part = P_[partOf(rig)];
    if (own === 255) return true;
    if (own === P_.trunk && shoulder && /^upperArm\./.test(rig)) return rig.endsWith(x > 0 ? '.L' : '.R');   // (the trunk's skin over the shoulder's cap rides on the arm too)
    if ((own === P_.leg || ARMS(own)) && rig.endsWith(x > 0 ? '.R' : '.L')) return false;
    return ARMS(own) ? (own === P_.arm ? ARMS(part) || /^(scapula|clavicle)\./.test(rig) : part === own || /^hand\./.test(rig)) : !ARMS(part);
  };
  const mayTable = new Map(), mayOf = (own, x, sh) => { const k = own * 4 + (x > 0 ? 1 : 0) + (sh ? 2 : 0); let t = mayTable.get(k); if (!t) mayTable.set(k, (t = Uint8Array.from(rigs, (r) => (may(own, r, x, sh) ? 1 : 0)))); return t; };
  const best = new Float32Array(rigs.length);
  const fasten = (p, own) => {
    const q = p, ok = mayOf(own, q[0], q[1] > 1.27 && Math.abs(q[0]) > 0.13);
    // the nearest point of each joint's bones, looked for in ever wider shells: an arm's, a hand's, a finger's until the
    // five nearest are sure, or all within 16 cm (a finger's skin has its own three joints and the hand's); the trunk's,
    // the legs' and the head's always as far as 16 cm, so that two points side by side weigh their bones alike (one
    // that stopped looking sooner than its neighbour would make a crease between them as the body bends)
    const ci = Math.floor((q[0] - G0[0]) / BG), cj = Math.floor((q[1] - G0[1]) / BG), ck = Math.floor((q[2] - G0[2]) / BG);
    best.fill(Infinity);
    let r0 = -1;
    for (const r of [2, 4, 8, 16, 24]) {
      for (let k = Math.max(0, ck - r); k <= Math.min(gn[2] - 1, ck + r); k++) for (let j = Math.max(0, cj - r); j <= Math.min(gn[1] - 1, cj + r); j++) {
        const inner = Math.abs(k - ck) <= r0 && Math.abs(j - cj) <= r0;
        for (let i = Math.max(0, ci - r); i <= Math.min(gn[0] - 1, ci + r); i++) {
          if (inner && Math.abs(i - ci) <= r0) { i = Math.min(gn[0] - 1, ci + r0); continue; }
          const c = i + gn[0] * (j + gn[1] * k);
          for (let m = start[c]; m < start[c + 1]; m++) { const g = prig[m]; if (!ok[g]) continue; const dx = px[m * 3] - q[0], dy = px[m * 3 + 1] - q[1], dz = px[m * 3 + 2] - q[2], d = dx * dx + dy * dy + dz * dz; if (d < best[g]) best[g] = d; }
        }
      }
      r0 = r;
      let sure = 0; const lim = (r * BG) ** 2; for (let g = 0; g < rigs.length; g++) if (best[g] <= lim) sure++;
      if ((ARMS(own) && sure >= 5) || (r >= 8 && sure >= 1)) break;   // (within 16 cm, all there are; beyond, the nearest)
    }
    const near = new Map(); for (let g = 0; g < rigs.length; g++) if (best[g] < Infinity) near.set(rigs[g], Math.sqrt(best[g]));
    const FAR = Math.max(8, r0) * BG, cand = [...near].map(([rig, d]) => ({ rig, d })).filter((c) => c.d < FAR).sort((a, b) => a.d - b.d);
    if (!cand.length) return [{ joint: jointOf('hips'), w: 1 }];
    // the weights: each falls with the distance, the fifth's taken from all four (so that where the fourth and the
    // fifth change places the point does not jump; and none beyond the farthest looked at); softer over the trunk and the
    // legs, whose skin lies far from the bones and bends with the whole spine
    const soft = ARMS(own) ? 0.04 : 0.06, w = (c) => 1 / (c.d + soft) ** 2, w5 = w(cand[4] ?? { d: FAR });
    const out = cand.slice(0, 4).map((c) => ({ joint: jointOf(c.rig), w: w(c) - w5 })), all = out.reduce((a, c) => a + c.w, 0), kept = out.filter((c) => c.w > 0.004 * all), sum = kept.reduce((a, c) => a + c.w, 0);
    return kept.map((c) => ({ joint: c.joint, w: c.w / sum }));
  };
  return { fasten, joints };
}
