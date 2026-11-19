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

// (the device a phone: its adapter's largest buffer an iPhone's, so the budget its share, src/core/gpu.js shareOf)
const gpuM = await import('../src/core/gpu.js'), { PHONE_BUFFER } = await import('../src/core/budget.js');
globalThis.navigator = { ...(globalThis.navigator ?? {}), gpu: { requestAdapter: async () => ({ limits: { maxBufferSize: PHONE_BUFFER, maxStorageBufferBindingSize: PHONE_BUFFER / 2 }, info: {} }) } };
await gpuM.askedLimits();
const { ownOf, storeOf, roomsFor, holdOf, relayIn, atRest, tick } = await import('../src/scatter/tier.js');
const { restDial } = await import('../src/detail/measure.js');
const { BAND } = await import('../src/detail/error.js');
const { WG, MARGIN } = await import('../src/scatter/regions.js');
const { pace } = await import('../src/core/pace.js');
const { FRAME_MS, FRAME_MS_BY_CLASS } = await import('../src/core/budget.js');
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
    const caps = [WG * 32], T = { asset: `${name} ${i}`, storeName: `check: ${name} ${i}`, slots: 2, culler: null, count: { value: null } };
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

/** What moves (a herd: src/scatter/herds.js, through drawer.js tierAll moving), its rooms its bound (ownOf bound: the
    most of it at the dial at rest), packed every frame for `frames` while what it finds swings past its bound and under
    it (its things crossing a level's band as they walk), then the measure moved (reband: its bound halved). -> { laid:
    layouts while it walked, after: layouts once the measure moved, short: frames it found more than it holds, wrong:
    frames not known to fit past its first read } */
async function moving(frames, most) {
  const L = lagging(), caps = [most], out = { laid: 0, after: 0, short: 0, wrong: 0 }, T = { asset: 'check: moving', storeName: 'check: moving', slots: 2, culler: null, count: { value: null } };
  let found = 0, bound = most, walked = false;
  const row = ownOf(T, caps, (N) => { if (walked) out.after++; else out.laid++; caps[0] = N[0]; row.relaid(); }, undefined, () => [bound]), R = L.renderer(() => [found]);
  for (let f = 1; f <= frames + 20; f++) {
    await L.next();
    if (f === frames) { walked = true; bound = Math.ceil(most / 4); row.rebound(); }   // (the dial at rest twice as coarse: a quarter of it)
    found = Math.round(most * (1 + Math.sin(f / 5) / 2)); row.packed(); row.ask(R);
    out.short += T.short ? 1 : 0;
    if (f > 4 && f < frames && said('check: moving') > 0) out.wrong++;
  }
  return out;
}
/** The moving sequence, said and failed on where what moves is laid out by what it finds, or not once as the measure
    moves. */
