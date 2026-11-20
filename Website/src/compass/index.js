// The Compass (../../Compass): Maia City's story and game as one guided journey. Seven chapters, one idea at a time:
// why (the vision), what (the mission), how the money works (one concept after another, each with its picture), how
// things grow (every recipe, played with), how a village climbs (every gate), who it is about, and the library of
// every document. Everything here is read from the Compass's files as they stand (Website/compass.js serves them); the
// page only shows them, and the story CLI alone changes them. The few numbers the diagrams compute with are the
// sheets' own rules, named once below.
import { marked } from 'marked';
import './compass.css';

// ---- the rules the diagrams compute with, as the sheets state them (Compass/worldbuilding/systems/the-game.md, the-harvest.md)
const RULE = {
  startHearts: 125000, perDay: 24, demurrage: 0.07,   // the money
  payout: 0.5,                                        // every coop pays 50% of its turnover to its MINDS holders
  faster: 0.05, more: 0.15, seedStep: 0.05,           // the harvest engine, per bed level and per seed-line step
  levels: [0, 3, 8, 21, 55],                          // harvests to reach bed levels 1..5
};
const PHASE = { 1: 'food', 2: 'energy', 3: 'compute', 4: 'factories' };

// ---- reading the markdown
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = (t) => marked.parseInline(String(t ?? ''));
const plain = (t) => String(t ?? '').replace(/\*\*|\*|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
const sec = (body, h) => { const m = body.match(new RegExp('^#+ ' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\n+([\\s\\S]*?)(?=\\n#+ |(?![\\s\\S]))', 'm')); return m ? m[1].trim() : ''; };
const quote = (body, h) => (sec(body, h).match(/((?:^>.*\n?)+)/m) || [])[1]?.replace(/^> ?/gm, '').trim() || '';
const table = (md) => md.split('\n').filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s\-:|]+\|\s*$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
const tables = (md) => md.split(/\n\s*\n/).filter((b) => b.trim().startsWith('|')).map(table);
const bullets = (md) => md.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
const lead = (md) => (md.split(/\n\s*\n/).find((p) => p.trim() && !/^[|>#-]/.test(p.trim())) || '').trim();
const num = (t) => { t = String(t ?? '').replace(/(\d),(\d)/g, '$1$2'); const m = String(t ?? '').match(/(?:→\s*\**\s*≈?|≈)\s*([\d.]+)/) || String(t ?? '').match(/([\d.]+)/); return m ? parseFloat(m[1]) : NaN; };
const fmt = (v, d = 1) => (Number.isFinite(v) ? (v >= 10 ? Math.round(v) : +v.toFixed(d)) : '—');
const big = (v) => Math.round(v).toLocaleString('en-US');

// ---- the recipes of the harvest sheet: one per "### " entry with a field table, or one per row of a recipes table
function recipes(body) {
  const part = body.split(/^## The recipes\s*$/m)[1] || '';
  const out = [];
  for (const chunk of part.split(/\n### /).slice(1)) {
    const title = chunk.split('\n')[0].trim(), name = title.split(' · ')[0], tag = title.split(' · ')[1] || '';
    const tbs = tables(chunk);
    if (!tbs.length) continue;
    const t = tbs[0];
    if (t[0].length === 2 && !/^Recipe$/i.test(t[0][0])) {   // a field table: | Field | value |
      const f = Object.fromEntries(t.filter((r) => r[0]).map((r) => [plain(r[0]).toLowerCase(), r[1]]));
      out.push({ name, tag, family: plain(f.family || '').split(/[·,]/)[0].trim(), fields: f, grow: num(f['grow time']), every: num((f['harvest kind'] || '').match(/every[^,;]*/)?.[0] || ''), kind: plain(f['harvest kind'] || '').split(':')[0], yield: num(f.yield), group: (plain(f.family || '').split(/[·,]/)[0].trim() || name).replace(/^./, (c) => c.toUpperCase()) });
    } else {   // a recipes table
      const head = t[0].map((h) => plain(h).toLowerCase());
      const gi = head.findIndex((h) => h.startsWith('game days')), ki = head.findIndex((h) => h.startsWith('harvest kind') || h === 'then'), yi = head.findIndex((h) => h === 'yield');
      for (const r of t.slice(1)) {
        const f = Object.fromEntries(head.map((h, i) => [h, r[i]]));
        const fam = /mushroom/i.test(name) ? 'mushroom' : /green/i.test(name) ? 'leaf' : name.toLowerCase();
        out.push({ name: plain(r[0]), tag: name, family: fam, fields: f, grow: num(gi >= 0 ? r[gi] : ''), every: num((ki >= 0 ? r[ki] : '').match(/every[^,;]*/)?.[0] || ''), kind: plain(ki >= 0 ? r[ki] : '').split(/[,:]/)[0], yield: fam === 'mushroom' ? 3 : 1, group: name });
      }
    }
  }
  out.forEach((r) => { if (!Number.isFinite(r.every) && /continuous/i.test(r.kind)) r.every = 1; if (!Number.isFinite(r.every)) r.every = 0; });
  return out.filter((r) => Number.isFinite(r.grow));
}

// ---- the page
export function renderCompass(box, b, { tab, DAYS }) {
  const game = b.systems.find((x) => x.id === 'the-game'), harvest = b.systems.find((x) => x.id === 'the-harvest');
  const md = b.story.body, f = b.story.front, G = game?.body || '', H = harvest?.body || '';
  const vision = quote(md, 'The core message'), mission = quote(md, 'The mission'), joint = (md.match(/\*\*How the two meet\.\*\*\s*([^\n]+)/) || [])[1] || '';
  const ladderPart = (G.split('### The village ladder')[1] || '').split('\n### ')[0];
  const [phases = [], steps = []] = tables(ladderPart);
  const rec = recipes(H);

  // every document, for the drawer and the library
  const docs = {};
  const put = (kind, label, x) => (docs[kind + '/' + x.id] = { ...x, kind, label });
  b.characters.forEach((x) => put('character', 'Who', x)); b.arcs.forEach((x) => put('arc', 'Arc', x));
  b.systems.forEach((x) => put('system', 'How it works', x)); b.locations.forEach((x) => put('place', 'Where', x));
  b.terms.forEach((x) => put('term', 'Word', x)); b.chapters.forEach((x) => put('episode', 'Episode', x));
  [['compass', 'The whole compass', md], ['plot', 'The plot', b.plot], ['world', 'The world', b.world], ['timeline', 'The timeline', b.timeline]]
    .forEach(([id, title, body]) => put('index', 'Overview', { id, front: { title }, body }));
  const name = (x) => x.front.name || x.front.term || x.front.title || x.id;
  const gist = (t) => { const p = lead(t || ''); const s = plain(p); return s.length > 140 ? s.slice(0, 139).replace(/\s\S*$/, '') + '…' : s; };

  const CH = [
    ['why', 'Why', 'The vision'], ['what', 'What', 'The mission'], ['money', 'How', 'The economy'],
    ['grow', 'Grow', 'The harvest'], ['climb', 'Climb', 'The village ladder'], ['who', 'Who', 'The people'], ['read', 'Read', 'The library'],
  ];
  const head = (i, title, take) => `<header class="chead"><span class="kick"><i>${i + 1}</i>${CH[i][1]}</span><h2>${title}</h2>${take ? `<p class="take">${take}</p>` : ''}</header>`;
  const next = (i) => (i + 1 < CH.length ? `<a class="next" href="#cp-${CH[i + 1][0]}">Next · ${CH[i + 1][2]} <b>↓</b></a>` : '');

  // ---- chapter 3: the economy, one concept after another
  const money = sec(G, 'The money'), econ = sec(G, "The city's economy: one currency inside");
  const econB = bullets(econ), pick = (k) => econB.find((x) => plain(x).toLowerCase().startsWith(k)) || '';
  const levelsT = table(sec(G, 'The three levels of coops')).slice(1);
  const startT = table(sec(G, 'The start capital')).slice(1);
  const CONCEPTS = [
    { id: 'citizen', t: 'Become a citizen', s: 'One human, one citizen, for €1 a day.', body: lead(sec(G, 'Citizenship: one human, one citizen')), vis: 'start' },
    { id: 'hearts', t: 'HEARTS', s: 'Your daily income, and why only investing gets you ahead.', body: (table(money).find((r) => /Personal HEARTS/.test(r[0])) || [])[2] || '', vis: 'hearts' },
    { id: 'coops', t: 'Three kinds of coop', s: 'The city, the village and the startups: who owns what.', body: '', vis: 'coops' },
    { id: 'loop', t: 'The loop', s: 'Rent and food in, half of every turnover back out.', body: [pick('the global rule'), pick('the circle'), pick('your harvest')].join('\n\n'), vis: 'loop' },
    { id: 'gate', t: 'The gate', s: 'Where city HEARTS meet the euro. Only coops pass.', body: [pick('the gate'), pick('bootstrap')].join('\n\n'), vis: 'gate' },
    { id: 'free', t: 'Free', s: 'The number the whole game exists to raise.', body: pick('a free citizen'), vis: 'free' },
  ];

  box.innerHTML = `
  <nav class="rail" aria-label="Chapters">${CH.map((c, i) => `<a href="#cp-${c[0]}" data-c="${c[0]}"><i>${i + 1}</i><span><small>${c[1]}</small>${c[2]}</span></a>`).join('')}</nav>
  <div class="cp">
    <section class="cphero">
      <div class="topbar"><button class="cpill" data-go="stories">← Stories</button><span>${esc(f.title || 'Maia City')} · ${b.chapters.length} of ${big(DAYS)} episodes written</span></div>
      <p class="ceyebrow">The Compass</p>
      <h1>Where every day<br>of the story points.</h1>
      <p class="clede">Seven chapters, one idea at a time: why we build, what we unite behind, how the money and the harvest work, how a village climbs, and who it is all about.</p>
      <svg class="arch" viewBox="0 0 700 230" aria-hidden="true"><path d="M30 215 C 140 20, 560 20, 670 215" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>
        ${CH.map((c, i) => { const t = i / (CH.length - 1), x = (1 - t) ** 3 * 30 + 3 * (1 - t) ** 2 * t * 140 + 3 * (1 - t) * t * t * 560 + t ** 3 * 670, y = (1 - t) ** 3 * 215 + 3 * (1 - t) ** 2 * t * 20 + 3 * (1 - t) * t * t * 20 + t ** 3 * 215;
          return `<a href="#cp-${c[0]}"><circle cx="${x}" cy="${y}" r="15"/><text x="${x}" y="${y + 4.5}">${i + 1}</text><text class="lab" x="${x}" y="${y - 26}">${c[2]}</text></a>`; }).join('')}
      </svg>
      <a class="next start" href="#cp-why">Begin <b>↓</b></a>
    </section>

    <section class="ch" id="cp-why">${head(0, 'The vision', 'Read it in the first person, as your own words.')}
      <div class="vision">${vision.split(/\n\s*\n/).map((p, i) => `<p class="reveal" style="--d:${i}">${inline(p)}</p>`).join('')}</div>${next(0)}</section>

    <section class="ch" id="cp-what">${head(1, 'The mission', 'The one vision a million of us unite behind.')}
      <div class="mission reveal">${mission.split(/\n\s*\n/).map((p) => `<p>${inline(p)}</p>`).join('')}</div>
      <div class="race reveal"><div class="track"><span class="startl">Start · 0 citizens</span><span class="finish">1.3 million · the real city</span>
        ${['Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Poland', 'Netherlands', 'Greece', 'Sweden', 'Austria', 'Ireland', 'Czechia'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}<em>… every European country, one city each</em></div></div>
      ${joint ? `<p class="aside reveal">${inline(joint)}</p>` : ''}${next(1)}</section>

    <section class="ch" id="cp-money">${head(2, 'The economy', 'Six ideas, in the order you meet them as a citizen. Take them one at a time.')}
      <div class="csteps" role="tablist">${CONCEPTS.map((c, i) => `<button role="tab" data-s="${i}" class="${i ? '' : 'on'}"><i>${i + 1}</i>${c.t}</button>`).join('')}</div>
      <div class="concept" id="cp-concept"></div>${next(2)}</section>

    <section class="ch" id="cp-grow">${head(3, 'The harvest', 'Everything that grows runs on one recipe. Pick a crop, then play with its bed level, the climate and your seed line.')}
      <div class="grow">
        <div class="crops">${[...new Set(rec.map((r) => r.group))].map((g) => `<div class="cg"><small>${esc(g)}</small>${rec.map((r, i) => (r.group === g ? `<button data-r="${i}">${esc(r.name)}</button>` : '')).join('')}</div>`).join('')}</div>
        <div class="crop" id="cp-crop"></div>
      </div>
      <p class="aside">Times are in game days: one game month is one real day. Every figure is an estimate, to be sourced and tuned. <button class="link" data-k="system/the-harvest">Read the whole harvest sheet</button></p>${next(3)}</section>

    <section class="ch" id="cp-climb">${head(4, 'The village ladder', 'A village starts with three settlers and climbs Fibonacci gates in four phases. Pick a gate.')}
      <div class="phases">${phases.slice(1).map((r, i) => `<div class="cphase ${PHASE[i + 1]}"><small>${esc(r[1])} villagers</small><b>${esc(r[0])}</b><span>${esc(r[2])}</span><em>${esc(r[3])}</em></div>`).join('')}</div>
      <div class="gates">${steps.slice(1).map((r, i) => `<button data-g="${i}" class="${PHASE[String(r[1]).trim()[0]] || ''}"><i></i><b>${esc(r[0])}</b></button>`).join('')}</div>
      <div class="gate" id="cp-gate"></div>
      <p class="aside"><button class="link" data-go="ladder">See every gate in one table →</button></p>${next(4)}</section>

    <section class="ch" id="cp-who">${head(5, 'The people', 'The hero is you. Maia is made of everyone who walks in. Samuel went first and files the report.')}
      <div class="people">${[...b.characters].sort((a, c) => (a.id === 'the-citizen' ? -1 : c.id === 'the-citizen' ? 1 : 0)).map((x) => `<button class="pcard ${x.id === 'the-citizen' ? 'you' : ''}" data-k="character/${x.id}"><small>${x.id === 'the-citizen' ? 'The hero · you' : esc(x.front.role || '')}</small><b>${esc(name(x))}</b><span>${esc(gist(x.body))}</span></button>`).join('')}</div>
      <p class="csub">The four tracks, in the order they open</p>
      <ol class="tracks">${['the-first-world', 'a-night-in-the-future', 'the-thousand', 'the-ground'].map((id) => b.arcs.find((a) => a.id === id)).filter(Boolean).map((x, i) => `<li><button data-k="arc/${x.id}"><i>${i + 1}</i><b>${esc(name(x))}</b><span>${esc(gist(x.body))}</span></button></li>`).join('')}</ol>
      ${next(5)}</section>

    <section class="ch" id="cp-read">${head(6, 'The library', 'Every document of the Compass. Filter, search, open.')}
      <div class="lib"><div class="libbar"><input type="search" id="cp-q" placeholder="Search the Compass…"><div class="kinds">${['All', ...new Set(Object.values(docs).map((d) => d.label))].map((k, i) => `<button data-kind="${k}" class="${i ? '' : 'on'}">${k}</button>`).join('')}</div></div>
        <div class="libgrid" id="cp-lib"></div></div></section>
  </div>`;

  // ---- the drawer
  const doc = document.getElementById('cxdoc'), shade = document.getElementById('cxshade');
  const shut = () => { doc.classList.remove('on'); shade.classList.remove('on'); };
  const open = (k) => {
    const x = docs[k]; if (!x) return;
    doc.innerHTML = `<header><div><small>${esc(x.label)}${x.front.type ? ' · ' + esc(x.front.type) : ''}</small><b>${esc(name(x))}</b></div><button aria-label="Close">×</button></header><div class="md">${marked.parse(x.kind === 'episode' ? (x.text || '') + '\n\n' + (x.outline || '') : x.body || '')}</div>`;
    doc.querySelector('header button').onclick = shut; doc.scrollTop = 0; doc.classList.add('on'); shade.classList.add('on');
  };
  shade.onclick = shut;
  const wire = (root) => root.querySelectorAll('[data-k]').forEach((c) => (c.onclick = () => open(c.dataset.k)));

  // ---- chapter 3's concepts, each with its picture
  const conceptBox = box.querySelector('#cp-concept');
  const drawConcept = (i) => {
    const c = CONCEPTS[i];
    box.querySelectorAll('.csteps button').forEach((x) => x.classList.toggle('on', +x.dataset.s === i));
    conceptBox.innerHTML = `<div class="ctext"><span class="cnum">${i + 1} / ${CONCEPTS.length}</span><h3>${c.t}</h3><p class="ctag">${c.s}</p>${c.body ? `<div class="md">${marked.parse(c.body)}</div>` : ''}
      <div class="cnav">${i ? `<button data-s="${i - 1}">← ${CONCEPTS[i - 1].t}</button>` : ''}${i + 1 < CONCEPTS.length ? `<button class="cgo" data-s="${i + 1}">${CONCEPTS[i + 1].t} →</button>` : ''}</div></div>
      <div class="cvis">${VIS[c.vis]()}</div>`;
    conceptBox.querySelectorAll('[data-s]').forEach((x) => (x.onclick = () => drawConcept(+x.dataset.s)));
    if (c.vis === 'hearts') hearts(conceptBox);
    wire(conceptBox);
  };
  const VIS = {
    start: () => `<div class="stack"><p class="vt">Your start, invested on day one</p>${startT.map((r) => { const v = num(r[0]); return `<div class="srow ${/€/.test(r[0]) ? 'eur' : 'hrt'}"><b>${esc(r[0])}</b><span><i style="width:${Math.min(100, (v / (/€/.test(r[0]) ? 10000 : 125000)) * 100)}%"></i></span><em>${inline(r[1])}</em></div>`; }).join('')}<p class="vn">€10,000 and 125,000 HEARTS, split across the city, your village and the city's coops, so your wealth is spread from the first day.</p></div>`,
    hearts: () => `<div class="hv"><p class="vt">Drag the days. Watch what holding does, and what investing does.</p><input type="range" min="0" max="365" value="90" id="hv-d"><div class="hvb"><div><small>Held, never invested</small><b id="hv-a"></b><span class="cbar"><i id="hv-ab"></i></span></div><div><small>24 a day invested in coops</small><b id="hv-b"></b><span class="cbar sun"><i id="hv-bb"></i></span></div></div><p class="vn" id="hv-n"></p></div>`,
    coops: () => `<div class="rings">${levelsT.map((r, i) => `<div class="ring r${i}"><b>${plain(r[0])}</b><span>${inline(r[2])}</span><em>${inline(r[3])}</em></div>`).join('')}</div>`,
    loop: () => `<svg class="loopsvg" viewBox="0 0 520 410" role="img" aria-label="The loop: citizens pay rent and food to the village coop; half of its turnover returns to its MINDS holders, who are the citizens">
      <path id="lp" d="M260 60 A140 140 0 1 1 259.9 60" fill="none" class="lpath"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<circle r="5" class="dot"><animateMotion dur="8s" begin="${-k}s" repeatCount="indefinite"><mpath href="#lp"/></animateMotion></circle>`).join('')}
      <g class="node you"><circle cx="260" cy="60" r="46"/><text x="260" y="57">You</text><text x="260" y="75" class="s">CITIZEN</text></g>
      <g class="node coop"><circle cx="381" cy="270" r="52"/><text x="381" y="267">Village</text><text x="381" y="285" class="s">COOP</text></g>
      <g class="node mind"><circle cx="139" cy="270" r="52"/><text x="139" y="267">MINDS</text><text x="139" y="285" class="s">HOLDERS</text></g>
      <text x="414" y="138" class="edge" text-anchor="start">rent &amp; food,</text><text x="414" y="155" class="edge" text-anchor="start">harvest sold</text>
      <text x="260" y="392" class="edge">50% of turnover, live</text>
      <text x="106" y="138" class="edge" text-anchor="end">paid out</text><text x="106" y="155" class="edge" text-anchor="end">to you</text>
    </svg><p class="vn">Everything in the city is paid in city HEARTS. The circle never stops: what you pay comes back to everyone who owns the coop, you included.</p>`,
    gate: () => `<div class="gatev"><div class="side in"><small>Inside the city</small><b>city HEARTS</b><span>every price, every wage, every rent</span></div>
      <div class="pool"><small>The gate</small><b>⇄</b><span>an automated market maker: the price moves with supply and demand</span><em>only coops pass</em></div>
      <div class="side out"><small>Outside</small><b>€</b><span>investors in · exports out · imports in</span></div></div>
      <p class="vn">The city coop keeps a small pool for every coop, about 10% of its MINDS, protocol-owned and one-way.</p>`,
    free: () => `<div class="freev"><div class="meter"><svg viewBox="0 0 200 120"><path d="M20 110 A80 80 0 0 1 180 110" class="mt"/><path d="M20 110 A80 80 0 0 1 180 110" class="mf" style="--p:.62"/></svg><b>payouts ÷ rent and food</b></div>
      <p class="vt">A citizen is <b>free</b> when their MINDS payouts cover their rent and food.</p><p class="vn">Before, they live from work proposals. After, from what they own. How many are free is the game's proof of a post-labour economy.</p></div>`,
  };
  const hearts = (root) => {
    const d = root.querySelector('#hv-d'), q = RULE.demurrage / 365;
    const draw = () => {
      const days = +d.value; let held = RULE.startHearts;
      for (let i = 0; i < days; i++) held = held * (1 - q) + RULE.perDay;
      const invested = RULE.perDay * days, top = RULE.startHearts * 1.02;
      root.querySelector('#hv-a').textContent = big(held) + ' ♥';
      root.querySelector('#hv-ab').style.width = Math.min(100, (held / top) * 100) + '%';
      root.querySelector('#hv-b').textContent = big(invested) + ' ♥ in MINDS';
      root.querySelector('#hv-bb').style.width = Math.min(100, (invested / (RULE.perDay * 365)) * 100) + '%';
      root.querySelector('#hv-n').innerHTML = `After <b>${days} days</b>: held HEARTS stay level, because 7% a year melts about as much as 24 a day adds. Invested, the same 24 a day become <b>${big(invested)} HEARTS of ownership</b>.`;
    };
    d.oninput = draw; draw();
  };
  box.querySelectorAll('.csteps button').forEach((x) => (x.onclick = () => drawConcept(+x.dataset.s)));
  drawConcept(0);

  // ---- chapter 4: a recipe, played with
  const cropBox = box.querySelector('#cp-crop');
  const state = { r: rec.findIndex((r) => /strawberr/i.test(r.name)), lvl: 1, clim: 70, seed: 0 };
  if (state.r < 0) state.r = 0;
  const drawCrop = () => {
    const r = rec[state.r]; if (!r) { cropBox.innerHTML = ''; return; }
    box.querySelectorAll('.crops button').forEach((x) => x.classList.toggle('on', +x.dataset.r === state.r));
    const t = r.grow * (1 - RULE.faster * (state.lvl - 1)), y = (Number.isFinite(r.yield) ? r.yield : 1) * (1 + RULE.more * (state.lvl - 1)) * (state.clim / 100) * (1 + RULE.seedStep * state.seed);
    const span = Math.max(t + (r.every || 1) * 4, 4), ticks = r.every ? Math.min(12, Math.floor((span - t) / r.every)) : 0;
    const fields = Object.entries(r.fields).filter(([k]) => !/^(recipe|family)$/.test(k));
    cropBox.innerHTML = `<div class="ctop"><small>${esc(r.tag || r.family)}</small><h3>${esc(r.name)}</h3><span class="kind">${esc(r.kind || '')}</span></div>
      <div class="tl"><div class="tlbar" style="--g:${(t / span) * 100}%"><span class="gr">growing</span>${Array.from({ length: ticks }, (_, k) => `<i style="left:${((t + r.every * (k + 1)) / span) * 100}%"></i>`).join('')}<b style="left:${(t / span) * 100}%">first harvest</b></div>
        <div class="tlax"><span>day 0</span><span>day ${fmt(span)}</span></div></div>
      <div class="kpis"><div><small>First harvest</small><b>${fmt(t)}<em> days</em></b></div><div><small>Then again every</small><b>${r.every ? fmt(r.every) : '—'}<em>${r.every ? ' days' : ''}</em></b></div><div><small>Yield a harvest</small><b>${fmt(y)}<em> portions</em></b></div></div>
      <div class="knobs">
        <label><span>Bed level <b>${state.lvl}</b><em>${RULE.levels[state.lvl - 1]} harvests</em></span><input type="range" min="1" max="5" value="${state.lvl}" data-n="lvl"></label>
        <label><span>Climate <b>${state.clim}%</b><em>steadier at every gate; 100% from the geothermal star</em></span><input type="range" min="55" max="100" value="${state.clim}" data-n="clim"></label>
        <label><span>Seed line <b>step ${state.seed}</b><em>saved from your best beds, +5% each</em></span><input type="range" min="0" max="5" value="${state.seed}" data-n="seed"></label>
      </div>
      <details><summary>Its whole recipe</summary><table>${fields.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${inline(v)}</td></tr>`).join('')}</table></details>`;
    cropBox.querySelectorAll('input[data-n]').forEach((x) => (x.oninput = () => { state[x.dataset.n] = +x.value; drawCrop(); }));
  };
  box.querySelectorAll('.crops button').forEach((x) => (x.onclick = () => { state.r = +x.dataset.r; drawCrop(); }));
  drawCrop();

  // ---- chapter 5: a gate
  const gateBox = box.querySelector('#cp-gate');
  const gauge = (label, v) => { const p = Math.max(0, Math.min(100, parseInt(v, 10) || 0)); return `<div class="gg"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="gt"/><circle cx="32" cy="32" r="26" class="gf" style="stroke-dasharray:${(p / 100) * 163.4} 200"/></svg><b>${esc(String(v).split(',')[0].split(';')[0])}</b><small>${label}</small></div>`; };
  const drawGate = (i) => {
    const r = steps[i + 1]; if (!r) return;
    box.querySelectorAll('.gates button').forEach((x) => x.classList.toggle('on', +x.dataset.g === i));
    const ph = PHASE[String(r[1]).trim()[0]] || '';
    gateBox.className = 'gate ' + ph;
    gateBox.innerHTML = `<div class="gl"><small>${esc(r[1])}</small><h3>${esc(r[0])} villagers</h3><p>${inline(r[2])}</p></div>
      <div class="gm"><div class="money"><div><small>This gate costs</small><b>${esc(r[3])}</b></div><div><small>New settlers bring</small><b class="in">${esc(r[4])}</b></div><div><small>Investment round</small><b class="rd">${esc(r[5])}</b><em>${esc(r[7])}</em></div><div><small>Spent so far</small><b>${esc(r[6])}</b></div></div>
      <div class="gauges">${gauge('food imported', r[8])}${gauge('energy imported', r[9])}</div></div>`;
  };
  box.querySelectorAll('.gates button').forEach((x) => (x.onclick = () => drawGate(+x.dataset.g)));
  drawGate(0);

  // ---- chapter 7: the library
  const libBox = box.querySelector('#cp-lib'), q = box.querySelector('#cp-q');
  let kind = 'All';
  const drawLib = () => {
    const s = q.value.trim().toLowerCase();
    const list = Object.entries(docs).filter(([, d]) => (kind === 'All' || d.label === kind) && (!s || (name(d) + ' ' + (d.body || '')).toLowerCase().includes(s)));
    libBox.innerHTML = list.map(([k, d]) => `<button data-k="${k}"><small>${esc(d.label)}</small><b>${esc(name(d))}</b><span>${esc(gist(d.body))}</span></button>`).join('') || '<p class="aside">Nothing found.</p>';
    wire(libBox);
  };
  q.oninput = drawLib;
  box.querySelectorAll('.kinds button').forEach((x) => (x.onclick = () => { kind = x.dataset.kind; box.querySelectorAll('.kinds button').forEach((y) => y.classList.toggle('on', y === x)); drawLib(); }));
  drawLib();

  // ---- wiring: links, the rail, the reveals
  wire(box);
  box.querySelectorAll('[data-go]').forEach((x) => (x.onclick = () => tab(x.dataset.go)));
  box.querySelectorAll('a[href^="#cp-"]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); box.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }); }));
  const rail = box.querySelectorAll('.rail a');
  const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) rail.forEach((a) => a.classList.toggle('on', a.dataset.c === e.target.id.slice(3))); }), { rootMargin: '-45% 0px -50% 0px' });
  box.querySelectorAll('section.ch').forEach((s) => seen.observe(s));
  const rev = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
  box.querySelectorAll('.reveal').forEach((x) => rev.observe(x));
}

// ---- the village ladder, every gate in one table (its own page, #ladder)
export function renderLadder(box, b, { tab }) {
  const game = b?.systems.find((x) => x.id === 'the-game');
  const part = game ? (game.body.split('### The village ladder')[1] || '').split('\n### ')[0] : '';
  if (!part) { box.innerHTML = '<p class="clede">No ladder in the game sheet yet.</p>'; return; }
  const [phases = [], steps = []] = tables(part);
  const eur = (t) => { const m = String(t).match(/([\d.]+)\s*([kM])/); return m ? +m[1] * (m[2] === 'M' ? 1e6 : 1e3) : 0; };
  const max = Math.max(...steps.slice(1).map((r) => eur(r[6])), 1);
  const bar = (t, c) => { const p = parseInt(t, 10); return `<span class="lb ${c}"><i style="width:${isNaN(p) ? 0 : p}%"></i></span><span class="pc">${esc(t)}</span>`; };
  box.innerHTML = `<div class="cp lx">
    <div class="topbar"><button class="cpill" data-go="compass">← The Compass</button><span>From the game sheet · ${steps.length - 1} gates</span></div>
    <p class="ceyebrow">The village ladder</p><h1>Every gate, in one table.</h1>
    <div class="phases">${phases.slice(1).map((r, i) => `<div class="cphase ${PHASE[i + 1]}"><small>${esc(r[1])} villagers</small><b>${esc(r[0])}</b><span>${esc(r[2])}</span><em>${esc(r[3])}</em></div>`).join('')}</div>
    <div class="tw"><table class="lad"><thead><tr><th>Villagers</th><th>Added at this gate</th><th>Costs</th><th>Settlers bring</th><th>Round</th><th>Spent so far</th><th>Funded by</th><th>Food import</th><th>Energy import</th></tr></thead>
    <tbody>${steps.slice(1).map((r) => `<tr class="${PHASE[String(r[1]).trim()[0]] || ''}"><td class="n"><b>${esc(r[0])}</b><small>${esc(r[1])}</small></td><td class="add">${inline(r[2])}</td><td class="e">${esc(r[3])}</td><td class="e in">${esc(r[4])}</td><td class="e rd">${esc(r[5])}</td>
      <td class="e"><span class="lb sum"><i style="width:${Math.max(2, Math.sqrt(eur(r[6]) / max) * 100)}%"></i></span><span class="pc">${esc(r[6])}</span></td><td>${esc(r[7])}</td><td>${bar(r[8], 'food')}</td><td>${bar(r[9], 'energy')}</td></tr>`).join('')}</tbody></table></div>
    <div class="md notes">${marked.parse(part.split('\n').filter((l) => l.startsWith('- ')).join('\n'))}</div></div>`;
  box.querySelector('[data-go]').onclick = () => tab('compass');
}
