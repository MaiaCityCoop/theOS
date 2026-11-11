// The detail engine (intent 0002): one way for every asset to choose its level of detail, by its size on screen, with
// a dithered hand-over between levels so none pops. It holds no number of any asset: each asset's file keeps its own
// `detail` block (its levels, near to far, and any px or fade of its own), and assets/kinds.js the defaults by kind.
//
// A level i is drawn while the asset is between lo (its px) and hi (the level before's px) pixels tall on screen.
// Around each boundary both levels draw, each keeping its share of the pixels by the same screen noise, so together
// they cover every pixel once (DETAIL_GLSL and LIGHT_GLSL's detailCut, src/world/).
import * as THREE from 'three';
import KINDS from '../../assets/kinds.js';

const most = (v) => (Array.isArray(v) ? v[1] : v);
/** The asset's largest side in metres: what its size on screen is measured by. */
export const spanOf = (a) => Math.max(most(a.size.length), most(a.size.width ?? 0), most(a.size.height ?? 0));

/** Pixels on screen per metre at one metre away, for the walker's 68° lens on a screen this tall. */
export const pxK = (h = innerHeight) => h / (2 * Math.tan((68 / 2) * Math.PI / 180));

/** An asset's levels of detail, resolved: its own `detail` block over its kind's defaults. */
export function detailOf(a) {
  const k = KINDS[a.kind] || KINDS.default, d = a.detail || {}, px = d.px || k.px, fade = d.fade ?? k.fade;
  const levels = (d.levels || []).map((l, i) => ({ ...l, i, lo: l.px ?? px[Math.min(i, px.length - 1)] }));
  const imp = d.impostor ?? k.impostor;   // after the meshes: one card (src/detail/impostor.js)
  if (imp) levels.push({ impostor: true, views: imp.views ?? 8, i: levels.length, lo: imp.px });
  levels.forEach((l, i) => (l.hi = i ? levels[i - 1].lo : Infinity));
  return { levels, fade, cut: levels.length ? levels[levels.length - 1].lo : 0, casts: d.casts ?? k.casts ?? true };
}

/** How much of a level shows at px pixels: [share kept, side] (side 0: it is the finer side of a hand-over). */
export function keepOf(px, lo, hi, f) {
  const L = Math.log(Math.max(px, 1e-6)), c = (u) => Math.min(1, Math.max(0, u));
  if (hi !== Infinity && L > Math.log(hi) - f) return [1 - c((L - Math.log(hi) + f) / (2 * f)), 0];
  if (L < Math.log(lo) + f) return [c((L - Math.log(lo) + f) / (2 * f)), 1];
  return [1, 0];
}

/** Where a size on screen is reached: metres away, for a thing of span metres, as the walker's lens sees it. */
export const distanceAt = (px, span, h) => (span * pxK(h)) / px;

/** Keep uPxK current: the scatter's levels and every placed asset measure by it. */
export function trackView(U, onChange) {
  const set = () => { U.uPxK.value = pxK(); onChange?.(); };
  set(); addEventListener('resize', set);
}

/**
 * A placed asset's levels as one object: each frame (three calls update() for every LOD it draws) it measures how
 * large the asset is on screen and shows the one or two levels that size calls for, each with its share of pixels.
 */
export class Detailed extends THREE.LOD {
  constructor(asset, meshes, U) {
    super(); this.d = detailOf(asset); this.span = spanOf(asset); this.U = U; this.meshes = meshes;
    for (const m of meshes) { if (this.d.casts) m.layers.enable(1); this.add(m); }   // every level casts a shadow, as drawn, unless the asset says not (src/world/shadow.js)
    this.px = 0; this.level = 0;
  }
  update(camera) {
    if (camera.userData.shadow) return;   // the shadow's camera keeps the levels the eye chose
    const d = Math.max(0.01, camera.getWorldPosition(_a).distanceTo(this.getWorldPosition(_b)));
    const px = (this.px = (this.span * this.U.uPxK.value) / (d * this.U.uLodInv.value));   // the lens and the detail governor count, as for the scatter
    const { levels, fade } = this.d; let shown = -1;
    for (let i = 0; i < levels.length; i++) {
      const [keep, side] = keepOf(px, levels[i].lo, levels[i].hi, fade), m = this.meshes[i];
      m.visible = keep > 0; m.material.uniforms.uKeep.value.set(keep, side);
      if (keep > 0 && shown < 0) shown = i;
    }
    this.level = shown;   // the finest level drawing now (-1: none)
  }
  getCurrentLevel() { return this.level; }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
