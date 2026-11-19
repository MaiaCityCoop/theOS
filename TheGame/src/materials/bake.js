// The world's materials (materials/*.js), painted by the GPU when the world first wears them, a layer each in arrays
// every shader binds whatever the number of materials: tex.a(material, uv) its albedo (gamma 2) and height, tex.n(material,
// uv) its relief (the normal's x and y), tex.r(material, uv) its roughness. The material: its recipe (imported) or its
// uid, or its number (tex.layer) as a node.
//
// A pool, not one layer a material of the library: the library may hold thousands, the world wears a few dozen. A
// material is painted when something wears it (what a biome or an asset names: painted at the start; anything else
// the moment it is asked for), into a free layer of the pool, and a table every read goes through says which layer
// it lies in (until it is painted: layer 0, a plain stand-in). Held by the world, it stays; asked for by a page
// (the library's pictures), it may give its layer up to the next, the longest unasked first.
//
// Where the GPU has block compression (BC: every desktop) a material is kept compressed: 2.8 MB where it was 11, and no slower to read. Nothing compressed is downloaded: each painted tile
// is packed into blocks here, by a compute pass of our own (blocksOf), and copied into its layer on the GPU. A block
// is 4 by 4 texels:
//   A  (BC3, 16 bytes)  its colours four steps between two it keeps (5:6:5 bits); the height eight steps between
//                       two of its own (a leaf's cut-out is its height: the finer of the two)
//   N  (BC5, 16 bytes)  the normal's x and its y, each eight steps between two of its own. Its z is not kept: no
//                       read takes it, and it follows from the two
//   R  (BC4, 8 bytes)   the roughness, eight steps, at half the size (it is level in most materials)
// What is read as numbers, not seen (the noise the land is laid by, the billows the clouds and the snow are made
// from: materials of kind `noise`), is read as painted from a small array of its own: four steps a block would be
// steps in the land. Those are always there.
import * as THREE from 'three/webgpu';
import { Fn, If, vec2, vec3, vec4, uv, float, uint, uvec2, uvec4, ivec2, uniform, sqrt, clamp, normalize, texture, textureLoad, property, outputStruct, instancedArray, instanceIndex, min, max, dot, round, select, uniformArray, int, renderGroup } from 'three/tsl';
import { recipes } from '../core/registry.js';
import { note } from '../core/gpu.js';
import { compileFor, inTurn } from '../core/compile.js';
import { source } from '../core/settle.js';

const SIZE = 1024, LEVELS = Math.log2(SIZE) + 1;

// one material's tile, painted once, into two targets: its albedo (gamma 2) and height as the tile keeps them, and the
// height as it was worked out with the roughness (32-bit floats), which the relief is taken from (below). The writer
// turns the rows over: three reads a target's rows the other way up (src/scatter/ground.js), so the tile reads back
// exactly as painted.
function program(m) {
  const raw = property('vec4', 'raw');
  const frag = Fn(() => {
    const p = vec2(uv().x, float(1).sub(uv().y)), M = m.paint(p);
    raw.assign(vec4(M.h, M.rough, 0, 1));
    return vec4(sqrt(clamp(M.col, 0, 1)), clamp(M.h, 0, 1));
  });
  const mat = new THREE.NodeMaterial(); mat.vertexNode = vec4(uv().mul(2).sub(1), 0, 1); mat.fragmentNode = outputStruct(frag(), raw); mat.depthTest = mat.depthWrite = false;
  mat.name = `painted: ${m.name}`;   // (what it is, where pipelines are told apart: the compile log, the gate, the census)
  return mat;
}
/** Material m's painting program: its tile (8 bits) and its heights and roughness (floats), drawn over a quad (a tool
    paints one alone by it: tools/paints.js). */
