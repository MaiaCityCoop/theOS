// The skeleton on the stage (intent 0036): every bone of the body (./skeleton.js) grown in the page, off its own
// thread, drawn as one surface that the rig's joints carry (each point held whole by one joint: bone does not bend),
// in the world's light; and its moves, made on the rig (./skeleton/pose.js).
//
//   skeletonOf(tex, recipe) -> { object, mesh, bones, skeleton, moves, faces, height, setMove(id), step(dt, eye), grown }
//     held by the library as a person of the human kit is (./human.js): the same card, the same clock
//     grown        kept when the bones stand at their full fineness: they come coarse within a few seconds, then fine
//                  (both are kept by the browser, so the next visit has them at once)
//     onGrown      called each time a finer surface is put on (the library draws its card again)
//     flesh        the muscles over the bones, for a recipe whose layers name them (characters/muscles.js): laid by the
//                  workers too (./muscles/build.js), carried by the same joints (./muscles/flesh.js); the bones under
//                  them at their coarser full fineness
//
// The bones' own code is not the page's to carry: it runs in the workers that grow them (./skeleton/grow.worker.js),
// and the rig's part of it comes when a skeleton is first made. So the game, which shows no skeleton, loads none of it.
//
// The moves are plain moves of the rig (a bend of the loins, a knee, an arm raised), shared out among its ninety joints
// and held within a body's ranges there. The walk's joint angles through a stride are gait analysis' curves, in a
// table of their own (GAIT); how far a step carries the body is not a number: the foot that stands on the ground
// stays where it stands, and the body goes over it.
import * as THREE from 'three/webgpu';
import { Fn, If, attribute, positionWorld, positionLocal, positionGeometry, normalWorld, modelWorldMatrixInverse, uniform, float, vec3, vec4, normalize, max, pow, mix, clamp, abs, dot, mx_noise_float } from 'three/tsl';
import { U } from '../../src/core/uniforms.js';
import { finish, skyLight, unlit, sunDim, cloudShade, shadowAtPulled, casterPull } from '../../src/world/light.js';
import { CASTS } from '../../src/world/shadow.js';
import { PART } from './skeleton/rig.js';
import { recipes, versionOf } from '../../src/core/registry.js';

const TAU = 2 * Math.PI, D = Math.PI / 180, SIDES = [['L', 1], ['R', -1]];
const LEG = 0.9;   // from the hip's joint to the sole (m): what a leg let out by an angle carries its foot aside by

// ── growing the bones ────────────────────────────────────────────────────────────────────────────────────────────────
// Two finenesses: a quick one to stand there at once (no shade of its hollows yet), then the full one. A phone, or a
// machine of few threads, keeps a coarser full one.
const few = typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency ?? 4) <= 4 || /Mobi|Android/.test(navigator.userAgent ?? ''));
const LEVELS = [{ h: 0.008, shade: 0, key: 'skeleton:0' }, { h: few ? 0.0055 : 0.0035, shade: 1, key: 'skeleton:1' }];
// Under muscles the bones show only here and there (the skull, the joints, the ribs between the muscles): their full
// fineness is a coarser one, so a body with its muscles costs no more to draw than the skeleton alone.
const UNDER = [LEVELS[0], { h: few ? 0.008 : 0.0055, shade: 1, key: few ? 'skeleton:h0.008' : 'skeleton:h0.0055' }];

// A few workers, each handed the next thing asked as it finishes one; let go when nothing has been asked for a while.
const POOL = { all: [], free: [], queue: [], idle: 0 };
function pump() {
  clearTimeout(POOL.idle);
  const most = Math.max(1, Math.min(6, (navigator.hardwareConcurrency ?? 4) - 1));
  while (POOL.queue.length && (POOL.free.length || POOL.all.length < most)) {
    let w = POOL.free.pop();
    if (!w) POOL.all.push((w = new Worker(new URL('./skeleton/grow.worker.js', import.meta.url), { type: 'module' })));
    const job = POOL.queue.shift();
    w.onmessage = ({ data }) => { POOL.free.push(w); job.res(data); pump(); };
    w.onerror = (e) => { POOL.all.splice(POOL.all.indexOf(w), 1); w.terminate(); job.rej(new Error(e.message || 'a worker could not grow the bones')); pump(); };
    w.postMessage(job.msg);
  }
  if (!POOL.queue.length && POOL.free.length === POOL.all.length) POOL.idle = setTimeout(() => { for (const w of POOL.all) w.terminate(); POOL.all.length = POOL.free.length = 0; }, 4000);
}
const ask = (msg) => new Promise((res, rej) => { POOL.queue.push({ msg, res, rej }); pump(); });

