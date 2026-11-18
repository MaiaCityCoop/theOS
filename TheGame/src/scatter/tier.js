// Scatter: what stands on the land (blades, stones, boulders), a tier at a time. A tier is one instanced draw call a
// bucket: its instances are what stands in the cells of its band of distances. What stands in a cell is hashed, so
// choosing builds nothing. A cell that holds nothing is sent off screen (offScreen) before any of its work is done.
//
// On WebGPU a tier packs what stands into a buffer (a few vec4 a thing) in compute; the draw reads its count from the GPU
// (indirect), so the vertex stage runs only for what stands, and reads it ready-made. Two ways of choosing the cells:
//   - resident (a grid's tier: the plants' levels, the rocks, the meadow's rings; it brings found and select): its
//     regions are kept from one packing to the next, whatever the eye looks at (src/scatter/regions.js Resident). What
//     they hold lies in a store (found: a cell's thing, where it may be of the level while the camera stays within its
//     region's pad); a packing copies forward what is still right, visits only the cells of regions new or run out, and
//     gathers from the store into the draws' buckets what is of the level now (select). The eye's culling takes it from
//     there, a thing at a time, every frame (src/core/occlusion.js): turning the head packs nothing. Its store and its
//     buckets are as large as it has found it needs (its own count, read back), never a number set by hand;
//   - its own patches (a placer that says where it looks: a list's runs, src/scatter/placed.js; the stress stand's plots
//     and the herds; the walker's bodies round a point; it brings live): the patches nearest first, packed again when they
//     or what they read change, each bucket in a room of its own (cap).
// Without WebGPU (the WebGL 2 fallback) live runs in the vertex stage, per vertex, over square patches.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, uint, int, ivec2, vec4, uniform, uniformArray, instancedArray, storage, atomicAdd, atomicStore, atomicLoad, min, instanceIndex, localId, workgroupArray, workgroupBarrier, cameraProjectionMatrix, cameraViewMatrix, uintBitsToFloat } from 'three/tsl';
import { boxIn } from '../core/frustum.js';
import { gpuStorageLater, more, note, hasFeature, limitOf, roomOf, bytesOf } from '../core/gpu.js';
import { cullOf, cullable, MANY, wgOf, sizeTo, useLimits } from '../core/occlusion.js';
import { did } from '../core/work.js';
import { FNV, fnv } from '../core/hash.js';
import { passOf, vWas } from '../core/pass.js';
import { source } from '../core/settle.js';
import { onMeasure, dialK } from '../detail/measure.js';
import { Resident, WG, BLOCK, MARGIN } from './regions.js';
import { BAND } from '../detail/error.js';

/** The patches a placer that chooses its own may hand a tier at most (the stress stand's plots, the herds, a list's
    runs; and the WebGL 2 fallback's square patches): each tier looks at the nearest of them first. */
export const MAXP = 384;
/** The regions a resident tier may hold at once (src/scatter/regions.js Resident: up to a few thousand, measured
    walking the bench's views, tools/visits.js walk): every one of them may be packed in one packing, after a jump. */
const LEAVES = 8192;

/** where a vertex that should not be drawn goes */
export const offScreen = () => vec4(2, 2, 2, 1);
/** a world point to the clip space of whichever camera draws it (the eye's, or the shadow's); was: where the point lay
    a frame ago (none: where it is now), handed to the prepass's pixels for their motion (src/core/pass.js) */
export const clipOf = Fn(([w, was], builder) => { if (passOf(builder) === 'pre') vWas.assign(was ?? w); return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1)); });

// Every tier's band follows the lens and the measure: when the window, the governor's ratio or the dial changes, each
// tier that reckons its band by them (its band(): the drawer's tiers, src/scatter/drawer.js) reckons it again. One
// handler for every tier of every placer.
const ALL = new Set();
const reband = () => { for (const T of ALL) T.band?.(); };
addEventListener('resize', reband); onMeasure(reband);
const FOUND = [];   // (the patches a frame finds, before the nearest are taken)
const bitsOf = (x) => new Uint32Array(new Float32Array([x]).buffer)[0];

