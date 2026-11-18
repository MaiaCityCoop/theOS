// A timing of the game's frame at fixed views (in the game's console: `await (await import('/game/tools/bench.js')).bench()`):
// each view drawn n times, shadows as the game draws them. Opened with ?gputime, it reads the GPU's own clock: a begin
// and an end at every one of the frame's passes (timestamp queries, where the device has them), each pass under the name
// the code that draws it marked it with (src/core/gpu.js mark: the packing, the clouds, the light's cascades, canopy,
// probes and air, the culling, the prepass, the screen's light, the land's pages, the colour, the upscale, …), and each
// in one of the frame's four parts (CLASSES); otherwise the wall's, waiting for the GPU to finish (unreliable in a
// hidden or background tab). The game's own frame is held while it runs, so nothing else is drawn between.
// `?bench` (src/boot.js): the same once the world is loaded, its numbers on the screen (overlay), nothing typed.
// `?bench=2`: at that pixel ratio (1.5 else).
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
/** The frame's four parts, each the passes it is made of (by the names their code marks them with: src/core/gpu.js
    mark), in the frame's order: what BUDGET is shared out by, a ceiling a part (measured and set on the Mac mini). A pass
    no part names is 'other': the slack. */
export const CLASSES = {
  geometry: ['packing', 'occlusion', 'prepass', 'prepass, late', 'colour'],   // what is drawn: the tiers' packing and the surfaces' cut (src/scatter), the culling's pass one, the prepass, then the depth pyramid, pass two and what it finds (src/core/occlusion.js), the colour
  light: ['clouds', 'near', 'far', 'canopy', 'probes', 'screen light', 'contact'],   // the clouds' shadow map (src/world/weather/clouds.js); the light's passes before the frame (src/world/light/index.js): the near and far cascades (src/world/shadow.js), the canopy map and its sky probes (src/world/light/canopy.js); after the prepass the screen's light (src/boot.js): the contact shadows (src/world/light/screen.js)
  ground: ['ground map', 'pages, laid', 'relief', 'pages'],   // the ground under the camera (src/scatter/ground.js); the land's pages laid, the relief's points near the eye (src/terrain/relief.js), and the pages asked for after the prepass (src/terrain/pages.js)
  'upscale/post': ['lens', 'upscale'],   // the virtual camera's lens (src/camera/post.js), the upscale to the screen (src/core/temporal.js)
};
const CLASS = new Map(Object.entries(CLASSES).flatMap(([c, names]) => names.map((k) => [k, c])));
/** The part a pass is in ('other': none's). */
export const classOf = (name) => CLASS.get(name) ?? 'other';

// the page's own modules (the same ones the game runs, found by their resource entries: the dev server's addresses)
const mod = (part) => import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes(part)).at(-1));

/** The GPU's own clock (?gputime): three's timestamp queries (a begin and an end at each render and compute pass),
    read straight from its query sets, every pass apart, each under the name of the last mark before it (src/core/gpu.js
    mark; none: 'other'). Each frame timed is its passes alone: what was asked before it is let go when it starts.
    (three's own read, resolveTimestampsAsync, adds up the passes of the last frame it has a number for, and a pool with
    nothing new gives its last sum again: a pass timed while the game drew its own frames between read about a whole
    frame, the light's passes 23–53 ms each, 2026-11-18.) null where there are no timestamps.
      start()  before what is timed
      end()    after it: a promise of { sum (every pass's own time added: the frame's GPU time, as the bench has always
               said it), span (from the first pass's begin to the last one's end: what passes running side by side take
               together, and any wait between them), by: { name: ms }, adds: { name: ms } (what each part adds to the
               span: of each pass, in the order the GPU began them, how far its end lies past every earlier one's end
               and its own begin; on a tile GPU passes overlap, so their own times add up to more than the frame:
               2026-11-18, 75-118 ms of passes in a span of 45-73) } */
