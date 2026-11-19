# NativeGame

The new game on its own engine, in Rust on Bevy: a food forest grown from recipes, on land taken from real places.
It stands beside [`TheGame/`](../TheGame/README.md), which keeps running.

Today it is day one: a green plain, and a virtual camera to film it live.

    cargo run                                          the app: the dashboard, Game and Studio
    cargo run -- --still <shots.json> <s> <out.png>    an agent's still: one screenshot of a shot list at a time
    cargo run -- --shots <seed> <out.json>             five new shots from a seed, kept as a shot list
    cargo test                                         the camera's tests

| File | What |
| --- | --- |
| `src/camera.rs` | the virtual camera: shots, eases, the curve through the keys, the lens kit; five shots from a seed |
| `src/film.rs` | what aims the eye: the walker in the Game, the shot list in the Studio; the still |
| `src/world.rs` | the world: the green plane with its mottle, the sky, the haze, the light |
| `src/ui.rs` | the interface in theOS's look: the dashboard, the Game's help, the Studio's strip |
| `timelines/` | kept shot lists, in the legacy timeline's format |
| `assets/fonts/` | DM Serif Display, DM Sans, DM Mono (OFL) |

The first build compiles Bevy and takes a long while; later builds take seconds. Why it is built this way:
[intent 0045](../Intents/0045-a-food-forest-in-rust.md) (the research) and
[intent 0046](../Intents/0046-the-studio-and-its-camera.md) (this step).
