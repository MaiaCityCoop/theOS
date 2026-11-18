// The published methods' own numbers (intent 0038): each is how a method the game uses is defined where it was
// published, not a dial of the look, and each says its unit and its source. (The light's physical numbers are
// src/world/light/physics.js's; every other number is derived from the one measure, the budget, the screen or what the
// world holds.)

/** The spatiotemporal blue noise's tile (src/world/light/noise.js), made by void and cluster: the width of its Gaussian
    filter. unit: pixels. source: Ulichney 1993, "The void-and-cluster method for dither array generation", SPIE 1913
    (doi:10.1117/12.152707): the method, its filter of sigma 1.5. */
export const BLUE_NOISE_SIGMA = 1.5;

/** The blue noise's tile: its side, repeated over the screen. unit: pixels. source: Pixman, pixman/dither/
    blue-noise-64x64.h (2019): a 64 x 64 void-and-cluster tile, the size real-time dithering repeats over its screen. */
export const BLUE_NOISE_SIDE = 64;
