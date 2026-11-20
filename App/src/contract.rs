//! The contract between the Studio and every world (intent 0049): what anything the Studio films exposes, the same for
//! the Meadow, the Library, a real place and the interface. The Studio, its sun dial and its timeline drive a world
//! only through it, and know no world.
//!
//! - **The eye** ([`Eye`]): where the camera stands and looks, its roll, and its lens: focal length, aperture, focus
//!   distance, sensor and shutter, with the full virtual range (no glass binds it). A world's camera carries
//!   [`WorldEye`]; [`show`] puts the eye on it, its field of view from the focal length and sensor, its depth of field
//!   from the aperture and focus (the physical formulas: Bevy's own, from f-stops and sensor height).
//! - **The clock** ([`Clock`]): the day of the year, the hour, the wind. Each world turns it into its own sun and
//!   weather.
//! - **The land** ([`Land`]): the world's ground height under a point, so a shot's heights are above the land.
//! - **Which world** ([`World`]): the scene shown; the views pick it, and the Studio picks it shot by shot.

use bevy::post_process::dof::{DepthOfField, DepthOfFieldMode};
use bevy::prelude::*;

/// The world shown. A view picks it (the Game the Meadow, the Library its shelf, the Place a real place); the Studio
/// picks it for each shot, from the doc the shot names.
#[derive(States, Default, Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum World {
    #[default]
    None,
    Meadow,
    Library,
    Place,
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

impl Lens {
    /// The lens that sees `vfov` (radians) tall in a picture of `aspect`, on the default frame.
    pub fn seeing(vfov: f32, aspect: f32) -> Lens {
        let l = Lens::default();
        let hfov = 2.0 * ((vfov / 2.0).tan() * aspect).atan();
        Lens { mm: l.sensor.x / 2.0 / (hfov / 2.0).tan(), ..l }
    }
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

/// The time and the weather.
#[derive(Resource, Clone, Copy, Debug)]
pub struct Clock {
    /// The day of the year, 1 = 1 January.
    pub day: u32,
    /// The hour, 0 to 24 (a world's own solar time).
    pub hour: f32,
    /// The wind, 0 calm to 2.5 a storm.
    pub wind: f32,
    /// Whether the day runs on its own, at two hours a real minute.
    pub auto: bool,
}

impl Default for Clock {
    fn default() -> Self {
        Clock { day: crate::sun::now().0, hour: 18.5, wind: 1.4, auto: false }
    }
}

/// The world's ground under a point (x, z), in metres.
#[derive(Resource, Clone)]
pub struct Land(pub std::sync::Arc<dyn Fn(f32, f32) -> f32 + Send + Sync>);

impl Land {
    pub fn at(&self, x: f32, z: f32) -> f32 {
        (self.0)(x, z)
    }
    pub fn flat(height: f32) -> Self {
        Land(std::sync::Arc::new(move |_, _| height))
    }
}

/// The camera a world films with.
#[derive(Component)]
pub struct WorldEye;

pub fn plugin(app: &mut App) {
    app.init_state::<World>()
        .init_resource::<Eye>()
        .init_resource::<Clock>()
        .insert_resource(Land::flat(0.0))
        .add_systems(Update, (run_clock, show).chain());
}

/// The day runs on its own when the clock says so; past midnight the day turns.
fn run_clock(time: Res<Time>, mut clock: ResMut<Clock>) {
    if clock.auto {
        let h = clock.hour + 2.0 / 60.0 * time.delta_secs();
        clock.day = ((clock.day as i32 - 1 + h.div_euclid(24.0) as i32).rem_euclid(365) + 1) as u32;
        clock.hour = h.rem_euclid(24.0);
    }
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
        // and a lens made to see a field of view sees it
        let l = Lens::seeing(68f32.to_radians(), 16.0 / 9.0);
        assert!((vfov(&l, 16.0 / 9.0).to_degrees() - 68.0).abs() < 1e-3);
    }
}

/// Puts the eye on every world camera: its place and aim, its field of view, and its depth of field.
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
