// The lens of the virtual camera: depth of field, and the glass. Two stages of the one way a picture reaches the screen
// (src/core/screen.js), not a way of its own:
//
//   the blur   between the world's frame and the picture built from it: every pixel blurred by how far it lies from
//              the plane of focus, as a lens of that focal length and aperture would. Anamorphic: the blur is an
//              upright oval, twice as tall as wide. What it makes is built into the screen's picture as any frame is
//              (src/core/temporal.js), so its edges are smooth.
//   the glass  as the picture is laid on the canvas: a little barrel, a little light lost at the corners (the last
//              pass takes its numbers: temporal.js).
//
// The blur is worked out at half the inside's pixels each way (a quarter of them): what is blurred has nothing fine in
// it to lose. Three small passes:
//   small     the frame at half size: each pixel the mean colour of four, and the distance of the nearest of them
//   blurred   each of those blurred by its own distance from the plane of focus (twenty-four reads round it, turned a
//             little every frame: the frames together are many more, and the screen's picture takes them all in)
//   through   back at the inside's pixels: a pixel in focus keeps the frame's own colour; one out of focus takes the
//             blurred colour of the half-size pixels round it that lie as far off as it does (so nothing sharp
//             shows round a thing in focus, and nothing in focus is smeared)
// (Measured 2026-11-14: one pass of twenty-eight reads at every pixel of the inside cost half a frame again; drawn at
// the screen's pixels, as before that day, four times that.)
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uv, uniform, texture, If, min, max, abs, floor, step, mix, clamp, smoothstep } from 'three/tsl';
import { note } from '../core/gpu.js';

const TAPS = 24;

