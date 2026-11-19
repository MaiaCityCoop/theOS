//! What drives the eye: the walker in the Game, the shot list in the Studio. Live, every frame; nothing is rendered
//! ahead.

use crate::camera::{self, Timeline, vfov};
use crate::world::Eye;
use crate::{Still, View};
use bevy::input::mouse::AccumulatedMouseMotion;
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

/// The walker of the Game: W A S D to move, the mouse (held) to look, Shift to run, E and Q to rise and sink.
#[derive(Resource)]
pub struct Walker {
    pub pos: Vec3,
    pub yaw: f32,
    pub pitch: f32,
}

pub fn plugin(app: &mut App) {
    let opened = std::fs::read_to_string(Path::new(FIRST_SHOTS)).ok().and_then(|t| Timeline::from_json(&t).ok());
    app.insert_resource(Studio::paused_at(opened.unwrap_or_else(|| camera::five_shots(1)), 0.0))
        .insert_resource(Walker { pos: Vec3::new(0.0, 1.6, 0.0), yaw: 0.0, pitch: -4.0 })
        .add_systems(Update, (walk.run_if(in_state(View::Game)), play.run_if(in_state(View::Studio))));
}

fn walk(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    mut walker: ResMut<Walker>,
    mut eye: Query<(&mut Transform, &mut Projection), With<Eye>>,
) {
    if buttons.pressed(MouseButton::Left) {
        walker.yaw += motion.delta.x * 0.15;
        walker.pitch = (walker.pitch - motion.delta.y * 0.15).clamp(-89.0, 89.0);
    }
    let (sy, cy) = walker.yaw.to_radians().sin_cos();
    let (ahead, right) = (Vec3::new(sy, 0.0, -cy), Vec3::new(cy, 0.0, sy));
    let axis = |a: KeyCode, b: KeyCode| (keys.pressed(a) as i32 - keys.pressed(b) as i32) as f32;
    let m = (ahead * axis(KeyCode::KeyW, KeyCode::KeyS) + right * axis(KeyCode::KeyD, KeyCode::KeyA)
        + Vec3::Y * axis(KeyCode::KeyE, KeyCode::KeyQ))
    .normalize_or_zero();
    let speed = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) { 18.0 } else { 4.0 };
    walker.pos += m * speed * time.delta_secs();
    walker.pos.y = walker.pos.y.max(0.3);
    let (sp, cp) = walker.pitch.to_radians().sin_cos();
    let cam = camera::Camera { pos: walker.pos, look: walker.pos + Vec3::new(sy * cp, sp, -cy * cp), mm: 35.0, roll: 0.0 };
    if let Ok((mut t, mut p)) = eye.single_mut() {
        aim(&cam, &mut t, &mut p);
    }
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
