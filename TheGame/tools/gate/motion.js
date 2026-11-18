// What tools/gate.js motion runs in the pages (each a function handed to the page whole: none reads anything of this
// module). The motion check (intent 0038, check 4) draws every frame of a path twice, as the game draws it and at full
// detail (?truth, drawn as a frame in motion: src/detail/measure.js TRUTH_AS), in two pages of one Chrome, frame by frame
// in step. Neither page draws a frame of its own while the check runs: the gate's clock gives each one.

/** An init script (before the page's own): the page's frames and its clock under the gate's hand, window.__gateClock.
    Off, as the page starts, it runs as it would. On (start()), no frame is drawn until step(t) asks for one, with t as
    its timestamp (what the world's clock, the film camera and the frame's time are reckoned from: src/boot.js), and
    performance.now moves only while a frame is being drawn, so the seconds the gate takes to read a frame back are not
    the page's (the temporal pass lets go of what it kept after 250 ms without a frame: src/core/temporal.js). Nothing is
    drawn between two steps: the page holds the GPU idle, for another run to time its frames. */
export function stepper() {
  const raf = window.requestAnimationFrame.bind(window), real = performance.now.bind(performance);
  let on = false, queue = [], last = 0, skew = 0, base = 0, spent = 0, inFrame = false, at = 0;
  performance.now = () => (on ? base + spent + (inFrame ? real() - at : 0) : real() - skew);
  window.requestAnimationFrame = (cb) => {
    if (on) { queue.push(cb); return 0; }
    return raf((t) => { if (on) queue.push(cb); else { last = t; cb(t); } });   // (a frame asked for before the clock was taken: held for the first step)
  };
  window.__gateClock = {
    get on() { return on; },
    /** The timestamp of the last frame drawn. */
    get last() { return last; },
    start() { if (on) return; base = performance.now(); spent = 0; on = true; },
    stop() {
      if (!on) return;
      const now = base + spent; on = false; skew = real() - now;
      const q = queue; queue = []; for (const cb of q) raf((t) => { last = t; cb(t); });
    },
    /** One frame, every callback asked for since the last called with timestamp t: a promise, once it is drawn. */
    step(t) {
      return new Promise((res) => raf(() => {
        const q = queue; queue = []; inFrame = true; at = real(); last = t;
        try { for (const cb of q) { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } } } finally { spent += real() - at; inFrame = false; }
        res();
      }));
    },
  };
}

/** In the page, once it has come and settled (tools/gate.js open, prepare): the clock taken (no frame drawn after this
    but those the gate steps), and what the frames need: the shared uniforms, what is still out (src/core/settle.js), the
    flight (tools/flyby.js). truth: this page is the truth, drawn as a frame in motion. Its own start (t0: the world's
    clock is (timestamp − t0) / 1000 s, src/boot.js) and that clock now. */
export async function begin({ truth }) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const [{ U }, { waiting }, F] = await Promise.all([mod('src/core/uniforms.js'), mod('src/core/settle.js'), import(new URL('tools/flyby.js', location.href).href)]);
  if (truth) { const { TRUTH_AS } = await mod('src/detail/measure.js'); TRUTH_AS.still = false; }
  const C = window.__gateClock; C.start();
  const t0 = C.last - U.uTime.value * 1000, g = window.__game;
  // (the camera where the path has it s seconds in: the film camera's timeline, or the flight's rig)
  const pose = (s, fly) => { if (!fly) return void window.__cine.seek(s); const q = F.flightAt(s, 'zoom'); g.controls.place(q.x, q.z, q.yaw); g.controls.height = q.h; };
  window.__gateMotion = { U, waiting, pose, t0 };
  return { clock: U.uTime.value, visible: document.visibilityState, inside: [window.__game.screen.inside] };
}

/** In the page: the path laid (tools/gate.js course; the flight: the film camera let go, the rig flown frame by frame
    here, not by tools/flyby.js's own loop), the camera at its start, and the world settled there with the clock standing
    at T seconds, frame by stepped frame. Then, given `jit` (the other page's place of a pixel in its last frame), frames
    drawn on there until this one's last is at the same place: the two pages' frames are then drawn at the same places,
    frame for frame. What it took. */
export async function rest({ T, fly, jit = null, wait = 600e3 }) {
  const M = window.__gateMotion, C = window.__gateClock, g = window.__game, t = M.t0 + T * 1000, t0 = Date.now();
  if (fly) window.__cine.release();
  const pose = () => M.pose(0, fly);
  let done = null, frames = 0;
  pose();
  g.settle({ timeout: wait }).then((r) => (done = r), (e) => (done = { error: String(e.message ?? e) }));
  while (!done) { pose(); await C.step(t); frames++; await new Promise((r) => setTimeout(r, 0)); }
  if (done.error) throw new Error(done.error);
  let aligned = 0;
  if (jit) for (; aligned < 128 && (M.U.uJit.value.x !== jit[0] || M.U.uJit.value.y !== jit[1]); aligned++) { pose(); await C.step(t); }
  return { frames, aligned, ms: Date.now() - t0, jit: [M.U.uJit.value.x, M.U.uJit.value.y] };
}

