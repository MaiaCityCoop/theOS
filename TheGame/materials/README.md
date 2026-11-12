# Materials

Every texture the world is drawn with: one file each in this folder, each a recipe the registry finds by its `uid`
(`src/core/registry.js`). A new material is a new file; nothing else changes.

| Field | What it is |
| --- | --- |
| `uid`, `type: 'material'` | its stable id (every reference to it is this) and what sort of recipe it is |
| `name`, `kind`, `about` | what it is (`kind`: one word, the list's line under its name) |
| `usedBy` | where the world uses it, in words |
| `swatch` | its colour at a glance, `[r, g, b]` |
| `bump` | how deep its relief reads: larger is flatter |
| `role` | optional: a part the engine asks for by name, not by file (`src/core/registry.js`: `byRole`): `'noise'` (the land's cloudy noise), `'billows'` (the clouds' field, the snow's clumps), `'rock'` (a rock's stone when its file names none), `'moss'` (what grows on a rock). Another file with that role takes the part over |
| `paint(uv)` | node code (TSL) that paints one tile of it from `uv` (0..1, tiling) and returns `{ h, col, rough }`, with the tiling noises of `src/materials/paint.js` |

`src/materials/bake.js` bakes every material into one layer of two texture arrays (albedo + height, normal +
roughness) at the start; a shader reads one by its recipe or uid: `tex.a(material, uv)`. Its version (registry.json)
is the BLAKE3 hash of its file.
