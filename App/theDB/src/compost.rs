//! Where things go when they leave the store's folder: the **compost** and the **archive**.
//!
//! - The compost (`compost/`) holds what is on its way out. Each move gets a folder of its own, named by the day and
//!   what it is, with an `about.json` saying what was moved, why and when. `DAYS` days after the move the folder is
//!   deleted for good, by whichever process next opens the store (`sweep`). Until then, moving it back is a rename.
//! - The archive (`archive/`) is the same, kept for good: nothing here ever deletes from it.
//!
//! Only whole files and folders inside the store's folder are moved, by renaming, so a move costs nothing and is all
//! or nothing. The store's own files (the docs, the blobs) are not moved this way: `fresh` does that, once it has
//! made the store that takes their place.

use crate::{Result, TheDB, err};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The compost's folder in the store's folder. (German has "Papierkorb"; what is thrown here still turns into
/// something, so: compost. The name is here only.)
pub const COMPOST: &str = "compost";

/// The archive's folder in the store's folder.
pub const ARCHIVE: &str = "archive";

/// How many days a thing stays in the compost before it is deleted for good.
pub const DAYS: u64 = 30;

/// The file in each folder that says what it holds.
const ABOUT: &str = "about.json";

/// The store's own files, in its folder: never moved by `compost` or `archive`.
pub(crate) const STORE: &[&str] = &[crate::sql::FILE, "theDB.sqlite-wal", "theDB.sqlite-shm", "blobs.db", "data", "temp"];

/// What `about.json` says.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct About {
    /// What was moved: paths from the store's folder, as they were.
    what: Vec<String>,
    why: String,
    /// When, in seconds since 1970, and as a day.
    when: u64,
    day: String,
    /// The day it is deleted for good (the compost only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    goes: Option<String>,
}

/// One folder in the compost or the archive.
#[derive(Clone, Debug)]
pub struct Entry {
    /// The folder's name.
    pub folder: String,
    pub what: Vec<String>,
    pub why: String,
    /// When it was moved, in seconds since 1970.
    pub when: u64,
    /// When it is deleted for good, in seconds since 1970; none in the archive.
    pub goes: Option<u64>,
    /// How many bytes it holds.
    pub bytes: u64,
}

fn secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// The day (UTC) of `secs` since 1970, as `YYYY-MM-DD`.
pub fn day(secs: u64) -> String {
    // days since 1970 to a civil date (Howard Hinnant's algorithm): eras of 400 years, each starting on 1 March
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

/// How many bytes `path` holds: a file's, or everything under a folder.
pub fn bytes_of(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if meta.is_dir() {
        std::fs::read_dir(path).map(|rd| rd.flatten().map(|e| bytes_of(&e.path())).sum()).unwrap_or(0)
    } else {
        meta.len()
    }
}

/// A folder's name from words a person wrote: no path separators, nothing hidden, not too long.
fn label(words: &str) -> String {
    let clean: String = words.chars().map(|c| if c == '/' || c == '\\' || c == ':' || c.is_control() { ' ' } else { c }).collect();
    let clean = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    let clean: String = clean.trim_start_matches('.').chars().take(80).collect();
    if clean.is_empty() { "things".into() } else { clean }
}

/// Moves `paths` (each inside `dir`) into a new folder `<day> <what>` of `dir/<into>` (the compost or the archive),
/// with its `about.json`. Returns the folder. Nothing is copied: a move is a rename.
pub fn put_away(dir: &Path, into: &str, paths: &[PathBuf], what: &str, why: &str, now: SystemTime) -> Result<PathBuf> {
    let when = secs(now);
    let home = dir.join(into);
    std::fs::create_dir_all(&home).map_err(err)?;
    // a second move of the same name on the same day gets a number
    let name = format!("{} {}", day(when), label(what));
    let folder = (1..).map(|n| if n == 1 { home.join(&name) } else { home.join(format!("{name} {n}")) }).find(|p| !p.exists()).expect("a free name");
    std::fs::create_dir(&folder).map_err(err)?;
    let mut moved = Vec::new();
    for p in paths {
        let rel = p.strip_prefix(dir).map_err(|_| format!("{} is not in {}", p.display(), dir.display()))?;
        let to = folder.join(p.file_name().ok_or_else(|| format!("{}: no name", p.display()))?);
        std::fs::rename(p, &to).map_err(|e| format!("{}: {e}", p.display()))?;
        moved.push(rel.to_string_lossy().into_owned());
    }
    let about = About {
        what: moved,
        why: why.into(),
        when,
        day: day(when),
        goes: (into == COMPOST).then(|| day(when + DAYS * 86_400)),
    };
    std::fs::write(folder.join(ABOUT), serde_json::to_vec_pretty(&about).map_err(err)?).map_err(err)?;
    Ok(folder)
}

/// What `dir/<of>` holds (the compost or the archive), oldest first. A folder without a readable `about.json` is
/// listed with nothing known of it, and never deleted by `sweep`: what cannot be dated is not thrown away.
pub fn held(dir: &Path, of: &str) -> Vec<Entry> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir.join(of)) else { return out };
    for e in rd.flatten() {
        let path = e.path();
        if !path.is_dir() {
            continue;
        }
        let about: Option<About> = std::fs::read(path.join(ABOUT)).ok().and_then(|b| serde_json::from_slice(&b).ok());
        let folder = e.file_name().to_string_lossy().into_owned();
        out.push(match about {
            Some(a) => Entry { folder, what: a.what, why: a.why, when: a.when, goes: (of == COMPOST).then_some(a.when + DAYS * 86_400), bytes: bytes_of(&path) },
            None => Entry { folder, what: Vec::new(), why: String::new(), when: 0, goes: None, bytes: bytes_of(&path) },
        });
    }
    out.sort_by(|a, b| (a.when, &a.folder).cmp(&(b.when, &b.folder)));
    out
}