export class Tier {
  /** cell: metres per cell; P: cells per patch side (its own patches'; and what sets how far the camera may move before
      it packs or gathers again: a sixteenth of a patch); near/far: the band, in metres as a 68° lens sees them.
      cull: metres the eye's view is widened by before a patch outside it is dropped (its own patches), or false to keep
      every patch round the camera; fixed: metres round the camera, whatever the lens.
      material(src, k) is bucket k's: src.read(j), its thing's j-th vec4 of `slots`, ready-made (src.readAt(j, slot): of
      the bucket a mesh says, its userData.slot); without WebGPU, the cell its instance stands for.
      A resident tier brings found(cell, { pad }) -> { alive, data: [vec4, …] } (what a cell holds, where it may be of
      the level for a camera within `pad` metres, as the lens sees them, of where it is now) and select(rows) -> { alive,
      bucket, also?, data? } (whether a thing held is of the level now, and its bucket: which of its geometries draws it;
      also: a second one, -1 none, a thing handing over between two draws); metres: its band is metres, not sizes on
      screen (the meadow's rings).
      Another brings live(cell, part) -> { alive, data, bucket?, also? } (found and select in one) and `cap`, the most
      that may stand at once (a number: of each bucket; or a list, a cap a bucket); spans: a list's tier
      (src/scatter/placed.js): spans(i, j) says which runs of the list patch (i, j) holds, [[start, count], …] (each count
      at most P × P), each run a patch of its own to the packing; live is then told which run a cell is of and which of
      its places ({ pid, b, span: (start, count) }).
      bounds(A, B, k): where what it packs is drawn by the eye, it is culled (src/core/occlusion.js): the world box of a
      thing packed into bucket k ({ c, h, w }: its middle and half its size, its growth in it; how far the wind may push
      it, a metre of its sway), from its first two rows. */
  constructor(scene, geometry, material, o) {
    const { cell, P, near = 0, far, order = 0, live = null, found = null, gpu = false, cull = 0, fixed = 0, spans = null, metres = false, table = null } = o;
    ALL.add(this);
    Object.assign(this, { cull, fixed, P, S: cell * P, cell, near: Math.max(0, near), far, n: 0, over: false, metres, spans, table });
    this.list = Array.from({ length: MAXP }, () => new THREE.Vector2());
    this.runs = spans ? Array.from({ length: MAXP }, () => new THREE.Vector2()) : null;
    const geos = Array.isArray(geometry) ? geometry : [geometry];
    this.geometries = geos; this.geometry = geos[0]; geos.forEach((g) => (g.instanceCount = 0));
    this.meshes = (live || found) && gpu ? (found ? residentPackedOf : packedOf)(this, geos, material, o) : fallbackOf(this, geos, material);
    this.mesh = this.meshes[0];
    for (const m of this.meshes) { m.frustumCulled = false; m.renderOrder = order; scene.add(m); }
    this.culler?.adopt(this.meshes);
  }
  /** Packed again at the next run (the culling's arena laid out again: src/core/occlusion.js). */
  repack() { this.key = null; this.resident?.dirty(); }
  /** Draw k's length (its corners, n) changed: in every set of its arguments (culled: the eye's too). */
  setLength(k, n) {
    if (this.culler) { this.culler.setLength(k, n); return; }
    this.args.array[k * 5] = n; this.args.addUpdateRange(k * 5, 1); this.args.needsUpdate = true;
  }
  /** On WebGPU, after select: pack what stands, again only when something it reads has changed. A resident tier: its
      regions, what they read (`kept`: the lens, the stage, the ways, things' own state) and what its gather reads
      (`world`: the heap, the ground's map; the camera by a step). One of its own patches: those, what they read
      (`world`), the camera by a sixteenth of a patch, and the view (`view`: src/scatter/view.js) where it is keyed on it. */
  run(renderer, world = '', cx = 0, cy = 0, cz = 0, view = '', kept = world) {
    if (!this.passes) return;
    if (this.resident) { this.resident.run(renderer, world, kept, cx, cy, cz); return; }
    const q = this.step || Math.max(0.25, this.S / 16), n = this.n;   // (step: a tier that says itself how far the camera may move before it packs again)
    const key = `${world}|${this.near}|${this.far}|${Math.round(cx / q)},${Math.round(cy / q)},${Math.round(cz / q)}|${this.reads?.() ?? ''}|${n}|${this.patchKey()}|${this.viewKeyed ? view : ''}`;
    if (key === this.key) return;
    this.key = key;
    if (!n && this.empty) return;   // (nothing chosen, and nothing left packed from before: no pass to make it nought again)
    const cells = this.patchesIn();
    renderer.compute(this.passes); did('packs'); if (this.movers) did('moving'); did('kcells', Math.round(cells / 1000)); this.empty = !n;   // (moving: a tier packed every frame, its things moving; not a change of what stands: src/core/work.js changed)
  }
  /** Its patches read into two numbers, not written out one by one (a string of hundreds of them a tier a frame was a
      megabyte of litter every few frames for the browser to sweep up); a list's runs too (the same patch may hold other
      places now). */
  patchKey() {
    const { list, runs, n } = this; let h1 = FNV, h2 = 0x9e3779b9;
    for (let i = 0; i < n; i++) { const x = list[i].x | 0, y = list[i].y | 0; h1 = fnv(fnv(h1, x), y); h2 = Math.imul((h2 << 5) ^ (h2 >>> 27) ^ x, 0x85ebca6b) + y | 0; }
    if (runs) for (let i = 0; i < n; i++) { const a = runs[i].x | 0, b = runs[i].y | 0; h1 = fnv(h1, a); h2 = Math.imul((h2 << 5) ^ (h2 >>> 27) ^ b, 0x85ebca6b) + a | 0; }
    return `${h1}|${h2}`;
  }
  /** Its patches into its entries, each P × P cells at its workgroups: the invocations they take. */
  patchesIn() {
    const { list, runs, n, P } = this, per = Math.ceil((P * P) / WG) * WG, E = this.entries.array;
    for (let i = 0; i < n; i++) { E[i * 4] = list[i].x >>> 0; E[i * 4 + 1] = list[i].y >>> 0; E[i * 4 + 2] = P; E[i * 4 + 3] = i * per; if (runs) { this.entryRuns.array[i * 2] = runs[i].x; this.entryRuns.array[i * 2 + 1] = runs[i].y; } }
    this.nE.value = n; this.passes[1].dispatchSize = Math.max(WG, n * per);
    this.entries.addUpdateRange(0, Math.max(1, n) * 4); this.entries.needsUpdate = true;
    if (runs && n) { this.entryRuns.addUpdateRange(0, n * 2); this.entryRuns.needsUpdate = true; }
    return n * per;
  }
  /** On WebGPU: what the last packing holds, read back to the CPU a moment later (a promise of { count, wanted, data: its
      slots' vec4s as floats, one array a slot } a bucket; wanted: how many it found, past its room too), for what the
      CPU must know of where things stand (src/scatter/trees.js: what of a stand is solid round the walker). Only what is
      packed is read, bucket by bucket, through one buffer kept for it (in the ledger, as large as the largest read). */
  async read(renderer) {
    // (a resident tier's counts and where each bucket's things begin, as its gather laid them out: in the rows every
    // resident tier shares, from its own on; its own patches' where they were set, here (their buffer is bound by no
    // pass: only its draws read it, and a tier that is not drawn, the walker's stand, src/scatter/trees.js standBodies,
    // never binds it))
    const K = this.geometries.length, S = this.slots, me = this.residentRow, out = [];
    const small = (await Promise.all((me ? [this.args, GR.Cs.attr, this.offsets] : [this.args, this.count.value]).map((b) => renderer.getArrayBufferAsync(b)))).map((b) => new Uint32Array(b));
    const n = small[0], found = me ? small[1].subarray(me.kb, me.kb + K) : small[1], off = me ? small[2] : this.offsets.array;
    for (let k = 0; k < K; k++) {
      const count = Math.min(n[k * 5 + 1], this.room(k)), rows = Array.from({ length: S }, () => new Float32Array(count * 4));
      if (count) {
        const bytes = count * S * 16;
        if (!this.back || this.back.maxByteLength < bytes) { this.back?.dispose(); this.back = new THREE.ReadbackBuffer(bytes); this.back.name = 'tier'; note(`tiers: read back (${this.asset ?? 'a tier'})`, bytes, 0, 'geometry'); }
        await renderer.getArrayBufferAsync(this.data.value, this.back, off[k] * S * 16, bytes);
        const f = new Float32Array(this.back.buffer, 0, count * S * 4);
        for (let i = 0; i < count; i++) for (let j = 0; j < S; j++) rows[j].set(f.subarray((i * S + j) * 4, (i * S + j) * 4 + 4), i * 4);
        this.back.release();
      }
      out.push({ count, wanted: found[k], data: rows });
    }
    return out;
  }
  /** s: how many times further than the 68° lens this lens sees a thing at the same size; h0: the ground under the camera.
      A resident tier keeps the camera for its regions (run); its own and the fallback's patches are found here, the
      nearest first where there are more than a tier holds. */
  select(cx, cz, h0, s, dy) {
    if (this.resident) { this.cam = { cx, cz, h0, s, dy }; return; }   // (a placer's own select, the stress stand's, replaces this whole)
    if (this.fixed) s = Math.min(this.fixed, this.far + Math.abs(dy) * 1.2) / this.far;   // fixed: metres round the camera whatever the lens (the shadow map's box), grown with its height, to at most `fixed`
    const { S, P, list } = this, far = this.far * s, far2 = far * far - dy * dy, near2 = this.near * this.near * s * s - dy * dy;
    let n = 0; this.over = false;
    if (far2 > 0) {
      const i0 = Math.floor((cx - far) / S), i1 = Math.floor((cx + far) / S), j0 = Math.floor((cz - far) / S), j1 = Math.floor((cz + far) / S);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S;
        const nx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0, nz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0, nd = nx * nx + nz * nz;
        if (nd > far2) continue;
        const B = this.bounds; if (B && (x1 <= B[0] || x0 >= B[2] || z1 <= B[1] || z0 >= B[3])) continue;   // (bounds: a stand that ends: [x0, z0, x1, z1], set by its engine)
        const fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz);
        if (fx * fx + fz * fz < near2) continue;
        const yb = 0.32 * Math.sqrt(nd) + 0.2 * S + 6;         // the land is gentle: it cannot be further off than this
        const c = this.cull; if (c !== false && !boxIn(x0 - c, x1 + c, h0 - yb, h0 + yb + c, z0 - c, z1 + c)) continue;   // (widened: what is drawn for the light, whose shadow may fall into view)
        FOUND.push({ nd, i, j, r: this.spans ? this.spans(i, j) : null });
      }
    }
    // the nearest first: where there are more than the packing can take, the farthest go (and say so)
    FOUND.sort((a, b) => a.nd - b.nd);
    for (const f of FOUND) {
      if (this.spans) { if (!f.r?.length) continue; for (const [start, count] of f.r) { if (n === MAXP) { this.over = true; break; } list[n].set(f.i * P, f.j * P); this.runs[n].set(start, count); n++; } }
      else { if (n === MAXP) { this.over = true; break; } list[n].set(f.i * P, f.j * P); n++; }
    }
    FOUND.length = 0;
    this.n = n; for (const g of this.geometries) if (!this.passes) g.instanceCount = n * P * P; for (const m of this.meshes) m.visible = n > 0;
  }
  warm() { for (const g of this.geometries) if (!this.passes) g.instanceCount = this.P * this.P; for (const m of this.meshes) m.visible = true; }   // one patch, so the pipeline exists before the first frame
}

