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
// The atlas is two arrays of SLOTS layers, a page a layer (its colour and height; its relief, the carpet's share and
// the stands' shade), with the page table beside it. If the pages asked for do not fit, every pixel asks a little
// coarser (the bias), until they do.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, Break, float, int, uint, vec2, vec4, ivec2, uvec2, uvec4, uniform, uniformArray, texture, storageTexture, textureStore, globalId, floor, fract, log2, exp2, max, min, clamp, length, mix, sqrt, renderGroup } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { note, gpuStorage } from '../core/gpu.js';
import { did } from '../core/work.js';
import { source } from '../core/settle.js';
import { layerTables, layerWords, layersFrom } from './layers.js';
import { laid, slopeAt } from './material.js';
import { steps, colours } from '../materials/bake.js';

const SLOT = 128, BORDER = 4, PAGE = SLOT - 2 * BORDER;   // texels a page's layer has a side; of them its border; its own
const S0 = 1 / 512, LEVELS = 17, TOP = LEVELS - 1, K = 128;   // metres a texel of the finest level; levels; pages a level's window has a side
const ANISO = 4, FADE = 10, SWEEP = 8, BATCH = 16, MAPN = 8;   // the filter's steps along a slope; frames a page fades in over; a pixel asks in one of SWEEP × SWEEP; pages laid at once; texels between the layer map's points
const G0 = SLOT / MAPN + 2, G1 = SLOT / 2 / MAPN + 2, POINTS = G0 * G0 + G1 * G1;   // the layer map's points a page has a side, for its first mip and its second; all of them
const KEEP = 96, FAST = 12, PIN = 26000;   // frames a page not asked for is kept at least; screen pixels a frame a page may cross and still be laid; metres round the camera the last level is always in
const VALID = 1 << 12, FADED = 1 << 13;   // a page table entry: its slot (12 bits), these, the frame it came in (16 bits)
const sideOf = (m) => PAGE * S0 * 2 ** m;   // a page's side at level m, metres
// the pixel each block of SWEEP × SWEEP asks from, frame by frame: an ordered dither's order, so they spread out
const SEQ = []; for (let y = 0; y < SWEEP; y++) for (let x = 0; x < SWEEP; x++) { let v = 0; for (let k = 0; k < 3; k++) v |= ((((x ^ y) >> k) & 1) << (5 - 2 * k)) | (((y >> k) & 1) << (4 - 2 * k)); SEQ[v] = [x, y]; }
const stampOf = (f) => (f % 31) + 1;   // (what a pixel's ask is marked with: its frame, 1 … 31)

