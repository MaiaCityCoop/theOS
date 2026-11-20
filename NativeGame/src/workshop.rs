//! The Library: every asset of the library one at a time, on a turntable in the Meadow's own world (its sky, sun,
//! haze and land; the grass cleared around it), as its full mesh or as its far view, in the same place: F or the
//! toggle switches between them (intent 0050). ← → step through the assets, Space makes a new individual (a new
//! seed), the mouse wheel moves closer or further. It shows what each asset is made of and how many triangles its
//! master has, the reference every LOD and far view is made from.

use crate::View;
use crate::contract::World;
use bevy::camera::visibility::RenderLayers;
use bevy::prelude::*;

const LAYER: RenderLayers = crate::meadow::MEADOW;
/// How high the bed the assets stand on lies above the land.
const PLINTH: f32 = 0.25;

#[derive(Resource)]
pub struct Shelf {
    pub names: Vec<String>,
    pub at: usize,
    pub seed: u32,
    pub dirty: bool,
    pub zoom: f32,
    /// Showing the far view instead of the full mesh.
    pub far: bool,
}

/// The toggle's words: what the turntable shows now.
#[derive(Component)]
pub struct FarLabel;

/// The asset as its full mesh (false) or its far view (true).
#[derive(Component)]
struct Shows(bool);

#[derive(Component)]
struct Room;
#[derive(Component)]
struct Specimen;
#[derive(Component)]
struct Turn;
#[derive(Component)]
pub struct Caption;

pub fn plugin(app: &mut App) {
    app.add_systems(OnEnter(World::Library), enter)
        .add_systems(OnExit(World::Library), leave)
        .add_systems(Update, (keys, show, turn, toggle).chain().run_if(in_state(World::Library)));
}

/// The Meadow's hour, kept while the Library shows its assets in late-morning light, and given back on leaving.
#[derive(Resource)]
struct MeadowHour(f32);

/// The Library's hour: late morning, the sun high enough to light an asset from the side without long shadows.
const HOUR: f32 = 10.5;

fn enter(mut commands: Commands, mut meshes: ResMut<Assets<Mesh>>, mut materials: ResMut<Assets<StandardMaterial>>, mut clock: ResMut<crate::contract::Clock>) {
    commands.insert_resource(MeadowHour(clock.hour));
    clock.hour = HOUR;
    let names: Vec<String> = crate::library::shelf().into_iter().map(|a| a.name).collect();
    commands.insert_resource(Shelf { names, at: 0, seed: 1, dirty: true, zoom: 1.0, far: false });
    // one turntable on the land at the origin, the asset as its full mesh or its far view in the same place,
    // on a flat bed of the meadow's soil, a little above the land: its tussocks (up to 20 cm) would hide a clover
    let ground = crate::terrain::height(0.0, 0.0) + PLINTH;
    commands.spawn((
        Room,
        LAYER,
        Mesh3d(meshes.add(Cylinder::new(2.0, PLINTH).mesh().resolution(64).build())),
        MeshMaterial3d(materials.add(StandardMaterial { base_color: Color::srgb(0.30, 0.24, 0.17), perceptual_roughness: 1.0, reflectance: 0.0, ..default() })),
        Transform::from_xyz(0.0, ground - PLINTH * 0.5, 0.0),
    ));
    commands.spawn((Room, Turn, LAYER, Transform::from_xyz(0.0, ground, 0.0), Visibility::default()));
}

