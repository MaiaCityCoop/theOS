// The picture's two sizes. The screen is always given all its own pixels: the canvas stands at the screen's own pixel
// ratio (4K on a 4K screen) and never below: a hard gate (2026-11-13). What is drawn of the world may be fewer: the
// inside, a pixel ratio of its own (the governor's dial: src/core/governor.js), drawn into a target and laid on the
// screen through a filter that keeps edges crisp (Catmull-Rom: nine reads a pixel); at the same size it is a copy.
//
// The world is always drawn into the target, never straight onto the canvas. The target is multisampled and told to
// drop its samples when the pass ends (they are resolved, then forgotten: on a tiled GPU they never leave the tile,
// and need no memory of their own); a canvas keeps every sample of every frame (three stores them: four times the
// picture's pixels for the colour and again for the depth), so the canvas itself is not multisampled.
import * as THREE from 'three/webgpu';
import { Fn, If, float, vec2, vec3, vec4, uv, uniform, texture, floor, max } from 'three/tsl';
import { note } from './gpu.js';

export function createScreen(renderer, skyHex, { samples = 4, store = false } = {}) {   // store: keep the samples after the pass, as a canvas does (to measure what dropping them saves)
  const OUT = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(OUT);
  let inside = OUT, rt = null;
  const css = new THREE.Vector2(), size = new THREE.Vector2(), keep = new THREE.Color();
  // the sky's colour as plain numbers: into a target, three writes a clear colour unconverted (as src/camera/post.js)
  const sky = new THREE.Color().setRGB(((skyHex >> 16) & 255) / 255, ((skyHex >> 8) & 255) / 255, (skyHex & 255) / 255, THREE.LinearSRGBColorSpace);
  const tC = texture(new THREE.Texture()), uSize = uniform(new THREE.Vector2(1, 1)), uSame = uniform(1);
  const mat = new THREE.NodeMaterial(); mat.depthTest = mat.depthWrite = false;
  mat.vertexNode = vec4(uv().mul(2).sub(1), 0, 1);
  mat.fragmentNode = Fn(() => {
    const p = vec2(uv().x, float(1).sub(uv().y)), out = vec3(0).toVar();   // (a target reads with its rows turned)
    If(uSame.greaterThan(0.5), () => { out.assign(tC.sample(p).level(0).rgb); })
      .Else(() => {
        // Catmull-Rom over four by four of the inside's pixels, as nine reads (each of the middle two rows and columns
        // read between its pixels, where the filter's own weights put it): sharper than the plain blend, no ringing to
        // speak of; what falls under nought is cut
        const sp = p.mul(uSize), t1 = floor(sp.sub(0.5)).add(0.5), f = sp.sub(t1);
        const w0 = f.mul(f.mul(float(1).sub(f.mul(0.5))).sub(0.5)), w1 = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1), w2 = f.mul(f.mul(float(2).sub(f.mul(1.5))).add(0.5)), w3 = f.mul(f).mul(f.mul(0.5).sub(0.5));
        const w12 = w1.add(w2), t0 = t1.sub(1).div(uSize), t3 = t1.add(2).div(uSize), t12 = t1.add(w2.div(w12)).div(uSize);
        const S = (x, y) => tC.sample(vec2(x, y)).level(0).rgb;
        const sum = S(t0.x, t0.y).mul(w0.x.mul(w0.y)).add(S(t12.x, t0.y).mul(w12.x.mul(w0.y))).add(S(t3.x, t0.y).mul(w3.x.mul(w0.y)))
          .add(S(t0.x, t12.y).mul(w0.x.mul(w12.y))).add(S(t12.x, t12.y).mul(w12.x.mul(w12.y))).add(S(t3.x, t12.y).mul(w3.x.mul(w12.y)))
          .add(S(t0.x, t3.y).mul(w0.x.mul(w3.y))).add(S(t12.x, t3.y).mul(w12.x.mul(w3.y))).add(S(t3.x, t3.y).mul(w3.x.mul(w3.y)));
        out.assign(max(sum, 0));
      });
    return vec4(out, 1);
  })();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quad.frustumCulled = false;
  /** The inside's size in pixels (what a pass that draws the world into a target of its own makes it: src/camera/post.js). */
  const sizeOf = (v) => { renderer.getSize(css); return v.set(Math.max(1, Math.round(css.x * inside)), Math.max(1, Math.round(css.y * inside))); };
  return {
    out: OUT, size: sizeOf,
    get inside() { return inside; },
    /** The inside's pixel ratio: no more than the screen's own. */
    set(r) { inside = Math.min(OUT, Math.max(0.25, r)); },
    /** Draw the world: into the inside's target, then onto the screen. */
    render(scene, camera) {
      sizeOf(size);
      if (!rt || rt.width !== size.x || rt.height !== size.y) {
        rt?.dispose();
        rt = new THREE.RenderTarget(size.x, size.y, { samples, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, resolveDepthBuffer: false });
        if (!store) { rt.storeMultisampledColorBuffer = false; rt.storeMultisampledDepthBuffer = false; }   // (resolved, then forgotten)
        tC.value = rt.texture; uSize.value.copy(size); note('the picture inside (its target)', size.x * size.y * 4, 0);
      }
      uSame.value = inside >= OUT - 1e-3 ? 1 : 0;
      renderer.getClearColor(keep); renderer.setClearColor(sky);
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
      renderer.setClearColor(keep);
      renderer.render(quad, cam);
    },
  };
}
