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
//!     avendb publish <engine id> <tree id>                   a build of the engine from the tree on main; pins it
//!     avendb source <build hash> <dir>                       the source a build was made from, into <dir>
//!     avendb pin <engine id> <build hash>                    pins an earlier build
//!     avendb builds <engine id>                              the engine's builds, the pinned one marked
//!
//! Branches, source trees and merges (intent 0051). `AVENDB_BRANCH=<name>` puts any process on a branch.
//!
//!     avendb branch <name> [about]       a new branch from main
//!     avendb branches                    every branch, and how many docs it changes
//!     avendb diff <branch>               the docs a branch changes: main's version → the branch's
//!     avendb tree <name> <shape json>    a new source tree: {"include":[…],"check":[…],"build":"…","binary":"…"}
//!     avendb shape <tree> [<shape json>] a tree's shape (or change it)
//!     avendb files <tree>                a tree's files and their docs
//!     avendb import <tree> <git dir>     the files git tracks under the tree's paths, as edits of the tree
//!     avendb checkout <tree> <dir>       the tree as the branch sees it, written into <dir>: a view
//!     avendb sync <dir>                  a view's edits into its branch (merged with the branch's), written back
//!     avendb propose <branch> <note>     a proposal to merge a branch into main
//!     avendb proposal <id>               a proposal's state and its check's output
//!     avendb merge <id>                  the merged tree checked; main moves only if it passes
//!     avendb snapshot <tree> <dir>       main's tree written into the git checkout, for a commit

use avendb::AvenDb;
use avendb::source::{Shape, view_of};
use std::io::Write;
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut db = AvenDb::open(AvenDb::here()).unwrap_or_else(|e| fail(&e));
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
        _ => fail("usage: avendb new <kind> <name> [file] | put <id> <file> | part <id> <part> <file> | cat <id> [hash] | ls | head <id> | root [<id>] | forget <id>"),
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

fn report(s: avendb::source::Synced) {
    for (what, list) in [("edited", &s.edited), ("added", &s.added), ("removed", &s.removed)] {
        for p in list {
            eprintln!("{what:<8} {p}");
        }
    }
    eprintln!("{} edited, {} added, {} removed", s.edited.len(), s.added.len(), s.removed.len());
}

fn out(bytes: Vec<u8>) {
    let _ = std::io::stdout().write_all(&bytes);
}

fn fail(e: &str) -> ! {
    eprintln!("avendb: {e}");
    std::process::exit(1)
}
