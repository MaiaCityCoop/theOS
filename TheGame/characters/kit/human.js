// A person: one skinned mesh on a skeleton of twenty bones, dressed in the world's own cloth. Built from a walker of
// the stress stand (assets/kit/creature.js, its rig 'walker'): that kind's own numbers (the length of its legs, its
// build, its head, its lean) give the person's proportions; what the stress stand moves with four bones and a sway,
// this moves with a skeleton as a body has one, each vertex weighted to its bones and blended over every joint.
//
//   humanOf(tex, recipe) -> { object, mesh, bones, skeleton, moves, faces, height, setMove(name), step(dt, eye) }
//     object      a Group to stand on the ground (its origin at the feet); it walks round its origin when it walks
//     moves       the moves it knows: [{ id, name, about }]
//     step(dt, eye)  the clock: poses the skeleton for the move (blended into it over a moment when it changes),
//                 keeps the feet on the ground (its parent's height is the ground's); eye: where the eye is, in its
//                 parent's frame (the wave turns to it)
//
// The skeleton (each bone at its joint, its rest turned like the world, so a move is plain angles):
//   root ─ hips ─ spine ─ chest ─ neck ─ head
//                          └ clavicle.L/R ─ upperArm ─ foreArm ─ hand
//          └ thigh.L/R ─ shin ─ foot
// The skin: tubes laid along the body (the trunk and head, each arm, each leg, each foot, each hand, the ears, the
// nose), a ring every 8 mm, the weave of the cloth running along them so it never seams. What is worn where is
// told in the fragment stage from each point's place at rest (shirt, belt, trousers, shoes, skin, hair).
import * as THREE from 'three/webgpu';
import { Fn, attribute, uv, positionWorld, normalWorld, uniform, float, vec2, vec3, normalize, max, min, pow, mix, smoothstep, clamp, abs, dFdx, dFdy, cross, dot, inverseSqrt, sin, cos, fract, length, sqrt, step, atan, sign, mx_noise_float } from 'three/tsl';
import { U } from '../../src/core/uniforms.js';
import { finish, skyLight } from '../../src/world/light.js';
import { hash3, noise3 } from '../../assets/kit/blob.js';

const PI = Math.PI, TAU = 2 * PI, TILE = 0.1;   // TILE: metres one tile of a worn material spans (uv is in tiles)
const SIDES = ['L', 'R'];   // L: the person's left, +x; they face +z

/** The body's measures: a walker kind's own numbers (as assets/kit/creature.js draws them, r(i)) made into a person. */
function measures(kind, H) {
  const r = (i) => hash3(kind, i, 3, 4242);
  const leg = H * (0.47 + 0.06 * r(1)), chest = 0.92 + 0.2 * r(3), head = 0.95 + 0.1 * r(9), stout = 0.92 + 0.18 * r(70), lean = 0.06 * (r(6) - 0.3);
  const sh = H * 0.815, sx = 0.2 * chest, elbowY = sh - 0.3 * (H / 1.74), wristY = elbowY - 0.26 * (H / 1.74);
  return { r, H, leg, chest, head, stout, lean, kneeY: 0.075 + (leg - 0.075) * 0.49, ankleY: 0.075, hipX: 0.092 * chest, ankleX: 0.098 * chest,
    waist: leg + 0.13, chestY: leg + 0.34, neckY: H * 0.835, headY: H * 0.868, headC: H * 0.925, sh, sx, elbowY, wristY,
    cuffY: elbowY - 0.075, hemY: 0.105 };
}

/** Where the hair grows on the head: 0 … 1, from a point at rest (the same rule on the CPU and in the shader). */
function hairJS(M, x, y, z) {
  const dz = z - 0.008, l = Math.hypot(x, dz) || 1, fz = dz / l, a = Math.atan2(x, dz);
  const s = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const line = M.H * 0.885 + (M.H * 0.958 - M.H * 0.885) * s(-0.3, 0.75, fz) + 0.005 * Math.sin(a * 14);
  return y < M.H * 0.86 ? 0 : s(line - 0.004, line + 0.004, y);
}
const hairTSL = (M, P) => {
  const dz = P.z.sub(0.008), l = max(length(vec2(P.x, dz)), 1e-4), fz = dz.div(l), a = atan(P.x, dz);
  const line = mix(float(M.H * 0.885), float(M.H * 0.958), smoothstep(-0.3, 0.75, fz)).add(sin(a.mul(14)).mul(0.005));
  return smoothstep(line.sub(0.004), line.add(0.004), P.y).mul(step(M.H * 0.86, P.y));
};

