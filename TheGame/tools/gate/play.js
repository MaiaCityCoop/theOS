// The player's walk (intent 0038, Samuel 2026-11-19: "pin and gate"): any build of the game, old or new, walked as a
// player walks it, so the build before intent 0038 (6ea75d6e: smooth on a Mac and an iPhone) is the bar every renderer
// change is held to. Nothing of the game's own is asked but window.__game.camera (every build since #1 has it): the
// page loaded in Chrome at the gate's screen, the world given WARM seconds from the first frame, then W held for SECS
// seconds from where the game starts the walker (beside the tent), every frame's time taken by the page's own frames,
// and the browser's memory (every process of its profile) sampled meanwhile.
//
//   bun tools/gpu/lock.js take <who> -- bun tools/gate/play.js <url> [--warm s] [--secs s] [--json f]
//
// Says: the first frame (ms from the navigation), the walk's frames (p50, p99, worst, over 16.7 ms, hitches over
// 33 ms), how far the walker went (metres: a walk that did not move is no walk), and the browser's most memory.
// The merge rule (.claude/skills/intents/SKILL.md): a change to TheGame/src merges only where its walk is no worse
// than the reference's on the same machine (tools/gate/reference.json).
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2), url = args.find((a) => !a.startsWith('--')), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!url) { console.log('bun tools/gate/play.js <url> [--warm s] [--secs s] [--json f]'); process.exit(1); }
const WARM = +opt('warm', 15), SECS = +opt('secs', 20);
const dir = mkdtempSync(join(tmpdir(), 'gate-play-'));
/** The browser's memory now: every process of its profile, resident, MB. */
const memory = () => { try { return Math.round(execSync('ps -axo rss=,command=').toString().split('\n').filter((l) => l.includes(dir)).reduce((s, l) => s + (parseInt(l, 10) || 0), 0) / 1024); } catch { return 0; } };
const ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'], viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
let most = 0; const sample = setInterval(() => { most = Math.max(most, memory()); }, 500);
const out = { url };
try {
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  // (every frame's time, from the page's own frames, from the navigation on)
  await page.addInitScript(() => { const T = (window.__playFrames = []); let last = 0; const f = (t) => { if (last) T.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.goto(url, { waitUntil: 'load', timeout: 120e3 });
  await page.waitForFunction(() => !!window.__game?.camera, null, { timeout: 300e3, polling: 250 });
  out.first = await page.evaluate(() => Math.round(performance.now()));
  await page.waitForTimeout(WARM * 1e3);
  const at = () => page.evaluate(() => { const p = window.__game.camera.getWorldPosition?.(new window.__game.camera.position.constructor()) ?? window.__game.camera.position; return [p.x, p.y, p.z]; });
  const from = await at();
  await page.mouse.click(960, 540);   // (the game's focus: what a player's first click gives)
  await page.evaluate(() => { window.__playFrames.length = 0; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(SECS * 1e3); await page.keyboard.up('KeyW');
  const F = await page.evaluate(() => window.__playFrames.slice()), to = await at(), s = [...F].sort((a, b) => a - b), q = (p) => +(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0).toFixed(1);
  Object.assign(out, { frames: F.length, p50: q(0.5), p99: q(0.99), worst: +(s.at(-1) ?? 0).toFixed(1), over16: F.filter((t) => t > 1000 / 60 + 0.5).length, hitches: F.filter((t) => t > 2000 / 60).length, walked: +Math.hypot(to[0] - from[0], to[2] - from[2]).toFixed(1), from: from.map((v) => +v.toFixed(1)), errors: errors.slice(0, 3) });
} finally { clearInterval(sample); out.memory = Math.max(most, memory()); await ctx.close().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
console.log(`play ${url}: first frame ${(out.first / 1000).toFixed(1)} s; the walk ${out.frames} frames, p50 ${out.p50} ms, p99 ${out.p99} ms, worst ${out.worst} ms, ${out.over16} over 16.7 ms, ${out.hitches} hitches over 33 ms; walked ${out.walked} m from ${out.from}; the browser at most ${out.memory} MB${out.errors?.length ? `; errors: ${out.errors.join(' · ')}` : ''}`);
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(out, null, 2));
