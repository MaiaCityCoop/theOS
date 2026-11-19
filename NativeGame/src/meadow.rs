//! The Meadow: a standalone test of how real Bevy can look on this hardware. Grass in wind, a physical sky and a
//! sun, nothing else; measured at 1080p.

use crate::View;
use crate::film::Walker;
use crate::world::{Eye, Plain};
use bevy::anti_alias::taa::TemporalAntiAliasing;
use bevy::camera::Exposure;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::diagnostic::{DiagnosticsStore, FrameTimeDiagnosticsPlugin};
use bevy::light::atmosphere::ScatteringMedium;
use bevy::light::{Atmosphere, AtmosphereEnvironmentMapLight, CascadeShadowConfigBuilder, SunDisk, light_consts::lux};
use bevy::pbr::{AtmosphereSettings, ScreenSpaceAmbientOcclusion};
use bevy::post_process::bloom::Bloom;
use bevy::platform::collections::HashMap;
use bevy::prelude::*;
use bevy::tasks::{AsyncComputeTaskPool, Task, futures::check_ready};
use bevy::render::view::screenshot::{Screenshot, save_to_disk};
use bevy::camera::visibility::RenderLayers;
use bevy::window::{PresentMode, PrimaryWindow};
use std::path::PathBuf;

/// The hour of the day in the Meadow, 0 to 24; the sun follows it. The slider and `[` `]` move it.
#[derive(Resource)]
pub struct Hour(pub f32);

#[derive(Component)]
struct Sun;

/// The grass world's camera.
#[derive(Component)]
pub struct Eye2;

/// The grass around the camera: the chunks shown, each with the ring class it was grown for, and the ones growing in
/// the background. A chunk is fixed to the world; as the camera moves, near chunks are regrown at full detail and far
/// ones thinned, so the field looks the same density wherever you walk.
#[derive(Resource)]
struct Field {
    material: Handle<crate::wind::Grass>,
    shown: HashMap<(i32, i32), (Entity, i32)>,
    growing: HashMap<(i32, i32), (Task<Mesh>, i32)>,
}

/// The ring class of a chunk `ring` chunks from the camera's: rings 0 and 1 are one class (full detail).
fn class(ring: i32) -> i32 {
    ring.clamp(1, 5)
}

/// Grows and drops chunks around the camera; at most a few new ones a frame, nearest first.
fn stream(
    mut commands: Commands,
    field: Option<ResMut<Field>>,
    eye: Query<&GlobalTransform, With<Eye2>>,
    mut meshes: ResMut<Assets<Mesh>>,
) {
    use crate::grass::{CHUNK, RINGS, chunk, share};
    let (Some(mut field), Ok(eye)) = (field, eye.single()) else { return };
    if std::env::var_os("MEADOW_NO_GRASS").is_some() {
        return;
    }
    let at = eye.translation();
    let (cx, cz) = ((at.x / CHUNK).floor() as i32, (at.z / CHUNK).floor() as i32);
    // what is wanted, nearest ring first
    let mut wanted: Vec<((i32, i32), i32)> = vec![];
    for ring in 0..=RINGS {
        for dx in -ring..=ring {
            for dz in -ring..=ring {
                if dx.abs().max(dz.abs()) == ring {
                    wanted.push(((cx + dx, cz + dz), class(ring)));
                }
            }
        }
    }
    let pool = AsyncComputeTaskPool::get();
    let mut started = 0;
    for &(key, c) in &wanted {
        let ok_shown = field.shown.get(&key).is_some_and(|s| s.1 == c);
        let ok_growing = field.growing.get(&key).is_some_and(|g| g.1 == c);
        if !ok_shown && !ok_growing && started < 6 {
            let (x, z) = key;
            let s = share(c);
            field.growing.insert(key, (pool.spawn(async move { chunk(x, z, s) }), c));
            started += 1;
        }
    }
    // drop what is out of reach
    let keep: HashMap<(i32, i32), i32> = wanted.into_iter().collect();
    let gone: Vec<_> = field.shown.keys().filter(|k| !keep.contains_key(*k)).copied().collect();
    for k in gone {
        if let Some((e, _)) = field.shown.remove(&k) {
            commands.entity(e).despawn();
        }
    }
    field.growing.retain(|k, _| keep.contains_key(k));
    // show what has grown, replacing what was there only once the new chunk is ready (no holes)
    let ready: Vec<_> = field
        .growing
        .iter_mut()
        .filter_map(|(k, (task, c))| check_ready(task).map(|mesh| (*k, *c, mesh)))
        .collect();
    for (k, c, mesh) in ready {
        field.growing.remove(&k);
        let e = commands.spawn((GrassWorld, MEADOW, Mesh3d(meshes.add(mesh)), MeshMaterial3d(field.material.clone()))).id();
        if let Some((old, _)) = field.shown.insert(k, (e, c)) {
            commands.entity(old).despawn();
        }
    }
}

