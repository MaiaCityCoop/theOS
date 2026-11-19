// A stand's far ends (intent 0038): each plant shape's impostor and its clumps, baked on the GPU from the level of the
// heap the measure picks at its own size, mipped in a worker, kept in the browser and laid in at the next start; and
// which of them the view wants (src/scatter/trees.js far.wants). One place for what bakes them, so that what the
// browser keeps of a shape is keyed by exactly what made it (tools/registry.js baker: this file and the inputs it
// names), each shape by its own recipe and paintings: a deploy that changed nothing of a tree bakes it not again.
import * as THREE from 'three/webgpu';
import { Fn, mrt, float, int, uint, vec4, uniform, uniformArray, varyingProperty, vertexIndex, If, Discard, floor, mix, step } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { manifest, recipe, versionOf } from '../core/registry.js';
import { source, shown } from '../core/settle.js';
import { gpuStorageLater } from '../core/gpu.js';
import { made, pending } from '../core/compile.js';
import { keptGet, keptPut, keptDrop } from '../core/kept.js';
import { createAtlas, bakers, viewClip, tileClip, facingOf, facingEnc, planeFrame, litIn, atlases, pictureOf } from '../detail/impostor.js';
import { PICTURES } from '../detail/atlas.js';
import { BAND } from '../detail/error.js';
import { shows } from '../detail/seen.js';
import { GRID } from '../../assets/kit/plant.js';
import { heapRow } from './heap.js';
import { plantOf, crowdOfElems, SX, SY } from './plantvert.js';

/** The one ratio every hand-over of a plant is reckoned by (src/detail/error.js): how many times the dial a rung of
    error e (metres, its shape's own, at scale 1) puts the plant off where it is drawn px pixels large (its size Ks
    metres at scale 1): errPx(e · s, dist) / U.uErrorPx, s its scale, as px = s · Ks · uPxK / dist (measure.js pxAt,
    whose ?truth reach it keeps; a stage that tells px, tools/stick.js, so too). r ≥ 1: the rung would be seen and must
    not stand in; under 1 it may; every hand-over runs from 1 down over the BAND. */
export const ratioOf = (e, px, Ks) => e.mul(px).div(Ks.mul(U.uErrorPx).max(1e-9));

export const CH = Object.fromEntries(PICTURES.map((P) => [P.name, P.channels.length]));   // (a far end's pictures' numbers a texel, by name)
/** How much of its own round a crown's leaves and wood cover seen from straight above (0 … 1; null: none seen), from its
    far end's finest kept pictures (L: a level, { colour, n }; views a side): the views round the middle of the square
    (src/detail/impostor.js squareOf: straight down), each the texels of its picture over the cut (as many as the
    picture covers: Castaño's, src/detail/impostor.worker.js), its round a disc's from where they lie (π r², r² twice
    their mean square distance from their middle), at most all but half a texel of it; their mean. */
const crownCover = (L, views) => {
  const n = L.n, cell = n / views, mid = Math.floor(views / 2), at = views % 2 ? [mid] : [mid - 1, mid];
  let sum = 0, of = 0;
  for (const py of at) for (const px of at) {
    let N = 0, sx = 0, sy = 0, sq = 0;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { if (L.colour[((py * cell + y) * n + px * cell + x) * CH.colour + 3] < 128) continue; N++; sx += x; sy += y; sq += x * x + y * y; }
    const area = 2 * Math.PI * (sq / Math.max(N, 1) - ((sx / Math.max(N, 1)) ** 2 + (sy / Math.max(N, 1)) ** 2));
    if (area > 1) { sum += Math.min(N / area, 1 - 0.5 / area); of++; }
  }
  return of ? sum / of : null;
};
/** A half float's 16 bits as the number (what assets/kit/plant.js wrote). */
const unhalf = (h) => { const e = (h >> 10) & 31, m = h & 1023, v = e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1 + m / 1024) * 2 ** (e - 15); return h & 0x8000 ? -v : v; };

