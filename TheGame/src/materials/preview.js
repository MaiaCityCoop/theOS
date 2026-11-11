// A material on its own, for the library: its two baked textures laid over any shape from the world's position
// (three planar projections blended by the normal, so a ball and a slab both read true), lit like the world.
import * as THREE from 'three';
import { LIGHT_GLSL } from '../world.js';

/** t: { a, n } from tex.of(id); tile: metres one tile of the texture covers. */
export function materialPreview(U, t, tile = 2) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, tA: { value: t.a }, tN: { value: t.n }, uTile: { value: tile } },
    vertexShader: /* glsl */ `
      out vec3 vN; out vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCam; uniform sampler2D tA, tN; uniform float uTile;
      ${LIGHT_GLSL}
      in vec3 vN; in vec3 vWorld;
      void main(){
        vec3 n = normalize(vN), w = pow(abs(n), vec3(4.0)); w /= w.x + w.y + w.z;
        vec2 px = vWorld.zy / uTile, py = vWorld.xz / uTile, pz = vWorld.xy / uTile;
        vec3 a = texture(tA, px).rgb * w.x + texture(tA, py).rgb * w.y + texture(tA, pz).rgb * w.z;
        vec4 nx = texture(tN, px), ny = texture(tN, py), nz = texture(tN, pz);
        vec2 dx = nx.xy * 2.0 - 1.0, dy = ny.xy * 2.0 - 1.0, dz = nz.xy * 2.0 - 1.0;
        // each projection's relief, turned onto the surface (whiteout blend)
        vec3 bn = normalize(w.x * vec3(0.0, dx.y, dx.x) * sign(n.x) + w.y * vec3(dy.x, 0.0, dy.y) * sign(n.y) + w.z * vec3(dz.x, dz.y, 0.0) * sign(n.z) + n);
        float rough = nx.a * w.x + ny.a * w.y + nz.a * w.z;
        vec3 col = a * a, v = normalize(uCam - vWorld), h = normalize(v + uSunDir);
        float ndl = max(dot(bn, uSunDir), 0.0), spec = pow(max(dot(bn, h), 0.0), mix(60.0, 6.0, rough)) * (1.0 - rough) * 0.5;
        col = col * (uAmb + uSun * (0.15 + 0.85 * ndl)) + uSun * spec * ndl;
        gl_FragColor = toScreen(haze(col, length(uCam - vWorld)));
      }`,
  });
}
