// The cells each tier's packing visits a repack at the bench's six views (intent 0038, #82 v2; CPU only, `bun tools/visits.js
// [per] [free]`: per, each tier; free, the region tree with no room to stop it), as #82 chose them (patches of P x P
// cells, at most 384 a tier, in scan order) and as the region tree chooses them (src/scatter/regions.js). The world's
// own tiers: the plants' levels and stand-ins (src/scatter/trees.js), the meadow's rings (grass.js), the rocks
// (rocks.js). The measure at the gate's: a 1080 window drawn at 4/3 (1440 pixels drawn), the dial at rest.
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
const { regionsOf, coneOf, leavesFor, WG } = await import(`${G}/src/scatter/regions.js`);
const { setPlanes, boxIn } = await import(`${G}/src/core/frustum.js`);
const { setView, viewBox } = await import(`${G}/src/scatter/view.js`);
const { U } = await import(`${G}/src/core/uniforms.js`);
const { poseAt } = await import(`${G}/src/camera/rig.js`);
const { heightAt, HMIN, HMAX } = await import(`${G}/src/world/land.js`);
const { recipes } = await import(`${G}/src/core/registry.js`);
const VIEWS = [
  { name: 'tent, eye level', x: -1262.6 + 14 * -Math.sin(0.1), z: 631 + 14 * -Math.cos(0.1), yaw: Math.atan2(-Math.sin(0.1), -Math.cos(0.1)), h: 1.7 },
  { name: 'river bend, 26 m', x: -1334.8, z: 808.6, yaw: 0.9, h: 26 },
  { name: 'town, 40 m', x: -1262.6, z: 631, yaw: 0.3, h: 40 },
  { name: 'skyline, 2.5 km', x: -1262.6, z: 631, yaw: 0.3, h: 2500 },
  { name: 'pine forest, eye level', x: -1383.6, z: 634.1, yaw: -4.14, h: 1.7 },
  { name: 'pine forest, 90 m', x: -1290, z: 618, yaw: -4.54, h: 90 },
];
const K = dialK(), MAXP = 384, patch82 = (cell, reach) => Math.min(256, Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, (0.105 * reach) / cell)))));
console.log(`the measure: ${K.toFixed(1)} dial pixels a metre at a metre (1440 drawn, the dial at rest), gone at ${GONE.toFixed(2)} of them`);

// ---- the tiers: { name, cell, P (#82's), Pnow, near, far, cull, fixed, high, eye } ----
const tiers = [];
for (const Gp of groupsOf(rowsOf())) {
  const L = Gp.L, lv = Gp.kinds[0].levels, sLo = Math.min(...Gp.kinds.map((k) => k.lo)), sHi = Math.max(...Gp.kinds.map((k) => k.hi));
  lv.forEach((l, i) => {
    const Lv = { lo: l.lo, hi: i ? lv[i - 1].lo : Infinity }, band = bandOf(Lv, Gp.fade, padOf(L.cell, l.P));
    let [near, far] = band.reach(sLo, sHi, K); if (i === 0) near = 0;
    const reach82 = (sHi * K * Math.exp(Gp.fade)) / (l.lo * 0.75);   // (#82 cut its patches at a 1440 window's CSS pixels: 3/4 of these)
    tiers.push({ name: `${Gp.name} ${i}`, cell: L.cell, P: patch82(L.cell, reach82), Pnow: l.P, near, far, cull: 0, high: sHi, eye: true });
  });
  const casting = Gp.kinds.filter((Kd) => Kd.asset.detail.shadow && Kd.row.detail.casts);
  if (casting.length) {
    const SH = { far: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.far)), wide: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.wide ?? 2.4)), reach: Math.max(...casting.map((Kd) => Kd.asset.detail.shadow.reach ?? 20)) };
    tiers.push({ name: `${Gp.name} shadow`, cell: L.cell, P: 4, Pnow: 4, near: 0, far: SH.far, cull: SH.reach, fixed: SH.far * SH.wide, high: sHi, eye: false });
  }
}
const grass = recipes('asset').find((a) => a.placement?.engine === 'grass');
if (grass) { const { ringsOf, bandsOf } = await import(`${G}/src/scatter/grass.js`), R = ringsOf(grass), { bands } = bandsOf(R, grass.height, K); R.forEach((T, k) => bands[k].far > 0 && tiers.push({ name: `grass ring ${k}`, cell: T.cell, P: T.P, Pnow: T.P, near: Math.max(0, bands[k].near - bands[k].nearFade), far: bands[k].far, cull: 0, high: grass.height * 2.2, eye: true })); }

