// The passes the world's frame is drawn in (src/core/screen.js), and what a material does in each (intent 0038). A
// material is built once for each pass: its twin for the pass carries the pass's context (three's contextNode, read as
// a material is built), so its node code asks passOf(builder) and says only what that pass needs.
//
//   pre    the prepass: the depth, and where each pixel's point lay a frame ago (its motion on the screen, the camera's
//          and its own: the wind, growing, moving), and whether it is a thin thing (a leaf, a blade). What is cut out (a
//          leaf's outline, a thinning thing's last pixels) is cut here, and only here. No light.
//   main   the colour: drawn only where the prepass's depth is (an equal test), nothing cut, so a tile GPU (Apple's)
//          drops every hidden pixel before it is shaded, leaves too; its colour in the light's own numbers, before the
//          screen's curve (the upscale lays it on the screen: src/core/temporal.js); its fourth number how far what was
//          kept of the pixel may be trusted (1; less where something moves that has no motion to say: the fire, a mover)
//   none   anything else (the shadow map, a library's picture, a bake): the material as it always was
// The position is worked out alike in both passes, and WGSL holds it to the last bit (@invariant): the equal test holds.
//
// A material takes part in the prepass by saying so (userData.pre) and having node code for it: the land, the stands,
// the grass, the drawer's things (the rocks, what is placed). Any other is drawn in the colour pass only (the sky, the
// water, the fire), its pixels' motion the camera's (the upscale reckons it from the depth).
import * as THREE from 'three/webgpu';
import { context, float, vec2, vec4, varyingProperty, screenCoordinate, Discard } from 'three/tsl';
import { U } from './uniforms.js';

const PRE = context({ pass: 'pre', invariant: true }), MAIN = context({ pass: 'main', invariant: true });

/** The pass a material is being built for ('pre', 'main'; undefined: none), from what node code is handed. */
export const passOf = (builder) => builder?.context?.pass;

/** Where a vertex's point lay a frame ago, in the world: the vertex stage's to the prepass's pixels (src/scatter/tier.js:
    clipOf). */
export const vWas = varyingProperty('vec3', 'vWas');

/** Cut the pixel where `cond` holds: in every pass but the colour's, which draws only what the prepass left. */
export const cut = (builder, cond) => { if (passOf(builder) !== 'main') Discard(cond); };

/** What the prepass writes for a pixel whose point lay at `was` (world) a frame ago: how far it has come on the screen
    since (now less then, in the picture's widths and heights, the frame's shift taken out), 1 (written) and how thin it
    is (a leaf's card, a blade: 1), and nothing (0; the land writes there which level of its pages it reads:
    src/terrain/pages.js). */
export const motion = (was, thin = 0) => {
  const c = U.uWas.mul(vec4(was, 1)), then = c.xy.div(c.w.max(1e-6)).mul(vec2(0.5, -0.5)).add(0.5);   // (behind the camera then: far off the screen, so nothing is kept)
  return vec4(screenCoordinate.xy.add(U.uJit).div(U.uIn).sub(then), float(thin).add(1), 0);
};

const twins = new WeakMap();
/** A material's twins for the passes: { pre (null where it takes no part in the prepass), main }. */
export function twinOf(m) {
  let t = twins.get(m);
  if (!t) {
    const of = (ctx, pass, depth) => Object.assign(m.clone(), { contextNode: ctx, name: m.name && `${m.name} ${pass}` }, depth);   // (named for its pass: three labels a pipeline by its material's name)
    const pre = m.userData?.pre === true;
    t = { pre: pre ? of(PRE, 'pre') : null, main: of(MAIN, 'main', pre ? { depthFunc: THREE.EqualDepth, depthWrite: false } : {}) };
    twins.set(m, t);
  }
  return t;
}
