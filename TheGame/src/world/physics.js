// The world's physical constants (intent 0038): what is so of the real thing, not chosen. Each says its unit and its
// source; every other number in the game is worked out from these, from the one measure (src/detail/measure.js) or
// from what is drawn (the code gates count a number written by hand anywhere else: tools/health.js).

/** The ground's own relief: how far its highest ground stands over its lowest, within a step of it (the clods, pebbles
    and hollows of a field's soil; the land's own shape is the land's octaves, src/world/land.js). A page of the land
    holds it as its height 0 … 1 (src/terrain/pages.js); the relief near the eye shows it (src/terrain/relief.js).
    unit: m. source: the random roughness of field soils, the standard deviation of their height, 0.6 to 5 cm (Zobeck
    & Onstad 1987, "Tillage and rainfall effects on random roughness: a review", Soil & Tillage Research 9); an
    untilled meadow's about 1.2 cm, about four of it from lowest to highest. */
export const SOIL_RELIEF = 0.05;
