// The skin's light (intent 0041), in TSL: how a point of skin is carried by its joints and how it gives back the
// world's light, as skin does. Loaded with ../muscles/flesh.js, when a body is first made.
//
//   carriedBy(joints, inset) -> a position node: each point where its four joints carry it, each by its share (linear
//       blend skinning: a joint is three texels of `joints`, the rows of the 3 x 4 matrix that takes a point from where
//       it stood at rest to where the joint has it now); `inset` metres under the skin (the fat). It gives the
//       fragment the point's normal and the way its light comes from, as they stand now.
//   skinMaterial({ joints, eye, maps }) -> the skin's material
//
// What makes skin read as skin and not as plaster or wax, each from a published measure (the constants below):
//   - Light enters it and comes out a little way off, red furthest (1.2 mm; green 0.26, blue 0.16). On the breadth of
//     a thigh that changes nothing; round a finger, an ear, the nose's wing it carries red past the shade's edge. So
//     the diffuse light is read from a table by how the point faces the light and how sharply the skin curves there
//     (./maps.js scatterMap), not wrapped by one share everywhere.
//   - Its gloss is the oil's and the skin's own surface: two lobes, a broad one and a small sharp one, of a surface
//     that mirrors 2.8 % head on and all of it at a grazing angle.
//   - Its fine relief (./maps.js microMap) breaks that gloss up; the red light under it does not see it.
//   - A thin part lets the light through red: the ear, the nose's wing, the web of a hand.
//   - Shade on skin is never grey: light bounces in a fold from skin to skin and comes out redder.
//   - It is not one colour: the blood nearer here, the pigment denser there (./table.js TONE, laid on its points).
// In the light as every surface of the world is (src/world/light.js): the sun past the clouds and what casts a shadow,
// the sky's light. The body's own shade on itself is not the shadow map's (its texels are wider than an arm): each
// point knows the cone its light comes from as the body stands (./build.js), and the sun is taken as far as it lies
// within that cone.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, attribute, varyingProperty, float, int, ivec2, vec2, vec3, vec4, texture, textureLoad, normalize, cross, mix, max, min, pow, clamp, dot, abs, length, smoothstep, exp, exp2, sqrt, reflect, positionWorld, positionGeometry, modelWorldMatrix, modelWorldMatrixInverse, mx_noise_float } from 'three/tsl';
import { U } from '../../../src/core/uniforms.js';
import { finish, skyLight, unlit, sunDim, cloudShade, shadowAtPulled, casterPull } from '../../../src/world/light.js';
import { CURVE_MOST } from './maps.js';
import { EYE, LIPS, BROW, MOUTH, OPENINGS, FOLDS } from './table.js';

/** What a surface of skin mirrors head on: 2.8 %, an index of refraction of 1.4 (the figure every skin shader holds:
    Jimenez's SeparableSSS demo, Unity HDRP's diffusion profile, GPU Gems 3 ch. 14). */
export const F0 = 0.028;
/** The gloss's two lobes: the skin's roughness times these, the broad one this share of the whole (Unreal Engine's
    subsurface profile, its defaults: ShadingModels.ush DualSpecularGGX). */
export const LOBES = { sharp: 0.75, broad: 1.3, mix: 0.85 };
/** The skin's roughness (0 a mirror, 1 chalk): dry, where it is oiliest, a nail, a lip. Skin's as the Physically Based
    database lists it (0.5); the rest about it by eye. */
export const ROUGH = { skin: 0.5, oily: 0.36, nail: 0.24, lip: 0.34 };
/** How far light comes through a thin part: the under-skin bells (./maps.js SCATTER) taken at this share of the
    part's thickness in millimetres (an ear is gristle and two thin skins, not a slab of skin: Jimenez et al. 2010,
    "Real-time realistic skin translucency", scale it likewise by a part's translucency). */
export const THROUGH = 0.35;
/** A fair skin's own colour (linear light), before its blood and its pigment (./table.js TONE) tint it place by place:
    between the Physically Based database's skin I and skin III. What more pigment and more blood multiply it by. */
export const SKIN = { brow: [0.05, 0.032, 0.022], base: [0.58, 0.36, 0.26], pigment: [0.7, 0.56, 0.45], blood: [1.0, 0.72, 0.7], pale: [1.05, 1.04, 0.94], vein: [0.84, 0.9, 1.06], lip: [0.56, 0.2, 0.18], areola: [0.62, 0.45, 0.42], nail: [0.6, 0.4, 0.36] };
/** How strongly the fine relief turns the normal. */
const RELIEF = 0.55;
/** How steep a fold's sides are taken to be, for the light (./table.js FOLDS). */
const FOLD = 1.5;

