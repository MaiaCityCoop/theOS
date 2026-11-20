//! The one camera of the Game and of a real place, as in TheGame (TheGame/camera/rig.js, TheGame/src/camera/rig.js): a
//! rig hung over a point on the ground and driven by one value, its height. The wheel moves the height from the
//! walker's eyes (1.7 m) to 12 km; nothing switches mode. At the eyes it is first person; higher, it hangs back from the
//! point and looks down at it. Between the keys every value eases over the height's logarithm: speed and Shift's run,
//! how far it looks down, the lens. W A S D move the point, Q E turn, the held mouse looks around.

use crate::View;
use crate::place::Ground;
use crate::place::PlaceEye as Eye;
use bevy::input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit};
use bevy::prelude::*;

/// One key of the rig: at height `h` (m) it looks down `pitch` (radians; None at eye level, ahead), with a lens of
/// `fov` degrees, moves at `speed` m/s or `run` with Shift, and hangs back from its point by `orbit` (0 the eyes, 1 back).
struct Key {
    h: f32,
    pitch: Option<f32>,
    fov: f32,
    speed: f32,
    run: f32,
    orbit: f32,
}

const KEYS: [Key; 5] = [
    Key { h: 1.7, pitch: None, fov: 68.0, speed: 3.2, run: 9.0, orbit: 0.0 },
    Key { h: 5.0, pitch: Some(-0.32), fov: 64.0, speed: 7.0, run: 20.0, orbit: 1.0 },
    Key { h: 40.0, pitch: Some(-0.62), fov: 54.0, speed: 40.0, run: 120.0, orbit: 1.0 },
    Key { h: 800.0, pitch: Some(-0.9), fov: 44.0, speed: 500.0, run: 1500.0, orbit: 1.0 },
    Key { h: 12_000.0, pitch: Some(-1.05), fov: 40.0, speed: 6000.0, run: 18000.0, orbit: 1.0 },
];
const EYE: f32 = 1.7;
const WALK: f32 = 4.0; // under this height the point is a walker: ground too steep stops it
const WHEEL: f32 = 0.0016; // the height's logarithm per wheel pixel
const CLIMB: f32 = 0.75; // the steepest ground walked up, metres up per metre on
const STEP_UP: f32 = 0.25; // a rise lower than this is stepped up whatever its slope
const TILT_UP: f32 = 1.2;
const TILT_DOWN: f32 = -1.5;
const DRAG: f32 = 0.0022; // radians per pixel of the held mouse
const FADE: f32 = 0.5; // how fast a tilt eases back to the height's own pitch, per unit of the height's logarithm

/// The rig's values at a height.
struct At {
    pitch: f32, // the height's own pitch
    fov: f32,
    speed: f32,
    run: f32,
    orbit: f32,
}

fn at(h: f32) -> At {
    let l = h.ln();
    let mut i = 0;
    while i < KEYS.len() - 2 && l > KEYS[i + 1].h.ln() {
        i += 1;
    }
    let (a, b) = (&KEYS[i], &KEYS[i + 1]);
    let t = ((l - a.h.ln()) / (b.h.ln() - a.h.ln())).clamp(0.0, 1.0);
    let t = t * t * (3.0 - 2.0 * t);
    let mix = |x: f32, y: f32| x + (y - x) * t;
    // at eye level the pitch is free (ahead); it eases into the next key's look-down as the camera rises
    let pitch = match (a.pitch, b.pitch) {
        (None, p) => p.unwrap_or(0.0) * t,
        (Some(p), Some(q)) => mix(p, q),
        (Some(p), None) => p,
    };
    At { pitch, fov: mix(a.fov, b.fov), speed: mix(a.speed, b.speed), run: mix(a.run, b.run), orbit: mix(a.orbit, b.orbit) }
}

/// The rig: the point on the ground (the walker's feet), the heading, the tilt from the height's own pitch, the height.
#[derive(Resource)]
pub struct Walker {
    pub x: f32,
    pub z: f32,
    /// radians; 0 looks north (-z), positive turns left
    pub yaw: f32,
    look: f32,
    l: f32,
    l_prev: f32,
    eye_y: Option<f32>,
    back_now: f32,
}

impl Walker {
    pub fn new(x: f32, z: f32, yaw: f32) -> Self {
        Walker { x, z, yaw, look: -0.08, l: EYE.ln(), l_prev: EYE.ln(), eye_y: None, back_now: 0.0 }
    }
    pub fn height(&self) -> f32 {
        self.l.exp()
    }
    /// Puts the point somewhere else, keeping the height; the eyes do not ease there.
    pub fn place(&mut self, x: f32, z: f32) {
        (self.x, self.z, self.eye_y) = (x, z, None);
    }
}

/// A piece of the interface that takes the wheel and the held mouse while the pointer is over it (the map, the time
/// panel), so the camera does not move under it. It needs `Hovered` beside it.
#[derive(Component)]
pub struct Captures;

pub fn plugin(app: &mut App) {
    app.insert_resource(Walker::new(0.0, 0.0, 0.0))
        .add_systems(Update, drive.run_if(|s: Res<State<View>>| matches!(s.get(), View::Place)));
}

