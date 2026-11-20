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
//! part. A click on the map outside the square bakes the square around that point the same way, in the background,
//! and opens it (`map.rs`: the latest click wins, and a panel shows each step's tiles and MB); a place baked once
//! opens at once.

use crate::contract::World;
use crate::rig::Walker;
use crate::world::Plain;
use bevy::pbr::{DistanceFog, FogFalloff};
use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;


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

/// What a bake running in the background is doing, shared with the app that shows it: the step, its detail (the tile
/// and the MB), and the share of the whole bake done. Each step owns a slice of the whole (`step`), and reports how far
/// into it it is (`at`), so the share only grows. A bake asked for by a click carries the click's generation: when a
/// later click supersedes it, it stops at the next tile (the download in hand finishes and is kept).
#[derive(Clone, Default)]
pub struct Progress {
    now: std::sync::Arc<std::sync::Mutex<Now>>,
    generation: u64,
    latest: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

/// A bake's progress, read.
#[derive(Clone, Default, Debug)]
pub struct Now {
    pub step: String,
    pub detail: String,
    /// 0 to 1, of the whole bake
    pub share: f32,
    slice: (f32, f32),
}

impl Progress {
    /// The progress of the bake of click `generation`; `latest` holds the generation of the latest click.
    pub fn of(generation: u64, latest: std::sync::Arc<std::sync::atomic::AtomicU64>) -> Progress {
        Progress { now: Default::default(), generation, latest }
    }
    pub fn read(&self) -> Now {
        self.now.lock().unwrap().clone()
    }
    /// Whether a later click has superseded this bake.
    pub fn stale(&self) -> bool {
        self.latest.load(std::sync::atomic::Ordering::Relaxed) != self.generation
    }
    /// Stops the bake if a later click has superseded it.
    pub fn go_on(&self) -> Result<(), String> {
        if self.stale() { Err("superseded by a later click".into()) } else { Ok(()) }
    }
    /// A new step, owning the slice `from..to` of the whole.
    pub fn step(&self, step: &str, from: f32, to: f32) {
        let mut n = self.now.lock().unwrap();
        *n = Now { step: step.into(), detail: String::new(), share: from, slice: (from, to) };
        eprintln!("bake: {step}");
    }
    /// How far into the step it is (0 to 1), and what it is doing.
    pub fn at(&self, within: f32, detail: String) {
        let mut n = self.now.lock().unwrap();
        let (a, b) = n.slice;
        n.share = n.share.max(a + (b - a) * within.clamp(0.0, 1.0));
        n.detail = detail;
    }
}

/// Megabytes, as the panel shows them.
pub fn mb(bytes: u64) -> String {
    format!("{:.1} MB", bytes as f64 / 1e6)
}

/// A URL, or bytes a..=b of it, downloaded with curl into the store's download cache, reporting the bytes as they come
/// (`report(got, of)`, of: the size when known: the range's, or the server's Content-Length from a HEAD first).
/// Ok(None) when the server says it is not there (404, or 416 for a range past its end: an ocean tile); Err when it
/// could not be asked (no network) or answered otherwise.
pub fn download(url: &str, range: Option<(u64, u64)>, report: &mut dyn FnMut(u64, Option<u64>)) -> Result<Option<Vec<u8>>, String> {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let dir = crate::db().dir().join("cache").join("download");
    let _ = std::fs::create_dir_all(&dir);
    // a file of its own for every download, so two bakes fetching the same tile never write into one file
    let part = dir.join(format!("{}.{}.part", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let size = match range {
        Some((a, b)) => Some(b - a + 1),
        None => std::process::Command::new("curl").args(["-sSLI", "--max-time", "20", url]).output().ok().and_then(|o| {
            // the last response's length, after any redirects
            String::from_utf8_lossy(&o.stdout).lines().rev().find_map(|l| {
                let (k, v) = l.split_once(':')?;
                k.trim().eq_ignore_ascii_case("content-length").then(|| v.trim().parse().ok()).flatten()
            })
        }),
    };
    let mut cmd = std::process::Command::new("curl");
    cmd.args(["-sSL", "--retry", "2", "--connect-timeout", "20", "-w", "%{http_code}", "-o"]).arg(&part);
    if let Some((a, b)) = range {
        cmd.args(["-r", &format!("{a}-{b}")]);
    }
    let mut child = cmd.arg(url).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).spawn().map_err(|e| format!("curl: {e}"))?;
    // the bytes so far, a few times a second, from the file's size
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                report(std::fs::metadata(&part).map_or(0, |m| m.len()), size);
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Err(e) => return Err(format!("curl: {e}")),
        }
    };
    let out = child.wait_with_output().map_err(|e| format!("curl: {e}"))?;
    let code = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let got = std::fs::read(&part).ok();
    let _ = std::fs::remove_file(&part);
    match (status.success(), code.as_str()) {
        (true, c) if c.starts_with('2') => {
            let got = got.ok_or("the download vanished from the cache")?;
            report(got.len() as u64, size);
            Ok(Some(got))
        }
        (true, "404" | "416") => Ok(None),
        (true, c) => Err(format!("the server answered {c}")),
        (false, _) => {
            let why = String::from_utf8_lossy(&out.stderr).trim().trim_start_matches("curl: ").to_string();
            Err(if why.is_empty() { "no network".into() } else { why })
        }
    }
}

