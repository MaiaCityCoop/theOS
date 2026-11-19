//! The Library: every asset of the library one at a time, its master on a turntable in plain daylight. ← → step
//! through the assets, Space makes a new individual (a new seed), the mouse wheel moves closer or further. It shows
//! what each asset is made of and how many triangles its master has, the reference every LOD and far view is made
//! from.

use crate::View;
use crate::world::{Eye, Plain};
use bevy::camera::visibility::RenderLayers;
use bevy::prelude::*;

const LAYER: RenderLayers = RenderLayers::layer(3);

#[derive(Resource)]
pub struct Shelf {
    pub names: Vec<String>,
    pub at: usize,
    pub seed: u32,
    pub dirty: bool,
    pub zoom: f32,
}

#[derive(Component)]
struct Room;
#[derive(Component)]
struct Specimen;
#[derive(Component)]
struct Turn;
#[derive(Component)]
pub struct Caption;
/// Which turntable: 0 the master, 1 its impostor.
#[derive(Component)]
struct Side(u8);

pub fn plugin(app: &mut App) {
    app.add_systems(OnEnter(View::Library), enter)
        .add_systems(OnExit(View::Library), leave)
        .add_systems(Update, (keys, show, turn).chain().run_if(in_state(View::Library)));
}

fn enter(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut plain: Query<&mut Visibility, With<Plain>>,
    mut eye: Query<(Entity, &mut Camera), With<Eye>>,
) {
    for mut v in &mut plain {
        *v = Visibility::Hidden;
    }
    for (e, mut c) in &mut eye {
        c.is_active = false;
        commands.entity(e).remove::<IsDefaultUiCamera>();
    }
    let names: Vec<String> = crate::library::load().keys().cloned().collect();
    commands.insert_resource(Shelf { names, at: 0, seed: 1, dirty: true, zoom: 1.0 });
    commands.spawn((
        Room,
        LAYER,
        Camera3d::default(),
        Camera { order: 3, clear_color: ClearColorConfig::Custom(Color::srgb(0.80, 0.82, 0.80)), ..default() },
        IsDefaultUiCamera,
        Projection::Perspective(PerspectiveProjection { near: 0.005, ..default() }),
        Transform::from_xyz(0.0, 0.3, 0.8).looking_at(Vec3::new(0.0, 0.05, 0.0), Vec3::Y),
    ));
    commands.spawn((
        Room,
        LAYER,
        DirectionalLight { illuminance: 8_000.0, shadow_maps_enabled: true, ..default() },
        Transform::from_xyz(2.0, 3.0, 1.5).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.insert_resource(GlobalAmbientLight { brightness: 400.0, ..default() });
    // a plain floor, a neutral grey, for scale and contact shadow
    commands.spawn((
        Room,
        LAYER,
        Mesh3d(meshes.add(Circle::new(1.5).mesh())),
        MeshMaterial3d(materials.add(StandardMaterial { base_color: Color::srgb(0.32, 0.32, 0.30), perceptual_roughness: 1.0, ..default() })),
        Transform::from_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2)),
    ));
    // two turntables: the master on the left, its baked far view (the impostor) on the right
    commands.spawn((Room, Turn, Side(0), LAYER, Transform::default(), Visibility::default()));
    commands.spawn((Room, Turn, Side(1), LAYER, Transform::default(), Visibility::default()));
}

fn leave(mut commands: Commands, room: Query<Entity, With<Room>>, mut plain: Query<&mut Visibility, With<Plain>>, mut eye: Query<(Entity, &mut Camera), With<Eye>>) {
    for e in &room {
        commands.entity(e).despawn();
    }
    for mut v in &mut plain {
        *v = Visibility::Inherited;
    }
    for (e, mut c) in &mut eye {
        c.is_active = true;
        commands.entity(e).insert(IsDefaultUiCamera);
    }
    commands.remove_resource::<Shelf>();
    commands.insert_resource(GlobalAmbientLight::default());
}

fn keys(keys: Res<ButtonInput<KeyCode>>, scroll: Res<bevy::input::mouse::AccumulatedMouseScroll>, shelf: Option<ResMut<Shelf>>) {
    let Some(mut s) = shelf else { return };
    let n = s.names.len().max(1);
    if keys.just_pressed(KeyCode::ArrowRight) {
        s.at = (s.at + 1) % n;
        s.dirty = true;
    }
    if keys.just_pressed(KeyCode::ArrowLeft) {
        s.at = (s.at + n - 1) % n;
        s.dirty = true;
    }
    if keys.just_pressed(KeyCode::Space) {
        s.seed = s.seed.wrapping_add(1);
        s.dirty = true;
    }
    if scroll.delta.y != 0.0 {
        s.zoom = (s.zoom * 1.1f32.powf(-scroll.delta.y.signum())).clamp(0.2, 5.0);
    }
}

