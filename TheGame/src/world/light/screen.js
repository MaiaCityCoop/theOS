// The light worked out on the screen (intent 0038, stage 9), between the prepass and the colour (src/core/screen.js):
// from the prepass's depth, before a pixel is lit, what of the light the scene nearby hides from it, finer than any map.
//
//   contact   contact shadows after Bend Studio's screen-space shadows (Days Gone, 2023; Apache-2.0): from each pixel a
//             short ray towards the sun through the depth, a few centimetres to a metre, so what is too fine for the
//             shadow cascades still shades: a fern's frond on the litter, a pebble on the path, a leaf on the leaf under
//             it, a blade on the ground. As Bend's: a ray marched on the screen, its start dithered (here by the blue
//             noise, which the picture built over time averages), a surface as thick as its depth says, the shadow
//             faded towards the ray's end. It looks only for what the cascades cannot see (src/world/shadow.js): a
//             caster nearer the surface than the cascade's bias and two of its texels (four texels of the cascade the
//             point lies in), so its ray is that long; and it takes a sample every dial pixel of the ray on the screen
//             (the one measure's dial: src/detail/measure.js dialPxAt), so near the eye, where it spans more pixels,
//             more of them, far off fewer, and none where all of it lies within the dial. Marched on the screen itself:
//             its two ends
//             projected once, the distance at each sample a mix of theirs (no matrix a sample) (stage 9's march, two
//             matrices a step, every pixel to 80 m, took 22-34 ms of the Mac mini's at every view). Bend's own
//             wave-wide sharing of samples is not ported (WebGPU's subgroups are missing in Safari): each pixel marches
//             alone
//
// A texture at the inside's pixels, one byte a pixel, read by the one light (src/world/light.js lightOn) in the colour
// pass of what takes part in the prepass; anywhere else (a library's picture, a bake) it is 1. (GTAO, stage 9b, is on
// its own branch, aven/0038-stage9b, until it fits the light's 3 ms.)
import * as THREE from 'three/webgpu';
import { Fn, float, int, vec2, vec4, ivec2, uniform, texture, screenCoordinate, max, min, mix, clamp, ceil, If, Loop, length } from 'three/tsl';
import { U } from '../../core/uniforms.js';
import { cascades } from '../shadow.js';
import { dialPxAt } from '../../detail/measure.js';
import { blueAt } from './noise.js';
import { note, mark } from '../../core/gpu.js';
import { drawMade } from '../../core/compile.js';

const white = Object.assign(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), { needsUpdate: true });
/** What the screen's light passes left, for the colour pass to read (white until they run, and where they never do). */
export const SCREEN = { contact: texture(white), on: uniform(0) };   // (contact: the contact shadows' share of the sun)

/** The screen's light for the world's frame: made, and run after every prepass of `screen` (src/core/screen.js
    afterPrepass), before the colour; null where there is none (the WebGL 2 fallback). */
