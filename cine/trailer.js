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

/** The trailer for a seed: a list of clips for __cine.load(). */
export function trailer(seed = 1) {
  const R = rng(seed * 7919 + 13), r = (a, b) => a + (b - a) * R();
  const start = findRiver(r(-2500, 2500), r(-2500, 2500));
  const pts = trace(start, R() < 0.5 ? 1 : -1, 22, 18), side = R() < 0.5 ? 1 : -1;
  // a place: from a river point p, `across` metres off its line (past the bank when > 0), `along` metres
  // down it, `h` metres over the ground there
  const at = (p, across, along, h) => {
    const x = p.x + p.nx * side * across + p.tx * along, z = p.z + p.nz * side * across + p.tz * along;
    return [x, W.heightAt(x, z) + h, z];
  };
  const surf = (p, across, along, h) => { const v = at(p, across, along, 0); v[1] = W.baseB(v[0], v[2]) + h; return v; }; // over the water
  const A = pts[0], M = pts[6], D = pts[11], E = pts[15];
  const clips = [];
  const clip = (name, kind, secs, ease, keys) => clips.push({ name, kind, secs: +secs.toFixed(1), ease, keys });

  clip('The land', 'wide', r(5.5, 6.5), 'inout', [
    { pos: at(A, A.w + 115, -45, 24), look: surf(A, 0, 30, 0), mm: 18 },
    { pos: at(A, A.w + 88, -28, 17), look: surf(A, 0, 45, 0), mm: 18 },
  ]);
  const drone = [];
  for (let i = 0; i <= 12; i++) drone.push({ pos: surf(pts[i], Math.sin(i * 0.7) * pts[i].w * 0.35, 0, 7 + 20 * (i / 12) ** 1.5), look: surf(pts[Math.min(i + 4, 18)], 0, 0, 0), mm: 24, roll: Math.sin(i * 0.9) * 5 });
  clip('Down the river', 'drone', r(10, 12), 'soft', drone);
  clip('The far bank', 'medium', r(4.5, 5.5), 'inout', [
    { pos: at(M, M.w + 5, -4, 1.6), look: at(M, -M.w - 2, 2, 0.6), mm: 35 },
    { pos: at(M, M.w + 5, 4, 1.6), look: at(M, -M.w - 2, 5, 0.6), mm: 35 },
  ]);
  clip('Where the water meets the sand', 'close', r(4, 5), 'inout', [
    { pos: at(M, M.w + 2.2, -1.6, 0.4), look: surf(M, M.w * 0.92, 5, 0), mm: 85 },
    { pos: at(M, M.w + 2.2, 1.6, 0.45), look: surf(M, M.w * 0.92, 7, 0), mm: 85 },
  ]);
  clip('Among the blades', 'low angle', r(4.5, 5.5), 'inout', [
    { pos: at(M, M.w + 30, 0, 0.2), look: at(M, M.w + 30, 9, 1.5), mm: 12, roll: 11 * side },
    { pos: at(M, M.w + 30, 3.6, 0.3), look: at(M, M.w + 31, 13, 2.2), mm: 12, roll: 4 * side },
  ]);
  { // straight down, turning
    const lo = surf(D, 0, 0, 36), hi = surf(D, 0, 0, 78), g = surf(D, 0, 0.6, 0), g2 = surf(D, 0.6 * side, 0, 0);
    clip('From above', 'top down', r(5.5, 6.5), 'inout', [{ pos: lo, look: g, mm: 35, roll: 0 }, { pos: hi, look: g2, mm: 35, roll: 25 * side }]);
  }
  clip('Over the meadow', 'glide', r(5, 6), 'inout', [
    { pos: at(D, D.w + 62, -10, 1.3), look: surf(D, 0, 12, 0.3), mm: 50 },
    { pos: at(D, D.w + 14, 0, 1.0), look: surf(D, 0, 18, 0.3), mm: 50 },
  ]);
  clip('Light on the water', 'tele', r(4, 5), 'linear', [
    { pos: at(E, E.w + 3, -30, 0.7), look: surf(E, 0, 6, 0), mm: 135 },
    { pos: at(E, E.w + 3, -30, 0.9), look: surf(E, 0, 22, 0), mm: 135 },
  ]);
  clip('Leaving', 'crane', r(7.5, 8.5), 'inout', [
    { pos: at(E, E.w + 4, 0, 2), look: surf(E, 0, 4, 0), mm: 24 },
    { pos: at(E, E.w + 55, -30, 26), look: surf(E, 0, 10, 0), mm: 18 },
    { pos: at(E, E.w + 150, -80, 72), look: surf(E, 0, 30, 0), mm: 14 },
  ]);
  // the middle shots trade places by the seed; the opening, the flight and the ending stay where they are
  const mid = clips.splice(2, 6);
  for (let i = mid.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [mid[i], mid[j]] = [mid[j], mid[i]]; }
  clips.splice(2, 0, ...mid);
  return clips;
}
export const floor = (x, z) => Math.max(W.heightAt(x, z), W.baseB(x, z) - 0.2);