/// Deletes for good what has been in `dir`'s compost for `DAYS` days or longer at `now`. Returns the folders deleted.
/// The clock is given, so a test can let a month pass.
pub fn sweep(dir: &Path, now: SystemTime) -> Vec<String> {
    let now = secs(now);
    let mut gone = Vec::new();
    for e in held(dir, COMPOST) {
        if e.goes.is_some_and(|g| g <= now) && std::fs::remove_dir_all(dir.join(COMPOST).join(&e.folder)).is_ok() {
            gone.push(e.folder);
        }
    }
    gone
}

impl TheDB {
    /// `path` (inside the store's folder: from it, or whole) as a file or folder that may be moved away: it exists, is
    /// inside, and is neither the store's own files nor the compost or the archive themselves.
    fn movable(&self, path: &str) -> Result<PathBuf> {
        let dir = self.dir().canonicalize().map_err(err)?;
        let given = Path::new(path);
        let full = if given.is_absolute() { given.to_path_buf() } else { dir.join(given) };
        let full = full.canonicalize().map_err(|e| format!("{path}: {e}"))?;
        let rel = full.strip_prefix(&dir).map_err(|_| format!("{path} is not inside {}", dir.display()))?;
        let Some(first) = rel.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()) else {
            return Err("the store's folder itself is not moved".into());
        };
        if STORE.contains(&first.as_str()) || first.starts_with("rpc.") {
            return Err(format!("{path} is the store itself: `theDB fresh` makes a clean store and composts the old one"));
        }
        if rel.components().count() == 1 && (first == COMPOST || first == ARCHIVE) {
            return Err(format!("{path} is where things are moved to"));
        }
        Ok(full)
    }

    /// Moves `path` (a file or folder in the store's folder) into the compost, saying `why`. It is deleted for good
    /// `DAYS` days from now. Returns the folder it is in until then.
    pub fn compost(&self, path: &str, why: &str) -> Result<PathBuf> {
        let full = self.movable(path)?;
        let what = full.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        put_away(&self.dir().canonicalize().map_err(err)?, COMPOST, &[full], &what, why, SystemTime::now())
    }

    /// Moves `path` (a file or folder in the store's folder) into the archive, saying `why`: kept for good.
    pub fn archive(&self, path: &str, why: &str) -> Result<PathBuf> {
        let full = self.movable(path)?;
        let what = full.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        put_away(&self.dir().canonicalize().map_err(err)?, ARCHIVE, &[full], &what, why, SystemTime::now())
    }

    /// What the compost holds, oldest first, and when each goes.
    pub fn composted(&self) -> Vec<Entry> {
        held(self.dir(), COMPOST)
    }

    /// What the archive holds, oldest first.
    pub fn archived(&self) -> Vec<Entry> {
        held(self.dir(), ARCHIVE)
    }
}

/// How long until `goes`, from `now`, in whole days (rounded up); 0 once it is due.
pub fn days_left(goes: u64, now: SystemTime) -> u64 {
    Duration::from_secs(goes.saturating_sub(secs(now))).as_secs().div_ceil(86_400)
}
