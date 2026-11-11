// The light every material shares: sun, ambient, the air, and the way to the screen.
export const LIGHT_GLSL = /* glsl */ `
uniform vec3 uSunDir, uSun, uAmb, uSky, uHazeCol; uniform float uHaze;
// air: the far land takes the sky's colour, and the horizon melts into it
vec3 haze(vec3 c, float dist){ return mix(uHazeCol, c, exp(-dist * uHaze)); }
vec4 toScreen(vec3 c){ c = 1.0 - exp(-c * 1.25); return vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }
`;
