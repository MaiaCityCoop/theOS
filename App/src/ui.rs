//! The interface's live parts and its input, in theOS's look (brand/brand.css): what a click does, the frame time, the
//! Studio's shot strip and playhead. What is drawn where is a doc (`views.rs`).

use crate::View;
use crate::film::Studio;
use bevy::prelude::*;
use bevy::picking::events::{PointerClick, PointerDrag, PointerPress};
use bevy::picking::hover::Hovered;
use bevy::ui::UiGlobalTransform;


#[derive(Resource)]
pub struct Fonts {
    pub serif: Handle<Font>,
    pub sans: Handle<Font>,
    pub mono: Handle<Font>,
}

#[derive(Component, Clone, Copy, PartialEq, Debug)]
pub enum Act {
    Open(View),
    Home,
    PlayPause,
}

/// When the current view opened, in real seconds since the start.
#[derive(Resource, Default)]
struct Opened(f32);

fn opened(time: Res<Time<Real>>, mut o: ResMut<Opened>) {
    o.0 = time.elapsed_secs();
}

#[derive(Component)]
pub(crate) struct Strip;
#[derive(Component)]
pub(crate) struct Playhead;
#[derive(Component)]
pub(crate) struct Clock;
#[derive(Component)]
pub(crate) struct PlayLabel;
/// The Studio's shot list title, live.
#[derive(Component)]
pub(crate) struct Title;

pub fn plugin(app: &mut App) {
    app.init_resource::<Fonts>()
        .insert_resource(crate::views::Interactive)
        .add_systems(OnEnter(View::Home), release)
        .init_resource::<Opened>()
        .add_systems(Update, opened.run_if(state_changed::<View>))
        .add_observer(press)
        .add_observer(scrub_press)
        .add_observer(scrub_drag)
        .add_systems(Update, (hover, escape));
}

impl FromWorld for Fonts {
    fn from_world(world: &mut World) -> Self {
        let assets = world.resource::<AssetServer>();
        Fonts {
            serif: assets.load(crate::root::font(&crate::root::root().fonts.serif)),
            sans: assets.load(crate::root::font(&crate::root::root().fonts.sans)),
            mono: assets.load(crate::root::font(&crate::root::root().fonts.mono)),
        }
    }
}

fn text(font: &Handle<Font>, size: f32, color: Color, words: impl Into<String>) -> impl Bundle {
    (Text::new(words), TextFont { font: font.clone().into(), font_size: FontSize::Px(size), ..default() }, TextColor(color))
}


// ---- the Game: the frame time ----

#[derive(Component)]
pub(crate) struct FrameTime;


/// The frame time, smoothed, in milliseconds, and the frames a second it makes.
pub(crate) fn frame_time(d: Res<bevy::diagnostic::DiagnosticsStore>, mut t: Query<&mut Text, With<FrameTime>>) {
    let ms = d.get(&bevy::diagnostic::FrameTimeDiagnosticsPlugin::FRAME_TIME).and_then(|f| f.smoothed());
    if let (Some(ms), Ok(mut t)) = (ms, t.single_mut()) {
        t.0 = format!("{ms:.1} ms · {:.0} fps", 1000.0 / ms);
    }
}

// ---- the Studio: the world through the virtual camera, the shots as a strip under it ----

/// The strip shows the shot list it is given: one card per shot, as wide as the shot is long, and the playhead.
pub(crate) fn strip_follows(mut commands: Commands, f: Res<Fonts>, s: Res<Studio>, strip: Query<Entity, With<Strip>>, mut shown: Local<Option<String>>) {
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
                BackgroundColor(crate::theme::colour("sand")),
                Pickable::IGNORE,
                children![
                    (text(&f.sans, 15.0, crate::theme::colour("forest"), c.name.clone()), Pickable::IGNORE),
                    (text(&f.mono, 12.0, crate::theme::colour("forest2"), format!("{} · {:.0} mm · {:.1} s", c.kind, mm, c.secs)), Pickable::IGNORE),
                ],
            ));
        }
        p.spawn((
            Playhead,
            Pickable::IGNORE,
            Node { position_type: PositionType::Absolute, top: Val::Px(-4.0), bottom: Val::Px(-4.0), width: Val::Px(3.0), border_radius: BorderRadius::MAX, ..default() },
            BackgroundColor(crate::theme::colour("sun")),
        ));
    });
}

