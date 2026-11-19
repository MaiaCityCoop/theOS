// One share of the start's GPU census (tools/roomcensus.js, which runs this a process a share): `bun tools/roomshare.js
// <share>`. An adapter of that share of the Mac's largest buffer (src/core/budget.js MAC_BUFFER), the budget set from it
// as at boot (src/core/gpu.js askedLimits), the world's fixed pools made as src/boot.js makes them, on the GPU's stand-in
// (tools/gpu-mock.js); the ledger as one line: room-census: {share, budget, noted, classes, rows}.
const SHARE = Number(process.argv[2]);
const { mock } = await import('./gpu-mock.js'), M = await mock({ lean: true }), { THREE, renderer } = M;
const { MAC_BUFFER } = await import('../src/core/budget.js'), G = await import('../src/core/gpu.js');
globalThis.navigator.gpu = { requestAdapter: async () => ({ limits: { maxBufferSize: SHARE * MAC_BUFFER, maxStorageBufferBindingSize: SHARE * MAC_BUFFER }, info: { vendor: 'census', architecture: `share ${SHARE}` } }) };
const log = console.info; console.info = () => {};
await G.askedLimits();
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000); scene.add(camera);
const { createUniforms } = await import('../src/core/uniforms.js'); createUniforms(camera);
(await import('../src/detail/impostor.js')).setImpostorRenderer(renderer);
const { createTemporal } = await import('../src/core/temporal.js'), { createScreen } = await import('../src/core/screen.js'), { createLens } = await import('../src/camera/post.js');
const temporal = createTemporal(renderer), screen = createScreen(renderer, { temporal, lens: createLens(renderer) });
const { keepMeasure } = await import('../src/detail/measure.js'); keepMeasure(() => screen.out);
const tex = (await import('../src/materials/bake.js')).bakeTextures(renderer, { spare: 1 });
(await import('../src/world/tile.js')).useTiles(tex);
(await import('../src/world/light/start.js')).startLight(renderer, screen);
const { createGround } = await import('../src/scatter/ground.js'), ground = createGround(renderer, tex);
(await import('../src/world/rocksolid.js')).useGround(ground);
const { createTerrain } = await import('../src/terrain/terrain.js'), terrain = createTerrain(scene, tex, renderer);
const { createScatter } = await import('../src/scatter/index.js'); createScatter(scene, tex, ground, renderer, camera);
(await import('../src/world/sky.js')).createSky(scene, camera, renderer);
(await import('../src/world/weather/index.js')).createWeather({ scene, renderer, camera });
const { groundAt } = await import('../src/world/land.nodes.js'), { crownsAt, crownsVersion } = await import('../src/terrain/layers.js');
(await import('../src/world/light/index.js')).createLight(renderer, { groundAt, land: terrain.pages, crowns: { at: crownsAt, version: crownsVersion } });
console.info = log;
const L = G.ledger();
console.log(`room-census: ${JSON.stringify({ share: SHARE, budget: L.budget, noted: L.noted, classes: Object.fromEntries(Object.entries(L.classes).map(([c, v]) => [c, { noted: v.noted, budget: v.budget }])), rows: L.rows })}`);
process.exit(0);
