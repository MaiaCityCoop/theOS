//! Intents (intent 0059): every piece of work, by a person or an agent, as one doc of kind `intent`: its title, why,
//! when it is done, a task board, the line its work happens on, the versions it brings, and what became of it:
//! draft → building → checked → proposal → merged | refused.
//!
//! An agent opens an intent on its line, works there, ticks its tasks and marks it ready: the versions its line changed
//! are taken as they are now, and the intent waits for a person (proposal). A person accepts it in theOS (the host's
//! key and, in a store with a person, Touch ID) or refuses it; either way the closed intent is kept on main as history.
//! An intent is one doc wherever it is: on its line while it is worked on, on main once closed or when a person opens
//! it there; every line's are listed together, like issues, not bound to where they live.
//!
//! An intent whose checks fail goes back to building with the reason. Docs of the earlier kind `proposal` read as
//! intents (open: proposal).
//!
//! An intent is held in Loro's own containers, not as one string: the map `intent` (title, why, done_when, state, line,
//! reason), the list `tasks` (a map each: text, done), the map `docs` (doc id → version) and the map `accepted_by`. Two
//! agents who tick two tasks, or add one each, at once are both kept.

use crate::{Hash, Result, TheDB, err, sql};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Where an intent is.
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum State {
    /// Being written: its why, when it is done, its tasks.
    Draft,
    /// Worked on, on its line.
    Building,
    /// Its checks passed (the kernel's runner, intent 0059's step 3).
    Checked,
    /// Waiting for a person.
    Proposal,
    Merged,
    Refused,
}

impl State {
    pub fn is_open(self) -> bool {
        !matches!(self, State::Merged | State::Refused)
    }

    pub fn name(self) -> &'static str {
        match self {
            State::Draft => "draft",
            State::Building => "building",
            State::Checked => "checked",
            State::Proposal => "proposal",
            State::Merged => "merged",
            State::Refused => "refused",
        }
    }
}

/// One task on an intent's board.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Task {
    pub text: String,
    #[serde(default)]
    pub done: bool,
}

/// An intent.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Intent {
    pub title: String,
    #[serde(default)]
    pub why: String,
    /// When it is done, in words.
    #[serde(default)]
    pub done_when: String,
    #[serde(default)]
    pub tasks: Vec<Task>,
    /// The line its work happens on; none until an agent takes it up.
    #[serde(default)]
    pub line: Option<String>,
    /// Doc id → the version on the line when it became a proposal.
    #[serde(default)]
    pub docs: BTreeMap<String, String>,
    pub state: State,
    /// Why it went back to building (a failed check, a refusal's word).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The owner's signature of the accept (`access`), its key unlocked by the person: set when it is merged in a store
    /// whose merges are the owner's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accepted_by: Option<crate::access::Signed>,
}

/// A doc of the earlier kind `proposal`, read as an intent.
#[derive(serde::Deserialize)]
struct Legacy {
    branch: String,
    note: String,
    docs: BTreeMap<String, String>,
    state: String,
}

/// What the owner signs to accept an intent.
pub(crate) const ACCEPT: &str = "theDB accept";

/// What the owner's signature of accepting intent `id` covers: its id, its line, and each doc with the version it
/// brings.
pub(crate) fn accept_fields(id: &str, i: &Intent) -> Vec<Vec<u8>> {
    let mut f = vec![id.as_bytes().to_vec(), i.line.clone().unwrap_or_default().into_bytes()];
    for (doc, version) in &i.docs {
        f.push(doc.as_bytes().to_vec());
        f.push(version.as_bytes().to_vec());
    }
    f
}

impl TheDB {
    /// A new intent, in draft, on `line` (made by an agent there; `None`: on main, opened by a person). Returns its id.
    pub fn intent_new(&self, line: Option<&str>, title: &str, why: &str, done_when: &str) -> Result<String> {
        if title.trim().is_empty() {
            return Err("an intent needs a title".into());
        }
        let i = Intent {
            title: title.into(),
            why: why.into(),
            done_when: done_when.into(),
            tasks: vec![],
            line: line.map(str::to_string),
            docs: BTreeMap::new(),
            state: State::Draft,
            reason: None,
            accepted_by: None,
        };
        let id = crate::new_id();
        let doc = self.edit(&id)?;
        let meta = doc.get_map("meta");
        meta.insert("kind", "intent").map_err(err)?;
        meta.insert("name", title).map_err(err)?;
        write(&doc, &i)?;
        self.keep_intent(&id, &doc, &i)?;
        Ok(id)
    }

