// The light every material shares: sun, ambient, the air, and the way to the screen.
export const LIGHT_GLSL = /* glsl */ `
uniform vec3 uSunDir, uSun, uAmb, uSky, uHazeCol; uniform float uHaze;
// the weather every surface answers, all neutral today (intent 0002): x wet, y snow, z fog, w storm (darker light)
uniform vec4 uWeather; uniform float uClouds;
// air: the far land takes the sky's colour, and the horizon melts into it; fog thickens it
vec3 haze(vec3 c, float dist){ return mix(uHazeCol, c, exp(-dist * uHaze * (1.0 + 40.0 * uWeather.z))); }
// the share of sunlight that reaches a point past the clouds (1: all); a moving cloud map comes with the clouds
float cloudAt(vec3 w){ return (1.0 - uClouds * 0.0) * (1.0 - 0.6 * uWeather.w); }
// a surface under the weather: darker when wet, white where snow settles (on what faces up)
vec3 weathered(vec3 col, vec3 n){ return mix(col * (1.0 - 0.35 * uWeather.x), vec3(0.85, 0.87, 0.9), uWeather.y * smoothstep(0.35, 0.8, n.y)); }
// the hand-over between two levels of detail: keep.x of the pixels, chosen by one screen noise shared by both sides
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
bool detailCut(vec2 keep){ float n = ign(gl_FragCoord.xy); return (keep.y > 0.5 ? 1.0 - n : n) >= keep.x; }
vec4 toScreen(vec3 c){ c = 1.0 - exp(-c * 1.25); return vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }
`;