async function clockOf(renderer) {
  const B = renderer.backend;
  if (!B.trackTimestamp || !B.device || renderer.hasFeature?.('timestamp-query') === false) return null;
  const { listen } = await mod('src/core/gpu.js'), dev = B.device, pools = () => [B.timestampQueryPool.render, B.timestampQueryPool.compute];
  const marks = [], kept = new Map(), at = () => pools().map((p) => p?.currentQueryIndex ?? 0);
  listen((name) => marks.push([name, ...at()]));
  // a pool's begins and ends since it began again (ns, a pair a pass, in the order three asked for them); the pool
  // begins again from its first query (what three resolves later is then only what comes after)
  const read = async (pool) => {
    const n = pool?.currentQueryIndex ?? 0;
    if (!n) return null;
    let b = kept.get(pool);
    if (!b || b.bytes < n * 8) { b?.res.destroy(); b?.map.destroy(); const bytes = Math.max(n * 8, 2048); b = { bytes, res: dev.createBuffer({ label: 'bench: timestamps', size: bytes, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), map: dev.createBuffer({ label: 'bench: timestamps read', size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) }; kept.set(pool, b); }
    const e = dev.createCommandEncoder(); e.resolveQuerySet(pool.querySet, 0, n, b.res, 0); e.copyBufferToBuffer(b.res, 0, b.map, 0, n * 8); dev.queue.submit([e.finish()]);
    pool.currentQueryIndex = 0; pool.queryOffsets.clear();   // (queued after the resolve: what is drawn next writes its queries anew)
    await b.map.mapAsync(GPUMapMode.READ, 0, n * 8);
    const t = new BigUint64Array(b.map.getMappedRange(0, n * 8).slice(0)); b.map.unmap();
    return t;
  };
  const drop = () => { for (const p of pools()) if (p) { p.currentQueryIndex = 0; p.queryOffsets.clear(); } };
  return {
    start() { drop(); marks.length = 0; marks.push([null, 0, 0]); },
    async end() {
      const times = await Promise.all(pools().map(read)), passes = [];
      times.forEach((t, c) => {
        if (!t) return;
        for (let q = 0, m = 0; q + 1 < t.length; q += 2) {
          while (m + 1 < marks.length && marks[m + 1][1 + c] <= q) m++;   // (the last mark before this pass)
          if (t[q] > 0n && t[q + 1] >= t[q]) passes.push({ name: marks[m][0] ?? 'other', b: t[q], e: t[q + 1] });   // (a pass three asked for and never drew writes neither)
        }
      });
      if (!passes.length) return { sum: 0, span: 0, by: {}, adds: {} };
      passes.sort((x, y) => (x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
      const lo = passes[0].b, by = {}, adds = {}; let sum = 0, hi = lo;
      for (const p of passes) {
        const ms = Number(p.e - p.b) / 1e6, past = p.e > (p.b > hi ? p.b : hi) ? Number(p.e - (p.b > hi ? p.b : hi)) / 1e6 : 0;
        by[p.name] = (by[p.name] ?? 0) + ms; adds[p.name] = (adds[p.name] ?? 0) + past; sum += ms; if (p.e > hi) hi = p.e;
      }
      return { sum, span: Number(hi - lo) / 1e6, by, adds };
    },
    stop() { listen(null); for (const b of kept.values()) { b.res.destroy(); b.map.destroy(); } },
  };
}
/** f() timed n times on the clock: { sum, span (each its mean, ms), passes: { name: { class (classOf), mean (ms a frame,
    over every frame: what is drawn in turn counts as its share), drawn (ms in the frames it was drawn in), every (it was
    drawn every this many frames), adds (what it adds to the span, ms a frame) } }, classes: { part: ms a frame (its
    passes' means added), …, other } }. */
async function timed(clock, f, n) {
  let sum = 0, span = 0; const by = {};
  for (let i = 0; i < n; i++) {
    clock.start(); f(); const r = await clock.end();
    sum += r.sum; span += r.span;
    for (const [k, ms] of Object.entries(r.by)) { const b = (by[k] ||= { ms: 0, adds: 0, frames: 0 }); b.ms += ms; b.adds += r.adds[k] ?? 0; b.frames++; }
  }
  const passes = {}, classes = Object.fromEntries([...Object.keys(CLASSES), 'other'].map((c) => [c, 0])), r3 = (v) => +v.toFixed(3);
  for (const [k, b] of Object.entries(by).sort((x, y) => y[1].ms - x[1].ms)) { passes[k] = { class: classOf(k), mean: r3(b.ms / n), drawn: r3(b.ms / b.frames), every: +(n / b.frames).toFixed(1), adds: r3(b.adds / n) }; classes[classOf(k)] += b.ms / n; }
  for (const c in classes) classes[c] = r3(classes[c]);
  return { sum: +(sum / n).toFixed(2), span: +(span / n).toFixed(2), passes, classes };
}

/** Each view drawn `frames` times: its GPU ms a frame (the passes' own times added), and with the GPU's clock (?gputime)
    where each went: out.passes[view] (timed() above), out.classes[view] (each part's ms a frame), out.span[view]; with
    `shading`, the same frames again with the colour pass's shadow reads off (the cascades still drawn), so the colour's
    own share of the shadows is the difference (out.shading[view]: { colour, colourWithout }). */
export async function bench({ ratio = 1.5, frames = 60, settle = 0, shading = false } = {}) {
  const s = window.__game, { renderer, camera, U } = s;
  const { poseAt } = await mod('src/camera/rig.js'), { setPlanes } = await mod('src/core/frustum.js'), { heightAt } = await mod('src/world/land.js'), { mark } = await mod('src/core/gpu.js');
  const fin = async () => { if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone(); else { const gl = renderer.backend.gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } };
  // (the world drawn as the game draws it: inside at `ratio` and brought up to the canvas, all the screen's pixels, by the
  // upscale pass (src/core/screen.js); a page without the screen, straight onto the canvas at `ratio`)
  const pm = camera.projectionMatrix.clone(), was = s.screen ? s.screen.inside : renderer.getPixelRatio(), covered = s.covered, ratioTo = (r) => (s.screen ? s.screen.set(r) : renderer.setPixelRatio(r));
  ratioTo(ratio); s.governor.hold(true); s.covered = true;   // (covered: the game's own frame neither chooses nor draws)
  // (a frame as the game's runs it, src/boot.js choose and draw: what comes before the light marked here as whose its
  // passes are, each part apart; the light marks its own, src/world/light/index.js, and the screen its own,
  // src/core/screen.js)
  const frame = (v, dark = false) => {
    const P = poseAt(v.x, v.z, v.yaw, v.h, -0.05); camera.position.set(...P.pos); camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch, P.yaw, 0); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const p = camera.position, g = heightAt(p.x, p.z), dy = Math.max(0, p.y - g - 2); U.uDy.value = dy; U.uAirH.value = Math.max(0, p.y - g); U.uLodInv.value = 1; U.uDrawn.value = ratio;   // (the pixels drawn a CSS pixel, for a page without the screen: src/detail/measure.js drawnAt)
    setPlanes(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    mark('ground map'); s.ground.update(p.x, p.z, dy, 1);
    mark('pages, laid'); s.terrain.update(camera, dy, 1);
    mark('packing'); s.scatter.select(p.x, p.z, g, 1, dy);
    mark('clouds'); s.weather.before(camera, g);
    mark(null); s.shadows.render(s.scene, camera, g);   // (the light marks its own passes: the cascades, the canopy and its probes, the air; one it does not mark is 'other')
    if (dark) U.uShadowOn.value = 0;   // (the colour pass reads no shadow: the A/B of its share)
    if (s.screen) s.screen.render(s.scene, camera); else { mark('colour'); renderer.render(s.scene, camera); }
    mark(null);
  };
  const out = {}, clock = await clockOf(renderer);   // the game opened with ?gputime (or ?bench): the GPU's own time, not the wall's
  try {
    for (const v of VIEWS) {
      // (settle, ms: the view drawn a while first, so what streams in near it has come)
      for (const t = performance.now(); performance.now() - t < settle;) { frame(v); await fin(); await new Promise((r) => setTimeout(r, 50)); }
      frame(v); await fin();
      if (clock) {
        const T = await timed(clock, () => frame(v), frames);
        out[v.name] = T.sum; (out.span ||= {})[v.name] = T.span; (out.passes ||= {})[v.name] = T.passes; (out.classes ||= {})[v.name] = T.classes;
        if (shading) { const D = await timed(clock, () => frame(v, true), frames); (out.shading ||= {})[v.name] = { colour: T.passes.colour?.mean ?? 0, colourWithout: D.passes.colour?.mean ?? 0 }; frame(v); await fin(); }   // (and one frame as it was, so the shadows are read again and the far cascade is the light's again)
      } else { const t0 = performance.now(); for (let i = 0; i < frames; i++) frame(v); await fin(); out[v.name] = +((performance.now() - t0) / frames).toFixed(2); }
    }
  } finally { clock?.stop(); ratioTo(was); s.governor.hold(false); s.covered = covered; }
  out.measure = clock ? 'GPU time' : 'wall time';
  out.worst = Math.max(...VIEWS.map((v) => out[v.name])); out.pass = out.worst <= BUDGET;
  return { ratio, size: [innerWidth, innerHeight], ...out };
}

/** `?bench`: bench() once the world is complete where it starts (window.__game.ready: src/core/settle.js), and its
    numbers on the screen; again on a click. Opened with the game (src/boot.js). */
export async function overlay() {
  const { flagText } = await import('../src/core/flags.js');
  const ratio = +flagText('bench') || 1.5;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:12px;top:12px;z-index:99999;background:rgba(255,253,246,0.94);color:#1f2a1c;font:13px/1.45 ui-monospace,Menlo,monospace;padding:8px 12px;border-radius:8px;white-space:pre;cursor:pointer';
  document.body.appendChild(el);
  const say = (t) => (el.textContent = `bench\n${t}`);
  say('waiting for the world to load…');
  await window.__game.ready;
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true; say('running: the picture holds still a while…');
    try {
      const r = await bench({ ratio, settle: 3000 });
      // (each view's frame, and its five largest passes)
      const rows = VIEWS.map((v) => `${v.name.padEnd(24)}${String(r[v.name].toFixed(2)).padStart(8)} ms${r.passes ? '   ' + Object.entries(r.passes[v.name]).slice(0, 5).map(([k, p]) => `${k} ${p.mean.toFixed(2)}`).join(', ') : ''}`).join('\n');
      say(`${r.measure}, ${r.size.join('×')} at ×${r.ratio}\n\n${rows}\n\n${'worst'.padEnd(24)}${String(r.worst.toFixed(2)).padStart(8)} ms  ${r.pass ? 'within' : 'over'} ${BUDGET} ms\n\nclick to run again`);
      console.log('[bench]', JSON.stringify(r));
    } catch (e) { say('failed: ' + e.message); }
    busy = false;
  };
  el.onclick = run; await run();
}

/** Where a view's GPU time goes by what is drawn (opened with ?gputime): the frame drawn with one part at a time (sky,
    land, water, each scattered thing, the placed assets), the shadow pass and the clouds' map on their own, each on the
    GPU's clock (clockOf). Parts' shares are what count. */
export async function parts(view = VIEWS[0], { ratio = 1, frames = 30 } = {}) {
  const s = window.__game, { renderer, camera, U, scene } = s, clock = await clockOf(renderer);
  if (!clock) throw new Error('parts(): the page has no timestamps (open it with ?gputime)');
  const { poseAt } = await mod('src/camera/rig.js'), { setPlanes } = await mod('src/core/frustum.js'), { heightAt } = await mod('src/world/land.js');
  const pm = camera.projectionMatrix.clone(), was = renderer.getPixelRatio(), covered = s.covered; renderer.setPixelRatio(ratio); s.governor.hold(true); s.covered = true;
  try {
    const v = view, P = poseAt(v.x, v.z, v.yaw, v.h, -0.05); camera.position.set(...P.pos); camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch, P.yaw, 0); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const p = camera.position, g = heightAt(p.x, p.z), dy = Math.max(0, p.y - g - 2); U.uDy.value = dy; U.uAirH.value = Math.max(0, p.y - g); U.uLodInv.value = 1;
    setPlanes(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); s.ground.update(p.x, p.z, dy, 1); s.terrain.update(camera, dy, 1); s.scatter.select(p.x, p.z, g, 1, dy);
    const time = async (f) => (await timed(clock, f, frames)).sum;
    const kids = scene.children.filter((o) => o.visible), tierOf = new Map(); for (const t of s.scatter.tiers) for (const m of t.meshes ?? [t.mesh]) tierOf.set(m, t.asset);
    const groups = { sky: (o) => o.renderOrder === 15, land: (o) => o === s.terrain.landMesh || o === s.terrain.relief?.mesh, water: (o) => o === s.terrain.waterMesh };   // (the land: its mesh and the relief's near the eye)
    for (const a of new Set(tierOf.values())) groups[a] = (o) => tierOf.get(o) === a;
    const named = Object.values(groups); groups.placed = (o) => !named.some((f) => f(o)) && !tierOf.has(o);
    const out = { view: v.name, all: await time(() => renderer.render(scene, camera)), light: await time(() => s.shadows.render(scene, camera, g)), weather: await time(() => s.weather.before(camera, g)) };
    for (const [k, f] of Object.entries(groups)) { kids.forEach((o) => (o.visible = f(o))); out[k] = await time(() => renderer.render(scene, camera)); kids.forEach((o) => (o.visible = true)); }
    return out;
  } finally { clock.stop(); renderer.setPixelRatio(was); s.governor.hold(false); s.covered = covered; }
}
