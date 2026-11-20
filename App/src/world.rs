//! The one world of day 1: a flat green plane with clean grid lines under a flat, light sky. No sun, no light, no
//! shadow, no haze, no wind: the plane is unlit (its colour is its colour) and the sky is the colour the frame is
//! cleared to. The world's settings (its three colours) are a doc in theDB, named by the root; the grid is drawn by
//! one small shader doc.

use crate::contract::{Eye, World, WorldEye};
use bevy::core_pipeline::tonemapping::{DebandDither, Tonemapping};
use bevy::pbr::{Material, MaterialPlugin};
use bevy::prelude::*;
use bevy::render::render_resource::AsBindGroup;
use bevy::shader::ShaderRef;
use serde::Deserialize;

/// The world doc: the sky's colour, the ground's and its grid lines', each `#rrggbb`, and the module that holds its
/// logic (`module.rs`).
#[derive(Deserialize, Clone, Debug)]
pub struct Settings {
    pub sky: String,
    pub ground: String,
    pub lines: String,
    #[serde(default)]
    pub module: Option<String>,
}

impl Settings {
    /// World doc `id` as the store has it now.
    fn read(id: &str) -> Option<Self> {
        let text = crate::db().text(id).ok().flatten()?;
        serde_json::from_str(&text).map_err(|e| eprintln!("theOS: the world {id}: {e}")).ok()
    }
}

/// The world shown now: its doc's id and what it says. The Game shows the root's world; a shot in the Studio may name
/// another (the green and the blue of one timeline).
#[derive(Resource)]
pub struct Shown {
    pub id: String,
    pub settings: Settings,
}

fn colour(hex: &str) -> Color {
    Srgba::hex(hex).expect("a colour of the world doc is #rrggbb").into()
}

/// The interface's own camera: it draws the dashboard and a filmed view, while no world is shown.
#[derive(Component)]
pub struct Dashboard;

/// What the world is made of, gone when it is left.
#[derive(Component)]
struct Part;

/// The ground: one square that follows the eye, so it reaches the horizon wherever the eye goes.
#[derive(Component)]
struct Ground;

/// The ground's material: its colour and its lines' colour, linear; the shader doc draws the grid from where each
/// pixel's ray meets the ground.
#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct Grid {
    #[uniform(0)]
    pub ground: LinearRgba,
    #[uniform(1)]
    pub lines: LinearRgba,
}

impl Material for Grid {
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(crate::root::shader(&crate::root::root().shaders.grid).into())
    }
    // nothing reads a depth before the main pass, and nothing casts a shadow: there is no light
    fn enable_prepass() -> bool {
        false
    }
    fn enable_shadows() -> bool {
        false
    }
}

pub fn plugin(app: &mut App) {
    let id = crate::root::root().world.clone();
    let settings = Settings::read(&id).expect("the root's world doc reads and parses");
    // the world's logic is its module's: theOS sets none of its numbers
    let module = settings.module.as_deref().ok_or_else(|| format!("the world {id} names no module")).and_then(crate::module::WorldModule::load);
    match module {
        Ok(m) => {
            app.insert_resource(m);
        }
        Err(e) => eprintln!("theOS: the world's module: {e}; the world is shown once it has one"),
    }
    app.add_plugins(MaterialPlugin::<Grid>::default())
        .insert_resource(ClearColor(colour(&settings.sky)))
        .insert_resource(Shown { id, settings })
        .add_systems(Startup, spawn)
        .add_systems(Update, show_the_shots_world.run_if(in_state(World::Grid)))
        .add_systems(Update, find_the_module.run_if(not(resource_exists::<crate::module::WorldModule>)))
        .add_systems(OnEnter(World::Grid), enter)
        .add_systems(OnExit(World::Grid), leave)
        .add_systems(Update, follow.after(crate::film::Aim).run_if(in_state(World::Grid)));
}

fn spawn(mut commands: Commands) {
    commands.spawn((Dashboard, IsDefaultUiCamera, Camera2d));
}