const vN = varyingProperty('vec3', 'vFleshN'), vB = varyingProperty('vec3', 'vFleshB');

/** The eye's opening at a place q of the globe's front view (m: x outwards from the globe's middle, y up), as
    ./table.js eyeOpening has it: how far inside the lids' edges (negative under a lid), how far below the upper lid's
    edge, how far above the lower's, and where along the line between the corners. The skin is cut by it, the eyeball
    shaded by it (../muscles/flesh.js). */
/** The mouth's opening at a place of the face seen from the front (./table.js mouthOpening, its twin): q = [how far from
    the middle, how high]. */
export const mouthOpeningNode = (q) => {
  const M = MOUTH, t = clamp(q.x.div(M.half), 0, 1), yu = float(M.upper).add(pow(t, 2.2).mul(M.corner - M.upper)), yl = float(M.lower).add(t.mul(t).mul(M.corner - M.lower)), under = yu.sub(q.y), over = q.y.sub(yl);
  return { d: q.x.greaterThanEqual(M.half).select(length(vec2(q.x.sub(M.half), q.y.sub(M.corner))).negate(), min(under, over)), under, over, t };
};
export const eyeOpeningNode = (q) => {
  const E = EYE, d = vec2(E.outer[0] - E.inner[0], E.outer[1] - E.inner[1]), t = dot(q.sub(vec2(...E.inner)), d).div(dot(d, d)), tc = clamp(t, 0.001, 0.999);
  const bump = (p) => pow(tc.div(p), 1.15 * p).mul(pow(tc.oneMinus().div(1 - p), 1.15 * (1 - p))), base = float(E.inner[1]).add(d.y.mul(tc));
  const under = base.add(bump(E.upper[1]).mul(E.upper[0])).sub(q.y), over = q.y.sub(base.sub(bump(E.lower[1]).mul(E.lower[0])));
  const along = t.greaterThan(0).and(t.lessThan(1)), d0 = min(under, over);
  return { d: along.select(d0, float(-1)), under, over, t };
};

export function carriedBy(joints, inset = 0) {
  return Fn(() => {
    const bone = attribute('bone', 'vec4'), wt = attribute('weight', 'vec4'), p0 = vec4(positionGeometry, 1), n0 = attribute('snor', 'vec3'), b0 = attribute('bent', 'vec4').xyz;
    const p = vec3(0).toVar(), n = vec3(0).toVar(), b = vec3(0).toVar();
    for (const c of ['x', 'y', 'z', 'w']) {
      If(wt[c].greaterThan(0), () => {
        const j = int(bone[c]), r0 = textureLoad(joints, ivec2(0, j)), r1 = textureLoad(joints, ivec2(1, j)), r2 = textureLoad(joints, ivec2(2, j));
        p.addAssign(vec3(dot(r0, p0), dot(r1, p0), dot(r2, p0)).mul(wt[c]));
        n.addAssign(vec3(dot(r0.xyz, n0), dot(r1.xyz, n0), dot(r2.xyz, n0)).mul(wt[c]));
        b.addAssign(vec3(dot(r0.xyz, b0), dot(r1.xyz, b0), dot(r2.xyz, b0)).mul(wt[c]));
      });
    }
    const nn = normalize(n);
    vN.assign(normalize(modelWorldMatrix.mul(vec4(nn, 0)).xyz));
    vB.assign(normalize(modelWorldMatrix.mul(vec4(b, 0)).xyz));
    const q = inset ? p.sub(nn.mul(inset)) : p;   // (the fat: under the skin by the skin's thickness)
    // (drawn for the shadow, pulled towards the sun as every caster is)
    return q.add(normalize(modelWorldMatrixInverse.mul(vec4(U.uSunDir, 0)).xyz).mul(casterPull().mul(U.uShadowPass)));
  })();
}

/** A small picture as a texture: the scatter table (read between its cells, held at its edges), or the relief's tile
    (repeating, with its smaller copies for far away). */
function pictureOf({ w, h, data }, tile) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = tile ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.generateMipmaps = tile;
  t.wrapS = t.wrapT = tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; if (tile) t.anisotropy = 4;
  t.needsUpdate = true; return t;
}

