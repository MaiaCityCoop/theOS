//! The interface, drawn by Bevy in theOS's look (brand/brand.css: Meadow): the dashboard with its two tiles, the
//! Game's few words, and the Studio's shot strip.

use crate::View;
use crate::film::Studio;
use bevy::prelude::*;
use bevy::picking::events::{PointerClick, PointerDrag, PointerPress};
use bevy::picking::hover::Hovered;
use bevy::ui::UiGlobalTransform;

// brand/brand.css, :root
const PAPER: Color = Color::srgb(0.969, 0.941, 0.890); // --paper #f7f0e3
const CREAM: Color = Color::srgb(0.984, 0.965, 0.918); // --cream #fbf6ea
const SAND: Color = Color::srgb(0.925, 0.882, 0.800); // --sand #ece1cc
const FOREST: Color = Color::srgb(0.090, 0.212, 0.333); // --forest #173655
const FOREST2: Color = Color::srgb(0.275, 0.349, 0.431); // --forest2 #46596e
const CLAY: Color = Color::srgb(0.310, 0.616, 0.204); // --clay #4f9d34
const SUN: Color = Color::srgb(0.949, 0.710, 0.267); // --sun #f2b544
const GLASS: Color = Color::srgba(0.984, 0.965, 0.918, 0.82);

#[derive(Resource)]
struct Fonts {
    serif: Handle<Font>,
    sans: Handle<Font>,
    mono: Handle<Font>,
}

#[derive(Component, Clone, Copy, PartialEq, Debug)]
pub enum Act {
    Open(View),
    Home,
    PlayPause,
    NewShots,
    Anchors,
    /// The Library's asset at this place on the shelf.
    Pick(usize),
}

/// When the current view opened, in real seconds since the start.
#[derive(Resource, Default)]
struct Opened(f32);

fn opened(time: Res<Time<Real>>, mut o: ResMut<Opened>) {
    o.0 = time.elapsed_secs();
}

#[derive(Component)]
struct Strip;
#[derive(Component)]
struct Playhead;
#[derive(Component)]
struct Clock;
#[derive(Component)]
struct PlayLabel;

pub fn plugin(app: &mut App) {
    app.init_resource::<Fonts>()
        .add_systems(OnEnter(View::Home), (home, release))
        .add_systems(OnEnter(View::Studio), studio)
        .add_systems(OnEnter(View::Meadow), meadow)
        .add_systems(OnEnter(View::Library), library)
        .init_resource::<Opened>()
        .add_systems(Update, opened.run_if(state_changed::<View>))
        .add_observer(press)
        .add_observer(scrub_press)
        .add_observer(scrub_drag)
        .add_observer(slide_press)
        .add_observer(slide_drag)
        .add_systems(Update, (hover, escape, (strip_follows, playhead).run_if(in_state(View::Studio)), (frame_time, slide_show).run_if(in_state(View::Meadow)), shelf_marks.run_if(in_state(View::Library))));
}

impl FromWorld for Fonts {
    fn from_world(world: &mut World) -> Self {
        let assets = world.resource::<AssetServer>();
        Fonts {
            serif: assets.load("fonts/DMSerifDisplay-Regular.ttf"),
            sans: assets.load("fonts/DMSans-Variable.ttf"),
            mono: assets.load("fonts/DMMono-Regular.ttf"),
        }
    }
}

fn text(font: &Handle<Font>, size: f32, color: Color, words: impl Into<String>) -> impl Bundle {
    (Text::new(words), TextFont { font: font.clone().into(), font_size: FontSize::Px(size), ..default() }, TextColor(color))
}

fn pill(f: &Fonts, act: Act, words: &'static str, dark: bool) -> impl Bundle {
    let (bg, fg) = if dark { (FOREST, CREAM) } else { (CREAM, FOREST) };
    (
        Hovered::default(),
        act,
        Node {
            height: Val::Px(40.0),
            padding: UiRect::horizontal(Val::Px(18.0)),
            align_items: AlignItems::Center,
            justify_content: JustifyContent::Center,
            border_radius: BorderRadius::MAX,
            ..default()
        },
        BackgroundColor(bg),
        children![text(&f.sans, 15.0, fg, words)],
    )
}


// ---- the dashboard: a welcome line and two tiles ----

