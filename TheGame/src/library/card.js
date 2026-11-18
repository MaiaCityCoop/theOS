// The library's card (the right of library.html): its pieces, as brand.css sets them (.g-card): a header, figures, a
// label over each value, chips, the file's line.
import { recipes, manifest } from '../core/registry.js';

/** Every recipe of a kind from the registry, by its uid. */
export const byUid = (list) => Object.fromEntries(list.map((r) => [r.uid, r]));
const MATERIAL = byUid(recipes('material'));
const hex = (c) => '#' + c.map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0')).join('');
export const num = (v) => +(+v).toFixed(2), cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const head = (what, kind, name, about) => `<header><span class="g-label">${what} · ${kind}</span><h2 class="g-title big">${name}</h2><p class="g-text">${about || ''}</p></header>`;
export const fig = (v, unit, label) => `<div><b class="g-fig">${v}<i>${unit}</i></b><span class="g-label">${label}</span></div>`;
export const figs = (list, fit) => (list.length ? `<div class="g-figs g-part${fit ? ' fit' : ''}">${list.join('')}</div>` : '');
export const cell = (label, value, wide) => `<div class="g-cell${wide ? ' wide' : ''}"><span class="g-label">${label}</span>${value}</div>`;
export const say = (t) => `<span class="g-name">${t}</span>`;
/** A thing's variants (its moves, its layers, its face's expressions) as a row of pills, the chosen one's few words under them. */
export const pick = (label, attr, list, on) => `<div class="g-cell g-part"><span class="g-label">${label}</span><div class="g-pills">${list.map((x) => `<button class="g-btn${x.id === on ? ' on' : ' quiet'}" data-${attr}="${x.id}" title="${x.about}">${x.name}</button>`).join('')}</div><span class="g-sub">${list.find((x) => x.id === on)?.about ?? ''}</span></div>`;
/** A longer text kept closed until it is asked for (how a thing is made, its sources). */
export const more = (label, text) => `<details class="g-more g-part"><summary class="g-label">${label}</summary><p class="g-text">${text}</p></details>`;
export const chip = (m) => `<span class="g-chip"><i style="background:${hex(MATERIAL[m].swatch.map(Math.sqrt))}"></i>${MATERIAL[m].name}</span>`;
/** A recipe's file and its version (the BLAKE3 hash of what it is, registry.json), its first ten letters. */
export const fileOf = (r) => `<footer class="g-part"><span class="g-file">TheGame/${manifest[r.uid].file}</span><span class="g-file" title="${manifest[r.uid].version}">version ${manifest[r.uid].version.slice(0, 12)}</span></footer>`;
/** A size as a figure: one number in metres, or a range (in centimetres where it is all under a metre). */
export const sizeFig = (v, label) => (Array.isArray(v) ? (v[1] < 1 ? fig(`${num(v[0] * 100)}–${num(v[1] * 100)}`, 'cm', label) : fig(`${num(v[0])}–${num(v[1])}`, 'm', label)) : fig(num(v), 'm', label));
