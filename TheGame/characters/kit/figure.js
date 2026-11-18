// A figure brought in whole (intent 0043): a person made elsewhere and kept as one file (characters/figures/*.glb):
// the body in its clothes, the eyes, the teeth and the hair, bound to a skeleton of its own, the face with shapes of
// its own. The first of the library that is not grown from our own numbers: the figures are VALID's (the Validated
// Avatar Library for Inclusion and Diversity, Do, Zelenty, Gonzalez-Franco & McMahan 2023, MIT: figures/LICENSE).
// What is ours here is how it stands in the world: its light, its shadow, its moves and its face's expressions.
//
//   figure(own) -> a figure's recipe (characters/man.js, woman.js): what every figure's is, with its own
//   figureOf(tex, recipe) -> { object, mesh, bones, skeleton, moves, faces, height, setMove(id), step(dt, eye), grown,
//                              expressions, expression, setExpression(id) }
//     held by the library as a person of the human kit is (./human.js): the same card, the same clock
//     grown        kept when the file is read and the figure stands (it is fetched when first wanted; `failed` says why not)
//     onGrown      called when it stands (the library draws its card again)
//     expressions  what its face can do: [{ id, name, about }]; setExpression(id) goes to one over a moment
//     stands       { low, top } (m): its lowest and highest point as its bones hold it at rest (tools/scale.js measures by it)
//
// The moves are the human kit's own (./human.js MOVES: a pose is plain angles for a body that stands turned like the
// world, its arms down), carried over to this skeleton: its bones lie each along its own axis and it comes with its
// arms out, so a turn is made in the world's axes as they are at its rest, and its arms are first brought down to
// hang, the collar bone taking its share of that (src/world/physics.js SHOULDER_RHYTHM).
// The expressions are weights of the face's own shapes (65, named by its makers), the lower teeth's with them.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, uv, texture, positionWorld, positionLocal, normalWorld, modelWorldMatrixInverse, uniform, float, vec3, vec4, normalize, max, pow, dot, cross, dFdx, dFdy, inverseSqrt, reflect } from 'three/tsl';
import { U } from '../../src/core/uniforms.js';
import { finish, skyLight, unlit, sunDim, cloudShade, shadowAtPulled, casterPull } from '../../src/world/light.js';
import { CASTS } from '../../src/world/shadow.js';
import { SHOULDER_RHYTHM, STATURE } from '../../src/world/physics.js';
import { PERSON } from '../../world/scale.js';
import { MOVES as HUMAN } from './human.js';

const PI = Math.PI, TAU = 2 * PI, SIDES = [['L', 'Left', 1], ['R', 'Right', -1]];
const eased = (v, to, k) => v + (to - v) * k, turnTo = (a, to) => Math.atan2(Math.sin(to - a), Math.cos(to - a));