fn home(mut commands: Commands, f: Res<Fonts>) {
    let tile = |act: Act, dark: bool, label: &'static str, title: &'static str, words: &'static str, grow: f32| {
        let (bg, fg) = if dark { (FOREST, CREAM) } else { (CREAM, FOREST) };
        (
            Hovered::default(),
            act,
            Node {
                flex_grow: grow,
                flex_basis: Val::Px(0.0),
                min_height: Val::Px(420.0),
                padding: UiRect::all(Val::Px(30.0)),
                flex_direction: FlexDirection::Column,
                border_radius: BorderRadius::all(Val::Px(32.0)),
                ..default()
            },
            BackgroundColor(bg),
            BoxShadow::new(Color::srgba(0.09, 0.21, 0.33, 0.10), Val::Px(0.0), Val::Px(10.0), Val::Px(0.0), Val::Px(28.0)),
            children![
                text(&f.mono, 13.0, if dark { SUN } else { CLAY }, label),
                (text(&f.serif, 46.0, fg, title), Node { margin: UiRect::vertical(Val::Px(12.0)), ..default() }),
                text(&f.sans, 18.0, fg, words),
            ],
        )
    };
    commands.spawn((
        DespawnOnExit(View::Home),
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            padding: UiRect::all(Val::Px(36.0)),
            row_gap: Val::Px(20.0),
            ..default()
        },
        BackgroundColor(PAPER),
        children![
            (
                Node {
                    padding: UiRect::axes(Val::Px(28.0), Val::Px(20.0)),
                    align_items: AlignItems::Center,
                    column_gap: Val::Px(18.0),
                    border_radius: BorderRadius::all(Val::Px(32.0)),
                    ..default()
                },
                BackgroundColor(CREAM),
                children![
                    text(&f.serif, 34.0, FOREST, "NativeGame"),
                    (text(&f.sans, 17.0, FOREST2, "Day one, auf der grünen Wiese: a green plain, and a camera to film it."), Node { margin: UiRect::left(Val::Auto), ..default() }),
                ],
            ),
            (
                Node { column_gap: Val::Px(20.0), flex_grow: 1.0, ..default() },
                children![
                    tile(Act::Open(View::Meadow), true, "A · GAME", "Game", "The meadow: grass in wind, a physical sky, the sun. Click to look, W A S D, scroll to rise.", 2.0),
                    tile(Act::Open(View::Studio), false, "B · STUDIO", "Studio", "Shots played live through the world by the virtual camera.", 1.0),
                    tile(Act::Open(View::Library), false, "C · LIBRARY", "Library", "Every plant and rock, each a procedural master, beside its baked far view.", 1.0),
                ],
            ),
        ],
    ));
}

// ---- the Library: Home, and what the shelf shows ----

fn library(mut commands: Commands, f: Res<Fonts>) {
    commands.spawn((
        DespawnOnExit(View::Library),
        Node { position_type: PositionType::Absolute, top: Val::Px(12.0), left: Val::Px(12.0), right: Val::Px(12.0), column_gap: Val::Px(8.0), ..default() },
        children![
            (Hovered::default(), Act::Home, chip_node(), BackgroundColor(CREAM), children![text(&f.sans, CHIP_TEXT, FOREST, "Home")]),
            (chip_node(), BackgroundColor(GLASS), children![(crate::workshop::Caption, text(&f.mono, CHIP_TEXT, FOREST, "…"))]),
            (chip_node(), BackgroundColor(GLASS), children![text(&f.mono, CHIP_TEXT, FOREST, "left/right · Space new seed · scroll zoom")]),
        ],
    ));
    // the shelf: every asset of the library, grouped by kind, on the left; the chosen one dark
    let library = crate::library::shelf();
    commands
        .spawn((
            DespawnOnExit(View::Library),
            Node {
                position_type: PositionType::Absolute,
                top: Val::Px(52.0),
                left: Val::Px(12.0),
                width: Val::Px(180.0),
                padding: UiRect::all(Val::Px(10.0)),
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(4.0),
                border_radius: BorderRadius::all(Val::Px(16.0)),
                ..default()
            },
            BackgroundColor(GLASS),
        ))
        .with_children(|list| {
            let mut kind = String::new();
            for (k, a) in library.iter().enumerate() {
                if a.kind != kind {
                    kind = a.kind.clone();
                    list.spawn((text(&f.mono, 11.0, CLAY, if kind == "rock" { "ROCKS" } else { "PLANTS" }), Node { margin: UiRect::top(Val::Px(6.0)), ..default() }));
                }
                list.spawn((
                    Hovered::default(),
                    Act::Pick(k),
                    ShelfItem(k),
                    Node { height: Val::Px(26.0), padding: UiRect::horizontal(Val::Px(10.0)), align_items: AlignItems::Center, border_radius: BorderRadius::MAX, ..default() },
                    BackgroundColor(Color::NONE),
                    children![(ShelfLabel, text(&f.sans, 13.0, FOREST, &a.name))],
                ));
            }
        });
}

