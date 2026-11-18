// FLIP: how different two pictures look to a person flipping between them, for every pixel, from 0 (the same) to 1
// (Andersson, Nilsson, Akenine-Möller, Oskarsson, Åström and Fairchild, "FLIP: A Difference Evaluator for Alternating
// Images", HPG 2020). This is NVIDIA's LDR-FLIP ported to JavaScript step for step from its reference, src/cpp/FLIP.h in
// github.com/NVlabs/flip (the code the `flip-evaluator` package runs), with the same constants and the same separated
// filters; checked against flip-evaluator 1.7 on the gate's 4K stills (intent 0038). Beside it, what the gate needs to
// use it: PNGs read and written (plain JS and node:zlib, no native module), the 32-pixel tiles a view is judged by, and
// FLIP's own magma heat map.
//
// The port keeps NVIDIA's licence (BSD-3-Clause):
//   Copyright (c) 2020-2024, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//   Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
//   following conditions are met: 1. Redistributions of source code must retain the above copyright notice, this list of
//   conditions and the following disclaimer. 2. Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimer in the documentation and/or other materials provided with the
//   distribution. 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or
//   promote products derived from this software without specific prior written permission.
//   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
//   INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
//   DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
//   SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
//   SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
//   WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
//   OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
import { inflateSync, deflateSync } from 'node:zlib';
import { OUTPUT } from '../../src/core/budget.js';

/** How many pixels a degree of the eye's view spans: FLIP's own default, 67.02, a 4K screen 0.7 m wide seen from 0.7 m
    (a 27–32" 4K screen at about 70 cm). */
export const PPD = 0.7 * (OUTPUT.width / 0.7) * (Math.PI / 180);

// FLIP's constants (FLIP.h): the colour metric's exponent qc, the share pc of the largest difference below which errors
// are spread over [0, pt]; the edge detector's width w (degrees); the feature metric's exponent qf. The eye's contrast
// sensitivity per opponent channel (achromatic, red-green, blue-yellow), each a sum of two Gaussians a·√(π/b)·e^(−π²x²/b)
// over x in degrees. The D65 white, and its inverse.
const QC = 0.7, PC = 0.4, PT = 0.95, GW = 0.082, QF = 0.5;
const A1 = [1, 1, 34.1], B1 = [0.0047, 0.0053, 0.04], A2 = [0, 0, 13.5], B2 = [1e-5, 1e-5, 0.025];
const WHITE = [0.950428545, 1, 1.088900371], INV = [1.052156925, 1, 0.91835767];
const DELTA = 6 / 29, CUBE = DELTA ** 3, LINEAR = 1 / (3 * DELTA * DELTA);

/** The FLIP error of `test` against `reference` ({ width, height, data: RGB or RGBA bytes in sRGB, channels }), one
    number a pixel in [0, 1]. FLIP is symmetric: which of the two is the reference does not change it. */
export function flip(reference, test, { ppd = PPD } = {}) {
  const { width: w, height: h } = reference;
  if (test.width !== w || test.height !== h) throw new Error(`the pictures differ in size: ${w}×${h} and ${test.width}×${test.height}`);
  const R = opponent(reference), T = opponent(test);
  const err = colour(R, T, w, h, ppd);
  const fr = features(R.y, w, h, ppd), ft = features(T.y, w, h, ppd), K = Math.SQRT1_2;
  for (let i = 0; i < err.length; i++) {
    const f = Math.pow(K * Math.max(Math.abs(fr.edge[i] - ft.edge[i]), Math.abs(fr.point[i] - ft.point[i])), QF);
    err[i] = Math.pow(err[i], 1 - f);
  }
  return err;
}