async function movers() {
  const m = await moving(600, WG * 16);
  console.log(`  moving   1 tier , packed every frame for 600, finding up to half again its bound and down to half of it: laid out ${m.laid} times while it walked, short ${m.short} frames, not known to fit ${m.wrong}; laid out ${m.after} times once the measure moved`);
  if (m.laid) fail(`moving: laid out ${m.laid} times by what it found while it walked`);
  if (m.after !== 1) fail(`moving: laid out ${m.after} times once the measure moved, not once`);
  if (!m.short) fail('moving: never short, though it found more than its bound');
  if (m.wrong) fail(`moving: not known to fit ${m.wrong} frames while it walked`);
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

/** The resident tiers filling at once (a start, a jump), each packing holding the page's thread `cost` ms (what it
    hands three and the GPU; the CPU's stand-in hands nothing), `fills` packings each: as tier.js holds them, the frame's
    packings to `budget` ms of the page (PACKS: pace, measured; src/core/pace.js frameShare: the whole frame behind the
    veil, geometry's share once the first view shows), the tiers taking turns (src/scatter/index.js turn), or, as main,
    every tier that waits packing every frame. -> { most: the most page ms a frame, frames: till all are filled } */
function paged(tiers, cost, fills, held, budget) {
  const P = pace(1), left = new Array(tiers).fill(fills); let most = 0, frames = 0, turn = 0;
  while (left.some((n) => n > 0) && frames < 10000) {
    frames++; P.tick(); turn = (turn + 1) % tiers; let ms = 0;
    for (let i = 0; i < tiers; i++) {
      const k = (i + turn) % tiers; if (!left[k] || (held && P.left <= 0)) continue;
      left[k]--; ms += cost; if (held) { P.left--; P.measured(1, cost, budget); }
    }
    most = Math.max(most, ms);
  }
  return { most, frames };
}

/** The dial as memory's one knob on a phone (src/core/gpu.js byDial; budgetOf: its share of the Mac's budget), a class
    at a time: its stores (bases: what each needs at the dial's rest, MB; what lies within a reach goes as the reach's
    square, so base / d² at dial d), made one a frame as the world fills, each from a first room of a few workgroups,
    beside what of the class follows no dial (fixed, MB). Each frame every store made reads what it finds at the dial
    at rest then (reband) and asks for rooms as tier.js asks (roomsFor: band 1 where the dial at rest has risen since it
    was laid out), laid out again as tier.js lays it out (relayIn: its need said at once, byDial; at once where its
    class has room for it beside all it holds, else in its class's turn, tick), what it was held beside what it is for
    three frames (src/core/gpu.js retire: two frames, then the GPU's done). -> { rest, least (MB), total (MB, at the
    end), peak (MB: the most it held, the old beside the new), budget, smaller (stores made smaller), frames (till
    nothing is laid out or let go) } */
function knob(cls, bases, fixed) {
  const MB = 2 ** 20, each = 256, n = bases.length, first = WG * 32;   // (each: a thing's bytes; first: a store's first room, things)
  const rooms = [], rest = [], letting = [], out = { smaller: 0 }, name = (i) => `check: a store of ${cls} (${i})`;
  gpuM.more(`check: what of ${cls} follows no dial`, fixed * MB, 0, cls);
  const holding = () => (rooms.reduce((a, r) => a + r, 0) * each + letting.reduce((a, l) => a + l.bytes, 0)) / MB + fixed;
  let frame = 0, peak = 0, last = 0;
  const lay = (i, N) => {
    letting.push({ bytes: rooms[i] * each, until: frame + 3 }); gpuM.letting(cls, rooms[i] * each);   // (as src/core/gpu.js retire holds it)
    gpuM.more(name(i), (N - rooms[i]) * each, 0, cls); if (N < rooms[i]) out.smaller++;
    rooms[i] = N; rest[i] = restDial(); last = frame; peak = Math.max(peak, holding());
    return true;
  };
  for (; frame < 4000 && (rooms.length < n || letting.length || frame < last + 30); frame++) {
    tick();   // (each class's turn: tier.js rise)
    for (const l of letting.filter((x) => x.until <= frame)) { letting.splice(letting.indexOf(l), 1); gpuM.letting(cls, -l.bytes); }
    if (rooms.length < n) { gpuM.more(name(rooms.length), first * each, 0, cls); rooms.push(first); rest.push(restDial()); }
    rooms.forEach((r, i) => {
      const found = Math.round((bases[i] * MB) / each / restDial() ** 2), N = roomsFor([found], [r], true, rest[i] < restDial() ? 1 : BAND);
      if (!N || N[0] === r) return;
      const at = restDial(), bytes = N[0] * each;
      relayIn(cls, `${cls} ${i}`, bytes, r * each, () => gpuM.byDial(name(i), cls, bytes), () => lay(i, atRest(N, at)[0]), () => gpuM.retiring(cls) > 0);
    });
    peak = Math.max(peak, holding());
  }
  return { rest: restDial(), least: Math.min(...rooms) * each / MB, total: holding(), peak, budget: gpuM.budgetOf(cls), smaller: out.smaller, frames: last };
}

/** The sequences, each said and failed on where it breaks: the own-patch tiers, and a resident store over fills of a
    frame to sixteen, the camera jumping and still (2026-11-19, live on next: where Samuel stood, the world's plants
    popped in and out over and over). */
/** The knob's sequences, a class at a time, said and failed on where a store holds nothing, or its class is past its
    budget at the end or at the most. */
function knobs() {
  const share = gpuM.budgetShare();
  console.log(`the dial as memory's one knob, a phone's (share ${share}: src/core/gpu.js byDial, src/scatter/tier.js relayIn):`);
  if (share !== 0.375) fail(`the knob: the phone's share is ${share}, not 0.375`);
  for (const [cls, bases, fixed] of KNOB) {
    const K = knob(cls, bases, fixed), all = bases.reduce((a, b) => a + b, 0);
    console.log(`  ${cls}: ${bases.length} stores needing ${all} MB at the dial's rest beside ${fixed} MB that follows no dial, of its ${K.budget} MB: the dial at rest ${K.rest.toFixed(3)}, every store holding some (the least ${K.least.toFixed(2)} MB), ${K.smaller} made smaller, the class ${K.total.toFixed(1)} MB, at the most ${K.peak.toFixed(1)} MB (the old beside the new), still from frame ${K.frames}`);
    if (!(K.least > 0)) fail(`the knob, ${cls}: a store holds nothing`);
    if (K.total > K.budget * 1.000001) fail(`the knob, ${cls}: the class holds ${K.total.toFixed(1)} MB, past its ${K.budget} MB`);
    if (K.peak > K.budget * 1.000001) fail(`the knob, ${cls}: the class held ${K.peak.toFixed(1)} MB at the most, past its ${K.budget} MB`);
  }
  if (!(restDial() > 1)) fail('the knob: the dial at rest never rose');
}
// (a phone's stores of a class at the dial's rest, MB, more than it holds: geometry's the plants' levels and the rocks',
// ground's the meadow's rings, src/scatter/grass.js; beside what of it follows no dial, as the census holds it at an
// iPhone, `bun tools/census.js --buffer=1073741824 --window=390x844@3`, 2026-11-19: geometry 345.3 MB, ground 118.6 MB)
const KNOB = [['geometry', [96, 64, 48, 40, 32, 28, 24, 20, 16, 12, 8, 6, 4, 4, 2, 2], 345], ['ground', [120, 80], 119]];
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
  await movers();
  const RES_TIERS = 42;   // (the world's resident tiers: tools/smoke.js's scatter, 2026-11-19)
  for (const cost of [0.25, 2, 10]) {
    const main = paged(RES_TIERS, cost, 8, false), cells = [['behind the veil', FRAME_MS], ['shown', FRAME_MS_BY_CLASS.geometry]].map(([how, budget]) => {
      const r = paged(RES_TIERS, cost, 8, true, budget);
      if (r.most > budget + cost) fail(`the page ${how}: ${r.most} ms a frame, past its ${budget} ms and a packing`);
      return `${how} at most ${r.most.toFixed(1)} ms a frame, filled in ${r.frames} frames`;
    });
    console.log(`  the page: ${RES_TIERS} resident tiers filling, a packing ${cost} ms of it: ${cells.join('; ')} (every tier every frame: ${main.most.toFixed(1)} ms, ${main.frames} frames)`);
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
  knobs();   // (last: what the dial at rest rose to holds for every store made after)
}
await check();
console.log(failed ? `storecheck: ${failed} failed` : 'storecheck: every store at rest once read, laid out only where it found more than it held or BAND times less');
process.exit(failed ? 1 : 0);