/// An entry of the Library's list, and its words.
#[derive(Component)]
struct ShelfItem(usize);
#[derive(Component)]
struct ShelfLabel;

fn shelf_marks(shelf: Option<Res<crate::workshop::Shelf>>, mut items: Query<(&ShelfItem, &mut BackgroundColor, &Children)>, mut labels: Query<&mut TextColor, With<ShelfLabel>>) {
    let Some(s) = shelf else { return };
    for (item, mut bg, kids) in &mut items {
        let on = item.0 == s.at;
        bg.0 = if on { FOREST } else { Color::NONE };
        for k in kids.iter() {
            if let Ok(mut c) = labels.get_mut(k) {
                c.0 = if on { CREAM } else { FOREST };
            }
        }
    }
}

// ---- the Meadow: the test scene, Home, the frame time and the hour ----

#[derive(Component)]
struct FrameTime;

/// The Meadow's overlay: small chips along the top edge, all one height, so the picture keeps the room.
const CHIP: f32 = 28.0;
const CHIP_TEXT: f32 = 12.0;

fn chip_node() -> Node {
    Node { height: Val::Px(CHIP), padding: UiRect::horizontal(Val::Px(12.0)), align_items: AlignItems::Center, border_radius: BorderRadius::MAX, ..default() }
}

fn meadow(mut commands: Commands, f: Res<Fonts>) {
    commands.spawn((
        DespawnOnExit(View::Meadow),
        Node {
            position_type: PositionType::Absolute,
            top: Val::Px(12.0),
            left: Val::Px(12.0),
            right: Val::Px(12.0),
            column_gap: Val::Px(8.0),
            align_items: AlignItems::FlexStart,
            ..default()
        },
        children![
            (
                Hovered::default(),
                Act::Home,
                chip_node(),
                BackgroundColor(CREAM),
                children![text(&f.sans, CHIP_TEXT, FOREST, "Home")],
            ),
            (chip_node(), BackgroundColor(GLASS), children![(FrameTime, text(&f.mono, CHIP_TEXT, FOREST, "…"))]),
            (chip_node(), BackgroundColor(GLASS), children![text(&f.mono, CHIP_TEXT, FOREST, "click to look · WASD · Shift runs · scroll rises · Esc lets go")]),
            // the wind and the hour, top right: drag or click a bar
            (
                Node { margin: UiRect::left(Val::Auto), flex_direction: FlexDirection::Column, row_gap: Val::Px(6.0), ..default() },
                children![slider(&f, Slide::Wind, "Wind"), slider(&f, Slide::Hour, "Sun")],
            ),
        ],
    ));
}

/// A slider of the Meadow: what it sets.
#[derive(Component, Clone, Copy, PartialEq)]
enum Slide {
    Wind,
    Hour,
}
#[derive(Component)]
struct Fill(Slide);
#[derive(Component)]
struct Readout(Slide);

fn slider(f: &Fonts, what: Slide, label: &'static str) -> impl Bundle {
    (
        Node { column_gap: Val::Px(10.0), ..chip_node() },
        BackgroundColor(GLASS),
        children![
            (text(&f.mono, CHIP_TEXT, FOREST, label), Node { width: Val::Px(32.0), ..default() }),
            (
                what,
                Node { width: Val::Px(140.0), height: Val::Px(7.0), border_radius: BorderRadius::MAX, overflow: Overflow::clip(), ..default() },
                BackgroundColor(SAND),
                children![(Fill(what), Pickable::IGNORE, Node { width: Val::Percent(50.0), height: Val::Percent(100.0), border_radius: BorderRadius::MAX, ..default() }, BackgroundColor(CLAY))],
            ),
            (Readout(what), text(&f.mono, CHIP_TEXT, FOREST, ""), Node { width: Val::Px(40.0), ..default() }),
        ],
    )
}

