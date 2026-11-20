//! The Meadow: a standalone test of how real Bevy can look on this hardware. Grass in wind, a physical sky and a
//! sun, nothing else; measured at 1080p.

use crate::View;
use crate::film::Walker;
use crate::world::{Eye, Plain};
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

#[derive(Component)]
struct Moon;

#[derive(Component)]
struct Stars;

/// The image the grass world is drawn into, and the full-window picture that shows it.
#[derive(Resource)]
struct Frame(Handle<Image>);
#[derive(Component)]
struct Backdrop;

/// The size the world is drawn at for a window of `w` × `h` physical pixels: 1080 rows at most, the window's shape.
fn frame_size(w: u32, h: u32) -> UVec2 {
    let s = (1080.0 / h.max(1) as f32).min(1.0);
    UVec2::new(((w as f32 * s).round() as u32).max(1), ((h as f32 * s).round() as u32).max(1))
}

/// Keeps the frame the window's shape when the window is resized.
fn reframe(frame: Option<Res<Frame>>, window: Query<&Window, With<bevy::window::PrimaryWindow>>, mut images: ResMut<Assets<Image>>) {
    let (Some(frame), Ok(w)) = (frame, window.single()) else { return };
    let want = frame_size(w.physical_width(), w.physical_height());
    if let Some(img) = images.get(&frame.0)
        && img.size() != want
        && let Some(mut img) = images.get_mut(&frame.0)
    {
        img.resize(bevy::render::render_resource::Extent3d { width: want.x, height: want.y, depth_or_array_layers: 1 });
    }
}

/// A tile of the GPU grass: its level (cell size `FINE` × 2^level) and its place in the level's 4 × 4 tiles.
#[derive(Component)]
struct Tile {
    level: u32,
    a: u32,
    b: u32,
}

/// The finest cell of the GPU grass and its levels (as in `wind.wesl`).
const FINE: f32 = 0.04;
const LEVELS: u32 = 4; // real blades to ~35 m; the lawn beyond

/// A tile of the baked patches: its level (cell 1 m × 2^level) and its place in the level's 4 × 4 tiles.
#[derive(Component)]
struct PatchTile {
    level: u32,
    a: u32,
    b: u32,
}

fn lay_patches(state: Res<State<View>>, eye: Query<&GlobalTransform, With<Eye2>>, mut tiles: Query<(&PatchTile, &mut Transform, &mut Visibility)>) {
    let Ok(eye) = eye.single() else { return };
    let at = eye.translation();
    let hide = at.y - crate::terrain::height(at.x, at.z) > HIGH || *state.get() == View::Library;
    let n = crate::patches::TILE as f32;
    for (tile, mut t, mut v) in &mut tiles {
        let s = 2f32.powi(tile.level as i32);
        let (ox, oz) = ((at.x / s).floor() * s - 2.0 * n * s, (at.z / s).floor() * s - 2.0 * n * s);
        *t = Transform::from_xyz(ox + tile.a as f32 * n * s, 0.0, oz + tile.b as f32 * n * s).with_scale(Vec3::new(s, 1.0, s));
        *v = if hide { Visibility::Hidden } else { Visibility::Inherited };
    }
}

/// Gives the ground the baked lawn once it exists (it is baked at startup).
fn attach_lawn(lawn: Option<Res<crate::lawn::Lawn>>, field: Option<Res<Field>>, mut grounds: ResMut<Assets<crate::wind::Ground>>, mut waited: Local<u32>) {
    let (Some(lawn), Some(field)) = (lawn, field) else { return };
    // both atlases filled, and a few frames for their pictures to reach the GPU
    if lawn.done.load(std::sync::atomic::Ordering::SeqCst) < 2 {
        return;
    }
    *waited += 1;
    if *waited < 5 {
        return;
    }
    if grounds.get(&field.ground).is_some_and(|g| g.extension.lawn_albedo.is_none())
        && let Some(mut g) = grounds.get_mut(&field.ground)
    {
        g.extension.lawn = Vec4::new(1.0, crate::lawn::TOP, 0.0, 0.0);
        g.extension.lawn_albedo = Some(lawn.albedo.clone());
        g.extension.lawn_height = Some(lawn.height.clone());
    }
}

