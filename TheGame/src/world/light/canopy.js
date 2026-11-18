// The canopy map and the sky probes (intent 0038, stage 9): how much of the sky a point in the stand sees, and how much
// of the sun reaches into it, from the crowns and the shrubs drawn from above (Wronski's World AO, GDC 2014; Ghost of
// Tsushima's sky visibility, Patry 2021).
//
//   the map     what casts (layer CASTS, by its shadow twins: depth and cut-out, src/core/pass.js) drawn straight down
//               from above and straight up from below, SIDE metres round the eye, into one depth atlas of two squares:
//               its top and its underside, every texel 37.5 cm (19 cm with ?light=full, whose rays need it). A crown is
//               the slab between them; its gaps are gaps. Made again every EVERY frames, a view a frame
//   the probes  every metre over the map, a probe at three heights over the ground (0.5, 4 and 12 m): the share of
//               its sky its crowns leave it. Nine columns round it (the middle one most), each
//               letting through as much as the slab above the probe is thin; with ?light=full (stage 9b, src/core/
//               flags.js) the share of its sky (cosine-weighted, as a surface facing up takes it) that rays from it
//               reach unhindered, twelve rays a probe, each stepped six times through the slab out to 24 m. Its fourth
//               number is the ground's height there. Worked out from each new map in BANDS bands of their rows, a band
//               a frame, so no frame carries all of it (stage 9's, all at once: 5.2 ms on the Mac mini every eighth
//               frame); the map and the probes are each a pair, the materials reading one while the other is made
//
// A surface reads its probe (skyAt: one read, its three heights blended by its own over the ground); with ?light=full
// the froxels' air reads the map for a coarse sun through the crowns (sunThrough). Beyond the map, the sky is all there.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, ivec2, uniform, texture, screenCoordinate, Loop, If, clamp, mix, smoothstep, sqrt, cos, sin, fract, dot, exp, max } from 'three/tsl';
import { U } from '../../core/uniforms.js';
import { LIGHT_FULL } from '../../core/flags.js';
import { castRoute, CASTS } from '../shadow.js';
import { note, mark } from '../../core/gpu.js';

// metres a side; texels a side; probes a side (one a metre); frames between drawings (the stand does not move: what
// changes is where the eye is, and the map reaches 96 m round it); how far above (and below) the cameras stand
const SIDE = 192, S = LIGHT_FULL ? 1024 : 512, P = 192, EVERY = 16, UP = 400;
const BANDS = 8, ROWS = P / BANDS;   // the probes' bands, one a frame after the map's two views (frames 2 … 9 of EVERY)
const HEIGHTS = [0.5, 4, 12];
// the probes' nine columns (m east, m south, weight): the one over it, four 4 m out, four 8 m out on the diagonals; and how
// much of the sky a metre of slab above takes
const COLUMNS = [[0, 0, 2], [4, 0, 1.5], [-4, 0, 1.5], [0, 4, 1.5], [0, -4, 1.5], [6, 6, 1], [-6, 6, 1], [6, -6, 1], [-6, -6, 1]], WSUM = COLUMNS.reduce((a, c) => a + c[2], 0), THICK = 0.35;

const black = Object.assign(new THREE.DataTexture(new Uint16Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType), { needsUpdate: true });
/** The canopy's numbers for the materials: its probes and where they lie (x, z of their middle, side, their ground's
    reference height); its map and where it lies, and its cameras' heights (over, under, their depth's range); whether
    it is there. */
export const CANOPY = {
  probes: texture(black), at: uniform(new THREE.Vector4(0, 0, SIDE, 0)),
  map: texture(new THREE.DepthTexture(1, 1)), mapAt: uniform(new THREE.Vector4(0, 0, SIDE, 0)), cams: uniform(new THREE.Vector3(UP, -UP, 2 * UP)), on: uniform(0),
};

