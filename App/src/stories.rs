//! The Studio's two halves: **Stories**, every shot list as a card, and the **Timeline**, one story played: the
//! player on top (the world camera framed 16:9 in the upper band, `frame`) and its lanes and controls below (the
//! Studio's layers), in a dark room; "← Stories" goes back, a story's card opens it.

use crate::View;
use crate::contract::WorldEye;
use crate::ui::{Act, Fonts};
use crate::views::OpenDoc;
use crate::world::Dashboard;
use bevy::camera::{ClearColorConfig, Viewport};
use bevy::picking::hover::Hovered;
use bevy::prelude::*;
use bevy::window::PrimaryWindow;

/// The band the player takes at the top of the Studio: the switcher's room above it, its share of the window's height.
const TOP: f32 = 72.0;
const SHARE: f32 = 0.62;

pub fn plugin(app: &mut App) {
    app.add_systems(OnEnter(View::Stories), stories)
        .add_systems(OnEnter(View::Studio), switcher_in_studio)
        .add_systems(Update, frame);
}

fn text(f: &Handle<Font>, size: f32, color: Color, t: impl Into<String>) -> impl Bundle {
    (Text::new(t), TextFont { font: f.clone().into(), font_size: FontSize::Px(size), ..default() }, TextColor(color), Pickable::IGNORE)
}

/// The Timeline's header: back to the Stories, and the story's title.
fn switcher_in_studio(mut commands: Commands, fonts: Res<Fonts>) {
    let f = &*fonts;
    let colour = crate::theme::colour;
    commands
        .spawn((DespawnOnExit(View::Studio), Node { position_type: PositionType::Absolute, top: Val::Px(18.0), left: Val::Px(20.0), right: Val::Px(20.0), flex_direction: FlexDirection::Row, align_items: AlignItems::Center, column_gap: Val::Px(18.0), ..default() }, Pickable::IGNORE, ZIndex(5)))
        .with_children(|p| {
            p.spawn((
                Act::Open(View::Stories),
                Hovered::default(),
                Node { padding: UiRect::axes(Val::Px(16.0), Val::Px(7.0)), border_radius: BorderRadius::all(Val::Px(999.0)), border: UiRect::all(Val::Px(1.5)), ..default() },
                BorderColor::all(Color::srgba(1.0, 1.0, 1.0, 0.35)),
                children![text(&f.sans, 15.0, colour("cream"), "← Stories")],
            ));
            p.spawn((crate::ui::Title, Text::new(""), TextFont { font: f.serif.clone().into(), font_size: FontSize::Px(22.0), ..default() }, TextColor(colour("cream")), Pickable::IGNORE));
        });
}

/// Every shot list, as a card: its title, its shots, how long it runs.
fn stories(mut commands: Commands, fonts: Res<Fonts>) {
    let f = &*fonts;
    let colour = crate::theme::colour;
    let db = crate::db();
    let mut lists: Vec<(String, crate::camera::Timeline)> = db
        .find(thedb::Find::Kind("shots"))
        .unwrap_or_default()
        .into_iter()
        .filter_map(|found| Some((found.id.clone(), crate::camera::Timeline::from_json(&db.text(&found.id).ok()??).ok()?)))
        .collect();
    lists.sort_by(|a, b| a.1.title.cmp(&b.1.title));
    commands
        .spawn((
            DespawnOnExit(View::Stories),
            Node { position_type: PositionType::Absolute, left: Val::Px(0.0), right: Val::Px(0.0), top: Val::Px(0.0), bottom: Val::Px(0.0), flex_direction: FlexDirection::Column, row_gap: Val::Px(20.0), padding: UiRect::new(Val::Px(36.0), Val::Px(36.0), Val::Px(16.0), Val::Px(84.0)), ..default() },
            BackgroundColor(colour("paper")),
        ))
        .with_children(|root| {
            root.spawn(Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(6.0), padding: UiRect::horizontal(Val::Px(8.0)), ..default() }).with_children(|h| {
                h.spawn(text(&f.serif, 46.0, colour("forest"), "Stories"));
                h.spawn(text(&f.sans, 17.0, colour("forest2"), "Every story there is, one a day. Open one to play it in the Timeline."));
            });
            root.spawn(Node { display: Display::Grid, grid_template_columns: RepeatedGridTrack::flex(3, 1.0), grid_auto_rows: vec![GridTrack::auto()], row_gap: Val::Px(20.0), column_gap: Val::Px(20.0), ..default() })
                .with_children(|grid| {
                    for (id, t) in &lists {
                        let secs: f32 = t.duration();
                        grid.spawn((
                            Act::Open(View::Studio),
                            OpenDoc(id.clone()),
                            Hovered::default(),
                            Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(10.0), padding: UiRect::all(Val::Px(30.0)), border_radius: BorderRadius::all(Val::Px(32.0)), min_height: Val::Px(240.0), ..default() },
                            BackgroundColor(colour("cream")),
                            BoxShadow::new(Color::srgba(0.09, 0.21, 0.33, 0.10), Val::Px(0.0), Val::Px(10.0), Val::Px(0.0), Val::Px(28.0)),
                        ))
                        .with_children(|card| {
                            card.spawn(text(&f.mono, 13.0, colour("clay"), format!("STORY · {} SHOTS · {secs:.0} S", t.clips.len())));
                            card.spawn(text(&f.serif, 40.0, colour("forest"), t.title.clone()));
                            let names: Vec<String> = t.clips.iter().map(|c| c.name.clone()).collect();
                            card.spawn(text(&f.sans, 17.0, colour("forest2"), names.join(" · ")));
                        });
                    }
                });
        });
}

