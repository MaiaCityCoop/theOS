# Lens review · 2026-11-11

Every master shot of the lens bench (`/lenses.html`), looked at as a still at 1440 × 810, depth of
field on, T1.9. What is wrong in each, what would fix it for every lens at once, and what the
things still held back (sun, sky, haze, wind, shadow) will take care of by themselves.

Judged on stills in the app's browser pane. Motion, and frame rate in Safari, were not judged.

## What is wrong, lens by lens

| Lens | Master | What reads as unreal |
| --- | --- | --- |
| A28 | The land | The river is a road with a kerb: one flat colour, a sand collar of constant width. The land is a green carpet with brown stickers on it (bare patches: hard edge, flat). Boulders lie on top like props, nothing under them. A dark line on the horizon. No shadow anywhere, so no relief. |
| A35 | Down the river | Grass ends at the sand in a clean line, with single blades standing on bare sand. Water is one blue-grey sheet: no reflection of the bank, no depth, no darker wet sand. The far bank's grass is a hedge: a strip of blades, then nothing. |
| A40 | The meadow | The best of the nine. A band shows where the dense near blades end (about 15 m). Bare patches in the middle distance are flat brown shapes. The far dry land is a tan slab. Every blade is the same plant. |
| A50 | The bank | Same hedge on the far bank and the same sheet of water. Foreground blur has hard edges where a lens would smear it over the water. |
| A60 | In the grass | Blades are paper ribbons: flat, one tone across, wide, all one species. With no shadow between them there is no depth in the thicket; only the blur separates near from far. |
| A75 | A boulder | The rock's cracks read as a tiled turtle shell. Moss is green paint with a soft edge. The rock goes straight into the grass: no contact shadow, no dirt, no blades leaning on it. The silhouette shows its polygons. |
| A100 | The waterline | The weakest frame, twice reframed and still not a picture. Up close the water has nothing to show: no ripples that read, no foam that reads, no caustics, no wet sand. Blades at the edge look afloat. |
| A135 | The boulder, far | The far ring of grass, magnified by the lens, is coarse spikes. Boulders beyond are props on a lawn. |
| A180 | Across the land | Past 105 m there are no blades at all, so through a 180 the land is green felt and the rocks sit on a pool table. |

## The same faults, by cause

1. **Detail follows distance, not the picture.** Rings of blades and rock tiers are set in metres
   around the camera. A long lens magnifies the coarse ring (A135) or looks past the last one
   (A180); a high camera gets none (A28). Shows as bands (A40) and hedges (A35, A50).
2. **Nothing casts or receives shadow, nothing is occluded.** Rocks float, grass has no depth,
   land has no relief. (A28, A60, A75, A135, A180.)
3. **Things do not meet.** Grass to sand, rock to ground, dirt to grass: each is a hard line
   between two materials that know nothing of each other. (A28, A35, A40, A75.)
4. **Water is a tinted sheet.** No reflection of what stands beside it, no absorption with depth,
   nothing at the hand's scale. (A28, A35, A50, A100.)
5. **One of everything.** One blade, one rock shape, one moss. (A40, A60, A75.)
6. **The lens is only half a lens.** Blur does not spill over what is behind, highlights do not
   bloom into shapes. (A50, A60.)

## How to solve it once, for every lens

The pattern behind all of it: today each system (terrain, grass, rocks, water) has its own
shader, its own idea of detail and its own lighting. The fix is four shared things.

**1. One law for detail: size on screen.**
- A single number per frame, the lens factor `tan(reference fov / 2) / tan(fov / 2)`, scales
  every range: terrain levels, blade tiers, rock tiers. An object is drawn at the tier its size
  in pixels asks for, whatever the lens or the camera's height.
- Scatter (blades, stones, later bushes) is placed by **the terrain's own quadtree**, not by
  rings around the camera: each visible terrain node carries the scatter tier its screen size
  asks for. Blades then stand where the lens looks, and nowhere else.
- One **budget governor** (frame time in, one quality dial out) scales the lens factor's effect,
  shadow and post resolution together, instead of dropping the picture's resolution.
- Cost law to respect: a long lens sees more ground per pixel row; full blade detail at 180 mm
  costs several times a normal lens. The governor trades density for width there, and depth of
  field hides the rest.

**2. One description of what grows where: an asset and biome table.**
- A config, not code: per asset its tiers (mesh, density, pixel-size thresholds, fade), per biome
  its densities, sizes and colours. New plants and rocks are rows.
- The **ground cache becomes a small clipmap** (three levels: 0.5 m over 256 m, 2 m over 1 km,
  8 m over 4 km) holding height, biome weights, moisture and tint. Every scatter shader and the
  terrain's pixel shader read it; the terrain stops working noise out per pixel.
- Edges are made there: density and blade height fall off toward sand, dirt and rock; a wetness
  channel darkens sand at the water; rocks get a dirt and long-grass skirt from a "near a rock"
  channel. Things meet because they read the same map.

**3. One light, in one place.**
- Materials write linear HDR colour into a half-float target; tone mapping happens once in the
  post chain (today each material tone-maps itself, which is why the haze and the sky had to be
  matched by hand).
- One shared lighting chunk for every material: sun, sky ambient from the same sky model that
  draws the sky, haze from the same model, shadows.
- Shadows as cascades (two or three, snapped to texels so they do not swim, far cascades updated
  every other frame). Blades receive and do not cast; under them the ground is darkened by the
  cache's density; rocks and later trees cast.
- Ambient occlusion at half resolution, plus contact shadows for rocks: this is what seats a
  rock in the grass.
- Write the materials as node materials (three's TSL): the same graph runs on WebGL2 today and
  on WebGPU later, where compute shaders can cull and compact instances on the GPU.

**4. One lens, as a post chain.**
- Half-resolution depth of field in two layers (far and near), the near layer spilling over
  sharp things; bokeh from bright pixels; then bloom, the glass's distortion and falloff, grain.
- The lens bench is the regression suite: nine masters, each with a frame-time target.

**Water and rocks, on top of that.** Water: its own pass reading the scene's colour and depth
(refraction, absorption by depth, foam where depth runs out), reflection from the sky model,
flow from the cache. Rocks: three or more shapes, large and small normal detail blended, moss
from occlusion and facing rather than paint, a blend into the ground at the base.

## What sun, sky, haze, wind and shadow will dissolve by themselves

| Held back | Dissolves |
| --- | --- |
| Sun and shadows | Rocks as props (A28, A75, A135, A180), the flat thicket (A60), the land without relief (A28, A40), part of the carpet look |
| Sky model | The hard horizon and its dark line, the tan slab (A40), the water as one sheet: it then mirrors a sky that changes from horizon to zenith (A28, A35, A50) |
| Haze from that sky | Scale and depth in every wide shot; the far hedge softens (A35, A50) |
| Cloud shadows | The carpet (A28): large moving shapes of light break it up |
| Wind | Ribbons standing still (A60), sameness of blades (A40); moving highlights also mask the bands between rings |

## What they will not dissolve

Detail by distance (A135, A180, the bands and hedges), the hard lines where things meet, the
river's kerb, the water at hand's scale (A100), the rock's texture and silhouette (A75), one of
everything, the blur's hard edges. These need sections 1, 2 and 4 above.

## Suggested order

1. Size-on-screen detail with scatter on the terrain's quadtree, and the governor (cause 1).
2. The cache as a clipmap with edge channels (cause 3).
3. The HDR target, shared lighting, sun, sky, haze, shadows, occlusion (cause 2).
4. Water pass, rock variety, blade species, wind (causes 4 and 5).
5. The post chain's two-layer blur and bokeh (cause 6).
