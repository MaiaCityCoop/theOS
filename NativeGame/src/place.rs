//! A real place: 6 by 6 km around Mértola in the Alentejo, Portugal, a Mediterranean climate at about five people per
//! km². Its height comes from the Copernicus 30 m elevation model and its ground from ESA WorldCover (10 m); the
//! detail below that is invented, and trees stand where WorldCover says tree cover, placed by a hash so every run
//! grows the same ones.
//!
//!     cargo run -- --bake-place     fetches the source tiles (130 MB, once, into target/) and writes Mértola's package
//!     cargo run                     the dashboard's tile "Place" opens it
//!
//! The package is what the game keeps: assets/places/mertola/ (height.bin, cover.bin, the map's layers, place.json),
//! about 1 MB. A click on the map outside the square bakes the square around that point the same way, in the
//! background, into target/places/, and opens it; a place baked once opens at once.

use crate::View;
use crate::rig::Walker;
use crate::world::Plain;
use bevy::pbr::{DistanceFog, FogFalloff};
use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Mértola's package, kept in the repository; every other place is fetched on the map's click into target/places/.
const MERTOLA: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/assets/places/mertola");

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
    pub dir: PathBuf,
    pub start: Option<(f32, f32, f32)>,
}

impl Site {
    pub fn mertola() -> Site {
        // on the hill west of the town, looking east over the Guadiana
        let start = Some((-1_200.0, 300.0, -std::f32::consts::FRAC_PI_2));
        Site { name: "Mértola, Alentejo, Portugal".into(), lat: 37.6386, lon: -7.6614, dir: MERTOLA.into(), start }
    }
    /// The 6 km square centred on a ground point, its package under target/places/.
    pub fn around(lat: f64, lon: f64) -> Site {
        let name = format!("{:.4}° {}  {:.4}° {}", lat.abs(), if lat >= 0.0 { "N" } else { "S" }, lon.abs(), if lon >= 0.0 { "E" } else { "W" });
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("target/places/{lat:.4}_{lon:.4}"));
        Site { name, lat, lon, dir, start: None }
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

/// Downloads a file once into target/place-data; None when there is none (no elevation tile over open sea).
pub fn fetch((name, url): (&str, &str)) -> Option<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/place-data");
    std::fs::create_dir_all(&dir).ok()?;
    let (path, part, none) = (dir.join(name), dir.join(format!("{name}.part")), dir.join(format!("{name}.none")));
    if path.exists() {
        return Some(path);
    }
    if none.exists() {
        return None;
    }
    eprintln!("fetching {name}");
    let ok = std::process::Command::new("curl").args(["-sSfL", "--retry", "2", "-o"]).arg(&part).arg(url).status().is_ok_and(|s| s.success());
    if ok && std::fs::rename(&part, &path).is_ok() {
        return Some(path);
    }
    let _ = std::fs::remove_file(&part);
    let _ = std::fs::write(&none, url); // remembered, so the sea is not asked for again
    None
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
        let r = self.tiles.entry(name.clone()).or_insert_with(|| fetch((&name, &url)).and_then(|p| Raster::open(&p)));
        match r {
            Some(r) => r.at(lat, lon, smooth),
            None if self.dem => 0.0,
            None => 80.0,
        }
    }
}

/// A tiled GeoTIFF read a tile at a time, so a 36,000-pixel tile costs only the tiles the site touches.
pub struct Raster {
    dec: tiff::decoder::Decoder<std::io::BufReader<std::fs::File>>,
    origin: (f64, f64), // lon, lat of the raster's top left corner
    step: (f64, f64),   // degrees a pixel, across and down
    size: (u32, u32),
    tile: (u32, u32),
    across: u32,
    tiles: HashMap<u32, Vec<f32>>,
    path: PathBuf,
}

impl Raster {
    fn open(path: &Path) -> Option<Raster> {
        use tiff::tags::Tag;
        let mut dec = tiff::decoder::Decoder::new(std::io::BufReader::new(std::fs::File::open(path).ok()?)).ok()?;
        let scale = dec.get_tag_f64_vec(Tag::ModelPixelScaleTag).ok()?;
        let tie = dec.get_tag_f64_vec(Tag::ModelTiepointTag).ok()?;
        let size = dec.dimensions().ok()?;
        let tile = dec.chunk_dimensions();
        Some(Raster { origin: (tie[3], tie[4]), step: (scale[0], scale[1]), size, tile, across: size.0.div_ceil(tile.0), tiles: HashMap::new(), dec, path: path.into() })
    }

