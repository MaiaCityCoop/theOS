// Scatter: what stands on the land (blades, stones, boulders), a tier at a time. A tier is one instanced draw call: its
// instances are the cells it looks at inside its band of distances, chosen anew as the camera moves. What stands in a
// cell is hashed, so choosing builds nothing. A cell that holds nothing is sent off screen (offScreen) before any of its
// work is done.
//
// On WebGPU a tier that brings a `live` function goes further: a compute pass runs it once per cell it looks at, and
// packs only the cells that hold something into a buffer (a few vec4 each); the draw reads its count from the GPU
// (indirect), so the vertex stage runs only for what stands, and reads it ready-made. Which cells it looks at is the
// region tree's (src/scatter/regions.js): regions of its grid accepted, split or rejected by its band, the view and its
// bounds before a cell of them is visited, nearest first; the GPU is handed its leaves, a few numbers each, and finds
// a workgroup's own by halving. A placer that chooses its own patches (a list's runs: src/scatter/placed.js; the
// stress stand's plots) says them itself, nearest first. Without WebGPU (the WebGL 2 fallback) the same function runs
// in the vertex stage, per vertex, over square patches, as before.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, uint, int, ivec2, vec4, uniform, uniformArray, instancedArray, storage, atomicAdd, atomicStore, atomicLoad, min, instanceIndex, localId, workgroupArray, workgroupBarrier, cameraProjectionMatrix, cameraViewMatrix } from 'three/tsl';
import { boxIn } from '../core/frustum.js';
import { gpuStorage, more, hasFeature } from '../core/gpu.js';
import { cullOf, cullable } from '../core/occlusion.js';
import { did } from '../core/work.js';
import { FNV, fnv } from '../core/hash.js';
import { passOf, vWas } from '../core/pass.js';
import { onMeasure } from '../detail/measure.js';
import { regionsOf, leavesFor, WG } from './regions.js';
import { viewBox } from './view.js';
import { HMIN, HMAX } from '../world/land.js';

/** The patches a placer that chooses its own may hand a tier at most (the stress stand's plots, the herds, a list's
    runs; and the WebGL 2 fallback's square patches): each tier looks at the nearest of them first. */
export const MAXP = 384;

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