export const paintingOf = program;
/** The relief program over the heights painted into src (bumpInv: one over the material's bump), for the same tool. */
export const reliefOf = reliefProgram;
// The relief of a painted tile, one program for every material: the normal by the height's steps to the next texel
// across and the next down (the tile tiles: past its last texel lies its first), the roughness beside it. The same
// numbers as painting the material twice more a texel over (its height there), which each material's own pass did until
// 2026-11-15: twice the code to compile a material, and four times the painting. src: the heights' target; bumpInv:
// one over the material's bump.
function reliefProgram(src) {
  const bumpInv = uniform(1), e = 1 / SIZE;
  const frag = Fn(() => {
    const q = ivec2(vec2(uv().x, float(1).sub(uv().y)).mul(SIZE)), at = (dx, dy) => textureLoad(src, ivec2(q.x.add(dx).bitAnd(SIZE - 1), q.y.add(dy).bitAnd(SIZE - 1)));   // (the texel the painter wrote here: its rows turned as it turns them)
    const c = at(0, 0).toVar(), h = c.x, hx = at(1, 0).x, hy = at(0, 1).x;
    return vec4(normalize(vec3(h.sub(hx).div(e), h.sub(hy).div(e), bumpInv)).mul(0.5).add(0.5), c.y);
  });
  const mat = new THREE.NodeMaterial(); mat.vertexNode = vec4(uv().mul(2).sub(1), 0, 1); mat.fragmentNode = frag(); mat.depthTest = mat.depthWrite = false;
  return { mat, bumpInv };
}

// A tile's blocks, level by level: how many a side, and where each level lies in the buffers they are written to (rows
// of 32 blocks at the least: a row of a copy from a buffer is a multiple of 256 bytes, and R's blocks are 8).
const SIDES = Array.from({ length: LEVELS }, (_, l) => Math.max(1, SIZE >> (l + 2))), STRIDES = SIDES.map((s) => Math.max(32, s)), FIRST = [], AT = [];
let BLOCKS = 0, ROOM = 0;
SIDES.forEach((s, l) => { FIRST[l] = BLOCKS; BLOCKS += s * s; AT[l] = ROOM; ROOM += STRIDES[l] * s; });

/** One channel of a block of 4 × 4 texels (v: its sixteen values, 0 … 1, row by row) as BC4 keeps it, in 8 bytes (two
    uint nodes): its largest and its smallest as bytes, then each texel the nearest of the eight steps between the two (3
    bits a texel: 0 the largest, 1 the smallest, 2 … 7 from the largest down). Node code, in a Fn. */
export const steps = (v) => {
  const lo = float(1).toVar(), hi = float(0).toVar(); for (const x of v) { lo.assign(min(lo, x)); hi.assign(max(hi, x)); }
  const a0 = uint(round(hi.mul(255))).toVar(), a1 = uint(round(lo.mul(255))).toVar(), f1 = float(a1).div(255).toVar(), span = max(float(a0).div(255).sub(f1), 1e-6).toVar(), al = uint(0).toVar(), ah = uint(0).toVar();
  If(a0.greaterThan(a1), () => {
    v.forEach((x, n) => {
      const s = uint(round(clamp(x.sub(f1).div(span), 0, 1).mul(7))), idx = s.equal(uint(7)).select(uint(0), s.equal(uint(0)).select(uint(1), uint(8).sub(s))), bit = 3 * n;
      if (bit + 3 <= 32) al.assign(al.bitOr(idx.shiftLeft(uint(bit))));
      else if (bit >= 32) ah.assign(ah.bitOr(idx.shiftLeft(uint(bit - 32))));
      else { al.assign(al.bitOr(idx.bitAnd(uint((1 << (32 - bit)) - 1)).shiftLeft(uint(bit)))); ah.assign(ah.bitOr(idx.shiftRight(uint(32 - bit)))); }
    });
  });
  return [a0.bitOr(a1.shiftLeft(uint(8))).bitOr(al.bitAnd(uint(0xffff)).shiftLeft(uint(16))).toVar(), al.shiftRight(uint(16)).bitOr(ah.shiftLeft(uint(16))).toVar()];
};
/** A block's colours (v: its sixteen rgb, 0 … 1) as BC1 keeps them, in 8 bytes (two uint nodes): the two far corners of
    the box round them (which two: by how red and blue run against green across the block), drawn in a little (the
    steps between then lie nearer most of them), as 5:6:5 bits; then each texel the nearest of the four steps along the
    line between the two (2 bits a texel: 0 the first end, 1 the second, 2 and 3 between them). Node code, in a Fn. */
