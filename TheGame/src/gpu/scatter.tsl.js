// What stands on the land, in TSL (intent 0008, step 2): src/scatter's ground texture, its tiers, the grass and the
// rocks as node materials, number for number. A tier is one instanced draw: its instances are the cells of the patches
// the frustum touches in its band; what stands in a cell is hashed in the vertex stage, so choosing them builds nothing.
// Not here yet: the library's sandbox and stage (the WebGPU page draws the world only), shadows.
import * as THREE from 'three/webgpu';
import { Fn, float, int, uint, ivec2, vec2, vec3, vec4, uniform, uniformArray, attribute, positionGeometry, uv, varyingProperty, instanceIndex,
  texture, If, Discard, abs, max, min, clamp, mix, smoothstep, step, length, normalize, pow, sqrt, floor, fract, dot, cross, cos, sin, log,
  cameraProjectionMatrix, cameraViewMatrix, frontFacing, screenCoordinate } from 'three/tsl';
import { L, hashI, rnd, camDist, riverInfo, heightAt, aridMask, pathN, pathMask, bareMask, outcropMask, tuftMask, bankMask, cutMask, barMask, grassTintAB } from './land.tsl.js';
import { LIGHT, haze, toScreen, weathered, cloudAt } from './terrain.tsl.js';
import { boxIn } from '../core/frustum.js';
import { pxK } from '../detail/index.js';
import { rockGeometry } from '../scatter/rocks.js';
import { ASSETS } from '../scatter/assets.js';
import { PLACES } from '../world/places.js';
import { heightAt as heightCPU } from '../world/land.js';
import { at } from '../../biomes/index.js';

const land = at('land'), arid = at('arid'), bank = at('bank'), cutb = at('cutbank'), bar = at('bar');
const LAND_STONES = land.stones, ARID_STONES = arid.stones - land.stones, BANK_STONES = bank.stones - land.stones;
const CUT_STONES = cutb.stones - land.stones, BAR_STONES = bar.stones - land.stones;
const LAND_FLOWERS = land.grass.flowers ? 1 : 0, ARID_COVER = arid.grass.cover, ARID_HEIGHT = arid.grass.height;

// ---- the ground under the camera (src/scatter/ground.js): height, density, arid, stone chance; and the grass's tint ----
const N = 512;
const G = { o: uniform(new THREE.Vector2(1e9, 1e9)), base: uniform(0), texel: uniform(0.5) };
const tent = PLACES.tent, TENT = vec2(tent.x, tent.z), TENT_R = tent.clear || 2.7;
let noiseTex = null;
const grassTint = Fn(([p, ar]) => {
  const pr = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6)));
  const a = clamp(texture(noiseTex, p.mul(1 / 150)).level(0).r.add(texture(noiseTex, pr.mul(1 / 397)).level(0).a).sub(1).mul(0.8).add(0.5), 0, 1);
  return grassTintAB(a, texture(noiseTex, pr.mul(1 / 45)).level(0).g, ar);
});
let rtA = null, rtB = null;
const gUV = (pos) => pos.sub(G.o).div(G.texel).add(0.5).div(N);
const groundA = (pos) => { const g = texture(rtA.texture, gUV(pos)).level(0); return vec4(g.x.add(G.base), g.y, g.z, g.w); };
const groundTint = (pos) => { const t = texture(rtB.texture, gUV(pos)).level(0); return vec4(t.rgb.mul(t.rgb), t.a); };