// ---- without WebGPU: square patches in a uniform array, every cell of them worked out in the vertex stage ----
function fallbackOf(T, geos, material) {
  const patches = uniformArray(T.list, 'vec2'), P2 = uniform(T.P * T.P, 'uint'), uP = uniform(T.P, 'int');
  const cellOf = (index) => { const pid = index.div(P2), b = int(index.sub(pid.mul(P2))); return ivec2(patches.element(pid)).add(ivec2(b.mod(uP), b.div(uP))); };
  return geos.map((g, k) => new THREE.Mesh(g, material(cellOf(instanceIndex), k)));
}

// ---- on WebGPU: what is packed, its draws, its culling ----
/** Its draws' arguments, five a bucket, in one buffer (a shader binds few). */
const argsOf = (geos) => { const args = new THREE.IndirectStorageBufferAttribute(new Uint32Array(geos.flatMap((g) => [g.index.count, 0, 0, 0, 0])), 5); return { args, argsNode: storage(args, 'uint', 5 * geos.length) }; };
/** After its packing, where the eye does not cull it: each draw as many as its bucket holds, no more than its room. */
const argsPass = (argsNode, count, K, caps) => Fn(() => { for (let k = 0; k < K; k++) argsNode.element(k * 5 + 1).assign(min(atomicLoad(count.element(k)), caps ? uint(caps[k]) : uint(2 ** 32 - 1))); })().compute(1);
/** Its meshes: each bucket's draw from its arguments, its material reading a thing's rows where the packing put it
    (through what the eye's culling kept, culled: C): its place (placeOf(at, slot): which of the store's things it is,
    slot a node, the bucket a mesh says), its rows there (S of them). room(k): as many as bucket k may hold. A material is
    handed read(j), readAt(j, slot), and placeAt(slot): the thing's place (what the prepass's id says: src/core/pass.js). */
function meshesOf(geos, material, args, C, room, data, S, placeOf) {
  const at = C ? C.entry : (slot) => slot.add(instanceIndex), rowAt = (slot, j) => data.element(placeOf(at, slot).mul(S).add(uint(j)));
  return geos.map((g, k) => {
    g.setIndirect(args, k * 20); g.instanceCount = room(k);
    const m = new THREE.Mesh(g, material({ read: (j) => rowAt(uint(k), j), readAt: (j, slot) => rowAt(slot, j), placeAt: (slot) => placeOf(at, slot) }, k));
    m.userData.slot = k; return m;
  });
}

