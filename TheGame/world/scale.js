// The measure of everything (intent 0035): for every real thing the world draws, what a real one measures, in metres,
// and where that is known from; so that each thing is its own size, and so the right size next to every other: the
// person, you walking, the tent, the fire, the trees, a stone. Recipes are built from it (the measures they name here)
// and measured against it: `bun tools/scale.js` builds every asset and character of the registry, at every level of
// detail and every stage of growth, stands each as the world stands it (its placement's scale, its stand's ages, its
// foot in the ground), and sets what was built beside what is real; it fails where anything is out of its range, or
// where a recipe has no measure here. CI runs it.
//
// THINGS, by the uid of the recipe that draws it (src/core/registry.js):
//   real      what it is, in the world outside
//   typical   [least, most] metres: how tall a grown one stands, as most of them do; the one the world draws as its
//             middle (a plant at the middle of its scale, a tree at its oldest stage, a made thing as made) stands within
//   most      the tallest a real one grows: nothing the world draws of it stands taller
//   across    { typical, most }: the same for its widest side, where that is what it is known by (a stone)
//   own       what no source was found for: the recipe's own choice, said, not measured against anything
//   known     a disagreement found and said, not yet set right: the run shows it and does not fail on it
//   source    where the numbers come from, and what each says
//   …         the measures its recipe is built from, each from its source
// Heights stand above the ground: what a stand sets into it (src/scatter/trees.js, FOOT) is not counted.

/** The person the rest is measured with: the Settler, the library's first person, and the walker who is you. Where on
 *  them their eyes, shoulders and knees are: shares of stature from Drillis & Contini (1966), as D. A. Winter gives
 *  them ("Biomechanics and Motor Control of Human Movement", 4th ed., 2009, fig. 4.1), the table intent 0033 builds the
 *  body from (characters/kit/measures.js, SEGMENTS: the same numbers). */
export const PERSON = {
  stature: 1.74,
  shares: { eye: 0.936, shoulder: 0.818, hip: 0.53, knee: 0.285, ankle: 0.039 },
  typical: [1.6, 1.8],
  most: 2.0,
  source: [
    'Drillis & Contini 1966, "Body segment parameters", in Winter 2009, fig. 4.1: eye 0.936, shoulder 0.818, hip 0.530, knee 0.285, ankle 0.039 of stature',
    'ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): mean stature 1.629 m (women), 1.756 m (men); the Settler\'s 1.74 m between them',
  ],
};
const at = (k) => Math.round(PERSON.stature * PERSON.shares[k] * 1000) / 1000;

/** You, walking: the person's body, as the camera (camera/rig.js) and what is solid (src/world/solids.js,
 *  assets/kinds.js) read it. */
export const WALKER = {
  eye: at('eye'),                                        // 1.629: the camera on foot
  shoulder: at('shoulder'),                              // 1.423: a bush taller than this stops you; a lower one is walked through
  knee: at('knee'),                                      // 0.496: leaves stop you only above it
  shin: Math.round(((at('knee') + at('ankle')) / 2) * 1000) / 1000,   // 0.282: the shin's middle: what ends under it is stepped over
  head: Math.round((PERSON.stature + 0.06) * 1000) / 1000,            // 1.8: the top of the head, the hair and a hand's room: what is higher passes over
  round: 0.3,                                            // how far a step keeps off anything: half the shoulders' breadth (0.255 m, ANSUR II's men's bideltoid 0.51 m) and the arms' room
  own: ['round: the arms\' room over half the shoulders\' breadth', 'head: a hand\'s room over the hair'],
};

/** A 5 m bell tent: what assets/belltent.js is built from. */
export const BELL_TENT = {
  real: 'a 5 m cotton-canvas bell tent on one centre pole',
  diameter: 5,                       // its round, on the ground
  wall: 0.62,                        // its short wall, ground to roof
  peak: 3.0,                         // the roof's point, on the pole
  cap: 0.18,                         // the pole's top over the peak
  door: { height: 1.8, width: 1.32 },  // the opening: how high it reaches into the roof, how wide it is at the ground
  typical: [3.0, 3.3],               // its peak and the pole's cap over it
  most: 3.4,
  own: ['cap: the pole\'s top over the canvas'],
  source: [
    'makers\' sheets of 5 m bell tents, read 2026-11-16: centre pole 3.0 m (Mountain Warehouse, Stonegate; 3.1 m the Kokoon Deluxe XL); walls about 0.6 m (0.8 m on the XL); doors 1.5 m (Mountain Warehouse Lite), 1.68 m high and 1.32 m wide (Trade Tested 5 m Pro), 1.7 m (Stonegate 500), 1.8 m (Mountain Warehouse polycotton), 2.0 m (Boutique Camping, the Kokoon XL with its taller walls)',
  ],
};

