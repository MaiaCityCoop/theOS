// The city's plots over the land (world/city.js, ./plan.js): from about two kilometres up they come in over the map,
// each village's edge a fine line on the ground and its land a faint wash; the open villages warm, the ones that can open
// next (beside an open one) a soft green. A click picks one and its card tells what it is (./card.js); a village beside
// an open one can be opened from there. Drawn over the ground, not into it (no depth test): from up here the land is
// gentle, and a line is never lost in a hill. Nothing is drawn below the height where the plots start to show.
import * as THREE from 'three/webgpu';
import { attribute, positionGeometry, cameraPosition, vec3, float, uniform, smoothstep, length, varying } from 'three/tsl';
import CITY from '../../world/city.js';
import { heightAt, sstep } from '../world/land.js';
import { inside } from './plan.js';
import { load, save } from '../core/store.js';
import { createCard } from './card.js';

// a plot's colours by its state (display values, as every material here writes them: src/world/light.js): line, wash
const LOOK = {
  plain: { line: [1, 1, 1, 0.42], wash: [1, 1, 1, 0.03] },
  next: { line: [0.8, 1, 0.86, 0.75], wash: [0.78, 1, 0.86, 0.09] },
  open: { line: [1, 0.86, 0.52, 0.95], wash: [1, 0.82, 0.45, 0.17] },
};
const PICKED_WASH = 0.24, HOVER_WASH = 0.07;

