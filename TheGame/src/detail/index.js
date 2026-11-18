// The detail engine (intent 0002): one way for every asset to choose its level of detail, whatever it is. It holds no
// number of any asset, and no asset holds one of its own: an asset says only what it is at full detail, and every rung
// coarser comes where its own error is the one ERROR_PX (src/detail/error.js, intent 0038). Read README.md here before
// writing an engine or a new kind of asset.
//   - error.js: the one measure's rule (a rung's error in metres against the dial, ERROR_PX), plain, for the workers too;
//   - measure.js: how large a thing is on the screen, the one measure every level is chosen by (intent 0038);
//   - here: what is measured (assets/kinds.js: sizeOf), an asset's levels resolved (detailOf), and a placed asset's
//     levels as one object (Detailed);
//   - handover.js: how a level comes and goes, for every engine, on the GPU and in JS;
//   - impostor.js: a placed asset's far card.
import * as THREE from 'three/webgpu';
import { U } from '../core/uniforms.js';
import { kindRule, spanOf } from '../../assets/kinds.js';
import { handOverAt } from './handover.js';
import { atlases } from './impostor.js';
import { spacingOf, depthOf } from './atlas.js';
import { pxOn } from './measure.js';
import { FADE, BAND, GONE, switchPx, dialPx } from './error.js';

// (the measure's, here too for whoever asked here before it had a file of its own: the library, tools/sweep.js)
export { distanceAt } from './measure.js';

/** Where a made thing's far card comes (src/world/place.js): its error is its impostor's (src/detail/atlas.js), a texel
    of its views (CELL of them over the sphere round its faces: at most its box's diagonal) and what their spacing and
    its parallax misplace (spacingOf(VIEWS) times its depth), against its largest side; its views are every impostor's
    (src/detail/impostor.js atlases). */
const CARDS = new WeakMap(), impostorPx = (a) => {
  if (!CARDS.has(a)) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], P = new Float64Array(a.faces.length * 9);
    a.faces.forEach((f, i) => { for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) { const x = f[j][k]; P[i * 9 + j * 3 + k] = x; lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); } });
    const { VIEWS, CELL } = atlases(), e = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / CELL + spacingOf(VIEWS) * depthOf(P);
    CARDS.set(a, e / spanOf(a));   // (its error, a share of its size: the dial says where)
  }
  return switchPx(CARDS.get(a));
};

/** An asset's levels of detail, resolved: { levels: [{ i, lo, hi, … }], fade, cut, casts, sink }, each drawn between lo
    and hi pixels on screen. A plant's are its kit's (assets/kit/plant.js bandsOf). A surface (a rock, a made thing: its
    `faces` or its kit's mesh) has none of its own: every coarser version is the builder's (assets/kit/clusters.js),
    drawn by the cut (src/scatter/cut.js); here it is its faces, whole, for what draws it whole (src/world/place.js: the
    library, a page without WebGPU), then its far card where its kind has one and the page can bake it (card), from
    where the card's error is within ERROR_PX to where it is gone. Every hand-over spans BAND (FADE either side), under
    where the coarser may stand in: its last level is whole down to where leaving it out fits (GONE) and sinks away over
    the BAND under that. */
export function detailOf(a, { card = true } = {}) {
  const d = a.detail || {};
  const own = d.levels || (a.faces ? [{ faces: a.faces }] : []);
  const imp = card && a.faces && (d.impostor ?? kindRule(a, 'impostor'));   // (after its faces: one card, src/detail/impostor.js)
  const end = GONE / BAND, levels = own.map((l, i) => ({ ...l, i, lo: l.lo ?? (imp ? impostorPx(a) : end) }));
  if (imp && levels.length) levels.push({ impostor: true, i: levels.length, lo: end });
  levels.forEach((l, i) => (l.hi = i ? levels[i - 1].lo : Infinity));
  return { levels, fade: FADE, cut: levels.length ? levels[levels.length - 1].lo : 0, casts: a.casts ?? d.casts ?? kindRule(a, 'casts') ?? true, sink: BAND };
}

/**
 * A placed asset's levels as one object: each frame (three calls update() for every LOD it draws) it measures how
 * large the asset is on screen and shows the one or two levels that size calls for, each with its share of pixels.
 */
export class Detailed extends THREE.LOD {
  constructor(asset, meshes, d = detailOf(asset)) {
    super(); this.d = d; this.span = spanOf(asset); this.meshes = meshes;
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
      const H = handOverAt(dialPx(px), levels[i].lo, levels[i].hi, fade, i === levels.length - 1, this.d.sink), m = this.meshes[i];   // (in dial pixels, as its levels: src/detail/error.js)
      m.visible = H.whole; m.material.sunk.value = H.sunk;
      if (H.whole && shown < 0) shown = i;
    }
    this.level = shown;   // the finest level drawing now (-1: none)
  }
  getCurrentLevel() { return this.level; }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