export const colours = (v) => {
  const lo = vec3(1).toVar(), hi = vec3(0).toVar(); for (const c of v) { lo.assign(min(lo, c)); hi.assign(max(hi, c)); }
  const mid = lo.add(hi).mul(0.5), cr = float(0).toVar(), cb = float(0).toVar();
  for (const c of v) { const t = c.sub(mid); cr.addAssign(t.r.mul(t.g)); cb.addAssign(t.b.mul(t.g)); }
  const rUp = cr.greaterThanEqual(0), bUp = cb.greaterThanEqual(0), E0 = vec3(select(rUp, hi.r, lo.r), hi.g, select(bUp, hi.b, lo.b)), E1 = vec3(select(rUp, lo.r, hi.r), lo.g, select(bUp, lo.b, hi.b)), inset = E0.sub(E1).div(16);
  const q565 = (c) => vec3(round(c.r.mul(31)), round(c.g.mul(63)), round(c.b.mul(31))), bits = (Q) => uint(Q.r).shiftLeft(uint(11)).bitOr(uint(Q.g).shiftLeft(uint(5))).bitOr(uint(Q.b));
  const Q0 = q565(clamp(E0.sub(inset), 0, 1)).toVar(), Q1 = q565(clamp(E1.add(inset), 0, 1)).toVar();
  const e1 = Q1.div(vec3(31, 63, 31)).toVar(), dir = Q0.div(vec3(31, 63, 31)).sub(e1).toVar(), dd = max(dot(dir, dir), 1e-8).toVar(), ci = uint(0).toVar();
  v.forEach((c, n) => {
    const s = uint(round(clamp(dot(c.sub(e1), dir).div(dd), 0, 1).mul(3)));
    ci.assign(ci.bitOr(s.equal(uint(3)).select(uint(0), s.equal(uint(2)).select(uint(2), s.equal(uint(1)).select(uint(3), uint(1)))).shiftLeft(uint(2 * n))));
  });
  return [bits(Q0).bitOr(bits(Q1).shiftLeft(uint(16))).toVar(), ci];
};

// A painted tile packed into blocks, its every level in one pass: a block an instance. src: the painted tile with its
// mips. `normals` 0: a tile of A, its sixteen bytes to `out`; 1: of N, to `out`, and of R, its eight bytes to `outR`.
function blocksOf(src, out, outR) {
  const normals = uniform(0);
  const pass = Fn(() => {
    const lv = uint(0).toVar(), first = uint(0).toVar(), at = uint(0).toVar();
    for (let l = 1; l < LEVELS; l++) If(instanceIndex.greaterThanEqual(uint(FIRST[l])), () => { lv.assign(uint(l)); first.assign(uint(FIRST[l])); at.assign(uint(AT[l])); });
    const side = max(uint(SIZE >> 2).shiftRight(lv), uint(1)).toVar(), k = instanceIndex.sub(first), bx = k.mod(side).toVar(), by = k.div(side).toVar(), size = float(uint(SIZE).shiftRight(lv)), px = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) px.push(src.sample(vec2(float(bx.mul(uint(4)).add(uint(i))).add(0.5), float(by.mul(uint(4)).add(uint(j))).add(0.5)).div(size)).level(float(lv)).toVar());
    const isN = normals.greaterThan(0.5), fourth = steps(px.map((c) => c.a)), red = steps(px.map((c) => c.r)), green = steps(px.map((c) => c.g)), rgb = colours(px.map((c) => c.rgb));
    const e = at.add(by.mul(max(side, uint(32)))).add(bx).toVar();
    out.element(e).assign(uvec4(select(isN, red[0], fourth[0]), select(isN, red[1], fourth[1]), select(isN, green[0], rgb[0]), select(isN, green[1], rgb[1])));
    outR.element(e).assign(uvec2(fourth[0], fourth[1]));
  })().compute(BLOCKS);
  return { pass, normals };
}

