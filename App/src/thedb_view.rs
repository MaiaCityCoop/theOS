//! theDB's view: the store's docs and blobs, read only, in the brand's look. A branch select (what the view shows, not
//! what theOS runs), the doc kinds and the blobs on the left; a table of the chosen kind's docs, or the blobs as a
//! library of tiles, in the middle; the chosen doc (its content, its history, a diff against the version before, what
//! it names and what names it) or blob (its preview, its facts, who names it and what they call it) on the right.
//!
//! The view is drawn by this code, not by layer docs, so it still works when docs are broken. The store is read once
//! when the view opens, on the Refresh button or F5, and when another branch is chosen, in the background
//! (`thedb::inventory`); the blobs' facts follow one by one, each read once per hash. Nothing here writes.

use crate::View;
use crate::ui::{Act, CLAY, CREAM, FOREST, FOREST2, Fonts, PAPER, SAND, SUN};
use bevy::input::ButtonState;
use bevy::input::keyboard::{Key, KeyboardInput};
use bevy::input::mouse::{MouseScrollUnit, MouseWheel};
use bevy::picking::events::PointerClick;
use bevy::picking::hover::{HoverMap, Hovered};
use bevy::prelude::*;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use thedb::Hash;
use thedb::inventory::{self, BlobRow, Facts, Inventory, Names, Version};

/// A lighter sand for rows and tiles under the pointer or chosen.
const PICKED: Color = Color::srgb(0.957, 0.886, 0.722);
/// How many rows, tiles and lines one pane draws at most (the filter narrows the rest).
const MAX_ROWS: usize = 400;
const MAX_LINES: usize = 400;

/// What the middle shows: a kind's docs, or the blobs.
#[derive(Clone, PartialEq, Debug)]
pub enum Pick {
    Kind(String),
    Blobs,
}

/// A column to sort by.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Col {
    Name,
    Id,
    Head,
    Versions,
    Size,
    Last,
}

/// What a click in the view does.
#[derive(Component, Clone, PartialEq, Debug)]
pub enum DbAct {
    Kind(String),
    Blobs,
    Sort(Col),
    Doc(String),
    /// A doc named elsewhere: shown with its kind.
    Goto(String),
    Version(usize),
    Blob(Hash),
    Select,
    Branch(Option<String>),
    Refresh,
    Grid(bool),
}

/// The view's state.
#[derive(Resource)]
pub struct Db {
    pub inv: Option<Inventory>,
    /// Set while the store is read: the view says "reading…" and the self-test waits.
    pub reading: bool,
    job: Option<Mutex<mpsc::Receiver<(Result<Inventory, String>, f32)>>>,
    took: f32,
    error: Option<String>,
    seen: Option<String>,
    pick: Pick,
    sort: (Col, bool),
    filter: String,
    doc: Option<String>,
    version: Option<usize>,
    blob: Option<Hash>,
    menu: bool,
    grid: bool,
    facts: HashMap<Hash, Option<Facts>>,
    facts_job: Option<(Mutex<mpsc::Receiver<(Hash, Option<Facts>, Names)>>, Arc<AtomicBool>)>,
    detail: Option<Detail>,
    dirty: Dirty,
}

impl Default for Db {
    fn default() -> Self {
        Db {
            inv: None,
            reading: false,
            job: None,
            took: 0.0,
            error: None,
            // the branch theOS runs on, to start with
            seen: crate::db().branch().map(str::to_string),
            pick: Pick::Kind("root".into()),
            sort: (Col::Name, true),
            filter: String::new(),
            doc: None,
            version: None,
            blob: None,
            menu: false,
            grid: true,
            facts: HashMap::new(),
            facts_job: None,
            detail: None,
            dirty: Dirty::all(),
        }
    }
}

/// Which panes to draw again.
#[derive(Clone, Copy, Default)]
struct Dirty {
    left: bool,
    mid: bool,
    right: bool,
    head: bool,
}

impl Dirty {
    fn all() -> Self {
        Dirty { left: true, mid: true, right: true, head: true }
    }
}

/// A chosen doc, read when it is chosen: its versions, the content of each version shown, their sizes.
struct Detail {
    id: String,
    versions: Vec<Version>,
    /// Each version's content size (the latest versions only, `SIZED`).
    sizes: Vec<Option<usize>>,
    /// The content at the chosen version, and at the one before.
    now: String,
    before: Option<String>,
}

/// How many of a doc's latest versions have their size read when it is chosen.
const SIZED: usize = 60;

// ---- the panes: persistent nodes whose children are drawn again when they change ----

#[derive(Component)]
struct Head;
#[derive(Component)]
struct Left;
#[derive(Component)]
struct MidHead;
#[derive(Component)]
struct MidList;
#[derive(Component)]
struct Right;
#[derive(Component)]
struct Menu;

/// A row or tile's own colour, for the hover.
#[derive(Component)]
struct Base(Color);

pub fn plugin(app: &mut App) {
    app.init_resource::<Db>()
        .add_systems(OnEnter(View::TheDB), (layout, refresh_on_enter))
        .add_systems(OnExit(View::TheDB), stop_facts)
        .add_systems(Update, (poll, keys, hover, wheel, draw, facts_shown, thumbs).chain().run_if(in_state(View::TheDB)))
        .add_observer(click)
        .add_observer(on_scroll);
}

fn refresh_on_enter(mut db: ResMut<Db>) {
    start(&mut db);
}

/// Reads the store in the background, as the branch chosen sees it.
fn start(db: &mut Db) {
    if let Some((_, stop)) = &db.facts_job {
        stop.store(true, Ordering::Relaxed);
    }
    db.facts_job = None;
    let (tx, rx) = mpsc::channel();
    let seen = db.seen.clone();
    std::thread::spawn(move || {
        let t = std::time::Instant::now();
        let r = Inventory::read(&crate::db(), seen.as_deref());
        let _ = tx.send((r, t.elapsed().as_secs_f32()));
    });
    db.job = Some(Mutex::new(rx));
    db.reading = true;
    db.menu = false;
    db.dirty = Dirty::all();
}

fn stop_facts(mut db: ResMut<Db>) {
    if let Some((_, stop)) = &db.facts_job {
        stop.store(true, Ordering::Relaxed);
    }
    db.facts_job = None;
}

/// Reads every blob's facts in the background, one at a time, each once; a blob whose text is JSON brings the blobs it
/// names (a build's binary and source).
fn start_facts(db: &mut Db) {
    let Some(inv) = &db.inv else { return };
    // in the library's order (the worker takes from the end)
    let mut todo: Vec<Hash> = inv.blobs.iter().filter(|b| !db.facts.contains_key(&b.hash)).map(|b| (rank(inv, b, None), b.hash)).collect::<std::collections::BTreeSet<_>>().into_iter().rev().map(|(_, h)| h).collect();
    let (tx, rx) = mpsc::channel();
    let stop = Arc::new(AtomicBool::new(false));
    let halt = stop.clone();
    std::thread::spawn(move || {
        let store = crate::db();
        let mut done: HashSet<Hash> = HashSet::new();
        while let Some(h) = todo.pop() {
            if halt.load(Ordering::Relaxed) {
                return;
            }
            if !done.insert(h) {
                continue;
            }
            let Ok((facts, names)) = inventory::blob_facts(&store, h) else { continue };
            todo.extend(names.blobs.iter().map(|(h, _)| *h));
            if tx.send((h, facts, names)).is_err() {
                return;
            }
        }
    });
    db.facts_job = Some((Mutex::new(rx), stop));
}

