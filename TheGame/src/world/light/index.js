// The light's passes before a frame (intent 0038, stage 9), in the order the frame needs them: the shadow cascades
// (src/world/shadow.js), then the canopy map and its sky probes (canopy.js). The air is the height fog every material
// works out itself (src/world/light.js airOf). What is worked out on the screen between the prepass and the colour is
// screen.js's (src/boot.js hands it to the screen's afterPrepass). Every material reads them through the one light
// (src/world/light.js lightOn, lit).
import { createShadows } from '../shadow.js';
import { createCanopy } from './canopy.js';

/** groundAt: the ground's height at a point, as a node (src/world/land.nodes.js), for the canopy's probes. */
export function createLight(renderer, { groundAt }) {
  const shadows = createShadows(renderer), canopy = createCanopy(renderer, { groundAt });
  return {
    shadows, canopy,
    /** The casters compiled for the shadow cascades (src/world/shadow.js compile; a promise). */
    compile: (object, camera, groundY, scene = null) => shadows.compile(object, camera, groundY, scene),
    /** What making `object` ahead of need asks, where it casts (src/world/shadow.js ahead; src/core/compile.js ahead). */
    ahead: (object, scene) => shadows.ahead(object, scene),
    /** Before the frame, round where the camera stands (groundY: the ground under it). Each part marks its passes, for a
        tool's timing (src/core/gpu.js mark, tools/bench.js). */
    render(scene, camera, groundY) { shadows.render(scene, camera, groundY); canopy?.render(scene, camera, groundY); },
  };
}
