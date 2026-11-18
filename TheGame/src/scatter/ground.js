// The ground round the camera, written by the GPU into small maps: windows of 512² texels, level 0's a texel every
// 0.5 m (the terrain's own nearest vertices), each level's texel twice the one before's, as many levels as reach the
// meadow's end (where its blades are gone: src/scatter/grass.js bandsOf, at the most pixels the screen can draw). Blades
// and stones read their height, density, grass height, stone chance, colour and dryness from them instead of working
// the land's noise out again at every vertex, from the finest level that holds them, going over into the next over its
// window's outer eighth. A level is drawn again, whole (one 512² pass, two outputs), each time the camera has walked 32
// of its texels, or when the library's stage or sandbox changed (src/stage/studio.js: the land's nodes read them).
// Its texels grow with a longer lens in steps (a step a half stop: √2), not with every change of the lens, and from one
// step to the next what is read passes from the maps before to the new ones over FADE frames: a blade comes or goes by
// itself as the density it reads passes its own, its height and colour slide, nothing changes at once (intent 0033)
import * as THREE from 'three/webgpu';
import { float, vec2, vec3, vec4, uv, uniform, texture, mrt, positionGeometry, abs, length, mix, smoothstep, sqrt, max, clamp, If } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { note } from '../core/gpu.js';
import { compileFor } from '../core/compile.js';
import { heightAt as heightCPU } from '../world/land.js';
import { camDist, riverInfo, heightAt, pathN, pathMask, bareMask, outcropMask, placeOff, stageAt, grassTint, biomesAt } from '../world/land.nodes.js';
import { CLEARINGS } from '../../world/places.js';
import { offWays, waysVersion } from '../world/ways.js';
import { source } from '../core/settle.js';
import { recipes } from '../core/registry.js';
import { pxKMost } from '../detail/measure.js';
import { ringsOf, bandsOf } from './grass.js';

const N = 512;   // texels a side of every level; level 0's texel is 0.5 m to the 68° lens and grows with a longer one, so it always covers what reads it
/** How far round the camera level 0 surely reaches, metres as the 68° lens sees them: half its side, less the 32 texels
    the camera walks before it is drawn again (update); each level after reaches twice as far. What reads level 0 alone
    (where stones lie, src/scatter/rocks.js; the CPU's copy) ends within it. */
export const REACH = (N * 0.5) / 2 - 32 * 0.5;
/** How far the maps reach: the meadow's end at the most pixels the screen can draw (its blades read them furthest out;
    the maps are a capacity: src/detail/measure.js pxKMost), never less than level 0's. */
const reachOf = () => Math.max(REACH, ...recipes('asset').filter((a) => a.placement?.engine === 'grass').map((a) => bandsOf(ringsOf(a), a.height, pxKMost()).end));
const FADE = 36;   // frames (0.6 s at 60 fps; counted in frames, so no frame changes more than a 36th, however slow): from the map before to the new one, where its texel steps
// (G: the map being drawn; R[set][level]: what each map of the two sets was drawn with, for reading it; W: how much of
// the second set is read)
const G = { o: uniform(new THREE.Vector2(1e9, 1e9)), base: uniform(0), texel: uniform(0.5) }, W = uniform(0);
const drawnWith = () => ({ o: uniform(new THREE.Vector2(1e9, 1e9)), base: uniform(0), texel: uniform(0.5) });
/** The map's texel for a lens factor s: 0.5 m at 1, larger by a half stop (√2) at a time, never smaller than s asks
    (the blades' reach is s times as far); held while s comes down by less than a step more (no stepping to and fro). */
const stepOf = (s, was) => (was && s <= was * 1.0001 && s > was / (Math.SQRT2 * 1.15) ? was : 2 ** (Math.ceil(Math.log2(Math.max(1, s)) * 2 - 1e-6) / 2));

// what stands at a named place keeps its floor clear (its `clear`, metres round it): 1 where grass and stones may be
const clearOf = (pos) => CLEARINGS.reduce((k, p) => k.mul(smoothstep(p.clear - 0.4, p.clear + 0.3, length(pos.sub(vec2(p.x, p.z))))), float(1));

