// The land's layer map (intent 0038, stage 6a, after Etienne, "Large Scale Terrain Rendering in Call of Duty",
// SIGGRAPH 2023 Advances): where each of the ground's layers lies is worked out once for a stretch of land, by the GPU,
// from the biomes' own rules (biomes/*.js: where), and kept in a map round the camera, not worked out again in every
// pixel of every frame. The ground's fragment (src/terrain/material.js) reads the four texels round its point and lays
// at most five layers, whatever the number of biomes and materials: its shader is one size, the biomes are data.
//
// The map is a clipmap: LEVELS levels of N × N texels, the first S0 metres a texel, each one after twice as coarse, each
// a window over the land kept round the camera. A texel's place in its level is its place on the land modulo N, so as
// the camera moves only the rows and columns the window comes onto are worked out (a few thousand texels as one walks,
// a level of 262 144 at a jump). A pixel reads the finest level whose window holds it and whose texel is no finer than
// the pixel, and in the last quarter before the next level takes over, that one as well, blended.
//
// A texel holds, packed in four 32-bit words and one more:
//   the layers laid there   the four strongest (LAYERS below: a byte each, their place in the order they are laid) and
//                           their shares (a byte each), the material's height left out: that is the pixel's own
//   the grass's carpet      how much of the ground it covers: near (the bare patches cut out), between, and far (its tufts
//                           let go); and the slow variation of every ground's colour (macro)
//   the stands' cover       the two thickest stands (STANDS below): how thick each grows there and its crowns' pattern
//   the grass's colour      its tint, and which two stands those are
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, uint, vec2, vec3, ivec2, uvec2, uvec4, uniform, uniformArray, texture, textureStore, globalId, abs, max, min, clamp, smoothstep, floor, ceil, log2, exp2, sqrt, length, round, renderGroup } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { note } from '../core/gpu.js';
import { did } from '../core/work.js';
import { byRole } from '../core/registry.js';
import { riverInfo, biomesAt, grassFrom, groveAt, leadAt, pathN, pathMask, bareMask, outcropMask, placeOff, stageAt, grassTint, BASE, LAID } from '../world/land.nodes.js';
import { kindsOf } from '../world/stand.js';
import { detailOf } from '../detail/index.js';
import { TRUTH, REACH } from '../detail/measure.js';
import { sizeOf } from '../../assets/kinds.js';
import { BOX } from '../world/shadow.js';
const noise = byRole('noise');   // the baked cloudy noise: whichever material plays that part (its `role`)

const N = 512, LEVELS = 10, S0 = 0.25, COLS = 5, SNAP = 8;   // texels a level's side; levels (the last reaches 31 km); metres a texel of the first; levels a row of the atlas; texels a window moves by at once
const REACHES = N / 2 - 10;   // texels from the camera a level is read to (its window is centred within SNAP / 2 of it; one more for the four texels round a point)
const EMPTY = 255, NO_STAND = 15;

// ---- the ground's layers, in the order they are laid (lowest first): a layer's id is its place here ----
// (each: its ground { material, tile }, and how far off it is let go, fade [from, to] metres, where it says)
export const LAYERS = [];
const lay = (o) => (LAYERS.push(o), LAYERS.length - 1);
// what each kind of tree drops (its `litter`: assets/kit/tree.js), if not the biome's own floor: laid where that kind
// leads in the biome's stand (its slice of the stand's slow noise, as its trees are placed), under its groves
const drops = (bio) => (bio.trees ? kindsOf(bio.uid).filter((k) => k.asset.litter && k.asset.litter.material !== bio.floor.material) : []);
// a biome's own grounds: its floor, its spots in it, its trees' litter
const ofBiome = (bio) => ({ bio, floor: lay({ ground: bio.floor }), spots: bio.spots ? lay({ ground: bio.spots, fade: bio.spots.fade }) : -1, litter: drops(bio).map(({ asset, slice }) => ({ id: lay({ ground: asset.litter }), slice })) });
const FLOOR = lay({ ground: BASE.floor });   // the base biome's floor, under everything
// the grassy biomes, under the grass's carpet; then the base's bare patches (let go where its blades end) and the floor of
// its outcrops
const UNDER = LAID.filter((b) => b.grass).map(ofBiome);
const BARE = lay({ ground: BASE.patches, fade: [100, 160] }), OUTCROP = lay({ ground: BASE.patches });
/** The grass's carpet is laid before the first layer with this id or more: over every layer before it, under every one after. */
export const CARPET = LAYERS.length;
// over the carpet: the base's paths (a thing of the near ground), the biomes nothing grows on, the base's rock where the
// land is too steep (its slope is the pixel's own: src/terrain/material.js), in their layers' order; last the library's stage
const PATHS = lay({ ground: BASE.patches, fade: [70, 220] });
let slopes = -1;
const OVER = LAID.filter((b) => !b.grass).map((b) => { if (slopes < 0 && BASE.slopes && b.layer > (BASE.slopes.layer ?? Infinity)) slopes = lay({ ground: BASE.slopes }); return ofBiome(b); });
if (slopes < 0 && BASE.slopes) slopes = lay({ ground: BASE.slopes });
/** The base's rock on what is too steep (-1: none): not in the map, laid by the pixel from its own slope. */
export const SLOPES = slopes;
/** The library's stage: its ground is the uniform's (uStageGround: a material's number and its tile; -1 the base's patches). */
export const STAGE = lay({ ground: null });
if (LAYERS.length > EMPTY) throw new Error(`the land lays ${LAYERS.length} layers: a byte names at most ${EMPTY}`);

