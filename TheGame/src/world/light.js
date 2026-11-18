// The light every material shares (the shading contract, intent 0002), in TSL: sun, sky light, the air, the weather,
// the shadow map, the hand-over between levels of detail, and the way to the screen. All its numbers are the shared
// uniforms (src/core/uniforms.js), which the sky writes by the hour.
//
// The weather comes to it from its conditions (src/world/weather/*.js), none of them known here by name: what they add
// to the shared lanes (wet, fog, dim), and what each does to a surface (`surface`: the snow lying on it). What is one
// condition's own (the snow's depth, the wind's push, the clouds' shade) is that condition's code, handed on from here,
// so a material asks the contract and no file but the condition's holds it.
import { Fn, float, int, vec2, vec3, vec4, ivec2, If, mix, exp, exp2, sqrt, pow, smoothstep, fract, floor, dot, max, min, abs, clamp, length, normalize, cos, sin, screenCoordinate } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { passOf } from '../core/pass.js';
import { lane } from './weather/lanes.js';
import { surfaceHooks, airHooks } from './weather/index.js';
import { cloudShade } from './weather/clouds.js';
import { BIAS, SHADOW_S } from './shadow.js';
import { LIGHT_FULL } from '../core/flags.js';
import { blueAt } from './light/noise.js';
import { SCREEN } from './light/screen.js';
import { skyAt } from './light/canopy.js';
import { AIR, froxelAt, skyAlong } from './light/air.js';
import { D } from './sky/dome.js';

export { snowDepth, snowCover, snowDrift, snowLift, snowLiftAtVertex, SNOW } from './weather/snow.js';
export { cloudShade, cloudField, cloudLayerShade, CLOUD_H } from './weather/clouds.js';
export { windAt, windDir, windStrength } from './weather/wind.js';

let texelReads = true;
/** which backend draws (before any material is built): only WebGPU reads the shadow map's own texels in a vertex stage (shadowAtVertex); on the WebGL 2 fallback what is lit per corner takes no cast shadow */
export const useBackend = (renderer) => { texelReads = !!renderer?.backend?.isWebGPUBackend; };

/** The light's uniforms by their short names. */
export const LIGHT = {
  sunDir: U.uSunDir, sun: U.uSun, amb: U.uAmb, hazeCol: U.uHazeCol, haze: U.uHaze, airH: U.uAirH, airScale: U.uAirScale,
  exposure: U.uExposure, sky: U.uSky,
};

// air: the far land takes the sky's colour; one height fog for everything, thickest at the ground, thinning upwards
// (by e every airScale metres), so a line of sight from high up passes through less of it. The weather's fog (its lane) thickens it.
const airMean = Fn(([h]) => { const k = h.div(max(U.uAirScale, 1)); return k.lessThan(1e-3).select(float(1).sub(k.mul(0.5)), float(1).sub(exp(k.negate())).div(k)); });
export const haze = Fn(([c, dist]) => mix(U.uHazeCol, c, exp(dist.negate().mul(U.uHaze).mul(airMean(U.uAirH)).mul(lane.fog.mul(40).add(1)))));
// the air lit by the sun: looking towards it, the haze glows warm (light scattered forward by the air), away from it
// it keeps the horizon's colour; the more air in the line of sight, the more of it
/** The air between the eye and w, as its two parts: k, how much of a surface's colour comes through, and col, the air's
    own light: a height fog lit by the sun, worked out here. With ?light=full (stage 9b's preview), in the world's frame
    (its colour pass, in either stage) from the froxels instead (src/world/light/air.js: Hillaire's atmosphere and the
    height fog with its shafts through the crowns), and where the land ends the sky's own light along that way. A
    material that lights itself per vertex (a tree: src/scatter/trees.js) carries them to its pixels; airAt mixes them. */
