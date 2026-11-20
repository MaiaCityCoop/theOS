//! What drives the eye in the Studio: the shot list (the Game's and a place's eye is the rig, src/rig.rs). Live, every frame; nothing is rendered
//! ahead.

use crate::camera::{self, Timeline, vfov};
use crate::world::Eye;
use crate::{Still, View};
use bevy::prelude::*;
use bevy::render::view::screenshot::{Screenshot, save_to_disk};
use std::path::Path;

/// The Studio's film: the shot list, where the playhead is, and whether it plays.
#[derive(Resource)]
pub struct Studio {
    pub timeline: Timeline,
    pub time: f32,
    pub playing: bool,
    pub seed: u64,
}

impl Studio {
    pub fn paused_at(timeline: Timeline, time: f32) -> Self {
        Studio { timeline, time, playing: false, seed: 1 }
    }
    pub fn duration(&self) -> f32 {
        self.timeline.duration()
    }
    pub fn new_shots(&mut self) {
        self.seed += 1;
        self.timeline = camera::five_shots(self.seed);
        self.time = 0.0;
        self.playing = true;
    }
}

/// The kept shot list the Studio opens with.
pub const FIRST_SHOTS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/timelines/first-shots.json");

pub fn plugin(app: &mut App) {
    let opened = std::fs::read_to_string(Path::new(FIRST_SHOTS)).ok().and_then(|t| Timeline::from_json(&t).ok());
    app.insert_resource(Studio::paused_at(opened.unwrap_or_else(|| camera::five_shots(1)), 0.0))
        .add_systems(Update, play.run_if(in_state(View::Studio)));
}

fn play(time: Res<Time>, keys: Res<ButtonInput<KeyCode>>, mut studio: ResMut<Studio>, mut eye: Query<(&mut Transform, &mut Projection), With<Eye>>) {
    if keys.just_pressed(KeyCode::Space) {
        if studio.time >= studio.duration() {
            studio.time = 0.0;
        }
        studio.playing = !studio.playing;
    }
    if studio.playing {
        studio.time += time.delta_secs();
        if studio.time >= studio.duration() {
            studio.time = studio.duration();
            studio.playing = false;
        }
    }
    if let (Some(cam), Ok((mut t, mut p))) = (studio.timeline.at(studio.time), eye.single_mut()) {
        aim(&cam, &mut t, &mut p);
    }
}

/// Stands the eye where the camera is: its place, its aim, its roll, and its lens as the field of view.
pub fn aim(cam: &camera::Camera, t: &mut Transform, p: &mut Projection) {
    *t = Transform::from_translation(cam.pos).looking_at(cam.look, Vec3::Y);
    t.rotate_local_z(-cam.roll.to_radians());
    if let Projection::Perspective(pp) = p {
        pp.fov = vfov(cam.mm, pp.aspect_ratio);
    }
}

/// An agent's still: once the picture has settled, one screenshot of the window, then quit. The first run on a machine
/// compiles its shaders for a few seconds, so the picture is taken after 240 frames, not sooner.
pub fn take_still(mut commands: Commands, still: Res<Still>, mut frames: Local<u32>, mut exit: MessageWriter<AppExit>) {
    *frames += 1;
    if *frames == 240 {
        commands.spawn(Screenshot::primary_window()).observe(save_to_disk(still.out.clone()));
    }
    if *frames == 270 {
        exit.write(AppExit::Success);
    }
}