/** The city's plots: { update(), plots } — update() after the camera is placed, each frame. */
export function createCity({ scene, camera, canvas, renderer }) {
  const page = location.pathname.replace(/.*\//, '');
  const here = (page === '' || page === 'index.html') && !new URLSearchParams(location.search).has('embed');   // the walk only: not the film, the lenses, the library
  const api = { plots: [], update() {}, ready: false };
  if (!here) return api;

  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const uOp = uniform(0), uW = uniform(0.0011);
  const fadeFar = (p) => float(1).sub(smoothstep(CITY.far[0], CITY.far[1], length(p.sub(cameraPosition))));
  function material(ribbon, widen = 1) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const p = positionGeometry, col = attribute('aCol', 'vec4');
    if (ribbon) { const s = attribute('aSide', 'vec2'); m.positionNode = p.add(vec3(s.x, 0, s.y).mul(length(p.sub(cameraPosition)).mul(uW).mul(widen))); }   // a line as wide on the screen near and far
    m.colorNode = col.rgb; m.opacityNode = col.a.mul(uOp).mul(varying(fadeFar(p)));
    return m;
  }
  let plots = [], byId = new Map(), lineGeo, washGeo, picked = null, hover = null, ring = null, open = new Set([1, ...load('city.open', [])]), citizens = 0, card = null;
  const ringMat = material(true, 2.6);

  // a closed outline as a ribbon: two corners per point, pushed apart along the corner's mitre in the shader
  function ribbon(f, pos, side, at) {
    const n = f.length / 3;
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      let ax = f[i * 3] - f[a * 3], az = f[i * 3 + 2] - f[a * 3 + 2], bx = f[b * 3] - f[i * 3], bz = f[b * 3 + 2] - f[i * 3 + 2];
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; ax /= la; az /= la; bx /= lb; bz /= lb;
      let nx = -(az + bz), nz = ax + bx; const ln = Math.hypot(nx, nz) || 1; nx /= ln; nz /= ln;
      const m = Math.min(2, 1 / Math.max(0.3, nx * -az + nz * ax));
      for (const sgn of [1, -1]) { const v = at + i * 2 + (sgn < 0 ? 1 : 0); pos.set([f[i * 3], f[i * 3 + 1] + 4, f[i * 3 + 2]], v * 3); side.set([nx * m * sgn, nz * m * sgn], v * 2); }
    }
  }
  const quads = (n, at, idx, k) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = at + i * 2, b = at + j * 2; idx.set([a, a + 1, b, b, a + 1, b + 1], k); k += 6; } return k; };

  function build(city) {
    plots = city.plots; byId = new Map(plots.map((p) => [p.id, p])); api.plots = plots; api.spacing = city.spacing;
    let nv = 0; for (const p of plots) { p.v0 = nv; p.n = p.outline.length / 3; nv += p.n; }
    // the lines
    const pos = new Float32Array(nv * 2 * 3), side = new Float32Array(nv * 2 * 2), idx = new Uint32Array(nv * 6); let k = 0;
    for (const p of plots) { ribbon(p.outline, pos, side, p.v0 * 2); k = quads(p.n, p.v0 * 2, idx, k); }
    lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lineGeo.setAttribute('aSide', new THREE.BufferAttribute(side, 2));
    lineGeo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(nv * 2 * 4), 4)); lineGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    // the washes: a fan from each plot's middle (from up here the land under it is near enough flat)
    const wp = new Float32Array((nv + plots.length) * 3), wi = new Uint32Array(nv * 3); let v = 0, t = 0;
    for (const p of plots) {
      p.w0 = v; wp.set([p.x, p.y + 4, p.z], v * 3); const c = v++;
      for (let i = 0; i < p.n; i++) { wp.set([p.outline[i * 3], p.outline[i * 3 + 1] + 4, p.outline[i * 3 + 2]], v * 3); v++; }
      for (let i = 0; i < p.n; i++) { wi.set([c, c + 1 + i, c + 1 + ((i + 1) % p.n)], t); t += 3; }
    }
    washGeo = new THREE.BufferGeometry();
    washGeo.setAttribute('position', new THREE.BufferAttribute(wp, 3)); washGeo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(v * 4), 4)); washGeo.setIndex(new THREE.BufferAttribute(wi, 1));
    const wash = new THREE.Mesh(washGeo, material(false)), lines = new THREE.Mesh(lineGeo, material(true));
    wash.renderOrder = 20; lines.renderOrder = 21; wash.frustumCulled = lines.frustumCulled = false;
    group.add(wash, lines);
    for (const p of plots) paint(p, false);
    lineGeo.attributes.aCol.needsUpdate = washGeo.attributes.aCol.needsUpdate = true;
    card = createCard({ city: { ...city, plots }, open, citizens: () => citizens, stateOf, openPlot, close: () => pick(null) });
    // compiled now, while nothing shows, so the first look from above does not wait for it
    group.visible = true; renderer.compileAsync(group, camera, scene).catch(() => {}).finally(() => { api.ready = true; });
    label.hidden = true;
  }

  const stateOf = (p) => (open.has(p.id) ? 'open' : p.neighbours.some((id) => open.has(id)) ? 'next' : 'plain');
  function paint(p, upload = true) {
    const L = LOOK[stateOf(p)], lc = lineGeo.attributes.aCol.array, wc = washGeo.attributes.aCol.array;
    for (let i = p.v0 * 2; i < (p.v0 + p.n) * 2; i++) lc.set(L.line, i * 4);
    const a = L.wash[3] + (p === picked ? PICKED_WASH : p === hover ? HOVER_WASH : 0);
    for (let i = p.w0; i <= p.w0 + p.n; i++) wc.set([L.wash[0], L.wash[1], L.wash[2], a], i * 4);
    if (upload) lineGeo.attributes.aCol.needsUpdate = washGeo.attributes.aCol.needsUpdate = true;
  }
  function pick(p) {
    const was = picked; picked = p; if (was) paint(was); if (p) paint(p);
    if (ring) { group.remove(ring); ring.geometry.dispose(); ring = null; }
    if (p) {   // the picked plot's edge, drawn wider and white
      const pos = new Float32Array(p.n * 2 * 3), side = new Float32Array(p.n * 2 * 2), idx = new Uint32Array(p.n * 6), col = new Float32Array(p.n * 2 * 4);
      ribbon(p.outline, pos, side, 0); quads(p.n, 0, idx, 0); for (let i = 0; i < p.n * 2; i++) col.set([1, 1, 1, 1], i * 4);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSide', new THREE.BufferAttribute(side, 2)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 4)); g.setIndex(new THREE.BufferAttribute(idx, 1));
      ring = new THREE.Mesh(g, ringMat); ring.renderOrder = 22; ring.frustumCulled = false; group.add(ring);
    }
    card?.show(p);
  }
  function openPlot(p) {
    if (open.has(p.id) || stateOf(p) !== 'next') return;
    open.add(p.id); save('city.open', [...open].filter((id) => id !== 1));
    paint(p); for (const id of p.neighbours) paint(byId.get(id));
    card?.show(p);
  }

  // ---- picking: the point of the ground under the pointer, and the plot it lies in ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function groundAt(cx, cy) {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const o = ray.ray.origin, d = ray.ray.direction;
    let t0 = 0, t = 0;
    for (let i = 0; i < 400 && t < 40000; i++) { t0 = t; t += Math.max(15, t * 0.02); if (o.y + d.y * t < heightAt(o.x + d.x * t, o.z + d.z * t)) break; }
    if (t >= 40000) return null;
    for (let i = 0; i < 12; i++) { const m = (t0 + t) / 2; if (o.y + d.y * m < heightAt(o.x + d.x * m, o.z + d.z * m)) t = m; else t0 = m; }
    return [o.x + d.x * t, o.z + d.z * t];
  }
  const ring2 = [];
  function plotAt(x, z) {
    const S = api.spacing || 2000;
    for (const p of plots) {
      if (Math.abs(p.x - x) > S * 1.3 || Math.abs(p.z - z) > S * 1.3) continue;
      ring2.length = 0; for (let i = 0; i < p.n; i++) ring2.push([p.outline[i * 3], p.outline[i * 3 + 2]]);
      if (inside(ring2, x, z)) return p;
    }
    return null;
  }
  const live = () => group.visible && uOp.value > 0.35 && !document.pointerLockElement;
  let down = null, moved = null;
  canvas.addEventListener('pointerdown', (e) => { down = live() ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 500) return;   // a click, not a drag that turns the view
    const g = groundAt(e.clientX, e.clientY); pick(g ? plotAt(g[0], g[1]) : null);
  });
  canvas.addEventListener('pointermove', (e) => { moved = [e.clientX, e.clientY]; });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && picked) pick(null); });

  // the first village's name, over its middle on the map; and the picked one's
  const label = document.createElement('div'); label.className = 'city-label'; label.hidden = true; document.body.append(label);
  const style = document.createElement('style');
  style.textContent = `.city-label{position:fixed;left:0;top:0;z-index:3;pointer-events:none;transform:translate(-50%,-50%);font:400 19px/1 var(--serif);color:#fff;letter-spacing:.01em;white-space:nowrap;text-shadow:0 1px 2px rgba(12,28,22,.55),0 0 14px rgba(12,28,22,.35)}
  .city-label small{display:block;margin-top:5px;text-align:center;font:600 9.5px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;opacity:.9}`;
  document.head.append(style);
  const v3 = new THREE.Vector3();
  let shownLabel = '';

  // ---- each frame: how much of the plots shows, from the camera's height ----
  let hoverAt = 0;
  api.update = () => {
    if (!plots.length) return;
    const p = camera.position, h = p.y - heightAt(p.x, p.z), film = window.__cine?.playing;
    const op = film ? 0 : sstep(CITY.show[0], CITY.show[1], h);
    uOp.value = op; group.visible = op > 0.002 || !api.ready;
    if (!api.ready) uOp.value = 0;
    if (picked && op < 0.05) pick(null);
    // hovering: the plot under the pointer a little brighter (looked for at most ten times a second)
    const now = performance.now();
    if (moved && live() && now - hoverAt > 100) { hoverAt = now; const g = groundAt(moved[0], moved[1]), q = g ? plotAt(g[0], g[1]) : null; if (q !== hover) { const was = hover; hover = q; if (was) paint(was); if (q) paint(q); canvas.style.cursor = q ? 'pointer' : ''; } moved = null; }
    else if (!live() && hover) { const was = hover; hover = null; paint(was); canvas.style.cursor = ''; }
    // the label
    const core = byId.get(1);
    if (op > 0.05 && core) {
      v3.set(core.x, core.y, core.z).project(camera);
      const on = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      label.hidden = !on;
      if (on) {
        label.style.opacity = String(Math.min(1, op * 1.4));
        label.style.transform = `translate(${((v3.x + 1) / 2) * innerWidth}px, ${((1 - v3.y) / 2) * innerHeight}px) translate(-50%,-50%)`;
        const txt = `${core.name}<small>${citizens.toLocaleString('en')} ${citizens === 1 ? 'citizen' : 'citizens'}</small>`;
        if (txt !== shownLabel) { shownLabel = txt; label.innerHTML = txt; }
      }
    } else label.hidden = true;
  };

  // the citizens living in the city today: the latest story's count (Stories/*/timeline.json, inGame), all in the first village
  (async () => {
    try {
      const base = import.meta.env.BASE_URL, list = await fetch(base + 'story/list').then((r) => r.json()), last = list[list.length - 1];
      if (last) citizens = (await fetch(`${base}story/${last.id}/timeline.json`).then((r) => r.json())).inGame ?? 0;
    } catch {}
    card?.refresh();
  })();

  const worker = new Worker(new URL('./plan.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { build(e.data); worker.terminate(); };
  worker.onerror = (e) => console.warn('[city] the plan failed', e.message);
  return api;
}
