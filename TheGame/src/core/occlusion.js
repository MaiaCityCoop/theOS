// What is hidden is not drawn (intent 0038, the draw path): two-pass occlusion culling of everything the tiers pack
// (src/scatter/tier.js), against a depth pyramid of the prepass's depth (Haar & Aaltonen, SIGGRAPH 2015; Nanite; Bevy).
//
//   the pyramid  once a frame, in compute, from the prepass's depth: level 0 half its pixels each way, each texel the
//                farthest of the four under it, and so on up to one texel (a buffer, not a texture: every level is one
//                array, the same on every GPU)
//   the boxes    as a tier packs (only then: standing still, nothing is packed), each thing's box is written beside the
//                others, in 16 bytes: its middle, half its size (its growth's reach in it, said by whoever draws it:
//                src/scatter/drawer.js, src/scatter/grass.js; as wide as it is deep) and how far the wind may push it,
//                a metre a unit of the wind's strength (its sway, reckoned as the culling runs: the wind changes while
//                nothing is packed)
//   pass one     before the prepass, every thing every culled tier has packed: its box outside this frame's view is
//                dropped; inside it, tested against the last frame's pyramid through the last frame's camera. What
//                passes is drawn, prepass and colour; what does not waits
//   then         the prepass draws, and the pyramid is made again from this frame's depth
//   pass two     what pass one held back, tested against that pyramid through this frame's camera: what is now seen
//                is drawn after the rest (a prepass of its own, then the colour with the rest). Nothing can come out
//                from behind something late: whatever this frame's depth does not hide is drawn this frame
// Every tier is culled by the same passes, at once: their things' boxes and what the passes keep lie in one set of
// buffers (an arena), each tier a range of them and each of its draws (a bucket) a range of that. So a frame dispatches
// seven passes (four for pass one, three for pass two) however many tiers there are; one a tier a pass, as until
// 2026-11-18, was six dispatches for each of 26 tiers, most of the culling's time. An arena's buffers are made when the
// first thing that reads them is built, as large as the tiers that joined it until then; a tier made after that (a
// stage's subject, what a page adds later) joins the next arena, and that is seven passes more. An arena is never
// larger than one buffer the GPU binds: a tier that would make it so opens the next one.
// A pass writes what it keeps with no atomic at all, in the order it was packed: each workgroup's 64 say which of them
// it keeps (a mask), a scan in shared memory over every workgroup's count says where each one's first goes, and each
// writes its own there (no subgroups: Safari has none). So a frame that sees what the last one saw draws it in the
// same order, and of two things at exactly the same depth the same one is drawn last, as before culling.
//
// Only the eye's passes are culled (src/core/pass.js: the prepass and the colour). The shadow map and every other view
// draw all that a tier packed, as before: what the camera cannot see may still cast a shadow into its view. So a
// tier's draws have three sets of arguments: all it packed (F, its own: tier.js), and in the arena what the eye sees
// (V: pass one's, then pass two's after them) and pass two's alone (L, for its prepass: from where pass one's end, their
// first instance). The eye's vertex stages read a thing through the list the passes kept (entry); every other pass reads
// it where the packing put it. The late prepass's draws are one render bundle, recorded again only when what it holds
// changes (a draw shown or hidden, a draw's corners). Without indirect-first-instance (a WebGPU feature) nothing is
// culled, and everything is drawn as before.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, uint, vec2, vec3, vec4, uvec4, ivec2, uniform, uniformArray, storage, texture, instanceIndex, workgroupId, localId, workgroupArray, workgroupBarrier, storageBarrier, atomicLoad, atomicStore, atomicOr, countOneBits, max, min, abs, floor, ceil, log2, exp2, clamp, packHalf2x16, unpackHalf2x16, floatBitsToUint, uintBitsToFloat } from 'three/tsl';
import { gpuStorage, gpuStorageLater, more, limitOf, remade, roomOf } from './gpu.js';
import { passOf } from './pass.js';
import { windStrength, snowDepth } from '../world/light.js';

