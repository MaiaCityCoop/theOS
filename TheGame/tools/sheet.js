// The baked materials side by side, flat, under one raking light (in the game's or the library's console:
// `await (await import('/game/tools/sheet.js')).sheet()`): for looking at a recipe while painting it (materials/*.js).
// tile: repeats across each square; only: names to show; the sheet covers the page until it is clicked.
export async function sheet({ tile = 2, only } = {}) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (re) => import(R.filter((n) => re.test(n)).at(-1));
  const THREE = await mod(/three_webgpu\.js/), T = await mod(/three_tsl\.js/), { sceneThumb } = await mod(/materials\/preview\.js/), { recipes } = await mod(/core\/registry\.js/);
  const { renderer, tex } = window.__s8, M = recipes('material').filter((m) => !only || only.includes(m.name)), n = Math.ceil(Math.sqrt(M.length));
  const L = T.normalize(T.vec3(-0.5, 0.6, 0.65));
  const things = M.map((m, i) => {
    const q = T.uv().mul(tile), A = tex.a(m, q), N = T.normalize(tex.n(m, q).xyz.mul(2).sub(1)), mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = T.vec4(T.pow(A.rgb.mul(A.rgb).mul(T.max(N.dot(L), 0).mul(1.6).add(0.35)), T.vec3(1 / 2.2)), 1);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 1.96), mat); g.position.set((i % n) * 2 - (n - 1), n - 1 - Math.floor(i / n) * 2, 0);
    return g;
  });
  const cam = new THREE.OrthographicCamera(-n, n, n, -n, 0.1, 10); cam.position.set(0, 0, 5);
  let cv = document.getElementById('sheet');
  if (!cv) {
    cv = Object.assign(document.createElement('canvas'), { id: 'sheet', width: 1500, height: 1500, onclick: () => cv.remove() });
    Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, width: '100vmin', height: '100vmin', zIndex: 99999, background: '#000' }); document.body.append(cv);
  }
  await sceneThumb(renderer, things, cv, cam);
  return M.map((m) => m.name);
}
