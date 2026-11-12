// The light every material shares (the shading contract, intent 0002), in TSL: sun, sky light, the air, the weather,
// the shadow map, the hand-over between levels of detail, and the way to the screen. All its numbers are the shared
// uniforms (src/core/uniforms.js), which the sky writes by the hour.
import { Fn, float, vec2, vec3, vec4, If, mix, exp, pow, smoothstep, step, fract, dot, log, max, clamp, sin, cos, length, normalize, screenCoordinate, uint } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { vnoise } from './noise.nodes.js';
import CLOUDS from '../../world/clouds.js';
import cloudMat from '../../materials/clouds.js';

let cloudTex = null;
/** the baked materials (src/materials/bake.js), for the baked tile the clouds and the snow read (materials/clouds.js): set once at the start, before any material is built */
export const useCloudTexture = (tex) => { cloudTex = tex; };

/** The light's uniforms by their short names. */
export const LIGHT = {
  sunDir: U.uSunDir, sun: U.uSun, amb: U.uAmb, hazeCol: U.uHazeCol, haze: U.uHaze, airH: U.uAirH, airScale: U.uAirScale,
  weather: U.uWeather, exposure: U.uExposure, sky: U.uSky,
};

// air: the far land takes the sky's colour; one height fog for everything, thickest at the ground, thinning upwards
// (by e every airScale metres), so a line of sight from high up passes through less of it. Fog (the weather) thickens it.
const airMean = Fn(([h]) => { const k = h.div(max(U.uAirScale, 1)); return k.lessThan(1e-3).select(float(1).sub(k.mul(0.5)), float(1).sub(exp(k.negate())).div(k)); });
export const haze = Fn(([c, dist]) => mix(U.uHazeCol, c, exp(dist.negate().mul(U.uHaze).mul(airMean(U.uAirH)).mul(U.uWeather.z.mul(40).add(1)))));
// the air lit by the sun: looking towards it, the haze glows warm (light scattered forward by the air), away from it
// it keeps the horizon's colour; the more air in the line of sight, the more of it
const airAt = Fn(([c, w, eye]) => {
  const d = w.sub(eye), dist = length(d), towards = max(normalize(d).dot(U.uSunDir), 0);
  const glow = U.uSun.mul(pow(towards, 6).mul(0.22).add(pow(towards, 40).mul(0.25))).mul(U.uSunDir.y.max(0).mul(-1).add(1).mul(0.6).add(0.4));
  const k = exp(dist.negate().mul(U.uHaze).mul(airMean(U.uAirH)).mul(U.uWeather.z.mul(40).add(1)));
  return mix(U.uHazeCol.add(glow), c, k);
});
/** The end of every material: its colour seen through the air from the eye, to the screen. */
export const finish = (c, w, eye = U.uCam) => toScreen(airAt(c, w, eye));
/** The sky's light on a surface facing n: most from above, less on what faces sideways, and a little bounced up off the
    sunlit ground onto what faces down. */
export const skyLight = (n) => U.uAmb.mul(n.y.mul(0.32).add(0.68)).add(U.uSun.mul(U.uSunDir.y.max(0)).mul(vec3(0.09, 0.1, 0.06)).mul(float(0.5).sub(n.y.mul(0.5))));
/** The picture's exposure and gamma: what every material returns. */
export const toScreen = Fn(([c]) => vec4(pow(float(1).sub(exp(c.negate().mul(1.25).mul(U.uExposure))), vec3(1 / 2.2)), 1));
/** How much of a surface the snow covers: it settles on what faces up, as deep as uSnow; what stands `lift` metres out
    of the ground under it (a pebble's top, a blade's tip) shows through until the snow is deeper than that. */
export const snowCover = (n, lift = float(0)) => smoothstep(0.3, 0.75, n.y).mul(smoothstep(lift, lift.add(0.012), U.uSnow));
/** how the snow drifts over the land at p (0..1): deeper in some places, thinner on others; one fetch from the baked tile */
export const snowDrift = (p) => cloudTex.a(cloudMat, p.div(23)).g.sub(0.5).mul(2.2).add(0.5).clamp(0, 1);
/** snow's own colour, lit like any surface: white, a little blue in its shade */
export const SNOW = vec3(0.86, 0.89, 0.94);
const weatheredF = Fn(([col, n, lift]) => mix(col.mul(float(1).sub(U.uWeather.x.mul(0.35))), SNOW, snowCover(n, lift)));
/** A surface under the weather: darker when wet, white where snow lies on what faces up (lift: as snowCover). */
export const weathered = (col, n, lift = 0) => weatheredF(col, n, float(lift));
/** how high, at w, the snow must lie before it covers a thing whose snow is `clumps` metres uneven (its kind's or its own
    `snow`, assets/kinds.js): in clumps where it held, bare between, the same pattern at every level of detail */
