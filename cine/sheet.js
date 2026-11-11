// The lens test: the same still scenes through every lens of a set, side by side, each with what
// it cost to draw. Stills, not film: one place, one look, and only the lens changes along a row.
// It is the bench for tuning the land's detail lens by lens.
import { scenes } from './trailer.js';
import { floor } from './trailer.js';
import { LENSES, ANAMORPHIC_SET, SPHERICAL_SET, hfov } from './lenses.js';

const cine = window.__cine, q = new URLSearchParams(location.search);
const set = q.get('set') === 'spherical' ? SPHERICAL_SET : ANAMORPHIC_SET, seed = +(q.get('seed') || 1);
const grid = document.getElementById('grid'), status = document.getElementById('status');
const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
async function cost(n) { // mean and worst frame time over n frames
  let last = 0, sum = 0, worst = 0, k = 0;
  await new Promise((r) => { const f = (t) => { if (last) { const d = t - last; sum += d; worst = Math.max(worst, d); k++; } last = t; k >= n ? r() : requestAnimationFrame(f); }; requestAnimationFrame(f); });
  return { ms: sum / k, worst };
}
function crop(c, aspect) { // the picture inside the window: without the bars
  if (!aspect) return c;
  const wa = c.width / c.height, o = document.createElement('canvas');
  const w = aspect > wa ? c.width : Math.round(c.height * aspect), h = aspect > wa ? Math.round(c.width / aspect) : c.height;
  o.width = w; o.height = h; o.getContext('2d').drawImage(c, (c.width - w) / 2, (c.height - h) / 2, w, h, 0, 0, w, h);
  return o;
}

async function run() {
  while (!window.__s8?.loadMs) await frames(5);
  cine.floor = floor;
  const list = scenes(seed), rows = [];
  grid.style.gridTemplateColumns = `110px repeat(${set.length}, minmax(150px, 1fr))`;
  grid.append(Object.assign(document.createElement('div'), { className: 'h' }));
  for (const id of set) grid.append(Object.assign(document.createElement('div'), { className: 'h', innerHTML: `<b>${id}</b> ${LENSES[id].name}<br><i>${hfov(LENSES[id]).toFixed(1)}° wide</i>` }));
  let done = 0;
  for (const sc of list) {
    grid.append(Object.assign(document.createElement('div'), { className: 'h side', innerHTML: `<b>${sc.name}</b><br><i>${sc.what}</i>` }));
    for (const id of set) {
      const cell = document.createElement('a'); cell.className = 'cell'; grid.append(cell);
      cine.take({ pos: sc.pos, look: sc.look, lens: id, roll: 0 });
      await frames(14);                               // the ground cache and the patches settle
      const c = await cost(24), info = window.__s8.renderer.info.render, tris = info.triangles, draws = info.calls;
      const shot = crop(await cine.grab(520), LENSES[id].fmt.aspect), v = cine.view;
      cell.href = `/?cam=${v.pos.map((x) => x.toFixed(2)).join(',')},${v.yaw.toFixed(2)},${v.pitch.toFixed(2)},0,${v.mm}&lens=${id}`;
      cell.title = 'open this view in the world';
      cell.append(shot, Object.assign(document.createElement('span'), { className: c.ms > 17.6 ? 'slow' : '', textContent: `${c.ms.toFixed(1)} ms · worst ${c.worst.toFixed(0)} · ${(tris / 1e6).toFixed(2)} M tris · ${draws} draws` }));
      rows.push({ scene: sc.name, lens: id, ms: +c.ms.toFixed(2), worst: +c.worst.toFixed(1), tris, draws });
      status.textContent = `${++done} / ${list.length * set.length}`;
    }
  }
  const slow = rows.filter((r) => r.ms > 17.6);
  status.textContent = `done · ${rows.length} stills · ${slow.length} over 16.7 ms (in red)`;
  window.__sheet = rows;   // for the agent: every still's cost
}
run();