/// Takes in what the background has read.
fn poll(mut db: ResMut<Db>) {
    let got = db.job.as_ref().and_then(|j| j.lock().ok().and_then(|r| r.try_recv().ok()));
    if let Some((r, took)) = got {
        db.job = None;
        db.reading = false;
        db.took = took;
        match r {
            Ok(inv) => {
                info!("theDB view: {} docs and {} blobs read in {took:.2} s", inv.docs.len(), inv.blobs.len());
                // the kind shown stays if the branch has it
                if let Pick::Kind(k) = &db.pick
                    && !inv.docs.iter().any(|d| &d.kind == k)
                {
                    db.pick = Pick::Kind(inv.docs.first().map(|d| d.kind.clone()).unwrap_or_default());
                }
                db.inv = Some(inv);
                db.error = None;
                let still = db.doc.clone();
                db.detail = None;
                if let Some(id) = still {
                    choose_doc(&mut db, &id, None);
                }
                start_facts(&mut db);
            }
            Err(e) => {
                warn!("theDB view: the store could not be read: {e}");
                db.error = Some(e);
            }
        }
        db.dirty = Dirty::all();
    }
    // the facts, as they come
    let mut came = Vec::new();
    if let Some((rx, _)) = &db.facts_job
        && let Ok(r) = rx.lock()
    {
        while let Ok(x) = r.try_recv() {
            came.push(x);
        }
    }
    for (h, facts, names) in came {
        db.facts.insert(h, facts);
        if let Some(inv) = &mut db.inv {
            for (child, at) in names.blobs {
                let by = (format!("blob:{}", h.to_hex()), at);
                match inv.blobs.iter_mut().find(|b| b.hash == child) {
                    Some(b) => {
                        if !b.named_by.contains(&by) {
                            b.named_by.push(by);
                        }
                    }
                    None => inv.blobs.push(BlobRow { hash: child, named_by: vec![by], elsewhere: Vec::new() }),
                }
            }
        }
        if db.blob == Some(h) && db.pick == Pick::Blobs {
            db.dirty.right = true;
        }
    }
}

/// Typing filters the middle; Backspace takes a letter away; F5 reads the store again.
fn keys(mut input: MessageReader<KeyboardInput>, buttons: Res<ButtonInput<KeyCode>>, mut db: ResMut<Db>) {
    let held = buttons.any_pressed([KeyCode::SuperLeft, KeyCode::SuperRight, KeyCode::ControlLeft, KeyCode::ControlRight]);
    for k in input.read() {
        if k.state != ButtonState::Pressed {
            continue;
        }
        match &k.logical_key {
            Key::F5 => start(&mut db),
            Key::Backspace => {
                if db.filter.pop().is_some() {
                    db.dirty.mid = true;
                }
            }
            Key::Character(c) if !held => {
                db.filter.push_str(c);
                db.dirty.mid = true;
            }
            Key::Space if !held => {
                db.filter.push(' ');
                db.dirty.mid = true;
            }
            _ => {}
        }
    }
}

/// What a click does.
fn click(mut ev: On<PointerClick>, acts: Query<&DbAct>, mut db: ResMut<Db>, state: Res<State<View>>) {
    if *state.get() != View::TheDB {
        return;
    }
    let Ok(act) = acts.get(ev.entity) else { return };
    ev.propagate(false);
    let act = act.clone();
    let db = &mut *db;
    match act {
        DbAct::Kind(k) => {
            db.pick = Pick::Kind(k);
            db.filter.clear();
            db.dirty = Dirty::all();
        }
        DbAct::Blobs => {
            db.pick = Pick::Blobs;
            db.filter.clear();
            db.dirty = Dirty::all();
        }
        DbAct::Sort(c) => {
            db.sort = if db.sort.0 == c { (c, !db.sort.1) } else { (c, true) };
            db.dirty.mid = true;
        }
        DbAct::Doc(id) => {
            choose_doc(db, &id, None);
            db.dirty.mid = true;
            db.dirty.right = true;
        }
        DbAct::Goto(id) => {
            let kind = db.inv.as_ref().and_then(|i| i.docs.iter().find(|d| d.id == id)).map(|d| d.kind.clone());
            if let Some(k) = kind {
                db.pick = Pick::Kind(k);
                db.filter.clear();
                choose_doc(db, &id, None);
                db.dirty = Dirty::all();
            }
        }
        DbAct::Version(i) => {
            if let Some(id) = db.doc.clone() {
                choose_doc(db, &id, Some(i));
                db.dirty.right = true;
            }
        }
        DbAct::Blob(h) => {
            if db.pick != Pick::Blobs {
                db.pick = Pick::Blobs;
                db.filter.clear();
                db.dirty = Dirty::all();
            }
            db.blob = Some(h);
            if !db.facts.contains_key(&h)
                && let Ok((facts, _)) = inventory::blob_facts(&crate::db(), h)
            {
                db.facts.insert(h, facts);
            }
            db.dirty.mid = true;
            db.dirty.right = true;
        }
        DbAct::Select => {
            db.menu = !db.menu;
            db.dirty.left = true;
        }
        DbAct::Branch(b) => {
            db.menu = false;
            if b != db.seen {
                db.seen = b;
                start(db);
            }
            db.dirty.left = true;
        }
        DbAct::Refresh => start(db),
        DbAct::Grid(g) => {
            db.grid = g;
            db.dirty.mid = true;
        }
    }
}

/// Chooses doc `id`, at version `at` (its latest by default): opens it once and reads what the right pane shows.
fn choose_doc(db: &mut Db, id: &str, at: Option<usize>) {
    db.doc = Some(id.to_string());
    let Some(row) = db.inv.as_ref().and_then(|i| i.docs.iter().find(|d| d.id == id)) else { return };
    let store = crate::db();
    let Ok(doc) = store.doc_at(row.head) else { return };
    let same = db.detail.as_ref().is_some_and(|d| d.id == id);
    let kept = if same { db.detail.take() } else { None };
    let versions = match &kept {
        Some(d) => d.versions.clone(),
        None => inventory::versions(&doc),
    };
    let n = versions.len();
    let sizes = if let Some(d) = kept {
        d.sizes
    } else {
        versions.iter().enumerate().map(|(i, v)| (i + SIZED >= n).then(|| inventory::content_at(&doc, v).map(|t| t.len()).ok()).flatten()).collect()
    };
    let i = at.unwrap_or(n.saturating_sub(1)).min(n.saturating_sub(1));
    let now = versions.get(i).and_then(|v| inventory::content_at(&doc, v).ok()).unwrap_or_else(|| inventory::content(&doc));
    let before = (i > 0).then(|| inventory::content_at(&doc, &versions[i - 1]).ok()).flatten();
    db.version = Some(i);
    db.detail = Some(Detail { id: id.to_string(), versions, sizes, now: pretty(&now), before: before.map(|b| pretty(&b)) });
}

/// JSON pretty-printed; anything else as it is.
fn pretty(text: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(v @ (serde_json::Value::Object(_) | serde_json::Value::Array(_))) => serde_json::to_string_pretty(&v).unwrap_or_else(|_| text.into()),
        _ => text.to_string(),
    }
}

// ---- scrolling, as Bevy's scroll example does: the wheel moves what is under the pointer ----

#[derive(EntityEvent, Debug)]
#[entity_event(propagate, auto_propagate)]
struct Scroll {
    entity: Entity,
    delta: Vec2,
}

