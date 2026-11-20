//! The first start: a store without a master gets one here, before anything else (intent 0054, access).
//!
//! The master's key is made in this process (theID: an iroh key, kept in this Mac's Keychain), every head of the store
//! is signed by it as it is, and its secret is shown once, large, to be put in a password manager. It is kept in
//! memory only until "I have saved it" is pressed, then forgotten; it never goes to a file, a log or the store.

use crate::View;
use crate::ui::{CLAY, CREAM, FOREST, FOREST2, Fonts, PAPER, SAND};
use bevy::picking::events::PointerClick;
use bevy::prelude::*;

/// A button of the setup screen.
#[derive(Component, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SetupAct {
    Make,
    Saved,
}

/// The screen's state: before the key is made, or its secret shown (the text), or an error.
#[derive(Resource, Default)]
struct Setup {
    secret: Option<String>,
    master: Option<String>,
    error: Option<String>,
    drawn: bool,
}

#[derive(Component)]
struct Screen;

pub fn plugin(app: &mut App) {
    app.init_resource::<Setup>()
        .add_systems(Startup, first_start)
        .add_systems(OnEnter(View::Setup), |mut s: ResMut<Setup>| s.drawn = false)
        .add_systems(Update, draw.run_if(in_state(View::Setup)))
        .add_observer(click);
}

/// A store without a master opens on the setup screen.
fn first_start(mut next: ResMut<NextState<View>>) {
    if matches!(crate::db().master(), Ok(None)) {
        next.set(View::Setup);
    }
}

fn click(mut ev: On<PointerClick>, acts: Query<&SetupAct>, mut s: ResMut<Setup>, mut next: ResMut<NextState<View>>) {
    let Ok(act) = acts.get(ev.entity) else { return };
    ev.propagate(false);
    match act {
        SetupAct::Make if s.secret.is_none() => match crate::db().make_master() {
            Ok(key) => {
                s.master = Some(key.public().to_string());
                s.secret = Some(thedb::theid::secret_text(&key));
                s.error = None;
            }
            Err(e) => s.error = Some(e),
        },
        SetupAct::Saved => {
            // forgotten here: the Keychain and the password manager hold it now
            s.secret = None;
            next.set(View::Home);
        }
        SetupAct::Make => {}
    }
    s.drawn = false;
}

/// The secret in groups of four, four groups a line: easy to copy by eye and to check.
fn grouped(secret: &str) -> String {
    let groups: Vec<&str> = secret.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap_or("")).collect();
    groups.chunks(4).map(|l| l.join("  ")).collect::<Vec<_>>().join("\n")
}

fn draw(mut commands: Commands, fonts: Res<Fonts>, mut s: ResMut<Setup>, old: Query<Entity, With<Screen>>) {
    if s.drawn {
        return;
    }
    s.drawn = true;
    for e in &old {
        commands.entity(e).despawn();
    }
    let f = &*fonts;
    let text = |font: &Handle<Font>, size: f32, color: Color, t: String| (Text::new(t), TextFont { font: font.clone().into(), font_size: FontSize::Px(size), ..default() }, TextColor(color), Pickable::IGNORE);
    let button = |label: &str, act: SetupAct, bg: Color, fg: Color| {
        (
            act,
            Node { padding: UiRect::axes(Val::Px(22.0), Val::Px(12.0)), border_radius: BorderRadius::all(Val::Px(18.0)), align_self: AlignSelf::FlexStart, ..default() },
            BackgroundColor(bg),
            children![(Text::new(label), TextFont { font: f.sans.clone().into(), font_size: FontSize::Px(17.0), ..default() }, TextColor(fg), Pickable::IGNORE)],
        )
    };
    commands
        .spawn((
            Screen,
            DespawnOnExit(View::Setup),
            Node { position_type: PositionType::Absolute, left: Val::Px(0.0), right: Val::Px(0.0), top: Val::Px(0.0), bottom: Val::Px(0.0), align_items: AlignItems::Center, justify_content: JustifyContent::Center, ..default() },
            BackgroundColor(PAPER),
        ))
        .with_children(|root| {
            root.spawn((
                Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(18.0), width: Val::Px(680.0), padding: UiRect::all(Val::Px(40.0)), border_radius: BorderRadius::all(Val::Px(28.0)), ..default() },
                BackgroundColor(CREAM),
            ))
            .with_children(|card| {
                card.spawn(text(&f.serif, 44.0, FOREST, "Your master key".into()));
                match (&s.secret, &s.master) {
                    (Some(secret), Some(master)) => {
                        card.spawn(text(&f.sans, 18.0, FOREST2, "This is the key that signs everything theOS keeps, and the only one that merges into main. It is shown this once. Put it in your password manager now; this Mac's Keychain holds it too.".into()));
                        card.spawn((
                            Node { padding: UiRect::all(Val::Px(24.0)), border_radius: BorderRadius::all(Val::Px(18.0)), ..default() },
                            BackgroundColor(SAND),
                            children![text(&f.mono, 24.0, FOREST, grouped(secret))],
                        ));
                        card.spawn(text(&f.mono, 13.0, FOREST2, format!("public key  {master}")));
                        card.spawn(button("I have saved it in my password manager", SetupAct::Saved, FOREST, CREAM));
                    }
                    _ => {
                        card.spawn(text(&f.sans, 18.0, FOREST2, "theOS signs every change it keeps. One master key signs main and every merge; agents get keys of their own, for their own lines, by its grant. This store has no master yet.".into()));
                        card.spawn(text(&f.sans, 18.0, FOREST2, "Make it now. Its secret is shown once, for you to keep in your password manager.".into()));
                        if let Some(e) = &s.error {
                            card.spawn(text(&f.sans, 16.0, Color::srgb(0.7, 0.2, 0.15), e.clone()));
                        }
                        card.spawn(button("Make the master key", SetupAct::Make, CLAY, CREAM));
                    }
                }
            });
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_secret_reads_in_four_lines_of_four_groups() {
        let s: String = (0..64).map(|i| char::from(b'a' + (i % 26) as u8)).collect();
        let g = super::grouped(&s);
        assert_eq!(g.lines().count(), 4);
        assert!(g.lines().all(|l| l.split("  ").count() == 4));
        assert_eq!(g.replace(['\n', ' '], ""), s);
    }
}