/// Spawns the baked patches' tiles once the grass patch's bake exists (it is made at startup, which a scene opened
/// from the command line enters before).
fn spawn_patches(
    mut commands: Commands,
    bake: Option<Res<crate::patches::PatchBake>>,
    field: Option<Res<Field>>,
    tiles: Query<(), With<PatchTile>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut fields: ResMut<Assets<crate::patches::PatchField>>,
) {
    let (Some(bake), Some(_)) = (bake, field) else { return };
    // the lawn carries the mid and far sward now; the patches only on request
    if !tiles.is_empty() || std::env::var_os("MEADOW_PATCHES").is_none() {
        return;
    }
    let material = fields.add(crate::patches::PatchField::of(&bake.0, 7.0));
    let tile = meshes.add(crate::patches::tile());
    for level in 0..2 {
        for a in 0..4 {
            for b in 0..4 {
                commands.spawn((GrassWorld, MEADOW, PatchTile { level, a, b }, Mesh3d(tile.clone()), MeshMaterial3d(material.clone()), Transform::default()));
            }
        }
    }
}

/// Lays each level's tiles around the eye, on whole cells, so every blade stays fixed to the world; hides them all
/// high above, where the far land alone is drawn.
fn lay(state: Res<State<View>>, eye: Query<&GlobalTransform, With<Eye2>>, mut tiles: Query<(&Tile, &mut Transform, &mut Visibility)>) {
    let Ok(eye) = eye.single() else { return };
    let at = eye.translation();
    let high = at.y - crate::terrain::height(at.x, at.z) > HIGH || *state.get() == View::Library;
    let n = crate::grass::TILE as f32;
    for (tile, mut t, mut v) in &mut tiles {
        let s = FINE * 2f32.powi(tile.level as i32);
        let (ox, oz) = ((at.x / s).floor() * s - 2.0 * n * s, (at.z / s).floor() * s - 2.0 * n * s);
        // the cell size rides in the scale (the shader reads it back); y stays 1
        *t = Transform::from_xyz(ox + tile.a as f32 * n * s, 0.0, oz + tile.b as f32 * n * s).with_scale(Vec3::new(s, 1.0, s));
        *v = if high { Visibility::Hidden } else { Visibility::Inherited };
    }
}

/// Focuses the lens where the eye looks: on the land straight ahead, or far when it looks over it.
fn focus(mut cam: Query<(&GlobalTransform, &mut bevy::post_process::dof::DepthOfField), With<Eye2>>) {
    for (g, mut dof) in &mut cam {
        let (at, ahead) = (g.translation(), g.forward().as_vec3());
        let above = at.y - crate::terrain::height(at.x, at.z);
        let d = if ahead.y < -0.02 { above / -ahead.y } else { 60.0 };
        dof.focal_distance = d.clamp(1.5, 400.0);
    }
}

/// The grass world's camera.
#[derive(Component)]
pub struct Eye2;

/// The grass around the camera: the chunks shown, each with the ring class it was grown for, and the ones growing in
/// the background. A chunk is fixed to the world; as the camera moves, near chunks are regrown at full detail and far
/// ones thinned, so the field looks the same density wherever you walk.
#[derive(Resource)]
struct Field {
    material: Handle<crate::wind::Grass>,
    /// The close layer's: the same, but sinking into the ground away from the eye.
    close: Handle<crate::wind::Grass>,
    /// The land's own material: no texture, the colour is in the geometry.
    ground: Handle<crate::wind::Ground>,
    /// Each chunk shown: its grass, its ground, and the ring class it was grown for.
    shown: HashMap<(i32, i32), (Vec<Entity>, i32)>,
    growing: HashMap<(i32, i32), (Task<(Mesh, Option<Mesh>, Mesh)>, i32)>,
    /// The land beyond the grass, out to the horizon, and where the eye was when it was last built.
    far: Handle<Mesh>,
    far_at: (i32, i32),
    far_task: Option<Task<Mesh>>,
    /// Whether the eye was high (above `HIGH`) when the far land was last built.
    far_high: bool,
}