const snowLiftF = (w, clumps) => cloudTex.a(cloudMat, w.xz.mul(0.37).add(w.y.mul(0.29))).g.sub(0.5).mul(2.4).add(0.5).clamp(0, 1).mul(clumps);   // one fetch from the baked billows (a tile, not noise worked out per pixel)
const snowLiftN = Fn(([w, clumps]) => { const l = float(9).toVar(); If(U.uSnow.greaterThan(0.001), () => { l.assign(snowLiftF(w, clumps)); }); return l; });   // worked out only while snow lies
export const snowLift = (w, clumps) => snowLiftN(w, float(clumps));

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
      const k = float(0).toVar(), z = q.z.sub(0.0004);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) k.addAssign(step(z, U.tShadow.sample(q.xy.add(vec2(i, j).mul(U.uShadowTexel.mul(1.5)))).level(0).r));
      const e = smoothstep(0, 0.08, q.xy).mul(smoothstep(1, 0.92, q.xy));   // fading out at the map's edge
      r.assign(mix(1, k.div(9), e.x.mul(e.y)));
    });
  });
  return r;
};
export const shadowAt = Fn(([w]) => shadowOf(w, ign(screenCoordinate.xy)));
/** the same in a vertex stage, one tap (a blade of grass is a few pixels: its shadow need not be soft, and its vertices are
    many more than its pixels) */
export const shadowAtVertex = Fn(([w]) => {
  const r = float(1).toVar();
  If(U.uShadowOn.greaterThan(0.5), () => {
    const s = U.uShadowM.mul(vec4(w, 1)), q = s.xyz.div(s.w);
    If(q.x.greaterThan(0).and(q.y.greaterThan(0)).and(q.x.lessThan(1)).and(q.y.lessThan(1)).and(q.z.lessThan(1)), () => {
      const e = smoothstep(0, 0.08, q.xy).mul(smoothstep(1, 0.92, q.xy));
      r.assign(mix(1, step(q.z.sub(0.0004), U.tShadow.sample(q.xy).level(0).r), e.x.mul(e.y)));
    });
  });
  return r;
});
/** true while the casters are drawn into the shadow map: a caster's fragment does no light then (only its depth counts) */
export const unlit = () => U.uShadowPass.greaterThan(0.5);
// the clouds (world/clouds.js): one layer at CLOUDS.height, a field of cumulus that drifts with the wind (uCloudOff),
// covering as much of the sky as uClouds says. detail: its finer octaves, for the sky up close; a shadow needs none.
export const CLOUD_H = CLOUDS.height;
// where on the baked tile a point of the layer reads, twice: the tile repeats, so a slow push that does not repeat (value
// noise) moves each part of it differently, by up to most of a tile, and the second take is turned and scaled by an
// irrational ratio; mixed, no two stretches of sky alike. And the cover itself swells and thins over tens of kilometres.
const cloudUV = (xz) => {
  // (the push and the swell read the tile itself, from a tiny mip, at scales that are not a whole number of tiles: they
  // repeat at another period than the tile, so together they never do; a fetch from a tiny mip costs next to nothing)
  const p = xz.add(U.uCloudOff).div(CLOUDS.size), slow = cloudTex.a(cloudMat, p.mul(0.29).add(0.71)).level(7);
  const off = slow.rg.sub(0.5).mul(3.2);
  const b = vec2(p.x.mul(0.786).sub(p.y.mul(0.618)), p.x.mul(0.618).add(p.y.mul(0.786))).mul(1.414).add(off.yx).add(0.37);
  return { p, a: p.add(off), b, region: cloudTex.a(cloudMat, p.mul(0.11).add(3.1)).level(8).r.sub(0.5).mul(0.25) };
};
const cover = (n, soft) => { const th = mix(0.8, 0, U.uClouds); return smoothstep(th.sub(soft[0]), th.add(soft[1]), n.sub(0.5).mul(2.9).add(0.5)); };   // (the painted field, two takes mixed, is soft: stretched to the full range)
export const cloudField = (xz, detail = false) => {
  const C = cloudUV(xz);
  let n = mix(cloudTex.a(cloudMat, C.a).r, cloudTex.a(cloudMat, C.b).r, 0.45).add(C.region);
  if (detail) n = n.add(cloudTex.a(cloudMat, C.a.mul(3.7).add(0.31)).g.sub(0.5).mul(0.12));   // close up, the billows fray the edge (a little: more breaks a cloud into flecks)
  return cover(n, [0.14, 0.26]);
};
/** the clouds' shadow at a point q of their layer (1: none): the field from a small mip of the tile, a shadow being soft and
    wide; what src/world/cloudmap.js draws into its map once a frame */