// What there is to grow: the bones' count and their order (asked of a worker once).
let ABOUT = null;
const about = () => (ABOUT ||= ask({ about: true }).then((d) => d.about));
// A grown surface is kept by the browser (IndexedDB) with the version of the character it was grown for: its hash in
// the registry (registry.json), of its file and of every kit file it reaches, these workers' too. Any of that changed,
// and it is grown again. (What is grown here is the same for every character that grows it: one kept under any
// character's version as it is now is good.) Where the browser keeps nothing, it is grown each time.
const kept = (mode, fn) => new Promise((res) => {
  try {
    const r = indexedDB.open('theos-grown', 1); r.onupgradeneeded = () => r.result.createObjectStore('surfaces'); r.onerror = () => res(null);
    r.onsuccess = () => { try { const q = fn(r.result.transaction('surfaces', mode).objectStore('surfaces')); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); } catch { res(null); } };
  } catch { res(null); }
});
const fresh = (hit) => !!hit?.version && recipes('character').some((r) => versionOf(r) === hit.version);
const HELD = {}, SURFACE = {};
const held = (L) => (HELD[L.key] ||= kept('readonly', (s) => s.get(L.key)).then((hit) => (fresh(hit) && hit.h === L.h ? hit : null)));
/** The bones' surface at a level, grown for the character of that version: { pieces, rigs, of, pos, nor, look, tri }:
 *  every point with the way it faces, what it is and how open it stands (look), and the joint that carries it (rigs[of]). */
function surface(L, version) {
  return (SURFACE[L.key] ||= (async () => {
    const hit = await held(L); if (hit) return hit;
    const A = await about(), parts = await Promise.all(A.order.map((i) => ask({ i, h: L.h, shade: L.shade })));
    let nv = 0, nt = 0, pieces = 0; for (const p of parts) if (!p.none) { nv += p.pos.length / 3; nt += p.tri.length; pieces++; }
    const out = { version, h: L.h, pieces, rigs: [], of: new Uint16Array(nv), pos: new Float32Array(nv * 3), nor: new Float32Array(nv * 3), look: new Float32Array(nv * 2), tri: new Uint32Array(nt) };
    let v0 = 0, t0 = 0;
    for (const p of parts) {
      if (p.none) continue;
      const k = p.pos.length / 3; let r = out.rigs.indexOf(p.rig); if (r < 0) r = out.rigs.push(p.rig) - 1;
      out.pos.set(p.pos, v0 * 3); out.nor.set(p.nor, v0 * 3); out.of.fill(r, v0, v0 + k);
      for (let v = 0; v < k; v++) { out.look[(v0 + v) * 2] = p.part[v]; out.look[(v0 + v) * 2 + 1] = p.open[v] / 255; }
      for (let t = 0; t < p.tri.length; t += 3) { out.tri[t0 + t] = p.tri[t] + v0; out.tri[t0 + t + 1] = p.tri[t + 2] + v0; out.tri[t0 + t + 2] = p.tri[t + 1] + v0; }   // (turned to face outwards as the GPU counts it: the field's own surface is wound the other way)
      v0 += k; t0 += p.tri.length;
    }
    kept('readwrite', (s) => s.put(out, L.key));
    return out;
  })());
}
// The muscles laid on the bones (./muscles/build.js), in a worker, kept by the browser as the bones are; and the page's
// part of them (./muscles/flesh.js), when a body with muscles is first made.
let MUSCLED = null, FLESH = null;
const muscled = (version) => (MUSCLED ||= (async () => {
  const hit = await kept('readonly', (s) => s.get('muscles'));
  if (fresh(hit)) return hit;
  const out = { ...(await ask({ muscles: true })).muscles, version };
  kept('readwrite', (s) => s.put(out, 'muscles'));
  return out;
})());
const fleshing = () => (FLESH ||= import('./muscles/flesh.js'));
// A body: the muscles and the fat and the skin over them (./skin/build.js), laid in a worker as one, kept as the rest.
// Its skin is drawn with cells of BODY_H (coarser on a phone or a machine of few threads).
const BODY_H = few ? 0.008 : 0.006, BODIED = {};
const bodied = (version) => (BODIED[BODY_H] ||= (async () => {
  const key = 'body:' + BODY_H, hit = await kept('readonly', (s) => s.get(key));
  if (fresh(hit)) return hit;
  const out = { ...(await ask({ body: true, h: BODY_H })).body, version };
  kept('readwrite', (s) => s.put(out, key));
  return out;
})());
// The rig's code, when a skeleton is first made (./skeleton/pose.js): its joints, and the turns a move gives them.
let POSE = null;
const posing = () => (POSE ||= import('./skeleton/pose.js').then((M) => ({ RIG: M.rigOf(), turnsOf: M.turnsOf, turnOf: M.turnOf })));