fn slide_press(ev: On<PointerPress>, bars: Query<(&Slide, &ComputedNode, &UiGlobalTransform)>, wind: ResMut<crate::wind::Strength>, hour: ResMut<crate::meadow::Hour>) {
    slide_to(ev.entity, ev.pointer.position.x, &bars, wind, hour);
}
fn slide_drag(ev: On<PointerDrag>, bars: Query<(&Slide, &ComputedNode, &UiGlobalTransform)>, wind: ResMut<crate::wind::Strength>, hour: ResMut<crate::meadow::Hour>) {
    slide_to(ev.entity, ev.pointer.position.x, &bars, wind, hour);
}
fn slide_to(
    e: Entity,
    x: f32,
    bars: &Query<(&Slide, &ComputedNode, &UiGlobalTransform)>,
    mut wind: ResMut<crate::wind::Strength>,
    mut hour: ResMut<crate::meadow::Hour>,
) {
    let Ok((what, node, at)) = bars.get(e) else { return };
    let (centre, width) = (at.translation.x * node.inverse_scale_factor, node.size.x * node.inverse_scale_factor);
    let q = ((x - (centre - width / 2.0)) / width.max(1.0)).clamp(0.0, 1.0);
    match what {
        Slide::Wind => wind.0 = q * crate::wind::MAX,
        Slide::Hour => hour.0 = q * 24.0,
    }
}
fn slide_show(
    wind: Res<crate::wind::Strength>,
    hour: Res<crate::meadow::Hour>,
    mut fills: Query<(&Fill, &mut Node)>,
    mut readouts: Query<(&Readout, &mut Text)>,
) {
    let q = |w: Slide| match w {
        Slide::Wind => wind.0 / crate::wind::MAX,
        Slide::Hour => hour.0 / 24.0,
    };
    for (f, mut n) in &mut fills {
        n.width = Val::Percent(q(f.0) * 100.0);
    }
    for (r, mut t) in &mut readouts {
        let words = match r.0 {
            Slide::Wind => format!("{:.0} %", wind.0 / crate::wind::MAX * 100.0),
            Slide::Hour => format!("{:02}:{:02}", hour.0 as u32 % 24, (hour.0.fract() * 60.0) as u32),
        };
        if t.0 != words {
            t.0 = words;
        }
    }
}

fn frame_time(d: Res<bevy::diagnostic::DiagnosticsStore>, hour: Res<crate::meadow::Hour>, mut t: Query<&mut Text, With<FrameTime>>) {
    if let (Some(ms), Ok(mut t)) = (crate::meadow::frame_ms(&d), t.single_mut()) {
        t.0 = format!("{ms:.1} ms · {:.0} fps · {:02}:{:02}", 1000.0 / ms, hour.0 as u32, ((hour.0.fract()) * 60.0) as u32);
    }
}

// ---- the Studio: the world through the virtual camera, the shots as a strip under it ----

fn studio(mut commands: Commands, f: Res<Fonts>, s: Res<Studio>) {
    commands
        .spawn((
            DespawnOnExit(View::Studio),
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(20.0),
                right: Val::Px(20.0),
                bottom: Val::Px(20.0),
                padding: UiRect::all(Val::Px(14.0)),
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(12.0),
                border_radius: BorderRadius::all(Val::Px(28.0)),
                ..default()
            },
            BackgroundColor(GLASS),
        ))
        .with_children(|p| {
            p.spawn(Node { column_gap: Val::Px(10.0), align_items: AlignItems::Center, ..default() }).with_children(|row| {
                row.spawn(pill(&f, Act::Home, "Home", false));
                row.spawn((
                    Hovered::default(),
                    Act::PlayPause,
                    Node {
                        height: Val::Px(40.0),
                        width: Val::Px(92.0),
                        align_items: AlignItems::Center,
                        justify_content: JustifyContent::Center,
                        border_radius: BorderRadius::MAX,
                        ..default()
                    },
                    BackgroundColor(FOREST),
                    children![(PlayLabel, text(&f.sans, 15.0, CREAM, "Play"))],
                ));
                row.spawn((Clock, text(&f.mono, 15.0, FOREST, "0.0 s")));
                row.spawn((text(&f.serif, 22.0, FOREST, s.timeline.title.clone()), Node { margin: UiRect::left(Val::Px(8.0)), ..default() }));
                row.spawn((Node { margin: UiRect::left(Val::Auto), ..default() },)).with_children(|r| {
                    r.spawn(pill(&f, Act::Anchors, "The four anchors", false));
                    r.spawn(pill(&f, Act::NewShots, "Five new shots", false));
                });
            });
            p.spawn((
                Strip,
                Node { height: Val::Px(86.0), column_gap: Val::Px(4.0), ..default() },
            ));
        });
}

