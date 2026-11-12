// The ground under the camera, written by the GPU into two small textures: 256 m square, a texel every 0.5 m (the
// terrain's own nearest vertices). Blades and stones read their height, density, dryness, stone chance and colour from
// them instead of working the land's noise out again at every vertex. Drawn again, whole (two 512² passes), each time
// the camera has walked 8 m. It also holds the library's stage and sandbox, which the land's nodes read.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uv, uniform, texture, positionGeometry, abs, length, mix, smoothstep, sqrt } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { heightAt as heightCPU, SAND } from '../world/land.js';
import { camDist, riverInfo, heightAt, aridMask, pathN, pathMask, bareMask, outcropMask, tuftMask, bankMask, cutMask, barMask, placeOff, stageAt, grassTint, BIO } from '../world/land.nodes.js';
import { PLACES } from '../world/places.js';
import { BIOMES } from '../world/biomes.js';

const N = 512;   // texels a side; a texel is 0.5 m to the 68° lens and grows with a longer one, so it always covers the blades' reach
const G = { o: uniform(new THREE.Vector2(1e9, 1e9)), base: uniform(0), texel: uniform(0.5) };

// what stands at a named place keeps its floor clear (its `clear`, metres round it): 1 where grass and stones may be
const clearOf = (pos) => Object.values(PLACES).filter((p) => p.clear).reduce((k, p) => k.mul(smoothstep(p.clear - 0.4, p.clear + 0.3, length(pos.sub(vec2(p.x, p.z))))), float(1));

export function createGround(renderer, tex) {
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
  const rtA = new THREE.RenderTarget(N, N, { ...opts, type: THREE.HalfFloatType }), rtB = new THREE.RenderTarget(N, N, opts);
  // the texel's centre, in metres; three's node reads turn a target's rows the other way up, so the writer turns them too
  const posOf = () => G.o.add(vec2(uv().x, float(1).sub(uv().y)).mul(N).sub(0.5).mul(G.texel));
  const fragA = Fn(() => {
    const pos = posOf(), I = riverInfo(pos), w = I.y, d = abs(I.x), b = I.z, dist = camDist(pos);
    const ar = aridMask(pos, dist), path = placeOff(pos, pathMask(pathN(pos))), oc = outcropMask(pos), bare = float(1).sub(stageAt(pos));
    const cut = cutMask(pos, d, w, b), bar = barMask(pos, d, w, b), keep = clearOf(pos).mul(bare);
    const dens = float(1).sub(path).mul(float(1).sub(bankMask(pos, d, w, b))).mul(float(1).sub(cut)).mul(float(1).sub(bar))
      .mul(float(1).sub(bareMask(pos))).mul(float(1).sub(oc.mul(0.25))).mul(mix(1, tuftMask(pos).mul(BIO.ARID_COVER), ar)).mul(keep);
    const bankNear = float(1).sub(smoothstep(w.mul(0.6), w.add(4), d));
    const stone = keep.mul(float(BIO.LAND_STONES).add(ar.mul(BIO.ARID_STONES)).add(bankNear.mul(BIO.BANK_STONES)).add(cut.mul(BIO.CUT_STONES)).add(bar.mul(BIO.BAR_STONES)).add(oc.mul(0.5))).mul(float(1).sub(path.mul(0.8)));
    return vec4(heightAt(pos, dist, d, w, b).sub(G.base), dens, ar, stone);   // heights from a base near by: a half float keeps the centimetre
  });
  const fragB = Fn(() => {
    const pos = posOf(), t = grassTint(tex, pos, aridMask(pos, camDist(pos)), 0);
    return vec4(sqrt(mix(t.rgb, vec3(0.30, 0.24, 0.15), stageAt(pos))), t.a);   // the stage: dry, bare earth
  });
  const mk = (f) => { const m = new THREE.NodeMaterial(); m.vertexNode = vec4(positionGeometry.xy, 0, 1); m.fragmentNode = f(); m.depthTest = m.depthWrite = false; return m; };
  const mA = mk(fragA), mB = mk(fragB);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mA), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false;
  const read = (rt, pos) => texture(rt.texture, pos.sub(G.o).div(G.texel).add(0.5).div(N)).level(0);
  let lastDy = -1, lastS = 0;
  return {
    /** height, grass density, dryness, stone chance at pos (a node; one filtered read) */
    A: (pos) => { const g = read(rtA, pos); return vec4(g.x.add(G.base), g.y, g.z, g.w); },
    /** the grass's colour at pos (a node) */
    tint: (pos) => { const t = read(rtB, pos); return vec4(t.rgb.mul(t.rgb), t.a); },
    /** The library's stage: a round of bare ground at (x, z), r metres across the middle; r 0 takes it away. */
    stage(x, z, r) { U.uStage.value.set(x, z, r); lastS = 0; },
    /** The library's sandbox: round (x, z) the land is all one biome (its number in biomes/); no arguments: off. */
    sandbox(x = 0, z = 0, biome = -1) { U.uSand.value.set(x, z, biome < 0 ? 0 : 1, biome); Object.assign(SAND, { on: biome >= 0, x, z, river: BIOMES[biome]?.where === 'water' }); lastS = 0; },
    /** s: the lens factor; drawn again when the camera has walked 16 texels, or the lens changed */
    update(cx, cz, dy, s = 1) {
      const TEXEL = 0.5 * s, SNAP = 16 * TEXEL, o = G.o.value;
      const ox = Math.round(cx / SNAP) * SNAP - (N * TEXEL) / 2, oz = Math.round(cz / SNAP) * SNAP - (N * TEXEL) / 2;
      if (ox === o.x && oz === o.y && Math.abs(dy - lastDy) < 4 && s === lastS) return;
      if (dy > 160 * s && lastDy > 160 * s && s === lastS) return;   // too high up for anything that reads it
      o.set(ox, oz); lastDy = dy; lastS = s; G.texel.value = TEXEL; G.base.value = Math.round(heightCPU(ox + (N * TEXEL) / 2, oz + (N * TEXEL) / 2));
      const was = renderer.getRenderTarget();
      quad.material = mA; renderer.setRenderTarget(rtA); renderer.render(quad, cam);
      quad.material = mB; renderer.setRenderTarget(rtB); renderer.render(quad, cam);
      renderer.setRenderTarget(was);
    },
  };
}
