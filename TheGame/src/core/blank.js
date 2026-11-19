// What a texture node reads until what it is for is made: a stand-in of its own, made for it where it is made, never one
// shared (intent 0038, 2026-11-19). three binds two texture nodes that hold the same texture as one binding (its
// TextureNode.getUniformHash: the texture's uuid), so nodes sharing a stand-in were one binding where the game is built
// with its stand-ins (tools/smoke.js, and the device's check of what it built, tools/gate.js wgsl) and two once each held
// its own: WebKit refused the cut's rocks at 17 sampled textures where the smoke built 16 (the canopy's probes and the
// ground's colour, both one `black`). Each its own, what is built before is what a browser binds after.
//
//   blank(v, type)       a new 1 × 1 texture, every channel v (0 to 1): bytes, or half floats (THREE.HalfFloatType)
//   blankDepth(layers)   a new 1 × 1 depth array of `layers`, read with a comparison sampler (the shadow cascades')
import * as THREE from 'three/webgpu';

/** A new 1 × 1 texture whose every channel is v (0 to 1), in bytes or (type THREE.HalfFloatType) half floats. */
export function blank(v = 0, type = THREE.UnsignedByteType) {
  const half = type === THREE.HalfFloatType, texel = half ? new Uint16Array(4).fill(THREE.DataUtils.toHalfFloat(v)) : new Uint8Array(4).fill(Math.round(v * 255));
  return Object.assign(new THREE.DataTexture(texel, 1, 1, THREE.RGBAFormat, type), { needsUpdate: true });
}
/** A new 1 × 1 depth array of `layers`, read with a comparison sampler: as the shadow cascades are, so a shader built
    before them is built for them (an array of any count binds alike). */
export const blankDepth = (layers) => Object.assign(new THREE.DepthTexture(1, 1, THREE.FloatType, undefined, undefined, undefined, undefined, undefined, undefined, THREE.DepthFormat, layers), { compareFunction: THREE.LessEqualCompare });