// ---- the colours: the eye's opponent space (YCxCz), linear in light ----
const LIN = Float32Array.from({ length: 256 }, (_, v) => { const c = Math.fround(v / 255); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });   // sRGB to linear, per byte
// linear RGB to XYZ (D65), and back: FLIP's own numbers
const M = [10135552 / 24577794, 8788810 / 24577794, 4435075 / 24577794, 2613072 / 12288897, 8788810 / 12288897, 887015 / 12288897, 1425312 / 73733382, 8788810 / 73733382, 70074185 / 73733382];
const MI = [3.241003275, -1.537398934, -0.498615861, -0.969224334, 1.875930071, 0.041554224, 0.055639423, -0.204011202, 1.057148933];
/** A picture's pixels in YCxCz: sRGB to linear RGB to XYZ to YCxCz. The fourth byte of RGBA is left out, as FLIP's
    loader does. */
function opponent({ width, height, data, channels = data.length / (width * height) }) {
  const n = width * height, y = new Float32Array(n), cx = new Float32Array(n), cz = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += channels) {
    const r = LIN[data[o]], g = LIN[data[o + 1]], b = LIN[data[o + 2]];
    const X = (M[0] * r + M[1] * g + M[2] * b) * INV[0], Y = M[3] * r + M[4] * g + M[5] * b, Z = (M[6] * r + M[7] * g + M[8] * b) * INV[2];
    y[i] = 116 * Y - 16; cx[i] = 500 * (X - Y); cz[i] = 200 * (Y - Z);
  }
  return { y, cx, cz };
}
/** Hunt-adjusted L*a*b* of a colour given in YCxCz, into `out`: back to linear RGB and held to the RGB cube (FLIP clamps
    the filtered colour there), then CIE L*a*b* with a and b scaled by L / 100 (Hunt: colour fades in the dark). */
function huntLab(Yc, Cx, Cz, out) {
  const Y = (Yc + 16) / 116, X = (Y + Cx / 500) * WHITE[0], Z = (Y - Cz / 200) * WHITE[2];
  hunt(clamp(MI[0] * X + MI[1] * Y + MI[2] * Z), clamp(MI[3] * X + MI[4] * Y + MI[5] * Z), clamp(MI[6] * X + MI[7] * Y + MI[8] * Z), out);
}
function hunt(r, g, b, out) {
  const x = lab((M[0] * r + M[1] * g + M[2] * b) * INV[0]), y = lab(M[3] * r + M[4] * g + M[5] * b), z = lab((M[6] * r + M[7] * g + M[8] * b) * INV[2]);
  const L = 116 * y - 16;
  out[0] = L; out[1] = 0.01 * L * 500 * (x - y); out[2] = 0.01 * L * 200 * (y - z);
}
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lab = (t) => (t > CUBE ? Math.cbrt(t) : LINEAR * t + 4 / 29);
/** HyAB: the lightness difference city-block, the colour difference straight. */
const hyab = (p, q) => Math.abs(p[0] - q[0]) + Math.hypot(p[1] - q[1], p[2] - q[2]);

/** The colour difference: both pictures filtered as the eye blurs at this viewing distance (the contrast sensitivity
    filters, separated in x and y), then HyAB in Hunt-adjusted L*a*b*, to the power qc, spread over [0, 1]: errors up
    to pc of the largest possible (green against blue) take [0, pt], the rest (pt, 1]. Cx and Cz are filtered in place. */
