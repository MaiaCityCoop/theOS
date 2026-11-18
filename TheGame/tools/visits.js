// The cells each tier's packing visits at the bench's six views (intent 0038, #82 v2; CPU only, `bun tools/visits.js
// [per] [walk] [turn] [dial]`: per, each tier). The world's own tiers: the plants' levels and stand-ins (src/scatter/trees.js),
// the meadow's rings (grass.js). The measure at the gate's: a 1080 window drawn at 4/3 (1440 pixels drawn), the dial at
// rest. A view: the cells #82 looked at (patches of P x P cells, at most 384 a tier, in scan order) against the cells the
// resident regions (src/scatter/regions.js Resident) visit to fill their store from nothing, every way round.
// walk: from each view straight ahead, the cells the resident regions visit a metre (what is new or has run out), their
// CPU time, and the cells they hold at the end. turn: from each view the camera turned 90° on the spot, a degree a frame:
// the cells they visit (none: nothing they hold asks the view). dial: from each view the measure stepped as the governor
// steps it (an eighth of the pixels drawn down, twice, and back), the cells visited each step, against packing it all again.
const G = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // (TheGame/)
Object.assign(globalThis, { innerHeight: 1440, innerWidth: 2560, window: globalThis, addEventListener() {}, devicePixelRatio: 1 });
await import(`${G}/tools/glob.js`);
await import(`${G}/src/core/registry.js`);
const THREE = await import('three/webgpu');
const { rowsOf } = await import(`${G}/src/scatter/rule.js`);
const { groupsOf } = await import(`${G}/src/scatter/trees.js`);
const { bandOf, padOf } = await import(`${G}/src/detail/handover.js`);
const { dialK } = await import(`${G}/src/detail/measure.js`);
const { GONE } = await import(`${G}/src/detail/error.js`);
const { Resident } = await import(`${G}/src/scatter/regions.js`);
const { setPlanes, boxIn } = await import(`${G}/src/core/frustum.js`);
const { poseAt } = await import(`${G}/src/camera/rig.js`);
const { heightAt } = await import(`${G}/src/world/land.js`);
const { recipes } = await import(`${G}/src/core/registry.js`);
const { VIEWS } = await import(`${G}/tools/bench.js`);
const K = dialK(), MAXP = 384, patch82 = (cell, reach) => Math.min(256, Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, (0.105 * reach) / cell)))));
const M = (x) => (x / 1e6).toFixed(2);
console.log(`the measure: ${K.toFixed(1)} dial pixels a metre at a metre (1440 drawn, the dial at rest), gone at ${GONE.toFixed(2)} of them`);

// ---- the tiers: { name, cell, P (#82's), near, far, cull, fixed, metres } ----
const tiers = [];
for (const Gp of groupsOf(rowsOf())) {
  const L = Gp.L, lv = Gp.kinds[0].levels, sLo = Math.min(...Gp.kinds.map((k) => k.lo)), sHi = Math.max(...Gp.kinds.map((k) => k.hi));
  lv.forEach((l, i) => {
    const band = bandOf({ lo: l.lo, hi: i ? lv[i - 1].lo : Infinity }, Gp.fade, padOf(L.cell, l.P)), at = (k) => { const [n, f] = band.reach(sLo, sHi, k); return [i ? n : 0, f]; };
    const reach82 = (sHi * K * Math.exp(Gp.fade)) / (l.lo * 0.75);   // (#82 cut its patches at a 1440 window's CSS pixels: 3/4 of these)
    tiers.push({ name: `${Gp.name} ${i}`, cell: L.cell, P: patch82(L.cell, reach82), near: at(K)[0], far: at(K)[1], at, cull: 0 });
  });
  const casting = Gp.kinds.filter((Kd) => Kd.asset.detail.shadow && Kd.row.detail.casts);
  if (casting.length) {
    const SH = { far: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.far)), wide: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.wide ?? 2.4)), reach: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.reach ?? 20)) };
    tiers.push({ name: `${Gp.name} shadow`, cell: L.cell, P: 4, near: 0, far: SH.far, at: () => [0, SH.far], cull: SH.reach, fixed: SH.far * SH.wide, metres: true });
  }
}
const grass = recipes('asset').find((a) => a.placement?.engine === 'grass');
if (grass) {
  const { ringsOf, bandsOf } = await import(`${G}/src/scatter/grass.js`), R = ringsOf(grass), ring = (k, m) => { const b = bandsOf(R, grass.height, m).bands[k]; return [Math.max(0, b.near - b.nearFade), b.far]; };
  R.forEach((T, k) => ring(k, K)[1] > 0 && tiers.push({ name: `grass ring ${k}`, cell: T.cell, P: T.P, near: ring(k, K)[0], far: ring(k, K)[1], at: (m) => ring(k, m), cull: 0, metres: true }));
}

