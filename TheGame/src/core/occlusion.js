// What is hidden is not drawn (intent 0038, the draw path): two-pass occlusion culling of everything the tiers pack
// (src/scatter/tier.js), against a depth pyramid of the prepass's depth (Haar & Aaltonen, SIGGRAPH 2015; Nanite; Bevy).
//
//   the pyramid  once a frame, in compute, from the prepass's depth: level 0 half its pixels each way, each texel the
//                farthest of the four under it, and so on up to one texel (a buffer, not a texture: every level is one
//                array, the same on every GPU)
//   pass one     before the prepass, every thing a tier has packed: its box (its wind's sway and its growth's reach
//                in it, said by whoever draws it: src/scatter/drawer.js) outside this frame's view is dropped; inside
//                it, tested against the last frame's pyramid through the last frame's camera. What passes is drawn,
//                prepass and colour; what does not waits
//   then         the prepass draws, and the pyramid is made again from this frame's depth
//   pass two     what pass one held back, tested against that pyramid through this frame's camera: what is now seen
//                is drawn after the rest (a prepass of its own, then the colour with the rest). Nothing can come out
//                from behind something late: whatever this frame's depth does not hide is drawn this frame
// A pass writes what it keeps with no atomic at all, in the order it was packed: each workgroup's 64 say which of them
// it keeps (a mask), a scan in shared memory over every workgroup's count says where each one's first goes, and each
// writes its own there (no subgroups: Safari has none). So a frame that sees what the last one saw draws it in the
// same order, and of two things at exactly the same depth the same one is drawn last, as before culling.
//
// Only the eye's passes are culled (src/core/pass.js: the prepass and the colour). The shadow map and every other view
// draw all that a tier packed, as before: what the camera cannot see may still cast a shadow into its view. So a
// tier's draws have three sets of arguments: all it packed (F, the rest), what the eye sees (V: pass one's, then pass
// two's after them), and pass two's alone (L, for its prepass: from where pass one's end, their first instance). The
// eye's vertex stages read a thing through the list the passes kept (entry); every other pass reads it where the
// packing put it. Without indirect-first-instance (a WebGPU feature) nothing is culled, and everything is drawn as before.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, uint, vec2, vec4, ivec2, uniform, uniformArray, storage, texture, instanceIndex, workgroupId, localId, workgroupArray, workgroupBarrier, storageBarrier, atomicLoad, atomicStore, atomicOr, countOneBits, max, min, floor, ceil, log2, exp2, clamp } from 'three/tsl';
import { gpuStorage, more } from './gpu.js';
import { passOf } from './pass.js';

const WG = 64, EPS = 2 ** -21;   // EPS: how much farther than the pyramid a box must be to be hidden (a few steps of a 24-bit depth)
const LEVELS = 16;   // the pyramid's levels at most (2^16 texels a side)

// ---- the shared numbers: this frame's camera, and the pyramid's (its camera, its size, its levels) ----
const U = {
  vp: uniform(new THREE.Matrix4()),        // this frame's camera, its view and projection (shifted by its part of a pixel)
  pvp: uniform(new THREE.Matrix4()),       // the camera the pyramid was made through
  size: uniform(new THREE.Vector2(1, 1)),  // the depth the pyramid was made from, pixels
  levels: uniform(0, 'uint'),              // how many levels it has
  lv: uniformArray(Array.from({ length: LEVELS }, () => new THREE.Vector4()), 'vec4'),   // each level: where it begins in the buffer, its width, its height
  ok: uniform(0),                          // pass one may test against it (it is the last frame's, of this size)
  mode: uniform(2),                        // 0: nothing culled (everything packed is drawn); 1: only what is outside the view; 2: and what is hidden
};
let PYR = null;   // the pyramid's buffer: made with the first tier that is culled (its size: the largest screen it can serve)
const pyramidNode = () => {
  if (!PYR) {
    const w = Math.ceil(Math.max(3840, (globalThis.innerWidth ?? 1920) * 2) / 2), h = Math.ceil(Math.max(2160, (globalThis.innerHeight ?? 1080) * 2) / 2);
    let n = 0; for (let x = w, y = h; ; x = Math.ceil(x / 2), y = Math.ceil(y / 2)) { n += x * y; if (x === 1 && y === 1) break; }
    PYR = { w0: w, h0: h, n, buf: gpuStorage('float', n, 'the depth pyramid (occlusion)') };
  }
  return PYR.buf.node;
};

