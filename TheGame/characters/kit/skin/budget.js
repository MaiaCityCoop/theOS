// What intent 0041 asks of the Body's skin as numbers: what its gates are tried by (tools/body.js).

/** The five poses the skin is tried in (the gate "it bends": a still of each, and how far the skin's own edges are
    stretched and squeezed in it), as the rig's plain moves (../skeleton/pose.js turnsOf). unit: rad (a fist: 0 … 1, how
    far it is closed). source: intent 0041, Define, gate 4, "the tool's stills in five poses; a number each"; the angles
    are the tool's own, set when it was built, each within its joint's range (../skeleton/pose.js LIMITS). */
export const POSES = {
  'elbows bent': { 'elbow.L': 2.2, 'elbow.R': 1.2, 'arm.R': [0.5, 0, 0] },
  'arms raised': { 'arm.L': [0, 1.6, 0], 'arm.R': [0, 2.8, 0] },
  'knee raised': { 'hip.L': [1.6, 0, 0], 'knee.L': 1.7 },
  'bent forwards': { loins: [0.7, 0, 0], chest: [0.3, 0, 0], 'arm.L': [1.2, 0, 0], 'arm.R': [1.2, 0, 0] },
  squat: { 'knee.L': 2.3, 'knee.R': 2.3, 'hip.L': [1.9, 0.2, 0], 'hip.R': [1.9, 0.2, 0], 'fist.L': 1, head: [0, 0.9, 0] },
};