fn wheel(mut wheel: MessageReader<MouseWheel>, hover: Res<HoverMap>, mut commands: Commands) {
    for w in wheel.read() {
        let mut delta = -Vec2::new(w.x, w.y);
        if w.unit == MouseScrollUnit::Line {
            delta *= 21.0;
        }
        for pointer in hover.values() {
            for entity in pointer.keys().copied() {
                commands.trigger(Scroll { entity, delta });
            }
        }
    }
}

fn on_scroll(mut s: On<Scroll>, mut q: Query<(&mut ScrollPosition, &Node, &ComputedNode)>) {
    let Ok((mut at, node, c)) = q.get_mut(s.entity) else { return };
    let max = (c.content_size() - c.size()) * c.inverse_scale_factor();
    if node.overflow.y == OverflowAxis::Scroll && s.delta.y != 0.0 {
        let end = if s.delta.y > 0.0 { at.y >= max.y } else { at.y <= 0.0 };
        if !end {
            at.y = (at.y + s.delta.y).clamp(0.0, max.y.max(0.0));
            s.delta.y = 0.0;
        }
    }
    if s.delta == Vec2::ZERO {
        s.propagate(false);
    }
}

/// Rows and tiles rise to a lighter sand under the pointer.
fn hover(mut q: Query<(&Hovered, &Base, &mut BackgroundColor), Changed<Hovered>>) {
    for (h, base, mut bg) in &mut q {
        bg.0 = if h.get() { PICKED } else { base.0 };
    }
}

// ---- drawing ----

fn words(fonts: &Fonts, font: &str, size: f32, color: Color, text: impl Into<String>) -> impl Bundle {
    let font = match font {
        "serif" => fonts.serif.clone(),
        "mono" => fonts.mono.clone(),
        _ => fonts.sans.clone(),
    };
    (Text::new(text), TextFont { font: font.into(), font_size: FontSize::Px(size), ..default() }, TextColor(color), Pickable::IGNORE)
}

/// Words that never wrap, clipped to their cell.
fn cell(fonts: &Fonts, font: &str, size: f32, color: Color, text: impl Into<String>, width: Val, grow: f32) -> impl Bundle {
    (
        Node { width, min_width: Val::Px(0.0), flex_grow: grow, flex_shrink: if grow > 0.0 { 1.0 } else { 0.0 }, flex_basis: if grow > 0.0 { Val::Px(0.0) } else { Val::Auto }, overflow: Overflow::clip(), ..default() },
        Pickable::IGNORE,
        children![(words(fonts, font, size, color, text), TextLayout::no_wrap())],
    )
}

fn button(fonts: &Fonts, label: &str, bg: Color, fg: Color) -> impl Bundle {
    (
        Node { padding: UiRect::axes(Val::Px(14.0), Val::Px(8.0)), border_radius: BorderRadius::all(Val::Px(14.0)), align_items: AlignItems::Center, ..default() },
        BackgroundColor(bg),
        Base(bg),
        Hovered::default(),
        children![words(fonts, "sans", 15.0, fg, label.to_string())],
    )
}

fn pane(grow: f32, width: Val) -> Node {
    Node {
        flex_direction: FlexDirection::Column,
        flex_grow: grow,
        flex_basis: if grow > 0.0 { Val::Px(0.0) } else { Val::Auto },
        width,
        min_width: Val::Px(0.0),
        min_height: Val::Px(0.0),
        padding: UiRect::all(Val::Px(18.0)),
        row_gap: Val::Px(10.0),
        border_radius: BorderRadius::all(Val::Px(24.0)),
        overflow: Overflow::clip(),
        ..default()
    }
}

fn scroller() -> impl Bundle {
    (Node { flex_direction: FlexDirection::Column, flex_grow: 1.0, flex_basis: Val::Px(0.0), min_height: Val::Px(0.0), overflow: Overflow::scroll_y(), row_gap: Val::Px(2.0), ..default() }, ScrollPosition::default())
}

/// The view's frame: the header and the three panes; what is in them is drawn by `draw`.
fn layout(mut commands: Commands, mut db: ResMut<Db>) {
    db.dirty = Dirty::all();
    commands
        .spawn((
            DespawnOnExit(View::TheDB),
            Node { width: Val::Percent(100.0), height: Val::Percent(100.0), flex_direction: FlexDirection::Column, padding: UiRect::all(Val::Px(24.0)), row_gap: Val::Px(16.0), ..default() },
            BackgroundColor(PAPER),
        ))
        .with_children(|root| {
            root.spawn((
                Head,
                Node { flex_direction: FlexDirection::Row, align_items: AlignItems::Center, column_gap: Val::Px(16.0), padding: UiRect::axes(Val::Px(24.0), Val::Px(12.0)), border_radius: BorderRadius::all(Val::Px(24.0)), ..default() },
                BackgroundColor(CREAM),
            ));
            root.spawn(Node { flex_direction: FlexDirection::Row, flex_grow: 1.0, flex_basis: Val::Px(0.0), min_height: Val::Px(0.0), column_gap: Val::Px(16.0), ..default() }).with_children(|body| {
                body.spawn((Left, pane(0.0, Val::Px(250.0)), BackgroundColor(CREAM)));
                body.spawn((pane(3.0, Val::Auto), BackgroundColor(CREAM))).with_children(|mid| {
                    mid.spawn((MidHead, Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(10.0), ..default() }));
                    mid.spawn((MidList, scroller()));
                });
                body.spawn((pane(2.0, Val::Auto), BackgroundColor(CREAM))).with_children(|right| {
                    right.spawn((Right, scroller()));
                });
            });
        });
}

#[allow(clippy::too_many_arguments)]
fn draw(
    mut commands: Commands,
    fonts: Res<Fonts>,
    mut db: ResMut<Db>,
    head: Query<Entity, With<Head>>,
    left: Query<Entity, With<Left>>,
    mid_head: Query<Entity, With<MidHead>>,
    mut mid: Query<(Entity, &mut ScrollPosition), (With<MidList>, Without<Right>)>,
    mut right: Query<(Entity, &mut ScrollPosition), (With<Right>, Without<MidList>)>,
    mut picked: Local<(Option<Pick>, Option<String>, Option<Hash>)>,
) {
    let d = db.dirty;
    if !(d.head || d.left || d.mid || d.right) {
        return;
    }
    let (Ok(h), Ok(l), Ok(mh), Ok((m, mut mscroll)), Ok((r, mut rscroll))) = (head.single(), left.single(), mid_head.single(), mid.single_mut(), right.single_mut()) else { return };
    db.dirty = Dirty::default();
    // a new kind starts its list at the top; a new doc or blob its pane
    if picked.0.as_ref() != Some(&db.pick) {
        mscroll.0 = Vec2::ZERO;
    }
    if picked.1 != db.doc || picked.2 != db.blob {
        rscroll.0 = Vec2::ZERO;
    }
    *picked = (Some(db.pick.clone()), db.doc.clone(), db.blob);
    let f = &*fonts;
    if d.head {
        commands.entity(h).despawn_children();
        commands.entity(h).with_children(|p| draw_head(p, f, &db));
    }
    if d.left {
        commands.entity(l).despawn_children();
        commands.entity(l).with_children(|p| draw_left(p, f, &db));
    }
    if d.mid {
        commands.entity(mh).despawn_children();
        commands.entity(m).despawn_children();
        commands.entity(mh).with_children(|p| draw_mid_head(p, f, &db));
        commands.entity(m).with_children(|p| draw_mid(p, f, &db));
    }
    if d.right {
        commands.entity(r).despawn_children();
        commands.entity(r).with_children(|p| draw_right(p, f, &db));
    }
}