function createGround(renderer, tex) {
  noiseTex = tex.a[tex.ids.indexOf('noise')];
  rtA = new THREE.RenderTarget(N, N, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  rtB = new THREE.RenderTarget(N, N, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  // the texel's centre, in metres; three's node reads turn a target's rows the other way up (WebGPU and its WebGL 2 fallback alike), so the writer turns them too
  const uvW = vec2(uv().x, float(1).sub(uv().y));
  const posOf = () => G.o.add(uvW.mul(N).sub(0.5).mul(G.texel));
  const fragA = Fn(() => {
    const pos = posOf(), I = riverInfo(pos), w = I.y, d = abs(I.x), b = I.z, dist = camDist(pos);
    const ar = aridMask(pos, dist), path = pathMask(pathN(pos)), oc = outcropMask(pos);
    const clear = smoothstep(TENT_R - 0.4, TENT_R + 0.3, length(pos.sub(TENT)));   // the tent's floor is kept clear
    const dens = float(1).sub(path).mul(float(1).sub(bankMask(pos, d, w, b))).mul(float(1).sub(cutMask(pos, d, w, b))).mul(float(1).sub(barMask(pos, d, w, b)))
      .mul(float(1).sub(bareMask(pos))).mul(float(1).sub(oc.mul(0.25))).mul(mix(1, tuftMask(pos).mul(ARID_COVER), ar)).mul(clear);
    const stone = clear.mul(float(LAND_STONES).add(ar.mul(ARID_STONES)).add(float(1).sub(smoothstep(w.mul(0.6), w.add(4), d)).mul(BANK_STONES))
      .add(cutMask(pos, d, w, b).mul(CUT_STONES)).add(barMask(pos, d, w, b).mul(BAR_STONES)).add(oc.mul(0.5))).mul(float(1).sub(path.mul(0.8)));
    return vec4(heightAt(pos, dist, d, w, b).sub(G.base), dens, ar, stone);
  });
  const fragB = Fn(() => { const pos = posOf(), t = grassTint(pos, aridMask(pos, camDist(pos))); return vec4(sqrt(t.rgb), t.a); });
  const mk = (f) => { const m = new THREE.NodeMaterial(); m.vertexNode = vec4(positionGeometry.xy, 0, 1); m.fragmentNode = f(); m.depthTest = m.depthWrite = false; return m; };
  const mA = mk(fragA), mB = mk(fragB);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mA), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false;
  let lastDy = -1;
  return {
    /** drawn again when the camera has walked 16 texels (8 m) */
    update(cx, cz, dy, s = 1) {
      const TEXEL = 0.5 * s, SNAP = 16 * TEXEL, o = G.o.value;
      const ox = Math.round(cx / SNAP) * SNAP - (N * TEXEL) / 2, oz = Math.round(cz / SNAP) * SNAP - (N * TEXEL) / 2;
      if (ox === o.x && oz === o.y && Math.abs(dy - lastDy) < 4) return;
      if (dy > 160 * s && lastDy > 160 * s) return;   // too high up for anything that reads it
      o.set(ox, oz); lastDy = dy; G.texel.value = TEXEL; G.base.value = Math.round(heightCPU(ox + (N * TEXEL) / 2, oz + (N * TEXEL) / 2));
      const was = renderer.getRenderTarget();
      quad.material = mA; renderer.setRenderTarget(rtA); renderer.render(quad, cam);
      quad.material = mB; renderer.setRenderTarget(rtB); renderer.render(quad, cam);
      renderer.setRenderTarget(was);
    },
    rtA: () => rtA,
  };
}

// ---- a tier (src/scatter/tier.js) ----
const MAXP = 384;
class Tier {
  constructor(scene, geometry, material, { cell, P, near = 0, far, order = 0 }) {
    this.P = P; this.S = cell * P; this.near = Math.max(0, near); this.far = far; this.n = 0; this.over = false;
    this.geometry = geometry; geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }
  /** the cell an instance stands for: which patch of the list, which cell of the patch */
  static cellNode(list, P) {
    const pp = uint(P * P), pid = instanceIndex.div(pp), b = int(instanceIndex.sub(pid.mul(pp)));
    return ivec2(list.element(pid)).add(ivec2(b.mod(P), b.div(P)));
  }
  select(cx, cz, h0, s, dy) {
    const { S, P, list } = this, far = this.far * s, far2 = far * far - dy * dy, near2 = this.near * this.near * s * s - dy * dy;
    let n = 0; this.over = false;
    if (far2 > 0) {
      const i0 = Math.floor((cx - far) / S), i1 = Math.floor((cx + far) / S), j0 = Math.floor((cz - far) / S), j1 = Math.floor((cz + far) / S);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S;
        const nx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0, nz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0, nd = nx * nx + nz * nz;
        if (nd > far2) continue;
        const fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz);
        if (fx * fx + fz * fz < near2) continue;
        const yb = 0.32 * Math.sqrt(nd) + 0.2 * S + 6;
        if (!boxIn(x0, x1, h0 - yb, h0 + yb, z0, z1)) continue;
        if (n === MAXP) { this.over = true; continue; }
        list[n].set(i * P, j * P); n++;
      }
    }
    this.n = n; this.geometry.instanceCount = n * P * P; this.mesh.visible = n > 0;
  }
}
const patchList = () => { const a = []; for (let i = 0; i < MAXP; i++) a.push(new THREE.Vector2()); return a; };
const clipOf = (w) => cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1));
const OFF = () => vec4(2, 2, 2, 1);
const u8 = (h, sh) => float(h.shiftRight(uint(sh)).bitAnd(uint(0xFF))).mul(1 / 256);