let BAKING = false;   // (one shape at a time, of every stand: the bakers' targets are one set)
// (what bakes them, as one hash: this file and the inputs it names, tools/registry.js baker)
const BAKER = Object.values(manifest).find((r) => r.baker)?.baker ?? '';
/** A stand's far ends (G: its group; D(): its drawer, once made): its two atlases (the impostors' views, a layer a shape,
    VIEWS x VIEWS views of CELL texels a side; its chunks' planes, a layer a shape that has clumps, G.clumpLayer, G.tiles
    tiles of TILE texels a row: the atlases' numbers, src/detail/impostor.js atlases), and what bakes them. Each shape
    is baked as its finest level comes into the heap (onBlock: its far data, assets/kit/crowd.js), a row of pictures a
    frame (pump), then its numbers say where it is its impostor (its row 3's third: T, its impostor's error). A picture
    is drawn from the level the measure picks at its own size (levelAt): a view CELL texels over the plant's sphere, a
    chunk's plane TILE texels over the longest side of its chunk; never from more than a picture so small shows. green:
    its stand's mean green, as its plants' leaves are tinted (what a shape shows on the whole, seenIn). */
export function farOf(renderer, tex, G, D, green) {
  const A = atlases(), n = G.meshes, views = createAtlas(renderer, { name: `plants, ${G.name}: impostors`, side: A.VIEWS * A.STORED, layers: n, cell: A.STORED, views: A.VIEWS });   // (from the level read where an impostor comes in: atlasesOf STORED)
  let clumps = null; const clumpsOf = () => (clumps ||= createAtlas(renderer, { name: `plants, ${G.name}: clumps`, side: G.tiles * A.TILE, layers: G.clumpy, cell: A.TILE }));   // (a stand none of whose shapes has clumps: one tile, which nothing reads)
  const queue = [], queued = new Uint8Array(n), waiting = new Map(), left = new Set(); let version = 0, any = false, M = null, swept = false;   // (left: the shapes queued and not in yet, kept or baked)
  // Which shapes' far ends the view wants (2026-11-19, the master: the start waited for every shape's bake, 29 of them
  // over some 45 s on a phone's one worker): those of which its far tiers found things in their band (their draws a
  // kind each; a shape not baked yet stands there as its mesh, never nothing), as their packing's counts say it, read
  // back here, one read at a time (look: the counts alone, a few hundred bytes; no pass binds anything more for it, a
  // compute stage holding no more than 8 storage buffers). Only those are baked, and only those the world waits for; the
  // rest as the view comes to want them. Where nothing packs on the GPU (WebGL), every shape, as before.
  const gpu = !!renderer.backend?.isWebGPUBackend, asked = new Uint8Array(n);
  let reading = null, readN = -1;   // (readN: how many of its tiers were made when the last read that came back was asked)
  const madeN = () => (G.drawn ?? []).filter((t) => t.passes && made(t.passes, 'run')).length;
  const look = () => {
    if (!gpu || reading) return;
    const m = madeN(), far = (G.drawn ?? []).filter((t) => t.farEnd && t.passes && made(t.passes, 'run'));
    reading = Promise.all(far.map((t) => t.found(renderer))).then((all) => { for (const f of all) for (let k = 0; k < Math.min(n, f.length); k++) if (f[k]) asked[k] = 1; readN = m; }, () => {}).finally(() => { reading = null; });
  };
  // (unsure: a tier of it still being made, or one made since the last read was asked: what it wants not known yet)
  const unsure = () => gpu && ((G.drawn ?? []).some((t) => t.passes && pending(t.passes, 'run')) || madeN() !== readN);
  const due = (k) => !gpu || asked[k];
  const queuedAs = (k) => { queued[k] = 1; left.add(k); };
  // the levels a shape's pictures are drawn from (far: its far data, assets/kit/crowd.js): the measure's at each
  // picture's own size, the plant's size in it in dial pixels (a view: CELL texels over its sphere; a chunk's plane:
  // TILE texels over its chunk's longest side, the shortest of its chunks), never a level wholly under where its
  // impostor is all (none of it is there)
  // a shape's cards and their chunks (its finest level's block: what the workers made; its far data, crowd.js clumpsOf):
  // its cards come first in its corners, six a card, a card's vertices marked by their part (assets/kit/plant.js); each
  // card is in the chunk whose cell holds its sprig's tip as the GPU reads it (its grid's 16 bits a side, crowdOfElems),
  // found once a sprig. A coarser level's cards are a first share of the finest's, the same vertices: their chunks too
  const cardsIn = (b, j, idx, elems) => {
    const V = b.verts, o = j * elems * 4, C = b.corners.subarray(j * idx, j * idx + b.draws[j]);
    let nc = 0; while (6 * nc < C.length && ((V[o + C[6 * nc] * 8 + 3] >>> 8) & 3) === 1) nc++;
    return { V, o, C, nc };
  };
  const chunksOfCards = (b, j, idx, elems, far) => {
    const { V, o, C, nc } = cardsIn(b, j, idx, elems), of = new Int16Array(nc), seen = new Map();
    for (let c = 0; c < nc; c++) {
      const v = o + C[6 * c] * 8, key = V[v + 6] * 65536 + (V[v + 7] & 0xffff);
      let q = seen.get(key);
      if (q === undefined) {
        const x = (V[v + 6] & 0xffff) * SX - GRID.xz, y = (V[v + 6] >>> 16) * SY + GRID.y0, z = (V[v + 7] & 0xffff) * SX - GRID.xz;
        q = -1; for (let h = 0; h < far[0]; h++) { const f = 8 + h * 12; if (x >= far[f] && y >= far[f + 1] && z >= far[f + 2] && x < far[f + 3] && y < far[f + 4] && z < far[f + 5]) { q = h; break; } }
        seen.set(key, q);
      }
      of[c] = q;
    }
    return of;
  };
  // a level's card corners in its chunks' order (its block; of: its cards' chunks), each chunk's cards one after another:
  // { list, start, count } (a chunk's range of the list, corners)
  const chunkOrder = (b, j, idx, elems, of, n) => {
    const { C, nc } = cardsIn(b, j, idx, elems), m = Math.min(nc, of.length), count = new Uint32Array(n), start = new Uint32Array(n);
    for (let c = 0; c < m; c++) if (of[c] >= 0) count[of[c]] += 6;
    for (let q = 1; q < n; q++) start[q] = start[q - 1] + count[q - 1];
    const list = new Uint32Array(n ? start[n - 1] + count[n - 1] : 0), at = start.slice();
    for (let c = 0; c < m; c++) { const q = of[c]; if (q >= 0) { list.set(C.subarray(6 * c, 6 * c + 6), at[q]); at[q] += 6; } }
    return { list, start, count };
  };
  const levelsOf = (far) => {
    const Ls = G.kinds[0].levels, size = far[5], farLo = size / (far[6] * BAND);
    const at = (px) => { let l = Ls.findIndex((L) => px >= L.lo); if (l < 0) l = Ls.length - 1; while (l > 0 && !(Ls[l].hi > farLo)) l--; return l; };
    let side = Infinity; for (let c = 0; c < far[0]; c++) { const b = 8 + c * 12 + 6; side = Math.min(side, Math.max(far[b + 3] - far[b], far[b + 4] - far[b + 1], far[b + 5] - far[b + 2])); }
    return { views: at((size * A.CELL) / (2 * far[4])), tiles: far[0] > 0 ? at((size * A.TILE) / side) : 0 };
  };
  source(`plants, ${G.name}: far ends`, () => (unsure() ? 1 : 0) + [...left].filter(due).length);   // (the world is not complete while a far end the view wants is still being baked: src/core/settle.js)
  // what bakes a shape (made at the first: they read the heap): its finest level's vertices as they lie there, each
  // view (instances: a row's) or each chunk's plane (instances: a row's tiles) drawing it, its leaves and its bark as
  // near (a leaf's cut-out read at its finest: SS x SS samples a texel say how much of it is covered)
  const materials = () => {
    if (M) return M;
    const H = D().H, kindU = uniform(0, 'uint'), levelU = uniform(0, 'uint'), rowU = uniform(0, 'int'), sphereU = uniform(new THREE.Vector4(0, 0, 0, 1)), nU = uniform(0, 'int'), tilesU = uniform(G.tiles, 'int');   // (tilesU: its tiles a row, a uniform: every stand's bakers one pipeline)
    const cells = Array.from({ length: A.CLUMPS * 4 }, () => new THREE.Vector4()), cellsU = uniformArray(cells, 'vec4');
    // (the tile level's card corners, a chunk's after another (chunkOrder): a chunk's planes draw their own range of
    // them, its start and count in its cell's first two rows, never the rest of the level. As large as what is written
    // into it, made larger before a list that would not fit (job: corners), never sized from the heap's pools as they
    // stand when the bake is first made, which may hold nothing yet)
    const CL = gpuStorageLater('uint', `plants, ${G.name}: the clumps' corners`, 'geometry'); CL.made = CL.make(1) / 4;
    const vUv = varyingProperty('vec2', 'bUv'), vPart = varyingProperty('float', 'bPart'), vTwig = varyingProperty('float', 'bTwig'), vN = varyingProperty('vec3', 'bN'), vZ = varyingProperty('float', 'bZ'), vAo = varyingProperty('float', 'bAo');
    const vertexAt = (id) => { const R = heapRow(H, kindU, levelU), e = R.y.add(id.mul(uint(2))), e0 = H.elems.element(e).toVar(), e1 = H.elems.element(e.add(uint(1))).toVar(); return { ...plantOf(e0, e1), tip: crowdOfElems(e0, e1, null).tip }; }, vertex = () => vertexAt(vertexIndex);
    // (its way as its picture keeps it: facing the picture, in the picture's own frame, F: src/detail/impostor.js facingOf)
    const pass = (V, z, F) => { vUv.assign(V.uv); vPart.assign(V.part); vTwig.assign(V.twig); vZ.assign(z); vAo.assign(V.ao); vN.assign(facingOf(V.normal, F)); };
    const viewV = Fn(() => { const V = vertex(), P = viewClip(V.position.sub(sphereU.xyz).div(sphereU.w), rowU, A.VIEWS); pass(V, P.z, P.F); return V.part.greaterThan(1.5).select(vec4(0, 0, 2, 1), P.clip); })();   // (a chunk's plane, where its level has them, is no part of a view: behind the far plane)
    const tileV = Fn(() => {
      // (a chunk's plane over its own corners only: its range of the chunks' list, CL, as many corners drawn as its row's
      // largest chunk has, those past its own behind the far plane, not drawn)
      const col = int(pictureOf()), tile = rowU.mul(tilesU).add(col), c = tile.div(3), a = tile.sub(c.mul(3)), clip = vec4(0, 0, 2, 1).toVar();   // (col: its tile of the row, pictureOf: a row is baked a few tiles at a time)
      const from = cellsU.element(c.mul(4)).w, many = cellsU.element(c.mul(4).add(1)).w, blo = cellsU.element(c.mul(4).add(2)).xyz, bhi = cellsU.element(c.mul(4).add(3)).xyz;
      If(c.lessThan(nU).and(vertexIndex.lessThan(uint(many))), () => { const V = vertexAt(CL.node.element(uint(from).add(vertexIndex))), P = tileClip(V.position, blo, bhi, a, float(col), float(tilesU)); pass(V, P.z.mul(2).sub(1), planeFrame(a)); clip.assign(P.clip); });
      return clip;
    })();
    const N = (j) => D().numOf(kindU, j), leafA = () => tex.a(floor(vTwig.greaterThan(0.5).select(N(3).x, N(2).z).add(0.5)), vUv).bias(-2);
    const colourF = Fn(() => {
      const out = vec4(0).toVar();
      If(vPart.greaterThan(0.5), () => { const T = leafA(); If(T.a.lessThan(0.45), () => { Discard(); }); out.assign(vec4(T.rgb, 1)); })
        .Else(() => { const W = tex.a(floor(N(2).w.add(0.5)), vUv); out.assign(vec4(W.rgb.mul(mix(0.74, 1, W.a)), 1)); });
      return out;
    })();
    // (its light: the light that reaches into it, as its mesh has it, the kit's ao; nothing laid on top, so its picture
    // is lit as its mesh is where it hands over)
    const dataF = Fn(() => { If(vPart.greaterThan(0.5), () => { If(leafA().a.lessThan(0.45), () => { Discard(); }); }); return vec4(facingEnc(vN), vZ.mul(0.5).add(0.5), litIn(vAo, step(0.5, vPart))); })();
    const mat = (v, f) => { const m = new THREE.NodeMaterial(); m.vertexNode = v; m.fragmentNode = f; m.side = THREE.DoubleSide; return m; };
    const geo = new THREE.InstancedBufferGeometry(), tgeo = new THREE.InstancedBufferGeometry(), mesh = (g, v, baker) => Object.assign(new THREE.Mesh(g, null), { frustumCulled: false, userData: { target: baker.samples, materials: [mat(v, mrt({ output: colourF, data: dataF }))] } });   // (its colour and its data drawn at once: src/detail/impostor.js createBaker)   // (tgeo: no corners of its own, its vertex stage reads them)
    return (M = { kindU, levelU, rowU, sphereU, nU, cells, CL, geo, tgeo, view: mesh(geo, viewV, bakers(renderer).views()), tile: mesh(tgeo, tileV, bakers(renderer).tiles(G.tiles)) });   // (each drawn by its baker into its samples: userData.target)
  };
  // what a shape shows, on the whole (src/detail/seen.js), read from its pictures as they are baked or kept: their least
  // level (each texel already its cover's mean of those under it: src/detail/impostor.worker.js), as its impostor shows
  // it farthest, where the land takes over. Each picture alike (the land is seen from any of its views), each texel by its
  // cover: its albedo, the square of what its colour keeps (src/detail/atlas.js PICTURES), its leaves (by its leaf
  // picture) in its kind's green and its plants' own, on the whole (GREEN), as its impostor tints them (mix(1, tint, leaf))
  const kindOfShape = (k) => G.kinds.find((Kd) => k >= Kd.offset && k < Kd.offset + Kd.shapes);
  const seenIn = (k, levels) => {
    const Lv = levels?.at(-1); if (!Lv) return;
    const n = Lv.n, cell = n / A.VIEWS, Kd = kindOfShape(k), Tn = G.numbers.subarray(k * 20 + 1, k * 20 + 4), T = [0, 1, 2].map((c) => Tn[c] * green[c] - 1), sum = [0, 0, 0], P = [0, 0, 0];
    let pics = 0;
    for (let py = 0; py < A.VIEWS; py++) for (let px = 0; px < A.VIEWS; px++) {
      let w = 0; P.fill(0);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const o = (py * cell + y) * n + px * cell + x, a = Lv.colour[o * CH.colour + 3] / 255, f = Lv.leaf[o * CH.leaf] / 255; if (!(a > 0)) continue;
        w += a; for (let c = 0; c < 3; c++) P[c] += a * (Lv.colour[o * CH.colour + c] / 255) ** 2 * (1 + f * T[c]);
      }
      if (w > 0) { for (let c = 0; c < 3; c++) sum[c] += P[c] / w; pics++; }
    }
    if (pics) shows(Kd.asset, k - Kd.offset, Kd.shapes, sum.map((v) => v / pics), crownCover(levels[0], A.VIEWS));   // (and how much of its round its crown covers: crownCover)
  };
  // its numbers, once its pictures are in: its sphere; T, its impostor's error (metres, at scale 1: its views' texel and
  // what their spacing and its parallax misplace, as the crowd kit measured it for these atlases: its far data's sixth
  // number), which the one ratio holds against the dial (meshShare)
  const numbers = (k, far) => {
    const row3 = G.numbers.subarray(k * 20 + 12, k * 20 + 16);
    row3[2] = far[6];
    D().setNum(k, 4, [far[1], far[2], far[3], far[4]]); D().setNum(k, 3, row3);
    version++; any = true;
  };
  // What the browser keeps of them (src/core/kept.js): each shape's pictures as the workers mipped them, under its own kind
  // and variant in its stand (keyOf), as made by exactly what made them (keptFor): what bakes them (BAKER: this file and the inputs it
  // names), the atlases' numbers and its stand's tiles, its stand's levels (the rooms its meshes are made at), its own
  // recipe's version (its kits and what it uses with it) and the paintings it wears (their `paint`: their code and
  // numbers and the painter's). A start that finds them puts them in and bakes nothing; a deploy that changed none of
  // that for a shape bakes it not again, whatever else changed (2026-11-19, the master: every deploy baked every shape).
  const ofShape = (k) => { const Kd = kindOfShape(k); return { Kd, v: k - Kd.offset }; };
  const keyOf = (k) => { const { Kd, v } = ofShape(k); return `far: ${G.name}: ${Kd.asset.uid}: ${v}`; };   // (its stand's too: a kind in two stands' layers is baked for each)
  const keptFor = (k) => {
    const { Kd } = ofShape(k), worn = [...Object.values(Kd.asset.materials ?? {}), Kd.asset.fine?.twig].filter(Boolean);
    return `far|${BAKER}|${A.key}|${G.tiles}|${G.levelsKey}|${versionOf(Kd.asset.uid)}|${worn.map((u) => manifest[recipe(u).uid]?.paint ?? versionOf(u)).join()}`;
  };
  // (a promise of { done }: its pictures drawn and read back, the bakers free for the next shape; done, once they are
  // in the atlases and its numbers say so)
  // (a chunks' corner list into the bake's buffer, made larger first where it would not fit: to the next power of two,
  // so a stand's lists grow it a few times at the most, not at every bake)
  const cornersInto = (CL, list) => { if (list.length > CL.made) CL.made = CL.make(2 ** Math.ceil(Math.log2(list.length))) / 4; CL.write(0, list); };
  // (each shape's far data from its outline, where its workers reckoned it: assets/kit/tree.js farOf)
  const outlineFar = G.kinds.flatMap((Kd) => Array.from({ length: Kd.shapes }, (_, v) => Kd.asset.farOf?.(A)?.[v]?.data ?? null));
  const OF = (k) => (outlineFar[k] ? Float32Array.from(outlineFar[k]) : null);
  // (a shape's job from its outline's far data at whichever of its levels comes first (the workers reckon it:
  // outlinesAhead), so a shape no plant has come near is baked too; else from its finest level's, as it comes: onBlock)
  const fromOutline = (k) => { const far = OF(k); if (queued[k] || !far) return; const J = { k, far, c0: null, t0: null, of: null, at: levelsOf(far), corners: { views: null }, tiles: null }; queuedAs(k); waiting.set(k, J); kept(J); };
  // (what a block of one of its levels brings a shape's job: the corners its pictures are drawn from, its cards in their
  // chunks, found from the block itself: a coarser level's cards are a first share of the finest's, the same chunks)
  const capture = (J, b, j, idx, elems, cornersOf) => {
    const chunked = () => chunkOrder(b, j, idx, elems, chunksOfCards(b, j, idx, elems, J.far), J.far[0]);
    if (J.at.views === b.l && !J.corners.views) J.corners.views = cornersOf();
    if (J.far[0] > 0 && J.at.tiles === b.l && !J.tiles) J.tiles = chunked();
    if (b.l === 0 && !J.c0) { J.c0 = cornersOf(); if (J.far[0] > 0) J.t0 = chunked(); }
  };
  // (what the browser kept of a shape, put in as it is read back: only what it has not kept waits to be baked)
  const kept = (J) => keptGet(keptFor(J.k), keyOf(J.k)).then((rec) => {
    if (!rec) return queue.push(J);
    waiting.delete(J.k); views.put(J.k, rec.views); if (rec.clumps && G.clumpLayer[J.k] >= 0) clumpsOf().put(G.clumpLayer[J.k], rec.clumps);
    numbers(J.k, J.far); seenIn(J.k, rec.views); left.delete(J.k);
  }, () => queue.push(J));
  const job = async ({ k, at, corners, tiles, far }) => {
    const key = keyOf(k), B = materials(); B.levelU.value = at.views; B.geo.setIndex(new THREE.BufferAttribute(corners.views, 1)); B.kindU.value = k; B.sphereU.value.set(far[1], far[2], far[3], far[4]);
    const a = await bakers(renderer).views().bake(views, k, A.VIEWS, (r) => { B.rowU.value = r; B.geo.instanceCount = A.VIEWS; return B.view; });
    const nc = far[0];
    let b = null;
    if (nc > 0 && G.clumpLayer[k] >= 0) {
      const T = tiles;   // (its tile level's corners in its chunks' order: chunkOrder)
      for (let c = 0; c < nc; c++) for (let q = 0; q < 4; q++) B.cells[c * 4 + q].set(far[8 + c * 12 + q * 3], far[8 + c * 12 + q * 3 + 1], far[8 + c * 12 + q * 3 + 2], q === 0 ? T.start[c] : q === 1 ? T.count[c] : 0);
      B.nU.value = nc;
      B.levelU.value = at.tiles; cornersInto(B.CL, T.list);
      const per = G.tiles, rows = Math.ceil((nc * 3) / per), most = Uint32Array.from({ length: rows }, (_, r) => { let m = 0; for (let t = r * per; t < Math.min((r + 1) * per, nc * 3); t++) m = Math.max(m, T.count[Math.floor(t / 3)]); return m; });
      b = await bakers(renderer).tiles(per).bake(clumpsOf(), G.clumpLayer[k], rows, (r) => { B.rowU.value = r; B.tgeo.instanceCount = per; B.tgeo.setDrawRange(0, most[r]); return B.tile; });
    }
    return { done: Promise.all([a.done, b?.done]).then(([va, vb]) => { keptPut(keptFor(k), key, { views: va, clumps: vb ?? null, far: Array.from(far) }); numbers(k, far); seenIn(k, va); }) };
  };
  return {
    views, clumps: () => clumpsOf(), version: () => version, ready: () => any,
    /** What bakes its pictures: the view's and the tile's meshes, each with its two materials (userData.materials), as
        the start compiles them (tools/smoke.js builds them; a bake makes none other) */
    meshes: () => { const B = materials(); return [B.view, B.tile]; },
    /** A block of a level as it comes (drawer.js blockIn): its finest level's carries each shape's far data, after its
        vertices (where: its numbers' slots 14 and 15); a coarser level's, the corners of each shape whose pictures are
        drawn from it (levelsOf: a stand's levels come finest first, in one message, drawer.js fill) */
    onBlock(b, k0, nk, idx, elems) {
      for (let j = 0; j < nk; j++) {
        const k = k0 + j, cornersOf = () => b.corners.slice(j * idx, j * idx + b.draws[j]);
        fromOutline(k);
        const J = waiting.get(k); if (J) capture(J, b, j, idx, elems, cornersOf);
        if (b.l !== 0 || queued[k]) continue;
        const o = j * elems * 4, at = unhalf(b.verts[o + 7] & 0xffff) * 1024 + unhalf(b.verts[o + 7] >>> 16); if (!(at > 0)) continue;
        const head = new Float32Array(b.verts.buffer, b.verts.byteOffset + (o + at * 8) * 4, 8), far = new Float32Array(b.verts.buffer, b.verts.byteOffset + (o + at * 8) * 4, 8 + head[0] * 12).slice();
        const c0 = cornersOf(), L = levelsOf(far), of = far[0] > 0 ? chunksOfCards(b, j, idx, elems, far) : null, t0 = of && chunkOrder(b, j, idx, elems, of, far[0]);
        const J0 = { k, far, c0, t0, of, at: L, corners: { views: L.views ? null : c0 }, tiles: of && !L.tiles ? t0 : null }; queuedAs(k); waiting.set(k, J0); kept(J0);
      }
    },
    /** Each frame: the next shape baked, once the levels its pictures are drawn from are in the heap and no other stand's
        is being baked. (A level of it in the heap whose corners came before its finest's, before its pictures' levels
        were known: its pictures drawn from its finest, which is there, never waited for.) */
    pump() {
      if (!shown()) return;   // (after the first frame, in the background: src/core/settle.js shown)
      if (!swept) {   // (once: every shape the browser kept, read back, its far data with it: a start that kept them bakes none)
        swept = true;
        for (let k = 0; k < n; k++) keptDrop(`far: ${G.name}: ${k}`);   // (what was kept by a shape's number in its stand, before each was kept by its own kind: let go)
        for (let k = 0; k < n; k++) if (!queued[k]) keptGet(keptFor(k), keyOf(k)).then((rec) => {
          if (!rec?.far || queued[k]) return;
          queued[k] = 1; views.put(k, rec.views); if (rec.clumps && G.clumpLayer[k] >= 0) clumpsOf().put(G.clumpLayer[k], rec.clumps);
          numbers(k, Float32Array.from(rec.far)); seenIn(k, rec.views);
        }, () => {});
      }
      look();   // (which of them the view wants now)
      if (BAKING || !queue.length) return;
      const H = D().H, ready = (J) => {
        if (!J.corners.views && J.c0 && H.has(J.k, J.at.views)) { J.at.views = 0; J.corners.views = J.c0; }
        if (J.far[0] > 0 && !J.tiles && J.t0 && H.has(J.k, J.at.tiles)) { J.at.tiles = 0; J.tiles = J.t0; }
        return !!J.corners.views && H.has(J.k, J.at.views) && (!(J.far[0] > 0) || (!!J.tiles && H.has(J.k, J.at.tiles)));
      };
      const i = queue.findIndex((J) => due(J.k) && ready(J)); if (i < 0) return;
      const J = queue.splice(i, 1)[0];
      BAKING = true; waiting.delete(J.k); const fail = (e) => console.warn(`plants: ${G.name}: the far end of shape ${J.k} could not be baked`, e);
      job(J).then(({ done }) => { BAKING = false; done.catch(fail).finally(() => left.delete(J.k)); }, (e) => { BAKING = false; fail(e); left.delete(J.k); });
    },
  };
}