/** A fire pit: a ring of stones on the ground, seats round it: what assets/firepit.js is built from. */
export const FIRE_PIT = {
  real: 'a ring of stones round a fire on the ground, seats round it',
  ring: 0.62,                        // the ring's radius, to its stones' middle: 1.24 m across, a group's fire ring
  seat: { height: 0.44, width: 0.48, from: 1.74 },   // a seat's height and width, and how far it stands from the fire's middle
  typical: [0.4, 0.5],               // what stands highest of it: its seats
  most: 0.6,
  own: ['seat.from: how far the seats stand from the fire'],
  source: [
    'campfire rings, makers\' sheets read 2026-11-16: 0.61 and 0.76 m inside for one camp (Pilot Rock FSW-26/7, FA-30), 1.17 and 1.37 m for a group (FS-48, FSW-56)',
    'a campfire 0.9 m across or less (Minnesota DNR, campfire safety)',
    'seats: 0.43 to 0.48 m high (Sunshine Coast Council\'s design guide: most at 0.45 m; Inclusive Mobility 2021: 0.47 to 0.48 m)',
  ],
};

/** The flames of a campfire: what assets/flame.js is built from. */
export const FLAME = {
  real: 'the flames of a campfire',
  hot: 0.9,                          // how high its tallest tongue reaches
  typical: [0.5, 1.2],
  most: 1.5,
  own: ['hot, typical, most: no source with measured flame heights of a campfire was found; the size of the fire under them is sourced'],
  source: [
    'a recreational fire: fuel 0.91 m across or less and 0.61 m high or less (the International Fire Code\'s definition, as fire services quote it)',
  ],
};

/** Trees: how tall a grown one stands; their files' curves of height by age come to `mature`. */
export const STONE_PINE = {
  real: 'Pinus pinea, the stone pine',
  mature: 20,                        // what its height by age comes to (assets/stonepine.js)
  typical: [12, 20],
  most: 25,
  source: [
    'RHS (Pinus pinea): 15 to 20 m when fully mature',
    'Wikipedia (Stone pine): 12 to 20 m, can exceed 25 m',
  ],
};
export const HOLM_OAK = {
  real: 'Quercus ilex, the holm oak',
  mature: 21,                        // what its height by age comes to (assets/holmoak.js)
  typical: [12, 25],
  most: 25,
  source: [
    'RHS (Quercus ilex): ultimate height higher than 12 m, in 20 to 50 years',
    'The Wildlife Trusts: up to 20 m; tree nurseries\' sheets (Deepdale Trees): 20 to 25 m by site and climate',
  ],
};

/** Rocks, by their largest side, as the world draws them (src/scatter/rocks.js): a rock of size s is s across (its
 *  lumps a few hundredths more). `size`: the least and the most the world draws of them (a rock's size is its cell's
 *  die: most of them small); `height`: how high one stands, as it lies (its recipe's, not measured against a source). */
export const STONES = {
  real: 'field stones: most of them cobbles, a few small boulders',
  size: [0.07, 0.55],
  height: [0.05, 0.4],
  across: { typical: [0.064, 0.256], most: 1.024 },
  own: ['height: how high a stone stands as it lies'],
  source: ['Wentworth 1922, "A scale of grade and class terms for clastic sediments": cobbles 64 to 256 mm, boulders larger; Blair & McPherson 1999: fine boulders 0.256 to 0.512 m, medium 0.512 to 1.024 m'],
};
export const BOULDERS = {
  real: 'boulders, where the outcrops break through',
  size: [0.7, 4.2],
  height: [0.5, 3],
  across: { typical: [0.512, 2.048], most: 8.192 },
  own: ['height: how high a boulder stands as it lies'],
  source: ['Blair & McPherson 1999, "Grain-size and textural classification of coarse sedimentary particles": boulders medium 0.512 to 1.024 m, coarse 1.024 to 2.048 m, very coarse 2.048 to 4.096 m; larger, blocks (fine 4.1 to 8.2 m)'],
};