// ---- grass (src/scatter/grass.js) ----
function blade(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = i / segs; pos.push(-1, t, 0, 1, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  return { pos: new Float32Array(pos), idx };
}
function grassTier(scene, asset, T) {
  const list = patchList(), patches = uniformArray(list, 'vec2'), cell = T.cell;
  const vCol = varyingProperty('vec3', 'vCol'), vN = varyingProperty('vec3', 'vN'), vSide = varyingProperty('vec3', 'vSide'), vTS = varyingProperty('vec3', 'vTS'), vWorld = varyingProperty('vec3', 'vWorld');
  const vert = Fn(() => {
    const out = OFF().toVar(), c = Tier.cellNode(patches, T.P);
    const h1 = hashI(c.x, c.y, uint(100));
    const pos = vec2(c).add(vec2(float(h1.bitAnd(uint(0xFFF))), float(h1.shiftRight(uint(12)).bitAnd(uint(0xFFF)))).mul(1 / 4096)).mul(cell);
    const dist = camDist(pos), hf = u8(h1, 24);
    If(dist.lessThanEqual(hf.mul(-T.farFade).add(T.far)).and(dist.greaterThanEqual(hf.mul(-T.nearFade).add(T.near))), () => {
      const Gr = groundA(pos), ar = Gr.z, dens = Gr.y, h2 = hashI(c.x, c.y, uint(101));
      If(u8(h2, 24).lessThanEqual(dens), () => {
        const r1 = u8(h2, 0), r2 = u8(h2, 8), r3 = u8(h2, 16);
        const hc = hashI(int(floor(pos.x.div(0.6))), int(floor(pos.y.div(0.6))), uint(102)), c1 = u8(hc, 0), c2 = u8(hc, 8), c3 = u8(hc, 16);
        const tint = groundTint(pos);
        const flower = step(0.985, r2).mul(float(1).sub(ar)).mul(LAND_FLOWERS);
        const hgt = float(asset.height).mul(float(0.5).add(r1.mul(r1).mul(0.55)).add(c1.mul(c1).mul(0.8)).add(flower.mul(0.35))).mul(mix(1, ARID_HEIGHT, ar))
          .mul(dens.mul(0.4).add(0.6)).mul(float(1).sub(smoothstep(T.end * 0.7, T.end, dist)));
        const ang = c2.add(r2.sub(0.5).mul(0.55)).mul(6.2831853), dir = vec2(cos(ang), sin(ang)), side = vec2(dir.y.negate(), dir.x);
        const t = positionGeometry.y, s = positionGeometry.x, bend = float(0.2).add(r3.mul(0.55)).add(c3.mul(0.35)).mul(float(1).sub(flower.mul(0.7)));
        const wd = float(T.w).mul(r1.mul(0.5).add(0.75)).mul(float(1).sub(t.mul(t).mul(0.8)));
        const up = hgt.mul(t).mul(float(1).sub(bend.mul(0.42).mul(t))), fw = hgt.mul(bend).mul(t).mul(t).mul(1.15);   // long blades arc over
        const w = vec3(pos.x, Gr.x, pos.y).add(vec3(side.x, 0, side.y).mul(s.mul(wd))).add(vec3(dir.x.mul(fw), up, dir.y.mul(fw)));
        const tg = normalize(vec3(dir.x.mul(2).mul(bend).mul(t), float(1).sub(bend.mul(0.6).mul(t)), dir.y.mul(2).mul(bend).mul(t)));
        const sd = vec3(side.x, 0, side.y);
        vWorld.assign(w); vSide.assign(sd); vN.assign(cross(sd, tg)); vTS.assign(vec3(t, s, flower));
        const base = tint.rgb.mul(float(0.7).add(r3.mul(0.35)).add(c3.mul(0.35)));
        const tip = smoothstep(0.5, 1, t).mul(clamp(tint.a.mul(1.2).add(r2.mul(0.35)).sub(0.25), 0, 1));
        vCol.assign(mix(base, vec3(0.42, 0.34, 0.15), tip).mul(mix(0.14, 1.45, t.mul(t.mul(0.4).add(0.6)))));   // dark in the thick of it, light at the tips
        out.assign(clipOf(w));
      });
    });
    return out;
  });
  const frag = Fn(() => {
    const vT = vTS.x, n0 = normalize(vN.add(vSide.mul(vTS.y).mul(0.6)));   // a blade is a little rounded
    const n = normalize(frontFacing.select(n0, n0.negate()).add(vec3(0, 1.4, 0)));   // and a meadow lights as a soft whole
    const ndl = n.dot(LIGHT.sunDir).mul(0.5).add(0.5), V = normalize(L.cam.sub(vWorld));
    const thru = pow(max(V.negate().dot(LIGHT.sunDir), 0), 2).mul(vT);
    const sheen = pow(max(n.dot(normalize(V.add(LIGHT.sunDir))), 0), 20).mul(0.16).mul(vT);
    const sun = LIGHT.sun.mul(cloudAt());
    const col0 = weathered(vCol, n).mul(LIGHT.amb.mul(vT.mul(0.45).add(0.55)).add(sun.mul(ndl.mul(ndl).mul(1.1).add(vec3(0.5, 1, 0.22).mul(thru))))).add(sun.mul(sheen));
    const col = vTS.z.greaterThan(0.5).and(vT.greaterThan(0.86)).select(vec3(0.92, 0.92, 0.86).mul(LIGHT.amb.add(LIGHT.sun.mul(0.7))), col0);
    return toScreen(haze(col, length(L.cam.sub(vWorld))));
  });
  const b = blade(T.segs), g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3)); g.setIndex(b.idx);
  const m = new THREE.NodeMaterial(); m.vertexNode = vert(); m.fragmentNode = frag(); m.side = THREE.DoubleSide;
  const tier = new Tier(scene, g, m, { cell, P: T.P, near: T.near - T.nearFade, far: T.far, order: 0 }); tier.list = list;
  return tier;
}

