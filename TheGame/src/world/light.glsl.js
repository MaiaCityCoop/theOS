// The light every material shares: sun, ambient, the air, and the way to the screen.
export const LIGHT_GLSL = /* glsl */ `
uniform vec3 uSunDir, uSun, uAmb, uSky, uHazeCol; uniform float uHaze;
// the weather every surface answers, all neutral today (intent 0002): x wet, y snow, z fog, w storm (darker light)
uniform vec4 uWeather; uniform float uClouds;
uniform float uAirH, uAirScale;   // the camera's height above the ground under it; how fast the air thins with height (m)
// air: the far land takes the sky's colour, and the horizon melts into it. One height fog for everything, near or 12 km
// up: the air is thickest at the ground and thins upwards (by e every uAirScale metres), so a line of sight from high up
// passes through less of it; mostly the line ends on the ground, so its mean thickness is that of the air from the
// camera's height down. Fog (the weather) thickens it all.
float airMean(float h){ float k = h / max(uAirScale, 1.0);   // (a material without the shared uniforms: no thinning)
  if (uAirScale < 1.0) return 1.0;
  return k < 1e-3 ? 1.0 - 0.5 * k : (1.0 - exp(-k)) / k; }
vec3 haze(vec3 c, float dist){ return mix(uHazeCol, c, exp(-dist * uHaze * airMean(uAirH) * (1.0 + 40.0 * uWeather.z))); }
// shadows: what the casters hide of the light, from one map round the camera (src/world/shadow.js); 1 lit, 0 in shadow
uniform sampler2D tShadow; uniform mat4 uShadowM; uniform float uShadowOn, uShadowTexel;
float shadowAt(vec3 w){
  if (uShadowOn < 0.5) return 1.0;
  vec4 s = uShadowM * vec4(w, 1.0); vec3 q = s.xyz / s.w * 0.5 + 0.5;
  if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0 || q.z >= 1.0) return 1.0;
  float k = 0.0, bias = 0.0004;   // about a quarter metre of the map's depth: no speckles on lit faces, shadows still touching their casters
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) k += step(q.z - bias, texture(tShadow, q.xy + vec2(float(i), float(j)) * uShadowTexel * 1.5).r);
  vec2 e = smoothstep(0.0, 0.08, q.xy) * smoothstep(1.0, 0.92, q.xy);   // fading out at the map's edge
  return mix(1.0, k / 9.0, e.x * e.y);
}
// the share of sunlight that reaches a point (1: all): past the clouds (a moving cloud map comes with the clouds) and
// past what casts a shadow
float cloudAt(vec3 w){ return (1.0 - uClouds * 0.0) * (1.0 - 0.6 * uWeather.w) * shadowAt(w); }
// a surface under the weather: darker when wet, white where snow settles (on what faces up)
vec3 weathered(vec3 col, vec3 n){ return mix(col * (1.0 - 0.35 * uWeather.x), vec3(0.85, 0.87, 0.9), uWeather.y * smoothstep(0.35, 0.8, n.y)); }
// the hand-over between two levels of detail: keep.x of the pixels, chosen by one screen noise shared by both sides
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
bool detailCut(vec2 keep){ float n = ign(gl_FragCoord.xy); return (keep.y > 0.5 ? 1.0 - n : n) >= keep.x; }
uniform float uExposure;   // the picture's exposure: brighter as the night falls, so it stays readable (intent 0007)
vec4 toScreen(vec3 c){ c = 1.0 - exp(-c * 1.25 * (uExposure > 0.0 ? uExposure : 1.0)); return vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }
`;