const airHere = Fn(([w, eye], builder) => {
  const d = w.sub(eye), dist = length(d), towards = max(normalize(d).dot(U.uSunDir), 0);
  const glow = U.uSun.mul(pow(towards, 6).mul(0.22).add(pow(towards, 40).mul(0.25))).mul(U.uSunDir.y.max(0).mul(-1).add(1).mul(0.6).add(0.4));
  // (and by where the land is no longer drawn it is all air: from high up the land's end is not an edge against the sky)
  const end = smoothstep(U.uLandEnd.mul(0.55), U.uLandEnd.mul(0.94), dist), k0 = exp(dist.negate().mul(U.uHaze).mul(airMean(U.uAirH)).mul(lane.fog.mul(40).add(1))).mul(float(1).sub(end));
  const own = vec4(U.uHazeCol.add(glow), k0);
  if (!LIGHT_FULL || passOf(builder) !== 'main') return own;   // (Hillaire's air in froxels: ?light=full, stage 9b)
  const F = froxelAt(w), T = F.T.mul(float(1).sub(end)), L = F.L.mul(float(1).sub(end)).add(skyAlong(normalize(d)).add(U.uHazeCol.mul(D.dark)).mul(end));
  return mix(own, vec4(L.div(max(float(1).sub(T), 1e-4)), T), AIR.on);
});
export const airOf = (w, eye = U.uCam) => {
  const A = airHere(w, eye), dist = length(w.sub(eye));
  let k = A.w, col = A.xyz;
  // what of the weather lies in the air between (the clouds, from above them): it hides a share of the surface, lit its own way
  for (const c of airHooks()) {
    const V = c.air({ eye, w, dist }), k2 = k.mul(float(1).sub(V.a));
    col = V.col.mul(V.a).mul(k).add(col.mul(float(1).sub(k))).div(max(float(1).sub(k2), 1e-4)); k = k2;
  }
  return { k, col };
};
const airAt = Fn(([c, w, eye]) => { const A = airOf(w, eye); return mix(A.col, c, A.k); });
/** The end of every material: its colour seen through the air from the eye, to the screen. */
export const finish = (c, w, eye = U.uCam) => toScreen(airAt(max(c, vec3(0)), w, eye));   // (no light is less than none)
/** The sky's light on a surface facing n: most from above, less on what faces sideways, and a little bounced up off the
    sunlit ground onto what faces down. */
export const skyLight = (n) => U.uAmb.mul(n.y.mul(0.32).add(0.68)).add(U.uSun.mul(U.uSunDir.y.max(0)).mul(vec3(0.09, 0.1, 0.06)).mul(float(0.5).sub(n.y.mul(0.5))));
/** The screen's curve: the light's numbers to the picture's (its exposure, a soft shoulder, gamma). */
export const display = (c) => pow(float(1).sub(exp(c.negate().mul(1.25).mul(U.uExposure))), vec3(1 / 2.2));
/** What every material returns, its colour for the screen. Drawn for the world's frame (either pass: src/core/pass.js)
    that is the light's own numbers: the upscale puts the screen's curve on them once, as it lays the picture on the
    screen (src/core/temporal.js). Drawn anywhere else (a library's picture), the curve is put on here. */
export const toScreen = Fn(([c], builder) => vec4(passOf(builder) ? c : display(c), 1));
/** A colour meant for the screen as it is (an overlay's), as the light's numbers the screen's curve takes back to it. */
export const fromScreen = Fn(([c], builder) => (passOf(builder) ? float(1).sub(pow(clamp(c, 0, 0.999), vec3(2.2))).log().negate().div(U.uExposure.mul(1.25)) : c));
/** What the weather does to a surface facing n: how much of its own colour stays (keep) and what is laid on it (add).
    The wet lane darkens it; then each condition's `surface` in turn (the snow lying on it). lift: how far the surface
    stands out of what lies on the ground here (a pebble's top, a blade's tip). For a material that lights itself per
    vertex (a tree); weathered() is this applied to a colour. */
export const weatherOn = (n, lift = 0) => {
  let keep = float(1).sub(lane.wet.mul(0.35)), add = null;
  for (const c of surfaceHooks()) { const s = c.surface(n, float(lift)); add = add ? add.mul(s.keep).add(s.add) : s.add; keep = keep.mul(s.keep); }
  return { keep, add: add ?? vec3(0) };
};
let weatheredF = null;   // (made when first asked for: by then every condition is there)
/** A surface under the weather: darker when wet, and what its conditions lay on it (lift: as weatherOn). */
export const weathered = (col, n, lift = 0) => (weatheredF ||= Fn(([c, nn, l]) => { const W = weatherOn(nn, l); return c.mul(W.keep).add(W.add); }))(col, n, float(lift));

