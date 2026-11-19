// The tiers' stores, sized by what their packings find, checked on the CPU (intent 0038): `bun tools/storecheck.js`. No
// GPU. A tier's store (src/scatter/tier.js) is read back after its packings, two or three frames behind them, and laid
// out again where a read found more than it holds, or BAND times less; the world is not complete till a read of a
// packing at its layout now fits (storeOf, src/core/settle.js). 2026-11-19: on main, a store was wrong at every
// packing and right again only on a read with no packing since, so a tier packed every frame never rested; an
// own-patch tier grew whenever what it found passed the room a MARGIN under it, not the room itself, and every growth
// of one of a family laid out and packed again all of them; and a resident store read while it filled (its regions
// visited over frames) was made smaller for it, filled anew, read so again, and never complete. Three sequences, each
// a packing every frame and every read coming back two frames late, then three, in turn:
//   own       one own-patch tier, not a mover: the real ownOf, packed every frame while the camera moves, what it
//             finds swinging by a sixth either way and doubling halfway (a denser place); then still. Exit 1 where it
//             is wrong past a read of its last layout while it packs, never at rest, or laid out again for no more found
//             than it held
//   family    three of them laid out as one (src/scatter/tier.js familyOf: one's growth lays out all, each told so,
//             relaid): the same, the first doubling halfway
//   resident  a resident tier's store as residentOf runs it, by the rules it runs on (storeOf, roomsFor): its kind
//             laid out where a read asks, its store emptied then, its regions' cells visited at the frame's pace as
//             tier.js paces them (src/core/pace.js: a workgroup's at first, at most twice as many a frame, as many as
//             fit geometry's share of a frame at what a cell costs the GPU: a piece at a time, nearest first, since
//             2026-11-19, where a fill had been one packing), a packing whole only where nothing waits (waits.size 0), a
//             read asked where it is wrong or a packing is unread (one at a time, of its last packing); the camera
//             jumping every so often (every region new: its store filled anew at the same layout), what it finds there
//             other, and the camera still. Exit 1 where it is filled and not known to fit past a read or two of each
//             place, laid out more than once a place, laid out again for no more found than it held, or its regions
//             wait past a fill a place and one a layout
import './glob.js';

const { ownOf, storeOf, roomsFor, holdOf } = await import('../src/scatter/tier.js');
const { WG, MARGIN } = await import('../src/scatter/regions.js');
const { pace } = await import('../src/core/pace.js');
const { FRAME_MS_BY_CLASS } = await import('../src/core/budget.js');
const { waiting } = await import('../src/core/settle.js');

let failed = 0;
const fail = (m) => { failed++; console.log(`  FAIL ${m}`); };
const roomFor = (n) => Math.max(WG, Math.ceil((n * MARGIN) / WG) * WG);   // (as tier.js lays a room out: a MARGIN more, in whole workgroups)
// (a renderer whose reads come back late: two frames, then three, in turn; what it reads is what the GPU holds when it
// is asked, the count of the last packing handed to it)
const lagging = () => {
  const due = []; let frame = 0, k = 0;
  return {
    renderer: (count) => ({ getArrayBufferAsync: () => new Promise((res) => due.push({ at: frame + 2 + (k++ % 2), res, data: Uint32Array.from(count()).buffer })) }),
    async next() { frame++; for (const d of due.filter((x) => x.at <= frame)) { due.splice(due.indexOf(d), 1); d.res(d.data); } await new Promise((r) => setImmediate(r)); },
  };
};
const swing = (f, mean) => Math.round(mean * (1 + Math.sin(f / 7) / 6));   // (as the camera moves: a sixth either way)
// (what a store's rows say to settle, as settle reads them: src/core/settle.js waiting)
const said = (name) => Object.entries(waiting()).filter(([k]) => k.startsWith(`tiers: a store made again (${name}`)).reduce((n, [, v]) => n + v, 0);

/** Own-patch tiers laid out as one (n of them: a family, or one alone), each packed every frame for `moving` frames,
    then still for `still`; the first's mean doubling at `jump`. -> { wrong: frames any was not known to fit while they
    packed, stuck: of them, past a read of the last layout, rest: the frame they came to rest from, laid: the layouts,
    past: of them, a growth for no more found than held }. */