/** The measures, by the uid of the recipe each is of. */
export const THINGS = {
  // the people
  '944dc52a-5094-480c-9396-5ceedbbf03b1': { ...PERSON, real: 'a grown person: the Settler is the reference person, 1.74 m' },   // the Settler (characters/settler.js)
  // what is made
  '104dde1e-c26e-42fd-9aab-c6612fbe8222': BELL_TENT,
  '23566c8c-0864-4278-a2f7-a3e072300223': FIRE_PIT,
  'dea9b8e4-28a7-4b88-b32e-ee498eb7a862': FLAME,
  // the trees
  'e4f1685f-2db4-41a6-89df-e818cb470fdd': STONE_PINE,
  '40cb573a-5aa3-4e2f-90ff-41e69d20915e': HOLM_OAK,
  // the understory: bushes, ferns and reeds, as tall as they stand
  '1f69dea0-43f9-4fc0-9e41-90d76324e265': {
    real: 'Pistacia lentiscus, mastic',
    typical: [1, 4],
    most: 8,
    source: ['RHS (Pistacia lentiscus): 2.5 to 4 m; Wikipedia: up to 4 m; Plants For A Future: 5 m; Stihl\'s tree profiles: 1 to 8 m, as a small tree'],
  },
  '6d38d178-4510-4dcc-8178-eaa461e75367': {
    real: 'Cistus salviifolius, the sage-leaved rockrose: low, grey-green, white-flowered',
    typical: [0.3, 1],
    most: 1,
    source: ['RHS (Cistus salviifolius): ultimate height 0.5 to 1 m; Easyscape: 0.3 to 0.6 m, now and then 1 m'],
  },
  'ad7f7215-acb8-4a37-9287-f32d100b826f': {
    real: 'Pteridium aquilinum, bracken',
    typical: [1, 2],
    most: 5,
    source: ['Natural England: fronds mostly 1 to 2 m (one of 4 m recorded); Britannica: to 5 m or more; Oxford Botanic Garden: mature fronds to 3 m'],
  },
  'ea2b55d0-a99a-4444-841b-772cc86e10b6': {
    real: 'Phragmites australis, common reed',
    typical: [2, 4],
    most: 6,
    source: ['RHS (Phragmites australis): 2.5 to 4 m; Wikipedia: stems 2 to 6 m, the tallest where summers are hot; native stands lower than the invasive (Invasive Species Centre, Ontario: to 5 m)'],
  },
  // what lies on the wood's floor
  '35e25aab-5b51-41bc-9914-31cd4b9915ec': {
    real: 'Leucobryum glaucum, cushion moss: cushions on the wood\'s floor, two or three grown together',
    typical: [0.05, 0.15],
    most: 0.3,
    source: ['Gardenia: cushions 5 to 15 cm high, 20 to 60 cm across; an EOL record: up to 50 × 45 cm and almost 30 cm thick; Minnesota Seasons: up to 13 cm tall and 1 m across'],
  },
  '43ceb501-3788-47fc-bb64-fa4df1bcafa1': {
    real: 'a fallen branch of a pine, lying on the floor',
    typical: [0.05, 0.5],
    most: 0.6,
    own: ['typical, most: what a fallen branch stands off the ground: no source; its thickness, 7 to 15 cm, is coarse woody debris (pieces over 7.6 cm, the US Forest Service\'s inventory)'],
    source: ['US Forest Service, Forest Inventory and Analysis: coarse woody debris, pieces 7.6 cm (3 in) and more across'],
  },
  // the ground's grass, one blade, as tall as it stands in the meadow (each biome's grass takes a share of it)
  'eb8f406f-1035-4921-ba42-10f05efab6ed': {
    real: 'the grasses of a hay meadow, leaf and flowering stem',
    typical: [0.3, 1.2],
    most: 1.5,
    source: ['false oat-grass (Arrhenatherum elatius), a hay meadow\'s tallest: 0.5 to 1.2 m, now and then 1.5 m (Flora Helvetica); 0.6 to 1.5 m (Bayer crop science)'],
  },
  // rocks, by their widest side: the sedimentologists' scale of grain sizes
  '62b01bbe-c92c-4181-b774-45a6af054b12': STONES,
  '42345740-c3cc-455a-8017-a97ccdee6df3': BOULDERS,
};
