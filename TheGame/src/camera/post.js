// Depth of field, for the virtual camera: the picture is drawn into a target with its depth, then every pixel is
// blurred by how far it lies from the plane of focus, as a lens of that focal length and aperture would. Anamorphic:
// the blur is an upright oval, twice as tall as wide. And the glass: a little barrel, a little light lost at the corners.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uv, uniform, texture, If, min, abs, max, sqrt, cos, sin, step, smoothstep, dot } from 'three/tsl';

const TAPS = 28;

export function createPost(renderer, skyHex, screen = null) {   // screen: the picture's two sizes (src/core/screen.js): the world is drawn at the inside's, the lens's blur lays it on the screen
  let rt = null;
  // the sky's colour as plain numbers: into a target, three writes a clear colour unconverted
  const sky = new THREE.Color().setRGB(((skyHex >> 16) & 255) / 255, ((skyHex >> 8) & 255) / 255, (skyHex & 255) / 255, THREE.LinearSRGBColorSpace), keep = new THREE.Color();
  const size = new THREE.Vector2();
  const u = { texel: uniform(new THREE.Vector2()), near: uniform(0.15), far: uniform(30000), focus: uniform(10), K: uniform(0), F: uniform(0.05), maxR: uniform(24), barrel: uniform(0), picH: uniform(1) };
  const tC = texture(new THREE.Texture()), tD = texture(new THREE.DepthTexture(1, 1));
  const distAt = (p) => u.near.mul(u.far).div(u.far.sub(tD.sample(p).level(0).r.mul(u.far.sub(u.near))));   // depth to metres (the same on either backend)
  // the blur's radius in pixels (upright) for a thing d metres away: the thin lens's circle of confusion
  const coc = (d) => min(u.K.mul(abs(d.sub(u.focus))).div(d.mul(max(u.focus.sub(u.F), 1e-3))), u.maxR);
  const quadMat = new THREE.NodeMaterial(); quadMat.depthTest = quadMat.depthWrite = false;
  quadMat.vertexNode = vec4(uv().mul(2).sub(1), 0, 1);
  quadMat.fragmentNode = Fn(() => {
    const v0 = vec2(uv().x, float(1).sub(uv().y));   // a target reads with its rows turned (src/scatter/ground.js)
    // the glass: straight lines near the frame's edge bow outward a little (barrel), mostly across
    const qq = v0.sub(0.5).mul(vec2(2, float(2).div(u.picH))), r2 = qq.x.mul(qq.x).add(qq.y.mul(qq.y).mul(0.35));
    const p = v0.sub(0.5).mul(u.barrel.mul(r2).add(1)).div(u.barrel.mul(1.35).add(1)).add(0.5);
    const d0 = distAt(p), c0 = coc(d0), sum = tC.sample(p).level(0).rgb.toVar(), w = float(1).toVar();
    If(c0.greaterThan(0.5), () => {
      for (let i = 0; i < TAPS; i++) {
        const r = Math.sqrt((i + 0.5) / TAPS), a = i * 2.39996323;
        const q = p.add(vec2(Math.cos(a) * 0.5, Math.sin(a)).mul(c0.mul(r)).mul(u.texel)), dt = distAt(q);
        // what lies behind may spread here freely; what lies in front only as far as its own blur reaches
        const k = dt.greaterThanEqual(d0.mul(0.97)).select(float(1), step(c0.mul(r), coc(dt).add(0.5)));
        sum.addAssign(tC.sample(q).level(0).rgb.mul(k)); w.addAssign(k);
      }
    });
    const e = p.sub(0.5).mul(vec2(2, float(2).div(u.picH)));
    return vec4(sum.div(w).mul(float(1).sub(smoothstep(0.55, 1.45, dot(e, e)).mul(0.16))), 1);   // a little light lost toward the corners
  })();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quad.frustumCulled = false;
  return {
    /** dof: { focus (m), mm, N, aspect (the picture's shape), barrel } */
    render(scene, camera, dof) {
      if (screen) screen.size(size); else renderer.getDrawingBufferSize(size);
      if (!rt || rt.width !== size.x || rt.height !== size.y) {
        rt?.dispose();
        rt = new THREE.RenderTarget(size.x, size.y, { samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y), minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
        tC.value = rt.texture; tD.value = rt.depthTexture;
      }
      renderer.getClearColor(keep); renderer.setClearColor(sky);
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
      renderer.setClearColor(keep);
      const f = dof.mm / 1000, wa = size.x / size.y, picH = dof.aspect > wa ? size.x / dof.aspect : size.y;
      u.texel.value.set(1 / size.x, 1 / size.y); u.near.value = camera.near; u.far.value = camera.far;
      u.focus.value = Math.max(dof.focus, f * 2); u.F.value = f;
      u.K.value = ((f * f) / dof.N / 0.01782) * picH * 0.5;   // 17.82 mm: the gate's height
      u.maxR.value = picH * 0.03; u.picH.value = picH / size.y; u.barrel.value = dof.barrel ?? 0;
      renderer.render(quad, cam);
    },
  };
}
