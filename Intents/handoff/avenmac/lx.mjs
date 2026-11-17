import { chromium } from 'playwright';
const vars = (process.env.VARS || '0,1,2,3,4,5,6,7').split(',');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const res = {};
for (const rep of [0, 1]) for (const lx of rep ? [...vars].reverse() : vars) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  try {
    await p.goto(`http://localhost:5180/game/?gputime&landx=${lx}${process.env.EXTRA || ''}`, { waitUntil: 'load', timeout: 90000 });
    await p.waitForFunction(() => window.__game?.scatter && window.__game?.governor, null, { timeout: 180000 });
    await p.waitForTimeout(4000);
    const r = await p.evaluate(async (view) => {
      const B = await import('/game/tools/bench.js'), s = window.__game, { renderer, camera, U, scene } = s;
      const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
      const { poseAt } = await mod('src/camera/rig.js'), { setPlanes } = await mod('src/core/frustum.js'), { heightAt } = await mod('src/world/land.js');
      s.covered = true; s.governor.hold(true);
      const v = B.VIEWS[view], pm = camera.projectionMatrix.clone();
      const P = poseAt(v.x, v.z, v.yaw, v.h, -0.05); camera.position.set(...P.pos); camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch, P.yaw, 0); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const pp = camera.position, g = heightAt(pp.x, pp.z), dy = Math.max(0, pp.y - g - 2); U.uDy.value = dy; U.uAirH.value = Math.max(0, pp.y - g); U.uLodInv.value = 1;
      setPlanes(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); s.ground.update(pp.x, pp.z, dy, 1); s.terrain.update(camera, dy, 1); s.scatter.select(pp.x, pp.z, g, 1, dy);
      for (let i = 0; i < 40; i++) { s.terrain.cache?.update(renderer, camera, `${innerHeight}|${U.uSand.value.toArray()}`); s.terrain.update(camera, dy, 1); renderer.render(scene, camera); }   // let the cache lay
      const time = async (f, n = 20) => { f(); await renderer.resolveTimestampsAsync('render'); const xs = []; for (let i = 0; i < n; i++) { f(); xs.push((await renderer.resolveTimestampsAsync('render')) || 0); } xs.sort((a, b) => a - b); return +xs[n >> 1].toFixed(2); };
      const kids = scene.children.filter((o) => o.visible);
      renderer.setPixelRatio(3);
      const all = await time(() => { s.shadows.render(scene, camera, g); renderer.render(scene, camera); });
      const land = [];
      for (let k = 0; k < 4; k++) {
        kids.forEach((x) => (x.visible = x === s.terrain.landMesh)); land.push(await time(() => renderer.render(scene, camera))); kids.forEach((x) => (x.visible = true));
        renderer.setPixelRatio(1); for (let i = 0; i < 30; i++) { s.terrain.cache?.update(renderer, camera, `${innerHeight}|${U.uSand.value.toArray()}`); renderer.render(scene, camera); await new Promise(requestAnimationFrame); } renderer.setPixelRatio(3);
      }
      return { all, land: land.join(',') };
    }, +(process.env.VIEW || 4));
    (res[lx] ||= []).push(r); console.log('landx', lx, JSON.stringify(r), errs.slice(0, 2).join(' '));
  } catch (e) { console.log('landx', lx, 'FAIL', String(e).slice(0, 200)); }
  await p.close();
}
for (const [k, v] of Object.entries(res)) console.log('SUM', k, 'all', v.map((x) => x.all).join('/'), 'land', v.map((x) => x.land).join('/'));
await b.close();
