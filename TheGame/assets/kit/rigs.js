// What moves in the stress stand (src/scatter/stress.js): stand-ins for the people, robots, animals, vehicles and
// flying things to come. A mover is a rig: up to PARTS parts, each a test asset (assets/kit/blob.js) of its own, set on
// the mover's body and moved as its rig says: legs and arms that swing, wheels that turn, wings that beat, a chain of
// segments that follows its head down its path. Nothing here is drawn or modelled: a rig is a table of numbers, read by
// the GPU for every part of every mover each frame, and by the CPU to know which kinds pass near.
//
//   a rig:  { share, speed: [lo, hi] m/s, size: [lo, hi] m, ring (it keeps to its plot's ring roads), fly: [lo, hi] m
//             above the ground, parts: [...] }
//   a part: { at: [forward, up, sideways] (of the mover's size, from its foot), size (of the mover's), stretch (longer
//             than wide: over 1; a flat disc: under 1), pivot (where it is held, up its own height: 0 its foot, 1 its
//             top), lie: [pitch, roll] it is laid at, move: what it does:
//               ['swing', how far (rad), phase]      a leg, an arm: back and forth about its pivot, in step
//               ['spin', turns a stride]             a wheel: round its axle
//               ['flap', how far (rad), how fast, phase]         a wing: up and down about the body's length
//               ['chain', how far behind (of the mover's size), how far it waves sideways, phase]   a tail, a snake:
//                                                    where the head was that far back along its path }
export const PARTS = 12;

const leg = (f, l, ph, size = 0.42, swing = 0.6) => ({ at: [f, 0.45, l], size, stretch: 3, pivot: 1, move: ['swing', swing, ph] });
const wheel = (f, l, size = 0.34) => ({ at: [f, size * 0.5, l], size, stretch: 0.35, pivot: 0.5, lie: [0, Math.PI / 2], move: ['spin', 1] });
const link = (back, size, wave = 0.12, ph = 0) => ({ at: [0, size * 0.5, 0], size, pivot: 0.5, move: ['chain', back, wave, ph] });
const PI = Math.PI;