// ---- a placer's own patches ----
/** What it looks at, an entry a patch: (i0, j0, w, first): w × w cells from cell (i0, j0) (as unsigned bits: int()
    reads them back signed), the dispatch's invocations from `first` on (a multiple of the workgroup, so a workgroup is
    all of one entry's). A list's tier: each entry's run too (start, count). */
function entriesOf(T, spans) {
  const E = new THREE.StorageBufferAttribute(new Uint32Array(MAXP * 4), 4), EN = storage(E, 'uvec4', MAXP).toReadOnly(), nE = uniform(0, 'uint');
  const R = spans ? new THREE.StorageBufferAttribute(new Uint32Array(MAXP * 2), 2) : null, RN = R ? storage(R, 'uvec2', MAXP).toReadOnly() : null;
  Object.assign(T, { entries: E, entryRuns: R, nE });
  const bytes = E.array.byteLength + (R ? R.array.byteLength : 0);
  more('tiers: what each looks at', bytes, bytes, 'geometry');
  return { EN, nE, RN, STEPS: Math.ceil(Math.log2(MAXP)) + 1 };
}
/** Its packing: each bucket a room of its own, one after another (cap: one for all, or a list). */
function packedOf(T, geos, material, { live, cap = 0, slots = 0, spans = null, bounds = null }) {
  const K = geos.length, S = uint(slots), { EN, nE, RN, STEPS } = entriesOf(T, spans);
  const own = Array.isArray(cap), caps = own ? cap : geos.map(() => cap), offs = caps.map((_, k) => caps.slice(0, k).reduce((a, c) => a + c, 0)), total = caps.reduce((a, c) => a + c, 0);
  const capOff = own ? uniformArray(caps.map((c, k) => new THREE.Vector2(c, offs[k])), 'vec2') : null, uCap = uniform(own ? 0 : cap, 'uint');
  // (where each bucket's things begin, as they were set: the page's copy is what they are, tier.read)
  const OFF = new THREE.StorageBufferAttribute(Uint32Array.from(offs), 1), OFr = storage(OFF, 'uint', K).toReadOnly();
  // (a thing's rows side by side in one buffer, `slots` of them: one buffer to bind, not one a row; what it packs lives
  // on the GPU only: the GPU writes it and the GPU reads it, src/core/gpu.js)
  const packed = gpuStorageLater('vec4', 'tiers: what stands, packed', 'geometry'); packed.make(total * slots);
  const data = packed.node, count = instancedArray(K, 'uint').toAtomic(), { args, argsNode } = argsOf(geos);
  const culled = !!bounds && hasFeature('indirect-first-instance') && cullable(total);   // (?truth too: what this frame's depth hides adds nothing to any pixel)
  Object.assign(T, { slots, data, args, count, offsets: OFF, room: (k) => caps[k] });
  T.offAt = (k) => OFr.element(k);   // (where bucket k's things begin: a node, for what reads a bucket of it itself)
  const C = (T.culler = culled ? cullOf(T, { K, caps, offs, total, S: slots, data, args, count, box: bounds }) : null);
  const zero = Fn(() => { for (let k = 0; k < K; k++) atomicStore(count.element(k), uint(0)); })().compute(1);
  T.passes = [zero, patchPass({ K, S, data, count, own, capOff, uCap, entryOf: entryOf(EN, nE, STEPS) }, live, RN), ...(C ? [C.args, C.boxes] : [argsPass(argsNode, count, K, caps)])];
  return meshesOf(geos, material, args, C, (k) => caps[k], data, S, (at, slot) => at(OFr.element(slot)));
}

/** The workgroup's entry (its first invocation finds it, the last whose first is at most its own, by halving), then
    every invocation's cell. Every invocation works its cell out, the last workgroup's past the candidates too: none
    returns before the barriers. A cell past them packs nothing (in: false). */
const entryOf = (EN, nE, STEPS) => () => {
  const lid = localId.x, wgE = workgroupArray('uint', 1).setName('wgTierEntry');
  If(lid.equal(uint(0)), () => {
    const at = instanceIndex.sub(lid), a = uint(0).toVar(), z = nE.toVar();
    Loop({ start: uint(0), end: uint(STEPS), type: 'uint', condition: '<' }, () => {
      If(z.sub(a).greaterThan(uint(1)), () => { const m = a.add(z).shiftRight(uint(1)).toVar(); If(EN.element(m).w.lessThanEqual(at), () => { a.assign(m); }).Else(() => { z.assign(m); }); });
    });
    wgE.element(uint(0)).assign(a);
  });
  workgroupBarrier();
  const e = wgE.element(uint(0)).toVar(), En = EN.element(e).toVar(), r = instanceIndex.sub(En.w).toVar(), w = En.z;
  return { e, r, cell: ivec2(int(En.x).add(int(r.mod(w))), int(En.y).add(int(r.div(w)))), in: e.lessThan(nE).and(r.lessThan(w.mul(w))) };
};

/** A thing an invocation into its bucket (and where L says `also`, into that one too: a thing handing over from one draw
    to another, drawn by both while the vertex stages say which shows: src/scatter/drawer.js, the impostors), by one
    atomic a bucket a workgroup: its place among its bucket's, counted in A, then put(b, i) writes it there (none: only
    counted). K: the buckets. */