async function own(n, { moving, still, jump, mean }, name) {
  const L = lagging(), rows = [], found = new Array(n).fill(0), out = { wrong: 0, stuck: 0, rest: null, laid: 0, past: 0 };
  for (let i = 0; i < n; i++) {
    const caps = [WG * 32], T = { asset: `${name} ${i}`, slots: 2, culler: null, count: { value: null } };
    rows.push({ R: L.renderer(() => [found[i]]), row: ownOf(T, caps, (N) => { out.laid++; if (N[0] > caps[0] && N[0] <= roomFor(caps[0])) out.past++; N.forEach((x, k) => (caps[k] = x)); for (const r of rows) r.row.relaid(); }) });   // (a family's layout: every one of it laid out again)
  }
  let lastLay = 0;
  for (let f = 1; f <= moving + still; f++) {
    const laid = out.laid;
    await L.next();   // (the reads due come back: a layout is made there)
    for (let i = 0; i < n; i++) {
      if (f <= moving) { found[i] = swing(f + i * 11, mean * (i === 0 && f > jump ? 2 : 1)); rows[i].row.packed(); }
      rows[i].row.ask(rows[i].R);
    }
    if (out.laid !== laid) lastLay = f;
    const w = said(name) > 0, late = f > lastLay + 4;   // (a read of a packing at its last layout is back within four frames)
    if (f <= moving) { out.wrong += w ? 1 : 0; if (w && late) out.stuck++; }
    if (w) { if (late) out.rest = null; } else if (out.rest == null) out.rest = f;
  }
  return out;
}

/** A resident tier's store as residentOf runs it (one tier its kind's: its kind laid out as soon as its read has
    answered), its regions' `cells` visited at the frame's pace (tier.js CELLS: pace, measured against geometry's share
    of a frame), a cell costing the GPU what visits all of them over `per` frames at rest; the camera jumping every
    `visit` frames to a place where it finds `means[j]` (in turn); what its draws show kept while it fills anew (holdOf:
    its kind laid out again, a jump), gathered into what they read once the fill is through (swapIn). -> { laid, past
    (layouts for no more found than held), waiting (frames a region waited), wrong (frames filled and not known to fit),
    least (the least room it was laid out at), short (frames, once a whole picture was shown, its draws showed part of
    one or none) }. */
async function resident(per, { frames, visit, means, first, cells }) {
  const L = lagging(), C = pace(WG), budget = FRAME_MS_BY_CLASS.geometry, cost = (budget * per) / cells;   // (cost: ms a cell)
  let N = first, P = first, sealed = 0, dirty = true, epoch = 0, seen = -1, done = 0, packs = 0, asked = 0, asking = false, mean = means[0], swap = false, drawn = null, shown = false;
  const S = storeOf(() => dirty), H = holdOf(), last = { at: -1, whole: false }, out = { laid: 0, past: 0, waiting: 0, wrong: 0, least: Infinity, short: 0 }, FILL = 'its regions';
  const fillAnew = () => { done = 0; H.emptied(); H.waiting([FILL]); };   // (its store emptied, every region waiting: residentOf empty, then its update)
  const gather = () => { drawn = { n: sealed, whole: done >= cells }; H.gathered(1); };   // (what its draws read: its store's things now)
  // (a read come back: laid out again where roomsFor says, else it fits)
  const answer = (z, read) => {
    const room = roomsFor([z[1], z[2]], [N, P], read.whole && read.at === S.at());
    if (room && (room[0] !== N || room[1] !== P)) { if (room[0] > N && !(z[1] > N) && !(z[2] > P)) out.past++; N = room[0]; P = room[1]; out.least = Math.min(out.least, N); dirty = true; return; }
    S.fit(read.at);
  };
  // (its visits, the nearest first, within the frame's cells; a packing whole where nothing waits after it; gathered
  // where what is drawn is not kept)
  const fill = () => {
    const n = Math.min(Math.max(WG, C.left), cells - done); done += n; C.left -= n; C.measured(n, n * cost, budget);
    if (done >= cells) H.done(FILL);
    sealed = Math.round((mean * done) / cells); packs++; last.at = S.at(); last.whole = done >= cells; out.waiting++;
    if (!H.holds(swap)) gather();
  };
  const R = L.renderer(() => [Math.min(sealed, N), sealed, sealed]);   // (held, found, packed for its draws: as its last packing sealed them, what the GPU holds till the next)
  for (let f = 1; f <= frames; f++) {
    await L.next(); C.tick();
    if (dirty && !asking) { dirty = false; epoch++; out.laid++; swap = epoch > 1; }   // (ready: its kind laid out, every tier of it having answered; what is drawn kept where it was laid out before: relayout)
    if (seen !== epoch) { seen = epoch; fillAnew(); S.made(); }   // (its run: its kind laid out again, what it held is gone)
    if (f > 1 && f % visit === 1) { fillAnew(); mean = means[Math.floor(f / visit) % means.length]; }   // (a jump: every region new, at the same layout)
    if (!asking && (S.wrong() || packs !== asked)) { asking = true; asked = packs; const read = { ...last }; R.getArrayBufferAsync().then((b) => answer(new Uint32Array(b), read)).finally(() => { asking = false; }); }
    if (done < cells) fill(); else if (S.wrong()) out.wrong++;
    if (swap && !H.holds(false)) { swap = false; gather(); }   // (swapIn: every tier of its kind through its fill anew)
    const whole = !!(drawn?.whole && drawn.n);
    if (shown && !whole) out.short++;   // (a whole picture shown before, part of one or none now)
    shown ||= whole;
  }
  return out;
}

