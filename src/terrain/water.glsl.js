// The water's surface.
import { WORLD_GLSL, LIGHT_GLSL } from '../world.js';

export const WATER_FRAG = /* glsl */ `
${WORLD_GLSL}
${LIGHT_GLSL}
in vec3 vWorld; in vec3 vR; in float vW;
uniform sampler2D tWN, tWA;
uniform float uTime;
void main(){
  float d = riverDist(vR), w = vW;
  if (d > w * 1.15) discard;
  vec2 p = vWorld.xz;
  float depth = riverCarve(d, w) - WATER_DROP;
  vec2 fl = normalize(vec2(-vR.z, vR.y) + 1e-9);
  float mid = clamp(1.0 - d / w, 0.0, 1.0);
  float speed = 0.25 + 0.9 * sqrt(mid);            // slow at the banks, quick in the middle
  // two takes sliding along the flow, half a cycle apart, cross-faded: the water runs and never stretches
  float t = uTime * 0.3, f1 = fract(t), f2 = fract(t + 0.5), wb = abs(2.0 * f1 - 1.0);
  vec2 o1 = fl * speed * (f1 - 0.5) * 3.3, o2 = fl * speed * (f2 - 0.5) * 3.3;
  vec2 uA = (p - o1) / 4.5, uB = (p - o2) / 4.5 + 0.43;
  vec3 nA = texture(tWN, uA).xyz + texture(tWN, uA * 3.1 + 0.2).xyz - 1.0;
  vec3 nB = texture(tWN, uB).xyz + texture(tWN, uB * 3.1 + 0.6).xyz - 1.0;
  vec2 nn = mix(nA.xy, nB.xy, wb);
  float rough = 0.16 + 0.30 * mid;                 // calm water, a little livelier where it runs
  vec3 n = normalize(vec3(nn.x * rough, 1.0, nn.y * rough));
  vec3 V = normalize(uCam - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  // foam: only a thin broken line where the water meets the bank
  float ftex = mix(texture(tWA, uA * 2.0).r, texture(tWA, uB * 2.0).r, wb);
  float foam = (1.0 - smoothstep(0.0, 0.05, depth)) * smoothstep(0.15, 0.6, ftex) * 0.5;
  // things afloat: a few specks carried by the same two takes
  float specks = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 q = (i == 0 ? (p - o1) : (p - o2) + 3.7) * 4.0; vec2 c = floor(q);
    vec2 pt = c + 0.25 + 0.5 * vec2(rnd(ivec2(c), 96u), rnd(ivec2(c), 97u));
    float s = step(0.955, rnd(ivec2(c), 95u)) * (1.0 - smoothstep(0.03, 0.10, length(q - pt)));
    specks += s * (i == 0 ? 1.0 - wb : wb);
  }
  // the water's own colour: clear over the sand at the edge, green-brown and dark in the deep
  vec3 body = mix(vec3(0.085, 0.09, 0.05), vec3(0.018, 0.045, 0.034), clamp(depth * 1.1, 0.0, 1.0));
  vec3 skyRef = mix(uSky, vec3(dot(uSky, vec3(0.333))), 0.4) * 0.92;   // the sky in the water, a little greyed
  vec3 H = normalize(V + uSunDir);
  float wd = length(uCam - vWorld);
  float spec = pow(max(dot(n, H), 0.0), 350.0) * 2.5 + pow(max(dot(n, H), 0.0), 30.0) * 0.22 * smoothstep(40.0, 300.0, wd);   // from far and high: a broad glint
  vec3 col = mix(body * (uAmb + uSun * 0.45), skyRef, clamp(fres * 0.9 + 0.12 * smoothstep(40.0, 400.0, wd), 0.0, 1.0)) + uSun * spec;
  col = mix(col, vec3(0.8) * (uAmb + uSun * 0.5), foam);
  col = mix(col, vec3(0.5, 0.46, 0.3), specks * 0.6);
  float a = clamp(0.2 + depth * 1.1, 0.0, 0.93);
  a = max(max(a, fres * 0.75), max(foam, specks * 0.6)) * smoothstep(-0.04, 0.02, depth);
  gl_FragColor = vec4(toScreen(haze(col, wd)).rgb, a);
}`;