// a screen noise (interleaved gradient): for the shadow's taps and the hand-over between levels
export const ign = (p) => fract(fract(dot(p, vec2(0.06711056, 0.00583715))).mul(52.9829189));

// shadows: what the casters hide of the light, from the two cascades round the camera (src/world/shadow.js: the two
// layers of one depth array, the near one first); 1 lit, 0 in shadow. uShadowM and uShadowM2 take a world point
// straight to each cascade's (u, v, depth), whichever way up the backend keeps it. A point is read in the near one where
// it lies inside it, the hand-over to the far one dithered over the near one's last tenth (the picture built over time
// averages it), and the far one fades out at its own edge.
//
// The near one is soft as the sun makes it (PCSS, Fernando 2005): six reads round the point find how far the casters
// above it stand (the blockers' mean depth), and its penumbra is that distance times the width of the sun's disc
// (0.53°): a leaf a hand above the path throws a sharp shadow, a crown 15 m up a soft one, so a canopy's light falls as
// the round flecks a real one does. Then eight taps over that penumbra, each compared and filtered over 2 x 2 texels by
// the GPU (a comparison sampler), on a disc turned by the blue noise from pixel to pixel and frame to frame (one turn a
// pixel: its cosine and sine once, not a tap's each). The far one takes four taps, about a texel and a half out.
const SUN_DISC = 0.0093;   // the sun's width across the sky (radians): metres of penumbra for every metre from blocker to receiver
const PEN = 0.45;          // the widest penumbra, metres (the blockers are looked for this far round)
// a Vogel disc of n taps (radius 1), its first turned by a0: as numbers, turned for a pixel by its (cos, sin)
const disc = (n, a0 = 0) => Array.from({ length: n }, (_, i) => { const r = Math.sqrt((i + 0.5) / n), a = a0 + i * 2.399963; return [Math.cos(a) * r, Math.sin(a) * r]; });
const BLOCKERS = disc(6), TAPS = disc(8, 1.3);
const turned = ([x, y], cs) => vec2(cs.x.mul(x).sub(cs.y.mul(y)), cs.y.mul(x).add(cs.x.mul(y)));
/** a point in cascade k: { q (u, v, depth), e (how far inside: 0 at its edge, 1 a tenth in) } */
const cascade = (w, k) => {
  const s = (k ? U.uShadowM2 : U.uShadowM).mul(vec4(w, 1)), q = s.xyz.div(s.w), m = min(min(q.x, q.y), min(float(1).sub(q.x), float(1).sub(q.y)));
  return { q, e: smoothstep(0, 0.1, m).mul(q.z.lessThan(1).select(float(1), float(0))) };
};
const depthAt = (uv, k) => float(U.tShadow.load(ivec2(clamp(uv.mul(SHADOW_S), vec2(0), vec2(SHADOW_S - 1)))).depth(int(k)));
const compareAt = (uv, k, z) => U.tShadow.sample(uv).depth(int(k)).level(0).compare(z);
// the near cascade, soft as the sun's disc makes it (the taps over a penumbra `pen` metres wide); the far one, four taps
const taps = (q, z, cs, pen) => { const perM = float(1).div(U.uShadowSize.x), k = float(0).toVar(); for (const d of TAPS) k.addAssign(compareAt(q.xy.add(turned(d, cs).mul(pen.mul(0.5).mul(perM))), 0, z)); return k.div(TAPS.length); };
const nearSoft = (q, z, cs) => {
  if (!texelReads) return taps(q, z, cs, U.uShadowSize.x.mul(3 / SHADOW_S));   // (WebGL 2 reads no texel of a texture it compares: no blockers, a penumbra of three texels)
  const perM = float(1).div(U.uShadowSize.x), found = float(0).toVar(), sum = float(0).toVar();
  for (const d of BLOCKERS) { const b = depthAt(q.xy.add(turned(d, cs).mul(PEN * 0.5).mul(perM)), 0); If(b.lessThan(z), () => { sum.addAssign(b); found.addAssign(1); }); }
  const r = float(1).toVar();
  If(found.greaterThan(0), () => { r.assign(taps(q, z, cs, clamp(z.sub(sum.div(found)).mul(U.uShadowRange.x).mul(SUN_DISC), U.uShadowSize.x.mul(1.5 / SHADOW_S), PEN))); });
  return r;
};
const farSoft = (q, z) => { const k = float(0).toVar(); for (const [i, j] of [[-0.62, -0.24], [0.24, -0.62], [0.62, 0.24], [-0.24, 0.62]]) k.addAssign(compareAt(q.xy.add(vec2(i, j).mul(1.7 / SHADOW_S)), 1, z)); return k.div(4); };
/** The shadow at w, a pixel's (n: its normal, for the offset that keeps a surface from shading itself). how: 'soft',
    'one' (one tap), 'pulled' (what is drawn into the map pulled towards the light allows for its own pull too). */
