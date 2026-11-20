//! The GPU lock, as `TheGame/tools/gpu/lock.js` keeps it: a live holder is waited for, a dead one taken back, a lock
//! with no holder written waited for, and the lock let go when its hold ends.

use thedb::gpu;
use std::sync::mpsc;
use std::time::Duration;

fn fresh(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("thedb-test-gpu-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn held(dir: &std::path::Path, by: serde_json::Value) {
    std::fs::create_dir_all(dir.join(".gate-lock")).unwrap();
    let h = serde_json::json!({ "owner": "someone", "what": "a run", "since": "2026-11-20T00:00:00.000Z", "token": "theirs", "by": by });
    std::fs::write(dir.join(".gate-lock/holder.json"), h.to_string()).unwrap();
}

/// Takes the lock in a thread; says on the channel when it has it.
fn taker(dir: &std::path::Path) -> mpsc::Receiver<()> {
    let (tx, rx) = mpsc::channel();
    let dir = dir.to_path_buf();
    std::thread::spawn(move || {
        let hold = gpu::take(&dir, "test", "a test").unwrap();
        tx.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        drop(hold);
    });
    rx
}

#[test]
fn a_live_holder_is_waited_for_and_a_dead_one_taken_back() {
    let dir = fresh("live");
    let me = gpu::Proc::of(std::process::id());
    held(&dir, serde_json::json!([me]));
    let got = taker(&dir);
    assert!(got.recv_timeout(Duration::from_millis(1500)).is_err(), "a live holder is waited for");
    // the holder's processes gone: the lock is taken back
    held(&dir, serde_json::json!([{ "pid": me.pid, "start": "not when it started" }]));
    got.recv_timeout(Duration::from_secs(3)).expect("a dead holder holds nothing");
    std::thread::sleep(Duration::from_millis(500));
    assert!(!dir.join(".gate-lock").exists(), "let go when the hold ends");
    assert_eq!(std::fs::read_dir(dir.join(".gate-queue.d")).unwrap().count(), 0, "the ticket is gone");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_lock_with_no_holder_written_is_waited_for() {
    let dir = fresh("old");
    std::fs::create_dir_all(dir.join(".gate-lock")).unwrap();
    std::fs::write(dir.join(".gate-lock/owner"), "a run from before").unwrap();
    let got = taker(&dir);
    assert!(got.recv_timeout(Duration::from_millis(1500)).is_err(), "never taken back");
    std::fs::remove_dir_all(dir.join(".gate-lock")).unwrap();
    got.recv_timeout(Duration::from_secs(3)).expect("taken once it is let go");
    std::thread::sleep(Duration::from_millis(500));
    let _ = std::fs::remove_dir_all(dir);
}
