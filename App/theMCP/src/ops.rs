//! Every operation an agent can call, once: its name, what it takes and gives, what it does, the cap it needs, and
//! the call itself. The catalogue `search` reads, the signatures in `execute`'s description and the `theos::` functions
//! all come from this list.

use crate::Session;
use serde_json::{Value, json};
use thedb::Find;
use thedb::intents::State;

/// One operation.
pub struct Op {
    pub name: &'static str,
    /// What it groups with: `intents`, `docs`, `line`, `me`.
    pub group: &'static str,
    /// Each parameter: its name and type (`string`, `int`, `bool`).
    pub params: &'static [(&'static str, &'static str)],
    pub returns: &'static str,
    pub doc: &'static str,
    /// The cap it needs (theID's `Cap`): `Read`, `Intents`, `Line`.
    pub cap: &'static str,
    pub run: fn(&Session, &[Value]) -> Result<Value, String>,
}

impl Op {
    /// How it is called: `theos::intent_task(id: string, text: string) -> int`.
    pub fn signature(&self) -> String {
        let params: Vec<String> = self.params.iter().map(|(n, t)| format!("{n}: {t}")).collect();
        format!("theos::{}({}) -> {}", self.name, params.join(", "), self.returns)
    }
}

fn t(a: &[Value], i: usize) -> Result<&str, String> {
    a.get(i).and_then(Value::as_str).ok_or_else(|| format!("argument {} is not a string", i + 1))
}

fn n(a: &[Value], i: usize) -> Result<i64, String> {
    a.get(i).and_then(Value::as_i64).ok_or_else(|| format!("argument {} is not a whole number", i + 1))
}

fn b(a: &[Value], i: usize) -> Result<bool, String> {
    a.get(i).and_then(Value::as_bool).ok_or_else(|| format!("argument {} is not true or false", i + 1))
}

fn found(list: Vec<thedb::Found>) -> Value {
    Value::Array(list.into_iter().map(|f| json!({ "id": f.id, "kind": f.kind, "name": f.name })).collect())
}

fn summary(id: &str, i: &thedb::intents::Intent) -> Value {
    json!({
        "id": id,
        "title": i.title,
        "state": i.state.name(),
        "line": i.line.as_deref().unwrap_or("main"),
        "why": i.why,
        "done_when": i.done_when,
        "tasks_done": i.tasks.iter().filter(|t| t.done).count(),
        "tasks": i.tasks.len(),
        "reason": i.reason,
    })
}

fn nothing() -> Value {
    Value::Null
}

