// The zoo's hierarchies proved on the CPU (intent 0038, stage 8b): each blob kind's (assets/kit/blob.js blobHierarchy:
// the grid's levels, assets/kit/diamonds.js; its coarse end the simplifier's, assets/kit/clusters.js tailFrom) built as
// the recipes' workers build it, timed, and held to what the cut (src/scatter/cut.js) takes for granted:
//   - its record: no cluster over MAXT; a parent's error at least BAND times its own; a parent's sphere holding the
//     cluster's, and every place its vertices move to (the morph ends inside it);
//   - its errors true: the farthest any point of a cluster lies from the full mesh, found another way (the nearest point
//     of the full mesh, clusters.js's search, not the same place of the cube), no farther than its error says: a sample
//     of every kind's clusters, and the whole of its coarse end;
//   - its cuts closed: from eyes anywhere, the error allowed growing with each sphere's distance as the cut's does, what
//     the rule draws (each at its morph) holds every edge once each way, at the same two places: no crack, no overlap;
//   - its bands in their rooms: every band (blob.js blobBand) packed into the room the heap gives it (rooms.json,
//     tools/rooms.js), none past it; how many are short (cut down to fit: coarser than a pixel, its drawer counts them).
//
//   bun tools/hierarchies.js [kinds: 0,1,2] [cuts: 12]    a line a kind; exits 1 if anything fails
import { readFileSync } from 'node:fs';
import { blobHierarchy, blobBand } from '../assets/kit/blob.js';
import { build, tailFrom, ready, gridOf, nearest } from '../assets/kit/clusters.js';
import { useBuilder, roomFrom, MAXT } from '../assets/kit/surface.js';
import { STILL_PER } from '../assets/kit/solid.js';
import { BAND, SURFACE_LEVELS } from '../src/detail/error.js';

const [kinds = '0,1,2', cuts = '12'] = process.argv.slice(2);
await ready; useBuilder(build, tailFrom);
// (numbers 0 … 1 in the same order every run: the same samples, the same eyes)
let seed = 1; const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const away = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** What of hierarchy D breaks its record's rules (above), in words. */
function record(D) {
  const out = [];
  for (const c of D.clusters) {
    const P = c.parent, end = P.err === Infinity, holder = end ? c.self : P;
    if (c.n > MAXT || c.tris.length !== c.n * 3 || c.to.length !== c.verts.length * 7) out.push('a cluster out of shape');
    if (!end && !(P.err >= c.self.err * BAND * (1 - 1e-6))) out.push(`a parent's error ${P.err} under BAND times ${c.self.err}`);
    if (!end && away(P.c, c.self.c) + c.self.r > P.r * (1 + 1e-5) + 1e-7) out.push('a parent sphere short of its cluster\'s');
    for (let j = 0; j < c.verts.length; j++) if (away(holder.c, [c.to[j * 7], c.to[j * 7 + 1], c.to[j * 7 + 2]]) > holder.r * (1 + 1e-5) + 1e-6) { out.push('a morph ending outside its parent\'s sphere'); break; }
  }
  return [...new Set(out)];
}
/** The most a sampled cluster of D lies from its full mesh (its corners, its edges' and its triangles' middles, each to
    the nearest point of the full mesh), over the error it says. */
function truth(D) {
  const P = D.M.pos, full = [], R = new Float64Array(4);
  for (const c of D.clusters) if (c.self.err === 0) for (let i = 0; i < c.tris.length; i++) full.push(c.verts[c.tris[i]]);
  const F = Uint32Array.from(full), G = gridOf(F, P), some = D.clusters.filter((c) => c.self.err > 0).sort(() => rand() - 0.5).slice(0, 64);
  let worst = 0;
  for (const c of [...some, ...D.clusters.slice(-40)]) {
    const at = (j, i) => P[c.verts[c.tris[j]] * 3 + i];
    let far = 0;
    for (let t = 0; t < c.tris.length; t += 3) for (const w of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]]) {
      const p = [0, 1, 2].map((i) => at(t, i) * w[0] + at(t + 1, i) * w[1] + at(t + 2, i) * w[2]);
      nearest(G, P, F, p[0], p[1], p[2], R); far = Math.max(far, Math.sqrt(R[0]));
    }
    worst = Math.max(worst, far / c.self.err);
  }
  return worst;
}
/** The edges left open (drawn other than once each way) over n cuts of D: an eye anywhere round it, the error allowed
    a share of each sphere's distance (as the cut's: the dial over the pixels its size covers), each cluster drawn by the
    rule at its morph. */