function colour(R, T, w, h, ppd) {
  const { y: kY, cx: kCx, cz1: kCz1, cz2: kCz2 } = spatialFilters(ppd), n = w * h;
  const tmp = new Float32Array(n), cz2 = new Float32Array(n);
  const filter = (P) => {
    const fy = blur(P.y, kY, tmp, new Float32Array(n), w, h);
    blur(P.cx, kCx, tmp, P.cx, w, h);
    blur(P.cz, kCz2, tmp, cz2, w, h); blur(P.cz, kCz1, tmp, P.cz, w, h);   // (the blue-yellow filter is a sum of two Gaussians: each separated, the two added)
    for (let i = 0; i < n; i++) P.cz[i] += cz2[i];
    return { y: fy, cx: P.cx, cz: P.cz };
  };
  const a = filter(R), b = filter(T), err = tmp;
  const g = [0, 0, 0], bl = [0, 0, 0];
  hunt(0, 1, 0, g); hunt(0, 0, 1, bl);   // (the largest difference there is: green against blue)
  const cmax = Math.pow(hyab(g, bl), QC), pccmax = PC * cmax, p = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    huntLab(a.y[i], a.cx[i], a.cz[i], p); huntLab(b.y[i], b.cx[i], b.cz[i], q);
    const c = Math.pow(hyab(p, q), QC);
    err[i] = c < pccmax ? c * (PT / pccmax) : PT + ((c - pccmax) / (cmax - pccmax)) * (1 - PT);
  }
  return err;
}
/** The contrast sensitivity filters at this many pixels a degree, one row each, as FLIP separates them: Y and Cx each
    summing to one; Cz's two Gaussians as square roots of their weights, scaled together so their 2D sum is one. */
function spatialFilters(ppd) {
  const r = Math.ceil(3 * Math.sqrt(Math.max(...B1, ...B2) / (2 * Math.PI * Math.PI)) * ppd), n = 2 * r + 1;
  const G = (x2, a, b) => a * Math.sqrt(Math.PI / b) * Math.exp((-Math.PI * Math.PI * x2) / b);
  const S = (x2, a, b) => Math.sqrt(a * Math.sqrt(Math.PI / b)) * Math.exp((-Math.PI * Math.PI * x2) / b);
  const y = new Float32Array(n), cx = new Float32Array(n), cz1 = new Float32Array(n), cz2 = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x2 = ((i - r) / ppd) ** 2; y[i] = G(x2, A1[0], B1[0]); cx[i] = G(x2, A1[1], B1[1]); cz1[i] = S(x2, A1[2], B1[2]); cz2[i] = S(x2, A2[2], B2[2]); }
  const sum = (k) => k.reduce((s, v) => s + v, 0), sy = sum(y), sx = sum(cx), sz = Math.hypot(sum(cz1), sum(cz2));
  for (let i = 0; i < n; i++) { y[i] /= sy; cx[i] /= sx; cz1[i] /= sz; cz2[i] /= sz; }
  return { y, cx, cz1, cz2 };
}

// ---- the features: edges and points, the shapes the eye picks out in lightness ----
/** How strongly each pixel is an edge (a Gaussian's first derivative, across x and y) and a point (its second), in the
    picture's Y scaled to [0, 1], the filters w degrees wide, separated in x and y. `y` is scaled in place. */
function features(y, w, h, ppd) {
  const sd = 0.5 * GW * ppd, r = Math.ceil(3 * sd), m = 2 * r + 1, n = w * h;
  const g = new Float32Array(m), d1 = new Float32Array(m), d2 = new Float32Array(m);
  let gs = 0, d1p = 0, d1n = 0, d2p = 0, d2n = 0;
  for (let i = 0; i < m; i++) {
    const x = i - r, e = Math.exp(-(x * x) / (2 * sd * sd)), a = -x * e, b = ((x * x) / (sd * sd) - 1) * e;
    g[i] = e; d1[i] = a; d2[i] = b; gs += e;
    if (a > 0) d1p += a; else d1n -= a;
    if (b > 0) d2p += b; else d2n -= b;
  }
  for (let i = 0; i < m; i++) { g[i] /= gs; d1[i] /= d1[i] > 0 ? d1p : d1n; d2[i] /= d2[i] > 0 ? d2p : d2n; }   // (the Gaussian sums to one; each derivative's positive weights to one, its negative to minus one)
  for (let i = 0; i < n; i++) y[i] = y[i] * (1 / 116) + 16 / 116;
  const dx = rows(y, d1, new Float32Array(n), w, h), ddx = rows(y, d2, new Float32Array(n), w, h), gx = rows(y, g, new Float32Array(n), w, h);
  const edge = cols(dx, g, new Float32Array(n), w, h), point = cols(ddx, g, dx, w, h);   // (x's derivatives, then a Gaussian down; dx's buffer reused)
  const dy = cols(gx, d1, ddx, w, h), ddy = cols(gx, d2, y, w, h);   // (y's, from the picture blurred across)
  for (let i = 0; i < n; i++) { edge[i] = Math.hypot(edge[i], dy[i]); point[i] = Math.hypot(point[i], ddy[i]); }
  return { edge, point };
}