fn enter(
    mut commands: Commands,
    shown: Res<Shown>,
    module: Option<Res<crate::module::WorldModule>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut grids: ResMut<Assets<Grid>>,
    mut dash: Query<(Entity, &mut Camera), With<Dashboard>>,
) {
    let Some(module) = module else { return };
    let settings = &shown.settings;
    // the world's camera draws the interface too, over its picture: the dashboard's rests meanwhile
    for (e, mut c) in &mut dash {
        c.is_active = false;
        commands.entity(e).remove::<IsDefaultUiCamera>();
    }
    commands.spawn((
        Part,
        WorldEye,
        IsDefaultUiCamera,
        Camera3d::default(),
        Projection::Perspective(PerspectiveProjection { near: module.near(), far: module.far(), ..default() }),
        Transform::from_xyz(0.0, module.eye_height(), 0.0),
        // no light to map into the screen's range: a colour is drawn as it is
        Tonemapping::None,
        DebandDither::Disabled,
    ));
    commands.spawn((
        Part,
        Ground,
        Mesh3d(meshes.add(Plane3d::default().mesh().size(2.0, 2.0))),
        MeshMaterial3d(grids.add(Grid { ground: colour(&settings.ground).into(), lines: colour(&settings.lines).into() })),
    ));
}

fn leave(mut commands: Commands, parts: Query<Entity, With<Part>>, mut dash: Query<(Entity, &mut Camera), With<Dashboard>>) {
    for e in &parts {
        commands.entity(e).despawn();
    }
    for (e, mut c) in &mut dash {
        c.is_active = true;
        commands.entity(e).insert(IsDefaultUiCamera);
    }
}

/// The ground stays under the eye, as wide to each side as the world's module says for an eye that high.
fn follow(eye: Res<Eye>, module: Option<Res<crate::module::WorldModule>>, mut ground: Query<&mut Transform, With<Ground>>) {
    let Some(module) = module else { return };
    let half = module.ground_half(eye.pos.y);
    for mut t in &mut ground {
        *t = Transform::from_xyz(eye.pos.x, 0.0, eye.pos.z).with_scale(Vec3::new(half, 1.0, half));
    }
}

/// The world doc the view shows now: in the Studio, the one the playing shot names (when it names a world); otherwise
/// the root's. When it changes, the sky and the ground take its colours.
fn show_the_shots_world(
    mut commands: Commands,
    view: Res<State<crate::View>>,
    studio: Res<crate::film::Studio>,
    mut shown: ResMut<Shown>,
    mut clear: ResMut<ClearColor>,
    mut grids: ResMut<Assets<Grid>>,
    ground: Query<Entity, With<Ground>>,
    mut kinds: Local<std::collections::HashMap<String, bool>>,
) {
    let root = crate::root::root().world.clone();
    let want = match view.get() {
        crate::View::Studio => studio
            .timeline
            .shot_at(studio.time)
            .and_then(|(i, _)| studio.timeline.clips[i].world.clone())
            .filter(|id| *kinds.entry(id.clone()).or_insert_with(|| crate::db().meta(id).is_ok_and(|m| m.0 == "world")))
            .unwrap_or(root),
        _ => root,
    };
    // the ground is made on entering the world, a frame after this may first run: wait for it
    if want == shown.id || ground.is_empty() {
        return;
    }
    let Some(settings) = Settings::read(&want) else { return };
    clear.0 = colour(&settings.sky);
    // a new material, not an edit of the old one: the ground takes it on the next frame
    let grid = grids.add(Grid { ground: colour(&settings.ground).into(), lines: colour(&settings.lines).into() });
    for e in &ground {
        commands.entity(e).insert(MeshMaterial3d(grid.clone()));
    }
    *shown = Shown { id: want, settings };
}

/// A world without its module yet (a proposal that brings it not accepted): asked again every two seconds, and shown
/// as soon as main's world names a built module.
fn find_the_module(mut commands: Commands, time: Res<Time<Real>>, mut next: Local<f32>, mut shown: ResMut<Shown>, world: Res<State<World>>, mut again: ResMut<NextState<World>>) {
    if time.elapsed_secs() < *next {
        return;
    }
    *next = time.elapsed_secs() + 2.0;
    let id = crate::root::root().world.clone();
    let Some(settings) = Settings::read(&id) else { return };
    let Some(module) = settings.module.as_deref().and_then(|m| crate::module::WorldModule::load(m).ok()) else { return };
    commands.insert_resource(module);
    *shown = Shown { id, settings };
    // a world already entered without its module is entered again, now whole
    if *world.get() == World::Grid {
        again.set(World::None);
    }
}