const WG = 64, SW = 256, EPS = 2 ** -21;   // EPS: how much farther than the pyramid a box must be to be hidden (a few steps of a 24-bit depth); SW: the scans' workgroup
const LEVELS = 16;   // the pyramid's levels at most (2^16 texels a side)
// (a pass dispatched indirectly: what it reaches is its arguments' to say, so three's bound check, against its count
// as a u32 uniform, is as large as a u32 holds and never cuts it)
export const MANY = Uint32Array.of(-1)[0];
// (and laid out in two dimensions, each within the device's own limit (an indirect dispatch past it is no dispatch at
// all: nothing culled, a list read stale): uX workgroups a row, the rows as many as it takes; wgOf, a workgroup's place)
const uX = uniform(65535, 'uint');
/** A workgroup's place in an indirect dispatch laid out by sizeTo. */
export const wgOf = () => workgroupId.y.mul(uX).add(workgroupId.x);
/** An indirect dispatch's size for n workgroups, and n itself after it (its fourth number: what a scan loops over). */
export const sizeTo = (D, n) => { D.element(uint(0)).assign(n.min(uX)); D.element(uint(1)).assign(n.add(uX).sub(uint(1)).div(uX)); D.element(uint(3)).assign(n); };
/** The device's own workgroups a dimension, for what is laid out by sizeTo (src/scatter/tier.js too). */
export const useLimits = () => { uX.value = limitOf('maxComputeWorkgroupsPerDimension') || 65535; };

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
    PYR = { w0: w, h0: h, n, buf: gpuStorage('float', n, 'the depth pyramid (occlusion)', 'geometry') };
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
/** How far the wind may push a thing, a metre of its sway (a box's fourth number): at its strongest now (the gusts' most,
    src/world/weather/wind.js windAt, and a little more for what flutters). */
const gustOf = () => { const ws = windStrength; return ws.mul(1.65).mul(ws.mul(ws).mul(0.6).add(1)); };
/** A box in 16 bytes: its middle's x and z as they are, its height and its sway as half floats, half its width (x and
    z: the wider of the two) and half its height as half floats, each a little larger, never smaller, than it was. */
const boxOf = (B) => { const g = (x) => x.min(6e4).mul(1.002); return uvec4(floatBitsToUint(B.c.x), floatBitsToUint(B.c.z), packHalf2x16(vec2(B.c.y, g(B.w))), packHalf2x16(vec2(g(max(B.h.x, B.h.z)), g(B.h.y)))); };
/** And back, with the wind as it blows now and the snow lying (r: the 16 bytes): its middle and half its size, the
    height's half float's rounding (a 2048th of it) added to its half height. */
const unbox = (r0) => {
  const r = r0.toVar(), yw = unpackHalf2x16(r.z), hh = unpackHalf2x16(r.w), pad = yw.y.mul(gustOf()).add(snowDepth);
  return { c: vec3(uintBitsToFloat(r.x), yw.x, uintBitsToFloat(r.y)), h: vec3(hh.x.add(pad), hh.y.add(pad).add(abs(yw.x).mul(2 ** -10)), hh.x.add(pad)) };
};

// ---- what a pass keeps, in order, with no atomic: each workgroup says which of its 64 it keeps (a mask of 64 bits);
// one workgroup sums those over every chunk in shared memory (a scan: where each chunk's first goes); each workgroup
// then writes its own where that says. What is kept is kept in the order it was packed, frame after frame: of two
// things at exactly the same depth the same one is drawn last every frame, as before culling ----
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
/** The last of n (from lo) whose number get(i) is x at most, of numbers that never fall (a bucket's first chunk, or its
    first thing): by halving, `steps` times (as many as halve n down to one). */
const stepsOf = (n) => Math.ceil(Math.log2(Math.max(1, n))) + 1;
const lastAtMost = (get, lo, n, x, steps) => {
  const a = uint(lo).toVar(), b = uint(lo).add(n).toVar();
  Loop({ start: uint(0), end: uint(steps), type: 'uint', condition: '<' }, () => {
    If(b.sub(a).greaterThan(uint(1)), () => { const m = a.add(b).shiftRight(uint(1)).toVar(); If(get(m).lessThanEqual(x), () => { a.assign(m); }).Else(() => { b.assign(m); }); });
  });
  return a;
};