/// Above this height over the land, the near grass and ground are not drawn: the far land reaches right under the eye.
const HIGH: f32 = 60.0;

/// The ring class of a chunk `ring` chunks from the camera's: rings 0 and 1 are one class (full detail), rings 7 and out
/// another.
fn class(ring: i32) -> i32 {
    ring.clamp(1, 7)
}

/// Grows and drops chunks around the camera; at most a few new ones a frame, nearest first.
fn stream(
    mut commands: Commands,
    state: Res<State<View>>,
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
    let high = at.y - crate::terrain::height(at.x, at.z) > HIGH;
    // the land beyond the grass: rebuilt around the eye whenever it has moved 40 m, or crossed the height where the
    // near detail hands over to it
    // built in the background: the near ground's square is left out of it, two chunks smaller than the near rings so
    // the two always overlap a little (the far land lies lower) and never leave a gap while one catches up
    if ((cx, cz) != field.far_at || high != field.far_high) && field.far_task.is_none() {
        field.far_at = (cx, cz);
        field.far_high = high;
        // no hole for the near ground: the far land lies a little under it everywhere, so while chunks stream in
        // (or lag behind a fast eye) the land is always there, never the sky through a gap
        let hole: Option<[f32; 4]> = None;
        let (x, z) = (at.x, at.z);
        field.far_task = Some(AsyncComputeTaskPool::get().spawn(async move { crate::terrain::far(x, z, hole) }));
    }
    if let Some(task) = field.far_task.as_mut()
        && let Some(mesh) = check_ready(task)
    {
        field.far_task = None;
        if let Some(mut m) = meshes.get_mut(&field.far) {
            *m = mesh;
        }
    }
    if high {
        // high above: no near grass or ground at all, only the far land
        for (_, (parts, _)) in field.shown.drain() {
            for e in parts {
                commands.entity(e).despawn();
            }
        }
        field.growing.clear();
        return;
    }
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
        if !ok_shown && !ok_growing && started < 16 {
            let (x, z) = key;
            let s = share(c);
            // in the Library only the land: no grass, plants or stones around its turntable
            let bare = *state.get() == View::Library;
            field.growing.insert(
                key,
                (
                    pool.spawn(async move {
                        let land = if bare { crate::terrain::chunk(x, z, CHUNK, 0.2) } else { crate::terrain::chunk(x, z, CHUNK, s) };
                        (if bare { Mesh::new(bevy::mesh::PrimitiveTopology::TriangleList, bevy::asset::RenderAssetUsages::RENDER_WORLD) } else { chunk(x, z, s) }, None, land)
                    }),
                    c,
                ),
            );
            started += 1;
        }
    }
    // drop what is out of reach
    let keep: HashMap<(i32, i32), i32> = wanted.into_iter().collect();
    let gone: Vec<_> = field.shown.keys().filter(|k| !keep.contains_key(*k)).copied().collect();
    for k in gone {
        if let Some((parts, _)) = field.shown.remove(&k) {
            for e in parts {
                commands.entity(e).despawn();
            }
        }
    }
    field.growing.retain(|k, _| keep.contains_key(k));
    // show what has grown, replacing what was there only once the new chunk is ready (no holes)
    let ready: Vec<_> = field
        .growing
        .iter_mut()
        .filter_map(|(k, (task, c))| check_ready(task).map(|meshes| (*k, *c, meshes)))
        .collect();
    for (k, c, (grass, close, ground)) in ready {
        field.growing.remove(&k);
        let mut parts = vec![commands.spawn((GrassWorld, MEADOW, Mesh3d(meshes.add(ground)), MeshMaterial3d(field.ground.clone()))).id()];
        // the blades stay out of the sun's shadow maps: they would draw every blade twice more each frame; the shade
        // among them comes from their dark roots and the ambient occlusion instead. (None in the Library.)
        if grass.count_vertices() > 0 {
            parts.push(commands.spawn((GrassWorld, MEADOW, Mesh3d(meshes.add(grass)), MeshMaterial3d(field.material.clone()), bevy::light::NotShadowCaster)).id());
        }
        if let Some(close) = close {
            // fine blades cast no shadow of their own: too small to see in the sun's shadow maps, and it saves them
            parts.push(
                commands
                    .spawn((GrassWorld, MEADOW, Mesh3d(meshes.add(close)), MeshMaterial3d(field.close.clone()), bevy::light::NotShadowCaster))
                    .id(),
            );
        }
        if let Some((old, _)) = field.shown.insert(k, (parts, c)) {
            for e in old {
                commands.entity(e).despawn();
            }
        }
    }
}

