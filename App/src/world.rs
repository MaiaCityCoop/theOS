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

/// The world doc: the sky's colour, the ground's and its grid lines', each `#rrggbb`.
#[derive(Resource, Deserialize, Clone, Debug)]
pub struct Settings {
    pub sky: String,
    pub ground: String,
    pub lines: String,
}

impl Settings {
    /// The world doc the root names, as the store has it when the app starts.
    fn read() -> Self {
        let text = crate::db().text(&crate::root::root().world).ok().flatten().expect("the world doc reads");
        serde_json::from_str(&text).expect("the world doc parses")
    }
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
    let settings = Settings::read();
    app.add_plugins(MaterialPlugin::<Grid>::default())
        .insert_resource(ClearColor(colour(&settings.sky)))
        .insert_resource(settings)
        .add_systems(Startup, spawn)
        .add_systems(OnEnter(World::Grid), enter)
        .add_systems(OnExit(World::Grid), leave)
        .add_systems(Update, follow.after(crate::film::Aim).run_if(in_state(World::Grid)));
}

fn spawn(mut commands: Commands) {
    commands.spawn((Dashboard, IsDefaultUiCamera, Camera2d));
}

fn enter(
    mut commands: Commands,
    settings: Res<Settings>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut grids: ResMut<Assets<Grid>>,
    mut dash: Query<(Entity, &mut Camera), With<Dashboard>>,
) {
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
        Projection::Perspective(PerspectiveProjection { near: 0.05, far: 500_000.0, ..default() }),
        Transform::from_xyz(0.0, 1.6, 0.0),
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

/// The ground stays under the eye, and is the wider the higher the eye is, so its edge is always at the horizon:
/// 20 km to each side at a walker's height, 300 km at the eye's highest (inside the camera's far plane).
fn follow(eye: Res<Eye>, mut ground: Query<&mut Transform, With<Ground>>) {
    let half = (eye.pos.y * 50.0).clamp(20_000.0, 300_000.0);
    for mut t in &mut ground {
        *t = Transform::from_xyz(eye.pos.x, 0.0, eye.pos.z).with_scale(Vec3::new(half, 1.0, half));
    }
}
