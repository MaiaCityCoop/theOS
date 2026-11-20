// The ground laid once: a cache of the land's layers round the camera. A pixel of land is a dozen and more layers laid
// over each other (the base's floor, a biome's ground with its spots and its trees' litter, the bare patches, the
// grass's carpet, the paths, the slopes' rock, each a material read twice: src/terrain/material.js: compose): most of a
// frame's time, and the same again every frame for ground that has not changed. Here it is laid once into maps round
// the camera, and a pixel reads the result: four reads where there were twenty.
//
//   LEVELS maps, each N texels a side and twice as wide as the one before (E0 metres the first): a point is read from
//   the finest map that reaches it, blended into the next over that map's ring, so neither their sharpness nor what
//   changes with distance (the carpet's sizes, the paths' fading) shows a step; the last blends into the layers laid
//   per pixel as before, which are still what is drawn beyond it, through a long lens and on the library's stage.
//   A map is laid for the distance it is seen from (a quarter of its width).
//
//   Each map is a torus: a place's texel is its position modulo the map's width, so when the camera moves only the
//   strips that came into reach are laid (a walk: a few thousand texels a frame); a map too far behind (a flight, a
//   jump) is laid whole, one a frame, coarsest first, and the finer ones wait unread until it is their turn.
//
//   Two targets a map: [colour (as its square root), height] and [relief (x, z), the grass's cover, the shade a stand
//   casts on its floor]. 2 x LEVELS x N x N x 4 bytes, said to the ledger (src/core/gpu.js).
import * as THREE from 'three/webgpu';
import { Fn, If, float, int, vec2, vec3, vec4, uniform, texture, uv, screenCoordinate, floor, ceil, round, log2, exp2, max, min, abs, mix, clamp, length, smoothstep } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { note } from '../core/gpu.js';

export const LEVELS = 6, N = 2048, E0 = 8, SNAP = 32, MARGIN = 0.1;
const BUDGET = 4.6e6;   // texels laid a frame at most (a whole map and a little)

