//! What drives the eye: the walker in the Game, the shot list in the Studio. Live, every frame; nothing is rendered
//! ahead.

use crate::camera::{self, Timeline, vfov};
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
    /// Opens a kept shot list from `timelines/` and plays it from the start.
    pub fn open(&mut self, path: &str) {
        if let Some(t) = std::fs::read_to_string(path).ok().and_then(|t| Timeline::from_json(&t).ok()) {
            self.timeline = t;
            self.time = 0.0;
            self.playing = true;
        }
    }
}

/// The kept shot list the Studio opens with.
pub const FIRST_SHOTS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/timelines/first-shots.json");
/// The Meadow's storytelling anchors: the same four shots at every stage of the scene.
pub const ANCHORS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/timelines/meadow-anchors.json");

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
        .add_observer(capture)
        .add_systems(Update, (walk.run_if(|v: Res<State<View>>| matches!(v.get(), View::Game | View::Meadow)), play.run_if(in_state(View::Studio))));
}

/// The walker's eye height range: a blade's height above the ground up to 12 km, as the legacy game's camera.
const LOWEST: f32 = 0.1;
const HIGHEST: f32 = 12_000.0;

#[allow(clippy::too_many_arguments)]
fn walk(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<bevy::input::mouse::AccumulatedMouseScroll>,
    cursor: Query<&bevy::window::CursorOptions>,
    mut walker: ResMut<Walker>,
    mut eye: Query<(&Camera, &mut Transform, &mut Projection), With<Camera3d>>,
) {
    // look: with the mouse captured (click into the world), or while a button is held
    let captured = cursor.iter().any(|c| c.grab_mode != bevy::window::CursorGrabMode::None);
    if captured || buttons.pressed(MouseButton::Left) {
        walker.yaw += motion.delta.x * 0.12;
        walker.pitch = (walker.pitch - motion.delta.y * 0.12).clamp(-89.0, 89.0);
    }
    // rise and sink: each notch of the wheel multiplies the eye's height, so a few take it from the grass to 12 km
    let notches = match scroll.unit {
        bevy::input::mouse::MouseScrollUnit::Line => scroll.delta.y,
        bevy::input::mouse::MouseScrollUnit::Pixel => scroll.delta.y / 40.0,
    };
    if notches != 0.0 {
        walker.pos.y = (walker.pos.y * 1.18f32.powf(-notches)).clamp(LOWEST, HIGHEST);
    }
    let (sy, cy) = walker.yaw.to_radians().sin_cos();
    let (ahead, right) = (Vec3::new(sy, 0.0, -cy), Vec3::new(cy, 0.0, sy));
    let axis = |a: KeyCode, b: KeyCode| (keys.pressed(a) as i32 - keys.pressed(b) as i32) as f32;
    let m = (ahead * axis(KeyCode::KeyW, KeyCode::KeyS) + right * axis(KeyCode::KeyD, KeyCode::KeyA)
        + Vec3::Y * axis(KeyCode::KeyE, KeyCode::KeyQ))
    .normalize_or_zero();
    // walking pace at eye height, faster the higher the eye, as a flight over the land would feel
    let run = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) { 4.5 } else { 1.0 };
    let speed = 4.0 * run * (walker.pos.y / 1.6).max(1.0).powf(0.9);
    walker.pos += m * speed * time.delta_secs();
    walker.pos.y = walker.pos.y.clamp(LOWEST, HIGHEST);
    let (sp, cp) = walker.pitch.to_radians().sin_cos();
    let cam = camera::Camera { pos: walker.pos, look: walker.pos + Vec3::new(sy * cp, sp, -cy * cp), mm: 35.0, roll: 0.0 };
    for (c, mut t, mut p) in &mut eye {
        if c.is_active {
            aim(&cam, &mut t, &mut p);
        }
    }
}

/// A click into the world (not on the interface) captures the mouse for looking; Escape lets it go.
pub fn capture(press: On<bevy::picking::events::PointerPress>, windows: Query<(), With<Window>>, mut cursor: Query<&mut bevy::window::CursorOptions>, state: Res<State<View>>) {
    if windows.get(press.entity).is_err() || !matches!(state.get(), View::Game | View::Meadow) {
        return;
    }
    for mut c in &mut cursor {
        c.grab_mode = bevy::window::CursorGrabMode::Locked;
        c.visible = false;
    }
}

fn play(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut studio: ResMut<Studio>,
    mut hour: ResMut<crate::meadow::Hour>,
    mut wind: ResMut<crate::wind::Strength>,
    mut eye: Query<(&Camera, &mut Transform, &mut Projection), With<Camera3d>>,
) {
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
    let Some(cam) = studio.timeline.at(studio.time) else { return };
    // the shot's own hour and wind, where it gives them (a value, or [from, to] across the shot)
    if let Some((i, q)) = studio.timeline.shot_at(studio.time) {
        let shot = &studio.timeline.clips[i];
        if let Some(h) = &shot.hour {
            hour.0 = h.at(q);
        }
        if let Some(w) = &shot.wind {
            wind.0 = w.at(q);
        }
    }
    for (c, mut t, mut p) in &mut eye {
        if c.is_active {
            aim(&cam, &mut t, &mut p);
        }
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