/// Everything of the grass world, removed when its view closes.
#[derive(Component)]
struct GrassWorld;

/// The Meadow's own render layer: its camera sees only its own sky, sun, grass and ground, never the plain.
const MEADOW: RenderLayers = RenderLayers::layer(1);

/// Set when the app runs only to measure the Meadow and take one picture: `--meadow <out.png> [hour]`.
#[derive(Resource, Clone)]
pub struct Measure {
    pub out: PathBuf,
}

pub fn plugin(app: &mut App) {
    app.add_plugins(FrameTimeDiagnosticsPlugin::default())
        .insert_resource(Hour(18.5))
        // the grass world is the Meadow's and the Studio's: the Studio films its shots over it
        .add_systems(OnEnter(View::Meadow), enter)
        .add_systems(OnExit(View::Meadow), leave)
        .add_systems(OnEnter(View::Studio), enter)
        .add_systems(OnExit(View::Studio), leave)
        .add_systems(Update, stream.run_if(|v: Res<State<View>>| matches!(v.get(), View::Meadow | View::Studio)))
        .add_systems(Update, (hours, sun).chain().run_if(|v: Res<State<View>>| matches!(v.get(), View::Meadow | View::Studio)));
}

/// The camera's frame time, smoothed, in milliseconds.
pub fn frame_ms(d: &DiagnosticsStore) -> Option<f64> {
    d.get(&FrameTimeDiagnosticsPlugin::FRAME_TIME).and_then(|f| f.smoothed())
}

fn enter(
    mut commands: Commands,
    mut media: ResMut<Assets<ScatteringMedium>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut grass: ResMut<Assets<crate::wind::Grass>>,
    mut images: ResMut<Assets<Image>>,
    mut plain: Query<&mut Visibility, With<Plain>>,
    mut eye: Query<(Entity, &mut Camera), With<Eye>>,
    mut walker: ResMut<Walker>,
) {
    for mut v in &mut plain {
        *v = Visibility::Hidden;
    }
    // the interface is drawn through the Meadow's camera while it is shown (the plain's is off)
    for (e, mut c) in &mut eye {
        c.is_active = false;
        commands.entity(e).remove::<IsDefaultUiCamera>();
    }
    commands.insert_resource(GlobalAmbientLight::NONE);
    *walker = Walker { pos: Vec3::new(0.0, 1.6, 0.0), yaw: 0.0, pitch: -6.0 };

    commands.spawn((GrassWorld, Atmosphere::earth(media.add(ScatteringMedium::earth(256, 256)))));
    commands.spawn((
        GrassWorld,
        MEADOW,
        Sun,
        DirectionalLight {
            shadow_maps_enabled: std::env::var_os("MEADOW_NO_SHADOWS").is_none(),
            illuminance: lux::RAW_SUNLIGHT,
            // a low sun grazes the flat ground: without more bias its shadow fights the ground and flickers
            shadow_depth_bias: 0.2,
            shadow_normal_bias: 3.0,
            ..default()
        },
        // two cascades over the near 45 m only: fewer, sharper shadow maps that swim less as the camera moves
        CascadeShadowConfigBuilder { num_cascades: 2, maximum_distance: 45.0, first_cascade_far_bound: 12.0, ..default() }.build(),
        SunDisk::EARTH,
        Transform::default(),
    ));
    // the parts that cost time, each switchable for measuring: MEADOW_NO_<PART>=1
    let off = |part: &str| std::env::var_os(format!("MEADOW_NO_{part}")).is_some();
    let mut cam = commands.spawn((
        GrassWorld,
        MEADOW,
        Eye2,
        Camera3d::default(),
        Camera { order: 1, ..default() },
        IsDefaultUiCamera,
        Projection::Perspective(PerspectiveProjection { near: 0.05, far: 20_000.0, ..default() }),
        Transform::from_xyz(0.0, 1.6, 0.0),
        Exposure { ev100: 13.0 },
        // AgX keeps greens green and a bright evening sky soft; ACES pushed the grass toward yellow
        Tonemapping::AgX,
        Msaa::Off,
    ));
    if !off("SKY") {
        cam.insert((AtmosphereSettings::default(), AtmosphereEnvironmentMapLight::default()));
    }
    if !off("BLOOM") {
        cam.insert(Bloom::NATURAL);
    }
    if !off("TAA") {
        cam.insert(TemporalAntiAliasing::default());
    }
    if !off("AO") {
        cam.insert(ScreenSpaceAmbientOcclusion::default()); // soft shading where blades crowd and meet the ground
    }
    // the grass: one mesh a chunk, so the view culls it a chunk at a time
    let blades = grass.add(crate::wind::Grass {
        extension: crate::wind::Wind { params: Vec4::ZERO },
        base: StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.55,
        reflectance: 0.35,
        // light through the blades: against the sun, grass glows
        diffuse_transmission: if off("GLOW") { 0.0 } else { 0.45 },
        thickness: 0.0,
        double_sided: true,
        cull_mode: None,
        ..default()
        },
    });
    // the grass itself is grown around the camera as it moves (`stream`)
    commands.insert_resource(Field { material: blades, shown: default(), growing: default() });
    // the ground
    commands.spawn((
        GrassWorld,
        MEADOW,
        Mesh3d(meshes.add(crate::grass::ground(8_000.0, 200))),
        // the grass carpet: the blades' colours as a fine texture, so past the blades the field goes on to the horizon
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::WHITE,
            base_color_texture: Some(images.add(crate::grass::carpet())),
            uv_transform: bevy::math::Affine2::from_scale(Vec2::splat(8_000.0 / 2.5)),
            perceptual_roughness: 0.9,
            ..default()
        })),
    ));
}

