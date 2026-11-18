// The muscles, the fat and the skin on the page (intent 0036): the surfaces drawn out by the workers
// (./build.js, ../skin/build.js), carried by the rig and drawn in the world's light. Loaded when a character with
// muscles is first made (../bones.js): the game, which shows none, carries none of it.
//
//   fleshOf(data, { object, bones, eye }) -> { muscles, skin, fat, eyes, mouth, update(), level(dist), dispose(), counts }
//     data       what the workers laid: the rows the rig moves (the muscles' strands), and each surface: a muscle's
//                points' places in those rows, a skin's points' joints; its triangles near and far
//     muscles, skin, fat, eyes   the meshes (each null where it was not laid); the fat is the skin's surface drawn a
//                skin's thickness further in, in its own colour
//     update()   each frame, after the rig has moved: every row's points carried by their joints, into a texture the
//                shader reads (a row a strand); each strand's belly swollen or thinned by how much shorter or longer it
//                stands than at rest, so its volume stays what it was
//     level(d)   the level of detail for an eye d metres away: the muscles' every ring and every point round it near,
//                their coarse surface far; the skin's the coarsest of its three that the measure allows there
//
// In the shader, a muscle's point is found on its curve again, each frame: the curve through its row's points
// (Catmull-Rom, the same numbers the workers laid it with), the frame there (along it, out, across), and the point's
// own place in that frame, the part of it that is the muscle's own depth scaled by the belly's swell. A point of a
// sheet lies between two rows' curves and is carried by both. A point of the skin is carried by its four joints, each
// by its share (linear blend skinning), and lit as skin is: ../skin/light.js.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, attribute, varyingProperty, uniform, float, int, ivec2, vec2, vec3, vec4, textureLoad, normalize, cross, mix, max, pow, clamp, dot, length, smoothstep, sqrt, reflect, positionWorld, positionGeometry, normalWorld, modelWorldMatrix, modelWorldMatrixInverse, mx_noise_float } from 'three/tsl';
import { U } from '../../../src/core/uniforms.js';
import { finish, skyLight, unlit, sunDim, cloudShade, shadowAtPulled, casterPull } from '../../../src/world/light.js';
import { CASTS } from '../../../src/world/shadow.js';
import { SLOTS, COLS } from './layout.js';
import { pxOn, ERROR_PX } from '../../../src/detail/measure.js';
import { carriedBy, skinMaterial, eyeOpeningNode, mouthOpeningNode } from '../skin/light.js';
import { EYE } from '../skin/table.js';
import { teethOf } from '../skeleton/skull.js';
import { rigOf } from '../skeleton/pose.js';

/** How far away the far level takes over (m). */
export const FAR = 7;