// ---- separated filtering, the border held (FLIP clamps the index to the picture) ----
const blur = (src, k, tmp, dst, w, h) => cols(rows(src, k, tmp, w, h), k, dst, w, h);
function rows(src, k, dst, w, h) {
  const r = k.length >> 1, m = k.length;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      if (x >= r && x < w - r) for (let i = 0, b = o + x - r; i < m; i++) s += k[i] * src[b + i];
      else for (let i = 0; i < m; i++) s += k[i] * src[o + Math.min(Math.max(0, x + i - r), w - 1)];
      dst[o + x] = s;
    }
  }
  return dst;
}
function cols(src, k, dst, w, h) {
  const r = k.length >> 1, acc = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let i = 0; i < k.length; i++) {
      const o = Math.min(Math.max(0, y + i - r), h - 1) * w, c = k[i];
      for (let x = 0; x < w; x++) acc[x] += c * src[o + x];
    }
    dst.set(acc, y * w);
  }
  return dst;
}

// ---- what the gate reads of an error map ----
/** The error map's mean, and its 32-pixel tiles' means: the 99th percentile of them and the worst (where it lies, in
    pixels). A view is judged in every tile, not just on average (intent 0038, check 3). */
export function tiles(err, w, h, size = 32) {
  const tw = Math.ceil(w / size), th = Math.ceil(h / size), sum = new Float64Array(tw * th), cnt = new Float64Array(tw * th);
  let all = 0;
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / size) * tw;
    for (let x = 0; x < w; x++) { const e = err[y * w + x], t = row + Math.floor(x / size); sum[t] += e; cnt[t]++; all += e; }
  }
  const means = Array.from(sum, (s, i) => s / cnt[i]);
  let worst = 0; for (let i = 1; i < means.length; i++) if (means[i] > means[worst]) worst = i;
  const sorted = [...means].sort((a, b) => a - b), p99 = sorted[Math.ceil(0.99 * sorted.length) - 1];
  return { mean: all / (w * h), p99, worst: { value: means[worst], x: (worst % tw) * size, y: Math.floor(worst / tw) * size, size } };
}