export const RIGS = [
  { name: 'walker', share: 30, speed: [0.8, 1.8], size: [1.5, 1.9], parts: [   // on two legs, arms swinging against them
    { at: [0, 0.42, 0], size: 0.5, stretch: 1.5 }, { at: [0, 0.86, 0], size: 0.24 },
    leg(0, 0.1, 0), leg(0, -0.1, PI), { at: [0, 0.84, 0.2], size: 0.36, stretch: 3, pivot: 1, move: ['swing', 0.5, PI] }, { at: [0, 0.84, -0.2], size: 0.36, stretch: 3, pivot: 1, move: ['swing', 0.5, 0] }] },
  { name: 'runner', share: 8, speed: [2.5, 5], size: [1, 2.4], parts: [   // a robot on two long legs
    { at: [0, 0.5, 0], size: 0.45 }, leg(0, 0.14, 0, 0.55, 0.9), leg(0, -0.14, PI, 0.55, 0.9), { at: [0.1, 0.9, 0], size: 0.2, stretch: 2.5, move: ['swing', 0.3, 0] }] },
  { name: 'four legs', share: 12, speed: [0.4, 6.4], size: [0.5, 1.7], parts: [   // an animal: a body lying along its way, a head, a tail
    { at: [0, 0.5, 0], size: 0.85, stretch: 1.8, pivot: 0.5, lie: [-PI / 2, 0] }, { at: [0.5, 0.62, 0], size: 0.3 },
    leg(0.3, 0.14, 0, 0.45, 0.5), leg(0.3, -0.14, PI, 0.45, 0.5), leg(-0.3, 0.14, PI, 0.45, 0.5), leg(-0.3, -0.14, 0, 0.45, 0.5),
    { at: [-0.45, 0.55, 0], size: 0.4, stretch: 3, pivot: 0, lie: [2.2, 0], move: ['swing', 0.25, 0] }] },
  { name: 'ten legs', share: 6, speed: [0.5, 3], size: [0.8, 2.2], parts: [   // a long body on five pairs, each a step behind the last
    { at: [0, 0.4, 0], size: 1, stretch: 2.2, pivot: 0.5, lie: [-PI / 2, 0] }, { at: [0.55, 0.45, 0], size: 0.28 },
    ...[0.4, 0.2, 0, -0.2, -0.4].flatMap((f, n) => [leg(f, 0.16, n * 1.2, 0.36, 0.5), leg(f, -0.16, n * 1.2 + PI, 0.36, 0.5)])] },
  { name: 'rover', share: 10, speed: [2, 6], size: [0.8, 2], parts: [   // a robot on four wheels, an arm on top
    { at: [0, 0.3, 0], size: 0.75, stretch: 0.6, pivot: 0.5 }, wheel(0.3, 0.3), wheel(0.3, -0.3), wheel(-0.3, 0.3), wheel(-0.3, -0.3),
    { at: [0.1, 0.5, 0], size: 0.5, stretch: 3, pivot: 0, move: ['swing', 0.4, 0] }] },
  { name: 'transport', share: 9, ring: true, speed: [8, 20], size: [3, 6], parts: [   // a long body on six wheels, a cab
    { at: [0, 0.3, 0], size: 1, stretch: 2, pivot: 0.5, lie: [-PI / 2, 0] }, { at: [0.36, 0.42, 0], size: 0.34 },
    wheel(0.36, 0.2, 0.22), wheel(0.36, -0.2, 0.22), wheel(0, 0.2, 0.22), wheel(0, -0.2, 0.22), wheel(-0.36, 0.2, 0.22), wheel(-0.36, -0.2, 0.22)] },
  { name: 'cycle', share: 5, ring: true, speed: [4, 9], size: [1.4, 2], parts: [   // two wheels in line, a rider
    wheel(0.32, 0, 0.42), wheel(-0.32, 0, 0.42), { at: [0, 0.4, 0], size: 0.6, stretch: 1.6, pivot: 0.5, lie: [-PI / 2, 0] }, { at: [0, 0.55, 0], size: 0.45, stretch: 1.5 }] },
  { name: 'dragon', share: 6, speed: [8, 16], size: [3, 6], fly: [10, 45], parts: [   // a flying thing: wings beating, a tail of links behind it
    { at: [0, 0, 0], size: 0.7, stretch: 1.8, pivot: 0.5, lie: [-PI / 2, 0] }, { at: [0.48, 0.05, 0], size: 0.26 },
    { at: [0, 0.02, 0.08], size: 0.9, stretch: 1.8, pivot: 0, lie: [0, PI / 2 - 0.2], move: ['flap', 0.7, 0.25, 0] }, { at: [0, 0.02, -0.08], size: 0.9, stretch: 1.8, pivot: 0, lie: [0, -PI / 2 + 0.2], move: ['flap', -0.7, 0.25, 0] },
    link(0.4, 0.3, 0.08, 0.6), link(0.62, 0.24, 0.12, 1.2), link(0.82, 0.18, 0.16, 1.8), link(1, 0.13, 0.2, 2.4)] },
  { name: 'bird', share: 7, speed: [5, 14], size: [0.4, 1.2], fly: [4, 30], parts: [
    { at: [0, 0, 0], size: 0.6, stretch: 1.5, pivot: 0.5, lie: [-PI / 2, 0] },
    { at: [0, 0, 0.06], size: 0.9, stretch: 1.8, pivot: 0, lie: [0, PI / 2 - 0.2], move: ['flap', 0.9, 0.6, 0] }, { at: [0, 0, -0.06], size: 0.9, stretch: 1.8, pivot: 0, lie: [0, -PI / 2 + 0.2], move: ['flap', -0.9, 0.6, 0] }] },
  { name: 'snake', share: 7, speed: [0.5, 3], size: [1.5, 5], parts: [   // a head and ten links, each where the head was a moment ago
    { at: [0, 0.07, 0], size: 0.16, pivot: 0.5 }, ...Array.from({ length: 10 }, (_, n) => link(0.1 * (n + 1), 0.14 - n * 0.008, 0.05, n * 0.7))] },
];

const MOVES = { swing: 1, spin: 2, flap: 3, chain: 4 };
/** How many numbers a rig is (rows of four): two for the rig, three for each of its PARTS parts. */
export const RIG_ROWS = 2 + PARTS * 3;
/** Every rig as numbers, for the GPU: [speed lo, hi, size lo, hi], [ring, fly lo, fly hi, parts]; then a part:
    [forward, up, sideways, size], [stretch, pivot, move, a], [b, c, pitch, roll] (a, b, c: its move's own numbers). */
export function rigRows() {
  const out = new Float32Array(RIGS.length * RIG_ROWS * 4);
  RIGS.forEach((R, r) => {
    const o = r * RIG_ROWS * 4; out.set([...R.speed, ...R.size, R.ring ? 1 : 0, ...(R.fly ?? [0, 0]), R.parts.length], o);
    R.parts.forEach((P, n) => { const m = P.move ?? []; out.set([...P.at, P.size, P.stretch ?? 1, P.pivot ?? 0, MOVES[m[0]] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 0, ...(P.lie ?? [0, 0])], o + 8 + n * 12); });
  });
  return out;
}
/** Where the rigs' shares end, 0 … 1: a number under shares[r] and not under shares[r - 1] is rig r. */
export const rigShares = () => { const total = RIGS.reduce((t, R) => t + R.share, 0); let at = 0; return RIGS.map((R) => (at += R.share / total)); };