fn short(h: &Hash) -> String {
    h.to_hex()[..10].to_string()
}

fn bytes(n: u64) -> String {
    match n {
        n if n >= 1 << 30 => format!("{:.1} GB", n as f64 / (1u64 << 30) as f64),
        n if n >= 1 << 20 => format!("{:.1} MB", n as f64 / (1u64 << 20) as f64),
        n if n >= 1 << 10 => format!("{:.1} KB", n as f64 / 1024.0),
        n => format!("{n} B"),
    }
}

/// A time Loro recorded (seconds since 1970, UTC), or a dash where none was.
fn when(t: i64) -> String {
    if t <= 0 {
        return "—".into();
    }
    let (days, secs) = (t.div_euclid(86_400), t.rem_euclid(86_400));
    // the civil date from the days since 1970 (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y}-{m:02}-{d:02} {:02}:{:02}", secs / 3600, secs % 3600 / 60)
}

/// The kinds in the order people look for them, the rest by name.
fn kind_order(k: &str) -> (usize, String) {
    const FIRST: [&str; 12] = ["root", "engine", "kernel", "world", "shots", "view", "layer", "shader", "font", "tree", "source", "proposal"];
    (FIRST.iter().position(|x| *x == k).unwrap_or(FIRST.len()), k.to_string())
}

fn draw_head(p: &mut ChildSpawnerCommands, f: &Fonts, db: &Db) {
    p.spawn(words(f, "serif", 34.0, FOREST, "theDB"));
    p.spawn(words(f, "sans", 16.0, FOREST2, "docs and blobs · read only"));
    p.spawn(Node { flex_grow: 1.0, ..default() });
    p.spawn((words(f, "mono", 13.0, FOREST2, status(db)), Status));
    p.spawn((button(f, "Refresh", SAND, FOREST), DbAct::Refresh));
    p.spawn((button(f, "Home", FOREST, CREAM), Act::Home));
}

/// The header's status: reading, or what was read and how many blobs' facts are known.
#[derive(Component)]
struct Status;

fn status(db: &Db) -> String {
    match (&db.inv, db.reading, &db.error) {
        (_, true, _) => "reading…".to_string(),
        (_, _, Some(e)) => format!("could not read the store: {e}"),
        (Some(inv), ..) => {
            let known = inv.blobs.iter().filter(|b| db.facts.contains_key(&b.hash)).count();
            let facts = if known < inv.blobs.len() { format!(" · facts {known}/{}", inv.blobs.len()) } else { String::new() };
            format!("{} docs · {} blobs · read in {:.1} s{facts}", inv.docs.len(), inv.blobs.len(), db.took)
        }
        _ => String::new(),
    }
}

/// A text or swatch that shows a blob's facts once they are read: updated where it stands, so that the tiles and rows
/// are not drawn again (and a click on one is never lost to a redraw).
#[derive(Component, Clone, Copy)]
enum Fact {
    Word(Hash),
    Line(Hash),
    Media(Hash),
    Size(Hash),
    Swatch(Hash),
}

fn swatch_colour(word: &str) -> Color {
    match word {
        "PNG" | "JPEG" | "GIF" | "TIFF" | "WEBP" => CLAY,
        "DOC" | "JSON" | "TEXT" => FOREST2,
        "FONT" => SUN,
        _ => FOREST,
    }
}

fn tile_line(facts: Option<&Facts>) -> String {
    let Some(x) = facts else { return "reading…".into() };
    let dims = x.dims.map(|(w, h)| format!(" · {w}×{h}")).unwrap_or_default();
    format!("{} · {}{dims}", type_word(x.media).to_lowercase(), bytes(x.size))
}

/// Puts the facts read since the last frame where they show, and the status.
fn facts_shown(
    mut commands: Commands,
    db: Res<Db>,
    mut texts: Query<(&Fact, &mut Text)>,
    mut swatches: Query<(Entity, &Fact, &mut BackgroundColor), Without<Text>>,
    mut status_text: Query<&mut Text, (With<Status>, Without<Fact>)>,
    mut known: Local<(usize, bool)>,
) {
    let now = (db.facts.len(), db.reading);
    if *known == now && !db.is_changed() {
        return;
    }
    *known = now;
    for mut t in &mut status_text {
        let s = status(&db);
        if t.0 != s {
            t.0 = s;
        }
    }
    let get = |h: &Hash| db.facts.get(h);
    for (fact, mut t) in &mut texts {
        let want = match fact {
            Fact::Word(h) => get(h).map(|f| f.as_ref().map(|x| type_word(x.media)).unwrap_or("MISSING").to_string()),
            Fact::Line(h) => get(h).map(|f| f.as_ref().map(|x| tile_line(Some(x))).unwrap_or_else(|| "not in the store".into())),
            Fact::Media(h) => get(h).map(|f| f.as_ref().map(|x| x.media.to_string()).unwrap_or_else(|| "missing".into())),
            Fact::Size(h) => get(h).map(|f| f.as_ref().map(|x| bytes(x.size)).unwrap_or_default()),
            Fact::Swatch(_) => None,
        };
        if let Some(w) = want
            && t.0 != w
        {
            t.0 = w;
        }
    }
    for (e, fact, mut bg) in &mut swatches {
        let Fact::Swatch(h) = fact else { continue };
        let Some(Some(x)) = get(h) else { continue };
        let c = swatch_colour(type_word(x.media));
        if bg.0 != c {
            bg.0 = c;
            // an image shows itself, once its type is known
            if matches!(x.media, "image/png" | "image/jpeg") && x.size < 16 << 20 {
                commands.entity(e).despawn_children();
                commands.entity(e).with_child((ImageNode::new(Handle::default()), Node { width: Val::Percent(100.0), height: Val::Percent(100.0), ..default() }, Pickable::IGNORE, Thumb(*h)));
            }
        }
    }
}

fn label(p: &mut ChildSpawnerCommands, f: &Fonts, text: &str) {
    p.spawn((words(f, "mono", 12.0, CLAY, text.to_string()), Node { margin: UiRect::top(Val::Px(8.0)), ..default() }));
}

fn row_node(gap: f32) -> Node {
    Node { flex_direction: FlexDirection::Row, align_items: AlignItems::Center, column_gap: Val::Px(gap), padding: UiRect::axes(Val::Px(10.0), Val::Px(6.0)), border_radius: BorderRadius::all(Val::Px(10.0)), ..default() }
}

