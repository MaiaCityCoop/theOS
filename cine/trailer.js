// A small cinematic trailer of the land, composed from a seed: it reads the world's own functions
// (where the river runs, how high the ground is) and sets a timeline of shots along the river:
// wide, medium, close, a few unusual angles, a drone flight. Nothing is rendered ahead: the
// timeline only moves the virtual camera through the real world.
import * as W from '/src/world.js';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// a point of the river's line, with its tangent, its normal and its half-width
function onRiver(x, z) {
  for (let i = 0; i < 14; i++) { const R = W.riverAt(x, z), g2 = R.gx * R.gx + R.gz * R.gz || 1e-9; x -= (R.r * R.gx) / g2; z -= (R.r * R.gz) / g2; }
  const R = W.riverAt(x, z), gl = Math.hypot(R.gx, R.gz) || 1;
  return { x, z, nx: R.gx / gl, nz: R.gz / gl, tx: -R.gz / gl, tz: R.gx / gl, w: R.w };
}
function findRiver(x0, z0) {
  for (let r = 0; r < 6000; r += 8) for (let a = 0; a < 6.283; a += 8 / (r + 8)) {
    const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
    if (W.riverAt(x, z).d < 5 && (!W.aridAt || W.aridAt(x, z) < 0.1)) return onRiver(x, z);
  }
  return onRiver(x0, z0);
}
function trace(p, dir, step, n) { // along the river, downstream or up
  const pts = [p]; let tx = p.tx * dir, tz = p.tz * dir;
  for (let i = 0; i < n; i++) {
    const q = onRiver(pts[i].x + tx * step, pts[i].z + tz * step);
    if (q.tx * tx + q.tz * tz < 0) { q.tx = -q.tx; q.tz = -q.tz; }
    tx = q.tx; tz = q.tz; pts.push(q);
  }
  pts[0] = { ...p, tx: p.tx * dir, tz: p.tz * dir };
  return pts;
}

/**
 * The trailer for a seed: a list of clips for __cine.load(). One line of story, always in this order:
 *   ARRIVE   1 from the sky down to the river · 2 low and fast down the river, rising, slowing
 *   LOOK     3 on the bank, the river going by · 4 the same look, closer: the waterline · 5 down in the grass
 *   LEAVE    6 straight up out of the grass · 7 back over the meadow to the river · 8 up and away
 * The seed picks the stretch of river (the greenest of a few), the bank and the direction of travel.
 * Every cut is meant: see each clip's `why`.
 */
function stretch(seed) {
  const R = rng(seed * 7919 + 13), r = (a, b) => a + (b - a) * R();
  // a few stretches; the one with the least dry land along it
  let pts, best = 1e9;
  for (let k = 0; k < 6; k++) {
    const c = trace(findRiver(r(-3000, 3000), r(-3000, 3000)), R() < 0.5 ? 1 : -1, 22, 24);
    let dry = 0; if (W.aridAt) for (const p of c) dry += W.aridAt(p.x + p.nx * 30, p.z + p.nz * 30) + W.aridAt(p.x - p.nx * 30, p.z - p.nz * 30);
    if (dry < best) { best = dry; pts = c; }
    if (!W.aridAt) break;
  }
  const side = R() < 0.5 ? 1 : -1;
  // a place: from a river point p, `across` metres off its line (to our bank when > 0), `along` metres
  // in the direction of travel, `h` metres over the ground there
  const at = (p, across, along, h) => {
    const x = p.x + p.nx * side * across + p.tx * along, z = p.z + p.nz * side * across + p.tz * along;
    return [x, W.heightAt(x, z) + h, z];
  };
  const surf = (p, across, along, h) => { const v = at(p, across, along, 0); v[1] = W.baseB(v[0], v[2]) - 0.2 + h; return v; }; // over the water
  return { pts, side, at, surf, r };
}

/**
 * Still scenes on the same stretch, for testing lenses: each is one camera place and one thing it
 * looks at; the lens is put on afterwards. The same place through every lens is the test.
 */
export function scenes(seed = 1) {
  const { pts, at, surf } = stretch(seed), M = pts[13], G = pts[15], E = pts[18];
  return [
    { name: 'Vista', what: 'the land from 60 m up, down the river', pos: surf(pts[0], 0, -120, 60), look: surf(pts[6], 0, 0, 0) },
    { name: 'Far bank', what: 'standing on the bank, across the water', pos: at(M, M.w + 5, 0, 1.6), look: at(M, -M.w - 3, 4, 0.8) },
    { name: 'Meadow', what: 'eye height over the grass, to the horizon', pos: at(G, G.w + 26, 0, 1.6), look: at(G, G.w + 60, 60, 1.0) },
    { name: 'In the grass', what: '25 cm over the ground, along the blades', pos: at(G, G.w + 22, 0, 0.25), look: at(G, G.w + 22, 8, 0.7) },
    { name: 'Boulder', what: 'a rock field from 40 m, eye height', pos: at(E, E.w + 40, 0, 1.6), look: at(E, E.w + 80, 30, 1.0) },
    { name: 'From above', what: 'straight down from 45 m, bank and meadow', pos: surf(E, E.w, 0, 45), look: surf(E, E.w, 0.5, 0) },
  ];
}