const intoBuckets = (K) => {
  const wgN = workgroupArray('uint', K).toAtomic().setName('wgTierBucketCount'), wgAt = workgroupArray('uint', K).setName('wgTierBucketAt');
  const each = (lid, fn) => { if (K <= WG) If(lid.lessThan(uint(K)), () => fn(lid)); else Loop({ start: lid, end: uint(K), type: 'uint', condition: '<', update: WG }, ({ i }) => fn(i)); };
  return (L, on, A, put = null) => {
    const lid = localId.x;
    each(lid, (b) => { atomicStore(wgN.element(b), uint(0)); });
    workgroupBarrier();
    const b1 = int(-1).toVar(), b2 = int(-1).toVar(), i1 = uint(0).toVar(), i2 = uint(0).toVar();
    If(on, () => { if (L.also) { b1.assign(int(L.bucket)); b2.assign(int(L.also)); } else b1.assign(K > 1 ? int(L.bucket) : int(0)); });
    If(b1.greaterThanEqual(0), () => { i1.assign(atomicAdd(wgN.element(uint(b1)), uint(1))); });
    if (L.also) If(b2.greaterThanEqual(0), () => { i2.assign(atomicAdd(wgN.element(uint(b2)), uint(1))); });
    workgroupBarrier();
    each(lid, (b) => { const c = atomicLoad(wgN.element(b)); If(c.greaterThan(uint(0)), () => { wgAt.element(b).assign(atomicAdd(A.element(b), c)); }); });
    workgroupBarrier();
    if (!put) return;
    If(b1.greaterThanEqual(0), () => { put(uint(b1), wgAt.element(uint(b1)).add(i1).toVar()); });
    if (L.also) If(b2.greaterThanEqual(0), () => { put(uint(b2), wgAt.element(uint(b2)).add(i2).toVar()); });
  };
};
/** Its rows written at place `at` (a thing's) of the packing. */
const rowsAt = (data, S, at, rows) => { rows.forEach((d, k) => data.element(at.mul(S).add(uint(k))).assign(d)); };

/** A placer's own patches: each cell live() says holds something, into its bucket's room. */
function patchPass({ K, S, data, count, own, capOff, uCap, entryOf: ofEntry }, live, RN) {
  const into = intoBuckets(K);
  return Fn(() => {
    const Q = ofEntry(), L = live(Q.cell, { pid: Q.e, b: int(Q.r), cell: Q.cell, span: RN ? RN.element(Q.e) : null });
    into(L, Q.in.and(L.alive), count, (b, i) => {
      if (own) If(i.lessThan(uint(capOff.element(b).x)), () => { rowsAt(data, S, uint(capOff.element(b).y).add(i), L.data); });
      else If(i.lessThan(uCap), () => { rowsAt(data, S, b.mul(uCap).add(i), L.data); });
    });
  })().compute(WG, [WG]);
}

