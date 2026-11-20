//! The real trees of a place, from Meta and WRI's global canopy height map (1 m, CC BY 4.0): every tree taller than
//! 3 m stands where its crown's top is, as tall as it is measured.
//!
//! The map comes in Web Mercator tiles of 65,536² pixels (zoom-9 quadkeys, about 270 MB each), stored as one-row
//! deflated strips in order. A 6 km square needs only the rows it crosses, so each tile is read with two HTTP range
//! requests: its header (the strips' offsets), then the run of rows, about 25 MB. Nothing else is downloaded.
//!
//! The heights are sampled onto a 2 m grid over the site; a tree is a cell that is the highest within a radius that
//! grows with its height (a taller crown is wider), and its crown's radius follows from its height.

use crate::place::{Progress, SIZE_M, Site, download, mb};
use std::io::Read;

const R: f64 = 6_378_137.0; // the Mercator sphere
const ZOOM: u32 = 9;
const URL: &str = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm";
const CELL: f32 = 2.0; // metres a grid cell
const MIN_H: u8 = 3; // the lowest tree

/// One tree: where it stands (m from the site's centre), how tall it is and how wide its crown is (m).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tree {
    pub x: f32,
    pub z: f32,
    pub h: f32,
    pub r: f32,
}

fn mercator(lat: f64, lon: f64) -> (f64, f64) {
    (R * lon.to_radians(), R * (std::f64::consts::FRAC_PI_4 + lat.to_radians() / 2.0).tan().ln())
}

fn quadkey(tx: u32, ty: u32) -> String {
    (0..ZOOM).rev().map(|i| char::from(b'0' + (((tx >> i) & 1) + 2 * ((ty >> i) & 1)) as u8)).collect()
}

/// Bytes a..=b of a URL, fetched once and kept in theDB: a part of the Earth's doc under the URL and range. Ok(None)
/// where there is no such tile (open sea, or beyond the map's coverage); Err when it could not be fetched.
fn kept(url: &str, a: u64, b: u64, report: &mut dyn FnMut(u64, Option<u64>)) -> Result<Option<Vec<u8>>, String> {
    let (db, earth, at) = (crate::db(), &crate::root::root().earth, format!("{url} bytes {a}-{b}"));
    if let Some(got) = db.part(earth, &at).ok().flatten() {
        return Ok(Some(got.to_vec()));
    }
    let Some(got) = download(url, Some((a, b)), report)? else { return Ok(None) };
    db.set_part(earth, &at, &got)?;
    Ok(Some(got))
}

/// The rows of one tile that a window crosses, decoded: heights in metres, one byte a pixel.
struct Window {
    origin: (f64, f64), // Mercator x, y of the tile's top left corner
    px: f64,            // Mercator metres a pixel
    r0: usize,
    c0: usize,
    w: usize,
    rows: Vec<Vec<u8>>,
}

impl Window {
    fn at(&self, mx: f64, my: f64) -> Option<u8> {
        let (c, r) = (((mx - self.origin.0) / self.px) as isize, ((self.origin.1 - my) / self.px) as isize);
        let (c, r) = (c - self.c0 as isize, r - self.r0 as isize);
        if c < 0 || r < 0 || c as usize >= self.w {
            return None;
        }
        self.rows.get(r as usize).map(|row| row[c as usize])
    }
}

/// A little-endian BigTIFF's tag: its type, count and value or offset.
fn tags(head: &[u8]) -> Option<std::collections::HashMap<u16, (u16, u64, u64)>> {
    let u16_at = |o: usize| head.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]]));
    let u64_at = |o: usize| head.get(o..o + 8).map(|b| u64::from_le_bytes(b.try_into().unwrap()));
    if head.get(0..2)? != b"II" || u16_at(2)? != 43 {
        return None;
    }
    let ifd = u64_at(8)? as usize;
    let n = u64_at(ifd)? as usize;
    let mut out = std::collections::HashMap::new();
    for i in 0..n {
        let e = ifd + 8 + i * 20;
        out.insert(u16_at(e)?, (u16_at(e + 2)?, u64_at(e + 4)?, u64_at(e + 12)?));
    }
    Some(out)
}

/// The rows of tile (tx, ty) a window crosses; Ok(None) where the map has no tile or it does not read. `report` hears
/// what it fetches: its header, then its rows, with the bytes so far and of how many.
fn read_tile(tx: u32, ty: u32, want: ((f64, f64), (f64, f64)), report: &mut dyn FnMut(&str, u64, u64)) -> Result<Option<Window>, String> {
    let url = format!("{URL}/{}.tif", quadkey(tx, ty));
    // the header: the directory and the strips' offsets and sizes, which this map keeps in its first megabyte
    let (h0, h1) = (0, (1 << 20) + 65_535);
    let Some(head) = kept(&url, h0, h1, &mut |got, of| report("header", got, of.unwrap_or(h1 + 1)))? else { return Ok(None) };
    rows(&url, &head, want, report)
}

