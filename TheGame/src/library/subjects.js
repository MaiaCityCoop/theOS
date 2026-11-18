// What the library shows on its stage (src/stage/studio.js), each with its card: an asset (a placed one stands in the
// middle; a scattered one lies there as a few of its kind, small to large, or is the meadow itself), a biome laid over
// all the land round the stage, a person, the lineup of every asset, a material. Each is stood in the world once it is
// compiled (src/boot.js show), and freed when the next comes.
import * as THREE from 'three/webgpu';
import { solidOf, facesOf } from '../../assets/index.js';
import { recipes } from '../core/registry.js';
import { BIOMES } from '../world/biomes.js';
import { place } from '../world/place.js';
import { engineOf, rowOf } from '../scatter/index.js';
import { detailOf, distanceAt } from '../detail/index.js';
import { spanOf, most } from '../../assets/kinds.js';
import { CROWD } from '../../assets/kit/crowd.js';
import { STAGE } from '../../world/places.js';
import { heightAt } from '../world/land.js';
import { materialPreview } from '../materials/preview.js';
import { WALKER, PERSON } from '../../world/scale.js';
import { U } from '../core/uniforms.js';
import { byUid, num, cap, head, fig, figs, cell, say, chip, fileOf, sizeFig, pick, more } from './card.js';

export const ASSETS = byUid(recipes('asset')), MATERIALS = recipes('material'), MATERIAL = byUid(MATERIALS), BIOME = byUid(BIOMES);
export const CHARS = recipes('character'), CHAR = byUid(CHARS);   // the people (characters/*.js): each made by its own kit
export const NEAR = 0.45;   // how near the camera comes to a person (m)

