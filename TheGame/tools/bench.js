// A timing of the game's frame at fixed views (in the game's console: `await (await import('/game/tools/bench.js')).bench()`):
// each view drawn n times, shadows as the game draws them. Opened with ?gputime, it reads the GPU's own time per frame
// (timestamp queries); otherwise the wall's, waiting for the GPU to finish (unreliable in a hidden or background tab).
export const VIEWS = [
  { name: 'tent, eye level', x: -1262.6 + 14 * -Math.sin(0.1), z: 631 + 14 * -Math.cos(0.1), yaw: Math.atan2(-Math.sin(0.1), -Math.cos(0.1)), h: 1.7 },
  { name: 'river bend, 26 m', x: -1334.8, z: 808.6, yaw: 0.9, h: 26 },
  { name: 'town, 40 m', x: -1262.6, z: 631, yaw: 0.3, h: 40 },
  { name: 'skyline, 2.5 km', x: -1262.6, z: 631, yaw: 0.3, h: 2500 },
];
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
    s.shadows.render(s.scene, camera, g); renderer.render(s.scene, camera);
  };
  const out = {};
  const gpu = renderer.backend.trackTimestamp;   // the game opened with ?gputime: the GPU's own time, not the wall's
  for (const v of VIEWS) {
    frame(v); await fin(); if (gpu) await renderer.resolveTimestampsAsync('render');
    if (gpu) { let sum = 0; for (let i = 0; i < frames; i++) { frame(v); sum += (await renderer.resolveTimestampsAsync('render')) || 0; } out[v.name] = +(sum / frames).toFixed(2); }
    else { const t0 = performance.now(); for (let i = 0; i < frames; i++) frame(v); await fin(); out[v.name] = +((performance.now() - t0) / frames).toFixed(2); }
  }
  out.measure = gpu ? 'GPU time' : 'wall time';
  renderer.setPixelRatio(was); s.governor.hold(false);
  return { ratio, size: [innerWidth, innerHeight], ...out };
}
