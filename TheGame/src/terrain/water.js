// The river's water (node code): on the terrain's grid (the nodes near the river only), its surface flat at the valley's
// floor less the drop; its look from the bed's depth under it: clear over a bar, dark under a cut bank; running along the
// river's flow, two takes half a cycle apart cross-faded, so it runs and never stretches.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, varying, attribute, abs, max, min, clamp, mix, smoothstep, length, normalize, pow, fract, sqrt, If, Discard } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { riverInfo, riverRaw, riverCarve, riverBank, baseB, WATER_DROP_N } from '../world/land.nodes.js';
import { finish, cloudAt } from '../world/light.js';
import { gridPoint, GRID } from './material.js';
import { WATER } from '../world/biomes.js';

const water = WATER, v3 = (c) => vec3(c[0], c[1], c[2]);

export function waterMaterial(tex) {
  const wp = gridPoint();
  const I = riverInfo(wp);   // (signed distance, half-width, bank side)
  const world = vec3(wp.x, baseB(wp).sub(WATER_DROP_N), wp.y);
  const vWorld = varying(world), vI = varying(I), vG = varying(riverRaw(wp).yz);   // the river's field's gradient: the flow is along it, turned a quarter

  const frag = Fn(() => {
    const d = abs(vI.x), w = vI.y, b = vI.z;
    If(d.greaterThan(w.mul(1.5)), () => { Discard(); });
    const p = vWorld.xz;
    const depth = riverCarve(d, w, b).sub(riverBank(d, w, b)).sub(WATER_DROP_N);
    const fl = normalize(vec2(vG.y.negate(), vG.x).add(1e-9));
    const mid = clamp(float(1).sub(d.div(w)), 0, 1), speed = sqrt(mid).mul(0.9).add(0.25);
    const t = U.uTime.mul(0.3), f1 = fract(t), f2 = fract(t.add(0.5)), wb = abs(f1.mul(2).sub(1));
    // the surface runs with the river, and the wind drags it its own way: the harder it blows, the more its ripples go with the wind
    const drift = fl.mul(speed).add(U.uWind.xy.mul(U.uWind.z.mul(0.9)));
    const o1 = drift.mul(f1.sub(0.5)).mul(3.3), o2 = drift.mul(f2.sub(0.5)).mul(3.3);
    const uA = p.sub(o1).div(water.floor.tile[0]), uB = p.sub(o2).div(water.floor.tile[0]).add(0.43);
    const nA = tex.n(water.floor.material, uA).xyz.add(tex.n(water.floor.material, uA.mul(3.1).add(0.2)).xyz).sub(1), nB = tex.n(water.floor.material, uB).xyz.add(tex.n(water.floor.material, uB.mul(3.1).add(0.6)).xyz).sub(1);
    const nn = mix(nA.xy, nB.xy, wb), rough = mid.mul(0.3).add(0.16).add(U.uWind.z.mul(U.uWind.z).mul(0.55));   // the wind roughens it: a storm breaks the reflections up
    const n = normalize(vec3(nn.x.mul(rough), 1, nn.y.mul(rough)));
    const V = normalize(U.uCam.sub(vWorld));
    const fres = pow(float(1).sub(max(n.dot(V), 0)), 5).mul(0.98).add(0.02);
    const ftex = mix(tex.a(water.floor.material, uA.mul(2)).r, tex.a(water.floor.material, uB.mul(2)).r, wb);
    const foam = float(1).sub(smoothstep(0, 0.04, depth)).mul(smoothstep(0.3, 0.7, ftex)).mul(0.35);   // a thin lace where it runs shallow over the bank, nothing on open water
    const body = mix(v3(water.colours.shallow), v3(water.colours.deep), clamp(depth.mul(1.1), 0, 1));
    const skyRef = mix(U.uSky, vec3(U.uSky.dot(vec3(0.333))), 0.4).mul(0.92);
    const sunC = U.uSun.mul(cloudAt(vWorld));
    const H = normalize(V.add(U.uSunDir)), wd = length(U.uCam.sub(vWorld));
    const spec = pow(max(n.dot(H), 0), 350).mul(2.5).add(pow(max(n.dot(H), 0), 30).mul(0.22).mul(smoothstep(40, 300, wd)));
    const col0 = mix(body.mul(U.uAmb.add(sunC.mul(0.45))), skyRef, clamp(fres.mul(0.9).add(smoothstep(40, 400, wd).mul(0.12)), 0, 1)).add(sunC.mul(spec));
    const col1 = mix(col0, vec3(0.8).mul(U.uAmb.add(sunC.mul(0.5))), foam);
    const a0 = clamp(depth.mul(1.1).add(0.2), 0, 0.93);
    const a = max(max(a0, fres.mul(0.75)), foam).mul(smoothstep(-0.04, 0.02, depth));
    return vec4(finish(col1, vWorld).rgb, a);
  });

  const m = new THREE.NodeMaterial();
  // far off, a grid cell is wider than the river: the ground between its corners stands over the water in blocks. So the
  // surface is drawn pulled towards the eye by up to half a cell (none near by), and wins; its outline is the river's own
  // distance, smooth across the cell (the fragment's discard), not the ground's corners
  const cell = attribute('aNode', 'vec4').z.div(GRID), toEye = U.uCam.sub(world);
  const lift = smoothstep(4, 24, cell).mul(min(cell.mul(0.5), length(toEye).mul(0.04)));
  m.positionNode = world.add(normalize(toEye).mul(lift)); m.fragmentNode = frag();
  m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;   // far off the depth buffer cannot tell water from its bed: the water wins
  return m;
}