/// Builds the current asset's master when it changes, and frames it.
fn show(
    mut commands: Commands,
    shelf: Option<ResMut<Shelf>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut bakes: ResMut<Assets<crate::impostor::NormalBake>>,
    mut impostors: ResMut<Assets<crate::impostor::Impostor>>,
    mut turn: Query<(Entity, &Side, &mut Transform), (With<Turn>, Without<Camera3d>)>,
    old: Query<Entity, With<Specimen>>,
    mut cam: Query<&mut Transform, (With<Room>, With<Camera3d>, Without<Turn>)>,
    mut caption: Query<&mut Text, With<Caption>>,
) {
    let Some(mut s) = shelf else { return };
    let library = crate::library::load();
    let Some(a) = s.names.get(s.at).and_then(|n| library.get(n)) else { return };
    // the camera stands back by the asset's size
    let size = a.size[1].max(0.05);
    for mut t in &mut cam {
        let d = size * 3.2 * s.zoom;
        *t = Transform::from_xyz(0.0, d * 0.45, d).looking_at(Vec3::new(0.0, size * 0.25, 0.0), Vec3::Y);
    }
    for (_, side, mut t) in &mut turn {
        t.translation.x = if side.0 == 0 { -size * 0.75 } else { size * 0.75 };
    }
    if !s.dirty {
        return;
    }
    s.dirty = false;
    for e in &old {
        commands.entity(e).despawn();
    }
    let mesh = crate::library::master(a, s.seed);
    let tris = crate::library::triangles(&mesh);
    let baked = crate::impostor::bake(&mut commands, mesh.clone(), &mut meshes, &mut images, &mut materials, &mut bakes);
    let (Some(parent), Some(far)) = (turn.iter().find(|t| t.1.0 == 0).map(|t| t.0), turn.iter().find(|t| t.1.0 == 1).map(|t| t.0)) else { return };
    let imp = commands
        .spawn((
            Specimen,
            LAYER,
            Mesh3d(meshes.add(crate::impostor::quad())),
            MeshMaterial3d(impostors.add(crate::impostor::Impostor::of(&baked))),
            bevy::camera::visibility::NoFrustumCulling,
            // its shadow would be the bare quad's: the shadow pass does not turn it
            bevy::light::NotShadowCaster,
            Transform::default(),
        ))
        .id();
    commands.entity(far).add_child(imp);
    // the atlas itself, small, bottom right: the 8 × 8 views of the master as baked
    commands.spawn((
        Specimen,
        ImageNode::new(baked.albedo.clone()),
        Node { position_type: PositionType::Absolute, right: Val::Px(12.0), bottom: Val::Px(12.0), width: Val::Px(256.0), height: Val::Px(256.0), ..default() },
        BackgroundColor(Color::srgb(0.15, 0.15, 0.15)),
    ));
    let child = commands
        .spawn((
            Specimen,
            LAYER,
            Mesh3d(meshes.add(mesh)),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: Color::WHITE,
                perceptual_roughness: 0.85,
                reflectance: 0.1,
                double_sided: true,
                cull_mode: None,
                diffuse_transmission: if a.kind == "plant" { 0.5 } else { 0.0 },
                ..default()
            })),
            Transform::default(),
        ))
        .id();
    commands.entity(parent).add_child(child);
    for mut t in &mut caption {
        t.0 = format!(
            "{} · {} · generator {} · {:.0}–{:.0} cm · seed {} · master {} triangles | impostor 2 triangles, {}×{} views · {}/{}",
            a.name,
            a.kind,
            a.generator,
            a.size[0] * 100.0,
            a.size[1] * 100.0,
            s.seed,
            tris,
            crate::impostor::FRAMES,
            crate::impostor::FRAMES,
            s.at + 1,
            s.names.len()
        );
    }
}

fn turn(time: Res<Time>, mut t: Query<&mut Transform, With<Turn>>) {
    for mut t in &mut t {
        t.rotate_y(time.delta_secs() * 0.35);
    }
}

/// `--shelf <dir>`: one picture of every asset, master beside its impostor, then quit (for checking the bake).
#[derive(Resource)]
pub struct ShelfShots {
    pub dir: std::path::PathBuf,
}

pub fn shelf_shots(
    mut commands: Commands,
    shots: Res<ShelfShots>,
    shelf: Option<ResMut<Shelf>>,
    mut n: Local<u32>,
    mut exit: MessageWriter<AppExit>,
) {
    let Some(mut s) = shelf else { return };
    *n += 1;
    let wait = if s.at == 0 { 300 } else { 140 };
    if *n == wait {
        let name = s.names.get(s.at).cloned().unwrap_or_default().replace(' ', "-");
        commands
            .spawn(bevy::render::view::screenshot::Screenshot::primary_window())
            .observe(bevy::render::view::screenshot::save_to_disk(shots.dir.join(format!("{}-{name}.png", s.at))));
    }
    if *n == wait + 10 {
        *n = 0;
        if s.at + 1 >= s.names.len() {
            exit.write(AppExit::Success);
        } else {
            s.at += 1;
            s.dirty = true;
        }
    }
}
