# Biomes

What lies and grows on each kind of land: one file each in this folder, each a recipe the registry finds by its `uid`
(`src/core/registry.js`).

| Field | What it is |
| --- | --- |
| `uid`, `type: 'biome'` | its stable id and what sort of recipe it is |
| `name`, `kind`, `about` | what it is (`kind`: one word, the list's line under its name) |
| `where({ p, dist, d, w, b })` | where it lies, 0..1: node code (TSL) with the noises of `src/world/noise.nodes.js`; `p` the point, `dist` the lens's distance to it, `d`, `w`, `b` the river there (how far from its middle, its half-width, which bank: > 0 a bend's outside), `B` the point bent (`world/outlines.js`): a rule built on a slow noise reads `B`, not `p`, and turns its finer noises (`turned`), so it does not come out in blocks along the noise's grid; its mirror in JS, if anything asks in JS, in `src/world/land.js` |
| `layer` | the order biomes are laid in, lowest first; one with grass is laid under the grass's carpet, one without over it |
| `base: true` | the land's own: under every other biome, everywhere; its `patches` (bare patches, paths) and `slopes` (with their own `layer`) |
| `water: true` | the water itself, drawn over the river's bed; `river: true`: it lies by the river (in the river's own sandbox it keeps to that river) |
| `laid` | where it lies, in words (the library's card) |
| `mix` | how much of its ground shows where it lies fully (the gravel bar: 0.75, a mix over the sand) |
| `floor` | its ground: `{ material (a material's uid), tile (metres a tile) }` |
| `patches`, `spots`, `slopes` | more grounds within it, the same way; `spots` bring a `where({ p, … })` of their own, and may be let go far off (`fade: [metres, metres]`) |
| `grass` | its grass, or `null`: `{ cover, height, colours, tufts, flowers, carpet (a material's uid) }`; `coverAt({ p, … })`: its cover place by place (node code), where it is not one number (the pine forest: its glades) |
| `stones` | how many stones lie on it: the chance of one in a stone's cell |
| `colours` | its own colours where it needs them (the river's) |
| `groves` | where what grows on it is thick and where it opens: `{ clumps, patches }`, metres across its groves and glades and across the patches where one kind of tree or another leads, at the size of a grown tree. What grows there is placed by the one rule (`src/scatter/rule.js`: a plant's file names the biome, its `cover`, its `light` and what it lies `under`); each smaller layer clumps at its own scale |
| `age` | how old its stands are, `[years, years]`: a slow noise between them gives each grown tree its age; its saplings are placed young, where the light comes through to their kind's litter |
| `understory` | far off, where its bushes have sunk away, the land wears this colour as thick as they grow: `{ colour, fill, grain }` (`fill`: how much of a cell a bush covers; `grain`: a bush's size to a tree's). So nothing planted ever drops out of the picture |
| `canopy` | a biome with grown trees: past where their shadows are drawn its floor is dimmed under its groves, and far off, where its trees sink away, its land takes the colour of their crowns: `{ colour, from, to }` (from/to in metres only where no tree of it says where its trees end) |

A new biome is a new file: the terrain, the grass, the stones and the library take it from the registry, laid where its
rule says. Its rules are worked out by the GPU once for a stretch of land, into the land's layer map round the camera
(`src/terrain/layers.js`, intent 0038 stage 6a): the land's own shader is one size whatever the biomes, and reads the
map. The land's node code reads these numbers: change one and the world changes with it. Its version (registry.json) is
the BLAKE3 hash of its file and of the versions of the materials it lays.
