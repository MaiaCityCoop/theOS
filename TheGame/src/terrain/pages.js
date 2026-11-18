// The land as one virtual texture (intent 0038, stage 6b, after Ka Chen, "Adaptive Virtual Texture Rendering in Far
// Cry 4", GDC 2015, and Etienne, "Large Scale Terrain Rendering in Call of Duty", SIGGRAPH 2023 Advances). The ground's
// material is laid once for a page of land and kept, not again in every pixel of every frame: a pixel of the ground
// looks its page up in the page table, reads it once, and lights it (src/terrain/material.js).
//
//   levels   the land at LEVELS levels of detail, the first S0 metres a texel, each one after twice as coarse (the last
//            128 m a texel). A level is pages of PAGE × PAGE texels (and BORDER more each way, its neighbours', so a
//            page filters as one with them), kept in a window of K × K pages round the camera: the land is endless,
//            so each level is a ring of pages round it, a page's place in its window its place on the land modulo K
//   a page   laid by the GPU (compute): the layer map's points over it first (src/terrain/layers.js, on its own grid),
//            then its texels (material.js laid), hex-tiled inside. Its two mips at once: the first its level's own, the
//            second the next level's texels where it lies, so the filter's step between them goes over into its parent
//            without a seam, in one read. What is let go with distance is let go as at its level's distance (D)
//   asked    the prepass writes, at every pixel of the land, the level it reads (as finely as the screen's own pixels
//            read it: its lens and the upscaler's finer reads counted); right after it a pass takes one pixel in every
//            SWEEP × SWEEP, another each frame, finds its point from its depth and writes which page it wants, read back
//            a few frames later. (Not the colour pass: a shader that writes anything beside its colour loses its early
//            depth test, and the colour's equal test then misses pixels the prepass drew.) What is asked for is laid
//            parents first, the coarsest first, as many a frame as the frame allows; while the camera moves fast, a page
//            that would cross the screen too fast to be seen waits and its parent is laid; what has not been asked for
//            longest gives its slot up
//   shown    a pixel reads the finest page in for its level, walking up to a coarser one where it is not in yet; a
//            page newly in is faded in over FADE frames from the one under it, so a page never comes in at once
// The atlas is arrays of SLOTS layers, a page a layer (its colour and height; its relief; the carpet's share and the
// stands' shade), with the page table beside it. If the pages asked for do not fit, every pixel asks a little coarser
// (the bias), until they do.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, Break, float, int, uint, vec2, vec4, ivec2, uvec2, uvec4, uniform, uniformArray, texture, storageTexture, textureStore, globalId, floor, fract, log2, exp2, max, min, clamp, length, mix, sqrt, smoothstep, renderGroup } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { note, gpuStorage } from '../core/gpu.js';
import { did } from '../core/work.js';
import { source } from '../core/settle.js';
import { TRUTH } from '../detail/measure.js';
import { layerTables, layerWords, layersFrom } from './layers.js';
import { laid, slopeAt, groundRead, RELIEF_REACH } from './material.js';
import { parallaxSteps, reliefShares, reliefOverSnow } from './relief.js';
import { SOIL_RELIEF } from '../world/physics.js';
import { wear } from './decals.js';
import { steps, colours } from '../materials/bake.js';
import { snowDepth } from '../world/light.js';

const SLOT = 128, BORDER = 4, PAGE = SLOT - 2 * BORDER;   // texels a page's layer has a side; of them its border; its own
const S0 = 1 / 512, LEVELS = 17, TOP = LEVELS - 1, K = 128;   // metres a texel of the finest level; levels; pages a level's window has a side
// (?truth: a block of 4 × 4 asks from all of its pixels every frame, so a sweep is one frame: the truth's slow frames,
// each at another of its 32 places of a pixel, would otherwise find a page now and then for half an hour, and it would
// never settle)
const ANISO = 4, FADE = 10, SWEEP = TRUTH ? 4 : 8, TAKES = TRUTH ? 16 : 4, BATCH = 16, MAPN = 8;   // the filter's steps along a slope; frames a page fades in over; a block of SWEEP × SWEEP pixels asks once a frame, the finest of TAKES of them; pages laid at once; texels between the layer map's points
const SPAN = (SWEEP * SWEEP) / TAKES;   // frames a sweep takes: every pixel of a block has asked once
const G0 = SLOT / MAPN + 2, G1 = SLOT / 2 / MAPN + 2, POINTS = G0 * G0 + G1 * G1;   // the layer map's points a page has a side, for its first mip and its second; all of them
const KEEP = 96, FAST = 12, PIN = 26000, NEAR = 15;   // frames a page not asked for is kept at least; screen pixels a frame a page may cross and still be laid; metres round the camera the last level is always in; metres from the eye the bias spares
// (the bias, in quarter levels over the whole pyramid: chosen where what is asked for fits the slots, chosen again where
// what is kept does not; between the two, its own step: a quarter level coarser, √2 fewer pages)
const QUARTERS = 4 * TOP;
const BLOCKS_MOST = TRUTH ? Math.ceil(3840 / SWEEP) * Math.ceil(2160 / SWEEP) : Math.ceil(7680 / SWEEP) * Math.ceil(4320 / SWEEP);   // the blocks of the largest inside asked from (8K; ?truth, 4K)
const VALID = 1 << 12, FADED = 1 << 13;   // a page table entry: its slot (12 bits), these, the frame it came in (16 bits)
const sideOf = (m) => PAGE * S0 * 2 ** m;   // a page's side at level m, metres
// the pixels each block of SWEEP × SWEEP asks from, frame by frame, TAKES at a time: an ordered dither's order, so they
// spread out
const BITS = Math.log2(SWEEP), SEQ = []; for (let y = 0; y < SWEEP; y++) for (let x = 0; x < SWEEP; x++) { let v = 0; for (let k = 0; k < BITS; k++) v |= ((((x ^ y) >> k) & 1) << (2 * BITS - 1 - 2 * k)) | (((y >> k) & 1) << (2 * BITS - 2 - 2 * k)); SEQ[v] = [x, y]; }
const stampOf = (f) => (f % 31) + 1;   // (what a pixel's ask is marked with: its frame, 1 … 31)
/** The bias a pixel t of the way from NEAR to 3 NEAR off asks with, at bias b (as biasAt, in JS). */
const biasOf = (b, t) => { const c = b - 0.5; return c + t * (Math.max(c, 0) - c); };
/** The level a pixel reads whose own level is `raw` (its footprint's, unbiased), t as for biasOf, at bias b. */
const levelOf = (raw, t, b) => Math.min(TOP, Math.max(0, Math.floor(raw + biasOf(b, t))));

