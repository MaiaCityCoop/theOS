//! The first start: a store without an owner gets one here, before anything else (intents 0054, 0059).
//!
//! The owner's key is made in this process (theID: an iroh key, kept on this device locked by Touch ID), every head of
//! the store is signed by it as it is, and its secret is shown once, large, to be put in a password manager. It is kept
//! in memory only until "I have saved it" is pressed, then forgotten; it never goes to a file, a log or the store.

use crate::View;
use crate::ui::Fonts;
use bevy::picking::events::PointerClick;
use bevy::prelude::*;

/// A button of the setup screen.
#[derive(Component, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SetupAct {
    Make,
    Copy,
    CopyPublic,
    Saved,
}

/// The screen's state: before the key is made, or its secret shown (the text), or an error.
#[derive(Resource, Default)]
struct Setup {
    secret: Option<String>,
    owner: Option<String>,
    error: Option<String>,
    drawn: bool,
    copied: bool,
    copied_public: bool,
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

/// A store without an owner opens on the setup screen.
/// A store with an owner whose host has no key yet gets one now (theOS's routine writes, by the owner's grant; the
/// person unlocks the owner's key for it, once).
fn first_start(mut next: ResMut<NextState<View>>) {
    match crate::db().owner() {
        Ok(None) => next.set(View::Setup),
        Ok(Some(_)) => {
            if let Err(e) = crate::db().ensure_host() {
                eprintln!("theOS: the host's key: {e}");
            }
        }
        Err(e) => eprintln!("theOS: the store's owner: {e}"),
    }
}

fn click(mut ev: On<PointerClick>, acts: Query<&SetupAct>, mut s: ResMut<Setup>, mut next: ResMut<NextState<View>>) {
    let Ok(act) = acts.get(ev.entity) else { return };
    ev.propagate(false);
    match act {
        SetupAct::Make if s.secret.is_none() => match crate::db().make_owner() {
            Ok(key) => {
                s.owner = Some(key.public().to_string());
                s.secret = Some(thedb::theid::secret_text(&key));
                s.error = None;
            }
            Err(e) => s.error = Some(e),
        },
        SetupAct::Copy => {
            if let Some(secret) = &s.secret {
                match copy_for_a_minute(secret) {
                    Ok(()) => s.copied = true,
                    Err(e) => s.error = Some(e),
                }
            }
        }
        SetupAct::CopyPublic => {
            if let Some(m) = &s.owner {
                match copy(m) {
                    Ok(()) => s.copied_public = true,
                    Err(e) => s.error = Some(e),
                }
            }
        }
        SetupAct::Saved => {
            // forgotten here: this device holds it locked (Touch ID), and the password manager holds it
            s.secret = None;
            s.copied = false;
            next.set(View::Home);
        }
        SetupAct::Make => {}
    }
    s.drawn = false;
}

/// Puts `secret` on the clipboard for pasting into a password manager, and takes it off again after a minute if
/// it is still there (macOS keeps no clipboard history of its own; a clipboard manager might).
fn copy_for_a_minute(secret: &str) -> Result<(), String> {
    copy(secret)?;
    let secret = secret.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(60));
        let now = std::process::Command::new("/usr/bin/pbpaste").output().map(|o| o.stdout).unwrap_or_default();
        if now == secret.as_bytes()
            && let Ok(mut c) = std::process::Command::new("/usr/bin/pbcopy").stdin(std::process::Stdio::piped()).spawn()
        {
            drop(c.stdin.take());
            let _ = c.wait();
        }
    });
    Ok(())
}

/// Puts `text` on the clipboard.
fn copy(text: &str) -> Result<(), String> {
    use std::io::Write;
    let mut c = std::process::Command::new("/usr/bin/pbcopy").stdin(std::process::Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    c.stdin.take().ok_or("no input to pbcopy")?.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    c.wait().map_err(|e| e.to_string())?;
    Ok(())
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
    let small_button = |label: &str, act: SetupAct| {
        (
            act,
            Node { padding: UiRect::axes(Val::Px(12.0), Val::Px(5.0)), border_radius: BorderRadius::all(Val::Px(12.0)), flex_shrink: 0.0, ..default() },
            BackgroundColor(crate::theme::colour("sand")),
            children![(Text::new(label), TextFont { font: f.sans.clone().into(), font_size: FontSize::Px(14.0), ..default() }, TextColor(crate::theme::colour("forest")), Pickable::IGNORE)],
        )
    };
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
            BackgroundColor(crate::theme::colour("paper")),
        ))
        .with_children(|root| {
            root.spawn((
                Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(18.0), width: Val::Px(680.0), padding: UiRect::all(Val::Px(40.0)), border_radius: BorderRadius::all(Val::Px(28.0)), ..default() },
                BackgroundColor(crate::theme::colour("cream")),
            ))
            .with_children(|card| {
                card.spawn(text(&f.serif, 44.0, crate::theme::colour("forest"), "Your owner key".into()));
                match (&s.secret, &s.owner) {
                    (Some(secret), Some(owner)) => {
                        card.spawn(text(&f.sans, 18.0, crate::theme::colour("forest2"), "This is the key that owns your main: every merge is signed by it, and only you open it, with Touch ID. It is shown this once. Put it in your password manager now; this device keeps it locked.".into()));
                        card.spawn((
                            Node { padding: UiRect::all(Val::Px(24.0)), border_radius: BorderRadius::all(Val::Px(18.0)), ..default() },
                            BackgroundColor(crate::theme::colour("sand")),
                            children![text(&f.mono, 24.0, crate::theme::colour("forest"), grouped(secret))],
                        ));
                        card.spawn(Node { flex_direction: FlexDirection::Row, column_gap: Val::Px(12.0), align_items: AlignItems::Center, ..default() }).with_children(|row| {
                            row.spawn(text(&f.mono, 13.0, crate::theme::colour("forest2"), format!("public key  {owner}")));
                            row.spawn(small_button(if s.copied_public { "Copied" } else { "Copy" }, SetupAct::CopyPublic));
                        });
                        if let Some(e) = &s.error {
                            card.spawn(text(&f.sans, 16.0, Color::srgb(0.7, 0.2, 0.15), e.clone()));
                        }
                        card.spawn(text(&f.sans, 15.0, crate::theme::colour("forest2"), "Never as a screenshot or in a chat: whoever sees it can sign as you.".into()));
                        card.spawn(Node { flex_direction: FlexDirection::Row, column_gap: Val::Px(12.0), ..default() }).with_children(|row| {
                            let copy = if s.copied { "Copied: off the clipboard in a minute" } else { "Copy" };
                            row.spawn(button(copy, SetupAct::Copy, crate::theme::colour("sand"), crate::theme::colour("forest")));
                            row.spawn(button("I have saved it in my password manager", SetupAct::Saved, crate::theme::colour("forest"), crate::theme::colour("cream")));
                        });
                    }
                    _ => {
                        card.spawn(text(&f.sans, 18.0, crate::theme::colour("forest2"), "theOS signs every change it keeps. One owner key owns main and signs every merge, opened by you with Touch ID; agents get keys of their own, for their own lines, by its grant. This store has no owner yet.".into()));
                        card.spawn(text(&f.sans, 18.0, crate::theme::colour("forest2"), "Make it now. Its secret is shown once, for you to keep in your password manager.".into()));
                        if let Some(e) = &s.error {
                            card.spawn(text(&f.sans, 16.0, Color::srgb(0.7, 0.2, 0.15), e.clone()));
                        }
                        card.spawn(button("Make the owner key", SetupAct::Make, crate::theme::colour("clay"), crate::theme::colour("cream")));
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
