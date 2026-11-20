//! A real place: 6 by 6 km around Mértola in the Alentejo, Portugal, a Mediterranean climate at about five people per
//! km². Its height comes from the Copernicus 30 m elevation model and its ground from ESA WorldCover (10 m); the
//! detail below that is invented, and trees stand where WorldCover says tree cover, placed by a hash so every run
//! grows the same ones.
//!
//!     cargo run -- --bake-place     fetches the source tiles (130 MB, once) and writes Mértola's package
//!     cargo run                     the dashboard's tile "Place" opens it
//!
//! Everything is kept in theDB (intent 0049), reached by ids from the root: each open-data file fetched, once, a part
//! of the Earth's doc under its source URL (the canopy map's headers and rows too, under their URL and range); a
//! place's package (height.bin, cover.bin, the map's layers, trees.bin, place.json, about 1 MB) one doc, each file a
//! part. A click on the map outside the square bakes the square
//! around that point the same way, in the background, and opens it; a place baked once opens at once.

use crate::contract::World;
use crate::rig::Walker;
use crate::world::Plain;
use bevy::pbr::{DistanceFog, FogFalloff};
use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;


/// The size of a place and the resolution of its two grids.
pub const SIZE_M: f32 = 6_000.0;
const HN: usize = 257; // height samples a side, 23.4 m apart
pub const CN: usize = 512; // cover samples a side, 11.7 m apart

/// The place shown: its name, its centre, where its package is, and where the walker starts (None: where they are).
#[derive(Resource, Clone)]
pub struct Site {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    /// Its package in theDB: the id of one doc, each file a part of it (a blob).
    pub docs: String,
    pub start: Option<(f32, f32, f32)>,
}

impl Site {
    /// A file of the site's package, from theDB.
    pub fn read(&self, file: &str) -> Option<Vec<u8>> {
        crate::db().part(&self.docs, file).ok().flatten().map(|b| b.to_vec())
    }
    /// Keeps a file of the site's package in theDB.
    pub fn write(&self, file: &str, bytes: &[u8]) -> Result<(), String> {
        crate::db().set_part(&self.docs, file, bytes).map(|_| ())
    }
    pub fn mertola() -> Site {
        // on the hill west of the town, looking east over the Guadiana
        let start = Some((-1_200.0, 300.0, -std::f32::consts::FRAC_PI_2));
        Site { name: "Mértola, Alentejo, Portugal".into(), lat: 37.6386, lon: -7.6614, docs: crate::root::root().mertola.clone(), start }
    }
    /// The 6 km square centred on a ground point; its package's doc found in the Earth's doc by where it is, or made.
    pub fn around(lat: f64, lon: f64) -> Site {
        let name = format!("{:.4}° {}  {:.4}° {}", lat.abs(), if lat >= 0.0 { "N" } else { "S" }, lon.abs(), if lon >= 0.0 { "E" } else { "W" });
        let docs = place_doc(lat, lon, &name);
        Site { name, lat, lon, docs, start: None }
    }
    /// The ground point (lat, lon) of a point of the site in metres, x to the east and z to the south.
    pub fn latlon(&self, x: f32, z: f32) -> (f64, f64) {
        let m = 111_320.0;
        (self.lat - z as f64 / m, self.lon + x as f64 / (m * self.lat.to_radians().cos()))
    }
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    name: String,
    lat: f64,
    lon: f64,
    size_m: f32,
    height_n: usize,
    cover_n: usize,
    credits: Vec<String>,
}

// ---- the bake: open GeoTIFF tiles in, a small package out ----

/// The doc of the place at (lat, lon): found in the Earth's doc (its part `place <lat> <lon>` holds the id), or made.
fn place_doc(lat: f64, lon: f64, name: &str) -> String {
    let db = crate::db();
    let (earth, at) = (&crate::root::root().earth, format!("place {lat:.4} {lon:.4}"));
    if let Some(id) = db.part(earth, &at).ok().flatten() {
        return String::from_utf8_lossy(&id).into_owned();
    }
    let id = db.new("place", name).expect("a place's doc is made");
    let _ = db.set_part(earth, &at, id.as_bytes());
    id
}