// ---- the stands that wear a colour far off (a biome's `trees` with its `canopy`, or any stand with a `cover`) ----
// Every stand of a biome (its trees, its undergrowth: any block of it with cells and a density, src/scatter/trees.js)
// hands over to the land where its plants are no longer drawn, in the same groves the plants stand in
// (src/world/noise.nodes.js: groveAt): nothing drops out of the picture, whatever is planted.
//   - far off, where they sink away (kinds.js: sink), the land takes the stand's colour (its `cover`; the trees' is the
//     biome's `canopy`), as much of the ground as the stand covers there;
//   - a stand that casts shadows: its floor lies in their shade. Round the camera they are drawn (the shadow map, and in
//     it the trees' stand-in: src/world/shadow.js, assets/kit/tree.js); past that the floor is dimmed, unevenly, so a
//     forest is not a plain in full sun with trees on it.
export const STANDS = [];
for (const bio of LAID) for (const [key, P] of Object.entries(bio)) {
  if (!P || typeof P !== 'object' || !P.cell || P.density == null) continue;
  const CV = P.cover ?? (key === 'trees' ? bio.canopy : null); if (!CV) continue;
  // of what grows in the stand, the kind drawn farthest: its colour comes in where its plants go out (they are drawn
  // while their largest side is more than their last level's pixels, the same rule by the lens and the window:
  // src/detail), the largest to `last` metres, most of them gone by two thirds of that; without such plants, its own
  // from/to. A stand that changes level as one (its `size`): its colour comes onto the land only far off, where its plants
  // are bodies about to sink
  const A = kindsOf(bio.uid, key).map((k) => k.asset).sort((x, y) => sizeOf(y) / detailOf(y).cut - sizeOf(x) / detailOf(x).cut)[0];
  const cutPx = A ? detailOf(A).cut : 0, span = cutPx ? (P.size ?? sizeOf(A) * (A.placement.scale?.[1] ?? 1)) / cutPx : 0;   // (last = uPxK × span: the measure's farAt, src/detail/measure.js)
  const SH = A?.detail?.shadow;   // where its shadows are no longer drawn: past the map's box, or past the trees' stand-in in it
  STANDS.push({ bio, P, grain: CV.grain ?? 1, fill: CV.fill ?? 2.4, colour: CV.colour, span, fade: span ? (P.size ? [0.45, 0.8] : [0.3, 0.68]) : [CV.from, CV.to], reach: SH ? SH.far * (SH.wide ?? 2.4) : -1 });
}
if (STANDS.length >= NO_STAND) throw new Error(`the land has ${STANDS.length} stands that wear a colour: four bits name at most ${NO_STAND - 1}`);