const shadowOf = (w, n, how) => {
  const r = float(1).toVar(), bias = how === 'pulled' ? 2 : 1;
  If(U.uShadowOn.greaterThan(0.5), () => {
    const N = n ?? vec3(0), noise = blueAt(screenCoordinate.xy), turn = noise.x.mul(Math.PI * 2), cs = vec2(cos(turn), sin(turn));
    const A = cascade(w.add(N.mul(U.uShadowSize.x.mul(1.2 / SHADOW_S))), 0);
    If(A.e.greaterThan(noise.y), () => {
      const z = A.q.z.sub(U.uShadowRange.z.mul(bias));
      r.assign(how === 'one' ? compareAt(A.q.xy, 0, z) : nearSoft(A.q, z, cs));
    }).Else(() => {
      const B = cascade(w.add(N.mul(U.uShadowSize.y.mul(1.2 / SHADOW_S))), 1), z = B.q.z.sub(U.uShadowRange.w.mul(bias));
      If(B.e.greaterThan(0), () => { r.assign(mix(1, how === 'one' ? compareAt(B.q.xy, 1, z) : farSoft(B.q, z), B.e)); });
    });
  });
  return r;
};
export const shadowAt = (w, n = null) => shadowOf(w, n, 'soft');
/** the same with one sample (the GPU still filters it over 2 x 2 texels): for what is too thin for a soft edge to show (a
    blade of grass), a fraction of the reads */
export const shadowAtOne = (w, n = null) => shadowOf(w, n, 'one');
/** What stands on the ground and casts (a person: characters/kit/human.js) is drawn into the atlas pulled towards the
    light by the near cascade's bias, so its shadow starts where it touches the ground: unpulled, the bias would leave
    the ground lit for a hand's breadth round its feet. This is how far, in metres along the light. */
export const casterPull = () => float(BIAS[0]);
/** shadowAt for what casts pulled (casterPull): it allows for its own pull as well as the bias, or it would shade itself
    all over */