/// An open-data file, downloaded once and kept in theDB: a part of the Earth's doc under its source URL (its bytes a
/// blob). None when there is none (no elevation tile over open sea), which is kept too (`none <url>`), so it is not
/// asked for again.
pub fn fetch((name, url): (&str, &str)) -> Option<thedb::Bytes> {
    let db = crate::db();
    let earth = &crate::root::root().earth;
    if let Ok(Some(b)) = db.part(earth, url) {
        return Some(b);
    }
    // a source the server said is not there (404: an ocean tile, say) is not asked again; an empty marker is one an
    // older build wrote on any failure, even a local one, so it is asked again
    if db.part(earth, &format!("none {url}")).ok().flatten().is_some_and(|m| m.as_ref() == b"404") {
        return None;
    }
    eprintln!("fetching {name}");
    // downloaded into the store's cache, then kept in theDB; the download itself is not kept
    let dir = db.dir().join("cache").join("download");
    let _ = std::fs::create_dir_all(&dir);
    let part = dir.join(format!("{name}.{}.part", std::process::id()));
    let status = std::process::Command::new("curl")
        .args(["-sSL", "--retry", "2", "-w", "%{http_code}", "-o"])
        .arg(&part)
        .arg(url)
        .output()
        .ok()
        .map(|o| (o.status.success(), String::from_utf8_lossy(&o.stdout).trim().to_string()));
    let got = match &status {
        Some((true, code)) if code.starts_with('2') => std::fs::read(&part).ok(),
        _ => None,
    };
    let _ = std::fs::remove_file(&part);
    match got {
        Some(b) => {
            db.set_part(earth, url, &b).ok()?;
            Some(b.into())
        }
        None => {
            // only the server's own "not there" is remembered; a failed connection or a full disk is tried again
            if matches!(&status, Some((true, code)) if code == "404") {
                let _ = db.set_part(earth, &format!("none {url}"), b"404");
            } else {
                eprintln!("could not fetch {name}: {status:?}");
            }
            None
        }
    }
}

/// The open tiles a kind of map comes in, joined: each ground point is read from the tile that holds it.
pub struct Source {
    dem: bool,
    tiles: HashMap<String, Option<Raster>>,
}

impl Source {
    pub fn dem() -> Source {
        Source { dem: true, tiles: HashMap::new() }
    }
    pub fn cover() -> Source {
        Source { dem: false, tiles: HashMap::new() }
    }
    /// The tile's file name and URL: Copernicus GLO-30 in 1° tiles, ESA WorldCover in 3° tiles.
    fn tile(&self, lat: f64, lon: f64) -> (String, String) {
        let ns = |v: i32| format!("{}{:02}", if v >= 0 { "N" } else { "S" }, v.abs());
        let ew = |v: i32| format!("{}{:03}", if v >= 0 { "E" } else { "W" }, v.abs());
        if self.dem {
            let stem = format!("Copernicus_DSM_COG_10_{}_00_{}_00_DEM", ns(lat.floor() as i32), ew(lon.floor() as i32));
            (format!("{stem}.tif"), format!("https://copernicus-dem-30m.s3.amazonaws.com/{stem}/{stem}.tif"))
        } else {
            let (la, lo) = ((lat / 3.0).floor() as i32 * 3, (lon / 3.0).floor() as i32 * 3);
            let name = format!("ESA_WorldCover_10m_2021_v200_{}{}_Map.tif", ns(la), ew(lo));
            (name.clone(), format!("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/{name}"))
        }
    }
    /// The value at a ground point; where there is no tile, the sea: 0 m, and WorldCover's water.
    pub fn at(&mut self, lat: f64, lon: f64, smooth: bool) -> f32 {
        let (name, url) = self.tile(lat, lon);
        let r = self.tiles.entry(name.clone()).or_insert_with(|| fetch((&name, &url)).and_then(Raster::open));
        match r {
            Some(r) => r.at(lat, lon, smooth),
            None if self.dem => 0.0,
            None => 80.0,
        }
    }
}

/// A tiled GeoTIFF read a tile at a time, so a 36,000-pixel tile costs only the tiles the site touches.
pub struct Raster {
    dec: tiff::decoder::Decoder<std::io::Cursor<thedb::Bytes>>,
    origin: (f64, f64), // lon, lat of the raster's top left corner
    step: (f64, f64),   // degrees a pixel, across and down
    size: (u32, u32),
    tile: (u32, u32),
    across: u32,
    tiles: HashMap<u32, Vec<f32>>,
    bytes: thedb::Bytes,
}

impl Raster {
    fn open(bytes: thedb::Bytes) -> Option<Raster> {
        use tiff::tags::Tag;
        let mut dec = tiff::decoder::Decoder::new(std::io::Cursor::new(bytes.clone())).ok()?;
        let scale = dec.get_tag_f64_vec(Tag::ModelPixelScaleTag).ok()?;
        let tie = dec.get_tag_f64_vec(Tag::ModelTiepointTag).ok()?;
        let size = dec.dimensions().ok()?;
        let tile = dec.chunk_dimensions();
        Some(Raster { origin: (tie[3], tie[4]), step: (scale[0], scale[1]), size, tile, across: size.0.div_ceil(tile.0), tiles: HashMap::new(), dec, bytes })
    }

