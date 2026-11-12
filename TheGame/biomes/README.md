# Biomes

What lies and grows on each kind of land: one file each in this folder, each a recipe the registry finds by its `uid`
(`src/core/registry.js`).

| Field | What it is |
| --- | --- |
| `uid`, `type: 'biome'` | its stable id and what sort of recipe it is |
| `name`, `kind`, `about` | what it is (`kind`: one word, the list's line under its name) |
| `where({ p, dist, d, w, b })` | where it lies, 0..1: node code (TSL) with the noises of `src/world/noise.nodes.js`; `p` the point, `dist` the lens's distance to it, `d`, `w`, `b` the river there (how far from its middle, its half-width, which bank: > 0 a bend's outside) |
| `layer` | the order biomes are laid in, lowest first; one with grass is laid under the grass's carpet, one without over it |
| `base: true` | the land's own: under every other biome, everywhere; its `patches` (bare patches, paths) and `slopes` (with their own `layer`) |
| `water: true` | the water itself, drawn over the river's bed; `river: true`: it lies by the river (in the river's own sandbox it keeps to that river) |
| `laid` | where it lies, in words (the library's card) |
| `mix` | how much of its ground shows where it lies fully (the gravel bar: 0.75, a mix over the sand) |
| `floor` | its ground (`spots` may bring a `where` of their own): `{ material (a material's uid), tile: [metres, metres] }` |
| `patches`, `spots`, `slopes` | more grounds within it, the same way |
| `grass` | its grass, or `null`: `{ cover, height, colours, tufts, flowers, carpet (a material's uid) }`; `coverAt({ p, … })`: its cover place by place (node code), where it is not one number (the pine forest: its glades) |
| `stones` | how many stones lie on it: the chance of one in a stone's cell |
| `colours` | its own colours where it needs them (the river's) |
| `trees` | its stand of trees, the same for every kind of tree that grows there (a tree's file names the biome, its `share` of the stand's cells, and its `litter`, the ground under it where it leads: `assets/kit/tree.js`): `{ cell (metres: one tree at most in each), density, clumps (metres across its groves and glades), patches (metres across the places where one kind or another leads), age: { stand: [years, years], young, min }, seed }` |
| `canopy` | a biome with a stand: past where its trees' shadows are drawn its floor is dimmed under its groves, and far off, where its trees sink away, its land takes the colour of their crowns: `{ colour, from, to }` (from/to in metres only where no tree of it says where its trees end) |

A new biome is a new file: the terrain, the grass, the stones and the library take it from the registry, laid where its
rule says. The land's node code reads these numbers: change one and the world changes with it. Its version (registry.json) is
the BLAKE3 hash of its file and of the versions of the materials it lays.