/** In the page: frame `s` seconds into the path, at T seconds on the world's clock, drawn and sent to the gate (its raw
    RGBA bytes, POSTed to `url`). whole: the frame is the truth's, and is drawn again (the clock and the camera standing)
    until nothing was still out when it was drawn, then on until its place of a pixel is `jit`'s again (the LOD page's
    this frame), so the two are drawn alike. What it took: { jit (this frame's place), again (frames drawn over), out
    (what was still out, the first time, by source), ms }. */
export async function shot({ s, T, fly, url, key, whole = false, jit = null, wait = 120e3 }) {
  const M = window.__gateMotion, C = window.__gateClock, g = window.__game, c = window.__cine, t = M.t0 + T * 1000, t0 = Date.now();
  const busy = () => Object.keys(M.waiting()).length > 0;
  let again = -1, first = null, cv = null, late = false;
  for (;;) {
    again++;
    M.pose(s, fly);
    const grab = c.grab(g.renderer.domElement.width);
    await C.step(t);
    cv = await grab;
    if (whole) {
      await g.renderer.backend.device?.queue.onSubmittedWorkDone();
      await new Promise((r) => setTimeout(r, 0));   // (what the frame read back, come)
      if (busy()) {   // (drawn while something was out: what a worker brings is waited for a moment, what a frame does is drawn again)
        first ??= M.waiting();
        const w0 = Date.now(); while (busy() && Date.now() - w0 < 2000) await new Promise((r) => setTimeout(r, 20));
        if (Date.now() - t0 < wait) continue;
        late = true;
      }
      if (jit && again < 64 && (M.U.uJit.value.x !== jit[0] || M.U.uJit.value.y !== jit[1])) continue;
    }
    break;
  }
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  await fetch(`${url}?key=${key}&w=${cv.width}&h=${cv.height}`, { method: 'POST', body: d, mode: 'no-cors' });
  return { jit: [M.U.uJit.value.x, M.U.uJit.value.y], again, out: first, late, ms: Date.now() - t0 };
}

/** In a blank page: a path's filmstrip as a JPEG data URL, `width` wide. At the top, every frame's worst tile against
    the line (`line`); under it a row for each frame shown: the frame small with its worst tile outlined, then the
    squares round that tile at full size (LOD before, LOD now, truth before, truth now, the change's heat map), labelled.
    rows: [{ label, thumb: { w, h, rgb (base64) }, crops: [base64 RGB, …], crop, at: [x, y], tile, scale }]. */