    fn pixel(&mut self, px: u32, py: u32) -> f32 {
        let (px, py) = (px.min(self.size.0 - 1), py.min(self.size.1 - 1));
        let (tx, ty) = (px / self.tile.0, py / self.tile.1);
        let index = ty * self.across + tx;
        let tw = self.tile.0;
        let (dec, bytes) = (&mut self.dec, &self.bytes);
        let data = self.tiles.entry(index).or_insert_with(|| {
            use tiff::decoder::DecodingResult as D;
            match dec.read_chunk(index) {
                Ok(D::F32(v)) => v,
                Ok(D::U8(v)) => v.into_iter().map(f32::from).collect(),
                Ok(D::I16(v)) => v.into_iter().map(f32::from).collect(),
                Ok(_) => Vec::new(),
                // WorldCover is a palette image, which the tiff crate will not decode: its tiles are 8-bit class
                // numbers, deflated, without a predictor, so they are inflated here as they are
                Err(_) => raw_tile(dec, bytes, index),
            }
        });
        // edge tiles may come back narrower; their rows are as wide as the data they hold
        let width = if data.len() as u32 >= tw * self.tile.1 { tw } else { (data.len() as u32 / self.tile.1).max(1) };
        data.get(((py % self.tile.1) * width + px % tw) as usize).copied().unwrap_or(0.0)
    }

    /// The value at a ground point: bilinear between pixel centres, or the nearest pixel for classes.
    pub fn at(&mut self, lat: f64, lon: f64, smooth: bool) -> f32 {
        let x = (lon - self.origin.0) / self.step.0 - 0.5;
        let y = (self.origin.1 - lat) / self.step.1 - 0.5;
        if !smooth {
            return self.pixel(x.round() as u32, y.round() as u32);
        }
        let (ix, iy) = (x.floor(), y.floor());
        let (fx, fy) = ((x - ix) as f32, (y - iy) as f32);
        let (ix, iy) = (ix as u32, iy as u32);
        let a = self.pixel(ix, iy) * (1.0 - fx) + self.pixel(ix + 1, iy) * fx;
        let b = self.pixel(ix, iy + 1) * (1.0 - fx) + self.pixel(ix + 1, iy + 1) * fx;
        a * (1.0 - fy) + b * fy
    }
}

fn raw_tile(dec: &mut tiff::decoder::Decoder<std::io::Cursor<thedb::Bytes>>, bytes: &[u8], index: u32) -> Vec<f32> {
    use std::io::Read;
    use tiff::tags::Tag;
    let mut read = || -> Option<Vec<f32>> {
        let offset = *dec.get_tag_u64_vec(Tag::TileOffsets).ok()?.get(index as usize)? as usize;
        let count = *dec.get_tag_u64_vec(Tag::TileByteCounts).ok()?.get(index as usize)? as usize;
        let packed = bytes.get(offset..offset + count)?;
        let mut out = Vec::new();
        flate2::read::ZlibDecoder::new(packed).read_to_end(&mut out).ok()?;
        Some(out.into_iter().map(f32::from).collect())
    };
    read().unwrap_or_default()
}

/// Bakes a site's package into its directory: the height and cover grids and the map's layers. Returns a line on it.
pub fn bake(site: &Site) -> Result<String, String> {
    let (mut dem, mut cover) = (Source::dem(), Source::cover());
    let grid = |n: usize, r: &mut Source, smooth: bool| -> Vec<f32> {
        (0..n * n)
            .map(|i| {
                let (x, z) = ((i % n) as f32 / (n - 1) as f32 - 0.5, (i / n) as f32 / (n - 1) as f32 - 0.5);
                let (lat, lon) = site.latlon(x * SIZE_M, z * SIZE_M);
                r.at(lat, lon, smooth)
            })
            .collect()
    };
    let height = grid(HN, &mut dem, true);
    let classes: Vec<u8> = grid(CN, &mut cover, false).into_iter().map(|c| c as u8).collect();
    site.write("height.bin", &height.iter().flat_map(|h| h.to_le_bytes()).collect::<Vec<u8>>())?;
    site.write("cover.bin", &classes)?;
    crate::map::bake(site, &mut dem, &mut cover)?;
    let trees = crate::canopy::trees(site);
    site.write("trees.bin", &crate::canopy::bytes(&trees))?;
    let manifest = Manifest {
        name: site.name.clone(),
        lat: site.lat,
        lon: site.lon,
        size_m: SIZE_M,
        height_n: HN,
        cover_n: CN,
        credits: vec![
            "Copernicus DEM GLO-30, © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA".into(),
            "ESA WorldCover 2021 v200, © ESA WorldCover project / Contains modified Copernicus Sentinel data (2021), CC BY 4.0".into(),
            "Natural Earth 1:10m land, public domain (the map's coastlines)".into(),
            "Meta and World Resources Institute, High Resolution Canopy Height Maps (2024), CC BY 4.0 (the trees)".into(),
        ],
    };
    // the manifest last: a package without one is unfinished
    site.write("place.json", (serde_json::to_string_pretty(&manifest).unwrap() + "\n").as_bytes())?;
    let (lo, hi) = height.iter().fold((f32::MAX, f32::MIN), |(a, b), &h| (a.min(h), b.max(h)));
    let shares: Vec<String> = shares(&classes).iter().map(|(c, s)| format!("{}:{s:.0}%", c.code)).collect();
    Ok(format!("baked {}: height {lo:.0}..{hi:.0} m, {} trees, cover {}", site.docs, trees.len(), shares.join(" ")))
}