// ---- the map: worked out on the GPU ----
// (an atlas of the levels, COLS a row: level k's texels at ((k % COLS) N, floor(k / COLS) N), each its window's texel
// (ix, iz) of the land at (ix & N-1, iz & N-1))
const W = COLS * N, H = Math.ceil(LEVELS / COLS) * N;
const words = (format) => { const t = new THREE.StorageTexture(W, H); Object.assign(t, { format, type: THREE.UnsignedIntType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }); return t; };
const MAP = words(THREE.RGBAIntegerFormat), MORE = words(THREE.RedIntegerFormat);
const at = (lv, ix, iz) => ivec2(ix.bitAnd(N - 1).add(lv.mod(COLS).mul(N)), iz.bitAnd(N - 1).add(lv.div(COLS).mul(N)));
const byte = (v) => uint(round(clamp(v, 0, 1).mul(255)));
const un = (w, k) => float(w.shiftRight(uint(8 * k)).bitAnd(uint(255))).mul(1 / 255);

// the layers' table, for the fragment: a layer's material (its number: src/materials/bake.js), its tile (metres), and
// how far off it is let go (from, to; none: past any distance)
let TABLE = null, STAND_T = null;
const tableOf = (tex) => {
  if (TABLE) return;
  TABLE = uniformArray(LAYERS.map((L) => new THREE.Vector4(L.ground ? tex.layer(L.ground.material) : -1, L.ground ? L.ground.tile : 2, ...(L.fade ?? [1e9, 2e9]))), 'vec4').setGroup(renderGroup);
  // the stands': (its crowns' colour, its grain), (its plants' span (0: its own from/to), from, to, how far its shadows reach (-1: none))
  STAND_T = uniformArray(STANDS.flatMap((S) => [new THREE.Vector4(...S.colour, S.grain), new THREE.Vector4(S.span, ...S.fade, S.reach)]).concat([new THREE.Vector4(), new THREE.Vector4()]), 'vec4').setGroup(renderGroup);
};