// ── the skin ────────────────────────────────────────────────────────────────────────────────────────────────────
// A chain: control points { p, rx, rz, b } (its middle, its half-widths across (x) and deep (z), the bone that holds
// it), laid as one tube: a smooth line through them, a ring every `step` metres, capped round at both ends (caps: their
// lengths, or the end's mean width). part: what the shader is told it is; ref: the way across it (its rings' x).
function chain(M, { pts, part, S, ref = [1, 0, 0], caps = [], sole = null, push = null }, out) {
  const step = 0.008, dense = [];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let k = 0; k < pts.length - 1; k++) {
    const A = pts[Math.max(0, k - 1)], B0 = pts[k], C0 = pts[k + 1], D = pts[Math.min(pts.length - 1, k + 2)];
    for (let i = 0; i < 40; i++) {
      const t = i / 40, p = [0, 1, 2].map((a) => cr(A.p[a], B0.p[a], C0.p[a], D.p[a], t));
      const rx = B0.rx + (C0.rx - B0.rx) * (t * t * (3 - 2 * t)), rz = B0.rz + (C0.rz - B0.rz) * (t * t * (3 - 2 * t));
      dense.push({ p, rx, rz, ba: B0.b, bb: C0.b, w: B0.b === C0.b ? 0 : t * t * (3 - 2 * t) });
    }
  }
  const L0 = pts.at(-1); dense.push({ p: [...L0.p], rx: L0.rx, rz: L0.rz, ba: L0.b, bb: L0.b, w: 0 });
  let len = 0; dense[0].s = 0; for (let i = 1; i < dense.length; i++) { len += Math.hypot(...[0, 1, 2].map((a) => dense[i].p[a] - dense[i - 1].p[a])); dense[i].s = len; }
  const at = (s) => { let i = 1; while (i < dense.length - 1 && dense[i].s < s) i++; const a = dense[i - 1], b = dense[i], t = (s - a.s) / (b.s - a.s || 1); return { p: a.p.map((v, k) => v + (b.p[k] - v) * t), rx: a.rx + (b.rx - a.rx) * t, rz: a.rz + (b.rz - a.rz) * t, ba: t < 0.5 ? a.ba : b.ba, bb: t < 0.5 ? a.bb : b.bb, w: a.w + (b.w - a.w) * t }; };
  const tanAt = (s) => { const a = at(Math.max(0, s - 0.004)).p, b = at(Math.min(len, s + 0.004)).p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1; return d.map((v) => v / l); };
  // the rings: the start's cap, the body, the end's cap; each { c: its middle, k: its widths' share, sc: the middle the
  // shader measures from, off: along the tube, s }
  const rings = [], NC = 8, capA = caps[0] ?? (dense[0].rx + dense[0].rz) / 2, capB = caps[1] ?? (L0.rx + L0.rz) / 2;
  for (let k = 0; k < NC; k++) { const f = (k / NC) * (PI / 2); rings.push({ s: 0, off: -capA * Math.cos(f), k: Math.sin(f), cap: true }); }
  const n = Math.max(2, Math.round(len / step)); for (let j = 0; j <= n; j++) rings.push({ s: (j / n) * len, off: 0, k: 1 });
  for (let k = NC - 1; k >= 0; k--) { const f = (k / NC) * (PI / 2); rings.push({ s: len, off: capB * Math.cos(f), k: Math.sin(f), cap: true }); }
  const R = rings.length, V0 = out.pos.length / 3, P = [], C = [];
  let circ = 0; for (const d of dense) circ += PI * (3 * (d.rx + d.rz) - Math.sqrt((3 * d.rx + d.rz) * (d.rx + 3 * d.rz))); circ /= dense.length;
  const nAround = Math.max(1, Math.round(circ / TILE));   // (whole tiles round it: the weave meets itself at the seam)
  let vAlong = -capA;
  rings.forEach((g, j) => {
    const q = at(g.s), T = tanAt(g.s); let X = ref; if (Math.abs(X[0] * T[0] + X[1] * T[1] + X[2] * T[2]) > 0.9) X = [0, 1, 0];
    const d0 = X[0] * T[0] + X[1] * T[1] + X[2] * T[2]; X = X.map((v, i) => v - T[i] * d0); const xl = Math.hypot(...X); X = X.map((v) => v / xl);
    const Z = [X[1] * T[2] - X[2] * T[1], X[2] * T[0] - X[0] * T[2], X[0] * T[1] - X[1] * T[0]];
    const c = q.p.map((v, i) => v + T[i] * g.off);
    if (j > 0) vAlong += Math.hypot(...[0, 1, 2].map((i) => c[i] - C[j - 1][i])) || 0;
    C.push(c); P.push([]);
    for (let i = 0; i <= S; i++) {
      const th = (i / S) * TAU, ct = Math.cos(th), st = Math.sin(th);
      let p = [0, 1, 2].map((a) => c[a] + (X[a] * q.rx * ct + Z[a] * q.rz * st) * g.k);
      if (push) { const o = push(p, g.cap ? q.p : c), dl = [0, 1, 2].map((a) => p[a] - (g.cap ? q.p : c)[a]), l = Math.hypot(...dl) || 1; p = p.map((v, a) => v + (dl[a] / l) * o); }
      if (sole != null && p[1] < sole) p[1] = sole + (p[1] - sole) * 0.08;   // the sole: flat on the ground
      P[j].push(p);
      out.rest.push(...p); out.ctr.push(...(g.cap ? q.p : c)); out.part.push(part); out.uv.push((i / S) * nAround, vAlong / TILE);
      out.sk.push(q.ba, q.bb, 0, 0); out.sw.push(1 - q.w, q.w, 0, 0); out.pos.push(...p);
    }
  });
  // normals: across the neighbours round and along (round it wraps), turned outwards; at a cap's point, straight out
  for (let j = 0; j < R; j++) for (let i = 0; i <= S; i++) {
    const ii = i % S, a = P[j][(ii + 1) % S], b = P[j][(ii + S - 1) % S], e = P[Math.min(R - 1, j + 1)][ii], f = P[Math.max(0, j - 1)][ii];
    const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [e[0] - f[0], e[1] - f[1], e[2] - f[2]];
    let nn = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]], l = Math.hypot(...nn);
    const p = P[j][ii], cc = [out.ctr[(V0 + j * (S + 1) + i) * 3], out.ctr[(V0 + j * (S + 1) + i) * 3 + 1], out.ctr[(V0 + j * (S + 1) + i) * 3 + 2]], o = [p[0] - cc[0], p[1] - cc[1], p[2] - cc[2]];
    if (l < 1e-9) { nn = o; l = Math.hypot(...o) || 1; }
    if (nn[0] * o[0] + nn[1] * o[1] + nn[2] * o[2] < 0) nn = nn.map((v) => -v);
    out.nor.push(nn[0] / l, nn[1] / l, nn[2] / l);
  }
  // faces, wound outwards (told on one face of its middle)
  const at0 = out.index.length;
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < S; i++) {
    const a = V0 + j * (S + 1) + i, b = a + 1, c = a + S + 2, d = a + S + 1;
    out.index.push(a, b, c, a, c, d);
  }
  const m = at0 + 6 * (Math.floor((R - 1) / 2) * S), [ia, ib, ic] = [out.index[m], out.index[m + 1], out.index[m + 2]], pp = (v) => [out.pos[v * 3], out.pos[v * 3 + 1], out.pos[v * 3 + 2]];
  const A = pp(ia), B1 = pp(ib), C1 = pp(ic), u1 = [B1[0] - A[0], B1[1] - A[1], B1[2] - A[2]], v1 = [C1[0] - A[0], C1[1] - A[1], C1[2] - A[2]];
  const fn = [u1[1] * v1[2] - u1[2] * v1[1], u1[2] * v1[0] - u1[0] * v1[2], u1[0] * v1[1] - u1[1] * v1[0]], oc = [out.ctr[ia * 3], out.ctr[ia * 3 + 1], out.ctr[ia * 3 + 2]];
  if (fn[0] * (A[0] - oc[0]) + fn[1] * (A[1] - oc[1]) + fn[2] * (A[2] - oc[2]) < 0) for (let k = at0; k < out.index.length; k += 3) { const x = out.index[k + 1]; out.index[k + 1] = out.index[k + 2]; out.index[k + 2] = x; }
}

