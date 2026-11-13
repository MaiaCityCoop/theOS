// The clouds (world/clouds.js): a layer of cumulus from CLOUDS.height up, each cloud a body as tall as it is dense, a
// field that drifts with the wind, covering as much of the sky as its value says. All that is the clouds' own is here: their field, their shadow on all below (a small
// map drawn once a frame, read by every surface through the light's contract: cloudShade), and how the sky's dome draws
// them (its `sky`), or, from above their layer, every surface below (its `air`). A weather condition (index.js): the panel
// sets the cover; a film may set it per shot.
import * as THREE from 'three/webgpu';
import { Fn, Loop, float, vec2, vec3, vec4, uv, positionGeometry, If, mix, exp, pow, max, min, log2, clamp, smoothstep } from 'three/tsl';
import CLOUDS from '../../../world/clouds.js';
import { U } from '../../core/uniforms.js';
import { tile } from '../tile.js';

const nameOf = (c) => CLOUDS.names.filter(([at]) => c >= at).at(-1)[1];
const billows = (at) => tile('billows', at);   // the baked field they are painted from

/** how high the layer lies, metres */
export const CLOUD_H = CLOUDS.height;
// where on the baked tile a point of the layer reads, twice: the tile repeats, so a slow push that does not repeat (value
// noise) moves each part of it differently, by up to most of a tile, and the second take is turned and scaled by an
// irrational ratio; mixed, no two stretches of sky alike. And the cover itself swells and thins over tens of kilometres.
const cloudUV = (xz) => {
  // (the push and the swell read the tile itself, from a tiny mip, at scales that are not a whole number of tiles: they
  // repeat at another period than the tile, so together they never do; a fetch from a tiny mip costs next to nothing)
  const p = xz.add(U.uCloudOff).div(CLOUDS.size), slow = billows(p.mul(0.29).add(0.71)).level(7);
  const off = slow.rg.sub(0.5).mul(3.2);
  const b = vec2(p.x.mul(0.786).sub(p.y.mul(0.618)), p.x.mul(0.618).add(p.y.mul(0.786))).mul(1.414).add(off.yx).add(0.37);
  return { p, a: p.add(off), b, region: billows(p.mul(0.11).add(3.1)).level(8).r.sub(0.5).mul(0.25), high: slow.b };   // (high: 0 … 1, how much higher their feet lie here)
};
// (the painted field, two takes mixed, is soft: stretched to the full range)
const cover = (n, soft) => { const th = mix(0.8, 0, U.uClouds); return smoothstep(th.sub(soft[0]), th.add(soft[1]), n.sub(0.5).mul(2.9).add(0.5)); };
/** The field at a point of the layer, 0 clear … 1 cloud. detail: its finer octaves, for the sky up close; a shadow needs none. */
export const cloudField = (xz, detail = false) => {
  const C = cloudUV(xz);
  let n = mix(billows(C.a).r, billows(C.b).r, 0.45).add(C.region);
  if (detail) n = n.add(billows(C.a.mul(3.7).add(0.31)).g.sub(0.5).mul(0.12));   // close up, the billows fray the edge (a little: more breaks a cloud into flecks)
  return cover(n, [0.14, 0.26]);
};
/** the clouds' shadow at a point q of their layer (1: none): the field from a small mip of the tile, a shadow being soft and
    wide; what the shadow map below is drawn from */
export const cloudLayerShade = (q) => {
  const C = cloudUV(q), n = mix(billows(C.a).level(4).r, billows(C.b).level(4).r, 0.45).add(C.region);
  return float(1).sub(cover(n, [0.14, 0.24]).mul(0.9));
};
/** the clouds' shadow at w: the layer looked up along the way to the sun, read from the map drawn this frame round the
    camera (uCloudMap: its corner, its size; one fetch); beyond it the clouds' mean */
export const cloudShade = Fn(([w]) => {
  const r = float(1).toVar();
  If(U.uClouds.greaterThan(0.005), () => {   // only while there are clouds
    const s = U.uSunDir, k = float(CLOUD_H).sub(w.y).div(max(s.y, 0.08)), m = w.xz.add(s.xz.mul(k)).sub(U.uCloudMap.xy).div(U.uCloudMap.z);
    const inside = m.x.greaterThan(0).and(m.y.greaterThan(0)).and(m.x.lessThan(1)).and(m.y.lessThan(1));
    r.assign(inside.select(U.tCloudMap.sample(m).level(0).r, float(1).sub(U.uClouds.mul(0.45))));
  });
  return r;
});

