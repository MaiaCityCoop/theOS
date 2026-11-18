// The website's views before and after a change (intent 0038, task D: the front page's inline style moved out, the
// photo resized), and their pixel diff, all in headless Chrome (no image tools needed):
//   bun look.mjs capture <base-url> <out-dir>
//     full-page PNGs of every view at desktop (1440×900 @1x) and phone (390×844 @2x), with <view>-<size>.json beside each:
//     its size, the photo's box (device px), console errors and warnings, page errors, failed requests, answers ≥ 400.
//     The game (/game/…) is answered with a blank page, so the hero's film never runs and no world is drawn.
//   bun look.mjs compare <a-dir> <b-dir> <out-dir> <a-label> <b-label>
//     per view: pixels that differ (any channel), inside and outside the photo's box, the largest channel step;
//     a labelled JPEG 1600 px wide, a above and b below; a diff PNG where anything differs; diff.json.
// Take ~/src/github/MaiaCityCoop/.gate-lock before running either (the GPU is shared).
import { chromium } from '/Users/maiacityguardian/src/github/MaiaCityCoop/theOS/.claude/worktrees/0038-web-hygiene-ef68c8/TheGame/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SIZES = { desktop: { width: 1440, height: 900, dpr: 1, mobile: false }, phone: { width: 390, height: 844, dpr: 2, mobile: true } };
const VIEWS = ['home', 'city', 'intents', 'stories', 'join', 'game', 'legal'];
const BLANK = '<!doctype html><meta charset="utf-8"><title>blank</title><body style="margin:0;background:#0c1826"></body>';
const [cmd, ...args] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(base, out) {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [size, s] of Object.entries(SIZES)) {
      for (const view of VIEWS) {
        const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.dpr, isMobile: s.mobile, hasTouch: s.mobile });
        const page = await ctx.newPage(), log = { console: [], pageerror: [], failed: [], status: [] };
        page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text()}`); });
        page.on('pageerror', (e) => log.pageerror.push(String(e)));
        page.on('requestfailed', (r) => log.failed.push(`${r.url()} ${r.failure()?.errorText}`));
        page.on('response', (r) => { if (r.status() >= 400) log.status.push(`${r.status()} ${r.url()}`); });
        await page.route((u) => { const p = new URL(u).pathname; return new URL(u).origin === new URL(base).origin && (p === '/game' || p.startsWith('/game/')); },
          (r) => r.fulfill({ contentType: 'text/html', body: BLANK }));
        await page.goto(base + '/' + (['home', 'legal'].includes(view) ? '' : '#' + view), { waitUntil: 'networkidle' });
        if (view === 'legal') { await page.evaluate(() => { location.hash = document.querySelector('#legalnav a').getAttribute('href'); }); await page.waitForLoadState('networkidle'); }
        // through the page once, so every lazy picture loads; then back to the top, and time for the hero to settle
        await page.evaluate(async () => { const H = () => document.documentElement.scrollHeight;
          for (let y = 0; y < H(); y += innerHeight / 2) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
          scrollTo(0, H()); await new Promise((r) => setTimeout(r, 300)); scrollTo(0, 0); });
        await page.evaluate(() => document.fonts.ready);
        // the pictures that are laid out (a lazy one in a hidden view never loads), for at most 8 s
        await page.evaluate(() => Promise.race([new Promise((r) => setTimeout(r, 8000)),
          Promise.all([...document.images].filter((i) => i.getClientRects().length).map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))))]));
        await page.waitForLoadState('networkidle'); await wait(2500);
        const meta = await page.evaluate((dpr) => { const img = document.querySelector('.signature img'), r = img?.getBoundingClientRect(), on = img && img.offsetParent !== null && r.width > 0;
          return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, dpr,
            photo: on ? { x: Math.floor((r.left + scrollX) * dpr), y: Math.floor((r.top + scrollY) * dpr), w: Math.ceil(r.width * dpr) + 1, h: Math.ceil(r.height * dpr) + 1, cssW: r.width, cssH: r.height, natural: [img.naturalWidth, img.naturalHeight], src: img.currentSrc } : null }; }, s.dpr);
        const file = join(out, `${view}-${size}`);
        await page.screenshot({ path: file + '.png', fullPage: true, animations: 'disabled', caret: 'hide', scale: 'device' });
        writeFileSync(file + '.json', JSON.stringify({ view, size, ...s, ...meta, ...log }, null, 1));
        console.log(`${view}-${size}: ${meta.width}×${meta.height} css px; console ${log.console.length}, errors ${log.pageerror.length}, failed ${log.failed.length}, ≥400 ${log.status.length}`);
        await ctx.close();
      }
    }
  } finally { await browser.close(); }
}

async function compare(a, b, out, la, lb) {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    const page = await browser.newPage();
    await page.route('http://look.local/**', (r) => { const p = decodeURIComponent(new URL(r.request().url()).pathname);
      if (p === '/') return r.fulfill({ contentType: 'text/html', body: BLANK });
      const f = p.startsWith('/a/') ? join(a, p.slice(3)) : join(b, p.slice(3)); return existsSync(f) ? r.fulfill({ contentType: 'image/png', body: readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    await page.goto('http://look.local/');
    for (const size of Object.keys(SIZES)) for (const view of VIEWS) {
      const name = `${view}-${size}`, ma = JSON.parse(readFileSync(join(a, name + '.json'), 'utf8')), mb = JSON.parse(readFileSync(join(b, name + '.json'), 'utf8'));
      const box = mb.photo || ma.photo;
      const r = await page.evaluate(async ({ name, box, la, lb, phone, title }) => {
        const load = (u) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
        const [A, B] = await Promise.all([load(`/a/${name}.png`), load(`/b/${name}.png`)]);
        const res = { name, a: [A.width, A.height], b: [B.width, B.height], sameSize: A.width === B.width && A.height === B.height };
        const W = Math.max(A.width, B.width), H = Math.max(A.height, B.height);
        const px = (img) => { const c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, W, H).data; };
        const da = px(A), db = px(B), dc = new OffscreenCanvas(W, H), dg = dc.getContext('2d'), dd = dg.createImageData(W, H);
        let diff = 0, inside = 0, maxStep = 0, maxOutside = 0;
        for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k += 4) {
          const s = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]), Math.abs(da[k + 3] - db[k + 3]));
          const g = (da[k] * .3 + da[k + 1] * .59 + da[k + 2] * .11) * .25 + 190;
          if (s) { diff++; const inBox = box && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h; if (inBox) inside++; else maxOutside = Math.max(maxOutside, s); maxStep = Math.max(maxStep, s);
            dd.data[k] = 255; dd.data[k + 1] = 0; dd.data[k + 2] = 0; dd.data[k + 3] = 255; }
          else { dd.data[k] = dd.data[k + 1] = dd.data[k + 2] = g; dd.data[k + 3] = 255; }
        }
        Object.assign(res, { pixels: W * H, diff, insidePhoto: inside, outsidePhoto: diff - inside, maxStep, maxStepOutside: maxOutside });
        const enc = async (c, type, q) => { const bl = await c.convertToBlob({ type, quality: q }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
        if (diff) res.diffPng = await enc(dc, 'image/png');
        // the labelled JPEG: 1600 px wide, a above and b below. A phone's long page is cut into four columns side by side
        // (each at its CSS size, near enough), a desktop's is scaled to the width
        const OUT = 1600, LAB = 64, GAP = 16, cols = phone ? 4 : 1, colW = (OUT - GAP * (cols - 1)) / cols, k = colW / W;
        const slice = Math.ceil(H / cols), block = Math.ceil(slice * k), total = 2 * (LAB + block) + GAP;
        const jc = new OffscreenCanvas(OUT, total), j = jc.getContext('2d'); j.imageSmoothingQuality = 'high';
        j.fillStyle = '#e9e1cf'; j.fillRect(0, 0, OUT, total);
        const part = (img, label, y0, note) => {
          j.fillStyle = '#0c1826'; j.fillRect(0, y0, OUT, LAB); j.fillStyle = '#fffaf0'; j.font = '600 28px -apple-system, Helvetica, sans-serif'; j.textBaseline = 'middle';
          j.fillText(label, 20, y0 + LAB / 2); j.font = '400 22px -apple-system, Helvetica, sans-serif'; const t = `${title} · ${note}`; j.fillText(t, OUT - 20 - j.measureText(t).width, y0 + LAB / 2);
          for (let c = 0; c < cols; c++) { const sy = c * slice, sh = Math.min(slice, img.height - sy); if (sh <= 0) continue; j.drawImage(img, 0, sy, img.width, sh, c * (colW + GAP), y0 + LAB, colW, sh * k); }
        };
        part(A, la, 0, `${A.width}×${A.height} px`);
        part(B, lb, LAB + block + GAP, `${B.width}×${B.height} px · ${diff ? `${diff} px differ (${diff - inside} outside the photo)` : 'pixel-identical'}`);
        res.jpg = await enc(jc, 'image/jpeg', 0.86); res.jpgSize = [OUT, total];
        return res;
      }, { name, box, la, lb, phone: size === 'phone', title: `${view} · ${size} ${SIZES[size].width}×${SIZES[size].height} @${SIZES[size].dpr}x` });
      writeFileSync(join(out, name + '.jpg'), Buffer.from(r.jpg, 'base64')); delete r.jpg;
      if (r.diffPng) { writeFileSync(join(out, name + '-diff.png'), Buffer.from(r.diffPng, 'base64')); delete r.diffPng; }
      r.photo = box; r.logA = { console: ma.console, pageerror: ma.pageerror, failed: ma.failed, status: ma.status }; r.logB = { console: mb.console, pageerror: mb.pageerror, failed: mb.failed, status: mb.status };
      results.push(r);
      console.log(`${name}: ${r.sameSize ? 'same size' : `SIZE ${r.a} vs ${r.b}`}, ${r.diff} px differ (${r.insidePhoto} inside the photo, ${r.outsidePhoto} outside; max step ${r.maxStep}, outside ${r.maxStepOutside})`);
    }
  } finally { await browser.close(); }
  writeFileSync(join(out, 'diff.json'), JSON.stringify(results, null, 1));
}

if (cmd === 'capture') await capture(args[0].replace(/\/$/, ''), resolve(args[1]));
else if (cmd === 'compare') await compare(resolve(args[0]), resolve(args[1]), resolve(args[2]), args[3], args[4]);
else { console.error('bun look.mjs capture <base-url> <out-dir> | compare <a-dir> <b-dir> <out-dir> <a-label> <b-label>'); process.exit(1); }
