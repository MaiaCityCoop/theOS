//! The nav pill, at the bottom of every view, as on maia.city: Home on the left, the star in the middle, the badge
//! on the right. The star opens the proposals: a modal over the view, with a card for every proposal on every line,
//! and Accept and Refuse on each open one. That click is the human step (HITL): theOS signs the merge with its host
//! key, and an agent, which has only its line's key, cannot. In a store with a person (`theDB person make`), Accept
//! also asks the person at this Mac for Touch ID or the login password, and their Secure Enclave signs it: the host's
//! key, readable from the Keychain by any process, is not enough to accept.

use crate::View;
use crate::ui::Fonts;
use bevy::asset::RenderAssetUsages;
use bevy::image::{CompressedImageFormats, ImageSampler, ImageType};
use bevy::picking::events::PointerClick;
use bevy::prelude::*;

/// What the pill and the modal do on a click.
#[derive(Component, Clone, PartialEq, Eq, Debug)]
pub enum PillAct {
    Proposals,
    Close,
    Accept(String),
    Refuse(String),
    Show(Filter),
}

/// Which proposals the modal lists: the open ones (the default), the done ones (accepted or refused), or all.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Filter {
    #[default]
    Open,
    Done,
    All,
}

impl Filter {
    fn keeps(self, p: &thedb::proposals::Proposal) -> bool {
        let open = p.state == thedb::proposals::State::Open;
        match self {
            Filter::Open => open,
            Filter::Done => !open,
            Filter::All => true,
        }
    }
}

/// Whether the proposals are open, what they are, and what last went wrong.
#[derive(Resource, Default)]
pub struct Modal {
    pub open: bool,
    list: Vec<(String, thedb::proposals::Proposal)>,
    /// Each open proposal's conflicts with main, in words: Accept is off while there are any.
    conflicts: std::collections::HashMap<String, Vec<String>>,
    filter: Filter,
    error: Option<String>,
    dirty: bool,
}

#[derive(Component)]
struct Pill;
#[derive(Component)]
struct Sheet;

/// The Studio's play and pause icons.
#[derive(Resource)]
pub struct PlayIcons {
    pub play: Handle<Image>,
    pub pause: Handle<Image>,
}

/// theOS's star, for whoever draws it besides the pill (the Studio's playhead).
#[derive(Resource)]
pub struct Star(pub Handle<Image>);

#[derive(Resource)]
struct Icons {
    star: Handle<Image>,
    home: Handle<Image>,
    hexagon: Handle<Image>,
}

fn png(images: &mut Assets<Image>, bytes: &[u8]) -> Handle<Image> {
    images.add(Image::from_buffer(bytes, ImageType::Extension("png"), CompressedImageFormats::NONE, true, ImageSampler::linear(), RenderAssetUsages::RENDER_WORLD).expect("an icon of the pill decodes"))
}

pub fn plugin(app: &mut App) {
    app.init_resource::<Modal>()
        .add_systems(Startup, (icons, spawn).chain())
        .add_systems(Update, (show, draw, crate::ui::play_icon))
        .add_observer(click);
}

fn icons(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    let star = png(&mut images, include_bytes!("../assets/star.png"));
    commands.insert_resource(Star(star.clone()));
    commands.insert_resource(PlayIcons { play: png(&mut images, include_bytes!("../assets/play.png")), pause: png(&mut images, include_bytes!("../assets/pause.png")) });
    commands.insert_resource(Icons {
        star,
        home: png(&mut images, include_bytes!("../assets/home.png")),
        hexagon: png(&mut images, include_bytes!("../assets/hexagon.png")),
    });
}

/// The pill's own camera: over the whole window and over every view's picture (the Studio films into a frame
/// smaller than the window), drawn last, clearing nothing.
#[derive(Resource)]
struct Overlay(Entity);

