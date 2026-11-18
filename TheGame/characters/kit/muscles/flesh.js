// The muscles, the fat and the skin on the page (intent 0036): the surfaces drawn out by the workers
// (./build.js, ../skin/build.js), carried by the rig and drawn in the world's light. Loaded when a character with
// muscles is first made (../bones.js): the game, which shows none, carries none of it.
//
//   fleshOf(data, { object, bones, eye }) -> { muscles, skin, fat, eyes, update(), level(dist), dispose(), counts }
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
import { Fn, If, attribute, varyingProperty, uniform, float, int, ivec2, vec3, vec4, textureLoad, normalize, cross, mix, max, pow, clamp, dot, abs, length, smoothstep, exp, positionWorld, positionGeometry, modelWorldMatrix, modelWorldMatrixInverse, mx_noise_float } from 'three/tsl';
import { U } from '../../../src/core/uniforms.js';
import { finish, skyLight, unlit, sunDim, cloudShade, shadowAtPulled, casterPull } from '../../../src/world/light.js';
import { CASTS } from '../../../src/world/shadow.js';
import { SLOTS, COLS } from './layout.js';
import { pxOn, ERROR_PX } from '../../../src/detail/measure.js';
import { carriedBy, skinMaterial } from '../skin/light.js';

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
  const eyes = S ? eyesOf(bones, eye) : [];
  // Which level an eye d metres away is shown. The skin's by the one measure (src/detail/measure.js): the coarsest of
  // its levels that stands off the smooth surface by no more than ERROR_PX pixels there (its `off`, metres, measured as
  // it was laid: ../skin/build.js). The muscles' by their distance, as they were.
  const want = (m, d) => { const off = m.userData.off; if (!off) return d > FAR ? 1 : 0; let k = 0; while (k + 1 < off.length && pxOn(off[k + 1], d * U.uLodInv.value) <= ERROR_PX) k++; return k; };
  return {
    muscles, skin, fat, eyes, update,
    counts: { muscles: (D.muscleList ?? M.muscles ?? []).length, strands: H, muscleFaces: muscles?.userData.faces ?? 0, skinFaces: skin?.userData.faces ?? 0 },
    level(d) { for (const m of [muscles, skin, fat]) if (m) { const g = m.userData.levels[Math.min(m.userData.levels.length - 1, want(m, d))]; if (m.geometry !== g) m.geometry = g; } },
    dispose() { for (const m of [muscles, skin]) if (m) for (const g of m.userData.levels) g.dispose(); tex.dispose(); jointTex?.dispose(); for (const m of mats) if (m) { for (const t of m.userData.pictures ?? []) t.dispose(); m.dispose(); } for (const e of eyes) { e.geometry.dispose(); e.material.dispose(); } },
  };
}

// ── the eyes: a ball 24 mm across in each socket, carried by the eye's own joint ────────────────────────────────────
// The white, a little bluish and veined towards its edge; the iris (12 mm across) brown-green, its fibres; the pupil
// (4 mm); the cornea's gloss over them.
function eyesOf(bones, eye) {
  const out = [];
  for (const s of ['L', 'R']) {
    const b = bones['eye.' + s]; if (!b) continue;
    const m = new THREE.NodeMaterial(); m.eye = eye;
    m.fragmentNode = Fn(() => {
      const out = vec4(0).toVar();
      If(unlit().not(), () => {
        const p = normalize(positionGeometry), w = positionWorld, z = p.z, r = length(vec3(p.x, p.y, 0));
        const iris = smoothstep(0.52, 0.5, r).mul(smoothstep(0.75, 0.85, z)), pupil = smoothstep(0.19, 0.17, r).mul(smoothstep(0.9, 0.95, z));
        const fib = mx_noise_float(vec3(p.x.mul(60), p.y.mul(60), 0.3)).mul(0.15).add(1);
        const white = mix(vec3(0.86, 0.84, 0.82), vec3(0.8, 0.62, 0.6), smoothstep(0.5, -0.2, z).mul(0.5));
        const col = mix(mix(white, vec3(0.32, 0.24, 0.13).mul(fib), iris), vec3(0.02), pupil);
        const n = normalize(modelWorldMatrix.mul(vec4(p, 0)).xyz), V = normalize(eye.sub(w)), L = U.uSunDir, ndl = dot(n, L), Hh = normalize(V.add(L));
        const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w)));
        const spec = pow(max(dot(n, Hh), 0), 300).mul(2);
        out.assign(finish(col.mul(skyLight(n).mul(0.6).add(sun.mul(max(ndl, 0)).mul(0.8))).add(sun.mul(spec)), w, eye));
      });
      return out;
    })();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.012, 24, 16), m);
    b.add(mesh); out.push(mesh);
  }
  return out;
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