// ---- rocks (src/scatter/rocks.js) ----
const ign = (p) => fract(fract(dot(p, vec2(0.06711056, 0.00583715))).mul(52.9829189));
const rot = (v, a, cs, sn) => v.mul(cs).add(cross(a, v).mul(sn)).add(a.mul(dot(a, v)).mul(float(1).sub(cs)));
const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));
function rockTier(scene, asset, Lv, v, tex) {
  const list = patchList(), patches = uniformArray(list, 'vec2'), big = !!asset.outcrops, fade = asset.detail.fade;
  const lo = Lv.lo, hi = Number.isFinite(Lv.hi) ? Lv.hi : 1e9, NEAR = uniform(0), FAR = uniform(1);
  const of = (id) => { const i = tex.ids.indexOf(id); return { a: tex.a[i], n: tex.n[i] }; };
  const R = of(asset.look?.material || 'rock'), MOSS = of('meadow').a, look = asset.look || {};
  const uMoss = look.moss ?? 1, uRelief = look.relief ?? 1.1, tintR = vec3(...(look.tint || [1, 1, 1]));
  const vWorld = varyingProperty('vec3', 'vWorld'), vN = varyingProperty('vec3', 'vN'), vTint = varyingProperty('vec3', 'vTint'), vAL = varyingProperty('vec2', 'vAL'), vKeep = varyingProperty('vec2', 'vKeep');
  // its size on screen picks the level, with a hand-over (src/detail: detailKeep)
  const keepOf = (px) => {
    const Lg = log(max(px, 1e-6)), lh = Math.log(hi), ll = Math.log(lo);
    const kHi = vec2(float(1).sub(clamp(Lg.sub(lh - fade).div(2 * fade), 0, 1)), 0), kLo = vec2(clamp(Lg.sub(ll - fade).div(2 * fade), 0, 1), 1);
    return (hi < 1e8 ? Lg.greaterThan(lh - fade) : float(0).greaterThan(1)).select(kHi, Lg.lessThan(ll + fade).select(kLo, vec2(1, 0)));
  };
  const vert = Fn(() => {
    const out = OFF().toVar(), c = Tier.cellNode(patches, Lv.P), cx = c.x, cy = c.y;
    If(floor(rnd(cx, cy, uint(201)).mul(asset.shapes)).equal(v), () => {
      const pos = vec2(c).add(0.15).add(vec2(rnd(cx, cy, uint(202)), rnd(cx, cy, uint(203))).mul(0.7)).mul(asset.cell), dist = camDist(pos);
      If(dist.lessThan(FAR).and(dist.greaterThanEqual(NEAR)), () => {
        const ar = float(0).toVar(), oc = float(0).toVar(), y = float(0).toVar(), tint = vec3(0).toVar(), ok = float(0).toVar(), r0 = rnd(cx, cy, uint(200));
        if (big) {
          oc.assign(outcropMask(pos));
          If(r0.lessThanEqual(oc.mul(0.6).add(0.012)), () => {   // the cheap test first: most cells hold no rock
            const I = riverInfo(pos), w = I.y, d = abs(I.x);
            If(r0.lessThanEqual(oc.mul(0.6).add(0.012).mul(smoothstep(w.add(2), w.add(9), d))), () => {
              ar.assign(aridMask(pos, dist)); y.assign(heightAt(pos, dist, d, w, I.z)); tint.assign(grassTint(pos, ar).rgb); ok.assign(1);
            });
          });
        } else {
          const Gr = groundA(pos);
          If(r0.lessThanEqual(Gr.w.mul(0.7)), () => { ar.assign(Gr.z); y.assign(Gr.x); tint.assign(groundTint(pos).rgb); ok.assign(1); });
        }
        If(ok.greaterThan(0.5), () => {
          const r1 = rnd(cx, cy, uint(204)), r2 = rnd(cx, cy, uint(205)), r3 = rnd(cx, cy, uint(206)), r4 = rnd(cx, cy, uint(207));
          const s = mix(asset.size[0], asset.size[1], r1.mul(r1).mul(r1).add(oc.mul(0.25 * (big ? 1 : 0)).mul(r1)));
          const keep = keepOf(s.mul(2).mul(PXK).div(max(dist, 1e-3)));
          If(keep.x.greaterThan(0), () => {
            const scl = vec3(r2.mul(0.5).add(0.8), r3.mul(0.4).add(0.55), r4.mul(0.5).add(0.8)).mul(s);
            const ax = normalize(vec3(rnd(cx, cy, uint(208)), rnd(cx, cy, uint(209)), rnd(cx, cy, uint(210))).sub(0.5).add(1e-4));
            const ang = rnd(cx, cy, uint(211)).mul(6.2831853), cs = cos(ang), sn = sin(ang);
            const l = rot(positionGeometry.mul(scl), ax, cs, sn);
            const w = vec3(pos.x, y.sub(s.mul(0.22)), pos.y).add(l);
            vN.assign(rot(normalize(attribute('normal', 'vec3').div(scl)), ax, cs, sn)); vWorld.assign(w); vTint.assign(tint); vAL.assign(vec2(ar, l.y.div(s))); vKeep.assign(keep);
            out.assign(clipOf(w));
          });
        });
      });
    });
    return out;
  });
  const frag = Fn(() => {
    const n0 = ign(screenCoordinate.xy), cut = vKeep.y.greaterThan(0.5).select(float(1).sub(n0), n0);
    If(cut.greaterThanEqual(vKeep.x), () => { Discard(); });   // its share of a hand-over between levels
    const N0 = normalize(vN), b0 = pow(abs(N0), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z));
    const q = vWorld.div(asset.texture);
    const a = texture(R.a, q.zy).mul(b.x).add(texture(R.a, q.xz).mul(b.y)).add(texture(R.a, q.xy).mul(b.z));
    const tx = texture(R.n, q.zy).xy.mul(2).sub(1), ty = texture(R.n, q.xz).xy.mul(2).sub(1), tz = texture(R.n, q.xy).xy.mul(2).sub(1);
    const n = normalize(N0.add(vec3(0, tx.y, tx.x).mul(b.x).add(vec3(ty.x, 0, ty.y).mul(b.y)).add(vec3(tz.x, tz.y, 0).mul(b.z)).mul(uRelief)));
    // moss where the rock looks up, held back where it is dry
    const mt = texture(MOSS, q.xz.mul(1.7));
    const moss = smoothstep(0.45, 0.8, N0.y.mul(0.75).add(a.a.sub(0.5).mul(0.7)).add(mt.a.sub(0.5).mul(0.5))).mul(float(1).sub(vAL.x.mul(0.85))).mul(Math.min(uMoss, 1));
    const c1 = mix(a.rgb.mul(a.rgb).mul(tintR), vTint.mul(0.75).mul(mt.a.add(0.5)), moss.mul(0.9 * Math.min(uMoss * 1.5, 1)));
    const c2 = weathered(c1.mul(mix(0.45, 1, smoothstep(-0.25, 0.35, vAL.y))), n);   // darker where it meets the ground
    const V = normalize(L.cam.sub(vWorld));
    const col = c2.mul(LIGHT.amb.add(LIGHT.sun.mul(cloudAt()).mul(max(n.dot(LIGHT.sunDir), 0)))).add(LIGHT.sun.mul(pow(max(n.dot(normalize(V.add(LIGHT.sunDir))), 0), 30)).mul(0.06).mul(float(1).sub(moss)));
    return toScreen(haze(col, length(L.cam.sub(vWorld))));
  });
  const src = rockGeometry(Lv.rock, asset.seed + v * 7, asset.look), g = new THREE.InstancedBufferGeometry();   // the shape is made by the WebGL build; its arrays are shared
  g.setAttribute('position', new THREE.BufferAttribute(src.attributes.position.array, 3)); g.setAttribute('normal', new THREE.BufferAttribute(src.attributes.normal.array, 3));
  g.setIndex(new THREE.BufferAttribute(src.index.array, 1));
  const m = new THREE.NodeMaterial(); m.vertexNode = vert(); m.fragmentNode = frag();
  const t = new Tier(scene, g, m, { cell: asset.cell, P: Lv.P, near: 0, far: 1, order: 1 }); t.list = list;
  const span = [2 * asset.size[0], 2 * asset.size[1] * (big ? 1.25 : 1)];
  t.band = () => {   // the distances where a rock of this level can be
    const K = pxK(), e = Math.exp(fade);
    t.near = Number.isFinite(Lv.hi) ? (span[0] * K) / (Lv.hi * e) : 0; t.far = (span[1] * K * e) / Lv.lo;
    NEAR.value = t.near > 0 ? t.near : -1; FAR.value = t.far;
  };
  t.band(); addEventListener('resize', t.band);
  return t;
}

/** Everything of src/scatter/assets.js on the WebGPU renderer: the ground pass, then a tier per row. */
export function createScatter(scene, renderer, tex) {
  const ground = createGround(renderer, tex), tiers = [];
  for (const a of ASSETS) {
    if (a.kind === 'grass') for (const T of a.tiers) tiers.push(grassTier(scene, a, T));
    else for (let v = 0; v < a.shapes; v++) for (const Lv of a.detail.levels.filter((l) => !l.impostor)) tiers.push(rockTier(scene, a, Lv, v, tex));
  }
  return {
    tiers, ground,
    /** after the frustum's planes are set (core/frustum.js setPlanes) */
    update(cx, cz, h0, dy, s = 1) { ground.update(cx, cz, dy, s); for (const t of tiers) t.select(cx, cz, h0, s, dy); },
    get instances() { let n = 0; for (const t of tiers) n += t.geometry.instanceCount; return n; },
  };
}
