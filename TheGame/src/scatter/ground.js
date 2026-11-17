// The ground under the camera, written by the GPU into two small textures: 256 m square, a texel every 0.5 m (the
// terrain's own nearest vertices). Blades and stones read their height, density, grass height, stone chance, colour and dryness from
// them instead of working the land's noise out again at every vertex. Drawn again, whole (two 512² passes), each time
// the camera has walked 8 m. It also holds the library's stage and sandbox, which the land's nodes read.
// Its texel grows with a longer lens in steps (a step a half stop: √2), not with every change of the lens, and from one
// step to the next what is read passes from the map before to the new one over FADE frames: a blade comes or goes by
// itself as the density it reads passes its own, its height and colour slide, nothing changes at once (intent 0033)
import * as THREE from 'three/webgpu';
import { float, vec2, vec3, vec4, uv, uniform, texture, mrt, positionGeometry, abs, length, mix, smoothstep, sqrt } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { note } from '../core/gpu.js';
import { compileFor } from '../core/compile.js';
import { heightAt as heightCPU, SAND } from '../world/land.js';
import { camDist, riverInfo, heightAt, pathN, pathMask, bareMask, outcropMask, placeOff, stageAt, grassTint, biomesAt, LAID } from '../world/land.nodes.js';
import { CLEARINGS } from '../../world/places.js';
import { offWays, waysVersion } from '../world/ways.js';
import { BIOMES } from '../world/biomes.js';

const N = 512;   // texels a side; a texel is 0.5 m to the 68° lens and grows with a longer one, so it always covers the blades' reach
const FADE = 36;   // frames (0.6 s at 60 fps; counted in frames, so no frame changes more than a 36th, however slow): from the map before to the new one, where its texel steps
// (G: the map being drawn; R: what each of the two maps was drawn with, for reading it; W: how much of the second is read)
const G = { o: uniform(new THREE.Vector2(1e9, 1e9)), base: uniform(0), texel: uniform(0.5) };
const R = [0, 1].map(() => ({ o: uniform(new THREE.Vector2(1e9, 1e9)), base: uniform(0), texel: uniform(0.5) })), W = uniform(0);
/** The map's texel for a lens factor s: 0.5 m at 1, larger by a half stop (√2) at a time, never smaller than s asks
    (the blades' reach is s times as far); held while s comes down by less than a step more (no stepping to and fro). */
const stepOf = (s, was) => (was && s <= was * 1.0001 && s > was / (Math.SQRT2 * 1.15) ? was : 2 ** (Math.ceil(Math.log2(Math.max(1, s)) * 2 - 1e-6) / 2));

// what stands at a named place keeps its floor clear (its `clear`, metres round it): 1 where grass and stones may be
const clearOf = (pos) => CLEARINGS.reduce((k, p) => k.mul(smoothstep(p.clear - 0.4, p.clear + 0.3, length(pos.sub(vec2(p.x, p.z))))), float(1));