export function fleshOf(D, { object, bones, eye = uniform(U.uCam.value) }) {
  const rows = D.rows, H = rows.length, data = new Float32Array(COLS * 4 * H);
  const tex = new THREE.DataTexture(data, COLS, H, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  // the joints the rows hang on, each read once a frame
  const rigs = [...new Set(rows.flatMap((r) => r.keys.map((k) => k.rig)))], rel = rigs.map(() => new THREE.Matrix4()), inv = new THREE.Matrix4();
  const keyRig = rows.map((r) => r.keys.map((k) => rigs.indexOf(k.rig)));
  const P = [], Q = [];   // (a row's points and outs this frame, reused)
  for (let i = 0; i < 9; i++) { P.push(new THREE.Vector3()); Q.push(new THREE.Vector3()); }
  const put = (base, col, v) => { const o = base + col * 4; data[o] = v.x; data[o + 1] = v.y; data[o + 2] = v.z; };
  const ghost = new THREE.Vector3();
  // (a skin's joints: each the 3 x 4 matrix from where a point stood at rest to where the joint has it now, in the
  // body's own frame; three texels a joint, read by the skin's points: ../skin/light.js carriedBy)
  const J = D.skin?.joints ?? null, jointData = J ? new Float32Array(4 * 4 * J.length) : null, jointTex = J ? new THREE.DataTexture(jointData, 4, J.length, THREE.RGBAFormat, THREE.FloatType) : null, jm = new THREE.Matrix4(), jt = new THREE.Matrix4();
  if (jointTex) { jointTex.magFilter = jointTex.minFilter = THREE.NearestFilter; jointTex.generateMipmaps = false; jointTex.needsUpdate = true; }
  function update() {
    inv.copy(object.matrixWorld).invert();
    if (J) {
      J.forEach(({ rig, at }, j) => { const e = jm.multiplyMatrices(inv, bones[rig].matrixWorld).multiply(jt.makeTranslation(-at[0], -at[1], -at[2])).elements; for (let r = 0; r < 3; r++) jointData.set([e[r], e[4 + r], e[8 + r], e[12 + r]], (j * 4 + r) * 4); });
      jointTex.needsUpdate = true;
    }
    rigs.forEach((n, i) => rel[i].multiplyMatrices(inv, bones[n].matrixWorld));
    for (let r = 0; r < H; r++) {
      const row = rows[r], keys = row.keys, n = keys.length, base = r * COLS * 4;
      let L = 0;
      for (let k = 0; k < n; k++) {
        const m = rel[keyRig[r][k]], K = keys[k];
        P[k].set(K.at[0], K.at[1], K.at[2]).applyMatrix4(m); Q[k].set(K.out[0], K.out[1], K.out[2]).transformDirection(m);
        if (k) L += P[k].distanceTo(P[k - 1]);
      }
      // the slots: a ghost before, the points, the ghosts after (closed: round again)
      if (row.closed) { put(base, 0, P[n - 1]); for (let k = 0; k < n; k++) put(base, k + 1, P[k]); put(base, n + 1, P[0]); put(base, n + 2, P[1]); put(base, SLOTS, Q[n - 1]); for (let k = 0; k < n; k++) put(base, SLOTS + k + 1, Q[k]); put(base, SLOTS + n + 1, Q[0]); put(base, SLOTS + n + 2, Q[1]); }
      else {
        put(base, 0, ghost.copy(P[0]).multiplyScalar(2).sub(P[1])); for (let k = 0; k < n; k++) put(base, k + 1, P[k]); put(base, n + 1, ghost.copy(P[n - 1]).multiplyScalar(2).sub(P[n - 2])); put(base, n + 2, P[n - 1]);
        put(base, SLOTS, Q[0]); for (let k = 0; k < n; k++) put(base, SLOTS + k + 1, Q[k]); put(base, SLOTS + n + 1, Q[n - 1]); put(base, SLOTS + n + 2, Q[n - 1]);
      }
      // the belly's swell: its tendons keep their length, its fleshy part takes the change, its section the inverse (a
      // row a bone carries whole does not swell)
      const b0 = row.L0 - row.Lt, b = Math.max(0.25 * b0, L - row.Lt), k = row.closed || row.rigid ? 1 : Math.min(1.5, Math.max(0.72, Math.sqrt(b0 / b)));
      data[base + 2 * SLOTS * 4] = k;
    }
    tex.needsUpdate = true;
  }

  // ── the surfaces: each two levels sharing their points ──────────────────────────────────────────────────────────
  const meshOf = (S, mat, order) => {
    if (!S) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(S.pos, 3));
    if (S.attr.place) {   // (a muscle's point: its place on its curve)
      geo.setAttribute('place', new THREE.BufferAttribute(S.attr.place, 4));
      geo.setAttribute('pair', new THREE.BufferAttribute(S.attr.pair, 4));
      geo.setAttribute('sec', new THREE.BufferAttribute(S.attr.sec, 4));
    } else {   // (the skin's: the four joints it hangs on and how much on each; how it curves and how thick the body is under it; the cone its light comes from; its tone)
      for (const k of ['bone', 'weight', 'feel', 'bent', 'tone']) geo.setAttribute(k, new THREE.BufferAttribute(S.attr[k], 4));
    }
    geo.setAttribute('snor', new THREE.BufferAttribute(S.attr.nor, 3));
    geo.setAttribute('look', new THREE.BufferAttribute(S.attr.look, 4));
    // (each coarser level the same buffers under its own faces: the skin's three, the muscles' two)
    const levels = [S.fine, S.coarse, S.far].filter(Boolean).map((index) => { const g = geo.clone(); for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]); g.setIndex(new THREE.BufferAttribute(index, 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4); return g; });
    const mesh = new THREE.Mesh(levels[0], mat); mesh.frustumCulled = false; mesh.layers.enable(CASTS);
    mesh.renderOrder = order;   // (what covers is drawn before what it covers, so what is hidden is never shaded)
    mesh.userData.levels = levels; mesh.userData.faces = S.fine.length / 3; mesh.userData.off = S.off ?? null;
    return mesh;
  };
  // (a muscles' payload of its own, or a body's: its muscles and its skin)
  const M = D.skin || D.muscles?.pos ? D.muscles : D, S = D.skin ?? null;
  const mats = [materialOf(tex, eye, 'muscle'), S && skinMaterial({ joints: jointTex, eye, maps: S.maps }), S && materialOf(tex, eye, 'fat', D.skinThick ?? 0.0018, jointTex)];
  const muscles = meshOf(M, mats[0], -1), skin = meshOf(S, mats[1], -3), fat = S ? meshOf(S, mats[2], -2) : null;
  if (fat) { fat.geometry = skin.geometry; fat.userData.levels = skin.userData.levels; fat.userData.off = skin.userData.off; }
  const eyes = S ? eyesOf(bones, eye) : [], mouth = S ? mouthOf(bones, eye) : [];
  // Which level an eye d metres away is shown. The skin's by the one measure (src/detail/measure.js): the coarsest of
  // its levels that stands off the smooth surface by no more than ERROR_PX pixels there (its `off`, metres, measured as
  // it was laid: ../skin/build.js). The muscles' by their distance, as they were.
  const want = (m, d) => { const off = m.userData.off; if (!off) return d > FAR ? 1 : 0; let k = 0; while (k + 1 < off.length && pxOn(off[k + 1], d * U.uLodInv.value) <= ERROR_PX) k++; return k; };
  return {
    muscles, skin, fat, eyes, mouth, update,
    counts: { muscles: (D.muscleList ?? M.muscles ?? []).length, strands: H, muscleFaces: muscles?.userData.faces ?? 0, skinFaces: skin?.userData.faces ?? 0 },
    level(d) { for (const m of [muscles, skin, fat]) if (m) { const g = m.userData.levels[Math.min(m.userData.levels.length - 1, want(m, d))]; if (m.geometry !== g) m.geometry = g; } },
    dispose() { for (const m of [muscles, skin]) if (m) for (const g of m.userData.levels) g.dispose(); tex.dispose(); jointTex?.dispose(); for (const m of mats) if (m) { for (const t of m.userData.pictures ?? []) t.dispose(); m.dispose(); } for (const e of [...eyes, ...mouth]) { e.geometry.dispose(); e.material.dispose(); } },
  };
}

