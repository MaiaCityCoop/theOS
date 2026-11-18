// The light every material shares (the shading contract, intent 0002), in TSL: sun, sky light, the air, the weather,
// the shadow map, the hand-over between levels of detail, and the way to the screen. All its numbers are the shared
// uniforms (src/core/uniforms.js), which the sky writes by the hour.
//
// The weather comes to it from its conditions (src/world/weather/*.js), none of them known here by name: what they add
// to the shared lanes (wet, fog, dim), and what each does to a surface (`surface`: the snow lying on it). What is one
// condition's own (the snow's depth, the wind's push, the clouds' shade) is that condition's code, handed on from here,
// so a material asks the contract and no file but the condition's holds it.
import { Fn, float, vec2, vec3, vec4, ivec2, If, mix, exp, pow, smoothstep, fract, floor, dot, max, min, abs, clamp, length, normalize, screenCoordinate } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { passOf } from '../core/pass.js';
import { lane } from './weather/lanes.js';
import { surfaceHooks, airHooks } from './weather/index.js';
import { cloudShade } from './weather/clouds.js';

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
    own light. A material that lights itself per vertex (a tree: src/scatter/trees.js) carries them to its pixels;
    airAt mixes them. */
export const airOf = (w, eye = U.uCam) => {
  const d = w.sub(eye), dist = length(d), towards = max(normalize(d).dot(U.uSunDir), 0);
  const glow = U.uSun.mul(pow(towards, 6).mul(0.22).add(pow(towards, 40).mul(0.25))).mul(U.uSunDir.y.max(0).mul(-1).add(1).mul(0.6).add(0.4));
  // (and by where the land is no longer drawn it is all air: from high up the land's end is not an edge against the sky)
  let k = exp(dist.negate().mul(U.uHaze).mul(airMean(U.uAirH)).mul(lane.fog.mul(40).add(1))).mul(float(1).sub(smoothstep(U.uLandEnd.mul(0.55), U.uLandEnd.mul(0.94), dist)));
  let col = U.uHazeCol.add(glow);
  // what of the weather lies in the air between (the clouds, from above them): it hides a share of the surface, lit its own way
  for (const c of airHooks()) {
    const V = c.air({ eye, w, dist }), k2 = k.mul(float(1).sub(V.a));
    col = V.col.mul(V.a).mul(k).add(col.mul(float(1).sub(k))).div(max(float(1).sub(k2), 1e-4)); k = k2;
  }
  return { k, col };
};
const airAt = Fn(([c, w, eye]) => { const A = airOf(w, eye); return mix(A.col, c, A.k); });
/** The end of every material: its colour seen through the air from the eye, to the screen. */
export const finish = (c, w, eye = U.uCam) => toScreen(airAt(c, w, eye));
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

// shadows: what the casters hide of the light, from one map round the camera (src/world/shadow.js); 1 lit, 0 in shadow.
// uShadowM takes a world point straight to the map's (u, v, depth), whichever way up the backend keeps it. Twelve taps on
// a spiral, turned by `turn` (a screen noise from pixel to pixel in a fragment; in a vertex, where there is no pixel, by
// the point itself): a soft edge with no grid in it. A surface is lit where nothing nearer the light than `bias` (of the
// map's depth: BIAS, a quarter of a metre and more) was drawn there.
const BIAS = 0.0004;
const shadowOf = (w, turn, bias = BIAS) => {
  const r = float(1).toVar();
  If(U.uShadowOn.greaterThan(0.5), () => {
    const s = U.uShadowM.mul(vec4(w, 1)), q = s.xyz.div(s.w);
    If(q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(1)).and(q.y.lessThan(1)).and(q.z.lessThan(1)), () => {
      // four samples, each compared and filtered by the GPU over 2 x 2 texels (a comparison sampler): softer than nine
      // single taps, at under half their cost
      const k = float(0).toVar(), z = q.z.sub(bias);
      for (const [i, j] of [[-0.62, -0.24], [0.24, -0.62], [0.62, 0.24], [-0.24, 0.62]]) k.addAssign(U.tShadow.sample(q.xy.add(vec2(i, j).mul(U.uShadowTexel.mul(1.7)))).level(0).compare(z));
      const e = smoothstep(0, 0.08, q.xy).mul(smoothstep(1, 0.92, q.xy));   // fading out at the map's edge
      r.assign(mix(1, k.div(4), e.x.mul(e.y)));
    });
  });
  return r;
};
export const shadowAt = Fn(([w]) => shadowOf(w, ign(screenCoordinate.xy)));
/** What stands on the ground and casts (a person: characters/kit/human.js) is drawn into the map pulled towards the light
    by the map's own bias, so its shadow starts where it touches the ground: unpulled, the bias would leave the ground
    lit for a hand's breadth round its feet (every surface takes BIAS before it calls itself shaded). This is how far,
    in metres along the light: the bias over the map's depth for a metre towards the light (from its matrix; at most a
    metre, for the frame before the map's first). */
export const casterPull = () => min(float(BIAS).div(max(abs(U.uShadowM.mul(vec4(U.uSunDir, 0)).z), 1e-6)), 1);
/** shadowAt for what casts pulled (casterPull): it allows for its own pull as well as the bias, or it would shade itself
    all over */
export const shadowAtPulled = Fn(([w]) => shadowOf(w, ign(screenCoordinate.xy), 2 * BIAS));
/** the same with one sample (the GPU still filters it over 2 x 2 texels): for what is too thin for a soft edge to show (a
    blade of grass), a quarter of the reads */