pub(crate) fn playhead(
    s: Res<Studio>,
    mut head: Query<&mut Node, With<Playhead>>,
    mut clock: Query<&mut Text, (With<Clock>, Without<PlayLabel>, Without<Title>)>,
    mut label: Query<&mut Text, (With<PlayLabel>, Without<Clock>, Without<Title>)>,
    mut title: Query<&mut Text, (With<Title>, Without<Clock>, Without<PlayLabel>)>,
) {
    for mut t in &mut title {
        if t.0 != s.timeline.title {
            t.0 = s.timeline.title.clone();
        }
    }
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
    docs: Query<&crate::views::OpenDoc>,
    opened: Res<Opened>,
    time: Res<Time<Real>>,
    mut next: ResMut<NextState<View>>,
    mut s: ResMut<Studio>,
) {
    let Ok(act) = acts.get(click.entity) else { return };
    // a box that opens a doc: a shot list opens in the Studio
    if let Ok(crate::views::OpenDoc(id)) = docs.get(click.entity)
        && crate::views::opens(id) == View::Studio
    {
        s.open(id);
    }
    click.propagate(false);
    // a view that has just opened ignores clicks for a moment: the click that opened it must not land on what is now
    // under the mouse (Home, then the Game tile under the pointer)
    if time.elapsed_secs() - opened.0 < 0.35 {
        return;
    }
    match *act {
        Act::Open(v) => next.set(v),
        Act::Home => next.set(View::Home),
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

/// A button the self-test clicks: one of the app's, or one of theDB view's (the first that matches).
#[derive(Clone, Copy)]
enum Click {
    Act(Act),
    Setup(crate::setup::SetupAct),
    Pill(fn(&crate::pill::PillAct) -> bool),
    Db(fn(&crate::thedb_view::DbAct) -> bool),
}

/// `--navtest`: from the dashboard into each view and back with Home, by clicking; through theDB's view (a kind, a doc
/// and an earlier version of it, a font and the blob it is, the blobs and one of them, the branch select open, main chosen); prints each step,
/// then quits. While theDB's view reads the store the test waits.
#[allow(clippy::too_many_arguments)]
pub fn navtest(
    mut commands: Commands,
    mut n: Local<u32>,
    mut step: Local<usize>,
    mut failed: Local<bool>,
    mut setup_first: Local<Option<bool>>,
    setup_buttons: Query<(&crate::setup::SetupAct, &ComputedNode, &UiGlobalTransform)>,
    pill_buttons: Query<(&crate::pill::PillAct, &ComputedNode, &UiGlobalTransform)>,
    buttons: Query<(&Act, &ComputedNode, &UiGlobalTransform)>,
    db_buttons: Query<(&crate::thedb_view::DbAct, &ComputedNode, &UiGlobalTransform)>,
    db: Option<Res<crate::thedb_view::Db>>,
    ui_cameras: Query<&Camera, With<IsDefaultUiCamera>>,
    state: Res<State<View>>,
    window: Query<Entity, With<bevy::window::PrimaryWindow>>,
    mut input: MessageWriter<bevy::picking::pointer::PointerInput>,
    mut exit: MessageWriter<AppExit>,
) {
    use crate::thedb_view::DbAct;
    use bevy::camera::RenderTarget;
    use bevy::picking::pointer::{Location, PointerAction, PointerButton, PointerId, PointerInput};
    use bevy::window::WindowRef;
    // a store without a master starts on the setup screen: its key made, then saved, then the dashboard
    let setup = [(Click::Setup(crate::setup::SetupAct::Make), View::Setup), (Click::Setup(crate::setup::SetupAct::Saved), View::Home)];
    let with_setup = *setup_first.get_or_insert_with(|| matches!(crate::db().master(), Ok(None)));
    let views: [(Click, View); 22] = [
        (Click::Act(Act::Open(View::Studio)), View::Studio),
        (Click::Act(Act::Home), View::Home),
        (Click::Act(Act::Open(View::Game)), View::Game),
        (Click::Act(Act::Home), View::Home),
        (Click::Act(Act::Open(View::TheDB)), View::TheDB),
        (Click::Db(|a| *a == DbAct::Kind("layer".into())), View::TheDB),
        (Click::Db(|a| *a == DbAct::Kind("view".into())), View::TheDB),
        (Click::Db(|a| matches!(a, DbAct::Doc(_))), View::TheDB),
        (Click::Db(|a| *a == DbAct::Version(0)), View::TheDB),
        (Click::Db(|a| *a == DbAct::Kind("font".into())), View::TheDB),
        (Click::Db(|a| matches!(a, DbAct::Doc(_))), View::TheDB),
        (Click::Db(|a| matches!(a, DbAct::Blob(_))), View::TheDB),
        (Click::Db(|a| *a == DbAct::Blobs), View::TheDB),
        (Click::Db(|a| matches!(a, DbAct::Blob(_))), View::TheDB),
        (Click::Db(|a| *a == DbAct::Select), View::TheDB),
        (Click::Db(|a| *a == DbAct::Branch(None)), View::TheDB),
        (Click::Act(Act::Home), View::Home),
        // the proposals, over the dashboard: opened, the first open one accepted (if there is one), closed
        (Click::Pill(|a| *a == crate::pill::PillAct::Proposals), View::Home),
        (Click::Pill(|a| *a == crate::pill::PillAct::Show(crate::pill::Filter::Done)), View::Home),
        (Click::Pill(|a| *a == crate::pill::PillAct::Show(crate::pill::Filter::Open)), View::Home),
        (Click::Pill(|a| matches!(a, crate::pill::PillAct::Accept(_) | crate::pill::PillAct::Close)), View::Home),
        (Click::Pill(|a| *a == crate::pill::PillAct::Close), View::Home),
    ];
    let steps: Vec<(Click, View)> = setup.into_iter().filter(|_| with_setup).chain(views).collect();
    // a pointer of its own, so the real mouse over the window cannot move it
    const TEST: PointerId = PointerId::Custom(bevy::asset::uuid::Uuid::from_u128(0x0046_0047));
    if *state.get() == View::TheDB && db.as_ref().is_some_and(|d| d.reading) {
        return;
    }
    *n += 1;
    if *n == 1 {
        commands.spawn(TEST);
    }
    let Some(&(click, want)) = steps.get(*step) else {
        println!("navtest: {}", if *failed { "FAILED" } else { "all passed" });
        exit.write(if *failed { AppExit::error() } else { AppExit::Success });
        return;
    };
    let phase = *n % 120;
    // NAVTEST_SHOTS=<dir>: a picture of each view as the test reaches it
    if phase == 117
        && let Some(dir) = std::env::var_os("NAVTEST_SHOTS")
    {
        let path = std::path::Path::new(&dir).join(format!("{:02}-{:?}.png", *step, state.get()));
        commands.spawn(bevy::render::view::screenshot::Screenshot::primary_window()).observe(bevy::render::view::screenshot::save_to_disk(path));
    }
    if phase == 119 {
        let drawn = ui_cameras.iter().filter(|c| c.is_active).count() == 1;
        let ok = *state.get() == want && drawn;
        let what = match click {
            Click::Act(a) => format!("{a:?}"),
            Click::Db(_) => "in theDB's view".to_string(),
            Click::Setup(a) => format!("{a:?} on the setup screen"),
            Click::Pill(_) => "on the pill or in the proposals".to_string(),
        };
        println!(
            "navtest: step {} click {what}: now {:?}, {} {}",
            *step,
            state.get(),
            if drawn { "drawn" } else { "NOT DRAWN (no one active interface camera)" },
            if ok { "ok" } else { "FAILED" }
        );
        *failed |= !ok;
        *step += 1;
        return;
    }
    let found = match click {
        Click::Act(act) => buttons.iter().find(|(a, ..)| **a == act).map(|(_, n, t)| (n, t)),
        Click::Setup(act) => setup_buttons.iter().find(|(a, ..)| **a == act).map(|(_, n, t)| (n, t)),
        // an Accept before the Close: the first proposal's
        Click::Pill(pick) => {
            let mut found: Vec<_> = pill_buttons.iter().filter(|(a, ..)| pick(a)).collect();
            found.sort_by_key(|(a, ..)| matches!(a, crate::pill::PillAct::Close));
            found.first().map(|(_, n, t)| (*n, *t))
        }
        // the first on screen: the topmost, then the leftmost
        Click::Db(pick) => db_buttons.iter().filter(|(a, ..)| pick(a)).min_by(|x, y| (x.2.translation.y, x.2.translation.x).partial_cmp(&(y.2.translation.y, y.2.translation.x)).unwrap_or(std::cmp::Ordering::Equal)).map(|(_, n, t)| (n, t)),
    };
    let Some((node, at)) = found else { return };
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
