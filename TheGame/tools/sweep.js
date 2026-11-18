// The camera-still sweep (intent 0033, checks 2 and 3 with the camera's own motion taken out): the camera held on one
// thing, nothing moving, the clock stopped, and only the detail factor lowered, evenly in its logarithm, over a few
// hundred frames, so the thing passes from its nearest detail to where it ends while its picture stays the same size.
// Every change between two frames is then the detail engine's. In the game's console:
//   const S = await import('/tools/sweep.js'); await S.sweep({ target: 'boulder' })
// -> { frames, px: [its size on screen each frame, as the engine reckons it], diff: [mean change from the frame before,
//    0 … 255, over its box], worst: { at, ratio } (the largest step against the median of its ten neighbours) }.
// Targets: 'boulder', 'stones' (a field of them), 'tent', 'firepit', or { x, z, y, r } (a point and how far round it to
// frame). `scale`: the screen's pixels the engine counts by (2160: a 4K screen, intent 0008's gate). Only the engines
// named in `keep` are drawn, with the land (the grass's own detail is not this sweep's).
import * as THREE from 'three/webgpu';

const R = () => performance.getEntriesByType('resource').map((e) => e.name);
const mod = (part) => import(R().filter((n) => n.includes(part)).at(-1));
export const TENT = [-1262.6, 631];

/** Where a target lies: { x, z, y (its middle's height), r (how far round it to frame), keep (the engines drawn) }. */
export async function find(target) {
  if (typeof target === 'object') return { keep: ['boulder', 'stone', 'placed'], ...target };
  const { heightAt } = await mod('src/world/land.js');
  if (target === 'tent' || target === 'firepit') {
    const { PLACES } = await import('/world/places.js'), P = target === 'tent' ? PLACES.tent : PLACES.fire, h = target === 'tent' ? 3 : 0.5;
    return { x: P.x, z: P.z, y: heightAt(P.x, P.z) + h / 2, r: target === 'tent' ? 3.2 : 1.2, keep: ['placed'] };
  }
  const { rocksAround } = await mod('src/world/rocksolid.js'), found = [];
  for (const reach of [150, 400, 1200]) { rocksAround(TENT[0], TENT[1], reach, (q) => found.push(q)); if (found.some((q) => (target === 'boulder' ? q.s > 2 : q.s < 0.6))) break; }
  if (target === 'boulder') { const q = found.filter((q) => q.s > 2).sort((a, b) => Math.hypot(a.x - TENT[0], a.z - TENT[1]) - Math.hypot(b.x - TENT[0], b.z - TENT[1]))[0]; return { x: q.x, z: q.z, y: heightAt(q.x, q.z) + q.s * 0.25, r: q.s * 0.6, keep: ['boulder'] }; }
  // a field of stones: the densest spot of small ones near the tent, framed 3 m round
  const small = found.filter((q) => q.s < 0.6); let best = small[0], bn = 0;
  for (const q of small) { const n = small.filter((o) => Math.hypot(o.x - q.x, o.z - q.z) < 3).length; if (n > bn) { bn = n; best = q; } }
  return { x: best.x, z: best.z, y: heightAt(best.x, best.z) + 0.1, r: 3, keep: ['stone'] };
}

/** The sweep. from, to: the detail governor's inverse at the first and the last frame; frames; scale: the screen
    height the engine counts by; w, h: the picture's size; dir: where the camera stands, from the target (a unit
    vector, flat); up: how far it looks down; stills: how many of the frames to hand back as pictures (RGBA). */