let LAND = null;
/** The land's pages as made last (null before): what else reads the ground there (a rock's skirt: src/scatter/drawer.js). */
export const landPages = () => LAND;

export function createPages(renderer, tex) {
  layerTables(tex);
  const STEPS_P = parallaxSteps(RELIEF_REACH);   // (the parallax's steps: src/terrain/relief.js)
  // ---- the atlas: a page a layer, two mips. Where the GPU has block compression (BC: every desktop) it is kept in
  // blocks, as the world's materials are (src/materials/bake.js): A (BC3) the colour, gamma 2, and the height; N (BC5)
  // the relief; X (BC5) the carpet's share and the stands' shade: 3 bytes a texel, so 4096 pages in about 250 MB, what
  // the 4K screen asks for at its own density (3000–3500 pages at the gate's views), in two arrays of up to 2048 layers
  // (a device's most). A page is laid into a layer of its own batch first, and packed into blocks from there. Elsewhere A
  // and N are four bytes a texel each (N with the carpet and the shade in it), 640 pages, laid straight into the atlas ----
  const dev = renderer.backend.device, PACKED = !!dev?.features?.has('texture-compression-bc'), LAYERS_MOST = dev?.limits?.maxTextureArrayLayers ?? 256;
  const SLOTS = PACKED ? Math.min(2 * LAYERS_MOST, 4096) : Math.min(LAYERS_MOST, 640), PER = Math.min(SLOTS, LAYERS_MOST);   // (PER: layers an array)
  const look = { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: ANISO, colorSpace: THREE.NoColorSpace, generateMipmaps: false };
  const laidInto = (n) => Object.assign(new THREE.StorageArrayTexture(SLOT, SLOT, n), look, { mipmaps: [{ width: SLOT, height: SLOT }, { width: SLOT / 2, height: SLOT / 2 }] });
  const blocks = (format, n) => {   // (every layer there from the start, empty, filled as pages are laid)
    const zero = new Uint8Array(n * (SLOT / 4) ** 2 * 16), mips = [0, 1].map((l) => ({ data: zero.subarray(0, n * (SLOT / 4 >> l) ** 2 * 16), width: SLOT >> l, height: SLOT >> l }));
    const t = Object.assign(new THREE.CompressedArrayTexture(mips, SLOT, SLOT, n, format, THREE.UnsignedByteType), look, { needsUpdate: true });
    renderer.initTexture(t); for (const m of mips) m.data = new Uint8Array(0);   // (sent once, empty; the page keeps none of it)
    return t;
  };
  const arrays = (format) => Array.from({ length: Math.ceil(SLOTS / PER) }, (_, k) => blocks(format, Math.min(PER, SLOTS - k * PER)));
  const A = PACKED ? arrays(THREE.RGBA_S3TC_DXT5_Format) : [laidInto(SLOTS)], N = PACKED ? arrays(THREE.RED_GREEN_RGTC2_Format) : [laidInto(SLOTS)], X = PACKED ? arrays(THREE.RED_GREEN_RGTC2_Format) : null;
  const SA = PACKED ? laidInto(BATCH) : A[0], SN = PACKED ? laidInto(BATCH) : N[0];   // (where a batch is laid: its own layers, or the atlas's)
  note("the land's pages", SLOTS * SLOT * SLOT * 1.25 * (PACKED ? 3 : 8) + (PACKED ? BATCH * SLOT * SLOT * 1.25 * 8 : 0), 0);
  const tA = A.map((t) => texture(t)), tN = N.map((t) => texture(t)), tX = X ? X.map((t) => texture(t)) : null;
  // ---- the page table: for each level, its window's pages ----
  const T = gpuStorage('uint', LEVELS * K * K, "the land's page table"), table = new Uint32Array(LEVELS * K * K), TN = T.node.toReadOnly();
  let lo = Infinity, hi = -1, version = 0;   // (version: how many times the table has changed)
  const put = (k, v) => { table[k] = v; if (k < lo) lo = k; if (k > hi) hi = k; version++; };
  const WIN = uniformArray(Array.from({ length: LEVELS }, () => new THREE.Vector4()), 'vec4').setGroup(renderGroup);   // each level's window: its first page (i, j)
  const uFrame = uniform(0, 'uint').setGroup(renderGroup), uBias = uniform(0).setGroup(renderGroup), uPxS = uniform(1600);   // (uPxS: screen pixels a metre covers a metre off through the 68° lens: what a level's distance is reckoned by)
  const Rd = { WIN, uFrame, uBias };
  // ---- what the pixels ask for: each block of SWEEP × SWEEP pixels, TAKES of them a frame, others each frame (a sweep
  // of SPAN frames asks from all of them), read from the prepass right after it is drawn: a pixel of the land writes
  // there its own level, its footprint's, unbiased (src/terrain/material.js); its point comes from its depth through the
  // camera as it drew. A block says the finest of them at the bias now, in two 32-bit words: the page it lies in half a
  // level finer than any bias asks for (the reference: its level, its place modulo 2048) and the frame; its own level
  // and how near the eye it is (what the bias spares of it), and whether it lies at an edge of the page it reads. So
  // what any bias would ask for can be told from them ----
  const ASK = gpuStorage('uint', BLOCKS_MOST * 2, "the land's pages: what the pixels ask for");
  const tDepth = texture(new THREE.DepthTexture(1, 1)), tMotion = texture(new THREE.Texture());
  const uInv = uniform(new THREE.Matrix4()), uSize = uniform(new THREE.Vector2(1, 1)), uStamp = uniform(1, 'uint'), uEye = uniform(new THREE.Vector3()), uBiasK = uniform(0);   // (uBiasK: the bias, for the asks' pass)
  const uSmp = uniformArray(Array.from({ length: TAKES }, () => new THREE.Vector2()), 'vec2'), uFw = uniform(1, 'uint');
  const askKernel = Fn(() => {
    const b = uvec2(globalId.xy), base = ivec2(b).mul(SWEEP), fw = uFw;
    If(b.x.lessThan(fw).and(b.x.mul(uint(SWEEP)).lessThan(uint(uSize.x))).and(b.y.mul(uint(SWEEP)).lessThan(uint(uSize.y))).and(b.y.mul(fw).add(b.x).lessThan(uint(BLOCKS_MOST))), () => {
      const best = float(1e9).toVar(), w0 = uint(0).toVar(), w1 = uint(0).toVar();
      for (let k = 0; k < TAKES; k++) {
        const q = base.add(ivec2(uSmp.element(k)));
        If(q.x.lessThan(int(uSize.x)).and(q.y.lessThan(int(uSize.y))), () => {
          const raw = tMotion.load(q).w.sub(2).toVar();   // (written 2 more: 0 is not the land)
          If(raw.greaterThan(-1.5), () => {
            const uv = vec2(q).add(0.5).div(uSize), c = uInv.mul(vec4(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)), tDepth.load(q).x, 1)), w = c.xyz.div(c.w).toVar();
            const t = smoothstep(NEAR, 3 * NEAR, length(w.sub(uEye))), cb = uBiasK.sub(0.5), lv = floor(raw.add(mix(cb, max(cb, 0), t)));
            If(lv.lessThan(best), () => {   // (the finest; of the same, the first in this frame's order)
              best.assign(lv);
              const m = int(clamp(floor(raw.sub(0.5)), 0, TOP)), pg = ivec2(floor(w.xz.div(exp2(float(m)).mul(PAGE * S0))));
              w0.assign(uint(m).bitOr(uint(pg.x.bitAnd(2047)).shiftLeft(uint(5))).bitOr(uint(pg.y.bitAnd(2047)).shiftLeft(uint(16))).bitOr(uStamp.shiftLeft(uint(27))));
              // (and whether its point lies at an edge of its page at that level, and which: the picture's jitter moves
              // a pixel's point by up to half a pixel drawn, at most half its footprint's longer side, ANISO times the
              // texel its level calls for over the finer reads (uFine); within that of an edge the page across it is
              // asked for with it, so no place of the jitter finds a page the others did not)
              const L = clamp(lv, 0, 15), fr = fract(w.xz.div(exp2(L).mul(PAGE * S0))), e = exp2(raw.sub(L)).mul(0.5 * ANISO / PAGE).div(U.uFine);
              const ex = fr.x.lessThan(e).select(uint(1), fr.x.greaterThan(float(1).sub(e)).select(uint(2), uint(0))), ez = fr.y.lessThan(e).select(uint(1), fr.y.greaterThan(float(1).sub(e)).select(uint(2), uint(0)));
              w1.assign(uint(clamp(raw.add(2), 0, 255).mul(256)).bitOr(uint(t.mul(255)).shiftLeft(uint(16))).bitOr(ex.bitOr(ez.shiftLeft(uint(2))).shiftLeft(uint(24))).bitOr(uint(L).shiftLeft(uint(28))));
            });
          });
        });
      }
      const at = b.y.mul(fw).add(b.x).mul(uint(2));   // (no land drawn there: it asks for nothing, not for what it asked for before)
      ASK.node.element(at).assign(w0); ASK.node.element(at.add(uint(1))).assign(w1);
    });
  })().computeKernel([8, 8, 1]);

  // ---- laying a batch of pages ----
  // (each page of the batch: its (x, z) where its own texels begin, its level, its slot; where its first texel lies on
  // its grid of the layer map's points, first mip and second; its grid's first point, in the map's points of the land.
  // In a buffer written before each batch: a uniform array is sent once a frame, and a frame may lay several batches)
  const DESC = gpuStorage('vec4', BATCH * 3, "the land's pages: the batch being laid"), desc = new Float32Array(BATCH * 12);
  const ORIG = { element: (b) => DESC.node.element(b.mul(3)) }, GOFF = { element: (b) => DESC.node.element(b.mul(3).add(1)) }, GN = { element: (b) => DESC.node.element(b.mul(3).add(2)) };
  const uN = uniform(0, 'uint'), uMip = uniform(0, 'uint');
  const MAP = gpuStorage('uvec4', BATCH * POINTS * 2, "the land's pages: their layer map");
  // the layer map's points over each page of the batch (both mips' grids)
  const mapKernel = Fn(() => {
    const id = globalId.x, b = id.div(uint(POINTS)), r = id.sub(b.mul(uint(POINTS)));
    If(b.lessThan(uN), () => {
      const two = r.greaterThanEqual(uint(G0 * G0)), rr = two.select(r.sub(uint(G0 * G0)), r), G = two.select(uint(G1), uint(G0));
      const P = ORIG.element(b), g = exp2(P.z.add(two.select(float(1), float(0)))).mul(S0 * MAPN), n0 = two.select(GN.element(b).zw, GN.element(b).xy);
      const p = n0.add(vec2(float(rr.mod(G)), float(rr.div(G)))).mul(g).toVar();
      const w = layerWords(tex, p, g), at = id.mul(2);
      MAP.node.element(at).assign(uvec4(w[0], w[1], w[2], w[3])); MAP.node.element(at.add(1)).assign(uvec4(w[4], 0, 0, 0));
    });
  })().computeKernel([64, 1, 1]);
  // a page's texels: the first mip (uMip 0) or the second (1). (Each store a binding of its own: three binds a texture
  // once a shader, by its uuid, and a storage binding is one mip)
  const store = (t, mip, at, layer, v) => { const n = storageTexture(t, at, v); n.mipLevel = mip; n.depthNode = layer; n.mergeable = false; n.toStack(); };
  const pageKernel = Fn(() => {
    const g = globalId.xy, two = uMip.equal(uint(1)), side = two.select(uint(SLOT / 2), uint(SLOT)), b = g.y.div(side), y = g.y.sub(b.mul(side)), x = g.x;
    If(x.lessThan(side).and(b.lessThan(uN)), () => {
      const P = ORIG.element(b), s = exp2(P.z.add(float(uMip))).mul(S0), xy = vec2(float(x), float(y));
      const p = P.xy.add(xy.sub(two.select(float(BORDER / 2), float(BORDER))).add(0.5).mul(s)).toVar(), D = s.mul(uPxS).toVar();
      // the layer map's four points round p, on the page's own grid
      const u = two.select(GOFF.element(b).zw, GOFF.element(b).xy).add(xy.div(MAPN)), i = floor(u), G = two.select(uint(G1), uint(G0));
      const base = b.mul(uint(POINTS)).add(two.select(uint(G0 * G0), uint(0)));
      const load = (t) => { const k = base.add(uint(i.y).add(uint(t).shiftRight(uint(1))).mul(G)).add(uint(i.x).add(uint(t).bitAnd(uint(1)))).mul(uint(2)); return { L: MAP.node.element(k), M: MAP.node.element(k.add(uint(1))).x }; };
      const M = laid(tex, p, s, D, layersFrom(load, u.sub(i), slopeAt(p, D)));
      wear(p, s, M, (m, tile) => groundRead(tex, m, p, s, tile));   // (the footpaths, worn into it: src/terrain/decals.js)
      const a = vec4(sqrt(clamp(M.c, 0, 1)), clamp(M.h, 0, 1)), n = vec4(clamp(M.n.mul(0.5).add(0.5), 0, 1), clamp(M.cv, 0, 1), clamp(M.shade, 0, 1));
      const layer = PACKED ? int(b) : int(P.w), at = uvec2(x, y);   // (packed: the batch's own layer; else its slot in the atlas)
      If(two, () => { store(SA, 1, at, layer, a); store(SN, 1, at, layer, n); }).Else(() => { store(SA, 0, at, layer, a); store(SN, 0, at, layer, n); });
    });
  })().computeKernel([8, 8, 1]);
  // the batch packed into blocks (src/materials/bake.js steps, colours), a block of 4 × 4 texels a thread: of each page,
  // its colour and height (BC3), its relief (BC5), its carpet and shade (BC5), each its two mips; then copied into the
  // atlas's layers
  const BLOCKS = (SLOT / 4) ** 2 + (SLOT / 8) ** 2, BLK = PACKED ? gpuStorage('uvec4', BATCH * 3 * BLOCKS, "the land's pages: the batch's blocks") : null;
  const tSA = texture(SA), tSN = texture(SN);
  const packKernel = PACKED ? Fn(() => {
    const id = globalId.x, b = id.div(uint(3 * BLOCKS)), r = id.sub(b.mul(uint(3 * BLOCKS))), t = r.div(uint(BLOCKS)), k = r.sub(t.mul(uint(BLOCKS)));
    If(b.lessThan(uN), () => {
      const two = k.greaterThanEqual(uint((SLOT / 4) ** 2)), kk = two.select(k.sub(uint((SLOT / 4) ** 2)), k), side = two.select(uint(SLOT / 8), uint(SLOT / 4)), bx = kk.mod(side), by = kk.div(side), lv = two.select(int(1), int(0));
      const texels = (S) => { const px = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) px.push(S.load(ivec2(int(bx.mul(uint(4)).add(uint(i))), int(by.mul(uint(4)).add(uint(j))))).depth(int(b)).level(lv).toVar()); return px; };
      const out = uvec4(0).toVar();
      If(t.equal(uint(0)), () => { const v = texels(tSA), h = steps(v.map((c) => c.a)), c = colours(v.map((q) => q.rgb)); out.assign(uvec4(h[0], h[1], c[0], c[1])); })
        .Else(() => { const v = texels(tSN), two2 = t.equal(uint(2)), x = steps(v.map((q) => two2.select(q.z, q.x))), y = steps(v.map((q) => two2.select(q.w, q.y))); out.assign(uvec4(x[0], x[1], y[0], y[1])); });
      BLK.node.element(id).assign(out);
    });
  })().computeKernel([64, 1, 1]) : null;
  const pack = (list) => {
    renderer.compute(packKernel, [Math.ceil((list.length * 3 * BLOCKS) / 64), 1, 1]);
    const e = dev.createCommandEncoder(), gpu = (x) => renderer.backend.get(x), buffer = gpu(BLK.attr).buffer;
    list.forEach((q, b) => [A, N, X].forEach((T2, t) => [0, 1].forEach((l) => {
      const side = SLOT / 4 >> l, first = (b * 3 + t) * BLOCKS + (l ? (SLOT / 4) ** 2 : 0);
      e.copyBufferToTexture({ buffer, offset: first * 16, bytesPerRow: side * 16, rowsPerImage: side }, { texture: gpu(T2[Math.floor(q.slot / PER)]).texture, mipLevel: l, origin: { x: 0, y: 0, z: q.slot % PER } }, { width: SLOT >> l, height: SLOT >> l, depthOrArrayLayers: 1 });
    })));
    dev.queue.submit([e.finish()]);
  };

  // ---- the pages in: which slot holds which page, since when, last asked for when ----
  const IN = new Map(), free = []; for (let s = SLOTS - 1; s >= 0; s--) free.push(s);
  const keyOf = (m, i, j) => (m * 2 ** 21 + (i + 2 ** 20)) * 2 ** 21 + (j + 2 ** 20);
  const at = (m, i, j) => m * K * K + (j & (K - 1)) * K + (i & (K - 1));
  const win = Array.from({ length: LEVELS }, () => null), inWin = (m, i, j) => { const w = win[m]; return !!w && i >= w[0] && i < w[0] + K && j >= w[1] && j < w[1] + K; };
  const fading = [];
  let frame = 0, queue = [], key = '', bias = 0, made = 0, changed = true;
  const recent = [];
  const evict = (P) => { IN.delete(P.key); free.push(P.slot); if ((table[P.idx] & 0xfff) === P.slot && table[P.idx] & VALID) put(P.idx, 0); };
  const flush = () => { for (const P of [...IN.values()]) evict(P); queue = []; fading.length = 0; dirty = true; };
  // a slot for a page: a free one, or the one asked for longest ago (not lately, not the last level's round the camera)
  const slotFor = () => {
    if (free.length) return free.pop();
    let old = null; for (const P of IN.values()) if (!P.pin && P.used < frame - KEEP && (!old || P.used < old.used)) old = P;
    if (!old) return -1;
    evict(old); return free.pop();
  };
  // lay these pages ([{ m, i, j }], at most BATCH), and say in the table that they are in
  const lay = (list) => {
    list.forEach((q, b) => {
      const sm = S0 * 2 ** q.m, gx0 = (q.i * PAGE - BORDER + 0.5) / MAPN, gz0 = (q.j * PAGE - BORDER + 0.5) / MAPN, gx1 = (q.i * PAGE / 2 - BORDER / 2 + 0.5) / MAPN, gz1 = (q.j * PAGE / 2 - BORDER / 2 + 0.5) / MAPN;
      const n0 = [Math.floor(gx0), Math.floor(gz0), Math.floor(gx1), Math.floor(gz1)];
      desc.set([q.i * PAGE * sm, q.j * PAGE * sm, q.m, q.slot, gx0 - n0[0], gz0 - n0[1], gx1 - n0[2], gz1 - n0[3], ...n0], b * 12);
    });
    DESC.write(0, desc.subarray(0, list.length * 12)); uN.value = list.length;
    renderer.compute(mapKernel, [Math.ceil((list.length * POINTS) / 64), 1, 1]);
    uMip.value = 0; renderer.compute(pageKernel, [SLOT / 8, (SLOT * list.length) / 8, 1]);
    uMip.value = 1; renderer.compute(pageKernel, [SLOT / 16, (SLOT / 2 * list.length) / 8, 1]);
    if (PACKED) pack(list);
    for (const q of list) { put(q.idx, VALID | q.slot | (TRUTH ? FADED : 0) | ((frame & 0xffff) << 16)); q.came = frame; if (!TRUTH) fading.push(q); moves(q); }   // (?truth: in at once, the reference fades nothing)
    made += list.length; did('pages', list.length);
    for (const q of list) { recent.push({ m: q.m, i: q.i, j: q.j, frame }); if (recent.length > 24) recent.shift(); }   // (for a look: the last pages laid)
  };
  // make each of these pages, BATCH at a time, as many as `most`: how many were made
  const make = (pages, most) => {
    let n = 0, batch = [];
    for (const q of pages) {
      if (n >= most) break;
      const k = keyOf(q.m, q.i, q.j); if (IN.has(k) || !inWin(q.m, q.i, q.j)) continue;
      const slot = slotFor(); if (slot < 0) break;
      const P = { key: k, m: q.m, i: q.i, j: q.j, slot, idx: at(q.m, q.i, q.j), used: frame, pin: !!q.pin };
      IN.set(k, P); batch.push(P); n++;
      if (batch.length === BATCH) { lay(batch); batch = []; }
    }
    if (batch.length) lay(batch);
    return n;
  };

  // ---- what the pixels asked for, read back every frame, kept over a sweep ----
  // refs: each reference page asked from in the last sweep or two (its level m, place i, j), the finest own level asked
  // from it (raw) and how near the eye that pixel was (t), since when that is the finest (since), when last asked (f),
  // and the level that asks for at the bias now (L). want: every page those ask for at the bias now, and every page over
  // each (a pixel shows the finest in, so its parents come first), when last asked (f), by how many asks (n). The pages
  // asked for are the want's keys; those not in yet, the queue
  const refs = new Map(), want = new Map();
  const prev = new THREE.Vector3(), turn = new THREE.Quaternion(); let moved = 0, swung = 0, pxRad = 1600;   // (metres and radians the camera moved last frame; screen pixels a radian through its lens)
  let quietFrom = 0, readTo = 0, dirty = false, pick = null, pickedAt = -1e9, judged = -1, nAsk = 0, askedAt = -1, cutAt = 0;   // (since when nothing changed what is asked for; the last frame whose asks are in; the queue to be sorted again; the bias being chosen)
  // What the pixels ask for is a function of the view, the bias and the relief's heights (the land's vertices near the
  // eye are raised by the pages, src/terrain/material.js, so there a pixel's point moves as they come in): a page the relief reads
  // (at its finest level or coarser, within its reach of the camera), laid or faded in, changes what is asked for as a
  // move of the camera does, and a sweep is asked again after it
  let reliefFinest = Infinity;
  const moves = (q) => {
    if (q.m < reliefFinest) return;
    const P = sideOf(q.m), r = RELIEF_REACH / U.uLodInv.value, dx = Math.max(q.i * P - prev.x, 0, prev.x - (q.i + 1) * P), dz = Math.max(q.j * P - prev.z, 0, prev.z - (q.j + 1) * P);
    if (dx * dx + dz * dz < r * r) quietFrom = frame;
  };
  // a page asked for at frame f: it and every page over it, each in its level's window (past it: its parent)
  const ask = (L, i, j, f, n) => {
    for (; L <= TOP; L++, i = Math.floor(i / 2), j = Math.floor(j / 2)) {
      if (!inWin(L, i, j)) continue;
      const k = keyOf(L, i, j), w = want.get(k);
      if (w) { if (w.f === f) { w.n += n; break; } w.f = f; w.n += n; }   // (asked already this frame: so is every page over it)
      else { want.set(k, { m: L, i, j, f, n }); if (!IN.has(k)) dirty = true; }
      const P = IN.get(k); if (P) P.used = frame;
    }
  };
  const asked = (R, f) => { R.L = levelOf(R.raw, R.t, bias); const d = 2 ** (R.L - R.m); ask(R.L, Math.floor(R.i / d), Math.floor(R.j / d), f, 1); };
  // the page a block's reference word names (its level, its place modulo 2048, by the window round the camera now), kept
  // as a reference of its own: null where its level has no window yet
  const refOf = (v, raw, t, f) => {
    const m = v & 31, w = win[m]; if (!w) return null;
    const ci = w[0] + K / 2, cj = w[1] + K / 2, ib = (v >>> 5) & 2047, jb = (v >>> 16) & 2047;
    const i = ci + ((((ib - ci) % 2048) + 3072) % 2048) - 1024, j = cj + ((((jb - cj) % 2048) + 3072) % 2048) - 1024, key = keyOf(m, i, j);
    let R = refs.get(key); if (!R) refs.set(key, (R = { m, i, j, raw, t, since: f, f: -1, L: -1 }));
    return R;
  };
  // (near its page's edge: the page across it too, at the level it read, if that is the level asked at the bias now)
  const across = (R, w1, raw, t, f) => {
    const edge = (w1 >>> 24) & 15, L = w1 >>> 28;
    if (!edge || L >= 15 || levelOf(raw, t, bias) !== L) return;
    const d = 2 ** (L - R.m), i = Math.floor(R.i / d), j = Math.floor(R.j / d), di = (edge & 3) === 1 ? -1 : (edge & 3) === 2 ? 1 : 0, dj = (edge >> 2) === 1 ? -1 : (edge >> 2) === 2 ? 1 : 0;
    if (di) ask(L, i + di, j, f, 0); if (dj) ask(L, i, j + dj, f, 0); if (di && dj) ask(L, i + di, j + dj, f, 0);
  };
  // a frame's asks (two words a block), read back
  const took = (data, f) => {
    const st = stampOf(f); let last = -1, R = null;
    for (let k = 0; k < data.length; k += 2) {
      const v = data[k]; if (!v || v >>> 27 !== st) continue;
      const raw = (data[k + 1] & 0xffff) / 256 - 2, t = ((data[k + 1] >>> 16) & 255) / 255;
      if (v !== last) { last = v; R = refOf(v, raw, t, f); }   // (a run of blocks over the same reference page: looked up once)
      if (!R) continue;
      if (f - R.since >= SPAN) { R.raw = raw; R.t = t; R.since = f; } else if (raw < R.raw) { R.raw = raw; R.t = t; }
      if (R.f !== f || levelOf(R.raw, R.t, bias) !== R.L) { R.f = f; asked(R, f); }
      across(R, data[k + 1], raw, t, f);
    }
    readTo = Math.max(readTo, f);
  };
  // what has not been asked for for two sweeps no longer is (and the queue: what is asked for and not in, parents first,
  // the coarsest first, then what most asked for)
  const forget = () => {
    const old = frame - 2 * SPAN - lag;
    for (const [k, R] of refs) if (R.f < old) refs.delete(k);
    for (const [k, w] of want) if (w.f < old) { want.delete(k); dirty = true; }
  };
  const sortQueue = () => { queue = [...want.values()].filter((w) => !IN.has(keyOf(w.m, w.i, w.j))).sort((x, y) => y.m - x.m || y.n - x.n); dirty = false; };
  // all over again at a new bias, from what the last sweep asked
  const reask = () => { want.clear(); for (const R of refs.values()) if (R.f >= 0) asked(R, R.f); dirty = true; };
  // how many pages the last sweep's asks come to at bias b, every page over each counted once
  const needAt = (b) => {
    const S = new Set(), from = frame - SPAN - lag;
    for (const R of refs.values()) {
      if (R.f < from) continue;
      let L = levelOf(R.raw, R.t, b); const d = 2 ** (L - R.m); let i = Math.floor(R.i / d), j = Math.floor(R.j / d);
      for (; L <= TOP; L++, i = Math.floor(i / 2), j = Math.floor(j / 2)) { if (!inWin(L, i, j)) continue; const k = keyOf(L, i, j); if (S.has(k)) break; S.add(k); }
    }
    return S.size;
  };
  // the bias, chosen in one step: the least of its quarter levels at which what the last sweep asked for fits the slots,
  // found by halving, a candidate a frame (so no frame takes the time of all of them); then every page
  // asked for again at it, from the same asks
  const choose = () => {
    if (!pick) return;
    const mid = (pick.lo + pick.hi) >> 1;
    if (needAt(mid / 4) <= SLOTS) pick.hi = mid; else pick.lo = mid + 1;
    if (pick.lo < pick.hi) return;
    const b = pick.lo / 4, pick0 = pick; pick = null; pickedAt = frame;
    if (b !== bias) { const was = pick0.still; bias = b; reask(); quietFrom = frame; if (was) judged = frame; }   // (what it asks for now is judged, if it was chosen from a view that stood: no need to choose again once a sweep has come)
  };
  // how many levels coarser a page is laid while the camera moves: what crosses the screen faster than FAST pixels a
  // frame waits (its parent, asked for with it, is laid)
  const waits = (m, i, j, cam) => {
    if (!(moved > 0 || swung > 0)) return false;
    const P = sideOf(m), d = Math.max(0.5, Math.hypot((i + 0.5) * P - cam.x, (j + 0.5) * P - cam.z, U.uDy.value + 1.5));
    return (moved / d + swung) * pxRad > FAST;
  };
  // read-backs: buffers the GPU copies a frame's asks into, each mapped when the copy is done; at most a sweep's frames
  // of them out (an ask a sweep old is asked again by then). lag: how many frames the last one took to come back
  const spare = [], busyReads = new Set();
  let lag = 1;
  const readBack = (n, f) => {
    if (!dev || n <= 0) return;
    let B = spare.pop(); if (!B && busyReads.size < SPAN) B = dev.createBuffer({ label: "the land's pages: asks read back", size: BLOCKS_MOST * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    if (!B) return;   // (all of them out: this frame's asks are not read; the sweep comes round to them again)
    busyReads.add(B);
    const src = renderer.backend.get(ASK.attr).buffer; if (!src) { spare.push(B); busyReads.delete(B); return; }
    const e = dev.createCommandEncoder(); e.copyBufferToBuffer(src, 0, B, 0, n * 8); dev.queue.submit([e.finish()]);
    // (what was asked before a cut is asked no longer)
    B.mapAsync(GPUMapMode.READ, 0, n * 8).then(() => { lag = Math.max(1, frame - f); try { if (f >= cutAt) took(new Uint32Array(B.getMappedRange(0, n * 8)), f); } finally { B.unmap(); } }).catch(() => {}).finally(() => { busyReads.delete(B); spare.push(B); });
  };
  // (still out, for the world complete: src/core/settle.js): pages asked for and not in, pages fading in, the bias being
  // chosen, and until a whole sweep has been read since anything changed what is asked for (the camera moved, the
  // bias): until then a pixel may not have asked yet
  source('pages', () => queue.length + fading.length + (pick ? 1 : 0) + (readTo < quietFrom + SPAN ? 1 : 0));

  // ---- what update does once a frame, step by step ----
  // laid again whole when what it is laid as changed: the library's stage and sandbox, the screen's pixels (a level's distance)
  const relay = (size) => {
    const k2 = `${U.uSand.value.toArray()}|${U.uStage.value.toArray()}|${U.uStageGround.value.toArray()}|${size.y}|${U.uPxK.value}`;
    if (k2 !== key) { key = k2; flush(); uPxS.value = size.y / (2 * Math.tan((34 * Math.PI) / 180)); }
  };
  // the camera's speed: metres and radians a frame (a jump, farther than twice its height in a frame, is a cut: what
  // was asked for before it no longer counts, and the bias starts again from none)
  const follow = (camera, size) => {
    const cam = camera.position;
    moved = cam.distanceTo(prev); swung = 2 * Math.acos(Math.min(1, Math.abs(turn.dot(camera.quaternion))));
    if (moved > Math.max(50, 2 * (U.uDy.value + 2)) || swung > 0.5) { moved = swung = 0; bias = 0; refs.clear(); want.clear(); queue = []; pick = null; readTo = cutAt = frame; }
    if (moved > 1e-4 || swung > 1e-5) quietFrom = frame;
    prev.copy(cam); turn.copy(camera.quaternion); pxRad = (camera.projectionMatrix.elements[5] * size.y) / 2;
  };
  // each level's window round the camera: the pages it leaves let go
  const windows = (cam) => {
    for (let m = 0; m < LEVELS; m++) {
      const P = sideOf(m), i0 = Math.floor(cam.x / P) - K / 2, j0 = Math.floor(cam.z / P) - K / 2, w = win[m];
      if (w && w[0] === i0 && w[1] === j0) continue;
      win[m] = [i0, j0]; WIN.array[m].set(i0, j0, 0, 0);
      for (const Q of [...IN.values()]) if (Q.m === m && !inWin(m, Q.i, Q.j)) evict(Q);
    }
  };
  // the last level round the camera, always in (what a pixel reads where nothing finer is in yet)
  const pinTop = (cam) => {
    const P = sideOf(TOP), pins = [], far = (Q) => Math.abs((Q.i + 0.5) * P - cam.x) > PIN + P || Math.abs((Q.j + 0.5) * P - cam.z) > PIN + P;
    for (let j = Math.floor((cam.z - PIN) / P); j <= Math.floor((cam.z + PIN) / P); j++) for (let i = Math.floor((cam.x - PIN) / P); i <= Math.floor((cam.x + PIN) / P); i++) {
      const Q = IN.get(keyOf(TOP, i, j)); if (Q) { Q.pin = true; Q.used = frame; } else pins.push({ m: TOP, i, j, pin: true });
    }
    for (const Q of IN.values()) if (Q.pin && Q.m === TOP && far(Q)) Q.pin = false;
    if (pins.length) make(pins, Infinity);
  };
  // the pixels' asks: the last frame's read back, what is no longer asked for forgotten, the bias chosen again when
  // what is kept does not fit (or, once a sweep has been read with the camera still, when it may be finer)
  const judge = () => {
    if (askedAt === frame - 1) readBack(nAsk, frame - 1);
    if (frame % 8 === 0) forget();
    if (!pick && refs.size) {
      const over = want.size > SLOTS && frame - pickedAt > SPAN, settled = isStill() && readTo >= quietFrom + SPAN && judged < quietFrom && bias > 0;
      if (over || settled) { pick = { lo: 0, hi: QUARTERS, still: settled }; if (settled) judged = quietFrom; }   // (chosen while the camera moved: chosen again once it stands)
    }
    choose();
  };
  const isStill = () => moved < 1e-4 && swung < 1e-5;
  // as many pages as the frame allows, parents first: fewer while the camera moves (and what would cross the screen too
  // fast to be seen waits; its parent is laid)
  const layQueue = (cam) => {
    if (dirty) sortQueue();
    if (!queue.length) return;
    const still = isStill();
    make(still ? queue : queue.filter((q) => !waits(q.m, q.i, q.j, cam)), still ? 48 : 12); queue = queue.filter((q) => !IN.has(keyOf(q.m, q.i, q.j)) && inWin(q.m, q.i, q.j));
  };
  // the pages fading in: done after FADE frames
  const faded = () => {
    for (let n = fading.length - 1; n >= 0; n--) {
      const q = fading[n]; if (frame - q.came < FADE) continue;
      if (IN.get(q.key) === q && (table[q.idx] & 0xfff) === q.slot) { put(q.idx, table[q.idx] | FADED); moves(q); }
      fading.splice(n, 1);
    }
  };
  // the table sent, and the frame's numbers: this frame's TAKES of each block, in an order turned each frame (of the same
  // level, another wins)
  const send = (v0) => {
    changed = version !== v0;
    if (hi >= lo) { T.write(lo, table.subarray(lo, hi + 1)); lo = Infinity; hi = -1; }
    uFrame.value = frame & 0xffff; uStamp.value = stampOf(frame); uBias.value = bias;
    for (let k = 0; k < TAKES; k++) uSmp.array[k].set(...SEQ[(frame % SPAN) * TAKES + ((k + frame) % TAKES)]);
  };

  return (LAND = {
    /** Its passes compiled (a promise), before they first run. */
    compile: () => Promise.all([mapKernel, pageKernel, packKernel, askKernel].filter(Boolean).map((k) => renderer.compileComputeAsync(k))),
    /** After the prepass (src/core/screen.js afterPrepass): which pages its pixels read, one in each SWEEP × SWEEP.
        depth, motion: the prepass's; camera: as it drew (its shift too); w, h: its pixels. */
    ask({ depth, motion, camera, w, h }) {
      tDepth.value = depth; tMotion.value = motion; uSize.value.set(w, h); uEye.value.setFromMatrixPosition(camera.matrixWorld); uBiasK.value = bias;
      uInv.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      const fw = Math.ceil(w / SWEEP), fh = Math.ceil(h / SWEEP); uFw.value = fw; nAsk = Math.min(fw * fh, BLOCKS_MOST); askedAt = frame;
      renderer.compute(askKernel, [Math.ceil(fw / 8), Math.ceil(fh / 8), 1]);
    },
    /** Every page laid again (the land under them changed: the lakes). */
    refresh: flush,
    /** The land near the eye is raised by the pages, its finest vertices `cell` metres apart (src/terrain/relief.js):
        what those pages are changes what the pixels ask for (moves, above). */
    underRelief(cell) { reliefFinest = Math.max(0, Math.floor(Math.log2(cell / S0) - 0.5)); },
    /** Whether what a read gives may differ from the last frame's: the table changed this frame, or a page fades in. */
    get changing() { return fading.length > 0 || changed; },
    /** For a look: how many pages the last sweep's asks come to at each quarter level of the bias. */
    needs: () => Array.from({ length: QUARTERS + 1 }, (_, k) => needAt(k / 4)),
    /** For a look: the last pages laid, each with how far its middle is from (x, z) and what asked for it. */
    recent: (x, z) => recent.map((q) => { const P = sideOf(q.m), w = want.get(keyOf(q.m, q.i, q.j)); return { ...q, d: Math.round(Math.hypot((q.i + 0.5) * P - x, (q.j + 0.5) * P - z)), side: +P.toFixed(3), asked: w ? w.n : 0 }; }),
    /** What the GPU holds of it, for a look: { slots, in, queue, bias, made }. */
    get stats() { return { slots: SLOTS, in: IN.size, need: want.size, queue: queue.length, fading: fading.length, bias, made, refs: refs.size, read: readTo, quiet: quietFrom, frame }; },
    /** Once a frame, before the world is drawn: the windows kept round the camera, what the pixels asked for taken in,
        pages laid, the table sent. */
    update(camera) {
      frame++; const v0 = version, cam = camera.position, size = renderer.getDrawingBufferSize(new THREE.Vector2());
      relay(size); follow(camera, size); windows(cam); pinTop(cam); judge(); layQueue(cam); faded(); send(v0);
    },
    /** How much coarser a pixel d metres from the eye asks: within NEAR half a level finer than its pixel (a page is
        filtered as it is read, after the filtering its texels were laid with: finer, the ground near the eye is as sharp
        as a read of its materials), from 3 NEAR as its pixel. Where what is asked for does not fit, the bias first
        takes the near ground's half level back, then makes all of it coarser (spared it, a view from 10 m asked for
        more pages than the atlas holds, and never settled). */
    biasAt: (d, u = Rd) => { const b = u.uBias.sub(0.5); return mix(b, max(b, 0), smoothstep(NEAR, 3 * NEAR, d)); },
    /** A pixel's own level of the land's pages, its footprint's, unbiased (node code, in the ground's fragment: dx, dy
        how far apart its neighbouring pixels' points are, as finely as the screen's pixels read), fractional: a step
        coarser for every doubling of its size, and of how far a slope draws it out past ANISO (the filter's steps along it). */
    footprint(dx, dy) { const lx = length(dx), ly = length(dy); return log2(max(max(lx, ly).div(ANISO), min(lx, ly)).div(S0)); },
    /** What the prepass writes for the pages' asks, in its fourth number (0 is not the land): the footprint's level, 2 more. */
    asks(dx, dy) { return clamp(this.footprint(dx, dy), -1.4, 250).add(2); },
    /** The level of the land's pages a pixel reads (d how far it is from the eye), fractional: its footprint's, and the bias. */
    want(dx, dy, d, u = Rd) { return this.footprint(dx, dy).add(this.biasAt(d, u)); },
    /** The same, whole: the level whose page a pixel reads (what the prepass writes for ask). */
    level(dx, dy, d, u = Rd) { return int(clamp(floor(this.want(dx, dy, d, u)), 0, TOP)); },
    /** The ground at p as its page holds it (node code, in the ground's fragment: dx, dy, d as for want): the page of the
        level the pixel wants, or the finest in over it; while a page fades in, the one under it with it. eye: the way
        to the eye from p (normalized): the ground's own height is then seen along it (parallax: below). lod: read where
        there are no steps to read by (the land's vertex stage, raising it near the eye: src/terrain/material.js), at the
        mip they call for. level: the steps its level goes by, where not dx, dy (the raised ground's: material.js). ->
        { c: its colour (linear), h: its height, n: its relief (the normal's x, z), cv: the carpet's share, shade: the
        stands' } */
    read(p, dx, dy, d, { eye = null, lod = false, level = null } = {}) {
      const u = Rd, m0 = (level ? this.level(level[0], level[1], d, u) : this.level(dx, dy, d, u)).toVar(), bias = this.biasAt(d, u).toVar();
      const sideAt = (lv) => exp2(float(lv)).mul(PAGE * S0), pageAt = (lv) => ivec2(floor(p.div(sideAt(lv))));
      // the finest page in for that level or over it, and while it fades in, the one under it
      const s1 = int(-1).toVar(), l1 = int(0).toVar(), w1 = float(1).toVar(), s2 = int(-1).toVar(), l2 = int(0).toVar();
      Loop({ start: m0, end: int(LEVELS), type: 'int', condition: '<' }, ({ i }) => {
        const pg = pageAt(i), r = pg.sub(ivec2(u.WIN.element(i).xy));
        If(r.x.greaterThanEqual(0).and(r.y.greaterThanEqual(0)).and(r.x.lessThan(K)).and(r.y.lessThan(K)), () => {
          const e = TN.element(i.mul(K * K).add(pg.y.bitAnd(K - 1).mul(K)).add(pg.x.bitAnd(K - 1))).toVar();
          If(e.bitAnd(uint(VALID)).notEqual(uint(0)), () => {
            If(s1.lessThan(0), () => {
              s1.assign(int(e.bitAnd(uint(0xfff)))); l1.assign(i);
              If(e.bitAnd(uint(FADED)).equal(uint(0)), () => { w1.assign(clamp(float(u.uFrame.sub(e.shiftRight(uint(16))).bitAnd(uint(0xffff))).div(FADE), 0, 1)); });
              If(w1.greaterThanEqual(1), () => { Break(); });
            }).Else(() => { s2.assign(int(e.bitAnd(uint(0xfff)))); l2.assign(i); Break(); });
          });
        });
      });
      // where q lies in the layer of p's page at level lv (q may lie a little past it, into the page's border: the
      // parallax's), and the pixel's own steps there (the bias's too: so the filter's step into the second mip is where
      // the next level's page takes over)
      const inPage = (q, lv) => { const s = exp2(float(lv)).mul(S0), side = s.mul(PAGE), k = exp2(bias).div(s.mul(SLOT)); return { uv: q.sub(floor(p.div(side)).mul(side)).div(s).add(BORDER).div(SLOT), gx: dx.mul(k), gy: dy.mul(k) }; };
      // (a read with those steps; where there are none (a vertex stage), at the mip they call for)
      const at = (t, P, layer) => { const r = t.sample(P.uv).depth(layer); return lod ? r.level(log2(max(max(length(P.gx), length(P.gy)).mul(SLOT), 1e-6))) : r.grad(P.gx, P.gy); };
      // (in its array: the first PER slots the first's, the rest the second's)
      const inArray = (slot, fn) => { if (tA.length > 1) If(slot.lessThan(PER), () => fn(0, slot)).Else(() => fn(1, slot.sub(PER))); else fn(0, slot); };
      // ---- parallax (as much as reliefShares says: from where the relief near the eye lets go until the flat ground is
      // within the one error): the ground's own height (h, 0 … 1, the land's at 0.5, SOIL_RELIEF from lowest to highest),
      // the soil's (not the grass's carpet: its blades stand over it), what of it stands out of the snow, seen along
      // the eye's ray.
      // The ray at height h lies over p + sl (h - 0.5); from the top down, parallaxSteps' steps, until it is under the ground;
      // between the last two steps, where it crossed. Within p's page and its border (the steps along a grazing ray
      // held to what the border holds) ----
      const q = vec2(p).toVar();
      if (eye) {
        const share = reliefShares(d.mul(U.uLodInv), RELIEF_REACH).parallax.mul(reliefOverSnow(snowDepth)).toVar();
        If(share.greaterThan(0.01).and(s1.greaterThanEqual(0)), () => {
          inArray(s1, (j, layer) => {
            const soil = float(1).sub(tX ? at(tX[j], inPage(p, l1), layer).x : at(tN[j], inPage(p, l1), layer).z);   // (the carpet's share there)
            const sl = eye.xz.div(max(eye.y, 0.25)).mul(share.mul(soil).mul(SOIL_RELIEF)).toVar();
            const hAt = (pt) => at(tA[j], inPage(pt, l1), layer).a;
            const was = vec2(p.add(sl.mul(0.5))).toVar(), above = hAt(was).sub(1).toVar();   // (how far the ground stands over the ray: under 0, the ray is above it)
            Loop(STEPS_P, ({ i }) => {
              const hr = float(1).sub(float(i.add(1)).div(STEPS_P)), pt = p.add(sl.mul(hr.sub(0.5))).toVar(), over = hAt(pt).sub(hr).toVar();
              If(over.greaterThanEqual(0), () => { q.assign(mix(was, pt, above.div(min(above.sub(over), -1e-5)))); Break(); });
              was.assign(pt); above.assign(over);
              If(i.equal(STEPS_P - 1), () => { q.assign(pt); });
            });
          });
        });
      }
      const texel = (slot, lv) => {
        const P = inPage(q, lv), ra = vec4(0).toVar(), rn = vec4(0).toVar();
        inArray(slot, (j, layer) => { const n = at(tN[j], P, layer); ra.assign(at(tA[j], P, layer)); rn.assign(tX ? vec4(n.xy, at(tX[j], P, layer).xy) : n); });
        return { a: ra, n: rn };
      };
      const a = vec4(0.3, 0.3, 0.27, 0.5).toVar(), n = vec4(0.5, 0.5, 0, 0).toVar();   // (nothing in yet: a plain ground)
      If(s1.greaterThanEqual(0), () => {
        const R = texel(s1, l1); a.assign(R.a); n.assign(R.n);
        If(w1.lessThan(1).and(s2.greaterThanEqual(0)), () => { const Q = texel(s2, l2); a.assign(mix(Q.a, a, w1)); n.assign(mix(Q.n, n, w1)); });
      });
      return { c: a.rgb.mul(a.rgb), h: a.a, n: n.xy.mul(2).sub(1), cv: n.z, shade: n.w };
    },
  });
}