// ── the look: bone ───────────────────────────────────────────────────────────────────────────────────────────────────
// Its colour by what it is (bone, the bluish gristle of ribs and discs, a tooth's enamel), stained and mottled, warmer
// in its hollows; in the light as every surface of the world is (src/world/light.js): the sun past a storm's sky, the
// clouds and what casts a shadow, the sky's light as much as the hollows leave of it; a low gloss, more on a tooth.
function materialOf(eye) {
  const m = new THREE.NodeMaterial(); m.eye = eye;
  m.positionNode = positionLocal.add(normalize(modelWorldMatrixInverse.mul(vec4(U.uSunDir, 0)).xyz).mul(casterPull().mul(U.uShadowPass)));
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar();
    If(unlit().not(), () => {
      const w = positionWorld, P = positionGeometry, look = attribute('look', 'vec2'), part = look.x, open = clamp(look.y, 0, 1);   // (P: where the point is on the bone itself, so its stains go with it)
      const is = (k) => float(1).sub(clamp(abs(part.sub(k)), 0, 1)), gristle = is(PART.cartilage), tooth = is(PART.teeth);
      const stain = mx_noise_float(P.mul(38)).mul(0.5).add(0.5), mottle = mx_noise_float(P.mul(260)), grain = mx_noise_float(P.mul(900));
      const base = mix(mix(vec3(0.66, 0.56, 0.4), vec3(0.6, 0.63, 0.63), gristle), vec3(0.8, 0.76, 0.62), tooth);
      const warm = stain.sub(0.5).mul(0.7).add(float(1).sub(open).mul(0.8)), tone = float(0.8).add(stain.mul(0.36)).add(mottle.mul(0.07));
      const col = base.mul(tone).mul(vec3(1).sub(vec3(0.1, 0.3, 0.62).mul(warm)));
      const n = normalize(normalWorld.add(vec3(grain, mottle, grain.negate()).mul(0.06)));
      const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w)));
      const V = normalize(eye.sub(w)), L = U.uSunDir, ndl = dot(n, L), Hh = normalize(V.add(L)), ndh = max(dot(n, Hh), 0);
      const diff = max(ndl.add(0.18).div(1.18), 0).mul(mix(float(0.75), float(1), open));   // (a little of the light round its edge: bone lets some through)
      const gloss = mix(float(0.1), float(0.55), tooth), spec = pow(ndh, gloss.mul(160).add(14)).mul(gloss.mul(0.9).add(0.06));
      const lit = col.mul(skyLight(n).mul(open.mul(open)).add(sun.mul(diff))).add(sun.mul(spec).mul(max(ndl, 0)));
      out.assign(finish(lit, w, eye));
    });
    return out;
  })();
  return m;
}

