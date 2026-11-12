# TheGame

Sandbox 8: one endless procedural land, drawn at 60 fps in a browser, and a virtual film camera to
shoot it with. `bun run dev` in this folder, then http://localhost:5173.

- `/` walk the world (click, W A S D, Shift runs, F flies)
- `/timeline.html` a kept film of camera moves, played live in the world; `?story=<id>` plays an intent's story (`../Stories/<id>/timeline.json`) with its captions
- `/lenses.html` the lens bench: the live world through each lens of the kit

Work on it is tracked as intents (`../Intents/`). `LENS-REVIEW.md` is what is still wrong in the
picture and the plan against it. `cine/README.md` is the virtual camera's manual.

## How the source is laid out

Each folder has one job. A new thing goes where its job is; nothing reaches across except through
the files named here.

| Folder | Its job | Extend it by |
| --- | --- | --- |
| `materials/`, `biomes/`, `assets/` | The recipes: every texture, every kind of land, every made thing, one file each, found by the registry (`src/core/registry.js`) by its `uid`. `assets/kinds.js`: what an asset gets from its kind. `assets/kit/tree.js`: what every tree file builds with. | a new file (see Plug-ins below) |
| `world/` | The world's data: where the named places are (`places.js`), the sky's year and light (`sky.js`), each weather condition's numbers (`clouds.js`, `wind.js`, `snowfall.js`). | a number changed, a place added |
| `src/world/` | The land as functions of a place: height, river, what grows where. Once in JS (`land.js`, for feet and cameras) and once as node code (`land.nodes.js`, for the GPU), constant for constant. `light.js`: the shading contract every material reads (sun, sky light, the air, the weather, shadows, the hand-over between levels). `sky.js` the hour's light and the dome, its bodies in `sky/`; `weather/` the conditions; `shadow.js` the shadow map; `place.js` stands a made thing; `solids.js`, `trunks.js` what can't be walked through. | a new field of the land: a function in both land files |
| `src/core/` | What everything shares: the registry (`registry.js`), the uniforms (`uniforms.js`, node uniforms every material reads), the frustum (`frustum.js`), the governor (`governor.js`: 60 fps is the gate; late frames in, detail and pixels out), the readout (`hud.js`). | a new shared uniform |
| `src/materials/` | The world's textures, painted once at start by the GPU into one texture array (`bake.js`), with the tiling noises the painters use (`paint.js`); the library's previews (`preview.js`). | a new material: a file in `materials/` |
| `src/terrain/` | The ground and the water: a quadtree of one shared tile (`terrain.js`), their materials (`material.js`, `water.js`). | a biome's own fields; a new ground layer in `material.js` |
| `src/scatter/` | What stands on the land: every asset placed `at: 'scatter'`, drawn by its engine (`grass.js`, `rocks.js`, `trees.js`; `index.js` finds them). `tier.js` draws a tier as instanced calls over the patches the view touches, packed by a compute pass; `view.js` drops what stands outside the view; `ground.js` is the map of the ground the tiers read. | a new plant, rock or tree: a file in `assets/`; a new sort of thing: an engine module here |
| `src/detail/` | Levels of detail by size on screen (`index.js`), and far cards (`impostor.js`). | an asset's own `detail` block |
| `src/camera/` | The one camera (`rig.js`), the walker (`walk.js`), touch (`touch.js`), and the lens's picture (`post.js`: depth of field, the glass). | a new post effect in the lens's pass |
| `cine/` | The virtual camera, outside the game: it needs only `window.__s8.camera` and `src/world/land.js`. Lenses, timelines, the composer, the bench. | see `cine/README.md` |

Drawn by three's `WebGPURenderer` (WebGL 2 where WebGPU is missing; `?webgl` forces it). Every material is node
code (TSL, `three/tsl`): three writes WGSL for WebGPU and GLSL for the fallback from the same nodes. There is no
hand-written shader text in the game.

`src/main.js` only wires these and runs the frame: place the camera, let the governor name the
detail, choose what to draw (ground map, terrain nodes, scatter patches), draw.

## Plug-ins: a new thing is a new file

Every moving piece is found by itself (a glob, never a list kept by hand) and speaks through one interface. Nothing
below needs an edit to an engine's code.

| A new… | Is | Its interface is written in |
| --- | --- | --- |
| material | a file in `materials/`: `{ uid, type: 'material', paint(uv) -> { h, col, rough }, … }`; a `role` (`'noise'`, `'billows'`, `'rock'`, `'moss'`) if it plays a part the engine asks for by name | `materials/README.md` |
| biome | a file in `biomes/`: where it lies (`where`, node code), its floor, its grass, its stones, its far canopy | `biomes/README.md` |
| made thing | a file in `assets/`: its size, its levels of detail, where it is placed; what it leaves out its kind gives (`assets/kinds.js`: `kindOf`, `kindRule`) | `assets/index.js` |
| tree | a file in `assets/` built with the tree kit: its growth by age (`growth: { years, form, height }`), `grow` (with the kit's `crown()` for limbs and foliage), `shade`, two materials (its bark, a sprig of its leaves); its `placement` says its biome, whose stand it joins (`trees` in the biome's file: cells, groves, ages), its share of that stand, its seed. The stone pine and the holm oak are the two to copy from | `assets/kit/tree.js` |
| sort of scattered thing | a module in `src/scatter/` exporting `engine = { id, row, create, thumb, stage, frame }` | `src/scatter/index.js` |
| weather condition | a file in `src/world/weather/`: its value on the panel, kept, filmed per shot; what it adds to the shared lanes (`wet`, `fog`, `dim`); what it does to a surface (`surface`), draws into the sky (`sky`), draws before the frame (`before`) | `src/world/weather/index.js` |
| body in the sky | a file in `src/world/sky/`: `{ id, order, draw({ v, y, s, col, D }), update? }` | `src/world/sky.js` |
| named place | a line in `world/places.js`: an asset's uid, where it stands | `world/places.js` |

The light's contract (`src/world/light.js`) is the one door for materials: a material asks it for the sun, the sky's
light, the air, the shadows and the weather (`weathered`, `weatherOn`, and each condition's own nodes handed on:
`snowDepth`, `windAt`, `cloudShade`), and never reads a condition's uniform by name.

## The one law of detail

Every range of detail is written in metres as the walker's 68° lens sees them. A longer lens
shows a thing larger; the governor turns that into a factor (`detail ×` in the readout) and every
range is stretched by it: terrain levels, blade tiers, rock tiers, the ground map's reach. So a
thing is drawn at the detail its size in the picture asks for, whatever the lens. The factor is
capped by the frame's budget: the readout shows `×2.4 of ×9.1` when the lens asks for more than
the frame can pay.