// ── the skeleton, by the human kit's names ─────────────────────────────────────────────────────────────────────────
const BONE = { hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head' };
for (const [s, side] of SIDES) Object.assign(BONE, { ['clavicle.' + s]: side + 'Shoulder', ['upperArm.' + s]: side + 'Arm', ['foreArm.' + s]: side + 'ForeArm', ['hand.' + s]: side + 'Hand', ['thigh.' + s]: side + 'UpLeg', ['shin.' + s]: side + 'Leg', ['foot.' + s]: side + 'Foot' });
// (a bone of an arm is turned from where the arm hangs, not from where it came: the frame it is turned in and its
// parent's, each the arm's own hang or the collar bone's share of it; the turn is parent⁻¹ · turn · own)
const FRAME = { clavicle: ['collar', null], upperArm: ['arm', 'collar'], foreArm: ['arm', 'arm'], hand: ['arm', 'arm'] };

// ── the moves ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The human kit's three (walk, idle, wave: the same poses, so a figure moves as the Settler does), a cheer, and the
// pose the figure came in. `out`: the arms left out as they came (no bringing down).
const human = (id) => HUMAN.find((m) => m.id === id);
export const MOVES = [
  ...['idle', 'walk', 'wave'].map((id) => ({ ...human(id), pose: (t) => human(id).pose(t, { lean: 0 }) })),
  { id: 'cheer', name: 'Cheer', about: 'Both arms up, a spring in the knees.',
    pose(t) {
      const out = human('idle').pose(t, { lean: 0 }), b = Math.sin(t * TAU * 1.5), up = 0.5 + 0.5 * b;
      for (const [s, , sg] of SIDES) {
        out['clavicle.' + s] = [0, 0, sg * 0.22]; out['upperArm.' + s] = [-0.2, 0, sg * (2.45 + 0.12 * up)]; out['foreArm.' + s] = [-0.1, 0, sg * (0.25 + 0.2 * up)]; out['hand.' + s] = [0, 0, sg * 0.1 * b];
        out['thigh.' + s] = [-0.16 * (1 - up), 0, 0]; out['shin.' + s] = [0.34 * (1 - up), 0, 0]; out['foot.' + s] = [-0.18 * (1 - up), 0, 0];
      }
      out.chest = [-0.06 * up, 0, 0]; out.neck = [-0.08 * up, 0, 0]; out.head = [-0.12 * up, 0, 0];
      return out;
    } },
  { id: 'came', name: 'As it came', about: 'Arms out, as it was bound.', out: true, still: true, pose: () => ({}) },
];
const moveOf = (id) => MOVES.find((m) => m.id === id);

// ── the expressions ────────────────────────────────────────────────────────────────────────────────────────────────
// Each: the weights of the face's shapes at time t (by their makers' names, without `h_expressions.` and `_h`).
const both = (n, v) => ({ ['R' + n]: v, ['L' + n]: v });
const SOUNDS = ['AE_AA', 'TD_I', 'Ax_E', 'MPB_Up', 'UH_OO', 'S', 'AO_a', 'FV', 'Ax_E', 'KG', 'UW_U', null, 'H_EST', 'AE_AA', 'SH_CH', 'TD_I', 'MPB_Down', 'AO_a', null];   // (null: the mouth at rest between words)
export const EXPRESSIONS = [
  { id: 'rest', name: 'At rest', about: 'As it came; the lids blink.', shapes: () => ({}) },
  { id: 'smile', name: 'Smile', about: 'Closed, the eyes narrowing.', shapes: () => ({ ...both('smileClose', 0.85), ...both('squint', 0.16), ...both('lowLid', 0.22) }) },
  { id: 'laugh', name: 'Laugh', about: 'Open, over the teeth.',
    shapes: (t) => { const k = 0.5 + 0.5 * Math.sin(t * 5.2); return { ...both('smileOpen', 0.82 + 0.1 * k), MouthOpen: 0.12 + 0.14 * k, ...both('squint', 0.28), ...both('lowLid', 0.26), RRbrowUp: 0.2, LLbrowUp: 0.2 }; } },
  { id: 'surprise', name: 'Surprise', about: 'Brows up, eyes wide, mouth open.', shapes: () => ({ RRbrowUp: 0.9, RbrowUp: 0.9, LbrowUp: 0.9, LLbrowUp: 0.9, ...both('eyeOpen', 0.9), MouthOpen: 0.42 }) },
  { id: 'sad', name: 'Sad', about: 'Inner brows up, mouth corners down.', shapes: () => ({ ...both('sad', 0.85), ...both('mouthSad', 0.75), ...both('pityful', 0.5), Chin: 0.3 }) },
  { id: 'closed', name: 'Eyes closed', about: 'Lids shut, at peace.', shapes: () => ({ ...both('eyeClose', 1), ...both('smileClose', 0.3) }) },
  { id: 'speak', name: 'Speaking', about: 'The mouth through the sounds of speech.',
    shapes: (t) => { const f = t / 0.15, i = Math.floor(f), u = f - i, e = u * u * (3 - 2 * u), a = SOUNDS[i % SOUNDS.length], b = SOUNDS[(i + 1) % SOUNDS.length], out = {}; if (a) out[a] = 1 - e; if (b) out[b] = (out[b] ?? 0) + e; return out; } },
];
// the lids: a blink now and then, a fifth of a second (at a time of its own from blink to blink)
const blinkAt = (t) => { const T = 3.4, k = Math.floor(t / T), at = (((k * 0.618034) % 1) * 0.6 + 0.2) * T, d = Math.abs(t - k * T - at) / 0.09; return d < 1 ? 1 - d * d : 0; };

// ── a figure's recipe ──────────────────────────────────────────────────────────────────────────────────────────────
/** How tall grown ones of a sex stand, as a recipe's measure (world/scale.js): typical from the first to the last of a
    hundred (2.326 standard deviations either side of the mean), and none counted taller than four over it. */
const statureOf = ({ mean, sd }) => ({ typical: [mean - 2.326 * sd, mean + 2.326 * sd].map((v) => Math.round(v * 1000) / 1000), most: Math.round((mean + 4 * sd) * 100) / 100 });
/** A figure's recipe: what every figure's is (its kind, its moves, its expressions, how it is made and measured), with
    its own. `sex`: whose stature it is measured against ('man', 'woman'). Its height is the reference body's until its
    file is read: then the kit measures it. */
export function figure(own) {
  const R = { kind: 'figure', height: PERSON.stature, moves: MOVES.map((m) => m.id), expressions: EXPRESSIONS.map((e) => e.id), ...own };
  R.measure = { ...statureOf(STATURE[own.sex]), ...own.measure };
  R.make = (tex, opts) => figureOf(tex, R, opts);
  return R;
}

// ── the look ───────────────────────────────────────────────────────────────────────────────────────────────────────
// One picture for the whole figure (its skin, its cloth, its eyes and teeth) and one of its relief; the wig its own.
// Lit as everything is (src/world/light.js): the sky's light, the sun past what shades it, the air. What a part is
// made of is not written in the picture, so its gloss is its mesh's: the eyes wet, the teeth smooth, the rest matt.
function materialOf({ map, relief, eye, gloss = [22, 0.035], wet = 0, hair = false }) {
  const m = new THREE.NodeMaterial(); m.eye = eye; if (hair) m.side = THREE.DoubleSide;
  // drawn into the shadow map pulled towards the light by the map's bias, so the shadow meets the feet (light.js: casterPull)
  m.positionNode = positionLocal.add(modelWorldMatrixInverse.mul(vec4(U.uSunDir, 0)).xyz.mul(casterPull().mul(U.uShadowPass)));
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar();
    If(unlit().not(), () => {   // (drawn into the shadow map, only its depth counts: no light)
      const w = positionWorld, t = uv(), a = map ? texture(map, t) : vec4(0.55, 0.5, 0.46, 1);
      if (hair) If(a.a.lessThan(0.4), () => { Discard(); });
      const V = normalize(eye.sub(w)), N0 = normalize(normalWorld), Nf = hair ? N0.mul(dot(N0, V).sign()) : N0;
      let n = Nf;
      if (relief) {   // (the relief turned onto the surface by how the picture lies on it here: the file brings no tangents)
        const r = texture(relief, t).xyz.mul(2).sub(1), dp1 = dFdx(w), dp2 = dFdy(w), d1 = dFdx(t), d2 = dFdy(t), p2 = cross(dp2, Nf), p1 = cross(Nf, dp1);
        const T = p2.mul(d1.x).add(p1.mul(d2.x)), B = p2.mul(d1.y).add(p1.mul(d2.y)), k = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
        n = normalize(T.mul(k).mul(r.x).sub(B.mul(k).mul(r.y)).add(Nf.mul(r.z)));
      }
      const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w)));
      const L = U.uSunDir, H = normalize(V.add(L)), ndl = dot(n, L), nv = max(dot(n, V), 0), ndh = max(dot(n, H), 0), wrap = hair ? 0.3 : 0.4;
      const diff = max(ndl.add(wrap).div(wrap + 1), 0), fres = pow(float(1).sub(nv), 5).mul(0.96).add(0.04);
      const spec = pow(ndh, gloss[0]).mul((gloss[0] + 8) / (8 * PI)).mul(gloss[1]).mul(fres.mul(6));
      // (what is wet gives the sky back too: the light of a window in an eye)
      const glint = wet ? pow(max(dot(reflect(V.negate(), n), normalize(vec3(0, 0.75, 0).add(V.mul(0.65)))), 0), 90).mul(wet) : float(0);
      const lit = a.rgb.mul(skyLight(n).add(sun.mul(diff))).add(sun.mul(spec.mul(max(ndl, 0)))).add(skyLight(vec3(0, 1, 0)).mul(glint));
      out.assign(finish(lit, w, eye));
    });
    return out;
  })();
  return m;
}
const kindOf = (name) => [['hair', /wig|hair/i], ['eye', /eye/i], ['gland', /gland/i], ['teeth', /teeth/i]].find(([, re]) => re.test(name))?.[0] ?? 'body';
/** Each mesh in its look: one material a kind of part and picture (the file's own pictures on each). */
function dress(meshes, wears, pictures, eye) {
  const LOOK = { eye: { gloss: [260, 1.1], wet: 0.55 }, gland: { gloss: [90, 0.3], wet: 0.12 }, teeth: { gloss: [70, 0.22] }, hair: { gloss: [18, 0.05], hair: true }, body: {} }, made = new Map();
  for (const m of meshes) {
    const kind = kindOf(m.name), w = wears[m.name] ?? {}, key = `${kind} ${w.map}`;
    if (!made.has(key)) made.set(key, materialOf({ ...LOOK[kind], eye, map: pictures[w.map] ?? null, relief: (kind === 'body' && pictures[w.relief]) || null }));
    m.material.dispose?.(); m.material = made.get(key); m.frustumCulled = false; m.layers.enable(CASTS);   // a figure casts a shadow, wherever one is drawn (src/world/shadow.js)
  }
}

