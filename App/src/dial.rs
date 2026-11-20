//! The sun's dial on a real place, as TheGame's weather panel (TheGame/src/ui/weather.js): one pill at the top centre
//! that reads the time, the date and the sun's height, and opens into a card to set them: the hour with Auto (the day
//! runs on its own, two game hours a real minute, as TheGame's clock), and the date, which moves the sun through the
//! seasons. Closed by default. The camera does not take what the panel does.

use crate::contract::World;
use crate::rig::Captures;
use crate::sun::Sun;
use crate::ui::{CREAM, FOREST, FOREST2, GLASS, SAND, SUN};
use bevy::picking::events::{PointerClick, PointerDrag, PointerPress};
use bevy::picking::hover::Hovered;
use bevy::prelude::*;
use bevy::ui::UiGlobalTransform;

const TRACK: f32 = 220.0;

#[derive(Component, Clone, Copy, PartialEq)]
enum Slider {
    Hour,
    Day,
}

#[derive(Component)]
struct Card;
#[derive(Component)]
struct PillText;
#[derive(Component)]
struct Knob(Slider);
#[derive(Component)]
struct Value(Slider);
#[derive(Component)]
struct Auto;
#[derive(Component)]
struct AutoText;

pub fn plugin(app: &mut App) {
    app.add_systems(OnEnter(World::Place), spawn.run_if(in_state(crate::View::Place))).add_systems(Update, show.run_if(in_state(World::Place)).run_if(resource_exists::<Sun>));
}

fn hhmm(hour: f32) -> String {
    let m = (hour * 60.0).round() as u32 % (24 * 60);
    format!("{:02}:{:02}", m / 60, m % 60)
}

