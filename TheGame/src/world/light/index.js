// The light's passes before a frame (intent 0038, stage 9), in the order the frame needs them: the shadow atlas
// (src/world/shadow.js), the canopy map and its sky probes (canopy.js), the air (air.js). What is worked out on the
// screen between the prepass and the colour is screen.js's (src/core/screen.js runs it). Every material reads them
// through the one light (src/world/light.js lightOn, lit).
import { createShadows } from '../shadow.js';
import { createCanopy } from './canopy.js';

export function createLight(renderer, { groundAt }) {
  const shadows = createShadows(renderer), canopy = createCanopy(renderer, { groundAt });
  return {
    shadows, canopy,
    /** The casters compiled for the shadow atlas (src/world/shadow.js compile; a promise). */
    compile: (object, camera, groundY, scene = null) => shadows.compile(object, camera, groundY, scene),
    /** Before the frame, round where the camera stands (groundY: the ground under it). */
    render(scene, camera, groundY) { shadows.render(scene, camera, groundY); canopy?.render(scene, camera, groundY); },
    /** Each pass alone, for a tool's timing (tools/bench.js parts). */
    parts: (scene, camera, groundY) => ({ shadows: () => shadows.render(scene, camera, groundY), canopy: () => canopy?.render(scene, camera, groundY) }),
  };
}
