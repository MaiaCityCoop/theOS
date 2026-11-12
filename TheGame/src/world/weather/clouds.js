// The clouds (world/clouds.js): one layer at CLOUDS.height, a field of cumulus that drifts with the wind, covering as much
// of the sky as its value says. All that is the clouds' own is here: their field, their shadow on all below (a small
// map drawn once a frame, read by every surface through the light's contract: cloudShade), and how the sky's dome draws
// them (its `sky`). A weather condition (index.js): the panel sets the cover; a film may set it per shot.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uv, positionGeometry, If, mix, exp, pow, max, smoothstep } from 'three/tsl';
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
  return { p, a: p.add(off), b, region: billows(p.mul(0.11).add(3.1)).level(8).r.sub(0.5).mul(0.25) };
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
  // in the sky's dome (src/world/sky.js), over the sun, the moon and the stars: the view's ray up to their layer; lit from
  // the sun's side, darker where they are thick and where more cloud stands between them and the sun, a bright rim near
  // the sun; thinning into the haze towards the horizon
  skyOrder: 40,
  sky({ v, y, s, col, horizon }) {
    If(U.uClouds.greaterThan(0.005).and(y.greaterThan(-0.02)).and(U.uCam.y.lessThan(CLOUD_H - 20)), () => {   // (none to work out on a clear sky, below the horizon, or from above their layer)
      const t = float(CLOUD_H).sub(U.uCam.y).div(max(y, 0.015)), xz = U.uCam.xz.add(v.xz.mul(t));
      // how much cloud stands between this one and the sun: read from the clouds' shadow map where it reaches (one fetch:
      // its value is the light that comes through), else this cloud's own thickness
      const d = cloudField(xz, true), m = xz.add(U.uSunDir.xz.mul(700)).sub(U.uCloudMap.xy).div(U.uCloudMap.z);
      const inMap = m.x.greaterThan(0).and(m.y.greaterThan(0)).and(m.x.lessThan(1)).and(m.y.lessThan(1));
      const toward = inMap.select(float(1).sub(U.tCloudMap.sample(m).level(0).r).div(0.9), d);
      const thick = smoothstep(0.25, 1, d), lit = mix(1, 0.25, thick.mul(0.6).add(toward.mul(0.4)));   // seen from below: grey where deep, bright at the thin edges
      const rim = U.uSun.mul(pow(s, 6).mul(d.mul(float(1).sub(d)).mul(3.2)));
      const far = float(1).sub(exp(t.negate().div(26000)));
      const cc = mix(U.uAmb.mul(mix(1.1, 0.62, thick)).add(U.uSun.mul(lit).mul(0.8)).add(rim), horizon, far.mul(0.85));
      col.assign(mix(col, cc, smoothstep(0.03, 0.55, d).mul(smoothstep(0, 0.05, y)).mul(float(1).sub(far.mul(0.55)))));
    });
  },
};