/// Whether a site's package is there and whole.
pub fn baked(site: &Site) -> bool {
    site.read("place.json").is_some()
}

// ---- the place in the app ----

/// The loaded package: the height field, for the terrain and for the walker's feet.
#[derive(Resource, Clone)]
pub struct Ground {
    h: Vec<f32>,
    base: f32,
    /// the WorldCover class of each cover cell, CN a side, rows from north to south
    pub cover: Vec<u8>,
}

impl Ground {
    /// The ground's height in the scene at (x, z), bilinear between samples; the site's lowest point is 0.
    pub fn at(&self, x: f32, z: f32) -> f32 {
        let s = (HN - 1) as f32;
        let u = ((x / SIZE_M + 0.5) * s).clamp(0.0, s - 1e-3);
        let v = ((z / SIZE_M + 0.5) * s).clamp(0.0, s - 1e-3);
        let (i, j) = (u as usize, v as usize);
        let (fu, fv) = (u - i as f32, v - j as f32);
        let g = |a: usize, b: usize| self.h[b * HN + a];
        let a = g(i, j) * (1.0 - fu) + g(i + 1, j) * fu;
        let b = g(i, j + 1) * (1.0 - fu) + g(i + 1, j + 1) * fu;
        a * (1.0 - fv) + b * fv - self.base
    }
}

pub fn plugin(app: &mut App) {
    app.insert_resource(Site::mertola())
        .add_systems(OnEnter(World::Place), (stage, enter).chain())
        .add_systems(OnExit(World::Place), (leave, unstage))
        .init_resource::<CoverView>()
        .add_systems(Update, (cover_key.run_if(in_state(crate::View::Place)).run_if(in_state(World::Place)), cover_look).chain());
}

/// The real place's own eye: a 3D camera with its haze, made when the place opens and gone when it closes (the
/// dashboard's camera rests meanwhile).
#[derive(Component)]
pub struct PlaceEye;