// ── the moves ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A stride's joint angles (degrees; every twentieth of the stride from the heel's strike, the last the first again):
// the thigh forwards of the upright (+), the knee bent, the ankle with the toes up (+), the toes bent up at the ball.
// From gait analysis' curves for a man walking at his own pace (Winter, "The Biomechanics and Motor Control of Human
// Gait", 1991; Perry, "Gait Analysis", 1992), as remembered, then fitted to this skeleton's own legs: so that both feet
// can be on the ground together where a walk has them so (the first and the sixth tenth of a stride), the standing
// foot lies flat between, its sole goes back under the body at an even pace (as remembered it went at 0.8 to 2 m/s
// within one step; fitted, at 1.15 to 1.35 between the strike and the push), and the swinging foot clears the
// ground. (Gait analysis gives the hip's angle against a pelvis tipped some 10° forwards, so its figures are higher
// in front and lower behind than the thigh's here.)
export const GAIT = {
  hip: [23.5, 22.5, 22.5, 19.5, 14.5, 8, 2, -4, -9, -13.5, -17, -18, -12, -2, 8, 17, 23, 26, 26, 25, 23.5],
  knee: [5, 11, 16, 18, 16, 12, 9, 6, 5, 6, 9, 16, 32, 52, 62, 65, 62, 52, 32, 11, 5],
  ankle: [0.5, -4.5, -5, -0.5, 2.5, 6, 8, 11, 11, 10.5, 8, -6, -19, -20, -12, -4, 3, 6, 6, 3, 0.5],
  toes: [15, 6, 0, 0, 0, 0, 0, 0, 4, 12, 22, 38, 50, 30, 12, 5, 5, 8, 12, 15, 15],
  stride: 1.1,   // seconds
};
// a curve of the table at a place in the stride (0 … 1), smooth through its points
const gait = (a, c) => {
  const n = a.length - 1, f = (((c % 1) + 1) % 1) * n, i = Math.floor(f), t = f - i, p = (k) => a[((k % n) + n) % n], p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t) * D;
};
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const stand = (t) => {
  const b = Math.sin((t / 4.2) * TAU), w = Math.sin((t / 7.5) * TAU), look = Math.sin((t / 9) * TAU) * 0.4;
  const m = { hips: [0, 0, 0.025 * w], loins: [0.01 * b, 0, -0.03 * w], chest: [-0.02 * b, 0, 0], neck: [0.02, look * 0.3, 0], head: [0.02 * Math.sin(t * 0.7), look * 0.7, 0] };
  // (the pelvis tips over the legs, which stay upright under it: each hip takes the tip back)
  for (const [s, g] of SIDES) { m['hip.' + s] = [0.01, 0.02 - g * m.hips[2], 0]; m['knee.' + s] = 0.03 + Math.max(0, g * w) * 0.06; m['arm.' + s] = [0.02 * b, 0.06, 0]; m['elbow.' + s] = 0.14; }
  return m;
};
export const MOVES = [
  { id: 'stand', name: 'Stand', about: 'Standing at ease: the weight going from foot to foot, the head looking about.', pose: stand },
  { id: 'walk', name: 'Walk', about: 'A walk round the stage at a man\'s own pace: hip, knee, ankle and toes through a stride as gait analysis measures them, the pelvis turning under the chest, the arms against the legs. The foot on the ground stays where it stands.', walks: true,
    pose(t) {
      const c = t / GAIT.stride, co = Math.cos(c * TAU), si = Math.sin(c * TAU);
      const m = { hips: [0.03, -0.07 * co, 0.05 * si], loins: [0.03, 0.05 * co, -0.04 * si], chest: [0.02, 0.09 * co, 0], head: [-0.03, -0.05 * co, 0] };
      for (const [s, g] of SIDES) {
        const k = c + (g > 0 ? 0 : 0.5), sw = Math.cos(k * TAU);
        // (the feet a little under the body; the pelvis' tip taken back in each hip, so it drops on the swinging side
        // over an upright leg)
        m['hip.' + s] = [gait(GAIT.hip, k), -0.03 - g * m.hips[2], 0.03]; m['knee.' + s] = gait(GAIT.knee, k); m['ankle.' + s] = gait(GAIT.ankle, k); m['toes.' + s] = gait(GAIT.toes, k);
        m['arm.' + s] = [-0.3 * sw + 0.04, 0.05, 0]; m['elbow.' + s] = 0.28 + 0.2 * Math.max(0, -sw);
      }
      return m;
    } },
  { id: 'wave', name: 'Wave', about: 'Turned to whoever is looking: the right arm out and turned up, the forearm waving on the elbow; a nod.', face: true,
    pose(t) {
      const m = stand(t), wv = Math.sin(t * TAU * 1.5);
      m['arm.R'] = [0.1, 1.5, -1.45]; m['elbow.R'] = 1.25 + 0.4 * wv; m['forearm.R'] = 0.2; m['wrist.R'] = [0, 0.15 * wv];
      m.head = [0.05 + 0.05 * Math.max(0, Math.sin(t * 2.2)), 0, 0.05]; m.neck = [0.02, 0, 0.03]; m.chest = [0, 0, 0.04];
      return m;
    } },
  { id: 'reach', name: 'Reach', about: 'Reaching up and out with the left arm (a third of the raise is the shoulder blade\'s), the right fist closing at the shoulder, the head following the hand, the jaw opening.',
    pose(t) {
      const m = stand(t), e = ease(0.5 - 0.5 * Math.cos((t / 6) * TAU));
      m['arm.L'] = [0.4 * e, 0.06 + 2.15 * e, 0]; m['elbow.L'] = 0.14 + 0.16 * e; m['forearm.L'] = 0.8 * e;
      m['arm.R'] = [0.9 * e, 0.06 + 0.14 * e, 0]; m['elbow.R'] = 0.14 + 1.56 * e; m['forearm.R'] = -0.6 * e; m['fist.R'] = 0.85 * e;
      m.head = [-0.2 * e, 0.6 * e, 0]; m.neck = [-0.08 * e, 0.15 * e, 0]; m.chest = [-0.06 * e, 0.1 * e, 0.04 * e]; m.loins = [-0.03 * e, 0.04 * e, 0.06 * e]; m.jaw = 0.3 * e;
      m['hip.R'] = [0.12 * e, 0.2 * e, 0.1 * e]; m['knee.R'] = 0.03 + 0.22 * e;
      return m;
    } },
  { id: 'joints', name: 'Every joint', about: 'Each joint in turn through its range: the spine bent, leaned and twisted, the head and the jaw, the arms raised, turned in and out, the elbows, the forearms turned, the wrists and the fists, a hip and its knee, the other hip turned, its ankle and toes.',
    pose(t) {
      // ten parts of four seconds, each out and back (s), some to both sides (b)
      const T = 4, i = Math.floor(t / T) % 10, x = (t % T) / T, s = Math.sin(x * Math.PI) ** 2, b = Math.sin(x * TAU), m = {};
      for (const [sd] of SIDES) { m['arm.' + sd] = [0, 0.06, 0]; m['elbow.' + sd] = 0.1; }
      if (i === 0) { m.loins = [0.9 * b, 0, 0]; m.chest = [0.5 * b, 0, 0]; m.neck = [0.4 * b, 0, 0]; }
      if (i === 1) { m.loins = [0, 0, 0.4 * b]; m.chest = [0, 0, 0.4 * b]; m.neck = [0, 0, 0.5 * b]; }
      if (i === 2) { m.loins = [0, 0.13 * b, 0]; m.chest = [0, 0.6 * b, 0]; m.head = [0, 1.2 * b, 0]; }
      if (i === 3) { m.head = [0.35 * b, 0, 0]; m.neck = [0.5 * b, 0, 0]; m.jaw = 0.5 * s; }
      if (i === 4) for (const [sd] of SIDES) m['arm.' + sd] = [0, 0.06 + 3 * s, 0];
      if (i === 5) for (const [sd] of SIDES) { m['arm.' + sd] = [1.5 * s, 0.06, 0]; m['elbow.' + sd] = 0.1 + 2.4 * s * s; }
      if (i === 6) for (const [sd] of SIDES) { m['arm.' + sd] = [0, 1.4 * Math.min(1, s * 3), 1.3 * b * (s > 0.33 ? 1 : s * 3)]; m['elbow.' + sd] = 0.1 + 1.47 * Math.min(1, s * 3); }
      if (i === 7) for (const [sd] of SIDES) { m['arm.' + sd] = [0.5, 0.1, 0]; m['elbow.' + sd] = 1.5; m['forearm.' + sd] = 1.45 * b; m['wrist.' + sd] = [1.2 * b * s, 0]; m['fist.' + sd] = s; }
      if (i === 8) { m['hip.L'] = [2.1 * s, 0.4 * s * s, 0]; m['knee.L'] = 2.5 * s; m.hips = [0, 0, 0.05 * s]; }
      if (i === 9) { m['hip.R'] = [0.6 * s, 0.3 * s, 0.7 * b * s]; m['knee.R'] = 0.9 * s; m['ankle.R'] = -0.6 * b; m['toes.R'] = 1.1 * b; }
      return m;
    } },
];
const mul3 = (a, b) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));   // two turns, one after the other
const tr3 = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];   // a turn taken back
// two moves mixed, number by number (e: how much of the first)
const mixed = (A, B, e) => {
  if (!B || e >= 1) return A;
  const out = {}, at = (v, i) => (Array.isArray(v) ? v[i] ?? 0 : i === 0 ? v : 0);
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const a = A[k] ?? 0, b = B[k] ?? 0;
    out[k] = Array.isArray(a) || Array.isArray(b) ? Array.from({ length: Math.max(a.length ?? 1, b.length ?? 1) }, (_, i) => at(b, i) + (at(a, i) - at(b, i)) * e) : b + (a - b) * e;
  }
  return out;
};