export function skinMaterial({ joints, eye, maps }) {
  const m = new THREE.NodeMaterial(); m.eye = eye;
  const scatter = pictureOf(maps.scatter, false), micro = pictureOf(maps.micro, true), span = maps.micro.span;
  m.userData.pictures = [scatter, micro];
  m.positionNode = carriedBy(joints);
  m.fragmentNode = Fn(() => {
    const out = vec4(0).toVar();
    // the eye's opening: the skin runs over the globe as a closed lid does, and is cut away inside the lids' edges
    { const R = positionGeometry, o = eyeOpeningNode(vec2(abs(R.x).sub(EYE.at[0]), R.y.sub(EYE.at[1]))); Discard(o.d.greaterThan(0).and(R.z.greaterThan(EYE.at[2]))); }
    // the mouth's, smiling: between the lips' edges the skin stood back on the teeth; there it is cut away and the teeth show
    { const R = positionGeometry, o = mouthOpeningNode(vec2(abs(R.x), R.y)); Discard(o.d.greaterThan(0).and(R.z.greaterThan(0.06)).and(R.y.lessThan(1.63))); }
    If(unlit().not(), () => {
      const w = positionWorld, P = positionGeometry, look = attribute('look', 'vec4'), feel = attribute('feel', 'vec4'), tone = attribute('tone', 'vec4');
      const open = clamp(look.x, 0, 1), nail = clamp(look.z, 0, 1), areola = clamp(look.w, 0, 1), cone = attribute('bent', 'vec4').w;
      const sn = normalize(attribute('snor', 'vec3')), n = normalize(vN), nb = normalize(vB), V = normalize(eye.sub(w)), L = U.uSunDir;
      // the face's own lines, by where the point stood at rest (the left side's, mirrored): how far outside the eye's
      // opening it lies; the lips' red round the mouth's opening and their inner edge; a brow's hairs
      const Q = vec3(abs(P.x), P.y, P.z), eyeAt = eyeOpeningNode(Q.xy.sub(vec2(EYE.at[0], EYE.at[1]))), lidEdge = Q.z.greaterThan(EYE.at[2]).select(smoothstep(-0.0014, -0.0002, eyeAt.d), 0);
      const mouth = mouthOpeningNode(Q.xy), mx = Q.x.div(MOUTH.half), inMouth = smoothstep(1.06, 0.98, mx).mul(smoothstep(0.07, 0.08, Q.z)), above = mouth.under.negate(), below = mouth.over.negate();
      const upperRed = mix(float(LIPS.bow[2]), float(LIPS.bow[1]), smoothstep(0, LIPS.bow[0], Q.x)).mul(pow(clamp(mx.mul(mx).oneMinus(), 0, 1), 0.7)), lowerRed = pow(clamp(pow(mx, 2.2).oneMinus(), 0, 1), 0.8).mul(LIPS.lower);
      const lip = clamp(smoothstep(-0.002, -0.0006, above).mul(smoothstep(upperRed.add(0.0005), upperRed.sub(0.0007), above)).add(smoothstep(-0.002, -0.0006, below).mul(smoothstep(lowerRed.add(0.0012), lowerRed.sub(0.001), below))), 0, 1).mul(inMouth);
      const lipLine = smoothstep(-0.0014, 0.0002, mouth.d).mul(inMouth);   // (the lips' inner edge, where they turn in to the teeth: wet and darker)
      const bs = clamp(Q.x.sub(BROW.from[0]).div(BROW.to[0] - BROW.from[0]), 0, 1), bp = pow(bs, Math.log(0.5) / Math.log((BROW.peak[0] - BROW.from[0]) / (BROW.to[0] - BROW.from[0])));
      const browY = mix(float(BROW.from[1]), float(BROW.to[1]), bs).add(bp.mul(bp.oneMinus()).mul(4 * (BROW.peak[1] - (BROW.from[1] + BROW.to[1]) / 2))).add(P.x.sign().mul(0.0006)), browHalf = mix(float(BROW.thick[0]), float(BROW.thick[1]), bs).mul(0.5).mul(smoothstep(0, 0.07, bs)).mul(smoothstep(1, 0.8, bs));
      const browIn = smoothstep(browHalf.add(0.0008), browHalf.sub(0.0012), abs(Q.y.sub(browY))).mul(smoothstep(0.05, 0.065, Q.z)).mul(smoothstep(0, 0.02, bs)).mul(smoothstep(1, 0.98, bs));
      // (its hairs: fine, lying outwards and a little up, thinner towards its edge)
      const brow = browIn.mul(smoothstep(-0.2, 0.3, mx_noise_float(vec3(Q.x.mul(520).sub(Q.y.mul(330)), Q.y.mul(3400).add(Q.x.mul(1200)), 1.7)).mul(0.7).add(mx_noise_float(vec3(Q.x.mul(1500), Q.y.mul(5200).add(Q.x.mul(1700)), 4.1)).mul(0.4)).add(browIn.mul(0.45)).sub(0.25)));
      const stubble = clamp(feel.w, 0, 1);
      // (the nostrils: dark inside, wherever the skin lies in one: little light finds its way up a nose)
      const NO = OPENINGS.find((o) => o.what === 'nostril').solid, nostril = float(1).sub(smoothstep(0.8, 1.3, length(Q.sub(vec3(...NO[1])).div(vec3(...NO[2])))));
      // (the upper lid's fold, a line over its edge; the lids' thin skin a little darker and redder; the face's skin finer than the body's)
      const front = smoothstep(EYE.at[2] - 0.004, EYE.at[2] + 0.004, Q.z), crease = exp(eyeAt.under.add(0.0042).div(0.0006).pow(2).negate()).mul(smoothstep(0.04, 0.3, eyeAt.t)).mul(smoothstep(0.99, 0.75, eyeAt.t)).mul(front);
      const lids = smoothstep(-0.0085, -0.001, eyeAt.d).mul(front), face = smoothstep(1.52, 1.57, P.y);
      // (the face's fine folds, ./table.js FOLDS: each a furrow along a short run, seen from the front: how deep the
      // point lies in one, and which way the furrow's side slopes there, for the light)
      const foldsOn = smoothstep(0.03, 0.05, Q.z).mul(face), fold = FOLDS.reduce((acc, [ax, ay, bx, by, wd, dp]) => {
        // (a little unsteady across its run, as a fold in skin is; shallower towards its far end)
        const pa = Q.xy.sub(vec2(ax, ay)).add(vec2(0, mx_noise_float(vec3(Q.x.mul(260), Q.y.mul(260), ax * 900)).mul(wd * 0.7))), ba = vec2(bx - ax, by - ay), t = clamp(dot(pa, ba).div((bx - ax) ** 2 + (by - ay) ** 2), 0, 1), dv = pa.sub(ba.mul(t)), h = exp(dot(dv, dv).div(wd * wd).negate()).mul(dp).mul(t.mul(0.55).oneMinus());
        return { h: acc.h.add(h), g: acc.g.add(dv.mul(h).div(wd)) };
      }, { h: float(0), g: vec2(0) });
      // (no face is its own mirror: the folds a fifth deeper on one side, a fifth shallower on the other)
      const sided = P.x.sign().mul(0.2).add(1), crow = clamp(fold.h.mul(sided), 0, 1).mul(foldsOn), foldSlope = vec3(fold.g.x.mul(P.x.sign()), fold.g.y, 0).mul(foldsOn).mul(sided).mul(FOLD);
      // (and its colour is uneven a thumb's breadth at a time: redder here, paler there)
      const blotch = mx_noise_float(P.mul(48).add(vec3(3.1, 0, 7.7))).mul(0.6).add(mx_noise_float(P.mul(150)).mul(0.4)).mul(face);
      // (its pores: small dark dots, more of them where the skin is oily, the nose, the brow, the cheeks beside it)
      const pore = smoothstep(0.42, 0.8, mx_noise_float(P.mul(2600))).mul(face).mul(clamp(tone.z, 0, 1).mul(0.6).add(0.4));
      const lipLines = mx_noise_float(vec3(Q.x.mul(1100), Q.y.mul(140), 2.3)).mul(lip);

      // its fine relief: the tile read from the three sides of where the point stood at rest (so it goes with the
      // skin), turned with the skin to where it stands now
      const q = P.div(span), b0 = pow(abs(sn), vec3(4)), bw = b0.div(b0.x.add(b0.y).add(b0.z));
      const tx = texture(micro, q.zy), ty = texture(micro, q.xz), tz = texture(micro, q.xy);
      const sx = tx.xy.mul(2).sub(1), sy = ty.xy.mul(2).sub(1), sz = tz.xy.mul(2).sub(1);
      const d0 = vec3(0, sx.y, sx.x).mul(bw.x).add(vec3(sy.x, 0, sy.y).mul(bw.y)).add(vec3(sz.x, sz.y, 0).mul(bw.z)), dT = d0.sub(sn.mul(dot(d0, sn)));
      const high = tx.z.mul(bw.x).add(ty.z.mul(bw.y)).add(tz.z.mul(bw.z));   // (1 on a field's top, 0 in a furrow's bed)
      const ax = cross(sn, n), ca = dot(sn, n), dW = dT.mul(ca).add(cross(ax, dT)).add(ax.mul(dot(ax, dT).div(max(ca.add(1), 1e-3))));
      // (the folds' slopes, turned with the skin as the relief's are)
      const fT = foldSlope.sub(sn.mul(dot(foldSlope, sn))), fW = fT.mul(ca).add(cross(ax, fT)).add(ax.mul(dot(ax, fT).div(max(ca.add(1), 1e-3))));
      const nm = normalize(n.add(dW.mul(nail.oneMinus().mul(RELIEF)).mul(face.mul(0.5).oneMinus())).add(fW));

      // its colour: the skin's own, browner where its pigment is denser, redder where its blood lies nearer, paler
      // where neither; a vein here and there; a few freckles; redder in its furrows; the lips, the areolae and the nails
      const blood = tone.x, pigment = tone.y, oil = clamp(tone.z, 0, 1);
      const vein = smoothstep(0.93, 0.985, float(1).sub(abs(mx_noise_float(P.mul(vec3(70, 14, 70)))))).mul(clamp(tone.w, 0, 1)).mul(0.5);
      const freckle = smoothstep(0.55, 0.72, mx_noise_float(P.mul(230))).mul(clamp(pigment.mul(2).add(0.35), 0, 1)).mul(0.35);
      let col = vec3(...SKIN.base).mul(pow(vec3(...SKIN.pigment), vec3(pigment)));
      col = col.mul(mix(vec3(1), vec3(...SKIN.blood), clamp(blood, 0, 1))).mul(mix(vec3(1), vec3(...SKIN.pale), clamp(blood.negate(), 0, 1)));
      col = col.mul(mix(vec3(1), vec3(...SKIN.vein), vein)).mul(mix(vec3(1), vec3(0.72, 0.6, 0.52), freckle)).mul(mix(vec3(0.9, 0.8, 0.78), vec3(1), max(high, face.mul(0.6))));
      col = mix(mix(mix(col, vec3(...SKIN.lip), lip.mul(0.8)), col.mul(vec3(...SKIN.areola)), areola), vec3(...SKIN.nail), nail.mul(0.7));
      // the lips' inner edge, darker; the lid's edge redder; hair shaved to the skin, a cool shadow in it, its
      // dots seen close; a brow's hairs
      col = col.mul(mix(vec3(1), vec3(0.72, 0.5, 0.5), lipLine)).mul(mix(vec3(1), vec3(1.0, 0.74, 0.72), lidEdge.mul(0.7))).mul(crease.mul(0.42).oneMinus()).mul(mix(vec3(1), vec3(0.86, 0.75, 0.73), lids.mul(0.85))).mul(lipLines.mul(0.16).oneMinus()).mul(mix(vec3(1), vec3(0.8, 0.68, 0.64), crow.mul(0.4))).mul(vec3(1).add(vec3(0.07, -0.035, -0.045).mul(blotch))).mul(mix(vec3(1), vec3(0.8, 0.66, 0.62), pore.mul(0.5))).mul(mix(vec3(1), vec3(0.17, 0.1, 0.09), nostril));
      col = mix(col, col.mul(vec3(0.5, 0.53, 0.58)), stubble.mul(mx_noise_float(P.mul(2400)).mul(0.3).add(0.7)));
      col = mix(col, vec3(...SKIN.brow), brow.mul(0.8));

      // the sun as far as it reaches the point: past the clouds and what casts a shadow in the world, and as far as it
      // lies within the cone the point's light comes from (the body's own shade on itself), red a little further in
      // than green and blue (light that went in beside the shade's edge comes out inside it)
      const sun = U.uSun.mul(sunDim().mul(cloudShade(w)).mul(shadowAtPulled(w)));
      const inCone = dot(nb, L).sub(cone), own = clamp(vec3(inCone).div(vec3(0.5, 0.45, 0.43)).add(0.5), 0, 1);

      // the light under the skin: from the table, by how the smooth surface faces the sun and how sharply it curves;
      // what the fine relief adds or takes is the surface's own, so blue's and green's more than red's
      const ndl = dot(n, L), ndm = dot(nm, L), curved = sqrt(clamp(abs(feel.x).div(1000 * CURVE_MOST), 0, 1));
      const under = texture(scatter, vec2(ndl.mul(0.5).add(0.5), curved)).rgb;
      const diff = max(under.add(vec3(0.3, 0.75, 0.95).mul(max(ndm, 0).sub(max(ndl, 0)))), 0);
      // the sky's light, as much as the point stands open to it: in a fold the light has bounced from skin to skin
      // and is the skin's colour the more (Jimenez et al. 2016, "Practical real-time strategies for accurate
      // indirect occlusion": the fit for light bounced between surfaces of one colour)
      const bounced = max(vec3(open), col.mul(2.0404).sub(0.3324).mul(open).add(col.mul(-4.7951).add(0.6417)).mul(open).add(col.mul(2.7552).add(0.6903)).mul(open));
      const sky = skyLight(normalize(mix(nm, nb, 0.6))).mul(bounced);

      // its gloss: two lobes of one surface (GGX), the broad one most of it; the surface mirrors more the more it is
      // looked along (Schlick); less of it out of a hollow (Lagarde & de Rousiers 2014)
      const H = normalize(V.add(L)), noh = max(dot(nm, H), 0), nov = max(dot(nm, V), 1e-3), nol = max(ndm, 0), voh = max(dot(V, H), 0);
      const rough = clamp(mix(float(ROUGH.skin), float(ROUGH.oily), oil).add(high.oneMinus().mul(0.12)).sub(nail.mul(ROUGH.skin - ROUGH.nail)).sub(lip.mul(ROUGH.skin - ROUGH.lip)), 0.16, 0.95);
      const lobe = (r) => { const a2 = r.mul(r).mul(r).mul(r), d = noh.mul(noh).mul(a2.sub(1)).add(1); return a2.div(d.mul(d).mul(Math.PI)); };
      const r0 = rough.mul(LOBES.sharp), r1 = min(rough.mul(LOBES.broad), 1), a = r0.add(r1).mul(0.5).pow(2);
      const seen = float(0.5).div(max(nol.mul(nov.mul(a.oneMinus()).add(a)).add(nov.mul(nol.mul(a.oneMinus()).add(a))), 1e-4));
      const mirror = float(F0).add(float(1 - F0).mul(pow(float(1).sub(voh), 5)));
      const hollow = clamp(pow(nov.add(open), exp2(rough.mul(-16).sub(1))).sub(1).add(open), 0, 1);
      const gloss = mix(lobe(r0), lobe(r1), LOBES.mix).mul(seen).mul(mirror).mul(nol).mul(hollow);
      // (and the sky in it: what a rough surface of this kind mirrors of the light round it: Karis 2014, the fit for phones)
      const k = rough.mul(vec4(-1, -0.0275, -0.572, 0.022)).add(vec4(1, 0.0425, 1.04, -0.04)), a004 = min(k.x.mul(k.x), exp2(nov.mul(-9.28))).mul(k.x).add(k.y);
      const skyGloss = skyLight(reflect(V.negate(), nm)).mul(float(F0).mul(a004.mul(-1.04).add(k.z)).add(a004.mul(1.04).add(k.w))).mul(hollow);
      // the down on it: a soft edge of light where the skin is looked along (Koenderink & Pont 2003, "The secret of velvety skin")
      const down = pow(float(1).sub(nov), 4).mul(0.03).mul(nail.oneMinus());

      // through a thin part: the sun on its far side, as much of it as comes through that thickness of skin, red
      const t = feel.y.mul(1000 * THROUGH), tt = t.mul(t).negate();
      const through = vec3(0.233, 0.455, 0.649).mul(exp(tt.div(0.0064))).add(vec3(0.1, 0.336, 0.344).mul(exp(tt.div(0.0484)))).add(vec3(0.118, 0.198, 0).mul(exp(tt.div(0.187)))).add(vec3(0.113, 0.007, 0.007).mul(exp(tt.div(0.567)))).add(vec3(0.358, 0.004, 0).mul(exp(tt.div(1.99)))).add(vec3(0.078, 0, 0).mul(exp(tt.div(7.41))));
      const back = through.mul(max(float(0.3).sub(ndl), 0));

      const lit = col.mul(sky.add(sun.mul(diff.mul(own).add(back)))).add(sun.mul(gloss.mul(own.z).add(down.mul(clamp(ndl.mul(0.5).add(0.5), 0, 1)).mul(own.x)))).add(skyGloss).add(skyLight(n).mul(down).mul(open));
      out.assign(finish(lit, w, eye));
    });
    return out;
  })();
  return m;
}
