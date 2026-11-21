//! theOS on day 1: one world, a flat green plane with grid lines under a flat sky, filmed live by the virtual camera.
//!
//!     cargo run                                       the app: the dashboard, the Game and the Studio
//!     cargo run -- --still <shots> <s> <out.png>      an agent's still: the camera of a shot list (a doc's id, or a file) at a time
//!     cargo run -- --gate <dir> [shots]               each shot of the timeline (or of a shot list) held: its frame time and a picture
//!     cargo run -- --navtest                          the navigation's self-test: every view opened and left by clicking
//!                                                     (NAVTEST_SHOTS=<dir>: a picture at each step)

mod camera;
mod contract;
mod film;
mod module;
mod pill;
mod root;
mod setup;
mod theme;
mod thedb_view;
mod ui;
mod views;
mod world;

use bevy::prelude::*;
use std::path::PathBuf;

/// The views of the app.
#[derive(States, Default, Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum View {
    #[default]
    Home,
    Game,
    Studio,
    /// theDB's docs and blobs, read only (`thedb_view.rs`).
    TheDB,
    /// The first start of a store without a master: its key made and shown once (`setup.rs`).
    Setup,
}

/// The store, one for the app: theDB beside this repository (or where `THEDB` says).
pub fn db() -> std::sync::Arc<thedb::TheDB> {
    static DB: std::sync::OnceLock<std::sync::Arc<thedb::TheDB>> = std::sync::OnceLock::new();
    DB.get_or_init(|| {
        let dir = std::env::var("THEDB").map(Into::into).unwrap_or_else(|_| thedb::TheDB::here());
        std::sync::Arc::new(thedb::TheDB::open(dir).expect("theDB opens"))
    })
    .clone()
}

/// Set when the app runs only to take one still for an agent: no interface, one picture, then it quits.
#[derive(Resource, Clone)]
pub struct Still {
    pub time: f32,
    pub out: PathBuf,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mode = args.get(1).map(String::as_str);
    let still = (mode == Some("--still")).then(|| {
        let usage = "--still <shots> <seconds> <out.png>";
        let timeline = film::shots(args.get(2).expect(usage)).expect("the shot list reads and parses");
        (timeline, Still { time: args.get(3).and_then(|s| s.parse().ok()).expect(usage), out: args.get(4).expect(usage).into() })
    });

    let mut app = App::new();
    // everything the engine loads comes from theDB (intent 0049): an asset's path is a doc's id, watched, so a new
    // version of a shader reloads while the app runs; `blob://<hash>` is a blob or a doc's exact version
    {
        use bevy::asset::{AssetApp, io::AssetSourceId};
        app.register_asset_source(AssetSourceId::Default, thedb::bevy::docs_source(db()))
            .register_asset_source("blob", thedb::bevy::blobs_source(db()));
    }
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "theOS".into(),
            resolution: if still.is_some() { (1280, 720).into() } else { (1440, 900).into() },
            resizable: still.is_none(),
            ..default()
        }),
        ..default()
    })
    .set(AssetPlugin { watch_for_changes_override: Some(true), ..default() }))
    .init_state::<View>()
    .add_plugins((contract::plugin, world::plugin, film::plugin, views::plugin));
    if mode == Some("--gate") {
        let dir: PathBuf = args.get(2).expect("--gate <dir> [shots]").into();
        let _ = std::fs::create_dir_all(&dir);
        let timeline = film::shots(args.get(3).map(String::as_str).unwrap_or(film::timeline())).expect("the shot list reads and parses");
        app.insert_resource(film::Studio::paused_at(timeline, 0.0))
            .insert_resource(film::Gate { dir })
            .insert_state(View::Studio)
            .add_systems(Update, film::gate);
    } else if let Some((timeline, still)) = still {
        app.insert_resource(film::Studio::paused_at(timeline, still.time))
            .insert_resource(still)
            .insert_state(View::Studio)
            .add_systems(Update, film::take_still);
    } else {
        app.add_plugins((ui::plugin, thedb_view::plugin, setup::plugin, pill::plugin));
        if mode == Some("--navtest") {
            app.add_systems(Update, ui::navtest);
        }
    }
    // the exit's code is the process's: 75 tells the kernel to start the build a person has just accepted
    if let AppExit::Error(code) = app.run() {
        std::process::exit(code.get() as i32);
    }
}
