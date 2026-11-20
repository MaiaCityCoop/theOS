# App: theOS

The game on its own engine, in Rust on Bevy. Today it is day 1: one world, a flat green plane with a metre grid under
a flat, light sky (no sun, no light, no shadow yet), and a virtual camera to film it live. What came before the cut
is kept: the git tag `archived/2026-11-20-before-day-1`, and every version in theDB.

    cargo run                                       the app: the dashboard, the Game and the Studio
    cargo run -- --still <shots> <s> <out.png>      an agent's still: the camera of a shot list (a doc's id, or a file) at a time
    cargo run -- --gate <dir> [shots]               each shot of the timeline held: its frame time and a picture
    cargo run -- --navtest                          the navigation's self-test: every view opened and left by clicking
    cargo test --workspace                          the camera's, the lens's and theDB's tests

| File | What |
| --- | --- |
| `src/world.rs` | the world: the green plane and its grid (one shader doc), the sky's colour; its settings are a doc |
| `src/camera.rs` | the virtual camera: shots, eases, the curve through the keys, the lens |
| `src/contract.rs` | the eye and its lens (focal length, aperture, focus), put on the world's camera |
| `src/film.rs` | what aims the eye: the walker in the Game, the shot list in the Studio; the still, the gate |
| `src/views.rs` | the interface as docs: the dashboard, the bars, a view filmed |
| `src/ui.rs` | the interface's live parts and input: clicks, the frame time, the Studio's strip |
| `src/root.rs` | the root doc: every doc the engine uses, by id |
| `theDB/` | the store: docs, blobs, branches, source trees, proposals; the kernel's plugin interface |
| `theKERNEL/` | the one thing installed: it starts the engine theDB pins |

Everything the engine loads is a doc in theDB, reached from the root: the fonts, the grid's shader, the world's
settings, the stories timeline ("This is day 1"), the dashboard and the layers of each view.
