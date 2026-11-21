//! What drives the eye: the walker in the Game, the shot list in the Studio. Live, every frame; nothing is rendered
//! ahead.

use crate::camera::Timeline;
use crate::contract::{Eye, Lens, World};
use crate::{Still, View};
use bevy::input::mouse::AccumulatedMouseMotion;
use bevy::prelude::*;
use bevy::render::view::screenshot::{Screenshot, save_to_disk};

/// The Studio's film: the shot list, where the playhead is, and whether it plays.
#[derive(Resource)]
pub struct Studio {
    pub timeline: Timeline,
    pub time: f32,
    pub playing: bool,
}

impl Studio {
    pub fn paused_at(timeline: Timeline, time: f32) -> Self {
        Studio { timeline, time, playing: false }
    }
    pub fn duration(&self) -> f32 {
        self.timeline.duration()
    }
    /// Opens a shot list (a doc's id) and plays it from the start.
    pub fn open(&mut self, id: &str) {
        if let Some(t) = shots(id) {
            self.timeline = t;
            self.time = 0.0;
            self.playing = true;
        }
    }
}

/// The stories timeline: the shot list the Studio opens with, and the one the gate holds.
pub fn timeline() -> &'static str {
    &crate::root::root().timeline
}

/// A shot list: the theDB doc `id`, or else a file at that path (a list an agent wrote and passed on the command line).
pub fn shots(id: &str) -> Option<Timeline> {
    let bytes = crate::db().file(id).ok().flatten().or_else(|| std::fs::read(id).ok())?;
    Timeline::from_json(std::str::from_utf8(&bytes).ok()?).ok()
}

/// The walker of the Game: W A S D to move, the mouse (held) to look, Shift to run, E and Q to rise and sink.
#[derive(Resource)]
pub struct Walker {
    pub pos: Vec3,
    pub yaw: f32,
    pub pitch: f32,
}

/// What aims the eye, each frame; the world's camera and its ground follow after it.
#[derive(SystemSet, Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Aim;

pub fn plugin(app: &mut App) {
    // the walker starts in the middle of a 10 m square, between the grid's stronger lines
    app.insert_resource(Studio::paused_at(shots(timeline()).expect("the root's timeline reads and parses"), 0.0))
        .insert_resource(Walker { pos: Vec3::ZERO, yaw: 0.0, pitch: -4.0 })
        .add_systems(Startup, |module: Option<Res<crate::module::WorldModule>>, mut w: ResMut<Walker>| {
            if let Some(m) = module {
                w.pos = Vec3::new(m.start_x(), m.eye_height(), m.start_z());
            }
        })
        .add_observer(capture)
        .add_systems(Update, (choose_world, (walk.run_if(in_state(View::Game)), play.run_if(in_state(View::Studio))).in_set(Aim)));
}

/// The walker's eye height range: just above the grid's lines up to 12 km, as the legacy game's camera.

#[allow(clippy::too_many_arguments)]
fn walk(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<bevy::input::mouse::AccumulatedMouseScroll>,
    cursor: Query<&bevy::window::CursorOptions>,
    mut walker: ResMut<Walker>,
    mut eye: ResMut<Eye>,
    module: Option<Res<crate::module::WorldModule>>,
) {
    // look: with the mouse captured (click into the world), or while a button is held
    let captured = cursor.iter().any(|c| c.grab_mode != bevy::window::CursorGrabMode::None);
    if captured || buttons.pressed(MouseButton::Left) {
        walker.yaw += motion.delta.x * 0.12;
        walker.pitch = (walker.pitch - motion.delta.y * 0.12).clamp(-89.0, 89.0);
    }
    // how one moves is the world module's: its pace, its limits, its lens; theOS only maps the keys and the mouse
    let Some(m) = module else { return };
    let (lowest, highest) = (m.lowest(), m.highest());
    let notches = match scroll.unit {
        bevy::input::mouse::MouseScrollUnit::Line => scroll.delta.y,
        bevy::input::mouse::MouseScrollUnit::Pixel => scroll.delta.y / 40.0,
    };
    if notches != 0.0 {
        walker.pos.y = (walker.pos.y * m.rise_per_notch().powf(-notches)).clamp(lowest, highest);
    }
    let (sy, cy) = walker.yaw.to_radians().sin_cos();
    let (ahead, right) = (Vec3::new(sy, 0.0, -cy), Vec3::new(cy, 0.0, sy));
    let axis = |a: KeyCode, b: KeyCode| (keys.pressed(a) as i32 - keys.pressed(b) as i32) as f32;
    let dir = (ahead * axis(KeyCode::KeyW, KeyCode::KeyS) + right * axis(KeyCode::KeyD, KeyCode::KeyA) + Vec3::Y * axis(KeyCode::KeyE, KeyCode::KeyQ)).normalize_or_zero();
    let running = keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
    let speed = m.walk_speed(walker.pos.y, running);
    walker.pos += dir * speed * time.delta_secs();
    walker.pos.y = walker.pos.y.clamp(lowest, highest);
    let (sp, cp) = walker.pitch.to_radians().sin_cos();
    let at = walker.pos;
    *eye = Eye { pos: at, look: at + Vec3::new(sy * cp, sp, -cy * cp), roll: 0.0, lens: Lens { mm: m.lens_mm(), ..default() } };
}

