//! avenDB from the shell, for people and agents.
//!
//!     avendb import <dir> [prefix]   every file under <dir> as a doc, its id [prefix/]its path in <dir> (unchanged ones commit nothing)
//!     avendb put <id> <file>         a file as doc <id>
//!     avendb cat <id> [hash]         doc <id>'s file now (or at the version <hash>)
//!     avendb ls                      every doc and the hash of its current version
//!     avendb head <id>               the hash of doc <id>'s current version

use avendb::AvenDb;
use std::io::Write;
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let db = AvenDb::open(std::env::var("AVENDB").map(Into::into).unwrap_or_else(|_| AvenDb::here())).unwrap_or_else(|e| fail(&e));
    match args.iter().map(String::as_str).collect::<Vec<_>>()[..] {
        ["import", dir] | ["import", dir, _] => {
            let prefix = args.get(2).map(|p| format!("{}/", p.trim_end_matches('/'))).unwrap_or_default();
            let (mut n, mut changed) = (0, 0);
            for file in walk(Path::new(dir)) {
                let id = prefix.clone() + &file.strip_prefix(dir).unwrap().components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
                let before = db.head(&id).unwrap_or_else(|e| fail(&e));
                let bytes = std::fs::read(&file).unwrap_or_else(|e| fail(&e.to_string()));
                let after = db.set_file(&id, &bytes).unwrap_or_else(|e| fail(&e));
                n += 1;
                if before != Some(after) {
                    changed += 1;
                    println!("{after}  {id}");
                }
            }
            eprintln!("{n} files, {changed} new versions");
        }
        ["put", id, file] => {
            let bytes = std::fs::read(file).unwrap_or_else(|e| fail(&e.to_string()));
            println!("{}", db.set_file(id, &bytes).unwrap_or_else(|e| fail(&e)));
        }
        ["cat", id] => out(db.file(id).unwrap_or_else(|e| fail(&e)).unwrap_or_else(|| fail(&format!("no doc {id}")))),
        ["cat", _id, hash] => out(db.file_at(hash.parse().unwrap_or_else(|_| fail("not a hash"))).unwrap_or_else(|e| fail(&e))),
        ["ls"] => {
            for (id, h) in db.docs().unwrap_or_else(|e| fail(&e)) {
                println!("{h}  {id}");
            }
        }
        ["head", id] => println!("{}", db.head(id).unwrap_or_else(|e| fail(&e)).map(|h| h.to_string()).unwrap_or_default()),
        _ => fail("usage: avendb import <dir> | put <id> <file> | cat <id> [hash] | ls | head <id>"),
    }
}

fn walk(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(dir).map(|r| r.flatten().map(|e| e.path()).collect()).unwrap_or_default();
    entries.sort();
    for p in entries {
        if p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')) {
            continue;
        }
        if p.is_dir() {
            out.extend(walk(&p));
        } else {
            out.push(p);
        }
    }
    out
}

fn out(bytes: Vec<u8>) {
    let _ = std::io::stdout().write_all(&bytes);
}

fn fail(e: &str) -> ! {
    eprintln!("avendb: {e}");
    std::process::exit(1)
}
