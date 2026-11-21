//! The Sandboxes: every world there is to open, from the vibes. A vibe whose entry is a world is a sandbox; its card
//! shows the world's sky over its ground, and a click opens the Game in that world. Nothing here is set by hand:
//! a new world vibe, proposed and accepted, is a new card.

use crate::View;
use crate::ui::{Act, Fonts};
use crate::views::OpenDoc;
use bevy::picking::hover::Hovered;
use bevy::prelude::*;

pub fn plugin(app: &mut App) {
    app.add_systems(OnEnter(View::Sandboxes), layout);
}

/// A sandbox: its vibe's name, and its world's id and colours.
struct Sandbox {
    name: String,
    world: String,
    world_name: String,
    sky: String,
    ground: String,
}

fn sandboxes() -> Vec<Sandbox> {
    let db = crate::db();
    let mut out = Vec::new();
    for found in db.find(thedb::Find::Kind("vibe")).unwrap_or_default() {
        let Ok(Some(text)) = db.text(&found.id) else { continue };
        let Ok(vibe) = serde_json::from_str::<thedb::vibe::Vibe>(&text) else { continue };
        let world = vibe.entry.split('@').next().unwrap_or_default().to_string();
        let Ok((kind, world_name)) = db.meta(&world) else { continue };
        if kind != "world" {
            continue;
        }
        let colours: serde_json::Value = db.text(&world).ok().flatten().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        let c = |k: &str| colours.get(k).and_then(|v| v.as_str()).unwrap_or("#000000").to_string();
        out.push(Sandbox { name: vibe.name, world, world_name, sky: c("sky"), ground: c("ground") });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn layout(mut commands: Commands, fonts: Res<Fonts>) {
    let f = &*fonts;
    let colour = crate::theme::colour;
    let text = |font: &Handle<Font>, size: f32, color: Color, t: String| (Text::new(t), TextFont { font: font.clone().into(), font_size: FontSize::Px(size), ..default() }, TextColor(color), Pickable::IGNORE);
    commands
        .spawn((
            DespawnOnExit(View::Sandboxes),
            Node { position_type: PositionType::Absolute, left: Val::Px(0.0), right: Val::Px(0.0), top: Val::Px(0.0), bottom: Val::Px(0.0), flex_direction: FlexDirection::Column, row_gap: Val::Px(20.0), padding: UiRect::new(Val::Px(36.0), Val::Px(36.0), Val::Px(36.0), Val::Px(84.0)), ..default() },
            BackgroundColor(colour("paper")),
        ))
        .with_children(|root| {
            root.spawn((Node { flex_direction: FlexDirection::Row, align_items: AlignItems::Center, column_gap: Val::Px(18.0), padding: UiRect::axes(Val::Px(28.0), Val::Px(20.0)), border_radius: BorderRadius::all(Val::Px(32.0)), ..default() }, BackgroundColor(colour("cream"))))
                .with_children(|h| {
                    h.spawn(text(&f.serif, 34.0, colour("forest"), "Sandboxes".into()));
                    h.spawn(text(&f.sans, 17.0, colour("forest2"), "Every world there is to open: each a vibe whose entry is a world. Click one to walk in it.".into()));
                });
            root.spawn(Node { display: Display::Grid, grid_template_columns: RepeatedGridTrack::flex(3, 1.0), grid_auto_rows: vec![GridTrack::auto()], row_gap: Val::Px(20.0), column_gap: Val::Px(20.0), ..default() })
                .with_children(|grid| {
                    for s in sandboxes() {
                        let swatch = |hex: &str| Srgba::hex(hex.trim_start_matches('#')).map(Color::from).unwrap_or(Color::BLACK);
                        grid.spawn((
                            Act::Open(View::Game),
                            OpenDoc(s.world.clone()),
                            Hovered::default(),
                            Node { flex_direction: FlexDirection::Column, border_radius: BorderRadius::all(Val::Px(32.0)), overflow: Overflow::clip(), min_height: Val::Px(300.0), ..default() },
                            BackgroundColor(colour("cream")),
                            BoxShadow::new(Color::srgba(0.09, 0.21, 0.33, 0.10), Val::Px(0.0), Val::Px(10.0), Val::Px(0.0), Val::Px(28.0)),
                        ))
                        .with_children(|card| {
                            // the world as it looks: its sky over its ground
                            card.spawn((Node { height: Val::Px(90.0), ..default() }, BackgroundColor(swatch(&s.sky)), Pickable::IGNORE));
                            card.spawn((Node { height: Val::Px(70.0), ..default() }, BackgroundColor(swatch(&s.ground)), Pickable::IGNORE));
                            card.spawn((Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(8.0), padding: UiRect::all(Val::Px(26.0)), ..default() }, Pickable::IGNORE)).with_children(|t| {
                                t.spawn(text(&f.sans, 13.0, colour("forest2"), format!("SANDBOX · WORLD {}", s.world_name.to_uppercase())));
                                t.spawn(text(&f.serif, 34.0, colour("forest"), s.name.clone()));
                            });
                        });
                    }
                });
        });
}