fn stage(mut commands: Commands, mut dash: Query<(Entity, &mut Camera), With<crate::world::Eye>>) {
    for (e, mut c) in &mut dash {
        c.is_active = false;
        commands.entity(e).remove::<IsDefaultUiCamera>();
    }
    commands.spawn((
        PlaceEye,
        crate::contract::WorldEye,
        DespawnOnExit(World::Place),
        IsDefaultUiCamera,
        Camera3d::default(),
        // after the dashboard's camera, should that still be on (a still taken straight into the place)
        Camera { order: 1, ..default() },
        Projection::Perspective(PerspectiveProjection { near: 0.05, far: 30_000.0, ..default() }),
        Transform::from_xyz(0.0, 1.6, 0.0),
        DistanceFog {
            color: crate::world::HAZE,
            falloff: FogFalloff::from_visibility_colors(6_000.0, crate::world::HAZE, crate::world::HAZE),
            ..default()
        },
    ));
    // the sun's light; `sun.rs` turns and colours it with the hour
    commands.spawn((
        DespawnOnExit(World::Place),
        DirectionalLight { illuminance: 9_000.0, shadow_maps_enabled: true, ..default() },
        bevy::light::CascadeShadowConfigBuilder { num_cascades: 3, first_cascade_far_bound: 40.0, maximum_distance: 600.0, ..default() }.build(),
        Transform::from_xyz(0.3, 1.0, 0.4).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

fn unstage(mut commands: Commands, mut dash: Query<(Entity, &mut Camera), With<crate::world::Eye>>) {
    for (e, mut c) in &mut dash {
        c.is_active = true;
        commands.entity(e).insert(IsDefaultUiCamera);
    }
}

pub fn hash(x: u32, y: u32, salt: u32) -> f32 {
    let h = x.wrapping_mul(0x8da6_b343) ^ y.wrapping_mul(0xd816_3841) ^ salt.wrapping_mul(0xcb1a_b31f);
    ((h ^ (h >> 13)).wrapping_mul(0x85eb_ca6b) >> 8) as f32 / (1u32 << 24) as f32
}

/// A land cover class of ESA WorldCover, as cover.bin holds it: its code, its name, its colour in the natural view
/// (linear, as the ground looks in late autumn after the first rains) and its colour in WorldCover's own legend (sRGB).
/// The terrain, the map and the legend all read their colours and names from `CLASSES`, so there is no second copy.
pub struct Class {
    pub code: u8,
    pub name: &'static str,
    pub natural: [f32; 3],
    pub legend: [u8; 3],
}

/// WorldCover's eleven classes. The legend colours are the product's published palette: ESA WorldCover 10 m 2021 v200,
/// Product User Manual v2.0, table 1 (https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/docs/WorldCover_PUM_V2.0.pdf),
/// the same values Earth Engine's catalog gives for ESA/WorldCover/v200. WorldCover does not tell sea, lakes and rivers
/// apart: all are its permanent water.
pub const CLASSES: [Class; 11] = [
    // the ground under the cork and holm oaks, dry grass
    Class { code: 10, name: "Tree cover", natural: [0.30, 0.29, 0.17], legend: [0x00, 0x64, 0x00] },
    // cistus and broom, grey green
    Class { code: 20, name: "Shrubland", natural: [0.22, 0.24, 0.14], legend: [0xff, 0xbb, 0x22] },
    // half green again
    Class { code: 30, name: "Grassland", natural: [0.34, 0.34, 0.18], legend: [0xff, 0xff, 0x4c] },
    // ploughed
    Class { code: 40, name: "Cropland", natural: [0.36, 0.27, 0.17], legend: [0xf0, 0x96, 0xff] },
    // white walls, red roofs show as light
    Class { code: 50, name: "Built-up", natural: [0.62, 0.58, 0.52], legend: [0xfa, 0x00, 0x00] },
    // bare schist and soil
    Class { code: 60, name: "Bare / sparse vegetation", natural: [0.40, 0.33, 0.24], legend: [0xb4, 0xb4, 0xb4] },
    // old snow, a little grey
    Class { code: 70, name: "Snow and ice", natural: [0.80, 0.82, 0.85], legend: [0xf0, 0xf0, 0xf0] },
    // the Guadiana
    Class { code: 80, name: "Permanent water", natural: [0.06, 0.12, 0.14], legend: [0x00, 0x64, 0xc8] },
    Class { code: 90, name: "Herbaceous wetland", natural: [0.18, 0.24, 0.13], legend: [0x00, 0x96, 0xa0] },
    Class { code: 95, name: "Mangroves", natural: [0.10, 0.16, 0.09], legend: [0x00, 0xcf, 0x75] },
    Class { code: 100, name: "Moss and lichen", natural: [0.36, 0.34, 0.24], legend: [0xfa, 0xe6, 0xa0] },
];

/// A code WorldCover does not define (its no-data value is 0): the natural view's average ground, black in the legend.
pub const NO_DATA: Class = Class { code: 0, name: "No data", natural: [0.32, 0.31, 0.20], legend: [0x00, 0x00, 0x00] };

/// The class of a code.
pub fn class(code: u8) -> &'static Class {
    CLASSES.iter().find(|c| c.code == code).unwrap_or(&NO_DATA)
}

/// The colour of a WorldCover class in the natural view.
pub fn colour(code: u8) -> [f32; 3] {
    class(code).natural
}

/// The classes in a cover grid, each with its share of the area in percent, the largest first.
pub fn shares(cover: &[u8]) -> Vec<(&'static Class, f32)> {
    let mut counts = [0usize; 256];
    cover.iter().for_each(|&c| counts[c as usize] += 1);
    let mut out: Vec<(&'static Class, f32)> =
        (0..256).filter(|&c| counts[c] > 0).map(|c| (class(c as u8), counts[c] as f32 * 100.0 / cover.len().max(1) as f32)).collect();
    out.sort_by(|a, b| b.1.total_cmp(&a.1));
    out
}

/// Which colours the terrain wears: the natural ones (false, the default) or WorldCover's legend (true). It outlives a
/// place, so a square opened from the map keeps the view.
#[derive(Resource, Default)]
pub struct CoverView(pub bool);

/// The terrain's material and its two pictures, to swap when the view changes.
#[derive(Resource)]
pub struct GroundLook {
    material: Handle<StandardMaterial>,
    natural: Handle<Image>,
    classes: Handle<Image>,
}

/// The toggle's words: which colours the terrain wears now.
#[derive(Component)]
pub struct CoverLabel;

/// A layer shown only while the terrain wears the land cover classes (the legend).
#[derive(Component)]
pub struct CoverOnly;

/// L switches the terrain between its natural colours and the land cover classes.
fn cover_key(keys: Res<ButtonInput<KeyCode>>, mut view: ResMut<CoverView>) {
    if keys.just_pressed(KeyCode::KeyL) {
        view.0 = !view.0;
    }
}

/// Puts the chosen picture on the terrain, names it on the toggle and shows or hides the legend.
fn cover_look(
    view: Res<CoverView>,
    look: Option<Res<GroundLook>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut labels: Query<&mut Text, With<CoverLabel>>,
    mut only: Query<&mut Visibility, With<CoverOnly>>,
) {
    if let Some(look) = &look
        && (view.is_changed() || look.is_changed())
        && let Some(mut m) = materials.get_mut(&look.material)
    {
        m.base_color_texture = Some(if view.0 { look.classes.clone() } else { look.natural.clone() });
    }
    let want = if view.0 { "land cover · L" } else { "natural · L" };
    for mut t in &mut labels {
        if t.0 != want {
            t.0 = want.into();
        }
    }
    let shown = if view.0 { Visibility::Inherited } else { Visibility::Hidden };
    for mut v in &mut only {
        if *v != shown {
            *v = shown;
        }
    }
}

fn read_package(site: &Site) -> Option<(Manifest, Vec<f32>, Vec<u8>)> {
    let m: Manifest = serde_json::from_slice(&site.read("place.json")?).ok()?;
    let h = site.read("height.bin")?.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    Some((m, h, site.read("cover.bin")?))
}

#[allow(clippy::too_many_arguments)]
pub fn enter(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut plain: Query<&mut Visibility, With<Plain>>,
    mut walker: ResMut<Walker>,
    site: Res<Site>,
    view: Res<CoverView>,
) {
    let Some((_, h, cover)) = read_package(&site) else {
        error!("no place package in theDB at {}; run `cargo run -- --bake-place` once", site.docs);
        return;
    };
    for mut v in &mut plain {
        *v = Visibility::Hidden;
    }
    let base = h.iter().copied().fold(f32::MAX, f32::min);
    let ground = Ground { h, base, cover: cover.clone() };

    // the terrain: one grid mesh, its normals from the height differences
    let step = SIZE_M / (HN - 1) as f32;
    let mut pos = Vec::with_capacity(HN * HN);
    let mut nor = Vec::with_capacity(HN * HN);
    let mut uv = Vec::with_capacity(HN * HN);
    for j in 0..HN {
        for i in 0..HN {
            let (x, z) = (i as f32 * step - SIZE_M / 2.0, j as f32 * step - SIZE_M / 2.0);
            pos.push([x, ground.at(x, z), z]);
            let dx = ground.at(x + step, z) - ground.at(x - step, z);
            let dz = ground.at(x, z + step) - ground.at(x, z - step);
            nor.push(Vec3::new(-dx, 2.0 * step, -dz).normalize().to_array());
            uv.push([i as f32 / (HN - 1) as f32, j as f32 / (HN - 1) as f32]);
        }
    }
    let mut idx = Vec::with_capacity((HN - 1) * (HN - 1) * 6);
    for j in 0..HN as u32 - 1 {
        for i in 0..HN as u32 - 1 {
            let a = j * HN as u32 + i;
            let (b, c, d) = (a + 1, a + HN as u32, a + HN as u32 + 1);
            idx.extend_from_slice(&[a, c, b, b, c, d]);
        }
    }
    let terrain = Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default())
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nor)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_indices(Indices::U32(idx));
    // its picture: the natural colours, or the land cover classes (L), whichever the view wears
    let (natural, classes) = (images.add(ground_image(&cover)), images.add(classes_image(&cover)));
    let material = materials.add(StandardMaterial {
        base_color_texture: Some(if view.0 { classes.clone() } else { natural.clone() }),
        perceptual_roughness: 1.0,
        ..default()
    });
    commands.spawn((DespawnOnExit(World::Place), Mesh3d(meshes.add(terrain)), MeshMaterial3d(material.clone())));
    commands.insert_resource(GroundLook { material, natural, classes });

    // the land beyond the site, just under its lowest point (the river), so it never floods a valley
    commands.spawn((
        DespawnOnExit(World::Place),
        Mesh3d(meshes.add(Plane3d::default().mesh().size(60_000.0, 60_000.0))),
        MeshMaterial3d(materials.add(StandardMaterial { base_color: Color::srgb(0.30, 0.29, 0.19), perceptual_roughness: 1.0, ..default() })),
        Transform::from_xyz(0.0, -3.0, 0.0),
    ));

    // the plants: the measured trees where the canopy map has them (a crown and a trunk each, as tall and wide as
    // measured), else trees guessed from the land cover; and bushes on WorldCover's shrubland, under the 3 m a tree
    // needs to be measured
    struct Plant {
        x: f32,
        z: f32,
        h: f32, // to the crown's top
        r: f32, // the crown's radius
        trunk: bool,
        tint: f32,
    }
    let measured = site.read("trees.bin").map(|b| crate::canopy::parse(&b)).filter(|t| !t.is_empty());
    let mut plants: Vec<Plant> = Vec::new();
    if let Some(trees) = &measured {
        for (k, t) in trees.iter().enumerate() {
            plants.push(Plant { x: t.x, z: t.z, h: t.h, r: t.r, trunk: true, tint: 0.85 + 0.3 * hash(k as u32, 7, 5) });
        }
    }
    let cell = SIZE_M / CN as f32;
    for j in 0..CN {
        for i in 0..CN {
            let (chance, size) = match (cover[j * CN + i], measured.is_some()) {
                (20, _) => (0.10, 0.45),
                (10, false) => (0.32, 1.0), // open montado, about 25 trees a hectare
                (30, false) => (0.015, 0.8),
                _ => continue,
            };
            let (iu, ju) = (i as u32, j as u32);
            if hash(iu, ju, 1) > chance {
                continue;
            }
            let s = size * (0.7 + 0.6 * hash(iu, ju, 4));
            plants.push(Plant {
                x: (i as f32 + hash(iu, ju, 2)) * cell - SIZE_M / 2.0,
                z: (j as f32 + hash(iu, ju, 3)) * cell - SIZE_M / 2.0,
                h: 3.6 * s + 2.0 * s * 0.4,
                r: 3.2 * s,
                trunk: size >= 0.8,
                tint: 0.85 + 0.3 * hash(iu, ju, 5),
            });
        }
    }

    // merged into one mesh per 750 m square, twice: near, a round crown and a trunk; far, a crown of 20 faces only.
    // Each square stands at its centre, so the camera's distance to it picks which of the two is drawn.
    let part = |m: Mesh| {
        let p: Vec<Vec3> = m.attribute(Mesh::ATTRIBUTE_POSITION).unwrap().as_float3().unwrap().iter().map(|&a| Vec3::from(a)).collect();
        let n: Vec<Vec3> = m.attribute(Mesh::ATTRIBUTE_NORMAL).unwrap().as_float3().unwrap().iter().map(|&a| Vec3::from(a)).collect();
        let i: Vec<u32> = m.indices().unwrap().iter().map(|i| i as u32).collect();
        (p, n, i)
    };
    let near_crown = part(Sphere::new(1.0).mesh().ico(1).unwrap());
    let far_crown = part(Sphere::new(1.0).mesh().ico(0).unwrap());
    let trunk = part(Cylinder::new(1.0, 1.0).mesh().resolution(5).build());
    type Part = (Vec<Vec3>, Vec<Vec3>, Vec<u32>);
    #[derive(Default)]
    struct Built {
        p: Vec<[f32; 3]>,
        n: Vec<[f32; 3]>,
        c: Vec<[f32; 4]>,
        i: Vec<u32>,
    }
    impl Built {
        fn add(&mut self, (p, n, ix): &Part, scale: Vec3, at: Vec3, c: [f32; 4]) {
            let first = self.p.len() as u32;
            for (p, n) in p.iter().zip(n) {
                self.p.push((*p * scale + at).to_array());
                self.n.push((*n / scale).normalize().to_array());
                self.c.push(c);
            }
            self.i.extend(ix.iter().map(|i| i + first));
        }
    }
    const SQUARES: usize = 8;
    let side = SIZE_M / SQUARES as f32;
    let mut near: Vec<Built> = (0..SQUARES * SQUARES).map(|_| Built::default()).collect();
    let mut far: Vec<Built> = (0..SQUARES * SQUARES).map(|_| Built::default()).collect();
    let bark = [0.24, 0.19, 0.14, 1.0];
    for t in &plants {
        let (a, b) = (((t.x / side) + SQUARES as f32 / 2.0).clamp(0.0, SQUARES as f32 - 1.0) as usize, ((t.z / side) + SQUARES as f32 / 2.0).clamp(0.0, SQUARES as f32 - 1.0) as usize);
        let k = b * SQUARES + a;
        let centre = Vec3::new((a as f32 + 0.5) * side - SIZE_M / 2.0, 0.0, (b as f32 + 0.5) * side - SIZE_M / 2.0);
        let y = ground.at(t.x, t.z);
        let ch = (t.r * 0.65).min(t.h * 0.35); // the crown's half height: wide and low, as an oak's
        let mid = Vec3::new(t.x, y + t.h - ch, t.z) - centre;
        let leaf = [0.16 * t.tint, 0.24 * t.tint, 0.11 * t.tint, 1.0];
        let crown = Vec3::new(t.r, ch, t.r);
        if t.trunk {
            let stem = t.h - ch;
            let girth = (0.06 * t.h).clamp(0.12, 0.6);
            near[k].add(&trunk, Vec3::new(girth, stem + 0.3, girth), Vec3::new(t.x, y + stem / 2.0, t.z) - centre, bark);
        }
        near[k].add(&near_crown, crown, mid, leaf);
        far[k].add(&far_crown, crown, mid, leaf);
    }
    let leaves = materials.add(StandardMaterial { base_color: Color::WHITE, perceptual_roughness: 0.9, ..default() });
    use bevy::camera::visibility::VisibilityRange;
    let (switch, fade) = (900.0, 150.0);
    for (k, (n, f)) in near.into_iter().zip(far).enumerate() {
        let centre = Vec3::new((k % SQUARES) as f32 * side + side / 2.0 - SIZE_M / 2.0, 0.0, (k / SQUARES) as f32 * side + side / 2.0 - SIZE_M / 2.0);
        for (b, range) in [
            (n, VisibilityRange { start_margin: 0.0..0.0, end_margin: switch..switch + fade, use_aabb: false }),
            (f, VisibilityRange { start_margin: switch..switch + fade, end_margin: 1e9..1e9, use_aabb: false }),
        ] {
            if b.i.is_empty() {
                continue;
            }
            let mesh = Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default())
                .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, b.p)
                .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, b.n)
                .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, b.c)
                .with_inserted_indices(Indices::U32(b.i));
            commands.spawn((DespawnOnExit(World::Place), Mesh3d(meshes.add(mesh)), MeshMaterial3d(leaves.clone()), Transform::from_translation(centre), range));
        }
    }
    info!("place: {} measured trees, {} plants in all", measured.as_ref().map_or(0, Vec::len), plants.len());

    // where the site says to start; a place jumped to keeps the walker's height and heading, at its centre
    match site.start {
        Some((x, z, yaw)) => *walker = Walker::new(x, z, yaw),
        None => walker.place(0.0, 0.0),
    }
    // the world's land, for the contract
    let land = ground.clone();
    commands.insert_resource(crate::contract::Land(std::sync::Arc::new(move |x, z| land.at(x, z))));
    commands.insert_resource(ground);
}

