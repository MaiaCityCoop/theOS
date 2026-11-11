// The shading contract's vertex half (intent 0002): what every level of every asset shares before it is lit. The
// fragment half is in light.glsl.js (LIGHT_GLSL): the light, the air, the weather, the clouds' shadow, the hand-over.
// A new weather or light is written here and there once, and reaches every level of everything.
export const DETAIL_GLSL = /* glsl */ `
uniform float uPxK;   // pixels per metre at a metre, for the walker's lens on this screen (src/detail)
uniform vec4 uWind;   // xy: where it blows (x, z), z: how strong, w: its phase (time); all still today
// how much of a level shows at px pixels on screen: (share kept, side); the same as keepOf() in src/detail
vec2 detailKeep(float px, float lo, float hi, float f){
  float L = log(max(px, 1e-6));
  if (hi < 1e8 && L > log(hi) - f) return vec2(1.0 - clamp((L - log(hi) + f) / (2.0 * f), 0.0, 1.0), 0.0);
  if (L < log(lo) + f) return vec2(clamp((L - log(lo) + f) / (2.0 * f), 0.0, 1.0), 1.0);
  return vec2(1.0, 0.0);
}
// the wind's push at a point, for a thing that sways this much (0 stone, 1 a grass blade); gusts travel over the land
vec3 windAt(vec3 w, float sway){
  float g = 0.6 + 0.4 * sin(uWind.w * 1.3 + dot(w.xz, vec2(0.11, 0.07)));
  return vec3(uWind.x, 0.0, uWind.y) * uWind.z * sway * g;
}
`;
