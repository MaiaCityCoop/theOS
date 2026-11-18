// The gate's views and paths (tools/gate.js): where its pictures are taken, and the ways its camera moves while every
// frame is timed. One list each.
//
// Every view is at 11:00 with no wind and no clouds, so nothing in the picture moves but what detail changes. A view
// gives its camera one of two ways:
//   cam   the film camera as tools/shots.js view() takes it: x, z, yaw (radians), up (metres over the ground there),
//         pitch (metres up per hundred ahead), mm
//   rig   the game's own camera hung over a point (src/camera/rig.js poseAt): x, z, yaw, and either its height h or how
//         far it stands from the point (dist, by the rig's heightFor), look its tilt from that height's own. It is turned
//         into view()'s terms in the page, so it is the very pose the walker, the bench and the library see there
import { VIEWS as BENCH } from '../bench.js';
import RIG from '../../camera/rig.js';

const SKY = { hour: 11, wind: 0, clouds: 0 };
export const TENT = [-1262.6, 631], PINES = [-1383.6, 634.1];   // the bell tent; the pine stand, where the bench stands in it
export const FIRE = [-1263.3, 624.4], BOULDER = [-1335.42, 550.17];   // the fire pit before the tent; a boulder of 3.3 m on an outcrop south-west of it (src/world/rocksolid.js)
const TO_TENT = BENCH[0].yaw, INTO_PINES = BENCH[4].yaw;   // the headings the bench looks at them by: the tent from the meadow, the stand from the tent's side
const slug = (s) => s.toLowerCase().replace(/(\d) (k?m)\b/g, '$1$2').replace(/[^a-z0-9.]+/g, '-');
const from = (name, [x, z], yaw, dist) => ({ name, rig: { x, z, yaw, dist } });
const METRES = [10, 30, 60, 120, 250, 500];

// Each view also says what it shows, for the real half (tools/gate.js real: the photographs it is held against): its
// kind, one of KINDS (the reference photos' own: research_notes/0038-species-and-references.md, and the made things),
// and how far off the camera stands from it, in metres (null: inside it, or not known).
export const KINDS = ['eye-level', 'tree', 'shrub', 'rock', 'floor', 'above', 'hills', 'tent', 'firepit', 'meadow', 'river', 'town'];
const SHOWS = { 'tent, eye level': ['tent', 14], 'river bend, 26 m': ['river', 26], 'town, 40 m': ['town', 40], 'skyline, 2.5 km': ['hills', 2500], 'pine forest, eye level': ['eye-level', null], 'pine forest, 90 m': ['above', 90] };
export const VIEWS = [
  // the bench's six (tools/bench.js), each in the bench's own pose (its slight tilt down too)
  ...BENCH.map((v) => ({ name: 'bench-' + slug(v.name), bench: v.name, rig: { x: v.x, z: v.z, yaw: v.yaw, h: v.h, look: -0.05 }, kind: SHOWS[v.name][0], distance: SHOWS[v.name][1] })),
  // the tent and the pine stand from 10 to 500 m, as the game's camera stands that far from them (the stand: its trees
  // to 30 m, from above further off, where the rig hangs high)
  ...METRES.map((d) => ({ ...from(`tent-${d}m`, TENT, TO_TENT, d), kind: 'tent', distance: d })),
  ...METRES.map((d) => ({ ...from(`pines-${d}m`, PINES, INTO_PINES, d), kind: d <= 30 ? 'tree' : 'above', distance: d })),
  // the land from 2.5 and 12 km
  { ...from('far-2.5km', TENT, TO_TENT, 2500), kind: 'hills', distance: 2500 }, { ...from('far-12km', TENT, TO_TENT, 12000), kind: 'hills', distance: 12000 },
  // the solids up close and from 30 m (stage 8: a surface's cluster hierarchy)
  { ...from('firepit-3m', FIRE, TO_TENT, 3), kind: 'firepit', distance: 3 }, { ...from('boulder-6m', BOULDER, TO_TENT, 6), kind: 'rock', distance: 6 }, { ...from('boulder-30m', BOULDER, TO_TENT, 30), kind: 'rock', distance: 30 },
].map((v) => ({ ...SKY, ...v }));

// The paths: the camera moving as a player moves it, at 11:00 in the game's own weather, each played once by the film
// camera (cine/cine.js: one clip, at an even pace) from where it starts, once the world has settled there; the last is
// tools/flyby.js's own flight, one cycle of it.
//   walk    from beside the tent into the pine stand, at the walker's eyes and pace, looking ahead
//   zoom    the rig over the meadow before the tent, from the walker's eyes to 12 km, evenly in the height's logarithm
//   orbit   once round the tent, the rig 30 m from it
//   flyby   the rig's zoom over an oak at the stand's edge, from the top down to its eyes and back up
export const PATHS = [
  { name: 'walk', walk: { from: [-1268, 627], to: [-1400, 635], eye: RIG.eye, speed: RIG.keys[0].speed, mm: RIG.keys[0].mm } },
  { name: 'zoom', zoom: { at: [BENCH[0].x, BENCH[0].z], yaw: TO_TENT, from: RIG.eye, to: RIG.top, secs: 20 } },
  { name: 'orbit', orbit: { at: TENT, yaw: TO_TENT, dist: 30, secs: 20 } },
  { name: 'flyby', flyby: true },
].map((p) => ({ hour: SKY.hour, ...p }));