fn spawn(mut commands: Commands, icons: Res<Icons>, fonts: Res<Fonts>) {
    let cam = commands.spawn((Camera2d, Camera { order: 100, clear_color: ClearColorConfig::None, ..default() })).id();
    commands.insert_resource(Overlay(cam));
    commands
        .spawn((
            Pill,
            UiTargetCamera(cam),
            GlobalZIndex(20),
            Node { position_type: PositionType::Absolute, left: Val::Px(0.0), right: Val::Px(0.0), bottom: Val::Px(14.0), justify_content: JustifyContent::Center, ..default() },
            Pickable::IGNORE,
        ))
        .with_children(|row| {
            row.spawn((
                Node { flex_direction: FlexDirection::Row, align_items: AlignItems::Center, column_gap: Val::Px(12.0), height: Val::Px(42.0), padding: UiRect::horizontal(Val::Px(14.0)), border_radius: BorderRadius::all(Val::Px(999.0)), border: UiRect::all(Val::Px(1.0)), ..default() },
                BackgroundColor(Color::srgba(0.984, 0.965, 0.918, 0.86)),
                BorderColor::all(Color::srgba(1.0, 1.0, 1.0, 0.7)),
                BoxShadow::new(Color::srgba(0.047, 0.094, 0.149, 0.18), Val::Px(0.0), Val::Px(6.0), Val::Px(0.0), Val::Px(18.0)),
            ))
            .with_children(|p| {
                p.spawn((crate::ui::Act::Home, Hover, Node { width: Val::Px(22.0), height: Val::Px(22.0), ..default() }, ImageNode::new(icons.home.clone())));
                p.spawn((
                    PillAct::Proposals,
                    Hover,
                    Node { width: Val::Px(50.0), height: Val::Px(50.0), margin: UiRect::vertical(Val::Px(-6.0)), border_radius: BorderRadius::all(Val::Percent(50.0)), border: UiRect::all(Val::Px(3.0)), justify_content: JustifyContent::Center, align_items: AlignItems::Center, ..default() },
                    BackgroundColor(crate::theme::colour("forest")),
                    BorderColor::all(Color::srgba(0.949, 0.710, 0.267, 0.55)),
                    BoxShadow::new(Color::srgba(0.047, 0.094, 0.149, 0.35), Val::Px(0.0), Val::Px(8.0), Val::Px(0.0), Val::Px(20.0)),
                    children![(ImageNode::new(icons.star.clone()), Node { width: Val::Px(30.0), height: Val::Px(30.0), ..default() }, Pickable::IGNORE)],
                ));
                p.spawn((
                    Node { width: Val::Px(30.0), height: Val::Px(27.0), justify_content: JustifyContent::Center, align_items: AlignItems::Center, ..default() },
                    ImageNode::new(icons.hexagon.clone()),
                    children![(Text::new("MC"), TextFont { font: fonts.sans.clone().into(), font_size: FontSize::Px(11.0), weight: FontWeight::BOLD, ..default() }, TextColor(crate::theme::colour("forest")), Pickable::IGNORE)],
                ));
            });
        });
}

/// A button that grows a little under the pointer.
#[derive(Component)]
struct Hover;

/// The pill is hidden on the setup screen, and while the proposals are open (their close tab takes its place).
fn show(state: Res<State<View>>, modal: Res<Modal>, mut pill: Query<&mut Visibility, With<Pill>>, mut hover: Query<(&bevy::picking::hover::Hovered, &mut UiTransform), With<Hover>>) {
    let shown = *state.get() != View::Setup && !modal.open;
    for mut v in &mut pill {
        let want = if shown { Visibility::Inherited } else { Visibility::Hidden };
        if *v != want {
            *v = want;
        }
    }
    for (h, mut t) in &mut hover {
        let s = if h.get() { 1.06 } else { 1.0 };
        if t.scale.x != s {
            t.scale = Vec2::splat(s);
        }
    }
}

