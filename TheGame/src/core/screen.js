// The one way a picture reaches the screen: every view's (the walker's eyes, the virtual camera with its lens, a
// film, a still taken for a story), since 2026-11-14. Nothing else draws the world onto the canvas.
//
// The screen is always given all its own pixels: the canvas stands at the screen's own pixel ratio (4K on a 4K screen)
// and never below: a hard gate (2026-11-13). What is drawn of the world may be fewer: the inside, a pixel ratio of its
// own (the governor's dial: src/core/governor.js).
//
//   the frame   the world drawn at the inside's pixels into a target with its depth, a part of a pixel aside from the
//               last frame (two targets by turns: the frame before's depth says what has changed place)
//   the lens    where the camera brings one (camera.userData.dof, the virtual camera's: src/camera/post.js): the
//               frame blurred by how far each pixel lies from the plane of focus
//   the build   the screen's picture kept from frame to frame and built from them (src/core/temporal.js): at the
//               screen's own pixels, its edges smooth; no target is multisampled anywhere
//   the show    onto the canvas: a copy, or through the lens's glass
//
// `?notaau`: nothing shifted and nothing kept (the same passes then spread one frame by the filter alone): to measure
// against.
import * as THREE from 'three/webgpu';
import { note } from './gpu.js';
import { compileFor } from './compile.js';

export function createScreen(renderer, { temporal, lens = null }) {
  const OUT = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(OUT);
  let inside = OUT, turn = 0;
  const css = new THREE.Vector2(), size = new THREE.Vector2(), rts = [null, null];
  /** The inside's size in pixels. */
  const sizeOf = (v) => { renderer.getSize(css); return v.set(Math.max(1, Math.round(css.x * inside)), Math.max(1, Math.round(css.y * inside))); };
  /** This turn's target, made (again) at the inside's size. */
  const targetNow = () => {
    sizeOf(size);
    let now = rts[turn];
    if (!now || now.width !== size.x || now.height !== size.y) {
      now?.depthTexture?.dispose(); now?.dispose();
      now = rts[turn] = new THREE.RenderTarget(size.x, size.y, { samples: 0, depthTexture: new THREE.DepthTexture(size.x, size.y), minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      note(`the picture inside (target ${turn + 1} of two, with its depth)`, size.x * size.y * 8, 0);
    }
    return now;
  };
  return {
    out: OUT, size: sizeOf,
    get inside() { return inside; },
    /** The target the world is drawn into (what a material compiled aside is compiled for). */
    get target() { return rts[turn] ?? rts[1 - turn] ?? null; },
    /** The inside's pixel ratio: no more than the screen's own. */
    set(r) { inside = Math.min(OUT, Math.max(0.25, r)); },
    /** Compile what this camera sees of `object` (the scene, or a part of it standing in `scene`) for the target the
        world is drawn into: the pipelines a frame draws with, compiled side by side, in turn (src/core/compile.js; a
        promise). Compiled for the canvas instead, as the start did until 2026-11-15, every material was compiled twice:
        the canvas's pipelines are not the target's, and the target's were compiled as the first frames drew. */
    compile(object, camera, scene = null) { return compileFor(renderer, targetNow, object, camera, scene); },
    /** Draw the world as this camera sees it, onto the canvas. */
    render(scene, camera) {
      const now = targetNow(), was = rts[1 - turn];
      // (cleared to the renderer's own clear colour: the sky sets it to the hour's horizon as plain numbers, which a
      // target takes as they are: src/world/sky.js)
      temporal.begin(camera, size.x, size.y);
      renderer.setRenderTarget(now); renderer.render(scene, camera); renderer.setRenderTarget(null);
      temporal.end(camera);
      const dof = camera.userData.dof;   // the virtual camera brings a lens with it: its picture is drawn through it
      temporal.resolve(now, was, lens && dof && dof.on ? lens.blur(now, camera, dof) : null);
      turn = 1 - turn;
    },
  };
}