export function createGround(renderer, tex) {
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
  // as many levels as reach as far as the maps must (each twice the one before's); a level's pass one, two outputs
  // (MRT): the ground (height, grass, its height, stones) and the grass's colour (and its dryness), the levels side by
  // side in one target (what reads them binds two textures a set, whatever the levels: a stage binds 16 at most). Two
  // sets of them: the one read, and the one before it while what is read passes from it to the new one
  const LV = Math.max(1, Math.ceil(Math.log2(reachOf() / REACH) - 1e-9) + 1);
  const rts = [0, 1].map(() => new THREE.RenderTarget(N * LV, N, { ...opts, type: THREE.HalfFloatType, count: 2 }));
  note(`the ground round the camera (${LV} levels of two maps, twice)`, 2 * LV * 2 * N * N * 8, 0, 'ground');
  for (const rt of rts) { rt.textures[0].name = 'ground'; rt.textures[1].name = 'tint'; rt.scissorTest = true; }
  const R = [0, 1].map(() => Array.from({ length: LV }, drawnWith));
  let cur = 0, fadeAt = -1;   // (fadeAt: frames into the fade; -1: none)
  // the texel's centre, in metres; three's node reads turn a target's rows the other way up, so the writer turns them too
  const posOf = () => G.o.add(vec2(uv().x, float(1).sub(uv().y)).mul(N).sub(0.5).mul(G.texel));
  // the pass's material
  const build = () => {
    // (plain shared nodes, not a function: three works a shared node out once, and hands the two to the two targets)
    const pos = posOf(), I = riverInfo(pos), w = I.y, d = abs(I.x), b = I.z, dist = camDist(pos);
    const L = biomesAt({ p: pos, dist, d, w, b });   // every biome's share here: their grass, its height, their stones, the dryness
    const path = placeOff(pos, pathMask(pathN(pos))), oc = outcropMask(pos), stage = stageAt(pos), keep = offWays(clearOf(pos).mul(float(1).sub(stage)), pos, 1);   // (and no grass or stone on a way: src/world/ways.js)
    const dens = float(1).sub(path).mul(float(1).sub(bareMask(pos))).mul(float(1).sub(oc.mul(0.25))).mul(L.cover).mul(keep);
    const stone = keep.mul(L.stones.add(oc.mul(0.5))).mul(float(1).sub(path.mul(0.8)));
    const t = grassTint(tex, pos, L.dry, 0);
    const mat = new THREE.NodeMaterial(); mat.vertexNode = vec4(positionGeometry.xy, 0, 1); mat.colorNode = vec4(0); mat.depthTest = mat.depthWrite = false;
    mat.mrtNode = mrt({
      ground: vec4(heightAt(pos, dist, d, w, b).sub(G.base), dens, L.height, stone),   // heights from a base near by: a half float keeps the centimetre
      tint: vec4(sqrt(mix(t.rgb, vec3(0.30, 0.24, 0.15), stage)), t.a),   // the stage: dry, bare earth
    });
    return mat;
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), build()), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false;
  // (level l's texel at pos: its place in its own window, within half a texel of its edge, l windows along)
  const read = (t, pos, M, l) => { const u = clamp(pos.sub(M.o).div(M.texel).add(0.5).div(N), 0.5 / N, 1 - 0.5 / N); return texture(t, vec2(u.x.add(l).div(LV), u.y)).level(0); };
  // (a set's maps at pos: the finest level whose window holds it, going over into the next over the window's outer
  // eighth, the last holding all it has; f: a level's value from its texel and what it was drawn with)
  const levels = (set, i, pos, f) => {
    const out = vec4(0).toVar(), left = float(1).toVar();
    for (let l = 0; l < LV; l++) {
      const M = R[set][l], u = pos.sub(M.o).div(M.texel).sub(N / 2 - 0.5), e = max(abs(u.x), abs(u.y)).div(N / 2 - 1);
      If(left.greaterThan(0).and(e.lessThan(1)), () => {
        const k = l < LV - 1 ? left.mul(float(1).sub(clamp(e.sub(7 / 8).mul(8), 0, 1))) : left;
        out.addAssign(f(read(rts[set].textures[i], pos, M, l), M).mul(k)); left.subAssign(k);
      });
    }
    return out;
  };
  // (both sets read, as much of each as W says: read where a blade is packed, once a blade, not at its every vertex)
  const both = (i, pos, f) => mix(levels(0, i, pos, f), levels(1, i, pos, f), W);
  const lastDy = Array(LV).fill(-1);   // (the camera's height over the ground each level was last drawn at)
  let lastS = 0, lastW = 0, laid = '', cpu = null, reading = false, reads = 0;   // (laid: the stage and sandbox it was drawn for; reads: how many read-backs have come)
  // the CPU's copy of the ground under the camera (read back after each pass, a moment later): what runs on the CPU and
  // must agree with what is drawn reads it, the rocks' bodies first (src/world/rocksolid.js)
  const h2f = (h) => { const e = (h >> 10) & 31, f = h & 1023, sg = h & 32768 ? -1 : 1; return e === 0 ? sg * f * 2 ** -24 : e === 31 ? NaN : sg * (1 + f / 1024) * 2 ** (e - 15); };
  const readBack = (o, texel, base) => {
    if (reading) return; reading = true;
    renderer.readRenderTargetPixelsAsync(rts[cur], 0, 0, N, N, 0).then((px) => { cpu = { x: o.x, z: o.y, texel, base, px }; reads++; }).catch(() => {}).finally(() => (reading = false));
  };
  // (still out, for the world complete: src/core/settle.js): what reads the map passing from the one before to the new,
  // and the map being read back for the CPU
  source('ground', () => (fadeAt >= 0 ? 1 : 0) + (reading ? 1 : 0));
  return {
    version: 0,
    /** How many times the CPU's copy has been read back (what looks at it knows it has new ground: src/scatter/rocks.js). */
    get reads() { return reads; },
    /** height, grass density, grass height (a share of the asset's), stone chance at pos (a node; one filtered read) */
    A: (pos) => both(0, pos, (g, M) => vec4(g.x.add(M.base), g.y, g.z, g.w)),
    /** the grass's colour at pos, and in w its dryness (a node) */
    tint: (pos) => both(1, pos, (t) => vec4(t.rgb.mul(t.rgb), t.a)),
    /** What the ground pass says at (x, z), on the CPU: { height, density, grassHeight, stone }, or null where it has not
        been read yet or does not reach. Rows come back as the backend keeps them (top-down; the pass writes them turned). */
    at(x, z) {
      if (!cpu) return null;
      const i = Math.round((x - cpu.x) / cpu.texel), j = Math.round((z - cpu.z) / cpu.texel);
      if (i < 0 || j < 0 || i >= N || j >= N) return null;
      const k = (j * N + i) * 4, v = cpu.px, f = v instanceof Uint16Array ? h2f : (n) => n;
      return { height: f(v[k]) + cpu.base, density: f(v[k + 1]), grassHeight: f(v[k + 2]), stone: f(v[k + 3]) };
    },
    /** Drawn again at the next update (the land under it changed: the lakes, src/world/lakes.js). */
    refresh() { lastS = 0; },
    /** Its pass compiled for its own two maps, before it is first drawn, in turn (src/core/compile.js; a promise). */
    compile() { return compileFor(renderer, rts[0], quad, cam); },
    /** s: the lens factor; a level drawn again when the camera has walked 32 of its texels, or risen or sunk by a quarter
        of its height, or the lens's step changed (stepOf); none at all too high up for anything to read it */
    update(cx, cz, dy, s = 1) {
      if (fadeAt >= 0) {   // (passing from the maps before to the new ones: what reads them packs again each frame of it)
        const t = Math.min(1, ++fadeAt / FADE), e = t * t * (3 - 2 * t);
        W.value = cur ? e : 1 - e; this.version++; if (t >= 1) fadeAt = -1;
      }
      if (fadeAt < 0) { const k = `${U.uSand.value.toArray()}|${U.uStage.value.toArray()}`; if (k !== laid) { laid = k; lastS = 0; } }   // (the library's stage or sandbox moved: drawn again whole)
      const S = fadeAt >= 0 ? lastS : stepOf(s, lastS), wv = waysVersion();   // (no other step while one fades: the next waits for it, FADE frames; and when the ways are others than they were)
      // its texels stepped (not its first, nor maps drawn again for what lies on the land: lastS 0): the new ones drawn
      // into the other set, and read more and more from it over FADE frames; else each level of the set read is drawn
      // again where it is, where it must be
      const whole = S !== lastS || wv !== lastW, step = lastS > 0 && S !== lastS;
      if (step) { cur = 1 - cur; fadeAt = 0; } else if (lastS === 0) { fadeAt = -1; W.value = cur; }
      lastS = S; lastW = wv;
      for (let l = 0; l < LV; l++) {
        const TEXEL = 0.5 * S * 2 ** l, SNAP = 32 * TEXEL, reach = REACH * S * 2 ** l, M = R[cur][l], o = M.o.value, was = lastDy[l];
        const ox = Math.round(cx / SNAP) * SNAP - (N * TEXEL) / 2, oz = Math.round(cz / SNAP) * SNAP - (N * TEXEL) / 2;
        if (!whole && ox === o.x && oz === o.y && Math.abs(dy - was) < Math.max(4, was * 0.25)) continue;
        if (!whole && dy > reach && was > reach) continue;   // (higher than it reaches: nothing reads it)
        lastDy[l] = dy;
        G.o.value.set(ox, oz); G.texel.value = TEXEL; G.base.value = Math.round(heightCPU(ox + (N * TEXEL) / 2, oz + (N * TEXEL) / 2));
        M.o.value.copy(G.o.value); M.texel.value = TEXEL; M.base.value = G.base.value;
        const before = renderer.getRenderTarget(), ac = renderer.autoClear, rt = rts[cur];
        rt.viewport.set(l * N, 0, N, N); rt.scissor.set(l * N, 0, N, N); renderer.autoClear = false;   // (its own window only: the others kept)
        renderer.setRenderTarget(rt); renderer.render(quad, cam); renderer.setRenderTarget(before); renderer.autoClear = ac; this.version++;   // what reads the maps knows they are new
        if (l === 0 && dy < 30) readBack(M.o.value.clone(), TEXEL, G.base.value);   // only a walker near the ground needs the CPU's copy (the rocks' bodies): level 0's
      }
    },
  };
}