/// Everything of the grass world, removed when its view closes.
#[derive(Component)]
struct GrassWorld;

/// The Meadow's own render layer: its camera sees only its own sky, sun, grass and ground, never the plain.
pub const MEADOW: RenderLayers = RenderLayers::layer(1);

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
        // the Library shows its assets in this same world: its sky, sun, haze and land, without the grass
        .add_systems(OnEnter(View::Library), enter)
        .add_systems(OnExit(View::Library), leave)
        .add_systems(
            Update,
            (stream, lay, spawn_patches, lay_patches, attach_lawn, reframe, focus, crate::clouds::drift).run_if(|v: Res<State<View>>| matches!(v.get(), View::Meadow | View::Studio | View::Library)),
        )
        .add_systems(Update, (hours, sun).chain().run_if(|v: Res<State<View>>| matches!(v.get(), View::Meadow | View::Studio | View::Library)));
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
    mut grounds: ResMut<Assets<crate::wind::Ground>>,
    mut images: ResMut<Assets<Image>>,
    mut plain: Query<&mut Visibility, With<Plain>>,
    mut eye: Query<(Entity, &mut Camera), With<Eye>>,
    mut walker: ResMut<Walker>,
    window: Query<&Window, With<bevy::window::PrimaryWindow>>,
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
    // the moon: opposite the sun, a cool faint light, no shadows (they would cost a second set of shadow maps)
    commands.spawn((
        GrassWorld,
        MEADOW,
        Moon,
        DirectionalLight { shadow_maps_enabled: false, illuminance: 0.0, color: Color::srgb(0.70, 0.78, 1.0), ..default() },
        SunDisk { angular_size: 0.009, intensity: 0.0 },
        Transform::default(),
    ));
    // the stars: a dome of small glowing points far off, faded in as the sky darkens
    let stars = materials.add(StandardMaterial {
        base_color: Color::BLACK,
        unlit: true,
        fog_enabled: false,
        ..default()
    });
    commands.spawn((GrassWorld, MEADOW, Stars, Mesh3d(meshes.add(star_dome(2500, 9_000.0))), MeshMaterial3d(stars), bevy::light::NotShadowCaster));
    // the clouds: fair-weather cumulus 1.5 km up, drifting with the wind
    commands.spawn((GrassWorld, MEADOW, crate::clouds::layer(&mut meshes, &mut materials, &mut images, 0.45)));
    // the parts that cost time, each switchable for measuring: MEADOW_NO_<PART>=1
    let off = |part: &str| std::env::var_os(format!("MEADOW_NO_{part}")).is_some();
    // the world is drawn at 1080p (the gate), not at the window's full Retina size (about five times the pixels), into
    // an image the interface then shows over the whole window; the interface itself stays sharp on top
    let size = window.single().map(|w| frame_size(w.physical_width(), w.physical_height())).unwrap_or(UVec2::new(1920, 1080));
    let frame = images.add(bevy::image::Image::new_target_texture(
        size.x,
        size.y,
        bevy::render::render_resource::TextureFormat::Rgba8Unorm,
        Some(bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb),
    ));
    commands.insert_resource(Frame(frame.clone()));
    commands.spawn((GrassWorld, Camera2d, Camera { order: 2, ..default() }, IsDefaultUiCamera));
    commands.spawn((
        GrassWorld,
        Backdrop,
        Pickable::IGNORE,
        GlobalZIndex(-1),
        ImageNode::new(frame.clone()),
        Node { position_type: PositionType::Absolute, width: Val::Percent(100.0), height: Val::Percent(100.0), ..default() },
    ));
    let mut cam = commands.spawn((
        GrassWorld,
        MEADOW,
        Eye2,
        Camera3d::default(),
        Camera { order: 1, ..default() },
        bevy::camera::RenderTarget::Image(frame.into()),
        Projection::Perspective(PerspectiveProjection { near: 0.05, far: 500_000.0, ..default() }),
        Transform::from_xyz(0.0, 1.6, 0.0),
        Exposure { ev100: 13.0 },
        // AgX keeps greens green and a bright evening sky soft; ACES pushed the grass toward yellow
        Tonemapping::AgX,
        Msaa::Off,
    ));
    if !off("SKY") {
        // the sky cost 24 ms a frame at its defaults on this Mac; smaller tables and fewer samples look the same here
        cam.insert((
            AtmosphereSettings {
                sky_view_lut_size: UVec2::new(256, 128),
                sky_view_lut_samples: 10,
                multiscattering_lut_dirs: 32,
                aerial_view_lut_size: UVec3::new(32, 32, 16),
                aerial_view_lut_samples: 6,
                sky_max_samples: 8,
                ..default()
            },
        ));
        if !off("ENV") {
            cam.insert(AtmosphereEnvironmentMapLight { size: UVec2::splat(64), ..default() });
        }
    }
    if !off("BLOOM") {
        // a little more bloom than natural: the sun and the backlit grass bleed light, as through a real lens
        cam.insert(Bloom { intensity: 0.22, ..Bloom::NATURAL });
    }
    if !off("TAA") {
        // SMAA, not TAA: TAA blends each frame with the last, and on blades a few pixels thin it pulled the sky of the
        // frame before into them (the white-blue streaks); SMAA smooths each frame on its own
        cam.insert(bevy::anti_alias::smaa::Smaa { preset: bevy::anti_alias::smaa::SmaaPreset::High });
    }
    if !off("HAZE") {
        // haze: distance fades into the air's own blue-grey, warm toward the sun; ~12 km to the horizon of sight
        cam.insert(DistanceFog {
            color: Color::srgb(0.62, 0.70, 0.80),
            // a wide, warm glow around the sun: its light scattering in the haze
            directional_light_color: Color::srgba(1.0, 0.85, 0.62, 0.85),
            directional_light_exponent: 8.0,
            falloff: FogFalloff::from_visibility_colors(45_000.0, Color::srgb(0.35, 0.48, 0.66), Color::srgb(0.80, 0.85, 0.92)),
        });
    }
    // the lens's depth of field cost about 10 ms a frame here: only when asked for (MEADOW_DOF=1)
    if std::env::var_os("MEADOW_DOF").is_some() {
        // a 35 mm lens at f/1.8: what is far off softens, as in a photograph
        cam.insert(bevy::post_process::dof::DepthOfField {
            mode: bevy::post_process::dof::DepthOfFieldMode::Gaussian,
            aperture_f_stops: 1.8,
            focal_distance: 6.0,
            max_circle_of_confusion_diameter: 12.0,
            ..default()
        });
    }
    if !off("AO") {
        cam.insert(ScreenSpaceAmbientOcclusion::default()); // soft shading where blades crowd and meet the ground
    }
    // the grass: one mesh a chunk, so the view culls it a chunk at a time
    let blades = grass.add(crate::wind::Grass {
        extension: crate::wind::Wind { params: default() },
        base: StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.85,
        reflectance: 0.05,
        // light through the blades: against the sun, grass glows
        diffuse_transmission: if off("GLOW") { 0.0 } else { 0.8 }, // backlit blades glow yellow-green
        thickness: 0.0,
        double_sided: true,
        cull_mode: None,
        ..default()
        },
    });
    // the land: its own material, no texture (the colour is in the geometry, from terrain.rs)
    // the recipe: the file in biomes/ if there is one, else the built-in meadow (written there, to be edited)
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/biomes/meadow.json");
    let biome = std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(crate::biome::Biome::meadow);
    crate::biome::set(biome.clone());
    // the recipe kept beside the code, as the file future biomes will be
    let _ = std::fs::write(path, serde_json::to_string_pretty(&biome).unwrap_or_default());
    let ground = grounds.add(crate::wind::Ground {
        base: StandardMaterial { base_color: Color::WHITE, perceptual_roughness: 0.95, reflectance: 0.3, cull_mode: None, ..default() },
        extension: crate::wind::GroundLook { biome: biome.uniform(), lawn: Vec4::ZERO, lawn_albedo: None, lawn_height: None, sun: Vec4::Y },
    });
    // the land beyond the grass, to the horizon, rebuilt around the eye as it moves (`stream`)
    let far = meshes.add(crate::terrain::far(0.0, 0.0, None));
    commands.spawn((GrassWorld, MEADOW, Mesh3d(far.clone()), MeshMaterial3d(ground.clone())));
    // the grass and the near land are grown around the camera as it moves (`stream`)
    let close = {
        let mut m = grass.get(&blades).cloned().expect("the grass material was just added");
        m.extension.params.eye.w = 1.0;
        grass.add(m)
    };
    // the GPU grass: 5 levels of 4 × 4 tiles, each tile 64 × 64 blades made in the vertex shader; the finest level
    // with four segments a blade, the others three. Their bounds are set wide by hand (the mesh holds only slots).
    let made = {
        let mut m = grass.get(&blades).cloned().expect("the grass material was just added");
        m.extension.params.eye.w = 2.0;
        let g = &biome.grass;
        m.extension.params.deep = Vec4::new(g.deep[0], g.deep[1], g.deep[2], g.height);
        m.extension.params.light = Vec4::new(g.light[0], g.light[1], g.light[2], g.height_range);
        m.base.double_sided = false; // the shader turns each blade's normal toward the eye itself
        grass.add(m)
    };
    if !off("GRASS") {
        let fine = meshes.add(crate::grass::tile(4));
        let coarse = meshes.add(crate::grass::tile(3));
        for level in 0..LEVELS {
            for a in 0..4 {
                for b in 0..4 {
                    commands.spawn((
                        GrassWorld,
                        MEADOW,
                        Tile { level, a, b },
                        Mesh3d(if level == 0 { fine.clone() } else { coarse.clone() }),
                        MeshMaterial3d(made.clone()),
                        bevy::light::NotShadowCaster,
                        Transform::default(),
                    ));
                }
            }
        }
    }
    commands.insert_resource(Field { material: blades, close, ground, shown: default(), growing: default(), far, far_at: (i32::MIN, 0), far_task: None, far_high: false });
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
    commands.remove_resource::<Frame>();
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
#[allow(clippy::type_complexity)]
fn sun(
    hour: Res<Hour>,
    field: Option<Res<Field>>,
    mut grounds: ResMut<Assets<crate::wind::Ground>>,
    mut sun: Query<&mut Transform, (With<Sun>, Without<Moon>, Without<Stars>, Without<Eye2>)>,
    mut moon: Query<(&mut Transform, &mut DirectionalLight, &mut SunDisk), (With<Moon>, Without<Sun>, Without<Stars>, Without<Eye2>)>,
    mut stars: Query<(&mut Transform, &mut Visibility, &MeshMaterial3d<StandardMaterial>), (With<Stars>, Without<Sun>, Without<Moon>, Without<Eye2>)>,
    mut eye: Query<(&GlobalTransform, &mut Exposure), With<Eye2>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let a = (hour.0 - 7.0) / 12.0 * std::f32::consts::PI; // 0 at sunrise, π at sunset
    let to_sun = Vec3::new(a.cos(), a.sin() * 0.85 + 0.02, -a.sin() * 0.5).normalize();
    // the lawn's blades shade each other along the sun's direction
    if let Some(field) = field.as_ref()
        && grounds.get(&field.ground).is_some_and(|g| g.extension.sun.truncate().distance(to_sun) > 0.002)
        && let Some(mut g) = grounds.get_mut(&field.ground)
    {
        g.extension.sun = to_sun.extend(0.0);
    }
    for mut t in &mut sun {
        *t = Transform::from_translation(to_sun).looking_at(Vec3::ZERO, Vec3::Y);
    }
    // how dark it is: 0 by day, 1 in full night, rising through dusk while the sun goes 6° below the horizon
    let night = ((0.08 - to_sun.y) / 0.18).clamp(0.0, 1.0);
    let night = night * night * (3.0 - 2.0 * night);
    // the moon stands opposite the sun, a little higher, and lights only by night
    let to_moon = Vec3::new(-to_sun.x, (-to_sun.y).max(0.0) * 0.8 + 0.25, -to_sun.z * 0.6 + 0.3).normalize();
    for (mut t, mut light, mut disk) in &mut moon {
        *t = Transform::from_translation(to_moon).looking_at(Vec3::ZERO, Vec3::Y);
        light.illuminance = 400.0 * night;
        disk.intensity = night;
    }
    // the eye adapts: exposed for the sun by day, opened up by night so the moonlit field can be seen
    let ev = 13.0 - 7.5 * night;
    let mut at = Vec3::ZERO;
    for (g, mut e) in &mut eye {
        e.ev100 = ev;
        at = g.translation();
    }
    for (mut t, mut v, m) in &mut stars {
        t.translation = at; // the stars stay infinitely far: they move with the eye, its height too
        // by day there are none to draw (their black would show against the clouds below a high eye)
        *v = if night > 0.0 { Visibility::Inherited } else { Visibility::Hidden };
        if let Some(mut mat) = materials.get_mut(&m.0) {
            // bright enough to read against the exposure of the night (an unlit colour is divided by 1.2 × 2^ev on the
            // way to the screen), gone by day; each star's own brightness is its vertex colour
            let k = night * 1.2 * 2.0f32.powf(ev) * 0.9;
            mat.base_color = Color::linear_rgb(k, k, k);
        }
    }
}