function closed(D, n) {
  const P = D.M.pos, f = new Float32Array(3), u = new Uint32Array(f.buffer), key = (p) => { f.set(p); return `${u[0]},${u[1]},${u[2]}`; };
  let open = 0;
  for (let view = 0; view < n; view++) {
    const d = [rand() - 0.5, rand() - 0.5, rand() - 0.5], far = 0.55 + 6 * rand() ** 2, l = Math.hypot(...d), eye = d.map((x, i) => (x / l) * far + (i === 1 ? 0.5 : 0)), share = 10 ** (-4 + 3 * rand());
    const allowed = (s) => share * Math.max(away(eye, s.c) - s.r, 1e-3), edges = new Map();
    for (const c of D.clusters) {
      const bS = allowed(c.self), bP = allowed(c.parent);
      if (!(c.self.err <= bS && c.parent.err > bP)) continue;
      const x = Math.min(1, Math.max(0, (c.parent.err - bP * BAND) / (bP - bP * BAND))), t = c.parent.err === Infinity ? 0 : x * x * (3 - 2 * x);   // (the cut's smoothstep)
      const at = (j) => key([0, 1, 2].map((i) => P[c.verts[j] * 3 + i] + (c.to[j * 7 + i] - P[c.verts[j] * 3 + i]) * t));
      for (let i = 0; i < c.tris.length; i += 3) { const q = [at(c.tris[i]), at(c.tris[i + 1]), at(c.tris[i + 2])]; for (let e = 0; e < 3; e++) { const k = `${q[e]}|${q[(e + 1) % 3]}`; edges.set(k, (edges.get(k) ?? 0) + 1); } }
    }
    for (const [k, m] of edges) { const [a, b] = k.split('|'); if (m !== 1 || edges.get(`${b}|${a}`) !== 1) open++; }
  }
  return open;
}

/** Kind k's bands packed into their rooms (rooms.json's zoo blobs): how many are cut down to fit, and which pass
    their room, in words. */
const ROOMS = JSON.parse(readFileSync(new URL('../rooms.json', import.meta.url), 'utf8'))['zoo: blobs'];
function rooms(k) {
  let cut = 0; const over = [];
  for (let l = 0; l < SURFACE_LEVELS; l++) {
    const r = roomFrom(ROOMS.shapes[0][l], STILL_PER, l), room = { tris: r.tris, elems: r.verts * STILL_PER };
    const m = blobBand(k, l, room);
    if (m.index.length > room.tris * 3 || m.verts.length / 4 > room.elems) over.push(`band ${l} past its room`);
    if (m.short) cut++;
  }
  return { cut, over };
}

let failed = false;
for (const k of kinds.split(',').map(Number)) {
  const t0 = performance.now(), D = blobHierarchy(k), ms = performance.now() - t0, broke = record(D), worst = truth(D), open = closed(D, Number(cuts)), R = rooms(k);
  failed ||= broke.length > 0 || worst > 1 || open > 0 || R.over.length > 0;
  console.log(`blob ${k}: ${(12 * D.stats.N ** 2).toLocaleString()} triangles, ${D.clusters.length} clusters, built in ${ms.toFixed(0)} ms; record ${broke.length ? broke.join('; ') : 'kept'}; errors ${worst.toFixed(2)} of what they say at most; ${cuts} cuts ${open ? `with ${open} edges open` : 'closed'}; bands ${R.over.length ? R.over.join('; ') : 'in their rooms'}, ${R.cut} cut down to fit`);
}
process.exit(failed ? 1 : 0);
