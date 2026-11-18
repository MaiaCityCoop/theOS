// A figure brought in whole (intent 0041): a person made elsewhere and kept as one file (characters/figures/*.glb):
// the body in its clothes, the eyes, the teeth and the hair, bound to a skeleton of its own, the face with shapes of
// its own. The first of the library that is not grown from our own numbers: the figures are VALID's (the Validated
// Avatar Library for Inclusion and Diversity, Do, Zelenty, Gonzalez-Franco & McMahan 2023, MIT: figures/LICENSE).
// What is ours here is how it stands in the world: its light, its shadow, its moves and its face's expressions.
//
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
// arms out, so a turn is made in the world's axes as they are at its rest, and its arms are first brought down.
// The expressions are weights of the face's own shapes (65, named by its makers), the lower teeth's with them.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, uv, texture, positionWorld, positionLocal, normalWorld, modelWorldMatrixInverse, uniform, float, vec3, vec4, normalize, max, pow, dot, cross, dFdx, dFdy, inverseSqrt, reflect } from 'three/tsl';
import { U } from '../../src/core/uniforms.js';
import { finish, skyLight, unlit, sunDim, cloudShade, shadowAtPulled, casterPull } from '../../src/world/light.js';
import { CASTS } from '../../src/world/shadow.js';
import { MOVES as HUMAN } from './human.js';

const PI = Math.PI, TAU = 2 * PI, SIDES = [['L', 'Left', 1], ['R', 'Right', -1]];

// ── the skeleton, by the human kit's names ─────────────────────────────────────────────────────────────────────────
const BONE = { hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head' };
for (const [s, side] of SIDES) Object.assign(BONE, { ['clavicle.' + s]: side + 'Shoulder', ['upperArm.' + s]: side + 'Arm', ['foreArm.' + s]: side + 'ForeArm', ['hand.' + s]: side + 'Hand', ['thigh.' + s]: side + 'UpLeg', ['shin.' + s]: side + 'Leg', ['foot.' + s]: side + 'Foot' });
const ARMS = 1.5;     // how far the arms are brought down from the pose the figure comes in, arms out (radians)
const DROP = 0.17;    // how much of that the shoulder takes: the collar bone let down, as it is when an arm hangs
const CURL = 0.2;     // each finger joint's bend at ease (it comes with its fingers straight)

// ── the moves ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The human kit's three (walk, idle, wave: the same poses, so a figure moves as the Settler does), a cheer, and the
// pose the figure came in. `out`: the arms left out as they came (no bringing down).
const human = (id) => HUMAN.find((m) => m.id === id), LEAN = { lean: 0 };
export const MOVES = [
  ...['idle', 'walk', 'wave'].map((id) => ({ ...human(id), pose: (t) => human(id).pose(t, LEAN) })),
  { id: 'cheer', name: 'Cheer', about: 'Both arms up, a spring in the knees.',
    pose(t) {
      const out = human('idle').pose(t, LEAN), b = Math.sin(t * TAU * 1.5), up = 0.5 + 0.5 * b;
      for (const [s, , sg] of SIDES) {
        out['clavicle.' + s] = [0, 0, sg * 0.22]; out['upperArm.' + s] = [-0.2, 0, sg * (2.45 + 0.12 * up)]; out['foreArm.' + s] = [-0.1, 0, sg * (0.25 + 0.2 * up)]; out['hand.' + s] = [0, 0, sg * 0.1 * b];
        out['thigh.' + s] = [-0.16 * (1 - up), 0, 0]; out['shin.' + s] = [0.34 * (1 - up), 0, 0]; out['foot.' + s] = [-0.18 * (1 - up), 0, 0];
      }
      out.chest = [-0.06 * up, 0, 0]; out.neck = [-0.08 * up, 0, 0]; out.head = [-0.12 * up, 0, 0];
      return out;
    } },
  { id: 'came', name: 'As it came', about: 'Arms out, as it was bound.', out: true, still: true, pose: () => ({}) },
];

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

// ── the file ───────────────────────────────────────────────────────────────────────────────────────────────────────
let reader = null;
const readerOf = () => (reader ||= Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]).then(([g, m]) => new g.GLTFLoader().setMeshoptDecoder(m.MeshoptDecoder)));
// (where nothing decodes a picture, tools/scale.js under bun, the figure is read without its pictures: its points are enough to measure it)
const PLAIN = typeof createImageBitmap === 'undefined' && typeof document === 'undefined';
function bare(buf) {
  const dv = new DataView(buf), n = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, n)));
  for (const k of ['materials', 'textures', 'images', 'samplers']) delete J[k];
  for (const m of J.meshes) for (const p of m.primitives) delete p.material;
  for (const k of ['extensionsUsed', 'extensionsRequired']) if (J[k]) J[k] = J[k].filter((e) => e !== 'EXT_texture_webp');
  const text = new TextEncoder().encode(JSON.stringify(J)), pad = (4 - (text.length % 4)) % 4, rest = new Uint8Array(buf, 20 + n), out = new Uint8Array(20 + text.length + pad + rest.length), o = new DataView(out.buffer);
  out.set(new Uint8Array(buf, 0, 12)); o.setUint32(8, out.length, true); o.setUint32(12, text.length + pad, true); o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20); out.fill(0x20, 20 + text.length, 20 + text.length + pad); out.set(rest, 20 + text.length + pad);
  return out.buffer;
}

