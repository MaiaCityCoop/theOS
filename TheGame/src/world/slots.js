// The biome slots: the land's shaders hold the code of the biomes round the camera, not of every biome there is. A
// biome is a file with its own node code (where it lies, its spots, its grass's cover); laid into one shader, every
// biome more makes the land's shader larger, and a shader too large hangs Safari's GPU (2026-11-12), as too many
// biomes' shares handed from vertex to pixel would pass what a GPU allows. So the land, its ground pass and their
// shares are built for SLOTS biomes at most: those that lie round the camera.
//
// Which ones: each biome has a small pass of its own (only its rule in it), working its share out at points round
// the camera (rings from 20 m to 22 km, 24 points each); read back, a biome's score is its largest share there,
// the nearer the more it counts. The SLOTS best are laid, in their layers' order; one comes in only when it beats the
// weakest laid one clearly (no flicking between two at an edge). When the list changes, the land's and the ground
// pass's new shaders are compiled aside and then taken (src/terrain/terrain.js, src/scatter/ground.js): no frame
// waits for them. What lies beyond them is drawn as the base biome until it comes near enough to be laid.
//
// While there are no more biomes than slots (seven today, eight slots) none of this runs: every biome is laid.
// ?slots=n: fewer slots, to see it at work.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, uint, uniform, instancedArray, instanceIndex, cos, sin, pow, abs } from 'three/tsl';
import { LAID, riverInfo, shareOf } from './land.nodes.js';
import { BIOMES } from './biomes.js';
import { U } from '../core/uniforms.js';

export const SLOTS = Math.max(1, +(new URLSearchParams(location.search).get('slots') ?? 8));
const RINGS = 16, DIRS = 24, NS = RINGS * DIRS + 1, EVERY = 1500, KEEP = 1.3;   // EVERY: ms between looks; KEEP: how much better a newcomer must be
const radius = (ring) => (ring >= RINGS ? 0 : 20 * 1.6 ** ring);
const weight = (r) => 1 / (1 + r / 1500);
const byLayer = (list) => LAID.filter((b) => list.includes(b));

export function createBiomeSlots(renderer) {
  let list = LAID.slice(0, SLOTS);
  if (LAID.length <= SLOTS || !renderer.backend.isWebGPUBackend) return { list: () => list, many: false, async look() { return null; }, update() {} };
  const at = uniform(new THREE.Vector2()), out = instancedArray(LAID.length * NS, 'float');
  const passes = LAID.map((b, k) => Fn(() => {   // (one biome's rule in each: none grows with the others)
    const i = instanceIndex, ring = i.div(uint(DIRS)), a = float(i.mod(uint(DIRS))).mul((2 * Math.PI) / DIRS);
    const r = ring.greaterThanEqual(uint(RINGS)).select(float(0), pow(float(1.6), float(ring)).mul(20));
    const p = at.add(vec2(cos(a), sin(a)).mul(r)), I = riverInfo(p);
    out.element(uint(k * NS).add(i)).assign(shareOf(b, { p, dist: r.max(1), d: abs(I.x), w: I.y, b: I.z }));
  })().compute(NS));
  const scores = new Float32Array(LAID.length);
  let busy = false, last = -1e9;
  // the biomes round (x, z), chosen: the list, or null where it stays as it is
  const look = async (x, z) => {
    at.value.set(x, z); for (const p of passes) renderer.compute(p);
    const px = new Float32Array(await renderer.getArrayBufferAsync(out.value));
    for (let k = 0; k < LAID.length; k++) { let best = 0; for (let i = 0; i < NS; i++) best = Math.max(best, px[k * NS + i] * weight(radius(Math.floor(i / DIRS)))); scores[k] = best; }
    const sand = U.uSand.value.z > 0 ? BIOMES[U.uSand.value.w] : null;   // (the library's sandbox: its biome is always laid)
    const score = (b) => (b === sand ? Infinity : scores[LAID.indexOf(b)]);
    const ranked = LAID.filter((b) => score(b) > 0.002).sort((a, b) => score(b) - score(a));
    // (a newcomer comes in to a free slot, or when it is clearly better than the weakest laid; one laid goes when it
    // is nowhere round the camera any more: no flicking between two at an edge)
    const top = ranked.slice(0, SLOTS), fallen = list.filter((b) => score(b) <= 0.002), staying = list.length - fallen.length;
    const weakest = Math.min(Infinity, ...list.filter((b) => score(b) > 0.002).map(score));
    const worth = top.filter((b) => !list.includes(b) && (staying < SLOTS || score(b) >= weakest * KEEP));
    if (!worth.length && !fallen.length) return null;
    const next = byLayer(top);
    if (next.length === list.length && next.every((b, i) => b === list[i])) return null;
    list = next; return list;
  };
  return {
    list: () => list, many: true, scores,
    /** The biomes round (x, z) now: the list where it changed, else null. */
    look,
    /** Each frame: every EVERY ms a look round the camera; a new list goes to apply(list) (which compiles aside). */
    update(camera, apply) {
      const now = performance.now(); if (busy || now - last < EVERY) return;
      busy = true; last = now;
      look(camera.position.x, camera.position.z).then((next) => (next ? apply(next) : null)).catch((e) => console.warn('[slots]', e)).finally(() => (busy = false));
    },
  };
}