export function screenLightFor(renderer, screen) {
  const light = createScreenLight(renderer);
  if (light) screen.afterPrepass(({ depth, camera, w, h }) => light.run(depth, camera, w, h), 'screen light');
  return light;
}
function createScreenLight(renderer) {
  if (!renderer.backend?.isWebGPUBackend) return null;   // (the WebGL 2 fallback: no screen light)
  const depth = texture(new THREE.DepthTexture(1, 1)), proj = uniform(new THREE.Matrix4()), unproj = uniform(new THREE.Matrix4()), view = uniform(new THREE.Matrix4()), viewInv = uniform(new THREE.Matrix4()), size = uniform(new THREE.Vector2(1, 1));
  // a pixel's point seen from the eye (view space), from its depth; and a point back to its pixel
  const viewAt = (p, d) => { const c = unproj.mul(vec4(p.div(size).mul(vec2(2, -2)).add(vec2(-1, 1)), d, 1)); return c.xyz.div(c.w); };
  const pixelOf = (v) => { const c = proj.mul(vec4(v, 1)); return c.xy.div(c.w).mul(vec2(0.5, -0.5)).add(0.5).mul(size); };
  const depthAt = (p) => float(depth.load(ivec2(clamp(p, vec2(0), size.sub(1)))));
  // (how far from the eye a depth lies, straight back: the projection's own two numbers, d = e14 / (depth + e10))
  const distOf = (d) => proj.element(3).z.div(d.add(proj.element(2).z));

  const contact = new THREE.NodeMaterial();
  contact.fragmentNode = Fn(() => {
    const p = screenCoordinate.xy, d0 = depthAt(p), out = float(1).toVar();
    If(d0.lessThan(1).and(U.uShadowOn.greaterThan(0.5)), () => {
      const v0 = viewAt(p, d0), dist = v0.z.negate(), w = viewInv.mul(vec4(v0, 1)).xyz;
      // the ray: as long as what the cascade the point lies in cannot see (its bias and two of its texels; never past half
      // the way to the eye), nudged off the surface by its depth's own precision, its start dithered. Its two ends on the
      // screen and how far each lies: across the screen the distance's inverse runs straight, so a step's own distance is
      // a mix of the two ends'
      const C = cascades(), inside = (k) => { const c = C.mats.element(int(k)).mul(vec4(w, 1)); return c.x.greaterThan(0).and(c.y.greaterThan(0)).and(c.x.lessThan(1)).and(c.y.lessThan(1)); };
      const reach = (k) => C.bias[k] + 2 * C.texel[k];   // (what cascade k cannot see: its bias and two of its texels)
      let far = float(reach(C.n - 1)); for (let k = C.n - 2; k >= 0; k--) far = inside(k).select(float(reach(k)), far);
      const len = min(far, dist.mul(0.5));
      const L = view.mul(vec4(U.uSunDir, 0)).xyz, a = v0.add(L.mul(dist.mul(0.002))), b = a.add(L.mul(len)), pa = pixelOf(a), pb = pixelOf(b);
      const span = dialPxAt(length(pb.sub(pa)));   // (how long the ray is on the screen, in the dial's pixels)
      If(span.greaterThan(1), () => {   // (a ray within a dial pixel finds nothing the cascades miss)
        const ia = float(1).div(a.z.negate()).toVar(), ib = float(1).div(b.z.negate().max(1e-3)).toVar(), j = blueAt(p).z.toVar(), thick = dist.mul(0.012).add(0.04), lo = dist.mul(0.004);
        // a sample every dial pixel of the ray on the screen: a surface in front of the ray by more than the depth's own
        // precision and less than a surface is thick shades it, less towards the ray's end
        const n = ceil(span).toVar(), hit = float(0).toVar();
        Loop({ start: int(0), end: int(n), type: 'int', condition: '<' }, ({ i }) => {
          const t = float(i).add(j).div(n), q = mix(pa, pb, t), dz = float(1).div(mix(ia, ib, t)).sub(distOf(depthAt(q)));
          const on = q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(size.x)).and(q.y.lessThan(size.y));
          hit.assign(max(hit, on.and(dz.greaterThan(lo)).and(dz.lessThan(thick)).select(float(1).sub(t.mul(t).mul(0.5)), float(0))));
        });
        out.assign(float(1).sub(hit));
      });
    });
    return vec4(out, 0, 0, 1);
  })();
  const quad = new THREE.QuadMesh(contact);
  let rt = null;
  return {
    /** After the prepass (its depth `depthTex`, w by h, through this camera, still shifted by its part of a pixel): the
        screen's light, for the colour pass. */
    run(depthTex, camera, w, h) {
      if (!rt || rt.width !== w || rt.height !== h) {
        rt?.dispose();
        rt = new THREE.RenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        note('the contact shadows', w * h, 0, 'light');
      }
      depth.value = depthTex; size.value.set(w, h);
      proj.value.copy(camera.projectionMatrix); unproj.value.copy(camera.projectionMatrix).invert(); view.value.copy(camera.matrixWorldInverse); viewInv.value.copy(camera.matrixWorld);
      const prev = renderer.getRenderTarget(), route = renderer.getRenderObjectFunction(); renderer.setRenderObjectFunction(null);
      mark('contact'); renderer.setRenderTarget(rt); const drew = drawMade(renderer, quad, quad.camera, 'the contact shadows'); mark(null);   // (whose pass this is, for a tool's timing: src/core/gpu.js)
      renderer.setRenderTarget(prev); renderer.setRenderObjectFunction(route);
      SCREEN.contact.value = rt.texture; SCREEN.on.value = drew ? 1 : 0;   // (read once its pass is made and drawn: src/core/compile.js drawMade)
    },
    /** Its target (a tool's look at it). */
    target: () => rt,
  };
}