// their shadow, drawn once a frame into a small map (256 texels over 6 km) of their layer round the point above the
// camera the sun looks through; every surface then reads its cloud shadow with one fetch (cloudShade) instead of working
// the field out for each of its pixels
const N = 256, SIZE = 6000, TEXEL = SIZE / N;
function shadowMap(renderer) {
  const rt = new THREE.RenderTarget(N, N, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  const mat = new THREE.NodeMaterial(); mat.vertexNode = vec4(positionGeometry.xy, 0, 1); mat.depthTest = mat.depthWrite = false;
  // the texel's point on the layer; three's node reads turn a target's rows the other way up, so the writer turns them too
  const q = U.uCloudMap.xy.add(vec2(uv().x, float(1).sub(uv().y)).mul(U.uCloudMap.z));
  mat.colorNode = vec4(vec3(cloudLayerShade(q)), 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false;
  U.tCloudMap.value = rt.texture;
  return {
    rt,
    /** Draw this frame's map: centred where the sun's line from the ground under the camera meets the layer. */
    render(camera, groundY) {
      if (U.uClouds.value < 0.005) return;   // no clouds: nothing reads it
      const s = U.uSunDir.value, k = (CLOUD_H - groundY) / Math.max(s.y, 0.08);
      const cx = Math.round((camera.position.x + s.x * k) / TEXEL) * TEXEL, cz = Math.round((camera.position.z + s.z * k) / TEXEL) * TEXEL;
      U.uCloudMap.value.set(cx - SIZE / 2, cz - SIZE / 2, SIZE);
      const was = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(quad, cam); renderer.setRenderTarget(was);
    },
  };
}

/** A weather condition (index.js): the cover, 0 clear … 1 overcast. */
export default {
  id: 'clouds', label: 'Clouds', order: 40, range: [0, 1, 0.01], start: CLOUDS.cover,
  read: nameOf,
  init: ({ renderer }) => ({ map: shadowMap(renderer) }),
  apply(c) { U.uClouds.value = c; },
  update(dt) {   // drift with the wind (uWind: its way, its strength)
    const w = U.uWind.value, v = CLOUDS.drift.calm + (CLOUDS.drift.storm - CLOUDS.drift.calm) * w.z;
    U.uCloudOff.value.x -= w.x * v * dt; U.uCloudOff.value.y -= w.y * v * dt;   // the field moves with the wind: its sampling point against it
  },
  before(camera, groundY, c, { map }) { map.render(camera, groundY); },
  // seen from above their layer the clouds lie between the eye and the land: where the line of sight to a point crosses
  // the layer, as much cloud as the field holds there (from a small mip: soft, and readable in a vertex stage too), its
  // top white in the sun; thin just over the layer, whole from a few hundred metres up
  air({ eye, w }) {
    const a = float(0).toVar(), col = vec3(0).toVar();
    If(U.uClouds.greaterThan(0.005).and(eye.y.greaterThan(CLOUD_H)).and(w.y.lessThan(CLOUD_H)), () => {
      const C = cloudUV(mix(eye.xz, w.xz, eye.y.sub(CLOUD_H).div(eye.y.sub(w.y))));
      // (its billows fray the edge, as in the sky; its heaps brightest, its thin edges greyer and half see-through)
      const d = cover(mix(billows(C.a).level(2).r, billows(C.b).level(2).r, 0.45).add(C.region).add(billows(C.a.mul(3.7).add(0.31)).level(2).g.sub(0.5).mul(0.14)), [0.14, 0.3]);
      a.assign(smoothstep(0.02, 0.7, d).mul(0.96).mul(smoothstep(0, 250, eye.y.sub(CLOUD_H))));
      col.assign(U.uAmb.mul(mix(0.8, 1.05, d)).add(U.uSun.mul(mix(0.5, 0.95, smoothstep(0.15, 0.95, d)))));
    });
    return { a, col };
  },
  // in the sky's dome (src/world/sky.js), over the sun, the moon and the stars. The clouds are bodies: each stands on a
  // foot (higher in some parts of the sky than in others) and rises as far as it is dense: a thin shred lies flat, a
  // dense heap towers (CLOUDS.thick). The view's ray is walked through their layer from its foot to its top in a few
  // steps; at each, how much cloud there is at that height, what light reaches it (its tops in the sun, its depths
  // and what lies under a heap in their shade, the side turned to the sun brighter than the other), and how much of
  // what lies behind still shows. So a cloud has a lit top, a grey belly and a flank, and hides what is behind it.
  skyOrder: 40,
  sky({ v, y, s, col, horizon }) {
    If(U.uClouds.greaterThan(0.005).and(y.greaterThan(-0.02)).and(U.uCam.y.lessThan(CLOUD_H - 20)), () => {   // (none to work out on a clear sky, below the horizon, or from above their layer)
      const N = CLOUDS.steps, yy = max(y, 0.015), t00 = float(CLOUD_H).sub(U.uCam.y).div(yy), xz00 = U.uCam.xz.add(v.xz.mul(t00));
      // the field's slow parts once, where the ray meets the layer's lowest foot; the foot here, and the ray's way through
      const C = cloudUV(xz00), foot = float(CLOUD_H).mul(C.high.mul(CLOUDS.lift).add(1)), t = foot.sub(U.uCam.y).div(yy), span = float(CLOUDS.thick).div(yy);
      const d0 = v.xz.mul(t.sub(t00)).div(CLOUDS.size), dA = v.xz.mul(span).div(CLOUDS.size).div(N), rot = (q) => vec2(q.x.mul(0.786).sub(q.y.mul(0.618)), q.x.mul(0.618).add(q.y.mul(0.786))).mul(1.414);
      const a0 = C.a.add(d0), b0 = C.b.add(rot(d0)), dB = rot(dA);
      // (how coarse a read may be: a pixel's width up there, more along the ray where it grazes the layer)
      const lod = clamp(log2(t.div(U.uPxK).div(yy).div(CLOUDS.size).mul(1024)), 0, 7);
      const at = (ua, ub) => cover(mix(billows(ua).level(lod).r, billows(ub).level(lod).r, 0.45).add(C.region).add(fray), [0.14, 0.26]);
      const mid = N * 0.35, fray = billows(a0.add(dA.mul(mid)).mul(3.7).add(0.31)).level(lod).g.sub(0.5).mul(0.12);   // (their frayed edge, once a ray)
      // the side turned to the sun: more cloud a little way towards it than here, and this side is the shaded one
      const sun = U.uSunDir.xz.mul(170 / CLOUDS.size), here = at(a0.add(dA.mul(mid)), b0.add(dB.mul(mid))), there = at(a0.add(dA.mul(mid)).add(sun), b0.add(dB.mul(mid)).add(rot(sun)));
      const flank = clamp(here.sub(there).mul(2.6).add(0.5), 0, 1);
      // how much cloud stands between these and the sun: the clouds' shadow map where it reaches (one fetch)
      // (the map fading out towards its edge: a straight line across the sky showed where it ended)
      const m = xz00.add(U.uSunDir.xz.mul(700)).sub(U.uCloudMap.xy).div(U.uCloudMap.z), mc = clamp(m, 0, 1), edge = smoothstep(0, 0.1, mc).mul(smoothstep(1, 0.9, mc));
      const toward = mix(here, float(1).sub(U.tCloudMap.sample(mc).level(0).r).div(0.9), edge.x.mul(edge.y));
      // (higher up a cloud leans with the wind and its billows stand out further: the field is read a little aside and with
      // a finer take whose place changes with the height, so a heap's flank is not its foot's outline drawn upwards)
      const lean = U.uWind.xy.mul(U.uWind.z.mul(0.5).add(0.25)).mul(260 / CLOUDS.size);
      const T = float(1).toVar(), L = vec3(0).toVar(), dense = min(float(1).div(yy), 5).mul(5 / N);
      Loop(N, ({ i }) => {
        const k = float(i).add(0.5), h = k.div(N), ua = a0.add(dA.mul(k)).add(lean.mul(h)), puff = billows(ua.mul(2.3).add(vec2(h.mul(0.41), h.mul(0.23)))).level(max(lod.sub(1), 0)).b.sub(0.5).mul(h.mul(0.3).add(0.06));
        const d = clamp(at(ua, b0.add(dB.mul(k)).add(rot(lean.mul(h)))).add(puff), 0, 1);
        // only what is dense reaches high: a shred ends at its foot, a heap's core at the layer's top
        const body = d.sub(pow(h, 1.15).mul(0.86)), rho = smoothstep(0, 0.3, body);
        If(rho.greaterThan(0.002), () => {
          const a = float(1).sub(exp(rho.mul(dense).negate()));
          // its light: more the higher in the cloud, less the deeper under its own top; the sun's by its flank and by what stands before it
          const deep = clamp(body.mul(1.6), 0, 1).mul(float(1).sub(h)), lit = mix(0.34, 1.12, h).mul(mix(1, 0.5, deep)).mul(mix(0.5, 1.18, flank)).mul(mix(1, 0.4, toward.mul(float(1).sub(h.mul(0.6)))));
          L.addAssign(U.uAmb.mul(mix(0.6, 1.12, h)).add(U.uSun.mul(lit).mul(0.82)).mul(T.mul(a)));
          T.mulAssign(float(1).sub(a));
        });
      });
      const A = float(1).sub(T), rim = U.uSun.mul(pow(s, 6).mul(A.mul(float(1).sub(A)).mul(3.2)));
      const far = float(1).sub(exp(t.negate().div(26000)));
      const cc = mix(L.div(max(A, 1e-3)).add(rim), horizon, far.mul(0.85));
      col.assign(mix(col, cc, A.mul(smoothstep(0, 0.05, y)).mul(float(1).sub(far.mul(0.55)))));
    });
  },
};