// the parts the shader tells apart
const PART = { trunk: 0, arm: 1, leg: 2, foot: 3, hand: 4, ear: 5, nose: 6 };

/** The bones (their rest places, in the person's frame) and the chains of skin round them. */
function body(M) {
  const { H, leg, chest: ch, stout: st, head: hd } = M, J = {};
  J.root = [0, 0, 0]; J.hips = [0, leg + 0.03, 0]; J.spine = [0, M.waist, 0]; J.chest = [0, M.chestY, 0]; J.neck = [0, M.neckY, 0]; J.head = [0, M.headY, 0.008];
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    J['clavicle.' + s] = [sg * 0.03, M.sh - 0.01, 0]; J['upperArm.' + s] = [sg * M.sx, M.sh, -0.012]; J['foreArm.' + s] = [sg * (M.sx + 0.012), M.elbowY, -0.03]; J['hand.' + s] = [sg * (M.sx + 0.02), M.wristY, -0.005];
    J['thigh.' + s] = [sg * M.hipX, leg, 0]; J['shin.' + s] = [sg * (M.hipX + 0.004), M.kneeY, 0.012]; J['foot.' + s] = [sg * M.ankleX, M.ankleY, -0.005];
  }
  const PARENT = { hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck' };
  for (const s of SIDES) Object.assign(PARENT, { ['clavicle.' + s]: 'chest', ['upperArm.' + s]: 'clavicle.' + s, ['foreArm.' + s]: 'upperArm.' + s, ['hand.' + s]: 'foreArm.' + s, ['thigh.' + s]: 'hips', ['shin.' + s]: 'thigh.' + s, ['foot.' + s]: 'shin.' + s });
  const NAMES = Object.keys(J), id = (n) => NAMES.indexOf(n);
  const pt = (p, rx, rz, b) => ({ p, rx, rz, b: id(b) });
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  // the cloth hangs a little uneven: a slow drape over the trunk, the sleeves and the trousers (not over skin or hair)
  const drape = (p, amt) => (noise3(p[0] * 9 + 3, p[1] * 7, p[2] * 9, 17) - 0.5) * amt;
  const chains = [];
  // the trunk and the head, one tube: crotch, hips, waist, chest, shoulders, neck, jaw, skull, crown
  chains.push({ part: PART.trunk, S: 72, caps: [0.05, 0.05], pts: [
    pt([0, leg - 0.055, 0], 0.08 * ch, 0.07, 'hips'), pt([0, leg + 0.01, 0], 0.162 * ch, 0.11, 'hips'), pt([0, leg + 0.085, 0], 0.168 * ch, 0.113, 'hips'),
    pt([0, M.waist, 0.004], 0.145 * ch, 0.1, 'spine'), pt([0, leg + 0.25, 0.008], 0.15 * ch, 0.106, 'spine'), pt([0, M.chestY, 0.012], 0.162 * ch, 0.115, 'chest'),
    pt([0, H * 0.79, 0.004], 0.172 * ch, 0.108, 'chest'), pt([0, H * 0.812, -0.004], 0.168 * ch, 0.09, 'chest'), pt([0, H * 0.826, -0.004], 0.1, 0.07, 'chest'),   // (the shoulders: broad to the arm, then sloping in to the neck) pt([0, M.neckY, 0], 0.052, 0.054, 'neck'),
    pt([0, H * 0.862, 0.004], 0.05, 0.052, 'neck'), pt([0, H * 0.877, 0.016], 0.062 * hd, 0.072 * hd, 'head'), pt([0, H * 0.9, 0.014], 0.074 * hd, 0.09 * hd, 'head'),
    pt([0, H * 0.94, 0.008], 0.08 * hd, 0.098 * hd, 'head'), pt([0, H - 0.05, 0.002], 0.068 * hd, 0.082 * hd, 'head')],
    push: (p) => {
      const hr = hairJS(M, p[0], p[1], p[2]); if (hr > 0) return hr * (0.013 + 0.006 * noise3(p[0] * 40, p[1] * 30, p[2] * 40, 5));   // the hair's own volume
      if (p[1] < M.neckY - 0.02) return drape(p, 0.008) + (p[1] < M.waist + 0.035 && p[1] > M.waist ? 0.004 : 0);   // the drape; the belt stands proud
      const ey = Math.abs(p[1] - H * 0.928), ex = Math.abs(Math.abs(p[0]) - 0.033); if (p[2] > 0.05 && ey < 0.012 && ex < 0.016) return -0.004 * (1 - ey / 0.012) * (1 - ex / 0.016);   // eye sockets
      return 0;
    } });
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    const S0 = J['upperArm.' + s], E = J['foreArm.' + s], W = J['hand.' + s], Hp = J['thigh.' + s], K = J['shin.' + s], A = J['foot.' + s];
    chains.push({ part: PART.arm, S: 44, caps: [0.026, 0.03], pts: [
      pt([S0[0] - sg * 0.03, S0[1] - 0.004, S0[2]], 0.05 * st, 0.05 * st, 'clavicle.' + s), pt([S0[0], S0[1] - 0.03, S0[2]], 0.054 * st, 0.053 * st, 'upperArm.' + s), pt(lerp(S0, E, 0.5), 0.054 * st, 0.052 * st, 'upperArm.' + s),
      pt(lerp(S0, E, 0.88), 0.047 * st, 0.046 * st, 'upperArm.' + s), pt(lerp(E, W, 0.12), 0.045 * st, 0.044 * st, 'foreArm.' + s), pt(lerp(E, W, 0.25), 0.044 * st, 0.042 * st, 'foreArm.' + s),
      pt(lerp(E, W, 0.6), 0.037 * st, 0.034 * st, 'foreArm.' + s), pt(lerp(E, W, 0.97), 0.027 * st, 0.024 * st, 'foreArm.' + s)],
      push: (p) => (p[1] > M.cuffY ? drape(p, 0.006) + (p[1] < M.cuffY + 0.035 ? 0.005 : 0) : 0) });   // the sleeve's drape, its rolled cuff
    chains.push({ part: PART.hand, S: 28, caps: [0.02, 0.012], pts: [
      pt([W[0], W[1] + 0.015, W[2]], 0.022, 0.026, 'foreArm.' + s), pt([W[0], W[1] - 0.01, W[2]], 0.021, 0.034, 'hand.' + s), pt([W[0], W[1] - 0.06, W[2] + 0.004], 0.017, 0.044, 'hand.' + s),
      pt([W[0], W[1] - 0.11, W[2] + 0.008], 0.014, 0.04, 'hand.' + s), pt([W[0] - sg * 0.004, W[1] - 0.165, W[2] + 0.012], 0.01, 0.026, 'hand.' + s)] });
    chains.push({ part: PART.leg, S: 52, caps: [0.06, 0.04], pts: [
      pt([Hp[0] * 0.6, Hp[1] + 0.07, 0], 0.08 * st, 0.08 * st, 'hips'), pt(Hp, 0.09 * st, 0.092 * st, 'thigh.' + s), pt(lerp(Hp, K, 0.5), 0.082 * st, 0.084 * st, 'thigh.' + s),
      pt(lerp(Hp, K, 0.9), 0.066 * st, 0.068 * st, 'thigh.' + s), pt(lerp(K, A, 0.1), 0.063 * st, 0.065 * st, 'shin.' + s), pt(lerp(K, A, 0.5), 0.062 * st, 0.064 * st, 'shin.' + s),
      pt([A[0], M.hemY + 0.02, A[2] - 0.004], 0.06 * st, 0.062 * st, 'shin.' + s), pt([A[0], 0.06, A[2] - 0.006], 0.058 * st, 0.06 * st, 'shin.' + s)],
      push: (p) => drape(p, 0.01) + (p[1] < M.hemY + 0.025 && p[1] > M.hemY ? 0.003 : 0) });   // the trousers' drape, the turned hem
    chains.push({ part: PART.foot, S: 40, ref: [1, 0, 0], caps: [0.045, 0.03], sole: 0.004, pts: [
      pt([A[0], 0.075, -0.06], 0.043, 0.05, 'foot.' + s), pt([A[0], 0.062, 0.0], 0.046, 0.055, 'foot.' + s), pt([A[0] + sg * 0.004, 0.045, 0.09], 0.049, 0.04, 'foot.' + s),
      pt([A[0] + sg * 0.002, 0.035, 0.16], 0.042, 0.03, 'foot.' + s)] });
    chains.push({ part: PART.ear, S: 18, ref: [0, 1, 0], caps: [0.006, 0.008], pts: [
      pt([sg * 0.068 * hd, H * 0.926, -0.004], 0.022, 0.012, 'head'), pt([sg * 0.082 * hd, H * 0.928, -0.01], 0.024, 0.014, 'head')] });
  }
  chains.push({ part: PART.nose, S: 18, ref: [1, 0, 0], caps: [0.01, 0.012], pts: [
    pt([0, H * 0.922, 0.088 * hd], 0.009, 0.01, 'head'), pt([0, H * 0.906, 0.104 * hd], 0.014, 0.012, 'head')] });
  return { J, PARENT, NAMES, chains };
}