export function createPages(renderer, tex) {
  layerTables(tex);
  // ---- the atlas: a page a layer, two mips. Where the GPU has block compression (BC: every desktop) it is kept in
  // blocks, as the world's materials are (src/materials/bake.js): A (BC3) the colour, gamma 2, and the height; N (BC5)
  // the relief; X (BC5) the carpet's share and the stands' shade: 3 bytes a texel, so 1792 pages in about 100 MB. A page
  // is laid into a layer of its own batch first, and packed into blocks from there. Elsewhere A and N are four bytes a
  // texel each (N with the carpet and the shade in it), 640 pages, laid straight into the atlas ----
  const dev = renderer.backend.device, PACKED = !!dev?.features?.has('texture-compression-bc');
  const SLOTS = Math.min(dev?.limits?.maxTextureArrayLayers ?? 256, PACKED ? 1792 : 640);
  const look = { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: ANISO, colorSpace: THREE.NoColorSpace, generateMipmaps: false };
  const laidInto = (n) => Object.assign(new THREE.StorageArrayTexture(SLOT, SLOT, n), look, { mipmaps: [{ width: SLOT, height: SLOT }, { width: SLOT / 2, height: SLOT / 2 }] });
  const blocks = (format) => {   // (every layer there from the start, empty, filled as pages are laid)
    const zero = new Uint8Array(SLOTS * (SLOT / 4) ** 2 * 16), mips = [0, 1].map((l) => ({ data: zero.subarray(0, SLOTS * (SLOT / 4 >> l) ** 2 * 16), width: SLOT >> l, height: SLOT >> l }));
    const t = Object.assign(new THREE.CompressedArrayTexture(mips, SLOT, SLOT, SLOTS, format, THREE.UnsignedByteType), look, { needsUpdate: true });
    renderer.initTexture(t); for (const m of mips) m.data = new Uint8Array(0);   // (sent once, empty; the page keeps none of it)
    return t;
  };
  const A = PACKED ? blocks(THREE.RGBA_S3TC_DXT5_Format) : laidInto(SLOTS), N = PACKED ? blocks(THREE.RED_GREEN_RGTC2_Format) : laidInto(SLOTS), X = PACKED ? blocks(THREE.RED_GREEN_RGTC2_Format) : null;
  const SA = PACKED ? laidInto(BATCH) : A, SN = PACKED ? laidInto(BATCH) : N;   // (where a batch is laid: its own layers, or the atlas's)
  note("the land's pages", SLOTS * SLOT * SLOT * 1.25 * (PACKED ? 3 : 8) + (PACKED ? BATCH * SLOT * SLOT * 1.25 * 8 : 0), 0);
  const tA = texture(A), tN = texture(N), tX = X ? texture(X) : null;
  // ---- the page table: for each level, its window's pages ----
  const T = gpuStorage('uint', LEVELS * K * K, "the land's page table"), table = new Uint32Array(LEVELS * K * K), TN = T.node.toReadOnly();
  let lo = Infinity, hi = -1;
  const put = (k, v) => { table[k] = v; if (k < lo) lo = k; if (k > hi) hi = k; };
  const WIN = uniformArray(Array.from({ length: LEVELS }, () => new THREE.Vector4()), 'vec4').setGroup(renderGroup);   // each level's window: its first page (i, j)
  const uFrame = uniform(0, 'uint').setGroup(renderGroup), uBias = uniform(0).setGroup(renderGroup), uPxS = uniform(1600);   // (uPxS: screen pixels a metre covers a metre off through the 68° lens: what a level's distance is reckoned by)
  // ---- what the pixels ask for: one in each SWEEP × SWEEP, another each frame, read from the prepass right after it is
  // drawn (the level a pixel of the land reads, in its fourth number: src/terrain/material.js; its point, from its
  // depth through the camera as it drew), one 32-bit word a block: the level, the page (modulo 2048), the frame ----
  const FB = new THREE.StorageTexture(1, 1); Object.assign(FB, { format: THREE.RedIntegerFormat, type: THREE.UnsignedIntType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const tDepth = texture(new THREE.DepthTexture(1, 1)), tMotion = texture(new THREE.Texture());
  const uInv = uniform(new THREE.Matrix4()), uSize = uniform(new THREE.Vector2(1, 1)), uStamp = uniform(1, 'uint'), uSmp = uniform(new THREE.Vector2());
  const askKernel = Fn(() => {
    const q = ivec2(globalId.xy).mul(SWEEP).add(ivec2(uSmp));
    If(q.x.lessThan(int(uSize.x)).and(q.y.lessThan(int(uSize.y))), () => {
      const lv = tMotion.load(q).w;
      If(lv.greaterThan(0.5), () => {
        const m = int(lv.sub(0.5)), uv = vec2(q).add(0.5).div(uSize), c = uInv.mul(vec4(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)), tDepth.load(q).x, 1));
        const pg = ivec2(floor(c.xz.div(c.w).div(exp2(float(m)).mul(PAGE * S0))));
        textureStore(FB, uvec2(globalId.xy), uvec4(uint(m).bitOr(uint(pg.x.bitAnd(2047)).shiftLeft(uint(5))).bitOr(uint(pg.y.bitAnd(2047)).shiftLeft(uint(16))).bitOr(uStamp.shiftLeft(uint(27))), 0, 0, 0));
      });
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
      e.copyBufferToTexture({ buffer, offset: first * 16, bytesPerRow: side * 16, rowsPerImage: side }, { texture: gpu(T2).texture, mipLevel: l, origin: { x: 0, y: 0, z: q.slot } }, { width: SLOT >> l, height: SLOT >> l, depthOrArrayLayers: 1 });
    })));
    dev.queue.submit([e.finish()]);
  };

  // ---- the pages in: which slot holds which page, since when, last asked for when ----
  const IN = new Map(), free = []; for (let s = SLOTS - 1; s >= 0; s--) free.push(s);
  const keyOf = (m, i, j) => (m * 2 ** 21 + (i + 2 ** 20)) * 2 ** 21 + (j + 2 ** 20);
  const at = (m, i, j) => m * K * K + (j & (K - 1)) * K + (i & (K - 1));
  const win = Array.from({ length: LEVELS }, () => null), inWin = (m, i, j) => { const w = win[m]; return !!w && i >= w[0] && i < w[0] + K && j >= w[1] && j < w[1] + K; };
  const fading = [];
  let frame = 0, queue = [], key = '', reading = false, busyAt = 0, bias = 0, biasAt = 0, roomy = 0, made = 0, need = 0;
  const evict = (P) => { IN.delete(P.key); free.push(P.slot); if ((table[P.idx] & 0xfff) === P.slot && table[P.idx] & VALID) put(P.idx, 0); };
  const flush = () => { for (const P of [...IN.values()]) evict(P); queue = []; fading.length = 0; };
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
    for (const q of list) { put(q.idx, VALID | q.slot | ((frame & 0xffff) << 16)); q.came = frame; fading.push(q); }
    made += list.length; did('pages', list.length);
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

  // ---- what the pixels asked for, read back ----
  const prev = new THREE.Vector3(), turn = new THREE.Quaternion(); let moved = 0, swung = 0, pxRad = 1600;   // (metres and radians the camera moved last frame; screen pixels a radian through its lens)
  const asked = (data, f) => {
    const fresh = new Set(); for (let a = 0; a < 6; a++) fresh.add(stampOf(f - a + 31 * 64));
    const counts = new Map();
    for (let k = 0; k < data.length; k++) {
      const v = data[k]; if (!v || !fresh.has(v >>> 27)) continue;
      let m = v & 31; const w = win[m]; if (!w || m > TOP) continue;
      const ci = w[0] + K / 2, cj = w[1] + K / 2, ib = (v >>> 5) & 2047, jb = (v >>> 16) & 2047;
      let i = ci + ((((ib - ci) % 2048) + 3072) % 2048) - 1024, j = cj + ((((jb - cj) % 2048) + 3072) % 2048) - 1024;
      while (m < TOP && !inWin(m, i, j)) { m++; i = Math.floor(i / 2); j = Math.floor(j / 2); }   // (past its level's window: its parent)
      const key2 = keyOf(m, i, j), c = counts.get(key2);
      if (c) c.n++; else counts.set(key2, { m, i, j, n: 1 });
    }
    return counts;
  };
  // how many levels coarser a page is laid while the camera moves: what crosses the screen faster than FAST pixels a
  // frame waits, its parent laid instead
  const waits = (m, i, j, cam) => {
    if (!(moved > 0 || swung > 0)) return 0;
    const P = sideOf(m), d = Math.max(0.5, Math.hypot((i + 0.5) * P - cam.x, (j + 0.5) * P - cam.z, U.uDy.value + 1.5));
    const px = (moved / d + swung) * pxRad;
    return px > FAST ? Math.min(3, Math.ceil(Math.log2(px / FAST))) : 0;
  };
  const take = (counts, cam) => {
    const want = new Map();
    for (const q of counts.values()) {
      let { m, i, j } = q;
      for (let w = waits(m, i, j, cam); w > 0 && m < TOP; w--) { m++; i = Math.floor(i / 2); j = Math.floor(j / 2); }
      for (let L = m, a = i, b = j; L <= TOP; L++, a = Math.floor(a / 2), b = Math.floor(b / 2)) {   // it, and every page over it
        const k = keyOf(L, a, b), P = IN.get(k);
        if (P) P.used = frame; else if (inWin(L, a, b)) { const w = want.get(k); if (w) w.n += q.n; else want.set(k, { m: L, i: a, j: b, n: q.n }); }
      }
    }
    queue = [...want.values()].sort((x, y) => y.m - x.m || y.n - x.n);   // parents first, the coarsest first; then what most pixels ask for
    // the pages asked for lately and what is still to come, against the slots: too many, every pixel asks a little
    // coarser; room again for a while, a little finer
    // (what was asked for in the last sweep, the frames a pixel takes to ask again; judged again only once what the last
    // step asked for has been asked for a sweep)
    need = queue.length; for (const P of IN.values()) if (P.used >= frame - SWEEP * SWEEP - 8) need++;
    if (need > SLOTS * 0.92 && frame - biasAt > 2 * SWEEP * SWEEP && bias < 2) { bias += 0.25; biasAt = frame; roomy = 0; }
    else if (need < SLOTS * 0.6 && bias > 0) { if (++roomy > 6 && frame - biasAt > 240) { bias -= 0.25; biasAt = frame; roomy = 0; } }
    else roomy = 0;
  };
  // (still out, for the world complete: src/core/settle.js): pages asked for and not in, pages fading in, and a sweep's
  // frames after the last of either (a pixel asks once in SWEEP × SWEEP frames)
  source('pages', () => queue.length + fading.length + (frame - busyAt < SWEEP * SWEEP + 8 ? 1 : 0));

  return {
    /** Its passes compiled (a promise), before they first run. */
    compile: () => Promise.all([mapKernel, pageKernel, packKernel, askKernel].filter(Boolean).map((k) => renderer.compileComputeAsync(k))),
    /** After the prepass (src/core/screen.js afterPrepass): which pages its pixels read, one in each SWEEP × SWEEP.
        depth, motion: the prepass's; camera: as it drew (its shift too); w, h: its pixels. */
    ask({ depth, motion, camera, w, h }) {
      tDepth.value = depth; tMotion.value = motion; uSize.value.set(w, h);
      uInv.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      renderer.compute(askKernel, [Math.ceil(w / SWEEP / 8), Math.ceil(h / SWEEP / 8), 1]);
    },
    /** Every page laid again (the land under them changed: the lakes). */
    refresh: flush,
    /** What the GPU holds of it, for a look: { slots, in, queue, bias, made }. */
    get stats() { return { slots: SLOTS, in: IN.size, need, queue: queue.length, fading: fading.length, bias, made }; },
    /** Once a frame, before the world is drawn: the windows kept round the camera, what the pixels asked for taken in,
        pages laid, the table sent. */
    update(camera) {
      frame++;
      const cam = camera.position, size = renderer.getDrawingBufferSize(new THREE.Vector2());
      // laid again whole when what it is laid as changed: the library's stage and sandbox, the screen's pixels (a level's distance)
      const k2 = `${U.uSand.value.toArray()}|${U.uStage.value.toArray()}|${U.uStageGround.value.toArray()}|${size.y}|${U.uPxK.value}`;
      if (k2 !== key) { key = k2; flush(); uPxS.value = size.y / (2 * Math.tan((34 * Math.PI) / 180)); }
      // the camera's speed: metres and radians a frame (a jump, farther than twice its height in a frame, is a cut)
      moved = cam.distanceTo(prev); swung = 2 * Math.acos(Math.min(1, Math.abs(turn.dot(camera.quaternion))));
      if (moved > Math.max(50, 2 * (U.uDy.value + 2)) || swung > 0.5) moved = swung = 0;
      prev.copy(cam); turn.copy(camera.quaternion); pxRad = (camera.projectionMatrix.elements[5] * size.y) / 2;
      // ---- each level's window round the camera: the pages it leaves let go ----
      for (let m = 0; m < LEVELS; m++) {
        const P = sideOf(m), i0 = Math.floor(cam.x / P) - K / 2, j0 = Math.floor(cam.z / P) - K / 2, w = win[m];
        if (w && w[0] === i0 && w[1] === j0) continue;
        win[m] = [i0, j0]; WIN.array[m].set(i0, j0, 0, 0);
        for (const Q of [...IN.values()]) if (Q.m === m && !inWin(m, Q.i, Q.j)) evict(Q);
      }
      // ---- the last level round the camera, always in (what a pixel reads where nothing finer is in yet) ----
      const P = sideOf(TOP), pins = [];
      for (let j = Math.floor((cam.z - PIN) / P); j <= Math.floor((cam.z + PIN) / P); j++) for (let i = Math.floor((cam.x - PIN) / P); i <= Math.floor((cam.x + PIN) / P); i++) {
        const Q = IN.get(keyOf(TOP, i, j)); if (Q) { Q.pin = true; Q.used = frame; } else pins.push({ m: TOP, i, j, pin: true });
      }
      for (const Q of IN.values()) if (Q.pin && Q.m === TOP && (Math.abs((Q.i + 0.5) * P - cam.x) > PIN + P || Math.abs((Q.j + 0.5) * P - cam.z) > PIN + P)) Q.pin = false;
      if (pins.length) make(pins, Infinity);
      // ---- the pixels' asks ----
      if (!reading && renderer.backend.get(FB).texture) {
        reading = true; const f = frame - 1;
        renderer.backend.copyTextureToBuffer(FB, 0, 0, FB.image.width, FB.image.height, 0).then((d) => take(asked(new Uint32Array(d.buffer, d.byteOffset, d.byteLength >> 2), f), camera.position)).catch(() => {}).finally(() => { reading = false; });
      }
      const fw = Math.ceil(size.x / SWEEP), fh = Math.ceil(size.y / SWEEP);
      if (FB.image.width !== fw || FB.image.height !== fh) FB.setSize(fw, fh);
      // ---- as many pages as the frame allows: fewer while the camera moves ----
      const still = moved < 1e-4 && swung < 1e-5, before = made;
      if (queue.length) { make(queue, still ? 48 : 12); queue = queue.filter((q) => !IN.has(keyOf(q.m, q.i, q.j)) && inWin(q.m, q.i, q.j)); }
      // ---- the pages fading in: done after FADE frames ----
      for (let n = fading.length - 1; n >= 0; n--) {
        const q = fading[n]; if (frame - q.came < FADE) continue;
        if (IN.get(q.key) === q && (table[q.idx] & 0xfff) === q.slot) put(q.idx, table[q.idx] | FADED);
        fading.splice(n, 1);
      }
      if (made !== before || queue.length || fading.length || moved > 1e-4 || swung > 1e-5) busyAt = frame;
      if (hi >= lo) { T.write(lo, table.subarray(lo, hi + 1)); lo = Infinity; hi = -1; }
      uFrame.value = frame & 0xffff; uStamp.value = stampOf(frame); uSmp.value.set(...SEQ[frame % (SWEEP * SWEEP)]); uBias.value = bias;
    },
    /** The level of the land's pages a pixel reads (node code, in the ground's fragment: dx, dy how far apart its
        neighbouring pixels' points are, as finely as the screen's pixels read), fractional: a step coarser for every
        doubling of its size, and of how far a slope draws it out past ANISO (the filter's steps along it), and the bias. */
    want: (dx, dy) => { const lx = length(dx), ly = length(dy); return log2(max(max(lx, ly).div(ANISO), min(lx, ly)).div(S0)).add(uBias); },
    /** The same, whole: the level whose page a pixel reads (what the prepass writes for ask). */
    level(dx, dy) { return int(clamp(floor(this.want(dx, dy)), 0, TOP)); },
    /** The ground at p as its page holds it (node code, in the ground's fragment: dx, dy as for want): the page of the
        level the pixel wants, or the finest in over it; while a page fades in, the one under it with it. -> { c: its
        colour (linear), h: its height, n: its relief (the normal's x, z), cv: the carpet's share, shade: the stands' } */
    read(p, dx, dy) {
      const m0 = this.level(dx, dy).toVar();
      const pageAt = (lv) => ivec2(floor(p.div(exp2(float(lv)).mul(PAGE * S0))));
      // the finest page in for that level or over it, and while it fades in, the one under it
      const s1 = int(-1).toVar(), l1 = int(0).toVar(), w1 = float(1).toVar(), s2 = int(-1).toVar(), l2 = int(0).toVar();
      Loop({ start: m0, end: int(LEVELS), type: 'int', condition: '<' }, ({ i }) => {
        const pg = pageAt(i), r = pg.sub(ivec2(WIN.element(i).xy));
        If(r.x.greaterThanEqual(0).and(r.y.greaterThanEqual(0)).and(r.x.lessThan(K)).and(r.y.lessThan(K)), () => {
          const e = TN.element(i.mul(K * K).add(pg.y.bitAnd(K - 1).mul(K)).add(pg.x.bitAnd(K - 1))).toVar();
          If(e.bitAnd(uint(VALID)).notEqual(uint(0)), () => {
            If(s1.lessThan(0), () => {
              s1.assign(int(e.bitAnd(uint(0xfff)))); l1.assign(i);
              If(e.bitAnd(uint(FADED)).equal(uint(0)), () => { w1.assign(clamp(float(uFrame.sub(e.shiftRight(uint(16))).bitAnd(uint(0xffff))).div(FADE), 0, 1)); });
              If(w1.greaterThanEqual(1), () => { Break(); });
            }).Else(() => { s2.assign(int(e.bitAnd(uint(0xfff)))); l2.assign(i); Break(); });
          });
        });
      });
      // a page's texel: where p lies in its layer, read with the pixel's own steps there (the bias's too: so the filter's
      // step into the second mip is where the next level's page takes over)
      const texel = (slot, lv) => {
        const s = exp2(float(lv)).mul(S0), uv = fract(p.div(s.mul(PAGE))).mul(PAGE).add(BORDER).div(SLOT), k = exp2(uBias).div(s.mul(SLOT)), gx = dx.mul(k), gy = dy.mul(k);
        const n = tN.sample(uv).depth(slot).grad(gx, gy);
        return { a: tA.sample(uv).depth(slot).grad(gx, gy), n: tX ? vec4(n.xy, tX.sample(uv).depth(slot).grad(gx, gy).xy) : n };
      };
      const a = vec4(0.3, 0.3, 0.27, 0.5).toVar(), n = vec4(0.5, 0.5, 0, 0).toVar();   // (nothing in yet: a plain ground)
      If(s1.greaterThanEqual(0), () => {
        const R = texel(s1, l1); a.assign(R.a); n.assign(R.n);
        If(w1.lessThan(1).and(s2.greaterThanEqual(0)), () => { const Q = texel(s2, l2); a.assign(mix(Q.a, a, w1)); n.assign(mix(Q.n, n, w1)); });
      });
      return { c: a.rgb.mul(a.rgb), h: a.a, n: n.xy.mul(2).sub(1), cv: n.z, shade: n.w };
    },
  };
}