fn leave(mut commands: Commands, mut plain: Query<&mut Visibility, With<Plain>>) {
    for mut v in &mut plain {
        *v = Visibility::Inherited;
    }
    commands.remove_resource::<Ground>();
    commands.remove_resource::<GroundLook>();
}

/// The ground's picture: each cover class's colour, a little noise so no two pixels match, softened over its
/// neighbours so the classes blend instead of showing their 12 m squares.
fn ground_image(cover: &[u8]) -> Image {
    use bevy::image::{ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
    use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
    let raw: Vec<[f32; 3]> = (0..CN * CN)
        .map(|k| {
            let n = 0.88 + 0.24 * hash((k % CN) as u32, (k / CN) as u32, 9);
            colour(cover[k]).map(|c| c * n)
        })
        .collect();
    let mut data = Vec::with_capacity(CN * CN * 4);
    for j in 0..CN {
        for i in 0..CN {
            let mut sum = [0.0; 3];
            let mut w = 0.0;
            for (dj, di) in [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)] {
                let (a, b) = ((i as i32 + di).clamp(0, CN as i32 - 1) as usize, (j as i32 + dj).clamp(0, CN as i32 - 1) as usize);
                let wt = if di == 0 && dj == 0 { 2.0 } else { 1.0 };
                for (s, c) in sum.iter_mut().zip(raw[b * CN + a]) {
                    *s += c * wt;
                }
                w += wt;
            }
            data.extend(sum.map(|s| ((s / w).clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8));
            data.push(255);
        }
    }
    let mut img = Image::new(
        Extent3d { width: CN as u32, height: CN as u32, depth_or_array_layers: 1 },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    img.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        mag_filter: ImageFilterMode::Linear,
        min_filter: ImageFilterMode::Linear,
        mipmap_filter: ImageFilterMode::Linear,
        anisotropy_clamp: 16,
        ..default()
    });
    img
}

