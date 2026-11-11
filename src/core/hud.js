// The readout in the corner: what a frame costs. Also kept on `stats` for whoever asks from outside.
export function createHud(el, renderer, camera, governor, stats) {
  let at = 0, worst = 0, cpu = 0;
  return {
    cpu(ms) { cpu += (ms - cpu) * 0.08; },
    frame(ms, now, note) {
      if (ms > worst) worst = ms;
      if (now - at < 300) return;
      const r = renderer.info.render, p = camera.position, g = governor;
      el.textContent = `${(1000 / g.ms).toFixed(0)} fps  ${g.ms.toFixed(1)} ms  worst ${worst.toFixed(0)} ms\n` +
        `${r.calls} draws  ${(r.triangles / 1e6).toFixed(2)} M tris  ratio ${g.dpr.toFixed(2)}  detail ×${g.lod.toFixed(2)}${g.zoom > g.lod + 0.01 ? ' of ×' + g.zoom.toFixed(1) : ''}  js ${cpu.toFixed(2)} ms\n` +
        `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}${note}`;
      Object.assign(stats, { fps: 1000 / g.ms, ms: g.ms, worst, calls: r.calls, triangles: r.triangles, dpr: g.dpr, cpu, lod: g.lod, zoom: g.zoom });
      at = now; worst = 0;
    },
  };
}