/// The rows a window crosses, from a tile's header: their run fetched in one range, then each row inflated.
fn rows(url: &str, head: &[u8], want: ((f64, f64), (f64, f64)), report: &mut dyn FnMut(&str, u64, u64)) -> Result<Option<Window>, String> {
    let Some(l) = layout(head, want) else { return Ok(None) };
    let (a, b) = (l.strips[0].0, l.strips.last().map_or(0, |s| s.0 + s.1) - 1);
    let Some(bytes) = kept(url, a, b, &mut |got, of| report("rows", got, of.unwrap_or(b - a + 1)))? else { return Ok(None) };
    Ok(l.decode(&bytes, a))
}

/// Where a window's rows lie in a tile: each row's strip (offset, length), and what decoding them needs.
struct Layout {
    origin: (f64, f64),
    px: f64,
    r0: usize,
    c0: usize,
    c1: usize,
    width: usize,
    predictor: u64,
    strips: Vec<(u64, u64)>,
}

fn layout(head: &[u8], want: ((f64, f64), (f64, f64))) -> Option<Layout> {
    let t = tags(head)?;
    let (width, height) = (t.get(&256)?.2 as usize, t.get(&257)?.2 as usize);
    let (offsets_at, counts_at) = (t.get(&273)?.2 as usize, t.get(&279)?.2 as usize);
    let (scale_at, tie_at) = (t.get(&33550)?.2 as usize, t.get(&33922)?.2 as usize);
    let f64_at = |o: usize| head.get(o..o + 8).map(|b| f64::from_le_bytes(b.try_into().unwrap()));
    let u64_at = |o: usize| head.get(o..o + 8).map(|b| u64::from_le_bytes(b.try_into().unwrap()));
    let px = f64_at(scale_at)?;
    let origin = (f64_at(tie_at + 24)?, f64_at(tie_at + 32)?);
    let predictor = t.get(&317).map_or(1, |p| p.2);

    let ((x0, y0), (x1, y1)) = want; // Mercator: west, north; east, south
    let clamp = |v: f64, n: usize| (v.max(0.0) as usize).min(n - 1);
    let (c0, c1) = (clamp((x0 - origin.0) / px, width), clamp((x1 - origin.0) / px, width));
    let (r0, r1) = (clamp((origin.1 - y0) / px, height), clamp((origin.1 - y1) / px, height));
    let strips = (r0..=r1).map(|r| Some((u64_at(offsets_at + 8 * r)?, u64_at(counts_at + 8 * r)?))).collect::<Option<Vec<_>>>()?;
    Some(Layout { origin, px, r0, c0, c1, width, predictor, strips })
}

impl Layout {
    /// The rows inflated from their run of bytes, which starts at offset `a` of the tile.
    fn decode(&self, bytes: &[u8], a: u64) -> Option<Window> {
        let mut rows = Vec::with_capacity(self.strips.len());
        for &(off, len) in &self.strips {
            let s = (off - a) as usize;
            let mut row = Vec::with_capacity(self.width);
            flate2::read::ZlibDecoder::new(bytes.get(s..s + len as usize)?).read_to_end(&mut row).ok()?;
            if self.predictor == 2 {
                for i in 1..row.len() {
                    row[i] = row[i].wrapping_add(row[i - 1]);
                }
            }
            row.truncate(self.c1 + 1);
            rows.push(row.split_off(self.c0.min(row.len())));
        }
        Some(Window { origin: self.origin, px: self.px, r0: self.r0, c0: self.c0, w: self.c1 - self.c0 + 1, rows })
    }
}