/** The map's pass (a compute kernel over a rectangle of a level's texels) and how to keep it round the camera. */
export function createLayers(renderer, tex) {
  tableOf(tex);
  note('the land\'s layer map', W * H * 20, 0);
  const uRect = uniform(new THREE.Vector4()), uLevel = uniform(0, 'int'), uTexel = uniform(S0);
  // a read of the land's cloudy noise at q (metres a tile: `scale`), as fine as the map's texel calls for
  const nz = (q, scale) => tex.a(noise, q).level(max(log2(uTexel.mul(1024 / scale)), 0));
  const kernel = Fn(() => {
    const g = globalId.xy;
    If(g.x.lessThan(uint(uRect.z)).and(g.y.lessThan(uint(uRect.w))), () => {
      const ix = int(g.x).add(int(uRect.x)), iz = int(g.y).add(int(uRect.y)), p = vec2(float(ix), float(iz)).add(0.5).mul(uTexel).toVar();
      // ---- what the biomes make of p (their rules as the land's nodes give them: src/world/land.nodes.js) ----
      const I = riverInfo(p).toVar(), ctx = { p, dist: float(0), d: abs(I.x), w: I.y, b: I.z };   // (dist 0: what is let go with distance is the pixel's, below)
      const Lb = biomesAt(ctx, true), share = new Map(Lb.shares.map(({ b, w }) => [b, w]));
      const stage = stageAt(p).toVar(), bare0 = bareMask(p).toVar(), dry = Lb.dry.toVar();
      // ---- the layers, each laid over what is under it as much as its rule says (a layer's share of the ground
      // shrinks by what is laid over it) ----
      const S = LAYERS.map(() => float(0).toVar()); S[FLOOR].assign(1);
      const over = (id, t) => { const k = float(t).toVar(); for (const s of S) s.mulAssign(float(1).sub(k)); S[id].addAssign(k); };
      // a biome's ground: its floor, its spots and its trees' litter laid over each other, then all of it over what is there
      const biome = ({ bio, floor, spots, litter }) => {
        const wt = share.get(bio).mul(bio.mix ?? 1).toVar(), own = new Map([[floor, float(1)]]);
        const put = (id, t) => { for (const [k, v] of own) own.set(k, v.mul(float(1).sub(t))); own.set(id, t); };
        if (spots >= 0) put(spots, clamp(bio.spots.where(ctx), 0, 1).toVar());
        if (litter.length) {
          const lead = leadAt(p, bio.trees).mul(0.7).add(0.15).toVar(), thick = smoothstep(0.1, 0.6, groveAt(p, bio.trees)).toVar();
          for (const { id, slice: [a, b] } of litter) put(id, (a > 0 ? smoothstep(a - 0.06, a + 0.06, lead) : float(1)).mul(b < 1 ? float(1).sub(smoothstep(b - 0.06, b + 0.06, lead)) : float(1)).mul(thick).toVar());
        }
        for (const s of S) s.mulAssign(float(1).sub(wt));
        for (const [id, v] of own) S[id].addAssign(wt.mul(v));
      };
      UNDER.forEach(biome);
      over(BARE, max(bare0.sub(stage), 0).mul(float(1).sub(dry)));
      over(OUTCROP, outcropMask(p).mul(0.25));
      over(PATHS, placeOff(p, pathMask(pathN(p))));
      OVER.forEach(biome);
      over(STAGE, stage);
      // the four strongest, then in the order they are laid
      const top = [0, 1, 2, 3].map(() => ({ id: int(EMPTY).toVar(), w: float(0).toVar() }));
      S.forEach((s, id) => {
        const c = top.map((t) => s.greaterThan(t.w).toVar());   // (held: the slots change as they are assigned)
        for (let i = 3; i >= 0; i--) {   // (from the last: each takes what was before it, if what comes is stronger than that)
          const fromAbove = i > 0 ? c[i - 1] : null, here = c[i];
          if (fromAbove) { top[i].id.assign(fromAbove.select(top[i - 1].id, here.select(int(id), top[i].id))); top[i].w.assign(fromAbove.select(top[i - 1].w, here.select(s, top[i].w))); }
          else { top[i].id.assign(here.select(int(id), top[i].id)); top[i].w.assign(here.select(s, top[i].w)); }
        }
      });
      const sum = top.reduce((a, t) => a.add(t.w), float(0)).max(1e-6).toVar();
      for (const t of top) { If(t.w.lessThan(0.5 / 255), () => { t.id.assign(EMPTY); t.w.assign(0); }); }
      for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3], [1, 2]]) {   // (sorted by id: a network of five)
        const A = top[i], B = top[j], swap = B.id.lessThan(A.id).toVar(), ai = int(A.id).toVar(), aw = float(A.w).toVar();
        A.id.assign(swap.select(B.id, A.id)); A.w.assign(swap.select(B.w, A.w)); B.id.assign(swap.select(ai, B.id)); B.w.assign(swap.select(aw, B.w));
      }
      // ---- the grass's carpet: how much of the ground its blades cover, where they end nothing shows; near, the bare
      // patches cut it (they are let go 100 to 160 m off, the pixel's); far its tufts are let go (350 to 900 m) ----
      const grassy = Lb.grassy.toVar(), grassyFar = grassFrom(Lb.shares, ctx, float(0.5)).grassy, open = float(1).sub(stage);
      // the land's colour variation, from the baked cloudy noise
      const pr = vec2(p.x.mul(0.6).sub(p.y.mul(0.8)), p.x.mul(0.8).add(p.y.mul(0.6))), prr = vec2(p.x.mul(0.8).add(p.y.mul(0.6)), p.x.mul(-0.6).add(p.y.mul(0.8)));
      const macro = nz(prr.mul(1 / 97).add(0.37), 97).b.sub(0.5).mul(0.16).add(nz(pr.mul(1 / 700), 700).a.sub(0.5).mul(0.2)).add(nz(p.mul(1 / 4500).add(0.11), 4500).r.sub(0.5).mul(0.18));
      // ---- the stands: how thick each grows (as much of a cell as one of its plants covers), the pattern of its crowns
      // (fill: how much of a cell one of its plants covers; grain: its plants' size to a tree's; at scales with no whole
      // ratio: no grid of crowns) ----
      const st = [0, 1].map(() => ({ id: int(NO_STAND).toVar(), c: float(0).toVar(), n: float(0).toVar() }));
      STANDS.forEach((T, id) => {
        const wt = share.get(T.bio), likes = T.P.where ? T.P.where({ p }) : float(1), g = T.grain;
        const c = clamp(wt.mul(groveAt(p, T.P)).mul(likes).mul((T.P.density ?? 1) * T.fill), 0, 1).toVar();
        If(c.greaterThan(st[1].c), () => {
          const n = nz(p.div(23 * g).add(0.7), 23 * g).r.mul(0.35).add(nz(prr.div(31.7 * g).add(0.2), 31.7 * g).g.mul(0.35)).add(nz(pr.div(9.3 * g), 9.3 * g).g.mul(0.3)).toVar();
          If(c.greaterThan(st[0].c), () => { st[1].id.assign(st[0].id); st[1].c.assign(st[0].c); st[1].n.assign(st[0].n); st[0].id.assign(id); st[0].c.assign(c); st[0].n.assign(n); })
            .Else(() => { st[1].id.assign(id); st[1].c.assign(c); st[1].n.assign(n); });
        });
      });
      If(st[1].id.lessThan(st[0].id), () => { const i = int(st[0].id).toVar(), c = float(st[0].c).toVar(), n = float(st[0].n).toVar(); st[0].id.assign(st[1].id); st[0].c.assign(st[1].c); st[0].n.assign(st[1].n); st[1].id.assign(i); st[1].c.assign(c); st[1].n.assign(n); });
      // the grass's colour (its tint: what the carpet and the blades wear), as fine as the texel calls for
      const tint = grassTint(tex, p, dry, max(log2(uTexel.mul(1024 / 45)), 0)).rgb;
      const word = (a, b, c, d) => a.bitOr(b.shiftLeft(uint(8))).bitOr(c.shiftLeft(uint(16))).bitOr(d.shiftLeft(uint(24)));
      const where = at(uLevel, ix, iz);
      textureStore(MAP, uvec2(where), uvec4(
        word(...top.map((t) => uint(t.id))),
        word(...top.map((t) => byte(t.w.div(sum)))),
        word(byte(float(1).sub(max(bare0, stage)).mul(grassy)), byte(open.mul(grassy)), byte(open.mul(grassyFar)), byte(macro.add(0.5))),
        word(byte(st[0].c), byte(st[0].n), byte(st[1].c), byte(st[1].n)),
      )).toWriteOnly();
      textureStore(MORE, uvec2(where), uvec4(word(byte(sqrt(tint.r)), byte(sqrt(tint.g)), byte(sqrt(tint.b)), uint(st[0].id).bitOr(uint(st[1].id).shiftLeft(uint(4)))), 0, 0, 0)).toWriteOnly();
    });
  })().computeKernel([8, 8, 1]);

  // each level's window: its first texel (ix, iz) on the land, or null: not worked out yet
  const windows = Array.from({ length: LEVELS }, () => null);
  let key = '', fresh = 0, whole = 0;   // (texels worked out this frame; of them, in levels worked out whole)
  const run = (k, x0, z0, w, h) => { uLevel.value = k; uTexel.value = S0 * 2 ** k; uRect.value.set(x0, z0, w, h); renderer.compute(kernel, [Math.ceil(w / 8), Math.ceil(h / 8), 1]); fresh += w * h; if (w * h === N * N) whole += w * h; };
  return {
    /** Its pass compiled (a promise), before it is first run. */
    compile: () => renderer.compileComputeAsync(kernel),
    /** Worked out again whole at the next update (the land under it changed: the lakes). */
    refresh() { windows.fill(null); },
    /** Every level's window kept round the camera: the rows and columns it comes onto worked out (all of it, the first
        time, after a jump, or when what lies on the land changed: the library's sandbox and stage). How many texels were
        worked out. */
    update(camera) {
      const k2 = `${U.uSand.value.toArray()}|${U.uStage.value.toArray()}`;   // (the stage's own ground is read by the pixel: uStageGround)
      if (k2 !== key) { key = k2; windows.fill(null); }
      fresh = whole = 0;
      const { x, z } = camera.position;
      for (let k = 0; k < LEVELS; k++) {
        const s = S0 * 2 ** k, nx = Math.round((Math.floor(x / s) - N / 2) / SNAP) * SNAP, nz = Math.round((Math.floor(z / s) - N / 2) / SNAP) * SNAP, o = windows[k];
        if (!o || Math.abs(nx - o[0]) >= N || Math.abs(nz - o[1]) >= N) run(k, nx, nz, N, N);
        else {
          if (nx !== o[0]) run(k, nx > o[0] ? o[0] + N : nx, nz, Math.abs(nx - o[0]), N);
          if (nz !== o[1]) run(k, nx, nz > o[1] ? o[1] + N : nz, N, Math.abs(nz - o[1]));
        }
        windows[k] = [nx, nz];
      }
      if (whole) did('land', whole);   // (a level worked out whole: the picture changed where the camera did not move it, src/core/work.js)
      return fresh;
    },
  };
}

