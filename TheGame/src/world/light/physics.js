// The light's physical numbers (intent 0038): each in its unit, with where it comes from. Every other number of the light
// is derived from the one measure (the error a pixel may show, src/detail/measure.js), the light's 3 ms and the screen,
// or marked `derive:` where it is not yet.

/** The sun's width across the sky, radians: 0.0093 (0.533°, about 32′; from 31.5′ to 32.5′ over the year as the Earth's
    distance changes: HyperPhysics, "The Sun"; Wikipedia, "Angular diameter"). A penumbra is this wide for every metre
    between what casts it and what it falls on (src/world/light.js). */
export const SUN_DIAMETER = 0.0093;

/** How much of the light a metre of crown takes, per metre (m⁻¹): Beer–Lambert through foliage, k · LAI / depth, with k 0.5
    for leaves at random angles (Monteith & Unsworth 1990; 0.53 to 0.67 measured through mature hardwood stands in the
    southern Appalachians, USDA Forest Service), an LAI of 5 m² of leaf over each m² of ground (those stands: 4.3 to 5.4)
    and a crown 7 m deep (assumed). What the canopy's probes let through a slab of crowns (src/world/light/canopy.js). */
export const CROWN_EXTINCTION = 0.35;