// ---- the test: a box's place on the screen, and whether a pyramid hides it ----
/** Where the box (centre c, half its size h: the world, vec3 nodes) lies to camera VP: its least and largest corner on
    the screen (-1 … 1, y up), its nearest depth (0 … 1), and whether it reaches the camera's plane or behind it. */
const onScreen = (VP, c, h) => {
  const b = VP.mul(vec4(c, 1)).toVar(), ex = VP.element(0).mul(h.x).toVar(), ey = VP.element(1).mul(h.y).toVar(), ez = VP.element(2).mul(h.z).toVar();
  const lo = vec2(1e9).toVar(), hi = vec2(-1e9).toVar(), z = float(1e9).toVar(), w = float(1e9).toVar();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = b.add(ex.mul(sx)).add(ey.mul(sy)).add(ez.mul(sz)).toVar(), q = p.xyz.div(max(p.w, 1e-6));
    w.assign(min(w, p.w)); lo.assign(min(lo, q.xy)); hi.assign(max(hi, q.xy)); z.assign(min(z, q.z));
  }
  return { lo, hi, z, near: w.lessThan(0.1) };   // (the near plane is 0.15 m off: a box that reaches nearer is not tested)
};
/** Whether it lies wholly outside the view (s: onScreen's). */
const outside = (s) => s.near.not().and(s.hi.x.lessThan(-1).or(s.lo.x.greaterThan(1)).or(s.hi.y.lessThan(-1)).or(s.lo.y.greaterThan(1)).or(s.z.greaterThan(1)));
/** Whether the pyramid hides it (s: onScreen's through the pyramid's own camera): its rectangle, a pixel wider each way
    (the frames' parts of a pixel), is two texels of a level at most; it is hidden where it is farther than the farthest
    of those four. */
const hiddenBy = (s, P) => {
  const W = U.size.x, H = U.size.y;
  const x0 = clamp(s.lo.x.mul(0.5).add(0.5).mul(W).sub(1), 0, W.sub(1)), x1 = clamp(s.hi.x.mul(0.5).add(0.5).mul(W).add(1), 0, W.sub(1));
  const y0 = clamp(float(0.5).sub(s.hi.y.mul(0.5)).mul(H).sub(1), 0, H.sub(1)), y1 = clamp(float(0.5).sub(s.lo.y.mul(0.5)).mul(H).add(1), 0, H.sub(1));
  const L = max(ceil(log2(max(max(x1.sub(x0), y1.sub(y0)), 1))).sub(1), 0), l = uint(L).toVar(), seen = l.greaterThanEqual(U.levels).or(s.near);   // (its level: texels of 2^(L+1) pixels, as large as it is)
  const out = seen.not().toVar();
  If(out, () => {
    const cell = exp2(L.add(1)), at = U.lv.element(l), o = uint(at.x), w = uint(at.y), wm = w.sub(uint(1)), hm = uint(at.z).sub(uint(1));
    const tx0 = uint(floor(x0.div(cell))).min(wm), tx1 = uint(floor(x1.div(cell))).min(wm), ty0 = uint(floor(y0.div(cell))).min(hm), ty1 = uint(floor(y1.div(cell))).min(hm);
    const d = max(max(P.element(o.add(ty0.mul(w)).add(tx0)), P.element(o.add(ty0.mul(w)).add(tx1))), max(P.element(o.add(ty1.mul(w)).add(tx0)), P.element(o.add(ty1.mul(w)).add(tx1))));
    out.assign(s.z.greaterThan(d.add(EPS)));
  });
  return out;
};