const uvIn = (w, at) => w.xz.sub(at.xy).div(at.z).add(0.5);
const inside = (uv) => smoothstep(0, 0.08, uv.x).mul(smoothstep(0, 0.08, uv.y)).mul(smoothstep(1, 0.92, uv.x)).mul(smoothstep(1, 0.92, uv.y));
// the slab at a point of the map: its top (seen from above) and its underside (from below: a mirror image, its rows the
// other way), world heights. Where nothing was drawn, a top far below and an underside far above: nothing between
const slabAt = (uv) => {
  const t = ivec2(clamp(uv, 0, 0.9999).mul(S));
  const top = CANOPY.cams.x.sub(float(CANOPY.map.load(t)).mul(CANOPY.cams.z));
  const under = CANOPY.cams.y.add(float(CANOPY.map.load(ivec2(t.x.add(S), t.y.negate().add(S - 1)))).mul(CANOPY.cams.z));
  return { top, under };
};
const between = (p, uv) => { const s = slabAt(uv); return p.y.greaterThan(s.under).and(p.y.lessThan(s.top)).and(uv.x.greaterThan(0)).and(uv.y.greaterThan(0)).and(uv.x.lessThan(1)).and(uv.y.lessThan(1)); };

/** The share of the sky a point at w sees past the crowns (1: all of it), from its probe. In any stage. */
export const skyAt = (w) => {
  const uv = uvIn(w, CANOPY.at), P4 = CANOPY.probes.sample(uv).level(0), h = w.y.sub(P4.w.add(CANOPY.at.w));
  const v = mix(mix(P4.x, P4.y, smoothstep(HEIGHTS[0], HEIGHTS[1], h)), mix(P4.z, float(1), smoothstep(HEIGHTS[2], HEIGHTS[2] + 10, h)), smoothstep(HEIGHTS[1], HEIGHTS[2], h));
  return mix(float(1), v, inside(uv).mul(CANOPY.on));
};
/** The share of the sun that comes down through the crowns to w, coarsely (the froxels' air: src/world/light/air.js):
    six steps towards the sun through the slab, each a crown's 85 %. */
export const sunThrough = (w) => {
  const k = float(1).toVar();
  If(CANOPY.on.greaterThan(0.5), () => {
    Loop({ start: 0, end: 6, type: 'int', name: 's' }, ({ s }) => {
      const t = float(s).add(0.5), p = w.add(U.uSunDir.mul(t.mul(t).mul(0.9))), uv = uvIn(p, CANOPY.mapAt);
      If(between(p, uv), () => { k.mulAssign(0.15); });
    });
  });
  return k;
};

/** groundAt: the ground's height at a point, as a node (src/world/land.nodes.js: handed in, so this file, which the one
    light imports, does not pull in the land's) */