// ── the file ───────────────────────────────────────────────────────────────────────────────────────────────────────
let reader = null;
const readerOf = () => (reader ||= Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]).then(([g, m]) => new g.GLTFLoader().setMeshoptDecoder(m.MeshoptDecoder)));
/** The file taken apart: itself without its pictures (`glb`: the reader reads its points, bones and shapes; its
    pictures are decoded here, each once), which pictures each mesh wears (`wears`: by the mesh's name, its colour's and
    its relief's place in `images`), and the pictures' own bytes. */
function opened(buf) {
  const n = new DataView(buf).getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, n))), bin = 20 + n + 8;
  const imageOf = (t) => { const T = t ? J.textures[t.index] : null; return T ? T.extensions?.EXT_texture_webp?.source ?? T.source : null; }, wears = {};
  for (const node of J.nodes) { const mesh = J.meshes[node.mesh], mat = mesh && J.materials?.[mesh.primitives[0].material]; if (mesh) wears[node.name ?? mesh.name] = { map: imageOf(mat?.pbrMetallicRoughness?.baseColorTexture), relief: imageOf(mat?.normalTexture) }; }
  const images = (J.images ?? []).map((im) => { const v = J.bufferViews[im.bufferView]; return { type: im.mimeType, bytes: new Uint8Array(buf, bin + (v.byteOffset ?? 0), v.byteLength) }; });
  for (const k of ['materials', 'textures', 'images', 'samplers']) delete J[k];
  for (const m of J.meshes) for (const p of m.primitives) delete p.material;
  for (const k of ['extensionsUsed', 'extensionsRequired']) if (J[k]) J[k] = J[k].filter((e) => e !== 'EXT_texture_webp');
  const text = new TextEncoder().encode(JSON.stringify(J)), pad = (4 - (text.length % 4)) % 4, rest = new Uint8Array(buf, 20 + n), out = new Uint8Array(20 + text.length + pad + rest.length), o = new DataView(out.buffer);
  out.set(new Uint8Array(buf, 0, 12)); o.setUint32(8, out.length, true); o.setUint32(12, text.length + pad, true); o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20); out.fill(0x20, 20 + text.length, 20 + text.length + pad); out.set(rest, 20 + text.length + pad);
  return { glb: out.buffer, wears, images };
}
/** A picture decoded for the GPU, as the file's points want it (not turned over). Where nothing decodes a picture (a
    run with no browser: tools/scale.js) it fails, and the figure stands without it: its points are enough to measure. */