fn click(mut ev: On<PointerClick>, acts: Query<&PillAct>, mut modal: ResMut<Modal>, mut exit: MessageWriter<AppExit>) {
    let Ok(act) = acts.get(ev.entity) else { return };
    ev.propagate(false);
    let db = crate::db();
    let done = match act.clone() {
        PillAct::Proposals => {
            modal.open = true;
            modal.filter = Filter::Open;
            Ok(())
        }
        PillAct::Show(f) => {
            modal.filter = f;
            Ok(())
        }
        PillAct::Close => {
            modal.open = false;
            Ok(())
        }
        // the human step: this process signs with theOS's host key, and the person with Touch ID (the window waits)
        PillAct::Accept(id) => {
            let new_build = db.proposal(&id).is_ok_and(|p| p.docs.keys().any(|d| db.meta(d).is_ok_and(|m| m.0 == "engine")));
            let done = db.merge(&id);
            // a new build accepted: theOS ends, and the kernel starts the build now pinned
            if done.is_ok() && new_build {
                let _ = db.sync();
                exit.write(AppExit::from_code(75));
            }
            done
        }
        PillAct::Refuse(id) => db.refuse(&id),
    };
    modal.error = done.err();
    if modal.open {
        modal.list = db.proposals().unwrap_or_default();
        modal.conflicts = modal
            .list
            .iter()
            .filter(|(_, p)| p.state == thedb::proposals::State::Open)
            .map(|(id, _)| (id.clone(), db.proposal_conflicts(id).map(|c| c.iter().map(|c| c.to_string()).collect()).unwrap_or_else(|e| vec![e])))
            .collect();
    }
    modal.dirty = true;
}

