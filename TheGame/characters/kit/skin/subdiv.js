// A subdivision surface (intent 0041): a cage of a few thousand faces made smooth the way films and games make a body
// smooth (Catmull & Clark 1978: every face a point, every edge a point, every old point moved; each round four times
// the faces, the surface nearer its limit, which is smooth wherever the cage is). Plain JS, no three: it runs in the
// workers that lay the skin (./build.js), or under node.
//
//   refine(mesh) -> mesh        one round: { pos, faces } -> the same, every face a quad; and `from`: what its points
//                               came of (the old points first, as they were numbered; then a point to each old edge,
//                               ea to eb; then one to each old face, in their order)
//                               pos    Float64Array, three numbers a point
//                               faces  the cage's: arrays of point numbers (any polygon); a round's: a Uint32Array, four a face
//   limit(mesh) -> { pos, nor } where each point of a round's mesh lies on the smooth surface itself, and how that
//                               surface faces there (its normal: exact, not the mean of the faces round the point)
const KEY = 2 ** 26;   // (an edge's name: its lower point's number times this, plus its higher's)

/** One round. */
export function refine({ pos, faces }) {
  const quads = faces instanceof Uint32Array, nf = quads ? faces.length / 4 : faces.length, nv = pos.length / 3;
  const size = (f) => (quads ? 4 : faces[f].length), at = (f, i) => (quads ? faces[f * 4 + i] : faces[f][i]);
  // the edges: each once, with the faces either side of it
  const edge = new Map(), ea = [], eb = [], ef = [];
  for (let f = 0; f < nf; f++) for (let n = size(f), i = 0; i < n; i++) {
    const a = at(f, i), b = at(f, (i + 1) % n), k = a < b ? a * KEY + b : b * KEY + a; let e = edge.get(k);
    if (e === undefined) { e = ea.length; edge.set(k, e); ea.push(a); eb.push(b); ef.push(f, -1); } else ef[e * 2 + 1] = f;
  }
  const ne = ea.length, NV = nv + ne + nf, E0 = nv, F0 = nv + ne;
  const eOf = (a, b) => edge.get(a < b ? a * KEY + b : b * KEY + a);
  // where each new point lies: a face's, an edge's, an old point's
  const valence = new Uint16Array(nv), border = new Uint8Array(nv);
  for (let e = 0; e < ne; e++) { valence[ea[e]]++; valence[eb[e]]++; if (ef[e * 2 + 1] < 0) border[ea[e]] = border[eb[e]] = 1; }
  const carry = (src, n) => {
    const out = new Float64Array(NV * n), face = new Float64Array(nf * n);
    for (let f = 0; f < nf; f++) { const m = size(f); for (let i = 0; i < m; i++) { const v = at(f, i); for (let c = 0; c < n; c++) face[f * n + c] += src[v * n + c] / m; } }
    out.set(face, F0 * n);
    // an edge's point: the mean of its two ends and of the two faces' points (on a border: of its ends)
    for (let e = 0; e < ne; e++) {
      const a = ea[e], b = eb[e], f1 = ef[e * 2], f2 = ef[e * 2 + 1];
      for (let c = 0; c < n; c++) out[(E0 + e) * n + c] = f2 < 0 ? (src[a * n + c] + src[b * n + c]) / 2 : (src[a * n + c] + src[b * n + c] + face[f1 * n + c] + face[f2 * n + c]) / 4;
    }
    // an old point: (F + 2R + (n - 3)P) / n, F the mean of the faces' points round it, R the mean of its edges' middles
    const F = new Float64Array(nv * n), R = new Float64Array(nv * n), nfa = new Uint16Array(nv), B = new Float64Array(nv * n);
    for (let f = 0; f < nf; f++) { const m = size(f); for (let i = 0; i < m; i++) { const v = at(f, i); nfa[v]++; for (let c = 0; c < n; c++) F[v * n + c] += face[f * n + c]; } }
    for (let e = 0; e < ne; e++) {
      const a = ea[e], b = eb[e], edgeOnBorder = ef[e * 2 + 1] < 0;
      for (let c = 0; c < n; c++) { const mid = (src[a * n + c] + src[b * n + c]) / 2; R[a * n + c] += mid; R[b * n + c] += mid; if (edgeOnBorder) { B[a * n + c] += src[b * n + c]; B[b * n + c] += src[a * n + c]; } }
    }
    for (let v = 0; v < nv; v++) {
      const k = valence[v];
      for (let c = 0; c < n; c++) out[v * n + c] = border[v] ? 0.75 * src[v * n + c] + 0.125 * B[v * n + c] : (F[v * n + c] / nfa[v] + (2 * R[v * n + c]) / k + (k - 3) * src[v * n + c]) / k;
    }
    return out;
  };
  // the new faces: a quad to each corner of an old face
  let total = 0; for (let f = 0; f < nf; f++) total += size(f);
  const Q = new Uint32Array(total * 4); let q = 0;
  for (let f = 0; f < nf; f++) for (let n = size(f), i = 0; i < n; i++) {
    const v = at(f, i); Q[q++] = v; Q[q++] = E0 + eOf(v, at(f, (i + 1) % n)); Q[q++] = F0 + f; Q[q++] = E0 + eOf(at(f, (i + n - 1) % n), v);
  }
  return { pos: carry(pos, 3), faces: Q, from: { points: nv, ea: Uint32Array.from(ea), eb: Uint32Array.from(eb), faces: nf } };
}

