//! The round map at the bottom left of a real place: north up, the walker at its centre with an arrow for where they
//! look, zoomed with the mouse wheel (or + and -) from 1 km across to the whole world.
//!
//! Five layers, each a square centred on the site, and the map shows the smallest that covers its view:
//! the site itself (6 km, its land cover with relief shading, made when the place opens), the region (40 km, from the
//! same elevation and land-cover tiles), and the land of Natural Earth at 300 km, 3,000 km and 20,000 km.

use crate::contract::World;
use crate::rig::{Captures, Walker};
use bevy::picking::hover::Hovered;
use crate::place::{CN, Ground, SIZE_M, Site, Source, baked, colour, fetch, hash};
use std::sync::{Arc, Mutex};
use bevy::asset::RenderAssetUsages;
use bevy::input::mouse::{AccumulatedMouseScroll, MouseScrollUnit};
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};

/// The map's diameter on screen, in pixels.
const D: f32 = 230.0;
/// Pixels a side of the baked layers.
const N: usize = 256;
/// The baked layers: side in km, file. The region is colour; the rest are land masks.
const REGION_KM: f32 = 40.0;
const LANDS: [(f32, &str); 3] = [(300.0, "land300.bin"), (3_000.0, "land3000.bin"), (20_000.0, "land20000.bin")];
const LAND_URL: (&str, &str) =
    ("ne_10m_land.geojson", "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson");

const SEA: [f32; 3] = [0.64, 0.77, 0.86];
const LAND: [f32; 3] = [0.93, 0.90, 0.82];

// ---- the bake ----

/// (lat, lon) of pixel (i, j) of a square of `km` a side, centred on the site.
fn pixel_latlon(site: &Site, i: usize, j: usize, km: f32) -> (f64, f64) {
    let (x, z) = (((i as f32 + 0.5) / N as f32 - 0.5) * km * 1000.0, ((j as f32 + 0.5) / N as f32 - 0.5) * km * 1000.0);
    site.latlon(x, z)
}

pub fn bake(site: &Site, dem: &mut Source, cover: &mut Source) -> Result<(), String> {
    // the region: relief shading from the elevation, coloured by land cover, water from WorldCover
    let h: Vec<f32> = (0..N * N).map(|k| {
        let (lat, lon) = pixel_latlon(site, k % N, k / N, REGION_KM);
        dem.at(lat, lon, true)
    }).collect();
    let px = REGION_KM * 1000.0 / N as f32;
    let mut rgb = Vec::with_capacity(N * N * 3);
    for j in 0..N {
        for i in 0..N {
            let (lat, lon) = pixel_latlon(site, i, j, REGION_KM);
            let class = cover.at(lat, lon, false) as u8;
            let g = |a: usize, b: usize| h[b.min(N - 1) * N + a.min(N - 1)];
            let dx = g(i + 1, j) - g(i.saturating_sub(1), j);
            let dz = g(i, j + 1) - g(i, j.saturating_sub(1));
            let c = map_colour(class, shade(dx, dz, px));
            rgb.extend(c.map(|v| (v.clamp(0.0, 1.0) * 255.0) as u8));
        }
    }
    site.write("region.bin", &rgb)?;

    // the land at three scales, from Natural Earth's 1:10 million land polygons (public domain)
    let land = fetch(LAND_URL).ok_or("Natural Earth's land could not be fetched")?;
    let json: serde_json::Value = serde_json::from_slice(&land).map_err(|e| e.to_string())?;
    let mut rings: Vec<Vec<(f64, f64)>> = Vec::new();
    for f in json["features"].as_array().unwrap() {
        let g = &f["geometry"];
        let polys: Vec<&serde_json::Value> = match g["type"].as_str() {
            Some("Polygon") => vec![&g["coordinates"]],
            Some("MultiPolygon") => g["coordinates"].as_array().unwrap().iter().collect(),
            _ => continue,
        };
        for p in polys {
            for ring in p.as_array().unwrap() {
                rings.push(ring.as_array().unwrap().iter().map(|c| (c[0].as_f64().unwrap(), c[1].as_f64().unwrap())).collect());
            }
        }
    }
    for (km, file) in LANDS {
        site.write(file, &rasterise(site, &rings, km))?;
    }
    Ok(())
}

