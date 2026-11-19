// The readout in the corner: what a frame costs, and what the game holds in memory (src/core/gpu.js: what its pools
// have said, on the GPU and beside it on the page; what the device made against the budget the game holds itself to,
// the makes that wait for memory to be asked again, src/core/compile.js, and whether the world has settled, else what
// is still out, src/core/settle.js). Also kept on `stats` for whoever asks from outside. Hidden on a narrow screen
// (brand.css), but at `?hud`: shown at any width, a phone's too, to be read off a screenshot (src/core/flags.js).
import { ledger, wholeBudget } from './gpu.js';
import { waitingOnMemory } from './compile.js';
import { waiting } from './settle.js';
import { flag } from './flags.js';
import { passTimes, stampPasses } from './pace.js';
/** What is still out before the world settles (src/core/settle.js waiting): its first three, and how many more; none: yes. */
const outOf = () => { const out = Object.entries(waiting()); return out.length ? out.slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ') + (out.length > 3 ? ` and ${out.length - 3} more` : '') : 'yes'; };
/** Each pass's time on the GPU a frame since the last look (was: the times then, src/core/pace.js passTimes; frames since),
    the largest first: by the GPU's clock where every one of its submissions was stamped, else heard (said so). */
const byPass = (was, now, frames) => [...now].map(([n, t]) => { const w = was.get(n) ?? { heard: 0, stamped: 0, missed: 0 }, heard = t.missed > w.missed || t.stamped === w.stamped; return { n, heard, ms: ((heard ? t.heard - w.heard : t.stamped - w.stamped) / Math.max(1, frames)) }; })
  .filter((p) => p.ms >= 0.05).sort((a, b) => b.ms - a.ms).slice(0, 9).map((p) => `${p.n} ${p.ms.toFixed(1)}${p.heard ? ' heard' : ''}`).join('  ');
export function createHud(el, renderer, camera, governor, stats) {
  el.classList.toggle('always', flag('hud'));
  let at = 0, worst = 0, cpu = 0, frames = 0, times = new Map(), stamping = false;
  return {
    cpu(ms) { cpu += (ms - cpu) * 0.08; },
    frame(ms, now, note) {
      if (ms > worst) worst = ms;
      frames++;
      if (now - at < 300) return;
      // (each pass by the GPU's own clock once the readout is shown, whoever reads it: a desktop's corner, a phone's at
      // ?hud; one it hides, a phone's as it is played, pays nothing for the clock's marks)
      if (!stamping && el.getClientRects?.().length) { stamping = true; stampPasses(renderer.backend?.device); }
      const T = passTimes(), passes = byPass(times, T, frames); times = T; frames = 0;
      const r = renderer.info.render, p = camera.position, g = governor, mem = ledger(), A = stats.adapter, gib = (b) => `${(b / 2 ** 30).toFixed(2)} GiB`;
      el.textContent = `${(1000 / g.ms).toFixed(0)} fps  ${g.ms.toFixed(1)} ms  worst ${worst.toFixed(0)} ms\n` +
        `${r.drawCalls ?? r.calls} draws  ${(r.triangles / 1e6).toFixed(2)} M tris  drawn ×${g.dpr.toFixed(2)} of ×${stats.screen?.out ?? g.dpr}  detail ×${g.lod.toFixed(2)}${g.zoom > g.lod + 0.01 ? ' of ×' + g.zoom.toFixed(1) : ''}  js ${cpu.toFixed(2)} ms  held ${mem.gpu.toFixed(0)} MB${mem.page >= 1 ? ' + ' + mem.page.toFixed(0) : ''}\n` +
        `made ${mem.gpu.toFixed(0)} of ${Math.round(wholeBudget())} MB  waiting on memory ${waitingOnMemory()}  settled ${outOf()}\n` +
        (passes ? `GPU ms a frame: ${passes}\n` : '') +
        `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}${note}` + (A ? `\nGPU ${A.vendor} ${A.architecture}  buffer ${gib(A.maxBufferSize)}  binding ${gib(A.maxStorageBufferBindingSize)}  budget ${A.budget} MB (${Math.round(A.share * 100)} %)` : '');   // (the device's class: src/core/gpu.js adapterOf)
      Object.assign(stats, { fps: 1000 / g.ms, ms: g.ms, worst, calls: r.drawCalls ?? r.calls, triangles: r.triangles, dpr: g.dpr, cpu, lod: g.lod, zoom: g.zoom, heldGpu: mem.gpu, heldPage: mem.page });
      at = now; worst = 0;
    },
  };
}