fn draw_left(p: &mut ChildSpawnerCommands, f: &Fonts, db: &Db) {
    label(p, f, "BRANCH");
    let seen = db.seen.clone().unwrap_or_else(|| "main".into());
    // the select: the branch seen, and a list of every branch under it when open
    p.spawn((
        DbAct::Select,
        Hovered::default(),
        Base(PAPER),
        Node { border: UiRect::all(Val::Px(1.5)), ..row_node(8.0) },
        BackgroundColor(PAPER),
        BorderColor::all(SAND),
        children![cell(f, "sans", 15.0, FOREST, seen, Val::Auto, 1.0), words(f, "sans", 14.0, FOREST2, if db.menu { "^" } else { "v" })],
    ));
    p.spawn(words(f, "sans", 12.0, FOREST2, "what this view shows; theOS runs on as it is"));
    if db.menu {
        let branches = db.inv.as_ref().map(|i| i.branches.clone()).unwrap_or_default();
        let own: BTreeMap<String, usize> = db.inv.as_ref().map(|i| i.docs.iter().flat_map(|d| d.own.iter().cloned()).fold(BTreeMap::new(), |mut m, b| {
            *m.entry(b).or_insert(0) += 1;
            m
        })).unwrap_or_default();
        p.spawn((
            Menu,
            Node { position_type: PositionType::Absolute, top: Val::Px(84.0), left: Val::Px(18.0), right: Val::Px(18.0), max_height: Val::Px(560.0), flex_direction: FlexDirection::Column, overflow: Overflow::scroll_y(), padding: UiRect::all(Val::Px(6.0)), border_radius: BorderRadius::all(Val::Px(12.0)), border: UiRect::all(Val::Px(1.5)), ..default() },
            ScrollPosition::default(),
            BackgroundColor(PAPER),
            BorderColor::all(SAND),
            BoxShadow::new(Color::srgba(0.09, 0.21, 0.33, 0.18), Val::Px(0.0), Val::Px(8.0), Val::Px(0.0), Val::Px(20.0)),
            GlobalZIndex(20),
        ))
        .with_children(|m| {
            for b in std::iter::once(None).chain(branches.into_iter().map(Some)) {
                let name = b.clone().unwrap_or_else(|| "main".into());
                let bg = if b == db.seen { PICKED } else { PAPER };
                let n = b.as_ref().and_then(|b| own.get(b)).copied();
                m.spawn((DbAct::Branch(b), Hovered::default(), Base(bg), row_node(8.0), BackgroundColor(bg))).with_children(|r| {
                    r.spawn(cell(f, "sans", 14.0, FOREST, name, Val::Auto, 1.0));
                    if let Some(n) = n {
                        r.spawn(words(f, "mono", 11.0, FOREST2, format!("{n}")));
                    }
                });
            }
        });
    }
    label(p, f, "DOCS");
    let Some(inv) = &db.inv else {
        p.spawn(words(f, "sans", 14.0, FOREST2, if db.reading { "reading…" } else { "" }));
        return;
    };
    let mut kinds: BTreeMap<(usize, String), usize> = BTreeMap::new();
    for d in &inv.docs {
        *kinds.entry(kind_order(&d.kind)).or_insert(0) += 1;
    }
    p.spawn((Node { flex_direction: FlexDirection::Column, flex_grow: 1.0, flex_basis: Val::Px(0.0), min_height: Val::Px(0.0), overflow: Overflow::scroll_y(), row_gap: Val::Px(2.0), ..default() }, ScrollPosition::default()))
        .with_children(|list| {
            for ((_, k), n) in kinds {
                let on = db.pick == Pick::Kind(k.clone());
                let bg = if on { PICKED } else { CREAM };
                list.spawn((DbAct::Kind(k.clone()), Hovered::default(), Base(bg), row_node(8.0), BackgroundColor(bg))).with_children(|r| {
                    r.spawn(cell(f, "sans", 15.0, FOREST, if k.is_empty() { "(no kind)".to_string() } else { k }, Val::Auto, 1.0));
                    r.spawn(words(f, "mono", 12.0, FOREST2, n.to_string()));
                });
            }
        });
    label(p, f, "BLOBS");
    let on = db.pick == Pick::Blobs;
    let bg = if on { PICKED } else { CREAM };
    let unref = inv.blobs.iter().filter(|b| b.unreferenced()).count();
    p.spawn((DbAct::Blobs, Hovered::default(), Base(bg), row_node(8.0), BackgroundColor(bg))).with_children(|r| {
        r.spawn(cell(f, "sans", 15.0, FOREST, "Library", Val::Auto, 1.0));
        r.spawn(words(f, "mono", 12.0, FOREST2, if unref > 0 { format!("{} · {unref} unref.", inv.blobs.len()) } else { inv.blobs.len().to_string() }));
    });
}

/// Where a blob comes in the library: the blobs the branch names first, docs' versions (what proposals name) after the
/// files.
fn rank(inv: &Inventory, b: &BlobRow, facts: Option<&Facts>) -> (bool, bool) {
    let by_proposals = !b.named_by.is_empty() && b.named_by.iter().all(|(id, _)| inv.docs.iter().any(|d| &d.id == id && d.kind == "proposal"));
    (b.unreferenced(), by_proposals || facts.is_some_and(|f| f.media == "application/x-loro-snapshot"))
}

/// The docs of the kind chosen that pass the filter, sorted.
fn doc_rows<'a>(db: &'a Db, kind: &str) -> Vec<&'a thedb::inventory::DocRow> {
    let Some(inv) = &db.inv else { return Vec::new() };
    let q = db.filter.to_lowercase();
    let mut rows: Vec<_> = inv.docs.iter().filter(|d| d.kind == kind).filter(|d| q.is_empty() || d.name.to_lowercase().contains(&q) || d.id.contains(&q) || d.head.to_hex().contains(&q)).collect();
    rows.sort_by(|a, b| {
        let o = match db.sort.0 {
            Col::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            Col::Id => a.id.cmp(&b.id),
            Col::Head => a.head.to_hex().cmp(&b.head.to_hex()),
            Col::Versions => a.versions.cmp(&b.versions),
            Col::Size => a.size.cmp(&b.size),
            Col::Last => a.last.cmp(&b.last),
        };
        if db.sort.1 { o } else { o.reverse() }
    });
    rows
}

/// The name a blob is known by: the first doc that names it, and where.
fn blob_name(inv: &Inventory, b: &BlobRow) -> String {
    let Some((by, at)) = b.named_by.first() else { return format!("on {}", b.elsewhere.join(", ")) };
    if let Some(hex) = by.strip_prefix("blob:") {
        return format!("{at} of blob {}", &hex[..10]);
    }
    let name = inv.docs.iter().find(|d| &d.id == by).map(|d| d.name.clone()).unwrap_or_else(|| by.clone());
    if at.is_empty() { name } else { format!("{name} · {at}") }
}

/// A blob's type, short: what its tile shows big.
fn type_word(media: &str) -> &'static str {
    match media {
        "image/png" => "PNG",
        "image/jpeg" => "JPEG",
        "image/gif" => "GIF",
        "image/tiff" => "TIFF",
        "image/webp" => "WEBP",
        "application/pdf" => "PDF",
        "application/wasm" => "WASM",
        "font/ttf" | "font/otf" | "font/woff" | "font/woff2" => "FONT",
        "application/gzip" | "application/zstd" => "ZIP",
        "application/x-mach-binary" => "EXEC",
        "application/x-loro-snapshot" => "DOC",
        "application/json" => "JSON",
        "text/plain" => "TEXT",
        _ => "BIN",
    }
}

fn blob_rows<'a>(db: &'a Db) -> Vec<&'a BlobRow> {
    let Some(inv) = &db.inv else { return Vec::new() };
    let q = db.filter.to_lowercase();
    let facts = |b: &BlobRow| db.facts.get(&b.hash).cloned().flatten();
    let mut rows: Vec<_> = inv
        .blobs
        .iter()
        .filter(|b| q.is_empty() || b.hash.to_hex().contains(&q) || blob_name(inv, b).to_lowercase().contains(&q) || facts(b).is_some_and(|f| f.media.contains(&q) || type_word(f.media).to_lowercase().contains(&q)))
        .collect();
    let rank = |b: &BlobRow| (db.facts.get(&b.hash).is_some_and(|f| f.is_none()), rank(inv, b, facts(b).as_ref()));
    rows.sort_by(|a, b| {
        let o = match db.sort.0 {
            Col::Size => facts(a).map(|f| f.size).cmp(&facts(b).map(|f| f.size)),
            Col::Head => facts(a).map(|f| f.media).cmp(&facts(b).map(|f| f.media)),
            Col::Id => a.hash.to_hex().cmp(&b.hash.to_hex()),
            _ => blob_name(inv, a).to_lowercase().cmp(&blob_name(inv, b).to_lowercase()),
        };
        rank(a).cmp(&rank(b)).then(if db.sort.1 { o } else { o.reverse() })
    });
    rows
}