export class Tier {
  /** cell: metres per cell; P: cells per patch side (a fallback's or a custom placer's patch; and what sets how far the
      camera may move before the tier packs again: a sixteenth of a patch); near/far: the band, in metres as a 68° lens
      sees them. reach: the farthest its band can be, metres (the most pixels the screen can draw: src/detail/measure.js
      farMost; none: far): what its region tree is sized for.
      cull: metres the eye's view is widened by before a region outside it is dropped (a shadow's reach, a thing's own),
      or false to keep every region round the camera; fixed: metres round the camera, whatever the lens.
      Without `live`: material(cellNode) is the tier's node material, given the cell each instance stands for.
      With `live` (and `gpu`, a WebGPU renderer's): live(cellNode) -> { alive, data: [vec4, …], bucket?, also? } says what
      stands in a cell (bucket: which of its geometries draws it; also, where given: a second one, -1 none, and its
      bucket may then be -1);
      material({ read }) is the material, read(k) its k-th vec4 of `slots`, ready-made; `cap` the most that may stand at once
      (a number: of each bucket; or a list, a cap a bucket: where one bucket holds thousands and the others a few).
      spans: a tier of a list (src/scatter/placed.js: what is placed one by one, kept in the order of where it stands):
      spans(i, j) says which runs of the list patch (i, j) holds, [[start, count], …] (each count at most P × P; none:
      nothing stands there). Each run is a patch of its own to the packing, the nearest first where there are more than
      it can take; live is then also told which run a cell is of and which of its places ({ pid, b, span: (start,
      count) }).
      bounds(A, B, k): where what it packs is drawn by the eye, it is culled (src/core/occlusion.js): the world box of a
      thing packed into bucket k ({ c, h, w }: its middle and half its size, its growth in it; how far the wind may push
      it, a metre of its sway), from its first two rows.
      high: how tall what it packs may stand (metres), for the view's test. */
  constructor(scene, geometry, material, { cell, P, near = 0, far, reach = 0, order = 0, live = null, gpu = false, cap = 0, slots = 0, cull = 0, fixed = 0, spans = null, bounds = null, high = 0 }) {
    ALL.add(this);
    this.cull = cull; this.fixed = fixed; this.P = P; this.S = cell * P; this.cell = cell; this.near = Math.max(0, near); this.far = far; this.n = 0; this.over = false; this.high = high;
    this.list = Array.from({ length: MAXP }, () => new THREE.Vector2());
    this.spans = spans; this.runs = spans ? Array.from({ length: MAXP }, () => new THREE.Vector2()) : null;
    // (the region tree: the grid tiers on WebGPU that choose nothing themselves; its room from what it may need)
    this.regions = !!(live && gpu) && !spans;
    // (its numbers as uniforms, not written into its code: two tiers that differ only in them, the levels of one thing,
    // are then one shader to the GPU, compiled once: src/scatter/trees.js)
    const own = Array.isArray(cap), P2 = uniform(P * P, 'uint'), uP = uniform(P, 'int'), uCap = uniform(own ? 0 : cap, 'uint');
    // buckets: geometry may be a list (the shapes of one thing): one mesh each, but the cells worked out once, each that
    // holds something dropped into its bucket (live(...).bucket); material(src, k) is bucket k's
    const geos = Array.isArray(geometry) ? geometry : [geometry], K = geos.length;
    this.geometries = geos; this.geometry = geos[0]; geos.forEach((g) => (g.instanceCount = 0));
    if (live && gpu) {
      // what it looks at, an entry a leaf of its region tree or a patch: (i0, j0, w, first): w × w cells from cell
      // (i0, j0) (as unsigned bits: int() reads them back signed), the dispatch's invocations from `first` on (a multiple
      // of the workgroup, so a workgroup is all of one entry's). A list's tier: each entry's run too (start, count)
      this.room = this.regions ? Math.max(MAXP, leavesFor(cell, Math.max(reach, far), near)) : MAXP;   // (and never fewer than a placer's own patches: the stress stand's tiers choose theirs)
      const E = new THREE.StorageBufferAttribute(new Uint32Array(this.room * 4), 4), EN = storage(E, 'uvec4', this.room).toReadOnly(), nE = uniform(0, 'uint');
      const R = spans ? new THREE.StorageBufferAttribute(new Uint32Array(MAXP * 2), 2) : null, RN = R ? storage(R, 'uvec2', MAXP).toReadOnly() : null;
      this.entries = E; this.entryRuns = R; this.nE = nE;
      more('tiers: what each looks at', E.array.byteLength + (R ? R.array.byteLength : 0), E.array.byteLength + (R ? R.array.byteLength : 0));
      const STEPS = Math.ceil(Math.log2(Math.max(2, this.room))) + 1;
      // (what it packs lives on the GPU only: the GPU writes it and the GPU reads it; src/core/gpu.js)
      // (caps, offs: each bucket's cap and where its things begin in the buffers; one cap for all: bucket k's at k times it)
      const caps = own ? cap : geos.map(() => cap), offs = caps.map((_, k) => caps.slice(0, k).reduce((a, c) => a + c, 0)), total = caps.reduce((a, c) => a + c, 0), capOff = own ? uniformArray(caps.map((c, k) => new THREE.Vector2(c, offs[k])), 'vec2') : null;   // (a bucket's cap and where its things begin, as one array: a stage has twelve uniform buffers)
      // (a thing's rows side by side in one buffer, `slots` of them: one buffer to bind, not one a row; a pass binds at
      // most eight, src/world/things.js reads one more)
      const buf = gpuStorage('vec4', Math.max(1, total * slots), null, true), data = buf.node, count = instancedArray(K, 'uint').toAtomic(), S = uint(slots);
      more('tiers: what stands, packed', buf.bytes, buf.lean ? 0 : buf.bytes);
      // (one buffer of draw arguments, five a bucket: a shader binds few buffers. Culled, what the eye sees and what pass
      // two found are two sets more, in the culling's own buffer: src/core/occlusion.js)
      const culled = !!bounds && hasFeature('indirect-first-instance') && cullable(total);   // (?truth too: what this frame's depth hides adds nothing to any pixel, and the reference drawn whole, ten million things a frame at 4K, does not settle)
      const args = new THREE.IndirectStorageBufferAttribute(new Uint32Array(geos.flatMap((g) => [g.index.count, 0, 0, 0, 0])), 5), argsNode = storage(args, 'uint', 5 * K);
      // what a workgroup packs, by one atomic a bucket it puts anything into (not one a thing): its 64 count theirs in
      // shared memory, then one of them asks each bucket for room for all of them at once
      const wgN = workgroupArray('uint', K).toAtomic(), wgAt = workgroupArray('uint', K), wgE = workgroupArray('uint', 1);
      const each = (lid, fn) => { if (K <= WG) If(lid.lessThan(uint(K)), () => fn(lid)); else Loop({ start: lid, end: uint(K), type: 'uint', condition: '<', update: WG }, ({ i }) => fn(i)); };
      this.passes = [
        Fn(() => { for (let k = 0; k < K; k++) atomicStore(count.element(k), uint(0)); })().compute(1),
        Fn(() => {
          const lid = localId.x;
          each(lid, (b) => { atomicStore(wgN.element(b), uint(0)); });
          // (the workgroup's entry, found once by its first invocation: the last whose first is at most its own, by halving)
          If(lid.equal(uint(0)), () => {
            const at = instanceIndex.sub(lid), a = uint(0).toVar(), z = nE.toVar();
            Loop({ start: uint(0), end: uint(STEPS), type: 'uint', condition: '<' }, () => {
              If(z.sub(a).greaterThan(uint(1)), () => { const m = a.add(z).shiftRight(uint(1)).toVar(); If(EN.element(m).w.lessThanEqual(at), () => { a.assign(m); }).Else(() => { z.assign(m); }); });
            });
            wgE.element(uint(0)).assign(a);
          });
          workgroupBarrier();
          // (every invocation works its cell out, the last workgroup's past the candidates too: none returns before the
          // barriers. A cell past them packs nothing)
          const e = wgE.element(uint(0)).toVar(), En = EN.element(e).toVar(), r = instanceIndex.sub(En.w).toVar(), w = En.z;
          const cell = ivec2(int(En.x).add(int(r.mod(w))), int(En.y).add(int(r.div(w))));
          const Q = { pid: e, b: int(r), cell, span: RN ? RN.element(e) : null };
          const L = live(Q.cell, Q), on = e.lessThan(nE).and(r.lessThan(w.mul(w))).and(L.alive);
          // (into its bucket; and where live says `also`, into that one too: a thing handing over from one draw to
          // another, drawn by both while the vertex stages say which shows: src/scatter/drawer.js, the impostors)
          const b1 = int(-1).toVar(), b2 = int(-1).toVar(), i1 = uint(0).toVar(), i2 = uint(0).toVar();
          If(on, () => { if (L.also) { b1.assign(int(L.bucket)); b2.assign(int(L.also)); } else b1.assign(K > 1 ? int(L.bucket) : int(0)); });
          If(b1.greaterThanEqual(0), () => { i1.assign(atomicAdd(wgN.element(uint(b1)), uint(1))); });
          if (L.also) If(b2.greaterThanEqual(0), () => { i2.assign(atomicAdd(wgN.element(uint(b2)), uint(1))); });
          workgroupBarrier();
          each(lid, (b) => { const c = atomicLoad(wgN.element(b)); If(c.greaterThan(uint(0)), () => { wgAt.element(b).assign(atomicAdd(count.element(b), c)); }); });
          workgroupBarrier();
          const put = (b, j) => {
            const i = wgAt.element(b).add(j).toVar();
            if (own) If(i.lessThan(uint(capOff.element(b).x)), () => { const at = uint(capOff.element(b).y).add(i).mul(S); L.data.forEach((d, k) => data.element(at.add(uint(k))).assign(d)); });
            else If(i.lessThan(uCap), () => { const at = b.mul(uCap).add(i).mul(S); L.data.forEach((d, k) => data.element(at.add(uint(k))).assign(d)); });
          };
          If(b1.greaterThanEqual(0), () => { put(uint(b1), i1); });
          if (L.also) If(b2.greaterThanEqual(0), () => { put(uint(b2), i2); });
        })().compute(WG, [WG]),
        Fn(() => { for (let k = 0; k < K; k++) argsNode.element(k * 5 + 1).assign(min(atomicLoad(count.element(k)), own ? uint(caps[k]) : uCap)); })().compute(1),
      ];
      this.data = data; this.slots = slots; this.args = args; this.caps = caps; this.offs = offs;
      // (culled: the eye's passes read a thing through what the culling kept, its pass two's after the rest)
      const C = culled ? cullOf(this, { K, caps, offs, total, S: slots, data, args, count, box: bounds }) : null, at = C ? C.entry : (slot) => slot.add(instanceIndex);
      if (C) this.passes.splice(2, 1, C.args, C.boxes);   // (its draws' counts the culling's way, and its things' boxes)
      // (readAt: read from a place in the buffer a material is told per mesh, mesh.userData.slot: one material for every bucket)
      this.meshes = geos.map((g, k) => { g.setIndirect(args, k * 20); g.instanceCount = caps[k]; const m = new THREE.Mesh(g, material({ read: (j) => data.element(at(uint(offs[k])).mul(S).add(uint(j))), readAt: (j, slot) => data.element(at(slot).mul(S).add(uint(j))) }, k)); m.userData.slot = offs[k]; return m; });
      this.culler = C;
    } else {
      // (the WebGL 2 fallback: square patches in a uniform array, every cell of them worked out in the vertex stage)
      const patches = uniformArray(this.list, 'vec2');
      const cellOf = (index) => { const pid = index.div(P2), b = int(index.sub(pid.mul(P2))); return ivec2(patches.element(pid)).add(ivec2(b.mod(uP), b.div(uP))); };
      this.meshes = geos.map((g, k) => new THREE.Mesh(g, material(cellOf(instanceIndex), k)));
    }
    this.mesh = this.meshes[0];
    for (const m of this.meshes) { m.frustumCulled = false; m.renderOrder = order; scene.add(m); }
    this.culler?.adopt(this.meshes);
  }
  /** Draw k's length (its corners, n) changed: in every set of its arguments (culled: the eye's too). */
  setLength(k, n) {
    if (this.culler) { this.culler.setLength(k, n); return; }
    this.args.array[k * 5] = n; this.args.addUpdateRange(k * 5, 1); this.args.needsUpdate = true;
  }
  /** On WebGPU, after select: pack what stands in the cells it looks at; again only when something it reads has changed:
      the world's state (`world`: the ground's map, the lens, the stage), its band, the camera by more than a sixteenth
      of a patch or turned by about a third of the view's margin (`view`: src/scatter/view.js; what stands thins with
      distance, and the view is widened by its margin: a step that small is not seen), or what a placer chose (its
      patches). Standing still, the packing is kept. */
  run(renderer, world = '', cx = 0, cy = 0, cz = 0, view = '') {
    if (!this.passes) return;
    const regions = this.regions && this.select === Tier.prototype.select;   // (a placer that chooses its own patches says them: its select)
    const q = this.step || Math.max(0.25, this.S / 16);   // (step: a tier that says itself how far the camera may move before it packs again)
    let key = `${world}|${this.near}|${this.far}|${Math.round(cx / q)},${Math.round(cy / q)},${Math.round(cz / q)}`;
    if (this.reads) key += `|${this.reads()}`;   // (and what it reads besides: the growth map, src/scatter/growth.js)
    if (regions) { if (this.cull !== false || this.viewKeyed) key += `|${view}`; }
    else {
      // (a placer's own patches, read into two numbers, not written out one by one: a string of hundreds of them a tier a
      // frame was a megabyte of litter every few frames for the browser to sweep up)
      const { list, n } = this; let h1 = FNV, h2 = 0x9e3779b9;
      for (let i = 0; i < n; i++) { const x = list[i].x | 0, y = list[i].y | 0; h1 = fnv(fnv(h1, x), y); h2 = Math.imul((h2 << 5) ^ (h2 >>> 27) ^ x, 0x85ebca6b) + y | 0; }
      if (this.runs) for (let i = 0; i < n; i++) { const a = this.runs[i].x | 0, b = this.runs[i].y | 0; h1 = fnv(h1, a); h2 = Math.imul((h2 << 5) ^ (h2 >>> 27) ^ b, 0x85ebca6b) + a | 0; }   // (a list's runs: the same patch may hold other places now)
      key += `|${n}|${h1}|${h2}`; if (this.viewKeyed) key += `|${view}`;
    }
    if (key === this.key) return;
    if (!regions && !this.n && this.empty) { this.key = key; return; }   // (nothing chosen, and nothing left packed from before: no pass to make it nought again)
    this.key = key;
    const N = regions ? this.choose() : this.patched();
    if (!this.n && this.empty) return;
    this.nE.value = this.n; this.passes[1].dispatchSize = Math.max(WG, N);
    this.entries.addUpdateRange(0, Math.max(1, this.n) * 4); this.entries.needsUpdate = true;
    if (this.entryRuns && this.n) { this.entryRuns.addUpdateRange(0, this.n * 2); this.entryRuns.needsUpdate = true; }
    renderer.compute(this.passes); did('packs'); if (this.movers) did('moving'); did('kcells', Math.round(N / 1000)); this.empty = !this.n;   // (moving: a tier packed every frame, its things moving; not a change of what stands: src/core/work.js changed)
  }
  /** The region tree's leaves for the camera as select left it (regions.js), into the entries: the invocations it takes. */
  choose() {
    const c = this.cam; if (!c) { this.n = 0; return 0; }
    const s = this.fixed ? Math.min(this.fixed, this.far + Math.abs(c.dy) * 1.2) / this.far : c.s, q = this.step || Math.max(0.25, this.S / 16);
    // (the view's test, as its cells take it on the GPU: a region's things reach its own reach (`cull`) and as far as
    // the camera may move before it packs again; none where it keeps every region round the camera)
    const view = this.cull === false ? null : viewBox();
    const R = regionsOf(this.entries.array, this.room, { cell: this.cell, cx: c.cx, cz: c.cz, dy: c.dy, near: this.near * s, far: this.far * s, bounds: this.bounds, view, r: (this.cull || 0) + this.high + q + 2, high: this.high, land: [HMIN, HMAX] });
    this.n = R.n; for (const m of this.meshes) m.visible = R.n > 0;
    return R.count;
  }
  /** A placer's own patches (select's, or its own select's), into the entries, each P × P cells at its workgroups. */
  patched() {
    const E = this.entries.array, P = this.P, per = Math.ceil((P * P) / WG) * WG, n = Math.min(this.n, this.room);
    for (let i = 0; i < n; i++) { E[i * 4] = this.list[i].x >>> 0; E[i * 4 + 1] = this.list[i].y >>> 0; E[i * 4 + 2] = P; E[i * 4 + 3] = i * per; if (this.entryRuns) { this.entryRuns.array[i * 2] = this.runs[i].x; this.entryRuns.array[i * 2 + 1] = this.runs[i].y; } }
    this.n = n; return n * per;
  }
  /** On WebGPU: what the last packing holds, read back to the CPU a moment later (a promise of { count, data: the first
      slots' vec4s as floats, one array a slot } a bucket), for what the CPU must know of where things stand (src/scatter/trees.js:
      what of a stand is solid round the walker). */
  async read(renderer) {
    const K = this.geometries.length, S = this.slots, [a, d] = await Promise.all([this.args, this.data.value].map((b) => renderer.getArrayBufferAsync(b)));
    const n = new Uint32Array(a), f = new Float32Array(d);
    // per bucket: its count, and each of its rows as one array (four numbers a thing)
    return Array.from({ length: K }, (_, k) => {
      const count = Math.min(n[k * 5 + 1], this.caps[k]), rows = Array.from({ length: S }, () => new Float32Array(count * 4));
      for (let i = 0; i < count; i++) for (let j = 0; j < S; j++) { const o = ((this.offs[k] + i) * S + j) * 4; rows[j].set(f.subarray(o, o + 4), i * 4); }
      return { count, data: rows };
    });
  }
  /** s: how many times further than the 68° lens this lens sees a thing at the same size; h0: the ground under the camera.
      A grid tier on WebGPU keeps the camera for its region tree (choose: only when it packs again); a placer's own and
      the fallback's patches are found here, the nearest first where there are more than a tier holds. */
  select(cx, cz, h0, s, dy) {
    if (this.regions) { this.cam = { cx, cz, h0, s, dy }; return; }   // (a placer's own select, the stress stand's, replaces this whole)
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