// ── the moves ──────────────────────────────────────────────────────────────────────────────────────────────────
// Each a pose at time t: angles (x, y, z, radians) for the bones it turns; what it does not name stays at rest.
// Signs: about x a leg or an arm swings back (+) or forward (−); about z the left limb goes out (+), the right in (+).
const WALK_T = 1.06, WALK_A = 0.42;
export const MOVES = [
  { id: 'walk', name: 'Walk', about: 'An easy walk round the stage: heel to toe, the arms swinging against the legs, the hips turning under the chest.', speed: 1.3,
    pose(t, M) {
      const f = (t / WALK_T) * TAU, out = {};
      for (const [s, ph] of [['L', 0], ['R', PI]]) {
        const g = f + ph, th = WALK_A * Math.sin(g) - 0.04, kn = 0.08 + 0.95 * Math.max(0, -Math.cos(g)) ** 1.6 + 0.12 * Math.max(0, Math.sin(g + 0.6)) ** 4;
        const toe = 0.3 * Math.max(0, Math.sin(g - 0.25)) ** 6 - 0.18 * Math.max(0, -Math.cos(g - 0.3)) ** 2;
        out['thigh.' + s] = [th, 0, 0]; out['shin.' + s] = [kn, 0, 0]; out['foot.' + s] = [-(th + kn) * 0.9 + toe, 0, 0];
        const sg = s === 'L' ? 1 : -1;
        out['upperArm.' + s] = [-0.34 * Math.sin(g), 0, sg * 0.06]; out['foreArm.' + s] = [-0.22 - 0.2 * Math.max(0, -Math.sin(g)), 0, 0]; out['hand.' + s] = [-0.05, 0, 0];
      }
      out.hips = [0.03, 0.09 * Math.sin(f), 0.035 * Math.cos(f)]; out.spine = [0.03 + M.lean, -0.05 * Math.sin(f), -0.02 * Math.cos(f)];
      out.chest = [0.02, -0.07 * Math.sin(f), 0]; out.neck = [-0.02, 0.02 * Math.sin(f), 0]; out.head = [-0.03, 0, -0.012 * Math.cos(f)];
      return out;
    } },
  { id: 'idle', name: 'Idle', about: 'Standing at ease: breathing, the weight going from foot to foot, looking about.',
    pose(t, M) {
      const b = Math.sin((t / 4.2) * TAU), w = Math.sin((t / 7.5) * TAU), look = Math.sin((t / 9) * TAU) * 0.45 * Math.min(1, Math.abs(Math.sin((t / 9) * TAU)) * 2.5);
      const out = { hips: [0, 0.04 * w, 0.035 * w], spine: [M.lean + 0.015 * b, -0.02 * w, -0.025 * w], chest: [-0.025 * b, 0, -0.012 * w], neck: [0.02, look * 0.35, 0], head: [0.03 * Math.sin(t * 0.7), look * 0.65, 0.02 * w] };
      for (const [s, sg] of [['L', 1], ['R', -1]]) {
        out['thigh.' + s] = [-0.01, 0, -0.035 * w]; out['shin.' + s] = [0.04 + (sg * w > 0 ? 0.08 * sg * w : 0), 0, 0]; out['foot.' + s] = [-0.03 - (sg * w > 0 ? 0.08 * sg * w : 0), 0, 0.035 * w];
        out['upperArm.' + s] = [0.03 * b, 0, sg * (0.07 + 0.01 * b)]; out['foreArm.' + s] = [-0.14, 0, 0]; out['hand.' + s] = [-0.06, sg * 0.15, 0];
        out['clavicle.' + s] = [0, 0, sg * 0.012 * b];
      }
      return out;
    } },
  { id: 'wave', name: 'Wave', about: 'Turned to whoever is looking, the right hand up and waving, a nod.', face: true,
    pose(t, M) {
      const out = MOVES[1].pose(t, M), wv = Math.sin(t * TAU * 1.7);
      out['clavicle.R'] = [0, 0, -0.18]; out['upperArm.R'] = [-0.25, 0.2, -2.35]; out['foreArm.R'] = [-0.15, 0, -0.55 + 0.42 * wv]; out['hand.R'] = [0.05, 0, -0.2 * wv];
      out.head = [0.05 + 0.05 * Math.max(0, Math.sin(t * 2.2)), 0, 0.06]; out.neck = [0.02, 0, 0.03]; out.chest = [0, 0, 0.04];
      return out;
    } },
];