/// The strip shows the shot list it is given: one card per shot, as wide as the shot is long, and the playhead.
fn strip_follows(mut commands: Commands, f: Res<Fonts>, s: Res<Studio>, strip: Query<Entity, With<Strip>>, mut shown: Local<Option<String>>) {
    let Ok(strip) = strip.single() else { return };
    if shown.as_deref() == Some(s.timeline.title.as_str()) {
        return;
    }
    *shown = Some(s.timeline.title.clone());
    commands.entity(strip).despawn_children();
    let total = s.duration().max(1e-3);
    commands.entity(strip).with_children(|p| {
        for c in &s.timeline.clips {
            let mm = c.keys.first().map_or(35.0, |k| k.mm);
            p.spawn((
                Node {
                    width: Val::Percent(c.secs / total * 100.0),
                    padding: UiRect::all(Val::Px(10.0)),
                    flex_direction: FlexDirection::Column,
                    overflow: Overflow::clip(),
                    border_radius: BorderRadius::all(Val::Px(16.0)),
                    ..default()
                },
                BackgroundColor(SAND),
                Pickable::IGNORE,
                children![
                    (text(&f.sans, 15.0, FOREST, c.name.clone()), Pickable::IGNORE),
                    (text(&f.mono, 12.0, FOREST2, format!("{} · {:.0} mm · {:.1} s", c.kind, mm, c.secs)), Pickable::IGNORE),
                ],
            ));
        }
        p.spawn((
            Playhead,
            Pickable::IGNORE,
            Node { position_type: PositionType::Absolute, top: Val::Px(-4.0), bottom: Val::Px(-4.0), width: Val::Px(3.0), border_radius: BorderRadius::MAX, ..default() },
            BackgroundColor(SUN),
        ));
    });
}

fn playhead(
    s: Res<Studio>,
    mut head: Query<&mut Node, With<Playhead>>,
    mut clock: Query<&mut Text, (With<Clock>, Without<PlayLabel>)>,
    mut label: Query<&mut Text, (With<PlayLabel>, Without<Clock>)>,
) {
    let total = s.duration().max(1e-3);
    for mut n in &mut head {
        n.left = Val::Percent((s.time / total * 100.0).clamp(0.0, 100.0));
    }
    for mut t in &mut clock {
        t.0 = format!("{:.1} / {:.1} s", s.time, total);
    }
    for mut t in &mut label {
        let words = if s.playing { "Pause" } else { "Play" };
        if t.0 != words {
            t.0 = words.into();
        }
    }
}

/// Click or drag on the strip: the playhead goes where the pointer is.
fn scrub_press(ev: On<PointerPress>, strip: Query<(&ComputedNode, &UiGlobalTransform), With<Strip>>, s: ResMut<Studio>) {
    seek(ev.entity, ev.pointer.position.x, &strip, s);
}
fn scrub_drag(ev: On<PointerDrag>, strip: Query<(&ComputedNode, &UiGlobalTransform), With<Strip>>, s: ResMut<Studio>) {
    seek(ev.entity, ev.pointer.position.x, &strip, s);
}
fn seek(e: Entity, x: f32, strip: &Query<(&ComputedNode, &UiGlobalTransform), With<Strip>>, mut s: ResMut<Studio>) {
    let Ok((node, at)) = strip.get(e) else { return };
    let (centre, width) = (at.translation.x * node.inverse_scale_factor, node.size.x * node.inverse_scale_factor);
    s.time = ((x - (centre - width / 2.0)) / width.max(1.0)).clamp(0.0, 1.0) * s.duration();
}

fn press(
    mut click: On<PointerClick>,
    acts: Query<&Act>,
    opened: Res<Opened>,
    time: Res<Time<Real>>,
    mut next: ResMut<NextState<View>>,
    mut s: ResMut<Studio>,
    shelf: Option<ResMut<crate::workshop::Shelf>>,
) {
    let Ok(act) = acts.get(click.entity) else { return };
    click.propagate(false);
    // a view that has just opened ignores clicks for a moment: the click that opened it must not land on what is now
    // under the mouse (Home, then the Game tile under the pointer)
    if time.elapsed_secs() - opened.0 < 0.35 {
        return;
    }
    match *act {
        Act::Open(v) => next.set(v),
        Act::Home => next.set(View::Home),
        Act::NewShots => s.new_shots(),
        Act::Anchors => s.open(crate::film::ANCHORS),
        Act::Pick(k) => {
            if let Some(mut shelf) = shelf {
                shelf.at = k;
                shelf.dirty = true;
            }
        }
        Act::PlayPause => {
            if s.time >= s.duration() {
                s.time = 0.0;
            }
            s.playing = !s.playing;
        }
    }
}