async function pictureOf(im, colour) {
  const t = new THREE.Texture(await createImageBitmap(new Blob([im.bytes], { type: im.type })));
  t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

// ── the figure at rest ─────────────────────────────────────────────────────────────────────────────────────────────
/** A turn made in the world's axes as a bone lies at rest, as the bone's own: own · world⁻¹ · turn · world (each bone's
    own turn at rest, and how it lies in the figure through all its parents). */
function turnerOf(bones) {
  const rest = new Map(), of = (b) => { let r = rest.get(b); if (!r) { const p = b.parent?.isBone ? of(b.parent).world : new THREE.Quaternion(); r = { world: p.clone().multiply(b.quaternion) }; r.pre = b.quaternion.clone().multiply(r.world.clone().invert()); rest.set(b, r); } return r; };
  for (const b of Object.values(bones)) of(b);
  return { lies: (b) => rest.get(b).world, turn: (b, D) => { const r = rest.get(b); b.quaternion.copy(r.pre).multiply(D).multiply(r.world); } };
}
/** How each arm is brought down from the pose it came in: the turn that lays it straight down (`arm`), and the collar
    bone's share of it (`collar`: as an arm is let down, a third of the way is the shoulder's own). */
function hangOf(bones) {
  const at = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld), down = new THREE.Vector3(0, -1, 0), out = {};
  for (const [s, side] of SIDES) {
    const a = bones[side + 'Arm'], f = bones[side + 'ForeArm']; if (!a || !f) continue;
    const arm = new THREE.Quaternion().setFromUnitVectors(at(f).sub(at(a)).normalize(), down); out[s] = { arm, collar: new THREE.Quaternion().slerp(arm, SHOULDER_RHYTHM) };
  }
  return out;
}
/** Where it stands: its lowest and highest point as its bones hold it now (m, in its own frame). */
function standsOf(meshes) {
  const v = new THREE.Vector3(); let low = Infinity, top = -Infinity;
  for (const m of meshes) for (let i = 0, n = m.geometry.attributes.position.count; i < n; i++) { const y = m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).y; low = Math.min(low, y); top = Math.max(top, y); }
  return { low, top };
}
/** The soles: heel, ball and toe under each foot, each in its bone's own frame (the figure's lowest point is its soles'). */
function solesOf(bones, low) {
  const inv = new THREE.Matrix4(), at = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld), under = (b, back) => { const p = at(b); return { bone: b, p: new THREE.Vector3(p.x, low, p.z - back).applyMatrix4(inv.copy(b.matrixWorld).invert()) }; };
  return SIDES.flatMap(([, side]) => [[bones[side + 'Foot'], 0.05], [bones[side + 'ToeBase'], 0], [bones[side + 'ToeEnd'], 0]]).filter(([b]) => b).map(([b, back]) => under(b, back));
}
/** The face: its shapes by their makers' names, the lower teeth's by the face's (its tongue's left alone), and how far
    each stands now (`w`). */