export function createCanopy(renderer, { groundAt }) {
  if (!renderer.backend?.isWebGPUBackend) return null;   // (the WebGL 2 fallback: no canopy, all the sky)
  const atlas = () => { const rt = new THREE.RenderTarget(2 * S, S, { count: 0, depthBuffer: true }); rt.depthTexture = new THREE.DepthTexture(2 * S, S); rt.depthTexture.type = THREE.FloatType; return rt; };
  const target = () => new THREE.RenderTarget(P, P, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const maps = [atlas(), atlas()], probes = [target(), target()];   // (each a pair: the one the materials read, the one being made)
  note('the canopy map and its probes', 2 * (2 * S * S * 4 + P * P * 8), 0);
  // the cameras: straight down from above, straight up from below (both with north at the top of their picture)
  const cam = (down) => { const c = new THREE.OrthographicCamera(-SIDE / 2, SIDE / 2, SIDE / 2, -SIDE / 2, 0, 2 * UP); c.layers.set(CASTS); c.up.set(0, 0, down ? -1 : 1); c.userData.shadow = true; return c; };   // (shadow: what is drawn keeps the levels the eye chose, src/detail/index.js)
  const cams = [cam(true), cam(false)], route = castRoute(renderer);
  // the probes: three heights over the ground at each; the slab above nine columns round it, or with ?light=full twelve rays
  // each, six steps a ray
  const probeMat = new THREE.NodeMaterial();
  probeMat.fragmentNode = LIGHT_FULL ? Fn(() => {
    const uv = screenCoordinate.xy.div(P), xz = CANOPY.mapAt.xy.add(uv.sub(0.5).mul(CANOPY.mapAt.z)), g = groundAt(xz, float(0));
    const turn = fract(sin(dot(xz, vec2(12.9898, 78.233))).mul(43758.5453)).mul(Math.PI * 2);
    const seen = HEIGHTS.map((h) => {
      const n = float(0).toVar(), o = vec3(xz.x, g.add(h), xz.y);
      Loop({ start: 0, end: 12, type: 'int', name: 'r' }, ({ r }) => {
        const k = sqrt(float(r).add(0.5).div(12)), a = float(r).mul(2.399963).add(turn), d = vec3(k.mul(cos(a)), sqrt(float(1).sub(k.mul(k))), k.mul(sin(a))), free = float(1).toVar();
        Loop({ start: 0, end: 6, type: 'int', name: 'j' }, ({ j }) => { const t = float(j).add(1), p = o.add(d.mul(t.mul(t).mul(0.66))); If(between(p, uvIn(p, CANOPY.mapAt)), () => { free.assign(0); }); });
        n.addAssign(free);
      });
      return n.div(12);
    });
    return vec4(seen[0], seen[1], seen[2], g.sub(CANOPY.mapAt.w));
  })() : Fn(() => {
    const uv = screenCoordinate.xy.div(P), xz = CANOPY.mapAt.xy.add(uv.sub(0.5).mul(CANOPY.mapAt.z)), g = groundAt(xz, float(0));
    const seen = HEIGHTS.map(() => float(0).toVar());
    for (const [dx, dz, w] of COLUMNS) {
      const q = xz.add(vec2(dx, dz)), s = slabAt(uvIn(vec3(q.x, 0, q.y), CANOPY.mapAt));   // (where nothing was drawn its top lies under its underside: no slab)
      HEIGHTS.forEach((h, k) => { seen[k].addAssign(exp(max(s.top.sub(max(g.add(h), s.under)), 0).mul(-THICK)).mul(w / WSUM)); });
    }
    return vec4(seen[0], seen[1], seen[2], g.sub(CANOPY.mapAt.w));
  })();
  const quad = new THREE.QuadMesh(probeMat), at = new THREE.Vector4();   // (at: where the map being made lies, and its ground's height)
  let frame = 0, front = 0;   // (which of each pair the materials read)
  return {
    /** Before the frame, every EVERY frames: the map made round where the camera stands (its view from above in one
        frame, from below in the next), then its probes a band a frame, then both pairs turned. The first time, all at
        once. */
    render(scene, camera, groundY) {
      const k = frame++ % EVERY, first = !CANOPY.on.value;
      if (!first && k > 1 + BANDS) return;
      const prev = renderer.getRenderTarget(), ac = renderer.autoClear, route0 = renderer.getRenderObjectFunction(), back = first ? front : 1 - front;
      if (first || k <= 1) {
        mark('canopy');   // (whose passes these are, for a tool's timing: src/core/gpu.js)
        if (first || k === 0) { const step = (8 * SIDE) / S; at.set(Math.round(camera.position.x / step) * step, Math.round(camera.position.z / step) * step, SIDE, groundY); }
        const rt = maps[back];
        renderer.setRenderTarget(rt); renderer.setRenderObjectFunction(route);
        for (const i of first ? [0, 1] : [k]) {
          const c = cams[i]; c.position.set(at.x, at.w + (i ? -UP : UP), at.y); c.lookAt(at.x, at.w, at.y); c.updateMatrixWorld();
          rt.viewport.set(i * S, 0, S, S); rt.scissor.set(i * S, 0, S, S); rt.scissorTest = true;
          renderer.autoClear = i === 0; renderer.render(scene, c);   // (the whole atlas cleared with the first)
        }
        rt.viewport.set(0, 0, 2 * S, S); rt.scissorTest = false;
        // (once both views are in: what the probes are made from, and what the froxels' shafts read: sunThrough)
        if (first || k === 1) { CANOPY.mapAt.value.copy(at); CANOPY.cams.value.set(at.w + UP, at.w - UP, 2 * UP); CANOPY.map.value = rt.depthTexture; }
      }
      if (first || k >= 2) {
        mark('probes'); renderer.setRenderObjectFunction(null); renderer.autoClear = false;   // (each band writes its own rows: nothing cleared)
        const to = probes[back], b0 = first ? 0 : k - 2, n = first ? BANDS : 1;
        to.viewport.set(0, b0 * ROWS, P, n * ROWS); to.scissor.set(0, b0 * ROWS, P, n * ROWS); to.scissorTest = true;
        renderer.setRenderTarget(to); quad.render(renderer);
        to.viewport.set(0, 0, P, P); to.scissorTest = false;
        if (first || k === 1 + BANDS) { front = back; CANOPY.at.value.copy(CANOPY.mapAt.value); CANOPY.probes.value = to.texture; CANOPY.on.value = 1; }
        if (first) frame = 2 + BANDS;   // (and the next made from the next EVERY frames on, not half of one)
      }
      mark(null); renderer.setRenderObjectFunction(route0); renderer.autoClear = ac; renderer.setRenderTarget(prev);
    },
  };
}
