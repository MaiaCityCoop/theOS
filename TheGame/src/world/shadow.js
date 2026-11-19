// Shadows (intent 0038, stage 9): cascades from the light of the hour (the sun, or the moon at night), the layers of one
// depth array. What casts (every placed asset's levels, the stands, the scattered rocks, a person: layer CASTS) is drawn
// from the light into it; every surface reads it in the one light (src/world/light.js sunAt), so the ground, the grass,
// the rocks, the tent and the water all darken on the side away from the light.
//
// Their layout, all of it derived (useCascades, at the start, before any material is built):
//   texels   S a side: a texel one dial pixel at its own cascade's edge on the output (the one measure: two of the pixels
//            a metre covers a metre off on the output's rows, src/core/budget.js OUTPUT, which no canvas exceeds)
//   the near its texel the sun's own penumbra under the lowest crown that casts (SUN_DIAMETER × CASTERS.crown: a texel finer
//            than the narrowest penumbra a crown throws resolves nothing the sun's disc does not blur away), a third of
//            it ahead of the eye. Read with a penumbra as wide as the sun's disc makes it: the farther the blocker from
//            what it shades, the softer (light.js). What is finer still, nearer its receiver, is the contact shadows'
//            (src/world/light/screen.js). (The lowest crown stands in for where the contact shadows hand over, until their
//            reach is a length of its own)
//   the rest each twice the one before (a split by the logarithm: each texel a dial pixel at its edge and two where it
//            takes over), as many as reach the farthest caster (SHADE_REACH: where the trees' shade stand-ins end and
//            the land's own shade takes over, src/terrain/layers.js); the near one's side fitted so the last ends there
//   when     the near one every frame, of the others one a frame in turn (all of them whenever the light has turned or
//            the eye has jumped): every frame the near pass and one more, however many there are
//
// Each cascade is a layer of its own, drawn in a pass of its own that clears it: a tile GPU loads and stores the whole of
// what a pass draws into, whatever its scissor, so one atlas of them all made every frame's near pass load and store the
// others too. One array is still one binding for the materials.
//
// The casters are drawn by their shadow twins (src/core/pass.js): their depth and their cut-out only (a leaf's outline,
// so a crown casts dappled light), none of their light. So no caster binds the cascades it is drawn into.
import * as THREE from 'three/webgpu';
import { uniformArray } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { compileFor, compileList, made, ask, pending, labelled } from '../core/compile.js';
import { complete } from '../core/settle.js';
import { twinOf } from '../core/pass.js';
import { note, mark } from '../core/gpu.js';
import { pxKAt } from '../detail/measure.js';
import { OUTPUT } from '../core/budget.js';
import { SUN_DIAMETER } from './light/physics.js';

export const CASTS = 1;   // the layer of what casts a shadow
// (a cascade's camera, h metres its half side: how far back along the light it stands from the ground it looks at, and
// the depth it holds, so that what stands as high as anything does over the ground is in front of it)
const spanOf = (h) => ({ back: 300 + h * 0.5, near: 1, far: 600 + h });

let C = null;
/** Lay the cascades out (the light's start, src/world/light/start.js startLight: before any material is built, for the
    light is built for them), from what casts in the stands (src/terrain/layers.js CASTERS): reach, how far round the eye
    shadows are drawn; crown, the lowest crown that casts; top, the tallest caster; radius, the smallest crown's reach
    (for the canopy). */
export function useCascades({ reach, crown, top, radius }) {
  if (!(reach > 0 && crown > 0 && crown < Infinity && top > 0 && radius > 0 && radius < Infinity)) throw new Error(`the shadow cascades are laid out from what casts in the stands (reach ${reach} m, lowest crown ${crown} m, tallest ${top} m, smallest crown ${radius} m round): none of it there`);
  // a cascade's texels a side: a texel one dial pixel at its own cascade's edge (h metres from the eye, 2h / S a texel,
  // and a metre a metre off is pxKAt(OUTPUT.height) pixels on the output, the dial at rest: what is made once is made
  // for the most any canvas has, src/core/output.js, whatever the window at the start)
  const S = Math.ceil(2 * pxKAt(OUTPUT.height));
  const finest = (SUN_DIAMETER * crown * S) / 2;   // (the near one's half side at the most: its texel the lowest crown's penumbra)
  // as many as reach `reach`, each twice the one before; two at the least: three binds a depth texture of one layer as no
  // array, which the materials are built for
  const n = Math.max(2, 1 + Math.ceil(Math.log2(reach / finest)));
  const half = Array.from({ length: n }, (_, k) => (reach / 2 ** (n - 1)) * 2 ** k), texel = half.map((h) => (2 * h) / S);
  const bias = texel.map((t) => 2 * t), range = half.map((h) => spanOf(h).far - spanOf(h).near);
  // (what a shader reads of cascade k, k its index: its matrix, its texel, and its bias in its own depth's units, so one
  // loop reads them all, src/world/light.js)
  const mats = uniformArray(half.map(() => new THREE.Matrix4()), 'mat4');
  const texelAt = uniformArray(texel, 'float'), backAt = uniformArray(bias.map((b, k) => b / range[k]), 'float');
  C = { S, n, half, texel, bias, range, top, casters: { reach, crown, top, radius }, mats, texelAt, backAt };
  return C;
}
/** The cascades as useCascades laid them out: { S (texels a side), n (how many), half (each one's half side, m), texel (m), bias (m along the
    light a caster stands back before it shades: two of its texels, the 2 × 2 comparison's reach; what is steep to the
    light is moved off along its normal, light.js), range (the depth it holds, m), top (the tallest caster, m), casters
    (what they were laid out from: reach, crown, top, radius, m), mats (each one's matrix from the world to its u, v and
    depth: one uniform array, mats.array[k] here, mats.element(k) in a shader), texelAt, backAt (each one's texel and
    bias over its range, the same way, for the shaders) }. */
