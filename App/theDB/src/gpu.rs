//! The GPU's lock and its queue, as `TheGame/tools/gpu/lock.js` keeps them (intent 0038), so a bake waits behind the
//! gate, the walk and every other run that draws on this machine, and they behind it. The same files, read and written
//! the same way:
//!   - `.gate-lock/`, the lock: made by the one who takes it (making a directory is atomic: one maker wins), with
//!     `holder.json` in it: owner, what, since, a token, and the processes whose life holds it (`by`);
//!   - `.gate-queue.d/`, the queue: a ticket a waiting run, named by when it asked, so the oldest goes first.
//! A holder whose processes are all gone holds nothing: the first in line takes the lock back. A lock with no
//! `holder.json` (a run from before the tool, or one being taken) is waited for, never taken back. Both stand in
//! `GPU_LOCK_DIR`, else the folder that holds the repository's main checkout. A process run under a hold
//! (`GPU_LOCK_TOKEN` naming the holder's token) holds it already and never waits for itself.

use crate::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// How often a waiting run looks at the line: two looks a second, as lock.js.
const LOOK: std::time::Duration = std::time::Duration::from_millis(500);

/// A process, told from a later one given the same pid by when it started.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Proc {
    pub pid: u32,
    pub start: String,
}

impl Proc {
    /// Process `pid` as it is now.
    pub fn of(pid: u32) -> Self {
        Proc { pid, start: start_of(pid) }
    }
    /// Whether it is still the process it was: there, and started when it did.
    pub fn alive(&self) -> bool {
        self.pid != 0 && start_of(self.pid) == self.start
    }
}

/// When a process started ('' where it is gone), as `ps` says it: the words lock.js compares.
fn start_of(pid: u32) -> String {
    std::process::Command::new("ps")
        .args(["-o", "lstart=", "-p", &pid.to_string()])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

#[derive(Serialize, Deserialize, Debug)]
struct Holder {
    owner: String,
    what: String,
    since: Option<String>,
    token: String,
    by: Vec<Proc>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Ticket {
    owner: String,
    what: String,
    since: String,
    first: bool,
    pid: u32,
    start: String,
}

/// The folder the lock and its queue stand in: `GPU_LOCK_DIR`, else the one holding the repository's main checkout.
pub fn shared() -> PathBuf {
    if let Ok(d) = std::env::var("GPU_LOCK_DIR") {
        return d.into();
    }
    let main = crate::main_checkout(Path::new(env!("CARGO_MANIFEST_DIR")));
    main.parent().map(Path::to_path_buf).unwrap_or(main)
}

/// The lock, held: let go when dropped (where this run still holds it).
pub struct Hold {
    lock: PathBuf,
    token: Option<String>,
}

impl Hold {
    /// The token a command run under this hold is given (`GPU_LOCK_TOKEN`), so it never waits for its own lock.
    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    /// Adds `pid` to the processes whose life holds the lock, so a command outliving this process still holds it.
    pub fn held_by(&self, pid: u32) {
        let Some(token) = &self.token else { return };
        let file = self.lock.join("holder.json");
        if let Some(mut h) = read::<Holder>(&file)
            && &h.token == token
        {
            h.by.push(Proc::of(pid));
            let _ = std::fs::write(&file, serde_json::to_vec(&h).unwrap_or_default());
        }
    }
}

impl Drop for Hold {
    fn drop(&mut self) {
        if let Some(token) = &self.token
            && read::<Holder>(&self.lock.join("holder.json")).is_some_and(|h| &h.token == token)
        {
            let _ = std::fs::remove_dir_all(&self.lock);
        }
    }
}

/// Waits its turn in `dir`'s queue and takes the lock, for `what`, in `owner`'s name; at once where this process runs
/// under a hold already. Says on stderr what it waits for, when that changes.
pub fn take(dir: &Path, owner: &str, what: &str) -> Result<Hold> {
    let lock = dir.join(".gate-lock");
    let holder_file = lock.join("holder.json");
    if let Ok(under) = std::env::var("GPU_LOCK_TOKEN")
        && read::<Holder>(&holder_file).is_some_and(|h| h.token == under)
    {
        return Ok(Hold { lock, token: None });
    }
    let queue = dir.join(".gate-queue.d");
    std::fs::create_dir_all(&queue).map_err(|e| e.to_string())?;
    let me = Proc::of(std::process::id());
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    // a name of its own even for two asks in one millisecond from one process (lock.js asks once a process)
    let mut name = format!("{ms:014}-{}.json", me.pid);
    let mut n = 0;
    let ticket = loop {
        let path = queue.join(&name);
        let t = Ticket { owner: owner.into(), what: what.into(), since: now(), first: false, pid: me.pid, start: me.start.clone() };
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(f) => {
                serde_json::to_writer(f, &t).map_err(|e| e.to_string())?;
                break path;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                n += 1;
                name = format!("{ms:014}-{}.{n}.json", me.pid);
            }
            Err(e) => return Err(e.to_string()),
        }
    };
    let token = format!("{}-{ms}-{n}", me.pid);
    let mine = name;
    let mut told = String::new();
    let result = loop {
        let mut ahead: Vec<(String, Ticket)> = Vec::new();
        let mut names: Vec<String> = std::fs::read_dir(&queue)
            .map(|r| r.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.ends_with(".json")).collect())
            .unwrap_or_default();
        names.sort();
        for n in names.into_iter().filter(|n| *n < mine) {
            let Some(t) = read::<Ticket>(&queue.join(&n)) else { continue };
            if (Proc { pid: t.pid, start: t.start.clone() }).alive() {
                ahead.push((n, t));
            } else {
                let _ = std::fs::remove_file(queue.join(&n));
            }
        }
        if ahead.is_empty() && free(&lock) && grab(&lock, Holder { owner: owner.into(), what: what.into(), since: Some(now()), token: token.clone(), by: vec![me.clone()] }) {
            break Ok(Hold { lock: lock.clone(), token: Some(token) });
        }
        let waits = match ahead.first() {
            Some((_, t)) => format!("{} before it, first {}", ahead.len(), t.owner),
            None => format!("held by {}", read::<Holder>(&holder_file).map(|h| h.owner).unwrap_or_else(|| "(being let go)".into())),
        };
        if waits != told {
            eprintln!("  (gpu lock: {owner} waits: {waits})");
            told = waits;
        }
        std::thread::sleep(LOOK);
    };
    let _ = std::fs::remove_file(&ticket);
    result
}

/// Whether the lock can be taken: free, or held by processes all gone (then taken back).
fn free(lock: &Path) -> bool {
    if !lock.exists() {
        return true;
    }
    match read::<Holder>(&lock.join("holder.json")) {
        Some(h) if !h.by.iter().any(Proc::alive) => {
            let _ = std::fs::remove_dir_all(lock);
            true
        }
        _ => false,
    }
}

/// The lock made (one maker wins) and its holder written into it: whether this run made it.
fn grab(lock: &Path, holder: Holder) -> bool {
    if std::fs::create_dir(lock).is_err() {
        return false;
    }
    std::fs::write(lock.join("holder.json"), serde_json::to_vec(&holder).unwrap_or_default()).is_ok()
}

fn read<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

/// Now, as an ISO 8601 time in UTC (what lock.js writes with `toISOString`).
fn now() -> String {
    let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let (secs, ms) = (d.as_secs() as i64, d.subsec_millis());
    let (days, rest) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    // the civil date of a day count (Howard Hinnant's algorithm)
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{ms:03}Z", rest / 3600, rest % 3600 / 60, rest % 60)
}