/// Even-odd fill of every ring into a square of `km` a side: 255 on land, 0 at sea. Each edge adds its crossings to the
/// rows it spans, so the cost is the edges plus the crossings, not edges times rows.
fn rasterise(site: &Site, rings: &[Vec<(f64, f64)>], km: f32) -> Vec<u8> {
    let (top_lat, left_lon) = pixel_latlon(site, 0, 0, km);
    let (bottom_lat, right_lon) = pixel_latlon(site, N - 1, N - 1, km);
    let (dlat, dlon) = ((top_lat - bottom_lat) / (N - 1) as f64, (right_lon - left_lon) / (N - 1) as f64);
    let mut rows: Vec<Vec<f64>> = vec![Vec::new(); N];
    for ring in rings {
        for w in ring.windows(2) {
            let ((x0, y0), (x1, y1)) = (w[0], w[1]);
            // to pixel space: column from the longitude, row from the latitude (down)
            let (c0, r0) = ((x0 - left_lon) / dlon, (top_lat - y0) / dlat);
            let (c1, r1) = ((x1 - left_lon) / dlon, (top_lat - y1) / dlat);
            let (lo, hi) = (r0.min(r1), r0.max(r1));
            let first = lo.ceil().max(0.0) as usize;
            let last = (hi.ceil() as i64).min(N as i64) as usize;
            for (r, row) in rows.iter_mut().enumerate().take(last).skip(first) {
                let rf = r as f64;
                if rf >= lo && rf < hi {
                    row.push(c0 + (rf - r0) / (r1 - r0) * (c1 - c0));
                }
            }
        }
    }
    let mut out = vec![0u8; N * N];
    for (r, xs) in rows.iter_mut().enumerate() {
        xs.sort_by(f64::total_cmp);
        for pair in xs.chunks_exact(2) {
            let (a, b) = (pair[0].ceil().max(0.0) as usize, (pair[1].ceil().max(0.0) as usize).min(N));
            out[r * N + a.min(N)..r * N + b].fill(255);
        }
    }
    out
}

/// Light from the north-west, as maps are shaded: 1 on flat ground.
fn shade(dx: f32, dz: f32, step: f32) -> f32 {
    let n = Vec3::new(-dx, 2.0 * step, -dz).normalize();
    let sun = Vec3::new(-1.0, 1.4, -1.0).normalize();
    (0.45 + 0.75 * n.dot(sun) / Vec3::Y.dot(sun)).clamp(0.3, 1.25)
}

/// A land-cover class as a map colour: the ground's colour lifted toward paper, water as blue.
fn map_colour(class: u8, shade: f32) -> [f32; 3] {
    if class == 80 {
        return SEA;
    }
    colour(class).map(|c| (0.35 + 1.3 * c) * shade)
}

// ---- the map in the app ----

/// A layer kept on the CPU: its side in km, its pixels a side, its sRGB colours.
struct Layer {
    km: f32,
    n: usize,
    px: Vec<[u8; 3]>,
}

impl Layer {
    /// The colour at (x, z) km from the site's centre, bilinear; None outside the layer.
    fn at(&self, x: f32, z: f32) -> Option<[f32; 3]> {
        let (u, v) = ((x / self.km + 0.5) * self.n as f32 - 0.5, (z / self.km + 0.5) * self.n as f32 - 0.5);
        let max = (self.n - 1) as f32;
        if !(0.0..=max).contains(&u) || !(0.0..=max).contains(&v) {
            return None;
        }
        let (i, j) = ((u as usize).min(self.n - 2), (v as usize).min(self.n - 2));
        let (fu, fv) = (u - i as f32, v - j as f32);
        let p = |a: usize, b: usize| self.px[b * self.n + a].map(f32::from);
        let (a, b, c, d) = (p(i, j), p(i + 1, j), p(i, j + 1), p(i + 1, j + 1));
        Some(std::array::from_fn(|k| (a[k] * (1.0 - fu) + b[k] * fu) * (1.0 - fv) + (c[k] * (1.0 - fu) + d[k] * fu) * fv))
    }
}

