// The detail engine (intent 0002): one way for every asset to choose its level of detail, whatever it is. It holds no
// number of any asset: an asset's file keeps its own `detail` block (its levels, near to far), assets/kinds.js the
// defaults of its kind (px, measure, fade, sink). Read README.md here before writing an engine or a new kind of asset.
//   - measure.js: how large a thing is on the screen, the one measure every level is chosen by (intent 0038);
//   - here: what is measured (assets/kinds.js: sizeOf), an asset's levels resolved (detailOf), and a placed asset's
//     levels as one object (Detailed);
//   - handover.js: how a level comes and goes, for every engine, on the GPU and in JS;
//   - impostor.js: a placed asset's far card.
import * as THREE from 'three/webgpu';
import { U } from '../core/uniforms.js';
import { kindRule, spanOf } from '../../assets/kinds.js';
import { handOverAt } from './handover.js';
import { pxOn } from './measure.js';
import { LADDER, FULLN, DOTN } from '../../assets/kit/ladder.js';

// (the measure's, here too for whoever asked here before it had a file of its own: the library, tools/sweep.js)
export { pxK, distanceAt } from './measure.js';

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
  if (imp) levels.push({ impostor: true, i: levels.length, lo: imp.px });
  levels.forEach((l, i) => (l.hi = i ? levels[i - 1].lo : Infinity));
  return { levels, fade, cut: levels.length ? levels[levels.length - 1].lo : 0, casts: d.casts ?? kindRule(a, 'casts') ?? true, sink: d.sink ?? kindRule(a, 'sink') ?? 0 };
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
    const px = (this.px = pxOn(this.span, d * U.uLodInv.value));   // the lens and the detail governor count, as for the scatter (measure.js)
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
