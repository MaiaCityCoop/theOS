// The one way a picture reaches the screen: every view's (the walker's eyes, the virtual camera with its lens, a
// film, a still taken for a story), since 2026-11-14. Nothing else draws the world onto the canvas.
//
// The canvas is the output (src/core/output.js): the screen's own pixels up to OUTPUT's count (1920 × 1080, the window's
// shape kept: src/core/budget.js), laid on the screen by the browser; a hard gate (2026-11-18 22:15; the screen's own
// pixels whatever their count until then). What is drawn of the world may be fewer: the inside, a pixel ratio of its
// own (the governor's dial: src/core/governor.js), never more than the canvas's.
//
//   the prepass  the world drawn at the inside's pixels, a part of a pixel aside from the last frame: its depth, and
//                where each pixel's point lay a frame ago (its motion: src/core/pass.js); what is cut out is cut here.
//                What the tiers pack is culled for it in two passes (src/core/occlusion.js): before it, what the last
//                frame's depth hides is held back; after it, what of that this frame's depth does not hide is drawn
//                into it too
//   the colour   the world drawn again into the same depth, only where the prepass left it (an equal test, nothing
//                cut): the light's own numbers, before the screen's curve
//   the lens     where the camera brings one (camera.userData.dof, the virtual camera's: src/camera/post.js): the
//                colour blurred by how far each pixel lies from the plane of focus
//   the upscale  one pass onto the canvas (src/core/temporal.js): the screen's picture built over time from the
//                frames, at the screen's own pixels, the screen's curve and the lens's glass on it
// Two of each by turns: the frame before's depth says what has changed place.
import * as THREE from 'three/webgpu';
import { note, mark } from './gpu.js';
import { compileFor, compileList, made, ask, labelled } from './compile.js';
import { twinOf } from './pass.js';
import { GBUFFER, GBUFFER_BYTES, lightPass } from './gbuffer.js';
import { U } from './uniforms.js';
import { ERROR_PX } from '../detail/error.js';
import { occlusion } from './occlusion.js';
import { outputRatio } from './output.js';

/** The prepass's target, w × h pixels on `depth`: its motion (rgba16f, `output`), what drew each pixel (`id`: two
    numbers of 32 bits: src/core/pass.js drawnId, written by every material's prepass twin, twinOf). */
export const prepassTarget = (w, h, depth) => {
  const t = new THREE.RenderTarget(w, h, { samples: 0, type: THREE.HalfFloatType, generateMipmaps: false, depthTexture: depth, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, count: 2 + GBUFFER.length });
  t.textures[0].name = 'output'; Object.assign(t.textures[1], { name: 'id', type: THREE.UnsignedIntType, format: THREE.RGIntegerFormat });
  GBUFFER.forEach((g, i) => Object.assign(t.textures[2 + i], { name: g.name, type: g.type, format: g.format }));   // (and the G-buffer: src/core/gbuffer.js)
  return t;
};

