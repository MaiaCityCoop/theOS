// Standing a made thing in the world (assets/index.js): its levels of detail built with the one lit material every
// asset shares, chosen each frame by its size on screen with a hand-over between them (src/detail), its far card
// (impostor), its shadow, and its body for the walker and the camera.
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, vec4, uniform, varying, attribute, positionLocal, positionWorld, normalLocal, normalWorld, modelWorldMatrix, modelWorldMatrixInverse, normalize, max, clamp, length, smoothstep, sin, pow, uint, If, Discard } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { finish, skyLight, weathered, snowCover, cloudAt, detailCut, windAt, unlit } from './light.js';
import { vnoise } from './noise.nodes.js';
import { heightAt } from './land.js';
import { addSolid } from './solids.js';
import { detailOf, Detailed, most } from '../detail/index.js';
import { impostorOf } from '../detail/impostor.js';
import { geometryOf, solidOf } from '../../assets/index.js';
import KINDS from '../../assets/kinds.js';

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

/** How an asset's faces take the light: its own `surface`, else its kind's (assets/kinds.js). */
export const surfaceOf = (asset) => ({ wrap: 0, through: 0, ...(KINDS[asset?.kind]?.surface || {}), ...(asset?.surface || {}) });

/** The material every asset shares: its own colours (per face), lit by the sun and the sky, hazed like the land, moving
    in the wind as its recipe says; darker where it meets the ground, faintly mottled, soft or thin as its surface says.
    Its `keep` is this level's share of the pixels in a hand-over (src/detail). */
export function assetMaterial(asset) {
  const keep = uniform(new THREE.Vector2(1, 0)), vCol = varying(attribute('color', 'vec3'));
  const m = new THREE.NodeMaterial(); m.side = THREE.DoubleSide; m.keep = keep;
  const sway = asset && swayOf(asset); if (sway) m.positionNode = sway;
  m.fragmentNode = Fn(() => {
    If(detailCut(keep), () => { Discard(); });
    const out = vec4(0).toVar();
    If(unlit().not(), () => {   // drawn into the shadow map, only its depth counts: no light
      const w = positionWorld, nw = normalize(normalWorld), n = nw.dot(U.uCam.sub(w)).lessThan(0).select(nw.negate(), nw), S = surfaceOf(asset);   // the face's side towards the eye (a face's winding is not to be trusted)
      const ndl = n.dot(U.uSunDir).add(S.wrap).div(1 + S.wrap).max(0);   // soft things take the light round their edge
      const through = pow(max(normalize(w.sub(U.uCam)).dot(U.uSunDir), 0), 3).mul(S.through).mul(max(n.dot(U.uSunDir).negate(), 0).mul(0.6).add(0.4));   // the sun behind a thin thing shines through it
      const ground = smoothstep(0, 0.7, positionLocal.y).mul(0.4).add(0.6);   // darker where it meets the ground
      const mottle = vnoise(w.xz.mul(1.3).add(w.y), uint(301)).sub(0.5).mul(0.12).add(1);   // no face quite one even colour
      const sun = U.uSun.mul(cloudAt(w));
      // snow lies on what faces up in clumps, where it held, slid off between them (so it reads even on pale canvas); the
      // cloth under it darker, damp
      const lump = vnoise(w.xz.mul(2.3).add(w.y.mul(1.7)), uint(302)).mul(0.7).add(vnoise(w.xz.mul(7).add(w.y.mul(5)), uint(303)).mul(0.3));
      const damp = float(1).sub(clamp(U.uSnow.mul(1.5), 0, 0.18));
      const col = weathered(vCol.mul(mottle).mul(damp), n, lump.mul(0.22)).mul(skyLight(n).mul(ground).add(sun.mul(ndl.mul(0.8).add(0.2)))).add(vCol.mul(sun).mul(through).mul(float(1).sub(snowCover(n, lump.mul(0.22)))));   // snow on it: no light comes through
        out.assign(finish(col, positionWorld));
    });
    return out;
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
