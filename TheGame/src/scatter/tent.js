// The first tent: a plain ridge tent of canvas, standing at its place (world/places.js).
// One small mesh, lit by the light every material shares. Where it stands, no grass grows
// (scatter/ground.js keeps its floor clear).
import * as THREE from 'three';
import { LIGHT_GLSL, heightAt } from '../world.js';
import { PLACES } from '../world/places.js';

const L = 3.4, W = 1.25, H = 1.6;   // long, half as wide, high (metres)

export function createTent(scene, U) {
  const p = PLACES.tent, a = L / 2;
  // ridge along z; the door is the end at -z
  const R0 = [0, H, -a], R1 = [0, H, a], A0 = [-W, 0, -a], A1 = [-W, 0, a], B0 = [W, 0, -a], B1 = [W, 0, a];
  const canvas = [0.60, 0.53, 0.38], shade = [0.5, 0.44, 0.31], inside = [0.05, 0.045, 0.035];
  const tris = [
    [A0, A1, R1, canvas], [A0, R1, R0, canvas],     // one side of the roof
    [B1, B0, R0, shade], [B1, R0, R1, shade],       // the other
    [A1, B1, R1, canvas],                           // the closed end
    [B0, A0, R0, inside],                           // the open door: dark inside
    [[-W * 0.42, 0, -a - 0.01], [-W, 0, -a - 0.01], [0, H, -a - 0.01], canvas],   // the door's two flaps, tied back
    [[W, 0, -a - 0.01], [W * 0.42, 0, -a - 0.01], [0, H, -a - 0.01], canvas],
  ];
  const pos = [], col = [];
  for (const [x, y, z, c] of tris) for (const v of [x, y, z]) { pos.push(...v); col.push(...c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 color;
      out vec3 vN; out vec3 vCol; out vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = mat3(modelMatrix) * normal; vCol = color; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCam;
      ${LIGHT_GLSL}
      in vec3 vN; in vec3 vCol; in vec3 vWorld;
      void main(){
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 col = vCol * (uAmb + uSun * (0.2 + 0.8 * ndl));
        gl_FragColor = toScreen(haze(col, length(uCam - vWorld)));
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(p.x, heightAt(p.x, p.z) - 0.03, p.z);
  mesh.rotation.y = p.yaw;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}
