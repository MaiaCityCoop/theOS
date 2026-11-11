// The asset library: every made thing in the world, one file each in this folder, all in one recipe:
//
//   id, name, kind, about     what it is
//   size                      { length, width, height } in metres; a [min, max] where it varies
//   colours                   its named colours, [r, g, b]
//   lods                      its levels of detail, near to far: { far, ...shape } is drawn up to `far` metres, and
//                             past the last level nothing is. A shape is `faces` ([corner, corner, corner, colour], ...)
//                             or `rock` (a rough rock of an icosphere divided that often), with `P` for scattered ones
//   placement                 { at: 'places', ... } stood at a named place (src/world/places.js), or
//                             { at: 'scatter', engine, cell, ... } spread over the land by the scatter engine
//
// Here they are listed, built into meshes level by level with the one lit material they share, and stood.
import * as THREE from 'three';
import { LIGHT_GLSL, heightAt } from '../src/world.js';
import belltent from './belltent.js';
import stone from './stone.js';
import boulder from './boulder.js';

export const ASSETS = { belltent, stone, boulder };

/** A scattered asset as the row the land's scatter engine (src/scatter) reads. */
export const scatterRow = (a) => ({ name: a.id, kind: a.placement.engine, outcrops: a.placement.outcrops, cell: a.placement.cell, size: a.size.length, texture: a.placement.texture, shapes: a.placement.shapes, seed: a.placement.seed, tiers: a.lods.map((l) => ({ detail: l.rock, P: l.P, far: l.far })) });
/** How many faces a level has. */
export const facesOf = (l) => (l.faces ? l.faces.length : 20 * 4 ** (l.rock || 0));

/** A level of detail of an asset as a geometry, coloured per face (the nearest level unless one is named). */
export function geometryOf(asset, level = asset.lods[0]) {
  const faces = level.faces; if (!faces) return rockPreview(asset, level.rock);
  const pos = [], col = [];
  for (const [p0, p1, p2, c] of faces) for (const v of [p0, p1, p2]) { pos.push(...v); col.push(...c); }
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
  // its detail levels: each drawn up to its distance, nothing past the last (THREE.LOD picks the level every frame)
  const mat = materialFor(U), lod = new THREE.LOD(), levels = asset.lods;
  let near = 0;
  for (const l of levels) { const m = new THREE.Mesh(geometryOf(asset, l), mat); m.renderOrder = 1; lod.addLevel(m, near); near = l.far; }
  if (Number.isFinite(near)) lod.addLevel(new THREE.Object3D(), near);
  lod.position.set(at.x, heightAt(at.x, at.z) - 0.03, at.z);
  lod.rotation.y = at.yaw || 0;
  lod.name = asset.id;
  scene.add(lod);
  return lod;
}

/** A picture of a scattered rock, for the library's list: a rough, lumpy stone in its own colour. */
function rockPreview(asset, detail = 2) {
  const g = new THREE.IcosahedronGeometry(0.5, detail), p = g.attributes.position, c = [], base = asset.colours?.stone || [0.5, 0.5, 0.5];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.18 * Math.sin(x * 7.1 + y * 3.3) * Math.cos(z * 5.7 - x * 2.1) + 0.08 * Math.sin(y * 13 + z * 9);
    p.setXYZ(i, x * k, Math.max(-0.1, y * k * 0.72), z * k); const s = (0.9 + 0.2 * Math.sin(x * 11 + z * 7)) * 0.45; c.push(base[0] * s, base[1] * s, base[2] * s);   // as dark as the world's own stones under the same light
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.translate(0, 0.1, 0); g.computeVertexNormals();
  return g;
}