// ---- resident tiers: one set of passes for every tier ----
// A resident tier's store: every thing its regions hold (their cells' found()), each with its region's number, two of
// it (the one packed now and the one before). A packing copies forward what the regions that keep what they hold hold
// (alive), visits the cells of the regions new or run out, then gathers: select() of every thing held, counted into its
// buckets, the buckets laid out one after another as large as each is, and each thing written into its own. Where the
// camera has only moved by a step, or the heap has something new, only the gather runs: a pass over the things held,
// not the cells. Its store is as large as what it was last found to hold and a MARGIN more (what its regions may hold
// more as the camera moves within theirs: src/scatter/regions.js), the GPU's count read back after every packing that
// changed it; what it packed for its draws as large as that again where a thing of it may be drawn twice (handing over
// to its far end), else once. Where it finds more than it holds, or BAND times less, it is made again at that and
// everything of its kind packed again: its kind laid out once every tier of it then asking has answered, never once a
// tier, and never past the room its class has (geometry: src/core/gpu.js roomOf).
//
// Its passes are not its own. What every resident tier does alike is one pass for all of them (begin, seal, lay, and
// the gather's begin where it only gathers), reading its numbers where they lie: each tier's two counts (Z), its
// draws' counts and where their things begin, in rows of their own one after another, its table told them before each
// packing (where its rows are, its room, which of its stores is which: uniforms, written as that packing is handed to
// the GPU). What one packing looks at (its regions' cells, which keep what they hold) is the same scratch for every
// tier. And a kind of tier (whatever packs by the same code: its engine's `kind`; else the tier alone) has one set of
// its own besides (copy forward, visit, the gather's two), over its stores and what it packed, each tier a range of
// them: so a pass is compiled once a kind of work, not once a tier.
const firstStore = (store) => Math.max(WG, 2 ** Math.ceil(Math.log2(Math.max(WG, store))));   // (until its own count is known: what its engine reckons)
const lean = (type, name, atomic = false) => { const b = gpuStorageLater(type, name, 'geometry'); if (atomic) b.node.toAtomic(); return b; };
let GR = null;   // (what every resident tier shares: shared(), made with the first)
const KINDS = new Map();   // (a kind of tier, by its key: its passes, its stores, its tiers)
function shared() {
  if (GR) return GR;
  useLimits();
  const Zs = lean('uint', 'tiers: what each holds, how many'), Cs = lean('uint', "tiers: their draws' counts", true), Os = lean('uint', "tiers: where their draws' things begin"), Us = lean('uint', "tiers: a gather's places", true);
  const Z = Zs.node, C = Cs.node, O = Os.node, cur = Us.node, held = instancedArray(1, 'uint').toAtomic();
  const E = new THREE.StorageBufferAttribute(new Uint32Array(LEAVES * 4), 4), X = new THREE.StorageBufferAttribute(new Uint32Array(LEAVES * 2), 2), A = new THREE.StorageBufferAttribute(new Uint32Array(LEAVES + 1), 1);
  const bytes = E.array.byteLength + X.array.byteLength + A.array.byteLength;
  more('tiers: what a packing looks at', bytes, bytes, 'geometry');
  const DF = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1, 0]), 1), DG = new THREE.IndirectStorageBufferAttribute(new Uint32Array([0, 1, 1, 0]), 1), DFn = storage(DF, 'uint', 4), DGn = storage(DG, 'uint', 4);
  // (the table: its two counts (zi), its first draw's row (kb), its draws (K), its room (N), where its first thing lies
  // in its kind's (base), the store copied from and into (from, to), the one gathered (g), its regions (nE), and
  // whether what it held is gone (fresh))
  const u = { zi: uniform(0, 'uint'), kb: uniform(0, 'uint'), K: uniform(1, 'uint'), N: uniform(1, 'uint'), base: uniform(0, 'uint'), from: uniform(0, 'uint'), to: uniform(0, 'uint'), g: uniform(0, 'uint'), nE: uniform(0, 'uint'), fresh: uniform(0, 'uint') };
  const eachK = (fn) => { Loop({ start: uint(0), end: u.K, type: 'uint', condition: '<' }, ({ i }) => { fn(i); }); };
  const zero = () => { eachK((k) => { atomicStore(C.element(u.kb.add(k)), uint(0)); }); };
  const begin = Fn(() => {
    atomicStore(held.element(uint(0)), uint(0)); zero();
    If(u.fresh.greaterThan(uint(0)), () => { Z.element(u.zi).assign(uint(0)); });   // (what it held is gone: nothing is copied forward)
    sizeTo(DFn, Z.element(u.zi).add(uint(WG - 1)).div(uint(WG)));
  })().compute(1);
  const seal = Fn(() => { const n = atomicLoad(held.element(uint(0))).toVar(), m = n.min(u.N); Z.element(u.zi).assign(m); Z.element(u.zi.add(uint(1))).assign(n); sizeTo(DGn, m.add(uint(WG - 1)).div(uint(WG))); })().compute(1);
  const lay = Fn(() => { const at = uint(0).toVar(); eachK((k) => { O.element(u.kb.add(k)).assign(at); at.addAssign(atomicLoad(C.element(u.kb.add(k)))); atomicStore(cur.element(k), uint(0)); }); })().compute(1);
  const gbegin = Fn(() => { zero(); sizeTo(DGn, Z.element(u.zi).add(uint(WG - 1)).div(uint(WG))); })().compute(1);
  const EN = storage(E, 'uvec4', LEAVES).toReadOnly();
  GR = { tiers: [], KB: 0, KMAX: 1, dirty: true, stale: true, Zs, Cs, Os, Us, Z, C, O, cur, held, E, X, A, XN: storage(X, 'uvec2', LEAVES).toReadOnly(), AL: storage(A, 'uint', LEAVES + 1).toReadOnly(), DF, DG, u, begin, seal, lay, gbegin, entry: entryOf(EN, u.nE, Math.ceil(Math.log2(LEAVES)) + 1) };
  return GR;
}
/** A kind of tier's own passes (copy forward, visit, the gather's two) and stores, made with its first tier. */
function kindOf(key, { K, slots, found, select, twice }) {
  const G = shared(), had = KINDS.get(key);
  if (had) { if (had.K !== K || had.slots !== slots) throw new Error(`tiers of one kind with ${had.K} and ${K} draws, ${had.slots} and ${slots} rows: a kind packs one way`); return had; }
  const S = uint(slots), { u } = G, stores = lean('vec4', 'tiers: what each holds (two stores)'), leaves = lean('uint', 'tiers: what each holds (two stores)'), packed = lean('vec4', 'tiers: what stands, packed');
  const rows = stores.node, leaf = leaves.node, data = packed.node, into = intoBuckets(K), counts = { element: (b) => G.C.element(u.kb.add(b)) };
  const wgC = workgroupArray('uint', 1).toAtomic().setName('wgTierKeepCount'), wgB = workgroupArray('uint', 1).setName('wgTierKeepAt');
  // (into the store being made (to), a thing an invocation where it has one, by one atomic a workgroup; no more than its room)
  const keep = (on, write) => {
    const lid = localId.x, j = uint(0).toVar();
    If(lid.equal(uint(0)), () => { atomicStore(wgC.element(uint(0)), uint(0)); });
    workgroupBarrier();
    If(on, () => { j.assign(atomicAdd(wgC.element(uint(0)), uint(1))); });
    workgroupBarrier();
    If(lid.equal(uint(0)), () => { const c = atomicLoad(wgC.element(uint(0))); If(c.greaterThan(uint(0)), () => { wgB.element(uint(0)).assign(atomicAdd(G.held.element(uint(0)), c)); }); });
    workgroupBarrier();
    If(on, () => { const i = wgB.element(uint(0)).add(j).toVar(); If(i.lessThan(u.N), () => { write(i); }); });
  };
  const rowOf = (at, j) => rows.element(at.mul(S).add(uint(j)));
  const put = (k, d, l) => { d.forEach((v, j) => rowOf(u.to.add(k), j).assign(v)); leaf.element(u.to.add(k)).assign(l); };
  const thing = () => wgOf().mul(uint(WG)).add(localId.x);
  // from the store it held (from) to the other (to): what is kept copied forward; then the cells of the regions packed
  const forward = Fn(() => {
    const i = thing().toVar(), at = u.from.add(i.min(u.N.sub(uint(1)))).toVar(), l = i.lessThan(G.Z.element(u.zi)).select(leaf.element(at), uint(LEAVES)).toVar();
    keep(G.AL.element(l).greaterThan(uint(0)), (k) => { put(k, Array.from({ length: slots }, (_, j) => rowOf(at, j)), l); });
  })().compute(MANY, [WG]);
  forward.dispatchSize = G.DF;
  const visit = Fn(() => {
    const Q = G.entry(), x = G.XN.element(Q.e), F = found(Q.cell, { cell: Q.cell, pad: uintBitsToFloat(x.y) });
    keep(Q.in.and(F.alive), (k) => { put(k, F.data, x.x); });
  })().compute(WG, [WG]);
  // from the store it holds now (g) into its draws' buckets: counted, laid out (lay), written
  const gather = (write) => {
    const p = Fn(() => {
      const i = thing().toVar(), on = i.lessThan(G.Z.element(u.zi)), at = u.g.add(i.min(u.N.sub(uint(1)))).toVar(), r = Array.from({ length: slots }, (_, j) => rowOf(at, j).toVar()), L = select(r);
      into(L, on.and(L.alive), write ? G.cur : counts, write ? (b, n) => { rowsAt(data, S, u.base.add(G.O.element(u.kb.add(b))).add(n), L.data ?? r); } : null);
    })().compute(MANY, [WG]);
    p.dispatchSize = G.DG; return p;
  };
  const gcount = gather(false), gwrite = gather(true);
  const s = { K, slots, twice, stores, leaves, packed, data, tiers: [], visit, full: [G.begin, forward, visit, G.seal, gcount, G.lay, gwrite], only: [G.gbegin, gcount, G.lay, gwrite], dirty: true, epoch: 0, asking: new Set(), wait: null };
  KINDS.set(key, s);
  return s;
}
/** A resident tier's packing: its rows in the shared ones, its range in its kind's stores, its draws and their culling. */
function residentPackedOf(T, geos, material, { found, select, store = 0, slots = 0, bounds = null, kind = null, twice = false }) {
  const G = shared(), K = geos.length, S = uint(slots), s = kindOf(kind ?? T, { K, slots, found, select, twice });
  const me = { T, K, zi: 2 * G.tiers.length, kb: G.KB, N: firstStore(store), base: 0, dbase: 0, uKb: uniform(G.KB, 'uint'), uBase: uniform(0, 'uint') };
  const P = () => (s.twice ? 2 : 1) * me.N;   // (what it packed for its draws: a thing of it in two of them where it may be drawn twice)
  G.tiers.push(me); G.KB += K; G.KMAX = Math.max(G.KMAX, K); G.dirty = G.stale = true; s.tiers.push(me); s.dirty = true;
  const row = (k) => me.uKb.add(typeof k === 'number' ? uint(k) : k), count = { element: (k) => G.C.element(row(k)) }, { args, argsNode } = argsOf(geos);
  // (where each of its draws' things begin in what its kind packed: its own copy, written with its draws' counts after
  // each packing, so its draws read it as any tier's draws read theirs)
  const OFF = new THREE.StorageBufferAttribute(new Uint32Array(K), 1), OFw = storage(OFF, 'uint', K), OFr = storage(OFF, 'uint', K).toReadOnly();
  const offsOf = (k) => { OFw.element(k).assign(me.uBase.add(G.O.element(row(k)))); };
  const culled = !!bounds && hasFeature('indirect-first-instance') && cullable(P());   // (?truth too: what this frame's depth hides adds nothing to any pixel)
  Object.assign(T, { slots, data: s.data, args, offsets: OFF, residentRow: me, room: () => Infinity });
  T.offAt = (k) => OFr.element(k);   // (where bucket k's things begin in what its kind packed: a node, for what reads a bucket of it itself: src/scatter/cut.js)
  const C = (T.culler = culled ? cullOf(T, { K, caps: null, offs: geos.map(() => 0), total: P(), S: slots, data: { element: (e) => s.data.element(me.uBase.mul(S).add(e)) }, args, count, box: bounds, offAt: (k) => G.O.element(row(k)), also: offsOf }) : null);
  const ends = C ? [C.args, C.boxes] : [Fn(() => { for (let k = 0; k < K; k++) { argsNode.element(k * 5 + 1).assign(atomicLoad(count.element(k))); offsOf(k); } })().compute(1)];
  T.resident = residentOf(T, me, s, ends);
  T.passes = [...new Set([...s.full, ...s.only, ...ends])];
  return meshesOf(geos, material, args, C, P, s.data, S, (at, slot) => at(OFr.element(slot)));
}
/** A kind laid out again (a tier of it made again from its own count): each tier's range from its room, its stores and
    what it packed made again as large as all of them, its culling's ranges too; every tier of it packed again. Never
    past the room its class has left (geometry, its own buffers still in it: what it was is let go only after what it is
    is made, src/core/gpu.js), nor past what one binding holds: held to that, the rest is the dial's (the governor's). */
