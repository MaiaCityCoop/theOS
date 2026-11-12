// Standing a made thing in the world (assets/index.js): its levels of detail built with the one lit material every
// asset shares, chosen each frame by its size on screen with a hand-over between them (src/detail), its far card
// (impostor), its shadow, and its body for the walker and the camera.
import * as THREE from 'three/webgpu';
import { Fn, vec3, uniform, varying, attribute, positionWorld, normalWorld, frontFacing, normalize, max, length, If, Discard } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { haze, toScreen, weathered, cloudAt, detailCut } from './light.js';
import { heightAt } from './land.js';
import { addSolid } from './solids.js';
import { detailOf, Detailed } from '../detail/index.js';
import { impostorOf } from '../detail/impostor.js';
import { geometryOf, solidOf } from '../../assets/index.js';

/** The material every asset shares: its own colours (per face), lit by the sun and the sky, hazed like the land. Its
    `keep` is this level's share of the pixels in a hand-over (src/detail). */
export function assetMaterial() {
  const keep = uniform(new THREE.Vector2(1, 0)), vCol = varying(attribute('color', 'vec3'));
  const m = new THREE.NodeMaterial(); m.side = THREE.DoubleSide; m.keep = keep;
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
  const meshes = D.levels.map((l) => { if (l.impostor) return impostorOf(geometryOf(asset), l.views); const m = new THREE.Mesh(geometryOf(asset, l), assetMaterial()); m.renderOrder = 1; return m; });
  const lod = new Detailed(asset, meshes);
  lod.position.set(at.x, heightAt(at.x, at.z) - 0.03, at.z); lod.rotation.y = at.yaw || 0; lod.name = asset.id;
  scene.add(lod);
  if (at.solid !== false) addSolid(solidOf(asset), at);   // the walker and the camera cannot pass it
  return lod;
}
