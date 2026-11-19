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

/** A highlight's spread widened by what of its surface's own slopes a pixel cannot show: the variance of the pixel's
    filter, over which the normal's change across the pixel is taken as roughness (GGX's α², added to the surface's
    own). unit: pixels² (a share of a pixel, squared). source: Tokuyoshi & Kaplanyan 2019, "Improved Geometric
    Specular Antialiasing", I3D 2019 (doi:10.1145/3306131.3317026): its listing's SIGMA2, 1/2π. */
export const NDF_FILTER_VARIANCE = 0.15915494;

/** The most that widening adds to a highlight's α², so a surface whose normal turns fast across a pixel is not taken as
    rougher than a rough one. unit: none (GGX's α²). source: Tokuyoshi & Kaplanyan 2019 (as above): its listing's
    KAPPA, 0.18. */
export const NDF_FILTER_MOST = 0.18;