    /// Every intent on every line and on main, each once, with its id, newest first.
    pub fn intents(&self) -> Result<Vec<(String, Intent)>> {
        let mut out = Vec::new();
        let mut seen = std::collections::BTreeSet::new();
        // read first and the store's lock let go: each intent is read with the lock again
        let heads = sql::intent_heads(&self.sql())?;
        for (id, _) in heads {
            if seen.insert(id.clone())
                && let Ok(i) = self.intent(&id)
            {
                out.push((id, i));
            }
        }
        Ok(out)
    }

    /// Intent `id`, where it is now.
    pub fn intent(&self, id: &str) -> Result<Intent> {
        let at = self.intent_branch(id)?;
        let on = (at != crate::MAIN).then_some(at.as_str());
        read(&self.doc_seen(on, id)?).ok_or_else(|| format!("{id} is no intent"))
    }

    /// Where intent `id` is read: main once it is closed there; else its newest version, on a line or on main.
    fn intent_branch(&self, id: &str) -> Result<String> {
        let at: Vec<String> = sql::intent_heads(&self.sql())?.into_iter().filter(|(i, _)| i == id).map(|(_, b)| b).collect();
        if at.iter().any(|b| b == crate::MAIN) && self.doc_seen(None, id).ok().and_then(|d| read(&d)).is_some_and(|i| !i.state.is_open()) {
            return Ok(crate::MAIN.into());
        }
        at.into_iter().next().ok_or_else(|| format!("no intent {id}"))
    }

    /// Changes intent `id` with `change`, given its doc as it is now and the intent read from it: only the ops
    /// `change` makes are added, so what another writer did meanwhile stays. Kept where it belongs: on its line while
    /// open, on main when it has none; a closed one on its line (if it is still there) and on main, as main's history.
    fn change_intent(&self, id: &str, change: impl FnOnce(&loro::LoroDoc, &Intent) -> Result<()>) -> Result<()> {
        let at = self.intent_branch(id)?;
        let doc = self.doc_seen((at != crate::MAIN).then_some(at.as_str()), id)?;
        let before = read(&doc).ok_or_else(|| format!("{id} is no intent"))?;
        change(&doc, &before)?;
        let after = read(&doc).ok_or_else(|| format!("{id} is no intent"))?;
        let meta = doc.get_map("meta");
        meta.insert("kind", "intent").map_err(err)?;
        if text_of(&meta, "name").as_deref() != Some(after.title.as_str()) {
            meta.insert("name", after.title.as_str()).map_err(err)?;
        }
        self.keep_intent(id, &doc, &after)
    }

    fn keep_intent(&self, id: &str, doc: &loro::LoroDoc, i: &Intent) -> Result<()> {
        let line = i.line.as_deref().filter(|l| self.branches().is_ok_and(|b| b.iter().any(|x| x == l)));
        if i.state.is_open() {
            return self.commit_on(line, id, doc).map(|_| ());
        }
        if let Some(l) = line {
            self.commit_on(Some(l), id, doc)?;
        }
        self.commit_on(None, id, doc).map(|_| ())
    }

    /// An agent takes up intent `id` on its `line`.
    pub fn intent_take(&self, id: &str, line: &str) -> Result<()> {
        self.change_intent(id, |doc, i| {
            if !i.state.is_open() {
                return Err(format!("the intent is {} already", i.state.name()));
            }
            if i.line.as_deref().is_some_and(|l| l != line) {
                return Err(format!("the intent is worked on {} already", i.line.clone().unwrap_or_default()));
            }
            let m = doc.get_map("intent");
            set_text(&m, "line", Some(line))?;
            if i.state == State::Draft {
                set_text(&m, "state", Some(State::Building.name()))?;
            }
            Ok(())
        })
    }

    /// Adds a task to intent `id`'s board. Returns its number (from 1).
    pub fn intent_task(&self, id: &str, text: &str) -> Result<usize> {
        let mut n = 0;
        self.change_intent(id, |doc, i| {
            open(i)?;
            let task = doc.get_list("tasks").push_container(loro::LoroMap::new()).map_err(err)?;
            task.insert("text", text).map_err(err)?;
            task.insert("done", false).map_err(err)?;
            n = doc.get_list("tasks").len();
            Ok(())
        })?;
        Ok(n)
    }