/// The buttons whose hover changed this frame.
type HoverChanged = (Changed<Hovered>, With<Act>);

fn hover(mut q: Query<(&Hovered, &mut Node), HoverChanged>) {
    for (h, mut n) in &mut q {
        n.top = if h.get() { Val::Px(-2.0) } else { Val::Px(0.0) };
    }
}

/// Escape lets a captured mouse go first; pressed again, it goes home. Leaving a view always lets the mouse go.
fn escape(
    keys: Res<ButtonInput<KeyCode>>,
    state: Res<State<View>>,
    mut next: ResMut<NextState<View>>,
    mut cursor: Query<&mut bevy::window::CursorOptions>,
) {
    if !keys.just_pressed(KeyCode::Escape) || *state.get() == View::Home {
        return;
    }
    let mut was_captured = false;
    for mut c in &mut cursor {
        was_captured |= c.grab_mode != bevy::window::CursorGrabMode::None;
        c.grab_mode = bevy::window::CursorGrabMode::None;
        c.visible = true;
    }
    if !was_captured {
        next.set(View::Home);
    }
}

fn release(mut cursor: Query<&mut bevy::window::CursorOptions>) {
    for mut c in &mut cursor {
        c.grab_mode = bevy::window::CursorGrabMode::None;
        c.visible = true;
    }
}

// ---- the navigation's self-test: clicks the real buttons through the pointer input, as a mouse would ----

/// `--navtest`: from the dashboard into each view and back with Home, by clicking; prints each step, then quits.
pub fn navtest(
    mut commands: Commands,
    mut n: Local<u32>,
    mut step: Local<usize>,
    mut failed: Local<bool>,
    buttons: Query<(&Act, &ComputedNode, &UiGlobalTransform)>,
    ui_cameras: Query<&Camera, With<IsDefaultUiCamera>>,
    state: Res<State<View>>,
    window: Query<Entity, With<bevy::window::PrimaryWindow>>,
    mut input: MessageWriter<bevy::picking::pointer::PointerInput>,
    mut exit: MessageWriter<AppExit>,
) {
    use bevy::camera::RenderTarget;
    use bevy::picking::pointer::{Location, PointerAction, PointerButton, PointerId, PointerInput};
    use bevy::window::WindowRef;
    const STEPS: [(Act, View); 6] = [
        (Act::Open(View::Library), View::Library),
        (Act::Home, View::Home),
        (Act::Open(View::Studio), View::Studio),
        (Act::Home, View::Home),
        (Act::Open(View::Meadow), View::Meadow),
        (Act::Home, View::Home),
    ];
    // a pointer of its own, so the real mouse over the window cannot move it
    const TEST: PointerId = PointerId::Custom(bevy::asset::uuid::Uuid::from_u128(0x0046_0047));
    *n += 1;
    if *n == 1 {
        commands.spawn(TEST);
    }
    let Some(&(act, want)) = STEPS.get(*step) else {
        println!("navtest: {}", if *failed { "FAILED" } else { "all passed" });
        exit.write(if *failed { AppExit::error() } else { AppExit::Success });
        return;
    };
    let phase = *n % 120;
    if phase == 119 {
        let drawn = ui_cameras.iter().filter(|c| c.is_active).count() == 1;
        let ok = *state.get() == want && drawn;
        println!(
            "navtest: step {} click {act:?}: now {:?}, {} {}",
            *step,
            state.get(),
            if drawn { "drawn" } else { "NOT DRAWN (no one active interface camera)" },
            if ok { "ok" } else { "FAILED" }
        );
        *failed |= !ok;
        *step += 1;
        return;
    }
    let Some((_, node, at)) = buttons.iter().find(|(a, ..)| **a == act) else { return };
    let target = RenderTarget::Window(WindowRef::Primary).normalize(window.single().ok()).unwrap();
    let pos = at.translation * node.inverse_scale_factor;
    let location = Location { target, position: pos };
    match phase {
        60 => {
            input.write(PointerInput::new(TEST, location, PointerAction::Move { delta: Vec2::ZERO }));
        }
        62 => {
            input.write(PointerInput::new(TEST, location, PointerAction::Press(PointerButton::Primary)));
        }
        64 => {
            input.write(PointerInput::new(TEST, location, PointerAction::Release(PointerButton::Primary)));
        }
        _ => {}
    }
}