export async function sweep({ target = 'boulder', from = 1.05, to = 1500, frames = 300, scale = 2160, dir = [0.6, 0.8], up = 0.35, stills = 0, keepAll = false, settle = 15000, log = false } = {}) {
  const s = window.__game, { renderer, camera, scene } = s, { U } = await mod('src/core/uniforms.js'), { pxK } = await mod('src/detail/index.js'), { heightAt } = await mod('src/world/land.js'), { setPlanes } = await mod('src/core/frustum.js');
  const T = await find(target), keep = new Set(T.keep), w = s.screen.target.width, h = s.screen.target.height;
  s.covered = true; s.governor.hold(true);   // (the game's own frames neither choose nor draw meanwhile: src/boot.js)
  const was = { pxk: U.uPxK.value, time: U.uTime.value, vis: s.scatter.tiers.map((t) => (t.meshes ?? [t.mesh]).map((m) => m.visible)) };
  // (the engine counts as a screen `scale` pixels tall would: its lens's measure, and every tier's reach, reckoned by it)
  const ih = Object.getOwnPropertyDescriptor(window, 'innerHeight'); Object.defineProperty(window, 'innerHeight', { get: () => scale, configurable: true });
  U.uPxK.value = pxK(scale); s.scatter.tiers.forEach((t) => t.band?.());
  // the camera: as far off as frames the target's reach in the middle half of the picture, looking at it
  const fov = 40, d = T.r / Math.tan(((fov / 2) * Math.PI) / 180) / 0.55, dl = Math.hypot(dir[0], dir[1]), cx = T.x + (dir[0] / dl) * d * Math.cos(up), cz = T.z + (dir[1] / dl) * d * Math.cos(up), cy = Math.max(T.y + d * Math.sin(up), heightAt(cx, cz) + 1);
  camera.position.set(cx, cy, cz); camera.fov = fov; camera.aspect = w / h; camera.updateProjectionMatrix(); camera.lookAt(T.x, T.y, T.z); camera.updateMatrixWorld();
  // (drawn into the game's own target: a target of another make has every pipeline made again for it, minutes each on a
// software GPU; the picture is read before the game draws into it again)
const pm = new THREE.Matrix4(), rt = s.screen.target, time = was.time + 1000;
  // (only the target's own engine is drawn, over black: the land's, the sky's and the grass's own detail are not this
  // sweep's, and a software GPU draws a frame of the whole world in tens of seconds)
  const mine = (t) => [...keep].some((k) => String(t.asset ?? '').toLowerCase().includes(k)), ours = new Set(); s.scatter.tiers.forEach((t) => { if (mine(t)) for (const m of t.meshes ?? [t.mesh]) ours.add(m); });   // (a tier's asset: its asset's name, or its engine's id)
  const shown = scene.children.map((o) => o.visible);
  const hide = () => { if (keepAll) return; scene.children.forEach((o) => { if (!ours.has(o) && !(o.isLight) && !(T.keepObj?.(o))) o.visible = false; }); };
  const frame = async (inv) => {
    U.uLodInv.value = inv; U.uTime.value = time; U.uCam.value.copy(camera.position);
    const p = camera.position, g = heightAt(p.x, p.z), dy = Math.max(0, p.y - g - 2); U.uDy.value = dy; U.uAirH.value = Math.max(0, p.y - g);
    setPlanes(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); s.ground.update(p.x, p.z, dy, 1 / inv); s.terrain.update(camera, dy, inv); s.scatter.select(p.x, p.z, g, 1 / inv, dy); hide();
    s.weather.before(camera, g); s.shadows.render(scene, camera, g);
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
    return new Uint8Array(await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h));
  };
  // first, the nearest detail asked for and let come (the full meshes are made in the workers as the camera comes)
  const t0 = performance.now(); while (performance.now() - t0 < settle) { const a = performance.now(); await frame(from); if (log) console.log(`sweep: settle frame ${Math.round(performance.now() - a)} ms`); await new Promise((r) => setTimeout(r, 200)); }
  // its box on screen: where the target's reach projects (the change is read there only)
  const c = new THREE.Vector3(T.x, T.y, T.z).project(camera), e = new THREE.Vector3(T.x, T.y + T.r, T.z).project(camera), rr = Math.abs(e.y - c.y) * h / 2 * 1.3;
  const bx = Math.round((c.x + 1) / 2 * w), by = Math.round((c.y + 1) / 2 * h), x0 = Math.max(0, Math.round(bx - rr * 1.4)), x1 = Math.min(w, Math.round(bx + rr * 1.4)), y0 = Math.max(0, Math.round(by - rr)), y1 = Math.min(h, Math.round(by + rr));
  const out = { target: T, scale, box: [x0, y0, x1, y1], inv: [], px: [], diff: [], stills: [] };
  let prev = null; const every = stills ? Math.max(1, Math.floor(frames / stills)) : 0;
  for (let i = 0; i < frames; i++) {
    const a = performance.now(), inv = from * (to / from) ** (i / (frames - 1)), img = await frame(inv); if (log) console.log(`sweep: frame ${i} ${Math.round(performance.now() - a)} ms`);
    out.inv.push(+inv.toFixed(4)); out.px.push(+((2 * T.r * U.uPxK.value) / (d * inv)).toFixed(2));
    if (prev) { let sum = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if ((x - bx) ** 2 + (y - by) ** 2 > rr * rr) continue; const o = (y * w + x) * 4;   // (a disc round the target: what else stands in the picture changes at its own sizes)
  sum += Math.abs(img[o] - prev[o]) + Math.abs(img[o + 1] - prev[o + 1]) + Math.abs(img[o + 2] - prev[o + 2]); n += 3; } out.diff.push(+(sum / Math.max(1, n)).toFixed(4)); }
    if (every && i % every === 0) out.stills.push({ i, px: out.px[i], data: Array.from(img) });
    prev = img;
  }
  out.worst = worst(out.diff);
  // the game as it was
  Object.defineProperty(window, 'innerHeight', ih); s.scatter.tiers.forEach((t) => t.band?.()); U.uPxK.value = was.pxk; scene.children.forEach((o, k) => (o.visible = shown[k])); s.scatter.tiers.forEach((t, k) => (t.meshes ?? [t.mesh]).forEach((m, j) => (m.visible = was.vis[k][j]))); s.governor.hold(false); s.covered = false;
  return out;
}

/** The largest step of a run of changes against the median of its ten neighbours (floor: a change under it is not a
    step, whatever its neighbours: the land's own flicker): { at, ratio, value }. */
export function worst(diff, floor = 0.05) {
  let best = { at: -1, ratio: 0, value: 0 };
  for (let i = 0; i < diff.length; i++) {
    const nb = []; for (let j = Math.max(0, i - 5); j <= Math.min(diff.length - 1, i + 5); j++) if (j !== i) nb.push(diff[j]);
    nb.sort((a, b) => a - b); const med = Math.max(floor, nb[nb.length >> 1] ?? 0), r = diff[i] / med;
    if (diff[i] > floor && r > best.ratio) best = { at: i + 1, ratio: +r.toFixed(2), value: diff[i] };
  }
  return best;
}