// ---- what a pass keeps, in order, with no atomic: each workgroup says which of its 64 it keeps (a mask of 64 bits);
// one workgroup sums those over every chunk in shared memory (a scan: where each chunk's first goes); each workgroup
// then writes its own where that says. What is kept is kept in the order it was packed, frame after frame: of two
// things at exactly the same depth the same one is drawn last every frame, as before culling ----
const SW = 256;   // the scan's workgroup
/** Hillis and Steele over the SW invocations of a workgroup (t: this one's): x its number; the sum of it and all before
    it, and of all. Every invocation calls it, none in a branch. */
const scanOf = (x, t) => {
  const sh = workgroupArray('uint', SW);
  sh.element(t).assign(x);
  workgroupBarrier();
  for (let off = 1; off < SW; off *= 2) {   // (eight steps)
    const v = t.greaterThanEqual(uint(off)).select(sh.element(t.max(uint(off)).sub(uint(off))), uint(0)).toVar();
    workgroupBarrier();
    sh.element(t).addAssign(v);
    workgroupBarrier();
  }
  return { incl: sh.element(t).toVar(), all: sh.element(uint(SW - 1)).toVar() };
};
/** Of a mask of 64 bits (m0, m1), whether bit b (0 … 63) is set, and how many below it are. */
const isSet = (m0, m1, b) => b.lessThan(uint(32)).select(m0.shiftRight(b.min(uint(31))), m1.shiftRight(b.max(uint(32)).sub(uint(32)))).bitAnd(uint(1)).equal(uint(1));
const below = (m0, m1, b) => b.lessThan(uint(32)).select(countOneBits(m0.bitAnd(uint(1).shiftLeft(b.min(uint(31))).sub(uint(1)))), countOneBits(m0).add(countOneBits(m1.bitAnd(uint(1).shiftLeft(b.max(uint(32)).sub(uint(32))).sub(uint(1))))));
/** A workgroup's masks of its flags (bool nodes, a list each): two numbers a list, in shared memory. At the top level. */
const masksOf = (lid, flags) => {
  const wm = workgroupArray('uint', 2 * flags.length).toAtomic();
  If(lid.lessThan(uint(2 * flags.length)), () => { atomicStore(wm.element(lid), uint(0)); });
  workgroupBarrier();
  flags.forEach((f, j) => { If(f, () => { atomicOr(wm.element(lid.shiftRight(uint(5)).add(uint(2 * j))), uint(1).shiftLeft(lid.bitAnd(uint(31)))); }); });
  workgroupBarrier();
  return wm;
};

// ---- the culled tiers, and what each frame does with them (src/core/screen.js) ----
const TIERS = new Set();
let lateScene = null, built = false;
const proxies = [];

/** A tier's culling: { prep (a compute pass for the end of its packing), early, late (its passes of a frame), entry
    (slot: where the eye's vertex stages read a thing: the bucket's place in the packing, a node), use(which) }.
    K: its buckets (draws); caps, offs: each bucket's room and where its things begin; total: all their room; S: rows a
    thing; data: the packing (vec4 nodes); args: its draw arguments, three sets (F, V, L: K × 5 each); box(A, B, k):
    the world box of a thing of bucket k ({ c, h }: its middle and half its size), from its rows. */