// ---- the map read where a pixel of the land is ----
const tMap = texture(MAP), tMore = texture(MORE);
/** What lies at p (the ground's fragment: dx, dy how far apart its neighbouring pixels' points are; ny how steep the land
    is there, its normal's y): the layers to lay there, at most five, in the order they are laid ({ id, w }: a layer of
    the map's, w its share; SLOPES's w is how much of it is laid, the pixel's own), the carpet's cover (near, between,
    far), the macro variation, the grass's tint, and the two stands there ({ id (NO_STAND: none), c, n }). */
export function layersAt(p, dx, dy, ny) {
  // the level: the finest whose window holds p and whose texel is no finer than the pixel (?truth: the finest), and in
  // the last quarter of it before the next takes over, that one too (beta of it)
  const d = abs(p.sub(U.uCam.xz)), kd = log2(max(max(d.x, d.y), 1e-3).div(REACHES * S0));
  const kf = TRUTH ? float(-9) : log2(max(sqrt(length(dx).mul(length(dy))), 1e-6).div(S0));
  const kr = clamp(max(kd, kf), -1, LEVELS - 1).toVar(), k = int(clamp(ceil(kr), 0, LEVELS - 1)).toVar();
  const beta = k.lessThan(LEVELS - 1).select(smoothstep(float(k).sub(0.25), float(k), kr), float(0)).toVar();
  const grid = (lv) => { const u = p.div(exp2(float(lv)).mul(S0)).sub(0.5), i = floor(u); return { i: ivec2(i), f: u.sub(i) }; };
  const G0 = grid(k), G1 = grid(k.add(1)), i0 = G0.i.toVar(), f0 = G0.f.toVar(), i1 = G1.i.toVar(), f1 = G1.f.toVar();
  // what the texels say, summed by their weights: the layers by id into five slots (the fifth the slope's); the stands by id into two
  const ids = [0, 1, 2, 3].map(() => int(-1).toVar()), ws = [0, 1, 2, 3].map(() => float(0).toVar()), filled = int(0).toVar();
  const cv = vec3(0).toVar(), macro = float(0).toVar(), tint = vec3(0).toVar();
  const sid = [0, 1].map(() => int(-1).toVar()), sc = [0, 1].map(() => float(0).toVar()), sn = [0, 1].map(() => float(0).toVar()), sw = [0, 1].map(() => float(0).toVar());
  Loop(8, ({ i }) => {
    const second = i.greaterThanEqual(4), tx = i.bitAnd(1), tz = i.div(2).bitAnd(1), f = second.select(f1, f0);
    const bw = second.select(beta, float(1).sub(beta)).mul(tx.equal(1).select(f.x, float(1).sub(f.x))).mul(tz.equal(1).select(f.y, float(1).sub(f.y))).toVar();
    If(bw.greaterThan(0), () => {
      const lv = second.select(k.add(1), k), base = second.select(i1, i0), q = at(lv, base.x.add(tx), base.y.add(tz));
      const L = tMap.load(q).toVar(), M = tMore.load(q).toVar();
      for (let j = 0; j < 4; j++) {
        const id = int(L.x.shiftRight(uint(8 * j)).bitAnd(uint(255))), w = un(L.y, j).mul(bw);
        If(w.greaterThan(0.25 / 255), () => {
          const hit = ids.map((s) => s.equal(id).toVar()), fresh = hit.reduce((a, h) => a.or(h)).not().toVar();   // (held: the slots change as they are assigned)
          ids.forEach((s, m) => { const put = fresh.and(filled.equal(m)); ws[m].assign(put.select(w, ws[m].add(hit[m].select(w, float(0))))); s.assign(put.select(id, s)); });
          filled.assign(fresh.and(filled.lessThan(4)).select(filled.add(1), filled));
        });
      }
      cv.addAssign(vec3(un(L.z, 0), un(L.z, 1), un(L.z, 2)).mul(bw)); macro.addAssign(un(L.z, 3).sub(0.5).mul(bw));
      const sq = (k2) => un(M, k2).mul(un(M, k2)); tint.addAssign(vec3(sq(0), sq(1), sq(2)).mul(bw));
      for (let j = 0; j < 2; j++) {
        const id = int(M.shiftRight(uint(24 + 4 * j)).bitAnd(uint(15))), c = un(L.w, 2 * j), n = un(L.w, 2 * j + 1);
        If(id.notEqual(NO_STAND), () => {
          const hit = sid.map((s) => s.equal(id).toVar()), fresh = hit[0].or(hit[1]).not();
          const put = [fresh.and(sid[0].lessThan(0)).toVar(), fresh.and(sid[0].greaterThanEqual(0)).and(sid[1].lessThan(0)).toVar()];   // (held, as above)
          sid.forEach((s, m) => {
            const own = hit[m].or(put[m]);
            s.assign(put[m].select(id, s)); sc[m].addAssign(own.select(c.mul(bw), float(0))); sn[m].addAssign(own.select(n.mul(bw), float(0))); sw[m].addAssign(own.select(bw, float(0)));
          });
        });
      }
    });
  });
  // the base's rock where the land is too steep: the pixel's own slope
  const slope = { id: int(SLOPES >= 0 ? SLOPES : 999).toVar(), w: float(SLOPES >= 0 ? smoothstep(0.8, 0.68, ny) : 0).toVar() };
  const slots = [...ids.map((id, m) => ({ id, w: ws[m] })), slope];
  for (const s of slots.slice(0, 4)) If(s.id.lessThan(0), () => { s.id.assign(999); });   // (an empty slot: after every layer)
  for (const [a, b] of [[0, 1], [3, 4], [2, 4], [2, 3], [1, 4], [0, 3], [0, 2], [1, 3], [1, 2]]) {   // (sorted by id: a network of nine)
    const A = slots[a], B = slots[b], swap = B.id.lessThan(A.id).toVar(), ai = int(A.id).toVar(), aw = float(A.w).toVar();
    A.id.assign(swap.select(B.id, A.id)); A.w.assign(swap.select(B.w, A.w)); B.id.assign(swap.select(ai, B.id)); B.w.assign(swap.select(aw, B.w));
  }
  const stands = [0, 1].map((m) => ({ id: sid[m].lessThan(0).select(int(NO_STAND), sid[m]), c: sc[m], n: sn[m].div(max(sw[m], 1e-4)) }));
  return { slots, cv, macro, tint, stands };
}

