// The impostors' smaller pictures (src/detail/impostor.js), off the page's thread: from a layer's pictures as the GPU
// baked them (side x side texels, a picture every `cell` texels a side), each level half the one before, down to `least`
// texels a picture, no picture bleeding into the next. A texel of the next level is the four under it: their mean cover,
// the rest (colour, way, depth, light) as the covered ones are, by how much each covers. Every level's alpha is scaled
// picture by picture until as much of it is over the cut (0.5) as the picture covers (Castaño 2010): read at any
// distance and alpha tested, a crown covers what its leaves cover, neither thinning away nor filling in. A texel nothing
// covers takes its covered neighbours' rest, a few rings out, so nothing wrong is read beside an edge.
// Plain JS: { id, colour, data, side, cell, least } is answered { id, levels: [{ colour, data, n }] }.
const N3 = [0, 0, 0], E2 = [0, 0];
const dec = (u, v, out) => { const x = u * 2 - 1, y = v * 2 - 1, z = 1 - Math.abs(x) - Math.abs(y), k = Math.max(-z, 0), a = x + (x >= 0 ? -k : k), b = y + (y >= 0 ? -k : k), l = Math.hypot(a, b, z) || 1; out[0] = a / l; out[1] = b / l; out[2] = z / l; };   // (octahedral, 0 … 1: src/scatter/unpack.js octDir)
const enc = (x, y, z, out) => { const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; let u = x / l, v = y / l; if (z < 0) { const u0 = u; u = (1 - Math.abs(v)) * (u0 >= 0 ? 1 : -1); v = (1 - Math.abs(u0)) * (v >= 0 ? 1 : -1); } out[0] = u * 0.5 + 0.5; out[1] = v * 0.5 + 0.5; };
/** A level as floats a texel: a (cover), c (rgb), m (its way), d (depth), w (light). */
const level = (n) => ({ n, a: new Float32Array(n * n), c: new Float32Array(n * n * 3), m: new Float32Array(n * n * 3), d: new Float32Array(n * n), w: new Float32Array(n * n) });
function floatsOf(colour, data, n) {
  const L = level(n);
  for (let i = 0; i < n * n; i++) { L.a[i] = colour[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) L.c[i * 3 + k] = colour[i * 4 + k] / 255; dec(data[i * 4] / 255, data[i * 4 + 1] / 255, N3); L.m.set(N3, i * 3); L.d[i] = data[i * 4 + 2] / 255; L.w[i] = data[i * 4 + 3] / 255; }
  return L;
}
function halve(L) {
  const H = level(L.n >> 1), n = H.n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = y * n + x; let a = 0, wt = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const s = (y * 2 + j) * L.n + x * 2 + i, q = Math.max(L.a[s], 1e-4); a += L.a[s]; wt += q;   // (an uncovered texel counts a little: what was dilated into it, where none of the four covers)
      for (let c = 0; c < 3; c++) { H.c[o * 3 + c] += L.c[s * 3 + c] * q; H.m[o * 3 + c] += L.m[s * 3 + c] * q; } H.d[o] += L.d[s] * q; H.w[o] += L.w[s] * q;
    }
    const l = Math.hypot(H.m[o * 3], H.m[o * 3 + 1], H.m[o * 3 + 2]) || 1; H.a[o] = a / 4; H.d[o] /= wt; H.w[o] /= wt; for (let c = 0; c < 3; c++) { H.c[o * 3 + c] /= wt; H.m[o * 3 + c] /= l; }
  }
  return H;
}
function dilate(L, cell, rings) {
  const n = L.n, has = Uint8Array.from(L.a, (a) => (a > 0 ? 1 : 0)), at = new Int32Array(n * n), put = new Float32Array(n * n * 8);
  for (let r = 0; r < rings; r++) {
    let m = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const o = y * n + x, cx = x - (x % cell), cy = y - (y % cell), p = m * 8; if (has[o]) continue; let k = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const X = x + i, Y = y + j, q = Y * n + X; if (X < cx || Y < cy || X >= cx + cell || Y >= cy + cell || !has[q]) continue;
        if (!k) put.fill(0, p, p + 8); k++;
        for (let c = 0; c < 3; c++) { put[p + c] += L.c[q * 3 + c]; put[p + 3 + c] += L.m[q * 3 + c]; } put[p + 6] += L.d[q]; put[p + 7] += L.w[q];
      }
      if (k) { for (let c = 0; c < 8; c++) put[p + c] /= k; at[m++] = o; }
    }
    if (!m) break;
    for (let i = 0; i < m; i++) { const o = at[i], p = i * 8, l = Math.hypot(put[p + 3], put[p + 4], put[p + 5]) || 1; for (let c = 0; c < 3; c++) { L.c[o * 3 + c] = put[p + c]; L.m[o * 3 + c] = put[p + 3 + c] / l; } L.d[o] = put[p + 6]; L.w[o] = put[p + 7]; has[o] = 1; }
  }
}
/** The level as the GPU takes it, its alpha scaled picture by picture (Castaño): the threshold under which (1 - cover)
    of the picture's texels lie, scaled onto the cut. cover: each picture's own (its finest level's mean alpha). */
function bytesOf(L, cell, cover) {
  const n = L.n, cells = n / cell, colour = new Uint8Array(n * n * 4), data = new Uint8Array(n * n * 4), hist = new Uint32Array(256), b = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    hist.fill(0); for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) hist[b(L.a[(cy * cell + y) * n + cx * cell + x])]++;
    const want = Math.round(cover[cy * cells + cx] * cell * cell); let s = 1 / 16;   // (a picture nothing covers: nothing over the cut)
    if (want > 0) { let over = 0, t = 255; while (t > 0 && over + hist[t] <= want) over += hist[t--]; s = Math.min(16, Math.max(1 / 16, 127.5 / Math.max(t + 0.5, 0.5))); }
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const o = (cy * cell + y) * n + cx * cell + x;
      for (let c = 0; c < 3; c++) colour[o * 4 + c] = b(L.c[o * 3 + c]);
      colour[o * 4 + 3] = b(L.a[o] * s); enc(L.m[o * 3], L.m[o * 3 + 1], L.m[o * 3 + 2], E2); data[o * 4] = b(E2[0]); data[o * 4 + 1] = b(E2[1]); data[o * 4 + 2] = b(L.d[o]); data[o * 4 + 3] = b(L.w[o]);
    }
  }
  return { colour, data, n };
}
self.onmessage = ({ data: { id, colour, data, side, cell, least } }) => {
  let L = floatsOf(colour, data, side), c = cell;
  const cells = side / cell, cover = new Float32Array(cells * cells), levels = [];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) cover[Math.floor(y / cell) * cells + Math.floor(x / cell)] += L.a[y * side + x] / (cell * cell);
  dilate(L, c, 3); levels.push(bytesOf(L, c, cover));
  while (c / 2 >= least) { L = halve(L); c /= 2; dilate(L, c, 2); levels.push(bytesOf(L, c, cover)); }
  self.postMessage({ id, levels }, levels.flatMap((l) => [l.colour.buffer, l.data.buffer]));
};
