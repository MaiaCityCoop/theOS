// The library (library.html): every recipe of the registry (assets/index.js, biomes, characters, materials) on one
// stage, a fixed flat spot in the meadow (src/stage/studio.js), the camera circling it. Left, the list, each with a
// small picture (pictures.js); right, the chosen one's card; the stage shows it (subjects.js). It opens on its sections.
// The world under it is the stage's (src/boot.js): the land round the stage and what is shown, nothing more.
import { boot } from '../boot.js';   // (first: it reads back what was measured of the plants before anything asks a plant's size)
import { recipes } from '../core/registry.js';
import { BIOMES } from '../world/biomes.js';
import { WALKER } from '../../world/scale.js';
import { materialThumb, dioramaThumb } from '../materials/preview.js';
import { createStudio } from '../stage/studio.js';
import { createPictures } from './pictures.js';
import { createSubjects, ASSETS, MATERIALS, MATERIAL, BIOME, CHARS, CHAR, NEAR } from './subjects.js';

const q = new URLSearchParams(location.search), ids = Object.keys(ASSETS);
const game = await boot({ profile: 'stage' }), { renderer, tex } = game;
const studio = createStudio(game, { near: (s) => (s.person ? NEAR : 3), far: 1500 });   // (a person is come close to: a face, a hand)
const pictures = createPictures(game);
const on = createSubjects({ game, studio, info: document.getElementById('info'), hint: document.querySelector('.hint'), q });

// the list: each with a small picture of its nearest level, made when it comes into sight
const item = (data, name, sub) => `<button class="item glass flat" ${data}><canvas width="72" height="72"></canvas><span><b class="g-name">${name}</b><small class="g-sub">${sub}</small></span></button>`;
const list = document.getElementById('list'), grid = document.getElementById('grid');
list.innerHTML = `<div class="group" data-g="assets">Assets · ${ids.length}</div>` + item('data-lineup="1"', 'Lineup', 'all, beside the Settler') + ids.map((id) => item(`data-id="${id}"`, ASSETS[id].name, ASSETS[id].kind)).join('')
  + `<div class="group" data-g="biomes">Biomes · ${BIOMES.length}</div>` + BIOMES.map((b) => item(`data-biome="${b.uid}"`, b.name, b.kind)).join('')
  + `<div class="group" data-g="characters">Characters · ${CHARS.length}</div>` + CHARS.map((c) => item(`data-char="${c.uid}"`, c.name, c.kind)).join('')
  + `<div class="group" data-g="materials">Materials · ${MATERIALS.length}</div>` + MATERIALS.map((m) => item(`data-mat="${m.uid}"`, m.name, m.kind)).join('');
const each = (sel, fn) => { for (const b of list.querySelectorAll(sel)) fn(b, b.querySelector('canvas')); };
each('.item[data-mat]', (b, c) => { pictures.later(b, () => materialThumb(renderer, tex, b.dataset.mat, c)); b.onclick = () => on.material(b.dataset.mat); });   // a material's picture: its own baked tile
each('.item[data-char]', (b, c) => { pictures.later(b, () => pictures.person(CHAR[b.dataset.char], c)); b.onclick = () => on.character(b.dataset.char); });   // a person's: them, standing at ease
each('.item[data-biome]', (b, c) => { pictures.later(b, () => materialThumb(renderer, tex, BIOME[b.dataset.biome].floor.material, c)); b.onclick = () => on.biome(b.dataset.biome); });   // a biome's: a ball of its ground
each('.item[data-id]', (b, c) => { pictures.later(b, () => pictures.asset(ASSETS[b.dataset.id], c)); b.onclick = () => on.asset(b.dataset.id); });
each('.item[data-lineup]', (b, c) => {   // the lineup's picture: its things as bars by their heights, the walker's eyes a gold line over them (drawn, not rendered)
  const g = c.getContext('2d');
  [[19.6, '#4b6b3a'], [3.2, '#d8cfb5'], [1.75, '#8a6f55'], [2.3, '#5e7d45'], [0.6, '#8d9a7d'], [0.3, '#9a958c'], [20.6, '#3f5f34']].forEach(([h, col], i) => { g.fillStyle = col; g.fillRect(4 + i * 9.4, 68 - Math.max(2, Math.sqrt(h / 20) * 64), 7, Math.max(2, Math.sqrt(h / 20) * 64)); });
  g.fillStyle = '#f2b544'; g.fillRect(2, 68 - Math.sqrt(WALKER.eye / 20) * 64, 68, 2);
  b.onclick = () => on.lineup();
});

// the sections: the switch over the list, the grid to start from
const SECTIONS = [
  { id: 'assets', name: 'Assets', what: 'things made and stood', n: ids.length, open: () => on.asset(ids[0]), pic: (c) => pictures.asset(recipes('asset').find((a) => a.placement.at === 'places'), c) },
  { id: 'biomes', name: 'Biomes', what: 'what lies and grows', n: BIOMES.length, open: () => on.biome(BIOMES[0].uid), pic: (c) => dioramaThumb(renderer, tex, c) },
  { id: 'characters', name: 'Characters', what: 'who will live here', n: CHARS.length, open: () => on.character(CHARS[0].uid), pic: (c) => pictures.person(CHARS[0], c, true) },
  { id: 'materials', name: 'Materials', what: 'what it is all made of', n: MATERIALS.length, open: () => on.material(MATERIALS[0].uid), pic: (c) => materialThumb(renderer, tex, MATERIALS.find((m) => m.kind === 'stone'), c) },
];
const section = (id) => { list.dataset.sec = id; };
for (const sct of SECTIONS) {
  const b = document.createElement('button'); b.className = 'glass'; b.innerHTML = `<canvas width="192" height="192"></canvas><b class="g-title">${sct.name}</b><small class="g-sub">${sct.n} · ${sct.what}</small>`;
  grid.querySelector('.cards').append(b); pictures.now(() => sct.pic(b.querySelector('canvas')));
  b.onclick = () => { grid.classList.remove('on'); section(sct.id); sct.open(); };
}
document.getElementById('toLib').onclick = () => grid.classList.add('on');   // back to the library's sections
grid.onclick = (e) => { if (e.target === grid) grid.classList.remove('on'); };

// what the address asks for, or the sections over the first asset
section(q.get('biome') ? 'biomes' : q.get('material') ? 'materials' : q.get('character') ? 'characters' : 'assets');
if (!q.get('asset') && !q.get('biome') && !q.get('material') && !q.get('character') && !q.get('lineup')) grid.classList.add('on');   // the library opens on its sections
if (q.get('lineup')) on.lineup(); else if (CHAR[q.get('character')]) on.character(q.get('character')); else if (BIOME[q.get('biome')]) on.biome(q.get('biome')); else if (MATERIAL[q.get('material')]) on.material(q.get('material')); else on.asset(ASSETS[q.get('asset')] ? q.get('asset') : ids[0]);
