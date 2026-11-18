// What the start waits for, watched (intent 0038). A part of the start that fails, or never answers, held the veil over
// the page for good and said nothing: on 2026-11-18 Samuel's Safari, with an ad blocker on, sat on "Raising the land"
// with no error at all. So whatever the start waits for goes through here, by its name: the stages' own steps
// (src/boot.js) and, below them, every question put to a worker (src/core/workers.js asking). What fails is said on the
// veil at once; a worker that has not started 20 s after it was first asked (its file stopped on its way, or something
// else served in its place) is said with what may be stopping it; each with a button that reloads (brand/loading.js
// shows them: os:stuck). What the page cannot go on without is os:lost, the same line: a file of its build gone, a worker
// that could not start (workers.js), the GPU taken from it (gpuLost). Once the veil is gone, what is slow or fails is the
// game's own business (its console), and only os:lost brings the veil back.

/** What may stop a file or a worker of the game on its way, and what a player can do about it. */
const BLOCKED = 'An ad or content blocker may be stopping it: allow this site, then reload.';

const out = new Map();   // a name -> { n: its waits out, since: when the first of them was asked, hint }
const heard = new Set();   // the names that have answered (a worker that started: it is not stopped on its way)
let looking = null, said = '', failed = false;
const veiled = () => { const c = globalThis.document?.documentElement.classList; return !!c && c.contains('os-loading') && !c.contains('os-loaded'); };
const tell = (type, detail) => globalThis.dispatchEvent?.(new CustomEvent(type, { detail }));
const stuck = (d) => { const s = d ? `${d.what} ${d.why ?? ''}` : ''; if (s !== said) { said = s; tell('os:stuck', d); } };
const again = () => { if (!looking) { looking = setTimeout(look, 1000); looking.unref?.(); } };   // (a tool's run, in bun, does not wait for it)

// (once a second while anything is out: what may be stopped on its way and has not answered since it was first asked,
// 20 s ago, said while the veil is up; a worker starts in a moment, and the stage waits as long for its first subject,
// src/boot.js. A part that fails is said instead, and stays said: the start does not come then)
function look() {
  looking = null;
  const now = performance.now(), late = [...out].filter(([what, e]) => e.hint && !heard.has(what) && now - e.since > 20000).map(([what]) => what);
  if (veiled() && !failed) stuck(late.length ? { what: `Still waiting for ${late.join(', ')}`, hint: out.get(late[0]).hint } : null);
  if (out.size) again();
}

/** `p`, a promise of `what` (a stage of the start, a worker's answer), watched (above): a promise of what it gives.
    hint: what may be stopping it on its way (null: the page's own work, the GPU's: said only if it fails). */
export function waitsOn(what, p, hint = BLOCKED) {
  let e = out.get(what);
  if (!e) out.set(what, (e = { n: 0, since: performance.now(), hint }));
  e.n++;
  const back = () => { if (!--e.n && out.get(what) === e) out.delete(what); };
  p.then(() => { heard.add(what); back(); }, (err) => {
    back();
    if (!veiled()) return;
    console.warn(`[the start] ${what} failed:`, err);
    failed = true; stuck({ what: `${what} failed`, why: err?.message ?? String(err), hint: hint ?? 'Reload to try again.' });
  });
  again();
  return p;
}
/** `what` answered (a worker said it has started): not stopped on its way. */
export const answered = (what) => void heard.add(what);

/** The GPU taken from the page (three's onDeviceLost: WebGPU's device lost, WebGL's context): it cannot go on, so the veil
    comes back and says so, with the reason the browser gave, and a button that reloads. */
export const gpuLost = ({ api, message, reason }) => tell('os:lost', {
  what: 'The browser took the GPU from the game', why: `${message || 'no reason given'}${reason && reason !== 'unknown' ? ` (${reason})` : ''}, ${api}`,
  hint: 'It does so when it runs short of memory: close other tabs, then reload.',
});