export function createLens(renderer) {
  const u = { texel: uniform(new THREE.Vector2()), half: uniform(new THREE.Vector2(1, 1)), near: uniform(0.15), far: uniform(30000), focus: uniform(10), K: uniform(0), F: uniform(0.05), maxR: uniform(24), turn: uniform(new THREE.Vector2(1, 0)) };
  const tC = texture(new THREE.Texture()), tD = texture(new THREE.DepthTexture(1, 1)), tA = texture(new THREE.Texture()), tB = texture(new THREE.Texture());
  const at = () => vec2(uv().x, float(1).sub(uv().y));   // (a target reads with its rows turned: src/core/screen.js)
  const distOf = (d) => u.near.mul(u.far).div(u.far.sub(d.mul(u.far.sub(u.near))));   // depth to metres
  // the blur's radius in the inside's pixels (upright) for a thing d metres away: the thin lens's circle of confusion
  const coc = (d) => min(u.K.mul(abs(d.sub(u.focus))).div(d.mul(max(u.focus.sub(u.F), 1e-3))), u.maxR);
  const quadOf = (frag) => { const m = new THREE.NodeMaterial(); m.depthTest = m.depthWrite = false; m.vertexNode = vec4(uv().mul(2).sub(1), 0, 1); m.fragmentNode = frag(); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; return q; };
  // the frame at half size: the mean colour of four pixels (one read where they meet), the nearest of their distances
  const small = quadOf(Fn(() => {
    const p = at(), d = float(2).toVar();
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) d.assign(min(d, tD.sample(p.add(vec2(x, y).mul(u.texel))).level(0).r));
    return vec4(tC.sample(p).level(0).rgb, distOf(d));
  }));
  // each blurred by its own distance from the plane of focus
  const blurred = quadOf(Fn(() => {
    const p = at(), own = tA.sample(p).level(0), d0 = own.a, c0 = coc(d0), sum = vec3(own.rgb).toVar(), w = float(1).toVar();
    If(c0.greaterThan(0.5), () => {
      for (let i = 0; i < TAPS; i++) {
        const r = Math.sqrt((i + 0.5) / TAPS), a = i * 2.39996323, x = Math.cos(a) * 0.5 * r, y = Math.sin(a) * r;
        const q = p.add(vec2(u.turn.x.mul(x).sub(u.turn.y.mul(y * 0.5)), u.turn.y.mul(x * 2).add(u.turn.x.mul(y))).mul(c0).mul(u.texel)), t = tA.sample(q).level(0);   // (turned within its upright oval)
        // what lies behind may spread here freely; what lies in front only as far as its own blur reaches
        const k = t.a.greaterThanEqual(d0.mul(0.97)).select(float(1), step(c0.mul(r), coc(t.a).add(0.5)));
        sum.addAssign(t.rgb.mul(k)); w.addAssign(k);
      }
    });
    return vec4(sum.div(w), d0);
  }));
  // back at the inside's pixels
  const through = quadOf(Fn(() => {
    const p = at(), f = tC.sample(p).level(0), d = distOf(tD.sample(p).level(0).r), t = clamp(coc(d).sub(0.5).div(1.5), 0, 1), out = vec3(f.rgb).toVar();
    If(t.greaterThan(0), () => {
      const hp = p.mul(u.half).sub(0.5), b0 = floor(hp), fr = hp.sub(b0), acc = vec3(0).toVar(), ws = float(0).toVar(), like = float(0).toVar();
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const s = tB.sample(b0.add(vec2(x + 0.5, y + 0.5)).div(u.half)).level(0), e = s.a.sub(d).div(d.mul(0.05)), same = float(1).div(e.mul(e).add(1));   // how nearly it lies as far off as this pixel
        const wt = (x ? fr.x : float(1).sub(fr.x)).mul(y ? fr.y : float(1).sub(fr.y)).add(0.01).mul(same);
        acc.addAssign(s.rgb.mul(wt)); ws.addAssign(wt); like.assign(max(like, same));
      }
      out.assign(mix(f.rgb, acc.div(ws), t.mul(smoothstep(0.02, 0.2, like))));   // (none of the four at its distance: the frame's own colour)
    });
    return vec4(out, f.a);   // (the fourth number: how still the thing is, src/world/light.js, as the frame said it)
  }));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let A = null, B = null, C = null, n = 0;
  return {
    /** The frame (a target with its depth: the world as just drawn) through the lens.
        dof: { focus (m), mm, N, aspect (the picture's shape), barrel }. -> { colour: the frame's colour blurred, glass:
        the numbers of the last pass } (temporal.js: resolve). */
    blur(frame, camera, dof) {
      const w = frame.width, h = frame.height, hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
      if (!C || C.width !== w || C.height !== h) {
        A?.dispose(); B?.dispose(); C?.dispose();
        const halfOpts = { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false };
        // (the small frame is read between its pixels by the blur: smooth; the blurred one pixel by pixel, each weighed by its distance)
        A = new THREE.RenderTarget(hw, hh, { ...halfOpts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); B = new THREE.RenderTarget(hw, hh, { ...halfOpts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        C = new THREE.RenderTarget(w, h, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
        tA.value = A.texture; tB.value = B.texture; note("the frame through the lens (two targets of half its size, one of its own)", 2 * hw * hh * 8 + w * h * 4, 0);
      }
      const f = dof.mm / 1000, picH = dof.aspect > w / h ? w / dof.aspect : h;   // the picture's height inside the frame, pixels
      u.texel.value.set(1 / w, 1 / h); u.half.value.set(hw, hh); u.near.value = camera.near; u.far.value = camera.far;
      u.focus.value = Math.max(dof.focus, f * 2); u.F.value = f;
      u.K.value = ((f * f) / dof.N / 0.01782) * picH * 0.5;   // 17.82 mm: the gate's height
      u.maxR.value = picH * 0.03;
      const a = (n = (n + 1) % 64) * 1.7; u.turn.value.set(Math.cos(a), Math.sin(a));
      tC.value = frame.texture; tD.value = frame.depthTexture;
      renderer.setRenderTarget(A); renderer.render(small, cam);
      renderer.setRenderTarget(B); renderer.render(blurred, cam);
      renderer.setRenderTarget(C); renderer.render(through, cam); renderer.setRenderTarget(null);
      return { colour: C.texture, glass: { barrel: dof.barrel ?? 0, picH: picH / h, dim: 0.16 } };
    },
  };
}