function faceOf(meshes) {
  const body = meshes.find((m) => m.morphTargetDictionary && Object.keys(m.morphTargetDictionary).length > 40), teeth = meshes.find((m) => m !== body && m.morphTargetDictionary);
  if (!body) return null;
  const key = (n) => n.replace(/^h_(expressions|teeth)\./, '').replace(/_h$/, ''), shapes = Object.entries(body.morphTargetDictionary).map(([n, i]) => [key(n), i]);
  const jaw = teeth ? Object.entries(teeth.morphTargetDictionary).map(([n, i]) => [key(n).replace(/^t_/, ''), i]).filter(([n]) => !n.endsWith('_tg')) : [];
  return { body, teeth, shapes, jaw, w: Object.fromEntries(shapes.map(([n]) => [n, 0])) };
}

// ── the figure moving: each a part of its step ─────────────────────────────────────────────────────────────────────
/** Its bones as its move asks (blended from the move before over a moment): each turned in its own frame. */
function pose(F, S, e) {
  const mv = moveOf(S.move), from = S.from && e < 1 ? moveOf(S.from) : null, A = mv.pose(S.t), B = from ? from.pose(S.t) : A;
  const hung = 1 - ((mv.out ? e : 0) + (from?.out ? 1 - e : 0)), Q = F.q, D = F.d, E = F.e;   // (hung: how far the arms are brought down)
  for (const c of F.carried) {
    const a = A[c.name] ?? [0, 0, 0], b = B[c.name] ?? [0, 0, 0];
    Q.setFromEuler(E.set(eased(b[0], a[0], e), eased(b[1], a[1], e), eased(b[2], a[2], e), 'XYZ'));
    if (c.F) Q.multiply(D.identity().slerp(c.F, hung));
    if (c.PF) Q.premultiply(D.identity().slerp(c.PF, hung).invert());
    F.turn(c.bone, Q);
  }
}
/** Where it stands and how it is turned: walking, round its origin and facing the way it goes; waving, to the eye (as
    a person of the human kit does). */