/// The night sky's stars: `n` small points on a dome `radius` metres away, each its own size and brightness.
fn star_dome(n: u32, radius: f32) -> Mesh {
    use bevy::asset::RenderAssetUsages;
    use bevy::mesh::{Indices, PrimitiveTopology};
    let h = |i: u32, k: u32| {
        let mut x = i.wrapping_mul(0x9E37_79B1) ^ k.wrapping_mul(0x85EB_CA77);
        x ^= x >> 15;
        x = x.wrapping_mul(0x2C1B_3C6D);
        x ^= x >> 12;
        (x >> 8) as f32 / (1u32 << 24) as f32
    };
    let (mut pos, mut col, mut idx) = (vec![], vec![], vec![]);
    for i in 0..n {
        // even over the upper sphere, a little below the horizon too
        let y = 0.03 + h(i, 1) * 0.97; // above the horizon only: seen from high up, none lie below the eye
        let a = h(i, 2) * std::f32::consts::TAU;
        let r = (1.0 - y * y).max(0.0).sqrt();
        let dir = Vec3::new(r * a.cos(), y, r * a.sin());
        let c = dir * radius;
        let size = radius * (0.0009 + 0.0022 * h(i, 3).powi(6));
        let bright = 0.15 + 0.85 * h(i, 4).powi(3);
        let tint = Vec3::new(1.0, 0.95 + 0.05 * h(i, 5), 0.85 + 0.25 * h(i, 5)) * bright;
        let side = dir.cross(Vec3::Y).try_normalize().unwrap_or(Vec3::X) * size;
        let up = dir.cross(side).normalize() * size;
        let s = pos.len() as u32;
        for p in [c - side - up, c + side - up, c + side + up, c - side + up] {
            pos.push(p.to_array());
            col.push([tint.x, tint.y, tint.z, 1.0]);
        }
        idx.extend_from_slice(&[s, s + 1, s + 2, s, s + 2, s + 3]);
    }
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0.0f32, -1.0, 0.0]; n as usize * 4])
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, col)
        .with_inserted_indices(Indices::U32(idx))
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
