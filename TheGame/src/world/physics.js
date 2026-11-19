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

/** How long the eye rests on what it looks at, at the least, between one jump of it and the next: what the land's
    pages ask in (every pixel of a block asks within one: src/terrain/pages.js), and the time a page comes in over at the
    most. unit: s. source: Rayner 2009, "Eye movements and attention in reading, scene perception, and visual search"
    (Quarterly Journal of Experimental Psychology 62): fixations of 225 to 250 ms in reading, 260 to 330 ms in scene
    perception; the shortest. */
export const FIXATION = 0.25;

/** How tall grown men and women stand: the mean and the standard deviation of each. A figure brought in whole is
    measured against it (characters/kit/figure.js: its recipe's measure). unit: m. source: ANSUR II (Gordon et al. 2014,
    "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007), stature: men 1.756, women 1.629; their
    standard deviations as remembered from it (the report was not at hand when this was written). */
export const STATURE = { man: { mean: 1.756, sd: 0.069 }, woman: { mean: 1.629, sd: 0.064 } };

/** Of the way an arm is raised or let down at the side, the share that is the shoulder girdle's own (the collar bone
    and the blade), the rest the arm's in its socket. A figure that comes with its arms out has them brought down by it
    (characters/kit/figure.js). unit: a share of the whole, 0 … 1. source: Inman, Saunders & Abbott 1944, "Observations
    on the function of the shoulder joint" (Journal of Bone and Joint Surgery 26): two parts in the socket to one of
    the girdle, over the arm's raise. */
export const SHOULDER_RHYTHM = 1 / 3;

/** What a surface of skin mirrors of the light that meets it head on. The Body's skin is drawn by it
    (characters/kit/skin/light.js). unit: a share of the light, 0 … 1. source: an index of refraction of 1.4, of which
    2.8 % follows; the figure every skin shader holds (Jimenez's SeparableSSS demo, Unity HDRP's diffusion profile, GPU
    Gems 3 ch. 14). */
export const SKIN_F0 = 0.028;

/** How much slower light runs in water than in the air: its index of refraction, over the visible. What a water surface
    reflects of the light that meets it, and how what is seen through it bends (src/terrain/water.js: Fresnel's
    equations for unpolarized light, Snell's law). unit: none (a ratio). source: Hale & Querry 1973, "Optical constants
    of water in the 200-nm to 200-µm wavelength region", Applied Optics 12(3): 1.333 to 1.338 between 700 and 450 nm;
    1.333 at the red end. */
export const WATER_IOR = 1.333;

/** How much of red light pure water takes away along a metre of it: its absorption coefficient at 650 nm. Water's own
    absorption is the most of what it takes from red light, so a water's absorption in the other colours follows from
    its own colour by it (src/terrain/water.js: Morel's reflectance, WATER_REFLECTANCE_F). unit: m⁻¹. source: Pope &
    Fry 1997, "Absorption spectrum (380-700 nm) of pure water. II. Integrating cavity measurements", Applied Optics
    36(33): 0.340 m⁻¹ at 650 nm. */
export const WATER_RED_ABSORPTION = 0.34;

/** How the colour a deep water shows follows from what it scatters back and what it takes away: its reflectance just
    under the surface, R = f · b_b / a (b_b its backscattering, a its absorption, both per metre), this f. So the colour
    deep water shows gives its absorption in each colour, its backscattering one number for all of them
    (src/terrain/water.js). unit: none. source: Morel & Prieur 1977, "Analysis of variations in ocean color", Limnology
    and Oceanography 22(4): f = 0.33 (after Gordon, Brown & Jacobs 1975), for the sun not low. */
export const WATER_REFLECTANCE_F = 0.33;
