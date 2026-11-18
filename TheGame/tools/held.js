// What the tiers hold, counted on the GPU (intent 0038, #82 v2: the resident regions' memory). Each region tier's things
// packed as tier.js packs them now (in the view, widened by its margin), against the same packed every way round (the
// view's test off: what resident regions would hold, src/scatter/regions.js Resident, less its pad), each with the bytes
// its rows take. In the game's console, the camera where it is to be measured, the world settled:
//   const H = await import('/tools/held.js'); await H.held()
// -> { tiers: [{ name, inView, everyWay, cap, bytes }], inView, everyWay, bytes: { inView, everyWay } } (counts: what each
// found, its room or not: wanted; bytes: its rows, 16 a row). The game's own frames go on meanwhile; the tiers' view's
// test is put back after.
const frames = (n) => new Promise((done) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : done()); requestAnimationFrame(f); });

export async function held({ settle = 30 } = {}) {
  const s = window.__game, { renderer } = s, tiers = s.scatter.tiers.filter((t) => t.passes && t.regions);
  const name = (t, i) => `${t.asset ?? 'tier'} ${t.level ?? i}`;
  const count = async () => Promise.all(tiers.map(async (t) => (await t.read(renderer)).reduce((n, b) => n + b.wanted, 0)));
  const was = tiers.map((t) => t.cull);
  await frames(settle); const a = await count();
  tiers.forEach((t) => { t.cull = false; t.key = null; });   // (every way round: the region tree without the view, packed again)
  await frames(settle); const b = await count();
  tiers.forEach((t, i) => { t.cull = was[i]; t.key = null; });
  const rows = tiers.map((t, i) => ({ name: name(t, i), inView: a[i], everyWay: b[i], cap: t.caps.reduce((x, c) => x + c, 0), bytes: b[i] * t.slots * 16 }));
  const sum = (f) => rows.reduce((x, r) => x + f(r), 0);
  return { tiers: rows, inView: sum((r) => r.inView), everyWay: sum((r) => r.everyWay), bytes: { inView: tiers.reduce((x, t, i) => x + a[i] * t.slots * 16, 0), everyWay: sum((r) => r.bytes) } };
}
