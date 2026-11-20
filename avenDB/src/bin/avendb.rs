//! avenDB from the shell, for people and agents. Docs are reached by their ids only; a name is what a doc says it is.
//!
//!     avendb new <kind> <name> [file]   a new doc (with a file's content); prints its id
//!     avendb put <id> <file>            a file as doc <id>'s content
//!     avendb part <id> <part> <file>    a file as a part of doc <id>
//!     avendb cat <id> [hash]            doc <id>'s content now (or at the version <hash>)
//!     avendb ls                         every doc: id, current version, kind, name
//!     avendb head <id>                  the hash of doc <id>'s current version
//!     avendb root [<id>]                the root doc's id (or make <id> the root)
//!     avendb forget <id>                doc <id> is no longer reached (its versions stay)
//!     avendb publish <engine id> <binary> <source dir>...   a build of the engine, with its source tree; pins it
//!     avendb pin <engine id> <build hash>                    pins an earlier build
//!     avendb builds <engine id>                              the engine's builds, the pinned one marked
//!     avendb bake <asset id>                                 the kernel's baker on one asset, by hand; waits its turn

use avendb::AvenDb;
use std::io::Write;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let db = AvenDb::open(AvenDb::here()).unwrap_or_else(|e| fail(&e));
    let words: Vec<&str> = args.iter().map(String::as_str).collect();
    match words.as_slice() {
        ["new", kind, name] => println!("{}", db.new(kind, name).unwrap_or_else(|e| fail(&e))),
        ["new", kind, name, file] => {
            let id = db.new(kind, name).unwrap_or_else(|e| fail(&e));
            let bytes = std::fs::read(file).unwrap_or_else(|e| fail(&e.to_string()));
            db.set_file(&id, &bytes).unwrap_or_else(|e| fail(&e));
            println!("{id}");
        }
        ["put", id, file] => {
            let bytes = std::fs::read(file).unwrap_or_else(|e| fail(&e.to_string()));
            println!("{}", db.set_file(id, &bytes).unwrap_or_else(|e| fail(&e)));
        }
        ["cat", id] => out(db.file(id).unwrap_or_else(|e| fail(&e)).unwrap_or_else(|| fail(&format!("no doc {id}")))),
        ["cat", _id, hash] => out(db.file_at(hash.parse().unwrap_or_else(|_| fail("not a hash"))).unwrap_or_else(|e| fail(&e))),
        ["part", id, name, file] => {
            let bytes = std::fs::read(file).unwrap_or_else(|e| fail(&e.to_string()));
            println!("{}", db.set_part(id, name, &bytes).unwrap_or_else(|e| fail(&e)));
        }
        ["ls"] => {
            for (id, h) in db.docs().unwrap_or_else(|e| fail(&e)) {
                let (kind, name) = db.meta(&id).unwrap_or_default();
                println!("{id}  {}  {kind:<8} {name}", &h.to_hex()[..12]);
            }
        }
        ["head", id] => println!("{}", db.head(id).unwrap_or_else(|e| fail(&e)).map(|h| h.to_string()).unwrap_or_default()),
 ["publish", id, binary, dirs @ ..] if !dirs.is_empty() => {
            let bin = std::fs::read(binary).unwrap_or_else(|e| fail(&e.to_string()));
            let mut source = Vec::new();
            for d in dirs {
                let root = std::path::Path::new(d);
                for f in walk(root) {
                    let rel = f.strip_prefix(root.parent().unwrap_or(root)).unwrap_or(&f).to_string_lossy().into_owned();
                    source.push((rel, std::fs::read(&f).unwrap_or_default()));
                }
            }
            let toolchain = std::process::Command::new("rustc").arg("-V").output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
            let h = db.publish(id, &bin, &source, &toolchain).unwrap_or_else(|e| fail(&e));
            eprintln!("{} source files, {} MB binary, {toolchain}", source.len(), bin.len() / 1_000_000);
            println!("{h}");
        }
        ["pin", id, build] => db.pin(id, build).unwrap_or_else(|e| fail(&e)),
        ["builds", id] => {
            let e = db.engine(id).unwrap_or_else(|e| fail(&e));
            for b in &e.builds {
                let info = db.build(b).map(|x| x.toolchain).unwrap_or_default();
                println!("{} {b}  {info}", if e.pinned.as_deref() == Some(b) { "*" } else { " " });
            }
        }
        ["bake", id] => avendb::baker::bake(&db, id).unwrap_or_else(|e| fail(&e)),
        ["root"] => println!("{}", db.root().unwrap_or_else(|e| fail(&e)).unwrap_or_default()),
        ["root", id] => db.set_root(id).unwrap_or_else(|e| fail(&e)),
        ["forget", id] => db.forget(id).unwrap_or_else(|e| fail(&e)),
        _ => fail("usage: avendb new <kind> <name> [file] | put <id> <file> | part <id> <part> <file> | cat <id> [hash] | ls | head <id> | root [<id>] | forget <id> | bake <asset id>"),
    }
}

/// Every file under `dir`, but build output and hidden folders.
fn walk(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(dir).map(|r| r.flatten().map(|e| e.path()).collect()).unwrap_or_default();
    entries.sort();
    for p in entries {
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name.starts_with('.') || name == "target" {
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