// FLIP's magma colour map (FLIP.h MapMagma, as bytes): what its own tool writes an error map with
const MAGMA = Uint8Array.from(Buffer.from('00000401000501010601010802010902020b02020d03030f03031204041405041606051806051a07061c08071e0907200a08220b09240c09260d0a290e0b2b100b2d110c2f120d31130d34140e36150e38160f3b180f3d19103f1a10421c10441d11471e114920114b21114e22115024125325125527125829115a2a115c2c115f2d11612f116331116533106734106936106b38106c390f6e3b0f703d0f713f0f72400f74420f75440f764510774710784910784a10794c117a4e117b4f127b51127c52137c54137d56147d57157e59157e5a167e5c167f5d177f5f187f601880621980641a80651a80671b80681c816a1c816b1d816d1d816e1e81701f81721f817320817521817621817822817922827b23827c23827e24828025828125818326818426818627818827818928818b29818c29818e2a81902a81912b81932b80942c80962c80982d80992d809b2e7f9c2e7f9e2f7fa02f7fa1307ea3307ea5317ea6317da8327daa337dab337cad347cae347bb0357bb2357bb3367ab5367ab73779b83779ba3878bc3978bd3977bf3a77c03a76c23b75c43c75c53c74c73d73c83e73ca3e72cc3f71cd4071cf4070d0416fd2426fd3436ed5446dd6456cd8456cd9466bdb476adc4869de4968df4a68e04c67e24d66e34e65e44f64e55064e75263e85362e95462ea5661eb5760ec5860ed5a5fee5b5eef5d5ef05f5ef1605df2625df2645cf3655cf4675cf4695cf56b5cf66c5cf66e5cf7705cf7725cf8745cf8765cf9785df9795df97b5dfa7d5efa7f5efa815ffb835ffb8560fb8761fc8961fc8a62fc8c63fc8e64fc9065fd9266fd9467fd9668fd9869fd9a6afd9b6bfe9d6cfe9f6dfea16efea36ffea571fea772fea973feaa74feac76feae77feb078feb27afeb47bfeb67cfeb77efeb97ffebb81febd82febf84fec185fec287fec488fec68afec88cfeca8dfecc8ffecd90fecf92fed194fed395fed597fed799fed89afdda9cfddc9efddea0fde0a1fde2a3fde3a5fde5a7fde7a9fde9aafdebacfcecaefceeb0fcf0b2fcf2b4fcf4b6fcf6b8fcf7b9fcf9bbfcfbbdfcfdbf', 'hex'));
/** The error map in magma (as FLIP's tool draws it), RGB bytes; the worst tile outlined in white. */
export function heat(err, w, h, worst = null) {
  const out = new Uint8Array(w * h * 3);
  for (let i = 0; i < err.length; i++) { const k = (Math.floor(err[i] * 255 + 0.5) % 256) * 3; out[3 * i] = MAGMA[k]; out[3 * i + 1] = MAGMA[k + 1]; out[3 * i + 2] = MAGMA[k + 2]; }
  if (worst) {
    const { x: x0, y: y0, size } = worst, x1 = Math.min(w, x0 + size) - 1, y1 = Math.min(h, y0 + size) - 1;
    const white = (x, y) => out.fill(255, 3 * (y * w + x), 3 * (y * w + x) + 3);
    for (let x = x0; x <= x1; x++) { white(x, y0); white(x, y1); }
    for (let y = y0; y <= y1; y++) { white(x0, y); white(x1, y); }
  }
  return out;
}

// ---- PNGs, read and written ----
/** A PNG's pixels: { width, height, channels (3 or 4), data }. 8 bits a channel, RGB or RGBA, not interlaced: what a
    browser's canvas writes. */
export function readPNG(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), idat = [];
  if (v.getUint32(0) !== 0x89504e47) throw new Error('not a PNG');
  let width = 0, height = 0, channels = 0;
  for (let o = 8; o < buf.length;) {
    const len = v.getUint32(o), type = buf.toString('latin1', o + 4, o + 8), body = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = v.getUint32(o + 8); height = v.getUint32(o + 12); channels = { 2: 3, 6: 4 }[body[9]];
      if (body[8] !== 8 || !channels || body[12] !== 0) throw new Error(`a PNG the gate cannot read (depth ${body[8]}, colour type ${body[9]}, interlace ${body[12]}): it reads 8-bit RGB or RGBA`);
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, d = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[d + x - channels] : 0, b = y ? data[d - stride + x] : 0, c = x >= channels && y ? data[d - stride + x - channels] : 0;
      let p = raw[s + x];
      if (f === 1) p += a; else if (f === 2) p += b; else if (f === 3) p += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      data[d + x] = p;
    }
  }
  return { width, height, channels, data };
}
const CRC = Int32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
const crc = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
/** RGB bytes as a PNG. */
export function writePNG(rgb, w, h) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);   // (each row unfiltered)
  const chunk = (type, body) => { const b = Buffer.alloc(12 + body.length); b.writeUInt32BE(body.length, 0); b.write(type, 4, 'latin1'); body.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + body.length)), 8 + body.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
