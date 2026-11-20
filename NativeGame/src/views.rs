//! The interface as docs (intent 0049): a view is a doc in avenDB, a tree of boxes and words in the brand's look, and
//! this is what draws it. What a box does when it is clicked is data too: it opens a doc, by id (a biome opens the
//! Meadow, a shot list the Studio with it, an asset the Library on it, a place the place). The dashboard is the first
//! view made this way; a view can also be filmed, as a world (`World::Interface`), with a pointer the shot moves.

use crate::View;
use crate::contract::World;
use bevy::prelude::*;
use bevy::picking::hover::Hovered;
use serde::Deserialize;

/// A node of a view: a box (with its children) or words.
#[derive(Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum Spec {
    Words(Words),
    Box(Boxed),
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
    /// A colour of the brand by its token (paper, cream, sand, forest, forest2, clay, sun, glass).
    #[serde(default)]
    pub bg: Option<String>,
    #[serde(default)]
    pub shadow: bool,
    #[serde(default)]
    pub center: bool,
    /// What a click does: opens this doc, by id.
    #[serde(default)]
    pub open: Option<String>,
    #[serde(default)]
    pub children: Vec<Spec>,
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
            commands
                .spawn((Text::new(w.text.clone()), TextFont { font: font.into(), font_size: FontSize::Px(w.size), ..default() }, TextColor(colour(&w.color)), node))
                .id()
        }
        Spec::Box(b) => {
            let pad = match b.pad[..] {
                [a] => UiRect::all(Val::Px(a)),
                [x, y] => UiRect::axes(Val::Px(x), Val::Px(y)),
                _ => UiRect::ZERO,
            };
            let node = Node {
                flex_direction: if b.dir == "column" { FlexDirection::Column } else { FlexDirection::Row },
                flex_grow: b.grow,
                flex_basis: if b.grow > 0.0 { Val::Px(0.0) } else { Val::Auto },
                width: if b.fill { Val::Percent(100.0) } else { Val::Auto },
                height: if b.fill { Val::Percent(100.0) } else { Val::Auto },
                min_height: if b.min_h > 0.0 { Val::Px(b.min_h) } else { Val::Auto },
                padding: pad,
                row_gap: Val::Px(b.gap),
                column_gap: Val::Px(b.gap),
                align_items: if b.center { AlignItems::Center } else { AlignItems::Stretch },
                border_radius: BorderRadius::all(Val::Px(b.radius)),
                ..default()
            };
            let mut ec = commands.spawn((node, BackgroundColor(b.bg.as_deref().map(colour).unwrap_or(Color::NONE))));
            if b.shadow {
                ec.insert(BoxShadow::new(Color::srgba(0.09, 0.21, 0.33, 0.10), Val::Px(0.0), Val::Px(10.0), Val::Px(0.0), Val::Px(28.0)));
            }
            if let Some(id) = &b.open {
                ec.insert((Hovered::default(), crate::ui::Act::Open(opens(id)), OpenDoc(id.clone())));
            }
            let e = ec.id();
            for c in &b.children {
                draw(commands, fonts, c, Some(e));
            }
            e
        }
    };
    if let Some(p) = parent {
        commands.entity(p).add_child(e);
    }
    e
}

pub fn plugin(app: &mut App) {
    // the brand's fonts, also where the interface's own plugin is not (a filmed view in the gate)
    app.init_resource::<crate::ui::Fonts>()
        .add_systems(OnEnter(View::Home), home)
        .add_systems(OnEnter(World::Interface), film)
        .add_systems(Update, (pointer, pointed).chain().run_if(in_state(World::Interface)));
}

/// The dashboard: the root's home view.
fn home(mut commands: Commands, fonts: Res<crate::ui::Fonts>) {
    let Some(v) = read(&crate::root::root().home) else { return };
    let e = draw(&mut commands, &fonts, &v.node, None);
    commands.entity(e).insert((DespawnOnExit(View::Home), Drawn));
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