/// An open-data file, downloaded once and kept in theDB: a part of the Earth's doc under its source URL (its bytes a
/// blob). Ok(None) when there is none (no elevation tile over open sea): the server's 404 is kept too (`none <url>`),
/// so it is not asked for again. Err when it could not be fetched (no network, say), which is not kept: it is tried
/// again next time. `report` hears the bytes as they come.
pub fn fetch((name, url): (&str, &str), report: &mut dyn FnMut(u64, Option<u64>)) -> Result<Option<thedb::Bytes>, String> {
    let db = crate::db();
    let earth = &crate::root::root().earth;
    if let Ok(Some(b)) = db.part(earth, url) {
        return Ok(Some(b));
    }
    // an empty marker is one an older build wrote on any failure, even a local one, so it is asked again
    if db.part(earth, &format!("none {url}")).ok().flatten().is_some_and(|m| m.as_ref() == b"404") {
        return Ok(None);
    }
    eprintln!("fetching {name}");
    match download(url, None, report) {
        Ok(Some(b)) => {
            db.set_part(earth, url, &b)?;
            Ok(Some(b.into()))
        }
        Ok(None) => {
            let _ = db.set_part(earth, &format!("none {url}"), b"404");
            Ok(None)
        }
        Err(e) => {
            eprintln!("could not fetch {name}: {e}");
            Err(format!("{name} could not be fetched: {e}"))
        }
    }
}

/// Whether an open-data file is already kept (or known not to be there): fetching it costs nothing.
pub fn kept(url: &str) -> bool {
    let (db, earth) = (crate::db(), &crate::root::root().earth);
    db.part(earth, url).ok().flatten().is_some() || db.part(earth, &format!("none {url}")).ok().flatten().is_some_and(|m| m.as_ref() == b"404")
}

/// The open tiles a kind of map comes in, joined: each ground point is read from the tile that holds it.
pub struct Source {
    dem: bool,
    tiles: HashMap<String, Option<Raster>>,
    /// A tile that could not be fetched while reading (not a 404: that is the sea): the bake fails with it.
    pub failed: Option<String>,
}

