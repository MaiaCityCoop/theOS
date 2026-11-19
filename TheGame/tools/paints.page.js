// The world's materials painted one by one, alone (tools/paints.js): each by its own painting program (src/materials/
// bake.js paintingOf) into what the painter paints into (its tile, 8 bits; its heights and roughness, 32-bit floats),
// and read back, so two versions of the painting can be held texel by texel against each other. The address: size, the
// tile's side (the painter's own by default, 1024).
import * as THREE from 'three/webgpu';
import { recipes } from '../src/core/registry.js';
import { paintingOf, reliefOf } from '../src/materials/bake.js';

const size = +(new URLSearchParams(location.search).get('size') ?? 1024);
const renderer = new THREE.WebGPURenderer({ antialias: false });
await renderer.init();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), camera = new THREE.OrthographicCamera();
quad.frustumCulled = false;
// (as the painter's own: its tile and its raw heights and roughness, src/materials/bake.js painter)
const target = new THREE.RenderTarget(size, size, { count: 2, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.NoColorSpace });
Object.assign(target.textures[1], { type: THREE.FloatType, format: THREE.RGFormat });
// (and its relief, as the painter takes it from the heights and keeps it: the normal and the roughness, 8 bits)
const relief = reliefOf(target.textures[1]), reliefQuad = new THREE.Mesh(quad.geometry, relief.mat), kept = new THREE.RenderTarget(size, size, { depthBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace });
reliefQuad.frustumCulled = false;
const base64 = (a) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const painted = recipes('material').filter((m) => m.paint);
window.__materials = painted.map((m) => ({ uid: m.uid, name: m.name }));
/** Material uid painted alone: { tile, raw, relief } (base64: its tile's bytes, 4 a texel; its raw floats, 2 a texel;
    its relief's bytes, 4 a texel, where it has one: a bump), or why not. */
window.__paint = async (uid) => {
  const m = painted.find((x) => x.uid === uid);
  try {
    quad.material = paintingOf(m);
    renderer.setRenderTarget(target); renderer.render(quad, camera); renderer.setRenderTarget(null);
    const tile = await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size, 0), raw = await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size, 1);
    let rel = null;
    if (m.bump) { relief.bumpInv.value = 1 / m.bump; renderer.setRenderTarget(kept); renderer.render(reliefQuad, camera); renderer.setRenderTarget(null); rel = await renderer.readRenderTargetPixelsAsync(kept, 0, 0, size, size); }
    return { tile: base64(tile), raw: base64(raw), relief: rel && base64(rel) };
  } catch (e) { return { error: String(e?.message ?? e).slice(0, 300) }; } finally { quad.material?.dispose(); }
};
window.__ready = true;