/** The smooth surface itself under a mesh of quads: each point's place on it and its normal there (Halstead, Kass &
    DeRose 1993: the limit of the rounds, found at once from the ring of points round each). */
export function limit({ pos, faces }) {
  const nv = pos.length / 3, nf = faces.length / 4;
  // round each point, in order: its neighbours along an edge (e) and across a face (d), found by walking its faces
  const first = new Int32Array(nv).fill(-1), next = new Int32Array(nf * 4).fill(-1);   // (each point's corners, chained)
  for (let c = 0; c < nf * 4; c++) { const v = faces[c]; next[c] = first[v]; first[v] = c; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), ring = [], after = new Map();
  for (let v = 0; v < nv; v++) {
    // each face at v gives (this edge's end, the far corner, the next edge's end); chained by the edge they share
    after.clear(); let n = 0, start = -1;
    for (let c = first[v]; c >= 0; c = next[c]) { const f = c - (c % 4), i = c % 4, e1 = faces[f + (i + 1) % 4], d = faces[f + (i + 2) % 4], e2 = faces[f + (i + 3) % 4]; after.set(e1, [d, e2]); if (start < 0) start = e1; n++; }
    ring.length = 0; let e = start, whole = true;
    for (let i = 0; i < n; i++) { const a = after.get(e); if (!a) { whole = false; break; } ring.push(e, a[0]); e = a[1]; }
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (!whole || e !== start) { P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; continue; }   // (a border's point: left where it is; its normal from its faces, below)
    let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
    const An = 1 + Math.cos((2 * Math.PI) / n) + Math.cos(Math.PI / n) * Math.sqrt(2 * (9 + Math.cos((2 * Math.PI) / n)));
    for (let i = 0; i < n; i++) {
      const ev = ring[i * 2] * 3, dv = ring[i * 2 + 1] * 3, c0 = Math.cos((2 * Math.PI * i) / n), c1 = Math.cos((2 * Math.PI * (i + 1)) / n), cm = Math.cos((2 * Math.PI * (i - 1)) / n);
      sx += 4 * pos[ev] + pos[dv]; sy += 4 * pos[ev + 1] + pos[dv + 1]; sz += 4 * pos[ev + 2] + pos[dv + 2];
      // (two ways along the surface: the same shares, one a step further round)
      const wa = An * c0, wd = c0 + c1, wb = An * cm, we = cm + c0;
      ax += wa * pos[ev] + wd * pos[dv]; ay += wa * pos[ev + 1] + wd * pos[dv + 1]; az += wa * pos[ev + 2] + wd * pos[dv + 2];
      bx += wb * pos[ev] + we * pos[dv]; by += wb * pos[ev + 1] + we * pos[dv + 1]; bz += wb * pos[ev + 2] + we * pos[dv + 2];
    }
    const k = 1 / (n * (n + 5));
    P[v * 3] = (n * n * x + sx) * k; P[v * 3 + 1] = (n * n * y + sy) * k; P[v * 3 + 2] = (n * n * z + sz) * k;
    N[v * 3] = by * az - bz * ay; N[v * 3 + 1] = bz * ax - bx * az; N[v * 3 + 2] = bx * ay - by * ax;   // (b is a step before a round the point: b x a faces out when the faces are wound outwards)
  }
  // which way is out: as the faces say (and a border's point, or one whose two ways lie along one line: from its faces alone)
  const G = new Float32Array(nv * 3);
  for (let f = 0; f < nf; f++) {
    const a = faces[f * 4] * 3, b = faces[f * 4 + 1] * 3, c = faces[f * 4 + 2] * 3, d = faces[f * 4 + 3] * 3;
    const ux = P[c] - P[a], uy = P[c + 1] - P[a + 1], uz = P[c + 2] - P[a + 2], vx = P[d] - P[b], vy = P[d + 1] - P[b + 1], vz = P[d + 2] - P[b + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const p of [a, b, c, d]) { G[p] += nx; G[p + 1] += ny; G[p + 2] += nz; }
  }
  for (let v = 0; v < nv; v++) {
    let x = N[v * 3], y = N[v * 3 + 1], z = N[v * 3 + 2], l = Math.hypot(x, y, z); const gx = G[v * 3], gy = G[v * 3 + 1], gz = G[v * 3 + 2], gl = Math.hypot(gx, gy, gz) || 1;
    if (l < 1e-14) { x = gx; y = gy; z = gz; l = gl; } else if (x * gx + y * gy + z * gz < 0) { x = -x; y = -y; z = -z; }
    N[v * 3] = x / l; N[v * 3 + 1] = y / l; N[v * 3 + 2] = z / l;
  }
  return { pos: P, nor: N };
}

/** A mesh of quads as triangles (each quad cut along its shorter diagonal). */
export function triangles({ pos, faces }) {
  const nf = faces.length / 4, T = new Uint32Array(nf * 6), d2 = (a, b) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
  for (let f = 0; f < nf; f++) {
    const a = faces[f * 4], b = faces[f * 4 + 1], c = faces[f * 4 + 2], d = faces[f * 4 + 3];
    if (d2(a, c) <= d2(b, d)) T.set([a, b, c, a, c, d], f * 6); else T.set([a, b, d, b, c, d], f * 6);
  }
  return T;
}