/// The dark around the player, while the Studio shows a world: the Timeline is a dark room, the picture lit.
#[derive(Component)]
struct Around;

/// In the Studio, the world's camera draws only the player, 16:9 in the band under the switcher, and the interface is
/// drawn over the whole window by the dashboard's camera; everywhere else the world's camera draws the window, and is
/// the interface's camera too (`world.rs`).
#[allow(clippy::too_many_arguments)]
fn frame(
    mut commands: Commands,
    view: Res<State<View>>,
    window: Query<&Window, With<PrimaryWindow>>,
    mut eye: Query<(Entity, &mut Camera), (With<WorldEye>, Without<Dashboard>)>,
    mut dash: Query<(Entity, &mut Camera), With<Dashboard>>,
    mut around: Query<(Entity, &mut Node), With<Around>>,
    mut framed: Local<bool>,
) {
    let Ok(win) = window.single() else { return };
    let Ok((eye_e, mut eye_cam)) = eye.single_mut() else {
        *framed = false;
        for (e, _) in &around {
            commands.entity(e).despawn();
        }
        return;
    };
    let studio = *view.get() == View::Studio;
    let (w, h) = (win.width(), win.height());
    // the player: 16:9, as wide as fits in the band, centred
    let band = (h - TOP) * SHARE;
    let ph = band.min((w - 72.0) * 9.0 / 16.0).max(1.0);
    let pw = ph * 16.0 / 9.0;
    let (px, py) = ((w - pw) / 2.0, TOP);
    if studio {
        let s = win.scale_factor();
        eye_cam.viewport = Some(Viewport { physical_position: UVec2::new((px * s) as u32, (py * s) as u32), physical_size: UVec2::new((pw * s) as u32, (ph * s) as u32), ..default() });
        if !*framed {
            *framed = true;
            commands.entity(eye_e).remove::<IsDefaultUiCamera>();
            for (e, mut c) in &mut dash {
                c.is_active = true;
                c.order = 1;
                c.clear_color = ClearColorConfig::None;
                commands.entity(e).insert(IsDefaultUiCamera);
            }
            // four paper panels around the player: above, below, left, right
            for _ in 0..4 {
                commands.spawn((Around, DespawnOnExit(View::Studio), Node { position_type: PositionType::Absolute, ..default() }, BackgroundColor(crate::theme::colour("night")), ZIndex(-10), Pickable::IGNORE));
            }
        }
        let rects = [(0.0, 0.0, w, py), (0.0, py + ph, w, h - py - ph), (0.0, py, px, ph), (px + pw, py, w - px - pw, ph)];
        for ((_, mut n), (l, t, rw, rh)) in around.iter_mut().zip(rects) {
            (n.left, n.top, n.width, n.height) = (Val::Px(l), Val::Px(t), Val::Px(rw), Val::Px(rh.max(0.0)));
        }
    } else if *framed {
        *framed = false;
        eye_cam.viewport = None;
        commands.entity(eye_e).insert(IsDefaultUiCamera);
        for (e, mut c) in &mut dash {
            c.is_active = false;
            c.order = 0;
            c.clear_color = ClearColorConfig::Default;
            commands.entity(e).remove::<IsDefaultUiCamera>();
        }
    }
}
