// The detail engine (intent 0002): one way for every asset to choose its level of detail, whatever it is. It holds no
// number of any asset: an asset's file keeps its own `detail` block (its levels, near to far), assets/kinds.js the
// defaults of its kind (px, measure, fade, sink). Read README.md here before writing an engine or a new kind of asset.
//   - here: what is measured (sizeOf), through which lens (pxK), an asset's levels resolved (detailOf), and a placed
//     asset's levels as one object (Detailed);
//   - handover.js: how a level comes and goes, for every engine, on the GPU and in JS;
//   - impostor.js: a placed asset's far card.
import * as THREE from 'three/webgpu';
import { U } from '../core/uniforms.js';
import { kindRule } from '../../assets/kinds.js';
import { handOverAt } from './handover.js';
import { LADDER, FULLN, DOTN } from '../../assets/kit/ladder.js';

/** the larger end of a size that varies ([min, max]), or the size */
export const most = (v) => (Array.isArray(v) ? v[1] : v);
/** The asset's largest side in metres: what its size on screen is measured by. */
export const spanOf = (a) => Math.max(most(a.size.length), most(a.size.width ?? 0), most(a.size.height ?? 0));

/** What an asset's size on screen is measured by, metres: its largest side, or, for a kind that says `measure: 'height'`
    (a tree: tall, and its crown's width little to its distance), its height. One answer for every engine and the land. */
export const sizeOf = (a) => (kindRule(a, 'measure') === 'height' ? most(a.size.height) : spanOf(a));

/** Pixels on screen per metre at one metre away, for the walker's 68° lens on a screen this tall. */
export const pxK = (h = innerHeight) => h / (2 * Math.tan((68 / 2) * Math.PI / 180));

/** An asset's levels of detail, resolved: its own `detail` block over its kind's defaults. An asset whose shapes are
    kinds of the heap (src/scatter/heap.js: a rock) says `ladder` instead of levels: its levels are the ladder's
    (assets/kit/ladder.js), as every such kind's, a ball of so many squares an edge each (`ball`; `ladder`: how many its
    full mesh has), the last a dot; `end`: the size on screen it is drawn down to, where that is sooner than the
    ladder's end (a small thing that would be lost in the grass: it shrinks away over its last pixels). */
export function detailOf(a) {
  const d = a.detail || {}, px = d.px || kindRule(a, 'px'), fade = d.fade ?? kindRule(a, 'fade');
  const own = d.ladder ? LADDER.filter((l, i) => !d.end || !i || LADDER[i - 1].px > d.end).map((l) => ({ ball: l.n === FULLN ? d.ladder : l.n === DOTN ? 0 : l.n, px: Math.max(l.px, d.end ?? 0) })) : d.levels || [];
  const levels = own.map((l, i) => ({ ...l, i, lo: l.px ?? px[Math.min(i, px.length - 1)] }));
  const imp = d.impostor ?? kindRule(a, 'impostor');   // after the meshes: one card (src/detail/impostor.js)
  if (imp) levels.push({ impostor: true, views: imp.views ?? 8, i: levels.length, lo: imp.px });
  levels.forEach((l, i) => (l.hi = i ? levels[i - 1].lo : Infinity));
  return { levels, fade, cut: levels.length ? levels[levels.length - 1].lo : 0, casts: d.casts ?? kindRule(a, 'casts') ?? true, sink: d.sink ?? kindRule(a, 'sink') ?? 0 };
}

/** Where a size on screen is reached: metres away, for a thing of span metres, as the walker's lens sees it. */
export const distanceAt = (px, span, h) => (span * pxK(h)) / px;

/** Keep uPxK current: the scatter's levels and every placed asset measure by it. */
export function trackView(onChange) {
  const set = () => { U.uPxK.value = pxK(); onChange?.(); };
  set(); addEventListener('resize', set);
}

/**
 * A placed asset's levels as one object: each frame (three calls update() for every LOD it draws) it measures how
 * large the asset is on screen and shows the one or two levels that size calls for, each with its share of pixels.
 */
export class Detailed extends THREE.LOD {
  constructor(asset, meshes) {
    super(); this.d = detailOf(asset); this.span = spanOf(asset); this.meshes = meshes;
    for (const m of meshes) { if (this.d.casts) m.layers.enable(1); this.add(m); }   // every level casts a shadow, as drawn, unless the asset says not (src/world/shadow.js)
    this.px = 0; this.level = 0;
  }
  update(camera) {
    if (camera.userData.shadow) return;   // the shadow's camera keeps the levels the eye chose
    const d = Math.max(0.01, camera.getWorldPosition(_a).distanceTo(this.getWorldPosition(_b)));
    const px = (this.px = (this.span * U.uPxK.value) / (d * U.uLodInv.value));   // the lens and the detail governor count, as for the scatter
    const { levels, fade } = this.d; let shown = -1;
    for (let i = 0; i < levels.length; i++) {
      // the one hand-over (handover.js): a made thing is of one piece: it changes over whole, half way; its last level sinks
      const H = handOverAt(px, levels[i].lo, levels[i].hi, fade, i === levels.length - 1, this.d.sink), m = this.meshes[i];
      m.visible = H.whole; m.material.sunk.value = H.sunk;
      if (H.whole && shown < 0) shown = i;
    }
    this.level = shown;   // the finest level drawing now (-1: none)
  }
  getCurrentLevel() { return this.level; }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
