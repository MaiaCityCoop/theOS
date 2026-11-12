// A scene's media, played beside the live world on the film's one clock (cine: play, pause, seek). A scene's shot is
// either the world itself, filmed by the virtual camera (`world`: its keys), or footage (`video`, from `video_in`, muted;
// or only its still, `frame`); over both run the scene's sounds (a voice's take, music, effects: each clip's `audio`
// with its gain, gain keys, fades and filter, on its track's gain). Nothing here keeps time: every frame it is told the
// film's time and makes picture and sound stand there. While footage fills the picture the world under it is not drawn.
//
// Learned from the old play's player (maiaCITY play: compose.ts): one clock and everything else seeked to it; a video
// shot held until the next shot; a shot's `transition` read as codes (from black s, to black s); gain in dB, keys as
// [seconds into the clip, dB] joined by straight lines; the picture never cropped (footage of another shape stands whole
// in the frame, its own still blurred behind it).
const OBJ = (h) => `/api/objects/${h}`;   // a scene's media by its hash (the dashboard's server: Stories/objects/)
const lin = (db) => 10 ** ((db || 0) / 20), smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const secs = (text, word) => { const m = new RegExp(word + '\\s*(\\d+(?:\\.\\d+)?)?', 'i').exec(text || ''); return m ? +(m[1] ?? 0.5) : 0; };

/** The shots of a scene in order, each with where it ends (the next one's start). */
export const shotsOf = (scene) => { const S = (scene.tracks.find((t) => t.kind === 'shots')?.clips ?? []).slice().sort((a, b) => a.at - b.at); return S.map((s, i) => ({ ...s, end: S[i + 1]?.at ?? s.at + s.duration })); };