export function createScreen(renderer, { temporal, lens = null }) {
  let OUT = outputRatio(), inside = OUT, turn = 0;   // (OUT: the canvas's pixel ratio, the output's for this window)
  renderer.setPixelRatio(OUT);
  // (the pixels drawn follow the dial: with it turned below its rest, a rung within that fraction of a pixel drawn,
  // as many more as it asks, up to every pixel the canvas has: ?truth, the gate's reference, src/detail/measure.js)
  const ratio = () => Math.min(OUT, inside / Math.min(1, ERROR_PX()));
  const css = new THREE.Vector2(), size = new THREE.Vector2();
  /** The inside's size in pixels. */
  const sizeOf = (v) => { renderer.getSize(css); return v.set(Math.max(1, Math.round(css.x * ratio())), Math.max(1, Math.round(css.y * ratio()))); };
  // each turn's targets at the inside's size: the prepass's (its motion) and the colour's, on that turn's depth (three
  // makes a texture again when a second target takes it up: none is shared between the turns)
  let T = null;
  const targetsNow = () => {
    sizeOf(size);
    if (T?.w !== size.x || T?.h !== size.y) {
      if (T) for (const t of T.turns) { t.pre.dispose(); t.main.dispose(); t.depth.dispose(); }
      const w = size.x, h = size.y, made = (o, depth) => new THREE.RenderTarget(w, h, { samples: 0, type: THREE.HalfFloatType, generateMipmaps: false, depthTexture: depth, ...o });
      const turns = [0, 1].map(() => { const depth = new THREE.DepthTexture(w, h); return { depth, pre: prepassTarget(w, h, depth), main: made({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }, depth) }; });
      T = { w, h, turns };
      note('the picture inside (its colour, motion, id, G-buffer and depth, two of each)', 2 * w * h * (8 + 8 + 8 + GBUFFER_BYTES + 4), 0, 'geometry');   // (what the prepass and the colour draw into)
    }
    return T.turns[turn];
  };
  // what each pass draws of an object: its twin for the pass (src/core/pass.js); in the prepass only what takes part. A
  // frame draws it once it is made for that pass; until then it is made aside, and left out (src/core/compile.js)
  const drawObject = renderer.renderObject, twin = { pre: (m) => (m.isNodeMaterial ? twinOf(m).pre : null), main: (m) => (m.isNodeMaterial ? twinOf(m).main : m) };
  const as = (pass) => (object, scene, camera, geometry, material, ...rest) => { const m = twin[pass](material); if (m) drawObject.call(renderer, object, scene, camera, geometry, m, ...rest); };
  const route = { pre: as('pre'), main: as('main') };
  // (what a pass asks for in a frame is made in one compile, for its own target: one maker a pass, camera and scene)
  const makers = new Map(), makerOf = (pass, camera, scene) => {
    const k = `${pass} ${camera.id} ${scene.id}`;
    if (!makers.has(k)) makers.set(k, (list) => compileList(renderer, () => targetsNow()[pass], list, camera, scene, route[pass]));
    return makers.get(k);
  };
  // (drawn in either pass once made for both it takes part in: made for the prepass and not for the colour, its depth
  // with no colour on it would be a hole the sky shows through. A deferred material's colour is its pass of light's
  // (src/core/gbuffer.js lightPass): made for that instead)
  const lit = (L) => !L || made(L.mesh, 'main') || (ask(L.mesh, 'main', makerOf('main', L.camera, L.mesh), labelled(twin.main(L.mesh.material), L.mesh, 'main')), false);
  const both = (object, material, camera, scene) => {
    const pre = twin.pre(material), main = twin.main(material);
    if ((!pre || made(object, 'pre')) && (main ? made(object, 'main') : lit(lightPass()))) return true;   // (a frame's own way: two looks)
    if (pre) ask(object, 'pre', makerOf('pre', camera, scene), labelled(pre, object, 'pre'));
    if (main) ask(object, 'main', makerOf('main', camera, scene), labelled(main, object, 'main'));
    return false;
  };
  const drawn = (pass) => (object, scene, camera, geometry, material, ...rest) => { const m = twin[pass](material); if (m && both(object, material, camera, scene)) drawObject.call(renderer, object, scene, camera, geometry, m, ...rest); };
  const pre = drawn('pre'), main = drawn('main');
  const clear = new THREE.Color(), sky = new THREE.Color(), prepassed = [];
  return {
    get out() { return OUT; }, size: sizeOf,
    get inside() { return ratio(); },
    /** The colour's target the world is drawn into. */
    get target() { return T?.turns[turn].main ?? null; },
    /** The inside's pixel ratio: no more than the canvas's. */
    set(r) { inside = Math.min(OUT, Math.max(0.25, r)); },
    /** The canvas made again for the window as it is now (src/boot.js, on a resize): its shape at the output's ratio,
        in one step (three's setSize and setPixelRatio would each make it again); the inside no more than it. */
    fit() { OUT = outputRatio(); renderer.setDrawingBufferSize(innerWidth, innerHeight, OUT); inside = Math.min(inside, OUT); },
    /** Compile what this camera sees of `object` (the scene, or a part of it standing in `scene`) for both passes, each
        for its own target: the pipelines a frame draws with, compiled side by side, in turn (src/core/compile.js; a
        promise). Compiled for the canvas instead, as the start did until 2026-11-15, every material was compiled twice:
        the canvas's pipelines are not the target's, and the target's were compiled as the first frames drew. */
    compile(object, camera, scene = null) { return Promise.all(['pre', 'main'].map((pass) => compileFor(renderer, () => targetsNow()[pass], object, camera, scene, route[pass], pass))); },
    /** What making `object` ahead of need asks (src/core/compile.js ahead): its pipelines for both passes, as `camera`
        sees it, whether it is drawn now or not. */
    ahead(object, camera, scene) { const m = [object.material].flat()[0]; for (const pass of ['pre', 'main']) if (m && twin[pass](m)) ask(object, pass, makerOf(pass, camera, scene), labelled(twin[pass](m), object, pass), false); },
    /** What the last frame was laid on the screen from (temporal.resolve's: a tool's timing of the upscale alone). */
    last: null,
    /** fn({ depth, depthWas, motion, camera, w, h }) after every prepass, before the colour: what reads what the prepass
        drew, with the camera as it drew it (its shift for this frame too); depthWas the frame before's depth (the other
        turn's, drawn into by nothing this frame; empty the first frame after a new size). The land's pages ask there for
        what they show (src/terrain/pages.js); the water takes what it reflects of the world from the frame before
        (src/terrain/water.js). name: whose its passes are, for a tool's timing (src/core/gpu.js mark). */
    afterPrepass(fn, name = null) { prepassed.push([fn, name]); },
    /** Draw the world as this camera sees it, onto the canvas. */
    render(scene, camera) {
      const t = targetsNow(), was = T.turns[1 - turn], alpha = renderer.getClearAlpha(), clearDepth = renderer.autoClearDepth;
      U.uFrame.value = (U.uFrame.value + 1) % 4096;   // (the blue noise steps on: src/world/light/noise.js)
      temporal.begin(camera, size.x, size.y);
      // (each part's passes marked as whose they are, for a tool's timing: src/core/gpu.js)
      mark('occlusion'); const culls = occlusion.early(renderer, camera, size.x, size.y, scene);   // (pass one, against the last frame's depth)
      // the prepass: nothing moved where nothing was drawn (the sky: the upscale takes the camera's motion there)
      renderer.getClearColor(clear); renderer.setClearColor(0x000000, 0);
      mark('prepass'); renderer.setRenderObjectFunction(pre); renderer.setRenderTarget(t.pre); renderer.render(scene, camera);
      // (and pass two, against this frame's depth: what it finds drawn into the prepass after the rest)
      if (culls) { mark('prepass, late'); occlusion.late(renderer, t.depth, size.x, size.y, (late) => { const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(late, camera); renderer.autoClear = ac; }); }
      for (const [fn, name] of prepassed) { mark(name); fn({ depth: t.depth, depthWas: was.depth, motion: t.pre.texture, camera, w: size.x, h: size.y }); }   // (once all of it is drawn)
      // the colour, into the prepass's depth. (Cleared to the renderer's clear colour, which the sky sets to the hour's
      // horizon as the screen shows it: here in the light's own numbers, the screen's curve taken back off it)
      const E = 1.25 * U.uExposure.value, un = (v) => -Math.log(1 - Math.min(0.999, v) ** 2.2) / E;
      sky.setRGB(un(clear.r), un(clear.g), un(clear.b), THREE.LinearSRGBColorSpace); renderer.setClearColor(sky, 1); renderer.autoClearDepth = false;
      // (the deferred families first, the one pass of light, src/core/gbuffer.js: their pixels lit where the prepass left
      // what their light needs, into the colour's target cleared to the sky; then the rest drawn over it, not cleared again)
      const ac = renderer.autoClear;
      mark('colour'); renderer.setRenderObjectFunction(main); renderer.setRenderTarget(t.main);
      const L = lightPass(); if (L) { L.frame({ camera, textures: t.pre.textures, w: size.x, h: size.y }); renderer.render(L.mesh, L.camera); renderer.autoClear = false; }
      renderer.render(scene, camera); renderer.autoClear = ac;
      renderer.setRenderObjectFunction(null); renderer.autoClearDepth = clearDepth; renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha);
      if (culls) occlusion.rest();   // (every other view draws all that was packed: the shadow map, a still, a bake)
      temporal.end(camera);
      const dof = camera.userData.dof, glass = camera.userData.glass;   // the virtual camera brings a lens with it: its picture is drawn through it; the walker's glass, without the film's depth of field (src/camera/rig.js)
      mark('lens'); const blurred = lens && dof && dof.on ? lens.blur(t.main, camera, dof) : null;
      mark('upscale'); temporal.resolve((this.last = { colour: blurred ? blurred.colour : t.main.texture, depth: t.depth, motion: t.pre.texture, depthWas: was.depth, glass: blurred ? blurred.glass : glass ?? null }));
      mark(null); turn = 1 - turn;
    },
  };
}
