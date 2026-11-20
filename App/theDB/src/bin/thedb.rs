//! theDB from the shell, for people and agents. Docs are reached by their ids only; a name is what a doc says it is.
//!
//!     thedb new <kind> <name> [file]   a new doc (with a file's content); prints its id
//!     thedb put <id> <file>            a file as doc <id>'s content
//!     thedb part <id> <part> <file>    a file as a part of doc <id>
//!     thedb cat <id> [hash]            doc <id>'s content now (or at the version <hash>)
//!     thedb ls                         every doc: id, current version, kind, name
//!     thedb head <id>                  the hash of doc <id>'s current version
//!     thedb root [<id>]                the root doc's id (or make <id> the root)
//!     thedb forget <id>                doc <id> is no longer reached (its versions stay)
//!     thedb publish <engine id> <tree id>                   a build of the engine from the tree on main; pins it
//!     thedb source <build hash> <dir>                       the source a build was made from, into <dir>
//!     thedb pin <engine id> <build hash>                    pins an earlier build
//!     thedb builds <engine id>                              the engine's builds, the pinned one marked
//!
//! Branches, source trees and merges (intent 0051). `THEDB_BRANCH=<name>` puts any process on a branch.
//!
//!     thedb branch <name> [about]       a new branch from main
//!     thedb branches                    every branch, and how many docs it changes
//!     thedb diff <branch>               the docs a branch changes: main's version → the branch's
//!     thedb tree <name> <shape json>    a new source tree: {"include":[…],"check":[…],"build":"…","binary":"…"}
//!     thedb shape <tree> [<shape json>] a tree's shape (or change it)
//!     thedb files <tree>                a tree's files and their docs
//!     thedb import <tree> <git dir>     the files git tracks under the tree's paths, as edits of the tree
//!     thedb mv <tree> <from> <to>       a path (a file or a folder) renamed in the tree, each file keeping its doc
//!     thedb checkout <tree> <dir>       the tree as the branch sees it, written into <dir>: a view
//!     thedb sync <dir>                  a view's edits into its branch (merged with the branch's), written back
//!     thedb propose <branch> <note>     a proposal to merge a branch into main
//!     thedb proposal <id>               a proposal's state and its check's output
//!     thedb merge <id>                  the merged tree checked; main moves only if it passes
//!     thedb snapshot <tree> <dir>       main's tree written into the git checkout, for a commit
//!
//! Finding docs (intent 0053): answered from SQLite, no doc is opened.
//!
//!     thedb find kind=<kind>            the docs of a kind
//!     thedb find name=<text>            the docs whose name has <text> in it
//!     thedb find words <text>           the docs whose name or text has every word of <text>
//!
//! What leaves the store's folder: the compost (deleted for good after 30 days) and the archive (kept).
//!
//!     thedb compost <path> <why>        a file or folder in the store's folder, into the compost
//!     thedb archive <path> <why>        the same, into the archive
//!     thedb compost                     what the compost holds, and when each goes
//!     thedb reach                       what the root reaches: what a clean store would hold
//!     thedb fresh <what begins>         a clean store of only what the root reaches, checked, put in place; the old
//!                                       store goes to the compost as "<day> the store before <what begins>"

