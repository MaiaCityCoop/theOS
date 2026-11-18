// The upscale (intent 0038): how every view's picture reaches the screen (src/core/screen.js). The world is drawn at
// the governor's pixels (the inside: fewer than the screen has, src/core/governor.js), and one pass brings it up to the
// screen's own (4K on a 4K screen), builds it over time, and lays it on the canvas: it writes the picture kept for the
// next frame and the canvas together, and puts the screen's curve on the light's numbers there, once (no material does
// any more: src/world/light.js toScreen). Its ideas are FSR 2's (AMD, MIT: jitter phases, a box in YCoCg, locks, a
// reactive mask, motion taken from the nearest depth) and UE TSR's (thin foliage kept); it is a port of neither. At 4K
// a screen pixel is paid eight million times a frame: so it reads the fewest drawn pixels that make the picture (the
// two by two round its point), keeps its picture in eight bits a number, and reckons only what is the pixel's own: what
// the whole frame shares is reckoned once a frame, on the CPU. (On a base M2 its 23 bytes a pixel take about 1.9 ms of
// the 6 it measured; the rest is arithmetic, up to a third of which was dividing by numbers the frame shares or lane by
// lane through a colour: intent 0038, the upscale at its root cost.)
//
//   the frame   drawn a part of a pixel aside from the last, by turns through ⌈8·s²⌉ places for s screen pixels a drawn
//               one each way (so a drawn pixel's middle falls near every screen pixel within a few frames)
//   the way     for each screen pixel, where its point lay on the screen a frame ago: the prepass's motion (src/core/
//   back        pass.js: the camera's and the point's own, the wind's, growing), read at the nearest of the two by two
//               drawn pixels round it (their depths in one read), so an edge keeps its nearer side's motion; where none
//               was written (the sky, the water) the camera's own movement, through the depth
//   the kept    the picture kept, read where the point lay (sharply, between its pixels: Catmull-Rom); none where that was
//               off the screen, or where something else stood then (its depth then, brought into this frame: nearer than
//               anything here now, it has left; farther than everything here, something has come)
//   the box     the four, in YCoCg of a perceptual curve (c / (1 + its largest part)): the kept colour is pulled into
//               their spread (their mean, 1.25 deviations either way) and trusted the less the farther it had to be
//               pulled. Wider for what is thin (a leaf's card, a blade: the prepass says so), and where a pixel is locked:
//               where something thin stands among unlike pixels (a needle, a blade's edge against what is behind it), held
//               a few frames, so what the jitter shows one frame and not the next does not flicker
//   the frame's the four as the colour at this screen pixel, each taken in by how near it fell to it (a bell a little
//   own         under half a screen pixel wide); all of it where the frame says nothing kept may be trusted there (its
//               fourth number, the reactive mask: the fire, the smoke, a mover)
//   the screen  the screen's curve, and the lens's glass where the camera brings one (a little barrel, a little light lost
//               at the corners): the picture is kept in the glass's own frame, so the glass costs no pass of its own
//
// The kept picture carries, besides its colour, how much it is built from (frames' worth) and how long a pixel stays
// locked: a pixel newly seen takes the frame's own colour at once and is sharp a few frames on; one long seen changes
// slowly, and is steady.
import * as THREE from 'three/webgpu';
import { Fn, If, float, vec2, vec3, vec4, ivec2, uv, uniform, texture, textureStore, outputStruct, property, screenCoordinate, max, min, abs, floor, clamp, mix, length, smoothstep, sqrt } from 'three/tsl';
import { note } from './gpu.js';
import { U } from './uniforms.js';
import { display, ign } from '../world/light.js';
import { ERROR_PX } from '../detail/error.js';

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
/** The places a frame is drawn at by turns (parts of a drawn pixel, -0.5 … 0.5), n of them: evenly spread however many. */
const placesOf = (n) => Array.from({ length: n }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

/** Let a fragment shader write a storage texture (WebGPU allows it, write-only, in any format a storage texture may
    have). three r187 builds a storage texture in a fragment shader read-only unless it is read-write, which WebGPU's
    core allows for one-channel formats only; so its WGSL builder is told, once, that one written in a fragment shader is
    written. False where there is no such builder (WebGL 2), or it has changed. */
function writesInFragment(renderer) {
  const proto = renderer.backend?.isWebGPUBackend ? Object.getPrototypeOf(renderer.backend.createNodeBuilder({}, renderer)) : null;
  if (typeof proto?.getNodeAccess !== 'function') return false;
  if (!proto.writesInFragment) {
    const was = proto.getNodeAccess;
    proto.getNodeAccess = function (node, stage) { return stage === 'fragment' && node.isStorageTextureNode === true && node.access === 'writeOnly' ? 'writeOnly' : was.call(this, node, stage); };
    proto.writesInFragment = true;
  }
  return true;
}

export function createTemporal(renderer) {
  // (WebGPU writes the kept picture from the very pass that draws the canvas; WebGL 2 has no storage textures, so there
  // the pass draws both into a target, and the canvas is copied from it)
  const STORE = writesInFragment(renderer);
  // sigma: how wide a screen pixel takes the frame's pixels in (screen pixels); most: how many frames' worth a pixel is
  // built from at most (moving: while it crosses the screen at `fast` pixels a frame or more, where what is kept blurs by
  // being moved); range: the box's half width in deviations (thin: for what the prepass says is thin, or a locked
  // pixel; tight: while it crosses the screen fast); pull: how fast trust falls with what was pulled; gap: the share by
  // which depths must differ to be another thing; bare: what a pixel with nothing kept takes of the frame anyway; fine:
  // how far textures are read as finely as the screen's own pixels would (0: as the inside's … 1); stale: not drawn for so
  // long (ms), what is kept is dropped; lock: frames a thin pixel stays locked; alike: how near four pixels' lightness
  // must be to make a two by two of like pixels (of the lightest's)
  const K = { sigma: 0.45, most: 5, moving: 1, fast: 6, range: 1.25, thin: 2, tight: 1, pull: 5, gap: 0.05, bare: 0.05, fine: 1, stale: 250, lock: 3, alike: 0.1 };
  // the finest change the kept picture holds: half a step of its eight bits. The box is never narrower; what was kept
  // has left once it is under it (settles); and a point that moved less than this much of a screen pixel moves no edge
  // in it by a step, so it reads its own pixel as it is (and a sharp read between pixels is for farther than that)
  const HALF = 1 / 510;
  // What is the same for every pixel of a frame is reckoned once a frame (resolve, below), and a pixel only multiplies
  // by it: on Apple's GPU a division costs what six to ten multiplications do, and the pass divided 63 times a pixel
  // where nothing moved, 28 of them by numbers the whole frame shares (the sizes, the glass's) and 19 more lane by lane
  // through a colour. A pixel now divides only by its own numbers, once each (a colour: times one reciprocal): 13 times.
  // rIn, rOut: a drawn and a screen pixel's share of the picture; sc: screen pixels a drawn one; kq: the bell's width;
  // gs, gk: the glass's measure and its scale, gsWas, gWas last frame's (for the way back); same: the glass is the one it
  // was; rFast: 1 / fast
  const u = { jit: uniform(new THREE.Vector2()), inSize: uniform(new THREE.Vector2(1, 1)), rIn: uniform(new THREE.Vector2(1, 1)), outSize: uniform(new THREE.Vector2(1, 1)), rOut: uniform(new THREE.Vector2(1, 1)), sc: uniform(new THREE.Vector2(1, 1)), kq: uniform(1), toWas: uniform(new THREE.Matrix4()), toNow: uniform(new THREE.Matrix4()), kept: uniform(0), wasOk: uniform(0), barrel: uniform(0), gs: uniform(new THREE.Vector2(2, 2)), gk: uniform(1), dim: uniform(0), barrelWas: uniform(0), gsWas: uniform(new THREE.Vector2(2, 2)), gWas: uniform(1), same: uniform(1), rFast: uniform(1 / K.fast) };
  for (const k of ['most', 'moving', 'range', 'thin', 'tight', 'pull', 'gap', 'bare', 'lock', 'alike']) u[k] = uniform(K[k]);
  const tC = texture(new THREE.Texture()), tD = texture(new THREE.DepthTexture(1, 1)), tDW = texture(new THREE.DepthTexture(1, 1)), tM = texture(new THREE.Texture());
  const at = () => vec2(uv().x, float(1).sub(uv().y));   // (a target reads with its rows turned)
  const max3 = (c) => max(c.x, max(c.y, c.z));
  const toP = (c0) => { const c = max(c0, vec3(0)); return c.mul(float(1).div(max3(c).add(1))); }, fromP = (p) => p.mul(float(1).div(float(1).sub(min(max3(p), 0.999))));   // (the perceptual curve, and back; no light is less than none: a colour below 0, or not a number, is taken as black, never divided by nothing)
  const toY = (c) => vec3(c.x.add(c.z).mul(0.25).add(c.y.mul(0.5)), c.x.sub(c.z).mul(0.5), c.y.mul(0.5).sub(c.x.add(c.z).mul(0.25)));   // YCoCg
  const fromY = (y) => vec3(y.x.add(y.y).sub(y.z), y.x.add(y.z), y.x.sub(y.y).sub(y.z));
  // the glass: where on the frame (its picture's widths) a screen pixel at p shows, with this barrel; and where on the
  // screen a point of the frame showed, through last frame's: on the same line from the middle, μ of the way, where
  // μ (1 + b μ² R) = 1 (R: how far out the point lies, in the glass's measure), by Newton's steps from 1 / (1 + b R).
  // Each step squares the error, and two leave it under HALF of a screen pixel for every glass the lenses bring (the
  // walker's to ?glass=3, a film's at any letterbox: at the walker's own 0.045, 2e-8 px; the three steps of the way
  // taken before left 0.018 px, and a screen pixel that had not moved read the kept picture that far off its middle)
  const r2Of = (q) => q.x.mul(q.x).add(q.y.mul(q.y).mul(0.35));
  const glassTo = (p) => { const d = p.sub(0.5); return d.mul(u.barrel.mul(r2Of(d.mul(u.gs))).add(1).mul(u.gk)).add(0.5); };
  const glassBack = (f) => {
    const g = f.sub(0.5).mul(u.gWas), k = u.barrelWas.mul(r2Of(g.mul(u.gsWas)));
    const step = (m) => { const m2 = m.mul(m); return m.sub(k.mul(m2).add(1).mul(m).sub(1).div(k.mul(m2).mul(3).add(1))); };
    return g.mul(step(step(float(1).div(k.add(1))))).add(0.5);
  };
  // a texture read between its pixels without blurring it (Catmull-Rom, five reads). sp: the place in its pixels
  const sharpRead = (t, sp) => {
    const t1 = floor(sp.sub(0.5)).add(0.5), f = sp.sub(t1);
    const w0 = f.mul(f.mul(float(1).sub(f.mul(0.5))).sub(0.5)), w1 = f.mul(f).mul(f.mul(1.5).sub(2.5)).add(1), w2 = f.mul(f.mul(float(2).sub(f.mul(1.5))).add(0.5)), w3 = f.mul(f).mul(f.mul(0.5).sub(0.5));
    const w12 = w1.add(w2), t0 = t1.sub(1).mul(u.rOut), t3 = t1.add(2).mul(u.rOut), t12 = t1.add(w2.div(w12)).mul(u.rOut);
    const S = (x, y) => t.sample(vec2(x, y)).level(0), ka = w12.x.mul(w0.y), kb = w0.x.mul(w12.y), kc = w12.x.mul(w12.y), kd = w3.x.mul(w12.y), ke = w12.x.mul(w3.y);
    return max(S(t12.x, t0.y).mul(ka).add(S(t0.x, t12.y).mul(kb)).add(S(t12.x, t12.y).mul(kc)).add(S(t3.x, t12.y).mul(kd)).add(S(t12.x, t3.y).mul(ke)).mul(float(1).div(ka.add(kb).add(kc).add(kd).add(ke))), vec4(0));
  };
  const bell = (t) => { const k = max(float(1).sub(t.mul(t).mul(u.kq)), 0), k2 = k.mul(k); return k2.mul(k2); };   // (as good as the exponential here)

  // ---- the pass: a screen pixel, kept (hist: the colour, perceptual; frames' worth + 8 × frames locked) and shown ----
  // (what it reads of the frame: the two by two drawn pixels round the screen pixel's point, the four that a drawn
  // picture brought up to the screen is made of: their colours, their depths in one read, the motion at the nearest)
  const pass = (tH) => {
    const P = at();
    // the frame's point this pixel shows (through the glass), and among the frame's pixels as they were drawn
    const F = vec2(P).toVar(); If(u.barrel.greaterThan(0), () => { F.assign(glassTo(P)); });
    const q = F.mul(u.inSize).sub(u.jit), b = floor(q.sub(0.5)), f = q.sub(b).sub(0.5);
    // their depths, in one read: the nearest and the farthest, and which is the nearest
    const D = tD.sample(b.add(1).mul(u.rIn)).gather(), nearest = min(min(D.x, D.y), min(D.z, D.w)), dF = max(max(D.x, D.y), max(D.z, D.w));
    const oN = D.w.equal(nearest).select(vec2(0, 0), D.z.equal(nearest).select(vec2(1, 0), D.x.equal(nearest).select(vec2(0, 1), vec2(1, 1))));   // (textureGather's order: (0,1) (1,1) (1,0) (0,0))
    // their colours (perceptual, YCoCg), each taken in by how near it fell to this screen pixel (in the screen's pixels)
    const m1 = vec3(0).toVar(), m2 = vec3(0).toVar(), lo = vec3(1e4).toVar(), hi = vec3(-1e4).toVar(), cur = vec3(0).toVar(), lin = vec3(0).toVar(), near = float(0).toVar(), trust = float(1).toVar();
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const s = tC.sample(b.add(vec2(i + 0.5, j + 0.5)).mul(u.rIn)).level(0), p = toP(s.rgb), y = toY(p);
      m1.addAssign(y); m2.addAssign(y.mul(y)); lo.assign(min(lo, p)); hi.assign(max(hi, p)); trust.assign(min(trust, s.a));
      const w = bell(f.x.sub(i).mul(u.sc.x)).mul(bell(f.y.sub(j).mul(u.sc.y))); cur.addAssign(p.mul(w)); near.addAssign(w);
      lin.addAssign(p.mul((i ? f.x : float(1).sub(f.x)).mul(j ? f.y : float(1).sub(f.y))));   // (and read between them, for where none fell near)
    }
    // (the frame's own colour: the four, each by a weight none below nothing, so it lies within their spread as it is)
    const mean = m1.mul(0.25), dev = sqrt(max(m2.mul(0.25).sub(mean.mul(mean)), 0)), own = cur.add(lin.mul(1e-3)).mul(float(1).div(near.add(1e-3)));
    // the way back: the prepass's motion at the nearest; where none was written, the camera's, through the depth
    const tN = b.add(oN).add(0.5), sN = tN.add(u.jit).mul(u.rIn), M = tM.sample(tN.mul(u.rIn)).level(0), written = M.z.greaterThan(0.5);
    const back = u.toWas.mul(vec4(sN.x.mul(2).sub(1), float(1).sub(sN.y.mul(2)), nearest, 1)), way = written.select(M.xy, sN.sub(back.xy.mul(float(1).div(back.w)).mul(vec2(0.5, -0.5)).add(0.5)));
    const was = F.sub(way), slim = written.select(clamp(M.z.sub(1), 0, 1), float(0));
    const seen = back.w.greaterThan(0).or(written).and(was.x.greaterThan(0)).and(was.x.lessThan(1)).and(was.y.greaterThan(0)).and(was.y.lessThan(1));
    // what stood there then, brought into this frame: it has left (nearer than anything here now), or something has come
    // (farther than everything here). (The depth then of the one drawn pixel the point lay in, read as it is: its place
    // not turned by the texture's own matrix, which three would apply to a read by place)
    const bN = float(1).sub(nearest), bF = float(1).sub(dF), g = u.gap.add(1);
    const then = u.toNow.mul(vec4(was.x.mul(2).sub(1), float(1).sub(was.y.mul(2)), tDW.load(ivec2(clamp(was.mul(u.inSize), vec2(0), u.inSize.sub(1)))).setUpdateMatrix(false).r, 1)), a = float(1).sub(then.z.div(then.w));
    const other = a.greaterThan(bN.mul(g).add(2e-6)).or(a.mul(g).add(2e-6).lessThan(bF)).and(u.wasOk.greaterThan(0.5));
    // the kept picture where the point lay: the screen pixel that showed it, through last frame's glass (the pixel itself
    // where the point has not moved and the glass is the one it was), read sharply between its pixels; its worth and lock
    // those of the one pixel it lies in (numbers, not to be read between pixels)
    const wp = way.mul(u.outSize), hp = vec2(P).toVar();
    If(u.same.lessThan(0.5).or(wp.dot(wp).greaterThanEqual(HALF * HALF)), () => { hp.assign(was); If(u.barrelWas.greaterThan(0), () => { hp.assign(glassBack(was)); }); });
    const H = vec4(0).toVar(), dp = hp.sub(P).mul(u.outSize);
    If(dp.dot(dp).lessThan(HALF * HALF), () => { H.assign(tH.sample(hp).level(0)); }).Else(() => { H.assign(vec4(sharpRead(tH, hp.mul(u.outSize)).rgb, tH.sample(floor(hp.mul(u.outSize)).add(0.5).mul(u.rOut)).level(0).a)); });
    const kept = u.kept.greaterThan(0.5).and(seen).and(other.not()), A = H.a.mul(255), locked = floor(A.mul(1 / 64).add(1e-3)), worth = A.sub(locked.mul(64)).mul(1 / 12), Hp = H.rgb.mul(H.rgb);   // (kept as eight bits: below)
    // pulled into the box: their spread, wider for what is thin (the prepass says) and where it is locked, tighter while
    // it crosses the screen fast
    const quick = clamp(length(wp).mul(u.rFast), 0, 1), wideBy = max(slim, kept.and(locked.greaterThan(0.5)).select(float(1), float(0)));
    const ext = dev.mul(mix(mix(u.range, u.tight, quick), u.thin, wideBy)).add(HALF), v = toY(clamp(Hp, 0, 1)).sub(mean);
    const far = max(abs(v.x).div(ext.x), max(abs(v.y).div(ext.y), abs(v.z).div(ext.z))), pulled = fromY(far.greaterThan(1).select(mean.add(v.mul(float(1).div(far))), mean.add(v)));
    // how much of each: of the kept, its worth, capped while it moves fast and where the frame says it may not be trusted,
    // and the less the farther it was pulled; of the frame, by how near its pixels fell to this one, all of it where
    // nothing kept may be trusted, and a little more where little is kept
    const cap = mix(u.most, u.moving, quick).mul(trust), wH = kept.select(min(worth, cap).div(max(far.sub(1), 0).mul(u.pull).add(1)), float(0));
    const wC = max(min(near, 1), float(1).sub(trust)).add(clamp(float(1).sub(wH), 0, 1).mul(u.bare));
    const col = clamp(pulled.mul(wH).add(own.mul(wC)).mul(float(1).div(wH.add(wC))), 0, 1);
    // locked a few frames where something thin stands among unlike pixels (a needle, a blade's edge against what is
    // behind it); counting down while it stays put; let go where nothing is kept, or it had to be pulled far
    const unlike = max3(hi.sub(lo)).greaterThan(max3(hi).mul(u.alike).add(2e-3)), lock = slim.greaterThan(0.5).and(unlike).select(u.lock, kept.and(far.lessThan(3)).select(max(locked.sub(1), 0), float(0)));
    // kept in eight bits a number: the colour's square root (as fine in the dark as the screen is), rounded up or down
    // by a noise that changes every frame, so nothing sticks half a step off; the worth in twelfths and the lock above it
    const hist = vec4(sqrt(col).add(ign(screenCoordinate.xy.add(u.jit.mul(97))).sub(0.5).mul(1 / 255)), lock.mul(64).add(floor(min(wH.add(wC), u.most).mul(12).add(0.5))).mul(1 / 255));
    // shown: the screen's curve, and the light the glass loses toward the corners
    const e = F.sub(0.5).mul(u.gs), show = vec4(display(fromP(col)).mul(float(1).sub(smoothstep(0.55, 1.45, e.dot(e)).mul(u.dim))), 1);
    return { hist, show };
  };
  const quadOf = (m) => { m.depthTest = m.depthWrite = false; m.vertexNode = vec4(uv().mul(2).sub(1), 0, 1); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; return q; };
  // the kept picture, two of it by turns: read from one, written to the other. WebGPU: two storage textures and a pass
  // each way (each with its own two bound); WebGL 2: two targets of two (the kept, the shown), and a copy to the canvas
  const hist = STORE ? [0, 1].map(() => new THREE.StorageTexture(1, 1)) : [0, 1].map(() => new THREE.RenderTarget(1, 1, { count: 2, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));   // (eight bits a number: half the bytes a screen pixel moves, the most of what the pass costs)
  const tHW = STORE ? null : texture(new THREE.Texture()), tShow = STORE ? null : texture(new THREE.Texture());
  const quads = STORE ? [0, 1].map((k) => {   // quads[k]: writes hist[k], reads the other
    const m = new THREE.NodeMaterial();
    m.fragmentNode = Fn(() => { const R = pass(texture(hist[1 - k])); textureStore(hist[k], ivec2(floor(screenCoordinate.xy)), R.hist); return R.show; })();
    return quadOf(m);
  }) : [(() => {   // (two outputs: the kept and the shown, given to the material's output as properties)
    const m = new THREE.NodeMaterial(), kept = property('vec4'), shown = property('vec4');
    m.colorNode = Fn(() => { const R = pass(tHW); kept.assign(R.hist); shown.assign(R.show); return vec4(0); })();
    m.outputNode = outputStruct(kept, shown);
    return quadOf(m);
  })()];
  const copy = STORE ? null : (() => { const m = new THREE.NodeMaterial(); m.fragmentNode = Fn(() => vec4(tShow.sample(at()).level(0).rgb, 1))(); return quadOf(m); })();

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), size = new THREE.Vector2();
  const proj = new THREE.Matrix4(), projInv = new THREE.Matrix4(), view = new THREE.Matrix4(), world = new THREE.Matrix4(), projWas = new THREE.Matrix4(), viewWas = new THREE.Matrix4(), rel = new THREE.Matrix4();
  let places = placesOf(8), turn = 0, k = 0, fresh = true, lastAt = 0, age = 0, timeWas = null, sizeKept = '', glassWas = [0, 1], tile = null;
  /** The places for a frame drawn at w × h onto the screen: ⌈8·s²⌉ of them for s screen pixels a drawn one, each way
      (FSR 2's count); a dial turned below its rest as many more as it is a fraction of a pixel drawn (?truth's quarter: 32,
      its frames slow and it to be supersampled). */
  const placesFor = (w, h) => { renderer.getDrawingBufferSize(size); const s = Math.max(size.x / w, size.y / h, 1), n = Math.ceil((8 * s * s) / Math.min(1, ERROR_PX()) - 1e-6); if (n !== places.length) { places = placesOf(n); k %= n; } };

  // ---- resolve's stages, in its order, once a frame ----
  /** The kept picture at the screen's size: made again where the size changed, and what was kept let go. */
  const keep = () => {
    const key = `${size.x}x${size.y}`;
    if (key === sizeKept) return;
    sizeKept = key; fresh = true;
    for (const h of hist) h.setSize(size.x, size.y);
    note('the picture kept over time (two of it)', 2 * size.x * size.y * (STORE ? 4 : 8), 0, 'upscale/post');
  };
  /** This frame's screen to the last one's, and back: through both cameras, the far numbers of the world's places taken
      out before anything is rounded (the two views' product is their difference). */
  const reproject = () => { rel.multiplyMatrices(viewWas, world); u.toWas.value.multiplyMatrices(projWas, rel).multiply(projInv); u.toNow.value.copy(u.toWas.value).invert(); };
  /** The frame's numbers, reckoned here once: the sizes and their reciprocals, the bell's width, whether anything is
      kept, and whether last frame's depth may be read. */
  const sizes = (depth, depthWas) => {
    u.inSize.value.set(depth.image.width, depth.image.height); u.rIn.value.set(1 / depth.image.width, 1 / depth.image.height);
    u.outSize.value.copy(size); u.rOut.value.set(1 / size.x, 1 / size.y); u.sc.value.copy(size).divide(u.inSize.value); u.kq.value = 1 / (8 * K.sigma * K.sigma);
    u.kept.value = fresh ? 0 : 1; u.wasOk.value = depthWas && !fresh && depthWas.image.width === depth.image.width && depthWas.image.height === depth.image.height ? 1 : 0;
  };
  /** The glass now and last frame's (after a cut, this frame's). */
  const lens = (glass) => {
    const b = glass?.barrel ?? 0, ph = glass?.picH ?? 1, [bW, phW] = fresh ? [b, ph] : glassWas; glassWas = [b, ph];
    u.barrel.value = b; u.gk.value = 1 / (1 + 1.35 * b); u.gs.value.set(2, 2 / ph); u.dim.value = glass?.dim ?? 0;
    u.barrelWas.value = bW; u.gWas.value = 1 + 1.35 * bW; u.gsWas.value.set(2, 2 / phW); u.same.value = bW === b && phW === ph ? 1 : 0;
  };
  /** The pass drawn: on WebGPU straight onto the canvas (it writes the kept picture itself); on WebGL 2 into the kept and
      the shown, and the shown copied onto the canvas. */
  const draw = (colour, depth, motion, depthWas) => {
    tC.value = colour; tD.value = depth; tDW.value = depthWas ?? depth; tM.value = motion;
    if (STORE) { renderer.setRenderTarget(null); renderer.render(quads[turn], cam); return; }
    tHW.value = hist[1 - turn].textures[0];
    renderer.setRenderTarget(hist[turn]); renderer.render(quads[0], cam); renderer.setRenderTarget(null);
    tShow.value = hist[turn].textures[1]; renderer.render(copy, cam);
  };
  return {
    K,
    /** Frames the kept picture has been built over since it was last let go (0: this frame stood alone). */
    get age() { return age; },
    /** Which of its places of a pixel the last frame was drawn at; set, the next frame is drawn at the one after it (the
        gate draws the truth's frame at the place the game's was: tools/gate/motion.js). */
    get place() { return k; },
    set place(v) { k = ((Math.round(v) % places.length) + places.length) % places.length; },
    /** How many frames in a row, nothing changed, until what was kept before has left the picture (src/core/settle.js):
        a frame takes in at least 1 / (most + 1) of a screen pixel where one of its own pixels falls near it, so after
        so many such frames what was there is under half a step of eight bits (HALF); drawn at fewer pixels than the
        screen has, one falls near a screen pixel once in as many frames as the screen has pixels for each drawn one;
        and every place a frame is drawn at has come round. */
    get settles() { const a = (u.outSize.value.x * u.outSize.value.y) / Math.max(1, u.inSize.value.x * u.inSize.value.y); return Math.max(places.length, Math.ceil(-Math.log(HALF) / Math.log(1 + 1 / K.most)) * Math.max(1, Math.ceil(a - 1e-6))); },
    /** Forget what is kept: the next frame stands alone (a cut). */
    cut() { fresh = true; },
    /** Before the world is drawn into a target of w by h: the camera's window shifted by this frame's part of a pixel,
        and what the prepass asks of where things were a frame ago (src/core/pass.js). */
    begin(camera, w, h) {
      proj.copy(camera.projectionMatrix); projInv.copy(camera.projectionMatrixInverse); view.copy(camera.matrixWorldInverse); world.copy(camera.matrixWorld);
      const t = performance.now(); if (t - lastAt > K.stale && ERROR_PX() >= 1) fresh = true; lastAt = t;   // (not drawn for a while: a film, a hidden page; ?truth's frames are slow, src/detail/measure.js, and build on)
      placesFor(w, h);
      const [jx, jy] = places[(k = (k + 1) % places.length)];
      // (the camera set to show a tile of a larger picture, camera.view: ?truth drawn tile by tile, tools/gate.js; this
      // frame's part of a pixel is then a part of the tile's)
      tile = camera.view?.enabled ? { ...camera.view } : null;
      u.jit.value.set(jx, jy);
      if (tile) camera.setViewOffset(tile.fullWidth, tile.fullHeight, tile.offsetX + (jx * tile.width) / w, tile.offsetY + (jy * tile.height) / h, tile.width, tile.height);
      else camera.setViewOffset(w, h, jx, jy, w, h);
      // (a frame ago: that frame's camera, unshifted, and its clock; the first frame, and after a cut, this one's)
      if (fresh || timeWas === null) { projWas.copy(proj); viewWas.copy(view); timeWas = U.uTime.value; }
      U.uWas.value.multiplyMatrices(projWas, viewWas); U.uTimeWas.value = timeWas; U.uJit.value.set(jx, jy); U.uIn.value.set(w, h);
      U.uDither.value = (U.uDither.value + 0.6180339887) % 1;   // (a frame's own number for what is cut by a noise: the golden ratio's steps, evenly over any run of frames)
      // textures read as finely as the screen's pixels would read them, not the inside's: what that leaves crawling in one
      // frame, the frames together take in (src/terrain/material.js, src/scatter/stress.js)
      U.uFine.value = 1 + (Math.min(1, w / size.x) - 1) * K.fine;
    },
    /** After it: the camera as it was, and nothing read finer by what is drawn otherwise. */
    end(camera) { if (tile) camera.setViewOffset(tile.fullWidth, tile.fullHeight, tile.offsetX, tile.offsetY, tile.width, tile.height); else camera.clearViewOffset(); U.uFine.value = 1; },
    /** The screen's picture from the frame just drawn, laid on the canvas: { colour (the light's numbers; its fourth
        number how far what is kept may be trusted), depth, motion (the prepass's), depthWas (the frame before's depth;
        none at the first), glass ({ barrel, picH, dim }: the lens's, or none) }. */
    resolve({ colour, depth, motion, depthWas = null, glass = null }) {
      renderer.getDrawingBufferSize(size);
      keep(); reproject(); sizes(depth, depthWas); lens(glass); draw(colour, depth, motion, depthWas);
      age = fresh ? 0 : age + 1; turn = 1 - turn; fresh = false; projWas.copy(proj); viewWas.copy(view); timeWas = U.uTime.value;
    },
  };
}