fn draw_mid_head(p: &mut ChildSpawnerCommands, f: &Fonts, db: &Db) {
    let (title, cols): (String, Vec<(&str, Col, Val, f32)>) = match &db.pick {
        Pick::Kind(k) => (
            format!("{k} docs"),
            vec![("Name", Col::Name, Val::Auto, 1.0), ("Id", Col::Id, Val::Px(100.0), 0.0), ("Head", Col::Head, Val::Px(100.0), 0.0), ("Versions", Col::Versions, Val::Px(76.0), 0.0), ("Size", Col::Size, Val::Px(76.0), 0.0), ("Last changed", Col::Last, Val::Px(120.0), 0.0)],
        ),
        Pick::Blobs => ("Blobs".into(), vec![("Name", Col::Name, Val::Auto, 1.0), ("Hash", Col::Id, Val::Px(100.0), 0.0), ("Type", Col::Head, Val::Px(150.0), 0.0), ("Size", Col::Size, Val::Px(80.0), 0.0)]),
    };
    p.spawn(Node { flex_direction: FlexDirection::Row, align_items: AlignItems::Center, column_gap: Val::Px(12.0), ..default() }).with_children(|r| {
        r.spawn(words(f, "serif", 26.0, FOREST, title));
        r.spawn(Node { flex_grow: 1.0, ..default() });
        if db.pick == Pick::Blobs {
            r.spawn((button(f, "Tiles", if db.grid { FOREST } else { SAND }, if db.grid { CREAM } else { FOREST }), DbAct::Grid(true)));
            r.spawn((button(f, "List", if db.grid { SAND } else { FOREST }, if db.grid { FOREST } else { CREAM }), DbAct::Grid(false)));
        }
    });
    // the filter: what is typed while the view is open
    let typed = if db.filter.is_empty() { "type to filter…".to_string() } else { format!("{}|", db.filter) };
    p.spawn((
        Node { padding: UiRect::axes(Val::Px(12.0), Val::Px(8.0)), border_radius: BorderRadius::all(Val::Px(12.0)), border: UiRect::all(Val::Px(1.5)), ..default() },
        BackgroundColor(PAPER),
        BorderColor::all(SAND),
        children![words(f, "mono", 14.0, if db.filter.is_empty() { FOREST2 } else { FOREST }, typed)],
    ));
    if db.pick == Pick::Blobs && db.grid {
        return;
    }
    p.spawn(Node { flex_direction: FlexDirection::Row, column_gap: Val::Px(10.0), padding: UiRect::axes(Val::Px(10.0), Val::Px(2.0)), ..default() }).with_children(|r| {
        for (name, col, w, grow) in cols {
            let arrow = if db.sort.0 == col { if db.sort.1 { " ^" } else { " v" } } else { "" };
            r.spawn((
                DbAct::Sort(col),
                Hovered::default(),
                Base(Color::NONE),
                BackgroundColor(Color::NONE),
                Node { width: w, flex_grow: grow, flex_basis: if grow > 0.0 { Val::Px(0.0) } else { Val::Auto }, overflow: Overflow::clip(), ..default() },
                children![(words(f, "mono", 12.0, CLAY, format!("{}{arrow}", name.to_uppercase())), TextLayout::no_wrap())],
            ));
        }
    });
}

fn draw_mid(p: &mut ChildSpawnerCommands, f: &Fonts, db: &Db) {
    let Some(inv) = &db.inv else {
        p.spawn(words(f, "sans", 16.0, FOREST2, if db.reading { "reading…" } else { "" }));
        return;
    };
    match &db.pick {
        Pick::Kind(k) => {
            let rows = doc_rows(db, k);
            for d in rows.iter().take(MAX_ROWS) {
                let bg = if db.doc.as_deref() == Some(&d.id) { PICKED } else { CREAM };
                p.spawn((DbAct::Doc(d.id.clone()), Hovered::default(), Base(bg), row_node(10.0), BackgroundColor(bg))).with_children(|r| {
                    r.spawn(cell(f, "sans", 15.0, FOREST, if d.name.is_empty() { "(no name)".to_string() } else { d.name.clone() }, Val::Auto, 1.0));
                    r.spawn(cell(f, "mono", 12.0, FOREST2, d.id[..10].to_string(), Val::Px(100.0), 0.0));
                    let own = db.seen.as_ref().is_some_and(|b| d.own.contains(b));
                    r.spawn(cell(f, "mono", 12.0, if own { CLAY } else { FOREST2 }, short(&d.head), Val::Px(100.0), 0.0));
                    r.spawn(cell(f, "mono", 12.0, FOREST2, d.versions.to_string(), Val::Px(76.0), 0.0));
                    r.spawn(cell(f, "mono", 12.0, FOREST2, bytes(d.size as u64), Val::Px(76.0), 0.0));
                    r.spawn(cell(f, "mono", 12.0, FOREST2, when(d.last), Val::Px(120.0), 0.0));
                });
            }
            more(p, f, rows.len());
        }
        Pick::Blobs => {
            let rows = blob_rows(db);
            if db.grid {
                p.spawn(Node { width: Val::Percent(100.0), flex_direction: FlexDirection::Row, flex_wrap: FlexWrap::Wrap, column_gap: Val::Px(10.0), row_gap: Val::Px(10.0), ..default() }).with_children(|g| {
                    for b in rows.iter().take(MAX_ROWS) {
                        tile(g, f, db, inv, b);
                    }
                });
            } else {
                for b in rows.iter().take(MAX_ROWS) {
                    let facts = db.facts.get(&b.hash).cloned().flatten();
                    let bg = if db.blob == Some(b.hash) { PICKED } else { CREAM };
                    p.spawn((DbAct::Blob(b.hash), Hovered::default(), Base(bg), row_node(10.0), BackgroundColor(bg))).with_children(|r| {
                        let name = blob_name(inv, b);
                        r.spawn(cell(f, "sans", 14.0, if b.unreferenced() { SUN } else { FOREST }, if b.unreferenced() { format!("unreferenced · {name}") } else { name }, Val::Auto, 1.0));
                        r.spawn(cell(f, "mono", 12.0, FOREST2, short(&b.hash), Val::Px(100.0), 0.0));
                        r.spawn(cell(f, "mono", 12.0, FOREST2, "", Val::Px(150.0), 0.0)).with_child((words(f, "mono", 12.0, FOREST2, facts.as_ref().map(|f| f.media.to_string()).unwrap_or_else(|| "…".into())), TextLayout::no_wrap(), Fact::Media(b.hash)));
                        r.spawn(cell(f, "mono", 12.0, FOREST2, "", Val::Px(80.0), 0.0)).with_child((words(f, "mono", 12.0, FOREST2, facts.as_ref().map(|f| bytes(f.size)).unwrap_or_else(|| "…".into())), TextLayout::no_wrap(), Fact::Size(b.hash)));
                    });
                }
            }
            more(p, f, rows.len());
        }
    }
}