// Every material of the library, numbered (a material's number is its place here: tex.layer)
const ALL = recipes('material'), NUM = new Map(ALL.map((m, i) => [m.uid, i]));
/** The materials the world wears: every material a biome or an asset names (by its uid or its recipe, anywhere in its
    file; or only those of the recipes `of`), and those playing a part the engine asks for (a `role`). What only the
    library holds is not among them. */
export function usedMaterials(of = [...recipes('biome'), ...recipes('asset')]) {
  const out = new Set(), seen = new Set();
  const visit = (v, depth) => {
    if (v == null || depth > 10) return;
    if (typeof v === 'string') { if (NUM.has(v)) out.add(v); return; }
    if (typeof v !== 'object' || v.isNode || seen.has(v) || ArrayBuffer.isView(v)) return;
    seen.add(v);
    if (v.type === 'material' && v.uid) { out.add(v.uid); return; }
    // (its own values only: a getter may build a mesh to answer, as a tree's size does)
    for (const d of Object.values(Object.getOwnPropertyDescriptors(v))) if ('value' in d) visit(d.value, depth + 1);
  };
  for (const r of of) visit(r, 0);
  for (const m of ALL) if (m.role) out.add(m.uid);
  return ALL.filter((m) => out.has(m.uid));
}

/** The world's textures. Returns how to read them (each a node, as any texture's: with .grad(dx, dy), .level()):
    { layer(material): its number, a(material, uv): its albedo and height, n(material, uv): its relief (.xy: the
    normal's x and y, each 0 … 1), r(material, uv, dx?, dy?): its roughness (a number; dx, dy: how fast uv runs across
    the screen, where the read needs telling: inside a branch), want(material, hold?): paint it now if it is not
    there (hold: keep it until release(material)), flush(): paint what reads asked for while shaders were built
    (each frame), used: the materials the world wears, capacity: layers in the pool, packed: whether they are kept
    compressed, ready: a promise, the start's materials painted (they are compiled side by side meanwhile) }.
    opts: spare (layers beyond what the world wears, for what is asked for besides: the library's pictures); first
    (the materials painted at the start, held: by default all the world wears; the library's stage paints the land's
    and leaves each subject's to be painted when it is first worn: src/boot.js). A GPU without the formats gets them as
    painted, uncompressed. */
