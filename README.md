# Sandbox 8

One endless procedural land, drawn at 60 fps in a browser. Standalone: nothing here imports from
the rest of the repository. `bun run dev`, then http://localhost:5173.

- `/` walk the world (click, W A S D, Shift runs, F flies)
- `/timeline.html` a kept film of camera moves, played live in the world
- `/lenses.html` the lens bench: the live world through each lens of the kit

`DEVLOG.md` is the history, a cycle at a time with its commit. `LENS-REVIEW.md` is what is still
wrong and the plan against it. `cine/README.md` is the virtual camera's manual.

## How the source is laid out

Each folder has one job. A new thing goes where its job is; nothing reaches across except through
the files named here.

| Folder | Its job | Extend it by |
| --- | --- | --- |
| `src/world/` | The land as functions of a place: height, river, what grows where. Once in JS (`land.js`, for feet and cameras) and once in GLSL (`land.glsl.js`, for the GPU), constant for constant. `light.glsl.js`: the light every material shares. Imported everywhere through `src/world.js`. | a new field of the land: a function in both files |
| `src/core/` | What everything shares: the uniforms (`uniforms.js`), the frustum (`frustum.js`), the governor (`governor.js`: frame budget in, detail and pixels out), the readout (`hud.js`). | a new shared uniform; a new dial for the governor |
| `src/materials/` | The ground's textures, painted once at start by the GPU (`bake.js`). | a new material: a `MAT` case |
| `src/terrain/` | The ground and the water: a quadtree of one shared tile (`terrain.js`), their shaders apart (`terrain.glsl.js`, `water.glsl.js`). | a new ground layer in the fragment shader |
| `src/scatter/` | What stands on the land. `assets.js` is the table (each asset: its kind, its particulars, its tiers). `tier.js` draws one tier as one instanced call over the patches the frustum touches. `ground.js` is the map of the ground the tiers read. `grass.js`, `rocks.js` are the kinds. `index.js` builds every asset of the table. | a new plant or rock: a row in `assets.js`; a new sort of thing: a kind module, named in `index.js` |
| `src/camera/` | The walker (`walk.js`) and the lens's picture (`post.js`: depth of field, the glass). | a new post effect in the lens's pass |
| `cine/` | The virtual camera, outside the game: it needs only `window.__s8.camera` and `src/world.js`. Lenses, timelines, the composer, the bench. | see `cine/README.md` |

`src/main.js` only wires these and runs the frame: place the camera, let the governor name the
detail, choose what to draw (ground map, terrain nodes, scatter patches), draw.

## The one law of detail

Every range of detail is written in metres as the walker's 68° lens sees them. A longer lens
shows a thing larger; the governor turns that into a factor (`detail ×` in the readout) and every
range is stretched by it: terrain levels, blade tiers, rock tiers, the ground map's reach. So a
thing is drawn at the detail its size in the picture asks for, whatever the lens. The factor is
capped by the frame's budget: the readout shows `×2.4 of ×9.1` when the lens asks for more than
the frame can pay.
