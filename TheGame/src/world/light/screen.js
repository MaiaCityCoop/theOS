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
import { Fn, float, vec2, vec3, vec4, ivec2, uint, uniform, texture, screenCoordinate, Loop, max, min, smoothstep, clamp, If, floor, abs, cross, normalize, length, acos, sign, ceil, cos, sin } from 'three/tsl';
import { U } from '../../core/uniforms.js';
import { blueAt } from './noise.js';
import { note, mark } from '../../core/gpu.js';

const white = Object.assign(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), { needsUpdate: true });
/** What the screen's light passes left, for the colour pass to read (white until they run, and where they never do). */
export const SCREEN = { contact: texture(white), on: uniform(0) };   // (contact: x the contact shadows' share of the sun, y GTAO's of the sky)

const STEPS = 12;                                   // the contact shadows' steps
const AO_R = 1.6, AO_THICK = 0.35, AO_STEPS = 6;   // GTAO: how far it looks (m), how thick a surface is taken to be (m, and 2 % of its distance more), steps a side
export function createScreenLight(renderer) {
  if (!renderer.backend?.isWebGPUBackend) return null;   // (the WebGL 2 fallback: no screen light)
  const depth = texture(new THREE.DepthTexture(1, 1)), proj = uniform(new THREE.Matrix4()), unproj = uniform(new THREE.Matrix4()), view = uniform(new THREE.Matrix4()), viewInv = uniform(new THREE.Matrix4()), size = uniform(new THREE.Vector2(1, 1));
  // a pixel's point seen from the eye (view space), from its depth; and a point back to its pixel
  const viewAt = (p, d) => { const c = unproj.mul(vec4(p.div(size).mul(vec2(2, -2)).add(vec2(-1, 1)), d, 1)); return c.xyz.div(c.w); };
  const pixelOf = (v) => { const c = proj.mul(vec4(v, 1)); return c.xy.div(c.w).mul(vec2(0.5, -0.5)).add(0.5).mul(size); };
  const depthAt = (p) => float(depth.load(ivec2(clamp(p, vec2(0), size.sub(1)))));

  // GTAO's share of the sky, at half the pixels (drawn first, below), read here four times between its texels (its
  // slices' noise averaged over 8 x 8 of the inside's pixels) and kept beside the contact shadows: the colour pass
  // reads both with one load
  const aoTex = texture(white), aoAt = (p) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => aoTex.sample(p.add(vec2(i * 1.5, j * 1.5)).div(size)).level(0).w).reduce((a, b) => a.add(b)).mul(0.25);
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
    return vec4(out, clamp(aoAt(screenCoordinate.xy), 0, 1), 0, 1);
  })();
  // ---- GTAO with a visibility bitmask, at half the pixels ----
  // Jimenez's ground-truth AO (2016) as Therrien's visibility bitmask has it (2023): two slices a pixel through the
  // depth, turned by the blue noise; along each, six steps a side, each a surface THICK deep (not a wall to the sky:
  // what is behind a blade or a twig is seen past it); the 32 sectors of the slice's half-circle round the normal marked
  // where something stands; the share left unmarked is what the sky reaches, the mean way through them the bent normal.
  // The picture built over time averages the noise of the slices away.
  const aoMat = new THREE.NodeMaterial();
  aoMat.fragmentNode = Fn(() => {
    const h = screenCoordinate.xy, p = floor(h).mul(2).add(0.5), d0 = depthAt(p), out = vec4(0, 0, 0, 1).toVar();
    If(d0.lessThan(1), () => {
      const v0 = viewAt(p, d0), V = normalize(v0.negate()), dist = v0.z.negate();
      // its normal from its depth: of each pair of neighbours the nearer, so an edge does not bend it
      const l = viewAt(p.sub(vec2(1, 0)), depthAt(p.sub(vec2(1, 0)))), r = viewAt(p.add(vec2(1, 0)), depthAt(p.add(vec2(1, 0))));
      const u = viewAt(p.sub(vec2(0, 1)), depthAt(p.sub(vec2(0, 1)))), b = viewAt(p.add(vec2(0, 1)), depthAt(p.add(vec2(0, 1))));
      const dx = abs(r.z.sub(v0.z)).lessThan(abs(v0.z.sub(l.z))).select(r.sub(v0), v0.sub(l)), dy = abs(b.z.sub(v0.z)).lessThan(abs(v0.z.sub(u.z))).select(b.sub(v0), v0.sub(u));
      const n0 = normalize(cross(dy, dx)), n = n0.dot(V).lessThan(0).select(n0.negate(), n0);
      const noise = blueAt(h, false), radius = clamp(float(AO_R).mul(proj.element(1).y).mul(size.y.mul(0.5)).div(dist), 3, 160), thick = dist.mul(0.02).add(AO_THICK);
      const vis = float(0).toVar(), bent = vec3(0).toVar();
      for (let s = 0; s < 2; s++) {
        const phi = noise.x.add(s * 0.5).mul(Math.PI), dir = vec2(cos(phi), sin(phi)), dirV = vec3(dir.x, dir.y.negate(), 0);   // (screen y runs down, the view's up)
        const T = normalize(dirV.sub(V.mul(dirV.dot(V)))), axis = cross(V, T), np = n.sub(axis.mul(n.dot(axis))), npl = max(length(np), 1e-4);
        const gamma = acos(clamp(np.dot(V).div(npl), -1, 1)).mul(sign(np.dot(T)));   // the normal's angle in the slice, from the eye's way towards T
        const bits = uint(0).toVar();
        for (const side of [1, -1]) {
          Loop({ start: 0, end: AO_STEPS, type: 'int', name: 'k' }, ({ k }) => {
            const t = float(k).add(noise.y).div(AO_STEPS), q = p.add(dir.mul(side).mul(t.mul(t).mul(radius).add(1.5)));
            const dlt = viewAt(q, depthAt(q)).sub(v0), fb = vec2(normalize(dlt).dot(V), normalize(dlt.sub(V.mul(thick))).dot(V));
            const hz = clamp(acos(clamp(fb, -1, 1)).mul(side).sub(gamma).add(Math.PI / 2).div(Math.PI), 0, 1), lo = min(hz.x, hz.y), hi = max(hz.x, hz.y);
            const on = q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(size.x)).and(q.y.lessThan(size.y));   // (off the picture: nothing known there, nothing marked)
            const start = uint(lo.mul(32)).min(uint(31)), span = on.select(uint(ceil(hi.sub(lo).mul(32))), uint(0));
            bits.assign(bits.bitOr(span.greaterThan(uint(0)).select(uint(0xffffffff).shiftRight(uint(32).sub(span.min(uint(32)))).shiftLeft(start), uint(0))));
          });
        }
        // what is left of the slice: the sky's share, and its mean way (each free sector's middle, turned from the normal)
        const free = float(0).toVar(), way = vec3(0).toVar();
        Loop({ start: 0, end: 32, type: 'int', name: 'm' }, ({ m }) => {
          If(bits.shiftRight(uint(m)).bitAnd(uint(1)).equal(uint(0)), () => {
            const a = float(m).add(0.5).div(32).mul(Math.PI).sub(Math.PI / 2).add(gamma);
            free.addAssign(1); way.addAssign(V.mul(cos(a)).add(T.mul(sin(a))));
          });
        });
        vis.addAssign(free.div(32 * 2)); bent.addAssign(way);
      }
      // the bent normal back in the world, and the share of the sky
      const bw = normalize(viewInv.mul(vec4(normalize(bent.add(n.mul(0.001))), 0)).xyz);
      out.assign(bw.x.equal(bw.x).and(vis.equal(vis)).select(vec4(bw, clamp(vis, 0, 1)), vec4(0, 0, 0, 1)));   // (where the depth gave no normal: nothing known, the sky all there)
    });
    return out;
  })();
  const quads = [new THREE.QuadMesh(contact), new THREE.QuadMesh(aoMat)];
  let rt = null, half = null;
  return {
    /** After the prepass (its depth `depthTex`, w by h, through this camera, still shifted by its part of a pixel): the
        screen's light, for the colour pass. */
    run(depthTex, camera, w, h) {
      if (!rt || rt.width !== w || rt.height !== h) {
        rt?.dispose(); half?.dispose();
        rt = new THREE.RenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        half = new THREE.RenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
        note('the contact shadows and GTAO', w * h * 4 + Math.ceil(w / 2) * Math.ceil(h / 2) * 8, 0);
      }
      depth.value = depthTex; size.value.set(w, h);
      proj.value.copy(camera.projectionMatrix); unproj.value.copy(camera.projectionMatrix).invert(); view.value.copy(camera.matrixWorldInverse); viewInv.value.copy(camera.matrixWorld);
      const prev = renderer.getRenderTarget(), route = renderer.getRenderObjectFunction(); renderer.setRenderObjectFunction(null);
      mark('gtao'); renderer.setRenderTarget(half); quads[1].render(renderer); aoTex.value = half.texture;   // (GTAO first: the contact pass keeps its share)
      mark('contact'); renderer.setRenderTarget(rt); quads[0].render(renderer); mark(null);   // (whose passes these are, for a tool's timing: src/core/gpu.js)
      renderer.setRenderTarget(prev); renderer.setRenderObjectFunction(route);
      SCREEN.contact.value = rt.texture; SCREEN.on.value = 1;
    },
    /** Its targets (a tool's look at them). */
    targets: () => ({ contact: rt, ao: half }),
  };
}
