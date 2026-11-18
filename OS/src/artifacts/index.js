// The artifact library (../../Artifacts): every outside source we learn from, as a filterable shelf. Filter by kind,
// shelf and tag, search the words, open one to read our summary and, on the machine that keeps it, the original.
// Read from /api/artifacts as the files stand; only `bun Artifacts/artifacts.js` changes them.
import { marked } from 'marked';
import './artifacts.css';

const TYPE = { youtube: 'YouTube', video: 'Video', podcast: 'Podcast', x: 'X post', social: 'Social post', blog: 'Blog', article: 'Article', website: 'Website', wiki: 'Wiki', paper: 'Paper', book: 'Book', repo: 'Repo', other: 'Other' };
const SOURCE = { transcript: 'The transcript', article: 'The article', paper: 'The paper', post: 'The post', page: 'The page', notes: 'The notes' };
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const label = (s) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const date = (d) => (d ? new Date(d + (d.length === 10 ? 'T12:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const count = (list, key) => list.reduce((m, a) => [].concat(a[key]).reduce((m2, k) => m2.set(k, (m2.get(k) || 0) + 1), m), new Map());
const thumbOf = (a) => (a.has?.thumb ? `/api/artifacts/${a.id}/thumb.jpg` : a.thumb?.url || '');

let state = { q: '', type: '', category: '', tags: [], open: null };

export function renderArtifacts(box, list) {
  const doc = document.getElementById('axdoc'), shade = document.getElementById('axshade');
  const hit = (a) => (!state.type || a.type === state.type) && (!state.category || a.category === state.category) && state.tags.every((t) => a.tags.includes(t))
    && (!state.q || [a.title, a.description, ...a.summary, a.author?.name, ...a.tags].join(' ').toLowerCase().includes(state.q.toLowerCase()));
  const chips = (key, map, names = label) => [...map].sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(y[0]))
    .map(([k, n]) => `<button class="axchip${(key === 'tags' ? state.tags.includes(k) : state[key] === k) ? ' on' : ''}" data-k="${key}" data-v="${esc(k)}">${esc(names(k))}<i>${n}</i></button>`).join('');

  const draw = () => {
    const shown = list.filter(hit), any = state.q || state.type || state.category || state.tags.length;
    box.innerHTML = `<div class="ax">
      <p class="axeyebrow">Maia City · the library</p>
      <h1>Artifacts</h1>
      <p class="axlede">Everything from outside that we learn from: videos, posts, articles, papers. Each one with our own summary, its tags, and, on the machine that keeps it, the original word for word.</p>
      <div class="axsearch"><input id="axq" type="search" placeholder="Search titles, summaries, authors, tags" value="${esc(state.q)}" autocomplete="off"><span>${shown.length} of ${list.length}</span></div>
      <div class="axfilters">
        <div><small>Kind</small>${chips('type', count(list, 'type'), (k) => TYPE[k] || k)}</div>
        <div><small>Shelf</small>${chips('category', count(list, 'category'))}</div>
        <div class="tags"><small>Topics</small>${chips('tags', count(list, 'tags'))}</div>
        ${any ? '<button class="axclear" id="axclear">Clear filters</button>' : ''}
      </div>
      <div class="axgrid">${shown.map((a) => `<button class="axcard" data-id="${a.id}">
        <div class="axthumb">${thumbOf(a) ? `<img loading="lazy" src="${esc(thumbOf(a))}" data-fallback="${esc(a.thumb?.url || '')}" alt="">` : `<span class="axnone">${esc(TYPE[a.type] || a.type)}</span>`}<em>${esc(TYPE[a.type] || a.type)}${a.length ? ' · ' + esc(a.length) : ''}</em></div>
        <div class="axbody"><small>${esc(label(a.category))}</small><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p>
        <footer><span>${esc(a.author?.name || '')}${a.published ? ' · ' + date(a.published) : ''}</span><span class="axtags">${a.tags.slice(0, 4).map((t) => esc(label(t))).join(' · ')}</span></footer></div>
      </button>`).join('') || '<p class="axempty">Nothing matches. Clear a filter.</p>'}</div>
      <p class="axfoot">Add one by pasting a link to avenMAIA (the artifacts skill), or with <code>bun Artifacts/artifacts.js new &lt;url&gt;</code>.</p>
    </div>`;
    box.querySelectorAll('img[data-fallback]').forEach((i) => (i.onerror = () => { if (i.dataset.fallback && i.src !== i.dataset.fallback) i.src = i.dataset.fallback; else i.remove(); }));
    const q = box.querySelector('#axq');
    q.oninput = () => { state.q = q.value; const at = q.selectionStart; draw(); const n = box.querySelector('#axq'); n.focus(); n.setSelectionRange(at, at); };
    box.querySelectorAll('.axchip').forEach((c) => (c.onclick = () => { const { k, v } = c.dataset; if (k === 'tags') state.tags = state.tags.includes(v) ? state.tags.filter((t) => t !== v) : [...state.tags, v]; else state[k] = state[k] === v ? '' : v; draw(); }));
    box.querySelector('#axclear')?.addEventListener('click', () => { state = { ...state, q: '', type: '', category: '', tags: [] }; draw(); });
    box.querySelectorAll('.axcard').forEach((c) => (c.onclick = () => open(c.dataset.id)));
  };

  const close = () => { state.open = null; doc.classList.remove('on'); shade.classList.remove('on'); };
  async function open(id) {
    const a = list.find((x) => x.id === id); if (!a) return;
    state.open = id;
    const src = a.source || {};
    doc.innerHTML = `<header><div><small>${esc(TYPE[a.type] || a.type)} · ${esc(label(a.category))}</small><b>${esc(a.title)}</b></div><button aria-label="Close" id="axshut">×</button></header>
      ${thumbOf(a) ? `<a class="axhero" href="${esc(a.src)}" target="_blank" rel="noopener"><img src="${esc(thumbOf(a))}" data-fallback="${esc(a.thumb?.url || '')}" alt=""><span>Open ${a.type === 'youtube' || a.type === 'video' ? 'the video' : 'the link'} ↗</span></a>` : ''}
      <p class="axmeta">${[a.author?.url ? `<a href="${esc(a.author.url)}" target="_blank" rel="noopener">${esc(a.author.name)}</a>` : esc(a.author?.name || ''), date(a.published), esc(a.length || ''), `${a.origin === 'agent' ? 'Sourced by avenMAIA' : 'Added by ' + esc(a.addedBy || 'a human')}, ${date(a.added)}`].filter(Boolean).join(' · ')}</p>
      <p class="axlink"><a href="${esc(a.src)}" target="_blank" rel="noopener">${esc(a.src)}</a></p>
      <h4>In short</h4><p class="axdesc">${esc(a.description)}</p>
      <h4>Summary</h4><div class="md">${a.summary.map((p) => marked.parse(p)).join('')}</div>
      <h4>Topics</h4><p class="axdtags">${a.tags.map((t) => `<button data-tag="${esc(t)}">${esc(label(t))}</button>`).join('')}</p>
      ${a.usedIn?.length ? `<h4>Used in</h4><ul class="axused">${a.usedIn.map((u) => `<li><code>${esc(u)}</code></li>`).join('')}</ul>` : ''}
      ${src.kind && src.kind !== 'none' ? `<details class="axsrc"><summary>${esc(SOURCE[src.kind] || 'The original')}${src.words ? ` · ${src.words.toLocaleString('en-US')} words` : ''}${src.how ? ` · ${esc(src.how)}` : ''}</summary><div class="axorig">Loading…</div></details>` : ''}`;
    doc.classList.add('on'); shade.classList.add('on'); doc.scrollTop = 0;
    doc.querySelectorAll('img[data-fallback]').forEach((i) => (i.onerror = () => { if (i.dataset.fallback && i.src !== i.dataset.fallback) i.src = i.dataset.fallback; else i.closest('.axhero')?.remove(); }));
    doc.querySelector('#axshut').onclick = close;
    doc.querySelectorAll('[data-tag]').forEach((b) => (b.onclick = () => { if (!state.tags.includes(b.dataset.tag)) state.tags = [...state.tags, b.dataset.tag]; close(); draw(); }));
    const det = doc.querySelector('.axsrc');
    det?.addEventListener('toggle', async () => {
      if (!det.open || det.dataset.loaded) return;
      det.dataset.loaded = '1';
      const box2 = det.querySelector('.axorig');
      const t = await fetch(`/api/artifacts/${a.id}/source.md`).then((r) => (r.ok && !(r.headers.get('content-type') || '').includes('html') ? r.text() : null)).catch(() => null);
      box2.innerHTML = t ? marked.parse(t) : '<p class="axnote">The original is kept only on the machine that added it (the authors’ work stays out of the public repository).</p>';
    });
  }
  shade.onclick = close;
  draw();
  if (state.open) open(state.open);
}
