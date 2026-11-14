// The world's materials (materials/*.js), painted once at the start by the GPU, a layer a material in arrays every
// shader binds whatever the number of materials: tex.a(material, uv) its albedo (gamma 2) and height, tex.n(material,
// uv) its relief (the normal's x and y), tex.r(material, uv) its roughness. The material: its recipe (imported) or
// its uid, or its layer as a node.
//
// Where the GPU has block compression (BC: every desktop; `?rawtex` leaves it off, to measure against) a material is
// kept compressed: 3 MB where it was 11, and no slower to read. Nothing compressed is downloaded: each painted tile
// is packed into blocks here, by a compute pass of our own (blocksOf), and copied into its layer on the GPU. A block
// is 4 by 4 texels:
//   A  (BC3, 16 bytes)  its colours four steps between two it keeps (5:6:5 bits); the height eight steps between
//                       two of its own (a leaf's cut-out is its height: the finer of the two)
//   N  (BC5, 16 bytes)  the normal's x and its y, each eight steps between two of its own. Its z is not kept: no
//                       read takes it, and it follows from the two
//   R  (BC4, 8 bytes)   the roughness, eight steps, at half the size (it is level in most materials)
// What is read as numbers, not seen (the noise the land is laid by, the billows the clouds and the snow are made
// from: materials of kind `noise`), is read as painted from a small array of its own: four steps a block would be
// steps in the land.
import * as THREE from 'three/webgpu';
import { Fn, If, vec2, vec3, vec4, uv, float, uint, uvec2, uvec4, uniform, sqrt, clamp, normalize, texture, instancedArray, instanceIndex, min, max, mix, dot, round, select } from 'three/tsl';
import { recipes } from '../core/registry.js';
import { note } from '../core/gpu.js';

const SIZE = 1024, LEVELS = Math.log2(SIZE) + 1;

// one material's tile, painted: its albedo (gamma 2) and height, or its normal and roughness. The writer turns the rows
// over: three reads a target's rows the other way up (src/scatter/ground.js), so the tile reads back exactly as painted.
function program(m, normalPass) {
  const frag = Fn(() => {
    const p = vec2(uv().x, float(1).sub(uv().y)), M = m.paint(p);
    if (!normalPass) return vec4(sqrt(clamp(M.col, 0, 1)), clamp(M.h, 0, 1));
    const e = 1 / SIZE, hx = m.paint(p.add(vec2(e, 0))).h, hy = m.paint(p.add(vec2(0, e))).h;
    return vec4(normalize(vec3(M.h.sub(hx).div(e), M.h.sub(hy).div(e), 1 / m.bump)).mul(0.5).add(0.5), M.rough);
  });
  const mat = new THREE.NodeMaterial(); mat.vertexNode = vec4(uv().mul(2).sub(1), 0, 1); mat.fragmentNode = frag(); mat.depthTest = mat.depthWrite = false;
  return mat;
}

// A tile's blocks, level by level: how many a side, and where each level lies in the buffers they are written to (rows
// of 32 blocks at the least: a row of a copy from a buffer is a multiple of 256 bytes, and R's blocks are 8).
const SIDES = Array.from({ length: LEVELS }, (_, l) => Math.max(1, SIZE >> (l + 2))), STRIDES = SIDES.map((s) => Math.max(32, s)), FIRST = [], AT = [];
let BLOCKS = 0, ROOM = 0;
SIDES.forEach((s, l) => { FIRST[l] = BLOCKS; BLOCKS += s * s; AT[l] = ROOM; ROOM += STRIDES[l] * s; });