// ── the eyes (intent 0040): a ball 24 mm across in each socket, carried by the eye's own joint; and the lashes ────────
// The ball shows through the opening the skin is cut by (../skin/light.js: the same almond, so the two edges are one
// line). What makes an eye read as an eye, each drawn here: the white is not white, and lies in the upper lid's shade;
// the iris sits behind the cornea's bulge (seen from the side it shifts as the eye turns from the looker), with its
// fibres, a dark ring where it meets the white, and the pupil; the cornea mirrors the sun as one small sharp glint; a
// wet line lies on the lower lid; the inner corner is pink. Its measures: ../skin/table.js EYE.
function eyesOf(bones, eye) {
  const out = [], R = EYE.r, WHITE = [0.62, 0.595, 0.565];   // (the white of the eye: off white, a little darker than paper: in a face it is seldom the brightest thing)
  for (const [s, side] of [['L', 1], ['R', -1]]) {
    const b = bones['eye.' + s]; if (!b) continue;
    const m = new THREE.NodeMaterial(); m.eye = eye;
    m.fragmentNode = Fn(() => {
      const out = vec4(0).toVar(), p = positionGeometry, o = eyeOpeningNode(vec2(p.x.mul(side), p.y));
      Discard(o.d.lessThan(-0.0004).or(p.z.lessThan(0)));   // (under the lids, and its back: never seen)
      If(unlit().not(), () => {
        const w = positionWorld, V = normalize(eye.sub(w)), L = U.uSunDir, Vl = normalize(modelWorldMatrixInverse.mul(vec4(eye.sub(w), 0)).xyz), rho = length(p.xy);
        // the iris, 2 mm behind the cornea's front: looked at aslant, what is seen of it lies further along the look
        const cornea = smoothstep(EYE.iris * 1.14, EYE.iris * 0.92, rho), at = p.xy.sub(Vl.xy.div(max(Vl.z, 0.35)).mul(cornea.mul(0.002))), ri = length(at).div(EYE.iris);
        const iris = smoothstep(1.0, 0.95, ri), pupil = smoothstep(EYE.pupil / EYE.iris + 0.035, EYE.pupil / EYE.iris - 0.02, ri), dir = normalize(at.add(1e-6));
        const fibre = mx_noise_float(vec3(dir.x.mul(9), dir.y.mul(9), ri.mul(2.5))).mul(0.5).add(mx_noise_float(vec3(dir.x.mul(26), dir.y.mul(26), ri.mul(6))).mul(0.3));
        // (a second light, the eye's alone: a face turned to the day mirrors the bright sky before it, high in the
        // cornea, whichever way the sun stands: the spark a look has. And the iris lit through the cornea from that side
        // is brightest on its far side)
        const upW = vec3(0, 1, 0), L2 = normalize(V.add(upW.mul(0.62)).add(normalize(cross(upW, V)).mul(0.4))), L2l = normalize(modelWorldMatrixInverse.mul(vec4(L2, 0)).xyz);
        const far = clamp(dot(dir, normalize(L2l.xy.add(1e-6)).negate()), 0, 1), lit2 = far.mul(far).mul(smoothstep(0.3, 0.75, ri)).mul(0.7).add(1);
        const stroma = mix(vec3(0.4, 0.26, 0.09), vec3(0.17, 0.115, 0.055), smoothstep(0.3, 0.95, ri)).mul(fibre.mul(0.55).add(0.95)).mul(lit2).mul(mix(float(1), float(0.32), smoothstep(0.8, 1.0, ri)));
        // the white: off white, veined and pinker towards the corners; the inner corner's pink flesh; the lower lid's rim
        const vein = smoothstep(0.15, 0.75, mx_noise_float(vec3(p.x.mul(700), p.y.mul(1800), 2.3))).mul(smoothstep(0.0062, 0.011, rho)).mul(0.3);
        let col = mix(vec3(...WHITE), vec3(0.6, 0.35, 0.32), vein);
        col = mix(mix(col, stroma, iris), vec3(0.008), pupil);
        col = mix(col, vec3(0.58, 0.4, 0.38), smoothstep(0.24, 0.1, o.t).mul(0.55));   // (pinker into the inner corner)
        col = mix(col, vec3(0.55, 0.32, 0.29), smoothstep(0.0005, 0.0, o.over).mul(0.8));
        // its light: soft on a wet ball; dimmer under the upper lid and into the corners
        const nS = normalize(modelWorldMatrix.mul(vec4(p, 0)).xyz), nC = normalize(modelWorldMatrix.mul(vec4(p.xy.div(0.0078), sqrt(max(float(1).sub(rho.mul(rho).div(0.0078 * 0.0078)), 0.05)), 0)).xyz), n = normalize(mix(nS, nC, cornea));
        const shade = mix(float(0.32), float(1), smoothstep(0.0002, 0.006, o.under)).mul(mix(float(0.75), float(1), smoothstep(0, 0.002, o.over))).mul(mix(float(0.6), float(1), smoothstep(0.0, 0.14, o.t).mul(smoothstep(1.0, 0.88, o.t))));
        const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w))), diff = max(dot(nS, L).mul(0.55).add(0.45), 0);
        // the sun's glint in the cornea, small and sharp; a broader one on the wet white; the sky mirrored at a grazing look; the wet line
        const H = normalize(V.add(L)), ndh = max(dot(n, H), 0), ndv = max(dot(n, V), 0), fres = float(0.025).add(float(0.975).mul(pow(float(1).sub(ndv), 5)));
        const glint = pow(ndh, 1400).mul(9).mul(cornea).add(pow(ndh, 260).mul(0.7)).mul(smoothstep(0.0, 0.0025, o.under));
        const wet = smoothstep(0.001, 0.0002, o.over).mul(0.22);
        const H2 = normalize(V.add(L2)), nh2 = max(dot(n, H2), 0), spark = pow(nh2, 420).mul(4.5).add(pow(nh2, 4000).mul(16)).mul(cornea).mul(smoothstep(0.0, 0.002, o.under)).mul(smoothstep(0.0, 0.0015, o.over));
        const lit = col.mul(skyLight(nS).mul(0.8).add(sun.mul(diff))).mul(shade).add(sun.mul(glint.add(wet))).add(skyLight(upW).mul(spark)).add(skyLight(reflect(V.negate(), n)).mul(fres).mul(shade));
        out.assign(finish(lit, w, eye));
      });
      return out;
    })();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), m);
    // (and behind it the socket's own: the opening is 30 mm long, the globe 24 across, so at its corners the look goes
    // past the globe: onto the white going on round it, in the lids' shade, and at the inner corner onto the small
    // pink mound of flesh there, not into the head)
    const behind = (off, r, pink) => {
      const mat = new THREE.NodeMaterial(); mat.eye = eye;
      mat.fragmentNode = Fn(() => {
        const out = vec4(0).toVar(), p = positionGeometry.add(vec3(...off)), o = eyeOpeningNode(vec2(p.x.mul(side), p.y));
        Discard(positionGeometry.z.lessThan(0));   // (not cut along the lids' edges as the globe is: it lies behind the lids, and looked at from the side what is seen past a lid's edge lies outside the opening as drawn from the front)
        If(unlit().not(), () => {
          // (the white going on: lit as the globe is where they meet, so no line shows there; the mound by its own round)
          const w = positionWorld, n = normalize(modelWorldMatrix.mul(vec4(pink ? positionGeometry : p, 0)).xyz), sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w)));
          const shade = mix(float(0.32), float(1), smoothstep(0.0002, 0.006, o.under)).mul(mix(float(0.75), float(1), smoothstep(0, 0.002, o.over))).mul(mix(float(0.6), float(1), smoothstep(0.0, 0.14, o.t).mul(smoothstep(1.0, 0.88, o.t))));
          const col = pink ? vec3(0.56, 0.29, 0.27) : vec3(...WHITE);
          out.assign(finish(col.mul(skyLight(n).mul(0.8).add(sun.mul(max(dot(n, U.uSunDir).mul(0.55).add(0.45), 0)))).mul(shade), w, eye));
        });
        return out;
      })();
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat); mesh.position.set(...off); return mesh;
    };
    const bed = behind([0, 0, -0.00975], 0.0178, false), mound = behind([side * -0.0148, -0.0013, 0.0015], 0.0042, true);
    b.add(mesh, bed, mound); out.push(mesh, bed, mound, lashesOf(b, side, eye));
  }
  return out;
}