// ── the look ───────────────────────────────────────────────────────────────────────────────────────────────────
// The fragment stage: what is worn at this point (from its place at rest), the cloth's own baked tile read along the
// body's surface and its relief turned onto it, folds where cloth gathers, then the light as each takes it: cloth
// soft and bright at its edge (a sheen), skin with light passing through it (reddened where it wraps into shadow),
// hair with a highlight along its strands, leather and brass glossy.
function materialOf(tex, M, look, eye) {
  const { linen, denim, hair } = look;
  const m = new THREE.NodeMaterial(); m.eye = eye;
  const skinLin = vec3(...look.skin), dye = vec3(...look.dye), leather = vec3(...look.leather), lip = vec3(...look.lip);
  m.fragmentNode = Fn(() => {
    const P = attribute('rest', 'vec3'), Cc = attribute('ctr', 'vec3'), part = attribute('part', 'float'), UVt = uv(), w = positionWorld;
    const D = normalize(P.sub(Cc)), y = P.y, is = (k) => float(1).sub(clamp(abs(part.sub(k)).mul(4), 0, 1));
    const trunk = is(PART.trunk), arm = is(PART.arm), leg = is(PART.leg), foot = is(PART.foot);
    const below = (e, soft = 0.0015) => smoothstep(float(e).add(soft), float(e).sub(soft), y), band = (a, b) => below(b).mul(float(1).sub(below(a)));
    // what is worn where
    const hairM = hairTSL(M, P).mul(trunk);
    const neckline = float(M.neckY - 0.012).sub(float(0.055).mul(float(1).sub(smoothstep(0.0, 0.075, abs(P.x)))).mul(smoothstep(0.2, 0.9, D.z)));
    const beltM = trunk.mul(band(M.waist, M.waist + 0.036));
    const trousersT = trunk.mul(below(M.waist)), shirtT = trunk.mul(float(1).sub(below(M.waist + 0.036))).mul(smoothstep(neckline.add(0.0015), neckline.sub(0.0015), y));
    const sleeve = arm.mul(float(1).sub(below(M.cuffY)));
    const linenM = shirtT.add(sleeve), denimM = trousersT.add(leg), shoeM = foot;
    const skinM = clamp(float(1).sub(linenM).sub(denimM).sub(beltM).sub(shoeM).sub(hairM), 0, 1);
    // seams, hems, cuffs, the placket and its buttons, the buckle
    const sx = sign(P.x), sideT = smoothstep(0.985, 0.998, abs(D.x)).mul(trunk), outL = smoothstep(0.985, 0.998, D.x.mul(sx)).mul(leg), inA = smoothstep(0.975, 0.995, D.x.mul(sx).negate()).mul(arm);
    const stitch = step(0.45, fract(y.div(0.0065)));
    const hem = leg.mul(band(M.hemY, M.hemY + 0.026)), hemLine = leg.mul(band(M.hemY + 0.02, M.hemY + 0.024)), cuff = arm.mul(band(M.cuffY, M.cuffY + 0.034)), cuffEdge = arm.mul(band(M.cuffY + 0.029, M.cuffY + 0.034).add(band(M.cuffY, M.cuffY + 0.003)));
    const collar = shirtT.mul(smoothstep(neckline.sub(0.016), neckline.sub(0.004), y));
    const placket = shirtT.mul(smoothstep(0.86, 0.93, D.z)).mul(smoothstep(0.014, 0.01, abs(P.x)));
    const by = fract(y.sub(M.waist + 0.06).div(0.075)), button = placket.mul(smoothstep(0.0062, 0.0048, length(vec2(P.x, by.sub(0.5).mul(0.075))))).mul(step(M.waist + 0.06, y)).mul(step(y, neckline.sub(0.03)));
    const buckle = beltM.mul(smoothstep(0.9, 0.96, D.z)).mul(smoothstep(0.024, 0.02, abs(P.x)));
    const sole = foot.mul(below(0.017, 0.002)), laces = foot.mul(smoothstep(0.55, 0.75, D.y)).mul(step(0.0, P.z)).mul(step(P.z, 0.085)).mul(smoothstep(0.35, 0.15, abs(fract(P.z.div(0.017).add(P.x.mul(40))).sub(0.5))));
    // the face: eyes, brows, lips, a warmth in the cheeks (only where the head faces forward)
    const front = trunk.mul(smoothstep(0.55, 0.8, D.z)).mul(step(M.H * 0.87, y)).mul(float(1).sub(hairM));
    const ex = abs(abs(P.x).sub(0.033)), ey = y.sub(M.H * 0.928), eyeD = length(vec2(ex.div(0.011), ey.div(0.0065)));
    const eyeW = front.mul(smoothstep(1.0, 0.85, eyeD)), iris = front.mul(smoothstep(0.62, 0.5, length(vec2(ex.div(0.0065), ey.div(0.0065)))));
    const brow = front.mul(smoothstep(0.0035, 0.0015, abs(y.sub(float(M.H * 0.942).add(ex.mul(ex).mul(-6)))))).mul(smoothstep(0.03, 0.02, ex));
    const lips = front.mul(smoothstep(0.0042, 0.0018, abs(y.sub(M.H * 0.897)))).mul(smoothstep(0.022, 0.016, abs(P.x)));
    const cheek = front.mul(smoothstep(0.03, 0.0, length(vec2(ex.sub(0.012), y.sub(M.H * 0.912)))));
    // the tiles, read along the surface (uv in tiles: the weave runs round and along the body)
    const aL = tex.a(linen, UVt), nL = tex.n(linen, UVt), aD = tex.a(denim, UVt), nD = tex.n(denim, UVt), hv = vec2(UVt.x.mul(1.6), UVt.y.mul(0.6)), aH = tex.a(hair, hv), nH = tex.n(hair, hv);
    const N0 = normalize(normalWorld);
    // the surface's ways: round it (T) and along it (B), from the screen's change of uv (no tangents to skin)
    const frame = (q) => { const dp1 = dFdx(w), dp2 = dFdy(w), d1 = dFdx(q), d2 = dFdy(q), p2 = cross(dp2, N0), p1 = cross(N0, dp1), T = p2.mul(d1.x).add(p1.mul(d2.x)), Bv = p2.mul(d1.y).add(p1.mul(d2.y)), k = inverseSqrt(max(max(dot(T, T), dot(Bv, Bv)), 1e-12)); return [T.mul(k), Bv.mul(k)]; };
    const [Tt, Bt] = frame(UVt), [, By] = frame(vec2(UVt.x, y)), up = normalize(By);   // up: the way the point's rest height grows (hair falls, folds lie across it)
    // folds: where cloth gathers, ridges across the limb (a slope along `up`)
    const kneeBack = leg.mul(float(1).sub(smoothstep(0.0, 0.09, abs(y.sub(M.kneeY))))).mul(smoothstep(0.3, -0.6, D.z));
    const elbowIn = arm.mul(float(1).sub(smoothstep(0.0, 0.07, abs(y.sub(M.elbowY))))).mul(smoothstep(-0.2, 0.6, D.z)).mul(sleeve);
    const gather = leg.mul(smoothstep(0.36, M.hemY + 0.03, y)).mul(float(1).sub(hem)).add(kneeBack).add(elbowIn)
      .add(sleeve.mul(float(1).sub(smoothstep(0.0, 0.1, y.sub(M.cuffY + 0.035)))).mul(float(1).sub(cuff))).add(shirtT.mul(band(M.waist + 0.036, M.waist + 0.11)).mul(0.8))
      .add(leg.mul(smoothstep(M.leg - 0.16, M.leg - 0.02, y)).mul(0.6)).add(trousersT.mul(0.3));
    const nz = mx_noise_float(P.mul(vec3(16, 5, 16))), ph = y.mul(TAU / 0.034).add(nz.mul(6)).add(D.x.mul(3)), slope = cos(ph).mul(clamp(gather, 0, 1)).mul(0.5).mul(float(0.6).add(nz.mul(0.4).abs()));
    // the relief of what is worn, folded onto the surface
    const rel = (n, k) => n.xy.mul(2).sub(1).mul(k);
    const rL = rel(nL, 0.9), rD = rel(nD, 0.8), rH = rel(nH, 0.6);
    const rx = rL.x.mul(linenM).add(rD.x.mul(denimM)).add(rH.x.mul(hairM)), ry = rL.y.mul(linenM).add(rD.y.mul(denimM)).add(rH.y.mul(hairM));
    const pore = mx_noise_float(P.mul(900)).mul(0.08).mul(skinM), leatherG = mx_noise_float(P.mul(260)).mul(0.12).mul(shoeM.add(beltM));
    const hemRidge = sin(y.sub(M.hemY).div(0.026).mul(PI)).mul(hem).add(sin(y.sub(M.cuffY).div(0.034).mul(PI)).mul(cuff)).mul(0.25);
    const n = normalize(N0.add(Tt.mul(rx.add(pore).add(leatherG))).add(Bt.mul(ry.add(pore))).sub(up.mul(slope.add(hemRidge.mul(cos(y.mul(400)))))));
    // the colour of what is worn (linear: the tiles are gamma 2)
    const lin = aL.rgb.mul(aL.rgb).mul(dye).mul(mix(float(1), float(0.82), collar.add(cuffEdge).min(1))), den = aD.rgb.mul(aD.rgb).mul(mix(float(1), float(0.85), hem)), hr = aH.rgb.mul(aH.rgb).mul(vec3(...look.hairTint));
    const mot = mx_noise_float(P.mul(vec3(30, 30, 30))).mul(0.06), sk = skinLin.mul(float(1).add(mot)).mul(mix(vec3(1), vec3(1.12, 0.92, 0.9), cheek.mul(0.6)));
    const lea = leather.mul(float(0.8).add(mx_noise_float(P.mul(60)).mul(0.2).abs()));
    let col = lin.mul(linenM).add(den.mul(denimM)).add(hr.mul(hairM)).add(sk.mul(skinM)).add(lea.mul(shoeM.add(beltM)));
    col = mix(col, vec3(0.1, 0.085, 0.075), sideT.mul(linenM).mul(0.5).add(inA.mul(0.4)).add(placket.mul(0.12)).add(sole.mul(0.95)).add(laces.mul(0.6)));
    col = mix(col, vec3(0.62, 0.42, 0.16), outL.add(hemLine).mul(stitch).mul(denimM).mul(0.85));   // denim's gold topstitch
    col = mix(col, vec3(0.62, 0.58, 0.5), button);
    col = mix(col, vec3(0.62, 0.45, 0.16), buckle);
    col = mix(col, vec3(0.75, 0.73, 0.7), eyeW); col = mix(col, vec3(0.05, 0.035, 0.025), iris); col = mix(col, hr.mul(0.8), brow); col = mix(col, skinLin.mul(lip), lips.mul(0.7));
    // the light
    const cloth = linenM.add(denimM), V = normalize(eye.sub(w)), L = U.uSunDir, Hh = normalize(V.add(L)), ndl = dot(n, L), nv = max(dot(n, V), 0), ndh = max(dot(n, Hh), 0);
    const wrap = cloth.mul(0.35).add(skinM.mul(0.5)).add(hairM.mul(0.3)), diff = max(ndl.add(wrap).div(wrap.add(1)), 0);
    const through = mix(vec3(1), vec3(1, 0.5, 0.38), skinM.mul(float(1).sub(clamp(ndl.mul(2.5), 0, 1))));   // light through skin, reddened
    const ao = mix(float(0.55), float(1), clamp(aL.a.mul(linenM).add(aD.a.mul(denimM)).add(aH.a.mul(hairM)).add(skinM).add(shoeM).add(beltM), 0, 1)).mul(float(1).sub(clamp(gather, 0, 1).mul(0.12)));
    const sheen = vec3(...look.sheen).mul(dye.mul(linenM).add(vec3(0.5, 0.58, 0.72).mul(denimM))).mul(pow(float(1).sub(nv), 3.5)).mul(skyLight(n).add(U.uSun.mul(max(ndl, 0).mul(0.5).add(0.15)))).mul(0.9);
    const gloss = (e, k) => pow(ndh, e).mul((e + 8) / (8 * PI)).mul(k);
    const fres = pow(float(1).sub(nv), 5).mul(0.96).add(0.04);
    const spec = gloss(28, 0.06).mul(skinM).mul(fres.mul(6)).add(gloss(60, 0.05).mul(skinM.mul(float(0.5).add(mx_noise_float(P.mul(120)).abs()))))
      .add(gloss(40, 0.08).mul(shoeM.add(beltM))).add(gloss(180, 0.6).mul(buckle)).add(gloss(90, 0.2).mul(button)).add(gloss(6, 0.012).mul(cloth))
      .add(gloss(120, 0.5).mul(eyeW.add(lips.mul(0.15))));
    const strand = normalize(up.sub(n.mul(dot(up, n)))), tH = dot(strand, Hh), kk = sqrt(max(float(1).sub(tH.mul(tH)), 0)), tH2 = dot(strand, normalize(Hh.add(n.mul(0.2))));
    const hairSpec = pow(kk, 90).mul(0.32).add(pow(sqrt(max(float(1).sub(tH2.mul(tH2)), 0)), 22).mul(0.12)).mul(hairM).mul(smoothstep(-0.1, 0.3, ndl));
    const lit = col.mul(skyLight(n).mul(ao).add(U.uSun.mul(diff).mul(through))).add(U.uSun.mul(spec.mul(max(ndl, 0)))).add(U.uSun.mul(hr.add(0.12)).mul(hairSpec)).add(sheen.mul(ao));
    return finish(lit, w, eye);
  })();
  return m;
}