impl Source {
    pub fn dem() -> Source {
        Source { dem: true, tiles: HashMap::new(), failed: None }
    }
    pub fn cover() -> Source {
        Source { dem: false, tiles: HashMap::new(), failed: None }
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
    /// Every tile a square of `km` a side around the site touches: the tile grid over its corners' latitudes and
    /// longitudes (the square is drawn in a flat projection, so its corners are its extremes).
    fn tiles_over(&self, site: &Site, km: f32) -> Vec<(String, String)> {
        let h = km * 500.0;
        let (n, w) = site.latlon(-h, -h);
        let (s, e) = site.latlon(h, h);
        let deg = if self.dem { 1.0 } else { 3.0 };
        let mut out: Vec<(String, String)> = Vec::new();
        for la in (s / deg).floor() as i32..=(n / deg).floor() as i32 {
            for lo in (w / deg).floor() as i32..=(e / deg).floor() as i32 {
                let t = self.tile((la as f64 + 0.5) * deg, (lo as f64 + 0.5) * deg);
                if !out.contains(&t) {
                    out.push(t);
                }
            }
        }
        out
    }
    /// Fetches every tile a square of `km` around the site needs, before any is read, so the bake can say how many
    /// there are and how far it is; reports into the progress's current step. A tile that cannot be fetched fails it.
    pub fn fetch_over(&mut self, site: &Site, km: f32, what: &str, p: &Progress) -> Result<(), String> {
        let tiles = self.tiles_over(site, km);
        let n = tiles.len();
        for (i, (name, url)) in tiles.into_iter().enumerate() {
            p.go_on()?;
            let cached = kept(&url);
            let mut report = |got: u64, of: Option<u64>| {
                let part = of.map_or(0.5, |of| got as f32 / of.max(1) as f32);
                let size = of.map_or(mb(got), |of| format!("{} of {}", mb(got), mb(of)));
                p.at((i as f32 + part) / n as f32, format!("tile {} of {n} · {size}", i + 1));
            };
            if cached {
                p.at(i as f32 / n as f32, format!("tile {} of {n} · kept", i + 1));
            }
            let raster = fetch((&name, &url), &mut report).map_err(|e| format!("{what}: {e}"))?.and_then(Raster::open);
            self.tiles.insert(name, raster);
            p.at((i + 1) as f32 / n as f32, format!("tile {} of {n} · {}", i + 1, if cached { "kept" } else { "done" }));
        }
        Ok(())
    }
    /// The value at a ground point; where there is no tile, the sea: 0 m, and WorldCover's water.
    pub fn at(&mut self, lat: f64, lon: f64, smooth: bool) -> f32 {
        let (name, url) = self.tile(lat, lon);
        let failed = &mut self.failed;
        let r = self.tiles.entry(name.clone()).or_insert_with(|| match fetch((&name, &url), &mut |_, _| {}) {
            Ok(b) => b.and_then(Raster::open),
            Err(e) => {
                failed.get_or_insert(e);
                None
            }
        });
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

/// Bakes a site's package into theDB: the height and cover grids, the map's layers and the measured trees, reporting
/// each step to `p`. The steps' slices of the whole follow what takes the time on a first bake: the downloads.
/// Returns a line on it.
pub fn bake(site: &Site, p: &Progress) -> Result<String, String> {
    let (mut dem, mut cover) = (Source::dem(), Source::cover());
    // the tiles first, over the map's 40 km region (it holds the 6 km square), so every download is counted
    p.step("Elevation · Copernicus GLO-30", 0.0, 0.25);
    dem.fetch_over(site, crate::map::REGION_KM, "the elevation", p)?;
    p.step("Land cover · ESA WorldCover", 0.25, 0.55);
    cover.fetch_over(site, crate::map::REGION_KM, "the land cover", p)?;
    p.go_on()?;

    p.step("Building the terrain", 0.55, 0.60);
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
    p.at(0.5, "the height".into());
    let classes: Vec<u8> = grid(CN, &mut cover, false).into_iter().map(|c| c as u8).collect();
    if let Some(e) = dem.failed.take().or(cover.failed.take()) {
        return Err(e);
    }
    site.write("height.bin", &height.iter().flat_map(|h| h.to_le_bytes()).collect::<Vec<u8>>())?;
    site.write("cover.bin", &classes)?;
    p.go_on()?;

    p.step("The map · Natural Earth coastlines", 0.60, 0.66);
    crate::map::bake(site, &mut dem, &mut cover, p)?;
    p.go_on()?;

    p.step("Trees · Meta and WRI canopy height", 0.66, 0.97);
    let trees = crate::canopy::trees(site, p)?;
    site.write("trees.bin", &crate::canopy::bytes(&trees))?;

    p.step("Writing the package", 0.97, 1.0);
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
    p.at(1.0, String::new());
    let (lo, hi) = height.iter().fold((f32::MAX, f32::MIN), |(a, b), &h| (a.min(h), b.max(h)));
    let shares: Vec<String> = shares(&classes).iter().map(|(c, s)| format!("{} {s:.0}%", c.name)).collect();
    Ok(format!("baked {}: height {lo:.0}..{hi:.0} m, {} trees, cover {}", site.docs, trees.len(), shares.join(", ")))
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
        .add_systems(OnExit(World::Place), (leave, unstage));
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
            falloff: air(crate::world::HAZE),
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

/// How far one sees through the place's air: 30 km, a clear day (the meteorological visibility; the WMO calls 20 to
/// 50 km very good). The haze used to close at 6 km, a hazy day's, which veiled the land a third at 1 km away and
/// left it pale and milky from above; the square's edge is hidden by the land beyond it, coloured as the square is.
pub const VISIBILITY: f32 = 30_000.0;

/// The place's air with the haze of the hour: light is taken out toward a clear sky's blue (the red and green go
/// further than the blue) and the haze's colour scattered in, as the Meadow's air does.
pub fn air(haze: Color) -> FogFalloff {
    FogFalloff::from_visibility_colors(VISIBILITY, Color::srgb(0.35, 0.48, 0.66), haze)
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

/// A land cover class of ESA WorldCover, as cover.bin holds it: its code, its name, and its colour on the ground and on
/// the round map, as linear reflectance in red, green and blue. The terrain, the map and the bake line all read
/// `CLASSES`, so there is no second copy.
///
/// The colours are what each surface reflects in the visible: Sentinel-2 surface reflectance (L2A, bands 4, 3 and 2,
/// red, green and blue) over each cover, and the USGS Spectral Library version 7 (Kokaly et al. 2017,
/// https://doi.org/10.5066/F7RR1WDJ) for its materials: green leaves 0.03 to 0.06 in red and blue with a peak of 0.08 to
/// 0.15 in green; dry grass and scrub 0.10 to 0.25, warm; soils and rock 0.20 to 0.35; asphalt, roofs and concrete
/// 0.10 to 0.30, grey; snow 0.8 to 0.9; clear deep water 0.01 to 0.05, highest in blue. Within those ranges each class
/// is put where it stays apart from its neighbours, so a forest, a field and a scrubland read as three things.
pub struct Class {
    pub code: u8,
    pub name: &'static str,
    pub natural: [f32; 3],
}

/// WorldCover's eleven classes (ESA WorldCover 10 m 2021 v200, Product User Manual v2.0, table 1). WorldCover does not
/// tell sea, lakes and rivers apart: all are its permanent water, drawn as water.
pub const CLASSES: [Class; 11] = [
    // a closed canopy seen from above: dark, rich green
    Class { code: 10, name: "Tree cover", natural: [0.035, 0.075, 0.030] },
    // cistus, broom and heath with dry ground between: warm ochre
    Class { code: 20, name: "Shrubland", natural: [0.150, 0.120, 0.060] },
    // grass, green after the autumn rains: lighter and yellower than the trees
    Class { code: 30, name: "Grassland", natural: [0.085, 0.140, 0.045] },
    // fields: sown cereal and stubble, between green and straw
    Class { code: 40, name: "Cropland", natural: [0.150, 0.165, 0.070] },
    // roofs, streets and walls: grey
    Class { code: 50, name: "Built-up", natural: [0.200, 0.195, 0.190] },
    // bare schist, sand and soil: pale
    Class { code: 60, name: "Bare / sparse vegetation", natural: [0.300, 0.260, 0.200] },
    Class { code: 70, name: "Snow and ice", natural: [0.850, 0.870, 0.900] },
    // clear deep water: dark, bluest; the terrain also makes it smooth and glossy
    Class { code: 80, name: "Permanent water", natural: [0.012, 0.030, 0.050] },
    // reeds and wet meadow: dark teal green
    Class { code: 90, name: "Herbaceous wetland", natural: [0.040, 0.085, 0.065] },
    Class { code: 95, name: "Mangroves", natural: [0.025, 0.060, 0.030] },
    // tundra's mosses and lichens: grey olive
    Class { code: 100, name: "Moss and lichen", natural: [0.160, 0.160, 0.110] },
];

/// A code WorldCover does not define (its no-data value is 0): an average ground.
pub const NO_DATA: Class = Class { code: 0, name: "No data", natural: [0.140, 0.130, 0.080] };

/// The class of a code.
pub fn class(code: u8) -> &'static Class {
    CLASSES.iter().find(|c| c.code == code).unwrap_or(&NO_DATA)
}

/// The colour of a WorldCover class.
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
    up: Option<Res<crate::rig::Up>>,
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
    // its picture: each class's colour, blended softly at the edges; water smooth and glossy, the land matte
    let material = materials.add(StandardMaterial {
        base_color_texture: Some(images.add(ground_image(&cover))),
        metallic_roughness_texture: Some(images.add(roughness_image(&cover))),
        perceptual_roughness: 1.0,
        metallic: 0.0,
        ..default()
    });
    commands.spawn((DespawnOnExit(World::Place), Mesh3d(meshes.add(terrain)), MeshMaterial3d(material)));

    // the land beyond the site, just under its lowest point (the river), so it never floods a valley; its colour the
    // site's own on average, so the square's edge does not show as a seam
    let mean = cover.iter().fold([0.0f32; 3], |m, &c| {
        let k = colour(c);
        [m[0] + k[0], m[1] + k[1], m[2] + k[2]]
    }).map(|v| v / cover.len().max(1) as f32);
    commands.spawn((
        DespawnOnExit(World::Place),
        Mesh3d(meshes.add(Plane3d::default().mesh().size(60_000.0, 60_000.0))),
        MeshMaterial3d(materials.add(StandardMaterial { base_color: Color::linear_rgb(mean[0], mean[1], mean[2]), perceptual_roughness: 1.0, ..default() })),
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

    // where the site says to start; a square opened from the map at a lookout over it, at eye height, as the first
    // place opens
    let (x, z, yaw) = site.start.unwrap_or_else(|| lookout(&ground));
    *walker = Walker::new(x, z, yaw);
    if let Some(up) = up {
        *walker = std::mem::replace(&mut *walker, Walker::new(0.0, 0.0, 0.0)).at_height(up.0);
    }
    // the world's land, for the contract
    let land = ground.clone();
    commands.insert_resource(crate::contract::Land(std::sync::Arc::new(move |x, z| land.at(x, z))));
    commands.insert_resource(ground);
}

/// Where to stand on a square opened from the map: the highest dry ground within 1.5 km of its centre, looking toward
/// the centre, so the first view looks over the square, as Mértola's start looks over its river.
fn lookout(ground: &Ground) -> (f32, f32, f32) {
    let mut best = (0.0, 0.0, f32::MIN);
    for j in -30..=30 {
        for i in -30..=30 {
            let (x, z) = (i as f32 * 50.0, j as f32 * 50.0);
            if x * x + z * z > 1500.0 * 1500.0 {
                continue;
            }
            let cell = |v: f32| (((v / SIZE_M + 0.5) * CN as f32) as usize).min(CN - 1);
            if ground.cover[cell(z) * CN + cell(x)] == 80 {
                continue;
            }
            let h = ground.at(x, z);
            if h > best.2 {
                best = (x, z, h);
            }
        }
    }
    let (x, z) = (best.0, best.1);
    // yaw 0 looks north (-z) and turns left as it grows: the heading from (x, z) to the centre
    let yaw = if x * x + z * z < 1.0 { 0.0 } else { x.atan2(z) };
    (x, z, yaw)
}

fn leave(mut commands: Commands, mut plain: Query<&mut Visibility, With<Plain>>) {
    for mut v in &mut plain {
        *v = Visibility::Inherited;
    }
    commands.remove_resource::<Ground>();
}

/// The ground's picture: each cover class's colour, a little noise so no two pixels match, and the classes blended over
/// a 5 by 5 cell neighbourhood (binomial weights, about 25 m), so their edges are soft and the 12 m cells never show.
fn ground_image(cover: &[u8]) -> Image {
    use bevy::image::{ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
    use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
    let raw: Vec<[f32; 3]> = (0..CN * CN)
        .map(|k| {
            let n = 0.90 + 0.20 * hash((k % CN) as u32, (k / CN) as u32, 9);
            colour(cover[k]).map(|c| c * n)
        })
        .collect();
    let data = blur(&raw).into_iter().flat_map(|c| {
        let [r, g, b] = c.map(|v| (v.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8);
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
        mag_filter: ImageFilterMode::Linear,
        min_filter: ImageFilterMode::Linear,
        mipmap_filter: ImageFilterMode::Linear,
        anisotropy_clamp: 16,
        ..default()
    });
    img
}

/// A cover grid's values softened: each cell the binomial mean (1 4 6 4 1, across then down) of its neighbours.
fn blur<const K: usize>(raw: &[[f32; K]]) -> Vec<[f32; K]> {
    const W: [f32; 5] = [1.0, 4.0, 6.0, 4.0, 1.0];
    let pass = |src: &[[f32; K]], across: bool| -> Vec<[f32; K]> {
        (0..CN * CN)
            .map(|k| {
                let (i, j) = ((k % CN) as i32, (k / CN) as i32);
                let mut sum = [0.0; K];
                for (t, w) in W.iter().enumerate() {
                    let d = t as i32 - 2;
                    let (a, b) = if across { ((i + d).clamp(0, CN as i32 - 1), j) } else { (i, (j + d).clamp(0, CN as i32 - 1)) };
                    for (s, c) in sum.iter_mut().zip(src[b as usize * CN + a as usize]) {
                        *s += c * w / 16.0;
                    }
                }
                sum
            })
            .collect()
    };
    pass(&pass(raw, true), false)
}

/// The terrain's roughness (green) and metalness (blue, none): water smooth, so the sun glints on it; the land matte.
fn roughness_image(cover: &[u8]) -> Image {
    use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
    let raw: Vec<[f32; 1]> = cover.iter().map(|&c| [if c == 80 { 0.12 } else { 1.0 }]).collect();
    let data = blur(&raw).into_iter().flat_map(|[r]| [0, (r * 255.0) as u8, 0, 255]).collect();
    let mut img = Image::new(
        Extent3d { width: CN as u32, height: CN as u32, depth_or_array_layers: 1 },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8Unorm,
        RenderAssetUsages::default(),
    );
    img.sampler = bevy::image::ImageSampler::linear();
    img
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classes_are_worldcovers_eleven_once_each() {
        let codes: Vec<u8> = CLASSES.iter().map(|c| c.code).collect();
        assert_eq!(codes, [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);
        assert!(class(80).natural[2] > class(80).natural[0], "water is bluest");
        assert_eq!(class(7).name, NO_DATA.name);
    }

    #[test]
    fn progress_grows_through_its_steps_and_a_later_click_supersedes_it() {
        let latest = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(1));
        let p = Progress::of(1, latest.clone());
        p.step("Elevation", 0.0, 0.25);
        p.at(0.5, "tile 1 of 2".into());
        assert!((p.read().share - 0.125).abs() < 1e-6);
        p.at(0.2, "back".into()); // never backwards
        assert!((p.read().share - 0.125).abs() < 1e-6);
        p.step("Land cover", 0.25, 0.55);
        p.at(1.0, String::new());
        assert!((p.read().share - 0.55).abs() < 1e-6);
        assert!(p.go_on().is_ok());
        latest.store(2, std::sync::atomic::Ordering::Relaxed);
        assert!(p.stale() && p.go_on().is_err());
        assert!(!Progress::default().stale(), "a bake no click asked for is never superseded");
    }

    #[test]
    fn shares_sum_to_the_whole_largest_first() {
        let s = shares(&[10, 10, 10, 80, 50, 10, 80, 10]);
        assert_eq!(s.iter().map(|(c, _)| c.code).collect::<Vec<_>>(), [10, 80, 50]);
        assert!((s.iter().map(|(_, p)| p).sum::<f32>() - 100.0).abs() < 1e-3);
    }
}