export function figureOf(tex, R, { eye = uniform(U.uCam.value) } = {}) {
  const object = new THREE.Group(), holder = new THREE.Bone();
  const S = { move: 'idle', from: null, k: 1, t: 0, a: 0, yaw: 0, R: R.walkRound ?? 1.5, face: R.expression ?? 'rest', w: {}, gaze: [0, 0] };
  const moveOf = (id) => MOVES.find((m) => m.id === id);
  const api = { object, mesh: null, bones: { root: holder }, skeleton: null, faces: 0, height: R.height, bonesCount: 0, stands: null, failed: null,
    note: 'Being fetched…',
    moves: MOVES.map(({ id, name, about }) => ({ id, name, about })), expressions: EXPRESSIONS.map(({ id, name, about }) => ({ id, name, about })),
    get move() { return S.move; }, get expression() { return S.face; },
    setMove(id) { if (id === S.move || !moveOf(id)) return; S.from = S.move; S.k = 0; S.move = id; },
    setExpression(id) { if (EXPRESSIONS.some((e) => e.id === id)) S.face = id; },
    step() {}, dispose() { api.disposed = true; },
  };
  object.add(holder);

  api.grown = (async () => {
    const [loader, buf] = await Promise.all([readerOf(), fetch(R.file).then((r) => { if (!r.ok) throw new Error(`${r.status} for the figure's file`); return r.arrayBuffer(); })]);
    const scene = (await loader.parseAsync(PLAIN ? bare(buf) : buf, '')).scene, meshes = [], bones = {};
    scene.traverse((o) => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) meshes.push(o); });
    const body = meshes.find((m) => m.morphTargetDictionary && Object.keys(m.morphTargetDictionary).length > 40), teeth = meshes.find((m) => m !== body && m.morphTargetDictionary);
    if (!body || !bones.Hips) throw new Error('not a figure of this kind: no body with its shapes, or no hips');
    // its look: one material a kind of part (the file's own pictures on each)
    if (!PLAIN) {
      const made = new Map(), of = (key, o) => { if (!made.has(key)) made.set(key, materialOf(o)); return made.get(key); };
      api.pictures = new Set();
      for (const m of meshes) {
        const src = m.material, map = src.map ?? null, relief = src.normalMap ?? null, n = m.name.toLowerCase(), kind = /wig|hair/.test(n) ? 'hair' : /eye/.test(n) ? 'eye' : /gland/.test(n) ? 'gland' : /teeth/.test(n) ? 'teeth' : 'body';
        m.material = of(kind + (map?.uuid ?? ''), { map, relief: kind === 'body' ? relief : null, eye, hair: kind === 'hair', gloss: { eye: [260, 1.1], gland: [90, 0.3], teeth: [70, 0.22], hair: [18, 0.05], body: [22, 0.035] }[kind], wet: kind === 'eye' ? 0.55 : kind === 'gland' ? 0.12 : 0 });
        for (const t of [map, src.normalMap]) if (t) api.pictures.add(t);
        src.dispose?.(); m.layers.enable(CASTS);   // a figure casts a shadow, wherever one is drawn (src/world/shadow.js)
      }
    }
    for (const m of meshes) { m.frustumCulled = false; api.faces += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; }
    scene.updateMatrixWorld(true);   // (still on its own: what is measured below is in the figure's own frame)

    // each bone at rest: its own turn, and how it lies in the figure (its turn through all its parents)
    const rest = new Map(), inFigure = (b) => { let r = rest.get(b); if (!r) { const p = b.parent?.isBone ? inFigure(b.parent).world : new THREE.Quaternion(); r = { own: b.quaternion.clone(), world: p.clone().multiply(b.quaternion) }; r.pre = r.own.clone().multiply(r.world.clone().invert()); rest.set(b, r); } return r; };
    for (const b of Object.values(bones)) inFigure(b);
    // (a turn D, made in the world's axes as the bone lies at rest, as the bone's own: own · world⁻¹ · D · world)
    const turn = (b, D) => { const r = rest.get(b); b.quaternion.copy(r.pre).multiply(D).multiply(r.world); };
    const Z = new THREE.Vector3(0, 0, 1), down = Object.fromEntries(SIDES.map(([s, , sg]) => [s, new THREE.Quaternion().setFromAxisAngle(Z, -sg * ARMS)])), drop = Object.fromEntries(SIDES.map(([s, , sg]) => [s, new THREE.Quaternion().setFromAxisAngle(Z, -sg * DROP)]));
    const ONE = new THREE.Quaternion();
    // (a bone of an arm is turned from where the arm hangs, not from where it came: its own frame F and its parent's PF, the turn PF⁻¹ · R · F)
    const carried = Object.entries(BONE).filter(([, n]) => bones[n]).map(([name, n]) => { const s = name.slice(-1), k = name.split('.')[0]; return { name, bone: bones[n], F: k === 'clavicle' ? drop[s] : /Arm|hand/.test(k) ? down[s] : null, PF: k === 'upperArm' ? drop[s] : /foreArm|hand/.test(k) ? down[s] : null }; });
    const fingers = SIDES.flatMap(([, side, sg]) => ['Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3].map((i) => ({ bone: bones[`${side}Hand${f}${i}`], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sg * CURL * (i === 1 ? 0.7 : 1)) })))).filter((f) => f.bone);
    const eyes = SIDES.map(([, side]) => bones[side + 'Eye']).filter(Boolean);

    // where it stands: its lowest and highest point as its bones hold it now, at rest (m)
    { const v = new THREE.Vector3(); let low = Infinity, top = -Infinity;
      for (const m of meshes) for (let i = 0, n = m.geometry.attributes.position.count; i < n; i++) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); if (v.y < low) low = v.y; if (v.y > top) top = v.y; }
      api.stands = { low, top }; api.height = top - Math.max(0, low); }
    // the soles: heel, ball and toe under each foot, each in its bone's own frame (the figure's lowest point is its soles')
    const inv = new THREE.Matrix4(), sole = (bone, x, z) => new THREE.Vector3(x, api.stands.low, z).applyMatrix4(inv.copy(bone.matrixWorld).invert()), at = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    const soles = SIDES.flatMap(([, side]) => { const f = bones[side + 'Foot'], tb = bones[side + 'ToeBase'], te = bones[side + 'ToeEnd']; if (!f) return []; const F = at(f), out = [{ bone: f, p: sole(f, F.x, F.z - 0.05) }]; if (tb) { const B = at(tb); out.push({ bone: tb, p: sole(tb, B.x, B.z) }); } if (te) { const E = at(te); out.push({ bone: te ?? tb, p: sole(te, E.x, E.z) }); } return out; });
    const hips = bones.Hips, hips0 = hips.position.y;
    object.remove(holder); object.add(scene);

    // the face: its shapes by their makers' names, the lower teeth's by the face's
    const key = (n) => n.replace(/^h_(expressions|teeth)\./, '').replace(/_h$/, ''), shapes = Object.entries(body.morphTargetDictionary).map(([n, i]) => [key(n), i]);
    const jaw = teeth ? Object.entries(teeth.morphTargetDictionary).map(([n, i]) => [key(n).replace(/^t_/, ''), i]).filter(([n]) => !n.endsWith('_tg')) : [];
    for (const [n] of shapes) S.w[n] = 0;

    const E = new THREE.Euler(), Q = new THREE.Quaternion(), D = new THREE.Quaternion(), v = new THREE.Vector3(), h = new THREE.Vector3(), headRest = rest.get(bones.Head)?.world.clone().invert();
    Object.assign(api, { mesh: body, skeleton: body.skeleton, bones: { root: hips, ...bones }, bonesCount: body.skeleton.bones.length, note: undefined, figures: [[body.skeleton.bones.length, '', 'Bones'], [shapes.length, '', 'Shapes']] });
    api.step = (dt, eyeAt) => {
      S.t += dt; S.k = Math.min(1, S.k + dt / 0.45);
      const e = S.k * S.k * (3 - 2 * S.k), mv = moveOf(S.move), from = S.from && e < 1 ? moveOf(S.from) : null, A = mv.pose(S.t), B = from?.pose(S.t);
      const out = (mv.out ? e : 0) + (from?.out ? 1 - e : 0);   // (how far the arms are left out, as it came)
      for (const c of carried) {
        const a = A[c.name], b = B ? B[c.name] : a, x = (k) => { const p = a ? a[k] : 0, q = b ? b[k] : 0; return q + (p - q) * e; };
        Q.setFromEuler(E.set(x(0), x(1), x(2)));
        if (c.F) Q.multiply(D.copy(ONE).slerp(c.F, 1 - out)); if (c.PF) Q.premultiply(D.copy(ONE).slerp(c.PF, 1 - out).invert());
        turn(c.bone, Q);
      }
      for (const f of fingers) turn(f.bone, D.copy(ONE).slerp(f.q, 1 - out));
      // walking: round its origin, facing the way it goes; waving: turned to the eye (as a person of the human kit does)
      const walkW = (S.move === 'walk' ? e : 0) + (S.from === 'walk' ? 1 - e : 0);
      if (walkW > 0) { S.a += (human('walk').speed * dt * walkW) / S.R; const ty = -S.a; S.yaw += Math.atan2(Math.sin(ty - S.yaw), Math.cos(ty - S.yaw)) * Math.min(1, dt * 8); }
      object.position.set(S.R * Math.cos(S.a), 0, S.R * Math.sin(S.a));
      if (mv.face && eyeAt) { const ty = Math.atan2(eyeAt.x - object.position.x, eyeAt.z - object.position.z); S.yaw += Math.atan2(Math.sin(ty - S.yaw), Math.cos(ty - S.yaw)) * Math.min(1, dt * 3); }
      object.rotation.y = S.yaw;
      // the feet on the ground: the hips let down (or up) till the lowest sole touches it
      hips.position.y = hips0; object.updateMatrixWorld(true);
      let low = Infinity; for (const s of soles) low = Math.min(low, v.copy(s.p).applyMatrix4(s.bone.matrixWorld).y);
      const ground = object.parent ? object.parent.matrixWorld.elements[13] : 0;
      if (soles.length) hips.position.y = hips0 - (low - ground);
      // the eyes: to whoever looks, where that is before it and not far to the side; else ahead, wandering a little
      let gy = 0.05 * Math.sin(S.t * 0.9) + 0.03 * Math.sin(S.t * 2.3), gp = 0.02 * Math.sin(S.t * 1.4);
      if (eyeAt && bones.Head && !mv.still) {
        object.updateMatrixWorld(true); bones.Head.getWorldPosition(h);
        v.copy(eye.value);   // (the eye, in the world: `eyeAt` says only that someone looks)
        v.sub(h).applyQuaternion(bones.Head.getWorldQuaternion(Q).multiply(headRest).invert());   // (from the head to it, as the head is turned now)
        const yw = Math.atan2(v.x, v.z), pt = Math.atan2(v.y, Math.hypot(v.x, v.z));
        if (Math.abs(yw) < 0.75 && Math.abs(pt) < 0.5) { gy = Math.max(-0.5, Math.min(0.5, yw)); gp = Math.max(-0.3, Math.min(0.3, pt)); }
      }
      const g = Math.min(1, dt * 9 + (dt === 0 ? 1 : 0)); S.gaze[0] += (gy - S.gaze[0]) * g; S.gaze[1] += (gp - S.gaze[1]) * g;
      Q.setFromEuler(E.set(-S.gaze[1], S.gaze[0], 0, 'YXZ')); for (const b of eyes) turn(b, Q);
      // the face: towards its expression's shapes over a moment, the lids blinking over them
      const want = EXPRESSIONS.find((x) => x.id === S.face).shapes(S.t), blink = S.face === 'closed' ? 0 : blinkAt(S.t), k = Math.min(1, dt * 11 + (dt === 0 ? 1 : 0));
      for (const [n, i] of shapes) { let t = want[n] ?? 0; if (n === 'ReyeClose' || n === 'LeyeClose') t = Math.max(t, blink); S.w[n] += (t - S.w[n]) * k; body.morphTargetInfluences[i] = S.w[n]; }
      for (const [n, i] of jaw) teeth.morphTargetInfluences[i] = n === 'MPB' ? Math.max(S.w.MPB_Up ?? 0, S.w.MPB_Down ?? 0) : S.w[n] ?? 0;
      object.updateMatrixWorld(true);
    };
    api.dispose = () => { api.disposed = true; for (const m of meshes) { m.geometry.dispose(); m.material.dispose?.(); } for (const t of api.pictures ?? []) t.dispose(); body.skeleton.dispose?.(); };
    api.step(0); api.onGrown?.();
    return api;
  })().catch((err) => { api.failed = String(err?.message ?? err); api.note = `Not fetched: ${api.failed}`; api.onGrown?.(); return api; });
  return api;
}
