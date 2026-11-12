// The light every material shares (the shading contract, intent 0002), in TSL: sun, sky light, the air, the weather,
// the shadow map, the hand-over between levels of detail, and the way to the screen. All its numbers are the shared
// uniforms (src/core/uniforms.js), which the sky writes by the hour.
//
// The weather comes to it from its conditions (src/world/weather/*.js), none of them known here by name: what they add
// to the shared lanes (wet, fog, dim), and what each does to a surface (`surface`: the snow lying on it). What is one
// condition's own (the snow's depth, the wind's push, the clouds' shade) is that condition's code, handed on from here,
// so a material asks the contract and no file but the condition's holds it.
import { Fn, float, vec2, vec3, vec4, ivec2, If, mix, exp, pow, smoothstep, fract, floor, dot, log, max, clamp, length, normalize, screenCoordinate } from 'three/tsl';
import { U } from '../core/uniforms.js';
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
/** The picture's exposure and gamma: what every material returns. */
export const toScreen = Fn(([c]) => vec4(pow(float(1).sub(exp(c.negate().mul(1.25).mul(U.uExposure))), vec3(1 / 2.2)), 1));
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
// the point itself): a soft edge with no grid in it.
const shadowOf = (w, turn) => {
  const r = float(1).toVar();
  If(U.uShadowOn.greaterThan(0.5), () => {
    const s = U.uShadowM.mul(vec4(w, 1)), q = s.xyz.div(s.w);
    If(q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(1)).and(q.y.lessThan(1)).and(q.z.lessThan(1)), () => {
      // four samples, each compared and filtered by the GPU over 2 x 2 texels (a comparison sampler): softer than nine
      // single taps, at under half their cost
      const k = float(0).toVar(), z = q.z.sub(0.0004);
      for (const [i, j] of [[-0.62, -0.24], [0.24, -0.62], [0.62, 0.24], [-0.24, 0.62]]) k.addAssign(U.tShadow.sample(q.xy.add(vec2(i, j).mul(U.uShadowTexel.mul(1.7)))).level(0).compare(z));
      const e = smoothstep(0, 0.08, q.xy).mul(smoothstep(1, 0.92, q.xy));   // fading out at the map's edge
      r.assign(mix(1, k.div(4), e.x.mul(e.y)));
    });
  });
  return r;
};
export const shadowAt = Fn(([w]) => shadowOf(w, ign(screenCoordinate.xy)));
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
/** The share of sunlight that reaches a point (1: all): past the clouds and the storm, and past what casts a shadow. */
export const cloudAt = Fn(([w]) => sunDim().mul(cloudShade(w)).mul(shadowAt(w)));
/** the same, its shadow from one sample (shadowAtOne) */
export const cloudAtOne = Fn(([w]) => sunDim().mul(cloudShade(w)).mul(shadowAtOne(w)));
/** the same, its shadow looked up in a vertex stage */
export const cloudAtVertex = Fn(([w]) => sunDim().mul(cloudShade(w)).mul(shadowAtVertex(w)));