// ---- the arenas: the culled tiers, their things' boxes and what the passes keep of them, in one set of buffers ----
// A bucket's numbers, one layout (BUCKET: each number's place in a bucket is its place in the list, NB of them a bucket;
// and a bucket's more past the last, where the scans' ends are): its first thing in the arena (BASE), its room (CAP),
// its tier (TIER), its first chunk for pass one and for pass two (C1, C2), how many pass one keeps and holds back (N1,
// R1), how many its tier packed (PACK), and how many its tier packed into the buckets before it, its first box (PRE)
const BUCKET = ['BASE', 'CAP', 'TIER', 'C1', 'C2', 'N1', 'R1', 'PACK', 'PRE'];
const { BASE, CAP, TIER, C1, C2, N1, R1, PACK, PRE } = Object.fromEntries(BUCKET.map((name, at) => [name, at])), NB = BUCKET.length;
const ARENAS = [];
let OPEN = null;
const TIERS = new Set();
/** Whether `o` is drawn in `scene`: it and all it stands in shown, up to the scene. */
const inScene = (o, scene) => { for (; o; o = o.parent) { if (!o.visible && o.isMesh !== true) return false; if (o === scene) return true; } return false; };

function arena() {
  const A = { tiers: [], N: 0, G: 0, NC: 1, built: false, any: false };
  const boxes = gpuStorageLater('uvec4', 'tiers: their things\' boxes (occlusion)', 'geometry'), lists = gpuStorageLater('uint', 'tiers: what is seen, kept (occlusion)', 'geometry'), chunks = gpuStorageLater('uint', 'tiers: the culling\'s chunks (occlusion)', 'geometry');
  const BOX = boxes.node, LIST = lists.node, CH = chunks.node;
  // (the buckets' numbers, which tiers are drawn this frame, and the eye's draw arguments: the page writes into these,
  // so they are made with their numbers when the arena is built)
  const bk = new THREE.StorageBufferAttribute(new Uint32Array(NB), 1), on = new THREE.StorageBufferAttribute(new Uint32Array(1), 1), eye = new THREE.IndirectStorageBufferAttribute(new Uint32Array(10), 5);
  const BK = storage(bk, 'uint', 1), ON = storage(on, 'uint', 1).toReadOnly(), EYE = storage(eye, 'uint', 1);
  const d1 = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1, 0]), 1), d2 = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1, 0]), 1);
  const D1 = storage(d1, 'uint', 4), D2 = storage(d2, 'uint', 4), D1r = storage(d1, 'uint', 4).toReadOnly(), D2r = storage(d2, 'uint', 4).toReadOnly();   // (read only, how many chunks there are is the same for a whole workgroup: the scan may loop over them)
  const uN = uniform(1, 'uint'), uG = uniform(0, 'uint'), uNC = uniform(1, 'uint'), uB2 = uniform(6, 'uint'), uS = uniform(1, 'uint');   // (its things, its buckets, its chunks; where pass two's chunks begin; how many halvings find a bucket)
  const at = (g, f) => BK.element(g.mul(uint(NB)).add(uint(f))), set = (g, f, v) => { at(g, f).assign(v); };
  const countOf = (g) => ON.element(at(g, TIER)).greaterThan(uint(0)).select(at(g, PACK).min(at(g, CAP)), uint(0));   // (what of a bucket pass one tests: nothing of a tier not drawn this frame)
  const boxAt = (slot) => unbox(BOX.element(slot));
  const pop2 = (o) => countOneBits(CH.element(o)).add(countOneBits(CH.element(o.add(uint(1)))));
  const P = pyramidNode();
  // (a tier's buckets: each a room of its own, or a resident tier's laid out by its gather in one range, their first and
  // their count written by its packing each time: src/scatter/tier.js)
  const chunksOf = (t) => (t.caps ? t.caps.reduce((a, c) => a + Math.ceil(c / WG), 0) : Math.ceil(t.total / WG) + t.K);
  /** The arena's numbers and buffers, as large as its tiers: once, before anything binds them (every node that reads
      them asks), and again where a tier's range has changed (relayout). */
  const lay = () => {
    let N = 0, NC = 1; for (const t of A.tiers) { t.base = N; t.uBase.value = N; N += t.total; NC += chunksOf(t); }
    A.N = N; A.NC = NC;
    const { G } = A, B = new Uint32Array((G + 1) * NB), E = new Uint32Array(Math.max(1, G) * 10);
    for (const t of A.tiers) for (let k = 0; k < t.K; k++) {
      const g = t.g0 + k, o = g * NB; B[o + BASE] = t.base + t.offs[k]; B[o + CAP] = t.caps ? t.caps[k] : 0; B[o + TIER] = t.idx;
      E[g * 10] = E[g * 10 + 5] = t.T.args.array[k * 5];   // (as long as its draw: tier.js setLength keeps it)
    }
    B[G * NB + BASE] = N;
    Object.assign(bk, { array: B, count: B.length }); bk.needsUpdate = true; Object.assign(eye, { array: E, count: E.length / 5 }); eye.needsUpdate = true;
    A.bytes = boxes.make(N) + lists.make(2 * N) + chunks.make(NC * 9);
    uN.value = N; uG.value = G; uNC.value = NC; uB2.value = NC * 6; uS.value = stepsOf(G);
    return B.byteLength + E.byteLength;
  };
  A.build = () => {
    if (A.built) return;
    A.built = true; if (OPEN === A) OPEN = null;
    Object.assign(on, { array: new Uint32Array(Math.max(1, A.tiers.length)), count: Math.max(1, A.tiers.length) });
    const bytes = lay();
    more('tiers: the culling\'s numbers (occlusion)', bytes, bytes, 'geometry');
  };
  /** A tier's range changed (a resident tier's store made again: src/scatter/tier.js): every tier's place in the arena
      laid out again, its buffers made again at the new size, and every tier of it packed again (its boxes moved). */
  A.relayout = () => {
    if (!A.built) { A.N = A.tiers.reduce((n, t) => n + t.total, 0); A.NC = 1 + A.tiers.reduce((n, t) => n + chunksOf(t), 0); return; }
    lay();
    if (A.N > ROOM()) console.warn(`the culling's arena holds ${A.N} things, more than one binding holds (${ROOM()}): ${Math.round((A.N / ROOM()) * 100)} % of it; its class's budget must take the rest`);
    for (const t of A.tiers) t.T.repack?.();
  };
  // pass one's first chunks: a bucket's, from what it holds this frame (none for a tier not drawn); as many workgroups in all
  const prep = Fn(() => {
    A.build();
    const t = localId.x, acc = uint(0).toVar();
    Loop({ start: uint(0), end: uG, type: 'uint', condition: '<', update: SW }, ({ i }) => {
      const g = i.add(t), on = g.lessThan(uG), x = on.select(countOf(g.min(uG)).add(uint(WG - 1)).div(uint(WG)), uint(0)).toVar(), s = scanOf(x, t);
      If(on, () => { set(g, C1, acc.add(s.incl).sub(x)); });
      acc.addAssign(s.all);
      workgroupBarrier();
    });
    If(t.equal(uint(0)), () => { set(uG, C1, acc); sizeTo(D1, acc); });
  })().compute(SW, [SW]);
  // pass one: what is out of view dropped; what the last frame's pyramid does not hide drawn; the rest held back
  const oneTest = Fn(() => {
    A.build();
    const w = wgOf(), lid = localId.x, g = lastAtMost((q) => at(q, C1), 0, uG, w, uS), i = w.sub(at(g, C1)).mul(uint(WG)).add(lid), seen = float(0).toVar(), held = float(0).toVar();
    If(i.lessThan(countOf(g)), () => {
      const B = boxAt(at(g, BASE).add(i)), here = onScreen(U.vp, B.c, B.h);
      If(U.mode.lessThan(0.5).or(outside(here).not()), () => {
        seen.assign(1);
        If(U.mode.greaterThan(1.5).and(U.ok.greaterThan(0.5)), () => { If(hiddenBy(onScreen(U.pvp, B.c, B.h), P), () => { seen.assign(0); held.assign(1); }); });
      });
    });
    const wm = masksOf(lid, [seen.greaterThan(0.5), held.greaterThan(0.5)]);
    If(lid.lessThan(uint(4)).and(w.lessThan(at(uG, C1))), () => { CH.element(w.mul(uint(6)).add(lid)).assign(atomicLoad(wm.element(lid))); });
  })().compute(MANY, [WG]);
  oneTest.dispatchSize = d1;
  // (a scan over the n chunks of a pass, one workgroup: a chunk's numbers `per` apart from `base`, x(o) a chunk's count
  // (two counts at once, 65536 apart); out(o, a, b) where its first of each goes, and past the last where they end)
  const scanned = (n, per, base, x, out) => {
    const t = localId.x, cv = uint(0).toVar(), ch = uint(0).toVar();
    Loop({ start: uint(0), end: n, type: 'uint', condition: '<', update: SW }, ({ i }) => {
      const c = i.add(t), on = c.lessThan(n), o = uint(base).add(c.mul(uint(per))), y = on.select(x(o), uint(0)).toVar(), s = scanOf(y, t), ex = s.incl.sub(y);
      If(on, () => { out(o, cv.add(ex.bitAnd(uint(0xffff))), ch.add(ex.shiftRight(uint(16)))); });
      cv.addAssign(s.all.bitAnd(uint(0xffff))); ch.addAssign(s.all.shiftRight(uint(16)));
      workgroupBarrier();
    });
    If(t.equal(uint(0)), () => { out(uint(base).add(n.mul(uint(per))), cv, ch); });
    storageBarrier();
  };
  // where each chunk's first seen and first held back go; then, a bucket an invocation, what pass one keeps of it (the
  // eye's draw that long: the prepass draws them) and holds back, and pass two's first chunks
  const oneScan = Fn(() => {
    A.build();
    scanned(D1r.element(uint(3)).min(uNC.sub(uint(1))), 6, 0, (o) => pop2(o).add(pop2(o.add(uint(2))).shiftLeft(uint(16))), (o, a, b) => { CH.element(o.add(uint(4))).assign(a); CH.element(o.add(uint(5))).assign(b); });
    const t = localId.x, acc = uint(0).toVar();
    Loop({ start: uint(0), end: uG, type: 'uint', condition: '<', update: SW }, ({ i }) => {
      const g = i.add(t), on = g.lessThan(uG), r = uint(0).toVar();
      If(on, () => {
        const s0 = at(g, C1).mul(uint(6)), s1 = at(g.add(uint(1)), C1).mul(uint(6)), cap = at(g, CAP), a = CH.element(s1.add(uint(4))).sub(CH.element(s0.add(uint(4)))).min(cap).toVar();
        r.assign(CH.element(s1.add(uint(5))).sub(CH.element(s0.add(uint(5)))).min(cap));
        set(g, N1, a); set(g, R1, r); EYE.element(g.mul(uint(10)).add(uint(1))).assign(a); EYE.element(g.mul(uint(10)).add(uint(6))).assign(uint(0));
      });
      const x = r.add(uint(WG - 1)).div(uint(WG)).toVar(), s = scanOf(x, t);
      If(on, () => { set(g, C2, acc.add(s.incl).sub(x)); });
      acc.addAssign(s.all);
      workgroupBarrier();
    });
    If(t.equal(uint(0)), () => { set(uG, C2, acc); sizeTo(D2, acc); });
  })().compute(SW, [SW]);
  const oneWrite = Fn(() => {
    A.build();
    const w = wgOf(), lid = localId.x, g = lastAtMost((q) => at(q, C1), 0, uG, w, uS).toVar(), f = at(g, C1), base = at(g, BASE), i = w.sub(f).mul(uint(WG)).add(lid), c = w.mul(uint(6)), s0 = f.mul(uint(6));
    const m0 = CH.element(c), m1 = CH.element(c.add(uint(1))), h0 = CH.element(c.add(uint(2))), h1 = CH.element(c.add(uint(3)));
    If(w.lessThan(at(uG, C1)).and(isSet(m0, m1, lid)), () => { LIST.element(base.add(CH.element(c.add(uint(4))).sub(CH.element(s0.add(uint(4))))).add(below(m0, m1, lid))).assign(i); });
    If(w.lessThan(at(uG, C1)).and(isSet(h0, h1, lid)), () => { LIST.element(uN.add(base).add(CH.element(c.add(uint(5))).sub(CH.element(s0.add(uint(5))))).add(below(h0, h1, lid))).assign(i); });
  })().compute(MANY, [WG]);
  oneWrite.dispatchSize = d1;
  // pass two: what pass one held back, against this frame's pyramid through this frame's camera
  const twoTest = Fn(() => {
    A.build();
    const w = wgOf(), lid = localId.x, g = lastAtMost((q) => at(q, C2), 0, uG, w, uS).toVar(), j = w.sub(at(g, C2)).mul(uint(WG)).add(lid), seen = float(0).toVar();
    If(j.lessThan(at(g, R1)), () => { const base = at(g, BASE), B = boxAt(base.add(LIST.element(uN.add(base).add(j)))); If(hiddenBy(onScreen(U.vp, B.c, B.h), P).not(), () => { seen.assign(1); }); });
    const wm = masksOf(lid, [seen.greaterThan(0.5)]);
    If(lid.lessThan(uint(2)).and(w.lessThan(at(uG, C2))), () => { CH.element(uB2.add(w.mul(uint(3))).add(lid)).assign(atomicLoad(wm.element(lid))); });
  })().compute(MANY, [WG]);
  twoTest.dispatchSize = d2;
  // where each chunk's first goes; then, a bucket an invocation, pass two's prepass from where pass one's end, and the
  // eye's colour both
  const twoScan = Fn(() => {
    A.build();
    scanned(D2r.element(uint(3)).min(uNC.sub(uint(1))), 3, uB2, (o) => pop2(o), (o, a) => { CH.element(o.add(uint(2))).assign(a); });
    const t = localId.x;
    Loop({ start: t, end: uG, type: 'uint', condition: '<', update: SW }, ({ i: g }) => {
      const s0 = uB2.add(at(g, C2).mul(uint(3))), s1 = uB2.add(at(g.add(uint(1)), C2).mul(uint(3))), b = CH.element(s1.add(uint(2))).sub(CH.element(s0.add(uint(2)))).min(at(g, CAP)).toVar(), a = at(g, N1).toVar(), e = g.mul(uint(10));
      EYE.element(e.add(uint(6))).assign(b); EYE.element(e.add(uint(9))).assign(a); EYE.element(e.add(uint(1))).assign(a.add(b));
    });
  })().compute(SW, [SW]);
  const twoWrite = Fn(() => {
    A.build();
    const w = wgOf(), lid = localId.x, g = lastAtMost((q) => at(q, C2), 0, uG, w, uS).toVar(), f = at(g, C2), base = at(g, BASE), j = w.sub(f).mul(uint(WG)).add(lid), c = uB2.add(w.mul(uint(3))), s0 = uB2.add(f.mul(uint(3)));
    const m0 = CH.element(c), m1 = CH.element(c.add(uint(1)));
    If(w.lessThan(at(uG, C2)).and(isSet(m0, m1, lid)), () => { LIST.element(base.add(at(g, N1)).add(CH.element(c.add(uint(2))).sub(CH.element(s0.add(uint(2))))).add(below(m0, m1, lid))).assign(LIST.element(uN.add(base).add(j))); });
  })().compute(MANY, [WG]);
  twoWrite.dispatchSize = d2;
  Object.assign(A, { early: [prep, oneTest, oneScan, oneWrite], late: [twoTest, twoScan, twoWrite], BOX, LIST, BK, at, eye, on, debug: { bk, d1, d2, get lists() { return lists.attr; }, get chunks() { return chunks.attr; }, get boxes() { return boxes.attr; } } });
  ARENAS.push(A);
  return A;
}