/// A click into the world (not on the interface) captures the mouse for looking; Escape lets it go.
pub fn capture(press: On<bevy::picking::events::PointerPress>, windows: Query<(), With<Window>>, mut cursor: Query<&mut bevy::window::CursorOptions>, state: Res<State<View>>) {
    if windows.get(press.entity).is_err() || *state.get() != View::Game {
        return;
    }
    for mut c in &mut cursor {
        c.grab_mode = bevy::window::CursorGrabMode::Locked;
        c.visible = false;
    }
}

fn play(time: Res<Time>, keys: Res<ButtonInput<KeyCode>>, mut studio: ResMut<Studio>, mut eye: ResMut<Eye>) {
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
    // focused where it looks, unless the shot pulls focus itself
    let focus = cam.focus.unwrap_or_else(|| cam.pos.distance(cam.look));
    *eye = Eye { pos: cam.pos, look: cam.look, roll: cam.roll, lens: Lens { mm: cam.mm, aperture: cam.aperture, focus, ..default() } };
}

/// What is shown: the Game's world, or in the Studio what the shot playing films (the world, or the view doc it
/// names).
fn choose_world(view: Res<State<View>>, studio: Res<Studio>, world: Res<State<World>>, mut next: ResMut<NextState<World>>, mut kinds: Local<std::collections::HashMap<String, World>>) {
    let want = match view.get() {
        View::Home | View::TheDB | View::Setup | View::Sandboxes | View::Stories => World::None,
        View::Game => World::Grid,
        View::Studio => {
            let id = studio.timeline.shot_at(studio.time).and_then(|(i, _)| studio.timeline.clips[i].world.clone());
            match id {
                None => World::Grid,
                Some(id) => *kinds.entry(id.clone()).or_insert_with(|| match crate::db().meta(&id).map(|m| m.0).as_deref() {
                    Ok("view") => World::Interface,
                    _ => World::Grid,
                }),
            }
        }
    };
    if *world.get() != want {
        next.set(want);
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

/// The gate: the timeline's shots (or any shot list's), each held at its middle, 1080p without vsync; for each, the
/// frame time over 90 frames and one picture, then quit. The same shots before and after a change show what it did.
#[derive(Resource)]
pub struct Gate {
    pub dir: std::path::PathBuf,
}

#[allow(clippy::too_many_arguments)]
pub fn gate(
    mut commands: Commands,
    g: Res<Gate>,
    time: Res<Time>,
    mut studio: ResMut<Studio>,
    mut window: Query<&mut Window, With<bevy::window::PrimaryWindow>>,
    mut n: Local<u32>,
    mut shot: Local<usize>,
    mut frames: Local<Vec<f32>>,
    mut report: Local<Vec<String>>,
    mut exit: MessageWriter<AppExit>,
) {
    *n += 1;
    if *n == 1
        && let Ok(mut w) = window.single_mut()
    {
        w.present_mode = bevy::window::PresentMode::AutoNoVsync;
        w.resolution.set_scale_factor_override(Some(1.0));
        w.resolution.set(1920.0, 1080.0);
    }
    let clips = studio.timeline.clips.clone();
    if *shot >= clips.len() {
        if *n == 40 {
            let _ = std::fs::write(g.dir.join("times.txt"), report.join("\n") + "\n");
            println!("{}", report.join("\n"));
            exit.write(AppExit::Success);
        }
        return;
    }
    // hold the shot at its middle
    let start: f32 = clips[..*shot].iter().map(|c| c.secs).sum();
    studio.time = start + clips[*shot].secs * 0.5;
    studio.playing = false;
    // the first shot waits for the shaders to compile; the others for the picture to settle
    let settle = if *shot == 0 { 400 } else { 180 };
    if *n > settle && frames.len() < 90 {
        frames.push(time.delta_secs() * 1000.0);
    }
    if frames.len() == 90 {
        let mut f = frames.clone();
        f.sort_by(f32::total_cmp);
        let mean = f.iter().sum::<f32>() / f.len() as f32;
        report.push(format!("{}\t{}\t{mean:.1} ms\tp95 {:.1} ms", *shot, clips[*shot].name, f[f.len() * 95 / 100]));
        commands.spawn(Screenshot::primary_window()).observe(save_to_disk(g.dir.join(format!("{}.png", *shot))));
        frames.clear();
        *shot += 1;
        *n = 0;
    }
}
