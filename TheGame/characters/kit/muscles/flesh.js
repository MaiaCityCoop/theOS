// The muscles on the page (intent 0036): the surface drawn out by the workers (./build.js), carried by the rig and
// drawn in the world's light. Loaded when a character with muscles is first made (../bones.js): the game, which shows
// none, carries none of it.
//
//   fleshOf(data, { object, bones, eye }) -> { mesh, update(), level(dist), dispose(), muscles, strands, faces }
//     update()   each frame, after the rig has moved: every strand's points carried by their joints, into a texture the
//                shader reads (a row a strand); each strand's belly swollen or thinned by how much shorter or longer it
//                stands than at rest, so its volume stays what it was
//     level(d)   the level of detail for an eye d metres away: every ring and every point round it near, half of them
//                far (the same points either way)
//
// In the shader, a point of a strand is found on its curve again, each frame: the curve through the strand's points
// (Catmull-Rom, the same numbers the workers laid it with), the frame there (along it, out, across), and the point's
// own place in that frame, its section scaled by the belly's swell. A point of a sheet lies between two strands' curves
// and is carried by both.
import * as THREE from 'three/webgpu';
import { Fn, If, attribute, varyingProperty, uniform, float, int, ivec2, vec3, vec4, textureLoad, normalize, cross, mix, max, pow, clamp, dot, positionWorld, modelWorldMatrix, modelWorldMatrixInverse, mx_noise_float } from 'three/tsl';
import { U } from '../../../src/core/uniforms.js';
import { finish, skyLight, unlit, sunDim, cloudShade, shadowAtPulled, casterPull } from '../../../src/world/light.js';
import { CASTS } from '../../../src/world/shadow.js';
import { SLOTS, COLS } from './layout.js';

/** How far away the far level takes over (m). */
export const FAR = 7;

export function fleshOf(D, { object, bones, eye = uniform(U.uCam.value) }) {
  const rows = D.rows, H = rows.length, data = new Float32Array(COLS * 4 * H);
  const tex = new THREE.DataTexture(data, COLS, H, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  // the joints the strands hang on, each read once a frame
  const rigs = [...new Set(rows.flatMap((r) => r.keys.map((k) => k.rig)))], rel = rigs.map(() => new THREE.Matrix4()), inv = new THREE.Matrix4();
  const keyRig = rows.map((r) => r.keys.map((k) => rigs.indexOf(k.rig)));
  const P = [], Q = [];   // (a strand's points and outs this frame, reused)
  for (let i = 0; i < 9; i++) { P.push(new THREE.Vector3()); Q.push(new THREE.Vector3()); }
  const put = (base, col, v) => { const o = base + col * 4; data[o] = v.x; data[o + 1] = v.y; data[o + 2] = v.z; };
  const ghost = new THREE.Vector3();
  function update() {
    inv.copy(object.matrixWorld).invert();
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
      // the belly's swell: its tendons keep their length, its fleshy part takes the change, its section the inverse
      const b0 = row.L0 - row.Lt, b = Math.max(0.25 * b0, L - row.Lt), k = row.closed ? 1 : Math.min(1.5, Math.max(0.72, Math.sqrt(b0 / b)));
      data[base + 2 * SLOTS * 4] = k;
    }
    tex.needsUpdate = true;
  }

  // ── the surface: two levels sharing their points ─────────────────────────────────────────────────────────────────
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(D.pos, 3));
  geo.setAttribute('place', new THREE.BufferAttribute(D.attr.place, 4));
  geo.setAttribute('pair', new THREE.BufferAttribute(D.attr.pair, 4));
  geo.setAttribute('sec', new THREE.BufferAttribute(D.attr.sec, 4));
  geo.setAttribute('snor', new THREE.BufferAttribute(D.attr.nor, 3));
  geo.setAttribute('look', new THREE.BufferAttribute(D.attr.look, 4));
  const far = geo.clone(); for (const k of Object.keys(geo.attributes)) far.setAttribute(k, geo.attributes[k]);   // (the same buffers)
  geo.setIndex(new THREE.BufferAttribute(D.fine, 1)); far.setIndex(new THREE.BufferAttribute(D.coarse, 1));
  for (const g of [geo, far]) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);

  const mat = materialOf(tex, eye);
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.layers.enable(CASTS);
  mesh.renderOrder = -1;   // (drawn before the bones it covers, so what of them is hidden is never shaded)
  let lv = 0;
  return {
    mesh, update, muscles: D.muscles.length, strands: H, faces: D.fine.length / 3,
    level(d) { const want = d > FAR ? 1 : 0; if (want !== lv) { lv = want; mesh.geometry = want ? far : geo; } },
    dispose() { geo.dispose(); far.dispose(); tex.dispose(); mat.dispose(); },
  };
}