let lateScene = null, bundle = null, shown = new Int32Array(0), built = false, bound = -1;   // (built: the pyramid is there to test against; bound: the buffers made again when the bundle was recorded, src/core/gpu.js remade)
const proxies = [];

/** A tier's culling: { args, boxes (two compute passes for the end of its packing: its draws' counts, as its own
    packing's last pass makes them, and each thing's box into the arena), entry
    (slot: where the eye's vertex stages read a thing: the bucket's place in the packing, a node), use(which),
    setLength(k, n), adopt(meshes) }.
    K: its buckets (draws); caps, offs: each bucket's room and where its things begin; total: all their room; S: rows a
    thing; data: the packing (vec4 nodes); args: its draw arguments (K × 5: what it packed); count: how many its packing
    put into each bucket (atomic, maybe more than its room); box(A, B, k): the world box
    of a thing of bucket k from its rows ({ c, h, w }: its middle, half its size, and how far the wind may push it, a
    metre of its sway: gustOf). */
/** The most things one arena holds: its boxes, 16 bytes each, one buffer the GPU binds and makes (the device's own
    limits, as large as its adapter has them: src/boot.js). */
const ROOM = () => Math.floor(Math.min(limitOf('maxStorageBufferBindingSize'), limitOf('maxBufferSize')) / 16);
/** Whether n things' room fits what the geometry's class has left (src/core/classes.js): a box (16 bytes) and two places
    in the lists (8) each. */
