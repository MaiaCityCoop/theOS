// The one number of detail (intent 0038), plain JS: the page reads it through the measure (src/detail/measure.js), and
// what is built in the recipes' workers (the crowd kit, assets/kit/crowd.js) reads it here, where nothing of the page or
// of three is. A recipe's version holds it (tools/registry.js SHARED): a change of it builds every plant again.

/** The most a thing drawn at a level may differ from it at full detail, in pixels drawn. */
export const ERROR_PX = 1;

/** The pixels drawn a pixel of the measure, as the budget draws a 4K screen: about 1440p inside, brought up to the screen
    by the temporal pass (intent 0038, Define). What is chosen before a frame is drawn (which parts a level holds, where
    a crowd hands over to its clumps) matches a baked texel against the pixels drawn by it; what is chosen in the frame
    reads the pixels drawn as they are (measure.js drawnAt). (Once the measure counts the pixels drawn, measure.js DRAWN,
    this is 1.) */
export const BUDGET_DRAWN = 4 / 3;
