//! NativeGame: the world on its first day, a green plain, filmed live by the virtual camera.
//!
//!     cargo run                                   the app: the dashboard, Game and Studio
//!     cargo run -- --still <shots.json> <s> <out.png>   an agent's still: the camera of a shot list at a time
//!     cargo run -- --shots <seed> <out.json>      five new shots from a seed, kept as a shot list
//!     cargo run -- --meadow <out.png> [hour]      measure the Meadow at 1080p for ten seconds, one picture, quit

mod biome;
mod camera;
mod film;
mod clouds;
mod grass;
mod impostor;
mod library;
mod meadow;
mod patches;
mod terrain;
mod ui;
mod wind;
mod workshop;
mod world;

use bevy::prelude::*;
use std::path::PathBuf;

/// The views of the app.
#[derive(States, Default, Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum View {
    #[default]
    Home,
    Studio,
    Meadow,
    Library,
}

/// Set when the app runs only to take one still for an agent: no interface, one picture, then it quits.
#[derive(Resource, Clone)]
pub struct Still {
    pub time: f32,
    pub out: PathBuf,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--shots") {
        let seed: u64 = args.get(2).and_then(|s| s.parse().ok()).expect("--shots <seed> <out.json>");
        let json = serde_json::to_string_pretty(&camera::five_shots(seed)).unwrap();
        std::fs::write(args.get(3).expect("--shots <seed> <out.json>"), json + "\n").expect("the shot list writes");
        return;
    }
    let still = (args.get(1).map(String::as_str) == Some("--still")).then(|| {
        let usage = "--still <shots.json> <seconds> <out.png>";
        let shots = std::fs::read_to_string(args.get(2).expect(usage)).expect("the shot list reads");
        let timeline = camera::Timeline::from_json(&shots).expect("the shot list parses");
        (timeline, Still { time: args.get(3).and_then(|s| s.parse().ok()).expect(usage), out: args.get(4).expect(usage).into() })
    });

    let measure = (args.get(1).map(String::as_str) == Some("--meadow")).then(|| {
        let hour = args.get(3).and_then(|h| h.parse().ok()).unwrap_or(18.5);
        (meadow::Measure { out: args.get(2).expect("--meadow <out.png> [hour]").into() }, meadow::Hour(hour))
    });

    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "NativeGame".into(),
            resolution: if still.is_some() { (1280, 720).into() } else { (1440, 900).into() },
            resizable: still.is_none(),
            ..default()
        }),
        ..default()
    }))
    .init_state::<View>()
    .add_plugins((world::plugin, film::plugin, meadow::plugin, wind::plugin, workshop::plugin, impostor::plugin, patches::plugin));
    if args.get(1).map(String::as_str) == Some("--shelf") {
        let dir: PathBuf = args.get(2).expect("--shelf <dir>").into();
        let _ = std::fs::create_dir_all(&dir);
        app.add_plugins(ui::plugin)
            .insert_resource(workshop::ShelfShots { dir })
            .insert_state(View::Library)
            .add_systems(Update, workshop::shelf_shots);
        app.run();
        return;
    }
    if args.get(1).map(String::as_str) == Some("--gate") {
        let dir: PathBuf = args.get(2).expect("--gate <dir>").into();
        let _ = std::fs::create_dir_all(&dir);
        let anchors = std::fs::read_to_string(film::ANCHORS).expect("the anchors read");
        let timeline = camera::Timeline::from_json(&anchors).expect("the anchors parse");
        app.insert_resource(film::Studio::paused_at(timeline, 0.0))
            .insert_resource(film::Gate { dir })
            .insert_state(View::Studio)
            .add_systems(Update, film::gate);
        app.run();
        return;
    }
    if let Some((m, hour)) = measure {
        app.insert_resource(m).insert_resource(hour).insert_state(View::Meadow).add_systems(Update, meadow::measure);
        app.run();
        return;
    }
    match still {
        Some((timeline, still)) => {
            app.insert_resource(film::Studio::paused_at(timeline, still.time))
                .insert_resource(still)
                .insert_state(View::Studio)
                .add_systems(Update, film::take_still);
        }
        None => {
            app.add_plugins(ui::plugin);
            if args.get(1).map(String::as_str) == Some("--navtest") {
                app.add_systems(Update, ui::navtest);
            }
        }
    }
    app.run();
}