export const cascades = () => {
  if (!C) throw new Error('the shadow cascades are laid out at the start, before any material is built (src/world/light/start.js startLight, where src/boot.js and tools/smoke.js start the light)');
  return C;
};

/** What a caster is drawn as into a shadow cascade or the canopy map (src/world/light/canopy.js): its shadow twin, one
    pipeline for both. Drawn once it is made for them (made by need, src/core/compile.js): until then it is made aside,
    for target() as camera() sees it, left out, and missed(object) told of it (a map that keeps what it drew is made
    again once what it left out has come: pending). route.twin: any caster drawn as its twin, made or not (what a
    compile draws); route.ahead(object, scene): it asked to be made, not counted (src/core/compile.js ahead). */
export const castRoute = (renderer, target, camera, missed = null) => {
  const draw = renderer.renderObject, makers = new Map();
  const twin = (object, scene, cam, geometry, material, ...rest) => draw.call(renderer, object, scene, cam, geometry, material.isNodeMaterial ? twinOf(material).shadow : material, ...rest);
  const makerOf = (scene) => { if (!makers.has(scene.id)) makers.set(scene.id, (list) => compileList(renderer, target, list, camera(), scene, twin)); return makers.get(scene.id); };
  const route = (object, scene, cam, geometry, material, ...rest) => {
    if (made(object, 'cast')) return twin(object, scene, cam, geometry, material, ...rest);
    ask(object, 'cast', makerOf(scene), `${labelled(material, object)} (cast)`);
    if (pending(object, 'cast')) missed?.(object);
  };
  const ahead = (object, scene) => { const m = [object.material].flat()[0]; if (m && object.layers.test(camera().layers)) ask(object, 'cast', makerOf(scene), `${labelled(m, object)} (cast)`, false); };
  return Object.assign(route, { twin, ahead });
};