#[derive(Resource)]
struct Map {
    km: f32,
    layers: Vec<Layer>, // smallest first
    image: Handle<Image>,
    drawn: Option<(Vec2, f32)>,
}

/// How many km across the map opens; 2 unless set (for an agent's still).
#[derive(Resource)]
pub struct Start(pub f32);

#[derive(Component)]
struct MapImage;
#[derive(Component)]
struct Arrow;
#[derive(Component)]
struct MapLabel;

/// Pixels a side of the drawn map window.
const M: usize = 320;

pub fn plugin(app: &mut App) {
    app.add_systems(OnEnter(World::Place), spawn.after(crate::place::enter))
        .add_systems(Update, (follow.run_if(resource_exists::<Map>), baked_yet.run_if(resource_exists::<Baking>)))
        .add_systems(OnExit(World::Place), |mut c: Commands| c.remove_resource::<Map>());
}

fn spawn(mut commands: Commands, ground: Option<Res<Ground>>, site: Res<Site>, start: Option<Res<Start>>, mut images: ResMut<Assets<Image>>, assets: Res<AssetServer>) {
    let Some(ground) = ground else { return };
    let to_srgb = |c: [f32; 3]| c.map(|v| (v.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8);

    // the site: its land cover, relief-shaded from the height field
    let step = SIZE_M / CN as f32;
    let mut near = Vec::with_capacity(CN * CN);
    for j in 0..CN {
        for i in 0..CN {
            let (x, z) = ((i as f32 + 0.5) * step - SIZE_M / 2.0, (j as f32 + 0.5) * step - SIZE_M / 2.0);
            let dx = ground.at(x + step, z) - ground.at(x - step, z);
            let dz = ground.at(x, z + step) - ground.at(x, z - step);
            let n = 0.94 + 0.12 * hash(i as u32, j as u32, 9);
            near.push(to_srgb(map_colour(ground.cover[j * CN + i], shade(dx, dz, step)).map(|v| v * n)));
        }
    }
    let mut layers = vec![Layer { km: SIZE_M / 1000.0, n: CN, px: near }];
    // the baked layers; the region's colours are stored as they are shown
    if let Some(rgb) = site.read("region.bin") {
        let px = rgb.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect();
        layers.push(Layer { km: REGION_KM, n: N, px });
    }
    for (km, file) in LANDS {
        if let Some(mask) = site.read(file) {
            layers.push(Layer { km, n: N, px: mask.iter().map(|&m| to_srgb(if m > 0 { LAND } else { SEA })).collect() });
        }
    }
    let mut img = Image::new_fill(
        Extent3d { width: M as u32, height: M as u32, depth_or_array_layers: 1 },
        TextureDimension::D2,
        &[0, 0, 0, 0],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    img.sampler = bevy::image::ImageSampler::linear();
    let image = images.add(img);

    let mono: Handle<Font> = assets.load(crate::root::font(&crate::root::root().fonts.mono));
    let forest = Color::srgb(0.090, 0.212, 0.333);
    let sun = Color::srgb(0.949, 0.710, 0.267);
    let inner = D - 8.0;
    commands
        .spawn((
            DespawnOnExit(World::Place),
            Node { position_type: PositionType::Absolute, left: Val::Px(20.0), bottom: Val::Px(20.0), flex_direction: FlexDirection::Column, align_items: AlignItems::Start, row_gap: Val::Px(8.0), ..default() },
        ))
        .with_children(|p| {
            p.spawn((
                Node { width: Val::Px(D), height: Val::Px(D), border: UiRect::all(Val::Px(4.0)), border_radius: BorderRadius::MAX, ..default() },
                BorderColor::all(Color::srgb(0.984, 0.965, 0.918)),
                BoxShadow::new(Color::srgba(0.09, 0.21, 0.33, 0.25), Val::Px(0.0), Val::Px(6.0), Val::Px(0.0), Val::Px(18.0)),
            ))
            .with_children(|c| {
                c.spawn((MapImage, Captures, Hovered::default(), ImageNode::new(image.clone()), Node { width: Val::Px(inner), height: Val::Px(inner), ..default() }))
                    .observe(jump);
                // the walker: a dot, and a bar from it toward where they look
                c.spawn((
                    Arrow,
                    Pickable::IGNORE,
                    Node { position_type: PositionType::Absolute, left: Val::Px(inner / 2.0 - 13.0), top: Val::Px(inner / 2.0 - 13.0), width: Val::Px(26.0), height: Val::Px(26.0), ..default() },
                    children![
                        (Node { position_type: PositionType::Absolute, left: Val::Px(11.0), top: Val::Px(0.0), width: Val::Px(4.0), height: Val::Px(13.0), border_radius: BorderRadius::MAX, ..default() }, BackgroundColor(forest)),
                        (Node { position_type: PositionType::Absolute, left: Val::Px(7.0), top: Val::Px(7.0), width: Val::Px(12.0), height: Val::Px(12.0), border: UiRect::all(Val::Px(2.0)), border_radius: BorderRadius::MAX, ..default() }, BackgroundColor(sun), BorderColor::all(forest)),
                    ],
                ));
                c.spawn((
                    Text::new("N"),
                    TextFont { font: mono.clone().into(), font_size: FontSize::Px(13.0), ..default() },
                    TextColor(forest),
                    Node { position_type: PositionType::Absolute, top: Val::Px(6.0), left: Val::Px(inner / 2.0 - 4.0), ..default() },
                ));
            });
            p.spawn((
                Node { padding: UiRect::axes(Val::Px(12.0), Val::Px(6.0)), border_radius: BorderRadius::MAX, ..default() },
                BackgroundColor(Color::srgba(0.984, 0.965, 0.918, 0.85)),
                children![(MapLabel, Text::new(""), TextFont { font: mono.into(), font_size: FontSize::Px(12.0), ..default() }, TextColor(forest))],
            ));
        });
    commands.insert_resource(Map { km: start.map_or(2.0, |s| s.0), layers, image, drawn: None });
}

fn follow(
    mut map: ResMut<Map>,
    mut images: ResMut<Assets<Image>>,
    scroll: Res<AccumulatedMouseScroll>,
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    walker: Res<Walker>,
    site: Res<Site>,
    baking: Option<Res<Baking>>,
    hovered: Query<&Hovered, With<MapImage>>,
    mut arrow: Query<&mut UiTransform, With<Arrow>>,
    mut label: Query<&mut Text, With<MapLabel>>,
) {
    // zoom: the wheel over the map (elsewhere it moves the camera), or + and -, about 15 % a step
    let over = hovered.iter().any(|h| h.get());
    let wheel = if !over { 0.0 } else { match scroll.unit {
        MouseScrollUnit::Line => scroll.delta.y,
        MouseScrollUnit::Pixel => scroll.delta.y / 40.0,
    } };
    let keyed = (keys.pressed(KeyCode::Equal) as i32 - keys.pressed(KeyCode::Minus) as i32) as f32 * 6.0 * time.delta_secs();
    map.km = (map.km * 1.15f32.powf(-(wheel + keyed))).clamp(0.5, 20_000.0);

    // draw the window again once the walker has moved half a pixel or the zoom has changed
    let at = Vec2::new(walker.x, walker.z) / 1000.0;
    let per_px = map.km / M as f32;
    let stale = map.drawn.is_none_or(|(p, km)| km != map.km || p.distance(at) > per_px * 0.5);
    if stale {
        map.drawn = Some((at, map.km));
        let sea = SEA.map(|v| v.powf(1.0 / 2.2) * 255.0);
        if let Some(mut img) = images.get_mut(&map.image) {
            let data = img.data.get_or_insert_default();
            data.resize(M * M * 4, 0);
            let r = M as f32 / 2.0;
            for j in 0..M {
                for i in 0..M {
                    let (dx, dy) = (i as f32 + 0.5 - r, j as f32 + 0.5 - r);
                    let alpha = (r - (dx * dx + dy * dy).sqrt()).clamp(0.0, 1.0); // the round edge, anti-aliased
                    let (x, z) = (at.x + dx * per_px, at.y + dy * per_px);
                    let c = map.layers.iter().find_map(|l| l.at(x, z)).unwrap_or(sea);
                    let k = (j * M + i) * 4;
                    data[k..k + 4].copy_from_slice(&[c[0] as u8, c[1] as u8, c[2] as u8, (alpha * 255.0) as u8]);
                }
            }
        }
    }
    if let Ok(mut t) = arrow.single_mut() {
        t.rotation = Rot2::radians(-walker.yaw); // clockwise from north
    }
    if let Ok(mut t) = label.single_mut() {
        let (lat, lon) = site.latlon(walker.x, walker.z);
        let across = if map.km >= 10.0 { format!("{:.0} km", map.km) } else { format!("{:.1} km", map.km) };
        let h = walker.height();
        let up = if h >= 1000.0 { format!("{:.1} km", h / 1000.0) } else { format!("{h:.0} m") };
        let (ns, ew) = (if lat >= 0.0 { "N" } else { "S" }, if lon >= 0.0 { "E" } else { "W" });
        t.0 = match &baking {
            Some(b) => b.words.clone(),
            None => format!("{:.4}° {ns}  {:.4}° {ew}  ·  {up} up  ·  map {across}", lat.abs(), lon.abs()),
        };
    }
}

/// A place being fetched and baked in the background, and what the map's line says meanwhile.
#[derive(Resource)]
pub struct Baking {
    words: String,
    done: Arc<Mutex<Option<Result<Site, String>>>>,
}

/// A click on the map: inside the square the walker goes there, onto the ground; outside it, the 6 km square around
/// that point is fetched and baked in the background (once; a place baked before opens at once), then opened.
#[allow(clippy::too_many_arguments)]
fn jump(
    mut click: On<bevy::picking::events::PointerClick>,
    node: Query<(&ComputedNode, &bevy::ui::UiGlobalTransform), With<MapImage>>,
    map: Res<Map>,
    site: Res<Site>,
    baking: Option<Res<Baking>>,
    mut commands: Commands,
    mut next: ResMut<NextState<World>>,
    mut walker: ResMut<Walker>,
) {
    click.propagate(false);
    let Ok((n, at)) = node.get(click.entity) else { return };
    let (centre, size) = (at.translation * n.inverse_scale_factor, n.size.x * n.inverse_scale_factor);
    let d = click.pointer.position - centre; // logical px from the map's centre, y down = south
    if d.length() > size / 2.0 {
        return;
    }
    let to = Vec2::new(walker.x, walker.z) + d / size * map.km * 1000.0;
    let half = SIZE_M / 2.0;
    if to.x.abs() < half && to.y.abs() < half {
        walker.place(to.x, to.y);
        return;
    }
    if baking.is_some() {
        return;
    }
    let (lat, lon) = site.latlon(to.x, to.y);
    let there = Site::around(lat.clamp(-84.0, 84.0), (lon + 540.0).rem_euclid(360.0) - 180.0);
    if baked(&there) {
        commands.insert_resource(there);
        next.set(World::Place);
        return;
    }
    let done = Arc::new(Mutex::new(None));
    let words = format!("fetching {}  ·  elevation and land cover, up to 130 MB the first time", there.name);
    let out = done.clone();
    std::thread::spawn(move || {
        let result = crate::place::bake(&there).map(|line| {
            info!("{line}");
            there
        });
        *out.lock().unwrap() = Some(result);
    });
    commands.insert_resource(Baking { words, done });
}

/// When the bake is done, the place opens: the Place view is entered again, now for the new site.
fn baked_yet(baking: Res<Baking>, mut commands: Commands, mut next: ResMut<NextState<World>>) {
    let Some(result) = baking.done.lock().unwrap().take() else { return };
    commands.remove_resource::<Baking>();
    match result {
        Ok(site) => {
            commands.insert_resource(site);
            next.set(World::Place);
        }
        Err(e) => error!("the place could not be baked: {e}"),
    }
}
