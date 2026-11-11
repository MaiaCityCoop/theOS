// The placed assets in TSL (intent 0008, step 2): assets/index.js's material (its own colours, lit like the land,
// hazed) as a node material, and an asset's levels of detail chosen by size on screen with the dithered hand-over
// (src/detail: detailOf, keepOf), the same numbers as today. The far card (impostor) comes in the next slice.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uniform, attribute, varying, normalize, max, fract, dot, positionWorld, normalWorld, screenCoordinate, If, Discard, frontFacing } from 'three/tsl';
import { L } from './land.tsl.js';
import { LIGHT, haze, toScreen, weathered } from './terrain.tsl.js';
import { geometryOf } from '../../assets/index.js';
import { detailOf, keepOf, spanOf, pxK } from '../detail/index.js';
import { heightAt } from '../world/land.js';

const ign = (p) => fract(fract(dot(p, vec2(0.06711056, 0.00583715))).mul(52.9829189));

function assetMaterial() {
  const keep = uniform(new THREE.Vector2(1, 0)), vCol = varying(attribute('color', 'vec3'));
  const frag = Fn(() => {
    const n0 = ign(screenCoordinate.xy), cut = keep.y.greaterThan(0.5).select(float(1).sub(n0), n0);
    If(cut.greaterThanEqual(keep.x), () => { Discard(); });   // its share of a hand-over between levels
    const n = normalize(frontFacing.select(normalWorld, normalWorld.negate()));
    const ndl = max(n.dot(LIGHT.sunDir), 0);
    const col = weathered(vCol, n).mul(LIGHT.amb.add(LIGHT.sun.mul(float(1).sub(LIGHT.weather.w.mul(0.6))).mul(ndl.mul(0.8).add(0.2))));
    return toScreen(haze(col, positionWorld.sub(L.cam).length()));
  });
  const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); m.side = THREE.DoubleSide; m.keep = keep;
  return m;
}
// a geometry of the WebGL build, copied into this one (its arrays are shared)
const own = (g) => { const o = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(g.attributes)) o.setAttribute(k, new THREE.BufferAttribute(a.array, a.itemSize)); if (g.index) o.setIndex(new THREE.BufferAttribute(g.index.array, 1)); return o; };

/** Stand an asset at { x, z, yaw }: its levels, each chosen and handed over by its size on screen in update(camera). */
export function placeAsset(scene, asset, at) {
  const D = detailOf(asset), span = spanOf(asset), group = new THREE.Group();
  const levels = D.levels.filter((l) => !l.impostor).map((l) => { const m = new THREE.Mesh(own(geometryOf(asset, l)), assetMaterial()); m.userData.l = l; group.add(m); return m; });
  group.position.set(at.x, heightAt(at.x, at.z) - 0.03, at.z); group.rotation.y = at.yaw || 0; scene.add(group);
  const wp = new THREE.Vector3();
  return {
    group,
    update(camera) {
      const d = Math.max(0.01, camera.position.distanceTo(group.getWorldPosition(wp))), px = (span * pxK()) / d;
      for (const m of levels) { const [k, side] = keepOf(px, m.userData.l.lo, m.userData.l.hi, D.fade); m.visible = k > 0; m.material.keep.value.set(k, side); }
    },
  };
}
