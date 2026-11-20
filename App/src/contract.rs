//! The contract between whatever aims the camera and the world (intent 0049): the Studio's timeline, the Game's
//! walker and a view drive the world only through it.
//!
//! - **The eye** ([`Eye`]): where the camera stands and looks, its roll, and its lens: focal length, aperture, focus
//!   distance, sensor and shutter, with the full virtual range (no glass binds it). The world's camera carries
//!   [`WorldEye`]; [`show`] puts the eye on it, its field of view from the focal length and sensor, its depth of field
//!   from the aperture and focus (the physical formulas: Bevy's own, from f-stops and sensor height).
//! - **Which world** ([`World`]): what is shown; the views pick it, and the Studio picks it shot by shot.

use bevy::post_process::dof::{DepthOfField, DepthOfFieldMode};
use bevy::prelude::*;

/// What is shown. A view picks it (the dashboard nothing, the Game the grid); the Studio picks it for each shot.
#[derive(States, Default, Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum World {
    #[default]
    None,
    /// The world of day 1: the green plane and its grid (`world.rs`).
    Grid,
    /// A view of the interface, filmed: the doc the shot names.
    Interface,
}

/// A lens: any focal length, aperture and focus the shot wants.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Lens {
    /// Focal length, mm.
    pub mm: f32,
    /// Aperture as an f-stop; none: everything sharp (no depth of field drawn).
    pub aperture: Option<f32>,
    /// Focus distance, m.
    pub focus: f32,
    /// The frame's width and height on the sensor, mm: by default the 42.6 mm wide frame every shot so far was
    /// composed in (the legacy kit's unsqueezed width), 16:9.
    pub sensor: Vec2,
    /// Shutter angle, degrees (motion blur, when it is drawn).
    pub shutter: f32,
}

impl Default for Lens {
    fn default() -> Self {
        Lens { mm: 35.0, aperture: None, focus: 10.0, sensor: Vec2::new(42.6, 23.96), shutter: 180.0 }
    }
}

/// The eye the world shows: set by the Studio's timeline, the walker or a view; put on the world's camera by [`show`].
#[derive(Resource, Clone, Copy, Debug)]
pub struct Eye {
    pub pos: Vec3,
    pub look: Vec3,
    /// Degrees.
    pub roll: f32,
    pub lens: Lens,
}

impl Default for Eye {
    fn default() -> Self {
        Eye { pos: Vec3::new(0.0, 1.6, 0.0), look: Vec3::new(0.0, 1.6, -1.0), roll: 0.0, lens: Lens::default() }
    }
}

/// The camera the world is filmed with.
#[derive(Component)]
pub struct WorldEye;

pub fn plugin(app: &mut App) {
    app.init_state::<World>().init_resource::<Eye>().add_systems(Update, show.after(crate::film::Aim));
}

/// How tall the lens sees, in radians, on its sensor in a picture of `aspect` (width over height): the sensor's width
/// fills the picture's width.
pub fn vfov(lens: &Lens, aspect: f32) -> f32 {
    let hfov = 2.0 * (lens.sensor.x / 2.0 / lens.mm.max(0.1)).atan();
    2.0 * ((hfov / 2.0).tan() / aspect.max(1e-3)).atan()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_lens_sees_as_the_shots_were_composed() {
        // the legacy kit's 42.6 mm frame: a 28 mm sees 74.5° across, a 180 mm 13.5°
        let across = |mm: f32| vfov(&Lens { mm, ..default() }, 1.0).to_degrees();
        assert!((across(28.0) - 74.5).abs() < 0.1 && (across(180.0) - 13.5).abs() < 0.1);
    }
}

/// Puts the eye on the world's camera: its place and aim, its field of view, and its depth of field.
fn show(mut commands: Commands, eye: Res<Eye>, mut cams: Query<(Entity, &mut Transform, &mut Projection, Option<&mut DepthOfField>), With<WorldEye>>) {
    for (e, mut t, mut p, dof) in &mut cams {
        *t = Transform::from_translation(eye.pos).looking_at(eye.look, Vec3::Y);
        t.rotate_local_z(-eye.roll.to_radians());
        if let Projection::Perspective(pp) = p.as_mut() {
            pp.fov = vfov(&eye.lens, pp.aspect_ratio);
        }
        match (eye.lens.aperture, dof) {
            (Some(f), Some(mut d)) => {
                d.aperture_f_stops = f;
                d.focal_distance = eye.lens.focus.max(0.01);
                d.sensor_height = eye.lens.sensor.y / 1000.0;
            }
            (Some(f), None) => {
                commands.entity(e).insert(DepthOfField {
                    mode: DepthOfFieldMode::Bokeh,
                    aperture_f_stops: f,
                    focal_distance: eye.lens.focus.max(0.01),
                    sensor_height: eye.lens.sensor.y / 1000.0,
                    ..default()
                });
            }
            (None, Some(_)) => {
                commands.entity(e).remove::<DepthOfField>();
            }
            (None, None) => {}
        }
    }
}