export function cullOf(T, { K, caps, offs, total, S, data, args, box }) {
  const P = pyramidNode();
  // a bucket's numbers: its first chunk (64 things, a workgroup's) for pass one and for pass two (and where the last's
  // end), where its things begin, how many pass one keeps and how many it holds back
  const C1 = 0, C2 = K + 1, OF = 2 * K + 2, N1 = OF + K, R1 = N1 + K, init = new Uint32Array(R1 + K);
  for (let k = 0; k < K; k++) init[OF + k] = offs[k];
  const metaAttr = new THREE.StorageBufferAttribute(init, 1), meta = storage(metaAttr, 'uint', init.length), at = (j, k) => meta.element(uint(j).add(k));
  // a chunk's, for pass one: which of its 64 are seen and which held back (two masks of 64 bits), where its first of
  // each goes; for pass two, after them: which are seen, where its first goes
  const NC = caps.reduce((a, c) => a + Math.ceil(c / WG), 0) + 1, chunks = gpuStorage('uint', NC * 9), Ch = chunks.node, B2 = NC * 6;
  const lists = gpuStorage('uint', 2 * Math.max(1, total)), L = lists.node;   // what pass one and two keep (by their place in their bucket), then what pass one held back
  more('tiers: what is seen, kept (occlusion)', lists.bytes + chunks.bytes, lists.lean ? 0 : lists.bytes + chunks.bytes);
  const A = storage(args, 'uint', 15 * K), d1 = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1]), 1), d2 = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1]), 1);
  const D1 = storage(d1, 'uint', 3), D2 = storage(d2, 'uint', 3), D1r = storage(d1, 'uint', 3).toReadOnly(), D2r = storage(d2, 'uint', 3).toReadOnly();   // (read only, how many chunks there are is the same for a whole workgroup: the scan may loop over them)
  const F = (k, j) => A.element(uint(k).mul(uint(5)).add(uint(j))), V = (k, j) => A.element(uint(k).mul(uint(5)).add(uint(5 * K + j))), Lt = (k, j) => A.element(uint(k).mul(uint(5)).add(uint(10 * K + j)));
  const thing = (k, i) => { const e = at(OF, k).add(i).mul(uint(S)); return { A: data.element(e), B: data.element(e.add(uint(1))) }; };
  // (one invocation: the buckets' first chunks, and as many workgroups in all, from what each holds)
  const firsts = (j0, count, D) => {
    const acc = uint(0).toVar();
    for (let k = 0; k < K; k++) { meta.element(uint(j0 + k)).assign(acc); acc.addAssign(count(k).add(uint(WG - 1)).div(uint(WG))); }
    meta.element(uint(j0 + K)).assign(acc); D.element(uint(0)).assign(acc);
  };
  const bucketOf = (w, j0) => { const k = uint(0).toVar(); Loop({ start: uint(1), end: uint(K), type: 'uint', condition: '<' }, ({ i }) => { If(w.greaterThanEqual(at(j0, i)), () => { k.assign(i); }); }); return k; };
  // (the scan, one workgroup: over the n chunks of a pass, a chunk's numbers `per` apart from `base`, x(o) a chunk's
  // count (two counts at once, 65536 apart); out(o, a, b) where its first of each goes, and past the last where they end;
  // then end(), for one invocation)
  const scanned = (n, per, base, x, out, end) => {
    const t = localId.x, cv = uint(0).toVar(), ch = uint(0).toVar();
    Loop({ start: uint(0), end: n, type: 'uint', condition: '<', update: SW }, ({ i }) => {
      const c = i.add(t), on = c.lessThan(n), o = uint(base).add(c.mul(uint(per))), y = on.select(x(o), uint(0)).toVar(), s = scanOf(y, t), ex = s.incl.sub(y);
      If(on, () => { out(o, cv.add(ex.bitAnd(uint(0xffff))), ch.add(ex.shiftRight(uint(16)))); });
      cv.addAssign(s.all.bitAnd(uint(0xffff))); ch.addAssign(s.all.shiftRight(uint(16)));
      workgroupBarrier();
    });
    If(t.equal(uint(0)), () => { out(uint(base).add(n.mul(uint(per))), cv, ch); });
    storageBarrier();
    If(t.equal(uint(0)), end);
  };
  const pop2 = (o) => countOneBits(Ch.element(o)).add(countOneBits(Ch.element(o.add(uint(1)))));
  // after the packing: pass one's chunks, from what each bucket holds now
  const prep = Fn(() => { If(instanceIndex.equal(uint(0)), () => { firsts(C1, (k) => F(k, 1), D1); }); })().compute(1);
  // pass one: what is out of view dropped; what the last frame's pyramid does not hide drawn; the rest held back
  const oneTest = Fn(() => {
    const w = workgroupId.x, lid = localId.x, k = bucketOf(w, C1), i = w.sub(at(C1, k)).mul(uint(WG)).add(lid), seen = float(0).toVar(), held = float(0).toVar();
    If(i.lessThan(F(k, 1)), () => {
      const t = thing(k, i), B = box(t.A, t.B, k), here = onScreen(U.vp, B.c, B.h);
      If(U.mode.lessThan(0.5).or(outside(here).not()), () => {
        seen.assign(1);
        If(U.mode.greaterThan(1.5).and(U.ok.greaterThan(0.5)), () => { If(hiddenBy(onScreen(U.pvp, B.c, B.h), P), () => { seen.assign(0); held.assign(1); }); });
      });
    });
    const wm = masksOf(lid, [seen.greaterThan(0.5), held.greaterThan(0.5)]);
    If(lid.lessThan(uint(4)), () => { Ch.element(w.mul(uint(6)).add(lid)).assign(atomicLoad(wm.element(lid))); });
  })().compute(NC * WG, [WG]);   // (its count as many as there can be: three returns early past it where a pass has no barrier)
  oneTest.dispatchSize = d1;
  // where each chunk's first seen and first held back go (counted over the tier: a bucket's own from its first chunk's);
  // then the eye's draws as long as what pass one keeps (the prepass draws them), what it held back, pass two's chunks
  const oneScan = Fn(() => {
    scanned(D1r.element(uint(0)), 6, 0, (o) => pop2(o).add(pop2(o.add(uint(2))).shiftLeft(uint(16))), (o, a, b) => { Ch.element(o.add(uint(4))).assign(a); Ch.element(o.add(uint(5))).assign(b); }, () => {
      for (let k = 0; k < K; k++) {
        const s0 = at(C1, uint(k)).mul(uint(6)), s1 = at(C1, uint(k + 1)).mul(uint(6)), a = Ch.element(s1.add(uint(4))).sub(Ch.element(s0.add(uint(4)))).toVar(), r = Ch.element(s1.add(uint(5))).sub(Ch.element(s0.add(uint(5)))).toVar();
        meta.element(uint(N1 + k)).assign(a); meta.element(uint(R1 + k)).assign(r);
        V(k, 0).assign(F(k, 0)); V(k, 1).assign(a); Lt(k, 0).assign(F(k, 0)); Lt(k, 1).assign(uint(0));
      }
      firsts(C2, (k) => meta.element(uint(R1 + k)), D2);
    });
  })().compute(SW, [SW]);
  const oneWrite = Fn(() => {
    const w = workgroupId.x, lid = localId.x, k = bucketOf(w, C1), s0 = at(C1, k).mul(uint(6)), i = w.sub(at(C1, k)).mul(uint(WG)).add(lid), c = w.mul(uint(6)), o = at(OF, k);
    const m0 = Ch.element(c), m1 = Ch.element(c.add(uint(1))), h0 = Ch.element(c.add(uint(2))), h1 = Ch.element(c.add(uint(3)));
    If(isSet(m0, m1, lid), () => { L.element(o.add(Ch.element(c.add(uint(4))).sub(Ch.element(s0.add(uint(4))))).add(below(m0, m1, lid))).assign(i); });
    If(isSet(h0, h1, lid), () => { L.element(uint(total).add(o).add(Ch.element(c.add(uint(5))).sub(Ch.element(s0.add(uint(5))))).add(below(h0, h1, lid))).assign(i); });
  })().compute(NC * WG, [WG]);   // (its count as many as there can be: three returns early past it where a pass has no barrier)
  oneWrite.dispatchSize = d1;
  // pass two: what pass one held back, against this frame's pyramid through this frame's camera
  const twoTest = Fn(() => {
    const w = workgroupId.x, lid = localId.x, k = bucketOf(w, C2), j = w.sub(at(C2, k)).mul(uint(WG)).add(lid), seen = float(0).toVar();
    If(j.lessThan(at(R1, k)), () => { const t = thing(k, L.element(uint(total).add(at(OF, k)).add(j))), B = box(t.A, t.B, k); If(hiddenBy(onScreen(U.vp, B.c, B.h), P).not(), () => { seen.assign(1); }); });
    const wm = masksOf(lid, [seen.greaterThan(0.5)]);
    If(lid.lessThan(uint(2)), () => { Ch.element(uint(B2).add(w.mul(uint(3))).add(lid)).assign(atomicLoad(wm.element(lid))); });
  })().compute(NC * WG, [WG]);   // (its count as many as there can be: three returns early past it where a pass has no barrier)
  twoTest.dispatchSize = d2;
  // where each chunk's first goes; then pass two's prepass from where pass one's end, and the eye's colour both
  const twoScan = Fn(() => {
    scanned(D2r.element(uint(0)), 3, B2, (o) => pop2(o), (o, a) => { Ch.element(o.add(uint(2))).assign(a); }, () => {
      for (let k = 0; k < K; k++) {
        const s0 = uint(B2).add(at(C2, uint(k)).mul(uint(3))), s1 = uint(B2).add(at(C2, uint(k + 1)).mul(uint(3))), b = Ch.element(s1.add(uint(2))).sub(Ch.element(s0.add(uint(2)))).toVar(), a = meta.element(uint(N1 + k)).toVar();
        Lt(k, 1).assign(b); Lt(k, 4).assign(a); V(k, 1).assign(a.add(b));
      }
    });
  })().compute(SW, [SW]);
  const twoWrite = Fn(() => {
    const w = workgroupId.x, lid = localId.x, k = bucketOf(w, C2), s0 = uint(B2).add(at(C2, k).mul(uint(3))), j = w.sub(at(C2, k)).mul(uint(WG)).add(lid), c = uint(B2).add(w.mul(uint(3))), o = at(OF, k);
    const m0 = Ch.element(c), m1 = Ch.element(c.add(uint(1)));
    If(isSet(m0, m1, lid), () => { L.element(o.add(at(N1, k)).add(Ch.element(c.add(uint(2))).sub(Ch.element(s0.add(uint(2))))).add(below(m0, m1, lid))).assign(L.element(uint(total).add(o).add(j))); });
  })().compute(NC * WG, [WG]);   // (its count as many as there can be: three returns early past it where a pass has no barrier)
  twoWrite.dispatchSize = d2;
  const C = {
    prep, early: [oneTest, oneScan, oneWrite], late: [twoTest, twoScan, twoWrite], debug: { lists: lists.attr, chunks: chunks.attr, meta: metaAttr, d1, d2, N1, R1 },
    /** Where the eye's passes read a thing of a bucket whose things begin at `slot` (a uint node): through what the passes
        kept; every other pass where the packing put it. */
    entry: (slot) => Fn((builder) => (passOf(builder) ? slot.add(L.element(slot.add(instanceIndex))) : slot.add(instanceIndex)))(),
    /** The draws' arguments for a pass: 'eye' (V), 'late' (L), 'rest' (F). */
    use(which) { const base = which === 'eye' ? 5 * K : which === 'late' ? 10 * K : 0; T.geometries.forEach((g, k) => { g.indirectOffset = (base + k * 5) * 4; }); },
  };
  /** Its meshes, once they are made: each once more in the scene of what pass two finds (src/core/screen.js draws it
      into the prepass), with the same geometry, material and numbers. */
  C.adopt = (meshes) => {
    lateScene ||= new THREE.Scene();
    for (const m of meshes) { const p = new THREE.Mesh(m.geometry, m.material); Object.assign(p, { frustumCulled: false, renderOrder: m.renderOrder, userData: m.userData, visible: false }); lateScene.add(p); proxies.push([p, m, T]); }
    TIERS.add(T);
  };
  return C;
}

