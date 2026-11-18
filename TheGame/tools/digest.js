// A digest of the temporal pass (src/core/temporal.js), on the GPU's stand-in (tools/gpu-mock.js): its shaders built to
// WGSL and to GLSL (WebGPU, WebGL 2), and what its CPU side asks of the renderer over a fixed run of frames (every
// target set and every thing drawn, in order; every uniform's value after each frame). One JSON to compare two versions
// of the code by: a refactor that changes nothing shows the same digest (the code gates, intent 0038). The same frames
// every run, on a clock of its own.
//
//   bun tools/digest.js > before.json      then, on the change:      bun tools/digest.js | diff before.json -
import { mock } from './gpu-mock.js';

let clock = 1000;
performance.now = () => clock;
const value = (v, id) => (v == null ? null : v.isTexture ? id(v) : v.isMatrix4 || v.isMatrix3 ? Array.from(v.elements, (x) => +x.toPrecision(12)) : v.isVector2 || v.isVector3 || v.isVector4 || v.isColor ? v.toArray().map((x) => +x.toPrecision(12)) : typeof v === 'number' ? +v.toPrecision(12) : String(v));

async function run(webgl) {
  const M = await mock({ webgl, dpr: 2, record: true, size: [1280, 720] }), { THREE, renderer: r, calls, drawn, id } = M;
  const { createTemporal } = await import('../src/core/temporal.js'), { U } = await import('../src/core/uniforms.js');
  const T = createTemporal(r), cam = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 30000);
  const tex = (w, h, depth) => { const t = depth ? new THREE.DepthTexture(w, h) : new THREE.Texture(); t.image = { width: w, height: h }; return t; };
  const colour = tex(1280, 720), motion = tex(1280, 720), d1 = tex(1280, 720, true), d2 = tex(1280, 720, true), d3 = tex(960, 540, true);
  const frames = [
    { w: 1280, h: 720, depth: d1, depthWas: null, glass: null },
    { w: 1280, h: 720, depth: d2, depthWas: d1, glass: null },
    { w: 1280, h: 720, depth: d1, depthWas: d2, glass: { barrel: 0.045, picH: 0.8, dim: 0.3 } },
    { w: 1280, h: 720, depth: d2, depthWas: d1, glass: { barrel: 0.1, picH: 1 } },
    { w: 1280, h: 720, depth: d1, depthWas: d2, glass: { barrel: 0.1, picH: 1 }, cut: true },
    { w: 1280, h: 720, depth: d2, depthWas: d1, glass: null, resize: [1920, 1080] },
    { w: 960, h: 540, depth: d3, depthWas: d1, glass: null },
    { w: 960, h: 540, depth: d3, depthWas: d3, glass: { barrel: 0.02, picH: 0.9, dim: 0 }, stale: true },
    { w: 960, h: 540, depth: d3, depthWas: d3, glass: { barrel: 0.02, picH: 0.9, dim: 0 } },
  ];
  const out = [], shaders = {}, uniforms = new Map();
  for (const [i, f] of frames.entries()) {
    clock += f.stale ? 1000 : 16; U.uTime.value = clock / 1000;
    if (f.resize) [r.size.W, r.size.H] = f.resize;
    if (f.cut) T.cut();
    cam.position.set(i * 0.7, 1.6 + i * 0.1, -i * 1.3); cam.rotation.set(-0.05 * i, 0.1 * i, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    T.begin(cam, f.w, f.h); T.end(cam);
    T.resolve({ colour, depth: f.depth, motion, depthWas: f.depthWas, glass: f.glass });
    for (const m of [...drawn].filter((x) => !shaders[id(x)])) {   // (each thing it drew, built once: its code, and the uniforms it reads)
      const b = M.build(m, m.material, { camera: cam });
      shaders[id(m)] = { vertex: b.vertex, fragment: b.fragment };
      for (const stage of ['vertex', 'fragment']) for (const u of b.uniforms[stage] ?? []) uniforms.set(u.node, `${u.name}`);
    }
    out.push({ calls: calls.splice(0), age: T.age, settles: T.settles, place: T.place,
      uniforms: Object.fromEntries([...uniforms].map(([node, name]) => [name, value(node.value, id)])),
      globals: Object.fromEntries(Object.entries(U).map(([k, n]) => [k, value(n.value, id)])) });
  }
  return { shaders, frames: out };
}
console.log(JSON.stringify({ webgpu: await run(false), webgl: await run(true) }, null, 1));
process.exit(0);