#[allow(clippy::too_many_arguments)]
fn drive(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    captured: Query<&bevy::picking::hover::Hovered, With<Captures>>,
    ground: Option<Res<Ground>>,
    mut w: ResMut<Walker>,
    mut eye: Query<(&mut Transform, &mut Projection), With<Eye>>,
) {
    let dt = time.delta_secs();
    let g = |x: f32, z: f32| ground.as_ref().map_or(0.0, |g| g.at(x, z));
    let (l0, l1) = (EYE.ln(), KEYS[KEYS.len() - 1].h.ln());
    let over_ui = captured.iter().any(|h| h.get());

    // the one zoom: the wheel moves the height (up the wheel comes down), unless it is over the interface
    if !over_ui {
        let px = match scroll.unit {
            MouseScrollUnit::Line => scroll.delta.y * 100.0,
            MouseScrollUnit::Pixel => scroll.delta.y,
        };
        w.l = (w.l - px * WHEEL).clamp(l0, l1);
    }
    let h = w.height();
    let v = at(h);

    // looking around: the held mouse turns and tilts
    if buttons.pressed(MouseButton::Left) && !over_ui {
        w.yaw -= motion.delta.x * DRAG;
        w.look -= motion.delta.y * DRAG;
    }
    // the tilt: kept through a small change of height, eased back to the height's own over a long one
    let dl = (w.l - w.l_prev).abs();
    w.l_prev = w.l;
    w.look *= (-FADE * dl).exp();
    w.look = w.look.clamp(TILT_DOWN - v.pitch, TILT_UP - v.pitch);

    // move the point: W A S D at this height's speed, Shift its run, Q E turn
    let axis = |a: [KeyCode; 2], b: [KeyCode; 2]| (keys.any_pressed(a) as i32 - keys.any_pressed(b) as i32) as f32;
    let f = axis([KeyCode::KeyW, KeyCode::ArrowUp], [KeyCode::KeyS, KeyCode::ArrowDown]);
    let s = axis([KeyCode::KeyD, KeyCode::ArrowRight], [KeyCode::KeyA, KeyCode::ArrowLeft]);
    w.yaw += axis([KeyCode::KeyQ, KeyCode::KeyQ], [KeyCode::KeyE, KeyCode::KeyE]) * 1.4 * dt;
    let speed = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) { v.run } else { v.speed };
    let n = if f != 0.0 && s != 0.0 { std::f32::consts::FRAC_1_SQRT_2 } else { 1.0 };
    let (sy, cy) = w.yaw.sin_cos();
    let (nx, nz) = (w.x + (-sy * f + cy * s) * speed * n * dt, w.z + (-cy * f - sy * s) * speed * n * dt);
    if h < WALK {
        // on foot: ground too steep to walk up stops you; along it you slide
        let up = |ax: f32, az: f32, bx: f32, bz: f32| {
            let (rise, run) = (g(bx, bz) - g(ax, az), (bx - ax).hypot(bz - az));
            rise <= STEP_UP * (run / 0.3).min(1.0) || rise / run.max(1e-6) <= CLIMB
        };
        let (x, z) = (w.x, w.z);
        if up(x, z, nx, nz) {
            (w.x, w.z) = (nx, nz);
        } else if up(x, z, nx, z) {
            w.x = nx;
        } else if up(x, z, x, nz) {
            w.z = nz;
        }
    } else {
        (w.x, w.z) = (nx, nz);
    }

    // the camera: at eye level the walker's eyes, eased over the ground; higher, hung back from the point
    let pitch = (v.pitch + w.look).clamp(TILT_DOWN, TILT_UP);
    let back = v.orbit * (h - EYE).max(0.0) / (-v.pitch).max(0.05).tan();
    w.back_now = if back < w.back_now { back } else { w.back_now + (back - w.back_now) * (dt * 3.0).min(1.0) };
    let (cx, cz) = (w.x + sy * w.back_now, w.z + cy * w.back_now);
    let y = (g(w.x, w.z) + h.min(EYE) + (h - EYE).max(0.0)).max(g(cx, cz) + 0.5); // never under the ground
    let eased = match w.eye_y {
        Some(e) if h <= 2.0 => e + (y - e) * (dt * 14.0).min(1.0),
        _ => y,
    };
    w.eye_y = Some(eased);
    if let Ok((mut t, mut p)) = eye.single_mut() {
        *t = Transform::from_xyz(cx, eased, cz).with_rotation(Quat::from_euler(EulerRot::YXZ, w.yaw, pitch, 0.0));
        if let Projection::Perspective(pp) = p.as_mut() {
            pp.fov = v.fov.to_radians();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_keys_hold_at_their_heights() {
        let eye = at(1.7);
        assert_eq!((eye.pitch, eye.fov, eye.speed, eye.run), (0.0, 68.0, 3.2, 9.0));
        let town = at(40.0);
        assert!((town.speed - 40.0).abs() < 1e-3 && (town.run - 120.0).abs() < 1e-3 && (town.pitch + 0.62).abs() < 1e-4);
        assert!((at(12_000.0).run - 18_000.0).abs() < 1e-1);
    }

    #[test]
    fn between_keys_it_eases() {
        let mid = at(15.0);
        assert!(mid.speed > 7.0 && mid.speed < 40.0 && mid.pitch < -0.32 && mid.pitch > -0.62);
    }
}