fn draw(mut commands: Commands, fonts: Res<Fonts>, overlay: Res<Overlay>, mut modal: ResMut<Modal>, old: Query<Entity, With<Sheet>>) {
    if !modal.dirty {
        return;
    }
    modal.dirty = false;
    for e in &old {
        commands.entity(e).despawn();
    }
    if !modal.open {
        return;
    }
    let f = &*fonts;
    let text = |font: &Handle<Font>, size: f32, color: Color, t: String| (Text::new(t), TextFont { font: font.clone().into(), font_size: FontSize::Px(size), ..default() }, TextColor(color), Pickable::IGNORE);
    let button = |label: &str, act: PillAct, bg: Color, fg: Color| {
        (
            act,
            Hover,
            Node { padding: UiRect::axes(Val::Px(18.0), Val::Px(9.0)), border_radius: BorderRadius::all(Val::Px(16.0)), ..default() },
            BackgroundColor(bg),
            children![(Text::new(label), TextFont { font: f.sans.clone().into(), font_size: FontSize::Px(15.0), ..default() }, TextColor(fg), Pickable::IGNORE)],
        )
    };
    // the view behind, dimmed; the sheet over it; the close tab under the sheet, where the pill was
    let cam = UiTargetCamera(overlay.0);
    commands.spawn((Sheet, cam.clone(), GlobalZIndex(30), Node { position_type: PositionType::Absolute, left: Val::Px(0.0), right: Val::Px(0.0), top: Val::Px(0.0), bottom: Val::Px(0.0), ..default() }, BackgroundColor(Color::srgba(0.090, 0.212, 0.333, 0.38))));
    commands
        .spawn((
            Sheet,
            cam.clone(),
            GlobalZIndex(31),
            Node { position_type: PositionType::Absolute, left: Val::Px(14.0), right: Val::Px(14.0), top: Val::Px(14.0), bottom: Val::Px(42.0), flex_direction: FlexDirection::Column, border_radius: BorderRadius::all(Val::Px(34.0)), overflow: Overflow::clip(), ..default() },
            BackgroundColor(crate::theme::colour("paper")),
            BoxShadow::new(Color::srgba(0.047, 0.094, 0.149, 0.25), Val::Px(0.0), Val::Px(30.0), Val::Px(0.0), Val::Px(80.0)),
        ))
        .with_children(|sheet| {
            sheet.spawn(Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(6.0), padding: UiRect::new(Val::Px(44.0), Val::Px(44.0), Val::Px(28.0), Val::Px(12.0)), ..default() }).with_children(|h| {
                h.spawn(text(&f.serif, 46.0, crate::theme::colour("forest"), "Proposals".into()));
                h.spawn(text(&f.sans, 16.0, crate::theme::colour("forest2"), "What agents propose from their lines. Nothing reaches main until you accept it here.".into()));
                if let Some(e) = &modal.error {
                    h.spawn(text(&f.sans, 15.0, Color::srgb(0.7, 0.2, 0.15), e.clone()));
                }
            });
            // the filters on the left; the cards, centred, in what is left
            sheet.spawn(Node { flex_direction: FlexDirection::Row, flex_grow: 1.0, min_height: Val::Px(0.0), column_gap: Val::Px(24.0), padding: UiRect::new(Val::Px(44.0), Val::Px(44.0), Val::Px(8.0), Val::Px(0.0)), ..default() }).with_children(|body| {
                body.spawn(Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(6.0), width: Val::Px(200.0), flex_shrink: 0.0, ..default() }).with_children(|aside| {
                    for (label, f2) in [("Open", Filter::Open), ("Done", Filter::Done), ("All", Filter::All)] {
                        let n = modal.list.iter().filter(|(_, p)| f2.keeps(p)).count();
                        let on = modal.filter == f2;
                        aside.spawn((
                            PillAct::Show(f2),
                            Hover,
                            Node { flex_direction: FlexDirection::Row, justify_content: JustifyContent::SpaceBetween, padding: UiRect::axes(Val::Px(14.0), Val::Px(9.0)), border_radius: BorderRadius::all(Val::Px(14.0)), ..default() },
                            BackgroundColor(if on { crate::theme::colour("picked") } else { Color::NONE }),
                            children![
                                (Text::new(label), TextFont { font: f.sans.clone().into(), font_size: FontSize::Px(17.0), ..default() }, TextColor(crate::theme::colour("forest")), Pickable::IGNORE),
                                (Text::new(n.to_string()), TextFont { font: f.mono.clone().into(), font_size: FontSize::Px(14.0), ..default() }, TextColor(crate::theme::colour("forest2")), Pickable::IGNORE),
                            ],
                        ));
                    }
                });
                body.spawn(Node { flex_direction: FlexDirection::Column, align_items: AlignItems::Center, row_gap: Val::Px(14.0), padding: UiRect::bottom(Val::Px(28.0)), overflow: Overflow::scroll_y(), flex_grow: 1.0, min_width: Val::Px(0.0), min_height: Val::Px(0.0), ..default() })
                .with_children(|list| {
                    let shown: Vec<&(String, thedb::proposals::Proposal)> = modal.list.iter().filter(|(_, p)| modal.filter.keeps(p)).collect();
                    if shown.is_empty() {
                        let none = match modal.filter {
                            Filter::Open => "Nothing waits for you. An agent proposes with `theDB propose line-<agent> \"<note>\"`.",
                            Filter::Done => "Nothing accepted or refused yet.",
                            Filter::All => "No proposals yet.",
                        };
                        list.spawn(text(&f.sans, 17.0, crate::theme::colour("forest2"), none.into()));
                    }
                    for (id, p) in shown {
                        let open = p.state == thedb::proposals::State::Open;
                        list.spawn((
                            Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(8.0), padding: UiRect::all(Val::Px(24.0)), border_radius: BorderRadius::all(Val::Px(24.0)), border: UiRect::left(Val::Px(4.0)), width: Val::Percent(100.0), max_width: Val::Px(760.0), flex_shrink: 0.0, ..default() },
                            BackgroundColor(crate::theme::colour("cream")),
                            BorderColor::all(if open { crate::theme::colour("sun") } else { crate::theme::colour("sand") }),
                        ))
                        .with_children(|card| {
                            let state = match p.state {
                                thedb::proposals::State::Open => "OPEN",
                                thedb::proposals::State::Merged => "ACCEPTED",
                                thedb::proposals::State::Refused => "REFUSED",
                            };
                            card.spawn(text(&f.sans, 13.0, crate::theme::colour("forest2"), format!("PROPOSAL · {state} · from {}", p.branch)));
                            card.spawn(text(&f.sans, 22.0, crate::theme::colour("forest"), p.note.clone()));
                            let docs: Vec<String> = p.docs.keys().map(|d| crate::db().meta(d).map(|m| format!("{} {}", m.0, m.1)).unwrap_or_else(|_| d.clone())).collect();
                            card.spawn(text(&f.mono, 13.0, crate::theme::colour("forest2"), format!("changes {}", docs.join(", "))));
                            let conflicts = modal.conflicts.get(id).cloned().unwrap_or_default();
                            if open && !conflicts.is_empty() {
                                // never hidden: what main and the line both changed, and Accept off until the line settles it
                                card.spawn((Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(4.0), padding: UiRect::all(Val::Px(14.0)), border_radius: BorderRadius::all(Val::Px(14.0)), ..default() }, BackgroundColor(Color::srgba(0.72, 0.22, 0.15, 0.10))))
                                    .with_children(|c| {
                                        c.spawn(text(&f.sans, 14.0, Color::srgb(0.62, 0.16, 0.10), format!("{} CONFLICT{} WITH MAIN · the agent runs `theDB sync {}`, settles them, proposes again", conflicts.len(), if conflicts.len() == 1 { "" } else { "S" }, p.branch)));
                                        for line in conflicts.iter().take(6) {
                                            c.spawn(text(&f.mono, 12.0, Color::srgb(0.45, 0.14, 0.10), line.clone()));
                                        }
                                    });
                            }
                            if open {
                                card.spawn(Node { flex_direction: FlexDirection::Row, column_gap: Val::Px(10.0), margin: UiRect::top(Val::Px(6.0)), ..default() }).with_children(|row| {
                                    if conflicts.is_empty() {
                                        row.spawn(button("Accept", PillAct::Accept(id.clone()), crate::theme::colour("clay"), crate::theme::colour("cream")));
                                    } else {
                                        row.spawn((Node { padding: UiRect::axes(Val::Px(18.0), Val::Px(9.0)), border_radius: BorderRadius::all(Val::Px(16.0)), ..default() }, BackgroundColor(crate::theme::colour("sand")), children![text(&f.sans, 15.0, crate::theme::colour("forest2"), "Accept: settle the conflicts first".to_string())]));
                                    }
                                    row.spawn(button("Refuse", PillAct::Refuse(id.clone()), crate::theme::colour("sand"), crate::theme::colour("forest")));
                                });
                            }
                        });
                    }
                });
            });
        });
    commands.spawn((
        Sheet,
        cam.clone(),
        PillAct::Close,
        GlobalZIndex(32),
        // a round button, over the sheet's lower edge
        Node { position_type: PositionType::Absolute, left: Val::Percent(50.0), bottom: Val::Px(14.0), margin: UiRect::left(Val::Px(-28.0)), width: Val::Px(56.0), height: Val::Px(56.0), border_radius: BorderRadius::all(Val::Percent(50.0)), justify_content: JustifyContent::Center, align_items: AlignItems::Center, ..default() },
        BackgroundColor(crate::theme::colour("paper")),
        BoxShadow::new(Color::srgba(0.047, 0.094, 0.149, 0.22), Val::Px(0.0), Val::Px(8.0), Val::Px(0.0), Val::Px(20.0)),
        children![(Text::new("×"), TextFont { font: f.sans.clone().into(), font_size: FontSize::Px(24.0), ..default() }, TextColor(crate::theme::colour("forest")), Pickable::IGNORE)],
    ));
}
