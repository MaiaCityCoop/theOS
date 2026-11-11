// The asset library: every made thing that stands in the world, one file each in this folder, as data (what it
// is, how large, its colours, its faces). Here they are listed, built into meshes with the one lit material
// they share, and stood where the world says (src/world/places.js names a place and its asset).
//
// A new asset: a file here exporting { id, name, kind, about, size, colours, faces }, and a line in ASSETS.
import * as THREE from 'three';
import { LIGHT_GLSL, heightAt } from '../src/world.js';
import tent from './tent.js';

export const ASSETS = { tent };

/** An asset's faces as a geometry, coloured per face. */
export function geometryOf(asset) {
  const pos = [], col = [];
  for (const [p0, p1, p2, c] of asset.faces) for (const v of [p0, p1, p2]) { pos.push(...v); col.push(...c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The material every asset shares: its own colours, lit by the sun and the sky and hazed with distance like the land. */
export function materialFor(U) {
  return new THREE.ShaderMaterial({
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
}

/** Stand an asset at a place ({ x, z, yaw }), on the ground there. */
export function place(scene, U, asset, at) {
  const mesh = new THREE.Mesh(geometryOf(asset), materialFor(U));
  mesh.position.set(at.x, heightAt(at.x, at.z) - 0.03, at.z);
  mesh.rotation.y = at.yaw || 0;
  mesh.renderOrder = 1;
  mesh.name = asset.id;
  scene.add(mesh);
  return mesh;
}
