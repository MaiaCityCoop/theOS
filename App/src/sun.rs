//! The real sun over a real place: where it stands for the place's latitude and longitude, the day of the year and the
//! hour, and the light, sky and haze that follow from it. It opens on the real date and the place's own solar time;
//! [ and ] move the hours back and forward. Leaving the place puts the plain's light back.

use crate::contract::World;
use crate::place::Site;
use crate::place::PlaceEye as Eye;
use crate::world::{HAZE, SKY};
use bevy::light::CascadeShadowConfigBuilder;
use bevy::pbr::DistanceFog;
use bevy::prelude::*;

/// Where the sun is over the place, from the contract's clock (its day of the year and the place's solar hour).
#[derive(Resource, Default)]
pub struct Sun {
    /// degrees above the horizon, and clockwise from north
    pub elevation: f32,
    pub azimuth: f32,
}

pub fn plugin(app: &mut App) {
    app.add_systems(OnEnter(World::Place), rise)
        .add_systems(Update, shine.run_if(in_state(World::Place)).run_if(resource_exists::<Sun>))
        .add_systems(OnExit(World::Place), set);
}

/// Now, as the day of the year and the UTC hour, from the system clock.
pub fn now() -> (u32, f32) {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let days = (secs / 86_400) as i64;
    // the civil date of a day count (Howard Hinnant's algorithm), for the day of the year
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy_march = doe - (365 * yoe + yoe / 4 - yoe / 100); // days since 1 March
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let jan_feb = 31 + if leap { 29 } else { 28 };
    let day = if doy_march >= 306 { doy_march - 306 + 1 } else { doy_march + jan_feb + 1 };
    (day as u32, (secs % 86_400) as f32 / 3600.0)
}

/// The sun's elevation and azimuth (degrees) at a latitude, a day of the year and a solar hour.
pub fn position(lat: f64, day: u32, hour: f32) -> (f32, f32) {
    let decl = (-23.44f64).to_radians() * (std::f64::consts::TAU / 365.0 * (day as f64 + 10.0)).cos();
    let h = (15.0 * (hour as f64 - 12.0)).to_radians(); // the hour angle
    let phi = lat.to_radians();
    let el = (phi.sin() * decl.sin() + phi.cos() * decl.cos() * h.cos()).asin();
    // from the south, westward positive; turned to clockwise from north
    let az = h.sin().atan2(h.cos() * phi.sin() - decl.tan() * phi.cos()).to_degrees() + 180.0;
    (el.to_degrees() as f32, az.rem_euclid(360.0) as f32)
}

fn rise(mut commands: Commands, site: Res<Site>, old: Option<Res<Sun>>, mut clock: ResMut<crate::contract::Clock>, mut lights: Query<(Entity, &mut DirectionalLight)>) {
    // a place jumped to keeps the hour you set; the first one opens on now, in its own solar time
    if old.is_none() {
        let (day, utc) = now();
        let hour = (utc + site.lon as f32 / 15.0).rem_euclid(24.0);
        (clock.day, clock.hour) = (day, hour);
        commands.insert_resource(Sun::default());
    }
    for (e, mut l) in &mut lights {
        l.shadow_maps_enabled = true;
        commands.entity(e).insert(
            CascadeShadowConfigBuilder { num_cascades: 3, first_cascade_far_bound: 40.0, maximum_distance: 600.0, ..default() }.build(),
        );
    }
}

fn smooth(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn mix(a: Color, b: Color, t: f32) -> Color {
    let (a, b) = (a.to_linear(), b.to_linear());
    Color::LinearRgba(LinearRgba::rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t))
}