const CULL = bytesOf('uvec4') + 2 * bytesOf('uint');   // (the culling's for a thing: its box and its two places in the lists, src/core/occlusion.js)
function relayout(s) {
  const again = s.epoch > 0; s.dirty = false; s.wait = null; s.epoch++;
  const P = (me) => (s.twice ? 2 : 1) * me.N, row = s.slots * bytesOf('vec4');
  const bytes = () => s.tiers.reduce((n, me) => n + 2 * me.N * (row + bytesOf('uint')) + P(me) * (row + (me.T.culler ? CULL : 0)), 0);
  const most = Math.floor(Math.min(limitOf('maxStorageBufferBindingSize') || Infinity, limitOf('maxBufferSize') || Infinity) / row);   // (things one binding holds)
  const need = bytes(), room = Math.max(0, roomOf('geometry')), things = s.tiers.reduce((n, me) => n + Math.max(2 * me.N, P(me)), 0), fit = Math.min(room / need, most / things);
  if (fit < 1) {
    console.warn(`tiers ${s.tiers.map((me) => `${me.T.asset ?? ''} ${me.T.level ?? ''}`.trim()).join(', ')}: they would hold ${Math.round(need / 2 ** 20)} MB, past ${room / need < most / things ? `the ${Math.round(room / 2 ** 20)} MB their class has left (geometry)` : `one binding (${most} things)`}: held to it, the rest is the dial's (the governor's)`);
    for (const me of s.tiers) me.N = Math.max(WG, Math.floor((me.N * fit) / WG) * WG);
  }
  let sb = 0, db = 0; const arenas = new Set();
  for (const me of s.tiers) {
    me.base = sb; sb += 2 * me.N; me.dbase = db; me.uBase.value = db; db += P(me);
    const C = me.T.culler; if (C) { C.from(me.dbase); C.resize(P(me), false); arenas.add(C.arena); }
    if (again) { me.T.n = 0; for (const m of me.T.meshes) m.visible = false; }   // (what it packed is gone: drawn again once it is packed again)
  }
  s.stores.make(sb * s.slots); s.leaves.make(sb); s.packed.make(db * s.slots);
  for (const A of arenas) A.relayout();
}
/** Before any resident tier packs (each run, and the scatter's compile, src/scatter/index.js): the shared rows made as
    large as all the tiers made so far, and every kind laid out that asks for it. */
