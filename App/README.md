# App: theOS

The new game on its own engine, in Rust on Bevy: a food forest grown from recipes, on land taken from real places.
It stands beside [`TheGame/`](../TheGame/README.md), which keeps running.

Today it is day one: a green plain, and a virtual camera to film it live.

    cargo run                                          the app: the dashboard, Game and Studio
    cargo run -- --still <shots.json> <s> <out.png>    an agent's still: one screenshot of a shot list at a time
    cargo run -- --shots <seed> <out.json>             five new shots from a seed, kept as a shot list
    cargo run -- --bake-place [lat lon]                a real place's package (Mértola's by default), from open elevation and land cover
    cargo run -- --place-still <out.png> [km]          an agent's still of the real place, the map that many km across
    cargo test                                         the camera's tests

| File | What |
| --- | --- |
| `src/camera.rs` | the virtual camera: shots, eases, the curve through the keys, the lens kit; five shots from a seed |
| `src/film.rs` | what aims the eye: the walker in the Game, the shot list in the Studio; the still |
| `src/world.rs` | the world: the green plane with its mottle, the sky, the haze, the light |
| `src/place.rs` | a real place: the bake from Copernicus GLO-30 and ESA WorldCover, the terrain, its trees, the ground under the walker |
| `src/rig.rs` | the Game's and a place's camera, TheGame's rig: one height on the wheel, from the eyes to 12 km |
| `src/canopy.rs` | the measured trees: Meta and WRI's 1 m canopy height, read by range requests, a tree at each crown's top |
| `src/sun.rs` | the real sun for the place, the day and the hour: light, sky, haze, shadows; [ and ] move the hours |
| `src/dial.rs` | the sun's dial, as TheGame's weather panel: a pill at the top that opens to set the time (with Auto) and the date |
| `src/map.rs` | the round map: its layers baked from the site, the region and Natural Earth; zoom, the walker, click to jump |
| `assets/places/mertola/` | the baked package: 6 by 6 km around Mértola, Alentejo, with its 40 km region and land masks, 1 MB, with its credits |
| `src/ui.rs` | the interface in theOS's look: the dashboard, the Game's help, the Studio's strip |
| `timelines/` | kept shot lists, in the legacy timeline's format |
| `assets/fonts/` | DM Serif Display, DM Sans, DM Mono (OFL) |

The first build compiles Bevy and takes a long while; later builds take seconds. Why it is built this way:
[intent 0045](../Intents/0045-a-food-forest-in-rust.md) (the research) and
[intent 0046](../Intents/0046-the-studio-and-its-camera.md) (this step).