// ---- the pyramid: made in compute, a level a pass ----
let MAKE = null;
const passesOfPyramid = () => {
  if (MAKE) return MAKE;
  const P = pyramidNode(), tD = texture(new THREE.DepthTexture(1, 1)), dims = uniformArray(Array.from({ length: LEVELS + 1 }, () => new THREE.Vector4()), 'vec4');   // (each level's: where it begins, its width, its height; the depth's first)
  const passes = Array.from({ length: LEVELS }, (_, l) => Fn(() => {
    const was = dims.element(uint(l)), is = dims.element(uint(l + 1)), w = uint(is.y), i = instanceIndex;
    If(i.lessThan(w.mul(uint(is.z))), () => {
      const x = i.mod(w), y = i.div(w), wm = uint(was.y).sub(uint(1)), hm = uint(was.z).sub(uint(1));
      const x0 = x.mul(uint(2)).min(wm), x1 = x.mul(uint(2)).add(uint(1)).min(wm), y0 = y.mul(uint(2)).min(hm), y1 = y.mul(uint(2)).add(uint(1)).min(hm);
      const read = l === 0 ? (xx, yy) => tD.load(ivec2(int(xx), int(yy))).level(0).r : (xx, yy) => P.element(uint(was.x).add(yy.mul(uint(was.y))).add(xx));
      P.element(uint(is.x).add(i)).assign(max(max(read(x0, y0), read(x1, y0)), max(read(x0, y1), read(x1, y1))));
    });
  })().compute(Math.ceil(PYR.w0 / 2 ** l) * Math.ceil(PYR.h0 / 2 ** l)));   // (its count the most it can be: three returns early past it)
  MAKE = { passes, dims, tD };
  return MAKE;
};