/// The ground's picture in WorldCover's legend colours: one texel a cover cell, flat and unblended, so each class shows
/// exactly where the map has it.
fn classes_image(cover: &[u8]) -> Image {
    use bevy::image::{ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
    use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
    let data: Vec<u8> = cover.iter().flat_map(|&c| {
        let [r, g, b] = class(c).legend;
        [r, g, b, 255]
    }).collect();
    let mut img = Image::new(
        Extent3d { width: CN as u32, height: CN as u32, depth_or_array_layers: 1 },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    img.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        mag_filter: ImageFilterMode::Nearest,
        min_filter: ImageFilterMode::Linear,
        ..default()
    });
    img
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classes_are_worldcovers_eleven_once_each() {
        let codes: Vec<u8> = CLASSES.iter().map(|c| c.code).collect();
        assert_eq!(codes, [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);
        assert_eq!(class(80).legend, [0x00, 0x64, 0xc8]);
        assert_eq!(class(7).name, NO_DATA.name);
    }

    #[test]
    fn shares_sum_to_the_whole_largest_first() {
        let s = shares(&[10, 10, 10, 80, 50, 10, 80, 10]);
        assert_eq!(s.iter().map(|(c, _)| c.code).collect::<Vec<_>>(), [10, 80, 50]);
        assert!((s.iter().map(|(_, p)| p).sum::<f32>() - 100.0).abs() < 1e-3);
    }
}