export const shadowAtPulled = Fn(([w]) => shadowOf(w, null, 'pulled'));
// the same in a vertex stage (a tree's corners: src/scatter/trees.js): no comparison is to be had there, so the atlas's
// own texels are read and compared here. Not one texel compared hard (lit, or not): a crown stands in its own shade, most
// of its corners lie at that edge, and whatever moved by a hair (the sun going on, the map's box as the camera rises, a
// crown in the wind) threw whole cards from light into shade and back, a flicker all through the crown. So nine texels
// round the corner (every other one of a 5 x 5), each weighed by how near the corner lies to it (a smooth bell: the
// weights slide as the corner moves, none jumps), and each compared over a depth (VSOFT), not at one: a corner's light
// changes as little as what moved. In the near cascade where it lies inside it, the far one beyond, blended between.
const VSTEP = 2, VSOFT = 0.0008;   // every VSTEP-th texel; in shade from VSOFT (of the map's depth) past the bias
const vertexIn = (A, k) => {
  // i: the nearest of the texels read; f: how far the corner lies from it, -0.5 .. 0.5 of their spacing
  const t = A.q.xy.mul(SHADOW_S).sub(0.5).div(VSTEP), i = floor(t.add(0.5)), f = t.sub(i);
  const bell = (v) => [v.sub(0.5).mul(v.sub(0.5)).mul(0.5), float(0.75).sub(v.mul(v)), v.add(0.5).mul(v.add(0.5)).mul(0.5)];   // (the three weights along one axis: they add up to 1)
  const wx = bell(f.x), wy = bell(f.y), z = A.q.z.sub(k ? U.uShadowRange.w : U.uShadowRange.z), s = float(0).toVar();
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    const p = clamp(i.add(vec2(a - 1, b - 1)).mul(VSTEP), 0, SHADOW_S - 1);
    s.addAssign(smoothstep(z.sub(VSOFT), z, float(U.tShadow.load(ivec2(p)).depth(int(k)))).mul(wx[a]).mul(wy[b]));   // lit where nothing nearer the light was drawn there
  }
  return s;
};
export const shadowAtVertex = Fn(([w]) => {
  const r = float(1).toVar();
  if (texelReads) If(U.uShadowOn.greaterThan(0.5), () => {
    const A = cascade(w, 0), B = cascade(w, 1), near = float(1).toVar(), far = float(1).toVar();
    If(A.e.greaterThan(0), () => { near.assign(vertexIn(A, 0)); });
    If(A.e.lessThan(1).and(B.e.greaterThan(0)), () => { far.assign(mix(1, vertexIn(B, 1), B.e)); });
    r.assign(mix(far, near, A.e));
  });
  return r;
});
/** true while the casters are drawn into the shadow map: a caster's fragment does no light then (only its depth counts) */
export const unlit = () => U.uShadowPass.greaterThan(0.5);
/** the share of the sun's light the weather's sky lets through (its dim lane: a storm's) */
export const sunDim = () => float(1).sub(lane.dim.mul(0.6));

// ---- the one light (intent 0038, stage 9): every material is lit here, and nowhere else ----
const SHADOWS = { soft: (w, n) => shadowAt(w, n), one: (w, n) => shadowAtOne(w, n), vertex: (w) => shadowAtVertex(w), pulled: (w) => shadowAtPulled(w) };
/** The share of the sun's light that reaches w (1: all): past the storm, the clouds and what casts a shadow. how: 'soft'
    (a pixel's: the cascades with their penumbra), 'one' (one tap: what is too thin for a soft edge to show, a blade),
    'vertex' (a vertex stage's: a tree's corners), 'pulled' (what is drawn into the map pulled towards the light). */
export const sunAt = (w, how = 'soft', n = null) => sunDim().mul(cloudShade(w)).mul(SHADOWS[how](w, n));
// what the screen's light left for this pixel (src/world/light/screen.js): one texel, loaded (no sampler): x the share of
// the sun the contact shadows let through, y the share of the sky GTAO lets reach it. Read in the colour pass of what
// takes part in the prepass (its depth is the one the screen's light read), in a fragment; (1, 1) anywhere else. (One
// load, not one sampled read for each: a material with many textures already went past what a pipeline may bind when
// GTAO was read apart from the contact shadows, and was then not drawn at all.)
const onScreen = (builder) => passOf(builder) === 'main' && builder.shaderStage === 'fragment' && builder.material?.userData?.pre === true;
const screenHere = Fn((builder) => (onScreen(builder) ? mix(vec2(1), SCREEN.contact.load(ivec2(screenCoordinate.xy)).xy, SCREEN.on) : vec2(1)));
const BOUNCE = vec3(0.1, 0.16, 0.05);   // what the crowns give back of the light on them (a leaf's green, its share scattered down)
const bounce = () => BOUNCE.mul(U.uSun.mul(sunDim()).mul(U.uSunDir.y.max(0)).mul(0.6).add(U.uAmb.mul(0.4)));
/** What the screen's light says of this pixel, for a material that lights itself per vertex and takes the rest per pixel
    (a tree's cards): open, the share of the sky GTAO lets reach it (with ?light=full; else all of it); contact, the share
    of the sun the contact shadows do. */