export function createGround(renderer, tex, list = LAID) {
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
  // one pass, two outputs (MRT): the ground (height, grass, its height, stones) and the grass's colour (and its dryness)
  // (two of them: the one read, and the one before it while what is read passes from it to the new one)
  const rts = [0, 1].map(() => new THREE.RenderTarget(N, N, { ...opts, type: THREE.HalfFloatType, count: 2 })); note('the ground round the camera (two maps, twice)', 2 * 2 * N * N * 8, 0);
  for (const rt of rts) { rt.textures[0].name = 'ground'; rt.textures[1].name = 'tint'; }
  let cur = 0, fadeAt = -1;   // (fadeAt: frames into the fade; -1: none)
  // the texel's centre, in metres; three's node reads turn a target's rows the other way up, so the writer turns them too
  const posOf = () => G.o.add(vec2(uv().x, float(1).sub(uv().y)).mul(N).sub(0.5).mul(G.texel));
  // the pass's material, for a list of biomes (the slots': those round the camera, src/world/slots.js)
  const build = (list) => {
    // (plain shared nodes, not a function: three works a shared node out once, and hands the two to the two targets)
    const pos = posOf(), I = riverInfo(pos), w = I.y, d = abs(I.x), b = I.z, dist = camDist(pos);
    const L = biomesAt({ p: pos, dist, d, w, b }, false, list);   // every biome's share here: their grass, its height, their stones, the dryness
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
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), build(list)), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false;
  const read = (t, pos, M) => texture(t, pos.sub(M.o).div(M.texel).add(0.5).div(N)).level(0);
  // (both maps read, as much of each as W says: read where a blade is packed, once a blade, not at its every vertex)
  const both = (i, pos, f) => mix(f(read(rts[0].textures[i], pos, R[0]), R[0]), f(read(rts[1].textures[i], pos, R[1]), R[1]), W);
  let lastDy = -1, lastS = 0, lastW = 0, cpu = null, reading = false;
  // the CPU's copy of the ground under the camera (read back after each pass, a moment later): what runs on the CPU and
  // must agree with what is drawn reads it, the rocks' bodies first (src/world/rocksolid.js)
  const h2f = (h) => { const e = (h >> 10) & 31, f = h & 1023, sg = h & 32768 ? -1 : 1; return e === 0 ? sg * f * 2 ** -24 : e === 31 ? NaN : sg * (1 + f / 1024) * 2 ** (e - 15); };
  const readBack = (o, texel, base) => {
    if (reading) return; reading = true;
    renderer.readRenderTargetPixelsAsync(rts[cur], 0, 0, N, N, 0).then((px) => { cpu = { x: o.x, z: o.y, texel, base, px }; }).catch(() => {}).finally(() => (reading = false));
  };
  return {
    version: 0,
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
    /** The library's stage: a round at (x, z), r metres across the middle, laid in a material (its recipe or uid; none:
        the base biome's bare earth) at tile metres a tile; r 0 takes it away. */
    stage(x, z, r, material = null, tile = 2) { U.uStage.value.set(x, z, r); U.uStageGround.value.set(material ? tex.layer(material) : -1, tile); lastS = 0; },
    /** The library's sandbox: round (x, z) the land is all one biome (its number in biomes/); no arguments: off. */
    sandbox(x = 0, z = 0, biome = -1) { U.uSand.value.set(x, z, biome < 0 ? 0 : 1, biome); Object.assign(SAND, { on: biome >= 0, x, z, river: !!BIOMES[biome]?.water }); lastS = 0; },
    /** Its pass for another list of biomes (the slots' have changed): compiled aside, then taken, and drawn again.
        now: taken at once (before the start compiles everything). */
    async biomes(next, now = false) {
      const m = build(next);
      if (!now) { const was = renderer.getRenderTarget(), q = new THREE.Mesh(quad.geometry, m); q.frustumCulled = false; renderer.setRenderTarget(rts[cur]); const done = renderer.compileAsync(q, cam).catch(() => {}); renderer.setRenderTarget(was); await done; }   // (for its own target: the pipeline it is drawn with)
      quad.material.dispose(); quad.material = m; lastS = 0;
    },
    /** Drawn again at the next update (the land under it changed: the lakes, src/world/lakes.js). */
    refresh() { lastS = 0; },
    /** Its pass compiled for its own two maps, before it is first drawn, in turn (src/core/compile.js; a promise). */
    compile() { return compileFor(renderer, rts[0], quad, cam); },
    /** s: the lens factor; drawn again when the camera has walked 16 texels, or the lens's step changed (stepOf) */
    update(cx, cz, dy, s = 1) {
      // drawn again when the camera has walked 32 texels (16 m: the blades reach 105 m of the map's 128), when it has
      // risen or sunk by a quarter of its height, or when the lens's step changed; not at all too high up for anything to read it
      if (fadeAt >= 0) {   // (passing from the map before to the new one: what reads it packs again each frame of it)
        const t = Math.min(1, ++fadeAt / FADE), e = t * t * (3 - 2 * t);
        W.value = cur ? e : 1 - e; this.version++; if (t >= 1) fadeAt = -1;
      }
      const S = fadeAt >= 0 ? lastS : stepOf(s, lastS), TEXEL = 0.5 * S, SNAP = 32 * TEXEL, o = R[cur].o.value;   // (no other step while one fades: the next waits for it, FADE frames)
      const ox = Math.round(cx / SNAP) * SNAP - (N * TEXEL) / 2, oz = Math.round(cz / SNAP) * SNAP - (N * TEXEL) / 2;
      const wv = waysVersion();   // (and when the ways are others than they were)
      if (ox === o.x && oz === o.y && Math.abs(dy - lastDy) < Math.max(4, lastDy * 0.25) && S === lastS && wv === lastW) return;
      if (dy > 160 * S && lastDy > 160 * S && S === lastS && wv === lastW) return;
      // its texel stepped (not its first, nor a map drawn again for what lies on the land: lastS 0): the new one drawn
      // into the other, and read more and more from it over FADE frames; else the one read is drawn again where it is
      const step = lastS > 0 && S !== lastS;
      if (step) { cur = 1 - cur; fadeAt = 0; } else if (lastS === 0) { fadeAt = -1; W.value = cur; }
      lastDy = dy; lastS = S; lastW = wv;
      G.o.value.set(ox, oz); G.texel.value = TEXEL; G.base.value = Math.round(heightCPU(ox + (N * TEXEL) / 2, oz + (N * TEXEL) / 2));
      const M = R[cur]; M.o.value.copy(G.o.value); M.texel.value = TEXEL; M.base.value = G.base.value;
      const was = renderer.getRenderTarget();
      renderer.setRenderTarget(rts[cur]); renderer.render(quad, cam); renderer.setRenderTarget(was); this.version++;   // what reads the map knows it is new
      if (dy < 30) readBack(M.o.value.clone(), TEXEL, G.base.value);   // only a walker near the ground needs the CPU's copy (the rocks' bodies)
    },
  };
}