// ---- a view ----
const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 40000), pm = new THREE.Matrix4();
const rows = [];
for (const v of VIEWS) {
  const P = poseAt(v.x, v.z, v.yaw, v.h, -0.05); cam.position.set(...P.pos); cam.rotation.order = 'YXZ'; cam.rotation.set(P.pitch, P.yaw, 0); cam.fov = P.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  const p = cam.position, g = heightAt(p.x, p.z), dy = Math.max(0, p.y - g - 2);
  setPlanes(pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); U.uAirH.value = Math.max(0, p.y - g); setView(cam);
  let before = 0, after = 0, over = 0, leaves = 0, cap = 0;
  const per = [];
  for (const T of tiers) {
    // #82: its patches P x P in its band touching the frustum (widened by cull), at most 384 in scan order
    const far = T.fixed ? Math.min(T.fixed, T.far + dy * 1.2) : T.far, S = T.cell * T.P, far2 = far * far - dy * dy, near2 = T.near * T.near - dy * dy; let n = 0, o = false;
    if (far2 > 0) for (let j = Math.floor((p.x * 0 + p.z - far) / S); j <= Math.floor((p.z + far) / S); j++) for (let i = Math.floor((p.x - far) / S); i <= Math.floor((p.x + far) / S); i++) {
      const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S, nx = p.x < x0 ? x0 - p.x : p.x > x1 ? p.x - x1 : 0, nz = p.z < z0 ? z0 - p.z : p.z > z1 ? p.z - z1 : 0, nd = nx * nx + nz * nz;
      if (nd > far2) continue; const fx = Math.max(p.x - x0, x1 - p.x), fz = Math.max(p.z - z0, z1 - p.z); if (fx * fx + fz * fz < near2) continue;
      const yb = 0.32 * Math.sqrt(nd) + 0.2 * S + 6, c = T.cull; if (!boxIn(x0 - c, x1 + c, g - yb, g + yb + c, z0 - c, z1 + c)) continue;
      if (n === MAXP) { o = true; continue; } n++;
    }
    const b = n * T.P * T.P;
    // the region tree, as tier.js chooses (its step from its patch now)
    const q = Math.max(0.25, (T.cell * T.Pnow) / 16), room = process.argv.includes('free') ? 4e6 : Math.max(MAXP, leavesFor(T.cell, far, T.near)), out = new Uint32Array(room * 4);
    const R = regionsOf(out, room, { cell: T.cell, cx: p.x, cz: p.z, dy, near: T.near, far, view: viewBox(), r: T.cull + T.high + q + 2, high: T.high, land: [HMIN, HMAX] });
    before += b; after += R.count; over += o ? 1 : 0; leaves += R.n; cap = Math.max(cap, R.n / room);
    per.push({ name: T.name, before: b, after: R.count, leaves: R.n, room, over: o, need: R.n / Math.max(1, leavesFor(T.cell, far, T.near)) });
  }
  rows.push({ view: v.name, before, after, over, leaves, cap, per });
}
const M = (x) => (x / 1e6).toFixed(2);
console.log('\nview                      cells a repack: #82 (384 patches)   region tree   ratio   leaves   tiers over 384 (#82)');
for (const r of rows) console.log(`${r.view.padEnd(26)}${M(r.before).padStart(12)} M${M(r.after).padStart(16)} M${(r.before / Math.max(1, r.after)).toFixed(1).padStart(8)}x${String(r.leaves).padStart(9)}${String(r.over).padStart(10)}   (fullest room ${(r.cap * 100).toFixed(0)} %)`);
if (process.argv.includes('per')) for (const r of rows) { console.log(`\n${r.view}`); for (const t of r.per) if (t.before || t.after) console.log(`  ${t.name.padEnd(34)}${M(t.before).padStart(9)} M ${M(t.after).padStart(9)} M  leaves ${String(t.leaves).padStart(5)} of ${t.room} (need/leavesFor ${t.need.toFixed(2)})${t.over ? '  over 384' : ''}`); }