export const screenShade = () => { const S = screenHere().toVar(); return { open: LIGHT_FULL ? clamp(S.y, 0, 1) : float(1), contact: S.x }; };
/** The light a surface takes, in its parts (rgb, the light's numbers): `sky`, what its colour takes from the sky; `sun`,
    from the sun; `spec`, the highlight laid over it. lit() below puts them on a colour; a material that lights itself per
    vertex (a tree) carries them to its pixels. s, every field but n and w optional:
      n, w, eye, V  its normal (the side the eye sees), its point, the eye (U.uCam), the way to it (else from those)
      sun, how      the share of the sun that reaches it (else sunAt(w, how))
      ndl, wrap     how it faces the sun (else n·L, wrapped round its edge as far as `wrap` says: soft things, leaves)
      through, lobe, tint   how much of the sun behind it comes through it (a leaf, a blade, canvas): seen into the sun,
                    as tight as `lobe` (3), coloured by `tint` on the way
      ao            its own occlusion (its mesh's, a crown's depth): the sky's light is lost faster than the sun's
      sky           what else dims the sky's light on it (the ground's own shade)
      gloss, sharp  its highlight: how bright, how tight */
export const lightOn = (s) => {
  const n = s.n, L = U.uSunDir, V = s.V ?? (s.w ? normalize((s.eye ?? U.uCam).sub(s.w)) : null), Sc = screenShade(), share = (s.sun ?? sunAt(s.w, s.how, s.n)).mul(Sc.contact);
  const wrap = s.wrap ?? 0, ndl = s.ndl ?? (wrap ? n.dot(L).add(wrap).div(float(wrap).add(1)) : n.dot(L)).max(0);
  const back = V ? max(V.negate().dot(L), 0) : null, light = U.uSun.mul(share);   // (how far the eye looks into the sun; the sun's light here)
  // the sky's light, less what the crowns above hide of it (the canopy's probes: src/world/light/canopy.js) and, with
  // ?light=full (stage 9b), what stands round it (GTAO's share)
  const open = LIGHT_FULL ? Sc.open : float(1);
  // (and with ?light=full, where the probes see no sky, what the crowns that hide it give back: lit by the sun and the
  // sky themselves, a little of it comes down green: the probes' bounce, Ghost of Tsushima's)
  const seen = s.w ? skyAt(s.w) : float(1);
  let sky = (LIGHT_FULL ? skyLight(n).mul(seen).add(bounce().mul(float(1).sub(seen))) : skyLight(n).mul(seen)).mul(open), sun = ndl;
  // through it, two-sided: the sun behind it seen through it (a lobe round the sun, as tight as `lobe`), and its far
  // side lit (what faces away from the sun, seen from the dark side, glows through)
  if (s.through) { const t = pow(back, s.lobe ?? 3).mul(0.65).add(max(n.dot(L).negate(), 0).mul(0.35)).mul(s.through); sun = sun.add(s.tint ? s.tint.mul(t) : t); }
  sun = light.mul(sun);
  if (s.sky) sky = sky.mul(s.sky);
  if (s.ao) { const ao = float(s.ao); sky = sky.mul(ao.mul(ao).mul(0.75).add(ao.mul(0.25))); sun = sun.mul(ao.mul(0.6).add(0.4)); }
  // (its highlight, less where little of the sky is seen: specular occlusion, Lagarde's, its roughness from its sharpness)
  const spec = s.gloss ? light.mul(pow(max(n.dot(normalize(V.add(L))), 0), s.sharp ?? 40)).mul(s.gloss).mul(clamp(pow(max(n.dot(V), 0).add(open), exp2(sqrt(float(2).div(float(s.sharp ?? 40).add(2))).mul(-16).sub(1))).sub(1).add(open), 0, 1)) : vec3(0);
  return { sky, sun, spec, light, V, back, ndl };
};
/** A surface lit and seen through the air, for the screen: { colour (its own, linear), extra (light of another kind on
    it: a fire's), glow (its own light), ...lightOn's }. */
export const lit = (s) => { const L = lightOn(s); let d = L.sky.add(L.sun); if (s.extra) d = d.add(s.extra); let c = s.colour.mul(d).add(L.spec); if (s.glow) c = c.add(s.glow); return finish(c, s.w, s.eye); };