// The smile's teeth and the dark of the mouth behind them, seen through the lips' opening (../skin/light.js cuts it; the
// skin there stands back on the teeth's faces, ../skin/head.js). The upper row's ten front teeth, each a crown where
// the skull's tooth stands (../skeleton/skull.js teethOf: the skeleton itself is not drawn under the skin): its neck's
// round section widening to its edge, a cutting tooth thinned there to a blade, the canine drawn to a point. They ride
// on the head's joint, written where they stand at rest. (Their necks are drawn fuller than the skull's teeth are: no
// gum is drawn between them, and the dark showed there as gaps.)
function mouthOf(bones, eye) {
  const b = bones.head; if (!b) return [];
  const rest = rigOf().head.at, pos = [], idx = [], N = 14;
  const SECT = [   // [how far from the neck to the edge, the share of its half-length along the row, of its half-thickness across it]
    [[0, 0.86, 0.8], [0.3, 0.96, 0.94], [0.6, 1.02, 0.86], [0.85, 1.03, 0.5], [0.97, 0.98, 0.22], [1.0, 0.88, 0.1]],
    [[0, 0.84, 0.78], [0.3, 0.96, 0.96], [0.6, 1.02, 1.0], [0.82, 0.88, 0.78], [0.96, 0.46, 0.4], [1.0, 0.18, 0.16]],
    [[0, 0.86, 0.72], [0.35, 0.96, 0.88], [0.7, 1.02, 1.0], [0.93, 0.94, 0.88], [1.0, 0.58, 0.5]],
  ];
  for (const T of teethOf('U').slice(0, 5)) for (const sx of [1, -1]) {
    const base = pos.length / 3, S = SECT[T.kind], m = (v) => [sx * v[0], v[1], v[2]], neck = m(T.neck), ax = m(T.ax), o = m(T.o), t = m(T.t);
    for (const [f, wl, wt] of S) for (let j = 0; j < N; j++) {
      const a = (j / N) * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a), e = 2 / 2.6, u = Math.sign(c) * Math.abs(c) ** e * (T.len / 2) * wl, w = Math.sign(sn) * Math.abs(sn) ** e * (T.thick / 2) * wt;
      pos.push(neck[0] + ax[0] * T.tall * f + t[0] * u + o[0] * w, neck[1] + ax[1] * T.tall * f + t[1] * u + o[1] * w, neck[2] + ax[2] * T.tall * f + t[2] * u + o[2] * w);
    }
    const tip = pos.length / 3; pos.push(neck[0] + ax[0] * T.tall, neck[1] + ax[1] * T.tall, neck[2] + ax[2] * T.tall);
    const quad = (p, q, r, s2) => (sx > 0 ? idx.push(p, q, r, p, r, s2) : idx.push(p, r, q, p, s2, r));
    for (let k = 0; k < S.length - 1; k++) for (let j = 0; j < N; j++) quad(base + k * N + j, base + k * N + (j + 1) % N, base + (k + 1) * N + (j + 1) % N, base + (k + 1) * N + j);
    for (let j = 0; j < N; j++) { const p = base + (S.length - 1) * N + j, q = base + (S.length - 1) * N + (j + 1) % N; sx > 0 ? idx.push(p, q, tip) : idx.push(q, p, tip); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const lit = (colour, gloss) => {
    const mat = new THREE.NodeMaterial(); mat.eye = eye;
    mat.fragmentNode = Fn(() => {
      const out = vec4(0).toVar();
      If(unlit().not(), () => {
        const P = positionGeometry, o = mouthOpeningNode(vec2(P.x.abs(), P.y)), w = positionWorld, n = normalize(normalWorld), V = normalize(eye.sub(w)), L = U.uSunDir;
        // (in the mouth: under the upper lip's shade, darker towards the corners and further in)
        const shade = mix(float(0.42), float(1), smoothstep(-0.0005, 0.0045, o.under)).mul(mix(float(1), float(0.4), smoothstep(0.012, 0.026, P.x.abs()))).mul(mix(float(0.75), float(1), smoothstep(-0.0005, 0.002, o.over)));
        const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w))), diff = max(dot(n, L).mul(0.6).add(0.4), 0);
        const col = colour(P);
        const H = normalize(V.add(L)), fres = float(0.04).add(float(0.96).mul(pow(float(1).sub(max(dot(n, V), 0)), 5)));
        // (enamel is wet and hard: the sun's glint on it, and the bright sky before the face, as in the eyes)
        const upW = vec3(0, 1, 0), H2 = normalize(V.add(normalize(V.add(upW.mul(0.62)).add(normalize(cross(upW, V)).mul(0.4))))), spark = pow(max(dot(n, H2), 0), 220).mul(0.9);
        out.assign(finish(col.mul(skyLight(n).mul(0.85).add(sun.mul(diff))).mul(shade).add(sun.mul(pow(max(dot(n, H), 0), 300)).mul(gloss).mul(shade)).add(skyLight(upW).mul(spark).mul(gloss).mul(shade)).add(skyLight(reflect(V.negate(), n)).mul(fres).mul(gloss).mul(shade)), w, eye));
      });
      return out;
    })();
    return mat;
  };
  // (enamel: ivory, a little yellower towards the gum)
  const teeth = new THREE.Mesh(g, lit((P) => mix(vec3(0.74, 0.71, 0.635), vec3(0.72, 0.64, 0.5), smoothstep(1.6085, 1.6165, P.y)), 1));
  // (the dark behind them: the mouth's inside, never seen but as what is not teeth)
  const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18).scale(0.045, 0.024, 0.047).translate(0, 1.609, 0.04), lit(() => vec3(0.09, 0.025, 0.025), 0));
  for (const mesh of [teeth, bag]) { mesh.position.set(-rest[0], -rest[1], -rest[2]); mesh.frustumCulled = false; b.add(mesh); }
  return [teeth, bag];
}

