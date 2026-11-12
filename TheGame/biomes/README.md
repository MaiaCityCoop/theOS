# Biomes

What lies and grows on each kind of land: one file each in this folder, each a recipe the registry finds by its `uid`
(`src/core/registry.js`).

| Field | What it is |
| --- | --- |
| `uid`, `type: 'biome'` | its stable id and what sort of recipe it is |
| `name`, `kind`, `about` | what it is (`kind`: one word, the list's line under its name) |
| `where` | which of the land's places lays it: `land` (everywhere else), `arid`, `bank`, `water`, `cutbank` (a bend's steep outside), `bar` (a bend's gentle inside); the places are the land's masks (`src/world/land.nodes.js`) |
| `floor` | its ground: `{ material (a material's uid), tile: [metres, metres] }` |
| `patches`, `spots`, `slopes` | more grounds within it, the same way |
| `grass` | its grass, or `null`: `{ cover, height, colours, tufts, flowers, carpet (a material's uid) }` |
| `stones` | how many stones lie on it: the chance of one in a stone's cell |
| `colours` | its own colours where it needs them (the river's) |

The land's node code reads these numbers: change one and the world changes with it. Its version (registry.json) is
the BLAKE3 hash of its file and of the versions of the materials it lays.
