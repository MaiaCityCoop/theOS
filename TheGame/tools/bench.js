// A timing of the game's frame at fixed views (in the game's console: `await (await import('/game/tools/bench.js')).bench()`):
// each view drawn n times, shadows as the game draws them. Opened with ?gputime, it reads the GPU's own time per frame
// (timestamp queries); otherwise the wall's, waiting for the GPU to finish (unreliable in a hidden or background tab).
export const VIEWS = [
  { name: 'tent, eye level', x: -1262.6 + 14 * -Math.sin(0.1), z: 631 + 14 * -Math.cos(0.1), yaw: Math.atan2(-Math.sin(0.1), -Math.cos(0.1)), h: 1.7 },
  { name: 'river bend, 26 m', x: -1334.8, z: 808.6, yaw: 0.9, h: 26 },
  { name: 'town, 40 m', x: -1262.6, z: 631, yaw: 0.3, h: 40 },
  { name: 'skyline, 2.5 km', x: -1262.6, z: 631, yaw: 0.3, h: 2500 },
  { name: 'pine forest, eye level', x: -1383.6, z: 634.1, yaw: -4.14, h: 1.7 },
  { name: 'pine forest, 90 m', x: -1290, z: 618, yaw: -4.54, h: 90 },
];
/** The hard gate: a frame's GPU time at most this (ms), at every view, so 60 fps holds with room for the CPU and the
    browser's own work (16.7 ms a frame in all). */
export const BUDGET = 12;
export async function bench({ ratio = 1.5, frames = 60 } = {}) {
  const s = window.__s8, { renderer, camera, U } = s, R = performance.getEntriesByType('resource').map((e) => e.name);
  const mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const { poseAt } = await mod('src/camera/rig.js'), { setPlanes } = await mod('src/core/frustum.js'), { heightAt } = await mod('src/world/land.js');
  const fin = async () => { if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone(); else { const gl = renderer.backend.gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } };
  const pm = camera.projectionMatrix.clone(), was = renderer.getPixelRatio(); renderer.setPixelRatio(ratio); s.governor.hold(true);
  const frame = (v) => {
    const P = poseAt(v.x, v.z, v.yaw, v.h, -0.05); camera.position.set(...P.pos); camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch, P.yaw, 0); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const p = camera.position, g = heightAt(p.x, p.z), dy = Math.max(0, p.y - g - 2); U.uDy.value = dy; U.uAirH.value = Math.max(0, p.y - g); U.uLodInv.value = 1;
    setPlanes(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); s.ground.update(p.x, p.z, dy, 1); s.terrain.update(camera, dy, 1); s.scatter.select(p.x, p.z, g, 1, dy);
    s.weather.before(camera, g); s.shadows.render(s.scene, camera, g); renderer.render(s.scene, camera);
  };
  const out = {};
  const gpu = renderer.backend.trackTimestamp;   // the game opened with ?gputime: the GPU's own time, not the wall's
  for (const v of VIEWS) {
    frame(v); await fin(); if (gpu) await renderer.resolveTimestampsAsync('render');
    if (gpu) { let sum = 0; for (let i = 0; i < frames; i++) { frame(v); sum += (await renderer.resolveTimestampsAsync('render')) || 0; } out[v.name] = +(sum / frames).toFixed(2); }
    else { const t0 = performance.now(); for (let i = 0; i < frames; i++) frame(v); await fin(); out[v.name] = +((performance.now() - t0) / frames).toFixed(2); }
  }
  out.measure = gpu ? 'GPU time' : 'wall time';
  out.worst = Math.max(...VIEWS.map((v) => out[v.name])); out.pass = out.worst <= BUDGET;
  renderer.setPixelRatio(was); s.governor.hold(false);
  return { ratio, size: [innerWidth, innerHeight], ...out };
}

/** Where a view's GPU time goes (opened with ?gputime): the frame drawn with one part at a time (sky, land, water, each
    scattered thing, the placed assets), the shadow pass and the clouds' map on their own; parts' shares are what count,
    the whole swings with whatever else the GPU is doing. */
export async function parts(view = VIEWS[0], { ratio = 1, frames = 30 } = {}) {
  const s = window.__s8, { renderer, camera, U, scene } = s, R = performance.getEntriesByType('resource').map((e) => e.name);
  const mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const { poseAt } = await mod('src/camera/rig.js'), { setPlanes } = await mod('src/core/frustum.js'), { heightAt } = await mod('src/world/land.js');
  const pm = camera.projectionMatrix.clone(), was = renderer.getPixelRatio(); renderer.setPixelRatio(ratio); s.governor.hold(true);
  const v = view, P = poseAt(v.x, v.z, v.yaw, v.h, -0.05); camera.position.set(...P.pos); camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch, P.yaw, 0); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const p = camera.position, g = heightAt(p.x, p.z), dy = Math.max(0, p.y - g - 2); U.uDy.value = dy; U.uAirH.value = Math.max(0, p.y - g); U.uLodInv.value = 1;
  setPlanes(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); s.ground.update(p.x, p.z, dy, 1); s.terrain.update(camera, dy, 1); s.scatter.select(p.x, p.z, g, 1, dy);
  const time = async (f) => { f(); await renderer.resolveTimestampsAsync('render'); let sum = 0; for (let i = 0; i < frames; i++) { f(); sum += (await renderer.resolveTimestampsAsync('render')) || 0; } return +(sum / frames).toFixed(2); };
  const kids = scene.children.filter((o) => o.visible), tierOf = new Map(); for (const t of s.scatter.tiers) for (const m of t.meshes ?? [t.mesh]) tierOf.set(m, t.asset);
  const groups = { sky: (o) => o.renderOrder === 15, land: (o) => o === s.terrain.landMesh, water: (o) => o === s.terrain.waterMesh };
  for (const a of new Set(tierOf.values())) groups[a] = (o) => tierOf.get(o) === a;
  const named = Object.values(groups); groups.placed = (o) => !named.some((f) => f(o)) && !tierOf.has(o);
  const out = { view: v.name, all: await time(() => renderer.render(scene, camera)), shadow: await time(() => s.shadows.render(scene, camera, g)), weather: await time(() => s.weather.before(camera, g)) };
  for (const [k, f] of Object.entries(groups)) { kids.forEach((o) => (o.visible = f(o))); out[k] = await time(() => renderer.render(scene, camera)); kids.forEach((o) => (o.visible = true)); }
  renderer.setPixelRatio(was); s.governor.hold(false);
  return out;
}
