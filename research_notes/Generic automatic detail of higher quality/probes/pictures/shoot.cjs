// Serves this folder, opens the page for each plant in the headless browser, saves a picture of it. Needs beside-<plant>.json beside it (written by generic.mjs with EXPORT=<this folder>/beside) and a folder or link `three` to three.js's build.
const http = require('http'), fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const root = __dirname, types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); });
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port, browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const which = process.argv.slice(2); for (const [page, scale, url = `${page}.html`] of [['beside-holmoak', 2, 'beside.html?plant=holmoak'], ['beside-stonepine', 2, 'beside.html?plant=stonepine']].filter(([n]) => !which.length || which.includes(n))) {   // (named pages only, or all)
    const ctx = await browser.newContext({ viewport: { width: 1960, height: 1400 }, deviceScaleFactor: scale }), p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') console.log(page, 'console error:', m.text()); }); p.on('pageerror', (e) => console.log(page, 'page error:', e.message));
    await p.goto(`http://127.0.0.1:${port}/${url}`);
    await p.waitForFunction(() => document.body.dataset.done === '1', null, { timeout: 120000 });
    await p.waitForTimeout(300);
    await (await p.$('#wrap')).screenshot({ path: path.join(root, `${page}.png`) });
    console.log(page, 'saved'); await ctx.close();
  }
  await browser.close(); server.close();
});
