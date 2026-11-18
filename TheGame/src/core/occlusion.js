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
// A pass writes what it keeps by one atomic a workgroup: a scan of its 64 in shared memory says where each of them
// goes, and one of them asks the list for room for all (no subgroups: Safari has none).
//
// Only the eye's passes are culled (src/core/pass.js: the prepass and the colour). The shadow map and every other view
// draw all that a tier packed, as before: what the camera cannot see may still cast a shadow into its view. So a
// tier's draws have three sets of arguments: all it packed (F, the rest), what the eye sees (V: pass one's, then pass
// two's after them), and pass two's alone (L, for its prepass: from where pass one's end, their first instance). The
// eye's vertex stages read a thing through the list the passes kept (entry); every other pass reads it where the
// packing put it. Without indirect-first-instance (a WebGPU feature) nothing is culled, and everything is drawn as before.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, uint, vec2, vec4, ivec2, uniform, uniformArray, storage, texture, instanceIndex, workgroupId, localId, workgroupArray, workgroupBarrier, atomicAdd, atomicLoad, atomicStore, max, min, floor, ceil, log2, exp2, clamp } from 'three/tsl';
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

// ---- a workgroup's 64 written by one atomic: where each of them goes, by a scan in shared memory ----
/** flag: a number of this invocation's (0 … 1 of two lists at once: 1 the first, 65536 the second); returns { before:
    how many of the workgroup's lie before it, in each list (packed the same way), all: the workgroup's sums }. Every
    invocation of the workgroup must call it, none in a branch. */