/// "19 Nov" for a day of the year (a common year).
pub fn date(day: u32) -> String {
    const MONTHS: [(&str, u32); 12] =
        [("Jan", 31), ("Feb", 28), ("Mar", 31), ("Apr", 30), ("May", 31), ("Jun", 30), ("Jul", 31), ("Aug", 31), ("Sep", 30), ("Oct", 31), ("Nov", 30), ("Dec", 31)];
    let mut d = day.clamp(1, 365);
    for (name, len) in MONTHS {
        if d <= len {
            return format!("{d} {name}");
        }
        d -= len;
    }
    "31 Dec".into()
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>, still: Option<Res<crate::Still>>) {
    let sans: Handle<Font> = assets.load(crate::root::font(&crate::root::root().fonts.sans));
    let mono: Handle<Font> = assets.load(crate::root::font(&crate::root::root().fonts.mono));
    let txt = |font: &Handle<Font>, size: f32, color: Color, words: &str| {
        (Text::new(words), TextFont { font: font.clone().into(), font_size: FontSize::Px(size), ..default() }, TextColor(color))
    };
    let root = commands
        .spawn((
            DespawnOnExit(World::Place),
            Captures,
            Hovered::default(),
            Node {
                position_type: PositionType::Absolute,
                top: Val::Px(20.0),
                left: Val::Percent(50.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                row_gap: Val::Px(8.0),
                ..default()
            },
            UiTransform { translation: Val2::new(Val::Percent(-50.0), Val::ZERO), ..default() },
        ))
        .id();
    // the pill: the time, the date, the sun's height
    let pill = commands
        .spawn((
            Node {
                height: Val::Px(40.0),
                padding: UiRect::horizontal(Val::Px(18.0)),
                column_gap: Val::Px(10.0),
                align_items: AlignItems::Center,
                border_radius: BorderRadius::MAX,
                ..default()
            },
            BackgroundColor(GLASS),
            children![
                (PillText, txt(&mono, 14.0, FOREST, ""), Pickable::IGNORE),
                // a chevron, drawn: two borders of a small square turned 45° (the fonts have no ▾)
                (
                    Pickable::IGNORE,
                    Node { width: Val::Px(7.0), height: Val::Px(7.0), margin: UiRect::top(Val::Px(-4.0)), border: UiRect { right: Val::Px(2.0), bottom: Val::Px(2.0), ..default() }, ..default() },
                    BorderColor::all(FOREST2),
                    UiTransform { rotation: Rot2::degrees(45.0), ..default() },
                ),
            ],
        ))
        .observe(|mut click: On<PointerClick>, mut card: Query<&mut Node, With<Card>>| {
            click.propagate(false);
            for mut n in &mut card {
                n.display = if n.display == Display::None { Display::Flex } else { Display::None };
            }
        })
        .id();
    // the card: a row for the hour with Auto, a row for the date
    let card = commands
        .spawn((
            Card,
            Node {
                // an agent's still shows it open, so the picture proves it
                display: if still.is_some() { Display::Flex } else { Display::None },
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(12.0),
                padding: UiRect::all(Val::Px(16.0)),
                border_radius: BorderRadius::all(Val::Px(20.0)),
                ..default()
            },
            BackgroundColor(GLASS),
        ))
        .id();
    for (slider, label) in [(Slider::Hour, "Time"), (Slider::Day, "Date")] {
        let row = commands
            .spawn(Node { column_gap: Val::Px(12.0), align_items: AlignItems::Center, ..default() })
            .with_children(|r| {
                r.spawn((txt(&sans, 13.0, FOREST2, label), Node { width: Val::Px(40.0), ..default() }));
                r.spawn((Value(slider), txt(&mono, 14.0, FOREST, ""), Node { width: Val::Px(56.0), ..default() }));
                r.spawn((slider, Hovered::default(), Node { width: Val::Px(TRACK), height: Val::Px(24.0), ..default() }))
                    .with_children(|t| {
                        t.spawn((
                            Pickable::IGNORE,
                            Node { position_type: PositionType::Absolute, top: Val::Px(10.0), width: Val::Percent(100.0), height: Val::Px(4.0), border_radius: BorderRadius::MAX, ..default() },
                            BackgroundColor(SAND),
                        ));
                        t.spawn((
                            Knob(slider),
                            Pickable::IGNORE,
                            Node { position_type: PositionType::Absolute, top: Val::Px(4.0), width: Val::Px(16.0), height: Val::Px(16.0), border: UiRect::all(Val::Px(2.0)), border_radius: BorderRadius::MAX, ..default() },
                            BackgroundColor(SUN),
                            BorderColor::all(FOREST),
                        ));
                    })
                    .observe(press)
                    .observe(drag);
                if slider == Slider::Hour {
                    r.spawn((
                        Auto,
                        Node { height: Val::Px(30.0), padding: UiRect::horizontal(Val::Px(12.0)), align_items: AlignItems::Center, border_radius: BorderRadius::MAX, ..default() },
                        BackgroundColor(CREAM),
                        children![(AutoText, txt(&sans, 13.0, FOREST, "Auto"), Pickable::IGNORE)],
                    ))
                    .observe(|mut click: On<PointerClick>, mut clock: ResMut<crate::contract::Clock>| {
                        click.propagate(false);
                        clock.auto = !clock.auto;
                    });
                }
            })
            .id();
        commands.entity(card).add_child(row);
    }
    commands.entity(root).add_children(&[pill, card]);
}

/// Where the pointer is along a slider's track, 0 to 1.
fn along(e: Entity, x: f32, tracks: &Query<(&Slider, &ComputedNode, &UiGlobalTransform)>) -> Option<(Slider, f32)> {
    let (s, node, at) = tracks.get(e).ok()?;
    let (centre, width) = (at.translation.x * node.inverse_scale_factor, node.size.x * node.inverse_scale_factor);
    Some((*s, ((x - (centre - width / 2.0)) / width.max(1.0)).clamp(0.0, 1.0)))
}

fn set(clock: &mut crate::contract::Clock, s: Slider, t: f32) {
    match s {
        // setting the hour by hand stops Auto, as in TheGame
        Slider::Hour => {
            clock.hour = (t * 24.0).min(23.99);
            clock.auto = false;
        }
        Slider::Day => clock.day = 1 + (t * 364.0).round() as u32,
    }
}

fn press(mut ev: On<PointerPress>, tracks: Query<(&Slider, &ComputedNode, &UiGlobalTransform)>, mut clock: ResMut<crate::contract::Clock>) {
    ev.propagate(false);
    if let Some((s, t)) = along(ev.entity, ev.pointer.position.x, &tracks) {
        set(&mut clock, s, t);
    }
}

fn drag(mut ev: On<PointerDrag>, tracks: Query<(&Slider, &ComputedNode, &UiGlobalTransform)>, mut clock: ResMut<crate::contract::Clock>) {
    ev.propagate(false);
    if let Some((s, t)) = along(ev.entity, ev.pointer.position.x, &tracks) {
        set(&mut clock, s, t);
    }
}

fn show(
    sun: Res<Sun>,
    clock: Res<crate::contract::Clock>,
    mut pill: Query<&mut Text, (With<PillText>, Without<Value>, Without<AutoText>)>,
    mut values: Query<(&Value, &mut Text), (Without<PillText>, Without<AutoText>)>,
    mut knobs: Query<(&Knob, &mut Node)>,
    mut auto: Query<&mut Text, (With<AutoText>, Without<PillText>, Without<Value>)>,
    mut auto_bg: Query<&mut BackgroundColor, With<Auto>>,
) {
    if let Ok(mut t) = pill.single_mut() {
        let up = if sun.elevation > 0.0 { format!("sun {:.0}°", sun.elevation) } else { "night".into() };
        t.0 = format!("{}  ·  {}  ·  {up}{}", hhmm(clock.hour), date(clock.day), if clock.auto { "  ·  running" } else { "" });
    }
    for (v, mut t) in &mut values {
        t.0 = match v.0 {
            Slider::Hour => hhmm(clock.hour),
            Slider::Day => date(clock.day),
        };
    }
    for (k, mut n) in &mut knobs {
        let t = match k.0 {
            Slider::Hour => clock.hour / 24.0,
            Slider::Day => (clock.day as f32 - 1.0) / 364.0,
        };
        n.left = Val::Px(t * TRACK - 8.0);
    }
    for mut t in &mut auto {
        let words = if clock.auto { "Auto · on" } else { "Auto" };
        if t.0 != words {
            t.0 = words.into();
        }
    }
    for mut b in &mut auto_bg {
        b.0 = if clock.auto { SUN } else { CREAM };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn days_read_as_dates() {
        assert_eq!(date(1), "1 Jan");
        assert_eq!(date(59), "28 Feb");
        assert_eq!(date(60), "1 Mar");
        assert_eq!(date(323), "19 Nov");
        assert_eq!(date(365), "31 Dec");
    }

    #[test]
    fn hours_read_as_clock_times() {
        assert_eq!(hhmm(0.0), "00:00");
        assert_eq!(hhmm(16.5), "16:30");
        assert_eq!(hhmm(23.999), "00:00");
    }
}