/** The subjects for the game, its studio, the card (info) and the hint under the stage; q: the page's address. */
export function createSubjects({ game, studio: S, info, hint, q }) {
  const { tex } = game, HINT = hint.textContent;
  const mark = (attr, id) => document.querySelectorAll('.item').forEach((b) => b.classList.toggle('on', b.dataset[attr] === id));   // the chosen one in the list
  const address = (what) => history.replaceState(null, '', `?${q.get('in') ? 'in=' + q.get('in') + '&' : ''}${what}`);
  const placed = (a, at) => place(null, a, at);   // (stood by the stage once it is compiled)
  let staged = null, lined = [], seed = null, age = 70, growRow = false;   // what stands on the stage now; a procedural asset's seed (null: its own); a tree's age, or every stage of its growth in a row
  let cardTab = 'info', lodAt = null, showBody = false, bodyLines = null;   // the asset card's tab; the level of detail being looked at (null: none chosen); its collision drawn on the stage (intent 0003)
  let person = null, boneLines = null, showBones = false, heldMat = null;   // a person on the stage and their skeleton; the material held in the pool while it stands (the list's pictures may not take its layer)
  const people = new Map();   // the people made, kept to be shown again
  // Off the stage (intent 0025): what stood there taken out of the world and freed, so nothing of it is drawn, lit or
  // kept after it. Out of the scene, a fire gives its light back to the world's own (src/world/fire.js); then every part of
  // it is freed, its geometry and material with it, unless it is shared and says so (userData.kept: a person shown again,
  // the materials' ball). Answers null, for what held it.
  function free(o) {
    if (!o) return null;
    game.hide(o);
    if (o.userData.kept) return null;
    o.traverse((m) => {
      if (m.geometry && !m.geometry.userData.kept) m.geometry.dispose();
      for (const x of [m.material ?? []].flat()) x.dispose();
      m.dispose();   // (what the renderer made for the object itself; a skeleton's lines free their own with it)
    });
    return null;
  }
  function clear() {
    S.round(); S.sandbox(); S.grow(false);   // round the stage, the land is all meadow, nothing grown on it
    staged = free(staged); person = S.person = null; S.look = null; S.line = null; hint.textContent = HINT;
    boneLines = free(boneLines); bodyLines = free(bodyLines); lined = lined.map(free).filter(Boolean);
    if (heldMat && !tex.used.some((u) => u.uid === heldMat)) tex.release(heldMat);   // (a material held while it stood: the pool's again)
    heldMat = null;
  }

  // ---- an asset ----
  // how the camera frames an asset on the stage: as its engine says (a rock from above and near, a tree by its age), else by its size
  const frameOf = (a) => engineOf(a)?.frame?.(a, { age, all: growRow }) ?? { height: most(a.size.height), dist: Math.max(most(a.size.length), most(a.size.width), most(a.size.height)) * 2.2, pitch: 0.32, span: spanOf(a) };
  function stageAsset(a) {
    clear();
    const E = engineOf(a);   // a scattered asset stands as its engine shows it (a few rocks small to large, a tree at an age, the meadow itself)
    staged = E?.stage ? E.stage(tex, rowOf(a), { x: STAGE.x, z: STAGE.z, heightAt, studio: S, level: lodAt ?? 0, seed, age, all: growRow }) : placed(a, { x: STAGE.x, z: STAGE.z, yaw: 0.6, solid: false });
    game.show(staged);
    drawBody(a);
  }
  // an asset's body as lines on the ground: its walls (with their doors left open), posts and boxes, from its file or its kind
  function drawBody(a) {
    bodyLines = free(bodyLines);
    if (!showBody) return;
    const s = solidOf(a), g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
    const y = (x, z) => heightAt(STAGE.x + x, STAGE.z + z) + 0.08;
    const pts = (list) => {   // a ribbon 6 cm wide along the line, lying on the ground (a GL line is one pixel: too thin to see)
      const pos = [];
      for (let i = 1; i < list.length; i++) {
        const [x0, z0] = list[i - 1], [x1, z1] = list[i], l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = (-(z1 - z0) / l) * 0.03, nz = ((x1 - x0) / l) * 0.03;
        const A = [x0 + nx, y(x0, z0), z0 + nz], B = [x0 - nx, y(x0, z0), z0 - nz], C = [x1 + nx, y(x1, z1), z1 + nz], D = [x1 - nx, y(x1, z1), z1 - nz];
        pos.push(...A, ...B, ...C, ...B, ...D, ...C);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return geo;
    };
    const yaw = engineOf(a) ? 0 : 0.6, c = Math.cos(yaw), n = Math.sin(yaw), W = (u, v) => [u * c + v * n, -u * n + v * c];   // as place() turns it
    const ring = (cx, cz, r, gaps = []) => { const out = []; for (let i = 0; i <= 96; i++) { const t = (i / 96) * Math.PI * 2; if (gaps.some(([m, h]) => Math.abs(Math.atan2(Math.sin(t - m), Math.cos(t - m))) < h)) { if (out.length > 1) g.add(new THREE.Mesh(pts(out.splice(0)), mat)); out.length = 0; continue; } out.push(W(cx + Math.cos(t) * r, cz + Math.sin(t) * r)); } if (out.length > 1) g.add(new THREE.Mesh(pts(out), mat)); };
    for (const w of s.walls || []) ring(0, 0, w.round, w.gaps);
    for (const p of s.posts || []) ring(p.x, p.z, p.r);
    for (const b of s.boxes || []) { const ca = Math.cos(b.a || 0), sa = Math.sin(b.a || 0), k = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([i, j]) => { const u = (i * b.w) / 2, v = (j * b.d) / 2; return W(b.x + u * ca - v * sa, b.z + u * sa + v * ca); }); g.add(new THREE.Mesh(pts(k), mat)); }
    g.children.forEach((l) => { l.renderOrder = 9; const p = l.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + STAGE.x, p.getY(i), p.getZ(i) + STAGE.z); });   // from the stage's middle to the world
    game.show((bodyLines = g));
  }
  function asset(id, keepSeed) {
    const a = ASSETS[id]; if (!keepSeed) { seed = null; lodAt = null; } stageAsset(a);
    const F = frameOf(a); S.H = F.height; S.dist = F.dist; S.pitch = F.pitch; S.spin = true;
    mark('id', id);
    const s0 = a.placement.seed, seeded = s0 != null;
    const scat = a.placement.at === 'scatter', where = scat ? `Scattered · ${a.placement.biome ? (BIOME[a.placement.biome]?.name || 'its biome').toLowerCase() : a.placement.outcrops ? 'outcrops' : 'everywhere'}` : 'At a named place';
    // what a person reads: what it is, how large, where it stands (its colours and its levels of detail are the file's)
    info.innerHTML = `<div class="g-tabs"><button data-tab="info" class="${cardTab === 'info' ? 'on' : ''}">Info</button><button data-tab="detail" class="${cardTab === 'detail' ? 'on' : ''}">Detail</button></div>`
      + (cardTab === 'detail' ? levelsOf(a) : head('Asset', a.kind, a.name, a.about)
      + figs(scat ? [sizeFig(a.size.length, 'Length'), a.placement.cell != null ? fig(num(a.placement.cell), 'm', 'Apart') : sizeFig(a.size.height, 'Height')] : [sizeFig(a.size.length, 'Footprint'), sizeFig(a.size.height, 'Height')], scat)
      + `<div class="g-cells g-part">${cell('Placed', say(where), true)}${a.look ? cell('Look', `<div class="g-chips">${chip(a.look.material || 'rock')}</div><span class="g-sub" style="white-space:normal">moss ${a.look.moss} · relief ${a.look.relief} · worn ${a.look.smooth} · broken ${a.look.cuts}</span>`, true) : ''}</div>`
      + (a.growth ? growthCell(a) : '')
      + (seeded ? `<div class="seed g-part"><span class="g-label">Seed</span><b>${seed ?? s0}${seed != null && seed !== s0 ? '' : ' · its own'}</b>${seed != null && seed !== s0 ? '<button class="g-btn quiet" id="seed0">Own</button>' : ''}<button class="g-btn" id="seedR">Random</button></div>` : '')
      + fileOf(a));
    const again = () => { const d = S.dist, p = S.pitch; asset(id, true); S.dist = d; S.pitch = p; };   // (the card again, not the view)
    info.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { cardTab = b.dataset.tab; again(); }));
    info.querySelectorAll('[data-lod]').forEach((b) => (b.onclick = () => lookAtLevel(a, +b.dataset.lod)));
    const bt = document.getElementById('bodyT'); if (bt) bt.onclick = () => { showBody = !showBody; again(); };
    if (a.growth && cardTab === 'info') {   // its age: the slider, a stage's button, the row of every stage
      const sl = document.getElementById('ageS'), told = () => (document.getElementById('ageL').textContent = ageText(a));
      sl.oninput = () => { age = +sl.value; growRow = false; told(); stageAsset(a); const F = frameOf(a); S.H = F.height; S.dist = F.dist; };
      info.querySelectorAll('[data-age]').forEach((b) => (b.onclick = () => { age = +b.dataset.age; growRow = false; const p = S.pitch; asset(id, true); S.pitch = p; }));
      document.getElementById('ageRow').onclick = () => { growRow = !growRow; const p = S.pitch; asset(id, true); S.pitch = p; };
    }
    if (seeded && cardTab === 'info') {   // a procedural asset made again from another seed: the same recipe, another of its kind; the file keeps its own
      document.getElementById('seedR').onclick = () => { seed = Math.floor(Math.random() * 100000); asset(id, true); };
      const o = document.getElementById('seed0'); if (o) o.onclick = () => { seed = null; asset(id, true); };
    }
    address(`asset=${id}`);
  }
  // a tree that grows: its age, a slider over its years, a button for each stage of its growth, and its stages in a row
  const ageText = (a) => (growRow ? `Every stage · ${a.growth.years.join(', ')} years` : `${age} year${age === 1 ? '' : 's'} · ${a.growth.at(age).height.toFixed(1)} m high`);
  function growthCell(a) {
    const G = a.growth;
    return `<div class="g-cell g-part"><span class="g-label">Age</span><div class="seed"><b id="ageL" style="font-weight:450">${ageText(a)}</b><button class="g-btn${growRow ? '' : ' quiet'}" id="ageRow">${growRow ? 'One' : 'All'}</button></div>`
      + `<input id="ageS" type="range" min="${Math.ceil(G.stages[0].from)}" max="${Math.floor(G.stages.at(-1).to)}" value="${age}" style="width:100%;margin:10px 0 6px;accent-color:#e3c27a">`
      + `<div class="seed" style="gap:6px;flex-wrap:wrap">${G.years.map((y) => `<button class="g-btn${!growRow && age === y ? '' : ' quiet'}" data-age="${y}">${y}</button>`).join('')}</div></div>`;
  }
  // the Detail tab: every level of detail of the asset, each a button that takes the camera to where that level is drawn
  function bands(a) {   // its levels as the detail engine resolves them (src/detail): each drawn between lo and hi pixels on screen
    const { levels, cut } = detailOf(a), faces = (l) => (l.impostor ? 2 : facesOf(l));   // (one count for every sort of level: assets/index.js)
    const shown = a.placement.at === 'scatter' ? levels.filter((l) => !l.impostor) : levels;   // a scattered asset has no card yet
    return [...shown.map((l) => ({ i: l.i, lo: l.lo, hi: l.hi, faces: faces(l), impostor: l.impostor })), { i: levels.length, lo: 0, hi: cut, faces: 0 }];   // and below the last: nothing drawn
  }
  const span = (a) => frameOf(a).span;   // what its size on screen is measured by
  const near0 = (a) => frameOf(a).dist;   // the close look
  const pxAim = (b) => (b.hi === Infinity ? b.lo * 3 : b.lo === 0 ? b.hi / 2.5 : Math.sqrt(b.lo * b.hi));   // well inside its band
  // where the camera stands to see a band: by size on screen, as the engine measures it (the lens and the governor count)
  const at = (b, a) => (b.hi === Infinity ? Math.min(near0(a), (span(a) * U.uPxK.value) / (b.lo * 1.5 * U.uLodInv.value)) : (span(a) * U.uPxK.value) / (pxAim(b) * U.uLodInv.value));
  function levelsOf(a) {
    const m = (v) => (v >= 1000 ? `${num(v / 1000)} km` : `${Math.round(v)} m`), p = (v) => `${num(v)} px`;
    const range = (b) => (b.hi === Infinity ? `over ${p(b.lo)}` : b.lo === 0 ? `under ${p(b.hi)}` : `${p(b.lo)} to ${p(b.hi)}`);
    return `<header><span class="g-label">Levels of detail</span><p class="g-text" style="margin-top:8px">Choose a level to go where it is drawn. Right: how far that is.</p></header>
    ${bodyCell(a)}
    <div class="g-pick g-part">${bands(a).map((b) => `<button data-lod="${b.i}" class="${lodAt === b.i ? 'on' : ''}"><b>${b.impostor ? '◆' : b.faces ? b.i + 1 : '–'}</b><span><span class="g-name">${b.impostor ? `Impostor · ${CROWD.VIEWS ** 2} views` : b.faces ? `${b.faces.toLocaleString('en')} faces` : 'Not drawn'}</span><span class="g-sub">${range(b)}</span></span><span class="g-file">${m(distanceAt(pxAim(b), span(a)))}</span></button>`).join('')}</div>`
      + fileOf(a);
  }
  // its body, as a line of words and a button to draw it on the stage
  function bodyCell(a) {
    const s = solidOf(a), own = !!a.solid, parts = [s.walls?.length && `${s.walls.length} wall${s.walls.length > 1 ? 's' : ''}${s.walls.some((w) => w.gaps?.length) ? ' with a door' : ''}`, s.posts?.length && `${s.posts.length} post${s.posts.length > 1 ? 's' : ''}`, s.boxes?.length && `${s.boxes.length} box${s.boxes.length > 1 ? 'es' : ''}`].filter(Boolean).join(', ');
    return `<div class="g-cell g-part"><span class="g-label" title="${own ? 'its own' : `its kind's (${a.kind})`}">Body</span><div class="seed"><b style="font-weight:450">${parts || 'none'}</b><button class="g-btn${showBody ? '' : ' quiet'}" id="bodyT">${showBody ? 'Hide' : 'Show'}</button></div></div>`;
  }
  function lookAtLevel(a, i) {
    lodAt = i; const p = Math.max(S.pitch, 0.25), y = S.yaw;
    asset(a.uid, true);   // the stage again: a scattered asset's rocks at that level's own detail; a stood one hands over by itself
    S.dist = at(bands(a)[i], a); S.pitch = p; S.yaw = y;
  }

  // ---- a biome: laid over all the land round the stage, the stage's bare round taken away; the river as a pond; its
  // grass, stones and trees grown on it ----
  function biome(id) {
    const b = BIOME[id]; clear(); S.round(0); S.sandbox(b); S.grow();
    S.H = 0.8; const wet = !!b.water; S.dist = wet ? 85 : 26; S.pitch = wet ? 0.55 : 0.42; S.spin = true;
    mark('biome', id);
    const laid = b.laid || 'By its own rule', pct = (v) => Math.round(v * 100);
    info.innerHTML = head('Biome', b.kind, b.name, b.about)
      + figs([b.grass && fig(pct(b.grass.cover), '%', 'Grass'), b.grass && fig(pct(b.grass.height), '%', 'Height'), b.stones && fig(pct(b.stones), '%', 'Stones')].filter(Boolean))
      + `<div class="g-cells g-part">${cell('Laid', say(laid))}${cell('Grass', say(b.grass ? cap([b.grass.tufts && 'in tufts', b.grass.flowers && 'with flowers'].filter(Boolean).join(', ')) || 'Plain' : 'None'))}${cell('Ground', `<div class="g-chips">${[b.floor, b.patches, b.spots, b.slopes].filter(Boolean).map((x) => chip(x.material)).join('')}</div>`, true)}</div>`
      + fileOf(b);
    address(`biome=${id}`);
  }

  // what a character wears and what it is made from; one that wears nothing says how it is made, closed until asked for
  const madeOf = (c) => (c.wears ? `<div class="g-cells g-part">${cell('Wears', `<div class="g-chips">${[c.wears.shirt.material, c.wears.trousers.material, c.wears.hair.material].map(chip).join('')}</div>`, true)}${cell('From', say(`Walker ${c.from.kind}`), true)}</div>` : c.made ? more('Made', c.made) : '');

  // ---- a person: standing in the middle of the stage, moving as the card says (a walk goes round it); their skeleton
  // drawn over them if asked. Made once and kept: choosing again or changing the move does not make them again ----
  function character(id, keep) {
    const c = CHAR[id];
    if (!keep || !person) {
      clear();
      let P = people.get(id); if (!P) { people.set(id, (P = c.make(tex))); P.onGrown = () => { if (person === P) character(id, true); }; }   // (one grown in the page says when a finer surface is on it: its card is drawn again)
      staged = new THREE.Group(); staged.position.set(STAGE.x, heightAt(STAGE.x, STAGE.z), STAGE.z); staged.add(P.object);
      staged.userData.kept = true;   // (kept to be shown again: nothing to free when it goes)
      person = P; for (const [ask, set] of [['move', 'setMove'], ['layer', 'setLayer'], ['face', 'setExpression']]) if (q.get(ask)) P[set]?.(q.get(ask));   // (what the address asks of them)
      P.step(0);
      game.show(staged);
      // the first frame from the front, the person in the middle and facing us; then it circles, as every subject does
      S.H = P.height * 1.25; S.dist = 4.2; S.pitch = 0.2; S.spin = true; S.yaw = P.object.rotation.y; S.person = P;
      hint.textContent = 'Drag to circle, up and down to look higher or lower · wheel to come close';
    }
    const P = person;
    boneLines = free(boneLines);
    if (showBones) { boneLines = new THREE.SkeletonHelper(P.bones.root); boneLines.material.depthTest = false; boneLines.material.transparent = true; boneLines.renderOrder = 9; game.show(boneLines); }
    mark('char', id);
    // (a character says what it wears and what it is made from; one that wears nothing says how it is made, closed until
    // asked for, gives its own figures, and a note while it is still being grown. Its variants are pills: card.js pick)
    info.innerHTML = head('Character', c.kind, c.name, c.about)
      + figs([fig(num(P.height), 'm', 'Height'), ...(P.figures ?? [[P.bonesCount, '', 'Bones']]).map((f) => fig(...f)), fig(Math.round(P.faces / 1000), 'k', 'Faces')])
      + (P.note ? `<div class="g-cell g-part">${say(P.note)}</div>` : '')
      + [['Moves', 'move', P.moves, P.move], ['Expressions', 'face', P.expressions, P.expression], ['Layers', 'layer', P.layers, P.layer]].filter((v) => v[2]).map((v) => pick(...v)).join('')
      + `<div class="seed g-part"><span class="g-label">${P.rigLabel ?? 'Skeleton'}</span><b></b><button class="g-btn${showBones ? '' : ' quiet'}" id="bonesT">${showBones ? 'Hide' : 'Show'}</button></div>`
      + madeOf(c)
      + fileOf(c);
    // (a pill chooses its variant: a move; a body's outermost layer; what a figure's face does, characters/kit/figure.js)
    for (const [ask, set] of [['move', 'setMove'], ['layer', 'setLayer'], ['face', 'setExpression']]) document.querySelectorAll(`[data-${ask}]`).forEach((b) => (b.onclick = () => { P[set](b.dataset[ask]); character(id, true); }));
    document.getElementById('bonesT').onclick = () => { showBones = !showBones; character(id, true); };
    address(`character=${id}&move=${P.move}${P.layer ? '&layer=' + P.layer : ''}${P.expression ? '&face=' + P.expression : ''}`);
  }

  // ---- the lineup (intent 0035): every asset beside the Settler, each as the world stands it (a tree at seventy, a bush
  // at its own size, stones and boulders small to large), on one line across the stage, the largest at its ends, and a
  // line of the sun's gold at the walker's eyes (world/scale.js): what is the right size next to what, at a glance ----
  const LINEUP = ['Stone pine', 'Mastic', 'Reeds', 'Bell tent', 'Fire pit', null, 'Bracken', 'Rockrose', 'Dead wood', 'Moss cushion', 'Stones', 'Boulders', 'Holm oak'];   // null: the Settler
  function lineup() {
    clear();
    const all = Object.values(ASSETS), byName = (n) => all.find((a) => a.name === n), with_ = { 'Fire pit': 'Flame' };   // (the flame stands in its pit)
    const order = [...LINEUP.map((n) => (n ? byName(n) : 'person')).filter(Boolean), ...all.filter((a) => !LINEUP.includes(a.name) && a.name !== 'Flame' && engineOf(a)?.id !== 'grass' && a.placement.engine !== 'grass')];
    const R = (a) => (a === 'person' ? 1.2 : a.placement.engine === 'rocks' ? (most(a.size.length) * 0.4 + 0.3) * 2.7 + most(a.size.length) : a.placement.engine === 'trees' ? Math.max(1, most(a.size.length) * 0.75) : most(a.size.length));
    const gap = 0.8, wide = order.reduce((t, a) => t + R(a) + gap, -gap), z = STAGE.z, eyes = new THREE.MeshBasicMaterial({ color: 0xf2b544 });
    S.round(wide / 2 + 4);   // (bare ground under the whole line: no blade in front of what is small)
    let x = STAGE.x - wide / 2;
    for (const a of order) {
      const w = R(a), cx = x + w / 2, y = heightAt(cx, z);
      if (a === 'person') {
        const P = CHARS[0].make(tex); P.step(0.5); P.object.position.set(cx, y, z); P.object.rotation.y = 0; P.object.updateMatrixWorld(true); lined.push(P.object);
      } else {
        const E = engineOf(a);
        if (E?.stage) lined.push(E.stage(tex, rowOf(a), { x: cx, z, heightAt, studio: S, level: 0, seed: null, age: 70 }));
        else { lined.push(placed(a, { x: cx, z, yaw: Math.PI, solid: false })); const f = with_[a.name] && byName(with_[a.name]); if (f) lined.push(placed(f, { x: cx, z, yaw: Math.PI, solid: false })); }
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w + gap, 0.015, 0.015), eyes); bar.position.set(cx, y + WALKER.eye, z + 0.02); bar.renderOrder = 9; lined.push(bar);   // the walker's eyes, over its ground
      x += w + gap;
    }
    for (const o of lined) game.show(o);   // (each on its own: a fire burns while it is itself in the world)
    const p = order.indexOf('person'), along = order.slice(0, p).reduce((t, a) => t + R(a) + gap, 0) + R('person') / 2;   // (the Settler's place on the line)
    S.line = [STAGE.x - wide / 2 + along, z]; S.H = 9; S.dist = 14; S.pitch = 0.02; S.yaw = 0; S.spin = false;
    document.querySelectorAll('.item').forEach((b) => b.classList.toggle('on', !!b.dataset.lineup));
    const real = (u) => { const m = ASSETS[u]?.measure; return m?.typical ? `${m.typical.join('–')} m` : m?.across ? `${m.across.typical.join('–')} m across` : ''; };   // (its own measure: intent 0035)
    info.innerHTML = head('Lineup', 'every asset', 'At their true size', `Every asset beside the Settler (${PERSON.stature} m). The gold line: your eyes, ${WALKER.eye} m.`)
      + `<div class="g-cells g-part">${order.map((a) => (a === 'person' ? cell('Settler', say(`${PERSON.stature} m tall`)) : cell(a.name, say(real(a.uid))))).join('')}</div>`
      + `<footer class="g-part"><span class="g-file">each asset's measure, against TheGame/world/scale.js</span><span class="g-file">bun tools/scale.js</span></footer>`;
    address('lineup=1');
  }

  // ---- a material: a ball of it in the middle of the stage, and the stage's round laid in it, into the land like any ground ----
  const ballGeo = new THREE.SphereGeometry(1.1, 128, 96); ballGeo.userData.kept = true;   // (one ball for every material: kept when its material goes)
  function material(id) {
    const m = MATERIAL[id]; clear(); staged = new THREE.Group();
    tex.want(id, true); heldMat = id;
    const mat = materialPreview(tex, id, 2), y = heightAt(STAGE.x, STAGE.z);
    S.round(STAGE.r + 0.2, id, 2);
    const ball = new THREE.Mesh(ballGeo, mat); ball.position.set(STAGE.x, y + 1.15, STAGE.z); ball.renderOrder = 1; ball.frustumCulled = false; staged.add(ball);
    game.show(staged);
    S.H = 1.3; S.dist = 9.5; S.pitch = 0.5; S.spin = true;
    mark('mat', id);
    info.innerHTML = head('Material', m.kind, m.name, m.about)
      + figs([fig(1024, 'px', 'Baked'), fig(MATERIALS.indexOf(m), '', 'Layer')])
      + `<div class="g-cells g-part">${cell('Used by', say(cap(m.usedBy).replace(/; /g, '<br>')), true)}${cell('Relief', say(`${m.bump}`))}${cell('Baked', say(`Albedo, height, relief, roughness${tex.packed ? ', packed' : ''}`), true)}</div>`
      + fileOf(m);
    address(`material=${id}`);
  }

  return { asset, biome, character, lineup, material };
}