// A painted tile packed into blocks, its every level in one pass: a block an instance. src: the painted tile with its
// mips. `normals` 0: a tile of A, its sixteen bytes to `out`; 1: of N, to `out`, and of R, its eight bytes to `outR`.
function blocksOf(src, out, outR) {
  const normals = uniform(0);
  const pass = Fn(() => {
    const lv = uint(0).toVar(), first = uint(0).toVar(), at = uint(0).toVar();
    for (let l = 1; l < LEVELS; l++) If(instanceIndex.greaterThanEqual(uint(FIRST[l])), () => { lv.assign(uint(l)); first.assign(uint(FIRST[l])); at.assign(uint(AT[l])); });
    const side = max(uint(SIZE >> 2).shiftRight(lv), uint(1)).toVar(), k = instanceIndex.sub(first), bx = k.mod(side).toVar(), by = k.div(side).toVar(), size = float(uint(SIZE).shiftRight(lv)), px = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) px.push(src.sample(vec2(float(bx.mul(uint(4)).add(uint(i))).add(0.5), float(by.mul(uint(4)).add(uint(j))).add(0.5)).div(size)).level(float(lv)).toVar());
    // one channel of a block, in 8 bytes: its largest and its smallest as bytes, then each texel the nearest of the
    // eight steps between the two (3 bits a texel: 0 the largest, 1 the smallest, 2 … 7 from the largest down)
    const steps = (v) => {
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
    // a block's colours, in 8 bytes: the two far corners of the box round them (which two: by how red and blue run
    // against green across the block), drawn in a little (the steps between then lie nearer most of them), as 5:6:5
    // bits; then each texel the nearest of the four steps along the line between the two (2 bits a texel: 0 the
    // first end, 1 the second, 2 and 3 between them)
    const colours = (v) => {
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
    const isN = normals.greaterThan(0.5), fourth = steps(px.map((c) => c.a)), red = steps(px.map((c) => c.r)), green = steps(px.map((c) => c.g)), rgb = colours(px.map((c) => c.rgb));
    const e = at.add(by.mul(max(side, uint(32)))).add(bx).toVar();
    out.element(e).assign(uvec4(select(isN, red[0], fourth[0]), select(isN, red[1], fourth[1]), select(isN, green[0], rgb[0]), select(isN, green[1], rgb[1])));
    outR.element(e).assign(uvec2(fourth[0], fourth[1]));
  })().compute(BLOCKS);
  return { pass, normals };
}

/** Bakes every material in the registry, a layer each. Returns how to read them (each a node, as any texture's: with
    .grad(dx, dy), .level()): { layer(material), a(material, uv): its albedo and height, n(material, uv): its relief
    (.xy: the normal's x and y, each 0 … 1), r(material, uv, dx?, dy?): its roughness (a number; dx, dy: how fast uv
    runs across the screen, where the read needs telling: inside a branch), packed: whether they are kept compressed }.
    raw: as painted, uncompressed (what a GPU without the formats gets). */
export function bakeTextures(renderer, raw = new URLSearchParams(location.search).has('rawtex')) {
  // seen at a low angle a texture is filtered along the slope, several taps a read: four for the colours, two for the
  // relief (its blur is not seen), not eight for both: at eye level the ground is most of the picture and its reads most
  // of a frame's time (a walk in the forest: 23 ms at eight, 19 at four and two, at one and a half pixels a point)
  const MATERIALS = recipes('material'), N = MATERIALS.length, DATA = MATERIALS.map((m, i) => (m.kind === 'noise' ? i : -1)).filter((i) => i >= 0);
  const dev = renderer.backend.device, PACKED = !raw && !!dev?.features?.has('texture-compression-bc');
  const array = (aniso, depth) => {
    const rt = new THREE.RenderTarget(SIZE, SIZE, { depth, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
    Object.assign(rt.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: aniso });
    renderer.initRenderTarget(rt); return rt.texture;
  };
  // (compressed: an array of blocks, `bytes` a block, its finest level the tile's level `from`; every level there
  // from the start, empty, filled below)
  const blocksArray = (format, bytes, aniso, from = 0) => {
    const sides = SIDES.slice(from), size = SIZE >> from, zero = new Uint8Array(N * sides[0] * sides[0] * bytes), mips = sides.map((b, l) => ({ data: zero.subarray(0, N * b * b * bytes), width: size >> l, height: size >> l }));
    const t = new THREE.CompressedArrayTexture(mips, size, size, N, format, THREE.UnsignedByteType);
    Object.assign(t, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: aniso, colorSpace: THREE.NoColorSpace, generateMipmaps: false, needsUpdate: true });
    renderer.initTexture(t); for (const m of mips) m.data = new Uint8Array(0);   // (sent once, empty; the page keeps none of it)
    return t;
  };
  const A = PACKED ? blocksArray(THREE.RGBA_S3TC_DXT5_Format, 16, 4) : array(4, N), Nn = PACKED ? blocksArray(THREE.RED_GREEN_RGTC2_Format, 16, 2) : array(2, N);
  const Rr = PACKED ? blocksArray(THREE.RED_RGTC1_Format, 8, 2, 1) : null, Dd = PACKED && DATA.length ? array(4, DATA.length) : null;
  note("the world's textures (arrays, a layer a material)", Math.round((PACKED ? (2 + 1 / 8) * N + 4 * DATA.length : 8 * N) * SIZE * SIZE * 4 / 3), 0);
  const tmp = new THREE.RenderTarget(SIZE, SIZE, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
  Object.assign(tmp.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  const prev = renderer.getRenderTarget(), box = new THREE.Box2(), at = new THREE.Vector3();
  const copy = (dst, i) => { for (let l = 0; l < LEVELS; l++) { const s = SIZE >> l; box.min.set(0, 0); box.max.set(s, s); at.set(0, 0, i); renderer.copyTextureToTexture(tmp.texture, dst, box, at, l, l); } };
  // (the painted tile into blocks, then each level's blocks into its layer's level: buffer to texture, on the GPU)
  const blocks = PACKED ? instancedArray(ROOM + 2048, 'uvec4') : null, blocksR = PACKED ? instancedArray(ROOM + 2048, 'uvec2') : null, enc = PACKED ? blocksOf(texture(tmp.texture), blocks, blocksR) : null;
  const pack = (i, normalPass) => {
    enc.normals.value = normalPass ? 1 : 0; renderer.compute(enc.pass);
    const e = dev.createCommandEncoder(), gpu = (x) => renderer.backend.get(x), to = gpu(normalPass ? Nn : A).texture;
    for (let l = 0; l < LEVELS; l++) {
      const size = { width: SIDES[l] * 4, height: SIDES[l] * 4, depthOrArrayLayers: 1 };
      e.copyBufferToTexture({ buffer: gpu(blocks.value).buffer, offset: AT[l] * 16, bytesPerRow: STRIDES[l] * 16, rowsPerImage: SIDES[l] }, { texture: to, mipLevel: l, origin: { x: 0, y: 0, z: i } }, size);
      if (normalPass && l > 0) e.copyBufferToTexture({ buffer: gpu(blocksR.value).buffer, offset: AT[l] * 8, bytesPerRow: STRIDES[l] * 8, rowsPerImage: SIDES[l] }, { texture: gpu(Rr).texture, mipLevel: l - 1, origin: { x: 0, y: 0, z: i } }, size);
    }
    dev.queue.submit([e.finish()]);
  };
  MATERIALS.forEach((m, i) => {
    for (const normalPass of [false, true]) {
      quad.material = program(m, normalPass);
      renderer.setRenderTarget(tmp); renderer.render(quad, cam); renderer.setRenderTarget(prev);   // its mipmaps are made as the pass ends
      if (!PACKED) copy(normalPass ? Nn : A, i);
      else { pack(i, normalPass); if (!normalPass && DATA.includes(i)) copy(Dd, DATA.indexOf(i)); }   // (what is read as numbers: as painted too, in its own array)
      quad.material.dispose();
    }
  });
  if (PACKED) { enc.pass.dispose(); for (const x of [blocks, blocksR]) renderer._attributes?.delete(x.value); }   // (the packer's own buffers: done with)
  tmp.dispose(); quad.geometry.dispose();
  const index = (ref) => { const uid = ref?.uid ?? ref, i = MATERIALS.findIndex((m) => m.uid === uid); if (i < 0) throw new Error(`no material ${uid}`); return i; };
  const tA = texture(A), tN = texture(Nn), tR = Rr ? texture(Rr) : null, tD = Dd ? texture(Dd) : null, layer = (m) => (m?.isNode ? m : index(m));   // (m: a recipe, a uid, or a layer as a node)
  return {
    layer: index, packed: PACKED,
    /** a material's albedo + height at uv */
    a: (m, p) => (!m?.isNode && tD && DATA.includes(index(m)) ? tD.sample(p).depth(DATA.indexOf(index(m))) : tA.sample(p).depth(layer(m))),
    /** its relief at uv: .xy the normal's x and y */
    n: (m, p) => tN.sample(p).depth(layer(m)),
    /** its roughness at uv */
    r: (m, p, dx = null, dy = null) => { const s = (tR ?? tN).sample(p).depth(layer(m)), t = dx ? s.grad(dx, dy) : s; return tR ? t.r : t.a; },
  };
}