    fn pixel(&mut self, px: u32, py: u32) -> f32 {
        let (px, py) = (px.min(self.size.0 - 1), py.min(self.size.1 - 1));
        let (tx, ty) = (px / self.tile.0, py / self.tile.1);
        let index = ty * self.across + tx;
        let tw = self.tile.0;
        let (dec, path) = (&mut self.dec, &self.path);
        let data = self.tiles.entry(index).or_insert_with(|| {
            use tiff::decoder::DecodingResult as D;
            match dec.read_chunk(index) {
                Ok(D::F32(v)) => v,
                Ok(D::U8(v)) => v.into_iter().map(f32::from).collect(),
                Ok(D::I16(v)) => v.into_iter().map(f32::from).collect(),
                Ok(_) => Vec::new(),
                // WorldCover is a palette image, which the tiff crate will not decode: its tiles are 8-bit class
                // numbers, deflated, without a predictor, so they are inflated here as they are
                Err(_) => raw_tile(dec, path, index),
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

fn raw_tile(dec: &mut tiff::decoder::Decoder<std::io::BufReader<std::fs::File>>, path: &Path, index: u32) -> Vec<f32> {
    use std::io::{Read, Seek, SeekFrom};
    use tiff::tags::Tag;
    let mut read = || -> Option<Vec<f32>> {
        let offset = *dec.get_tag_u64_vec(Tag::TileOffsets).ok()?.get(index as usize)?;
        let count = *dec.get_tag_u64_vec(Tag::TileByteCounts).ok()?.get(index as usize)?;
        let mut file = std::fs::File::open(path).ok()?;
        file.seek(SeekFrom::Start(offset)).ok()?;
        let mut packed = vec![0; count as usize];
        file.read_exact(&mut packed).ok()?;
        let mut out = Vec::new();
        flate2::read::ZlibDecoder::new(&packed[..]).read_to_end(&mut out).ok()?;
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
    let dir = &site.dir;
    let io = |e: std::io::Error| e.to_string();
    std::fs::create_dir_all(dir).map_err(io)?;
    std::fs::write(dir.join("height.bin"), height.iter().flat_map(|h| h.to_le_bytes()).collect::<Vec<u8>>()).map_err(io)?;
    std::fs::write(dir.join("cover.bin"), &classes).map_err(io)?;
    crate::map::bake(site, &mut dem, &mut cover)?;
    let trees = crate::canopy::trees(site);
    crate::canopy::save(&trees, &dir.join("trees.bin")).map_err(io)?;
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
    std::fs::write(dir.join("place.json"), serde_json::to_string_pretty(&manifest).unwrap() + "\n").map_err(io)?;
    let (lo, hi) = height.iter().fold((f32::MAX, f32::MIN), |(a, b), &h| (a.min(h), b.max(h)));
    let mut counts = [0usize; 256];
    classes.iter().for_each(|&c| counts[c as usize] += 1);
    let shares: Vec<String> = (0..256).filter(|&c| counts[c] > 0).map(|c| format!("{c}:{:.0}%", counts[c] as f32 * 100.0 / classes.len() as f32)).collect();
    Ok(format!("baked {}: height {lo:.0}..{hi:.0} m, {} trees, cover {}", dir.display(), trees.len(), shares.join(" ")))
}

/// Whether a site's package is there and whole.
pub fn baked(site: &Site) -> bool {
    site.dir.join("place.json").exists()
}

// ---- the place in the app ----

/// The loaded package: the height field, for the terrain and for the walker's feet.
#[derive(Resource)]
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
        .add_systems(OnEnter(View::Place), (stage, enter).chain())
        .add_systems(OnExit(View::Place), (leave, unstage));
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
        DespawnOnExit(View::Place),
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
        DespawnOnExit(View::Place),
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

/// The colour of a WorldCover class in late autumn, after the first rains.
pub fn colour(class: u8) -> [f32; 3] {
    match class {
        10 => [0.30, 0.29, 0.17], // tree cover: the ground under the cork and holm oaks, dry grass
        20 => [0.22, 0.24, 0.14], // shrubland: cistus and broom, grey green
        30 => [0.34, 0.34, 0.18], // grassland, half green again
        40 => [0.36, 0.27, 0.17], // cropland, ploughed
        50 => [0.62, 0.58, 0.52], // built up: white walls, red roofs show as light
        60 => [0.40, 0.33, 0.24], // bare schist and soil
        80 => [0.06, 0.12, 0.14], // water: the Guadiana
        90 => [0.18, 0.24, 0.13], // wetland
        _ => [0.32, 0.31, 0.20],
    }
}

fn read_package(dir: &Path) -> Option<(Manifest, Vec<f32>, Vec<u8>)> {
    let m: Manifest = serde_json::from_str(&std::fs::read_to_string(dir.join("place.json")).ok()?).ok()?;
    let h = std::fs::read(dir.join("height.bin")).ok()?.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    Some((m, h, std::fs::read(dir.join("cover.bin")).ok()?))
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
) {
    let Some((_, h, cover)) = read_package(&site.dir) else {
        error!("no place package at {}; run `cargo run -- --bake-place` once", site.dir.display());
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
    commands.spawn((
        DespawnOnExit(View::Place),
        Mesh3d(meshes.add(terrain)),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color_texture: Some(images.add(ground_image(&cover))),
            perceptual_roughness: 1.0,
            ..default()
        })),
    ));

    // the land beyond the site, just under its lowest point (the river), so it never floods a valley
    commands.spawn((
        DespawnOnExit(View::Place),
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
    let measured = crate::canopy::load(&site.dir.join("trees.bin")).filter(|t| !t.is_empty());
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
            commands.spawn((DespawnOnExit(View::Place), Mesh3d(meshes.add(mesh)), MeshMaterial3d(leaves.clone()), Transform::from_translation(centre), range));
        }
    }
    info!("place: {} measured trees, {} plants in all", measured.as_ref().map_or(0, Vec::len), plants.len());

    // where the site says to start; a place jumped to keeps the walker's height and heading, at its centre
    match site.start {
        Some((x, z, yaw)) => *walker = Walker::new(x, z, yaw),
        None => walker.place(0.0, 0.0),
    }
    commands.insert_resource(ground);
}

fn leave(mut commands: Commands, mut plain: Query<&mut Visibility, With<Plain>>) {
    for mut v in &mut plain {
        *v = Visibility::Inherited;
    }
    commands.remove_resource::<Ground>();
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
