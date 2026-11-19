// The light's physical numbers (intent 0038): each in its unit, with where it comes from. Every other number of the light
// is derived from the one measure (the error a pixel may show, src/detail/measure.js), the light's 3 ms, the screen or
// what the world holds (src/world/shadow.js).

/** The sun's width across the sky: a penumbra is this wide for every metre between what casts it and what it falls on
    (src/world/light.js, src/world/shadow.js). unit: radians (0.0093: 0.533°, about 32′; from 31.5′ to 32.5′ over the
    year as the Earth's distance changes). source: HyperPhysics, "The Sun"; Wikipedia, "Angular diameter". */
export const SUN_DIAMETER = 0.0093;

/** How much of the light a metre of crown takes, Beer–Lambert through foliage: k · LAI / depth, with k 0.5 for leaves at
    random angles, an LAI of 5 m² of leaf over each m² of ground and a crown 7 m deep (assumed). What the canopy's probes
    let through a slab of crowns (src/world/light/canopy.js). unit: per metre (m⁻¹). source: Monteith & Unsworth 1990
    (k 0.5, leaves at random angles); USDA Forest Service, light through mature hardwood stands in the southern
    Appalachians (k 0.53 to 0.67, LAI 4.3 to 5.4). */
export const CROWN_EXTINCTION = 0.35;