fn leave(
    mut commands: Commands,
    world: Query<Entity, With<GrassWorld>>,
    mut plain: Query<&mut Visibility, With<Plain>>,
    mut eye: Query<(Entity, &mut Camera), With<Eye>>,
) {
    for mut v in &mut plain {
        *v = Visibility::Inherited;
    }
    for (e, mut c) in &mut eye {
        c.is_active = true;
        commands.entity(e).insert(IsDefaultUiCamera);
    }
    for e in &world {
        commands.entity(e).despawn();
    }
    commands.remove_resource::<Field>();
    commands.insert_resource(GlobalAmbientLight::default());
}

fn hours(keys: Res<ButtonInput<KeyCode>>, time: Res<Time>, mut hour: ResMut<Hour>) {
    let step = time.delta_secs() * 2.0;
    if keys.pressed(KeyCode::BracketRight) {
        hour.0 = (hour.0 + step).min(24.0);
    }
    if keys.pressed(KeyCode::BracketLeft) {
        hour.0 = (hour.0 - step).max(0.0);
    }
}

/// The sun at the hour: rising in the east (+X), highest at 13:00 in the south (-Z), setting in the west.
fn sun(hour: Res<Hour>, mut sun: Query<&mut Transform, With<Sun>>) {
    let a = (hour.0 - 7.0) / 12.0 * std::f32::consts::PI; // 0 at sunrise, π at sunset
    let to_sun = Vec3::new(a.cos(), a.sin() * 0.85 + 0.02, -a.sin() * 0.5).normalize();
    for mut t in &mut sun {
        *t = Transform::from_translation(to_sun).looking_at(Vec3::ZERO, Vec3::Y);
    }
}

/// `--meadow`: settle, measure the frame time for ten seconds without vsync, take one picture, print, quit.
pub fn measure(
    mut commands: Commands,
    m: Res<Measure>,
    d: Res<DiagnosticsStore>,
    time: Res<Time>,
    mut frames: Local<Vec<f32>>,
    mut n: Local<u32>,
    mut window: Query<&mut Window, With<PrimaryWindow>>,
    mut exit: MessageWriter<AppExit>,
) {
    *n += 1;
    // the gate: 1080p pixel for pixel, without vsync, only in this measuring run (never in the app: it would jump)
    if *n == 1
        && let Ok(mut w) = window.single_mut()
    {
        w.present_mode = PresentMode::AutoNoVsync;
        w.resolution.set_scale_factor_override(Some(1.0));
        w.resolution.set(1920.0, 1080.0);
    }
    if *n > 300 && frames.len() < 600 {
        frames.push(time.delta_secs() * 1000.0);
    }
    if frames.len() == 600 && *n < 100_000 {
        let mut f = frames.clone();
        f.sort_by(f32::total_cmp);
        let mean = f.iter().sum::<f32>() / f.len() as f32;
        println!(
            "meadow 1920x1080: mean {mean:.2} ms ({:.0} fps), p95 {:.2} ms, worst {:.2} ms, smoothed {:.2} ms",
            1000.0 / mean,
            f[f.len() * 95 / 100],
            f[f.len() - 1],
            frame_ms(&d).unwrap_or(0.0)
        );
        commands.spawn(Screenshot::primary_window()).observe(save_to_disk(m.out.clone()));
        *n = 100_000;
    }
    if *n == 100_030 {
        exit.write(AppExit::Success);
    }
}
