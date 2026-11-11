// The world's public face: the land as functions (JS), the same land for shaders (GLSL), the light.
// Everything outside src/world/ imports from here.
export * from './world/land.js';
export { WORLD_GLSL } from './world/land.glsl.js';
export { LIGHT_GLSL } from './world/light.glsl.js';
