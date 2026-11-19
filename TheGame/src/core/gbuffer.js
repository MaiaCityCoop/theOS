// The prepass's G-buffer (intent 0038): what a deferred family's light needs, written where its pixels are drawn in the
// prepass (src/core/pass.js twinOf: its mrt), and the one pass of light that lights every such pixel after the prepass,
// before the colour pass draws the rest (src/core/screen.js). Each family's geometry is drawn once, not twice: at about
// 700 lane-cycles a corner (the stands', 2026-11-18), a second geometry pass costs far more than these 16 bytes a pixel,
// and a visibility buffer's resolve (three corners again for each pixel) more still. The way things are lit: a family
// moves here whole, and its colour pass's light goes with it (no forward and deferred copy of one light).
//
//   gA  rgba16f    its colour as its light multiplies it (rgb), and how far it lies from the eye (metres: its point is
//                  that far back along the pixel's ray)
//   gB  rg32uint   its way (octahedral, 16 bits each way); wrap (7 bits), shines (7), ao (8), clumps (6), its part (2:
//                  what of its family it is) and its family (2: whose light it takes; 0, none)
// A family says its light once (lightFamily), and the pass lights each of its pixels by it.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, float, uint, vec2, vec3, vec4, uvec2, ivec2, abs, sign, clamp, normalize, length, uniform, texture, property, screenCoordinate } from 'three/tsl';
import { U } from './uniforms.js';
import { octDir } from '../scatter/unpack.js';

/** The G-buffer's targets, beside the prepass's motion and id (src/core/screen.js prepassTarget): each its name, its
    texture's type and format, and its bytes a pixel (what the ledger counts). */
export const GBUFFER = [
  { name: 'gA', type: THREE.HalfFloatType, format: THREE.RGBAFormat, bytes: 8 },
  { name: 'gB', type: THREE.UnsignedIntType, format: THREE.RGIntegerFormat, bytes: 8 },
];
/** Its bytes a pixel, all its targets'. */
export const GBUFFER_BYTES = GBUFFER.reduce((n, t) => n + t.bytes, 0);
/** The families lit here, each its number in the G-buffer (its 2 bits; none: 0, what the colour pass draws). */
export const FAMILY = Object.fromEntries(['none', 'stands'].map((name, at) => [name, at]));
/** What a deferred material's prepass writes into it (set in its fragment by gWrite; 0 in any other's). */
export const GA = property('vec4', 'gA'), GB = property('uvec2', 'gB');

/** A unit direction as two numbers -1 … 1 (octahedral: unpack.js octDir the other way). */
const octOf = (n) => { const a = n.div(abs(n.x).add(abs(n.y)).add(abs(n.z)).max(1e-6)); return a.z.lessThan(0).select(vec2(float(1).sub(abs(a.y)).mul(sign(a.x)), float(1).sub(abs(a.x)).mul(sign(a.y))), a.xy); };
/** 0 … 1 as `bits` bits (a uint node), shifted up by `at`. */
const unorm = (v, bits, at) => uint(clamp(v, 0, 1).mul(2 ** bits - 1).add(0.5)).shiftLeft(uint(at));
const field = (x, at, bits) => float(x.shiftRight(uint(at)).bitAnd(uint(2 ** bits - 1))).div(2 ** bits - 1);
/** What a pixel of `family` (FAMILY's) writes in its prepass: part (0 … 3: what of its family it is), colour (vec3: its
    colour as its light multiplies it), n (its way), w (where it is, the world), ao, wrap, shines, clumps (0 … 1). */
export const gWrite = ({ family, part, colour, n, w, ao, wrap, shines, clumps }) => {
  const o = octOf(normalize(n)).mul(0.5).add(0.5);
  GA.assign(vec4(colour, length(U.uCam.sub(w))));
  GB.assign(uvec2(unorm(o.x, 16, 0).bitOr(unorm(o.y, 16, 16)), unorm(wrap, 7, 0).bitOr(unorm(shines, 7, 7)).bitOr(unorm(ao, 8, 14)).bitOr(unorm(clumps, 6, 22)).bitOr(uint(part).shiftLeft(uint(28))).bitOr(uint(family).shiftLeft(uint(30)))));
};

const FAMILIES = new Map();
let PASS = null;
/** Family `code` (FAMILY's) lit by light(f): f { colour, w (where it is), Ve (the way to the eye), n, ao, wrap, shines,
    clumps, part (a uint node) } -> vec4, its colour for the screen (light.js toScreen). Said once; one said after the
    pass was made has it made again, with it. */
export const lightFamily = (code, light) => {
  FAMILIES.set(code, light);
  if (PASS) { PASS.mesh.material.dispose(); PASS = null; }
};
/** The one pass of light: { mesh, camera, frame({ camera, textures, w, h }) } (src/core/screen.js draws it before the
    colour pass), or null while no family is deferred. Every pixel of a family lit by its light, from where the prepass
    left what it needs: its point back along the pixel's ray as far as it wrote. */
export const lightPass = () => {
  if (PASS || !FAMILIES.size) return PASS;
  const tA = texture(new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType)), tB = texture(new THREE.DataTexture(new Uint32Array(2), 1, 1, THREE.RGIntegerFormat, THREE.UnsignedIntType));
  const unproject = uniform(new THREE.Matrix4()), eyeWorld = uniform(new THREE.Matrix4()), size = uniform(new THREE.Vector2(1, 1));
  const m = new THREE.NodeMaterial(); m.depthTest = false; m.depthWrite = false; m.userData.lit = true;   // (lit: what reads the screen's light as the colour pass does, src/world/light.js)
  m.fragmentNode = Fn(() => {
    const at = ivec2(screenCoordinate.xy), b = tB.load(at).xy.toVar(), family = b.y.shiftRight(uint(30)).toVar();
    Discard(family.equal(uint(0)));   // (no family's: what the colour pass draws)
    const a = tA.load(at), ndc = vec2(screenCoordinate.x.div(size.x).mul(2).sub(1), float(1).sub(screenCoordinate.y.div(size.y).mul(2))), r = unproject.mul(vec4(ndc, 1, 1));
    const dir = normalize(eyeWorld.mul(vec4(r.xyz.div(r.w), 0)).xyz).toVar();
    const f = {
      colour: a.rgb, w: U.uCam.add(dir.mul(a.w)).toVar(), Ve: dir.negate(),
      n: normalize(octDir(field(b.x, 0, 16).mul(2).sub(1), field(b.x, 16, 16).mul(2).sub(1))).toVar(),
      wrap: field(b.y, 0, 7), shines: field(b.y, 7, 7), ao: field(b.y, 14, 8), clumps: field(b.y, 22, 6), part: b.y.shiftRight(uint(28)).bitAnd(uint(3)),
    };
    const out = vec4(0, 0, 0, 1).toVar();
    for (const [code, light] of FAMILIES) If(family.equal(uint(code)), () => { out.assign(light(f)); });
    return out;
  })();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false;
  const named = (textures, name) => textures.find((t) => t.name === name);
  PASS = { mesh, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), frame({ camera, textures, w, h }) { tA.value = named(textures, 'gA'); tB.value = named(textures, 'gB'); unproject.value.copy(camera.projectionMatrixInverse); eyeWorld.value.copy(camera.matrixWorld); size.value.set(w, h); } };
  return PASS;
};
