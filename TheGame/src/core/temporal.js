// The picture built over time: how every view's picture reaches the screen (src/core/screen.js), since 2026-11-14. Drawn at fewer pixels than the screen has (the inside:
// src/core/screen.js), one frame can only be spread over the screen's pixels: soft, and what is finer than its pixels
// crawls. So every frame is drawn a part of a pixel aside from the last (the camera's window shifted: thirty-two
// places by turns), and the screen's picture is kept from frame to frame: each of its pixels takes this frame's
// pixels in by how near they fell to it, and keeps the rest from where the same point of the world lay on the screen a
// frame ago. Standing still, every screen pixel has been drawn at its own place within a few frames: the screen's own
// sharpness from a part of its pixels a frame, and its edges smooth (no target is multisampled any more).
//
// Where a point lay a frame ago is found by the camera's own movement alone (the pixel's depth, through the two
// frames' matrices): right for all that stands. What moves by itself is not followed, and is caught three ways. It says
// so itself (a mover, a blade in the wind: the fourth number of its pixels, src/world/light.js stillness): little is
// kept there. By depth: what was kept stood nearer than anything here now (it has left), or farther than everything
// here (something has come): nothing kept. By colour: the kept colour is pulled into the range of this frame's nine
// pixels round it, and trusted the less the farther it had to be pulled.
//
// The kept picture carries, beside its colour, how much it is built from (its fourth number): a pixel newly seen takes
// the frame's own colour at once and is sharp a few frames on; one long seen changes slowly, and is steady.
//
// `?notaau` (to measure against): nothing shifted and nothing kept, so the same passes show one frame spread over
// the screen's pixels by the filter alone, as before.
//
// What it costs, by the clock (frames drawn back to back, 2026-11-14; the GPU's own pass timestamps, summed, overstate
// every extra pass by milliseconds and misled a day's work): its three passes about a millisecond a frame over the
// one filter pass they replace, the finer texture reads most of another, the firming nothing to speak of.
//
// Three passes after the world's. The look (at the inside's pixels, the fewest): for each of the frame's pixels the way
// back to where it lay, how much may be kept there, and the range of colour round it. The build (at the screen's pixels,
// so it does as little as can be: a screen pixel's arithmetic is paid four and a half million times): the frame's
// colour and the kept one read, pulled, blended. The show: onto the canvas (a copy; or through the glass of the
// virtual camera's lens, whose blur came before the look: src/camera/post.js).
import * as THREE from 'three/webgpu';
import { Fn, If, float, ivec2, vec2, vec3, vec4, uv, uniform, texture, property, outputStruct, max, min, abs, floor, fract, clamp, mix, length, dot, smoothstep } from 'three/tsl';
import { note } from './gpu.js';
import { U } from './uniforms.js';

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const PLACES = Array.from({ length: 32 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);   // parts of a pixel, evenly spread whatever their number

/** off: nothing shifted and nothing kept (`?notaau`: one frame, spread by the filter). */
export function createTemporal(renderer, { off = false } = {}) {
  // sigma: how wide a screen pixel takes the frame's pixels in (screen pixels); most: how many frames' worth a pixel is
  // built from at most (moving: while it crosses the screen at `fast` pixels a frame or more, where what is kept blurs
  // by being moved); short: how much a pixel that moves by itself keeps; still: the pixels a frame a point may move by
  // itself and still be all of that; range: the kept colour's leeway, in spreads of the nine pixels (tight: while it
  // crosses the screen fast); pull: how fast trust falls with what was pulled; gap: the share by which depths must
  // differ to be another thing; bare: what a pixel with nothing kept takes of the frame anyway; sharp: how much firmer
  // its edges are drawn onto the canvas, 0 … 1 (0: a plain copy); fine: how far textures are read as finely as the screen's own pixels
  // would (0: as the inside's … 1); stale: not drawn for so long (ms), what is kept is dropped
  // (tried on one path each, stood still, forward, sideways and turning, against the picture built at the screen's own
  // pixels, 2026-11-14: these are the nearest to it)
  const K = { sigma: 0.45, most: 5, moving: 1, fast: 6, short: 0.5, still: 0.3, range: 1.6, tight: 1, pull: 5, gap: 0.05, bare: 0.05, sharp: 0.25, fine: 1, stale: 250 };
  const DIALS = ['most', 'moving', 'fast', 'short', 'range', 'tight', 'pull', 'gap', 'bare', 'sharp'];
  const u = { jit: uniform(new THREE.Vector2()), inSize: uniform(new THREE.Vector2(1, 1)), outSize: uniform(new THREE.Vector2(1, 1)), toWas: uniform(new THREE.Matrix4()), toNow: uniform(new THREE.Matrix4()), kept: uniform(0), wasOk: uniform(0), kn: uniform(1), barrel: uniform(0), picH: uniform(1), dim: uniform(0), ...Object.fromEntries(DIALS.map((n) => [n, uniform(K[n])])) };
  const tC = texture(new THREE.Texture()), tD = texture(new THREE.DepthTexture(1, 1)), tDW = texture(new THREE.DepthTexture(1, 1)), tH = texture(new THREE.Texture()), tP = texture(new THREE.Texture()), tG = texture(new THREE.Texture()), tB = texture(new THREE.Texture());
  const at = () => vec2(uv().x, float(1).sub(uv().y));   // (a target reads with its rows turned: src/core/screen.js)
  const quadOf = (m) => { m.depthTest = m.depthWrite = false; m.vertexNode = vec4(uv().mul(2).sub(1), 0, 1); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; return q; };
  const flat = (frag) => { const m = new THREE.NodeMaterial(); m.fragmentNode = frag(); return quadOf(m); };
  // a texture read between its pixels without blurring it (Catmull-Rom, five reads: the screen's own filter,
  // src/core/screen.js, without its corners). sp: the place in the texture's pixels (their middles at a half)
  const sharpRead = (t, sp, size) => {
    const t1 = floor(sp.sub(0.5)).add(0.5), f = sp.sub(t1);
    const w0 = f.mul(f.mul(float(1).sub(f.mul(0.5))).sub(0.5)), w1 = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1), w2 = f.mul(f.mul(float(2).sub(f.mul(1.5))).add(0.5)), w3 = f.mul(f).mul(f.mul(0.5).sub(0.5));
    const w12 = w1.add(w2), t0 = t1.sub(1).div(size), t3 = t1.add(2).div(size), t12 = t1.add(w2.div(w12)).div(size);
    const S = (x, y) => t.sample(vec2(x, y)).level(0), ka = w12.x.mul(w0.y), kb = w0.x.mul(w12.y), kc = w12.x.mul(w12.y), kd = w3.x.mul(w12.y), ke = w12.x.mul(w3.y);
    return max(S(t12.x, t0.y).mul(ka).add(S(t0.x, t12.y).mul(kb)).add(S(t12.x, t12.y).mul(kc)).add(S(t3.x, t12.y).mul(kd)).add(S(t12.x, t3.y).mul(ke)).div(ka.add(kb).add(kc).add(kd).add(ke)), vec4(0));
  };

  // ---- the look: for each of the frame's pixels, into two targets of the inside's size ----
  //   way:   the way back (where it lay on the screen a frame ago, taken from where it lies now), how much may be kept
  //          there (frames' worth), and how much it moves by itself
  //   range: the middle of the colours round it, and how far from that the kept colour may lie
  const way = property('vec4'), range = property('vec4'), lookMat = new THREE.NodeMaterial();
  lookMat.colorNode = Fn(() => {
    const c = floor(at().mul(u.inSize)), mid = c.add(0.5), uvOf = (x, y) => mid.add(vec2(x, y)).div(u.inSize);
    // the nine round it, in five reads: its own, and one at each of its corners (the mean of the four pixels that meet
    // there): the middle of their colours, how far the lowest and the highest lie from it, the least still of them
    const own = tC.sample(uvOf(0, 0)).level(0), lo = vec3(own.rgb).toVar(), hi = vec3(own.rgb).toVar(), sum = vec3(0).toVar(), still = float(own.a).toVar();
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) { const k = tC.sample(uvOf(x, y)).level(0); sum.addAssign(k.rgb); lo.assign(min(lo, k.rgb)); hi.assign(max(hi, k.rgb)); still.assign(min(still, k.a)); }
    // its depth and its four neighbours': the nearest and the farthest
    const d0 = tD.sample(uvOf(0, 0)).level(0).r, dN = float(d0).toVar(), dF = float(d0).toVar();
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const d = tD.sample(uvOf(x, y)).level(0).r; dN.assign(min(dN, d)); dF.assign(max(dF, d)); }
    // its depth: its own on one surface (the way back then runs smoothly from pixel to pixel, and is read between them
    // exactly: the depth of a neighbour would put what is kept a part of a pixel off, every frame the same way, and
    // smear it as the camera travels); at an edge (more than one thing among them) the nearest: an edge keeps its
    // nearer side's history
    const bN = float(1).sub(dN), bF = float(1).sub(dF), g = u.gap.add(1), edge = bN.greaterThan(bF.mul(g).add(2e-6));   // (nearness: near over distance)
    // where its point lay on the screen a frame ago, by the camera's movement (it was drawn at its middle and the shift)
    const s = mid.add(u.jit).div(u.inSize), was = u.toWas.mul(vec4(s.x.mul(2).sub(1), float(1).sub(s.y.mul(2)), edge.select(dN, d0), 1)), ws = was.xy.div(was.w), sw = vec2(ws.x.mul(0.5).add(0.5), float(0.5).sub(ws.y.mul(0.5)));
    const seen = was.w.greaterThan(0).and(sw.x.greaterThan(0)).and(sw.x.lessThan(1)).and(sw.y.greaterThan(0)).and(sw.y.lessThan(1));
    // what stood there then, brought into this frame: left (it was nearer than anything here now), or come (farther
    // than everything here)
    const now = u.toNow.mul(vec4(sw.x.mul(2).sub(1), float(1).sub(sw.y.mul(2)), tDW.sample(sw).level(0).r, 1)), a = float(1).sub(now.z.div(now.w));
    const other = a.greaterThan(bN.mul(g).add(2e-6)).or(a.mul(g).add(2e-6).lessThan(bF)).and(u.wasOk.greaterThan(0.5));
    // how much may be kept: none where it is another thing's or off the screen; little where the thing moves by itself
    // (its place a frame ago is not known); less while it crosses the screen fast
    const quick = clamp(length(s.sub(sw).mul(u.outSize)).div(u.fast), 0, 1), moves = float(1).sub(still);
    const cap = seen.and(other.not()).select(mix(mix(u.most, u.moving, quick), u.short, moves), float(0)).mul(u.kept);
    const mean = sum.mul(0.25), w3 = max(hi.sub(mean), mean.sub(lo));
    way.assign(vec4(s.sub(sw), cap, moves)); range.assign(vec4(mean, max(w3.x, max(w3.y, w3.z)).mul(mix(u.range, u.tight, quick)).add(1 / 255)));
    return vec4(0);
  })();
  lookMat.outputNode = outputStruct(way, range);
  const look = quadOf(lookMat);

  // ---- the build: a screen pixel, from the frame and from what is kept ----
  const build = flat(Fn(() => {
    const p = at(), q = p.mul(u.inSize).sub(u.jit), uvq = q.div(u.inSize);   // q: this screen pixel among the frame's pixels as they were drawn (their middles at a half)
    const G = tG.sample(uvq).level(0), B = tB.sample(uvq).level(0);
    const cur = sharpRead(tC, q, u.inSize).rgb;   // the frame's own colour here: exactly a pixel's where one fell on this screen pixel
    // the kept picture where this point lay: read between its pixels without blurring it (moved every frame, a plain
    // blend would soften it frame by frame); where the point has not moved, it is the pixel itself: one read
    const pw = p.sub(G.xy), H = vec4(0).toVar();
    If(length(G.xy.mul(u.outSize)).lessThan(0.02), () => { H.assign(tH.sample(pw).level(0)); }).Else(() => { H.assign(sharpRead(tH, pw.mul(u.outSize), u.outSize)); });
    // its colour pulled into the frame's range (towards the middle); how far it lay outside, in ranges
    const v = H.rgb.sub(B.rgb), far = max(abs(v.x), max(abs(v.y), abs(v.z))).div(B.a);
    const kept = far.greaterThan(1).select(B.rgb.add(v.div(far)), H.rgb), wH = min(H.a, G.z).div(max(far.sub(1), 0).mul(u.pull).add(1));
    // how much of the frame: by how near its pixels fell to this one (the four round it); all of it where the thing
    // moves by itself; and where nothing is kept
    const f = fract(q.sub(0.5)), sc = u.outSize.div(u.inSize), e = (t) => { const k = max(float(1).sub(t.mul(t).mul(u.kn).mul(0.25)), 0), k2 = k.mul(k); return k2.mul(k2); };   // (a bell by two squarings, as good as the exponential here)
    const near = e(f.x.mul(sc.x)).add(e(float(1).sub(f.x).mul(sc.x))).mul(e(f.y.mul(sc.y)).add(e(float(1).sub(f.y).mul(sc.y))));
    const wC = max(min(near, 1), G.w).add(clamp(float(1).sub(wH), 0, 1).mul(u.bare));
    return vec4(kept.mul(wH).add(cur.mul(wC)).div(wH.add(wC)), min(wH.add(wC), u.most));
  }));

  // ---- the show: onto the canvas, its edges drawn a little firmer (a pixel against its four neighbours, never past
  // the lightest or darkest of them: no halo): what moving the kept picture every frame has softened comes back ----
  const firm = flat(Fn(() => {
    const c = at().mul(u.outSize), px = (x, y) => tP.sample(c.add(vec2(x, y)).div(u.outSize)).level(0).rgb;
    const e = px(0, 0), n = px(0, -1), w = px(-1, 0), o = px(1, 0), d = px(0, 1), lo = min(min(n, w), min(o, d)), hi = max(max(n, w), max(o, d));
    const a = min(lo, e).div(hi.mul(4).max(1e-4)).negate(), b = float(1).sub(max(hi, e)).div(lo.mul(4).sub(4).min(-1e-4)), l3 = max(a, b);
    const lobe = clamp(max(l3.x, max(l3.y, l3.z)), -0.1875, 0).mul(u.sharp);
    return vec4(n.add(w).add(o).add(d).mul(lobe).add(e).div(lobe.mul(4).add(1)), 1);
  }));
  const copy = flat(Fn(() => vec4(tP.sample(at()).level(0).rgb, 1)));
  // through the glass of the virtual camera's lens (src/camera/post.js says its numbers): straight lines near the frame's
  // edge bow outward a little (barrel, mostly across), and a little light is lost toward the corners
  const glassed = flat(Fn(() => {
    const v0 = at(), wide = vec2(2, float(2).div(u.picH)), qq = v0.sub(0.5).mul(wide), r2 = qq.x.mul(qq.x).add(qq.y.mul(qq.y).mul(0.35));
    const p = v0.sub(0.5).mul(u.barrel.mul(r2).add(1)).div(u.barrel.mul(1.35).add(1)).add(0.5), e = p.sub(0.5).mul(wide);
    return vec4(tP.sample(p).level(0).rgb.mul(float(1).sub(smoothstep(0.55, 1.45, dot(e, e)).mul(u.dim))), 1);
  }));

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), size = new THREE.Vector2();
  const proj = new THREE.Matrix4(), projInv = new THREE.Matrix4(), view = new THREE.Matrix4(), world = new THREE.Matrix4(), projWas = new THREE.Matrix4(), viewWas = new THREE.Matrix4(), rel = new THREE.Matrix4();
  const hist = [null, null], opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
  let guide = null, turn = 0, k = 0, fresh = true, lastAt = 0;
  return {
    K,
    /** Its numbers, changed while it runs (for tuning: a page's own tools). */
    tune(o) { Object.assign(K, o); for (const n of DIALS) u[n].value = K[n]; },
    /** Forget what is kept: the next frame stands alone (a cut). */
    cut() { fresh = true; },
    /** Before the world is drawn into a target of w by h: the camera's window shifted by this frame's part of a pixel. */
    begin(camera, w, h) {
      proj.copy(camera.projectionMatrix); projInv.copy(camera.projectionMatrixInverse); view.copy(camera.matrixWorldInverse); world.copy(camera.matrixWorld);
      const [jx, jy] = off ? [0, 0] : PLACES[(k = (k + 1) % PLACES.length)];
      u.jit.value.set(jx, jy); if (!off) camera.setViewOffset(w, h, jx, jy, w, h); U.uMarks.value = 1;
      // how fast the wind moves what sways, as screen pixels a frame for a metre of swing at a metre from the eye, over
      // what counts as still: its gusts' depth and how fast they pass (src/world/weather/wind.js)
      const W = U.uWind.value, rate = W.z * (0.25 + 0.35 * W.z) * ((2 * Math.PI * W.w) / 38) * (1 + 0.6 * W.z * W.z);
      U.uMark.value = (rate * camera.projectionMatrix.elements[5] * renderer.getDrawingBufferSize(size).y * 0.5) / (60 * K.still);
      // textures read as finely as the screen's pixels would read them, not the inside's: what that leaves crawling in one
      // frame, the frames together take in (src/terrain/material.js, src/scatter/stress.js)
      U.uFine.value = off ? 1 : 1 + (Math.min(1, w / size.x) - 1) * K.fine;
    },
    /** After it: the camera as it was, and nothing marked or read finer by what is drawn otherwise (the lens's own pass). */
    end(camera) { if (!off) camera.clearViewOffset(); U.uMarks.value = 0; U.uMark.value = 0; U.uFine.value = 1; },
    /** The screen's picture from the frame just drawn (`now`: its colour and depth) and what is kept (`was`: the
        frame before's target, for its depth; none at the first), laid on the canvas. through: what the lens made of
        the frame ({ colour: its colour blurred, glass: { barrel, picH, dim } }: src/camera/post.js), or none. */
    resolve(now, was, through = null) {
      renderer.getDrawingBufferSize(size);
      for (let i = 0; i < 2; i++) if (!hist[i] || hist[i].width !== size.x || hist[i].height !== size.y) {
        hist[i]?.dispose(); fresh = true; hist[i] = new THREE.RenderTarget(size.x, size.y, opts);
        if (i) note('the picture kept over time (two targets)', 2 * size.x * size.y * 8, 0);
      }
      if (!guide || guide.width !== now.width || guide.height !== now.height) {
        guide?.dispose(); guide = new THREE.RenderTarget(now.width, now.height, { ...opts, count: 2 });
        tG.value = guide.textures[0]; tB.value = guide.textures[1]; note("the frame's ways back and ranges (two targets)", 2 * now.width * now.height * 8, 0);
      }
      const t = performance.now(); if (t - lastAt > K.stale) fresh = true; lastAt = t;   // (not drawn for a while: a film, the lens's own pass, a hidden page)
      // this frame's screen to the last one's, and back: through both cameras, the far numbers of the world's places
      // taken out before anything is rounded (the two views' product is their difference)
      rel.multiplyMatrices(viewWas, world); u.toWas.value.multiplyMatrices(projWas, rel).multiply(projInv); u.toNow.value.copy(u.toWas.value).invert();
      u.inSize.value.set(now.width, now.height); u.outSize.value.copy(size); u.kn.value = 1 / (2 * K.sigma * K.sigma);
      u.kept.value = fresh || off ? 0 : 1; u.wasOk.value = was && !fresh ? 1 : 0;
      tC.value = through ? through.colour : now.texture; tD.value = now.depthTexture; tDW.value = (was ?? now).depthTexture; tH.value = hist[1 - turn].texture;
      renderer.setRenderTarget(guide); renderer.render(look, cam);
      renderer.setRenderTarget(hist[turn]); renderer.render(build, cam); renderer.setRenderTarget(null);
      tP.value = hist[turn].texture;
      if (through?.glass) { u.barrel.value = through.glass.barrel; u.picH.value = through.glass.picH; u.dim.value = through.glass.dim; }
      renderer.render(through?.glass ? glassed : K.sharp > 0 ? firm : copy, cam);
      turn = 1 - turn; fresh = false; projWas.copy(proj); viewWas.copy(view);
    },
  };
}