// (whether what a map left out has come since: none of it still being made, and some of it made (what was let go, its
// compile failed or not reached, comes no more: it never makes the map again). Before the first frame it is drawn again
// at once (the first frame shows it whole); after it, by the map's own turns: a cascade a frame
let shown = false; complete.then(() => (shown = true));
/** missing: the casters a map left out (it is emptied once they are settled). Whether any of them came. */
export const arrived = (missing) => {
  if (!missing.size || [...missing].some((o) => pending(o, 'cast'))) return false;
  const any = [...missing].some((o) => made(o, 'cast')); missing.clear(); return any;
};
export function createShadows(renderer) {
  const { S, n, half, top, mats } = cascades();
  // (depth32float, as the canopy map's is, src/world/light/canopy.js: a caster's twin is then one pipeline for both)
  const rt = new THREE.RenderTarget(S, S, { count: 0, depthBuffer: true, depth: n });
  rt.depthTexture = new THREE.DepthTexture(S, S, THREE.FloatType, undefined, undefined, undefined, THREE.LinearFilter, THREE.LinearFilter, undefined, THREE.DepthFormat, n);
  rt.depthTexture.compareFunction = THREE.LessEqualCompare;   // read with a comparison sampler: filtered PCF (src/world/light.js)
  note('shadow cascades', n * S * S * 4, 0, 'light');
  U.uShadowPull.value = C.bias[0];   // (what casts pulled towards the light, by the near cascade's bias: light.js casterPull)
  const cams = half.map(() => { const c = new THREE.OrthographicCamera(); c.layers.set(CASTS); c.userData.shadow = true; return c; });
  // what a cascade draws of a caster: once it is made for them; until then it is made aside (the farthest cascade's
  // camera sees all that any does), left out, and every cascade drawn again once it has come (src/core/compile.js)
  const missing = new Set(), route = castRoute(renderer, rt, () => cams[n - 1], (o) => missing.add(o));
  // from the light's clip space to a cascade's (u, v, depth): v turned (three reads a target's rows the other way up),
  // depth as the backend keeps it (WebGPU 0..1; WebGL -1..1)
  const webgpu = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
  const toMap = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, webgpu ? 1 : 0.5, webgpu ? 0 : 0.5, 0, 0, 0, 1);
  const up = new THREE.Vector3(), target = new THREE.Vector3(), snap = new THREE.Vector3(), off = new THREE.Vector3(), ahead = new THREE.Vector3();
  const lastSun = new THREE.Vector3(), lastEye = new THREE.Vector3(); let turn = 0;
  // a cascade's camera: its box round the eye (the near one a third of its side ahead, where the eye looks), held to
  // whole texels in the light's view so its edges do not crawl
  const aim = (k, camera, groundY) => {
    const cam = cams[k], L = U.uSunDir.value, h = half[k], texel = (2 * h) / S, span = spanOf(h);
    cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h; cam.near = span.near; cam.far = span.far; cam.updateProjectionMatrix();
    camera.getWorldDirection(ahead); ahead.y = 0; if (ahead.lengthSq() > 1e-6) ahead.normalize().multiplyScalar(k === 0 ? h / 3 : 0);
    up.set(Math.abs(L.y) > 0.99 ? 1 : 0, Math.abs(L.y) > 0.99 ? 0 : 1, 0); target.set(camera.position.x + ahead.x, groundY, camera.position.z + ahead.z);
    cam.position.copy(target).addScaledVector(L, span.back); cam.up.copy(up); cam.lookAt(target); cam.updateMatrixWorld();
    snap.copy(target).applyMatrix4(cam.matrixWorldInverse);
    off.set(-(snap.x - Math.round(snap.x / texel) * texel), -(snap.y - Math.round(snap.y / texel) * texel), 0).applyQuaternion(cam.quaternion);
    cam.position.add(off); cam.updateMatrixWorld();
    return cam;
  };
  const matOf = (k) => mats.array[k].multiplyMatrices(toMap, cams[k].projectionMatrix).multiply(cams[k].matrixWorldInverse);
  return {
    cams, target: rt, layout: C,
    /** The casters compiled for the cascades, from where the light looks at this camera now, in turn
        (src/core/compile.js; a promise): before the first frame, which would otherwise compile them as it draws them.
        object: the scene, or a part of it to stand in `scene` (a subject the library shows). The farthest cascade's
        camera sees all that any does. Each caster three compiles is then made for them. */
    compile(object, camera, groundY, scene = null) { return compileFor(renderer, rt, object, aim(n - 1, camera, groundY), scene, route.twin, 'cast'); },
    /** What making `object` ahead of need asks, where it casts (src/core/compile.js ahead). */
    ahead: route.ahead,
    /** Draw the casters from the light, round where the camera looks: the near cascade every frame, the others in turn. */
    render(scene, camera, groundY) {
      const L = U.uSunDir.value, sun = U.uSun.value;
      if (L.y < 0.03 || sun.x + sun.y + sun.z < 0.02) { U.uShadowOn.value = 0; return; }   // no light to cast by
      // the others: one a frame in turn, or all at once when the light has turned or the eye has jumped since, or when
      // what they left out has been made since (made by need: no caster comes into the cascades one by one)
      const came = arrived(missing) && !shown;
      const jump = came || lastSun.dot(L) < 0.99998 || lastEye.distanceToSquared(camera.position) > 25 || !U.uShadowOn.value;
      const which = jump ? half.map((_, k) => n - 1 - k) : [1 + (turn++ % (n - 1)), 0];
      const prev = renderer.getRenderTarget(), ac = renderer.autoClear, acd = renderer.autoClearDepth;
      U.uShadowOn.value = 0; U.uShadowPass.value = 1;   // (a caster drawn pulled towards the light by the near cascade's bias: characters/kit/human.js casterPull)
      renderer.setRenderObjectFunction(route); renderer.autoClear = true; renderer.autoClearDepth = true;   // (each cascade's layer cleared by its own pass: nothing loaded)
      for (const k of which) {
        mark(k ? 'far' : 'near');   // (whose passes these are, for a tool's timing: src/core/gpu.js)
        renderer.setRenderTarget(rt, k); renderer.render(scene, aim(k, camera, groundY)); matOf(k);
      }
      if (jump) { lastSun.copy(L); lastEye.copy(camera.position); }
      mark(null); renderer.setRenderObjectFunction(null); renderer.autoClear = ac; renderer.autoClearDepth = acd; renderer.setRenderTarget(prev);
      U.uShadowPass.value = 0;
      U.tShadow.value = rt.depthTexture; U.uShadowOn.value = 1;
      U.uShadowPen.value = (SUN_DIAMETER * top) / L.y;   // the widest penumbra: the sun's disc over the tallest caster's way along the light
    },
  };
}
