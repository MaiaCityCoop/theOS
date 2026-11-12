// The light every material shares (the shading contract, intent 0002), in TSL: sun, sky light, the air, the weather,
// the shadow map, the hand-over between levels of detail, and the way to the screen. All its numbers are the shared
// uniforms (src/core/uniforms.js), which the sky writes by the hour.
import { Fn, float, vec2, vec3, vec4, If, mix, exp, pow, smoothstep, step, fract, dot, log, max, clamp, sin, screenCoordinate } from 'three/tsl';
import { U } from '../core/uniforms.js';

/** The light's uniforms by their short names. */
export const LIGHT = {
  sunDir: U.uSunDir, sun: U.uSun, amb: U.uAmb, hazeCol: U.uHazeCol, haze: U.uHaze, airH: U.uAirH, airScale: U.uAirScale,
  weather: U.uWeather, exposure: U.uExposure, sky: U.uSky,
};

// air: the far land takes the sky's colour; one height fog for everything, thickest at the ground, thinning upwards
// (by e every airScale metres), so a line of sight from high up passes through less of it. Fog (the weather) thickens it.
const airMean = Fn(([h]) => { const k = h.div(max(U.uAirScale, 1)); return k.lessThan(1e-3).select(float(1).sub(k.mul(0.5)), float(1).sub(exp(k.negate())).div(k)); });
export const haze = Fn(([c, dist]) => mix(U.uHazeCol, c, exp(dist.negate().mul(U.uHaze).mul(airMean(U.uAirH)).mul(U.uWeather.z.mul(40).add(1)))));
/** The picture's exposure and gamma: what every material returns. */
export const toScreen = Fn(([c]) => vec4(pow(float(1).sub(exp(c.negate().mul(1.25).mul(U.uExposure))), vec3(1 / 2.2)), 1));
/** A surface under the weather: darker when wet, white where snow settles on what faces up. */
export const weathered = Fn(([col, n]) => mix(col.mul(float(1).sub(U.uWeather.x.mul(0.35))), vec3(0.85, 0.87, 0.9), U.uWeather.y.mul(smoothstep(0.35, 0.8, n.y))));

// shadows: what the casters hide of the light, from one map round the camera (src/world/shadow.js); 1 lit, 0 in shadow.
// uShadowM takes a world point straight to the map's (u, v, depth), whichever way up the backend keeps it.
export const shadowAt = Fn(([w]) => {
  const r = float(1).toVar();
  If(U.uShadowOn.greaterThan(0.5), () => {
    const s = U.uShadowM.mul(vec4(w, 1)), q = s.xyz.div(s.w);
    If(q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(1)).and(q.y.lessThan(1)).and(q.z.lessThan(1)), () => {
      const k = float(0).toVar(), z = q.z.sub(0.0004);   // about a quarter metre of the map's depth: no speckles on lit faces
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) k.addAssign(step(z, U.tShadow.sample(q.xy.add(vec2(i, j).mul(U.uShadowTexel.mul(1.5)))).level(0).r));
      const e = smoothstep(0, 0.08, q.xy).mul(smoothstep(1, 0.92, q.xy));   // fading out at the map's edge
      r.assign(mix(1, k.div(9), e.x.mul(e.y)));
    });
  });
  return r;
});
/** The share of sunlight that reaches a point (1: all): past the clouds and the storm, and past what casts a shadow. */
export const cloudAt = Fn(([w]) => float(1).sub(U.uWeather.w.mul(0.6)).mul(shadowAt(w)));

// the wind (src/world/wind.js: uWind = the way it blows to, x and z; strength 0 calm … 1 storm; how fast its gusts
// travel, m/s): its push at a point on the land, (x, z) per unit of sway. Gusts roll over the land along the wind, a
// long swell and a shorter, quicker one across it; the harder it blows, the deeper they are and the faster they come.
const SPACING = 38;
export const windAt = Fn(([p]) => {
  const dir = U.uWind.xy, s = U.uWind.z, along = p.dot(dir), across = p.dot(vec2(dir.y.negate(), dir.x)), t = U.uTime.mul(U.uWind.w);
  const swell = sin(along.sub(t).mul(6.2831853 / SPACING)).mul(0.5).add(0.5), chop = sin(along.mul(2.3).add(across.mul(0.9)).sub(t.mul(1.9)).mul(6.2831853 / SPACING)).mul(0.5).add(0.5);
  const gust = mix(0.75, 0.25, s).add(swell.mul(mix(0.25, 0.6, s))).add(chop.mul(s).mul(0.3));
  return dir.mul(s.mul(gust));
});

// the hand-over between two levels of detail (src/detail): keep.x of the pixels, chosen by one screen noise both sides share
export const ign = (p) => fract(fract(dot(p, vec2(0.06711056, 0.00583715))).mul(52.9829189));
/** true where this level gives the pixel up to the other side of a hand-over */
export const detailCut = (keep) => { const n = ign(screenCoordinate.xy); return keep.y.greaterThan(0.5).select(float(1).sub(n), n).greaterThanEqual(keep.x); };
/** How much of a level shows at px pixels (the GPU's keepOf): (share kept, side). lo, hi, f: numbers of the asset's file. */
export const detailKeep = (px, lo, hi, f) => {
  const L = log(max(px, 1e-6)), lh = Math.log(hi), ll = Math.log(lo);
  const kHi = vec2(float(1).sub(clamp(L.sub(lh - f).div(2 * f), 0, 1)), 0), kLo = vec2(clamp(L.sub(ll - f).div(2 * f), 0, 1), 1);
  const lower = L.lessThan(ll + f).select(kLo, vec2(1, 0));
  return Number.isFinite(hi) && hi < 1e8 ? L.greaterThan(lh - f).select(kHi, lower) : lower;
};