/** Each frame, by src/core/screen.js. */
export const occlusion = {
  /** Whether culling can be had here (WebGPU with indirect-first-instance). */
  can: (renderer) => !!renderer?.backend?.device?.features?.has?.('indirect-first-instance'),
  /** What is culled: 2 (all that is hidden), 1 (only what is outside the view), 0 (nothing: a measure's switch). */
  get mode() { return U.mode.value; }, set mode(v) { U.mode.value = v; },
  get tiers() { return TIERS; },
  /** Before the prepass (the camera shifted for this frame): pass one of every culled tier that packed anything. */
  early(renderer, camera, w, h) {
    if (!TIERS.size) return false;
    U.vp.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    U.ok.value = built && U.size.value.x === w && U.size.value.y === h ? 1 : 0;
    const list = []; for (const T of TIERS) if (T.n > 0) { list.push(...T.culler.early); T.culler.use('eye'); }
    if (list.length) renderer.compute(list);
    return true;
  },
  /** The pyramid from a depth of w × h pixels (the prepass's), drawn through this frame's camera. */
  build(renderer, depth, w, h) {
    if (Math.ceil(w / 2) > PYR.w0 || Math.ceil(h / 2) > PYR.h0) { built = false; U.levels.value = 0; return; }   // (a screen larger than it can serve: nothing is hidden)
    const M = passesOfPyramid(); let at = 0, l = 0, x = w, y = h;
    M.dims.array[0].set(0, w, h, 0); M.tD.value = depth;
    for (; l < LEVELS; l++) { x = Math.ceil(x / 2); y = Math.ceil(y / 2); M.dims.array[l + 1].set(at, x, y, 0); U.lv.array[l].set(at, x, y, 0); M.passes[l].dispatchSize = x * y; at += x * y; if (x === 1 && y === 1) { l++; break; } }
    renderer.compute(M.passes.slice(0, l));
    U.levels.value = l; U.size.value.set(w, h); U.pvp.value.copy(U.vp.value); built = true;
  },
  /** After the prepass: the pyramid from its depth (w × h pixels), then pass two of every culled tier; then the late
      scene is to be drawn into the prepass (draw(): with each tier's pass-two arguments), and the colour. */
  late(renderer, depth, w, h, draw) {
    if (!TIERS.size) return;
    this.build(renderer, depth, w, h);
    const list = []; for (const T of TIERS) if (T.n > 0) list.push(...T.culler.late);
    if (!list.length) return;
    renderer.compute(list);
    for (const [p, m, T] of proxies) { p.visible = m.visible && T.n > 0; p.renderOrder = m.renderOrder; }
    for (const T of TIERS) if (T.n > 0) T.culler.use('late');
    draw(lateScene);
    for (const T of TIERS) if (T.n > 0) T.culler.use('eye');
  },
  /** After the eye's passes: every draw as the packing left it, for whatever draws next (the shadow map, a still, a bake). */
  rest() { for (const T of TIERS) T.culler.use('rest'); },
  /** Every pass culling runs, for compiling before the first frame. */
  passes() { if (!TIERS.size) return []; const out = [...passesOfPyramid().passes]; for (const T of TIERS) out.push(...T.culler.early, ...T.culler.late); return out; },
  get scene() { return lateScene; },
};
if (typeof window !== 'undefined') window.__occlusion = occlusion;   // (for the tools that measure it: tools/bench.js)
