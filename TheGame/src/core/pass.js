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
//
// The prepass writes a third thing (intent 0038, the visibility buffer, step 1): what drew each pixel, its id (two numbers
// of 32 bits, its target's `id`: src/core/screen.js prepassTarget). A material says it by its idNode (drawnId); one that
// says none writes 0. Its prepass twin writes both, by name (three applies a renderer's MRT only to a material with no
// fragment of its own). What reads the id comes in the steps after (a shading pass that reads each family's things as data).
//
// A family lit where its pixels are, after the prepass (deferred: userData.deferred; the stands', src/scatter/trees.js),
// writes in its prepass what its light needs (the G-buffer: src/core/gbuffer.js), and is drawn in no colour pass: the
// one pass of light lights its pixels before the colour pass draws the rest. Its geometry is drawn once, not twice. Any
// other material writes nothing there (0).
import * as THREE from 'three/webgpu';
import { context, float, vec2, vec4, uint, uvec2, varying, varyingProperty, screenCoordinate, vertexIndex, Discard, mrt } from 'three/tsl';
import { U } from './uniforms.js';
import { GA, GB } from './gbuffer.js';
import { bytesOf } from './gpu.js';
import { GPU_MB } from './budget.js';
import { MiB } from './physics.js';

const PRE = context({ pass: 'pre', invariant: true }), MAIN = context({ pass: 'main', invariant: true }), SHADOW = context({ pass: 'shadow' }), SOLID = vec4(0);

/** A thing's id's first number, a uint's 32 bits: its place in the low PLACE_BITS, as many as name every thing a store
    could hold within the GPU's budget (budget.js GPU_MB, a thing at least one vec4 row: 27 bits), and its class in the
    rest (CLASS_BITS: 31 classes; the world says 8, one a level of the made things, src/scatter/placed.js). So many
    classes it can say (1 …; 0, none), and so many places (0 … PLACES - 1). */
const PLACE_BITS = Math.ceil(Math.log2((GPU_MB * MiB) / bytesOf('vec4'))), CLASS_BITS = 32 - PLACE_BITS, CLASSES = 2 ** CLASS_BITS - 1, PLACES = 2 ** PLACE_BITS;
/** What a pixel's id may say drew it: its class (1 …), each a family's draw (the made things of a group at a level, …),
    and what each is (ID_CLASSES[class - 1]). */
const ID_CLASSES = [];
/** A new class of what draws, `what` its description (a family and what of it): its number. */
let fullSaid = false;
export const idClass = (what) => { if (ID_CLASSES.length >= CLASSES) { if (!fullSaid) console.warn(`pass.js: more classes of what draws than ${CLASS_BITS} bits hold: the rest say none (0)`); fullSaid = true; return 0; } ID_CLASSES.push(what); return ID_CLASSES.length; };
/** Whether a store of n things (a tier's: src/scatter/tier.js) has a place in an id for each, said once where it has
    not (what: its name): its ids past PLACES would say another thing's. (Within the GPU's budget every store has.) */
let placesSaid = false;
export const placesFor = (n, what) => { if (n <= PLACES) return true; if (!placesSaid) console.warn(`pass.js: ${what} holds ${n} things, more than an id's ${PLACE_BITS} bits of place name (${PLACES}): past them their ids say another's`); placesSaid = true; return false; };
/** A thing's id in the prepass (a material's idNode): its class and its place (its row in its tier's store,
    src/scatter/tier.js placeAt), and the first corner of its triangle as the draw numbers it (flat, its first: the
    triangle itself where a draw's corners are its own, three a triangle; else the vertex it begins with). */
export const drawnId = (cls, place) => varying(uvec2(uint(cls).shiftLeft(uint(PLACE_BITS)).bitOr(uint(place).bitAnd(uint(PLACES - 1))), vertexIndex), 'vId').setInterpolation(THREE.InterpolationSamplingType.FLAT, THREE.InterpolationSamplingMode.FIRST);


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
/** A material's twins for the passes: { pre (null where it takes no part in the prepass), main, shadow (what it casts into
    a shadow map or the canopy map: its depth and its cut-out) }. */
export function twinOf(m) {
  let t = twins.get(m);
  if (!t) {
    const of = (ctx, pass, depth) => Object.assign(m.clone(), { contextNode: ctx, name: m.name && `${m.name} ${pass}` }, depth);   // (named for its pass: three labels a pipeline by its material's name)
    const pre = m.userData?.pre === true;
    // (the shadow twin: a material whose node code says what it cuts in the shadow pass (userData.shadow) keeps it; any
    // other casts whole, drawing nothing of its own: so none binds the atlas it is drawn into, nor writes an id there)
    t = { pre: pre ? of(PRE, 'pre', { fragmentNode: mrt({ output: m.fragmentNode, id: m.idNode ?? uvec2(0), gA: GA, gB: GB }) }) : null, main: pre && m.userData?.deferred ? null : of(MAIN, 'main', pre ? { depthFunc: THREE.EqualDepth, depthWrite: false } : {}), shadow: of(SHADOW, 'shadow', m.userData?.shadow ? {} : { fragmentNode: SOLID }) };
    twins.set(m, t);
  }
  return t;
}