export function trailer(seed = 1) {
  const { pts, side, at, surf, r } = stretch(seed);
  const A = pts[0], M = pts[13], G = pts[15], E = pts[18];
  const clips = [];
  const clip = (c) => clips.push({ ...c, secs: +c.secs.toFixed(1) });

  // ---- ARRIVE ----
  clip({ name: 'From the sky', kind: 'wide', act: 'arrive', secs: r(7, 8), ease: 'in', in: 'dip', inSecs: 1.6,
    why: 'Opens out of the sky and tilts down: first the horizon, then the river the film will follow. Leaves moving.',
    keys: [
      { pos: surf(A, 0, -210, 95), look: surf(pts[10], 0, 0, 60), mm: 18 },
      { pos: surf(A, 0, -150, 70), look: surf(pts[5], 0, 0, 0), mm: 18 },
      { pos: surf(A, 0, -80, 38), look: surf(pts[2], 0, 0, 0), mm: 18 },
    ] });
  const drone = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    drone.push({ pos: surf(pts[i], Math.sin(i * 0.8) * pts[i].w * 0.3, 0, 2.2 + 13 * u * u), look: surf(pts[Math.min(i + 3, 23)], 0, 0, 0.5 + 2 * u), mm: 24, roll: Math.sin(i * 0.8 + 1.2) * 6 * (1 - u) });
  }
  clip({ name: 'Down the river', kind: 'drone', act: 'arrive', secs: r(10.5, 12), ease: 'out', in: 'cut',
    why: 'Cut on motion, and on contrast: from high and slow to low and fast along the same line. Rises and slows over the place we stop at.',
    keys: drone });

  // ---- LOOK ----
  clip({ name: 'The river going by', kind: 'medium', act: 'look', secs: r(5.5, 6.5), ease: 'in', in: 'dissolve', inSecs: 1.2,
    why: 'Dissolve: the flight has come to rest, time passes, we are standing on the bank. Travel keeps the flight\'s direction; the look turns across the water.',
    keys: [
      { pos: at(M, M.w + 5, -5, 1.6), look: at(M, -M.w - 3, -1, 0.8), mm: 35 },
      { pos: at(M, M.w + 5, 2, 1.6), look: at(M, -M.w - 3, 6, 0.8), mm: 35 },
    ] });
  clip({ name: 'Where the water meets the sand', kind: 'close', act: 'look', secs: r(5, 6), ease: 'out', in: 'cut',
    why: 'A cut in on the same axis, on the move: same look across, same direction of travel, 35 to 85 mm. Comes to rest on the waterline.',
    keys: [
      { pos: at(M, M.w * 0.95 + 1.7, 2.6, 0.55), look: surf(M, M.w * 0.96, 8.5, 0), mm: 85 },
      { pos: at(M, M.w * 0.95 + 1.7, 5.2, 0.55), look: surf(M, M.w * 0.96, 10.5, 0), mm: 85 },
    ] });
  clip({ name: 'Among the blades', kind: 'low angle', act: 'look', secs: r(6, 7), ease: 'in', in: 'dissolve', inSecs: 1.2,
    why: 'Dissolve to the other thing the land is made of. Contrast: the longest lens to the widest, eye in the grass. Pushes on and tilts up to the sky.',
    keys: [
      { pos: at(G, G.w + 22, -3, 0.2), look: at(G, G.w + 22, 6, 0.9), mm: 12, roll: 9 * side },
      { pos: at(G, G.w + 22, 0, 0.26), look: at(G, G.w + 22, 8, 2.4), mm: 12, roll: 4 * side },
      { pos: at(G, G.w + 22, 2.4, 0.5), look: at(G, G.w + 22, 7, 9), mm: 12, roll: 0 },
    ] });

  // ---- LEAVE ----
  { // straight up from that very spot, the view turning; the river comes into the frame
    const x = at(G, G.w + 22, 2.4, 0), lo = [x[0], x[1] + 9, x[2]], mid = [x[0], x[1] + 38, x[2]], hi = [x[0], x[1] + 82, x[2]];
    const g = at(G, G.w + 22, 3.2, 0), g2 = at(G, G.w + 10, 3.4, 0), g3 = at(G, G.w * 0.4, 3.0, 0);
    clip({ name: 'Lifting off', kind: 'top down', act: 'leave', secs: r(6.5, 7.5), ease: 'out', in: 'cut',
      why: 'Cut on motion: the tilt up becomes a climb, from the same spot. The view turns over and the river slides into frame; slows at the top.',
      keys: [{ pos: lo, look: g, mm: 28, roll: 0 }, { pos: mid, look: g2, mm: 28, roll: 12 * side }, { pos: hi, look: g3, mm: 28, roll: 22 * side }] });
  }
  clip({ name: 'Back to the water', kind: 'glide', act: 'leave', secs: r(5.5, 6.5), ease: 'in', in: 'dissolve', inSecs: 1.4,
    why: 'Dissolve from the height back to the ground, further on: low over the meadow, gathering speed towards the river.',
    keys: [
      { pos: at(E, E.w + 70, -14, 1.4), look: surf(E, 0, 20, 0.5), mm: 50 },
      { pos: at(E, E.w + 16, 0, 1.2), look: surf(E, 0, 34, 0.5), mm: 50 },
    ] });
  clip({ name: 'Leaving', kind: 'crane', act: 'leave', secs: r(9, 10), ease: 'out', in: 'cut', out: 'dip',
    why: 'Cut on motion: the glide carries over the bank and up. The opening run backwards: river, then land, then sky; widens to 14 mm, comes to rest, fades to the sky.',
    keys: [
      { pos: at(E, E.w + 6, 5, 1.6), look: surf(E, 0, 40, 0.5), mm: 35 },
      { pos: surf(E, 0, 14, 9), look: surf(pts[21], 0, 0, 2), mm: 24 },
      { pos: surf(E, -E.w * 0.5, 4, 40), look: surf(pts[23], 0, 0, 12), mm: 18 },
      { pos: surf(E, -E.w, -30, 96), look: surf(pts[23], 0, 120, 70), mm: 14 },
    ] });
  return clips;
}
export const floor = (x, z) => Math.max(W.heightAt(x, z), W.baseB(x, z) - 0.2);