use thedb::{Find, TheDB};
use thedb::source::{Shape, view_of};
use std::io::Write;
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut db = TheDB::open(TheDB::here()).unwrap_or_else(|e| fail(&e));
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
        ["publish", engine, tree] => {
            let h = db.publish_tree(engine, tree).unwrap_or_else(|e| fail(&e));
            println!("{h}");
        }
        ["source", build, dir] => eprintln!("{} files", db.checkout_build(build, Path::new(dir)).unwrap_or_else(|e| fail(&e))),
        ["pin", id, build] => db.pin(id, build).unwrap_or_else(|e| fail(&e)),
        ["builds", id] => {
            let e = db.engine(id).unwrap_or_else(|e| fail(&e));
            for b in &e.builds {
                let info = db.build(b).map(|x| x.toolchain).unwrap_or_default();
                println!("{} {b}  {info}", if e.pinned.as_deref() == Some(b) { "*" } else { " " });
            }
        }
        // ---- branches (intent 0051) ----
        ["branch", name, about @ ..] => db.make_branch(name, &about.join(" ")).unwrap_or_else(|e| fail(&e)),
        ["branches"] => {
            for b in db.branches().unwrap_or_else(|e| fail(&e)) {
                let n = db.changed_on(&b).map(|c| c.len()).unwrap_or(0);
                println!("{b}  {n} docs changed  {}", db.about(&b).unwrap_or_default());
            }
        }
        ["diff", branch] => {
            // a doc the branch made has its name on the branch only
            db.set_branch(Some(branch)).unwrap_or_else(|e| fail(&e));
            for (id, h) in db.changed_on(branch).unwrap_or_else(|e| fail(&e)) {
                let (kind, name) = db.meta(&id).unwrap_or_default();
                let main = db.head_on(None, &id).ok().flatten().map(|h| h.to_hex()[..12].to_string()).unwrap_or_else(|| "new".into());
                println!("{id}  {main} → {}  {kind:<8} {name}", &h.to_hex()[..12]);
            }
        }
        // ---- source trees, views, proposals (intent 0051) ----
        ["tree", name, shape] => {
            let shape: Shape = serde_json::from_str(shape).unwrap_or_else(|e| fail(&e.to_string()));
            println!("{}", db.new_tree(name, &shape).unwrap_or_else(|e| fail(&e)));
        }
        ["shape", tree] => println!("{}", serde_json::to_string_pretty(&db.tree(tree).unwrap_or_else(|e| fail(&e)).shape).unwrap()),
        ["shape", tree, shape] => {
            let shape: Shape = serde_json::from_str(shape).unwrap_or_else(|e| fail(&e.to_string()));
            db.set_shape(tree, &shape).unwrap_or_else(|e| fail(&e));
        }
        ["files", tree] => {
            for (path, id) in db.tree(tree).unwrap_or_else(|e| fail(&e)).files {
                println!("{id}  {path}");
            }
        }
        ["import", tree, dir] => {
            let shape = db.tree(tree).unwrap_or_else(|e| fail(&e)).shape;
            let paths = tracked(Path::new(dir), &shape.include);
            report(db.import(tree, Path::new(dir), &paths).unwrap_or_else(|e| fail(&e)));
        }
        ["mv", tree, from, to] => eprintln!("{} files moved", db.mv(tree, from, to).unwrap_or_else(|e| fail(&e))),
        ["checkout", tree, dir] => {
            db.checkout(tree, Path::new(dir)).unwrap_or_else(|e| fail(&e));
            eprintln!("{dir}: a view of {tree} on {}", db.branch().unwrap_or("main"));
        }
        ["sync", dir] => {
            let (_, branch) = view_of(Path::new(dir)).unwrap_or_else(|e| fail(&e));
            db.set_branch(branch.as_deref()).unwrap_or_else(|e| fail(&e));
            report(db.sync(Path::new(dir)).unwrap_or_else(|e| fail(&e)));
        }
        ["propose", branch, note @ ..] => println!("{}", db.propose(branch, &note.join(" ")).unwrap_or_else(|e| fail(&e))),
        ["proposal", id] => {
            let p = db.proposal(id).unwrap_or_else(|e| fail(&e));
            println!("{:?}  {}  from {}  ({} docs)", p.state, p.note, p.branch, p.docs.len());
            println!("{}", db.proposal_output(id).unwrap_or_default());
        }
        ["merge", id] => {
            let merged = db.merge(id).unwrap_or_else(|e| fail(&e));
            println!("{}", db.proposal_output(id).unwrap_or_default());
            if !merged {
                fail("refused: the merged tree does not pass its check; main is unchanged");
            }
            eprintln!("merged into main");
        }
        ["snapshot", tree, dir] => eprintln!("{} files written", db.snapshot(tree, Path::new(dir)).unwrap_or_else(|e| fail(&e))),
        ["root"] => println!("{}", db.root().unwrap_or_else(|e| fail(&e)).unwrap_or_default()),
        ["root", id] => db.set_root(id).unwrap_or_else(|e| fail(&e)),
        ["forget", id] => db.forget(id).unwrap_or_else(|e| fail(&e)),
        // ---- finding docs (intent 0053) ----
        ["find", "words", text @ ..] if !text.is_empty() => found(db.find(Find::Words(&text.join(" "))).unwrap_or_else(|e| fail(&e))),
        ["find", by] if by.starts_with("kind=") => found(db.find(Find::Kind(&by[5..])).unwrap_or_else(|e| fail(&e))),
        ["find", by @ ..] if by.first().is_some_and(|b| b.starts_with("name=")) => found(db.find(Find::Name(&by.join(" ")[5..])).unwrap_or_else(|e| fail(&e))),
        // ---- the compost, the archive, a clean store ----
        ["compost"] => {
            let now = std::time::SystemTime::now();
            let held = db.composted();
            for e in &held {
                let goes = e.goes.map(|g| format!("goes {} (in {} days)", thedb::compost::day(g), thedb::compost::days_left(g, now))).unwrap_or_else(|| "undated: stays until moved by hand".into());
                println!("{}  {}  {goes}  {}", e.folder, size(e.bytes), e.why);
            }
            eprintln!("{} in the compost", held.len());
        }
        ["compost", path, why @ ..] if !why.is_empty() => println!("{}", db.compost(path, &why.join(" ")).unwrap_or_else(|e| fail(&e)).display()),
        ["archive", path, why @ ..] if !why.is_empty() => println!("{}", db.archive(path, &why.join(" ")).unwrap_or_else(|e| fail(&e)).display()),
        ["reach"] => {
            let r = db.reach().unwrap_or_else(|e| fail(&e));
            for (id, h) in &r.docs {
                let (kind, name) = db.meta(id).unwrap_or_default();
                println!("doc      {id}  {}  {kind:<8} {name}", &h.to_hex()[..12]);
            }
            for (h, id) in &r.versions {
                println!("version  {}  of {id}", &h.to_hex()[..12]);
            }
            for (h, bytes) in &r.blobs {
                println!("blob     {}  {}", &h.to_hex()[..12], size(*bytes));
            }
            let all = db.docs().map(|d| d.len()).unwrap_or(0);
            eprintln!("the root reaches {} of {all} docs, {} other versions, {} blobs ({})", r.docs.len(), r.versions.len(), r.blobs.len(), size(r.blobs.values().sum()));
        }
        ["fresh", why @ ..] if !why.is_empty() => {
            let f = db.fresh(&why.join(" ")).unwrap_or_else(|e| fail(&e));
            println!("a clean store: {} docs, {} blobs, {} (before: {}; {} docs were not reached)", f.docs, f.blobs, size(f.after), size(f.before), f.left_docs);
            println!("the old store: {}", f.composted.display());
        }
        _ => fail("usage: thedb new <kind> <name> [file] | put <id> <file> | part <id> <part> <file> | cat <id> [hash] | ls | head <id> | root [<id>] | forget <id> | find kind=<k> | find name=<text> | find words <text> | compost [<path> <why>] | archive <path> <why> | reach | fresh <what begins> (and the branch, tree and build commands: see the top of thedb.rs)"),
    }
}