/** A person, built from recipe (characters/*.js): its walker kind, its height, what it wears. */
export function humanOf(tex, R, { eye = uniform(U.uCam.value) } = {}) {
  const M = measures(R.from.kind, R.height), { J, PARENT, NAMES, chains } = body(M);
  const out = { pos: [], nor: [], rest: [], ctr: [], part: [], uv: [], sk: [], sw: [], index: [] };
  for (const c of chains) chain(M, c, out);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('rest', new THREE.Float32BufferAttribute(out.rest, 3)); geo.setAttribute('ctr', new THREE.Float32BufferAttribute(out.ctr, 3));
  geo.setAttribute('part', new THREE.Float32BufferAttribute(out.part, 1)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.sk, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.sw, 4));
  geo.setIndex(out.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(out.index, 1) : new THREE.Uint16BufferAttribute(out.index, 1));
  geo.computeBoundingSphere();
  const W = R.wears;
  for (const x of [W.shirt.material, W.trousers.material, W.hair.material]) tex.want(x, true);
  const look = { linen: W.shirt.material, denim: W.trousers.material, hair: W.hair.material, dye: W.shirt.dye, hairTint: W.hair.tint, skin: W.skin, leather: W.shoes, lip: [0.78, 0.55, 0.55], sheen: [0.9, 0.9, 0.9] };
  const mat = materialOf(tex, M, look, eye);
  // the skeleton: each bone at its joint, its place its parent's offset
  const bones = {}; for (const nm of NAMES) { const b = new THREE.Bone(); b.name = nm; bones[nm] = b; }
  for (const nm of NAMES) { const par = PARENT[nm], p = J[nm], q = par ? J[par] : [0, 0, 0]; bones[nm].position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (par) bones[par].add(bones[nm]); }
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.frustumCulled = false; mesh.add(bones.root); mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(NAMES.map((n) => bones[n])); mesh.bind(skeleton);
  const object = new THREE.Group(); object.add(mesh);
  const hips0 = bones.hips.position.y, soles = SIDES.map((s) => { const f = J['foot.' + s]; return [[0, 0.004 - f[1], -0.07 - f[2]], [0, 0.004 - f[1], 0.18 - f[2]]]; });   // heel and toe under each foot, in its bone's frame
  // the state of its moving: the move, the one it came from and how far into the change, its clock, where it walks
  const S = { move: 'idle', from: null, k: 1, t: 0, a: 0, yaw: 0, R: R.walkRound ?? 1.5 };
  const v = new THREE.Vector3(), poseOf = (id, t) => MOVES.find((x) => x.id === id).pose(t, M);
  const api = { object, mesh, bones, skeleton, moves: MOVES.map(({ id, name, about }) => ({ id, name, about })), faces: out.index.length / 3, height: M.H, measures: M, bonesCount: NAMES.length, material: mat,
    get move() { return S.move; },
    setMove(id) { if (id === S.move || !MOVES.some((x) => x.id === id)) return; S.from = S.move; S.k = 0; S.move = id; },
    step(dt, eyeAt) {
      S.t += dt; S.k = Math.min(1, S.k + dt / 0.45);
      const e = S.k * S.k * (3 - 2 * S.k), A = poseOf(S.move, S.t), B = S.from && e < 1 ? poseOf(S.from, S.t) : null;
      for (const nm of NAMES) { if (nm === 'root') continue; const a = A[nm] || [0, 0, 0], b = B ? B[nm] || [0, 0, 0] : a; bones[nm].rotation.set(b[0] + (a[0] - b[0]) * e, b[1] + (a[1] - b[1]) * e, b[2] + (a[2] - b[2]) * e); }
      // walking: round its origin, facing the way it goes; waving: turned to the eye
      const mv = MOVES.find((x) => x.id === S.move), walkW = (S.move === 'walk' ? e : 0) + (S.from === 'walk' ? 1 - e : 0);
      if (walkW > 0) { S.a += (MOVES[0].speed * dt * walkW) / S.R; const ty = -S.a; S.yaw += Math.atan2(Math.sin(ty - S.yaw), Math.cos(ty - S.yaw)) * Math.min(1, dt * 8); }
      object.position.set(S.R * Math.cos(S.a), 0, S.R * Math.sin(S.a));
      if (mv.face && eyeAt) { const ty = Math.atan2(eyeAt.x - object.position.x, eyeAt.z - object.position.z); S.yaw += Math.atan2(Math.sin(ty - S.yaw), Math.cos(ty - S.yaw)) * Math.min(1, dt * 3); }
      object.rotation.y = S.yaw;
      // the feet on the ground: the hips let down (or up) till the lower sole touches it
      bones.hips.position.y = hips0; object.updateMatrixWorld(true);
      let low = Infinity; SIDES.forEach((s, i) => { for (const p of soles[i]) { v.set(...p).applyMatrix4(bones['foot.' + s].matrixWorld); low = Math.min(low, v.y); } });
      const ground = object.parent ? object.parent.matrixWorld.elements[13] : 0;
      bones.hips.position.y = hips0 - (low - ground - 0.004); object.updateMatrixWorld(true);
    },
  };
  return api;
}