// The lashes: fine hairs along the lids' edges, each a slim three-sided strand from the lid's rim out and curling (the
// upper ones up, longer in the middle and outwards; the lower ones short, down). They hang on the eye's joint.
function lashesOf(bone, side, eye) {
  const pos = [], idx = [], Rl = EYE.r + EYE.lid, rnd = (i) => { const x = Math.sin(i * 127.1 + side * 3.7) * 43758.5453; return x - Math.floor(x); };
  const add3 = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k], unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const strand = (pts, radii) => {
    const base = pos.length / 3;
    pts.forEach((c, i) => { const along = unit(i < pts.length - 1 ? [pts[i + 1][0] - c[0], pts[i + 1][1] - c[1], pts[i + 1][2] - c[2]] : [c[0] - pts[i - 1][0], c[1] - pts[i - 1][1], c[2] - pts[i - 1][2]]), e1 = unit([along[1], -along[0], 0.001]), e2 = [along[1] * e1[2] - along[2] * e1[1], along[2] * e1[0] - along[0] * e1[2], along[0] * e1[1] - along[1] * e1[0]];
      for (let k = 0; k < 3; k++) { const a = (k / 3) * 2 * Math.PI; pos.push(c[0] + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * radii[i], c[1] + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * radii[i], c[2] + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * radii[i]); } });
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 3; k++) { const a = base + i * 3 + k, b = base + i * 3 + (k + 1) % 3; idx.push(a, b, a + 3, b, b + 3, a + 3); }
  };
  const row = (count, upper) => {
    for (let i = 0; i < count; i++) {
      const t = 0.1 + 0.87 * ((i + rnd(i + (upper ? 0 : 500))) / count), u = EYE.inner[0] + (EYE.outer[0] - EYE.inner[0]) * t, tc = Math.min(0.999, Math.max(0.001, t)), base = EYE.inner[1] + (EYE.outer[1] - EYE.inner[1]) * t;
      const bump = (p) => Math.pow(tc / p, 1.15 * p) * Math.pow((1 - tc) / (1 - p), 1.15 * (1 - p)), v = upper ? base + EYE.upper[0] * bump(EYE.upper[1]) + 0.0002 : base - EYE.lower[0] * bump(EYE.lower[1]) - 0.0002;
      const root = [u * side, v, Math.sqrt(Math.max(1e-8, Rl * Rl - u * u - v * v))], n = unit(root), fan = (t - 0.45) * side;
      const len = (upper ? 0.0088 : 0.0046) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.02) / 0.98)))) * (0.8 + 0.4 * rnd(i * 3 + 1));
      const d0 = unit(upper ? [n[0] * 0.5 + fan * 0.9, n[1] * 0.5 - 0.2, n[2] * 0.5 + 0.8] : [n[0] * 0.5 + fan * 0.8, n[1] * 0.5 - 0.75, n[2] * 0.5 + 0.55]), mid = add3(root, d0, len * 0.55);
      const tip = add3(mid, unit(upper ? [d0[0], d0[1] + 1.15, d0[2] + 0.1] : [d0[0], d0[1] - 0.25, d0[2] + 0.35]), len * 0.5);
      strand([root, mid, tip], [0.00013, 0.0001, 0.00003]);
    }
  };
  row(78, true); row(34, false);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3)); geo.setIndex(idx);
  const m = new THREE.NodeMaterial(); m.eye = eye; m.side = THREE.DoubleSide;
  m.fragmentNode = Fn(() => { const out = vec4(0).toVar(); If(unlit().not(), () => { const w = positionWorld; out.assign(finish(vec3(0.022, 0.014, 0.01).mul(skyLight(vec3(0, 1, 0)).add(U.uSun.mul(sunDim().mul(cloudShade(w))).mul(0.5))), w, eye)); }); return out; })();
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; bone.add(mesh); return mesh;
}

