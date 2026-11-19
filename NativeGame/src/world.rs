//! The app at rest: the dashboard's camera. (The green plain of the first day is gone: the Game is the Meadow.)

use bevy::prelude::*;

pub const SKY: Color = Color::srgb(0.53, 0.70, 0.90);

/// What would be hidden while a scene is shown (nothing, since the plain is gone).
#[derive(Component)]
pub struct Plain;

/// The dashboard's camera, off while a scene is shown.
#[derive(Component)]
pub struct Eye;

pub fn plugin(app: &mut App) {
    app.insert_resource(ClearColor(SKY)).add_systems(Startup, spawn);
}

fn spawn(mut commands: Commands) {
    // the dashboard's camera; the world (the Meadow) brings its own when it opens
    commands.spawn((Eye, IsDefaultUiCamera, Camera2d));
}