fn more(p: &mut ChildSpawnerCommands, f: &Fonts, n: usize) {
    let text = match n {
        0 => "nothing here".to_string(),
        n if n > MAX_ROWS => format!("the first {MAX_ROWS} of {n}: type to narrow"),
        n => format!("{n} in all"),
    };
    p.spawn((words(f, "mono", 12.0, FOREST2, text), Node { margin: UiRect::all(Val::Px(10.0)), ..default() }));
}

/// A blob as a tile: its type big (or the image itself), its name, its type, size and an image's dimensions.
fn tile(g: &mut ChildSpawnerCommands, f: &Fonts, db: &Db, inv: &Inventory, b: &BlobRow) {
    let facts = db.facts.get(&b.hash).cloned().flatten();
    let bg = if db.blob == Some(b.hash) { PICKED } else { PAPER };
    let media = facts.as_ref().map(|f| f.media).unwrap_or("");
    let word = if facts.is_some() { type_word(media) } else { "…" };
    let image = matches!(media, "image/png" | "image/jpeg") && facts.as_ref().is_some_and(|f| f.size < 16 << 20);
    let h = b.hash;
    g.spawn((
        DbAct::Blob(h),
        Hovered::default(),
        Base(bg),
        BackgroundColor(bg),
        BorderColor::all(if b.unreferenced() { SUN } else { SAND }),
        Node { width: Val::Px(132.0), flex_direction: FlexDirection::Column, padding: UiRect::all(Val::Px(8.0)), row_gap: Val::Px(4.0), border: UiRect::all(Val::Px(2.0)), border_radius: BorderRadius::all(Val::Px(14.0)), ..default() },
    ))
    .with_children(|t| {
        t.spawn((
            Node { height: Val::Px(80.0), align_items: AlignItems::Center, justify_content: JustifyContent::Center, border_radius: BorderRadius::all(Val::Px(10.0)), overflow: Overflow::clip(), ..default() },
            BackgroundColor(if facts.is_some() { swatch_colour(word) } else { SAND }),
            Fact::Swatch(h),
            Pickable::IGNORE,
        ))
        .with_children(|s| {
            if image {
                s.spawn((ImageNode::new(Handle::default()), Node { width: Val::Percent(100.0), height: Val::Percent(100.0), ..default() }, Pickable::IGNORE, Thumb(h)));
            } else {
                s.spawn((words(f, "mono", 22.0, CREAM, word), Fact::Word(h)));
            }
        });
        t.spawn(cell(f, "sans", 13.0, FOREST, blob_name(inv, b), Val::Percent(100.0), 0.0));
        t.spawn((words(f, "mono", 11.0, FOREST2, tile_line(facts.as_ref())), Fact::Line(h)));
        if b.unreferenced() {
            t.spawn(words(f, "mono", 11.0, SUN, "unreferenced"));
        }
    });
}

/// An image tile, loaded by hash when it is drawn (`blob://<hash>.<ext>`).
#[derive(Component)]
pub struct Thumb(Hash);

pub fn thumbs(mut q: Query<(&Thumb, &mut ImageNode), Added<Thumb>>, assets: Res<AssetServer>, db: Res<Db>) {
    for (t, mut img) in &mut q {
        let ext = match db.facts.get(&t.0).cloned().flatten().map(|f| f.media) {
            Some("image/jpeg") => "jpg",
            _ => "png",
        };
        img.image = assets.load(format!("blob://{}.{ext}", t.0.to_hex()));
    }
}

fn section(p: &mut ChildSpawnerCommands, f: &Fonts, text: &str) {
    p.spawn((words(f, "mono", 12.0, CLAY, text.to_uppercase()), Node { margin: UiRect::top(Val::Px(14.0)), ..default() }));
}

fn link(p: &mut ChildSpawnerCommands, f: &Fonts, act: DbAct, main: String, side: String) {
    p.spawn((act, Hovered::default(), Base(CREAM), BackgroundColor(CREAM), row_node(8.0))).with_children(|r| {
        r.spawn(cell(f, "sans", 14.0, FOREST, main, Val::Auto, 1.0));
        r.spawn(words(f, "mono", 11.0, FOREST2, side));
    });
}

/// Lines in the content font, at most `MAX_LINES`.
fn lines(p: &mut ChildSpawnerCommands, f: &Fonts, text: &str) {
    let all: Vec<&str> = text.lines().collect();
    let shown = all.iter().take(MAX_LINES).copied().collect::<Vec<_>>().join("\n");
    p.spawn((
        Node { padding: UiRect::all(Val::Px(12.0)), border_radius: BorderRadius::all(Val::Px(12.0)), ..default() },
        BackgroundColor(PAPER),
        Pickable::IGNORE,
        children![(words(f, "mono", 12.0, FOREST, if shown.is_empty() { "(empty)".to_string() } else { shown }), TextLayout::linebreak(LineBreak::WordOrCharacter))],
    ));
    if all.len() > MAX_LINES {
        p.spawn(words(f, "mono", 11.0, FOREST2, format!("… and {} lines more", all.len() - MAX_LINES)));
    }
}

/// The changed lines with two lines around each, long unchanged runs folded.
fn diff_lines(p: &mut ChildSpawnerCommands, f: &Fonts, before: &str, now: &str) {
    let Some(d) = inventory::diff(before, now, 3000) else {
        p.spawn(words(f, "sans", 13.0, FOREST2, "too long to compare line by line"));
        return;
    };
    let near: Vec<bool> = (0..d.len()).map(|i| d[i.saturating_sub(2)..(i + 3).min(d.len())].iter().any(|(c, _)| *c != ' ')).collect();
    if !d.iter().any(|(c, _)| *c != ' ') {
        p.spawn(words(f, "sans", 13.0, FOREST2, "the same content as the version before (a change elsewhere in the doc: its name, its kind, a part)"));
        return;
    }
    let mut text = p.spawn((
        Node { padding: UiRect::all(Val::Px(12.0)), border_radius: BorderRadius::all(Val::Px(12.0)), ..default() },
        BackgroundColor(PAPER),
        Pickable::IGNORE,
    ));
    let font = f.mono.clone();
    text.with_children(|t| {
        let mut root = t.spawn((Text::default(), TextFont { font: font.clone().into(), font_size: FontSize::Px(12.0), ..default() }, TextLayout::linebreak(LineBreak::WordOrCharacter), Pickable::IGNORE));
        root.with_children(|s| {
            let (mut shown, mut folded) = (0, 0);
            for (i, (c, l)) in d.iter().enumerate() {
                if shown >= MAX_LINES {
                    break;
                }
                if !near[i] {
                    folded += 1;
                    continue;
                }
                if folded > 0 {
                    s.spawn((TextSpan::new(format!("   … {folded} lines the same\n")), TextFont { font: font.clone().into(), font_size: FontSize::Px(12.0), ..default() }, TextColor(FOREST2)));
                    folded = 0;
                }
                let color = match c {
                    '+' => CLAY,
                    '-' => Color::srgb(0.75, 0.30, 0.20),
                    _ => FOREST2,
                };
                s.spawn((TextSpan::new(format!("{c} {l}\n")), TextFont { font: font.clone().into(), font_size: FontSize::Px(12.0), ..default() }, TextColor(color)));
                shown += 1;
            }
            if folded > 0 {
                s.spawn((TextSpan::new(format!("   … {folded} lines the same\n")), TextFont { font: font.clone().into(), font_size: FontSize::Px(12.0), ..default() }, TextColor(FOREST2)));
            }
        });
    });
}