const BYTES = 16 + 8, fits = (n) => n * BYTES <= roomOf('geometry');
/** Whether a tier of `total` things can be culled (one that alone would fill more than an arena is drawn whole). */
export const cullable = (total) => total <= ROOM() && fits(total);
export function cullOf(T, { K, caps, offs, total, S, data, args, count, box, offAt = null }) {
  useLimits();   // (the device's own)
  if (OPEN && (OPEN.N + total > ROOM() || !fits(OPEN.N + total))) OPEN.build();   // (full: it is made as it is, and this tier opens the next)
  const A = (OPEN ||= arena()), uBase = uniform(A.N, 'uint'), me = { T, K, caps, offs, total, g0: A.G, base: A.N, idx: A.tiers.length, uBase };
  A.tiers.push(me); A.G += K; A.N += total; A.NC += caps ? caps.reduce((a, c) => a + Math.ceil(c / WG), 0) : Math.ceil(total / WG) + K;
  const F = storage(args, 'uint', 5 * K), uG0 = uniform(me.g0, 'uint');
  // after the packing (its last pass, in its stead): each draw as many as it holds, no more than its room; the same
  // into the arena, with how many the draws before it hold; and as many workgroups as work out their boxes. A bucket
  // laid out by its tier's packing (offAt: where its things begin, a node) says its first and its room here too
  const d = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1, 0]), 1), D = storage(d, 'uint', 4);
  const argsPass = Fn(() => {
    A.build();
    const run = uint(0).toVar();
    for (let k = 0; k < K; k++) {
      const g = uG0.add(uint(k)), n = (offAt ? atomicLoad(count.element(k)) : atomicLoad(count.element(k)).min(A.at(g, CAP))).toVar();
      if (offAt) { A.at(g, BASE).assign(uBase.add(offAt(uint(k)))); A.at(g, CAP).assign(n); }
      F.element(k * 5 + 1).assign(n); A.at(g, PACK).assign(n); A.at(g, PRE).assign(run); run.addAssign(n);
    }
    sizeTo(D, run.add(uint(WG - 1)).div(uint(WG)));
  })().compute(1);
  // then each thing it packed: its box, into the arena (a workgroup's 64 of them, whatever bucket each is in)
  const boxes = Fn(() => {
    A.build();
    const t = wgOf().mul(uint(WG)).add(localId.x), g = lastAtMost((q) => A.at(q, PRE), uG0, uint(K), t, stepsOf(K)).toVar(), k = g.sub(uG0), i = t.sub(A.at(g, PRE));
    If(i.lessThan(A.at(g, PACK)), () => {
      const s = A.at(g, BASE).sub(uBase).add(i), e = s.mul(uint(S)), B = box(data.element(e), data.element(e.add(uint(1))), k), o = uBase.add(s);
      A.BOX.element(o).assign(boxOf(B));
    });
  })().compute(MANY, [WG]);
  boxes.dispatchSize = d;
  const C = {
    args: argsPass, boxes, arena: A, g0: me.g0,
    /** Where the eye's passes read a thing of a bucket whose things begin at `slot` (a uint node): through what the passes
        kept; every other pass (the shadow map's, a still's, a bake's) where the packing put it. */
    entry: (slot) => Fn((builder) => { A.build(); const p = passOf(builder); return p === 'pre' || p === 'main' ? slot.add(A.LIST.element(uBase.add(slot).add(instanceIndex))) : slot.add(instanceIndex); })(),
    /** The draws' arguments for a pass: 'eye' (V), 'late' (L), 'rest' (F, its own). */
    use(which) {
      if (which === 'rest') T.geometries.forEach((g, k) => { g.indirect = args; g.indirectOffset = k * 20; });
      else { const o = which === 'late' ? 5 : 0; T.geometries.forEach((g, k) => { g.indirect = A.eye; g.indirectOffset = ((me.g0 + k) * 10 + o) * 4; }); }
    },
    /** Its range is another now (a resident tier's store made again, src/scatter/tier.js): the arena laid out again. */
    resize(n) { me.total = n; A.relayout(); },
    /** A draw's length (its corners) changed: in all three of its sets of arguments. */
    setLength(k, n) {
      args.array[k * 5] = n; args.addUpdateRange(k * 5, 1); args.needsUpdate = true;
      if (A.built) { const e = (me.g0 + k) * 10; A.eye.array[e] = A.eye.array[e + 5] = n; A.eye.addUpdateRange(e, 1); A.eye.addUpdateRange(e + 5, 1); A.eye.needsUpdate = true; }
    },
  };
  /** Its meshes, once they are made: each once more in the late prepass's bundle (src/core/screen.js draws it), with the
      same geometry, material and numbers. */
  C.adopt = (meshes) => {
    if (!lateScene) { lateScene = new THREE.Scene(); bundle = new THREE.BundleGroup(); lateScene.add(bundle); }
    for (const m of meshes) { const p = new THREE.Mesh(m.geometry, m.material); Object.assign(p, { frustumCulled: false, renderOrder: m.renderOrder, userData: m.userData, visible: false }); bundle.add(p); proxies.push([p, m, T]); }
    shown = new Int32Array(proxies.length).fill(-2);
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
  get arenas() { return ARENAS; },
  /** Before the prepass of `scene` (the camera shifted for this frame): pass one of every culled tier that packed
      anything and is drawn in it (a stage's growth may stand outside it, hidden: src/boot.js). */
  early(renderer, camera, w, h, scene) {
    if (!TIERS.size) return false;
    U.vp.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    U.ok.value = built && U.size.value.x === w && U.size.value.y === h ? 1 : 0;
    const list = [];
    for (const A of ARENAS) {
      A.any = false;
      for (const t of A.tiers) { t.T.drawn = t.T.n > 0 && inScene(t.T.mesh, scene); A.any ||= t.T.drawn; }
      if (!A.any) continue;
      A.build();
      for (const t of A.tiers) {
        const v = t.T.drawn ? 1 : 0;
        if (A.on.array[t.idx] !== v) { A.on.array[t.idx] = v; A.on.addUpdateRange(t.idx, 1); A.on.needsUpdate = true; }
        if (v) t.T.culler.use('eye');
      }
      list.push(...A.early);
    }
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
      bundle is to be drawn into the prepass (draw(): with each tier's pass-two arguments), and the colour. */
  late(renderer, depth, w, h, draw) {
    if (!TIERS.size) return;
    this.build(renderer, depth, w, h);
    const list = []; for (const A of ARENAS) if (A.any) list.push(...A.late);
    if (!list.length) return;
    renderer.compute(list);
    // (the bundle recorded again only when what it holds has changed: a draw shown or hidden, or its corners; or a
    // buffer its draws bind was made again: its bindings are recorded in it)
    let changed = bound !== remade(); bound = remade();
    for (let i = 0; i < proxies.length; i++) {
      const [p, m, T] = proxies[i], v = T.drawn && m.visible, s = v ? (m.geometry.index?.id ?? -1) : -2;
      p.visible = v; p.renderOrder = m.renderOrder;
      if (shown[i] !== s) { shown[i] = s; changed = true; }
    }
    if (changed) bundle.needsUpdate = true;
    for (const T of TIERS) if (T.drawn) T.culler.use('late');
    draw(lateScene);
    for (const T of TIERS) if (T.drawn) T.culler.use('eye');
  },
  /** After the eye's passes: every draw as the packing left it, for whatever draws next (the shadow map, a still, a bake). */
  rest() { for (const T of TIERS) T.culler.use('rest'); },
  /** Every pass culling runs, for compiling before the first frame. */
  passes() { if (!TIERS.size) return []; const out = [...passesOfPyramid().passes]; for (const A of ARENAS) out.push(...A.early, ...A.late); return out; },
  get scene() { return lateScene; },
};
if (typeof window !== 'undefined') window.__occlusion = occlusion;   // (for the tools that measure it: tools/bench.js)