#[allow(clippy::too_many_arguments)]
fn shine(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    site: Res<Site>,
    mut sun: ResMut<Sun>,
    mut clock: ResMut<crate::contract::Clock>,
    mut lights: Query<(&mut DirectionalLight, &mut Transform)>,
    mut ambient: ResMut<GlobalAmbientLight>,
    mut clear: ResMut<ClearColor>,
    mut fog: Query<&mut DistanceFog, With<Eye>>,
) {
    // [ and ] move the hours, two an second; past midnight the day turns
    let keyed = (keys.pressed(KeyCode::BracketRight) as i32 - keys.pressed(KeyCode::BracketLeft) as i32) as f32 * 2.0;
    let step = keyed * time.delta_secs();
    if step != 0.0 {
        let h = clock.hour + step;
        clock.day = ((clock.day as i32 - 1 + h.div_euclid(24.0) as i32).rem_euclid(365) + 1) as u32;
        clock.hour = h.rem_euclid(24.0);
    }
    let (el, az) = position(site.lat, clock.day, clock.hour);
    (sun.elevation, sun.azimuth) = (el, az);

    // the light comes from the sun: north is -z, east +x
    let (e, a) = (el.to_radians(), az.to_radians());
    let towards = Vec3::new(a.sin() * e.cos(), e.sin(), -a.cos() * e.cos());
    let day = smooth(-4.0, 10.0, el); // 0 at night, 1 in full day
    let dusk = smooth(-6.0, 1.0, el) * (1.0 - smooth(2.0, 10.0, el)); // the warm hour around sunrise and sunset
    for (mut l, mut t) in &mut lights {
        *t = Transform::from_translation(towards.max(Vec3::new(f32::MIN, 0.02, f32::MIN))).looking_at(Vec3::ZERO, Vec3::Y);
        l.illuminance = 9_000.0 * smooth(-1.0, 25.0, el).max(0.0);
        l.color = mix(Color::WHITE, Color::srgb(1.0, 0.62, 0.36), dusk);
    }
    // the sky's own light: blue by day, a little left at night
    ambient.color = mix(Color::srgb(0.55, 0.62, 0.85), Color::srgb(0.95, 0.75, 0.6), dusk * 0.6);
    ambient.brightness = 12.0 + 220.0 * day;
    let night = Color::srgb(0.02, 0.03, 0.07);
    let sky = mix(mix(night, SKY, day), Color::srgb(0.93, 0.62, 0.45), dusk * 0.4);
    clear.0 = sky;
    for mut f in &mut fog {
        let haze = mix(mix(Color::srgb(0.03, 0.04, 0.08), HAZE, day), Color::srgb(0.95, 0.70, 0.55), dusk * 0.6);
        f.color = haze;
        f.falloff = bevy::pbr::FogFalloff::from_visibility_colors(6_000.0, haze, haze);
    }
}

/// Leaving the place: the plain's light, sky and haze as they were.
fn set(
    mut commands: Commands,
    mut lights: Query<(Entity, &mut DirectionalLight, &mut Transform)>,
    mut ambient: ResMut<GlobalAmbientLight>,
    mut clear: ResMut<ClearColor>,
    mut fog: Query<&mut DistanceFog, With<Eye>>,
) {
    for (e, mut l, mut t) in &mut lights {
        *t = Transform::from_xyz(0.3, 1.0, 0.4).looking_at(Vec3::ZERO, Vec3::Y);
        l.illuminance = 9_000.0;
        l.color = Color::WHITE;
        l.shadow_maps_enabled = false;
        commands.entity(e).remove::<bevy::light::CascadeShadowConfig>();
    }
    *ambient = GlobalAmbientLight::default();
    clear.0 = SKY;
    for mut f in &mut fog {
        f.color = HAZE;
        f.falloff = bevy::pbr::FogFalloff::from_visibility_colors(6_000.0, HAZE, HAZE);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noon_at_the_equinox_stands_at_ninety_less_the_latitude() {
        // about 20 March is day 79; at solar noon the sun is due south, at 90° less the latitude
        let (el, az) = position(37.64, 80, 12.0);
        assert!((el - (90.0 - 37.64)).abs() < 1.5, "{el}");
        assert!((az - 180.0).abs() < 0.5, "{az}");
    }

    #[test]
    fn the_morning_sun_is_in_the_east_and_the_evening_sun_in_the_west() {
        let (_, morning) = position(37.64, 172, 8.0);
        let (_, evening) = position(37.64, 172, 16.0);
        assert!(morning > 60.0 && morning < 120.0, "{morning}");
        assert!(evening > 240.0 && evening < 300.0, "{evening}");
    }

    #[test]
    fn midsummer_noon_is_higher_than_midwinter_noon() {
        assert!(position(37.64, 172, 12.0).0 > position(37.64, 355, 12.0).0 + 40.0);
    }
}