export function createGroundCache() {
  const array = (name) => { const rt = new THREE.RenderTarget(N, N, { depth: LEVELS, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace }); Object.assign(rt.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 4, name }); return rt; };
  const A = array('ground: colour'), B = array('ground: relief'), tA = texture(A.texture), tB = texture(B.texture);
  const scratch = new THREE.RenderTarget(N, N, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.NoColorSpace });
  const uValid = uniform(LEVELS), uOn = uniform(0);   // the finest map that may be read (LEVELS: none yet)
  const uLv = uniform(0), uCT = uniform(new THREE.Vector2()), uRect = uniform(new THREE.Vector4(0, 0, N, N));   // the map being laid: its number, its middle (texels), the pixels drawn
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quads = [];
  const done = Array.from({ length: LEVELS }, () => ({ x: 0, z: 0, ok: false }));
  const box = new THREE.Box2(), at = new THREE.Vector3(); let key = null, made = false;

  /** What lays a point: pack0(p, texel, D) and pack1(…) -> vec4, the two targets' values (the land's material gives them). */
  function setPacks(...packs) {
    for (const pack of packs) {
      const m = new THREE.NodeMaterial(); m.depthTest = m.depthWrite = false; m.side = THREE.DoubleSide;
      m.vertexNode = Fn(() => { const q = mix(uRect.xy, uRect.zw, uv()); return vec4(q.x.div(N).mul(2).sub(1), float(1).sub(q.y.div(N).mul(2)), 0, 1); })();
      m.fragmentNode = Fn(() => {
        // the pixel's place: its column and row are its position modulo the map's width; the one of those nearest the map's middle
        const E = exp2(uLv).mul(E0), texel = E.div(N), ix = floor(screenCoordinate.x), jz = floor(screenCoordinate.y);
        const p = vec2(ix.add(round(uCT.x.sub(ix).div(N)).mul(N)).add(0.5), jz.add(round(uCT.y.sub(jz).div(N)).mul(N)).add(0.5)).mul(texel);
        return pack(p, texel, E.div(4));
      })();
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; quads.push(q);
    }
  }
  // a run of n texels from x0 (a place's column or row, any whole number) as pixels of the map: one stretch, or two where it wraps
  const runs = (x0, n) => { const i0 = ((x0 % N) + N) % N; return i0 + n <= N ? [[i0, i0 + n]] : [[i0, N], [0, i0 + n - N]]; };

  return {
    A, B, setPacks,
    /** Each frame, before the picture: lay what came into reach. worldKey: what the layers depend on besides the place. */
    update(renderer, camera, worldKey = '') {
      if (!quads.length) return;
      if (!made) { renderer.initRenderTarget(A); renderer.initRenderTarget(B); renderer.initRenderTarget(scratch); note('the ground laid once (its cache)', (2 * LEVELS + 1) * N * N * 4, 0); made = true; }
      if (worldKey !== key) { key = worldKey; for (const d of done) d.ok = false; }
      const was = renderer.getRenderTarget(), auto = renderer.autoClear; renderer.autoClear = false;
      let budget = BUDGET, valid = 0;
      for (let l = LEVELS - 1; l >= 0; l--) {   // the coarsest first: a finer one is read only with all the coarser
        const texel = (E0 * 2 ** l) / N, cx = Math.round(camera.position.x / texel / SNAP) * SNAP, cz = Math.round(camera.position.z / texel / SNAP) * SNAP, d = done[l], rects = [];
        if (!d.ok || Math.abs(cx - d.x) > N * 0.45 || Math.abs(cz - d.z) > N * 0.45) rects.push([0, 0, N, N]);
        else {
          const dx = cx - d.x, dz = cz - d.z;   // the columns and rows that came into the map's square
          if (dx) for (const [a, b] of runs(dx > 0 ? d.x + N / 2 : cx - N / 2, Math.abs(dx))) rects.push([a, 0, b, N]);
          if (dz) for (const [a, b] of runs(dz > 0 ? d.z + N / 2 : cz - N / 2, Math.abs(dz))) rects.push([0, a, N, b]);
        }
        const area = rects.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0);
        if (area > budget) { d.ok = false; valid = l + 1; continue; }   // not this frame: it and the finer ones are not read until it is laid
        budget -= area;
        for (const [x0, y0, x1, y1] of rects) for (let k = 0; k < 2; k++) {
          uLv.value = l; uCT.value.set(cx, cz); uRect.value.set(x0, y0, x1, y1);
          renderer.setRenderTarget(scratch); renderer.render(quads[k], cam); renderer.setRenderTarget(null);
          box.min.set(x0, y0); box.max.set(x1, y1); at.set(x0, y0, l); renderer.copyTextureToTexture(scratch.texture, (k ? B : A).texture, box, at, 0, 0);
        }
        d.x = cx; d.z = cz; d.ok = true;
      }
      renderer.setRenderTarget(was); renderer.autoClear = auto;
      uValid.value = valid; uOn.value = valid < LEVELS ? 1 : 0;
    },
    /** The layers at p as the maps hold them (dx, dy: how far apart the pixel's neighbours are): { w (how much of it is
        the maps': 0 none … 1 all), c, h, n, cv, shade }, variables. Read only where w is over nought. */
    lookup(p, dx, dy) {
      const q = p.sub(U.uCam.xz), cheb = max(abs(q.x), abs(q.y)), a = length(dx), b = length(dy);
      // the map by reach (the finest whose square holds the point, a margin kept) and by fineness (its texels no finer than the pixel)
      const Lu = max(max(log2(max(cheb.mul(2 / (E0 * (1 - MARGIN))), 1e-4)), log2(max(max(min(a, b), max(a, b).div(4)).div(E0 / N), 1e-4))), uValid.sub(0.999));
      const l = max(ceil(Lu), 0).toVar(), t = clamp(Lu.sub(l).add(1), 0, 1).toVar(), last = l.greaterThan(LEVELS - 1.5);
      // (not through a long lens, whose distances are not the camera's, nor on the library's stage, whose ground changes)
      const on = uOn.mul(U.uLodInv.greaterThan(0.98).select(float(1), float(0))).mul(U.uStage.z.greaterThan(0).select(float(0), float(1)));
      const w = l.greaterThan(LEVELS - 0.5).select(float(0), last.select(float(1).sub(smoothstep(0.7, 1, t)), float(1))).mul(on).toVar();
      const c = vec3(0).toVar(), h = float(0).toVar(), n = vec2(0).toVar(), cv = float(0).toVar(), shade = float(0).toVar();
      If(w.greaterThan(0.001), () => {
        const E = exp2(l).mul(E0), s0 = tA.sample(p.div(E)).depth(int(l)).grad(dx.div(E), dy.div(E)).toVar(), s1 = tB.sample(p.div(E)).depth(int(l)).grad(dx.div(E), dy.div(E)).toVar();
        If(last.not().and(t.greaterThan(0.02)), () => {   // into the next coarser map over this one's ring
          const E2 = E.mul(2), l2 = int(l.add(1));
          s0.assign(mix(s0, tA.sample(p.div(E2)).depth(l2).grad(dx.div(E2), dy.div(E2)), t)); s1.assign(mix(s1, tB.sample(p.div(E2)).depth(l2).grad(dx.div(E2), dy.div(E2)), t));
        });
        c.assign(s0.rgb.mul(s0.rgb)); h.assign(s0.a); n.assign(s1.xy.mul(2).sub(1)); cv.assign(s1.z); shade.assign(s1.w);
      });
      return { w, c, h, n, cv, shade };
    },
  };
}
