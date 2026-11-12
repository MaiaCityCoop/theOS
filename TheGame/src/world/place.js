// Standing a made thing in the world (assets/index.js): its levels of detail built with the one lit material every
// asset shares, chosen each frame by its size on screen with a hand-over between them (src/detail), its far card
// (impostor), its shadow, and its body for the walker and the camera.
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, vec4, uniform, varying, attribute, positionLocal, positionWorld, normalLocal, normalWorld, modelWorldMatrix, modelWorldMatrixInverse, frontFacing, normalize, max, length, smoothstep, sin, If, Discard } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { haze, toScreen, weathered, cloudAt, detailCut, windAt } from './light.js';
import { heightAt } from './land.js';
import { addSolid } from './solids.js';
import { detailOf, Detailed } from '../detail/index.js';
import { impostorOf } from '../detail/impostor.js';
import { geometryOf, solidOf } from '../../assets/index.js';
import KINDS from '../../assets/kinds.js';

const most = (v) => (Array.isArray(v) ? v[1] : v);
/** How an asset moves in the wind: its own `wind` block, else its kind's (assets/kinds.js); null: it does not move. */
export const windOf = (asset) => asset.wind ?? KINDS[asset.kind]?.wind ?? null;

// its sway in the wind, in its own frame: pushed downwind with the gust (billow) and fluttering along its surface (flap),
// held still at the ground and along its middle, moving most halfway up and out (assets/kinds.js: wind)
function swayOf(asset) {
  const W = windOf(asset); if (!W) return null;
  const H = most(asset.size.height), Rr = most(asset.size.length) / 2, p = positionLocal;
  const hold = smoothstep(0.02, 0.45, p.y.div(H)).mul(float(1).sub(smoothstep(0.8, 1, p.y.div(H)).mul(0.8))).mul(smoothstep(0.08, 0.55, length(p.xz).div(Rr)));
  const w = modelWorldMatrix.mul(vec4(p, 1)).xyz, push = windAt(w.xz), s = U.uWind.z;
  const along = modelWorldMatrixInverse.mul(vec4(push.x, 0, push.y, 0)).xyz.mul(W.billow);
  const flap = sin(U.uTime.mul(s.mul(10).add(4)).add(p.y.mul(3.1)).add(p.x.mul(1.7)).add(p.z.mul(2.3))).mul(s).mul(W.flap);   // (no angle round the middle: at the pole's tip it has none)
  return p.add(along.add(normalLocal.mul(flap)).mul(hold));
}

/** The material every asset shares: its own colours (per face), lit by the sun and the sky, hazed like the land, moving
    in the wind as its recipe says. Its `keep` is this level's share of the pixels in a hand-over (src/detail). */
export function assetMaterial(asset) {
  const keep = uniform(new THREE.Vector2(1, 0)), vCol = varying(attribute('color', 'vec3'));
  const m = new THREE.NodeMaterial(); m.side = THREE.DoubleSide; m.keep = keep;
  const sway = asset && swayOf(asset); if (sway) m.positionNode = sway;
  m.fragmentNode = Fn(() => {
    If(detailCut(keep), () => { Discard(); });
    const n = normalize(frontFacing.select(normalWorld, normalWorld.negate())), ndl = max(n.dot(U.uSunDir), 0);
    const col = weathered(vCol, n).mul(U.uAmb.add(U.uSun.mul(cloudAt(positionWorld)).mul(ndl.mul(0.8).add(0.2))));
    return toScreen(haze(col, length(U.uCam.sub(positionWorld))));
  })();
  return m;
}

/** Stand an asset at a place ({ x, z, yaw, solid }), on the ground there. */
export function place(scene, asset, at) {
  const D = detailOf(asset);
  const meshes = D.levels.map((l) => { if (l.impostor) return impostorOf(geometryOf(asset), l.views); const m = new THREE.Mesh(geometryOf(asset, l), assetMaterial(asset)); m.renderOrder = 1; return m; });
  const lod = new Detailed(asset, meshes);
  lod.position.set(at.x, heightAt(at.x, at.z) - 0.03, at.z); lod.rotation.y = at.yaw || 0; lod.name = asset.name;
  scene.add(lod);
  if (at.solid !== false) addSolid(solidOf(asset), at);   // the walker and the camera cannot pass it
  return lod;
}