fn draw_right(p: &mut ChildSpawnerCommands, f: &Fonts, db: &Db) {
    let Some(inv) = &db.inv else { return };
    match &db.pick {
        Pick::Kind(_) => {
            let Some(d) = db.doc.as_ref().and_then(|id| inv.docs.iter().find(|d| &d.id == id)) else {
                p.spawn(words(f, "sans", 15.0, FOREST2, "Choose a doc to see its content, its history and what it names."));
                return;
            };
            p.spawn(words(f, "serif", 26.0, FOREST, if d.name.is_empty() { "(no name)".to_string() } else { d.name.clone() }));
            p.spawn(words(f, "mono", 12.0, FOREST2, format!("{} · {}", d.kind, d.id)));
            p.spawn((words(f, "mono", 12.0, FOREST2, format!("head {}", d.head.to_hex())), TextLayout::linebreak(LineBreak::AnyCharacter)));
            if d.main != Some(d.head) {
                p.spawn(words(f, "mono", 12.0, CLAY, match d.main {
                    Some(m) => format!("main has {}", short(&m)),
                    None => "only on this branch".to_string(),
                }));
            }
            p.spawn(words(f, "sans", 13.0, FOREST2, if d.own.is_empty() { "no branch has its own head for it".to_string() } else { format!("own heads on: {}", d.own.join(", ")) }));
            let Some(det) = db.detail.as_ref().filter(|x| x.id == d.id) else { return };
            let at = db.version.unwrap_or(0);
            // the history, newest first
            section(p, f, &format!("history · {} versions", det.versions.len()));
            for (i, v) in det.versions.iter().enumerate().rev().take(MAX_ROWS) {
                let bg = if i == at { PICKED } else { CREAM };
                p.spawn((DbAct::Version(i), Hovered::default(), Base(bg), BackgroundColor(bg), row_node(10.0))).with_children(|r| {
                    r.spawn(cell(f, "mono", 12.0, FOREST, format!("{:>3}  {}", i + 1, v.label()), Val::Auto, 1.0));
                    r.spawn(cell(f, "mono", 12.0, FOREST2, when(v.time), Val::Px(120.0), 0.0));
                    r.spawn(cell(f, "mono", 12.0, FOREST2, det.sizes.get(i).copied().flatten().map(|s| bytes(s as u64)).unwrap_or_else(|| "—".into()), Val::Px(70.0), 0.0));
                });
            }
            let label = det.versions.get(at).map(|v| v.label()).unwrap_or_default();
            if let Some(before) = &det.before {
                section(p, f, &format!("changes in {label}, against the version before"));
                diff_lines(p, f, before, &det.now);
            }
            // a doc whose file is a blob: the blob, not its (empty) text
            let file_blob = d.names.blobs.iter().find(|(_, at)| at == "file.blob").map(|(h, _)| *h);
            section(p, f, &format!("content at {label}"));
            match file_blob {
                Some(h) if det.now.is_empty() => {
                    let facts = db.facts.get(&h).cloned().flatten();
                    link(p, f, DbAct::Blob(h), format!("blob {}", h.to_hex()), facts.map(|x| format!("{} · {}", x.media, bytes(x.size))).unwrap_or_default());
                }
                _ => lines(p, f, &det.now),
            }
            section(p, f, "names");
            if d.names.docs.is_empty() && d.names.blobs.is_empty() {
                p.spawn(words(f, "sans", 13.0, FOREST2, "no doc and no blob"));
            }
            for (id, place) in &d.names.docs {
                let name = inv.docs.iter().find(|x| &x.id == id).map(|x| format!("{} ({})", x.name, x.kind)).unwrap_or_else(|| format!("{id} (not on this branch)"));
                link(p, f, DbAct::Goto(id.clone()), name, place.clone());
            }
            for (h, place) in d.names.blobs.iter().take(MAX_ROWS) {
                link(p, f, DbAct::Blob(*h), format!("blob {}", short(h)), place.clone());
            }
            section(p, f, "named by");
            if d.named_by.is_empty() {
                p.spawn(words(f, "sans", 13.0, FOREST2, "no doc on this branch"));
            }
            for id in &d.named_by {
                let name = inv.docs.iter().find(|x| &x.id == id).map(|x| format!("{} ({})", x.name, x.kind)).unwrap_or_else(|| id.clone());
                link(p, f, DbAct::Goto(id.clone()), name, id[..10].to_string());
            }
        }
        Pick::Blobs => {
            let Some(b) = db.blob.and_then(|h| inv.blobs.iter().find(|b| b.hash == h)) else {
                p.spawn(words(f, "sans", 15.0, FOREST2, "Choose a blob to see it, its facts and who names it."));
                return;
            };
            let facts = db.facts.get(&b.hash).cloned().flatten();
            p.spawn(words(f, "serif", 24.0, FOREST, blob_name(inv, b)));
            p.spawn((words(f, "mono", 12.0, FOREST2, b.hash.to_hex().to_string()), TextLayout::linebreak(LineBreak::AnyCharacter)));
            match &facts {
                Some(x) => {
                    let dims = x.dims.map(|(w, h)| format!(" · {w}×{h} px")).unwrap_or_default();
                    p.spawn(words(f, "mono", 13.0, FOREST, format!("{} · {}{dims}", x.media, bytes(x.size))));
                }
                None if db.facts.contains_key(&b.hash) => {
                    p.spawn(words(f, "mono", 13.0, SUN, "the store does not have this blob"));
                }
                None => {
                    p.spawn(words(f, "mono", 13.0, FOREST2, "reading its facts…"));
                }
            }
            section(p, f, "named by");
            if b.unreferenced() {
                p.spawn(words(f, "sans", 13.0, SUN, if b.elsewhere.is_empty() { "unreferenced".to_string() } else { format!("unreferenced on this branch; named on {}", b.elsewhere.join(", ")) }));
            }
            for (by, place) in &b.named_by {
                match by.strip_prefix("blob:") {
                    Some(hex) => match hex.parse::<Hash>() {
                        Ok(h) => link(p, f, DbAct::Blob(h), format!("blob {}", &hex[..10]), place.clone()),
                        Err(_) => {}
                    },
                    None => {
                        let name = inv.docs.iter().find(|x| &x.id == by).map(|x| format!("{} ({})", x.name, x.kind)).unwrap_or_else(|| by.clone());
                        link(p, f, DbAct::Goto(by.clone()), name, if place.is_empty() { "(its text)".into() } else { place.clone() });
                    }
                }
            }
            // the preview: an image, a text, a doc's version; the facts alone for anything else
            let Some(x) = facts else { return };
            section(p, f, "preview");
            match x.media {
                "image/png" | "image/jpeg" if x.size < 16 << 20 => {
                    let (w, h) = x.dims.unwrap_or((512, 512));
                    let width = 420.0f32.min(w as f32);
                    p.spawn((ImageNode::new(Handle::default()), Node { width: Val::Px(width), height: Val::Px(width * h as f32 / w.max(1) as f32), ..default() }, Thumb(b.hash), Pickable::IGNORE));
                }
                "application/json" | "text/plain" if x.size <= 1 << 20 => {
                    let text = crate::db().get(b.hash).ok().flatten().map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
                    lines(p, f, &pretty(&text));
                }
                "application/x-loro-snapshot" if x.size <= 4 << 20 => {
                    p.spawn(words(f, "sans", 13.0, FOREST2, "a version of a doc; its content then:"));
                    let text = crate::db().file_at(b.hash).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
                    lines(p, f, &pretty(&text));
                }
                _ => {
                    p.spawn(words(f, "sans", 13.0, FOREST2, format!("{}: no preview; its facts above", type_word(x.media).to_lowercase())));
                }
            }
        }
    }
}