export function bakeTextures(renderer, { spare = 6, first = null } = {}) {
  // seen at a low angle a texture is filtered along the slope, several taps a read: four for the colours, two for the
  // relief (its blur is not seen), not eight for both: at eye level the ground is most of the picture and its reads most
  // of a frame's time (a walk in the forest: 23 ms at eight, 19 at four and two, at one and a half pixels a point)
  const USED = usedMaterials(), DATA = USED.filter((m) => m.kind === 'noise'), SEEN = USED.filter((m) => m.kind !== 'noise');
  const ROOM_OF = ALL.filter((m) => m.kind !== 'noise').length, CAP = 1 + Math.min(ROOM_OF, SEEN.length + spare);   // (layer 0: the stand-in)
  const dev = renderer.backend.device, PACKED = !!dev?.features?.has('texture-compression-bc');
  const array = (aniso, depth) => {
    const rt = new THREE.RenderTarget(SIZE, SIZE, { depth, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
    Object.assign(rt.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: aniso });
    renderer.initRenderTarget(rt); return rt.texture;
  };
  // (compressed: an array of blocks, `bytes` a block, its finest level the tile's level `from`; every level there
  // from the start, empty, filled as materials are painted)
  const blocksArray = (format, bytes, aniso, from = 0) => {
    const sides = SIDES.slice(from), size = SIZE >> from, zero = new Uint8Array(CAP * sides[0] * sides[0] * bytes), mips = sides.map((b, l) => ({ data: zero.subarray(0, CAP * b * b * bytes), width: size >> l, height: size >> l }));
    const t = new THREE.CompressedArrayTexture(mips, size, size, CAP, format, THREE.UnsignedByteType);
    Object.assign(t, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: aniso, colorSpace: THREE.NoColorSpace, generateMipmaps: false, needsUpdate: true });
    renderer.initTexture(t); for (const m of mips) m.data = new Uint8Array(0);   // (sent once, empty; the page keeps none of it)
    return t;
  };
  const A = PACKED ? blocksArray(THREE.RGBA_S3TC_DXT5_Format, 16, 4) : array(4, CAP), Nn = PACKED ? blocksArray(THREE.RED_GREEN_RGTC2_Format, 16, 2) : array(2, CAP);
  const Rr = PACKED ? blocksArray(THREE.RED_RGTC1_Format, 8, 2, 1) : null, Dd = DATA.length ? array(4, DATA.length) : null;
  note("the world's textures (a pool of layers, and the numbers' own)", Math.round((PACKED ? (2 + 1 / 8) * CAP : 8 * CAP) * SIZE * SIZE * 4 / 3 + DATA.length * SIZE * SIZE * 16 / 3), 0, 'ground', A, Nn, Rr, Dd);   // (ground: what the land's pages are laid from; the rocks and made things wear them too)

  // the painter: a target the tile is painted into, and (compressed) the pass that packs it and its buffers; made when
  // there is something to paint, let go half a minute after the last (made again, its packing pass, 53 KB, is compiled
  // again: the library's pictures, which come once its first view is complete, find it still there)
  let P = null, idle = 0, busy = 0;   // busy: the start's materials are being compiled for this painter's tile (paintAll)
  const painter = () => {
    clearTimeout(idle); idle = setTimeout(() => { if (!P || busy) return; P.tmp.dispose(); P.raw.dispose(); P.relief.mat.dispose(); P.quad.geometry.dispose(); if (P.enc) { P.enc.pass.dispose(); for (const x of [P.blocks, P.blocksR]) renderer._attributes?.delete(x.value); } P = null; }, 30000);
    if (P) return P;
    const tmp = new THREE.RenderTarget(SIZE, SIZE, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
    Object.assign(tmp.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
    // what a material is painted into: its tile (as `tmp` keeps it, without mipmaps), and its heights and roughness
    const raw = new THREE.RenderTarget(SIZE, SIZE, { count: 2, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.NoColorSpace });
    Object.assign(raw.textures[1], { type: THREE.FloatType, format: THREE.RGFormat });
    renderer.initRenderTarget(tmp); renderer.initRenderTarget(raw);   // (made as targets now: `tmp` is copied into before anything is drawn into it)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
    const relief = reliefProgram(raw.textures[1]), reliefQuad = new THREE.Mesh(quad.geometry, relief.mat); reliefQuad.frustumCulled = false;
    const blocks = PACKED ? instancedArray(ROOM + 2048, 'uvec4') : null, blocksR = PACKED ? instancedArray(ROOM + 2048, 'uvec2') : null;
    return (P = { tmp, raw, quad, relief, reliefQuad, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), blocks, blocksR, enc: PACKED ? blocksOf(texture(tmp.texture), blocks, blocksR) : null });
  };
  const box = new THREE.Box2(), at = new THREE.Vector3();
  const copy = (dst, i) => { for (let l = 0; l < LEVELS; l++) { const s = SIZE >> l; box.min.set(0, 0); box.max.set(s, s); at.set(0, 0, i); renderer.copyTextureToTexture(P.tmp.texture, dst, box, at, l, l); } };
  const pack = (i, normalPass) => {
    P.enc.normals.value = normalPass ? 1 : 0; renderer.compute(P.enc.pass);
    const e = dev.createCommandEncoder(), gpu = (x) => renderer.backend.get(x), to = gpu(normalPass ? Nn : A).texture;
    for (let l = 0; l < LEVELS; l++) {
      const size = { width: SIDES[l] * 4, height: SIDES[l] * 4, depthOrArrayLayers: 1 };
      e.copyBufferToTexture({ buffer: gpu(P.blocks.value).buffer, offset: AT[l] * 16, bytesPerRow: STRIDES[l] * 16, rowsPerImage: SIDES[l] }, { texture: to, mipLevel: l, origin: { x: 0, y: 0, z: i } }, size);
      if (normalPass && l > 0) e.copyBufferToTexture({ buffer: gpu(P.blocksR.value).buffer, offset: AT[l] * 8, bytesPerRow: STRIDES[l] * 8, rowsPerImage: SIDES[l] }, { texture: gpu(Rr).texture, mipLevel: l - 1, origin: { x: 0, y: 0, z: i } }, size);
    }
    dev.queue.submit([e.finish()]);
  };
  // a material painted into a layer (data: into its own array, as painted)
  const STANDIN = { uid: 'stand-in', bump: 1, paint: () => ({ h: float(0.5), col: vec3(0.25), rough: float(0.8) }) };
  // its tile painted once (quad: its program's), its albedo copied into the tile that is packed (its mipmaps are made
  // as it is copied); then its relief, from the heights, into the same tile (its mipmaps made as the pass ends)
  const draw = (quad, m, i, data) => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(P.raw); renderer.render(quad, P.cam); renderer.setRenderTarget(prev);
    renderer.copyTextureToTexture(P.raw.textures[0], P.tmp.texture);
    if (data) copy(Dd, i); else if (PACKED) pack(i, false); else copy(A, i);
    if (!data) {
      P.relief.bumpInv.value = 1 / m.bump;
      renderer.setRenderTarget(P.tmp); renderer.render(P.reliefQuad, P.cam); renderer.setRenderTarget(prev);
      if (PACKED) pack(i, true); else copy(Nn, i);
    }
    quad.material.dispose();
  };
  const paintInto = (m, i, data = false) => { painter(); P.quad.material = program(m); draw(P.quad, m, i, data); };
  // The start's materials, painted together: every program is built first and all of them are compiled side by side for
  // the targets they are painted into (a GPU that can compiles them in parallel, and the page goes on with the world
  // meanwhile), then each is painted as above. One at a time, each pass was compiled the moment it was first drawn,
  // one after another, and everything the GPU was asked after it waited (2026-11-15: 48 passes, 22 s of a start of 35
  // in a browser without a GPU). jobs: [material, layer, data].
  const paintAll = (jobs) => {
    painter(); busy++; const quads = [], all = new THREE.Group();
    for (const [m, i, data] of jobs) { const q = new THREE.Mesh(P.quad.geometry, program(m)); q.frustumCulled = false; all.add(q); quads.push([q, m, i, data]); }
    // (each for its own target, in turn: src/core/compile.js; the packing beside them; then the painting, in its turn too)
    const packing = P.enc ? renderer.compileComputeAsync(P.enc.pass) : null;
    for (const [target, what] of [[P.raw, all], [P.tmp, P.reliefQuad]]) compileFor(renderer, target, what, P.cam).catch(() => {});
    return inTurn(async () => { await packing; painter(); for (const [q, m, i, data] of quads) draw(q, m, i, data); }).finally(() => { busy--; });
  };

  // the table: a material's number to the layer it lies in, four to a row (0: not there, read the stand-in)
  const rows = Array.from({ length: Math.max(1, Math.ceil(ALL.length / 4)) }, () => new THREE.Vector4()), TABLE = uniformArray(rows, 'vec4').setGroup(renderGroup);   // (sent once a frame, not once a draw)
  const where = new Int32Array(ALL.length).fill(0), owner = new Int32Array(CAP).fill(-1), held = new Uint8Array(ALL.length), asked = new Float64Array(CAP), wanted = new Set();
  const setLayer = (k, layer) => { where[k] = layer; rows[k >> 2].setComponent(k & 3, layer); };
  const missing = new Set(), numberOf = (ref) => { const uid = ref?.uid ?? ref, k = NUM.get(uid); if (k !== undefined) return k; if (!missing.has(uid)) { missing.add(uid); console.warn(`[textures] no material ${uid}: drawn as the stand-in`); } return -1; };   // (a file naming a material that is not there: a grey stand-in, not a world that does not start)
  const isData = (k) => k >= 0 && ALL[k].kind === 'noise';
  const take = (k) => {   // a free layer, or the one asked for longest ago that nothing holds
    let best = -1;
    for (let i = 1; i < CAP; i++) { if (owner[i] < 0) { best = i; break; } if (!held[owner[i]] && (best < 0 || asked[i] < asked[best])) best = i; }
    if (best < 0) { console.warn(`[textures] the pool's ${CAP - 1} layers are all held: ${ALL[k].name} is drawn as the stand-in (raise 'spare')`); return 0; }
    if (owner[best] >= 0) setLayer(owner[best], 0);
    owner[best] = k; setLayer(k, best); return best;
  };
  const place = (k) => { const layer = take(k); if (layer) paintInto(ALL[k], layer); return layer; };
  /** a material there now (painted if it is not): its layer. hold: kept until release() */
  const want = (ref, hold = false) => {
    const k = numberOf(ref); if (k < 0) return 0; if (isData(k)) return -1;
    if (hold) held[k] = 1;
    const layer = where[k] || place(k); if (layer) asked[layer] = performance.now(); return layer;
  };
  const release = (ref) => { const k = numberOf(ref); if (k >= 0) held[k] = 0; };
  const flush = () => { if (!wanted.size) return; const list = [...wanted]; wanted.clear(); for (const k of list) if (!where[k]) want(ALL[k], true); };
  source('textures', () => wanted.size + busy);   // (what is still to be painted: asked for and not yet flushed, or the start's being compiled: src/core/settle.js)

  // the stand-in, the numbers' own, and what the world wears (held): their layers taken now, all painted together; the
  // world reads none of them before `ready`
  const jobs = [[STANDIN, 0, false], ...DATA.map((m, i) => [m, i, true])], now = first && new Set(first.map((m) => m?.uid ?? m));
  for (const m of SEEN) { const k = numberOf(m); if (k < 0 || where[k] || (now && !now.has(m.uid))) continue; held[k] = 1; const layer = take(k); if (layer) { asked[layer] = performance.now(); jobs.push([ALL[k], layer, false]); } }
  const ready = paintAll(jobs);
  const index = (ref) => { const k = numberOf(ref); if (k >= 0 && !isData(k) && !where[k]) wanted.add(k); return k; };   // (asked for while a shader is built: painted at the next flush)
  const tA = texture(A), tN = texture(Nn), tR = Rr ? texture(Rr) : null, tD = Dd ? texture(Dd) : null;
  const layer = (m) => { const k = m?.isNode ? int(m) : index(m); if (k === -1) return float(0); return TABLE.element(m?.isNode ? k.div(4) : int(k >> 2)).element(m?.isNode ? k.mod(4) : int(k & 3)); };   // (m: a recipe, a uid, or a material's number as a node)
  const data = (m) => { if (m?.isNode || !tD) return -1; const k = numberOf(m); return isData(k) ? DATA.indexOf(ALL[k]) : -1; };
  return {
    layer: index, want, release, flush, used: USED, capacity: CAP - 1, packed: PACKED,
    /** a promise: the start's materials painted (nothing that reads them may be drawn before) */
    ready,
    /** a material's albedo + height at uv */
    a: (m, p) => (data(m) >= 0 ? tD.sample(p).depth(data(m)) : tA.sample(p).depth(layer(m))),
    /** its relief at uv: .xy the normal's x and y */
    n: (m, p) => tN.sample(p).depth(layer(m)),
    /** its roughness at uv (dx, dy: its steps there; lv: its level, read so where no steps are, a vertex stage) */
    r: (m, p, dx = null, dy = null, lv = null) => { const s = (tR ?? tN).sample(p).depth(layer(m)), t = lv != null ? s.level(lv) : dx ? s.grad(dx, dy) : s; return tR ? t.r : t.a; },
  };
}