/// The site's trees, measured, reporting into the progress's current step. Empty where the map has nothing (the sea,
/// or a tile that does not read); Err when a tile could not be fetched.
pub fn trees(site: &Site, p: &Progress) -> Result<Vec<Tree>, String> {
    // the site's corners in Mercator, and the zoom-9 tiles they fall in
    let half = SIZE_M / 2.0 + CELL;
    let (n, w) = site.latlon(-half, -half);
    let (s, e) = site.latlon(half, half);
    let (west, north) = mercator(n, w);
    let (east, south) = mercator(s, e);
    let span = 2.0 * std::f64::consts::PI * R / (1u32 << ZOOM) as f64;
    let tile = |x: f64, y: f64| (((x + std::f64::consts::PI * R) / span) as u32, ((std::f64::consts::PI * R - y) / span) as u32);
    let (t0, t1) = (tile(west, north), tile(east, south));
    // the downloads take most of the step; finding the trees the rest
    let count = ((t1.0 - t0.0 + 1) * (t1.1 - t0.1 + 1)) as usize;
    let mut windows = Vec::new();
    for (k, (tx, ty)) in (t0.1..=t1.1).flat_map(|ty| (t0.0..=t1.0).map(move |tx| (tx, ty))).enumerate() {
        p.go_on()?;
        let mut report = |what: &str, got: u64, of: u64| {
            // the header is a small share of a tile, its rows the rest
            let part = if what == "header" { 0.05 * got as f32 / of.max(1) as f32 } else { 0.05 + 0.95 * got as f32 / of.max(1) as f32 };
            p.at(0.9 * (k as f32 + part) / count as f32, format!("tile {} of {count} · {what} · {} of {}", k + 1, mb(got), mb(of)));
        };
        windows.extend(read_tile(tx, ty, ((west, north), (east, south)), &mut report).map_err(|e| format!("the canopy map: {e}"))?);
        p.at(0.9 * (k + 1) as f32 / count as f32, format!("tile {} of {count} · done", k + 1));
    }
    p.at(0.9, "finding the trees".into());
    if windows.is_empty() {
        return Ok(Vec::new());
    }

    // the heights on a 2 m grid over the site: the tallest of the pixels the cell's centre falls near
    let g = (SIZE_M / CELL) as usize;
    let mut grid = vec![0u8; g * g];
    for j in 0..g {
        for i in 0..g {
            let (x, z) = ((i as f32 + 0.5) * CELL - SIZE_M / 2.0, (j as f32 + 0.5) * CELL - SIZE_M / 2.0);
            let (lat, lon) = site.latlon(x, z);
            let (mx, my) = mercator(lat, lon);
            let h = windows.iter().find_map(|win| win.at(mx, my)).unwrap_or(0);
            grid[j * g + i] = if h > 80 { 0 } else { h }; // above 80 m is no tree, only noise
        }
    }

    // a tree is the highest cell within a radius that grows with its height
    let mut out = Vec::new();
    for j in 0..g {
        for i in 0..g {
            let h = grid[j * g + i];
            if h < MIN_H {
                continue;
            }
            let rad = ((h as f32 * 0.25 / CELL).round() as isize).clamp(1, 5);
            let mut top = true;
            'look: for dj in -rad..=rad {
                for di in -rad..=rad {
                    if (di, dj) == (0, 0) || di * di + dj * dj > rad * rad {
                        continue;
                    }
                    let (a, b) = (i as isize + di, j as isize + dj);
                    if a < 0 || b < 0 || a >= g as isize || b >= g as isize {
                        continue;
                    }
                    let o = grid[b as usize * g + a as usize];
                    // ties go to the first cell in reading order, so a flat top makes one tree, not several
                    if o > h || (o == h && (dj < 0 || (dj == 0 && di < 0))) {
                        top = false;
                        break 'look;
                    }
                }
            }
            if top {
                let hf = h as f32;
                out.push(Tree {
                    x: (i as f32 + 0.5) * CELL - SIZE_M / 2.0,
                    z: (j as f32 + 0.5) * CELL - SIZE_M / 2.0,
                    h: hf,
                    r: (0.45 * hf).clamp(1.5, 9.0),
                });
            }
        }
    }
    Ok(out)
}

/// The trees as a package file: x and z in decimetres (i16), height and crown radius in quarter metres (u8).
/// The bytes of a package's `trees.bin`.
pub fn bytes(trees: &[Tree]) -> Vec<u8> {
    let mut b = Vec::with_capacity(trees.len() * 6);
    for t in trees {
        b.extend(((t.x * 10.0).round() as i16).to_le_bytes());
        b.extend(((t.z * 10.0).round() as i16).to_le_bytes());
        b.push((t.h * 4.0).round().min(255.0) as u8);
        b.push((t.r * 4.0).round().min(255.0) as u8);
    }
    b
}

/// The trees of a package's `trees.bin`.
pub fn parse(b: &[u8]) -> Vec<Tree> {
    {
        b.chunks_exact(6)
            .map(|c| Tree {
                x: i16::from_le_bytes([c[0], c[1]]) as f32 / 10.0,
                z: i16::from_le_bytes([c[2], c[3]]) as f32 / 10.0,
                h: c[4] as f32 / 4.0,
                r: c[5] as f32 / 4.0,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quadkeys_name_the_tiles() {
        // Mértola's tile, checked against the bucket
        assert_eq!(quadkey(245, 198), "033110321");
    }

    #[test]
    fn trees_survive_the_package() {
        let t = vec![Tree { x: -2999.9, z: 1234.5, h: 9.25, r: 4.0 }, Tree { x: 0.0, z: -0.1, h: 3.0, r: 1.5 }];
        assert_eq!(parse(&bytes(&t)), t);
    }
}
