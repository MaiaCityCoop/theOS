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
//!     thedb publish <engine id> <git checkout>              a build of the engine from a clean commit, proposed
//!     thedb source <build hash> <dir>                       the source a build was made from, into <dir>
//!     thedb pin <engine id> <build hash>                    proposes running an earlier build again
//!     thedb builds <engine id>                              the engine's builds, the pinned one marked
//!
//! Branches and merges of content (the engine's source lives in git, intent 0054). `THEDB_BRANCH=<name>` puts any
//! process on a branch.
//!
//!     thedb branch <name> [about]       a new branch from main
//!     thedb branches                    every branch, and how many docs it changes
//!     thedb diff <branch>               the docs a branch changes: main's version → the branch's
//!     thedb sync <line>                 main brought into a line; prints the conflicts that settled, to check
//!
//! Intents (intent 0059): every piece of work, draft → building → checked → proposal → merged | refused. An agent
//! works on its line (`THEDB_BRANCH`); its owner accepts or refuses in theOS only. `--json` after any of these prints
//! what it read as JSON, for agents.
//!
//!     thedb intents [open|done|all]     every intent on every line and on main (open by default)
//!     thedb intent <id>                 one intent: its why, when it is done, its tasks, its conflicts with main
//!     thedb intent new <title> [--why <text>] [--done <text>]
//!                                       a new intent in draft, on this process's line (on main without one)
//!     thedb intent take <id>            this process's line takes up an intent (building)
//!     thedb intent task <id> <text>     a task added to its board
//!     thedb intent tick <id> <n>        task n done (untick: `untick`)
//!     thedb intent building <id> [why]  back to building, and why (also: `draft`)
//!     thedb intent ready <id>           the line's changes taken as they are, and it waits for its owner (proposal)
//!     thedb intents from <store dir>    the intents of an older store (composted, archived) onto main, as they stood
//!
//! Who may write (intents 0054, 0059; keys, signatures and grants are theID's). A store has one owner, who owns main;
//! theOS's host writes main by its grant, and every merge is signed by the owner, its key unlocked by the person (Touch
//! ID on a Mac). An agent (`THEOS_AGENT=<name>`, `THEDB_BRANCH=line-<name>`) writes its own line with its own key.
//!
//!     thedb owner                       the store's owner and host, whether merges are the owner's, and who this is
//!     thedb owner init                  a new owner: its key locked on this device (Touch ID), shown once to keep in
//!                                       a password manager; every head as it is now signed by it; a host made
//!     thedb owner protect               the owner's key this device kept unlocked (before 0059: the master's) locked
//!                                       with Touch ID, the unlocked copy removed; the build pinned now let run; from
//!                                       then on every merge is the owner's
//!     thedb owner restore               the same, with the owner's key read from the input (its backup)
//!     thedb owner pin                   the owner lets the kernel run the build pinned now (Touch ID)
//!     thedb agent <name> [days]         a new agent: its key kept on this device, the owner's grant of line-<name>
//!     thedb verify                      every signature, and every head signed by whom its branch allows
//!
//! Locks: the system at a version (lock.rs). `THEDB_LOCK=<hash>` opens any process at one, read only.
//!
//!     thedb lock                        everything the root reaches, each doc at its version, signed: prints its hash
//!     thedb lock <hash>                 what a lock pins, its signature checked
//!
//! Vibes: one manifest kind for everything opened as a whole (vibe.rs).
//!
//!     thedb vibe schema                 the vibe schema, kept as a blob; prints its hash (name it on every vibe)
//!     thedb vibe <id>[@<version>]       the vibe and everything it is made of; fails if anything is missing
//!
//! Modules (intent 0054): code that is content. A module doc's text is one Rust file; built, it is its part `wasm`.
//!
//!     thedb module build <id>           the module built into WebAssembly, kept as its part `wasm` (on this branch)
//!
//! Schemas (intent 0056): a JSON Schema kept as a blob, named by its hash; a doc that names one is checked on every
//! commit.
//!
//!     thedb schema put <file>           a schema, checked against JSON Schema's meta-schema; prints its hash
//!     thedb schema set <id> <hash|none> doc <id> names that schema from now on (checked against it at once)
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
        ["publish", engine, repo] => {
            let (h, proposal) = db.publish_git(engine, Path::new(repo)).unwrap_or_else(|e| fail(&e));
            println!("{h}\nproposed as {proposal}: theOS runs it once it is accepted under the star");
        }
        ["source", build, dir] => eprintln!("{} files", db.checkout_build(build, Path::new(dir)).unwrap_or_else(|e| fail(&e))),
        ["pin", id, build] => println!("proposed as {}: accepted under the star, theOS runs it", db.pin(id, build).unwrap_or_else(|e| fail(&e))),
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
        // ---- intents ----
        ["intents", "from", dir] => println!("{} intents brought onto main", db.intents_from(Path::new(dir)).unwrap_or_else(|e| fail(&e))),
        ["intents", rest @ ..] if rest.len() <= 2 => {
            let json = rest.contains(&"--json");
            let which = rest.iter().find(|w| **w != "--json").copied().unwrap_or("open");
            let all: Vec<_> = db
                .intents()
                .unwrap_or_else(|e| fail(&e))
                .into_iter()
                .filter(|(_, i)| match which {
                    "open" => i.state.is_open(),
                    "done" => !i.state.is_open(),
                    "all" => true,
                    w => fail(&format!("open, done or all, not {w}")),
                })
                .collect();
            if json {
                let list: Vec<_> = all.iter().map(|(id, i)| serde_json::json!({ "id": id, "intent": i })).collect();
                println!("{}", serde_json::to_string_pretty(&list).unwrap_or_default());
            } else {
                for (id, i) in all {
                    let done = i.tasks.iter().filter(|t| t.done).count();
                    println!("{id}  {:<8}  {}  on {}  ({done}/{} tasks, {} docs)", i.state.name(), i.title, i.line.as_deref().unwrap_or("main"), i.tasks.len(), i.docs.len());
                }
            }
        }
        ["intent", "new", rest @ ..] => {
            let (mut title, mut why, mut done) = (Vec::new(), String::new(), String::new());
            let mut it = rest.iter();
            while let Some(w) = it.next() {
                match *w {
                    "--why" => why = it.next().unwrap_or_else(|| fail("--why <text>")).to_string(),
                    "--done" => done = it.next().unwrap_or_else(|| fail("--done <text>")).to_string(),
                    w => title.push(w),
                }
            }
            let line = db.branch().map(str::to_string);
            println!("{}", db.intent_new(line.as_deref(), &title.join(" "), &why, &done).unwrap_or_else(|e| fail(&e)));
        }
        ["intent", "take", id] => {
            let line = db.branch().map(str::to_string).unwrap_or_else(|| fail("a line takes up an intent: THEDB_BRANCH=line-<agent>"));
            db.intent_take(id, &line).unwrap_or_else(|e| fail(&e));
        }
        ["intent", "task", id, text @ ..] if !text.is_empty() => println!("{}", db.intent_task(id, &text.join(" ")).unwrap_or_else(|e| fail(&e))),
        ["intent", tick @ ("tick" | "untick"), id, n] => {
            let n = n.parse().unwrap_or_else(|_| fail("a task's number"));
            db.intent_tick(id, n, *tick == "tick").unwrap_or_else(|e| fail(&e));
        }
        ["intent", state @ ("building" | "draft"), id, why @ ..] => {
            let state = if *state == "draft" { thedb::intents::State::Draft } else { thedb::intents::State::Building };
            let why = why.join(" ");
            db.intent_state(id, state, (!why.is_empty()).then_some(why.as_str())).unwrap_or_else(|e| fail(&e));
        }
        ["intent", "ready", id] => db.intent_ready(id).unwrap_or_else(|e| fail(&e)),
        ["intent", id, rest @ ..] if rest.len() <= 1 => {
            let i = db.intent(id).unwrap_or_else(|e| fail(&e));
            let conflicts: Vec<String> = if i.state.is_open() { match db.intent_conflicts(id) { Ok(c) => c.iter().map(|c| c.to_string()).collect(), Err(e) => vec![e] } } else { vec![] };
            if rest.first() == Some(&"--json") {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({ "id": id, "intent": i, "conflicts": conflicts })).unwrap_or_default());
            } else {
                println!("{}  ({}, on {})", i.title, i.state.name(), i.line.as_deref().unwrap_or("main"));
                if !i.why.is_empty() {
                    println!("why: {}", i.why);
                }
                if !i.done_when.is_empty() {
                    println!("done when: {}", i.done_when);
                }
                if let Some(r) = &i.reason {
                    println!("back to building: {r}");
                }
                for (n, t) in i.tasks.iter().enumerate() {
                    println!("  {} {}. {}", if t.done { "[x]" } else { "[ ]" }, n + 1, t.text);
                }
                println!("{} docs", i.docs.len());
                for c in conflicts {
                    println!("  CONFLICT {c}");
                }
            }
        }
        ["sync", branch] => {
            let settled = db.sync_line(branch).unwrap_or_else(|e| fail(&e));
            for c in &settled {
                println!("  settled by Loro's order, check it: {c}");
            }
            println!("main brought into {branch}; {} conflicts to look at", settled.len());
        }
        ["lock"] => println!("{}", db.lock().unwrap_or_else(|e| fail(&e))),
        ["lock", hash] => {
            let pins = db.read_lock(hash.parse().unwrap_or_else(|_| fail("not a hash"))).unwrap_or_else(|e| fail(&e));
            println!("root {}\nvibe {}\n{} docs, {} blobs, signature good", pins.root, pins.vibe.unwrap_or_default(), pins.docs.len(), pins.blobs.len());
        }
        ["vibe", "schema"] => println!("{}", db.vibe_schema().unwrap_or_else(|e| fail(&e))),
        ["vibe", reference] => {
            let tree = db.tree(reference).unwrap_or_else(|e| fail(&e));
            let mut lines = Vec::new();
            tree.lines(0, &mut lines);
            println!("{}", lines.join("\n"));
            let missing = tree.missing();
            if !missing.is_empty() {
                fail(&format!("{} missing", missing.len()));
            }
        }
        ["module", "build", id] => println!("{}", db.build_module(id).unwrap_or_else(|e| fail(&e))),
        ["schema", "put", file] => {
            let bytes = std::fs::read(file).unwrap_or_else(|e| fail(&e.to_string()));
            println!("{}", db.put_schema(&bytes).unwrap_or_else(|e| fail(&e)));
        }
        ["schema", "set", id, hash] => {
            let h = if *hash == "none" { None } else { Some(hash.parse().unwrap_or_else(|_| fail("not a hash"))) };
            println!("{}", db.set_schema(id, h).unwrap_or_else(|e| fail(&e)));
        }
        ["owner"] => match db.owner().unwrap_or_else(|e| fail(&e)) {
            Some(o) => {
                println!("owner {o}");
                match db.host().unwrap_or_else(|e| fail(&e)) {
                    Some((h, _)) => println!("host {h}"),
                    None => println!("no host yet: theOS makes it when it starts (the owner's key, unlocked once)"),
                }
                if db.owner_signs().unwrap_or_else(|e| fail(&e)) {
                    println!("every merge, and every build the kernel runs, is the owner's (Touch ID)");
                } else {
                    println!("merges need only theOS's host key: `theDB owner protect` makes them the owner's");
                }
                println!("this process signs as {}", db.signer().map(|k| k.to_string()).unwrap_or_else(|| "nobody (no key on this device)".into()));
            }
            None => println!("no owner: nothing is signed (theDB owner init)"),
        },
        ["owner", "init"] => {
            let key = db.make_owner().unwrap_or_else(|e| fail(&e));
            println!("the owner: {}", key.public());
            println!("\nIts secret, shown this once. Keep it in your password manager now; on this device it is kept locked, opened by Touch ID.\n");
            println!("    {}\n", thedb::theid::secret_text(&key));
        }
        ["owner", "protect"] => {
            db.protect_owner().unwrap_or_else(|e| fail(&e));
            println!("the owner's key is locked on this device (Touch ID), the unlocked copy removed; every merge is the owner's");
        }
        ["owner", "restore"] => {
            let mut text = String::new();
            std::io::stdin().read_line(&mut text).unwrap_or_else(|e| fail(&e.to_string()));
            let key: thedb::access::SecretKey = text.trim().parse().unwrap_or_else(|_| fail("not a secret key (64 hex digits)"));
            db.restore_owner(key).unwrap_or_else(|e| fail(&e));
            println!("the owner's key is locked on this device (Touch ID); every merge is the owner's");
        }
        ["owner", "pin"] => {
            let (engine, build) = db.pinned_now().unwrap_or_else(|e| fail(&e));
            db.owner_pin(&engine, &build).unwrap_or_else(|e| fail(&e));
            println!("the build {build} let run: the kernel starts it");
        }
        ["agent", name, rest @ ..] if rest.len() <= 1 => {
            let days = rest.first().map(|d| d.parse().unwrap_or_else(|_| fail("days: a number"))).unwrap_or(30);
            let key = db.make_agent(name, days).unwrap_or_else(|e| fail(&e));
            println!("{key}\nworks with: THEOS_AGENT={name} THEDB_BRANCH={}", thedb::access::line(name));
        }
        ["verify"] => {
            let v = db.verify().unwrap_or_else(|e| fail(&e));
            for p in &v.problems {
                println!("{p}");
            }
            println!("{} heads signed as their branch allows, {} problems", v.good, v.problems.len());
            if !v.problems.is_empty() {
                std::process::exit(1);
            }
        }
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