export function createMedia(scene) {
  const shots = shotsOf(scene), layer = document.createElement('div'), still = document.createElement('img'), veil = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;z-index:1;background:#000;overflow:hidden;display:none;pointer-events:none';
  const whole = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain';
  still.style.cssText = whole; veil.style.cssText = 'position:fixed;inset:0;z-index:2;background:#000;opacity:0;pointer-events:none';
  // what stands behind footage of another shape: each shot's own still, small and dark, made once at the start (a still
  // decoded and blurred at the cut itself held the picture for two frames at every cut)
  const backs = new Map();
  for (const s of shots) if (s.frame && !backs.has(s.frame)) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 18; c.style.cssText = 'position:absolute;inset:-4%;width:108%;height:108%;display:none'; layer.append(c); backs.set(s.frame, c);
    const im = new Image(); im.src = OBJ(s.frame); im.decode().then(() => { const g = c.getContext('2d'), k = Math.max(32 / im.width, 18 / im.height), w = im.width * k, h = im.height * k; g.drawImage(im, (32 - w) / 2, (18 - h) / 2, w, h); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, 32, 18); }).catch(() => {});
  }
  layer.append(still); document.body.append(layer, veil);
  // one player per video file: shots cut from the same take run on through their cuts
  const videos = new Map();
  for (const s of shots) if (s.video && !videos.has(s.video)) { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = OBJ(s.video); v.style.cssText = whole + ';display:none'; layer.append(v); videos.set(s.video, v); }

  // ---- sound: every clip that names a recording, decoded once and played by the sound clock itself. At a play or a
  // seek every clip still to come is set on that clock at once (its start to the sample, its place in the take); from then
  // nothing is touched but each clip's level. No player is chased with seeks: a browser that starts a sound late (Safari)
  // then seeks it again and again, and the picture stutters with it
  let ctx = null, wired = false; const sounds = [];
  for (const t of scene.tracks) for (const c of t.clips) if (c.audio) sounds.push({ c, t, buf: null, gain: null, node: null });
  function wire() {   // made at the first play: a browser gives a page its sound only then
    if (wired || !sounds.length) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    wired = true; ctx = new AC();
    for (const s of sounds) {
      s.gain = ctx.createGain(); let out = s.gain;
      for (const b of s.c.eq || []) { const f = ctx.createBiquadFilter(); f.type = b.type; f.frequency.value = b.f ?? 1000; f.gain.value = b.gain ?? 0; f.Q.value = b.q ?? 0.707; out.connect(f); out = f; }
      out.connect(ctx.destination);
      fetch(OBJ(s.c.audio)).then((r) => r.arrayBuffer()).then((a) => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no))).then((buf) => { s.buf = buf; sync.t = -9; }).catch(() => {});   // (decoded: set on the clock at the next frame)
    }
  }
  const wake = () => { wire(); if (ctx?.state === 'suspended') ctx.resume?.(); };
  for (const e of ['pointerdown', 'keydown']) addEventListener(e, wake, { capture: true });
  const keyDb = (K, u) => { if (!K?.length) return 0; if (u <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (u <= K[i][0]) return K[i - 1][1] + ((K[i][1] - K[i - 1][1]) * (u - K[i - 1][0])) / Math.max(1e-6, K[i][0] - K[i - 1][0]); return K.at(-1)[1]; };
  const level = (s, u) => (s.t.mute ? 0 : lin(s.c.gain) * lin(s.t.gain) * lin(keyDb(s.c.keys, u)) * (s.c.fade_in ? Math.min(1, u / s.c.fade_in) : 1) * (s.c.fade_out ? Math.min(1, (s.c.duration - u) / s.c.fade_out) : 1));
  const sync = { t: -9, c: 0, on: false };   // where the film stood, and the sound clock, when the clips were last set
  const hush = () => { for (const s of sounds) if (s.node) { try { s.node.stop(); } catch {} s.node.disconnect(); s.node = null; } sync.on = false; };
  function sound(t, playing) {
    if (!ctx) return;
    if (!playing || ctx.state !== 'running') { if (sync.on) hush(); return; }
    // set anew when the film jumped (a seek, its loop) or has run apart from the sound clock by more than a quarter second
    if (!sync.on || Math.abs(sync.t + (ctx.currentTime - sync.c) - t) > 0.25) {
      hush(); sync.t = t; sync.c = ctx.currentTime; sync.on = true;
      for (const s of sounds) { const u = t - s.c.at, len = Math.min(s.c.duration, (s.buf?.duration ?? 0) - (s.c.audio_in || 0)); if (!s.buf || u >= len) continue;
        s.node = ctx.createBufferSource(); s.node.buffer = s.buf; s.node.connect(s.gain);
        s.node.start(ctx.currentTime + Math.max(0, -u), (s.c.audio_in || 0) + Math.max(0, u), len - Math.max(0, u)); }
    }
    for (const s of sounds) { const u = t - s.c.at; if (u >= 0 && u < s.c.duration) s.gain.gain.value = level(s, u); }
  }
  // a video made to stand at `want` seconds. Playing, it is left alone: it runs in real time as the film's clock does, and
  // a browser shows a touched video (its speed changed, its place set) with a hitch; only when it is far off (the film
  // jumped) is it set anew. Not shown, and the film held, it is put where its next shot begins, so its cut starts at once
  function hold(el, on, playing, want, next) {
    if (!on) { if (!el.paused) el.pause(); if (!playing && next != null && !el.seeking && Math.abs(el.currentTime - next) > 0.05) el.currentTime = next; return; }   // (set there only while the film is held: a seek beside a playing video costs it a frame)
    want = Math.min(want, (el.duration || 1e9) - 0.05);
    if (!playing) { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - want) > 0.04 && !el.seeking) el.currentTime = want; return; }
    if (el.paused) { if (Math.abs(el.currentTime - want) > 0.12) el.currentTime = want; el.play().catch(() => {}); return; }
    if (!el.seeking && Math.abs(el.currentTime - want) > 0.5) el.currentTime = want;
  }
  let shown = null;
  return {
    /** how its sound stands now (for a check): the context's state, each clip's place and level */
    get state() { return { context: ctx?.state ?? 'none', set: sync.on, sounds: sounds.map((s) => ({ id: s.c.id, decoded: !!s.buf, sounding: !!s.node, level: s.gain ? +s.gain.gain.value.toFixed(3) : null })) }; },
    get sounds() { return sounds.map((s) => ({ track: s.t.id, kind: s.t.kind, at: s.c.at, for: s.c.duration, who: s.c.who || '', id: s.c.id })); },
    /** The film stands at t seconds, playing or held. */
    update(t, playing) {
      if (playing) wake();
      const s = shots.findLast((x) => t >= x.at) ?? shots[0], media = !!s && !s.world && (s.video || s.frame);
      layer.style.display = media ? 'block' : 'none';   // a world shot: the live picture itself
      if (media && s !== shown) { shown = s; for (const [h, c] of backs) c.style.display = h === s.frame ? 'block' : 'none'; if (!s.video && s.frame) still.src = OBJ(s.frame); still.style.display = s.video ? 'none' : 'block'; for (const [h, v] of videos) v.style.display = h === s.video ? 'block' : 'none'; }
      for (const [h, v] of videos) { const mine = media && h === s.video, nx = mine ? null : shots.find((x) => x.video === h && x.at > t) ?? shots.find((x) => x.video === h); hold(v, mine, playing, (s?.video_in || 0) + (t - (s?.at || 0)), nx ? nx.video_in || 0 : null); }
      if (window.__s8) window.__s8.covered = !!media;   // footage fills the picture: the world under it is not drawn (src/main.js)
      // black: a shot comes up from it, or goes down to it
      const up = s ? secs(s.transition, 'from black') : 0, down = s ? secs(s.transition, 'to black') : 0;
      veil.style.opacity = s ? Math.max(up ? 1 - smooth((t - s.at) / up) : 0, down ? smooth((t - (s.end - down)) / down) : 0) : 0;
      sound(t, playing);
    },
  };
}
