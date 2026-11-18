// Standing a made thing in the world (assets/index.js): its levels of detail built with the one lit material every
// asset shares, chosen each frame by its size on screen with a hand-over between them (src/detail), its far card
// (impostor), its shadow, and its body for the walker and the camera.
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, vec4, uniform, varying, attribute, positionLocal, positionWorld, normalLocal, normalWorld, modelWorldMatrix, modelWorldMatrixInverse, normalize, If } from 'three/tsl';
import { windAt, windStrength, unlit } from './light.js';
import { sinkInto } from '../detail/handover.js';
import { layerOf, wrap } from './tile.js';
import { heightAt } from './land.js';
import { addBody } from './bodies.js';
import { detailOf, Detailed } from '../detail/index.js';
import { most, kindOf } from '../../assets/kinds.js';
import { impostorOf } from '../detail/impostor.js';
import { geometryOf, bodyOfAsset, snowOf } from '../../assets/index.js';
import { lightFire } from './fire.js';
import { swayed, facing, mottled, madeLit } from './made.nodes.js';

/** How an asset moves in the wind: its own `wind` block, else its kind's (assets/kinds.js); null: it does not move. */
export const windOf = (asset) => kindOf(asset, 'wind');

// its sway in the wind, in its own frame: pushed downwind with the gust (billow) and fluttering along its surface (flap),
// held still at the ground and along its middle, moving most halfway up and out (assets/kinds.js: wind)
function swayOf(asset) {
  const W = windOf(asset); if (!W) return null;
  const p = positionLocal, w = modelWorldMatrix.mul(vec4(p, 1)).xyz, push = windAt(w.xz), along = modelWorldMatrixInverse.mul(vec4(push.x, 0, push.y, 0)).xyz;
  return swayed(p, normalLocal, { H: most(asset.size.height), R: most(asset.size.length) / 2, billow: W.billow ?? 0, flap: W.flap ?? 0, sway: W.sway ?? 0 }, along, windStrength);
}

/** How an asset's faces take the light: its own `surface`, else its kind's (assets/kinds.js). */
export const surfaceOf = (asset) => kindOf(asset, 'surface');

/** The materials an asset is made of, if it names any ({ part: material }): each face of it wears the one it names
    (assets/index.js), wrapped round it from three sides (src/world/tile.js), and the face's own colour is then a tint
    on that material (1 leaves it as it is) rather than its whole colour. It may also say `texture`, the metres a tile
    of them spans, and `relief`, how deep their bumps read. An asset that names none is its face colours alone. */
const madeOf = (asset) => (asset?.materials ? Object.values(asset.materials) : null);

/** The material every asset shares: its own colours (per face), lit by the sun and the sky, hazed like the land, moving
    in the wind as its recipe says; darker where it meets the ground, faintly mottled, soft or thin as its surface says.
    Where it names what it is made of, a real material is wrapped round it and its colours tint that.
    Its `sunk` is how far its last level has sunk away (src/detail/handover.js). */
export function assetMaterial(asset) {
  const sunk = uniform(1), vCol = varying(attribute('color', 'vec3'));
  // what it is made of: its materials' numbers in the library, and which of them this face wears
  const MATS = madeOf(asset), NOS = MATS?.map((u) => layerOf(u));
  const vPart = MATS && MATS.length > 1 ? varying(attribute('part', 'float')) : null;
  const TEX = asset?.texture ?? 1;   // metres a tile of its materials spans
  const m = new THREE.NodeMaterial(); m.side = THREE.DoubleSide; m.sunk = sunk;
  // (its last level sinks into the ground over its last pixels: src/detail/handover.js)
  m.positionNode = sinkInto((asset && swayOf(asset)) || positionLocal, sunk);
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar();
    If(unlit().not(), () => {   // drawn into the shadow map, only its depth counts: no light
      const w = positionWorld, n0 = facing(normalize(normalWorld), w), S = surfaceOf(asset);   // (the face's side towards the eye)
      // the material this face wears, wrapped round the shape: its grain, and its bumps folded into the face's normal
      let skin = null;
      if (NOS) {
        let no = float(NOS[0]); if (vPart) for (let i = 1; i < NOS.length; i++) no = vPart.greaterThan(i - 0.5).select(float(NOS[i]), no);
        skin = wrap(no, w.div(TEX), n0, asset.relief ?? 1);
      }
      const n = skin ? skin.n : n0;
      // its colour: the material's own, tinted by the face (1 leaves the material as it is), or the face's colour
      // alone where the asset names no material, faintly mottled as it always was
      const own = skin ? skin.col.mul(skin.col).mul(vCol) : mottled(vCol, w);
      out.assign(madeLit(own, n, w, positionLocal.y, { wrap: S.wrap, through: S.through, clumps: snowOf(asset).clumps }));
    });
    return out;
  })();
  return m;
}

/** Stand an asset at a place ({ x, z, yaw, solid }), on the ground there, in `scene` (null: not put in; the library's
    stage puts it in once it is compiled: src/boot.js show). */
export function place(scene, asset, at) {
  if (asset.fire) return lightFire(scene, asset, at);   // a fire is light, not a mesh (src/world/fire.js)
  const D = detailOf(asset);
  const meshes = D.levels.map((l) => { if (l.impostor) return impostorOf(geometryOf(asset), l.views, snowOf(asset)); const m = new THREE.Mesh(geometryOf(asset, l), assetMaterial(asset)); m.renderOrder = 1; return m; });
  const lod = new Detailed(asset, meshes);
  lod.position.set(at.x, heightAt(at.x, at.z) - 0.03, at.z); lod.rotation.y = at.yaw || 0; lod.name = asset.name;
  scene?.add(lod);
  // the walker and the camera cannot pass it: its body (its own solid block, else its kind's from its size) in the one
  // collision engine of every world (src/world/bodies.js). Its turn is three's about y, the other way round from the
  // engine's (a body's yaw is what the GPU turns what it draws by)
  const body = at.solid === false ? null : bodyOfAsset(asset);
  if (body && (body.shapes.length || body.ceiling)) addBody({ id: `placed:${asset.uid}:${at.x}:${at.z}`, x: at.x, z: at.z, y: lod.position.y, up: -0.03, yaw: -(at.yaw || 0), s: 1, kind: asset.uid, body });
  return lod;
}