// ── the look: muscle and tendon ──────────────────────────────────────────────────────────────────────────────────────
// Muscle red, darker and browner where its fibres part, a wet sheen; tendon and aponeurosis a bluish pearl white,
// glossier. In the light as every surface of the world is (src/world/light.js), as the bones are (../bones.js).
function materialOf(tex, eye) {
  const m = new THREE.NodeMaterial(); m.eye = eye;
  const at = (col, row) => textureLoad(tex, ivec2(col, row));
  const curve = (row, i, t) => {
    const p0 = at(i, row).xyz, p1 = at(i.add(1), row).xyz, p2 = at(i.add(2), row).xyz, p3 = at(i.add(3), row).xyz, t2 = t.mul(t), t3 = t2.mul(t);
    const a = p2.sub(p0), b = p0.mul(2).sub(p1.mul(5)).add(p2.mul(4)).sub(p3), c = p1.mul(3).sub(p0).sub(p2.mul(3)).add(p3);
    const C = p1.mul(2).add(a.mul(t)).add(b.mul(t2)).add(c.mul(t3)).mul(0.5), dC = a.add(b.mul(t.mul(2))).add(c.mul(t2.mul(3))).mul(0.5);
    const o = mix(at(i.add(SLOTS + 1), row).xyz, at(i.add(SLOTS + 2), row).xyz, t), k = at(int(2 * SLOTS), row).x;
    return { C, T: normalize(dC), o, k };
  };
  const vN = varyingProperty('vec3', 'vMuscleN');
  m.positionNode = Fn(() => {
    const place = attribute('place', 'vec4'), pair = attribute('pair', 'vec4'), sec = attribute('sec', 'vec4'), sn = attribute('snor', 'vec3');
    const row = int(place.x), A = curve(row, int(place.y), place.z);
    const C = vec3(A.C).toVar(), T = vec3(A.T).toVar(), o = vec3(A.o).toVar(), k = float(A.k).toVar();
    If(pair.w.greaterThan(0.5), () => {   // (a point of a sheet: between this strand's curve and the next one's)
      const B2 = curve(row.add(1), int(pair.x), pair.y), f = pair.z;
      C.assign(mix(C, B2.C, f)); T.assign(normalize(mix(T, B2.T, f))); o.assign(mix(o, B2.o, f)); k.assign(mix(k, B2.k, clamp(f, 0, 1)));
    });
    const O = normalize(o.sub(T.mul(dot(o, T)))), B = cross(T, O), kv = mix(float(1), k, place.w);
    const p = C.add(O.mul(sec.x.mul(kv).add(sec.w))).add(B.mul(sec.y.mul(kv))).add(T.mul(sec.z));
    vN.assign(normalize(modelWorldMatrix.mul(vec4(O.mul(sn.x).add(B.mul(sn.y)).add(T.mul(sn.z)), 0)).xyz));
    // (drawn for the shadow, pulled towards the sun as every caster is)
    return p.add(normalize(modelWorldMatrixInverse.mul(vec4(U.uSunDir, 0)).xyz).mul(casterPull().mul(U.uShadowPass)));
  })();
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar();
    If(unlit().not(), () => {
      const w = positionWorld, look = attribute('look', 'vec4'), open = clamp(look.x, 0, 1), tendon = clamp(look.y, 0, 1);
      // fibres: fine lines along the muscle (across it they change fast, along it slowly), bundles a little coarser
      const fib = mx_noise_float(vec3(look.z.mul(1400), look.w.mul(30), 0.5)), bundle = mx_noise_float(vec3(look.z.mul(260), look.w.mul(9), 3.1));
      const red = vec3(0.47, 0.085, 0.07).mul(float(0.86).add(fib.mul(0.12)).add(bundle.mul(0.1))), pearl = vec3(0.8, 0.78, 0.74).mul(float(0.95).add(fib.mul(0.05)));
      const col = mix(red, pearl, tendon).mul(mix(vec3(0.55, 0.42, 0.4), vec3(1), open));
      const n = normalize(vN);
      const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w)));
      const V = normalize(eye.sub(w)), L = U.uSunDir, ndl = dot(n, L), Hh = normalize(V.add(L)), ndh = max(dot(n, Hh), 0);
      const diff = max(ndl.add(0.25).div(1.25), 0);   // (flesh lets a little light round its edge)
      const gloss = mix(float(0.35), float(0.6), tendon), spec = pow(ndh, gloss.mul(120).add(20)).mul(gloss.mul(0.55));
      const lit = col.mul(skyLight(n).mul(open.mul(open)).add(sun.mul(diff))).add(sun.mul(spec).mul(max(ndl, 0)));
      out.assign(finish(lit, w, eye));
    });
    return out;
  })();
  return m;
}