fn leave(mut commands: Commands, room: Query<Entity, With<Room>>, kept: Option<Res<MeadowHour>>, mut clock: ResMut<crate::contract::Clock>) {
    if let Some(k) = kept {
        clock.hour = k.0;
    }
    commands.remove_resource::<MeadowHour>();
    for e in &room {
        commands.entity(e).despawn();
    }
    commands.remove_resource::<Shelf>();
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
    if keys.just_pressed(KeyCode::KeyF) {
        s.far = !s.far;
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
    turn: Query<Entity, With<Turn>>,
    old: Query<Entity, With<Specimen>>,
    mut eye: ResMut<crate::contract::Eye>,
    view: Res<State<View>>,
    studio: Res<crate::film::Studio>,
    mut caption: Query<&mut Text, With<Caption>>,
    mut far_views: Local<std::collections::HashMap<String, crate::impostor::Baked>>,
) {
    let Some(mut s) = shelf else { return };
    // filmed by the Studio: the shelf shows the asset the shot names (its doc, by id)
    if *view.get() == View::Studio
        && let Some(id) = studio.timeline.shot_at(studio.time).and_then(|(i, _)| studio.timeline.clips[i].world.clone())
        && let Some(name) = crate::db().file(&id).ok().flatten().and_then(|b| serde_json::from_slice::<crate::library::Asset>(&b).ok()).map(|a| a.name)
        && let Some(at) = s.names.iter().position(|n| *n == name)
        && at != s.at
    {
        s.at = at;
        s.dirty = true;
    }
    let library = crate::library::load();
    let Some(a) = s.names.get(s.at).and_then(|n| library.get(n)) else { return };
    // the camera stands back by the asset's size
    let size = a.size[1].max(0.05);
    // in the Library view the eye stands back by the asset's size; filmed by the Studio, the shot holds the eye
    if *view.get() == View::Library {
        let d = size * 3.2 * s.zoom;
        let ground = crate::terrain::height(0.0, 0.0) + PLINTH;
        (eye.pos, eye.look, eye.roll) = (Vec3::new(0.0, ground + d * 0.6, d), Vec3::new(0.0, ground + size * 0.25, 0.0), 0.0);
        // the lens that sees 45° tall, as the turntables were framed for
        eye.lens = crate::contract::Lens::seeing(45f32.to_radians(), 16.0 / 9.0);
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
    // the asset's far view: made once for the asset, not for the seed; a new seed is drawn as one of its variants
    let baked = match far_views.get(&a.name) {
        Some(b) => b.clone(),
        None => {
            let b = crate::impostor::bake(&mut commands, a, &mut meshes, &mut images, &mut materials, &mut bakes);
            far_views.insert(a.name.clone(), b.clone());
            b
        }
    };
    let variant = crate::library::variant_of(a, s.seed);
    let Some(table) = turn.iter().next() else { return };
    let imp = commands
        .spawn((
            Specimen,
            Shows(true),
            LAYER,
            Mesh3d(meshes.add(crate::impostor::quad())),
            MeshMaterial3d(impostors.add(crate::impostor::Impostor::of(&baked, variant))),
            bevy::camera::visibility::NoFrustumCulling,
            // its shadow would be the bare quad's: the shadow pass does not turn it
            bevy::light::NotShadowCaster,
            Transform::default(),
        ))
        .id();
    commands.entity(table).add_child(imp);
    // the atlas itself, small, bottom right, with the far view: the 8 × 8 views of the master as baked (in the Library
    // view, not in a film)
    if *view.get() == View::Library {
    commands.spawn((
        Specimen,
        Shows(true),
        DespawnOnExit(World::Library), // it stayed over the Game after leaving
        ImageNode::new(baked.variants[variant as usize % baked.variants.len()].0.clone()),
        Node { position_type: PositionType::Absolute, right: Val::Px(12.0), bottom: Val::Px(12.0), width: Val::Px(256.0), height: Val::Px(256.0), ..default() },
        BackgroundColor(Color::srgb(0.15, 0.15, 0.15)),
    ));
    }
    let child = commands
        .spawn((
            Specimen,
            Shows(false),
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
    commands.entity(table).add_child(child);
    for mut t in &mut caption {
        t.0 = format!(
            "{} · {} · {:.0}–{:.0} cm · seed {} · {} triangles, far view {} of {} ({}×{} views) · {}/{}",
            a.name,
            a.kind,
            a.size[0] * 100.0,
            a.size[1] * 100.0,
            s.seed,
            tris,
            variant + 1,
            a.variants.max(1),
            crate::impostor::FRAMES,
            crate::impostor::FRAMES,
            s.at + 1,
            s.names.len()
        );
    }
}

/// Shows the full mesh or the far view, as the toggle says, and names it on the toggle.
fn toggle(shelf: Option<Res<Shelf>>, mut shown: Query<(&Shows, &mut Visibility)>, mut label: Query<&mut Text, With<FarLabel>>) {
    let Some(s) = shelf else { return };
    for (k, mut v) in &mut shown {
        *v = if k.0 == s.far { Visibility::Inherited } else { Visibility::Hidden };
    }
    for mut t in &mut label {
        let want = if s.far { "far view · F" } else { "full mesh · F" };
        if t.0 != want {
            t.0 = want.into();
        }
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
    mut next: ResMut<NextState<View>>,
    mut n: Local<u32>,
    mut exit: MessageWriter<AppExit>,
) {
    // enter the Library from Home, as a person does, so its interface is the one they see
    let Some(mut s) = shelf else {
        *n += 1;
        if *n == 50 {
            commands.spawn(bevy::render::view::screenshot::Screenshot::primary_window()).observe(bevy::render::view::screenshot::save_to_disk(shots.dir.join("home.png")));
        }
        if *n == 60 {
            next.set(View::Library);
            *n = 0;
        }
        return;
    };
    *n += 1;
    // a bake takes about 160 frames and its read-back a few more: photograph after it, or the far view is empty
    let wait = if s.at == 0 { 400 } else { 260 };
    if *n == wait {
        let name = s.names.get(s.at).cloned().unwrap_or_default().replace(' ', "-");
        commands
            .spawn(bevy::render::view::screenshot::Screenshot::primary_window())
            .observe(bevy::render::view::screenshot::save_to_disk(shots.dir.join(format!("{}-{name}.png", s.at))));
    }
    if *n == wait + 10 {
        *n = 0;
        if s.at + 1 >= s.names.len().min(std::env::var("SHELF_N").ok().and_then(|v| v.parse().ok()).unwrap_or(usize::MAX)) {
            exit.write(AppExit::Success);
        } else {
            s.at += 1;
            s.dirty = true;
        }
    }
}