function walk(F, S, dt, e, eyeAt) {
  const mv = moveOf(S.move), walks = (S.move === 'walk' ? e : 0) + (S.from === 'walk' ? 1 - e : 0), o = F.object;
  if (walks > 0) { S.a += (human('walk').speed * dt * walks) / S.R; S.yaw += turnTo(S.yaw, -S.a) * Math.min(1, dt * 8); }
  o.position.set(S.R * Math.cos(S.a), 0, S.R * Math.sin(S.a));
  if (mv.face && eyeAt) S.yaw += turnTo(S.yaw, Math.atan2(eyeAt.x - o.position.x, eyeAt.z - o.position.z)) * Math.min(1, dt * 3);
  o.rotation.y = S.yaw;
}
/** The feet on the ground: the hips let down (or up) till the lowest sole touches it. */
function ground(F) {
  const o = F.object; F.hips.position.y = F.hips0; o.updateMatrixWorld(true);
  let low = Infinity; for (const s of F.soles) low = Math.min(low, F.v.copy(s.p).applyMatrix4(s.bone.matrixWorld).y);
  if (F.soles.length) F.hips.position.y = F.hips0 - (low - (o.parent ? o.parent.matrixWorld.elements[13] : 0));
  o.updateMatrixWorld(true);
}
/** The eyes: to whoever looks, where that is before the face and not far to the side; else ahead, wandering a little. */
function gaze(F, S, dt, eyeAt) {
  let yaw = 0.05 * Math.sin(S.t * 0.9) + 0.03 * Math.sin(S.t * 2.3), up = 0.02 * Math.sin(S.t * 1.4);
  if (eyeAt && F.head && !moveOf(S.move).still) {
    const v = F.v.copy(F.eye.value).sub(F.head.getWorldPosition(F.h)).applyQuaternion(F.head.getWorldQuaternion(F.q).multiply(F.headRest).invert());   // (from the head to the eye, as the head is turned now)
    const y = Math.atan2(v.x, v.z), p = Math.atan2(v.y, Math.hypot(v.x, v.z));
    if (Math.abs(y) < 0.75 && Math.abs(p) < 0.5) { yaw = Math.max(-0.5, Math.min(0.5, y)); up = Math.max(-0.3, Math.min(0.3, p)); }
  }
  const k = dt > 0 ? Math.min(1, dt * 9) : 1; S.gaze[0] = eased(S.gaze[0], yaw, k); S.gaze[1] = eased(S.gaze[1], up, k);
  F.q.setFromEuler(F.e.set(-S.gaze[1], S.gaze[0], 0, 'YXZ')); for (const b of F.eyes) F.turn(b, F.q);
}
/** The face: towards its expression's shapes over a moment, the lids blinking over them; the lower teeth with the jaw. */
function express(F, S, dt) {
  const f = F.face, want = EXPRESSIONS.find((x) => x.id === S.face).shapes(S.t), blink = S.face === 'closed' ? 0 : blinkAt(S.t), k = dt > 0 ? Math.min(1, dt * 11) : 1;
  for (const [n, i] of f.shapes) { const lid = n === 'ReyeClose' || n === 'LeyeClose'; f.w[n] = eased(f.w[n], Math.max(want[n] ?? 0, lid ? blink : 0), k); f.body.morphTargetInfluences[i] = f.w[n]; }
  for (const [n, i] of f.jaw) f.teeth.morphTargetInfluences[i] = n === 'MPB' ? Math.max(f.w.MPB_Up ?? 0, f.w.MPB_Down ?? 0) : f.w[n] ?? 0;
}

/** The file read and the figure stood: everything its step works on (F). Measured on its own, before it is hung on
    its object: what is measured is in the figure's own frame. */