/** The skeleton, built from its recipe (characters/skeleton.js). quick: only its quick surface (a small picture). */
export function skeletonOf(tex, R, { eye = uniform(U.uCam.value), quick = false } = {}) {
  const object = new THREE.Group(), mat = materialOf(eye), root = new THREE.Bone(); root.name = 'root'; object.add(root);
  // (the muscles only for the character itself, not for the list's small picture or the measuring run: nothing else
  // grows or draws them)
  const muscles = !quick && !!R.layers?.includes('muscles'), LV = muscles ? UNDER : LEVELS;
  // (a body: its skin, its fat, its muscles and its bones, one of them outermost at a time; its bones grown only when
  // they are to be seen)
  const body = muscles && !!R.layers?.includes('skin');
  const version = versionOf(R);   // (what is grown for it is kept under it)
  const api = { object, mesh: null, bones: { root }, skeleton: null, material: mat, moves: MOVES.map(({ id, name, about }) => ({ id, name, about })), boneFaces: 0, height: R.height, measures: {}, bonesCount: 0, pieces: 0, level: -1, failed: null, onGrown: null, flesh: null };
  let K = null, names = [], rest = {}, soles = [];   // the rig once its code is here; its joints' names; where each stands in its parent; where the feet meet the ground
  const rigged = ({ RIG, turnsOf, turnOf }) => {
    // each joint a bone at its place, turned like the world at rest
    names = Object.keys(RIG); const bones = api.bones;
    for (const n of names) if (!bones[n]) { bones[n] = new THREE.Bone(); bones[n].name = n; }
    for (const n of names) { const j = RIG[n], p = j.parent ? RIG[j.parent].at : [0, 0, 0]; rest[n] = new THREE.Vector3(j.at[0] - p[0], j.at[1] - p[1], j.at[2] - p[2]); bones[n].position.copy(rest[n]); if (j.parent) bones[j.parent].add(bones[n]); }
    api.skeleton = new THREE.Skeleton(names.map((n) => bones[n]), names.map((n) => new THREE.Matrix4().makeTranslation(-RIG[n].at[0], -RIG[n].at[1], -RIG[n].at[2])));
    api.bonesCount = names.length; K = { RIG, turnsOf, turnOf };
  };
  const put = (level, G) => {
    if (level <= api.level) return;
    const geo = new THREE.BufferGeometry(), nv = G.of.length, joint = G.rigs.map((r) => names.indexOf(r)), skin = new Uint16Array(nv * 4), weight = new Float32Array(nv * 4);
    for (let v = 0; v < nv; v++) { skin[v * 4] = joint[G.of[v]]; weight[v * 4] = 1; }
    geo.setAttribute('position', new THREE.BufferAttribute(G.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(G.nor, 3)); geo.setAttribute('look', new THREE.BufferAttribute(G.look, 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skin, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
    geo.setIndex(new THREE.BufferAttribute(G.tri, 1)); geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
    const mesh = new THREE.SkinnedMesh(geo, mat); mesh.frustumCulled = false; mesh.layers.enable(CASTS);   // (it casts a shadow, wherever one is drawn: src/world/shadow.js)
    mesh.bind(api.skeleton, new THREE.Matrix4());
    if (api.mesh) { object.remove(api.mesh); api.mesh.geometry.dispose(); }
    object.add(mesh); api.mesh = mesh; api.level = level; api.faces = G.tri.length / 3; api.pieces = G.pieces;
    // where the feet meet the ground: under every two centimetres of each foot and each toe, a point of the sole the
    // body will have (the ground it stands on at rest: the heel's bone lies a finger's breadth above it, on its pad),
    // kept in its joint's own frame
    const low = new Map();
    for (let v = 0; v < nv; v++) {
      const n = names[joint[G.of[v]]]; if (!/^(foot|toe\d)\./.test(n)) continue;
      const y = G.pos[v * 3 + 1], z = G.pos[v * 3 + 2], key = n + ':' + Math.round(z / 0.02), was = low.get(key);
      if (!was || y < was[1][1]) low.set(key, [n, [G.pos[v * 3], y, z]]);
    }
    if (!body) { soles = [...low.values()].map(([n, p]) => { const at = K.RIG[n].at; return { n, side: n.slice(-1), p: new THREE.Vector3(p[0] - at[0], Math.min(0, p[1]) - at[1], p[2] - at[2]), x: null, z: null, dx: 0, dz: 0 }; }); S.foot.L.at = S.foot.R.at = -1; }
    show();
    api.onGrown?.(level);
  };
  // the muscles, once the rig and the bones stand: laid in a worker, carried by the same joints
  const flesh = async () => {
    const [D, F] = await Promise.all([body ? bodied(version) : muscled(version), fleshing()]);
    if (api.disposed) return;
    const fl = (api.flesh = F.fleshOf(D, { object, bones: api.bones, eye }));
    for (const m of [fl.muscles, fl.fat, fl.skin]) if (m) object.add(m);
    // (a body stands on its skin's soles: under each foot and toe, its lowest points)
    if (body && D.soles) { soles = D.soles.map(({ rig, at }) => ({ n: rig, side: rig.slice(-1), p: new THREE.Vector3(at[0], at[1], at[2]), x: null, z: null, dx: 0, dz: 0 })); S.foot.L.at = S.foot.R.at = -1; }
    show(); fl.update();
    api.onGrown?.(api.level);
  };
  // which layer is outermost: what is drawn (the bones under the muscles; nothing under the fat or the skin)
  api.layers = body ? [
    { id: 'skin', name: 'Skin', about: 'The skin over the fat: a man as he stands, naked.' },
    { id: 'fat', name: 'Fat', about: 'The fat under the skin, as thick as it is place by place: thin over the shin and the skull, padded at the heel, the palm and the buttock.' },
    { id: 'muscles', name: 'Muscles', about: 'The muscles over the bones.' },
    { id: 'bones', name: 'Bones', about: 'The skeleton alone.' },
  ] : null;
  api.layer = body ? 'skin' : null;
  // (and a body's bones while its skin is still being laid, or could not be: a phone takes a minute or more over it,
  // and may not manage it at all; the page never shows nothing)
  const wantsBones = () => !body || !api.flesh || api.layer === 'muscles' || api.layer === 'bones';
  let growing = null;
  const growBones = () => (growing ||= (async () => {
    const full = LV.length - 1, hit = await held(LV[full]);
    if (hit) return put(full, hit);
    put(0, await surface(LV[0], version)); put(full, await surface(LV[full], version));
  })().catch((err) => { api.failed = err.message; api.onGrown?.(-1); }));
  function show() {
    const L = api.layer, fl = api.flesh;
    if (api.mesh) api.mesh.visible = wantsBones();
    if (fl) { if (fl.skin) fl.skin.visible = L === 'skin'; if (fl.fat) fl.fat.visible = L === 'fat'; if (fl.muscles) fl.muscles.visible = !body || L === 'muscles'; for (const e of fl.eyes) e.visible = L !== 'bones'; for (const e of fl.mouth ?? []) e.visible = L === 'skin'; }
  }
  api.setLayer = (id) => { if (!body || id === api.layer || !api.layers.some((l) => l.id === id)) return; api.layer = id; show(); if (wantsBones()) growBones(); };
  // the state of its moving (as a person's: ./human.js)
  const footing = () => ({ down: false, at: -1, side: 0, turn: 0, faced: 0, ex: 0, dSide: 0 });   // a foot on the ground: the point of its sole that stands, and what its leg is given to keep it there
  const S = { move: 'stand', from: null, k: 1, t: 0, began: {}, a: 0, yaw: 0, R: R.walkRound ?? 1.5, pace: 0, foot: { L: footing(), R: footing() } };
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Vector3(), moveOf = (id) => MOVES.find((x) => x.id === id);
  Object.defineProperty(api, 'move', { get: () => S.move });
  // what the card says of it beside its figures: its joints and pieces, and how far its growing is
  Object.defineProperty(api, 'figures', { get: () => muscles ? [[api.bonesCount || '…', '', 'Joints'], [api.flesh?.counts.muscles || '…', '', 'Muscles']] : [[api.bonesCount || '…', '', 'Joints'], [api.pieces || '…', '', 'Pieces']] });
  Object.defineProperty(api, 'note', { get: () => (api.failed ? (body && api.mesh ? 'Its skin could not be laid in this browser (' + api.failed + '): its bones are shown.' : 'Its bones could not be grown in this browser: ' + api.failed) : body && !api.flesh ? 'Its body is being laid in the page: the muscles on the bones, then the fat and the skin over them (some seconds the first time; the browser keeps it for the next visit).' : body && wantsBones() && api.level < 0 ? 'Its bones are being grown in the page: coarse within a few seconds, then fine.' : !body && api.level < 0 ? 'Its bones are being grown in the page: coarse within a few seconds, then fine.' : muscles && !api.flesh ? 'Its muscles are being laid on its bones, in the page (the browser keeps them for the next visit).' : api.level < LV.length - 1 && !quick ? 'Coarse for now: the fine bones are still growing (the browser keeps them for the next visit).' : null) });
  // (its faces: the bones' and the muscles' together)
  Object.defineProperty(api, 'faces', { get: () => { const c = api.flesh?.counts, L = api.layer; return !body ? api.boneFaces + (c?.muscleFaces ?? 0) : L === 'skin' || L === 'fat' ? c?.skinFaces ?? 0 : L === 'muscles' ? api.boneFaces + (c?.muscleFaces ?? 0) : api.boneFaces; }, set: (v) => { api.boneFaces = v; } });
  api.rigLabel = 'Rig · a joint where two bones meet'; api.rigAbout = 'one to each vertebra, the atlas and the skull; the jaw; collarbone, blade, shoulder, elbow, the radius turning about the ulna, wrist, every finger\'s three; hip, knee and kneecap, ankle, each toe';
  api.setMove = (id) => { if (id === S.move || !moveOf(id)) return; S.from = S.move; S.k = 0; S.move = id; S.began[id] = S.t; };   // (a move runs from its own beginning: every joint in its order, a stride from the heel's strike)
  api.dispose = () => { api.disposed = true; api.mesh?.geometry.dispose(); mat.dispose(); api.flesh?.dispose(); };
  api.step = (dt, eyeAt) => {
    S.t += dt; S.k = Math.min(1, S.k + dt / 0.5);
    const e = ease(S.k), mv = moveOf(S.move), from = S.from && e < 1 ? moveOf(S.from) : null, walking = (mv.walks ? e : 0) + (from?.walks ? 1 - e : 0);
    if (K) {
      const M = mixed(mv.pose(S.t - (S.began[mv.id] ?? 0)), from?.pose(S.t - (S.began[from.id] ?? 0)), e), bones = api.bones, pelvis = M.hips?.[1] ?? 0;
      // (what keeps a standing foot where it stands, found at the frames before: its leg let out or in in its hip,
      // and turned there against the pelvis' turn)
      const posed = {};   // each hip as the pose alone has it
      for (const [s, g] of SIDES) { const F = S.foot[s]; if (F.side) { const h = (posed[s] = M['hip.' + s] ?? [0, 0, 0]); M['hip.' + s] = [h[0], h[1] + (g * F.side) / LEG, h[2] ?? 0]; } }
      const T = K.turnsOf(M);
      for (const [s] of SIDES) {
        const F = S.foot[s], th = 'thigh.' + s, sh = 'shin.' + s, ft = 'foot.' + s; if (!(posed[s] || F.turn)) continue;
        const given = K.turnOf(T[th], K.RIG[th]);
        // (the foot keeps the way the pose itself lays it, flat where it stands flat, whatever its leg is given)
        if (posed[s]) { const own = K.turnOf(K.turnsOf({ ['hip.' + s]: posed[s] })[th], K.RIG[th]), shin = K.turnOf(T[sh], K.RIG[sh]); T[ft] = mul3(tr3(shin), mul3(tr3(given), mul3(own, mul3(shin, K.turnOf(T[ft], K.RIG[ft]))))); }
        if (F.turn) { const c = Math.cos(F.turn), n = Math.sin(F.turn); T[th] = mul3([c, 0, n, 0, 1, 0, -n, 0, c], given); }
      }
      for (const n of names) {
        const b = bones[n], t = T[n]; b.position.copy(rest[n]);
        if (!t) { b.quaternion.identity(); continue; }
        const A = K.turnOf(t, K.RIG[n]); m4.set(A[0], A[1], A[2], 0, A[3], A[4], A[5], 0, A[6], A[7], A[8], 0, 0, 0, 0, 1); b.quaternion.setFromRotationMatrix(m4);
        if (!Array.isArray(t) && t.shift) b.position.add(v.set(t.shift[0], t.shift[1], t.shift[2]).applyMatrix4(m4));   // (a bone slid in its own frame: the kneecap in its groove)
      }
      // the feet on the ground: every point of the soles in the body's own frame, how far it has gone since the last
      // frame, and each foot's lowest; the hips let down (or up) till the lowest of all touches the ground
      object.updateMatrixWorld(true);
      const lowest = { L: -1, R: -1 }, height = { L: Infinity, R: Infinity };
      soles.forEach((o, i) => {
        q.copy(o.p).applyMatrix4(bones[o.n].matrixWorld); object.worldToLocal(q);
        o.dx = o.x == null ? 0 : q.x - o.x; o.dz = o.x == null ? 0 : q.z - o.z; o.x = q.x; o.z = q.z;
        if (q.y < height[o.side]) { height[o.side] = q.y; lowest[o.side] = i; }
      });
      const lowY = Math.min(height.L, height.R);
      if (lowY < Infinity) bones.hips.position.y = rest.hips.y - lowY + 0.0005;
      // (a foot is down when it comes to the ground and is not swinging forwards over it; up when it is well off it)
      const comes = (s) => walking > 0 && (S.foot[s].down ? height[s] < lowY + 0.014 : height[s] < lowY + 0.004 && soles[lowest[s]].dz <= 0);
      // the walk carries the body as fast as the ground goes back under the feet that stand: the point of each sole
      // that stood at the last frame stays where it stood (on a round the outer foot's goes back faster than the body
      // goes on, the inner one's slower). Both feet have a say while both are down, the lower the more; the pace is
      // evened over a few frames, so the body does not check as the weight goes from foot to foot.
      let pace = 0, weight = 0;
      if (dt > 0) for (const [s] of SIDES) { const F = S.foot[s]; if (F.down && F.at >= 0 && comes(s)) { const o = soles[F.at], w = Math.max(0.05, 1 - (height[s] - lowY) / 0.012); pace -= (w * o.dz) / (1 + o.x / S.R) / dt; weight += w; } }
      if (!(walking > 0)) S.pace = 0; else if (weight) S.pace += (pace / weight - S.pace) * Math.min(1, dt / 0.08);
      const step = walking * Math.max(0, Math.min(2.5, S.pace)) * dt, yaw0 = S.yaw;
      S.a += step / S.R;
      if (walking > 0) { const ty = -S.a; S.yaw += Math.atan2(Math.sin(ty - S.yaw), Math.cos(ty - S.yaw)) * Math.min(1, dt * 8); }
      // (the way the pelvis faces: its own turn in the walk, and half of the body's turn on its round; the other half
      // a foot takes by turning on the ground where it stands, as a foot does on a tight round)
      const dy = S.yaw - yaw0, facing = S.yaw * 0.5 + pelvis, free = Math.max(0, 1 - dt * 9);
      // each foot that stands stays where it stands across the way too: how far its standing point slid aside this
      // frame is taken out of its leg at the next (the slide's own pace, and a part of what has gathered of it); and
      // its leg keeps the way it faced when it came down. A foot in the air lets both go.
      for (const [s] of SIDES) {
        const F = S.foot[s], down = comes(s);
        if (down && F.down && F.at >= 0) {
          const o = soles[F.at], rx = o.dx + o.z * dy; F.ex = Math.max(-0.03, Math.min(0.03, F.ex + rx));
          const side = Math.max(-0.2, Math.min(0.2, F.side + Math.max(-0.02, Math.min(0.02, -(rx - F.dSide) - 0.25 * F.ex))));
          F.dSide = side - F.side; F.side = side; F.turn = Math.max(-0.7, Math.min(0.7, F.faced - facing));
        } else if (down) { F.ex = F.dSide = 0; F.faced = facing + F.turn; }
        else { F.side *= free; F.turn *= free; F.dSide = 0; }
        F.down = down; F.at = lowest[s];
      }
    }
    object.position.set(S.R * Math.cos(S.a), 0, S.R * Math.sin(S.a));
    if (mv.face && eyeAt) { const ty = Math.atan2(eyeAt.x - object.position.x, eyeAt.z - object.position.z); S.yaw += Math.atan2(Math.sin(ty - S.yaw), Math.cos(ty - S.yaw)) * Math.min(1, dt * 3); }
    object.rotation.y = S.yaw;
    // the muscles follow the joints as they now stand; far away, half their rings
    if (api.flesh) { object.updateMatrixWorld(true); api.flesh.update(); if (eyeAt) api.flesh.level(Math.hypot(eyeAt.x - object.position.x, eyeAt.z - object.position.z)); }
  };
  api.grown = (async () => {
    rigged(await posing());
    if (body) { growBones(); return flesh(); }   // (the bones first, quick, shown until the skin is on)
    const full = LV.length - 1, hit = quick ? null : await held(LV[full]);
    if (hit) put(full, hit); else put(0, await surface(LV[0], version));
    const laid = muscles ? flesh() : null;   // (asked before the fine bones, so the workers lay the muscles first)
    if (!quick && !hit) put(full, await surface(LV[full], version));
    await laid;
  })().catch((err) => { api.failed = err.message; console.warn('skeleton: its bones could not be grown:', err); api.onGrown?.(-1); });
  return api;
}