pub static OPS: &[Op] = &[
    Op {
        name: "whoami",
        group: "me",
        params: &[],
        returns: "map",
        doc: "This agent: its name, key, line and owner.",
        cap: "Read",
        run: |s, _| {
            Ok(json!({
                "agent": s.agent,
                "line": s.line,
                "key": s.db.signer().map(|k| k.to_string()),
                "owner": s.db.owner()?.map(|o| o.to_string()),
            }))
        },
    },
    Op {
        name: "intents",
        group: "intents",
        params: &[("which", "string")],
        returns: "array",
        doc: "Every intent on every line and on main, newest first, as summaries. `which`: \"open\", \"done\", \"all\", or a state (\"draft\", \"building\", \"checked\", \"proposal\", \"merged\", \"refused\").",
        cap: "Read",
        run: |s, a| {
            let which = t(a, 0)?;
            let list = s.db.intents()?;
            Ok(Value::Array(
                list.iter()
                    .filter(|(_, i)| match which {
                        "open" => i.state.is_open(),
                        "done" => !i.state.is_open(),
                        "all" => true,
                        w => i.state.name() == w,
                    })
                    .map(|(id, i)| summary(id, i))
                    .collect(),
            ))
        },
    },
    Op {
        name: "intent",
        group: "intents",
        params: &[("id", "string")],
        returns: "map",
        doc: "One intent, whole: its why, when it is done, its tasks, the docs it brings, and (open) its conflicts with main.",
        cap: "Read",
        run: |s, a| {
            let id = t(a, 0)?;
            let i = s.db.intent(id)?;
            let conflicts: Vec<String> = if i.state.is_open() { s.db.intent_conflicts(id)?.iter().map(|c| c.to_string()).collect() } else { vec![] };
            Ok(json!({ "id": id, "intent": i, "conflicts": conflicts }))
        },
    },
    Op {
        name: "intent_new",
        group: "intents",
        params: &[("title", "string"), ("why", "string"), ("done_when", "string")],
        returns: "string",
        doc: "Opens an intent in draft, on this agent's line. Returns its id.",
        cap: "Intents",
        run: |s, a| Ok(Value::String(s.db.intent_new(Some(&s.line), t(a, 0)?, t(a, 1)?, t(a, 2)?)?)),
    },
    Op {
        name: "intent_take",
        group: "intents",
        params: &[("id", "string")],
        returns: "()",
        doc: "This agent's line takes up an intent (opened on main, by its owner): it becomes building.",
        cap: "Intents",
        run: |s, a| s.db.intent_take(t(a, 0)?, &s.line).map(|_| nothing()),
    },
    Op {
        name: "intent_task",
        group: "intents",
        params: &[("id", "string"), ("text", "string")],
        returns: "int",
        doc: "Adds a task to an intent's board. Returns its number, from 1.",
        cap: "Intents",
        run: |s, a| Ok(json!(s.db.intent_task(t(a, 0)?, t(a, 1)?)?)),
    },
    Op {
        name: "intent_tick",
        group: "intents",
        params: &[("id", "string"), ("task", "int"), ("done", "bool")],
        returns: "()",
        doc: "Ticks (or unticks) task number `task` of an intent.",
        cap: "Intents",
        run: |s, a| s.db.intent_tick(t(a, 0)?, n(a, 1)? as usize, b(a, 2)?).map(|_| nothing()),
    },
    Op {
        name: "intent_building",
        group: "intents",
        params: &[("id", "string"), ("reason", "string")],
        returns: "()",
        doc: "Moves an intent to building (back from a failed check, say why in `reason`; \"\" for none).",
        cap: "Intents",
        run: |s, a| {
            let r = t(a, 1)?;
            s.db.intent_state(t(a, 0)?, State::Building, (!r.is_empty()).then_some(r)).map(|_| nothing())
        },
    },
    Op {
        name: "intent_ready",
        group: "intents",
        params: &[("id", "string")],
        returns: "()",
        doc: "This agent's work on an intent is done: the docs its line changed are taken as they are, and it waits for its owner (proposal). Only the owner accepts, in theOS.",
        cap: "Intents",
        run: |s, a| s.db.intent_ready(t(a, 0)?).map(|_| nothing()),
    },
    Op {
        name: "find_kind",
        group: "docs",
        params: &[("kind", "string")],
        returns: "array",
        doc: "The docs of a kind (\"world\", \"shots\", \"view\", \"layer\", \"shader\", \"module\", \"intent\", ...), as this line sees them: id, kind, name.",
        cap: "Read",
        run: |s, a| Ok(found(s.db.find(Find::Kind(t(a, 0)?))?)),
    },
    Op {
        name: "find_name",
        group: "docs",
        params: &[("part", "string")],
        returns: "array",
        doc: "The docs whose name holds `part`, in any case.",
        cap: "Read",
        run: |s, a| Ok(found(s.db.find(Find::Name(t(a, 0)?))?)),
    },
    Op {
        name: "find_words",
        group: "docs",
        params: &[("words", "string")],
        returns: "array",
        doc: "The docs with every one of `words` in their name or text.",
        cap: "Read",
        run: |s, a| Ok(found(s.db.find(Find::Words(t(a, 0)?))?)),
    },
    Op {
        name: "doc",
        group: "docs",
        params: &[("id", "string")],
        returns: "map",
        doc: "What a doc is: its kind, name, and how many lines its text has.",
        cap: "Read",
        run: |s, a| {
            let id = t(a, 0)?;
            let (kind, name) = s.db.meta(id)?;
            let lines = s.db.text(id)?.map(|t| t.lines().count()).unwrap_or(0);
            Ok(json!({ "id": id, "kind": kind, "name": name, "lines": lines }))
        },
    },
    Op {
        name: "doc_lines",
        group: "docs",
        params: &[("id", "string"), ("from", "int"), ("count", "int")],
        returns: "string",
        doc: "Lines `from` (from 1) to `from + count - 1` of a doc's text, each after its number and a tab, as this line sees it. Read a long doc in parts.",
        cap: "Read",
        run: |s, a| {
            let text = s.db.text(t(a, 0)?)?.unwrap_or_default();
            let (from, count) = (n(a, 1)?.max(1) as usize, n(a, 2)?.max(0) as usize);
            Ok(Value::String(text.lines().enumerate().skip(from - 1).take(count).map(|(i, l)| format!("{}\t{l}", i + 1)).collect::<Vec<_>>().join("\n")))
        },
    },
    Op {
        name: "doc_write",
        group: "docs",
        params: &[("id", "string"), ("text", "string")],
        returns: "string",
        doc: "Writes a doc's whole text on this agent's line (main sees it once its intent is accepted). Returns the new version's hash.",
        cap: "Line",
        run: |s, a| Ok(Value::String(s.db.set_text(t(a, 0)?, t(a, 1)?)?.to_string())),
    },
    Op {
        name: "doc_edit",
        group: "docs",
        params: &[("id", "string"), ("old", "string"), ("new", "string")],
        returns: "string",
        doc: "Replaces the one place `old` stands in a doc's text with `new`, on this agent's line; refused when `old` is not there exactly once. Returns the new version's hash.",
        cap: "Line",
        run: |s, a| {
            let (id, old, new) = (t(a, 0)?, t(a, 1)?, t(a, 2)?);
            let text = s.db.text(id)?.ok_or_else(|| format!("no doc {id}"))?;
            match text.matches(old).count() {
                1 => Ok(Value::String(s.db.set_text(id, &text.replacen(old, new, 1))?.to_string())),
                0 => Err("`old` is not in the text".into()),
                k => Err(format!("`old` is in the text {k} times: give more of it")),
            }
        },
    },
    Op {
        name: "doc_new",
        group: "docs",
        params: &[("kind", "string"), ("name", "string")],
        returns: "string",
        doc: "Makes a doc on this agent's line. Returns its id.",
        cap: "Line",
        run: |s, a| Ok(Value::String(s.db.new(t(a, 0)?, t(a, 1)?)?)),
    },
    Op {
        name: "files",
        group: "code",
        params: &[("prefix", "string")],
        returns: "array",
        doc: "The paths of the host's code (the tree) that start with `prefix` (\"\" for all), as this line sees them: \"App/src/main.rs\", ...",
        cap: "Read",
        run: |s, a| {
            let prefix = t(a, 0)?;
            Ok(json!(s.db.files()?.into_iter().filter(|p| p.starts_with(prefix)).collect::<Vec<_>>()))
        },
    },
    Op {
        name: "file_lines",
        group: "code",
        params: &[("path", "string"), ("from", "int"), ("count", "int")],
        returns: "string",
        doc: "Lines `from` (from 1) to `from + count - 1` of a code file, each after its number and a tab. Read a long file in parts.",
        cap: "Read",
        run: |s, a| {
            let text = s.db.file_text(t(a, 0)?)?;
            let (from, count) = (n(a, 1)?.max(1) as usize, n(a, 2)?.max(0) as usize);
            Ok(Value::String(text.lines().enumerate().skip(from - 1).take(count).map(|(i, l)| format!("{}\t{l}", i + 1)).collect::<Vec<_>>().join("\n")))
        },
    },
    Op {
        name: "file_search",
        group: "code",
        params: &[("text", "string")],
        returns: "array",
        doc: "Every line of the code that holds `text` (at most 200): \"path:line: the line\".",
        cap: "Read",
        run: |s, a| Ok(json!(s.db.file_search(t(a, 0)?, 200)?.into_iter().map(|(p, n, l)| format!("{p}:{n}: {l}")).collect::<Vec<_>>())),
    },
    Op {
        name: "file_write",
        group: "code",
        params: &[("path", "string"), ("text", "string")],
        returns: "()",
        doc: "Writes a code file's whole text on this agent's line (a new path makes a new file, and its folders). Only what changed becomes ops.",
        cap: "Line",
        run: |s, a| s.db.file_write(t(a, 0)?, t(a, 1)?).map(|_| nothing()),
    },
    Op {
        name: "file_edit",
        group: "code",
        params: &[("path", "string"), ("old", "string"), ("new", "string")],
        returns: "()",
        doc: "Replaces the one place `old` stands in a code file with `new`, on this agent's line; refused when `old` is not there exactly once.",
        cap: "Line",
        run: |s, a| s.db.file_edit(t(a, 0)?, t(a, 1)?, t(a, 2)?).map(|_| nothing()),
    },
    Op {
        name: "file_move",
        group: "code",
        params: &[("from", "string"), ("to", "string")],
        returns: "()",
        doc: "Moves a code file or a whole folder to a new path on this agent's line: one op on its node, which keeps its identity and history (and merges with edits made meanwhile).",
        cap: "Line",
        run: |s, a| s.db.file_move(t(a, 0)?, t(a, 1)?).map(|_| nothing()),
    },
    Op {
        name: "file_delete",
        group: "code",
        params: &[("path", "string")],
        returns: "()",
        doc: "Takes a code file or folder out on this agent's line (its history stays).",
        cap: "Line",
        run: |s, a| s.db.file_delete(t(a, 0)?).map(|_| nothing()),
    },
    Op {
        name: "build",
        group: "build",
        params: &[],
        returns: "map",
        doc: "Starts building this agent's line's code, in the background (one build at a time for every line; refused while another runs). Then ask theos::build_status() until its state is not \"running\".",
        cap: "Run",
        run: |s, _| s.db.build_start(),
    },
    Op {
        name: "build_status",
        group: "build",
        params: &[],
        returns: "map",
        doc: "The last build: its line, state (\"running\", \"ok\", \"failed\", \"stopped\"), seconds, errors (each \"App/path:line:col: error...\") and how many warnings.",
        cap: "Run",
        run: |s, _| s.db.build_status(),
    },
    Op {
        name: "line_changes",
        group: "line",
        params: &[],
        returns: "array",
        doc: "The docs this agent's line has changed: id, kind, name, version.",
        cap: "Read",
        run: |s, _| {
            let mut out = Vec::new();
            for (id, h) in s.db.changed_on(&s.line)? {
                let (kind, name) = s.db.meta(&id).unwrap_or_default();
                out.push(json!({ "id": id, "kind": kind, "name": name, "version": h.to_string() }));
            }
            Ok(Value::Array(out))
        },
    },
    Op {
        name: "line_sync",
        group: "line",
        params: &[],
        returns: "array",
        doc: "Brings main into this agent's line. Returns, in words, what both had changed differently and Loro settled: check each.",
        cap: "Line",
        run: |s, _| Ok(Value::Array(s.db.sync_line(&s.line)?.iter().map(|c| Value::String(c.to_string())).collect())),
    },
];