// ── the looks ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Muscle red, darker and browner where its fibres part, a wet sheen; tendon and aponeurosis a bluish pearl white,
// glossier. Fat a lobed yellow, drawn on the skin's own surface a skin's thickness in. (The skin's: ../skin/light.js.)
// In the light as every surface of the world is (src/world/light.js), as the bones are (../bones.js).
function materialOf(tex, eye, kind, inset = 0, joints = null) {
  const m = new THREE.NodeMaterial(); m.eye = eye;
  const at = (col, row) => textureLoad(tex, ivec2(col, row));
  const curve = (row, i, t) => {
    const p0 = at(i, row).xyz, p1 = at(i.add(1), row).xyz, p2 = at(i.add(2), row).xyz, p3 = at(i.add(3), row).xyz, t2 = t.mul(t), t3 = t2.mul(t);
    const a = p2.sub(p0), b = p0.mul(2).sub(p1.mul(5)).add(p2.mul(4)).sub(p3), c = p1.mul(3).sub(p0).sub(p2.mul(3)).add(p3);
    const C = p1.mul(2).add(a.mul(t)).add(b.mul(t2)).add(c.mul(t3)).mul(0.5), dC = a.add(b.mul(t.mul(2))).add(c.mul(t2.mul(3))).mul(0.5);
    const o = mix(at(i.add(SLOTS + 1), row).xyz, at(i.add(SLOTS + 2), row).xyz, t), k = at(int(2 * SLOTS), row).x;
    return { C, T: normalize(dC), o, k };
  };
  const vN = varyingProperty('vec3', 'vFleshN');
  if (joints) m.positionNode = carriedBy(joints, inset);   // (the fat: the skin's own points, a skin's thickness in)
  else m.positionNode = Fn(() => {
    const place = attribute('place', 'vec4'), pair = attribute('pair', 'vec4'), sec = attribute('sec', 'vec4'), sn = attribute('snor', 'vec3');
    const row = int(place.x), A = curve(row, int(place.y), place.z);
    const C = vec3(A.C).toVar(), T = vec3(A.T).toVar(), o = vec3(A.o).toVar(), k = float(A.k).toVar();
    If(pair.w.greaterThan(0.5), () => {   // (a point between this row's curve and another's: a sheet's, the skin's)
      const B2 = curve(int(pair.w).sub(1), int(pair.x), pair.y), f = pair.z;
      C.assign(mix(C, B2.C, f)); T.assign(normalize(mix(T, B2.T, f))); o.assign(mix(o, B2.o, f)); k.assign(mix(k, B2.k, clamp(f, 0, 1)));
    });
    const O = normalize(o.sub(T.mul(dot(o, T)))), B = cross(T, O), kv = mix(float(1), k, place.w);
    const n = normalize(O.mul(sn.x).add(B.mul(sn.y)).add(T.mul(sn.z)));
    const p = C.add(O.mul(sec.x.mul(kv).add(sec.w))).add(B.mul(sec.y.mul(kv))).add(T.mul(sec.z));
    vN.assign(normalize(modelWorldMatrix.mul(vec4(n, 0)).xyz));
    // (drawn for the shadow, pulled towards the sun as every caster is)
    return p.add(normalize(modelWorldMatrixInverse.mul(vec4(U.uSunDir, 0)).xyz).mul(casterPull().mul(U.uShadowPass)));
  })();
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar();
    If(unlit().not(), () => {
      const w = positionWorld, look = attribute('look', 'vec4'), open = clamp(look.x, 0, 1), P = positionGeometry, n = normalize(vN);
      const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w)));
      const V = normalize(eye.sub(w)), L = U.uSunDir, ndl = dot(n, L), Hh = normalize(V.add(L)), ndh = max(dot(n, Hh), 0);
      if (kind === 'muscle') {
        const tendon = clamp(look.y, 0, 1);
        // fibres: fine lines along the muscle (across it they change fast, along it slowly), bundles a little coarser
        const fib = mx_noise_float(vec3(look.z.mul(1400), look.w.mul(30), 0.5)), bundle = mx_noise_float(vec3(look.z.mul(260), look.w.mul(9), 3.1));
        const red = vec3(0.47, 0.085, 0.07).mul(float(0.86).add(fib.mul(0.12)).add(bundle.mul(0.1))), pearl = vec3(0.8, 0.78, 0.74).mul(float(0.95).add(fib.mul(0.05)));
        const col = mix(red, pearl, tendon).mul(mix(vec3(0.55, 0.42, 0.4), vec3(1), open));
        const diff = max(ndl.add(0.25).div(1.25), 0);   // (flesh lets a little light round its edge)
        const gloss = mix(float(0.35), float(0.6), tendon), spec = pow(ndh, gloss.mul(120).add(20)).mul(gloss.mul(0.55));
        out.assign(finish(col.mul(skyLight(n).mul(open.mul(open)).add(sun.mul(diff))).add(sun.mul(spec).mul(max(ndl, 0))), w, eye));
      } else if (kind === 'fat') {
        const lobe = mx_noise_float(P.mul(220)).mul(0.5).add(0.5), fine = mx_noise_float(P.mul(900));
        const col = vec3(0.86, 0.66, 0.26).mul(float(0.82).add(lobe.mul(0.22)).add(fine.mul(0.05))).mul(mix(vec3(0.6, 0.5, 0.4), vec3(1), open));
        const diff = max(ndl.add(0.3).div(1.3), 0), spec = pow(ndh, 60).mul(0.25);
        out.assign(finish(col.mul(skyLight(n).mul(open.mul(open)).add(sun.mul(diff))).add(sun.mul(spec).mul(max(ndl, 0))), w, eye));
      }
    });
    return out;
  })();
  return m;
}
