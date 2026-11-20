//! The interface as docs (intent 0049): a view, and every layer laid over a world (a chip, a bar of chips, the sun and
//! wind sliders, the Library's list, the Studio's bar), is a doc in theDB: a tree of boxes and words in the brand's
//! look, and this is what draws it. Everything in it is data: where a layer sits, its words or the live value they
//! show (the frame time, the asset's caption, the playhead), what a click does (Home, Play, open a doc by id), a slider
//! of the clock, a list made from the library. A layer can include another by id, so one Home chip serves every view;
//! each view lists, in the root, the layers it shows. A view can also be filmed as a world (`World::Interface`), with a
//! pointer the shot moves.

use crate::View;
use crate::contract::World;
use bevy::prelude::*;
use bevy::picking::hover::Hovered;
use serde::Deserialize;

/// A node of a view: another layer by id, a slider, a list, words, or a box (with its children).
#[derive(Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum Spec {
    Include { layer: String },
    Slider { slider: String, label: String },
    Each(Each),
    Words(Words),
    Box(Boxed),
}

/// A list made from live data. `library`: an item for each asset, a heading where the kind changes; in the templates,
/// `{name}` is the asset's name and `{kind}` its kind (upper case in a heading). `cover`: an item for each land cover
/// class in the open place, the largest first; `{name}` is the class's name, `{share}` its share of the area and
/// `{colour}` its legend colour (for a box's `bg`). It is made again when another place opens.
#[derive(Deserialize, Clone, Debug)]
pub struct Each {
    pub each: String,
    #[serde(default)]
    pub heading: Option<Box<Spec>>,
    pub item: Box<Spec>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Words {
    pub text: String,
    #[serde(default = "sans")]
    pub font: String,
    #[serde(default = "size")]
    pub size: f32,
    #[serde(default = "forest")]
    pub color: String,
    /// Pushed to the far end of its row.
    #[serde(default)]
    pub end: bool,
    #[serde(default)]
    pub margin_y: f32,
    /// A live value the words show instead: `frame` (the frame time and the hour), `caption` (the Library's asset),
    /// `playhead` (the Studio's time), `play` (Play or Pause), `title` (the shot list's title), `far` (the Library's
    /// toggle: what it shows now), `cover` (the Place's toggle: natural colours or land cover).
    #[serde(default)]
    pub bind: Option<String>,
}
fn sans() -> String {
    "sans".into()
}
fn size() -> f32 {
    16.0
}
fn forest() -> String {
    "forest".into()
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct Boxed {
    /// "row" or "column".
    #[serde(default)]
    pub dir: String,
    #[serde(default)]
    pub grow: f32,
    #[serde(default)]
    pub fill: bool,
    #[serde(default)]
    pub min_h: f32,
    /// Padding: one value, or across and down.
    #[serde(default)]
    pub pad: Vec<f32>,
    #[serde(default)]
    pub gap: f32,
    #[serde(default)]
    pub radius: f32,
    /// A colour of the brand by its token (paper, cream, sand, forest, forest2, clay, sun, glass), or `#rrggbb`.
    #[serde(default)]
    pub bg: Option<String>,
    #[serde(default)]
    pub shadow: bool,
    #[serde(default)]
    pub center: bool,
    /// Children at the start of the cross axis, each its own height.
    #[serde(default)]
    pub start: bool,
    /// What a click does: opens this doc, by id.
    #[serde(default)]
    pub open: Option<String>,
    /// Or: `home`, `play`, `anchors`, `new_shots`, `far_view` (the Library: full mesh or far view), `cover_view` (the
    /// Place: natural colours or land cover).
    #[serde(default)]
    pub act: Option<String>,
    /// Where a layer sits over the world: its distances from the window's edges, in pixels.
    #[serde(default)]
    pub at: Option<At>,
    #[serde(default)]
    pub width: f32,
    #[serde(default)]
    pub height: f32,
    /// Pushed to the far end of its row.
    #[serde(default)]
    pub end: bool,
    /// A live part only code draws: `strip` (the Studio's shots and playhead).
    #[serde(default)]
    pub widget: Option<String>,
    /// Shown only while: `cover` (the Place's terrain wears the land cover classes).
    #[serde(default)]
    pub when: Option<String>,
    #[serde(default)]
    pub children: Vec<Spec>,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct At {
    pub top: Option<f32>,
    pub left: Option<f32>,
    pub right: Option<f32>,
    pub bottom: Option<f32>,
}

/// A view doc: its root node.
#[derive(Deserialize, Clone, Debug)]
pub struct ViewDoc {
    pub node: Spec,
}

/// A box that opens a doc when clicked: the doc's id.
#[derive(Component, Clone)]
pub struct OpenDoc(pub String);

/// The root of a view drawn from a doc.
#[derive(Component)]
pub struct Drawn;

pub fn colour(token: &str) -> Color {
    use crate::ui::*;
    if let Some(hex) = token.strip_prefix('#') {
        return Srgba::hex(hex).map(Color::from).unwrap_or(FOREST);
    }
    match token {
        "paper" => PAPER,
        "cream" => CREAM,
        "sand" => SAND,
        "forest2" => FOREST2,
        "clay" => CLAY,
        "sun" => SUN,
        "glass" => GLASS,
        _ => FOREST,
    }
}

/// The view a doc opens, from its kind.
pub fn opens(id: &str) -> View {
    match crate::db().meta(id).map(|m| m.0).as_deref() {
        Ok("shots") => View::Studio,
        Ok("asset") => View::Library,
        Ok("place") => View::Place,
        _ => View::Meadow,
    }
}

/// Reads a view doc.
pub fn read(id: &str) -> Option<ViewDoc> {
    let text = crate::db().text(id).ok().flatten()?;
    match serde_json::from_str(&text) {
        Ok(v) => Some(v),
        Err(e) => {
            warn!("the view doc {id} does not parse: {e}");
            None
        }
    }
}

/// Draws a view doc under `parent` (or as a root).
pub fn draw(commands: &mut Commands, fonts: &crate::ui::Fonts, spec: &Spec, parent: Option<Entity>) -> Entity {
    let e = match spec {
        Spec::Include { layer } => match read(layer) {
            Some(v) => draw(commands, fonts, &v.node, None),
            None => commands.spawn(Node::default()).id(),
        },
        Spec::Slider { slider, label } => slider_node(commands, fonts, slider, label),
        Spec::Each(each) => {
            let list = commands.spawn(Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(4.0), ..default() }).id();
            if each.each == "cover" {
                // its items come with the place (`cover_list`)
                commands.entity(list).insert(CoverList(each.clone()));
                return finish(commands, list, parent);
            }
            let mut kind = String::new();
            let items = if each.each == "library" { crate::library::shelf() } else { vec![] };
            for (k, a) in items.iter().enumerate() {
                if a.kind != kind {
                    kind = a.kind.clone();
                    if let Some(heading) = &each.heading {
                        let h = fill(heading, &[("{name}", &a.name), ("{kind}", &format!("{}S", kind.to_uppercase()))]);
                        draw(commands, fonts, &h, Some(list));
                    }
                }
                let it = draw(commands, fonts, &fill(&each.item, &[("{name}", &a.name), ("{kind}", &a.kind)]), Some(list));
                commands.entity(it).insert((Hovered::default(), crate::ui::Act::Pick(k), crate::ui::ShelfItem(k)));
            }
            list
        }
        Spec::Words(w) => {
            let font = match w.font.as_str() {
                "serif" => fonts.serif.clone(),
                "mono" => fonts.mono.clone(),
                _ => fonts.sans.clone(),
            };
            let mut node = Node { margin: UiRect::vertical(Val::Px(w.margin_y)), ..default() };
            if w.end {
                node.margin.left = Val::Auto;
            }
            let mut ec = commands.spawn((Text::new(w.text.clone()), TextFont { font: font.into(), font_size: FontSize::Px(w.size), ..default() }, TextColor(colour(&w.color)), node));
            match w.bind.as_deref() {
                Some("frame") => {
                    ec.insert(crate::ui::FrameTime);
                }
                Some("caption") => {
                    ec.insert(crate::workshop::Caption);
                }
                Some("playhead") => {
                    ec.insert(crate::ui::Clock);
                }
                Some("play") => {
                    ec.insert(crate::ui::PlayLabel);
                }
                Some("title") => {
                    ec.insert(crate::ui::Title);
                }
                Some("item") => {
                    ec.insert(crate::ui::ShelfLabel);
                }
                Some("far") => {
                    ec.insert(crate::workshop::FarLabel);
                }
                Some("cover") => {
                    ec.insert(crate::place::CoverLabel);
                }
                _ => {}
            }
            ec.id()
        }
        Spec::Box(b) => {
            let pad = match b.pad[..] {
                [a] => UiRect::all(Val::Px(a)),
                [x, y] => UiRect::axes(Val::Px(x), Val::Px(y)),
                _ => UiRect::ZERO,
            };
            let at = b.at.clone();
            let px = |v: Option<f32>| v.map_or(Val::Auto, Val::Px);
            let size = |v: f32, fill: bool| if fill { Val::Percent(100.0) } else if v > 0.0 { Val::Px(v) } else { Val::Auto };
            let mut node = Node {
                flex_direction: if b.dir == "column" { FlexDirection::Column } else { FlexDirection::Row },
                flex_grow: b.grow,
                flex_basis: if b.grow > 0.0 { Val::Px(0.0) } else { Val::Auto },
                width: size(b.width, b.fill),
                height: size(b.height, b.fill),
                min_height: if b.min_h > 0.0 { Val::Px(b.min_h) } else { Val::Auto },
                padding: pad,
                row_gap: Val::Px(b.gap),
                column_gap: Val::Px(b.gap),
                align_items: if b.center { AlignItems::Center } else if b.start { AlignItems::FlexStart } else { AlignItems::Stretch },
                border_radius: BorderRadius::all(Val::Px(b.radius)),
                ..default()
            };
            if let Some(a) = at {
                node.position_type = PositionType::Absolute;
                (node.top, node.left, node.right, node.bottom) = (px(a.top), px(a.left), px(a.right), px(a.bottom));
            }
            if b.end {
                node.margin.left = Val::Auto;
            }
            let mut ec = commands.spawn((node, BackgroundColor(b.bg.as_deref().map(colour).unwrap_or(Color::NONE))));
            if b.shadow {
                ec.insert(BoxShadow::new(Color::srgba(0.09, 0.21, 0.33, 0.10), Val::Px(0.0), Val::Px(10.0), Val::Px(0.0), Val::Px(28.0)));
            }
            if let Some(id) = &b.open {
                ec.insert((Hovered::default(), crate::ui::Act::Open(opens(id)), OpenDoc(id.clone())));
            }
            let act = match b.act.as_deref() {
                Some("home") => Some(crate::ui::Act::Home),
                Some("play") => Some(crate::ui::Act::PlayPause),
                Some("anchors") => Some(crate::ui::Act::Anchors),
                Some("new_shots") => Some(crate::ui::Act::NewShots),
                Some("far_view") => Some(crate::ui::Act::FarView),
                Some("cover_view") => Some(crate::ui::Act::CoverView),
                _ => None,
            };
            if let Some(a) = act {
                ec.insert((Hovered::default(), a));
            }
            if b.widget.as_deref() == Some("strip") {
                ec.insert(crate::ui::Strip);
            }
            if b.when.as_deref() == Some("cover") {
                // hidden until the view is on; `place::cover_look` keeps it in step
                ec.insert((crate::place::CoverOnly, Visibility::Hidden));
            }
            let e = ec.id();
            for c in &b.children {
                draw(commands, fonts, c, Some(e));
            }
            e
        }
    };
    finish(commands, e, parent)
}

/// A drawn node hung under its parent, if it has one.
fn finish(commands: &mut Commands, e: Entity, parent: Option<Entity>) -> Entity {
    if let Some(p) = parent {
        commands.entity(p).add_child(e);
    }
    e
}

/// A template filled: each `(key, value)` in its words and in a box's colour.
fn fill(spec: &Spec, with: &[(&str, &str)]) -> Spec {
    let put = |t: &str| with.iter().fold(t.to_string(), |t, (k, v)| t.replace(k, v));
    match spec {
        Spec::Words(w) => Spec::Words(Words { text: put(&w.text), ..w.clone() }),
        Spec::Box(b) => Spec::Box(Boxed { bg: b.bg.as_deref().map(put), children: b.children.iter().map(|c| fill(c, with)).collect(), ..b.clone() }),
        other => other.clone(),
    }
}

/// A list of the open place's land cover classes (`"each": "cover"`): its templates.
#[derive(Component)]
pub struct CoverList(Each);

/// Fills each land cover list with the open place's classes when it is drawn and whenever another place opens.
fn cover_list(mut commands: Commands, fonts: Res<crate::ui::Fonts>, ground: Option<Res<crate::place::Ground>>, lists: Query<(Entity, Ref<CoverList>)>) {
    let changed = ground.as_ref().is_some_and(|g| g.is_changed());
    for (e, list) in &lists {
        if !changed && !list.is_added() {
            continue;
        }
        commands.entity(e).despawn_children();
        let Some(ground) = &ground else { continue };
        for (class, share) in crate::place::shares(&ground.cover) {
            let [r, g, b] = class.legend;
            let share = match share {
                s if s < 0.05 => "<0.1 %".to_string(),
                s if s < 9.95 => format!("{s:.1} %"),
                s => format!("{s:.0} %"),
            };
            let item = fill(&list.0.item, &[("{name}", class.name), ("{share}", &share), ("{colour}", &format!("#{r:02x}{g:02x}{b:02x}"))]);
            draw(&mut commands, &fonts, &item, Some(e));
        }
    }
}

/// A slider of the clock (`hour` or `wind`): its label, the bar, the value.
fn slider_node(commands: &mut Commands, fonts: &crate::ui::Fonts, what: &str, label: &str) -> Entity {
    use crate::ui::{Fill, Readout, Slide};
    let s = if what == "wind" { Slide::Wind } else { Slide::Hour };
    let words = |t: &str| (Text::new(t), TextFont { font: fonts.mono.clone().into(), font_size: FontSize::Px(12.0), ..default() }, TextColor(colour("forest")));
    let chip = Node { height: Val::Px(28.0), padding: UiRect::horizontal(Val::Px(12.0)), align_items: AlignItems::Center, column_gap: Val::Px(10.0), border_radius: BorderRadius::MAX, ..default() };
    commands
        .spawn((chip, BackgroundColor(colour("glass"))))
        .with_children(|r| {
            r.spawn((words(label), Node { width: Val::Px(32.0), ..default() }));
            r.spawn((s, Node { width: Val::Px(140.0), height: Val::Px(7.0), border_radius: BorderRadius::MAX, overflow: Overflow::clip(), ..default() }, BackgroundColor(colour("sand"))))
                .with_children(|b| {
                    b.spawn((Fill(s), Pickable::IGNORE, Node { width: Val::Percent(50.0), height: Val::Percent(100.0), border_radius: BorderRadius::MAX, ..default() }, BackgroundColor(colour("clay"))));
                });
            r.spawn((Readout(s), words(""), Node { width: Val::Px(40.0), ..default() }));
        })
        .id()
}

/// Lays a view's layers (named, by id, in the root) over its world.
fn layers(view: View) -> impl Fn(Commands, Res<crate::ui::Fonts>, Option<Res<Interactive>>) {
    move |mut commands: Commands, fonts: Res<crate::ui::Fonts>, interactive: Option<Res<Interactive>>| {
        if interactive.is_none() {
            return;
        }
        let l = &crate::root::root().layers;
        let ids = match view {
            View::Meadow => &l.meadow,
            View::Library => &l.library,
            View::Place => &l.place,
            View::Studio => &l.studio,
            View::Home => return,
        };
        for id in ids {
            if let Some(v) = read(id) {
                let e = draw(&mut commands, &fonts, &v.node, None);
                commands.entity(e).insert((DespawnOnExit(view), Drawn));
            }
        }
    }
}

pub fn plugin(app: &mut App) {
    for v in [View::Meadow, View::Library, View::Place, View::Studio] {
        app.add_systems(OnEnter(v), layers(v));
    }
    // the brand's fonts, also where the interface's own plugin is not (a filmed view in the gate)
    app.init_resource::<crate::ui::Fonts>()
        .add_systems(OnEnter(View::Home), home)
        .add_systems(OnEnter(World::Interface), film)
        .add_systems(Update, shot_layers.run_if(in_state(View::Studio)))
        // the live values a layer shows, wherever it is drawn (in the app and in a film)
        .add_systems(Update, (crate::ui::frame_time, crate::ui::slide_show, crate::ui::shelf_marks, crate::ui::strip_follows, crate::ui::playhead, cover_list))
        .add_systems(Update, (pointer, pointed).chain().run_if(in_state(World::Interface)));
}

/// The dashboard: the root's home view.
fn home(mut commands: Commands, fonts: Res<crate::ui::Fonts>) {
    let Some(v) = read(&crate::root::root().home) else { return };
    let e = draw(&mut commands, &fonts, &v.node, None);
    commands.entity(e).insert((DespawnOnExit(View::Home), Drawn));
}

/// Set where people use the app (not in the gate or a still): only then are the views' own layers laid.
#[derive(Resource)]
pub struct Interactive;

/// A layer a shot lays over its world.
#[derive(Component)]
struct ShotLayer;

/// Lays the playing shot's layers over the film, and takes them away when the shot ends.
fn shot_layers(mut commands: Commands, fonts: Res<crate::ui::Fonts>, studio: Res<crate::film::Studio>, old: Query<Entity, With<ShotLayer>>, mut shown: Local<Option<(usize, String)>>) {
    let now = studio.timeline.shot_at(studio.time).map(|(i, _)| (i, studio.timeline.title.clone()));
    if now == *shown {
        return;
    }
    *shown = now.clone();
    for e in &old {
        commands.entity(e).despawn();
    }
    let Some((i, _)) = now else { return };
    for id in &studio.timeline.clips[i].layers {
        if let Some(v) = read(id) {
            let e = draw(&mut commands, &fonts, &v.node, None);
            commands.entity(e).insert((ShotLayer, DespawnOnExit(View::Studio)));
        }
    }
}

// ---- a view filmed: the Studio's shot names a view doc; the view fills the frame and a pointer moves over it ----

/// The pointer the shot moves.
#[derive(Component)]
struct Pointer;

fn film(mut commands: Commands, fonts: Res<crate::ui::Fonts>, studio: Res<crate::film::Studio>) {
    let Some(id) = studio.timeline.shot_at(studio.time).and_then(|(i, _)| studio.timeline.clips[i].world.clone()) else { return };
    let Some(v) = read(&id) else { return };
    // the view fills the frame, behind the Studio's own strip
    let frame = commands
        .spawn((DespawnOnExit(World::Interface), Drawn, Node { position_type: PositionType::Absolute, width: Val::Percent(100.0), height: Val::Percent(100.0), ..default() }, ZIndex(-1)))
        .id();
    draw(&mut commands, &fonts, &v.node, Some(frame));
    commands.spawn((
        DespawnOnExit(World::Interface),
        Pointer,
        Node { position_type: PositionType::Absolute, width: Val::Px(22.0), height: Val::Px(22.0), border_radius: BorderRadius::MAX, border: UiRect::all(Val::Px(3.0)), ..default() },
        BorderColor::all(colour("cream")),
        BackgroundColor(colour("forest")),
        GlobalZIndex(10),
    ));
}

/// The pointer at the shot's time: its path through the shot's pointer keys (shares of the window), and a press
/// where the shot clicks.
fn pointer(studio: Res<crate::film::Studio>, windows: Query<&Window>, mut p: Query<(&mut Node, &mut UiTransform), With<Pointer>>) {
    let (Some((i, q)), Ok(w)) = (studio.timeline.shot_at(studio.time), windows.single()) else { return };
    let shot = &studio.timeline.clips[i];
    let Some(at) = shot.pointer_at(q) else { return };
    let pressed = shot.clicks.iter().any(|c| (q - c).abs() < 0.02);
    for (mut n, mut t) in &mut p {
        n.left = Val::Px(at.x * w.width() - 11.0);
        n.top = Val::Px(at.y * w.height() - 11.0);
        t.scale = Vec2::splat(if pressed { 0.7 } else { 1.0 });
    }
}

/// A box the pointer is over rises, as under the mouse.
fn pointed(p: Query<&UiGlobalTransform, With<Pointer>>, mut boxes: Query<(&ComputedNode, &UiGlobalTransform, &mut Node), (With<OpenDoc>, Without<Pointer>)>) {
    let Ok(pt) = p.single() else { return };
    let at = pt.translation;
    for (c, t, mut n) in &mut boxes {
        let half = c.size / 2.0;
        let inside = (at - t.translation).abs().cmplt(half).all();
        n.top = if inside { Val::Px(-2.0) } else { Val::Px(0.0) };
    }
}