async function read(R, eye) {
  const [loader, buf] = await Promise.all([readerOf(), fetch(R.file).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} for the figure's file`))))]);
  const { glb, wears, images } = opened(buf), colours = new Set(Object.values(wears).map((w) => w.map));
  const [scene, pictures] = await Promise.all([loader.parseAsync(glb, '').then((g) => g.scene), Promise.all(images.map((im, i) => pictureOf(im, colours.has(i)).catch(() => null)))]);
  const meshes = [], bones = {}; scene.traverse((o) => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) meshes.push(o); });
  const face = faceOf(meshes); if (!face || !bones.Hips) throw new Error('not a figure of this kind: no body with its shapes, or no hips');
  dress(meshes, wears, pictures, eye); scene.updateMatrixWorld(true);
  const T = turnerOf(bones), hang = hangOf(bones), stands = standsOf(meshes);
  const carried = Object.entries(BONE).filter(([, n]) => bones[n]).map(([name, n]) => { const [k, s] = name.split('.'), fr = FRAME[k] ?? []; return { name, bone: bones[n], F: hang[s]?.[fr[0]] ?? null, PF: hang[s]?.[fr[1]] ?? null }; });
  return { scene, meshes, bones, face, pictures, stands, carried, turn: T.turn, soles: solesOf(bones, stands.low), hips: bones.Hips, hips0: bones.Hips.position.y, head: bones.Head, headRest: bones.Head ? T.lies(bones.Head).clone().invert() : null,
    eyes: SIDES.map(([, side]) => bones[side + 'Eye']).filter(Boolean), eye, q: new THREE.Quaternion(), d: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), h: new THREE.Vector3() };
}

export function figureOf(tex, R, { eye = uniform(U.uCam.value) } = {}) {
  const object = new THREE.Group(), holder = new THREE.Bone(); object.add(holder);
  const S = { move: 'idle', from: null, k: 1, t: 0, a: 0, yaw: 0, R: R.walkRound ?? 1.5, face: R.expression ?? 'rest', gaze: [0, 0] };
  const api = { object, mesh: null, bones: { root: holder }, skeleton: null, faces: 0, height: R.height, bonesCount: 0, stands: null, failed: null, note: 'Being fetched…',
    moves: MOVES.map(({ id, name, about }) => ({ id, name, about })), expressions: EXPRESSIONS.map(({ id, name, about }) => ({ id, name, about })),
    get move() { return S.move; }, get expression() { return S.face; },
    setMove(id) { if (id === S.move || !moveOf(id)) return; S.from = S.move; S.k = 0; S.move = id; },
    setExpression(id) { if (EXPRESSIONS.some((e) => e.id === id)) S.face = id; },
    step() {}, dispose() { api.disposed = true; },
  };
  api.grown = read(R, eye).then((F) => {
    F.object = object; object.remove(holder); object.add(F.scene);
    const count = F.meshes[0].skeleton.bones.length;
    Object.assign(api, { mesh: F.face.body, skeleton: F.face.body.skeleton, bones: { root: F.hips, ...F.bones }, bonesCount: count, stands: F.stands, height: F.stands.top - Math.max(0, F.stands.low), note: undefined,
      faces: F.meshes.reduce((t, m) => t + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0), figures: [[count, '', 'Bones'], [F.face.shapes.length, '', 'Shapes']] });
    api.step = (dt, eyeAt) => {
      S.t += dt; S.k = Math.min(1, S.k + dt / 0.45);
      const e = S.k * S.k * (3 - 2 * S.k);
      pose(F, S, e); walk(F, S, dt, e, eyeAt); ground(F); gaze(F, S, dt, eyeAt); express(F, S, dt);
      object.updateMatrixWorld(true);
    };
    api.dispose = () => { api.disposed = true; for (const m of F.meshes) { m.geometry.dispose(); m.material.dispose?.(); } for (const t of F.pictures) t?.dispose(); F.face.body.skeleton.dispose?.(); };
    api.step(0); api.onGrown?.();
    return api;
  }).catch((err) => { api.failed = String(err?.message ?? err); api.note = `Not fetched: ${api.failed}`; api.onGrown?.(); return api; });
  return api;
}