    /// Ticks (or unticks) task `n` (from 1) of intent `id`: that task's `done`, and nothing else.
    pub fn intent_tick(&self, id: &str, n: usize, done: bool) -> Result<()> {
        self.change_intent(id, |doc, i| {
            open(i)?;
            let task = map_at(&doc.get_list("tasks"), n.wrapping_sub(1)).ok_or_else(|| format!("no task {n}"))?;
            task.insert("done", done).map_err(err)
        })
    }

    /// Moves intent `id` to draft or building, the states its agent sets; `reason` says why when it goes back.
    pub fn intent_state(&self, id: &str, state: State, reason: Option<&str>) -> Result<()> {
        if !matches!(state, State::Draft | State::Building) {
            return Err(format!("an intent becomes {} by its checks, `ready` or a person, not by hand", state.name()));
        }
        self.change_intent(id, |doc, i| {
            open(i)?;
            let m = doc.get_map("intent");
            set_text(&m, "state", Some(state.name()))?;
            set_text(&m, "reason", reason)
        })
    }

    /// Intent `id` is ready: the versions its line changed are taken as they are now, and it waits for its owner.
    pub fn intent_ready(&self, id: &str) -> Result<()> {
        let i = self.intent(id)?;
        open(&i)?;
        if i.state == State::Proposal {
            return Err("the intent waits for its owner already".into());
        }
        let line = i.line.clone().ok_or("the intent has no line: an agent takes it up first")?;
        let mut docs = BTreeMap::new();
        for (doc, h) in self.changed_on(&line)? {
            if !matches!(self.meta_of(&self.doc_at(h)?).0.as_str(), "intent" | "proposal") {
                docs.insert(doc, h.to_hex().to_string());
            }
        }
        if docs.is_empty() {
            return Err(format!("the line {line} changes nothing"));
        }
        self.change_intent(id, |doc, _| {
            let d = doc.get_map("docs");
            for k in d.keys().map(|k| k.to_string()).collect::<Vec<_>>() {
                if !docs.contains_key(&k) {
                    d.delete(&k).map_err(err)?;
                }
            }
            for (k, v) in &docs {
                set_text(&d, k, Some(v))?;
            }
            let m = doc.get_map("intent");
            set_text(&m, "state", Some(State::Proposal.name()))?;
            set_text(&m, "reason", None)
        })
    }

    /// An intent for what `line` changes, ready at once: how the host proposes its builds. Returns its id.
    pub fn propose(&self, line: &str, title: &str) -> Result<String> {
        let id = self.intent_new(Some(line), title, "", "")?;
        self.intent_ready(&id)?;
        Ok(id)
    }


    /// Accepts intent `id`: its versions, merged with what main holds now, become main's. Its owner accepts it in
    /// theOS: the merge is made by the host (or the owner), never by an agent, and, once the owner signs merges
    /// (`access`), signed by the owner, its key unlocked by the person (Touch ID or the login password); the signature
    /// is kept in the intent, and whoever holds only the host's key cannot accept. One merge at a time.
    pub fn accept(&self, id: &str) -> Result<()> {
        let mut i = self.intent(id)?;
        if i.state != State::Proposal {
            return Err(format!("the intent is {}, not a proposal", i.state.name()));
        }
        self.is_owner_or_host()?;
        let _lock = Lock::take(&self.dir().join("merge.lock"))?;
        let versions: Vec<(String, Hash)> = i.docs.iter().map(|(d, v)| Ok((d.clone(), v.parse().map_err(err)?))).collect::<Result<_>>()?;
        // what Loro would settle silently is refused out loud: the agent syncs its line, settles it, proposes again
        let conflicts = self.conflicts(&versions)?;
        if !conflicts.is_empty() {
            return Err(format!("the intent conflicts with main ({}): {}", conflicts.len(), conflicts.iter().map(|c| c.to_string()).collect::<Vec<_>>().join("; ")));
        }
        if self.owner_signs()? {
            let fields = accept_fields(id, &i);
            let s = self.sign_as_owner(ACCEPT, &fields, &format!("accept “{}” into main", i.title))?;
            if !self.signed_by_owner(&s, ACCEPT, &fields)? {
                return Err("the owner's signature does not hold".into());
            }
            i.accepted_by = Some(s);
        }
        // git as an archive: main's code as it is, kept before a merge that brings code
        if i.docs.keys().any(|d| matches!(self.meta(d).map(|m| m.0).as_deref(), Ok("code" | "root")))
            && let Some(repo) = self.archive_repo()
            && let Err(e) = self.archive_code(&repo, &format!("theDB main before “{}”", i.title))
        {
            eprintln!("thedb: the archive in git: {e}");
        }
        self.merge_into_main(&versions)?;
        let signed = i.accepted_by.take();
        self.change_intent(id, |doc, _| {
            if let Some(s) = &signed {
                let by = doc.get_map("accepted_by");
                by.insert("key", s.key.as_str()).map_err(err)?;
                by.insert("sig", s.sig.as_str()).map_err(err)?;
                by.insert("at", s.at as i64).map_err(err)?;
            }
            set_text(&doc.get_map("intent"), "state", Some(State::Merged.name()))
        })
    }

