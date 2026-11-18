// The light worked out on the screen (intent 0038, stage 9), between the prepass and the colour (src/core/screen.js):
// from the prepass's depth, before a pixel is lit, what of the light the scene nearby hides from it, finer than any map.
//
//   contact   contact shadows after Bend Studio's screen-space shadows (Days Gone, 2023; Apache-2.0): from each pixel a
//             short ray towards the sun through the depth, a few centimetres to a metre, so what is too fine for the
//             shadow atlas still shades: a fern's frond on the litter, a pebble on the path, a leaf on the leaf under it,
//             a blade on the ground. As Bend's: a ray of fixed pixels' worth of steps, its start dithered (here by the
//             blue noise, which the picture built over time averages), a surface as thick as its depth says, the
//             shadow faded towards the ray's end and with distance. Bend's own wave-wide sharing of samples is not
//             ported (WebGPU's subgroups are missing in Safari): each pixel marches alone
//
// Each is a texture at the inside's pixels, read by the one light (src/world/light.js lightOn) in the colour pass of
// what takes part in the prepass; anywhere else (a library's picture, a bake) they are 1.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, ivec2, uniform, texture, screenCoordinate, Loop, max, min, smoothstep, clamp, If } from 'three/tsl';
import { U } from '../../core/uniforms.js';
import { blueAt } from './noise.js';
import { note } from '../../core/gpu.js';

const white = Object.assign(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), { needsUpdate: true });
/** What the screen's light passes left, for the colour pass to read (white until they run, and where they never do). */
export const SCREEN = { contact: texture(white), on: uniform(0) };

const STEPS = 12;
export function createScreenLight(renderer) {
  if (!renderer.backend?.isWebGPUBackend) return null;   // (the WebGL 2 fallback: no screen light)
  const depth = texture(new THREE.DepthTexture(1, 1)), proj = uniform(new THREE.Matrix4()), unproj = uniform(new THREE.Matrix4()), view = uniform(new THREE.Matrix4()), size = uniform(new THREE.Vector2(1, 1));
  // a pixel's point seen from the eye (view space), from its depth; and a point back to its pixel
  const viewAt = (p, d) => { const c = unproj.mul(vec4(p.div(size).mul(vec2(2, -2)).add(vec2(-1, 1)), d, 1)); return c.xyz.div(c.w); };
  const pixelOf = (v) => { const c = proj.mul(vec4(v, 1)); return c.xy.div(c.w).mul(vec2(0.5, -0.5)).add(0.5).mul(size); };
  const depthAt = (p) => float(depth.load(ivec2(clamp(p, vec2(0), size.sub(1)))));

  const contact = new THREE.NodeMaterial();
  contact.fragmentNode = Fn(() => {
    const p = screenCoordinate.xy, d0 = depthAt(p), out = float(1).toVar();
    If(d0.lessThan(1), () => {
      const v0 = viewAt(p, d0), dist = v0.z.negate(), L = view.mul(vec4(U.uSunDir, 0)).xyz;
      // the ray: longer the farther (a metre's worth of shadow at 40 m is what a few centimetres are at 2 m), its start
      // dithered, nudged off the surface by its depth's own precision
      const len = dist.mul(0.02).add(0.12), j = blueAt(p).z, hit = float(0).toVar();
      Loop(STEPS, ({ i }) => {
        const t = float(i).add(j).div(STEPS), v = v0.add(L.mul(len.mul(t).add(dist.mul(0.002)))), q = pixelOf(v);
        const z = viewAt(q, depthAt(q)).z.negate(), dz = v.z.negate().sub(z), thick = dist.mul(0.012).add(0.04);   // (how far in front of the ray the depth there stands, and how thick a surface is taken to be)
        const inside = q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(size.x)).and(q.y.lessThan(size.y));
        hit.assign(max(hit, inside.select(smoothstep(0.004, 0.02, dz.div(dist)).mul(float(1).sub(smoothstep(thick, thick.mul(1.6), dz))).mul(float(1).sub(t.mul(t).mul(0.5))), float(0))));
      });
      out.assign(float(1).sub(hit.mul(float(1).sub(smoothstep(40, 80, dist)))));
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
        rt?.dispose(); rt = new THREE.RenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        note('the contact shadows', w * h * 4, 0);
      }
      depth.value = depthTex; size.value.set(w, h);
      proj.value.copy(camera.projectionMatrix); unproj.value.copy(camera.projectionMatrix).invert(); view.value.copy(camera.matrixWorldInverse);
      const prev = renderer.getRenderTarget(), route = renderer.getRenderObjectFunction(); renderer.setRenderObjectFunction(null); renderer.setRenderTarget(rt); quad.render(renderer); renderer.setRenderTarget(prev); renderer.setRenderObjectFunction(route);
      SCREEN.contact.value = rt.texture; SCREEN.on.value = 1;
    },
    /** Off: the colour pass reads 1 (a frame drawn by anything else than the world's screen). */
    off() { SCREEN.on.value = 0; },
  };
}
