// Spatiotemporal blue noise (intent 0038, stage 9): the one noise every stochastic term of the light draws from (the
// shadows' taps, the contact shadows' start). Its pixels are blue in space: each
// value far from its like, so an average over a few pixels is smooth; and from frame to frame each pixel steps on by
// the golden ratio, so its values over a few frames are spread evenly too. The picture built over time (the upscale,
// src/core/temporal.js, along the prepass's motion) averages both away: what is left is no grain and no crawl.
//
// The tile is made here by void and cluster (Ulichney 1993), once, as the method defines it (src/core/method.js
// BLUE_NOISE_SIDE, BLUE_NOISE_SIGMA): the rank at which each pixel is set, as
// the tightest clusters are taken out and the largest voids filled, on a torus, so tiles meet without a seam. Its four
// numbers are four such ranks of the one tile, each shifted by a far step, so two or three terms of one pixel do not
// follow each other.
import * as THREE from 'three/webgpu';
import { texture, ivec2, uint, fract, float } from 'three/tsl';
import { U } from '../../core/uniforms.js';
import { BLUE_NOISE_SIDE, BLUE_NOISE_SIGMA } from '../../core/method.js';

const N = BLUE_NOISE_SIDE, SIGMA = BLUE_NOISE_SIGMA;

/** The ranks 0 … N²-1 of an N x N blue-noise tile. */
function voidAndCluster() {
  const n = N * N, on = new Uint8Array(n), E = new Float64Array(n), rank = new Uint16Array(n), R = 9;
  const K = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) K.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))]);
  const splat = (i, s) => { const x = i % N, y = (i / N) | 0; for (const [dx, dy, k] of K) E[((y + dy + N) % N) * N + ((x + dx + N) % N)] += s * k; };
  const tightest = () => { let b = -1, v = -Infinity; for (let i = 0; i < n; i++) if (on[i] && E[i] > v) { v = E[i]; b = i; } return b; };
  const largestVoid = () => { let b = -1, v = Infinity; for (let i = 0; i < n; i++) if (!on[i] && E[i] < v) { v = E[i]; b = i; } return b; };
  // a first pattern: a tenth of the pixels, from a fixed seed, then relaxed until its tightest cluster is its largest void
  let s = 0x9e3779b9; const rnd = () => ((s = (s ^ (s << 13)) >>> 0, s = (s ^ (s >>> 17)) >>> 0, s = (s ^ (s << 5)) >>> 0) / 4294967296);
  const first = Math.round(n * 0.1); for (let k = 0; k < first; ) { const i = (rnd() * n) | 0; if (!on[i]) { on[i] = 1; splat(i, 1); k++; } }
  for (let guard = 0; guard < n; guard++) { const c = tightest(); on[c] = 0; splat(c, -1); const v = largestVoid(); if (v === c) { on[c] = 1; splat(c, 1); break; } on[v] = 1; splat(v, 1); }
  const kept = on.slice(), Ek = E.slice();
  // ranks below the first: its tightest clusters taken out, one by one
  for (let r = first - 1; r >= 0; r--) { const c = tightest(); on[c] = 0; splat(c, -1); rank[c] = r; }
  on.set(kept); E.set(Ek);
  // ranks above: the largest voids filled, one by one
  for (let r = first; r < n; r++) { const v = largestVoid(); on[v] = 1; splat(v, 1); rank[v] = r; }
  return rank;
}

let made = null;
/** The tile as a texture: rgba8, each number a rank of the tile (0 … 1), the four shifted apart. */
function tile() {
  if (made) return made;
  const rank = voidAndCluster(), data = new Uint8Array(N * N * 4), at = (x, y) => rank[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const shifts = [[0, 0], [37, 19], [11, 45], [53, 29]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) data[(y * N + x) * 4 + c] = Math.floor((at(x + shifts[c][0], y + shifts[c][1]) / (N * N)) * 256);
  made = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  made.minFilter = made.magFilter = THREE.NearestFilter; made.wrapS = made.wrapT = THREE.RepeatWrapping; made.generateMipmaps = false; made.needsUpdate = true;
  return made;
}

let node = null;   // (one texture node for every read: one binding a shader, however many terms read it)
/** The noise at a pixel (screen coordinates), this frame: four numbers 0 … 1, blue in space, stepping on by the golden
    ratio from frame to frame (U.uFrame). */
export const blueAt = (p) => {
  const t = (node ||= texture(tile())).load(ivec2(uint(p.x).mod(uint(N)), uint(p.y).mod(uint(N))));
  return fract(t.add(float(U.uFrame).mul(0.61803398875)).add(float(0.5 / 256)));
};