    /// Refuses intent `id`: main stays as it is; the line keeps its work.
    pub fn refuse(&self, id: &str) -> Result<()> {
        self.is_owner_or_host()?;
        self.change_intent(id, |doc, i| {
            open(i)?;
            set_text(&doc.get_map("intent"), "state", Some(State::Refused.name()))
        })
    }
}

/// Refused for a closed intent: merged or refused, it is history.
fn open(i: &Intent) -> Result<()> {
    if !i.state.is_open() {
        return Err(format!("the intent is {} already", i.state.name()));
    }
    Ok(())
}

fn text_of(map: &loro::LoroMap, key: &str) -> Option<String> {
    map.get(key)?.into_value().ok()?.into_string().ok().map(|s| s.to_string())
}

fn set_text(map: &loro::LoroMap, key: &str, value: Option<&str>) -> Result<()> {
    if text_of(map, key).as_deref() == value {
        return Ok(());
    }
    match value {
        Some(v) => map.insert(key, v).map_err(err),
        None => map.delete(key).map_err(err),
    }
}

fn state_of(name: &str) -> Option<State> {
    Some(match name {
        "draft" => State::Draft,
        "building" => State::Building,
        "checked" => State::Checked,
        "proposal" => State::Proposal,
        "merged" => State::Merged,
        "refused" => State::Refused,
        _ => return None,
    })
}

/// The map in list `list` at `n`.
fn map_at(list: &loro::LoroList, n: usize) -> Option<loro::LoroMap> {
    match list.get(n)? {
        loro::ValueOrContainer::Container(loro::Container::Map(m)) => Some(m),
        _ => None,
    }
}

fn read(doc: &loro::LoroDoc) -> Option<Intent> {
    let m = doc.get_map("intent");
    if let Some(title) = text_of(&m, "title") {
        let tasks = doc.get_list("tasks");
        let docs = doc.get_map("docs");
        let by = doc.get_map("accepted_by");
        return Some(Intent {
            title,
            why: text_of(&m, "why").unwrap_or_default(),
            done_when: text_of(&m, "done_when").unwrap_or_default(),
            tasks: (0..tasks.len())
                .filter_map(|n| map_at(&tasks, n))
                .map(|t| Task { text: text_of(&t, "text").unwrap_or_default(), done: t.get("done").and_then(|v| v.into_value().ok()).and_then(|v| v.into_bool().ok()).unwrap_or(false) })
                .collect(),
            line: text_of(&m, "line"),
            docs: docs.keys().filter_map(|k| Some((k.to_string(), text_of(&docs, &k)?))).collect(),
            state: state_of(&text_of(&m, "state")?)?,
            reason: text_of(&m, "reason"),
            accepted_by: match (text_of(&by, "key"), text_of(&by, "sig"), by.get("at").and_then(|v| v.into_value().ok()).and_then(|v| v.into_i64().ok())) {
                (Some(key), Some(sig), Some(at)) => Some(crate::access::Signed { key, sig, at: at as u64 }),
                _ => None,
            },
        });
    }
    let p = doc.get_map("proposal").get("it")?.into_value().ok()?.into_string().ok()?;
    let l: Legacy = serde_json::from_str(&p).ok()?;
    Some(Intent {
        title: l.note,
        why: String::new(),
        done_when: String::new(),
        tasks: vec![],
        line: Some(l.branch),
        docs: l.docs,
        state: match l.state.as_str() {
            "Merged" => State::Merged,
            "Refused" => State::Refused,
            _ => State::Proposal,
        },
        reason: None,
        accepted_by: None,
    })
}

