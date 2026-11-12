// The world's materials (materials/*.js), painted once at the start by the GPU into two texture arrays, one layer per
// material: albedo (gamma 2) + height in A, normal + roughness in N. A shader binds the two arrays whatever the number
// of materials, and picks a material by its layer: tex.a(material, uv), tex.n(material, uv), the material its recipe
// (imported) or its uid.
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, vec4, uv, float, sqrt, clamp, normalize, texture } from 'three/tsl';
import { recipes } from '../core/registry.js';

const SIZE = 1024, LEVELS = Math.log2(SIZE) + 1;

// one material's tile, painted: its albedo (gamma 2) and height, or its normal and roughness. The writer turns the rows
// over: three reads a target's rows the other way up (src/scatter/ground.js), so the tile reads back exactly as painted.
function program(m, normalPass) {
  const frag = Fn(() => {
    const p = vec2(uv().x, float(1).sub(uv().y)), M = m.paint(p);
    if (!normalPass) return vec4(sqrt(clamp(M.col, 0, 1)), clamp(M.h, 0, 1));
    const e = 1 / SIZE, hx = m.paint(p.add(vec2(e, 0))).h, hy = m.paint(p.add(vec2(0, e))).h;
    return vec4(normalize(vec3(M.h.sub(hx).div(e), M.h.sub(hy).div(e), 1 / m.bump)).mul(0.5).add(0.5), M.rough);
  });
  const mat = new THREE.NodeMaterial(); mat.vertexNode = vec4(uv().mul(2).sub(1), 0, 1); mat.fragmentNode = frag(); mat.depthTest = mat.depthWrite = false;
  return mat;
}

/** Bakes every material in the registry, a layer each. Returns the arrays and how to read them:
    { arrays, layer(material), a(material, uv) and n(material, uv) as nodes (with .grad(dx, dy) as on any texture) }. */
export function bakeTextures(renderer) {
  const MATERIALS = recipes('material'), N = MATERIALS.length, aniso = 8;
  const array = () => {
    const rt = new THREE.RenderTarget(SIZE, SIZE, { depth: N, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
    Object.assign(rt.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: aniso });
    renderer.initRenderTarget(rt); return rt;
  };
  const A = array(), Nn = array();
  const tmp = new THREE.RenderTarget(SIZE, SIZE, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  const prev = renderer.getRenderTarget(), box = new THREE.Box2(), at = new THREE.Vector3();
  MATERIALS.forEach((m, i) => {
    for (const [dst, normalPass] of [[A, false], [Nn, true]]) {
      quad.material = program(m, normalPass);
      renderer.setRenderTarget(tmp); renderer.render(quad, cam); renderer.setRenderTarget(prev);   // its mipmaps are made as the pass ends
      for (let l = 0; l < LEVELS; l++) { const s = SIZE >> l; box.min.set(0, 0); box.max.set(s, s); at.set(0, 0, i); renderer.copyTextureToTexture(tmp.texture, dst.texture, box, at, l, l); }
      quad.material.dispose();
    }
  });
  tmp.dispose(); quad.geometry.dispose();
  const layer = (ref) => { const uid = ref?.uid ?? ref, i = MATERIALS.findIndex((m) => m.uid === uid); if (i < 0) throw new Error(`no material ${uid}`); return i; };
  const tA = texture(A.texture), tN = texture(Nn.texture);
  return {
    arrays: [A, Nn], layer,
    /** a material's albedo + height at uv (a node) */
    a: (m, p) => tA.sample(p).depth(layer(m)),
    /** its normal + roughness at uv */
    n: (m, p) => tN.sample(p).depth(layer(m)),
  };
}
