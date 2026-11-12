// Snow falling (world/snowfall.js): flakes in a box of air round the camera, one instanced draw. Each flake's place is
// hashed from its number and the time, wrapped into the box so the box follows the camera and never empties; it falls,
// drifts with the wind (uWind) and flutters; how many of them fall is uSnowFall (the weather panel's Snowfall row, a film
// shot's `snowfall`). Falling snow thickens the air a little (uWeather.z). Nothing is drawn while none falls.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uv, instanceIndex, varyingProperty, positionGeometry, cameraViewMatrix, cameraProjectionMatrix, sin, floor, max, length, smoothstep, If, Discard, uint } from 'three/tsl';
import FALL from '../../../world/snowfall.js';
import { U } from '../../core/uniforms.js';
import { rnd } from '../noise.nodes.js';
import { finish, skyLight, SNOW } from '../light.js';

const nameOf = (a) => FALL.names.filter(([at]) => a >= at).at(-1)[1];

function flakes(scene) {
  const N = FALL.flakes, B = FALL.box, g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1)); g.instanceCount = N;   // (an instanced geometry: a plain one draws one)
  const m = new THREE.NodeMaterial(); m.transparent = true; m.depthWrite = false;
  const i = instanceIndex.toInt(), vCol = varyingProperty('vec3', 'fCol'), r = (s) => rnd(i, i.mul(7).add(13), uint(s));
  // where it is now: hashed in the box, fallen and carried since the start, wrapped round the camera
  const world = Fn(() => {
    const t = U.uTime, w = U.uWind, speed = float(FALL.fall).mul(r(701).mul(0.6).add(0.7));
    const drift = vec3(w.x, 0, w.y).mul(w.z.mul(6).add(0.4)).mul(t);
    const flutter = vec3(sin(t.mul(1.3).add(r(702).mul(6.28))), 0, sin(t.mul(1.1).add(r(703).mul(6.28)))).mul(0.25);
    const p = vec3(r(704), r(705), r(706)).mul(B).add(drift).sub(vec3(0, speed.mul(t), 0)).add(flutter).sub(U.uCam);
    const q = p.add(B / 2); return q.sub(floor(q.div(B)).mul(B)).sub(B / 2).add(U.uCam);   // wrapped (floor, not mod: mod keeps the sign)
  })();
  const size = float(FALL.size[0]).add(r(707).mul(FALL.size[1] - FALL.size[0]));
  m.vertexNode = Fn(() => {
    const out = vec4(2, 2, 2, 1).toVar();   // off screen: past the share that falls
    If(float(i).lessThan(U.uSnowFall.mul(N)), () => {
      vCol.assign(finish(SNOW.mul(skyLight(vec3(0, 1, 0)).add(U.uSun.mul(0.4))), world).rgb);   // a flake's light and haze, once per flake: its pixels only draw its dot
      const v = cameraViewMatrix.mul(vec4(world, 1));
      const s = max(size, v.z.negate().mul(0.0035)).min(v.z.negate().mul(0.05));   // (and never a blot over the lens)   // never smaller than a pixel or two: far flakes are specks, not nothing
      out.assign(cameraProjectionMatrix.mul(vec4(v.xy.add(positionGeometry.xy.mul(s)), v.z, 1)));
    });
    return out;
  })();
  m.fragmentNode = Fn(() => {
    const a = smoothstep(0.5, 0.15, length(uv().sub(0.5)));
    If(a.lessThan(0.02), () => { Discard(); });
    return vec4(vCol, a.mul(0.9));
  })();
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false; scene.add(mesh);
  return mesh;
}

/** A weather condition (src/world/weather/index.js): how much snow falls, 0 none … 1 heavy; its flakes round the camera. */
export default {
  id: 'snowfall', label: 'Snowfall', order: 30, range: [0, 1, 0.01], start: 0,
  read: nameOf,
  init: ({ scene }) => ({ mesh: flakes(scene) }),
  apply(a, { mesh }) { U.uSnowFall.value = a; mesh.visible = a > 0.005; U.uWeather.value.z = a * FALL.haze; },   // falling snow thickens the air a little
};
