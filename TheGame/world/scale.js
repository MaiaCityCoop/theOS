// The world's one scale (intent 0035): what every size in Maia City is read against. Each thing's own measure lives in
// its own file, next to what it is (its recipe's `measure`: what a real one measures, and where that is known from);
// here only what they are all measured with: the units, the reference body, the walker who is you, the tolerances, and
// the rules a measure keeps. `bun tools/scale.js` reads every recipe's measure, holds it to these rules and to what the
// recipe really draws, and fails where they disagree or where a recipe has none. CI runs it.
//
// A measure (a recipe's `measure`), in metres:
//   real      what it is, in the world outside
//   typical   [least, most]: how tall a grown one stands, as most of them do; the one the world draws as its middle (a
//             plant at the middle of its scale, a tree at its oldest stage, a made thing as made) stands within
//   most      the tallest a real one grows: nothing the world draws of it stands taller
//   across    { typical, most }: the same for its widest side, where that is what it is known by (a rock)
//   size      a rock's: the least and the most the world draws of it, its largest side (a rock of size s is s across)
//   own       what no source was found for: the recipe's own choice, said, not measured against anything
//   known     a disagreement found and said, not yet set right: the run shows it and does not fail on it
//   source    where the numbers come from, and what each says
//   …         the measures its recipe is built from, each from its source
// Heights stand above the ground: what a stand sets into it (src/scatter/trees.js, FOOT) is not counted.

/** Every size of the world is in metres. */
export const UNITS = 'metres';

/** The reference body: the person the rest is measured with, the Settler (characters/settler.js), the library's first
 *  person, and the walker who is you. Its stature, and where on it the eyes, shoulders, hip, knee and ankle are: shares
 *  of stature from Drillis & Contini (1966), as D. A. Winter gives them ("Biomechanics and Motor Control of Human
 *  Movement", 4th ed., 2009, fig. 4.1). One copy: the body's own tables (intent 0036) read these shares from here. */
export const PERSON = {
  stature: 1.74,
  shares: { eye: 0.936, shoulder: 0.818, hip: 0.53, knee: 0.285, ankle: 0.039 },
  source: [
    'Drillis & Contini 1966, "Body segment parameters", in Winter 2009, fig. 4.1: eye 0.936, shoulder 0.818, hip 0.530, knee 0.285, ankle 0.039 of stature',
    'the stature: the Settler\'s, between the mean statures of ANSUR II (characters/settler.js, its measure)',
  ],
};
const at = (k) => Math.round(PERSON.stature * PERSON.shares[k] * 1000) / 1000;

/** You, walking: the reference body, as the camera (camera/rig.js) and what is solid (src/world/solids.js,
 *  src/world/bodies.js, assets/kinds.js) read it. */
export const WALKER = {
  eye: at('eye'),                                        // 1.629: the camera on foot
  shoulder: at('shoulder'),                              // 1.423: a bush taller than this stops you; a lower one is walked through
  knee: at('knee'),                                      // 0.496: leaves stop you only above it
  shin: Math.round(((at('knee') + at('ankle')) / 2) * 1000) / 1000,   // 0.282: the shin's middle: what ends under it is stepped over
  head: Math.round((PERSON.stature + 0.06) * 1000) / 1000,            // 1.8: the top of the head, the hair and a hand's room: what is higher passes over
  round: 0.3,                                            // how far a step keeps off anything: half the shoulders' breadth (0.255 m, ANSUR II's men's bideltoid 0.51 m) and the arms' room
  own: ['round: the arms\' room over half the shoulders\' breadth', 'head: a hand\'s room over the hair'],
};

/** How far what is drawn may stray from its measure (tools/scale.js). */
export const TOLERANCE = {
  levels: 0.2,         // a level of detail against the nearest, in height or across: more is said, not failed
  lumps: [0.8, 1.1],   // a rock's drawn least and most against its own size: its lumps stand over it, its smallest shape under
  growth: 0.05,        // a tree of an age, as drawn and as the library stands it, against its height by age
  round: [0.5, 1.05],  // what stops a walker at a rock, against how far the drawn rock reaches over the ground
};

/** The rules a measure keeps, in the world's units: what is wrong with it (none: nothing). */
export function faultsOf(m) {
  if (!m || typeof m !== 'object') return ['no measure'];
  const out = [], fine = (x) => typeof x === 'number' && x > 0 && x < 1000, range = (r) => Array.isArray(r) && r.length === 2 && r.every(fine) && r[0] <= r[1];
  if (!m.real) out.push('it does not say what it is (real)');
  const T = m.across ?? m;
  if (!range(T.typical)) out.push('its typical is not [least, most] in metres');
  if (!fine(T.most)) out.push('its most is not a size in metres');
  else if (range(T.typical) && T.most < T.typical[1]) out.push(`its most ${T.most} m is under its typical ${T.typical[1]} m`);
  if (m.size && !range(m.size)) out.push('its size is not [least, most] in metres');
  if (!(m.source?.length || m.own?.length)) out.push('no source, and none said to be its own');
  return out;
}