/// Makes `doc` hold intent `i`, changing only what differs: each field, each task, each doc it brings.
fn write(doc: &loro::LoroDoc, i: &Intent) -> Result<()> {
    let m = doc.get_map("intent");
    set_text(&m, "title", Some(&i.title))?;
    set_text(&m, "why", Some(&i.why))?;
    set_text(&m, "done_when", Some(&i.done_when))?;
    set_text(&m, "state", Some(i.state.name()))?;
    set_text(&m, "line", i.line.as_deref())?;
    set_text(&m, "reason", i.reason.as_deref())?;
    let tasks = doc.get_list("tasks");
    for (n, t) in i.tasks.iter().enumerate() {
        let task = match map_at(&tasks, n) {
            Some(task) => task,
            None => tasks.push_container(loro::LoroMap::new()).map_err(err)?,
        };
        set_text(&task, "text", Some(&t.text))?;
        if task.get("done").and_then(|v| v.into_value().ok()).and_then(|v| v.into_bool().ok()) != Some(t.done) {
            task.insert("done", t.done).map_err(err)?;
        }
    }
    let docs = doc.get_map("docs");
    for k in docs.keys().map(|k| k.to_string()).collect::<Vec<_>>() {
        if !i.docs.contains_key(&k) {
            docs.delete(&k).map_err(err)?;
        }
    }
    for (d, v) in &i.docs {
        set_text(&docs, d, Some(v))?;
    }
    if let Some(s) = &i.accepted_by {
        let by = doc.get_map("accepted_by");
        set_text(&by, "key", Some(&s.key))?;
        set_text(&by, "sig", Some(&s.sig))?;
        by.insert("at", s.at as i64).map_err(err)?;
    }
    Ok(())
}

/// A lock held while it lives: a file made only if it does not exist. A holder whose process is gone is no holder.
struct Lock(PathBuf);

impl Lock {
    fn take(path: &Path) -> Result<Lock> {
        for _ in 0..2 {
            match std::fs::OpenOptions::new().write(true).create_new(true).open(path) {
                Ok(mut f) => {
                    use std::io::Write;
                    let _ = write!(f, "{}", std::process::id());
                    return Ok(Lock(path.into()));
                }
                Err(_) => {
                    let pid = std::fs::read_to_string(path).unwrap_or_default();
                    let alive = std::process::Command::new("kill").args(["-0", pid.trim()]).status().is_ok_and(|s| s.success());
                    if alive {
                        return Err(format!("another merge runs (process {}); one at a time", pid.trim()));
                    }
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        Err("the merge lock could not be taken".into())
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

impl TheDB {
    /// Brings every intent of the store in `dir` (one composted or archived) onto this store's main, as it stood there:
    /// the history of what was proposed, accepted and refused. Intents this store has are left as they are. Returns
    /// how many came.
    pub fn intents_from(&self, dir: &Path) -> Result<usize> {
        let old = TheDB::open_on(dir, None)?;
        let have: std::collections::BTreeSet<String> = self.intents()?.into_iter().map(|(id, _)| id).collect();
        let mut n = 0;
        for (id, _) in old.intents()? {
            if have.contains(&id) {
                continue;
            }
            let at = old.intent_branch(&id)?;
            let doc = old.doc_seen((at != crate::MAIN).then_some(at.as_str()), &id)?;
            self.commit_on(None, &id, &doc)?;
            n += 1;
        }
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An intent is held in Loro's own maps and lists: two writers who tick two tasks, and add one each, at the same
    /// time are all kept when their versions meet.
    #[test]
    fn two_writers_tick_two_tasks_and_every_change_stays() {
        let doc = loro::LoroDoc::new();
        let task = |t: &str| Task { text: t.into(), done: false };
        let i = Intent { title: "t".into(), why: String::new(), done_when: String::new(), tasks: vec![task("a"), task("b")], line: None, docs: BTreeMap::new(), state: State::Building, reason: None, accepted_by: None };
        write(&doc, &i).unwrap();
        doc.commit();
        let (a, b) = (doc.fork(), doc.fork());
        map_at(&a.get_list("tasks"), 0).unwrap().insert("done", true).unwrap();
        a.get_list("tasks").push_container(loro::LoroMap::new()).unwrap().insert("text", "from a").unwrap();
        a.commit();
        map_at(&b.get_list("tasks"), 1).unwrap().insert("done", true).unwrap();
        b.get_list("tasks").push_container(loro::LoroMap::new()).unwrap().insert("text", "from b").unwrap();
        b.commit();
        a.import(&b.export(loro::ExportMode::all_updates()).unwrap()).unwrap();
        let merged = read(&a).unwrap();
        assert_eq!(merged.tasks.iter().filter(|t| t.done).count(), 2, "both ticks");
        assert_eq!(merged.tasks.len(), 4, "both new tasks");
    }
}