export const shadowAtOne = Fn(([w]) => {
  const r = float(1).toVar();
  If(U.uShadowOn.greaterThan(0.5), () => {
    const s = U.uShadowM.mul(vec4(w, 1)), q = s.xyz.div(s.w);
    If(q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(1)).and(q.y.lessThan(1)).and(q.z.lessThan(1)), () => {
      const e = smoothstep(0, 0.08, q.xy).mul(smoothstep(1, 0.92, q.xy));
      r.assign(mix(1, U.tShadow.sample(q.xy).level(0).compare(q.z.sub(0.0004)), e.x.mul(e.y)));
    });
  });
  return r;
});
/** the same in a vertex stage (a tree's corners: src/scatter/trees.js): no comparison is to be had there, so the map's own
    texels are read and compared here. Not one texel compared hard (lit, or not): a crown stands in its own shade, most of
    its corners lie at that edge, and whatever moved by a hair (the sun going on, the map's box as the camera rises, a
    crown in the wind) threw whole cards from light into shade and back, a flicker all through the crown. So nine texels
    round the corner (every other one of a 5 x 5: about as wide as a sprig's card), each weighed by how near the corner lies
    to it (a smooth bell: the weights slide as the corner moves, none jumps), and each compared over a depth (VSOFT), not
    at one: a corner's light changes as little as what moved. */
const VSTEP = 2, VBIAS = 0.0004, VSOFT = 0.0008;   // every VSTEP-th texel; lit when nothing lies nearer the light than VBIAS (of the map's depth), in shade from VBIAS + VSOFT
export const shadowAtVertex = Fn(([w]) => {
  const r = float(1).toVar();
  if (texelReads) If(U.uShadowOn.greaterThan(0.5), () => {
    const s = U.uShadowM.mul(vec4(w, 1)), q = s.xyz.div(s.w);
    If(q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(1)).and(q.y.lessThan(1)).and(q.z.lessThan(1)), () => {
      const e = smoothstep(0, 0.08, q.xy).mul(smoothstep(1, 0.92, q.xy));
      // i: the nearest of the texels read; f: how far the corner lies from it, -0.5 .. 0.5 of their spacing
      const size = float(1).div(U.uShadowTexel), t = q.xy.mul(size).sub(0.5).div(VSTEP), i = floor(t.add(0.5)), f = t.sub(i);
      const bell = (v) => [v.sub(0.5).mul(v.sub(0.5)).mul(0.5), float(0.75).sub(v.mul(v)), v.add(0.5).mul(v.add(0.5)).mul(0.5)];   // (the three weights along one axis: they add up to 1)
      const wx = bell(f.x), wy = bell(f.y), z = q.z.sub(VBIAS), k = float(0).toVar();
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const depth = float(U.tShadow.load(ivec2(clamp(i.add(vec2(a - 1, b - 1)).mul(VSTEP), 0, size.sub(1)))));
        k.addAssign(smoothstep(z.sub(VSOFT), z, depth).mul(wx[a]).mul(wy[b]));   // lit where nothing nearer the light was drawn there
      }
      r.assign(mix(1, k, e.x.mul(e.y)));
    });
  });
  return r;
});
/** true while the casters are drawn into the shadow map: a caster's fragment does no light then (only its depth counts) */
export const unlit = () => U.uShadowPass.greaterThan(0.5);
/** the share of the sun's light the weather's sky lets through (its dim lane: a storm's) */
export const sunDim = () => float(1).sub(lane.dim.mul(0.6));

// ---- the one light (intent 0038, stage 9): every material is lit here, and nowhere else ----
const SHADOWS = { soft: (w) => shadowAt(w), one: (w) => shadowAtOne(w), vertex: (w) => shadowAtVertex(w), pulled: (w) => shadowAtPulled(w) };
/** The share of the sun's light that reaches w (1: all): past the storm, the clouds and what casts a shadow. how: 'soft'
    (a pixel's: the cascades with their penumbra), 'one' (one tap: what is too thin for a soft edge to show, a blade),
    'vertex' (a vertex stage's: a tree's corners), 'pulled' (what is drawn into the map pulled towards the light). */
export const sunAt = (w, how = 'soft') => sunDim().mul(cloudShade(w)).mul(SHADOWS[how](w));
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
  const n = s.n, L = U.uSunDir, V = s.V ?? (s.w ? normalize((s.eye ?? U.uCam).sub(s.w)) : null), share = s.sun ?? sunAt(s.w, s.how);
  const wrap = s.wrap ?? 0, ndl = s.ndl ?? (wrap ? n.dot(L).add(wrap).div(float(wrap).add(1)) : n.dot(L)).max(0);
  const back = V ? max(V.negate().dot(L), 0) : null, light = U.uSun.mul(share);   // (how far the eye looks into the sun; the sun's light here)
  let sky = skyLight(n), sun = ndl;
  if (s.through) { const t = pow(back, s.lobe ?? 3).mul(s.through); sun = sun.add(s.tint ? s.tint.mul(t) : t); }
  sun = light.mul(sun);
  if (s.sky) sky = sky.mul(s.sky);
  if (s.ao) { const ao = float(s.ao); sky = sky.mul(ao.mul(ao).mul(0.75).add(ao.mul(0.25))); sun = sun.mul(ao.mul(0.6).add(0.4)); }
  const spec = s.gloss ? light.mul(pow(max(n.dot(normalize(V.add(L))), 0), s.sharp ?? 40)).mul(s.gloss) : vec3(0);
  return { sky, sun, spec, light, V, back, ndl };
};
/** A surface lit and seen through the air, for the screen: { colour (its own, linear), extra (light of another kind on
    it: a fire's), glow (its own light), ...lightOn's }. */
export const lit = (s) => { const L = lightOn(s); let d = L.sky.add(L.sun); if (s.extra) d = d.add(s.extra); let c = s.colour.mul(d).add(L.spec); if (s.glow) c = c.add(s.glow); return finish(c, s.w, s.eye); };