const scan = (flag, lid) => {
  const sh = workgroupArray('uint', WG);
  sh.element(lid).assign(flag);
  workgroupBarrier();
  for (let off = 1; off < WG; off *= 2) {   // (Hillis and Steele: six steps of 64)
    const v = lid.greaterThanEqual(uint(off)).select(sh.element(lid.max(uint(off)).sub(uint(off))), uint(0)).toVar();
    workgroupBarrier();
    sh.element(lid).addAssign(v);
    workgroupBarrier();
  }
  return { before: sh.element(lid).sub(flag).toVar(), all: sh.element(uint(WG - 1)).toVar() };
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
  // counters a bucket (pass one's seen, its held back, pass two's seen, -), the buckets' first workgroups for each pass,
  // and each bucket's place and room
  const C1 = K * 4, C2 = C1 + K + 1, OF = C2 + K + 1, CAP = OF + K, init = new Uint32Array(CAP + K);
  for (let k = 0; k < K; k++) { init[OF + k] = offs[k]; init[CAP + k] = caps[k]; }
  const cnt = storage(new THREE.StorageBufferAttribute(init, 1), 'uint', init.length).toAtomic();
  const lists = gpuStorage('uint', 2 * Math.max(1, total)), L = lists.node;   // what pass one and two keep (by their place in their bucket), then what pass one held back
  more('tiers: what is seen, kept (occlusion)', lists.bytes, lists.lean ? 0 : lists.bytes);
  const A = storage(args, 'uint', 15 * K), d1 = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1]), 1), d2 = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1]), 1);
  const D1 = storage(d1, 'uint', 3), D2 = storage(d2, 'uint', 3);
  const F = (k, j) => A.element(uint(k).mul(uint(5)).add(uint(j))), V = (k, j) => A.element(uint(k).mul(uint(5)).add(uint(5 * K + j))), Lt = (k, j) => A.element(uint(k).mul(uint(5)).add(uint(10 * K + j)));
  const n = (k, j) => cnt.element(uint(k).mul(uint(4)).add(uint(j)));
  const thing = (k, i) => { const e = atomicLoad(cnt.element(uint(OF).add(k))).add(i).mul(uint(S)); return { A: data.element(e), B: data.element(e.add(uint(1))) }; };
  // (one invocation: the buckets' first workgroups, and as many workgroups in all, from what each holds)
  const firsts = (at, count, D) => {
    const acc = uint(0).toVar();
    for (let k = 0; k < K; k++) { atomicStore(cnt.element(uint(at + k)), acc); acc.addAssign(count(k).add(uint(WG - 1)).div(uint(WG))); }
    atomicStore(cnt.element(uint(at + K)), acc); D.element(uint(0)).assign(acc);
  };
  const bucketOf = (w, at) => { const k = uint(0).toVar(); Loop({ start: uint(1), end: uint(K), type: 'uint', condition: '<' }, ({ i }) => { If(w.greaterThanEqual(atomicLoad(cnt.element(uint(at).add(i)))), () => { k.assign(i); }); }); return k; };
  // after the packing: pass one's workgroups, from what each bucket holds now
  const prep = Fn(() => { If(instanceIndex.equal(uint(0)), () => { firsts(C1, (k) => F(k, 1), D1); }); })().compute(1);
  // pass one: what is out of view dropped; what the last frame's pyramid does not hide drawn; the rest held back
  const one = Fn(() => {
    const w = workgroupId.x, lid = localId.x, k = bucketOf(w, C1), i = w.sub(atomicLoad(cnt.element(uint(C1).add(k)))).mul(uint(WG)).add(lid);
    const valid = i.lessThan(F(k, 1)), seen = float(0).toVar(), held = float(0).toVar();
    If(valid, () => {
      const t = thing(k, i), B = box(t.A, t.B, k), here = onScreen(U.vp, B.c, B.h);
      If(U.mode.lessThan(0.5).or(outside(here).not()), () => {
        seen.assign(1);
        If(U.mode.greaterThan(1.5).and(U.ok.greaterThan(0.5)), () => { If(hiddenBy(onScreen(U.pvp, B.c, B.h), P), () => { seen.assign(0); held.assign(1); }); });
      });
    });
    const s = scan(uint(seen).add(uint(held).shiftLeft(uint(16))), lid), base = workgroupArray('uint', 2);
    If(lid.equal(uint(WG - 1)), () => {
      base.element(uint(0)).assign(atomicAdd(n(k, 0), s.all.bitAnd(uint(0xffff))));
      base.element(uint(1)).assign(atomicAdd(n(k, 1), s.all.shiftRight(uint(16))));
    });
    workgroupBarrier();
    const o = atomicLoad(cnt.element(uint(OF).add(k)));
    If(seen.greaterThan(0.5), () => { L.element(o.add(base.element(uint(0))).add(s.before.bitAnd(uint(0xffff)))).assign(i); });
    If(held.greaterThan(0.5), () => { L.element(uint(total).add(o).add(base.element(uint(1))).add(s.before.shiftRight(uint(16)))).assign(i); });
  })().compute(WG, [WG]);
  one.dispatchSize = d1;
  // after it: the eye's draws as long as pass one's lists (the prepass draws them), pass two's workgroups
  const oneArgs = Fn(() => {
    If(instanceIndex.equal(uint(0)), () => {
      for (let k = 0; k < K; k++) { V(k, 0).assign(F(k, 0)); V(k, 1).assign(atomicLoad(n(k, 0))); Lt(k, 0).assign(F(k, 0)); Lt(k, 1).assign(uint(0)); }
      firsts(C2, (k) => atomicLoad(n(k, 1)), D2);
    });
  })().compute(1);
  // pass two: what pass one held back, against this frame's pyramid through this frame's camera
  const two = Fn(() => {
    const w = workgroupId.x, lid = localId.x, k = bucketOf(w, C2), j = w.sub(atomicLoad(cnt.element(uint(C2).add(k)))).mul(uint(WG)).add(lid);
    const o = atomicLoad(cnt.element(uint(OF).add(k))), valid = j.lessThan(atomicLoad(n(k, 1))), i = valid.select(L.element(uint(total).add(o).add(j)), uint(0)).toVar(), seen = float(0).toVar();
    If(valid, () => { const t = thing(k, i), B = box(t.A, t.B, k); If(hiddenBy(onScreen(U.vp, B.c, B.h), P).not(), () => { seen.assign(1); }); });
    const s = scan(uint(seen), lid), base = workgroupArray('uint', 1);
    If(lid.equal(uint(WG - 1)), () => { base.element(uint(0)).assign(atomicAdd(n(k, 2), s.all)); });
    workgroupBarrier();
    If(seen.greaterThan(0.5), () => { L.element(o.add(atomicLoad(n(k, 0))).add(base.element(uint(0))).add(s.before)).assign(i); });
  })().compute(WG, [WG]);
  two.dispatchSize = d2;
  // after it: pass two's prepass from where pass one's end; the eye's colour both; the counters nought for the next frame
  const twoArgs = Fn(() => {
    If(instanceIndex.equal(uint(0)), () => {
      for (let k = 0; k < K; k++) {
        const a = atomicLoad(n(k, 0)), b = atomicLoad(n(k, 2));
        Lt(k, 1).assign(b); Lt(k, 4).assign(a); V(k, 1).assign(a.add(b));
        for (let j = 0; j < 3; j++) atomicStore(n(k, j), uint(0));
      }
    });
  })().compute(1);
  const C = {
    prep, early: [one, oneArgs], late: [two, twoArgs],
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
  /** After the prepass: the pyramid from its depth (w × h pixels), then pass two of every culled tier; then the late
      scene is to be drawn into the prepass (draw(): with each tier's pass-two arguments), and the colour. */
  late(renderer, depth, w, h, draw) {
    if (!TIERS.size) return;
    if (Math.ceil(w / 2) > PYR.w0 || Math.ceil(h / 2) > PYR.h0) { built = false; U.levels.value = 0; }   // (a screen larger than it can serve: nothing is hidden)
    else {
      const M = passesOfPyramid(); let at = 0, l = 0, x = w, y = h;
      M.dims.array[0].set(0, w, h, 0); M.tD.value = depth;
      for (; l < LEVELS; l++) { x = Math.ceil(x / 2); y = Math.ceil(y / 2); M.dims.array[l + 1].set(at, x, y, 0); U.lv.array[l].set(at, x, y, 0); M.passes[l].dispatchSize = x * y; at += x * y; if (x === 1 && y === 1) { l++; break; } }
      renderer.compute(M.passes.slice(0, l));
      U.levels.value = l; U.size.value.set(w, h); U.pvp.value.copy(U.vp.value); built = true;
    }
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