export function ready() {
  const G = GR; if (!G?.stale) return;
  G.stale = false;
  if (G.dirty) { G.dirty = false; G.Zs.make(2 * G.tiers.length); G.Cs.make(G.KB); G.Os.make(G.KB); G.Us.make(G.KMAX); for (const s of KINDS.values()) s.dirty = true; }   // (a tier made after others had packed: what every one held is gone)
  for (const s of KINDS.values()) if (s.dirty) { if (s.wait?.size) G.stale = true; else relayout(s); }   // (a kind whose tiers then asking have not all answered waits for them: laid out once, not once a tier)
}
/** A resident tier's packing on the CPU: its regions, their numbers, its table, what each packing runs, its room. */
function residentOf(T, me, s, ends) {
  const G = GR, regions = new Resident({ cell: T.cell, fixed: T.metres, room: LEAVES - 16 }), alive = new Uint32Array(LEAVES + 1);
  const ids = [], freed = [];   // (numbers free; and those let go this packing, free from the next: the store still holds their things till it is copied forward)
  let at = 0, key = null, gkey = null, asking = false, wrong = 0, packs = 0, epoch = -1, fresh = 1;   // (wrong: a packing changed its store, and whether it fits what it found is not yet read back: the world is not complete till it is)
  const letGo = (L) => { if (L.id != null) { alive[L.id] = 0; freed.push(L.id); L.id = null; } };
  // (the store emptied: nothing copied forward, every number free at once)
  const empty = () => { for (const L of regions.reset()) L.id = null; alive.fill(0); ids.length = freed.length = 0; for (let i = LEAVES - 1; i >= 0; i--) ids.push(i); key = null; fresh = 1; };
  empty();
  source(`tiers: a store made again (${T.asset ?? 'a tier'})`, () => wrong);   // (the world complete waits for a store made as large as it needs: src/core/settle.js)
  // (its table, for the passes it shares: o, the store it held; g, the one gathered; n, its regions)
  const table = (o, g, n) => {
    const { u } = G;
    u.zi.value = me.zi; u.kb.value = me.kb; u.K.value = me.K; u.N.value = me.N; u.base.value = me.dbase; u.nE.value = n; u.fresh.value = fresh;
    u.from.value = me.base + o * me.N; u.to.value = me.base + (1 - o) * me.N; u.g.value = me.base + g * me.N;
    T.table?.();   // (its kind's own numbers: its engine's)
  };
  // (its own count, read back after a packing changed its store: made again where it found more than it holds, or BAND
  // times less than it would be made at; its kind laid out again once every tier of it asking then has answered)
  const ask = (renderer) => {
    if (asking) return;
    asking = true; s.asking.add(me); const asked = packs;
    renderer.getArrayBufferAsync(G.Zs.attr).then((b) => {
      const f = new Uint32Array(b)[me.zi + 1], want = Math.max(WG, Math.ceil((f * MARGIN) / WG) * WG);
      T.over = f > me.N;
      if (f > me.N || want * BAND < me.N) { me.N = want; if (!s.dirty) s.wait = new Set(s.asking); s.dirty = G.stale = true; wrong = 1; return; }
      if (asked === packs) wrong = 0;   // (no packing since: what it holds is what was read)
    }).catch(() => {}).finally(() => { asking = false; s.asking.delete(me); s.wait?.delete(me); });
  };
  return {
    regions,
    dirty() { gkey = null; },
    run(renderer, world, kept, cx, cy, cz) {
      ready();
      const c = T.cam; if (!c) return;
      if (epoch !== s.epoch) { epoch = s.epoch; empty(); }   // (its kind laid out again: what it held is gone)
      const sc = T.fixed ? Math.min(T.fixed, T.far + Math.abs(c.dy) * 1.2) / T.far : c.s, near = T.near * sc, far = T.far * sc, q = T.step || Math.max(0.25, T.S / 16);
      // (what it holds again from nothing where what its cells read has changed: the lens, the stage, the ways, things'
      // own state, what grows over it. Its band moving with the measure only uses its regions' pads up: regions.js)
      const k = `${kept}|${T.reads?.() ?? ''}`;
      if (k !== key) { empty(); key = k; }
      ids.push(...freed.splice(0));
      const look = () => regions.update({ cx: c.cx, cz: c.cz, dy: c.dy, near, far, measure: dialK(), bounds: T.bounds });
      let u = look();
      for (const L of u.free) letGo(L);
      if (u.pack.length > ids.length) { empty(); key = k; u = look(); }   // (a jump: more regions new at once than numbers free while the old are let go: all of it again)
      const E = G.E.array, X = G.X.array; let n = 0, cells = 0;
      for (const L of u.pack) {
        letGo(L); L.id = ids.pop(); alive[L.id] = 1;
        E[n * 4] = (L.bi * BLOCK) >>> 0; E[n * 4 + 1] = (L.bj * BLOCK) >>> 0; E[n * 4 + 2] = L.w; E[n * 4 + 3] = cells;
        X[n * 2] = L.id; X[n * 2 + 1] = bitsOf(L.pad / sc);   // (its pad as the measure has distances: the lens's)
        cells += Math.ceil((L.w * L.w) / WG) * WG; n++;
      }
      T.n = regions.leaves.size; for (const m of T.meshes) m.visible = T.n > 0;
      if (wrong) ask(renderer);
      const g = `${world}|${near}|${far}|${Math.round(cx / q)},${Math.round(cy / q)},${Math.round(cz / q)}`;
      if (n || u.free.length) {
        G.E.addUpdateRange(0, Math.max(1, n) * 4); G.E.needsUpdate = true; G.X.addUpdateRange(0, Math.max(1, n) * 2); G.X.needsUpdate = true;
        G.A.array.set(alive); G.A.needsUpdate = true;
        table(at, 1 - at, n); s.visit.dispatchSize = Math.max(WG, cells);
        renderer.compute([...s.full, ...ends]); at = 1 - at; gkey = g; packs++; wrong = 1; fresh = 0;
        did('packs'); did('kcells', Math.round(cells / 1000));
      } else if (g !== gkey) { gkey = g; table(at, at, 0); renderer.compute([...s.only, ...ends]); did('gathers'); }
    },
  };
}