/** A layer of the map's ground: its material (a number: src/materials/bake.js), its tile (metres), how much of it is left
    at dist2 metres off (1 near … 0 where it is let go). The library's stage wears what uStageGround says. */
export const layerOf = (id) => {
  const row = TABLE.element(id), stage = id.equal(STAGE), g = U.uStageGround, own = g.x.lessThan(0).select(TABLE.element(BARE).x, g.x);
  return { material: int(stage.select(own, row.x)), tile: stage.select(g.y, row.y), fade: (dist2) => float(1).sub(smoothstep(row.z, row.w, dist2)) };
};
/** A stand's numbers ({ colour, grain, span, fade [a, b], reach }: as STANDS has them), for the fragment. */
export const standOf = (id) => { const a = STAND_T.element(id.mul(2)), b = STAND_T.element(id.mul(2).add(1)); return { colour: a.xyz, grain: a.w, span: b.x, a: b.y, b: b.z, reach: b.w }; };
/** How far off (metres, as the 68° lens sees them) a stand's colour comes in: its plants' last level's reach (the
    measure's farAt: src/detail/measure.js), or its own from/to. */
export const standFade = (S, dist2) => {
  const last = TRUTH ? max(U.uPxK.mul(S.span), REACH) : U.uPxK.mul(S.span);
  return S.span.greaterThan(0).select(smoothstep(last.mul(S.a), last.mul(S.b), dist2), smoothstep(S.a, S.b, dist2));
};
/** How far the shadow map reaches round the camera for a stand whose shadows reach `reach` metres (src/world/shadow.js:
    its box grows with the camera's height). */
export const shadowReach = (reach) => min(U.uAirH.mul(BOX.grow).add(BOX.min), reach);
export { NO_STAND };
