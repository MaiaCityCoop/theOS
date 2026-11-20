//! NativeGame: the world on its first day, a green plain, filmed live by the virtual camera.
//!
//!     cargo run                                   the app: the dashboard, Game and Studio
//!     cargo run -- --still <shots.json> <s> <out.png>   an agent's still: the camera of a shot list at a time
//!     cargo run -- --shots <seed> <out.json>      five new shots from a seed, kept as a shot list
//!     cargo run -- --meadow <out.png> [hour]      measure the Meadow at 1080p for ten seconds, one picture, quit
//!     cargo run -- --bake-place [lat lon]         a real place's package (Mértola's by default), from open data
//!     cargo run -- --place-still <out.png> [km] [hour]  an agent's still of the real place, the map that many km across, at a solar hour

mod biome;
mod camera;
mod canopy;
mod dial;
mod film;
mod clouds;
mod grass;
mod impostor;
mod lawn;
mod library;
mod map;
mod meadow;
mod patches;
mod place;
mod rig;
mod sun;
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
    Place,
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
    if args.get(1).map(String::as_str) == Some("--bake-place") {
        let at: Vec<f64> = args[2..].iter().filter_map(|a| a.parse().ok()).collect();
        let site = if let [lat, lon] = at[..] { place::Site::around(lat, lon) } else { place::Site::mertola() };
        match place::bake(&site) {
            Ok(line) => println!("{line}"),
            Err(e) => eprintln!("the bake failed: {e}"),
        }
        return;
    }
    let place_still = (args.get(1).map(String::as_str) == Some("--place-still"))
        .then(|| Still { time: 0.0, out: args.get(2).expect("--place-still <out.png> [map km]").into() });
    let map_km: Option<f32> = args.get(3).and_then(|s| s.parse().ok());
    let hour: Option<f32> = args.get(4).and_then(|s| s.parse().ok());
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
            resolution: if still.is_some() || place_still.is_some() { (1280, 720).into() } else { (1440, 900).into() },
            resizable: still.is_none() && place_still.is_none(),
            ..default()
        }),
        ..default()
    })
    // the assets beside the code, however the binary is started: run directly (not by cargo), Bevy looked for them
    // beside the binary, found no shaders or fonts, and drew the world without grass, ground or text
    .set(AssetPlugin { file_path: concat!(env!("CARGO_MANIFEST_DIR"), "/assets").into(), ..default() }))
    .init_state::<View>()
    .add_plugins((world::plugin, film::plugin, meadow::plugin, wind::plugin, workshop::plugin, impostor::plugin, patches::plugin, lawn::plugin))
    .add_plugins((place::plugin, map::plugin, rig::plugin, sun::plugin, dial::plugin));
    if args.get(1).map(String::as_str) == Some("--shelf") {
        let dir: PathBuf = args.get(2).expect("--shelf <dir>").into();
        let _ = std::fs::create_dir_all(&dir);
        app.add_plugins(ui::plugin)
            .insert_resource(workshop::ShelfShots { dir })
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
    match (still, place_still) {
        (_, Some(still)) => {
            app.insert_resource(still).insert_state(View::Place).add_systems(Update, film::take_still);
            if let Some(km) = map_km {
                app.insert_resource(map::Start(km));
            }
            if let Some(hour) = hour {
                app.insert_resource(sun::Sun { day: sun::now().0, hour, elevation: 0.0, azimuth: 0.0, auto: false });
            }
        }
        (Some((timeline, still)), None) => {
            app.insert_resource(film::Studio::paused_at(timeline, still.time))
                .insert_resource(still)
                .insert_state(View::Studio)
                .add_systems(Update, film::take_still);
        }
        (None, None) => {
            app.add_plugins(ui::plugin);
            if args.get(1).map(String::as_str) == Some("--navtest") {
                app.add_systems(Update, ui::navtest);
            }
        }
    }
    app.run();
}