export function film({ title, sub, width, series, line, rows, names }) {
  const PAD = 10, CHART = 210, LABEL = 22, img = (b64, w, h) => { const s = atob(b64), id = new ImageData(w, h); for (let i = 0, j = 0; i < w * h; i++, j += 3) { id.data[4 * i] = s.charCodeAt(j); id.data[4 * i + 1] = s.charCodeAt(j + 1); id.data[4 * i + 2] = s.charCodeAt(j + 2); id.data[4 * i + 3] = 255; } const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(id, 0, 0); return c; };
  const tw = rows[0]?.thumb.w ?? 640, th = rows[0]?.thumb.h ?? 360, n = names.length, cs = Math.floor((width - tw - PAD * (n + 2)) / n);
  const rowH = Math.max(th, cs + LABEL) + LABEL + PAD;
  const cv = document.createElement('canvas'); cv.width = width; cv.height = 64 + CHART + PAD + rows.length * rowH + PAD;
  const x = cv.getContext('2d');
  x.fillStyle = '#101418'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#f2efe6'; x.font = 'bold 22px -apple-system, Helvetica, sans-serif'; x.fillText(title, PAD, 30);
  x.font = '14px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#b9c0c6'; x.fillText(sub, PAD, 52);
  // the chart: the worst tile of every frame, the line, the frames shown marked
  const cx0 = PAD + 44, cy0 = 64, cw = width - cx0 - PAD, top = Math.max(line * 2, ...series.map((p) => p[1])) * 1.05 || 1;
  const X = (s) => cx0 + (s / (series.at(-1)?.[0] || 1)) * cw, Y = (v) => cy0 + CHART - 18 - (v / top) * (CHART - 26);
  x.strokeStyle = '#2c343c'; x.lineWidth = 1; x.font = '11px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#8a949c';
  for (let k = 0; k <= 4; k++) { const v = (top * k) / 4; x.beginPath(); x.moveTo(cx0, Y(v)); x.lineTo(cx0 + cw, Y(v)); x.stroke(); x.fillText(v.toFixed(3), PAD, Y(v) + 4); }
  x.fillText('seconds into the path →', cx0 + cw - 130, cy0 + CHART - 2);
  x.strokeStyle = '#e8a33d'; x.setLineDash([6, 4]); x.beginPath(); x.moveTo(cx0, Y(line)); x.lineTo(cx0 + cw, Y(line)); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#e8a33d'; x.fillText(`line ${line}`, cx0 + 4, Y(line) - 4);
  x.strokeStyle = '#7fc8a9'; x.lineWidth = 1.5; x.beginPath(); series.forEach(([s, v], k) => (k ? x.lineTo(X(s), Y(v)) : x.moveTo(X(s), Y(v)))); x.stroke();
  for (const r of rows) { x.fillStyle = '#ff5a5a'; x.beginPath(); x.arc(X(r.s), Y(r.value), 4, 0, 7); x.fill(); }
  // the rows
  let y = 64 + CHART + PAD;
  for (const r of rows) {
    x.fillStyle = '#f2efe6'; x.font = 'bold 14px -apple-system, Helvetica, sans-serif'; x.fillText(r.label, PAD, y + 16);
    const yy = y + LABEL;
    x.drawImage(img(r.thumb.rgb, r.thumb.w, r.thumb.h), PAD, yy);
    const k = r.thumb.w / r.width;   // (the tile, outlined on the small frame)
    x.strokeStyle = '#ff5a5a'; x.lineWidth = 2; x.strokeRect(PAD + r.worst.x * k - 3, yy + r.worst.y * k - 3, r.worst.size * k + 6, r.worst.size * k + 6);
    x.imageSmoothingEnabled = false;
    r.crops.forEach((b64, j) => {
      const cx = PAD * 2 + tw + j * (cs + PAD);
      x.drawImage(img(b64, r.crop, r.crop), cx, yy, cs, cs);
      const q = cs / r.crop; x.strokeStyle = 'rgba(255,90,90,0.9)'; x.lineWidth = 1; x.strokeRect(cx + r.tile.x * q, yy + r.tile.y * q, r.tile.size * q, r.tile.size * q);
      x.fillStyle = '#b9c0c6'; x.font = '12px -apple-system, Helvetica, sans-serif'; x.fillText(names[j], cx, yy + cs + 15);
    });
    x.imageSmoothingEnabled = true;
    y += rowH;
  }
  return cv.toDataURL('image/jpeg', 0.9);
}

/** In a blank page: a sheet of labelled pictures as a JPEG data URL, `width` wide: a title, then rows, each row's
    panels side by side scaled to share its width (crisp where `sharp`), each with its label under it and, where it
    says, a box outlined ([x, y, size] in its own pixels). rows: [[{ label, w, h, rgb (base64 RGB), sharp?, box? }]]. */
export function sheet({ title, sub, width, rows }) {
  const PAD = 10, LABEL = 20;
  const img = (b64, w, h) => { const s = atob(b64), id = new ImageData(w, h); for (let i = 0, j = 0; i < w * h; i++, j += 3) { id.data[4 * i] = s.charCodeAt(j); id.data[4 * i + 1] = s.charCodeAt(j + 1); id.data[4 * i + 2] = s.charCodeAt(j + 2); id.data[4 * i + 3] = 255; } const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(id, 0, 0); return c; };
  const laid = rows.map((r) => { const k = (width - PAD * (r.length + 1)) / r.reduce((s, p) => s + p.w / p.h, 0); return { r, h: Math.floor(k) }; });
  const cv = document.createElement('canvas'); cv.width = width; cv.height = 64 + laid.reduce((s, l) => s + l.h + LABEL + PAD, 0) + PAD;
  const x = cv.getContext('2d');
  x.fillStyle = '#101418'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#f2efe6'; x.font = 'bold 22px -apple-system, Helvetica, sans-serif'; x.fillText(title, PAD, 30);
  x.font = '14px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#b9c0c6'; x.fillText(sub, PAD, 52);
  let y = 64;
  for (const { r, h } of laid) {
    let cx = PAD;
    for (const p of r) {
      const w = Math.floor((p.w / p.h) * h);
      x.imageSmoothingEnabled = !p.sharp; x.imageSmoothingQuality = 'high';
      x.drawImage(img(p.rgb, p.w, p.h), cx, y, w, h);
      if (p.box) { const q = w / p.w; x.strokeStyle = '#ff5a5a'; x.lineWidth = 2; x.strokeRect(cx + p.box[0] * q - 2, y + p.box[1] * q - 2, p.box[2] * q + 4, p.box[2] * q + 4); }
      x.fillStyle = '#f2efe6'; x.font = '13px -apple-system, Helvetica, sans-serif'; x.fillText(p.label, cx, y + h + 15);
      cx += w + PAD;
    }
    y += h + LABEL + PAD;
  }
  return cv.toDataURL('image/jpeg', 0.9);
}
