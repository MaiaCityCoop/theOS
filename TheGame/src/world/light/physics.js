// The light's physical numbers (intent 0038): each in its unit, with where it comes from. Every other number of the light
// is derived from the one measure (the error a pixel may show, src/detail/measure.js), the light's 3 ms, the screen or
// what the world holds (src/world/shadow.js).

/** The sun's width across the sky: a penumbra is this wide for every metre between what casts it and what it falls on
    (src/world/light.js, src/world/shadow.js). unit: radians (0.0093: 0.533°, about 32′; from 31.5′ to 32.5′ over the
    year as the Earth's distance changes). source: HyperPhysics, "The Sun"; Wikipedia, "Angular diameter". */
export const SUN_DIAMETER = 0.0093;

/** How much of the light a metre of crown takes, Beer–Lambert through foliage: k · LAI / depth, with k 0.5 for leaves at
    random angles, an LAI of 5 m² of leaf over each m² of ground and a crown 7 m deep (assumed). What the canopy's probes
    let through a slab of crowns where no stand's own crowns are measured yet, or none covers the ground (src/terrain/
    layers.js crownsAt). unit: per metre (m⁻¹). source: Monteith & Unsworth 1990
    (k 0.5, leaves at random angles); USDA Forest Service, light through mature hardwood stands in the southern
    Appalachians (k 0.53 to 0.67, LAI 4.3 to 5.4). */
export const CROWN_EXTINCTION = 0.35;

// ---- the clear air (src/world/sky/air.js): what its light is worked out from. Each a number a colour channel where it
// differs by the light's wavelength: the channels as 680, 550 and 440 nm (red, green, blue: Bruneton & Neyret 2008) ----

/** The Earth's radius, and the top of the air over it (past it no light is scattered): metres from the Earth's middle.
    unit: m. source: Bruneton & Neyret 2008, "Precomputed atmospheric scattering", Computer Graphics Forum 27(4):
    1079-1086 (6360 km); Hillaire 2020, "A scalable and production ready sky and atmosphere rendering technique",
    Computer Graphics Forum 39(4): 13-22 (the top 100 km up, over the ozone). */
export const EARTH = { radius: 6360e3, top: 6460e3 };

/** The air's molecules (Rayleigh): how much of the light a metre of air at sea level scatters, a channel each, and how
    high the air thins by e. unit: per metre (m⁻¹; scattering), m (height). source: Hillaire 2020 (5.802, 13.558, 33.1
    × 10⁻⁶ at 680, 550, 440 nm, as Bruneton 2017's); Bruneton & Neyret 2008 (8 km). */
export const RAYLEIGH = { scattering: [5.802e-6, 13.558e-6, 33.1e-6], height: 8000 };

/** The air's aerosols (Mie), as over the land in summer: their optical depth at 440 nm and how it falls with the
    wavelength (Ångström's exponent: depth ∝ λ^-exponent), how high they thin by e, and as measured at a few wavelengths
    (nm) the share of what they take that they scatter (their albedo) and how far forward (their asymmetry, g: the
    Henyey–Greenstein phase's), between which each channel's is taken. unit: none (depth, exponent, albedo, g), m
    (height), nm. source: Pérez-Ramírez et al. 2012, "Columnar aerosol properties from sun-and-star photometry:
    statistical comparisons and day-to-night dynamic", Atmospheric Chemistry and Physics 12: 9719-9738 (Granada: AOD(440)
    0.20 in summer, Ångström 1.0); Bruneton & Neyret 2008 (1.2 km); Dubovik et al. 2002, "Variability of absorption and
    optical properties of key aerosol types observed in worldwide locations", Journal of the Atmospheric Sciences 59:
    590-608, Table 1 (urban–industrial, Créteil–Paris: g 0.68/0.61/0.58, albedo 0.94/0.93/0.92 at 440/670/870 nm). */
export const AEROSOL = { depth440: 0.2, angstrom: 1, height: 1200, measured: { nm: [440, 670, 870], g: [0.68, 0.61, 0.58], albedo: [0.94, 0.93, 0.92] } };

/** The air's ozone: how much of the light a metre of it takes where it is densest, a channel each, and the layer it
    lies in (densest at `peak` metres up, thinning to none `half` metres above and below). unit: per metre (m⁻¹;
    absorption), m (peak, half). source: Hillaire 2020 (0.650, 1.881, 0.085 × 10⁻⁶; 25 km, 15 km). */
export const OZONE = { absorption: [0.65e-6, 1.881e-6, 0.085e-6], peak: 25000, half: 15000 };

/** The sun's light at the top of the air as the eye weighs it, on a plane facing it at the Earth's mean distance: what
    the light worked out as a share of the sun's is, in lux (the exposure's limit: src/world/sky.js). unit: lx.
    source: Darula, Kittler & Gueymard 2005, "Reference luminous solar constant and solar luminance for illuminance
    calculations", Solar Energy 79: 559-565 (133.8 klx). */
export const SOLAR_ILLUMINANCE = 133800;

/** The moon's brightness by its phase angle α (degrees from full), as a magnitude (a + b|α| + c α⁴), and the sun's: what
    of the sun's light the moon sends, 10^(-0.4 (m(α) - sun)). unit: magnitude. source: Krisciunas & Schaefer 1991, "A
    model of the brightness of moonlight", Publications of the Astronomical Society of the Pacific 103: 1033-1039
    (m(α) = -12.73 + 0.026|α| + 4 × 10⁻⁹ α⁴; the sun -26.74). */
export const MOON = { magnitude: [-12.73, 0.026, 4e-9], sun: -26.74 };

/** The brightest star of the night sky's, Sirius: the stars drawn are as bright as the sky's own are many (each fainter
    star a share of them; src/world/sky/stars.js). unit: magnitude (V). source: ESA 1997, The Hipparcos and Tycho
    Catalogues, ESA SP-1200 (Sirius, V -1.46). */
export const BRIGHTEST_STAR = -1.46;