/// The files git tracks under `include` in the checkout `dir`: what an import brings in.
fn tracked(dir: &Path, include: &[String]) -> Vec<String> {
    let out = std::process::Command::new("git").arg("-C").arg(dir).args(["ls-files", "-z", "--"]).args(include).output().unwrap_or_else(|e| fail(&e.to_string()));
    if !out.status.success() {
        fail(&String::from_utf8_lossy(&out.stderr));
    }
    out.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()).map(|p| String::from_utf8_lossy(p).into_owned()).collect()
}

fn report(s: thedb::source::Synced) {
    for (what, list) in [("edited", &s.edited), ("added", &s.added), ("removed", &s.removed)] {
        for p in list {
            eprintln!("{what:<8} {p}");
        }
    }
    eprintln!("{} edited, {} added, {} removed", s.edited.len(), s.added.len(), s.removed.len());
}

fn found(list: Vec<thedb::Found>) {
    for f in &list {
        println!("{}  {:<8} {}", f.id, f.kind, f.name);
    }
    eprintln!("{} found", list.len());
}

/// Bytes, as a person reads them.
fn size(bytes: u64) -> String {
    match bytes {
        b if b >= 1 << 30 => format!("{:.1} GB", b as f64 / (1u64 << 30) as f64),
        b if b >= 1 << 20 => format!("{:.1} MB", b as f64 / (1u64 << 20) as f64),
        b if b >= 1 << 10 => format!("{:.1} kB", b as f64 / 1024.0),
        b => format!("{b} B"),
    }
}


fn out(bytes: Vec<u8>) {
    let _ = std::io::stdout().write_all(&bytes);
}

fn fail(e: &str) -> ! {
    eprintln!("thedb: {e}");
    std::process::exit(1)
}