// ---- a camera, posed at a view (its heading turned by `turn`, its place moved `ahead` metres along it) ----
const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 40000), pm = new THREE.Matrix4();
const pose = (v, ahead = 0, turn = 0) => {
  const P = poseAt(v.x - Math.sin(v.yaw) * ahead, v.z - Math.cos(v.yaw) * ahead, v.yaw, v.h, -0.05);
  cam.position.set(...P.pos); cam.rotation.order = 'YXZ'; cam.rotation.set(P.pitch, P.yaw + turn, 0); cam.fov = P.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  setPlanes(pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const p = cam.position, g = heightAt(p.x, p.z); return { x: p.x, z: p.z, g, dy: Math.max(0, p.y - g - 2) };
};
const farOf = (T, c) => (T.fixed ? Math.min(T.fixed, T.far + c.dy * 1.2) : T.far);
const cellsOf = (u) => u.pack.reduce((n, L) => n + L.w * L.w, 0);
const residents = () => tiers.map((T) => ({ T, R: new Resident({ cell: T.cell, fixed: !!T.metres }) }));

// ---- a view: #82's patches in view against the resident regions' first packing, every way ----
const rows = [];
for (const v of VIEWS) {
  const c = pose(v), per = [];
  let before = 0, after = 0;
  for (const { T, R } of residents()) {
    const far = farOf(T, c), S = T.cell * T.P, far2 = far * far - c.dy * c.dy, near2 = T.near * T.near - c.dy * c.dy; let n = 0;
    if (far2 > 0) for (let j = Math.floor((c.z - far) / S); j <= Math.floor((c.z + far) / S); j++) for (let i = Math.floor((c.x - far) / S); i <= Math.floor((c.x + far) / S); i++) {
      const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S, nx = c.x < x0 ? x0 - c.x : c.x > x1 ? c.x - x1 : 0, nz = c.z < z0 ? z0 - c.z : c.z > z1 ? c.z - z1 : 0, nd = nx * nx + nz * nz;
      if (nd > far2) continue; const fx = Math.max(c.x - x0, x1 - c.x), fz = Math.max(c.z - z0, z1 - c.z); if (fx * fx + fz * fz < near2) continue;
      const yb = 0.32 * Math.sqrt(nd) + 0.2 * S + 6; if (!boxIn(x0 - T.cull, x1 + T.cull, c.g - yb, c.g + yb + T.cull, z0 - T.cull, z1 + T.cull)) continue;
      if (n < MAXP) n++;
    }
    const b = n * T.P * T.P, a = cellsOf(R.update({ cx: c.x, cz: c.z, dy: c.dy, near: T.near, far }));
    before += b; after += a; per.push({ name: T.name, before: b, after: a, leaves: R.leaves.size });
  }
  rows.push({ view: v.name, before, after, per });
}
console.log('\nview                      cells: #82 in view (384 patches)   resident, every way (first packing)');
for (const r of rows) console.log(`${r.view.padEnd(26)}${M(r.before).padStart(12)} M${M(r.after).padStart(26)} M`);
if (process.argv.includes('per')) for (const r of rows) { console.log(`\n${r.view}`); for (const t of r.per) if (t.before || t.after) console.log(`  ${t.name.padEnd(34)}${M(t.before).padStart(9)} M ${M(t.after).padStart(9)} M  regions ${String(t.leaves).padStart(5)}`); }

// ---- walk ----
if (process.argv.includes('walk')) {
  console.log('\nwalk straight ahead       cells a metre   CPU ms a metre   held at the end');
  for (const v of VIEWS) {
    const len = v.h > 1000 ? 2000 : v.h > 10 ? 400 : 200, step = v.h > 1000 ? 10 : v.h > 10 ? 2 : 1, S = residents();
    let cells = 0, ms = 0;
    for (let t = 0; t <= len; t += step) {
      const c = pose(v, t);
      for (const { T, R } of S) { const t0 = performance.now(), u = R.update({ cx: c.x, cz: c.z, dy: c.dy, near: T.near, far: farOf(T, c) }); if (t) { ms += performance.now() - t0; cells += cellsOf(u); } }
    }
    const held = S.reduce((n, { R }) => n + [...R.leaves.values()].reduce((m, L) => m + L.w * L.w, 0), 0);
    console.log(`${(v.name + `, ${len} m`).padEnd(28)}${M(cells / len).padStart(10)} M${(ms / len).toFixed(2).padStart(14)}${M(held).padStart(14)} M`);
  }
}

// ---- turn ----
if (process.argv.includes('turn')) {
  console.log('\nturn 90° on the spot      cells visited after the first packing');
  for (const v of VIEWS) {
    const S = residents(); let cells = 0;
    for (let a = 0; a <= 90; a++) { const c = pose(v, 0, (a * Math.PI) / 180); for (const { T, R } of S) { const u = R.update({ cx: c.x, cz: c.z, dy: c.dy, near: T.near, far: farOf(T, c) }); if (a) cells += cellsOf(u); } }
    console.log(`${v.name.padEnd(26)}${M(cells).padStart(12)} M`);
  }
}

// ---- dial ----
if (process.argv.includes('dial')) {
  console.log('\nthe measure stepped      cells visited each step (an eighth down, another, back, back)   all of it again');
  for (const v of VIEWS) {
    const S = residents(), c = pose(v), out = [];
    let all = 0;
    for (const [i, r] of [1, 0.875, 0.75, 0.875, 1].entries()) {
      let cells = 0;
      for (const { T, R } of S) { const [near, far] = T.at(K * r), f = T.fixed ? Math.min(T.fixed, far + c.dy * 1.2) : far, u = R.update({ cx: c.x, cz: c.z, dy: c.dy, near, far: f, measure: K * r }); if (i) cells += cellsOf(u); else all += cellsOf(u); }
      if (i) out.push(cells);
    }
    console.log(`${v.name.padEnd(26)}${out.map((n) => M(n).padStart(8)).join('')} M${M(all).padStart(14)} M`);
  }
}
