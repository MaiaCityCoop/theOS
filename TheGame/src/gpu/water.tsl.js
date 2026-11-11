// The river's water in TSL (intent 0008, step 2): water.glsl.js as a node material, on the same grid as the terrain
// (nodes near the river only), its surface flat at the valley's floor less the drop, its look from the bed's depth.
import * as THREE from 'three/webgpu';
import { Fn, float, int, vec2, vec3, vec4, uniform, attribute, positionGeometry, varying, texture, abs, max, min, clamp, mix, smoothstep, length, normalize, pow, fract, exp2, sqrt, floor, uint, If, Discard } from 'three/tsl';
import { L, camDist, riverInfo, riverRaw, riverCarve, riverBank, baseB, rnd, WATER_DROP_N } from './land.tsl.js';
import { LIGHT, haze, toScreen, GRID, R0 } from './terrain.tsl.js';
import { BIOME } from '../../biomes/index.js';

const water = BIOME.river, v3 = (c) => vec3(c[0], c[1], c[2]);
export const WATER = { time: uniform(0), sky: uniform(new THREE.Vector3(0.4, 0.55, 0.7)) };

export function waterMaterial(tex) {
  const node = attribute('aNode', 'vec4'), g = positionGeometry.xz;
  const cell = node.z.div(GRID), rng = exp2(node.w).mul(R0);
  const wp0 = node.xy.add(g.mul(cell)), k = clamp(camDist(wp0).sub(rng.mul(0.8)).div(rng.mul(0.15)), 0, 1);
  const wp = node.xy.add(g.sub(fract(g.mul(0.5)).mul(2).mul(k)).mul(cell));
  const I = riverInfo(wp);   // (signed distance, half-width, bank side)
  const world = vec3(wp.x, baseB(wp).sub(WATER_DROP_N), wp.y);
  const vWorld = varying(world), vI = varying(I), vG = varying(riverRaw(wp).yz);   // the river's field's gradient: the flow is along it, turned a quarter
  const wn = tex.n[tex.ids.indexOf('water')], wa = tex.a[tex.ids.indexOf('water')];

  const frag = Fn(() => {
    const d = abs(vI.x), w = vI.y, b = vI.z;
    If(d.greaterThan(w.mul(1.5)), () => { Discard(); });
    const p = vWorld.xz;
    const depth = riverCarve(d, w, b).sub(riverBank(d, w, b)).sub(WATER_DROP_N);
    const fl = normalize(vec2(vG.y.negate(), vG.x).add(1e-9));
    const mid = clamp(float(1).sub(d.div(w)), 0, 1), speed = sqrt(mid).mul(0.9).add(0.25);
    const t = WATER.time.mul(0.3), f1 = fract(t), f2 = fract(t.add(0.5)), wb = abs(f1.mul(2).sub(1));
    const o1 = fl.mul(speed).mul(f1.sub(0.5)).mul(3.3), o2 = fl.mul(speed).mul(f2.sub(0.5)).mul(3.3);
    const uA = p.sub(o1).div(water.floor.tile[0]), uB = p.sub(o2).div(water.floor.tile[0]).add(0.43);
    const nA = texture(wn, uA).xyz.add(texture(wn, uA.mul(3.1).add(0.2)).xyz).sub(1), nB = texture(wn, uB).xyz.add(texture(wn, uB.mul(3.1).add(0.6)).xyz).sub(1);
    const nn = mix(nA.xy, nB.xy, wb), rough = mid.mul(0.3).add(0.16);
    const n = normalize(vec3(nn.x.mul(rough), 1, nn.y.mul(rough)));
    const V = normalize(L.cam.sub(vWorld));
    const fres = pow(float(1).sub(max(n.dot(V), 0)), 5).mul(0.98).add(0.02);
    const ftex = mix(texture(wa, uA.mul(2)).r, texture(wa, uB.mul(2)).r, wb);
    const foam = float(1).sub(smoothstep(0, 0.05, depth)).mul(smoothstep(0.15, 0.6, ftex)).mul(0.5);
    const specks = float(0).toVar();
    for (let i = 0; i < 2; i++) {
      const q = (i === 0 ? p.sub(o1) : p.sub(o2).add(3.7)).mul(4), c = floor(q), cx = int(c.x), cy = int(c.y);
      const pt = c.add(0.25).add(vec2(rnd(cx, cy, uint(96)), rnd(cx, cy, uint(97))).mul(0.5));
      const s = rnd(cx, cy, uint(95)).greaterThan(0.955).select(1, 0).mul(float(1).sub(smoothstep(0.03, 0.1, length(q.sub(pt)))));
      specks.addAssign(s.mul(i === 0 ? float(1).sub(wb) : wb));
    }
    const body = mix(v3(water.colours.shallow), v3(water.colours.deep), clamp(depth.mul(1.1), 0, 1));
    const skyRef = mix(WATER.sky, vec3(WATER.sky.dot(vec3(0.333))), 0.4).mul(0.92);
    const sunC = LIGHT.sun.mul(float(1).sub(LIGHT.weather.w.mul(0.6)));
    const H = normalize(V.add(LIGHT.sunDir)), wd = length(L.cam.sub(vWorld));
    const spec = pow(max(n.dot(H), 0), 350).mul(2.5).add(pow(max(n.dot(H), 0), 30).mul(0.22).mul(smoothstep(40, 300, wd)));
    const col0 = mix(body.mul(LIGHT.amb.add(sunC.mul(0.45))), skyRef, clamp(fres.mul(0.9).add(smoothstep(40, 400, wd).mul(0.12)), 0, 1)).add(sunC.mul(spec));
    const col1 = mix(col0, vec3(0.8).mul(LIGHT.amb.add(sunC.mul(0.5))), foam);
    const col = mix(col1, vec3(0.5, 0.46, 0.3), specks.mul(0.6));
    const a0 = clamp(depth.mul(1.1).add(0.2), 0, 0.93);
    const a = max(max(a0, fres.mul(0.75)), max(foam, specks.mul(0.6))).mul(smoothstep(-0.04, 0.02, depth));
    return vec4(toScreen(haze(col, wd)).rgb, a);
  });

  const m = new THREE.NodeMaterial();
  m.positionNode = world; m.fragmentNode = frag();
  m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;
  return m;
}