export const cloudLayerShade = (q) => {
  const C = cloudUV(q), n = mix(cloudTex.a(cloudMat, C.a).level(4).r, cloudTex.a(cloudMat, C.b).level(4).r, 0.45).add(C.region);
  return float(1).sub(cover(n, [0.14, 0.24]).mul(0.9));
};
/** the clouds' shadow at w: the layer looked up along the way to the sun, read from the map drawn this frame round the
    camera (uCloudMap: its corner, its size; one fetch); beyond it the clouds' mean */
export const cloudShade = Fn(([w]) => {
  const r = float(1).toVar();
  If(U.uClouds.greaterThan(0.005), () => {   // only while there are clouds
    const s = U.uSunDir, k = float(CLOUD_H).sub(w.y).div(max(s.y, 0.08)), m = w.xz.add(s.xz.mul(k)).sub(U.uCloudMap.xy).div(U.uCloudMap.z);
    const inside = m.x.greaterThan(0).and(m.y.greaterThan(0)).and(m.x.lessThan(1)).and(m.y.lessThan(1));
    r.assign(inside.select(U.tCloudMap.sample(m).level(0).r, float(1).sub(U.uClouds.mul(0.45))));
  });
  return r;
});
/** The share of sunlight that reaches a point (1: all): past the clouds and the storm, and past what casts a shadow. */
export const cloudAt = Fn(([w]) => float(1).sub(U.uWeather.w.mul(0.6)).mul(cloudShade(w)).mul(shadowAt(w)));
/** the same, its shadow looked up in a vertex stage */
export const cloudAtVertex = Fn(([w]) => float(1).sub(U.uWeather.w.mul(0.6)).mul(cloudShade(w)).mul(shadowAtVertex(w)));

// the wind (src/world/wind.js: uWind = the way it blows to, x and z; strength 0 calm … 1 storm; how fast its gusts
// travel, m/s): its push at a point on the land, (x, z) per unit of sway. Gusts roll over the land along the wind, a
// long swell and a shorter, quicker one across it; the harder it blows, the deeper they are and the faster they come.
const SPACING = 38;
export const windAt = Fn(([p]) => {
  const dir = U.uWind.xy, s = U.uWind.z, along = p.dot(dir), across = p.dot(vec2(dir.y.negate(), dir.x)), t = U.uTime.mul(U.uWind.w);
  const swell = sin(along.sub(t).mul(6.2831853 / SPACING)).mul(0.5).add(0.5), chop = sin(along.mul(2.3).add(across.mul(0.9)).sub(t.mul(1.9)).mul(6.2831853 / SPACING)).mul(0.5).add(0.5);
  const gust = mix(0.75, 0.25, s).add(swell.mul(mix(0.25, 0.6, s))).add(chop.mul(s).mul(0.3));
  return dir.mul(s.mul(gust)).mul(s.mul(s).mul(0.6).add(1));   // the top of the range blows harder still: a storm, not a strong wind
});

// the hand-over between two levels of detail (src/detail): keep.x of the pixels, chosen by one screen noise both sides share
/** true where this level gives the pixel up to the other side of a hand-over */
export const detailCut = (keep) => { const n = ign(screenCoordinate.xy); return keep.y.greaterThan(0.5).select(float(1).sub(n), n).greaterThanEqual(keep.x); };
/** How much of a level shows at px pixels (the GPU's keepOf): (share kept, side). lo, hi, f: numbers of the asset's file. */
export const detailKeep = (px, lo, hi, f) => {
  const L = log(max(px, 1e-6)), lh = Math.log(hi), ll = Math.log(lo);
  const kHi = vec2(float(1).sub(clamp(L.sub(lh - f).div(2 * f), 0, 1)), 0), kLo = vec2(clamp(L.sub(ll - f).div(2 * f), 0, 1), 1);
  const lower = L.lessThan(ll + f).select(kLo, vec2(1, 0));
  return Number.isFinite(hi) && hi < 1e8 ? L.greaterThan(lh - f).select(kHi, lower) : lower;
};
