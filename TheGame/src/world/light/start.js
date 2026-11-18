// The light's start (intent 0038, stage 9a): what the one light needs before any material is built, as one step that
// whatever makes the world calls where the start does (src/boot.js; tools/smoke.js, which makes the world as the start
// does), so none of them can leave a part of it out:
//
//   the backend   whether a material may read the shadow map's texels itself (src/world/light.js useBackend)
//   the cascades  laid out from what casts in the stands (src/world/shadow.js useCascades, src/terrain/layers.js
//                 CASTERS): every lit material is built for them, and asking for them before is an error
//   the screen    the light worked out on the screen from the prepass's depth, for the colour pass (the contact
//                 shadows: src/world/light/screen.js screenLightFor)
import { useBackend } from '../light.js';
import { useCascades } from '../shadow.js';
import { CASTERS } from '../../terrain/layers.js';
import { screenLightFor } from './screen.js';

/** The light's start, once the measure is kept (src/detail/measure.js keepMeasure) and before any material is built.
    Returns the light worked out on the screen (screenLightFor). */
export function startLight(renderer, screen) {
  useBackend(renderer);
  useCascades(CASTERS);
  return screenLightFor(renderer, screen);
}
