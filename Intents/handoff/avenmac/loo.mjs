import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:5180/game/?gputime', { waitUntil: 'load', timeout: 90000 });
await p.waitForFunction(() => window.__game?.scatter && window.__game?.governor, null, { timeout: 180000 });
await p.waitForTimeout(5000);
const r = await p.evaluate(async () => {
  const B = await import('/game/tools/bench.js'), s = window.__game, { renderer, camera, U, scene } = s;
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const { poseAt } = await mod('src/camera/rig.js'), { setPlanes } = await mod('src/core/frustum.js'), { heightAt } = await mod('src/world/land.js');
  s.covered = true; s.governor.hold(true);
  const v = B.VIEWS[4], pm = camera.projectionMatrix.clone();
  const P = poseAt(v.x, v.z, v.yaw, v.h, -0.05); camera.position.set(...P.pos); camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch, P.yaw, 0); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const pp = camera.position, g = heightAt(pp.x, pp.z), dy = Math.max(0, pp.y - g - 2); U.uDy.value = dy; U.uAirH.value = Math.max(0, pp.y - g); U.uLodInv.value = 1;
  setPlanes(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); s.ground.update(pp.x, pp.z, dy, 1); s.terrain.update(camera, dy, 1); s.scatter.select(pp.x, pp.z, g, 1, dy);
  const time = async (f, n = 20) => { f(); await renderer.resolveTimestampsAsync('render'); const xs = []; for (let i = 0; i < n; i++) { f(); xs.push((await renderer.resolveTimestampsAsync('render')) || 0); } xs.sort((a, b) => a - b); return +xs[n >> 1].toFixed(2); };
  const kids = scene.children.filter((o) => o.visible), tierOf = new Map(); for (const t of s.scatter.tiers) for (const m of t.meshes ?? [t.mesh]) tierOf.set(m, t.asset);
  const grp = { land: (o) => o === s.terrain.landMesh, trees: (o) => tierOf.get(o) === 'Pine forest: trees', plants: (o) => tierOf.has(o) };
  const draw = () => { s.shadows.render(scene, camera, g); renderer.render(scene, camera); };
  const out = {};
  for (const ratio of [1.5, 3]) {
    renderer.setPixelRatio(ratio); const o = (out[ratio] = {});
    for (let rep = 0; rep < 3; rep++) {
      const add = (k, x) => (o[k] = [...(o[k] || []), x]);
      add('all', await time(draw));
      for (const [k, f] of Object.entries(grp)) { kids.forEach((x) => (x.visible = !f(x))); add('no ' + k, await time(draw)); kids.forEach((x) => (x.visible = true)); }
      kids.forEach((x) => (x.visible = grp.land(x))); add('land only', await time(() => renderer.render(scene, camera))); kids.forEach((x) => (x.visible = true));
    }
  }
  return out;
});
console.log(JSON.stringify(r, null, 0));
await b.close();