/** The sequences, each said and failed on where it breaks: the own-patch tiers, and a resident store over fills of a
    frame to sixteen, the camera jumping and still (2026-11-19, live on next: where Samuel stood, the world's plants
    popped in and out over and over). */
async function check() {
  const OWN = { moving: 600, still: 100, jump: 300, mean: 5000 }, MOVED = { frames: 600, visit: 120, means: [90000, 120000, 70000, 100000], first: 2 ** 17, cells: 2 ** 21 };
  console.log("the tiers' stores, read back two and three frames behind their packings (src/scatter/tier.js storeOf, roomsFor):");
  for (const [n, name] of [[1, 'own'], [3, 'family']]) {
    const o = await own(n, OWN, `check: ${name}`);
    console.log(`  ${name.padEnd(8)} ${n} tier${n > 1 ? 's' : ' '}, packed every frame for ${OWN.moving}: not known to fit ${o.wrong} of them (${o.stuck} past a read of its last layout), at rest from frame ${o.rest ?? 'never'}; laid out ${o.laid} times (${o.past} for no more found than held)`);
    if (o.stuck) fail(`${name}: not known to fit ${o.stuck} frames past a read of its last layout, while it packed`);
    if (o.past) fail(`${name}: laid out ${o.past} times for no more found than it held`);
    if (o.rest == null) fail(`${name}: never at rest`);
  }
  for (const [how, R] of [['the camera jumping', MOVED], ['the camera still', { ...MOVED, visit: Infinity }]]) {
    const places = Number.isFinite(R.visit) ? Math.ceil(R.frames / R.visit) : 1;
    for (const per of [1, 3, 8, 16]) {
      const r = await resident(per, R);
      console.log(`  resident, ${how}, filled at rest over ${String(per).padStart(2)} frame${per > 1 ? 's' : ' '}: laid out ${r.laid} times (${r.past} for no more found than held), its regions waiting ${r.waiting} of ${R.frames} frames, filled and not known to fit ${r.wrong}, drawn short ${r.short}, laid out at ${r.least === Infinity ? 'its first room only' : `${r.least} at the least`}`);
      if (r.past) fail(`resident over ${per}, ${how}: laid out ${r.past} times for no more found than it held`);
      if (r.short) fail(`resident over ${per}, ${how}: ${r.short} frames its draws showed part of what they had shown, or none`);
      if (r.wrong > 4 * places) fail(`resident over ${per}, ${how}: filled and not known to fit ${r.wrong} frames`);
      if (r.laid > places) fail(`resident over ${per}, ${how}: laid out ${r.laid} times, at ${places} place${places > 1 ? 's' : ''}`);
      const rest = Math.floor(R.cells / per), fill = Math.ceil(R.cells / rest), ramp = Math.ceil(Math.log2(rest / WG)) + 1;   // (a fill at the pace's rest, frames; and its first, from a workgroup's cells a frame, twice as many a frame)
      if (r.waiting > (places + r.laid - 1) * fill + ramp) fail(`resident over ${per}, ${how}: its regions waited ${r.waiting} frames, past a fill a place and one a layout`);   // (a layout empties it: filled anew)
    }
  }
}
await check();
console.log(failed ? `storecheck: ${failed} failed` : 'storecheck: every store at rest once read, laid out only where it found more than it held or BAND times less');
process.exit(failed ? 1 : 0);
